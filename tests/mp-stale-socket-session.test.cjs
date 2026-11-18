'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const transportPolicy = require('../AndroidProject/app/src/main/assets/phone-host/mp-transport-policy.js');

const assets = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
const clients = ['www', 'phone-host'].map(name => ({
  name,
  html: fs.readFileSync(path.join(assets, name, 'index.html'), 'utf8')
}));

for (const { name, html } of clients) {
  test(name + ': the LAN-host page selects its current host origin instead of a stale saved address', () => {
    const start = html.indexOf('function mpCurrentPageHost()');
    const end = html.indexOf('\nfunction mpConnected()', start);
    assert.ok(start >= 0 && end > start, 'current host selection helper is present');
    const context = vm.createContext({
      MP: { name: '', addr: '' },
      MPKEY: 'sightline.mp.v1',
      mpPrefs: () => ({ name: 'Tester', addr: '192.168.1.99:8080' }),
      location: { protocol: 'http:', host: '192.168.1.20:8080' },
      document: { querySelector: () => ({ content: 'lan-host' }) }
    });
    vm.runInContext(html.slice(start, end), context);
    assert.equal(context.mpCurrentPageHost(), '192.168.1.20:8080');
    assert.equal(context.MP.addr, '192.168.1.20:8080', 'the origin serving the LAN-host page takes priority');
  });

  test(name + ': an open socket that never completes the protocol handshake fails within five seconds', () => {
    const start = html.indexOf('function mpConnect() {');
    const end = html.indexOf('\nfunction mpRetry(', start);
    assert.ok(start >= 0 && end > start, 'connection setup function is present');
    const timers = [];
    class MockWebSocket {
      constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.closed = false; }
      send(value) { this.sent.push(value); }
      close() { this.closed = true; this.readyState = 3; }
    }
    const context = vm.createContext({
      MP: { sock: null, addr: '192.168.1.20:8080', name: 'Tester', retryN: 0, userLeft: false,
        id: 0, names: {}, session: '', actionSeq: 0, err: '', status: '', net: { lastRx: 0 } },
      LAN_DIAG: null,
      MP_PROTOCOL: 2,
      MP_FEATURES: ['session-generation', 'life-epoch', 'action-seq'],
      ME: { name: 'Tester' },
      mpNativeLan: () => false,
      SightlineTransport: transportPolicy,
      WebSocket: MockWebSocket,
      location: { protocol: 'http:', host: '192.168.1.20:8080' },
      performance: { now: () => 50 },
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimeout() {},
      mpSavePrefs() {},
      mpRefreshPanel() {},
      mpMsg() {}
    });
    vm.runInContext(html.slice(start, end), context);
    vm.runInContext('mpConnect()', context);
    const socket = context.MP.sock;
    socket.readyState = 1;
    socket.onopen();
    assert.equal(JSON.parse(socket.sent[0]).t, 'hello', 'client sends the protocol handshake after socket open');
    assert.equal(timers[0].ms, 5000, 'the connection initialization deadline is five seconds');
    timers[0].fn();
    assert.equal(socket.closed, true, 'a socket without a welcome or rejection is closed');
    assert.match(context.MP.err, /Connection timed out/);
    assert.equal(context.MP.status, '', 'the UI exits the indefinite connecting state');
  });

  test(name + ': shot and reload messages carry the active life epoch', () => {
    assert.match(html, /function mpShot\(w, dirs, heavy\) \{ mpSend\(\{ t: 'shot', w: w, ep: MP\.ep,/,
      'fire requests identify the current server-issued life epoch');
    assert.match(html, /mpSend\(\{ t: 'rl', w: cur, ep: MP\.ep \}\)/,
      'reload requests identify the current server-issued life epoch');
  });

  test(name + ': callbacks from a replaced multiplayer socket cannot mutate the new session', () => {
    const start = html.indexOf('function mpConnect() {');
    const end = html.indexOf('\nfunction mpRetry(', start);
    assert.ok(start >= 0 && end > start, 'connection setup function is present');

    const sockets = [];
    const messages = [];
    let clock = 100;
    class MockWebSocket {
      constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
      send(value) { this.sent.push(value); }
      close() { this.readyState = 3; }
    }
    const context = vm.createContext({
      MP: { sock: null, addr: '127.0.0.1:8080', name: 'Tester', retryN: 0, userLeft: false,
        id: 0, names: {}, session: '', actionSeq: 0, net: { lastRx: 7 } },
      LAN_DIAG: null,
      MP_PROTOCOL: 2,
      MP_FEATURES: ['session-generation', 'life-epoch', 'action-seq'],
      ME: { name: 'Tester' },
      mpNativeLan: () => false,
      SightlineTransport: transportPolicy,
      WebSocket: MockWebSocket,
      location: { protocol: 'http:', host: '127.0.0.1:8080' },
      performance: { now: () => clock },
      setTimeout: () => 1,
      clearTimeout() {},
      mpSavePrefs() {},
      mpRefreshPanel() {},
      mpMsg(message) { messages.push(message); }
    });
    vm.runInContext(html.slice(start, end), context);
    vm.runInContext('mpConnect(); this.oldSocket=MP.sock; MP.sock=null; mpConnect(); this.currentSocket=MP.sock;', context);
    const { oldSocket, currentSocket } = context;
    assert.notEqual(oldSocket, currentSocket, 'test creates two distinct connection attempts');

    oldSocket.readyState = 1;
    oldSocket.onopen();
    oldSocket.onmessage({ data: JSON.stringify({ t: 'stale-session', n: 999 }) });
    assert.deepEqual(oldSocket.sent, [], 'a superseded socket must not send a delayed hello');
    assert.equal(context.MP.net.lastRx, 7, 'stale data must not refresh the active session receive clock');
    assert.deepEqual(messages, [], 'stale data must not reach the current session message handler');

    currentSocket.readyState = 1;
    currentSocket.onopen();
    assert.equal(JSON.parse(currentSocket.sent[0]).t, 'hello', 'the current socket still completes normal setup');
    clock = 140;
    currentSocket.onmessage({ data: JSON.stringify({ t: 'current-session' }) });
    assert.equal(context.MP.net.lastRx, 140, 'the active socket continues to update receive timing');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].t, 'current-session');
  });
}

test('offline and phone-host multiplayer connection handlers stay byte-identical', () => {
  function connectionHandler(html){const start=html.indexOf('function mpConnect() {'),end=html.indexOf('\nfunction mpRetry(',start+1);assert.ok(start>=0&&end>start,'connection handler is present');return html.slice(start,end).trim();}
  assert.equal(connectionHandler(clients[0].html),connectionHandler(clients[1].html),'shared socket lifecycle must remain in parity');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');

function upgrade(overrides = {}) {
  const handlers = new Map();
  const socket = {
    writes: [], destroyed: false,
    on(name, fn) { handlers.set(name, fn); return this; },
    setNoDelay() {}, setTimeout() {}, setKeepAlive() {},
    write(data) { this.writes.push(Buffer.from(data)); return true; },
    end(data) { if (data) this.writes.push(Buffer.from(data)); return this; },
    destroy() { this.destroyed = true; return this; }
  };
  const req = {
    method: 'GET', httpVersion: '1.1', url: '/ws',
    headers: {
      host: '127.0.0.1:8080',
      connection: 'keep-alive, Upgrade',
      upgrade: 'websocket',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
      ...(overrides.headers || {})
    },
    socket: { encrypted: false },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'headers'))
  };
  Host.server.emit('upgrade', req, socket);
  return {
    req,
    socket,
    close() { const onEnd = handlers.get('end'); if (onEnd) onEnd(); }
  };
}

test('valid RFC 6455 handshake returns the expected accept value', () => {
  const result = upgrade();
  try {
    const response = Buffer.concat(result.socket.writes).toString('ascii');
    assert.match(response, /^HTTP\/1\.1 101 Switching Protocols\r\n/);
    assert.match(response, /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/i);
  } finally {
    result.close();
  }
});

test('invalid RFC 6455 handshake metadata is rejected before switching protocols', () => {
  const cases = [
    ['missing version', { headers: { 'sec-websocket-version': undefined } }],
    ['unsupported version', { headers: { 'sec-websocket-version': '12' } }],
    ['malformed key', { headers: { 'sec-websocket-key': 'not-base64' } }],
    ['wrong key decoded length', { headers: { 'sec-websocket-key': Buffer.from('123456789012345').toString('base64') } }],
    ['non-GET method', { method: 'POST' }],
    ['HTTP/1.0', { httpVersion: '1.0' }],
    ['Connection omits Upgrade token', { headers: { connection: 'keep-alive' } }]
  ];

  for (const [label, overrides] of cases) {
    const result = upgrade(overrides);
    try {
      assert.equal(result.socket.writes.length, 0, `${label} must not receive a 101 response`);
      assert.equal(result.socket.destroyed, true, `${label} must be rejected`);
    } finally {
      result.close();
    }
  }
});

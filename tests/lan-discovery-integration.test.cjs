'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('Windows host advertises discovery only in development and client bridge is loopback-only', () => {
  const launcher = read('SIGHTLINE.bat');
  const host = read('AndroidProject/app/src/main/assets/phone-host/server.js');
  const bridge = read('tools/offline-static-server.cjs');
  const discovery = read('AndroidProject/app/src/main/assets/phone-host/lan-discovery.cjs');
  assert.match(launcher, /node server\.js .*--discover-lan/);
  assert.match(launcher, /SIGHTLINE\.bat lan-client/);
  assert.match(launcher, /Do not enable Public-network access/);
  assert.match(host, /if \(argv\.includes\('--discover-lan'\)\)/);
  assert.match(host, /if \(RELEASE_TLS\)[\s\S]*?else \{[\s\S]*?if \(argv\.includes\('--discover-lan'\)\)/);
  assert.match(host, /const stopDiscovery = \(\) => \{ if \(discoveryHost\) discoveryHost\.close\(\); process\.exit\(0\); \}/);
  assert.match(bridge, /server\.listen\(8090, '127\.0\.0\.1'/);
  assert.match(bridge, /__sightline\/lan\/hosts/);
  assert.match(discovery, /DISCOVERY_PORT = 49192/);
  assert.match(discovery, /parseProbe\(packet, remote && remote\.address\)/);
});

test('both served game pages show verified hosts only through the explicit local client bridge', () => {
  for (const file of ['AndroidProject/app/src/main/assets/www/index.html', 'AndroidProject/app/src/main/assets/phone-host/index.html']) {
    const page = read(file);
    assert.match(page, /function mpLanDiscoveryBridge\(\)/);
    assert.match(page, /location\.hostname === '127\.0\.0\.1'.*location\.port === '8090'/);
    assert.ok(page.includes("if(m.type==='host')accept(m.host)"), 'the client consumes the verified NDJSON host stream');
    assert.ok(page.includes("m.type==='done'&&!m.ok"), 'the client reports stream completion errors');
    assert.ok(page.includes('host.protocol!==2'));
    assert.ok(page.includes('host.verified!==true'), 'only literal boolean verification is accepted');
    assert.ok(page.includes('MP_LAN_DISCOVERY.hosts=MP_LAN_DISCOVERY.hosts.filter(function(h){return h.lastSeen>=cutoff;})'),
      'each scan removes hosts older than the discovery freshness window');
    assert.match(page, /data-net="join-discovered"/);
    assert.match(page, /Manual IP is still available below/);
    assert.match(page, /else if \(a === 'join-discovered'\)/);
  }
});

test('discovery accepts only literal boolean true from the verified host stream', async () => {
  for (const file of ['AndroidProject/app/src/main/assets/www/index.html', 'AndroidProject/app/src/main/assets/phone-host/index.html']) {
    const page = read(file);
    const start = page.indexOf('function mpLanPrivateIp(ip) {');
    const end = page.indexOf('function mpAction(b) {', start);
    assert.ok(start >= 0 && end > start, `${file}: actual discovery implementation exists`);
    const source = page.slice(start, end);
    const records = [true, false, 'true', 1, { ok: true }].map((verified, index) => ({
      type: 'host',
      host: { id: `host-${index}`, verified, address: `192.168.1.${20 + index}`, port: 8080, protocol: 2, transport: 'dev', players: 1, maxPlayers: 10 }
    }));
    const bytes = new TextEncoder().encode(records.map(record => JSON.stringify(record)).join('\n') + '\n');
    let readCount = 0;
    const context = {
      MP_LAN_DISCOVERY: { generation: 4, busy: false, error: '', hosts: [], abort: null, timer: null },
      mpLanDiscoveryBridge: () => true,
      mpCancelLanScan() {},
      $: selector => selector === '#mp-discovery-state' ? { textContent: '' } : { innerHTML: '', querySelectorAll: () => [] },
      esc: value => String(value),
      fetch: () => Promise.resolve({
        ok: true,
        body: { getReader: () => ({
          read: () => Promise.resolve(readCount++ === 0 ? { done: false, value: bytes } : { done: true }),
          cancel: () => Promise.resolve()
        }) }
      }),
      AbortController,
      TextDecoder,
      Uint8Array,
      TextEncoder,
      Date,
      setTimeout: () => 1,
      clearTimeout() {},
      document: { activeElement: null, getElementById: () => null },
      console
    };
    vm.runInNewContext(`${source}\nmpScanLanHosts(true);`, context, { timeout: 1000 });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(Array.from(context.MP_LAN_DISCOVERY.hosts, host => host.id), ['host-0'], `${file}: truthy non-booleans are rejected`);
  }
});

test('Android discovery validates the PC host and only auto-joins the exact approved query', () => {
  const activity = read('AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');
  const page = read('AndroidProject/app/src/main/assets/phone-host/index.html');
  assert.match(activity, /private void discoverLanHosts\(\)/);
  assert.match(activity, /DISCOVERY_PORT = 49192/);
  assert.match(activity, /acceptsHostBundle\(status\.optString\("bundle"\)\)/);
  assert.match(activity, /openGame\(host\.address,true\)/);
  assert.match(activity, /"join=1"\.equals\(uri\.getQuery\(\)\)/);
  assert.match(activity, /uri\.getQuery\(\) == null \|\| autoJoinQuery/);
  assert.match(page, /meta\[name="sightline-route"\].*content === 'lan-host'.*get\('join'\) === '1'/);
  assert.match(page, /if\(!MP\.on && MP\.addr\) mpConnect\(\)/);
});

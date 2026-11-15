'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('Windows host advertises discovery only in development and client bridge is loopback-only', () => {
  const launcher = read('SIGHTLINE.bat');
  const host = read('AndroidProject/app/src/main/assets/phone-host/server.js');
  const bridge = read('tools/offline-static-server.cjs');
  const discovery = read('tools/lan-discovery.cjs');
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
    assert.ok(page.includes("data.schema!=='sightline-lan-hosts-v1'"));
    assert.ok(page.includes('h.protocol!==2'));
    assert.ok(page.includes('h.verified!==true'));
    assert.ok(page.includes("MP_LAN_DISCOVERY.hosts=[]"), 'each scan clears expired hosts before displaying results');
    assert.match(page, /data-net="join-discovered"/);
    assert.match(page, /Manual IP is still available below/);
    assert.match(page, /else if \(a === 'join-discovered'\)/);
  }
});

test('Android discovery validates the PC host and only auto-joins the exact approved query', () => {
  const activity = read('AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');
  const page = read('AndroidProject/app/src/main/assets/phone-host/index.html');
  assert.match(activity, /private void discoverLanHosts\(\)/);
  assert.match(activity, /DISCOVERY_PORT = 49192/);
  assert.match(activity, /HOST_BUNDLE_SHA256\.equals\(status\.optString\("bundle"\)\)/);
  assert.match(activity, /openGame\(host\.address,true\)/);
  assert.match(activity, /"join=1"\.equals\(uri\.getQuery\(\)\)/);
  assert.match(activity, /uri\.getQuery\(\) == null \|\| autoJoinQuery/);
  assert.match(page, /meta\[name="sightline-route"\].*content === 'lan-host'.*get\('join'\) === '1'/);
  assert.match(page, /if\(!MP\.on && MP\.addr\) mpConnect\(\)/);
});

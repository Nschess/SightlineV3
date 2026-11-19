'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Hunt = require('../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const host = path.join(assets, 'phone-host');
const offline = path.join(assets, 'www');
const page = fs.readFileSync(path.join(host, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(host, 'server.js'), 'utf8');
const java = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'), 'utf8');

test('Outbreak hunting module is loaded and routed through Android LAN host', () => {
  assert.match(page, /<script src="zombie-hunt\.js"><\/script>/);
  assert.match(server, /require\('\.\/zombie-hunt\.js'\)/);
  assert.match(server, /'\/zombie-hunt\.js':\['zombie-hunt\.js','application\/javascript; charset=utf-8'\]/);
  assert.match(java, /"infection-evasion\.js", "zombie-hunt\.js"/);
});

test('Outbreak client AI is mode-gated and leaves Infection handler available', () => {
  assert.match(page, /R\.mode === 'outbreak' && !SOLO_INF\.on/);
  assert.match(page, /SightlineZombieHunt\.seen/);
  assert.match(page, /SightlineInfectionEvasion\.choose/);
  assert.match(page, /infection-evasion\.js/);
});

test('Infection HUD reports the active bot roster instead of the round score', () => {
  assert.match(page, /var infectionHud = R\.mode === 'infection' \|\| \(MP\.on && MP\.mode === 'infection'\)/);
  assert.match(page, /aliveCount\(mates\) \+ aliveCount\(bots\)/);
  assert.match(page, /MP\.sc\.players\.filter\(function \(p\) \{ return p\.bot && p\.alive; \}\)/);
});

test('multiplayer Infection lobby copy matches its ten-second server incubation', () => {
  assert.match(page, /Patient Zero are selected after the 10-second incubation/);
  assert.doesNotMatch(page, /patient zero turns after twelve seconds/i);
});

test('offline and phone-host shared Outbreak AI paths and hunt module remain byte-identical', () => {
  assert.deepEqual(fs.readFileSync(path.join(host, 'zombie-hunt.js')), fs.readFileSync(path.join(offline, 'zombie-hunt.js')));
  const hostPage=fs.readFileSync(path.join(host,'index.html'),'utf8'),offlinePage=fs.readFileSync(path.join(offline,'index.html'),'utf8');
  function declaration(html,name){const start=html.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} is present`);const end=html.indexOf('\nfunction ',start+1);return html.slice(start,end<0?html.length:end).trim();}
  for(const name of ['infectionSoloTick','stepOutbreakZombie','stepZombie','runOfflineBots','outbreakTick'])
    assert.equal(declaration(hostPage,name),declaration(offlinePage,name),`${name} shared AI path`);
});

test('Outbreak recovery ignores a stale target after its last-seen position is cleared', () => {
  const start = page.indexOf('function stepOutbreakZombie(');
  const code = page.slice(start,page.indexOf('function stepZombie(',start));
  const player = { x: 100, z: 0, alive: true };
  const hunt = Hunt.create(1);
  Hunt.seen(hunt,player,10);
  for (let i=0;i<3;i++) Hunt.blocked(hunt,20+i);
  assert.equal(hunt.seen,null);
  assert.equal(hunt.state,'recover');
  const u = { x: 0, z: 0, tr: { reach: 1.6 }, tgt: player, hunt, huntScan: 1,
    shT: 1, yaw: 0, g: { position: {}, rotation: {} } };
  const context = { P: player, state: 'live', SightlineZombieHunt: Hunt, NAV: null,
    performance: { now: () => 30 }, finishSpit() {}, separate() {}, settleUnitHeight() {} };
  vm.runInNewContext(code+'\nstepOutbreakZombie(u,0.016);',{ ...context, u });
  assert.equal(u.g.position.x,0);
  assert.equal(hunt.state,'recover');
});

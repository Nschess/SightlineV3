#!/usr/bin/env node
// Deterministic checks against the actual host authority. This is not a browser,
// Wi-Fi, device, or graphics performance test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../AndroidProject/app/src/main/assets/phone-host');
const require = createRequire(import.meta.url);
const host = require(resolve(root, 'server.js'));
const { G, players, DATA } = host;
const A = host._t;
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
function client(name) {
  const events = [];
  return { events, conn: { closed: false, backlog: 0, text(s) { events.push(JSON.parse(s)); }, sendFrame(b) { let n = b[1] & 127, at = 2; if (n === 126) { n = b.readUInt16BE(2); at = 4; } else if (n === 127) { n = b.readUInt32BE(6); at = 10; } try { events.push(JSON.parse(b.subarray(at, at + n).toString())); } catch {} }, kill() { this.closed = true; } }, player: null };
}
const a = client('capacity-host'), b = client('capacity-guest');
try {
  a.player = A.addPlayer(a.conn, 'CapacityHost');
  b.player = A.addPlayer(b.conn, 'CapacityGuest');
  a.player.host = true; a.player.team = 0; b.player.team = 1;
  A.onMessage(a.player, JSON.stringify({ t: 'cfg', bots: { mode: 'add', balance: false, t0: 32, t1: 32 } }));
  check('32 bots per team plus two human players creates 64 bots', () => {
    assert.equal(players.size, 66);
    assert.equal([...players.values()].filter(p => p.bot).length, 64);
    assert.equal([...players.values()].filter(p => p.team === 0).length, 33);
    assert.equal([...players.values()].filter(p => p.team === 1).length, 33);
  });
  check('Lobby publishes the 96 total-slot capacity for 32 humans plus 64 bots', () => {
    const lobby = a.events.filter(e => e.t === 'lobby').at(-1);
    assert.equal(lobby.total, 96);
  });

  A.onMessage(a.player, JSON.stringify({ t: 'cfg', mode: 'outbreak', bots: { mode: 'add', coop: 64 } }));
  check('Outbreak caps the allied survivor roster at 56 and keeps at least eight AI slots for the horde', () => {
    assert.equal(G.mode, 'outbreak');
    const bots = [...players.values()].filter(p => p.bot);
    assert.equal(bots.length, 56);
    assert.deepEqual([0, 1].map(team => bots.filter(p => p.team === team).length), [28, 28]);
    assert.ok(A.OB.zs.size + bots.length <= 64);
  });
  A.onMessage(a.player, JSON.stringify({ t: 'cfg', mode: 'infection', bots: { coop: 64 } }));
  check('Infection can request and create all 64 cooperative bots', () => {
    assert.equal(G.mode, 'infection');
    assert.equal([...players.values()].filter(p => p.bot).length, 64);
  });

  A.onMessage(a.player, JSON.stringify({ t: 'cfg', mode: 'versus', bots: { t0: 0, t1: 0, coop: 0 } }));
  assert.equal(players.size, 2);
  const synthetic = [];
  for (let i = 0; i < 30; i++) {
    const p = A.addPlayer({ closed: false, backlog: 0, text() {}, sendFrame() {}, kill() {} }, 'CapacityPeer' + i);
    p.team = i % 2; synthetic.push(p.id);
  }
  A.onMessage(a.player, JSON.stringify({ t: 'cfg', bots: { mode: 'add', balance: false, t0: 32, t1: 32 } }));
  check('maximum host setting supports 32 humans plus 64 bots', () => {
    assert.equal(players.size, 96);
    assert.equal([...players.values()].filter(p => !p.bot).length, 32);
    assert.equal([...players.values()].filter(p => p.bot).length, 64);
  });
  synthetic.forEach(id => players.delete(id));
  A.onMessage(a.player, JSON.stringify({ t: 'cfg', bots: { t0: 0, t1: 0 } }));
  assert.equal(players.size, 2);
  const map = DATA.maps.find(m => m.id === 'courtyard') || DATA.maps[0];
  G.map = map.id; G.mode = 'versus'; G.phase = 'live';
  const p = a.player;
  p.alive = true; p.team = 0; p.y = 0; p.ep = 7;
  p.moveCredit = 0.6; p.verticalCredit = 0.35; p.airSince = 0;

  // Find a clear straight three-metre lane from a valid point inside the host
  // spawn region, using the same server box rules as onInput.
  function blocked(x, z) {
    for (const box of map.boxes) {
      if (box[4] <= 0.35 || (box[5] || 0) >= 1.8) continue;
      if (x > box[0] - 0.15 && x < box[1] + 0.15 && z > box[2] - 0.15 && z < box[3] + 0.15) return true;
    }
    return false;
  }
  const start = { x: map.spawn.x, z: map.spawn.z };
  const directions = [[1,0],[-1,0],[0,1],[0,-1],[Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2],[-Math.SQRT1_2,-Math.SQRT1_2]];
  const dir = directions.find(([dx,dz]) => {
    for (let i = 0; i <= 30; i++) if (blocked(start.x + dx * i * 0.1, start.z + dz * i * 0.1)) return false;
    return true;
  });
  assert.ok(dir, 'no clear 3 m straight lane in test map');
  p.x = start.x; p.z = start.z; p.creditT = Date.now() - 600; p.lastIn = p.creditT;
  const correctionBefore = a.events.filter(e => e.t === 'corr').length;
  A.onInput(p, { ep: p.ep, x: p.x + dir[0] * 3, y: 0, z: p.z + dir[1] * 3, yaw: 0, pitch: 0 });
  check('600 ms delayed legal run packet does not rewind', () => {
    assert.equal(a.events.filter(e => e.t === 'corr').length, correctionBefore);
    assert.ok(Math.hypot(p.x - start.x, p.z - start.z) > 2.99);
  });
  check('Movement credit buffer is bounded to plausible 600 ms slide travel', () => {
    assert.match(require('node:fs').readFileSync(resolve(root, 'server.js'), 'utf8'), /Math\.min\(4\.8, \(p\.moveCredit \|\| 0\) \+ MAX_SPEED\*dt/);
  });

  p.x = start.x; p.z = start.z; p.ep++; p.moveCredit = 0.6; p.creditT = Date.now() - 600; p.lastIn = p.creditT;
  const correctionCount = a.events.filter(e => e.t === 'corr').length;
  A.onInput(p, { ep: p.ep, x: p.x + dir[0] * 7, y: 0, z: p.z + dir[1] * 7, yaw: 0, pitch: 0 });
  check('Excess movement remains server-rejected with reason', () => {
    const corr = a.events.filter(e => e.t === 'corr').at(-1);
    assert.equal(a.events.filter(e => e.t === 'corr').length, correctionCount + 1);
    assert.equal(corr.why, 'speed');
    assert.ok(host._t.stats.corrSpeed > 0);
  });

  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  check('Bot controls use direct numeric entry and respect host capacity', () => {
    assert.match(html, /type="number" inputmode="numeric" min="0" max="' \+ max/);
    assert.match(html, /var max = coop \? \(L\.mode === 'outbreak' \? 56 : 64\) : Math\.min\(32, Math\.max\(1, Number\(L\.total\) \|\| 32\)\)/);
    assert.match(html, /up to 32 human players and 64 AI bots/i);
  });
  check('Network diagnostics display correction reason', () => {
    assert.match(html, /corrections ' \+ nt\.corrCount/);
    assert.match(html, /MP\.net\.lastCorr = \(m\.why \|\| 'unknown'\)/);
    assert.match(html, /\(nt\.lastCorr \? '\\nlast correction: ' \+ nt\.lastCorr : ''\)/);
  });
  check('Auto interpolation follows snapshot spacing with reduced LAN delay', () => {
    assert.match(html, /\[20, '20 ms LAN'\]/);
    assert.match(html, /function interpMs\(\) \{ return G\.interp \|\| Math\.max\(20, Math\.min\(180, Math\.round\(MP\.net\.ema \+ MP\.net\.jit \* 2\)\)\); \}/);
    assert.match(html, /SEND_MS = 20/);
    assert.match(require('node:fs').readFileSync(resolve(root, 'server.js'), 'utf8'), /opt\('tick-ms', 20, 10, 50\).*opt\('snapshot-every', 1, 1, 5\)/);
  });
  console.log(`PASS ${checks.length}/${checks.length} multiplayer capacity and movement-authority checks`);
  checks.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));
} finally {
  players.clear();
  G.phase = 'lobby';
}

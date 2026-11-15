'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const hostDir = path.resolve(__dirname, '..', 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const serverPath = path.join(hostDir, 'server.js');
function readTick(args = [], { players = 0, hollowed = 0 } = {}) {
  const setup = { players, hollowed };
  const script = `process.argv=[process.execPath,'server.js',...${JSON.stringify(args)}];const s=require(${JSON.stringify(serverPath)});const setup=${JSON.stringify(setup)};for(let i=0;i<setup.players;i++){const p=s._t.makeBot(i%2);p.id=i+1;s.players.set(p.id,p);}if(setup.hollowed){s.G.mode='outbreak';s.G.phase='live';for(let i=0;i<setup.hollowed;i++)s._t.OB.zs.set(1000+i,{});}const everyTicks=s._t.snapshotEveryNow();console.log(JSON.stringify({tickMs:s._t.tickMs,snapshotEvery:everyTicks,snapshotHz:Math.round(1000/(s._t.tickMs*everyTicks)),entities:s._t.snapshotEntityCount()}));`;
  const run = spawnSync(process.execPath, ['-e', script], { cwd: hostDir, encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout.trim());
}

test('normal host keeps the 20 ms / 50 Hz default', () => {
  assert.deepEqual(readTick([], { players: 64 }), { tickMs: 20, snapshotEvery: 1, snapshotHz: 50, entities: 64 });
});

test('opt-in Windows-aligned host period preserves 15.625 ms and reports 64 Hz', () => {
  assert.deepEqual(readTick(['--tick-ms', '15.625'], { players: 64 }), { tickMs: 15.625, snapshotEvery: 1, snapshotHz: 64, entities: 64 });
});

test('actor-count snapshot throttling remains correct at both host periods', () => {
  assert.deepEqual(readTick([], { players: 72, hollowed: 8 }), { tickMs: 20, snapshotEvery: 2, snapshotHz: 25, entities: 80 });
  assert.deepEqual(readTick(['--tick-ms', '15.625'], { players: 72, hollowed: 8 }), { tickMs: 15.625, snapshotEvery: 2, snapshotHz: 32, entities: 80 });
});

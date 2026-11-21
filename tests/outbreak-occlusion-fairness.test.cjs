'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Server = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Hunt = require('../AndroidProject/app/src/main/assets/phone-host/zombie-hunt.js');
const { G, players, MAPS, _t } = Server;

function targets() {
  const hidden = Array.from({ length: 5 }, (_, i) => ({
    id: 100 + i, bot: false, team: i % 2, alive: true,
    x: 15, y: 0, z: 21 + i, hp: 100, armor: 0, c: null, hist: []
  }));
  const visible = { id: 200, bot: false, team: 0, alive: true, x: 6, y: 0, z: 26, hp: 100, armor: 0, c: null, hist: [] };
  return { hidden, visible, all: [...hidden, visible] };
}

test('offline Outbreak perception keeps the first nearest-five scan and rotates four later probes by stable actor ID', () => {
  const { hidden, visible, all } = targets();
  const candidates = [], distances = [];
  const mates = [...hidden.slice(1), visible], origin = { x: 15, y: 0, z: 15 };
  const oldNearest = Hunt.nearestTargets(origin, hidden[0], mates, 5, [], []);
  let cursor = Hunt.perceptionTargets(origin, hidden[0], mates, 5, candidates, distances, undefined, 43, 5);
  assert.deepEqual(candidates, oldNearest, 'first scan retains the original nearest-five candidate set');
  assert.deepEqual(candidates.slice(0, 4), hidden.slice(0, 4));
  assert.equal(candidates[4], hidden[4], 'first fair probe reaches the fifth screened survivor');
  assert.equal(cursor, hidden[4].id, 'the persistent rotation cursor is the last scanned actor ID, not an array index');
  cursor = Hunt.perceptionTargets(origin, hidden[0], mates, 5, candidates, distances, cursor, 43, 5);
  assert.equal(candidates.length, 5);
  assert.ok(candidates.includes(visible), 'the later scan reaches the clear survivor without increasing the LOS budget');
  assert.ok(candidates.every(p => all.includes(p)));
  assert.ok(candidates.length <= 5, 'the candidate/LOS budget remains five');
});

test('offline local player without a network ID remains a valid zombie target and preferred anchor', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const localPlayer = { alive: true, x: 0, y: 0, z: -8 };
  const mates = Array.from({ length: 8 }, (_, i) => ({ id: 300 + i, alive: true, x: i + 1, y: 0, z: -8 }));
  const candidates = [], distances = [];
  const cursor = Hunt.perceptionTargets(origin, localPlayer, mates, 5, candidates, distances, undefined, 43, 5);
  assert.ok(candidates.includes(localPlayer), 'the first scan includes the local player without assigning a network ID');
  const nextCursor = Hunt.perceptionTargets(origin, localPlayer, mates, 5, candidates, distances, cursor, 43, 5, localPlayer);
  assert.strictEqual(candidates[0], localPlayer, 'the current local-player target remains the stable anchor');
  assert.ok(Number.isFinite(nextCursor), 'the identity cursor remains valid after the preferred local-player anchor');
});

test('Outbreak scans cover a 64-survivor roster despite roster reorder, movement, death, and respawn', () => {
  const origin = { x: 15, y: 0, z: 15 };
  const primary = { id: 1, alive: true, x: 15, y: 0, z: 21 };
  const hidden = Array.from({ length: 62 }, (_, i) => ({
    id: i + 2, alive: true, x: 15 + ((i % 9) - 4) * 0.3, y: 0, z: 21 + (i % 3) * 0.15
  }));
  let visible = { id: 1000, alive: true, x: 6, y: 0, z: 26 };
  let others = [...hidden, visible], candidates = [], distances = [];
  let cursor = Hunt.perceptionTargets(origin, primary, others, 5, candidates, distances, undefined, 43, 5);
  assert.equal(candidates.length, 5, 'initial scan retains the legacy nearest-five candidates');
  let scans = 0;
  while (!candidates.includes(visible) && scans < 16) {
    const shift = ((scans + 1) * 13) % others.length;
    others = [...others.slice(shift), ...others.slice(0, shift)];
    visible.x = 6 + (scans % 3) * 0.05;
    cursor = Hunt.perceptionTargets(origin, primary, others, 5, candidates, distances, cursor, 43, 5);
    scans++;
  }
  assert.ok(candidates.includes(visible), `late visible survivor is probed within the multi-probe roster cycle (scans=${scans})`);
  assert.ok(scans <= 15, `four rotating probes cover 64 survivors in at most 15 later scans (scans=${scans})`);
  assert.ok((scans * 478) <= 7170, 'derived worst-case delay is bounded by 7.17 seconds at the existing maximum sense interval');
  assert.equal(candidates.length, 5, 'the per-scan LOS budget is unchanged');

  visible.alive = false;
  const respawn = { id: 1001, alive: true, x: 6.1, y: 0, z: 26 };
  others = [...hidden, respawn];
  let respawnScans = 0;
  while (!candidates.includes(respawn) && respawnScans < 16) {
    cursor = Hunt.perceptionTargets(origin, primary, others, 5, candidates, distances, cursor, 43, 5, null);
    respawnScans++;
  }
  assert.ok(candidates.includes(respawn), `new actor identity remains eligible after the cursor advances (scans=${respawnScans})`);
  assert.ok(candidates.every(p => p.alive), 'dead actors are excluded from subsequent candidate sets');
});

test('Outbreak stable-ID probes include every eligible survivor in a bounded scan cycle', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const primary = { id: 1, alive: true, x: 0.1, y: 0, z: -10 };
  const survivors = Array.from({ length: 63 }, (_, i) => ({
    id: i + 2, alive: true, x: ((i % 7) - 3) * 0.2, y: 0, z: -10 - Math.floor(i / 7) * 0.04
  }));
  const considered = new Set(), candidates = [], distances = [];
  let cursor, scans = 0;
  while (considered.size < survivors.length + 1 && scans < 20) {
    cursor = Hunt.perceptionTargets(origin, primary, survivors, 5, candidates, distances, cursor, 43, 5);
    for (const actor of candidates) considered.add(actor.id);
    assert.ok(candidates.length <= 5, 'perception remains within its five-ray candidate budget');
    scans++;
  }
  assert.equal(considered.size, survivors.length + 1, `all eligible survivor identities are selected for a visibility check (scans=${scans})`);
  assert.ok(scans <= 17, `one primary plus 63 survivors are covered within 17 scans (scans=${scans})`);
});

test('authoritative Outbreak zombie acquires a farther visible survivor behind a screened nearest-five group', () => {
  const map = MAPS.courtyard, originalBoxes = map.boxes.slice();
  const prior = { mode: G.mode, phase: G.phase, map: G.map };
  try {
    players.clear(); _t.OB.zs.clear();
    G.mode = 'outbreak'; G.phase = 'live'; G.map = 'courtyard';
    // This QA-only wall blocks the five nearer candidates but leaves the sixth
    // candidate's ray visibly clear around its left edge.
    map.boxes.push([13, 17, 18, 20, 3]);
    _t.obReset(); _t.OB.phase = 'fight';
    const { hidden, visible, all } = targets();
    for (const p of all) players.set(p.id, p);
    const zombie = _t.makeZ(15, 15, 'walker', 1);
    zombie.rise = 0; zombie.yaw = Math.PI; zombie.tt = 0; zombie.gSpd = 0; zombie.atkT = 1000;

    const los = p => {
      const dx = p.x - zombie.x, dz = p.z - zombie.z, d = Math.hypot(dx, dz);
      return _t.wallDist(map, zombie.x, zombie.y + 1.35, zombie.z, dx / d, (p.y - zombie.y) / d, dz / d, d) >= d - 0.12;
    };
    assert.ok(hidden.every(p => !los(p)), 'all five nearer survivors are occluded');
    assert.ok(los(visible), 'the sixth survivor has clear line of sight');

    _t.stepZombies(0.05);
    assert.equal(zombie.tgt, null, 'first scan preserves the original nearest-five result');
    assert.equal(zombie.perceptionCursor, 104, 'next scan resumes after the original fifth-nearest actor ID');
    let seen = false;
    for (let i = 0; i < 24; i++) {
      _t.stepZombies(0.05);
      if (zombie.tgt === visible) { seen = true; break; }
    }
    assert.ok(seen, 'the authoritative zombie must acquire the visible survivor after a bounded probe rotation');
    assert.equal(zombie.tgt, visible);
    assert.equal(zombie.hp, zombie.maxhp, 'target discovery does not alter combat balance');

    zombie.tt = 0;
    assert.strictEqual(_t.zombiePerceive(zombie, all, map, 5000), visible, 'the acquired target remains under continuous visibility checks');
    visible.alive = false;
    const respawn = { id: 201, bot: false, team: 0, alive: true, x: 6.1, y: 0, z: 26, hp: 100, armor: 0, c: null, hist: [] };
    players.set(respawn.id, respawn);
    const alive = all.filter(p => p.alive).concat(respawn);
    let respawnSeen = false;
    for (let i = 0; i < 8; i++) {
      zombie.tt = 0;
      if (_t.zombiePerceive(zombie, alive, map, 5300 + i * 300) === respawn) { respawnSeen = true; break; }
    }
    assert.ok(respawnSeen, 'a new survivor identity is acquired after death without relying on roster position');
  } finally {
    map.boxes.splice(0, map.boxes.length, ...originalBoxes);
    players.clear(); _t.obReset();
    G.mode = prior.mode; G.phase = prior.phase; G.map = prior.map;
  }
});

test('a heard Outbreak gunshot prioritizes its visible shooter without adding LOS probes', () => {
  const map = MAPS.courtyard, originalBoxes = map.boxes.slice();
  const prior = { mode: G.mode, phase: G.phase, map: G.map };
  try {
    players.clear(); _t.OB.zs.clear();
    G.mode = 'outbreak'; G.phase = 'live'; G.map = 'courtyard';
    map.boxes.push([13, 17, 18, 20, 3]);
    _t.obReset(); _t.OB.phase = 'fight';

    const { hidden } = targets();
    for (const p of hidden) players.set(p.id, p);
    const shooter = _t.makeBot(0);
    const generatedId = shooter.id;
    Object.assign(shooter, { alive: true, id: 200, x: 6, y: 0, z: 26, cur: 'carbine', nextShot: 0, lastShot: 0 });
    shooter.owned.add('carbine'); shooter.ammo.carbine = { mag: 30, res: 90 };
    players.delete(generatedId);
    players.set(shooter.id, shooter);

    const zombie = _t.makeZ(15, 15, 'walker', 1);
    zombie.rise = 0; zombie.yaw = Math.PI; zombie.tt = 0; zombie.gSpd = 0; zombie.atkT = 1000;
    const ammoBefore = shooter.ammo.carbine.mag;
    _t.onShot(shooter, { w: 'carbine', d: [[0, -0.1, -1]] });
    assert.equal(shooter.ammo.carbine.mag, ammoBefore - 1, 'the normal authoritative ammunition deduction remains intact');
    assert.strictEqual(zombie.heardShotTarget, shooter, 'authoritative gunfire records the actual shooter as a one-scan cue');

    const before = Date.now(); zombie.tt = 0;
    assert.strictEqual(_t.zombiePerceive(zombie, [...players.values()].filter(p => p.alive), map, before), shooter,
      'the next perception scan checks the audible shooter ahead of the screened nearest five');
    assert.equal(zombie.perceptionScratch.length, 5, 'the direct sound cue stays inside the existing five-candidate LOS budget');
    assert.equal(zombie.heardShotTarget, null, 'the direct shooter cue is consumed once');
  } finally {
    map.boxes.splice(0, map.boxes.length, ...originalBoxes);
    players.clear(); _t.obReset();
    G.mode = prior.mode; G.phase = prior.phase; G.map = prior.map;
  }
});

test('an audible shooter behind cover cannot displace a zombie’s visible target', () => {
  const map = MAPS.courtyard, originalBoxes = map.boxes.slice();
  const prior = { mode: G.mode, phase: G.phase, map: G.map };
  try {
    players.clear(); _t.OB.zs.clear();
    G.mode = 'outbreak'; G.phase = 'live'; G.map = 'courtyard';
    // The wall blocks the five nearest actors and the shooter at z=27, while
    // the sixth actor remains visible around the left edge.
    map.boxes.push([13, 17, 18, 20, 3]);
    _t.obReset(); _t.OB.phase = 'fight';
    const { hidden, visible } = targets();
    for (const p of hidden) players.set(p.id, p);
    players.set(visible.id, visible);

    const zombie = _t.makeZ(15, 15, 'walker', 1);
    zombie.rise = 0; zombie.yaw = Math.PI; zombie.tt = 0; zombie.gSpd = 0; zombie.atkT = 1000;
    const all = [...players.values()];
    const firstTime = Date.now();
    assert.equal(_t.zombiePerceive(zombie, all, map, firstTime), null,
      'initial nearest-five visibility scan cannot see through the wall');
    let acquired = false;
    for (let i = 1; i <= 24; i++) {
      zombie.tt = 0;
      if (_t.zombiePerceive(zombie, all, map, firstTime + i * 300) === visible) { acquired = true; break; }
    }
    assert.ok(acquired, 'fair rotating LOS probes can acquire the visible target first');

    const shooter = _t.makeBot(0);
    Object.assign(shooter, { alive: true, x: 15, y: 0, z: 27, cur: 'carbine', nextShot: 0, lastShot: 0 });
    shooter.owned.add('carbine'); shooter.ammo.carbine = { mag: 30, res: 90 };
    const dx = shooter.x - zombie.x, dz = shooter.z - zombie.z, d = Math.hypot(dx, dz);
    assert.ok(_t.wallDist(map, zombie.x, zombie.y + 1.35, zombie.z, dx / d, 0, dz / d, d) < d - 0.12,
      'the audible shooter is physically occluded');

    _t.onShot(shooter, { w: 'carbine', d: [[1, 0, 0]] });
    assert.strictEqual(zombie.heardShotTarget, shooter, 'gunfire still supplies a one-scan shooter cue');
    zombie.tt = 0;
    assert.strictEqual(_t.zombiePerceive(zombie, [...players.values()].filter(p => p.alive), map, Date.now()), visible,
      'LOS is still required and the already visible target remains selected');
    assert.equal(zombie.tgt, visible);
    assert.equal(zombie.heardShotTarget, null, 'the occluded cue is consumed without granting target knowledge');
    assert.ok(zombie.perceptionScratch.length <= 5, 'the cue stays within the existing LOS budget');
  } finally {
    map.boxes.splice(0, map.boxes.length, ...originalBoxes);
    players.clear(); _t.obReset();
    G.mode = prior.mode; G.phase = prior.phase; G.map = prior.map;
  }
});

test('multiple Outbreak shooters notify only the nearby zombies and retain the five-probe cap', () => {
  const prior = { mode: G.mode, phase: G.phase, map: G.map };
  try {
    players.clear(); _t.OB.zs.clear();
    G.mode = 'outbreak'; G.phase = 'live'; G.map = 'courtyard';
    _t.obReset(); _t.OB.phase = 'fight';

    const zA = _t.makeZ(-20, -25, 'walker', 1);
    const zB = _t.makeZ(20, 25, 'walker', 1);
    for (const z of [zA, zB]) { z.rise = 0; z.tt = 0; z.gSpd = 0; }
    const makeShooter = (x, z) => {
      const p = _t.makeBot(0);
      Object.assign(p, { alive: true, x, y: 0, z, cur: 'carbine', nextShot: 0, lastShot: 0 });
      p.owned.add('carbine'); p.ammo.carbine = { mag: 30, res: 90 };
      return p;
    };
    const shooterA = makeShooter(-20, -15), shooterB = makeShooter(20, 15);
    assert.ok(Math.hypot(shooterA.x - zB.x, shooterA.z - zB.z) > 36);
    assert.ok(Math.hypot(shooterB.x - zA.x, shooterB.z - zA.z) > 36);

    _t.onShot(shooterA, { w: 'carbine', d: [[1, 0, 0]] });
    _t.onShot(shooterB, { w: 'carbine', d: [[1, 0, 0]] });
    assert.strictEqual(zA.heardShotTarget, shooterA, 'the first horde member records its nearby shooter');
    assert.strictEqual(zB.heardShotTarget, shooterB, 'the second horde member records its nearby shooter');
    const humans = [...players.values()].filter(p => p.alive);
    for (const [z, shooter] of [[zA, shooterA], [zB, shooterB]]) {
      z.tt = 0;
      _t.zombiePerceive(z, humans, MAPS.courtyard, Date.now());
      assert.equal(z.heardShotTarget, null, 'each zombie consumes its cue on its next scan');
      assert.ok(z.perceptionScratch.length <= 5, 'multiple cues do not raise the LOS candidate budget');
      assert.equal(z.perceptionScratch[0].p, shooter, 'the matching local shooter is first in the existing probe list');
    }
  } finally {
    players.clear(); _t.obReset();
    G.mode = prior.mode; G.phase = prior.phase; G.map = prior.map;
  }
});

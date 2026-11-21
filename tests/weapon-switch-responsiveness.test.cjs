'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Server = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const { G, players, _t } = Server;

const root = path.resolve(__dirname, '..');
const pages = [
  ['Offline', 'AndroidProject/app/src/main/assets/www/index.html'],
  ['phone-host', 'AndroidProject/app/src/main/assets/phone-host/index.html']
];

for (const [label, relative] of pages) {
  test(`${label} weapon switch keeps the local fire lock at 250 ms`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const match = source.match(/function setWeapon\(k\)\s*\{[\s\S]*?\n\}/);
    assert.ok(match, `${label} production setWeapon function is present`);

    const context = {
      T: 12, nextFire: 0, cur: 'pistol', lastCur: 'pistol', reloading: 0,
      scoped: false, zoomLvl: 0, drawT: 0, autoReloadSwitchToken: 0,
      owned: { pistol: true, carbine: true }, state: 'live', P: { alive: true },
      guns: { pistol: { visible: true }, carbine: { visible: false } },
      mel: { t: 0, hit: true },
      legendCancelInspect() {}, gunFor() {}, cancelLongbowCycle() {},
      legendActive() { return false; }, legendCue() {}, updateHud() {}
    };
    vm.runInNewContext(`${match[0]}\nsetWeapon('carbine'); this.lock = nextFire - T;`, context);
    assert.equal(context.cur, 'carbine', 'the selected weapon still changes immediately');
    assert.equal(context.lock, 0.25, 'the shorter delay is 100 ms faster than the previous 350 ms lock');
    assert.equal(context.guns.carbine.visible, true, 'the selected viewmodel remains active during the lock');
  });

  test(`${label} rapid switches cancel reload without changing either magazine`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const match = source.match(/function setWeapon\(k\)\s*\{[\s\S]*?\n\}/);
    assert.ok(match, `${label} production setWeapon function is present`);
    const ammo = { pistol: { mag: 3, res: 17 }, carbine: { mag: 11, res: 59 } };
    const context = {
      T: 12, nextFire: 0, cur: 'pistol', lastCur: 'pistol', reloading: 1.2,
      scoped: true, zoomLvl: 2, drawT: 0, autoReloadSwitchToken: 0, fireHeld: true,
      owned: { pistol: true, carbine: true }, state: 'live', P: { alive: true }, ammo,
      guns: { pistol: { visible: true }, carbine: { visible: false } },
      mel: { t: 0.2, hit: false },
      legendCancelInspect() {}, gunFor() {}, cancelLongbowCycle() {},
      legendActive() { return false; }, legendCue() {}, updateHud() {}
    };
    vm.runInNewContext(
      `${match[0]}\nsetWeapon('carbine'); this.firstLock = nextFire - T; T += 0.1; setWeapon('pistol'); this.secondLock = nextFire - T;`,
      context
    );
    assert.equal(context.cur, 'pistol', 'each switch changes the selected weapon immediately');
    assert.ok(Math.abs(context.firstLock - 0.25) < 1e-9);
    assert.ok(Math.abs(context.secondLock - 0.25) < 1e-9, 'rapid switching restarts the lock from the latest selection');
    assert.equal(context.reloading, 0, 'switching cancels the interrupted reload');
    assert.equal(context.autoReloadSwitchToken, 2, 'both real weapon changes invalidate delayed empty-mag reloads');
    assert.strictEqual(context.ammo, ammo, 'switching does not replace or transfer either weapon ammo record');
    assert.deepEqual(ammo, { pistol: { mag: 3, res: 17 }, carbine: { mag: 11, res: 59 } });
    assert.equal(context.fireHeld, true, 'weapon selection does not fabricate a touch fire release');
  });

  test(`${label} production trigger guard blocks shots until the selected switch deadline`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const setWeapon = source.match(/function setWeapon\(k\)\s*\{[\s\S]*?\n\}/);
    const tryFire = source.match(/function tryFire\(edge\)\s*\{[\s\S]*?\n\}/);
    assert.ok(setWeapon && tryFire, `${label} production weapon and firing functions are present`);
    const meleeAttempts = [], ammo = { pistol: { mag: 8, res: 24 }, carbine: { mag: 20, res: 60 } };
    const context = {
      T: 12, nextFire: 0, cur: 'pistol', lastCur: 'pistol', reloading: 0,
      scoped: false, zoomLvl: 0, drawT: 0, autoReloadSwitchToken: 0,
      owned: { pistol: true, carbine: true }, state: 'live', P: { alive: true }, ammo,
      WEAPONS: { pistol: { auto: false, melee: true }, carbine: { auto: false, melee: true } },
      guns: { pistol: { visible: true }, carbine: { visible: false } }, mel: { t: 0, hit: true },
      legendCancelInspect() {}, gunFor() {}, cancelLongbowCycle() {},
      legendActive() { return false; }, legendCue() {}, updateHud() {},
      beginnerRun: false, meleeAttempts, meleeAttack() { meleeAttempts.push('fired'); }
    };
    vm.runInNewContext(`${setWeapon[0]}\n${tryFire[0]}\nsetWeapon('carbine'); tryFire(true); this.beforeDeadline = this.meleeAttempts.length; T = nextFire - 0.001; tryFire(true); this.beforeExact = this.meleeAttempts.length; T = nextFire; tryFire(true);`, context);
    assert.equal(context.beforeDeadline, 0, 'changing weapons itself cannot trigger a shot');
    assert.equal(context.beforeExact, 0, 'the firing guard rejects a trigger edge just before the lock expires');
    assert.deepEqual(meleeAttempts, ['fired'], 'a deliberate edge is accepted once the 250 ms deadline is reached');
    assert.deepEqual(ammo, { pistol: { mag: 8, res: 24 }, carbine: { mag: 20, res: 60 } },
      'blocked and melee test shots do not alter firearm ammunition');
  });

  test(`${label} touch fire owners release cleanly and a new press produces one new edge`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const down = source.match(/function touchFireDown\(e\)\s*\{[^\n]*\}/);
    const up = source.match(/function touchFireUp\(e\)\s*\{[^\n]*\}/);
    assert.ok(down && up, `${label} production touch fire handlers are present`);
    assert.match(source, /tbtn\('#tb-fire',\s*touchFireDown,\s*touchFireUp,\s*\{\s*perPointer:\s*true/);
    const firedEdges = [], actions = [];
    const context = {
      touchActionActive: () => true,
      mobileGuide: { action: action => actions.push(action) },
      touchFireOwners: new Set(), fireHeld: false,
      tryFire: edge => firedEdges.push(edge)
    };
    vm.runInNewContext(`${down[0]}\n${up[0]}`, context);
    context.touchFireDown({ pointerId: 7 });
    context.touchFireDown({ pointerId: 8 });
    assert.deepEqual(firedEdges, [true], 'a second simultaneous touch owner does not synthesize another trigger edge');
    context.touchFireUp({ pointerId: 7 });
    assert.equal(context.fireHeld, true, 'one pointer release leaves the other pointer holding fire');
    context.touchFireUp({ pointerId: 8 });
    assert.equal(context.fireHeld, false, 'releasing the final pointer clears held fire');
    context.touchFireDown({ pointerId: 9 });
    assert.deepEqual(firedEdges, [true, true], 'release then re-press creates exactly one fresh fire edge');
    assert.deepEqual(actions, ['fire', 'fire', 'fire']);
  });

  test(`${label} lifecycle blur releases every held touch-fire owner`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const reset = source.match(/function resetTouchMotion\(\)\s*\{[\s\S]*?\n\}/);
    assert.ok(reset, `${label} production touch reset is present`);
    assert.match(source, /window\.addEventListener\('blur',\s*resetTouchMotion\);/,
      `${label} releases touch controls when Android pauses or backgrounds the WebView`);
    const activity = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'), 'utf8');
    assert.match(activity, /web\.evaluateJavascript\("window\.dispatchEvent\(new Event\('blur'\)\);", null\);/,
      'Android lifecycle dispatches the blur event to the game WebView');
    const context = {
      touchMode: false, fireHeld: true, touchFireOwners: new Set([7, 8]),
      clearMobileAim() {}, clearTimeout() {}, stick: { id: 2, x: 1, y: 1 }, lookTouch: { id: 3 },
      joy: { classList: { remove() {} } }, joyKnob: { style: {}, _stickX: 1, _stickY: 1 },
      touchButtonResets: []
    };
    vm.runInNewContext(`${reset[0]}\nthis.resetTouchMotion = resetTouchMotion;`, context);
    context.resetTouchMotion();
    assert.equal(context.fireHeld, false);
    assert.equal(context.touchFireOwners.size, 0, 'backgrounding cannot leave a stale owner that suppresses the next fire edge');
    assert.equal(context.stick.id, null);
    assert.equal(context.lookTouch.id, null);
  });
}

function mockSocket() {
  return { closed: false, backlog: 0, events: [], text(s) { this.events.push(JSON.parse(s)); }, sendFrame() {} };
}
function inputWeapon(player, weapon) {
  _t.onInput(player, {
    ep: player.ep, x: player.x, y: player.y, z: player.z,
    yaw: player.yaw, pitch: player.pitch, cr: 0, pr: 0, wk: 0, w: weapon
  });
}

test('phone-host authority accepts the shot after a rapid client-timed weapon swap and cancels reload without ammo transfer', async () => {
  const prior = { mode: G.mode, phase: G.phase, map: G.map };
  const previousPlayers = new Map(players);
  players.clear();
  G.mode = 'versus'; G.phase = 'live'; G.map = 'courtyard';
  try {
    const p = _t.addPlayer(mockSocket(), 'SwitchTester');
    Object.assign(p, { alive: true, cur: 'pistol', x: 0, y: 0, z: 36, ep: 1, rl: null, nextShot: 0, lastShot: 0 });
    p.owned.add('carbine');
    p.ammo.pistol = { mag: 8, res: 24 };
    p.ammo.carbine = { mag: 20, res: 60 };

    const firstSwitchAt = Date.now();
    inputWeapon(p, 'carbine');
    assert.equal(p.cur, 'carbine', 'the regular multiplayer input packet updates the authoritative selected weapon');
    assert.ok(p.nextShot >= firstSwitchAt + 190 && p.nextShot <= firstSwitchAt + 225,
      'the server starts its existing 200 ms switch gate when it receives the weapon field');

    await new Promise(resolve => setTimeout(resolve, 50));
    const latestSwitchAt = Date.now();
    inputWeapon(p, 'pistol');
    assert.equal(p.cur, 'pistol', 'a rapid second switch is synchronized through the same input path');
    assert.ok(p.nextShot >= latestSwitchAt + 190 && p.nextShot <= latestSwitchAt + 225,
      'the authoritative gate restarts from the most recent weapon selection');

    await new Promise(resolve => setTimeout(resolve, 260));
    const pistolBefore = p.ammo.pistol.mag, carbineBefore = p.ammo.carbine.mag;
    _t.onShot(p, { w: 'pistol', ep: p.ep, d: [[0, 0, -1]] });
    assert.equal(p.ammo.pistol.mag, pistolBefore - 1, 'a shot after the 250 ms local lock is accepted by the server');
    assert.equal(p.ammo.carbine.mag, carbineBefore, 'firing the selected pistol does not consume the other magazine');

    p.ammo.carbine = { mag: 4, res: 19 };
    p.rl = { w: 'carbine', at: Date.now() + 1000 };
    const interruptedAmmo = { ...p.ammo.carbine };
    inputWeapon(p, 'carbine');
    assert.equal(p.rl, null, 'authoritative weapon selection cancels the interrupted reload');
    assert.deepEqual(p.ammo.carbine, interruptedAmmo, 'an incomplete reload transfers no ammunition on switch');
  } finally {
    players.clear();
    for (const [id, player] of previousPlayers) players.set(id, player);
    G.mode = prior.mode; G.phase = prior.phase; G.map = prior.map;
  }
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const assets = ['www', 'phone-host'].map((tree) => ({
  tree,
  htmlPath: path.join(root, 'AndroidProject/app/src/main/assets', tree, 'index.html'),
  modulePath: path.join(root, 'AndroidProject/app/src/main/assets', tree, 'engagement-prototypes.js')
}));
const shared = require(assets[0].modulePath);

test('beginner operation is blocked for every networked or reconnecting state', () => {
  for (const options of [{ networked: true }, { reconnecting: true }, { hostMigration: true }]) {
    const operation = shared.createOperation();
    assert.equal(operation.start(options), false);
    assert.equal(operation.snapshot().active, false);
  }
});

test('beginner operation requires move, look, ADS, shot, reload, reload completion and elimination', () => {
  const operation = shared.createOperation();
  operation.start({ destination: { x: 4, z: 2, radius: 1 }, yaw: 0, pitch: 0 });
  const moveSnapshot = operation.snapshot();
  assert.equal(operation.snapshot(), moveSnapshot, 'unchanged per-frame snapshots are reused');
  assert.equal(operation.snapshot().step, 'move');
  assert.equal(operation.canFire(), false);
  operation.update({ x: 1, z: 2, yaw: 0, pitch: 0 });
  assert.equal(operation.snapshot(), moveSnapshot, 'walking within the step does not allocate a replacement snapshot');
  assert.equal(operation.snapshot().step, 'move');
  operation.update({ x: 3.1, z: 2, yaw: 0, pitch: 0 });
  assert.notEqual(operation.snapshot(), moveSnapshot, 'a step transition refreshes its snapshot');
  assert.equal(operation.snapshot().step, 'look');
  operation.update({ x: 3.1, z: 2, yaw: 0.23, pitch: 0 });
  assert.equal(operation.snapshot().step, 'aim');
  operation.update({ x: 3.1, z: 2, yaw: 0.23, pitch: 0, aimed: false });
  assert.equal(operation.snapshot().step, 'aim');
  operation.update({ x: 3.1, z: 2, yaw: 0.23, pitch: 0, aimed: true });
  assert.equal(operation.snapshot().step, 'fire');
  assert.equal(operation.canFire(), true);
  operation.shot();
  assert.equal(operation.snapshot().step, 'reload');
  assert.equal(operation.canFire(), false);
  operation.reloadStarted();
  assert.equal(operation.snapshot().step, 'reload-finish');
  operation.reloadFinished();
  assert.equal(operation.snapshot().step, 'objective');
  assert.equal(operation.canFire(), true);
  const result = operation.eliminated();
  assert.equal(result.complete, true);
  assert.equal(result.active, false);
  assert.equal(operation.canFire(), false);
});

test('beginner operation stays completable if the practice shot eliminates its target', () => {
  const operation = shared.createOperation();
  operation.start({ destination: { x: 4, z: 2, radius: 1 }, yaw: 0, pitch: 0 });
  operation.update({ x: 4, z: 2, yaw: 0, pitch: 0 });
  operation.update({ x: 4, z: 2, yaw: 0.23, pitch: 0 });
  operation.update({ x: 4, z: 2, yaw: 0.23, pitch: 0, aimed: true });
  assert.equal(operation.snapshot().step, 'fire');
  operation.shot();
  assert.equal(operation.snapshot().step, 'reload');
  operation.eliminated(); // First target falls before the final objective.
  assert.equal(operation.snapshot().step, 'reload');
  operation.reloadStarted();
  operation.reloadFinished();
  assert.equal(operation.snapshot().step, 'objective');
  const result = operation.eliminated();
  assert.equal(result.complete, true);
  assert.equal(result.active, false);
  for (const asset of assets) {
    const html = fs.readFileSync(asset.htmlPath, 'utf8');
    assert.match(html, /R\.mode = 'tactical'; R\.diff = 'recruit'; R\.bots = 2; R\.mates = 0/,
      `${asset.tree} supplies a remaining Recruit target if the practice shot is lethal`);
    assert.match(html, /Two Recruit hostiles are your targets/,
      `${asset.tree} explains why the operation begins with two targets`);
  }
});

test('optional goals rotate and persist without altering match-record storage', () => {
  const values = new Map([['sightline-record', '{"matches":8,"kills":42}']]);
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); }
  };
  const first = shared.resolveOptionalGoal(storage, { hs: 3 }, 9);
  assert.equal(first.completed, true);
  assert.equal(first.goal.id, 'headshots');
  assert.equal(first.next.id, 'hits');
  assert.equal(JSON.parse(values.get('sightline-record')).matches, 8);
  const next = shared.resolveOptionalGoal(storage, { hits: 10 }, 9);
  assert.equal(next.completed, true);
  assert.equal(next.goal.id, 'hits');
  assert.equal(next.next.id, 'eliminations');
  const incomplete = shared.resolveOptionalGoal(storage, { kills: 2 }, 10);
  assert.equal(incomplete.goal.id, 'eliminations');
  assert.equal(incomplete.completed, false);
  assert.equal(incomplete.value, 2);
});

test('beginner operation replay returns from match end to idle before starting again', () => {
  for (const asset of assets) {
    const html = fs.readFileSync(asset.htmlPath, 'utf8');
    assert.match(html, /if \(beginnerResultShowing\) \{ quitToMenu\(\); startBeginnerOperation\(\); \} else startMatch\(\);/,
      `${asset.tree} must clear the completed match state before replay`);
    assert.match(html, /function startBeginnerOperation\(\) \{\s*if \(state !== 'idle'/,
      `${asset.tree} keeps the safe idle-only start guard`);
  }
});

test('Android offline and phone-host HTML share the prototype and protect normal/LAN flows', () => {
  const scripts = [];
  for (const asset of assets) {
    const html = fs.readFileSync(asset.htmlPath, 'utf8');
    const module = fs.readFileSync(asset.modulePath, 'utf8');
    assert.match(html, /<script src="engagement-prototypes\.js"><\/script>/, `${asset.tree} loads the shared module`);
    assert.match(html, /id="beginner-operation-card"/);
    assert.match(html, /id="optional-goal-summary"/);
    assert.match(html, /data-beginner-operation/);
    assert.match(html, /function startBeginnerOperation\(\)[\s\S]*?MP\.on \|\| mpConnected\(\) \|\| MP\.sock \|\| MP\.id \|\| MP\.retryT/);
    assert.match(html, /function startBeginnerOperation\(\)[\s\S]*?R\.mode = 'tactical'; R\.diff = 'recruit'; R\.bots = 2/);
    assert.match(html, /function startBeginnerOperation\(\)[\s\S]*?owned\.carbine = true; cur = 'carbine'/);
    assert.match(html, /function tryFire\(edge\)[\s\S]*?beginnerRun && !beginnerOperation\.canFire\(\)/);
    assert.match(html, /function endMatch\(\)[\s\S]*?if \(beginnerRun\) \{ finishBeginnerOperation\(\); return; \}/);
    assert.match(html, /function quitToMenu\(\)[\s\S]*?beginnerOperation\.cancel\(\)[\s\S]*?restoreBeginnerRules\(\)/);
    assert.match(html, /function showOptionalGoalSummary\(won, s, mode\)[\s\S]*?resolveOptionalGoal/);
    assert.match(html, /\['tactical'.*?'ffa'.*?'bomb'.*?'outbreak'.*?'infection'/s);
    assert.equal(module, fs.readFileSync(assets[0].modulePath, 'utf8'), 'both runtime copies use identical helper code');
    const modulePos = html.indexOf('<script src="engagement-prototypes.js"></script>');
    const scriptStart = html.indexOf('<script>', modulePos);
    const scriptEnd = html.indexOf('</script>', scriptStart);
    assert.ok(scriptStart >= 0 && scriptEnd > scriptStart, `${asset.tree} main script is present`);
    new vm.Script(html.slice(scriptStart + '<script>'.length, scriptEnd), { filename: `${asset.tree}/index.inline.js` });
    scripts.push(module);
  }
  assert.equal(scripts[0], scripts[1]);
});

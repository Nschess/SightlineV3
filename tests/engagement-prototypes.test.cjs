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

test('beginner operation teaches one reload step until the magazine is full', () => {
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
  assert.equal(operation.snapshot().step, 'reload');
  assert.match(operation.snapshot().hint, /magazine is full/);
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
  assert.equal(first.completedCount, 1);
  assert.equal(first.goal.id, 'headshots');
  assert.equal(first.next.id, 'hits');
  assert.equal(JSON.parse(values.get('sightline-record')).matches, 8);
  const next = shared.resolveOptionalGoal(storage, { hits: 10 }, 9);
  assert.equal(next.completed, true);
  assert.equal(next.completedCount, 2);
  assert.equal(next.goal.id, 'hits');
  assert.equal(next.next.id, 'eliminations');
  const incomplete = shared.resolveOptionalGoal(storage, { kills: 2 }, 10);
  assert.equal(incomplete.goal.id, 'eliminations');
  assert.equal(incomplete.completed, false);
  assert.equal(incomplete.value, 2);
  assert.equal(incomplete.completedCount, 2);
});

test('optional-goal save data rejects unsafe lifetime counts and recovers from match history', () => {
  const values = new Map([[shared.goalKey, '{"version":1,"index":0,"completed":1e100}']]);
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); }
  };
  const recovered = shared.resolveOptionalGoal(storage, {}, 2);
  assert.equal(recovered.goal.id, 'eliminations');
  assert.equal(recovered.completedCount, 0);
  assert.deepEqual(JSON.parse(values.get(shared.goalKey)), { version: 1, index: 2, completed: 0 });

  values.set(shared.goalKey, '{"version":1,"index":0,"completed":9007199254740991}');
  const saturated = shared.resolveOptionalGoal(storage, { hs: 3 }, 2);
  assert.equal(saturated.completedCount, 9007199254740991);
  assert.equal(Number.isSafeInteger(JSON.parse(values.get(shared.goalKey)).completed), true);
});

test('post-match feedback identifies new personal kill and accuracy records', () => {
  const prior = { kills: 5, acc: 72 };
  assert.deepEqual(shared.comparePersonalRecords(prior, { kills: 7, shots: 10, hits: 8 }), {
    kills: 7, accuracy: 80, newKillsBest: true, newAccuracyBest: true
  });
  assert.deepEqual(shared.comparePersonalRecords(prior, { kills: 5, shots: 10, hits: 7 }), {
    kills: 5, accuracy: 70, newKillsBest: false, newAccuracyBest: false
  });
  assert.deepEqual(shared.comparePersonalRecords(prior, { kills: 6, shots: 0, hits: 0 }), {
    kills: 6, accuracy: 0, newKillsBest: true, newAccuracyBest: false
  });
  assert.deepEqual(prior, { kills: 5, acc: 72 }, 'record comparison does not mutate saved state');
  for (const asset of assets) {
    const html = fs.readFileSync(asset.htmlPath, 'utf8');
    assert.match(html, /var personal = window\.SightlineEngagement\.comparePersonalRecords\(b, s\)/,
      `${asset.tree} compares the match against existing browser records`);
    assert.match(html, /Personal best · /,
      `${asset.tree} announces new records in the existing result summary`);
    assert.match(html, /Challenges cleared: /,
      `${asset.tree} displays the existing locally saved challenge completion total`);
    assert.match(html, /var personal = recordMatch\(won, s\); showOptionalGoalSummary\(won,s,R\.mode,personal\)/,
      `${asset.tree} connects new records to the existing post-match panel`);
  }
  assert.match(fs.readFileSync(assets[0].htmlPath, 'utf8'), /showOptionalGoalSummary\(ffaWinner===-1,s,'ffa',ffaPersonal\)/,
    'offline FFA results also show new personal records');
});

test('saved match records coerce malformed history to safe dashboard values', () => {
  const normalized = shared.normalizeMatchRecords(JSON.parse(JSON.stringify({
    matches: '<img src=x onerror=alert(1)>', kills: -4, acc: 180, wins: 3.5,
    tk: Number.MAX_SAFE_INTEGER + 1, hist: [null, [], {
      m: '<svg onload=alert(1)>', o: { invalid: true }, w: 'true', y: '<b>2</b>', b: -1,
      k: 9007199254740992, d: 2, f: 'A'.repeat(40)
    }]
  })));
  assert.deepEqual(normalized, {
    matches: 0, kills: 0, acc: 100, wins: 0, tk: 0, td: 0, ths: 0, tsh: 0, thi: 0, rounds: 0,
    hist: [{ m: '<svg onload=alert(1)>', o: '', w: false, y: 0, b: 0, k: 0, d: 2, f: 'A'.repeat(32) }]
  });
  for (const asset of assets) {
    const html = fs.readFileSync(asset.htmlPath, 'utf8');
    assert.match(html, /function renderBest\(\) \{\s*var b = window\.SightlineEngagement\.normalizeMatchRecords\(loadBest\(\)\)/,
      `${asset.tree} normalizes data before rendering personal records`);
    assert.match(html, /function recObj\(\) \{ return window\.SightlineEngagement\.normalizeMatchRecords\(loadBest\(\)\); \}/,
      `${asset.tree} normalizes data before history templates interpolate it`);
    assert.match(html, /esc\(x\.m\).*esc\(x\.o\).*esc\(x\.f\)/,
      `${asset.tree} escapes stored history labels in the dashboard template`);
  }
});

test('career record counters saturate instead of overflowing safe integer precision', () => {
  assert.equal(shared.addSafeCount(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER);
  assert.equal(shared.addSafeCount(Number.MAX_SAFE_INTEGER - 2, 2), Number.MAX_SAFE_INTEGER);
  assert.equal(shared.addSafeCount(12, 4), 16);
  assert.equal(shared.addSafeCount(-1, 4), 4);
  for (const asset of assets) {
    const html = fs.readFileSync(asset.htmlPath, 'utf8');
    assert.match(html, /b\.matches = window\.SightlineEngagement\.addSafeCount\(b\.matches, 1\)/,
      `${asset.tree} saturates lifetime match count`);
    assert.match(html, /b\.rounds = window\.SightlineEngagement\.addSafeCount\(b\.rounds, M\.round\)/,
      `${asset.tree} saturates lifetime round count`);
  }
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

test('tutorial skip keeps a 44px touch target on narrow and short landscape layouts', () => {
  for (const asset of assets) {
    const html = fs.readFileSync(asset.htmlPath, 'utf8');
    assert.match(html, /@media\(max-width:760px\), \(max-height:520px\) and \(orientation:landscape\) \{[\s\S]*?#beginner-operation-skip \{ min-height:44px; \}/,
      `${asset.tree} must preserve the minimum touch height in compressed mobile layouts`);
  }
});

test('repeated offline match completion records results and advances the goal only once', () => {
  const html = fs.readFileSync(assets[0].htmlPath, 'utf8');
  const start = html.indexOf('function endMatch() {');
  const end = html.indexOf('\nfunction pause()', start);
  assert.ok(start >= 0 && end > start, 'the offline match-end function is present');
  const source = html.slice(start, end);
  assert.match(source, /^function endMatch\(\) \{\s*if \(state === 'matchend'\) return;/,
    'completed matches must stop before changing saved records or goals');

  const calls = { records: 0, goals: 0, overlays: 0 };
  const elements = new Map();
  const context = vm.createContext({
    state: 'roundend', beginnerRun: false,
    MP: { on: false }, OB: { inf: false }, R: { mode: 'tactical' },
    M: { you: 2, bots: 0, round: 3, stats: { shots: 4, hits: 3, hs: 1, kills: 2, deaths: 0 } },
    ME: { team: 0 }, TEAMS: [{ name: 'Blue' }, { name: 'Red' }],
    el: { hud: {}, scope: {}, ret: {} },
    $: (selector) => {
      if (!elements.has(selector)) elements.set(selector, { hidden: false, textContent: '', innerHTML: '' });
      return elements.get(selector);
    },
    exitLock() {}, resetTouchMotion() {}, foeTeam: () => ({ name: 'Red' }),
    recordMatch() { calls.records += 1; return {}; },
    showOptionalGoalSummary() { calls.goals += 1; },
    showOverlay() { calls.overlays += 1; }
  });
  vm.runInContext(source + '\nendMatch(); endMatch();', context, { filename: 'www/endMatch.test.js' });
  assert.deepEqual(calls, { records: 1, goals: 1, overlays: 1 });
  assert.equal(context.state, 'matchend');
  for (const asset of assets) {
    const mirrored = fs.readFileSync(asset.htmlPath, 'utf8');
    assert.match(mirrored, /function endMatch\(\) \{\s*if \(state === 'matchend'\) return;/,
      `${asset.tree} ignores repeated offline completion after results are recorded`);
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
    assert.doesNotMatch(module, /reload-finish/);
    assert.match(module, /reloadFinished: function \(\) \{ if \(active && OP_STEPS\[index\]\.id === 'reload'\) return advance\(\);/);
    assert.match(html, /data-beginner-operation/);
    assert.match(html, /function startBeginnerOperation\(\)[\s\S]*?MP\.on \|\| mpConnected\(\) \|\| MP\.sock \|\| MP\.id \|\| MP\.retryT/);
    assert.match(html, /function startBeginnerOperation\(\)[\s\S]*?R\.mode = 'tactical'; R\.diff = 'recruit'; R\.bots = 2/);
    assert.match(html, /function startBeginnerOperation\(\)[\s\S]*?owned\.carbine = true; cur = 'carbine'/);
    assert.match(html, /function tryFire\(edge\)[\s\S]*?beginnerRun && !beginnerOperation\.canFire\(\)/);
    assert.match(html, /function endMatch\(\)[\s\S]*?if \(beginnerRun\) \{ finishBeginnerOperation\(\); return; \}/);
    assert.match(html, /function quitToMenu\(\)[\s\S]*?beginnerOperation\.cancel\(\)[\s\S]*?restoreBeginnerRules\(\)/);
    assert.match(html, /function showOptionalGoalSummary\(won, s, mode, personal\)[\s\S]*?resolveOptionalGoal/);
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

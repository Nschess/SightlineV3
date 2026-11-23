const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const phonePath = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/character-realism-v12.js');
const wwwPath = path.join(root, 'AndroidProject/app/src/main/assets/www/character-realism-v12.js');
const source = fs.readFileSync(phonePath, 'utf8');
const exportMarker = "global.SightlineClaudeCharacterV128 = { bake: bake, designFor: designFor, version: '12.8', setQuality: function (v) { QUALITY = v; } };";
assert.ok(source.includes(exportMarker), 'builder test hook insertion point must exist');
const instrumented = source.replace(exportMarker,
  "global.__characterTestHooks = { designFor: designFor, zombieDesign: zombieDesign, makeHead: makeHead, buildBody: buildBody, buildZombie: buildZombie, paintFactionWeave: paintFactionWeave };\n  " + exportMarker);
const sandbox = {};
sandbox.window = sandbox;
vm.runInNewContext(instrumented, sandbox, { filename: 'character-realism-v12.js', timeout: 3000 });
const hooks = sandbox.__characterTestHooks;

function operator(team, id) {
  return {
    id,
    name: 'QA ' + team,
    real: 'QA Operator',
    team,
    role: team === 'blue' ? 'Support' : 'Support',
    skin: '#a87b5f', hair: '#332a22',
    uni: team === 'blue' ? ['#45584c', '#37483e', '#657360', '#24332c'] : ['#4e3830', '#382824', '#755245', '#241a18'],
    vest: team === 'blue' ? '#3b4940' : '#45352d', gear: team === 'blue' ? '#37453d' : '#342923',
    head: 'helmet', face: 'bare'
  };
}

function human(team, id, q) {
  const op = operator(team, id);
  const D = hooks.designFor(op);
  const Hd = hooks.makeHead(D);
  const body = hooks.buildBody(D, q, Hd);
  return { D, body, right: D._armBuilders.right, left: D._armBuilders.left };
}

function infected(type, id, q) {
  const op = { id, zombie: true, ztype: type, skin: '#8b6652', uni: ['#413b33', '#332d28', '#665448', '#231e1a'] };
  const D = hooks.zombieDesign(op);
  return { D, ...hooks.buildZombie(D, q) };
}

function occurrences(mesh, tag) { return mesh.tag.filter((value) => value === tag).length; }
function assertFiniteBuilder(mesh) {
  assert.equal(mesh.P.length, mesh.count() * 3);
  assert.equal(mesh.N.length, mesh.P.length);
  assert.equal(mesh.U.length, mesh.count() * 2);
  assert.equal(mesh.C.length, mesh.P.length);
  assert.equal(mesh.tag.length, mesh.count());
  for (const value of mesh.P.concat(mesh.N, mesh.U, mesh.C)) assert.ok(Number.isFinite(value));
  for (let i = 0; i < mesh.N.length; i += 3) {
    const length = Math.hypot(mesh.N[i], mesh.N[i + 1], mesh.N[i + 2]);
    assert.ok(length > .5 && length < 1.5, 'builder normals remain nonzero and normalized');
  }
  for (const index of mesh.I) assert.ok(Number.isInteger(index) && index >= 0 && index < mesh.count());
}

test('Tidewatch and Cinder Pact have distinct original cloth and insignia traces', () => {
  assert.match(source, /paintCloth\(g, D\.camo, D\.uni, rnd\); paintFactionWeave\(g, D\);/,
    'the faction pattern must be part of the actual atlas build path');
  function trace(D) {
    const strokes = [];
    let current = [];
    const g = {
      save() {}, restore() {}, beginPath() { current = []; }, rect() {}, clip() {},
      moveTo(x, y) { current.push(['M', x, y]); }, lineTo(x, y) { current.push(['L', x, y]); },
      stroke() { strokes.push({ style: this.strokeStyle, width: this.lineWidth, path: current.slice() }); }
    };
    hooks.paintFactionWeave(g, D);
    return strokes;
  }
  const tide = human('blue', 'qa-tidewatch', .55);
  const cinder = human('red', 'qa-cinder', .55);
  const blueA = trace(tide.D), blueB = trace(tide.D), red = trace(cinder.D);
  assert.deepEqual(blueA, blueB, 'procedural marks must be deterministic for a fixed character seed');
  assert.notDeepEqual(blueA.map((s) => s.path), red.map((s) => s.path), 'faction weave signatures must differ');
  assert.ok(blueA.length >= 8 && red.length >= 20);
  assert.equal(occurrences(tide.body, 'tidewatchInsigniaMark'), 72);
  assert.equal(occurrences(cinder.body, 'cinderPactInsigniaMark'), 48);
  assert.ok(!occurrences(tide.body, 'cinderPactInsigniaMark'));
  assert.ok(!occurrences(cinder.body, 'tidewatchInsigniaMark'));
});

test('Tidewatch helmet crown rails and paired shoulder caps are faction-only and low-cost', () => {
  const tide = human('blue', 'qa-tidewatch-geometry', .55);
  const cinder = human('red', 'qa-cinder-geometry', .55);
  assert.ok(occurrences(tide.body, 'tidewatchCrownRail') > 0);
  assert.ok(occurrences(tide.right, 'tidewatchShoulderCap') > 0);
  assert.ok(occurrences(tide.left, 'tidewatchShoulderCap') > 0);
  assert.ok(!occurrences(cinder.body, 'tidewatchCrownRail'));
  assert.ok(!occurrences(cinder.left, 'tidewatchShoulderCap'));
  assert.ok(!occurrences(cinder.right, 'tidewatchShoulderCap'));
  for (const mesh of [tide.body, tide.right, tide.left, cinder.body, cinder.right, cinder.left]) assertFiniteBuilder(mesh);
  const added = occurrences(tide.body, 'tidewatchCrownRail') + occurrences(tide.right, 'tidewatchShoulderCap') + occurrences(tide.right, 'tidewatchShoulderIndex') + occurrences(tide.left, 'tidewatchShoulderCap') + occurrences(tide.left, 'tidewatchShoulderIndex');
  assert.ok(added < 500, 'Tidewatch silhouette details stay below 500 added vertices per character');
  assert.match(source, /arm\(1, \[\.222, 1\.205, -\.36\], \[\.55, -1, \.45\]\); armBuilders\.right = mb;/);
  assert.match(source, /arm\(-1, \[\.152, 1\.268, -\.468\], \[-\.55, -1, \.1\]\); armBuilders\.left = mb;/);
  process.stdout.write('Tidewatch tagged detail vertices: ' + added + '\n');
});

test('Cinder asymmetric mantle exists on the left rig only without changing arm anchors', () => {
  const cinder = human('red', 'qa-cinder-mantle', .55);
  assert.ok(occurrences(cinder.left, 'cinderAsymmetricShoulderMantle') > 0);
  assert.ok(occurrences(cinder.left, 'cinderShoulderIndex') > 0);
  assert.equal(occurrences(cinder.right, 'cinderAsymmetricShoulderMantle'), 0);
  assert.equal(occurrences(cinder.right, 'cinderShoulderIndex'), 0);
  assertFiniteBuilder(cinder.left); assertFiniteBuilder(cinder.right); assertFiniteBuilder(cinder.body);
  const armScale = cinder.D.build.arm * 1.22 * (cinder.D.build.bulk > 1.1 ? 1.08 : 1);
  const shoulder = cinder.D._armAnchors[-1];
  const mantleCenterInsideShoulder = Math.hypot(.004 * armScale / (.06 * armScale), .044 * armScale / (.06 * armScale));
  assert.ok(mantleCenterInsideShoulder < 1, 'mantle center intersects the existing shoulder volume');
  const capY = cinder.left.tag.flatMap((tag, i) => tag === 'cinderAsymmetricShoulderMantle' ? [cinder.left.P[i * 3 + 1]] : []);
  assert.ok(Math.max(...capY) - shoulder[1] < .05 * armScale, 'mantle remains within the existing shoulder envelope');
  const mantleVertices = occurrences(cinder.left, 'cinderAsymmetricShoulderMantle') + occurrences(cinder.left, 'cinderShoulderIndex') + occurrences(cinder.body, 'cinderPactInsigniaMark');
  assert.ok(mantleVertices < 250, 'Cinder shoulder and insignia details remain compact');
  process.stdout.write('Cinder tagged detail vertices: ' + mantleVertices + '\n');
});

test('Hollowed walker spur and spitter throat anatomy are type-exclusive and finite', () => {
  const walker = infected('walker', 'qa-hollowed-walker', .35);
  const spitter = infected('spitter', 'qa-hollowed-spitter', .85);
  const brute = infected('brute', 'qa-hollowed-brute', .55);
  assert.ok(occurrences(walker.body, 'hollowedWalkerScapularSpur') > 0);
  assert.equal(occurrences(spitter.body, 'hollowedWalkerScapularSpur'), 0);
  assert.equal(occurrences(brute.body, 'hollowedWalkerScapularSpur'), 0);
  assert.ok(occurrences(spitter.body, 'hollowedSpitterThroatGland') > 0);
  assert.ok(occurrences(spitter.body, 'hollowedSpitterDuct') > 0);
  assert.equal(occurrences(spitter.body, 'hollowedSpitterThroatGland') % 2, 0);
  assert.equal(occurrences(spitter.body, 'hollowedSpitterDuct') % 2, 0);
  assert.equal(occurrences(walker.body, 'hollowedSpitterThroatGland'), 0);
  for (const mesh of [walker.body, walker.legR, walker.legL, spitter.body, spitter.legR, spitter.legL, brute.body]) assertFiniteBuilder(mesh);
  const spurYs = walker.body.tag.flatMap((tag, i) => tag === 'hollowedWalkerScapularSpur' ? [walker.body.P[i * 3 + 1]] : []);
  const bodyYs = walker.body.P.filter((_v, i) => i % 3 === 1);
  assert.ok(Math.max(...spurYs) < 1.8 && Math.min(...spurYs) > 1.0, 'scapular spur remains localized to the upper torso after lean deformation');
  assert.ok(Math.max(...bodyYs) < 2.3 && Math.min(...bodyYs) > -.1, 'zombie body stays inside the production bake sanity envelope');
  const infectedDetails = occurrences(walker.body, 'hollowedWalkerScapularSpur') + occurrences(spitter.body, 'hollowedSpitterThroatGland') + occurrences(spitter.body, 'hollowedSpitterDuct');
  assert.ok(infectedDetails < 250, 'type-specific Hollowed details remain compact');
  process.stdout.write('Hollowed tagged detail vertices (walker + spitter): ' + infectedDetails + '\n');
});

test('mobile and high quality builder settings keep faction geometry finite and bounded', () => {
  for (const q of [.35, .85]) {
    const tide = human('blue', 'qa-tidewatch-quality-' + q, q);
    for (const mesh of [tide.body, tide.right, tide.left]) assertFiniteBuilder(mesh);
    const tagged = occurrences(tide.body, 'tidewatchCrownRail') + occurrences(tide.right, 'tidewatchShoulderCap') + occurrences(tide.left, 'tidewatchShoulderCap');
    assert.ok(tagged > 0 && tagged < 300);
  }
});

test('Android character-builder copies are byte-identical', () => {
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(hash(phonePath), hash(wwwPath));
});

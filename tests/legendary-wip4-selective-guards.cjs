'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets');
const packSource = fs.readFileSync(path.join(assets, 'phone-host', 'legendary-packs.js'), 'utf8');
const pages = ['www', 'phone-host'].map(name => ({
  name,
  source: fs.readFileSync(path.join(assets, name, 'index.html'), 'utf8')
}));

function block(source, expression, label) {
  const match = source.match(expression);
  assert.ok(match, `${label} function not found`);
  return match[0];
}

for (const page of pages) {
  const shotRoute = block(page.source,
    /var legendAudioRouteFailures=Object\.create\(null\);\s*function playWeaponShotAudio\([\s\S]*?\n\}/,
    `${page.name}: Legendary shot audio route`);
  const warm = block(page.source,
    /var legendPackWarmPending=Object\.create\(null\);\s*function legendWarmPackAudio\(key\)\{[\s\S]*?\n\}/,
    `${page.name}: audio prewarm`);
  const elimination = block(page.source,
    /function legendaryPackElimination\(key,pos,from\)\{[\s\S]*?\n\}/,
    `${page.name}: elimination guard`);
  const sharedWarm = block(packSource,
    /function warm\(pack\)\s*\{[\s\S]*?\n\}/,
    'shared audio warm helper');

  const timers = [];
  let fireBuilds = 0;
  let fxFactories = 0;
  const warmMethods = { hitSound: 0, killSound: 0, rearmSound: 0, reloadSound: 0, equipSound: 0 };
  let lowSetting = null;
  let eliminations = 0;
  const pack = {};
  for (const name of Object.keys(warmMethods)) pack[name] = () => { warmMethods[name]++; };
  const fx = {
    setLow(value) { lowSetting = value; },
    eliminate() { eliminations++; }
  };
  const context = {
    AC: { sampleRate: 48000 },
    G: { fx: 'high' },
    window: {},
    legendAudioBuffers: Object.create(null),
    legendaryPackForAudio() { return pack; },
    legendaryPackFx() { fxFactories++; return fx; },
    legendAudioBuffer(key, event, variant) {
      assert.equal(key, 'hawk');
      assert.equal(event, 'fire');
      assert.equal(variant, 0);
      fireBuilds++;
    },
    setTimeout(callback) { timers.push(callback); }
  };
  context.global = context;
  vm.runInNewContext(`${sharedWarm}\nwindow.SightlineLegendaryAudio={warm:warm};\n${warm}\n${elimination}`, context, { filename: `${page.name}-guards.js` });

  context.legendWarmPackAudio('hawk');
  context.legendWarmPackAudio('hawk');
  while (timers.length) timers.shift()();
  assert.equal(fireBuilds, 1, `${page.name}: fire cue did not prewarm exactly once`);
  assert.equal(pack.__warm, 1, `${page.name}: shared cue warm was not memoized`);
  for (const [name, count] of Object.entries(warmMethods)) assert.equal(count, 1, `${page.name}: ${name} should warm once`);

  pack.hasEliminationFx = false;
  pack.createFx = true;
  assert.equal(context.legendaryPackElimination('hawk', {}, {}), false);
  assert.equal(fxFactories, 0, `${page.name}: disabled pack allocated elimination FX`);

  pack.hasEliminationFx = true;
  assert.equal(context.legendaryPackElimination('hawk', {}, {}), true);
  assert.equal(fxFactories, 1);
  assert.equal(lowSetting, false);
  assert.equal(eliminations, 1);

  // A malformed optional skin generator must not interrupt the real fire path
  // before legendFire() dispatches its viewmodel animation and muzzle effects.
  const shotFallbacks = [];
  const warnings = [];
  const shotContext = vm.createContext({
    Object,
    console: { warn(...args) { warnings.push(args); } },
    legendAudioRouteFailures: Object.create(null),
    hasLegendaryAudio() { return true; },
    legendAudioEvent() { throw new Error('injected pack synthesis failure'); },
    sfxShot(...args) { shotFallbacks.push(args); }
  });
  vm.runInContext(`${shotRoute}\nglobalThis.__play=playWeaponShotAudio;`, shotContext, { filename: `${page.name}-shot-route.js` });
  assert.doesNotThrow(() => shotContext.__play('hawk', 1, -.25, true, 1, 4), `${page.name}: pack-audio exception escaped firing route`);
  assert.deepEqual(shotFallbacks, [['hawk', 1, -.25]], `${page.name}: failed Legendary cue did not play the factory fallback`);
  assert.equal(warnings.length, 1, `${page.name}: first audio failure should be diagnosable`);
  shotContext.__play('hawk', 1, -.25, true, 1, 4);
  assert.equal(warnings.length, 1, `${page.name}: repeated failures should not spam the console`);
  assert.equal(shotFallbacks.length, 2, `${page.name}: subsequent failed cues should keep factory audio available`);
  shotContext.legendAudioEvent = () => function cancelQueuedCue() {};
  shotFallbacks.length = 0;
  assert.equal(shotContext.__play('hawk', 1, -.25, true, 1, 4), true, `${page.name}: successful Legendary route should be retained`);
  assert.equal(shotFallbacks.length, 0, `${page.name}: successful Legendary route should replace factory audio`);
  shotContext.legendAudioEvent = () => null;
  assert.equal(shotContext.__play('hawk', 1, -.25, true, 1, 4), false, `${page.name}: unavailable cue should report factory fallback`);
  assert.equal(shotFallbacks.length, 1, `${page.name}: unavailable cue should use factory audio`);

  const fireCall = page.source.slice(page.source.indexOf('function tryFire(edge)'), page.source.indexOf('function hurtPlayer(', page.source.indexOf('function tryFire(edge)')));
  assert.match(fireCall, /playWeaponShotAudio\(cur,1,0,true,1,4\);legendFire\(gun,mp,end,legendHit\)/,
    `${page.name}: audio fallback guard must precede the skin-specific fire animation dispatch`);
  console.log(`PASS ${page.name}: audio-failure fallback, deduplicated prewarm, and kill-FX eligibility guard`);
}

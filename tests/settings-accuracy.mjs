import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'AndroidProject/app/src/main/assets');
const host = fs.readFileSync(path.join(base, 'phone-host/index.html'), 'utf8');
const offline = fs.readFileSync(path.join(base, 'www/index.html'), 'utf8');
// Offline and phone-host entrypoints intentionally differ in route metadata,
// server code, and supported maps. Compare the shared settings schema instead
// of requiring the entire production pages to be byte-identical.
function settingsSchema(page) {
  const start = page.indexOf('var SPEC = {');
  const end = page.indexOf('var SET_TABS =', start);
  assert.ok(start >= 0 && end > start, 'settings schema must exist in both entrypoints');
  return page.slice(start, end);
}
assert.equal(settingsSchema(host), settingsSchema(offline), 'Offline and phone-host settings definitions must match');
for (const [name, page] of [['phone-host', host], ['offline', offline]]) {
  assert.match(page, /role="tablist" aria-label="Settings category"/, name + ' exposes accessible Settings categories');
  assert.match(page, /var SET_TABS = \[\['video', 'Graphics'\], \['audio', 'Audio'\], \['controls', 'Controls'\], \['play', 'Gameplay'\], \['network', 'Network'\]\]/, name + ' exposes the five real settings groups');
}

assert.match(host, /l: 'Fog horizon', h: 'Changes map fog range only\. It does not cull distant geometry or reduce draw calls\.'/);
assert.match(host, /Quality preset',[\s\S]{0,100}fog horizon[\s\S]{0,100}pixel budget can cap the actual internal resolution/);
assert.match(host, /data-act="p1157-clear">Balanced · 60 FPS cap/);
assert.match(host, /A cap does not guarantee the device can sustain 60 FPS/);
assert.match(host, /l: 'Adaptive quality',[\s\S]{0,360}pixel budget may cap output resolution further/);
assert.match(host, /selectedRenderScalePercent:[\s\S]*adaptiveScalePercent:[\s\S]*effectiveRenderScalePercent:[\s\S]*pixelBudgetLimited:/);
const specStart = host.indexOf('var SPEC = {');
const specEnd = host.indexOf('var SET_TABS =', specStart);
assert.ok(specStart >= 0 && specEnd > specStart, 'settings schema must exist');
const settingKeys = new Set(Array.from(host.slice(specStart, specEnd).matchAll(/k:\s*'([^']+)'/g), m => m[1]));
assert.equal(settingKeys.size, 55, 'unexpected count of exposed settings keys; audit changed');
const noRuntimeReference = Array.from(settingKeys).filter(k => !['G.', 'S.', 'R.'].some(prefix => host.includes(prefix + k)));
assert.deepEqual(noRuntimeReference, [], 'settings with no direct runtime consumer must be identified');

const start = host.indexOf('function framePixelBudget()');
const end = host.indexOf('function fail(msg)', start);
assert.ok(start >= 0 && end > start, 'actual pixel-budget implementation must exist');
const code = host.slice(start, end);
function scale({ width, height, dpr, touch, adaptive = true, fast = false, cap = 60, selected = 100, perf = 1 }) {
  const c = {
    Math, Number,
    window: { devicePixelRatio: dpr, innerWidth: width, innerHeight: height },
    stage: { clientWidth: width, clientHeight: height },
    G: { renderScale: selected, adaptive, fastMode: fast, fpsCap: cap },
    touchMode: touch, perfScale: perf, rafHzBest: 60
  };
  vm.createContext(c);
  vm.runInContext(code, c);
  return { pixelRatio: c.pixelRatio(), budget: c.framePixelBudget() };
}

const normal = scale({ width: 1920, height: 1080, dpr: 1, touch: false });
assert.equal(normal.pixelRatio, 1, 'standard desktop DPR stays at native scale');
const constrainedPhone = scale({ width: 1080, height: 2400, dpr: 3, touch: true });
assert.ok(constrainedPhone.budget <= 1_050_000, 'touch framebuffer obeys the configured pixel budget');
assert.ok(constrainedPhone.pixelRatio < 1.5, 'high-DPI phone reports the pixel-budget clamp, not the requested 100%');
const fastPhone = scale({ width: 1080, height: 2400, dpr: 3, touch: true, fast: true });
assert.equal(fastPhone.budget, 600_000, 'explicit fast fallback applies its advertised touch pixel budget');
assert.ok(fastPhone.pixelRatio < constrainedPhone.pixelRatio, 'fast fallback lowers actual internal resolution');

const loadStart = host.indexOf('function loadObj(key, def)');
const loadEnd = host.indexOf('function saveObj(key, o)', loadStart);
assert.ok(loadStart >= 0 && loadEnd > loadStart, 'actual settings persistence loader must exist');
const persisted = { renderScale: 85, drawDist: 120, adaptive: false, fpsCap: 'bad', unknownOption: true };
const loadCtx = { Object, JSON, localStorage: { getItem: () => JSON.stringify(persisted) } };
vm.createContext(loadCtx);
vm.runInContext(host.slice(loadStart, loadEnd), loadCtx);
const loaded = loadCtx.loadObj('sightline.settings.v1', { renderScale: 100, drawDist: 100, adaptive: true, fpsCap: 60 });
assert.equal(loaded.renderScale, 85, 'saved video settings persist');
assert.equal(loaded.drawDist, 120, 'saved fog horizon setting persists');
assert.equal(loaded.fpsCap, 60, 'malformed setting type safely falls back to default');
assert.equal(Object.hasOwn(loaded, 'unknownOption'), false, 'unknown obsolete settings are ignored');

const pStart = host.indexOf('function performanceInfo()');
const pEnd = host.indexOf('\nif (window.__sl)', pStart);
assert.ok(pStart >= 0 && pEnd > pStart, 'performance report function must exist');
const ctx = {
  Math, Number, G: { renderScale: 100, fpsCap: 60, fastMode: false, adaptive: true, shadows: 'low' },
  window: { devicePixelRatio: 3 }, touchMode: true,
  pixelRatio: () => constrainedPhone.pixelRatio,
  perfScale: 1, fpsMeasured: 60, rafHz: 60, rafHzBest: 60, rafCount: 96,
  frameBudgetMs: () => 16.67, state: 'live', navigator: { userAgent: 'settings-test' },
  frameStats: { p95: 16.7, p99: 17, renderCpuMs: 2, drawCalls: 10, triangles: 1000, samples: 100 },
  simCpuEma: 2, botCpuEma: 1, playerCpuEma: 1, effectsCpuEma: 0.2,
  MP: { on: false }, units: [], effectiveRenderCap: () => 60, menuFrameCap: () => 60,
  framePixelBudget: () => constrainedPhone.budget, effectiveShadowTier: () => 'off', renderer: { shadowMap: { enabled: false } },
  sun: { shadow: { mapSize: { x: 0 } } }, perfLvl: 0, lastLivePerf: null, stage: { clientWidth: 1080, clientHeight: 2400 }
};
vm.createContext(ctx);
vm.runInContext(host.slice(pStart, pEnd), ctx);
const report = ctx.performanceInfo();
assert.equal(report.selectedRenderScalePercent, 100);
assert.equal(report.adaptiveScalePercent, 100);
assert.equal(report.pixelBudgetLimited, true);
assert.ok(report.effectiveRenderScalePercent < report.selectedRenderScalePercent);
assert.ok(Math.abs(report.framebufferPixels - Math.round(1080 * 2400 * constrainedPhone.pixelRatio ** 2)) <= 1);

console.log(JSON.stringify({ pass: true, checks: 26, settingsKeysAudited: settingKeys.size, phoneHostOfflineParity: true, settingsPersistence: true, highDpiPixelBudgetClamp: constrainedPhone, fastFallback: fastPhone, reportScalePercent: report.effectiveRenderScalePercent }, null, 2));

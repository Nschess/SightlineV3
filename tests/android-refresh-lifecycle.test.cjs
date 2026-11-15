'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../AndroidProject/app/src/main/assets/www/index.html'), 'utf8');

test('resume discards stale cadence and re-arms the render scheduler', () => {
  const anchor = html.indexOf("document.addEventListener('visibilitychange', function() {", html.indexOf('function performanceInfo()'));
  assert.ok(anchor > 0, 'performance lifecycle listener exists');
  const end = html.indexOf('\n});', anchor);
  const snippet = html.slice(anchor, end + 4);
  const ctx = { rafLast: 500, rafCount: 96, rafIndex: 22, rafHz: 120, rafHzBest: 120, rafReportT: 990,
    renderNextDue: 1000, renderCap: 120, last: 500, resetCount: 0,
    performance: { now: () => 5000 }, resetFpsWindow() { ctx.resetCount++; },
    document: { addEventListener(type, fn) { assert.equal(type, 'visibilitychange'); ctx.listener = fn; } } };
  vm.runInNewContext(snippet, ctx);
  ctx.listener();
  for (const key of ['rafLast','rafCount','rafIndex','rafHz','rafHzBest','rafReportT','renderNextDue']) assert.equal(ctx[key], 0, key);
  assert.equal(ctx.renderCap, -1); assert.equal(ctx.last, 5000); assert.equal(ctx.resetCount, 1);
});

test('render cap remains paced when the display callback cadence drops from 120 to 60', () => {
  const start = html.indexOf('function effectiveRenderCap(');
  const end = html.indexOf('\nfunction resetFpsWindow()', start);
  assert.ok(start > 0 && end > start);
  const ctx = { Math, Number };
  vm.runInNewContext(html.slice(start, end), ctx);
  const cap = ctx.effectiveRenderCap(30, 60, 96);
  let rendered = 0;
  for (let i = 0; i < 180; i++) if (ctx.renderCapAllows(1000 + i * 1000 / 60, cap)) rendered++;
  assert.ok(rendered >= 89 && rendered <= 91, `expected 30 FPS over three seconds, got ${rendered}`);
});

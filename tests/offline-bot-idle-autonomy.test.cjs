'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pages = [
  ['offline', path.join(root, 'AndroidProject/app/src/main/assets/www/index.html')],
  ['phone-host', path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html')]
].map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]);

for (const [name, html] of pages) {
  test(`${name} bots investigate last-known contact instead of dropping to idle patrol`, () => {
    assert.match(html, /function beginLastKnownSearch\(u\)[\s\S]*?u\.searchUntil\s*=\s*T\s*\+\s*8/);
    assert.match(html, /else\s*\{\s*if\s*\(was\)\s*beginLastKnownSearch\(u\);\s*u\.sees\s*=\s*false/);
    assert.match(html, /var searching\s*=\s*T\s*<\s*\(u\.searchUntil\s*\|\|\s*0\)/);
    assert.match(html, /var sweep\s*=\s*nextLastKnownSearch\(u\)/);
  });

  test(`${name} companions patrol their assigned cover posts while the player stands still`, () => {
    assert.match(html, /var playerStationary\s*=\s*Math\.hypot\(P\.vx\s*\|\|\s*0,P\.vz\s*\|\|\s*0\)\s*<\s*\.28/);
    assert.match(html, /u\.guardGoal\s*=\s*nextCompanionGuardPost\(u\)/);
    assert.match(html, /u\.guardPatrolAt\s*=\s*T\s*\+\s*4\.5/);
  });

  test(`${name} low-health companions retreat through collision-aware navigation`, () => {
    assert.match(html, /if\s*\(!foe\s*&&\s*u\.hp\s*<\s*u\.maxhp\s*\*\s*\.38\s*&&\s*dist\s*<\s*18\)/);
    assert.match(html, /u\.retreatGoal\s*=\s*SightlineTactics\.retreat\(NAV,u,t/);
    assert.match(html, /unitShoot\(u,\s*t,\s*dist\)/);
  });
}

test('offline and phone-host pages share the same bounded tactical sweep helper', () => {
  const extract = html => {
    const from = html.indexOf('// Bounded movement checks run only when contact is lost');
    const to = html.indexOf('function findSpot(', from);
    assert.ok(from >= 0 && to > from, 'sweep helper block exists');
    return html.slice(from, to);
  };
  assert.equal(extract(pages[0][1]), extract(pages[1][1]));
});

test('tactical search helpers produce three distinct nearby waypoints and cap failed searches', () => {
  const from = pages[0][1].indexOf('// Bounded movement checks run only when contact is lost');
  const to = pages[0][1].indexOf('function findSpot(', from);
  const source = pages[0][1].slice(from, to);
  let calls = 0;
  const context = {
    NAV: {}, units: [], T: 10, Math, Number, Object,
    SightlineTactics: { search(_nav, wish) { calls++; return {...wish}; } }
  };
  vm.createContext(context);
  vm.runInContext(source, context, {filename: 'offline-tactical-search-helpers.js'});

  const bot = {slot: 2, x: 0, z: 0, y: 0, alive: true, last: {x: 0, y: 0}, lastY: 0};
  context.beginLastKnownSearch(bot);
  assert.equal(bot.searchUntil, 18);
  const sweeps = [context.nextLastKnownSearch(bot), context.nextLastKnownSearch(bot), context.nextLastKnownSearch(bot)];
  assert.ok(sweeps.every(Boolean), 'contact search should yield up to three movement goals');
  assert.equal(context.nextLastKnownSearch(bot), null, 'contact search must remain bounded');
  assert.equal(new Set(sweeps.map(p => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)).size, 3, 'search goals should move around the last-known point');

  calls = 0;
  context.SightlineTactics.search = () => { calls++; return null; };
  assert.equal(context.tacticalSweepPoint(bot, {x: 0, y: 0, z: 0}, 0, 2), null);
  assert.ok(calls <= 6, 'a failed waypoint search must not become an unbounded loop');
});

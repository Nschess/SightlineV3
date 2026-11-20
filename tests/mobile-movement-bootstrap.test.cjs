'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const pages = ['www', 'phone-host'].map(tree => fs.readFileSync(path.join(__dirname,
  '../AndroidProject/app/src/main/assets', tree, 'index.html'), 'utf8').replace(/\r\n/g, '\n'));
function section(page, first, last) {
  const begin = page.indexOf(first), end = page.indexOf(last, begin);
  assert.ok(begin >= 0 && end > begin, first);
  return page.slice(begin, end);
}
test('joystick speed stays continuous at dead zone, quiet walk and forward sprint boundaries', () => {
  for (const page of pages) {
    const ctx = vm.createContext({
      stick: {ox: 0, oy: 0, x: 0, y: 0}, touchMode: true, touchRun: false, G: {touchAutoSprint: true},
      joyKnob: {style: {}}, mobileGuide: {action() {}}
    });
    vm.runInContext(section(page, 'var TOUCH_STICK_DEAD_ZONE', "tzm.addEventListener('touchstart'"), ctx);
    const command = (x, y) => {
      ctx.setStick({clientX:x,clientY:y});
      return Math.hypot(ctx.stick.x, ctx.stick.y) * ctx.touchMoveGain();
    };
    assert.equal(command(0, -5), 0);
    assert.ok(command(0, -5.1) < .004);
    assert.ok(Math.abs(command(0, -16) - 16 / 88) < 1e-12);
    for (let d = 6; d < 44; d++) assert.ok(command(0, -d) >= command(0, 1 - d), String(d));
    const quiet = command(0, -21.99);
    assert.equal(ctx.touchQuietWalk(), true);
    const normal = command(0, -22.01);
    assert.equal(ctx.touchQuietWalk(), false);
    assert.ok(normal - quiet < .001);
    const beforeSprint = command(0, -35.19);
    const afterSprint = command(0, -35.21);
    assert.equal(ctx.touchForwardSprint(), true);
    assert.ok(afterSprint - beforeSprint < .002);
    assert.equal(command(0, -50), 1);
    assert.equal(command(0, 50), 1);
    assert.equal(ctx.touchForwardSprint(), false);
    assert.ok(Math.abs(command(40, -40)-1) < 1e-12);
    assert.equal(ctx.touchForwardSprint(), false);
    assert.ok(section(page, 'function updatePlayer(dt)', '  var sy = Math.sin(P.yaw)')
      .includes("walk = held('walk'), quietWalk = walk || touchQuietWalk()"));
    assert.ok(page.includes("var walkIntent = held('walk') || touchQuietWalk()"));
  }
});

test('compact stance separates tap, hold and cancel', () => {
  for (const page of pages) {
    const handlers = new Map();
    let held;
    const ctx = vm.createContext({
      G: {touchLayout: 'compact'}, scoped: true, proneOn: false, touchCrouch: false,
      sliding: false, touchRun: false, touchForwardSprint: () => false,
      touchActionActive: () => true, updateTouchActions() {},
      tbtn(id, down, up) {handlers.set(id, {down,up});},
      setTimeout(fn) {held = fn; return 1;}, clearTimeout() {held = null;},
      trySlide() {throw Error('Unexpected slide');}
    });
    vm.runInContext(section(page, 'var touchStanceTimer =', "tbtn('#tb-run',"),ctx);
    const {down,up} = handlers.get('#tb-crouch');
    down(); up({type:'pointerup'});
    assert.equal(ctx.touchCrouch,true);
    down(); held(); up({type:'pointerup'});
    assert.equal(ctx.proneOn,true);
    assert.equal(ctx.touchCrouch,false);
    assert.equal(ctx.scoped,false);
    down(); up({type:'pointercancel'});
    assert.equal(held,null);
    assert.equal(ctx.proneOn,true);
    ctx.proneOn = false;
    ctx.touchForwardSprint = () => true;
    ctx.trySlide = () => {ctx.sliding=true; return true;};
    down(); up({type:'pointerup'});
    assert.equal(ctx.sliding,true);
    assert.equal(ctx.touchCrouch,false);
  }
});

test('cold and warm startup release the first-paint gate only after initialization', () => {
  for (const page of pages) {
    assert.match(page.slice(0,1500), /class="p11-game sl-booting"[\s\S]*html\.sl-booting #ov-start\{visibility:hidden!important\}/);
    const startup = page.indexOf("document.documentElement.dataset.slBootReady = '1'");
    const gate = page.indexOf("if(root.dataset.slBootReady!=='1')");
    assert.ok(startup > page.indexOf('renderMenu(false);') && gate > startup);
    assert.match(page.slice(gate), /root\.classList\.add\('sl-intro-active'\);\s*open\(\);\s*\}\s*root\.classList\.remove\('sl-booting'\)/);
  }
});

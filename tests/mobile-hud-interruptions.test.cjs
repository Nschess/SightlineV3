'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const assets = path.join(__dirname, '../AndroidProject/app/src/main/assets');
const pages = ['www', 'phone-host'].map(tree =>
  readFileSync(path.join(assets, tree, 'index.html'), 'utf8').replace(/\r\n/g, '\n'));

function section(page, begin, end) {
  const start = page.indexOf(begin);
  const stop = page.indexOf(end, start);
  assert.ok(start >= 0 && stop > start, begin);
  return page.slice(start, stop);
}

test('mobile touch HUD refresh reuses static control lookups', () => {
  const helper = section(pages[0], 'function createTouchHudElementLookup(', 'function touchActionAvailable(');
  assert.equal(helper, section(pages[1], 'function createTouchHudElementLookup(', 'function touchActionAvailable('), 'offline and phone-host caches stay synchronized');
  for (const page of pages) {
    const available = section(page, 'function touchActionAvailable(', 'function updateTouchActions()');
    const refresh = section(page, 'function updateTouchActions()', 'function enterTouchSession()');
    assert.match(available, /touchHudElement\(id\)/);
    assert.doesNotMatch(available, /\$\(/);
    assert.match(refresh, /touchHudElement\(/);
    assert.doesNotMatch(refresh, /\$\(/);
  }
  const hud = section(pages[0], 'function updateHud()', 'function showHit(');
  assert.match(hud, /if \(touchMode\) updateTouchActions\(\)/, 'state changes still refresh touch labels and accessibility immediately');

  const queried = [];
  const aim = {}, reload = {};
  const nodes = new Map([['#tb-aim', aim], ['#tb-rel', reload]]);
  const context = vm.createContext({ $: selector => { queried.push(selector); return nodes.get(selector) || null; } });
  vm.runInContext(helper + '\nthis.findTouchHudElement = touchHudElement;', context);
  assert.strictEqual(context.findTouchHudElement('#tb-aim'), aim);
  assert.strictEqual(context.findTouchHudElement('#tb-aim'), aim);
  assert.strictEqual(context.findTouchHudElement('#tb-rel'), reload);
  assert.strictEqual(context.findTouchHudElement('#tb-rel'), reload);
  assert.strictEqual(context.findTouchHudElement('#optional'), null);
  assert.strictEqual(context.findTouchHudElement('#optional'), null);
  assert.deepEqual(queried, ['#tb-aim', '#tb-rel', '#optional'], 'each stable selector, including absent optional controls, is queried once');

  for (const page of pages) {
    const controls = new Map();
    const makeControl = () => {
      const attributes = new Map(), classes = new Set(), label = { _v: undefined, textContent: '' };
      return { hidden: false, disabled: false, label, attributes, classes,
        getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
        setAttribute(name, value) { attributes.set(name, String(value)); },
        classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); } },
        querySelector() { return label; }
      };
    };
    for (const selector of ['#tb-aim','#tb-prone','#tb-crouch','#tb-run','#tb-slide','#tb-rel','#tb-buy','#tb-nade','#tb-nsel','#tb-inspect','#tb-objective','#tb-dropbomb']) controls.set(selector, makeControl());
    controls.set('#tb-nade .tb-label', controls.get('#tb-nade').label);
    const lookups = [];
    const touchContext = vm.createContext({
      $: selector => { lookups.push(selector); return controls.get(selector) || null; },
      touchMode: true, scoped: false, proneOn: false, touchCrouch: false, touchRun: false,
      G: { touchLayout: 'basic', touchAutoSprint: true }, mobileHud: { positions: {}, editing: false },
      cur: 'pistol', WEAPONS: { pistol: { mag: 12, melee: false } }, ammo: { pistol: { mag: 6, res: 18 } },
      P: { alive: true }, reloading: 0, inv: {}, NADES: { frag: { name: 'FRAG' }, flash: { name: 'FLASH' } }, nadeSel: 'frag',
      canBuyNow: () => false, selectedLegendaryFinish: () => null, SightlineWeaponSkins: { legend: { prototype: () => null } },
      R: { mode: 'versus' }, MP: { on: false }, state: 'live', SOLO_BOMB: { state: null, playerTeam: 0 },
      mpBombAction: () => null, soloBombPrompt: () => ''
    });
    const updateHudCode = section(page, 'function setT(', 'function showDamageDirection(');
    const updateToggleCode = section(page, 'function updateTouchToggle(', 'function createTouchHudElementLookup(');
    const actionsCode = section(page, 'function touchActionAvailable(', 'function enterTouchSession()');
    vm.runInContext(updateHudCode + updateToggleCode + helper + actionsCode + '\nthis.refreshTouchActions = updateTouchActions;', touchContext);
    touchContext.refreshTouchActions();
    const firstRefreshLookups = lookups.length;
    assert.equal(controls.get('#tb-aim').getAttribute('aria-pressed'), 'false');

    touchContext.scoped = true;
    touchContext.reloading = 1;
    touchContext.ammo.pistol.mag = 1;
    touchContext.inv.frag = 1;
    touchContext.refreshTouchActions();
    assert.equal(controls.get('#tb-aim').getAttribute('aria-pressed'), 'true', 'ADS state updates immediately on the cached element');
    assert.equal(controls.get('#tb-rel').getAttribute('aria-label'), 'Reloading weapon');
    assert.equal(controls.get('#tb-rel').label.textContent, 'LOAD…');
    assert.ok(controls.get('#tb-rel').classes.has('reload-active'));

    touchContext.scoped = false;
    touchContext.reloading = 0;
    touchContext.refreshTouchActions();
    assert.equal(controls.get('#tb-aim').getAttribute('aria-pressed'), 'false');
    assert.equal(controls.get('#tb-rel').getAttribute('aria-label'), 'Reload weapon, ammunition low');
    assert.ok(controls.get('#tb-rel').classes.has('reload-needed'));
    assert.equal(lookups.length, firstRefreshLookups + 1, 'only the newly visible grenade label requires one additional lookup');
    const stableLookups = lookups.length;
    touchContext.refreshTouchActions();
    assert.equal(lookups.length, stableLookups, 'subsequent HUD refreshes perform no selector queries');
  }
});

test('Opening the live store releases all mobile inputs and preserves PC input behavior', () => {
  for (const page of pages) {
    let storeOpens = 0, heldReleaseCalls = 0;
    const context = vm.createContext({
      touchMode: true, touchCrouch: true, touchRun: true, touchActionLook: {id:4}, state: 'live', P: { alive: true }, jumpQ: true, fireHeld: true,
      stick: { id: 1, x: 1, y: 1 }, lookTouch: { id: 2 },
      joy: { classList: { remove() {} } }, joyKnob: { style: {} },
      touchFireOwners: new Set([3, 4]), touchButtonResets: [() => heldReleaseCalls++],
      canBuyNow: () => true, storeNote() {}, renderBuy() {}, clearMobileAim() {}, clearTimeout() {}, touchStanceTimer: 0,
      showOverlay(id) { assert.equal(id, '#ov-buy'); storeOpens++; }
    });
    vm.runInContext(section(page, 'function resetTouchMotion()', 'function setStick('), context);
    vm.runInContext(section(page, 'function openStore()', 'function toggleStore()'), context);
    context.openStore();
    assert.equal(storeOpens, 1);
    assert.equal(heldReleaseCalls, 1);
    assert.equal(context.stick.id, null);
    assert.equal(context.lookTouch.id, null);
    assert.equal(context.touchFireOwners.size, 0);
    assert.equal(context.fireHeld, false);
    assert.equal(context.jumpQ, false);
    assert.equal(context.touchCrouch, false);
    assert.equal(context.touchRun, false);
    assert.equal(context.touchActionLook, null);
    context.touchMode = false;
    context.fireHeld = true;
    context.openStore();
    assert.equal(storeOpens, 2);
    assert.equal(heldReleaseCalls, 1);
    assert.equal(context.fireHeld, true);
  }
});

test('HUD editing keeps the first drag owner and saves once when that pointer releases', () => {
  for (const page of pages) {
    const listeners = new Map(), positions = {}, captures = [];
    let saves = 0;
    const pad = {
      dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 568, height: 320 }),
      addEventListener: (name, fn) => listeners.set(name, fn)
    };
    const context = vm.createContext({
      document: { getElementById: () => pad }, mobileHud: { editing: true, positions },
      clampMobileHudPoint: (_, __, x, y) => ({ x, y }), applyHudPosition() {}, saveMobileHud: () => saves++
    });
    vm.runInContext(section(page, 'function initMobileHudPositionEditor()', 'initMobileHudPositionEditor();'), context);
    context.initMobileHudPositionEditor();
    const event = (pointerId, action) => ({
      pointerId, clientX: 284, clientY: 160, preventDefault() {}, stopImmediatePropagation() {},
      target: { closest: () => ({ id: action, setPointerCapture: id => captures.push(id) }) }
    });
    listeners.get('pointerdown')(event(11, 'tb-fire'));
    listeners.get('pointerdown')(event(12, 'tb-aim'));
    listeners.get('pointermove')(event(12));
    listeners.get('pointerup')(event(12));
    assert.equal(saves, 0);
    listeners.get('pointermove')(event(11));
    listeners.get('pointerup')(event(11));
    assert.deepEqual(captures, [11]);
    assert.deepEqual(positions, { 'tb-fire': { x: .5, y: .5 } });
    assert.equal(saves, 1);
  }
});

test('custom positions and hand preferences survive migration while obsolete controls are discarded', () => {
  const old = {style:'text',hand:'left',opacity:75,fire2:true,positions:{
    'tb-more':{x:.7,y:.4},'tb-fire':{x:.2,y:.7},'tb-slide':{x:.32,y:.55},
    'tb-aim':{x:'broken',y:.5}
  }};
  for(const page of pages) {
    let stored;
    const context=vm.createContext({localStorage:{
      getItem:()=>JSON.stringify(old),
      setItem(key,value){assert.equal(key,'sightline.mobileHud.v1');stored=JSON.parse(value);}
    }});
    vm.runInContext(section(page,'var MOBILE_HUD_KEY','var mobileHud=loadMobileHud()'),context);
    context.loadMobileHud();
    assert.deepEqual(stored,{
      style:'tactical',hand:'left',opacity:75,fire2:true,editing:false,
      positions:{'tb-fire':{x:.2,y:.7},'tb-slide':{x:.32,y:.55}}
    });
    assert.ok(!page.includes('tb-more'));
    assert.ok(!page.includes('setTouchTray'));
  }
});

test('fire-drag looks with one pointer, avoids double aiming and releases on cancel', () => {
  for (const page of pages) {
    const listeners = {};
    const button = { id:'tb-fire', addEventListener:(name,fn)=>listeners[name]=fn,
      classList:{add(){},remove(){}}, setPointerCapture(){} };
    const look = [], starts = [], releases = [];
    const context = vm.createContext({
      $:()=>button, touchActionLook:null, lookTouch:{id:null},
      window:{PointerEvent:function(){}}, mobileHud:{editing:false},
      touchButtonResets:[], applyTouchLook:(dx,dy)=>look.push([dx,dy]),
      down:event=>starts.push(event.pointerId), up:event=>releases.push(event.pointerId)
    });
    vm.runInContext(section(page,'function tbtn(','function updateTouchToggle('),context);
    vm.runInContext("tbtn('#tb-fire',down,up,{lookDrag:true,perPointer:true})",context);
    const event=(pointerId,clientX)=>({pointerId,clientX,clientY:100,pointerType:'touch',
      preventDefault(){},stopPropagation(){}});
    listeners.pointerdown(event(1,200));
    listeners.pointerdown(event(2,210));
    listeners.pointermove(event(2,225));
    listeners.pointermove(event(1,205));
    context.lookTouch.id=3;
    listeners.pointermove(event(1,211));
    context.lookTouch.id=null;
    listeners.pointermove(event(1,212));
    listeners.pointercancel(event(1,212));
    listeners.pointermove(event(1,218));
    listeners.pointerup(event(2,225));
    assert.deepEqual(look,[[5,0],[1,0]]);
    assert.deepEqual(starts,[1,2]);
    assert.deepEqual(releases,[1,2]);
    assert.equal(context.touchActionLook,null);
  }
});

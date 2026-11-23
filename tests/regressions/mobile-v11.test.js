'use strict';
/* V11 source contract checks. Real rendering/device QA is separate. */
const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const page = fs.readFileSync(path.join(__dirname,'..','..','AndroidProject','app','src','main','assets','phone-host','index.html'),'utf8');
const offlinePage = fs.readFileSync(path.join(__dirname,'..','..','AndroidProject','app','src','main','assets','www','index.html'),'utf8');
test('the complete game script still parses after V11 edits',()=>{
  const all = [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(all.length >= 2);
  for(const [,body] of all) if(body.trim()) assert.doesNotThrow(()=>new vm.Script(body));
});
test('the V11 controls use accessible native buttons and a visible joystick',()=>{
  // Actions are authored as native controls and receive their labels/icons
  // from applyMobileHud; the obsolete More tray is intentionally absent.
  for(const id of ['tb-fire','tb-fire-alt','tb-jump','tb-rel','tb-aim','tb-swap','tb-slide','tb-menu','tb-prone','tb-buy','tb-nade','tb-nsel','tb-crouch','tb-run','tb-inspect','tb-objective','tb-dropbomb','tb-score'])
    assert.match(page,new RegExp(`<button\\b(?=[^>]*\\bid="${id}")(?=[^>]*\\btype="button")[^>]*>`),`${id} remains a native button`);
  assert.doesNotMatch(page,/id="tb-more"/,'all essential actions are direct controls; no More tray remains');
  assert.match(page,/id="touch-joystick"/);
  assert.match(page,/rotate your phone sideways/i);
  assert.doesNotMatch(page,/id="touch-rotate"/);
  assert.match(page,/aria-label="Fire weapon"/);
  assert.match(page,/aria-label="Pause or open menu"/);
});
test('simple/advanced layouts and mobile settings are persisted through existing settings architecture',()=>{
  for(const k of ['touchLayout','touchSens','touchAdsSens','touchSize']) {
    assert.match(page,new RegExp(`${k}:`));
    assert.match(page,new RegExp(`k: '${k}'`));
  }
  assert.match(page,/var SET_TABS = \[\['video', 'Graphics'\], \['audio', 'Audio'\], \['controls', 'Controls'\], \['play', 'Gameplay'\], \['network', 'Network'\]\]/,
    'Lobby 9 groups the mobile HUD options under the unified Controls category');
  assert.match(page,/setTab==='controls'[\s\S]*mobileHudSettingsHtml\(\)/,
    'Controls must render the persisted mobile HUD options');
  assert.match(page,/MOBILE_HUD_KEY='sightline\.mobileHud\.v1'/);
  // The integrated HUD defaults to its tactical compact layout. Older saved
  // Text/Icons layouts migrate while retaining valid position and hand data.
  const acceptedHudDefault=/MOBILE_HUD_DEFAULT=\{style:'tactical',opacity:88,fire2:false(?:,[^}]*)?\}/;
  assert.match(page,acceptedHudDefault);
  assert.match(offlinePage,acceptedHudDefault,
    'Offline and phone-host must use the same accepted HUD defaults');
  assert.match(page,/function loadMobileHud\(\)[\s\S]*p\.style!=='tactical'[\s\S]*localStorage\.setItem\(MOBILE_HUD_KEY,JSON\.stringify\(result\)\)/,
    'obsolete HUD styles migrate to Tactical while valid saved preferences are retained');
  assert.match(page,/function renderTouchActionButton\(id,label,aria,iconKey\)[\s\S]*setAttribute\('aria-label',aria\|\|label\)[\s\S]*<span class="tb-label"/,
    'the current native controls receive accessible labels and visible text from the shared renderer');
  assert.doesNotMatch(page,/data-mobile-hud-style|tb-action-icon|tb-action-label/,
    'no obsolete HUD style picker or legacy action controls remain');
  assert.match(page,/TOUCH_HUD_ICONS\[iconKey\]/);
  assert.match(page,/setT\(el\.querySelector\('\.tb-label'\),label\)/);
  assert.match(page,/html\.touch-device \.tb \{[^}]*border-radius:50%/);
  assert.doesNotMatch(page,/box-shadow:0 0 0 5px #ff96542b|#ffd4a2|#efbd68/,
    'HUD should not retain decorative rings or gold accents');
  assert.match(page,/Settings → Customization/);
  assert.match(page,/G\.touchLayout === 'advanced'/);
  assert.match(page,/function updateTouchActions\(\)/);
  assert.match(page,/MOBILE_HUD_BUTTON_IDS\.forEach\(function\(id\)/);
});
test('swipe look preserves scope precision and vertical invert while joystick supports multiple touches',()=>{
  assert.match(page,/lookTouch\.id !== null/);
  assert.match(page,/stick\.id !== null/);
  assert.match(page,/G\.touchSens \/ 100/);
  assert.match(page,/scoped \? G\.touchAdsSens \/ 100 : 1/);
  assert.match(page,/S\.invertY \? -1 : 1/);
  assert.match(page,/window\.addEventListener\('blur', resetTouchMotion\)/);
});
test('graphics defaults avoid mobile shadow allocation and excessive pixel ratios',()=>{
  // The current renderer starts mobile with shadows disabled, while the saved
  // mobile default is also off. Desktop keeps the user's selected shadow tier.
  assert.match(page,/renderer\.shadowMap\.enabled = !touchMode/);
  assert.match(page,/shadows: touchMode \? 'off' : 'low'/);
  assert.match(page,/function mobileDprLimit\(\) \{[\s\S]*?G\.mobileQuality === 'competitive'\) return 2\.15[\s\S]*?G\.mobileQuality === 'low' \? 1\.5 : G\.mobileQuality === 'high' \? 2\.75 : 2\.35/,
    'mobile DPR is bounded by the selected quality preset');
  assert.match(page,/Math\.min\(window\.devicePixelRatio \|\| 1, mobileDprLimit\(\)\) \* scale/,
    'the renderer applies the preset DPR bound before its render scale');
  assert.match(page,/fx: touchMode \? 'low' : 'high'/);
  assert.match(page,/function effectiveShadowTier\(\)/);
  assert.match(page,/function applyShadowBudget\(\)/);
});
test('fullscreen orientation usability, mobile session and desktop remain distinct',()=>{
  assert.match(page,/\.touch-session/);
  assert.match(page,/classList\.remove\('touch-session'\)/);
  assert.match(page,/@media \(max-width:700px\) and \(orientation:portrait\)/);
  assert.match(page,/safe-area-inset-right/);
  assert.match(page,/\(pointer: coarse\)/);
  assert.match(page,/#btn-controls'\)\.hidden = true/);
});

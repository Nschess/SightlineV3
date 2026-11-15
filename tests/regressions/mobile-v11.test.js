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
  for(const id of ['tb-fire','tb-jump','tb-rel','tb-aim','tb-swap','tb-slide','tb-more','tb-menu','tb-prone','tb-buy','tb-nade','tb-nsel'])
    assert.match(page,new RegExp(`<button[^>]*id="${id}"[^>]*type="button"`));
  assert.match(page,/id="touch-joystick"/);
  assert.match(page,/rotate your phone sideways/i);
  assert.doesNotMatch(page,/id="touch-rotate"/);
  assert.match(page,/aria-expanded="false"/);
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
  // The accepted recovery source defaults to the readable single-fire layout;
  // the earlier 90/dual-fire expectation belonged to a different HUD revision.
  const acceptedHudDefault=/MOBILE_HUD_DEFAULT=\{style:'text',opacity:88,fire2:false(?:,[^}]*)?\}/;
  assert.match(page,acceptedHudDefault);
  assert.match(offlinePage,acceptedHudDefault,
    'Offline and phone-host must use the same accepted HUD defaults');
  assert.match(page,/function loadMobileHud\(\)[\s\S]*p\.style!=='text'[\s\S]*localStorage\.setItem\(MOBILE_HUD_KEY,JSON\.stringify\(result\)\)/,
    'rejected Icons/Hybrid preferences must migrate to Text while retaining other settings');
  // The accepted Android APK uses the current inline SVG icon + text-label
  // buttons. Keep the text labels readable and the prior style-picker removed.
  assert.match(page,/function renderTouchActionButton\(id,label,aria,iconKey\)[\s\S]*class="tb-icon"[\s\S]*class="tb-label"/);
  assert.doesNotMatch(page,/data-mobile-hud-style|tb-action-icon|tb-action-label/,
    'no obsolete HUD style picker or legacy action controls remain');
  assert.match(page,/el\.dataset\.hudStyle='icon-label'/);
  assert.match(page,/html\.touch-device \.tb \{[^}]*border-radius:50%/);
  assert.doesNotMatch(page,/box-shadow:0 0 0 5px #ff96542b|#ffd4a2|#efbd68/,
    'HUD should not retain decorative rings or gold accents');
  assert.match(page,/Settings → Customization/);
  assert.match(page,/G\.touchLayout === 'advanced'/);
  assert.match(page,/touchTrayOpen/);
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
  assert.match(page,/Math\.min\(window\.devicePixelRatio \|\| 1, touchMode \? 1\.5 : 1\.75\)/);
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

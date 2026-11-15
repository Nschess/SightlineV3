'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const cssPath = path.join(root, 'tools/premium-mobile-hud.css');
const css = fs.readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');
const pages = [
  ['offline', 'AndroidProject/app/src/main/assets/www/index.html'],
  ['phone-host', 'AndroidProject/app/src/main/assets/phone-host/index.html']
].map(([label, rel]) => ({ label, rel, file: path.join(root, rel), html: fs.readFileSync(path.join(root, rel), 'utf8') }));
const digest = b => crypto.createHash('sha256').update(b).digest('hex');

assert.ok(css.includes('Touch-only tactical HUD system'));
assert.ok(css.includes('html.touch-device .tb'));
assert.ok(css.includes('env(safe-area-inset-left'));
for (const edge of ['left','right','top','bottom']) assert.ok(css.includes(`--hud-safe-${edge}:env(safe-area-inset-${edge}`), `safe-area ${edge} inset exposed to HUD editor`);
assert.ok(css.includes('min-width:48px') && css.includes('min-height:48px'));
assert.ok(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'));
assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
assert.ok(css.includes('prefers-reduced-motion:reduce'));
assert.ok(!css.includes('repeat(3,minmax(0,1fr);'));
let depth = 0;
for (const c of css) { if (c === '{') depth++; else if (c === '}') { depth--; assert.ok(depth >= 0, 'unbalanced closing CSS brace'); } }
assert.equal(depth, 0, 'unbalanced CSS braces');

let canonicalStyle = null;
for (const page of pages) {
  assert.equal((page.html.match(/id="premium-mobile-hud"/g) || []).length, 1, `${page.label}: one integrated HUD stylesheet`);
  const style = page.html.match(/<style id="premium-mobile-hud">([\s\S]*?)<\/style>/);
  assert.ok(style, `${page.label}: HUD stylesheet block missing`);
  assert.equal(style[1].trim(), css.trim(), `${page.label}: served HUD CSS differs from authored CSS`);
  if (canonicalStyle === null) canonicalStyle = style[1].trim(); else assert.equal(style[1].trim(), canonicalStyle, 'Offline / phone-host HUD style parity');

  const ids = ['tb-menu','tb-fire','tb-fire-alt','tb-jump','tb-rel','tb-swap','tb-aim','tb-slide','tb-more','tb-prone','tb-buy','tb-nade','tb-nsel','tb-inspect','tb-objective','tb-dropbomb'];
  for (const id of ids) assert.ok(page.html.includes(`id="${id}"`), `${page.label}: lost action ${id}`);
  for (const action of ['fire','aim','reload','jump','slide','swap','more']) assert.ok(page.html.includes(`${action}:`), `${page.label}: missing ${action} vector icon`);
  for (const behavior of ['function tbtn(id, down, up, options)', "tbtn('#tb-fire', touchFireDown, touchFireUp, { perPointer: true })", "tbtn('#tb-aim'", "tbtn('#tb-rel', function () { if (state === 'live') startReload(); })", "tbtn('#tb-jump'", "tbtn('#tb-swap'", "tbtn('#tb-menu'", 'var firstOwner = activePointers.size === 0', 'perPointer || !activePointers.size', 'owners.forEach(function (pointerId)', "b.addEventListener('pointercancel', finish)", "tzm.addEventListener('touchcancel', endStick)", "tzl.addEventListener('touchcancel', endLook)", 'window.addEventListener(\'blur\', resetTouchMotion)', 'function pause() {', 'resetTouchMotion();', "state = 'paused'; fireHeld = false; scoped = false", 'function resume() {', 'function clampMobileHudPoint', "window.addEventListener('resize',function(){if(mobileHudResizeFrame)return;"]) assert.ok(page.html.includes(behavior), `${page.label}: lost touch behavior ${behavior}`);
  for (const pref of ["hand:p.hand==='left'?'left':'right'", 'positions:positions', 'editing:false', 'mobileHud.positions[drag.el.id]', 'clampMobileHudPoint(drag.el,pad,x,y)', 'setPointerCapture(e.pointerId)', "data-mobile-hud-hand", "data-act=\"mobile-hud-edit\""]) assert.ok(page.html.includes(pref), `${page.label}: missing mobile preference/editor behavior ${pref}`);
  assert.ok(page.html.includes("if (mobileHud.editing) { mobileHud.editing=false; saveMobileHud(); }"), `${page.label}: editor exit path missing`);
  assert.ok(page.html.includes("'low-ammo'"), `${page.label}: low ammo state missing`);
  assert.ok(page.html.includes("l: 'Action set'"), `${page.label}: two-thumb / claw control setting missing`);
  assert.ok(page.html.includes('RIGHT-HAND FIRE'), `${page.label}: handedness setting missing`);

  // Ensure all inline JS still parses; this checks source syntax, not browser execution.
  let scriptCount = 0;
  for (const m of page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/.test(m[1]) || !m[2].trim() || /application\/json|importmap/i.test(m[1])) continue;
    new vm.Script(m[2], { filename: `${page.rel}:inline-${++scriptCount}` });
  }
  assert.ok(scriptCount > 0, `${page.label}: no inline scripts checked`);
  page.scriptCount = scriptCount;
}

// Explicitly check the default two-thumb arrangement at representative landscape sizes.
// These are source-layout calculations, not computed browser bounds.
for (const [w, h] of [[844,390],[740,360],[1280,720]]) {
  const scaled=(pct,min,max)=>Math.max(min,Math.min(max,h*pct));
  const s = scaled(.14,54,62), fire = scaled(.2,74,88), gap = 4 * w / 100, v = h * .18;
  const boxes = {
    fire: {x:w-gap-fire,y:h-v-fire,w:fire,h:fire},
    jump: {x:w-gap-s,y:h-v-fire-12-s,w:s,h:s},
    aim: {x:w-gap-fire-14-s,y:h-v-20-s,w:s,h:s},
    reload: {x:w-gap-fire-30-s,y:h-h*.08-s,w:s,h:s},
    swap: {x:w-gap-fire-102-s,y:h-h*.08-s,w:s,h:s},
    slide: {x:w-gap-fire-102-s,y:h-v-20-s,w:s,h:s},
    more: {x:w-gap-fire-30-s,y:h-h*.42-s,w:s,h:s}
  };
  const names = Object.keys(boxes);
  for (let i=0;i<names.length;i++) for(let j=i+1;j<names.length;j++) {
    const a=boxes[names[i]],b=boxes[names[j]];
    assert.ok(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y, `${w}x${h}: ${names[i]} overlaps ${names[j]}`);
  }
  for (const [name,b] of Object.entries(boxes)) {
    assert.ok(b.w>=48&&b.h>=48, `${w}x${h}: ${name} target under 48px`);
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=w&&b.y+b.h<=h, `${w}x${h}: ${name} outside viewport`);
  }
}

const rollback = path.join(root, 'rollback/premium-mobile-hud-prechange-20261112/SHA256SUMS.txt');
assert.ok(fs.existsSync(rollback), 'prechange rollback inventory missing');
for (const line of fs.readFileSync(rollback,'utf8').trim().split(/\r?\n/)) {
  const m = line.match(/^([a-f0-9]{64})\s+(.+)$/); assert.ok(m, `invalid rollback entry ${line}`);
  const file = path.join(path.dirname(rollback), m[2]); assert.ok(fs.existsSync(file), `rollback file missing: ${m[2]}`);
  assert.equal(digest(fs.readFileSync(file)), m[1], `rollback hash mismatch: ${m[2]}`);
}
console.log(JSON.stringify({status:'PASS',checks:{offlineAndPhoneHostStylesParity:true,allTouchActionsAndCancelPathsPresent:true,mobilePreferenceSanitizationAndEditorPresent:true,inlineScriptSyntax:true,landscapeLayoutMath:['844x390','740x360','1280x720'],rollbackIntegrity:true},inlineScripts:pages.map(p=>({page:p.label,count:p.scriptCount})),rollbackFiles:fs.readFileSync(rollback,'utf8').trim().split(/\r?\n/).length,pageSha256:pages.map(p=>({page:p.label,sha256:digest(fs.readFileSync(p.file))}))},null,2));

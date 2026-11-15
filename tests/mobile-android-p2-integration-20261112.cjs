'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const offline = read('AndroidProject/app/src/main/assets/www/index.html');
const phone = read('AndroidProject/app/src/main/assets/phone-host/index.html');
const css = read('tools/premium-mobile-hud.css');
const activity = read('AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');
const manifest = read('AndroidProject/app/src/main/AndroidManifest.xml');
const gradle = read('AndroidProject/app/build.gradle');
const wrapper = read('AndroidProject/gradle/wrapper/gradle-wrapper.properties');

for (const [name, page] of [['offline', offline], ['phone-host', phone]]) {
  assert.match(page, /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/, `${name}: responsive viewport and cutout mode`);
  assert.match(page, /var MOBILE_HUD_KEY='sightline\.mobileHud\.v1'/, `${name}: stable per-WebView HUD preference key`);
  assert.match(page, /function saveMobileHud\(\)[\s\S]{0,180}localStorage\.setItem\(MOBILE_HUD_KEY/, `${name}: save HUD preferences`);
  assert.match(page, /function loadMobileHud\(\)[\s\S]{0,180}localStorage\.getItem\(MOBILE_HUD_KEY/, `${name}: restore HUD preferences`);
  assert.match(page, /pointercancel/, `${name}: pointer cancel cleanup`);
  assert.match(page, /function resetTouchMotion\(\)/, `${name}: global touch reset`);
  assert.match(page, /window\.addEventListener\('resize',function\(\)\{if\(mobileHudResizeFrame\)return;/, `${name}: coalesced layout refresh on resize`);
  assert.match(page, /localStorage\.getItem\(MOBILE_HUD_KEY/, `${name}: preference storage is wired`);
}

assert.equal(offline.match(/<meta name="viewport" content="[^"]+">/)?.[0], phone.match(/<meta name="viewport" content="[^"]+">/)?.[0], 'offline and phone-host viewport parity');
for (const inset of ['left', 'right', 'top', 'bottom']) {
  assert.ok(css.includes(`--hud-safe-${inset}:env(safe-area-inset-${inset},0px)`), `CSS safe-area ${inset} inset`);
  assert.ok(offline.includes(`--hud-safe-${inset}:env(safe-area-inset-${inset},0px)`), `Offline safe-area ${inset} inset`);
  assert.ok(phone.includes(`--hud-safe-${inset}:env(safe-area-inset-${inset},0px)`), `phone-host safe-area ${inset} inset`);
}
assert.match(css, /#stage\{touch-action:none;overscroll-behavior:none;/, 'stage captures gameplay gestures');
assert.match(css, /#tz-move,html\.touch-device #tz-look\{z-index:1;touch-action:none;/, 'independent movement/look touch zones');
assert.match(activity, /settings\.setDomStorageEnabled\(true\)/, 'Android WebView enables localStorage');
assert.match(activity, /settings\.setJavaScriptEnabled\(true\)/, 'Android WebView enables game input JS');
assert.match(activity, /web\.onPause\(\)/, 'WebView pauses with Activity');
assert.match(activity, /web\.onResume\(\)/, 'WebView resumes with Activity');
assert.match(activity, /window\.dispatchEvent\(new Event\('blur'\)\)/, 'native pause/back path dispatches touch-reset blur');
assert.match(activity, /web\.loadUrl\(OFFLINE_URL\)/, 'Android Offline starts from bundled page');
assert.ok(activity.includes('BuildConfig.SECURE_LAN_RELEASE ? "https://" : "http://"'), 'LAN page scheme follows configured transport');
assert.match(manifest, /android:screenOrientation="sensorLandscape"/, 'Android game remains landscape');
assert.match(manifest, /android:hardwareAccelerated="true"/, 'WebView hardware acceleration enabled');
assert.match(gradle, /compileSdk 36/, 'established compile SDK requirement');
assert.match(gradle, /sourceCompatibility JavaVersion\.VERSION_17/, 'established JDK 17 source level');
assert.match(wrapper, /gradle-8\.13-bin\.zip/, 'established Gradle wrapper version');

console.log(JSON.stringify({status:'PASS',scope:'static Android integration/source checks only',checks:[
  'Offline/phone-host viewport parity and landscape settings',
  'HUD touch/cancel/resize hooks and local preference persistence',
  'safe-area CSS insets at all four edges',
  'Android WebView JavaScript and DOM storage configuration',
  'Activity pause/resume and blur cleanup',
  'bundled Offline page and configured LAN transport loading',
  'Android landscape/hardware acceleration and pinned SDK/JDK/Gradle requirements'
]},null,2));

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const mustMatch = (text, pattern, message) => assert.ok(pattern.test(text), message);
const pages = [
  ['Offline', read('AndroidProject/app/src/main/assets/www/index.html')],
  ['Phone-host', read('AndroidProject/app/src/main/assets/phone-host/index.html')]
];

for (const [name, html] of pages) {
  test(`${name}: Android landscape page keeps stage and WebGL canvas bound to the usable viewport`, () => {
    mustMatch(html, /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">/, 'responsive viewport meta is present');
    mustMatch(html, /html\.p11-game #play\.stage-wrap\{position:fixed;inset:0[^}]*width:100vw;height:100dvh/, 'game wrapper fills landscape WebView');
    mustMatch(html, /html\.p11-game #stage\{position:absolute;inset:0;width:100%!important;height:100%!important;max-height:none!important;aspect-ratio:auto!important/, 'stage fills the wrapper');
    mustMatch(html, /#gl\s*\{\s*position:\s*absolute;\s*inset:\s*0;\s*width:\s*100%;\s*height:\s*100%;\s*display:\s*block;/, 'WebGL canvas fills the stage');
    mustMatch(html, /function resize\(\)\s*\{\s*var w = stage\.clientWidth \|\| 640, h = stage\.clientHeight \|\| 360;/, 'renderer sizes from the stage bounds');
  });

  test(`${name}: audio settings and intro controls remain accessible on Android`, () => {
    mustMatch(html, /\['audio',\s*'Audio'\]/, 'Audio remains a visible mobile Settings category');
    mustMatch(html, /function mobileSettingsSpec\(tab\)[\s\S]*?if \(tab === 'audio'\) return SPEC\.audio\.filter/, 'Audio controls use the saved Audio settings specification');
    mustMatch(html, /data-act="p111-mute"/, 'Audio page exposes the saved mute control');
    mustMatch(html, /Master volume|master:profile\.audio/, 'Master volume remains editable');
    mustMatch(html, /Music volume|musicVol:profile\.audio/, 'Music volume remains editable');
    assert.doesNotMatch(html, /id="mn-sound"|class="mn-sound"/, 'the retired floating lobby speaker is not required');
    mustMatch(html, /#sl-intro \.si-begin\{[^}]*touch-action:manipulation/, 'intro begin accepts direct touch');
    mustMatch(html, /#sl-intro \.si-skip\{[^}]*touch-action:manipulation/, 'intro skip accepts direct touch');
    mustMatch(html, /begin\.addEventListener\('click',startCards\)/, 'intro begin handler is connected');
    mustMatch(html, /skip\.addEventListener\('click',close\)/, 'intro skip handler is connected');
  });

  test(`${name}: optional operator preview faults cannot abort the shared render loop`, () => {
    mustMatch(html, /function updateLobbyPreviewForFrame\(active\)\{if\(lobbyPreviewFrameFault\)return;try\{lobbyPreviewUpdate\(active\);\}catch\(error\)/, 'preview update is isolated from the main frame');
    mustMatch(html, /lobby preview disabled after its frame update failed; continuing the main renderer/, 'preview failure is logged and degrades safely');
    mustMatch(html, /recover:\s*exit/, 'preview stage can restore hidden world objects');
    const frameStart = html.indexOf('function frame(now) {');
    const frameEnd = html.indexOf('\n}\n', frameStart);
    assert.ok(frameStart >= 0 && frameEnd > frameStart, 'the frame loop is extractable');
    const frame = html.slice(frameStart, frameEnd);
    mustMatch(frame, /updateLobbyPreviewForFrame\(state==='idle'&&menuOpen\(\)\)/, 'frame loop uses the isolated preview wrapper');
    assert.doesNotMatch(frame, /\blobbyPreviewUpdate\(state/, 'frame loop does not call the risky preview directly');
  });

  test(`${name}: intro, deploy, and Match Rules Back remain wired to their existing flows`, () => {
    mustMatch(html, /function startMatch\(\)/, 'match initializer remains present');
    mustMatch(html, /function beginRound\(\)/, 'round initializer remains present');
    mustMatch(html, /\$\('#btn-start'\)\.addEventListener\('click',[\s\S]{0,420}startMatch\(\)/, 'Deploy still calls the match initializer');
    mustMatch(html, /data-act="rules-back"/, 'Match Rules Back control remains present');
    assert.ok(html.includes('sl82ReturnFromRules();return;'), 'Match Rules Back returns to setup');
  });
}

test('Android host stays immersive landscape, full-size, and emits actionable debug evidence', () => {
  const manifest = read('AndroidProject/app/src/main/AndroidManifest.xml');
  const activity = read('AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');
  mustMatch(manifest, /android:screenOrientation="sensorLandscape"/, 'activity is landscape locked');
  mustMatch(activity, /root\.addView\(web, new FrameLayout\.LayoutParams\(-1,-1, Gravity\.CENTER\)\)/, 'WebView occupies the full native window');
  mustMatch(activity, /new WebViewAssetLoader\.Builder\(\)/, 'local packaged assets use WebViewAssetLoader');
  mustMatch(activity, /Log\.e\("SightlineV6", "Web console "/, 'console errors are logged');
  mustMatch(activity, /message\.sourceId\(\)/, 'console logs identify their source line');
  mustMatch(activity, /onReceivedError\(WebView v, WebResourceRequest request, WebResourceErrorCompat error\)/, 'failed asset requests use the WebViewAssetLoader-compatible error hook');
  mustMatch(activity, /onReceivedHttpError\(WebView v, WebResourceRequest request, WebResourceResponse response\)/, 'HTTP asset failures are logged');
  mustMatch(activity, /webview:/, 'native and WebView dimensions are reported');
  mustMatch(activity, /canvasPixels:/, 'canvas CSS and drawing-buffer dimensions are reported');
  mustMatch(activity, /soundSvg:/, 'speaker geometry is reported');
  mustMatch(activity, /deployHit:/, 'Deploy target hit-test is reported');
  mustMatch(activity, /introSkipHit:/, 'intro target hit-test is reported');
  mustMatch(activity, /\[SL_ANDROID_INPUT\]/, 'critical touch targets report pointerdown and click');
  mustMatch(activity, /BuildConfig\.DEBUG/, 'diagnostic instrumentation is debug-only');
});

test('diagnostic remains an update to the installed package and bundles its runtime entrypoints', () => {
  const gradle = read('AndroidProject/app/build.gradle');
  const version = read('AndroidProject/app/version.properties');
  const mainPage = pages[0][1];
  mustMatch(gradle, /applicationId 'com\.sightline\.v3'/, 'application identity is preserved');
  mustMatch(gradle, /compileSdk 36/, 'existing SDK workflow is preserved');
  const code = Number(version.match(/^VERSION_CODE=(\d+)$/m)?.[1]);
  const name = version.match(/^VERSION_NAME=(.+)$/m)?.[1];
  assert.ok(Number.isSafeInteger(code) && code >= 18, 'the installed package version has not regressed');
  assert.ok(name && name.endsWith('-' + code), 'version name remains tied to its source version code');
  mustMatch(mainPage, /<script[^>]+src="three\.min\.js"/, 'Three.js is locally bundled');
  assert.ok(fs.existsSync(path.join(root, 'AndroidProject/app/src/main/assets/www/three.min.js')));
  assert.ok(fs.existsSync(path.join(root, 'AndroidProject/app/src/main/assets/www/sightline-theme.mp3')));
  assert.ok(fs.existsSync(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS')));
});

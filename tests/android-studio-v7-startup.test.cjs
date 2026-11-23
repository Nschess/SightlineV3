const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const project = path.join(root, 'AndroidProject');
const activityPath = path.join(project, 'app/src/main/java/com/sightline/v3/MainActivity.java');
const activity = fs.readFileSync(activityPath, 'utf8');
const manifest = fs.readFileSync(path.join(project, 'app/src/main/AndroidManifest.xml'), 'utf8');
const offlinePage = fs.readFileSync(path.join(project, 'app/src/main/assets/www/index.html'), 'utf8');
const hostPagePath = path.join(project, 'app/src/main/assets/phone-host/index.html');
const hostPage = fs.readFileSync(hostPagePath, 'utf8');

test('v7 opens the bundled WebView lobby after the asset loader is ready', () => {
  const start = activity.indexOf('@Override public void onCreate(Bundle state)');
  const end = activity.indexOf('private void immersive()', start);
  assert.ok(start >= 0 && end > start, 'onCreate block is present');
  const onCreate = activity.slice(start, end);
  assert.ok(onCreate.indexOf('new WebViewAssetLoader.Builder()') >= 0);
  assert.ok(onCreate.indexOf('openGame(null);') > onCreate.indexOf('new WebViewAssetLoader.Builder()'));
  assert.doesNotMatch(onCreate, /showHome\(\);/, 'legacy native launcher is not the startup screen');
});

test('Offline and secure LAN launcher actions remain reachable from Android Back', () => {
  assert.match(activity, /button\("Play Offline",\s*\(\)\s*->\s*openGame\(null\)\)/);
  assert.match(activity, /button\("Join Secure LAN Game",\s*this::askForHost\)/);
  const backStart = activity.indexOf('private void handleBack()');
  const backEnd = activity.indexOf('@Override public void onBackPressed()', backStart);
  assert.ok(backStart >= 0 && backEnd > backStart);
  assert.match(activity.slice(backStart, backEnd), /setPositiveButton\("Return",[\s\S]*?showHome\(\)/);
  assert.match(activity, /Return to game selection\? This player leaves the match/,
    'Android Back confirms leaving the current match before returning to the launcher.');

  const routeStart = activity.indexOf('private void openGame(String lanHost, boolean autoJoin)');
  const routeEnd = activity.indexOf('private void toast(', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const route = activity.slice(routeStart, routeEnd);
  assert.match(route, /if\s*\(lanHost\s*!=\s*null\)\s*\{\s*if\s*\(BuildConfig\.SECURE_LAN_RELEASE\)/);
  assert.match(route, /if\s*\(lanHost\s*==\s*null\)\s*web\.loadUrl\(OFFLINE_URL\)/);
});

test('Offline navigation serves the packaged Lobby v10 page locally', () => {
  assert.match(activity, /OFFLINE_URL\s*=\s*"https:\/\/"\s*\+\s*ASSET_DOMAIN\s*\+\s*"\/assets\/www\/index\.html"/);
  assert.match(activity, /addPathHandler\("\/assets\/",\s*new WebViewAssetLoader\.AssetsPathHandler\(this\)\)/);
  assert.match(activity, /if\s*\(lanHost\s*==\s*null\)\s*web\.loadUrl\(OFFLINE_URL\)/);
  assert.ok(offlinePage.includes('id="sightline-lobby-10-premium"'));
  assert.ok(offlinePage.includes('function renderMenu(keep)'));
  assert.ok(offlinePage.includes("classList.toggle('sl-lobby-screen',lobbyActive)"));
  assert.match(offlinePage, /<div class="ov menu" id="ov-start">/);
  assert.match(offlinePage, /refreshSpec\(\);\s*renderMenu\(false\);/);
});

test('Native configuration preserves landscape, app identity, and monotonic version metadata', () => {
  assert.match(manifest, /android:screenOrientation="sensorLandscape"/);
  assert.match(manifest, /android:name="\.MainActivity"/);
  assert.match(fs.readFileSync(path.join(project, 'app/build.gradle'), 'utf8'), /applicationId\s+'com\.sightline\.v3'/);
  const version = fs.readFileSync(path.join(project, 'app/version.properties'), 'utf8');
  const code = Number(version.match(/^VERSION_CODE=(\d+)$/m)?.[1]);
  const name = version.match(/^VERSION_NAME=(.+)$/m)?.[1];
  assert.ok(Number.isSafeInteger(code) && code >= 7, 'the installed package version has not regressed');
  assert.ok(name && name.endsWith('-' + code), 'version name remains tied to its source version code');
});

test('Audio settings, viewport, intro touch and preview recovery remain in the bundled pages', () => {
  for (const page of [offlinePage, hostPage]) {
    assert.match(page, /\['audio',\s*'Audio'\]/);
    assert.match(page, /function mobileSettingsSpec\(tab\)[\s\S]*?if \(tab === 'audio'\) return SPEC\.audio\.filter/);
    assert.match(page, /data-act="p111-mute"/);
    assert.doesNotMatch(page, /id="mn-sound"|class="mn-sound"/, 'the retired lobby speaker overlay is not duplicated');
  }
  assert.match(offlinePage, /touch-action:manipulation/);
  assert.match(offlinePage, /function updateLobbyPreviewForFrame\(active\)/);
});

test('phone-host page still matches its Android integrity pin', () => {
  const hostDigest = crypto.createHash('sha256').update(hostPage).digest('hex');
  const match = activity.match(/HOST_BUNDLE_SHA256\s*=\s*"([a-f0-9]{64})"/);
  assert.ok(match, 'native host integrity pin is present');
  assert.equal(match[1], hostDigest);
});

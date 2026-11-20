'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../AndroidProject');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const activity = read('app/src/main/java/com/sightline/v3/MainActivity.java');
const gradle = read('app/build.gradle');
const host = read('app/src/main/assets/phone-host/server.js');

test('Play launcher exposes the approved policy as a user-initiated browser link', () => {
  assert.match(activity, /if \(BuildConfig\.PLAY_DISTRIBUTION\)\s*\{\s*layout\.addView\(button\("Privacy Policy", this::openPrivacyPolicy\)\)/);
  assert.match(activity, /new Intent\(Intent\.ACTION_VIEW, Uri\.parse\(BuildConfig\.PRIVACY_POLICY_URL\)\)/);
  assert.match(gradle, /if \(!privacyPolicyUrl\)\s*\{\s*throw new GradleException/);
  assert.match(read('tools/build-play-bundle.ps1'), /-PsightlinePrivacyPolicyUrl=\$PrivacyPolicyUrl/);
});

test('production WebView console output is consumed after the match-full signal is handled', () => {
  const callback = activity.slice(activity.indexOf('public boolean onConsoleMessage'),
    activity.indexOf('web.setWebViewClient(new WebViewClientCompat()'));
  assert.match(callback, /SL_LAN_MATCH_FULL[\s\S]*if \(BuildConfig\.PLAY_DISTRIBUTION\) return true;[\s\S]*return super\.onConsoleMessage/);
});

test('secure host connection logs omit nicknames without changing dev logs or joined player names', () => {
  const helper = host.match(/^function logPlayerConnection\([^\n]+\n[\s\S]+?^}/m)[0];
  const player = { name: 'PrivateNickname' };
  for (const event of ['joined:', 'left:', 'timeout:']) {
    assert.ok(host.includes(`logPlayerConnection('${event}',`));
    for (const release of [true, false]) {
      const calls = [];
      vm.runInNewContext(helper + '\nlogPlayerConnection(event, player, "count");',
        { RELEASE_TLS: release, event, player, log: (...args) => calls.push(args) });
      assert.deepEqual(calls, [release ? [event, 'count'] : [event, player.name, 'count']]);
      assert.equal(player.name, 'PrivateNickname');
    }
  }
  assert.match(host, /me = addPlayer\(c, m\.name\)/);
});

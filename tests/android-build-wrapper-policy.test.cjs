'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bat = fs.readFileSync(path.join(root, 'AndroidProject/build-debug.bat'), 'utf8');
const ps = fs.readFileSync(path.join(root, 'AndroidProject/tools/bootstrap-build.ps1'), 'utf8');
const wrapperProperties = fs.readFileSync(path.join(root, 'AndroidProject/gradle/wrapper/gradle-wrapper.properties'), 'utf8');

test('debug build entrypoint does not bypass PowerShell execution policy', () => {
  assert.doesNotMatch(bat, /powershell\s+-ExecutionPolicy/i);
  assert.match(bat, /call gradlew\.bat --no-daemon :app:assembleDebug/i);
  assert.doesNotMatch(bat, /ExecutionPolicy\s+Bypass/i);
});

test('build preflight pins JDK 17, SDK 36, build tools, and the checked-in Gradle 8.13 wrapper', () => {
  assert.match(bat, /JAVA_MAJOR%"=="17"/);
  assert.match(bat, /platforms\\android-36\\android\.jar/);
  assert.match(bat, /Build Tools 35\.0\.0 or newer/);
  assert.match(bat, /gradle\\wrapper\\gradle-wrapper\.jar/);
  assert.match(wrapperProperties, /gradle-8\.13-bin\.zip/);
});

test('valid wrapper builds debug only without requiring installed system Gradle or release credentials', () => {
  assert.match(bat, /gradlew\.bat --no-daemon :app:assembleDebug/i);
  assert.match(ps, /build-debug\.bat/);
  assert.doesNotMatch(ps, /Get-Command\s+gradle/);
  assert.doesNotMatch(bat, /assembleRelease|bundleRelease|SIGHTLINE_KEYSTORE/);
  assert.match(bat, /apksigner\.bat.*verify/i);
  assert.match(bat, /zipalign\.exe.*-c/i);
  assert.match(bat, /com\.sightline\.v3/);
});


'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifestName = 'ANDROID-PERFORMANCE-AND-BUILD-RELIABILITY-5.0-MANIFEST.json';
const fail = message => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestPath = path.join(root, manifestName);
if (!fs.existsSync(manifestPath)) throw new Error(`Missing ${manifestName} at ${root}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.packageName !== 'SightlineV3-Android-Performance-Build-5.0-EXPERIMENTAL-DEV-2026-11-05') throw new Error('Wrong package identity.');

const expected = new Set();
for (const item of manifest.files) {
  const rel = item.path.replace(/\\/g, '/');
  if (!rel || path.posix.isAbsolute(rel) || rel.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe manifest path: ${item.path}`);
  const file = path.resolve(root, ...rel.split('/'));
  if (!file.startsWith(root + path.sep)) throw new Error(`Path escapes package root: ${rel}`);
  if (expected.has(rel)) throw new Error(`Duplicate manifest path: ${rel}`);
  expected.add(rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing file: ${rel}`);
  if (fs.statSync(file).size !== item.size || sha256(file) !== item.sha256) throw new Error(`Size/SHA-256 mismatch: ${rel}`);
}
const actual = new Set();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (rel !== manifestName) actual.add(rel);
    } else throw new Error(`Unsupported package entry: ${file}`);
  }
}
walk(root);
for (const rel of actual) if (!expected.has(rel)) fail(`Unmanifested file: ${rel}`);
for (const rel of expected) if (!actual.has(rel)) fail(`Manifest-only file: ${rel}`);
if (manifest.fileCountExcludingManifest !== expected.size) fail('Manifest file count mismatch.');
if (manifest.ownership.removedParentFiles.length || manifest.ownership.unexpectedChanges.length) fail('Parent files removed or out-of-scope changes exist.');
if (manifest.ownership.changedLegendaryFiles.length || manifest.ownership.legendaryFilesChecked < 1) fail('Legendary source changed or was not audited.');
if (!manifest.ownership.gameplayServerUnchanged || !manifest.ownership.offlineAndPhoneHostPagesIdentical) fail('Protected runtime source identity/parity failed.');
if (sha256(path.join(root, 'AGENTS.md')) !== manifest.currentSourceFingerprints.projectInstructionsSha256) fail('Root AGENTS.md mismatch.');
if (manifest.currentSourceFingerprints.projectInstructionsSha256 !== 'df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2') fail('Project instructions are not the expected current version.');
if (manifest.apkIncluded !== false) fail('Candidate must not imply an APK is included.');

for (const [rel, expectedHash] of [
  ['AndroidProject/app/src/main/assets/phone-host/server.js', manifest.currentSourceFingerprints.phoneHostServerSha256],
  ['AndroidProject/app/src/main/assets/phone-host/index.html', manifest.currentSourceFingerprints.phoneHostPageSha256],
  ['AndroidProject/app/src/main/assets/www/index.html', manifest.currentSourceFingerprints.offlinePageSha256],
  ['AndroidProject/app/src/main/assets/phone-host/SHA256SUMS', manifest.currentSourceFingerprints.phoneHostAssetManifestSha256],
  ['AndroidProject/CURRENT-SOURCE-SHA256.txt', manifest.currentSourceFingerprints.androidSourceManifestSha256],
  ['AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java', manifest.currentSourceFingerprints.mainActivitySha256]
]) if (sha256(path.join(root, rel)) !== expectedHash) fail(`Source fingerprint mismatch: ${rel}`);

const required = [
  'AGENTS.md', 'START-HOST.bat', 'SIGHTLINE.bat',
  'ANDROID-PERFORMANCE-AND-BUILD-RELIABILITY-5.0-QUICKSTART.md',
  'acceptance/ANDROID-PERFORMANCE-AND-BUILD-RELIABILITY-5.0.md',
  'acceptance/android-performance-5.0-regressions-final.log',
  'acceptance/android-performance-5.0-build-attempt.log',
  'AndroidProject/build-debug.bat', 'rollback/2026-11-05-pre-android-build-script-hardening/AndroidProject/build-debug.bat'
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) fail(`Missing required candidate file: ${rel}`);
if (!process.exitCode) console.log(JSON.stringify({
  status: 'PASS', packageName: manifest.packageName, verifiedFiles: expected.size,
  manifestSha256: sha256(manifestPath), rootInstructionsSha256: sha256(path.join(root, 'AGENTS.md')),
  serverSha256: manifest.currentSourceFingerprints.phoneHostServerSha256,
  pageSha256: manifest.currentSourceFingerprints.phoneHostPageSha256,
  legendaryFilesUnchanged: manifest.ownership.legendaryFilesChecked,
  parentPackageSha256: manifest.rollback.parentPackageSha256,
  apkIncluded: manifest.apkIncluded
}, null, 2));

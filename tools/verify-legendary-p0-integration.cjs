'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const work = path.resolve(__dirname, '..', '..', '..');
const roots = {
  base: path.join(work, 'production-stabilization-20261109', 'DEV'),
  accepted: path.join(work, 'legendary-design-studio-20261109', 'DEV'),
  integrated: path.join(work, 'legendary-p0-integration-20261109', 'DEV')
};
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = (root, rel) => path.join(root, ...rel.split('/'));
function assertHash(file, expected, label) {
  const actual = sha(file);
  if (actual !== expected.toLowerCase()) throw new Error(label + ': expected ' + expected + ', got ' + actual);
}
function verifyManifest(root, manifestPath, label) {
  const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const entry of entries) assertHash(relative(root, entry.Path.replace(/\\/g, '/')), entry.SHA256, label + ' ' + entry.Path);
  return entries.length;
}
function inventory(root) {
  const out = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else out.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
  walk(root);
  return out.sort();
}

const expected = {
  baseOffline: 'e3f86554ff8a9c67e00cc4f84d3ffb7e97e1173c7a59bd210c7bbb55aaee97bd',
  baseHost: '4c0c546ce704c9c77310b0c98fc8f0080692dd6f668229f685b6066bed1fa660',
  acceptedOffline: 'd46d9f6243e88cb0235eacd4b96570713c91f841b3ed2fddf2463935edc14d47',
  acceptedHost: 'fbd3bbd8a5ec4d04e1f6802f586e7cd42cebeeec618aa3c66678d5ef6fc551e3'
};
const sourceFiles = [
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html',
  'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java',
  'AndroidProject/CURRENT-SOURCE-SHA256.txt'
];
const unchanged = [
  'AndroidProject/app/src/main/assets/www/weapon-skins.js',
  'AndroidProject/app/src/main/assets/www/legend-overlay.js',
  'AndroidProject/app/src/main/assets/www/legendary-packs.js',
  'AndroidProject/app/src/main/assets/phone-host/server.js',
  'START-HOST.bat', 'SIGHTLINE.bat', 'AGENTS.md'
];

assertHash(relative(roots.base, sourceFiles[0]), expected.baseOffline, 'authoritative offline identity');
assertHash(relative(roots.base, sourceFiles[1]), expected.baseHost, 'authoritative phone-host identity');
assertHash(relative(roots.accepted, sourceFiles[0]), expected.acceptedOffline, 'accepted P0 offline identity');
assertHash(relative(roots.accepted, sourceFiles[1]), expected.acceptedHost, 'accepted P0 phone-host identity');

const currentSourceRows = fs.readFileSync(relative(roots.integrated, 'AndroidProject/CURRENT-SOURCE-SHA256.txt'), 'utf8').trim().split(/\r?\n/);
if (currentSourceRows.length !== 112) throw new Error('Expected 112 Android source hashes, got ' + currentSourceRows.length);
for (const row of currentSourceRows) {
  const match = row.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error('Malformed Android source hash row: ' + row);
  assertHash(relative(roots.integrated, 'AndroidProject/' + match[2]), match[1], 'Android source ' + match[2]);
}
const phoneHostRoot = relative(roots.integrated, 'AndroidProject/app/src/main/assets/phone-host');
const hostRows = fs.readFileSync(path.join(phoneHostRoot, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/);
for (const row of hostRows) {
  const match = row.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error('Malformed phone-host hash row: ' + row);
  assertHash(path.join(phoneHostRoot, match[2]), match[1], 'Phone-host asset ' + match[2]);
}
if (hostRows.length !== 48) throw new Error('Expected 48 phone-host inventory rows, got ' + hostRows.length);
const activity = fs.readFileSync(relative(roots.integrated, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'), 'utf8');
const phoneHash = sha(path.join(phoneHostRoot, 'index.html'));
if (!activity.includes('HOST_BUNDLE_SHA256 = "' + phoneHash + '"')) throw new Error('Android host bundle pin does not match phone-host HTML');

const baseAndroid = new Set(inventory(relative(roots.base, 'AndroidProject')));
const mergedAndroid = new Set(inventory(relative(roots.integrated, 'AndroidProject')));
const expectedChanged = new Set(sourceFiles.map(f => f.replace(/^AndroidProject\//, '')));
const changed = [...baseAndroid].filter(rel => mergedAndroid.has(rel) && sha(relative(roots.base, 'AndroidProject/' + rel)) !== sha(relative(roots.integrated, 'AndroidProject/' + rel))).sort();
const added = [...mergedAndroid].filter(rel => !baseAndroid.has(rel)).sort();
const removed = [...baseAndroid].filter(rel => !mergedAndroid.has(rel)).sort();
if (JSON.stringify(changed) !== JSON.stringify([...expectedChanged].sort())) throw new Error('Unexpected Android changes: ' + JSON.stringify(changed));
if (added.length || removed.length) throw new Error('Unexpected Android inventory changes; added=' + JSON.stringify(added) + ', removed=' + JSON.stringify(removed));
for (const rel of unchanged) assertHash(relative(roots.integrated, rel), sha(relative(roots.base, rel)), 'preserved ' + rel);

const p0Checkpoint = relative(roots.accepted, 'acceptance/legendary-p0-provisionally-accepted-20261109/PROVISIONAL-CHECKPOINT-MANIFEST.json');
const p0Manifest = JSON.parse(fs.readFileSync(p0Checkpoint, 'utf8'));
let p0CheckpointFiles = 0;
for (const entry of p0Manifest.Files) { assertHash(relative(roots.accepted, entry.Path.replace(/\\/g, '/')), entry.SHA256, 'frozen P0 file ' + entry.Path); p0CheckpointFiles++; }
assertHash(relative(roots.accepted, 'acceptance/legendary-p0-provisionally-accepted-20261109/CURRENT-SOURCE-SHA256.txt'), p0Manifest.CurrentSourceManifestSha256, 'frozen P0 source manifest');
const p0RollbackRoot = relative(roots.accepted, 'rollback/legendary-p0-audio-killfix-20261109-before');
const integrationRollbackRoot = relative(roots.integrated, 'rollback/legendary-p0-integration-20261109-before');
const p0RollbackCount = verifyManifest(p0RollbackRoot, path.join(p0RollbackRoot, 'SHA256-MANIFEST.json'), 'P0 prior rollback');
const integrationRollbackCount = verifyManifest(integrationRollbackRoot, path.join(integrationRollbackRoot, 'ROLLBACK-MANIFEST.json'), 'integration rollback');

const web = fs.readFileSync(relative(roots.integrated, 'AndroidProject/app/src/main/assets/www/index.html'), 'utf8');
const host = fs.readFileSync(relative(roots.integrated, 'AndroidProject/app/src/main/assets/phone-host/index.html'), 'utf8');
const audioStart = 'var LEGEND_AUDIO_PROFILES={', audioEnd = 'var legendSeenEvents=';
if (web.slice(web.indexOf(audioStart), web.indexOf(audioEnd, web.indexOf(audioStart))) !== host.slice(host.indexOf(audioStart), host.indexOf(audioEnd, host.indexOf(audioStart)))) throw new Error('Offline and phone-host Legendary audio blocks differ');
for (const key of ['smg','breacher','rook117','carbine','stinger','aurora','falcon','longbow','ranger','tide','hawk','scatter','bulwark','rampart','needle']) {
  if (!web.includes(key + ':{') || !host.includes(key + ':{')) throw new Error('Missing Legendary audio/FX key on a page: ' + key);
}

console.log(JSON.stringify({
  status: 'PASS',
  currentSourceRows: currentSourceRows.length,
  phoneHostInventoryRows: hostRows.length,
  changedAndroidFiles: changed,
  addedAndroidFiles: added.length,
  removedAndroidFiles: removed.length,
  preservedFiles: unchanged,
  frozenP0CheckpointFiles: p0CheckpointFiles,
  preservedP0RollbackFiles: p0RollbackCount,
  integrationRollbackFiles: integrationRollbackCount,
  offlineSha256: sha(relative(roots.integrated, sourceFiles[0])),
  phoneHostSha256: phoneHash,
  phoneHostInventorySha256: sha(relative(roots.integrated, 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS')),
  mainActivitySha256: sha(relative(roots.integrated, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java')),
  androidSourceManifestSha256: sha(relative(roots.integrated, 'AndroidProject/CURRENT-SOURCE-SHA256.txt')),
  releaseArtifactsCreated: false
}, null, 2));

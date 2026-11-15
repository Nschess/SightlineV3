'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const android = path.join(root, 'AndroidProject');
const hostDir = path.join(android, 'app/src/main/assets/phone-host');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function replaceHashLine(text, rel, digest, label) {
  const escaped = rel.replace(/\./g, '\\.');
  const pattern = new RegExp('^[a-f0-9]{64}(  ' + escaped + ')$', 'm');
  if (!pattern.test(text)) throw new Error('Missing hash row for ' + label + ': ' + rel);
  return text.replace(pattern, digest + '$1');
}

const hostPage = path.join(hostDir, 'index.html');
const hostPageHash = hash(hostPage);
const hostSumsPath = path.join(hostDir, 'SHA256SUMS');
let hostSums = fs.readFileSync(hostSumsPath, 'utf8');
hostSums = replaceHashLine(hostSums, 'index.html', hostPageHash, 'phone-host page');
fs.writeFileSync(hostSumsPath, hostSums, 'utf8');

const activityPath = path.join(android, 'app/src/main/java/com/sightline/v3/MainActivity.java');
let activity = fs.readFileSync(activityPath, 'utf8');
const pinPattern = /HOST_BUNDLE_SHA256\s*=\s*"[a-f0-9]{64}"/;
if (!pinPattern.test(activity)) throw new Error('Could not find the host bundle SHA-256 pin.');
activity = activity.replace(pinPattern, 'HOST_BUNDLE_SHA256 = "' + hostPageHash + '"');
fs.writeFileSync(activityPath, activity, 'utf8');

const sourceManifestPath = path.join(android, 'CURRENT-SOURCE-SHA256.txt');
let rows = fs.readFileSync(sourceManifestPath, 'utf8').trim().split(/\r?\n/);
const seen = new Set();
rows = rows.map(row => {
  const m = row.match(/^([a-f0-9]{64})  (.+)$/);
  if (!m) throw new Error('Malformed Android source manifest row: ' + row);
  if (seen.has(m[2])) throw new Error('Duplicate source manifest row: ' + m[2]);
  seen.add(m[2]);
  return hash(path.resolve(android, ...m[2].split('/'))) + '  ' + m[2];
});
fs.writeFileSync(sourceManifestPath, rows.join('\n') + '\n', 'utf8');

console.log(JSON.stringify({
  status: 'UPDATED',
  offlinePageSha256: hash(path.join(android, 'app/src/main/assets/www/index.html')),
  phoneHostPageSha256: hostPageHash,
  phoneHostInventorySha256: hash(hostSumsPath),
  mainActivitySha256: hash(activityPath),
  androidSourceEntries: rows.length
}, null, 2));

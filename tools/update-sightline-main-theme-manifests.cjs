'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const android = path.join(root, 'AndroidProject');
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function renameRows(file, replacements) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = text.trim().split(/\r?\n/);
  const paths = rows.map(row => {
    const m = row.match(/^([a-f0-9]{64})  (.+)$/);
    if (!m) throw new Error('Malformed hash row: ' + row);
    return m[2];
  });
  for (const [oldPath, newPath] of Object.entries(replacements)) {
    const count = paths.filter(p => p === oldPath || p === newPath).length;
    if (count !== 1) throw new Error('Expected exactly one old or current row for ' + newPath + ' in ' + file + ', found ' + count);
  }
  const rewritten = rows.map(row => {
    const m = row.match(/^([a-f0-9]{64})  (.+)$/);
    if (!m) throw new Error('Malformed hash row: ' + row);
    const updated = replacements[m[2]] || m[2];
    return m[1] + '  ' + updated;
  });
  if (new Set(rewritten.map(row => row.slice(66))).size !== rewritten.length) throw new Error('Duplicate manifest paths in ' + file);
  fs.writeFileSync(file, rewritten.join('\n') + '\n', 'utf8');
}
function refreshManifest(file, base) {
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(row => {
    const m = row.match(/^([a-f0-9]{64})  (.+)$/);
    if (!m) throw new Error('Malformed hash row: ' + row);
    const target = path.resolve(base, ...m[2].split('/'));
    if (!target.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(target)) throw new Error('Missing or unsafe manifest target: ' + m[2]);
    return hashFile(target) + '  ' + m[2];
  });
  if (new Set(rows.map(row => row.slice(66))).size !== rows.length) throw new Error('Duplicate manifest paths in ' + file);
  fs.writeFileSync(file, rows.join('\n') + '\n', 'utf8');
}
renameRows(path.join(android, 'CURRENT-SOURCE-SHA256.txt'), {
  'app/src/main/assets/www/before-the-storm.wav': 'app/src/main/assets/www/sightline-main-theme.wav',
  'app/src/main/assets/phone-host/before-the-storm.wav': 'app/src/main/assets/phone-host/sightline-main-theme.wav'
});
renameRows(path.join(android, 'app/src/main/assets/phone-host/SHA256SUMS'), {
  'before-the-storm.wav': 'sightline-main-theme.wav'
});
refreshManifest(path.join(android, 'CURRENT-SOURCE-SHA256.txt'), android);
refreshManifest(path.join(android, 'app/src/main/assets/phone-host/SHA256SUMS'), path.join(android, 'app/src/main/assets/phone-host'));
const hostPageHash = hashFile(path.join(android, 'app/src/main/assets/phone-host/index.html'));
const activityPath = path.join(android, 'app/src/main/java/com/sightline/v3/MainActivity.java');
let activity = fs.readFileSync(activityPath, 'utf8');
const pin = /HOST_BUNDLE_SHA256\s*=\s*"[a-f0-9]{64}"/;
if (!pin.test(activity)) throw new Error('Phone-host fingerprint pin is missing');
activity = activity.replace(pin, 'HOST_BUNDLE_SHA256 = "' + hostPageHash + '"');
fs.writeFileSync(activityPath, activity, 'utf8');
refreshManifest(path.join(android, 'CURRENT-SOURCE-SHA256.txt'), android);
for (const file of [
  path.join(android, 'app/src/main/assets/www/sightline-main-theme.wav'),
  path.join(android, 'app/src/main/assets/phone-host/sightline-main-theme.wav')
]) if (!fs.existsSync(file)) throw new Error('Generated theme file is missing: ' + file);
console.log(JSON.stringify({ status: 'UPDATED', defaultTheme: 'BREACH VECTOR', route: '/sightline-main-theme.wav' }, null, 2));

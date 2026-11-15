'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const current = path.resolve(__dirname, '..');
const baseline = path.resolve(process.argv[2] || path.join(current, '..', '..', 'android-apk-restoration-5.1-20261105', 'DEV'));
const out = path.resolve(process.argv[3] || path.join(current, 'acceptance/gameplay-quality-6.0-parent-diff.json'));
const excluded = ['AndroidProject/.gradle', 'AndroidProject/build', 'AndroidProject/app/build'];
const isExcluded = rel => excluded.some(p => rel === p || rel.startsWith(p + '/'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function scan(root) {
  const files = new Map();
  function walk(abs, rel = '') {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (isExcluded(childRel) || childRel === 'GAMEPLAY-QUALITY-6.0-MANIFEST.json') continue;
      const childAbs = path.join(abs, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`unexpected symbolic link: ${childRel}`);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (entry.isFile()) {
        const data = fs.readFileSync(childAbs);
        files.set(childRel, { size: data.length, sha256: sha(data) });
      }
    }
  }
  walk(root);
  return files;
}
if (!fs.statSync(baseline).isDirectory()) throw new Error(`baseline DEV directory not found: ${baseline}`);
const before = scan(baseline), after = scan(current), missing = [], added = [], changed = [];
for (const [rel, f] of before) {
  const c = after.get(rel);
  if (!c) missing.push(rel);
  else if (f.sha256 !== c.sha256) changed.push({ path: rel, before: f, after: c });
}
for (const rel of after.keys()) if (!before.has(rel)) added.push({ path: rel, ...after.get(rel) });
const androidBefore = [...before.keys()].filter(p => p.startsWith('AndroidProject/')).length;
const androidChanged = changed.filter(x => x.path.startsWith('AndroidProject/'));
const result = {
  schemaVersion: 1,
  candidate: 'Sightline V3 Gameplay Quality 6.0 Experimental DEV',
  baseline: path.basename(path.dirname(baseline)) + '/' + path.basename(baseline),
  excludedGeneratedDirectories: excluded,
  baselineFileCount: before.size,
  candidateFileCount: after.size,
  missingCount: missing.length,
  missing,
  addedCount: added.length,
  added,
  changedCount: changed.length,
  changed,
  androidProjectBaselineFileCount: androidBefore,
  androidProjectChangedCount: androidChanged.length,
  status: missing.length === 0 && androidChanged.length === 0 ? 'PASS' : 'REVIEW'
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ out, status: result.status, baselineFiles: result.baselineFileCount, candidateFiles: result.candidateFileCount, missing: result.missingCount, added: result.addedCount, changed: result.changedCount, androidFiles: result.androidProjectBaselineFileCount, androidChanged: result.androidProjectChangedCount }, null, 2));

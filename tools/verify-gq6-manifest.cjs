'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestName = 'GAMEPLAY-QUALITY-6.0-MANIFEST.json';
const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestName), 'utf8'));
const excluded = manifest.excludedGeneratedDirectories;
const isExcluded = rel => excluded.some(p => rel === p || rel.startsWith(p + '/'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const actual = new Map();
function walk(abs, rel = '') {
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (isExcluded(childRel) || childRel === manifestName) continue;
    const childAbs = path.join(abs, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`unexpected symbolic link: ${childRel}`);
    if (entry.isDirectory()) walk(childAbs, childRel);
    else if (entry.isFile()) actual.set(childRel, fs.readFileSync(childAbs));
  }
}
walk(root);
const expected = new Map(manifest.files.map(f => [f.path, f]));
const errors = [];
if (expected.size !== manifest.fileCount) errors.push(`manifest file count mismatch: entries=${expected.size}, declared=${manifest.fileCount}`);
for (const [rel, spec] of expected) {
  const data = actual.get(rel);
  if (!data) { errors.push(`missing: ${rel}`); continue; }
  if (data.length !== spec.size) errors.push(`size mismatch: ${rel}`);
  if (sha(data) !== spec.sha256) errors.push(`SHA-256 mismatch: ${rel}`);
}
for (const rel of actual.keys()) if (!expected.has(rel)) errors.push(`unmanifested file: ${rel}`);
console.log(JSON.stringify({ status: errors.length ? 'FAIL' : 'PASS', manifest: manifestName, expectedFiles: expected.size, actualFiles: actual.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;

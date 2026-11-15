'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifestPath = path.join(root, 'PACKAGE-MANIFEST.json');
const checksumPath = `${manifestPath}.sha256`;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const errors = [];
const doc = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expected = new Map();
function safeFile(rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\\') || path.posix.isAbsolute(rel) || rel.split('/').includes('..')) throw new Error(`Unsafe path: ${rel}`);
  const full = path.resolve(root, ...rel.split('/'));
  if (!full.startsWith(root + path.sep)) throw new Error(`Path escapes package: ${rel}`);
  return full;
}
for (const f of doc.files || []) {
  if (expected.has(f.path) || !/^[a-f0-9]{64}$/.test(f.sha256)) { errors.push(`Duplicate or malformed manifest row: ${f.path}`); continue; }
  expected.set(f.path, f.sha256);
  const abs = safeFile(f.path);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) errors.push(`Missing: ${f.path}`);
  else {
    if (fs.statSync(abs).size !== f.size) errors.push(`Size mismatch: ${f.path}`);
    if (sha(fs.readFileSync(abs)) !== f.sha256) errors.push(`SHA-256 mismatch: ${f.path}`);
  }
}
const actual = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name), rel = path.relative(root, abs).split(path.sep).join('/');
    if (rel === 'PACKAGE-MANIFEST.json' || rel === 'PACKAGE-MANIFEST.json.sha256') continue;
    if (ent.isSymbolicLink()) errors.push(`Symbolic link: ${rel}`);
    else if (ent.isDirectory()) walk(abs);
    else if (ent.isFile()) actual.push(rel);
    else errors.push(`Unsupported filesystem entry: ${rel}`);
  }
}
walk(root);
for (const rel of actual) if (!expected.has(rel)) errors.push(`Unlisted: ${rel}`);
for (const rel of expected.keys()) if (!actual.includes(rel)) errors.push(`Not extracted: ${rel}`);
const sumLine = fs.readFileSync(checksumPath, 'utf8').trim();
if (sumLine !== `${sha(fs.readFileSync(manifestPath))}  PACKAGE-MANIFEST.json`) errors.push('Manifest sidecar hash mismatch.');
const fp = doc.sourceFingerprints || {};
for (const [key, rel] of Object.entries({offlinePage:'AndroidProject/app/src/main/assets/www/index.html',phoneHostPage:'AndroidProject/app/src/main/assets/phone-host/index.html',phoneHostServer:'AndroidProject/app/src/main/assets/phone-host/server.js',phoneHostInventory:'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',androidSourceManifest:'AndroidProject/CURRENT-SOURCE-SHA256.txt',projectInstructions:'AGENTS.md'})) {
  if (sha(fs.readFileSync(safeFile(rel))) !== fp[key]) errors.push(`Source fingerprint mismatch: ${key}`);
}
if (!fs.readFileSync(safeFile('AGENTS.md'),'utf8').includes('# Sightline V3 Project Instructions')) errors.push('Root AGENTS.md missing/incomplete.');
if (errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
else console.log(JSON.stringify({status:'PASS',files:actual.length,manifestSha256:sha(fs.readFileSync(manifestPath)),sourceFingerprints:fp},null,2));

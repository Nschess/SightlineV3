'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const strict = process.argv.includes('--strict');
const manifestRel = 'acceptance/EXPANSION-8.1-DEV-MANIFEST.json';
const checksumRel = `${manifestRel}.sha256`;
const manifestPath = path.join(root, ...manifestRel.split('/'));
const checksumPath = path.join(root, ...checksumRel.split('/'));
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const fail = message => { process.stderr.write(`FAIL: ${message}\n`); process.exitCode = 1; };

if (!fs.existsSync(manifestPath) || !fs.existsSync(checksumPath)) throw new Error('Manifest or checksum sidecar is missing.');
const manifestBytes = fs.readFileSync(manifestPath);
const sidecar = fs.readFileSync(checksumPath, 'utf8').trim();
const expectedManifestHash = sidecar.split(/\s+/)[0].toLowerCase();
const actualManifestHash = sha256(manifestBytes);
if (!/^[0-9a-f]{64}$/.test(expectedManifestHash) || expectedManifestHash !== actualManifestHash) fail('manifest sidecar hash mismatch');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported source manifest schema.');
const listed = new Map();
for (const row of manifest.files) {
  if (!row || typeof row.path !== 'string' || path.posix.isAbsolute(row.path) || row.path.split('/').includes('..')) throw new Error(`Unsafe manifest path: ${row && row.path}`);
  if (listed.has(row.path)) throw new Error(`Duplicate manifest path: ${row.path}`);
  listed.set(row.path, row);
}
const actual = new Set();
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (rel === manifestRel || rel === checksumRel || rel === 'tests/.tmp' || rel.startsWith('tests/.tmp/')) continue;
    if (ent.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${rel}`);
    if (ent.isDirectory()) walk(abs);
    else if (ent.isFile()) actual.add(rel);
    else throw new Error(`Unsupported filesystem entry: ${rel}`);
  }
}
walk(root);
let checked = 0;
for (const [rel, row] of listed) {
  const abs = path.resolve(root, ...rel.split('/'));
  if (!abs.startsWith(root + path.sep)) throw new Error(`Manifest path escapes root: ${rel}`);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { fail(`missing file: ${rel}`); continue; }
  const data = fs.readFileSync(abs);
  if (data.length !== row.size) fail(`size mismatch: ${rel}`);
  if (sha256(data) !== row.sha256) fail(`SHA-256 mismatch: ${rel}`);
  checked++;
}
const extra = [...actual].filter(rel => !listed.has(rel));
const missing = [...listed.keys()].filter(rel => !actual.has(rel));
if (strict && extra.length) fail(`unexpected files in strict extracted package: ${extra.join(', ')}`);
if (missing.length) fail(`listed source files missing: ${missing.join(', ')}`);
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'));
if (sha256(agents) !== manifest.sourceFingerprints.projectInstructions) fail('root AGENTS.md does not match manifest');
if (!strict && extra.length) {
  const allowedSourceExtras = new Set(['PACKAGE-MANIFEST.json', 'artifacts/baseline/SightlineV3-Android-5.1-debug-v4.apk']);
  const unapproved = extra.filter(rel => !allowedSourceExtras.has(rel));
  if (unapproved.length) fail(`unexpected source-tree files not in manifest: ${unapproved.join(', ')}`);
}
if (!process.exitCode) process.stdout.write(JSON.stringify({ status: 'PASS', checked, files: manifest.files.length, strict, manifestSha256: actualManifestHash }) + '\n');

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'acceptance/mp-protocol-v2-hardening-manifest-2026-10-30.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const name = 'protocol-v2-security-stabilization-20261030';
const relativeDir = path.join('rollback', name);
const destination = path.join(root, relativeDir);
if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite checkpoint: ${destination}`);
const relatives = [...new Set([
  'AGENTS.md',
  'acceptance/mp-protocol-v2-hardening-manifest-2026-10-30.json',
  'tools/create-protocol-v2-checkpoint.cjs',
  ...manifest.changedFiles.map(file => file.path)
])].sort();
for (const item of relatives) {
  const source = path.resolve(root, item);
  if (!source.startsWith(root + path.sep) || !fs.statSync(source).isFile()) throw new Error(`Missing or unsafe source: ${item}`);
}
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(path.join(destination, 'files'), { recursive: true });
const entries = [];
for (const item of relatives) {
  const source = path.join(root, item), target = path.join(destination, 'files', item);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  const entry = { path: item, bytes: fs.statSync(target).size, sha256: sha256(target) };
  if (entry.sha256 !== sha256(source)) throw new Error(`Copy hash mismatch: ${item}`);
  entries.push(entry);
}
const checkpoint = {
  name,
  createdAtUtc: new Date().toISOString(),
  rollbackToPreChange: 'rollback/ai-combat-multiplayer-correctness-final-20261029',
  scope: 'Scoped protocol source, tests, project instructions, manifests, benchmark evidence, and report; not a complete project backup.',
  files: entries
};
fs.writeFileSync(path.join(destination, 'CHECKPOINT.json'), JSON.stringify(checkpoint, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), entries.map(entry => `${entry.sha256}  ${entry.path}`).join('\n') + '\n', { flag: 'wx' });
for (const entry of entries) {
  const target = path.join(destination, 'files', entry.path);
  if (fs.statSync(target).size !== entry.bytes || sha256(target) !== entry.sha256) throw new Error(`Checkpoint verification failed: ${entry.path}`);
}
console.log(JSON.stringify({ status: 'VERIFIED', path: relativeDir, files: entries.length,
  checkpointSha256: sha256(path.join(destination, 'CHECKPOINT.json')),
  checksumsSha256: sha256(path.join(destination, 'SHA256SUMS.txt')) }, null, 2));

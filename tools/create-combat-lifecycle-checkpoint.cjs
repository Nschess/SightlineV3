#!/usr/bin/env node
'use strict';

// Creates a scoped, immutable rollback checkpoint for the Oct 30 lifecycle work.
// It refuses to overwrite an existing checkpoint and verifies every copied file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const name = 'combat-lifecycle-multiplayer-hardening-20261030';
const relativeDir = path.join('rollback', name);
const destination = path.join(root, relativeDir);
const reportPath = path.join(root, 'acceptance/COMBAT-LIFECYCLE-MULTIPLAYER-HARDENING-2026-10-30.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const relatives = [...new Set(['AGENTS.md', ...report.changedFiles])].sort();
if (relatives.includes('tools/create-combat-lifecycle-checkpoint.cjs') && !fs.existsSync(__filename)) {
  throw new Error('Checkpoint utility listed but missing from source tree.');
}
if (fs.existsSync(destination)) throw new Error(`Refusing to overwrite existing checkpoint: ${destination}`);
for (const relative of relatives) {
  const source = path.resolve(root, relative);
  if (!source.startsWith(root + path.sep) || !fs.statSync(source).isFile()) {
    throw new Error(`Missing or unsafe checkpoint source: ${relative}`);
  }
}

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(path.join(destination, 'files'), { recursive: true });
const entries = [];
for (const relative of relatives) {
  const source = path.join(root, relative);
  const target = path.join(destination, 'files', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  const entry = { path: relative, bytes: fs.statSync(target).size, sha256: sha256(target) };
  if (entry.sha256 !== sha256(source)) throw new Error(`Copy hash mismatch: ${relative}`);
  entries.push(entry);
}

const checkpoint = {
  name,
  createdAtUtc: new Date().toISOString(),
  rollbackToPreChange: 'rollback/ai-combat-multiplayer-correctness-final-20261029',
  scope: 'Scoped snapshot of lifecycle/session source, regression tests, project instructions, and evidence; not a complete project backup.',
  files: entries
};
fs.writeFileSync(path.join(destination, 'CHECKPOINT.json'), JSON.stringify(checkpoint, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), entries.map(entry => `${entry.sha256}  ${entry.path}`).join('\n') + '\n', { flag: 'wx' });
for (const entry of entries) {
  const target = path.join(destination, 'files', entry.path);
  if (fs.statSync(target).size !== entry.bytes || sha256(target) !== entry.sha256) {
    throw new Error(`Checkpoint verification failed: ${entry.path}`);
  }
}
process.stdout.write(JSON.stringify({ status: 'VERIFIED', path: relativeDir, files: entries.length,
  checkpointSha256: sha256(path.join(destination, 'CHECKPOINT.json')) }, null, 2) + '\n');

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifestName = 'GAMEPLAY-LAN-ZOMBIES-4.0-MANIFEST.json';
const manifestPath = path.join(root, manifestName);
const fail = message => { console.error(`FAIL: ${message}`); process.exitCode = 1; };
if (!fs.existsSync(manifestPath)) throw new Error(`Manifest missing: ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.packageName !== 'SightlineV3-Gameplay-LAN-Zombies-4.0-EXPERIMENTAL-DEV-2026-11-05') throw new Error('Unexpected package identity.');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const expected = new Set();
for (const entry of manifest.files) {
  const rel = entry.path.replace(/\\/g, '/');
  if (!rel || path.posix.isAbsolute(rel) || rel.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe manifest path: ${entry.path}`);
  const file = path.resolve(root, ...rel.split('/'));
  if (!file.startsWith(root + path.sep)) throw new Error(`Manifest path escapes root: ${entry.path}`);
  expected.add(rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing file: ${rel}`);
  if (fs.statSync(file).size !== entry.size) throw new Error(`Size mismatch: ${rel}`);
  const actual = digest(file);
  if (actual !== entry.sha256) throw new Error(`SHA-256 mismatch: ${rel}`);
}
const actualPaths = new Set();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (rel !== manifestName) actualPaths.add(rel);
    } else throw new Error(`Unsupported filesystem entry: ${path.relative(root, file)}`);
  }
}
walk(root);
for (const rel of actualPaths) if (!expected.has(rel)) fail(`Unmanifested file: ${rel}`);
for (const rel of expected) if (!actualPaths.has(rel)) fail(`Manifest-only file: ${rel}`);
const instructions = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
for (const marker of ['# Sightline V3 Project Instructions', 'Protected baselines and scope', 'Three.js r128', 'Acceptance evidence']) if (!instructions.includes(marker)) fail(`Project AGENTS.md missing required section: ${marker}`);
for (const required of ['START-HOST.bat', 'SIGHTLINE.bat', 'AndroidProject/CURRENT-SOURCE-SHA256.txt', 'acceptance/gameplay-lan-zombies-4.0-regressions.log']) if (!fs.existsSync(path.join(root, ...required.split('/')))) fail(`Required package file missing: ${required}`);
if (!process.exitCode) console.log(JSON.stringify({ status: 'PASS', packageName: manifest.packageName, verifiedFiles: expected.size, manifestSha256: digest(manifestPath), rootInstructionsSha256: digest(path.join(root, 'AGENTS.md')), hostServerSha256: digest(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js')) }, null, 2));

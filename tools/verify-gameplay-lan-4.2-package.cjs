'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifestName = 'GAMEPLAY-LAN-ZOMBIES-4.2-MANIFEST.json';
const fail = message => { console.error('FAIL: ' + message); process.exitCode = 1; };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestFile = path.join(root, manifestName);
if (!fs.existsSync(manifestFile)) throw new Error('Missing ' + manifestName + ' at ' + root);
const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
if (m.packageName !== 'SightlineV3-Gameplay-LAN-Zombies-4.2-EXPERIMENTAL-DEV-2026-11-05') throw new Error('Wrong package identity.');
const expected = new Set();
for (const entry of m.files) {
  const rel = entry.path.replace(/\\/g, '/');
  if (!rel || path.posix.isAbsolute(rel) || rel.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Unsafe manifest path: ' + entry.path);
  const file = path.resolve(root, ...rel.split('/'));
  if (!file.startsWith(root + path.sep)) throw new Error('Manifest path escapes package root: ' + rel);
  expected.add(rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('Missing package file: ' + rel);
  if (fs.statSync(file).size !== entry.size) throw new Error('File size mismatch: ' + rel);
  if (hash(file) !== entry.sha256) throw new Error('SHA-256 mismatch: ' + rel);
}
const actual = new Set();
function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else if (e.isFile()) { const rel = path.relative(root, f).split(path.sep).join('/'); if (rel !== manifestName) actual.add(rel); } else throw new Error('Unsupported entry: ' + f); } }
walk(root);
for (const rel of actual) if (!expected.has(rel)) fail('Unmanifested file: ' + rel);
for (const rel of expected) if (!actual.has(rel)) fail('Manifest-only file: ' + rel);
if (m.ownership.removedParentFiles.length) fail('Parent files were removed.');
if (m.ownership.serverChanged) fail('Server changed in a client-telemetry-only descendant.');
if (m.ownership.changedLegendaryFiles.length || m.ownership.legendaryFilesChecked < 1) fail('Claude-owned Legendary source changed or was not checked.');
if (!m.ownership.offlineAndPhoneHostPagesIdentical) fail('Offline/phone-host pages differ.');
const instructions = path.join(root, 'AGENTS.md');
if (hash(instructions) !== m.currentSourceFingerprints.projectInstructionsSha256) fail('Root AGENTS.md hash mismatch.');
const parentManifest = JSON.parse(fs.readFileSync(path.join(root, 'GAMEPLAY-LAN-ZOMBIES-4.1-MANIFEST.json'), 'utf8'));
const parent = new Map(parentManifest.files.map(x => [x.path, x.sha256]));
const changedLegendary = [...parent.keys()].filter(p => /(?:legend|character-(?:skins|realism|poses|prototypes)|weapon-skins)/i.test(p) && parent.get(p) !== m.files.find(x => x.path === p)?.sha256);
if (changedLegendary.length) fail('Legendary source differs from parent: ' + changedLegendary.join(', '));
const current = m.currentSourceFingerprints;
for (const [rel, expectedHash] of [
  ['AndroidProject/app/src/main/assets/phone-host/server.js', current.phoneHostServerSha256],
  ['AndroidProject/app/src/main/assets/phone-host/index.html', current.phoneHostPageSha256],
  ['AndroidProject/app/src/main/assets/www/index.html', current.offlinePageSha256],
  ['AndroidProject/app/src/main/assets/phone-host/SHA256SUMS', current.phoneHostAssetManifestSha256],
  ['AndroidProject/CURRENT-SOURCE-SHA256.txt', current.androidSourceManifestSha256],
  ['AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java', current.mainActivitySha256]
]) if (hash(path.join(root, rel)) !== expectedHash) fail('Current fingerprint mismatch: ' + rel);
const capture = fs.readFileSync(path.join(root, 'tools/capture-lan-host-status.cjs'), 'utf8');
if (!capture.includes("bundle:'" + current.phoneHostPageSha256 + "'") || !capture.includes("server:'" + current.phoneHostAssetManifestSha256 + "'")) fail('Host capture tool does not pin the packaged page and host assets.');
for (const required of ['START-HOST.bat', 'SIGHTLINE.bat', 'GAMEPLAY-LAN-ZOMBIES-4.2-QUICKSTART.md', 'acceptance/GAMEPLAY-LAN-ZOMBIES-4.2-2026-11-05.md', 'acceptance/gameplay-lan-zombies-4.2-regressions.log', 'tests/lan-diagnostics.test.cjs']) if (!fs.existsSync(path.join(root, ...required.split('/')))) fail('Missing required deliverable: ' + required);
if (!process.exitCode) console.log(JSON.stringify({ status: 'PASS', packageName: m.packageName, verifiedFiles: expected.size, manifestSha256: hash(manifestFile), rootInstructionsSha256: hash(instructions), serverSha256: current.phoneHostServerSha256, pageSha256: current.phoneHostPageSha256, legendaryFilesUnchanged: m.ownership.legendaryFilesChecked, rollbackParentZipSha256: m.rollback.sha256 }, null, 2));


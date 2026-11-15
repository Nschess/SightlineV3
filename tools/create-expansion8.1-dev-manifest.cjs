'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestRel = 'acceptance/EXPANSION-8.1-DEV-MANIFEST.json';
const checksumRel = `${manifestRel}.sha256`;
const excluded = [
  { path: 'PACKAGE-MANIFEST.json', reason: 'Stale inherited inventory; superseded by the current source manifest.' },
  { path: 'artifacts/baseline/SightlineV3-Android-5.1-debug-v4.apk', reason: 'Older preserved APK; not built from this candidate and must not be presented as current.' },
  { path: 'tests/.tmp/**', reason: 'Ephemeral test staging; not source or acceptance evidence.' }
];

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (rel === manifestRel || rel === checksumRel) continue;
    if (rel === 'PACKAGE-MANIFEST.json' || rel === 'artifacts/baseline/SightlineV3-Android-5.1-debug-v4.apk' || rel === 'tests/.tmp' || rel.startsWith('tests/.tmp/')) continue;
    if (ent.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${rel}`);
    if (ent.isDirectory()) walk(abs, out);
    else if (ent.isFile()) {
      const data = fs.readFileSync(abs);
      out.push({ path: rel, size: data.length, sha256: sha256(data) });
    } else throw new Error(`Unsupported filesystem entry: ${rel}`);
  }
  return out;
}

const instruction = fs.readFileSync(path.join(root, 'AGENTS.md'));
const fileRows = walk(root).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const serverPath = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host', 'server.js');
const hostPagePath = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host', 'index.html');
const offlinePath = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'www', 'index.html');
const doc = {
  schemaVersion: 1,
  packageName: 'SightlineV3-Gameplay-Expansion-8.1-EXPERIMENTAL-DEV-2026-11-07',
  packageType: 'experimental editable source and evidence; not visually accepted, an APK, or a release',
  generatedAtUtc: new Date().toISOString(),
  baseline: {
    archiveName: 'SightlineV3-Gameplay-Expansion-8.0-Final-Stabilization-EXPERIMENTAL-DEV-2026-11-06.zip',
    archiveSha256: '65d04660913060c2b8958d8e37eb5d78a3f6d9d2efbfaf98aca7dc5b5217f5b3',
    sourceManifest: 'acceptance/FINAL-STABILIZATION-SOURCE-MANIFEST.json',
    sourceManifestSha256: 'fccc419bc6f95bee78742db2b7afc5ca96a751b67c890b6b8820ae0be52aefd5'
  },
  sourceFingerprints: {
    projectInstructions: sha256(instruction),
    phoneHostServer: sha256(fs.readFileSync(serverPath)),
    phoneHostPage: sha256(fs.readFileSync(hostPagePath)),
    offlinePage: sha256(fs.readFileSync(offlinePath))
  },
  excluded,
  filesExcludingManifest: fileRows.length,
  totalBytes: fileRows.reduce((n, row) => n + row.size, 0),
  files: fileRows
};

const manifestPath = path.join(root, ...manifestRel.split('/'));
const checksumPath = path.join(root, ...checksumRel.split('/'));
if (fs.existsSync(manifestPath) || fs.existsSync(checksumPath)) {
  throw new Error('Current manifest already exists; remove or archive it explicitly before regenerating.');
}
const bytes = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`);
fs.writeFileSync(manifestPath, bytes, { flag: 'wx' });
const digest = sha256(bytes);
fs.writeFileSync(checksumPath, `${digest}  EXPANSION-8.1-DEV-MANIFEST.json\n`, { flag: 'wx' });
process.stdout.write(JSON.stringify({ status: 'CREATED', files: fileRows.length, bytes: doc.totalBytes, manifestSha256: digest, manifest: manifestRel }) + '\n');

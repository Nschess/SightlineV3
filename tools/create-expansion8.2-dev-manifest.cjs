'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestRel = 'PACKAGE-MANIFEST.json';
const checksumRel = 'PACKAGE-MANIFEST.json.sha256';
const shaBuffer = b => crypto.createHash('sha256').update(b).digest('hex');
const shaFile = f => shaBuffer(fs.readFileSync(f));
const rows = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (rel === manifestRel || rel === checksumRel) continue;
    if (ent.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${rel}`);
    if (ent.isDirectory()) walk(abs);
    else if (ent.isFile()) rows.push({ path: rel, size: fs.statSync(abs).size, sha256: shaFile(abs) });
    else throw new Error(`Unsupported filesystem entry: ${rel}`);
  }
}
if (fs.existsSync(path.join(root, manifestRel)) || fs.existsSync(path.join(root, checksumRel))) {
  throw new Error('A package manifest already exists; refusing to overwrite it.');
}
walk(root);
rows.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const required = [
  'AGENTS.md', 'SIGHTLINE.bat', 'START-HOST.bat',
  'GAMEPLAY-EXPANSION-8.2-QUICKSTART.md', 'docs/EXPANSION-8.2-ACCEPTANCE-REPORT.md',
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/assets/phone-host/index.html',
  'AndroidProject/app/src/main/assets/phone-host/server.js',
  'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  'AndroidProject/CURRENT-SOURCE-SHA256.txt',
  'acceptance/EXPANSION-8.2/reports/acceptance-report.json',
  'acceptance/EXPANSION-8.2/reports/offline-gameplay.json',
  'acceptance/EXPANSION-8.2/reports/lan-bomb-loopback.json',
  'acceptance/EXPANSION-8.2/reports/lan-ffa-attempt.json',
  'acceptance/EXPANSION-8.2/screenshots/offline-desktop-1600x900-play.png',
  'acceptance/EXPANSION-8.2/screenshots/host-multiplayer-desktop-1600x900.png'
];
for (const rel of required) if (!rows.some(x => x.path === rel)) throw new Error(`Required package file missing: ${rel}`);
const doc = {
  schemaVersion: 1,
  packageName: 'SightlineV3-Gameplay-Expansion-8.2-EXPERIMENTAL-DEV-2026-11-07',
  packageType: 'editable experimental DEV source and evidence; not a release or current-source APK',
  generatedAtUtc: new Date().toISOString(),
  sourceFingerprints: {
    offlinePage: shaFile(path.join(root, 'AndroidProject/app/src/main/assets/www/index.html')),
    phoneHostPage: shaFile(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html')),
    phoneHostServer: shaFile(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js')),
    phoneHostInventory: shaFile(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS')),
    androidSourceManifest: shaFile(path.join(root, 'AndroidProject/CURRENT-SOURCE-SHA256.txt')),
    projectInstructions: shaFile(path.join(root, 'AGENTS.md'))
  },
  verification: {
    nodeTestFiles: 61, nodePassed: 280, nodeFailed: 0,
    authoritativeCombat: '8/8 PASS', navigation: '19 maps; zero reported faults',
    androidParity: '48/48 phone-host files; 15/15 shared libraries',
    offlineFFA: 'PASS with documented debug-only deterministic actor setup',
    offlineBomb: 'PASS; unassisted AI plant/defuse in actual game loop',
    lanBomb: 'PASS; loopback, two Protocol V2 clients, 8 bots',
    lanFFAScoring: 'UNVERIFIED; first firing probe scored no hits; retry blocked by isolated child-host status fetch failure',
    cleanExtractionOfflineRuntime: 'BLOCKED; Chromium denied the temporary 127.0.0.1 URL before page load; clean-extraction manifest and full deterministic suite pass',
    currentSourceApk: 'NOT BUILT', physicalAndroid: 'UNVERIFIED', privateWifi: 'UNVERIFIED'
  },
  exclusions: [
    'Historical acceptance capture directories are omitted; selected Expansion 8.2 screenshots and machine-readable reports are included.',
    'Root debug.log is omitted as generated runtime output.',
    'No APK or production TLS/signing material is included.'
  ],
  fileCountExcludingManifest: rows.length,
  totalBytes: rows.reduce((n, x) => n + x.size, 0),
  files: rows
};
const bytes = Buffer.from(JSON.stringify(doc, null, 2) + '\n');
fs.writeFileSync(path.join(root, manifestRel), bytes, { flag: 'wx' });
const digest = shaBuffer(bytes);
fs.writeFileSync(path.join(root, checksumRel), `${digest}  ${manifestRel}\n`, { flag: 'wx' });
process.stdout.write(JSON.stringify({ status: 'CREATED', files: rows.length, bytes: doc.totalBytes, manifestSha256: digest, sourceFingerprints: doc.sourceFingerprints }) + '\n');

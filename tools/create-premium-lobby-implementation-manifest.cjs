'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const outRel = 'acceptance/premium-lobby-implementation-2026-11-08';
const out = path.join(root, outRel);
const manifestName = 'SOURCE-MANIFEST.json';
const sumName = `${manifestName}.sha256`;
const manifestPath = path.join(out, manifestName);
const sumPath = path.join(out, sumName);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const shaFile = rel => hash(fs.readFileSync(path.join(root, rel)));
const expectedAgents = 'df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2';

if (fs.existsSync(manifestPath) || fs.existsSync(sumPath)) {
  throw new Error('Refusing to overwrite an existing premium-lobby source manifest.');
}
if (shaFile('AGENTS.md') !== expectedAgents) throw new Error('Candidate project instructions changed; inspect before manifesting.');
const report = fs.readFileSync(path.join(root, 'docs/LOBBY-PREMIUM-IMPLEMENTATION-2026-11-08-REPORT.md'), 'utf8');
if (!report.includes('Rendered visual acceptance: UNVERIFIED') || !report.includes('EADDRINUSE')) {
  throw new Error('Report must preserve the current visual-acceptance and preview-port status.');
}

function walk(dir) {
  const rows = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (rel === `${outRel}/${manifestName}` || rel === `${outRel}/${sumName}` || rel === 'debug.log') continue;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${rel}`);
    if (entry.isDirectory()) rows.push(...walk(abs));
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(abs);
      rows.push({ path: rel, size: bytes.length, sha256: hash(bytes) });
    } else throw new Error(`Unsupported filesystem entry: ${rel}`);
  }
  return rows;
}

const files = walk(root).sort((a, b) => a.path.localeCompare(b.path, 'en'));
const document = {
  schema: 'sightline-premium-lobby-implementation-source-v1',
  generatedAtUtc: new Date().toISOString(),
  sourceRoot: 'work/lobby-ux-9.1-visual-quality-20261107/DEV',
  artifactStatus: 'Editable experimental DEV directory; no ZIP created because actual rendered visual acceptance is unverified.',
  sourceFingerprints: {
    offlinePageSha256: shaFile('AndroidProject/app/src/main/assets/www/index.html'),
    phoneHostPageSha256: shaFile('AndroidProject/app/src/main/assets/phone-host/index.html'),
    phoneHostInventorySha256: shaFile('AndroidProject/app/src/main/assets/phone-host/SHA256SUMS'),
    androidSourceInventorySha256: shaFile('AndroidProject/CURRENT-SOURCE-SHA256.txt'),
    mainActivitySha256: shaFile('AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'),
    projectInstructionsSha256: shaFile('AGENTS.md')
  },
  verification: {
    fullNodeRegressions: '295/295 PASS across 64 test files',
    focusedLobbyTests: '10/10 PASS',
    combat: '8/8 PASS',
    navigation: '19 maps; 0 reported faults',
    androidParity: '48/48 phone-host files; 15/15 shared modules PASS',
    rollback: '1,271 files; 222,513,174 bytes; manifest SHA-256 07cc98f25a3e6e5ec1430ad2598015082238ecc476cdf9843a957fd9a9647270',
    visualAcceptance: 'UNVERIFIED; offline preview launch returned EADDRINUSE on port 8090; no screenshot captured',
    liveLanUi: 'UNVERIFIED',
    physicalAndroid: 'UNVERIFIED',
    apk: 'NOT BUILT'
  },
  exclusions: ['Root debug.log is excluded as generated runtime output.', 'No ZIP, APK, signing input, production TLS key, or distribution artifact was created.'],
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.size, 0),
  files
};
fs.mkdirSync(out, { recursive: true });
const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
fs.writeFileSync(manifestPath, bytes, { flag: 'wx' });
fs.writeFileSync(sumPath, `${hash(bytes)}  ${manifestName}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: 'CREATED', files: files.length, totalBytes: document.totalBytes, manifestSha256: hash(bytes), sourceFingerprints: document.sourceFingerprints }, null, 2));

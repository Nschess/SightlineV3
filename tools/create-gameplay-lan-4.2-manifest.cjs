'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const name = 'GAMEPLAY-LAN-ZOMBIES-4.2-MANIFEST.json';
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = file => path.relative(root, file).split(path.sep).join('/');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && relative(file) !== name) files.push({ path: relative(file), size: fs.statSync(file).size, sha256: digest(file) });
    else if (!entry.isFile()) throw new Error('Unsupported filesystem entry: ' + relative(file));
  }
}
walk(root);
files.sort((a, b) => a.path.localeCompare(b.path, 'en'));

const baseManifest = JSON.parse(fs.readFileSync(path.join(root, 'GAMEPLAY-LAN-ZOMBIES-4.1-MANIFEST.json'), 'utf8'));
const base = new Map(baseManifest.files.map(f => [f.path, f]));
const current = new Map(files.map(f => [f.path, f]));
const removedParentFiles = [...base.keys()].filter(p => !current.has(p)).sort();
if (removedParentFiles.length) throw new Error('4.2 removed parent files; refusing to generate manifest: ' + removedParentFiles.slice(0, 8).join(', '));
// The 4.1 manifest is self-excluded from its own file inventory, but is part
// of the 4.1 ZIP and is inherited metadata rather than a 4.2 source change.
const changedParentFiles = files.filter(f => f.path !== 'GAMEPLAY-LAN-ZOMBIES-4.1-MANIFEST.json' && (!base.has(f.path) || base.get(f.path).sha256 !== f.sha256)).map(f => f.path);
const legendaryPattern = /(?:legend|character-(?:skins|realism|poses|prototypes)|weapon-skins)/i;
const legendaryFiles = [...base.keys()].filter(p => legendaryPattern.test(p));
const changedLegendaryFiles = legendaryFiles.filter(p => !current.has(p) || base.get(p).sha256 !== current.get(p).sha256);
if (changedLegendaryFiles.length) throw new Error('Claude-owned Legendary files changed: ' + changedLegendaryFiles.join(', '));

const android = path.join(root, 'AndroidProject');
const manifest = {
  schemaVersion: 1,
  packageName: 'SightlineV3-Gameplay-LAN-Zombies-4.2-EXPERIMENTAL-DEV-2026-11-05',
  packageType: 'editable experimental source; not a release, APK, or distribution build',
  generatedUtc: new Date().toISOString(),
  selfHashPolicy: 'This manifest excludes itself to avoid circular hashing; verify the manifest and ZIP hashes externally.',
  sourceBase: {
    package: 'SightlineV3-Gameplay-LAN-Zombies-4.1-EXPERIMENTAL-DEV-2026-11-05.zip',
    zipSha256: '189e6975dc8a543701936b4a6a65a21dac5deee9f9fd9ce803930d6d0a6cee2b',
    manifestSha256: 'da23d1d589919d2f9708eeda0ceee8c07ad72df51687daf895cfa619ab40c574'
  },
  currentSourceFingerprints: {
    phoneHostServerSha256: digest(path.join(android, 'app/src/main/assets/phone-host/server.js')),
    phoneHostPageSha256: digest(path.join(android, 'app/src/main/assets/phone-host/index.html')),
    offlinePageSha256: digest(path.join(android, 'app/src/main/assets/www/index.html')),
    phoneHostAssetManifestSha256: digest(path.join(android, 'app/src/main/assets/phone-host/SHA256SUMS')),
    androidSourceManifestSha256: digest(path.join(android, 'CURRENT-SOURCE-SHA256.txt')),
    mainActivitySha256: digest(path.join(android, 'app/src/main/java/com/sightline/v3/MainActivity.java')),
    projectInstructionsSha256: digest(path.join(root, 'AGENTS.md'))
  },
  acceptedScope: [
    'Preserve all verified Gameplay/LAN Zombies 4.1 AI, pathfinding, combat, Protocol V2, HTTPS/WSS, Offline Infection, and remote-zombie bounded pose recovery behavior.',
    'Add disabled-by-default client telemetry enabled only by ?lanDiag=1 for render intervals, snapshot gaps, corrections, remote-zombie step/turn discontinuities, and host navigation/stuck status samples.',
    'Add bounded diagnostic buffers, JSON export, a CMD collection guide, and source-pinned diagnostics/benchmark verification.',
    'Keep server-authoritative behavior and cadence unchanged; do not edit Claude-owned Legendary modules.'
  ],
  ownership: {
    changedFromParent: changedParentFiles,
    removedParentFiles,
    legendaryFilesChecked: legendaryFiles.length,
    changedLegendaryFiles,
    serverChanged: base.get('AndroidProject/app/src/main/assets/phone-host/server.js')?.sha256 !== current.get('AndroidProject/app/src/main/assets/phone-host/server.js')?.sha256,
    offlineAndPhoneHostPagesIdentical: digest(path.join(android, 'app/src/main/assets/www/index.html')) === digest(path.join(android, 'app/src/main/assets/phone-host/index.html'))
  },
  verification: {
    fullRegression: { tests: 240, passed: 240, failed: 0, log: 'acceptance/gameplay-lan-zombies-4.2-regressions.log' },
    diagnosticsAndInterpolationFocused: { tests: 14, passed: 14, failed: 0 },
    androidHostAssets: '47/47',
    sharedOfflinePhoneHostModules: '14/14 byte-identical',
    androidCurrentSourceManifest: '112/112',
    matchedClientBenchmark: '3 deterministic-trace trials each at 16/32/64 actors; Node VM only; result acceptance/benchmarks/4.2-client-presentation-comparison.json',
    loopback: 'BLOCKED: host started but isolated client connect returned EACCES; evidence acceptance/4.2-loopback-two-client-16bot-outbreak.json',
    headlessWebGL: 'BLOCKED: no isolated Chromium/Edge/WebGL runtime available',
    apkAndPhysicalDevice: 'UNVERIFIED; static asset checks only'
  },
  rollback: { parentPackage: 'SightlineV3-Gameplay-LAN-Zombies-4.1-EXPERIMENTAL-DEV-2026-11-05.zip', sha256: '189e6975dc8a543701936b4a6a65a21dac5deee9f9fd9ce803930d6d0a6cee2b', filesRemovedFromParent: 0 },
  report: 'acceptance/GAMEPLAY-LAN-ZOMBIES-4.2-2026-11-05.md',
  quickstart: 'GAMEPLAY-LAN-ZOMBIES-4.2-QUICKSTART.md',
  fileCountExcludingManifest: files.length,
  files
};
if (manifest.ownership.serverChanged || !manifest.ownership.offlineAndPhoneHostPagesIdentical) throw new Error('Source ownership/parity guard failed.');
const target = path.join(root, name);
fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ status: 'WROTE_4_2_MANIFEST', fileCountExcludingManifest: files.length, changedFromParent: changedParentFiles, manifestSha256: digest(target), fingerprints: manifest.currentSourceFingerprints }, null, 2));


'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestName = 'GAMEPLAY-LAN-ZOMBIES-4.0-MANIFEST.json';
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile()) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (relative !== manifestName) files.push({ path: relative, size: fs.statSync(file).size, sha256: hashFile(file) });
    } else throw new Error(`Unsupported filesystem entry: ${path.relative(root, file)}`);
  }
}
walk(root);
files.sort((a, b) => a.path.localeCompare(b.path, 'en'));

const sourceFile = rel => path.join(root, rel);
const changedFiles = [
  'AndroidProject/app/src/main/assets/phone-host/server.js',
  'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  'AndroidProject/CURRENT-SOURCE-SHA256.txt',
  'tools/capture-lan-host-status.cjs',
  'tests/mp-audit-optimizations.test.cjs',
  'tests/outbreak-perception-cadence.test.cjs',
  'tools/bench-outbreak-target-acquisition.cjs'
];
const benchmarkFiles = fs.readdirSync(path.join(root, 'acceptance/benchmarks'))
  .filter(name => /^(?:baseline|after)-(?:infection|outbreak|ai-perception)/.test(name) && name.endsWith('.json'))
  .map(name => `acceptance/benchmarks/${name}`).sort();
const manifest = {
  schemaVersion: 1,
  packageName: 'SightlineV3-Gameplay-LAN-Zombies-4.0-EXPERIMENTAL-DEV-2026-11-05',
  packageType: 'editable experimental development source; not a release, APK, or distribution build',
  generatedUtc: new Date().toISOString(),
  selfHashPolicy: 'Manifest excludes its own file entry to avoid circular hashing; hash the manifest externally.',
  sourceBase: {
    package: 'SightlineV3-Legendary-Guns-2.0-EXPERIMENTAL-DEV-2026-11-04.zip',
    zipSha256: '5182be4b03a491be163e50a3028d844c3b845b8ebc7c82b6c17b54aee6001a0c',
    candidateManifestSha256: '9844e484fb85c96fa6af803d5ad39e2671d3f05b01ba091d5876225db10ce0ba',
    phoneHostServerSha256: '32f4545b5e55b54db41ffba20446b507ceaeda27f4b3888e61e739e5430cbdb4'
  },
  currentSourceFingerprints: {
    phoneHostServerSha256: hashFile(sourceFile('AndroidProject/app/src/main/assets/phone-host/server.js')),
    phoneHostPageSha256: hashFile(sourceFile('AndroidProject/app/src/main/assets/phone-host/index.html')),
    phoneHostAssetManifestSha256: hashFile(sourceFile('AndroidProject/app/src/main/assets/phone-host/SHA256SUMS')),
    androidSourceManifestSha256: hashFile(sourceFile('AndroidProject/CURRENT-SOURCE-SHA256.txt')),
    projectInstructionsSha256: hashFile(sourceFile('AGENTS.md'))
  },
  acceptedScope: [
    'Align phone-host Outbreak zombie perception refresh to the Offline 240–350 ms window with deterministic per-ID staggering.',
    'Preserve the five-candidate visibility budget and existing server authority, targeting score, damage, movement, tick, and snapshot behavior.',
    'Refresh Android source hashes and LAN capture source pin after the server change.'
  ],
  untouchedOwnership: [
    'No Offline or phone-host game page changed.',
    'No Legendary skin, model, optic, weapon-specific audio, weapon animation, or elimination-effect source changed.',
    'No combat, navigation, Protocol V2, HTTPS/WSS, or LAN smoothing code changed.'
  ],
  verification: {
    fullRegression: { tests: 234, passed: 234, failed: 0, log: 'acceptance/gameplay-lan-zombies-4.0-regressions.log' },
    staticAndroidHostFiles: '47/47',
    sharedOfflinePhoneHostModules: '14/14 byte-identical',
    currentAndroidSourceManifest: '112/112',
    maps: '19; 114 sampled legal routes; 54 partial routes complete through bounded replanning',
    apkBuild: 'not run; known isolated Gradle worker IPC blocker',
    liveLanAndWss: 'not run; isolated local networking restriction',
    browserWebglAndDevice: 'not tested'
  },
  benchmarks: benchmarkFiles,
  rollbackFiles: [
    'acceptance/checkpoints/2026-11-05-pre-cadence-change/files/AndroidProject/app/src/main/assets/phone-host/server.js',
    'acceptance/checkpoints/2026-11-05-pre-cadence-change/files/AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
    'acceptance/checkpoints/2026-11-05-pre-cadence-change/files/AndroidProject/CURRENT-SOURCE-SHA256.txt',
    'acceptance/checkpoints/2026-11-05-pre-cadence-change/files/tools/capture-lan-host-status.cjs',
    'acceptance/checkpoints/2026-11-05-pre-cadence-change/files/tests/mp-audit-optimizations.test.cjs'
  ],
  changedFiles,
  fileCountExcludingManifest: files.length,
  files
};
const destination = sourceFile(manifestName);
fs.writeFileSync(destination, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ result: 'WROTE_GAMEPLAY_LAN_PACKAGE_MANIFEST', fileCountExcludingManifest: files.length, manifestSha256: hashFile(destination), sourceFingerprints: manifest.currentSourceFingerprints }, null, 2));

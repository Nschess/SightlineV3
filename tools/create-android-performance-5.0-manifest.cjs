'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestName = 'ANDROID-PERFORMANCE-AND-BUILD-RELIABILITY-5.0-MANIFEST.json';
const packageName = 'SightlineV3-Android-Performance-Build-5.0-EXPERIMENTAL-DEV-2026-11-05';
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = file => path.relative(root, file).split(path.sep).join('/');
const entries = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && relative(file) !== manifestName) {
      entries.push({ path: relative(file), size: fs.statSync(file).size, sha256: sha256(file) });
    } else if (!entry.isFile()) throw new Error(`Unsupported filesystem entry: ${relative(file)}`);
  }
}

walk(root);
entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const parentManifestPath = path.join(root, 'GAMEPLAY-LAN-ZOMBIES-4.2-MANIFEST.json');
const parentManifest = JSON.parse(fs.readFileSync(parentManifestPath, 'utf8'));
const parent = new Map(parentManifest.files.map(file => [file.path, file]));
const current = new Map(entries.map(file => [file.path, file]));
const removedParentFiles = [...parent.keys()].filter(file => !current.has(file)).sort();
if (removedParentFiles.length) throw new Error(`Removed 4.2 source files: ${removedParentFiles.slice(0, 10).join(', ')}`);

const changedFromParent = entries
  .filter(file => !parent.has(file.path) || parent.get(file.path).sha256 !== file.sha256)
  .map(file => file.path);
const allowedChangedPaths = new Set([
  'AndroidProject/BUILD-ON-WINDOWS.md',
  'AndroidProject/CURRENT-SOURCE-SHA256.txt',
  'AndroidProject/build-debug.bat',
  'AndroidProject/tools/bootstrap-build.ps1',
  'GAMEPLAY-LAN-ZOMBIES-4.2-MANIFEST.json',
  'ANDROID-PERFORMANCE-AND-BUILD-RELIABILITY-5.0-QUICKSTART.md',
  'acceptance/ANDROID-PERFORMANCE-AND-BUILD-RELIABILITY-5.0.md',
  'acceptance/android-performance-5.0-build-attempt.log',
  'acceptance/android-performance-5.0-regressions.log',
  'acceptance/android-performance-5.0-regressions-final.log',
  'acceptance/benchmarks/4.2-client-presentation-4.1-baseline-diagnostics-absent-trial-1.json',
  'acceptance/benchmarks/4.2-client-presentation-4.1-baseline-diagnostics-absent-trial-2.json',
  'acceptance/benchmarks/4.2-client-presentation-4.1-baseline-diagnostics-absent-trial-3.json',
  'acceptance/benchmarks/4.2-client-presentation-4.2-candidate-diagnostics-disabled-trial-1.json',
  'acceptance/benchmarks/4.2-client-presentation-4.2-candidate-diagnostics-disabled-trial-2.json',
  'acceptance/benchmarks/4.2-client-presentation-4.2-candidate-diagnostics-disabled-trial-3.json',
  'acceptance/benchmarks/4.2-client-presentation-comparison.json',
  'tests/android-build-wrapper-policy.test.cjs',
  'tools/create-android-performance-5.0-manifest.cjs',
  'tools/verify-android-performance-5.0-package.cjs',
  'rollback/2026-11-05-pre-android-build-script-hardening/AndroidProject/BUILD-ON-WINDOWS.md',
  'rollback/2026-11-05-pre-android-build-script-hardening/AndroidProject/build-debug.bat',
  'rollback/2026-11-05-pre-android-build-script-hardening/AndroidProject/tools/bootstrap-build.ps1'
]);
const unexpectedChanges = changedFromParent.filter(file => !allowedChangedPaths.has(file));
if (unexpectedChanges.length) throw new Error(`Changes outside the reviewed 5.0 allowlist: ${unexpectedChanges.join(', ')}`);

const legendaryPattern = /(?:legend|character-(?:skins|realism|poses|prototypes)|weapon-skins)/i;
const legendaryPaths = [...parent.keys()].filter(file => legendaryPattern.test(file));
const changedLegendary = legendaryPaths.filter(file => !current.has(file) || parent.get(file).sha256 !== current.get(file).sha256);
if (changedLegendary.length) throw new Error(`Claude-owned Legendary files changed: ${changedLegendary.join(', ')}`);

const android = path.join(root, 'AndroidProject');
const fingerprints = {
  phoneHostServerSha256: sha256(path.join(android, 'app/src/main/assets/phone-host/server.js')),
  phoneHostPageSha256: sha256(path.join(android, 'app/src/main/assets/phone-host/index.html')),
  offlinePageSha256: sha256(path.join(android, 'app/src/main/assets/www/index.html')),
  phoneHostAssetManifestSha256: sha256(path.join(android, 'app/src/main/assets/phone-host/SHA256SUMS')),
  androidSourceManifestSha256: sha256(path.join(android, 'CURRENT-SOURCE-SHA256.txt')),
  mainActivitySha256: sha256(path.join(android, 'app/src/main/java/com/sightline/v3/MainActivity.java')),
  projectInstructionsSha256: sha256(path.join(root, 'AGENTS.md'))
};
if (fingerprints.phoneHostServerSha256 !== '6f9ad2be2e1cd51cec6e4d3ee1c5acf62223096bd537e0cf06fac3feb729f508') throw new Error('The 4.2 phone-host server changed.');
if (fingerprints.phoneHostPageSha256 !== fingerprints.offlinePageSha256) throw new Error('Offline and phone-host pages are no longer identical.');
if (fingerprints.projectInstructionsSha256 !== 'df2b6d279699d465d7807dab9affce7e3428723e138e6870e5ffc7750ae765b2') throw new Error('Unexpected project AGENTS.md.');

const manifest = {
  schemaVersion: 1,
  packageName,
  packageType: 'experimental editable DEV source; not an APK, signed release, or distribution build',
  generatedUtc: new Date().toISOString(),
  selfHashPolicy: 'This manifest excludes itself to avoid circular hashing. Verify its SHA-256 externally and verify every listed file.',
  sourceBase: {
    package: 'SightlineV3-Gameplay-LAN-Zombies-4.2-EXPERIMENTAL-DEV-2026-11-05.zip',
    zipSha256: '804411ae8fec41fa87a77148048b0182980a2c37fe1c26b31efa6edaf0e96473',
    manifest: 'GAMEPLAY-LAN-ZOMBIES-4.2-MANIFEST.json',
    manifestSha256: sha256(parentManifestPath)
  },
  currentSourceFingerprints: fingerprints,
  ownership: {
    changedFromParent,
    removedParentFiles,
    unexpectedChanges,
    changedLegendaryFiles: changedLegendary,
    legendaryFilesChecked: legendaryPaths.length,
    gameplayServerUnchanged: fingerprints.phoneHostServerSha256 === '6f9ad2be2e1cd51cec6e4d3ee1c5acf62223096bd537e0cf06fac3feb729f508',
    offlineAndPhoneHostPagesIdentical: fingerprints.phoneHostPageSha256 === fingerprints.offlinePageSha256
  },
  verification: {
    fullNodeRegressions: { tests: 243, passed: 243, failed: 0, log: 'acceptance/android-performance-5.0-regressions-final.log' },
    androidBuildAttempt: 'BLOCKED before Gradle: no JDK 17, Android SDK, adb, or emulator; see acceptance/android-performance-5.0-build-attempt.log',
    androidHostAssets: '47/47 SHA-256 pass',
    sharedOfflinePhoneHostModules: '14/14 byte-identical',
    androidCurrentSourceManifest: '112/112 SHA-256 pass',
    authoritativeCombat: '8/8 pass',
    navigation: '19 configured maps; zero reported faults; bounded partial paths are documented legal outcomes',
    emulatorAndDevice: 'UNVERIFIED; no isolated emulator/device runtime',
    webglAndLiveLan: 'UNVERIFIED; no authorized isolated browser/peer runtime in this environment',
    androidRuntimePerformance: 'UNVERIFIED; Node VM reference benchmark is not Android evidence'
  },
  rollback: {
    parentPackageSha256: '804411ae8fec41fa87a77148048b0182980a2c37fe1c26b31efa6edaf0e96473',
    parentManifest: 'GAMEPLAY-LAN-ZOMBIES-4.2-MANIFEST.json',
    parentFilesRemoved: 0,
    preChangeCopies: [
      'rollback/2026-11-05-pre-android-build-script-hardening/AndroidProject/build-debug.bat',
      'rollback/2026-11-05-pre-android-build-script-hardening/AndroidProject/tools/bootstrap-build.ps1',
      'rollback/2026-11-05-pre-android-build-script-hardening/AndroidProject/BUILD-ON-WINDOWS.md'
    ]
  },
  acceptanceReport: 'acceptance/ANDROID-PERFORMANCE-AND-BUILD-RELIABILITY-5.0.md',
  quickstart: 'ANDROID-PERFORMANCE-AND-BUILD-RELIABILITY-5.0-QUICKSTART.md',
  apkIncluded: false,
  fileCountExcludingManifest: entries.length,
  files: entries
};

const out = path.join(root, manifestName);
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ status: 'WROTE_ANDROID_PERFORMANCE_5_0_MANIFEST', fileCountExcludingManifest: entries.length, changedFromParent, legendaryFilesChecked: legendaryPaths.length, manifestSha256: sha256(out), fingerprints }, null, 2));

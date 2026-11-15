'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const candidateRoot = process.argv[2] && path.resolve(process.argv[2]);
if (!candidateRoot) throw new Error('Usage: node tools/write-secure-transport-manifest.cjs <frozen-candidate-root>');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const parseEntries = (file, prefix = '') => fs.readFileSync(path.join(root, file), 'utf8').trim().split(/\r?\n/).map(line => {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error(`Malformed hash manifest: ${file}`);
  return { path: prefix + match[2], sha256: match[1] };
});

const sourceManifestFile = 'AndroidProject/CURRENT-SOURCE-SHA256.txt';
const hostManifestFile = 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS';
const androidEntries = parseEntries(sourceManifestFile, 'AndroidProject/');
const phoneHostEntries = parseEntries(hostManifestFile);
for (const entry of androidEntries) {
  if (sha(entry.path) !== entry.sha256) throw new Error(`Android source hash mismatch: ${entry.path}`);
}
for (const entry of phoneHostEntries) {
  const file = path.join('AndroidProject/app/src/main/assets/phone-host', entry.path);
  if (sha(file) !== entry.sha256) throw new Error(`Phone-host asset hash mismatch: ${file}`);
}

const implementationFiles = [
  'AndroidProject/app/build.gradle',
  'AndroidProject/app/src/main/AndroidManifest.xml',
  'AndroidProject/app/src/main/res/xml/network_security_config.xml',
  'AndroidProject/app/src/debug/AndroidManifest.xml',
  'AndroidProject/app/src/debug/res/xml/network_security_config.xml',
  'AndroidProject/app/src/main/assets/phone-host/server.js',
  'AndroidProject/app/src/main/assets/phone-host/host-transport-config.js',
  'AndroidProject/app/src/main/assets/phone-host/mp-transport-policy.js',
  'AndroidProject/app/src/main/assets/phone-host/index.html',
  'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  'AndroidProject/app/src/main/assets/www/mp-transport-policy.js',
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java',
  'AndroidProject/app/src/main/java/com/sightline/v3/LanHostService.java',
  'SIGHTLINE.bat',
  'START-HOST-64HZ-EXPERIMENTAL.bat',
  'tests/private-bind-smoke.py',
  'tests/infection-lan-protocol.mjs',
  'tests/mp-64bot-host-bench.mjs',
  'tests/lan-outbreak-cap-stress.mjs',
  'tests/mp-client-bot-lan-runtime.cjs',
  'tests/mp-capacity-rewind-lan.mjs',
  'tests/mp-outbreak-64bot-cap.mjs',
  'tests/mp-lan-fault-injection.mjs',
  'tests/p7-feature-parity-lan-protocol.mjs',
  'tests/two-clients.mjs',
  'tests/capture-lan-host-status.test.cjs',
  'tools/write-mp-protocol-v2-evidence.cjs',
  'tests/phase2-android-asset-parity.mjs',
  'tests/phase5-refresh-android-hashes.cjs',
  'tests/phase6-source-manifest.cjs',
  'tests/secure-transport-policy.test.cjs',
  'tests/mp-stale-socket-session.test.cjs',
  'tools/verify-v2-secure-transport-base.cjs',
  'tools/write-secure-transport-manifest.cjs',
  'AndroidProject/ANDROID-SECURITY-REVIEW.md',
  'acceptance/SECURE-TRANSPORT-DEPLOYMENT-2026-11-01.md'
];

const testFiles = [
  'tests/secure-transport-policy.test.cjs',
  'tests/mp-protocol-v2-security.test.cjs',
  'tests/mp-stale-socket-session.test.cjs',
  'tests/mp-reload-transition-correctness.test.cjs',
  'tests/mp-authoritative-death-respawn-projection.test.cjs',
  'tests/outbreak-server-roster.test.cjs',
  'tests/authoritative-combat.mjs',
  'tests/map-bot-navigation-audit.cjs',
  'tests/phase2-android-asset-parity.mjs',
  'tests/phase6-source-manifest.cjs'
];
const testFixtures = [
  'tests/fixtures/TEST-ONLY-do-not-deploy-cert.pem',
  'tests/fixtures/TEST-ONLY-do-not-deploy-key.pem'
];
const frozen = {
  path: candidateRoot,
  serverSha256: 'c7352d89558a3f481b9314b0f1a09fb0f8fdc70a2d4c701109b13f530e95e5f9',
  indexSha256: '237f8edfa709cd2ba03b94e3d454aca778674d31411ec882f64cd505b3338240',
  phoneHostManifestSha256: 'b2e81f967dce3c85f10b5b46cf2720bffaa109ccef6b7ee747ddae5cb4d52663',
  androidSourceManifestSha256: '1884682ec077bba33ee5e14bc94278a3470a439a9779cd21242d2cc329b99f05',
  androidSourceFiles: 105,
  phoneHostAssets: 44,
  modificationPolicy: 'read-only; this record does not merge or alter the frozen candidate'
};
const currentBaseFiles = {
  serverSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(candidateRoot, 'AndroidProject/app/src/main/assets/phone-host/server.js'))).digest('hex'),
  indexSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(candidateRoot, 'AndroidProject/app/src/main/assets/phone-host/index.html'))).digest('hex'),
  phoneHostManifestSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(candidateRoot, 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS'))).digest('hex'),
  androidSourceManifestSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(candidateRoot, 'AndroidProject/CURRENT-SOURCE-SHA256.txt'))).digest('hex')
};
for (const key of Object.keys(currentBaseFiles)) {
  if (currentBaseFiles[key] !== frozen[key]) throw new Error(`Frozen candidate changed or identity mismatch: ${key}`);
}

const manifest = {
  record: 'Sightline V3 Protocol V2 secure transport development descendant',
  date: '2026-11-01',
  releaseDecision: 'NO-GO',
  frozenCandidate: frozen,
  verifiedFrozenCandidateState: currentBaseFiles,
  descendant: {
    path: root,
    sourceManifestSha256: sha(sourceManifestFile),
    sourceManifestEntries: androidEntries.length,
    phoneHostManifestSha256: sha(hostManifestFile),
    phoneHostAssets: phoneHostEntries.length,
    hostPageSha256: sha('AndroidProject/app/src/main/assets/phone-host/index.html'),
    hostServerSha256: sha('AndroidProject/app/src/main/assets/phone-host/server.js'),
    debugApk: null,
    releaseApk: null
  },
  implementationFiles: implementationFiles.map(file => ({ path: file, sha256: sha(file) })),
  executedTestSources: testFiles.map(file => ({ path: file, sha256: sha(file) })),
  testOnlyFixtures: testFixtures.map(file => ({ path: file, sha256: sha(file), deployable: false })),
  verificationArtifacts: [
    'acceptance/FROZEN-BASE-AND-V2-PARITY-2026-11-01.json'
  ].map(file => ({ path: file, sha256: sha(file) })),
  verification: [
    { check: 'secure-transport deterministic tests', result: 'PASS', count: '13/13', socketsOpened: false },
    { check: 'Protocol V2 and lifecycle regressions', result: 'PASS', count: '17/17', liveNetwork: false },
    { check: 'host/offline asset and source parity', result: 'PASS', count: '46/46 host files; 14/14 shared modules; 110/110 Android source hashes' },
    { check: 'authoritative combat harness', result: 'PASS', count: '8/8 checks' },
    { check: 'navigation audit', result: 'PASS', count: '19 maps; 0 reported faults; deterministic desktop audit only' },
    { check: 'frozen base and V2 source segment parity', result: 'PASS', count: '12 exact unchanged protocol/parser/session/combat/snapshot code segments' }
  ],
  limitations: [
    'No approved production TLS hostname, certificate chain, private key, or LAN DNS deployment configuration was supplied.',
    'No real TLS/WSS handshake was run; the isolated runtime has a known TCP socket restriction, and unchanged live socket tests were not retried.',
    'The Gradle wrapper exists, but Java/JDK 17, Gradle executable, Android SDK tools, ADB/emulator, and release signing credentials are unavailable.',
    'Physical Android, real Wi-Fi, production certificate trust, Android performance, and human gameplay/visual acceptance remain unverified.'
  ]
};
const outFile = path.join(root, 'acceptance', 'SOURCE-TRANSPORT-MANIFEST-2026-11-01.json');
fs.writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ result: 'WROTE_SOURCE_BOUND_MANIFEST', file: path.relative(root, outFile), sourceManifestSha256: manifest.descendant.sourceManifestSha256, phoneHostManifestSha256: manifest.descendant.phoneHostManifestSha256, hostServerSha256: manifest.descendant.hostServerSha256 }, null, 2));

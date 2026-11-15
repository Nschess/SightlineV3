'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'acceptance/mp-protocol-v2-hardening-manifest-2026-10-30.json');
if (fs.existsSync(out)) throw new Error(`Refusing to overwrite evidence: ${out}`);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = file => path.relative(root, file).split(path.sep).join('/');
const changedFiles = [
  'AndroidProject/app/src/main/assets/phone-host/server.js',
  'AndroidProject/app/src/main/assets/phone-host/index.html',
  'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java',
  'AndroidProject/CURRENT-SOURCE-SHA256.txt',
  'docs/MULTIPLAYER-PROTOCOL-V2.md',
  'tests/lib/mp-protocol-v2-client.mjs',
  'tests/mp-protocol-v2-security.test.cjs',
  'tests/mp-stale-socket-session.test.cjs',
  'tests/infection-lan-protocol.mjs',
  'tests/lan-outbreak-cap-stress.mjs',
  'tests/mp-64bot-host-bench.mjs',
  'tests/mp-capacity-rewind-lan.mjs',
  'tests/mp-lan-fault-injection.mjs',
  'tests/mp-outbreak-64bot-cap.mjs',
  'tests/p7-feature-parity-lan-protocol.mjs',
  'tests/two-clients.mjs',
  'tools/capture-lan-host-status.cjs',
  'tools/write-mp-protocol-v2-evidence.cjs',
  'acceptance/benchmarks/protocol-v2-combat-full-tick-2026-10-30.json',
  'acceptance/benchmarks/protocol-v2-ai-perception-2026-10-30.json',
  'acceptance/PROTOCOL-SECURITY-AND-RELEASE-CANDIDATE-2026-10-30.md'
];
for (const item of changedFiles) if (!fs.statSync(path.join(root, item)).isFile()) throw new Error(`Missing evidence file: ${item}`);
const phoneIndex = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html');
const offlineIndex = path.join(root, 'AndroidProject/app/src/main/assets/www/index.html');
if (!fs.readFileSync(phoneIndex).equals(fs.readFileSync(offlineIndex))) throw new Error('Offline and phone-host page parity failed.');
const prior = JSON.parse(fs.readFileSync(path.join(root, 'rollback/ai-combat-multiplayer-correctness-final-20261029/CHECKPOINT.json'), 'utf8'));
const priorFiles = Object.fromEntries(prior.files.map(f => [f.path, f]));
const fullTick = JSON.parse(fs.readFileSync(path.join(root, 'acceptance/benchmarks/protocol-v2-combat-full-tick-2026-10-30.json'), 'utf8'));
const ai = JSON.parse(fs.readFileSync(path.join(root, 'acceptance/benchmarks/protocol-v2-ai-perception-2026-10-30.json'), 'utf8'));
const manifest = {
  name: 'Sightline V3 protocol v2 hardening evidence',
  generatedAtUtc: new Date().toISOString(),
  authoritativeCandidate: 'work/hands-improvement-20261025/SightlineV3-DEV (October 22 DEV lineage)',
  baselineCheckpoint: 'rollback/ai-combat-multiplayer-correctness-final-20261029',
  baselineFingerprints: {
    hostServerSha256: priorFiles['AndroidProject/app/src/main/assets/phone-host/server.js']?.sha256 || null,
    phoneHostPageSha256: priorFiles['AndroidProject/app/src/main/assets/phone-host/index.html']?.sha256 || null
  },
  currentFingerprints: {
    hostServerSha256: sha256(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/server.js')),
    phoneHostPageSha256: sha256(phoneIndex),
    phoneHostSha256SumsSha256: sha256(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS')),
    androidSourceManifestSha256: sha256(path.join(root, 'AndroidProject/CURRENT-SOURCE-SHA256.txt')),
    offlinePhoneHostPagesByteIdentical: true
  },
  compatibilityDecision: {
    protocolVersion: 2,
    requiredFeatures: ['session-generation', 'life-epoch', 'action-seq'],
    legacyV1: 'Explicitly rejected with protocol_upgrade_required and a refresh/update message; no silent downgrade.',
    reason: 'v1 fire/reload omitted mandatory sequence, session, and life-epoch values, so delayed prior-life actions could not be reliably distinguished from current-life actions.',
    note: 'Older clients must update before joining this host. This is a deliberate protocol compatibility boundary.'
  },
  activeMessageValidation: {
    sessionAndIncreasingSequence: ['in','shot','rl','buy','ammo','team','map','cfg','start','endmatch','cosmetic','finish','finishes'],
    exactCurrentLifeEpoch: ['in','shot','rl','buy','ammo'],
    pingResponse: 'pong is checked against the outstanding ping nonce; it is not a gameplay mutation and does not use the action sequence.',
    replacedOrClosedConnection: 'Messages are dropped unless their player object is still the active object for its id and its connection remains open.'
  },
  verification: {
    focusedProtocolAndLifecycle: { pass: 16, fail: 0, command: 'node --test tests/mp-protocol-v2-security.test.cjs tests/mp-stale-socket-session.test.cjs tests/mp-reload-transition-correctness.test.cjs tests/mp-authoritative-death-respawn-projection.test.cjs' },
    fullNodeSuite: { pass: 148, fail: 0, command: 'node --test tests/*.test.cjs' },
    authoritativeCombat: { pass: 8, fail: 0, command: 'node tests/authoritative-combat.mjs' },
    androidAssetParity: { hostFiles: '46/46', sharedLibraries: '14/14', inlineScripts: '2/2', status: 'PASS' },
    androidSourceManifest: { verifiedEntries: '105/105', status: 'PASS' },
    navigationAudit: { maps: 19, sampledRoutes: 114, legalPartialRoutes: 54, partialRoutesCompletedByReplans: 54, faults: 0, status: 'PASS' },
    activeNetworkHarnessSyntax: { status: 'PASS', note: 'All active .mjs test harnesses and phone-host server passed node --check.' },
    adversarialProtocol: ['legacy v1 and unsupported-version negotiation','missing v2 feature','missing/stale life epoch','session-token mismatch','duplicate/decreasing sequence','replayed reload and movement','closed connection','removed/replaced player object','actual shipped-page mpSend serialization','duplicate lethal attribution in authoritative kill test']
  },
  syntheticPerformance: {
    fullTick: {
      artifact: relative(path.join(root, 'acceptance/benchmarks/protocol-v2-combat-full-tick-2026-10-30.json')),
      workload: 'seeded in-process virtual 20 ms tick; three trials; Courtyard Deathmatch; no socket transport',
      max96: fullTick.results.byWorkload['max-96'],
      balanced32: fullTick.results.byWorkload['balanced-32'],
      limitation: 'Does not measure real timer wakeups, LAN, renderer, Android WebView, or device FPS.'
    },
    aiPerception: {
      artifact: relative(path.join(root, 'acceptance/benchmarks/protocol-v2-ai-perception-2026-10-30.json')),
      max96BotScanPass: ai.botScan.find(x => x.bots === 64 && x.humans === 32)?.steadyStateScanPass || null,
      limitation: 'Selector-focused in-process measurement; not a live-host benchmark.'
    }
  },
  blockedOrUnverified: {
    liveLoopbackAndLan: 'BLOCKED by the established isolated localhost TCP EACCES restriction; not retried.',
    currentSourceAndroidApk: 'BLOCKED by the previously established Gradle worker IPC restriction; no current-source APK claimed.',
    WebGLBrowser: 'BLOCKED by the established isolated browser/runtime restriction; no screenshot acceptance claimed.',
    physicalDeviceAndWifi: 'UNVERIFIED; no physical device or Wi-Fi playtest performed.'
  },
  changedFiles: changedFiles.map(item => {
    const file = path.join(root, item);
    return { path: item, bytes: fs.statSync(file).size, sha256: sha256(file) };
  })
};
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'WRITTEN', output: relative(out), changedFiles: manifest.changedFiles.length,
  currentFingerprints: manifest.currentFingerprints }, null, 2));

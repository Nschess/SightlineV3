'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const candidateRoot = process.argv[2];
if (!candidateRoot) throw new Error('Usage: node tools/verify-v2-secure-transport-base.cjs <frozen-candidate-root>');
const base = path.resolve(candidateRoot);
const descendant = path.resolve(__dirname, '..');
const hostRel = path.join('AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const expected = new Map([
  ['server.js', 'c7352d89558a3f481b9314b0f1a09fb0f8fdc70a2d4c701109b13f530e95e5f9'],
  ['index.html', '237f8edfa709cd2ba03b94e3d454aca778674d31411ec882f64cd505b3338240'],
  ['SHA256SUMS', 'b2e81f967dce3c85f10b5b46cf2720bffaa109ccef6b7ee747ddae5cb4d52663']
]);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (root, rel) => fs.readFileSync(path.join(root, hostRel, rel));
const hashFile = (root, rel) => digest(fs.readFileSync(path.join(root, rel)));

const identities = {};
for (const [name, want] of expected) {
  const actual = digest(read(base, name));
  if (actual !== want) throw new Error(`Frozen candidate ${name} fingerprint mismatch: ${actual}`);
  identities[name] = actual;
}

const sourceManifest = fs.readFileSync(path.join(base, 'AndroidProject', 'CURRENT-SOURCE-SHA256.txt'), 'utf8');
const sourceEntries = sourceManifest.trim().split(/\r?\n/).map(line => {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error('Malformed frozen Android source manifest.');
  const target = path.join(base, 'AndroidProject', match[2]);
  if (digest(fs.readFileSync(target)) !== match[1]) throw new Error(`Frozen Android source hash mismatch: ${match[2]}`);
  return match[2];
});
if (sourceEntries.length !== 105) throw new Error(`Expected 105 frozen Android source entries, found ${sourceEntries.length}`);

const hostManifest = read(base, 'SHA256SUMS').toString('utf8').trim().split(/\r?\n/).map(line => {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error('Malformed frozen phone-host manifest.');
  if (digest(read(base, match[2])) !== match[1]) throw new Error(`Frozen phone-host asset hash mismatch: ${match[2]}`);
  return match[2];
});
if (hostManifest.length !== 44) throw new Error(`Expected 44 frozen host assets, found ${hostManifest.length}`);

const currentServer = read(descendant, 'server.js').toString('utf8');
const frozenServer = read(base, 'server.js').toString('utf8');
function segment(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Could not isolate source segment: ${start}`);
  return source.slice(a, b);
}
const checks = [
  ['WebSocket frame parser and Conn', '/* ---------------- minimal WebSocket (RFC 6455), text frames only ---------------- */', '/* ---------------- game state ---------------- */'],
  ['Protocol V2 negotiation and required features', 'const MULTIPLAYER_PROTOCOL = 2;', '// Index 15 is the unfinished Legendary entry'],
  ['V2 authentication, session and action sequence handler', 'function onMessage(p, raw) {', '\nfunction addPlayer('],
  ['authoritative player session record', 'function addPlayer(c, name) {', '\nfunction removePlayer('],
  ['snapshot sequence and reusable snapshot pools', 'let snapN = 0, tickN = 0, lastSc = 0;', 'const snapshotPipelineEnabled ='],
  ['authoritative combat action validation', 'function onShot(p, m) {', '\nfunction resolveShot('],
  ['authoritative hit resolution and target selection', 'function resolveShot(p, key, w, dirs, heavy, rt) {', '\nfunction damage('],
  ['authoritative damage and kill projection', 'function damage(from, q, dmg, head, wkey) {', '\nfunction onInput('],
  ['authoritative movement validation', 'function onInput(p, m) {', '\n/* ---------------- bots:'],
  ['server-to-client snapshot/message framing helpers', 'function send(p, o) {', '/* AI gunfire still resolves every shot authoritatively'],
  ['snapshot assembly, sequence, and fanout', '  const snapshotEvery=snapshotEveryNow();', '  if(components)components.snapshotMs=performance.now()-snapshotT;']
];
const codeEvidence = [];
for (const [label, start, end] of checks) {
  const basePart = segment(frozenServer, start, end);
  const currentPart = segment(currentServer, start, end);
  const baseSha256 = digest(basePart);
  const descendantSha256 = digest(currentPart);
  if (baseSha256 !== descendantSha256) throw new Error(`Protocol V2 source segment changed: ${label}`);
  codeEvidence.push({ label, sha256: baseSha256, bytes: Buffer.byteLength(basePart) });
}
const sessionStart = '      me.protocol = MULTIPLAYER_PROTOCOL; me.session = crypto.randomBytes(16).toString(\'hex\'); me.lastActionSeq = 0;';
const sessionEnd = '      syncBots(); pushLobby();';
const baseSession = segment(frozenServer, sessionStart, sessionEnd);
const currentSession = segment(currentServer, sessionStart, sessionEnd);
if (baseSession !== currentSession) throw new Error('V2 session token and welcome initialization changed.');
codeEvidence.push({ label: 'Protocol V2 session token and welcome initialization', sha256: digest(baseSession), bytes: Buffer.byteLength(baseSession) });

const manifestDigest = hashFile(base, path.join('AndroidProject', 'CURRENT-SOURCE-SHA256.txt'));
console.log(JSON.stringify({
  result: 'PASS_FROZEN_BASE_AND_V2_CODE_PARITY',
  frozenCandidate: base,
  frozenFingerprints: identities,
  frozenAndroidSourceEntries: sourceEntries.length,
  frozenPhoneHostAssets: hostManifest.length,
  frozenAndroidSourceManifestSha256: manifestDigest,
  descendantServerSha256: digest(Buffer.from(currentServer)),
  verifiedUnchangedV2Segments: codeEvidence
}, null, 2));

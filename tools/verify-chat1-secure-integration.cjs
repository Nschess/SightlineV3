'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const integrationRoot = path.resolve(__dirname, '..');
const secureRoot = process.argv[2] && path.resolve(process.argv[2]);
if (!secureRoot) throw new Error('Usage: node tools/verify-chat1-secure-integration.cjs <secure-transport-descendant-root>');

const expected = {
  secureServer: '72dfaa1becfaf9f519b282ed2280a2eea11a9e080815151738e2d4afe3be042c',
  chat1Server: '6591cdf06577bebb7dc67c04c27254c58ea415e255760effe9e02d5e07535094',
  integrationServer: '5b88efcf9778129cfb2749a7cf27f2f1ba03e72b274194aebbd1b92e5ef7c8de'
};
const serverRel = 'AndroidProject/app/src/main/assets/phone-host/server.js';
const secureServer = fs.readFileSync(path.join(secureRoot, serverRel), 'utf8');
const integrationServer = fs.readFileSync(path.join(integrationRoot, serverRel), 'utf8');
const chat1Server = fs.readFileSync(path.join(integrationRoot, 'acceptance/integration-inputs/CHAT1-current-server.snapshot.js'), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const digests = {
  secureServer: sha(secureServer),
  chat1Server: sha(chat1Server),
  integrationServer: sha(integrationServer)
};
for (const [name, value] of Object.entries(expected)) {
  if (digests[name] !== value) throw new Error(`${name} fingerprint mismatch: ${digests[name]}`);
}

const start = '/* ---------------- minimal WebSocket (RFC 6455), text frames only ---------------- */';
const end = '/* ---------------- game state ---------------- */';
function section(source) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Could not isolate parser/Conn source.');
  return source.slice(a, b);
}
function decoder(source) {
  const match = source.match(/^const WS_TEXT_DECODER = .*;$/m);
  if (!match) throw new Error('UTF-8 decoder declaration missing.');
  return match[0];
}
const parserSha256 = sha(section(integrationServer));
if (section(integrationServer) !== section(chat1Server)) throw new Error('Integrated parser/Conn differs from pinned Chat 1 source.');
if (decoder(integrationServer) !== decoder(chat1Server)) throw new Error('Integrated UTF-8 decoder differs from pinned Chat 1 source.');

let canonical = integrationServer.replace(decoder(integrationServer) + '\n', '');
const ia = canonical.indexOf(start), ib = canonical.indexOf(end, ia + start.length);
const sa = secureServer.indexOf(start), sb = secureServer.indexOf(end, sa + start.length);
if ([ia, ib, sa, sb].some(value => value < 0)) throw new Error('Could not restore secure baseline parser section.');
canonical = canonical.slice(0, ia) + secureServer.slice(sa, sb) + canonical.slice(ib);
const keyHelperStart = canonical.indexOf('function validWebSocketKey(value) {');
const upgradeStart = canonical.indexOf("server.on('upgrade', (req, sock) => {", keyHelperStart);
if (keyHelperStart < 0 || upgradeStart < 0) throw new Error('Could not isolate the reviewed RFC 6455 handshake validation.');
canonical = canonical.slice(0, keyHelperStart) + canonical.slice(upgradeStart);
const strictGuardStart = canonical.indexOf("  const connectionTokens = String(req.headers.connection || '').split(',')");
const strictGuardEndText = '!validWebSocketKey(key)) { sock.destroy(); return; }';
const strictGuardEnd = canonical.indexOf(strictGuardEndText, strictGuardStart);
if (strictGuardStart < 0 || strictGuardEnd < 0) throw new Error('Could not restore the secure ancestor handshake guard.');
const legacyGuard = "  if ((req.url || '').split('?')[0] !== '/ws' || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { sock.destroy(); return; }";
canonical = canonical.slice(0, strictGuardStart) + legacyGuard + canonical.slice(strictGuardEnd + strictGuardEndText.length);
if (canonical !== secureServer) throw new Error('Changes outside the reviewed parser and handshake sections differ from the secure descendant.');

const secureFiles = [
  'AndroidProject/app/src/main/assets/phone-host/host-transport-config.js',
  'AndroidProject/app/src/main/assets/phone-host/mp-transport-policy.js',
  'AndroidProject/app/src/main/assets/www/mp-transport-policy.js',
  'AndroidProject/app/src/main/assets/phone-host/index.html',
  'AndroidProject/app/src/main/assets/www/index.html',
  'AndroidProject/app/build.gradle',
  'AndroidProject/app/src/main/AndroidManifest.xml',
  'AndroidProject/app/src/debug/AndroidManifest.xml',
  'AndroidProject/app/src/main/res/xml/network_security_config.xml',
  'AndroidProject/app/src/debug/res/xml/network_security_config.xml',
  'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java',
  'AndroidProject/app/src/main/java/com/sightline/v3/LanHostService.java',
  'SIGHTLINE.bat'
];
const comparisons = secureFiles.map(rel => {
  const left = fs.readFileSync(path.join(secureRoot, rel));
  const right = fs.readFileSync(path.join(integrationRoot, rel));
  const exactMatch = left.equals(right);
  let restoredMatch = exactMatch;
  if (rel === 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java' && !exactMatch) {
    const source = right.toString('utf8');
    const restored = source.replace(
      /    private static final String ASSET_DOMAIN = "appassets\.androidplatform\.net";\r?\n    private static final String OFFLINE_URL = "https:\/\/" \+ ASSET_DOMAIN \+ "\/assets\/www\/index\.html";\r?\n/,
      ''
    );
    restoredMatch = restored !== source && Buffer.from(restored, 'utf8').equals(left);
  }
  return { path: rel, sha256: sha(right), exactMatch, matchesAfterReviewedAndroidCorrection: restoredMatch };
});
const mismatches = comparisons.filter(item => !item.matchesAfterReviewedAndroidCorrection);
if (mismatches.length) throw new Error(`Secure transport source changed outside approved refreshes: ${mismatches.map(item => item.path).join(', ')}`);

console.log(JSON.stringify({
  result: 'PASS_CHAT1_PARSER_AND_RFC6455_HANDSHAKE_FIX_INTEGRATED_WITH_SECURE_TRANSPORT_PRESERVED',
  fingerprints: digests,
  parserSha256,
  canonicalServerRestoresExactSecureBaseline: true,
  transportAndroidAndClientFilesExactMatches: comparisons.filter(item => item.exactMatch).length,
  reviewedAndroidMainActivityRestoresExactSecureBaseline: comparisons.find(item => item.path.endsWith('/MainActivity.java'))?.matchesAfterReviewedAndroidCorrection === true,
  files: comparisons
}, null, 2));

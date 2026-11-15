'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const integrationRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(integrationRoot, 'acceptance', 'INTEGRATION-SOURCE-MANIFEST-2026-11-01.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const errors = [];
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const check = (file, expected, label) => {
  if (!fs.existsSync(file)) {
    errors.push(`${label}: missing ${file}`);
    return;
  }
  const actual = hash(file);
  if (actual !== expected.toLowerCase()) errors.push(`${label}: expected ${expected}, received ${actual}`);
};

const sourceFiles = {
  frozenProtocolV2: {
    server: 'c7352d89558a3f481b9314b0f1a09fb0f8fdc70a2d4c701109b13f530e95e5f9',
    page: '237f8edfa709cd2ba03b94e3d454aca778674d31411ec882f64cd505b3338240',
    hostManifest: 'b2e81f967dce3c85f10b5b46cf2720bffaa109ccef6b7ee747ddae5cb4d52663',
    androidSourceManifest: '1884682ec077bba33ee5e14bc94278a3470a439a9779cd21242d2cc329b99f05'
  },
  secureTransportAncestor: {
    server: '72dfaa1becfaf9f519b282ed2280a2eea11a9e080815151738e2d4afe3be042c',
    page: 'f3eaf6cbf357059a074ca090a9842b0ab565b38783b5280be21c17dd3231b686',
    hostManifest: '3e71149a933a8abfbedb910ca27c62ebdfcd9e808ea2ee42ffa3b08e3986e096',
    androidSourceManifest: '7036f1f54b6052b104cb88899fd48d1c49bf6eba72965a8674d8d33ad0389715'
  },
  chat1PinnedSnapshot: {
    server: '6591cdf06577bebb7dc67c04c27254c58ea415e255760effe9e02d5e07535094',
    page: '237f8edfa709cd2ba03b94e3d454aca778674d31411ec882f64cd505b3338240',
    hostManifest: '5df7a4033315c1da745dbb2b6b829f7c5d4231e3293438699d1392063fe37de5',
    androidSourceManifest: 'cacc0f8c2215e32879dfd63e36e30fe01a8bad2f70cd50cc391f4a6fcecf628c'
  },
  integratedDescendant: {
    server: '5b88efcf9778129cfb2749a7cf27f2f1ba03e72b274194aebbd1b92e5ef7c8de',
    page: 'f3eaf6cbf357059a074ca090a9842b0ab565b38783b5280be21c17dd3231b686',
    hostManifest: 'e129147673b63daaea91392c47cf16fb873fb2c2fffd85c328ee60836a514c6d',
    androidSourceManifest: '6f9ab0fe61a7ca93caa3120a8471a21d1014243d41620de73dfb42b29fbb1064'
  }
};

const sourcePaths = {
  server: 'AndroidProject/app/src/main/assets/phone-host/server.js',
  page: 'AndroidProject/app/src/main/assets/phone-host/index.html',
  hostManifest: 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS',
  androidSourceManifest: 'AndroidProject/CURRENT-SOURCE-SHA256.txt'
};

for (const [sourceName, expectedFiles] of Object.entries(sourceFiles)) {
  const source = manifest.sources[sourceName];
  for (const [name, expected] of Object.entries(expectedFiles)) {
    check(path.join(source.root, sourcePaths[name]), expected, `${sourceName}.${name}`);
    if (source[name === 'server' ? 'serverSha256' : name === 'page' ? 'pageSha256' : name === 'hostManifest' ? 'hostManifestSha256' : 'androidSourceManifestSha256'] !== expected) {
      errors.push(`${sourceName}.${name}: manifest source pin disagrees with verifier pin`);
    }
  }
}

const integrated = manifest.sources.integratedDescendant.root;
for (const item of manifest.verification) {
  check(path.join(integrationRoot, item.file), item.sha256, item.name);
}
check(path.join(integrationRoot, manifest.integrationProof.sourceParityResultFile), manifest.integrationProof.sourceParityResultSha256, 'sourceParityResult');
check(path.join(integrationRoot, manifest.integrationProof.checkerFile), manifest.integrationProof.checkerSha256, 'integrationChecker');
check(path.join(integrated, 'acceptance/integration-inputs/CHAT1-current-server.snapshot.js'), manifest.sources.chat1PinnedSnapshot.serverSha256, 'chat1ServerInputSnapshot');
check(path.join(integrated, 'acceptance/integration-inputs/CHAT1-NETWORK-HARDENING.patch'), manifest.sources.chat1PinnedSnapshot.patchSha256, 'chat1PatchInput');
check(path.join(integrationRoot, manifest.reviewFinding.regressionFile), manifest.reviewFinding.regressionSha256, 'handshakeRegression');
check(path.join(integrationRoot, manifest.androidReviewFinding.file), manifest.androidReviewFinding.currentFileSha256, 'mainActivityAssetUrlCorrection');
check(path.join(integrationRoot, manifest.androidReviewFinding.regressionFile), manifest.androidReviewFinding.regressionSha256, 'androidAssetUrlRegression');

const parity = JSON.parse(fs.readFileSync(path.join(integrationRoot, manifest.integrationProof.sourceParityResultFile), 'utf8'));
if (parity.parserSha256 !== manifest.integrationProof.chat1ParserSha256) errors.push('parser SHA does not match source parity evidence');
if (!parity.canonicalServerRestoresExactSecureBaseline ||
    parity.transportAndroidAndClientFilesExactMatches !== 12 ||
    !parity.reviewedAndroidMainActivityRestoresExactSecureBaseline) {
  errors.push('source parity result does not satisfy expected integration proof');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('PASS: four source identities, source manifests, 9 verification logs, parser/handshake/Android proof, secure-file parity, and Chat 1 inputs match the source manifest.');
}

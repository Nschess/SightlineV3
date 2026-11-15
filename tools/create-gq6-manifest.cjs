'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const manifestName = 'GAMEPLAY-QUALITY-6.0-MANIFEST.json';
const excludedDirs = [
  'AndroidProject/.gradle',
  'AndroidProject/build',
  'AndroidProject/app/build'
];
const isExcluded = rel => excludedDirs.some(p => rel === p || rel.startsWith(p + '/'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const files = [];
function walk(abs, rel = '') {
  for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (isExcluded(childRel) || childRel === manifestName) continue;
    const childAbs = path.join(abs, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symbolic links are not package inputs: ${childRel}`);
    if (entry.isDirectory()) walk(childAbs, childRel);
    else if (entry.isFile()) {
      const data = fs.readFileSync(childAbs);
      files.push({ path: childRel, size: data.length, sha256: sha(data) });
    }
  }
}
walk(root);
const get = rel => {
  const data = fs.readFileSync(path.join(root, rel));
  return { path: rel, size: data.length, sha256: sha(data) };
};
const manifest = {
  schemaVersion: 1,
  candidate: 'Sightline V3 Gameplay Quality 6.0 Experimental DEV',
  generatedUtc: new Date().toISOString(),
  parent: {
    candidate: 'Sightline V3 Android 5.1 DEV / LAN Zombies 4.2',
    androidProjectFilesCompared: 190,
    androidProjectChanged: 0,
    verifiedDebugApkSha256: '1a673656e95671264e2401f165d4e09ba722db4f1e2736fe9cfbfb16aee9a8ba'
  },
  runtimeFingerprints: {
    phoneHostServer: get('AndroidProject/app/src/main/assets/phone-host/server.js'),
    phoneHostPage: get('AndroidProject/app/src/main/assets/phone-host/index.html'),
    offlinePage: get('AndroidProject/app/src/main/assets/www/index.html'),
    projectInstructions: get('AGENTS.md')
  },
  gameplayRuntimeChanges: 0,
  testHarnessCorrection: 'tests/settings-accuracy.mjs adds units: [] to the mocked performanceInfo context; no production runtime change.',
  excludedGeneratedDirectories: excludedDirs,
  manifestSelfHash: 'excluded by design; verify the archive hash via the external SHA-256 sidecar.',
  fileCount: files.length,
  totalBytes: files.reduce((n, f) => n + f.size, 0),
  files
};
const out = path.join(root, manifestName);
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ out, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes, serverSha256: manifest.runtimeFingerprints.phoneHostServer.sha256, pageSha256: manifest.runtimeFingerprints.phoneHostPage.sha256 }, null, 2));

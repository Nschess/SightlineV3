'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const relOut = 'acceptance/release-readiness-7.0-source-manifest.json';
const relHash = `${relOut}.sha256`;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const entries = [];
function walk(dir, rel = '') {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const childRel = rel ? `${rel}/${ent.name}` : ent.name;
    const child = path.join(dir, ent.name);
    if (['.git', '.gradle', 'build', 'node_modules', 'outputs'].includes(ent.name)) continue;
    if (ent.isSymbolicLink()) throw new Error(`Release package cannot contain symlinks: ${childRel}`);
    if (ent.isDirectory()) walk(child, childRel);
    else if (ent.isFile() && childRel !== relOut && childRel !== relHash) {
      const data = fs.readFileSync(child);
      entries.push({ path: childRel, sizeBytes: data.length, sha256: sha(data) });
    }
  }
}
walk(root); entries.sort((a,b) => a.path.localeCompare(b.path));
const manifest = {
  schemaVersion: 1,
  candidate: 'Sightline V3 Release Readiness 7.0 Experimental DEV',
  generatedAtUtc: new Date().toISOString(),
  exclusions: ['.git', '.gradle', 'build', 'node_modules', 'outputs', 'manifest and detached manifest hash'],
  fileCount: entries.length,
  totalBytes: entries.reduce((n, x) => n + x.sizeBytes, 0),
  projectInstructionsSha256: entries.find(x => x.path === 'AGENTS.md')?.sha256 || null,
  preservedAndroid51Apk: entries.find(x => x.path === 'artifacts/baseline/SightlineV3-Android-5.1-debug-v4.apk') || null,
  phoneHostServerSha256: entries.find(x => x.path === 'AndroidProject/app/src/main/assets/phone-host/server.js')?.sha256 || null,
  files: entries
};
if (!manifest.projectInstructionsSha256 || !manifest.preservedAndroid51Apk || !manifest.phoneHostServerSha256) throw new Error('Required project instructions, baseline APK, or host source is absent.');
const outPath = path.join(root, ...relOut.split('/'));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const body = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(outPath, body);
fs.writeFileSync(path.join(root, ...relHash.split('/')), `${sha(Buffer.from(body))}  ${path.basename(outPath)}\n`);
console.log(JSON.stringify({ status: 'WROTE', path: outPath, sha256: sha(Buffer.from(body)), fileCount: entries.length, totalBytes: manifest.totalBytes, phoneHostServerSha256: manifest.phoneHostServerSha256 }, null, 2));

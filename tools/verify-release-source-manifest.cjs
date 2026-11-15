'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifestRel = 'acceptance/release-readiness-7.0-source-manifest.json';
const hashRel = `${manifestRel}.sha256`;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const manifestBytes = fs.readFileSync(path.join(root, ...manifestRel.split('/')));
const expectedManifestHash = fs.readFileSync(path.join(root, ...hashRel.split('/')), 'utf8').trim().split(/\s+/)[0];
if (sha(manifestBytes) !== expectedManifestHash) throw new Error('Source manifest SHA-256 mismatch.');
const manifest = JSON.parse(manifestBytes);
const expected = new Map(manifest.files.map(x => [x.path, x]));
if (expected.size !== manifest.fileCount) throw new Error('Manifest contains duplicate paths or inconsistent fileCount.');
const seen = new Set(); let total = 0;
function walk(dir, rel = '') {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${ent.name}` : ent.name;
    const child = path.join(dir, ent.name);
    if (['.git', '.gradle', 'build', 'node_modules', 'outputs'].includes(ent.name)) continue;
    if (ent.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${childRel}`);
    if (ent.isDirectory()) walk(child, childRel);
    else if (ent.isFile() && childRel !== manifestRel && childRel !== hashRel) {
      const item = expected.get(childRel);
      if (!item) throw new Error(`Unmanifested file: ${childRel}`);
      const data = fs.readFileSync(child);
      if (data.length !== item.sizeBytes || sha(data) !== item.sha256) throw new Error(`Source file hash/size mismatch: ${childRel}`);
      seen.add(childRel); total += data.length;
    }
  }
}
walk(root);
const missing = [...expected.keys()].filter(x => !seen.has(x));
if (missing.length) throw new Error(`Missing ${missing.length} manifested files: ${missing.slice(0, 10).join(', ')}`);
if (total !== manifest.totalBytes) throw new Error(`Total byte mismatch: ${total} vs ${manifest.totalBytes}`);
console.log(JSON.stringify({ status: 'PASS', root, fileCount: seen.size, totalBytes: total, sourceManifestSha256: expectedManifestHash, projectInstructionsSha256: manifest.projectInstructionsSha256, phoneHostServerSha256: manifest.phoneHostServerSha256 }, null, 2));

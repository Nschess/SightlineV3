'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '../../../android-apk-restoration-5.1-20261105/DEV/AndroidProject/app/src/main/assets'));
const out = path.resolve(process.argv[3] || path.join(__dirname, '../acceptance/apk-baseline/APK-ASSET-HASHES.json'));
const expectedApkSha256 = process.argv[4] || '1a673656e95671264e2401f165d4e09ba722db4f1e2736fe9cfbfb16aee9a8ba';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const files = [];
function walk(abs, rel = '') {
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const childAbs = path.join(abs, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symlink not allowed: ${childRel}`);
    if (entry.isDirectory()) walk(childAbs, childRel);
    else if (entry.isFile()) { const data = fs.readFileSync(childAbs); files.push({ path: childRel, size: data.length, sha256: sha(data) }); }
  }
}
walk(root); files.sort((a,b)=>a.path.localeCompare(b.path));
const manifest = { schemaVersion: 1, baseline: 'Source asset tree supplied to the APK verifier', expectedApkSha256, assetCount: files.length, files };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({status:'WROTE_BASELINE_APK_ASSET_MANIFEST',assetCount:files.length,out},null,2));

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const apkPath = path.resolve(process.argv[2] || path.join(__dirname, '../artifacts/baseline/SightlineV3-Android-5.1-debug-v4.apk'));
const sourceManifestPath = path.resolve(process.argv[3] || path.join(__dirname, '../acceptance/apk-baseline/APK-ASSET-HASHES.json'));
const expectedApkSha256Arg = process.argv[4] || '1a673656e95671264e2401f165d4e09ba722db4f1e2736fe9cfbfb16aee9a8ba';
const expectedApkSha256 = expectedApkSha256Arg === '-' ? null : expectedApkSha256Arg.toLowerCase();
const apk = fs.readFileSync(apkPath);
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const fail = message => { throw new Error(message); };
const baselineManifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
const baselineAssetHashes = new Map(baselineManifest.files.map(file => [file.path, file.sha256]));
if (!baselineAssetHashes.size || baselineAssetHashes.size !== baselineManifest.assetCount) fail('Baseline source asset manifest is empty or inconsistent.');
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); crcTable[n] = c >>> 0; }
function crc32(data) { let c = 0xffffffff; for (const v of data) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const apkSha256 = digest(apk);
if (expectedApkSha256 && apkSha256 !== expectedApkSha256) fail(`APK SHA-256 mismatch: ${apkSha256}`);
const searchFrom = Math.max(0, apk.length - 65557);
let eocd = -1;
for (let p = apk.length - 22; p >= searchFrom; p--) if (apk.readUInt32LE(p) === 0x06054b50) { eocd = p; break; }
if (eocd < 0) fail('ZIP end-of-central-directory record not found.');
const totalEntries = apk.readUInt16LE(eocd + 10), centralSize = apk.readUInt32LE(eocd + 12), centralOffset = apk.readUInt32LE(eocd + 16);
if (totalEntries === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) fail('ZIP64 APK is not supported by this verifier.');
if (centralOffset + centralSize > eocd) fail('Central directory is outside APK bounds.');
const packedAssets = new Map(), names = new Set();
let cursor = centralOffset;
for (let i = 0; i < totalEntries; i++) {
  if (apk.readUInt32LE(cursor) !== 0x02014b50) fail(`Invalid central-directory entry ${i}.`);
  const method = apk.readUInt16LE(cursor + 10), expectedCrc = apk.readUInt32LE(cursor + 16);
  const compressedSize = apk.readUInt32LE(cursor + 20), uncompressedSize = apk.readUInt32LE(cursor + 24);
  const nameLen = apk.readUInt16LE(cursor + 28), extraLen = apk.readUInt16LE(cursor + 30), commentLen = apk.readUInt16LE(cursor + 32);
  const localOffset = apk.readUInt32LE(cursor + 42), name = apk.toString('utf8', cursor + 46, cursor + 46 + nameLen);
  if (names.has(name)) fail(`Duplicate ZIP entry: ${name}`);
  names.add(name);
  if (localOffset + 30 > apk.length || apk.readUInt32LE(localOffset) !== 0x04034b50) fail(`Invalid local header: ${name}`);
  const localNameLen = apk.readUInt16LE(localOffset + 26), localExtraLen = apk.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + localNameLen + localExtraLen;
  if (dataOffset + compressedSize > apk.length) fail(`Truncated entry: ${name}`);
  const compressed = apk.subarray(dataOffset, dataOffset + compressedSize);
  let data;
  if (method === 0) data = Buffer.from(compressed);
  else if (method === 8) data = zlib.inflateRawSync(compressed);
  else fail(`Unsupported ZIP compression method ${method}: ${name}`);
  if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) fail(`ZIP content integrity failure: ${name}`);
  if (name.startsWith('assets/') && !name.endsWith('/')) {
    const relative = name.slice('assets/'.length).replace(/\//g, path.sep);
    const expected = baselineAssetHashes.get(relative.split(path.sep).join('/'));
    if (!expected) fail(`APK contains asset absent from baseline source manifest: ${relative}`);
    if (digest(data) !== expected) fail(`APK/baseline source asset hash mismatch: ${relative}`);
    packedAssets.set(relative, true);
  }
  cursor += 46 + nameLen + extraLen + commentLen;
}
if (cursor !== centralOffset + centralSize) fail('Central-directory length does not match its entries.');
const missing = [...baselineAssetHashes.keys()].filter(p => !packedAssets.has(p.split('/').join(path.sep)));
if (missing.length) fail(`APK is missing baseline source assets: ${missing.slice(0, 10).join(', ')}`);
if (packedAssets.size !== baselineAssetHashes.size) fail(`APK/baseline asset counts differ: ${packedAssets.size} vs ${baselineAssetHashes.size}`);
console.log(JSON.stringify({ status: 'PASS', apkPath, apkSha256, expectedApkSha256, sourceManifestPath, zipEntries: totalEntries, sourceAssetCount: baselineAssetHashes.size, packagedAssetCount: packedAssets.size, packagedAssetHashes: 'all match the supplied source asset manifest', packageIdentityAndV2Signature: 'Requires separate apksigner/aapt evidence.' }, null, 2));

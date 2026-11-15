'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const outRel = 'acceptance/premium-lobby-implementation-2026-11-08';
const manifestName = 'SOURCE-MANIFEST.json';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifestBytes = fs.readFileSync(path.join(root, outRel, manifestName));
const checksum = fs.readFileSync(path.join(root, outRel, `${manifestName}.sha256`), 'utf8').trim();
const match = checksum.match(/^([a-f0-9]{64})  SOURCE-MANIFEST\.json$/);
if (!match || hash(manifestBytes) !== match[1]) throw new Error('Manifest sidecar checksum mismatch.');
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const listed = new Map();
let totalBytes = 0;
for (const item of manifest.files) {
  if (listed.has(item.path)) throw new Error(`Duplicate entry: ${item.path}`);
  listed.set(item.path, item);
  const abs = path.resolve(root, ...item.path.split('/'));
  if (!abs.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe manifest path: ${item.path}`);
  const bytes = fs.readFileSync(abs);
  if (bytes.length !== item.size || hash(bytes) !== item.sha256) throw new Error(`File mismatch: ${item.path}`);
  totalBytes += bytes.length;
}
function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (rel === `${outRel}/${manifestName}` || rel === `${outRel}/${manifestName}.sha256` || rel === 'debug.log') continue;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${rel}`);
    if (entry.isDirectory()) result.push(...walk(abs));
    else if (entry.isFile()) result.push(rel);
    else throw new Error(`Unsupported filesystem entry: ${rel}`);
  }
  return result;
}
const actual = walk(root).sort((a, b) => a.localeCompare(b, 'en'));
const expected = [...listed.keys()].sort((a, b) => a.localeCompare(b, 'en'));
if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
  throw new Error(`Inventory mismatch: actual ${actual.length}, manifest ${expected.length}.`);
}
console.log(JSON.stringify({ status: 'PASS', files: actual.length, totalBytes, manifestSha256: match[1], visualAcceptance: manifest.verification.visualAcceptance }, null, 2));

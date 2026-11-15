'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateDrop, normalizeAssetPath, prepareIntegration } = require('../tools/prepare-legendary3-integration.cjs');

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function put(root, rel, data) { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; }
function pair(root, contents = 'const legendary3 = true;\n') {
  const a = 'AndroidProject/app/src/main/assets/www/legendary3-test.js';
  const b = 'AndroidProject/app/src/main/assets/phone-host/legendary3-test.js';
  put(root, a, contents); put(root, b, contents);
  return [{ path: a, sha256: sha(Buffer.from(contents)) }, { path: b, sha256: sha(Buffer.from(contents)) }];
}

test('Legendary drop validator accepts a complete hash-pinned Offline/phone-host pair', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sightline-r7-legendary-'));
  try {
    const files = pair(tmp);
    assert.equal(validateDrop(tmp, { schemaVersion: 1, files }).files.length, 2);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Legendary drop validator rejects traversal, unpaired runtime files, and hash mismatch', () => {
  assert.throws(() => normalizeAssetPath('../outside.js'), /Invalid relative|Unsafe manifest path/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sightline-r7-legendary-'));
  try {
    const files = pair(tmp);
    assert.throws(() => validateDrop(tmp, { schemaVersion: 1, files: files.slice(0, 1) }), /file count|both Offline/);
    assert.throws(() => validateDrop(tmp, { schemaVersion: 1, files: files.map(f => ({ ...f, sha256: '0'.repeat(64) })) }), /SHA-256 mismatch/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('Legendary staging creates a new descendant, updates asset manifests, and leaves its parent unchanged', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sightline-r7-legendary-'));
  try {
    const source = path.join(tmp, 'parent'); const drop = path.join(tmp, 'drop'); const out = path.join(tmp, 'new-child');
    fs.mkdirSync(source); fs.mkdirSync(drop);
    const instructionSource = path.resolve(__dirname, '../AGENTS.md');
    fs.copyFileSync(instructionSource, path.join(source, 'AGENTS.md'));
    const oldA = 'old payload\n';
    const parentFiles = pair(source, oldA);
    const androidRoot = path.join(source, 'AndroidProject');
    const androidRows = parentFiles.map(f => `${f.sha256}  ${f.path.slice('AndroidProject/'.length)}`).sort().join('\n') + '\n';
    put(source, 'AndroidProject/CURRENT-SOURCE-SHA256.txt', androidRows);
    const hostRows = parentFiles.filter(f => f.path.includes('/phone-host/')).map(f => `${f.sha256}  ${f.path.split('/').at(-1)}`).join('\n') + '\n';
    put(source, 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS', hostRows);
    const incoming = pair(drop, 'new Legendary 3.0 payload\n');
    const parentHash = sha(fs.readFileSync(path.join(source, 'AndroidProject/app/src/main/assets/phone-host/legendary3-test.js')));
    const result = prepareIntegration(source, drop, { schemaVersion: 1, owner: 'Claude', candidate: 'Legendary Guns 3.0', files: incoming }, out);
    assert.equal(result.files, 2);
    assert.equal(sha(fs.readFileSync(path.join(source, 'AndroidProject/app/src/main/assets/phone-host/legendary3-test.js'))), parentHash);
    assert.equal(fs.readFileSync(path.join(out, 'AndroidProject/app/src/main/assets/phone-host/legendary3-test.js'), 'utf8'), 'new Legendary 3.0 payload\n');
    assert.ok(fs.existsSync(path.join(out, 'AGENTS.md')));
    assert.ok(fs.existsSync(result.deltaPath));
    const currentLines = fs.readFileSync(path.join(out, 'AndroidProject/CURRENT-SOURCE-SHA256.txt'), 'utf8');
    const hostLines = fs.readFileSync(path.join(out, 'AndroidProject/app/src/main/assets/phone-host/SHA256SUMS'), 'utf8');
    assert.match(currentLines, /legendary3-test\.js/);
    assert.match(hostLines, /legendary3-test\.js/);
    assert.throws(() => prepareIntegration(source, drop, { schemaVersion: 1, files: incoming }, out), /Refusing to overwrite/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

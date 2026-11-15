'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const sourceCheckpoint = path.join(root, 'rollback/pre-world-realism-original-19-map-source-20261110');
const prechangeCheckpoint = path.join(root, 'rollback/map-original-baseline-recovery-prechange-20261112');
const pagePaths = {
  offline: 'AndroidProject/app/src/main/assets/www/index.html',
  phone: 'AndroidProject/app/src/main/assets/phone-host/index.html'
};
const oldPageHashes = {
  offline: 'b94cfb7899e5f7a2f479b4fc869d49f68aa5119b78a4c5b88f1cec4dcafaa9c3',
  phone: '23515a0457f9ce3380428de47873327549d507599ed79c4defc6669452f094f1'
};
const prechangePageHashes = {
  offline: '2f053f9ad365457222b2588cf652b491386ed79ec7255b709be024b93f396a71',
  phone: 'b3a7a7d9ef1d977d24ef0b0514fb97cf85d409eac2b409ac104b035f21654a9c'
};
const visualMapFields = new Set(['sky', 'fog', 'fogN', 'fogF', 'hemi', 'sun', 'tex']);
const rejectedGenerators = [
  'MAP_WORLD_EDGE_PROFILES', 'buildMapWorldBeyond(', 'addWorldEdgeCollider(',
  'addBatchMesh(', 'buildBoundaryClosure(', 'buildApproach(', 'function noise(',
  'buildCourtyardUrbanWorld(', 'buildMapStructuralGeometry(',
  'buildPlayableFacadeDetails(', 'addOrganicHorizon()'
];

function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), 'utf8'); }
function readPrechange(relativePath) {
  const savedRelative = relativePath.endsWith('www/index.html') ? 'www/index.html' : 'phone-host/index.html';
  return fs.readFileSync(path.join(prechangeCheckpoint, savedRelative), 'utf8');
}
function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `missing source end marker: ${end}`);
  return source.slice(from, to);
}
function mapConfig(source) {
  const block = sliceBetween(source, 'var MAPS = [', '\nvar DEFTEX =');
  const code = 'function O(x,z,w,d,h,k,bottom){return {x,z,w,d,h,k,...(bottom?{bottom}:{})};}\n' + block + '\nMAPS';
  return JSON.parse(JSON.stringify(vm.runInNewContext(code, {}, { timeout: 2000 })));
}
function stripVisualFields(map) {
  return Object.fromEntries(Object.entries(map).filter(([key]) => !visualMapFields.has(key)));
}
function replaceBetween(source, start, end, replacement) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing source start: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `missing source end: ${end}`);
  return source.slice(0, from) + replacement + source.slice(to);
}

test('Offline and phone-host map configs and renderer match the pre-world-realism 19-map checkpoint', () => {
  for (const [variant, relativePath] of Object.entries(pagePaths)) {
    const current = read(relativePath);
    const checkpoint = fs.readFileSync(path.join(sourceCheckpoint, relativePath.endsWith('www/index.html') ? 'www/index.html' : 'phone-host/index.html'), 'utf8');
    const digest = crypto.createHash('sha256').update(checkpoint).digest('hex');
    assert.equal(digest, oldPageHashes[variant], `${variant}: retained source checkpoint identity`);
    assert.equal(sliceBetween(current, 'var MAPS = [', '\nvar DEFTEX ='), sliceBetween(checkpoint, 'var MAPS = [', '\nvar DEFTEX ='), `${variant}: original map presentation fields`);
    assert.equal(sliceBetween(current, 'function mkTex(', 'function canPick('), sliceBetween(checkpoint, 'function mkTex(', 'function canPick('), `${variant}: original renderer block`);
    for (const marker of rejectedGenerators) assert.equal(current.includes(marker), false, `${variant}: rejected generator remains: ${marker}`);
  }
});

test('all 19 original map identities and gameplay geometry remain intact', () => {
  const current = mapConfig(read(pagePaths.offline));
  const previous = mapConfig(readPrechange(pagePaths.offline));
  assert.equal(current.length, 19);
  assert.deepEqual(current.map(map => map.id), previous.map(map => map.id));
  for (const map of current) {
    const old = previous.find(candidate => candidate.id === map.id);
    assert.ok(old, `${map.id}: existed in the last candidate`);
    assert.deepEqual(stripVisualFields(map), stripVisualFields(old), `${map.id}: collision, routes, spawns, objectives and navigation inputs remain unchanged`);
  }
  const phoneData = JSON.parse(fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/data.json'), 'utf8'));
  assert.deepEqual(current.map(map => map.id), phoneData.maps.map(map => map.id));
});

test('restoration changed only map data and the map-renderer region in production pages', () => {
  for (const relativePath of Object.values(pagePaths)) {
    const prior = readPrechange(relativePath);
    let reconstructed = read(relativePath);
    reconstructed = replaceBetween(reconstructed, 'var MAPS = [', '\nvar DEFTEX =', sliceBetween(prior, 'var MAPS = [', '\nvar DEFTEX ='));
    reconstructed = replaceBetween(reconstructed, 'function mkTex(', 'function canPick(', sliceBetween(prior, 'function mkTex(', 'function canPick('));
    assert.equal(reconstructed, prior, `${relativePath}: all code outside selected map-only ranges is byte-identical`);
  }
});

test('Offline and phone-host map configuration and renderer remain byte-identical', () => {
  for (const [start, end] of [['var MAPS = [', '\nvar DEFTEX ='], ['function mkTex(', 'function canPick(']]) {
    assert.equal(sliceBetween(read(pagePaths.offline), start, end), sliceBetween(read(pagePaths.phone), start, end));
  }
});

test('both pre-restoration production pages are preserved as rollback evidence', () => {
  for (const [variant, relativePath] of Object.entries(pagePaths)) {
    const saved = fs.readFileSync(path.join(prechangeCheckpoint, relativePath.endsWith('www/index.html') ? 'www/index.html' : 'phone-host/index.html'));
    const digest = crypto.createHash('sha256').update(saved).digest('hex');
    assert.equal(digest, prechangePageHashes[variant], `${variant}: pre-restoration rollback page hash`);
  }
});

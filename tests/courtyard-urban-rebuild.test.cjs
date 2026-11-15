const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const offline = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
const phone = fs.readFileSync(path.join(assets, 'phone-host/index.html'), 'utf8');
const baseline = fs.readFileSync(path.join(root, 'rollback/courtyard-rebuild-prechange-20261111/files/AndroidProject/app/src/main/assets/www/index.html'), 'utf8');

function mapArray(source) {
  const start = source.indexOf('var MAPS = ['), end = source.indexOf('var CURMAP =', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end).replace(/\r\n/g, '\n');
}

function mapEntry(source, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|\\r?\\n)  \\{\\r?\\n\\s+id\\s*:\\s*['\"]${escaped}['\"]`);
  const match = pattern.exec(source);
  assert.ok(match, `map ${id} exists`);
  const start = match.index + match[1].length;
  const next = /\r?\n  \{\r?\n\s+id\s*:/.exec(source.slice(start + 1));
  const end = next ? start + 1 + next.index : source.indexOf('\n];', start);
  assert.ok(start > 0 && end > start, `map ${id} bounds are valid`);
  return source.slice(start, end);
}

function mapSourceWithoutCourtyard(source) {
  const courtyardStart = source.indexOf("\n  {\n    id: 'courtyard'");
  const duneStart = source.indexOf("\n  {\n    id: 'dune'", courtyardStart + 1);
  assert.ok(courtyardStart >= 0 && duneStart > courtyardStart, 'Courtyard and next map bounds exist');
  return source.slice(0, courtyardStart) + source.slice(duneStart);
}

function field(entry, start, end) {
  const a = entry.indexOf(start), b = entry.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `map field ${start} exists`);
  return entry.slice(a, b);
}

test('only Courtyard map presentation data changed; gameplay definition is preserved', () => {
  const mapSource = mapArray(offline), baseMapSource = mapArray(baseline);
  const ids = [...mapSource.matchAll(/\bid\s*:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, 19);
  assert.equal(mapSourceWithoutCourtyard(mapSource), mapSourceWithoutCourtyard(baseMapSource), 'all map data outside Courtyard is unchanged');
  const before = mapEntry(baseMapSource, 'courtyard'), after = mapEntry(mapSource, 'courtyard');
  for (const [a, b] of [
    ['area:', 'desc:'], ['spawn:', 'botSpawn:'], ['botSpawn:', 'view:'], ['obst: [', 'zones:'],
    ['zones: [', 'callouts:'], ['callouts: [', 'notes:']
  ]) assert.equal(field(after, a, b), field(before, a, b), `Courtyard ${a} remains unchanged`);
  assert.equal(mapEntry(mapArray(phone), 'courtyard'), mapEntry(mapSource, 'courtyard'), 'Phone-host Courtyard data matches Offline');
});

test('Courtyard architecture and distant city scenery stay render-only and batched', () => {
  const start = offline.indexOf('function buildCourtyardUrbanWorld(m,p){');
  const end = offline.indexOf('function buildCourtyardPlayableArchitecture(m){', start);
  assert.ok(start >= 0 && end > start);
  const city = offline.slice(start, end);
  const archEnd = offline.indexOf('function buildMapWorldBeyond(m){', end);
  const playable = offline.slice(end, archEnd);
  assert.match(city, /new THREE\.InstancedMesh/);
  assert.match(city, /new THREE\.ExtrudeGeometry/);
  assert.match(city, /PlaneGeometry\(330,330\)/);
  assert.match(city, /worldObjs\.push\(mesh\)/);
  assert.match(playable, /OBST\.forEach/);
  assert.match(playable, /new THREE\.InstancedMesh/);
  assert.match(playable, /worldObjs\.push\(mesh\)/);
  for (const source of [city, playable]) {
    assert.doesNotMatch(source, /\b(?:OBST|BOXES|NAV)\s*=|obstacleMeshes\.push/);
  }
  assert.match(offline, /if\(m\.id==='courtyard'\)\{buildCourtyardUrbanWorld\(m,p\);return;\}/);
  assert.match(offline, /if\(m\.id==='courtyard'\)buildCourtyardPlayableArchitecture\(m\);/);
});


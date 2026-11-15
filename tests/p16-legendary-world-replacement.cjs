const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const asset = path.join(root, 'AndroidProject/app/src/main/assets/www');
const html = fs.readFileSync(path.join(asset, 'index.html'), 'utf8');
const THREE = require(path.join(asset, 'three.min.js'));
const skins = require(path.join(asset, 'weapon-skins.js'));

function extract(name) {
  const at = html.indexOf('function ' + name + '(');
  assert.ok(at >= 0, 'missing function ' + name);
  const end = html.indexOf('\n}', at);
  assert.ok(end > at, 'could not isolate function ' + name);
  return html.slice(at, end + 2);
}
const bake = extract('bakeMerge');
const world = extract('legendaryWorldOverlayGeometry');
const presentationMatch = html.match(/var WORLD_WEAPON_PRESENTATION=(\{[\s\S]*?\n\};)/);
assert.ok(presentationMatch, 'world presentation profiles exist');
const profiles = vm.runInNewContext('(' + presentationMatch[1].replace(/;\s*$/, '') + ')');
const meta = { smg: { rightAnchor: [0, 0, 0] }, breacher: { rightAnchor: [0, 0, 0] }, rook117: null, carbine: { rightAnchor: [0, 0, 0] } };
const sandbox = vm.createContext({
  THREE, SightlineWeaponSkins: skins, WORLD_LEGEND_OVERLAY_GEO: {},
  WORLD_WEAPON_PRESENTATION: profiles, WORLD_WEAPON_META: meta,
  window: {}, worldTextureMean: () => null, Set, Math, Number
});
vm.runInContext(bake + '\n' + world + '\nglobalThis.build=legendaryWorldOverlayGeometry;', sandbox);

const metrics = {};
for (const key of ['smg', 'breacher', 'rook117', 'carbine']) {
  const geometry = sandbox.build(key);
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const expectedLength = profiles[key].length;
  assert.ok(Math.abs(size.z - expectedLength) < 1e-4, key + ' third-person replacement fits the firearm length profile');
  assert.ok(size.x < .20 && size.y < .32, key + ' replacement remains within existing carry bounds');
  assert.equal(geometry.userData.sightlineLegendaryWorld.weapon, key);
  if (key === 'rook117') assert.deepEqual(Array.from(geometry.userData.sightlineLegendaryWorld.anchor), [0, 0, 0], 'ROOK keeps its authored receiver root and hand offsets');
  const triangles = geometry.index.count / 3;
  assert.ok(triangles < 8000, key + ' merged world model stays bounded');
  metrics[key] = { length: Number(size.z.toFixed(3)), width: Number(size.x.toFixed(3)), height: Number(size.y.toFixed(3)), triangles };
}
assert.match(html, /WORLD_LEGEND_BASE_HIDDEN_MAT=new THREE\.MeshPhongMaterial\(\{visible:false\}\)/, 'Factory body is hidden behind full replacement in third-person');
assert.match(html, /world-legendary-replacement-/,'third-person diagnostic names the replacement assembly');
console.log('PASS: all four complete third-person replacement geometries are merged, anchored, and scaled to existing carry profiles');
console.log('METRICS', JSON.stringify(metrics));

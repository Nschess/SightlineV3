'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const offline = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
const phone = fs.readFileSync(path.join(assets, 'phone-host/index.html'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(assets, 'phone-host/data.json'), 'utf8'));
const expectedIds = ['floodline_district', 'iron_junction', 'ridgefall_outpost'];

function mapsFrom(page) {
  const begin = page.indexOf('var MAPS = [');
  const end = page.indexOf('\nvar DEFTEX', begin);
  assert.ok(begin >= 0 && end > begin, 'map catalog boundaries exist');
  const source = 'function O(x,z,w,d,h,k,bottom){const o={x,z,w,d,h,k};if(bottom)o.bottom=bottom;return o;}\n' + page.slice(begin, end) + '\nMAPS';
  return vm.runInNewContext(source, { Math, Array, Object, Number }, { timeout: 4000 });
}

test('three original maps have distinct layouts, mission briefs, cover and marked sites', () => {
  const offlineMaps = mapsFrom(offline);
  const added = offlineMaps.filter(map => expectedIds.includes(map.id));
  assert.equal(offlineMaps.length, 22);
  assert.deepEqual(Array.from(added, map => map.id), expectedIds);
  assert.equal(new Set(added.map(map => map.name)).size, 3);
  assert.ok(new Set(added.map(map => map.obst.length)).size >= 2, 'layouts use more than one authored cover density');
  for (const map of added) {
    assert.ok(map.obst.length >= 25, map.id + ': cover and route geometry is present');
    assert.ok(map.obst.filter(box => box.h <= 2.8).length >= 10, map.id + ': low cover supports tactical peeks');
    assert.deepEqual(Array.from(map.zones, zone => zone.l), ['A', 'B', 'CT'], map.id + ': both mission sites and spawn are marked');
    assert.ok(map.callouts.length >= 6, map.id + ': route landmarks are labeled');
    assert.ok(map.notes.length >= 4, map.id + ': operation brief explains site and rotation choices');
  }
});

test('Offline and phone-host keep identical map definitions and authoritative collision boxes', () => {
  const offlineMaps = mapsFrom(offline);
  const phoneMaps = mapsFrom(phone);
  assert.equal(JSON.stringify(offlineMaps), JSON.stringify(phoneMaps), 'the playable map definitions match byte-for-byte in both WebViews');
  assert.deepEqual(data.maps.map(map => map.id), Array.from(offlineMaps, map => map.id), 'host registry contains every Offline map in the same order');

  for (const map of offlineMaps.filter(item => expectedIds.includes(item.id))) {
    const host = data.maps.find(item => item.id === map.id);
    assert.ok(host, map.id + ': authoritative host map exists');
    const area = map.area, width = area.x1 - area.x0, depth = area.z1 - area.z0;
    const perimeter = [
      [area.x0 - 1, area.x1 + 1, area.z0 - 1, area.z0, 6],
      [area.x0 - 1, area.x1 + 1, area.z1, area.z1 + 1, 6],
      [area.x0 - 1, area.x0, area.z0 - 1, area.z1 + 1, 6],
      [area.x1, area.x1 + 1, area.z0 - 1, area.z1 + 1, 6]
    ];
    const authored = map.obst.map(box => [box.x - box.w / 2, box.x + box.w / 2, box.z - box.d / 2, box.z + box.d / 2, box.h, box.bottom || 0]);
    assert.equal(JSON.stringify(host.boxes), JSON.stringify(perimeter.concat(authored)), map.id + ': host collision geometry matches the rendered Offline layout');
    assert.equal(JSON.stringify(host.spawn), JSON.stringify(map.spawn), map.id + ': host/player spawn parity');
    assert.equal(JSON.stringify(host.botSpawn), JSON.stringify(map.botSpawn), map.id + ': host/bot spawn parity');
  }
});


test('the 19 baseline maps remain definition-identical', () => {
  const baselinePage = execFileSync('git', ['show', '724a95dc5fd5f63fe7d3db24369595ad6d4a6a26:AndroidProject/app/src/main/assets/www/index.html'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const baselineMaps = mapsFrom(baselinePage);
  const currentMaps = mapsFrom(offline);
  assert.equal(baselineMaps.length, 19);
  assert.equal(JSON.stringify(currentMaps.slice(0, baselineMaps.length)), JSON.stringify(baselineMaps), 'pre-existing maps preserve geometry, notes, and mission markers');
});

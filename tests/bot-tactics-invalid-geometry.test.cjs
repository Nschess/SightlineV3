'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const host = require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const Nav = require('../AndroidProject/app/src/main/assets/phone-host/navigation.js');
const Tactics = require('../AndroidProject/app/src/main/assets/phone-host/bot-tactics.js');

test('tactical position search safely rejects malformed positions and broken navigation cells', () => {
  const map = host.DATA.maps.find(m => m.id === 'courtyard') || host.DATA.maps[0];
  const nav = Nav.build(map);
  const node = nav.nodes.find(n => nav.columns[n.k]?.includes(nav.nodes.indexOf(n)));
  assert.ok(node, 'fixture has a valid navigation node');
  const origin = { x: node.x, y: node.y, z: node.z };
  const before = { ...Tactics.searchDiagnostics };

  assert.equal(Tactics.search(nav, { x: NaN, y: node.y, z: node.z }, origin, [], { radius: 1 }), null);
  assert.equal(Tactics.searchDiagnostics.invalidQueries, before.invalidQueries + 1);
  assert.equal(Tactics.searchDiagnostics.last.kind, 'invalidQueries');

  const broken = Nav.build(map);
  const cell = Math.floor(node.z - broken.z0) * broken.w + Math.floor(node.x - broken.x0);
  delete broken.columns[cell];
  assert.equal(Tactics.search(broken, { x: node.x, y: node.y, z: node.z }, origin, [], { radius: 0 }), null);
  assert.equal(Tactics.searchDiagnostics.missingColumns, before.missingColumns + 1);
  assert.equal(Tactics.searchDiagnostics.last.kind, 'missingColumns');
});

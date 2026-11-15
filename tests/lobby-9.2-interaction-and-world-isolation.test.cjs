'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const files = {
  offline: path.join(root, 'AndroidProject/app/src/main/assets/www/index.html'),
  phoneHost: path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html')
};
const pages = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, fs.readFileSync(f, 'utf8')]));
function block(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Missing block: ' + start);
  return source.slice(a, b);
}

test('Offline mode selection has a direct, guarded interaction route for all five modes', () => {
  const page = pages.offline;
  const picker = block(page, 'function renderModePicker()', 'function updatePlayCopy()');
  const click = block(page, "$('#mode-select').addEventListener('click'", "function updatePlayCopy()");
  for (const mode of ['tactical', 'ffa', 'bomb', 'outbreak', 'infection']) {
    assert.ok(picker.includes("['" + mode + "'"), 'Missing rendered mode ' + mode);
    assert.ok(click.includes("'" + mode + "'"), 'Missing selectable mode ' + mode);
  }
  assert.match(click, /R\.mode=nextMode;saveObj\(R_KEY,R\)/);
  assert.match(page, /if \(t\.closest\('\[data-quick-mode\]'\)\) return;/,
    'The old parent capture handler no longer competes with the direct mode selector listener.');
});

test('Phone-host keeps disconnected mode picks local and connected host picks authoritative', () => {
  const page = pages.phoneHost;
  const click = block(page, "$('#mode-select').addEventListener('click'", "function updatePlayCopy()");
  assert.match(click, /if\(isHost&&connected\)/,
    'Only a connected host uses the authoritative LAN rule flow.');
  assert.match(click, /!\['tactical','ffa','bomb','outbreak','infection'\]\.includes\(nextMode\)/,
    'All five modes remain selectable locally before a LAN connection.');
  assert.doesNotMatch(click, /sl82GoRoute\('multiplayer',false\)/,
    'A local mode pick must not unexpectedly force a connection.');
  assert.match(click, /sl82GoRoute\('rules',false\)/,
    'Connected mode selections go to server-authoritative Match Rules.');
  assert.match(page, /routeHostMode=isHost&&connected/,
    'Offline FFA/Bomb buttons are not mislabeled as requiring a LAN connection.');
  assert.match(page, /data-net="mode" data-v="ffa"/);
  assert.match(page, /data-net="mode" data-v="bomb"/);
});

test('Lobby mode selection shows the active map and mode-specific rules with working route buttons', () => {
  for (const page of Object.values(pages)) {
    const picker = block(page, 'function renderModePicker()', 'function updatePlayCopy()');
    assert.match(picker, /data-lobby-route="maps"/);
    assert.match(picker, /data-lobby-route="rules"/);
    assert.match(picker, /esc\(CURMAP\.name\)/, 'The active map name is visible in Play.');
    assert.match(picker, /lobbyRulePreview\(\)/, 'Rule preview refreshes with the selected mode.');
    assert.match(page, /\$\('#mode-brief'\)\.addEventListener\('click'/);
    assert.match(page, /if\(route==='maps'\|\|route==='rules'\)sl82GoRoute\(route,false\)/,
      'Map and Rules controls use the existing Offline/LAN-aware navigation.');
    const setupHandler = block(page, "$('#mode-brief').addEventListener('click'", 'function updatePlayCopy()');
    for (const route of ['maps', 'rules']) {
      let listener = null; const calls = [];
      const brief = { addEventListener: (type, fn) => { listener = fn; }, contains: () => true };
      vm.runInNewContext(setupHandler, { $: () => brief, sl82GoRoute: value => calls.push(value) });
      const button = { getAttribute: () => route };
      listener.call(brief, { target: { closest: () => button }, preventDefault() {}, stopPropagation() {} });
      assert.deepEqual(calls, [route], 'The ' + route + ' summary button navigates to its setup screen.');
    }

    const preview = block(page, 'function lobbyRulePreview(){', 'function renderModePicker()');
    const budget = block(page, 'function outbreakAllyLimit()', 'function infectionAllyRoster(');
    const spawnedAllies = vm.runInNewContext(budget + '\noutbreakSelectedAllies();', { R: { mates: 64 } });
    assert.equal(spawnedAllies, 56, 'The existing shared AI cap still reserves eight slots from a 64-bot request.');
    const output = vm.runInNewContext(preview + '\nlobbyRulePreview();', {
      R: { mode: 'outbreak', mates: 64, zcap: 64 },
      outbreakSelectedAllies: () => spawnedAllies
    });
    assert.equal(output.value, '64 requested → 56 survivor bots');
    assert.equal(output.detail, 'Squad 57 incl. you · up to 8 Hollowed · 64 AI slots shared');
  }
});

test('Mode controls retain real pointer/touch targets and clear disabled/keyboard states', () => {
  for (const page of Object.values(pages)) {
    const css = block(page, '<style id="sightline-lobby-fullscreen-hud">', '</style');
    assert.match(css, /\.mode-choice\{[^}]*pointer-events:auto/);
    assert.match(css, /touch-action:manipulation/);
    assert.match(css, /\.mode-choice:focus-visible\{[^}]*outline/);
    assert.match(css, /\.mode-choice:disabled\{[^}]*cursor:not-allowed/);
    assert.match(page, /id="mode-lock-note" role="status" aria-live="polite" hidden/);
  }
  assert.equal(
    block(pages.offline, '<style id="sightline-lobby-fullscreen-hud">', '</style'),
    block(pages.phoneHost, '<style id="sightline-lobby-fullscreen-hud">', '</style'),
    'Offline and phone-host share identical mode-control presentation.'
  );
});

test('Maps and Match Rules work locally before connection and remain host-authoritative after connection', () => {
  const page = pages.phoneHost;
  const panelStart = page.indexOf('function mpPanel(head)');
  const panelEnd = page.indexOf('var me = mpMe()', panelStart);
  assert.ok(panelStart >= 0 && panelEnd > panelStart, 'Multiplayer panel must keep a pre-connect state.');
  const panel = page.slice(panelStart, panelEnd);
  assert.match(panel, /data-net="connect"/, 'The normal LAN Connect action remains available from the Multiplayer route.');
  assert.match(page, /Offline map setup · choose a local arena for your next match/);
  assert.match(page, /Offline match rules · these options apply to local play/);
  const routes = block(page, 'function sl82RouteItems(group) {', 'function sl82ActiveRoute()');
  assert.match(routes, /connected\?'Host maps':'Offline maps'/);
  assert.match(routes, /connected\?'Host match rules':'Offline match rules'/);
  const goRoute = block(page, 'function sl82GoRoute(route, focus) {', "$('#mn-nav').addEventListener('click'");
  assert.match(goRoute, /if\(lanHost&&mpConnected\(\)\)[\s\S]*?SL82_HOST_SUBROUTE='maps'[\s\S]*?else\{if\(lanHost\)SL82_HOST_SUBROUTE='multiplayer';goTab\('map',focus\)/,
    'Disconnected navigation opens the local map screen; connected host navigation uses validated host maps.');
  assert.match(goRoute, /if\(lanHost&&mpConnected\(\)\)[\s\S]*?SL82_HOST_SUBROUTE='rules'[\s\S]*?else\{if\(lanHost\)SL82_HOST_SUBROUTE='multiplayer';goTab\('rules',focus\)/,
    'Disconnected navigation opens local match rules; connected host navigation uses authoritative rules.');
  assert.match(page, /hostRoute==='maps'[\s\S]*?Connect to load the host map list/,
    'The host-only pre-connect gate remains available only in the Multiplayer host workflow.');
  assert.match(page, /hostRoute==='rules'[\s\S]*?Connect to view and edit match rules/);
  const connectedHostRoutes = block(page, 'function mpHostRouteHtml(head,L,route){', 'function mpPanel(head)');
  assert.match(connectedHostRoutes, /if\(route==='maps'\)[\s\S]*?data-net="map"/,
    'After host connection, Maps displays the host-validated arena picker.');
  assert.match(connectedHostRoutes, /if\(route==='rules'\)[\s\S]*?data-net="mode"/,
    'After host connection, Match Rules displays authoritative server controls.');
  assert.match(page, /if\(isHost\)return mpHostRouteHtml\(h,L,SL82_HOST_SUBROUTE\)/,
    'The host route selection is used when the authoritative lobby is available.');

  function navigate(route, connected) {
    const calls = [];
    const context = {
      document: { querySelector: () => ({ content: 'lan-host' }) },
      mpConnected: () => connected,
      SL82_HOST_SUBROUTE: 'multiplayer',
      goTab: (tab, focus) => calls.push({ tab, focus }),
      setTimeout: () => {},
      $: () => null
    };
    vm.runInNewContext(goRoute + `\nsl82GoRoute(${JSON.stringify(route)}, true);`, context);
    return { calls, hostRoute: context.SL82_HOST_SUBROUTE };
  }
  for (const route of ['maps', 'rules']) {
    const offline = navigate(route, false);
    assert.equal(offline.calls.at(-1).tab, route === 'maps' ? 'map' : 'rules');
    assert.equal(offline.hostRoute, 'multiplayer', 'Local navigation leaves the LAN subroute reset to Multiplayer.');
    const connected = navigate(route, true);
    assert.equal(connected.calls.at(-1).tab, 'net');
    assert.equal(connected.hostRoute, route, 'Connected navigation selects the authoritative host subroute.');
  }
});

test('Lobby preview leaves actual map geometry visible and follows the selected arena', () => {
  for (const page of Object.values(pages)) {
    const preview = block(page, 'var LOBBY_PREVIEW=null', 'function idleCamera(dt)');
    assert.match(page, /buildWorld\(CURMAP\)/, 'The selected playable map is constructed in the production scene.');
    assert.match(page, /function setMap\(id\)[\s\S]*?buildWorld\(m\);\s*rebuildTargets\(\)/, 'Map selection rebuilds the same game-world geometry.');
    assert.match(preview, /sightlineLobbyBackdropMap=CURMAP\.id/);
    assert.match(preview, /key=operator\.id\+'\|'\+CURMAP\.id\+'\|'\+weapon/, 'The operator preview refreshes when the map changes.');
    assert.doesNotMatch(preview, /worldObjs|setLobbyWorldForPreview|createLobbyReadyRoom|LOBBY_READY_ROOM/,
      'Lobby presentation no longer hides the selected map or substitutes a procedural room.');
  }
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const offline = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
const phone = fs.readFileSync(path.join(assets, 'phone-host/index.html'), 'utf8');

function productionFunction(page, name) {
  const match = page.match(new RegExp(`^function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
  assert.ok(match, `production ${name} function exists`);
  return match[0];
}

function createDeployHarness() {
  const events = [];
  const elements = new Map();
  const classEvents = [];
  const element = selector => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        hidden: false, textContent: '', innerHTML: '',
        classList: {
          toggle: (...args) => classEvents.push(['toggle', ...args]),
          add: (...args) => classEvents.push(['add', ...args]),
          remove: (...args) => classEvents.push(['remove', ...args])
        }
      });
    }
    return elements.get(selector);
  };
  const context = {
    document: {
      hidden: false,
      pointerLockElement: null,
      body: { classList: { toggle: (...args) => classEvents.push(['body-toggle', ...args]), remove: (...args) => classEvents.push(['body-remove', ...args]) } },
      addEventListener() {},
      exitPointerLock() {}
    },
    $: element,
    G: { uiSound: true, master: 55, startMoney: 800, roundTime: 120 },
    CFG: { startMoney: 800, roundTime: 120 },
    R: { mode: 'tactical', bots: 3, mates: -1, ztime: 300, zinf: false },
    SOLO_INF: { on: false, chosen: false, playerInfected: false, playerRespawnT: 0, playerDown: false },
    SOLO_BOMB: { state: null },
    MP: { on: false },
    P: { armor: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hp: 0 },
    MAPD: { spawn: { x: 12, z: -19 } },
    ME: { team: 'blue' }, ENEMY: 'red', TEAMS: { red: { name: 'Red' } },
    M: {}, owned: { pistol: true }, cur: 'pistol', curBuys: [], lastBuys: [],
    mel: { t: 0 }, decals: [], scene: { remove() {} },
    el: { hud: { hidden: false }, scope: { hidden: false } },
    state: 'menu', touchMode: false, guns: { pistol: { visible: true } }, T: 0,
    events,
    performance: { now: () => 1000 }, setTimeout() { return 0; }, clearTimeout() {},
    applySelectedFirstPersonAppearance() { events.push(['appearance']); },
    applyRules() { events.push(['applyRules']); }, refreshSpec() {},
    lobbyAudioCue: kind => events.push(['lobbyCue', kind]),
    setLobbyMusicActive: active => events.push(['lobbyMusic', active]),
    resetNades() {}, mpBuildSupplies() {}, offlineAmmoStations: () => [],
    clearNades() {}, fillAmmo() {}, clearUnits() {}, rebuildTargets() {}, prewarmBakes() {},
    showBuy() { events.push(['buy-phase']); element('#ov-buy').hidden = false; },
    exitLock() {}, audio() { return {}; },
    spawnBots: (enemies, allies) => events.push(['spawnBots', enemies, allies]),
    obInit() {}, outbreakSelectedAllies: () => 0,
    hideOverlays() {
      for (const selector of ['#ov-start', '#ov-buy', '#ov-end', '#ov-set']) element(selector).hidden = true;
      events.push(['hideOverlays']);
    },
    updateHud() { events.push(['updateHud']); },
    showMsg: (...args) => events.push(['showMsg', ...args]),
    lockPointer() { events.push(['lockPointer']); },
    startSoloFFA() {}, startSoloBombRound() { return true; },
    bombAttackTeamForSoloRound: () => 0,
    renderBeginnerOperation() {},
    clearMobileAim() {},
    enterTouchSession() {}
  };
  return { context, events, elements, classEvents };
}

function runProductionDeploy(page) {
  const harness = createDeployHarness();
  const source = ['startMatch', 'nextRound', 'beginRound'].map(name => productionFunction(page, name)).join('\n');
  vm.runInNewContext(source, harness.context, { timeout: 1000 });
  harness.context.startMatch();
  return harness;
}

test('production Deploy and Begin Round initialize the selected match in both game pages', () => {
  for (const [label, page] of [['Offline', offline], ['phone-host', phone]]) {
    const { context, events, elements } = runProductionDeploy(page);
    assert.equal(context.M.round, 1, `${label}: Deploy initializes round one`);
    assert.equal(context.state, 'buy', `${label}: Deploy enters the buy phase`);
    assert.equal(context.P.x, 12, `${label}: selected-map spawn X is applied`);
    assert.equal(context.P.z, -19, `${label}: selected-map spawn Z is applied`);
    assert.equal(context.P.alive, true, `${label}: player is initialized alive`);
    assert.equal(context.P.hp, 100, `${label}: player health is initialized`);
    assert.equal(elements.get('#ov-buy').hidden, false, `${label}: buy phase is shown`);
    assert.equal(elements.get('#touch').hidden, true, `${label}: desktop touch overlay remains hidden`);
    assert.ok(events.some(event => event[0] === 'applyRules'), `${label}: configured match rules are applied`);
    assert.ok(events.some(event => event[0] === 'lobbyCue' && event[1] === 'deploy'), `${label}: Deploy cue is routed`);
    assert.match(page, /\$\('#btn-start'\)\.addEventListener\('click', function \(\) \{[\s\S]*?startMatch\(\);/,
      `${label}: Deploy button calls the production startMatch handler`);
    assert.match(page, /\$\('#btn-go'\)\.addEventListener\('click', function \(\) \{ audio\(\); if \(MP\.on\) return; beginRound\(\); \}\);/,
      `${label}: Start Round button calls the production beginRound handler`);

    context.beginRound();
    assert.equal(context.state, 'live', `${label}: Begin Round enters live gameplay`);
    assert.equal(context.el.hud.hidden, false, `${label}: gameplay HUD is shown`);
    assert.equal(elements.get('#ov-buy').hidden, true, `${label}: buy overlay is dismissed`);
    assert.ok(events.some(event => event[0] === 'spawnBots' && event[1] === 3 && event[2] === 0),
      `${label}: selected bot count is used by gameplay`);
    assert.ok(events.some(event => event[0] === 'updateHud'), `${label}: gameplay HUD is refreshed`);
  }
});

test('keyboard and touch movement/cancellation handlers remain wired', () => {
  for (const page of [offline, phone]) {
    assert.match(page, /function held\(a\)/);
    assert.match(page, /function inputEvent\(code, isDown\)/);
    assert.match(page, /document\.addEventListener\('keyup', function \(e\) \{ inputEvent\(e\.code, false\); \}\)/);
    assert.match(page, /P\.x \+= P\.vx \* dt; P\.z \+= P\.vz \* dt;/);
    assert.match(page, /tzm\.addEventListener\('touchstart'/);
    assert.match(page, /tzm\.addEventListener\('touchmove'/);
    assert.match(page, /tzm\.addEventListener\('touchend', endStick\); tzm\.addEventListener\('touchcancel', endStick\)/);
  }
});

test('owner-provided lobby theme is bundled and routed for Offline, phone-host and Android', () => {
  const themeName = 'sightline-theme.mp3';
  const offlineTheme = fs.readFileSync(path.join(assets, 'www', themeName));
  const phoneTheme = fs.readFileSync(path.join(assets, 'phone-host', themeName));
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  assert.deepEqual(offlineTheme, phoneTheme, 'Offline and phone-host use the same supplied theme asset');

  // The source manifest covers source files; the binary theme is pinned by
  // the phone-host bundle manifest and verified byte-identically above.
  const phoneManifest = fs.readFileSync(path.join(assets, 'phone-host/SHA256SUMS'), 'utf8');
  assert.ok(phoneManifest.includes(`${digest(phoneTheme)}  ${themeName}`), 'phone-host theme bytes are hash-pinned');

  const runtimeStart = offline.indexOf('var lobbyMusicElement=');
  const runtimeEnd = offline.indexOf('/* Procedural multi-layer transients', runtimeStart);
  const phoneStart = phone.indexOf('var lobbyMusicElement=');
  const phoneEnd = phone.indexOf('/* Procedural multi-layer transients', phoneStart);
  assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart, 'Offline lobby music runtime exists');
  assert.equal(offline.slice(runtimeStart, runtimeEnd), phone.slice(phoneStart, phoneEnd),
    'Offline and phone-host share the same lobby music lifecycle');
  const runtime = offline.slice(runtimeStart, runtimeEnd);
  assert.match(runtime, /el\.src='sightline-theme\.mp3';el\.preload='auto';el\.loop=true/);
  assert.match(runtime, /function lobbyMusicGesture\(e\)/);
  assert.match(runtime, /addEventListener\('pointerdown',lobbyMusicGesture,true\)/);
  assert.match(runtime, /addEventListener\('touchstart',lobbyMusicGesture/);
  assert.match(runtime, /addEventListener\('keydown',lobbyMusicGesture,true\)/);
  assert.match(offline, /document\.body\.classList\.toggle\('sl-lobby-screen', id === '#ov-start'\); setLobbyMusicActive\(id === '#ov-start'\)/);
  assert.match(offline, /function startMatch\(\) \{[\s\S]*?setLobbyMusicActive\(false\)/);

  const server = fs.readFileSync(path.join(assets, 'phone-host/server.js'), 'utf8');
  assert.match(server, /'\/sightline-theme\.mp3':\['sightline-theme\.mp3','audio\/mpeg'\]/);
  const mainActivity = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'), 'utf8');
  const fileAllowlist = mainActivity.match(/private static final Set<String> FILES = new HashSet<>\(Arrays\.asList\(([\s\S]*?)\)\);/);
  assert.ok(fileAllowlist && fileAllowlist[1].includes('"sightline-theme.mp3"'),
    'Android WebView asset allowlist permits the theme request');
  const nativeHost = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/LanHostService.java'), 'utf8');
  assert.match(nativeHost, /hashes\.containsKey\("sightline-theme\.mp3"\)/);
  assert.doesNotMatch(offline + phone + server, /sightline-main-theme\.wav/,
    'no stale theme URL remains active');
});

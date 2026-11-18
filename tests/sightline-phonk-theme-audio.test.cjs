'use strict';

// Source/asset routing verification only; actual Android playback remains device QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const offlineDir = path.join(assets, 'www');
const phoneDir = path.join(assets, 'phone-host');
const offline = fs.readFileSync(path.join(offlineDir, 'index.html'), 'utf8');
const phone = fs.readFileSync(path.join(phoneDir, 'index.html'), 'utf8');
const themeName = 'sightline-theme.mp3';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function themeRuntime(html) {
  const start = html.indexOf('var lobbyMusicElement=');
  const end = html.indexOf('/* Procedural multi-layer transients', start);
  assert.ok(start >= 0 && end > start, 'active lobby theme runtime has clear bounds');
  return html.slice(start, end);
}

test('owner-provided theme asset is retained byte-identically in both Android game pages', () => {
  const offlineTheme = fs.readFileSync(path.join(offlineDir, themeName));
  const phoneTheme = fs.readFileSync(path.join(phoneDir, themeName));
  assert.deepEqual(offlineTheme, phoneTheme);
  assert.ok(offlineTheme.length > 1_000_000, 'theme asset is not an empty placeholder');

  // CURRENT-SOURCE-SHA256 intentionally covers source files, not large media.
  // Verify media parity directly and validate its distribution hash below.
  const hostManifest = fs.readFileSync(path.join(phoneDir, 'SHA256SUMS'), 'utf8');
  assert.ok(hostManifest.includes(`${digest(phoneTheme)}  ${themeName}`), 'phone-host bundle pins the current theme hash');
});

test('Offline and phone-host route the current theme through the same autoplay-safe lobby lifecycle', () => {
  const runtime = themeRuntime(offline);
  assert.equal(runtime, themeRuntime(phone), 'Offline and phone-host playback logic is in parity');
  assert.match(runtime, /el\.src='sightline-theme\.mp3';el\.preload='auto';el\.loop=true/);
  assert.match(runtime, /function syncLobbyMusic\(fromGesture\)/);
  assert.match(runtime, /function lobbyMusicGesture\(e\)/);
  assert.match(runtime, /addEventListener\('pointerdown',lobbyMusicGesture,true\)/);
  assert.match(runtime, /addEventListener\('touchstart',lobbyMusicGesture/);
  assert.match(runtime, /addEventListener\('keydown',lobbyMusicGesture,true\)/);
  assert.match(runtime, /if\(attempt&&typeof attempt\.then==='function'\)[\s\S]*\.catch\(function\(\)/,
    'autoplay rejection is handled without pretending playback started');
  assert.match(runtime, /function lobbyMusicLevel\(\)[\s\S]*G\.musicVol/);
  assert.match(offline, /document\.body\.classList\.toggle\('sl-lobby-screen', id === '#ov-start'\); setLobbyMusicActive\(id === '#ov-start'\)/);
  assert.match(offline, /function startMatch\(\) \{[\s\S]*?setLobbyMusicActive\(false\)/);
  assert.doesNotMatch(offline + phone, /sightline-main-theme\.wav|Beyond the Sightline|BREACH VECTOR/,
    'no obsolete theme reference is active');
  new vm.Script(runtime, { filename: 'lobby-theme-runtime.js' });
});

test('Android and phone-host request routing permit the current MP3 asset', () => {
  const server = fs.readFileSync(path.join(phoneDir, 'server.js'), 'utf8');
  assert.match(server, /'\/sightline-theme\.mp3':\['sightline-theme\.mp3','audio\/mpeg'\]/);
  const activity = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java'), 'utf8');
  const allowlist = activity.match(/private static final Set<String> FILES = new HashSet<>\(Arrays\.asList\(([\s\S]*?)\)\);/);
  assert.ok(allowlist && allowlist[1].includes('"sightline-theme.mp3"'),
    'Android WebView allowlist permits the local audio request');
  const service = fs.readFileSync(path.join(root, 'AndroidProject/app/src/main/java/com/sightline/v3/LanHostService.java'), 'utf8');
  assert.match(service, /hashes\.containsKey\("sightline-theme\.mp3"\)/);
});

test('Audio settings persist mute and control the mixer and menu music in both clients', () => {
  for (const page of [offline, phone]) {
    const fn = name => {
      const match = page.match(new RegExp('^function ' + name + '\\([^\\r\\n]*\\)[ \\t]*\\{[\\s\\S]*?^\\}', 'm'));
      assert.ok(match, name + ' is defined');
      return match[0];
    };
    const button = { setAttribute(name, value) { this[name] = value; } };
    let saved, ambienceUpdates = 0, musicUpdates = 0;
    const gain = () => ({ gain: { value: 0 } });
    const settings = { master: 50, musicVol: 30, sfxVol: 80, uiVol: 60, muted: false };
    const context = {
      G: settings, AC: {}, soundOn: true, master: gain(), busFx: gain(), busUi: gain(), slAmb: null,
      touchMode: true, $: () => button, objOf: () => settings, persist: () => { saved = { ...settings }; },
      syncLobbyMusic() { musicUpdates++; }, slAmbTick() { ambienceUpdates++; }
    };
    vm.runInNewContext([fn('applyAudio'),fn('toggleSound'),fn('setVal'),fn('lobbyMusicLevel')].join('\n'),context);
    context.applyAudio();
    assert.equal(context.master.gain.value, .5);
    assert.equal(context.lobbyMusicLevel(), .15);
    assert.equal(button.hidden, true);
    context.toggleSound();
    assert.equal(saved.muted, true);
    assert.equal(context.soundOn, false);
    assert.equal(context.master.gain.value, 0);
    context.setVal('G', 'musicVol', 60);
    assert.equal(saved.musicVol, 60);
    assert.equal(context.lobbyMusicLevel(), .3);
    context.toggleSound();
    assert.equal(saved.muted, false);
    assert.equal(context.master.gain.value, .5);
    assert.equal(context.busFx.gain.value, .8);
    assert.equal(context.busUi.gain.value, .6);
    assert.equal(ambienceUpdates, 4);
    assert.equal(musicUpdates, 4);
    assert.match(page, /k: 'musicVol', l: 'Music volume'/);
  }
});

test('Mobile Play exposes its navigation after removing the redundant rail shortcuts', () => {
  for (const page of [offline, phone]) {
    assert.doesNotMatch(page, /id="mn-sound"/);
    assert.match(page, /if \(!touchMode && !lan\)/);
    assert.match(page, /\['multiplayer','Multiplayer'\]/);
    assert.match(page, /html\.touch-device[^\r\n]+data-sl-route=play[^\r\n]+#mn-context\s*\{ display:block!important/);
    for (const [, script] of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script);
  }
});

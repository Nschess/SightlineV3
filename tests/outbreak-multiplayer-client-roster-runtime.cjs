'use strict';
// Exercises the real phone-host browser client with the server's ordered
// lobby/start/phase/spawn/snapshot message sequence; no LAN socket is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const gameRoot = path.join(root, 'AndroidProject/app/src/main/assets/phone-host');
const htmlPath = path.join(gameRoot, 'index.html');
const source = fs.readFileSync(htmlPath, 'utf8');
const marker = Array.from(source.matchAll(/requestAnimationFrame\(frame\);\r?\n\}\)\(\);\r?\n<\/script>/g)).at(-1);
assert.ok(marker, 'client instrumentation marker exists');
const qa = `window.__mpRosterQa={mpMsg:mpMsg,mpBegin:mpBegin,mpPhase:mpPhase,mpSpawn:mpSpawn,mpSnapshot:mpSnapshot,mpUpdate:mpUpdate,MP:MP,goTab:goTab,get mates(){return mates},get bots(){return bots},get scene(){return scene},updateHud:updateHud};`;
const instrumented = source.slice(0, marker.index) + 'requestAnimationFrame(frame);' + qa + '\n})();\n</script>' + source.slice(marker.index + marker[0].length);
const testHtmlPath = path.join(gameRoot, '.outbreak-mp-client-' + process.pid + '.html');
const errors = [];

async function main() {
  const executablePath = process.env.P18_CHROMIUM || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
  fs.writeFileSync(testHtmlPath, instrumented.replace('<head>', '<head><base href="' + pathToFileURL(gameRoot + path.sep).href + '">'));
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--allow-file-access-from-files', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => { try { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); } catch (_) {} });
    await page.goto(pathToFileURL(testHtmlPath).href + '?debug', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__mpRosterQa, null, { timeout: 30000 });
    const uiConfig = await page.evaluate(() => {
      const q = window.__mpRosterQa, sent = [];
      q.MP.sock = { readyState: 1, send: raw => sent.push(JSON.parse(raw)) };
      q.mpMsg({ t: 'welcome', id: 1, host: true });
      q.mpMsg({ t: 'lobby', phase: 'lobby', mode: 'outbreak', auto: false, map: 'courtyard', rounds: 5, time: 100, kills: 30, cash: 800, max: 10, total: 96, maps: [], teams: [], bots: { mode: 'add', coop: 0, skill: 'regular' }, players: [{ id: 1, name: 'Host', host: true, team: 0, op: 0, bot: 0 }] });
      q.goTab('net');
      const input = document.querySelector('.mn-main [data-bot-count="coop"]');
      if (!input) return { inputFound: false, sent };
      input.value = '14'; input.dispatchEvent(new Event('change', { bubbles: true }));
      return { inputFound: true, sent };
    });
    assert.equal(uiConfig.inputFound, true, 'Outbreak lobby exposes the actual co-op bot count control');
    assert.ok(uiConfig.sent.some(m => m.t === 'cfg' && m.bots && m.bots.coop === 14), 'changing the actual lobby count sends the expected cfg message');
    await page.evaluate(async () => {
      const q = window.__mpRosterQa, players = [{ id: 1, name: 'Host', host: true, team: 0, op: 0, bot: 0 }];
      for (let id = 2; id <= 15; id++) players.push({ id, name: 'Bot ' + id, host: false, team: 0, op: id % 17, bot: 1, skill: 'regular' });
      q.mpMsg({ t: 'welcome', id: 1, host: true });
      q.mpMsg({ t: 'lobby', phase: 'lobby', mode: 'outbreak', auto: false, map: 'courtyard', rounds: 5, time: 100, kills: 30, cash: 800, max: 10, total: 96, maps: [], teams: [], bots: { mode: 'add', coop: 14, skill: 'regular' }, players });
      q.mpMsg({ t: 'start', mode: 'outbreak', map: 'courtyard', stations: [], rounds: 5, time: 100, kills: 30, weapons: ['pistol'], cash: 800, teams: [] });
      q.mpMsg({ t: 'sp', x: 0, y: 0, z: 0, yaw: 0, hp: 100, armor: 0, ep: 1, owned: ['pistol'], cur: 'pistol', money: 800 });
      q.mpMsg({ t: 'ph', ph: 'buy', ms: 5000, round: 1, score: [0, 0], rounds: 5, time: 100, kills: 30 });
      q.mpMsg({ t: 'sc', score: [0, 0], round: 1, kills: 30, players: players.map(p => ({ ...p, alive: true, k: 0, d: 0, hs: 0, money: 800, ping: 0 })) });
      const a = players.filter(p => p.bot).map((p, i) => [p.id, 4 + i * 1.5, 0, -5 - (i % 4) * 2, 0, 0, 0, 0, 0, 1, 0]);
      q.mpMsg({ t: 's', n: 1, a });
      q.mpMsg({ t: 'ph', ph: 'live', ms: 120000, round: 1, score: [0, 0], rounds: 5, time: 100, kills: 30 });
      q.updateHud();
      // Let the actual interpolation path attach spawned puppets to the scene.
      for (let i = 0; i < 4; i++) { q.mpUpdate(0.05); await new Promise(r => requestAnimationFrame(r)); }
    });
    const result = await page.evaluate(() => {
      const q = window.__mpRosterQa;
      return { mode: q.MP.mode, lobbyBotCount: q.MP.lobby.players.filter(p => p.bot).length, puppetCount: Object.keys(q.MP.puppets).length, liveAllies: q.mates.filter(p => p.alive).length, visibleAllies: q.mates.filter(p => p.alive && p.g.visible && p.g.parent === q.scene).length, hudCount: document.querySelector('#sc-bot').textContent, hudLabel: document.querySelector('#sc-bot-label').textContent, state: q.MP.on ? 'multiplayer' : 'offline' };
    });
    assert.equal(result.mode, 'outbreak');
    assert.equal(result.lobbyBotCount, 14);
    assert.equal(result.puppetCount, 14, 'all configured bot roster entries create client puppets');
    assert.equal(result.liveAllies, 14, 'snapshot alive state reaches all bot puppets');
    assert.equal(result.visibleAllies, 14, 'alive bot puppets attach to the actual Three.js scene');
    assert.equal(result.hudCount, '14', 'Outbreak HUD displays current living survivor bots');
    assert.equal(result.hudLabel, 'ALLIES');
    assert.deepEqual(errors, [], 'no browser-side runtime errors');
    console.log(JSON.stringify({ pass: true, test: 'actual client roster-to-scene message path', renderer: await page.evaluate(() => window.__mpRosterQa.scene && window.__mpRosterQa.scene.children.length), result, errors }, null, 2));
  } finally { await browser.close(); fs.rmSync(testHtmlPath, { force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

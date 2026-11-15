'use strict';

// Actual Sightline pages in Codex-managed headless Chromium/SwiftShader.
// This script never attaches to a user's browser and binds test servers only
// to 127.0.0.1 on ephemeral ports.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createOfflineServer } = require('../tools/offline-static-server.cjs');
const playwrightPath = process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const chromiumPath = process.env.SIGHTLINE_CHROMIUM_EXECUTABLE || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const { chromium } = require(playwrightPath);
const root = path.resolve(__dirname, '..');
const outputs = path.join(root, 'acceptance', `expansion-8.2-ui-after-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(outputs, { recursive: false });

const routes = [
  { id: 'offline', root: path.join(root, 'AndroidProject/app/src/main/assets/www') },
  { id: 'phone-host', root: path.join(root, 'AndroidProject/app/src/main/assets/phone-host') }
];
const servers = [];
let hostProcess = null;
const errors = [];
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server.address().port); });
  });
}
function close(server) { return new Promise(resolve => server.close(() => resolve())); }
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
  });
}
function waitHost(url, proc) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = async () => {
      if (proc.exitCode != null) return reject(new Error(`LAN host exited before readiness: ${proc.exitCode}`));
      try { const response = await fetch(new URL('/status', url), { signal: AbortSignal.timeout(1000) }); if (response.ok) return resolve(await response.json()); } catch (_) {}
      if (Date.now() - start > 15000) return reject(new Error('LAN host did not expose /status within 15 seconds'));
      setTimeout(poll, 100);
    };
    poll();
  });
}
async function inspect(page) {
  return page.evaluate(() => {
    const rect = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right) }; };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, clientHeight: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight },
      shell: rect(document.querySelector('.mn')),
      main: rect(document.querySelector('.mn-main')),
      mainOverflowX: document.querySelector('.mn-main') ? document.querySelector('.mn-main').scrollWidth - document.querySelector('.mn-main').clientWidth : null,
      nav: Array.from(document.querySelectorAll('#mn-nav [data-shell-group]')).map(x => x.textContent.trim().replace(/\s+/g, ' ')),
      subnav: Array.from(document.querySelectorAll('#mn-subnav [data-shell-route]')).map(x => x.textContent.trim().replace(/\s+/g, ' ')),
      buildId: document.querySelector('#mn-build-id')?.textContent.trim() || null,
      routeNote: document.querySelector('#mn-route-note')?.textContent.trim() || null,
      modeChoices: Array.from(document.querySelectorAll('#mode-select .mode-choice')).map(x => ({ label: x.querySelector('.mode-name')?.textContent.trim(), disabled: x.disabled, pressed: x.getAttribute('aria-pressed') })),
      modeGrid: rect(document.querySelector('.mode-grid')),
      lobbyTitle: document.querySelector('#ov-title')?.textContent.trim() || null,
      bombMarkers: document.querySelectorAll('#map-preview [data-site]').length || document.querySelectorAll('#map-preview .bomb-site').length
    };
  });
}

(async () => {
  let browser;
  try {
    const offlineRoute = routes.find(route => route.id === 'offline');
    const offlineServer = createOfflineServer(offlineRoute.root); servers.push(offlineServer);
    offlineRoute.port = await listen(offlineServer); offlineRoute.url = `http://127.0.0.1:${offlineRoute.port}/`;
    const hostRoute = routes.find(route => route.id === 'phone-host'), phoneRoot = hostRoute.root;
    hostRoute.port = await freePort(); hostRoute.url = `http://127.0.0.1:${hostRoute.port}/`;
    hostProcess = spawn(process.execPath, [path.join(phoneRoot, 'server.js'), '--transport', 'dev', '--bind', '127.0.0.1', '--port', String(hostRoute.port), '--max', '10', '--bots', '0', '--tick-ms', '20'], { cwd: phoneRoot, stdio: 'ignore' });
    await waitHost(hostRoute.url, hostProcess);
    browser = await chromium.launch({ headless: true, executablePath: chromiumPath, args: ['--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const records = [];
    const sizes = [
      { name: 'desktop-1600x900', width: 1600, height: 900 },
      { name: 'desktop-1366x768', width: 1366, height: 768 },
      { name: 'landscape-844x390', width: 844, height: 390 },
      { name: 'portrait-390x844', width: 390, height: 844 }
    ];
    for (const route of routes) for (const size of sizes) {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
      page.on('pageerror', error => errors.push(`${route.id}/${size.name}: ${error.message}`));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(`${route.id}/${size.name}: ${msg.text()}`); });
      page.on('response', response => { if (response.status() >= 400) errors.push(`${route.id}/${size.name}: HTTP ${response.status()} ${response.url()}`); });
      await page.goto(route.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await page.waitForTimeout(500);
      const home = await inspect(page);
      const homePng = path.join(outputs, `${route.id}-${size.name}-play.png`);
      await page.screenshot({ path: homePng });
      records.push({ route: route.id, size: size.name, view: 'play', url: route.url, screenshot: path.basename(homePng), ...home });
      const mp = page.locator('#mn-subnav [data-shell-route="multiplayer"]');
      if (await mp.count()) {
        await mp.click(); await page.waitForTimeout(250);
        if (route.id === 'phone-host') {
          const bombMode = page.locator('#pn-dyn [data-net="mode"][data-v="bomb"]');
          if (await bombMode.count()) await bombMode.click();
          await page.waitForTimeout(250);
        }
        const lobby = await inspect(page);
        const mpPng = path.join(outputs, `${route.id}-${size.name}-multiplayer.png`);
        await page.screenshot({ path: mpPng });
        records.push({ route: route.id, size: size.name, view: 'multiplayer', url: route.url, screenshot: path.basename(mpPng), ...lobby });
      }
      if (route.id === 'offline' && size.name === 'desktop-1600x900') {
        await page.locator('#mn-subnav [data-shell-route="offline"]').click(); await page.waitForTimeout(150);
        const ffa = page.locator('#mode-select [data-quick-mode="ffa"]');
        await ffa.click(); await page.waitForTimeout(80);
        const ffaSelected = await ffa.getAttribute('aria-pressed');
        const bomb = page.locator('#mode-select [data-quick-mode="bomb"]');
        await bomb.click(); await page.waitForTimeout(180);
        const bombSelected = await bomb.getAttribute('aria-pressed');
        const bombSelection = await inspect(page);
        const selectionPng = path.join(outputs, 'offline-bomb-selected.png');
        await page.screenshot({ path: selectionPng });
        await page.locator('#mn-subnav [data-shell-route="maps"]').click(); await page.waitForTimeout(180);
        const mapNote = await page.locator('#map .map-mode-note').textContent();
        const mapView = await inspect(page);
        records.push({ route: route.id, size: size.name, view: 'mode-selection-actions', screenshot:path.basename(selectionPng), ffaSelected, bombSelected, bombMapNote:mapNote, bombSelection, mapView });
      }
      await page.close();
    }
    const result = {
      status: errors.length ? 'FAIL' : 'CAPTURED',
      renderer: 'Sightline V3 source in Codex-managed headless Chromium with SwiftShader WebGL',
      source: {
        offlinePageSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(routes[0].root, 'index.html'))).digest('hex'),
        phoneHostPageSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(routes[1].root, 'index.html'))).digest('hex')
      },
      records, errors,
      limitations: ['Software WebGL only, not a hardware GPU or Android performance test.', 'The phone-host UI is served by the real local host process, but match start and second-client gameplay are covered separately.']
    };
    fs.writeFileSync(path.join(outputs, 'runtime-report.json'), JSON.stringify(result, null, 2));
    process.stdout.write(JSON.stringify({ status: result.status, output: outputs, captures: records.length, errors: errors.length, offlineModes: records.find(x => x.route === 'offline' && x.size === 'desktop-1600x900' && x.view === 'play')?.modeChoices.map(x => x.label), phoneHostModes: records.find(x => x.route === 'phone-host' && x.size === 'desktop-1600x900' && x.view === 'play')?.modeChoices.map(x => x.label), offlineNavigation: records.find(x => x.route === 'offline' && x.size === 'desktop-1600x900' && x.view === 'play')?.nav }, null, 2) + '\n');
    if (errors.length) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (hostProcess && hostProcess.exitCode == null) { hostProcess.kill(); await new Promise(resolve => hostProcess.once('exit', resolve)); }
    await Promise.all(servers.map(close));
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });

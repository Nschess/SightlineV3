'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const executablePath = process.env.SIGHTLINE_CHROMIUM_EXECUTABLE || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'acceptance', 'expansion-8.3-file-runtime');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [], failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText || 'failed' }));
  try {
    await page.goto(pathToFileURL(path.join(root, 'AndroidProject/app/src/main/assets/www/index.html')).href + '?debug', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => !!window.__sl && window.__sl.state !== undefined, null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const runtime = await page.evaluate(() => ({ protocol: location.protocol, title: document.title, mode: window.__sl.rules.mode, state: window.__sl.state, canvasCount: document.querySelectorAll('canvas').length, canvasSize: Array.from(document.querySelectorAll('canvas')).map(c => [c.width,c.height]), errors: performance.getEntriesByType('resource').filter(r => r.responseStatus >= 400).map(r => r.name) }));
    await page.screenshot({ path: path.join(output, 'offline-file-render.png'), fullPage: false });
    const report = { status: runtime.protocol === 'file:' && runtime.canvasCount > 0 && errors.length === 0 && failed.length === 0 ? 'PASS' : 'FAIL', runtime, pageErrors: errors, failedRequests: failed, limitation: 'Static-file WebGL load only; no network host, mobile touch hardware, or human gameplay acceptance.' };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, output, runtime, pageErrors: errors, failedRequests: failed }, null, 2));
    if (report.status !== 'PASS') process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exit(1); });

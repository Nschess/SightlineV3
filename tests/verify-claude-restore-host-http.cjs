const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'evidence', 'claude-restore', 'host-http-loaded.png');
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const requests = [], failures = [], pageErrors = [];
  page.on('response', response => requests.push({ path: new URL(response.url()).pathname, status: response.status() }));
  page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    const response = await page.goto('http://127.0.0.1:49381/', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1000);
    const runtime = await page.evaluate(() => ({
      status: document.readyState,
      threeRevision: window.THREE?.REVISION || null,
      claudeCharacterVersion: window.SightlineClaudeCharacterV128?.version || null,
      canvasCount: document.querySelectorAll('canvas').length,
      webgl: Array.from(document.querySelectorAll('canvas')).map(c => !!(c.getContext('webgl2') || c.getContext('webgl'))),
      buttons: Array.from(document.querySelectorAll('button')).map(b => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 30)
    }));
    await page.screenshot({ path: out, fullPage: false });
    const builderResponses = requests.filter(r => r.path === '/character-realism-v12.js');
    const result = {
      pass: response?.ok() && runtime.claudeCharacterVersion === '12.8' && builderResponses.some(r => r.status === 200) && failures.length === 0 && pageErrors.length === 0,
      httpStatus: response?.status(), runtime, builderResponses, failedRequests: failures, pageErrors, screenshot: out
    };
    fs.writeFileSync(path.join(root, 'evidence', 'claude-restore', 'host-http-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.pass ? 0 : 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

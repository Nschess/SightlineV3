'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const baseline = path.join(root, 'rollback/lobby-9.1-pre-change-2026-11-08/offline-index.html');
const baselineRunPath = path.join(root, 'AndroidProject/app/src/main/assets/www/lobby-9.0-baseline-benchmark.html');
const candidate = path.join(root, 'AndroidProject/app/src/main/assets/www/index.html');
const out = path.join(root, 'acceptance/lobby-9.1-actual-browser/performance-comparison.json');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const executablePath = process.env.SIGHTLINE_CHROMIUM_EXECUTABLE || '';

async function sample(browser, label, file, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href + '?debug', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => !!window.__sl && !!window.__sl.characterQA, null, { timeout: 30000 });
  await page.waitForTimeout(1800);
  const frameStats = await page.evaluate(async () => new Promise(resolve => {
    const values = [];
    let previous = 0;
    const start = performance.now();
    function frame(now) {
      if (previous) values.push(now - previous);
      previous = now;
      if (now - start < 3000) return requestAnimationFrame(frame);
      const sorted = values.slice().sort((a, b) => a - b);
      const q = p => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))].toFixed(2) : null;
      const renderer = window.__sl.renderer;
      const gl = document.querySelector('#gl').getContext('webgl2') || document.querySelector('#gl').getContext('webgl');
      let rendererName = null;
      try { const extension = gl.getExtension('WEBGL_debug_renderer_info'); rendererName = gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER); } catch (_) {}
      resolve({ sampleCount: values.length, frameIntervalMs: { p50: q(.5), p95: q(.95), p99: q(.99), max: sorted.length ? +sorted.at(-1).toFixed(2) : null }, rendererName, three: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }, jsHeapBytes: performance.memory ? performance.memory.usedJSHeapSize : null });
    }
    requestAnimationFrame(frame);
  }));
  await context.close();
  return { label, viewport, sourceSha256: hash(file), ...frameStats };
}

async function run() {
  if (!fs.existsSync(baseline)) throw new Error(`Verified Lobby 9.0 rollback page missing: ${baseline}`);
  if (fs.existsSync(baselineRunPath)) throw new Error(`Refusing to overwrite temporary baseline path: ${baselineRunPath}`);
  fs.copyFileSync(baseline, baselineRunPath);
  const options = { headless: true, args: ['--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (executablePath) options.executablePath = executablePath;
  const browser = await chromium.launch(options);
  try {
    const runs = [];
    for (const viewport of [{ width: 1600, height: 900 }, { width: 960, height: 540 }]) {
      const label = `${viewport.width}x${viewport.height}`;
      runs.push(await sample(browser, `Lobby 9.0 baseline ${label}`, baselineRunPath, viewport));
      runs.push(await sample(browser, `Lobby 9.1 candidate ${label}`, candidate, viewport));
    }
    const report = { schema: 'sightline-lobby-9.1-swiftshader-comparison-v1', generatedAt: new Date().toISOString(), runtime: 'Isolated Chromium with SwiftShader software WebGL; file:// production HTML, one warmed 3-second sample per candidate and viewport.', verifiedBaseline: { package: 'Lobby 9.0', offlinePageSha256: hash(baseline), phoneHostPageSha256: hash(path.join(root, 'rollback/lobby-9.1-pre-change-2026-11-08/phone-host-index.html')) }, candidate: { package: 'Lobby 9.1 experimental', offlinePageSha256: hash(candidate), phoneHostPageSha256: hash(path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html')) }, runs, limitations: ['SwiftShader timings measure this isolated software-renderer environment and do not represent Windows GPU, Android GPU, or physical-device performance.', 'Three.js geometry, texture, draw-call, and triangle counters are collected from the active production renderer; CPU and power measurements are not available in this harness.'] };
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'PASS', output: out, runs }, null, 2));
  } finally {
    await browser.close();
    if (fs.existsSync(baselineRunPath)) fs.unlinkSync(baselineRunPath);
  }
}
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });

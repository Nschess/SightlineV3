'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
let playwrightModule = process.env.SIGHTLINE_PLAYWRIGHT_MODULE;
if (!playwrightModule) {
  try { playwrightModule = require.resolve('playwright'); }
  catch (_) { playwrightModule = 'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'; }
}
const { chromium } = require(playwrightModule);
const executablePath = process.env.SIGHTLINE_CHROMIUM_EXECUTABLE || '';
const root = path.resolve(__dirname, '..');
const offline = path.join(root, 'AndroidProject/app/src/main/assets/www/index.html');
const host = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html');
const out = path.join(root, 'acceptance/lobby-9-actual-browser');
fs.mkdirSync(out, { recursive: true });
const errors = [];
const results = [];
function record(name, detail) { results.push({ name, status: 'PASS', detail: detail || '' }); }
async function shot(page, name) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, name), fullPage: false, animations: 'disabled' }); }
async function openPage(browser, file, viewport, mobile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: !!mobile, hasTouch: !!mobile });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push({ page: path.basename(file), message: String(e && e.message || e) }));
  await page.goto(pathToFileURL(file).href + '?debug', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForFunction(() => !!window.__sl && !!window.__sl.characterQA && !!document.querySelector('#ov-start'), null, { timeout: 30000 });
  await page.waitForTimeout(1800);
  return { context, page };
}
async function run() {
  const launchOptions = { headless: true, args: ['--no-first-run', '--disable-background-networking', '--disable-extensions', '--disable-sync', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (executablePath) launchOptions.executablePath = executablePath;
  const browser = await chromium.launch(launchOptions);
  try {
    const { context, page } = await openPage(browser, offline, { width: 1600, height: 900 }, false);
    const preview = await page.evaluate(() => {
      const node = window.__sl.scene.children.find(x => x.userData && x.userData.sightlineLobbyPreview);
      let meshes=0;
      if(node)node.traverse(o=>{if(o.isMesh)meshes++;});
      const last=node&&node.children[node.children.length-1];
      const weaponMeshVertices=last&&last.isMesh&&last.geometry&&last.geometry.attributes.position?last.geometry.attributes.position.count:0;
      return { state: window.__sl.state, menuVisible: !document.querySelector('#ov-start').hidden, preview: !!node, meshes, weaponMeshVertices, canvas: (()=>{const r=document.querySelector('#gl').getBoundingClientRect();return {width:r.width,height:r.height};})() };
    });
    assert.equal(preview.state, 'idle', 'Offline entrypoint should start in the lobby');
    assert.equal(preview.menuVisible, true, 'Offline lobby should be visible');
    assert.equal(preview.preview, true, 'Actual production 3D operator preview should be present in the game scene');
    assert.ok(preview.meshes > 4, 'Operator preview should contain actual mesh geometry');
    assert.ok(preview.weaponMeshVertices > 4, 'Operator showcase should include its actual built weapon geometry');
    assert.ok(preview.canvas.width >= 1500 && preview.canvas.height >= 800, 'Lobby should fill the desktop viewport');
    await shot(page, 'offline-play-1600x900.png');
    record('Offline full-screen Play and 3D operator', preview);

    const groups = await page.locator('#mn-nav [data-shell-group]').allTextContents();
    assert.equal(groups.length, 4, 'Primary navigation must have four groups');
    for (const route of ['play', 'loadout', 'operators', 'settings']) assert.ok(groups.some(x => x.toLowerCase().includes(route)), 'Missing primary route ' + route);
    await page.locator('#mn-nav [data-shell-group="loadout"]').click();
    assert.equal(await page.locator('#pn-dyn').isVisible(), true, 'Loadout panel should open');
    assert.equal(await page.locator('#pn-dyn .pn-h h2').innerText(), 'LOADOUT', 'Primary Loadout must not render as Settings');
    assert.equal(await page.locator('#pn-dyn .subtabs [data-sub]').count(), 0, 'Loadout must not duplicate the Settings categories');
    assert.equal(await page.locator('#pn-dyn [data-act=page-reset]').count(), 0, 'Loadout must not expose unrelated settings reset actions');
    assert.equal(await page.getByRole('button', { name: 'OPEN LOADOUT' }).count(), 1, 'Loadout should provide one live customization entry');
    await shot(page, 'offline-loadout-1600x900.png');
    await page.getByRole('button', { name: 'OPEN LOADOUT' }).click();
    assert.equal(await page.locator('.finish-panel').isVisible(), true, 'Loadout action should open the actual existing finish/optic/character customizer');
    record('Loadout route and existing customizer action');
    await page.keyboard.press('Escape');

    await page.locator('#mn-nav [data-shell-group="operators"]').click();
    const target = page.locator('#pn-dyn .op[data-op]:not([aria-pressed="true"])').first();
    const targetId = await target.getAttribute('data-op');
    await target.click();
    await page.waitForFunction(id => { const n=window.__sl.scene.children.find(x=>x.userData&&x.userData.sightlineLobbyPreview); return !!n&&n.userData.sightlineLobbyOperator===id; }, targetId);
    assert.equal(await page.locator('#op-det h3').count(), 1, 'Selected operator details should be shown');
    await shot(page, 'offline-operators-1600x900.png');
    record('Operator roster selection updates the actual 3D showcase', { selectedId: targetId });

    await page.locator('#mn-nav [data-shell-group="settings"]').click();
    const settingsRoutes=(await page.locator('#mn-subnav [data-shell-route]').allTextContents()).join(' ').toLowerCase();
    assert.ok(settingsRoutes.includes('preferences') && settingsRoutes.includes('key bindings') && settingsRoutes.includes('records') && settingsRoutes.includes('field guide'), 'Secondary settings navigation preserves preferences, key bindings, records and Field Guide');
    assert.ok(!settingsRoutes.includes('crosshair') && !settingsRoutes.includes('mobile hud'), 'Secondary navigation must not duplicate settings category tabs');
    await shot(page, 'offline-settings-1600x900.png');
    assert.equal(await page.locator('#pn-dyn .subtabs [data-sub]').count(), 5, 'Settings should have five consolidated categories');
    assert.deepEqual(await page.locator('#pn-dyn .subtabs [data-sub]').allTextContents(), ['Graphics','Audio','Controls','Gameplay','Network'], 'Settings category names must match the approved information hierarchy');
    await page.locator('#pn-dyn .subtabs [data-sub="controls"]').click();
    assert.ok((await page.locator('#pn-dyn').innerText()).toLowerCase().includes('edit keyboard bindings'), 'Controls must group crosshair, HUD, touch and keyboard controls');
    assert.equal(await page.locator('#pn-dyn [data-mobile-hud-opacity]').count(), 1, 'Mobile HUD opacity remains available in Controls');
    await page.locator('#pn-dyn [data-mobile-hud-opacity]').evaluate(el => { el.value='75'; el.dispatchEvent(new Event('input',{bubbles:true})); });
    assert.equal(await page.locator('#pn-dyn [data-mobile-hud-opacity]').inputValue(), '75', 'Mobile HUD opacity control should update immediately');
    await page.locator('#pn-dyn .subtabs [data-sub="audio"]').click();
    assert.ok((await page.locator('#pn-dyn').innerText()).toLowerCase().includes('volume'), 'Audio settings should expose real volume controls');
    await page.locator('#pn-dyn .subtabs [data-sub="video"]').click();
    await page.locator('#pn-dyn [data-act="p1157-clear"]').click();
    const saved = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => /sightline|settings|video|graphics/i.test(k)).map(([k,v]) => [k,v]));
    assert.ok(saved.length > 0, 'Settings action should persist locally');
    await shot(page, 'offline-settings-after-interaction-1600x900.png');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__sl && !!window.__sl.characterQA, null, { timeout: 30000 });
    const afterReload = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => /sightline|settings|video|graphics/i.test(k)).map(([k,v]) => [k,v]));
    assert.deepEqual(afterReload, saved, 'Settings must survive refresh');
    await page.locator('#mn-nav [data-shell-group="settings"]').click();
    await page.locator('#pn-dyn .subtabs [data-sub="controls"]').click();
    assert.equal(await page.locator('#pn-dyn [data-mobile-hud-opacity]').inputValue(), '75', 'Touch control preference should restore after refresh');
    record('Settings controls and local persistence', { storedKeys: saved.map(x=>x[0]), restoredOpacity: '75%' });

    await page.locator('#mn-nav [data-shell-group="play"]').click();
    await page.locator('#mn-subnav [data-shell-route="maps"]').click();
    await page.locator('#pn-dyn [data-map="dune"]').click();
    assert.ok((await page.locator('#mn-mapsvg').innerHTML()).includes('>A<'), 'Map plan should show authored A site markers');
    assert.ok((await page.locator('#mn-mapsvg').innerHTML()).includes('>B<'), 'Map plan should show authored B site markers');
    await shot(page, 'offline-map-selection-1600x900.png');
    await page.locator('#mn-nav [data-shell-group="play"]').click();
    const mapName = await page.locator('#play-map-name').textContent();
    for (const mode of ['tactical','ffa','bomb','outbreak','infection']) { await page.locator('#mode-select [data-quick-mode="'+mode+'"]').click(); assert.equal(await page.locator('#mode-select [data-quick-mode="'+mode+'"]').getAttribute('aria-pressed'), 'true', mode+' mode should be selectable from Play'); }
    assert.match(mapName, /Dune Cross/i, 'Play deployment plan should refresh after a map change');
    await page.locator('#mode-select [data-quick-mode="bomb"]').click();
    assert.match(await page.locator('#mode-brief').innerText(), /A\/B SITES/i, 'Bomb mode should identify A/B objectives in the play brief');
    await shot(page, 'offline-bomb-deployment-1600x900.png');
    record('Map selection, authored plan, and Bomb A/B setup', { map: mapName });

    await page.locator('#mode-select [data-quick-mode="tactical"]').click();
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__sl.state === 'buy', null, { timeout: 15000 });
    assert.equal(await page.locator('#ov-buy').isVisible(), true, 'Deploy should enter the real game buy phase');
    await page.locator('#btn-go').click();
    await page.waitForFunction(() => window.__sl.state === 'live', null, { timeout: 15000 });
    assert.equal(await page.locator('#ov-start').isVisible(), false, 'Starting a round should close the lobby');
    const hiddenPreview = await page.evaluate(() => { const n=window.__sl.scene.children.find(x=>x.userData&&x.userData.sightlineLobbyPreview);return !n||!n.visible; });
    assert.equal(hiddenPreview, true, 'Lobby-only showcase must be hidden during gameplay');
    record('Offline deployment launches the production match and hides showcase');
    await context.close();

    const mobile = await openPage(browser, offline, { width: 960, height: 540 }, true);
    const mobileRect = await mobile.page.evaluate(() => { const r=document.querySelector('#ov-start .mn').getBoundingClientRect();return {width:r.width,height:r.height,scrollWidth:document.documentElement.scrollWidth,innerWidth}; });
    assert.ok(mobileRect.width >= 950 && mobileRect.height >= 530, 'Android landscape lobby should occupy the viewport');
    assert.ok(mobileRect.scrollWidth <= mobileRect.innerWidth + 2, 'Android landscape should not overflow horizontally');
    await shot(mobile.page, 'offline-play-android-landscape-960x540.png');
    await mobile.context.close();
    record('Android landscape responsive shell (emulated viewport only)', mobileRect);

    const lan = await openPage(browser, host, { width: 1600, height: 900 }, false);
    const hostNote = await lan.page.locator('#mn-route-note').textContent();
    assert.match(hostNote, /LAN host page/i, 'Phone-host entrypoint should retain its LAN-specific route copy');
    await lan.page.locator('#mn-subnav [data-shell-route="multiplayer"]').click();
    const multiplayer = (await lan.page.locator('#pn-dyn').innerText()).toLowerCase();
    assert.ok(/host|join|address/.test(multiplayer), 'LAN multiplayer panel should retain its live host/join controls');
    await shot(lan.page, 'phone-host-multiplayer-entry-1600x900.png');
    await lan.page.locator('#mn-nav [data-shell-group="play"]').click();
    await shot(lan.page, 'phone-host-play-1600x900.png');
    await lan.page.locator('#mn-nav [data-shell-group="settings"]').click();
    assert.equal(await lan.page.locator('#pn-dyn .subtabs [data-sub]').count(), 5, 'Phone-host Settings must expose the same five functional categories');
    await shot(lan.page, 'phone-host-settings-1600x900.png');
    record('Phone-host production entrypoint and LAN controls (static page runtime)', { hostRouteCopy: hostNote.trim() });
    await lan.context.close();

    assert.deepEqual(errors, [], 'Production lobby pages must load without JavaScript runtime errors');
    const report = { schema: 'sightline-lobby-9-actual-browser-v1', generatedAt: new Date().toISOString(), sourceRoot: root, entrypoints: { offline: { path: offline, sha256: crypto.createHash('sha256').update(fs.readFileSync(offline)).digest('hex') }, phoneHost: { path: host, sha256: crypto.createHash('sha256').update(fs.readFileSync(host)).digest('hex') } }, runtime: 'Packaged production HTML and Three.js r128 renderer in isolated Chromium with SwiftShader; file:// execution (no localhost host/WebSocket)', results, screenshots: fs.readdirSync(out).filter(x=>x.endsWith('.png')), pageErrors: errors, limitations: ['Chromium screenshots are actual packaged-page renders, but software-rendered; not physical Android GPU testing.', 'Phone-host UI was loaded from the packaged phone-host entrypoint via file://. No live LAN host or WebSocket session was exercised because isolated localhost networking is blocked.', 'The Android landscape viewport is emulated in Chromium; no physical phone was tested.'] };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'PASS', resultCount: results.length, screenshots: report.screenshots, pageErrors: errors, entrypoints: report.entrypoints }, null, 2));
  } finally { await browser.close(); }
}
run().catch(e => { console.error(e.stack || e); process.exitCode = 1; });

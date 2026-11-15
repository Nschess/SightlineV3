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
const out = path.join(root, 'acceptance/lobby-9.1-visual-quality/actual-browser');
fs.mkdirSync(out, { recursive: true });
const errors = [];
const results = [];
const performanceMeasurements = [];
function record(name, detail) { results.push({ name, status: 'PASS', detail: detail || '' }); }
async function shot(page, name) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, name), fullPage: false, animations: 'disabled' }); }
async function measureLobbyFrames(page, label, durationMs = 3000) {
  const result = await page.evaluate(async ms => new Promise(resolve => {
    const intervals = [];
    let previous = 0;
    const start = performance.now();
    function frame(now) {
      if (previous) intervals.push(now - previous);
      previous = now;
      if (now - start < ms) return requestAnimationFrame(frame);
      const sorted = intervals.slice().sort((a, b) => a - b);
      const percentile = p => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))].toFixed(2) : null;
      const renderer = window.__sl && window.__sl.renderer;
      const gl = document.querySelector('#gl') && document.querySelector('#gl').getContext('webgl2') || document.querySelector('#gl') && document.querySelector('#gl').getContext('webgl');
      let rendererName = null;
      try { const ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); rendererName = gl && gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER); } catch (_) {}
      resolve({ durationMs: +(now - start).toFixed(1), frameSamples: intervals.length, rafIntervalMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.length ? +sorted[sorted.length - 1].toFixed(2) : null }, renderer: rendererName, threeRenderer: renderer ? { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, drawCallsLastFrame: renderer.info.render.calls, trianglesLastFrame: renderer.info.render.triangles } : null, jsHeapBytes: performance.memory ? performance.memory.usedJSHeapSize : null });
    }
    requestAnimationFrame(frame);
  }), durationMs);
  performanceMeasurements.push({ viewport: label, ...result });
  return result;
}
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
    const desktopPerf = await measureLobbyFrames(page, 'desktop-1600x900-SwiftShader');
    record('Offline full-screen Play and 3D operator', { ...preview, softwareRendererFrameSample: desktopPerf });

    const groups = await page.locator('#mn-nav [data-shell-group]').allTextContents();
    assert.equal(groups.length, 4, 'Primary navigation must have four groups');
    assert.equal(await page.locator('#mn-nav .mn-glyph').count(), 4, 'Each primary route should carry an original local vector icon');
    for (const route of ['play', 'loadout', 'operators', 'settings']) assert.ok(groups.some(x => x.toLowerCase().includes(route)), 'Missing primary route ' + route);
    await page.locator('#mn-nav [data-shell-group="loadout"]').click();
    assert.equal(await page.locator('#pn-dyn').isVisible(), true, 'Loadout panel should open');
    assert.equal(await page.locator('#pn-dyn .pn-h h2').innerText(), 'LOADOUT', 'Primary Loadout must not render as Settings');
    assert.equal(await page.locator('#pn-dyn .subtabs [data-sub]').count(), 0, 'Loadout must not duplicate the Settings categories');
    assert.equal(await page.locator('#pn-dyn [data-act=page-reset]').count(), 0, 'Loadout must not expose unrelated settings reset actions');
    assert.equal(await page.locator('#pn-dyn #loadout-weapon-preview').count(), 1, 'Loadout should render an actual first-person weapon preview in the production page');
    const weaponOptions = await page.locator('#pn-dyn #loadout-weapon-select option').count();
    assert.ok(weaponOptions >= 24, 'Loadout should expose the active firearm roster from the game weapon table');
    await page.locator('#pn-dyn #loadout-weapon-select').selectOption('rook117');
    await page.waitForFunction(() => document.querySelector('#loadout-weapon-preview')?.getAttribute('aria-label')?.includes('ROOK117'));
    const previewImage = await page.locator('#loadout-weapon-preview').evaluate(c => c.toDataURL());
    assert.ok(previewImage.length > 1000, 'The actual WebGL model preview should produce image pixels');
    const finishCount = await page.locator('#pn-dyn [data-loadout-finish]').count();
    assert.ok(finishCount >= 2, 'Loadout should present the current weapon’s available cosmetic finishes');
    await page.locator('#pn-dyn [data-loadout-finish="1"]').click();
    assert.equal(await page.locator('#pn-dyn [data-loadout-finish="1"]').getAttribute('aria-pressed'), 'true', 'Selecting a finish should update its visible state');
    const chosenFinish = await page.evaluate(() => JSON.parse(localStorage.getItem('sightline.weaponFinishes.v2') || '{}').rook117);
    assert.equal(chosenFinish, 1, 'Finish choice should use the existing saved weapon-finish system');
    const savedWeapon = await page.evaluate(() => localStorage.getItem('sightline.loadoutPreviewWeapon.v1'));
    assert.equal(savedWeapon, 'rook117', 'Loadout weapon preview choice should persist locally');
    await shot(page, 'offline-loadout-1600x900.png');
    await page.getByRole('button', { name: 'OPEN COSMETIC BENCH' }).click();
    assert.equal(await page.locator('.finish-panel').isVisible(), true, 'Loadout action should open the actual existing finish/optic/character customizer');
    record('Loadout route and existing customizer action');
    await page.keyboard.press('Escape');
    await page.locator('#mn-nav [data-shell-group="loadout"]').click();
    await page.getByRole('button', { name: 'OPTICS', exact: true }).click();
    assert.equal(await page.locator('.finish-panel').isVisible(), true, 'Optics action should open the existing per-weapon optic workflow');
    await page.keyboard.press('Escape');

    await page.locator('#mn-nav [data-shell-group="operators"]').click();
    const rosterCount = await page.locator('#pn-dyn .op[data-op]').count();
    const operatorCatalog = await page.evaluate(() => ({
      selectable: window.__sl.characterQA.selectableOperators().map(o => o.id),
      fullBotRoster: window.__sl.characterQA.operators().length
    }));
    const visibleOperatorIds = await page.locator('#pn-dyn .op[data-op]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-op')));
    assert.equal(rosterCount, operatorCatalog.selectable.length, 'Every player-selectable operative must appear in the redesigned roster');
    assert.deepEqual(visibleOperatorIds.sort(), operatorCatalog.selectable.slice().sort(), 'Player selection must expose the exact playable operator catalog');
    assert.equal(operatorCatalog.fullBotRoster, 34, 'All 34 authored human roster variants used by gameplay bots must remain intact');
    const target = page.locator('#pn-dyn .op[data-op]:not([aria-pressed="true"])').first();
    const targetId = await target.getAttribute('data-op');
    await target.click();
    await page.waitForFunction(id => { const n=window.__sl.scene.children.find(x=>x.userData&&x.userData.sightlineLobbyPreview); return !!n&&n.userData.sightlineLobbyOperator===id; }, targetId);
    assert.equal(await page.locator('#op-det h3').count(), 1, 'Previewed operator details should be shown');
    assert.equal(await page.locator('#pn-dyn [data-act="confirm-operator"]').isEnabled(), true, 'A different operator must require an explicit confirmation');
    assert.notEqual(await page.evaluate(() => localStorage.getItem('sightline-op')), targetId, 'Browsing a character must not silently change the saved operative');
    await page.locator('#pn-dyn [data-act="confirm-operator"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('sightline-op')), targetId, 'Confirmed operative selection should persist');
    await shot(page, 'offline-operators-1600x900.png');
    await page.locator('#pn-dyn [data-op-filter="red"]').click();
    assert.equal(await page.locator('#pn-dyn .op[data-op]').count(), await page.locator('#pn-dyn .teamrow.t-red .op').count(), 'Faction filter should show the requested roster only');
    const second = page.locator('#pn-dyn .op[data-op]:not([aria-pressed="true"])').first();
    const secondId = await second.getAttribute('data-op');
    await second.click();
    await page.locator('#pn-dyn [data-act="confirm-operator"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('sightline-op')), secondId, 'A different playable operator can be confirmed');
    await shot(page, 'offline-operators-second-faction-1600x900.png');
    await page.locator('#pn-dyn [data-op-filter="blue"]').click();
    const third = page.locator('#pn-dyn .op[data-op]:not([aria-pressed="true"])').first();
    const thirdId = await third.getAttribute('data-op');
    await third.click();
    await page.waitForFunction(id => { const n=window.__sl.scene.children.find(x=>x.userData&&x.userData.sightlineLobbyPreview); return !!n&&n.userData.sightlineLobbyOperator===id; }, thirdId);
    await page.locator('#pn-dyn [data-act="confirm-operator"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('sightline-op')), thirdId, 'A third distinct playable operator can be confirmed');
    await shot(page, 'offline-operators-third-identity-1600x900.png');
    record('Three distinct operator identities, 3D preview, faction filters and persistence', { firstConfirmedId: targetId, secondConfirmedId: secondId, thirdConfirmedId: thirdId });

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
    assert.equal(await page.evaluate(() => localStorage.getItem('sightline-op')), secondId, 'Confirmed operator should survive refresh');
    await page.locator('#mn-nav [data-shell-group="loadout"]').click();
    assert.equal(await page.locator('#pn-dyn #loadout-weapon-select').inputValue(), 'rook117', 'Selected loadout weapon should survive refresh');
    assert.equal(await page.locator('#pn-dyn [data-loadout-finish="1"]').getAttribute('aria-pressed'), 'true', 'Selected weapon finish should survive refresh');
    await shot(page, 'offline-loadout-restored-after-refresh-1600x900.png');
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
    const mobilePerf = await measureLobbyFrames(mobile.page, 'landscape-960x540-SwiftShader');
    const mobileRect = await mobile.page.evaluate(() => { const r=document.querySelector('#ov-start .mn').getBoundingClientRect();return {width:r.width,height:r.height,scrollWidth:document.documentElement.scrollWidth,innerWidth}; });
    assert.ok(mobileRect.width >= 950 && mobileRect.height >= 530, 'Android landscape lobby should occupy the viewport');
    assert.ok(mobileRect.scrollWidth <= mobileRect.innerWidth + 2, 'Android landscape should not overflow horizontally');
    const mobileNavAudit = await mobile.page.evaluate(() => {
      const nav=document.querySelector('#mn-nav'),nr=nav.getBoundingClientRect();
      const tabs=[...nav.querySelectorAll('[data-shell-group]')].map(b=>{const r=b.getBoundingClientRect(),label=b.querySelector('.nm'),lr=label.getBoundingClientRect();return {label:label.textContent.trim(),left:r.left,right:r.right,labelRight:lr.right,scrollWidth:b.scrollWidth,clientWidth:b.clientWidth};});
      const deploy=document.querySelector('#btn-start').getBoundingClientRect();
      const overlaps=[...document.querySelectorAll('#mode-select .mode-choice')].some(n=>{const r=n.getBoundingClientRect();return r.width>0&&deploy.width>0&&r.left<deploy.right&&r.right>deploy.left&&r.top<deploy.bottom&&r.bottom>deploy.top;});
      return {nav:{left:nr.left,right:nr.right,clientWidth:nav.clientWidth,scrollWidth:nav.scrollWidth},tabs,overlapsDeploy:overlaps};
    });
    assert.equal(mobileNavAudit.tabs.length,4,'All four primary navigation destinations must remain present in Android landscape');
    assert.ok(mobileNavAudit.nav.scrollWidth<=mobileNavAudit.nav.clientWidth+1,'Primary navigation must fit without hidden tabs at 960×540');
    assert.ok(mobileNavAudit.tabs.every(t=>t.labelRight<=mobileNavAudit.nav.right+1&&t.scrollWidth<=t.clientWidth+1),'Primary navigation labels must not be clipped at 960×540');
    assert.equal(mobileNavAudit.overlapsDeploy,false,'Deployment action must not cover a mode choice on the landscape Play screen');
    await shot(mobile.page, 'offline-play-android-landscape-960x540.png');
    await mobile.page.locator('#mn-nav [data-shell-group="operators"]').click();
    const operatorMobileOverflow=await mobile.page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,targets:[...document.querySelectorAll('#pn-dyn .op')].map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})).filter(x=>x.w>0)}));
    assert.ok(operatorMobileOverflow.scrollWidth<=operatorMobileOverflow.innerWidth+2,'Operator roster should not overflow Android landscape');
    assert.ok(operatorMobileOverflow.targets.length>0&&operatorMobileOverflow.targets.every(x=>x.w>=48&&x.h>=48),'Operator selection targets should remain touch-sized at 960×540');
    await shot(mobile.page,'offline-operators-android-landscape-960x540.png');
    const mobileOperatorIds=await mobile.page.evaluate(()=>{const selected=document.querySelector('#pn-dyn .op[aria-pressed="true"]')?.getAttribute('data-op');return window.__sl.characterQA.selectableOperators().map(o=>o.id).filter(id=>id!==selected).slice(0,3);});
    assert.equal(new Set(mobileOperatorIds).size,3,'Mobile operator showcase should use three distinct identities');
    for(let i=0;i<mobileOperatorIds.length;i++){
      const id=mobileOperatorIds[i];
      await mobile.page.locator('#pn-dyn [data-op-filter="all"]').click();
      const pick=mobile.page.locator('#pn-dyn .op[data-op="'+id+'"]');
      if(await pick.getAttribute('aria-pressed')!=='true'){
        await pick.click();
        await mobile.page.waitForFunction(want=>{const n=window.__sl.scene.children.find(x=>x.userData&&x.userData.sightlineLobbyPreview);return !!n&&n.userData.sightlineLobbyOperator===want;},id);
        await mobile.page.locator('#pn-dyn [data-act="confirm-operator"]').click();
      }
      assert.equal(await mobile.page.evaluate(()=>localStorage.getItem('sightline-op')),id,'Mobile operator confirmation should persist: '+id);
      await shot(mobile.page,'offline-operators-android-landscape-identity-'+(i+1)+'-960x540.png');
    }
    await mobile.page.locator('#mn-nav [data-shell-group="loadout"]').click();
    assert.ok(await mobile.page.locator('#pn-dyn #loadout-weapon-preview').count(),'Mobile loadout should keep the actual weapon preview');
    await shot(mobile.page,'offline-loadout-android-landscape-960x540.png');
    await mobile.page.locator('#mn-nav [data-shell-group="settings"]').click();
    assert.equal(await mobile.page.locator('#pn-dyn .subtabs [data-sub]').count(),5,'Mobile settings should preserve all five functional categories');
    await shot(mobile.page,'offline-settings-android-landscape-960x540.png');
    await mobile.context.close();
    record('Android landscape responsive shell and three operator previews (emulated viewport only)', { ...mobileRect, operatorIds: mobileOperatorIds, softwareRendererFrameSample: mobilePerf });

    const lan = await openPage(browser, host, { width: 1600, height: 900 }, false);
    const hostNote = await lan.page.locator('#mn-route-note').textContent();
    assert.match(hostNote, /LAN host page/i, 'Phone-host entrypoint should retain its LAN-specific route copy');
    await lan.page.locator('#mn-subnav [data-shell-route="multiplayer"]').click();
    const multiplayer = (await lan.page.locator('#pn-dyn').innerText()).toLowerCase();
    assert.ok(/host|join|address/.test(multiplayer), 'LAN multiplayer panel should retain its live host/join controls');
    await shot(lan.page, 'phone-host-multiplayer-entry-1600x900.png');
    await lan.page.locator('#mn-nav [data-shell-group="play"]').click();
    await shot(lan.page, 'phone-host-play-1600x900.png');
    await lan.page.locator('#mn-nav [data-shell-group="loadout"]').click();
    assert.ok(await lan.page.locator('#pn-dyn #loadout-weapon-preview').count(),'Phone-host loadout should share the real weapon preview');
    await shot(lan.page,'phone-host-loadout-1600x900.png');
    await lan.page.locator('#mn-nav [data-shell-group="operators"]').click();
    assert.ok(await lan.page.locator('#pn-dyn .operator-console').count(),'Phone-host operator selection should use the production 9.1 experience');
    await shot(lan.page,'phone-host-operators-1600x900.png');
    await lan.page.locator('#mn-nav [data-shell-group="settings"]').click();
    assert.equal(await lan.page.locator('#pn-dyn .subtabs [data-sub]').count(), 5, 'Phone-host Settings must expose the same five functional categories');
    await shot(lan.page, 'phone-host-settings-1600x900.png');
    record('Phone-host production entrypoint and LAN controls (static page runtime)', { hostRouteCopy: hostNote.trim() });
    await lan.context.close();

    const lanMobile=await openPage(browser,host,{width:960,height:540},true);
    const lanMobileRect=await lanMobile.page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,scrollHeight:document.documentElement.scrollHeight,innerHeight}));
    assert.ok(lanMobileRect.scrollWidth<=lanMobileRect.innerWidth+2,'Phone-host Android landscape should not overflow horizontally');
    await shot(lanMobile.page,'phone-host-play-android-landscape-960x540.png');
    await lanMobile.page.locator('#mn-nav [data-shell-group="loadout"]').click();
    assert.ok(await lanMobile.page.locator('#pn-dyn #loadout-weapon-preview').count(),'Phone-host landscape should retain the actual weapon preview');
    await shot(lanMobile.page,'phone-host-loadout-android-landscape-960x540.png');
    await lanMobile.page.locator('#mn-nav [data-shell-group="operators"]').click();
    const lanOperatorIds=await lanMobile.page.evaluate(()=>{const selected=document.querySelector('#pn-dyn .op[aria-pressed="true"]')?.getAttribute('data-op');return window.__sl.characterQA.selectableOperators().map(o=>o.id).filter(id=>id!==selected).slice(0,3);});
    assert.equal(new Set(lanOperatorIds).size,3,'Phone-host landscape should preview three distinct operator identities');
    for(let i=0;i<lanOperatorIds.length;i++){
      const id=lanOperatorIds[i];
      await lanMobile.page.locator('#pn-dyn [data-op-filter="all"]').click();
      const pick=lanMobile.page.locator('#pn-dyn .op[data-op="'+id+'"]');
      if(await pick.getAttribute('aria-pressed')!=='true'){
        await pick.click();
        await lanMobile.page.waitForFunction(want=>{const n=window.__sl.scene.children.find(x=>x.userData&&x.userData.sightlineLobbyPreview);return !!n&&n.userData.sightlineLobbyOperator===want;},id);
        await lanMobile.page.locator('#pn-dyn [data-act="confirm-operator"]').click();
      }
      assert.equal(await lanMobile.page.evaluate(()=>localStorage.getItem('sightline-op')),id,'Phone-host operator confirmation should persist: '+id);
      await shot(lanMobile.page,'phone-host-operators-android-landscape-identity-'+(i+1)+'-960x540.png');
    }
    await lanMobile.page.locator('#mn-nav [data-shell-group="settings"]').click();
    assert.equal(await lanMobile.page.locator('#pn-dyn .subtabs [data-sub]').count(),5,'Phone-host landscape settings should preserve all five categories');
    await shot(lanMobile.page,'phone-host-settings-android-landscape-960x540.png');
    await lanMobile.page.locator('#mn-subnav [data-shell-route="multiplayer"]').click();
    assert.ok(/host|join|address/i.test(await lanMobile.page.locator('#pn-dyn').innerText()),'Phone-host landscape should expose the real LAN controls');
    await shot(lanMobile.page,'phone-host-multiplayer-android-landscape-960x540.png');
    record('Phone-host Android landscape screens and three operator previews (emulated viewport only)',{...lanMobileRect,operatorIds:lanOperatorIds});
    await lanMobile.context.close();

    assert.deepEqual(errors, [], 'Production lobby pages must load without JavaScript runtime errors');
    const report = { schema: 'sightline-lobby-9.1-actual-browser-v1', generatedAt: new Date().toISOString(), sourceRoot: root, entrypoints: { offline: { path: offline, sha256: crypto.createHash('sha256').update(fs.readFileSync(offline)).digest('hex') }, phoneHost: { path: host, sha256: crypto.createHash('sha256').update(fs.readFileSync(host)).digest('hex') } }, runtime: 'Packaged production HTML and Three.js r128 renderer in isolated Chromium with SwiftShader; file:// execution (no localhost host/WebSocket)', results, performanceMeasurements, screenshots: fs.readdirSync(out).filter(x=>x.endsWith('.png')), pageErrors: errors, limitations: ['Chromium screenshots are actual packaged-page renders, but software-rendered; frame samples are not hardware FPS or Android performance.', 'Phone-host UI was loaded from the packaged phone-host entrypoint via file://. No live LAN host or WebSocket session was exercised because isolated localhost networking is blocked.', 'The Android landscape viewport is emulated in Chromium; no physical phone was tested.'] };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: 'PASS', resultCount: results.length, screenshots: report.screenshots, pageErrors: errors, entrypoints: report.entrypoints }, null, 2));
  } finally { await browser.close(); }
}
run().catch(e => { console.error(e.stack || e); process.exitCode = 1; });

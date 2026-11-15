// Actual game-page WebGL QA using a workspace-local Playwright/Chromium install.
// Usage: set PLAYWRIGHT_BROWSERS_PATH=tests/.phase17-playwright/browsers, then run with Node.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('./.phase17-playwright/node_modules/playwright');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets/www');
const output = path.join(root, 'evidence/phase17');
const testPage = path.join(assets, 'index-phase17-test.html');
fs.mkdirSync(output, { recursive: true });

const original = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
const markers = Array.from(original.matchAll(/requestAnimationFrame\(frame\);\r?\n\}\)\(\);\r?\n<\/script>/g));
const marker = markers.at(-1);
assert.ok(marker, 'game loop instrumentation marker changed');
const qa = `requestAnimationFrame(frame);
window.__p17qa={WEAPONS:WEAPONS,MAPS:MAPS,WEP_ORDER:WEP_ORDER,R:R,G:G,OB:OB,P:P,startMatch:startMatch,beginRound:beginRound,setWeapon:setWeapon,startReload:startReload,tryFire:tryFire,setMap:setMap,get owned(){return owned},get ammo(){return ammo},get guns(){return guns},get current(){return cur},get state(){return state},get scoped(){return scoped},set scoped(v){scoped=v},get reloading(){return reloading},get bots(){return bots},get mates(){return mates},get units(){return units},get touchMode(){return touchMode},get stick(){return stick},get lookTouch(){return lookTouch},get match(){return M},get renderer(){return renderer},get scene(){return scene},get camera(){return camera},get map(){return MAPD},get nav(){return NAV},get fireHeld(){return fireHeld},get activeFirePointers(){return touchFireOwners.size},get time(){return T},get nextFire(){return nextFire},get huntStats(){return outbreakHuntStats},infectionState:function(){return SOLO_INF},fireOwners:touchFireOwners,resetTouchMotion:resetTouchMotion,adsState:function(){return {scoped:scoped,adsT:adsT,fov:camera.fov,target:WEAPONS[cur].zoomFov[Math.min(zoomLvl,WEAPONS[cur].zoomFov.length-1)]}}};
})();
</script>`;
fs.writeFileSync(testPage, original.slice(0, marker.index) + qa + original.slice(marker.index + marker[0].length));

async function raf(page, n = 2) {
  await page.evaluate(count => new Promise(resolve => {
    const step = () => --count > 0 ? requestAnimationFrame(step) : resolve();
    requestAnimationFrame(step);
  }), n);
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: [
      '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-background-networking', '--disable-sync', '--no-first-run'
    ] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    const resourceWarnings = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const message = m.text();
      if (message.includes("Access to image at 'file://") || message.includes('Failed to load resource: net::ERR_FAILED')) resourceWarnings.push(message);
      else errors.push(message);
    });
    await page.route(/^https?:\/\//, route => route.abort());
    const url = pathToFileURL(testPage); url.search = 'debug';
    await page.goto(url.href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__p17qa?.renderer, null, { timeout: 30000 });
    await page.waitForTimeout(300);

    const probe = await page.evaluate(() => {
      const gl = __p17qa.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        browser: navigator.userAgent,
        glVersion: gl.getParameter(gl.VERSION),
        glRenderer: gl.getParameter(gl.RENDERER),
        unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'extension unavailable',
        weaponKeys: Object.keys(__p17qa.WEAPONS),
        firearmKeys: Object.keys(__p17qa.WEAPONS).filter(k => !__p17qa.WEAPONS[k].melee),
        meleeKeys: Object.keys(__p17qa.WEAPONS).filter(k => !!__p17qa.WEAPONS[k].melee),
        maps: __p17qa.MAPS.map(m => m.id),
        mode: __p17qa.R.mode,
        ruleKeys: Object.keys(__p17qa.R),
        touchMode: __p17qa.touchMode,
        pageErrors: []
      };
    });
    assert.ok(probe.glVersion && probe.glRenderer, 'game renderer did not create a WebGL context');
    assert.equal(probe.maps.length, 18, 'active map registry count changed');
    assert.equal(probe.firearmKeys.length, 28, 'active firearm count changed');
    assert.equal(probe.meleeKeys.length, 4, 'melee count changed');
    assert.ok(probe.touchMode, 'Chromium did not enter the game touch-control mode');

    const mapDir = path.join(output, 'maps');
    const weaponDir = path.join(output, 'weapons');
    fs.mkdirSync(mapDir, { recursive: true });
    fs.mkdirSync(weaponDir, { recursive: true });
    const mapResults = [];
    for (const id of (process.env.P17_SKIP_MAPS === '1' ? [] : probe.maps)) {
      const begin = Date.now();
      await page.evaluate(mapId => __p17qa.setMap(mapId), id);
      await page.waitForTimeout(35);
      await raf(page, 2);
      const result = await page.evaluate(() => ({
        id: __p17qa.map.id,
        nodes: __p17qa.nav.nodes.length,
        draws: __p17qa.renderer.info.render.calls,
        triangles: __p17qa.renderer.info.render.triangles
      }));
      assert.equal(result.id, id, 'map selection did not apply: ' + id);
      assert.ok(result.nodes > 0, 'navigation graph is empty: ' + id);
      assert.ok(result.draws > 0 && result.triangles > 0, 'map did not render through WebGL: ' + id);
      result.loadAndRenderMs = Date.now() - begin;
      mapResults.push(result);
      await page.screenshot({ path: path.join(mapDir, id + '.png'), fullPage: false });
    }

    await page.evaluate(() => {
      const q = window.__p17qa;
      q.setMap('courtyard');
      q.R.mode = 'deathmatch'; q.R.bots = 0; q.R.mates = 0;
      q.startMatch(); q.beginRound();
      Object.keys(q.WEAPONS).forEach(k => { q.owned[k] = true; });
    });
    await page.waitForFunction(() => __p17qa.state === 'live', null, { timeout: 10000 });
    await page.waitForTimeout(650);
    const gameStart = await page.evaluate(() => ({
      state: __p17qa.state,
      touch: __p17qa.touchMode,
      touchControlsVisible: !document.getElementById('touch').hidden,
      weapon: __p17qa.current,
      frame: __p17qa.renderer.info.render
    }));
    assert.equal(gameStart.state, 'live');
    assert.ok(gameStart.touchControlsVisible, 'touch HUD did not appear in live gameplay');

    async function pointer(id, event, pointerId) {
      return page.evaluate(({ id, event, pointerId }) => {
        const el = document.getElementById(id);
        el.dispatchEvent(new PointerEvent(event, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId, button: 0 }));
        return { held: __p17qa.fireHeld, owners: __p17qa.activeFirePointers, current: __p17qa.current, scoped: __p17qa.scoped, pressed: el.classList.contains('pressed') };
      }, { id, event, pointerId });
    }

    await page.evaluate(() => __p17qa.setWeapon('carbine'));
    await page.waitForFunction(() => __p17qa.time >= __p17qa.nextFire, null, { timeout: 20000 });
    await page.waitForTimeout(650);
    const shotsBeforeDual = await page.evaluate(() => __p17qa.match.stats.shots);
    const leftDown = await pointer('tb-fire-alt', 'pointerdown', 301);
    const rightDown = await pointer('tb-fire', 'pointerdown', 302);
    await page.waitForTimeout(700);
    const shotsBoth = await page.evaluate(() => __p17qa.match.stats.shots);
    await page.screenshot({ path: path.join(output, 'dual-fire-live.png'), fullPage: false });
    const rightUp = await pointer('tb-fire', 'pointerup', 302);
    await page.waitForTimeout(350);
    const shotsLeftStillHeld = await page.evaluate(() => __p17qa.match.stats.shots);
    const leftCancel = await pointer('tb-fire-alt', 'pointercancel', 301);
    const dualFire = { shotsBeforeDual, shotsBoth, shotsLeftStillHeld, leftDown, rightDown, rightUp, leftCancel };
    assert.ok(shotsBoth > shotsBeforeDual, 'dual touch fire did not produce a shot');
    assert.equal(rightUp.held, true, 'releasing the right fire button stopped the held left trigger');
    assert.equal(rightUp.owners, 1);
    assert.ok(shotsLeftStillHeld >= shotsBoth, 'shots ceased while the left trigger remained held');
    assert.equal(leftCancel.held, false, 'pointer cancellation left firing stuck');
    assert.equal(leftCancel.owners, 0);

    const touchMotion = await page.evaluate(() => {
      if (typeof Touch !== 'function' || typeof TouchEvent !== 'function') return { supported: false };
      const move = document.getElementById('tz-move'), look = document.getElementById('tz-look');
      const p0 = __p17qa.P.yaw, mr = move.getBoundingClientRect(), lr = look.getBoundingClientRect();
      const t0 = new Touch({ identifier: 401, target: move, clientX: mr.left + mr.width / 2, clientY: mr.top + mr.height / 2 });
      move.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t0], changedTouches: [t0] }));
      const t1 = new Touch({ identifier: 401, target: move, clientX: t0.clientX + 50, clientY: t0.clientY - 25 });
      move.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t1], changedTouches: [t1] }));
      const stick = [__p17qa.stick.x, __p17qa.stick.y];
      move.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: true, touches: [], changedTouches: [t1] }));
      const t2 = new Touch({ identifier: 402, target: look, clientX: lr.left + lr.width * .75, clientY: lr.top + lr.height * .55 });
      look.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t2], changedTouches: [t2] }));
      const t3 = new Touch({ identifier: 402, target: look, clientX: t2.clientX + 48, clientY: t2.clientY + 15 });
      look.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t3], changedTouches: [t3] }));
      const yawDelta = __p17qa.P.yaw - p0;
      look.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t3] }));
      return { supported: true, stick, yawDelta, stickCleared: __p17qa.stick.id === null, lookCleared: __p17qa.lookTouch.id === null };
    });
    assert.ok(touchMotion.supported && (Math.abs(touchMotion.stick[0]) > .2 || Math.abs(touchMotion.stick[1]) > .2), 'movement touch did not move the joystick');
    assert.notEqual(touchMotion.yawDelta, 0, 'look touch did not turn the camera');
    assert.ok(touchMotion.stickCleared && touchMotion.lookCleared, 'touch cancel/end left movement or look held');

    await page.evaluate(() => { __p17qa.owned.carbine = true; __p17qa.owned.rook117 = true; __p17qa.setWeapon('carbine'); });
    const swapDown = await pointer('tb-swap', 'pointerdown', 410);
    const swapMid = await page.evaluate(() => ({current:__p17qa.current, state:__p17qa.state, owned:__p17qa.WEP_ORDER.filter(k=>__p17qa.owned[k])}));
    const swapUp = await pointer('tb-swap', 'pointerup', 410);
    const switchResult = await page.evaluate(() => __p17qa.current);
    const swapCalls = await page.evaluate(() => ({calls:__p17qa.weaponCalls, hit:__p17qa.swapHit, disabled:document.getElementById('tb-swap').disabled}));
    assert.equal(switchResult, 'rook117', 'touch swap did not select the next owned weapon: ' + JSON.stringify({swapDown,swapMid,swapUp,swapCalls}));
    await page.evaluate(() => __p17qa.setWeapon('rook117'));
    await page.waitForTimeout(250);
    await pointer('tb-aim', 'pointerdown', 411); await pointer('tb-aim', 'pointerup', 411);
    await page.waitForTimeout(250);
    const ads = await page.evaluate(() => __p17qa.adsState());
    assert.equal(ads.scoped, true, 'touch ADS did not enter the scoped state');
    assert.ok(ads.target < 90, 'ADS did not request a narrower field of view');
    await page.screenshot({ path: path.join(weaponDir, 'rook117-ads.png'), fullPage: false });
    await page.evaluate(() => { const a = __p17qa.ammo.rook117; a.mag = Math.max(1, a.mag - 1); });
    await pointer('tb-rel', 'pointerdown', 412); await pointer('tb-rel', 'pointerup', 412);
    const reloadResult = await page.evaluate(() => ({ remaining: __p17qa.reloading, scoped: __p17qa.scoped }));
    assert.ok(reloadResult.remaining > 0, 'touch reload did not start');
    assert.equal(reloadResult.scoped, false, 'reload did not clear ADS as the existing behavior requires');
    await page.screenshot({ path: path.join(weaponDir, 'rook117-reload.png'), fullPage: false });

    await page.evaluate(() => Object.keys(__p17qa.WEAPONS).forEach(k => { __p17qa.owned[k] = true; }));
    const weaponResults = [];
    for (const key of probe.firearmKeys) {
      await page.evaluate(k => __p17qa.setWeapon(k), key);
      await page.waitForFunction(() => __p17qa.time >= __p17qa.nextFire, null, { timeout: 20000 });
      const geometry = await page.evaluate(k => {
        const g = __p17qa.guns[k]; let meshes = 0;
        if (g) g.traverse(n => { if (n.isMesh) meshes++; });
        const w = __p17qa.WEAPONS[k], a = __p17qa.ammo[k];
        return { key: k, visible: !!(g && g.visible), meshes, mag: a && a.mag, maxMag: w.mag, reserve: a && a.res, zooms: w.zoomFov && w.zoomFov.length, draws: __p17qa.renderer.info.render.calls, triangles: __p17qa.renderer.info.render.triangles };
      }, key);
      assert.ok(geometry.visible && geometry.meshes > 0, key + ' has no visible first-person model');
      assert.ok(geometry.draws > 0 && geometry.triangles > 0, key + ' produced no WebGL draw');
      const before = await page.evaluate(k => __p17qa.ammo[k].mag, key);
      await page.evaluate(() => __p17qa.tryFire(true));
      const after = await page.evaluate(k => __p17qa.ammo[k].mag, key);
      assert.equal(after, before - 1, key + ' did not consume one round through the existing firing path');
      await pointer('tb-aim', 'pointerdown', 500 + weaponResults.length);
      await page.waitForTimeout(180);
      const adsState = await page.evaluate(() => __p17qa.adsState());
      assert.equal(adsState.scoped, true, key + ' failed to enter ADS through the touch action');
      await pointer('tb-aim', 'pointerup', 500 + weaponResults.length);
      await page.evaluate(() => __p17qa.startReload());
      const reload = await page.evaluate(() => __p17qa.reloading);
      assert.ok(reload > 0, key + ' failed to enter its normal reload state');
      geometry.reloadStarted = true;
      geometry.adsActive = adsState.scoped;
      geometry.roundConsumed = true;
      weaponResults.push(geometry);
      if (key === 'rook117' || key === 'carbine' || key === 'longbow') {
        await page.evaluate(k => __p17qa.setWeapon(k), key);
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(weaponDir, key + '-hip.png'), fullPage: false });
      }
    }
    assert.equal(weaponResults.length, 28);

    const aiRuntime = {};
    await page.evaluate(() => { __p17qa.R.mode='infection'; __p17qa.R.bots=0; __p17qa.R.mates=3; __p17qa.startMatch(); __p17qa.beginRound(); });
    await page.waitForFunction(() => __p17qa.state === 'live', null, { timeout: 10000 });
    await page.waitForFunction(() => __p17qa.infectionState().chosen && __p17qa.bots.some(z => z.alive && z.zombie), null, { timeout: 30000 });
    aiRuntime.infection = await page.evaluate(() => ({ phase:__p17qa.OB.phase, chosen:__p17qa.infectionState().chosen, zombies:__p17qa.bots.filter(z=>z.alive&&z.zombie).length, survivors:__p17qa.mates.filter(m=>m.alive).length }));
    assert.equal(aiRuntime.infection.phase, 'fight');
    assert.ok(aiRuntime.infection.chosen && aiRuntime.infection.zombies > 0, 'Infection did not produce Patient Zero and an infected unit');
    await page.screenshot({ path: path.join(output, 'infection-live.png'), fullPage: false });

    await page.evaluate(() => { __p17qa.R.mode='outbreak'; __p17qa.R.bots=0; __p17qa.R.mates=3; __p17qa.startMatch(); __p17qa.beginRound(); });
    await page.waitForFunction(() => __p17qa.OB.phase === 'fight' && __p17qa.bots.some(z => z.alive && z.zombie), null, { timeout: 30000 });
    await page.waitForTimeout(1800);
    aiRuntime.outbreak = await page.evaluate(() => ({ phase:__p17qa.OB.phase, wave:__p17qa.OB.wave, spawned:__p17qa.OB.spawned, livingZombies:__p17qa.bots.filter(z=>z.alive&&z.zombie).length, hunt:{...__p17qa.huntStats} }));
    assert.equal(aiRuntime.outbreak.phase, 'fight');
    assert.ok(aiRuntime.outbreak.wave >= 1 && aiRuntime.outbreak.spawned > 0 && aiRuntime.outbreak.livingZombies > 0, 'Outbreak failed to spawn its first wave');
    assert.ok(Object.values(aiRuntime.outbreak.hunt).some(v=>v>0), 'Outbreak zombie AI did not run its hunt/navigation state machine');
    await page.screenshot({ path: path.join(output, 'outbreak-wave1.png'), fullPage: false });

    const performance = await page.evaluate(() => __sl.frameStats());
    const rendering = await page.evaluate(() => ({
      calls: __p17qa.renderer.info.render.calls,
      triangles: __p17qa.renderer.info.render.triangles,
      geometries: __p17qa.renderer.info.memory.geometries,
      textures: __p17qa.renderer.info.memory.textures,
      frameStats: __sl.frameStats()
    }));
    const report = {
      browser: probe,
      maps: mapResults,
      controls: { dualFire, touchMotion, switchResult, ads, reloadResult },
      weapons: weaponResults,
      aiRuntime,
      performance: { ...rendering, fpsEquivalentFromP50: performance.p50 ? Math.round(1000 / performance.p50 * 100) / 100 : null,
        environment: 'Headless Chrome 156 with SwiftShader software WebGL; not target device or hardware GPU' },
      runtimeErrors: errors,
      resourceWarnings,
      textureLoading: resourceWarnings.length ? 'BLOCKED: Chromium file-origin CORS prevents file-backed authored ROOK117 material textures from loading; geometry and WebGL continue rendering without those maps.' : 'No file-origin texture load warnings observed.'
    };
    fs.writeFileSync(path.join(output, 'runtime-acceptance.json'), JSON.stringify(report, null, 2));
    assert.deepEqual(errors, [], 'game page logged runtime JavaScript errors');
    console.log(JSON.stringify({
      gl: { version: probe.glVersion, renderer: probe.unmaskedRenderer },
      weapons: { firearms: weaponResults.length, pass: weaponResults.every(w => w.visible && w.roundConsumed && w.adsActive && w.reloadStarted) },
      maps: { count: mapResults.length, rendered: mapResults.every(m => m.draws > 0 && m.triangles > 0), maxTriangles: Math.max(...mapResults.map(m => m.triangles)) },
      controls: report.controls,
      performance: report.performance,
      resourceWarnings: resourceWarnings.length,
      runtimeErrors: errors.length
    }, null, 2));
  } finally {
    if (browser) await browser.close();
    try { fs.unlinkSync(testPage); } catch {}
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

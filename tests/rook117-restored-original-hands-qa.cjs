/* Actual-game, isolated Chromium smoke check for restored authored ROOK117 hands.
 * This does not connect to or control the user's desktop/browser. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const indexFile = process.env.SIGHTLINE_INDEX_OVERRIDE || path.join(assets, 'index.html');
const expectCupOverride = process.env.SIGHTLINE_EXPECT_CUP === '1';
const out = path.join(root, 'evidence', 'rook-image2-hand-recovery-20261026', 'runtime', expectCupOverride ? 'before-prototype-override' : 'after-authored-support-restored');
fs.mkdirSync(out, { recursive: true });
const type = file => ({ '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.webp':'image/webp' })[path.extname(file).toLowerCase()] || 'application/octet-stream';
const debugMarker = 'if (/[?&]debug\\b/.test(location.search)) window.__sl';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.SIGHTLINE_CHROMIUM_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox','--disable-background-timer-throttling','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'],
  });
  const result = { variant:expectCupOverride?'before-prototype-override':'after-authored-asset-restored', method:'Actual Sightline V3 phone-host source in isolated headless Chromium/WebGL (SwiftShader)', screenshots:[], errors:[], failedRequests:[], limitations:['Software WebGL only; not a physical Android/GPU test. Screenshot review does not substitute for user preference.'] };
  try {
    const page = await browser.newPage({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
    page.on('pageerror', e => result.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') result.errors.push(m.text()); });
    page.on('requestfailed', r => result.failedRequests.push({url:r.url(), reason:r.failure()?.errorText}));
    await page.route('http://127.0.0.1:39211/**', async route => {
      if (route.request().isNavigationRequest()) {
        let html = fs.readFileSync(indexFile,'utf8');
        if (!html.includes(debugMarker)) throw new Error('Debug API injection point missing');
        html = html.replace(debugMarker, 'window.__rookRecoveryQA={reload:function(){return reloading;},ammo:function(){return ammo.rook117;}};\n' + debugMarker);
        return route.fulfill({ status:200, contentType:'text/html', body:html });
      }
      const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
      if (expectCupOverride && rel === 'firstperson-hands/cup-grip.js') {
        const saved = path.join(root,'evidence','rook-image2-hand-recovery-20261026','rollback-before','phone-host-cup-grip-prototype.js');
        return route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(saved)});
      }
      const file = path.resolve(assets, rel);
      if (!rel || rel.includes('..') || !file.startsWith(path.resolve(assets)+path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:'Missing candidate asset: '+rel});
      return route.fulfill({status:200,contentType:type(file),body:fs.readFileSync(file)});
    });
    const response = await page.goto('http://127.0.0.1:39211/?debug', {waitUntil:'load',timeout:60000});
    await page.locator('#btn-start').click({timeout:20000});
    await page.locator('#btn-go').click({force:true,timeout:20000});
    await page.evaluate(() => { window.__sl.bots().forEach(x=>{if(x.g)x.g.visible=false;}); window.__sl.mates().forEach(x=>{if(x.g)x.g.visible=false;}); window.__sl.prepareWeaponQA('rook117'); });
    await page.waitForFunction(() => window.__sl.fpWeaponStatus('rook117').ready, null, {timeout:30000});
    const inspect = () => page.evaluate(() => {
      let g = null;
      window.__sl.scene.traverse(n => { if (n.userData && n.userData.fpRigAsset && n.userData.fpRigAsset.owner === n && n.userData.fpGripRigClass === 'rifle' && n.visible) g = n; });
      const w = window.__sl.fpWeaponStatus('rook117');
      const gun = g;
      const asset = gun && gun.userData.fpRigAsset;
      let supportUnderGun = false;
      for (let n=gun&&gun.userData.fpSupportPivot; n; n=n.parent) if (n===gun) { supportUnderGun=true; break; }
      return {state:window.__sl.state, weapon:window.__sl.cur, status:w, supportIsAuthoredAsset:!!(asset&&gun.userData.fpSupportPivot===asset.support), supportVisible:!!(asset&&asset.support&&asset.support.visible), supportUnderGun, customCupMounted:!!(gun&&gun.userData.fpCustomSupportHand), appearanceId:asset&&asset.scene.userData.sightlineFPCharacterId, camo:asset&&asset.scene.userData.sightlineFPCamo, scoped:window.__sl.adsState&&window.__sl.adsState().progress>0.985, weaponInfo:window.__sl.weaponInfo('rook117'), canvas:!!document.querySelector('canvas') };
    });
    await page.waitForTimeout(500);
    result.httpStatus = response.status();
    result.hip = await inspect();
    const hipFile = path.join(out,'rook117-restored-authored-support-hip.png');
    await page.screenshot({path:hipFile,fullPage:false}); result.screenshots.push(hipFile);

    await page.evaluate(() => window.__sl.press('Mouse2', true));
    await page.waitForFunction(() => window.__sl.adsState().progress > .985, null, {timeout:12000});
    result.ads = await inspect();
    const adsFile = path.join(out,'rook117-restored-authored-support-ads.png');
    await page.screenshot({path:adsFile,fullPage:false}); result.screenshots.push(adsFile);
    await page.evaluate(() => window.__sl.press('Mouse2', false));
    await page.waitForTimeout(250);

    result.reloadStarted = await page.evaluate(() => { window.__sl.setAmmoForQA('rook117',1,90); window.__sl.startReload(); return window.__rookRecoveryQA.reload(); });
    if (!(result.reloadStarted > 0)) throw new Error('ROOK117 reload did not enter its active state');
    await page.waitForTimeout(180);
    result.reload = await inspect();
    result.reloadActiveDuringCapture = await page.evaluate(() => window.__rookRecoveryQA.reload());
    result.reloadAmmoDuringCapture = await page.evaluate(() => window.__rookRecoveryQA.ammo());
    const reloadFile = path.join(out,'rook117-restored-authored-support-reload.png');
    await page.screenshot({path:reloadFile,fullPage:false}); result.screenshots.push(reloadFile);
    await page.evaluate(() => window.__sl.resetReloadForQA());

    const supportVariantValid = expectCupOverride ? result.hip.customCupMounted && !result.hip.supportIsAuthoredAsset && !result.hip.supportVisible : result.hip.supportIsAuthoredAsset && result.hip.supportVisible && !result.hip.customCupMounted;
    result.pass = result.httpStatus===200 && result.hip.status.ready && supportVariantValid && result.hip.supportUnderGun && result.ads.status.ready && result.ads.scoped && result.reload.status.ready && result.reloadActiveDuringCapture>0 && result.reloadAmmoDuringCapture.mag===1 && result.hip.appearanceId==='riptide' && result.hip.canvas && result.screenshots.length===3 && !result.errors.length && !result.failedRequests.length;
    result.visualAcceptance = 'REVIEW_REQUIRED';
    result.visualAcceptanceReason = 'Runtime proves the archived authored support node is the mounted visible node and captures the actual game states. Human approval that this matches Image 2 remains necessary.';
    await page.close();
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  process.exitCode = result.pass ? 0 : 1;
})().catch(e => { console.error(e.stack); process.exitCode=1; });

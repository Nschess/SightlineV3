/* Isolated runtime capture of the accepted legacy arm path; no user desktop/browser. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const out = path.join(root, 'evidence', 'rook-image2-hand-recovery-20261026', 'runtime', 'accepted-arm-path');
fs.mkdirSync(out, { recursive: true });
const types = { '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.webp':'image/webp' };
(async () => {
  const browser = await chromium.launch({ executablePath:process.env.SIGHTLINE_CHROMIUM_EXECUTABLE, headless:true,
    args:['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
  const errors=[]; page.on('pageerror', e=>errors.push(e.message)); page.on('console', m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('http://127.0.0.1:39212/**', async route=>{
    if(route.request().isNavigationRequest()){
      let html=fs.readFileSync(path.join(assets,'index.html'),'utf8');
      const marker='if (/[?&]debug\\b/.test(location.search)) window.__sl';
      if(!html.includes(marker))throw new Error('Debug QA injection marker missing');
      html=html.replace(marker,'window.__rookRecoveryQA={reload:function(){return reloading;}};\n'+marker);
      return route.fulfill({status:200,contentType:'text/html',body:html});
    }
    const rel=decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const file=path.resolve(assets,rel);
    if(!rel||rel.includes('..')||!file.startsWith(path.resolve(assets)+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing '+rel});
    return route.fulfill({status:200,contentType:types[path.extname(file).toLowerCase()]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  try {
    await page.goto('http://127.0.0.1:39212/?debug',{waitUntil:'load',timeout:60000});
    await page.locator('#btn-start').click({timeout:20000}); await page.locator('#btn-go').click({force:true,timeout:20000});
    await page.evaluate(()=>{window.__sl.bots().forEach(x=>{if(x.g)x.g.visible=false;});window.__sl.mates().forEach(x=>{if(x.g)x.g.visible=false;});window.__sl.prepareWeaponQA('rook117');});
    await page.waitForTimeout(900);
    const hip=await page.evaluate(()=>{let gun=null;window.__sl.scene.traverse(n=>{if(n.userData&&n.userData.weaponKey==='rook117')gun=n;});const left=gun&&gun.userData.left;let armMeshes=0;left&&left.traverse(n=>{if(n.isMesh)armMeshes++;});return {weapon:window.__sl.cur,live:window.__sl.state==='live',rifleRigReady:window.__sl.fpWeaponStatus('rook117').ready,acceptedLegacyArmVisible:!!(left&&left.visible),armMeshCount:armMeshes,weaponInfo:window.__sl.weaponInfo('rook117')};});
    await page.screenshot({path:path.join(out,'rook117-accepted-arm-path-hip.png')});
    await page.evaluate(()=>window.__sl.press('Mouse2',true)); await page.waitForTimeout(500);
    const adsScoped=await page.evaluate(()=>window.__sl.adsState().progress>.5);
    await page.screenshot({path:path.join(out,'rook117-accepted-arm-path-ads.png')});
    await page.evaluate(()=>window.__sl.press('Mouse2',false));
    await page.evaluate(()=>{window.__sl.setAmmoForQA('rook117',1,90);window.__sl.startReload();});
    await page.waitForTimeout(150);
    const reloadActive=await page.evaluate(()=>window.__rookRecoveryQA?window.__rookRecoveryQA.reload()>0:undefined);
    await page.screenshot({path:path.join(out,'rook117-accepted-arm-path-reload.png')});
    const result={hip,adsScoped,reloadActive,errors,screenshots:[path.join(out,'rook117-accepted-arm-path-hip.png'),path.join(out,'rook117-accepted-arm-path-ads.png'),path.join(out,'rook117-accepted-arm-path-reload.png')],renderer:'Isolated headless Chromium SwiftShader WebGL',visualDecision:'Needs artist/user acceptance'};
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
  } finally { await browser.close(); }
  if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

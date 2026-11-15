/*
 * Captures weapon-holding poses from the actual Sightline scene/renderer in
 * isolated Chromium. Units are built by the game's active Claude v12.8 path;
 * this is a QA staging pose, not a separate model preview or a gameplay clip.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const out = process.env.SIGHTLINE_EVIDENCE_DIR || path.join(root, 'evidence', 'hand-workflow-20261025');
const sourceHtml = process.env.SIGHTLINE_INDEX_OVERRIDE || path.join(assets, 'index.html');
fs.mkdirSync(out, { recursive: true });

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.wav':'audio/wav', '.css':'text/css' })[ext] || 'application/octet-stream';
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.SIGHTLINE_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox','--disable-background-timer-throttling','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'],
  });
  const results = [], errors = [];
  try {
    for (const pose of [
      { weapon:'pistol', character:'riptide', yaw:Math.PI, name:'pistol-riptide-front' },
      { weapon:'rook117', character:'ashfall', yaw:Math.PI-.28, name:'rook117-ashfall-three-quarter' },
      { weapon:'breacher', character:'squall', yaw:Math.PI+.22, name:'breacher-squall-three-quarter' },
      { weapon:'scatter', character:'skerry', yaw:Math.PI-.44, name:'scatter-skerry-three-quarter' },
    ]) {
      const page = await browser.newPage({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
      page.on('pageerror', e => errors.push(pose.name+': '+e.message));
      page.on('console', m => { if(m.type()==='error') errors.push(pose.name+': '+m.text()); });
      page.on('requestfailed', r => errors.push(pose.name+': request failed '+r.url()));
      await page.route('http://127.0.0.1:39176/**', async route => {
        if(route.request().isNavigationRequest()) {
          let html=fs.readFileSync(sourceHtml,'utf8');
          const marker='if (/[?&]debug\\b/.test(location.search)) window.__sl';
          if(!html.includes(marker)) throw new Error('Debug API hook missing');
          html=html.replace(marker,'if (true) window.__sl');
          const api='characterQA: { buildRig:';
          if(!html.includes(api)) throw new Error('Character QA API hook missing');
          html=html.replace(api,'characterQA: { makeUnit:makeUnit, weaponMeta:function(){return WORLD_WEAPON_META;}, weaponProfiles:function(){return WORLD_WEAPON_PRESENTATION;}, hideLocalViewModel:function(){if(guns[cur])guns[cur].visible=false;}, buildRig:');
          return route.fulfill({contentType:'text/html',body:html});
        }
        const rel=decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
        if(!rel||rel.includes('..')) return route.fulfill({status:404,body:'Not found'});
        const file=path.resolve(assets,rel);
        if(!file.startsWith(path.resolve(assets)+path.sep)||!fs.existsSync(file)) return route.fulfill({status:404,body:'Not found'});
        return route.fulfill({status:200,contentType:contentType(file),body:fs.readFileSync(file)});
      });
      await page.goto('http://127.0.0.1:39176/?debug',{waitUntil:'load',timeout:60000});
      await page.locator('#btn-start').click();
      await page.locator('#btn-go').click({force:true});
      await page.waitForTimeout(1450);
      const staged=await page.evaluate(({weapon,character,yaw})=>{
        const qa=window.__sl.characterQA,player=window.__sl.P;
        const op=qa.operators().find(x=>x.id===character);
        if(!op) throw new Error('Character variant missing: '+character);
        player.x=0;player.z=36;player.yaw=0;player.pitch=0;
        window.__sl.bots().forEach(x=>{if(x.g)x.g.visible=false;});
        window.__sl.mates().forEach(x=>{if(x.g)x.g.visible=false;});
        qa.hideLocalViewModel();
        const previewZ=player.z-1.9,u=qa.makeUnit(player.x,previewZ,op);
        u.g.position.set(player.x,0,previewZ);u.g.rotation.y=yaw;u.yaw=yaw;
        qa.ensureWorldWeapon(u,weapon);qa.poseWorldArms(u);u.g.updateMatrixWorld(true);
        return {weapon,character,yaw,weaponKey:u.worldKey,arms:!!(u.armR&&u.armL),worldGun:!!u.worldGun,
          armContact:{rightGripSource:qa.weaponMeta()[weapon]?.rightGripSource||(qa.weaponProfiles()[weapon]?.anchor==='authored-grip'?'profile-authored':null),
            supportGripSource:qa.weaponMeta()[weapon]?.leftGripSource||(qa.weaponProfiles()[weapon]?.anchor==='authored-grip'?'profile-authored':null)}};
      },pose);
      await page.waitForTimeout(180);
      const screenshot=path.join(out,pose.name+'.png');
      await page.screenshot({path:screenshot,fullPage:false});
      const handsClose=path.join(out,pose.name+'-hands-close.png');
      await page.screenshot({path:handsClose,clip:{x:420,y:295,width:460,height:320}});
      results.push({...staged,screenshot,handsClose});
      await page.close();
    }
  } finally { await browser.close(); }
  const report={method:'Actual Sightline WebGL game scene in isolated Chromium/SwiftShader; active Claude v12.8 character builder and actual third-person weapon mesh; test-only staging pose.',screenshots:results,errors,
    limits:['Static pose evidence does not verify every animation transition.', 'SwiftShader is software rendering, not an Android GPU.', 'The rig rotates/scales baked arm meshes; it does not provide articulated finger joints or an authored inverse-kinematics skeleton.']};
  fs.writeFileSync(path.join(out,'visual-review.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  process.exitCode=errors.length?1:0;
})().catch(error=>{console.error(error.stack);process.exitCode=1;});

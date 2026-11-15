/* Isolated, test-only WebGL camera focused on real Sightline weapon/hand contact. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const out = process.env.SIGHTLINE_EVIDENCE_DIR || path.join(root, 'evidence', 'hand-grip-articulation-20261026', 'contact-camera');
const sourceHtml = path.join(assets, 'index.html');
fs.mkdirSync(out, { recursive: true });
function type(file) { return ({'.js':'application/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.css':'text/css'})[path.extname(file).toLowerCase()] || 'application/octet-stream'; }
(async () => {
  const browser = await chromium.launch({ executablePath:process.env.SIGHTLINE_CHROME, headless:true, args:['--no-sandbox','--disable-background-timer-throttling','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'] });
  const results=[], errors=[];
  try {
    for (const pose of [
      {weapon:'pistol',character:'riptide',yaw:Math.PI/2,name:'pistol-trigger-profile'},
      {weapon:'rook117',character:'ashfall',yaw:Math.PI/2,name:'rook117-support-profile'},
      {weapon:'breacher',character:'squall',yaw:Math.PI/2,name:'breacher-support-profile'},
      {weapon:'scatter',character:'skerry',yaw:Math.PI/2,name:'scatter-support-profile'}
    ]) {
      const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
      page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.route('http://127.0.0.1:39176/**',async route=>{
        if(route.request().isNavigationRequest()){
          let html=fs.readFileSync(sourceHtml,'utf8');
          const marker='if (/[?&]debug\\b/.test(location.search)) window.__sl'; if(!html.includes(marker))throw Error('Debug API missing'); html=html.replace(marker,'if (true) window.__sl');
          const api='characterQA: { buildRig:'; if(!html.includes(api))throw Error('QA API missing');
          html=html.replace(api,'characterQA: { makeUnit:makeUnit,weaponMeta:function(){return WORLD_WEAPON_META;},weaponProfiles:function(){return WORLD_WEAPON_PRESENTATION;},hideLocalViewModel:function(){qaHideFPViewmodel=true;Object.keys(guns).forEach(function(k){if(guns[k])guns[k].visible=false;});},buildRig:');
          return route.fulfill({contentType:'text/html',body:html});
        }
        const rel=decodeURIComponent(new URL(route.request().url()).pathname.slice(1)); if(!rel||rel.includes('..'))return route.fulfill({status:404,body:'Not found'});
        const file=path.resolve(assets,rel); if(!file.startsWith(path.resolve(assets)+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
        return route.fulfill({status:200,contentType:type(file),body:fs.readFileSync(file)});
      });
      await page.goto('http://127.0.0.1:39176/?debug',{waitUntil:'load',timeout:60000}); await page.locator('#btn-start').click(); await page.locator('#btn-go').click({force:true}); await page.waitForTimeout(1200);
      const detail=await page.evaluate(({weapon,character,yaw})=>{
        const qa=window.__sl.characterQA,p=window.__sl.P,op=qa.operators().find(x=>x.id===character); p.x=0;p.z=36;p.yaw=0;p.pitch=0;
        window.__sl.bots().forEach(x=>{if(x.g)x.g.visible=false;});window.__sl.mates().forEach(x=>{if(x.g)x.g.visible=false;});qa.hideLocalViewModel();
        const z=p.z-.9,u=qa.makeUnit(0,z,op);u.g.position.set(0,0,z);u.g.rotation.y=yaw;u.yaw=yaw;qa.ensureWorldWeapon(u,weapon);qa.poseWorldArms(u);u.g.updateMatrixWorld(true);u.worldGun.updateMatrixWorld(true);
        // Diagnostic-only: remove torso/legs from the inspection view so the
        // actual arm, hand, and gun contact is not hidden behind the chest.
        if(u.body)u.body.visible=false;if(u.legs)u.legs.visible=false;if(u.legR)u.legR.visible=false;
        const m=qa.weaponMeta()[weapon],profile=qa.weaponProfiles()[weapon],ro=m&&m.rightGrip||profile&&profile.rightGrip||[0,0,0],lo=m&&m.leftGrip||profile&&profile.leftGrip||[0,0,-.29];
        const r=u.worldGun.localToWorld(new THREE.Vector3(ro[0],ro[1],ro[2])),l=u.worldGun.localToWorld(new THREE.Vector3(lo[0],lo[1],lo[2])),target=r.clone().add(l).multiplyScalar(.5);
        const skinned=[];[u.handRigR,u.handRigL].forEach(function(h){if(h)h.traverse(function(o){if(o.isSkinnedMesh)skinned.push({materialSkinning:!!o.material.skinning,bones:o.skeleton.bones.length,vertices:o.geometry.attributes.position.count});});});
        return {weapon,character,grips:{right:r.toArray(),left:l.toArray()},cameraTarget:target.toArray(),hands:!!(u.handRigR&&u.handRigL),fingerJoints:u.handRigR&&u.handRigR.userData.fingerBoneCount,skinned};
      },pose);
      await page.waitForTimeout(250);const screenshot=path.join(out,pose.name+'.png');await page.screenshot({path:screenshot,fullPage:false});results.push({...detail,screenshot});await page.close();
    }
  } finally { await browser.close(); }
  const report={method:'Playable Sightline scene, actual world weapon geometry, Claude v12.8 characters and isolated headless Three.js r128/WebGL renderer; test camera focuses the computed grip points.',errors,results,limits:['This is a staged static inspection camera, not an animation or physical-device test.','SwiftShader is software rendering.']};
  fs.writeFileSync(path.join(out,'contact-camera-review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({errors,results},null,2));process.exitCode=errors.length?1:0;
})().catch(e=>{console.error(e.stack);process.exitCode=1;});

/* Isolated real-game screenshots and control checks for first-person character materials. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const assets = path.resolve(process.env.SIGHTLINE_FP_ASSET_ROOT || path.join(root, 'AndroidProject/app/src/main/assets/phone-host'));
const overrideIndex = process.env.SIGHTLINE_FP_INDEX_OVERRIDE || '';
const mode = process.argv[2] || 'before';
const out = path.join(root, 'evidence', 'firstperson-character', mode);
fs.mkdirSync(out, { recursive: true });

const injected = String.raw`
window.__fpCharacterQA={
 select:function(id){setOp(id);renderOps();},
 snapshot:function(){var group=guns[cur],sleeves=[],gloves=[],meshes=0,triangles=0;if(group)group.traverse(function(n){if(!n.isMesh)return;meshes++;if(n.geometry&&n.geometry.index)triangles+=n.geometry.index.count/3;else if(n.geometry&&n.geometry.attributes.position)triangles+=n.geometry.attributes.position.count/3;var mats=Array.isArray(n.material)?n.material:[n.material];mats.forEach(function(m){if(!m)return;var part=(m.userData&&m.userData.sightlineFPArmPart)||(n.userData&&n.userData.sightlineFPArmPart);if(part==='sleeve')sleeves.push({color:m.color&&m.color.getHexString(),map:!!m.map,tag:part});if(part==='glove')gloves.push({color:m.color&&m.color.getHexString(),map:!!m.map,tag:part});});});var arm=group&&group.userData.sightlineFPArmMaterials;return{id:ME.id,team:ME.team,state:state,alive:P.alive,weapon:cur,appearanceId:group&&group.userData.sightlineFPCharacterId,faction:group&&group.userData.sightlineFPFaction,camo:group&&group.userData.sightlineFPCamo,sleevePalette:group&&group.userData.sightlineFPSleevePalette,gloveColor:group&&group.userData.sightlineFPGloveColor,sleeveMaterials:sleeves,gloveMaterials:gloves,armMaterials:!!arm,scoped:!!scoped,reloading:reloading,ammo:ammo[cur]&&{mag:ammo[cur].mag,res:ammo[cur].res},position:{x:P.x,z:P.z},visible:!!(group&&group.visible),meshCount:meshes,triangles:triangles,drawCalls:renderer&&renderer.info&&renderer.info.render&&renderer.info.render.calls};},
 move:function(){var before={x:P.x,z:P.z},code=(BIND.fwd&&BIND.fwd[0])||'KeyW';inputEvent(code,true);for(var i=0;i<30;i++)updatePlayer(1/60);inputEvent(code,false);for(var j=0;j<4;j++)updatePlayer(1/60);return{distance:Math.hypot(P.x-before.x,P.z-before.z),alive:P.alive};},
 reload:function(){if(ammo[cur])ammo[cur].mag=1;act('reload',true);return window.__fpCharacterQA.snapshot();},
 switchCharacter:function(id){var other=id==='riptide'?'ashfall':'riptide';setOp(other);var changed=window.__fpCharacterQA.snapshot();setOp(id);return{changed:changed,restored:window.__fpCharacterQA.snapshot()};},
 switchWeapon:function(k){owned[k]=true;ammo[k]=ammo[k]||{mag:WEAPONS[k].mag,res:WEAPONS[k].reserve};setWeapon(k);return window.__fpCharacterQA.snapshot();}
};`;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SIGHTLINE_CHROMIUM_EXECUTABLE || undefined, args: ['--disable-background-timer-throttling', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const results = { mode, renderer: 'Sightline V3 offline game renderer in isolated Chromium/SwiftShader', characters: [], pageErrors: [], failedRequests: [] };
  try {
    for (const id of ['riptide', 'ashfall']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on('pageerror', e => results.pageErrors.push(e.message));
      page.on('requestfailed', r => results.failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
      await page.route('http://127.0.0.1:39175/**', async route => {
        if (route.request().isNavigationRequest()) {
          const html = fs.readFileSync(overrideIndex || path.join(assets, 'index.html'), 'utf8');
          const marker = 'if (/[?&]debug\\b/.test(location.search)) window.__sl';
          if (!html.includes(marker)) throw new Error('QA injection anchor missing');
          return route.fulfill({ contentType: 'text/html', body: html.replace(marker, injected + '\n' + marker) });
        }
        const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
        const file = path.resolve(assets, rel);
        if (!rel || rel.includes('..') || !file.startsWith(path.resolve(assets) + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Not found' });
        const ext = path.extname(file).toLowerCase();
        const type = ext === '.js' ? 'application/javascript' : ext === '.json' ? 'application/json' : ext === '.png' ? 'image/png' : ext === '.css' ? 'text/css' : 'application/octet-stream';
        return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
      });
      const response = await page.goto('http://127.0.0.1:39175/?debug', { waitUntil: 'load', timeout: 45000 });
      await page.evaluate(id => window.__fpCharacterQA.select(id), id);
      const characterSwitch = await page.evaluate(id => window.__fpCharacterQA.switchCharacter(id), id);
      await page.locator('#btn-start').click();
      await page.locator('#btn-go').click({ force: true });
      await page.waitForTimeout(350);
      const before = await page.evaluate(() => window.__fpCharacterQA.snapshot());
      const prefix = path.join(out, id);
      await page.screenshot({ path: prefix + '-hip.png' });
      let actions = null;
      if (mode === 'after') {
        const movement = await page.evaluate(() => window.__fpCharacterQA.move()); await page.waitForTimeout(180);
        await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); await page.waitForTimeout(150);
        const ads = await page.evaluate(() => window.__fpCharacterQA.snapshot());
        await page.screenshot({ path: prefix + '-ads.png' }); await page.mouse.up({ button: 'right' });
        const reload = await page.evaluate(() => window.__fpCharacterQA.reload()); await page.waitForTimeout(120);
        await page.screenshot({ path: prefix + '-reload.png' });
        const switched = await page.evaluate(() => window.__fpCharacterQA.switchWeapon('carbine'));
        actions = { ads, reload, switched, movementDistance: movement.distance, movementAlive:movement.alive };
      }
      results.characters.push({ id, httpStatus: response?.status(), before, characterSwitch, actions });
      await context.close();
    }
  } finally { await browser.close(); }
  results.pass = results.characters.length === 2 && results.characters.every(c => c.httpStatus === 200 && c.before.visible) && !results.pageErrors.length && !results.failedRequests.length;
  if (mode === 'after') results.pass = results.pass && results.characters.every(c => c.before.appearanceId===c.id && c.before.armMaterials && c.before.sleeveMaterials.length>0 && c.before.sleeveMaterials.every(m=>m.map) && c.before.gloveMaterials.length>0 && c.characterSwitch.changed.appearanceId!==c.id && c.characterSwitch.restored.appearanceId===c.id && c.actions.ads.scoped && c.actions.reload.reloading > 0 && c.actions.switched.weapon === 'carbine' && c.actions.switched.appearanceId===c.id && c.actions.switched.sleeveMaterials.length>0 && c.actions.switched.sleeveMaterials.every(m=>m.map) && c.actions.switched.gloveMaterials.length>0 && c.actions.movementAlive && c.actions.movementDistance > .01);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  process.exitCode = results.pass ? 0 : 1;
})().catch(e => { console.error(e.stack); process.exitCode = 1; });

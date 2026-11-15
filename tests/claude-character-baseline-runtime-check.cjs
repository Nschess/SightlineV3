/* Isolated gameplay verification for the frozen Claude character baseline.
   Runs the actual offline game and renderer in Chromium/SwiftShader; no LAN socket. */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'AndroidProject', 'app', 'src', 'main', 'assets', 'phone-host');
const out = path.join(root, 'evidence', 'claude-restore');
fs.mkdirSync(out, { recursive: true });

const injected = String.raw`
window.__claudeFreezeQA = {
 configure:function(){R.mode='tactical';R.bots=2;R.mates=-1;},
 player:function(){var v=guns[cur],g=v&&v.userData,a=ammo[cur]||{};return{state:state,weapon:cur,scoped:!!scoped,reloading:reloading,ammo:{mag:a.mag,res:a.res},player:{x:P.x,y:P.y,z:P.z},viewModelVisible:!!(v&&v.visible),handGroups:g?{left:!!g.left,mag:!!g.mag,fresh:!!g.fresh,charging:!!g.ch}:null};},
 actors:function(){return bots.map(function(u){poseWorldArms(u);var meta=WORLD_WEAPON_META[u.worldKey]||{},prof=WORLD_WEAPON_PRESENTATION[u.worldKey]||{};function dirDot(arm,shoulder,defaultDir,offset){if(!arm||!u.worldGun)return null;var grip=Array.isArray(offset)?offset:[0,0,0],target=new THREE.Vector3(grip[0],grip[1],grip[2]).applyQuaternion(u.worldGun.quaternion).add(u.worldGun.position),actual=defaultDir.clone().normalize().applyQuaternion(arm.quaternion),expected=target.clone().sub(shoulder).normalize();return actual.dot(expected);}var rg=meta.rightGrip||prof.rightGrip||[0,0,0],lg=meta.leftGrip||prof.leftGrip||WORLD_DEFAULT_LEFT_GRIP;return{id:u.op.id,name:u.op.name,x:u.x,z:u.z,phase:u.phase,weapon:u.worldKey,gunVisible:!!(u.worldGun&&u.worldGun.visible),rightArm:!!u.armR,leftArm:!!u.armL,rightGripDot:dirDot(u.armR,u.armRShoulder||WORLD_RIGHT_SHOULDER,u.armRDefaultDir||WORLD_RIGHT_DEFAULT_DIR,rg),leftGripDot:dirDot(u.armL,u.armLShoulder||WORLD_LEFT_SHOULDER,u.armLDefaultDir||WORLD_LEFT_DEFAULT_DIR,lg),rightArmQuat:[u.armR.quaternion.x,u.armR.quaternion.y,u.armR.quaternion.z,u.armR.quaternion.w],leftArmQuat:[u.armL.quaternion.x,u.armL.quaternion.y,u.armL.quaternion.z,u.armL.quaternion.w],gunPosition:[u.worldGun.position.x,u.worldGun.position.y,u.worldGun.position.z],gunRotation:[u.worldGun.rotation.x,u.worldGun.rotation.y,u.worldGun.rotation.z]};});}
};`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.SIGHTLINE_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--disable-background-timer-throttling', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [], failedRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
  try {
    await page.route('http://127.0.0.1:39174/**', async route => {
      if (route.request().isNavigationRequest()) {
        const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
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

    const response = await page.goto('http://127.0.0.1:39174/?debug', { waitUntil: 'load', timeout: 45000 });
    await page.evaluate(() => window.__claudeFreezeQA.configure());
    await page.locator('#btn-start').click();
    await page.locator('#btn-go').click({ force: true });
    await page.waitForTimeout(1500);
    const liveStart = await page.evaluate(() => ({ player: window.__claudeFreezeQA.player(), actors: window.__claudeFreezeQA.actors() }));
    const firstPersonImage = path.join(out, 'live-game-first-person.png');
    await page.screenshot({ path: firstPersonImage, fullPage: false });

    await page.keyboard.down('w');
    await page.waitForTimeout(900);
    await page.keyboard.up('w');
    await page.waitForTimeout(900);
    const moving = await page.evaluate(() => ({ player: window.__claudeFreezeQA.player(), actors: window.__claudeFreezeQA.actors() }));
    await page.mouse.move(640, 360);
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(250);
    const ads = await page.evaluate(() => window.__claudeFreezeQA.player());
    const adsImage = path.join(out, 'live-game-first-person-ads.png');
    await page.screenshot({ path: adsImage, fullPage: false });
    await page.mouse.up({ button: 'right' });
    await page.mouse.click(640, 360, { button: 'left' });
    await page.waitForTimeout(100);
    await page.locator('#tb-rel').evaluate(el => el.click());
    await page.waitForTimeout(350);
    const reload = await page.evaluate(() => window.__claudeFreezeQA.player());
    const reloadImage = path.join(out, 'live-game-first-person-reload.png');
    await page.screenshot({ path: reloadImage, fullPage: false });

    const actors = moving.actors;
    const gripsOk = actors.length > 0 && actors.every(a => a.gunVisible && a.rightArm && a.leftArm && Number.isFinite(a.rightGripDot) && Number.isFinite(a.leftGripDot) && a.rightGripDot > 0.995 && a.leftGripDot > 0.995);
    const playerMoved = Math.hypot(moving.player.player.x - liveStart.player.player.x, moving.player.player.z - liveStart.player.player.z) > 0.01;
    const actorDeltas = actors.map((b, i) => { const a = liveStart.actors[i]; if (!a) return { id: b.id, missingStart: true }; const qdiff = (x, y) => Math.max(...x.map((v, n) => Math.abs(v - y[n]))); return { id: b.id, positionMeters: Math.hypot(a.x - b.x, a.z - b.z), gaitPhaseRadians: Math.abs(a.phase - b.phase), rightArmQuaternionMaxDelta: qdiff(a.rightArmQuat, b.rightArmQuat), leftArmQuaternionMaxDelta: qdiff(a.leftArmQuat, b.leftArmQuat) }; });
    const actorMoved = actorDeltas.some(d => d.positionMeters > 0.01 || d.gaitPhaseRadians > 0.01);
    const livePoseChanged = actorDeltas.some(d => d.rightArmQuaternionMaxDelta > 0.001 || d.leftArmQuaternionMaxDelta > 0.001);
    const reloadStarted = reload.reloading > 0 && reload.ammo.mag < liveStart.player.ammo.mag;
    const firstPersonViewmodelOk = liveStart.player.viewModelVisible && liveStart.player.handGroups?.left && liveStart.player.handGroups?.mag;
    const result = {
      pass: !!response?.ok() && liveStart.player.state === 'live' && actors.length === 2 && gripsOk && playerMoved && actorMoved && livePoseChanged && ads.scoped && reloadStarted && firstPersonViewmodelOk && errors.length === 0,
      renderer: 'Actual offline Sightline game and WebGL renderer in isolated Chromium/SwiftShader; source requests served from candidate files without opening a network socket',
      responseStatus: response?.status(),
      player: { start: liveStart.player, afterMovement: moving.player, ads: ads, reload: reload, moved: playerMoved, adsInputPassed: !!ads.scoped, reloadInputAndAnimationPassed: reloadStarted, firstPersonViewmodelPresent: firstPersonViewmodelOk },
      thirdPersonActors: { count: actors.length, movementOrAnimationChanged: actorMoved, armPoseChangedDuringLiveUpdate: livePoseChanged, actorDeltas: actorDeltas, actors: actors, gripAlignment: gripsOk ? 'PASS: actual right/left arm pose vectors align with the selected weapon grip targets (dot > .995)' : 'FAIL' },
      errors, failedRequests, screenshots: [firstPersonImage, adsImage, reloadImage],
      limitations: ['SwiftShader is a software renderer, not a hardware GPU.', 'This check exercises live offline bot animation and pose-driven grips; it does not prove LAN synchronization or physical-device animation performance.']
    };
    fs.writeFileSync(path.join(out, 'runtime-acceptance.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.pass ? 0 : 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

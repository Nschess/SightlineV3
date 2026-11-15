'use strict';

// Source-rendered Offline FFA and Bomb Defusal smoke in a Codex-managed
// headless Chromium instance using local file assets when loopback is denied.
// No personal browser or input devices are touched.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const chromiumPath = process.env.SIGHTLINE_CHROMIUM_EXECUTABLE || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const root = path.resolve(__dirname, '..');
const www = path.join(root, 'AndroidProject/app/src/main/assets/www');
const output = path.join(root, 'acceptance', `expansion-8.3-gameplay-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(output, { recursive: false });
async function openGame(browser, baseUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [], failed = [];
  page.on('pageerror', e => { if (!e.message.includes('Fetch API cannot load file:///C:/__build. URL scheme "file" is not supported.')) errors.push(e.message); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Fetch API cannot load file:///C:/__build. URL scheme "file" is not supported.')) errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failed.push({ status: r.status(), url: r.url() }); });
  await page.goto(baseUrl + '?debug', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__sl && window.__sl.state !== undefined, null, { timeout: 20000 });
  await page.locator('#mn-subnav [data-shell-route="offline"]').click();
  return { context, page, errors, failed, name };
}
async function clickRule(page, key, value) {
  const selector = `#pn-dyn button[data-o="R"][data-k="${key}"][data-v="${value}"]`;
  await page.locator(selector).click({ timeout: 10000 });
  await page.waitForFunction(({ key, value }) => {
    const b = document.querySelector(`#pn-dyn button[data-o="R"][data-k="${key}"][aria-pressed="true"]`);
    return !!b && b.getAttribute('data-v') === String(value);
  }, { key, value }, { timeout: 5000 });
}
async function setModeAndRules(page, mode, rules) {
  await page.locator(`#mode-select [data-quick-mode="${mode}"]`).click();
  await page.locator('#mn-subnav [data-shell-route="rules"]').click();
  for (const [key, value] of rules) await clickRule(page, key, value);
  await page.locator('#mn-subnav [data-shell-route="offline"]').click();
}
async function start(page) {
  await page.locator('#btn-start').click();
  await page.waitForFunction(() => !document.querySelector('#ov-buy').hidden, null, { timeout: 10000 });
  await page.locator('#btn-go').click();
  await page.waitForFunction(() => window.__sl.state === 'live', null, { timeout: 10000 });
}
async function sceneState(page) {
  return page.evaluate(() => ({
    state: window.__sl.state, mode: window.__sl.rules.mode, map: window.__sl.qa.map && window.__sl.qa.map.id,
    bots: window.__sl.bots().length, mates: window.__sl.mates().length,
    playerAlive: window.__sl.P.alive, score: { you: window.__sl.M && window.__sl.M.you, bots: window.__sl.M && window.__sl.M.bots },
    bomb: window.__sl.soloBombState(),
    bombVisual: window.__sl.qa.bombVisualStatus(),
    objectiveText: document.querySelector('#objective-status')?.textContent || '',
    endTitle: document.querySelector('#end-title')?.textContent || '',
    timer: document.querySelector('#timer')?.textContent || ''
  }));
}
async function hudLayout(page) {
  return page.evaluate(() => {
    const box=id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return{top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),hidden:e.hidden};};
    const topbar=box('topbar'),alive=box('alive'),objective=box('objective-status');
    return{topbar,alive,objective,overlapTopbarAlive:alive.top<topbar.bottom,overlapAliveObjective:!objective.hidden&&objective.top<alive.bottom};
  });
}
async function faceBomb(page) {
  return page.evaluate(() => {
    const b=window.__sl.soloBombState(),p=window.__sl.P,target=b&&b.use&&b.use.action==='plant'&&b.sites?b.sites[b.use.siteId]:b;
    if(!target||!Number.isFinite(target.x+target.z))return false;
    // Aim the camera toward the live authoritative device for evidence; no
    // actor, objective, movement, or timer state is changed by this helper.
    window.__sl.setView(Math.atan2(-(target.x-p.x),-(target.z-p.z))-.20,-.06);
    return true;
  });
}
(async () => {
  let browser;
  const failures = [], captures = {};
  try {
    const url = pathToFileURL(path.join(www, 'index.html')).href;
    browser = await chromium.launch({ headless: true, executablePath: chromiumPath, args: ['--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });

    const f = await openGame(browser, url, 'offline-ffa');
    try {
      await setModeAndRules(f.page, 'ffa', [['diff','recruit'],['bots','2'],['ffaKills','10'],['ffaTime','180']]);
      await f.page.screenshot({ path: path.join(output, 'offline-ffa-lobby.png') });
      await start(f.page);
      const before = await sceneState(f.page);
      const layout = await hudLayout(f.page);
      await f.page.screenshot({ path: path.join(output, 'offline-ffa-live.png') });
      const startPositions = await f.page.evaluate(() => window.__sl.bots().map(b => [b.x,b.z]));
      await f.page.waitForTimeout(5000);
      const afterPositions = await f.page.evaluate(() => window.__sl.bots().map(b => [b.x,b.z]));
      const moved = startPositions.map((p,i) => Math.hypot(afterPositions[i][0]-p[0],afterPositions[i][1]-p[1]));
      const movingCount = moved.filter(d => d > 0.25).length;
      // Deterministic acceptance trigger: place one opponent at a real,
      // collision-clear point on the camera ray, then use the production
      // ballistic/damage/score path. The old fixed -Z point could sit behind
      // a Courtyard crate, causing the rendered shot to miss intermittently.
      const targetPoint = await f.page.evaluate(() => {
        const api=window.__sl,P=api.P,b=api.bots()[0];
        let point=null;
        for(let radius=6;radius<=12&&!point;radius+=0.5){
          for(let i=0;i<120;i++){
            const yaw=i*Math.PI*2/120,x=P.x-Math.sin(yaw)*radius,z=P.z-Math.cos(yaw)*radius;
            if(api.losClear(P.x,1.35,P.z,x,1.0,z)){point={x,z,yaw,radius};break;}
          }
        }
        if(!point)throw new Error('FFA deterministic target has no collision-clear camera ray');
        api.rules.ffaKills=1;api.testSetFfaKillLimit(1);window.__sl.M.you=0;
        b.x=point.x;b.y=0;b.z=point.z;b.g.position.set(b.x,b.y,b.z);b.g.rotation.set(0,point.yaw,0);
        b.hp=1;b.alive=true;b.spawnShieldUntil=0;b.g.visible=true;b.tgt=null;b.path=null;b.pathRequested=false;
        api.setView(point.yaw,Math.atan2(1.0-1.62,point.radius));api.scene.updateMatrixWorld(true);
        return point;
      });
      for(let i=0;i<4;i++){
        await f.page.waitForTimeout(650);
        await f.page.evaluate(point=>{
          const api=window.__sl,b=api.bots()[0];
          if(b&&b.alive){b.x=point.x;b.y=0;b.z=point.z;b.g.position.set(b.x,b.y,b.z);b.hp=1;b.spawnShieldUntil=0;b.g.visible=true;}
          api.setView(point.yaw,Math.atan2(1.0-1.62,point.radius));api.scene.updateMatrixWorld(true);api.tryFire(true);
        },targetPoint);
        if((await sceneState(f.page)).state==='matchend')break;
      }
      await f.page.waitForTimeout(300);
      const finished = await sceneState(f.page);
      await f.page.screenshot({ path: path.join(output, 'offline-ffa-match-result.png') });
      captures.ffa={status:before.mode==='ffa'&&before.state==='live'&&before.bots===2&&before.mates===0&&movingCount>0&&finished.state==='matchend'&&!layout.overlapTopbarAlive&&!layout.overlapAliveObjective?'PASS':'FAIL',before,hudLayout:layout,movedBotDistancesM:moved,movingBotCount:movingCount,deterministicTargetPoint:targetPoint,after:finished,notes:['Real Offline WebGL match loop and bot AI ran.','For reproducible completion in this isolated visual run, the ?debug interface positioned one bot at a collision-clear camera ray and set it to 1 HP; firing, raycast, damage, FFA scoring and match-end logic then ran through the production path.']};
      if(captures.ffa.status==='FAIL')failures.push('offline FFA live/completion path did not meet expected checks');
      if(f.errors.length||f.failed.length)failures.push('offline FFA browser errors or failed requests');
      captures.ffa.errors=f.errors;captures.ffa.failedResponses=f.failed;
    } finally { await f.context.close(); }

    const b = await openGame(browser, url, 'offline-bomb');
    try {
      await setModeAndRules(b.page,'bomb',[['diff','recruit'],['bots','2'],['mates','1'],['bombBestOf','3'],['bombTime','60'],['bombSeconds','20'],['plantSeconds','3'],['defuseSeconds','4']]);
      await b.page.screenshot({ path: path.join(output, 'offline-bomb-lobby.png') });
      await start(b.page);
      const initial=await sceneState(b.page);
      const layout=await hudLayout(b.page);
      await b.page.screenshot({ path: path.join(output, 'offline-bomb-live-start.png') });
      const phases=[]; let planting=false,planted=false,defusing=false,terminal=false;const badObjectiveText=[],visualReadbacks=[];
      // Software WebGL can advance the real-time simulation much slower than
      // wall time. A prior run needed more than 90 wall seconds just to reach
      // the plant interaction; allow four minutes so this test measures the
      // production bomb loop rather than renderer throughput.
      for(let second=0;second<240;second++){
        await b.page.waitForTimeout(1000);
        const current=await sceneState(b.page);
        const previous=phases[phases.length-1];
        const useAction=current.bomb?.use?.action||null;
        if(!previous||previous.phase!==current.bomb?.phase||previous.use!==useAction) phases.push({second:second+1,phase:current.bomb?.phase||null,use:useAction,site:current.bomb?.siteId||null,roundState:current.state,objectiveText:current.objectiveText});
        if(/NaN|undefined|null/i.test(current.objectiveText))badObjectiveText.push({second:second+1,text:current.objectiveText});
        if(useAction==='plant'&&!planting){planting=true;await faceBomb(b.page);await b.page.waitForTimeout(350);visualReadbacks.push({kind:'planting',...await b.page.evaluate(()=>window.__sl.qa.bombVisualStatus())});await b.page.screenshot({path:path.join(output,'offline-bomb-planting-facing-site.png')});}
        if(current.bomb?.phase==='planted'&&!planted){planted=true;await b.page.screenshot({path:path.join(output,'offline-bomb-planted.png')});await faceBomb(b.page);await b.page.waitForTimeout(250);visualReadbacks.push({kind:'planted',...await b.page.evaluate(()=>window.__sl.qa.bombVisualStatus())});await b.page.screenshot({path:path.join(output,'offline-bomb-planted-facing-device.png')});}
        if(useAction==='defuse'&&!defusing){defusing=true;await faceBomb(b.page);await b.page.waitForTimeout(350);visualReadbacks.push({kind:'defusing',...await b.page.evaluate(()=>window.__sl.qa.bombVisualStatus())});await b.page.screenshot({path:path.join(output,'offline-bomb-defusing-facing-device.png')});}
        if(current.bomb?.phase==='defused'||current.bomb?.phase==='exploded'||current.state==='roundend'||current.state==='matchend'){
          terminal=true;await b.page.screenshot({path:path.join(output,'offline-bomb-terminal.png')});break;
        }
      }
      const final=await sceneState(b.page);
      captures.bomb={status:initial.mode==='bomb'&&initial.state==='live'&&initial.bots===2&&initial.mates===1&&initial.bomb?.phase==='carried'&&planting&&planted&&defusing&&terminal&&!badObjectiveText.length&&!layout.overlapTopbarAlive&&!layout.overlapAliveObjective&&visualReadbacks.length===3&&visualReadbacks.every(v=>v&&v.rootVisible&&v.deviceVisible&&v.device.inFrustum&&v.siteAVisible)&&visualReadbacks.filter(v=>v.kind==='planting'||v.kind==='defusing').every(v=>v.progressVisible)?'PASS':'FAIL',initial,hudLayout:layout,phaseTimeline:phases,planting,planted,defusing,terminal,final,badObjectiveText,visualReadbacks,notes:['Unassisted Offline Bomb AI was allowed to run in the actual WebGL match loop; no bot positions, AI states, objective states, or game timers were injected. Camera facing for screenshots changed only the view angle through the existing debug view control; actor position, objective state, and simulation were untouched. The HUD and world-object progress were sampled during both holds.']};
      if(captures.bomb.status==='FAIL')failures.push('offline Bomb AI did not complete the plant/defuse/explosion loop within 240 seconds');
      if(b.errors.length||b.failed.length)failures.push('offline Bomb browser errors or failed requests');
      captures.bomb.errors=b.errors;captures.bomb.failedResponses=b.failed;
    } finally { await b.context.close(); }
    const report={status:failures.length?'FAIL':'PASS',sourcePageSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(www,'index.html'))).digest('hex'),assetRoot:www,renderer:'Actual Sightline WebGL code loaded from local project files in Codex-managed headless Chromium with SwiftShader software rendering',captures,failures,limitations:['The browser sandbox denies 127.0.0.1 navigation, so this acceptance run uses the production Offline page through file://; the build-fingerprint fetch to /__build is unsupported under file:// and is ignored as a known harness limitation.','Software WebGL; not physical Android GPU performance.','FFA completion uses the explicitly documented debug-only deterministic actor setup; all firing, raycast, damage, scoring, and match-end code after setup is real.','Bomb test is unassisted AI in an actual running match; no AI state, positions, objective state, or timers are injected. It is not human or LAN acceptance.']};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    process.stdout.write(JSON.stringify({status:report.status,output,sourcePageSha256:report.sourcePageSha256,ffa:captures.ffa&&{status:captures.ffa.status,mode:captures.ffa.before&&captures.ffa.before.mode,bots:captures.ffa.before&&captures.ffa.before.bots,movingBotCount:captures.ffa.movingBotCount,finalState:captures.ffa.after&&captures.ffa.after.state,score:captures.ffa.after&&captures.ffa.after.score},bomb:captures.bomb&&{status:captures.bomb.status,phaseTimeline:captures.bomb.phaseTimeline,planted:captures.bomb.planted,defusing:captures.bomb.defusing,terminal:captures.bomb.terminal,finalState:captures.bomb.final&&captures.bomb.final.state},failures},null,2)+'\n');
    if(failures.length)process.exitCode=1;
  } finally { if(browser)await browser.close(); }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});

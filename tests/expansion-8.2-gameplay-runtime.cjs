'use strict';

// Source-rendered Offline FFA and Bomb Defusal smoke in a Codex-managed
// headless Chromium instance. Uses only 127.0.0.1 and an isolated browser
// context; no personal browser or input devices are touched.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const chromiumPath = process.env.SIGHTLINE_CHROMIUM_EXECUTABLE || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const { createOfflineServer } = require('../tools/offline-static-server.cjs');
const root = path.resolve(__dirname, '..');
const www = path.join(root, 'AndroidProject/app/src/main/assets/www');
const output = path.join(root, 'acceptance', `expansion-8.2-gameplay-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(output, { recursive: false });
function listen(server) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server.address().port); }); }); }
async function openGame(browser, baseUrl, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [], failed = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
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
(async () => {
  let browser, server;
  const failures = [], captures = {};
  try {
    server = createOfflineServer(www); const port = await listen(server); const url = `http://127.0.0.1:${port}/`;
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
      // Deterministic acceptance trigger: set one opponent to a valid lethal
      // state in this debug-only run, then use the real player ballistic path.
      await f.page.evaluate(() => {
        const P=window.__sl.P, b=window.__sl.bots()[0];
        window.__sl.rules.ffaKills=1;window.__sl.testSetFfaKillLimit(1); b.x=P.x; b.y=0; b.z=P.z-5; b.g.position.set(b.x,b.y,b.z); b.hp=1; b.alive=true; b.g.visible=true;
        P.yaw=0;P.pitch=0;window.__sl.M.you=0;window.__sl.setView(0,0);window.__sl.scene.updateMatrixWorld(true);
      });
      for(let i=0;i<4;i++){
        await f.page.waitForTimeout(650);
        await f.page.evaluate(()=>{window.__sl.setView(0,0);window.__sl.scene.updateMatrixWorld(true);window.__sl.tryFire(true);});
        if((await sceneState(f.page)).state==='matchend')break;
      }
      await f.page.waitForTimeout(300);
      const finished = await sceneState(f.page);
      await f.page.screenshot({ path: path.join(output, 'offline-ffa-match-result.png') });
      captures.ffa={status:before.mode==='ffa'&&before.state==='live'&&before.bots===2&&before.mates===0&&movingCount>0&&finished.state==='matchend'&&!layout.overlapTopbarAlive&&!layout.overlapAliveObjective?'PASS':'FAIL',before,hudLayout:layout,movedBotDistancesM:moved,movingBotCount:movingCount,after:finished,notes:['Real Offline WebGL match loop and bot AI ran.','To make the completion deterministic, one bot was placed in the firing lane and reduced to 1 HP using the ?debug runtime interface; the player then fired through the actual tryFire/raycast/damage/FFA scoring path.']};
      if(captures.ffa.status==='FAIL')failures.push('offline FFA live/completion path did not meet expected checks');
      if(f.errors.length||f.failed.length)failures.push('offline FFA browser errors or failed requests');
      captures.ffa.errors=f.errors;captures.ffa.failedResponses=f.failed;
    } finally { await f.context.close(); }

    const b = await openGame(browser, url, 'offline-bomb');
    try {
      await setModeAndRules(b.page,'bomb',[['diff','recruit'],['bots','1'],['mates','1'],['bombBestOf','3'],['bombTime','60'],['bombSeconds','20'],['plantSeconds','3'],['defuseSeconds','4']]);
      await b.page.screenshot({ path: path.join(output, 'offline-bomb-lobby.png') });
      await start(b.page);
      const initial=await sceneState(b.page);
      const layout=await hudLayout(b.page);
      await b.page.screenshot({ path: path.join(output, 'offline-bomb-live-start.png') });
      const phases=[]; let planted=false, defusing=false, terminal=false;const badObjectiveText=[];
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
        if(current.bomb?.phase==='planted'&&!planted){planted=true;await b.page.screenshot({path:path.join(output,'offline-bomb-planted.png')});}
        if(useAction==='defuse'&&!defusing){defusing=true;await b.page.screenshot({path:path.join(output,'offline-bomb-defusing.png')});}
        if(current.bomb?.phase==='defused'||current.bomb?.phase==='exploded'||current.state==='roundend'||current.state==='matchend'){
          terminal=true;await b.page.screenshot({path:path.join(output,'offline-bomb-terminal.png')});break;
        }
      }
      const final=await sceneState(b.page);
      captures.bomb={status:initial.mode==='bomb'&&initial.state==='live'&&initial.bots===1&&initial.mates===1&&initial.bomb?.phase==='carried'&&planted&&defusing&&terminal&&!badObjectiveText.length&&!layout.overlapTopbarAlive&&!layout.overlapAliveObjective?'PASS':'FAIL',initial,hudLayout:layout,phaseTimeline:phases,planted,defusing,terminal,final,badObjectiveText,notes:['Unassisted Offline Bomb AI was allowed to run in the actual WebGL match loop; no bot positions, AI states, objective states, or game timers were injected.']};
      if(captures.bomb.status==='FAIL')failures.push('offline Bomb AI did not complete the plant/defuse/explosion loop within 240 seconds');
      if(b.errors.length||b.failed.length)failures.push('offline Bomb browser errors or failed requests');
      captures.bomb.errors=b.errors;captures.bomb.failedResponses=b.failed;
    } finally { await b.context.close(); }
    const report={status:failures.length?'FAIL':'PASS',sourcePageSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(www,'index.html'))).digest('hex'),assetRoot:www,renderer:'Actual Sightline WebGL code in Codex-managed headless Chromium with SwiftShader software rendering',captures,failures,limitations:['Software WebGL; not physical Android GPU performance.','FFA completion uses the explicitly documented debug-only deterministic actor setup; all firing, raycast, damage, scoring, and match-end code after setup is real.','Bomb test is unassisted AI in an actual running match, but remains an isolated loopback/browser test rather than human gameplay acceptance.']};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    process.stdout.write(JSON.stringify({status:report.status,output,sourcePageSha256:report.sourcePageSha256,ffa:captures.ffa&&{status:captures.ffa.status,mode:captures.ffa.before&&captures.ffa.before.mode,bots:captures.ffa.before&&captures.ffa.before.bots,movingBotCount:captures.ffa.movingBotCount,finalState:captures.ffa.after&&captures.ffa.after.state,score:captures.ffa.after&&captures.ffa.after.score},bomb:captures.bomb&&{status:captures.bomb.status,phaseTimeline:captures.bomb.phaseTimeline,planted:captures.bomb.planted,defusing:captures.bomb.defusing,terminal:captures.bomb.terminal,finalState:captures.bomb.final&&captures.bomb.final.state},failures},null,2)+'\n');
    if(failures.length)process.exitCode=1;
  } finally { if(browser)await browser.close(); if(server)await new Promise(resolve=>server.close(()=>resolve())); }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});

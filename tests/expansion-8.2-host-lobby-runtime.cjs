'use strict';

// Connects the actual phone-host page to a temporary loopback host and records
// the connected multiplayer lobby. Never attaches to a user's browser.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE || 'C:/Users/LOCAL_USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const chromiumPath = process.env.SIGHTLINE_CHROMIUM_EXECUTABLE || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
const root = path.resolve(__dirname, '..');
const phone = path.join(root, 'AndroidProject/app/src/main/assets/phone-host');
const output = path.join(root, 'acceptance', `expansion-8.2-host-ui-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(output, { recursive: false });

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? reject(e) : resolve(p)); });
  });
}
function waitStatus(url, proc) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = async () => {
      if (proc.exitCode != null) return reject(new Error('Host exited before readiness: ' + proc.exitCode));
      try { const r = await fetch(url + '/status', { signal: AbortSignal.timeout(1000) }); if (r.ok) return resolve(await r.json()); } catch (_) {}
      if (Date.now() - start > 15000) return reject(new Error('Host did not expose /status within 15 seconds'));
      setTimeout(poll, 100);
    };
    poll();
  });
}
async function metrics(page) {
  return page.evaluate(() => {
    const box = e => { if (!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right)}; };
    const main=document.querySelector('.mn-main'), dyn=document.querySelector('#pn-dyn');
    return { viewport:[innerWidth,innerHeight], document:[document.documentElement.clientWidth,document.documentElement.scrollWidth,document.documentElement.clientHeight,document.documentElement.scrollHeight], main:box(main), mainClient:main?.clientWidth, mainScroll:main?.scrollWidth, mainClientHeight:main?.clientHeight, mainScrollHeight:main?.scrollHeight, dyn:box(dyn), dynClient:dyn?.clientWidth, dynScroll:dyn?.scrollWidth,
      nav:[...document.querySelectorAll('#mn-nav [data-shell-group]')].map(e=>e.innerText.trim().replace(/\s+/g,' ')),
      subnav:[...document.querySelectorAll('#mn-subnav [data-shell-route]')].map(e=>e.innerText.trim().replace(/\s+/g,' ')),
      activeRoute:document.querySelector('#mn-subnav [aria-current="page"]')?.innerText.trim().replace(/\s+/g,' ')||null,
      heading:document.querySelector('#pn-dyn h2')?.innerText.trim()||null,
      buildId:document.querySelector('#mn-build-id')?.innerText.trim()||null,
      routeNote:document.querySelector('#mn-route-note')?.innerText.trim()||null,
      state:document.querySelector('#mp-state')?.innerText||document.body.innerText.slice(0,2400),
      controls:[...document.querySelectorAll('#pn-dyn button,#pn-dyn input,#pn-dyn select')].map(e=>({text:e.innerText||e.getAttribute('aria-label')||e.value||'',disabled:e.disabled,rect:box(e)})).filter(x=>x.rect)
    };
  });
}
(async()=>{
  let browser, host;
  const errors=[], failedResponses=[]; let logs='';
  try {
    const port=await freePort();
    host=spawn(process.execPath,[path.join(phone,'server.js'),'--transport','dev','--bind','127.0.0.1','--port',String(port),'--max','10','--bots','0','--tick-ms','20'],{cwd:phone,stdio:['ignore','pipe','pipe']});
    host.stdout.on('data',x=>logs+=x.toString()); host.stderr.on('data',x=>logs+=x.toString());
    const status=await waitStatus(`http://127.0.0.1:${port}`,host);
    browser=await chromium.launch({headless:true,executablePath:chromiumPath,args:['--no-first-run','--disable-background-networking','--disable-extensions','--disable-sync','--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)failedResponses.push({status:r.status(),url:r.url()});});
    await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded',timeout:20000});
    await page.locator('#mn-subnav [data-shell-route="multiplayer"]').click();
    await page.locator('#mp-name').fill('Codex isolated host');
    await page.locator('#mp-addr').fill(`127.0.0.1:${port}`);
    await page.locator('#pn-dyn [data-net="connect"]').click();
    await page.waitForSelector('#pn-dyn [data-net="leave"]',{timeout:15000});
    await page.waitForTimeout(400);
    const joined=await metrics(page);
    await page.screenshot({path:path.join(output,'connected-multiplayer-lobby.png')});
    const multiplayerRouteClean=await page.evaluate(()=>!document.querySelector('#pn-dyn .mp-map-details')&&!document.querySelector('#pn-dyn [data-net="mode"]')&&!document.querySelector('#pn-dyn [data-bot-count]'));
    const quickMapLink=page.locator('#pn-dyn [data-host-route="maps"]'),quickRulesLink=page.locator('#pn-dyn [data-host-route="rules"]');
    const quickLinksVisible=await quickMapLink.count()===1&&await quickRulesLink.count()===1;
    await quickMapLink.click();await page.waitForTimeout(120);
    const quickMapNavigation=await page.locator('#pn-dyn h2').innerText()==='MAPS';
    await page.locator('#mn-subnav [data-shell-route="multiplayer"]').click();await page.waitForTimeout(100);
    await page.locator('#pn-dyn [data-host-route="rules"]').click();await page.waitForTimeout(180);
    const bomb=page.locator('#pn-dyn [data-net="mode"][data-v="bomb"]');
    if(await bomb.count()){await bomb.click();await page.waitForTimeout(300);}
    const bombLobby=await metrics(page);
    await page.screenshot({path:path.join(output,'connected-bomb-match-rules.png')});
    const rulesRouteClean=await page.evaluate(()=>!document.querySelector('#pn-dyn .mp-map-details')&&!!document.querySelector('#pn-dyn [data-net="mode"]')&&!!document.querySelector('#pn-dyn [data-net="start"]'));
    const botSetup=page.locator('#pn-dyn .sl82-bot-settings');await botSetup.locator('summary').click();await page.waitForTimeout(80);
    const botSetupOpen=await botSetup.evaluate(e=>e.open);
    const botA=page.locator('#pn-dyn [data-bot-count="t0"]'),botB=page.locator('#pn-dyn [data-bot-count="t1"]');
    let botRoster={supported:false};
    if(await botA.count()&&await botB.count()){
      await botA.fill('32');await botA.dispatchEvent('change');await page.waitForTimeout(180);
      await botB.fill('32');await botB.dispatchEvent('change');await page.waitForTimeout(350);
      const state=await fetch(`http://127.0.0.1:${port}/status`).then(r=>r.json());
      botRoster={supported:true,requestedPerTeam:[32,32],hostBots:state.bots,hostPlayers:state.players};
    }
    await page.locator('#mn-subnav [data-shell-route="maps"]').click();await page.waitForTimeout(180);
    const mapView=await metrics(page);
    const mapDetails=page.locator('#pn-dyn .mp-map-details'),mapOpen=await mapDetails.evaluate(e=>e.open),mapButtons=page.locator('#pn-dyn .mp-map-details [data-net="map"]'),mapCount=await mapButtons.count();
    const mapsRouteClean=await page.evaluate(()=>!document.querySelector('#pn-dyn [data-net="mode"]')&&!document.querySelector('#pn-dyn [data-bot-count]')&&!document.querySelector('#pn-dyn .mp-bomb-settings'));
    const mapLabels=await mapButtons.evaluateAll(es=>es.map(e=>({name:e.querySelector('b')?.textContent.trim(),compatible:/A\/B sites/.test(e.innerText)})));
    const mapPickerShot=path.join(output,'connected-bomb-map-picker.png');await page.screenshot({path:mapPickerShot});
    let selectedMap=null, selectedMapId=null, selectedAfter=null, hostMapAfter=null, mapSelectionVerified=false;
    if(mapCount>1){
      const current=await mapButtons.evaluateAll(es=>es.findIndex(e=>e.getAttribute('aria-pressed')==='true'));
      const choice=mapButtons.nth((current+1)%mapCount);selectedMap=(await choice.locator('b').textContent()).trim();selectedMapId=await choice.getAttribute('data-v');await choice.click();
      await page.waitForFunction(id=>{const selected=document.querySelector('#pn-dyn .mp-map-details [data-net="map"][aria-pressed="true"]');return selected&&selected.getAttribute('data-v')===id;},selectedMapId,{timeout:5000}).catch(()=>{});
      const stateAfterMap=await fetch(`http://127.0.0.1:${port}/status`).then(r=>r.json());hostMapAfter=stateAfterMap.map;
      selectedAfter=await page.locator('#pn-dyn .mp-map-details [data-net="map"][aria-pressed="true"] b').textContent().catch(()=>null);
      mapSelectionVerified=selectedAfter?.trim()===selectedMap&&hostMapAfter===selectedMapId;
      await page.screenshot({path:path.join(output,'connected-bomb-map-selected.png')});
    }
    await page.locator('#mn-subnav [data-shell-route="rules"]').click();await page.waitForTimeout(180);
    const bombRules=page.locator('#pn-dyn .mp-bomb-settings:not(.sl82-bot-settings)');await bombRules.locator('summary').click();await page.waitForTimeout(80);
    const bestOfFive=bombRules.locator('[data-net="bomb"][data-k="bestOf"][data-v="5"]');await bestOfFive.click();
    await page.waitForFunction(()=>{const d=document.querySelector('#pn-dyn .mp-bomb-settings:not(.sl82-bot-settings)');return d&&d.open&&d.querySelector('summary').innerText.includes('Best of 5')&&d.querySelector('[data-net="bomb"][data-k="bestOf"][data-v="5"]').getAttribute('aria-pressed')==='true';},null,{timeout:5000});
    const bombRulesOpen=await bombRules.evaluate(e=>e.open),bombRuleControls=await bombRules.locator('[data-net="bomb"]').count(),bombSettingsPersisted=bombRulesOpen&&/Best of 5/.test(await bombRules.locator('summary').innerText());
    const startEnabledAfterBotFill=await page.locator('#pn-dyn [data-net="start"]').isEnabled();
    const bombSettingsShot=path.join(output,'connected-bomb-match-settings.png');await page.screenshot({path:bombSettingsShot});
    const configuration={multiplayerRouteClean,quickLinksVisible,quickMapNavigation,rulesRouteClean,mapsRouteClean,botSetupOpen,botRoster,startEnabledAfterBotFill,mapRouteOpen:mapOpen,mapCount,mapLabels,mapPickerScreenshot:path.basename(mapPickerShot),selectedMap,selectedMapId,selectedAfter,hostMapAfter,mapSelectionVerified,matchRulesRouteOpen:bombRulesOpen,bombRuleControls,bombSettingsPersisted,bombSettingsScreenshot:path.basename(bombSettingsShot)};
    const responsive=[];
    for(const route of ['multiplayer','maps','rules']){
      await page.locator('#mn-subnav [data-shell-route="'+route+'"]').click();await page.waitForTimeout(100);
      for(const size of [{name:'desktop-1366x768',width:1366,height:768},{name:'landscape-844x390',width:844,height:390},{name:'portrait-390x844',width:390,height:844}]){
        await page.setViewportSize({width:size.width,height:size.height}); await page.waitForTimeout(180);
        const view=await metrics(page), shot=`connected-${route}-${size.name}.png`;
        await page.screenshot({path:path.join(output,shot),fullPage:false}); responsive.push({name:size.name,route,screenshot:shot,...view});
      }
    }
    const bombModeSelected=/Bomb Defusal/i.test(bombLobby.state);
    const rosterText=await page.evaluate(()=>document.querySelector('.sl82-host-summary')?.innerText||'');
    const rosterSummaryAccurate=/1\s*\/\s*10 humans/i.test(rosterText)&&/63 bots/i.test(rosterText);
    configuration.rosterSummaryAccurate=rosterSummaryAccurate;configuration.mapRoute=mapView;
    const result={status:errors.length||failedResponses.some(x=>x.status>=400)||!multiplayerRouteClean||!quickLinksVisible||!quickMapNavigation||!rulesRouteClean||!mapsRouteClean||!botSetupOpen||!bombModeSelected||!mapSelectionVerified||mapLabels.some(x=>!x.compatible)||!bombRulesOpen||!bombSettingsPersisted||!startEnabledAfterBotFill||!rosterSummaryAccurate?'FAIL':'PASS',build:{id:'Sightline V3 Expansion 8.2 experimental',servedPhoneHostSha256:status.bundle,servedHostInventorySha256:status.server},port,mode:status.mode,phase:status.phase,joined,bombLobby,bombModeSelected,configuration,responsive,errors,failedResponses,hostLog:logs,limitations:['Actual source-rendered UI and loopback host; not a second human client or Wi-Fi test.','SwiftShader software rendering; not Android GPU performance.']};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2));
    process.stdout.write(JSON.stringify({status:result.status,output,port,servedPage:status.bundle,servedHost:status.server,phase:status.phase,mpOverflow:joined.mainScroll-joined.mainClient,bombModeSelected,configuration,viewports:responsive.map(x=>({name:x.name,route:x.route,documentWidth:x.document[0],documentScrollWidth:x.document[1],mainClient:x.mainClient,mainScroll:x.mainScroll,verticalScroll:x.mainScrollHeight-x.mainClientHeight})),errors,failedResponses},null,2)+'\n');
    if(result.status==='FAIL')process.exitCode=1;
  } finally { if(browser)await browser.close(); if(host&&!host.killed){host.kill(); await new Promise(r=>host.once('exit',r));} }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});

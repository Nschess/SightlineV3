// Isolated, file-based WebGL acceptance for Outbreak survivor counts and horde pursuit.
// No local HTTP server or user desktop/browser is used.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const gameRoot = path.join(root, 'AndroidProject/app/src/main/assets/phone-host');
const htmlPath = path.join(gameRoot, 'index.html');
const source = fs.readFileSync(htmlPath, 'utf8');
const match = Array.from(source.matchAll(/requestAnimationFrame\(frame\);\r?\n\}\)\(\);\r?\n<\/script>/g)).at(-1);
assert.ok(match, 'game-loop injection marker is present');
const qa = `var __obQaIds=new WeakMap(),__obQaNext=0;window.__outbreakQa={R:R,OB:OB,P:P,G:G,startMatch:startMatch,beginRound:beginRound,resume:resume,goTab:goTab,spawnBots:spawnBots,updateHud:updateHud,zCapNow:zCapNow,stepOutbreakZombie:stepOutbreakZombie,get bots(){return bots},get mates(){return mates},get units(){return units},get state(){return state},get huntStats(){return outbreakHuntStats},get renderer(){return renderer},squadText:squadText,selectedAllies:outbreakSelectedAllies,track:function(o){if(!__obQaIds.has(o))__obQaIds.set(o,++__obQaNext);return __obQaIds.get(o)}};`;
const instrumented = source.slice(0, match.index) + 'requestAnimationFrame(frame);' + qa + '\n})();\n</script>' + source.slice(match.index + match[0].length);
const errors = [];

async function main() {
  const executablePath = process.env.P18_CHROMIUM || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
  const testHtmlPath = path.join(gameRoot, '.outbreak-runtime-' + process.pid + '.html');
  const base = pathToFileURL(gameRoot + path.sep).href;
  fs.writeFileSync(testHtmlPath, instrumented.replace('<head>', '<head><base href="' + base + '">'));
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--allow-file-access-from-files', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-networking', '--disable-sync', '--no-first-run'] });
  try {
    let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const monitor = p => { p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
    await page.addInitScript(() => { try { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); } catch (_) {} });
    monitor(page);
    await page.goto(pathToFileURL(testHtmlPath).href, { waitUntil: 'load', timeout: 60000 });
    try { await page.waitForFunction(() => !!window.__outbreakQa?.renderer, null, { timeout: 30000 }); }
    catch (e) { console.error('runtime initialization diagnostics', JSON.stringify({ errors, url: page.url(), title: await page.title(), scriptCount: await page.locator('script').count() })); throw e; }
    await page.waitForTimeout(900);
    await page.evaluate(() => { __outbreakQa.G.pauseOnHide = false; });

    await page.evaluate(() => __outbreakQa.goTab('rules'));
    await page.locator('button[data-k="mode"][data-v="outbreak"]').click();
    await page.locator('button[data-k="mates"][data-v="14"]').click();
    const selected14 = await page.evaluate(() => ({ requested: __outbreakQa.R.mates, label: document.querySelector('#sc-bot-label').textContent }));
    assert.equal(selected14.requested, 14, 'the actual Rules control must retain the selected 14 survivor bots');
    const roster14 = await page.evaluate(() => { const q=__outbreakQa; q.startMatch(); q.beginRound(); q.updateHud(); return { count:q.mates.length, alive:q.mates.filter(x=>x.alive).length, enabled:q.mates.filter(x=>x.alive&&x.g.visible).length, hud:document.querySelector('#sc-bot').textContent, label:document.querySelector('#sc-bot-label').textContent }; });
    assert.equal(roster14.count, 14, 'selecting 14 in the actual Rules UI must create 14 survivor bots');
    assert.equal(roster14.alive, 14);
    assert.equal(roster14.enabled, 14);
    assert.equal(roster14.hud, '14');
    assert.equal(roster14.label, 'ALLIES');

    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => { try { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); } catch (_) {} });
    monitor(page);
    await page.goto(pathToFileURL(testHtmlPath).href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__outbreakQa?.renderer, null, { timeout: 30000 });
    await page.evaluate(() => { __outbreakQa.G.pauseOnHide=false; });

    const party = await page.evaluate(() => {
      const q = __outbreakQa;
      q.R.mode = 'outbreak'; q.R.bots = 0; q.R.mates = 64; q.R.zcap = 24; q.R.cash = 9000;
      q.startMatch(); q.beginRound();
      const weapons=q.mates.map(x=>x.weapon);
      return { selectedAllies: q.R.mates, startingCash:q.R.cash, hollowedLimit: q.R.zcap, allyCount: q.mates.length, livingAllies: q.mates.filter(x => x.alive).length, visibleAllies: q.mates.filter(x => x.alive && x.g.visible).length, uniqueWeapons:[...new Set(weapons)], state: q.state, summary: q.squadText() };
    });
    assert.equal(party.allyCount, 56, 'the 56-bot squad maximum is reserved first even with a 24 Hollowed setting');
    assert.equal(party.livingAllies, 56, 'the selected survivor squad must spawn alive');
    assert.equal(party.visibleAllies, 56, 'spawned survivor squad must be rendered');
    assert.ok(party.uniqueWeapons.length > 8, 'Outbreak allies use a visibly varied, affordable weapon pool from the first wave: ' + JSON.stringify(party));
    assert.ok(party.uniqueWeapons.some(k => k !== 'pistol'), 'the survivor team does not default to pistols when the starting budget allows other guns');
    assert.match(party.summary, /56 survivor bots/);
    assert.match(party.summary, /8 Hollowed/);
    const capExamples = await page.evaluate(() => { const q=__outbreakQa, old=q.R.zcap; q.R.zcap=56; const reserve56=q.selectedAllies(); q.R.zcap=64; const reserve64=q.selectedAllies(), summary=q.squadText(); q.R.zcap=old; return { reserve56, reserve64, summary }; });
    assert.equal(capExamples.reserve56, 56, 'the survivor squad is reserved before applying the active horde cap');
    assert.equal(capExamples.reserve64, 56, 'a 64-Hollowed requested cap does not suppress the survivor squad');
    assert.match(capExamples.summary, /56 survivor bots/);
    assert.match(capExamples.summary, /up to 8 Hollowed can be active at once/);
    const maxHordeForSquad = await page.evaluate(() => { const q=__outbreakQa; q.R.zcap=64; q.R.mates=14; q.startMatch(); q.beginRound(); return { allies:q.mates.filter(x=>x.alive&&x.g.visible).length, activeHollowedLimit:q.zCapNow(100,14), summary:q.squadText() }; });
    assert.equal(maxHordeForSquad.allies, 14, 'choosing 64 Hollowed still spawns the selected 14 survivor bots');
    assert.equal(maxHordeForSquad.activeHollowedLimit, 50, 'active Hollowed are capped to the 50 slots left after 14 survivors');
    assert.match(maxHordeForSquad.summary, /50 Hollowed can be active at once/);
    await page.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => { try { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); } catch (_) {} });
    monitor(page);
    await page.goto(pathToFileURL(testHtmlPath).href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.__outbreakQa?.renderer, null, { timeout: 30000 });
    await page.evaluate(() => { const q=__outbreakQa; q.G.pauseOnHide=false; q.R.mode='outbreak'; q.R.mates=6; q.R.zcap=24; q.startMatch(); q.beginRound(); });
    try { await page.waitForFunction(() => __outbreakQa.OB.phase === 'fight' && __outbreakQa.bots.some(z => z.alive && z.zombie), null, { timeout: 60000 }); }
    catch (e) { console.error('horde start diagnostics', JSON.stringify(await page.evaluate(() => ({state:__outbreakQa.state,phase:__outbreakQa.OB.phase,bots:__outbreakQa.bots.length,zombies:__outbreakQa.bots.filter(z=>z.zombie).length,alive:__outbreakQa.bots.filter(z=>z.alive).length,allies:__outbreakQa.mates.filter(x=>x.alive).length,hidden:document.hidden,visibility:document.visibilityState,pauseOnHide:__outbreakQa.G.pauseOnHide,hunt:__outbreakQa.huntStats})), null, 2)); console.error('runtime errors', JSON.stringify(errors)); throw e; }
    const beforeHorde = await page.evaluate(() => __outbreakQa.bots.filter(z=>z.alive&&z.zombie).map(z=>({id:__outbreakQa.track(z),x:z.x,z:z.z})));
    await page.waitForTimeout(9000);
    const horde = await page.evaluate(before => {
      const q=__outbreakQa, initial=new Map(before.map(z=>[z.id,z]));
      const zombies=q.bots.filter(x=>x.alive&&x.zombie).map(z=>{const p=initial.get(q.track(z));return{id:q.track(z),sampled:!!p,distance:Math.hypot(z.x-q.P.x,z.z-q.P.z),displacement:p?Math.hypot(z.x-p.x,z.z-p.z):0,state:z.hunt&&z.hunt.state,stuck:z.hunt&&z.hunt.stuck,target:z.tgt? q.track(z.tgt):null};});
      const tracked=zombies.filter(z=>z.sampled);
      return { gameState:q.state, playerAlive:q.P.alive, outbreakPhase:q.OB.phase, alliesAlive:q.mates.filter(x=>x.alive).length, zombies:zombies.length, sampleAlive:tracked.length, sampleMoved:tracked.filter(z=>z.displacement>.5).length, spawnedAfterSample:zombies.length-tracked.length, pursuing:zombies.filter(z=>['chase','attack'].includes(z.state)).length, targets:[...new Set(zombies.map(z=>z.target).filter(Boolean))].length, maxStuck:Math.max(0,...zombies.map(z=>z.stuck||0)), states:[...new Set(zombies.map(z=>z.state))], hunt:{...q.huntStats}, zombiesDetail:zombies };
    },beforeHorde);
    assert.ok(horde.zombies > 0, 'the outbreak must spawn its horde');
    assert.ok(horde.sampleAlive > 0 && horde.sampleMoved > 0, 'sampled Hollowed must move during live gameplay: ' + JSON.stringify(horde));
    assert.ok(horde.pursuing > 0 || horde.hunt.heard > 0, 'Hollowed must pursue, attack, or investigate survivor noise: ' + JSON.stringify(horde));
    const idleAttack = await page.evaluate(() => {
      const q=__outbreakQa, z=q.bots.find(x=>x.alive&&x.zombie);
      if(!z) throw new Error('no spawned Hollowed available for idle-target check');
      q.bots.splice(0,q.bots.length,z); q.mates.splice(0,q.mates.length); q.units.splice(0,q.units.length);
      q.P.x=0; q.P.y=0; q.P.z=36; q.P.alive=true; q.P.hp=100; q.state='live';
      z.x=1.45; z.y=0; z.z=36; z.rise=0; z.atkT=10; z.hunt=SightlineZombieHunt.create(z.id);
      SightlineZombieHunt.seen(z.hunt,q.P,performance.now()); z.huntScan=10; z.tgt=q.P;
      const before={x:z.x,z:z.z};
      for(let i=0;i<45;i++) q.stepOutbreakZombie(z,0.02);
      return {targetStillIdle:q.P.x===0&&q.P.z===36,displacement:Math.hypot(z.x-before.x,z.z-before.z),state:z.hunt.state,hp:q.P.hp};
    });
    assert.equal(idleAttack.targetStillIdle,true,'the test player remains motionless');
    assert.ok(idleAttack.displacement>.2,'an attacking Hollowed continues to reposition around an idle player');
    assert.deepEqual(errors, [], 'runtime must not produce JavaScript or console errors');
    console.log(JSON.stringify({ pass: true, browser: 'isolated Chromium file:// with SwiftShader', renderer: await page.evaluate(() => { const gl=__outbreakQa.renderer.getContext(); return gl.getParameter(gl.RENDERER); }), party, horde, idleAttack, errors }, null, 2));
  } finally { await browser.close(); fs.rmSync(testHtmlPath, { force: true }); }
}

main().catch(e => { console.error(e); process.exitCode = 1; });

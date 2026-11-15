"use strict";
const fs = require('fs'),vm = require('vm'),assert = require('assert');
let checks=0;
const pass=(ok,msg)=>{assert.ok(ok,msg);checks++};
const html=fs.readFileSync(fs.existsSync('index.html')?'index.html':require('path').join(__dirname,'../AndroidProject/app/src/main/assets/phone-host/index.html'),'utf8');
pass(html.includes("build: 'P11.5.7'"),'new game build loaded');
pass(html.includes('data-act="p1157-clear"'),'clear visual preset wired');
pass(html.includes('data-act="p1157-report"'),'on-screen diagnostic report wired');
pass(html.includes('var PERF_SCALE = [1, 0.97, 0.94, 0.90]'),'90% clarity floor');
pass(html.includes('fastMode: false, renderScale: 100, shadows: \'off\''),'clear preset disables low-res mode');
pass(html.includes('try { renderer.render(scene, camera); }'),'real renderer retains execution');
pass(html.includes('finally { if (botVisuals) restoreOfflineBots(); }'),'visual interpolated positions restored after rendering');
pass(html.includes('botSimulationCpuMs:')&&html.includes('playerCpuMs:')&&html.includes('effectsCpuMs:'),'per-subsystem CPU measurements');
pass(html.includes('runOfflineBots(dt);')&&html.includes('updatePlayer(dt);'),'bots can be decoupled from player frame');
// Invoke actual functions copied verbatim from the shipped game. No mocked
// alternate algorithms; stub only the game state and bot update callback.
const a=html.indexOf('var BOT_STEP = 1 / 30, botStepTarget = BOT_STEP, botStepAcc = 0'),b=html.indexOf('var lastRender = 0, pausedDrawn = false;',a);
pass(a>=0&&b>a,'extracted actual bot scheduler');
const code=html.slice(a,b);
function bench(hz,cap,mp,secs=4,roster=1){
  const makeBot=()=>({x:0,y:0,z:0,yaw:0,alive:true,g:{position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z}},rotation:{y:0}}});
  const units=Array.from({length:roster},makeBot),bot=units[0];
  const ctx={Math,Number,performance:{now:()=>0},units,MP:{on:mp},G:{fpsCap:cap},calls:0,elapsed:0,updateBots(dt){ctx.calls++;ctx.elapsed+=dt;bot.x+=10*dt;bot.yaw+=dt;bot.g.position.x=bot.x;bot.g.rotation.y=bot.yaw;}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  for(let i=0;i<hz*secs;i++)ctx.runOfflineBots(1/hz);
  return {ctx,bot,calls:ctx.calls,time:ctx.elapsed};
}
for(const hz of [60,120]){
  const t=bench(hz,60,false);
  pass(Math.abs(t.calls-30*4)<=1,hz+'Hz renders ~30 bot updates/s not '+hz);
  pass(Math.abs(t.time-4)<0.051,hz+'Hz offline cumulative time stays within one tick');
  pass(Math.abs(t.bot.x-40)<0.51,hz+'Hz physical movement integrates elapsed simulation');
}
for(const [roster,expected,label] of [[40,20,'40-unit roster'],[64,15,'64-unit roster']]){
  const t=bench(120,60,false,4,roster);
  pass(Math.abs(t.calls-expected*4)<=1,label+' adapts AI cadence to '+expected+'Hz');
  pass(Math.abs(t.time-4)<0.051,label+' keeps time-correct movement integration');
}
const capped=bench(30,30,false),largeCapped=bench(30,30,false,4,64),net=bench(120,120,true);
pass(capped.calls===120,'intentional 30 fps remains original bot per-frame updates');
pass(Math.abs(largeCapped.calls-60)<=1,'30 fps cap uses 15 Hz AI cadence for 64 units');
pass(net.calls===480,'multiplayer simulation remains per rendered callback');
const t=bench(120,60,false,1);
const bot=t.bot,authoritativeX=bot.x,authoritativeYaw=bot.yaw;
pass(t.ctx.renderOfflineBots(0.5),'interpolation operates in offline high-refresh mode');
pass(bot.g.position.x<=authoritativeX,'interpolated render pose trails authoritative physics');
t.ctx.restoreOfflineBots();
pass(bot.g.position.x===authoritativeX&&bot.g.rotation.y===authoritativeYaw,'physics and hitboxes restored after drawing');
console.log(JSON.stringify({pass:true,checks,offlineBotUpdates60Hz:bench(60,60,false,1).calls,offlineBotUpdates120Hz:bench(120,120,false,1).calls,networkUpdate120Hz:bench(120,120,true,1).calls,measuredHardwareFPS:'NOT_MEASURED'},null,2));

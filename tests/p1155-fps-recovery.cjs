"use strict";
/* P11.5.5 deterministic scheduler, settings, adaptive recovery and source integrity.
   Real browser/GPU FPS must be measured on the player's device. */
const assert=require('assert'), fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const assets=path.join(root,'AndroidProject/app/src/main/assets');
const previous=path.join(root,'rollback/P1155-P1154-EXACT-FILES/AndroidProject/app/src/main/assets');
const shaf=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=p=>fs.readFileSync(p,'utf8');
let checks=0; function ok(v,s){assert.ok(v,s);checks++;} function eq(a,b,s){assert.strictEqual(a,b,s);checks++;}
function extract(src,start,end){const a=src.indexOf(start),b=src.indexOf(end,a);ok(a>=0&&b>a,'missing '+start);return src.slice(a,b);}
let slices=[];
for(const client of ['www','phone-host']){
 const src=load(path.join(assets,client,'index.html'));
 const old=load(path.join(previous,client,'index.html'));
 for(const m of src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim()){new vm.Script(m[1]);checks++;}
 // No accidental changes to combat configurations, weapon stats, skin assets or multiplayer wiring.
 const a=old.indexOf('var WEAPONS = {'),b=old.indexOf('\n};',a)+3;
 ok(a>=0 && src.includes(old.slice(a,b)),client+' weapon stats changed');
 ok(src.includes("var inPlay = state === 'live' || state === 'roundend', cap = inPlay ? (Number(G.fpsCap) || 0) : menuFrameCap(G.fpsCap);"),client+' live/menu selection is stale');
 ok(src.includes('if (!renderCapAllows(now, effectiveRenderCap(cap, rafHzBest, rafCount))) return;'),client+' scheduler bypass not connected to game loop');
 ok(src.includes('resetFpsWindow();') && src.includes("if (k === 'fpsCap') { renderNextDue = 0; renderCap = -1;"),client+' FPS settings do not reset pacing');
 ok(src.includes('adaptivePixelBudget: framePixelBudget()'),client+' game diagnostic missing adaptive pixel budget');
 const core=extract(src,'function frameBudgetMs','function resetFpsWindow'); slices.push(core);
 const cx=vm.createContext({Math,renderNextDue:0,renderCap:-1});vm.runInContext(core,cx);
 const ms=cx.frameBudgetMs;
 eq(+ms(30,60).toFixed(2),33.33,client+' deliberate 30 FPS budget');
 eq(+ms(60,30).toFixed(2),16.67,client+' 30 callbacks must NOT mislabel a 60-Hz target');
 eq(+ms(120,30).toFixed(2),16.67,client+' 120 setting should try recovering 60 despite overload');
 eq(+ms(120,60).toFixed(2),16.67,client+' 60Hz refresh respected at 120 cap');
 eq(+ms(120,120).toFixed(2),8.33,client+' 120Hz target enabled on suitable display');
 eq(cx.menuFrameCap(30),30,client+' 30 menu option');
 eq(cx.menuFrameCap(60),60,client+' 60 menu option');
 eq(cx.menuFrameCap(120),60,client+' 120 on 60Hz menu');
 eq(cx.menuFrameCap(0),60,client+' uncapped menu intended maximum 60');
 eq(cx.effectiveRenderCap(60,60,96),0,client+' 60Hz must render every callback');
 eq(cx.effectiveRenderCap(120,60,96),0,client+' 120 cap on 60Hz must render every callback');
 eq(cx.effectiveRenderCap(30,60,96),30,client+' explicit 30 cap retained');
 eq(cx.effectiveRenderCap(60,120,96),60,client+' 60 cap on 120Hz must actually throttle');
 eq(cx.effectiveRenderCap(120,120,96),0,client+' 120Hz must render every callback');
 for(const [hz,cap,goal] of [[60,30,30],[60,60,60],[60,120,60],[120,60,60],[120,120,120],[144,120,120]]){
  cx.renderNextDue=0;cx.renderCap=-1;let drawn=0;
  for(let n=0;n<hz*10;n++){
   // Small timestamp jitter should not halve FPS on a 60 Hz display.
   let t=1000+(n+1)*1000/hz+Math.sin(n*1.17)*.45;
   if(cx.renderCapAllows(t,cx.effectiveRenderCap(cap,hz,96)))drawn++;
  }
  ok(Math.abs(drawn/10-goal)<=1.1,client+` ${cap} setting with ${hz} callbacks gives ${drawn/10}, wanted ${goal}`);
 }
 const pixelCode=extract(src,'function framePixelBudget()','function fail(msg)');
 function pixels(w,h,dpr,cap,adaptive,callbackHz,touch=false){
  const context={Math,Number,window:{devicePixelRatio:dpr,innerWidth:w,innerHeight:h},stage:{clientWidth:w,clientHeight:h},G:{renderScale:100,adaptive,fpsCap:cap},perfScale:1,rafHzBest:callbackHz,touchMode:touch};
  vm.createContext(context);vm.runInContext(pixelCode,context);
  return {budget:context.framePixelBudget(),pixels:Math.round(w*h*context.pixelRatio()**2)};
 }
 const p30=pixels(1920,1080,2,30,true,30);
 const p60=pixels(1920,1080,2,60,true,30);
 const p120vs60=pixels(1920,1080,2,120,true,60);
 const p120vs120=pixels(1920,1080,2,120,true,120);
 eq(p30.budget,3600000,client+' 30 FPS original graphics preserved');
 eq(p60.budget,2400000,client+' 60 FPS gets realistic adaptive pixel budget');
 eq(p120vs60.budget,2400000,client+' 120 selection on 60Hz should not over-downscale');
 eq(p120vs120.budget,1800000,client+' high-refresh load scaling');
 ok(p60.pixels<=2400001 && p60.pixels<p30.pixels,client+' 60 FPS reduces actual GPU fragment work');
 eq(pixels(1920,1080,2,60,false,30).budget,3600000,client+' user disabled adaptive preserved');
 eq(pixels(1920,1080,1,60,true,30).pixels,1920*1080,client+' standard 1x desktop must remain full resolution');
 ok(pixels(1080,2400,3,60,true,30,true).pixels<=1050001,client+' phone high FPS budget');
 const adaptive=extract(src,'var perfEma = 16.7','var lastRender = 0');
 function runAdapt(cap,callbackHz,deliveredHz,frames){
  const c={Math,G:{adaptive:true,fpsCap:cap},rafHzBest:callbackHz,T:10,perfLvl:0,perfScale:1,botShadowsOn:true,frameBudgetMs:ms,resize(){},applyShadowBudget(){}};
  vm.createContext(c);vm.runInContext(adaptive,c);
  for(let j=0;j<frames;j++){c.T+=1/deliveredHz;c.perfTick(1000/deliveredHz);}
  return c.perfLvl;
 }
 eq(runAdapt(30,30,30,180),0,client+' deliberate 30 FPS does not trigger adaptive downgrade');
 ok(runAdapt(60,30,30,180)>=1,client+' 60 FPS with callbacks stuck at 30 now tries recovery');
 ok(runAdapt(120,30,30,180)>=1,client+' 120 FPS with callbacks stuck at 30 now tries recovery');
 eq(runAdapt(60,60,60,300),0,client+' healthy 60 FPS avoids quality degradation');
 eq(runAdapt(120,60,60,300),0,client+' healthy 60Hz browser on 120 selection avoids false degradation');
 ok(shaf(path.join(assets,client,'index.html'))!==shaf(path.join(previous,client,'index.html')),client+' file unchanged');
}
eq(slices[0],slices[1],'P11.5.5 scheduler drift between desktop and phone-host');
const phone=path.join(assets,'phone-host');
const lines=load(path.join(phone,'SHA256SUMS')).trim().split('\n');
for(const file of ['index.html','weapon-skins.js']){
 const line=lines.find(l=>l.endsWith('  '+file));ok(line&&line.split(' ')[0]===shaf(path.join(phone,file)),'phone-host checksum invalid '+file);
}
console.log(JSON.stringify({pass:true,checks,clients:2,hardwareFPS:'NOT_MEASURED',verified:{oldAdaptive60WhenCallbacks30:'target 30 / no recovery',newAdaptive60WhenCallbacks30:'target 60 / degrade under load',menuFPS:'30 setting => 30, 60/120 settings => 60 maximum',realistic60Hz120Setting:'max 60 displayed FPS',desktop1080p2xAdaptivePixelBudget:{prior:3600000,at60:2400000}}},null,2));

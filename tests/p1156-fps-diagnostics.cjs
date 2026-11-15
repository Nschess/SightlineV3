'use strict';
// P11.5.6 source/algorithm checks. Browser/GPU FPS requires a real display.
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'AndroidProject/app/src/main/assets');
let checks=0;const ok=(v,msg)=>{assert.ok(v,msg);checks++};
const get=(p)=>fs.readFileSync(p,'utf8');
const has=(s,t,m)=>ok(s.includes(t),m||('Missing '+t));
let loopCodes=[];
for(const side of ['phone-host','www']){
 const html=get(path.join(assets,side,'index.html'));
 const lab=get(path.join(assets,side,'fps-lab.html'));
 for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if(m[1].trim()){new vm.Script(m[1]);checks++}
 for (const m of lab.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if(m[1].trim()){new vm.Script(m[1]);checks++}
 has(html,"build: 'P11.5.7'",side+' build ID');
 has(html,'data-act="p1156-fast"',side+' one-click performance control');
 has(html,'href="fps-lab.html"',side+' lab shortcut');
 has(html,"fpsCap: 60, adaptive: true, fastMode: true, renderScale: 70, shadows: 'off'",side+' fast preset GPU reduction');
 has(html,"if (k === 'fpsCap') { renderNextDue = 0; renderCap = -1; resetFpsWindow();",side+' cap reset');
 has(html,'var inPlay = state === \'live\' || state === \'roundend\', cap = inPlay ? (Number(G.fpsCap) || 0) : menuFrameCap(G.fpsCap);',side+' active cap');
 has(html,'estimatedRafCallbacksPerSecond: rafHz',side+' rAF telemetry');
 has(html,'simulationCpuMs:',side+' simulation telemetry');
 has(html,'fastFramebufferEnabled:',side+' diagnostic exposes whether fast pixels are active');
 has(html,"k === 'fastMode'",side+' fast resolution setting applies immediately');
 const a=html.indexOf('function framePixelBudget()'),b=html.indexOf('function fail(msg)',a);
 ok(a>=0 && b>a,side+' pixel budget source');
 function workload(fast,touch){const c={Math,Number,window:{devicePixelRatio:2,innerWidth:1920,innerHeight:1080},stage:{clientWidth:1920,clientHeight:1080},G:{fastMode:fast,adaptive:true,fpsCap:60,renderScale:70},perfScale:1,touchMode:touch,rafHzBest:60};vm.createContext(c);vm.runInContext(html.slice(a,b),c);return {budget:c.framePixelBudget(),pixels:Math.round(1920*1080*c.pixelRatio()**2)};}
 const standard=workload(false,false),fast=workload(true,false),mobile=workload(true,true);
 ok(standard.budget===2400000&&fast.budget===1300000&&mobile.budget===600000,side+' chosen profile actually lowers GPU budget');
 ok(fast.pixels<=1300001&&fast.pixels<standard.pixels,side+' preset reduces REAL render surface allocation');

 has(html,'cpuSubmissionMs:',side+' render CPU telemetry');
 has(html,'now - menuBotLast >= 250',side+' redundant menu bot work throttled');
 has(html,'if (inPlay) { var simMs = performance.now() - simStarted;',side+' live simulation timing');
 has(lab,'await measure(2200,null)',side+' independent no-GPU benchmark');
 has(lab,'await measure(2200,()=>gl.draw())',side+' independent GPU benchmark');
 has(lab,"document.hidden",side+' hidden-tab invalidation');
 has(lab,"navigator.clipboard.writeText",side+' copy report');
 const start=html.indexOf('function frameBudgetMs('),end=html.indexOf('function resetFpsWindow()',start);
 ok(start>=0 && end>start,side+' frame scheduler exists');
 const x={renderNextDue:0,renderCap:-1,Math};vm.createContext(x);vm.runInContext(html.slice(start,end),x);
 for(const [callbackHz,cap,target] of [[60,30,30],[60,60,60],[60,120,60],[120,60,60],[120,120,120]]){
  x.renderCap=-1;x.renderNextDue=0;let c=0;
  for(let n=0;n<callbackHz*3;n++)if(x.renderCapAllows(1000+(n+1)*1000/callbackHz,x.effectiveRenderCap(cap,callbackHz,96)))c++;
  ok(Math.abs(c/3-target)<=1,side+` ${cap} on ${callbackHz} callbacks => ${c/3}, expected ${target}`);
 }
 loopCodes.push(html.slice(start,end));
}
ok(loopCodes[0]===loopCodes[1],'host and Android fps scheduler diverged');
const server=get(path.join(assets,'phone-host/server.js'));
has(server,"'/fps-lab.html': ['fps-lab.html'",'host does not serve fps lab');
const sums=get(path.join(assets,'phone-host/SHA256SUMS')).trim().split('\n');
for(const line of sums){const [sha,name]=line.split('  ');ok(sha===crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,'phone-host',name))).digest('hex'),'checksum mismatch: '+name)}
console.log(JSON.stringify({pass:true,build:'P11.5.7',checks,clients:2,liveBrowserFPS:'NOT_MEASURED',independentLab:true,settingsPreset:'60fps,70% render scale, shadows off, low FX'},null,2));

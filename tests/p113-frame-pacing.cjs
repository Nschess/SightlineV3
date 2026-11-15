'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
let checks=0;
function ok(v,label){assert.ok(v,label);checks++;}
function equal(a,b,label){assert.deepStrictEqual(a,b,label);checks++;}
function getCode(s,start,end){const i=s.indexOf(start), j=s.indexOf(end,i);if(i<0||j<0)throw Error('Cannot extract '+start);return s.slice(i,j);}
function testOne(client) {
  const src=fs.readFileSync(path.join(root,client,'index.html'),'utf8');
  let code=getCode(src,'function frameBudgetMs','function resetFpsWindow');
  const ctx=vm.createContext({Math,renderNextDue:0,renderCap:-1});
  vm.runInContext(code,ctx);
  const eff=ctx.frameBudgetMs;
  equal(Math.round(eff(120,60)*100)/100,16.67,client+' 120 setting on 60 callback/s adapts to 60');
  equal(Math.round(eff(120,30)*100)/100,16.67,client+' 30 callback/s may be overload; target minimum 60 for recovery');
  equal(Math.round(eff(30,120)*100)/100,33.33,client+' 30 cap not penalized');
  equal(Math.round(eff(0,144)*100)/100,16.67,client+' uncapped adaptive floor is 60');
  equal(Math.round(eff(120,120)*100)/100,8.33,client+' full 120 pacing budget');
  for(const [hz,cap,expected] of [[30,120,30],[60,120,60],[120,120,120],[144,120,120],[90,60,60],[60,30,30],[120,30,30],[144,0,144],[60,0,60]]){
    ctx.renderNextDue=0;ctx.renderCap=-1;
    // Simulate first frame at 1000 ms (positive, as in real rAF timestamps).
    let count=0;
    for(let i=0;i< hz*10;i++){
      const t=1000 + (i+1)*1000/hz;
      if(ctx.renderCapAllows(t,cap))count++;
    }
    const got=count/10;
    ok(Math.abs(got-expected)<=1,client+' '+hz+' Hz callbacks at cap '+cap+' -> '+got+' fps, expected '+expected);
  }
  ok(src.includes("inPlay !== fpsWasPlaying"),client+' resets menu FPS to prevent 30 being shown during play');
  ok(src.includes("' FPS' + (G.fpsCap ? ' · limit '"),client+' labels actual measured FPS separately from selected cap');
  ok(src.includes('frameStats.renderCpuMs = performance.now() - renderStarted'),client+' CPU submission timing still instrumented');
  ok(src.includes('sampleRafCadence(now)'),client+' browser callback cadence sampled before cap');
  ok(src.includes('if (inPlay) { fpsN++; fpsT += raw / 1000; }'),client+' only counts active match frames');
  ok(src.includes('document.addEventListener(\'visibilitychange\''),client+' visibility restore timer reset');
  ok(src.includes('window.__sl.performanceInfo = performanceInfo'),client+' diagnostic accessor exported');
  // Validate adaptation behavior with actual production function and real hysteresis.
  const perfCode=getCode(src,'var perfEma = 16.7','var lastRender = 0');
  let originalCtx = {Math,frameBudgetMs:eff,G:{adaptive:true,fpsCap:120},rafHzBest:60,
    perfLvl:0,perfScale:1,botShadowsOn:true, T:1,
    resize:()=>{},applyShadowBudget:()=>{},lastChanges:[],
  };
  let c=vm.createContext(originalCtx);vm.runInContext(perfCode,c);
  for(let i=0;i<300;i++) { c.T+=1/60;c.perfTick(1000/60); }
  equal(c.perfLvl,0,client+' 60 FPS browser with cap120 does not degrade');
  c.rafHzBest=30; c.perfEma=16.7;c.perfT=0;c.perfBad=0;c.perfGood=0;
  for(let i=0;i<180;i++){c.T+=1/30;c.perfTick(1000/30);}
  ok(c.perfLvl>0,client+' 30 callbacks with cap120 must trigger recovery instead of misreading 30Hz monitor');
  c.perfLvl=0; c.perfHold=0; c.rafHzBest=60;c.perfEma=16.7;c.perfT=0;c.perfBad=0;c.perfGood=0;
  for(let i=0;i<180;i++){c.T+=1/30;c.perfTick(1000/30);}
  ok(c.perfLvl>0,client+' actual drop 60 -> 30 with previously observed 60 requests adaptive degradation');
  let result={client,checks}; return result;
}
for(const name of ['www','phone-host'])testOne(name);
console.log(JSON.stringify({success:true,checks,clients:2},null,2));

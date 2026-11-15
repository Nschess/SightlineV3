// Actual offline Infection role check in isolated file:// Chromium + SwiftShader.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),game=path.join(root,process.env.INFECTION_GAME_DIR||'AndroidProject/app/src/main/assets/www');
const source=fs.readFileSync(path.join(game,'index.html'),'utf8');
const marker=/requestAnimationFrame\(frame\);\r?\n\}\)\(\);\r?\n<\/script>/g;
const matches=Array.from(source.matchAll(marker));
assert.ok(matches.length,'offline game loop injection marker exists');
const qa=`window.__infectionRoleQa={R:R,OB:OB,P:P,SOLO_INF:SOLO_INF,tactics:SightlineTactics,get nav(){return NAV},startMatch:startMatch,beginRound:beginRound,localSquadUpdate:localSquadUpdate,stepUnit:stepUnit,setTime:function(v){T=v;},get state(){return state},get mates(){return mates},get bots(){return bots},stop:function(){window.requestAnimationFrame=function(){return 0;};}};`;
const m=matches[matches.length-1],instrumented=source.slice(0,m.index)+'requestAnimationFrame(frame);'+qa+'\n})();\n</script>'+source.slice(m.index+m[0].length);
const html=path.join(game,'.infection-role-runtime-'+process.pid+'.html');
const base=pathToFileURL(game+path.sep).href;
fs.writeFileSync(html,instrumented.replace('<head>','<head><base href="'+base+'">'));
async function main(){
  const executablePath=process.env.P18_CHROMIUM||'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
  const browser=await chromium.launch({headless:true,executablePath,args:['--allow-file-access-from-files','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking','--disable-sync','--no-first-run']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(()=>{try{Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});}catch(_){}});
    await page.goto(pathToFileURL(html).href,{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>!!window.__infectionRoleQa,null,{timeout:30000});
    const result=await page.evaluate(()=>{
      const q=window.__infectionRoleQa;q.stop();q.R.mode='infection';q.R.bots=0;q.R.mates=10;
      q.startMatch();q.beginRound();q.SOLO_INF.on=true;q.SOLO_INF.chosen=true;q.setTime(1);q.localSquadUpdate(1);
      const bots=q.mates.filter(x=>x.alive).sort((a,b)=>a.id-b.id);
      const firstGoals=bots.map(x=>x.squadGoal&&{x:x.squadGoal.x,z:x.squadGoal.z});
      q.setTime(19);q.localSquadUpdate(1);
      const patrolMoves=bots.filter((x,i)=>x.infectionRole!=='protect'&&firstGoals[i]&&x.squadGoal&&Math.hypot(x.squadGoal.x-firstGoals[i].x,x.squadGoal.z-firstGoals[i].z)>1).length;
      const occupied=[],posts=[];
      for(let i=0;i<64;i++)if(q.tactics.infectionRole(i,0)!=='protect'){const p=q.tactics.patrol(q.nav,q.P,i,0,occupied,'infection',64);if(p){occupied.push(p);posts.push(p);}}
      const h=bots.find(x=>x.infectionRole==='hide'),before={x:h.x,z:h.z},threat={alive:true,x:h.x+4,y:h.y||0,z:h.z,cr:0,pr:0};
      h.tgt=threat;h.sees=true;h.losT=10;h.seenT=0;h.cool=10;h.infectionRetreatAt=0;q.stepUnit(h,.1);
      return {state:q.state,roles:bots.map(x=>x.infectionRole),goals:bots.map(x=>x.squadGoal&&{x:x.squadGoal.x,y:x.squadGoal.y,z:x.squadGoal.z}),patrolMoves,visible:bots.filter(x=>x.g.visible).length,largeSquadPosts:posts.length,postSpan:{x:Math.max(...posts.map(p=>p.x))-Math.min(...posts.map(p=>p.x)),z:Math.max(...posts.map(p=>p.z))-Math.min(...posts.map(p=>p.z))},retreat:{goal:h.infectionRetreat,before,distanceFromThreat:Math.hypot(before.x-threat.x,before.z-threat.z),goalDistanceFromThreat:h.infectionRetreat?Math.hypot(h.infectionRetreat.x-threat.x,h.infectionRetreat.z-threat.z):0}};
    });
    assert.equal(result.state,'live');assert.equal(result.visible,10);
    assert.deepEqual(result.roles,['protect','hide','hunt','hold','hunt','hide','hunt','hold','protect','hide']);
    assert.ok(result.goals.every(Boolean),'each defender has a reachable assigned post');
    assert.ok(result.patrolMoves>=6,'non-protector allies rotate to new posts during a long match');
    for(let i=0;i<result.goals.length;i++)for(let j=i+1;j<result.goals.length;j++)assert.ok(Math.hypot(result.goals[i].x-result.goals[j].x,result.goals[i].z-result.goals[j].z)>1,'defensive posts are separated');
    assert.equal(result.largeSquadPosts,56,'all non-protector slots in a 64-bot squad get a map post');
    assert.ok(result.postSpan.x>35&&result.postSpan.z>45,'64-bot posts span the playable map');
    assert.ok(result.retreat.goal&&result.retreat.goalDistanceFromThreat>result.retreat.distanceFromThreat,'a survivor switches to a safer reachable position when infected approach');
    assert.deepEqual(errors,[],'actual game page has no runtime errors');
    console.log(JSON.stringify({pass:true,game:process.env.INFECTION_GAME_DIR||'AndroidProject/app/src/main/assets/www',runtime:'offline game renderer via isolated Chromium/SwiftShader file://',...result,errors},null,2));
  }finally{await browser.close();try{fs.unlinkSync(html);}catch(_){}}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

/* Actual-game character capture in isolated headless Chromium/SwiftShader.
   Each per-character image is a 2D contact sheet of live Sightline WebGL frames. */
const fs=require('fs'),path=require('path');
const {chromium}=require(process.env.SIGHTLINE_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'AndroidProject/app/src/main/assets/phone-host');
const mode=process.argv[2]||'after',srcOverride=process.env.SIGHTLINE_PHASE9_SOURCE||'';
const out=path.join(root,'evidence/phase9',mode);fs.mkdirSync(out,{recursive:true});
const probe=String.raw`
window.__p9={
 init:function(){R.bots=0;R.mates=0;startMatch();beginRound();clearUnits();G.fpsCap=60;G.adaptive=false;G.fps=false;G.shadows='off';G.renderScale=100;applyG();},
 list:function(){var out=[];['red','blue'].forEach(function(t){ROSTER[t].forEach(function(o){out.push({id:o.id,name:o.name,team:t,role:o.role,zombie:false,form:o.visualForm||'',faceForm:o.faceForm||''});});});allZOps().forEach(function(o){out.push({id:o.id,name:o.name,team:'infected',role:o.ztype,zombie:true,form:o.ztype+'-'+(o.zvar||0)});});return out;},
 sheet:function(id){
  var op=null;['red','blue'].some(function(t){var x=ROSTER[t].find(function(v){return v.id===id;});if(x){op=x;return true;}return false;});if(!op)op=allZOps().find(function(v){return v.id===id;});if(!op)throw new Error('Character not found: '+id);
  var u=makeUnit(0,0,op);u.x=0;u.y=0;u.z=0;u.g.position.set(0,0,0);u.g.rotation.set(0,0,0);u.yaw=0;u.alive=true;u.wasAlive=true;u.buf=[];
   if(!op.zombie){u.weapon='carbine';u.wk='carbine';ensureWorldWeapon(u,'carbine');u.worldGun.visible=true;}else{u.zombie=true;u.ztype=op.ztype;}
   u.g.updateMatrixWorld(true);function hitProbe(localY){var rc=new THREE.Raycaster(new THREE.Vector3(0,localY*op.h,3),new THREE.Vector3(0,0,-1));rc.far=8;var hits=rc.intersectObjects(u.meshes,false);return hits.length?{hit:true,head:isHeadHit(hits[0].object.userData,hits[0]),pointY:hits[0].point.y}:{hit:false,head:false};}var hitChecks={torso:hitProbe(1.18),head:hitProbe(op.zombie&&op.ztype==='sprinter'?1.60:1.72)};
  var cams=camera.children.filter(function(o){return !o.isLight;}).map(function(o){return[o,o.visible];});cams.forEach(function(p){p[0].visible=false;});
  var board=document.createElement('canvas');board.width=1280;board.height=1000;var ctx=board.getContext('2d');ctx.fillStyle='#18212a';ctx.fillRect(0,0,board.width,board.height);
  ctx.fillStyle='#e8edf1';ctx.font='bold 22px sans-serif';ctx.fillText(op.name+'  ·  '+(op.team||op.ztype)+'  ·  '+(op.visualForm||op.role||op.ztype),20,30);
  var views=[['front',[0,-1.95]],['back',[0,1.95]],['side',[1.95,0]],['threequarter',[-1.55,-1.55]],['mid',[0,-4]],['distance',[0,-8]]];
  var states=op.zombie?['walking','running','attack']:['walking','running','crouching','aiming','firing','reload'];
  var cells=views.map(function(v){return{angle:v[0],state:'idle'};}).concat(states.map(function(s){return{angle:'threequarter',state:s};}));
  var cw=320,ch=236,meta=[];
  function reset(){u.g.position.set(0,0,0);u.g.rotation.set(0,0,0);u.x=0;u.y=0;u.z=0;u.yaw=0;u.phase=0;u.g.visible=true;if(u.body){u.body.position.set(0,0,0);u.body.rotation.set(0,0,0);}if(u.legs){u.legs.position.set(-.14,.85,0);u.legs.rotation.set(0,0,0);}if(u.legR){u.legR.position.set(.14,.85,0);u.legR.rotation.set(0,0,0);}if(u.armR)u.armR.rotation.set(0,0,0);if(u.armL)u.armL.rotation.set(0,0,0);if(u.worldGun){u.worldGun.visible=true;u.weaponPulse=0;u.flash.visible=false;}}
  cells.forEach(function(cell,index){reset();var v=views.find(function(a){return a[0]===cell.angle;})||views[3];camera.position.set(v[1][0],1.35,v[1][1]);camera.lookAt(0,1.02,0);camera.updateMatrixWorld(true);
   var s={t:1000,x:0,y:0,z:0,yaw:0,pitch:0,cr:0,pr:0,al:true,rl:0},c=Object.assign({},s,{t:1100});
   if(cell.state==='walking')c.x=.18;if(cell.state==='running')c.x=.42;if(cell.state==='crouching'){s.cr=.9;c.cr=.9;}if(cell.state==='aiming'){s.pitch=.20;c.pitch=.20;}if(cell.state==='reload'){s.rl=.6;c.rl=.6;}
   if(cell.state==='firing'){u.weaponPulse=1;u.flashT=.3;u.flash.visible=true;}
   u.buf=[s,c];
   if(!op.zombie)mpPuppetStep(u,.1,1100);else{if(cell.state==='walking'||cell.state==='running'){u.phase=1.1;u.legs.rotation.x=.38;u.legR.rotation.x=-.38;}if(cell.state==='attack'){u.g.rotation.x=-.22;u.legs.rotation.x=.52;u.legR.rotation.x=-.18;}}
   var obstacleState=null;if(cell.angle==='distance'||cell.angle==='mid'){obstacleState=(obstacleMeshes||[]).map(function(o){return[o,o.visible];});(obstacleMeshes||[]).forEach(function(o){o.visible=false;});}renderer.render(scene,camera);var x=(index%4)*cw,y=48+Math.floor(index/4)*ch;ctx.drawImage(renderer.domElement,x,y,cw,ch);if(obstacleState)obstacleState.forEach(function(p){p[0].visible=p[1];});
   ctx.fillStyle='rgba(8,13,18,.88)';ctx.fillRect(x,y+ch-24,cw,24);ctx.fillStyle='#f3f5f7';ctx.font='bold 14px sans-serif';ctx.fillText(cell.angle+' · '+cell.state,x+8,y+ch-7);
   meta.push({angle:cell.angle,state:cell.state,drawCalls:renderer.info.render.calls,sceneTriangles:renderer.info.render.triangles,geometryCount:renderer.info.memory.geometries});
  });
  u.g.updateMatrixWorld(true);var bb=new THREE.Box3().setFromObject(u.g),sz=bb.getSize(new THREE.Vector3()),tpl=u.tpl;
  function tri(g){return g&&g.index?g.index.count/3:g&&g.attributes.position?g.attributes.position.count/3:0;}
  var geom=[tpl&&tpl.body,tpl&&tpl.legL,tpl&&tpl.legR,tpl&&tpl.armR,tpl&&tpl.armL].filter(Boolean),hash=2166136261;
  geom.forEach(function(g){var a=g.attributes.position.array;for(var i=0;i<a.length;i++){var n=Math.round(a[i]*10000);hash=Math.imul(hash^n,16777619);}});
  var capture=board.toDataURL('image/jpeg',.88).split(',')[1];scene.remove(u.g);cams.forEach(function(p){p[0].visible=p[1];});renderer.render(scene,camera);
  var triangleSections={body:tri(tpl&&tpl.body),leftLeg:tri(tpl&&tpl.legL),rightLeg:tri(tpl&&tpl.legR),rightArm:tri(tpl&&tpl.armR),leftArm:tri(tpl&&tpl.armL)};
   return{capture:capture,id:op.id,name:op.name,zombie:!!op.zombie,team:op.team||'infected',role:op.role||op.ztype,form:op.visualForm||op.ztype,faceForm:op.faceForm||'',bounds:[sz.x,sz.y,sz.z],bodyTriangles:geom.reduce(function(n,g){return n+tri(g);},0),triangleSections:triangleSections,fingerprint:(hash>>>0).toString(16),hitChecks:hitChecks,cells:meta};
  },
  bench:function(count,frames){
   count=count||24;frames=frames||180;var actors=[],ops=ROSTER.red.concat(ROSTER.blue);
   for(var i=0;i<count;i++){var op=ops[i%ops.length],u=makeUnit(0,0,op),col=i%6,row=Math.floor(i/6);u.x=(col-2.5)*.9;u.z=-row*.9;u.y=0;u.yaw=(col-2.5)*.08;u.alive=true;u.wasAlive=true;u.weapon='carbine';u.wk='carbine';ensureWorldWeapon(u,'carbine');u.buf=[{t:1000,x:u.x,y:0,z:u.z,yaw:u.yaw,pitch:0,cr:0,pr:0,al:true,rl:0},{t:11000,x:u.x+.12,y:0,z:u.z,yaw:u.yaw,pitch:0,cr:0,pr:0,al:true,rl:0}];scene.add(u.g);actors.push(u);}
   camera.position.set(0,2.5,9);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
   for(var w=0;w<70;w++){var tw=performance.now()+w*16.67;actors.forEach(function(u){mpPuppetStep(u,1/60,tw);});renderer.render(scene,camera);}
   var runs=[],samples=[];for(var pass=0;pass<3;pass++){for(var pre=0;pre<16;pre++){var pt=performance.now()+pass*3000+pre*16.67;actors.forEach(function(u){mpPuppetStep(u,1/60,pt);});renderer.render(scene,camera);}var times=[];for(var f=0;f<frames;f++){var t0=performance.now(),t=performance.now()+1000+pass*3000+f*16.67;actors.forEach(function(u){mpPuppetStep(u,1/60,t);});renderer.render(scene,camera);times.push(performance.now()-t0);}times.sort(function(a,b){return a-b;});function at(p){return times[Math.min(times.length-1,Math.floor((times.length-1)*p))];}runs.push({meanMs:times.reduce(function(a,b){return a+b;},0)/times.length,medianMs:at(.5),p95Ms:at(.95),p99Ms:at(.99)});samples=samples.concat(times);}
   samples.sort(function(a,b){return a-b;});function pct(p){return samples[Math.min(samples.length-1,Math.floor((samples.length-1)*p))];}
   var result={renderer:'Headless Chromium SwiftShader; synchronous JS update plus WebGL command submission, no VSync or hardware GPU',actorCount:count,measuredFramesPerRun:frames,runs:runs,meanMs:samples.reduce(function(a,b){return a+b;},0)/samples.length,medianMs:pct(.5),p95Ms:pct(.95),p99Ms:pct(.99),medianSubmissionFps:1000/Math.max(.001,pct(.5)),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries};actors.forEach(function(u){scene.remove(u.g);});return result;
   }
 };`;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const result={phase:mode,renderer:'Playable Sightline V3 buildRig/buildZRig -> bakeOp -> makeUnit, rendered by isolated Chromium SwiftShader WebGL. Contact sheets compose actual WebGL frames.',characters:[],errors:[],pass:false};
 try{
  const context=await browser.newContext({viewport:{width:800,height:450},deviceScaleFactor:1}),page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  await page.route('http://127.0.0.1:39173/**',async route=>{
   if(route.request().isNavigationRequest()){let html=fs.readFileSync(srcOverride||path.join(assets,'index.html'),'utf8'),marker='if (/[?&]debug\\b/.test(location.search)) window.__sl';if(!html.includes(marker))throw new Error('QA injection anchor missing');return route.fulfill({contentType:'text/html',body:html.replace(marker,probe+'\n'+marker)});}
   const url=new URL(route.request().url()),rel=decodeURIComponent(url.pathname.slice(1));if(!rel||rel.includes('..'))return route.fulfill({status:404,body:'Not found'});const f=path.resolve(assets,rel);if(!f.startsWith(path.resolve(assets)+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:'Not found'});
   const ext=path.extname(f).toLowerCase(),type=ext==='.js'?'application/javascript':ext==='.json'?'application/json':ext==='.png'?'image/png':ext==='.css'?'text/css':ext==='.wav'?'audio/wav':'application/octet-stream';return route.fulfill({status:200,contentType:type,body:fs.readFileSync(f)});
  });
  await page.goto('http://127.0.0.1:39173/?debug',{waitUntil:'load'});await page.evaluate(()=>window.__p9.init());const chars=await page.evaluate(()=>window.__p9.list());
  for(const ch of chars){const m=await page.evaluate(id=>window.__p9.sheet(id),ch.id),file=ch.id+'.jpg';fs.writeFileSync(path.join(out,file),Buffer.from(m.capture,'base64'));delete m.capture;result.characters.push(Object.assign({},ch,m,{file}));}
  result.benchmark=await page.evaluate(()=>window.__p9.bench(24,180));
  const humans=result.characters.filter(c=>!c.zombie),infected=result.characters.filter(c=>c.zombie);
  const byTeam={};['red','blue'].forEach(t=>{byTeam[t]=new Set(humans.filter(c=>c.team===t).map(c=>c.form)).size;});
  const allCells=result.characters.flatMap(c=>c.cells);
  result.summary={humanCount:humans.length,zombieCount:infected.length,operatorFormsPerTeam:byTeam,uniqueHumanGeometry:new Set(humans.map(c=>c.fingerprint)).size,uniqueZombieGeometry:new Set(infected.map(c=>c.fingerprint)).size,meanBodyTriangles:result.characters.reduce((n,c)=>n+c.bodyTriangles,0)/result.characters.length,maxBodyTriangles:Math.max(...result.characters.map(c=>c.bodyTriangles)),meanSceneDrawCalls:allCells.reduce((n,c)=>n+c.drawCalls,0)/allCells.length,maxSceneDrawCalls:Math.max(...allCells.map(c=>c.drawCalls)),meanSceneTriangles:allCells.reduce((n,c)=>n+c.sceneTriangles,0)/allCells.length,geometryCountAfterAllCharacters:allCells.length?allCells[allCells.length-1].geometryCount:0,pageErrors:result.errors};
  const coverage=humans.length===34&&infected.length===8&&!result.errors.length&&result.characters.every(c=>c.bounds.every(Number.isFinite)&&c.bodyTriangles>0&&c.cells.length===(c.zombie?9:12)&&c.hitChecks.torso.hit&&!c.hitChecks.torso.head&&c.hitChecks.head.hit&&c.hitChecks.head.head);
  result.pass=coverage&&(mode==='before'||(byTeam.red===17&&byTeam.blue===17&&result.summary.uniqueZombieGeometry===8));
  await context.close();
 }catch(e){result.error=e.stack;result.pass=false;console.error(e.stack);}finally{await browser.close();fs.writeFileSync(path.join(root,'evidence/phase9',mode+'-results.json'),JSON.stringify(result,null,2));}
 console.log('Rendered '+result.characters.length+' character sheets, errors '+result.errors.length+'.');console.log('RESULT '+(result.pass?'PASS':'FAIL'));process.exitCode=result.pass?0:1;
})();

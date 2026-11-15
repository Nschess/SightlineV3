'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'AndroidProject/app/src/main/assets/www');
const baseline=require(path.join(root,'rollback/android-formation-prechange-20261115/navigation.js'));
const improved=require(path.join(assets,'navigation.js'));
function maps(){const html=fs.readFileSync(path.join(assets,'index.html'),'utf8'),a=html.indexOf('function O(x, z, w, d, h, k, bottom)'),b=html.indexOf('\n];',html.indexOf('var MAPS = [',a));assert.ok(a>=0&&b>a);const ctx={};vm.createContext(ctx);vm.runInContext(html.slice(a,b+3),ctx);return ctx.MAPS;}
function graph(nav,m){const boxes=m.obst.map(o=>[o.x-o.w/2,o.x+o.w/2,o.z-o.d/2,o.z+o.d/2,o.h,o.bottom||0]);return nav.build({area:m.area,boxes,optimized:false});}
function point(n){return n?{x:n.x,y:n.y,z:n.z,k:n.k}:null;}
test('formation score prefilter retains exact ordered choices on real map graphs',()=>{let seed=59453;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);for(const m of maps().slice(0,2)){const A=graph(baseline,m),B=graph(improved,m);for(let run=0;run<36;run++){let anchor={x:m.area.x0+4+rnd()*(m.area.x1-m.area.x0-8),y:run%9===0?2:0,z:m.area.z0+4+rnd()*(m.area.z1-m.area.z0-8)},occupiedA=[],occupiedB=[];for(let i=0;i<18;i++){let wish={x:anchor.x+(rnd()-.5)*24,y:anchor.y,z:anchor.z+(rnd()-.5)*24};let x=baseline.formation(A,wish,anchor,occupiedA),y=improved.formation(B,wish,anchor,occupiedB);assert.deepEqual(point(y),point(x),m.id+' run '+run+' slot '+i);if(x)occupiedA.push(x);if(y)occupiedB.push(y);}}}});

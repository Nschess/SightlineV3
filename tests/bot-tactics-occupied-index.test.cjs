'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const tactics = require('../AndroidProject/app/src/main/assets/phone-host/bot-tactics.js');

const nav = {
  x0:0,z0:0,w:1,h:1,
  columns:[[0]],nodes:[{x:.5,y:0,z:.5}],edges:[[[0,1]]],reachable:new Uint8Array([1])
};
let seed=0x71a5;
function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;}
function referenceOccupied(candidate,points,separation){
  return points.some(p=>Math.abs((p.y||0)-candidate.y)<1.25&&Math.hypot(p.x-candidate.x,p.z-candidate.z)<separation);
}

test('indexed reservation lookup preserves exact vertical and horizontal spacing rules',()=>{
  const separations=[0,.1,1.2,2.8,4.5,Infinity,NaN];
  for(const separation of separations){
    for(let trial=0;trial<300;trial++){
      const points=Array.from({length:Math.floor(rand()*65)},()=>({
        x:(rand()-.5)*24,z:(rand()-.5)*24,y:Math.floor(rand()*5)*1.5
      }));
      if(trial%5===0)points.push({x:.5+(rand()-.5)*separation,z:.5,y:trial%10===0?1.25:0});
      const occupied=referenceOccupied(nav.nodes[0],points,separation);
      const actual=tactics.search(nav,{x:.5,y:0,z:.5},{x:.5,y:0,z:.5},points,{radius:0,separation});
      assert.equal(actual===null,occupied,`separation=${separation}, trial=${trial}`);
    }
  }
});

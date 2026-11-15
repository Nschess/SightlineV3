'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Tactics=require('../AndroidProject/app/src/main/assets/phone-host/bot-tactics.js');

let seed=0x51a7c0de;
function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;}
function boxesFixture(){
  const boxes=[];
  for(let i=0;i<420;i++){
    const x=(rand()-.5)*180,z=(rand()-.5)*160,w=.4+rand()*9,d=.4+rand()*9,bottom=rand()*2,top=bottom+1+rand()*8;
    boxes.push([x,x+w,z,z+d,top,bottom]);
  }
  // Long walls take the bounded always-test path instead of ballooning the grid.
  boxes.push([-300,300,-2,2,5,0]);
  return boxes;
}

test('indexed tactical cover rays exactly match the linear geometry predicate',()=>{
  const boxes=boxesFixture();
  assert.equal(Tactics.prepareRayIndex(boxes),true);
  assert.equal(Tactics.prepareRayIndex(boxes),true,'preparing a map twice is idempotent');
  const linearBoxes=boxes.slice();
  const fixed=[
    [{x:-40,y:1.25,z:0},{x:40,y:1.25,z:0}],
    [{x:4,y:1.25,z:-40},{x:4,y:1.25,z:40}],
    [{x:-20,y:12,z:-20},{x:20,y:12,z:20}],
    [{x:1,y:1,z:1},{x:1,y:1,z:1}]
  ];
  for(const [a,b] of fixed)assert.equal(Tactics.rayCovered(boxes,a,b),Tactics.rayCovered(linearBoxes,a,b));
  for(let i=0;i<5000;i++){
    const a={x:(rand()-.5)*240,y:rand()*12,z:(rand()-.5)*220};
    const b={x:(rand()-.5)*240,y:rand()*12,z:(rand()-.5)*220};
    assert.equal(Tactics.rayCovered(boxes,a,b),Tactics.rayCovered(linearBoxes,a,b),`segment ${i}`);
  }
});

test('bounded tactical searches return a best-so-far position and record that work yielded',()=>{
  const n=11,columns=Array.from({length:n*n},()=>[]),nodes=[],edges=[];
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){
    const id=nodes.length;nodes.push({x:x+.5,y:0,z:z+.5});edges.push([[id,1]]);columns[z*n+x].push(id);
  }
  const nav={x0:0,z0:0,w:n,h:n,columns,nodes,edges,reachable:new Uint8Array(nodes.length).fill(1),boxes:[]};
  const before=Tactics.searchDiagnostics.yieldedQueries;
  const result=Tactics.search(nav,{x:5.5,y:0,z:5.5},{x:0,y:0,z:0},[],{radius:5,maxCandidates:1});
  assert.deepEqual(result,{x:5.5,y:0,z:5.5});
  assert.equal(Tactics.searchDiagnostics.yieldedQueries,before+1);
});

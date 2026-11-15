'use strict';
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {G,players,_t:T}=require('../AndroidProject/app/src/main/assets/phone-host/server.js');
afterEach(()=>{players.clear();G.mode='versus';G.phase='lobby';G.map='courtyard';T.INF.started=false;});

test('Infection shotgun pellets apply their configured damage through the authoritative shot path',()=>{
  const before=Date.now();G.mode='infection';G.phase='live';G.map='courtyard';G.phaseEnd=before+90000;T.INF.started=true;
  const keys=['breacher','scatter','hammer','ember','thunder'];
  const expected={breacher:117,scatter:80,hammer:132,ember:72,thunder:120};
  const results=[];
  for(let i=0;i<keys.length;i++){
    const key=keys[i],shooter=T.makeBot(0),target=T.makeBot(1);
    Object.assign(shooter,{alive:true,x:0,y:0,z:9,cr:0,pr:0,armor:0,dmgMul:1,cur:key,nextShot:0,lastShot:0});
    shooter.owned.add(key);shooter.ammo[key]={mag:8,res:32};
    Object.assign(target,{alive:true,x:0,y:0,z:5,cr:0,pr:0,armor:0,hp:10000,maxhp:10000,nextPush:0,infected:true});target.hist=[];
    let seed=100+i,oldRandom=Math.random;Math.random=()=>{seed=(seed*48271)%2147483647;return (seed-1)/2147483646;};
    try{T.onShot(shooter,{w:key,d:[[0,-0.1,-1]]});}finally{Math.random=oldRandom;}
    const applied=10000-target.hp;results.push({weapon:key,expected:expected[key],applied});
    assert.ok(Math.abs(applied-expected[key])<1e-6,`${key} should land all configured body pellets at close range: ${applied}`);
  }
  assert.equal(results.length,5);
  console.log(JSON.stringify({pass:true,path:'server-authoritative Infection onShot → pellet spread → ray hits → damage',results}));
});

/* Team Deathmatch-only policy. No mutation of Tactical/Infection/Outbreak rules. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SightlineDeathmatch=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const SCORE_LIMIT=30,SCORE_LIMITS=[10,20,30,50],RESPAWN_MS=3500;
 const LOADOUTS=['pistol','hawk','kestrel','smg','mako','hammer','breacher','scatter','stinger','carbine','rampart','ranger','longbow','bulwark','aurora','tide','ember','switchback','needle','thunder','falcon','vantage','pinion','mistral','forge','bastion','cyclone'];
 function loadout(k){return LOADOUTS.includes(k)?k:'carbine';}
 function winner(score,timeExpired,limit=SCORE_LIMIT){return score[0]>=limit?0:score[1]>=limit?1:timeExpired?(score[0]===score[1]?-1:score[0]>score[1]?0:1):null;}
 /* Score existing real navigation nodes. Only current live opponents matter,
    never position packets from disconnected/dead players. Returns null if
    no position satisfies minimum space; server will retry on next spawn tick. */
 function safeSpawn(nav,id,team,live,valid){
  if(!nav||!nav.nodes||!nav.nodes.length)return null;
  const nodes=nav.nodes,N=nodes.length,start=((id*193+team*53)%N+N)%N;
  let best=null,bestScore=-Infinity;
  for(let i=0;i<Math.min(N,100);i++){
   const j=(start+i*97)%N,node=nodes[j];
   if(Math.abs(node.y)>0.25||nav.reachable&&!nav.reachable[j]||!valid(node))continue;
   let minFoe=150,minMate=150;
   for(const p of live){if(!p.alive||Math.abs((p.y||0)-node.y)>1.3)continue;
    const d=Math.hypot(p.x-node.x,p.z-node.z);
    if(p.team===team)minMate=Math.min(minMate,d);else minFoe=Math.min(minFoe,d);
   }
   if(minFoe<6||minMate<1.6)continue;
   // Do not always choose the farthest map edge: weight safe distance and
   // spread among allies, rewarding space without out-of-bounds warps.
   const score=Math.min(27,minFoe)*2+Math.min(9,minMate)*.3;
   if(score>bestScore){best=node;bestScore=score;}
  }
  return best&&{x:best.x,y:best.y,z:best.z};
 }
 return {SCORE_LIMIT,SCORE_LIMITS:SCORE_LIMITS.slice(),RESPAWN_MS,LOADOUTS:LOADOUTS.slice(),loadout,winner,safeSpawn};
});

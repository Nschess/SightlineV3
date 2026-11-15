/* Sightline Infection survivor evasion. Shared by Solo and LAN; pure navigation
   geometry only. Never locates an unseen enemy or changes combat statistics.
   Candidates are explored along REAL directed navigation edges so escape goals
   cannot land on disconnected roofs or behind an unreachable wall. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.SightlineSurvival=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function choose(N,nav,actor,threat,allies){
    if(!N||!N.nodes||!N.edges||!threat||!actor)return null;
    const dist0=Math.hypot(threat.x-actor.x,threat.z-actor.z);
    if(dist0>14 || Math.abs((actor.y||0)-(threat.y||0))>1.6)return null;
    const start=nav.nearest(N,actor.x,actor.y||0,actor.z);
    if(start<0)return null;
    const stamp=N.evadeStamp||(N.evadeStamp=new Uint32Array(N.nodes.length));
    N.evadeGen=(N.evadeGen||0)+1;
    if(N.evadeGen>=4294967295){stamp.fill(0);N.evadeGen=1;}
    const gen=N.evadeGen;
    const queue=N.evadeQueue||(N.evadeQueue=new Int32Array(N.nodes.length));
    const cost=N.evadeCost||(N.evadeCost=new Float32Array(N.nodes.length));
    let head=0,tail=1; queue[0]=start;cost[start]=0;stamp[start]=gen;
    let best=null,bestScore=-Infinity,seen=0;
    const others=allies||[];
    // At most 360 local nodes and 12 metres of legitimate travel; no A* in
    // the per-frame AI loop. Small (1.0-1.6s) retarget cooldowns at call sites.
    while(head<tail && seen++<360){
      const id=queue[head++],n=N.nodes[id],walk=cost[id];
      if(walk>12.1)continue;
      const rise=Math.abs(n.y-(actor.y||0)),away=Math.hypot(n.x-threat.x,n.z-threat.z);
      const travel=Math.hypot(n.x-actor.x,n.z-actor.z);
      if(rise<.32 && travel>=3.2 && travel<=11 && away>dist0+1.4){
        let crowd=0;
        for(let i=0;i<others.length;i++){
          const a=others[i];if(a===actor||!a.alive||Math.abs((a.y||0)-n.y)>1.1)continue;
          const d=Math.hypot(a.x-n.x,a.z-n.z);
          if(d<2.6)crowd+= (2.6-d)/2.6;
        }
        // Avoid bottleneck nodes where possible; encourage sideways escape
        // options as well as pure backwards running.
        const score=(away-dist0)*3.1-walk*.35-crowd*9+
          Math.min(4,N.edges[id].length)*.12-(travel<4?1:0);
        if(score>bestScore){best=n;bestScore=score;}
      }
      for(const e of N.edges[id]){
        const to=e[0],nd=walk+e[1];
        if(nd>12.1 || stamp[to]===gen)continue;
        const node=N.nodes[to];
        if(Math.abs(node.y-(actor.y||0))>1.15)continue;
        stamp[to]=gen;cost[to]=nd;queue[tail++]=to;
      }
    }
    return best?{x:best.x,y:best.y,z:best.z}:null;
  }
  return {choose};
});

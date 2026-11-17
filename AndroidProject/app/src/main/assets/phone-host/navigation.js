/* Shared layered navigation. Pure geometry; no renderer, sockets or player knowledge. */
(function(root,factory){ if(typeof module==='object'&&module.exports)module.exports=factory();else root.SightlineNav=factory(); })(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const radius=.42, height=1.85;
  // Static-map collision index used ONLY to obtain a superset of the same
  // rectangles the original predicate tested. Conservatively pad each bin;
  // the precise y/footprint predicate below is unchanged.
  const BLOCK_CELL=4, BLOCK_PAD=.7, blockIndex=new WeakMap(), EMPTY=[];
  function collisionCandidates(boxes,x,z,pad) {
    if(boxes.length<48||pad<0||pad>BLOCK_PAD)return boxes;
    let grid=blockIndex.get(boxes);
    if(!grid){
      grid=new Map();blockIndex.set(boxes,grid);
      for(const b of boxes){
        const x0=Math.floor((b[0]-BLOCK_PAD)/BLOCK_CELL),x1=Math.floor((b[1]+BLOCK_PAD)/BLOCK_CELL);
        const z0=Math.floor((b[2]-BLOCK_PAD)/BLOCK_CELL),z1=Math.floor((b[3]+BLOCK_PAD)/BLOCK_CELL);
        for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++){
          const key=i+','+j,arr=grid.get(key);if(arr)arr.push(b);else grid.set(key,[b]);
        }
      }
    }
    return grid.get(Math.floor(x/BLOCK_CELL)+','+Math.floor(z/BLOCK_CELL))||EMPTY;
  }
  function prepareCollisionIndex(boxes){
    if(!Array.isArray(boxes)||boxes.length<48||blockIndex.has(boxes))return false;
    collisionCandidates(boxes,0,0,BLOCK_PAD);
    return blockIndex.has(boxes);
  }
  function blocked(boxes,x,y,z,pad=radius) { return collisionCandidates(boxes,x,z,pad).some(b=>b[4]>y+.35 && (b[5]||0)<y+height && x>b[0]-pad&&x<b[1]+pad&&z>b[2]-pad&&z<b[3]+pad); }
  function build(m){
    const x0=Math.floor(m.area.x0),z0=Math.floor(m.area.z0),w=Math.ceil(m.area.x1)-x0,h=Math.ceil(m.area.z1)-z0;
    const N={x0,z0,w,h,boxes:m.boxes,nodes:[],edges:[],columns:Array.from({length:w*h},()=>[]),c:new Uint8Array(w*h),y:new Float32Array(w*h),dist:null,groundDist:null,smoothVisibilityCache:new Map(),fieldDiagnostics:{started:0,completed:0,steps:0,lastPops:0,maxPops:0,lastTotalPops:0},pathDiagnostics:{calls:0,unboundedCalls:0,maxVisits:0,maxSmoothChecks:0,maxLandingChecks:0,maxCollisionChecks:0,lastVisits:0,lastSmoothChecks:0,lastLandingChecks:0,lastCollisionChecks:0,lastRawPoints:0,lastReached:0,lastBudgetExhausted:false,lastLimit:null,smoothCacheHits:0,smoothCacheMisses:0,smoothCacheEvictions:0,smoothCollisionSamples:0}};
    let candidates=null;
    if(m.optimized){
      candidates=Array.from({length:w*h},()=>[]);
      for(const b of m.boxes){
        const il=Math.max(0,Math.floor(b[0]-radius-x0)),ir=Math.min(w-1,Math.floor(b[1]+radius-x0));
        const jt=Math.max(0,Math.floor(b[2]-radius-z0)),jb=Math.min(h-1,Math.floor(b[3]+radius-z0));
        for(let j=jt;j<=jb;j++)for(let i=il;i<=ir;i++)candidates[j*w+i].push(b);
      }
    }
    function localBoxes(x,z){
      if(!candidates)return m.boxes;
      const i=Math.floor(x-x0),j=Math.floor(z-z0);
      return i>=0&&i<w&&j>=0&&j<h?candidates[j*w+i]:m.boxes;
    }
    function blockedBuild(x,y,z){return blocked(localBoxes(x,z),x,y,z);}
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){
      const x=x0+i+.5,z=z0+j+.5,k=j*w+i,ys=[0];
      for(const b of localBoxes(x,z))if(x>=b[0]&&x<=b[1]&&z>=b[2]&&z<=b[3]&&b[4]<=8&&!ys.some(y=>Math.abs(y-b[4])<.01))ys.push(b[4]);
      ys.sort((a,b)=>a-b);
      for(const y of ys)if(!blockedBuild(x,y,z)) {const id=N.nodes.length;N.nodes.push({x,y,z,k});N.columns[k].push(id);N.edges.push([]);}
      N.c[k]=N.columns[k].length?0:1;N.y[k]=N.columns[k].length?N.nodes[N.columns[k][0]].y:0;
    }
    function clear(a,b){ const n=Math.max(2,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.15));for(let q=1;q<=n;q++){const t=q/n;/* Jump clearance above a riser, not through a wall. */const y=Math.max(a.y,b.y);if(blockedBuild(a.x+(b.x-a.x)*t,y,a.z+(b.z-a.z)*t))return false;}return true; }
    for(let id=0;id<N.nodes.length;id++){const a=N.nodes[id],i=a.k%w,j=Math.floor(a.k/w);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue;const ni=i+dx,nj=j+dz;if(ni<0||nj<0||ni>=w||nj>=h)continue;
      for(const to of N.columns[nj*w+ni]){const b=N.nodes[to],dy=b.y-a.y;if(dy>1.1||dy< -2.5||!clear(a,b))continue;
        if(dx&&dz){const side1=N.columns[j*w+ni].some(s=>Math.abs(N.nodes[s].y-Math.max(a.y,b.y))<1.11),side2=N.columns[nj*w+i].some(s=>Math.abs(N.nodes[s].y-Math.max(a.y,b.y))<1.11);if(!side1||!side2)continue;}
        N.edges[id].push([to,Math.hypot(dx,dz)+Math.max(0,dy)*1.5]);
      }
    }}
    N.reverse=Array.from({length:N.nodes.length},()=>[]);N.edges.forEach((es,a)=>es.forEach(([b,c])=>N.reverse[b].push([a,c])));return N;
  }
  function nearest(N,x,y,z){const i=Math.floor(x-N.x0),j=Math.floor(z-N.z0);let best=-1,score=Infinity;for(let r=0;r<=5;r++) {for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(r&&Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const ni=i+dx,nj=j+dz;if(ni<0||nj<0||ni>=N.w||nj>=N.h)continue;for(const id of N.columns[nj*N.w+ni]){const n=N.nodes[id];if(Math.abs(n.y-y)>1.4)continue;const s=(n.x-x)**2+(n.z-z)**2+(n.y-y)**2*9;if(s<score){score=s;best=id;}}}if(best>=0&&score< (r+1)**2)return best;}return best;}
  /* Same-height squad posts must be connected to the leader's ACTUAL deck.
     Historical raw-offset checks were a false positive; realistic 4-16 bot
     layouts also revealed duplicate/missing posts on thin Bridge decks.
     Compute each floor component once per static nav graph, then select a
     distinct reachable node for each bot. Only recomputed on squad update. */
  function formation(N,wish,anchor,reserved){
    if(!N||!wish||!anchor)return null;
    const start=nearest(N,anchor.x,anchor.y||0,anchor.z);
    if(start<0)return null;
    const y=N.nodes[start].y;
    // A jumping leader must retain their actual support floor rather than
    // sending squad goals into the air or through the underside of a bridge.
    if(Math.abs(y-(anchor.y||0))>1.45)return null;
    if(!N.floorComponents){N.floorComponents=new Int32Array(N.nodes.length);N.floorComponents.fill(-1);N.floorLists=[];}
    let component=N.floorComponents[start];
    if(component<0){
      component=N.floorLists.length;
      const list=[start];N.floorComponents[start]=component;
      for(let k=0;k<list.length;k++){
        const id=list[k],a=N.nodes[id];
        for(const [to] of N.edges[id]){
          const b=N.nodes[to];
          if(N.floorComponents[to]>=0||Math.abs(a.y-b.y)>.15||Math.abs(b.y-y)>.15)continue;
          N.floorComponents[to]=component;list.push(to);
        }
      }
      N.floorLists.push(list);
    }
    const used=reserved||[];let best=null,score=Infinity;
    function consider(id){
      if(N.floorComponents[id]!==component||N.reachable&&!N.reachable[id])return;
      const n=N.nodes[id],ax=n.x-anchor.x,az=n.z-anchor.z,ds=ax*ax+az*az;
      if(ds<2.25||ds>18*18)return;
      const wx=n.x-wish.x,wz=n.z-wish.z,value=wx*wx+wz*wz+ds*.03;
      // A candidate that cannot improve the winner needs no reservation scan.
      // Keep strict comparison so tie selection and NaN behavior are unchanged.
      if(!(value<score))return;
      for(const other of used){const dx=n.x-other.x,dz=n.z-other.z;if(dx*dx+dz*dz<1.44)return;}
      score=value;best=n;
    }
    function scan(x,z,r){
      const i=Math.floor(x-N.x0),j=Math.floor(z-N.z0),x0=Math.max(0,i-r),x1=Math.min(N.w-1,i+r),z0=Math.max(0,j-r),z1=Math.min(N.h-1,j+r);
      for(let yy=z0;yy<=z1;yy++)for(let xx=x0;xx<=x1;xx++){
        for(const id of N.columns[yy*N.w+xx])consider(id);
      }
    }
    // Nearby cell index instead of scanning every node in a 13-map ground
    // component on every squad update. Fallback scans the leader's 18m area.
    scan(wish.x,wish.z,8);
    if(!best)scan(anchor.x,anchor.z,18);
    return best;
  }
  function heap(){const a=[];return {get length(){return a.length;},clear(){a.length=0;},push(id,cost){let k=a.length;a.push([id,cost]);while(k){const p=(k-1)>>1;if(a[p][1]<=cost)break;a[k]=a[p];k=p;}a[k]=[id,cost];},pop(){const top=a[0],last=a.pop();if(a.length){let k=0;while(k*2+1<a.length){let c=k*2+1;if(c+1<a.length&&a[c+1][1]<a[c][1])c++;if(a[c][1]>=last[1])break;a[k]=a[c];k=c;}a[k]=last;}return top;}};}
  function path(N,sx,sy,sz,gx,gy,gz,maxVisits,workBudget){
    if(N.pathDiagnostics)N.pathDiagnostics.lastBudgetExhausted=false;
    const maxLandingChecks=Number.isFinite(workBudget&&workBudget.maxLandingChecks)?Math.max(0,Math.floor(workBudget.maxLandingChecks)):Infinity;
    const maxSmoothChecks=Number.isFinite(workBudget&&workBudget.maxSmoothChecks)?Math.max(0,Math.floor(workBudget.maxSmoothChecks)):Infinity;
    const maxMs=Number.isFinite(workBudget&&workBudget.maxMs)?Math.max(0,workBudget.maxMs):Infinity;
    const clock=typeof performance!=='undefined'&&typeof performance.now==='function'?()=>performance.now():()=>Date.now();
    const startedAt=Number.isFinite(maxMs)?clock():0;
    /* Include route endpoint lookup in the same budget; these local-grid
       lookups are bounded, but omitting them hid setup time from telemetry. */
    const s=nearest(N,sx,sy,sz),g=nearest(N,gx,gy,gz);if(s<0||g<0)return null;
    let visits=0,smoothChecks=0,collisionChecks=0,landingChecks=0,budgetExhausted=false;
    /* Check every expansion/collision step. The old every-eighth-step gate
       could overshoot this synchronous deadline by several milliseconds on
       high-degree map nodes, blocking the authoritative host loop. */
    function timeBudgetReached(){return Number.isFinite(maxMs)&&clock()-startedAt>=maxMs;}
    const C=N.search||(N.search={cost:new Float64Array(N.nodes.length),parent:new Int32Array(N.nodes.length),seen:new Uint32Array(N.nodes.length),closed:new Uint32Array(N.nodes.length),run:0});
    if(C.run===4294967295){C.seen.fill(0);C.closed.fill(0);C.run=0;}
    const run=++C.run;
    const costs=C.cost,parent=C.parent,seen=C.seen,closed=C.closed;
    const goal=N.nodes[g],heuristic=id=>{const n=N.nodes[id],x=Math.abs(n.x-goal.x),z=Math.abs(n.z-goal.z);return Math.max(x,z)+.4142135623730951*Math.min(x,z)+Math.max(0,goal.y-n.y)*1.5;};
    // Reuse typed arrays and a numeric heap. Avoid clearing the full map graph
    // and allocating a pair object for every relaxed edge on each bot replan.
    const Q=N.pathHeap||(N.pathHeap=fastPathHeap());Q.clear();seen[s]=run;costs[s]=0;parent[s]=-1;Q.push(s,heuristic(s));let found=false,best=s,bestHeuristic=heuristic(s);
    const limit=Number.isFinite(maxVisits)&&maxVisits>0?Math.floor(maxVisits):Infinity;
    searchLoop:while(visits<limit&&Q.pop()){const a=Q.popId;if(closed[a]===run)continue;if(timeBudgetReached()){budgetExhausted=true;break;}closed[a]=run;visits++;
      const h=heuristic(a);if(h<bestHeuristic-.01){bestHeuristic=h;best=a;}
      if(a===g){found=true;break;}for(const [b,d]of N.edges[a]){if(timeBudgetReached()){budgetExhausted=true;break searchLoop;}if(closed[b]!==run){const next=costs[a]+d,old=seen[b]===run?costs[b]:Infinity;if(next<old-1e-9){seen[b]=run;costs[b]=next;parent[b]=a;Q.push(b,next+heuristic(b));}}}}
    // Optional bounded tactical planning: follow a legal intermediate route and
    // replan from there next time, rather than freezing a 32-bot LAN tick for
    // an unbounded full-map search. Full-path callers keep the old semantics.
    if(!found&&(!Number.isFinite(limit)||best===s)){
      const D=N.pathDiagnostics;if(D){D.calls++;D.lastVisits=visits;D.lastSmoothChecks=0;D.lastLandingChecks=0;D.lastCollisionChecks=0;D.lastRawPoints=0;D.lastReached=0;D.lastBudgetExhausted=budgetExhausted;D.lastLimit=Number.isFinite(limit)?limit:null;if(!Number.isFinite(limit))D.unboundedCalls++;D.maxVisits=Math.max(D.maxVisits,visits);}
      return null;
    }
    const destination=found?g:best;
    const rawIds=[];for(let a=destination;a>=0;a=parent[a]){rawIds.push(a);if(a===s)break;}rawIds.reverse();
    const raw=rawIds.map(id=>{const n=N.nodes[id];return[n.x,n.z,n.y];});
    // In a drop, the first lower grid center can be close enough to the
    // upper platform that ground collision snaps an actor back upstairs.
    // Prefer a second LEGALLY connected landing node, when its straight
    // descent is unobstructed at takeoff height. No graph edge is added.
    landingLoop:for(let i=1;i<raw.length-1;i++){
      const a=raw[i-1],b=raw[i],c=raw[i+1];
      if(a[2]-b[2]<=.35 || Math.abs(c[2]-b[2])>.02)continue;
      const d=Math.hypot(a[0]-c[0],a[1]-c[1]);let ok=d<=2.9;
      for(let k=1;ok&&k<=Math.ceil(d/.2);k++){
        if(landingChecks>=maxLandingChecks||timeBudgetReached()){budgetExhausted=true;break landingLoop;}
        landingChecks++;
        const t=k/Math.ceil(d/.2);
        collisionChecks++;if(blocked(N.boxes,a[0]+(c[0]-a[0])*t,a[2],a[1]+(c[1]-a[1])*t))ok=false;
      }
      if(ok){raw.splice(i,1);rawIds.splice(i,1);i--;}
    }
    // Path smoothing is also work in the authoritative tick. Bound its line
    // tests; when the budget runs out, keep the already-verified raw graph
    // waypoints rather than doing unbounded visibility scans around obstacles.
    const smoothLimit=Math.min(Number.isFinite(maxSmoothChecks)?maxSmoothChecks:Infinity,Number.isFinite(limit)?Math.max(240,Math.min(1800,limit*3)):6000);
    const out=[];let smoothCapped=false;
    for(let i=0;i<raw.length;){
      out.push(raw[i]);let j=i+1;
      for(let q=i+2;q<Math.min(raw.length,i+14);q++){
        if(Math.abs(raw[q][2]-raw[i][2])>.01)break;
        const A=raw[i],B=raw[q],idA=rawIds[i],idB=rawIds[q],cache=N.smoothVisibilityCache,key=idA<idB?idA*N.nodes.length+idB:idB*N.nodes.length+idA;let ok=true;
        if(cache&&cache.has(key)){
          /* Static nav geometry makes this segment result exact for every bot.
             Preserve the original sample cap by charging the remembered sample
             count, but skip repeating the expensive collision queries. */
          const memo=cache.get(key);
          if(smoothChecks+memo.samples>smoothLimit||timeBudgetReached()){
            ok=false;smoothCapped=true;budgetExhausted=true;break;
          }
          smoothChecks+=memo.samples;
          if(N.pathDiagnostics)N.pathDiagnostics.smoothCacheHits++;
          if(!memo.clear)break;
          j=q;continue;
        }
        if(N.pathDiagnostics)N.pathDiagnostics.smoothCacheMisses++;
        const steps=Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])/.2);let complete=true,segmentSamples=0;
        for(let k=1;k<=steps;k++){
          const timeCap=timeBudgetReached();if(smoothChecks>=smoothLimit||timeCap){ok=false;complete=false;smoothCapped=true;budgetExhausted=true;break;}
          smoothChecks++;segmentSamples++;collisionChecks++;
          if(N.pathDiagnostics)N.pathDiagnostics.smoothCollisionSamples++;
          if(blocked(N.boxes,A[0]+(B[0]-A[0])*k/steps,A[2],A[1]+(B[1]-A[1])*k/steps)){ok=false;break;}
        }
        if(complete&&cache){
          if(cache.size>=16384){const oldest=cache.keys().next().value;cache.delete(oldest);if(N.pathDiagnostics)N.pathDiagnostics.smoothCacheEvictions++;}
          cache.set(key,{clear:ok,samples:segmentSamples});
        }
        if(!ok)break;j=q;
      }
      if(smoothCapped){for(let q=i+1;q<raw.length;q++)out.push(raw[q]);break;}
      i=Math.max(i+1,j);
    }
    const D=N.pathDiagnostics;if(D){D.calls++;D.lastVisits=visits;D.lastSmoothChecks=smoothChecks;D.lastLandingChecks=landingChecks;D.lastCollisionChecks=collisionChecks;D.lastRawPoints=raw.length;D.lastReached=found?1:0;D.lastBudgetExhausted=budgetExhausted;D.lastLimit=Number.isFinite(limit)?limit:null;if(!Number.isFinite(limit))D.unboundedCalls++;D.maxVisits=Math.max(D.maxVisits,visits);D.maxSmoothChecks=Math.max(D.maxSmoothChecks,smoothChecks);D.maxLandingChecks=Math.max(D.maxLandingChecks,landingChecks);D.maxCollisionChecks=Math.max(D.maxCollisionChecks,collisionChecks);}
    return out;
  }
  function fastPathHeap(){
    let ids=new Int32Array(512),scores=new Float64Array(512),length=0;
    return {popId:-1,
      clear(){length=0;},
      push(id,score){
        if(length===ids.length){const next=new Int32Array(ids.length*2),ns=new Float64Array(scores.length*2);next.set(ids);ns.set(scores);ids=next;scores=ns;}
        let k=length++;while(k){const p=(k-1)>>1;if(scores[p]<=score)break;ids[k]=ids[p];scores[k]=scores[p];k=p;}ids[k]=id;scores[k]=score;
      },
      pop(){
        if(!length)return false;
        this.popId=ids[0];const n=--length;
        if(n){const id=ids[n],score=scores[n];let k=0;
          while(k*2+1<n){let c=k*2+1;if(c+1<n&&scores[c+1]<scores[c])c++;if(scores[c]>=score)break;ids[k]=ids[c];scores[k]=scores[c];k=c;}
          ids[k]=id;scores[k]=score;
        }
        return true;
      }
    };
  }
  function fieldStart(N,targets){
    if(!N||!Array.isArray(targets))return false;
    if(!N.fieldBuffers)N.fieldBuffers=[new Float64Array(N.nodes.length),new Float64Array(N.nodes.length)];
    if(!N.groundFieldBuffers)N.groundFieldBuffers=[new Float64Array(N.w*N.h),new Float64Array(N.w*N.h)];
    const d=N.fieldBuffers[N.dist===N.fieldBuffers[0]?1:0];d.fill(Infinity);
    const ground=N.groundFieldBuffers[N.groundDist===N.groundFieldBuffers[0]?1:0];ground.fill(Infinity);
    const Q=N.fieldHeap||(N.fieldHeap=heap());Q.clear();
    for(const t of targets){const id=nearest(N,t.x,t.y||0,t.z);if(id>=0&&d[id]!==0){d[id]=0;Q.push(id,0);}}
    N.fieldWork={dist:d,ground,heap:Q,pops:0};if(N.fieldDiagnostics)N.fieldDiagnostics.started++;
    return true;
  }
  function fieldStep(N,maxPops=160){
    const work=N&&N.fieldWork;if(!work)return !!(N&&N.dist);
    const limit=Number.isFinite(maxPops)?Math.max(1,Math.floor(maxPops)):Infinity;let used=0;
    while(used<limit&&work.heap.length){const [a,c]=work.heap.pop();used++;work.pops++;if(c>work.dist[a]+1e-4)continue;
      const node=N.nodes[a];if(node.y<.3&&Number.isFinite(c)&&c<work.ground[node.k])work.ground[node.k]=c;
      for(const [b,k]of N.reverse[a])if(c+k<work.dist[b]){work.dist[b]=c+k;work.heap.push(b,c+k);}
    }
    if(N.fieldDiagnostics){N.fieldDiagnostics.steps++;N.fieldDiagnostics.lastPops=used;N.fieldDiagnostics.maxPops=Math.max(N.fieldDiagnostics.maxPops,used);}
    if(work.heap.length)return false;
    N.dist=work.dist;N.groundDist=work.ground;N.fieldWork=null;
    if(N.fieldDiagnostics){N.fieldDiagnostics.completed++;N.fieldDiagnostics.lastTotalPops=work.pops;}
    return true;
  }
  function field(N,targets){fieldStart(N,targets);while(N.fieldWork)fieldStep(N,Infinity);return N.dist;}
  // A stuck hunter can temporarily avoid the exact failed waypoint. Always
  // use graph edges and finite flow cost; never "recover" by ghosting through a wall.
  function next(N,x,y,z,avoid){
    const id=nearest(N,x,y,z);if(id<0||!N.dist)return null;
    let best=-1,score=Infinity;const here=N.dist[id];
    for(const [b] of N.edges[id]){
      const n=N.nodes[b],cost=N.dist[b];if(!Number.isFinite(cost))continue;
      const penalty=avoid&&Math.hypot(n.x-avoid[0],n.z-avoid[1])<0.8?8:0;
      const candidate=cost+penalty;
      // Permit one short lateral detour when avoiding a stuck corner, not
      // an unbounded uphill/random walk that burns server time.
      if(candidate<score && (cost<here-.0001 || (avoid && cost<=here+1.6))){score=candidate;best=b;}
    }
    if(best<0)return null;
    const n=N.nodes[best],start=N.nodes[id];
    // Descending off a deck: the adjacent lower-floor grid center often lies
    // exactly under the upper platform's collision radius. If the zombie
    // steps back into that support zone it is snapped upstairs again forever.
    // On a verified 2-edge walkable corridor, aim one node farther onto the
    // landing. No teleport; physics still simulates the fall and collisions.
    if(start.y-n.y>.35){
      let landing=-1,landingCost=Infinity;
      for(const [c] of N.edges[best]){
        const q=N.nodes[c];if(q.y!==n.y||N.dist[c]>=N.dist[best]-.0001)continue;
        const d=Math.hypot(q.x-start.x,q.z-start.z),steps=Math.ceil(d/.2);
        let clear=true;
        for(let k=1;k<=steps;k++)if(blocked(N.boxes,start.x+(q.x-start.x)*k/steps,start.y,start.z+(q.z-start.z)*k/steps)){clear=false;break;}
        if(clear&&N.dist[c]<landingCost){landing=c;landingCost=N.dist[c];}
      }
      if(landing>=0){const q=N.nodes[landing];return[q.x,q.z,q.y];}
    }
    return [n.x,n.z,n.y];
  }
  // Jump before walking into a riser. Hold x/z until feet clear the ledge;
  // gravity and actual collision resolution remain owned by each game mode.
  // A drop never boosts vertical velocity and never teleports the actor.
  function stepVertical(actor,targetY,grounded){
    if(!Number.isFinite(targetY))return 1;
    const rise=targetY-actor.y;
    if(rise>.35 && rise<=1.1){
      if(grounded && (actor.vy||0)<=0)actor.vy=7.4;
      return actor.y < targetY-.32 ? 0 : 1;
    }
    return 1;
  }
  return {build,path,field,fieldStart,fieldStep,next,nearest,blocked,prepareCollisionIndex,formation,stepVertical};
});



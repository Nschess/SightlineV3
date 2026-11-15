'use strict';
const {performance}=require('node:perf_hooks');
const Nav=require('../AndroidProject/app/src/main/assets/phone-host/navigation.js');
const {DATA,MAPS}=require('../AndroidProject/app/src/main/assets/phone-host/server.js');
const runs=Math.max(1,Math.min(5,Number(process.argv[2]||3))),out=[];
for(const spec of DATA.maps){
 const source=MAPS[spec.id],times=[],nodes=[],edges=[];
 for(let i=0;i<runs;i++){
  const m={...source,boxes:source.boxes.map(b=>b.slice()),optimized:spec.id==='blackwater_old_quarter'};
  const start=performance.now(),nav=Nav.build(m);times.push(performance.now()-start);nodes.push(nav.nodes.length);edges.push(nav.edges.reduce((n,e)=>n+e.length,0));
 }
 const sorted=[...times].sort((a,b)=>a-b);
 out.push({map:spec.id,boxes:source.boxes.length,runs,firstBuildMs:+times[0].toFixed(2),medianMs:+sorted[Math.floor(sorted.length/2)].toFixed(2),nodes:nodes[0],edges:edges[0]});
}
console.log(JSON.stringify({test:'cold synchronous LAN navigation graph build cost',claim:'measurement only; not a gameplay result',maps:out,slowest:out.reduce((a,b)=>b.firstBuildMs>a.firstBuildMs?b:a,out[0])},null,2));

#!/usr/bin/env node
// Non-rendered structural complement to representative real WebGL map-load tests.
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'AndroidProject/app/src/main/assets/www/index.html'),'utf8');
const begin=html.indexOf('var MAPS = [');const end=html.indexOf('\nvar DEFTEX',begin);
if(begin<0||end<begin)throw Error('MAPS source missing');
const code='function O(x,z,w,d,h,k,bottom){return {x,z,w,d,h,k,...(bottom?{bottom}:{})};}\n'+html.slice(begin,end)+'\nMAPS';
const maps=vm.runInNewContext(code,{}, {timeout:2000});
const host=JSON.parse(fs.readFileSync(path.join(root,'AndroidProject/app/src/main/assets/phone-host/data.json'),'utf8')).maps;
const hostIDs=host.map(x=>x.id);let fails=[];const summary=[];
const offlineOnly=maps.filter(m=>!hostIDs.includes(m.id)).map(m=>m.id);const hostOnly=hostIDs.filter(id=>!maps.some(m=>m.id===id));if(hostOnly.length)fails.push('Host-only maps missing offline '+hostOnly.join(','));
for(const m of maps){const a=m.area,s=m.spawn,b=m.botSpawn;
  const inside=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&x>=a.x0&&x<=a.x1&&z>=a.z0&&z<=a.z1;
  if(!(a.x0<a.x1&&a.z0<a.z1&&inside(s.x,s.z)))fails.push(m.id+': invalid arena/player spawn');
  if(!b||!inside(b.x0,b.z0)||!inside(b.x1,b.z1)||b.x0>b.x1||b.z0>b.z1)fails.push(m.id+': invalid enemy spawn region');
  if(!m.view||!m.tex||!m.tex.floor||!Array.isArray(m.zones)||!Array.isArray(m.obst)||!Array.isArray(m.notes))fails.push(m.id+': required render/nav schema missing');
  for(const o of m.obst){if(!(o.w>0&&o.d>0&&o.h>0&&Number.isFinite(o.x)&&Number.isFinite(o.z)))fails.push(m.id+': invalid obstacle');}
  summary.push({id:m.id,obstacles:m.obst.length,zones:m.zones.length,area:[a.x0,a.x1,a.z0,a.z1]});
}
const result={pass:fails.length===0,mapCount:maps.length,hostMapCount:host.length,offlineOnlyMaps:offlineOnly,hostOnlyMaps:hostOnly,maps:summary,failures:fails,scope:'All offline map config schema and bounds, matching phone-host data IDs; not equivalent to WebGL loads of every map'};
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;

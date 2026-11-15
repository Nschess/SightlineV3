'use strict';
/* Loopback-only, dependency-free A/B preview of ACTUAL P11.3 and P11.4 game HTML.
   No WebSocket/phone host runtime; intended for offline visual and audio review. */
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),base=path.join(root,'AndroidProject/app/src/main/assets/www'),
 before=path.join(root,'rollback/P114-P113-LONGBOW-EXACT-FILES/AndroidProject/app/src/main/assets/www/index.html');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
const port=Number(process.env.P114_PREVIEW_PORT||8091);
const server=http.createServer((req,res)=>{
 try{
  const parsed=new URL(req.url,'http://127.0.0.1:'+port);
  let p=decodeURIComponent(parsed.pathname).replace(/\\/g,'/');
  if(p==='/'||p==='/before'||p==='/after'){
    res.writeHead(302,{Location:'/before/index.html?debug'});res.end();return;
  }
  const parts=p.split('/').filter(Boolean),variant=parts.shift();
  if(variant!=='before'&&variant!=='after')throw Error('not found');
  let filename=parts.join('/')||'index.html';
  if(!filename||filename.startsWith('/')||filename.split('/').includes('..'))throw Error('invalid path');
  const onDisk=(filename==='index.html'&&variant==='before')?before:path.resolve(base,filename);
  if(filename!=='index.html'&&!(onDisk===base||onDisk.startsWith(base+path.sep)))throw Error('out of root');
  if(!fs.existsSync(onDisk)||!fs.statSync(onDisk).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(onDisk)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(onDisk).pipe(res);
 }catch(e){res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>{
 console.log('Sightline Longbow P11.3 vs P11.4 LOCAL A/B PREVIEW');
 console.log('BEFORE: http://127.0.0.1:'+port+'/before/index.html?debug');
 console.log('AFTER:  http://127.0.0.1:'+port+'/after/index.html?debug');
 console.log('Use the same map, weapon, optics, settings and camera; evaluate ONE tab at a time.');
 console.log('Controls: Ctrl+C to stop. Offline gameplay only, no LAN host runtime.');
});

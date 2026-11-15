const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'assets','firstperson-hands');
const runtime='C:\\Users\\LOCAL_USER\\Documents\\Codex\\2026-10-22\\now-merge-them-the-old-version\\work\\character-production\\preview';
(async()=>{
 const input=process.argv[2]||'rifle-hands.glb';
 const output=process.argv[3]||input.replace('.glb','-preview.png');
 const browser=await chromium.launch({headless:true,executablePath:process.env.SIGHTLINE_CHROMIUM_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('console',m=>console.log('CONSOLE',m.type(),m.text()));page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await page.setContent('<!doctype html><html><body style="margin:0;background:#30383c"></body></html>');
 await page.addScriptTag({path:path.join(runtime,'three.min.js')});
 await page.addScriptTag({path:path.join(runtime,'GLTFLoader-r128.js')});
 const glb=fs.readFileSync(path.join(root,input)).toString('base64');
 const stats=await page.evaluate(async b64=>{
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x30383c);
  const camera=new THREE.PerspectiveCamera(48,1280/720,.01,20);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,720);renderer.outputEncoding=THREE.sRGBEncoding;document.body.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe2edff,0x303637,1.8));const key=new THREE.DirectionalLight(0xfff1d9,1.7);key.position.set(-2,-3,5);scene.add(key);
  const fill=new THREE.DirectionalLight(0x9ebad5,.7);fill.position.set(2,2,4);scene.add(fill);
  const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer;
  await new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(bin,'',g=>{scene.add(g.scene);scene.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(g.scene);const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());camera.position.set(center.x,center.y,box.max.z+Math.max(size.x,size.y,size.z)*1.75);camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);const items=[];g.scene.traverse(o=>{if(o.isMesh){const b=new THREE.Box3().setFromObject(o);const lb=o.geometry.boundingBox||o.geometry.computeBoundingBox();items.push({name:o.name,verts:o.geometry.attributes.position.count,localMin:lb.min.toArray(),localMax:lb.max.toArray(),worldMin:b.min.toArray(),worldMax:b.max.toArray(),pos:o.position.toArray(),material:Array.isArray(o.material)?o.material.map(m=>m.name):o.material.name})}});window.assetStats={min:box.min.toArray(),max:box.max.toArray(),size:size.toArray(),center:center.toArray(),rootChildren:g.scene.children.length,items,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,roots:g.scene.children.map(n=>({name:n.name,type:n.type,children:n.children.map(c=>({name:c.name,type:c.type}))}))};resolve()},reject));
  return window.assetStats;
 },glb);
 console.log('ASSET_BOUNDS',JSON.stringify(stats));
 await page.screenshot({path:path.join(root,output)});console.log('SCREENSHOT',path.join(root,output));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});

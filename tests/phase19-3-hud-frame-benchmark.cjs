'use strict';
// Compare the saved Phase 19.1 HUD baseline with the current HUD in the actual game renderer.
// All browser traffic stays on an isolated 127.0.0.1 listener; Chromium uses SwiftShader.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const gameRoot = path.join(root, 'AndroidProject/app/src/main/assets/phone-host');
const output = path.join(root, 'evidence/phase19.3');
const basePath = path.join(output, 'baseline-phone-host-index.html');
const currentPath = path.join(gameRoot, 'index.html');
function instrument(file) {
  const source = fs.readFileSync(file, 'utf8');
  const marker = Array.from(source.matchAll(/requestAnimationFrame\(frame\);\r?\n\}\)\(\);\r?\n<\/script>/g)).at(-1);
  if (!marker) throw new Error(`Game-loop hook missing in ${file}`);
  const hook = 'window.__hudBench={R:R,startMatch:startMatch,beginRound:beginRound,get state(){return state},get touchMode(){return touchMode}};';
  return source.slice(0, marker.index) + 'requestAnimationFrame(frame);' + hook + '\n})();\n</script>' + source.slice(marker.index + marker[0].length);
}
const pages = { baseline: instrument(basePath), after: instrument(currentPath) };
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end(); return; }
  const match = pathname.match(/^\/(baseline|after)(?:\/(.*))?$/);
  if (!match) { res.writeHead(404).end(); return; }
  const variant = match[1], relative = match[2] || '';
  if (!relative || relative === 'index.html') {
    res.writeHead(200, { 'content-type':mime['.html'], 'cache-control':'no-store' });
    res.end(pages[variant]); return;
  }
  const file = path.resolve(gameRoot, '.' + path.sep + relative);
  if (file !== gameRoot && !file.startsWith(gameRoot + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control':'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
function summarize(values) {
  const sorted = values.slice().sort((a,b)=>a-b);
  const mean = values.reduce((sum,x)=>sum+x,0)/values.length;
  const at = p => sorted[Math.min(sorted.length-1, Math.floor((sorted.length-1)*p))];
  return { frames:values.length, meanFrameMs:+mean.toFixed(3), medianFrameMs:+at(.5).toFixed(3), p95FrameMs:+at(.95).toFixed(3), p99FrameMs:+at(.99).toFixed(3), maxFrameMs:+sorted.at(-1).toFixed(3), meanRafFps:+(1000/mean).toFixed(1) };
}
async function main() {
  await fs.promises.mkdir(output,{recursive:true});
  const browserPath = process.env.P19_CHROMIUM || 'C:/Users/LOCAL_USER/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe';
  let browser;
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    if (server.address().address !== '127.0.0.1') throw new Error('Refusing non-loopback runtime');
    browser = await chromium.launch({ headless:true, executablePath:browserPath, args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-networking','--disable-sync','--no-first-run'] });
    const trials=[];
    for (const variant of ['baseline','after','after','baseline']) {
      const context = await browser.newContext({ viewport:{width:1280,height:720}, isMobile:true, hasTouch:true, deviceScaleFactor:1 });
      const page = await context.newPage();
      await page.route(/^https?:\/\//, route => { const u=new URL(route.request().url()); if(u.hostname==='127.0.0.1'&&Number(u.port)===server.address().port) route.continue(); else route.abort(); });
      await page.goto(`http://127.0.0.1:${server.address().port}/${variant}/`,{waitUntil:'load',timeout:60000});
      await page.waitForFunction(()=>window.__hudBench&&window.__hudBench.touchMode,null,{timeout:30000});
      await page.evaluate(()=>{const q=__hudBench;q.R.mode='tactical';q.R.bots=0;q.R.mates=0;q.startMatch();q.beginRound();});
      await page.waitForFunction(()=>__hudBench.state==='live',null,{timeout:10000});
      await page.waitForTimeout(1200);
      const frames = await page.evaluate(()=>new Promise(resolve=>{const out=[];let prev=0;const started=performance.now();function tick(now){if(prev)out.push(now-prev);prev=now;if(now-started<6000)requestAnimationFrame(tick);else resolve(out);}requestAnimationFrame(tick);}));
      trials.push({ variant, ...summarize(frames) });
      await context.close();
    }
    const meanMetric=(variant,key)=>{const vals=trials.filter(t=>t.variant===variant).map(t=>t[key]);return vals.reduce((a,b)=>a+b,0)/vals.length;};
    const beforeP95=meanMetric('baseline','p95FrameMs'),afterP95=meanMetric('after','p95FrameMs');
    const result={environment:'isolated headless Chromium + SwiftShader WebGL; 1280x720 touch viewport; real Sightline game match',roundsPerVariant:2,trials,comparison:{baselineMeanP95Ms:+beforeP95.toFixed(3),afterMeanP95Ms:+afterP95.toFixed(3),p95ChangePercent:+(((afterP95-beforeP95)/beforeP95)*100).toFixed(2),interpretation:'Software-rendered browser comparison only; not a physical-device GPU/FPS result.'}};
    fs.writeFileSync(path.join(output,'frame-time-comparison.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally {
    if(browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

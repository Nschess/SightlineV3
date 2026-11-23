const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),test=require('node:test');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
function fn(s,n){let a=s.indexOf('function '+n+'(');assert(a>=0,n);const line=s.slice(a,s.indexOf('\n',a));return line.endsWith('}')?line:s.slice(a,s.indexOf('\n}',a)+2);}
test('approved unchanged HUD and gameplay paths stay exact alongside integrated touch behavior',()=>{
  for(const tree of ['www','phone-host']){
    const now=read('AndroidProject/app/src/main/assets/'+tree+'/index.html'),original=read('recovery/hud51-runtime/assets/'+tree+'/index.html');
    for(const name of ['showDamageDirection','respawnSoloFFA','mpBombAction','mpBombUse','updateHud','groundAt','ceilingAt']){
      if(original.includes('function '+name+'('))assert.equal(fn(now,name),fn(original,name),tree+' '+name);
      else assert(!now.includes('function '+name+'('),tree+' preserves mode-specific absence of '+name);
    }
    const action=fn(now,'renderTouchActionButton');
    assert.match(action,/setAttribute\('aria-label'/,tree+' action buttons keep accessible labels');
    assert.match(action,/setT\(el\.querySelector\('\.tb-label'\),label\)/,tree+' action labels update through the shared helper');
    const touch=fn(now,'applyMobileHud');
    assert.match(touch,/renderTouchActionButton\(/,tree+' applies the accessible shared action control renderer');
    assert.match(touch,/tb-prone/,tree+' keeps the direct Prone action');
    assert(now.includes('android51-restored-hud'));
  }
});
test('all startup script dependencies exist and are permitted by unchanged WebView allowlist',()=>{const native=read('AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');for(const tree of ['www','phone-host']){const html=read('AndroidProject/app/src/main/assets/'+tree+'/index.html');for(const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)){const src=m[1].replace(/^\.\//,'');assert(!src.includes('://'));assert(fs.statSync(path.join(root,'AndroidProject/app/src/main/assets',tree,src)).isFile(),src);assert(native.includes('"'+src+'"'),src+' allowed');}}for(const s of ['settings.setJavaScriptEnabled(true)','settings.setDomStorageEnabled(true)','settings.setAllowFileAccess(false)','settings.setAllowUniversalAccessFromFileURLs(false)','web.loadUrl(OFFLINE_URL)'])assert(native.includes(s),s);});
test('acceptance identity is separate; landscape/hardware startup and release policy are preserved',()=>{const gradle=read('AndroidProject/app/build.gradle'),main=read('AndroidProject/app/src/main/AndroidManifest.xml'),diagnostic=read('AndroidProject/app/src/diagnostic/AndroidManifest.xml'),version=read('AndroidProject/app/version.properties');assert(gradle.includes("applicationId 'com.sightline.v3'"));assert(gradle.includes("applicationIdSuffix '.diagnostic.acceptance'"));assert(gradle.includes("res.srcDir('src/debug/res')"));assert(diagnostic.includes('android:usesCleartextTraffic="true"'));assert(main.includes('android:screenOrientation="sensorLandscape"'));assert(main.includes('android:hardwareAccelerated="true"'));assert(main.includes('${applicationId}.fileprovider'));assert(read('AndroidProject/app/src/main/res/xml/network_security_config.xml').includes('cleartextTrafficPermitted="false"'));assert(read('AndroidProject/app/src/debug/res/xml/network_security_config.xml').includes('cleartextTrafficPermitted="true"'));const code=Number(version.match(/^VERSION_CODE=(\d+)$/m)?.[1]);assert(Number.isSafeInteger(code)&&code>=18);assert(gradle.includes('Android private debug source-integrity check failed'));});

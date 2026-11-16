const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');
const helpers=`var mpLocalHostOwned=false, mpLocalHostPending=false;
function mpNativeLan() { return navigator.userAgent.indexOf('SightlineAndroid')>=0 && location.hostname==='appassets.androidplatform.net'; }
function mpPlatformLanMarkup() {
  if(!mpNativeLan()&&!mpLanDiscoveryBridge())return '';
  return '<div class="setfoot"><button type="button" class="btn" data-net="create-local"'+(mpLocalHostPending?' disabled':'')+'>CREATE MATCH</button><button type="button" class="btn ghost" data-net="find-local">FIND LAN MATCH</button></div>'+(mpLocalHostOwned?'<button type="button" class="btn ghost" data-net="stop-local">Stop Hosting</button>':'');
}
function mpCreateLocalHost() {
  if(mpNativeLan()){location.href='sightlinelan://create';return;}
  if(!mpLanDiscoveryBridge()||mpLocalHostPending)return;
  var n=$('#mp-name');if(n)MP.name=n.value;
  mpLocalHostPending=true;MP.status='Starting your match…';MP.err='';renderOps();
  fetch('/__sightline/lan/create',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){return r.json();}).then(function(result){
    if(!result.ok||!result.room||!mpLanPrivateIp(result.room.address)||result.room.port!==8080||result.room.verified!==true)throw Error(result.error||'Local host did not become ready.');
    mpLocalHostOwned=true;MP.addr=result.room.address+':8080';MP.status='Joining your match…';mpConnect();
  }).catch(function(e){MP.err=String(e.message||'Could not create match');}).finally(function(){mpLocalHostPending=false;renderOps();});
}
function mpStopLocalHost() {if(!mpLocalHostOwned)return;fetch('/__sightline/lan/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){if(!r.ok)throw Error('Host shutdown failed');mpLocalHostOwned=false;mpLeave();renderOps();}).catch(function(e){MP.err=e.message;renderOps();});}
window.addEventListener('pagehide',function(){if(mpLocalHostOwned)fetch('/__sightline/lan/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true}).catch(function(){});});
`;
for(const tree of ['www','phone-host']){const p=path.join(root,'AndroidProject/app/src/main/assets',tree,'index.html');let s=fs.readFileSync(p,'utf8'),nl=s.includes('\r\n')?'\r\n':'\n';s=s.replace(/\r\n/g,'\n');if(s.includes('function mpNativeLan()'))throw Error('LAN platform integration already present');
 s=s.replace('function mpLanDiscoveryBridge() {',helpers+'function mpLanDiscoveryBridge() {');
 s=s.replace("h += '<p>Play with friends on the same Wi-Fi or phone hotspot. A PC host can be found automatically from the local Sightline client. Manual private IP remains available as a fallback.</p>' +","h += '<p>Play together on the same Wi-Fi or phone hotspot.</p>' + mpPlatformLanMarkup() +");
 s=s.replace("'<div class=\"srow\"><label class=\"lb\" for=\"mp-addr\">'", "'<details><summary>Advanced · join by address</summary><div class=\"srow\"><label class=\"lb\" for=\"mp-addr\">'");
 s=s.replace("(MP.status ? '<p class=\"small\">'", "'</details>' + (MP.status ? '<p class=\"small\">'");
 s=s.replace('  var me = mpMe(), isHost = !!(me && me.host), lobbyPhase',"  if(mpLocalHostOwned)h+='<div class=\"setfoot\"><button type=\"button\" class=\"btn ghost\" data-net=\"stop-local\">Stop Hosting</button></div>';\n  var me = mpMe(), isHost = !!(me && me.host), lobbyPhase");
 s=s.replace("  if (a === 'connect')", "  if(a==='create-local'){mpCreateLocalHost();return;}\n  if(a==='find-local'){if(mpNativeLan())location.href='sightlinelan://find';else mpScanLanHosts(true);return;}\n  if(a==='stop-local'){mpStopLocalHost();return;}\n  if (a === 'connect')");
 // Stop constant background scans; scan on entering the screen and explicit Refresh only.
 s=s.replace("if(mpLanDiscoveryBridge()&&menuTab==='net'&&$('#mp-discovery-state'))MP_LAN_DISCOVERY.timer=setTimeout(function(){mpScanLanHosts(false);},900);",'');
 s=s.replace('>Scan now</button>','>Refresh</button>');
 fs.writeFileSync(p,s.replace(/\n/g,nl));}
console.log('Integrated real Create/Find controls only in multiplayer; HUD untouched.');

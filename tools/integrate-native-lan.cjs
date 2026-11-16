const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const p=path.join(root,'AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');let s=fs.readFileSync(p,'utf8');
if(s.includes('sightlinelan://'))throw Error('Native LAN routes already integrated');
s=s.replace('if (!BuildConfig.LAN_HOST_ENABLED) return;','if (!BuildConfig.LAN_HOST_ENABLED) { toast("This build does not contain the phone host runtime."); return; }\n        if (activePhoneHostIp != null) { openGame(activePhoneHostIp,true); return; }');
s=s.replace('"Host Phone LAN (experimental)"','"CREATE MATCH"');
s=s.replace('"Phone-host LAN (experimental): Phone A hosts, Phone B joins over trusted Wi-Fi or Phone A\'s hotspot. Requires a separately verified ARM64 host-runtime build."','"Create a match on this phone, or find a match on your Wi-Fi. No PC is needed."');
s=s.replace('        activePhoneHostIp=ip;','        toast("Starting your match…");\n        activePhoneHostIp=ip;');
const a=s.indexOf('                    new AlertDialog.Builder(this)',s.indexOf('private void startPhoneHost()')),b=s.indexOf('                } else {',a);if(a<0||b<a)throw Error('Host ready UI missing');
s=s.slice(0,a)+'                    openGame(ip,true);\n'+s.slice(b);
s=s.replace('settings.setJavaScriptEnabled(true);','settings.setJavaScriptEnabled(true);\n        settings.setUserAgentString(settings.getUserAgentString()+" SightlineAndroid");');
s=s.replace('                if (!allowed(request.getUrl(), true)) {',`                Uri action=request.getUrl();
                if (request.isForMainFrame() && "sightlinelan".equals(action.getScheme())) {
                    if (request.hasGesture() && OFFLINE_URL.equals(v.getUrl())) {
                        if ("create".equals(action.getHost())) startPhoneHost();
                        else if ("find".equals(action.getHost())) discoverLanHosts();
                    } else toast("Open Multiplayer in the main lobby to create or find a match.");
                    return true;
                }
                if (!allowed(request.getUrl(), true)) {`);
s=s.replace('String address, id, mode, map, phase;','String address, id, mode, map, phase, name;');
s=s.replace('"Sightline V3 Host · " + players','(name==null?"Sightline Match":name)+" · " + players');
s=s.replace(' + " · " + address;',';');
s=s.replace('c.address=source;c.id=id;', 'c.address=source;c.id=id;c.name=offer.optString("name","Sightline Match");');
s=s.replace('candidate.players=players;candidate.maxPlayers=max;', 'candidate.name=status.optString("name",candidate.name);candidate.players=players;candidate.maxPlayers=max;');
s=s.replace('Looking for compatible Sightline PC hosts on this Wi-Fi. Manual IP remains available.','Looking for phone and PC matches on this Wi-Fi.');
s=s.replace('that the PC host is running.','that the host is still running.');
s=s.replace('new AlertDialog.Builder(this).setTitle("Available LAN games").setMessage(message)','new AlertDialog.Builder(this).setTitle("Find LAN Match")');
s=s.replace('        if(rows.length>0)builder.setItems', '        if(rows.length==0)builder.setMessage(message);\n        if(rows.length>0)builder.setItems');
s=s.replace('            try { found=scanLanHosts(); }',`            android.net.wifi.WifiManager.MulticastLock multicast=null;
            try { android.net.wifi.WifiManager wifi=(android.net.wifi.WifiManager)getApplicationContext().getSystemService(Context.WIFI_SERVICE); if(wifi!=null){multicast=wifi.createMulticastLock("sightline-discovery");multicast.setReferenceCounted(false);multicast.acquire();} found=scanLanHosts(); }`);
s=s.replace('            final java.util.List<LanHostCandidate> hosts=found;', '            finally { if(multicast!=null&&multicast.isHeld())multicast.release(); }\n            final java.util.List<LanHostCandidate> hosts=found;');
s=s.replace('            .setPositiveButton("Scan again",','            .setPositiveButton("Refresh",');
fs.writeFileSync(p,s);

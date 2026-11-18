'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),http=require('node:http'),net=require('node:net');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {LocalLanHost}=require('../tools/local-lan-host.cjs');
let PORT;
test.before(async()=>{PORT=await new Promise((resolve,reject)=>{const socket=require('node:net').createServer();socket.on('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f){for(let i=0;i<400;i++){if(f())return;await delay(25);}throw Error('LAN event timeout');}
const javaHome=process.env.SIGHTLINE_TEST_JAVA_HOME;
const classes=path.join(root,'AndroidProject/app/build/verification/lan-policy');
function java(...args){return cp.execFileSync(path.join(javaHome,'bin/java.exe'),['-cp',classes,'LanJoinPolicyProbe',...args],{encoding:'utf8'}).trim();}

test('bundled Android manual Connect uses the native validated join route, not appassets WSS',()=>{
    const vm=require('node:vm');
    for(const tree of ['www','phone-host']) {
        const html=read('AndroidProject/app/src/main/assets/'+tree+'/index.html');
        const start=html.indexOf('function mpConnect() {'),end=html.indexOf('  if (MP.sock) return;',start);
        const location={href:''};
        vm.runInNewContext(html.slice(start,end)+'}\nmpConnect();',{mpNativeLan:()=>true,MP:{addr:'192.168.1.20:8080'},location,clearTimeout(){}});
        assert.equal(location.href,'sightlinelan://join?host=192.168.1.20%3A8080');
    }
    const native=read('AndroidProject/app/src/main/java/com/sightline/v3/MainActivity.java');
    assert(native.includes('HostPolicy.normalize(action.getQueryParameter("host"))'));
    assert(native.includes('request.hasGesture() && OFFLINE_URL.equals(v.getUrl())'));
    assert(native.includes('V17_HOST_BUNDLE_SHA256.equals(bundle)'));
});

test('execute the native Java broadcast and bundled-page routing policies',()=>{
    assert(javaHome,'Set SIGHTLINE_TEST_JAVA_HOME to the isolated JDK 17');
    fs.mkdirSync(classes,{recursive:true});
    const src='AndroidProject/app/src/main/java/com/sightline/v3/';
    cp.execFileSync(path.join(javaHome,'bin/javac.exe'),['-d',classes,...['HostPolicy.java','LanPagePolicy.java'].map(f=>path.join(root,src,f)),path.join(__dirname,'fixtures/LanJoinPolicyProbe.java')]);
    assert.match(java(),/^PASS:/);
    const native=read(src+'MainActivity.java');
    assert(native.includes('HostPolicy.isPrivateNetworkIPv4(address.getHostAddress())'));
    assert(native.includes('getAssets().open(asset)'));
    assert(native.includes('try { readLanStatus(target); }'));
    assert(native.includes('c.setInstanceFollowRedirects(false)'));
    assert(!native.includes('return null; // Only the selected host'));
    assert(native.includes('if (error==null) openVerifiedGame(target,autoJoin)'));
    assert(native.includes('generation!=lanJoinGeneration'));
    assert(native.includes('FIND LAN MATCH'));
    assert(read('AndroidProject/app/src/main/res/xml/network_security_config.xml').includes('cleartextTrafficPermitted="false"'));
    assert(native.includes('WebSettings.MIXED_CONTENT_NEVER_ALLOW'));
});

// A real HTTP upgrade, including the exact browser Origin, rather than the
// Origin-less Node WebSocket used by older integration checks.
function browserUpgrade(origin){return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port:PORT});let response='';
    const timer=setTimeout(()=>{socket.destroy();reject(Error('Upgrade timeout'));},1500);
    socket.on('error',reject);
    socket.on('connect',()=>socket.write('GET /ws HTTP/1.1\r\nHost: 127.0.0.1:'+PORT+'\r\nOrigin: '+origin+'\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n'));
    socket.on('data',d=>{response+=d.toString();if(response.includes('\r\n\r\n')){clearTimeout(timer);socket.destroy();resolve(response);}});
    socket.on('close',()=>{clearTimeout(timer);resolve(response);});
});}

test('real host HTTP, browser-origin upgrade, v2 join, gameplay exchange and restart',{timeout:30000},async()=>{
    const host=new LocalLanHost({root,addressProvider:()=> '127.0.0.1',allowLoopbackForTests:true,testPort:PORT});
    const peers=[];
    const {protocolHello,observeProtocolV2,sendProtocolV2}=await import('./lib/mp-protocol-v2-client.mjs');
    try {
        await host.start();
        const response=await fetch('http://127.0.0.1:'+PORT+'/status');assert.equal(response.status,200);
        const status=await response.json();assert.equal(status.protocol,2);assert.equal(status.instanceId,host.instance);
        const remoteHtml=await(await fetch('http://127.0.0.1:'+PORT+'/')).text();assert(remoteHtml.includes('sightline-route'));
        // Execute the Java router: main HTML is read from the APK source, not HTTP.
        const asset=java('/', 'true'),packaged=read('AndroidProject/app/src/main/assets/'+asset);
        assert.equal(packaged,remoteHtml);
        assert.match(await browserUpgrade('http://127.0.0.1:'+PORT+''),/^HTTP\/1.1 101/);
        assert(!/^HTTP\/1.1 101/.test(await browserUpgrade('https://unrelated.example')));
        for(let i=0;i<2;i++) {
            const p={ws:new WebSocket('ws://127.0.0.1:'+PORT+'/ws'),events:[]};peers.push(p);
            p.ws.onmessage=e=>{const m=JSON.parse(e.data);observeProtocolV2(p,m);p.events.push(m);if(m.t==='sp')p.spawn=m;if(m.t==='ping'){const pong=()=>{if(p.ws.readyState===WebSocket.OPEN)p.ws.send(JSON.stringify({t:'pong',s:m.s}));};if(i===1)setTimeout(pong,95);else pong();}};
            await new Promise((resolve,reject)=>{p.ws.onopen=resolve;p.ws.onerror=reject;});
            p.ws.send(JSON.stringify({...protocolHello('JoinRecovery'+i),diagnostics:true}));await until(()=>p.session);
        }
        assert.equal(peers[0].events.find(m=>m.t==='welcome').host,true);
        assert.equal(peers[1].events.find(m=>m.t==='welcome').host,false);
        sendProtocolV2(peers[0],{t:'cfg',mode:'deathmatch'});
        await until(()=>peers[0].events.some(m=>m.t==='lobby'&&m.mode==='deathmatch'));
        sendProtocolV2(peers[1],{t:'start'});
        // This ordered team update serves as a barrier for the guest's prior start request.
        const lobbyCount=peers[0].events.filter(m=>m.t==='lobby').length;
        const lobby=peers[0].events.filter(m=>m.t==='lobby').at(-1);
        const guestId=peers[1].events.find(m=>m.t==='welcome').id;
        const guestTeam=lobby.players.find(p=>p.id===guestId).team;
        sendProtocolV2(peers[1],{t:'team',team:1-guestTeam});
        await until(()=>peers[0].events.filter(m=>m.t==='lobby').length>lobbyCount);
        assert(!peers[0].events.some(m=>m.t==='start'));
        const hostId=peers[0].events.find(m=>m.t==='welcome').id;
        const oppositeTeam=1-lobby.players.find(p=>p.id===hostId).team;
        sendProtocolV2(peers[1],{t:'team',team:oppositeTeam});
        await until(()=>peers[0].events.filter(m=>m.t==='lobby').at(-1).players.find(p=>p.id===guestId).team===oppositeTeam);
        sendProtocolV2(peers[0],{t:'start'});
        await until(()=>peers.every(p=>p.spawn)&&peers[0].events.some(m=>m.t==='ph'&&m.ph==='live'));
        for(const p of peers) {const q=p.spawn;sendProtocolV2(p,{t:'in',x:q.x+.02,y:q.y,z:q.z,yaw:q.yaw,pitch:0,cr:0,pr:0});sendProtocolV2(p,{t:'shot',w:q.cur,d:[[0,0,-1]]});}
        await delay(120);
        const active=await(await fetch('http://127.0.0.1:'+PORT+'/status')).json();assert(active.stats.shots>=2);assert.equal(active.players,2);
        assert(peers.every(p=>p.events.some(m=>m.t==='s')));
        await until(()=>peers.every(p=>p.events.some(m=>m.t==='ping'&&m.diagnostics?.phase==='live'&&m.diagnostics.rttMs!=null)));
        const samples=peers.map(p=>p.events.find(m=>m.t==='ping'&&m.diagnostics?.phase==='live'&&m.diagnostics.rttMs!=null).diagnostics);
        assert(samples[1].rttMs>=85 && samples[1].rttMs>samples[0].rttMs,samples);
        assert(samples.every(s=>s.bundle===status.bundle&&s.server===status.server));
        assert(samples.every(s=>s.tickWorkMs>=0&&s.tickGapMs>0&&s.snapshotCadenceMs>0&&s.snapshotFrames>0));
        console.log('Loopback telemetry with 95 ms guest pong delay: '+JSON.stringify(samples));
        peers[1].ws.close();await until(()=>peers[1].ws.readyState===WebSocket.CLOSED);
        await until(()=>peers[0].events.some(m=>m.t==='lobby')||peers[0].events.some(m=>m.t==='sc'));
        await host.stop();await until(()=>peers[0].ws.readyState===WebSocket.CLOSED);
        await assert.rejects(fetch('http://127.0.0.1:'+PORT+'/status'));
        // Even with the server gone the Java route still returns the bundled UI.
        assert.equal(java('/','true'),asset);
        const prior=host.instance;await host.start();assert.notEqual(host.instance,prior);
    } finally {for(const p of peers)p.ws.close();await host.stop();}
});

test('occupied listener fails explicitly and a later retry starts a genuine server',{timeout:15000},async()=>{
    assert.throws(()=>new LocalLanHost({testPort:12345}),/Only isolated loopback tests/);
    await assert.rejects(new LocalLanHost({allowLoopbackForTests:true,testPort:12345,addressProvider:()=> '192.168.1.20'}).start(),/loopback listener/);
    const occupied=http.createServer((q,s)=>s.end('Not a Sightline host'));
    await new Promise(r=>occupied.listen(PORT,'127.0.0.1',r));
    const host=new LocalLanHost({root,addressProvider:()=> '127.0.0.1',allowLoopbackForTests:true,testPort:PORT});
    try {await assert.rejects(host.start(),/already using|could not start/);assert.equal(host.child,null);}
    finally {await new Promise(r=>occupied.close(r));}
    try {const room=await host.start();assert.equal(room.verified,true);}
    finally {await host.stop();}
});

test('real UDP discovery and HTTP verification over loopback address adapters',{timeout:10000},async()=>{
    // Actual datagrams/TCP and production codecs/verifier; ONLY network addresses
    // are mapped into loopback. This does not test Wi-Fi/firewall/multicast routing.
    const D=require('../tools/lan-discovery.cjs'),dgram=require('node:dgram'),{EventEmitter}=require('node:events');
    const manager=new LocalLanHost({root,addressProvider:()=> '127.0.0.1',allowLoopbackForTests:true,testPort:PORT});
    let info,advertiser,peer,hostPort;
    const interfaces=()=>({wifi:[{family:'IPv4',internal:false,address:'192.168.20.8',netmask:'255.255.255.0'}]});
    function socketFactory(role) {
        const actual=dgram.createSocket('udp4'),adapter=new EventEmitter();
        actual.on('error',e=>adapter.emit('error',e));
        actual.on('message',(packet,remote)=>adapter.emit('message',packet,{...remote,address:role==='host'?'192.168.20.12':'192.168.20.8'}));
        adapter.bind=(port,address,done)=>actual.bind(0,'127.0.0.1',()=>{if(role==='host')hostPort=actual.address().port;done();});
        adapter.setBroadcast=()=>actual.setBroadcast(true);
        adapter.send=(buf,offset,length,port,address,done)=>actual.send(buf,offset,length,role==='client'?hostPort:port,'127.0.0.1',done);
        adapter.close=()=>actual.close();
        return adapter;
    }
    const originalAgent=http.globalAgent;
    try {
        await manager.start();
        const {protocolHello}=await import('./lib/mp-protocol-v2-client.mjs');
        peer=new WebSocket('ws://127.0.0.1:'+PORT+'/ws');let welcome=false;
        peer.onmessage=e=>{if(JSON.parse(e.data).t==='welcome')welcome=true;};
        await new Promise((r,j)=>{peer.onopen=r;peer.onerror=j;});peer.send(JSON.stringify(protocolHello('DiscoveryCreator')));await until(()=>welcome);
        const status=await(await fetch('http://127.0.0.1:'+PORT+'/status')).json();
        info={...status,id:status.instanceId,port:8080,ready:status.players>0};
        advertiser=D.createLanDiscoveryHost({info:()=>info,interfaces,socketFactory:()=>socketFactory('host')});advertiser.start();await until(()=>hostPort);
        http.globalAgent=new http.Agent();
        http.globalAgent.createConnection=(options,done)=>net.createConnection({...options,host:options.host==='192.168.20.8'?'127.0.0.1':options.host,port:options.host==='192.168.20.8'?PORT:options.port},done);
        const client=D.createLanDiscoveryClient({interfaces,socketFactory:()=>socketFactory('client'),scanMs:300});
        const result=await client.scan();assert.equal(result.ok,true);assert.equal(result.hosts.length,1);
        assert.equal(result.hosts[0].verified,true);assert.equal(result.hosts[0].id,status.instanceId);
        info.ready=false;assert.equal((await client.scan()).hosts.length,0);
    } finally {
        const agent=http.globalAgent;http.globalAgent=originalAgent;if(agent!==originalAgent)agent.destroy();
        if(advertiser)advertiser.close();if(peer)peer.close();await manager.stop();
    }
});

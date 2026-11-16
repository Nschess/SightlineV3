'use strict';
const {spawn}=require('node:child_process'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const Discovery=require('./lan-discovery.cjs');
const GAME='sightline-v12-host-prototype';
class LocalLanHost {
  constructor({root=path.resolve(__dirname,'..'),addressProvider=()=>Object.entries(os.networkInterfaces()).filter(([name])=>!/loopback|virtual|vethernet|docker|vpn|tun/i.test(name)).flatMap(([,rows])=>rows||[]).find(r=>r.family==='IPv4'&&!r.internal&&Discovery.isPrivateIPv4(r.address))?.address,allowLoopbackForTests=false}={}){
    this.root=root;this.addressProvider=addressProvider;this.allowLoopbackForTests=allowLoopbackForTests;this.child=null;this.pending=null;this.room=null;
  }
  async start(){
    if(this.pending)return this.pending;
    if(this.child&&this.room){const alive=await this.probe(this.room.address);if(alive)return this.room;await this.stop();}
    this.pending=this.boot().finally(()=>{this.pending=null;});return this.pending;
  }
  probe(address){return new Promise(resolve=>{const req=http.get({host:address,port:8080,path:'/status',timeout:350},res=>{let s='';res.on('data',d=>{s+=d;if(s.length>4096)req.destroy();});res.on('end',()=>{try{let j=JSON.parse(s);resolve(res.statusCode===200&&j.ok&&j.game===GAME&&j.protocol===2&&j.bundle===this.bundle&&j.instanceId===this.instance?j:null);}catch(_){resolve(null);}});});req.on('timeout',()=>req.destroy());req.on('error',()=>resolve(null));});}
  async boot(){
    const address=this.addressProvider();
    if(!Discovery.isPrivateIPv4(address)&&!(this.allowLoopbackForTests&&address==='127.0.0.1'))throw Error('Connect this PC to the same private Wi-Fi/LAN as the other players.');
    const dir=path.join(this.root,'AndroidProject/app/src/main/assets/phone-host');
    this.bundle=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'index.html'))).digest('hex');
    this.instance=crypto.randomBytes(12).toString('hex');
    let fault='',exited=false;
    const child=spawn(process.execPath,[path.join(dir,'server.js'),'--transport','dev','--bind',address,'--port','8080','--max','4','--bots','0','--wait-for-host',...(this.allowLoopbackForTests?[]:['--discover-lan']),'--room','PC Match'],{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,SIGHTLINE_HOST_INSTANCE:this.instance}});
    this.child=child;
    const collect=d=>{fault=(fault+d.toString()).slice(-2500);};child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.once('error',e=>{fault=e.message;exited=true;});child.once('exit',()=>{exited=true;if(this.child===child){this.child=null;this.room=null;}});
    for(let i=0;i<60&&!exited;i++){const status=await this.probe(address);if(status){this.room={address,port:8080,protocol:2,verified:true,name:status.name,maxPlayers:status.maxPlayers};return this.room;}await new Promise(r=>setTimeout(r,125));}
    await this.stop();throw Error(/EADDRINUSE/.test(fault)?'Another app is already using the local match port. Close the old host and retry.':'The local match server could not start. '+fault.slice(-300));
  }
  async stop(){const child=this.child;this.child=null;this.room=null;if(!child||child.exitCode!==null)return;await new Promise(resolve=>{const timeout=setTimeout(()=>{try{child.kill('SIGKILL');}catch(_){}resolve();},1500);child.once('exit',()=>{clearTimeout(timeout);resolve();});child.kill('SIGTERM');});}
}
module.exports={LocalLanHost};

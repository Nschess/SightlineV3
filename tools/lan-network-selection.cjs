'use strict';
const os=require('node:os');
const discovery=require('./lan-discovery.cjs');
function available(){return Object.entries(os.networkInterfaces()||{}).filter(([name])=>!/loopback|virtual|vethernet|docker|vpn|tun/i.test(name)).flatMap(([name,rows])=>(rows||[]).filter(r=>r.family==='IPv4'&&!r.internal&&discovery.isPrivateIPv4(r.address)&&discovery.validNetmask(r.netmask)).map(r=>({name,address:r.address,netmask:r.netmask}))).slice(0,32);}
class LanNetworkSelection{
 constructor(){this.chosen=null;}
 list(){const networks=available();if(this.chosen&&!networks.some(n=>n.address===this.chosen)){this.chosen=null;return {networks,selected:null,missing:true};}if(!this.chosen&&networks.length===1)this.chosen=networks[0].address;return {networks,selected:this.chosen,missing:false};}
 select(address){const list=available();if(!list.some(n=>n.address===address))throw Error('That network is no longer available. Choose another network.');this.chosen=address;return this.list();}
 address(){return this.list().selected;}
 interfaces(){const state=this.list();if(!state.selected)return {};const row=state.networks.find(n=>n.address===state.selected);return {[row.name]:[{family:'IPv4',internal:false,address:row.address,netmask:row.netmask}]};}
}
module.exports={LanNetworkSelection};

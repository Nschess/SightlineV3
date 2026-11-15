'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
function sourceBetween(html, startName, endName) {
  const start = html.indexOf('function ' + startName + '(');
  const end = html.indexOf('function ' + endName + '(', start + 1);
  assert.ok(start >= 0 && end > start, 'missing ' + startName + ' source');
  return html.slice(start, end);
}
function makeActor(netBot) {
  return {
    netBot, buf:[
      {t:0,x:0,y:0,z:0,yaw:0,pitch:0,cr:0,pr:0,al:true},
      {t:40,x:.16,y:0,z:0,yaw:0,pitch:0,cr:0,pr:0,al:true}
    ], wasAlive:true,alive:true,x:0,y:0,z:0,yaw:0,pitch:0,phase:0,
    op:{w:1,h:1},legs:{rotation:{x:0}},
    g:{parent:null,visible:true,rotation:{x:0,y:0},position:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},scale:{set(){}}}
  };
}

for (const client of ['www', 'phone-host']) {
  test(client + ': selected LAN smoothing setting applies equally to bot and player puppets', () => {
    const html = fs.readFileSync(path.join(root, client, 'index.html'), 'utf8');
    const helper = sourceBetween(html, 'interpMs', 'mpPrefs');
    const step = sourceBetween(html, 'mpPuppetStep', 'mpEnsureZombie');
    const ensure = sourceBetween(html, 'mpEnsurePuppet', 'mpRebuildLists');
    const context = vm.createContext({
      G:{interp:20}, MP:{net:{ema:40,jit:0},dirty:false},
      SightlinePoses:{apply(){}}, poseWorldArms(){}, hurtGlow(){}
    });
    vm.runInContext(helper + '\n' + step, context, {filename:client+'-mp-interpolation.js'});
    assert.match(ensure, /u\.netBot=!!pl\.bot/,'puppets retain authoritative bot identity');
    assert.equal(context.interpMs(),20,'the low-latency LAN setting remains 20 ms');
    assert.doesNotMatch(step,/if\s*\(u\.netBot\)\s*rt\s*-=/,'bots do not receive an extra hidden interpolation delay');
    context.G.interp=0; context.MP.net.ema=60; context.MP.net.jit=8;
    assert.equal(context.interpMs(),76,'Auto still adapts to a 60 ms cadence and measured jitter');
  });

  test(client + ': 20 ms smoothing predicts across 25 Hz snapshots without freezing or overpredicting teleports', () => {
    const html = fs.readFileSync(path.join(root, client, 'index.html'), 'utf8');
    const helper = sourceBetween(html, 'interpMs', 'mpPrefs');
    const step = sourceBetween(html, 'mpPuppetStep', 'mpEnsureZombie');
    const context = vm.createContext({
      G:{interp:20}, MP:{net:{ema:40,jit:0},dirty:false},
      SightlinePoses:{apply(){}}, poseWorldArms(){}, hurtGlow(){}
    });
    vm.runInContext(helper + '\n' + step, context, {filename:client+'-mp-puppet.js'});
    const bot=makeActor(true), player=makeActor(false);
    context.mpPuppetStep(bot,.01,39); const botA=bot.x;
    context.mpPuppetStep(bot,.01,41); const botB=bot.x;
    context.mpPuppetStep(bot,.01,45); const botC=bot.x;
    context.mpPuppetStep(player,.01,39); const playerA=player.x;
    context.mpPuppetStep(player,.01,41); const playerB=player.x;
    context.mpPuppetStep(player,.01,45); const playerC=player.x;
    assert.ok(botA<botB&&botB<botC,'bot continues moving through the newest-snapshot boundary');
    assert.ok(Math.abs(botB-.164)<.002&&Math.abs(botC-.18)<.002,'prediction tracks the known constant-velocity sample');
    assert.ok(Math.abs(playerA-botA)<1e-8&&Math.abs(playerB-botB)<1e-8&&Math.abs(playerC-botC)<1e-8,'remote human and bot puppets use the same visual prediction');
    const jump=makeActor(true);jump.buf[1].x=100;context.mpPuppetStep(jump,.01,50);
    assert.equal(jump.x,100,'implausible teleport speed is not extrapolated');
    const capped=makeActor(true);context.mpPuppetStep(capped,.01,500);
    assert.ok(capped.x>.45&&capped.x<.457,'the normal prediction cap is followed by no more than the documented 24 ms decaying tail');
  });
}

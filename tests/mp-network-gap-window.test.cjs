'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname,'..','AndroidProject','app','src','main','assets','phone-host','index.html'),'utf8');
const match = page.match(/nstat\.rate=Math\.round\(nstat\.rn\/\(fpsT \+ raw \/ 1000\)\);nstat\.rn=0;nstat\.maxShow=Math\.round\(Math\.max\(nstat\.gapMax,nstat\.last\?now-nstat\.last:0\)\);nstat\.gapMax=0;/);
assert.ok(match, 'network receive-gap reporting is present in the actual game page');
for (const tree of ['www', 'phone-host']) {
  const source = fs.readFileSync(path.join(__dirname,'..','AndroidProject','app','src','main','assets',tree,'index.html'),'utf8');
  assert.ok(source.includes(match[0]), tree + ' reports and resets the receive-gap window');
}
function sample(net, now, fpsT=0.5, raw=0) {
  vm.runInNewContext('var nstat=MP.net;' + match[0], { MP:{net}, now, fpsT, raw, Math });
}

test('network overlay reports the maximum observed packet gap for the recent sample window and resets its accumulator', () => {
  const net={rn:20,rate:0,gapMax:32,maxShow:0,last:110};
  sample(net,130);
  assert.equal(net.rate,40);
  assert.equal(net.rn,0);
  assert.equal(net.maxShow,32);
  assert.equal(net.gapMax,0);
  net.gapMax=16; net.rn=10; net.last=140;
  sample(net,150);
  assert.equal(net.maxShow,16);
  assert.equal(net.gapMax,0);
});

test('network overlay reports the growing age when snapshots stop arriving', () => {
  const net={rn:0,rate:0,gapMax:0,maxShow:0,last:100};
  sample(net,450);
  assert.equal(net.rate,0);
  assert.equal(net.maxShow,350);
});

test('network overlay reports no gap before the first snapshot', () => {
  const net={rn:0,rate:0,gapMax:0,maxShow:0,last:0};
  sample(net,450);
  assert.equal(net.maxShow,0);
});

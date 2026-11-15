'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pages = [
  ['offline', path.join(root, 'AndroidProject/app/src/main/assets/www/index.html')],
  ['phone-host', path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html')]
].map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]);

for (const [name, html] of pages) {
  test(`${name} survivors use bounded parkour only against zombies in offline survival modes`, () => {
    assert.match(html, /var survivalParkour\s*=\s*!foe\s*&&\s*!MP\.on\s*&&\s*\(R\.mode\s*===\s*'infection'\s*\|\|\s*R\.mode\s*===\s*'outbreak'\)/);
    assert.match(html, /\(t\.zombie\s*\|\|\s*t\.infected\)\s*&&\s*dist\s*>=\s*4\s*&&\s*dist\s*<\s*16/);
    assert.match(html, /u\.parkourNextAt\s*=\s*T\s*\+\s*3\.2/);
    assert.match(html, /ceilingAt\(u\.x,u\.z,u\.y\|\|0\)\s*>\s*\(u\.y\|\|0\)\s*\+\s*2\.55/);
    assert.match(html, /u\.parkourGoal\s*=\s*evasiveClimbGoal\(u,t\)/);
    assert.match(html, /if \(parkourMove\).*?else if \(!foe && u\.hp < u\.maxhp \* \.38/s);
    assert.match(html, /u\.navY > u\.y \+ 0\.35 && u\.navY - u\.y <= 1\.1/,
      'raised navigation steps must continue using the normal collision-checked jump');
  });
}

test('evasive climb selects a reachable raised node and ignores flat or disconnected terrain', () => {
  const html = pages[0][1], from = html.indexOf('var parkourSearchSeq = 0;'), to = html.indexOf('function findSpot(', from);
  assert.ok(from >= 0 && to > from, 'parkour helper is present');
  const source = html.slice(from, to);
  const nodes = [
    {x:0,y:0,z:0}, {x:1,y:.7,z:0}, {x:3,y:1.4,z:0}, {x:5,y:1.4,z:0}, {x:6.5,y:1.4,z:0}
  ];
  const edges = [[ [1,1] ], [[0,1],[2,1]], [[1,1],[3,1]], [[2,1],[4,1]], [[3,1]]];
  const context = {
    NAV: {nodes,edges,boxes:[]}, T: 0, Math, Number, Int32Array,
    groundAt: (_x,_z,y) => y || 0,
    SightlineNav: {nearest: () => 0},
    SightlineTactics: {rayCovered: () => false}
  };
  vm.createContext(context);
  vm.runInContext(source, context, {filename:'offline-parkour-helper.js'});
  const bot = {x:0,y:0,z:0,slot:3};
  const goal = context.evasiveClimbGoal(bot,{x:0,y:0,z:-5});
  assert.ok(goal, 'a safe connected elevated route should be found');
  assert.ok(goal.y >= .62 && goal.y <= 2.8, `expected a reachable short climb, got y=${goal.y}`);
  assert.ok(Math.hypot(goal.x-bot.x,goal.z-bot.z) <= 12.5);

  context.NAV = {nodes:[nodes[0],{x:1,y:0,z:0},{x:2,y:0,z:0}],edges:[[[1,1]],[[0,1],[2,1]],[[1,1]]],boxes:[]};
  context.SightlineNav.nearest = () => 0;
  assert.equal(context.evasiveClimbGoal(bot,{x:0,y:0,z:-5}),null,'flat routes should not invent a climb');
});

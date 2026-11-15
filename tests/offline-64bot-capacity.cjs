#!/usr/bin/env node
// Source-contract regression for offline AI limits and adaptive simulation.
// This does not emulate a browser or claim measured device FPS.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../AndroidProject/app/src/main/assets');
const files = ['phone-host/index.html', 'www/index.html'];
const hostService = fs.readFileSync(path.resolve(__dirname, '../AndroidProject/app/src/main/java/com/sightline/v3/LanHostService.java'), 'utf8');
const checks = [];
function check(name, fn) { fn(); checks.push(name); }
for (const rel of files) {
  const html = fs.readFileSync(path.join(root, rel), 'utf8');
  check(`${rel}: offline enemy and ally choices expose 64`, () => {
    assert.match(html, /\[64, '64'\]/);
    assert.match(html, /\[64, '64'\]\]\), h: 'Teammates fight beside you\. Enemy and allied bots share the 64 AI cap\.'/);
  });
  check(`${rel}: tactical/versus spawn enforces 64 total bots`, () => {
    assert.match(html, /n = Math\.max\(0, Math\.min\(64, n\)\); nm = Math\.max\(0, Math\.min\(64, nm \|\| 0\)\);/);
    assert.match(html, /if \(n \+ nm > 64\) nm = Math\.max\(0, 64 - n\);/);
  });
  check(`${rel}: Outbreak wave and allies share the 64 AI ceiling`, () => {
    assert.match(html, /Math\.min\(R\.zcap, 64 - ma/);
    assert.match(html, /za \+ ma < 64/);
    assert.match(html, /aliveCount\(bots\) \+ aliveCount\(mates\) < 64/);
    assert.match(html, /Math\.min\(R\.zcap, 64 - outbreakSelectedAllies\(\)\)/);
  });
  check(`${rel}: Infection allies receive role-based distributed posts and threat retreat`, () => {
    assert.match(html, /SightlineTactics\.infectionRole\(i,0\)/);
    assert.match(html, /SightlineTactics\.patrol\(NAV,P,i,0,occupied,'infection',alive\.length,patrolCycle\)/);
    assert.match(html, /SightlineTactics\.retreat\(NAV,u,t/);
  });
  check(`${rel}: Infection selector means 2–64 allied AI bots plus the player`, () => {
    assert.match(html, /var infectionBotRule = it\.k === 'bots' && R\.mode === 'infection'/);
    assert.match(html, /Bot count does not include you\. Auto = 6 bots \(7 participants\); choose 2–64 bots plus you\./);
    assert.match(html, /infectionBotRule\?it\.opts\.filter\(function\(p\)\{return p\[0\]!==1;\}\):it\.opts/);
    assert.match(html, /class="rule-select" data-o="R" data-k="bots"/);
    assert.match(html, /infectionAllyRoster\(64\)/);
  });
  check(`${rel}: Infection presets select 8 or 64 survivor bots without creating an opposing roster`, () => {
    assert.match(html, /if\(R\.mode==='infection'\)\{R\.bots=a==='rules-max'\?64:8;R\.mates=0;\}/);
  });
  check(`${rel}: large offline rosters lower AI cadence and interpolate poses`, () => {
    assert.match(html, /units\.length > 48 \? 1 \/ 15 : units\.length > 32 \? 1 \/ 20 : 1 \/ 30/);
    assert.match(html, /renderOfflineBots\(botStepAcc \/ botStepTarget\)/);
    assert.match(html, /offlineBotCadenceHz: MP\.on \? 'multiplayer per frame' : units\.length > 48 \? 15 : units\.length > 32 \? 20 : 30/);
  });
}
check('Android phone-host service enables the expanded AI roster', () => {
  assert.match(hostService, /"--max","2","--total","96","--bots","0"/);
});
console.log(`PASS ${checks.length}/${checks.length} offline 64-bot source-contract checks`);
checks.forEach((name, i) => console.log(`  ${i + 1}. ${name}`));

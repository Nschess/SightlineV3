#!/usr/bin/env node
// Verifies that multiplayer server pellet spread preserves the same movement
// and crouch modifiers used by the playable client.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = new URL('../AndroidProject/app/src/main/assets/phone-host/', import.meta.url);
const { _t } = require(fileURLToPath(new URL('server.js', root)));
const { W, shotgunSpread, movementSpeedFrac, shotSpeedFrac, onShot, onInput } = _t;
const client = await readFile(new URL('index.html', root), 'utf8');
let checks = 0, failures = 0;
function check(name, fn) { try { fn(); checks++; console.log('PASS', name); } catch(e) { failures++; console.error('FAIL', name, String(e.message||e)); } }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`); }

for (const key of ['breacher', 'hammer', 'scatter', 'ember', 'thunder']) {
  const w = W[key];
  check(`${key}: stationary standing spread keeps weapon baseline`, () => near(shotgunSpread(w, 0, 0), w.pelletSpread));
  check(`${key}: full movement applies the same 60% spread increase as client`, () => near(shotgunSpread(w, 1, 0), w.pelletSpread * 1.6));
  check(`${key}: crouch applies the same 15% spread reduction as client`, () => near(shotgunSpread(w, 0, 1), w.pelletSpread * 0.85));
  check(`${key}: moving crouched spread combines both client modifiers`, () => near(shotgunSpread(w, 1, 1), w.pelletSpread * 1.36));
}
check('server derives movement fraction from accepted positions', () => {
  near(movementSpeedFrac({hist:[{t:0,x:0,z:0},{t:100,x:.52,z:0}]}),1);
  near(movementSpeedFrac({hist:[{t:0,x:0,z:0},{t:100,x:.26,z:0}]}),.5);
  near(movementSpeedFrac({hist:[{t:0,x:0,z:0},{t:100,x:0,z:0}]}),0);
  near(movementSpeedFrac({hist:[{t:100,x:0,z:0}]}),0);
});
check('server only applies the quiet-walk bonus inside validated walk-speed envelope', () => {
  near(shotSpeedFrac({walk:true,hist:[{t:0,x:0,z:0},{t:100,x:.26,z:0}]},W.breacher),.2);
  near(shotSpeedFrac({walk:true,hist:[{t:0,x:0,z:0},{t:100,x:.52,z:0}]},W.breacher),1);
  near(shotSpeedFrac({walk:false,hist:[{t:0,x:0,z:0},{t:100,x:.26,z:0}]},W.breacher),.5);
});
check('client no longer sends per-shot movement or crouch accuracy factors', () => {
  assert.ok(/mpShot\(cur, mpDirs, 0\)/.test(client), 'shot call should contain aim rays only');
  assert.ok(/wk: walkIntent \? 1 : 0/.test(client), 'movement packet should send walk intent');
  assert.ok(!/sf: r4\(moveFrac/.test(client), 'shot packet must not send spread fraction');
  assert.ok(!/cr: r4\(crouchFrac/.test(client), 'shot packet must not send crouch fraction');
});
check('server derives shotgun accuracy from accepted movement history and stance state', () => {
  assert.ok(/shotSpeedFrac\(p,w\)/.test(onShot.toString()));
  assert.ok(/p\.cr/.test(onShot.toString()));
  assert.ok(!/m\.sf|m\.cr/.test(onShot.toString()));
  assert.ok(/p\.cr\s*=/.test(onInput.toString()));
  assert.ok(/p\.walk\s*=\s*m\.wk/.test(onInput.toString()));
});
if(failures){console.error(`FAIL ${failures}/${checks+failures} shotgun spread parity assertions`);process.exitCode=1;}
else console.log(`PASS ${checks}/${checks} shotgun spread parity assertions`);

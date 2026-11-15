#!/usr/bin/env node
'use strict';

// Synchronize shared map/rendering blocks from Offline into Phone-host while
// preserving Phone-host server, transport, and bootstrap code.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const offlinePath = path.join(root, 'AndroidProject/app/src/main/assets/www/index.html');
const phonePath = path.join(root, 'AndroidProject/app/src/main/assets/phone-host/index.html');
const offline = fs.readFileSync(offlinePath, 'utf8');
let phone = fs.readFileSync(phonePath, 'utf8');

function mapSpan(source, id) {
  const idAt = source.indexOf(`id: '${id}'`);
  if (idAt < 0) throw new Error(`Map entry missing: ${id}`);
  const start = source.lastIndexOf('\n  {', idAt) + 1;
  const nextAt = source.indexOf("\n    id: '", idAt + 1);
  const end = nextAt < 0 ? -1 : source.lastIndexOf('\n  {', nextAt) + 1;
  if (start < 1 || end <= start) throw new Error(`Cannot locate map entry bounds: ${id}`);
  return [start, end, source.slice(start, end)];
}

function block(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Cannot locate ${label} bounds`);
  return [start, end, source.slice(start, end)];
}

function replaceSpan(target, startMarker, endMarker, replacement, label) {
  const start = target.indexOf(startMarker);
  const end = target.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Cannot locate ${label} in Phone-host source`);
  return target.slice(0, start) + replacement + target.slice(end);
}

// The screenshot's map is Courtyard; keep its static map definition in parity.
{
  const [, , sourceBlock] = mapSpan(offline, 'courtyard');
  const [start, end] = mapSpan(phone, 'courtyard');
  phone = phone.slice(0, start) + sourceBlock + phone.slice(end);
}

// Copy shared ground and surface texture generation without touching host code.
for (const [startMarker, endMarker, label] of [
  ['function paintTex(m) {', 'function textTex(', 'paintTex'],
  ['function mkTex(spec) {', 'var sky = new THREE.Mesh', 'mkTex'],
  ['/* The playable area remains exactly unchanged.', 'function buildDeco(m) {', 'world scenery'],
  ['function buildWorld(m) {', '/* ---------- map picker ---------- */', 'buildWorld']
]) {
  const [, , sourceBlock] = block(offline, startMarker, endMarker, `Offline ${label}`);
  phone = replaceSpan(phone, startMarker, endMarker, sourceBlock, label);
}

fs.writeFileSync(phonePath, phone, 'utf8');
const updated = fs.readFileSync(phonePath, 'utf8');
for (const [startMarker, endMarker, label] of [
  ['/* The playable area remains exactly unchanged.', 'function buildDeco(m) {', 'world scenery'],
  ['function applyMapData(m)', '/* ---------- shared layered navigation', 'applyMapData'],
  ['function buildWorld(m) {', '/* ---------- map picker ---------- */', 'buildWorld']
]) {
  if (block(offline, startMarker, endMarker, `Offline ${label}`)[2] !== block(updated, startMarker, endMarker, `Phone-host ${label}`)[2]) {
    throw new Error(`Phone-host ${label} is not byte-identical to Offline`);
  }
}
for (const required of [
  "kind:'courtyardDistrict'",
  "if(m.id==='courtyard'){buildCourtyardUrbanWorld(m,p);return;}"
]) if (!updated.includes(required)) throw new Error(`Phone-host sync incomplete: ${required}`);
console.log('PASS shared Courtyard map/rendering blocks synchronized; Phone-host bootstrap preserved');

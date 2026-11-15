import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'AndroidProject/app/src/main/assets');
const host = fs.readFileSync(path.join(assets, 'phone-host/index.html'), 'utf8');
const offline = fs.readFileSync(path.join(assets, 'www/index.html'), 'utf8');
assert.equal(host, offline, 'offline and phone-host renderer sources must match');
assert.doesNotMatch(host, /renderer\.outputEncoding\s*=\s*THREE\.sRGBEncoding/,
  'the reported reduced-color change must not force sRGB output conversion');
assert.match(host, /function colorTexture\(texture\)\s*\{\s*return texture;\s*\}/,
  'CanvasTexture construction retains the pre-change r128 color response');
const canvasTextures = [...host.matchAll(/new THREE\.CanvasTexture\(/g)].length;
const wrappedCanvasTextures = [...host.matchAll(/colorTexture\(new THREE\.CanvasTexture\(/g)].length;
assert.ok(canvasTextures > 0, 'renderer must expose canvas color textures for audit');
assert.equal(wrappedCanvasTextures, canvasTextures, 'every CanvasTexture must use the color-space helper');
assert.ok(!/EffectComposer|RenderPass|UnrealBloomPass|SAOPass/.test(host),
  'this change must not add a post-processing pass');
assert.match(host, /function framePixelBudget\(\)/, 'existing adaptive framebuffer budget must remain active');
assert.match(host, /function applyPerf\(\)\s*\{\s*perfScale = PERF_SCALE\[perfLvl\]/,
  'existing adaptive quality response must remain active');
console.log(JSON.stringify({ pass: true, checks: 7, canvasTextures, outputEncoding: 'legacy-r128', extraRenderPasses: 0, visualScreenshot: 'UNVERIFIED' }, null, 2));

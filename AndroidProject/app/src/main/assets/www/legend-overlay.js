/* Sightline V3 — Legendary skins for the Assault Rifles class (apiVersion 1).
   Append-only cosmetic module: registers on window.SightlineLegendarySkinModules['assault-rifles'].
   create(THREE, weaponKey, factoryRoot, options) -> THREE.Group addon (child of the live Factory root).
   - Never mutates the Factory root, its materials, transforms, anchors, ADS offsets, reload state or stats.
   - All art is procedural (canvas textures + small meshes + shaders). No external files. Three.js r128.
   addon.userData API: update(dt) · fire(power) · tracer(startVec3,endVec3) · kill(posVec3) · setView(heightPx,fovDeg)
                       fxRoot (add to scene; auto-added when options.scene is given) · dispose() · skin{...}
   options (all optional): scene, mag (Object3D of the live magazine group), bolt, envMap, quality ('low'|'high'). */
(function (global) {
'use strict';
var registry = global.SightlineLegendarySkinModules || (global.SightlineLegendarySkinModules = Object.create(null));
var CLASS_WEAPONS = ['carbine', 'stinger', 'aurora', 'falcon', 'rook117'];

/* ------------------------------------------------------------------ themes ---- */
var THEMES = {
  carbine: { id: 'stormglass', name: 'STORMGLASS', sub: 'VR-18 Carbine', c1: 0x39d8ff, c2: 0xe9fbff, c3: 0x9a6bff, metal: '#5f6f80', dark: '#0d141c', ink: '#cfeaff', trim: 0xe3eef7, style: 0 },
  stinger: { id: 'sulfur-wasp', name: 'SULFUR WASP', sub: 'Stinger LAR', c1: 0xffa51a, c2: 0xfff0b0, c3: 0xff5a00, metal: '#17140f', dark: '#070605', ink: '#ffb62e', trim: 0xe8a71e, style: 1 },
  aurora: { id: 'polar-veil', name: 'POLAR VEIL', sub: 'Aurora-9', c1: 0x4dffb8, c2: 0xe8fff7, c3: 0xe055ff, metal: '#b9c9d8', dark: '#43566b', ink: '#5a7690', trim: 0xf4fbff, style: 2 },
  falcon: { id: 'solar-talon', name: 'SOLAR TALON', sub: 'Falcon A3', c1: 0xffc247, c2: 0xfff3c8, c3: 0xff5a1f, metal: '#8f6727', dark: '#0e0908', ink: '#ffd98a', trim: 0xf2c14e, style: 3 },
  rook117: { id: 'crimson-citadel', name: 'CRIMSON CITADEL', sub: 'ROOK117', c1: 0xff2a3d, c2: 0xffd7b0, c3: 0xff7a1a, metal: '#140d0d', dark: '#060304', ink: '#c8a24e', trim: 0xc8a24e, style: 4 }
};

/* Zones measured from the real Factory bases (Factory local axes: -Z forward, +Y up). */
var SPEC = {
  carbine: { muz: [0, 0.013, -0.632], dev: { r: 0.0165, len: 0.07 },
    recv: { z0: -0.115, z1: 0.14, yb: -0.062, yt: 0.086, hw: 0.048 }, hand: { z0: -0.45, z1: -0.17, yb: -0.02, yt: 0.086, hw: 0.039 }, stock: { z0: 0.17, z1: 0.36, yb: -0.05, yt: 0.05, hw: 0.034 } },
  stinger: { muz: [0, 0.018, -0.71], dev: { r: 0.0155, len: 0.07 },
    recv: { z0: -0.11, z1: 0.14, yb: -0.058, yt: 0.066, hw: 0.021 }, hand: { z0: -0.38, z1: -0.17, yb: -0.018, yt: 0.066, hw: 0.031 }, stock: { z0: 0.2, z1: 0.44, yb: -0.085, yt: 0.036, hw: 0.021 } },
  aurora: { muz: [0, 0.02, -0.56], dev: { r: 0.0155, len: 0.065 }, shroud: { z0: -0.47, z1: -0.22, y: 0.03, r: 0.019 },
    recv: { z0: -0.2, z1: 0.2, yb: -0.072, yt: 0.066, hw: 0.027 }, stock: { z0: 0.2, z1: 0.495, yb: -0.07, yt: 0.054, hw: 0.027 } },
  falcon: { muz: [0, 0.018, -0.69], dev: { r: 0.0155, len: 0.07 },
    recv: { z0: -0.12, z1: 0.12, yb: -0.07, yt: 0.066, hw: 0.02 }, hand: { z0: -0.38, z1: -0.15, yb: -0.014, yt: 0.066, hw: 0.032 }, stock: { z0: 0.15, z1: 0.445, yb: -0.09, yt: 0.036, hw: 0.021 } },
  rook117: { muz: [0, 0.016, -0.75], dev: { r: 0.0165, len: 0.075 },
    recv: { z0: -0.2, z1: 0.05, yb: -0.055, yt: 0.088, hw: 0.034 }, hand: { z0: -0.52, z1: -0.24, yb: -0.012, yt: 0.088, hw: 0.04 }, stock: { z0: 0.2, z1: 0.4, yb: -0.04, yt: 0.076, hw: 0.023 } }
};

/* ------------------------------------------------------------------ helpers ---- */
function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texFrom(T, c, srgb) {
  var t = new T.CanvasTexture(c); t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter;
  if (srgb && T.sRGBEncoding !== undefined) t.encoding = T.sRGBEncoding; return t;
}
function mergeGeo(T, list) {
  var pos = [], nor = [], uv = [];
  list.forEach(function (g0) {
    var g = g0.index ? g0.toNonIndexed() : g0;
    var p = g.attributes.position.array, n = g.attributes.normal ? g.attributes.normal.array : null, u = g.attributes.uv ? g.attributes.uv.array : null, i, cnt = p.length / 3;
    for (i = 0; i < p.length; i++) pos.push(p[i]);
    for (i = 0; i < cnt; i++) { if (n) nor.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]); else nor.push(0, 1, 0); if (u) uv.push(u[i * 2], u[i * 2 + 1]); else uv.push(0, 0); }
    if (g !== g0) g.dispose(); g0.dispose();
  });
  var m = new T.BufferGeometry();
  m.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return m;
}
/* One shared tiny studio environment so metals read as metal without a scene envMap. */
var ENV = null;
function studioEnv(T) {
  if (ENV) return ENV;
  var faces = [];
  for (var f = 0; f < 6; f++) {
    var c = canvas(32, 32), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 32);
    if (f === 2) { gr.addColorStop(0, '#e8eef4'); gr.addColorStop(1, '#8b97a3'); } else if (f === 3) { gr.addColorStop(0, '#12161a'); gr.addColorStop(1, '#06080a'); } else { gr.addColorStop(0, '#6c7a88'); gr.addColorStop(0.5, '#222b33'); gr.addColorStop(1, '#07090b'); }
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    if (f === 0 || f === 4 || f === 1) { g.fillStyle = 'rgba(255,255,255,.95)'; g.fillRect(5, 5, 22, 6); g.fillStyle = 'rgba(190,215,255,.6)'; g.fillRect(8, 20, 16, 3); }
    faces.push(c);
  }
  ENV = new T.CubeTexture(faces); ENV.needsUpdate = true; return ENV;
}

/* ------------------------------------------------- engraved plate textures ---- */
var EMIT_COL = '#fff';
function metalBase(c, w, h, th, mode, r) {
  if (mode === 'emit') { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); return; }
  if (mode === 'bump') { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); return; }
  var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, th.metal); g.addColorStop(.5, th.metal); g.addColorStop(1, th.dark);
  c.fillStyle = th.metal; c.fillRect(0, 0, w, h);
  c.globalAlpha = .55; c.fillStyle = g; c.fillRect(0, 0, w, h); c.globalAlpha = 1;
  for (var i = 0; i < 70; i++) { c.fillStyle = r() < .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.07)'; c.fillRect(0, r() * h, w * (.3 + r() * .7), 1); }
  c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2; c.strokeRect(5, 5, w - 10, h - 10); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.strokeRect(9, 9, w - 18, h - 18);
  var v = c.createRadialGradient(w / 2, h / 2, h * .2, w / 2, h / 2, w * .62); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)'); c.fillStyle = v; c.fillRect(0, 0, w, h);
}
function ink(c, mode, col, lw, a) { c.lineWidth = lw; c.strokeStyle = mode === 'bump' ? '#000' : mode === 'emit' ? EMIT_COL : col; c.fillStyle = mode === 'bump' ? '#000' : mode === 'emit' ? EMIT_COL : col; c.globalAlpha = a === undefined ? 1 : a; c.lineJoin = 'round'; c.lineCap = 'round'; }
function bolt(c, r, x, y, ang, len, depth) {
  var px = x, py = y, n = Math.max(3, (len / 11) | 0);
  c.beginPath(); c.moveTo(px, py);
  for (var i = 0; i < n; i++) { ang += (r() - .5) * 1.1; px += Math.cos(ang) * 11; py += Math.sin(ang) * 11; c.lineTo(px, py); if (depth > 0 && r() < .22) { c.stroke(); bolt(c, r, px, py, ang + (r() - .5) * 1.6, len * .5, depth - 1); c.beginPath(); c.moveTo(px, py); } }
  c.stroke();
}
function hexPath(c, cx, cy, rad) { c.beginPath(); for (var i = 0; i < 6; i++) { var a = Math.PI / 3 * i + Math.PI / 6, x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); }
var PAT = [
  function storm(c, w, h, th, m, r) { // fractured-glass + forked lightning
    ink(c, m, th.ink, 2.4, .95); var i; for (i = 0; i < 2; i++) bolt(c, r, 0, h * (.3 + .4 * r()), (r() - .5) * .4, w * (.6 + .3 * r()), 1);
    ink(c, m, th.ink, 1, .55); var cx = w * .62, cy = h * .5; for (i = 0; i < 9; i++) { var a = i / 9 * 6.283 + r() * .3, L = 20 + r() * 50; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); c.stroke(); }
    for (var ring = 1; ring < 3; ring++) { c.beginPath(); for (i = 0; i <= 16; i++) { var a2 = i / 16 * 6.283, R = ring * 22 + (r() - .5) * 8; c.lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R); } c.stroke(); }
    ink(c, m, th.ink, 1, .5); for (i = 0; i < w; i += 5) { c.beginPath(); c.moveTo(i, 3); c.lineTo(i, 3 + (i % 15 ? 4 : 8)); c.stroke(); }
    c.font = 'bold 11px monospace'; c.fillText('STORMGLASS // VR-18', 14, h - 10);
  },
  function apiary(c, w, h, th, m, r) { // honeycomb field + hazard stripes
    var rad = 12, dx = rad * 1.5, dy = rad * 1.732, q, p;
    for (q = -1; q < w / dx + 1; q++) for (p = -1; p < h / dy + 1; p++) {
      var cx = q * dx, cy = p * dy + (q & 1 ? dy / 2 : 0), s = r();
      ink(c, m, th.ink, 1.3, .8); hexPath(c, cx, cy, rad - 1.5); c.stroke();
      if (s < .13) { ink(c, m, m === 'bump' ? '#fff' : '#ff9a10', 1, m === 'bump' ? 1 : .42); hexPath(c, cx, cy, rad - 4); c.fill(); }
      else if (s < .2) { ink(c, m, th.ink, 1, .7); hexPath(c, cx, cy, rad - 5); c.stroke(); }
    }
    c.save(); c.beginPath(); c.rect(w * .78, 0, w * .2, h); c.clip(); ink(c, m, m === 'bump' ? '#fff' : '#ffae1a', 1, m === 'bump' ? 1 : .9);
    for (var i = -h; i < w; i += 22) { c.beginPath(); c.moveTo(w * .78 + i, h); c.lineTo(w * .78 + i + 11, h); c.lineTo(w * .78 + i + h + 11, 0); c.lineTo(w * .78 + i + h, 0); c.closePath(); c.fill(); } c.restore();
    ink(c, m, th.ink, 1, .9); c.font = 'bold 11px monospace'; c.fillText('SULFUR WASP · LAR', 12, h - 8);
  },
  function polar(c, w, h, th, m, r) { // aurora contour flow + snow-crystal rosettes
    var i, x; ink(c, m, th.ink, 1.1, .75);
    for (i = 0; i < 16; i++) { c.beginPath(); for (x = 0; x <= w; x += 6) { var y = h * (i + 1) / 17 + Math.sin(x * .021 + i * .55) * 9 + Math.sin(x * .007 + i) * 14; if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
    for (var k = 0; k < 3; k++) { var cx = w * (.2 + k * .3), cy = h * (.35 + .3 * (k % 2)); ink(c, m, th.dark, 1.5, .9); for (i = 0; i < 6; i++) { var a = i * Math.PI / 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24); c.stroke(); for (var b = 1; b < 3; b++) { var bx = cx + Math.cos(a) * b * 8, by = cy + Math.sin(a) * b * 8; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a + .9) * 7, by + Math.sin(a + .9) * 7); c.moveTo(bx, by); c.lineTo(bx + Math.cos(a - .9) * 7, by + Math.sin(a - .9) * 7); c.stroke(); } } }
    ink(c, m, th.dark, 1, .8); c.font = 'bold 11px monospace'; c.fillText('POLAR VEIL / AURORA-9', 12, h - 8);
  },
  function solar(c, w, h, th, m, r) { // overlapping feather scales + sun disc
    var row, col; ink(c, m, th.ink, 1.1, .8);
    for (row = 0; row < h / 15 + 1; row++) for (col = 0; col < w / 22 + 1; col++) { var x = col * 22 + (row & 1) * 11, y = row * 15; c.beginPath(); c.moveTo(x - 11, y); c.quadraticCurveTo(x - 11, y + 17, x, y + 20); c.quadraticCurveTo(x + 11, y + 17, x + 11, y); c.stroke(); c.beginPath(); c.moveTo(x, y + 2); c.lineTo(x, y + 16); c.stroke(); }
    var sx = w * .72, sy = h * .5; ink(c, m, m === 'bump' ? '#fff' : '#ffd36a', 1.4, .95);
    for (var i = 0; i < 28; i++) { var a = i / 28 * 6.283; c.beginPath(); c.moveTo(sx + Math.cos(a) * 18, sy + Math.sin(a) * 18); c.lineTo(sx + Math.cos(a) * (i & 1 ? 32 : 40), sy + Math.sin(a) * (i & 1 ? 32 : 40)); c.stroke(); }
    c.beginPath(); c.arc(sx, sy, 14, 0, 6.283); c.stroke(); c.beginPath(); c.arc(sx, sy, 8, 0, 6.283); c.fill();
    ink(c, m, th.ink, 1, .9); c.font = 'bold 11px monospace'; c.fillText('SOLAR TALON · A3', 12, h - 8);
  },
  function citadel(c, w, h, th, m, r) { // stonework courses, crenellations, magma fractures, rook emblem
    var row, x, bh = 15, bw = 36; ink(c, m, th.ink, 1.1, .55);
    for (row = 1; row < h / bh; row++) { var off = (row & 1) * bw / 2; for (x = -bw; x < w; x += bw) { c.strokeRect(x + off, row * bh, bw, bh); if (r() < .12) { c.globalAlpha = m === 'bump' ? 1 : .35; c.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4); c.globalAlpha = .55; } } }
    ink(c, m, th.ink, 1, .95); for (x = 4; x < w; x += 24) c.fillRect(x, 0, 13, 9); c.fillRect(0, 9, w, 2);
    ink(c, m, m === 'bump' ? '#000' : '#ff3a2a', 2, .95); for (var i = 0; i < 3; i++) bolt(c, r, w * (.15 + .33 * i), h * .15, 1.5 + (r() - .5) * .7, h * .9, 2);
    var ex = w * .82, ey = h * .5; ink(c, m, th.ink, 1.6, .95); c.beginPath(); c.moveTo(ex - 17, ey + 22); c.lineTo(ex - 13, ey + 5); c.lineTo(ex - 13, ey - 12); c.lineTo(ex - 17, ey - 12); c.lineTo(ex - 17, ey - 22); c.lineTo(ex - 9, ey - 22); c.lineTo(ex - 9, ey - 16); c.lineTo(ex - 3, ey - 16); c.lineTo(ex - 3, ey - 22); c.lineTo(ex + 3, ey - 22); c.lineTo(ex + 3, ey - 16); c.lineTo(ex + 9, ey - 16); c.lineTo(ex + 9, ey - 22); c.lineTo(ex + 17, ey - 22); c.lineTo(ex + 17, ey - 12); c.lineTo(ex + 13, ey - 12); c.lineTo(ex + 13, ey + 5); c.lineTo(ex + 17, ey + 22); c.closePath(); c.stroke();
    c.font = 'bold 11px monospace'; c.fillText('CRIMSON CITADEL · R117', 12, h - 8);
  }
];
function plateTextures(T, key, zone, w, h) {
  var th = THEMES[key], out = {};
  EMIT_COL = hex(th.c1);
  ['color', 'bump', 'emit'].forEach(function (mode) {
    var cv = canvas(w, h), c = cv.getContext('2d'), r = rng(key.length * 977 + zone.length * 131 + w);
    metalBase(c, w, h, th, mode, r); c.save(); PAT[th.style](c, w, h, th, mode, r); c.restore(); c.globalAlpha = 1;
    out[mode] = texFrom(T, cv, mode !== 'bump');
  });
  return out;
}

/* ------------------------------------------------------------- plate meshes ---- */
function roundedPoly(S, pts, rad) {
  var n = pts.length, i;
  for (i = 0; i < n; i++) {
    var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    var a = [p1[0] - p0[0], p1[1] - p0[1]], b = [p2[0] - p1[0], p2[1] - p1[1]], la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
    var ra = Math.min(rad, la * .45), rb = Math.min(rad, lb * .45);
    var s = [p1[0] - a[0] / la * ra, p1[1] - a[1] / la * ra], e = [p1[0] + b[0] / lb * rb, p1[1] + b[1] / lb * rb];
    if (i === 0) S.moveTo(s[0], s[1]); else S.lineTo(s[0], s[1]);
    S.quadraticCurveTo(p1[0], p1[1], e[0], e[1]);
  }
  S.closePath();
}
function zoneOutline(z, style) { // (z,y) polygon, CCW viewed with z→right. front = z0 (left)
  var zc = (z.z0 + z.z1) / 2, H = z.yt - z.yb, L = z.z1 - z.z0;
  if (style === 'stock') return [[z.z0, z.yb + H * .22], [z.z0 + L * .1, z.yb], [z.z1 - L * .12, z.yb - H * .05], [z.z1, z.yb + H * .18], [z.z1, z.yt - H * .12], [z.z1 - L * .06, z.yt], [z.z0 + L * .22, z.yt], [z.z0, z.yt - H * .18]];
  if (style === 'hand') return [[z.z0 + L * .04, z.yb], [z.z1 - L * .1, z.yb], [z.z1, z.yb + H * .28], [z.z1, z.yt], [z.z0 + L * .12, z.yt], [z.z0, z.yt - H * .2], [z.z0, z.yb + H * .22]];
  return [[z.z0 + L * .1, z.yb], [z.z1 - L * .14, z.yb], [z.z1, z.yb + H * .24], [z.z1, z.yt - H * .08], [z.z1 - L * .06, z.yt], [z.z0 + L * .16, z.yt], [z.z0, z.yt - H * .22], [z.z0, z.yb + H * .3]];
}
function holeShape(T, kind, cz, cy, w, h) {
  var p = new T.Path(), i;
  if (kind === 'hex') { for (i = 0; i < 6; i++) { var a = Math.PI / 3 * i; var x = cz + Math.cos(a) * w * .5, y = cy + Math.sin(a) * h * .5; if (i) p.lineTo(x, y); else p.moveTo(x, y); } p.closePath(); return p; }
  if (kind === 'blade') { p.moveTo(cz - w / 2, cy - h / 2); p.lineTo(cz + w / 2 - h * .6, cy - h / 2); p.lineTo(cz + w / 2, cy + h / 2); p.lineTo(cz - w / 2 + h * .6, cy + h / 2); p.closePath(); return p; }
  if (kind === 'crenel') { p.moveTo(cz - w / 2, cy - h / 2); p.lineTo(cz + w / 2, cy - h / 2); p.lineTo(cz + w / 2, cy + h / 2); p.lineTo(cz + w * .17, cy + h / 2); p.lineTo(cz + w * .17, cy + h * .1); p.lineTo(cz - w * .17, cy + h * .1); p.lineTo(cz - w * .17, cy + h / 2); p.lineTo(cz - w / 2, cy + h / 2); p.closePath(); return p; }
  if (kind === 'feather') { p.moveTo(cz - w / 2, cy); p.quadraticCurveTo(cz - w * .1, cy + h * .75, cz + w / 2, cy + h * .1); p.quadraticCurveTo(cz + w * .05, cy - h * .7, cz - w / 2, cy); return p; }
  var rr = h / 2; p.moveTo(cz - w / 2 + rr, cy - h / 2); p.lineTo(cz + w / 2 - rr, cy - h / 2); p.quadraticCurveTo(cz + w / 2, cy - h / 2, cz + w / 2, cy); p.quadraticCurveTo(cz + w / 2, cy + h / 2, cz + w / 2 - rr, cy + h / 2); p.lineTo(cz - w / 2 + rr, cy + h / 2); p.quadraticCurveTo(cz - w / 2, cy + h / 2, cz - w / 2, cy); p.quadraticCurveTo(cz - w / 2, cy - h / 2, cz - w / 2 + rr, cy - h / 2); return p;
}
var HOLE_KIND = ['blade', 'hex', 'slot', 'feather', 'crenel'];
var PLATE_DEPTH = 0.0032, PLATE_BEVEL = 0.0011, PLATE_GAP = 0.0009;
/* Build one side plate. Returns {plate, panels}: plate geometry (with vent holes) + glow-panel geometry under the holes. */
function buildPlate(T, key, z, style, side, holes) {
  var th = THEMES[key], S = new T.Shape(), pts = zoneOutline(z, style);
  roundedPoly(S, pts, Math.min(0.012, (z.yt - z.yb) * .16));
  var hs = [], i;
  if (holes) for (i = 0; i < holes.length; i++) { var hh = holes[i]; S.holes.push(holeShape(T, HOLE_KIND[th.style], hh[0], hh[1], hh[2], hh[3])); hs.push(hh); }
  var g = new T.ExtrudeGeometry(S, { depth: PLATE_DEPTH, bevelEnabled: true, bevelThickness: PLATE_BEVEL, bevelSize: PLATE_BEVEL, bevelSegments: 2, curveSegments: 6 });
  var p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, x0 = z.hw + PLATE_GAP + PLATE_BEVEL, L = z.z1 - z.z0, H = z.yt - z.yb;
  for (i = 0; i < p.count; i++) {
    var sx = p.getX(i), sy = p.getY(i), sz = p.getZ(i), nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    p.setXYZ(i, side * (x0 + sz), sy, sx); n.setXYZ(i, side * nz, ny, nx);
    var u = side > 0 ? (z.z1 - sx) / L : (sx - z.z0) / L; uv.setXY(i, u, (sy - z.yb) / H);
  }
  if (side < 0) { // mirrored → fix winding
    for (i = 0; i < p.count; i += 3) { var ax = p.getX(i + 1), ay = p.getY(i + 1), az = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, ax, ay, az); var bx = n.getX(i + 1), by = n.getY(i + 1), bz = n.getZ(i + 1); n.setXYZ(i + 1, n.getX(i + 2), n.getY(i + 2), n.getZ(i + 2)); n.setXYZ(i + 2, bx, by, bz); var cu = uv.getX(i + 1), cv = uv.getY(i + 1); uv.setXY(i + 1, uv.getX(i + 2), uv.getY(i + 2)); uv.setXY(i + 2, cu, cv); }
  }
  g.clearGroups(); g.computeBoundingBox();
  var panels = [];
  hs.forEach(function (hh) {
    var sh = new T.Shape(holeShape(T, HOLE_KIND[th.style], hh[0], hh[1], hh[2], hh[3]).getPoints(8)), pg = new T.ShapeGeometry(sh, 6), pp = pg.attributes.position, pu = pg.attributes.uv;
    for (var k = 0; k < pp.count; k++) { var qx = pp.getX(k), qy = pp.getY(k); pp.setXYZ(k, side * (z.hw + 0.0004), qy, qx); pu.setXY(k, (z.z1 - qx) / L, (qy - hh[1]) / hh[3] + .5); }
    if (side < 0) { var idx = pg.index; for (var q = 0; q < idx.count; q += 3) { var t = idx.getX(q + 1); idx.setX(q + 1, idx.getX(q + 2)); idx.setX(q + 2, t); } }
    pg.computeVertexNormals(); panels.push(pg);
  });
  var ring = S.extractPoints(6).shape; return { plate: g, panels: panels, ring: ring };
}
function plateHoles(key, z, which) { // vent windows (z,y,w,h)
  var L = z.z1 - z.z0, H = z.yt - z.yb, cy = z.yb + H * .5, out = [], i;
  var n = which === 'hand' ? 4 : which === 'recv' ? 2 : 0, th = THEMES[key].style;
  for (i = 0; i < n; i++) {
    var t = (i + .75) / (n + .5); var cz = z.z0 + L * (which === 'hand' ? .2 + t * .7 : .16 + t * .55);
    var w = L * (which === 'hand' ? .1 : .085), h = H * (which === 'hand' ? .34 : .2); if (th === 1) { w = L * .075; h = w * 1.12; }
    out.push([cz, cy + (which === 'hand' ? 0 : H * .12), w, h]);
  }
  return out;
}

function trimGeo(T, ring, z, side) { // inset raised bead following the plate outline
  var L = z.z1 - z.z0, H = z.yt - z.yb, cz = (z.z0 + z.z1) / 2, cy = (z.yb + z.yt) / 2, kz = (L - .009) / L, ky = (H - .009) / H, xo = z.hw + PLATE_GAP + PLATE_BEVEL * 2 + PLATE_DEPTH + .0001, i, v = [];
  for (i = 0; i < ring.length - 1; i += 1) v.push(new T.Vector3(side * xo, cy + (ring[i].y - cy) * ky, cz + (ring[i].x - cz) * kz));
  var cv = new T.CatmullRomCurve3(v, true, 'centripetal'); return new T.TubeGeometry(cv, Math.min(80, v.length * 2), .00105, 5, true);
}
/* ------------------------------------------------------ energy (animated) ---- */
var VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
var FRAG_E = 'uniform float uTime,uSpeed,uFreq,uBase,uEdge,uBoost; uniform vec3 uC1,uC2,uC3; varying vec2 vUv;' +
  'void main(){ float p=fract(vUv.x*uFreq-uTime*uSpeed); float pulse=pow(max(0.0,1.0-abs(p-.5)*2.0),3.0);' +
  ' float flick=.86+.14*sin(uTime*9.0+vUv.x*37.0); float e=mix(1.0,smoothstep(0.0,.18,vUv.y)*smoothstep(1.0,.82,vUv.y),uEdge);' +
  ' vec3 col=mix(uC1,uC2,pulse); col=mix(col,uC3,.5+.5*sin(vUv.x*5.0-uTime*1.7)*(1.0-pulse)*.55);' +
  ' float a=(uBase+pulse*1.15)*flick*e*(1.0+uBoost*1.8); gl_FragColor=vec4(col*a,1.0); }';
function energyMat(T, th, timeU, edge, speed, freq, boostU) {
  return new T.ShaderMaterial({ uniforms: { uBoost: boostU, uTime: timeU, uSpeed: { value: speed }, uFreq: { value: freq }, uBase: { value: edge ? .55 : .8 }, uEdge: { value: edge ? 1 : 0 }, uC1: { value: new T.Color(th.c1) }, uC2: { value: new T.Color(th.c2) }, uC3: { value: new T.Color(th.c3) } },
    vertexShader: VERT, fragmentShader: FRAG_E, transparent: true, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}
function veinGeo(T, pts, rad, smooth, side) {
  var v = pts.map(function (p) { return new T.Vector3(p[0] * side, p[1], p[2]); }), curve;
  if (smooth) curve = new T.CatmullRomCurve3(v, false, 'catmullrom', .5); else { curve = new T.CurvePath(); for (var i = 0; i < v.length - 1; i++) curve.add(new T.LineCurve3(v[i], v[i + 1])); }
  return new T.TubeGeometry(curve, Math.max(24, v.length * 6), rad, 4, false);
}
function zp(z, fz, fy, xo, side) { return [xo, z.yb + (z.yt - z.yb) * fy, z.z0 + (z.z1 - z.z0) * fz]; }
var xOut = function (z) { return z.hw + PLATE_GAP + PLATE_BEVEL * 2 + PLATE_DEPTH + 0.0007; };
function veinPaths(key, zname, z) { // arrays of {pts:[[fz,fy]...], smooth}
  var P = function (a) { return a; }, st = THEMES[key].style, out = [], i;
  if (st === 0) { // lightning
    if (zname === 'recv') out.push({ pts: [[1, .78], [.84, .66], [.74, .8], [.6, .58], [.5, .7], [.36, .5], [.26, .6], [.12, .36], [0, .42]] }, { pts: [[.6, .58], [.54, .38], [.62, .22]] });
    else if (zname === 'hand') out.push({ pts: [[1, .15], [.78, .24], [.66, .1], [.4, .22], [.3, .1], [.0, .2]] }, { pts: [[1, .86], [.82, .78], [.7, .9], [.5, .8], [.36, .9], [0, .82]] });
    else out.push({ pts: [[.0, .8], [.25, .62], [.4, .74], [.65, .45], [.8, .55], [1, .3]] });
  } else if (st === 1) { // hex chain
    var hexLoop = function (cz, cy, r) { var a = []; for (var k = 0; k <= 6; k++) a.push([cz + Math.cos(Math.PI / 3 * k + .52) * r * 1.1, cy + Math.sin(Math.PI / 3 * k + .52) * r]); return a; };
    if (zname === 'recv') { out.push({ pts: hexLoop(.3, .5, .2) }, { pts: hexLoop(.62, .38, .14) }, { pts: [[.0, .12], [.5, .12], [.7, .22], [1, .22]] }); }
    else if (zname === 'hand') out.push({ pts: [[0, .1], [1, .1]] }, { pts: [[0, .9], [1, .9]] });
    else out.push({ pts: hexLoop(.5, .5, .22) }, { pts: [[0, .12], [1, .12]] });
  } else if (st === 2) { // ribbons
    var wave = function (y0, amp, ph) { var a = []; for (var k = 0; k <= 14; k++) { var t = k / 14; a.push([t, y0 + Math.sin(t * 6.283 * 1.2 + ph) * amp]); } return a; };
    if (zname === 'recv') out.push({ pts: wave(.62, .13, 0), smooth: 1 }, { pts: wave(.4, .1, 1.6), smooth: 1 }, { pts: wave(.22, .06, 3.1), smooth: 1 });
    else out.push({ pts: wave(.55, .16, .7), smooth: 1 }, { pts: wave(.3, .1, 2.4), smooth: 1 });
  } else if (st === 3) { // talon arcs
    if (zname === 'recv') out.push({ pts: [[0, .24], [.28, .4], [.55, .72], [.8, .86], [1, .8]], smooth: 1 }, { pts: [[0, .06], [.4, .16], [.72, .4], [.94, .62]], smooth: 1 });
    else if (zname === 'hand') out.push({ pts: [[0, .15], [.5, .3], [1, .62]], smooth: 1 }, { pts: [[0, .88], [.55, .7], [1, .38]], smooth: 1 });
    else out.push({ pts: [[0, .2], [.45, .5], [1, .78]], smooth: 1 });
  } else { // magma fractures
    if (zname === 'recv') out.push({ pts: [[.0, .18], [.15, .32], [.1, .5], [.3, .6], [.26, .78], [.46, .86]] }, { pts: [[1, .22], [.84, .36], [.9, .52], [.7, .6], [.74, .8], [.58, .9]] });
    else if (zname === 'hand') out.push({ pts: [[0, .12], [.2, .2], [.3, .1], [.5, .22], [.7, .12], [1, .2]] }, { pts: [[0, .92], [.18, .8], [.34, .92], [.6, .8], [.8, .9], [1, .78]] });
    else out.push({ pts: [[.0, .85], [.2, .66], [.15, .5], [.4, .4], [.5, .2]] });
  }
  return out;
}
/* ---------------------------------------------------------- muzzle devices ---- */
function lathe(T, prof) { var pts = prof.map(function (p) { return new T.Vector2(p[0], p[1]); }), g = new T.LatheGeometry(pts, 18); g.rotateX(-Math.PI / 2); return g; }
function muzzleDevice(T, key, sp, metalMat, glowMat) {
  var th = THEMES[key].style, r = sp.dev.r, L = sp.dev.len, grp = new T.Group(), glow = [], i, m;
  var parts = [];
  if (th === 0) { // twin-electrode arc brake
    parts.push(lathe(T, [[r * .72, 0], [r, .006], [r, .02], [r * .8, .024], [r * 1.05, .03], [r * 1.05, .05], [r * .9, .058], [r * .7, L]]));
    for (i = 0; i < 2; i++) { var sd = i ? 1 : -1, cv = new T.QuadraticBezierCurve3(new T.Vector3(sd * r * 1.05, 0, -0.012), new T.Vector3(sd * r * 2.2, 0, -0.06), new T.Vector3(sd * r * .7, 0, -0.105)); var tg = new T.TubeGeometry(cv, 14, .0028, 6, false); glow.push(new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(sd * r * 1.05, 0, -0.012), new T.Vector3(sd * r * 2.2, 0, -0.06), new T.Vector3(sd * r * .7, 0, -0.105)), 14, .0012, 4, false)); parts.push(tg); }
  } else if (th === 1) { // hex-bore stinger spike
    var cyl = new T.CylinderGeometry(r * 1.0, r * .92, L * .8, 6, 1); cyl.rotateX(Math.PI / 2); cyl.translate(0, 0, -L * .4); parts.push(cyl);
    var sp2 = new T.ConeGeometry(r * .5, L * .55, 6); sp2.rotateX(-Math.PI / 2); sp2.translate(0, r * 1.15, -L * .45); parts.push(sp2);
    var ring = new T.TorusGeometry(r * 1.02, .0016, 6, 6); ring.translate(0, 0, -L * .55); glow.push(ring);
  } else if (th === 2) { // ice-prism crown
    parts.push(lathe(T, [[r * .7, 0], [r, .01], [r, .03], [r * .78, L * .82]]));
    for (i = 0; i < 5; i++) { var a = i / 5 * 6.283, cr = new T.ConeGeometry(r * .3, L * .8, 5); cr.rotateX(-Math.PI / 2); cr.rotateY(Math.sin(a) * .16); cr.rotateX(Math.cos(a) * .16); cr.translate(Math.sin(a) * r * .82, Math.cos(a) * r * .82, -L * (.55 + .12 * (i % 2))); parts.push(cr); }
    var rg = new T.TorusGeometry(r * 1.06, .0018, 6, 20); rg.translate(0, 0, -L * .18); glow.push(rg);
  } else if (th === 3) { // three curved talons + sun ring
    parts.push(lathe(T, [[r * .72, 0], [r * 1.02, .008], [r * 1.02, .03], [r * .8, .036]]));
    for (i = 0; i < 3; i++) { var an = i / 3 * 6.283 + .5, c0 = new T.Vector3(Math.sin(an) * r * 1.0, Math.cos(an) * r * 1.0, -0.028), c1 = new T.Vector3(Math.sin(an) * r * 1.9, Math.cos(an) * r * 1.9, -0.06), c2 = new T.Vector3(Math.sin(an) * r * .5, Math.cos(an) * r * .5, -0.112); var tc = new T.QuadraticBezierCurve3(c0, c1, c2); parts.push(new T.TubeGeometry(tc, 14, .0034, 6, false)); }
    var sun = new T.TorusGeometry(r * 1.22, .0017, 6, 24); sun.translate(0, 0, -0.03); glow.push(sun);
  } else { // battlement tower
    var tw = new T.CylinderGeometry(r * 1.0, r * 1.1, L * .7, 14, 1); tw.rotateX(Math.PI / 2); tw.translate(0, 0, -L * .35); parts.push(tw);
    for (i = 0; i < 6; i++) { var an2 = i / 6 * 6.283, bx = new T.BoxGeometry(r * .62, r * .62, L * .22); bx.translate(0, r * 1.02, 0); bx.rotateZ(an2); bx.translate(0, 0, -L * .81); parts.push(bx); }
    var bd = new T.TorusGeometry(r * 1.12, .0016, 6, 20); bd.translate(0, 0, -L * .5); glow.push(bd);
  }
  var geo = mergeGeo(T, parts); m = new T.Mesh(geo, metalMat); m.name = 'skin-muzzle-device'; grp.add(m);
  if (glow.length) { var gm = new T.Mesh(mergeGeo(T, glow), glowMat); gm.name = 'skin-muzzle-glow'; grp.add(gm); }
  grp.position.set(sp.muz[0], sp.muz[1], sp.muz[2] + L * .9); return grp;
}
/* ----------------------------------------------------------- FX textures ---- */
function spriteTex(T, style, kind) { // kind: 'flash' | 'p'
  var s = kind === 'flash' ? 128 : 64, c = canvas(s, s), g = c.getContext('2d'), h = s / 2, i;
  g.translate(h, h); var gr = g.createRadialGradient(0, 0, 0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  if (kind === 'flash') {
    g.fillStyle = gr; g.fillRect(-h, -h, s, s); g.fillStyle = '#fff';
    var spikes = [7, 6, 5, 8, 4][style];
    for (i = 0; i < spikes * 2; i++) { var a = i / (spikes * 2) * 6.283 + (style === 4 ? .785 : 0), L = (i & 1 ? .45 : .98) * h; g.save(); g.rotate(a); g.beginPath(); if (style === 3) { g.moveTo(0, -2); g.quadraticCurveTo(L * .5, -9, L, 0); g.quadraticCurveTo(L * .5, 9, 0, 2); } else if (style === 4) { g.rect(0, -3, L * (i & 1 ? .6 : 1), 6); } else { g.moveTo(0, -4); g.lineTo(L, 0); g.lineTo(0, 4); } g.closePath(); g.fill(); g.restore(); }
    if (style === 1) { g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#fff'; g.lineWidth = 3; hexPath(g, 0, 0, h * .42); g.stroke(); }
    return texFrom(T, c, false);
  }
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  if (style === 0) { g.beginPath(); g.moveTo(0, -26); g.lineTo(7, 0); g.lineTo(0, 26); g.lineTo(-7, 0); g.closePath(); g.fill(); }
  else if (style === 1) { hexPath(g, 0, 0, 22); g.fill(); }
  else if (style === 2) { g.beginPath(); g.moveTo(0, -28); g.lineTo(9, -6); g.lineTo(0, 28); g.lineTo(-9, -6); g.closePath(); g.fill(); g.globalAlpha = .5; g.beginPath(); g.arc(0, 0, 26, 0, 6.283); g.fill(); }
  else if (style === 3) { g.beginPath(); g.moveTo(0, -28); g.quadraticCurveTo(16, -4, 0, 28); g.quadraticCurveTo(-16, -4, 0, -28); g.fill(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -24); g.lineTo(0, 24); g.stroke(); }
  else { g.fillRect(-16, -16, 32, 32); g.globalCompositeOperation = 'destination-out'; g.fillRect(-9, -9, 18, 18); g.globalCompositeOperation = 'source-over'; g.fillRect(-4, -4, 8, 8); }
  return texFrom(T, c, false);
}
function glowTex(T) { var c = canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return texFrom(T, c, false); }

/* --------------------------------------------------------------- FX system ---- */
var TRACER_FRAG = 'uniform float uT,uLen,uStyle; uniform vec3 uC1,uC2,uC3; varying vec2 vUv;' +
  'float h1(float n){return fract(sin(n)*43758.5453);}' +
  'void main(){ float u=vUv.x; float v=vUv.y*2.0-1.0; float head=uT*1.2; float d=head-u; if(d<0.0) discard;' +
  ' float trail=clamp(2.2/uLen,0.03,.5); float a=exp(-d/trail*3.2); float w=abs(v); float core=pow(max(0.0,1.0-w),2.0); vec3 col=mix(uC1,uC2,core);' +
  ' if(uStyle<.5){ float j=sin(u*uLen*55.0+uT*90.0)*.45*(1.0-d/trail*.3); core=pow(max(0.0,1.0-abs(v+j)),3.0); a*=1.0; col=mix(uC1,uC2,core); }' +
  ' else if(uStyle<1.5){ float dash=step(.45,fract(u*uLen*9.0)); a*=mix(.25,1.0,dash); col=mix(uC3,uC2,core); }' +
  ' else if(uStyle<2.5){ float ww=sin(u*uLen*10.0-uT*26.0)*.45; core=pow(max(0.0,1.0-abs(v-ww)),2.2); col=mix(uC1,uC3,.5+.5*sin(u*uLen*.7+uT*4.0)); col=mix(col,uC2,core*.6); }' +
  ' else if(uStyle<3.5){ float sp=step(.72,h1(floor(u*uLen*34.0)+floor(uT*30.0))); a*=.7+.6*sp; col=mix(uC1,uC2,core); }' +
  ' else { float seg=floor(u*uLen*26.0); float blk=mod(seg,2.0); core=step(w,.55)*(.45+.55*blk); a*=.4+.6*blk; col=mix(uC3,uC1,core); }' +
  ' a*=1.0-uT*uT; gl_FragColor=vec4(col*a*(core+.25),1.0); }';
var PART_VERT = 'attribute float aSize; attribute float aAlpha; attribute float aRot; uniform float uScale; varying float vA; varying float vRot; void main(){ vA=aAlpha; vRot=aRot; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }';
var PART_FRAG = 'uniform sampler2D uMap; uniform vec3 uC1,uC2; varying float vA; varying float vRot; void main(){ vec2 p=gl_PointCoord-.5; float c=cos(vRot),s=sin(vRot); p=vec2(c*p.x-s*p.y,s*p.x+c*p.y)+.5; vec4 t=texture2D(uMap,p); if(t.a<.02) discard; vec3 col=mix(uC1,uC2,.28); gl_FragColor=vec4(col*t.a*vA*1.5,1.0); }';
function buildFx(T, key, muzzle, opts) {
  var th = THEMES[key], N = 3, NP = opts.quality === 'low' ? 28 : 48, fx = {}, i, j;
  var root = new T.Group(); root.name = 'skin-fx-' + key; root.userData.cosmeticOnly = true;
  var c1 = new T.Color(th.c1), c2 = new T.Color(th.c2), c3 = new T.Color(th.c3);
  /* viewmodel muzzle flash (anchored in addon, cheap: 3 additive quads, no lights) */
  var flash = new T.Group(); flash.position.set(muzzle[0], muzzle[1], muzzle[2] - 0.012); flash.visible = false; flash.renderOrder = 20;
  var ftex = spriteTex(T, th.style, 'flash'), fm = new T.MeshBasicMaterial({ map: ftex, color: c1, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  var fm2 = fm.clone(); fm2.color = c2; fm2.map = ftex;
  var q0 = new T.Mesh(new T.PlaneGeometry(0.2, 0.2), fm), q1 = new T.Mesh(new T.PlaneGeometry(0.16, 0.16), fm2), q2 = new T.Mesh(new T.PlaneGeometry(0.34, 0.1), fm);
  q1.position.z = -0.012; q2.rotation.y = Math.PI / 2; q2.position.z = -0.07; var q3 = q2.clone(); q3.rotation.z = Math.PI / 2; flash.add(q0, q1, q2, q3); flash.children.forEach(function (c) { c.renderOrder = 20; c.frustumCulled = false; });
  fx.flash = flash; fx.flashT = 9; fx.flashP = 1;
  /* tracers */
  var tracers = [], tg = (function () { var a = new T.PlaneGeometry(1, 1), b = a.clone(); a.rotateY(0); a.translate(0.5, 0, 0); b.translate(0.5, 0, 0); b.rotateX(Math.PI / 2); return mergeGeo(T, [a, b]); })();
  tg.rotateY(Math.PI / 2); // length axis +X → -Z (forward)
  for (i = 0; i < (opts.lite ? 0 : 6); i++) { var tm = new T.ShaderMaterial({ uniforms: { uT: { value: 1 }, uLen: { value: 10 }, uStyle: { value: th.style }, uC1: { value: c1 }, uC2: { value: c2 }, uC3: { value: c3 } }, vertexShader: VERT, fragmentShader: TRACER_FRAG, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }); var tmesh = new T.Mesh(tg, tm); tmesh.visible = false; tmesh.frustumCulled = false; tmesh.userData.life = 0; root.add(tmesh); tracers.push(tmesh); }
  fx.tracers = tracers; fx.tIdx = 0;
  /* kill bursts (pooled) */
  var ptex = spriteTex(T, th.style, 'p'), gtex = glowTex(T), kills = [];
  for (i = 0; i < (opts.lite ? 0 : N); i++) {
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(NP * 3), 3)); geo.setAttribute('aSize', new T.BufferAttribute(new Float32Array(NP), 1)); geo.setAttribute('aAlpha', new T.BufferAttribute(new Float32Array(NP), 1)); geo.setAttribute('aRot', new T.BufferAttribute(new Float32Array(NP), 1));
    var pm = new T.ShaderMaterial({ uniforms: { uMap: { value: ptex }, uScale: { value: 500 }, uC1: { value: c1 }, uC2: { value: c2 } }, vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    var pts = new T.Points(geo, pm); pts.frustumCulled = false; pts.visible = false;
    var ringM = new T.MeshBasicMaterial({ map: gtex, color: c1, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    var ring = new T.Mesh(new T.RingGeometry(.82, 1, 40), new T.MeshBasicMaterial({ color: c1, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.frustumCulled = false;
    var col = new T.Mesh(new T.PlaneGeometry(.5, 1.7), ringM); col.geometry.translate(0, .85, 0); col.visible = false; col.frustumCulled = false; var col2 = col.clone(); col2.rotation.y = Math.PI / 2; col.add(col2);
    root.add(pts, ring, col);
    kills.push({ pts: pts, ring: ring, col: col, vel: new Float32Array(NP * 3), life: new Float32Array(NP), max: new Float32Array(NP), sz: new Float32Array(NP), rot: new Float32Array(NP), spin: new Float32Array(NP), t: 9, T: 1 });
  }
  fx.kills = kills; fx.kIdx = 0; fx.NP = NP; fx.root = root; fx.ptex = ptex; fx.gtex = gtex; fx.ftex = ftex;
  return fx;
}
var _v = null;
function fxFire(fx, power) { fx.flashT = 0; fx.flashP = power || 1; fx.flash.visible = true; fx.flash.rotation.z = Math.random() * 6.283; }
function fxTracer(T, fx, a, b) {
  var m = fx.tracers[fx.tIdx = (fx.tIdx + 1) % fx.tracers.length]; var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < .3) return; var cl = Math.min(len, 90), k = cl / len;
  m.position.copy(a); m.scale.set(cl, 0.035, 0.035); m.scale.set(1, .035, 1);
  _v = _v || new T.Vector3(); _v.set(dx, dy, dz).normalize(); m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), _v); m.scale.set(.07, .07, cl);
  m.material.uniforms.uLen.value = cl; m.material.uniforms.uT.value = 0; m.userData.life = 0; m.visible = true;
}
function fxKill(T, fx, pos, style) {
  var k = fx.kills[fx.kIdx = (fx.kIdx + 1) % fx.kills.length], n = fx.NP, p = k.pts.geometry.attributes.position.array, i, a, e, s;
  for (i = 0; i < n; i++) {
    a = Math.random() * 6.283; e = (Math.random() - .25) * 1.5; s = (1.4 + Math.random() * 3.6) * (style === 2 ? .45 : 1);
    k.vel[i * 3] = Math.cos(a) * Math.cos(e) * s; k.vel[i * 3 + 1] = Math.sin(e) * s + (style === 2 || style === 3 ? 1.2 : 1.8); k.vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
    p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
    k.max[i] = k.life[i] = (style === 2 ? 1.5 : .7) + Math.random() * .6; k.sz[i] = (style === 3 ? .2 : .12) + Math.random() * .14; k.rot[i] = Math.random() * 6.283; k.spin[i] = (Math.random() - .5) * 8;
  }
  k.pts.visible = true; k.t = 0; k.T = 1.6; k.px = pos.x; k.py = pos.y; k.pz = pos.z;
  k.ring.position.copy(pos); k.ring.position.y += .04; k.ring.visible = true; k.col.position.copy(pos); k.col.visible = true;
}
function fxUpdate(fx, dt, style) {
  var i, j, k, f;
  if (fx.flash.visible) { fx.flashT += dt; f = fx.flashT / .07; if (f >= 1) fx.flash.visible = false; else { var s = (1 - f * f) * fx.flashP; fx.flash.scale.set(.6 + s * .9, .6 + s * .9, 1); fx.flash.children.forEach(function (c) { c.material.opacity = Math.min(1, 1.3 - f); }); } }
  for (i = 0; i < fx.tracers.length; i++) { var t = fx.tracers[i]; if (!t.visible) continue; t.userData.life += dt; var u = t.userData.life / .11; if (u >= 1) t.visible = false; else t.material.uniforms.uT.value = u; }
  for (i = 0; i < fx.kills.length; i++) {
    k = fx.kills[i]; if (!k.pts.visible) continue; k.t += dt; if (k.t >= k.T) { k.pts.visible = k.ring.visible = k.col.visible = false; continue; }
    var P = k.pts.geometry.attributes, p = P.position.array, sA = P.aSize.array, aA = P.aAlpha.array, rA = P.aRot.array;
    for (j = 0; j < fx.NP; j++) {
      k.life[j] -= dt; if (k.life[j] <= 0) { aA[j] = 0; continue; }
      var g = style === 2 ? -.4 : style === 3 ? 1.2 : 7; k.vel[j * 3 + 1] -= g * dt; var drag = Math.pow(style === 2 ? .2 : .08, dt);
      k.vel[j * 3] *= drag; k.vel[j * 3 + 2] *= drag; if (style === 3) k.vel[j * 3] += Math.sin(k.t * 9 + j) * dt * 3;
      if (style === 1) { var vx = k.vel[j * 3], vz = k.vel[j * 3 + 2]; k.vel[j * 3] = vx - vz * dt * 5; k.vel[j * 3 + 2] = vz + vx * dt * 5; }
      p[j * 3] += k.vel[j * 3] * dt; p[j * 3 + 1] += k.vel[j * 3 + 1] * dt; p[j * 3 + 2] += k.vel[j * 3 + 2] * dt;
      var l = k.life[j] / k.max[j]; aA[j] = Math.min(1, l * 2.2); sA[j] = k.sz[j] * (.6 + .4 * l); k.rot[j] += k.spin[j] * dt; rA[j] = k.rot[j];
    }
    P.position.needsUpdate = P.aSize.needsUpdate = P.aAlpha.needsUpdate = P.aRot.needsUpdate = true;
    var r = k.t / .45; if (r < 1) { var sc = .15 + r * 2.1; k.ring.scale.set(sc, sc, 1); k.ring.material.opacity = (1 - r) * .9; } else k.ring.visible = false;
    var c = k.t / .5; if (c < 1) { k.col.scale.set(1 - c * .7, 1 + c * .5, 1 - c * .7); k.col.material.opacity = (1 - c) * (1 - c); k.col.children[0].material.opacity = k.col.material.opacity; } else k.col.visible = false;
  }
}

/* ------------------------------------------------------------------- create ---- */
function create(T, weaponKey, factoryRoot, options) {
  if (!T || !factoryRoot || !factoryRoot.isObject3D) throw new TypeError('Expected the live Factory Object3D');
  if (CLASS_WEAPONS.indexOf(weaponKey) < 0) throw new Error('Weapon is not in this class pack: ' + weaponKey);
  options = options || {};
  var sp = SPEC[weaponKey], th = THEMES[weaponKey], hi = options.quality !== 'low';
  var addon = new T.Group(); addon.name = 'skin-addon-' + weaponKey; addon.userData.cosmeticOnly = true; addon.userData.baseKey = weaponKey; addon.userData.skinApiVersion = 1;
  var timeU = { value: 0 }, boostU = { value: 0 }, disposables = [], env = options.envMap || studioEnv(T);
  var res = hi ? [512, 160, 512, 128, 384, 128] : [256, 80, 256, 64, 192, 64];
  var emis = []; function matFor(tex) { var m = new T.MeshStandardMaterial({ color: 0xffffff, map: tex.color, bumpMap: tex.bump, bumpScale: 1.6, metalness: .62, roughness: .42, envMap: env, envMapIntensity: .85, emissive: 0xffffff, emissiveMap: tex.emit, emissiveIntensity: .4 }); emis.push(m); disposables.push(m, tex.color, tex.bump, tex.emit); return m; }
  var eVein = energyMat(T, th, timeU, 0, key2speed(th.style), 3, boostU), ePanel = energyMat(T, th, timeU, 1, key2speed(th.style) * .7, 2, boostU); ePanel.side = T.DoubleSide; disposables.push(eVein, ePanel);
  function key2speed(s) { return [.9, .5, .35, .45, .3][s]; }
  var veinList = [], panelList = [], trimList = [], meshes = [];
  function zoneBuild(zname, style, w, h, sideZones) {
    var z = sp[zname === 'recv' ? 'recv' : zname]; if (!z) return;
    var tex = plateTextures(T, weaponKey, zname, w, h), mat = matFor(tex), gl = [];
    var holes = zname === 'stock' ? null : plateHoles(weaponKey, z, zname);
    [1, -1].forEach(function (side) {
      var b = buildPlate(T, weaponKey, z, style, side, holes); gl.push(b.plate); trimList.push(trimGeo(T, b.ring, z, side)); b.panels.forEach(function (p) { panelList.push(p); });
      veinPaths(weaponKey, zname, z).forEach(function (vp) { var xo = xOut(z) + .0009; var pts = vp.pts.map(function (q) { return zp(z, q[0], q[1], xo); }); veinList.push(veinGeo(T, pts, .0011, !!vp.smooth, side)); });
    });
    var mesh = new T.Mesh(mergeGeo(T, gl), mat); mesh.name = 'skin-plate-' + zname; meshes.push(mesh); addon.add(mesh);
  }
  zoneBuild('recv', 'recv', res[0], res[1]);
  if (sp.hand) zoneBuild('hand', 'hand', res[2], res[3]);
  zoneBuild('stock', 'stock', res[4], res[5]);
  /* aurora: barrel shroud rings instead of a side-plate handguard */
  if (sp.shroud) {
    var sh = sp.shroud, tex = plateTextures(T, weaponKey, 'shroud', res[2], res[3]), smat = matFor(tex), parts = [], k;
    var prof = [[sh.r * .82, 0], [sh.r, .012], [sh.r, .075], [sh.r * .86, .082], [sh.r * .86, .095], [sh.r, .102], [sh.r, .17], [sh.r * .86, .178], [sh.r * .86, .19], [sh.r, .197], [sh.r * .92, sh.z1 - sh.z0]];
    var lg = lathe(T, prof); lg.translate(0, 0, 0); var lm = new T.Mesh(lg, smat); lm.position.set(0, sh.y, sh.z1); lm.name = 'skin-shroud'; addon.add(lm); meshes.push(lm);
    for (k = 0; k < 3; k++) { var tr = new T.TorusGeometry(sh.r * 1.01, .0016, 5, 24); tr.translate(0, sh.y, sh.z1 - (.012 + k * .09 + .0)); veinList.push(tr); }
  }
  var trimMat = new T.MeshStandardMaterial({ color: th.trim, metalness: .95, roughness: .24, envMap: env, envMapIntensity: 1.1 }); disposables.push(trimMat);
  if (trimList.length) { var tm0 = new T.Mesh(mergeGeo(T, trimList), trimMat); tm0.name = 'skin-trim'; addon.add(tm0); }
  /* muzzle device + glow (static trim) */
  var devMat = new T.MeshStandardMaterial({ color: new T.Color(th.metal), metalness: .85, roughness: .3, envMap: env, envMapIntensity: 1.2 }); disposables.push(devMat);
  var dev = muzzleDevice(T, weaponKey, sp, devMat, eVein); addon.add(dev);
  /* merged energy meshes (2 draw calls for all glow) */
  if (veinList.length) { var vm = new T.Mesh(mergeGeo(T, veinList), eVein); vm.name = 'skin-energy-veins'; vm.renderOrder = 5; vm.frustumCulled = false; addon.add(vm); }
  if (panelList.length) { var pm = new T.Mesh(mergeGeo(T, panelList), ePanel); pm.name = 'skin-energy-panels'; pm.renderOrder = 4; pm.frustumCulled = false; addon.add(pm); }
  /* FX */
  var fx = buildFx(T, weaponKey, sp.muz, options); addon.add(fx.flash);
  var scale = options.pixelScale || 600; fx.kills.forEach(function (k) { k.pts.material.uniforms.uScale.value = scale; });
  if (options.scene && options.scene.add) options.scene.add(fx.root);
  var ud = addon.userData; ud.fxRoot = fx.root; ud.skin = { id: th.id, name: th.name, weapon: weaponKey, rarity: 'legendary', apiVersion: 1 };
  ud.boost = function (v) { boostU.value = Math.min(1.4, boostU.value + v); };
  ud.update = function (dt) { timeU.value += dt; boostU.value = Math.max(0, boostU.value - dt * 1.6); var pe = .36 + .16 * Math.sin(timeU.value * 2.2); for (var q = 0; q < emis.length; q++) emis[q].emissiveIntensity = pe; fxUpdate(fx, dt, th.style); };
  ud.fire = function (power) { fxFire(fx, power); };
  ud.tracer = function (a, b) { fxTracer(T, fx, a, b); };
  ud.kill = function (pos) { fxKill(T, fx, pos, th.style); };
  ud.setView = function (hPx, fovDeg) { var s = hPx * .5 / Math.tan(fovDeg * Math.PI / 360); fx.kills.forEach(function (k) { k.pts.material.uniforms.uScale.value = s; }); };
  ud.fx = fx;
  ud.dispose = function () {
    addon.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); fx.root.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    disposables.forEach(function (d) { d.dispose && d.dispose(); }); [fx.ptex, fx.gtex, fx.ftex].forEach(function (t) { t.dispose(); });
    if (fx.root.parent) fx.root.parent.remove(fx.root); 
  };
  return addon;
}
/* ---- adapter to Sightline's Legendary rig interface (weapon-skins.js) ---- */
function buildRig(T, key, host, spec) {
  var addon = create(T, key, host, { lite: true, quality: 'high' }), ud = addon.userData;
  var st = { t: 0, detail: 'high', reload: 0, reloading: false };
  addon.name = 'Legendary-' + key + '-' + THEMES[key].name.replace(/\s+/g, '-') + '-overlay';
  ud.sightlineLegendary = { weapon: key, design: THEMES[key].name, source: 'original-code-authored-overlay', replacesFactory: false };
  return { group: addon, state: st, replacesBase: false, magazineDecor: [], pumpGroup: null,
    mount: function (root) { root.add(addon); }, setVisible: function (v) { addon.visible = !!v; }, setOpticVisible: function () {},
    update: function (dt, o) { st.t += dt || 0; if (addon.visible) ud.update(dt || 0); },
    setDetail: function (v) { st.detail = v === 'low' ? 'low' : 'high'; }, setReload: function (p, a) { st.reloading = !!a; st.reload = a ? p : 0; if (a) ud.boost(.02); },
    inspect: function (a) { if (a) ud.boost(.9); }, fire: function () { ud.fire(1); ud.boost(.4); }, hit: function () { ud.boost(.5); }, kill: function () { ud.boost(1); }, awaken: function () { ud.boost(1); } };
}
global.SightlineLegendaryOverlay = { weapons: ['stinger', 'aurora', 'falcon', 'carbine', 'rook117'], buildRig: buildRig };
registry['assault-rifles'] = Object.freeze({ apiVersion: 1, classId: 'assault-rifles', weapons: Object.freeze(CLASS_WEAPONS.slice()), themes: Object.freeze(Object.keys(THEMES).reduce(function (o, k) { o[k] = THEMES[k].name; return o; }, {})), create: create });
})(window);

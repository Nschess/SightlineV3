(function (global) {
'use strict';
/* ======================================================================
   Sightline character kit (P11.7)
   Replaces the shared box/cylinder operative rig with individually modelled people:
   proportioned bodies, painted faces, real hair/headgear/kit variety, layered clothing,
   baked ambient occlusion and fabric texture. Arm silhouette is rendered geometry and
   therefore also affects mesh-raycast arm target area; movement, weapon balance, body
   height contract (body + two hip-pivoted legs, head above y=1.56), and damage are untouched.
   Pure-math geometry; THREE is only touched at the very end (BufferGeometry + materials).
   ====================================================================== */

/* ---------- small helpers ---------- */
var PI = Math.PI, TAU = PI * 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function gauss(t, s) { if (s === undefined) s = 1; return Math.exp(-(t / s) * (t / s)); }
function hashStr(s) { var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function RNG(seed) { var a = seed >>> 0 || 1; var f = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; }; f.range = function (a2, b2) { return a2 + (b2 - a2) * f(); }; f.chance = function (p) { return f() < p; }; return f; }
function hex(c) { if (typeof c !== 'string') return [c[0], c[1], c[2]]; var n = parseInt(c.replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function css(c, a) { var r = Math.round(clamp(c[0], 0, 1) * 255), g = Math.round(clamp(c[1], 0, 1) * 255), b = Math.round(clamp(c[2], 0, 1) * 255); return a === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function mulc(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function lum(c) { return c[0] * .299 + c[1] * .587 + c[2] * .114; }
function desat(c, k) { var l = lum(c); return [lerp(c[0], l, k), lerp(c[1], l, k), lerp(c[2], l, k)]; }
function tint(c, r, g, b) { return [c[0] * r, c[1] * g, c[2] * b]; }
function V(x, y, z) { return [x, y, z]; }
function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul3(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function len3(a) { return Math.sqrt(dot3(a, a)); }
function norm3(a) { var l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
/* Euler XYZ rotation of a vector (same convention as three.js) */
function rotE(v, r) {
  if (!r) return v;
  var a = Math.cos(r[0]), b = Math.sin(r[0]), c = Math.cos(r[1]), d = Math.sin(r[1]), e = Math.cos(r[2]), f = Math.sin(r[2]);
  var ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [(c * e) * v[0] + (-c * f) * v[1] + d * v[2], (af + be * d) * v[0] + (ae - bf * d) * v[1] + (-b * c) * v[2], (bf - ae * d) * v[0] + (be + af * d) * v[1] + (a * c) * v[2]];
}
function sgnpow(v, p) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), p); }

/* ---------- atlas layout (256 x 256) ---------- */
var ATL = 256;
var REG = {
  cloth: [0, 0, 128, 128], face: [128, 0, 128, 128], grain: [0, 128, 128, 64], hair: [0, 192, 128, 64],
  white: [128, 128, 16, 16], knit: [128, 160, 128, 48], metal: [144, 128, 48, 16], molle: [128, 208, 128, 48]
};
function atl(reg, a, b) { var r = REG[reg]; return [(r[0] + clamp(a, 0.03, 0.97) * r[2]) / ATL, 1 - (r[1] + clamp(b, 0.03, 0.97) * r[3]) / ATL]; }
var UVW = atl('white', .5, .5);
/* face painting space: metres relative to the head centre */
var FX = 640, FY = 533.333;
function faceUV(x, y) { return atl('face', (x + 0.1) / 0.2, (0.12 - y) / 0.24); }

/* ---------- mesh builder ---------- */
function MB() { this.P = []; this.N = []; this.U = []; this.C = []; this.I = []; this.tag = []; }
MB.prototype.count = function () { return this.P.length / 3; };
/* generic grid surface. posFn(i,j)->[x,y,z]; i rows, j unique columns (wraps when o.wrap).
   o.col: [r,g,b] | fn(p,n,i,j,t,s); o.uv: fn(p,n,i,j,t,s)->[u,v]; o.closed -> auto orient by signed volume */
MB.prototype.surface = function (rows, cols, posFn, o) {
  o = o || {};
  var wrap = !!o.wrap, W = wrap ? cols + 1 : cols, pts = [], i, j, k;
  for (i = 0; i < rows; i++) for (j = 0; j < W; j++) pts.push(posFn(i, wrap ? j % cols : j));
  var nrm = new Array(pts.length), vol = 0;
  for (k = 0; k < pts.length; k++) nrm[k] = [0, 0, 0];
  var tris = [];
  for (i = 0; i < rows - 1; i++) for (j = 0; j < W - 1; j++) {
    var a = i * W + j, b = (i + 1) * W + j, c = i * W + j + 1, d = (i + 1) * W + j + 1;
    tris.push(a, b, c, b, d, c);
  }
  for (k = 0; k < tris.length; k += 3) { var p0 = pts[tris[k]], p1 = pts[tris[k + 1]], p2 = pts[tris[k + 2]]; vol += dot3(p0, cross3(p1, p2)); }
  var flip = o.flip ? true : false;
  if (o.closed !== false && vol < 0) flip = !flip;
  if (flip) for (k = 0; k < tris.length; k += 3) { var t = tris[k + 1]; tris[k + 1] = tris[k + 2]; tris[k + 2] = t; }
  for (k = 0; k < tris.length; k += 3) {
    var A = pts[tris[k]], B = pts[tris[k + 1]], Cc = pts[tris[k + 2]], fn = cross3(sub3(B, A), sub3(Cc, A));
    for (var m = 0; m < 3; m++) { var q = nrm[tris[k + m]]; q[0] += fn[0]; q[1] += fn[1]; q[2] += fn[2]; }
  }
  if (wrap) for (i = 0; i < rows; i++) { var n0 = nrm[i * W], n1 = nrm[i * W + cols]; var s = [n0[0] + n1[0], n0[1] + n1[1], n0[2] + n1[2]]; nrm[i * W] = s; nrm[i * W + cols] = s; }
  var base = this.count();
  for (i = 0; i < rows; i++) for (j = 0; j < W; j++) {
    k = i * W + j; var p = pts[k], n = norm3(nrm[k]);
    if (o.flatten) n = mix3(n, o.flatten, 0.5), n = norm3(n);
    var t2 = rows > 1 ? i / (rows - 1) : 0, s2 = j / cols;
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]);
    var uv = o.uv ? o.uv(p, n, i, j % (wrap ? cols : W), t2, s2) : UVW; this.U.push(uv[0], uv[1]);
    var col = typeof o.col === 'function' ? o.col(p, n, i, j % (wrap ? cols : W), t2, s2) : (o.col || [1, 1, 1]);
    if (o.ao) { var ao = o.ao(p, n, i, j, t2, s2); col = [col[0] * ao, col[1] * ao, col[2] * ao]; }
    this.C.push(col[0], col[1], col[2]); this.tag.push(o.tag || 0);
  }
  for (k = 0; k < tris.length; k++) this.I.push(base + tris[k]);
};
/* Loft of superellipse rings. secs: {y,rx,rz,cx,cz,n,rot}; returns nothing. */
MB.prototype.loft = function (secs, o) {
  o = o || {}; var segs = o.segs || 12, rows = [], self = this;
  var cb = o.capBot, ct = o.capTop, first = secs[0], last = secs[secs.length - 1];
  function R(s, k, dy) { var c = {}; for (var q in s) c[q] = s[q]; c.rx = s.rx * k; c.rz = s.rz * k; c.y = s.y + (dy || 0); return c; }
  if (cb) { var m = Math.min(first.rx, first.rz); rows.push(R(first, 0, -m * cb * 0.5)); rows.push(R(first, .62, -m * cb * 0.4)); rows.push(R(first, .92, -m * cb * 0.12)); }
  for (var i = 0; i < secs.length; i++) rows.push(secs[i]);
  if (ct) { var m2 = Math.min(last.rx, last.rz); rows.push(R(last, .92, m2 * ct * 0.12)); rows.push(R(last, .62, m2 * ct * 0.4)); rows.push(R(last, 0, m2 * ct * 0.5)); }
  var seam = o.seam || 0;
  this.surface(rows.length, segs, function (i2, j) {
    var s = rows[i2], b = (j / segs) * TAU + seam, sn = Math.sin(b), cs = Math.cos(b), ne = s.n || 2, e = 2 / ne;
    var x = s.rx * sgnpow(sn, e), z = -s.rz * sgnpow(cs, e);
    if (o.wob) { var w = o.wob(i2 / (rows.length - 1), b, s); x *= w; z *= w; }
    var pnt = [x, 0, z]; if (s.rot) pnt = rotE(pnt, [0, s.rot, 0]);
    return [(s.cx || 0) + pnt[0], s.y, (s.cz || 0) + pnt[2]];
  }, { wrap: true, col: o.col, uv: o.uv, ao: o.ao, flip: o.flip, closed: true, tag: o.tag });
};
/* Tube along a polyline with per-point elliptical radii [rx,rz]. */
MB.prototype.tube = function (path, radii, o) {
  o = o || {}; var segs = o.segs || 8, n = path.length, frames = [], i;
  var tan = [];
  for (i = 0; i < n; i++) { var a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)]; tan.push(norm3(sub3(b, a))); }
  var side = o.side ? norm3(o.side) : [1, 0, 0], e1 = side;
  for (i = 0; i < n; i++) {
    var d = tan[i]; e1 = sub3(e1, mul3(d, dot3(e1, d))); if (len3(e1) < 1e-4) e1 = Math.abs(d[1]) < .9 ? [0, 1, 0] : [1, 0, 0], e1 = sub3(e1, mul3(d, dot3(e1, d)));
    e1 = norm3(e1); frames.push([e1, norm3(cross3(d, e1)), d]);
  }
  var rows = [], cb = o.capBot === undefined ? 1 : o.capBot, ct = o.capTop === undefined ? 1 : o.capTop;
  function ringRow(idx, k, dd) { return { c: add3(path[idx], mul3(frames[idx][2], dd || 0)), f: frames[idx], r: radii[idx], k: k, t: idx / (n - 1) }; }
  var rm0 = Math.min(radii[0][0], radii[0][1]), rm1 = Math.min(radii[n - 1][0], radii[n - 1][1]);
  if (cb) { rows.push(ringRow(0, 0, -rm0 * cb * .5)); rows.push(ringRow(0, .7, -rm0 * cb * .3)); }
  for (i = 0; i < n; i++) rows.push(ringRow(i, 1, 0));
  if (ct) { rows.push(ringRow(n - 1, .7, rm1 * ct * .3)); rows.push(ringRow(n - 1, 0, rm1 * ct * .5)); }
  var seamB = 0;
  if (o.seamDir) { var f0 = frames[0], sd = norm3(o.seamDir); seamB = Math.atan2(dot3(sd, f0[1]), dot3(sd, f0[0])); }
  this.surface(rows.length, segs, function (i2, j) {
    var rw = rows[i2], b = (j / segs) * TAU + seamB, c = Math.cos(b), s = Math.sin(b), ne = o.n || 2, e = 2 / ne;
    var rr = rw.r, kx = rr[0] * rw.k, kz = rr[1] * rw.k;
    if (o.wob) { var w = o.wob(rw.t, b); kx *= w; kz *= w; }
    var lx = kx * sgnpow(c, e), lz = kz * sgnpow(s, e);
    return [rw.c[0] + rw.f[0][0] * lx + rw.f[1][0] * lz, rw.c[1] + rw.f[0][1] * lx + rw.f[1][1] * lz, rw.c[2] + rw.f[0][2] * lx + rw.f[1][2] * lz];
  }, { wrap: true, col: o.col, uv: o.uv, ao: o.ao, flip: o.flip, closed: true, tag: o.tag });
};
/* Ellipsoid with optional rotation and per-vertex deformation fn(unit dir)->unit-ish offset */
MB.prototype.ellipsoid = function (c, r, o) {
  o = o || {}; var lat = o.lat || 7, lon = o.lon || 10, rot = o.rot;
  this.surface(lat, lon, function (i, j) {
    var th = PI * i / (lat - 1), al = TAU * j / lon, st = Math.sin(th), ux = st * Math.sin(al), uy = -Math.cos(th), uz = -st * Math.cos(al);
    if (o.deform) { var d = o.deform(ux, uy, uz); ux = d[0]; uy = d[1]; uz = d[2]; }
    var p = [ux * r[0], uy * r[1], uz * r[2]]; if (rot) p = rotE(p, rot);
    return [c[0] + p[0], c[1] + p[1], c[2] + p[2]];
  }, { wrap: true, col: o.col, uv: o.uv, ao: o.ao, flip: o.flip, closed: true, tag: o.tag });
};
/* Tapered box with flat faces (24 verts). size [w,h,d], taper scales top x/z. */
MB.prototype.box = function (c, s, o) {
  o = o || {}; var hw = s[0] / 2, hh = s[1] / 2, hd = s[2] / 2, rot = o.rot, tp = o.taper || [1, 1], bv = o.bevel || 0;
  function T(x, y, z) { var k = y > 0 ? 1 : 0; var tx = lerp(1, tp[0], k), tz = lerp(1, tp[1], k); var p = [x * tx, y, z * tz]; if (rot) p = rotE(p, rot); return [c[0] + p[0], c[1] + p[1], c[2] + p[2]]; }
  var F = [
    [[1, 0, 0], [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]]], [[-1, 0, 0], [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]]],
    [[0, 1, 0], [[-hw, hh, hd], [hw, hh, hd], [hw, hh, -hd], [-hw, hh, -hd]]], [[0, -1, 0], [[-hw, -hh, -hd], [hw, -hh, -hd], [hw, -hh, hd], [-hw, -hh, hd]]],
    [[0, 0, 1], [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]]], [[0, 0, -1], [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]]]
  ];
  var self = this;
  F.forEach(function (f) {
    var q = f[1].map(function (v) { return T(v[0], v[1], v[2]); });
    var n = norm3(cross3(sub3(q[1], q[0]), sub3(q[2], q[0]))), base = self.count();
    var corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (var k = 0; k < 4; k++) {
      var p = q[k], col = typeof o.col === 'function' ? o.col(p, n, k) : (o.col || [1, 1, 1]);
      if (o.ao) { var ao = o.ao(p, n); col = [col[0] * ao, col[1] * ao, col[2] * ao]; }
      var uv = o.uv ? o.uv(p, n, corners[k]) : UVW;
      self.P.push(p[0], p[1], p[2]); self.N.push(n[0], n[1], n[2]); self.U.push(uv[0], uv[1]); self.C.push(col[0], col[1], col[2]); self.tag.push(o.tag || 0);
    }
    self.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
};
/* Mirror (x -> -x) copy of a builder */
MB.prototype.mirrored = function () {
  var m = new MB(), n = this.count(), i;
  for (i = 0; i < n; i++) { m.P.push(-this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]); m.N.push(-this.N[i * 3], this.N[i * 3 + 1], this.N[i * 3 + 2]); }
  m.U = this.U.slice(); m.C = this.C.slice(); m.tag = this.tag.slice();
  for (i = 0; i < this.I.length; i += 3) m.I.push(this.I[i], this.I[i + 2], this.I[i + 1]);
  return m;
};
MB.prototype.append = function (o2) {
  var base = this.count(); for (var i = 0; i < o2.P.length; i++) this.P.push(o2.P[i]); for (i = 0; i < o2.N.length; i++) this.N.push(o2.N[i]);
  for (i = 0; i < o2.U.length; i++) this.U.push(o2.U[i]); for (i = 0; i < o2.C.length; i++) this.C.push(o2.C[i]); for (i = 0; i < o2.tag.length; i++) this.tag.push(o2.tag[i]);
  for (i = 0; i < o2.I.length; i++) this.I.push(o2.I[i] + base);
};
/* Offset (translate) vertices from index `from` onwards */
MB.prototype.shift = function (from, dx, dy, dz) { for (var i = from; i < this.count(); i++) { this.P[i * 3] += dx; this.P[i * 3 + 1] += dy; this.P[i * 3 + 2] += dz; } };
MB.prototype.toGeometry = function (T, excludedTags) {
  var g = new T.BufferGeometry(), n = this.count();
  for (var qi = 0; qi < this.P.length; qi++) if (!isFinite(this.P[qi]) || !isFinite(this.N[qi])) throw new Error('NaN vertex in part: ' + this.tag[Math.floor(qi / 3)]);
  if (n > 65000) throw new Error('character mesh too large: ' + n);
  if (excludedTags && excludedTags.length) {
    var excluded = Object.create(null), remap = Object.create(null), pp = [], nn = [], uu = [], cc = [], ii = [];
    excludedTags.forEach(function (name) { excluded[name] = true; });
    for (var ti = 0; ti < this.I.length; ti += 3) {
      var a = this.I[ti], b = this.I[ti + 1], c = this.I[ti + 2];
      if (excluded[this.tag[a]] || excluded[this.tag[b]] || excluded[this.tag[c]]) continue;
      [a, b, c].forEach(function (old) {
        if (remap[old] !== undefined) { ii.push(remap[old]); return; }
        var fresh = pp.length / 3; remap[old] = fresh;
        pp.push(this.P[old * 3], this.P[old * 3 + 1], this.P[old * 3 + 2]);
        nn.push(this.N[old * 3], this.N[old * 3 + 1], this.N[old * 3 + 2]);
        uu.push(this.U[old * 2], this.U[old * 2 + 1]); cc.push(this.C[old * 3], this.C[old * 3 + 1], this.C[old * 3 + 2]);
        ii.push(fresh);
      }, this);
    }
    if (pp.length / 3 > 65000) throw new Error('filtered character mesh too large');
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pp), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(nn), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uu), 2));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(cc), 3));
    g.setIndex(new T.BufferAttribute(new Uint16Array(ii), 1));
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.P), 3));
  g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.N), 3));
  g.setAttribute('uv', new T.BufferAttribute(new Float32Array(this.U), 2));
  g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.C), 3));
  g.setIndex(new T.BufferAttribute(new Uint16Array(this.I), 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
};

function QS(floor, base, q) { return Math.max(Math.round(floor * Math.min(1, q / .7)), Math.round(base * q), 4); }

/* ---------- character designs: who each operative is ---------- */
var EYES = { brown: [.24, .14, .07], dark: [.12, .07, .045], hazel: [.40, .30, .13], green: [.28, .44, .26], blue: [.30, .46, .66], gray: [.46, .53, .58], amber: [.58, .34, .10], paleblue: [.52, .66, .78] };
var CAMO_KINDS = ['blotch', 'flecktarn', 'tiger', 'digital', 'splinter', 'solid', 'duck'];
var FEM_FIRST = { Ana: 1, Ines: 1, Nell: 1, Pia: 1, Tess: 1, Uma: 1, Sol: 1, Maru: 0 };

/* Hand-made people for the ten named operatives. Everything unspecified falls back to role defaults. */
var NAMED = {
  ashfall: { sex: 'm', age: .78, build: { sh: 1.14, ch: 1.2, wa: 1.2, hp: 1.1, arm: 1.16, bulk: 1.22, head: 1.03 },
    face: { jaw: 1.14, chin: 1.04, cheek: .95, brow: 1.35, noseL: 1.05, noseW: 1.18, noseH: 1.06, lip: .85, eye: .93, eyeSp: 1.0, ear: 1.12, len: 1.0, wid: 1.07, eyeCol: 'dark', browT: 1.35, arch: .25, stubble: .9, freckle: 0, dirt: .5, scar: { x1: -.045, y1: -.02, x2: -.02, y2: -.055, col: .5 } },
    hair: { style: 'crop', col: '#3d3633' }, beard: { style: 'short', col: '#4a4644', gray: .55 }, helm: 'pasgt', camo: 'blotch',
    kit: { vest: 'heavy', pack: 'patrol', extras: ['shoulderGuards', 'groin', 'canteen', 'kneepads', 'tool', 'dump'] }, sleeves: 'long', gloves: 'full', boot: '#17130f' },
  flint: { sex: 'f', age: .38, build: { sh: .95, ch: .9, wa: .88, hp: 1.03, arm: .94, bulk: .9, head: .99 },
    face: { jaw: .88, chin: .96, cheek: 1.12, brow: .8, noseL: .98, noseW: .9, noseH: .94, lip: 1.25, eye: 1.07, eyeSp: 1.02, ear: .92, len: 1.03, wid: .96, eyeCol: 'amber', browT: .85, arch: .55, stubble: 0, freckle: 0, dirt: .22 },
    hair: { style: 'braid', col: '#120c0a' }, beard: null, camo: 'tiger',
    kit: { vest: 'light', pack: 'patrol', extras: ['mast', 'binos', 'strips', 'rangefinder', 'gaiter'] }, sleeves: 'long', gloves: 'fingerless', boot: '#3a2d22' },
  kindle: { sex: 'm', age: .2, build: { sh: 1.0, ch: .98, wa: .92, hp: .98, arm: 1.0, bulk: .94, head: .99 },
    face: { jaw: .98, chin: .98, cheek: .98, brow: .92, noseL: 1.02, noseW: .98, noseH: 1.02, lip: 1.0, eye: 1.02, eyeSp: 1.0, ear: 1.05, len: 1.04, wid: .98, eyeCol: 'green', browT: .9, arch: .35, stubble: .35, freckle: .7, dirt: .45, sunburn: .5 },
    hair: { style: 'short', col: '#c4a05c' }, beard: { style: 'stubble', col: '#b8975a' }, camo: 'flecktarn',
    kit: { vest: 'chest', pack: 'drybag', extras: ['knife', 'watch', 'elbowpads'] }, sleeves: 'rolled', gloves: 'fingerless', boot: '#2a2119' },
  smolder: { sex: 'f', age: .55, build: { sh: 1.06, ch: 1.05, wa: 1.0, hp: 1.08, arm: 1.08, bulk: 1.1, head: 1.0 },
    face: { jaw: 1.04, chin: 1.04, cheek: 1.0, brow: 1.1, noseL: 1.03, noseW: 1.02, noseH: 1.0, lip: 1.05, eye: .98, eyeSp: 1.0, ear: 1.0, len: 1.0, wid: 1.02, eyeCol: 'brown', browT: 1.1, arch: .35, stubble: 0, freckle: 0, dirt: .7, scar: { x1: -.058, y1: .052, x2: -.026, y2: .028, col: .6 } },
    hair: { style: 'bob', col: '#17110d' }, beard: null, camo: 'solid',
    kit: { vest: 'carrier', pack: 'assault', extras: ['shells', 'tool', 'kneepads', 'dump', 'canteen'] }, sleeves: 'long', gloves: 'full', gloveCol: '#6a4a2c', boot: '#241b14' },
  ember: { sex: 'f', age: .3, build: { sh: .93, ch: .88, wa: .86, hp: 1.0, arm: .92, bulk: .86, head: .98 },
    face: { jaw: .86, chin: .94, cheek: 1.05, brow: .75, noseL: .94, noseW: .88, noseH: .92, lip: 1.15, eye: 1.08, eyeSp: 1.0, ear: .9, len: 1.02, wid: .95, eyeCol: 'gray', browT: .8, arch: .5, stubble: 0, freckle: 1.0, dirt: .2, sunburn: .35 },
    hair: { style: 'ponytail', col: '#8a4a22' }, beard: null, camo: 'blotch',
    kit: { vest: 'light', pack: 'hydration', extras: ['binos', 'gaiter', 'watch'] }, sleeves: 'long', gloves: 'fingerless', boot: '#3b2c20' },
  riptide: { sex: 'f', age: .5, build: { sh: 1.0, ch: .96, wa: .92, hp: 1.04, arm: 1.0, bulk: 1.0, head: 1.0 },
    face: { jaw: .98, chin: 1.0, cheek: 1.02, brow: .95, noseL: 1.08, noseW: 1.0, noseH: 1.08, lip: 1.1, eye: 1.02, eyeSp: 1.0, ear: .98, len: 1.02, wid: .98, eyeCol: 'brown', browT: 1.0, arch: .45, stubble: 0, freckle: 0, dirt: .18 },
    hair: { style: 'bun', col: '#1a120e' }, beard: null, helm: 'ach', camo: 'digital',
    kit: { vest: 'carrier', pack: 'radio', extras: ['headset', 'rank', 'map', 'holster', 'nvg', 'watch'] }, sleeves: 'long', gloves: 'full', boot: '#17130f' },
  squall: { sex: 'm', age: .62, build: { sh: 1.16, ch: 1.22, wa: 1.22, hp: 1.12, arm: 1.2, bulk: 1.28, head: 1.04 },
    face: { jaw: 1.2, chin: 1.12, cheek: .98, brow: 1.2, noseL: 1.12, noseW: 1.15, noseH: 1.1, lip: .85, eye: .94, eyeSp: 1.02, ear: 1.1, len: 1.02, wid: 1.1, eyeCol: 'blue', browT: 1.25, arch: .2, stubble: 1, freckle: .2, dirt: .45, sunburn: .35 },
    hair: { style: 'buzz', col: '#b0884f' }, beard: { style: 'full', col: '#a58050', gray: .25 }, helm: 'ach', camo: 'splinter',
    kit: { vest: 'heavy', pack: 'patrol', extras: ['belt', 'shoulderGuards', 'tarp', 'goggles', 'kneepads', 'canteen'] }, sleeves: 'long', gloves: 'full', boot: '#1c1812' },
  halyard: { sex: 'm', age: .36, build: { sh: 1.04, ch: 1.04, wa: .96, hp: 1.0, arm: 1.04, bulk: 1.02, head: 1.02 },
    face: { jaw: 1.12, chin: 1.06, cheek: 1.08, brow: 1.1, noseL: 1.0, noseW: 1.2, noseH: .98, lip: 1.2, eye: .98, eyeSp: 1.02, ear: 1.02, len: 1.0, wid: 1.06, eyeCol: 'dark', browT: 1.2, arch: .3, stubble: .8, freckle: 0, dirt: .22 },
    hair: { style: 'slick', col: '#0f0b09' }, beard: { style: 'goatee', col: '#14100d' }, camo: 'duck',
    kit: { vest: 'light', pack: 'patrol', extras: ['rope', 'binos', 'knife', 'watch'] }, sleeves: 'long', gloves: 'none', boot: '#2b2118' },
  undertow: { sex: 'm', age: .42, build: { sh: 1.04, ch: 1.0, wa: .94, hp: .98, arm: 1.04, bulk: 1.02, head: .99 },
    face: { jaw: 1.04, chin: 1.0, cheek: .96, brow: 1.05, noseL: 1.1, noseW: .96, noseH: 1.08, lip: .95, eye: .96, eyeSp: .98, ear: 1.04, len: 1.04, wid: .98, eyeCol: 'hazel', browT: 1.05, arch: .3, stubble: .6, freckle: .1, dirt: .3 },
    hair: { style: 'crop', col: '#2b1d14' }, beard: { style: 'stubble', col: '#2b1d14' }, camo: 'solid',
    kit: { vest: 'chest', pack: 'drybag', extras: ['knife', 'legknife', 'watch', 'gaiter'] }, sleeves: 'long', gloves: 'full', gloveCol: '#1a1d20', boot: '#14120f' },
  skerry: { sex: 'f', age: .3, build: { sh: .94, ch: .88, wa: .86, hp: 1.0, arm: .92, bulk: .86, head: .98 },
    face: { jaw: .84, chin: .94, cheek: 1.08, brow: .7, noseL: .92, noseW: .86, noseH: .9, lip: 1.1, eye: 1.1, eyeSp: 1.03, ear: .9, len: 1.02, wid: .94, eyeCol: 'paleblue', browT: .7, arch: .5, stubble: 0, freckle: .9, dirt: .15, sunburn: .25 },
    hair: { style: 'braid', col: '#d3ccbd' }, beard: null, camo: 'blotch',
    kit: { vest: 'light', pack: 'hydration', extras: ['rangefinder', 'gaiter', 'strips'] }, sleeves: 'long', gloves: 'fingerless', boot: '#2a2a28' }
};

var ROLE_DEF = {
  anchor: { vest: 'heavy', pack: 'patrol', bulk: 1.15, ex: ['shoulderGuards', 'kneepads', 'canteen'] },
  heavy: { vest: 'heavy', pack: 'patrol', bulk: 1.18, ex: ['belt', 'shoulderGuards', 'kneepads'] },
  marksman: { vest: 'light', pack: 'patrol', bulk: .92, ex: ['binos', 'mast', 'strips', 'rangefinder'] },
  scout: { vest: 'light', pack: 'hydration', bulk: .9, ex: ['binos', 'gaiter', 'watch'] },
  rusher: { vest: 'chest', pack: 'drybag', bulk: .95, ex: ['knife', 'elbowpads'] },
  breacher: { vest: 'carrier', pack: 'assault', bulk: 1.08, ex: ['shells', 'tool', 'kneepads'] },
  captain: { vest: 'carrier', pack: 'radio', bulk: 1.0, ex: ['headset', 'rank', 'map', 'holster'] },
  support: { vest: 'utility', pack: 'assault', bulk: 1.05, ex: ['medkit', 'canteen', 'dump'] }
};

function designFor(op) {
  var seed = hashStr(op.id), r = RNG(seed), nm = NAMED[op.id], role = (op.role || 'Support').toLowerCase();
  if (nm && nm.sex === 'f') nm = null;
  var rd = ROLE_DEF[role] || ROLE_DEF.support;
  var first = (op.real || '').split(' ')[0];
  var sex = 'm';
  var skin = desat(hex(op.skin), .04), hairC = hex(op.hair), D = { id: op.id, seed: seed, rnd: r, sex: sex, role: role, op: op };
  D.age = nm ? nm.age : r.range(.15, .85);
  var bulk = (nm ? nm.build.bulk : rd.bulk * r.range(.93, 1.08)) * (sex === 'f' ? .94 : 1);
  var sh = nm ? nm.build.sh : (sex === 'f' ? r.range(.9, .99) : r.range(.98, 1.1)) * (rd.bulk > 1.1 ? 1.05 : 1);
  D.build = nm ? nm.build : { sh: sh, ch: bulk * (sex === 'f' ? .92 : 1) * r.range(.96, 1.04), wa: bulk * (sex === 'f' ? .88 : 1), hp: sex === 'f' ? r.range(1.0, 1.08) : r.range(.96, 1.04), arm: bulk * r.range(.95, 1.05), bulk: bulk, head: r.range(.97, 1.03) };
  var f = nm ? nm.face : {
    jaw: sex === 'f' ? r.range(.82, 1.0) : r.range(.95, 1.2), chin: r.range(.92, 1.12), cheek: r.range(.9, 1.15), brow: sex === 'f' ? r.range(.65, .95) : r.range(.9, 1.35),
    noseL: r.range(.92, 1.14), noseW: r.range(.85, 1.2), noseH: r.range(.9, 1.12), lip: sex === 'f' ? r.range(1.0, 1.3) : r.range(.82, 1.15), eye: r.range(.92, 1.1), eyeSp: r.range(.96, 1.04), ear: r.range(.9, 1.15),
    len: r.range(.97, 1.07), wid: r.range(.94, 1.08), eyeCol: r.pick(['brown', 'brown', 'dark', 'hazel', 'green', 'blue', 'gray', 'amber']), browT: sex === 'f' ? r.range(.7, 1.0) : r.range(.95, 1.35), arch: r.range(.2, .6),
    stubble: sex === 'f' ? 0 : r.pick([0, 0, .35, .6, .9]), freckle: skin[0] > .8 ? r.pick([0, .3, .7, 1]) : (r.chance(.15) ? .3 : 0), dirt: r.range(.15, .6), sunburn: skin[0] > .8 ? r.range(0, .5) : 0
  };
  D.face = {}; for (var k in f) D.face[k] = f[k];
  if (typeof D.face.eyeCol === 'string') D.face.eyeCol = EYES[D.face.eyeCol];
  if (!D.face.scar && !nm && r.chance(.16)) D.face.scar = { x1: r.range(-.06, -.02) * (r.chance(.5) ? 1 : -1), y1: r.range(.0, .06), x2: r.range(-.04, .04), y2: r.range(-.06, -.01), col: r.range(.3, .6) };
  D.skin = skin;
  // hair
  if (nm) D.hair = { style: nm.hair.style, col: hex(nm.hair.col) };
  else {
    var styles = sex === 'f' ? ['ponytail', 'bun', 'long', 'braid', 'bob', 'short', 'crop', 'ponytail'] : ['buzz', 'crop', 'short', 'sidepart', 'slick', 'curls', 'short', 'crop', 'buzz', 'bald', 'mohawk'];
    var st = r.pick(styles); if (st === 'bald' && D.age < .5) st = 'buzz'; if (st === 'mohawk' && rd.bulk > 1.05) st = 'crop';
    D.hair = { style: st, col: hairC };
  }
  if (D.age > .72) D.hair.col = mixc(D.hair.col, [.62, .62, .6], clamp((D.age - .7) * 2.2, 0, .8));
  if (nm) D.beard = nm.beard ? { style: nm.beard.style, col: hex(nm.beard.col), gray: nm.beard.gray || 0 } : null;
  else if (sex === 'm' && r.chance(op.team === 'red' ? .62 : .22)) D.beard = { style: r.pick(['stubble', 'short', 'full', 'goatee', 'mustache', 'short']), col: mulc(D.hair.col, .92), gray: D.age > .6 ? .4 : 0 };
  else D.beard = null;
  // headgear + face covering follow the game's data (portraits must stay truthful)
  D.head = op.head; D.cover = op.face;
  D.helm = nm && nm.helm ? nm.helm : r.pick(['ach', 'bump', 'pasgt', 'ach', 'bump']);
  if (D.head === 'cap' && !nm && r.chance(.3)) D.head = 'boonie';
  D.camo = nm ? nm.camo : r.pick(CAMO_KINDS);
  var kit = nm ? nm.kit : { vest: rd.vest, pack: r.pick(['assault', 'patrol', 'hydration', 'drybag', rd.pack, rd.pack]), extras: [] };
  if (!nm) {
    if (r.chance(.25)) kit.vest = r.pick(['carrier', 'chest', 'utility', 'light']);
    var pool = rd.ex.slice(); ['canteen', 'watch', 'knife', 'holster', 'dump', 'gaiter', 'goggles', 'binos', 'elbowpads', 'kneepads', 'medkit', 'rope', 'headset'].forEach(function (e) { if (r.chance(.22)) pool.push(e); });
    kit.extras = pool.filter(function (e, i) { return pool.indexOf(e) === i; });
  }
  D.kit = kit; D.ex = {}; kit.extras.forEach(function (e) { D.ex[e] = 1; });
  if (D.cover === 'mask') delete D.ex.gaiter;
  D.sleeves = nm ? nm.sleeves : (r.chance(.22) ? 'rolled' : 'long');
  D.gloves = nm ? nm.gloves : r.pick(['full', 'fingerless', 'fingerless', 'none', 'full']);
  D.boot = hex(nm ? nm.boot : r.pick(['#17130f', '#2a2119', '#3a2d22', '#1c1812', '#2b2118']));
  D.gloveCol = hex(nm && nm.gloveCol ? nm.gloveCol : r.pick(['#1d2024', '#2a2a28', '#3a3226', '#1a1d20', '#4a3c2a']));
  // fabric palette (slightly desaturated so the saturated team palette reads as worn cloth, not toy plastic)
  D.uni = op.uni.map(function (c) { return desat(hex(c), .1); });
  D.vest = desat(hex(op.vest), .08); D.gear = desat(hex(op.gear), .06);
  var tm = (typeof TEAMS !== 'undefined' && TEAMS) ? TEAMS : (typeof window !== 'undefined' && window.TEAMS) || { red: { color: '#d4442a', scarf: '#8e2f1f' }, blue: { color: '#2f7fd1', scarf: '#1f4f86' } };
  var T = tm[op.team] || tm.red; D.teamCol = desat(hex(T.color), .1); D.scarfCol = desat(hex(T.scarf), .05);
  teamize(D, op, r, nm); applyArch(D, op, r); enforceBlueFieldKit(D, op);
  /* Kindle is the Cinder courier point-man. Red-faction randomization used to
     replace his authored kit with a generic roll, erasing his named silhouette.
     Keep his body proportions and weapon-arm anchors intact, but restore a
     stable courier palette and field kit for both world and first-person views. */
  if (op.id === 'kindle') {
    D.uni = ['#514031', '#342921', '#6b4530', '#211b18'].map(function (c) { return desat(hex(c), .04); });
    D.camo = 'flecktarn'; D.head = 'bandana'; D.cover = 'bare';
    D.vest = hex('#332a22'); D.gear = hex('#493729'); D.scarfCol = hex('#34251d');
    D.kit = { vest: 'chest', pack: 'drybag', extras: ['knife', 'watch', 'elbowpads', 'kneepads', 'dump'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'fingerless'; D.gloveCol = hex('#28231d'); D.boot = hex('#211914');
  }
  /* Halyard's named rope-and-climbing kit was lost to blue-team randomization.
     Keep Tidewatch's helmet, carrier and hydration pack, but restore his
     climber palette, rope equipment and coordinated first-person materials. */
  if (op.id === 'halyard') {
    D.uni = ['#2c5560', '#1b3a43', '#487480', '#122a30'].map(function (c) { return desat(hex(c), .05); });
    D.camo = 'duck'; D.head = 'helmet'; D.helm = 'ach'; D.cover = 'bare';
    D.vest = hex('#263d40'); D.gear = hex('#354743'); D.scarfCol = hex('#233b40');
    D.kit = { vest: 'carrier', pack: 'hydration', extras: ['rope', 'binos', 'knife', 'watch', 'kneepads', 'elbowpads', 'headset', 'goggles'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'full'; D.gloveCol = hex('#1d2929'); D.boot = hex('#26251f');
  }
  /* Ashfall's authored rail-yard kit was overwritten by Cinder faction randomization.
     Restore his heavy point-man silhouette without changing rig or weapon anchors. */
  if (op.id === 'ashfall') {
    D.uni = ['#51423d', '#302825', '#66534a', '#201a18'].map(function (c) { return desat(hex(c), .05); });
    D.camo = 'blotch'; D.head = 'helmet'; D.helm = 'pasgt'; D.cover = 'mask';
    D.vest = hex('#302a28'); D.gear = hex('#43332e'); D.scarfCol = hex('#54291f');
    D.kit = { vest: 'heavy', pack: 'patrol', extras: ['shoulderGuards', 'groin', 'canteen', 'kneepads', 'tool', 'dump'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'full'; D.gloveCol = hex('#211e1b'); D.boot = hex('#1a1512');
  }
  /* Flint's quarry-surveyor identity was lost when red-team setup randomized
     her authored marksman kit. Keep her light profile, braid, and field optics. */
  if (op.id === 'flint') {
    D.uni = op.uni.map(function (c) { return desat(hex(c), .05); }); D.camo = 'tiger';
    D.hair = { style: 'braid', col: hex(op.hair) }; D.head = 'hood'; D.cover = 'scarf'; D.scarfCol = hex('#49302b');
    D.vest = hex(op.vest); D.gear = hex(op.gear);
    /* The custom twin-lens chest rangefinder carries the binos identity without
       stacking the two generic blocks into one overlapping chest shape. */
    D.kit = { vest: 'light', pack: 'patrol', extras: ['mast', 'rangefinder', 'strips', 'gaiter'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'fingerless'; D.gloveCol = hex('#302724'); D.boot = hex('#3a2d22');
  }
  /* Undertow's salvage-diver kit was replaced by generic Tidewatch field gear.
     Restore his low-profile marine palette and regulator mask after faction setup. */
  if (op.id === 'undertow') {
    D.uni = ['#243a45', '#142731', '#3b5360', '#0e1a22'].map(function (c) { return desat(hex(c), .04); });
    D.camo = 'solid'; D.head = 'hood'; D.cover = 'mask'; D.scarfCol = hex('#142126');
    D.vest = hex('#182a32'); D.gear = hex('#263b43');
    D.kit = { vest: 'chest', pack: 'hydration', extras: ['knife', 'legknife', 'watch'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'full'; D.gloveCol = hex('#172126'); D.boot = hex('#171b1c');
  }
  /* Restore Riptide's authored harbor-pilot captain identity after Tidewatch's
     generic kit roll: flip-up visor, radio carrier, command map, and navy kit. */
  if (op.id === 'riptide') {
    D.uni = ['#2d4863', '#1d3047', '#4a6a88', '#142130'].map(function (c) { return desat(hex(c), .04); });
    D.camo = 'digital'; D.hair = { style: 'bun', col: hex(op.hair) };
    D.head = 'visor'; D.helm = 'ach'; D.cover = 'bare'; D.beard = null; D.face.stubble = 0;
    D.vest = hex('#1f2a33'); D.gear = hex('#2f4a64'); D.scarfCol = hex('#1d3047');
    D.kit = { vest: 'carrier', pack: 'radio', extras: ['headset', 'rank', 'map', 'holster', 'nvg', 'watch', 'kneepads', 'elbowpads'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'full'; D.gloveCol = hex('#1c2830'); D.boot = hex('#171e24');
  }
  /* Skerry's Tidewatch roll erased her coastal spotter silhouette. Restore the
     authored cold-weather marksman palette and light optics after team setup. */
  if (op.id === 'skerry') {
    D.uni = ['#3c5a4f', '#25382f', '#587a6b', '#18241e'].map(function (c) { return desat(hex(c), .04); });
    D.camo = 'blotch'; D.hair = { style: 'braid', col: hex(op.hair) };
    D.head = 'beanie'; D.cover = 'bare'; D.beard = null; D.face.stubble = 0; D.scarfCol = hex('#3b5148');
    D.vest = hex('#2e4a52'); D.gear = hex('#2f6f8a');
    D.kit = { vest: 'carrier', pack: 'hydration', extras: ['rangefinder', 'gaiter', 'strips', 'kneepads', 'elbowpads'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'fingerless'; D.gloveCol = hex('#303e3a'); D.boot = hex('#2a2a28');
  }
  /* Ember's mountain-guide scout kit was lost to Cinder-side randomization.
     Restore her authored field palette, cap, ponytail, and compact hydration rig. */
  if (op.id === 'ember') {
    D.uni = ['#6b3b2a', '#4a281c', '#8a5440', '#2d1a12'].map(function (c) { return desat(hex(c), .04); });
    D.camo = 'blotch'; D.hair = { style: 'ponytail', col: hex(op.hair) };
    D.head = 'cap'; D.cover = 'bare'; D.beard = null; D.face.stubble = 0;
    D.face.freckle = 1.0; D.face.sunburn = .35; D.face.eyeCol = EYES.gray;
    D.scarfCol = hex('#6b4636'); D.vest = hex('#4a2f26'); D.gear = hex('#a33a24');
    D.kit = { vest: 'light', pack: 'hydration', extras: ['binos', 'gaiter', 'watch'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'fingerless'; D.gloveCol = hex('#352820'); D.boot = hex('#3b2c20');
  }
  /* Smolder's authored female breacher identity was erased when the named
     profile was discarded before faction randomization. Restore her face,
     dark workwear, bob/beanie and compact assault-carrier kit without changing
     the stocky body archetype, rig, weapon anchors or gameplay dimensions. */
  if (op.id === 'smolder') {
    var smolderProfile = NAMED.smolder;
    D.sex = smolderProfile.sex; D.age = smolderProfile.age;
    D.face = JSON.parse(JSON.stringify(smolderProfile.face));
    D.face.eyeCol = EYES[D.face.eyeCol] || EYES.brown;
    D.uni = op.uni.map(function (c) { return desat(hex(c), .05); });
    D.camo = 'solid'; D.hair = { style: smolderProfile.hair.style, col: hex(smolderProfile.hair.col) };
    D.head = 'beanie'; D.cover = 'bare'; D.beard = null;
    D.vest = hex(op.vest); D.gear = hex(op.gear); D.scarfCol = hex('#4a211d');
    D.kit = { vest: 'carrier', pack: 'assault', extras: ['shells', 'tool', 'kneepads', 'dump', 'canteen'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'full'; D.gloveCol = hex(smolderProfile.gloveCol); D.boot = hex(smolderProfile.boot);
  }
  /* Squall's Tidewatch heavy-rigger identity was softened by team palette,
     face-cover and vest randomization. Restore his authored splinter uniform,
     blue-eyed features, ACH, heavy carrier and full gloves. Keep the bear
     archetype and all rig/weapon anchors intact; the mask stays on so the
     authored beard is not drawn through face-cover geometry. */
  if (op.id === 'squall') {
    var squallProfile = NAMED.squall;
    D.sex = squallProfile.sex; D.age = squallProfile.age;
    D.face = JSON.parse(JSON.stringify(squallProfile.face));
    D.face.eyeCol = EYES[D.face.eyeCol] || EYES.blue;
    D.uni = op.uni.map(function (c) { return desat(hex(c), .045); });
    D.camo = squallProfile.camo; D.hair = { style: squallProfile.hair.style, col: hex(squallProfile.hair.col) };
    D.head = 'helmet'; D.helm = squallProfile.helm; D.cover = 'mask'; D.beard = null;
    D.vest = hex(op.vest); D.gear = hex(op.gear); D.scarfCol = hex('#26343d');
    D.kit = { vest: 'heavy', pack: 'patrol', extras: ['belt', 'shoulderGuards', 'tarp', 'goggles', 'kneepads', 'canteen'] };
    D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
    D.sleeves = 'long'; D.gloves = 'full'; D.gloveCol = hex('#242b30'); D.boot = hex(squallProfile.boot);
  }
  D.hairCol = D.hair.col; D.q = 1;
  return D;
}

/* ---------- faction looks: red = irregular insurgent cell (mixed dark civilian + chest rigs, masks),
   blue = regular army (helmets, field uniforms, plate carriers) ---------- */
var PAL = {
  black: ['#2a2c2e', '#191a1c', '#3d4043', '#101112'], olive: ['#4c5236', '#33381f', '#686d4b', '#1f2214'], brown: ['#5c4733', '#3d2e20', '#77614a', '#251b12'],
  grey: ['#4f5357', '#34383c', '#6b7075', '#212326'], navy: ['#2f3a4a', '#202835', '#46556a', '#141a21'], tan: ['#8a7554', '#62523b', '#a99272', '#3e3425'], maroon: ['#4e2a27', '#331a18', '#6a3a35', '#1e100f'],
  wood: ['#4b5a34', '#2e3a1f', '#6c6a40', '#1b2112'], od: ['#5a6240', '#3e4529', '#767b56', '#272c19'], desert: ['#a08c64', '#7c6b4a', '#bba884', '#51442f'], urban: ['#6c7174', '#4a4e52', '#8c9092', '#2b2e30']
};
function teamize(D, op, r, nm) {
  var P = function (k) { return PAL[k].map(hex); };
  D.sex = 'm';
  var gearA = { black: '#1c1d1f', brown: '#3d2f22', olive: '#3c4128', coyote: '#6e5c40', grey: '#3a3d40' };
  if (op.team === 'red') {
    var pk = r.pick(['black', 'black', 'olive', 'brown', 'grey', 'navy', 'tan', 'maroon']);
    D.uni = P(pk).map(function (c) { return desat(c, .05); });
    D.camo = (pk === 'olive' && r.chance(.5)) ? 'blotch' : (pk === 'tan' && r.chance(.4)) ? 'splinter' : 'solid';
    if (D.camo !== 'solid') D.uni = P(r.pick(['wood', 'olive']));
    var h = r.pick(['beanie', 'beanie', 'bandana', 'bandana', 'hood', 'cap', 'boonie', 'beanie']);
    if (op.id === 'ashfall') h = 'beanie';
    D.head = h;
    D.cover = (h === 'hood' || h === 'beanie') ? r.pick(['mask', 'scarf', 'bare', 'bare']) : r.pick(['scarf', 'bare', 'bare', 'bare']);
    
    var gk = r.pick(['black', 'brown', 'olive', 'grey']);
    D.gear = hex(gearA[gk]); D.vest = hex(r.pick(['#26262a', '#3a3128', '#2f3326', '#32343a']));
    D.kit = { vest: r.pick(['chest', 'chest', 'utility', 'light', 'heavy', 'chest']), pack: r.pick(['patrol', 'drybag', 'assault', 'patrol', 'hydration']), extras: [] };
    var ex = ['watch', 'knife', 'canteen', 'dump', 'holster', 'belt', 'elbowpads', 'tarp', 'rope', 'shells', 'kneepads'].filter(function () { return r.chance(.3); });
    if (D.kit.vest === 'heavy') ex.push('shoulderGuards');
    D.kit.extras = ex.filter(function (e, i) { return ex.indexOf(e) === i; });
    D.scarfCol = hex(r.pick(['#1d1d1f', '#2f3032', '#4a2a24', '#4a4d36', '#5a4a38', '#3a3f45']));
    D.sleeves = r.chance(.3) ? 'rolled' : 'long';
    D.gloves = r.pick(['full', 'full', 'fingerless', 'full']); D.boot = hex(r.pick(['#17130f', '#241b14', '#2b2118', '#1c1812']));
    D.gloveCol = hex(r.pick(['#1d2024', '#2a2a28', '#3a3226']));
    if (D.cover === 'bare' && !D.beard && r.chance(.8)) D.beard = { style: r.pick(['short', 'full', 'stubble', 'goatee']), col: mulc(D.hair.col, .9), gray: D.age > .6 ? .35 : 0 };
    if (D.hair.style === 'bald' && r.chance(.5)) D.hair.style = 'buzz';
    D.face.stubble = Math.max(D.face.stubble || 0, .6); D.face.dirt = Math.max(D.face.dirt || 0, .45);
  } else {
    var ck = r.pick(['wood', 'wood', 'od', 'od', 'desert', 'urban']);
    D.uni = P(ck);
    D.camo = ck === 'wood' ? 'blotch' : ck === 'od' ? r.pick(['digital', 'tiger', 'flecktarn']) : ck === 'desert' ? 'digital' : 'digital';
    D.head = (nm || r.chance(.9)) ? 'helmet' : 'cap'; if (op.role === 'Captain') D.head = 'helmet';
    D.helm = r.pick(['ach', 'pasgt', 'ach', 'bump']);
    D.cover = r.pick(['bare', 'bare', 'bare', 'bare', 'bare', 'bare', 'mask', 'scarf']);
    D.gear = hex(gearA[ck === 'desert' ? 'coyote' : r.pick(['olive', 'olive', 'black', 'coyote'])]);
    D.vest = hex(ck === 'desert' ? '#6e5c40' : r.pick(['#3a3f2c', '#2e3228', '#26272a', '#4a4a38']));
    D.kit = { vest: r.pick(['carrier', 'carrier', 'heavy', 'chest', 'carrier']), pack: r.pick(['assault', 'patrol', 'assault', 'radio']), extras: [] };
    var ex2 = ['elbowpads', 'canteen', 'goggles', 'headset', 'medkit', 'dump', 'knife', 'watch', 'holster'].filter(function () { return r.chance(.38); });
    if (r.chance(.9)) ex2.push('kneepads');
    if (D.kit.vest === 'heavy') ex2.push('shoulderGuards');
    if (op.role === 'Captain') ex2 = ex2.concat(['headset', 'rank', 'map', 'holster']);
    D.kit.extras = ex2.filter(function (e, i) { return ex2.indexOf(e) === i; });
    D.scarfCol = hex(ck === 'desert' ? '#8a7554' : r.pick(['#4a4f36', '#2f3326', '#1d1d1f']));
    D.gear = hex(ck === 'desert' ? '#8a7a58' : r.pick(['#4a5234', '#3e4529', '#4a5234', '#5a5a42']));
    D.sleeves = 'long'; D.gloves = r.pick(['full', 'full', 'full', 'fingerless']); D.boot = hex(r.pick(['#3a2d22', '#2a2119', '#4a3a2a', '#1c1812']));
    D.gloveCol = hex(r.pick(['#1a1d20', '#3a3226', '#5a4a32']));
    if (!(nm && nm.beard)) D.beard = r.chance(.2) ? { style: 'stubble', col: mulc(D.hair.col, .9), gray: 0 } : null;
    if (['ponytail', 'bun', 'long', 'braid', 'bob', 'mohawk', 'curls', 'slick'].indexOf(D.hair.style) >= 0) D.hair.style = r.pick(['buzz', 'crop', 'short', 'sidepart']);
    D.face.stubble = Math.min(D.face.stubble || 0, .5);
  }
  D.face.eye = (D.face.eye || 1) * .84; D.face.browT = (D.face.browT || 1) * 1.3; D.face.brow = (D.face.brow || 1) * 1.1;
  D.ex = {}; D.kit.extras.forEach(function (e) { D.ex[e] = 1; });
  if (D.cover !== 'bare') { delete D.ex.gaiter; }
  if (D.cover === 'mask' || D.cover === 'scarf') D.beard = null;
  D.face.eyeCol = D.face.eyeCol || EYES.brown;
  return D;
}

/* Tidewatch is the game's professional security/military faction. Keep every
   Blue operator in complete field kit while retaining role-specific silhouettes. */
function enforceBlueFieldKit(D, op) {
  if (op.team !== 'blue') return D;
  var role = String(op.role || D.role || 'support').toLowerCase();
  D.head = 'helmet';
  if (D.helm !== 'ach' && D.helm !== 'pasgt') D.helm = (D.seed & 1) ? 'ach' : 'pasgt';
  D.sleeves = 'long';
  D.gloves = 'full';
  var gloveTones = ['#252b29', '#343a30', '#292d32', '#39372d'];
  D.gloveCol = hex(gloveTones[D.seed % gloveTones.length]);
  D.boot = D.boot || '#24251f';
  D.kit = D.kit || { vest: 'carrier', pack: 'patrol', extras: [] };
  D.kit.vest = /heavy|breach|support/.test(role) ? 'heavy' : 'carrier';
  if (!D.kit.pack || D.kit.pack === 'none') {
    D.kit.pack = /captain|comms/.test(role) ? 'radio' : /scout|marksman/.test(role) ? 'hydration' : 'assault';
  }
  var extras = (D.kit.extras || []).slice();
  ['kneepads', 'elbowpads'].forEach(function (item) { if (extras.indexOf(item) < 0) extras.push(item); });
  var roleExtras = /captain|comms/.test(role) ? ['headset', 'rank', 'map', 'holster'] :
    /heavy|support/.test(role) ? ['headset', 'shoulderGuards', 'canteen', 'dump'] :
    /breach|rusher/.test(role) ? ['headset', 'holster', 'dump', 'knife'] :
    /marksman|scout|tracker|ranger/.test(role) ? ['headset', 'goggles', 'binos'] :
    /medic/.test(role) ? ['headset', 'medkit', 'dump'] : ['headset', 'canteen', 'holster'];
  roleExtras.forEach(function (item) { if (extras.indexOf(item) < 0) extras.push(item); });
  D.kit.extras = extras;
  D.ex = {};
  extras.forEach(function (item) { D.ex[item] = 1; });
  return D;
}

/* ---------- body archetypes: genuinely different proportions and posture (not recolours) ---------- */
var ARCH = {
  barrel:  { sh: 1.12, ch: 1.2, wa: 1.22, hp: 1.1, arm: 1.16, bulk: 1.2, head: 1.03, lean: -.03, belly: .5, stance: .012 },
  wiry:    { sh: .95, ch: .86, wa: .8, hp: .9, arm: .88, bulk: .8, head: .98, lean: .07, belly: 0, stance: -.01 },
  lanky:   { sh: 1.0, ch: .9, wa: .84, hp: .92, arm: 1.0, bulk: .86, head: .96, lean: .1, belly: 0, stance: -.008 },
  stocky:  { sh: 1.1, ch: 1.16, wa: 1.16, hp: 1.1, arm: 1.1, bulk: 1.12, head: 1.05, lean: .02, belly: .25, stance: .014 },
  compact: { sh: 1.0, ch: 1.02, wa: .95, hp: 1.0, arm: .98, bulk: 1.0, head: 1.02, lean: 0, belly: 0, stance: 0 },
  athletic:{ sh: 1.15, ch: 1.12, wa: .86, hp: .98, arm: 1.12, bulk: 1.05, head: .99, lean: .03, belly: 0, stance: .004 },
  upright: { sh: 1.04, ch: 1.0, wa: .9, hp: 1.02, arm: 1.0, bulk: .98, head: 1.0, lean: -.05, belly: 0, stance: .006 },
  bear:    { sh: 1.16, ch: 1.22, wa: 1.25, hp: 1.12, arm: 1.22, bulk: 1.25, head: 1.06, lean: .01, belly: .4, stance: .016 },
  swimmer: { sh: 1.18, ch: 1.06, wa: .78, hp: .94, arm: 1.08, bulk: .98, head: .97, lean: .04, belly: 0, stance: -.004 },
  rangy:   { sh: .98, ch: .94, wa: .88, hp: .96, arm: 1.05, bulk: .92, head: 1.0, lean: .06, belly: 0, stance: -.006 }
};
var ARCH_NAMED = { ashfall: 'barrel', flint: 'wiry', kindle: 'lanky', smolder: 'stocky', ember: 'athletic', riptide: 'upright', squall: 'bear', halyard: 'swimmer', undertow: 'compact', skerry: 'rangy' };
var ARCH_TEAM = { red: ['barrel', 'wiry', 'lanky', 'stocky', 'compact', 'rangy', 'barrel', 'wiry'], blue: ['athletic', 'upright', 'bear', 'swimmer', 'compact', 'stocky', 'athletic', 'rangy'] };
function applyArch(D, op, r) {
  var name = ARCH_NAMED[op.id] || r.pick(ARCH_TEAM[op.team] || ARCH_TEAM.red), A = ARCH[name], j = function () { return r.range(.92, 1.08); };
  D.arch = name; D.build = { sh: A.sh * j(), ch: A.ch * j(), wa: A.wa * j(), hp: A.hp * j(), arm: A.arm * j(), bulk: A.bulk * j(), head: A.head * j() };
  D.lean = A.lean + r.range(-.035, .035); D.belly = A.belly; D.stance = A.stance + r.range(-.006, .006);
}

/* ---------- procedural atlas: fabric, nylon, hair, knit, metal and a painted face ---------- */
var K_GRAIN = 1.14, K_HAIR = 1.22, K_KNIT = 1.15, K_METAL = 1.0, K_MOLLE = 1.2;

function wrapDraw(ctx, size, x, y, r, fn) {
  for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
    var ox = x + dx * size, oy = y + dy * size; if (ox < -r || ox > size + r || oy < -r || oy > size + r) continue;
    ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore();
  }
}
function blobPath(ctx, r, rnd, jag, n) {
  n = n || 9; ctx.beginPath();
  var ph = rnd() * TAU, pts = [];
  for (var i = 0; i < n; i++) { var a = i / n * TAU, rr = r * (1 - jag + jag * 2 * rnd()); pts.push([Math.cos(a + ph * 0) * rr * (1 + .5 * rnd() * jag), Math.sin(a) * rr * (.55 + .45 * rnd())]); }
  ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  ctx.closePath();
}
function polyPath(ctx, r, rnd, n) {
  ctx.beginPath(); var a0 = rnd() * TAU;
  for (var i = 0; i < n; i++) { var a = a0 + i / n * TAU + (rnd() - .5) * .9, rr = r * (.45 + .75 * rnd()); var x = Math.cos(a) * rr * 1.5, y = Math.sin(a) * rr * .8; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.closePath();
}

function paintCloth(g, kind, cols, rnd) {
  var S = 128, base = cols[0], dark = cols[1], light = cols[2], deep = cols[3];
  g.save(); g.beginPath(); g.rect(0, 0, S, S); g.clip();
  g.fillStyle = css(base); g.fillRect(0, 0, S, S);
  function shapes(n, rmin, rmax, col, form, rotRange) {
    g.fillStyle = css(col);
    for (var i = 0; i < n; i++) {
      var x = rnd() * S, y = rnd() * S, r = rmin + rnd() * (rmax - rmin), rot = (rotRange === undefined ? rnd() * PI : (rnd() - .5) * rotRange);
      wrapDraw(g, S, x, y, r * 1.6, function () { g.rotate(rot); if (form === 'poly') polyPath(g, r, rnd, 4 + (rnd() * 3 | 0)); else blobPath(g, r, rnd, .45, 9); g.fill(); });
    }
  }
  if (kind === 'blotch') { shapes(15, 9, 21, light, 'blob'); shapes(17, 8, 19, dark, 'blob'); shapes(22, 3, 8, deep, 'blob'); shapes(10, 2, 5, light, 'blob'); }
  else if (kind === 'flecktarn') { shapes(130, 2, 6, light, 'blob'); shapes(150, 2, 6.5, dark, 'blob'); shapes(120, 1.6, 4.6, deep, 'blob'); }
  else if (kind === 'splinter') { shapes(16, 9, 18, light, 'poly'); shapes(20, 9, 20, dark, 'poly'); shapes(20, 3, 8, deep, 'poly'); }
  else if (kind === 'duck') { shapes(90, 3, 7, dark, 'blob', .4); shapes(60, 2.5, 6, deep, 'blob', .4); shapes(70, 2, 5, light, 'blob', .4); }
  else if (kind === 'tiger') {
    var cl = [dark, deep, light];
    for (var s = 0; s < 3; s++) {
      g.strokeStyle = css(cl[s]); g.lineCap = 'round';
      for (var i = 0; i < 12 + s * 2; i++) {
        var x0 = rnd() * S, y0 = rnd() * S, wd = [8, 5, 3][s] * (.6 + rnd() * .8), L = 22 + rnd() * 30, cv = (rnd() - .5) * 20;
        wrapDraw(g, S, x0, y0, L, function () { g.rotate(-.9 + (rnd() - .5) * .3); g.lineWidth = wd; g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, cv, L / 2, 0); g.stroke(); });
      }
    }
  }
  else if (kind === 'digital') {
    var cs = [light, dark, deep];
    for (var layer = 0; layer < 3; layer++) {
      var px = layer === 0 ? 8 : layer === 1 ? 6 : 4, cnt = layer === 0 ? 70 : layer === 1 ? 110 : 140;
      g.fillStyle = css(cs[layer]);
      for (var q = 0; q < cnt; q++) { var cx = ((rnd() * S / px) | 0) * px, cy = ((rnd() * S / px) | 0) * px, w2 = px * (1 + (rnd() * 3 | 0)), h2 = px * (1 + (rnd() * 2 | 0)); g.fillRect(cx % S, cy % S, w2, h2); if (cx + w2 > S) g.fillRect(cx - S, cy, w2, h2); if (cy + h2 > S) g.fillRect(cx, cy - S, w2, h2); }
    }
  }
  else { // solid workwear: soft mottling + twill
    shapes(18, 14, 34, light, 'blob'); g.globalAlpha = 1;
    g.fillStyle = 'rgba(' + (base[0] * 255 | 0) + ',' + (base[1] * 255 | 0) + ',' + (base[2] * 255 | 0) + ',.62)'; g.fillRect(0, 0, S, S);
    g.globalAlpha = .5; shapes(14, 12, 30, dark, 'blob'); g.globalAlpha = 1;
  }
  // woven-cloth micro structure, sun-bleach, stains
  g.globalAlpha = .06; g.strokeStyle = '#000'; g.lineWidth = 1;
  for (var d = -S; d < S * 2; d += 2) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + S, S); g.stroke(); }
  g.globalAlpha = 1;
  for (var n = 0; n < 2400; n++) { var v = rnd(); g.fillStyle = v < .5 ? 'rgba(0,0,0,' + (.05 + rnd() * .1) + ')' : 'rgba(255,255,255,' + (.04 + rnd() * .08) + ')'; g.fillRect(rnd() * S, rnd() * S, 1 + (rnd() * 1.4 | 0), 1); }
  for (var f2 = 0; f2 < 6; f2++) { wrapDraw(g, S, rnd() * S, rnd() * S, 40, function () { var gr = g.createRadialGradient(0, 0, 0, 0, 0, 34); gr.addColorStop(0, 'rgba(255,248,225,.10)'); gr.addColorStop(1, 'rgba(255,248,225,0)'); g.fillStyle = gr; g.fillRect(-40, -40, 80, 80); }); }
  for (var st = 0; st < 5; st++) { wrapDraw(g, S, rnd() * S, rnd() * S, 30, function () { var gr = g.createRadialGradient(0, 0, 0, 0, 0, 22); gr.addColorStop(0, 'rgba(40,28,15,.13)'); gr.addColorStop(1, 'rgba(40,28,15,0)'); g.fillStyle = gr; g.fillRect(-30, -30, 60, 60); }); }
  g.restore();
}

function paintGrain(g, rnd) { // nylon / leather / webbing
  g.save(); g.translate(0, 128); g.beginPath(); g.rect(0, 0, 128, 64); g.clip();
  g.fillStyle = 'rgb(226,226,226)'; g.fillRect(0, 0, 128, 64);
  g.globalAlpha = .13; g.fillStyle = '#000'; for (var x = 0; x < 128; x += 3) g.fillRect(x, 0, 1, 64); for (var y = 0; y < 64; y += 3) g.fillRect(0, y, 128, 1);
  g.globalAlpha = 1;
  for (var n = 0; n < 1600; n++) { g.fillStyle = rnd() < .5 ? 'rgba(0,0,0,' + (.04 + rnd() * .1) + ')' : 'rgba(255,255,255,' + (.05 + rnd() * .1) + ')'; g.fillRect(rnd() * 128, rnd() * 64, 1 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0)); }
  g.restore();
}
function paintHair(g, rnd) {
  g.save(); g.translate(0, 192); g.beginPath(); g.rect(0, 0, 128, 64); g.clip();
  g.fillStyle = 'rgb(214,214,214)'; g.fillRect(0, 0, 128, 64);
  for (var i = 0; i < 260; i++) {
    var x = rnd() * 128, l = 150 + (rnd() * 105 | 0); g.strokeStyle = 'rgba(' + l + ',' + l + ',' + l + ',' + (.45 + rnd() * .5) + ')'; g.lineWidth = .8 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - .5) * 6, 20, x + (rnd() - .5) * 8, 44, x + (rnd() - .5) * 5, 64); g.stroke();
  }
  for (var j = 0; j < 40; j++) { g.fillStyle = 'rgba(255,255,255,' + (rnd() * .35) + ')'; g.fillRect(rnd() * 128, 0, 1, 64); }
  g.restore();
}
function paintKnit(g, rnd) {
  g.save(); g.translate(128, 160); g.beginPath(); g.rect(0, 0, 128, 48); g.clip();
  g.fillStyle = 'rgb(236,236,236)'; g.fillRect(0, 0, 128, 48);
  for (var x = 0; x < 128; x += 4) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, 0, 1, 48); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 2, 0, 1, 48); }
  for (var y = 0; y < 48; y += 3) { g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(0, y, 128, 1); }
  for (var n = 0; n < 500; n++) { g.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.12)'; g.fillRect(rnd() * 128, rnd() * 48, 1, 2); }
  g.restore();
}
function paintMetal(g, rnd) {
  g.save(); g.translate(144, 128); g.fillStyle = 'rgb(232,232,236)'; g.fillRect(0, 0, 48, 16);
  for (var y = 0; y < 16; y++) { var l = 200 + (rnd() * 55 | 0); g.fillStyle = 'rgba(' + l + ',' + l + ',' + (l + 4) + ',.7)'; g.fillRect(0, y, 48, 1); }
  g.restore();
}

function paintMolle(g, rnd) {
  g.save(); g.translate(128, 208); g.fillStyle = 'rgb(176,176,172)'; g.fillRect(0, 0, 128, 48);
  for (var y = 0; y < 48; y++) { var f = (y % 5.4) / 5.4; var l = 150 + (rnd() * 18 | 0) + (f > .25 && f < .85 ? 52 : 0); g.fillStyle = 'rgb(' + l + ',' + l + ',' + (l - 3) + ')'; g.fillRect(0, y, 128, 1); }
  for (var r = 0; r < 9; r++) { var y0 = r * 5.4 + 1.2; g.fillStyle = 'rgba(20,20,18,.78)'; for (var x = 2; x < 128; x += 7.6) g.fillRect(x, y0, 5, 1.7); g.fillStyle = 'rgba(235,235,225,.55)'; g.fillRect(0, y0 + 2.7, 128, .7); }
  g.restore();
}

/* ---- painted face (metres relative to head centre; x right, y up) ---- */
function paintFace(g, D, rnd) {
  var F = D.face, sk = D.skin, hair = D.hairCol, S = 128;
  g.save(); g.translate(128, 0); g.beginPath(); g.rect(0, 0, S, S); g.clip();
  g.setTransform(FX * SC, 0, 0, -FY * SC, 192 * SC, 64 * SC);
  // clip to the 0.2 x 0.24 m face rect
  var ex = .032 * F.eyeSp, ey = .013, ew = .0155 * F.eye, eh = .0064 * F.eye;
  var skinD = mulc(sk, .62), skinS = mulc(sk, .84), flush = mixc(sk, [.78, .28, .24], .3);
  // base + broad shading
  g.fillStyle = css(sk); g.fillRect(-.1, -.12, .2, .24);
  var gr = g.createRadialGradient(0, .018, .01, 0, .0, .115); gr.addColorStop(0, css(mulc(sk, 1.07), .85)); gr.addColorStop(.6, css(sk, 0)); gr.addColorStop(1, css(mulc(sk, .72), .75)); g.fillStyle = gr; g.fillRect(-.1, -.12, .2, .24);
  var vg = g.createLinearGradient(0, -.045, 0, -.12); vg.addColorStop(0, css(skinD, 0)); vg.addColorStop(1, css(skinD, .55)); g.fillStyle = vg; g.fillRect(-.1, -.12, .2, .08);
  var tg = g.createLinearGradient(0, .07, 0, .12); tg.addColorStop(0, css(skinD, 0)); tg.addColorStop(1, css(skinD, .3)); g.fillStyle = tg; g.fillRect(-.1, .06, .2, .06);
  [-1, 1].forEach(function (s) {
    var cg = g.createRadialGradient(s * .045, -.02, .003, s * .045, -.02, .036); cg.addColorStop(0, css(flush, .20 + (F.sunburn || 0) * .25)); cg.addColorStop(1, css(flush, 0)); g.fillStyle = cg; g.fillRect(-.1, -.1, .2, .2);
    var tm = g.createRadialGradient(s * .06, .03, .002, s * .06, .03, .03); tm.addColorStop(0, css(skinD, .20)); tm.addColorStop(1, css(skinD, 0)); g.fillStyle = tm; g.fillRect(-.1, -.1, .2, .2);
  });
  if (F.sunburn) { var nb = g.createRadialGradient(0, -.012, .002, 0, -.012, .028); nb.addColorStop(0, css([.85, .35, .3], F.sunburn * .32)); nb.addColorStop(1, css([.85, .35, .3], 0)); g.fillStyle = nb; g.fillRect(-.1, -.1, .2, .2); }
  // eye sockets and bags
  [-1, 1].forEach(function (s) {
    var cx = s * ex; var sg = g.createRadialGradient(cx, ey + .002, .004, cx, ey + .002, .027); sg.addColorStop(0, css(skinD, .5)); sg.addColorStop(1, css(skinD, 0)); g.fillStyle = sg; g.fillRect(cx - .04, ey - .04, .08, .08);
    var bg = g.createRadialGradient(cx, ey - .011, .002, cx, ey - .011, .016); bg.addColorStop(0, css(skinD, .12 + D.age * .35)); bg.addColorStop(1, css(skinD, 0)); g.fillStyle = bg; g.fillRect(cx - .03, ey - .03, .06, .04);
  });
  // eyes
  [-1, 1].forEach(function (s) {
    var cx = s * ex, inX = cx - s * ew, outX = cx + s * ew, outY = ey + .0018 * (D.sex === 'f' ? 1.3 : .8);
    g.save(); g.beginPath(); g.moveTo(inX, ey - .0008); g.bezierCurveTo(inX + s * ew * .45, ey + eh * 1.7, outX - s * ew * .5, outY + eh * 1.55, outX, outY); g.bezierCurveTo(outX - s * ew * .5, outY - eh * 1.1, inX + s * ew * .45, ey - eh * 1.2, inX, ey - .0008); g.closePath(); g.clip();
    var sc = g.createLinearGradient(0, ey + eh * 1.6, 0, ey - eh * 1.2); sc.addColorStop(0, '#9a928a'); sc.addColorStop(.25, '#e6e0d6'); sc.addColorStop(1, '#d6cfc4'); g.fillStyle = sc; g.fillRect(cx - .03, ey - .02, .06, .04);
    var ic = (F.eyeCol || EYES.brown), ix = cx - s * .0005, iy = ey + .0004, ir = .0061 * F.eye;
    var ig = g.createRadialGradient(ix, iy, .0008, ix, iy, ir); ig.addColorStop(0, css(mulc(ic, 1.25))); ig.addColorStop(.7, css(ic)); ig.addColorStop(1, css(mulc(ic, .45))); g.fillStyle = ig; g.beginPath(); g.arc(ix, iy, ir, 0, TAU); g.fill();
    g.fillStyle = '#0b0807'; g.beginPath(); g.arc(ix, iy, ir * .44, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(ix + .0017, iy + .0022, .0009, 0, TAU); g.fill();
    var us = g.createLinearGradient(0, ey + eh * 1.6, 0, ey + eh * .2); us.addColorStop(0, 'rgba(25,15,10,.62)'); us.addColorStop(1, 'rgba(25,15,10,0)'); g.fillStyle = us; g.fillRect(cx - .03, ey - .01, .06, .04);
    g.restore();
    // lid lines, lashes, crease
    g.lineCap = 'round'; g.strokeStyle = css(mulc(sk, .22), .9); g.lineWidth = D.sex === 'f' ? .0019 : .0015;
    g.beginPath(); g.moveTo(inX, ey - .0008); g.bezierCurveTo(inX + s * ew * .45, ey + eh * 1.7, outX - s * ew * .5, outY + eh * 1.55, outX, outY); g.stroke();
    g.strokeStyle = css(mulc(sk, .5), .55); g.lineWidth = .0008; g.beginPath(); g.moveTo(inX, ey - .0008); g.bezierCurveTo(inX + s * ew * .45, ey - eh * 1.2, outX - s * ew * .5, outY - eh * 1.1, outX, outY); g.stroke();
    g.strokeStyle = css(mulc(sk, .55), .55); g.lineWidth = .001; g.beginPath(); g.moveTo(inX + s * .002, ey + eh * 2.7); g.quadraticCurveTo(cx, ey + eh * 3.6, outX, outY + eh * 2.2); g.stroke();
    if (D.sex === 'f') { g.strokeStyle = css(mulc(sk, .15), .8); g.lineWidth = .0011; for (var l = 0; l < 7; l++) { var tt = .3 + l / 7 * .7, lx = lerp(inX, outX, tt), ly = ey + eh * 1.45 * Math.sin(tt * PI) + .0005; g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + s * .0016, ly + .0024); g.stroke(); } }
    // crow's feet
    if (D.age > .45) { g.strokeStyle = css(skinD, (D.age - .4) * .5); g.lineWidth = .0007; for (var cf = 0; cf < 3; cf++) { g.beginPath(); g.moveTo(outX + s * .003, outY + (cf - 1) * .003); g.lineTo(outX + s * (.011 + cf * .0012), outY + (cf - 1) * .0065); g.stroke(); } }
  });
  // eyebrows (individual hair strokes)
  var bcol = mixc(hair, [.1, .08, .06], .25); if (D.age > .72) bcol = mixc(bcol, [.6, .6, .58], .5);
  [-1, 1].forEach(function (s) {
    g.strokeStyle = css(bcol, .55); g.lineWidth = .0042 * Math.min(1.5, F.browT); g.lineCap = 'round'; g.beginPath(); g.moveTo(s * .012, .0345); g.quadraticCurveTo(s * .031, .042 + F.arch * .004, s * .053, .0345); g.stroke(); g.lineCap = 'butt';
    var n = Math.round(46 * F.browT), x0 = s * .011, y0 = .034, x1 = s * .031, y1 = .0425 + F.arch * .005, x2 = s * .054, y2 = .035 - F.arch * .002;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1) + (rnd() - .5) * .04, a = 1 - t, bx = a * a * x0 + 2 * a * t * x1 + t * t * x2, by = a * a * y0 + 2 * a * t * y1 + t * t * y2 + (rnd() - .5) * .0045 * F.browT * (1 - t * .55);
      g.strokeStyle = css(mulc(bcol, .8 + rnd() * .4), .6 + rnd() * .35); g.lineWidth = .0009 + rnd() * .0007; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + s * .0045, by + (t < .4 ? .0034 : .0004) + (rnd() - .4) * .0012); g.stroke();
    }
  });
  // nose shading + nostrils
  [-1, 1].forEach(function (s) {
    var ng = g.createRadialGradient(s * .0125, -.018, .002, s * .0125, -.018, .017); ng.addColorStop(0, css(skinD, .30)); ng.addColorStop(1, css(skinD, 0)); g.fillStyle = ng; g.fillRect(s * .0125 - .02, -.04, .04, .04);
    g.fillStyle = 'rgba(30,14,10,.78)'; g.beginPath(); g.ellipse(s * .0073 * F.noseW, -.0342, .0042 * F.noseW, .0024, s * .35, 0, TAU); g.fill();
    g.strokeStyle = css(skinD, .5); g.lineWidth = .0009; g.beginPath(); g.moveTo(s * .013 * F.noseW, -.026); g.quadraticCurveTo(s * .0178 * F.noseW, -.034, s * .0125 * F.noseW, -.041); g.stroke();
  });
  var hl = g.createRadialGradient(0, -.026, .001, 0, -.026, .0075); hl.addColorStop(0, 'rgba(255,240,225,.22)'); hl.addColorStop(1, 'rgba(255,240,225,0)'); g.fillStyle = hl; g.fillRect(-.012, -.04, .024, .02);
  // lips + mouth
  var lipC = mixc(sk, [.62, .24, .22], .38 + (F.lip - 1) * .15), lipD = mulc(lipC, .74), mw = .0205 * (.95 + F.lip * .05), my = -.0672, fl = F.lip;
  g.fillStyle = css(lipC); g.beginPath(); g.moveTo(-mw, my); g.bezierCurveTo(-mw * .5, my + .0055 * fl, -.004, my + .0075 * fl, 0, my + .0058 * fl); g.bezierCurveTo(.004, my + .0075 * fl, mw * .5, my + .0055 * fl, mw, my); g.quadraticCurveTo(0, my - .0006, -mw, my); g.fill();
  g.fillStyle = css(mulc(lipC, 1.06)); g.beginPath(); g.moveTo(-mw * .9, my - .0004); g.quadraticCurveTo(0, my - .0105 * fl, mw * .9, my - .0004); g.quadraticCurveTo(0, my - .0014, -mw * .9, my - .0004); g.fill();
  g.strokeStyle = css(mulc(sk, .22), .85); g.lineWidth = .0012; g.beginPath(); g.moveTo(-mw * 1.04, my + .0007 * (D.sex === 'f' ? 1 : -.3)); g.quadraticCurveTo(0, my - .0014, mw * 1.04, my + .0007 * (D.sex === 'f' ? 1 : -.3)); g.stroke();
  var ls = g.createRadialGradient(0, my - .0065 * fl, .001, 0, my - .0065 * fl, .007); ls.addColorStop(0, 'rgba(255,235,225,.16)'); ls.addColorStop(1, 'rgba(255,235,225,0)'); g.fillStyle = ls; g.fillRect(-.012, my - .016, .024, .02);
  g.fillStyle = css(skinD, .30); g.beginPath(); g.ellipse(0, my - .0145 * fl - .001, .011, .0035, 0, 0, TAU); g.fill();
  g.strokeStyle = css(skinD, .25); g.lineWidth = .0008; [-1, 1].forEach(function (s) { g.beginPath(); g.moveTo(s * .0034, -.039); g.lineTo(s * .0042, my + .0075 * fl); g.stroke(); });
  var cg2 = g.createRadialGradient(0, -.099, .003, 0, -.099, .018); cg2.addColorStop(0, css(skinD, .22)); cg2.addColorStop(1, css(skinD, 0)); g.fillStyle = cg2; g.fillRect(-.03, -.12, .06, .04);
  // age lines
  if (D.age > .35) { g.lineWidth = .0008; [-1, 1].forEach(function (s) { g.strokeStyle = css(skinD, (D.age - .3) * .55); g.beginPath(); g.moveTo(s * .017, -.04); g.quadraticCurveTo(s * .027, -.05, s * .026, -.067); g.stroke(); }); }
  if (D.age > .5) { for (var fl2 = 0; fl2 < 3; fl2++) { g.strokeStyle = css(skinD, (D.age - .45) * .45); g.lineWidth = .0008; g.beginPath(); g.moveTo(-.034, .066 + fl2 * .0085); g.quadraticCurveTo(0, .071 + fl2 * .0085, .034, .066 + fl2 * .0085); g.stroke(); } }
  // freckles, stubble, scar, dirt, sweat
  if (F.freckle) { for (var fr = 0; fr < 130 * F.freckle; fr++) { var fx = (rnd() - .5) * .1, fy = -.04 + rnd() * .06; if (Math.abs(fx) < .01 && fy < -.02) continue; var fcol = mixc(sk, [.5, .28, .14], .6); g.fillStyle = css(fcol, .25 + rnd() * .4); g.beginPath(); g.arc(fx, fy, .0006 + rnd() * .0007, 0, TAU); g.fill(); } }
  if (F.stubble) {
    var sc2 = mixc(hair, [.1, .08, .07], .3); var shade = g.createRadialGradient(0, -.075, .01, 0, -.075, .075); shade.addColorStop(0, css(sc2, .22 * F.stubble)); shade.addColorStop(1, css(sc2, 0)); g.fillStyle = shade; g.fillRect(-.1, -.12, .2, .12);
    for (var sb = 0; sb < 900 * F.stubble; sb++) { var sx = (rnd() - .5) * .15, sy = -.115 + rnd() * .075, inMouth = Math.abs(sx) < .02 && sy > my - .008 && sy < my + .009; if (inMouth || (sy > -.045 && Math.abs(sx) < .022)) continue; if (Math.hypot(sx / .075, (sy + .06) / .06) > 1) continue; g.fillStyle = css(sc2, .22 + rnd() * .3); g.fillRect(sx, sy, .0007, .0011); }
  }
  if (F.scar) { var sr = F.scar; g.strokeStyle = css(mixc(sk, [.82, .55, .5], .75), .85); g.lineWidth = .0017; g.lineCap = 'round'; g.beginPath(); g.moveTo(sr.x1, sr.y1); g.quadraticCurveTo((sr.x1 + sr.x2) / 2 + .004, (sr.y1 + sr.y2) / 2, sr.x2, sr.y2); g.stroke(); g.strokeStyle = css(skinD, .5); g.lineWidth = .0007; g.beginPath(); g.moveTo(sr.x1, sr.y1 - .0014); g.quadraticCurveTo((sr.x1 + sr.x2) / 2 + .004, (sr.y1 + sr.y2) / 2 - .0014, sr.x2, sr.y2 - .0014); g.stroke(); for (var tk = 1; tk < 5; tk++) { var tp = tk / 5, qx = lerp(sr.x1, sr.x2, tp), qy = lerp(sr.y1, sr.y2, tp); g.strokeStyle = css(mixc(sk, [.8, .5, .46], .6), .6); g.lineWidth = .0006; g.beginPath(); g.moveTo(qx - .0028, qy + .001); g.lineTo(qx + .0028, qy - .001); g.stroke(); } }
  var dirtN = Math.round(8 + (F.dirt || .3) * 22);
  for (var dn = 0; dn < dirtN; dn++) { var dx2 = (rnd() - .5) * .16, dy2 = (rnd() - .5) * .2, rr = .004 + rnd() * .012; var dg = g.createRadialGradient(dx2, dy2, 0, dx2, dy2, rr); dg.addColorStop(0, 'rgba(46,32,20,' + (.07 + (F.dirt || .3) * .12) + ')'); dg.addColorStop(1, 'rgba(46,32,20,0)'); g.fillStyle = dg; g.fillRect(dx2 - rr, dy2 - rr, rr * 2, rr * 2); }
  var sw = g.createRadialGradient(0, .06, .003, 0, .06, .04); sw.addColorStop(0, 'rgba(255,245,230,.10)'); sw.addColorStop(1, 'rgba(255,245,230,0)'); g.fillStyle = sw; g.fillRect(-.06, .02, .12, .1);
  for (var pr = 0; pr < 1400; pr++) { g.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.045)' : 'rgba(255,255,255,.04)'; g.fillRect((rnd() - .5) * .2, (rnd() - .5) * .24, .0009, .0011); }
  g.restore();
}

var SC = 1, CURQ = 1;
function paintAtlas(D, doc) {
  var c = doc.createElement('canvas'); SC = CURQ >= .75 ? 2 : 1; c.width = c.height = ATL * SC; var g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATL * SC, ATL * SC); g.setTransform(SC, 0, 0, SC, 0, 0);
  var rnd = RNG(D.seed ^ 0x9E3779B9);
  paintCloth(g, D.camo, D.uni, rnd);
  g.setTransform(SC, 0, 0, SC, 0, 0); paintGrain(g, rnd); g.setTransform(SC, 0, 0, SC, 0, 0); paintHair(g, rnd); g.setTransform(SC, 0, 0, SC, 0, 0); paintKnit(g, rnd); g.setTransform(SC, 0, 0, SC, 0, 0); paintMetal(g, rnd); g.setTransform(SC, 0, 0, SC, 0, 0); paintMolle(g, rnd);
  g.setTransform(SC, 0, 0, SC, 0, 0); g.fillStyle = '#fff'; g.fillRect(128, 128, 16, 16);
  g.setTransform(SC, 0, 0, SC, 0, 0); paintFace(g, D, rnd);
  if (D.zombie) { g.save(); g.beginPath(); g.rect(128, 0, 128, 128); g.clip(); g.setTransform(FX * SC, 0, 0, -FY * SC, 192 * SC, 64 * SC); paintZFaceOverlay(g, D, rnd); g.restore(); }
  return c;
}

/* ---------- UV / colour helpers shared by the builders ---------- */
function uvCloth(extU, extV, endBottom, off) {
  off = off || [0, 0];
  return function (p, n, i, j, t, s) { if (Array.isArray(i)) { s = i[0]; t = i[1]; } var a = off[0] + s * extU, b = endBottom ? (1 - (1 - t) * extV - off[1]) : (off[1] + (1 - t) * extV); return atl('cloth', a, b); };
}
function uvPlanar(reg, k) {
  k = k || 1.3;
  return function (p, n) {
    var ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]), a, b;
    if (az >= ax && az >= ay) { a = .5 + p[0] * k; b = .5 - (p[1] - 1) * k * .4; } else if (ax >= ay) { a = .5 + p[2] * k; b = .5 - (p[1] - 1) * k * .4; } else { a = .5 + p[0] * k; b = .5 + p[2] * k; }
    return atl(reg, a, b);
  };
}
function uvReg(reg, ku, kv) { return function (p, n, i, j, t, s) { if (Array.isArray(i)) { s = i[0]; t = i[1]; } return atl(reg, (s * (ku || 1)) % 1, (t * (kv || 1)) % 1); }; }
function flat(c) { return function () { return c; }; }
function K(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

/* ---------- head surface model ---------- */
function makeHead(D) {
  var F = D.face, H = D.build.head || 1, rx = .0775 * F.wid * H, ry = .118 * F.len * H, rz = .098 * H;
  var C = [0, 1.678, -.004];
  var ex = .032 * F.eyeSp, ey = .013, exn = ex / rx, eyn = ey / ry;
  function deform(ux, uy, uz) {
    var x = ux, y = uy, z = uz, front = Math.max(0, -z);
    var jt = smooth(.12, -.85, y); x *= 1 - .30 * jt * (1.95 - F.jaw);
    z -= .075 * F.chin * front * smooth(-.45, -.95, y);
    x *= 1 + .05 * F.cheek * gauss(y + .15, .28);
    z += .10 * front * smooth(.45, 1.0, y);
    z -= .045 * F.brow * front * gauss(y - .40, .11) * smooth(.15, .5, front);
    z += .045 * front * (gauss((x - exn) / .2, 1) * gauss((y - eyn) / .14, 1) + gauss((x + exn) / .2, 1) * gauss((y - eyn) / .14, 1));
    x *= 1 - .05 * gauss(y - .38, .22);
    if (z > 0) z *= 1.07;
    return [x, y, z];
  }
  var Hd = { C: C, rx: rx, ry: ry, rz: rz, ex: ex, ey: ey };
  Hd.pt = function (ux, uy, uz) { var d = deform(ux, uy, uz); return [C[0] + d[0] * rx, C[1] + d[1] * ry, C[2] + d[2] * rz]; };
  Hd.dirOf = function (x, y, z) { var l = Math.sqrt(x * x + y * y + z * z) || 1; return [x / l, y / l, z / l]; };
  Hd.surf = function (x, y, z, off) { var d = Hd.dirOf(x, y, z), p = Hd.pt(d[0], d[1], d[2]); if (off) { var r = norm3(sub3(p, C)); p = add3(p, mul3(r, off)); } return p; };
  /* point on the front of the face at head-local metre coords (x right, y up) */
  Hd.face = function (xm, ym, off) { var xn = xm / rx, yn = ym / ry, zn2 = 1 - xn * xn - yn * yn; var zn = -Math.sqrt(Math.max(.02, zn2)); var p = Hd.surf(xn, yn, zn, off || 0); return p; };
  Hd.dir = function (alpha, yn) { var st = Math.sqrt(Math.max(0, 1 - yn * yn)); return [st * Math.sin(alpha), yn, -st * Math.cos(alpha)]; };
  return Hd;
}
function headUV(Hd) {
  return function (p) {
    var xm = p[0] - Hd.C[0], ym = p[1] - Hd.C[1], zm = p[2] - Hd.C[2], a = (xm + .1) / .2, b = (.12 - ym) / .24;
    var k = smooth(-.012, .03, zm), edge = a < .5 ? .02 : .98; a = lerp(a, edge, k);
    return [(128 + clamp(a, .02, .98) * 128) / ATL, 1 - (clamp(b, .03, .97) * 128) / ATL];
  };
}

function buildHeadBase(mb, D, Hd, q) {
  var rows = QS(8, 13, q), cols = QS(12, 20, q);
  var uv = headUV(Hd);
  mb.surface(rows, cols, function (i, j) {
    var th = PI * i / (rows - 1), al = TAU * j / cols, st = Math.sin(th);
    return Hd.pt(st * Math.sin(al), -Math.cos(th), -st * Math.cos(al));
  }, { wrap: true, closed: true, col: [1, 1, 1], uv: uv, tag: 'head' });
  var F = D.face, skin = D.skin, rb = mixc(skin, [.8, .3, .26], .1);
  var fq = 5, fl = 6;
  // nose: bridge, tip, wings
  var nl = F.noseL, nw = F.noseW, nh = F.noseH;
  var tipP = Hd.face(0, -.0285, 0); tipP = [0, tipP[1], tipP[2] - .0105 * nh];
  mb.ellipsoid([0, Hd.C[1] + .0, Hd.surf(0, .02, -1)[2] - .006 * nh], [.0088 * nw, .026 * nl, .0095 * nh], { lat: fq, lon: fl, rot: [-.22, 0, 0], col: [1, 1, 1], uv: uv, tag: 'head' });
  mb.ellipsoid([0, tipP[1] + .002, tipP[2] + .002], [.0096 * nw, .0082, .0092 * nh], { lat: fq, lon: fl, col: [1, 1, 1], uv: uv, tag: 'head' });
  [-1, 1].forEach(function (s) {
    mb.ellipsoid([s * .0098 * nw, tipP[1] + .002, tipP[2] + .0085], [.0058 * nw, .0072, .0062], { lat: fq, lon: fl, col: [1, 1, 1], uv: uv, tag: 'head' });
  });
  // lips (painted colour comes from the face texture)
  var lf = F.lip, lipY = -.0662, lz = Hd.face(0, lipY, 0)[2];
  mb.ellipsoid([0, lipY + .0035 * lf, lz - .0018], [.0205, .0048 * lf, .0072], { lat: fq, lon: fl, col: [1, 1, 1], uv: uv, tag: 'head' });
  mb.ellipsoid([0, lipY - .0042 * lf, lz - .0012], [.0175, .0054 * lf, .0072], { lat: fq, lon: fl, col: [1, 1, 1], uv: uv, tag: 'head' });
  // ears
  var ec = mixc(skin, [.85, .42, .38], .12);
  [-1, 1].forEach(function (s) {
    var ep = Hd.surf(s * 1, -.1, .1, .0), es = F.ear;
    mb.ellipsoid([ep[0] + s * .0012, ep[1] + .002, ep[2] + .004], [.0068, .0285 * es, .0185 * es], { lat: 5, lon: 6, rot: [-.12, 0, s * .1], col: mulc(ec, .96), tag: 'ear' });
    mb.ellipsoid([ep[0] + s * .0058, ep[1] - .001, ep[2] - .0005], [.0028, .016 * es, .0085 * es], { lat: 4, lon: 5, rot: [-.12, 0, s * .1], col: mulc(ec, .72), tag: 'ear' });
  });
  // neck
  var nk = (D.sex === 'f' ? .86 : 1) * (D.build.bulk > 1.1 ? 1.14 : 1), nc = mulc(skin, .93);
  mb.tube([[0, 1.43, .006], [0, 1.52, -.002], [0, 1.598, -.014]], [[.058 * nk, .056 * nk], [.05 * nk, .049 * nk], [.047 * nk, .046 * nk]], { segs: QS(8, 11, q), col: nc, tag: 'neck', capBot: 0, capTop: 0, ao: function (p) { return .8 + .2 * smooth(1.43, 1.56, p[1]); } });
}

/* ---------- shells that hug the scalp (hair, hats, beards, masks) ---------- */
function yEndFn(front, side, back) {
  return function (a) { // a = |alpha| 0..PI (0 front, PI/2 side, PI back)
    var t = a / PI; if (t < .5) return lerp(front, side, smooth(0, 1, t / .5)); return lerp(side, back, smooth(0, 1, (t - .5) / .5));
  };
}
function capShell(mb, Hd, o) {
  var cols = o.cols || 22, rows = o.rows || 8, yEnd = o.yEnd, yStart = o.yStart === undefined ? 1 : o.yStart, th = o.thick || .01;
  var rr = rows + (o.closeEdge === false ? 0 : 1);
  var ao = o.ao;
  mb.surface(rr, cols, function (i, j) {
    var al = TAU * j / cols, a = Math.abs(((al + PI) % TAU) - PI); a = PI - a; a = Math.abs(((al + PI) % TAU) - PI);
    // alpha 0 is front; fold to |alpha| in 0..PI
    var aa = Math.abs(al > PI ? al - TAU : al), ye = yEnd(aa), ys = typeof yStart === 'function' ? yStart(aa) : yStart;
    var last = i === rows, ii = Math.min(i, rows - 1), tt = ii / (rows - 1), y = lerp(ys, ye, tt);
    var d = Hd.dir(al, clamp(y, -1, .9999)), p = Hd.pt(d[0], d[1], d[2]), rad = norm3(sub3(p, Hd.C));
    var thick = (typeof th === 'function' ? th(aa, y, tt, al) : th) * (last ? 0.0 : 1);
    if (last) { var d2 = Hd.dir(al, clamp(y - .035, -1, .9999)); p = Hd.pt(d2[0], d2[1], d2[2]); rad = norm3(sub3(p, Hd.C)); }
    var v = add3(p, mul3(rad, thick));
    if (o.warp) v = o.warp(v, al, y, tt, aa);
    return v;
  }, { wrap: true, closed: false, flip: o.flip !== false, col: o.col, uv: o.uv, ao: ao, tag: o.tag || 'shell' });
}
function hairColFn(base, k) {
  k = k || K_HAIR; var seed = 7;
  return function (p, n, i, j, t) { var v = 1.08 - .3 * t * t + (Math.sin(p[0] * 190 + p[2] * 90) * .04) + (Math.sin(p[1] * 260 + p[0] * 70) * .03); return K(base, v * k); };
}
function buildHair(mb, D, Hd, q, covered) {
  var st = D.hair.style, hc = D.hair.col, C = Hd.C, cols = QS(14, 24, q), rows = QS(5, 8, q);
  if (st === 'bald' || D.head === 'hood') return;
  if (D.head === 'bandana') { capShell(mb, Hd, { cols: cols, rows: 5, yEnd: yEndFn(.5, .22, -.45), thick: .006, col: hairColFn(hc), uv: uvReg('hair', 1, 1), tag: 'hair' }); if (st === 'ponytail' || st === 'bun' || st === 'braid' || st === 'long' || st === 'bob') {} else return; }
  var uv = uvReg('hair', 1, 1);
  var mk = function (yEnd, thick, extra) { var o = { cols: cols, rows: rows, yEnd: yEnd, thick: thick, col: hairColFn(hc), uv: uv, tag: 'hair' }; if (extra) for (var k in extra) o[k] = extra[k]; capShell(mb, Hd, o); };
  var topVol = function (v) { return function (a, y, t) { return v * (1 + .55 * smooth(.4, 1, y)) + .004 * Math.sin(a * 7 + y * 9); }; };
  var cv = covered; // hat/helmet hides most of the volume: keep hair thin where hats sit
  if (st === 'buzz') mk(yEndFn(.5, .22, -.45), .0045);
  else if (st === 'crop') mk(yEndFn(.5, .2, -.45), cv ? .008 : topVol(.011));
  else if (st === 'short') mk(yEndFn(.46, .14, -.5), cv ? .01 : topVol(.016));
  else if (st === 'sidepart') mk(yEndFn(.36, .14, -.5), cv ? .01 : function (a, y, t, al) { return .018 * (1 + .6 * smooth(.35, 1, y)) + .006 * Math.sin(al * 2 + 1) * smooth(.3, 1, y); });
  else if (st === 'slick') mk(yEndFn(.54, .14, -.52), .012);
  else if (st === 'curls') mk(yEndFn(.5, .06, -.5), cv ? .014 : function (a, y, t, al) { return .03 + .008 * Math.sin(al * 9 + y * 12) * Math.sin(y * 10 + 1); }, null);
  else if (st === 'bob') mk(yEndFn(.46, -.62, -.66), function (a, y, t) { return .018 + .03 * smooth(.2, -.65, y); });
  else if (st === 'long') {
    mk(yEndFn(.46, -.55, -.7), function (a, y, t) { return .018 + .022 * smooth(.2, -.6, y); });
    var n = QS(10, 18, q);
    mb.surface(5, n, function (i, j) {
      var al = lerp(PI * .55, PI * 1.45, j / (n - 1)), y0 = -.7, d = Hd.dir(al, y0), p = Hd.pt(d[0], d[1], d[2]), u = i / 4;
      var r = norm3(sub3(p, C)); var base = add3(p, mul3(r, .03));
      return [base[0] * (1 + .35 * u), lerp(base[1], 1.43, u), lerp(base[2], .1 + Math.abs(base[2] - C[2]) * .2, u)];
    }, { closed: false, flip: true, col: hairColFn(hc), uv: uvReg('hair', 1, 1), tag: 'hair' });
  }
  else if (st === 'ponytail' || st === 'bun' || st === 'braid') mk(yEndFn(.5, .1, -.45), cv ? .009 : topVol(.012));
  else if (st === 'mohawk') { mk(yEndFn(.45, .36, -.2), .005); }
  if (st === 'mohawk') {
    for (var k = 0; k < 9; k++) { var a = lerp(-.1, PI * .95, k / 8), ytop = lerp(.92, .78, Math.abs(k - 4) / 5); var d = Hd.dir(a * (a > PI ? 1 : 1), clamp(.9 - Math.abs(k - 3) * .01, .5, .95)); var p = Hd.pt(d[0], .96 - (k > 5 ? (k - 5) * .1 : 0), d[2]); mb.box([0, p[1] + .02 + .02 * (1 - Math.abs(k - 3.5) / 5), p[2]], [.016, .056, .026], { rot: [(k - 3.5) * .08, 0, 0], taper: [.5, .6], col: K(hc, 1.1), uv: uvReg('hair'), tag: 'hair' }); }
  }
  if (st === 'bun') mb.ellipsoid([0, C[1] + .1, C[2] + .09], [.036, .03, .036], { lat: 7, lon: 10, col: hairColFn(hc, 1.1), uv: uvReg('hair'), tag: 'hair' });
  if (st === 'ponytail') {
    var pp = [[0, C[1] + .06, C[2] + .075], [0, C[1] + .05, C[2] + .125], [0, C[1] - .02, C[2] + .165], [0, C[1] - .1, C[2] + .175], [0, C[1] - .165, C[2] + .165]];
    mb.tube(pp, [[.026, .02], [.03, .026], [.027, .026], [.021, .02], [.012, .01]], { segs: 8, col: hairColFn(hc, 1.05), uv: uvReg('hair', 1, 1), tag: 'hair', ao: function (p) { return 1; } });
    mb.tube([pp[0], add3(pp[0], [0, -.01, .012])], [[.02, .019], [.02, .019]], { segs: 8, col: K(D.teamCol, .7), tag: 'tie' });
  }
}
function braidChain(mb, D, path, r0, r1, hc) {
  var n = path.length;
  for (var i = 0; i < n; i++) {
    var t = i / (n - 1), r = lerp(r0, r1, t), d = i < n - 1 ? norm3(sub3(path[i + 1], path[i])) : norm3(sub3(path[i], path[i - 1])), sd = (i % 2 ? 1 : -1);
    var rot = [Math.atan2(-d[2], d[1]) * 0 + .3 * sd, 0, .5 * sd];
    mb.ellipsoid(path[i], [r * .95, r * 1.35, r * .9], { lat: 4, lon: 6, rot: [0, 0, .5 * sd], col: hairColFn(hc, 1.12), uv: uvReg('hair'), tag: 'hair' });
  }
  var e = path[n - 1]; mb.tube([e, add3(e, [0, -.02, 0])], [[r1 * .9, r1 * .9], [r1 * .8, r1 * .8]], { segs: 6, col: K(D.teamCol, .8), tag: 'tie' });
}

function buildBeard(mb, D, Hd, q) {
  var b = D.beard; if (!b || D.cover !== 'bare') return;
  var st = b.style, bc = mixc(b.col, [.62, .62, .6], b.gray || 0), uv = uvReg('hair', 1, 1);
  if (st === 'stubble') return; // painted in the face texture
  var cols = QS(12, 20, q), rows = QS(5, 7, q);
  var amax = st === 'goatee' ? .55 : st === 'mustache' ? 0 : 1.85;
  if (st !== 'mustache') {
    mb.surface(rows, cols, function (i, j) {
      var al = lerp(-amax, amax, j / (cols - 1)), aa = Math.abs(al);
      var yTop = st === 'goatee' ? -.7 : lerp(-.72, .08, smooth(.28, 1.2, aa)), yBot = -.93, y = lerp(yTop, yBot, i / (rows - 1));
      var d = Hd.dir(al, clamp(y, -.999, .999)), p = Hd.pt(d[0], d[1], d[2]), r = norm3(sub3(p, Hd.C));
      var th = (st === 'full' ? .017 : st === 'short' ? .0085 : .0095) * (1 + (st === 'full' ? .5 : .2) * smooth(-.6, -1, y) * gauss(aa / 1.0, 1)) * (i === 0 || i === rows - 1 || j === 0 || j === cols - 1 ? .35 : 1);
      var pushFwd = (st === 'goatee' || st === 'full') ? .012 * gauss(aa / .5, 1) * smooth(-.7, -1, y) : 0;
      return add3(add3(p, mul3(r, th)), [0, -pushFwd * .5, -pushFwd]);
    }, { closed: false, flip: true, col: hairColFn(mixc(bc, D.skin, .08), 1.3), uv: uv, tag: 'beard' });
  }
  if (st === 'mustache' || st === 'full' || st === 'short' || st === 'goatee') {
    var pa = Hd.face(-.022, -.0535, .004), pb = Hd.face(-.009, -.0545, .006), pc = Hd.face(0, -.0535, .005), pd = Hd.face(.009, -.0545, .006), pe = Hd.face(.022, -.0535, .004);
    mb.tube([pa, pb, pc, pd, pe].map(function (p) { return [p[0], p[1], p[2] - .002]; }), [[.0042, .004], [.0052, .0045], [.005, .0046], [.0052, .0045], [.0042, .004]], { segs: 6, col: hairColFn(bc, 1.05), uv: uvReg('hair'), tag: 'beard', ao: function () { return 1; } });
  }
}

/* ---------- face coverings ---------- */
function buildFaceCover(mb, D, Hd, q) {
  var cv = D.cover; if (cv === 'bare') return;
  var cols = QS(12, 18, q), rows = QS(5, 7, q), isMask = cv === 'mask';
  var colr = isMask ? [.09, .1, .1] : D.scarfCol;
  mb.surface(rows, cols, function (i, j) {
    var al = lerp(-2.0, 2.0, j / (cols - 1)), aa = Math.abs(al), yTop = lerp(-.04, .3, smooth(.15, 1.3, aa)), yBot = -.98, t = i / (rows - 1), y = lerp(yTop, yBot, t);
    var d = Hd.dir(al, clamp(y, -.999, .999)), p = Hd.pt(d[0], d[1], d[2]), r = norm3(sub3(p, Hd.C));
    var nose = (.02 + (isMask ? .003 : 0)) * gauss(al / .26, 1) * smooth(-.6, -.06, y), fold = isMask ? 0 : .0045 * Math.sin(t * 14 + al * 3) * (1 - gauss(al / .3, 1) * .4);
    var th = (isMask ? .012 : .013) + nose + fold + (i === 0 || i === rows - 1 ? -.004 : 0) + (isMask ? .006 * gauss(al / .85, 1) * smooth(-.2, -.7, y) : 0);
    return add3(p, mul3(r, th));
  }, { closed: false, flip: true, col: function (p, n, i, j, t) { return isMask ? K(colr, K_GRAIN) : K(colr, K_KNIT * (.9 + .12 * Math.sin(t * 14))); }, uv: isMask ? uvPlanar('grain') : uvReg('knit', 2, 1), tag: 'cover' });
  // under-chin to collar
  mb.loft([{ y: 1.53, rx: .068, rz: .068, cz: -.012 }, { y: 1.57, rx: .063, rz: .066, cz: -.02 }, { y: 1.605, rx: .062, rz: .068, cz: -.03 }], { segs: QS(10, 14, q), col: isMask ? K(colr, K_GRAIN) : K(colr, K_KNIT), uv: isMask ? uvPlanar('grain') : uvReg('knit', 2, 1), tag: 'cover' });
}

/* ---------- headgear ---------- */
function buildHeadgear(mb, D, Hd, q, ctx) {
  var h = D.head, C = Hd.C, cols = QS(14, 24, q), rows = QS(6, 9, q);
  var gearC = D.gear, ucol = K(D.uni[1], 1.0);
  function shell(yEnd, thick, col, uvf, extra) { var o = { cols: cols, rows: rows, yEnd: yEnd, thick: thick, col: col, uv: uvf, tag: 'hat' }; if (extra) for (var k in extra) o[k] = extra[k]; capShell(mb, Hd, o); }
  function strap(pts, w, thick, col) { mb.tube(pts, pts.map(function () { return [w, thick]; }), { segs: 4, capBot: 0, capTop: 0, col: col, uv: uvPlanar('grain'), tag: 'strap', ao: function () { return 1; } }); }
  function chinstrap(col) {
    [-1, 1].forEach(function (s) { strap([Hd.surf(s, .05, .05, .018), Hd.surf(s * .9, -.4, -.22, .012), Hd.surf(s * .5, -.9, -.4, .006), [s * .02, C[1] - .124, C[2] - .06]], .0042, .0028, col); });
    mb.ellipsoid([0, C[1] - .124, C[2] - .066], [.02, .0068, .016], { lat: 5, lon: 7, col: K(col, 1.1), uv: uvPlanar('grain'), tag: 'strap' });
  }
  if (h === 'helmet' || h === 'visor') {
    var v = D.helm; var hcol = mulc(mixc(gearC, D.uni[0], .3), 1.25);
    var cfg = { ach: { yEnd: yEndFn(.5, -.02, -.5), th: .024 }, bump: { yEnd: yEndFn(.5, .2, -.28), th: .02 }, pasgt: { yEnd: yEndFn(.46, -.2, -.6), th: .027 } }[v] || { yEnd: yEndFn(.5, -.02, -.5), th: .024 };
    var cloth = false;
    shell(cfg.yEnd, function (a, y, t) { return cfg.th * (1 + .22 * smooth(.3, 1, y)) + .004 * Math.sin(a * 5) * smooth(.5, 1, y) * 0; }, cloth ? function (p, n, i, j, t, s) { return K(mulc(D.gear, 1.15), 1); } : K(hcol, K_GRAIN), cloth ? uvCloth(.7, .5, false, [0, 0]) : uvPlanar('grain'), { warp: function (p, al, y, tt, aa) { var rim = smooth(.15, .0, tt); return p; } });
    // helmet rim band
    var yEndF = cfg.yEnd;
    // front mount, side rails, cover band
    var fp = Hd.surf(0, .62, -.78, .03);
    if (D.ex.nvg || v !== 'pasgt') mb.box([0, fp[1], fp[2] - .003], [.052, .034, .028], { taper: [.85, .8], col: K(mulc(gearC, .75), K_GRAIN), uv: uvPlanar('grain'), tag: 'mount' });
    [-1, 1].forEach(function (s) { var rp = Hd.surf(s, .35, .02, .03); mb.box([rp[0] + s * .002, rp[1], rp[2]], [.014, .02, .1], { col: K([.17, .18, .17], K_METAL), uv: uvPlanar('grain'), tag: 'rail' }); });
    // helmet band (elastic) around the dome
    var bandN = 8, bandPts = []; for (var bi = 0; bi <= bandN; bi++) { var ba = bi / bandN * TAU, dd = Hd.dir(ba, .52), pp = Hd.pt(dd[0], dd[1], dd[2]), rr = norm3(sub3(pp, C)); bandPts.push(add3(pp, mul3(rr, cfg.th + .004))); }
    mb.tube(bandPts, bandPts.map(function () { return [.0042, .0045]; }), { segs: 3, col: K(mulc(gearC, .55), K_GRAIN), uv: uvPlanar('grain'), tag: 'band', ao: function () { return 1; }, capBot: 0, capTop: 0 });
    chinstrap(mulc(gearC, .6));
    if (v === 'bump') [-1, 1].forEach(function (s) { var ep = Hd.surf(s, -.05, .06, .02); mb.ellipsoid([ep[0] + s * .012, ep[1], ep[2]], [.016, .034, .026], { lat: 6, lon: 8, col: K([.1, .1, .11], K_GRAIN), uv: uvPlanar('grain'), tag: 'cup' }); });
    if (h === 'visor') buildEyewear(mb, D, Hd, q, 'visor');
  } else if (h === 'hood') {
    var hoodC = D.uni[0], uvh = uvCloth(.8, .6, false, [.1, .05]);
    shell(yEndFn(.62, -.5, -.9), function (a, y, t) { return .03 + .016 * smooth(.1, 1, y) + .012 * smooth(-.2, -.9, y) * smooth(.7, 1.6, a); }, function (p, n, i, j, t) { return K(hoodC, .88 + .1 * Math.sin(i * 1.7 + j * .8)); }, uvh);
    mb.loft([{ y: 1.585, rx: .088, rz: .095, cz: .02 }, { y: 1.51, rx: .15, rz: .125, cz: .018 }, { y: 1.44, rx: .215, rz: .15, cz: .01 }, { y: 1.405, rx: .22, rz: .155, cz: .01 }], { segs: QS(12, 16, q), col: function (p, n, i, j, t) { return K(hoodC, .86 + .1 * Math.sin(p[0] * 40 + p[1] * 30)); }, uv: uvCloth(.8, .5, false, [.2, .2]), capBot: 0, capTop: 0, tag: 'hood', wob: function (t, b) { return 1 + .04 * Math.sin(b * 5 + t * 6); } });
  } else if (h === 'bandana') {
    var bc = D.gear; shell(yEndFn(.5, .08, -.3), .012, function (p, n, i, j, t) { return K(bc, .9 + .1 * Math.sin(i * 2 + j)); }, uvCloth(.5, .5, false, [.3, .1]));
    var kp = Hd.surf(.5, -.05, 1, .016); mb.ellipsoid([kp[0], kp[1] + .004, kp[2] + .004], [.022, .016, .015], { lat: 6, lon: 8, col: K(bc, .95), uv: uvCloth(.2, .2), tag: 'knot' });
    [[.7, -.1], [.2, .12]].forEach(function (tl) { mb.tube([[kp[0], kp[1], kp[2] + .01], [kp[0] + tl[0] * .03, kp[1] - .035, kp[2] + .02], [kp[0] + tl[0] * .05, kp[1] - .075 - tl[1] * .1, kp[2] + .04]], [[.012, .003], [.011, .003], [.008, .003]], { segs: 6, col: K(bc, .9), uv: uvCloth(.2, .2), tag: 'knot', ao: function () { return 1; } }); });
  } else if (h === 'beanie') {
    var bn = D.gear, uvk = uvReg('knit', 2, 1);
    shell(yEndFn(.46, -.18, -.38), function (a, y) { return .028 + .008 * smooth(.2, 1, y); }, function (p) { return K(bn, K_KNIT); }, uvk);
    capShell(mb, Hd, { cols: cols, rows: 4, yStart: function (a) { return yEndFn(.46, -.18, -.38)(a) + .3; }, yEnd: yEndFn(.46, -.18, -.38), thick: .043, col: function () { return K(mulc(bn, .92), K_KNIT); }, uv: uvReg('knit', 3, 1), tag: 'hat' });
  } else if (h === 'cap') {
    var cc = D.gear;
    shell(yEndFn(.5, .22, .1), .017, function () { return K(cc, K_GRAIN * .98); }, uvPlanar('grain'));
    var bp = Hd.surf(0, .38, -1, 0); mb.ellipsoid([0, C[1] + .043, C[2] - Hd.rz - .06], [.066, .0052, .086], { lat: 6, lon: 10, rot: [.16, 0, 0], col: K(mulc(cc, .9), K_GRAIN), uv: uvPlanar('grain'), tag: 'bill' });
    mb.ellipsoid([0, C[1] + .106, C[2] - .005], [.013, .006, .013], { lat: 4, lon: 6, col: K(mulc(cc, .8), K_GRAIN), tag: 'hat' });
    mb.box([0, C[1] + .066, C[2] - Hd.rz - .008], [.04, .03, .004], { col: K(D.teamCol, .85), tag: 'patch' });
  } else if (h === 'boonie') {
    var bnc = mixc(D.gear, D.uni[0], .5);
    shell(yEndFn(.5, .1, .0), .02, function () { return K(bnc, K_GRAIN); }, uvCloth(.6, .5, false, [0, .2]));
    mb.loft([{ y: C[1] + .04, rx: .1, rz: .112, cz: C[2] + .0 }, { y: C[1] + .028, rx: .165, rz: .178, cz: C[2] }, { y: C[1] + .018, rx: .205, rz: .215, cz: C[2] }], { segs: QS(14, 20, q), capBot: 1, capTop: 0, col: K(bnc, 1), uv: uvCloth(.6, .5, false, [.3, .1]), tag: 'brim', wob: function (t, b) { return 1 + .018 * Math.sin(b * 4); } });
    chinstrap(mulc(bnc, .5));
  } else if (h === 'beret') {
    var bt = D.gear;
    capShell(mb, Hd, { cols: cols, rows: 4, yEnd: yEndFn(.42, .0, -.1), yStart: .75, thick: .013, col: function () { return K(mulc(bt, .6), K_GRAIN); }, uv: uvPlanar('grain'), tag: 'hat' });
    mb.ellipsoid([.02, C[1] + .077, C[2] - .0], [.122, .029, .128], { lat: 8, lon: 14, rot: [.04, 0, .22], col: K(bt, K_KNIT), uv: uvReg('knit', 2, 1), tag: 'hat' });
    mb.ellipsoid([-.026, C[1] + .1, C[2] - .0], [.01, .008, .01], { lat: 4, lon: 6, col: K(mulc(bt, .8), K_KNIT), tag: 'hat' });
    mb.box([-.064, C[1] + .045, C[2] - .075], [.026, .028, .004], { rot: [0, .5, 0], col: K(D.teamCol, .9), tag: 'patch' });
  }
  if (D.ex.headset && h !== 'visor') buildHeadset(mb, D, Hd, q);
  else if (D.ex.headset) buildHeadset(mb, D, Hd, q, true);
  if (D.ex.goggles && (h === 'helmet' || h === 'cap' || h === 'boonie' || h === 'bandana')) buildEyewear(mb, D, Hd, q, 'goggleshead');
}
function buildHeadset(mb, D, Hd, q, thin) {
  var C = Hd.C, dk = [.1, .1, .11];
  [-1, 1].forEach(function (s) { var ep = Hd.surf(s, -.08, .12, .0); mb.ellipsoid([ep[0] + s * .018, ep[1], ep[2] - .004], [.014, .031, .026], { lat: 6, lon: 8, col: K(dk, K_GRAIN), uv: uvPlanar('grain'), tag: 'cup' }); });
  var pts = []; for (var i = 0; i <= 8; i++) { var a = lerp(-PI / 2, PI / 2, i / 8); pts.push([Math.sin(a) * (Hd.rx + .036), C[1] + .035 + Math.cos(a) * (Hd.ry + .02) * .96, C[2] + .004]); }
  mb.tube(pts, pts.map(function () { return [.005, .0045]; }), { segs: 6, col: K(dk, K_GRAIN), uv: uvPlanar('grain'), tag: 'band', ao: function () { return 1; } });
  var m0 = Hd.surf(-.9, -.55, -.35, .028), m1 = Hd.face(-.026, -.058, .034);
  mb.tube([[m0[0], m0[1], m0[2]], [m0[0] * .8, m0[1] - .01, m0[2] - .03], m1], [[.0025, .0025], [.0025, .0025], [.0028, .0028]], { segs: 5, col: K(dk, 1), tag: 'boom', ao: function () { return 1; } });
  mb.ellipsoid(m1, [.006, .006, .008], { lat: 4, lon: 6, col: K(dk, 1), tag: 'boom' });
}
function buildEyewear(mb, D, Hd, q, kind) {
  var C = Hd.C, lens = kind === 'visor' ? [.07, .18, .3] : [.13, .17, .16], frame = [.09, .09, .1];
  if (kind === 'goggleshead') {
    var pts = []; for (var i = 0; i <= 18; i++) { var a = i / 18 * TAU, d = Hd.dir(a, .38), p = Hd.pt(d[0], d[1], d[2]), r = norm3(sub3(p, C)); var off = D.head === 'cap' ? .022 : D.head === 'boonie' ? .026 : .034; pts.push(add3(p, mul3(r, off))); }
    mb.tube(pts, pts.map(function () { return [.0085, .0032]; }), { segs: 5, col: K([.12, .12, .13], K_GRAIN), tag: 'strap', ao: function () { return 1; }, capBot: 0, capTop: 0 });
    var fp = Hd.surf(0, .4, -.9, .032); mb.box([0, fp[1], fp[2] - .004], [.118, .044, .028], { taper: [.9, .8], col: K(frame, K_GRAIN), tag: 'gog' });
    mb.box([0, fp[1], fp[2] - .0182], [.104, .031, .006], { col: lens, tag: 'lens' });
    return;
  }
  // wrap-around eyewear; the captain's visor rides flipped up on the helmet brow so the face stays readable
  var up = kind === 'visor', cols = QS(10, 16, q), rows = 4, y0 = up ? .5 : -.04, y1 = up ? .8 : .22;
  mb.surface(rows, cols, function (i, j) {
    var al = lerp(-1.1, 1.1, j / (cols - 1)), y = lerp(y0, y1, i / (rows - 1)), d = Hd.dir(al, y), p = Hd.pt(d[0], d[1], d[2]), r = norm3(sub3(p, C));
    return add3(p, mul3(r, (up ? .038 + .02 * (i / (rows - 1)) : .018)));
  }, { closed: false, flip: false, col: lens, tag: 'lens' });
  var pts2 = []; for (var k = 0; k < cols; k += 1) { var al2 = lerp(-1.15, 1.15, k / (cols - 1)), d2 = Hd.dir(al2, y1 + .015), p2 = Hd.pt(d2[0], d2[1], d2[2]), r2 = norm3(sub3(p2, C)); pts2.push(add3(p2, mul3(r2, up ? .06 : .019))); }
  mb.tube(pts2, pts2.map(function () { return [.0042, .0036]; }), { segs: 5, col: K(frame, K_GRAIN), tag: 'frame', ao: function () { return 1; }, capBot: 1, capTop: 1 });
  if (!up) [-1, 1].forEach(function (s) { var e0 = Hd.dir(s * 1.12, .12), p0 = Hd.pt(e0[0], e0[1], e0[2]); mb.tube([add3(p0, [s * .004, 0, -.012]), [s * (Hd.rx + .014), C[1] + .005, C[2] - .01], [s * (Hd.rx + .016), C[1] - .005, C[2] + .045]], [[.0026, .0026], [.0026, .0026], [.0026, .0026]], { segs: 4, col: K(frame, 1), tag: 'frame', ao: function () { return 1; } }); });
}

/* ---------- body: torso, arms (IK to the carried weapon), kit, packs, legs ---------- */
function eulerFromDir(d) { var dy = d[1], dz = d[2]; return [Math.atan2(dy, -dz), Math.atan2(-d[0], Math.hypot(dy, dz)), 0]; }
function ik2(S, W, a, b, pole) {
  var d = sub3(W, S), L = len3(d), Lm = Math.min(L, a + b - .002), dir = norm3(d), x = (Lm * Lm + a * a - b * b) / (2 * Lm), h = Math.sqrt(Math.max(0, a * a - x * x));
  var pp = sub3(pole, mul3(dir, dot3(pole, dir))); pp = norm3(pp);
  var E = add3(add3(S, mul3(dir, x)), mul3(pp, h)), Wt = add3(S, mul3(dir, Lm)); return { E: E, W: Wt };
}
function lerpSecs(secs, y, key) {
  if (y <= secs[0].y) return secs[0][key] || 0; for (var i = 1; i < secs.length; i++) if (y <= secs[i].y) { var t = (y - secs[i - 1].y) / (secs[i].y - secs[i - 1].y); return lerp(secs[i - 1][key] || 0, secs[i][key] || 0, t); } return secs[secs.length - 1][key] || 0;
}
function shadeY(lo, hi, y0, y1) { return function (p) { return lo + (hi - lo) * smooth(y0, y1, p[1]); }; }

function buildBody(D, q, Hd) {
  var mb = new MB(), b = D.build, f = D.sex === 'f', rnd = D.rnd, G = K_GRAIN;
  var uni = [1, 1, 1], gear = D.gear, vestC = D.vest, dk = [.11, .115, .115];
  var sh = b.sh, segT = QS(10, 14, q);
  var cl = function (shadeFn) { return function (p, n, i, j, t, s) { var v = shadeFn ? shadeFn(p) : 1; return [v, v, v]; }; };
  var ucl = function (extU, extV, endB) { return uvCloth(extU, extV, endB, [rnd() * (1 - extU), rnd() * (1 - extV)]); };

  // ---- torso (jacket / combat shirt) ----
  var bust = f ? .012 : 0;
  var secs = [
    { y: .775, rx: .19 * b.hp, rz: .118, n: 2.4 }, { y: .90, rx: .187 * b.hp, rz: .118, n: 2.3 }, { y: 1.02, rx: .158 * b.wa, rz: .102 * Math.min(1.1, b.wa), n: 2.3 },
    { y: 1.16, rx: .172 * b.ch, rz: .108 * b.ch, n: 2.4 }, { y: 1.30, rx: .194 * b.ch * sh, rz: .118 * b.ch, cz: -bust, n: 2.5 }, { y: 1.395, rx: .206 * sh, rz: .112, cz: -bust * .4, n: 2.5 },
    { y: 1.46, rx: .185 * sh, rz: .094, n: 2.4 }, { y: 1.505, rx: .105, rz: .08, n: 2 }, { y: 1.54, rx: .06, rz: .06, n: 2 }];
  var bl = D.belly || 0; if (bl) secs.forEach(function (c) { var k = gauss((c.y - 1.1) / .16); c.rz *= 1 + bl * .32 * k; c.rx *= 1 + bl * .1 * k; });
  mb.loft(secs, { segs: segT, seam: PI, capBot: .3, capTop: .4, col: cl(function (p) { var y = p[1]; return (.84 + .16 * smooth(.78, 1.05, y)) * (1 - .1 * gauss((y - 1.02) / .05) * Math.max(0, Math.sin(p[0] * 75 + 1))) * (1 - .08 * gauss((y - 1.2) / .14) * Math.max(0, Math.sin(p[0] * 40 + y * 34))) * (1 - .1 * gauss((y - 1.43) / .05) * Math.abs(Math.sin(p[2] * 60))) * (1 - .06 * smooth(1.3, 1.5, y) * smooth(.12, .2, Math.abs(p[0]))); }), uv: ucl(.86, .7, false), tag: 'torso',
    wob: function (t, bb) { return 1 + .012 * Math.sin(bb * 6 + t * 11) + .01 * Math.sin(bb * 3 - t * 5); } });
  var frontZ = function (y) { return -(lerpSecs(secs, y, 'rz') - (lerpSecs(secs, y, 'cz') || 0)); }, halfW = function (y) { return lerpSecs(secs, y, 'rx'); };

  [-1, 1].forEach(function (s) { mb.ellipsoid([s * .098, 1.497, -.004], [.075 * sh, .034, .07], { lat: 5, lon: 8, col: cl(function () { return .9; }), uv: ucl(.2, .2, false), tag: 'trap' }); });
  mb.loft([{ y: 1.478, rx: .098 * (b.sh > 1.1 ? 1.1 : 1), rz: .09, cz: -.004, n: 2.2 }, { y: 1.53, rx: .084, rz: .08, cz: -.012, n: 2.1 }, { y: 1.575, rx: .08, rz: .078, cz: -.016, n: 2.1 }], { segs: 12, capBot: 0, capTop: 0, col: cl(function () { return .78; }), uv: ucl(.25, .15, false), tag: 'collar' });
  mb.loft([{ y: .985, rx: .214 * b.hp, rz: .139, n: 2.6 }, { y: 1.03, rx: .2 * b.hp, rz: .13, n: 2.5 }], { segs: segT, capBot: .15, capTop: .15, seam: PI, col: cl(function (p) { return .8 + .1 * Math.sin(p[0] * 60); }), uv: ucl(.5, .1, false), tag: 'blouse' });
  // ---- belt + hips ----
  var beltC = K(mulc(gear, .65), G);
  mb.loft([{ y: .905, rx: .198 * b.hp, rz: .126, n: 2.6 }, { y: .995, rx: .194 * b.hp, rz: .124, n: 2.6 }], { segs: segT, capBot: .15, capTop: .15, col: beltC, uv: uvPlanar('grain'), tag: 'belt', seam: PI });
  [-.15, -.075, .075, .15].forEach(function (lx) { mb.box([lx, .952, -.1285 + Math.abs(lx) * .08], [.014, .05, .006], { col: beltC, uv: uvPlanar('grain'), tag: 'loop' }); });
  mb.box([0, .95, -.127], [.04, .03, .012], { col: K([.36, .36, .35], K_METAL), uv: atlReg('metal'), tag: 'buckle' });
  if (D.ex.canteen) { mb.box([-.1, .98, .152], [.075, .12, .06], { taper: [.9, .9], col: K(mixc(gear, [.3, .33, .22], .5), G), uv: uvPlanar('grain'), tag: 'canteen' }); mb.ellipsoid([-.1, 1.045, .152], [.026, .012, .026], { lat: 4, lon: 6, col: K([.12, .12, .1], G), tag: 'canteen' }); }
  if (D.ex.dump) mb.box([.19, .93, .05], [.07, .12, .1], { taper: [.9, .85], col: K(mulc(gear, .85), G), uv: uvPlanar('grain'), tag: 'dump' });
  if (D.ex.holster && !D.ex.legHolster) { mb.box([.2, .87, -.02], [.05, .17, .08], { col: K([.1, .1, .1], G), uv: uvPlanar('grain'), tag: 'holster' }); mb.box([.2, .96, .0], [.03, .07, .05], { col: K([.12, .12, .12], G), tag: 'holster' }); }

  // ---- kit ----
  var vk = D.kit.vest, vcol = K(vestC, G), gcol = K(gear, G), pc = K(mulc(gear, .9), G);
  function plate(cx, cy, cz, w, h, d, col, flat) {
    mb.loft([{ y: cy - h / 2, rx: w / 2 * .94, rz: d / 2, cx: cx, cz: cz, n: 4.2 }, { y: cy - h * .22, rx: w / 2, rz: d / 2, cx: cx, cz: cz, n: 4.2 }, { y: cy + h * .3, rx: w / 2, rz: d / 2, cx: cx, cz: cz, n: 4.2 }, { y: cy + h / 2, rx: w / 2 * .8, rz: d / 2 * .94, cx: cx, cz: cz, n: 4.2 }],
      { segs: 12, capBot: .35, capTop: .35, col: function (p, n) { var v = K(col, K_MOLLE / K_GRAIN); return v; }, uv: function (p, n) { return atl('molle', .5 + (p[0] - cx) / w * .96, .5 - (p[1] - cy) / h * .9); }, tag: 'plate', seam: PI / 2 });
  }
  function pouch(cx, cy, cz, w, h, d, col, flapCol) {
    mb.box([cx, cy, cz], [w, h, d], { taper: [.96, .93], col: col, uv: uvPlanar('grain'), tag: 'pouch' });
    mb.box([cx, cy + h * .36, cz - d * .5 - .002], [w * 1.03, h * .3, .008], { col: flapCol || K(mulc(col, .85), 1), uv: uvPlanar('grain'), tag: 'flap' });
  }
  function straps(thin) {
    [-1, 1].forEach(function (s) {
      mb.tube([[s * .108, 1.37, -.128], [s * .112, 1.445, -.075], [s * .118, 1.472, 0], [s * .112, 1.44, .08], [s * .108, 1.37, .128]], [[thin ? .019 : .027, .008], [thin ? .019 : .027, .01], [thin ? .02 : .028, .01], [thin ? .019 : .027, .01], [thin ? .019 : .027, .008]], { segs: 4, side: [1, 0, 0], col: vcol, uv: uvPlanar('grain'), tag: 'strap', capBot: 0, capTop: 0, ao: function () { return 1; } });
    });
  }
  var padK = vk === 'heavy' ? 1.1 : 1;
  if (vk === 'carrier' || vk === 'heavy') {
    var pw = .272 * (vk === 'heavy' ? 1.07 : 1) * Math.min(1.1, b.ch), ph = .31 * (vk === 'heavy' ? 1.08 : 1);
    plate(0, 1.325, -.148, pw, ph, .046, vcol); plate(0, 1.32, .138, pw * .97, ph * .98, .042, vcol);
    // cummerbund + side plate pockets
    mb.loft([{ y: .985, rx: .186 * b.hp, rz: .121, n: 2.8 }, { y: 1.07, rx: .187, rz: .125, n: 2.8 }, { y: 1.19, rx: .188 * b.ch, rz: .128 * b.ch, n: 2.8 }], { segs: segT, capBot: .1, capTop: .1, seam: PI, col: K(mulc(vestC, .92), G), uv: uvPlanar('grain'), tag: 'cummer' });
    [-1, 1].forEach(function (s) { mb.box([s * .197, 1.13, 0], [.03, .2, .15], { taper: [.9, .9], col: K(mulc(vestC, .85), G), uv: uvPlanar('grain'), tag: 'side' }); });
    for (var m = -1; m <= 1; m++) pouch(m * .088, 1.145, -.188, .074, .105, .042, gcol);
    pouch(0, 1.43, -.172, .12, .052, .026, pc);
    if (vk === 'heavy') {
      [-1, 1].forEach(function (s) { mb.ellipsoid([s * .207, 1.455, -.01], [.062, .036, .065], { lat: 5, lon: 7, rot: [0, 0, -s * .35], col: vcol, uv: uvPlanar('grain'), tag: 'pad' }); mb.ellipsoid([s * .222, 1.425, -.01], [.058, .03, .062], { lat: 4, lon: 7, rot: [0, 0, -s * .55], col: K(mulc(vestC, 1.1), G), uv: uvPlanar('grain'), tag: 'pad' }); });
      if (D.id === 'squall') [-1, 1].forEach(function (s) {
        /* Flush lift-rated overlays on the existing shoulder guards: a small
           steel reinforcement and muted amber inspection mark, merged into
           the torso mesh and kept inside the original pad silhouette. */
        mb.box([s * .207, 1.455, -.072], [.052, .021, .008], { rot: [0, 0, -s * .08], taper: [.92, .82], col: K([.22, .26, .29], K_METAL), tag: 'squallLiftPlate' });
        mb.box([s * .207, 1.455, -.078], [.021, .004, .002], { rot: [0, 0, -s * .08], col: K([.72, .45, .18], G), tag: 'squallInspectionMark' });
      });
      mb.loft([{ y: 1.49, rx: .079, rz: .082, n: 2.4 }, { y: 1.56, rx: .074, rz: .076, n: 2.2 }], { segs: 10, capBot: 0, capTop: 0, col: vcol, uv: uvPlanar('grain'), tag: 'collar' });
      mb.box([0, .77, -.13], [.17, .15, .034], { taper: [.7, 1], col: vcol, uv: uvPlanar('grain'), tag: 'groin' });
      pouch(-.17, 1.2, -.165, .06, .11, .05, gcol); pouch(.17, 1.2, -.165, .06, .11, .05, gcol);
    }
    straps(false);
  } else if (vk === 'chest') {
    mb.box([0, 1.285, -.142], [.262, .17, .042], { taper: [.94, .9], col: vcol, uv: uvPlanar('grain'), tag: 'panel' });
    for (var c = 0; c < 4; c++) pouch(-.093 + c * .062, 1.26, -.175, .054, .105, .036, gcol);
    mb.box([0, 1.37, -.146], [.2, .04, .03], { col: vcol, uv: uvPlanar('grain'), tag: 'panel' });
    mb.box([0, 1.2, .13], [.24, .24, .03], { col: vcol, uv: uvPlanar('grain'), tag: 'panel' });
    straps(true);
  } else if (vk === 'utility') {
    mb.loft([{ y: 1.04, rx: .176 * b.ch, rz: .12 * b.ch, n: 2.7 }, { y: 1.2, rx: .188 * b.ch, rz: .13 * b.ch, n: 2.7 }, { y: 1.34, rx: .208 * b.ch, rz: .136 * b.ch, n: 2.7 }, { y: 1.43, rx: .196, rz: .112, n: 2.5 }], { segs: segT, capBot: .1, capTop: .1, seam: PI, col: vcol, uv: uvPlanar('grain'), tag: 'vest', wob: function (t, bb) { return 1 + .01 * Math.sin(bb * 7 + t * 9); } });
    [-1, 1].forEach(function (s) { pouch(s * .088, 1.31, -.158, .085, .088, .05, gcol); pouch(s * .09, 1.13, -.14, .09, .088, .05, gcol); });
    mb.box([0, 1.22, -.152], [.012, .36, .01], { col: K([.2, .2, .2], K_METAL), tag: 'zip' });
  } else { // light: H-harness only
    straps(true);
    mb.box([0, 1.255, -.136], [.2, .075, .03], { col: vcol, uv: uvPlanar('grain'), tag: 'panel' });
    pouch(-.075, 1.3, -.158, .06, .075, .04, gcol); pouch(.075, 1.3, -.158, .06, .075, .04, gcol);
    mb.box([0, 1.2, .122], [.2, .22, .02], { col: vcol, uv: uvPlanar('grain'), tag: 'panel' });
  }
  // team identity: hook-and-loop chest patch
  mb.box([.08, 1.395, vk === 'light' ? -.14 : -.176], [.052, .03, .004], { col: K(D.teamCol, .95), tag: 'patch' });
  if (D.ex.rank) { mb.box([-.085, 1.395, -.177], [.045, .026, .004], { col: K([.78, .68, .3], .95), tag: 'rank' }); mb.box([-.085, 1.395, -.1795], [.03, .004, .002], { col: dk, tag: 'rank' }); }
  if (D.ex.binos && D.id === 'ember') {
    /* Compact paired field glasses fixed to the light chest harness; all pieces
       are merged into the existing torso mesh rather than separate render nodes. */
    mb.box([0, 1.37, -.169], [.038, .022, .03], { col: K([.2, .22, .20], K_METAL), tag: 'emberFieldglassBridge' });
    [-1, 1].forEach(function (s) {
      mb.ellipsoid([s * .03, 1.37, -.182], [.014, .022, .02], { lat: 5, lon: 7, col: K([.16, .19, .17], G), uv: uvPlanar('grain'), tag: 'emberFieldglassBarrel' });
      mb.ellipsoid([s * .03, 1.37, -.201], [.008, .012, .003], { lat: 4, lon: 6, col: K([.08, .12, .10], 1), tag: 'emberFieldglassLens' });
    });
    mb.tube([[-.04, 1.47, -.06], [-.05, 1.42, -.15], [-.045, 1.39, -.18]], [[.01, .004], [.01, .004], [.01, .004]], { segs: 5, col: K([.1, .1, .1], G), tag: 'emberFieldglassKeeper', ao: function () { return 1; } });
  } else if (D.ex.binos) {
    mb.box([0, 1.37, -.185], [.105, .068, .062], { taper: [.9, .9], col: K([.12, .13, .12], G), uv: uvPlanar('grain'), tag: 'binos' }); mb.tube([[-.04, 1.47, -.06], [-.05, 1.42, -.15], [-.045, 1.39, -.18]], [[.01, .004], [.01, .004], [.01, .004]], { segs: 5, col: K([.1, .1, .1], G), tag: 'strap', ao: function () { return 1; } });
  }
  if (D.ex.rangefinder && D.id === 'flint') {
    /* Compact dual-lens survey optic, merged into the body mesh and mounted to
       the existing light rig; it adds no collision or draw-call path. */
    mb.box([-.095, 1.375, -.178], [.058, .074, .047], { taper: [.9, .9], col: K([.16, .17, .17], G), uv: uvPlanar('grain'), tag: 'flintSurveyRangefinder' });
    mb.box([-.095, 1.375, -.205], [.05, .054, .008], { taper: [.92, .92], col: K([.23, .24, .23], K_METAL), tag: 'flintSurveyFace' });
    [-1, 1].forEach(function (s) { mb.ellipsoid([-.095 + s * .013, 1.379, -.211], [.0075, .008, .003], { lat: 4, lon: 6, col: K([.07, .11, .12], 1), tag: 'flintSurveyLens' }); });
    mb.box([-.095, 1.351, -.211], [.018, .003, .002], { col: K([.66, .46, .22], K_METAL), tag: 'flintSurveyIndex' });
  } else if (D.ex.rangefinder && D.id === 'skerry') {
    /* Weather-shielded spotter optic, mounted flush to the carrier front. */
    mb.box([-.095, 1.375, -.178], [.058, .068, .046], { taper: [.86, .9], rot: [0, 0, -.06], col: K([.19, .22, .20], G), uv: uvPlanar('grain'), tag: 'skerrySpotterHousing' });
    mb.box([-.095, 1.411, -.193], [.043, .008, .018], { rot: [0, 0, -.06], col: K([.16, .19, .18], K_METAL), tag: 'skerrySpotterRail' });
    mb.ellipsoid([-.095, 1.378, -.205], [.014, .015, .004], { lat: 4, lon: 8, col: K([.08, .12, .13], 1), tag: 'skerrySpotterGlass' });
    mb.box([-.095, 1.346, -.204], [.018, .004, .003], { col: K([.54, .59, .48], K_METAL), tag: 'skerryOpticIndex' });
  } else if (D.ex.rangefinder) {
    mb.box([-.095, 1.375, -.178], [.05, .075, .045], { col: K([.14, .15, .14], G), uv: uvPlanar('grain'), tag: 'rf' });
  }
  if (D.ex.map) mb.box([0, 1.03, -.17], [.15, .1, .018], { col: K([.62, .56, .4], G), uv: uvPlanar('grain'), tag: 'map' });
  if (D.id === 'riptide') {
    /* Tactile push-to-talk unit clipped to the upper carrier strap. It is part
       of the baked torso mesh and stays clear of the weapon-arm anchors. */
    mb.box([.12, 1.435, -.177], [.03, .05, .016], { rot: [0, 0, -.08], col: K([.12, .16, .18], K_METAL), uv: uvPlanar('grain'), tag: 'riptideCommandPTT' });
    mb.box([.12, 1.441, -.187], [.018, .008, .003], { rot: [0, 0, -.08], col: K([.25, .34, .36], K_METAL), tag: 'riptidePTTKey' });
    mb.ellipsoid([.12, 1.418, -.187], [.005, .005, .003], { lat: 4, lon: 6, col: K([.48, .32, .16], K_METAL), tag: 'riptidePTTChannel' });
  }
  if (D.ex.medkit) { mb.box([-.165, 1.17, -.17], [.075, .09, .045], { col: K([.78, .78, .74], G), tag: 'med' }); mb.box([-.165, 1.17, -.1935], [.04, .012, .003], { col: K([.7, .12, .1], 1), tag: 'med' }); mb.box([-.165, 1.17, -.1935], [.012, .04, .003], { col: K([.7, .12, .1], 1), tag: 'med' }); }
  if (D.ex.knife) { mb.box([-.12, 1.255, -.188], [.022, .13, .014], { rot: [0, 0, .08], col: K([.1, .1, .1], G), tag: 'knife' }); mb.box([-.115, 1.33, -.19], [.026, .05, .02], { rot: [0, 0, .08], col: K([.06, .06, .06], G), tag: 'knife' }); }
  if (D.ex.gaiter && D.cover === 'bare') mb.loft([{ y: 1.49, rx: .075, rz: .075, n: 2.2 }, { y: 1.54, rx: .066, rz: .068, n: 2.1 }, { y: 1.575, rx: .062, rz: .065, n: 2.1 }], { segs: 10, capBot: 0, capTop: 0, col: K(D.scarfCol, K_KNIT), uv: uvReg('knit', 2, 1), tag: 'gaiter', wob: function (t, bb) { return 1 + .03 * Math.sin(bb * 4 + t * 12); } });
  if (D.ex.shells) {
    if (D.id === 'smolder') {
      /* Six short, upright shells sit in one low carrier row instead of the
         generic diagonal of ten bulky blocks. The strap, casings and brass
         bases are merged into the torso mesh and stay inside the carrier. */
      for (var smShell = 0; smShell < 6; smShell++) {
        var smx = -.125 + smShell * .05, smz = -.207;
        mb.tube([[smx, 1.27, smz], [smx, 1.305, smz], [smx, 1.34, smz]], [[.0085, .0085], [.0085, .0085], [.0075, .0075]], { segs: 5, col: K([.48, .105, .075], G), tag: 'smolderShellCasing', ao: function () { return 1; } });
        mb.ellipsoid([smx, 1.271, smz], [.0087, .0035, .0087], { lat: 4, lon: 6, col: K([.68, .52, .24], K_METAL), tag: 'smolderShellBase' });
      }
      mb.box([0, 1.287, -.214], [.285, .009, .008], { col: K([.17, .18, .17], G), tag: 'smolderShellRetainer' });
    } else {
      for (var sI = 0; sI < 10; sI++) { var t = sI / 9, x = lerp(-.12, .15, t), y = lerp(1.42, 1.08, t), z = frontZ(y) * (1 + .0) - .028 - Math.sqrt(Math.max(0, 1 - Math.pow(x / (halfW(y) + .02), 2))) * 0.0; var zz = -(lerpSecs(secs, y, 'rz') * Math.sqrt(Math.max(.25, 1 - Math.pow(x / (halfW(y) + .01), 2)))) - .033; mb.box([x, y, zz], [.021, .056, .02], { rot: [0, 0, -.6], col: K([.62, .14, .1], G), tag: 'shell' }); mb.box([x + .008, y - .014, zz - .002], [.022, .018, .022], { rot: [0, 0, -.6], col: K([.76, .6, .22], K_METAL), tag: 'shell' }); }
    }
  }
  if (D.ex.belt) { // draped linked ammunition
    for (var bI = 0; bI < 12; bI++) { var tb = bI / 11, bx = lerp(.19, -.1, tb), by = 1.44 - .34 * tb - .02 * Math.sin(tb * PI), bz = -(lerpSecs(secs, by, 'rz') * Math.sqrt(Math.max(.25, 1 - Math.pow(bx / (halfW(by) + .01), 2)))) - .036; mb.box([bx, by, bz], [.026, .026, .02], { rot: [0, 0, -.9], col: K(bI % 2 ? [.7, .55, .2] : [.55, .45, .18], K_METAL), tag: 'belt' }); }
  }
  if (D.ex.rope && D.id !== 'halyard') {
    for (var rc = -1; rc <= 1; rc++) {
      var rp = []; for (var ri = 0; ri <= 8; ri++) { var tr = ri / 8, rx2 = lerp(-.15, .17, tr), ry2 = lerp(1.44, 1.02, tr) + rc * .028 - .01; var rzz = -(lerpSecs(secs, ry2, 'rz') * Math.sqrt(Math.max(.25, 1 - Math.pow(rx2 / (halfW(ry2) + .01), 2)))) - .03; rp.push([rx2, ry2, rzz]); }
      mb.tube(rp, rp.map(function () { return [.013, .013]; }), { segs: 6, col: K([.72, .64, .45], G), uv: uvPlanar('grain'), tag: 'rope', ao: function () { return 1; } });
    }
  }
  if (D.id === 'halyard') {
    /* Low-profile lower harness and a clipped belay loop sit below the carrier;
       they add a climber read without changing arm sockets or body dimensions. */
    mb.tube([[-.17, .88, -.060], [-.14, .862, -.088], [-.08, .852, -.116], [0, .85, -.126], [.08, .852, -.116], [.14, .862, -.088], [.17, .88, -.060]],
      [[.012, .007], [.013, .007], [.014, .007], [.014, .007], [.014, .007], [.013, .007], [.012, .007]],
      { segs: 5, col: K([.42, .38, .29], G), uv: uvPlanar('grain'), tag: 'halyardClimbingHarness', ao: function () { return 1; } });
    mb.tube([[.193, .94, .015], [.193, .925, .038], [.193, .89, .04], [.193, .87, .02], [.193, .887, -.008], [.193, .925, -.005], [.193, .94, .015]],
      [[.004, .004], [.004, .004], [.004, .004], [.004, .004], [.004, .004], [.004, .004], [.004, .004]],
      { segs: 5, col: K([.62, .62, .56], K_METAL), tag: 'halyardBelayLoop', ao: function () { return 1; } });
  }
  if (D.ex.strips) {
    for (var gi = 0; gi < 14; gi++) {
      var gs = gi % 2 ? 1 : -1, gx = gs * (.04 + rnd() * .15), gy = 1.46 + rnd() * .02, gz = -.1 + rnd() * .22, gl = .12 + rnd() * .2, gc = mixc(D.uni[2], D.uni[rnd() < .5 ? 1 : 3], rnd() * .7);
      mb.tube([[gx, gy, gz], [gx + gs * .02, gy - gl * .5, gz + (rnd() - .5) * .04], [gx + gs * .035, gy - gl, gz + (rnd() - .5) * .06]], [[.012, .003], [.011, .003], [.006, .002]], { segs: 3, capBot: 0, capTop: 0, col: K(gc, 1.0), tag: 'strip', ao: function () { return 1; } });
    }
  }

  // ---- pack ----
  var pk = D.kit.pack, packC = K(mixc(gear, D.uni[0], .25), G), packD = K(mulc(gear, .75), G), pz0 = (D.kit.vest === 'carrier' || D.kit.vest === 'heavy') ? .15 : .118;
  function packBox(w, h, d, cy, col) { mb.loft([{ y: cy - h / 2, rx: w / 2 * .9, rz: d / 2 * .92, cz: pz0 + d / 2, n: 3.6 }, { y: cy - h * .3, rx: w / 2, rz: d / 2, cz: pz0 + d / 2, n: 3.6 }, { y: cy + h * .3, rx: w / 2 * .98, rz: d / 2 * .98, cz: pz0 + d / 2, n: 3.6 }, { y: cy + h / 2, rx: w / 2 * .84, rz: d / 2 * .9, cz: pz0 + d / 2, n: 3.6 }], { segs: 12, capBot: .3, capTop: .3, col: col, uv: uvPlanar('grain'), tag: 'pack', seam: 0 }); }
  if (D.id === 'kindle') {
    /* Compact asymmetric courier sling: a shifted, tapered pack with a diagonal
       rear strap and restrained flap hardware. MB merges it into the existing
       body mesh, so it adds no material or draw call and has no collision rig. */
    mb.loft([{ y: .99, rx: .052, rz: .045, cx: .105, cz: pz0 + .08, n: 3.4 },
      { y: 1.045, rx: .092, rz: .066, cx: .10, cz: pz0 + .095, n: 3.4 },
      { y: 1.22, rx: .105, rz: .072, cx: .072, cz: pz0 + .102, n: 3.4 },
      { y: 1.31, rx: .078, rz: .056, cx: .052, cz: pz0 + .09, n: 3.4 }],
      { segs: 10, capBot: .35, capTop: .35, col: packC, uv: uvPlanar('grain'), tag: 'kindleCourierPack', seam: 0 });
    mb.box([.074, 1.17, pz0 + .168], [.142, .105, .014], { taper: [.9, .92], col: packD, uv: uvPlanar('grain'), tag: 'kindleCourierFlap' });
    mb.box([.105, 1.17, pz0 + .178], [.022, .028, .008], { col: K([.49, .34, .20], K_METAL), tag: 'kindleCourierLatch' });
    /* Follow the torso until the pack top, then track the bag's outer rear
       contour. This keeps the strap attached and visible over the merged mesh. */
    mb.tube([[-.13, 1.455, .106], [-.105, 1.375, .124], [-.045, 1.315, pz0 + .164], [.035, 1.16, pz0 + .189], [.105, 1.035, pz0 + .173]],
      [[.012, .009], [.013, .009], [.014, .009], [.013, .009], [.011, .008]],
      { segs: 5, col: K(mixc(gear, vestC, .38), G), uv: uvPlanar('grain'), tag: 'kindleCourierSling', ao: function () { return 1; } });
  } else if (D.id === 'undertow') {
    /* Low-profile twin salvage-air bottles integrated with a compact hydration
       pack. All pieces join the baked body mesh; no separate draw or rig nodes. */
    packBox(.24, .38, .12, 1.245, packC);
    mb.box([0, 1.25, pz0 + .132], [.19, .30, .014], { col: packD, uv: uvPlanar('grain'), tag: 'undertowBreatherBackplate' });
    [-1, 1].forEach(function (s) {
      mb.ellipsoid([s * .055, 1.255, pz0 + .16], [.031, .13, .029], { lat: 6, lon: 8, col: K([.13, .17, .18], K_METAL), uv: uvPlanar('grain'), tag: 'undertowAirBottle' });
      mb.box([s * .055, 1.39, pz0 + .16], [.022, .019, .021], { col: K([.23, .26, .25], K_METAL), tag: 'undertowValve' });
      mb.box([s * .055, 1.405, pz0 + .16], [.012, .006, .012], { col: K([.48, .43, .31], K_METAL), tag: 'undertowValveCap' });
    });
    mb.box([0, 1.235, pz0 + .188], [.13, .022, .008], { col: K([.18, .22, .23], G), uv: uvPlanar('grain'), tag: 'undertowBottleRetainer' });
  } else if (pk === 'assault') { packBox(.27, .33, .15, 1.27, packC); mb.box([0, 1.43, pz0 + .08], [.25, .05, .16], { col: packD, uv: uvPlanar('grain'), tag: 'pack' }); [-1, 1].forEach(function (s) { mb.box([s * .15, 1.2, pz0 + .06], [.05, .15, .1], { taper: [.9, .9], col: packD, uv: uvPlanar('grain'), tag: 'pack' }); }); mb.box([0, 1.2, pz0 + .153], [.19, .17, .02], { col: packD, uv: uvPlanar('grain'), tag: 'pack' }); }
  else if (pk === 'patrol') { packBox(.31, .46, .2, 1.24, packC); mb.box([0, 1.5, pz0 + .1], [.28, .06, .2], { col: packD, uv: uvPlanar('grain'), tag: 'pack' }); mb.ellipsoid([0, .985, pz0 + .09], [.15, .052, .052], { lat: 6, lon: 10, rot: [0, 0, PI / 2], col: K(mixc(D.uni[2], gear, .4), G), uv: uvPlanar('grain'), tag: 'bedroll' }); [-1, 1].forEach(function (s) { mb.box([s * .17, 1.18, pz0 + .08], [.05, .2, .12], { col: packD, uv: uvPlanar('grain'), tag: 'pack' }); }); if (D.ex.tarp) mb.ellipsoid([0, 1.505, pz0 + .08], [.14, .05, .052], { lat: 6, lon: 10, rot: [0, 0, PI / 2], col: K(mixc(D.uni[0], [.3, .35, .25], .4), G), tag: 'tarp' }); }
  else if (pk === 'hydration') { packBox(.23, .42, .105, 1.255, packC); mb.box([0, 1.34, pz0 + .11], [.2, .2, .02], { col: packD, uv: uvPlanar('grain'), tag: 'pack' }); mb.tube([[.04, 1.44, pz0 + .05], [.075, 1.50, .06], [.095, 1.5, -.05], [.1, 1.42, -.13]], [[.0048, .0048], [.0048, .0048], [.0048, .0048], [.0048, .0048]], { segs: 5, col: K([.16, .17, .17], 1), tag: 'hose', ao: function () { return 1; } }); }
  else if (pk === 'radio') { packBox(.25, .3, .13, 1.27, packC); mb.box([0, 1.28, pz0 + .14], [.2, .24, .05], { col: K([.12, .13, .12], G), uv: uvPlanar('grain'), tag: 'radio' }); [-1, 1].forEach(function (s) { mb.ellipsoid([s * .055, 1.405, pz0 + .14], [.012, .012, .014], { lat: 4, lon: 6, col: K([.5, .5, .5], K_METAL), tag: 'knob' }); }); D.ex.mast = 1; }
  else if (pk === 'drybag') { mb.loft([{ y: 1.07, rx: .115, rz: .1, cz: pz0 + .09 }, { y: 1.19, rx: .125, rz: .108, cz: pz0 + .092 }, { y: 1.34, rx: .122, rz: .106, cz: pz0 + .09 }, { y: 1.42, rx: .1, rz: .088, cz: pz0 + .085 }], { segs: 12, capBot: .6, capTop: .4, col: K(mixc(D.teamCol, gear, .6), G), uv: uvPlanar('grain'), tag: 'dry' }); mb.box([0, 1.44, pz0 + .085], [.15, .024, .05], { col: K([.1, .1, .1], G), tag: 'roll' }); }
  if (D.id === 'halyard') {
    /* Two compact rope hanks are clipped to the rear face of his hydration
       pack. The merged low-poly loops remain a visual-only part of the body. */
    function halyardRopeHank(cx) {
      var pts = [], radii = [];
      for (var hy = 0; hy <= 20; hy++) {
        var ang = PI * 2 * (hy % 20) / 20;
        pts.push([cx + .033 * Math.cos(ang), 1.23 + .055 * Math.sin(ang), pz0 + .107 + .002 * Math.cos(ang * 2)]);
        radii.push([.0065, .0065]);
      }
      mb.tube(pts, radii, { segs: 5, col: K([.68, .57, .40], G), uv: uvPlanar('grain'), tag: 'halyardRopeCoil', ao: function () { return 1; } });
    }
    halyardRopeHank(-.055); halyardRopeHank(.015);
    mb.box([-.02, 1.195, pz0 + .11], [.15, .014, .01], { col: packD, uv: uvPlanar('grain'), tag: 'halyardRopeKeeper' });
    mb.box([-.02, 1.265, pz0 + .11], [.15, .014, .01], { col: packD, uv: uvPlanar('grain'), tag: 'halyardRopeKeeper' });
  }
  if (pk !== 'none' && D.id !== 'kindle') [-1, 1].forEach(function (s) { mb.tube([[s * .1, 1.43, pz0 + .01], [s * .115, 1.47, .06], [s * .112, 1.44, .12]], [[.016, .006], [.016, .006], [.016, .006]], { segs: 4, side: [1, 0, 0], capBot: 0, capTop: 0, col: K(vestC, G), tag: 'strap', ao: function () { return 1; } }); });
  if (D.ex.mast) { mb.tube([[.095, 1.45, pz0 + .08], [.1, 1.72, pz0 + .09], [.09, 2.02, pz0 + .08]], [[.0042, .0042], [.0032, .0032], [.002, .002]], { segs: 4, col: K([.06, .06, .06], 1), tag: 'mast', ao: function () { return 1; } }); }
  if (D.ex.tool) {
    if (D.id === 'smolder') {
      /* A compact, secured breaching bar: same pack mount and envelope as the
         old generic tool, with a wrapped grip and restrained adze/fork head. */
      mb.tube([[.155, .98, pz0 + .06], [.155, 1.3, pz0 + .095], [.155, 1.56, pz0 + .09]], [[.010, .010], [.010, .010], [.010, .010]], { segs: 6, col: K([.16, .17, .16], K_METAL), tag: 'smolderBreachHandle', ao: function () { return 1; } });
      mb.box([.155, 1.19, pz0 + .09], [.024, .075, .026], { col: K([.31, .16, .12], G), tag: 'smolderBreachGrip' });
      mb.box([.155, 1.535, pz0 + .09], [.058, .016, .022], { col: K([.18, .19, .18], K_METAL), tag: 'smolderBreachAdze' });
      mb.box([.155, 1.575, pz0 + .075], [.016, .034, .043], { rot: [.35, 0, 0], col: K([.15, .16, .15], K_METAL), tag: 'smolderBreachFork' });
      mb.box([.155, 1.45, pz0 + .09], [.033, .012, .018], { col: K([.18, .19, .18], K_METAL), tag: 'smolderBreachKeeper' });
    } else {
      mb.tube([[.155, .98, pz0 + .06], [.155, 1.3, pz0 + .095], [.155, 1.56, pz0 + .09]], [[.011, .011], [.011, .011], [.011, .011]], { segs: 6, col: K([.2, .21, .2], K_METAL), tag: 'tool', ao: function () { return 1; } }); mb.box([.155, 1.58, pz0 + .075], [.016, .03, .045], { rot: [.4, 0, 0], col: K([.18, .19, .18], K_METAL), tag: 'tool' });
    }
  }
  if (D.ex.shoulderGuards && vk !== 'heavy') [-1, 1].forEach(function (s) { mb.ellipsoid([s * .215, 1.45, -.01], [.06, .034, .062], { lat: 6, lon: 9, rot: [0, 0, -s * .4], col: vcol, uv: uvPlanar('grain'), tag: 'pad' }); });
   if (D.id === 'ashfall') {
     /* Compact salvage-steel rail brace, fitted to the existing right shoulder pad. */
     mb.box([.207, 1.455, -.078], [.052, .024, .008], { rot: [0, 0, -.18], col: K([.2, .21, .2], K_METAL), uv: uvPlanar('grain'), tag: 'ashfallShoulderRail' });
     mb.box([.207, 1.456, -.084], [.032, .004, .002], { rot: [0, 0, -.18], col: K([.48, .25, .16], K_METAL), tag: 'ashfallCinderMark' });
   }

  var LA = D.lean || 0, lc = Math.cos(LA), ls = Math.sin(LA);
  function leanPt(p) { var dy = p[1] - .9, w = smooth(.85, 1.15, p[1]); var y2 = .9 + dy * lc + p[2] * ls, z2 = p[2] * lc - dy * ls; return [p[0], lerp(p[1], y2, w), lerp(p[2], z2, w)]; }
  // ---- arms (IK to grip + foregrip of the carried weapon) ----
   var sx = .205 * sh + .014, armK = (f ? .94 : 1) * (b.arm > 1.1 ? 1.02 : 1), ua = .312 * armK, fa = .292 * armK;
  var bodyMB = mb, armBuilders = {}, armAnchors = {}, armDefaults = {}, handSpecs = {};
  var sleeveC = [1, 1, 1], rolled = D.sleeves === 'rolled';
  function arm(side, wristT, pole) {
    var S = leanPt([side * sx, 1.43, -.012]), dir0 = norm3(sub3(wristT, S)), W0 = sub3(wristT, mul3(dir0, .06));
    armAnchors[side] = S.slice(); armDefaults[side] = sub3(wristT, S);
    var r = ik2(S, W0, ua, fa, pole), E = r.E, W = r.W;
     var u1 = lerp3(S, E, .45), f1 = lerp3(E, W, .5), sleeveR = b.arm * (f ? .9 : 1) * 1.22;
    var rk = sleeveR * (b.bulk > 1.1 ? 1.08 : 1);
    var inner = [-side, 0, .2];
    mb.ellipsoid(S, [.062 * rk * (f ? .92 : 1), .06 * rk, .06 * rk], { lat: 6, lon: 9, col: cl(function () { return .96; }), uv: ucl(.28, .3, false), tag: 'shoulder' });
    var path = [S, u1, E, f1, W], radii = [[.056 * rk, .054 * rk], [.052 * rk, .05 * rk], [.047 * rk, .046 * rk], [.043 * rk, .042 * rk], [.038 * rk, .038 * rk]];
    var wobE = function (t, bb) { return 1 + .035 * gauss((t - .5) / .09) * Math.sin(bb * 3 + 1) + .018 * Math.sin(t * 17 + bb * 2); };
    if (!rolled) mb.tube(path, radii, { segs: QS(7, 9, q), seamDir: inner, col: cl(function (p) { return .88 + .12 * smooth(1.1, 1.43, p[1]); }), uv: ucl(.3, .55, true), tag: 'sleeve', wob: wobE, ao: function (p, n) { return .86 + .14 * smooth(-.6, .6, n[1] + .3); } });
    else {
      var cut = lerp3(E, W, .22); var path2 = [S, u1, E, cut];
      mb.tube(path2, radii.slice(0, 3).concat([[.047 * rk, .046 * rk]]), { segs: QS(7, 9, q), seamDir: inner, col: cl(function () { return .9; }), uv: ucl(.3, .35, true), tag: 'sleeve', wob: wobE, capTop: .1 });
      mb.tube([lerp3(E, W, .18), lerp3(E, W, .26)], [[.054 * rk, .052 * rk], [.054 * rk, .052 * rk]], { segs: 8, col: cl(function () { return .82; }), uv: ucl(.3, .1, true), tag: 'roll', capBot: .2, capTop: .2 });
      mb.tube([lerp3(E, W, .24), f1, W], [[.04 * rk, .039 * rk], [.036 * rk, .035 * rk], [.032 * rk, .032 * rk]], { segs: 8, col: mulc(D.skin, .94), tag: 'skin', capTop: 0, ao: function (p, n) { return .88 + .12 * smooth(-.6, .6, n[1] + .3); } });
    }
    var pcol = [[.78, .78, .72], [.12, .22, .5], [.62, .12, .1], [.8, .64, .2], [.2, .3, .2]][(D.seed + (side > 0 ? 1 : 3)) % 5]; mb.box(add3(lerp3(S, E, .25), [side * .052 * rk, .012, 0]), [.008, .05, .042], { taper: [.95, .95], col: K(pcol, 1.0), tag: 'patch' });
    if (!rolled) { mb.tube([lerp3(E, W, .8), lerp3(E, W, .96)], [[.0455 * rk, .0445 * rk], [.0455 * rk, .0445 * rk]], { segs: 6, col: cl(function () { return .7; }), uv: ucl(.3, .06, true), tag: 'cuff2', capBot: .1, capTop: .1 }); mb.box(add3(lerp3(S, E, .42), [0, .052 * rk, 0]), [.052, .008, .075], { rot: eulerFromDir(norm3(sub3(E, S))), taper: [.95, .95], col: cl(function () { return .78; }), uv: ucl(.2, .2, false), tag: 'sleevepocket' }); }
    var armBand = lerp3(S, E, .62); mb.tube([lerp3(S, E, .54), lerp3(S, E, .7)], [[.0575 * rk, .0555 * rk], [.0575 * rk, .0555 * rk]], { segs: 9, col: K(D.teamCol, .9), tag: 'band', capBot: .1, capTop: .1 });
    if (D.ex.elbowpads) mb.ellipsoid(add3(E, [side * .008, -.004, .028]), [.05, .052, .035], { lat: 5, lon: 8, col: K(dk, G), tag: 'pad' });
    // hand + glove
    var d = norm3(sub3(wristT, W)); if (len3(sub3(wristT, W)) < .01) d = norm3(sub3(W, E));
    var gl = D.gloves, gcol2 = gl === 'none' ? mulc(D.skin, .95) : K(D.gloveCol, G), fing = gl === 'full' ? gcol2 : mulc(D.skin, .95), eu = eulerFromDir(d);
    mb.tube([add3(W, mul3(d, -.012)), add3(W, mul3(d, .004))], [[.042 * rk, .04 * rk], [.04 * rk, .04 * rk]], { segs: 7, col: gl === 'none' ? mulc(D.skin, .94) : K(mulc(D.gloveCol, .9), G), tag: 'cuff', capBot: 0, capTop: 0 });
    var lat = norm3([d[2], 0, -d[0]]); if (len3([d[2], 0, -d[0]]) < .05) lat = [1, 0, 0]; var up2 = norm3([lat[1] * d[2] - lat[2] * d[1], lat[2] * d[0] - lat[0] * d[2], lat[0] * d[1] - lat[1] * d[0]]); if (up2[1] < 0) up2 = mul3(up2, -1);
    handSpecs[side] = { wrist: W.slice(), direction: d.slice(), lateral: lat.slice(), normal: up2.slice(), gloveColor: gl === 'none' ? D.skin.slice() : D.gloveCol.slice(), skinColor: D.skin.slice(), style: gl, side: side };
    if (side < 0 && D.ex.watch) { mb.tube([lerp3(W, E, .1), lerp3(W, E, .22)], [[.0405 * rk, .04 * rk], [.0405 * rk, .04 * rk]], { segs: 8, col: K([.1, .1, .1], G), tag: 'watch', capBot: .1, capTop: .1 }); mb.box(add3(lerp3(W, E, .16), [0, .042, 0]), [.03, .008, .03], { col: K([.2, .24, .22], 1), tag: 'watch' }); }
  }
  function lerp3(a, c, t) { return [lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t)]; }
  // Keep Claude's original shoulder width and arm construction, but bake each
  // arm separately so Sightline's existing weapon-grip pose can move it.
  mb = new MB(); arm(1, [.222, 1.205, -.36], [.55, -1, .45]); armBuilders.right = mb;
  mb = new MB(); arm(-1, [.152, 1.268, -.468], [-.55, -1, .1]); armBuilders.left = mb;
  mb = bodyMB; D._armBuilders = armBuilders; D._armAnchors = armAnchors; D._armDefaults = armDefaults; D._handSpecs = handSpecs;

  // ---- head ----
  buildHeadBase(mb, D, Hd, q);
  var covered = D.head === 'helmet' || D.head === 'visor' || D.head === 'hood' || D.head === 'beanie' || D.head === 'cap' || D.head === 'boonie';
  buildHair(mb, D, Hd, q, covered);
  if (D.hair.style === 'braid') {
    var hc = D.hair.col, fz = function (y) { return frontZ(y) - .02; };
    [-1, 1].forEach(function (s) { if (D.id === 'skerry' && s < 0) return; if (D.id !== 'skerry' && D.id !== 'flint' && s < 0) return; var pts = []; for (var i = 0; i < 9; i++) { var t = i / 8, y = lerp(1.62, 1.28, t), x = lerp(.07, .1, t) * s, z = t < .35 ? lerp(.02, -.1, t / .35) : fz(y); pts.push([x, y, z]); } braidChain(mb, D, pts, .0155, .011, hc); });
  }
  buildBeard(mb, D, Hd, q); buildFaceCover(mb, D, Hd, q); buildHeadgear(mb, D, Hd, q, {});
  if (LA) {
    var AT = { shoulder: 1, sleeve: 1, cuff2: 1, sleevepocket: 1, band: 1, pad: 1, roll: 1, skin: 1, cuff: 1, hand: 1, finger: 1, thumb: 1, knuckle: 1, watch: 1, patch: 1 };
    for (var vi = 0; vi < mb.count(); vi++) {
      if (AT[mb.tag[vi]]) continue;
      var pp = leanPt([mb.P[vi * 3], mb.P[vi * 3 + 1], mb.P[vi * 3 + 2]]); mb.P[vi * 3 + 1] = pp[1]; mb.P[vi * 3 + 2] = pp[2];
      var w = smooth(.85, 1.15, mb.P[vi * 3 + 1]), ny = mb.N[vi * 3 + 1], nz = mb.N[vi * 3 + 2], a2 = LA * w, c2 = Math.cos(a2), s2 = Math.sin(a2);
      mb.N[vi * 3 + 1] = ny * c2 + nz * s2; mb.N[vi * 3 + 2] = nz * c2 - ny * s2;
    }
  }
  return mb;
}
function atlReg(reg) { return function () { return atl(reg, .5, .5); }; }

/* ---------- legs (right-hand form, hip pivot at the origin; left = mirror) ---------- */
function buildLegForm(D, q, o) {
  var mb = new MB(), b = D.build, f = D.sex === 'f', G = K_GRAIN, rnd = RNG(D.seed ^ 0x51ED), pk = b.hp * (b.bulk > 1.1 ? 1.06 : 1) * (f ? .98 : 1);
  var mud = [.25, .2, .14];
  var legCol = function (p, n, i, j, t) { var yw = .85 + p[1], dirt = 1 - smooth(.52, .02, yw), v = .9 - .06 * smooth(.4, .0, yw); v *= (1 - .13 * gauss((p[1] + .45) / .06) * Math.max(0, Math.sin(p[1] * 90 + p[2] * 25))) * (1 - .1 * gauss((p[1] + .04) / .07) * Math.max(0, Math.sin(p[1] * 60 - p[0] * 20 + 1))) * (1 - .09 * gauss((p[1] + .68) / .06) * Math.max(0, Math.sin(p[1] * 110))); var c = [v, v, v]; return mixc(c, mulc(mud, 1), dirt * .42); };
  var path = [[0, .02, 0], [0, -.18, -.006], [0, -.44, -.014], [0, -.62, -.002], [0, -.745, .01], [0, -.79, .012]];
  var rad = [[.108 * pk, .108 * pk], [.106 * pk, .103 * pk], [.084 * pk, .086 * pk], [.077 * pk, .08 * pk], [.084 * pk, .09 * pk], [.088 * pk, .092 * pk]];
  var off = [rnd() * .3, rnd() * .2];
  mb.tube(path, rad, { segs: QS(8, 11, q), seamDir: [-1, 0, 0], capBot: .1, capTop: .8, col: legCol, uv: uvCloth(.64, .75, true, off), tag: 'leg',
    wob: function (t, bb) { return 1 + .03 * gauss((t - .44) / .07) * Math.sin(bb * 2 + 2) + .015 * Math.sin(t * 21 + bb * 3) + .02 * gauss((t - .9) / .08) + .045 * gauss((t - .6) / .08) * smooth(-.4, .6, Math.sin(bb)) + .02 * gauss((t - .44) / .05); },
    ao: function (p, n) { return .92 + .08 * smooth(-.7, .7, n[1] + .4); } });
  mb.box([.065 * pk, -.03, .118 * pk], [.075, .08, .01], { rot: [.12, 0, 0], col: function (p) { return mulc(legCol(p, null, 0, 0, 0), .9); }, uv: uvCloth(.2, .2, false, [rnd() * .7, rnd() * .7]), tag: 'rearpocket' });
  mb.tube([[0, -.712, .01], [0, -.768, .012]], [[.097 * pk, .101 * pk], [.09 * pk, .094 * pk]], { segs: QS(8, 10, q), capBot: .3, capTop: .2, col: function (p) { return legCol(p, null, 0, 0, 0); }, uv: uvCloth(.5, .1, true, [rnd() * .4, rnd() * .6]), tag: 'blouse' });
  // cargo pocket
  mb.box([.103 * pk, -.275, .0], [.036, .15, .125], { taper: [.9, .92], col: function (p) { return legCol(p, null, 0, 0, 0); }, uv: uvCloth(.2, .2, false, [rnd() * .7, rnd() * .7]), tag: 'cargo' });
  mb.box([.1 * pk + .011, -.222, .0], [.04, .05, .13], { col: function (p) { return mulc(legCol(p, null, 0, 0, 0), .86); }, uv: uvCloth(.2, .2, false, [rnd() * .7, rnd() * .7]), tag: 'flap' });
  mb.box([.1 * pk + .0125, -.2, 0], [.01, .016, .016], { col: K([.35, .35, .33], K_METAL), tag: 'snap' });
  if (D.ex.kneepads) { var kc = K(dk2(), G); mb.box([0, -.455, -.082], [.13, .16, .06], { taper: [.88, .8], col: kc, uv: uvPlanar('grain'), tag: 'kneepad' }); mb.ellipsoid([0, -.455, -.116], [.058, .072, .026], { lat: 6, lon: 9, col: K([.07, .075, .07], G), uv: uvPlanar('grain'), tag: 'kneecap' }); mb.box([0, -.37, -.07], [.11, .025, .04], { col: kc, uv: uvPlanar('grain'), tag: 'kneepad' }); mb.tube([[-.092, -.43, -.01], [-.0, -.43, -.1], [.092, -.43, -.01]], [[.007, .004], [.007, .004], [.007, .004]], { segs: 4, col: kc, tag: 'strap', ao: function () { return 1; } }); }
  if (o.holster) { mb.box([.128 * pk, -.2, -.0], [.042, .17, .1], { col: K([.1, .1, .1], G), uv: uvPlanar('grain'), tag: 'holster' }); mb.box([.128 * pk, -.1, .02], [.034, .07, .056], { rot: [-.15, 0, 0], col: K([.12, .12, .12], G), tag: 'grip' }); }
  if (o.knife) { mb.box([.083 * pk + .01, -.6, -.04], [.016, .14, .03], { rot: [.0, 0, .02], col: K([.09, .09, .09], G), tag: 'knife' }); mb.box([.083 * pk + .01, -.52, -.04], [.02, .06, .034], { col: K([.05, .05, .05], G), tag: 'knife' }); }
  // boot
  var bc = K(D.boot, G), bcl = function (p) { var yw = .85 + p[1], dirt = 1 - smooth(.3, .0, yw); return mixc(bc, [.36, .3, .22], dirt * .35); };
  mb.tube([[0, -.735, .012], [0, -.8, .014]], [[.074, .078], [.072, .076]], { segs: QS(8, 10, q), capBot: 0, capTop: 0, col: bcl, uv: uvPlanar('grain'), tag: 'boot' });
  mb.tube([[0, -.8, .082], [0, -.807, .028], [0, -.815, -.03], [0, -.822, -.1], [0, -.826, -.155], [0, -.827, -.197]], [[.05, .054], [.06, .048], [.06, .04], [.055, .033], [.047, .028], [.035, .022]], { segs: QS(8, 10, q), side: [1, 0, 0], capBot: .8, capTop: 1.4, col: bcl, uv: uvPlanar('grain'), tag: 'boot' });
  mb.box([0, -.843, -.052], [.106, .014, .29], { taper: [.97, .9], col: K([.045, .045, .045], G), uv: uvPlanar('grain'), tag: 'sole' });
  mb.box([0, -.842, .085], [.095, .016, .06], { col: K([.04, .04, .04], G), tag: 'heel' });
  [0, 1, 2].forEach(function (k) { mb.box([0, -.745 + k * .0, -.056 + 0], [.0, .0, .0], {}); });
  if (D.stance) for (var li = 0; li < mb.count(); li++) mb.P[li * 3] += D.stance;
  return mb;
  function dk2() { return [.12, .125, .12]; }
}

/* ---------- the Hollowed (zombie kit) ---------- */
var ZLEAN = { walker: -.28, sprinter: -.5, brute: -.2, spitter: -.12 };
function zombieDesign(op) {
  var seed = hashStr(op.id), r = RNG(seed), t = op.ztype, skin = hex(op.skin), v = /-1$/.test(op.id) ? 1 : 0;
  var D = { id: op.id, seed: seed, rnd: r, sex: 'm', zombie: true, ztype: t, op: op, age: .85, head: 'none', cover: 'bare', helm: 'ach', ex: {}, kit: { vest: 'none', pack: 'none' } };
  var big = t === 'brute', thin = t === 'sprinter';
  D.build = { sh: big ? 1.4 : thin ? .9 : 1.0, ch: big ? 1.4 : thin ? .8 : 1.0, wa: big ? 1.35 : thin ? .72 : 1.0, hp: big ? 1.2 : thin ? .85 : 1.0, arm: big ? 1.55 : thin ? .8 : 1.0, bulk: big ? 1.35 : thin ? .75 : 1.0, head: big ? .92 : 1.0 };
  D.face = { jaw: thin ? .78 : .92, chin: thin ? .85 : .95, cheek: .72, brow: 1.25, noseL: 1.0, noseW: .9, noseH: .8, lip: .6, eye: 1.18, eyeSp: 1.0, ear: 1.05, len: thin ? 1.08 : 1.02, wid: big ? 1.1 : .95, eyeCol: [.78, 1, .9], browT: .4, arch: .2, stubble: 0, freckle: 0, dirt: 1, scar: { x1: r.range(-.05, .03), y1: r.range(.0, .06), x2: r.range(-.03, .05), y2: r.range(-.06, -.01), col: .8 } };
  D.skin = mulc(desat(skin, .55), .5); D.hairCol = hex('#2a2a24'); D.hair = { style: (t === 'brute' || r.chance(.4)) ? 'bald' : r.pick(['crop', 'short', 'long', 'bob']), col: mixc(hex('#2a2a24'), [.5, .5, .48], r.range(0, .6)) };
  D.beard = null; D.uni = op.uni.map(function (c) { return desat(hex(c), .15); }); D.camo = 'solid';
  D.vest = hex('#2a2a28'); D.gear = hex('#2a2a28'); D.teamCol = hex('#46d9a8'); D.scarfCol = hex('#2a2a28'); D.boot = hex('#17130f'); D.gloveCol = hex('#2a2a28'); D.gloves = 'none'; D.sleeves = 'long'; D.v = v;
  D.bone = [.82, .78, .66]; D.flesh = [.26, .09, .08]; D.bloom = [.28, 1.0, .78];
  return D;
}
function paintZFaceOverlay(g, D, rnd) {
  g.save(); g.beginPath(); g.rect(-.1, -.12, .2, .24); g.clip();
  var F = D.face, ex = .032 * F.eyeSp, ey = .013;
  [-1, 1].forEach(function (s) {
    var cx = s * ex, sg = g.createRadialGradient(cx, ey, .002, cx, ey, .026); sg.addColorStop(0, 'rgba(8,6,6,.92)'); sg.addColorStop(.7, 'rgba(18,10,10,.55)'); sg.addColorStop(1, 'rgba(18,10,10,0)'); g.fillStyle = sg; g.fillRect(cx - .03, ey - .03, .06, .06);
    var eg = g.createRadialGradient(cx, ey, .0005, cx, ey, .0085); eg.addColorStop(0, 'rgba(235,255,248,1)'); eg.addColorStop(.5, 'rgba(120,255,215,.95)'); eg.addColorStop(1, 'rgba(60,220,170,0)'); g.fillStyle = eg; g.beginPath(); g.arc(cx, ey, .0085, 0, TAU); g.fill();
  });
  g.fillStyle = 'rgba(16,6,6,.88)'; g.beginPath(); g.ellipse(0, -.069, .016, .0075, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(218,208,180,.85)'; for (var k = -3; k <= 3; k++) g.fillRect(k * .0042 - .0018, -.0635, .0034, .0028);
  g.strokeStyle = 'rgba(70,217,168,.55)'; g.lineWidth = .0009;
  for (var v = 0; v < 8; v++) { var x0 = (rnd() - .5) * .12, y0 = (rnd() - .5) * .16; g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + (rnd() - .5) * .03, y0 + .02, x0 + (rnd() - .5) * .04, y0 + .04, x0 + (rnd() - .5) * .05, y0 + .07); g.stroke(); }
  for (var w = 0; w < 5; w++) { var wx = (rnd() - .5) * .1, wy = (rnd() - .5) * .14; var wg = g.createRadialGradient(wx, wy, 0, wx, wy, .008 + rnd() * .008); wg.addColorStop(0, 'rgba(90,20,18,.8)'); wg.addColorStop(1, 'rgba(90,20,18,0)'); g.fillStyle = wg; g.beginPath(); g.arc(wx, wy, .016, 0, TAU); g.fill(); }
  g.restore();
}
function bloomSpike(mb, D, base, dir, len, r, tagN) {
  var d = norm3(dir), tip = add3(base, mul3(d, len)), mid = add3(base, mul3(d, len * .55)); mid = add3(mid, [(D.rnd() - .5) * .03, (D.rnd() - .5) * .03, (D.rnd() - .5) * .03]);
  mb.tube([base, mid, tip], [[r, r * .85], [r * .6, r * .5], [.0015, .0015]], { segs: 4, capBot: 0, capTop: 0, col: function (p, n, i, j, t) { return K(D.bloom, .72 + .5 * t); }, tag: 'bloom', ao: function () { return 1; } });
}
function buildZombie(D, q) {
  var t = D.ztype, lean = ZLEAN[t], mb = new MB(), Hd = makeHead(D), b = D.build, rnd = D.rnd, G = K_GRAIN;
  var big = t === 'brute', thin = t === 'sprinter', sp = t === 'spitter', ragC = [1, 1, 1], skinC = D.skin, fleshC = D.flesh, boneC = D.bone;
  var cl = function (shade) { return function (p) { var v = shade(p); return [v, v, v]; }; };
  var cu = function (eu, ev, e2) { return uvCloth(eu, ev, e2, [rnd() * (1 - eu), rnd() * (1 - ev)]); };
  var segs = QS(8, 11, q);
  // torso: ragged cloth over a hollow chest
  var torsoSecs = [{ y: .775, rx: .19 * b.hp, rz: .118, n: 2.4 }, { y: .9, rx: .185 * b.hp, rz: .117 }, { y: 1.02, rx: .15 * b.wa, rz: .098 * Math.min(1.2, b.wa) }, { y: 1.16, rx: .168 * b.ch, rz: .106 * b.ch }, { y: 1.3, rx: .19 * b.ch * b.sh, rz: .115 * b.ch }, { y: 1.4, rx: .2 * b.sh, rz: .108 }, { y: 1.46, rx: .18 * b.sh, rz: .092 }, { y: 1.505, rx: .1, rz: .078 }, { y: 1.54, rx: .06, rz: .06 }];
  mb.loft(torsoSecs, { segs: segs, seam: PI, capBot: .3, capTop: .4, col: thin ? function (p) { return mulc(skinC, .95); } : function (p) { var y = p[1], v = (.72 + .16 * smooth(.78, 1.1, y)) * (1 - .12 * gauss((y - 1.02) / .06) * Math.max(0, Math.sin(p[0] * 70))) * (1 - .1 * gauss((y - 1.2) / .15) * Math.max(0, Math.sin(p[0] * 38 + y * 30))); var st = Math.max(0, Math.sin(p[0] * 17 + y * 9) * Math.sin(y * 23 - p[0] * 11)); var c = [v, v, v]; return mixc(c, [.3, .08, .06], .55 * st * st * smooth(.9, 1.4, y)); }, uv: thin ? undefined : cu(.86, .7, false), tag: 'torso',
    wob: function (tt, bb) { return 1 + .03 * Math.sin(bb * 5 + tt * 13) + .02 * Math.sin(bb * 11 - tt * 7); } });
  // torn shirt for the lean one; exposed ribs on the rest
  if (thin) { mb.loft([{ y: 1.12, rx: .16, rz: .105 }, { y: 1.3, rx: .185, rz: .118 }, { y: 1.41, rx: .196, rz: .11 }], { segs: segs, seam: PI, capBot: 0, capTop: 0, col: cl(function () { return .7; }), uv: cu(.8, .3, false), tag: 'rag', wob: function (tt, bb) { return 1.012 + .03 * Math.sin(bb * 6 + tt * 9) * (1 + Math.cos(bb)); } }); }
  var zf = function (y) { return -(lerpSecs(torsoSecs, y, 'rz')); };
  mb.box([.03, 1.25, zf(1.25) - .003], [.12 * b.ch, .12, .006], { rot: [0, 0, .25], col: fleshC, tag: 'flesh', taper: [.9, 1] }); mb.box([.06, 1.2, zf(1.2) - .004], [.08 * b.ch, .1, .006], { rot: [0, 0, -.4], col: mulc(fleshC, .6), tag: 'flesh' }); mb.box([-.05, 1.29, zf(1.29) - .004], [.06, .05, .006], { rot: [0, 0, .7], col: mulc(fleshC, .75), tag: 'flesh' });
  for (var rg = 0; rg < 7; rg++) { var rx = (rg - 3) * .05 * b.hp, rl = .1 + rnd() * .12; mb.box([rx, .9 - rl / 2 + .02, zf(.9) - .006 + Math.abs(rx) * .12], [.034, rl, .004], { rot: [(rnd() - .5) * .3, 0, (rnd() - .5) * .3], col: cl(function () { return .6; }), uv: cu(.1, .1, false), tag: 'tatter' }); }
  for (var rb = 0; rb < 4; rb++) { var ry = 1.33 - rb * .045, rw = (.1 - rb * .004) * b.ch; mb.tube([[-rw, ry, zf(ry) + .006], [-rw * .5, ry - .004, zf(ry) - .006], [0, ry - .006, zf(ry) - .007], [rw * .5, ry - .004, zf(ry) - .006], [rw, ry, zf(ry) + .006]], [[.0045, .0045], [.0045, .0045], [.0045, .0045], [.0045, .0045], [.0045, .0045]], { segs: 4, capBot: 0, capTop: 0, col: boneC, tag: 'bone', ao: function () { return 1; } }); }
  mb.loft([{ y: .93, rx: .19 * b.hp, rz: .124 }, { y: .99, rx: .187 * b.hp, rz: .122 }], { segs: segs, capBot: .1, capTop: .1, col: cl(function () { return .5; }), uv: cu(.5, .1, false), tag: 'belt', seam: PI });
  // arms: reaching, cloth sleeve to the elbow then wasted skin
  var J = { walker: [[.22, 1.43, 0, .3, 1.3, -.2, .22, 1.4, -.46], [-.22, 1.43, 0, -.31, 1.22, -.12, -.24, 1.05, -.34]], sprinter: [[.2, 1.42, 0, .23, 1.2, .1, .2, 1.0, -.12], [-.2, 1.42, 0, -.26, 1.28, -.2, -.2, 1.2, -.46]], brute: [[.3, 1.45, 0, .4, 1.2, -.12, .36, .98, -.28], [-.3, 1.45, 0, -.42, 1.28, -.1, -.38, 1.1, -.32]], spitter: [[.2, 1.42, 0, .26, 1.25, -.15, .2, 1.2, -.4], [-.2, 1.42, 0, -.26, 1.25, -.15, -.2, 1.18, -.38]] }[t];
   var rk = b.arm * (big ? 1 : 1) * 1.22;
  J.forEach(function (a, ai) {
    var S = [a[0], a[1], a[2]], E = [a[3], a[4], a[5]], W = [a[6], a[7], a[8]], side = ai ? -1 : 1;
    mb.ellipsoid(S, [.06 * rk, .058 * rk, .058 * rk], { lat: 5, lon: 7, col: thin ? skinC : [.75, .75, .75], uv: thin ? undefined : cu(.2, .2, false), tag: 'shoulder' });
    mb.tube([S, add3(S, mul3(sub3(E, S), .5)), E], [[.052 * rk, .05 * rk], [.047 * rk, .045 * rk], [.042 * rk, .04 * rk]], { segs: 7, seamDir: [-side, 0, .2], col: thin ? mulc(skinC, .95) : cl(function () { return .78; }), uv: thin ? undefined : cu(.3, .4, true), tag: 'sleeve', capBot: .1, capTop: .1, wob: function (tt, bb) { return 1 + .04 * Math.sin(tt * 15 + bb * 2); } });
    mb.tube([E, add3(E, mul3(sub3(W, E), .5)), W], [[.04 * rk, .038 * rk], [.034 * rk, .032 * rk], [.03 * rk, .028 * rk]], { segs: 7, col: function (p, n, i, j, tt) { var vn = Math.max(0, Math.sin(j * 2.3 + tt * 9)); return mixc(mixc(skinC, fleshC, .25 * smooth(.3, 1, tt)), mulc(D.bloom, .45), .28 * vn * vn); }, tag: 'skin', capBot: .1, capTop: .1 });
    var d = norm3(sub3(W, E)), cl2 = [];
    for (var f = -1.5; f <= 1.5; f += 1) { var fp = add3(add3(W, mul3(d, .01)), [f * .013, -.004 * Math.abs(f), 0]); mb.tube([fp, add3(fp, add3(mul3(d, .05), [f * .004, -.012, 0])), add3(fp, add3(mul3(d, .095), [f * .007, -.03, 0]))], [[.0105, .009], [.0078, .0068], [.0022, .0022]], { segs: 4, capBot: .5, capTop: 0, col: function (p, n, i, j, tt) { return mixc(skinC, boneC, smooth(.5, 1, tt)); }, tag: 'claw', ao: function () { return 1; } }); }
  });
  // head (gaunt, jaw hung a little)
  buildHeadBase(mb, D, Hd, q);
  if (D.hair.style !== 'bald') { var hs = D.hair.style; var yEnd = hs === 'long' ? yEndFn(.4, -.6, -.7) : yEndFn(.5, .15, -.4); capShell(mb, Hd, { cols: QS(12, 18, q), rows: 5, yEnd: yEnd, thick: hs === 'long' ? .014 : .008, col: hairColFn(D.hair.col, 1.0), uv: uvReg('hair', 1, 1), tag: 'hair', warp: function (p, al, y, tt, aa) { var k = Math.sin(al * 5 + y * 8); return [p[0] + k * .006, p[1], p[2]]; } }); }
  mb.box([0, Hd.C[1] - .098, Hd.C[2] - .018], [.07, .014, .06], { col: mulc(skinC, .8), tag: 'jaw' });
  // blooms
  var bl = { walker: 3, sprinter: 2, brute: 7, spitter: 3 }[t];
  for (var i = 0; i < bl; i++) { var ang = lerp(-.8, .8, bl > 1 ? i / (bl - 1) : .5) + (rnd() - .5) * .2, by = 1.4 - (i % 2) * .1; bloomSpike(mb, D, [Math.sin(ang) * .18 * b.sh, by, .1 + Math.cos(ang) * .03], [Math.sin(ang) * .5, .8 + rnd() * .3, .5], (big ? .26 : .17) + rnd() * .1, big ? .034 : .024); }
  if (big) { mb.ellipsoid([-.4, 1.46, -.02], [.14, .11, .13], { lat: 6, lon: 8, col: function (p) { return K(D.bloom, .55 + .25 * Math.sin(p[0] * 40 + p[1] * 30)); }, tag: 'bloom' }); for (var k2 = 0; k2 < 4; k2++) bloomSpike(mb, D, [-.4 + (rnd() - .5) * .14, 1.52 + (rnd() - .5) * .06, -.02 + (rnd() - .5) * .1], [-.8 + rnd() * .4, .8, rnd() - .5], .13 + rnd() * .1, .026); [-1, 1].forEach(function (s) { mb.box([s * .42, 1.47, -.05], [.26, .16, .24], { rot: [0, 0, s * .35], col: K([.11, .11, .1], G), tag: 'plate' }); }); }
  if (sp) { mb.ellipsoid([0, 1.53, -.03], [.085, .07, .08], { lat: 6, lon: 9, col: function (p) { return K(D.bloom, .62 + .22 * Math.sin(p[0] * 60 + p[1] * 50)); }, tag: 'sac' }); mb.ellipsoid([0, 1.1, zf(1.1) - .01], [.15, .12, .08], { lat: 5, lon: 8, col: mulc(fleshC, 1.1), tag: 'belly' }); }
  // lean the whole upper body about the hips
  var s0 = Math.sin(lean), c0 = Math.cos(lean), pv = .85;
  for (var vi = 0; vi < mb.count(); vi++) {
    var y = mb.P[vi * 3 + 1] - pv, z = mb.P[vi * 3 + 2]; mb.P[vi * 3 + 1] = pv + y * c0 - z * s0; mb.P[vi * 3 + 2] = y * s0 + z * c0;
    var ny = mb.N[vi * 3 + 1], nz = mb.N[vi * 3 + 2]; mb.N[vi * 3 + 1] = ny * c0 - nz * s0; mb.N[vi * 3 + 2] = ny * s0 + nz * c0;
  }
  var legR = buildZLeg(D, q, true), legL = buildZLeg(D, q, false).mirrored();
  return { body: mb, legR: legR, legL: legL };
}
function buildZLeg(D, q, right) {
  var mb = new MB(), t = D.ztype, b = D.build, pk = (t === 'brute' ? 1.25 : t === 'sprinter' ? .8 : 1), rnd = RNG(D.seed ^ (right ? 77 : 99)), skinC = D.skin, G = K_GRAIN;
  var barefoot = D.v === 1 || t === 'sprinter', mud = [.22, .18, .13], bone = D.bone, fl = D.flesh;
  var segs = QS(7, 10, q);
  var hem = right ? -.36 : -.3 - rnd() * .12;
  var pcol = function (p) { var y = p[1], v = .7 * (1 - .12 * gauss((y + .04) / .07) * Math.max(0, Math.sin(y * 60 + 1))) * (1 - .1 * gauss((y + .3) / .1) * Math.max(0, Math.sin(y * 85 + p[2] * 20))); var d = 1 - smooth(.6, .2, .85 + y); return mixc(mixc([v, v, v], mud, d * .5), [.3, .08, .06], .5 * Math.max(0, Math.sin(p[0] * 31 + y * 12)) * Math.max(0, Math.sin(y * 17 - p[2] * 14)) * smooth(-.05, -.3, y)); };
  mb.tube([[0, .02, 0], [0, -.2, -.01], [0, hem + .02, -.025]], [[.104 * pk, .104 * pk], [.098 * pk, .098 * pk], [.088 * pk, .09 * pk]], { segs: segs, seamDir: [-1, 0, 0], capBot: 0, capTop: .8, col: pcol, uv: uvCloth(.6, .4, true, [rnd() * .3, rnd() * .5]), tag: 'leg', wob: function (tt, bb) { return 1 + .05 * Math.sin(tt * 19 + bb * 3) + .05 * smooth(.8, 1, tt) * Math.sin(bb * 7); } });
  for (var k = 0; k < 6; k++) { var ang = k / 6 * TAU, rr = .092 * pk; mb.box([Math.sin(ang) * rr, hem - .02 - rnd() * .03, -.025 + Math.cos(ang) * rr], [.03, .05 + rnd() * .06, .004], { rot: [(rnd() - .5) * .4, ang, (rnd() - .5) * .3], col: function () { return [.5, .5, .5]; }, uv: uvCloth(.1, .1, false, [rnd() * .8, rnd() * .8]), tag: 'tatter' }); }
  var shinC = function (p, n, i, j, tt) { var vn = Math.max(0, Math.sin(j * 2.1 + tt * 11)); var c = mixc(skinC, mud, .4 * (1 - smooth(.5, .1, .85 + p[1]))); c = mixc(c, mulc(D.bloom, .4), .22 * vn * vn); return mixc(c, fl, .35 * gauss((tt - .35) / .12) * Math.max(0, Math.sin(j * 1.3))); };
  mb.tube([[0, hem + .04, -.03], [0, -.58, -.012], [0, -.7, .004], [0, -.78, .012]], [[.07 * pk, .072 * pk], [.058 * pk, .06 * pk], [.046 * pk, .046 * pk], [.042 * pk, .042 * pk]], { segs: segs, capBot: .2, capTop: 0, col: shinC, tag: 'shin', wob: function (tt, bb) { return 1 + .06 * gauss((tt - .25) / .15) * smooth(-.4, .8, -Math.cos(bb)) + .02 * Math.sin(tt * 23 + bb * 2); } });
  mb.tube([[0, -.5, -.062 * pk], [0, -.44, -.058 * pk]], [[.007, .006], [.007, .006]], { segs: 4, col: bone, tag: 'bone', capBot: 0, capTop: 0, ao: function () { return 1; } });
  mb.tube([[0, -.56, -.055 * pk], [0, -.64, -.05 * pk]], [[.009, .008], [.008, .007]], { segs: 4, col: bone, tag: 'bone', capBot: 0, capTop: 0, ao: function () { return 1; } });
  var fc = barefoot ? mixc(skinC, mud, .35) : K(D.boot, G);
  mb.tube([[0, -.8, .075], [0, -.807, .02], [0, -.815, -.04], [0, -.822, -.11], [0, -.826, -.16]], [[.043 * pk, .048], [.05 * pk, .042], [.05 * pk, .034], [.046 * pk, .028], [.036 * pk, .022]], { segs: QS(7, 9, q), side: [1, 0, 0], capBot: .8, capTop: 1.2, col: fc, uv: barefoot ? undefined : uvPlanar('grain'), tag: 'foot' });
  if (barefoot) for (var ti = -2; ti <= 2; ti++) mb.ellipsoid([ti * .0155 * pk - .005, -.826, -.175 - (2 - Math.abs(ti)) * .004 + (ti === -2 ? .012 : 0)], [.0095, .0085, .02], { lat: 4, lon: 6, col: mixc(fc, bone, ti === 0 ? .5 : .3), tag: 'toe' });
  if (!barefoot) mb.box([0, -.843, -.045], [.1, .014, .27], { col: K([.04, .04, .04], G), tag: 'sole' });
  return mb;
}

/* ---------- bake entry: same contract as the game's bakeOp() ---------- */
function detailLevel() {
  var touch = false;
  try { touch = typeof document !== 'undefined' && document.documentElement.classList.contains('touch-device'); } catch (e) {}
  if (!touch) return .85;
  try { if ((navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)) return .35; } catch (e) {}
  return .55;
}
var QUALITY = null;
function bake(op, T) {
  var q = QUALITY === null ? detailLevel() : QUALITY, doc = document; CURQ = q;
  var body, legR, legL, D;
  if (op.zombie) { if (typeof buildZombie !== 'function') throw new Error('zombie kit unavailable'); D = zombieDesign(op); var zb = buildZombie(D, q); body = zb.body; legR = zb.legR; legL = zb.legL; }
  else {
    D = designFor(op); D.q = q; if (D.ex.holster) D.ex.legHolster = 1;
    var Hd = makeHead(D);
    body = buildBody(D, q, Hd);
    legR = buildLegForm(D, q, { holster: !!D.ex.holster, knife: false });
    legL = buildLegForm(D, q, { holster: false, knife: !!D.ex.legknife }).mirrored();
  }
  if (global.__CR_DEBUG) global.__crLast = { body: body, legR: legR };
  var bg = body.toGeometry(T), gR = legR.toGeometry(T), gL = legL.toGeometry(T), bb = bg.boundingBox;
  var armR = D._armBuilders && D._armBuilders.right ? D._armBuilders.right.toGeometry(T, ['hand', 'finger', 'thumb', 'knuckle']) : null;
  var armL = D._armBuilders && D._armBuilders.left ? D._armBuilders.left.toGeometry(T, ['hand', 'finger', 'thumb', 'knuckle']) : null;
  if (armR && D._armAnchors && D._armAnchors[1]) armR.translate(-D._armAnchors[1][0], -D._armAnchors[1][1], -D._armAnchors[1][2]);
  if (armL && D._armAnchors && D._armAnchors[-1]) armL.translate(-D._armAnchors[-1][0], -D._armAnchors[-1][1], -D._armAnchors[-1][2]);
  function handPose(side) { var h = D._handSpecs && D._handSpecs[side], a = D._armAnchors && D._armAnchors[side]; if (!h || !a) return null; return { offset: [h.wrist[0] - a[0], h.wrist[1] - a[1], h.wrist[2] - a[2]], direction: h.direction, lateral: h.lateral, normal: h.normal, gloveColor: h.gloveColor, skinColor: h.skinColor, style: h.style, side: side }; }
  if (!(bg.attributes.position.count > 100) || !(bb.max.y > 1.5 && bb.max.y < 2.3 && bb.min.y > -0.1)) throw new Error('character bake sanity failed (' + op.id + ') n=' + bg.attributes.position.count + ' y=' + bb.min.y.toFixed(3) + '..' + bb.max.y.toFixed(3));
  var atlas = paintAtlas(D, doc), tex = new T.CanvasTexture(atlas); tex.anisotropy = 4;
  var mat = new T.MeshLambertMaterial({ map: tex, vertexColors: true }), hurt = new T.MeshLambertMaterial({ map: tex, vertexColors: true, emissive: 0x992211 });
  if (op.zombie) mat = new T.MeshLambertMaterial({ map: tex, vertexColors: true, emissive: 0x04140f });
  return { body: bg, legL: gL, legR: gR, armR: armR, armL: armL, handR: handPose(1), handL: handPose(-1),
    armRAnchor: D._armAnchors && D._armAnchors[1], armLAnchor: D._armAnchors && D._armAnchors[-1],
    armRDefault: D._armDefaults && D._armDefaults[1], armLDefault: D._armDefaults && D._armDefaults[-1],
    mat: mat, hurt: hurt, kit: 'claude-original-v12.8-arm-pose-adapter', sourceVersion: '12.8' };
}
global.SightlineClaudeCharacterV128 = { bake: bake, designFor: designFor, version: '12.8', setQuality: function (v) { QUALITY = v; } };

})(typeof window !== 'undefined' ? window : this);

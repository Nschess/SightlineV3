/* Sightline realistic firearm kit (P11.6).
   Replaces the shared box-template bodies with distinct, real-world-archetype first-person
   models. Cosmetic only: damage, spread, recoil, rpm, reload timing, ADS and hitboxes are
   untouched. Hands, magazine/pump/charging-handle animation groups, muzzle anchor, optic
   mounting and finish tinting keep the contract the game already uses. */
(function (global) {
'use strict';
var T = global.THREE; if (!T) return;
var HP = Math.PI / 2;

/* ---------- procedural textures / environment (built once) ---------- */
function canvasTex(w, h, draw, rx, ry) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; if (rx) t.repeat.set(rx, ry || rx);
  return t;
}
function rnd(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
var texCache = {};
function bumpFine() { // parkerized / anodised micro grain
  return texCache.fine || (texCache.fine = canvasTex(128, 128, function (g, w, h) {
    var r = rnd(7); g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 5200; i++) { var v = 90 + (r() * 110) | 0; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(r() * w, r() * h, 1.2, 1.2); }
  }, 6, 6));
}
function bumpStipple() { // polymer texture
  return texCache.stip || (texCache.stip = canvasTex(128, 128, function (g, w, h) {
    var r = rnd(11); g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) { g.fillStyle = r() < .5 ? '#555' : '#d0d0d0'; g.beginPath(); g.arc(r() * w, r() * h, 1.6 + r() * 1.2, 0, 6.3); g.fill(); }
  }, 4, 4));
}
function bumpBrushed() {
  return texCache.brush || (texCache.brush = canvasTex(128, 64, function (g, w, h) {
    var r = rnd(5); g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 260; i++) { var v = 70 + (r() * 150) | 0; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, r() * h, w, 1); }
  }, 6, 3));
}
function woodTex() {
  return texCache.wood || (texCache.wood = canvasTex(256, 128, function (g, w, h) {
    var r = rnd(23); g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 90; i++) {
      var y = r() * h, a = 0.05 + r() * .14, dark = r() < .55;
      g.strokeStyle = dark ? 'rgba(48,26,12,' + a + ')' : 'rgba(190,140,86,' + a + ')'; g.lineWidth = .6 + r() * 2.2;
      g.beginPath(); g.moveTo(0, y);
      for (var x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * .03 + i) * (2 + r() * 4));
      g.stroke();
    }
    for (var k = 0; k < 6; k++) { g.fillStyle = 'rgba(40,22,10,.18)'; g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 10, 1.5 + r() * 2, 0, 0, 6.3); g.fill(); }
  }, 1, 1));
}
function envCube() {
  if (texCache.env) return texCache.env;
  function face(top, mid, bot) { var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, top); gr.addColorStop(.48, mid); gr.addColorStop(.52, '#2b2f33'); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(6, 4, 9, 4); return c; }
  var side = face('#9fb6cf', '#e3e6e2', '#14171a'), up = document.createElement('canvas'); up.width = up.height = 32;
  var ug = up.getContext('2d'); ug.fillStyle = '#c6d6e8'; ug.fillRect(0, 0, 32, 32); ug.fillStyle = '#fff'; ug.fillRect(10, 10, 12, 12);
  var dn = document.createElement('canvas'); dn.width = dn.height = 32; dn.getContext('2d').fillStyle = '#16181a'; dn.getContext('2d').fillRect(0, 0, 32, 32);
  var ct = new T.CubeTexture([side, side, up, dn, side, side]); ct.needsUpdate = true; return (texCache.env = ct);
}

/* ---------- materials ---------- */
var MATS = null;
function mats() {
  if (MATS) return MATS;
  var env = envCube();
  function P(o) { var m = new T.MeshPhongMaterial(o); return m; }
  MATS = {
    steel: P({ color: 0x2b3034, shininess: 90, specular: 0x9aa3ab, bumpMap: bumpBrushed(), bumpScale: .004, envMap: env, reflectivity: .38 }),
    blk: P({ color: 0x1b1e21, shininess: 60, specular: 0x5d656c, bumpMap: bumpFine(), bumpScale: .004, envMap: env, reflectivity: .2 }),
    poly: P({ color: 0x1d2226, shininess: 14, specular: 0x2e353a, bumpMap: bumpStipple(), bumpScale: .006, envMap: env, reflectivity: .06 }),
    rubber: P({ color: 0x101213, shininess: 4, specular: 0x111111, bumpMap: bumpStipple(), bumpScale: .02 }),
    wood: P({ color: 0xffffff, map: woodTex(), shininess: 34, specular: 0x4a3626, envMap: env, reflectivity: .08 }),
    brass: P({ color: 0xa88a4a, shininess: 100, specular: 0xf0d58a, envMap: env, reflectivity: .4 }),
    dark: new T.MeshBasicMaterial({ color: 0x07080a }),
    glass: P({ color: 0x1d3a4e, shininess: 140, specular: 0xffffff, transparent: true, opacity: .45, depthWrite: false, envMap: env, reflectivity: .5 }),
    smoke: P({ color: 0x2b3238, shininess: 90, specular: 0xaaaaaa, transparent: true, opacity: .62, depthWrite: false, envMap: env, reflectivity: .25 }),
    red: new T.MeshBasicMaterial({ color: 0xc8221a })
  };
  return MATS;
}
var toneCache = {};
function tone(hex, kind) { // mid-brightness body colour (finish system tints these as "metal")
  var k = hex + ':' + (kind || 'poly');
  if (toneCache[k]) return toneCache[k];
  var m = new T.MeshPhongMaterial(kind === 'metal'
    ? { color: hex, shininess: 70, specular: 0x8f979d, bumpMap: bumpFine(), bumpScale: .004, envMap: envCube(), reflectivity: .26 }
    : { color: hex, shininess: 16, specular: 0x30363a, bumpMap: bumpStipple(), bumpScale: .006, envMap: envCube(), reflectivity: .07 });
  return (toneCache[k] = m);
}

/* ---------- geometry ---------- */
var boxCache = {}, flatCache = {};
function flat(w, h, d) { var k = [w, h, d].map(function (n) { return Math.round(n * 10000); }).join('_'); return flatCache[k] || (flatCache[k] = new T.BoxGeometry(w, h, d)); }
function rgeo(w, h, d, r) {
  r = Math.min(r == null ? .005 : r, w * .45, h * .45, d * .45);
  if (r < .002) return flat(w, h, d);
  var k = [w, h, d, r].map(function (n) { return Math.round(n * 10000); }).join('_');
  if (boxCache[k]) return boxCache[k];
  var g = new T.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, n = g.attributes.normal;
  var hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new T.Vector3();
  function remap(val, half, inner) { var a = Math.abs(val); var s = val < 0 ? -1 : 1; return a > half * .99 ? s * half : (a > 1e-9 ? s * inner : 0); }
  for (var i = 0; i < p.count; i++) {
    var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // 3 segments => coords at +-half and +-half/3 : move the inner ring to the bevel boundary
    x = remap(x, w / 2, hx); y = remap(y, h / 2, hy); z = remap(z, d / 2, hz);
    var ix = Math.max(-hx, Math.min(hx, x)), iy = Math.max(-hy, Math.min(hy, y)), iz = Math.max(-hz, Math.min(hz, z));
    v.set(x - ix, y - iy, z - iz); var l = v.length();
    if (l > 1e-7) { v.divideScalar(l); p.setXYZ(i, ix + v.x * r, iy + v.y * r, iz + v.z * r); n.setXYZ(i, v.x, v.y, v.z); }
    else p.setXYZ(i, x, y, z);
  }
  p.needsUpdate = true; n.needsUpdate = true;
  return (boxCache[k] = g);
}
var profCache = {};
function profGeo(pts, w, bev, holes) {
  var key = JSON.stringify([pts, w, bev, holes || 0]);
  if (profCache[key]) return profCache[key];
  function path(sh, list) {
    list.forEach(function (p, i) {
      var x = -p[0], y = p[1];
      if (i === 0) sh.moveTo(x, y);
      else if (p.length === 4) sh.quadraticCurveTo(-p[2], p[3], x, y);
      else sh.lineTo(x, y);
    });
  }
  var sh = new T.Shape(); path(sh, pts);
  (holes || []).forEach(function (h) { var hp = new T.Path(); path(hp, h); sh.holes.push(hp); });
  var depth = Math.max(.002, w - 2 * bev);
  var g = new T.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * .9, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2); g.rotateY(HP); g.computeVertexNormals();
  var uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 20, uv.getY(i) * 20);
  return (profCache[key] = g);
}
function cylGeo(rr, rf, len, seg) { var g = new T.CylinderGeometry(rr, rf, len, seg || 14, 1, false); g.rotateX(HP); return g; }

/* ---------- Kit: adds parts to a target group ---------- */
function Kit(target) { this.g = target; }
Kit.prototype = {
  to: function (grp) { return new Kit(grp); },
  put: function (geo, m, x, y, z) { var o = new T.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); this.g.add(o); return o; },
  box: function (w, h, d, x, y, z, m, r) { return this.put(rgeo(w, h, d, r), m, x, y, z); },
  fbox: function (w, h, d, x, y, z, m) { return this.put(flat(w, h, d), m, x, y, z); },
  prof: function (pts, w, m, x, bev, holes) { return this.put(profGeo(pts, w, bev == null ? .002 : bev, holes), m, x || 0, 0, 0); },
  cyl: function (rr, rf, len, x, y, z, m, seg) { return this.put(cylGeo(rr, rf == null ? rr : rf, len, seg), m, x, y, z); },
  ball: function (r, x, y, z, m) { return this.put(new T.SphereGeometry(r, 12, 9), m, x, y, z); },
  lathe: function (pts, x, y, z, m, seg) { // pts: [radius, zOffset] ; +z toward the rear
    var v = pts.map(function (p) { return new T.Vector2(p[0], p[1]); }), g = new T.LatheGeometry(v, seg || 16); g.rotateX(HP);
    return this.put(g, m, x, y, z); },
  inst: function (m, list, round) { // [x,y,z,sx,sy,sz]
    if (!list.length) return null;
    var im = new T.InstancedMesh(round ? cylGeoUnit() : flat(1, 1, 1), m, list.length), o = new T.Object3D();
    list.forEach(function (it, i) { o.position.set(it[0], it[1], it[2]); o.scale.set(it[3], it[4], it[5]); o.rotation.set(it[6] || 0, it[7] || 0, it[8] || 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.frustumCulled = false; this.g.add(im); return im; },
  rail: function (z0, z1, y, m, w) { // Picatinny top rail with cross slots
    var M = mats(), L = z0 - z1, zc = (z0 + z1) / 2; w = w || .024;
    this.fbox(w, .008, L, 0, y, zc, m);
    var s = [], n = Math.max(3, Math.floor(L / .0125));
    for (var i = 0; i < n; i++) s.push([0, y + .0042, z1 + (i + .5) * L / n, w * 1.02, .0014, .0045]);
    this.inst(M.dark, s);
    this.fbox(w * .78, .005, L, 0, y + .0065, zc, m);
  },
  vents: function (m, side, z0, step, n, y, w, h, d) { var l = []; for (var i = 0; i < n; i++) l.push([side, y, z0 - i * step, w, h, d]); return this.inst(m, l); }
};
var cylUnit = null; function cylGeoUnit() { return cylUnit || (cylUnit = cylGeo(1, 1, 1, 10)); }

/* ---------- common parts ---------- */
function guard(K, z, y, len, m) { // trigger guard ring + trigger
  K.prof([[z + .014, y + .004], [z - len, y + .004], [z - len - .004, y - .03], [z + .012, y - .033]], .005, m, 0, .0006,
    [[[z + .006, y - .002], [z - len + .006, y - .002], [z - len + .003, y - .026], [z + .006, y - .028]]]);
  K.fbox(.005, .022, .005, 0, y - .014, z - .02, mats().steel).rotation.x = .25;
}
function serr(K, m, x, z0, n, step, y, h) { var l = []; for (var i = 0; i < n; i++) l.push([x, y, z0 - i * step, .0014, h, .0032]); K.inst(m, l); }
function ribs(K, m, z0, z1, n, y, rr) { var l = []; for (var i = 0; i < n; i++) l.push([0, y, z0 + (z1 - z0) * i / (n - 1), rr, rr, .004]); K.inst(m, l, true); }
function flashHider(K, m, z, y, r) { K.cyl(r, r, .05, 0, y, z, m, 12); K.inst(mats().dark, [[0, y + r * .55, z - .02, .003, .0, .018]]); for (var i = 0; i < 4; i++) K.fbox(.004, .02, .006, 0, y, z - .015 + i * .01, mats().dark).visible = false; }
function brake(K, m, z, y, r) { K.cyl(r, r, .06, 0, y, z, m, 12); var l = []; for (var i = 0; i < 3; i++) l.push([r * .9, y, z - .012 + i * .014, .002, r * 1.3, .007], [-r * .9, y, z - .012 + i * .014, .002, r * 1.3, .007]); K.inst(mats().dark, l); }
function handguardRound(K, m, z0, z1, y, r) { var L = z0 - z1; K.cyl(r, r, L, 0, y, (z0 + z1) / 2, m, 14); var l = []; for (var i = 0; i < Math.floor(L / .028); i++) for (var s = -1; s <= 1; s += 2) l.push([s * r * .98, y, z1 + .02 + i * .028, .002, r * .5, .014]); K.inst(mats().dark, l); }
function handguardRail(K, m, z0, z1, y, w, h) { var L = z0 - z1; K.box(w, h, L, 0, y, (z0 + z1) / 2, m, .006); var l = []; for (var i = 0; i < Math.floor(L / .03); i++) for (var s = -1; s <= 1; s += 2) l.push([s * w / 2, y, z1 + .02 + i * .03, .0018, h * .42, .018]); K.inst(mats().dark, l); K.rail(z0, z1, y + h / 2 - .001, mats().blk); }
function mag(K, pts, w, m, ribY, ribZ) { K.prof(pts, w, m, 0, .0012); }

function huntStock(z0, butt, top, toe, grip) { // slim curved wooden/poly stock outline
  var p = [[z0, .022], [butt - .02, .028, (z0 + butt) / 2 + .02, top], [butt, .004], [butt - .008, toe], [.21, -.03, (butt + .21) / 2, toe * .78]];
  if (grip) p.push([.19, -.036], [.155, -.112], [.1, -.128], [z0 - .02, -.05]); else p.push([z0, -.01]);
  return p;
}
/* ---------- gun specs ---------- */
var SPECS = {};
function S(k, o) { SPECS[k] = o; }

/* ===== sidearms ===== */
S('pistol', { base: 'pistol', grip: [-.07, .045], muz: [.03, -.19], sightY: .053, mp: { y: -.1, z: .045, h: .06 },
  body: function (K, C) {
    var M = C.M;
    K.prof([[-.16, .016], [.045, .016], [.05, -.012], [.066, -.128], [.012, -.128], [-.012, -.04], [-.02, -.018], [-.075, -.014], [-.16, -.006]], .03, C.body, 0, .0016);
    K.box(.034, .032, .012, 0, -.126, .04, M.rubber, .003); // grip base
    K.prof([[.052, -.018], [.062, -.12], [.045, -.12], [.036, -.02]], .0345, M.rubber, 0, 0); // stippled backstrap panels
    guard(K, -.02, -.018, .052, M.poly); K.fbox(.008, .008, .06, 0, -.01, -.115, M.steel); // rail + lug
    K.fbox(.022, .006, .05, 0, .003, -.14, M.blk);
  },
  bolt: function (K, C) {
    var M = C.M;
    K.box(.031, .034, .215, 0, .031, -.068, M.blk, .0045);
    K.fbox(.027, .006, .21, 0, .0495, -.068, M.blk);
    serr(K, M.dark, .0158, .03, 6, .0085, .03, .02); serr(K, M.dark, -.0158, .03, 6, .0085, .03, .02);
    serr(K, M.dark, .0158, -.12, 4, .0085, .03, .02); serr(K, M.dark, -.0158, -.12, 4, .0085, .03, .02);
    K.fbox(.0016, .014, .045, .0158, .038, -.055, M.dark);
    K.fbox(.005, .009, .012, 0, .0535, -.165, M.steel); K.fbox(.0008, .006, .006, 0, .0555, -.165, M.red);
    K.fbox(.009, .008, .011, .008, .0535, .033, M.steel); K.fbox(.009, .008, .011, -.008, .0535, .033, M.steel);
    K.cyl(.0085, .0085, .026, 0, .03, -.185, M.steel, 12); K.cyl(.0035, .0035, .028, 0, .03, -.186, M.dark, 8);
  },
  mag: function (K, C) { var M = C.M; K.prof([[-.02, -.06], [.045, -.06], [.05, -.122], [.0, -.122]], .026, M.steel, 0, .001); K.box(.03, .012, .058, 0, -.128, .026, M.blk, .003); }
});

S('hawk', { base: 'hawk', grip: [-.075, .052], muz: [.032, -.265], sightY: .053, mp: { y: -.1, z: .05, h: .06 },
  body: function (K, C) {
    var M = C.M;
    K.prof([[-.235, .016], [.05, .016], [.056, -.014], [.074, -.136], [.012, -.136], [-.012, -.045], [-.02, -.022], [-.09, -.022], [-.235, -.012]], .036, C.body, 0, .002);
    K.box(.04, .088, .05, 0, -.085, .045, M.rubber, .006).rotation.x = .26; // rubber grip
    K.box(.037, .02, .066, 0, -.136, .043, M.blk, .004);
    guard(K, -.03, -.022, .06, M.blk); K.fbox(.01, .01, .1, 0, -.016, -.18, M.steel);
    K.cyl(.012, .01, .05, 0, .004, -.215, M.steel, 12);
  },
  bolt: function (K, C) {
    var M = C.M;
    K.box(.038, .046, .275, 0, .034, -.095, C.steelBody, .006);
    K.prof([[-.235, .056], [.04, .056], [.04, .064], [-.235, .06]], .016, M.blk, 0, .001); // vent rib
    var v = []; for (var i = 0; i < 6; i++) v.push([0, .0625, -.04 - i * .028, .01, .0016, .012]); K.inst(M.dark, v);
    serr(K, M.dark, .019, .032, 7, .008, .034, .026); serr(K, M.dark, -.019, .032, 7, .008, .034, .026);
    K.fbox(.0016, .018, .05, .019, .038, -.07, M.dark);
    K.fbox(.006, .01, .012, 0, .065, -.225, M.blk); K.fbox(.012, .008, .011, 0, .065, .035, M.blk);
    K.cyl(.016, .0135, .045, 0, .02, -.255, C.steelBody, 14); K.cyl(.0055, .0055, .046, 0, .02, -.257, M.dark, 8);
  },
  mag: function (K, C) { var M = C.M; K.prof([[-.02, -.06], [.05, -.06], [.056, -.134], [.0, -.134]], .03, M.steel, 0, .001); K.box(.034, .012, .064, 0, -.14, .03, M.blk, .003); }
});

/* ---------- optic helpers ---------- */
function scope(K, M, o) { // magnified scope on rings: o={y,z,len,r,rail,rings:[z..],obj,turrets}
  var y = o.y, r = o.r || .022, L = o.len, z = o.z;
  K.cyl(r, r, L, 0, y, z, M.blk, 18);
  K.lathe([[r * .98, 0], [r * 1.55, .012], [r * 1.5, o.obj || .06], [r * 1.42, (o.obj || .06) + .004]], 0, y, z - L / 2 - (o.obj || .06) * .45, M.blk, 18).scale.z = 1;
  K.cyl(r * 1.36, r * 1.36, .003, 0, y, z - L / 2 - (o.obj || .06) * .85, M.glass, 18);
  K.cyl(r * 1.25, r * 1.25, .05, 0, y, z + L / 2 + .02, M.blk, 18); K.cyl(r * 1.15, r * 1.15, .014, 0, y, z + L / 2 + .052, M.rubber, 18);
  K.cyl(r * .98, r * .98, .004, 0, y, z + L / 2 + .06, M.glass, 18);
  K.cyl(.011, .011, .03, 0, y + r + .008, z - L * .05, M.steel, 10).rotation.set(0, 0, 0); K.cyl(.011, .011, .03, r + .008, y, z - L * .05, M.steel, 10).rotation.y = HP;
  (o.rings || [z + L * .28, z - L * .3]).forEach(function (rz) {
    K.box(.034, y - r * .6 - (o.rail || .066), .018, 0, ((o.rail || .066) + y - r * .6) / 2, rz, M.blk, .004);
    K.cyl(r * 1.18, r * 1.18, .018, 0, y, rz, M.blk, 18);
  });
}
function reflex(K, M, y, z) { // low open reflex with real window
  K.box(.04, .012, .054, 0, .056, z, M.blk, .003);
  K.box(.006, .036, .016, .018, .076, z - .016, M.blk, .002); K.box(.006, .036, .016, -.018, .076, z - .016, M.blk, .002);
  K.box(.044, .008, .018, 0, .097, z - .016, M.blk, .003); K.fbox(.002, .026, .006, 0, .077, z - .02, M.glass);
}

/* ===== SMGs / PDWs ===== */
S('smg', { base: 'smg', tone: 0x3a4146, metal: 0x4b5156, grip: [-.095, .07], fore: [-.045, -.27], muz: [.014, -.625], sightY: .08, sightType: 1, mp: { y: -.12, z: -.025, h: .085 },
  body: function (K, C) {
    var M = C.M;
    K.cyl(.028, .028, .34, 0, .016, -.04, M.blk, 18); K.cyl(.0295, .0295, .02, 0, .016, -.21, C.steelBody, 18);
    K.box(.04, .036, .2, 0, -.016, .02, C.body, .008);
    K.prof([[.04, -.03], [.085, -.03], [.11, -.14], [.058, -.14]], .036, M.poly, 0, .002); K.box(.038, .016, .06, 0, -.142, .084, M.rubber, .004);
    guard(K, .045, -.03, .075, M.poly);
    K.box(.054, .054, .18, 0, .008, -.265, M.poly, .014); 
    var l = []; for (var i = 0; i < 6; i++) { l.push([.0276, .008, -.19 - i * .026, .0016, .028, .012], [-.0276, .008, -.19 - i * .026, .0016, .028, .012]); } K.inst(M.dark, l);
    K.cyl(.0295, .0295, .29, 0, .016, -.48, M.blk, 18); ribs(K, M.steel, -.35, -.62, 7, .016, .0305); K.cyl(.031, .031, .012, 0, .016, -.62, C.steelBody, 18);
    K.rail(.06, -.14, .052, M.blk); K.box(.022, .03, .012, 0, .034, .115, M.blk, .004);
    K.cyl(.004, .004, .24, .021, .018, .24, M.steel, 8); K.cyl(.004, .004, .24, -.021, .018, .24, M.steel, 8);
    K.box(.04, .105, .022, 0, -.005, .365, M.rubber, .008); K.fbox(.05, .012, .05, 0, .02, .135, M.steel);
    K.fbox(.004, .012, .05, .03, .03, -.02, M.dark);
  },
  bolt: function (K, C) { K.fbox(.012, .014, .045, .033, .034, -.02, C.M.steel); K.ball(.01, .04, .034, -.0, C.M.blk); },
  mag: function (K, C) { K.prof([[.02, -.02], [.0, -.15, .022, -.09], [-.045, -.15], [-.025, -.02, -.05, -.09]], .026, C.M.steel, 0, .0012); K.box(.03, .008, .062, 0, -.152, -.02, C.M.blk, .003); },
  optic: function (K, C) { reflex(K, C.M, .08, -.085); }
});

S('kestrel', { base: 'smg', tone: 0x6a5a3e, metal: 0x7c6e52, grip: [-.085, .06], fore: [-.05, -.2], muz: [.018, -.385], sightY: .082, mp: { y: -.12, z: -.04, h: .085 },
  body: function (K, C) {
    var M = C.M;
    K.box(.046, .08, .22, 0, .012, -.015, C.body, .01); K.box(.04, .03, .14, 0, .045, .045, C.body, .008);
    K.rail(.06, -.3, .057, M.blk);
    K.box(.044, .044, .13, 0, .01, -.215, M.blk, .008); 
    var l = []; for (var i = 0; i < 5; i++) l.push([.0225, .012, -.16 - i * .022, .0016, .022, .01], [-.0225, .012, -.16 - i * .022, .0016, .022, .01]); K.inst(M.dark, l);
    K.cyl(.012, .012, .08, 0, .018, -.3, M.steel, 12); K.cyl(.022, .02, .06, 0, .018, -.355, M.blk, 14); ribs(K, M.steel, -.33, -.38, 5, .018, .0225);
    K.prof([[.03, -.032], [.075, -.032], [.095, -.138], [.045, -.138]], .034, M.poly, 0, .0016); guard(K, .03, -.032, .07, M.poly);
    K.box(.036, .018, .08, 0, -.146, .07, M.rubber, .004);
    K.cyl(.0045, .0045, .3, .027, .02, .24, M.steel, 8); K.cyl(.0045, .0045, .3, -.027, .02, .24, M.steel, 8); K.box(.05, .1, .018, 0, -.005, .395, M.rubber, .007);
    K.fbox(.005, .03, .012, .037, .004, .2, M.steel); K.fbox(.0016, .016, .05, .0235, .02, .02, M.dark);
  },
  bolt: function (K, C) { K.fbox(.012, .012, .035, .033, .036, .0, C.M.steel); K.ball(.009, .04, .036, .0, C.M.blk); },
  mag: function (K, C) { K.prof([[-.018, -.03], [.025, -.03], [.03, -.17], [-.02, -.17]], .026, C.M.steel, 0, .0012); K.box(.03, .008, .052, 0, -.172, .004, C.M.blk, .003); }
});

S('mako', { base: 'smg', tone: 0x4d5648, metal: 0x636d5f, grip: [-.09, .06], fore: [-.052, -.24], muz: [.02, -.41], sightY: .084, mp: { y: -.12, z: -.07, h: .085 },
  body: function (K, C) {
    var M = C.M;
    K.prof([[-.12, .055], [.1, .055], [.12, .02], [.12, -.035], [-.12, -.035], [-.15, 0]], .052, C.body, 0, .003);
    K.rail(.06, -.32, .057, M.blk);
    K.box(.06, .06, .16, 0, -.0, -.2, M.blk, .01); var l = []; for (var i = 0; i < 4; i++) l.push([.03, .006, -.145 - i * .032, .0016, .03, .016], [-.03, .006, -.145 - i * .032, .0016, .03, .016]); K.inst(M.dark, l);
    K.cyl(.013, .013, .12, 0, .02, -.34, M.steel, 12); K.cyl(.02, .02, .075, 0, .02, -.385, M.blk, 14);
    K.prof([[.03, -.035], [.095, -.035], [.115, -.145], [.05, -.145]], .042, C.body, 0, .003); K.box(.044, .016, .08, 0, -.15, .08, M.rubber, .005);
    guard(K, .03, -.035, .08, M.poly);
    // skeleton fixed stock with open centre
    K.prof([[.1, .05], [.4, .036], [.42, -.075], [.3, -.075], [.14, -.03]], .046, M.poly, 0, .003, [[[.16, .03], [.34, .022], [.36, -.05], [.27, -.052], [.17, -.015]]]);
    K.box(.05, .125, .02, 0, -.01, .425, M.rubber, .006);
    K.fbox(.0016, .03, .08, .0275, .01, -.02, M.dark); K.fbox(.012, .012, .09, .03, .036, -.05, M.steel);
  },
  bolt: function (K, C) { K.fbox(.014, .012, .04, .031, .038, -.03, C.M.steel); K.ball(.009, .041, .038, -.03, C.M.blk); },
  mag: function (K, C) { K.prof([[-.025, -.035], [.02, -.035], [.026, -.2], [-.02, -.2]], .034, C.M.poly, 0, .002); K.box(.036, .01, .052, 0, -.203, -.001, C.M.blk, .003); K.fbox(.0016, .1, .03, .0185, -.1, -.0, C.M.smoke); }
});

S('needle', { base: 'smg', tone: 0x35423c, metal: 0x566860, grip: [-.075, .07], fore: [-.045, -.15], muz: [.024, -.315], sightY: .084, mp: { y: -.09, z: -.03, h: .06 },
  body: function (K, C) {
    var M = C.M;
    K.prof([[-.2, .05], [.14, .05], [.36, .044, .3, .052], [.43, .03], [.44, -.08], [.33, -.082], [.22, -.05], [-.06, -.038], [-.2, -.02, -.205, -.03]], .046, C.body, 0, .004);
    K.rail(.07, -.31, .057, M.blk);
    K.prof([[.03, -.04], [.13, -.04], [.15, -.1, .16, -.07], [.06, -.115]], .034, M.poly, 0, .003, [[[.06, -.06], [.115, -.06], [.12, -.085], [.075, -.092]]]);
    guard(K, .02, -.04, .045, M.poly);
    K.cyl(.01, .01, .09, 0, .016, -.245, M.steel, 12); K.cyl(.018, .016, .045, 0, .016, -.3, M.blk, 14); ribs(K, M.steel, -.285, -.32, 4, .016, .0185);
    K.box(.052, .05, .05, 0, .0, -.185, M.blk, .008);
    K.box(.054, .115, .02, 0, -.015, .445, M.rubber, .005);
    K.fbox(.004, .02, .06, .0245, .024, .12, M.dark); K.fbox(.06, .008, .17, 0, -.05, -.13, M.poly);
  },
  bolt: function (K, C) { K.fbox(.012, .01, .03, .028, .052, .0, C.M.steel); },
  mag: function (K, C) { K.box(.04, .03, .25, 0, .036, -.04, C.M.smoke, .007); K.box(.044, .012, .26, 0, .056, -.04, C.M.blk, .004); }
});

S('switchback', { base: 'smg', tone: 0x2f3b3a, metal: 0x546866, grip: [-.08, .08], fore: [-.05, -.25], muz: [.0, -.345], sightY: .084, mp: { y: -.1, z: -.02, h: .08 },
  body: function (K, C) {
    var M = C.M;
    K.prof([[-.16, .05], [.07, .05], [.21, .03], [.23, -.03], [.2, -.065], [.09, -.07], [.0, -.04], [-.16, -.035]], .05, C.body, 0, .004);
    K.rail(.1, -.33, .057, M.blk);
    K.box(.05, .05, .15, 0, .0, -.235, M.blk, .01); var l = []; for (var i = 0; i < 5; i++) l.push([.0255, .0, -.18 - i * .022, .0016, .025, .01], [-.0255, .0, -.18 - i * .022, .0016, .025, .01]); K.inst(M.dark, l);
    K.cyl(.011, .011, .08, 0, .003, -.31, M.steel, 12); K.cyl(.019, .017, .05, 0, .003, -.34, M.blk, 14);
    K.prof([[-.01, -.04], [.04, -.04], [.095, -.135], [.045, -.14]], .04, M.poly, 0, .003); K.box(.04, .014, .05, 0, -.142, .075, M.rubber, .004);
    guard(K, -.005, -.04, .05, M.poly);
    // folding skeleton stock: two side bars + butt plate
    K.cyl(.005, .005, .25, .026, .02, .32, M.steel, 8); K.cyl(.005, .005, .25, -.026, .02, .32, M.steel, 8);
    K.box(.058, .09, .018, 0, -.0, .45, M.rubber, .006); K.fbox(.05, .012, .06, 0, .028, .2, M.steel);
    K.fbox(.0016, .02, .1, .026, .022, .06, M.dark);
  },
  bolt: function (K, C) { K.fbox(.012, .01, .04, .03, .054, .0, C.M.steel); },
  mag: function (K, C) { K.prof([[-.02, -.04], [.03, -.04], [.06, -.2], [.0, -.2]], .034, C.M.poly, 0, .002); K.box(.036, .01, .062, 0, -.203, .03, C.M.blk, .003); K.fbox(.0016, .09, .028, .0185, -.1, .015, C.M.smoke).rotation.x = .23; }
});

/* ===== rifles ===== */
function grip(K, m, pts, w) { K.prof(pts, w || .036, m, 0, .002); }
function arStock(K, C, o) { var M = C.M; K.cyl(.017, .017, .22, 0, .02, .2, M.steel, 12); K.prof(o.pts, o.w || .042, o.m || C.body, 0, .003); K.box(.046, .11, .018, 0, -.02, o.end || .43, M.rubber, .005); }

S('stinger', { base: 'ranger', tone: 0x5a603f, metal: 0x5e6259, grip: [-.09, .12], fore: [-.045, -.27], muz: [.018, -.7], sightY: .1, mp: { y: -.115, z: -.045, h: .1 },
  body: function (K, C) {
    var M = C.M;
    K.box(.04, .07, .3, 0, .014, -.0, M.blk, .006); K.rail(.13, -.47, .057, M.blk);
    K.box(.056, .062, .19, 0, .012, -.27, C.body, .012); var l = []; for (var i = 0; i < 6; i++) l.push([.0286, .012, -.2 - i * .028, .0016, .03, .014], [-.0286, .012, -.2 - i * .028, .0016, .03, .014]); K.inst(M.dark, l);
    K.cyl(.009, .009, .3, 0, .042, -.31, M.steel, 10); K.box(.026, .058, .04, 0, .03, -.45, M.steel, .005);
    K.cyl(.0105, .0105, .3, 0, .018, -.52, M.steel, 12); K.cyl(.015, .015, .07, 0, .018, -.675, M.blk, 12); K.fbox(.036, .008, .02, 0, .018, -.69, M.dark);
    grip(K, M.poly, [[.06, -.03], [.115, -.03], [.14, -.148], [.088, -.148]]); guard(K, .06, -.03, .09, M.poly);
    K.prof([[.14, .04], [.42, .026], [.435, -.088], [.36, -.092], [.14, -.01]], .04, C.body, 0, .003, [[[.19, .018], [.36, .006], [.375, -.05], [.3, -.052], [.2, -.012]]]); K.box(.044, .12, .016, 0, -.02, .436, M.rubber, .005);
    K.fbox(.002, .05, .14, .0205, .03, .02, M.steel); K.fbox(.0016, .02, .06, .0205, .028, -.05, M.dark);
  },
  bolt: function (K, C) { K.fbox(.014, .012, .036, .03, .033, .0, C.M.steel); K.ball(.01, .037, .033, 0, C.M.blk); },
  mag: function (K, C) { K.prof([[.04, -.03], [.0, -.205, .046, -.11], [-.065, -.205], [-.045, -.03, -.085, -.12]], .032, C.M.steel, 0, .0012); K.box(.036, .008, .09, 0, -.207, -.03, C.M.blk, .003); }
});

S('aurora', { base: 'ranger', tone: 0x4a5c68, metal: 0x66808f, grip: [-.095, .1], fore: [-.085, -.165], muz: [.02, -.56], sightY: .1, mp: { y: -.1, z: .24, h: .09 },
  body: function (K, C) {
    var M = C.M;
    K.prof([[-.22, .05], [.2, .05], [.4, .046], [.47, .03], [.475, -.07], [.32, -.078], [.22, -.046], [-.02, -.046], [-.22, -.015]], .054, C.body, 0, .005);
    K.rail(.12, -.44, .057, M.blk);
    K.cyl(.0105, .0105, .12, 0, .018, -.28, M.steel, 12); K.cyl(.0135, .0135, .16, 0, .018, -.42, M.blk, 14); K.cyl(.017, .017, .06, 0, .018, -.535, M.blk, 14); ribs(K, M.steel, -.5, -.56, 4, .018, .0175);
    grip(K, M.poly, [[.05, -.045], [.135, -.045], [.155, -.145], [.09, -.148]]); guard(K, .04, -.045, .06, M.poly);
    K.prof([[-.12, -.046], [-.06, -.046], [-.055, -.13], [-.12, -.135]], .034, M.poly, 0, .003); K.box(.04, .016, .06, 0, -.14, -.088, M.rubber, .005);
    K.box(.056, .12, .02, 0, -.0, .477, M.rubber, .006); K.fbox(.0016, .03, .12, .0275, .02, .1, M.dark); K.fbox(.0016, .04, .1, .0275, .0, .34, C.steelBody);
  },
  bolt: function (K, C) { K.fbox(.012, .012, .04, -.03, .04, -.02, C.M.steel); },
  mag: function (K, C) { K.prof([[.19, -.046], [.29, -.046], [.295, -.19], [.195, -.19]], .036, C.M.smoke, 0, .002); K.box(.04, .01, .108, 0, -.194, .245, C.M.blk, .003); }
});

S('falcon', { base: 'ranger', tone: 0x4f5c61, metal: 0x6b7e84, grip: [-.09, .11], fore: [-.055, -.27], muz: [.018, -.69], sightY: .1, mp: { y: -.115, z: -.04, h: .1 },
  body: function (K, C) {
    var M = C.M;
    K.box(.04, .072, .13, 0, -.014, .03, M.blk, .008); K.box(.04, .056, .27, 0, .026, -.02, M.blk, .006);
    K.rail(.12, -.47, .057, M.blk);
    K.box(.012, .016, .02, .026, .03, .06, M.steel, .003); K.fbox(.0016, .03, .07, .021, .03, -.0, M.dark); K.cyl(.007, .007, .02, .03, .036, .05, M.steel, 8).rotation.z = HP;
    handguardRound(K, C.body, -.15, -.41, .018, .033); K.box(.022, .055, .028, 0, .03, -.46, M.steel, .004); K.cyl(.01, .01, .1, 0, .018, -.44, M.steel, 10);
    K.cyl(.0105, .0105, .12, 0, .018, -.57, M.steel, 12); K.cyl(.0165, .0165, .06, 0, .018, -.665, M.blk, 12); ribs(K, M.steel, -.64, -.69, 4, .018, .0168);
    grip(K, M.poly, [[.02, -.04], [.065, -.04], [.095, -.145], [.047, -.148]]); guard(K, .015, -.04, .085, M.blk);
    arStock(K, C, { pts: [[.12, .036], [.41, .026], [.42, -.082], [.37, -.09], [.14, -.01]] });
    K.fbox(.004, .016, .016, 0, .0, .24, M.steel);
  },
  bolt: function (K, C) { K.fbox(.036, .01, .02, 0, .056, .09, C.M.blk); K.fbox(.01, .014, .016, .012, .047, .1, C.M.steel); },
  mag: function (K, C) { K.prof([[-.02, -.03], [.03, -.03], [.042, -.17, .034, -.1], [.0, -.172]], .03, C.M.steel, 0, .0012); K.box(.034, .008, .05, 0, -.174, .02, C.M.blk, .003); }
});

S('rampart', { base: 'ranger', tone: 0x6a613f, metal: 0x7a7050, grip: [-.09, .115], fore: [-.04, -.31], muz: [.012, -.7], sightY: .127, sightType: 3, mp: { y: -.12, z: -.045, h: .09 },
  body: function (K, C) {
    var M = C.M;
    K.box(.046, .078, .34, 0, .012, -.02, M.blk, .008); K.rail(.1, -.22, .057, M.blk); K.box(.02, .012, .03, 0, .03, .16, M.steel, .003);
    K.box(.06, .06, .25, 0, .006, -.31, C.body, .014); var l = []; for (var i = 0; i < 7; i++) { l.push([.0305, .01, -.2 - i * .03, .0016, .035, .018], [-.0305, .01, -.2 - i * .03, .0016, .035, .018]); } K.inst(M.dark, l);
    var b = []; for (var j = 0; j < 5; j++) b.push([0, -.0245, -.22 - j * .04, .03, .0016, .022]); K.inst(M.dark, b);
    K.cyl(.0115, .0115, .26, 0, .016, -.56, M.steel, 12); K.lathe([[.014, 0], [.019, .01], [.019, .07], [.016, .075]], 0, .016, -.675, M.blk, 14);
    grip(K, M.poly, [[.05, -.03], [.1, -.03], [.125, -.15], [.075, -.152]]); guard(K, .05, -.03, .09, M.poly);
    K.prof([[.16, .05], [.34, .044], [.45, .03], [.47, -.09], [.37, -.098], [.16, -.02]], .046, C.body, 0, .004); K.box(.05, .125, .018, 0, -.02, .474, M.rubber, .005);
    K.fbox(.0016, .036, .16, .0235, .012, .0, M.dark);
  },
  bolt: function (K, C) { K.cyl(.007, .007, .06, -.028, .018, -.15, C.M.steel, 8); K.ball(.011, -.028, .018, -.18, C.M.blk); },
  mag: function (K, C) { K.prof([[-.025, -.03], [.037, -.03], [.042, -.172], [-.02, -.172]], .034, C.M.steel, 0, .0012); K.box(.038, .01, .062, 0, -.176, .008, C.M.blk, .003); K.fbox(.036, .003, .06, 0, -.07, .006, C.M.dark); K.fbox(.036, .003, .06, 0, -.11, .008, C.M.dark); },
  optic: function (K, C) { scope(K, C.M, { y: .127, z: -.02, len: .2, r: .021, obj: .055, rings: [.04, -.08] }); }
});

S('ranger', { base: 'ranger', tone: 0x3e4a3f, metal: 0x58645a, grip: [-.09, .11], fore: [-.045, -.34], muz: [.012, -.83], sightY: .114, sightType: 3, mp: { y: -.115, z: -.045, h: .09 },
  body: function (K, C) {
    var M = C.M;
    K.box(.048, .062, .2, 0, -.004, -.0, M.blk, .008); K.box(.048, .05, .34, 0, .028, -.07, M.blk, .008); K.rail(.1, -.24, .057, M.blk);
    handguardRail(K, M.blk, -.1, -.52, .016, .056, .056);
    K.cyl(.0105, .0105, .3, 0, .016, -.67, M.steel, 12); K.box(.026, .026, .1, 0, .016, -.62, M.blk, .004); brake(K, M.blk, -.805, .016, .019);
    grip(K, C.body, [[.045, -.03], [.095, -.03], [.12, -.145], [.07, -.148]]); guard(K, .04, -.03, .09, M.blk);
    K.cyl(.017, .017, .16, 0, .02, .17, M.steel, 12); K.prof([[.1, .036], [.4, .03], [.415, -.075], [.34, -.085], [.14, -.01]], .042, C.body, 0, .003); K.box(.042, .03, .13, 0, .056, .3, C.body, .008);
    K.box(.046, .11, .018, 0, -.01, .418, M.rubber, .005);
    K.fbox(.014, .02, .01, .027, .0, .06, M.steel);
  },
  bolt: function (K, C) { K.fbox(.012, .014, .034, .032, .04, .0, C.M.steel); },
  mag: function (K, C) { K.prof([[-.02, -.05], [.034, -.05], [.036, -.17], [-.018, -.17]], .032, C.M.steel, 0, .0012); K.box(.036, .01, .06, 0, -.174, .008, C.M.blk, .003); },
  optic: function (K, C) { scope(K, C.M, { y: .114, z: -.07, len: .24, r: .02, obj: .06, rings: [.02, -.14], rail: .062 }); }
});

S('tide', { base: 'ranger', tone: 0x7a5a38, metal: 0x4a5258, grip: [-.085, .11], fore: [-.03, -.3], muz: [.016, -.76], sightY: .127, sightType: 3, mp: { y: -.115, z: -.045, h: .09 },
  body: function (K, C) {
    var M = C.M, W = M.wood;
    K.box(.04, .062, .3, 0, .018, -.02, M.steel, .006); K.box(.036, .022, .27, 0, .056, -.0, M.steel, .005);
    K.box(.048, .05, .24, 0, .0, -.285, W, .012); K.box(.044, .034, .24, 0, .034, -.28, W, .01); // two-piece wood handguard
    var v = []; for (var i = 0; i < 7; i++) v.push([.0225, .034, -.19 - i * .028, .0016, .012, .014], [-.0225, .034, -.19 - i * .028, .0016, .012, .014]); K.inst(M.dark, v);
    K.cyl(.0105, .0105, .3, 0, .018, -.57, M.steel, 12); K.box(.02, .02, .05, 0, .024, -.45, M.steel, .003); K.lathe([[.012, 0], [.017, .008], [.017, .06], [.014, .066]], 0, .018, -.725, M.steel, 12); K.inst(M.dark, [[.0, .018, -.71, .003, .036, .01], [0, .018, -.725, .003, .036, .01]]);
    K.prof([[.06, -.025], [.1, -.025], [.135, -.145], [.09, -.15]], .036, W, 0, .003); guard(K, .05, -.03, .09, M.steel);
    // thumb-hole skeleton stock
    K.prof([[.09, .034], [.2, .04], [.35, .028], [.45, .012], [.46, -.095], [.38, -.1], [.3, -.07], [.2, -.06], [.1, -.04]], .04, W, 0, .003, [[[.2, .0], [.32, -.002], [.36, -.045], [.28, -.052], [.2, -.035]]]);
    K.box(.044, .115, .016, 0, -.025, .465, M.rubber, .005);
    K.fbox(.0016, .02, .08, .0215, .03, .06, M.dark);
  },
  bolt: function (K, C) { K.fbox(.012, .012, .04, .026, .038, .02, C.M.steel); K.ball(.01, .03, .038, .045, C.M.blk); },
  mag: function (K, C) { K.prof([[-.02, -.03], [.034, -.03], [.04, -.15, .04, -.09], [.0, -.17]], .028, C.M.steel, 0, .0012); K.box(.032, .008, .06, 0, -.172, .01, C.M.blk, .003); },
  optic: function (K, C) { scope(K, C.M, { y: .127, z: -.04, len: .2, r: .017, obj: .05, rings: [.03, -.1], rail: .066 }); }
});

S('pinion', { base: 'ranger', tone: 0x4b555e, metal: 0x66717b, grip: [-.095, .12], fore: [-.045, -.34], muz: [.012, -.9], sightY: .127, sightType: 3, mp: { y: -.115, z: -.045, h: .09 },
  body: function (K, C) {
    var M = C.M;
    K.box(.05, .068, .3, 0, .016, -.02, C.steelBody, .008); K.rail(.1, -.4, .06, M.blk);
    K.box(.056, .062, .34, 0, .01, -.34, M.blk, .01); var s = []; for (var i = 0; i < 9; i++) { s.push([.0285, .012, -.2 - i * .032, .0016, .036, .018], [-.0285, .012, -.2 - i * .032, .0016, .036, .018]); } K.inst(M.dark, s);
    K.cyl(.0125, .0115, .34, 0, .016, -.72, M.steel, 14); ribs(K, M.blk, -.6, -.84, 8, .016, .0128);
    K.lathe([[.012, 0], [.021, .01], [.023, .045], [.02, .05]], 0, .016, -.835, M.blk, 14); K.inst(M.dark, [[.022, .016, -.855, .002, .018, .01], [-.022, .016, -.855, .002, .018, .01], [.022, .016, -.87, .002, .018, .01], [-.022, .016, -.87, .002, .018, .01]]);
    K.cyl(.004, .004, .26, -.03, -.035, -.42, M.steel, 6); K.cyl(.004, .004, .26, .03, -.035, -.42, M.steel, 6); K.box(.07, .01, .03, 0, -.03, -.3, M.blk, .003);
    K.prof([[.05, -.03], [.1, -.03], [.125, -.145], [.075, -.148]], .036, M.poly, 0, .003); guard(K, .045, -.03, .08, M.blk);
    K.prof([[.1, .04], [.18, .044], [.42, .03], [.44, -.09], [.36, -.098], [.28, -.07], [.2, -.058], [.1, -.036]], .044, C.body, 0, .004, [[[.19, -.005], [.3, -.005], [.34, -.045], [.26, -.05], [.2, -.035]]]);
    K.box(.046, .036, .14, 0, .062, .31, M.rubber, .01); K.box(.05, .125, .018, 0, -.02, .445, M.rubber, .005);
  },
  bolt: function (K, C) { K.cyl(.006, .006, .07, .03, .036, .02, C.M.steel, 8).rotation.set(0, 0, HP); K.ball(.014, .068, .036, .02, C.M.blk); },
  mag: function (K, C) { K.prof([[-.02, -.03], [.036, -.03], [.04, -.15], [-.02, -.15]], .032, C.M.poly, 0, .002); K.box(.036, .01, .06, 0, -.153, .01, C.M.blk, .003); },
  optic: function (K, C) { scope(K, C.M, { y: .127, z: -.06, len: .28, r: .024, obj: .07, rings: [.04, -.17], rail: .064 }); }
});

S('vantage', { base: 'longbow', tone: 0x7a5a38, metal: 0x4a5258, grip: [-.09, .13], fore: [-.045, -.3], muz: [.016, -.84], sightY: .115, sightType: 3, mp: { y: -.065, z: -.08, h: .04 },
  body: function (K, C) {
    var M = C.M, W = M.wood;
    K.box(.034, .056, .24, 0, .022, -.0, M.steel, .006);
    // one-piece hunting stock with comb, pistol grip swell and fore-end
    K.prof(huntStock(.0, .465, .034, -.095, true), .044, W, 0, .004); K.box(.046, .046, .36, 0, -.012, -.17, W, .012);
    K.box(.05, .1, .02, 0, -.025, .468, M.rubber, .005);
    K.cyl(.0112, .0105, .54, 0, .02, -.55, M.steel, 12); K.cyl(.014, .014, .012, 0, .02, -.835, M.steel, 12);
    K.fbox(.007, .014, .02, 0, .056, -.78, M.steel); K.fbox(.014, .012, .02, 0, .053, -.06, M.steel);
    guard(K, .02, -.03, .09, M.steel); K.fbox(.014, .03, .008, 0, -.052, .0, M.steel);
  },
  bolt: function (K, C) { K.cyl(.011, .011, .12, 0, .028, .03, C.M.steel, 12); K.cyl(.0045, .0045, .06, .04, .0, .02, C.M.steel, 8).rotation.set(0, 0, HP - .5); K.ball(.014, .068, -.02, .028, C.M.blk); },
  mag: function (K, C) { K.box(.03, .05, .07, 0, -.045, -.04, C.M.steel, .004); K.box(.034, .008, .076, 0, -.073, -.04, C.M.blk, .003); },
  optic: function (K, C) { scope(K, C.M, { y: .115, z: -.22, len: .17, r: .0165, obj: .04, rings: [-.15, -.29], rail: .052 }); }
});

/* ===== support weapons ===== */
function bipodFolded(K, M, z) { K.cyl(.0045, .0045, .26, -.032, -.04, z, M.steel, 6); K.cyl(.0045, .0045, .26, .032, -.04, z, M.steel, 6); K.box(.07, .012, .034, 0, -.032, z + .1, M.blk, .004); }
function irons(K, M, rearZ, rearY, frontZ, frontY) { // rear leaf + front post (used on guns without a module iron set)
  K.box(.034, .008, .028, 0, rearY - .02, rearZ, M.blk, .002); K.fbox(.006, .026, .012, .012, rearY - .004, rearZ, M.blk); K.fbox(.006, .026, .012, -.012, rearY - .004, rearZ, M.blk);
  K.box(.012, .014, .02, 0, frontY - .014, frontZ, M.blk, .002); K.fbox(.004, .024, .006, 0, frontY, frontZ, M.blk);
}

S('bulwark', { base: 'bulwark', tone: 0x2c3036, metal: 0x4f565d, grip: [-.1, .14], fore: [-.048, -.34], muz: [.014, -.9], sightY: .092, sightType: 1, mp: { y: -.1, z: -.04, h: .1 },
  body: function (K, C) {
    var M = C.M;
    K.box(.06, .076, .38, 0, .0, -.02, M.blk, .01); K.box(.054, .028, .2, 0, .056, -.05, M.blk, .008); K.fbox(.05, .004, .2, 0, .0715, -.05, M.steel);
    K.box(.054, .062, .22, 0, .016, -.34, M.blk, .012); var l = []; for (var i = 0; i < 7; i++) { l.push([.0275, .016, -.25 - i * .026, .0016, .036, .012], [-.0275, .016, -.25 - i * .026, .0016, .036, .012]); l.push([0, .0475, -.25 - i * .026, .03, .0016, .012]); } K.inst(M.dark, l);
    K.cyl(.0165, .0165, .34, 0, .016, -.68, M.steel, 14); K.cyl(.011, .011, .06, 0, .0, -.57, M.blk, 10); K.lathe([[.016, 0], [.022, .012], [.022, .08], [.019, .085]], 0, .016, -.86, M.blk, 14); K.inst(M.dark, [[.022, .016, -.84, .002, .022, .012], [-.022, .016, -.84, .002, .022, .012], [.022, .016, -.865, .002, .022, .012], [-.022, .016, -.865, .002, .022, .012]]);
    K.box(.012, .06, .014, 0, .068, -.58, M.steel, .003); // carry handle front post
    bipodFolded(K, M, -.46);
    K.prof([[.06, -.035], [.12, -.035], [.145, -.15], [.09, -.152]], .04, M.poly, 0, .003); guard(K, .06, -.035, .1, M.blk);
    K.prof([[.17, .04], [.4, .03], [.46, .02], [.47, -.1], [.38, -.105], [.17, -.015]], .05, M.poly, 0, .004, [[[.22, .015], [.36, .008], [.4, -.05], [.3, -.06], [.24, -.02]]]); K.box(.054, .13, .02, 0, -.02, .474, M.rubber, .006);
    irons(K, M, .1, .088, -.58, .092);
    K.fbox(.0016, .04, .1, .0305, .0, .08, M.dark);
  },
  bolt: function (K, C) { K.fbox(.014, .014, .05, .038, .03, -.01, C.M.steel); K.ball(.011, .045, .03, -.03, C.M.blk); },
  mag: function (K, C) { var M = C.M; K.box(.09, .1, .15, 0, -.095, -.05, M.poly, .01); K.box(.094, .014, .154, 0, -.147, -.05, M.blk, .004); K.fbox(.036, .02, .1, 0, -.04, -.1, M.brass); K.fbox(.02, .01, .12, 0, -.04, -.18, M.brass); }
});

S('mistral', { base: 'bulwark', tone: 0x4a5740, metal: 0x667558, grip: [-.1, .13], fore: [-.05, -.32], muz: [.02, -.82], sightY: .1, mp: { y: -.12, z: -.07, h: .1 },
  body: function (K, C) {
    var M = C.M;
    K.box(.056, .078, .34, 0, .004, -.0, C.body, .012); K.rail(.1, -.46, .057, M.blk);
    K.box(.06, .068, .3, 0, .012, -.31, M.blk, .012); var l = []; for (var i = 0; i < 8; i++) { l.push([.0305, .01, -.18 - i * .033, .0016, .04, .018], [-.0305, .01, -.18 - i * .033, .0016, .04, .018], [0, -.0225, -.18 - i * .033, .03, .0016, .018]); } K.inst(M.dark, l);
    K.cyl(.0125, .0125, .3, 0, .018, -.62, M.steel, 12); brake(K, M.blk, -.795, .018, .02);
    bipodFolded(K, M, -.4);
    K.prof([[.05, -.034], [.105, -.034], [.13, -.15], [.075, -.152]], .04, M.poly, 0, .003); guard(K, .05, -.034, .1, M.blk);
    K.prof([[.14, .04], [.36, .034], [.46, .02], [.47, -.1], [.38, -.108], [.3, -.07], [.14, -.015]], .048, C.body, 0, .004, [[[.19, .018], [.34, .012], [.37, -.04], [.28, -.05], [.2, -.012]]]); K.box(.052, .12, .018, 0, -.03, .472, M.rubber, .006);
    K.fbox(.0016, .03, .12, .0285, .02, .02, M.dark);
  },
  bolt: function (K, C) { K.fbox(.014, .014, .04, .036, .03, -.01, C.M.steel); K.ball(.01, .042, .03, -.03, C.M.blk); },
  mag: function (K, C) { var M = C.M; K.prof([[-.03, -.04], [.045, -.04], [.05, -.22], [-.03, -.22]], .042, M.poly, 0, .003); K.box(.046, .012, .084, 0, -.225, .01, M.blk, .004); var r = []; for (var i = 0; i < 8; i++) r.push([0, -.07 - i * .018, .008, .044, .0016, .08]); K.inst(M.dark, r); }
});

S('forge', { base: 'bulwark', tone: 0x4b342c, metal: 0x5a5148, grip: [-.095, .12], fore: [-.1, -.2], muz: [.018, -.52], sightY: .078, sightType: 1, mp: { y: -.14, z: -.08, h: .1 },
  body: function (K, C) {
    var M = C.M, W = M.wood, B = C.steelBody;
    K.box(.052, .072, .32, 0, .006, -.01, B, .008); K.box(.03, .02, .15, 0, .05, .02, B, .004);
    K.cyl(.0175, .0175, .3, 0, .02, -.31, M.blk, 16); ribs(K, B, -.17, -.45, 11, .02, .0215);
    K.lathe([[.016, 0], [.021, .006], [.021, .062], [.017, .066]], 0, .02, -.485, M.blk, 14); K.inst(M.dark, [[.021, .02, -.465, .002, .022, .01], [-.021, .02, -.465, .002, .022, .01], [.021, .02, -.48, .002, .022, .01], [-.021, .02, -.48, .002, .022, .01]]);
    K.box(.044, .044, .14, 0, -.01, -.21, W, .01); K.prof([[-.255, -.02], [-.17, -.02], [-.175, -.14], [-.25, -.15]], .038, W, 0, .004);
    K.prof([[.05, -.035], [.1, -.035], [.125, -.145], [.07, -.15]], .036, W, 0, .003); guard(K, .045, -.035, .09, B);
    K.prof(huntStock(.12, .44, .04, -.09, false), .04, W, 0, .004); K.box(.044, .11, .016, 0, -.03, .445, M.rubber, .005);
    irons(K, M, .1, .075, -.43, .06); K.fbox(.0016, .03, .1, .0265, .01, .0, M.dark); K.fbox(.012, .016, .04, .03, .06, -.04, M.steel);
  },
  bolt: function (K, C) { K.fbox(.014, .012, .04, .031, .04, -.04, C.M.steel); K.ball(.012, .04, .04, -.02, C.M.blk); },
  mag: function (K, C) { var M = C.M, g = new T.CylinderGeometry(.072, .072, .06, 28); g.rotateZ(HP); K.put(g, M.steel, 0, -.12, -.03); var g2 = new T.CylinderGeometry(.06, .06, .064, 24); g2.rotateZ(HP); K.put(g2, M.blk, 0, -.12, -.03);
    var r = []; for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2; r.push([0, -.12 + Math.cos(a) * .066, -.03 + Math.sin(a) * .066, .066, .006, .006, a]); } K.inst(M.dark, r); K.box(.05, .03, .05, 0, -.05, -.03, M.blk, .005); }
});

S('bastion', { base: 'bulwark', tone: 0x5a4e3a, metal: 0x707a8a, grip: [-.1, .13], fore: [-.05, -.36], muz: [.02, -.86], sightY: .1, mp: { y: -.1, z: -.04, h: .1 },
  body: function (K, C) {
    var M = C.M, W = M.wood;
    K.box(.056, .078, .42, 0, .004, -.04, M.blk, .01); K.box(.052, .018, .2, 0, .044, -.07, M.blk, .006); K.rail(.1, -.5, .057, M.blk);
    K.box(.06, .06, .12, 0, .008, -.32, M.blk, .01);
    K.cyl(.0235, .0235, .3, 0, .018, -.52, M.blk, 16); var h = []; for (var i = 0; i < 9; i++) for (var s = -1; s <= 1; s += 2) h.push([s * .0235, .018, -.4 - i * .028, .002, .014, .014]); K.inst(M.dark, h);
    K.cyl(.0105, .0105, .12, 0, .018, -.8, M.steel, 12); K.lathe([[.014, 0], [.02, .012], [.02, .07], [.017, .075]], 0, .018, -.84, M.blk, 14); K.inst(M.dark, [[.02, .018, -.82, .002, .026, .012], [-.02, .018, -.82, .002, .026, .012]]);
    bipodFolded(K, M, -.5);
    K.prof([[.05, -.035], [.1, -.035], [.12, -.145], [.07, -.15]], .04, M.poly, 0, .003); guard(K, .045, -.035, .09, M.blk);
    K.prof([[.15, .04], [.3, .036], [.44, .02], [.465, -.1], [.38, -.108], [.3, -.075], [.2, -.062], [.15, -.04]], .046, W, 0, .004, [[[.2, -.003], [.3, -.003], [.34, -.04], [.26, -.048], [.2, -.03]]]); K.box(.052, .13, .018, 0, -.03, .468, M.rubber, .005);
    K.fbox(.0016, .04, .1, .028, .0, .0, M.dark); K.box(.012, .012, .08, .033, .008, .0, M.steel, .003);
  },
  bolt: function (K, C) { K.fbox(.014, .014, .05, .036, .03, -.02, C.M.steel); K.ball(.011, .042, .03, -.04, C.M.blk); },
  mag: function (K, C) { var M = C.M; K.box(.1, .1, .17, 0, -.075, -.04, M.poly, .01); K.box(.104, .014, .174, 0, -.127, -.04, M.blk, .004); K.fbox(.045, .02, .09, 0, -.04, -.12, M.brass); }
});

S('cyclone', { base: 'bulwark', tone: 0x3c4144, metal: 0x5a6064, grip: [-.1, .12], fore: [-.05, -.35], muz: [.02, -.85], sightY: .098, sightType: 1, mp: { y: -.1, z: -.04, h: .1 },
  body: function (K, C) {
    var M = C.M, W = M.wood;
    K.box(.056, .072, .42, 0, .004, -.0, C.steelBody, .01); K.box(.052, .026, .26, 0, .05, -.05, C.steelBody, .006);
    K.cyl(.0275, .0275, .34, 0, .016, -.45, M.blk, 18); var h = []; for (var i = 0; i < 10; i++) for (var j = 0; j < 4; j++) { var a = j * Math.PI / 2 + .39; h.push([Math.cos(a) * .0276, .016 + Math.sin(a) * .0276, -.3 - i * .028, .002, .01, .01, 0, 0, a + HP]); } K.inst(M.dark, h);
    K.cyl(.0105, .0105, .12, 0, .016, -.74, M.steel, 12); K.lathe([[.012, 0], [.026, .014], [.026, .06], [.02, .066]], 0, .016, -.82, M.blk, 16);
    bipodFolded(K, M, -.48);
    K.prof([[.06, -.035], [.115, -.035], [.135, -.145], [.085, -.148]], .036, M.poly, 0, .003); guard(K, .06, -.035, .1, M.blk);
    K.prof(huntStock(.12, .48, .036, -.1, false), .048, W, 0, .004); K.box(.052, .13, .018, 0, -.03, .482, M.rubber, .005);
    irons(K, M, .1, .095, -.62, .09); K.box(.012, .045, .02, 0, .035, -.62, M.steel, .003);
    K.fbox(.0016, .03, .12, .0285, .02, 0, M.dark);
  },
  bolt: function (K, C) { K.fbox(.014, .014, .05, .038, .03, -.02, C.M.steel); K.ball(.011, .044, .03, -.04, C.M.blk); },
  mag: function (K, C) { var M = C.M; K.box(.07, .11, .14, -.02, -.1, -.04, M.steel, .008); K.box(.074, .012, .144, -.02, -.155, -.04, M.blk, .004); K.fbox(.03, .02, .12, 0, -.045, -.12, M.brass); }
});

/* ===== shotguns ===== */
function forend(K, m, z, len, w, y) { K.box(w || .054, .052, len, 0, y == null ? -.012 : y, z, m, .012); var r = []; for (var i = 0; i < 6; i++) r.push([0, -.036, z - len * .35 + i * len * .13, (w || .054) * .92, .0016, .006]); K.inst(mats().dark, r); }
function shotBarrels(K, M, z0, z1, r, y, tubeR) { var L = z0 - z1, zc = (z0 + z1) / 2; K.cyl(r, r, L, 0, y, zc, M.steel, 14); if (tubeR) { K.cyl(tubeR, tubeR, L * .82, 0, y - .034, z0 - L * .41, M.blk, 12); K.cyl(tubeR * 1.35, tubeR * 1.35, .016, 0, y - .034, z1 + L * .18 + .01, M.steel, 12); } K.cyl(r * 1.1, r * 1.1, .012, 0, y, z1 + .006, M.steel, 14); }

S('breacher', { base: 'breacher', tone: 0x4b3a28, metal: 0x3d464c, grip: [-.075, .15], fore: [-.045, -.33], muz: [.022, -.71], sightY: .052, mp: { y: -.1, z: -.04, h: .08 },
  body: function (K, C) {
    var M = C.M, W = M.wood;
    K.box(.046, .07, .26, 0, .004, .03, C.steelBody, .008); K.fbox(.0016, .03, .08, .0235, .01, .06, M.dark); K.fbox(.036, .006, .09, 0, .042, .06, M.dark);
    shotBarrels(K, M, -.1, -.7, .0145, .022, .0125); K.fbox(.01, .006, .6, 0, .0455, -.4, M.steel); K.ball(.0045, 0, .0525, -.69, M.brass);
    K.prof(huntStock(.07, .465, .032, -.1, true), .044, W, 0, .004); K.box(.05, .105, .018, 0, -.025, .468, M.rubber, .005);
    guard(K, .06, -.035, .075, M.steel);
  },
  pump: function (K, C) { forend(K, C.M.wood, -.33, .2); K.cyl(.0045, .0045, .26, .02, .0, -.2, C.M.steel, 6); K.cyl(.0045, .0045, .26, -.02, .0, -.2, C.M.steel, 6); }
});

S('ember', { base: 'breacher', tone: 0x3e4a44, metal: 0x4d5a52, grip: [-.085, .12], fore: [-.045, -.33], muz: [.022, -.6], sightY: .068, sightType: 1, mp: { y: -.1, z: -.04, h: .08 },
  body: function (K, C) {
    var M = C.M;
    K.box(.05, .076, .28, 0, .006, .0, M.blk, .01); K.box(.034, .016, .06, 0, .046, .075, M.blk, .004);
    shotBarrels(K, M, -.14, -.58, .0145, .022, .0128); K.box(.044, .02, .3, 0, .042, -.3, M.blk, .006); var v = []; for (var i = 0; i < 9; i++) v.push([0, .0525, -.17 - i * .033, .03, .0016, .014]); K.inst(M.dark, v);
    K.cyl(.017, .017, .03, 0, .022, -.57, M.blk, 12);
    K.prof([[.05, -.034], [.115, -.034], [.14, -.148], [.085, -.15]], .04, C.body, 0, .003); guard(K, .05, -.034, .085, M.blk);
    K.cyl(.02, .02, .14, 0, .006, .21, M.blk, 14); K.prof([[.26, .04], [.42, .03], [.445, -.095], [.37, -.1], [.26, -.04]], .046, C.body, 0, .004, [[[.3, .015], [.38, .012], [.395, -.05], [.33, -.052]]]); K.box(.05, .12, .016, 0, -.02, .448, M.rubber, .005);
    K.fbox(.0016, .03, .08, .0255, .014, .02, M.dark);
  },
  pump: function (K, C) { forend(K, C.body, -.33, .19, .056); },
  optic: function (K, C) { var M = C.M; K.box(.024, .02, .04, 0, .052, .075, M.blk, .004); K.put(new T.TorusGeometry(.0115, .0028, 8, 18), M.blk, 0, .068, .092); K.box(.012, .024, .02, 0, .05, -.5, M.blk, .003); K.fbox(.004, .02, .005, 0, .066, -.5, M.blk); }
});

S('hammer', { base: 'breacher', tone: 0x6b4a2a, metal: 0x5a4a38, grip: [-.065, .15], fore: [-.035, -.27], muz: [.02, -.58], sightY: .05, mp: { y: -.1, z: -.04, h: .08 },
  body: function (K, C) {
    var M = C.M, W = M.wood;
    K.box(.062, .07, .17, 0, .004, .06, C.steelBody, .008);
    // Keep the paired barrels on a breech hinge so this weapon actually opens
    // during its shell-by-shell reload instead of sharing the pump-gun motion.
    var barrels = new T.Group(); barrels.name = 'hammer-break-barrels'; barrels.position.set(0, .02, -.08);
    var BK = K.to(barrels);
    BK.cyl(.0175, .0175, .5, .0172, 0, -.25, M.steel, 14); BK.cyl(.0175, .0175, .5, -.0172, 0, -.25, M.steel, 14); BK.fbox(.012, .008, .5, 0, .0195, -.25, M.steel);
    BK.cyl(.0185, .0185, .012, .0172, 0, -.504, M.steel, 14); BK.cyl(.0185, .0185, .012, -.0172, 0, -.504, M.steel, 14); BK.ball(.0045, 0, .028, -.495, M.brass);
    K.g.add(barrels);
    var hm = [[.1, .036], [.12, .068, .116, .05], [.136, .072], [.145, .056], [.125, .036]]; K.prof(hm, .008, M.steel, .017, .001); K.prof(hm, .008, M.steel, -.017, .001);
    K.fbox(.008, .008, .06, 0, .04, .05, M.steel); K.fbox(.014, .016, .02, 0, .036, .13, C.steelBody);
    K.prof(huntStock(.07, .455, .032, -.098, true), .046, W, 0, .004); K.box(.052, .105, .018, 0, -.025, .468, M.rubber, .005);
    guard(K, .06, -.035, .075, M.steel);
    return barrels;
  },
  pump: function (K, C) { K.box(.064, .044, .15, 0, -.016, -.27, C.M.wood, .012); K.box(.07, .01, .05, 0, -.036, -.27, C.M.steel, .003); }
});

S('scatter', { base: 'breacher', tone: 0x2e3b2c, metal: 0x4a5a48, grip: [-.075, .15], fore: [-.045, -.3], muz: [.02, -.55], sightY: .052, mp: { y: -.1, z: -.04, h: .08 },
  body: function (K, C) {
    var M = C.M;
    K.box(.048, .07, .26, 0, .004, .03, M.blk, .01); K.box(.044, .02, .2, 0, .045, .04, M.blk, .006);
    shotBarrels(K, M, -.1, -.55, .0155, .02, .013); K.box(.048, .028, .26, 0, .034, -.28, C.body, .008); var v = []; for (var i = 0; i < 8; i++) v.push([0, .0485, -.17 - i * .028, .034, .0016, .012]); K.inst(M.dark, v);
    K.fbox(.008, .02, .008, 0, .04, -.54, M.brass); K.ball(.0045, 0, .052, -.54, M.brass);
    K.prof([[.06, -.03], [.15, -.03], [.2, -.12, .19, -.08], [.13, -.155]], .042, C.body, 0, .004); K.box(.046, .03, .018, 0, -.018, .2, M.rubber, .005); K.box(.04, .076, .02, 0, .0, .185, M.rubber, .006);
    guard(K, .05, -.032, .075, M.blk); K.fbox(.0016, .03, .08, .0245, .01, .05, M.dark);
  },
  pump: function (K, C) { forend(K, C.body, -.3, .19, .058); K.fbox(.062, .012, .03, 0, -.036, -.4, C.M.rubber); }
});

S('thunder', { base: 'breacher', tone: 0x3a3430, metal: 0x6b5f50, grip: [-.075, .15], fore: [-.12, -.235], muz: [.004, -.76], sightY: .056, mp: { y: -.1, z: -.04, h: .08 },
  body: function (K, C) {
    var M = C.M, g = new T.CylinderGeometry(.058, .058, .1, 28); g.rotateX(HP);
    K.box(.05, .066, .24, 0, .022, .06, M.blk, .01); K.box(.052, .05, .13, 0, .02, -.04, C.steelBody, .008);
    K.put(g, C.steelBody, 0, -.038, -.095); K.cyl(.05, .05, .104, 0, -.038, -.095, M.blk, 24);
    var r = [], i, a; for (i = 0; i < 6; i++) { a = i / 6 * Math.PI * 2 + .52; r.push([Math.cos(a) * .036, -.038 + Math.sin(a) * .036, -.1465, .0115, .0115, .004]); } K.inst(M.dark, r, true);
    var t = []; for (i = 0; i < 12; i++) { a = i / 12 * Math.PI * 2; t.push([Math.cos(a) * .0585, -.038 + Math.sin(a) * .0585, -.095, .0024, .0024, .098]); } K.inst(M.steel, t, true);
    K.cyl(.0155, .0155, .6, 0, .005, -.46, M.steel, 14); K.box(.03, .024, .3, 0, .026, -.4, M.blk, .006); K.cyl(.022, .022, .04, 0, .005, -.745, M.blk, 14);
    K.fbox(.008, .02, .008, 0, .03, -.75, M.brass); K.fbox(.014, .02, .02, 0, .062, .04, M.blk);
    K.prof([[.06, -.025], [.12, -.025], [.15, -.15], [.1, -.155]], .04, M.poly, 0, .003); guard(K, .06, -.028, .08, M.blk);
    K.cyl(.005, .005, .3, .03, .0, .27, M.steel, 8); K.cyl(.005, .005, .3, -.03, .0, .27, M.steel, 8); K.box(.058, .1, .02, 0, -.01, .44, M.rubber, .006);
  },
  pump: function (K, C) { K.prof([[-.262, -.06], [-.2, -.06], [-.205, -.175], [-.26, -.18]], .04, C.M.poly, 0, .003); K.box(.046, .014, .07, 0, -.058, -.232, C.M.blk, .004); }
});

/* ---------- apply: swap a freshly built legacy gun body for the realistic model ---------- */
function apply(g, key, H) {
  var sp = SPECS[key]; if (!sp || !g || g.userData.realism) return false;
  var M = mats(), ud = g.userData, leg = { mag: ud.mag, fresh: ud.fresh, ch: ud.ch, pump: ud.pump, left: ud.left, muz: ud.muzzle, flash: ud.flash, mp: ud.mp };
  function hand(o) { return o.isMesh && (o.material === H.mGlove || o.material === H.mSleeve); }
  g.traverse(function (n) { if (!n.isMesh || n === leg.flash || hand(n)) return; n.visible = false; });
  // right hand follows the new grip
  var palm = null; g.children.forEach(function (c) { if (!palm && c.isMesh && c.material === H.mGlove) palm = c; });
  if (palm && sp.grip) { var dy = sp.grip[0] - palm.position.y, dz = sp.grip[1] - palm.position.z; g.children.forEach(function (c) { if (hand(c)) { c.position.y += dy; c.position.z += dz; } }); }
  // support hand follows the new forend
  function firstGlove(grp) { var r = null; grp.children.forEach(function (c) { if (!r && c.isMesh && c.material === H.mGlove) r = c; }); return r; }
  if (leg.left && sp.fore) { var lp = firstGlove(leg.left); if (lp) leg.left.position.set(0, sp.fore[0] - lp.position.y, sp.fore[1] - lp.position.z); }
  if (leg.pump && sp.fore) { var pp = firstGlove(leg.pump); if (pp) { var py = sp.fore[0] - pp.position.y, pz = sp.fore[1] - pp.position.z; leg.pump.children.forEach(function (c) { if (hand(c)) { c.position.y += py; c.position.z += pz; } }); } }
  var C = { M: M, body: tone(sp.tone || 0x3a4147, 'poly'), steelBody: tone(sp.metal || 0x4a5157, 'metal'), accent: sp.accent ? tone(sp.accent, 'poly') : null, g: g };
  var ext = new T.Group(); ext.name = 'unique-chassis-' + key; var K = new Kit(ext);
  var bodyAnimation = sp.body(K, C);
  if (bodyAnimation && bodyAnimation.isObject3D) ud.breakAction = bodyAnimation;
  // Tube-fed shotguns hold the support glove on the forend group. Expose that
  // same authored group to reload animation rather than moving a stale arm.
  if (key === 'hammer' || key === 'breacher' || key === 'scatter' || key === 'ember' || key === 'thunder') ud.sightlineSupportHand = leg.pump || leg.left;
  if (sp.bolt && leg.ch) sp.bolt(new Kit(leg.ch), C);
  if (sp.pump && leg.pump) sp.pump(new Kit(leg.pump), C);
  if (sp.mag) {
    var feed = new T.Group(); feed.name = 'feed-' + key; sp.mag(new Kit(feed), C); ext.add(feed);
    if (leg.mag) leg.mag.visible = false; if (leg.fresh) leg.fresh.visible = false;
    var fresh = feed.clone(true); fresh.visible = false; ext.add(fresh);
    var fk = new Kit(fresh); fk.fbox(.07, .05, .082, -.06, -.2, .13, H.mGlove);
    var sl = fk.fbox(.068, .07, .26, -.11, -.33, .25, H.mSleeve); sl.rotation.x = .28;
    ud.mag = feed; ud.fresh = fresh; ud.mp = { y: sp.mp.y, z: sp.mp.z, h: sp.mp.h, ch: leg.mp ? leg.mp.ch : .05 };
  }
  if (sp.optic && !(H.hasOptics && H.hasOptics(key))) {
    var og = new T.Group(); og.name = 'profile-optic-' + key; sp.optic(new Kit(og), C); og.userData.sightType = sp.sightType || 3; ext.add(og); ud.profileOptic = og;
  }
  if (leg.muz) { leg.muz.position.set(0, sp.muz[0], sp.muz[1]); if (leg.flash) leg.flash.position.copy(leg.muz.position); }
  ud.sightY = sp.sightY; ud.design = key; ud.realism = true;
  if (ud.optic) ud.optic.visible = false;
  g.add(ext);
  var stale = []; g.traverse(function (n) { if (n.isMesh && !n.visible && n !== leg.flash && n.parent) stale.push(n); });
  stale.forEach(function (n) { n.parent.remove(n); });
  g.scale.set(1, 1, 1);
  return true;
}

global.SightlineRealism = {
  version: 'P11.6',
  has: function (k) { return !!SPECS[k]; },
  base: function (k) { return SPECS[k] && SPECS[k].base; },
  keys: function () { return Object.keys(SPECS); },
  apply: apply
};
})(window);

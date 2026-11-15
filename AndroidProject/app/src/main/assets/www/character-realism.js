/* Sightline realistic operatives (P11.7).
   Replaces the shared box-doll rig with anatomically proportioned, individually designed characters.
   Cosmetic only: same rig contract (g, torso, head, legs, legR, arms, rifle, flash, mats), same
   overall height/width envelope, same baked 3-mesh pipeline. Hitboxes/gameplay untouched. */
(function (root) {
'use strict';
var T = root.THREE; if (!T) return;
var PI = Math.PI, HP = PI / 2;

function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function RNG(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hexRGB(h) { var n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(r, g, b) { function c(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); } return '#' + c(r) + c(g) + c(b); }
function mul(h, f) { var c = hexRGB(h); return rgbHex(c[0] * f, c[1] * f, c[2] * f); }
function mix(a, b, t) { var x = hexRGB(a), y = hexRGB(b); return rgbHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }

/* ---------- authored identities (named operatives) ---------- */
var NAMED = {
  ashfall:   { g: 'm', bulk: 1.16, sh: 1.1, jaw: 1.12, nose: 1.1, brow: 1.3, eye: '#3b2a1b', hair: 'buzz', beard: 'full', carrier: 'heavy', pack: 'none', kneepads: 1, extra: 'ammo', glasses: 0, scar: 'cheek' },
  flint:     { g: 'f', bulk: .9, sh: .94, jaw: .9, nose: .95, brow: .9, eye: '#2a1c12', hair: 'braids', beard: 'none', carrier: 'light', pack: 'scope', kneepads: 0, extra: 'goggles', glasses: 0, scar: 'none' },
  kindle:    { g: 'm', bulk: .94, sh: .98, jaw: .96, nose: 1.0, brow: .9, eye: '#5d86a6', hair: 'messy', beard: 'stubble', carrier: 'rig', pack: 'none', kneepads: 0, extra: 'goggles', glasses: 0, scar: 'brow' },
  smolder:   { g: 'f', bulk: 1.05, sh: 1.02, jaw: 1.0, nose: .92, brow: 1.0, eye: '#4a3224', hair: 'ponytail', beard: 'none', carrier: 'heavy', pack: 'tool', kneepads: 1, extra: 'safety', glasses: 1, scar: 'none' },
  ember:     { g: 'f', bulk: .88, sh: .92, jaw: .86, nose: .88, brow: .85, eye: '#4e7f58', hair: 'ponytail', beard: 'none', carrier: 'light', pack: 'hydro', kneepads: 0, extra: 'headset', glasses: 2, scar: 'none', freckles: 1 },
  riptide:   { g: 'f', bulk: 1.0, sh: 1.0, jaw: .95, nose: .98, brow: .95, eye: '#2e2118', hair: 'bob', beard: 'none', carrier: 'standard', pack: 'radio', kneepads: 0, extra: 'holster', glasses: 0, scar: 'none' },
  squall:    { g: 'm', bulk: 1.26, sh: 1.16, jaw: 1.2, nose: 1.15, brow: 1.2, eye: '#6a8fa5', hair: 'crop', beard: 'full', carrier: 'heavy', pack: 'none', kneepads: 1, extra: 'ammo', glasses: 0, scar: 'none' },
  halyard:   { g: 'm', bulk: .96, sh: 1.0, jaw: 1.0, nose: 1.1, brow: 1.0, eye: '#2a1b10', hair: 'curly', beard: 'goatee', carrier: 'light', pack: 'sail', kneepads: 0, extra: 'scarf', glasses: 0, scar: 'none' },
  undertow:  { g: 'm', bulk: .92, sh: .96, jaw: .98, nose: 1.0, brow: 1.0, eye: '#3f5a3a', hair: 'undercut', beard: 'stubble', carrier: 'harness', pack: 'tank', kneepads: 0, extra: 'divemask', glasses: 0, scar: 'chin' },
  skerry:    { g: 'f', bulk: .88, sh: .92, jaw: .88, nose: .9, brow: .85, eye: '#7a9db2', hair: 'longbraid', beard: 'none', carrier: 'light', pack: 'optics', kneepads: 0, extra: 'wool', glasses: 0, scar: 'none', freckles: 1 }
};
var HAIRS = ['crop', 'buzz', 'messy', 'ponytail', 'bob', 'curly', 'undercut', 'braids', 'longbraid', 'bun', 'side', 'afro', 'bald'];
var BEARDS = ['none', 'none', 'stubble', 'goatee', 'full', 'mustache'];
var CARRIERS = ['standard', 'light', 'heavy', 'rig', 'harness'];
var PACKS = ['assault', 'radio', 'hydro', 'tool', 'none', 'medic', 'tank'];
var EXTRAS = ['goggles', 'headset', 'holster', 'scarf', 'ammo', 'safety', 'wool', 'none'];
var EYES = ['#2e2118', '#4a3224', '#3f5a3a', '#5d86a6', '#6a8fa5', '#4e7f58', '#7a9db2', '#3b2a1b'];

function specFor(op) {
  var id = String(op.sourceId || op.id), base = NAMED[id], r = RNG(hash(id) ^ 0x9e3779b9);
  function pick(a) { return a[Math.floor(r() * a.length)]; }
  var g = r() < .46 ? 'f' : 'm';
  var s = base ? Object.assign({}, base) : {
    g: g, bulk: .86 + r() * .4, sh: .9 + r() * .26, jaw: .84 + r() * .4, nose: .86 + r() * .3, brow: .8 + r() * .55, eye: pick(EYES),
    hair: pick(HAIRS), beard: g === 'f' ? 'none' : pick(BEARDS), carrier: pick(CARRIERS), pack: pick(PACKS), kneepads: r() < .4 ? 1 : 0,
    extra: pick(EXTRAS), glasses: r() < .18 ? 1 + Math.floor(r() * 2) : 0, scar: r() < .2 ? pick(['cheek', 'brow', 'chin']) : 'none', freckles: r() < .22 ? 1 : 0
  };
  if (s.g === 'f') { s.sh *= .95; }
  s.r = RNG(hash(id) ^ 0x51ed270b);
  return s;
}
root.__scSpecFor = specFor;

/* ---------- team themes (CS-inspired archetypes, original designs, no real insignia) ---------- */
var THEMES = {
  /* RED: irregular fighters */
  phoenix:   { team: 'red', pal: ['#26292b', '#181a1c', '#3b4043', '#0f1011'], vest: '#1d1f20', gear: '#2a2d2e', head: 'balaclava', face: 'none', camo: 4, carrier: 'rig', pack: 'none', extra: 'ammo', jacket: 1, grenade: 1, glasses: 0, beard: 'none', hair: 'buzz', kneepads: 1, wrap: '#15171a' },
  guerrilla: { team: 'red', pal: ['#5e4c33', '#43361f', '#7d6a46', '#2b2315'], vest: '#3a2c1c', gear: '#4a3a26', head: 'headband', face: 'none', camo: 4, carrier: 'harness', pack: 'none', extra: 'ammo', jacket: 1, grenade: 1, glasses: 0, beard: 'full', hair: 'messy', kneepads: 0, wrap: '#8a1c14' },
  shemagh:   { team: 'red', pal: ['#7b6b4b', '#564a30', '#9b8961', '#3a3220'], vest: '#3d352a', gear: '#52483a', head: 'shemagh', face: 'scarf', camo: 4, carrier: 'rig', pack: 'scope', extra: 'ammo', jacket: 1, grenade: 0, glasses: 2, beard: 'goatee', hair: 'crop', kneepads: 0, wrap: '#b3a78a', wrap2: '#2a2a2a' },
  arctic:    { team: 'red', pal: ['#bfc4c6', '#9ea6a8', '#d9dddd', '#7a8284'], vest: '#6b7174', gear: '#8d9597', head: 'arctic', face: 'scarf', camo: 2, carrier: 'light', pack: 'assault', extra: 'goggles', jacket: 1, grenade: 0, glasses: 0, beard: 'stubble', hair: 'crop', kneepads: 1, wrap: '#c9ced0' },
  militia:   { team: 'red', pal: ['#3b473c', '#28332b', '#55664f', '#1b231d'], vest: '#2c2f2b', gear: '#39403a', head: 'beanie', face: 'mask', camo: 4, carrier: 'rig', pack: 'tool', extra: 'ammo', jacket: 1, grenade: 1, glasses: 0, beard: 'stubble', hair: 'crop', kneepads: 0, wrap: '#1d1f1f' },
  elite:     { team: 'red', pal: ['#2a2d31', '#1b1e21', '#40454b', '#111315'], vest: '#202326', gear: '#2e3236', head: 'turban', face: 'scarf', camo: 4, carrier: 'standard', pack: 'radio', extra: 'headset', jacket: 0, grenade: 1, glasses: 0, beard: 'full', hair: 'crop', kneepads: 1, wrap: '#1c1e20' },
  /* BLUE: regular forces */
  army:      { team: 'blue', pal: ['#7a7a5e', '#555741', '#98966f', '#38392a'], vest: '#5b5c46', gear: '#4a4b39', head: 'helmet', face: 'none', camo: 1, carrier: 'standard', pack: 'radio', extra: 'headset', camoHelmet: 1, glasses: 1, beard: 'none', hair: 'buzz', kneepads: 1, molle: 1 },
  swat:      { team: 'blue', pal: ['#222d3e', '#161e2c', '#32435c', '#0e131d'], vest: '#161b24', gear: '#1d2430', head: 'visorhelmet', face: 'mask', camo: 4, carrier: 'heavy', pack: 'none', extra: 'holster', glasses: 0, beard: 'none', hair: 'buzz', kneepads: 1, molle: 1 },
  ranger:    { team: 'blue', pal: ['#56623e', '#38412a', '#738258', '#232a19'], vest: '#46513a', gear: '#3a4430', head: 'boonie', face: 'none', camo: 0, carrier: 'standard', pack: 'optics', extra: 'none', camoHelmet: 1, glasses: 0, beard: 'none', hair: 'crop', kneepads: 1, molle: 1, paint: 1 },
  marine:    { team: 'blue', pal: ['#5c6649', '#3d4533', '#80906a', '#272d1f'], vest: '#4c5540', gear: '#3b4331', head: 'patrol', face: 'none', camo: 1, carrier: 'light', pack: 'assault', extra: 'goggles', camoHelmet: 1, glasses: 0, beard: 'none', hair: 'buzz', kneepads: 1, molle: 1 },
  gsg:       { team: 'blue', pal: ['#3b424b', '#272c33', '#59626e', '#191c21'], vest: '#20252c', gear: '#2b313a', head: 'visorhelmet', face: 'mask', camo: 4, carrier: 'heavy', pack: 'medic', extra: 'headset', glasses: 0, beard: 'none', hair: 'buzz', kneepads: 1, molle: 1 }
};
var NAMED_THEME = { ashfall: 'shemagh', flint: 'shemagh', kindle: 'guerrilla', smolder: 'militia', ember: 'arctic', riptide: 'army', squall: 'gsg', halyard: 'marine', undertow: 'swat', skerry: 'ranger' };
var RED_T = ['phoenix', 'guerrilla', 'shemagh', 'arctic', 'militia', 'elite'], BLUE_T = ['army', 'swat', 'ranger', 'marine', 'gsg'];
function themeFor(op) {
  if (op.style && op.style !== 'default') return null;          // outfit skins keep their own look
  var id = String(op.sourceId || op.id), t = NAMED_THEME[id];
  if (!t) { var list = op.team === 'red' ? RED_T : BLUE_T; t = list[hash(id + 'theme') % list.length]; }
  return THEMES[t] ? Object.assign({ name: t }, THEMES[t]) : null;
}
root.__scThemeFor = themeFor;

/* ---------- geometry kit ---------- */
var rbCache = {};
function rbox(w, h, d, r) {
  r = Math.min(r == null ? .012 : r, w * .45, h * .45, d * .45);
  var k = [w, h, d, r].map(function (n) { return Math.round(n * 10000); }).join('_'); if (rbCache[k]) return rbCache[k];
  var g = new T.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, n = g.attributes.normal, v = new T.Vector3();
  var hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  function rm(val, half, inner) { var a = Math.abs(val), s = val < 0 ? -1 : 1; return a > half * .99 ? s * half : (a > 1e-9 ? s * inner : 0); }
  for (var i = 0; i < p.count; i++) {
    var x = rm(p.getX(i), w / 2, hx), y = rm(p.getY(i), h / 2, hy), z = rm(p.getZ(i), d / 2, hz);
    var ix = Math.max(-hx, Math.min(hx, x)), iy = Math.max(-hy, Math.min(hy, y)), iz = Math.max(-hz, Math.min(hz, z));
    v.set(x - ix, y - iy, z - iz); var l = v.length();
    if (l > 1e-7) { v.divideScalar(l); p.setXYZ(i, ix + v.x * r, iy + v.y * r, iz + v.z * r); n.setXYZ(i, v.x, v.y, v.z); } else p.setXYZ(i, x, y, z);
  }
  return (rbCache[k] = g);
}
var sphCache = {}, LITE = false;
function sph(seg, ring, phiS, phiL, thS, thL) {
  if ((seg || 12) < 14 || LITE) { var q = LITE ? .6 : .75; seg = Math.max(5, Math.round((seg || 12) * q)); ring = Math.max(3, Math.round((ring || 8) * q)); }
  var k = [LITE, seg, ring, phiS, phiL, thS, thL].join('_');
  return sphCache[k] || (sphCache[k] = new T.SphereGeometry(1, seg || 12, ring || 8, phiS || 0, phiL == null ? PI * 2 : phiL, thS || 0, thL == null ? PI : thL));
}
function cylg(rt, rb, h, seg, open, ts, tl) { return new T.CylinderGeometry(rt, rb, h, seg || 10, 1, !!open, ts || 0, tl == null ? PI * 2 : tl); }

/* ---------- builder ---------- */
function build(op, env) {
  LITE = !!env.lite;
  var TEAM = env.TEAMS[op.team], S = specFor(op), R = S.r, g = new T.Group(), style = op.style || 'default', TH = themeFor(op);
  // Keep each authored identity's body and face proportions; the former global male override
  // erased the intentional Riptide/flint/other named silhouettes.
  if (TH) { ['carrier', 'pack', 'extra', 'glasses', 'kneepads', 'hair'].forEach(function (k) { if (TH[k] != null) S[k] = TH[k]; }); S.beard = TH.beard; if (TH.name === 'guerrilla' || TH.name === 'elite') S.bulk = Math.max(S.bulk, 1.06); }
  else if (S.beard === 'none' && (hash(op.id) % 3)) S.beard = 'stubble';
  var matCache = {};
  function L(c) { c = typeof c === 'number' ? '#' + ('000000' + c.toString(16)).slice(-6) : c; return matCache[c] || (matCache[c] = new T.MeshLambertMaterial({ color: c })); }
  var camo = env.camo(op);
  var mShirt = new T.MeshLambertMaterial({ map: camo, color: 0xf2f2f2 }), mSleeve = new T.MeshLambertMaterial({ map: camo, color: 0xe6e6e6 }), mPants = new T.MeshLambertMaterial({ map: camo, color: 0xb4b4b4 });
  var skin = mul(op.skin || '#c28a62', .8), skinSh = mul(skin, .82), skinHi = mix(skin, '#ffffff', .1), lipC = mix(skin, '#9c4a46', .38), blushC = mix(skin, '#c4605a', .22);
  var hairC = op.hair || '#1d1410', vestC = TH ? TH.vest : (op.vest || '#2a2a2c'), gearC = TH ? TH.gear : (op.gear || '#3b2926');
  var podC = mix('#2b2d28', gearC, .22), vestM = L(vestC), vestD = L(mul(vestC, .72)), gearM = L(podC), gearD = L(mul(podC, .72)), webM = L('#3d4140'), bkl = L('#8a918a'), blk = L('#16181a');
  var accent = L(TEAM.color), accentD = L(mul(TEAM.color, .7));
  var bootC = TH && TH.team === 'blue' ? ['#2b251d', '#3a3124', '#1b1d1f'][Math.floor(R() * 3)] : ['#17130f', '#2a1f16', '#1b1d1f', '#2e271c'][Math.floor(R() * 4)];
  var gloveC = ['#1a1a1a', '#2c2a24', '#3b362a'][Math.floor(R() * 3)];
  var bs = S.bulk, shw = S.sh * (S.g === 'f' ? .96 : 1);
  var all = [];
  function P(parent, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
    var m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); parent.add(m); all.push(m); return m;
  }
  function box(parent, w, h, d, mat, x, y, z, rx, ry, rz, r) { var big = Math.max(w, h, d) > .16; return P(parent, (r === 0 || !big) ? new T.BoxGeometry(w, h, d) : rbox(w, h, d, r), mat, x, y, z, rx, ry, rz); }
  function limb(parent, a, b, r0, r1, mat, seg) { // tapered capsule from a to b (r0 at a, r1 at b)
    var dir = new T.Vector3().subVectors(b, a), len = dir.length(); dir.normalize();
    var m = new T.Mesh(new T.CylinderGeometry(r1, r0, len, seg || 9, 1), mat); m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir); parent.add(m); all.push(m);
    P(parent, sph(9, 6), mat, a.x, a.y, a.z, 0, 0, 0, r0, r0, r0); P(parent, sph(9, 6), mat, b.x, b.y, b.z, 0, 0, 0, r1, r1, r1); return m;
  }
  var V = function (x, y, z) { return new T.Vector3(x, y, z); };

  /* ----- torso (lathe, elliptical) ----- */
  var f = S.g === 'f';
  var prof = [[.001, .80], [.19, .82], [f ? .225 : .205, .90], [f ? .2 : .213, 1.0], [.222, 1.12], [.24, 1.25], [.252, 1.36], [.23, 1.455], [.165, 1.515], [.09, 1.555], [.001, 1.57]].map(function (p) { return new T.Vector2(p[0], p[1]); });
  var tg = new T.LatheGeometry(prof, LITE ? 12 : 16); tg.scale(shw * Math.pow(bs, .5), 1, .68 * Math.pow(bs, .4));
  var torso = P(g, tg, mShirt, 0, 0, 0);
  // collar + neck
  P(g, cylg(.056, .066, .14, 10), L(skinSh), 0, 1.585, 0);
  var collar = P(g, cylg(.088, .1, .05, 14, true), mShirt, 0, 1.54, 0); collar.scale.z = .95;
  // deltoids
  [-1, 1].forEach(function (s) { P(g, sph(10, 7), mSleeve, s * .292 * shw, 1.475, -.01, 0, 0, 0, .082, .08, .085); });

  /* ----- arms (static rifle-ready pose, baked) ----- */
  var rS = V(.33 * shw, 1.47, -.02), rE = V(.385 * shw, 1.225, .045), rH = V(.175, 1.255, -.26);
  var lS = V(-.33 * shw, 1.47, -.03), lE = V(-.275, 1.205, -.2), lH = V(.07, 1.285, -.42);
  var arms = [];
  function arm(sh, el, ha, side) {
    var ag = new T.Group(); ag.position.copy(sh); g.add(ag);
    function local(p) { return p.clone().sub(sh); }
    var shoulder = V(0, 0, 0), elbow = local(el), handPoint = local(ha);
    limb(ag, shoulder, elbow, .063, .052, mSleeve); // upper
    var rolled = R() < .35, wristWorld = el.clone().lerp(ha, .86), wrist = local(wristWorld);
    limb(ag, elbow, wrist, .052, .042, mSleeve);
    if (rolled) { var rl = local(el.clone().lerp(ha, .45)); limb(ag, rl, wrist, .042, .037, L(skin)); P(ag, cylg(.052, .052, .03, 10), mSleeve, rl.x, rl.y, rl.z, 0, 0, 0).quaternion.setFromUnitVectors(V(0, 1, 0), V().subVectors(ha, el).normalize()); }
    // glove / hand
    var d = V().subVectors(handPoint, wrist).normalize(), hand = new T.Mesh(rbox(.072, .046, .105, .012), L(gloveC)); hand.position.copy(wrist).addScaledVector(d, .045); hand.quaternion.setFromUnitVectors(V(0, 0, -1), d); ag.add(hand); all.push(hand);
    var th = new T.Mesh(rbox(.024, .026, .06, .008), L(gloveC)); th.position.copy(hand.position).add(V(-side * .04, .02, -.01)); ag.add(th); all.push(th);
    // Carry the segmented glove construction from the v12.8 character source into
    // the current articulated arm group. Details are local to the palm, so they
    // follow aim/reload posing and are baked into the existing arm draw.
    var handDetail = new T.Group(); handDetail.position.copy(hand.position); handDetail.quaternion.copy(hand.quaternion); ag.add(handDetail);
    var gloveRaised = L(mul(gloveC, 1.22)), gloveSeam = L(mul(gloveC, .68));
    function finger(a, b, r0, r1, mat) {
      var va = V(a[0], a[1], a[2]), vb = V(b[0], b[1], b[2]), delta = V().subVectors(vb, va), len = delta.length();
      var mesh = new T.Mesh(cylg(r1, r0, len, 6), mat); mesh.position.copy(va).add(vb).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize()); handDetail.add(mesh); all.push(mesh);
    }
    [-.025, -.009, .009, .025].forEach(function (x) {
      finger([x, -.004, -.027], [x * .96, -.005, -.077], .0072, .0048, gloveRaised);
      finger([x, .002, -.048], [x, .002, -.052], .009, .009, gloveSeam);
    });
    // A low profile knuckle bar and cuff seams read as glove construction at
    // gameplay distance without changing the hand envelope or palm position.
    var knuckle = new T.Mesh(rbox(.055, .009, .012, .003), gloveRaised); knuckle.position.set(0, .022, -.035); handDetail.add(knuckle); all.push(knuckle);
    [-.012, .012].forEach(function (x) { var seam = new T.Mesh(rbox(.003, .036, .003, .001), gloveSeam); seam.position.set(x, -.019, .032); handDetail.add(seam); all.push(seam); });
    P(ag, cylg(.04, .042, .05, 10), L(mul(gloveC, 1.2)), wrist.x, wrist.y, wrist.z, 0, 0, 0).quaternion.setFromUnitVectors(V(0, 1, 0), d); // gauntlet cuff
    // elbow pad + team patch
    if (S.kneepads || R() < .3) { var ep = new T.Mesh(rbox(.07, .07, .045, .015), vestD); ep.position.copy(elbow).add(V(side * .02, -.0, .035)); ag.add(ep); all.push(ep); }
    return ag;
  }
  var armR = arm(rS, rE, rH, 1), armL = arm(lS, lE, lH, -1), lS_ = lS, lE_ = lE;
  // faction patch on the shoulder (left) and ribbon (right)
  box(g, .012, .085, .075, accent, -.386 * shw, 1.40, -.04, .08, 0, .04, 0); box(g, .012, .055, .06, accentD, .39 * shw, 1.40, -.01, .0, 0, -.03, 0);

  /* ----- hips / belt ----- */
  var belt = P(g, cylg(.218, .222, .055, 18, true), L('#26282a'), 0, .93, 0); belt.scale.set(shw * Math.pow(bs, .5), 1, .7 * Math.pow(bs, .4));
  box(g, .06, .05, .02, bkl, 0, .93, -.168, 0, 0, 0, .004);
  [-.15, .15].forEach(function (x) { box(g, .075, .1, .06, gearM, x * shw, .86, -.14, .12 * Math.sign(x) * -.5, 0, 0, .01); });
  if (TH && TH.jacket) {                                                     // field jacket hem + pockets
    var hem = P(g, cylg(.23, .285, .2, 18, true), mShirt, 0, .87, 0); hem.scale.set(shw * Math.pow(bs, .5), 1, .72 * Math.pow(bs, .4));
    [-1, 1].forEach(function (s) { box(g, .09, .09, .03, mSleeve, s * .17 * shw, .83, -.2, -.12, 0, 0, 0); });
  }
  // red-team armband / blue-team shoulder flash (plain colour, no real insignia)
  (function () { var a = lS_.clone().lerp(lE_, .5), d = V().subVectors(lE_, lS_).normalize(), ab = new T.Mesh(cylg(.073, .069, .07, 12, true), TH && TH.team === 'red' ? L('#a3201a') : accent); ab.position.copy(a); ab.quaternion.setFromUnitVectors(V(0, 1, 0), d); g.add(ab); all.push(ab); })();

  /* ----- load-bearing gear ----- */
  var heavy = S.carrier === 'heavy' || style === 'vanguard', cw = S.carrier === 'light' ? .27 : .31;
  function magPouch(x, y, z, w) { box(g, w || .072, .105, .05, gearM, x, y, z, 0, 0, 0, .008); box(g, (w || .072) * .9, .03, .02, gearD, x, y + .02, z - .028, 0, 0, 0, 0); P(g, cylg(.012, .014, .05, 6), blk, x, y + .07, z + .0); }
  function frontBack(front) {
    var pw = front ? cw : cw - .02, ph = front ? (S.carrier === 'light' ? .3 : .36) : .34;
    box(g, pw * shw, ph, front ? .06 : .055, vestM, 0, 1.285, front ? -.176 : .176, 0, 0, 0, .018);
  }
  if (S.carrier !== 'rig' && S.carrier !== 'harness') {
    frontBack(true); frontBack(false);
    [-1, 1].forEach(function (s) { box(g, .05, .09, .35, vestD, s * .17 * shw, 1.5, 0, 0, 0, s * .45, .01); }); // shoulder straps
    if (S.carrier !== 'light') { var cb = P(g, cylg(.236, .24, .16, 18, true), vestD, 0, 1.06, 0); cb.scale.set(shw * Math.pow(bs, .5) * 1.0, 1, .72 * Math.pow(bs, .4)); }
    var pz = -.222; [-.105, 0, .105].forEach(function (x) { magPouch(x * shw, 1.17, pz, .088); });
    box(g, .1, .075, .05, gearM, .13 * shw, 1.36, -.21, 0, 0, 0, .008); box(g, .085, .028, .008, accent, -.1 * shw, 1.37, -.213, 0, 0, 0, 0);
    box(g, .15, .018, .008, bkl, 0, 1.24, -.208, 0, 0, 0, 0);
    box(g, .09, .12, .07, gearD, -.205 * shw, .98, -.1, 0, 0, 0, .01); box(g, .09, .12, .07, gearM, .205 * shw, .98, -.1, 0, 0, 0, .01);
    if (S.carrier === 'standard' || heavy) box(g, .13, .08, .06, gearD, 0, .96, -.18, 0, 0, 0, .01); // dump pouch
    if (TH && TH.molle) { for (var mr = 0; mr < 2; mr++) for (var mc = 0; mc < 5; mc++) box(g, .045, .012, .008, vestD, (-.1 + mc * .05) * shw, 1.37 - mr * .045 + (mr ? 0 : 0), -.209, 0, 0, 0, 0); box(g, .09, .035, .008, L(mul(TH.pal[2], .9)), .06 * shw, 1.255, -.209, 0, 0, 0, 0); } // webbing + blank name tape
  } else if (S.carrier === 'rig') {
    box(g, .34 * shw, .17, .06, vestM, 0, 1.2, -.19, 0, 0, 0, .014);
    for (var i = 0; i < 4; i++) magPouch((-.12 + i * .08) * shw, 1.19, -.228, .066);
    [-1, 1].forEach(function (s) { box(g, .045, .3, .02, webM, s * .115 * shw, 1.35, -.192, 0, 0, s * -.08, 0); box(g, .045, .3, .02, webM, s * .115 * shw, 1.35, .192, 0, 0, s * .08, 0); });
    box(g, .03, .34, .014, webM, 0, 1.3, .2, 0, 0, .5, 0); box(g, .03, .34, .014, webM, 0, 1.3, .2, 0, 0, -.5, 0);
  } else { // harness
    [-1, 1].forEach(function (s) { box(g, .045, .4, .02, webM, s * .11 * shw, 1.3, -.19, 0, 0, s * -.05, 0); box(g, .045, .4, .02, webM, s * .11 * shw, 1.3, .19, 0, 0, s * .05, 0); });
    box(g, .3, .04, .02, webM, 0, 1.2, -.2, 0, 0, 0, 0); P(g, new T.TorusGeometry(.022, .006, 5, 10), bkl, -.12, 1.27, -.21); P(g, new T.TorusGeometry(.022, .006, 5, 10), bkl, .12, 1.27, -.21);
    box(g, .1, .12, .06, gearM, .21 * shw, 1.0, -.08, 0, 0, 0, .01); box(g, .1, .12, .06, gearD, -.21 * shw, 1.0, -.08, 0, 0, 0, .01);
  }
  if (heavy) {
    [-1, 1].forEach(function (s) { P(g, sph(10, 6, 0, PI * 2, 0, 1.45), vestM, s * .33 * shw, 1.51, -.01, 0, 0, s * -.35, .115, .09, .115); });
    box(g, .12, .12, .05, vestM, 0, .86, -.18, 0, 0, 0, .012); // groin flap
  }
  // role identification kit
  var role = (op.role || '').toLowerCase();
  if (/marksman|scout/.test(role)) { box(g, .08, .11, .08, gearM, .3 * shw, 1.1, .14, 0, 0, 0, .01); }
  else if (/heavy|anchor|support/.test(role) || S.extra === 'ammo') { [0, 1, 2, 3, 4, 5].forEach(function (i) { P(g, cylg(.017, .017, .075, 7), L('#a9893f'), -.16 + i * .064, 1.33 - i * .045, -.235, 0, 0, HP * 0 + .5); }); box(g, .26, .02, .02, webM, 0, 1.33, -.225, 0, 0, -.62, 0);
    if (TH && (TH.name === 'guerrilla' || TH.name === 'phoenix')) { [0, 1, 2, 3, 4, 5].forEach(function (i) { P(g, cylg(.017, .017, .075, 7), L('#a9893f'), .16 - i * .064, 1.33 - i * .045, -.24, 0, 0, -.5); }); box(g, .26, .02, .02, webM, 0, 1.33, -.23, 0, 0, .62, 0); } }
  else if (/breach|rusher|assault/.test(role)) { box(g, .1, .15, .08, gearD, -.33 * shw, .88, .02, 0, 0, 0, .01); }
  if (TH && TH.grenade) { [-.2, -.145].forEach(function (x, i) { P(g, cylg(.022, .022, .07, 8), L('#4b5238'), x * shw, 1.1 - i * .01, -.245); box(g, .014, .028, .014, bkl, x * shw, 1.15 - i * .01, -.245, 0, 0, 0, 0); }); }
  // sidearm
  if (S.extra === 'holster') { box(g, .045, .16, .09, L('#202225'), .215 * shw, .88, -.06, 0, 0, 0, .01); box(g, .028, .06, .08, L('#2f3236'), .215 * shw, .98, -.06, 0, 0, 0, .006); }

  /* ----- backpack ----- */
  var pk = S.pack, pz2 = .24;
  function strap(s) { box(g, .04, .3, .012, webM, s * .12 * shw, 1.38, .17, 0, 0, 0, 0); }
  if (pk === 'assault' || pk === 'medic' || pk === 'hydro' || pk === 'sail') {
    var big = pk === 'assault' || pk === 'sail', pw = big ? .3 : .24, ph = big ? .4 : .46;
    box(g, pw, ph, big ? .16 : .1, gearM, 0, 1.3, .27, 0, 0, 0, .03);
    if (big) { box(g, .1, .17, .06, gearD, -.09, 1.2, .365, 0, 0, 0, .014); box(g, .1, .17, .06, gearD, .09, 1.2, .365, 0, 0, 0, .014); P(g, cylg(.055, .055, .31, 10), L('#5d6a52'), 0, 1.52, .27, 0, 0, HP); }
    if (pk === 'medic') { box(g, .09, .09, .012, L('#e9e9e4'), 0, 1.3, .326, 0, 0, 0, 0); box(g, .09, .03, .014, L('#b3261e'), 0, 1.3, .327, 0, 0, 0, 0); box(g, .03, .09, .014, L('#b3261e'), 0, 1.3, .327, 0, 0, 0, 0); }
    if (pk === 'hydro') P(g, cylg(.005, .005, .5, 5), blk, .08, 1.45, .0, .3, 0, .0).position.set(.12, 1.52, .09);
    if (pk === 'sail') P(g, new T.TorusGeometry(.07, .022, 6, 12), L('#c8b98f'), 0, 1.15, .36, 0, 0, 0);
    strap(-1); strap(1);
  } else if (pk === 'radio') { box(g, .2, .3, .1, L('#2e342f'), -.04, 1.3, .24, 0, 0, 0, .015); P(g, cylg(.006, .006, .72, 5), blk, .05, 1.62, .27); box(g, .06, .06, .04, gearD, .05, 1.4, .3, 0, 0, 0, .008); strap(-1); strap(1); }
  else if (pk === 'tool') { box(g, .26, .3, .12, gearM, 0, 1.25, .25, 0, 0, 0, .02); box(g, .035, .55, .035, L('#7e8387'), .09, 1.34, .335, 0, 0, .45, 0); box(g, .06, .03, .04, L('#a33a24'), .21, 1.58, .27, 0, 0, .45, 0); strap(-1); strap(1); }
  else if (pk === 'tank') { P(g, cylg(.078, .078, .5, 12), L('#7b8a93'), 0, 1.3, .27); P(g, sph(10, 6, 0, PI * 2, 0, 1.4), L('#7b8a93'), 0, 1.55, .27, 0, 0, 0, .078, .06, .078); P(g, cylg(.014, .014, .06, 6), L('#c9b24a'), 0, 1.62, .27); P(g, cylg(.01, .01, .3, 5), blk, -.09, 1.45, .12, 0, 0, .3); strap(-1); strap(1); }
  else if (pk === 'scope') { P(g, cylg(.04, .04, .6, 10), L('#2a3030'), -.08, 1.28, .26, 0, 0, .5); P(g, cylg(.045, .045, .03, 10), blk, -.08 - Math.sin(.5) * .3, 1.28 + Math.cos(.5) * .3, .26, 0, 0, .5); box(g, .22, .26, .08, gearM, .04, 1.25, .25, 0, 0, 0, .02); strap(-1); strap(1); }
  else if (pk === 'optics') { box(g, .2, .22, .1, gearM, 0, 1.2, .25, 0, 0, 0, .02); P(g, cylg(.02, .02, .12, 8), blk, -.05, 1.38, .25, HP, 0, 0); P(g, cylg(.02, .02, .12, 8), blk, .05, 1.38, .25, HP, 0, 0); strap(-1); strap(1); }
  if (style === 'hazmat') { P(g, cylg(.07, .07, .42, 10), L('#c6b343'), -.1, 1.28, .26); P(g, cylg(.07, .07, .42, 10), L('#c6b343'), .1, 1.28, .26); P(g, cylg(.01, .01, .3, 5), blk, 0, 1.55, .12, .5, 0, 0); }

  /* ----- legs (pivot at the hip; baked as separate swinging meshes) ----- */
  function mkLeg(px, side) {
    var l = new T.Group(); l.position.set(px, .85, 0); var A = [];
    function lp(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) { var m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); l.add(m); all.push(m); return m; }
    function ll(a, b, r0, r1, mat) { var d = V().subVectors(b, a), len = d.length(); d.normalize(); var m = new T.Mesh(new T.CylinderGeometry(r1, r0, len, 9, 1), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d); l.add(m); all.push(m); lp(sph(9, 6), mat, b.x, b.y, b.z, 0, 0, 0, r1, r1, r1); }
    lp(sph(10, 7), mPants, 0, 0, 0, 0, 0, 0, .118, .118, .118);
    ll(V(0, 0, 0), V(0, -.42, .012), .118, .088, mPants); ll(V(0, -.42, .012), V(0, -.74, -.01), .086, .062, mPants);
    lp(new T.BoxGeometry(.15, .2, .05), mPants, side * .06, -.22, -.075, 0, 0, side * -.05); // thigh cargo pocket
    lp(cylg(.066, .072, .075, 10), mPants, 0, -.735, -.015); // bloused cuff
    // boots
    lp(rbox(.115, .13, .3, .03), L(bootC), 0, -.775, -.06); lp(sph(9, 6), L(bootC), 0, -.79, -.2, 0, 0, 0, .06, .05, .065);
    lp(new T.BoxGeometry(.12, .035, .33), L('#0e0e0f'), 0, -.832, -.065); lp(cylg(.058, .062, .08, 9), L(mul(bootC, 1.15)), 0, -.72, -.01);
    if (!LITE) lp(new T.BoxGeometry(.07, .03, .012), L('#6c6e6a'), 0, -.71, -.083, 0, 0, 0);
    if (S.kneepads || heavy) lp(new T.BoxGeometry(.1, .11, .06), vestD, 0, -.44, -.075);
    if (heavy) lp(new T.BoxGeometry(.12, .2, .04), vestM, 0, -.22, -.115);
    return { l: l, A: A };
  }
  var lg = mkLeg(-.14, -1), lr = mkLeg(.14, 1), legs = lg.l, legR = lr.l;

  /* ----- head: skull, face features, hair, headgear ----- */
  var HY = 1.7, skullG = sph(14, 10); 
  var head = new T.Mesh(skullG, L(skin)); head.scale.set(.084, .112, .1); head.position.y = HY; g.add(head); all.push(head);
  var hd = new T.Group(); hd.position.y = HY; g.add(hd);   // face/hair/headgear live in head space (no scale distortion)
  function H(geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) { return P(hd, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz); }
  var jw = S.jaw * (S.g === 'f' ? .92 : 1);
  H(sph(14, 10), L(skin), 0, -.068, -.012, 0, 0, 0, .068 * jw, .06, .082);                     // jaw / chin mass
  H(sph(8, 6), L(skin), 0, -.098, -.05, 0, 0, 0, .026 * jw, .02, .03);                          // chin
  [-1, 1].forEach(function (s) {
    H(sph(8, 6), L(skinHi), s * .052, -.012, -.074, 0, 0, 0, .03, .028, .028);                      // cheekbone
    H(sph(8, 6), L(blushC), s * .05, -.03, -.082, 0, 0, 0, .026, .02, .01);                         // cheek tone
    H(sph(8, 6), L(skin), s * .088, -.008, .002, 0, 0, 0, .012, .03, .02);                          // ear
    if (!LITE) H(sph(8, 6), L(skinSh), s * .087, -.008, .0, 0, 0, 0, .006, .018, .012);                        // inner ear
    H(sph(9, 6), L(mul(skin, .9)), s * .037, .012, -.09, 0, 0, 0, .0145, .012, .01);                       // eye socket
    H(sph(9, 6), L('#d9d6cc'), s * .037, .012, -.096, 0, 0, 0, .0098, .0072, .005);                   // eyeball
    H(sph(8, 6), L(S.eye), s * .037, .012, -.099, 0, 0, 0, .0051, .0051, .003);                        // iris
    if (!LITE) H(sph(6, 4), blk, s * .037, .012, -.1015, 0, 0, 0, .0023, .0023, .001);                          // pupil
    H(new T.BoxGeometry(.026, .004, .01), L(skinSh), s * .037, .0235, -.094, -.1, 0, s * .06);      // upper lid
    H(new T.BoxGeometry(.03 * S.brow, .0065 * S.brow, .009), L(hairC), s * .039, .043, -.095, -.1, 0, s * (S.g === 'f' ? .16 : -.06)); // brow
  });
  H(new T.BoxGeometry(.015, .05 * S.nose, .022), L(skin), 0, -.01, -.099, .1, 0, 0);                         // nose bridge
  H(sph(8, 6), L(skin), 0, -.036, -.109, 0, 0, 0, .0105 * S.nose, .009 * S.nose, .009 * S.nose);   // nose tip
  [-1, 1].forEach(function (s) { H(sph(6, 4), L(skinSh), s * .008, -.04, -.115, 0, 0, 0, .0045, .0035, .004); });
  H(new T.BoxGeometry(.032, .003, .008), L(mul(lipC, .55)), 0, -.0645, -.1, 0, 0, 0);                // mouth line
  H(new T.BoxGeometry(.028, .005, .009), L(lipC), 0, -.059, -.1, 0, 0, 0); H(new T.BoxGeometry(.025, .0065, .009), L(mix(lipC, skin, .15)), 0, -.0705, -.098, 0, 0, 0);
  if (S.freckles && !LITE) for (var fi = 0; fi < 9; fi++) H(sph(4, 3), L(mul(skin, .72)), (fi % 2 ? 1 : -1) * (.012 + (fi % 4) * .012) + (fi % 2 ? .03 : -.03) * 0, -.012 - (fi % 3) * .008, -.106 + Math.abs((fi % 4) * .004) * 0, 0, 0, 0, .0028, .0028, .0016).position.x = (fi % 2 ? 1 : -1) * (.03 + (fi % 4) * .012);
  if (S.scar === 'cheek') H(new T.BoxGeometry(.004, .05, .004), L(mix(skin, '#c9908a', .6)), .055, -.02, -.1, .1, 0, .7);
  else if (S.scar === 'brow') H(new T.BoxGeometry(.004, .03, .004), L(mix(skin, '#c9908a', .6)), -.04, .04, -.1, .1, 0, .35);
  else if (S.scar === 'chin') H(new T.BoxGeometry(.003, .028, .004), L(mix(skin, '#c9908a', .6)), .02, -.095, -.07, .6, 0, .2);
  // facial hair
  var hy = TH ? TH.head : op.head, fk = TH ? TH.face : (op.face === 'mask' ? 'mask' : op.face === 'scarf' ? 'scarf' : 'none');
  var beardC = mix(hairC, '#2a2018', .4), faceCover = fk !== 'none' || hy === 'balaclava';
  if (!faceCover) {
    if (S.beard === 'stubble') H(sph(12, 8), L(mix(skin, hairC, .42)), 0, -.075, -.012, 0, 0, 0, .0705 * jw, .0645, .085);
    else if (S.beard === 'full') { H(sph(12, 8), L(beardC), 0, -.082, -.018, 0, 0, 0, .0755 * jw, .072, .088); H(new T.BoxGeometry(.044, .012, .016), L(beardC), 0, -.052, -.105); [-1, 1].forEach(function (s) { H(new T.BoxGeometry(.012, .06, .05), L(beardC), s * .075, -.03, -.01); }); }
    else if (S.beard === 'goatee') { H(sph(8, 6), L(beardC), 0, -.098, -.056, 0, 0, 0, .022, .026, .024); H(new T.BoxGeometry(.04, .008, .014), L(beardC), 0, -.0535, -.103); }
    else if (S.beard === 'mustache') H(new T.BoxGeometry(.046, .011, .016), L(beardC), 0, -.053, -.104);
  }
  if (S.glasses && style !== 'hazmat') {
    var lensC = S.glasses === 2 ? '#1a1d22' : '#4a5258';
    [-1, 1].forEach(function (s) { H(new T.BoxGeometry(.044, .03, .006), L(lensC), s * .04, .012, -.106); });
    H(new T.BoxGeometry(.02, .006, .006), blk, 0, .02, -.108); H(new T.BoxGeometry(.176, .006, .006), blk, 0, .022, -.015, 0, 0, 0).scale.z = 14;
  }
  H(cylg(.052, .06, .06, 10), L(skin), 0, -.125, .01);   // throat blending into neck

  /* hair (visible when the headgear leaves it free) */
  var hs = S.hair, hasHelmet = hy === 'helmet' || hy === 'visor' || hy === 'visorhelmet' || hy === 'hood' || hy === 'balaclava' || hy === 'turban' || hy === 'shemagh' || hy === 'arctic';
  function cap(thL, sc, color, ox, oy, oz, rotx) { return H(sph(14, 8, 0, PI * 2, 0, thL), L(color), ox || 0, oy == null ? .008 : oy, oz == null ? .006 : oz, rotx == null ? .36 : rotx, 0, 0, .086 * sc, .114 * sc, .103 * sc); }
  if (hs !== 'bald') {
    var hl = hasHelmet ? .96 : 1.0;
    if (hs === 'buzz') cap(1.55, 1.018, mix(hairC, skin, .4));
    else if (hs === 'crop') cap(1.72, 1.045, hairC);
    else if (hs === 'messy') { cap(1.86, 1.06, hairC); for (var mi = 0; mi < 8; mi++) { var a = mi / 8 * PI * 2; H(sph(6, 4), L(hairC), Math.cos(a) * .06, .09 + (mi % 3) * .01, Math.sin(a) * .07, 0, 0, 0, .026, .022, .03); } }
    else if (hs === 'ponytail') { cap(1.78, 1.05, hairC); limb(hd, V(0, .0, .102), V(0, -.07, .175), .022, .014, L(hairC), 7); H(cylg(.024, .024, .012, 8), L('#3a2a1c'), 0, .02, .106, HP * .5, 0, 0); }
    else if (hs === 'bob') { cap(1.95, 1.07, hairC); [-1, 1].forEach(function (s) { H(new T.BoxGeometry(.02, .11, .15), L(hairC), s * .092, -.035, .02); }); H(new T.BoxGeometry(.17, .12, .03), L(hairC), 0, -.03, .098); }
    else if (hs === 'curly') { cap(1.7, 1.06, hairC); for (var ci = 0; ci < 14; ci++) { var ca = ci * 2.4, cr = .035 + (ci % 3) * .01; H(sph(7, 5), L(hairC), Math.cos(ca) * .07 * Math.min(1, ci / 6), .06 + (ci % 4) * .02, Math.sin(ca) * .08 + .005, 0, 0, 0, cr, cr, cr); } }
    else if (hs === 'afro') H(sph(12, 8), L(hairC), 0, .035, .01, 0, 0, 0, .135, .14, .14);
    else if (hs === 'undercut') { cap(1.55, 1.02, mix(hairC, skin, .5)); cap(1.0, 1.07, hairC, 0, .02, .0, .22); H(new T.BoxGeometry(.05, .035, .1), L(hairC), 0, .1, -.01, .3); }
    else if (hs === 'braids') { cap(1.75, 1.05, hairC); [-.06, -.02, .02, .06].forEach(function (x, i) { limb(hd, V(x, -.01, .1), V(x * 1.3, -.2 - (i % 2) * .03, .14), .014, .01, L(hairC), 6); }); }
    else if (hs === 'longbraid') { cap(1.75, 1.05, hairC); for (var bi = 0; bi < 5; bi++) H(sph(7, 5), L(bi % 2 ? mul(hairC, .9) : hairC), 0, -.04 - bi * .066, .115 + bi * .014, 0, 0, 0, .026 - bi * .002, .036, .026); }
    else if (hs === 'bun') { cap(1.76, 1.05, hairC); H(sph(9, 7), L(hairC), 0, .08, .085, 0, 0, 0, .04, .04, .04); }
    else if (hs === 'side') { cap(1.9, 1.07, hairC); H(new T.BoxGeometry(.05, .05, .14), L(hairC), -.05, .08, -.02, 0, 0, .3); }
  }

  /* headgear */
  var hm = L(gearC), hmD = L(mul(gearC, .68)), helmMat = TH && TH.camoHelmet ? mShirt : hm;
  function brimless(r, sc, color, thL, oy) { return H(sph(14, 8, 0, PI * 2, 0, thL), typeof color === 'object' ? color : L(color), 0, oy == null ? .028 : oy, .012, .1, 0, 0, .117 * sc, .106 * sc, .132 * sc); }
  if (hy === 'helmet' || hy === 'visor' || hy === 'visorhelmet') {
    brimless(1, 1, helmMat, 1.82); H(cylg(.113, .12, .02, 18), hmD, 0, -.004, .014, 0, 0, 0).scale.z = 1.14;
    H(new T.BoxGeometry(.044, .034, .026), hmD, 0, .082, -.122, .2); H(new T.BoxGeometry(.016, .01, .016), blk, 0, .1, -.13);    // NVG shroud
    [-1, 1].forEach(function (s) { H(new T.BoxGeometry(.012, .026, .07), L('#6b6f6a'), s * .117, .04, .0); H(new T.BoxGeometry(.009, .04, .022), blk, s * .1, -.07, -.07, 0, 0, s * -.5); });
    H(new T.BoxGeometry(.12, .016, .02), L(TEAM.color), 0, .108, .0).scale.z = 5; // team stripe
    if (S.extra === 'headset' || hy === 'visor' || hy === 'visorhelmet') [-1, 1].forEach(function (s) { H(cylg(.034, .034, .026, 12), blk, s * .1, -.006, .02, 0, 0, HP); H(cylg(.026, .026, .02, 12), L('#313538'), s * .115, -.006, .02, 0, 0, HP); });
    if (hy === 'visor' || hy === 'visorhelmet') { H(new T.BoxGeometry(.158, .06, .012), L('#2b5f8f'), 0, .018, -.112, .1); H(new T.BoxGeometry(.17, .016, .02), hmD, 0, .052, -.112, .1); H(new T.BoxGeometry(.016, .06, .02), hmD, -.08, .018, -.108, .1); H(new T.BoxGeometry(.016, .06, .02), hmD, .08, .018, -.108, .1); }
    else if (S.extra === 'goggles') { H(new T.BoxGeometry(.15, .04, .02), L('#2d3338'), 0, .06, -.112, .0); [-1, 1].forEach(function (s) { H(sph(9, 6), L('#b8863a'), s * .036, .06, -.122, 0, 0, 0, .032, .02, .008); }); }
  } else if (hy === 'hood') {
    var gap = 1.15, hoodM = mShirt; var hoodMesh = H(sph(14, 9, 3 * PI / 2 + gap / 2, PI * 2 - gap, 0, 2.3), hoodM, 0, .01, .022, 0, 0, 0, .124, .13, .14);
    H(cylg(.14, .215, .13, 14, true), hoodM, 0, -.17, .02).scale.z = .95;
    H(cylg(.1, .1, .06, 14, true), L(mul(gearC, .8)), 0, .058, -.078, HP * .35, 0, 0);
    H(new T.BoxGeometry(.15, .014, .012), L(TEAM.color), 0, .1, -.12, .4);
  } else if (hy === 'bandana') {
    brimless(1, 1, gearC, 1.22, .04); H(cylg(.1, .1, .05, 16, true), hm, 0, .052, 0, -.0, 0, 0).scale.z = 1.18;
    H(new T.BoxGeometry(.04, .06, .03), hm, .03, .04, .124, .1); H(new T.BoxGeometry(.034, .08, .012), hmD, .04, -.01, .15, .2, 0, .15);
    if (S.extra === 'goggles') { H(new T.BoxGeometry(.15, .04, .02), L('#2d3338'), 0, .088, -.088, -.5); [-1, 1].forEach(function (s) { H(sph(9, 6), L('#c46a2a'), s * .036, .092, -.102, -.5, 0, 0, .031, .02, .008); }); }
  } else if (hy === 'beanie') {
    brimless(1, 1.02, gearC, 1.65, .036); H(cylg(.104, .108, .045, 18, true), hmD, 0, .052, .0).scale.z = 1.17;
    H(cylg(.1, .1, .01, 16), hmD, 0, .07, 0); H(sph(8, 6), L(TEAM.color), 0, .14, .002, 0, 0, 0, .02, .02, .02);
  } else if (hy === 'cap' || hy === 'patrol') {
    brimless(1, 1.0, helmMat, 1.62, .036); H(cylg(.088, .09, .012, 18, false, -HP * 1.45, PI * .9), hmD, 0, .052, -.118, .12, 0, 0).scale.set(1.05, 1, 1);
    H(sph(6, 4), hmD, 0, .134, .005, 0, 0, 0, .012, .008, .012); H(new T.BoxGeometry(.036, .02, .008), L(TEAM.color), 0, .092, -.12, .5);
  } else if (hy === 'beret') {
    H(sph(14, 8), hm, .018, .09, .0, 0, 0, -.18, .125, .045, .13); H(cylg(.103, .103, .02, 16), hm, 0, .052, 0).scale.z = 1.18; H(sph(5, 4), hmD, .0, .12, 0, 0, 0, 0, .012, .012, .012); H(new T.BoxGeometry(.03, .034, .01), L(TEAM.color), -.055, .075, -.112);
  }
  var wm = TH && TH.wrap ? L(TH.wrap) : hm, wd = L(TH && TH.wrap2 ? TH.wrap2 : '#242424');
  if (hy === 'balaclava') {
    H(sph(14, 8, 0, PI * 2, 0, 1.4), wm, 0, .006, .006, .36, 0, 0, .0925, .121, .109);
    H(new T.BoxGeometry(.17, .05, .03), wm, 0, .012, .098); [-1, 1].forEach(function (s) { H(new T.BoxGeometry(.02, .05, .15), wm, s * .088, .012, .0); });
  } else if (hy === 'shemagh') {
    H(sph(14, 8, 0, PI * 2, 0, 1.95), wm, 0, .022, .016, .22, 0, 0, .12, .122, .13); H(cylg(.12, .125, .07, 14, true), wm, 0, .0, .02, 0, 0, 0).scale.z = 1.12;
    H(new T.TorusGeometry(.112, .011, 5, 16), blk, 0, .07, .004, HP, 0, 0).scale.set(1, 1.15, 1); H(new T.TorusGeometry(.115, .011, 5, 16), blk, 0, .052, .004, HP, 0, 0).scale.set(1, 1.15, 1);
    [-1, 1].forEach(function (s) { H(new T.BoxGeometry(.075, .22, .03), wm, s * .1, -.15, .06, .12, 0, s * .12); [0, 1, 2, 3].forEach(function (i) { H(new T.BoxGeometry(.077, .014, .032), wd, s * .1 + s * .003, -.1 - i * .045, .062 + i * .004, .12, 0, s * .12); }); });
  } else if (hy === 'turban') {
    H(sph(14, 8, 0, PI * 2, 0, 2.0), wm, 0, .04, .012, .1, 0, 0, .126, .115, .14);
    [0, 1, 2].forEach(function (i) { H(new T.TorusGeometry(.118 - i * .003, .016, 6, 16), i % 2 ? wd : wm, 0, .01 + i * .036, .006, HP, 0, 0).scale.set(1, 1.17, 1); });
    H(new T.BoxGeometry(.06, .2, .03), wm, .06, -.14, .1, .1, 0, .15);
  } else if (hy === 'headband') {
    H(cylg(.1, .1, .036, 16, true), wm, 0, .052, 0).scale.z = 1.18; H(new T.BoxGeometry(.045, .045, .03), wm, 0, .05, .122); [-1, 1].forEach(function (s) { H(new T.BoxGeometry(.03, .1, .012), wm, s * .02, -.0, .15, .15, 0, s * .2); });
  } else if (hy === 'arctic') {
    var gap2 = 1.2; H(sph(14, 9, 3 * PI / 2 + gap2 / 2, PI * 2 - gap2, 0, 2.3), mShirt, 0, .01, .022, 0, 0, 0, .128, .134, .146);
    H(cylg(.145, .22, .13, 14, true), mShirt, 0, -.17, .02).scale.z = .95; H(new T.TorusGeometry(.098, .024, 6, 14), L('#f1f1ec'), 0, -.002, -.07, 0, 0, 0).scale.set(1, 1.22, 1);
    if (S.extra === 'goggles') { H(new T.BoxGeometry(.15, .04, .02), L('#2d3338'), 0, .08, -.115, -.2); [-1, 1].forEach(function (s) { H(sph(9, 6), L('#c46a2a'), s * .036, .08, -.126, -.2, 0, 0, .031, .02, .008); }); }
  } else if (hy === 'boonie') {
    H(sph(14, 8, 0, PI * 2, 0, 1.5), helmMat, 0, .045, .01, .08, 0, 0, .117, .095, .128); H(cylg(.178, .184, .012, 20), helmMat, 0, .033, .004, .0, 0, 0).scale.z = 1.04; H(cylg(.12, .122, .024, 16, true), L(mul(gearC, .75)), 0, .045, .008).scale.z = 1.12;
  }
  if (TH && TH.paint) [-1, 1].forEach(function (s) { H(new T.BoxGeometry(.05, .009, .004), L('#1c2615'), s * .05, -.008, -.099, .1, 0, s * .5); H(new T.BoxGeometry(.045, .009, .004), L('#46562a'), s * .05, -.03, -.095, .1, 0, s * -.4); });
  if (S.extra === 'divemask' && hy !== 'visor') { H(new T.BoxGeometry(.14, .05, .03), L('#222a30'), 0, .095, -.1, -.45); H(new T.BoxGeometry(.11, .036, .014), L('#4a7c93'), 0, .097, -.116, -.45); H(new T.TorusGeometry(.1, .008, 4, 14), L('#222a30'), 0, .06, .0, HP, 0, 0).scale.set(1, 1.15, 1); }
  if (S.extra === 'headset' && !(hy === 'helmet' || hy === 'visor')) { [-1, 1].forEach(function (s) { H(cylg(.034, .034, .026, 12), blk, s * .098, -.002, .016, 0, 0, HP); }); H(new T.TorusGeometry(.098, .005, 4, 14, PI), blk, 0, .02, .012, 0, 0, 0).scale.set(1, 1.1, 1.2); limb(hd, V(.1, -.02, -.02), V(.04, -.07, -.1), .004, .004, blk, 5); H(sph(5, 4), blk, .038, -.071, -.105, 0, 0, 0, .008, .008, .008); }
  // face covering
  if (faceCover) {
    var maskC = fk === 'mask' || hy === 'balaclava' ? (TH && TH.wrap ? TH.wrap : '#1d1f1f') : (TH && TH.wrap ? TH.wrap : TEAM.scarf), fm = L(maskC);
    H(sph(14, 8, 0, PI * 2, 1.6, 1.3), fm, 0, 0, -.004, 0, 0, 0, .092, .119, .108);
    H(new T.BoxGeometry(.052, .06, .03), fm, 0, -.022, -.098, .3);                         // nose bridge under cloth
    H(cylg(.082, .092, .035, 14, true), fm, 0, -.113, .0).scale.z = 1.12;           // neck gaiter roll
    if (fk === 'scarf') { [-1, 1].forEach(function (s) { H(new T.TorusGeometry(.082, .006, 4, 12, PI), L(mul(maskC, .82)), 0, -.075 - s * .02 + .02, -.01, HP, 0, 0).scale.set(1, 1.2, 1.1); }); H(new T.BoxGeometry(.04, .12, .02), fm, .06, -.19, -.05, 0, .3, .1); }
  } else if (S.extra === 'scarf' || S.extra === 'wool') {
    H(new T.TorusGeometry(.09, S.extra === 'wool' ? .026 : .018, 6, 14), L(S.extra === 'wool' ? mix(gearC, '#bdb7a8', .55) : TEAM.scarf), 0, -.14, .0, HP, 0, 0).scale.set(1, 1.1, .9);
    H(new T.BoxGeometry(.04, .13, .02), L(S.extra === 'wool' ? mix(gearC, '#bdb7a8', .5) : TEAM.scarf), .045, -.2, -.09, 0, 0, .1);
  }
  if (style === 'hazmat') { [-1, 1].forEach(function (s) { H(cylg(.034, .034, .06, 10), L('#4a4f52'), s * .07, -.07, -.1, HP, 0, 0); H(cylg(.026, .026, .012, 10), L('#c6b343'), s * .07, -.07, -.135, HP, 0, 0); }); }
  if (style === 'vanguard') { H(new T.BoxGeometry(.17, .07, .03), L('#24323d'), 0, .0, -.115, .1); H(new T.BoxGeometry(.17, .03, .03), hmD, 0, .07, -.12, .1); }

  /* ----- finish ----- */
  var rifle = new T.Group(); rifle.position.set(.1, 1.27, -.1);
  var flash = new T.Mesh(new T.PlaneGeometry(.3, .3), new T.MeshBasicMaterial({ color: 0xffd27a, side: T.DoubleSide })); flash.position.set(.1, 1.28, -.74); flash.visible = false;
  g.add(rifle, flash, legs, legR);
  g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  [armR, armL].forEach(function (a) { a.traverse(function (o) { if (o.isMesh) arms.push(o); }); });
  return { g: g, torso: torso, head: head, legs: legs, legR: legR, rifle: rifle, arms: arms, armR: armR, armL: armL, flash: flash, mats: [mShirt, mSleeve, mPants], phase11ClaudeCharacter: true };
}

/* ---------- baked fabric atlas + baked ambient shading ---------- */
function atlas(op) {
  var th = themeFor(op), c = document.createElement('canvas'); c.width = 256; c.height = 128; var x = c.getContext('2d'), cols = th ? th.pal.map(function (c) { return mul(c, .86); }) : op.uni, r = RNG(hash(op.id) ^ 77);
  var id = op.sourceId || op.id, kind = th ? th.camo : hash(id) % 4;                       // camo family per operative
  x.fillStyle = cols[0]; x.fillRect(0, 0, 128, 128);
  function blob(col, n, rmin, rmax, flat) { x.fillStyle = col; for (var i = 0; i < n; i++) { x.beginPath(); x.ellipse(r() * 128, r() * 128, rmin + r() * (rmax - rmin), (rmin + r() * (rmax - rmin)) * (flat || .6), r() * 3.14, 0, 6.3); x.fill(); } }
  function px(col, n, s) { x.fillStyle = col; for (var i = 0; i < n; i++) { x.fillRect(Math.floor(r() * 128 / s) * s, Math.floor(r() * 128 / s) * s, s, s); } }
  if (kind === 0) { blob(cols[1], 70, 2, 7); blob(cols[2], 46, 2, 5); blob(cols[3], 26, 1.5, 4); }                 // woodland-style blotch
  else if (kind === 1) { px(cols[1], 260, 4); px(cols[2], 170, 3); px(cols[3], 90, 3); }                            // digital micro-pattern
  else if (kind === 2) { x.strokeStyle = cols[1]; x.lineWidth = 3; for (var i = 0; i < 46; i++) { x.beginPath(); var sx = r() * 128, sy = r() * 128; x.moveTo(sx, sy); x.lineTo(sx + (r() - .5) * 36, sy + (r() - .5) * 20); x.stroke(); } blob(cols[2], 30, 2, 6, .4); blob(cols[3], 18, 1.5, 4, .5); } // splinter
  else if (kind === 4) { blob(cols[1], 22, 6, 16, .8); blob(cols[3], 10, 2, 6); x.fillStyle = cols[2]; for (var q = 0; q < 70; q++) x.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 8); }  // solid worn cloth
  else { blob(cols[1], 36, 4, 12, .8); blob(cols[2], 40, 2, 5); x.fillStyle = cols[3]; for (var j = 0; j < 90; j++) x.fillRect(r() * 128, r() * 128, 2 + r() * 3, 1); }  // desert-style + flecks
  // cloth weave, grain and wear
  x.globalAlpha = .045; x.fillStyle = '#000'; for (var gy = 0; gy < 128; gy += 3) x.fillRect(0, gy, 128, 1);
  x.fillStyle = '#fff'; for (var gx = 0; gx < 128; gx += 4) x.fillRect(gx, 0, 1, 128);
  x.globalAlpha = .08; for (var n = 0; n < 1800; n++) { x.fillStyle = r() < .5 ? '#000' : '#fff'; x.fillRect(r() * 128, r() * 128, 1, 1); }
  x.globalAlpha = .16; var gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,30,20,.55)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  x.globalAlpha = 1; x.fillStyle = '#ffffff'; x.fillRect(128, 0, 128, 128);
  var t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
}
function shade(x, y, z, nx, ny, nz) {            // baked sky/ground light + grime, multiplied into vertex colour
  var f = .72 + .28 * (.5 + .5 * ny);
  if (y < .32) f *= .76 + .24 * Math.max(0, y) / .32;
  if (nz > .55) f *= .94;
  return f;
}
root.SightlineCharacters = { version: 'P11.7', build: build, atlas: atlas, shade: shade, specFor: specFor, hash: hash };
})(typeof window !== 'undefined' ? window : globalThis);

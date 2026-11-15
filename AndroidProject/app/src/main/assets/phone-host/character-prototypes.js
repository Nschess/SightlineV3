/* Phase 10 character reconstruction: identity-shaped meshes baked by the existing
   game pipeline. Geometry is created during roster bake, never in the frame loop. */
(function (root) {
  'use strict';
  var T = root.THREE;
  if (!T) return;

  var SURFACES = {
    cloth: [0, 0], skin: [1, 0], armor: [2, 0], webbing: [3, 0],
    rubber: [0, 1], metal: [1, 1], hair: [2, 1], team: [3, 1]
  };
  var texCache = Object.create(null);
  var palette = {
    riptide: { cloth: ['#3d5c77', '#30495f', '#5b7791', '#1f3142'], armor: '#364b5e', web: '#394c5b', metal: '#84939b' },
    ashfall: { cloth: ['#79574b', '#68483e', '#9a6b52', '#4b332c'], armor: '#4e4138', web: '#514036', metal: '#857467' }
  };

  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function rng(seed) { var s = seed || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  function tone(hex, amount) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '#596057';
    var n = parseInt(m[1], 16), out = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v * amount + 40 * (1 - amount)); });
    return '#' + out.map(function (v) { return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'); }).join('');
  }
  function paletteFor(op) {
    if (palette[op.id]) return palette[op.id];
    var uniform = Array.isArray(op.uni) && op.uni.length >= 4 ? op.uni : (op.team === 'blue' ? palette.riptide.cloth : palette.ashfall.cloth);
    return { cloth: uniform.map(function (c) { return tone(c, .90); }), armor: tone(op.vest || '#4a5048', .92), web: tone(op.gear || '#373c37', .90), metal: '#747c74' };
  }
  function normalizeUV(g) {
    var uv = g.attributes.uv;
    if (!uv || !uv.count) return g;
    var minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (var i = 0; i < uv.count; i++) { var u = uv.getX(i), v = uv.getY(i); minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
    var du = Math.max(1e-6, maxU - minU), dv = Math.max(1e-6, maxV - minV);
    for (var j = 0; j < uv.count; j++) uv.setXY(j, (uv.getX(j) - minU) / du, (uv.getY(j) - minV) / dv);
    uv.needsUpdate = true;
    return g;
  }
  function makeTex(canvas, isColor) {
    var t = new T.CanvasTexture(canvas);
    if (isColor && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    else if (isColor && T.sRGBEncoding) t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function atlas(op) {
    if (texCache[op.id]) return texCache[op.id];
    var W = 1024, H = 512, tileW = 256, tileH = 256, c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d'), p = paletteFor(op), r = rng(hash(op.id + ':cloth'));
    var tiles = [
      { base: p.cloth[0], kind: 'fabric' }, { base: op.skin || '#a8744f', kind: 'skin' }, { base: p.armor, kind: 'armor' }, { base: p.web, kind: 'webbing' },
      { base: '#262522', kind: 'rubber' }, { base: p.metal, kind: 'metal' }, { base: op.hair || '#211914', kind: 'hair' },
      { base: op.team === 'blue' ? '#3998c0' : '#c8664e', kind: 'team' }
    ];
    tiles.forEach(function (t, i) {
      var x = (i % 4) * tileW, y = Math.floor(i / 4) * tileH;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, tileW, tileH); ctx.clip();
      ctx.fillStyle = t.base; ctx.fillRect(x, y, tileW, tileH);
      if (t.kind === 'fabric') {
        var cols = p.cloth;
        for (var q = 0; q < 62; q++) {
          ctx.fillStyle = cols[1 + Math.floor(r() * 3)]; ctx.globalAlpha = .6 + r() * .28;
          ctx.beginPath(); var px = x + r() * tileW, py = y + r() * tileH, a = 5 + r() * 18, b = 3 + r() * 10;
          ctx.moveTo(px - a, py); ctx.quadraticCurveTo(px - a * .35, py - b * 1.4, px + a * .42, py - b * .5);
          ctx.quadraticCurveTo(px + a * 1.2, py + b * .1, px + a * .55, py + b);
          ctx.quadraticCurveTo(px - a * .2, py + b * 1.4, px - a, py); ctx.fill();
        }
        ctx.globalAlpha = .12; ctx.fillStyle = '#d6d0bd';
        for (var fy = y; fy < y + tileH; fy += 4) ctx.fillRect(x, fy, tileW, 1);
        ctx.globalAlpha = 1;
      } else if (t.kind === 'skin') {
        var tone = op.skin || '#a8744f'; ctx.fillStyle = tone; ctx.globalAlpha = .30; ctx.fillRect(x, y, tileW, tileH); ctx.globalAlpha = 1;
        var grad = ctx.createLinearGradient(x, y, x + tileW, y + tileH); grad.addColorStop(0, 'rgba(255,220,184,.12)'); grad.addColorStop(.55, 'rgba(110,57,38,.02)'); grad.addColorStop(1, 'rgba(63,35,28,.16)'); ctx.fillStyle = grad; ctx.fillRect(x, y, tileW, tileH);
        for (var sp = 0; sp < 720; sp++) { ctx.fillStyle = r() < .5 ? 'rgba(68,39,31,.035)' : 'rgba(255,226,195,.045)'; ctx.beginPath(); ctx.arc(x + r() * tileW, y + r() * tileH, .35 + r() * 1.1, 0, Math.PI * 2); ctx.fill(); }
      } else if (t.kind === 'armor') {
        var ag = ctx.createLinearGradient(x, y, x + tileW, y + tileH); ag.addColorStop(0, '#777f71'); ag.addColorStop(.18, t.base); ag.addColorStop(.72, t.base); ag.addColorStop(1, '#202723'); ctx.fillStyle = ag; ctx.fillRect(x, y, tileW, tileH);
        ctx.globalAlpha = .15; ctx.strokeStyle = '#e6e4d7'; ctx.lineWidth = 2;
        for (var ax = x + 8; ax < x + tileW; ax += 32) { ctx.beginPath(); ctx.moveTo(ax, y + 12); ctx.lineTo(ax - 10, y + tileH - 12); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else if (t.kind === 'webbing') {
        ctx.strokeStyle = '#b7aa8a'; ctx.globalAlpha = .14; ctx.lineWidth = 2;
        for (var wy = y + 2; wy < y + tileH; wy += 5) { ctx.beginPath(); ctx.moveTo(x, wy); ctx.lineTo(x + tileW, wy + 2); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else if (t.kind === 'rubber') {
        ctx.fillStyle = '#353431'; for (var ry = y + 5; ry < y + tileH; ry += 12) for (var rx = x + 5; rx < x + tileW; rx += 12) { ctx.beginPath(); ctx.arc(rx, ry, 1.4, 0, Math.PI * 2); ctx.fill(); }
      } else if (t.kind === 'hair') {
        ctx.strokeStyle = 'rgba(230,211,185,.16)'; ctx.lineWidth = 1;
        for (var hr = 0; hr < 85; hr++) { var hx = x + r() * tileW, hy = y + r() * tileH; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + (r() - .5) * 10, hy + 5, hx + (r() - .5) * 16, hy + 12); ctx.stroke(); }
      } else if (t.kind === 'team') {
        ctx.strokeStyle = 'rgba(245,238,219,.28)'; ctx.lineWidth = 3;
        for (var sy = y + 12; sy < y + tileH; sy += 12) { ctx.beginPath(); ctx.moveTo(x + 8, sy); ctx.lineTo(x + tileW - 8, sy); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(16,24,26,.30)'; ctx.lineWidth = 2;
        for (var sx = x + 10; sx < x + tileW; sx += 18) { ctx.beginPath(); ctx.moveTo(sx, y + 8); ctx.lineTo(sx, y + tileH - 8); ctx.stroke(); }
      } else {
        var mg = ctx.createLinearGradient(x, y, x + tileW, y + 18); mg.addColorStop(0, '#383c39'); mg.addColorStop(.48, '#858982'); mg.addColorStop(1, '#454b47'); ctx.fillStyle = mg; ctx.fillRect(x, y, tileW, tileH);
        ctx.globalAlpha = .24; ctx.strokeStyle = '#d5d8d1'; ctx.lineWidth = 1;
        for (var my = y + 3; my < y + tileH; my += 7) { ctx.beginPath(); ctx.moveTo(x + 10, my); ctx.lineTo(x + tileW - 10, my); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      // Fine, low-contrast surface grain; no high-frequency noise that shimmers at distance.
      ctx.globalAlpha = .065;
      for (var n = 0; n < 1150; n++) { ctx.fillStyle = r() < .5 ? '#000' : '#fff'; ctx.fillRect(x + r() * tileW, y + r() * tileH, 1, 1); }
      ctx.globalAlpha = 1; ctx.restore();
    });
    var result = { map: makeTex(c, true) };
    texCache[op.id] = result; return result;
  }
  function material(slot) {
    var m = new T.MeshLambertMaterial({ color: 0xffffff });
    m.userData.p10Surface = slot;
    return m;
  }
  function put(parent, geometry, mat, x, y, z, slot) {
    var mesh = new T.Mesh(geometry, mat); mesh.position.set(x || 0, y || 0, z || 0);
    mesh.userData.p10Surface = slot || mat.userData.p10Surface;
    parent.add(mesh); return mesh;
  }
  function profileMesh(rows, sides) {
    // Custom, smooth elliptical ring surface. Row: [y, half-width, depth, xOffset, zOffset].
    sides = Math.max(8, Math.min(sides || 10, 10)); var pos = [], uv = [], idx = [];
    for (var j = 0; j < rows.length; j++) for (var i = 0; i <= sides; i++) {
      var a = i / sides * Math.PI * 2, row = rows[j], xo = row[3] || 0, zo = row[4] || 0;
      pos.push(xo + Math.sin(a) * row[1], row[0], zo + Math.cos(a) * row[2]); uv.push(i / sides, j / (rows.length - 1));
    }
    for (var r = 0; r < rows.length - 1; r++) for (var k = 0; k < sides; k++) {
      var a0 = r * (sides + 1) + k, b0 = a0 + sides + 1;
      idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
    }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function sweep(points, radii, sides, mat, parent, slot) {
    // Variable-radius swept tube used for limbs, straps and seams.
    sides = Math.max(4, Math.min(sides || 4, 4)); var curve = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
    var segs = Math.max(3, Math.ceil((points.length - 1) * 1.05)), pos = [], uv = [], idx = [], axis = new T.Vector3(0, 0, 1), n = new T.Vector3(), b = new T.Vector3();
    for (var j = 0; j <= segs; j++) {
      var u = j / segs, center = curve.getPointAt(u), tangent = curve.getTangentAt(u).normalize();
      if (Math.abs(tangent.dot(axis)) > .93) axis.set(0, 1, 0); else axis.set(0, 0, 1);
      n.crossVectors(tangent, axis).normalize(); b.crossVectors(tangent, n).normalize();
      var ri = u * (radii.length - 1), lo = Math.floor(ri), t = ri - lo, radius = radii[lo] * (1 - t) + radii[Math.min(lo + 1, radii.length - 1)] * t;
      for (var i = 0; i <= sides; i++) {
        var a = i / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        pos.push(center.x + (n.x * c + b.x * s) * radius, center.y + (n.y * c + b.y * s) * radius, center.z + (n.z * c + b.z * s) * radius); uv.push(i / sides, u);
      }
    }
    for (var r = 0; r < segs; r++) for (var k = 0; k < sides; k++) { var v = r * (sides + 1) + k, next = v + sides + 1; idx.push(v, v + 1, next, v + 1, next + 1, next); }
    var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    return put(parent, geo, mat, 0, 0, 0, slot);
  }
  function panel(w, h, depth, radius, mat, x, y, z, parent, slot) {
    var s = new T.Shape(), r = Math.min(radius, w * .28, h * .28);
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    var g = new T.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelSegments: 1, bevelSize: Math.min(.012, depth * .25), bevelThickness: Math.min(.012, depth * .25), curveSegments: 4 });
    g.computeVertexNormals(); normalizeUV(g); return put(parent, g, mat, x, y, z, slot);
  }
  function dome(rows, mat, parent, slot) { return put(parent, profileMesh(rows, 28), mat, 0, 0, 0, slot); }
  function addFace(head, op, mats, skinVisible) {
    var skin = mats.skin, dark = mats.rubber, metal = mats.metal, mask = mats.cloth, skinMat = mats.skin;
    var faceType = String(op.faceForm || 'oval').toLowerCase(), fw = faceType === 'square' ? 1.08 : faceType === 'long' ? .91 : faceType === 'round' ? 1.04 : 1,
      fd = faceType === 'wide' || faceType === 'square' ? 1.06 : faceType === 'long' ? .93 : 1;
    var faceRows = [
      [-.142, .045, .047], [-.12, .071, .066], [-.082, .092, .082], [-.025, .102, .09],
      [.045, .095, .087], [.108, .075, .07], [.145, .035, .04], [.153, .004, .006]
    ].map(function (r) { return [r[0], r[1] * fw, r[2] * fd]; });
    var face = put(head, profileMesh(faceRows, 20), skinMat, 0, 0, 0, 'skin');
    if (!skinVisible) {
      if (op.face === 'mask') {
        panel(.174, .116, .028, .028, mats.rubber, 0, -.065, -.096, head, 'rubber');
        [-1, 1].forEach(function (s) { var filter = new T.Mesh(new T.CylinderGeometry(.021, .018, .014, 10), mats.metal); filter.rotation.x = Math.PI / 2; filter.position.set(s * .063, -.073, -.119); filter.userData.p10Surface = 'metal'; head.add(filter); });
        sweep([[-.088, -.015, -.03], [-.13, -.02, .015], [-.14, -.04, .05]], [.004, .005, .004], 6, mats.webbing, head, 'webbing');
      } else {
        // Layered scarf weave covers the lower face while leaving the eyes open.
        panel(.185, .092, .025, .025, mask, 0, -.071, -.096, head, 'cloth');
        sweep([[-.10, -.06, -.055], [-.06, -.09, -.101], [0, -.095, -.108], [.06, -.09, -.101], [.10, -.06, -.055]], [.006, .008, .008, .008, .006], 7, mats.webbing, head, 'webbing');
      }
    }
    [-1, 1].forEach(function (side) {
      var eye = new T.Mesh(new T.SphereGeometry(.014, 10, 7), dark);
      eye.scale.set(1.35, .68, .55); eye.position.set(side * .041, .026, -.101); eye.userData.p10Surface = 'rubber'; head.add(eye);
      if (skinVisible) { var iris = new T.Mesh(new T.SphereGeometry(.0045, 8, 6), metal); iris.scale.z = .5; iris.position.set(side * .041, .026, -.112); iris.userData.p10Surface = 'metal'; head.add(iris); }
      sweep([[side * .063, .048, -.091], [side * .044, .056, -.102], [side * .022, .05, -.091]], [.006, .008, .005], 7, mats.rubber, head, 'rubber');
      if (skinVisible) {
        var ear = put(head, profileMesh([[-.034, .008, .008], [-.02, .017, .012], [.012, .014, .011], [.03, .004, .006]], 10), skin, side * .098, .0, 0, 'skin');
      }
    });
    if (skinVisible) {
      // Tapered nasal bridge and tip are custom surfaces, not a box attached to a spherical head.
      var nose = put(head, profileMesh([[-.058, .004, .005, 0, -.084], [-.035, .009, .012, 0, -.091], [.0, .015, .016, 0, -.078], [.043, .008, .009, 0, -.065]], 14), skin, 0, 0, 0, 'skin');
      sweep([[-.033, -.102, -.094], [0, -.108, -.101], [.032, -.102, -.094]], [.002, .0028, .002], 6, mats.webbing, head, 'skin');
      sweep([[-.027, -.126, -.093], [0, -.131, -.097], [.027, -.126, -.093]], [.003, .004, .003], 7, mats.rubber, head, 'rubber');
      // Small natural skin tonal marks; covered/softened by the atlas at distance.
      for (var f = 0; f < 5; f++) { var dot = new T.Mesh(new T.SphereGeometry(.0018, 5, 4), skin); dot.position.set((f - 2) * .009, -.048 - (f % 2) * .01, -.097); dot.userData.p10Surface = 'skin'; head.add(dot); }
    }
    return face;
  }

  function build(op) {
    if (!op || op.zombie || !op.id) return null;
    var isSecurity = op.team === 'blue', p = paletteFor(op), g = new T.Group(), all = [];
    var visualRole = String(op.visualForm || op.role || '').toLowerCase(), profile = (root.CHARACTER_FORM_PROFILES && root.CHARACTER_FORM_PROFILES[visualRole]) || {};
    var identityBuild = op.visualBuild || {}, clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
    var shoulderScale = clamp((profile.shoulder || .30) / .30 * (identityBuild.shoulder || 1), .82, 1.30);
    var waistScale = clamp((profile.waist || .23) / .23 * (identityBuild.waist || 1), .82, 1.30);
    var depthScale = clamp((profile.depth || .72) / .72 * (identityBuild.depth || 1), .84, 1.25);
    var plateScale = clamp((profile.plate || .21) / .21 * (identityBuild.plate || 1), .84, 1.25);
    var packScale = clamp((profile.pack || .20) / .20 * (identityBuild.pack || 1), .65, 1.55);
    var mats = { cloth: material('cloth'), skin: material('skin'), armor: material('armor'), webbing: material('webbing'), rubber: material('rubber'), metal: material('metal'), hair: material('hair'), team: material('team') };
    function shell(rows, slot, parent, sides) { var mesh = put(parent || g, profileMesh(rows, sides || 24), mats[slot], 0, 0, 0, slot); all.push(mesh); return mesh; }
    function ptn(parent, w, h, d, rad, slot, x, y, z) { var m = panel(w, h, d, rad, mats[slot], x, y, z, parent, slot); all.push(m); return m; }

    // Continuous torso volume with human waist, ribcage and shoulder transitions.
    var torsoRows = [
      [.80, .145, .095], [.86, .175, .108], [.94, .188, .116], [1.03, .178, .118],
      [1.14, .194, .128], [1.27, .225, .145], [1.38, .254, .146], [1.47, .265, .135],
      [1.54, .225, .115], [1.59, .10, .082], [1.61, .005, .005]
    ].map(function (r) {
      var waistMix = clamp((r[0] - .90) / .48, 0, 1), widthScale = waistScale * (1 - waistMix) + shoulderScale * waistMix;
      var y = 1.18 + (r[0] - 1.18) * clamp(op.h || 1, .95, 1.06);
      return [y, r[1] * widthScale, r[2] * depthScale];
    });
    var torso = shell(torsoRows, 'cloth', g, 28);
    var faceY = 1.66, head = new T.Group(); head.position.y = faceY; g.add(head);
    head.scale.x = clamp(op.w || 1, .92, 1.10);
    var headMesh = addFace(head, op, mats, op.face === 'bare');
    var neck = shell([[1.52, .052, .048], [1.57, .059, .052], [1.63, .057, .052], [1.66, .04, .04]], 'skin', g, 16);
    // Plate carrier: custom contoured, bevelled plates follow the chest, not a rectangular chest block.
    var front = new T.Shape();
    front.moveTo(-.142, -.205); front.quadraticCurveTo(-.17, -.165, -.168, -.11); front.lineTo(-.15, .125);
    front.quadraticCurveTo(-.145, .18, -.095, .19); front.lineTo(.095, .19); front.quadraticCurveTo(.145, .18, .15, .125);
    front.lineTo(.168, -.11); front.quadraticCurveTo(.17, -.165, .142, -.205); front.quadraticCurveTo(0, -.23, -.142, -.205);
    var plateGeo = new T.ExtrudeGeometry(front, { depth: .033, bevelEnabled: true, bevelSegments: 2, bevelSize: .012, bevelThickness: .01, curveSegments: 6 }); plateGeo.computeVertexNormals(); normalizeUV(plateGeo);
    var carrier = put(g, plateGeo, mats.armor, 0, 1.185, -.145, 'armor'); all.push(carrier);
    carrier.scale.x = plateScale;
    carrier.scale.y = clamp((profile.plate || .21) / .21, .86, 1.24);
    // Profile-specific rear equipment changes the outline from behind and in silhouette.
    if (/heavy|anchor|support/.test(visualRole)) {
      ptn(g, .255 * packScale, .34 * packScale, .075, .025, 'armor', 0, 1.28, .125);
      ptn(g, .21 * packScale, .075, .04, .018, 'webbing', 0, 1.09, .18);
    } else if (/marksman|scout|ranger|tracker/.test(visualRole)) {
      ptn(g, .19 * packScale, .24 * packScale, .058, .02, 'webbing', 0, 1.25, .12);
      ptn(g, .075, .19, .05, .014, 'rubber', .12, 1.24, .17);
    } else if (/medic|fieldtech|comms/.test(visualRole)) {
      ptn(g, .22 * packScale, .30 * packScale, .07, .024, 'webbing', 0, 1.28, .12);
      ptn(g, .12, .10, .055, .016, 'team', -.18, 1.13, .16);
      sweep([[.12, 1.43, .15], [.13, 1.60, .16], [.13, 1.75, .15]], [.005, .004, .003], 5, mats.metal, g, 'metal');
    } else if (/climber|salvage|diver/.test(visualRole)) {
      ptn(g, .23 * packScale, .30 * packScale, .07, .025, 'rubber', 0, 1.27, .13);
      [-1, 1].forEach(function (s) { var tank = new T.Mesh(new T.CylinderGeometry(.045, .052, .31 * packScale, 10), mats.metal); tank.position.set(s * .16, 1.26, .16); tank.userData.p10Surface = 'metal'; g.add(tank); all.push(tank); });
    } else {
      ptn(g, .16 * packScale, .22 * packScale, .055, .02, 'webbing', .05, 1.22, .12);
    }
    // Irregular fighters wear a one-sided field-coat panel over mixed scavenged kit.
    if (!isSecurity) {
      var drape = new T.Shape(); drape.moveTo(-.06, .20); drape.quadraticCurveTo(.01, .22, .075, .16); drape.lineTo(.085, .01); drape.lineTo(.058, -.17); drape.lineTo(-.005, -.20); drape.lineTo(-.075, -.11); drape.lineTo(-.06, .06); drape.closePath();
      var drapeGeo = new T.ExtrudeGeometry(drape, { depth: .016, bevelEnabled: true, bevelSegments: 1, bevelSize: .006, bevelThickness: .006, curveSegments: 3 }); drapeGeo.computeVertexNormals(); normalizeUV(drapeGeo);
      var drapeMesh = put(g, drapeGeo, mats.cloth, -.22, 1.25, -.194, 'cloth'); all.push(drapeMesh);
      sweep([[-.27, 1.43, -.16], [-.23, 1.36, -.205], [-.21, 1.26, -.214]], [.008, .01, .008], 6, mats.webbing, g, 'webbing');
    }
    // Stitched plate edges, shoulder yoke, and functional webbing.
    [-1, 1].forEach(function (s) {
      sweep([[s * .14, 1.49, -.06], [s * .19, 1.43, -.105], [s * .17, 1.32, -.18], [s * .135, 1.06, -.19]], [.022, .023, .023, .018], 8, mats.webbing, g, 'webbing');
      sweep([[s * .17, 1.03, -.18], [s * .19, .94, -.12], [s * .16, .87, -.08]], [.017, .019, .014], 8, mats.webbing, g, 'webbing');
      ptn(g, .105, .12, .026, .025, 'armor', s * .082, 1.33, -.183);
      ptn(g, .068, .11, .045, .014, 'webbing', s * .205, 1.10, -.14);
      // Shoulder and knee forms are layered sewn fabric / pads with shaped surfaces.
      sweep([[s * .23, 1.49, .0], [s * .30, 1.48, -.005], [s * .36, 1.43, .018]], [.062, .075, .053], 12, mats.cloth, g, 'cloth');
      ptn(g, .112, .09, .035, .028, 'armor', s * .135, 1.18, -.194);
      ptn(g, .11, .105, .045, .026, 'armor', s * .14, .44, -.09);
    });
    ptn(g, .12, .075, .033, .016, 'metal', 0, 1.06, -.193);
    // Lower plate retention, shoulder panel and defined center seam.
    sweep([[-.125, .99, -.13], [0, .96, -.16], [.125, .99, -.13]], [.012, .014, .012], 7, mats.metal, g, 'metal');
    sweep([[0, 1.37, -.18], [0, 1.29, -.183], [0, 1.18, -.184], [0, 1.08, -.17]], [.0025, .0025, .0025, .002], 5, mats.webbing, g, 'webbing');
    // Individually shaped magazine, utility and medical pouches; seams and lid retainers are legible up close.
    for (var i = 0; i < 3; i++) {
      var px = (i - 1) * .105;
      ptn(g, .088, .13, .048, .016, i === 1 && isSecurity ? 'armor' : 'webbing', px, 1.12, -.215);
      sweep([[px - .034, 1.155, -.241], [px, 1.161, -.244], [px + .034, 1.155, -.241]], [.003, .003, .003], 5, mats.metal, g, 'metal');
      ptn(g, .026, .022, .008, .004, 'metal', px, 1.12, -.244);
    }
    // Believable belt and asymmetric equipment silhouettes.
    sweep([[-.18, .89, -.09], [-.1, .87, -.15], [0, .86, -.16], [.12, .87, -.14], [.18, .89, -.08]], [.018, .02, .021, .02, .016], 8, mats.webbing, g, 'webbing');
    ptn(g, .055, .05, .018, .01, 'metal', 0, .87, -.18);
    var headType = String(op.head || 'helmet').toLowerCase(), enclosedHead = headType === 'helmet' || headType === 'visor' || headType === 'hood' || headType === 'beanie';
    if (headType === 'helmet' || headType === 'visor') {
      var helmetSlot = isSecurity ? 'armor' : 'cloth';
      shell([[.06, .10, .09], [.09, .135, .126], [.13, .15, .14], [.18, .136, .132], [.23, .104, .108], [.255, .047, .055], [.262, .005, .006]], helmetSlot, head, 20);
      if (isSecurity) {
        [-1, 1].forEach(function (s) { ptn(head, .025, .11, .045, .008, 'metal', s * .133, -.005, -.005); ptn(head, .044, .055, .035, .012, 'rubber', s * .139, -.04, .018); });
        ptn(head, .048, .04, .024, .008, 'metal', 0, .075, -.105);
        if (headType === 'visor') [-1, 1].forEach(function (s) {
          sweep([[s * .071, .047, -.099], [s * .066, .027, -.112], [s * .045, .016, -.115], [s * .020, .027, -.112], [s * .018, .047, -.099], [s * .044, .056, -.101], [s * .071, .047, -.099]], [.0028, .0028, .003, .0028, .0028, .0028, .0028], 6, mats.metal, head, 'metal');
        });
      } else {
        // Irregular fighters use a softened field helmet and cloth tie details.
        sweep([[-.14, 1.78, -.015], [-.10, 1.755, -.07], [0, 1.748, -.09], [.10, 1.755, -.07], [.14, 1.78, -.015]], [.012, .014, .014, .014, .012], 7, mats.webbing, g, 'webbing');
      }
    } else if (headType === 'hood') {
      shell([[.015, .09, .082], [.05, .125, .118], [.11, .142, .132], [.18, .136, .128], [.22, .09, .092], [.235, .01, .012]], 'cloth', head, 18);
      sweep([[-.13, 1.78, -.015], [-.10, 1.73, -.08], [0, 1.715, -.11], [.10, 1.73, -.08], [.13, 1.78, -.015]], [.012, .016, .018, .016, .012], 7, mats.webbing, g, 'webbing');
    } else if (headType === 'beanie') {
      shell([[.09, .09, .085], [.12, .12, .11], [.17, .12, .11], [.205, .09, .085], [.216, .012, .014]], 'cloth', head, 18);
      sweep([[-.11, 1.81, -.02], [-.06, 1.79, -.082], [0, 1.788, -.093], [.06, 1.79, -.082], [.11, 1.81, -.02]], [.009, .011, .011, .011, .009], 7, mats.webbing, g, 'webbing');
    } else if (headType === 'cap') {
      shell([[.105, .074, .072], [.13, .098, .094], [.18, .095, .09], [.205, .06, .058], [.208, .008, .009]], isSecurity ? 'armor' : 'cloth', head, 18);
      ptn(head, .15, .024, .075, .01, 'rubber', 0, .105, -.083);
    } else if (headType === 'beret') {
      shell([[.12, .07, .065], [.15, .11, .09, .015, .006], [.195, .12, .092, .024, .008], [.215, .065, .05, .025, .008], [.218, .008, .009, .02, .008]], isSecurity ? 'armor' : 'cloth', head, 18);
      sweep([[-.08, 1.79, -.035], [0, 1.785, -.095], [.08, 1.79, -.035]], [.006, .007, .006], 6, mats.webbing, g, 'webbing');
    } else if (headType === 'bandana') {
      ptn(head, .18, .044, .025, .01, 'cloth', 0, .092, -.094);
      sweep([[.08, .094, -.095], [.13, .07, -.058], [.16, .04, -.018]], [.009, .01, .007], 6, mats.cloth, head, 'cloth');
    } else {
      shell([[.10, .075, .07], [.13, .092, .085], [.17, .08, .075], [.19, .04, .04], [.192, .006, .007]], 'hair', head, 16);
    }
    if (!enclosedHead && headType !== 'bandana') {
      shell([[.045, .046, .052], [.075, .073, .074], [.12, .085, .08], [.158, .067, .062], [.17, .01, .012]], 'hair', head, 16);
      [-1, 1].forEach(function (s) { ptn(head, .024, .075, .018, .006, 'hair', s * .084, -.015, -.002); });
    }
    if (isSecurity) {
      ptn(g, .14, .11, .07, .02, 'armor', .24, 1.22, .10);
      sweep([[.25, 1.27, .14], [.26, 1.39, .14], [.24, 1.49, .12]], [.004, .003, .002], 5, mats.metal, g, 'metal');
    } else {
      ptn(g, .12, .22, .065, .024, 'webbing', .235, .89, .10);
      sweep([[-.23, 1.42, -.18], [-.16, 1.34, -.214], [-.06, 1.24, -.228], [.08, 1.13, -.218], [.18, 1.03, -.18]], [.023, .021, .02, .019, .016], 8, mats.webbing, g, 'webbing');
      for (var c = 0; c < 5; c++) {
        var cx = -.155 + c * .055, cy = 1.31 - c * .055;
        sweep([[cx, cy - .025, -.234], [cx, cy + .022, -.237]], [.007, .008], 6, mats.metal, g, 'metal');
      }
      sweep([[-.34, 1.43, -.02], [-.28, 1.39, -.1], [-.22, 1.36, -.17]], [.031, .03, .024], 8, mats.cloth, g, 'cloth');
      ptn(g, .07, .12, .04, .018, 'rubber', -.25, 1.02, -.11);
    }
    // Low-profile faction tabs preserve fast team recognition without large glowing markers.
    ptn(g, .055, .09, .012, .014, 'team', isSecurity ? -.313 : .313, 1.43, -.045);
    // Role equipment changes silhouette and loadout layout, not just the palette.
    var identity = hash(op.id);
    if (/heavy|anchor|support/.test(visualRole)) {
      [-1, 1].forEach(function (s) { ptn(g, .118, .15, .052, .03, 'armor', s * .20, 1.39, -.095); ptn(g, .09, .12, .07, .02, 'webbing', s * .225, .98, -.13); });
      ptn(g, .18, .10, .065, .025, 'rubber', .22, 1.02, .11);
    } else if (/marksman|scout|ranger|tracker/.test(visualRole)) {
      ptn(g, .075, .145, .055, .015, 'webbing', -.235, 1.22, -.202);
      sweep([[-.24, 1.28, -.16], [-.27, 1.43, -.12], [-.26, 1.63, -.05]], [.004, .003, .002], 5, mats.metal, g, 'metal');
      sweep([[-.20, 1.42, -.19], [-.10, 1.31, -.236], [.05, 1.18, -.23], [.18, 1.08, -.18]], [.014, .014, .013, .011], 6, mats.webbing, g, 'webbing');
    } else if (/breacher|rusher|sapper/.test(visualRole)) {
      ptn(g, .19, .20, .045, .035, 'armor', 0, 1.27, -.182);
      ptn(g, .09, .13, .06, .02, 'rubber', .225, 1.04, -.13);
      sweep([[-.15, 1.48, -.12], [-.10, 1.34, -.20], [0, 1.24, -.225], [.14, 1.12, -.205]], [.019, .018, .016, .013], 7, mats.webbing, g, 'webbing');
    } else if (/medic|fieldtech|comms/.test(visualRole)) {
      ptn(g, .115, .16, .055, .022, 'webbing', -.23, 1.12, -.202);
      ptn(g, .048, .048, .014, .01, 'team', -.23, 1.13, -.235);
      sweep([[.22, 1.28, .08], [.25, 1.42, .10], [.23, 1.57, .07]], [.004, .003, .002], 5, mats.metal, g, 'metal');
    } else if (/climber|salvage|diver/.test(visualRole)) {
      ptn(g, .14, .20, .07, .022, 'rubber', .24, 1.25, .12);
      sweep([[-.27, 1.48, -.08], [-.25, 1.25, -.16], [-.24, 1.02, -.12]], [.009, .011, .01], 6, mats.metal, g, 'metal');
      ptn(g, .07, .11, .05, .016, 'metal', .23, .95, -.12);
    }
    // A stable per-identity accessory signature makes same-role operators easier to tell apart.
    switch (identity % 8) {
      case 0: ptn(g, .09, .13, .055, .017, 'webbing', -.245, .91, -.105); break;
      case 1: ptn(g, .105, .10, .07, .02, 'armor', .225, 1.48, .02); break;
      case 2: sweep([[-.26, 1.40, -.16], [-.12, 1.27, -.228], [.04, 1.15, -.226], [.22, 1.04, -.16]], [.012, .014, .013, .01], 6, mats.webbing, g, 'webbing'); break;
      case 3: ptn(g, .11, .15, .06, .02, 'webbing', .235, 1.13, -.19); break;
      case 4: ptn(g, .105, .21, .065, .018, 'rubber', -.245, 1.17, .12); break;
      case 5: sweep([[-.20, 1.52, .12], [-.12, 1.57, .18], [0, 1.58, .20], [.12, 1.57, .18], [.20, 1.52, .12]], [.027, .03, .031, .03, .027], 7, mats.cloth, g, 'cloth'); break;
      case 6: ptn(g, .13, .12, .06, .02, 'armor', -.225, .66, -.105); break;
      default: sweep([[.24, 1.46, -.08], [.28, 1.38, -.12], [.26, 1.28, -.18]], [.016, .02, .018], 6, mats.webbing, g, 'webbing'); break;
    }
    // Arms use swept anatomical sleeves/forearms in the same shoulder anchors the gameplay rig animates.
    function makeArm(side) {
      var sh = side > 0 ? [.34 * shoulderScale, 1.40, .02] : [-.32 * shoulderScale, 1.39, -.04], el = side > 0 ? [-.03, -.08, -.20] : [.07, -.09, -.30], hand = side > 0 ? [-.22, -.18, -.33] : [.35, -.17, -.56];
      var arm = new T.Group(); arm.position.set(sh[0], sh[1], sh[2]); g.add(arm);
      sweep([[0, 0, 0], [el[0] * .48, el[1] * .48, el[2] * .48], el], [.074, .088, .061], 12, mats.cloth, arm, 'cloth');
      sweep([el, [(el[0] + hand[0]) * .57, (el[1] + hand[1]) * .57, (el[2] + hand[2]) * .57], hand], [.059, .052, .038], 12, mats.cloth, arm, 'cloth');
      sweep([[el[0], el[1], el[2] + .045], [el[0] * .68 + hand[0] * .32, el[1] * .68 + hand[1] * .32, el[2] * .68 + hand[2] * .32 + .045], [hand[0], hand[1], hand[2] + .045]], [.05, .041, .032], 9, mats.rubber, arm, 'rubber');
      var palm = put(arm, profileMesh([[-.03, .022, .018, hand[0], hand[2]], [0, .035, .025, hand[0], hand[2]], [.036, .032, .025, hand[0], hand[2]]], 12), mats.rubber, 0, hand[1], 0, 'rubber');
      for (var f = 0; f < 4; f++) { var fx = hand[0] - .022 + f * .014; sweep([[fx, hand[1] - .005, hand[2] - .005], [fx, hand[1] - .022, hand[2] - .033], [fx + .002, hand[1] - .024, hand[2] - .055]], [.008, .007, .004], 6, mats.rubber, arm, 'rubber'); }
      sweep([[hand[0] + .03, hand[1], hand[2] - .005], [hand[0] + .05, hand[1] - .012, hand[2] - .03], [hand[0] + .035, hand[1] - .022, hand[2] - .045]], [.01, .008, .005], 6, mats.rubber, arm, 'rubber');
      ptn(arm, .12, .055, .045, .018, 'armor', el[0], el[1], el[2] + .035);
      sweep([[el[0] * .76, el[1] * .76, el[2] * .76], [el[0] * .86, el[1] * .86, el[2] * .86 + .052], [el[0] * .96, el[1] * .96, el[2] * .96]], [.008, .009, .008], 6, mats.metal, arm, 'metal');
      return { group: arm, shoulder: sh, default: hand };
    }
    var rightArm = makeArm(1), leftArm = makeArm(-1);
    function makeLeg(px, side) {
      var leg = new T.Group(); leg.position.set(px, .85, 0); g.add(leg);
      sweep([[0, 0, 0], [side * .012, -.16, .008], [side * .006, -.34, .01], [0, -.43, .01]], [.112, .13, .105, .082], 14, mats.cloth, leg, 'cloth');
      sweep([[0, -.40, .01], [-side * .004, -.54, .006], [0, -.68, -.008], [0, -.75, -.005]], [.084, .08, .066, .054], 14, mats.cloth, leg, 'cloth');
      ptn(leg, .105, .11, .045, .022, 'armor', side * .012, -.43, -.085);
      // Sculpted boot with a tapered toe and raised ankle cuff.
      var boot = new T.Shape(); boot.moveTo(-.06, -.03); boot.lineTo(.055, -.03); boot.quadraticCurveTo(.073, -.028, .073, -.005); boot.lineTo(.068, .03); boot.quadraticCurveTo(.05, .06, .015, .065); boot.lineTo(-.052, .055); boot.quadraticCurveTo(-.07, .045, -.068, .02); boot.closePath();
      var bg = new T.ExtrudeGeometry(boot, { depth: .19, bevelEnabled: true, bevelSegments: 1, bevelSize: .008, bevelThickness: .009, curveSegments: 5 }); bg.computeVertexNormals(); normalizeUV(bg);
      put(leg, bg, mats.rubber, 0, -.80, -.105, 'rubber');
      sweep([[-.06, -.79, -.06], [0, -.80, -.12], [.06, -.79, -.06]], [.012, .013, .011], 7, mats.metal, leg, 'metal');
      sweep([[-.045, -.705, -.024], [0, -.715, -.035], [.045, -.705, -.024]], [.005, .006, .005], 6, mats.webbing, leg, 'webbing');
      return leg;
    }
    var legs = makeLeg(-.14 * clamp(waistScale, .9, 1.18), -1), legR = makeLeg(.14 * clamp(waistScale, .9, 1.18), 1);
    var rifle = new T.Group(); rifle.position.set(.1, 1.27, -.1); g.add(rifle);
    var flash = new T.Mesh(new T.PlaneGeometry(.3, .3), new T.MeshBasicMaterial({ color: 0xffd27a, side: T.DoubleSide })); flash.position.set(.1, 1.28, -.74); flash.visible = false; g.add(flash);
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    var arms = []; [rightArm.group, leftArm.group].forEach(function (a) { a.traverse(function (o) { if (o.isMesh) arms.push(o); }); });
    return {
      g: g, torso: torso, head: headMesh, headGroup: head, legs: legs, legR: legR,
      rifle: rifle, arms: arms, armR: rightArm.group, armL: leftArm.group,
      armRShoulder: rightArm.shoulder, armLShoulder: leftArm.shoulder,
      armRDefault: rightArm.default, armLDefault: leftArm.default,
      flash: flash, mats: [mats.cloth, mats.skin, mats.armor, mats.webbing, mats.rubber, mats.metal, mats.hair, mats.team],
      phase10Character: true
    };
  }
  function uvRect(slot) {
    var c = SURFACES[slot]; if (!c) return null;
    // CanvasTexture.flipY maps the canvas top row to UV v=1. Map each slot
    // into its true atlas row and leave a 3 px gutter against mip bleed.
    var insetU = 3 / 1024, insetV = 3 / 512, vMin = 1 - (c[1] + 1) / 2;
    return [c[0] / 4 + insetU, vMin + insetV, 1 / 4 - insetU * 2, .5 - insetV * 2];
  }
  // Keep the prototype gate narrow: only these two audited models are enabled
  // until the broader roster passes visual-identity and device-performance review.
  root.SightlineP10Characters = { build: build, atlas: atlas, uvRect: uvRect, supported: function (op) { return !!op && !op.zombie && (op.id === 'riptide' || op.id === 'ashfall'); } };
})(typeof window !== 'undefined' ? window : globalThis);

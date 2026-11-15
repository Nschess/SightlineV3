/* Source-selected Legendary weapon modules. Only modules matching the selected firearm and picker identity are wired. */
/* ---- legendary-phoenix.js ---- */
/* Sightline legendary finish: PHOENIX REQUIEM  (Rampart BR)
   Original design. Cosmetic only: no damage, ammo, recoil, hit or network behaviour is touched.

   What it adds
     - Obsidian body with a living fire shader: ember cracks + upward-licking flame tongues, shared in
       gun space across stock, receiver, scope, handguard and mag (patched into the gun's own materials).
     - Phoenix wings (5 feather blades per flank) that fan open when firing and fold while reloading,
       a flickering flame crown on the scope, ember vents on the handguard, an ash-and-ember updraft.
     - Shot: fire-wave stock->muzzle, muzzle flare + shock rings, comet tracer with twin fire
       strands, impact fireball with rising embers. Reload: fire banks down, rekindles with a whoomp.
     - Equip "rebirth" sweep + synthesised phoenix cry. All audio synthesised, no asset files.
   Contract (same as SightlineEclipse / SightlineVerdant):
     finish, weapon, buildRig(THREE), createFx(THREE, scene), decorate(btn,f,sel), equipSound/rearmSound/mixShot */
(function (global) {
'use strict';

var FINISH = {
  name: 'Phoenix Rebirth', legendary: true, legendKind: 'phoenix',
  metal: 0x1d0c0c, polymer: 0x0c0505, trim: 0xff7a1e,
  desc: 'LEGENDARY · obsidian and living flame, feathered wings, comet tracers, rebirth on reload'
};

/* ------------------------------------------------------------------ shaders */
var GLSL_COMMON = 'uniform float uT,uPulse,uHeat,uAwake,uDim,uGain,uLow;\nvarying vec3 vEcl;\n';
var GLSL_FRAG_FUNCS =
  'float eH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\n' +
  'uniform sampler2D uNoise;\n' +
  'float eN(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f); vec2 o=i.z*vec2(37.,17.);\n' +
  ' return mix(texture2D(uNoise,(i.xy+o+f.xy+.5)/256.).x,texture2D(uNoise,(i.xy+o+vec2(37.,17.)+f.xy+.5)/256.).x,f.z);}\n';

var SURF_OLD = '{\n float t=vEcl.y;\n vec3 q=vEcl*vec3(46.,46.,16.); vec3 f=abs(fract(q)-.5); float ln=smoothstep(.46,.5,max(f.y,f.z)); diffuseColor.rgb*=1.-ln*.5;\n diffuseColor.rgb=mix(diffuseColor.rgb*.64,diffuseColor.rgb*1.2,smoothstep(-.012,.014,t));\n float inl=smoothstep(.0025,.0,abs(t-.0105))+smoothstep(.0022,.0,abs(t+.0085));\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.5,.15)*.9,clamp(inl,0.,1.)*.9);\n float sc=step(.96,fract(sin(floor(vEcl.z*70.)*12.9+floor(vEcl.y*70.)*78.2)*437.5)); diffuseColor.rgb*=1.-sc*.3;\n}\n';
var GLSL_EMISSIVE =
  '{\n' +
  ' vec3 q=vec3(vEcl.x*30.,vEcl.y*24.-uT*2.3,vEcl.z*15.);\n' +
  ' float n=eN(q)*.62+eN(q*2.2+vec3(5.,0.,3.))*.38;\n' +
  ' if(uLow>.5)n=eN(q);\n' +
  ' float height=clamp((vEcl.y+.06)*6.5,0.,1.);\n' +
  ' float tongue=smoothstep(.62,.9,n+.14*sin(vEcl.z*18.-uT*3.2)+height*.12);\n' +
  ' float ridge=pow(1.-abs(eN(vEcl*vec3(46.,46.,15.)+vec3(0.,-uT*.5,0.))*2.-1.),24.)*(.15+.85*smoothstep(.3,.62,eN(vEcl*vec3(9.,9.,5.)+vec3(2.))));\n' +
  ' float breath=.6+.4*sin(uT*2.1+vEcl.z*6.);\n' +
  ' float waveP=exp(-pow((vEcl.z-(.5-uPulse*1.3))*13.,2.))*step(0.,uPulse);\n' +
  ' float waveA=exp(-pow((vEcl.z-(.5-uAwake*1.5))*5.5,2.))*step(0.,uAwake);\n' +
  ' float beatP=fract(uT*.2); float waveB=exp(-pow((vEcl.z-(.55-beatP*1.7))*6.5,2.))*step(beatP,.62)*(1.-uDim);\n' +   // slow idle "heartbeat" of fire rolling stock->muzzle
  ' float lit=(ridge*.8*breath+tongue*(.3+.7*height))*(1.-uDim)+(waveP+waveA)*(.22+ridge*.9+tongue*.6)+waveB*(.12+ridge*.75+tongue*.3)+uHeat*(.15+ridge*.7+tongue*.5)*.45;\n' +
  ' lit=min(lit,1.5);\n' +
  ' float hotk=clamp(tongue*.55+waveP*.8+waveA*.7+waveB*.5+uHeat*.5+ridge*.25,0.,1.);\n' +
  ' vec3 col=mix(vec3(.85,.05,.02),vec3(1.,.5,.06),clamp(hotk*1.4,0.,1.));\n' +
  ' col=mix(col,vec3(1.,.9,.5),clamp(hotk*hotk*.8-.12,0.,1.));\n' +
  ' col=mix(col,vec3(1.,.97,.82),clamp(ridge*(uHeat*.7+waveP*.9+waveB*.6),0.,.85));\n' +   // cracks go white-hot under load
  ' float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);\n' +
  ' vec3 rim=mix(vec3(.9,.1,.05),vec3(1.,.55,.1),.5+.5*sin(uT*1.1+vEcl.z*4.))*fres*(.5+uHeat*.6);\n' +
  ' totalEmissiveRadiance+=(col*lit*1.25+rim)*uGain;\n' +
  '}\n';

function patchMaterial(mat, U, gain) {
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uT = U.uT; sh.uniforms.uPulse = U.uPulse; sh.uniforms.uHeat = U.uHeat;
    sh.uniforms.uAwake = U.uAwake; sh.uniforms.uDim = U.uDim; sh.uniforms.uLow = U.uLow;
    sh.uniforms.uInv = U.uInv; sh.uniforms.uNoise = U.uNoise; sh.uniforms.uGain = { value: gain };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uInv;\nvarying vec3 vEcl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEcl=(uInv*modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_FRAG_FUNCS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURF_OLD)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_EMISSIVE);
  };
  mat.customProgramCacheKey = function () { return 'phoenix-requiem-v1'; };
  mat.needsUpdate = true;
  return mat;
}

/* ------------------------------------------------------------------ textures */

function noiseTexture(T) {   // one shared 256x256 random texture: replaces the per-pixel sin-hash value noise
  var g = global; if (g.__slNoise && g.__slNoise.T === T) return g.__slNoise.tex;
  var n = 256, d = new Uint8Array(n * n * 4), s = 987654321, i;
  for (i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  var tx = new T.DataTexture(d, n, n, T.RGBAFormat); tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.magFilter = tx.minFilter = T.LinearFilter; tx.generateMipmaps = false; tx.needsUpdate = true;
  g.__slNoise = { T: T, tex: tx }; return tx;
}

function mergeGeos(T, list) {   // merge small static geometries that share a material into one draw call
  var pos = [], nor = [], uv = [], idx = [], off = 0, i;
  list.forEach(function (g) {
    var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 0, n ? n.getZ(i) : 1); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
    if (g.index) { for (i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); } else { for (i = 0; i < p.count; i++) idx.push(i + off); }
    off += p.count;
  });
  var m = new T.BufferGeometry();
  m.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); m.setIndex(idx);
  return m;
}
/* Bevelled, mirrored receiver/magazine armour. Coordinates are firearm-local
   [z,y] outlines; extrusion gives the part real thickness instead of a decal. */
function addBilateralArmorPlate(T, parent, name, x, depth, bevel, outline, material) {
  var shape = new T.Shape(), i;
  for (i = 0; i < outline.length; i++) {
    var px = -outline[i][0], py = outline[i][1];
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  }
  shape.closePath();
  var geo = new T.ExtrudeGeometry(shape, {
    depth: depth, steps: 1, bevelEnabled: bevel > 0, bevelSegments: 1,
    bevelSize: bevel, bevelThickness: bevel, curveSegments: 1
  });
  geo.computeVertexNormals();
  var parts = [];
  [-1, 1].forEach(function (side) {
    var mesh = new T.Mesh(geo, material);
    mesh.name = name + '-side-' + (side < 0 ? 'left' : 'right');
    mesh.rotation.y = side * Math.PI / 2;
    mesh.scale.x = side;
    mesh.position.x = side * (x - depth / 2);
    mesh.userData.legendaryStructuralPart = true;
    parent.add(mesh); parts.push(mesh);
  });
  return parts;
}
function buildLegendaryMagazineArmor(T, name, host, outline, x, depth, bevel, armor, inlay, spineZ) {
  var mag = host && host.userData && host.userData.mag;
  if (!mag) return null;
  var detail = new T.Group(); detail.name = name + '-moving-magazine-armor';
  addBilateralArmorPlate(T, detail, name + '-mag-shell', x, depth, bevel, outline, armor);
  addBilateralArmorPlate(T, detail, name + '-mag-inlay', x + depth * .48, depth * .22, bevel * .45,
    outline.slice(1, outline.length - 1).map(function (p) { return [spineZ + (p[0] - spineZ) * .72, p[1] * .72]; }), inlay);
  var ridge = new T.Mesh(new T.BoxGeometry(.004, .008, .105), inlay);
  ridge.name = name + '-magazine-keel'; ridge.position.set(0, -.127, spineZ); ridge.userData.legendaryStructuralPart = true;
  detail.add(ridge); detail.visible = false; mag.add(detail);
  return detail;
}
/* Later pack IIFEs have independent lexical scopes. Share the small geometry
   constructors so every flagship uses the same bounded plate implementation. */
global.SightlineLegendaryGeometry = Object.freeze({
  addBilateralArmorPlate: addBilateralArmorPlate,
  buildLegendaryMagazineArmor: buildLegendaryMagazineArmor
});
var texCache = {};
function canvasTex(T, key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  return (texCache[key] = new T.CanvasTexture(c));
}
function flareTex(T) {
  return canvasTex(T, 'pflare', 128, 128, function (g, w) {
    var h = w / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,248,215,1)'); gr.addColorStop(.12, 'rgba(255,200,90,.95)'); gr.addColorStop(.4, 'rgba(255,90,20,.36)'); gr.addColorStop(1, 'rgba(200,30,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
function discTex(T) {
  return canvasTex(T, 'pdisc', 64, 64, function (g, w) {
    var h = w / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
function starTex(T) {   // soft core + thin horizontal/vertical streaks
  return canvasTex(T, 'pstar', 128, 128, function (g, w) {
    var h = w / 2, gr = g.createRadialGradient(h, h, 0, h, h, h * .5);
    gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(.35, 'rgba(255,170,70,.55)'); gr.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    var hz = g.createLinearGradient(0, 0, w, 0); hz.addColorStop(0, 'rgba(255,120,30,0)'); hz.addColorStop(.5, 'rgba(255,235,190,.95)'); hz.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = hz; g.fillRect(0, h - 1.5, w, 3);
    var vt = g.createLinearGradient(0, 0, 0, w); vt.addColorStop(0, 'rgba(255,120,30,0)'); vt.addColorStop(.5, 'rgba(255,235,190,.8)'); vt.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = vt; g.fillRect(h - 1, 0, 2, w);
  });
}
/* Feather blade: long leaf shape, crimson base -> gold tip, bright centre rib. Alpha-tapered. */
function featherTex(T) {
  return canvasTex(T, 'pfeather', 256, 64, function (g, w, h) {
    g.clearRect(0, 0, w, h);
    var gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(160,10,10,.95)'); gr.addColorStop(.45, 'rgba(255,80,15,.95)'); gr.addColorStop(1, 'rgba(255,215,110,.95)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, h * .5);
    g.bezierCurveTo(w * .25, h * .02, w * .75, h * .05, w, h * .5); g.bezierCurveTo(w * .75, h * .95, w * .25, h * .98, 0, h * .5); g.fill();
    g.strokeStyle = 'rgba(255,245,200,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, h * .5); g.lineTo(w * .96, h * .5); g.stroke();
    g.strokeStyle = 'rgba(255,200,120,.35)'; g.lineWidth = 1;
    for (var i = 1; i < 9; i++) { var x = w * i / 10; g.beginPath(); g.moveTo(x, h * .5); g.lineTo(x + w * .08, h * .12); g.moveTo(x, h * .5); g.lineTo(x + w * .08, h * .88); g.stroke(); }
  });
}

/* ------------------------------------------------------------------ the rig */
var ANCHOR = {
  muzzle: [0.0, 0.012, -0.70],
  scope: { x: 0.006, y: 0.152, z: -0.02 },
  wing: { x: 0.0305, y: 0.018, z: 0.02, n: 5, len: 0.15 },
  vents: { x: 0.0309, y: 0.006, z0: -0.25, z1: -0.40, n: 3 },
  ember: { cx: 0.006, cy: 0.0, z0: 0.36, z1: -0.62 }
};

function buildRig(T, host) {
  var A = ANCHOR, group = new T.Group(); group.name = 'phoenix-requiem-rig';
  warm(global.SightlinePhoenix);
  var U = { uT: { value: 0 }, uPulse: { value: -1 }, uHeat: { value: 0 }, uAwake: { value: -1 }, uDim: { value: 0 }, uLow: { value: 0 }, uNoise: { value: noiseTexture(T) }, uInv: { value: new T.Matrix4() } };
  var S = { t: 0, pulse: -1, heat: 0, awake: -1, dim: 0, boost: 0, flare: 0, flash: 0, rf: 0, reloading: false, low: false, pendingRearm: false, rearmFx: 0, spread: .3, chase: 9 };
  var add = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
  function basic(color, opacity, extra) { var o = { color: color, opacity: opacity }; for (var k in add) o[k] = add[k]; for (var e in (extra || {})) o[e] = extra[e]; return new T.MeshBasicMaterial(o); }

  /* --- forged receiver shell and phoenix wing armour ----------------------------------------- */
  var phoenixArmor = new T.MeshPhongMaterial({ color: 0x27110d, specular: 0xb45e32, shininess: 108, emissive: 0x260800, emissiveIntensity: .16, side: T.DoubleSide });
  var phoenixInlay = new T.MeshPhongMaterial({ color: 0x965126, specular: 0xf5bd67, shininess: 132, emissive: 0x311006, emissiveIntensity: .10, side: T.DoubleSide });
  addBilateralArmorPlate(T, group, 'phoenix-2-wing-root-receiver-shell', .0295, .007, .0014,
    [[-.232,.006],[-.202,.042],[-.166,.027],[-.130,.046],[-.083,.031],[-.028,.021],[.052,.006],[.016,-.024],[-.120,-.035],[-.205,-.017]], phoenixArmor);
  addBilateralArmorPlate(T, group, 'phoenix-2-machined-feather-channel', .0332, .0018, .00045,
    [[-.194,.004],[-.163,.025],[-.132,.014],[-.098,.031],[-.066,.018],[-.030,.011],[.022,.003],[-.005,-.014],[-.112,-.024],[-.181,-.013]], phoenixInlay);

  /* --- wings: five solid, bevelled feather vanes per flank, pivoted at the receiver ----------- */
  var wings = [];
  var featherShape = new T.Shape();
  featherShape.moveTo(0, 0); featherShape.lineTo(.017, A.wing.len * .17); featherShape.lineTo(.012, A.wing.len * .57);
  featherShape.lineTo(.006, A.wing.len * .86); featherShape.lineTo(0, A.wing.len); featherShape.lineTo(-.006, A.wing.len * .86);
  featherShape.lineTo(-.012, A.wing.len * .57); featherShape.lineTo(-.017, A.wing.len * .17); featherShape.closePath();
  var fGeo = new T.ExtrudeGeometry(featherShape, { depth: .0035, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: .001, bevelThickness: .001, curveSegments: 1 });
  fGeo.rotateX(Math.PI / 2); fGeo.computeVertexNormals();
  (function () {   // ExtrudeGeometry UVs are in metres, so the leaf texture was sampling only its transparent corner. Remap to 0..1: u = base->tip, v = across the vane.
    var fp = fGeo.attributes.position, fu = fGeo.attributes.uv, fi, fz;
    for (fi = 0; fi < fp.count; fi++) { fz = fp.getZ(fi) / A.wing.len; fu.setXY(fi, fz < 0 ? 0 : fz > 1 ? 1 : fz, fp.getX(fi) / .036 + .5); }
    fu.needsUpdate = true;
  })();
  var featherMats = [], tips = [];
  var tipMat = new T.SpriteMaterial({ map: flareTex(T), color: 0xffb04a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .5 });
  for (var fm = 0; fm < A.wing.n; fm++) featherMats.push(new T.MeshPhongMaterial({ color: 0x9d3c16, map: featherTex(T), specular: 0xffbd6d, shininess: 105, emissive: 0x7a2a08, emissiveIntensity: .55, transparent: true, opacity: .84, side: T.DoubleSide }));
  [-1, 1].forEach(function (side) {
    var wg = new T.Group(); wg.position.set(side * A.wing.x, A.wing.y, A.wing.z); group.add(wg);
    var feathers = [];
    for (var i = 0; i < A.wing.n; i++) {
      var piv = new T.Group(); wg.add(piv);
      var m = new T.Mesh(fGeo, featherMats[i]); m.name = 'phoenix-2-forged-feather-vane-' + (i + 1);
      var lenK = .78 + (A.wing.n - 1 - Math.abs(i - 2)) * .11;   // geometry is rotated so length runs along Z: inner feathers longer than outer ones
      m.scale.set(1, 1, lenK); piv.add(m);
      var tip = new T.Sprite(tipMat); tip.scale.set(.04, .04, 1); tip.position.set(0, 0, A.wing.len * lenK); piv.add(tip); tips.push(tip);
      feathers.push(piv);
    }
    wings.push({ g: wg, f: feathers, side: side });
  });

  /* --- flame crown on the scope (3 flickering flame quads) ------------------------------------ */
  var flameU = { uT: { value: 0 }, uI: { value: .5 } };
  var flameMat = new T.ShaderMaterial({
    uniforms: flameU, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:
      'varying vec2 vUv; uniform float uT,uI;\n' +
      'void main(){ float h=vUv.y; float t=uT*6.+vUv.x*0.; float wob=.14*sin(h*9.-t)+.07*sin(h*21.-t*1.8);\n' +
      ' float x=(vUv.x-.5+wob*h)*2.; float wdt=.95-.88*h+.02;\n' +
      ' float body=smoothstep(1.,0.,abs(x)/wdt)*(1.-h*.55); float core=smoothstep(1.,0.,abs(x)/(wdt*.5))*(1.-h)*.9;\n' +
      ' vec3 col=mix(vec3(1.,.2,.03),vec3(1.,.82,.35),core); gl_FragColor=vec4(col*body*uI,body*uI); }'
  });
  var crown = new T.Group(); crown.position.set(A.scope.x, A.scope.y, A.scope.z); group.add(crown);
  var flames = [];
  [[-.1, .05, .8], [0, .075, 1], [.09, .045, .75]].forEach(function (c) {
    var q = new T.Mesh(new T.PlaneGeometry(.04, .075), flameMat); q.position.set(0, c[1] - .03, c[0]); q.rotation.y = Math.PI / 2; q.scale.set(1, c[2], 1); crown.add(q);
    var q2 = new T.Mesh(q.geometry, flameMat); q2.position.copy(q.position); q2.scale.copy(q.scale); crown.add(q2); flames.push(q, q2);
  });

  /* --- ember vents on the handguard (both flanks) --------------------------------------------- */
  var ventMats = [];
  for (var v = 0; v < A.vents.n; v++) {
    var vm = new T.MeshBasicMaterial({ color: 0xff5a14, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 1 }); ventMats.push(vm);
    var vz = A.vents.z0 + (A.vents.z1 - A.vents.z0) * (v / (A.vents.n - 1));
    [-1, 1].forEach(function (side) { var b = new T.Mesh(new T.BoxGeometry(.0016, .02, .028), vm); b.position.set(side * A.vents.x, A.vents.y, vz); group.add(b); });
  }

  /* --- muzzle: ring, flare, 3 round shock rings ---------------------------------- */
  var mz = new T.Group(); mz.position.set(A.muzzle[0], A.muzzle[1], A.muzzle[2]); group.add(mz);
  var mzRing = new T.Mesh(new T.TorusGeometry(.017, .0013, 6, 32), basic(0xff7a1e, 0)); mz.add(mzRing);
  var flare = new T.Mesh(new T.PlaneGeometry(.4, .4), basic(0xffffff, 0, { map: flareTex(T) })); flare.position.z = -.02; mz.add(flare);
  var star = new T.Mesh(new T.PlaneGeometry(.5, .5), basic(0xffffff, 0, { map: starTex(T) })); star.position.z = -.03; mz.add(star);   // four-point lens streak
  var plumeMat = flameMat.clone(); plumeMat.uniforms.uI.value = 0;
  var plume = new T.Mesh(new T.PlaneGeometry(.05, .11), plumeMat); plume.position.set(0, .05, -.01); mz.add(plume);   // brief flame tongue licking up off the muzzle
  var plume2 = new T.Mesh(plume.geometry, plumeMat); plume2.rotation.y = Math.PI / 2; plume2.position.copy(plume.position); mz.add(plume2);
  var shock = [];
  for (var r = 0; r < 3; r++) { var rm = new T.Mesh(new T.RingGeometry(.022, .03, 40), basic(0xff8a2a, 0, { side: T.DoubleSide })); rm.visible = false; mz.add(rm); shock.push({ m: rm, t: 9 }); }
  var shockNext = 0;

  /* --- embers: updraft, one Points draw call --------------------------------------------------- */
  var NE = 60, seeds = new Float32Array(NE * 4), pos = new Float32Array(NE * 3), rs = 9001;
  function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
  for (var e = 0; e < NE; e++) { seeds[e * 4] = rnd(); seeds[e * 4 + 1] = rnd(); seeds[e * 4 + 2] = .5 + rnd() * 1.2; seeds[e * 4 + 3] = .4 + rnd() * .9; }
  var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(pos, 3)); eg.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  var emU = { uT: U.uT, uBoost: { value: 0 }, uScale: { value: 520 }, uZ0: { value: A.ember.z0 }, uZ1: { value: A.ember.z1 }, uC: { value: new T.Vector2(A.ember.cx, A.ember.cy) } };
  var emMat = new T.ShaderMaterial({
    uniforms: emU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader:
      'attribute vec4 aSeed; uniform float uT,uBoost,uScale,uZ0,uZ1; uniform vec2 uC; varying float vA; varying float vH;\n' +
      'void main(){ float life=fract(uT*.22*aSeed.z+aSeed.x); float zz=mix(uZ0,uZ1,fract(aSeed.y*7.));\n' +
      ' float sway=sin(uT*1.7*aSeed.z+aSeed.y*30.)*.02*(1.+life*2.);\n' +
      ' vec3 p=vec3(uC.x+(aSeed.x-.5)*.09+sway, uC.y+.03+life*(.2+uBoost*.14), zz+sin(uT*.9+aSeed.x*40.)*.03);\n' +
      ' vA=sin(3.14159*life)*(1.-life*.3); vH=life; vec4 mv=modelViewMatrix*vec4(p,1.);\n' +
      ' gl_PointSize=clamp(aSeed.w*(1.-life*.5)*.017*uScale*(1.+uBoost*.7)/max(.05,-mv.z),1.,60.); gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'varying float vA; varying float vH;\n' +
      'void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); float a=smoothstep(.5,0.,d); a*=a;\n' +
      ' vec3 col=mix(vec3(1.,.75,.25),vec3(.9,.12,.04),vH); col=mix(col,vec3(1.,.95,.7),smoothstep(.14,0.,d)); gl_FragColor=vec4(col,a*vA); }'
  });
  var embers = new T.Points(eg, emMat); embers.frustumCulled = false; group.add(embers);
  var magArmor = buildLegendaryMagazineArmor(T, 'phoenix-2', host,
    [[-.053,-.075],[-.075,-.095],[-.095,-.151],[-.132,-.193],[-.163,-.185],[-.145,-.137],[-.113,-.091],[-.073,-.063]],
    .024, .0045, .0010, phoenixArmor, phoenixInlay, -.112);

  /* ---------------- state machine ---------------- */
  var mats = {};
  function dress(g, on) {
    if (!on) return;
    group.updateWorldMatrix(true, false);
    g.traverse(function (mesh) {
      if (!mesh.isMesh || !mesh.userData.finishBase || mesh.userData.finishBadge) return;
      var base = mesh.userData.finishBase, c = base.color, b = (c.r + c.g + c.b) / 3;
      if (b < .004 || b > .75 || base.transparent) return;
      var m = mats[base.uuid];
      if (!m) {
        var metal = b > .05;
        m = new T.MeshPhongMaterial({
          color: metal ? 0x120808 : 0x090404, specular: metal ? 0x9a5a3a : 0x4a2a22, shininess: metal ? 110 : 45,
          map: base.map || null, bumpMap: base.bumpMap || null, bumpScale: base.bumpScale || 1, envMap: null,
          reflectivity: metal ? .13 : .05, combine: T.MixOperation
        });
        patchMaterial(m, U, metal ? 1 : .65); mats[base.uuid] = m;
      }
      mesh.material = m;
    });
  }
  function fire() {
    S.pulse = 0; S.boost = 1; S.flare = 1; S.heat = Math.min(1, S.heat + .22); S.chase = 0;
    var sh = shock[shockNext]; shockNext = (shockNext + 1) % 3; sh.t = 0; sh.m.visible = !S.low;
  }
  function awaken() { S.awake = 0; S.flash = 1; S.boost = Math.max(S.boost, .9); }
  function rearm() { S.rearmFx = 1; S.pulse = 0; S.boost = Math.max(S.boost, .8); S.flash = Math.max(S.flash, .7); }
  function setReload(rf, is) { if (!S.reloading && is) S.pendingReload = true; if (S.reloading && !is) { S.pendingRearm = true; rearm(); } S.reloading = !!is; S.rf = rf || 0; }
  function setDetail(level) {
    var low = level === 'low'; if (low === S.low) return; S.low = low; U.uLow.value = low ? 1 : 0; eg.setDrawRange(0, low ? 22 : NE);
    crown.visible = !low;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function update(dt, o) {
    if (!group.visible || (group.parent && !group.parent.visible)) return;
    if (dt > .1) dt = .1; S.t += dt; U.uT.value = S.t; flameU.uT.value = S.t;
    var dimT = S.reloading ? (S.rf < .72 ? .88 : .88 * (1 - clamp01((S.rf - .72) / .28))) : 0;
    S.dim += (dimT - S.dim) * Math.min(1, dt * 7); U.uDim.value = S.dim;
    if (S.pulse >= 0) { S.pulse += dt / .36; if (S.pulse > 1.15) S.pulse = -1; } U.uPulse.value = S.pulse;
    if (S.awake >= 0) { S.awake += dt / 1.2; if (S.awake > 1.15) S.awake = -1; } U.uAwake.value = S.awake;
    S.heat = Math.max(0, S.heat - dt * .3); U.uHeat.value = S.heat;
    S.boost = Math.max(0, S.boost - dt * 1.2); emU.uBoost.value = S.boost;
    S.flash = Math.max(0, S.flash - dt * 1); S.flare = Math.max(0, S.flare - dt * 7); S.rearmFx = Math.max(0, S.rearmFx - dt * 2.6);
    U.uInv.value.copy(group.matrixWorld).invert();
    emU.uScale.value = (global.innerHeight || 600) * .87 * (1 - ((o && o.ads) || 0) * .85);
    var live = 1 - S.dim * .85, fl = S.flash, ads = (o && o.ads) || 0, af = 1 - ads;
    // wings: open with fire/awaken/rearm, hold a relaxed fan at idle, fold while reloading
    var spreadT = (S.reloading ? .06 : .3) + S.boost * .55 + fl * .5 + S.rearmFx * .4; if (spreadT > 1) spreadT = 1;
    S.spread += (spreadT - S.spread) * Math.min(1, dt * 9);
    var flap = Math.sin(S.t * 2.2) * .04 * live;
    for (var w = 0; w < wings.length; w++) {
      var wg = wings[w], sd = wg.side;
      for (var i = 0; i < wg.f.length; i++) {
        var base = (i - 2) * .5 * S.spread * 1.15 + S.spread * .45 + flap * (i + 1) * .35;      // fan angle, radians-ish
        wg.f[i].rotation.x = -base - .1;                                                       // negative x-rotation tilts +z toward +y (up)
        wg.f[i].rotation.y = sd * (.3 + S.spread * .5 + (i - 2) * (.06 + S.spread * .09));        // swept-back wing that flares outward into a V (visible from the shooter's eye)
        wg.f[i].children[0].material.opacity = Math.min(1, (.55 + .3 * Math.sin(S.t * 2.5 + i)) * live + S.boost * .4 + fl * .4) * (1 - ads * .8);
      }
    }
    // flame crown
    flameU.uI.value = Math.min(1.4, (.35 + .15 * Math.sin(S.t * 9)) * live + S.boost * .9 + fl * .7 + S.heat * .4) * af * af; crown.visible = !S.low && af > .05;
    crown.rotation.y = 0;
    // vents
    for (var v = 0; v < ventMats.length; v++) {
      var vv = Math.min(1, (.3 + .3 * Math.sin(S.t * 2.6 + v * 1.4)) * live + S.heat * .6 + S.boost * .4 + fl * .4);
      ventMats[v].color.setRGB(1, .25 + .45 * vv, .05 + .2 * S.boost); ventMats[v].opacity = .2 + .8 * vv;
    }
    // muzzle
    mzRing.material.opacity = S.flare * .9 + S.heat * .3 * live; mzRing.visible = mzRing.material.opacity > .01;
    var fs = .24 + S.flare * .7; flare.scale.set(fs, fs, 1); flare.material.opacity = S.flare; flare.visible = S.flare > .01; flare.rotation.z += dt * 2;
    var ss = .3 + S.flare * .75; star.scale.set(ss, ss, 1); star.material.opacity = S.flare * S.flare * .95 * (1 - ads * .6); star.visible = S.flare > .02 && !S.low; star.rotation.z = S.t * .6;
    plumeMat.uniforms.uT.value = S.t; plumeMat.uniforms.uI.value = S.flare * 1.1 * (1 - ads * .7); plume.visible = plume2.visible = S.flare > .03 && !S.low;
    // wingtip flames: gutter at idle, roar when firing, die while reloading
    tipMat.opacity = Math.min(1, (.32 + .18 * Math.sin(S.t * 7.3)) * live + S.boost * .7 + fl * .5) * (1 - ads * .85);
    var tk = .03 + .018 * Math.sin(S.t * 9.1) + S.boost * .03 + fl * .02; for (var q = 0; q < tips.length; q++) tips[q].scale.set(tk, tk, 1);
    for (var z = 0; z < shock.length; z++) {
      var sh = shock[z]; if (!sh.m.visible) continue; sh.t += dt / .3;
      if (sh.t >= 1) { sh.m.visible = false; continue; }
      var sc = 1 + sh.t * 7; sh.m.scale.set(sc, sc, 1); var inv = 1 - sh.t; sh.m.material.opacity = inv * inv * .9;
    }
  }
  function takeReload() { var p = S.pendingReload; S.pendingReload = false; return p; }
  function takeRearm() { var p = S.pendingRearm; S.pendingRearm = false; return p; }
  return {
    kind: 'phoenix', group: group, update: update, fire: fire, awaken: awaken, rearm: rearm,
    setReload: setReload, setDetail: setDetail, dress: dress, takeRearm: takeRearm, takeReload: takeReload, state: S, uniforms: U,
    mount: function (root) { root.add(group); if (magArmor && root.userData && root.userData.mag && magArmor.parent !== root.userData.mag) root.userData.mag.add(magArmor); },
    setVisible: function (v) { group.visible = !!v; if (magArmor) magArmor.visible = !!v; },
    dispose: function () { group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  };
}

/* ------------------------------------------------------------------ world effects */
function createFx(T, scene) {
  var NB = 8, beams = [], UT = { value: 0 }, clock = 0;
  var bvs = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
  var bfs =
    'varying vec2 vUv; uniform float uHead,uAlpha,uLen,uT;\n' +
    'void main(){ float x=vUv.x, y=(vUv.y-.5)*2.; float L=uLen;\n' +
    ' float d=x-uHead; float tail=smoothstep(-.5,0.,d)*step(d,0.); float head=exp(-d*d*1300.);\n' +
    ' float fade=smoothstep(0.,.02,x)*uAlpha;\n' +
    ' float flick=.75+.25*sin(x*L*2.3-uT*40.);\n' +
    ' float core=exp(-y*y*24.)*flick; float body=exp(-y*y*4.5);\n' +
    ' float w=sin(x*L*1.5-uT*36.)*.5; float s1=exp(-pow((y-w)*8.,2.)), s2=exp(-pow((y+w)*8.,2.));\n' +
    ' vec3 gold=vec3(1.,.8,.35), red=vec3(1.,.15,.04), orange=vec3(1.,.5,.08), white=vec3(1.,.96,.82);\n' +
    ' vec3 col=white*core*(.45+tail*1.2+head*1.7)+orange*s1*(tail*.9+head)+red*s2*(tail*1.1+head)+red*body*.12*uAlpha*tail+gold*head*.4;\n' +
    ' float a=(core*(.45+tail+head)+s1*tail+s2*tail+body*.1*tail)*fade; gl_FragColor=vec4(col*fade,clamp(a,0.,1.)); }';
  var planeGeo = new T.PlaneGeometry(1, 1);
  for (var i = 0; i < NB; i++) {
    var U = { uHead: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 1 }, uT: UT };
    var mat = new T.ShaderMaterial({ uniforms: U, vertexShader: bvs, fragmentShader: bfs, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    var g = new T.Group(), p1 = new T.Mesh(planeGeo, mat), p2 = new T.Mesh(planeGeo, mat); p2.rotation.x = Math.PI / 2;
    g.add(p1, p2); g.visible = false; g.frustumCulled = false; p1.frustumCulled = p2.frustumCulled = false; scene.add(g);
    beams.push({ g: g, U: U, t: 9, ttl: .24, amp: 1 });
  }
  var nextBeam = 0, dir = new T.Vector3(), mid = new T.Vector3(), xAxis = new T.Vector3(1, 0, 0), qa = new T.Quaternion();
  var killEnd = new T.Vector3(), killView = new T.Vector3();
  var NS = 140, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sl = new Float32Array(NS), sm = new Float32Array(NS);
  var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('color', new T.BufferAttribute(sc, 3));
  var sMat = new T.PointsMaterial({ size: .09, vertexColors: true, map: discTex(T), sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  var sparks = new T.Points(sg, sMat); sparks.frustumCulled = false; scene.add(sparks); sparks.visible = false; var sparkDirty = false;
  for (var s = 0; s < NS; s++) sp[s * 3 + 1] = -999;
  var sNext = 0, NR = 5, rings = [], plumeEnd = new T.Vector3();
  for (var r = 0; r < NR; r++) {
    var rm = new T.Mesh(new T.RingGeometry(.1, .14, 40), new T.MeshBasicMaterial({ color: 0xff6a1e, opacity: 0, side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    rm.visible = false; scene.add(rm); rings.push({ m: rm, t: 9, flat: false });
  }
  var rNext = 0, fMat = new T.SpriteMaterial({ map: flareTex(T), color: 0xffd09a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
  var flash = new T.Sprite(fMat); flash.visible = false; scene.add(flash); var flashT = 9, low = false;
  function spawn(a, end, o) {
    o = o || {}; var b = beams[nextBeam]; nextBeam = (nextBeam + 1) % NB;
    dir.subVectors(end, a); var L = dir.length(); if (L < .05) return; dir.multiplyScalar(1 / L);
    mid.addVectors(a, end).multiplyScalar(.5); b.g.position.copy(mid); qa.setFromUnitVectors(xAxis, dir); b.g.quaternion.copy(qa);
    var w = o.amp ? .09 : .2; b.g.children[0].scale.set(L, w, 1); b.g.children[1].scale.set(L, w, 1);
    b.U.uLen.value = Math.min(L, 60); b.ttl = o.ttl || .24; b.t = 0; b.g.visible = true; b.amp = o.amp || 1;
    if (!o.amp && !low) {   // full tracers shed glowing embers along the whole path
      var tn = Math.min(10, 3 + (L / 8 | 0)), tk, ti, tu;
      sparkDirty = true; sparks.visible = true;
      for (tk = 0; tk < tn; tk++) {
        ti = sNext; sNext = (sNext + 1) % NS; tu = Math.random() * Math.min(L, 40);
        sp[ti * 3] = a.x + dir.x * tu; sp[ti * 3 + 1] = a.y + dir.y * tu; sp[ti * 3 + 2] = a.z + dir.z * tu;
        sv[ti * 3] = (Math.random() - .5) * .7; sv[ti * 3 + 1] = .3 + Math.random() * .9; sv[ti * 3 + 2] = (Math.random() - .5) * .7;
        sl[ti] = sm[ti] = .35 + Math.random() * .5;
      }
    }
  }
  function burst(p, from, big) { sparkDirty = true; sparks.visible = true;
    var n = low ? 8 : (big ? 20 : 12), k; dir.subVectors(from, p).normalize();
    for (k = 0; k < n; k++) {
      var i = sNext; sNext = (sNext + 1) % NS;
      sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
      var v = 1.2 + Math.random() * 4.5;
      sv[i * 3] = (dir.x * .7 + (Math.random() - .5) * 1.6) * v; sv[i * 3 + 1] = (dir.y * .7 + .4 + Math.random() * 1.2) * v; sv[i * 3 + 2] = (dir.z * .7 + (Math.random() - .5) * 1.6) * v;
      sl[i] = sm[i] = .45 + Math.random() * .7;
    }
    var ring = rings[rNext]; rNext = (rNext + 1) % NR; ring.t = 0; ring.flat = false; ring.m.visible = true; ring.m.position.copy(p).addScaledVector(dir, .02); ring.m.lookAt(from);
    flash.position.copy(p).addScaledVector(dir, .05); flashT = 0; flash.visible = true;
    if (!low) {   // small flame plume rising off the impact (reuses the beam pool; spawn() reuses `dir`, so it goes last)
      plumeEnd.set(p.x, p.y + (big ? .7 : .42), p.z); spawn(p, plumeEnd, { ttl: big ? .3 : .22, amp: big ? .9 : .6 });
    }
  }
  function eliminate(p, from) {
    killView.copy(from || killEnd.set(p.x, p.y + 1, p.z + 1));
    if (killView.distanceToSquared(p) < .01) killView.set(p.x, p.y + 1, p.z + 1);
    burst(p, killView, true);
    // Rebirth: a seven-feather fan of fire, a flat ash shockwave on the floor, and an ember column that rises and hangs.
    var fan = [[-.42,.10,0],[-.30,.24,.10],[-.16,.38,.04],[0,.50,0],[.16,.38,-.04],[.30,.24,-.10],[.42,.10,0]];
    for (var k = 0; k < fan.length; k++) {
      var d = fan[k]; killEnd.set(p.x + d[0], p.y + d[1], p.z + d[2]);
      spawn(p, killEnd, { ttl: .26 + (3 - Math.abs(k - 3)) * .03, amp: .8 });
    }
    var fr = rings[rNext]; rNext = (rNext + 1) % NR; fr.t = 0; fr.flat = true; fr.m.visible = true; fr.m.position.set(p.x, p.y + .03, p.z); fr.m.rotation.set(-Math.PI / 2, 0, 0);
    if (!low) {
      sparkDirty = true; sparks.visible = true;
      for (var e = 0; e < 18; e++) {
        var ei = sNext; sNext = (sNext + 1) % NS;
        sp[ei * 3] = p.x + (Math.random() - .5) * .5; sp[ei * 3 + 1] = p.y + Math.random() * .3; sp[ei * 3 + 2] = p.z + (Math.random() - .5) * .5;
        sv[ei * 3] = (Math.random() - .5) * .8; sv[ei * 3 + 1] = 1.6 + Math.random() * 2.4; sv[ei * 3 + 2] = (Math.random() - .5) * .8;
        sl[ei] = sm[ei] = .8 + Math.random() * .9;
      }
    }
  }
  function tick(dt) {
    clock += dt; UT.value = clock; var i;
    for (i = 0; i < NB; i++) { var b = beams[i]; if (!b.g.visible) continue; b.t += dt; var u = b.t / b.ttl; if (u >= 1) { b.g.visible = false; continue; } b.U.uHead.value = Math.min(1.4, u * 2.4 - .1); b.U.uAlpha.value = (1 - u * u) * Math.min(1, b.amp); }
    if (sparkDirty) { var anyLive = false; for (i = 0; i < NS; i++) {
      if (sl[i] <= 0) { sp[i * 3 + 1] = -999; continue; } anyLive = true;
      sl[i] -= dt; var f = Math.max(0, sl[i] / sm[i]);
      sv[i * 3 + 1] += (2.4 - sv[i * 3 + 1] * .8) * dt; sv[i * 3] *= .985; sv[i * 3 + 2] *= .985;   // embers buoy upward instead of falling
      sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      sc[i * 3] = f; sc[i * 3 + 1] = f * f * .55; sc[i * 3 + 2] = f * f * f * .12;
    }
    sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; if (!anyLive) { sparkDirty = false; sparks.visible = false; } }
    for (i = 0; i < NR; i++) { var r = rings[i]; if (!r.m.visible) continue; r.t += dt / .34; if (r.t >= 1) { r.m.visible = false; continue; } var k2 = 1 + r.t * (r.flat ? 11 : 6); r.m.scale.set(k2, k2, 1); r.m.material.opacity = (1 - r.t) * (1 - r.t) * .85; }
    if (flash.visible) { flashT += dt / .18; if (flashT >= 1) flash.visible = false; else { var fs = .6 + flashT * 1.0; flash.scale.set(fs, fs, 1); fMat.opacity = (1 - flashT) * .95; } }
  }
  return { spawn: spawn, burst: burst, eliminate: eliminate, signature: 'phoenix-ash-fan', tick: tick, setLow: function (v) { low = !!v; } };
}

/* ------------------------------------------------------------------ audio */
function prng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; }; }
function norm(d, peak) { var m = 0, i; for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > m) m = a; } if (m > 0) { var k = peak / m; for (i = 0; i < d.length; i++) d[i] *= k; } return d; }
var TAU = Math.PI * 2;
/* Shared cue mastering (also used by later packs via window.SightlineLegendaryAudio): RBJ biquads, then soft saturation + fades.
   Goals: nothing wasted below what a phone speaker can play, a clear 1-5 kHz "presence" band so every cue is easy to hear,
   lower crest factor (denser = louder at the same peak), and no start/end clicks. */
function biquad(d, sr, type, f0, Q, gDb) {
  var w = TAU * f0 / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Q), A = Math.pow(10, (gDb || 0) / 40), b0, b1, b2, a0, a1, a2;
  if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  var x1 = 0, x2 = 0, y1 = 0, y2 = 0, i, x, y;
  for (i = 0; i < d.length; i++) { x = d[i]; y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; d[i] = y; }
  return d;
}
function finishCue(d, sr, o) {   // o: { hp, lp, eq:[[hz,Q,dB],...], drive, peak, fadeIn, fadeOut }
  o = o || {}; var i, n = d.length, k;
  if (o.hp) { biquad(d, sr, 'hp', o.hp, .707); }
  if (o.lp) biquad(d, sr, 'lp', o.lp, .707);
  var eq = o.eq || []; for (k = 0; k < eq.length; k++) biquad(d, sr, 'peak', eq[k][0], eq[k][1], eq[k][2]);
  var m = 0; for (i = 0; i < n; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > m) m = a; }
  var dr = o.drive || 1, th = Math.tanh(dr), g = m > 0 ? 1 / m : 1;
  for (i = 0; i < n; i++) d[i] = Math.tanh(d[i] * g * dr) / th;
  var fi = Math.floor(sr * (o.fadeIn === undefined ? .0008 : o.fadeIn)), fo = Math.floor(sr * (o.fadeOut === undefined ? .012 : o.fadeOut));
  for (i = 0; i < fi && i < n; i++) d[i] *= i / fi;
  for (i = 0; i < fo && i < n; i++) d[n - 1 - i] *= i / fo;
  return norm(d, o.peak || .9);
}
/* Cues are pure functions of the sample rate, so build each once. warm() pre-builds the base-independent ones in idle time
   (one per 120 ms, only once the game's AudioContext exists) so the first hit / kill / reload in a firefight has no hitch. */
function memo(fn) { var c = {}; return function (sr) { return c[sr] || (c[sr] = fn(sr)); }; }
function memoBase(fn) {
  var c = {}; return function (sr, base) {
    var m = base ? (base.length + ':' + (base[(base.length / 3) | 0] || 0).toFixed(5) + ':' + (base[(base.length / 2) | 0] || 0).toFixed(5)) : '0';
    var k = sr + ':' + m; return c[k] || (c[k] = fn(sr, base));
  };
}
function warm(pack) {
  var sr = global.AC && global.AC.sampleRate; if (!sr || !pack || pack.__warm) return; pack.__warm = 1;
  var q = ['hitSound', 'killSound', 'rearmSound', 'reloadSound', 'equipSound'], i = 0;
  (function step() { if (i >= q.length) return; try { pack[q[i++]](sr); } catch (e) {} setTimeout(step, 120); })();
}
global.SightlineLegendaryAudio = Object.freeze({ biquad: biquad, finishCue: finishCue, verb: verb, memo: memo, memoBase: memoBase, warm: warm });
/* Shared helpers: cheap 4-tap "room" tail, and a vibrato phoenix-cry voice (fundamental + two harmonics). */
function verb(d, sr, mix) {
  var taps = [[.0297, .34], [.0371, .30], [.0411, .26], [.0437, .22]], k, i, dl, g;
  for (k = 0; k < taps.length; k++) { dl = Math.floor(taps[k][0] * sr); g = taps[k][1] * mix; for (i = dl; i < d.length; i++) d[i] += d[i - dl] * g; }
  return d;
}
function cry(ph, amp) { return (Math.sin(ph) + .38 * Math.sin(ph * 2) + .16 * Math.sin(ph * 3)) * amp; }
function equipSound(sr) {   // 1.5 s rebirth: ember rumble -> fire swell -> rising phoenix cry -> bright shimmer chime
  var n = Math.floor(sr * 1.5), d = new Float32Array(n), r = prng(53), lp = 0, ring = 0, cph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, sw = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.1)), 1.3) * (t < 1.1 ? 1 : Math.exp(-(t - 1.1) * 7));
    var nz = r(); lp += (nz - lp) * (.035 + .05 * Math.min(1, t / .9));   // fire roar brightens as it swells
    var v = lp * sw * 1.05 + Math.sin(TAU * (48 * t + 16 * t * t)) * sw * .38;
    if (Math.abs(r()) < .012 * sw) ring += (r() > 0 ? 1 : -1) * .6; ring *= .83; v += ring * .36;
    var c = t - .5;
    if (c > 0) {
      var u = Math.min(1, c / .62), f = 600 + 2000 * u * u; cph += TAU * f / sr;
      v += cry(cph + 4.2 * Math.sin(TAU * 8 * c), Math.sin(Math.PI * Math.min(1, c / .78)) * Math.exp(-Math.max(0, c - .55) * 3.4) * .26);
    }
    var cs = t - 1.0;   // chime: four pure partials struck in a quick rising arpeggio
    if (cs > 0) for (var k = 0; k < 4; k++) { var s2 = cs - k * .035; if (s2 > 0) v += Math.sin(TAU * [1568, 2093, 2637, 3136][k] * s2) * Math.exp(-s2 * 6.5) * .07; }
    d[i] = v;
  }
  verb(d, sr, .7);
  return finishCue(d, sr, { hp: 70, eq: [[1100, .8, 3], [2800, .9, 3.5]], drive: 1.5, peak: .85 });
}
function rearmSound(sr) {   // 0.6 s relight: whoomp at t=0, then a second bright flare + ping (so trimmed slices still carry punch)
  var n = Math.floor(sr * .6), d = new Float32Array(n), r = prng(59), lp = 0, ring = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); lp += (nz - lp) * (.04 + .5 * Math.min(1, t * 8));
    var v = lp * Math.exp(-t * 7) * 1.15 * Math.min(1, t * 90) + Math.sin(TAU * (74 * t - 62 * t * t)) * Math.exp(-t * 10) * .55;
    if (Math.abs(r()) < .022 * Math.exp(-t * 5)) ring += (r() > 0 ? 1 : -1) * .5; ring *= .82; v += ring * .45;
    var c = t - .06; if (c > 0) v += Math.sin(TAU * (520 * c + 2400 * c * c)) * Math.exp(-c * 8) * .2;   // rising ignition sweep
    var q = t - .11; if (q > 0) v += (Math.sin(TAU * 2093 * q) + .5 * Math.sin(TAU * 3136 * q)) * Math.exp(-q * 11) * .12 + nz * Math.exp(-q * 60) * .22;   // ping + spark
    d[i] = v;
  }
  verb(d, sr, .5);
  return finishCue(d, sr, { hp: 80, eq: [[1500, .8, 3], [3200, .9, 4]], drive: 1.7, peak: .85 });
}
function mixShot(sr, base) {   // game report underneath + crack, pitch-dropping thump, fire whoosh, a hawk-cry chirp and an ember crackle tail
  var n = Math.max(base ? base.length : 0, Math.floor(sr * .9)), d = new Float32Array(n), r = prng(61), lp = 0, ring = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, v = (base && i < base.length ? base[i] * .78 : 0), nz = r();
    v += nz * Math.exp(-t * 140) * .5;
    v += Math.sin(TAU * (112 * t - 70 * t * t)) * Math.exp(-t * 11) * .6;
    lp += (nz - lp) * (.03 + .26 * Math.exp(-t * 7)); v += lp * Math.min(1, t * 60) * Math.exp(-t * 6.5) * .75;
    var c = t - .012;
    if (c > 0 && c < .16) v += Math.sin(TAU * (2700 * c - 600 * c * c / .16) + 2.2 * Math.sin(TAU * 38 * c)) * Math.sin(Math.PI * c / .16) * .14;
    if (Math.abs(r()) < .012 * Math.exp(-t * 5)) ring += (r() > 0 ? 1 : -1) * .55; ring *= .84; v += ring * .4;
    d[i] = v;
  }
  verb(d, sr, .8);
  return finishCue(d, sr, { hp: 55, eq: [[2200, .9, 3.5], [5200, .9, 2.5]], drive: 1.5, peak: .92 });
}
function killSound(sr) {   // 0.6 s: fire-whump, a full rising phoenix cry, upward sparkle, ember crackle
  var n = Math.floor(sr * .6), d = new Float32Array(n), r = prng(67), lp = 0, ring = 0, cph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); lp += (nz - lp) * (.05 + .2 * Math.exp(-t * 9));
    var v = nz * Math.exp(-t * 90) * .5 + lp * Math.exp(-t * 7) * .7 + Math.sin(TAU * (96 * t - 55 * t * t)) * Math.exp(-t * 8) * 1.25 + Math.sin(TAU * (190 * t - 100 * t * t)) * Math.exp(-t * 10) * .6;
    var c = t - .04;
    if (c > 0) { var u = Math.min(1, c / .3), f = 900 + 1900 * u; cph += TAU * f / sr; v += cry(cph + 3 * Math.sin(TAU * 10 * c), Math.sin(Math.PI * Math.min(1, c / .22)) * Math.exp(-Math.max(0, c - .2) * 7) * .3); }
    var q = t - .2; if (q > 0) for (var k = 0; k < 3; k++) { var s2 = q - k * .04; if (s2 > 0) v += Math.sin(TAU * [2349, 2960, 3520][k] * s2) * Math.exp(-s2 * 9) * .08; }
    if (Math.abs(r()) < .016 * Math.exp(-t * 4)) ring += (r() > 0 ? 1 : -1) * .5; ring *= .83; v += ring * .4;
    d[i] = v;
  }
  verb(d, sr, .6);
  return finishCue(d, sr, { hp: 45, lp: 9000, eq: [[1400, .8, 1.5], [4000, .9, 1.5]], drive: 1.35, peak: .95 });
}

/* ------------------------------------------------------------------ picker card */
var styled = false;
function decorate(btn) {
  if (!styled && document.head) {
    var st = document.createElement('style');
    st.textContent = '@keyframes phxGlow{0%,100%{box-shadow:0 0 6px #ff5a1f55,inset 0 0 8px #7a0a0a22}50%{box-shadow:0 0 17px #ff7a2ecc,inset 0 0 14px #ff3a0a44}}@keyframes phxFlame{0%,100%{transform:rotate(-45deg) scale(1)}50%{transform:rotate(-40deg) scale(1.12,.94)}}' +
      '.phx-card{background:linear-gradient(135deg,#0d0505,#2b0b0b 55%,#3a1606)!important;border:1px solid #ff7a2e!important;animation:phxGlow 2.2s ease-in-out infinite;position:relative;overflow:hidden}' +
      '.phx-card .phx-fire{position:absolute;right:12px;top:12px;width:22px;height:22px;border-radius:50% 0 50% 50%;transform:rotate(-45deg);background:radial-gradient(circle at 60% 60%,#fff2b0 0 18%,#ffb02e 38%,#ff4a0a 68%,#9a0a00 100%);box-shadow:0 0 12px #ff6a1e;animation:phxFlame .7s ease-in-out infinite}' +
      '@keyframes phxSheen{0%{transform:translateX(-120%) skewX(-20deg)}55%,100%{transform:translateX(320%) skewX(-20deg)}}@keyframes phxRise{0%{transform:translateY(0);opacity:0}15%{opacity:.9}100%{transform:translateY(-34px);opacity:0}}' +
      '.phx-card::after{content:"";position:absolute;top:0;left:0;width:30%;height:100%;background:linear-gradient(90deg,transparent,#ffb06a40,transparent);animation:phxSheen 3.4s ease-in-out infinite;pointer-events:none}' +
      '.phx-card .phx-ember{position:absolute;bottom:6px;width:3px;height:3px;border-radius:50%;background:#ffb347;box-shadow:0 0 6px #ff7a1e;animation:phxRise 2.4s ease-in infinite;pointer-events:none}' +
      '.phx-tag{display:inline-block;margin-top:5px;padding:1px 6px;font:700 9px system-ui;letter-spacing:1.5px;color:#240800;background:linear-gradient(90deg,#ffd27a,#ff6a1e);border-radius:3px}';
    document.head.appendChild(st); styled = true;
  }
  btn.classList.add('phx-card'); btn.style.color = '#fff0e4';
  for (var em = 0; em < 5; em++) { var ember = document.createElement('span'); ember.className = 'phx-ember'; ember.style.left = (12 + em * 17) + '%'; ember.style.animationDelay = (em * .47) + 's'; btn.appendChild(ember); }
  var fire = document.createElement('span'); fire.className = 'phx-fire'; btn.appendChild(fire);
  var tag = document.createElement('span'); tag.className = 'phx-tag'; tag.textContent = 'LEGENDARY'; btn.appendChild(document.createElement('br')); btn.appendChild(tag);
}

function lpf(d, a) { var y = 0; for (var i = 0; i < d.length; i++) { y += (d[i] - y) * a; d[i] = y; } return d; }
function reloadSound(sr) {   // flames banking down: clack, falling whoosh with real mid content, cooling ember ticks
  var n = Math.floor(sr * .95), w = new Float32Array(n), r = prng(51), lp = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); lp += (nz - lp) * (.5 * Math.exp(-t * 4) + .06);
    var v = lp * Math.exp(-2.4 * t) * Math.min(1, t * 90) * .9 + Math.sin(TAU * (240 - 150 * Math.min(1, t * 3)) * t) * Math.exp(-t * 11) * .35;
    v += Math.sin(TAU * 420 * t) * Math.exp(-t * 60) * .35 + nz * Math.exp(-t * 220) * .5;   // clack
    if (Math.abs(r()) > .996) v += r() * Math.exp(-t * 2.2) * .7;
    w[i] = v;
  }
  return finishCue(w, sr, { hp: 90, lp: 8500, eq: [[900, .8, 3], [2400, .9, 1.5]], drive: 1.8, peak: .85 });
}
function hitSound(sr) {   // 0.3 s: bright fire "crack-pop" with sizzle and a high ember ping (energy lives at 0.3-5 kHz, so phone speakers can play it)
  var n = Math.floor(sr * .3), w = new Float32Array(n), r = prng(53), lp = 0, ph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); lp += (nz - lp) * .2;
    var f = 180 + 520 * Math.exp(-t * 26); ph += TAU * f / sr;
    var v = (nz - lp) * Math.exp(-t * 120) * .75 + lp * Math.exp(-t * 22) * .45 + Math.sin(ph) * Math.exp(-t * 16) * .6;   // crack + whump + pop
    v += Math.sin(TAU * 1760 * t) * Math.exp(-t * 26) * .24 + Math.sin(TAU * 2637 * t) * Math.exp(-t * 34) * .12;        // ember ping
    if (Math.abs(r()) > .99) v += r() * Math.exp(-t * 11) * .35;                                                          // sizzle
    w[i] = v;
  }
  verb(w, sr, .35);
  return finishCue(w, sr, { hp: 140, eq: [[1500, .8, 4], [3500, .9, 3]], drive: 2.2, peak: .9 });
}

global.SightlinePhoenix = {
  version: 'G3.0-phoenix', weapon: 'rampart', finish: FINISH, anchors: ANCHOR, hasEliminationFx: true,
  buildRig: buildRig, createFx: createFx, decorate: decorate,
  equipSound: memo(equipSound), rearmSound: memo(rearmSound), reloadSound: memo(reloadSound), hitSound: memo(hitSound), mixShot: memoBase(mixShot), killSound: memo(killSound)
};
})(window);

/* ---- legendary-tempest.js ---- */
/* Sightline legendary finish: TEMPEST NEEDLE  (Needle PDW)
   Original design. Cosmetic only: no damage, ammo, recoil, hit or network behaviour is touched.

   What it adds
     - Thunderhead-graphite body with living lightning: slow static veins inside storm cloud, plus
       white-hot strikes that hit random spots along the gun (one shader patched into the gun's own
       Phong materials, so the whole chassis shares one pattern in gun-local space).
     - Storm-eye lightning emblem on both flanks, three tesla coil rings on the barrel, a jittering
       plasma crown and starburst at the muzzle, orbiting ion motes (one Points draw call).
     - Shot: veins surge stock->muzzle, coils chase, jagged chain-lightning tracer, spark and ring on impact.
     - Equip "storm call", reload capacitor discharge, rearm zap. All audio synthesised, no asset files.
   Contract used by index.html:
     SightlineTempest.finish, buildRig(THREE) -> rig, createFx(THREE, scene) -> fx,
     equipSound/rearmSound/reloadSound/hitSound/mixShot(sampleRate,...) -> Float32Array, decorate(button, finish, selected)
   Everything is allocated once; update() and fx.tick() allocate nothing. */
(function (global) {
'use strict';

var FINISH = {
  name: 'Tempest Needle', legendary: true, legendKind: 'tempest',
  metal: 0x141a28, polymer: 0x090c14, trim: 0x7fd8ff,
  desc: 'LEGENDARY · thunderhead graphite, living lightning, tesla coils, chain-arc tracers'
};

/* ------------------------------------------------------------------ shaders */
var GLSL_COMMON =
  'uniform float uT,uPulse,uHeat,uAwake,uDim,uGain,uLow;\n' +
  'varying vec3 vEcl;\n';
var GLSL_FRAG_FUNCS =
  'float eH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\n' +
  'uniform sampler2D uNoise;\n' +
  'float eN(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f); vec2 o=i.z*vec2(37.,17.);\n' +
  ' return mix(texture2D(uNoise,(i.xy+o+f.xy+.5)/256.).x,texture2D(uNoise,(i.xy+o+vec2(37.,17.)+f.xy+.5)/256.).x,f.z);}\n';

var SURF_OLD = '{\n float t=vEcl.y;\n vec3 q=vEcl*vec3(46.,46.,16.); vec3 f=abs(fract(q)-.5); float ln=smoothstep(.46,.5,max(f.y,f.z)); diffuseColor.rgb*=1.-ln*.5;\n diffuseColor.rgb=mix(diffuseColor.rgb*.64,diffuseColor.rgb*1.2,smoothstep(-.012,.014,t));\n float inl=smoothstep(.0025,.0,abs(t-.0105))+smoothstep(.0022,.0,abs(t+.0085));\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.4,.65,1.)*.9,clamp(inl,0.,1.)*.9);\n float sc=step(.96,fract(sin(floor(vEcl.z*70.)*12.9+floor(vEcl.y*70.)*78.2)*437.5)); diffuseColor.rgb*=1.-sc*.3;\n}\n';
var GLSL_EMISSIVE =
  '{\n' +
  ' vec3 w0=vEcl+.01*vec3(sin(vEcl.z*53.+uT*1.3),cos(vEcl.z*41.),sin(vEcl.x*67.));\n vec3 q=w0*vec3(48.,48.,16.);\n' +
  ' float cloud=eN(q*.25+vec3(0.,0.,-uT*.4))*.6+eN(q*.5+vec3(5.,uT*.3,0.))*.4;\n' +
  ' float v=pow(1.-abs(eN(q+vec3(0.,0.,-uT*.5))*2.-1.),15.)*smoothstep(.22,.55,cloud);\n' +
  ' float tq=floor(uT*9.); float zc=.4-fract(sin(tq*12.9898)*43758.5)*.8; float on=step(.4,fract(sin(tq*78.233)*43758.5453));\n' +
  ' float qd=pow(1.-abs(eN(q*1.3+vec3(tq*5.1,tq*2.3,0.))*2.-1.),30.);\n' +
  ' float strike=on*exp(-pow((vEcl.z-zc)*6.,2.))*qd; if(uLow>.5)strike*=.8;\n' +
  ' float breath=.6+.4*sin(uT*2.1+vEcl.z*8.);\n' +
  ' float waveP=exp(-pow((vEcl.z-(.3-uPulse*1.1))*9.,2.))*step(0.,uPulse);\n' +
  ' float waveA=exp(-pow((vEcl.z-(.3-uAwake*1.2))*6.,2.))*step(0.,uAwake);\n' +
  ' float live=1.-uDim;\n' +
  ' float flow=(v*1.5*breath+strike*2.4)*live+(waveP+waveA)*(.3+v*1.5+qd*1.3)+uHeat*(.15+v*.9)*.5;\n' +
  ' vec3 cool=vec3(.22,.58,1.), hot=vec3(.88,.96,1.);\n' +
  ' vec3 col=mix(cool,hot,clamp(strike*.9+waveP*.7+waveA*.6+uHeat*.3+v*v*.4,0.,1.));\n' +
  ' float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);\n' +
  ' vec3 rim=mix(vec3(.2,.5,1.),vec3(.65,.4,1.),.5+.5*sin(uT*.9+vEcl.z*4.))*fres*(.4+uHeat*.5);\n' +
  ' totalEmissiveRadiance+=(col*flow*1.7+vec3(.06,.16,.4)*cloud*cloud*live*.7+rim)*uGain;\n' +
  '}\n';

function patchMaterial(mat, U, gain) {
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uT = U.uT; sh.uniforms.uPulse = U.uPulse; sh.uniforms.uHeat = U.uHeat;
    sh.uniforms.uAwake = U.uAwake; sh.uniforms.uDim = U.uDim; sh.uniforms.uLow = U.uLow;
    sh.uniforms.uInv = U.uInv; sh.uniforms.uNoise = U.uNoise; sh.uniforms.uGain = { value: gain };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uInv;\nvarying vec3 vEcl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEcl=(uInv*modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_FRAG_FUNCS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURF_OLD)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_EMISSIVE);
  };
  mat.customProgramCacheKey = function () { return 'tempest-needle-v3'; };
  mat.needsUpdate = true;
  return mat;
}

/* ------------------------------------------------------------------ textures */

function noiseTexture(T) {   // one shared 256x256 random texture: replaces the per-pixel sin-hash value noise
  var g = global; if (g.__slNoise && g.__slNoise.T === T) return g.__slNoise.tex;
  var n = 256, d = new Uint8Array(n * n * 4), s = 987654321, i;
  for (i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  var tx = new T.DataTexture(d, n, n, T.RGBAFormat); tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.magFilter = tx.minFilter = T.LinearFilter; tx.generateMipmaps = false; tx.needsUpdate = true;
  g.__slNoise = { T: T, tex: tx }; return tx;
}
var texCache = {};
function canvasTex(T, key, size, draw) {
  if (texCache[key]) return texCache[key];
  var c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  var t = new T.CanvasTexture(c); return (texCache[key] = t);
}
function flareTex(T) {   // blue-white starburst with jagged rays
  return canvasTex(T, 'tflare', 128, function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(240,250,255,1)'); gr.addColorStop(.12, 'rgba(150,210,255,.95)');
    gr.addColorStop(.35, 'rgba(60,130,255,.35)'); gr.addColorStop(1, 'rgba(40,90,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(210,240,255,.9)'; g.lineWidth = 2; g.lineCap = 'round';
    var sd = 5;
    for (var i = 0; i < 7; i++) {
      var a = i * 6.2832 / 7 + .3, x = h, y = h; g.beginPath(); g.moveTo(x, y);
      for (var k = 1; k <= 5; k++) { sd = (sd * 16807) % 2147483647; var j = (sd / 2147483647 - .5) * .5; var r = k * h / 5.2; g.lineTo(h + Math.cos(a + j) * r, h + Math.sin(a + j) * r); }
      g.stroke();
    }
  });
}
function discTex(T) {
  return canvasTex(T, 'tdisc', 128, function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
}
/* jagged lightning arc, drawn once */
function arcTex(T) {
  return canvasTex(T, 'tarc', 256, function (g, s) {
    g.clearRect(0, 0, s, s); var sd = 11, pts = [], i, y0 = s / 2;
    for (i = 0; i <= 10; i++) { sd = (sd * 16807) % 2147483647; pts.push([i * s / 10, y0 + (i === 0 || i === 10 ? 0 : (sd / 2147483647 - .5) * s * .38)]); }
    [[10, 'rgba(60,140,255,.25)'], [5, 'rgba(120,190,255,.55)'], [2, 'rgba(235,248,255,1)']].forEach(function (st) {
      g.lineWidth = st[0]; g.strokeStyle = st[1]; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (var k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.stroke();
    });
    g.lineWidth = 2; g.strokeStyle = 'rgba(180,225,255,.8)'; g.beginPath(); g.moveTo(pts[4][0], pts[4][1]); g.lineTo(pts[5][0] + 14, pts[5][1] - s * .2); g.lineTo(pts[6][0] + 10, pts[6][1] - s * .3); g.stroke();
  });
}
function starTex(T) {   // blue-white four-point lens streak
  return canvasTex(T, 'tstar', 128, function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h * .5);
    gr.addColorStop(0, 'rgba(245,252,255,1)'); gr.addColorStop(.35, 'rgba(110,190,255,.55)'); gr.addColorStop(1, 'rgba(40,90,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    var hz = g.createLinearGradient(0, 0, s, 0); hz.addColorStop(0, 'rgba(90,160,255,0)'); hz.addColorStop(.5, 'rgba(235,248,255,.95)'); hz.addColorStop(1, 'rgba(90,160,255,0)');
    g.fillStyle = hz; g.fillRect(0, h - 1.5, s, 3);
    var vt = g.createLinearGradient(0, 0, 0, s); vt.addColorStop(0, 'rgba(90,160,255,0)'); vt.addColorStop(.5, 'rgba(235,248,255,.8)'); vt.addColorStop(1, 'rgba(90,160,255,0)');
    g.fillStyle = vt; g.fillRect(h - 1, 0, 2, s);
  });
}
/* storm-eye emblem: ring + lightning bolt */
function emblemTex(T) {
  return canvasTex(T, 'temblem', 256, function (g, s) {
    var h = s / 2; g.clearRect(0, 0, s, s);
    var glow = g.createRadialGradient(h, h, s * .12, h, h, h);
    glow.addColorStop(0, 'rgba(120,200,255,.85)'); glow.addColorStop(.4, 'rgba(60,120,255,.4)'); glow.addColorStop(1, 'rgba(40,80,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(200,235,255,.95)'; g.lineWidth = 5; g.beginPath(); g.arc(h, h, s * .34, 0, 6.2832); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(h, h, s * .4, 0, 6.2832); g.stroke();
    g.fillStyle = '#04070f'; g.beginPath(); g.arc(h, h, s * .31, 0, 6.2832); g.fill();
    g.fillStyle = 'rgba(235,248,255,1)'; g.beginPath();
    g.moveTo(h + s * .06, h - s * .25); g.lineTo(h - s * .1, h + s * .03); g.lineTo(h - s * .01, h + s * .03);
    g.lineTo(h - s * .07, h + s * .25); g.lineTo(h + s * .11, h - s * .05); g.lineTo(h + s * .02, h - s * .05); g.closePath(); g.fill();
  });
}

/* ------------------------------------------------------------------ the rig */
var ANCHOR = {
  muzzle: [0.0, 0.0165, -0.325],
  flank: { x: 0.0246, y: -0.018, z: 0.10 },
  coil: { y: 0.0165, z0: -0.225, z1: -0.285, n: 3, r: 0.0235 },
  mote: { cx: 0.0, cy: 0.0, z0: 0.40, z1: -0.30 }
};

function buildRig(T, host) {
  var A = ANCHOR, group = new T.Group(); group.name = 'tempest-needle-rig';
  LA.warm(global.SightlineTempest);
  var U = {
    uT: { value: 0 }, uPulse: { value: -1 }, uHeat: { value: 0 }, uAwake: { value: -1 }, uDim: { value: 0 },
    uLow: { value: 0 }, uNoise: { value: noiseTexture(T) }, uInv: { value: new T.Matrix4() }
  };
  var S = { t: 0, pulse: -1, heat: 0, awake: -1, dim: 0, boost: 0, flare: 0, flash: 0, rf: 0, reloading: false, low: false, pendingRearm: false, pendingReload: false, rearmFx: 0, coilT: 9, zap: 0 };
  var add = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
  function basic(color, opacity, extra) { var o = { color: color, opacity: opacity }; for (var k in add) o[k] = add[k]; for (var e in (extra || {})) o[e] = extra[e]; return new T.MeshBasicMaterial(o); }

  /* --- segmented bullpup receiver and hard-mounted ion capacitors ---------------------------- */
  var tempestArmor = new T.MeshPhongMaterial({ color: 0x101629, specular: 0x8cbcff, shininess: 118, emissive: 0x060c20, emissiveIntensity: .12, side: T.DoubleSide });
  var tempestInlay = new T.MeshPhongMaterial({ color: 0x435382, specular: 0xbdd5ff, shininess: 142, emissive: 0x101d42, emissiveIntensity: .10, side: T.DoubleSide });
  var ionBezelMat = new T.MeshPhongMaterial({ color: 0x11152a, specular: 0x91a9ff, shininess: 150, side: T.DoubleSide });
  var ionCellMat = new T.MeshPhongMaterial({ color: 0x8ebdff, specular: 0xffffff, emissive: 0x2558d8, emissiveIntensity: .42, shininess: 180 });
  global.SightlineLegendaryGeometry.addBilateralArmorPlate(T, group, 'tempest-2-segmented-bullpup-shell', .0265, .0075, .0013,
    [[-.176,.006],[-.151,.038],[-.115,.026],[-.078,.044],[-.027,.027],[.035,.013],[.018,-.010],[-.041,-.034],[-.127,-.036],[-.169,-.018]], tempestArmor);
  global.SightlineLegendaryGeometry.addBilateralArmorPlate(T, group, 'tempest-2-machined-insulator-channel', .0305, .0018, .0004,
    [[-.144,.002],[-.122,.024],[-.090,.016],[-.058,.030],[-.020,.019],[.016,.009],[.003,-.006],[-.051,-.022],[-.116,-.025],[-.148,-.014]], tempestInlay);
  var ionCells = [];
  [-1, 1].forEach(function (side) {
    var bezel = new T.Mesh(new T.CylinderGeometry(.011,.011,.008,8,1), ionBezelMat);
    bezel.name = 'tempest-2-capacitor-hex-bezel-' + (side < 0 ? 'left' : 'right'); bezel.rotation.z = side * Math.PI / 2;
    bezel.position.set(side * .0345, .007, -.071); group.add(bezel);
    var cell = new T.Mesh(new T.OctahedronGeometry(.008,0), ionCellMat);
    cell.name = 'tempest-2-reactive-ion-cell-' + (side < 0 ? 'left' : 'right');
    cell.position.set(side * .040, .007, -.071); group.add(cell); ionCells.push({ mesh: cell, side: side });
  });

  /* --- storm emblem on both flanks ------------------------------------------------------ */
  var emblems = [];
  [-1, 1].forEach(function (side) {
    var m = new T.Mesh(new T.PlaneGeometry(.06, .06), basic(0xffffff, .95, { map: emblemTex(T), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(side * A.flank.x, A.flank.y, A.flank.z); m.rotation.y = side * Math.PI / 2; group.add(m); emblems.push(m);
  });

  /* --- tesla coil rings on the barrel ----------------------------------------------------- */
  var coils = [], coilMat = [], coilGlow = [];
  for (var c = 0; c < A.coil.n; c++) {
    var cm = basic(0x7fd0ff, .8); coilMat.push(cm);
    var ring = new T.Mesh(new T.TorusGeometry(A.coil.r, .0013, 6, 32), cm);
    ring.position.set(0, A.coil.y, A.coil.z0 + (A.coil.z1 - A.coil.z0) * (c / (A.coil.n - 1))); group.add(ring); coils.push(ring);
    var cg = new T.Sprite(new T.SpriteMaterial({ map: flareTex(T), color: 0x9fd8ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
    cg.position.set(0, A.coil.y + A.coil.r, ring.position.z); cg.scale.set(.05, .05, 1); group.add(cg); coilGlow.push(cg);
  }

  /* --- muzzle: halo ring, starburst, plasma crown (3 flickering arcs), 2 shock rings -------- */
  var mz = new T.Group(); mz.position.set(A.muzzle[0], A.muzzle[1], A.muzzle[2]); group.add(mz);
  var mzRing = new T.Mesh(new T.TorusGeometry(.0175, .0012, 6, 32), basic(0x9fdcff, 0)); mz.add(mzRing);
  var flare = new T.Mesh(new T.PlaneGeometry(.42, .42), basic(0xffffff, 0, { map: flareTex(T) })); flare.position.z = -.02; mz.add(flare);
  var crown = [], arcT = arcTex(T);
  for (var a = 0; a < 5; a++) {
    var am = new T.Mesh(new T.PlaneGeometry(.075, .075), basic(0xffffff, 0, { map: arcT, side: T.DoubleSide })); am.position.z = -.012; am.visible = false; mz.add(am); crown.push(am);
  }
  var star = new T.Mesh(new T.PlaneGeometry(.55, .55), basic(0xffffff, 0, { map: starTex(T) })); star.position.z = -.03; mz.add(star);
  /* idle static: short arcs crawl over the receiver from time to time, like a charged capacitor leaking */
  var statics = [], arcMap = arcTex(T);
  for (var sa = 0; sa < 2; sa++) { var sq = new T.Mesh(new T.PlaneGeometry(.06, .06), basic(0xcfeaff, 0, { map: arcMap, side: T.DoubleSide })); sq.visible = false; group.add(sq); statics.push({ m: sq, life: 0, wait: .3 + sa * .45 }); }
  var shock = [];
  for (var r = 0; r < 2; r++) { var sm = new T.Mesh(new T.RingGeometry(.02, .026, 32), basic(0x9fdcff, 0, { side: T.DoubleSide })); sm.visible = false; mz.add(sm); shock.push({ m: sm, t: 9 }); }
  var shockNext = 0, jit = 1;

  /* --- ion motes: one Points draw call, positions computed in the vertex shader ----------- */
  var NE = 48, seeds = new Float32Array(NE * 4), pos = new Float32Array(NE * 3), rs = 4242;
  function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
  for (var e = 0; e < NE; e++) { seeds[e * 4] = rnd(); seeds[e * 4 + 1] = rnd(); seeds[e * 4 + 2] = .6 + rnd() * 1.3; seeds[e * 4 + 3] = .4 + rnd() * .8; }
  var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(pos, 3)); eg.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  var emU = { uT: U.uT, uBoost: { value: 0 }, uScale: { value: 520 }, uZ0: { value: A.mote.z0 }, uZ1: { value: A.mote.z1 }, uC: { value: new T.Vector2(A.mote.cx, A.mote.cy) } };
  var emMat = new T.ShaderMaterial({
    uniforms: emU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader:
      'attribute vec4 aSeed; uniform float uT,uBoost,uScale,uZ0,uZ1; uniform vec2 uC; varying float vA; varying float vH;\n' +
      'void main(){ float u=fract(uT*.05*aSeed.z+aSeed.x); float ang=uT*aSeed.z*(1.4+uBoost*2.2)+aSeed.y*6.2832;\n' +
      ' float rad=(.05+.045*aSeed.x+.012*sin(uT*9.*aSeed.z+aSeed.y*30.))*(1.+uBoost*.6);\n' +
      ' vec3 p=vec3(uC.x+cos(ang)*rad, uC.y+sin(ang)*rad*.8, mix(uZ0,uZ1,u));\n' +
      ' vA=sin(3.14159*u)*(.55+.45*sin(uT*(24.*aSeed.z)+aSeed.x*50.)); vH=aSeed.x; vec4 mv=modelViewMatrix*vec4(p,1.);\n' +
      ' gl_PointSize=clamp(aSeed.w*.014*uScale*(1.+uBoost*.8)/max(.05,-mv.z),1.,60.); gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'varying float vA; varying float vH;\n' +
      'void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); float a=smoothstep(.5,0.,d); a*=a;\n' +
      ' vec3 col=mix(vec3(.3,.65,1.),vec3(.7,.45,1.),step(.82,vH)); col=mix(col,vec3(.95,.98,1.),smoothstep(.2,0.,d));\n' +
      ' gl_FragColor=vec4(col,a*vA); }'
  });
  var motes = new T.Points(eg, emMat); motes.frustumCulled = false; group.add(motes);
  var magArmor = global.SightlineLegendaryGeometry.buildLegendaryMagazineArmor(T, 'tempest-2', host,
    [[-.221,-.051],[-.247,-.073],[-.258,-.132],[-.303,-.184],[-.284,-.194],[-.227,-.145],[-.218,-.084]],
    .023, .0042, .0009, tempestArmor, tempestInlay, -.266);

  /* ---------------- state machine ---------------- */
  var mats = {};
  function dress(g, on) {
    if (!on) return;
    group.updateWorldMatrix(true, false);
    g.traverse(function (mesh) {
      if (!mesh.isMesh || !mesh.userData.finishBase || mesh.userData.finishBadge) return;
      var base = mesh.userData.finishBase, c = base.color, b = (c.r + c.g + c.b) / 3;
      if (b < .004 || b > .75 || base.transparent) return;
      var key = base.uuid, m = mats[key];
      if (!m) {
        var metal = b > .05;
        m = new T.MeshPhongMaterial({
          color: metal ? 0x0d1220 : 0x060810, specular: metal ? 0x6a8cff : 0x2a3558, shininess: metal ? 110 : 40,
          map: base.map || null, bumpMap: base.bumpMap || null, bumpScale: base.bumpScale || 1, envMap: null,
          reflectivity: metal ? .15 : .06, combine: T.MixOperation
        });
        patchMaterial(m, U, metal ? 1 : .6); mats[key] = m;
      }
      mesh.material = m;
    });
  }
  function fire() {
    S.pulse = 0; S.boost = 1; S.flare = 1; S.heat = Math.min(1, S.heat + .12); S.coilT = 0; S.zap = 1;
    var sh = shock[shockNext]; shockNext = (shockNext + 1) % 2; sh.t = 0; sh.m.visible = !S.low;
  }
  function awaken() { S.awake = 0; S.flash = 1; S.boost = Math.max(S.boost, .9); S.zap = 1; }
  function rearm() { S.rearmFx = 1; S.pulse = 0; S.boost = Math.max(S.boost, .7); S.flash = Math.max(S.flash, .6); S.zap = 1; }
  function setReload(rf, is) {
    if (!S.reloading && is) S.pendingReload = true;
    if (S.reloading && !is) { S.pendingRearm = true; rearm(); }
    S.reloading = !!is; S.rf = rf || 0;
  }
  function setDetail(level) {
    var low = level === 'low'; if (low === S.low) return; S.low = low; U.uLow.value = low ? 1 : 0;
    eg.setDrawRange(0, low ? 18 : NE); crown[1].visible = crown[2].visible = crown[3].visible = crown[4].visible = false;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function update(dt, o) {
    if (!group.visible || (group.parent && !group.parent.visible)) return;
    if (dt > .1) dt = .1; S.t += dt; U.uT.value = S.t;
    var ads = (o && o.ads) || 0, af = 1 - ads;
    var dimT = S.reloading ? (S.rf < .72 ? .86 : .86 * (1 - clamp01((S.rf - .72) / .28))) : 0;
    S.dim += (dimT - S.dim) * Math.min(1, dt * 7); U.uDim.value = S.dim;
    if (S.pulse >= 0) { S.pulse += dt / .3; if (S.pulse > 1.15) S.pulse = -1; } U.uPulse.value = S.pulse;
    if (S.awake >= 0) { S.awake += dt / 1.1; if (S.awake > 1.15) S.awake = -1; } U.uAwake.value = S.awake;
    S.heat = Math.max(0, S.heat - dt * .4); U.uHeat.value = S.heat;
    S.boost = Math.max(0, S.boost - dt * 1.8); emU.uBoost.value = S.boost;
    S.flash = Math.max(0, S.flash - dt * 1.2); S.flare = Math.max(0, S.flare - dt * 9); S.rearmFx = Math.max(0, S.rearmFx - dt * 3); S.zap = Math.max(0, S.zap - dt * 6);
    U.uInv.value.copy(group.matrixWorld).invert();
    emU.uScale.value = (global.innerHeight || 600) * .87 * (1 - ads * .85);
    var live = 1 - S.dim * .8, fl = S.flash;
    // coils: chase toward the muzzle after each shot, otherwise hum
    S.coilT += dt;
    for (var k = 0; k < coils.length; k++) {
      var chase = Math.exp(-Math.pow(S.coilT * 22 - k, 2) * .9) * (S.coilT < .3 ? 1 : 0);
      var hum = (.3 + .25 * Math.sin(S.t * 14 + k * 2.1)) * live, v = Math.min(1, hum + chase + S.heat * .4 + fl * .5);
      coilMat[k].color.setRGB(.35 + .6 * chase, .72 + .25 * chase, 1); coilMat[k].opacity = .25 + .75 * v;
      var cs = 1 + chase * .18; coils[k].scale.set(cs, cs, 1);
      coilGlow[k].material.opacity = Math.min(1, chase * .95 + S.heat * .25 + (.1 + .08 * Math.sin(S.t * 17 + k)) * live) * (1 - ads * .8);
      var gs = .035 + chase * .06 + S.heat * .02; coilGlow[k].scale.set(gs, gs, 1);
    }
    for (var st = 0; st < statics.length; st++) {
      var sc0 = statics[st];
      if (sc0.life > 0) { sc0.life -= dt; sc0.m.material.opacity = Math.min(1, sc0.life * 22) * live * (1 - ads * .85); if (sc0.life <= 0) sc0.m.visible = false; }
      else { sc0.wait -= dt * (1 + S.heat * 3); if (sc0.wait <= 0 && !S.low) {
        sc0.wait = .5 + Math.random() * .9; sc0.life = .07 + Math.random() * .05; var sd0 = Math.random() < .5 ? -1 : 1;
        sc0.m.position.set(sd0 * (.036 + Math.random() * .004), -.02 + Math.random() * .06, -.22 + Math.random() * .34); sc0.m.rotation.set(0, sd0 * Math.PI / 2, Math.random() * 6.28);
        var ss0 = .6 + Math.random() * .8; sc0.m.scale.set(ss0, Math.random() < .5 ? -ss0 : ss0, 1); sc0.m.visible = true; } }
    }
    for (var ic = 0; ic < ionCells.length; ic++) {
      var cp = (.34 + .24 * Math.sin(S.t * 12 + ic * 1.7)) * live + S.zap * .38 + S.heat * .24;
      ionCells[ic].mesh.rotation.y = ionCells[ic].side * (S.t * .8 + S.zap * .35);
      ionCells[ic].mesh.scale.setScalar(.82 + Math.min(.28, cp * .28));
      ionCellMat.emissiveIntensity = .12 + cp * .42;
    }
    // emblem: electric flicker
    var fk = .5 + .5 * Math.sin(S.t * 31) * Math.sin(S.t * 17.3);
    var eb = (.5 + .25 * Math.sin(S.t * 1.9)) * live + fk * .25 * live + S.heat * .3 + fl * .5 + S.boost * .3;
    emblems[0].material.opacity = emblems[1].material.opacity = Math.min(1, eb);
    // muzzle starburst + crown
    mzRing.material.opacity = (S.flare * .9) + S.heat * .3 * live; mzRing.visible = mzRing.material.opacity > .01;
    var fs = .22 + S.flare * .7; flare.scale.set(fs, fs, 1); flare.material.opacity = S.flare; flare.visible = S.flare > .01; flare.rotation.z += dt * 3 + S.flare * .4;
    var ss = .3 + S.flare * .8; star.scale.set(ss, ss, 1); star.material.opacity = S.flare * S.flare * .95 * (1 - ads * .6); star.visible = S.flare > .02 && !S.low; star.rotation.z = S.t * 1.4;
    jit -= dt;
    if (jit <= 0) {
      jit = .04 + (Math.sin(S.t * 91) * .5 + .5) * .05;
      var act = S.flare > .25 || (S.heat > .35 && Math.sin(S.t * 53) > .2);
      for (var a = 0; a < crown.length; a++) {
        var cr = crown[a];
        if (act && (!S.low ? true : a === 0)) { cr.visible = true; cr.rotation.z = Math.sin(S.t * 57 + a * 2.3) * 3.14 + a * 2.09; var cs2 = .7 + Math.abs(Math.sin(S.t * 41 + a)) * .9; cr.scale.set(cs2, cs2 * (Math.sin(S.t * 29 + a) > 0 ? 1 : -1), 1); }
        else cr.visible = false;
      }
    }
    for (var a2 = 0; a2 < crown.length; a2++) if (crown[a2].visible) crown[a2].material.opacity = Math.min(1, S.flare + S.heat * .8) * af;
    for (var q = 0; q < shock.length; q++) {
      var sh = shock[q]; if (!sh.m.visible) continue; sh.t += dt / .22;
      if (sh.t >= 1) { sh.m.visible = false; continue; }
      var sc = 1 + sh.t * 6; sh.m.scale.set(sc, sc, 1); var inv = 1 - sh.t; sh.m.material.opacity = inv * inv * .9;
    }
  }
  function takeReload() { var p = S.pendingReload; S.pendingReload = false; return p; }
  function takeRearm() { var p = S.pendingRearm; S.pendingRearm = false; return p; }

  return {
    kind: 'tempest', group: group, update: update, fire: fire, awaken: awaken, rearm: rearm,
    setReload: setReload, setDetail: setDetail, dress: dress, takeRearm: takeRearm, takeReload: takeReload,
    mount: function (root) { root.add(group); if (magArmor && root.userData && root.userData.mag && magArmor.parent !== root.userData.mag) root.userData.mag.add(magArmor); },
    setVisible: function (v) { group.visible = !!v; if (magArmor) magArmor.visible = !!v; },
    state: S, uniforms: U, dispose: function () { group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  };
}

/* ------------------------------------------------------------------ world effects */
function createFx(T, scene) {
  var NB = 10, beams = [], UT = { value: 0 }, clock = 0;
  var bvs = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
  var bfs =
    'varying vec2 vUv; uniform float uHead,uAlpha,uLen,uT,uSeed;\n' +
    'float h1(float n){return fract(sin(n)*43758.5453);}\n' +
    'void main(){ float x=vUv.x, y=(vUv.y-.5)*2.; float L=uLen;\n' +
    ' float d=x-uHead; float tail=smoothstep(-.5,0.,d)*step(d,0.); float head=exp(-d*d*1500.);\n' +
    ' float fade=smoothstep(0.,.02,x)*uAlpha;\n' +
    ' float sg=x*L*2.2; float i0=floor(sg); float f=fract(sg); f=f*f*(3.-2.*f);\n' +
    ' float o1=mix(h1(i0*91.7+uSeed),h1((i0+1.)*91.7+uSeed),f)*2.-1.;\n' +
    ' float o2=mix(h1(i0*37.3+uSeed*1.7),h1((i0+1.)*37.3+uSeed*1.7),f)*2.-1.;\n' +
    ' float b1=exp(-pow((y-o1*.6)*11.,2.)), b2=exp(-pow((y-o2*.7)*16.,2.))*.7;\n' +
    ' float core=exp(-y*y*30.), body=exp(-y*y*5.);\n' +
    ' vec3 blue=vec3(.35,.7,1.), white=vec3(.92,.97,1.), vio=vec3(.6,.4,1.);\n' +
    ' vec3 col=white*b1*(.5+tail+head*1.4)+blue*b2*(tail*.9+head)+white*core*(.25+head)+vio*body*.06*uAlpha;\n' +
    ' float a=(b1*(.35+tail+head)+b2*tail*.8+core*(.2+head)+body*.07)*fade; gl_FragColor=vec4(col*fade,clamp(a,0.,1.)); }';
  var planeGeo = new T.PlaneGeometry(1, 1);
  for (var i = 0; i < NB; i++) {
    var U = { uHead: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 1 }, uT: UT, uSeed: { value: 0 } };
    var mat = new T.ShaderMaterial({ uniforms: U, vertexShader: bvs, fragmentShader: bfs, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    var g = new T.Group(), p1 = new T.Mesh(planeGeo, mat), p2 = new T.Mesh(planeGeo, mat); p2.rotation.x = Math.PI / 2;
    g.add(p1, p2); g.visible = false; g.frustumCulled = false; p1.frustumCulled = p2.frustumCulled = false; scene.add(g);
    beams.push({ g: g, U: U, t: 9, ttl: .14, len: 1, seed: i * 13.7 });
  }
  var nextBeam = 0, dir = new T.Vector3(), mid = new T.Vector3(), xAxis = new T.Vector3(1, 0, 0), qa = new T.Quaternion();

  var killEnd = new T.Vector3(), killView = new T.Vector3();
  /* sparks: CPU-simulated Points pool, one draw call */
  var NS = 130, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sl = new Float32Array(NS), sm = new Float32Array(NS);
  var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('color', new T.BufferAttribute(sc, 3));
  var sMat = new T.PointsMaterial({ size: .07, vertexColors: true, map: discTex(T), sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  var sparks = new T.Points(sg, sMat); sparks.frustumCulled = false; scene.add(sparks); sparks.visible = false; var sparkDirty = false;
  for (var s = 0; s < NS; s++) { sp[s * 3 + 1] = -999; }
  var sNext = 0;

  /* impact rings */
  var NR = 5, rings = [], fa = new T.Vector3(), fb = new T.Vector3(), forkEnd = new T.Vector3(), flashK = 1;
  for (var r = 0; r < NR; r++) {
    var rm = new T.Mesh(new T.RingGeometry(.1, .13, 36), new T.MeshBasicMaterial({ color: 0x8fd0ff, opacity: 0, side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    rm.visible = false; scene.add(rm); rings.push({ m: rm, t: 9, flat: false });
  }
  var rNext = 0;
  var fMat = new T.SpriteMaterial({ map: flareTex(T), color: 0xbfe4ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
  var flash = new T.Sprite(fMat); flash.visible = false; scene.add(flash); var flashT = 9;
  var low = false;

  function spawn(a, end, o) {
    o = o || {}; var b = beams[nextBeam]; nextBeam = (nextBeam + 1) % NB;
    dir.subVectors(end, a); var L = dir.length(); if (L < .05) return; dir.multiplyScalar(1 / L);
    mid.addVectors(a, end).multiplyScalar(.5);
    b.g.position.copy(mid); qa.setFromUnitVectors(xAxis, dir); b.g.quaternion.copy(qa);
    var w = o.w || (o.amp ? .12 : .3);
    var forkN = (!o.amp && !o.fork && !low) ? 2 : 0, fp0 = 0, fp1 = 0;
    if (forkN) { fp0 = .25 + Math.random() * .2; fp1 = .6 + Math.random() * .2; fa.copy(a).addScaledVector(dir, L * Math.min(fp0, 40 / L)); fb.copy(a).addScaledVector(dir, L * Math.min(fp1, 40 / L)); }
    b.g.children[0].scale.set(L, w, 1); b.g.children[1].scale.set(L, w, 1);
    b.U.uLen.value = Math.min(L, 60); b.ttl = o.ttl || .14; b.t = 0; b.g.visible = true; b.amp = o.amp || 1; b.seed = Math.random() * 60;
    if (!o.amp && !o.fork && !low) {   // tracers shed static sparks along their path and throw off two short side-forks
      var tn = Math.min(9, 3 + (L / 8 | 0)), tk, ti, tu, ux = dir.x, uy = dir.y, uz = dir.z;
      sparkDirty = true; sparks.visible = true;
      for (tk = 0; tk < tn; tk++) {
        ti = sNext; sNext = (sNext + 1) % NS; tu = Math.random() * Math.min(L, 40);
        sp[ti * 3] = a.x + ux * tu; sp[ti * 3 + 1] = a.y + uy * tu; sp[ti * 3 + 2] = a.z + uz * tu;
        sv[ti * 3] = (Math.random() - .5) * 1.6; sv[ti * 3 + 1] = (Math.random() - .5) * 1.6; sv[ti * 3 + 2] = (Math.random() - .5) * 1.6;
        sl[ti] = sm[ti] = .12 + Math.random() * .22;
      }
      var fk, fs0;
      for (fk = 0; fk < 2; fk++) { fs0 = fk ? fb : fa; forkEnd.set(fs0.x + (Math.random() - .5) * 1.3, fs0.y + (Math.random() - .5) * 1.3, fs0.z + (Math.random() - .5) * 1.3); spawn(fs0, forkEnd, { amp: .55, ttl: .09, fork: true }); }
    }
  }
  function burst(p, from, big) { sparkDirty = true; sparks.visible = true;
    var n = low ? 7 : (big ? 18 : 12), k;
    dir.subVectors(from, p).normalize();
    for (k = 0; k < n; k++) {
      var i = sNext; sNext = (sNext + 1) % NS;
      sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
      var sp2 = 2 + Math.random() * 6.5;
      sv[i * 3] = (dir.x * .8 + (Math.random() - .5) * 2) * sp2; sv[i * 3 + 1] = (dir.y * .8 + (Math.random() - .3) * 1.6) * sp2; sv[i * 3 + 2] = (dir.z * .8 + (Math.random() - .5) * 2) * sp2;
      sl[i] = sm[i] = .2 + Math.random() * .4;
    }
    var ring = rings[rNext]; rNext = (rNext + 1) % NR; ring.t = 0; ring.flat = false; ring.m.visible = true; ring.m.position.copy(p).addScaledVector(dir, .02);
    ring.m.lookAt(from);
    flash.position.copy(p).addScaledVector(dir, .05); flashT = 0; flashK = big ? 2.6 : 1; flash.visible = true;
  }
  function eliminate(p, from) {
    killView.copy(from || killEnd.set(p.x, p.y + 1, p.z + 1));
    if (killView.distanceToSquared(p) < .01) killView.set(p.x, p.y + 1, p.z + 1);
    burst(p, killView, true);
    // Thunderstrike: a bolt drops from the sky onto the target, a branching lattice spreads from the impact,
    // a flat shockwave rolls across the floor and static sparks hang in the air.
    killEnd.set(p.x + (Math.random() - .5) * .3, p.y + 6, p.z + (Math.random() - .5) * .3);
    spawn(killEnd, p, { ttl: .22, amp: 1, w: .42 });
    var branches = [[-.42,.12,0],[.42,.12,0],[0,.28,.42],[0,.28,-.42],[-.30,-.08,.30],[.30,-.08,-.30]];
    var count = low ? 3 : branches.length;
    for (var k = 0; k < count; k++) {
      var d = branches[k]; killEnd.set(p.x + d[0], p.y + d[1], p.z + d[2]);
      spawn(p, killEnd, { ttl: .17, amp: .85 });
    }
    var fr = rings[rNext]; rNext = (rNext + 1) % NR; fr.t = 0; fr.flat = true; fr.m.visible = true; fr.m.position.set(p.x, p.y + .03, p.z); fr.m.rotation.set(-Math.PI / 2, 0, 0);
    if (!low) {
      sparkDirty = true; sparks.visible = true;
      for (var e = 0; e < 22; e++) {
        var ei = sNext; sNext = (sNext + 1) % NS;
        sp[ei * 3] = p.x + (Math.random() - .5) * .6; sp[ei * 3 + 1] = p.y + Math.random() * .8; sp[ei * 3 + 2] = p.z + (Math.random() - .5) * .6;
        sv[ei * 3] = (Math.random() - .5) * 3; sv[ei * 3 + 1] = Math.random() * 3; sv[ei * 3 + 2] = (Math.random() - .5) * 3;
        sl[ei] = sm[ei] = .3 + Math.random() * .5;
      }
    }
  }
  function tick(dt) {
    clock += dt; UT.value = clock; var i, qs = Math.floor(clock * 26) * 7.3;
    for (i = 0; i < NB; i++) {
      var b = beams[i]; if (!b.g.visible) continue; b.t += dt; var u = b.t / b.ttl;
      if (u >= 1) { b.g.visible = false; continue; }
      b.U.uSeed.value = b.seed + qs;
      b.U.uHead.value = Math.min(1.4, u * 2.4 - .1); b.U.uAlpha.value = (1 - u * u) * Math.min(1, b.amp);
    }
    if (sparkDirty) { var anyLive = false; for (i = 0; i < NS; i++) {
      if (sl[i] <= 0) { sp[i * 3 + 1] = -999; continue; } anyLive = true;
      sl[i] -= dt; var f = Math.max(0, sl[i] / sm[i]);
      sv[i * 3 + 1] -= 9.8 * dt; sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      sc[i * 3] = f * .45; sc[i * 3 + 1] = f * (.55 + .3 * f); sc[i * 3 + 2] = f;
    }
    sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; if (!anyLive) { sparkDirty = false; sparks.visible = false; } }
    for (i = 0; i < NR; i++) {
      var r = rings[i]; if (!r.m.visible) continue; r.t += dt / .3;
      if (r.t >= 1) { r.m.visible = false; continue; }
      var sc2 = 1 + r.t * (r.flat ? 10 : 5); r.m.scale.set(sc2, sc2, 1); r.m.material.opacity = (1 - r.t) * (1 - r.t) * .85;
    }
    if (flash.visible) { flashT += dt / .14; if (flashT >= 1) flash.visible = false; else { var fs = (.5 + flashT * .8) * flashK; flash.scale.set(fs, fs, 1); fMat.opacity = (1 - flashT) * .9; } }
  }
  return { spawn: spawn, burst: burst, eliminate: eliminate, signature: 'tempest-branching-discharge', tick: tick, setLow: function (v) { low = !!v; } };
}

/* ------------------------------------------------------------------ audio (Float32Array generators) */
function prng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; }; }
function norm(d, peak) { var m = 0, i; for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > m) m = a; } if (m > 0) { var k = peak / m; for (i = 0; i < d.length; i++) d[i] *= k; } return d; }
var TAU = Math.PI * 2;
function lpf(d, a) { var y = 0; for (var i = 0; i < d.length; i++) { y += (d[i] - y) * a; d[i] = y; } return d; }
var LA = global.SightlineLegendaryAudio;
function chirp(c, f0, f1, dur) { return Math.sin(TAU * (f0 * c + (f1 - f0) * c * c / (2 * dur))); }   // closed-form linear sweep, c in [0,dur]
function equipSound(sr) {   // 1.4 s "storm call": thunder swell, rising electric whine (strong at 0.62-0.8 s), crackle, big zap, rolling thunder
  var n = Math.floor(sr * 1.4), d = new Float32Array(n), r = prng(71), lp = 0, lp2 = 0, wph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, sw = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.15)), 1.3), nz = r();
    lp += (nz - lp) * .03; var v = lp * sw * 3.4;
    wph += TAU * (380 + 2400 * Math.pow(t / 1.2, 2)) / sr;
    v += (Math.sin(wph) + .4 * Math.sin(wph * 2)) * sw * .24 * (.7 + .3 * Math.sin(TAU * 24 * t));
    if (Math.abs(nz) > .993) v += r() * .55 * sw;
    var z = t - .88;
    if (z > 0) { v += nz * Math.exp(-z * 55) * .75 + (z < .2 ? chirp(z, 5400, 700, .2) * Math.exp(-z * 13) * .5 : 0) + Math.sin(TAU * (120 - 60 * z) * z) * Math.exp(-z * 9) * .55;
      lp2 += (nz - lp2) * .02; v += lp2 * Math.exp(-(z - .04) * 5) * 3.4 * Math.min(1, z * 30); }
    d[i] = v;
  }
  LA.verb(d, sr, .6);
  return LA.finishCue(d, sr, { hp: 70, eq: [[1200, .8, 3], [3000, .9, 3]], drive: 1.5, peak: .85 });
}
function rearmSound(sr) {   // 0.5 s: instant capacitor snap (so the 0-0.16 s slice already hits), charge whine, second zap
  var n = Math.floor(sr * .5), d = new Float32Array(n), r = prng(73), i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r();
    var v = nz * Math.exp(-t * 150) * .6 + (t < .09 ? chirp(t, 4800, 900, .09) * Math.exp(-t * 28) * .5 : 0) + Math.sin(TAU * (150 - 80 * Math.min(1, t * 10)) * t) * Math.exp(-t * 14) * .45;
    var c = t - .07; if (c > 0 && c < .2) v += Math.sin(TAU * (700 * c + 3500 * c * c)) * Math.sin(Math.PI * Math.min(1, c / .15)) * .24;
    var z = t - .19; if (z > 0) v += nz * Math.exp(-z * 120) * .5 + (z < .12 ? chirp(z, 3400, 600, .12) * Math.exp(-z * 22) * .4 : 0) + Math.sin(TAU * 110 * z) * Math.exp(-z * 14) * .35;
    d[i] = v;
  }
  LA.verb(d, sr, .45);
  return LA.finishCue(d, sr, { hp: 80, eq: [[1500, .8, 3], [3600, .9, 3.5]], drive: 1.7, peak: .85 });
}
function reloadSound(sr) {   // 0.85 s capacitor discharge: hard clack, falling whine with mid body, pops
  var n = Math.floor(sr * .85), d = new Float32Array(n), r = prng(75), ph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); ph += TAU * (300 + 2600 * Math.exp(-5 * t)) / sr;
    var v = nz * Math.exp(-t * 200) * .7 + Math.sin(TAU * 400 * t) * Math.exp(-t * 55) * .45 + (Math.sin(ph) + .35 * Math.sin(ph * 2)) * Math.exp(-3.2 * t) * .2 + Math.sin(TAU * (130 - 50 * Math.min(1, t * 6)) * t) * Math.exp(-t * 14) * .55;
    if (Math.abs(nz) > .992) v += r() * Math.exp(-t * 3) * .6;
    d[i] = v;
  }
  return LA.finishCue(d, sr, { hp: 90, lp: 9000, eq: [[900, .8, 3], [2600, .9, 2]], drive: 1.8, peak: .85 });
}
function hitSound(sr) {   // 0.3 s electric crack: hp-noise snap, zap sweep, body thump, arc crackle
  var n = Math.floor(sr * .3), d = new Float32Array(n), r = prng(77), lp = 0, ph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); lp += (nz - lp) * .25; ph += TAU * (150 + 300 * Math.exp(-t * 30)) / sr;
    var v = (nz - lp) * Math.exp(-t * 140) * .8 + (t < .07 ? chirp(t, 5200, 1200, .07) * Math.exp(-t * 24) * .45 : 0) + Math.sin(ph) * Math.exp(-t * 20) * .55;
    if (Math.abs(nz) > .985) v += r() * Math.exp(-t * 14) * .4;
    d[i] = v;
  }
  LA.verb(d, sr, .3);
  return LA.finishCue(d, sr, { hp: 140, eq: [[1700, .8, 4], [4000, .9, 3]], drive: 2.2, peak: .9 });
}
function mixShot(sr, base) {   // game report underneath + crack, descending zap, thump, sizzle gate and a rolling thunder tail
  var n = Math.max(base ? base.length : 0, Math.floor(sr * .55)), d = new Float32Array(n), r = prng(79), lp = 0, lp2 = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(), v = (base && i < base.length ? base[i] * .75 : 0);
    lp += (nz - lp) * .4;
    v += nz * Math.exp(-t * 170) * .55;
    var c = t - .004; if (c > 0 && c < .075) v += chirp(c, 5600, 1100, .075) * Math.exp(-c * 20) * .35;
    v += Math.sin(TAU * (135 * t - 75 * t * t)) * Math.exp(-t * 20) * .5;
    v += (nz - lp) * (Math.sin(TAU * 45 * t) > .2 ? 1 : .25) * Math.exp(-t * 9) * .2;
    lp2 += (nz - lp2) * .03; v += lp2 * Math.min(1, t * 20) * Math.exp(-t * 6) * 1.4;
    d[i] = v;
  }
  LA.verb(d, sr, .7);
  return LA.finishCue(d, sr, { hp: 60, lp: 11000, eq: [[2400, .9, 4], [5500, .9, 3]], drive: 1.7, peak: .92 });
}
function killSound(sr) {   // 0.65 s thunderclap: crack, big falling zap, three branching snaps, boom, ionic shimmer
  var n = Math.floor(sr * .65), d = new Float32Array(n), r = prng(83), lp2 = 0, i, k;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r();
    var v = nz * Math.exp(-t * 70) * .65 + (t < .16 ? chirp(t, 6500, 350, .16) * Math.exp(-t * 14) * .5 : 0);
    for (k = 0; k < 3; k++) { var z = t - .07 - k * .075; if (z > 0) v += nz * Math.exp(-z * 140) * .45 + (z < .08 ? chirp(z, 4200 - k * 700, 800, .08) * Math.exp(-z * 30) * .35 : 0); }
    lp2 += (nz - lp2) * .035; v += lp2 * Math.exp(-t * 5.5) * 3 + Math.sin(TAU * (84 * t - 30 * t * t)) * Math.exp(-t * 7) * 1.0;
    for (k = 0; k < 3; k++) { var s2 = t - .2 - k * .045; if (s2 > 0) v += Math.sin(TAU * [2093, 2794, 3322][k] * s2) * Math.exp(-s2 * 8) * .07; }
    d[i] = v;
  }
  LA.verb(d, sr, .6);
  return LA.finishCue(d, sr, { hp: 45, lp: 10000, eq: [[1400, .8, 1.5], [4000, .9, 2]], drive: 1.35, peak: .95 });
}

/* ------------------------------------------------------------------ picker card styling */
var styled = false;
function decorate(btn, f, selected) {
  if (!styled && document.head) {
    var st = document.createElement('style');
    st.textContent = '@keyframes tmpGlow{0%,100%{box-shadow:0 0 6px #4aa8ff55,inset 0 0 8px #2a4cff22}50%{box-shadow:0 0 16px #8fd6ffcc,inset 0 0 14px #5a7cff55}}@keyframes tmpFlick{0%,100%{opacity:.95}7%{opacity:.35}9%{opacity:1}52%{opacity:.8}55%{opacity:.3}58%{opacity:1}}' +
      '.tmp-card{background:linear-gradient(135deg,#05070f,#0d1a30 55%,#1a1840)!important;border:1px solid #5fb8ff!important;animation:tmpGlow 2.4s ease-in-out infinite;position:relative;overflow:hidden}' +
      '.tmp-card .tmp-bolt{position:absolute;right:10px;top:7px;width:20px;height:30px;clip-path:polygon(60% 0,10% 55%,45% 55%,30% 100%,90% 40%,52% 40%);background:linear-gradient(180deg,#fff,#8fd6ff);animation:tmpFlick 2.1s linear infinite}' +
      '@keyframes tmpSheen{0%{transform:translateX(-120%) skewX(-20deg)}50%,100%{transform:translateX(320%) skewX(-20deg)}}@keyframes tmpArc{0%,88%,100%{opacity:0}90%{opacity:1}93%{opacity:.2}96%{opacity:.9}}' +
      '.tmp-card::after{content:"";position:absolute;top:0;left:0;width:28%;height:100%;background:linear-gradient(90deg,transparent,#9fd8ff3a,transparent);animation:tmpSheen 3.1s ease-in-out infinite;pointer-events:none}' +
      '.tmp-card .tmp-arc{position:absolute;left:6%;right:6%;bottom:9px;height:2px;background:linear-gradient(90deg,transparent,#dff4ff,transparent);box-shadow:0 0 8px #7fd0ff;animation:tmpArc 2.6s linear infinite;pointer-events:none}' +
      '.tmp-tag{display:inline-block;margin-top:5px;padding:1px 6px;font:700 9px system-ui;letter-spacing:1.5px;color:#04101c;background:linear-gradient(90deg,#bfe8ff,#6fb8ff);border-radius:3px}';
    document.head.appendChild(st); styled = true;
  }
  btn.classList.add('tmp-card'); btn.style.color = '#e4f4ff';
  var arcLine = document.createElement('span'); arcLine.className = 'tmp-arc'; btn.appendChild(arcLine);
  var bolt = document.createElement('span'); bolt.className = 'tmp-bolt'; btn.appendChild(bolt);
  var tag = document.createElement('span'); tag.className = 'tmp-tag'; tag.textContent = 'LEGENDARY'; btn.appendChild(document.createElement('br')); btn.appendChild(tag);
}

global.SightlineTempest = {
  version: 'G3.0-tempest', weapon: 'needle', finish: FINISH, anchors: ANCHOR, hasEliminationFx: true,
  buildRig: buildRig, createFx: createFx, decorate: decorate,
  equipSound: LA.memo(equipSound), rearmSound: LA.memo(rearmSound), reloadSound: LA.memo(reloadSound), hitSound: LA.memo(hitSound), mixShot: LA.memoBase(mixShot), killSound: LA.memo(killSound)
};
})(window);

/* ---- legendary-eclipse.js ---- */
/* Sightline legendary finish: HELIOS ECLIPSE  (Ranger DMR)
   Original design. Cosmetic only: no damage, ammo, recoil, hit or network behaviour is touched.

   What it adds
     - Black-ceramic body with live solar veins (one shader patched into the gun's own Phong
       materials, so every part of the chassis shares one flowing pattern in gun-local space).
     - Corona rings around the scope, an eclipse emblem on both receiver flanks, capacitor
       strips on the handguard, a flare + three shockwave rings at the muzzle.
     - Orbiting ember cloud around the receiver (one Points draw call).
     - Shot: veins surge stock->muzzle, barrel heat builds with rapid fire, molten helix tracer,
       impact burst with sparks and shock ring.
     - Equip "awakening" sweep, reload dimming/recharge, rearm surge.
     - Synthesised equip / shot-layer / rearm audio (no asset files).
   Contract used by index.html:
     SightlineEclipse.finish, buildRig(THREE) -> rig, createFx(THREE, scene) -> fx,
     equipSound/rearmSound/mixShot(sampleRate,...) -> Float32Array, decorate(button, finish, selected)
   Everything is allocated once; update() and fx.tick() allocate nothing. */
(function (global) {
'use strict';

var FINISH = {
  name: 'Helios Eclipse', legendary: true, legendKind: 'eclipse',
  metal: 0x1a1522, polymer: 0x0b0a10, trim: 0xffb22e,
  desc: 'LEGENDARY · black ceramic, living solar veins, corona optic, molten helix tracers'
};

/* ------------------------------------------------------------------ shaders */
var GLSL_COMMON =
  'uniform float uT,uPulse,uHeat,uAwake,uDim,uGain,uLow;\n' +
  'varying vec3 vEcl;\n';
var GLSL_FRAG_FUNCS =
  'float eH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\n' +
  'uniform sampler2D uNoise;\n' +
  'float eN(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f); vec2 o=i.z*vec2(37.,17.);\n' +
  ' return mix(texture2D(uNoise,(i.xy+o+f.xy+.5)/256.).x,texture2D(uNoise,(i.xy+o+vec2(37.,17.)+f.xy+.5)/256.).x,f.z);}\n';

var SURF_OLD = '{\n float t=vEcl.y;\n vec3 q=vEcl*vec3(46.,46.,16.); vec3 f=abs(fract(q)-.5); float ln=smoothstep(.46,.5,max(f.y,f.z)); diffuseColor.rgb*=1.-ln*.5;\n diffuseColor.rgb=mix(diffuseColor.rgb*.64,diffuseColor.rgb*1.2,smoothstep(-.012,.014,t));\n float inl=smoothstep(.0025,.0,abs(t-.0105))+smoothstep(.0022,.0,abs(t+.0085));\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.72,.3)*.9,clamp(inl,0.,1.)*.9);\n float sc=step(.96,fract(sin(floor(vEcl.z*70.)*12.9+floor(vEcl.y*70.)*78.2)*437.5)); diffuseColor.rgb*=1.-sc*.3;\n}\n';
var GLSL_EMISSIVE =
  '{\n' +
  ' vec3 w0=vEcl+.012*vec3(sin(vEcl.z*47.+uT*.6),cos(vEcl.z*39.),sin(vEcl.x*61.));\n vec3 q=w0*vec3(52.,52.,13.)+vec3(0.,0.,-uT*.8);\n' +
  ' float n1=eN(q); float v=pow(1.-abs(n1*2.-1.),26.)*(.12+.88*smoothstep(.3,.62,eN(q*.35+vec3(3.,1.,2.))));\n' +
  ' if(uLow<.5){float n2=eN(q*2.3+vec3(7.,3.,-uT*.5)); v=max(v,.45*pow(1.-abs(n2*2.-1.),30.)*smoothstep(.45,.7,eN(q*.6+vec3(9.))));}\n' +
  ' float breath=.62+.38*sin(uT*1.6+vEcl.z*7.);\n' +
  ' float waveP=exp(-pow((vEcl.z-(.55-uPulse*1.5))*8.5,2.))*step(0.,uPulse);\n' +
  ' float waveA=exp(-pow((vEcl.z-(.55-uAwake*1.6))*6.,2.))*step(0.,uAwake);\n' +
  ' float flow=v*breath*(1.-uDim)+(waveP+waveA)*(.35+v*1.6)+uHeat*(.18+v*.9)*.55;\n' +
  ' vec3 hot=mix(vec3(1.,.42,.04),vec3(1.,.86,.45),clamp(v*v*.7+waveP*.6+waveA*.5+uHeat*.35,0.,1.));\n' +
  ' float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);\n' +
  ' vec3 rim=mix(vec3(.55,.22,1.),vec3(1.,.66,.2),.5+.5*sin(uT*.8+vEcl.z*4.))*fres*(.5+uHeat*.6);\n' +
  ' totalEmissiveRadiance+=(hot*flow*1.6+rim)*uGain;\n' +
  '}\n';

function patchMaterial(mat, U, gain) {
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uT = U.uT; sh.uniforms.uPulse = U.uPulse; sh.uniforms.uHeat = U.uHeat;
    sh.uniforms.uAwake = U.uAwake; sh.uniforms.uDim = U.uDim; sh.uniforms.uLow = U.uLow;
    sh.uniforms.uInv = U.uInv; sh.uniforms.uNoise = U.uNoise; sh.uniforms.uGain = { value: gain };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uInv;\nvarying vec3 vEcl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEcl=(uInv*modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_FRAG_FUNCS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURF_OLD)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_EMISSIVE);
  };
  mat.customProgramCacheKey = function () { return 'helios-eclipse-v2'; };
  mat.needsUpdate = true;
  return mat;
}

/* ------------------------------------------------------------------ textures */

function noiseTexture(T) {   // one shared 256x256 random texture: replaces the per-pixel sin-hash value noise
  var g = global; if (g.__slNoise && g.__slNoise.T === T) return g.__slNoise.tex;
  var n = 256, d = new Uint8Array(n * n * 4), s = 987654321, i;
  for (i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  var tx = new T.DataTexture(d, n, n, T.RGBAFormat); tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.magFilter = tx.minFilter = T.LinearFilter; tx.generateMipmaps = false; tx.needsUpdate = true;
  g.__slNoise = { T: T, tex: tx }; return tx;
}

function mergeGeos(T, list) {   // merge small static geometries that share a material into one draw call
  var pos = [], nor = [], uv = [], idx = [], off = 0, i;
  list.forEach(function (g) {
    var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 0, n ? n.getZ(i) : 1); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
    if (g.index) { for (i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); } else { for (i = 0; i < p.count; i++) idx.push(i + off); }
    off += p.count;
  });
  var m = new T.BufferGeometry();
  m.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); m.setIndex(idx);
  return m;
}
var texCache = {};
function canvasTex(T, key, size, draw) {
  if (texCache[key]) return texCache[key];
  var c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  var t = new T.CanvasTexture(c); return (texCache[key] = t);
}
function flareTex(T) {
  return canvasTex(T, 'flare', 128, function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,250,225,1)'); gr.addColorStop(.12, 'rgba(255,214,120,.95)');
    gr.addColorStop(.35, 'rgba(255,140,40,.35)'); gr.addColorStop(1, 'rgba(255,100,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    [[0, 1], [1, 0]].forEach(function (d) {
      var l = g.createLinearGradient(h - d[0] * h, h - d[1] * h, h + d[0] * h, h + d[1] * h);
      l.addColorStop(0, 'rgba(255,190,80,0)'); l.addColorStop(.5, 'rgba(255,235,170,.9)'); l.addColorStop(1, 'rgba(255,190,80,0)');
      g.fillStyle = l; g.fillRect(d[0] ? 0 : h - 2.5, d[1] ? 0 : h - 2.5, d[0] ? s : 5, d[1] ? s : 5);
    });
  });
}
function discTex(T) {
  return canvasTex(T, 'disc', 128, function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
}
/* Eclipse emblem: black moon, bright corona ring, 12 rays. Drawn once. */
function emblemTex(T) {
  return canvasTex(T, 'emblem', 256, function (g, s) {
    var h = s / 2; g.clearRect(0, 0, s, s);
    var glow = g.createRadialGradient(h, h, s * .17, h, h, h);
    glow.addColorStop(0, 'rgba(255,196,70,.95)'); glow.addColorStop(.35, 'rgba(255,128,30,.45)'); glow.addColorStop(1, 'rgba(255,90,10,0)');
    g.fillStyle = glow; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,238,170,.95)'; g.lineWidth = 3;
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, r0 = s * .24, r1 = s * (i % 2 ? .36 : .46);
      g.beginPath(); g.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0); g.lineTo(h + Math.cos(a) * r1, h + Math.sin(a) * r1); g.stroke();
    }
    g.lineWidth = 5; g.beginPath(); g.arc(h, h, s * .205, 0, 6.2832); g.stroke();
    g.fillStyle = '#05040a'; g.beginPath(); g.arc(h, h, s * .185, 0, 6.2832); g.fill();
  });
}

/* ------------------------------------------------------------------ the rig */
var ANCHOR = {
  muzzle: [0.0, 0.012, -0.835],
  scope: { x: 0.006, y: 0.1075, zFront: -0.2425, zRear: 0.112, rFront: 0.037, rRear: 0.026 },
  flank: { x: 0.0252, y: -0.004, z: -0.03 },
  strips: { x: 0.0289, y: 0.018, z0: -0.17, z1: -0.46, n: 5 },
  ember: { cx: 0.006, cy: 0.02, z0: 0.34, z1: -0.78 }
};

function buildRig(T) {
  var A = ANCHOR, group = new T.Group(); group.name = 'helios-eclipse-rig';
  var U = {
    uT: { value: 0 }, uPulse: { value: -1 }, uHeat: { value: 0 }, uAwake: { value: -1 }, uDim: { value: 0 },
    uLow: { value: 0 }, uNoise: { value: noiseTexture(T) }, uInv: { value: new T.Matrix4() }
  };
  var S = { t: 0, pulse: -1, heat: 0, awake: -1, dim: 0, boost: 0, flare: 0, coronaFlash: 0, rf: 0, reloading: false, low: false, pendingRearm: false, rearmFx: 0, stripT: 0 };
  var add = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
  function basic(color, opacity, extra) { var o = { color: color, opacity: opacity }; for (var k in add) o[k] = add[k]; for (var e in (extra || {})) o[e] = extra[e]; return new T.MeshBasicMaterial(o); }

  /* --- scope corona: two counter-rotating rings front, one rear, soft halo disc -------- */
  var scope = new T.Group(); scope.position.set(A.scope.x, A.scope.y, 0); group.add(scope);
  var ringA = new T.Mesh(new T.TorusGeometry(A.scope.rFront + .004, .0017, 8, 56), basic(0xffb22e, .95)); ringA.position.z = A.scope.zFront - .002; scope.add(ringA);
  var ringB = new T.Mesh(new T.TorusGeometry(A.scope.rFront + .011, .0009, 6, 56), basic(0x9a5cff, .8)); ringB.position.z = A.scope.zFront - .004; scope.add(ringB);
  var ringR = new T.Mesh(new T.TorusGeometry(A.scope.rRear + .003, .0013, 8, 40), basic(0xffd27a, .8)); ringR.position.z = A.scope.zRear + .002; scope.add(ringR);
  var ticks = new T.Group(); ticks.position.z = A.scope.zFront - .003; scope.add(ticks);   // 12 tick marks on the corona
  var tickMat = basic(0xfff0b0, .9), tickGeo = new T.BoxGeometry(.0016, .0075, .0012);
  var tl = []; for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6, tg = tickGeo.clone(); tg.rotateZ(a - Math.PI / 2); tg.translate(Math.cos(a) * (A.scope.rFront + .017), Math.sin(a) * (A.scope.rFront + .017), 0); tl.push(tg); }
  ticks.add(new T.Mesh(mergeGeos(T, tl), tickMat));
  var halo = new T.Mesh(new T.PlaneGeometry(.17, .17), basic(0xff9a2a, .0, { map: discTex(T) })); halo.position.z = A.scope.zFront - .006; scope.add(halo);

  /* --- eclipse emblem on both flanks ---------------------------------------------------- */
  var emblems = [];
  [-1, 1].forEach(function (side) {
    var m = new T.Mesh(new T.PlaneGeometry(.066, .066), basic(0xffffff, .95, { map: emblemTex(T), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(side * A.flank.x, A.flank.y, A.flank.z); m.rotation.y = side * Math.PI / 2; group.add(m); emblems.push(m);
  });

  /* --- capacitor strips on the handguard (both sides) ------------------------------------ */
  var strips = [], stripMat = [];
  for (var s = 0; s < A.strips.n; s++) {
    var mat = new T.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 1 }); stripMat.push(mat);
    var z = A.strips.z0 + (A.strips.z1 - A.strips.z0) * (s / (A.strips.n - 1));
    var bar = new T.Mesh(mergeGeos(T, [-1, 1].map(function (side) { var g = new T.BoxGeometry(.0016, .0075, .036); g.translate(side * A.strips.x, A.strips.y, z); return g; })), mat); group.add(bar); strips.push(bar);
  }

  /* --- muzzle: halo ring, flare, 3 shock rings ------------------------------------------- */
  var mz = new T.Group(); mz.position.set(A.muzzle[0], A.muzzle[1], A.muzzle[2]); group.add(mz);
  var mzRing = new T.Mesh(new T.TorusGeometry(.0185, .0013, 6, 36), basic(0xffb22e, .0)); mz.add(mzRing);
  var flare = new T.Mesh(new T.PlaneGeometry(.5, .5), basic(0xffffff, 0, { map: flareTex(T) })); flare.position.z = -.02; mz.add(flare);
  var shock = [];
  for (var r = 0; r < 3; r++) { var sm = new T.Mesh(new T.RingGeometry(.024, .031, 40), basic(0xffc860, 0, { side: T.DoubleSide })); sm.visible = false; mz.add(sm); shock.push({ m: sm, t: 9 }); }
  var shockNext = 0;

  /* --- ember cloud: one Points draw call, positions computed in the vertex shader -------- */
  var NE = 56, seeds = new Float32Array(NE * 4), pos = new Float32Array(NE * 3), rs = 1337;
  function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
  for (var e = 0; e < NE; e++) { seeds[e * 4] = rnd(); seeds[e * 4 + 1] = rnd(); seeds[e * 4 + 2] = .5 + rnd() * 1.3; seeds[e * 4 + 3] = .45 + rnd() * .9; }
  var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(pos, 3)); eg.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  var emU = { uT: U.uT, uBoost: { value: 0 }, uScale: { value: 520 }, uZ0: { value: A.ember.z0 }, uZ1: { value: A.ember.z1 }, uC: { value: new T.Vector2(A.ember.cx, A.ember.cy) } };
  var emMat = new T.ShaderMaterial({
    uniforms: emU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader:
      'attribute vec4 aSeed; uniform float uT,uBoost,uScale,uZ0,uZ1; uniform vec2 uC; varying float vA; varying float vH;\n' +
      'void main(){ float u=fract(uT*.045*aSeed.z+aSeed.x); float ang=uT*aSeed.z*(1.1+uBoost*1.6)+aSeed.y*6.2832;\n' +
      ' float rad=(.045+.05*aSeed.x+.03*sin(uT*.7+aSeed.y*9.))*(1.+uBoost*.55);\n' +
      ' vec3 p=vec3(uC.x+cos(ang)*rad, uC.y+sin(ang)*rad*.8+u*.035, mix(uZ0,uZ1,u));\n' +
      ' vA=sin(3.14159*u); vH=aSeed.x; vec4 mv=modelViewMatrix*vec4(p,1.);\n' +
      ' gl_PointSize=clamp(aSeed.w*.016*uScale*(1.+uBoost*.8)/max(.05,-mv.z),1.,64.); gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'varying float vA; varying float vH;\n' +
      'void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); float a=smoothstep(.5,0.,d); a*=a;\n' +
      ' vec3 col=mix(vec3(1.,.55,.1),vec3(.7,.35,1.),step(.82,vH)); col=mix(col,vec3(1.,.95,.75),smoothstep(.2,0.,d));\n' +
      ' gl_FragColor=vec4(col,a*vA); }'
  });
  var embers = new T.Points(eg, emMat); embers.frustumCulled = false; group.add(embers);

  /* ---------------- state machine ---------------- */
  var mats = {}, tint = new T.Color();
  function dress(g, on) {
    if (!on) return;
    group.updateWorldMatrix(true, false);
    g.traverse(function (mesh) {
      if (!mesh.isMesh || !mesh.userData.finishBase || mesh.userData.finishBadge) return;
      var base = mesh.userData.finishBase, c = base.color, b = (c.r + c.g + c.b) / 3;
      if (b < .004 || b > .75 || base.transparent) return;
      var key = base.uuid, m = mats[key];
      if (!m) {
        var metal = b > .05;
        m = new T.MeshPhongMaterial({
          color: metal ? 0x0f0c16 : 0x07060a, specular: metal ? 0x9a7a48 : 0x3c3450, shininess: metal ? 120 : 45,
          map: base.map || null, bumpMap: base.bumpMap || null, bumpScale: base.bumpScale || 1, envMap: null,
          reflectivity: metal ? .15 : .06, combine: T.MixOperation
        });
        patchMaterial(m, U, metal ? 1 : .6); mats[key] = m;
      }
      mesh.material = m;
    });
  }
  function fire() {
    S.pulse = 0; S.boost = 1; S.flare = 1; S.heat = Math.min(1, S.heat + .2); S.stripT = 0;
    var sh = shock[shockNext]; shockNext = (shockNext + 1) % 3; sh.t = 0; sh.m.visible = !S.low;
    if (S.low) { shockNext = 0; }
  }
  function awaken() { S.awake = 0; S.coronaFlash = 1; S.boost = Math.max(S.boost, .9); }
  function rearm() { S.rearmFx = 1; S.pulse = 0; S.boost = Math.max(S.boost, .7); S.coronaFlash = Math.max(S.coronaFlash, .6); }
  function setReload(rf, is) {
    if (!S.reloading && is) S.pendingReload = true;
    if (S.reloading && !is) { S.pendingRearm = true; rearm(); }
    S.reloading = !!is; S.rf = rf || 0;
  }
  function setDetail(level) {
    var low = level === 'low'; if (low === S.low) return; S.low = low; U.uLow.value = low ? 1 : 0;
    eg.setDrawRange(0, low ? 20 : NE); ticks.visible = !low; ringB.visible = !low; halo.visible = !low;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function update(dt, o) {
    if (!group.visible || (group.parent && !group.parent.visible)) return;
    if (dt > .1) dt = .1; S.t += dt; U.uT.value = S.t;
    // veins: dim while reloading, recharge in the last quarter
    var dimT = S.reloading ? (S.rf < .72 ? .86 : .86 * (1 - clamp01((S.rf - .72) / .28))) : 0;
    S.dim += (dimT - S.dim) * Math.min(1, dt * 7); U.uDim.value = S.dim;
    if (S.pulse >= 0) { S.pulse += dt / .38; if (S.pulse > 1.15) S.pulse = -1; } U.uPulse.value = S.pulse;
    if (S.awake >= 0) { S.awake += dt / 1.15; if (S.awake > 1.15) S.awake = -1; } U.uAwake.value = S.awake;
    S.heat = Math.max(0, S.heat - dt * .34); U.uHeat.value = S.heat;
    S.boost = Math.max(0, S.boost - dt * 1.4); emU.uBoost.value = S.boost;
    S.coronaFlash = Math.max(0, S.coronaFlash - dt * 1.1); S.flare = Math.max(0, S.flare - dt * 7.5); S.rearmFx = Math.max(0, S.rearmFx - dt * 3);
    U.uInv.value.copy(group.matrixWorld).invert();
    emU.uScale.value = (global.innerHeight || 600) * .87;
    var live = 1 - S.dim * .8, fl = S.coronaFlash;
    // corona
    var sp = 1 - S.dim * .9; ringA.rotation.z += dt * (.9 * sp + S.boost * 5 + fl * 4); ringB.rotation.z -= dt * (1.4 * sp + S.boost * 4); ticks.rotation.z += dt * (.35 * sp + S.boost * 2 + fl * 2);
    var ps = (1 + fl * .5 + S.boost * .16) * (1 - S.dim * .12); ringA.scale.set(ps, ps, 1); ringB.scale.set(ps * 1.06, ps * 1.06, 1);
    ringA.material.opacity = (.5 + .35 * Math.sin(S.t * 2.3)) * live + fl * .5 + S.boost * .3 + S.rearmFx * .4; ringA.material.opacity = Math.min(1, ringA.material.opacity);
    ringB.material.opacity = .55 * live + S.boost * .35; ringR.material.opacity = (.5 + .3 * Math.sin(S.t * 2.3 + 1.2)) * live + fl * .4;
    tickMat.opacity = .5 * live + fl * .5 + S.boost * .3; halo.material.opacity = Math.min(.55, fl * .5 + S.boost * .22 + S.heat * .1); halo.visible = halo.material.opacity > .01 && !S.low;
    // emblem breathing
    var eb = (.55 + .35 * Math.sin(S.t * 1.7)) * live + S.heat * .3 + fl * .4 + S.boost * .25;
    emblems[0].material.opacity = emblems[1].material.opacity = Math.min(1, eb);
    emblems[0].rotation.z = emblems[1].rotation.z = Math.sin(S.t * .4) * .08;
    // capacitor strips chase left-to-right after a shot, otherwise breathe
    S.stripT += dt;
    for (var k = 0; k < stripMat.length; k++) {
      var chase = Math.exp(-Math.pow((S.stripT * 7.5) - (stripMat.length - 1 - k), 2) * .9) * (S.stripT < 1.2 ? 1 : 0);
      var idle = (.28 + .22 * Math.sin(S.t * 2 + k * .9)) * live, v = Math.min(1, idle + chase + S.heat * .35 + fl * .5);
      stripMat[k].color.setRGB(1, .35 + .5 * v, .06 + .4 * chase); stripMat[k].opacity = .25 + .75 * v;
    }
    // muzzle
    mzRing.material.opacity = (S.flare * .9) + S.heat * .35 * live; mzRing.visible = mzRing.material.opacity > .01;
    var fs = .25 + S.flare * .8; flare.scale.set(fs, fs, 1); flare.material.opacity = S.flare; flare.visible = S.flare > .01; flare.rotation.z += dt * 2;
    for (var q = 0; q < shock.length; q++) {
      var sh = shock[q]; if (!sh.m.visible) continue; sh.t += dt / .3;
      if (sh.t >= 1) { sh.m.visible = false; continue; }
      var sc = 1 + sh.t * 7.5; sh.m.scale.set(sc, sc, 1); var inv = 1 - sh.t; sh.m.material.opacity = inv * inv * .9;
    }
    if (S.pendingRearm) { /* host reads and clears it to play the rearm cue */ }
  }
  function takeReload() { var p = S.pendingReload; S.pendingReload = false; return p; }
  function takeRearm() { var p = S.pendingRearm; S.pendingRearm = false; return p; }

  return {
    kind: 'eclipse', group: group, update: update, fire: fire, awaken: awaken, rearm: rearm,
    setReload: setReload, setDetail: setDetail, dress: dress, takeRearm: takeRearm, takeReload: takeReload,
    state: S, uniforms: U, dispose: function () { group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  };
}

/* ------------------------------------------------------------------ world effects */
function createFx(T, scene) {
  var add = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
  var NB = 12, beams = [], UT = { value: 0 }, clock = 0;
  var bvs = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
  var bfs =
    'varying vec2 vUv; uniform float uHead,uAlpha,uLen,uT;\n' +
    'void main(){ float x=vUv.x, y=(vUv.y-.5)*2.; float L=uLen;\n' +
    ' float d=x-uHead; float tail=smoothstep(-.42,0.,d)*step(d,0.); float head=exp(-d*d*1800.);\n' +
    ' float fade=smoothstep(0.,.02,x)*uAlpha;\n' +
    ' float core=exp(-y*y*26.); float body=exp(-y*y*5.);\n' +
    ' float w=sin(x*L*1.35-uT*34.)*.52; float s1=exp(-pow((y-w)*9.,2.)), s2=exp(-pow((y+w)*9.,2.));\n' +
    ' vec3 gold=vec3(1.,.66,.16), vio=vec3(.62,.3,1.), white=vec3(1.,.97,.82);\n' +
    ' vec3 col=white*core*(.45+tail*1.3+head*1.6)+gold*s1*(tail*.9+head)+vio*s2*(tail*.9+head)+gold*body*.07*uAlpha;\n' +
    ' float a=(core*(.35+tail+head)+s1*tail+s2*tail+body*.07)*fade; gl_FragColor=vec4(col*fade,clamp(a,0.,1.)); }';
  var planeGeo = new T.PlaneGeometry(1, 1);
  for (var i = 0; i < NB; i++) {
    var U = { uHead: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 1 }, uT: UT };
    var mat = new T.ShaderMaterial({ uniforms: U, vertexShader: bvs, fragmentShader: bfs, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    var g = new T.Group(), p1 = new T.Mesh(planeGeo, mat), p2 = new T.Mesh(planeGeo, mat); p2.rotation.x = Math.PI / 2;
    g.add(p1, p2); g.visible = false; g.frustumCulled = false; p1.frustumCulled = p2.frustumCulled = false; scene.add(g);
    beams.push({ g: g, U: U, t: 9, ttl: .2, len: 1, w: .06 });
  }
  var nextBeam = 0, dir = new T.Vector3(), mid = new T.Vector3(), xAxis = new T.Vector3(1, 0, 0), qa = new T.Quaternion();

  /* sparks: CPU-simulated Points pool, one draw call */
  var NS = 72, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sl = new Float32Array(NS), sm = new Float32Array(NS);
  var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('color', new T.BufferAttribute(sc, 3));
  var sMat = new T.PointsMaterial({ size: .085, vertexColors: true, map: discTex(T), sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  var sparks = new T.Points(sg, sMat); sparks.frustumCulled = false; scene.add(sparks); sparks.visible = false; var sparkDirty = false;
  for (var s = 0; s < NS; s++) { sp[s * 3 + 1] = -999; }
  var sNext = 0;

  /* impact rings */
  var NR = 5, rings = [], killEnd = new T.Vector3(), killView = new T.Vector3(), kr = new T.Vector3(), ku = new T.Vector3(), UPV = new T.Vector3(0, 1, 0);
  for (var r = 0; r < NR; r++) {
    var rm = new T.Mesh(new T.RingGeometry(.1, .14, 36), new T.MeshBasicMaterial({ color: 0xffc060, opacity: 0, side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    rm.visible = false; scene.add(rm); rings.push({ m: rm, t: 9, flat: false, k: 5.5 });
  }
  var rNext = 0;
  var fMat = new T.SpriteMaterial({ map: flareTex(T), color: 0xffe0a0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
  var flash = new T.Sprite(fMat); flash.visible = false; scene.add(flash); var flashT = 9;
  var low = false;

  function spawn(a, end, o) {
    o = o || {}; var b = beams[nextBeam]; nextBeam = (nextBeam + 1) % NB;
    dir.subVectors(end, a); var L = dir.length(); if (L < .05) return; dir.multiplyScalar(1 / L);
    mid.addVectors(a, end).multiplyScalar(.5);
    b.g.position.copy(mid); qa.setFromUnitVectors(xAxis, dir); b.g.quaternion.copy(qa);
    var w = o.w || (o.amp ? .09 : .2);
    b.g.children[0].scale.set(L, w, 1); b.g.children[1].scale.set(L, w, 1);   // two crossed ribbons
    b.U.uLen.value = Math.min(L, 60); b.ttl = o.ttl || .2; b.t = 0; b.g.visible = true; b.amp = o.amp || 1;
  }
  function burst(p, from, big) { sparkDirty = true; sparks.visible = true;
    var n = low ? 8 : (big ? 22 : 14), k;
    dir.subVectors(from, p).normalize();
    for (k = 0; k < n; k++) {
      var i = sNext; sNext = (sNext + 1) % NS;
      sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
      var sp2 = 1.5 + Math.random() * 5.5;
      sv[i * 3] = (dir.x * .9 + (Math.random() - .5) * 1.6) * sp2; sv[i * 3 + 1] = (dir.y * .9 + Math.random() * 1.2) * sp2; sv[i * 3 + 2] = (dir.z * .9 + (Math.random() - .5) * 1.6) * sp2;
      sl[i] = sm[i] = .35 + Math.random() * .55;
    }
    var ring = rings[rNext]; rNext = (rNext + 1) % NR; ring.t = 0; ring.flat = false; ring.k = 5.5; ring.m.material.color.setHex(0xffc060); ring.m.visible = true; ring.m.position.copy(p).addScaledVector(dir, .02);
    ring.m.lookAt(from);
    flash.position.copy(p).addScaledVector(dir, .05); flashT = 0; flash.visible = true;
  }
  function flatRing(p, k, hex) {
    var fr = rings[rNext]; rNext = (rNext + 1) % NR; fr.t = 0; fr.flat = true; fr.k = k; fr.m.material.color.setHex(hex); fr.m.visible = true; fr.m.position.set(p.x, p.y + .03, p.z); fr.m.rotation.set(-Math.PI / 2, 0, 0);
  }
  function eliminate(p, from) {
    killView.copy(from || killEnd.set(p.x, p.y + 1, p.z + 1));
    if (killView.distanceToSquared(p) < .01) killView.set(p.x, p.y + 1, p.z + 1);
    burst(p, killView, true);
    // Total eclipse: a corona of eight alternating long/short rays blooms in the plane facing the shooter,
    // a gold and a violet shockwave roll across the floor, and solar embers drift up and hang.
    kr.subVectors(killView, p).normalize(); ku.crossVectors(UPV, kr);
    if (ku.lengthSq() < .0001) ku.set(1, 0, 0); ku.normalize(); kr.cross(ku).normalize();   // ku = screen-right, kr = screen-up
    var rays = low ? 4 : 8;
    for (var k = 0; k < rays; k++) {
      var an = k * (Math.PI * 2 / rays) + .2, len = (k % 2 ? .4 : .66), cs = Math.cos(an) * len, sn = Math.sin(an) * len;
      killEnd.set(p.x + ku.x * cs + kr.x * sn, p.y + ku.y * cs + kr.y * sn, p.z + ku.z * cs + kr.z * sn);
      spawn(p, killEnd, { ttl: .24 + (k % 2 ? 0 : .06), amp: .85, w: .09 });
    }
    flatRing(p, 10, 0xffc060);
    if (!low) {
      flatRing(p, 15, 0xa066ff);
      sparkDirty = true; sparks.visible = true;
      for (var e = 0; e < 22; e++) {
        var ei = sNext; sNext = (sNext + 1) % NS;
        var ang = Math.random() * 6.283, rad = .15 + Math.random() * .35;
        sp[ei * 3] = p.x + Math.cos(ang) * rad; sp[ei * 3 + 1] = p.y + Math.random() * .4; sp[ei * 3 + 2] = p.z + Math.sin(ang) * rad;
        sv[ei * 3] = -Math.sin(ang) * .9; sv[ei * 3 + 1] = 1.2 + Math.random() * 2; sv[ei * 3 + 2] = Math.cos(ang) * .9;
        sl[ei] = sm[ei] = .7 + Math.random() * .8;
      }
    }
  }
  function tick(dt) {
    clock += dt; UT.value = clock; var i;
    for (i = 0; i < NB; i++) {
      var b = beams[i]; if (!b.g.visible) continue; b.t += dt; var u = b.t / b.ttl;
      if (u >= 1) { b.g.visible = false; continue; }
      b.U.uHead.value = Math.min(1.4, u * 2.4 - .1); b.U.uAlpha.value = (1 - u * u) * Math.min(1, b.amp);
    }
    if (sparkDirty) { var anyLive = false; for (i = 0; i < NS; i++) {
      if (sl[i] <= 0) { sp[i * 3 + 1] = -999; continue; } anyLive = true;
      sl[i] -= dt; var f = Math.max(0, sl[i] / sm[i]);
      sv[i * 3 + 1] -= 9.8 * dt; sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      sc[i * 3] = f; sc[i * 3 + 1] = f * (.35 + .5 * f); sc[i * 3 + 2] = f * .12;
    }
    sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; if (!anyLive) { sparkDirty = false; sparks.visible = false; } }
    for (i = 0; i < NR; i++) {
      var r = rings[i]; if (!r.m.visible) continue; r.t += dt / .35;
      if (r.t >= 1) { r.m.visible = false; continue; }
      var sc2 = 1 + r.t * r.k; r.m.scale.set(sc2, sc2, 1); r.m.material.opacity = (1 - r.t) * (1 - r.t) * .85;
    }
    if (flash.visible) { flashT += dt / .16; if (flashT >= 1) flash.visible = false; else { var fs = .55 + flashT * .9; flash.scale.set(fs, fs, 1); fMat.opacity = (1 - flashT) * .9; } }
  }
  return { spawn: spawn, burst: burst, eliminate: eliminate, tick: tick, setLow: function (v) { low = !!v; } };
}

/* ------------------------------------------------------------------ audio (Float32Array generators) */
function prng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; }; }
function norm(d, peak) { var m = 0, i; for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > m) m = a; } if (m > 0) { var k = peak / m; for (i = 0; i < d.length; i++) d[i] *= k; } return d; }
var TAU = Math.PI * 2;
var LA = global.SightlineLegendaryAudio;
function chirp(c, f0, f1, dur) { return Math.sin(TAU * (f0 * c + (f1 - f0) * c * c / (2 * dur))); }   // closed-form linear sweep, c in [0,dur]
function bell(t, f, dec) { return t > 0 ? (Math.sin(TAU * f * t) + .4 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * dec * .6)) * Math.exp(-t * dec) : 0; }   // gold bell: fundamental + inharmonic partial
function equipSound(sr) {   // 1.5 s "awakening": core hum + octave, corona wind, choir shimmer with rising solar whine (peak 0.6-0.8 s), gold bell strike + thump
  var n = Math.floor(sr * 1.5), d = new Float32Array(n), r = prng(7), lp = 0, i, f;
  for (i = 0; i < n; i++) {
    var t = i / sr, sw = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.5)), 1.5), nz = r();
    var v = Math.sin(TAU * (46 * t + 16 * t * t)) * sw * .4 + Math.sin(TAU * (92 * t + 32 * t * t)) * sw * .2;
    lp += (nz - lp) * (.03 + .5 * t / 1.5); v += lp * Math.exp(-Math.pow((t - .5) / .38, 2)) * 1.7;
    var g = Math.exp(-Math.pow((t - .68) / .26, 2));
    for (f = 1; f <= 4; f++) v += Math.sin(TAU * 330 * (1 + f * .5) * t + 3 * Math.sin(TAU * 5.5 * t)) * .075 * g;
    v += Math.sin(TAU * (400 * t + 900 * t * t)) * g * .14;
    var c = t - .92;
    if (c > 0) v += (bell(c, 1760, 6) + .6 * bell(c, 2637, 7) + .4 * bell(c, 3520, 8)) * .34 + nz * Math.exp(-c * 90) * .4 + Math.sin(TAU * (110 - 50 * Math.min(c, 1)) * c) * Math.exp(-c * 9) * .5;
    d[i] = v;
  }
  LA.verb(d, sr, .5);
  return LA.finishCue(d, sr, { hp: 60, eq: [[1200, .8, 3], [3200, .9, 3]], drive: 1.5, peak: .85 });
}
function rearmSound(sr) {   // 0.55 s: instant gold-bell snap (so the 0-0.16 s slice already hits), rising charge sweep, second bell
  var n = Math.floor(sr * .55), d = new Float32Array(n), r = prng(11), i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r();
    var v = nz * Math.exp(-t * 170) * .55 + bell(t, 1320, 13) * .38 + Math.sin(TAU * (160 - 80 * Math.min(1, t * 8)) * t) * Math.exp(-t * 13) * .45;
    var up = t > .03 && t < .3 ? Math.sin(Math.PI * (t - .03) / .27) : 0;
    v += (Math.sin(TAU * (380 * t + 2200 * t * t)) + .3 * Math.sin(TAU * (760 * t + 4400 * t * t))) * up * .22;
    var c = t - .2; if (c > 0) v += nz * Math.exp(-c * 200) * .5 + bell(c, 1980, 11) * .34 + Math.sin(TAU * 120 * c) * Math.exp(-c * 14) * .35;
    d[i] = v;
  }
  LA.verb(d, sr, .4);
  return LA.finishCue(d, sr, { hp: 80, eq: [[1500, .8, 3], [3600, .9, 3.5]], drive: 1.7, peak: .85 });
}
function mixShot(sr, base) {   // game report underneath + crack, descending solar zing, thump, gold ring, sizzle tail
  var n = Math.max(base ? base.length : 0, Math.floor(sr * .7)), d = new Float32Array(n), r = prng(23), lp = 0, lp2 = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(), v = (base && i < base.length ? base[i] * .75 : 0);
    lp += (nz - lp) * .4;
    v += nz * Math.exp(-t * 150) * .55;
    var c = t - .003; if (c > 0 && c < .09) v += chirp(c, 5200, 1000, .09) * Math.exp(-c * 20) * .26;
    v += Math.sin(TAU * (118 * t - 55 * t * t)) * Math.exp(-t * 13) * .7 + Math.sin(TAU * (64 * t)) * Math.exp(-t * 10) * .12;
    v += (bell(t, 1480, 9) * .2 + bell(t, 2220, 12) * .12);
    v += (nz - lp) * (Math.sin(TAU * 38 * t) > .1 ? 1 : .3) * Math.exp(-t * 8) * .2;
    lp2 += (nz - lp2) * .04; v += lp2 * Math.min(1, t * 25) * Math.exp(-t * 7) * .8;
    d[i] = v;
  }
  LA.verb(d, sr, .55);
  return LA.finishCue(d, sr, { hp: 45, lp: 11000, eq: [[1000, .8, 2], [2400, .9, 3], [5000, .9, 2]], drive: 1.7, peak: .92 });
}

/* ------------------------------------------------------------------ picker card styling */
var styled = false;
function decorate(btn, f, selected) {
  if (!styled && document.head) {
    var st = document.createElement('style');
    st.textContent = '@keyframes heliosSpin{to{transform:rotate(360deg)}}@keyframes heliosGlow{0%,100%{box-shadow:0 0 6px #ff9a2a55,inset 0 0 8px #7a3cff22}50%{box-shadow:0 0 16px #ffb22ecc,inset 0 0 14px #7a3cff55}}' +
      '.helios-card{background:linear-gradient(135deg,#0c0a13,#241632 55%,#3b2410)!important;border:1px solid #ffb22e!important;animation:heliosGlow 2.6s ease-in-out infinite;position:relative;overflow:hidden}' +
      '.helios-card .helios-sun{position:absolute;right:-12px;top:-12px;width:48px;height:48px;border-radius:50%;background:radial-gradient(circle,#05040a 0 42%,#ffd27a 46%,#ff8a1e 56%,#ff8a1e00 72%);animation:heliosSpin 9s linear infinite;opacity:.9}' +
      '.helios-tag{display:inline-block;margin-top:5px;padding:1px 6px;font:700 9px system-ui;letter-spacing:1.5px;color:#1a0f00;background:linear-gradient(90deg,#ffd27a,#ff9a2a);border-radius:3px}';
    document.head.appendChild(st); styled = true;
  }
  btn.classList.add('helios-card'); btn.style.color = '#fff3dc';
  var sun = document.createElement('span'); sun.className = 'helios-sun'; btn.appendChild(sun);
  var tag = document.createElement('span'); tag.className = 'helios-tag'; tag.textContent = 'LEGENDARY'; btn.appendChild(document.createElement('br')); btn.appendChild(tag);
}

function reloadSound(sr) {   // 0.85 s capacitor power-down: hard clack, falling whine with mid body, three gold ticks
  var n = Math.floor(sr * .85), d = new Float32Array(n), r = prng(31), ph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); ph += TAU * (320 + 2400 * Math.exp(-4.5 * t)) / sr;
    var v = nz * Math.exp(-t * 200) * .65 + Math.sin(TAU * 420 * t) * Math.exp(-t * 50) * .45 + (Math.sin(ph) + .35 * Math.sin(ph * 2)) * Math.exp(-3 * t) * .22 + Math.sin(TAU * (140 - 55 * Math.min(1, t * 6)) * t) * Math.exp(-t * 13) * .55;
    [.05, .19, .33].forEach(function (c, k) { var tt = t - c; if (tt > 0) v += nz * Math.exp(-tt * 260) * .4 + bell(tt, 1320 + k * 330, 16) * .22; });
    d[i] = v;
  }
  return LA.finishCue(d, sr, { hp: 90, lp: 9000, eq: [[900, .8, 3], [2600, .9, 2]], drive: 1.8, peak: .85 });
}
function hitSound(sr) {   // 0.3 s gold crack: hp-noise snap, zap, gold ring, body thump (no sub-bass wash)
  var n = Math.floor(sr * .3), d = new Float32Array(n), r = prng(33), lp = 0, ph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); lp += (nz - lp) * .25; ph += TAU * (160 + 300 * Math.exp(-t * 30)) / sr;
    var v = (nz - lp) * Math.exp(-t * 130) * .8 + (t < .07 ? chirp(t, 5000, 1200, .07) * Math.exp(-t * 24) * .4 : 0) + Math.sin(ph) * Math.exp(-t * 20) * .55;
    v += bell(t, 1250, 16) * .3 + bell(t, 1930, 20) * .2 + Math.sin(TAU * 3100 * t) * Math.exp(-t * 28) * .12;
    d[i] = v;
  }
  LA.verb(d, sr, .3);
  return LA.finishCue(d, sr, { hp: 140, eq: [[1800, .8, 4], [3800, .9, 3]], drive: 2.2, peak: .9 });
}
function killSound(sr) {   // 0.7 s solar flare: crack, big falling zing, thump, warm corona swell, rising gold-bell cascade
  var n = Math.floor(sr * .7), d = new Float32Array(n), r = prng(37), lp2 = 0, i, k;
  var fr = [1568, 2093, 2637, 3136, 4186];
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r();
    var v = nz * Math.exp(-t * 80) * .6 + (t < .18 ? chirp(t, 6200, 420, .18) * Math.exp(-t * 13) * .5 : 0);
    v += Math.sin(TAU * (92 * t - 34 * t * t)) * Math.exp(-t * 7) * 1.0;
    lp2 += (nz - lp2) * .04; v += lp2 * Math.min(1, t * 40) * Math.exp(-Math.pow((t - .16) / .2, 2)) * 2.6;
    for (k = 0; k < 5; k++) v += bell(t - .06 - k * .05, fr[k], 7) * (.2 - k * .015);
    d[i] = v;
  }
  LA.verb(d, sr, .55);
  return LA.finishCue(d, sr, { hp: 45, lp: 10000, eq: [[1400, .8, 2], [3600, .9, 2.5]], drive: 1.4, peak: .95 });
}

global.SightlineEclipse = {
  version: 'G3.0-eclipse', weapon: 'ranger', finish: FINISH, anchors: ANCHOR, hasEliminationFx: true,
  buildRig: buildRig, createFx: createFx, decorate: decorate,
  equipSound: LA.memo(equipSound), rearmSound: LA.memo(rearmSound), reloadSound: LA.memo(reloadSound), hitSound: LA.memo(hitSound), mixShot: LA.memoBase(mixShot), killSound: LA.memo(killSound)
};
})(window);

/* ---- legendary-prism.js ---- */
/* Sightline legendary finish: PRISMATIC AURORA  (Tideglass DMR)
   Original design. Cosmetic only: no damage, ammo, recoil, hit or network behaviour is touched.

   What it adds
     - Black crystal-glass body with thin-film iridescence: facet-shifted spectral colour that changes
       with viewing angle (one shader patched into the gun's own Phong materials, gun-space pattern),
       a diagonal light glint that sweeps stock->muzzle, and a rainbow shot-wave.
     - A spinning prism-star around the scope objective, six floating crystal shards orbiting the scope
       (contract + spin on fire, fold in on reload, burst out on rearm), spectral light-strips on both
       handguard flanks, twinkling glint dust.
     - Shot: chromatic-split tracer (three offset helix strands + light-splitting head), prism flare and
       triangle shock rings, impact = shattered-glass sparks in every hue + prism flash.
     - Equip "aurora" sweep, reload dim/recharge, rearm chime arpeggio, all audio synthesised.
   Contract (same as the other legendaries):
     finish, weapon, buildRig(THREE), createFx(THREE, scene), decorate(btn,f,sel), equipSound/rearmSound/mixShot */
(function (global) {
'use strict';

var FINISH = {
  name: 'Prismatic Aurora', legendary: true, legendKind: 'prism',
  metal: 0x10131c, polymer: 0x07080d, trim: 0xb9d4ff,
  desc: 'LEGENDARY · iridescent crystal glass, orbiting prism shards, light-splitting tracers'
};

/* ------------------------------------------------------------------ shaders */
var GLSL_COMMON = 'uniform float uT,uPulse,uHeat,uAwake,uDim,uGain,uLow;\nvarying vec3 vEcl;\n';
var GLSL_FRAG_FUNCS =
  'float eH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\n' +
  'vec3 eP(float h){return .5+.5*cos(6.2832*(h+vec3(0.,.33,.67)));}\n';

var SURF_OLD = '{\n float t=vEcl.y;\n vec3 q=vEcl*vec3(46.,46.,16.); vec3 f=abs(fract(q)-.5); float ln=smoothstep(.46,.5,max(f.y,f.z)); diffuseColor.rgb*=1.-ln*.5;\n diffuseColor.rgb=mix(diffuseColor.rgb*.64,diffuseColor.rgb*1.2,smoothstep(-.012,.014,t));\n float inl=smoothstep(.0025,.0,abs(t-.0105))+smoothstep(.0022,.0,abs(t+.0085));\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.85,.92,1.)*.9,clamp(inl,0.,1.)*.9);\n float sc=step(.96,fract(sin(floor(vEcl.z*70.)*12.9+floor(vEcl.y*70.)*78.2)*437.5)); diffuseColor.rgb*=1.-sc*.3;\n}\n';
var GLSL_EMISSIVE =
  '{\n' +
  ' float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.4);\n' +
  ' vec3 fp3=vec3(vEcl.x*.8+vEcl.y*.6,vEcl.y*.8-vEcl.x*.6,vEcl.z+vEcl.y*.5)*vec3(34.,34.,20.); float fct=eH(floor(fp3));\n' +
  ' float hue=fres*1.3+vEcl.z*2.6+vEcl.y*2.2+fct*.1+uT*.05+normal.x*.8+sin(vEcl.z*7.+vEcl.y*9.)*.18;\n' +
  ' vec3 irid=pow(eP(hue),vec3(1.7));\n' +
  ' float edge=0.;\n' +
  ' if(uLow<.5){vec3 fq=fract(fp3); vec3 dd=min(fq,1.-fq); edge=smoothstep(.03,0.,min(dd.x,min(dd.y,dd.z)));}\n' +
  ' float breath=.78+.22*sin(uT*1.3+fct*6.28);\n' +
  ' float travel=fract(uT*.4); float glint=exp(-pow((vEcl.z*.8+vEcl.y*1.2)-(.6-travel*1.5),2.)*420.);\n' +
  ' float waveP=exp(-pow((vEcl.z-(.5-uPulse*1.5))*9.,2.))*step(0.,uPulse);\n' +
  ' float waveA=exp(-pow((vEcl.z-(.5-uAwake*1.6))*6.,2.))*step(0.,uAwake);\n' +
  ' float live=1.-uDim;\n' +
  ' float k=(fres*1.15+.05)*(.94+.12*fct)*breath*live+edge*.1*(.25+fres)*live+glint*.9*live+(waveP+waveA)*(.5+fres)+uHeat*(.2+fres*.6)*.4;\n' +
  ' vec3 col=mix(irid,eP(hue+vEcl.z*3.+uT*.5),clamp(waveP+waveA,0.,1.));\n' +
  ' col=mix(col,vec3(1.),clamp(glint*.3+(waveP+waveA)*.25,0.,1.));\n' +
  ' totalEmissiveRadiance+=col*k*.85*uGain;\n' +
  '}\n';

function patchMaterial(mat, U, gain) {
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uT = U.uT; sh.uniforms.uPulse = U.uPulse; sh.uniforms.uHeat = U.uHeat;
    sh.uniforms.uAwake = U.uAwake; sh.uniforms.uDim = U.uDim; sh.uniforms.uLow = U.uLow;
    sh.uniforms.uInv = U.uInv; sh.uniforms.uGain = { value: gain };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uInv;\nvarying vec3 vEcl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEcl=(uInv*modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_FRAG_FUNCS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURF_OLD)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_EMISSIVE);
  };
  mat.customProgramCacheKey = function () { return 'prismatic-aurora-v2'; };
  mat.needsUpdate = true;
  return mat;
}

/* ------------------------------------------------------------------ textures */
var texCache = {};
function canvasTex(T, key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  return (texCache[key] = new T.CanvasTexture(c));
}
function flareTex(T) {
  return canvasTex(T, 'prflare', 128, 128, function (g, w) {
    var h = w / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.14, 'rgba(225,235,255,.95)'); gr.addColorStop(.4, 'rgba(150,170,255,.3)'); gr.addColorStop(1, 'rgba(120,120,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.globalCompositeOperation = 'lighter';
    ['255,90,140', '90,255,170', '110,140,255'].forEach(function (c, i) {
      var a = i * Math.PI / 3, x = Math.cos(a) * h, y = Math.sin(a) * h;
      var l = g.createLinearGradient(h - x, h - y, h + x, h + y); l.addColorStop(0, 'rgba(' + c + ',0)'); l.addColorStop(.5, 'rgba(' + c + ',.75)'); l.addColorStop(1, 'rgba(' + c + ',0)');
      g.strokeStyle = l; g.lineWidth = 3; g.beginPath(); g.moveTo(h - x, h - y); g.lineTo(h + x, h + y); g.stroke();
    });
  });
}
function discTex(T) {
  return canvasTex(T, 'prdisc', 64, 64, function (g, w) {
    var h = w / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
/* spectral strip: rainbow gradient, soft top/bottom edges. Wraps, scrolled in update(). */
function spectrumTex(T) {
  if (texCache.spec) return texCache.spec;
  var t = canvasTex(T, 'spec', 256, 32, function (g, w, h) {
    var gr = g.createLinearGradient(0, 0, w, 0);
    for (var i = 0; i <= 6; i++) gr.addColorStop(i / 6, 'hsl(' + ((i % 6) * 60) + ',100%,62%)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    var v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,.85)'); v.addColorStop(.3, 'rgba(0,0,0,0)'); v.addColorStop(.7, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.85)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
  t.wrapS = T.RepeatWrapping; return t;
}

/* ------------------------------------------------------------------ the rig */
var ANCHOR = {
  muzzle: [0.0, 0.016, -0.76],
  scope: { x: 0.007, y: 0.115, zFront: -0.186, zRear: 0.124, r: 0.034 },
  strip: { x: 0.0252, y: 0.014, z0: -0.395, z1: -0.175 },
  shards: { n: 6, r: 0.075, y: 0.12, z: -0.03 },
  dust: { cx: 0.007, cy: 0.04, z0: 0.40, z1: -0.70 }
};

function buildRig(T) {
  var A = ANCHOR, group = new T.Group(); group.name = 'prismatic-aurora-rig';
  var U = { uT: { value: 0 }, uPulse: { value: -1 }, uHeat: { value: 0 }, uAwake: { value: -1 }, uDim: { value: 0 }, uLow: { value: 0 }, uInv: { value: new T.Matrix4() } };
  var S = { t: 0, pulse: -1, heat: 0, awake: -1, dim: 0, boost: 0, flare: 0, flash: 0, rf: 0, reloading: false, low: false, pendingRearm: false, rearmFx: 0, orbit: 1, burst: 0 };
  var add = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
  function basic(color, opacity, extra) { var o = { color: color, opacity: opacity }; for (var k in add) o[k] = add[k]; for (var e in (extra || {})) o[e] = extra[e]; return new T.MeshBasicMaterial(o); }
  var tmp = new T.Color();
  function hue(h, s, l, mat) { mat.color.setHSL(((h % 1) + 1) % 1, s, l); }

  /* --- prism star: two counter-rotating triangle rings at the scope objective ---------------- */
  var star = new T.Group(); star.position.set(A.scope.x, A.scope.y, A.scope.zFront - .004); group.add(star);
  var triA = new T.Mesh(new T.RingGeometry(A.scope.r + .004, A.scope.r + .0068, 3), basic(0xffffff, .9, { side: T.DoubleSide })); star.add(triA);
  var triB = new T.Mesh(new T.RingGeometry(A.scope.r + .004, A.scope.r + .0068, 3), basic(0xffffff, .9, { side: T.DoubleSide })); triB.rotation.z = Math.PI; star.add(triB);
  var rim = new T.Mesh(new T.TorusGeometry(A.scope.r - .002, .0009, 6, 48), basic(0xffffff, .7)); star.add(rim);
  var halo = new T.Mesh(new T.PlaneGeometry(.16, .16), basic(0xffffff, 0, { map: discTex(T) })); halo.position.z = -.004; star.add(halo);

  /* --- floating crystal shards ------------------------------------------------------------------ */
  var shardGeo = new T.OctahedronGeometry(.0085, 0); shardGeo.scale(.55, 1.5, .55);
  var shards = [];
  for (var i = 0; i < A.shards.n; i++) {
    var sm = basic(0xffffff, .85); var m = new T.Mesh(shardGeo, sm); group.add(m);
    var wf = new T.Mesh(shardGeo, basic(0xffffff, .5, { wireframe: true })); m.add(wf); wf.scale.setScalar(1.35);
    shards.push({ m: m, wf: wf, ph: i / A.shards.n, tilt: (i % 2 ? 1 : -1) * (.25 + .08 * i) });
  }

  /* --- spectral light strips on both handguard flanks ------------------------------------------ */
  var spec = spectrumTex(T), specMats = [];
  [-1, 1].forEach(function (side) {
    var sm = new T.MeshBasicMaterial({ map: spec, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .9, side: T.DoubleSide });
    var strip = new T.Mesh(new T.PlaneGeometry(A.strip.z1 - A.strip.z0, .0075), sm);
    strip.rotation.y = side * Math.PI / 2; strip.position.set(side * A.strip.x, A.strip.y, (A.strip.z0 + A.strip.z1) / 2); strip.scale.x = -1; group.add(strip); specMats.push(sm);
  });

  /* --- muzzle: prism flare + triangle shock rings ------------------------------------------------ */
  var mz = new T.Group(); mz.position.set(A.muzzle[0], A.muzzle[1], A.muzzle[2]); group.add(mz);
  var mzRing = new T.Mesh(new T.TorusGeometry(.0165, .0012, 6, 32), basic(0xffffff, 0)); mz.add(mzRing);
  var flare = new T.Mesh(new T.PlaneGeometry(.4, .4), basic(0xffffff, 0, { map: flareTex(T) })); flare.position.z = -.02; mz.add(flare);
  var shock = [];
  for (var r = 0; r < 3; r++) { var rm = new T.Mesh(new T.RingGeometry(.022, .03, 3), basic(0xffffff, 0, { side: T.DoubleSide })); rm.visible = false; mz.add(rm); shock.push({ m: rm, t: 9 }); }
  var shockNext = 0;

  /* --- glint dust: twinkling hue-cycling points, one draw call ----------------------------------- */
  var NE = 56, seeds = new Float32Array(NE * 4), pos = new Float32Array(NE * 3), rs = 777;
  function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
  for (var e = 0; e < NE; e++) { seeds[e * 4] = rnd(); seeds[e * 4 + 1] = rnd(); seeds[e * 4 + 2] = .5 + rnd() * 1.2; seeds[e * 4 + 3] = .4 + rnd() * .9; }
  var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(pos, 3)); eg.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  var emU = { uT: U.uT, uBoost: { value: 0 }, uScale: { value: 520 }, uZ0: { value: A.dust.z0 }, uZ1: { value: A.dust.z1 }, uC: { value: new T.Vector2(A.dust.cx, A.dust.cy) } };
  var emMat = new T.ShaderMaterial({
    uniforms: emU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader:
      'attribute vec4 aSeed; uniform float uT,uBoost,uScale,uZ0,uZ1; uniform vec2 uC; varying float vA; varying float vH;\n' +
      'void main(){ float u=fract(aSeed.y*13.+uT*.02*aSeed.z); float ang=uT*.35*aSeed.z+aSeed.x*6.2832;\n' +
      ' float rad=(.05+.09*aSeed.y)*(1.+uBoost*.5);\n' +
      ' vec3 p=vec3(uC.x+cos(ang)*rad, uC.y+sin(ang)*rad*.7+sin(uT*.6+aSeed.x*20.)*.015, mix(uZ0,uZ1,u));\n' +
      ' vA=pow(.5+.5*sin(uT*(2.+aSeed.z*3.)+aSeed.x*40.),3.); vH=fract(aSeed.x+uT*.08); vec4 mv=modelViewMatrix*vec4(p,1.);\n' +
      ' gl_PointSize=clamp(aSeed.w*.015*uScale*(1.+uBoost*.8)/max(.05,-mv.z),1.,60.); gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'varying float vA; varying float vH;\n' +
      'void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); float a=smoothstep(.5,0.,d); a*=a;\n' +
      ' float cr=max(0.,1.-abs(c.x)*9.)*max(0.,1.-abs(c.y)*1.4)+max(0.,1.-abs(c.y)*9.)*max(0.,1.-abs(c.x)*1.4);\n' +
      ' vec3 col=.5+.5*cos(6.2832*(vH+vec3(0.,.33,.67))); col=mix(col,vec3(1.),smoothstep(.2,0.,d)); gl_FragColor=vec4(col,(a+cr*.6)*vA); }'
  });
  var dust = new T.Points(eg, emMat); dust.frustumCulled = false; group.add(dust);

  /* ---------------- state machine ---------------- */
  var mats = {};
  function dress(g, on) {
    if (!on) return;
    group.updateWorldMatrix(true, false);
    g.traverse(function (mesh) {
      if (!mesh.isMesh || !mesh.userData.finishBase || mesh.userData.finishBadge) return;
      var base = mesh.userData.finishBase, c = base.color, b = (c.r + c.g + c.b) / 3;
      if (b < .004 || base.transparent) return;            // bright (white/textured) parts are included on purpose: the Tideglass stock and handguard are near-white
      var m = mats[base.uuid];
      if (!m) {
        var metal = b > .05;
        m = new T.MeshPhongMaterial({
          color: metal ? 0x0c0f18 : 0x06070b, specular: metal ? 0x2c3346 : 0x151826, shininess: metal ? 110 : 50,
          bumpMap: base.bumpMap || null, bumpScale: base.bumpScale || 1
          /* no envMap on purpose: the game's bright sky cube turns dark glass chalky grey; the look comes from the emissive iridescence */
        });
        patchMaterial(m, U, metal ? 1 : .7); mats[base.uuid] = m;
      }
      mesh.material = m;
    });
  }
  function fire() {
    S.pulse = 0; S.boost = 1; S.flare = 1; S.heat = Math.min(1, S.heat + .22);
    var sh = shock[shockNext]; shockNext = (shockNext + 1) % 3; sh.t = 0; sh.m.visible = !S.low;
  }
  function awaken() { S.awake = 0; S.flash = 1; S.boost = Math.max(S.boost, .9); S.burst = 1; }
  function rearm() { S.rearmFx = 1; S.pulse = 0; S.boost = Math.max(S.boost, .8); S.flash = Math.max(S.flash, .7); S.burst = 1; }
  function setReload(rf, is) { if (!S.reloading && is) S.pendingReload = true; if (S.reloading && !is) { S.pendingRearm = true; rearm(); } S.reloading = !!is; S.rf = rf || 0; }
  function setDetail(level) {
    var low = level === 'low'; if (low === S.low) return; S.low = low; U.uLow.value = low ? 1 : 0; eg.setDrawRange(0, low ? 20 : NE);
    for (var i = 0; i < shards.length; i++) { shards[i].m.visible = !low || i < 3; shards[i].wf.visible = !low; }
    halo.visible = !low; triB.visible = !low;
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function update(dt, o) {
    if (!group.visible || (group.parent && !group.parent.visible)) return;
    if (dt > .1) dt = .1; S.t += dt; U.uT.value = S.t; var t = S.t;
    var dimT = S.reloading ? (S.rf < .72 ? .86 : .86 * (1 - clamp01((S.rf - .72) / .28))) : 0;
    S.dim += (dimT - S.dim) * Math.min(1, dt * 7); U.uDim.value = S.dim;
    if (S.pulse >= 0) { S.pulse += dt / .36; if (S.pulse > 1.15) S.pulse = -1; } U.uPulse.value = S.pulse;
    if (S.awake >= 0) { S.awake += dt / 1.2; if (S.awake > 1.15) S.awake = -1; } U.uAwake.value = S.awake;
    S.heat = Math.max(0, S.heat - dt * .32); U.uHeat.value = S.heat;
    S.boost = Math.max(0, S.boost - dt * 1.3); emU.uBoost.value = S.boost;
    S.flash = Math.max(0, S.flash - dt * 1.1); S.flare = Math.max(0, S.flare - dt * 7.5); S.rearmFx = Math.max(0, S.rearmFx - dt * 2.8); S.burst = Math.max(0, S.burst - dt * 2.2);
    U.uInv.value.copy(group.matrixWorld).invert();
    emU.uScale.value = (global.innerHeight || 600) * .87;
    var live = 1 - S.dim * .8, fl = S.flash;
    // prism star
    var sp = 1 - S.dim * .9; triA.rotation.z += dt * (.7 * sp + S.boost * 4 + fl * 3); triB.rotation.z -= dt * (.9 * sp + S.boost * 3);
    var ps = (1 + fl * .45 + S.boost * .14) * (1 - S.dim * .2); star.scale.set(ps, ps, 1);
    hue(t * .12, 1, .62, triA.material); hue(t * .12 + .5, 1, .62, triB.material); hue(t * .12 + .25, 1, .7, rim.material);
    triA.material.opacity = Math.min(1, (.55 + .3 * Math.sin(t * 2.4)) * live + fl * .5 + S.boost * .3); triB.material.opacity = triA.material.opacity * .85;
    rim.material.opacity = .45 * live + S.boost * .3; halo.material.opacity = Math.min(.5, fl * .45 + S.boost * .2); halo.visible = halo.material.opacity > .01 && !S.low; hue(t * .12 + .1, 1, .6, halo.material);
    // shards: orbit the scope; fire = spin faster + tighten, reload = fold in, rearm/awaken = burst outward
    var orbT = S.reloading ? .45 : 1; S.orbit += (orbT - S.orbit) * Math.min(1, dt * 6);
    var rad = A.shards.r * (S.orbit * (1 + S.burst * .9) - S.boost * .18);
    for (var i = 0; i < shards.length; i++) {
      var sd = shards[i]; sd.m.material.color.setHSL((i / shards.length + t * .06) % 1, 1, .6); sd.wf.material.color.setHSL((i / shards.length + t * .06 + .08) % 1, 1, .72); var a = (sd.ph * 6.2832) + t * (.6 + S.boost * 3.2 + fl * 2);
      sd.m.position.set(A.scope.x + Math.cos(a) * rad, A.shards.y + Math.sin(a) * rad * .55 + Math.sin(t * 1.3 + i) * .006, A.shards.z + Math.sin(a * .5 + i) * .12 * (S.orbit) + (i - 2.5) * .01);
      sd.m.rotation.set(t * 1.4 + i, t * 2 + sd.tilt, 0);
      hue(t * .1 + sd.ph, 1, .65, sd.m.material); hue(t * .1 + sd.ph + .15, .9, .8, sd.wf.material);
      sd.m.material.opacity = Math.min(1, (.6 + .3 * Math.sin(t * 3 + i * 2)) * live + S.boost * .3 + fl * .3);
      sd.wf.material.opacity = .4 * live + S.boost * .3;
      var sc = 1 + S.boost * .5 + S.burst * .6; sd.m.scale.setScalar(sc);
    }
    // spectral strips scroll; brighten on fire
    spec.offset.x = (spec.offset.x + dt * (.12 + S.boost * 1.2 + S.heat * .3)) % 1;
    for (var k = 0; k < specMats.length; k++) specMats[k].opacity = Math.min(1, (.35 + .25 * Math.sin(t * 1.6)) * live + S.boost * .5 + S.heat * .3 + fl * .4);
    // muzzle
    hue(t * .2, 1, .7, mzRing.material); mzRing.material.opacity = S.flare * .9 + S.heat * .25 * live; mzRing.visible = mzRing.material.opacity > .01;
    var fs = .24 + S.flare * .7; flare.scale.set(fs, fs, 1); flare.material.opacity = S.flare; flare.visible = S.flare > .01; flare.rotation.z += dt * 1.8;
    for (var z = 0; z < shock.length; z++) {
      var sh = shock[z]; if (!sh.m.visible) continue; sh.t += dt / .3;
      if (sh.t >= 1) { sh.m.visible = false; continue; }
      var q = 1 + sh.t * 7; sh.m.scale.set(q, q, 1); sh.m.rotation.z = sh.t * 1.5; hue(t * .3 + z * .33 + sh.t * .4, 1, .65, sh.m.material); var inv = 1 - sh.t; sh.m.material.opacity = inv * inv * .9;
    }
  }
  function takeReload() { var p = S.pendingReload; S.pendingReload = false; return p; }
  function takeRearm() { var p = S.pendingRearm; S.pendingRearm = false; return p; }
  return {
    kind: 'prism', group: group, update: update, fire: fire, awaken: awaken, rearm: rearm,
    setReload: setReload, setDetail: setDetail, dress: dress, takeRearm: takeRearm, takeReload: takeReload, state: S, uniforms: U,
    dispose: function () { group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  };
}

/* ------------------------------------------------------------------ world effects */
function createFx(T, scene) {
  var NB = 12, beams = [], UT = { value: 0 }, clock = 0;
  var bvs = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
  var bfs =
    'varying vec2 vUv; uniform float uHead,uAlpha,uLen,uT;\n' +
    'vec3 eP(float h){return .5+.5*cos(6.2832*(h+vec3(0.,.33,.67)));}\n' +
    'void main(){ float x=vUv.x, y=(vUv.y-.5)*2.; float L=uLen;\n' +
    ' float d=x-uHead; float tail=smoothstep(-.45,0.,d)*step(d,0.); float head=exp(-d*d*1500.);\n' +
    ' float fade=smoothstep(0.,.02,x)*uAlpha;\n' +
    ' float core=exp(-y*y*34.); float body=exp(-y*y*5.);\n' +
    ' float sp=.2+.55*smoothstep(-.5,0.,d)*(1.-smoothstep(0.,.5,d));   // light splits as it travels\n' +
    ' float w1=sin(x*L*1.6-uT*36.)*.48, w2=sin(x*L*1.6-uT*36.+2.094)*.48, w3=sin(x*L*1.6-uT*36.+4.188)*.48;\n' +
    ' float s1=exp(-pow((y-w1)*9.,2.)), s2=exp(-pow((y-w2)*9.,2.)), s3=exp(-pow((y-w3)*9.,2.));\n' +
    ' vec3 c1=vec3(1.,.2,.45), c2=vec3(.25,1.,.55), c3=vec3(.3,.5,1.);\n' +
    ' vec3 col=vec3(.95,.97,1.)*core*(.45+tail*1.2+head*1.7)+(c1*s1+c2*s2+c3*s3)*(tail*.9+head)+eP(x*L*.04-uT*1.5)*body*.18*tail*uAlpha;\n' +
    ' float a=(core*(.45+tail+head)+(s1+s2+s3)*tail+body*.1*tail)*fade; gl_FragColor=vec4(col*fade,clamp(a,0.,1.)); }';
  var planeGeo = new T.PlaneGeometry(1, 1);
  for (var i = 0; i < NB; i++) {
    var U = { uHead: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 1 }, uT: UT };
    var mat = new T.ShaderMaterial({ uniforms: U, vertexShader: bvs, fragmentShader: bfs, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    var g = new T.Group(), p1 = new T.Mesh(planeGeo, mat), p2 = new T.Mesh(planeGeo, mat); p2.rotation.x = Math.PI / 2;
    g.add(p1, p2); g.visible = false; g.frustumCulled = false; p1.frustumCulled = p2.frustumCulled = false; scene.add(g);
    beams.push({ g: g, U: U, t: 9, ttl: .24, amp: 1 });
  }
  var nextBeam = 0, dir = new T.Vector3(), mid = new T.Vector3(), xAxis = new T.Vector3(1, 0, 0), qa = new T.Quaternion(), col = new T.Color();
  var NS = 80, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sh0 = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sl = new Float32Array(NS), sm = new Float32Array(NS);
  var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('color', new T.BufferAttribute(sc, 3));
  var sMat = new T.PointsMaterial({ size: .085, vertexColors: true, map: discTex(T), sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  var sparks = new T.Points(sg, sMat); sparks.frustumCulled = false; scene.add(sparks); sparks.visible = false; var sparkDirty = false;
  for (var s = 0; s < NS; s++) sp[s * 3 + 1] = -999;
  var sNext = 0, NR = 5, rings = [], killEnd = new T.Vector3(), killView = new T.Vector3(), kr = new T.Vector3(), ku = new T.Vector3(), UPV = new T.Vector3(0, 1, 0);
  for (var r = 0; r < NR; r++) {
    var rm = new T.Mesh(new T.RingGeometry(.1, .135, 3), new T.MeshBasicMaterial({ color: 0xffffff, opacity: 0, side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    rm.visible = false; scene.add(rm); rings.push({ m: rm, t: 9, k: 6 });
  }
  var rNext = 0, fMat = new T.SpriteMaterial({ map: flareTex(T), color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
  var flash = new T.Sprite(fMat); flash.visible = false; scene.add(flash); var flashT = 9, low = false, hueSeed = 0;
  function spawn(a, end, o) {
    o = o || {}; var b = beams[nextBeam]; nextBeam = (nextBeam + 1) % NB;
    dir.subVectors(end, a); var L = dir.length(); if (L < .05) return; dir.multiplyScalar(1 / L);
    mid.addVectors(a, end).multiplyScalar(.5); b.g.position.copy(mid); qa.setFromUnitVectors(xAxis, dir); b.g.quaternion.copy(qa);
    var w = o.w || (o.amp ? .09 : .2); b.g.children[0].scale.set(L, w, 1); b.g.children[1].scale.set(L, w, 1);
    b.U.uLen.value = Math.min(L, 60); b.ttl = o.ttl || .24; b.t = 0; b.g.visible = true; b.amp = o.amp || 1;
  }
  function burst(p, from, big) { sparkDirty = true; sparks.visible = true;
    var n = low ? 8 : (big ? 22 : 12), k; dir.subVectors(from, p).normalize(); hueSeed = (hueSeed + .17) % 1;
    for (k = 0; k < n; k++) {
      var i = sNext; sNext = (sNext + 1) % NS;
      sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
      var v = 1.5 + Math.random() * 5.5;
      sv[i * 3] = (dir.x * .8 + (Math.random() - .5) * 1.7) * v; sv[i * 3 + 1] = (dir.y * .8 + Math.random() * 1.2) * v; sv[i * 3 + 2] = (dir.z * .8 + (Math.random() - .5) * 1.7) * v;
      sl[i] = sm[i] = .4 + Math.random() * .6;
      col.setHSL((hueSeed + k / n) % 1, 1, .6); sh0[i * 3] = col.r; sh0[i * 3 + 1] = col.g; sh0[i * 3 + 2] = col.b;   // each shard keeps one hue: a spectrum shatters out
    }
    var ring = rings[rNext]; rNext = (rNext + 1) % NR; ring.t = 0; ring.k = 6; ring.m.visible = true; ring.m.position.copy(p).addScaledVector(dir, .02); ring.m.lookAt(from);
    ring.m.material.color.setHSL(hueSeed, 1, .65);
    flash.position.copy(p).addScaledVector(dir, .05); flashT = 0; flash.visible = true;
  }
  function flatRing(p, k, hue) {
    var fr = rings[rNext]; rNext = (rNext + 1) % NR; fr.t = 0; fr.k = k; fr.m.material.color.setHSL(hue, 1, .65); fr.m.visible = true; fr.m.position.set(p.x, p.y + .03, p.z); fr.m.rotation.set(-Math.PI / 2, 0, 0);
  }
  function eliminate(p, from) {
    killView.copy(from || killEnd.set(p.x, p.y + 1, p.z + 1));
    if (killView.distanceToSquared(p) < .01) killView.set(p.x, p.y + 1, p.z + 1);
    burst(p, killView, true);
    // Spectrum split: a crown of light fans upward from the target as if a prism had split it, two triangular shockwaves
    // in different hues roll across the floor, and a second wave of hue-shifted shards hangs and falls slowly.
    kr.subVectors(killView, p).normalize(); ku.crossVectors(UPV, kr);
    if (ku.lengthSq() < .0001) ku.set(1, 0, 0); ku.normalize(); kr.cross(ku).normalize();   // ku = screen-right, kr = screen-up
    var rays = low ? 3 : 7;
    for (var k = 0; k < rays; k++) {
      var an = Math.PI * (.12 + .76 * k / (rays - 1)), len = (k % 2 ? .45 : .7), cs = Math.cos(an) * len, sn = Math.sin(an) * len;
      killEnd.set(p.x + ku.x * cs + kr.x * sn, p.y + ku.y * cs + kr.y * sn, p.z + ku.z * cs + kr.z * sn);
      spawn(p, killEnd, { ttl: .22 + (k % 2 ? 0 : .06), amp: .85, w: .09 });
    }
    flatRing(p, 10, hueSeed);
    if (!low) {
      flatRing(p, 15, (hueSeed + .5) % 1);
      sparkDirty = true; sparks.visible = true;
      for (var e = 0; e < 24; e++) {
        var ei = sNext; sNext = (sNext + 1) % NS; var ang = Math.random() * 6.283, rad = .1 + Math.random() * .4;
        sp[ei * 3] = p.x + Math.cos(ang) * rad; sp[ei * 3 + 1] = p.y + Math.random() * .5; sp[ei * 3 + 2] = p.z + Math.sin(ang) * rad;
        sv[ei * 3] = Math.cos(ang) * 1.2; sv[ei * 3 + 1] = .8 + Math.random() * 2; sv[ei * 3 + 2] = Math.sin(ang) * 1.2;
        sl[ei] = sm[ei] = .7 + Math.random() * .8;
        col.setHSL((e / 24 + hueSeed) % 1, 1, .62); sh0[ei * 3] = col.r; sh0[ei * 3 + 1] = col.g; sh0[ei * 3 + 2] = col.b;
      }
    }
  }
  function tick(dt) {
    clock += dt; UT.value = clock; var i;
    for (i = 0; i < NB; i++) { var b = beams[i]; if (!b.g.visible) continue; b.t += dt; var u = b.t / b.ttl; if (u >= 1) { b.g.visible = false; continue; } b.U.uHead.value = Math.min(1.4, u * 2.4 - .1); b.U.uAlpha.value = (1 - u * u) * Math.min(1, b.amp); }
    if (sparkDirty) { var anyLive = false; for (i = 0; i < NS; i++) {
      if (sl[i] <= 0) { sp[i * 3 + 1] = -999; continue; } anyLive = true;
      sl[i] -= dt; var f = Math.max(0, sl[i] / sm[i]);
      sv[i * 3 + 1] -= 7 * dt; sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      sc[i * 3] = sh0[i * 3] * f; sc[i * 3 + 1] = sh0[i * 3 + 1] * f; sc[i * 3 + 2] = sh0[i * 3 + 2] * f;
    }
    sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; if (!anyLive) { sparkDirty = false; sparks.visible = false; } }
    for (i = 0; i < NR; i++) { var r = rings[i]; if (!r.m.visible) continue; r.t += dt / .32; if (r.t >= 1) { r.m.visible = false; continue; } var k2 = 1 + r.t * r.k; r.m.scale.set(k2, k2, 1); r.m.rotation.z = r.t * 1.4; r.m.material.opacity = (1 - r.t) * (1 - r.t) * .85; }
    if (flash.visible) { flashT += dt / .16; if (flashT >= 1) flash.visible = false; else { var fs = .5 + flashT * .9; flash.scale.set(fs, fs, 1); fMat.opacity = (1 - flashT) * .9; } }
  }
  return { spawn: spawn, burst: burst, eliminate: eliminate, tick: tick, setLow: function (v) { low = !!v; } };
}

/* ------------------------------------------------------------------ audio */
function prng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; }; }
function norm(d, peak) { var m = 0, i; for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > m) m = a; } if (m > 0) { var k = peak / m; for (i = 0; i < d.length; i++) d[i] *= k; } return d; }
var TAU = Math.PI * 2;
function glass(t, f, decay) { return (Math.sin(TAU * f * t) + .5 * Math.sin(TAU * f * 2.76 * t) + .25 * Math.sin(TAU * f * 5.4 * t)) * Math.exp(-decay * t); }
var LA = global.SightlineLegendaryAudio;
function chirp(c, f0, f1, dur) { return Math.sin(TAU * (f0 * c + (f1 - f0) * c * c / (2 * dur))); }   // closed-form linear sweep, c in [0,dur]
function gl(t, f, dec) { return t > 0 ? glass(t, f, dec) : 0; }
function equipSound(sr) {   // 1.5 s aurora: sub swell, shimmering chord, glass tinkles, crystal strike + thump at 0.92 s
  var n = Math.floor(sr * 1.5), d = new Float32Array(n), r = prng(71), lp = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, sw = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.2)), 1.4) * (t < 1.2 ? 1 : Math.exp(-(t - 1.2) * 8)), nz = r();
    var v = 0;
    [392, 494, 587, 740, 988].forEach(function (f, k) { v += Math.sin(TAU * f * (1 + .04 * t) * t + 2.5 * Math.sin(TAU * (4 + k) * t)) * (.15 - k * .018) * sw; });
    v += Math.sin(TAU * (60 * t + 20 * t * t)) * sw * .3 + Math.sin(TAU * (120 * t + 40 * t * t)) * sw * .16;
    lp += (nz - lp) * (.03 + .4 * t / 1.5); v += lp * Math.exp(-Math.pow((t - .6) / .35, 2)) * 1.2;
    [.5, .72, .9, 1.05, 1.18].forEach(function (c, k) { v += gl(t - c, 1760 * (1 + k * .19), 7) * .12; });
    var c2 = t - .92; if (c2 > 0) v += (gl(c2, 1318, 5) + .7 * gl(c2, 1760, 6) + .5 * gl(c2, 2349, 7)) * .24 + nz * Math.exp(-c2 * 100) * .35 + Math.sin(TAU * (110 - 45 * Math.min(c2, 1)) * c2) * Math.exp(-c2 * 9) * .5;
    d[i] = v;
  }
  LA.verb(d, sr, .5);
  return LA.finishCue(d, sr, { hp: 60, eq: [[1200, .8, 3], [3000, .9, 2.5]], drive: 1.5, peak: .85 });
}
function rearmSound(sr) {   // 0.55 s: tick + thump + three-note glass arpeggio starting at 0 so the 0-0.16 s slice already hits
  var n = Math.floor(sr * .55), d = new Float32Array(n), r = prng(73), i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(), v = nz * Math.exp(-t * 170) * .5 + Math.sin(TAU * (170 - 80 * Math.min(1, t * 8)) * t) * Math.exp(-t * 14) * .45;
    [[0, 1318], [.07, 1568], [.14, 1975]].forEach(function (nt) { v += gl(t - nt[0], nt[1], 8) * .34; });
    d[i] = v;
  }
  LA.verb(d, sr, .4);
  return LA.finishCue(d, sr, { hp: 80, eq: [[1500, .8, 3], [3600, .9, 3]], drive: 1.7, peak: .85 });
}
function mixShot(sr, base) {   // game report underneath + crack, high zing, thump, crystalline ring and a sprinkle of shards
  var n = Math.max(base ? base.length : 0, Math.floor(sr * .6)), d = new Float32Array(n), r = prng(79), lp = 0, i, k;
  var ev = []; for (k = 0; k < 6; k++) ev.push([.02 + Math.abs(r()) * .16, 2400 + Math.abs(r()) * 3000, .05 + Math.abs(r()) * .05]);
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(), v = (base && i < base.length ? base[i] * .75 : 0);
    lp += (nz - lp) * .4;
    v += nz * Math.exp(-t * 150) * .5;
    var c = t - .003; if (c > 0 && c < .08) v += chirp(c, 5000, 1100, .08) * Math.exp(-c * 22) * .26;
    v += Math.sin(TAU * (118 * t - 55 * t * t)) * Math.exp(-t * 13) * .7 + Math.sin(TAU * 64 * t) * Math.exp(-t * 10) * .12;
    v += gl(t, 2093, 9) * .2 + gl(t, 3135, 13) * .12;
    for (k = 0; k < ev.length; k++) { var tt = t - ev[k][0]; if (tt > 0) v += Math.sin(TAU * ev[k][1] * tt) * Math.exp(-tt * 55) * ev[k][2]; }
    v += (nz - lp) * Math.exp(-t * 14) * .18;
    d[i] = v;
  }
  LA.verb(d, sr, .5);
  return LA.finishCue(d, sr, { hp: 45, lp: 11000, eq: [[1000, .8, 2], [2400, .9, 3], [5000, .9, 2]], drive: 1.7, peak: .92 });
}

/* ------------------------------------------------------------------ picker card */
var styled = false;
function decorate(btn) {
  if (!styled && document.head) {
    var st = document.createElement('style');
    st.textContent = '@keyframes prsHue{to{filter:hue-rotate(360deg)}}@keyframes prsGlow{0%,100%{box-shadow:0 0 6px #7aa8ff55,inset 0 0 8px #a07aff22}50%{box-shadow:0 0 16px #b8d4ffcc,inset 0 0 14px #ff7ad944}}@keyframes prsSpin{to{transform:rotate(360deg)}}' +
      '@keyframes prsBorder{0%,100%{border-color:#ff5d8f}20%{border-color:#ffd35d}40%{border-color:#5dff9a}60%{border-color:#5dc8ff}80%{border-color:#a15dff}}' +
      '.prs-card{background:linear-gradient(135deg,#07080e,#141a2e 55%,#1d1430)!important;border:1px solid #ff5d8f!important;animation:prsGlow 2.6s ease-in-out infinite,prsBorder 6s linear infinite;position:relative;overflow:hidden}' +
      '.prs-card .prs-gem{position:absolute;right:11px;top:10px;width:24px;height:24px;clip-path:polygon(50% 0,100% 40%,50% 100%,0 40%);background:conic-gradient(from 20deg,#ff5d8f,#ffd35d,#5dff9a,#5dc8ff,#a15dff,#ff5d8f);animation:prsSpin 5s linear infinite,prsHue 4s linear infinite}' +
      '.prs-tag{display:inline-block;margin-top:5px;padding:1px 6px;font:700 9px system-ui;letter-spacing:1.5px;color:#0a0c18;background:linear-gradient(90deg,#ff9ac0,#ffe08a,#9affc0,#9ad0ff,#c39aff);border-radius:3px}';
    document.head.appendChild(st); styled = true;
  }
  btn.classList.add('prs-card'); btn.style.color = '#eef3ff';
  var gem = document.createElement('span'); gem.className = 'prs-gem'; btn.appendChild(gem);
  var tag = document.createElement('span'); tag.className = 'prs-tag'; tag.textContent = 'LEGENDARY'; btn.appendChild(document.createElement('br')); btn.appendChild(tag);
}

function reloadSound(sr) {   // 0.75 s: clack + body thump, falling shimmer, descending glass notes
  var n = Math.floor(sr * .75), d = new Float32Array(n), r = prng(61), ph = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); ph += TAU * (320 + 2200 * Math.exp(-4 * t)) / sr;
    var v = nz * Math.exp(-t * 200) * .6 + Math.sin(TAU * 420 * t) * Math.exp(-t * 50) * .4 + Math.sin(TAU * (140 - 55 * Math.min(1, t * 6)) * t) * Math.exp(-t * 13) * .5 + (Math.sin(ph) + .3 * Math.sin(ph * 2)) * Math.exp(-3.4 * t) * .2;
    [[0, 1975], [.08, 1568], [.16, 1318], [.26, 988]].forEach(function (nt) { v += gl(t - nt[0], nt[1], 7) * .3; });
    d[i] = v;
  }
  return LA.finishCue(d, sr, { hp: 90, lp: 9000, eq: [[900, .8, 3], [2600, .9, 2.5]], drive: 1.8, peak: .85 });
}
function hitSound(sr) {   // 0.3 s glass shatter: snap, body thump, a dozen 1.8-5 kHz shards (not shrill 4-10 kHz)
  var n = Math.floor(sr * .3), d = new Float32Array(n), r = prng(63), lp = 0, ph = 0, i, k;
  var ev = []; for (k = 0; k < 12; k++) ev.push([Math.abs(r()) * .09, 1800 + Math.abs(r()) * 3200, .08 + Math.abs(r()) * .09]);
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(); lp += (nz - lp) * .25; ph += TAU * (170 + 280 * Math.exp(-t * 30)) / sr;
    var v = (nz - lp) * Math.exp(-t * 130) * .7 + Math.sin(ph) * Math.exp(-t * 20) * .55 + gl(t, 1568, 18) * .3;
    for (k = 0; k < ev.length; k++) { var tt = t - ev[k][0]; if (tt > 0) v += Math.sin(TAU * ev[k][1] * tt) * Math.exp(-tt * 40) * ev[k][2]; }
    d[i] = v;
  }
  LA.verb(d, sr, .3);
  return LA.finishCue(d, sr, { hp: 140, lp: 9000, eq: [[1800, .8, 4], [3000, .9, 3]], drive: 2.2, peak: .9 });
}
function killSound(sr) {   // 0.7 s prism shatter: crack, falling zing, thump, warm swell, burst of glass shards, rising chime arpeggio
  var n = Math.floor(sr * .7), d = new Float32Array(n), r = prng(65), lp2 = 0, i, k;
  var ev = []; for (k = 0; k < 16; k++) ev.push([.02 + Math.abs(r()) * .32, 1800 + Math.abs(r()) * 3400, .06 + Math.abs(r()) * .08]);
  var ch = [1318, 1760, 2349, 3136];
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r();
    var v = nz * Math.exp(-t * 80) * .6 + (t < .18 ? chirp(t, 6000, 450, .18) * Math.exp(-t * 13) * .45 : 0);
    v += Math.sin(TAU * (92 * t - 34 * t * t)) * Math.exp(-t * 7) * 1.0;
    lp2 += (nz - lp2) * .04; v += lp2 * Math.min(1, t * 40) * Math.exp(-Math.pow((t - .15) / .2, 2)) * 2.4;
    for (k = 0; k < ev.length; k++) { var tt = t - ev[k][0]; if (tt > 0) v += Math.sin(TAU * ev[k][1] * tt) * Math.exp(-tt * 40) * ev[k][2]; }
    for (k = 0; k < 4; k++) v += gl(t - .1 - k * .07, ch[k], 7) * (.26 - k * .02);
    d[i] = v;
  }
  LA.verb(d, sr, .55);
  return LA.finishCue(d, sr, { hp: 45, lp: 10000, eq: [[1400, .8, 2], [3400, .9, 2.5]], drive: 1.4, peak: .95 });
}

global.SightlinePrism = {
  version: 'G3.0-prism', weapon: 'tide', finish: FINISH, anchors: ANCHOR, hasEliminationFx: true,
  buildRig: buildRig, createFx: createFx, decorate: decorate,
  equipSound: LA.memo(equipSound), rearmSound: LA.memo(rearmSound), reloadSound: LA.memo(reloadSound), hitSound: LA.memo(hitSound), mixShot: LA.memoBase(mixShot), killSound: LA.memo(killSound)
};
})(window);

/* ---- legendary-set.js ---- */
/* Sightline legendary finish FACTORY + the "Legend Set" skins for the remaining weapon classes.
   Original designs. Cosmetic only: no damage, ammo, recoil, hit or network behaviour is touched.
     VOIDLIGHT HAWK      (Hawk .50, pistol)  - event-horizon black, accretion swirl, gravity-lens rings, implosion tracer
     THORNBLOOM SCATTER  (Scatter-12, shotgun) - wine-black bark, living crimson vines, thorn barrel, petal blasts
     SUNFORGED AEGIS     (Bulwark LMG)       - ivory-gold hex plating, rising light, halo rings, solar-lance tracer
   Each registers a global with the same contract as the other legendary modules:
     finish, weapon, buildRig(THREE) -> rig, createFx(THREE, scene) -> fx,
     equipSound/rearmSound/reloadSound/hitSound/mixShot(sampleRate,...) -> Float32Array, decorate(button, finish, selected)
   Everything is allocated once; update() and fx.tick() allocate nothing. */
(function (global) {
'use strict';

var TAU = Math.PI * 2;
function prng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; }; }
function norm(d, peak) { var m = 0, i; for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > m) m = a; } if (m > 0) { var k = peak / m; for (i = 0; i < d.length; i++) d[i] *= k; } return d; }
function lpf(d, a) { var y = 0; for (var i = 0; i < d.length; i++) { y += (d[i] - y) * a; d[i] = y; } return d; }
var LA = global.SightlineLegendaryAudio;
function chirp(c, f0, f1, dur) { return Math.sin(TAU * (f0 * c + (f1 - f0) * c * c / (2 * dur))); }   // closed-form linear sweep, c in [0,dur]
function bell(t, f, dec) { return t > 0 ? (Math.sin(TAU * f * t) + .4 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * dec * .6)) * Math.exp(-t * dec) : 0; }
var H = { prng: prng, norm: norm, lpf: lpf, TAU: TAU, LA: LA, chirp: chirp, bell: bell };

var GLSL_COMMON = 'uniform float uT,uPulse,uHeat,uAwake,uDim,uGain,uLow;\nvarying vec3 vEcl;\n';
var GLSL_FRAG_FUNCS =
  'float eH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\n' +
  'uniform sampler2D uNoise;\n' +
  'float eN(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f); vec2 o=i.z*vec2(37.,17.);\n' +
  ' return mix(texture2D(uNoise,(i.xy+o+f.xy+.5)/256.).x,texture2D(uNoise,(i.xy+o+vec2(37.,17.)+f.xy+.5)/256.).x,f.z);}\n';


function noiseTexture(T) {   // one shared 256x256 random texture: replaces the per-pixel sin-hash value noise
  var g = global; if (g.__slNoise && g.__slNoise.T === T) return g.__slNoise.tex;
  var n = 256, d = new Uint8Array(n * n * 4), s = 987654321, i;
  for (i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  var tx = new T.DataTexture(d, n, n, T.RGBAFormat); tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.magFilter = tx.minFilter = T.LinearFilter; tx.generateMipmaps = false; tx.needsUpdate = true;
  g.__slNoise = { T: T, tex: tx }; return tx;
}

function mergeGeos(T, list) {   // merge small static geometries that share a material into one draw call
  var pos = [], nor = [], uv = [], idx = [], off = 0, i;
  list.forEach(function (g) {
    var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 0, n ? n.getZ(i) : 1); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
    if (g.index) { for (i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); } else { for (i = 0; i < p.count; i++) idx.push(i + off); }
    off += p.count;
  });
  var m = new T.BufferGeometry();
  m.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); m.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); m.setIndex(idx);
  return m;
}
var texCache = {};
function canvasTex(T, key, size, draw) {
  if (texCache[key]) return texCache[key];
  var c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  var t = new T.CanvasTexture(c); return (texCache[key] = t);
}
function discTex(T) {
  return canvasTex(T, 'set-disc', 128, function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
}


function defaultSurface(cfg) {
  var h = typeof cfg.haloColor === 'number' ? cfg.haloColor : 0xffffff, c = [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255].map(function (v) { return v.toFixed(2); }).join(',');
  return ' float t=vEcl.y; vec3 q=vEcl*vec3(46.,46.,16.); vec3 f=abs(fract(q)-.5); diffuseColor.rgb*=1.-smoothstep(.46,.5,max(f.y,f.z))*.5;\n' +
    ' diffuseColor.rgb=mix(diffuseColor.rgb*.64,diffuseColor.rgb*1.2,smoothstep(-.012,.014,t));\n' +
    ' float inl=smoothstep(.0025,.0,abs(t-.0105))+smoothstep(.0022,.0,abs(t+.0085)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(' + c + ')*.9,clamp(inl,0.,1.)*.9);';
}
function makeLegend(cfg) {
  var A = cfg.A, kind = cfg.kind;

  function patchMaterial(mat, U, gain) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uT = U.uT; sh.uniforms.uPulse = U.uPulse; sh.uniforms.uHeat = U.uHeat;
      sh.uniforms.uAwake = U.uAwake; sh.uniforms.uDim = U.uDim; sh.uniforms.uLow = U.uLow;
      sh.uniforms.uInv = U.uInv; sh.uniforms.uNoise = U.uNoise; sh.uniforms.uGain = { value: gain };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uInv;\nvarying vec3 vEcl;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEcl=(uInv*modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_FRAG_FUNCS)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + '{\n' + (cfg.surface || defaultSurface(cfg)) + '\n}\n')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{\n' + cfg.emissive + '\n}\n');
    };
    mat.customProgramCacheKey = function () { return cfg.cacheKey; };
    mat.needsUpdate = true;
    return mat;
  }

  function buildRig(T) {
    var group = new T.Group(); group.name = kind + '-rig';
    var U = { uT: { value: 0 }, uPulse: { value: -1 }, uHeat: { value: 0 }, uAwake: { value: -1 }, uDim: { value: 0 }, uLow: { value: 0 }, uNoise: { value: noiseTexture(T) }, uInv: { value: new T.Matrix4() } };
    var S = { t: 0, pulse: -1, heat: 0, awake: -1, dim: 0, boost: 0, flare: 0, flash: 0, rf: 0, reloading: false, low: false, pendingRearm: false, pendingReload: false, rearmFx: 0, stripT: 9 };
    var add = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
    function basic(color, opacity, extra) { var o = { color: color, opacity: opacity }; for (var k in add) o[k] = add[k]; for (var e in (extra || {})) o[e] = extra[e]; return new T.MeshBasicMaterial(o); }

    /* emblem on both flanks */
    var emblems = [], emTex = canvasTex(T, kind + '-emblem', 256, cfg.emblemDraw);
    [-1, 1].forEach(function (side) {
      var m = new T.Mesh(new T.PlaneGeometry(A.flank.size, A.flank.size), basic(0xffffff, .95, { map: emTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.position.set(side * A.flank.x, A.flank.y, A.flank.z); m.rotation.y = side * Math.PI / 2; group.add(m); emblems.push(m);
    });

    /* strips on both flanks, chasing toward the muzzle after a shot */
    var stripMat = [], st = A.strips;
    for (var s = 0; s < st.n; s++) {
      var smat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 1 }); stripMat.push(smat);
      var z = st.z0 + (st.z1 - st.z0) * (s / Math.max(1, st.n - 1));
      var bar = new T.Mesh(mergeGeos(T, [-1, 1].map(function (side) { var g = new T.BoxGeometry(.0012, st.h, st.l); g.translate(side * st.x, st.y, z); return g; })), smat); group.add(bar);
    }

    /* muzzle: rings, halo ring, flare, shock rings */
    var mz = new T.Group(); mz.position.set(A.muzzle[0], A.muzzle[1], A.muzzle[2]); group.add(mz);
    var rings = A.rings.map(function (r, i) {
      var m = new T.Mesh(new T.RingGeometry(r.r0, r.r1, r.sides), basic(r.color, .6, { side: T.DoubleSide })); m.position.z = r.z; mz.add(m); return { m: m, spec: r };
    });
    var mzRing = new T.Mesh(new T.TorusGeometry(A.halo, .0011, 6, 36), basic(cfg.haloColor, 0)); mz.add(mzRing);
    var fTex = canvasTex(T, kind + '-flare', 128, cfg.flareDraw);
    var flare = new T.Mesh(new T.PlaneGeometry(.4, .4), basic(0xffffff, 0, { map: fTex })); flare.position.z = -.02; mz.add(flare);
    var shock = [];
    for (var r = 0; r < 3; r++) { var sm = new T.Mesh(new T.RingGeometry(A.halo * 1.3, A.halo * 1.65, cfg.shockSides || 40), basic(cfg.shockColor, 0, { side: T.DoubleSide })); sm.visible = false; mz.add(sm); shock.push({ m: sm, t: 9 }); }
    var shockNext = 0;

    /* motes: one Points draw call */
    var NE = 56, seeds = new Float32Array(NE * 4), pos = new Float32Array(NE * 3), rs = cfg.seed || 1234;
    function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
    for (var e = 0; e < NE; e++) { seeds[e * 4] = rnd(); seeds[e * 4 + 1] = rnd(); seeds[e * 4 + 2] = .5 + rnd() * 1.3; seeds[e * 4 + 3] = .5 + rnd() * .9; }
    var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(pos, 3)); eg.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
    var emU = { uT: U.uT, uBoost: { value: 0 }, uScale: { value: 520 }, uZ0: { value: A.mote.z0 }, uZ1: { value: A.mote.z1 }, uC: { value: new T.Vector2(A.mote.cx, A.mote.cy) } };
    var emMat = new T.ShaderMaterial({
      uniforms: emU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute vec4 aSeed; uniform float uT,uBoost,uScale,uZ0,uZ1; uniform vec2 uC; varying float vA; varying float vH;\nvoid main(){ vec3 p; float vAx=1.;\n' + cfg.moteVS + '\n vA=vAx; vH=aSeed.x; vec4 mv=modelViewMatrix*vec4(p,1.);\n gl_PointSize=clamp(aSeed.w*.014*uScale*(1.+uBoost*.8)/max(.05,-mv.z),1.,60.); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vA; varying float vH;\nvoid main(){ vec2 c=gl_PointCoord-.5; float d=length(c); float a=smoothstep(.5,0.,d); a*=a;\n' + cfg.moteFS + '\n gl_FragColor=vec4(col,a*vA); }'
    });
    var motes = new T.Points(eg, emMat); motes.frustumCulled = false; group.add(motes);

    var ex = cfg.extra ? cfg.extra(T, group, S, basic) : null;

    var mats = {};
    function dress(g, on) {
      if (!on) return;
      group.updateWorldMatrix(true, false);
      g.traverse(function (mesh) {
        if (!mesh.isMesh || !mesh.userData.finishBase || mesh.userData.finishBadge) return;
        var base = mesh.userData.finishBase, c = base.color, b = (c.r + c.g + c.b) / 3;
        if (b < .004 || b > (cfg.dress.maxB || .75) || base.transparent) return;
        var key = base.uuid, m = mats[key];
        if (!m) {
          var metal = b > .05, d = metal ? cfg.dress.metal : cfg.dress.poly;
          m = new T.MeshPhongMaterial({
            color: d.color, specular: d.spec, shininess: d.shin,
            map: base.map || null, bumpMap: base.bumpMap || null, bumpScale: base.bumpScale || 1, envMap: null,
            reflectivity: metal ? .15 : .06, combine: T.MixOperation
          });
          patchMaterial(m, U, metal ? (cfg.dress.metalGain || 1) : (cfg.dress.polyGain || .7)); mats[key] = m;
        }
        mesh.material = m;
      });
    }
    function fire() {
      S.pulse = 0; S.boost = 1; S.flare = 1; S.heat = Math.min(1, S.heat + (cfg.heatPerShot || .18)); S.stripT = 0;
      var sh = shock[shockNext]; shockNext = (shockNext + 1) % 3; sh.t = 0; sh.m.visible = !S.low;
      if (ex && ex.fire) ex.fire();
    }
    function awaken() { S.awake = 0; S.flash = 1; S.boost = Math.max(S.boost, .9); }
    function rearm() { S.rearmFx = 1; S.pulse = 0; S.boost = Math.max(S.boost, .9); S.flash = Math.max(S.flash, .7); }
    function setReload(rf, is) {
      if (!S.reloading && is) S.pendingReload = true;
      if (S.reloading && !is) { S.pendingRearm = true; rearm(); }
      S.reloading = !!is; S.rf = rf || 0;
    }
    function setDetail(level) {
      var low = level === 'low'; if (low === S.low) return; S.low = low; U.uLow.value = low ? 1 : 0;
      eg.setDrawRange(0, low ? 20 : NE); if (rings[2]) rings[2].m.visible = !low;
      if (ex && ex.setDetail) ex.setDetail(low);
    }
    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function update(dt, o) {
      if (!group.visible || (group.parent && !group.parent.visible)) return;
      if (dt > .1) dt = .1; S.t += dt; U.uT.value = S.t;
      var ads = (o && o.ads) || 0, af = 1 - ads;
      var dimT = S.reloading ? (S.rf < .72 ? .86 : .86 * (1 - clamp01((S.rf - .72) / .28))) : 0;
      S.dim += (dimT - S.dim) * Math.min(1, dt * 7); U.uDim.value = S.dim;
      if (S.pulse >= 0) { S.pulse += dt / .36; if (S.pulse > 1.15) S.pulse = -1; } U.uPulse.value = S.pulse;
      if (S.awake >= 0) { S.awake += dt / 1.15; if (S.awake > 1.15) S.awake = -1; } U.uAwake.value = S.awake;
      S.heat = Math.max(0, S.heat - dt * .33); U.uHeat.value = S.heat;
      S.boost = Math.max(0, S.boost - dt * 1.4); emU.uBoost.value = S.boost;
      S.flash = Math.max(0, S.flash - dt * 1.1); S.flare = Math.max(0, S.flare - dt * 7.5); S.rearmFx = Math.max(0, S.rearmFx - dt * 3);
      U.uInv.value.copy(group.matrixWorld).invert();
      emU.uScale.value = (global.innerHeight || 600) * .87 * (1 - ads * .85);
      var live = 1 - S.dim * .8, fl = S.flash, sp = 1 - S.dim * .9;
      for (var i = 0; i < rings.length; i++) {
        var rg = rings[i], sc = 1 + S.boost * .2 + fl * .3;
        rg.m.rotation.z += dt * (rg.spec.speed * sp + Math.sign(rg.spec.speed) * (S.boost * 4 + fl * 3)); rg.m.scale.set(sc, sc, 1);
        rg.m.material.opacity = ((.5 + .25 * Math.sin(S.t * 2 + i)) * live + S.boost * .3 + fl * .3) * af;
      }
      var eb = (.55 + .3 * Math.sin(S.t * 1.6)) * live + S.heat * .3 + fl * .5 + S.boost * .3;
      emblems[0].material.opacity = emblems[1].material.opacity = Math.min(1, eb);
      emblems[0].rotation.z = emblems[1].rotation.z = Math.sin(S.t * .4) * (cfg.emblemSway || .08);
      S.stripT += dt;
      for (var k = 0; k < stripMat.length; k++) {
        var ch = Math.exp(-Math.pow((S.stripT * 8) - k, 2) * .9) * (S.stripT < 1.2 ? 1 : 0);
        var v = Math.min(1, ((.28 + .22 * Math.sin(S.t * 1.9 + k * .9)) * live) + ch + S.heat * .35 + fl * .5);
        stripMat[k].color.setRGB(st.c0[0] + (st.c1[0] - st.c0[0]) * ch, st.c0[1] + (st.c1[1] - st.c0[1]) * ch, st.c0[2] + (st.c1[2] - st.c0[2]) * ch);
        stripMat[k].opacity = .2 + .6 * v;
      }
      mzRing.material.opacity = S.flare * .9 + S.heat * .3 * live; mzRing.visible = mzRing.material.opacity > .01;
      var fs = .22 + S.flare * .7; flare.scale.set(fs, fs, 1); flare.material.opacity = S.flare; flare.visible = S.flare > .01; flare.rotation.z += dt * (cfg.flareSpin || 2);
      for (var q = 0; q < shock.length; q++) {
        var sh = shock[q]; if (!sh.m.visible) continue; sh.t += dt / .3;
        if (sh.t >= 1) { sh.m.visible = false; continue; }
        var sc2 = 1 + sh.t * 7; sh.m.scale.set(sc2, sc2, 1); var inv = 1 - sh.t; sh.m.material.opacity = inv * inv * .9;
      }
      if (ex && ex.update) ex.update(dt, S, ads, live);
    }
    function takeReload() { var p = S.pendingReload; S.pendingReload = false; return p; }
    function takeRearm() { var p = S.pendingRearm; S.pendingRearm = false; return p; }
    var rig = {
      kind: kind, group: group, update: update, fire: fire, awaken: awaken, rearm: rearm,
      setReload: setReload, setDetail: setDetail, dress: dress, takeRearm: takeRearm, takeReload: takeReload,
      state: S, uniforms: U, dispose: function () { group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    };
    if ((kind === 'thorn' || kind === 'aegis') && ex && typeof ex.inspect === 'function') rig.inspect = function (active) { ex.inspect(!!active); };
    return rig;
  }

  function createFx(T, scene) {
    var NB = cfg.kill ? 12 : 5, beams = [], UT = { value: 0 }, clock = 0;
    var bvs = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
    var bfs = 'varying vec2 vUv; uniform float uHead,uAlpha,uLen,uT,uSeed;\nvoid main(){ float x=vUv.x, y=(vUv.y-.5)*2.; float L=uLen;\n float d=x-uHead; float tail=smoothstep(-.45,0.,d)*step(d,0.); float head=exp(-d*d*1700.);\n float fade=smoothstep(0.,.02,x)*uAlpha;\n' + cfg.beamBody + '\n}';
    var planeGeo = new T.PlaneGeometry(1, 1);
    for (var i = 0; i < NB; i++) {
      var U = { uHead: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 1 }, uT: UT, uSeed: { value: 0 } };
      var mat = new T.ShaderMaterial({ uniforms: U, vertexShader: bvs, fragmentShader: bfs, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      var g = new T.Group(), p1 = new T.Mesh(planeGeo, mat), p2 = new T.Mesh(planeGeo, mat); p2.rotation.x = Math.PI / 2;
      g.add(p1, p2); g.visible = false; g.frustumCulled = false; p1.frustumCulled = p2.frustumCulled = false; scene.add(g);
      beams.push({ g: g, U: U, t: 9, ttl: .2, amp: 1, seed: i * 17.3 });
    }
    var nextBeam = 0, dir = new T.Vector3(), mid = new T.Vector3(), xAxis = new T.Vector3(1, 0, 0), qa = new T.Quaternion(), rv = new T.Vector3();
    var SP = cfg.sparks;
    var NS = 72, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sl = new Float32Array(NS), sm = new Float32Array(NS);
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('color', new T.BufferAttribute(sc, 3));
    var sMat = new T.PointsMaterial({ size: SP.size, vertexColors: true, map: discTex(T), sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
    var sparks = new T.Points(sg, sMat); sparks.frustumCulled = false; scene.add(sparks); sparks.visible = false; var sparkDirty = false;
    for (var s = 0; s < NS; s++) { sp[s * 3 + 1] = -999; }
    var sNext = 0, sOut = new Float32Array(NS);
    var NR = cfg.kill ? 5 : 3, rings = [], killEnd = new T.Vector3(), killView = new T.Vector3(), kr = new T.Vector3(), ku = new T.Vector3(), kp = new T.Vector3(), UPV = new T.Vector3(0, 1, 0), killT = -1;
    for (var r = 0; r < NR; r++) {
      var rm = new T.Mesh(new T.RingGeometry(.1, .135, cfg.impactSides || 36), new T.MeshBasicMaterial({ color: cfg.impactColor, opacity: 0, side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      rm.visible = false; scene.add(rm); rings.push({ m: rm, t: 9, k: 5.5, flat: false });
    }
    var rNext = 0;
    var fMat = new T.SpriteMaterial({ map: canvasTex(T, kind + '-flare', 128, cfg.flareDraw), color: cfg.flashColor, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
    var flash = new T.Sprite(fMat); flash.visible = false; scene.add(flash); var flashT = 9;
    var low = false;
    function spawn(a, end, o) {
      o = o || {}; var b = beams[nextBeam]; nextBeam = (nextBeam + 1) % NB;
      dir.subVectors(end, a); var L = dir.length(); if (L < .05) return; dir.multiplyScalar(1 / L);
      mid.addVectors(a, end).multiplyScalar(.5);
      b.g.position.copy(mid); qa.setFromUnitVectors(xAxis, dir); b.g.quaternion.copy(qa);
      var w = o.w || (o.amp ? cfg.beamW * .5 : cfg.beamW);
      b.g.children[0].scale.set(L, w, 1); b.g.children[1].scale.set(L, w, 1);
      b.U.uLen.value = Math.min(L, 60); b.ttl = o.ttl || cfg.beamTtl; b.t = 0; b.g.visible = true; b.amp = o.amp || 1; b.seed = Math.random() * 60;
    }
    function burst(p, from, big) { sparkDirty = true; sparks.visible = true;
      var n = low ? Math.round(SP.n * .5) : (big ? SP.n + 6 : SP.n), k;
      dir.subVectors(from, p).normalize();
      for (k = 0; k < n; k++) {
        var i = sNext; sNext = (sNext + 1) % NS;
        var life = SP.life0 + Math.random() * SP.lifeR; sl[i] = sm[i] = life; sOut[i] = 0;
        if (SP.implode) {
          rv.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
          var R = .3 + Math.random() * .35;
          sp[i * 3] = p.x + rv.x * R; sp[i * 3 + 1] = p.y + rv.y * R; sp[i * 3 + 2] = p.z + rv.z * R;
          sv[i * 3] = -rv.x * R / life * 1.05; sv[i * 3 + 1] = -rv.y * R / life * 1.05; sv[i * 3 + 2] = -rv.z * R / life * 1.05;
        } else {
          sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
          var sp2 = SP.v0 + Math.random() * SP.vR;
          sv[i * 3] = (dir.x * .8 + (Math.random() - .5) * 1.8) * sp2; sv[i * 3 + 1] = (dir.y * .8 + (Math.random() - .3) * 1.6) * sp2; sv[i * 3 + 2] = (dir.z * .8 + (Math.random() - .5) * 1.8) * sp2;
        }
      }
      var ring = rings[rNext]; rNext = (rNext + 1) % NR; ring.t = 0; ring.flat = false; ring.m.material.color.setHex(cfg.impactColor); ring.m.visible = true; ring.m.position.copy(p).addScaledVector(dir, .02);
      ring.m.lookAt(from);
      flash.position.copy(p).addScaledVector(dir, .05); flashT = 0; flash.visible = true;
    }
    function flatRing(p, k, hex) {
      var fr = rings[rNext]; rNext = (rNext + 1) % NR; fr.t = 0; fr.flat = true; fr.k = k; fr.m.material.color.setHex(hex); fr.m.visible = true; fr.m.position.set(p.x, p.y + .03, p.z); fr.m.rotation.set(-Math.PI / 2, 0, 0);
    }
    function screenBasis(p) {   // ku = screen-right, kr = screen-up (facing the shooter)
      kr.subVectors(killView, p).normalize(); ku.crossVectors(UPV, kr);
      if (ku.lengthSq() < .0001) ku.set(1, 0, 0); ku.normalize(); kr.cross(ku).normalize();
    }
    function outward(p, n, speed, up) {   // embers that fade normally even in an implode legend
      sparkDirty = true; sparks.visible = true;
      for (var e = 0; e < n; e++) {
        var ei = sNext; sNext = (sNext + 1) % NS; sOut[ei] = 1;
        rv.set(Math.random() - .5, Math.random() * .6 - .1 + up, Math.random() - .5).normalize();
        sp[ei * 3] = p.x; sp[ei * 3 + 1] = p.y; sp[ei * 3 + 2] = p.z;
        var v = speed * (.5 + Math.random() * .8); sv[ei * 3] = rv.x * v; sv[ei * 3 + 1] = rv.y * v; sv[ei * 3 + 2] = rv.z * v;
        sl[ei] = sm[ei] = .5 + Math.random() * .6;
      }
    }
    function eliminate(p, from) {
      var K = cfg.kill; if (!K) return;
      killView.copy(from || killEnd.set(p.x, p.y + 1, p.z + 1));
      if (killView.distanceToSquared(p) < .01) killView.set(p.x, p.y + 1, p.z + 1);
      burst(p, killView, true);
      screenBasis(p);
      var rays = low ? Math.ceil(K.rays / 2) : K.rays, k;
      for (k = 0; k < rays; k++) {
        var an = k * (Math.PI * 2 / rays) + .2, cs = Math.cos(an) * K.len, sn = Math.sin(an) * K.len;
        killEnd.set(p.x + ku.x * cs + kr.x * sn, p.y + ku.y * cs + kr.y * sn, p.z + ku.z * cs + kr.z * sn);
        if (K.mode === 'implode') spawn(killEnd, p, { ttl: K.ttl || .2, amp: .8, w: .08 }); else spawn(p, killEnd, { ttl: K.ttl || .24, amp: .85, w: .09 });
      }
      flatRing(p, K.k1 || 8, K.hex1);
      if (K.stage2) { kp.copy(p); killT = 0; }
    }
    function stage2() {
      var K = cfg.kill, p = kp, k; screenBasis(p);
      flash.position.copy(p); flashT = 0; flash.visible = true;
      flatRing(p, K.k2 || 16, K.hex2);
      var rays = low ? 3 : K.rays2;
      for (k = 0; k < rays; k++) {
        var an = k * (Math.PI * 2 / rays) + .5, cs = Math.cos(an) * K.len2, sn = Math.sin(an) * K.len2;
        killEnd.set(p.x + ku.x * cs + kr.x * sn, p.y + ku.y * cs + kr.y * sn, p.z + ku.z * cs + kr.z * sn);
        spawn(p, killEnd, { ttl: .2, amp: .9, w: .1 });
      }
      outward(p, low ? 8 : 22, 3.2, .2);
    }
    function tick(dt) {
      if (killT >= 0) { killT += dt; if (killT >= (cfg.kill.delay || .22)) { killT = -1; stage2(); } }
      clock += dt; UT.value = clock; var i, qs = Math.floor(clock * 22) * 7.3;
      for (i = 0; i < NB; i++) {
        var b = beams[i]; if (!b.g.visible) continue; b.t += dt; var u = b.t / b.ttl;
        if (u >= 1) { b.g.visible = false; continue; }
        b.U.uSeed.value = b.seed + qs;
        b.U.uHead.value = Math.min(1.4, u * 2.4 - .1); b.U.uAlpha.value = (1 - u * u) * Math.min(1, b.amp);
      }
      if (sparkDirty) { var anyLive = false; for (i = 0; i < NS; i++) {
        if (sl[i] <= 0) { sp[i * 3 + 1] = -999; continue; } anyLive = true;
        sl[i] -= dt; var f = Math.max(0, sl[i] / sm[i]);
        sv[i * 3 + 1] -= SP.grav * dt; sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
        var inw = SP.implode && !sOut[i], fi = inw ? (1 - f) * .6 + .4 : f;
        sc[i * 3] = fi * SP.c[0] * (SP.fade ? f : 1); sc[i * 3 + 1] = fi * SP.c[1] * (SP.fade ? f : 1); sc[i * 3 + 2] = fi * SP.c[2] * (SP.fade ? f : 1);
        if (inw && f < .15) { sc[i * 3] *= f / .15; sc[i * 3 + 1] *= f / .15; sc[i * 3 + 2] *= f / .15; }
      }
      sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; if (!anyLive) { sparkDirty = false; sparks.visible = false; } }
      for (i = 0; i < NR; i++) {
        var r = rings[i]; if (!r.m.visible) continue; r.t += dt / .36;
        if (r.t >= 1) { r.m.visible = false; continue; }
        var iw = SP.implode && !r.flat, sc2 = r.flat ? 1 + r.t * r.k : (iw ? (2.2 - r.t * 1.9) : (1 + r.t * 5.5)); r.m.scale.set(sc2, sc2, 1); r.m.rotation.z += dt * .8; r.m.material.opacity = (iw ? r.t : (1 - r.t)) * (iw ? (1 - r.t * .6) : (1 - r.t)) * .85;
      }
      if (flash.visible) { flashT += dt / .16; if (flashT >= 1) flash.visible = false; else { var fs = .55 + flashT * .9; flash.scale.set(fs, fs, 1); fMat.opacity = (1 - flashT) * .9; } }
    }
    return { spawn: spawn, burst: burst, eliminate: eliminate, tick: tick, setLow: function (v) { low = !!v; } };
  }

  var styled = false;
  function decorate(btn) {
    if (!styled && document.head) {
      var st = document.createElement('style'); st.textContent = cfg.cardCss; document.head.appendChild(st); styled = true;
    }
    btn.classList.add(cfg.cardClass); btn.style.color = cfg.cardText;
    var ic = document.createElement('span'); ic.className = cfg.cardClass + '-ic'; ic.textContent = cfg.cardIcon || ''; btn.appendChild(ic);
    var tag = document.createElement('span'); tag.className = cfg.cardClass + '-tag'; tag.textContent = 'LEGENDARY'; btn.appendChild(document.createElement('br')); btn.appendChild(tag);
  }

  var AU = cfg.audio, out = {
    version: 'G3.0-' + kind, weapon: cfg.weapon, finish: cfg.finish, anchors: A, hasEliminationFx: !!cfg.kill,
    buildRig: buildRig, createFx: createFx, decorate: decorate,
    equipSound: LA.memo(function (sr) { return AU.equip(sr, H); }), rearmSound: LA.memo(function (sr) { return AU.rearm(sr, H); }),
    reloadSound: LA.memo(function (sr) { return AU.reload(sr, H); }), hitSound: LA.memo(function (sr) { return AU.hit(sr, H); }),
    mixShot: LA.memoBase(function (sr, base) { return AU.shot(sr, base, H); })
  };
  if (AU.kill) out.killSound = LA.memo(function (sr) { return AU.kill(sr, H); });
  global[cfg.global] = out;
  return out;
}

global.__makeLegend = makeLegend; global.__mergeGeos = mergeGeos;

/* ============================================================== VOIDLIGHT HAWK (pistol) */
makeLegend({
  kind: 'void', global: 'SightlineVoid', weapon: 'hawk', cacheKey: 'n-voidlight-hawk-v3', seed: 777,
  finish: { name: 'Voidlight Hawk', legendary: true, legendKind: 'void', metal: 0x15101f, polymer: 0x08060f, trim: 0xc77dff,
    desc: 'LEGENDARY · event-horizon black, accretion swirl, gravity-lens rings, implosion tracers' },
  A: {
    muzzle: [0, 0.03, -0.285], halo: 0.0125,
    flank: { x: 0.0201, y: 0.034, z: -0.05, size: 0.034 },
    strips: { x: 0.0201, y: 0.024, z0: -0.2, z1: -0.1, n: 4, h: 0.006, l: 0.018, c0: [.5, .2, 1], c1: [1, .5, .95] },
    rings: [{ r0: .014, r1: .0152, z: .012, color: 0xc77dff, sides: 40, speed: 1.3 }, { r0: .019, r1: .0203, z: .02, color: 0xff4fd8, sides: 40, speed: -1 }, { r0: .0245, r1: .0257, z: .03, color: 0x7a5cff, sides: 40, speed: .7 }],
    mote: { cx: 0, cy: 0.034, z0: -0.07, z1: -0.07 }
  },
  haloColor: 0xd9a0ff, shockColor: 0xc77dff, shockSides: 40, impactSides: 40, impactColor: 0xb06bff, flashColor: 0xe0c0ff, flareSpin: 1.2, heatPerShot: .22,
  emissive:
    ' vec3 d=vEcl-vec3(0.,.034,-.07); float r=length(d.yz); float ang=atan(d.y,d.z)+2.2/(r*20.+.5)-uT*.4;\n' +
    ' float arm=pow(.5+.5*sin(ang*3.+r*80.-uT*1.6),6.)*exp(-r*11.);\n' +
    ' vec3 q=vEcl*vec3(60.,60.,22.)+vec3(0.,0.,-uT*.5);\n' +
    ' float v=pow(1.-abs(eN(q)*2.-1.),20.)*(.15+.85*smoothstep(.3,.6,eN(q*.4)));\n' +
    ' float breath=.65+.35*sin(uT*1.8+vEcl.z*7.);\n' +
    ' float waveP=exp(-pow((vEcl.z-(.05-uPulse*.6))*12.,2.))*step(0.,uPulse);\n' +
    ' float waveA=exp(-pow((vEcl.z-(.05-uAwake*.7))*9.,2.))*step(0.,uAwake);\n' +
    ' float live=1.-uDim;\n' +
    ' float flow=(arm*.9+v*.4)*breath*live+(waveP+waveA)*(.3+arm*1.4+v*1.4)+uHeat*(.12+arm*.8+v*.6)*.5;\n' +
    ' vec3 col=mix(vec3(.5,.2,1.),vec3(1.,.45,.92),clamp(arm+v*.5+waveP*.7+waveA*.6+uHeat*.3,0.,1.)); col=mix(col,vec3(.95,.85,1.),clamp(waveP*.5+waveA*.4,0.,1.));\n' +
    ' float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);\n' +
    ' vec3 rim=mix(vec3(.35,.15,.9),vec3(1.,.3,.8),.5+.5*sin(uT*.9+vEcl.z*5.))*fres*(.5+uHeat*.5);\n' +
    ' totalEmissiveRadiance+=(col*flow*1.05+rim*.8)*uGain;',
  dress: { metal: { color: 0x0e0a16, spec: 0x8a5cff, shin: 120 }, poly: { color: 0x07050c, spec: 0x3a2860, shin: 45 } },
  emblemDraw: function (g, s) {
    var h = s / 2; g.clearRect(0, 0, s, s);
    var gl = g.createRadialGradient(h, h, s * .12, h, h, h); gl.addColorStop(0, 'rgba(210,120,255,.9)'); gl.addColorStop(.4, 'rgba(120,60,255,.4)'); gl.addColorStop(1, 'rgba(80,40,255,0)');
    g.fillStyle = gl; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(235,200,255,.95)'; g.lineWidth = 4;
    for (var i = 0; i < 3; i++) { g.beginPath(); g.ellipse(h, h, s * (.42 - i * .07), s * (.14 + i * .02), i * Math.PI / 3 + .3, 0, 6.2832); g.stroke(); }
    g.fillStyle = '#030208'; g.beginPath(); g.arc(h, h, s * .12, 0, 6.2832); g.fill();
    g.strokeStyle = 'rgba(255,230,255,.9)'; g.lineWidth = 2.5; g.beginPath(); g.arc(h, h, s * .125, 0, 6.2832); g.stroke();
  },
  flareDraw: function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(250,235,255,1)'); gr.addColorStop(.12, 'rgba(210,140,255,.95)'); gr.addColorStop(.35, 'rgba(130,70,255,.35)'); gr.addColorStop(1, 'rgba(90,40,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,200,255,.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(h, h, h * .8, h * .22, .5, 0, 6.2832); g.stroke(); g.beginPath(); g.ellipse(h, h, h * .8, h * .22, -.5, 0, 6.2832); g.stroke();
  },
  moteVS:
    ' float u=fract(uT*.17*aSeed.z+aSeed.x); float rad=mix(.085,.007,u*u)*(1.+uBoost*.4);\n' +
    ' float ang=uT*aSeed.z*1.6+aSeed.y*6.2832+u*u*16.;\n' +
    ' p=vec3(uC.x+(aSeed.w-.7)*.025, uC.y+sin(ang)*rad*.9, uZ0+cos(ang)*rad*1.6);\n' +
    ' vAx=sin(3.14159*u)*(.6+.4*sin(uT*9.*aSeed.z+aSeed.x*50.));',
  moteFS: ' vec3 col=mix(vec3(.6,.3,1.),vec3(1.,.5,.9),step(.7,vH)); col=mix(col,vec3(1.,.95,1.),smoothstep(.2,0.,d));',
  beamW: .22, beamTtl: .2,
  beamBody:
    ' float core=exp(-y*y*34.), body=exp(-y*y*5.);\n' +
    ' float w=sin(x*L*1.8-uT*30.)*(.2+.5*(1.-x)); float s1=exp(-pow((y-w)*10.,2.)), s2=exp(-pow((y+w)*10.,2.));\n' +
    ' float star=step(.93,fract(sin(dot(vec2(floor(x*L*10.),floor((y+1.)*3.)),vec2(12.9898,78.233)))*43758.5453))*(.5+.5*sin(uT*25.+x*40.))*body*(tail+head);\n' +
    ' vec3 vio=vec3(.55,.25,1.), mag=vec3(1.,.35,.85), white=vec3(.97,.9,1.);\n' +
    ' vec3 col=white*core*(.4+tail*1.1+head*1.5)+vio*s1*(tail*.9+head)+mag*s2*(tail*.9+head)+white*star+vio*body*.08*uAlpha;\n' +
    ' float a=(core*(.3+tail+head)+s1*tail+s2*tail+star*.7+body*.07)*fade; gl_FragColor=vec4(col*fade,clamp(a,0.,1.));',
  sparks: { size: .075, n: 14, life0: .35, lifeR: .25, v0: 0, vR: 0, grav: 0, c: [.62, .3, 1.0], implode: true },
  cardClass: 'void-card', cardText: '#f3e6ff', cardIcon: '●',
  cardCss: '@keyframes voidGlow{0%,100%{box-shadow:0 0 6px #9a5cff55,inset 0 0 8px #5a2cff22}50%{box-shadow:0 0 16px #d08cffcc,inset 0 0 14px #7a3cff55}}@keyframes voidSpin{to{transform:rotate(360deg)}}' +
    '.void-card{background:radial-gradient(circle at 85% 20%,#2a0f4a,#0a0614 60%,#05030a)!important;border:1px solid #b06bff!important;animation:voidGlow 2.7s ease-in-out infinite;position:relative;overflow:hidden}' +
    '.void-card-ic{position:absolute;right:6px;top:2px;font:34px/1 system-ui;color:#030208;text-shadow:0 0 0 #000,0 0 6px #d08cff,0 0 12px #9a5cff,0 0 2px #fff;animation:voidSpin 8s linear infinite}' +
    '.void-card-tag{display:inline-block;margin-top:5px;padding:1px 6px;font:700 9px system-ui;letter-spacing:1.5px;color:#14061f;background:linear-gradient(90deg,#e0b8ff,#ff8fe0);border-radius:3px}',
  kill: { mode: 'implode', rays: 8, len: .8, ttl: .2, hex1: 0x7a5cff, k1: 7, stage2: true, delay: .22, hex2: 0xff4fd8, k2: 16, rays2: 6, len2: .85 },
  audio: {
    equip: function (sr, H) {   // 1.5 s: sub swell + octave, rising vacuum suction, whine, then a hawk screech (two cries) and boom at 0.95 s
      var n = Math.floor(sr * 1.5), d = new Float32Array(n), r = H.prng(91), i, y = 0, LA = H.LA;
      for (i = 0; i < n; i++) {
        var t = i / sr, sw = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.4)), 1.3), nz = r(); y += (nz - y) * (.01 + .25 * sw * sw);
        var v = Math.sin(H.TAU * (38 + 14 * t) * t) * sw * .5 * (.75 + .25 * Math.sin(H.TAU * 3 * t)) + Math.sin(H.TAU * (76 + 28 * t) * t) * sw * .24 + y * 6 * sw * (t > .6 ? .55 : .3) + Math.sin(H.TAU * (300 + 1500 * t * t) * t) * sw * sw * .2;
        var z = t - .95;
        if (z > 0) {
          var vib = 1 + .02 * Math.sin(H.TAU * 9 * z);
          v += (H.chirp(z, 3400 * vib, 1900, .22) + .4 * H.chirp(z, 6800, 3800, .22)) * Math.min(1, z * 120) * Math.exp(-z * 9) * .32;
          var z2 = z - .24; if (z2 > 0) v += H.chirp(z2, 3000, 1500, .18) * Math.min(1, z2 * 120) * Math.exp(-z2 * 12) * .26;
          v += Math.sin(H.TAU * 62 * z) * Math.exp(-z * 7) * .6 + nz * Math.exp(-z * 80) * .35;
        }
        d[i] = v;
      }
      LA.verb(d, sr, .5);
      return LA.finishCue(d, sr, { hp: 55, eq: [[900, .8, 3], [2800, .9, 3]], drive: 1.5, peak: .85 });
    },
    rearm: function (sr, H) {   // 0.5 s: instant snap + zing + thump (inside the 0-0.16 s slice), dark charge rise, closing boom
      var n = Math.floor(sr * .5), d = new Float32Array(n), r = H.prng(93), i, y = 0, LA = H.LA;
      for (i = 0; i < n; i++) {
        var t = i / sr, nz = r(), ru = Math.min(1, t / .26); y += (nz - y) * (.05 + .4 * ru);
        var v = nz * Math.exp(-t * 150) * .6 + (t < .12 ? H.chirp(t, 3600, 900, .12) * Math.exp(-t * 16) * .55 : 0) + Math.sin(H.TAU * (150 - 70 * Math.min(1, t * 8)) * t) * Math.exp(-t * 13) * .4 + H.bell(t, 1320, 14) * .3 + H.bell(t, 990, 12) * .25;
        v += (t < .26 ? y * 2.6 * ru * ru + Math.sin(H.TAU * (300 * t + 2000 * t * t)) * ru * .22 : 0);
        var c = t - .26; if (c > 0) v += Math.sin(H.TAU * (110 - 40 * c / .24) * c) * Math.exp(-c * 11) * .8 + nz * Math.exp(-c * 90) * .3 + H.bell(c, 990, 12) * .2;
        d[i] = v;
      }
      LA.verb(d, sr, .4);
      return LA.finishCue(d, sr, { hp: 70, eq: [[1300, .8, 3], [3200, .9, 3]], drive: 1.7, peak: .85 });
    },
    reload: function (sr, H) {   // 0.8 s: clack + body, falling whine, sub thump, two dark pops
      var n = Math.floor(sr * .8), d = new Float32Array(n), r = H.prng(95), i, y = 0, LA = H.LA;
      for (i = 0; i < n; i++) {
        var t = i / sr, nz = r(); y += (nz - y) * .03;
        var v = nz * Math.exp(-t * 200) * .6 + Math.sin(H.TAU * 400 * t) * Math.exp(-t * 50) * .4 + Math.sin(H.TAU * (420 * Math.exp(-3.2 * t) + 300) * t) * Math.exp(-2.6 * t) * .3 + y * 6 * Math.exp(-3 * t) * .45 + Math.sin(H.TAU * (130 - 50 * Math.min(1, t * 6)) * t) * Math.exp(-t * 12) * .55;
        [.22, .36].forEach(function (c, k) { var tt = t - c; if (tt > 0) v += nz * Math.exp(-tt * 260) * .35 + H.bell(tt, 880 + k * 330, 16) * .24; });
        d[i] = v;
      }
      return LA.finishCue(d, sr, { hp: 80, lp: 9000, eq: [[900, .8, 3], [2400, .9, 2.5]], drive: 1.8, peak: .85 });
    },
    hit: function (sr, H) {   // 0.3 s: snap, zing, body thump, dark bell
      var n = Math.floor(sr * .3), d = new Float32Array(n), r = H.prng(97), i, y = 0, ph = 0, LA = H.LA;
      for (i = 0; i < n; i++) {
        var t = i / sr, nz = r(); y += (nz - y) * .25; ph += H.TAU * (160 + 280 * Math.exp(-t * 28)) / sr;
        var v = (nz - y) * Math.exp(-t * 130) * .8 + (t < .07 ? H.chirp(t, 4200, 900, .07) * Math.exp(-t * 24) * .4 : 0) + Math.sin(ph) * Math.exp(-t * 18) * .6 + H.bell(t, 1100, 16) * .28 + H.bell(t, 1650, 20) * .16;
        d[i] = v;
      }
      LA.verb(d, sr, .3);
      return LA.finishCue(d, sr, { hp: 140, eq: [[1500, .8, 4], [3200, .9, 3]], drive: 2.2, peak: .9 });
    },
    shot: function (sr, base, H) {   // game report + crack, falling zing, thump, dark ring, sizzle
      var n = Math.max(base ? base.length : 0, Math.floor(sr * .6)), d = new Float32Array(n), r = H.prng(99), lp = 0, lp2 = 0, i, LA = H.LA;
      for (i = 0; i < n; i++) {
        var t = i / sr, nz = r(), v = (base && i < base.length ? base[i] * .75 : 0);
        lp += (nz - lp) * .4; v += nz * Math.exp(-t * 150) * .5;
        var c = t - .003; if (c > 0 && c < .09) v += H.chirp(c, 4800, 900, .09) * Math.exp(-c * 20) * .4;
        v += Math.sin(H.TAU * (112 * t - 50 * t * t)) * Math.exp(-t * 14) * .45 + Math.sin(H.TAU * 60 * t) * Math.exp(-t * 10) * .08;
        v += H.bell(t, 880, 8) * .3 + H.bell(t, 1320, 10) * .2 + H.bell(t, 1760, 14) * .1;
        lp2 += (nz - lp2) * .04; v += lp2 * Math.min(1, t * 25) * Math.exp(-t * 7) * .8 + (nz - lp) * Math.exp(-t * 14) * .15;
        d[i] = v;
      }
      LA.verb(d, sr, .5);
      return LA.finishCue(d, sr, { hp: 45, lp: 11000, eq: [[1000, .8, 2], [2400, .9, 3], [5000, .9, 2]], drive: 1.7, peak: .92 });
    },
    kill: function (sr, H) {   // 0.75 s: vacuum suction builds to 0.24 s (matches the collapse), then supernova boom, zing, dark bell cascade
      var n = Math.floor(sr * .75), d = new Float32Array(n), r = H.prng(101), y = 0, i, k, LA = H.LA, bf = [880, 1320, 1760, 2349];
      for (i = 0; i < n; i++) {
        var t = i / sr, nz = r(), ru = Math.min(1, t / .24); y += (nz - y) * (.04 + .3 * ru * ru);
        var v = (t < .26 ? y * 3.6 * ru * ru + H.chirp(t, 300, 3000, .24) * ru * ru * .34 + Math.sin(H.TAU * (70 + 90 * ru) * t) * ru * .4 : 0);
        var c = t - .24;
        if (c > 0) {
          v += Math.sin(H.TAU * (100 * c - 48 * c * c)) * Math.exp(-c * 7) * 1.1 + nz * Math.exp(-c * 70) * .6 + (c < .18 ? H.chirp(c, 5600, 500, .18) * Math.exp(-c * 13) * .45 : 0);
          for (k = 0; k < 4; k++) v += H.bell(c - .02 - k * .05, bf[k], 7) * (.24 - k * .02);
        }
        d[i] = v;
      }
      LA.verb(d, sr, .55);
      return LA.finishCue(d, sr, { hp: 45, lp: 10000, eq: [[1200, .8, 2], [3000, .9, 2.5]], drive: 1.4, peak: .95 });
    }
  }
});

/* ============================================================== THORNBLOOM SCATTER (shotgun) */
makeLegend({
  kind: 'thorn', global: 'SightlineThorn', weapon: 'scatter', cacheKey: 'n-thornbloom-scatter-v1', seed: 555,
  finish: { name: 'Thornbloom Scatter', legendary: true, legendKind: 'thorn', metal: 0x1d0f17, polymer: 0x0b0509, trim: 0xff4f7a,
    desc: 'LEGENDARY · wine-black bark, living crimson vines, thorn barrel, petal-burst blasts' },
  A: {
    muzzle: [0, 0.02, -0.55], halo: 0.0185,
    flank: { x: 0.0247, y: 0.004, z: 0.04, size: 0.046 },
    strips: { x: 0.0305, y: -0.012, z0: -0.37, z1: -0.25, n: 4, h: 0.01, l: 0.02, c0: [.9, .15, .35], c1: [1, .65, .8] },
    rings: [{ r0: .022, r1: .0237, z: .012, color: 0xff4f7a, sides: 5, speed: 1.0 }, { r0: .029, r1: .0305, z: .022, color: 0xff9ab8, sides: 5, speed: -.8 }, { r0: .036, r1: .0373, z: .032, color: 0xc01d4a, sides: 5, speed: .6 }],
    mote: { cx: 0, cy: 0.03, z0: 0.12, z1: -0.5 },
    thorns: { n: 7, z0: -0.52, z1: -0.14, y: 0.024, r: 0.0155 }
  },
  haloColor: 0xff8aa8, shockColor: 0xff6f93, shockSides: 5, impactSides: 5, impactColor: 0xff7a9c, flashColor: 0xffc0d0, flareSpin: .8, heatPerShot: .3, emblemSway: .12,
  emissive:
    ' vec3 c0=vec3(0.,.02,0.); float ang=atan(vEcl.y-.02,vEcl.x);\n' +
    ' float helix=pow(1.-abs(sin(ang*2.+vEcl.z*42.+sin(vEcl.z*9.+uT*.2)*.9)),10.);\n' +
    ' vec3 q=vEcl*vec3(62.,62.,16.)+vec3(0.,0.,uT*.3);\n' +
    ' float bark=pow(1.-abs(eN(q)*2.-1.),16.)*(.2+.8*smoothstep(.3,.65,eN(q*.35)));\n' +
    ' vec3 gq=floor(q*1.7); float th=step(.986,eH(gq))*(.5+.5*sin(uT*3.+eH(gq)*30.));\n' +
    ' float breath=.62+.38*sin(uT*1.5+vEcl.z*6.);\n' +
    ' float waveP=exp(-pow((vEcl.z-(.35-uPulse*1.2))*8.,2.))*step(0.,uPulse);\n' +
    ' float waveA=exp(-pow((vEcl.z-(.35-uAwake*1.3))*6.,2.))*step(0.,uAwake);\n' +
    ' float live=1.-uDim;\n' +
    ' float flow=(helix*.75+bark*.6)*breath*live+(waveP+waveA)*(.3+helix*1.3+bark*1.2)+uHeat*(.15+helix*.8+bark*.6)*.55;\n' +
    ' vec3 col=mix(vec3(.95,.08,.25),vec3(1.,.55,.7),clamp(bark*.4+waveP*.8+waveA*.7+uHeat*.4,0.,1.));\n' +
    ' float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);\n' +
    ' vec3 rim=vec3(.85,.12,.35)*fres*(.35+uHeat*.5);\n' +
    ' totalEmissiveRadiance+=(col*flow*1.6+vec3(1.,.7,.8)*th*live*.9+rim)*uGain;',
  dress: { metal: { color: 0x170b12, spec: 0xc0607a, shin: 100 }, poly: { color: 0x0a0408, spec: 0x4a2030, shin: 40 } },
  emblemDraw: function (g, s) {
    var h = s / 2; g.clearRect(0, 0, s, s);
    var gl = g.createRadialGradient(h, h, s * .1, h, h, h); gl.addColorStop(0, 'rgba(255,120,150,.8)'); gl.addColorStop(.45, 'rgba(220,40,90,.35)'); gl.addColorStop(1, 'rgba(200,20,70,0)');
    g.fillStyle = gl; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,200,215,.95)'; g.lineWidth = 4;
    for (var i = 0; i < 5; i++) { var a = i * 6.2832 / 5 - 1.5708; g.save(); g.translate(h, h); g.rotate(a + 1.5708); g.beginPath(); g.moveTo(0, -s * .08); g.bezierCurveTo(s * .2, -s * .22, s * .16, -s * .42, 0, -s * .4); g.bezierCurveTo(-s * .16, -s * .42, -s * .2, -s * .22, 0, -s * .08); g.stroke(); g.restore(); }
    g.fillStyle = '#12040a'; g.beginPath(); g.arc(h, h, s * .09, 0, 6.2832); g.fill();
    g.strokeStyle = 'rgba(255,170,195,.95)'; g.lineWidth = 3; g.beginPath(); g.arc(h, h, s * .09, 0, 6.2832); g.stroke();
  },
  flareDraw: function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,240,244,1)'); gr.addColorStop(.12, 'rgba(255,150,175,.95)'); gr.addColorStop(.35, 'rgba(230,50,100,.35)'); gr.addColorStop(1, 'rgba(200,20,70,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,170,195,.6)';
    for (var i = 0; i < 5; i++) { var a = i * 6.2832 / 5; g.save(); g.translate(h, h); g.rotate(a); g.beginPath(); g.ellipse(0, -h * .62, h * .13, h * .3, 0, 0, 6.2832); g.fill(); g.restore(); }
  },
  moteVS:
    ' float u=fract(uT*.045*aSeed.z+aSeed.x); float f=fract(uT*(.13+uBoost*.2)*aSeed.z+aSeed.y);\n' +
    ' p=vec3(uC.x+(aSeed.y-.5)*.14+sin(uT*1.1*aSeed.z+aSeed.x*30.)*.025, uC.y+.06-f*.13, mix(uZ0,uZ1,u));\n' +
    ' vAx=sin(3.14159*f)*(.65+.35*sin(uT*4.+aSeed.w*40.));',
  moteFS: ' vec3 col=mix(vec3(1.,.3,.5),vec3(1.,.7,.8),step(.5,vH)); col=mix(col,vec3(1.,.93,.95),smoothstep(.16,0.,d));',
  beamW: .24, beamTtl: .22,
  beamBody:
    ' float core=exp(-y*y*26.), body=exp(-y*y*5.);\n' +
    ' float w=sin(x*L*1.1-uT*22.)*.52; float s1=exp(-pow((y-w)*9.,2.)), s2=exp(-pow((y+w)*9.,2.));\n' +
    ' float tk=step(.9,fract(sin(dot(vec2(floor(x*L*5.),sign(w)),vec2(12.9898,78.233)))*43758.5453))*exp(-pow((y-w*1.25)*7.,2.));\n' +
    ' float pet=step(.92,fract(sin(dot(vec2(floor(x*L*12.),floor((y+1.)*3.)),vec2(39.3,17.7)))*43758.5453))*(.5+.5*sin(uT*18.+x*50.))*body*(tail+head);\n' +
    ' vec3 red=vec3(1.,.12,.3), pink=vec3(1.,.6,.75), white=vec3(1.,.93,.95);\n' +
    ' vec3 col=white*core*(.4+tail*1.1+head*1.5)+red*s1*(tail+head)+pink*s2*(tail*.8+head)+pink*tk*(tail+head*.5)+white*pet*.8+red*body*.08*uAlpha;\n' +
    ' float a=(core*(.3+tail+head)+s1*tail+s2*tail*.8+tk*tail+pet*.7+body*.07)*fade; gl_FragColor=vec4(col*fade,clamp(a,0.,1.));',
  sparks: { size: .1, n: 16, life0: .7, lifeR: .8, v0: 1.2, vR: 3.2, grav: 1.8, c: [1., .35, .55], fade: true },
  cardClass: 'thorn-card', cardText: '#ffe6ec', cardIcon: '❀',
  cardCss: '@keyframes thGlow{0%,100%{box-shadow:0 0 6px #ff4f7a55,inset 0 0 8px #c01d4a22}50%{box-shadow:0 0 16px #ff8aa8cc,inset 0 0 14px #c01d4a55}}@keyframes thSway{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}' +
    '.thorn-card{background:linear-gradient(135deg,#12050b,#2a0a18 55%,#3a1020)!important;border:1px solid #ff4f7a!important;animation:thGlow 2.8s ease-in-out infinite;position:relative;overflow:hidden}' +
    '.thorn-card-ic{position:absolute;right:8px;top:4px;font:30px/1 system-ui;color:#ff7a9c;text-shadow:0 0 8px #ff4f7a;animation:thSway 3.4s ease-in-out infinite}' +
    '.thorn-card-tag{display:inline-block;margin-top:5px;padding:1px 6px;font:700 9px system-ui;letter-spacing:1.5px;color:#240510;background:linear-gradient(90deg,#ffc0d0,#ff6f93);border-radius:3px}',
  extra: function (T, group, S, basic) {
    var root = new T.Group(), o3 = new T.Object3D(), low = false, kick = 0, cycle = 1, inspect = 0, inspectOn = false;
    root.name = 'thornbloom-scatter-authored-shotgun-details'; group.add(root);
    var receiver = new T.MeshPhongMaterial({ color: 0x211019, specular: 0x9a5367, shininess: 105, side: T.DoubleSide });
    var rose = new T.MeshPhongMaterial({ color: 0x542234, specular: 0xe28aa3, shininess: 128, side: T.DoubleSide });
    var edge = new T.MeshPhongMaterial({ color: 0x805161, specular: 0xf6becd, shininess: 150 });
    var seedMat = new T.MeshPhongMaterial({ color: 0x842944, specular: 0xffb7c9, emissive: 0x300711, emissiveIntensity: .18, shininess: 160 });
    var shellMat = new T.MeshPhongMaterial({ color: 0x3a151f, specular: 0xa85c69, shininess: 92 });
    var primerMat = new T.MeshPhongMaterial({ color: 0xc89a72, specular: 0xffe1bd, shininess: 110 });
    function mesh(obj, name) { obj.name = 'thornbloom-scatter-' + name; obj.userData.finishBadge = true; root.add(obj); return obj; }
    function profile(points, depth, bevel) {
      var shape = new T.Shape();
      for (var i = 0; i < points.length; i++) { if (!i) shape.moveTo(points[i][0], points[i][1]); else shape.lineTo(points[i][0], points[i][1]); }
      shape.closePath();
      var geo = new T.ExtrudeGeometry(shape, { steps: 1, depth: depth, bevelEnabled: true, bevelSegments: 1, bevelThickness: bevel, bevelSize: bevel, curveSegments: 2 });
      geo.computeVertexNormals(); return geo;
    }
    function instances(name, geo, material, placements) {
      var im = new T.InstancedMesh(geo, material, placements.length); im.name = 'thornbloom-scatter-' + name; im.userData.finishBadge = true;
      for (var i = 0; i < placements.length; i++) { var p = placements[i]; o3.position.set(p.x, p.y, p.z); o3.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0); o3.scale.set(p.sx || 1, p.sy || 1, p.sz || 1); o3.updateMatrix(); im.setMatrixAt(i, o3.matrix); }
      im.instanceMatrix.needsUpdate = true; root.add(im); return im;
    }
    /* The receiver becomes a stepped, structural-looking cassette rather than
       a thin color plate. Its raised shoulder and dropped rear heel establish
       a second shotgun silhouette while leaving the center sight corridor open. */
    var plateGeo = profile([[-.067,-.002],[-.057,-.018],[-.041,-.026],[-.018,-.028],[.012,-.022],[.046,-.013],[.065,-.002],[.058,.009],[.039,.015],[.021,.025],[-.004,.026],[-.027,.021],[-.050,.014]], .0052, .0012);
    var insetGeo = profile([[-.047,-.003],[-.032,-.015],[-.008,-.020],[.017,-.015],[.042,-.006],[.052,.001],[.036,.010],[.015,.018],[-.008,.018],[-.028,.012]], .0016, .00045);
    instances('sculpted-receiver-armor', plateGeo, receiver, [-1,1].map(function (side) { return { x: side*.033, y: .043, z: -.116, ry: side*Math.PI/2 }; }));
    instances('rose-steel-inlays', insetGeo, rose, [-1,1].map(function (side) { return { x: side*.0362, y: .043, z: -.116, ry: side*Math.PI/2 }; }));
    var seedGeo = new T.OctahedronGeometry(.006, 0);
    instances('paired-thornheart-seeds', seedGeo, seedMat, [-1,1].map(function (side) { return { x: side*.038, y: .043, z: -.116, sx: .85, sy: 1.1, sz: .52 }; }));
    /* A fitted, faceted pump shroud now carries the leaf scales. The low
       profile stays under the bead-sight corridor and outside the grip anchor. */
    var shroudGeo = profile([[-.075,-.004],[-.064,-.014],[-.045,-.019],[.043,-.018],[.067,-.011],[.074,-.002],[.061,.010],[.041,.016],[-.039,.016],[-.063,.010]], .0054, .001);
    instances('faceted-pump-shroud', shroudGeo, receiver, [-1,1].map(function (side) { return { x: side*.0235, y: .022, z: -.37, ry: side*Math.PI/2 }; }));
    var leafGeo = profile([[-.026,0],[-.018,.007],[-.006,.010],[.023,.002],[.015,-.003],[-.012,-.007]], .0019, .00045), leaves = [];
    [-1,1].forEach(function (side) { [-.307,-.365,-.423].forEach(function (z) { leaves.push({ x: side*.0293, y: .022, z: z, ry: side*Math.PI/2 }); }); });
    instances('fore-end-leaf-scales', leafGeo, rose, leaves);
    var ventGeo = profile([[-.004,-.003],[-.002,-.005],[.004,.003],[.002,.005]], .0007, .00015), vents = [];
    [-1,1].forEach(function (side) { [-.333,-.360,-.387,-.414].forEach(function (z) { vents.push({ x:side*.0304, y:.022, z:z, ry:side*Math.PI/2 }); }); });
    instances('pump-shroud-machined-vents', ventGeo, edge, vents);
    var cuffGeo = new T.TorusGeometry(.0225, .00165, 5, 18);
    [-.34,-.445].forEach(function (z, i) { var cuff = new T.Mesh(cuffGeo, i ? edge : receiver); cuff.position.set(0,.018,z); mesh(cuff, 'barrel-cuff-' + i); });
    /* Short, open-ended bloom shroud gives the barrel a heavier profile. The
       top remains below the bead; no optic, camera, or ADS transform changes. */
    var shroudTubeGeo = new T.CylinderGeometry(.0238,.0218,.086,9,1,true); shroudTubeGeo.rotateX(Math.PI/2);
    var shroudTube = mesh(new T.Mesh(shroudTubeGeo, receiver), 'integral-bloom-barrel-shroud'); shroudTube.position.set(0,.020,-.489);
    var crownGeo = new T.TorusGeometry(.023,.00145,5,16); crownGeo.rotateX(Math.PI/2);
    var crown = mesh(new T.Mesh(crownGeo, edge), 'crown-machined-ring'); crown.position.set(0,.020,-.532);
    var shroudBandGeo = new T.TorusGeometry(.0224,.00125,5,16); shroudBandGeo.rotateX(Math.PI/2);
    var shroudBand = mesh(new T.Mesh(shroudBandGeo, rose), 'shroud-root-ring'); shroudBand.position.set(0,.020,-.447);
    var thornGeo = new T.ConeGeometry(.0032,.011,5,1,false), thornPlacements = [];
    thornGeo.translate(0,.0055,0);
    [-1,1].forEach(function (side) { for (var ti = 0; ti < 3; ti++) thornPlacements.push({ x:side*.0215, y:.028, z:-.315-ti*.052, ry:side*.15, rz:-side*(Math.PI/2-.42) }); });
    instances('barrel-thorn-crown', thornGeo, edge, thornPlacements);
    var glow = mesh(new T.Mesh(new T.SphereGeometry(.006,8,6), basic(0xff718e,.32)), 'thornheart-glow'); glow.position.set(.040,.043,-.116);
    /* Compact side-saddle shells are cosmetic; staged primer tint follows the
       existing reload fraction and never edits ammo or the reload clock. */
    var shellGeo = new T.CylinderGeometry(.0042,.0042,.027,8,1), primerGeo = new T.CylinderGeometry(.0037,.0037,.0018,8,1), shellsAt = [];
    for (var si = 0; si < 4; si++) shellsAt.push({ x: -.041, y: .008, z: -.010-si*.029, rx: Math.PI/2 });
    var shells = instances('side-saddle-shells', shellGeo, shellMat, shellsAt);
    var primers = instances('side-saddle-primers', primerGeo, primerMat, shellsAt.map(function (p) { return { x:p.x, y:p.y, z:p.z+.0145, rx:p.rx }; }));
    var primerBase = new T.Color(0xc89a72), primerHot = new T.Color(0xff86a5), reloadStage = -1;
    if (shells.setColorAt) { for (si = 0; si < 4; si++) shells.setColorAt(si, new T.Color(1,1,1)); shells.instanceColor.needsUpdate = true; }
    /* A cosmetic carrier, hinged ejection cover, and lower feed gate give the
       firing/reload/inspect states a readable mechanical sequence. They never
       drive ammunition, reload duration, fire cadence, or hit registration. */
    var carrier = new T.Group(); carrier.name = 'thornbloom-scatter-carrier-cycle'; carrier.position.set(.040,.041,-.105); root.add(carrier);
    var rail = new T.Mesh(new T.BoxGeometry(.003,.005,.043), receiver); rail.position.set(0,0,0); carrier.add(rail);
    var handle = new T.Mesh(new T.BoxGeometry(.008,.009,.009), edge); handle.position.set(.002,0,.006); carrier.add(handle);
    rail.userData.finishBadge = handle.userData.finishBadge = true;
    var port = new T.Group(); port.name = 'thornbloom-scatter-hinged-ejection-cover'; port.position.set(.041,.043,-.105); root.add(port);
    var portCover = new T.Mesh(profile([[-.022,-.006],[-.017,-.010],[.016,-.010],[.022,-.004],[.018,.008],[-.016,.008]], .0018, .00035), rose);
    portCover.name = 'thornbloom-scatter-ejection-cover-plate'; portCover.userData.finishBadge = true; port.add(portCover);
    var gate = new T.Group(); gate.name = 'thornbloom-scatter-shell-feed-gate'; gate.position.set(0,.006,-.105); root.add(gate);
    var gatePlate = new T.Mesh(profile([[-.016,-.003],[-.011,-.008],[.012,-.008],[.017,-.002],[.011,.006],[-.012,.006]], .0022, .00035), receiver);
    gatePlate.name = 'thornbloom-scatter-feed-gate-plate'; gatePlate.userData.finishBadge = true; gate.add(gatePlate);
    function smooth(v) { v = Math.max(0,Math.min(1,v)); return v*v*(3-2*v); }
    return {
      fire: function () { kick = 1; cycle = 0; },
      inspect: function (active) { inspectOn = !!active; },
      update: function (dt, St, ads) {
        kick = Math.max(0,kick-dt*3.8); cycle = Math.min(1,cycle+dt/.15);
        var stroke = cycle < .26 ? smooth(cycle/.26) : 1-smooth((cycle-.26)/.74);
        inspect += ((inspectOn?1:0)-inspect)*Math.min(1,dt*7);
        carrier.position.z = -.105 + stroke*.016 + inspect*.019;
        var reloadOpen = St.reloading ? Math.sin(Math.PI*Math.max(0,Math.min(1,St.rf||0))) : 0;
        var actionOpen = Math.max(kick,inspect*.78,reloadOpen*.62);
        port.rotation.z = -.46*actionOpen;
        gate.rotation.x = .34*reloadOpen + .22*inspect;
        seedMat.emissiveIntensity = .14 + kick*.20 + inspect*.12 + (St.reloading?.08:0);
        glow.material.opacity = (.18 + kick*.30 + inspect*.12 + (St.reloading?.08:0))*(1-ads*.75);
        var stage = St.reloading ? Math.min(3,Math.floor(Math.max(0,St.rf||0)*4)) : -1;
        if (stage !== reloadStage && primers.setColorAt) { for (var i=0;i<4;i++) primers.setColorAt(i,i===stage?primerHot:primerBase); if(primers.instanceColor)primers.instanceColor.needsUpdate=true; reloadStage=stage; }
      },
      setDetail: function (isLow) { low = !!isLow; glow.visible = !low; }
    };
  },
  audio: {
    equip: function (sr, H) { var n = Math.floor(sr * 1.4), d = new Float32Array(n), r = H.prng(101), i, y = 0;
      for (i = 0; i < n; i++) { var t = i / sr, sw = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.3)), 1.2); y += (r() - y) * .3;
        var v = y * (.5 + .5 * Math.sin(H.TAU * 11 * t)) * sw * .5 + Math.sin(H.TAU * (110 + 40 * t) * t + 3 * Math.sin(H.TAU * 5 * t)) * sw * .18;
        if (Math.abs(r()) > .996) v += r() * .4 * sw; var c = t - .85; if (c > 0) v += (Math.sin(H.TAU * 1175 * c) + .5 * Math.sin(H.TAU * 1760 * c)) * Math.exp(-5 * c) * .2; d[i] = v; } return H.norm(d, .8); },
    rearm: function (sr, H) { var n = Math.floor(sr * .5), d = new Float32Array(n), r = H.prng(103), i, y = 0;
      for (i = 0; i < n; i++) { var t = i / sr; y += (r() - y) * .35; var v = y * Math.exp(-t * 9) * .5 * (.6 + .4 * Math.sin(H.TAU * 24 * t)); if (t > .08) { var c = t - .08; v += Math.sin(H.TAU * 70 * c) * Math.exp(-c * 16) * .6 + Math.sin(H.TAU * 988 * c) * Math.exp(-c * 10) * .15; } d[i] = v; } return H.norm(d, .8); },
    reload: function (sr, H) { var n = Math.floor(sr * .9), d = new Float32Array(n), r = H.prng(105), i, y = 0;
      for (i = 0; i < n; i++) { var t = i / sr; y += (r() - y) * .25; var v = y * Math.exp(-t * 2.8) * .5 * (.5 + .5 * Math.sin(H.TAU * 17 * t)) + Math.sin(H.TAU * (180 - 90 * t) * t) * Math.exp(-t * 3) * .2;
        if (Math.abs(r()) > .994) v += r() * Math.exp(-t * 2) * .5; d[i] = v; } return H.norm(d, .75); },
    hit: function (sr, H) { var n = Math.floor(sr * .38), d = new Float32Array(n), r = H.prng(107), i, y = 0;
      for (i = 0; i < n; i++) { var t = i / sr; y += (r() - y) * .4; d[i] = Math.sin(H.TAU * (50 + 70 * Math.exp(-26 * t)) * t) * Math.exp(-t * 15) * .6 + r() * Math.exp(-t * 70) * .3 + y * Math.exp(-t * 9) * .3 * (.5 + .5 * Math.sin(H.TAU * 30 * t)); } return H.norm(d, .8); },
    kill: function (sr, H) { var n = Math.floor(sr * .56), d = new Float32Array(n), r = H.prng(108), i, y = 0, prior = 0;
      for (i = 0; i < n; i++) { var t = i / sr, u = Math.max(0, t - .055), bloom = t < .055 ? Math.sin(Math.PI * t / .11) : Math.exp(-u * 7);
        var noise = r(); y += (noise - y) * .075; var transient = (noise - prior * .72) * Math.exp(-t * 58) * .42; prior = noise;
        var body = Math.sin(H.TAU * (96 * t - 22 * t * t)) * Math.exp(-t * 8.5) * .38;
        var thorn = Math.sin(H.TAU * (790 - 310 * Math.min(1, t / .48)) * u) * Math.exp(-u * 5.5) * bloom * .24;
        var chime = Math.sin(H.TAU * 1180 * Math.max(0, t - .09)) * Math.exp(-Math.max(0, t - .09) * 10) * (t > .09 ? .12 : 0);
        var petal = Math.sin(H.TAU * 1560 * Math.max(0, t - .145)) * Math.exp(-Math.max(0, t - .145) * 13) * (t > .145 ? .055 : 0);
        d[i] = Math.tanh((transient + body + thorn + chime + petal + y * Math.exp(-t * 7) * .18) * 1.2);
      } return H.norm(d, .84); },
    shot: function (sr, base, H) { var n = Math.max(base ? base.length : 0, Math.floor(sr * .7)), d = new Float32Array(n), r = H.prng(109), i, y = 0;
      var prior = 0;
      for (i = 0; i < n; i++) { var t = i / sr, noise = r(), v = (base && i < base.length ? base[i] * .8 : 0); y += (noise - y) * .35;
        var attack = (noise - prior * .78) * Math.exp(-t * 76) * .46; prior = noise;
        var snapT = Math.max(0,t-.018), snap = Math.sin(H.TAU*(1540-360*Math.min(1,snapT/.035))*snapT) * Math.exp(-snapT*118) * (t>.018?.105:0);
        var ringT = Math.max(0,t-.042), ring = Math.sin(H.TAU*510*ringT) * Math.exp(-ringT*24) * (t>.042?.052:0);
        v += attack + Math.sin(H.TAU * (82 * t - 18 * t * t)) * Math.exp(-9.5 * t) * .58;
        v += Math.sin(H.TAU * (218 - 55 * Math.min(1,t/.20)) * t) * Math.exp(-t * 15) * .27;
        v += Math.sin(H.TAU * (720 - 180 * Math.min(1,t/.16)) * t) * Math.exp(-t * 25) * .10;
        v += Math.sin(H.TAU * 47 * t) * Math.exp(-t * 11) * .19 + y * Math.exp(-t * 9) * .13 + snap + ring; d[i] = Math.tanh(v * 1.22); } return H.norm(d, .9); }
  }
});
var ANCHOR_TH = { n: 7, z0: -0.52, z1: -0.14, y: 0.024, r: 0.0155 };

/* ============================================================== SUNFORGED AEGIS (Bulwark LMG) */
makeLegend({
  kind: 'aegis', global: 'SightlineAegis', weapon: 'bulwark', cacheKey: 'n-sunforged-aegis-v2', seed: 321,
  finish: { name: 'Sunforged Aegis', legendary: true, legendKind: 'aegis', metal: 0x3a342a, polymer: 0x1c1913, trim: 0xffd27a,
    desc: 'LEGENDARY · ivory-gold hex plating, rising light, halo rings, solar-lance tracers' },
  A: {
    muzzle: [0, 0.016, -0.865], halo: 0.02,
    flank: { x: 0.0312, y: 0.0, z: -0.02, size: 0.058 },
    strips: { x: 0.0287, y: 0.0, z0: -0.40, z1: -0.26, n: 4, h: 0.012, l: 0.026, c0: [1, .75, .3], c1: [1, .97, .8] },
    rings: [{ r0: .026, r1: .0275, z: .02, color: 0xffd27a, sides: 48, speed: .9 }, { r0: .033, r1: .0345, z: .034, color: 0xfff0c0, sides: 48, speed: -.7 }, { r0: .041, r1: .0425, z: .05, color: 0xffa83a, sides: 48, speed: .5 }],
    mote: { cx: 0, cy: 0.0, z0: 0.3, z1: -0.7 }
  },
  haloColor: 0xffe2a0, shockColor: 0xffd27a, shockSides: 48, impactSides: 48, impactColor: 0xffd890, flashColor: 0xfff0c8, flareSpin: .6, heatPerShot: .1, emblemSway: .04,
  emissive:
    ' vec2 uv=vec2(vEcl.z,vEcl.y+vEcl.x*1.4)*34.; vec2 sv=vec2(1.,1.7320508);\n' +
    ' vec2 h1=mod(uv,sv)-sv*.5, h2=mod(uv-sv*.5,sv)-sv*.5; vec2 g=dot(h1,h1)<dot(h2,h2)?h1:h2; vec2 ga=abs(g);\n' +
    ' float hd=max(dot(ga,normalize(vec2(1.,1.7320508))),ga.x); float edge=smoothstep(.43,.48,hd);\n' +
    ' vec2 cid=uv-g; float ch=eH(vec3(floor(cid*2.),3.));\n' +
    ' float breath=.7+.3*sin(uT*1.3+vEcl.z*6.);\n' +
    ' float tw=step(.9,ch)*(.5+.5*sin(uT*2.5+ch*50.));\n' +
    ' float waveP=exp(-pow((vEcl.z-(.3-uPulse*1.5))*7.,2.))*step(0.,uPulse);\n' +
    ' float waveA=exp(-pow((vEcl.z-(.3-uAwake*1.6))*5.,2.))*step(0.,uAwake);\n' +
    ' float live=1.-uDim; float plate=1.-edge;\n' +
    ' vec3 gold=vec3(1.,.74,.3), ivory=vec3(1.,.95,.8);\n' +
    ' vec3 col=gold*edge*(.42+.16*breath)*live+ivory*plate*(.06+tw*.35)*live+(gold*edge*.9+ivory*plate*.55)*(waveP+waveA)+ivory*uHeat*(edge*.45+plate*.08);\n' +
    ' float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);\n' +
    ' totalEmissiveRadiance+=(col*1.5+vec3(1.,.8,.4)*fres*(.3+uHeat*.4))*uGain;',
  surface: ' vec2 hp=vec2(vEcl.z*26.,vEcl.y*26.); vec2 hs=vec2(1.,1.7320508); vec2 ha=mod(hp,hs)-hs*.5; vec2 hb=mod(hp+hs*.5,hs)-hs*.5; vec2 hg=dot(ha,ha)<dot(hb,hb)?ha:hb; vec2 hq=abs(hg); float hd2=max(hq.x*.8660254+hq.y*.5,hq.y); diffuseColor.rgb*=1.-smoothstep(.4,.48,hd2)*.55; diffuseColor.rgb=mix(diffuseColor.rgb*.66,diffuseColor.rgb*1.2,smoothstep(-.012,.014,vEcl.y)); float il=smoothstep(.0025,.0,abs(vEcl.y-.0105)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,.82,.35)*.9,il*.9);',
  dress: { metal: { color: 0x2c261c, spec: 0xffd890, shin: 130 }, poly: { color: 0x141109, spec: 0x6a5a3a, shin: 50 }, polyGain: .6, metalGain: .5, maxB: 1.01 },
  extra: function (T, group, S) {
    var root = new T.Group(), low = false, kick = 0, inspect = 0, inspectOn = false, reloadStage = -1;
    root.name = 'sunforged-aegis-bulwark-side-armor-and-belt-action'; group.add(root);
    function profile(points, depth, bevel) {
      var shape = new T.Shape();
      for (var i = 0; i < points.length; i++) { if (!i) shape.moveTo(points[i][0], points[i][1]); else shape.lineTo(points[i][0], points[i][1]); }
      shape.closePath();
      var geo = new T.ExtrudeGeometry(shape, { steps: 1, depth: depth, bevelEnabled: true, bevelSegments: 1, bevelThickness: bevel, bevelSize: bevel, curveSegments: 1 });
      geo.computeVertexNormals(); return geo;
    }
    function instances(name, geo, mat, placements) {
      var im = new T.InstancedMesh(geo, mat, placements.length), o = new T.Object3D(); im.name = 'sunforged-aegis-' + name; im.userData.finishBadge = true;
      for (var i = 0; i < placements.length; i++) { var p = placements[i]; o.position.set(p.x,p.y,p.z); o.rotation.set(p.rx||0,p.ry||0,p.rz||0); o.scale.set(p.sx||1,p.sy||1,p.sz||1); o.updateMatrix(); im.setMatrixAt(i,o.matrix); }
      im.instanceMatrix.needsUpdate = true; root.add(im); return im;
    }
    var armor = new T.MeshPhongMaterial({ color:0x766039, specular:0xffd987, shininess:118, side:T.DoubleSide });
    var dark = new T.MeshPhongMaterial({ color:0x292419, specular:0x88734b, shininess:62, side:T.DoubleSide });
    var gold = new T.MeshPhongMaterial({ color:0xd49c3d, specular:0xffe4a1, emissive:0x3e2608, emissiveIntensity:.28, shininess:150 });
    var brass = new T.MeshPhongMaterial({ color:0xc59b55, specular:0xffe3a0, shininess:112 });
    function sidePlacements(z,y,x){return [-1,1].map(function(side){return{x:side*x,y:y,z:z,ry:side*Math.PI/2};});}
    /* Twin stepped receiver cheeks and machined sun channels change the LMG's
       flank silhouette while keeping the iron-sight corridor clear. */
    var cheekGeo = profile([[-.142,-.006],[-.120,-.026],[-.078,-.031],[-.025,-.021],[.035,-.026],[.105,-.018],[.134,-.005],[.118,.013],[.074,.023],[.012,.020],[-.053,.028],[-.118,.018]],.006,.0015);
    var insetGeo = profile([[-.112,-.006],[-.083,-.017],[-.035,-.014],[.018,-.019],[.084,-.009],[.104,.002],[.061,.014],[.012,.011],[-.048,.018],[-.095,.010]],.002,.0005);
    instances('forged-receiver-cheeks',cheekGeo,armor,sidePlacements(-.175,.022,.038));
    instances('sun-channel-inlays',insetGeo,gold,sidePlacements(-.175,.022,.042));
    var ribGeo = new T.BoxGeometry(.0028,.004,.032), ribs=[];
    [-1,1].forEach(function(side){for(var ri=0;ri<4;ri++)ribs.push({x:side*.041,y:.004,z:-.27+ri*.043,rz:side*.12});});
    instances('radiator-ribs',ribGeo,dark,ribs);
    var rivetGeo = new T.CylinderGeometry(.0032,.0032,.002,8,1); rivetGeo.rotateX(Math.PI/2);
    var rivets=[];[-1,1].forEach(function(side){[[-.285,.018],[-.067,.018],[-.235,-.005],[-.108,-.005]].forEach(function(v){rivets.push({x:side*.044,y:v[1],z:v[0]});});});
    instances('flush-fasteners',rivetGeo,brass,rivets);
    /* Compact belt links sit below the receiver and away from the hand anchor. */
    var linkGeo = new T.BoxGeometry(.004,.010,.018), links=[];
    for(var bi=0;bi<6;bi++)links.push({x:.045,y:-.047,z:-.015+bi*.031,rz:(bi%2?-.08:.08)});
    instances('belt-link-run',linkGeo,brass,links);
    var shoe = new T.Mesh(new T.BoxGeometry(.018,.016,.044),dark); shoe.name='sunforged-aegis-reciprocating-bolt-shoe'; shoe.userData.finishBadge=true; shoe.position.set(.046,.031,-.17); root.add(shoe);
    var handle = new T.Mesh(new T.BoxGeometry(.008,.012,.021),gold); handle.name='sunforged-aegis-charging-handle'; handle.userData.finishBadge=true; handle.position.set(.050,.028,-.165); root.add(handle);
    var cover = new T.Group(); cover.name='sunforged-aegis-hinged-feed-cover'; cover.position.set(.044,.016,-.15); cover.rotation.y=Math.PI/2; root.add(cover);
    var coverMesh = new T.Mesh(profile([[-.073,-.009],[-.060,-.020],[.050,-.020],[.071,-.010],[.058,.012],[.008,.017],[-.050,.013]],.003,.0008),dark);
    coverMesh.name='sunforged-aegis-feed-cover-plate'; coverMesh.userData.finishBadge=true; cover.add(coverMesh);
    var crestGeo=profile([[-.050,-.002],[-.027,-.009],[.017,-.009],[.044,0],[.015,.009],[-.025,.008]],.0012,.00025);
    var crest=new T.Mesh(crestGeo,gold); crest.name='sunforged-aegis-cover-crest'; crest.userData.finishBadge=true; crest.position.z=.003; cover.add(crest);
    return {
      fire:function(){kick=1;},
      inspect:function(active){inspectOn=!!active;},
      update:function(dt,St,ads){
        kick=Math.max(0,kick-dt*5.5); inspect+=((inspectOn?1:0)-inspect)*Math.min(1,dt*5.5);
        var cycle=kick<.35?kick/.35:1-(kick-.35)/.65; shoe.position.z=-.17+cycle*.025+inspect*.008; handle.position.z=-.165+cycle*.021+inspect*.010;
        var rf=St.reloading?Math.max(0,Math.min(1,St.rf||0)):0,open=St.reloading?Math.sin(Math.PI*rf):0;
        cover.rotation.x=.34*Math.max(inspect,open*.82); cover.rotation.z=.05*Math.max(inspect,open);
        var stage=St.reloading?Math.min(3,Math.floor(rf*4)):-1;
        if(stage!==reloadStage){coverMesh.material=stage>=1&&stage<=2?armor:dark;reloadStage=stage;}
        cover.visible=!low||ads<.2;
      },
      setDetail:function(isLow){low=!!isLow;cover.visible=!low;}
    };
  },
  emblemDraw: function (g, s) {
    var h = s / 2; g.clearRect(0, 0, s, s);
    var gl = g.createRadialGradient(h, h, s * .1, h, h, h); gl.addColorStop(0, 'rgba(255,230,160,.85)'); gl.addColorStop(.45, 'rgba(255,170,60,.35)'); gl.addColorStop(1, 'rgba(255,140,30,0)');
    g.fillStyle = gl; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,240,200,.95)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(h, s * .12); g.lineTo(s * .82, s * .26); g.lineTo(s * .76, s * .62); g.quadraticCurveTo(s * .7, s * .82, h, s * .92); g.quadraticCurveTo(s * .3, s * .82, s * .24, s * .62); g.lineTo(s * .18, s * .26); g.closePath(); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(h, s * .24); g.lineTo(s * .7, s * .33); g.lineTo(s * .66, s * .6); g.quadraticCurveTo(s * .6, s * .74, h, s * .8); g.quadraticCurveTo(s * .4, s * .74, s * .34, s * .6); g.lineTo(s * .3, s * .33); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(255,245,215,1)'; g.beginPath(); g.arc(h, s * .5, s * .08, 0, 6.2832); g.fill();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; g.beginPath(); g.moveTo(h + Math.cos(a) * s * .11, s * .5 + Math.sin(a) * s * .11); g.lineTo(h + Math.cos(a) * s * .17, s * .5 + Math.sin(a) * s * .17); g.stroke(); }
  },
  flareDraw: function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,252,235,1)'); gr.addColorStop(.12, 'rgba(255,225,150,.95)'); gr.addColorStop(.35, 'rgba(255,160,50,.35)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, c = Math.cos(a) * h * (i % 2 ? .6 : .95), d = Math.sin(a) * h * (i % 2 ? .6 : .95); g.strokeStyle = 'rgba(255,240,190,.8)'; g.lineWidth = i % 2 ? 2 : 3; g.beginPath(); g.moveTo(h, h); g.lineTo(h + c, h + d); g.stroke(); }
  },
  moteVS:
    ' float f=fract(uT*(.2+uBoost*.25)*aSeed.z+aSeed.y); float u=fract(uT*.03*aSeed.z+aSeed.x);\n' +
    ' p=vec3(uC.x+(aSeed.x-.5)*.13+sin(uT*.9*aSeed.z+aSeed.y*20.)*.01, uC.y-.03+f*.14, mix(uZ0,uZ1,u));\n' +
    ' vAx=sin(3.14159*f)*(.6+.4*sin(uT*5.+aSeed.w*40.));',
  moteFS: ' vec3 col=mix(vec3(1.,.8,.4),vec3(1.,.95,.8),step(.5,vH)); col=mix(col,vec3(1.),smoothstep(.2,0.,d));',
  beamW: .3, beamTtl: .24,
  beamBody:
    ' float core=exp(-y*y*14.), body=exp(-y*y*3.2), thin=exp(-y*y*60.);\n' +
    ' float pulse=pow(.5+.5*sin(x*L*2.6-uT*22.),10.)*body;\n' +
    ' vec3 gold=vec3(1.,.72,.25), ivory=vec3(1.,.95,.8);\n' +
    ' vec3 col=ivory*thin*(.6+tail*1.2+head*1.8)+gold*core*(.35+tail*.9+head*1.2)+gold*pulse*(tail*.8+head*.6)+gold*body*.1*uAlpha;\n' +
    ' float a=(thin*(.5+tail+head)+core*(.3+tail*.8+head)+pulse*tail*.7+body*.08)*fade; gl_FragColor=vec4(col*fade,clamp(a,0.,1.));',
  sparks: { size: .085, n: 14, life0: .4, lifeR: .5, v0: 1.6, vR: 4.2, grav: -1.8, c: [1., .82, .45], fade: true },
  cardClass: 'aegis-card', cardText: '#fff6e0', cardIcon: '✦',
  cardCss: '@keyframes aeGlow{0%,100%{box-shadow:0 0 6px #ffd27a55,inset 0 0 8px #ffa83a22}50%{box-shadow:0 0 16px #fff0c0cc,inset 0 0 14px #ffa83a55}}@keyframes aePulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.2);opacity:1}}' +
    '.aegis-card{background:linear-gradient(135deg,#14110a,#2e2616 55%,#4a3a1a)!important;border:1px solid #ffd27a!important;animation:aeGlow 2.6s ease-in-out infinite;position:relative;overflow:hidden}' +
    '.aegis-card-ic{position:absolute;right:9px;top:5px;font:28px/1 system-ui;color:#fff0c0;text-shadow:0 0 10px #ffd27a;animation:aePulse 2.4s ease-in-out infinite}' +
    '.aegis-card-tag{display:inline-block;margin-top:5px;padding:1px 6px;font:700 9px system-ui;letter-spacing:1.5px;color:#241a06;background:linear-gradient(90deg,#fff0c0,#ffc050);border-radius:3px}',
  audio: {
    equip: function (sr, H) { var n = Math.floor(sr * 1.5), d = new Float32Array(n), r = H.prng(111), i;
      for (i = 0; i < n; i++) { var t = i / sr, sw = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.4)), 1.3), v = 0;
        [196, 294, 392, 494, 588].forEach(function (f, k) { v += Math.sin(H.TAU * f * t + 1.5 * Math.sin(H.TAU * (4.5 + k * .3) * t)) * (.16 - k * .02) * sw; });
        var c = t - .75; if (c > 0) v += (Math.sin(H.TAU * 880 * c) + .6 * Math.sin(H.TAU * 1320 * c) + .3 * Math.sin(H.TAU * 2217 * c)) * Math.exp(-3.5 * c) * .22; d[i] = v; } return H.norm(d, .8); },
    rearm: function (sr, H) { var n = Math.floor(sr * .6), d = new Float32Array(n), r = H.prng(113), i;
      for (i = 0; i < n; i++) { var t = i / sr, v = 0; [[0, 1568], [.07, 1976], [.14, 2349]].forEach(function (nt) { var tt = t - nt[0]; if (tt > 0) v += (Math.sin(H.TAU * nt[1] * tt) + .4 * Math.sin(H.TAU * nt[1] * 2.4 * tt)) * Math.exp(-6 * tt) * .26; });
        if (t < .02) v += r() * (1 - t / .02) * .25; v += Math.sin(H.TAU * 98 * t) * Math.exp(-t * 14) * .3; d[i] = v; } return H.norm(d, .8); },
    reload: function (sr, H) { var n = Math.floor(sr * .9), d = new Float32Array(n), r = H.prng(115), i;
      for (i = 0; i < n; i++) { var t = i / sr, v = 0; [392, 294, 196].forEach(function (f, k) { v += Math.sin(H.TAU * f * (1 - .25 * t) * t) * Math.exp(-2.2 * t) * (.2 - k * .03); });
        [.06, .22, .4].forEach(function (c) { var tt = t - c; if (tt > 0) v += r() * Math.exp(-tt * 200) * .3 + Math.sin(H.TAU * 640 * tt) * Math.exp(-tt * 24) * .14; }); d[i] = v; } return H.norm(d, .75); },
    hit: function (sr, H) { var n = Math.floor(sr * .38), d = new Float32Array(n), r = H.prng(117), i;
      for (i = 0; i < n; i++) { var t = i / sr; d[i] = Math.sin(H.TAU * (55 + 60 * Math.exp(-24 * t)) * t) * Math.exp(-t * 13) * .6 + r() * Math.exp(-t * 85) * .3 + (Math.sin(H.TAU * 1244 * t) + .5 * Math.sin(H.TAU * 1866 * t)) * Math.exp(-t * 14) * .14; } return H.norm(d, .8); },
    kill: function (sr,H) { var n=Math.floor(sr*.46),d=new Float32Array(n),r=H.prng(121),i,lp=0,prior=0;
      for(i=0;i<n;i++){var t=i/sr,noise=r(),hp=noise-prior*.82;prior=noise;lp+=(noise-lp)*.055;
        var impact=hp*Math.exp(-t*52)*.34+noise*Math.exp(-t*34)*.10;
        var body=Math.sin(H.TAU*(74*t-18*t*t))*Math.exp(-t*8)*.34;
        var sun=Math.sin(H.TAU*523*Math.max(0,t-.045))*Math.exp(-Math.max(0,t-.045)*9)*(t>.045?.20:0);
        var crown=Math.sin(H.TAU*1046*Math.max(0,t-.09))*Math.exp(-Math.max(0,t-.09)*12)*(t>.09?.12:0);
        d[i]=Math.tanh((impact+body+lp*Math.exp(-t*7)*.16+sun+crown)*1.12);
      }return H.norm(d,.84); },
    shot: function (sr, base, H) { var n = Math.max(base ? base.length : 0, Math.floor(sr * .55)), d = new Float32Array(n), r = H.prng(119), i, prior=0, low=0;
      for (i = 0; i < n; i++) { var t = i / sr, noise=r(), hp=noise-prior*.72; prior=noise; low+=(noise-low)*.20;
        var v = (base && i < base.length ? base[i] * .76 : 0);
        v += Math.sin(H.TAU * (76 * t - 34 * t * t)) * Math.exp(-8.8 * t) * .62;
        v += Math.sin(H.TAU * (212 - 62 * Math.min(1,t/.20)) * t) * Math.exp(-t*15) * .31;
        v += hp * Math.exp(-t*73) * .32 + low*Math.exp(-t*10)*.10;
        var mech=Math.max(0,t-.014), ring=Math.max(0,t-.042);
        v += Math.sin(H.TAU*(1320-280*Math.min(1,mech/.06))*mech)*Math.exp(-mech*29)*(t>.014?.095:0);
        v += Math.sin(H.TAU*510*ring)*Math.exp(-ring*23)*(t>.042?.055:0);
        d[i] = Math.tanh(v * 1.18); } return H.norm(d, .9); }
  }
});

})(window);


/* ---- Legendary module restored from the user-supplied source archive ---- */
/* Provenance: original Verdant module SHA-256 c7dc825c243afe0d9b05c36cc5ee0ead3c99cad39fcd081694856b9d02e84aeb; only firearm/finish identity metadata is adapted to the archived Rook117 Emerald Revenant mapping. Geometry, anchors, shader, FX, and synthesized sound implementation are retained. */
/* ---- legendary-verdant.js ---- */
/* Sightline legendary finish: EMERALD REVENANT (ROOK117)
   Original design. Cosmetic only: no damage, ammo, recoil, hit or network behaviour is touched.

   What it adds
     - Dark-jade body with living dragon-scale seams (hex-scale shader patched into the gun's own
       Phong materials, shared in gun space so stock/receiver/handguard/mag read as one hide).
     - Slit-pupil wyrm eyes on both receiver flanks (blink, narrow when firing), a glowing spine of
       fins along the top rail, glow slats on the handguard, drifting firefly spores, muzzle flare
       with three leaf-shaped shock rings.
     - Shot: scale-wave surges stock->muzzle, barrel heat builds in full-auto, emerald helix tracer,
       impact spore burst + shock ring. Built cheap for 700 rpm: pooled, nothing allocated per frame.
     - Equip "awakening" sweep, reload dimming/recharge, rearm surge, synthesised audio.
   Contract used by index.html (same as SightlineEclipse):
     finish, weapon, buildRig(THREE), createFx(THREE, scene), decorate(btn,f,sel),
     equipSound / rearmSound / mixShot (Float32Array generators) */
(function (global) {
'use strict';

var FINISH = {
  name: 'Emerald Revenant', legendary: true, legendKind: 'verdant',
  metal: 0x10241a, polymer: 0x07110b, trim: 0x5dff9a,
  desc: 'LEGENDARY · emerald scale shader, twin wyrm eyes, reactive rail spine, jade helix tracers'
};

/* ------------------------------------------------------------------ shaders */
var GLSL_COMMON = 'uniform float uT,uPulse,uHeat,uAwake,uDim,uGain,uLow;\nvarying vec3 vEcl;\n';
var GLSL_FRAG_FUNCS =
  'float eH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n' +
  'vec2 eHex(vec2 p,out vec2 id){vec2 r=vec2(1.,1.7320508),h=r*.5;vec2 a=mod(p,r)-h,b=mod(p-h,r)-h;\n' +
  ' vec2 g=dot(a,a)<dot(b,b)?a:b; id=p-g; return g;}\n';

var SURF_OLD = '{\n float t=vEcl.y;\n vec3 q=vEcl*vec3(46.,46.,16.); vec3 f=abs(fract(q)-.5); float ln=smoothstep(.46,.5,max(f.y,f.z)); diffuseColor.rgb*=1.-ln*.5;\n diffuseColor.rgb=mix(diffuseColor.rgb*.64,diffuseColor.rgb*1.2,smoothstep(-.012,.014,t));\n float inl=smoothstep(.0025,.0,abs(t-.0105))+smoothstep(.0022,.0,abs(t+.0085));\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.3,1.,.6)*.9,clamp(inl,0.,1.)*.9);\n float sc=step(.96,fract(sin(floor(vEcl.z*70.)*12.9+floor(vEcl.y*70.)*78.2)*437.5)); diffuseColor.rgb*=1.-sc*.3;\n}\n';
var GLSL_EMISSIVE =
  '{\n' +
  ' vec2 uv=vec2(vEcl.z*40.,(vEcl.y+vEcl.x)*40.);\n' +
  ' uv.y+=sin(vEcl.z*9.)*.6;\n' +
  ' vec2 id; vec2 g=eHex(uv,id);\n' +
  ' float rr=length(g+vec2(0.,.12)); float seam=smoothstep(.40,.5,rr)*smoothstep(-.12,.28,g.y);\n' +
  ' float hs=eH(id);\n' +
  ' float band=pow(.5+.5*sin(vEcl.z*11.-uT*3.2),2.5);\n' +
  ' float breath=.55+.45*sin(uT*1.4+hs*6.28);\n' +
  ' float spark=step(.988,hs)*(.5+.5*sin(uT*4.+hs*60.));\n' +
  ' if(uLow>.5)spark*=.5;\n' +
  ' float waveP=exp(-pow((vEcl.z-(.5-uPulse*1.2))*9.,2.))*step(0.,uPulse);\n' +
  ' float waveA=exp(-pow((vEcl.z-(.5-uAwake*1.4))*6.,2.))*step(0.,uAwake);\n' +
  ' float lit=seam*(.14+.86*band)*breath*(1.-uDim)+(waveP+waveA)*(.28+seam*1.5+(1.-seam)*.35)+uHeat*(.15+seam*.9)*.5;\n' +
  ' float fill=(1.-seam)*(.02+.1*waveP+.08*waveA)*(1.-uDim);\n' +
  ' vec3 col=mix(vec3(.05,.95,.42),vec3(.78,1.,.3),clamp(waveP*.8+waveA*.6+uHeat*.5+band*.15,0.,1.));\n' +
  ' float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);\n' +
  ' vec3 rim=mix(vec3(.05,.8,.6),vec3(.7,1.,.3),.5+.5*sin(uT*.7+vEcl.z*5.))*fres*(.45+uHeat*.5);\n' +
  ' totalEmissiveRadiance+=(col*lit*1.25+vec3(.04,.5,.2)*fill+vec3(.7,1.,.75)*spark*.4*(1.-uDim)+rim)*uGain;\n' +
  '}\n';

function patchMaterial(mat, U, gain) {
  mat.onBeforeCompile = function (sh) {
    sh.uniforms.uT = U.uT; sh.uniforms.uPulse = U.uPulse; sh.uniforms.uHeat = U.uHeat;
    sh.uniforms.uAwake = U.uAwake; sh.uniforms.uDim = U.uDim; sh.uniforms.uLow = U.uLow;
    sh.uniforms.uInv = U.uInv; sh.uniforms.uGain = { value: gain };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uInv;\nvarying vec3 vEcl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEcl=(uInv*modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GLSL_FRAG_FUNCS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURF_OLD)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + GLSL_EMISSIVE);
  };
  mat.customProgramCacheKey = function () { return 'verdant-wyrm-v2'; };
  mat.needsUpdate = true;
  return mat;
}

/* ------------------------------------------------------------------ textures */
var texCache = {};
function canvasTex(T, key, size, draw) {
  if (texCache[key]) return texCache[key];
  var c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return (texCache[key] = new T.CanvasTexture(c));
}
function flareTex(T) {
  return canvasTex(T, 'vflare', 128, function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(240,255,225,1)'); gr.addColorStop(.12, 'rgba(120,255,160,.95)');
    gr.addColorStop(.38, 'rgba(20,190,90,.32)'); gr.addColorStop(1, 'rgba(0,150,70,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    var l = g.createLinearGradient(0, h, s, h); l.addColorStop(0, 'rgba(120,255,170,0)'); l.addColorStop(.5, 'rgba(220,255,210,.85)'); l.addColorStop(1, 'rgba(120,255,170,0)');
    g.fillStyle = l; g.fillRect(0, h - 2, s, 4);
  });
}
function discTex(T) {
  return canvasTex(T, 'vdisc', 64, function (g, s) {
    var h = s / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
}
/* Wyrm eye: emerald iris, vertical slit pupil, dark lid shadow. Drawn once. */
function eyeTex(T) {
  return canvasTex(T, 'veye', 256, function (g, s) {
    var h = s / 2; g.clearRect(0, 0, s, s);
    var glow = g.createRadialGradient(h, h, s * .08, h, h, h);
    glow.addColorStop(0, 'rgba(190,255,150,1)'); glow.addColorStop(.45, 'rgba(40,220,110,.75)'); glow.addColorStop(1, 'rgba(0,160,80,0)');
    g.fillStyle = glow; g.fillRect(0, 0, s, s);
    g.save(); g.beginPath(); g.ellipse(h, h, s * .43, s * .26, 0, 0, 6.2832); g.clip();
    var iris = g.createRadialGradient(h, h, s * .02, h, h, s * .43);
    iris.addColorStop(0, '#f4ffc4'); iris.addColorStop(.35, '#7dff8f'); iris.addColorStop(.75, '#14b45a'); iris.addColorStop(1, '#04361c');
    g.fillStyle = iris; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(230,255,180,.35)'; g.lineWidth = 2;
    for (var i = 0; i < 18; i++) { var a = i * Math.PI / 9; g.beginPath(); g.moveTo(h + Math.cos(a) * s * .1, h + Math.sin(a) * s * .07); g.lineTo(h + Math.cos(a) * s * .42, h + Math.sin(a) * s * .26); g.stroke(); }
    g.restore();
    g.fillStyle = '#020805'; g.beginPath(); g.ellipse(h, h, s * .05, s * .22, 0, 0, 6.2832); g.fill();
    g.strokeStyle = 'rgba(190,255,170,.9)'; g.lineWidth = 4; g.beginPath(); g.ellipse(h, h, s * .43, s * .26, 0, 0, 6.2832); g.stroke();
  });
}

/* ------------------------------------------------------------------ the rig */
var ANCHOR = {
  muzzle: [0.0, 0.018, -0.70],
  eye: { x: 0.0207, y: 0.017, z: -0.098 },
  spine: { y: 0.0715, z0: 0.10, z1: -0.44, n: 9 },
  slats: { x: 0.0289, y: 0.012, z0: -0.20, z1: -0.345, n: 4 },
  spore: { cx: 0.0, cy: 0.02, z0: 0.40, z1: -0.62 }
};

function buildRig(T, host) {
  var A = ANCHOR, group = new T.Group(); group.name = 'verdant-wyrm-rig';
  var U = { uT: { value: 0 }, uPulse: { value: -1 }, uHeat: { value: 0 }, uAwake: { value: -1 }, uDim: { value: 0 }, uLow: { value: 0 }, uInv: { value: new T.Matrix4() } };
  var S = { t: 0, pulse: -1, heat: 0, awake: -1, dim: 0, boost: 0, flare: 0, flash: 0, rf: 0, reloading: false, low: false, pendingRearm: false, rearmFx: 0, chase: 9, blink: 0, nextBlink: 2.5 };
  var add = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
  function basic(color, opacity, extra) { var o = { color: color, opacity: opacity }; for (var k in add) o[k] = add[k]; for (var e in (extra || {})) o[e] = extra[e]; return new T.MeshBasicMaterial(o); }

  /* --- sculpted receiver scales and captive faceted reactor ------------------------------- */
  var emeraldArmor = new T.MeshPhongMaterial({ color: 0x0b2518, specular: 0x6ab88b, shininess: 126, emissive: 0x06160d, emissiveIntensity: .12, side: T.DoubleSide });
  var emeraldInlay = new T.MeshPhongMaterial({ color: 0x245a3c, specular: 0x9bffc1, shininess: 152, emissive: 0x0c2817, emissiveIntensity: .12, side: T.DoubleSide });
  var reactorBezelMat = new T.MeshPhongMaterial({ color: 0x101e17, specular: 0xa4e9be, shininess: 170, side: T.DoubleSide });
  var reactorMat = new T.MeshPhongMaterial({ color: 0x78ffad, specular: 0xf1fff6, emissive: 0x13894a, emissiveIntensity: .48, shininess: 190, transparent: true, opacity: .92 });
  global.SightlineLegendaryGeometry.addBilateralArmorPlate(T, group, 'revenant-2-sculpted-receiver-scales', .0285, .0075, .0015,
    [[.060,.006],[.039,.043],[-.025,.047],[-.091,.034],[-.126,.010],[-.102,-.014],[-.035,-.034],[.034,-.023]], emeraldArmor);
  global.SightlineLegendaryGeometry.addBilateralArmorPlate(T, group, 'revenant-2-jade-inset-bevels', .0325, .0018, .00045,
    [[.033,.008],[.013,.027],[-.031,.031],[-.081,.021],[-.100,.006],[-.076,-.009],[-.031,-.023],[.018,-.015]], emeraldInlay);
  var reactorCrystals = [];
  [-1, 1].forEach(function (side) {
    var bezel = new T.Mesh(new T.CylinderGeometry(.014,.014,.008,8,1), reactorBezelMat);
    bezel.name = 'revenant-2-reactor-collar-' + (side < 0 ? 'left' : 'right'); bezel.rotation.z = side * Math.PI / 2;
    bezel.position.set(side * .033, .014, -.044); group.add(bezel);
    var gem = new T.Mesh(new T.OctahedronGeometry(.010,0), reactorMat);
    gem.name = 'revenant-2-faceted-reactor-core-' + (side < 0 ? 'left' : 'right');
    gem.position.set(side * .039, .014, -.044); group.add(gem); reactorCrystals.push({ mesh: gem, side: side });
  });

  /* --- eyes ------------------------------------------------------------------------------- */
  var eyes = [];
  [-1, 1].forEach(function (side) {
    var m = new T.Mesh(new T.PlaneGeometry(.052, .03), basic(0xffffff, .95, { map: eyeTex(T), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(side * A.eye.x, A.eye.y, A.eye.z); m.rotation.y = side * Math.PI / 2; group.add(m); eyes.push(m);
  });

  /* --- spine fins on the top rail ------------------------------------------------------------ */
  var fins = [], finMats = [];
  var finGeo = new T.ConeGeometry(.0042, .018, 3, 1); finGeo.rotateZ(0); finGeo.translate(0, .009, 0);
  for (var i = 0; i < A.spine.n; i++) {
    var fm = new T.MeshBasicMaterial({ color: 0x39ff8a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 1 }); finMats.push(fm);
    var z = A.spine.z0 + (A.spine.z1 - A.spine.z0) * (i / (A.spine.n - 1));
    var fin = new T.Mesh(finGeo, fm); fin.position.set(0, A.spine.y, z); fin.rotation.x = -.35; fin.scale.set(1, .7 + .5 * Math.sin(i * 1.3 + 1) * .5 + .3, 1); group.add(fin); fins.push(fin);
  }

  /* --- handguard slats (both sides) ----------------------------------------------------------- */
  var slatMats = [];
  for (var s = 0; s < A.slats.n; s++) {
    var sm = new T.MeshBasicMaterial({ color: 0x30ff80, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 1 }); slatMats.push(sm);
    var sz = A.slats.z0 + (A.slats.z1 - A.slats.z0) * (s / (A.slats.n - 1));
    [-1, 1].forEach(function (side) { var b = new T.Mesh(new T.BoxGeometry(.0016, .02, .0085), sm); b.position.set(side * A.slats.x, A.slats.y, sz); group.add(b); });
  }

  /* --- muzzle ---------------------------------------------------------------------------------- */
  var mz = new T.Group(); mz.position.set(A.muzzle[0], A.muzzle[1], A.muzzle[2]); group.add(mz);
  var mzRing = new T.Mesh(new T.TorusGeometry(.0165, .0012, 6, 30), basic(0x4dff94, 0)); mz.add(mzRing);
  var flare = new T.Mesh(new T.PlaneGeometry(.4, .4), basic(0xffffff, 0, { map: flareTex(T) })); flare.position.z = -.02; mz.add(flare);
  var shock = [];
  for (var r = 0; r < 3; r++) { var rm = new T.Mesh(new T.RingGeometry(.02, .027, 6), basic(0x6dff9e, 0, { side: T.DoubleSide })); rm.visible = false; mz.add(rm); shock.push({ m: rm, t: 9 }); }   // hexagonal "scale" rings
  var shockNext = 0;

  /* --- spores: one Points draw call, vertex-shader animated ----------------------------------- */
  var NE = 52, seeds = new Float32Array(NE * 4), pos = new Float32Array(NE * 3), rs = 4242;
  function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
  for (var e = 0; e < NE; e++) { seeds[e * 4] = rnd(); seeds[e * 4 + 1] = rnd(); seeds[e * 4 + 2] = .5 + rnd() * 1.2; seeds[e * 4 + 3] = .45 + rnd() * .9; }
  var eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(pos, 3)); eg.setAttribute('aSeed', new T.BufferAttribute(seeds, 4));
  var emU = { uT: U.uT, uBoost: { value: 0 }, uScale: { value: 520 }, uZ0: { value: A.spore.z0 }, uZ1: { value: A.spore.z1 }, uC: { value: new T.Vector2(A.spore.cx, A.spore.cy) } };
  var emMat = new T.ShaderMaterial({
    uniforms: emU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader:
      'attribute vec4 aSeed; uniform float uT,uBoost,uScale,uZ0,uZ1; uniform vec2 uC; varying float vA; varying float vH;\n' +
      'void main(){ float u=fract(uT*.04*aSeed.z+aSeed.x); float ang=uT*aSeed.z*.8+aSeed.y*6.2832;\n' +
      ' float rad=(.04+.06*aSeed.x)*(1.+uBoost*.6);\n' +
      ' vec3 p=vec3(uC.x+cos(ang)*rad+sin(uT*1.3+aSeed.y*20.)*.012, uC.y-.02+u*.09+sin(ang*.7)*rad*.5, mix(uZ0,uZ1,u)+sin(uT*.9+aSeed.x*30.)*.02);\n' +
      ' vA=sin(3.14159*u)*(.55+.45*sin(uT*3.+aSeed.y*40.)); vH=aSeed.x; vec4 mv=modelViewMatrix*vec4(p,1.);\n' +
      ' gl_PointSize=clamp(aSeed.w*.016*uScale*(1.+uBoost*.8)/max(.05,-mv.z),1.,64.); gl_Position=projectionMatrix*mv; }',
    fragmentShader:
      'varying float vA; varying float vH;\n' +
      'void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); float a=smoothstep(.5,0.,d); a*=a;\n' +
      ' vec3 col=mix(vec3(.2,1.,.45),vec3(.8,1.,.3),step(.7,vH)); col=mix(col,vec3(1.,.98,.85),smoothstep(.16,0.,d)); gl_FragColor=vec4(col,a*vA); }'
  });
  var spores = new T.Points(eg, emMat); spores.frustumCulled = false; group.add(spores);
  var magArmor = global.SightlineLegendaryGeometry.buildLegendaryMagazineArmor(T, 'revenant-2', host,
    [[-.055,-.055],[-.084,-.065],[-.104,-.091],[-.132,-.132],[-.164,-.174],[-.192,-.198],[-.220,-.203],[-.236,-.184],[-.211,-.151],[-.184,-.108],[-.156,-.073],[-.132,-.050],[-.087,-.044]],
    .024, .0044, .0010, emeraldArmor, emeraldInlay, -.148);

  /* ---------------- state machine ---------------- */
  var mats = {};
  function dress(g, on) {
    if (!on) return;
    group.updateWorldMatrix(true, false);
    g.traverse(function (mesh) {
      if (!mesh.isMesh || !mesh.userData.finishBase || mesh.userData.finishBadge) return;
      var base = mesh.userData.finishBase, c = base.color, b = (c.r + c.g + c.b) / 3;
      if (b < .004 || b > .75 || base.transparent) return;
      var m = mats[base.uuid];
      if (!m) {
        var metal = b > .05;
        m = new T.MeshPhongMaterial({
          color: metal ? 0x0b1c13 : 0x050c08, specular: metal ? 0x5a9a70 : 0x2c4a38, shininess: metal ? 95 : 40,
          map: base.map || null, bumpMap: base.bumpMap || null, bumpScale: base.bumpScale || 1, envMap: null,
          reflectivity: metal ? .12 : .05, combine: T.MixOperation
        });
        patchMaterial(m, U, metal ? 1 : .65); mats[base.uuid] = m;
      }
      mesh.material = m;
    });
  }
  function fire() {
    S.pulse = 0; S.boost = Math.min(1, S.boost + .6); S.flare = 1; S.heat = Math.min(1, S.heat + .07); S.chase = 0; S.blink = .0;
    var sh = shock[shockNext]; shockNext = (shockNext + 1) % 3; sh.t = 0; sh.m.visible = !S.low;
  }
  function awaken() { S.awake = 0; S.flash = 1; S.boost = Math.max(S.boost, .9); }
  function rearm() { S.rearmFx = 1; S.pulse = 0; S.boost = Math.max(S.boost, .7); S.flash = Math.max(S.flash, .6); }
  function setReload(rf, is) { if (!S.reloading && is) S.pendingReload = true; if (S.reloading && !is) { S.pendingRearm = true; rearm(); } S.reloading = !!is; S.rf = rf || 0; }
  function setDetail(level) {
    var low = level === 'low'; if (low === S.low) return; S.low = low; U.uLow.value = low ? 1 : 0; eg.setDrawRange(0, low ? 18 : NE);
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function update(dt, o) {
    if (!group.visible || (group.parent && !group.parent.visible)) return;
    if (dt > .1) dt = .1; S.t += dt; U.uT.value = S.t;
    var dimT = S.reloading ? (S.rf < .72 ? .86 : .86 * (1 - clamp01((S.rf - .72) / .28))) : 0;
    S.dim += (dimT - S.dim) * Math.min(1, dt * 7); U.uDim.value = S.dim;
    if (S.pulse >= 0) { S.pulse += dt / .3; if (S.pulse > 1.15) S.pulse = -1; } U.uPulse.value = S.pulse;
    if (S.awake >= 0) { S.awake += dt / 1.1; if (S.awake > 1.15) S.awake = -1; } U.uAwake.value = S.awake;
    S.heat = Math.max(0, S.heat - dt * .3); U.uHeat.value = S.heat;
    S.boost = Math.max(0, S.boost - dt * 1.3); emU.uBoost.value = S.boost;
    S.flash = Math.max(0, S.flash - dt * 1.1); S.flare = Math.max(0, S.flare - dt * 9); S.rearmFx = Math.max(0, S.rearmFx - dt * 3);
    U.uInv.value.copy(group.matrixWorld).invert();
    emU.uScale.value = (global.innerHeight || 600) * .87 * (1 - ((o && o.ads) || 0) * .85);
    var live = 1 - S.dim * .8, fl = S.flash, ads = (o && o.ads) || 0, af = 1 - ads;
    for (var rc = 0; rc < reactorCrystals.length; rc++) {
      var rv = S.low ? .22 : (.42 + .22 * Math.sin(S.t * 2.6 + rc * Math.PI) + S.boost * .34 + S.heat * .24 + fl * .20);
      reactorCrystals[rc].mesh.rotation.y = reactorCrystals[rc].side * (S.t * .42 + S.boost * .22);
      reactorCrystals[rc].mesh.rotation.z = Math.sin(S.t * 1.4 + rc) * .08;
      reactorCrystals[rc].mesh.scale.setScalar(.92 + Math.max(0, rv) * .18);
      reactorMat.emissiveIntensity = .18 + Math.max(0, rv) * .58;
    }
    // eyes: slow blink, narrow + brighten on fire, flare on awaken
    S.nextBlink -= dt; if (S.nextBlink <= 0) { S.blink = .0001; S.nextBlink = 2.2 + (Math.sin(S.t * 12.9) * .5 + .5) * 3.2; }
    var lid = 1; if (S.blink > 0) { S.blink += dt / .22; lid = Math.abs(1 - 2 * Math.min(1, S.blink)); lid = .08 + .92 * lid; if (S.blink >= 1) S.blink = 0; }
    var narrow = 1 - S.boost * .35;
    var eo = Math.min(1, (.7 + .25 * Math.sin(S.t * 1.8)) * live + fl * .4 + S.boost * .35 + S.heat * .2);
    for (var q = 0; q < 2; q++) { eyes[q].scale.set(1 + fl * .25, lid * narrow * (1 + fl * .2), 1); eyes[q].material.opacity = eo; }
    // spine fins: slow breathing ripple + chase after each shot
    S.chase += dt * 30;
    for (var k = 0; k < fins.length; k++) {
      var ch = Math.exp(-Math.pow(S.chase - k * 1.1, 2) * .35) * (S.chase < 14 ? 1 : 0);
      var idle = (.3 + .25 * Math.sin(S.t * 2.1 - k * .7)) * live, v = Math.min(1, idle + ch + S.heat * .4 + fl * .5);
      finMats[k].color.setRGB(.15 + .5 * ch, .6 + .4 * v, .3 + .1 * ch); finMats[k].opacity = (.25 + .75 * v) * af * af; fins[k].visible = af > .03;
      fins[k].rotation.x = -.35 + S.dim * 1.15 - S.boost * .25 * Math.sin(S.t * 18 + k);
    }
    for (var m = 0; m < slatMats.length; m++) {
      var sv = Math.min(1, (.3 + .3 * Math.sin(S.t * 1.7 + m * 1.1)) * live + S.heat * .5 + S.boost * .35 + fl * .4);
      slatMats[m].color.setRGB(.15 + .35 * S.boost, .6 + .4 * sv, .3 + .2 * S.boost); slatMats[m].opacity = .2 + .8 * sv;
    }
    // muzzle
    mzRing.material.opacity = S.flare * .85 + S.heat * .3 * live; mzRing.visible = mzRing.material.opacity > .01;
    var fs = .22 + S.flare * .6; flare.scale.set(fs, fs, 1); flare.material.opacity = S.flare; flare.visible = S.flare > .01; flare.rotation.z += dt * 3;
    for (var z = 0; z < shock.length; z++) {
      var sh = shock[z]; if (!sh.m.visible) continue; sh.t += dt / .24;
      if (sh.t >= 1) { sh.m.visible = false; continue; }
      var sc = 1 + sh.t * 6; sh.m.scale.set(sc, sc, 1); sh.m.rotation.z = sh.t * 1.2; var inv = 1 - sh.t; sh.m.material.opacity = inv * inv * .85;
    }
  }
  function takeReload() { var p = S.pendingReload; S.pendingReload = false; return p; }
  function takeRearm() { var p = S.pendingRearm; S.pendingRearm = false; return p; }
  return {
    kind: 'verdant', group: group, update: update, fire: fire, awaken: awaken, rearm: rearm,
    setReload: setReload, setDetail: setDetail, dress: dress, takeRearm: takeRearm, takeReload: takeReload, state: S, uniforms: U,
    mount: function (root) { root.add(group); if (magArmor && root.userData && root.userData.mag && magArmor.parent !== root.userData.mag) root.userData.mag.add(magArmor); },
    setVisible: function (v) { group.visible = !!v; if (magArmor) magArmor.visible = !!v; },
    dispose: function () { group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  };
}

/* ------------------------------------------------------------------ world effects */
function createFx(T, scene) {
  var NB = 6, beams = [], UT = { value: 0 }, clock = 0;
  var bvs = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
  var bfs =
    'varying vec2 vUv; uniform float uHead,uAlpha,uLen,uT;\n' +
    'void main(){ float x=vUv.x, y=(vUv.y-.5)*2.; float L=uLen;\n' +
    ' float d=x-uHead; float tail=smoothstep(-.4,0.,d)*step(d,0.); float head=exp(-d*d*1500.);\n' +
    ' float fade=smoothstep(0.,.02,x)*uAlpha;\n' +
    ' float core=exp(-y*y*30.); float body=exp(-y*y*5.5);\n' +
    ' float w=sin(x*L*1.7-uT*38.)*.5; float s1=exp(-pow((y-w)*9.,2.)), s2=exp(-pow((y+w)*9.,2.));\n' +
    ' vec3 em=vec3(.1,1.,.5), lime=vec3(.78,1.,.3), white=vec3(.92,1.,.88);\n' +
    ' vec3 col=white*core*(.45+tail*1.2+head*1.6)+em*s1*(tail*.9+head)+lime*s2*(tail*.9+head)+em*body*.07*uAlpha;\n' +
    ' float a=(core*(.45+tail+head)+s1*tail+s2*tail+body*.07)*fade; gl_FragColor=vec4(col*fade,clamp(a,0.,1.)); }';
  var planeGeo = new T.PlaneGeometry(1, 1);
  for (var i = 0; i < NB; i++) {
    var U = { uHead: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 1 }, uT: UT };
    var mat = new T.ShaderMaterial({ uniforms: U, vertexShader: bvs, fragmentShader: bfs, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    var g = new T.Group(), p1 = new T.Mesh(planeGeo, mat), p2 = new T.Mesh(planeGeo, mat); p2.rotation.x = Math.PI / 2;
    g.add(p1, p2); g.visible = false; g.frustumCulled = false; p1.frustumCulled = p2.frustumCulled = false; scene.add(g);
    beams.push({ g: g, U: U, t: 9, ttl: .16, amp: 1 });
  }
  var nextBeam = 0, dir = new T.Vector3(), mid = new T.Vector3(), xAxis = new T.Vector3(1, 0, 0), qa = new T.Quaternion();
  var NS = 80, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sv = new Float32Array(NS * 3), sl = new Float32Array(NS), sm = new Float32Array(NS);
  var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); sg.setAttribute('color', new T.BufferAttribute(sc, 3));
  var sMat = new T.PointsMaterial({ size: .08, vertexColors: true, map: discTex(T), sizeAttenuation: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  var sparks = new T.Points(sg, sMat); sparks.frustumCulled = false; scene.add(sparks); sparks.visible = false; var sparkDirty = false;
  for (var s = 0; s < NS; s++) sp[s * 3 + 1] = -999;
  var sNext = 0, NR = 4, rings = [], killEnd = new T.Vector3(), killView = new T.Vector3();
  for (var r = 0; r < NR; r++) {
    var rm = new T.Mesh(new T.RingGeometry(.1, .135, 6), new T.MeshBasicMaterial({ color: 0x5dff9a, opacity: 0, side: T.DoubleSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    rm.visible = false; scene.add(rm); rings.push({ m: rm, t: 9 });
  }
  var rNext = 0, fMat = new T.SpriteMaterial({ map: flareTex(T), color: 0xc8ffd0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 });
  var flash = new T.Sprite(fMat); flash.visible = false; scene.add(flash); var flashT = 9, low = false;
  function spawn(a, end, o) {
    o = o || {}; var b = beams[nextBeam]; nextBeam = (nextBeam + 1) % NB;
    dir.subVectors(end, a); var L = dir.length(); if (L < .05) return; dir.multiplyScalar(1 / L);
    mid.addVectors(a, end).multiplyScalar(.5); b.g.position.copy(mid); qa.setFromUnitVectors(xAxis, dir); b.g.quaternion.copy(qa);
    var w = o.amp ? .08 : .16; b.g.children[0].scale.set(L, w, 1); b.g.children[1].scale.set(L, w, 1);
    b.U.uLen.value = Math.min(L, 60); b.ttl = o.ttl || .16; b.t = 0; b.g.visible = true; b.amp = o.amp || 1;
  }
  function burst(p, from, big) { sparkDirty = true; sparks.visible = true;
    var n = low ? 6 : (big ? 16 : 9), k; dir.subVectors(from, p).normalize();
    for (k = 0; k < n; k++) {
      var i = sNext; sNext = (sNext + 1) % NS;
      sp[i * 3] = p.x; sp[i * 3 + 1] = p.y; sp[i * 3 + 2] = p.z;
      var v = 1 + Math.random() * 4;   // spores drift up and slow, unlike hot sparks
      sv[i * 3] = (dir.x * .6 + (Math.random() - .5) * 1.5) * v; sv[i * 3 + 1] = (dir.y * .6 + Math.random() * 1.3) * v; sv[i * 3 + 2] = (dir.z * .6 + (Math.random() - .5) * 1.5) * v;
      sl[i] = sm[i] = .4 + Math.random() * .6;
    }
    var ring = rings[rNext]; rNext = (rNext + 1) % NR; ring.t = 0; ring.m.visible = true; ring.m.position.copy(p).addScaledVector(dir, .02); ring.m.lookAt(from);
    flash.position.copy(p).addScaledVector(dir, .05); flashT = 0; flash.visible = true;
  }
  function eliminate(p, from) {
    killView.copy(from || killEnd.set(p.x, p.y + 1, p.z + 1));
    if (killView.distanceToSquared(p) < .01) killView.set(p.x, p.y + 1, p.z + 1);
    burst(p, killView, true);
    // Emerald Revenant sheds a short rotating halo of spores and jade arcs.
    var helix = [[-.20,.10,.12],[.12,.20,.20],[.23,.30,-.04],[.02,.34,-.22],[-.22,.24,-.10],[.08,.12,.24]];
    var count = low ? 3 : helix.length;
    for (var k = 0; k < count; k++) {
      var d = helix[k]; killEnd.set(p.x + d[0], p.y + d[1], p.z + d[2]);
      spawn(p, killEnd, { ttl: .20, amp: .72 });
    }
  }
  function tick(dt) {
    clock += dt; UT.value = clock; var i;
    for (i = 0; i < NB; i++) { var b = beams[i]; if (!b.g.visible) continue; b.t += dt; var u = b.t / b.ttl; if (u >= 1) { b.g.visible = false; continue; } b.U.uHead.value = Math.min(1.4, u * 2.4 - .1); b.U.uAlpha.value = (1 - u * u) * Math.min(1, b.amp); }
    if (sparkDirty) { var anyLive = false; for (i = 0; i < NS; i++) {
      if (sl[i] <= 0) { sp[i * 3 + 1] = -999; continue; } anyLive = true;
      sl[i] -= dt; var f = Math.max(0, sl[i] / sm[i]);
      sv[i * 3 + 1] -= 3.2 * dt; sv[i * 3] *= .985; sv[i * 3 + 2] *= .985;
      sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
      sc[i * 3] = f * (.3 + .4 * f); sc[i * 3 + 1] = f; sc[i * 3 + 2] = f * .4;
    }
    sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; if (!anyLive) { sparkDirty = false; sparks.visible = false; } }
    for (i = 0; i < NR; i++) { var r = rings[i]; if (!r.m.visible) continue; r.t += dt / .3; if (r.t >= 1) { r.m.visible = false; continue; } var k2 = 1 + r.t * 5; r.m.scale.set(k2, k2, 1); r.m.rotation.z = r.t; r.m.material.opacity = (1 - r.t) * (1 - r.t) * .8; }
    if (flash.visible) { flashT += dt / .14; if (flashT >= 1) flash.visible = false; else { var fs = .45 + flashT * .8; flash.scale.set(fs, fs, 1); fMat.opacity = (1 - flashT) * .85; } }
  }
  return { spawn: spawn, burst: burst, eliminate: eliminate, signature: 'revenant-jade-helix', tick: tick, setLow: function (v) { low = !!v; } };
}

/* ------------------------------------------------------------------ audio */
function prng(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; }; }
function norm(d, peak) { var m = 0, i; for (i = 0; i < d.length; i++) { var a = Math.abs(d[i]); if (a > m) m = a; } if (m > 0) { var k = peak / m; for (i = 0; i < d.length; i++) d[i] *= k; } return d; }
var TAU = Math.PI * 2;
function equipSound(sr) {   // breathy growl swelling up, then a three-note jade bell
  var n = Math.floor(sr * 1.4), d = new Float32Array(n), r = prng(31), lp = 0, lp2 = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, sw = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.0)), 1.4) * (t < 1 ? 1 : Math.exp(-(t - 1) * 6));
    var v = Math.sin(TAU * (40 * t + 18 * t * t)) * sw * (.7 + .3 * Math.sin(TAU * 7 * t)) * .45;
    lp += (r() - lp) * .06; lp2 += (lp - lp2) * .2; v += lp2 * sw * 1.1;
    [[.7, 523], [.84, 659], [.98, 784]].forEach(function (nt) { var c = t - nt[0]; if (c > 0) v += (Math.sin(TAU * nt[1] * c) + .4 * Math.sin(TAU * nt[1] * 2.01 * c)) * Math.exp(-5.5 * c) * .15; });
    d[i] = v;
  }
  return norm(d, .8);
}
function rearmSound(sr) {   // scale rattle + rising hiss
  var n = Math.floor(sr * .5), d = new Float32Array(n), r = prng(37), prev = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, nz = r(), hp = nz - prev; prev = nz; var v = 0;
    for (var c = 0; c < 6; c++) { var tt = t - (.02 + c * .045); if (tt > 0) v += hp * Math.exp(-tt * 140) * .45; }
    v += Math.sin(TAU * (500 * t + 1500 * t * t)) * Math.sin(Math.PI * Math.min(1, t / .4)) * .18 * (t < .4 ? 1 : 0);
    var cc = t - .3; if (cc > 0) v += Math.sin(TAU * 988 * cc) * Math.exp(-10 * cc) * .22;
    d[i] = v;
  }
  return norm(d, .75);
}
function mixShot(sr, base) {   // short layer: the Stinger is full-auto, so it must not pile up
  var n = Math.max(base ? base.length : 0, Math.floor(sr * .3)), d = new Float32Array(n), r = prng(41), prev = 0, i;
  for (i = 0; i < n; i++) {
    var t = i / sr, v = (base && i < base.length ? base[i] * .78 : 0);
    v += Math.sin(TAU * (120 * t - 120 * t * t)) * Math.exp(-22 * t) * .45;
    var nz = r(), hp = nz - prev; prev = nz; v += hp * Math.exp(-t * 55) * .32 + nz * Math.exp(-t * 160) * .3;
    v += Math.sin(TAU * 1175 * t + 3 * Math.sin(TAU * 9 * t)) * Math.exp(-16 * t) * .1;
    d[i] = Math.tanh(v * 1.2);
  }
  return norm(d, .85);
}

/* ------------------------------------------------------------------ picker card */
var styled = false;
function decorate(btn) {
  if (!styled && document.head) {
    var st = document.createElement('style');
    st.textContent = '@keyframes wyrmPulse{0%,100%{box-shadow:0 0 6px #19e07a55,inset 0 0 8px #0a5a3022}50%{box-shadow:0 0 16px #3dff94cc,inset 0 0 14px #19e07a44}}@keyframes wyrmBlink{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}' +
      '.wyrm-card{background:linear-gradient(135deg,#050d09,#0d2a1c 55%,#17321a)!important;border:1px solid #3dff94!important;animation:wyrmPulse 2.4s ease-in-out infinite;position:relative;overflow:hidden}' +
      '.wyrm-card .wyrm-eye{position:absolute;right:8px;top:9px;width:34px;height:18px;border-radius:50%;background:radial-gradient(ellipse at center,#f4ffc4 0 14%,#7dff8f 30%,#14b45a 62%,#04361c 100%);border:1px solid #c8ffb0;animation:wyrmBlink 4s infinite}' +
      '.wyrm-card .wyrm-eye:after{content:"";position:absolute;left:50%;top:10%;width:4px;height:80%;margin-left:-2px;background:#020805;border-radius:50%}' +
      '.wyrm-tag{display:inline-block;margin-top:5px;padding:1px 6px;font:700 9px system-ui;letter-spacing:1.5px;color:#00200e;background:linear-gradient(90deg,#9dffb8,#3dff94);border-radius:3px}';
    document.head.appendChild(st); styled = true;
  }
  btn.classList.add('wyrm-card'); btn.style.color = '#e6ffee';
  var eye = document.createElement('span'); eye.className = 'wyrm-eye'; btn.appendChild(eye);
  var tag = document.createElement('span'); tag.className = 'wyrm-tag'; tag.textContent = 'LEGENDARY'; btn.appendChild(document.createElement('br')); btn.appendChild(tag);
}

function lpf(d, a) { var y = 0; for (var i = 0; i < d.length; i++) { y += (d[i] - y) * a; d[i] = y; } return d; }
function reloadSound(sr) {   // serpent hiss + scale clatter + low growl
  var n = Math.floor(sr * .8), d = new Float32Array(n), r = prng(41), i, prev = 0;
  for (i = 0; i < n; i++) {
    var t = i / sr, x = r(), hp = x - prev; prev = x;
    var v = hp * Math.exp(-3.2 * t) * .32 + Math.sin(TAU * (92 - 40 * t) * t) * Math.exp(-2.5 * t) * .3;
    [.08, .17, .28, .42].forEach(function (c) { var tt = t - c; if (tt > 0) v += r() * Math.exp(-tt * 220) * .4; });
    d[i] = v;
  }
  return norm(d, .75);
}
function hitSound(sr) {   // chitin crack + short hiss
  var n = Math.floor(sr * .3), d = new Float32Array(n), r = prng(43), i, prev = 0;
  for (i = 0; i < n; i++) {
    var t = i / sr, x = r(), hp = x - prev; prev = x;
    d[i] = x * Math.exp(-t * 110) * .55 + Math.sin(TAU * (60 + 70 * Math.exp(-25 * t)) * t) * Math.exp(-t * 16) * .5 + hp * Math.exp(-t * 14) * .2;
  }
  return norm(d, .8);
}

global.SightlineEmeraldRevenant = {
  version: 'G2.0-dev', weapon: 'rook117', finish: FINISH, anchors: ANCHOR,
  buildRig: buildRig, createFx: createFx, decorate: decorate,
  equipSound: equipSound, rearmSound: rearmSound, reloadSound: reloadSound, hitSound: hitSound, mixShot: mixShot
};
})(window);

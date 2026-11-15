/* Sightline V3 third-person articulated grip hands.
 * A single skinned mesh per hand keeps the per-bot cost bounded. The palm
 * and five digits use separate bone chains; weapon placement stays owned by
 * the existing world-grip sockets in index.html.
 */
(function (global) {
  'use strict';
  var geometryCache = Object.create(null), materialCache = Object.create(null);

  function colorKey(c) { return c.map(function (x) { return Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0'); }).join(''); }
  function cachedMaterial(T, glove, skin, style) {
    var key = colorKey(glove) + ':' + colorKey(skin) + ':' + style;
    if (materialCache[key]) return materialCache[key];
    var m = new T.MeshLambertMaterial({ color: 0xffffff, vertexColors: T.VertexColors });
    // Three.js r128 does not infer skinning from SkinnedMesh; without this
    // flag its shader renders every finger in the bind pose and ignores bones.
    m.skinning = true;
    materialCache[key] = m;
    return m;
  }
  function buildGeometry(T, side, glove, skin, style) {
    var key = side + ':' + colorKey(glove) + ':' + colorKey(skin) + ':' + style;
    if (geometryCache[key]) return geometryCache[key];
    var positions = [], normals = [], colors = [], indices = [], skinIndices = [], skinWeights = [], bones = [];
    function vertex(p, n, color, bone) {
      positions.push(p[0], p[1], p[2]); normals.push(n[0], n[1], n[2]);
      colors.push(color[0], color[1], color[2]);
      skinIndices.push(bone, 0, 0, 0); skinWeights.push(1, 0, 0, 0);
      return positions.length / 3 - 1;
    }
    function tri(a, b, c) { indices.push(a, b, c); }
    var palm = new T.Bone(); palm.name = side > 0 ? 'Sightline_Right_Palm' : 'Sightline_Left_Palm'; bones.push(palm);
    function addPalmEllipsoid(center, radii, bone, tint) {
      var rows = 7, cols = 12, start = positions.length / 3;
      for (var i = 0; i <= rows; i++) {
        var theta = Math.PI * i / rows;
        for (var j = 0; j <= cols; j++) {
          var phi = Math.PI * 2 * j / cols;
          var nx = Math.sin(theta) * Math.cos(phi), ny = Math.cos(theta), nz = Math.sin(theta) * Math.sin(phi);
          var n = [nx / radii[0], ny / radii[1], nz / radii[2]], nl = Math.hypot(n[0], n[1], n[2]) || 1;
          vertex([center[0] + nx * radii[0], center[1] + ny * radii[1], center[2] + nz * radii[2]], [n[0] / nl, n[1] / nl, n[2] / nl], tint, bone);
        }
      }
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var a = start + y * (cols + 1) + x, b = a + cols + 1;
        tri(a, a + 1, b); tri(b, a + 1, b + 1);
      }
    }
    function addFingerSegment(base, length, radius, bone, tint, boneLocalBasis) {
      var ringCount = 6, around = 8, start = positions.length / 3;
      var z = [-.002, 0, length * .25, length * .72, length, length + .002];
      var scale = [.54, 1, .96, .82, .66, .25];
      for (var r = 0; r < ringCount; r++) for (var a = 0; a <= around; a++) {
        var angle = Math.PI * 2 * a / around, xx = Math.cos(angle), yy = Math.sin(angle);
        // Short segments overlap at the knuckles, so bending does not open a
        // visible gap between phalanges at normal gameplay distance.
        var p = [base[0] + xx * radius * scale[r], base[1] + yy * radius * .82 * scale[r], base[2] + z[r]];
        vertex(p, [xx, yy, .18], tint, bone);
      }
      for (var rr = 0; rr < ringCount - 1; rr++) for (var aa = 0; aa < around; aa++) {
        var q = start + rr * (around + 1) + aa, n = q + around + 1;
        tri(q, q + 1, n); tri(q + 1, n + 1, n);
      }
    }
    function addDigit(label, rootPos, lengths, tint, splay) {
      var chain = [], parent = palm, pos = rootPos.slice();
      for (var j = 0; j < 3; j++) {
        var b = new T.Bone(); b.name = label + (j === 0 ? '_MCP' : j === 1 ? '_PIP' : '_DIP');
        if (j === 0) b.position.set(rootPos[0], rootPos[1], rootPos[2]);
        else b.position.set(0, 0, lengths[j - 1]);
        parent.add(b); bones.push(b); chain.push(b);
        addFingerSegment(pos, lengths[j], j === 0 ? .0105 : j === 1 ? .0092 : .0076, bones.length - 1, tint);
        pos = [pos[0], pos[1], pos[2] + lengths[j]]; parent = b;
      }
      chain[0].rotation.y = splay || 0;
      return chain;
    }

    // Glove back and palm bridge sit under the existing sleeve cuff.
    addPalmEllipsoid([0, 0, .038], [.040, .0155, .047], 0, glove);
    addPalmEllipsoid([0, .005, .062], [.028, .010, .023], 0, glove.map(function (v) { return v * .87; }));
    var fingers = {}, spacing = [.026, .008, -.009, -.025];
    var names = ['Index', 'Middle', 'Ring', 'Pinky'];
    for (var i = 0; i < 4; i++) {
      var fx = -side * spacing[i], fl = i === 3 ? [.031, .023, .018] : i === 0 ? [.034, .026, .019] : [.033, .025, .019];
      var tone = (style === 'fingerless' && i === 0) ? skin : glove;
      fingers[names[i].toLowerCase()] = addDigit(names[i], [fx, 0, .068], fl, tone, (i - 1.5) * .045 * -side);
    }
    // Thumb lies across the side/front of the grip; its three joints are
    // independent so the support hand can oppose the curled fingers.
    var thumb = new T.Bone(); thumb.name = side > 0 ? 'Thumb_Right_CMC' : 'Thumb_Left_CMC';
    thumb.position.set(-side * .034, .001, .033); palm.add(thumb); bones.push(thumb);
    var thumb1 = new T.Bone(); thumb1.name = 'Thumb_MCP'; thumb1.position.set(0, 0, .025); thumb.add(thumb1); bones.push(thumb1);
    var thumb2 = new T.Bone(); thumb2.name = 'Thumb_IP'; thumb2.position.set(0, 0, .020); thumb1.add(thumb2); bones.push(thumb2);
    addFingerSegment([-side * .034, .001, .033], .025, .0115, bones.length - 3, glove);
    addFingerSegment([-side * .034, .001, .058], .020, .0098, bones.length - 2, glove);
    addFingerSegment([-side * .034, .001, .078], .016, .0080, bones.length - 1, glove);

    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndices, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(skinWeights, 4));
    g.setIndex(indices); g.computeBoundingBox(); g.computeBoundingSphere();
    g.userData.sightlineFingerBoneNames = bones.slice(1).map(function (b) { return b.name; });
    geometryCache[key] = { geometry: g, boneNames: g.userData.sightlineFingerBoneNames };
    return geometryCache[key];
  }
  function setGrip(rig, gripClass, side, trigger, pulse) {
    if (!rig) return;
    var dominant = side > 0, hand = rig.userData.handJoints, supportCurl = gripClass === 'shotgun' || gripClass === 'lmg' ? .76 : gripClass === 'pistol' ? .58 : gripClass === 'marksman' ? .52 : .65;
    var fire = Math.max(0, Math.min(1, trigger || 0)), index = hand.index;
    // Both hands curl toward the palm (positive local X rotation around the
    // +Z finger axis). The left hand used to invert this sign, opening its
    // fingers away from the support grip and creating the floating-hand look.
    // Keep the trigger finger comparatively straight at its base, then bend
    // the two distal joints toward the grip; firing adds a short cosmetic
    // squeeze without touching weapon timing or combat logic.
    var curl = dominant ? { index: [.025, .10 + fire * .34, .14 + fire * .50], middle: [.62, .74, .56], ring: [.66, .76, .58], pinky: [.70, .78, .60] }
      : { index: [supportCurl * .72, supportCurl, supportCurl * .82], middle: [supportCurl, supportCurl * 1.06, supportCurl * .82], ring: [supportCurl * 1.04, supportCurl * 1.08, supportCurl * .84], pinky: [supportCurl * 1.08, supportCurl * 1.1, supportCurl * .86] };
    Object.keys(curl).forEach(function (name) { var chain = hand[name]; for (var i = 0; i < chain.length; i++) chain[i].rotation.x = curl[name][i]; });
    hand.thumb[0].rotation.y = (dominant ? 1 : -1) * .34;
    hand.thumb[0].rotation.x = dominant ? .14 : .20;
    hand.thumb[1].rotation.x = dominant ? .25 : .34;
    hand.thumb[2].rotation.x = dominant ? .28 : .36;
    hand.index[0].rotation.z = (dominant ? -1 : 1) * .035;
    rig.userData.gripClass = gripClass; rig.userData.triggerWeight = fire; rig.userData.recoilPulse = pulse || 0;
  }
  function create(T, spec, side, gripClass) {
    if (!spec) return null;
    var hand = new T.Group(); hand.name = side > 0 ? 'Sightline_Articulated_Right_Hand' : 'Sightline_Articulated_Left_Hand';
    hand.position.fromArray(spec.offset || [0, 0, 0]);
    var basis = new T.Matrix4();
    basis.makeBasis(new T.Vector3().fromArray(spec.lateral), new T.Vector3().fromArray(spec.normal), new T.Vector3().fromArray(spec.direction));
    hand.quaternion.setFromRotationMatrix(basis);
    var data = buildGeometry(T, side, spec.gloveColor, spec.skinColor, spec.style), mesh = new T.SkinnedMesh(data.geometry, cachedMaterial(T, spec.gloveColor, spec.skinColor, spec.style));
    mesh.name = hand.name + '_SkinnedMesh'; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    var root = new T.Bone(); root.name = side > 0 ? 'Right_Palm_Root' : 'Left_Palm_Root'; mesh.add(root);
    var bones = [root];
    // Build a fresh, cheap armature matching the cached geometry's bone order.
    // The cached descriptor stores names; branch and local offsets are stable by role.
    var names = data.boneNames, map = Object.create(null);
    for (var ni = 0; ni < names.length; ni++) {
      var name = names[ni], parent = root, pos;
      if (/^(Index|Middle|Ring|Pinky)_/.test(name)) {
        var parts = name.split('_'), digit = parts[0], joint = parts[1];
        if (joint === 'MCP') {
          var index = digit === 'Index', middle = digit === 'Middle', ring = digit === 'Ring', pinky = digit === 'Pinky';
          var baseX = -side * (index ? .026 : middle ? .008 : ring ? -.009 : -.025);
          pos = [baseX, 0, .068]; parent = root;
        } else {
          var prev = joint === 'PIP' ? digit + '_MCP' : digit + '_PIP'; parent = map[prev];
          var lengths = digit === 'Index' ? [.034, .026, .019] : digit === 'Pinky' ? [.031, .023, .018] : [.033, .025, .019];
          pos = [0, 0, joint === 'PIP' ? lengths[0] : lengths[1]];
        }
      } else {
        var tparts = name.split('_');
        if (tparts[1] === 'Right' || tparts[1] === 'Left') { parent = root; pos = [-side * .034, .001, .033]; }
        else { var tprev = tparts[1] === 'MCP' ? (side > 0 ? 'Thumb_Right_CMC' : 'Thumb_Left_CMC') : 'Thumb_MCP'; parent = map[tprev]; pos = [0, 0, tparts[1] === 'MCP' ? .025 : .020]; }
      }
      var b = new T.Bone(); b.name = name; b.position.set(pos[0], pos[1], pos[2]); parent.add(b); bones.push(b); map[name] = b;
    }
    // Capture inverse-bind matrices from the authored rest pose. If this runs
    // before matrixWorld is updated, the rest-pose translations are applied a
    // second time at render, producing detached/fan-shaped fingers.
    mesh.updateMatrixWorld(true);
    var skel = new T.Skeleton(bones); mesh.bind(skel, new T.Matrix4());
    hand.add(mesh); hand.userData.handJoints = {
      index: [map.Index_MCP, map.Index_PIP, map.Index_DIP], middle: [map.Middle_MCP, map.Middle_PIP, map.Middle_DIP],
      ring: [map.Ring_MCP, map.Ring_PIP, map.Ring_DIP], pinky: [map.Pinky_MCP, map.Pinky_PIP, map.Pinky_DIP],
      thumb: [map[side > 0 ? 'Thumb_Right_CMC' : 'Thumb_Left_CMC'], map.Thumb_MCP, map.Thumb_IP]
    };
    hand.userData.fingerBoneCount = names.length;
    setGrip(hand, gripClass || 'rifle', side, 0, 0);
    return hand;
  }
  function bind(rig) {
    if (!rig) return false;
    rig.updateMatrixWorld(true);
    var meshes = [];
    rig.traverse(function (o) { if (o.isSkinnedMesh && o.skeleton) meshes.push(o); });
    for (var i = 0; i < meshes.length; i++) {
      var mesh = meshes[i]; mesh.updateMatrixWorld(true);
      // Claude's arms are mounted and oriented by the live character rig. Bind
      // only after that hierarchy exists, so every later arm pose is a delta
      // from the true character-space rest transform rather than world origin.
      mesh.skeleton.calculateInverses();
      mesh.bind(mesh.skeleton, mesh.matrixWorld.clone());
      mesh.skeleton.update();
    }
    rig.userData.boundToCharacter = true;
    return true;
  }
  global.SightlineThirdPersonHands = { create: create, bind: bind, setGrip: setGrip, cacheStats: function () { return { geometries: Object.keys(geometryCache).length, materials: Object.keys(materialCache).length }; } };
})(window);

/* Sightline VR-18 V3.3-R P1 (clean visual polish) — shared first-person mesh source. Original procedural art.
   Pure geometry: no ballistics, frame callbacks, globals beyond THREE or gameplay state.
   Static parts are batched per material to bound Android draw calls. */
(function (root) {
  'use strict';
  function build(THREE) {
    var palette = {
      receiver: new THREE.MeshPhongMaterial({ color: 0x333b3c, specular: 0x657172, shininess: 42 }),
      upper: new THREE.MeshPhongMaterial({ color: 0x606b6c, specular: 0x727c7e, shininess: 38 }),
      guard: new THREE.MeshPhongMaterial({ color: 0xc0a77f, specular: 0x72624b, shininess: 19 }),
      guardEdge: new THREE.MeshPhongMaterial({ color: 0xa38e6c, specular: 0x726451, shininess: 26 }),
      polymer: new THREE.MeshPhongMaterial({ color: 0x222625, specular: 0x343d3c, shininess: 13 }),
      rubber: new THREE.MeshPhongMaterial({ color: 0x121516, specular: 0x252829, shininess: 10 }),
      rail: new THREE.MeshPhongMaterial({ color: 0x171c1e, specular: 0x515b5e, shininess: 75 }),
      hardware: new THREE.MeshPhongMaterial({ color: 0x536063, specular: 0x707c7d, shininess: 54 }),
      recess: new THREE.MeshPhongMaterial({ color: 0x131716, specular: 0x242928, shininess: 13 }),
      marking: new THREE.MeshPhongMaterial({ color: 0x939183, specular: 0x78796e, shininess: 22 }),
      darkEdge: new THREE.MeshPhongMaterial({color:0x14191b,specular:0x525b5d,shininess:55}),
      gripInset: new THREE.MeshPhongMaterial({color:0x282e2d,specular:0x3e4744,shininess:19}),
      softTrim: new THREE.MeshPhongMaterial({color:0x625942,specular:0x706851,shininess:24})
    };
    // Small deterministic shared grain map breaks up large flat plastic surfaces.
    // One 64x64 texture (~16 KiB raw) uses no remote images or normal-map shader.
    function micrograin() {
      var canvas=document.createElement('canvas'); canvas.width=canvas.height=64;
      var ctx=canvas.getContext('2d'), data=ctx.createImageData(64,64), seed=29013;
      for(var i=0;i<64*64;i++){
        seed=(Math.imul(seed,1664525)+1013904223)|0;
        var v=235+((seed>>>26)&15);
        data.data[4*i]=data.data[4*i+1]=data.data[4*i+2]=v;
        data.data[4*i+3]=255;
      }
      ctx.putImageData(data,0,0);
      var t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;
      t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
      return t;
    }
    var grain=micrograin();
    palette.receiver.map=grain;palette.upper.map=grain;palette.guard.map=grain;
    // Dithered 32x32 bump signal creates micro-surface relief in existing Phong
    // lighting. A single shared CanvasTexture (~4 KiB raw) avoids new assets.
    var bumpCanvas=document.createElement('canvas');bumpCanvas.width=bumpCanvas.height=32;
    var bumpCtx=bumpCanvas.getContext('2d'), bumpData=bumpCtx.createImageData(32,32), rnd=47851;
    for(var bi=0;bi<1024;bi++){
      rnd=(Math.imul(rnd,1664525)+1013904223)|0;
      var bv=117+((rnd>>>27)&31);
      bumpData.data[bi*4]=bumpData.data[bi*4+1]=bumpData.data[bi*4+2]=bv;
      bumpData.data[bi*4+3]=255;
    }
    bumpCtx.putImageData(bumpData,0,0);
    var bump=new THREE.CanvasTexture(bumpCanvas);
    bump.wrapS=bump.wrapT=THREE.RepeatWrapping;
    bump.magFilter=THREE.LinearFilter;bump.minFilter=THREE.LinearMipmapLinearFilter;
    [palette.receiver,palette.upper,palette.guard,palette.guardEdge,palette.polymer].forEach(function(m){
      m.bumpMap=bump;m.bumpScale=(m===palette.guard||m===palette.guardEdge)?.0018:.0009;m.needsUpdate=true;
    });
    // Mesh buffers are created once at startup. Welding repeated details into
    // material batches avoids one draw call per bolt, vent, or rail tooth.
    var unitBox = new THREE.BoxGeometry(1, 1, 1);
    var cylCache = {};
    function cylinder(r, count) {
      var key = count || 12;
      return cylCache[key] || (cylCache[key] = new THREE.CylinderGeometry(1, 1, 1, key));
    }
    function batch(parent, name) {
      var groups = new Map(), counted = 0;
      function put(geo, mat, x, y, z, sx, sy, sz, rx, ry, rz) {
        var matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
          new THREE.Vector3(sx, sy, sz));
        var nmat = new THREE.Matrix3().getNormalMatrix(matrix);
        var src = geo.index ? geo.toNonIndexed() : geo;
        var pos = src.getAttribute('position'), normal = src.getAttribute('normal'), uv = src.getAttribute('uv');
        var item = groups.get(mat);
        if (!item) { item = { p: [], n: [], u: [] }; groups.set(mat, item); }
        var pt = new THREE.Vector3(), nv = new THREE.Vector3();
        for (var i = 0; i < pos.count; i++) {
          pt.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(matrix);
          nv.set(normal.getX(i), normal.getY(i), normal.getZ(i)).applyMatrix3(nmat).normalize();
          item.p.push(pt.x, pt.y, pt.z); item.n.push(nv.x, nv.y, nv.z);
          item.u.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        }
        if (src !== geo) src.dispose();
        counted++;
      }
      function box(mat, w, h, d, x, y, z, rx, ry, rz) { put(unitBox, mat, x, y, z, w, h, d, rx, ry, rz); }
      function cyl(mat, radius, length, x, y, z, axis, seg) {
        var rx = axis === 'z' ? Math.PI / 2 : 0, rz = axis === 'x' ? Math.PI / 2 : 0;
        put(cylinder(radius,seg), mat, x, y, z, radius, length, radius, rx, 0, rz);
      }
      function bevel(mat, w, h, d, x, y, z, b) {
        // Individually bevel only major chassis parts, not tiny decorations.
        b = Math.min(b || .005, w * .19, h * .19, d * .19);
        var sh = new THREE.Shape();
        sh.moveTo(-w/2+b,-h/2);sh.lineTo(w/2-b,-h/2);
        sh.quadraticCurveTo(w/2,-h/2,w/2,-h/2+b);
        sh.lineTo(w/2,h/2-b);sh.quadraticCurveTo(w/2,h/2,w/2-b,h/2);
        sh.lineTo(-w/2+b,h/2);sh.quadraticCurveTo(-w/2,h/2,-w/2,h/2-b);
        sh.lineTo(-w/2,-h/2+b);sh.quadraticCurveTo(-w/2,-h/2,-w/2+b,-h/2);
        var geo = new THREE.ExtrudeGeometry(sh, { depth:d - b * 2, bevelEnabled:true,
          bevelThickness:b, bevelSize:b * .65, bevelSegments:1, curveSegments:2, steps:1 });
        geo.translate(0, 0, -d/2+b);
        put(geo,mat,x,y,z,1,1,1);geo.dispose();
      }
      // Eight-facet machinable profile: visible shoulder edges in first-person.
      // This replaces the rounded-box outline only on the main receiver pieces.
      function faceted(mat,w,h,d,x,y,z,ch){
        var c=Math.min(ch||.007,w*.22,h*.22),sh=new THREE.Shape();
        sh.moveTo(-w/2+c,-h/2);sh.lineTo(w/2-c,-h/2);
        sh.lineTo(w/2,-h/2+c);sh.lineTo(w/2,h/2-c);
        sh.lineTo(w/2-c,h/2);sh.lineTo(-w/2+c,h/2);
        sh.lineTo(-w/2,h/2-c);sh.lineTo(-w/2,-h/2+c);sh.closePath();
        var g=new THREE.ExtrudeGeometry(sh,{depth:d-.002,bevelEnabled:true,
          bevelThickness:.001,bevelSize:.001,bevelSegments:1,curveSegments:1});
        g.translate(0,0,-d/2+.001);put(g,mat,x,y,z,1,1,1);g.dispose();
      }
      var unitSphere=new THREE.SphereGeometry(1,10,7);
      function oval(mat,x,y,z,rx,ry,rz){put(unitSphere,mat,x,y,z,rx,ry,rz);}
      function tube(mat,a,z,ra,rb,segments){
        var A=new THREE.Vector3(a[0],a[1],a[2]),B=new THREE.Vector3(z[0],z[1],z[2]);
        var d=B.clone().sub(A),len=d.length();if(len<.0001)return;
        var q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.multiplyScalar(1/len));
        var e=new THREE.Euler().setFromQuaternion(q,'XYZ');
        var geo=new THREE.CylinderGeometry(rb,ra,1,segments||10,1);
        put(geo,mat,(a[0]+z[0])/2,(a[1]+z[1])/2,(a[2]+z[2])/2,1,len,1,e.x,e.y,e.z);geo.dispose();
      }
      // Ring loft with smooth variable cloth volume (sewn sleeve, rather than tubes).
      function sleeve(mat,rings,sides){
        sides=sides||12;var vertices=[],indices=[],uv=[];
        for(var j=0;j<rings.length;j++){
          var R=rings[j], center=new THREE.Vector3(R[0],R[1],R[2]);
          var ahead=rings[Math.min(j+1,rings.length-1)],behind=rings[Math.max(j-1,0)];
          var tangent=new THREE.Vector3(ahead[0]-behind[0],ahead[1]-behind[1],ahead[2]-behind[2]).normalize();
          var u=new THREE.Vector3(1,0,0).addScaledVector(tangent,-tangent.x).normalize();
          if(u.length()<.3)u.set(0,0,1);
          var v=new THREE.Vector3().crossVectors(tangent,u).normalize();
          for(var k=0;k<sides;k++){
            var t=2*Math.PI*k/sides;
            var wrinkle=1+.025*Math.sin(t*5+j*2);
            var at=center.clone().addScaledVector(u,Math.cos(t)*R[3]*wrinkle).addScaledVector(v,Math.sin(t)*R[4]*wrinkle);
            vertices.push(at.x,at.y,at.z);uv.push(k/sides,j/(rings.length-1));
            if(j>0){var prev=(j-1)*sides+k,next=(j-1)*sides+(k+1)%sides,cur=j*sides+k,curNext=j*sides+(k+1)%sides;
              indices.push(prev,next,cur,cur,next,curNext);}
          }
        }
        for(var k=1;k<sides-1;k++){
          indices.push(0,k, k+1);
          var end=(rings.length-1)*sides;indices.push(end,end+k+1,end+k);
        }
        var geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
        put(geo,mat,0,0,0,1,1,1);geo.dispose();
      }
      function finish() {
        groups.forEach(function(data, material) {
          var geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(data.p,3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.n,3));
          geo.setAttribute('uv',new THREE.Float32BufferAttribute(data.u,2));
          geo.computeBoundingSphere();
          var mesh = new THREE.Mesh(geo, material);mesh.name=name+' / '+material.name;
          mesh.frustumCulled=false;parent.add(mesh);
        });
        return { parts: counted, drawMeshes: groups.size };
      }
      return { box:box,cyl:cyl,bevel:bevel,faceted:faceted,oval:oval,tube:tube,sleeve:sleeve,finish:finish };
    }
    Object.keys(palette).forEach(function(k){ palette[k].name = 'vr18-'+k; });
    var assembly = new THREE.Group(); assembly.name='VR-18 V3.3-R reconstructed carbine chassis';
    var p=palette, b=batch(assembly,'machined');
    // Restore the original's two-level dark receiver, with recessed side panels
    // and a stepped lower. No oversized flat wall at the rear of the viewmodel.
    b.faceted(p.receiver,.064,.060,.238,0,.002,-.003,.011);
    b.faceted(p.upper,.060,.047,.267,0,.038,-.029,.009);
    b.bevel(p.polymer,.054,.043,.139,0,-.046,.047,.006);
    b.box(p.rail,.056,.006,.157,0,.068,-.006);
    b.box(p.recess,.047,.004,.204,0,.063,-.035);
    // Raised bevel lip at the top rear, receiver-to-handguard and magazine well.
    b.bevel(p.upper,.068,.014,.061,0,.061,.056,.004);
    b.faceted(p.receiver,.072,.052,.058,0,-.015,-.131,.009);
    b.faceted(p.upper,.062,.045,.061,0,-.042,-.074,.007);
    for(var side=-1;side<=1;side+=2){
      // A dark broad receiver face carries purposeful inset mechanical detail.
      b.bevel(p.upper,.003,.036,.160,side*.033,.015,.005,.001);
      b.box(p.recess,.0035,.022,.096,side*.035,.038,-.058);
      b.box(p.hardware,.002,.010,.062,side*.037,.038,-.065);
      b.box(p.recess,.004,.020,.074,side*.036,-.032,.045);
      b.box(p.rail,.005,.008,.035,side*.038,-.013,.063);
      b.box(p.upper,.003,.005,.068,side*.037,-.059,.015);
      b.cyl(p.hardware,.004,.004,side*.039,-.013,.105,'x',10);
      b.cyl(p.hardware,.0035,.004,side*.039,-.044,-.083,'x',10);
      b.cyl(p.hardware,.003,.004,side*.039,.050,.095,'x',10);
      b.box(p.marking,.001,.003,.037,side*.039,-.032,-.041);
      // Actual flush pins and well lips instead of many random bright flecks.
      b.box(p.recess,.005,.005,.045,side*.036,-.078,-.08);
    }
    // Stepped side receiver: an upper carrier track, real-depth ejection port,
    // magazine-well sweep and nested controls rather than a flat repeated panel.
    for(var sr=-1;sr<=1;sr+=2){
      b.bevel(p.darkEdge,.004,.030,.124,sr*.037,.016,-.034,.0018);
      b.bevel(p.upper,.003,.022,.086,sr*.040,.016,-.049,.0013);
      b.box(p.recess,.002,.015,.057,sr*.042,.025,-.061);
      b.box(p.hardware,.001,.011,.033,sr*.043,.024,-.067);
      b.box(p.darkEdge,.003,.006,.141,sr*.038,.053,-.034);
      b.bevel(p.receiver,.004,.024,.095,sr*.039,-.040,-.064,.0016);
      b.bevel(p.gripInset,.003,.015,.071,sr*.042,-.044,-.074,.001);
      b.cyl(p.darkEdge,.007,.004,sr*.045,-.011,.095,'x',12);
      b.cyl(p.hardware,.004,.005,sr*.047,-.011,.095,'x',12);
      b.box(p.darkEdge,.004,.012,.040,sr*.041,-.024,.054);
      b.box(p.hardware,.003,.003,.023,sr*.044,-.024,.054);
      b.box(p.upper,.003,.010,.050,sr*.04,.028,.085);
    }
    // Machined ejector cover, layered shell edge and captive fasteners.
    // Closely fitted side planes use depth offsets so they are not coincident.
    for(var side=-1;side<=1;side+=2){
      b.faceted(p.darkEdge,.003,.028,.108,side*.042,.018,-.027,.001);
      b.faceted(p.upper,.002,.023,.097,side*.044,.018,-.030,.001);
      b.box(p.recess,.0018,.012,.064,side*.045,.021,-.040);
      b.bevel(p.hardware,.0018,.010,.041,side*.047,.021,-.042,.0006);
      b.bevel(p.receiver,.003,.027,.073,side*.043,-.041,-.076,.001);
      b.bevel(p.gripInset,.002,.018,.050,side*.045,-.041,-.078,.001);
      for(var stud=0;stud<3;stud++)
        b.cyl(p.hardware,.0019,.002,side*.049,-.024,.058-stud*.041,'x',8);
      b.box(p.hardware,.0017,.0027,.068,side*.043,.054,-.063);
    }
    // Receiver cap break and anti-glare faceting along the carry ridge.
    b.bevel(p.upper,.046,.013,.18,0,.058,-.032,.004);
    b.box(p.darkEdge,.026,.002,.152,0,.067,-.038);
    // Two restrained machined edge breaks make the receiver panels readable
    // at gameplay distance without increasing its original silhouette.
    for(var lip=-1;lip<=1;lip+=2){
      b.box(p.hardware,.0015,.003,.110,lip*.047,.034,-.035);
      b.box(p.darkEdge,.002,.003,.094,lip*.047,.011,-.030);
    }
    // The warm satin TAN handguard is deliberately narrower than the V2 shroud.
    // Its darker interior, side cheeks and stepped collar supply layered depth.
    // Negative space is genuine geometry: the sides are NOT a solid tan wall.
    b.faceted(p.recess,.052,.049,.304,0,.015,-.315,.008);
    for(var sg=-1;sg<=1;sg+=2){
      b.bevel(p.guardEdge,.008,.018,.298,sg*.030,.040,-.315,.003);
      b.bevel(p.guard,.009,.018,.299,sg*.030,-.011,-.315,.003);
      b.bevel(p.guard,.009,.058,.019,sg*.031,.015,-.459,.003);
      b.bevel(p.guard,.009,.058,.017,sg*.031,.015,-.171,.003);
      for(var srib=0;srib<4;srib++){
        var zrib=-.223-srib*.060;
        b.faceted(p.guard,.007,.058,.012,sg*.031,.015,zrib,.002);
      }
    }
    b.bevel(p.receiver,.073,.062,.028,0,.018,-.164,.005);
    b.box(p.recess,.059,.011,.289,0,-.018,-.324);
    b.box(p.guardEdge,.055,.006,.280,0,.047,-.321);
    b.box(p.recess,.045,.005,.27,0,.053,-.323);
    for(var side=-1;side<=1;side+=2){
      b.box(p.guardEdge,.005,.012,.274,side*.035,.038,-.323);
      b.box(p.recess,.003,.012,.280,side*.035,-.015,-.323);
      // Four genuine openings between formed vertical tan ribs reveal the dark core.
      for(var v=0;v<4;v++) {
        var z=-.254-v*.060;
        b.box(p.darkEdge,.001,.003,.038,side*.029,.041,z);
      }
      b.cyl(p.hardware,.0032,.004,side*.039,.034,-.457,'x',9);
      b.cyl(p.hardware,.0032,.004,side*.039,-.007,-.457,'x',9);
      b.box(p.polymer,.006,.016,.110,side*.033,-.006,-.333);
    }
    // Guard shoulder, slim underside M-LOK trim, and slightly raised dark slot
    // frames. These produce readable edges at real first-person pixel sizes.
    b.bevel(p.softTrim,.071,.011,.040,0,.016,-.184,.003);
    b.bevel(p.guardEdge,.056,.007,.272,0,.043,-.321,.003);
    for(var side=-1;side<=1;side+=2){
      b.box(p.darkEdge,.003,.003,.255,side*.038,-.010,-.322);
      for(var j=0;j<4;j++){
        var sz=-.223-j*.060;
        b.bevel(p.softTrim,.003,.029,.013,side*.037,.016,sz,.001);
      }
    }
    // Slightly flared front/rear attachment collars, inset structural ribs.
    for(var side=-1;side<=1;side+=2){
      b.bevel(p.guardEdge,.007,.030,.014,side*.032,.006,-.454,.003);
      b.bevel(p.softTrim,.004,.040,.012,side*.035,.015,-.177,.002);
      for(var rb=0;rb<4;rb++){
        var rz=-.223-rb*.060;
        b.box(p.guardEdge,.002,.004,.010,side*.038,.043,rz);
        b.box(p.recess,.001,.003,.033,side*.029,-.002,rz-.030);
      }
    }
    // Segmented top rails align across receiver/handguard; teeth are slim and dark.
    b.box(p.rail,.036,.008,.263,0,.077,-.315);
    b.box(p.rail,.034,.010,.158,0,.075,-.018);
    for(var tooth=0;tooth<14;tooth++){
      var rz=-.448+tooth*.035;
      b.box(p.rail,.041,.006,.009,0,.083,rz);
    }
    for(var rear=0;rear<5;rear++) b.box(p.rail,.039,.006,.008,0,.082,.020+rear*.029);
    // A recessed barrel visible through the underside and a real slotted muzzle.
    b.cyl(p.recess,.017,.078,0,.012,-.467,'z',12);
    b.cyl(p.hardware,.010,.115,0,.012,-.537,'z',14);
    b.cyl(p.polymer,.015,.056,0,.012,-.600,'z',14);
    b.cyl(p.rail,.016,.007,0,.012,-.629,'z',14);
    for(var port=0;port<3;port++) for(var s=-1;s<=1;s+=2)
      b.box(p.recess,.003,.008,.009,s*.0148,.012,-.585-port*.014);
    // Protective front sight ears do not obstruct the optic in ADS.
    b.box(p.rail,.030,.009,.020,0,.087,-.462);
    for(var ear=-1;ear<=1;ear+=2) b.box(p.rail,.005,.022,.008,ear*.013,.102,-.462);
    b.box(p.hardware,.003,.010,.004,0,.108,-.462);
    // Positive tapered transition to steel muzzle, not three unconnected rings.
    b.cyl(p.receiver,.018,.025,0,.012,-.493,'z',14);
    b.cyl(p.darkEdge,.012,.042,0,.012,-.556,'z',14);
    b.cyl(p.hardware,.012,.009,0,.012,-.573,'z',14);
    // Return to original compact polymer stock and tucked buffer tube.
    b.cyl(p.upper,.013,.118,0,.017,.167,'z',12);
    b.bevel(p.polymer,.051,.073,.106,0,-.009,.277,.011);
    b.bevel(p.upper,.048,.019,.083,0,.040,.279,.006);
    for(var sr=-1;sr<=1;sr+=2){
      b.bevel(p.recess,.004,.033,.052,sr*.027,-.015,.279,.002);
      b.box(p.hardware,.003,.005,.030,sr*.028,.024,.280);
    }
    b.bevel(p.polymer,.061,.087,.028,0,-.010,.342,.006);
    b.box(p.rubber,.062,.088,.011,0,-.010,.361);
    // Stock geometry with skeleton recess and raised rubber shoulder-pad edge.
    for(var st=-1;st<=1;st+=2){
      b.bevel(p.darkEdge,.004,.042,.061,st*.027,-.011,.284,.003);
      b.bevel(p.gripInset,.002,.025,.047,st*.030,-.015,.283,.002);
      b.box(p.upper,.003,.005,.044,st*.031,.012,.283);
    }
    b.bevel(p.rail,.063,.091,.013,0,-.010,.349,.003);
    // Polymer grip with bounded shape and tactile texture, not a giant cuboid.
    b.bevel(p.polymer,.043,.102,.055,0,-.104,.104,.011);
    b.bevel(p.rubber,.040,.015,.057,0,-.155,.111,.003);
    for(var grip=0;grip<5;grip++) b.box(p.recess,.041,.002,.040,0,-.070-grip*.016,.106);
    b.box(p.rail,.006,.006,.076,0,-.064,.046);
    b.box(p.rail,.006,.032,.006,0,-.054,.012);
    b.box(p.hardware,.004,.023,.004,0,-.049,.041,0,0,.19);
    b.cyl(p.hardware,.0035,.068,0,-.062,.059,'x',10);
    // Mechanical emphasis on the grip and bolt, not cosmetic random rails.
    for(var sd=-1;sd<=1;sd+=2){
      b.bevel(p.gripInset,.002,.046,.039,sd*.022,-.109,.101,.003);
      b.bevel(p.upper,.002,.012,.028,sd*.042,.040,-.035,.001);
      b.cyl(p.hardware,.0025,.003,sd*.045,.044,-.022,'x',10);
    }
    var bodyMetrics=b.finish();
    // Moving magazine remains exactly on gameplay animation's local origin.
    // Three gently raked modules recover the original curved profile.
    var mag=new THREE.Group();mag.name='VR18 V3.3-R curved animated magazine';
    var m=batch(mag,'mag');
    m.bevel(p.polymer,.042,.060,.070,0,-.080,-.064,.005);
    m.bevel(p.polymer,.041,.063,.070,0,-.133,-.072,.005);
    m.bevel(p.polymer,.040,.069,.068,0,-.189,-.088,.006);
    m.box(p.rubber,.046,.009,.074,0,-.224,-.094);
    m.box(p.upper,.049,.009,.076,0,-.048,-.062);
    for(var sd=-1;sd<=1;sd+=2){
      for(var band=0;band<4;band++) m.box(p.upper,.002,.005,.052,sd*.023,-.085-band*.033,-.069-band*.005);
      m.box(p.recess,.003,.094,.041,sd*.022,-.149,-.077);
    }
    // Shallow molded magazine ribs and seam following the three-section curve.
    for(var sd=-1;sd<=1;sd+=2){
      for(var rib=0;rib<3;rib++){
        m.bevel(p.gripInset,.002,.042,.008,sd*.024,-.099-rib*.036,-.071-rib*.005,.0007);
      }
      m.box(p.darkEdge,.002,.156,.003,sd*.024,-.138,-.100);
    }
    var magMetrics=m.finish();assembly.add(mag);
    // Existing reload code animates this dedicated charging assembly.
    var charge=new THREE.Group();charge.name='VR18 V3.3-R charging handle';
    var c=batch(charge,'charge');
    c.box(p.rail,.031,.011,.029,0,.078,.113);
    for(var ch=-1;ch<=1;ch+=2){c.box(p.upper,.016,.012,.018,ch*.023,.079,.110);c.cyl(p.hardware,.005,.008,ch*.033,.075,.107,'x',10);}
    c.finish();assembly.add(charge);
    // Compact reflex housing with real open sight channel and subtle tinted pane.
    var optic=new THREE.Group();optic.name='VR18 V3.3-R open holographic optic';
    var o=batch(optic,'optic');
    o.bevel(p.polymer,.055,.021,.071,0,.094,-.050,.005);
    o.box(p.rail,.049,.005,.068,0,.082,-.050);
    o.faceted(p.upper,.052,.009,.016,0,.155,-.050,.004);
    for(var os=-1;os<=1;os+=2){
      o.faceted(p.polymer,.006,.052,.052,os*.027,.123,-.050,.003);
      o.box(p.rail,.003,.012,.034,os*.033,.097,-.050);
      o.cyl(p.hardware,.009,.006,os*.033,.106,-.044,'x',12);
    }
    o.box(p.rail,.043,.006,.008,0,.149,-.080);
    o.box(p.rail,.043,.006,.008,0,.149,-.022);
    // Cast side ribs and a rounded front bridge leave the sight window open.
    for(var os=-1;os<=1;os+=2){
      o.tube(p.upper,[os*.027,.101,-.083],[os*.027,.148,-.079],.0035,.0035,10);
      o.tube(p.polymer,[os*.027,.148,-.079],[os*.027,.145,-.024],.0035,.0035,10);
      o.box(p.hardware,.003,.003,.034,os*.031,.092,-.052);
    }
    // Beefy but open-machined protective eyebrow and rear aperture rim.
    for(var os=-1;os<=1;os+=2){
      o.bevel(p.upper,.005,.039,.009,os*.031,.127,-.077,.002);
      o.box(p.hardware,.002,.025,.004,os*.034,.129,-.018);
      o.cyl(p.darkEdge,.011,.004,os*.038,.114,-.075,'x',12);
      o.cyl(p.hardware,.006,.005,os*.041,.114,-.075,'x',12);
    }
    o.bevel(p.darkEdge,.046,.005,.012,0,.154,-.072,.002);
    // Low-profile inset rim highlights the open aperture, not a solid frame.
    // It reuses existing batched materials and avoids glass/reticle occlusion.
    o.bevel(p.hardware,.044,.002,.006,0,.148,-.083,.001);
    for(var rim=-1;rim<=1;rim+=2){
      o.box(p.upper,.002,.030,.005,rim*.024,.125,-.083);
    }
    var opticMetrics=o.finish();
    var glass=new THREE.Mesh(new THREE.PlaneGeometry(.043,.035),
      new THREE.MeshPhongMaterial({color:0x536d70,emissive:0x071016,specular:0x819897,shininess:74,
       transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}));
    glass.name='VR18 V3.3-R transparent lens';glass.position.set(0,.125,-.059);optic.add(glass);
    assembly.add(optic);
    // VR-18-exclusive articulated silhouettes. Sleeves, cuffs, palms and
    // individual hooked fingers share material-batched draw calls. The gun's
    // existing g/userData anchors still own animation visibility and transforms.
    var cloth = new THREE.MeshPhongMaterial({color:0x444b42,specular:0x353c35,shininess:7,map:grain});
    var clothEdge = new THREE.MeshPhongMaterial({color:0x363e37,specular:0x414941,shininess:11,map:grain});
    var glove = new THREE.MeshPhongMaterial({color:0x1e2523,specular:0x3b4743,shininess:19,map:grain});
    var gloveTop = new THREE.MeshPhongMaterial({color:0x465249,specular:0x4e5b52,shininess:18,map:grain});
    var gloveSeam = new THREE.MeshPhongMaterial({color:0x58605a,specular:0x393f3b,shininess:10});
    function gloveRig(which){
      var g=new THREE.Group();g.name='VR18 V3.3-R '+which+' rig';
      var t=batch(g,which+'-gloved');
      if(which==='support'){
        // Angled support arm converges on the actual tan forend at z=-.31.
        // Two gently angled fabric sections avoid the old rigid cylinder arm.
        t.sleeve(cloth,[[-.196,-.342,.190,.068,.054],[-.165,-.260,.088,.066,.055],[-.145,-.192,.007,.060,.050],[-.117,-.148,-.085,.055,.044],[-.079,-.091,-.193,.040,.035]],12);
        t.tube(clothEdge,[-.098,-.127,-.134],[-.074,-.071,-.234],.048,.043,12);
        // Clothing seam and adjustable cuff, concentric with wrist direction.
        t.tube(gloveSeam,[-.083,-.106,-.202],[-.079,-.091,-.220],.049,.049,12);
        t.tube(clothEdge,[-.141,-.192,.004],[-.131,-.179,-.022],.061,.055,12);
        t.box(gloveSeam,.023,.005,.074,-.156,-.216,.037);
        t.bevel(clothEdge,.049,.013,.039,-.143,-.195,-.015,.003);
        t.box(gloveSeam,.021,.003,.044,-.152,-.176,-.065);
        t.bevel(gloveTop,.053,.016,.049,-.052,-.042,-.312,.005);
        t.tube(glove,[-.071,-.080,-.235],[-.055,-.056,-.310],.047,.041,12);
        t.oval(glove,-.051,-.052,-.316,.042,.029,.051);
        t.bevel(gloveTop,.050,.009,.056,-.054,-.034,-.314,.005);
        // Finger curl wraps beneath the forend instead of hovering above it.
        for(var i=0;i<4;i++){
          var z=-.368+i*.029;
          t.tube(glove,[-.034,-.049,z],[.009,-.042,z-.006],.012,.011,8);
          t.tube(glove,[.009,-.042,z-.006],[.025,-.059,z-.005],.011,.009,8);
          t.oval(glove,.025,-.059,z-.005,.009,.010,.011);
          t.box(gloveSeam,.032,.002,.010,-.030,-.027,z);
          t.oval(gloveTop,-.026,-.039,z,.011,.008,.012);
        }
        t.tube(gloveTop,[-.073,-.052,-.269],[-.041,-.018,-.242],.014,.010,9);
        t.box(gloveSeam,.038,.006,.027,-.088,-.098,-.208);
      } else if(which==='firing'){
        t.sleeve(cloth,[[.157,-.342,.470,.069,.061],[.127,-.283,.404,.068,.056],[.102,-.238,.335,.061,.050],[.078,-.189,.267,.056,.043],[.059,-.155,.208,.047,.037]],12);
        t.tube(clothEdge,[.072,-.176,.240],[.048,-.120,.175],.053,.046,12);
        t.tube(gloveSeam,[.058,-.154,.202],[.050,-.136,.182],.050,.05,12);
        t.box(gloveSeam,.027,.006,.07,.103,-.230,.332);
        t.bevel(clothEdge,.045,.014,.040,.087,-.191,.256,.003);
        t.box(gloveSeam,.018,.003,.059,.115,-.227,.342);
        t.bevel(gloveTop,.058,.016,.051,.020,-.070,.118,.005);
        t.tube(glove,[.045,-.131,.181],[.017,-.101,.119],.047,.037,12);
        t.oval(glove,.018,-.094,.116,.044,.043,.050);
        t.bevel(gloveTop,.055,.012,.053,.023,-.066,.119,.006);
        // Four bent digits curl across the pistol grip in two sections each.
        for(var i=0;i<4;i++){
          var z=.086+i*.017, y=-.087-i*.012;
          t.tube(glove,[.027,y,z],[-.014,y-.013,z+.006],.012,.010,8);
          t.tube(glove,[-.014,y-.013,z+.006],[-.026,y-.034,z+.010],.010,.009,8);
          t.oval(glove,-.026,y-.034,z+.010,.010,.011,.009);
          t.box(gloveSeam,.024,.003,.008,.025,y+.011,z);
          t.oval(gloveTop,.014,y+.008,z,.012,.008,.010);
        }
        t.tube(gloveTop,[-.028,-.070,.099],[-.018,-.049,.043],.015,.011,9);
        t.box(gloveSeam,.041,.006,.023,.067,-.153,.200);
      } else { // animated spare magazine and late charging handle
        t.tube(cloth,[-.151,-.415,.160],[-.049,-.290,-.078],.061,.046,11);
        t.tube(clothEdge,[-.061,-.314,-.052],[-.044,-.268,-.079],.048,.042,10);
        t.oval(glove,-.038,-.249,-.082,.046,.041,.052);
        t.bevel(gloveTop,.047,.012,.051,-.042,-.213,-.084,.004);
        for(var j=0;j<4;j++){
          var q=-.114+j*.024;
          t.tube(glove,[-.012,-.244,q],[.017,-.241,q],.011,.009,8);
          t.tube(glove,[.017,-.241,q],[.021,-.261,q],.009,.008,8);
        }
        t.tube(gloveTop,[-.057,-.248,-.061],[-.025,-.231,-.032],.013,.009,8);
      }
      g.userData.geometryStats=t.finish();
      /* Expose only the VR-18's first-person arm materials for the selected
         operative appearance adapter. Weapon materials remain untouched. */
      g.userData.sightlineCustomArmMaterials={cloth:cloth,clothEdge:clothEdge,glove:glove,gloveTop:gloveTop,gloveSeam:gloveSeam};
      return g;
    }
    var firingHand=gloveRig('firing'),supportHand=gloveRig('support');
    return {model:assembly,mag:mag,charge:charge,optic:optic,firingHand:firingHand,supportHand:supportHand,makeReloadHand:function(){return gloveRig('reload');},
      appearanceMaterials:{cloth:cloth,clothEdge:clothEdge,glove:glove,gloveTop:gloveTop,gloveSeam:gloveSeam},
      muzzle:new THREE.Vector3(0,.012,-.632),sightY:.125,
      metrics:{staticParts:bodyMetrics.parts,magParts:magMetrics.parts,opticParts:opticMetrics.parts,
        batchedStaticDraws:bodyMetrics.drawMeshes,batchedOpticDraws:opticMetrics.drawMeshes},version:'VR18-V3.3-R-ADS-P2'};
  }
  root.SightlineVR18V31 = { build: build, version: 'VR18-V3.3-R-ADS-P2' };
})(typeof window !== 'undefined' ? window : this);

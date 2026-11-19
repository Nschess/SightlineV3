/* Sightline P10 optics: offline-only code, shared byte-for-byte between clients.
   Deliberately local viewmodels: existing LAN world weapons are generated separately.
   Selected gun optics are cosmetic + camera FOV only; ballistic data is untouched. */
(function(global){'use strict';
 var KEY='sightline.optics.v1';
 // Only guns with explicitly paired, working sight geometry qualify. Integrated
 // VR-18 and zoomed precision scopes are intentionally immutable in P10.
 var COMPAT={
  pistol:['iron','reflex','dot'],hawk:['iron','reflex','dot'],
  aurora:['iron','reflex','dot','holo','compact'],
  kestrel:['iron','reflex','dot','holo'],
  mako:['iron','reflex','dot','holo'],
  stinger:['iron','reflex','dot','holo'],
  switchback:['iron','reflex','dot','holo'],
  needle:['iron','reflex','dot','holo'],
  falcon:['iron','reflex','dot','holo','compact'],
  rook117:['iron','reflex','dot','holo','compact'],
  mistral:['iron','reflex','dot','holo'],
  bastion:['iron','reflex','dot','holo','compact']
 };
 var CATALOG=[
 {id:'iron',name:'No Scope · Iron Sights',desc:'Physical front and rear sights. No optic or mount.',fov:58},
 {id:'reflex',name:'Open Reflex',desc:'Thin open window; unobstructed peripheral view.',fov:51},
 {id:'dot',name:'Enclosed Red Dot',desc:'Protected twin-ring sight tube.',fov:48},
 {id:'holo',name:'Holographic-style',desc:'Reinforced rectangular sight window.',fov:46},
 {id:'compact',name:'Compact 2×',desc:'Actual tighter camera FOV, with a visible optic.',fov:32},
 {id:'precision',name:'Precision Scope',desc:'Integrated precision optics are not interchangeable.',fov:22}
 ];
 var saved=Object.create(null);
 try{var val=JSON.parse(localStorage.getItem(KEY)||'null');if(val&&typeof val==='object'&&!Array.isArray(val))Object.keys(val).forEach(function(k){if(COMPAT[k]&&COMPAT[k].indexOf(val[k])>=0)saved[k]=val[k];});}catch(e){}
 function options(k){return (COMPAT[k]||[]).slice();}
 function has(k){return !!COMPAT[k];}
 function current(k){return saved[k]||'iron';}
 function descriptor(id){for(var i=0;i<CATALOG.length;i++)if(CATALOG[i].id===id)return CATALOG[i];return null;}
 function set(k,id){
  if(!COMPAT[k]||COMPAT[k].indexOf(id)<0)return false;
  if(current(k)===id)return true;
  // Commit only after storage succeeds. Do not show EQUIPPED for an unsaved choice.
  var next=Object.assign(Object.create(null),saved);next[k]=id;
  try{var serialized=JSON.stringify(next);localStorage.setItem(KEY,serialized);
   if(localStorage.getItem(KEY)!==serialized)return false;}
  catch(e){return false;}
  saved=next;return true;
 }
 function exportChoices(){var result={};Object.keys(COMPAT).forEach(function(k){result[k]=current(k);});return result;}
 function mat(T,color,shine){return new T.MeshPhongMaterial({color:color,shininess:shine||24,specular:0x353b40});}
 function group(T,k,id){
  var g=new T.Group();g.name='P10-'+k+'-'+id;g.userData.optic=id;
  var metal=mat(T,0x20292c,28),edge=mat(T,0x59656a,36),rubber=mat(T,0x11181b,8),glass=mat(T,0x203c44,45);
  function box(w,h,d,x,y,z,m,name){var o=new T.Mesh(new T.BoxGeometry(w,h,d),m||metal);o.position.set(x,y,z);o.name=name||'optic-component';g.add(o);return o;}
  function ring(radius,tube,x,y,z,m){var o=new T.Mesh(new T.TorusGeometry(radius,tube,7,18),m||edge);o.position.set(x,y,z);o.name='hollow-aperture';g.add(o);return o;}
  // Geometry is mounted on the ORIGINAL model's longitudinal aiming axis.
  // Each family has a different actual external silhouette, not painted boxes.
  if(id==='iron'){
    if(k==='pistol'||k==='hawk')return g; // Their original slide has actual front/rear irons.
    if(k==='rook117'){
      // Ashline is a square rear aperture aligned with the .105 ADS eye line.
      // The physical front post is already part of the P1164 rifle builder;
      // do not create a second front post in the optic attachment.
      metal.color.setHex(0x252d32);
      edge.color.setHex(0x879197);
      box(.047,.032,.032,0,.073,.012,metal,'ashline-rear-sight-base');
      box(.005,.032,.010,-.012,.105,.012,metal,'ashline-aperture-left');
      box(.005,.032,.010,.012,.105,.012,metal,'ashline-aperture-right');
      box(.028,.005,.010,0,.121,.012,edge,'ashline-aperture-crown');
      box(.028,.005,.010,0,.089,.012,metal,'ashline-aperture-foot');
      g.userData.ironForm='ashline-square-aperture';
      g.userData.ironRearZ=.012;g.userData.ironFrontZ=-.563;
      return g;
    }
    // Individual sight profiles remain specific to their original weapon.
    var FORMS={
      aurora:['guarded-peep',-.42,.042,.013,.034],
      kestrel:['low-notch',-.28,.031,.009,.026],
      mako:['protected-notch',-.30,.038,.011,.031],
      stinger:['folding-peep',-.44,.041,.014,.040],
      switchback:['open-notch',-.31,.030,.010,.026],
      needle:['micro-peep',-.29,.032,.010,.028],
      falcon:['winged-peep',-.46,.047,.013,.039],
      mistral:['shielded-support',-.44,.057,.016,.041],
      bastion:['heavy-support',-.48,.062,.017,.044]
    };
    var form=FORMS[k];if(!form)return g;
    var shape=form[0],frontZ=form[1],frontW=form[2],rearGap=form[3],wing=form[4],rearZ=.012;
    box(.047,.013,.032,0,.075,rearZ,metal,'rear-sight-base');
    if(shape==='guarded-peep'||shape==='folding-peep'||shape==='micro-peep'||shape==='winged-peep'){
      ring(shape==='micro-peep'?.010:.013,.003,0,.113,rearZ,metal);
      box(.008,.032,.011,0,.092,rearZ,metal,'rear-upright');
      if(shape==='folding-peep')box(.040,.007,.020,0,.065,rearZ,edge,'folding-base');
      if(shape==='winged-peep')for(var wingX of [-.024,.024])box(.007,.035,.013,wingX,.105,rearZ,metal,'rear-side-shield');
    }else{
      box(.007,.023,.011,-rearGap,.093,rearZ,metal,'rear-left-notch');
      box(.007,.023,.011,rearGap,.093,rearZ,metal,'rear-right-notch');
      if(shape==='shielded-support'||shape==='heavy-support')box(.053,.008,.018,0,.125,rearZ,edge,'support-bridge');
    }
    box(frontW,.012,.026,0,.075,frontZ,metal,'front-sight-base');
    box(shape==='micro-peep'?.004:.006,.038,.009,0,.108,frontZ,edge,'front-post');
    if(shape==='winged-peep'||shape==='guarded-peep'||shape==='folding-peep'){
      for(var x of [-wing/2,wing/2])box(.006,.031,.013,x,.106,frontZ,metal,'front-guard-wing');
    }else if(shape==='shielded-support'||shape==='heavy-support'||shape==='protected-notch'){
      for(var x of [-wing/2,wing/2])box(.007,.031,.017,x,.103,frontZ,metal,'front-guard-protector');
    }else if(shape==='low-notch'||shape==='open-notch'){
      box(.035,.007,.012,0,.085,frontZ,edge,'front-low-ledge');
    }
    g.userData.ironForm=shape;g.userData.ironFrontZ=frontZ;g.userData.ironRearZ=rearZ;
    return g;
  }
  var handgun=k==='pistol'||k==='hawk';
  var offset=handgun?-.066:-.14, bottom=handgun?.055:.084;
  var center=handgun?.098:.123;
  if(id==='reflex'){
    box(.041,.012,.051,0,bottom,offset,metal,'open-reflex-base');
    box(.007,.041,.015,-.022,center-.010,offset-.019,metal,'left-window-post');
    box(.007,.041,.015,.022,center-.010,offset-.019,metal,'right-window-post');
    box(.054,.007,.016,0,center+.015,offset-.019,edge,'open-window-arch');
    box(.038,.009,.027,0,bottom-.008,offset+.015,rubber,'low-mount');
  } else if(id==='dot'){
    // Enclosed hollow circular apertures with a visible longitudinal body.
    box(.044,.013,.057,0,bottom,offset,metal,'micro-mount');
    for(var side=0;side<2;side++){
      var x=side?-.023:.023;
      box(.009,.039,.097,x,center,offset,metal,'optic-tube-side');
    }
    box(.045,.008,.099,0,center+.026,offset,metal,'enclosed-hood');
    box(.041,.007,.095,0,center-.028,offset,metal,'lower-tube');
    ring(.027,.004,0,center,offset-.048,edge);
    ring(.027,.004,0,center,offset+.048,rubber);
    box(.014,.016,.02,.031,center+.016,offset+.006,edge,'adjustment-dial');
  }else if(id==='holo'){
    box(.068,.015,.076,0,bottom-.005,offset,metal,'holo-wide-base');
    box(.012,.054,.074,-.034,center,offset,metal,'holo-left-shield');
    box(.012,.054,.074,.034,center,offset,metal,'holo-right-shield');
    box(.070,.012,.080,0,center+.033,offset,edge,'holo-upper-hood');
    box(.058,.012,.077,0,center-.032,offset,metal,'holo-lower-frame');
    box(.056,.006,.012,0,center+.013,offset-.040,glass,'inner-glass-rim');
  }else if(id==='compact'){
    box(.047,.022,.058,0,bottom-.012,offset,metal,'compact-base');
    box(.022,.038,.017,0,center-.026,offset-.014,metal,'compact-mount');
    for(var xc of [-.023,.023])box(.007,.050,.135,xc,center,offset,metal,'compact-body-side');
    box(.048,.008,.135,0,center+.026,offset,metal,'compact-top');
    box(.045,.008,.135,0,center-.029,offset,metal,'compact-bottom');
    ring(.027,.006,0,center,offset-.068,edge);
    ring(.022,.004,0,center,offset+.069,rubber);
    box(.014,.014,.02,.032,center+.007,offset,edge,'compact-adjustment');
  }
  return g;
 }
 global.SightlineOptics={key:KEY,catalog:CATALOG,options:options,has:has,current:current,descriptor:descriptor,set:set,exportChoices:exportChoices,model:group};
})(window);

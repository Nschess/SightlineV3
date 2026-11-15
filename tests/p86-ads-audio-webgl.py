#!/usr/bin/env python3
"""P8.6 real Chromium/Three.js fire-ray & WebAudio audit.
Verifies zero-spread calibration shots against a temporary genuine THREE sphere,
actual gameplay fire event sound key, ADS state and current muzzle/sight anchors.
Does not certify subjective optic alignment or authentic recorded gun acoustics.
"""
from pathlib import Path
import json, re, os, sys, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'AndroidProject/app/src/main/assets'
KEYS=['hawk','pistol','kestrel','mako','needle','switchback','smg','breacher','ember','hammer','scatter','thunder','aurora','falcon','rampart','stinger','carbine','longbow','pinion','ranger','tide','vantage','bastion','bulwark','cyclone','forge','mistral']
INJECT=r'''window.__p86={
 init:function(){
   if(this.ready)return;
   R.mode=(typeof syncViewCamera==='function'?'deathmatch':'tactical');R.bots=1;R.mates=-1;R.dmKills=50;
   startMatch();beginRound();clearUnits();
   P.x=MAPD.spawn.x;P.z=MAPD.spawn.z;P.y=0;P.yaw=0;P.pitch=0;P.punch=0;
   this.ready=true;
 },
 audit:function(key,range){
   this.init();var previous=cur;owned[key]=true;gunFor(key);state='live';setWeapon(key);
   P.x=MAPD.spawn.x;P.z=MAPD.spawn.z;P.y=0;P.yaw=0;P.pitch=0;P.punch=0;
   P.alive=true;P.onGround=true;P.vx=P.vy=P.vz=0;P.crouch=P.prone=0;
   scoped=true;adsT=1;speedFrac=0;bloom=0;gunKick=0;T+=2;nextFire=0;reloading=0;
   ammo[key].mag=Math.max(4,ammo[key].mag);camera.rotation.y=P.yaw;camera.rotation.x=P.pitch;
   camera.updateMatrixWorld(true);if(typeof syncViewCamera==='function')syncViewCamera();
   var before=ammo[key].mag;
   var gun=gunFor(key),muzzle=gun.userData.muzzle.clone();
   var target=new THREE.Mesh(new THREE.SphereGeometry(.20,12,8),new THREE.MeshBasicMaterial());
   var forward=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion).normalize();
   target.position.copy(camera.position).addScaledVector(forward,range);target.updateMatrixWorld(true);
   var saved=targets.slice(),origRandom=Math.random,origIntersect=THREE.Raycaster.prototype.intersectObjects;
   var origAudio=sfxShot,events=[],shots=[],seenTarget=false;
   targets.length=0;targets.push(target);
   THREE.Raycaster.prototype.intersectObjects=function(objects,recursive){
     var intersections=origIntersect.apply(this,arguments);
     shots.push({direction:this.ray.direction.toArray(),origin:this.ray.origin.toArray(),hit:intersections.some(function(it){return it.object===target;})});
     return intersections;
   };
   Math.random=function(){return 0;};
   sfxShot=function(shotKey,volume){events.push({key:shotKey,volume:volume,at:AC?AC.currentTime:null});};
   var error=null;
   try{tryFire(true);}catch(ex){error=String(ex);}finally{
     sfxShot=origAudio;Math.random=origRandom;THREE.Raycaster.prototype.intersectObjects=origIntersect;
     targets.length=0;saved.forEach(function(it){targets.push(it);});target.geometry.dispose();target.material.dispose();
   }
   var maxAngle=0;
   shots.forEach(function(it){var v=new THREE.Vector3().fromArray(it.direction).normalize();var angle=Math.acos(Math.max(-1,Math.min(1,v.dot(forward))))*180/Math.PI;if(angle>maxAngle)maxAngle=angle;});
   return {key,range,before,after:ammo[key].mag,shots:shots.length,allHit:shots.length>0&&shots.every(function(it){return it.hit;}),
      maxAngleDeg:maxAngle,soundEvents:events,sightY:gun.userData.sightY,muzzle:muzzle.position.toArray(),error:error};
 },
 opticCheck:function(key){
   this.init();owned[key]=true;gunFor(key);state='live';setWeapon(key);
   P.x=MAPD.spawn.x;P.z=MAPD.spawn.z;P.y=0;P.yaw=0;P.pitch=0;P.punch=0;
   P.alive=true;P.onGround=true;P.vx=P.vy=P.vz=0;
   scoped=true;adsT=1;speedFrac=0;gunKick=0;reloading=0;drawT=0;P.bob=0;
   updatePlayer(.016);
   var g=gunFor(key),o=g.userData.profileOptic,kind=o?o.userData.sightType:null;
   if(!o||!(kind===1||kind===2))return {key,type:kind,checkable:false};
   if(typeof viewCamera==='undefined')return {key,type:kind,checkable:false};
   viewCamera.updateMatrixWorld(true);g.updateMatrixWorld(true);
   var local=new THREE.Vector3(0,kind===1?.108:.117,-.12);
   var ndc=g.localToWorld(local).project(viewCamera);
   return {key,type:kind,checkable:true,visible:o.visible,ndc:[ndc.x,ndc.y],
       errorXpx:ndc.x*907/2,errorYpx:-ndc.y*508/2};
 },
 playback:function(){
   audio();var old=AudioBufferSourceNode.prototype.start,scheduled=[],kinds=['pistol','smg','carbine','breacher','longbow','bulwark'];
   AudioBufferSourceNode.prototype.start=function(when){scheduled.push({at:when,key:kinds[scheduled.length]||'unknown'});return old.apply(this,arguments);};
   try{kinds.forEach(function(key){sfxShot(key,.5);});}
   finally{AudioBufferSourceNode.prototype.start=old;}
   return {state:AC?AC.state:'unavailable',scheduled,voices:SHOT_VOICES};
 },
 sounds:function(){
   var profiles=Object.keys(SHOT_PROFILES),records=[];audio();
   profiles.forEach(function(key){
     var buf=shotBuffer(key),a=buf.getChannelData(0),max=0,rms=0;
     for(var i=0;i<a.length;i++){max=Math.max(max,Math.abs(a[i]));rms+=a[i]*a[i];}
     records.push({key,samples:a.length,sampleRate:buf.sampleRate,peak:max,rms:Math.sqrt(rms/a.length)});
   });
   return {state:AC?AC.state:'unavailable',profiles:records,voices:SHOT_VOICES,cap:SHOT_MAX_VOICES};
 }
};'''

def document(folder):
    src=(folder/'index.html').read_text()
    src=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(folder/m[1]).read_text()+'</script>',src)
    token=r'if (/[?&]debug\b/.test(location.search)) window.__sl'
    assert token in src, 'instrumentation insertion anchor missing'
    return src.replace(token,INJECT+'\n'+token,1)

def main():
    report={'test':'P8.6 actual Chromium camera-ballistics/audio', 'clients':{},'scope': 'deterministic 3D collision targets and real game firing code, procedural audio buffer audit; not live Android, recorded audio, or complete network E2E'}
    with sync_playwright() as pw:
        exe=shutil.which('chromium')
        browser=pw.chromium.launch(headless=not bool(os.environ.get('DISPLAY')),executable_path=exe,args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
        try:
            for client in ('www','phone-host'):
                page=browser.new_page(viewport={'width':1100,'height':720})
                errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
                try:
                    page.set_content(document(ASSETS/client),wait_until='domcontentloaded',timeout=35000)
                    page.wait_for_function('typeof window.__p86!=="undefined"',timeout=20000)
                    # Simulate an actual user gesture for WebAudio unlocking.
                    page.mouse.click(4,4)
                    sounds=page.evaluate('window.__p86.sounds()')
                    playback=page.evaluate('window.__p86.playback()')
                    page.wait_for_timeout(520)
                    playback['voices_after']=page.evaluate('window.__p86.sounds().voices')
                    rows=[]
                    for key in KEYS:
                        for dist in (2,40):
                            rows.append(page.evaluate('([key,dist])=>window.__p86.audit(key,dist)',[key,dist]))
                    perkey={k:[r for r in rows if r['key']==k] for k in KEYS}
                    optics=[page.evaluate('(key)=>window.__p86.opticCheck(key)',key) for key in KEYS]
                    failures=[]
                    for row in rows:
                        if row['error'] or row['after']!=row['before']-1 or not row['allHit'] or row['maxAngleDeg']>1e-5 or [v['key'] for v in row['soundEvents']]!=[row['key']]:
                            failures.append(row)
                    if len(playback['scheduled'])!=6 or playback['state']!='running' or playback['voices_after']!=0:failures.append({'playback':playback})
                    for optic in optics:
                        if optic['checkable'] and (not optic['visible'] or abs(optic['errorXpx'])>18 or abs(optic['errorYpx'])>24):failures.append({'optical':optic})
                    if set(p['key'] for p in sounds['profiles'])!=set(KEYS):failures.append('audio profile keys mismatch')
                    for profile in sounds['profiles']:
                        if not (.0003<profile['rms']<.8 and profile['peak']<1): failures.append({'badAudio':profile})
                    report['clients'][client]={'pass':not failures and not errors,'shots':len(rows),'guns':len(perkey),'sound_profiles':len(sounds['profiles']),
                        'audio_state':sounds['state'],'max_angle_deg':max(r['maxAngleDeg'] for r in rows),
                        'source_errors':errors,'failures':failures[:12],'audio_profiles':sounds['profiles'],
                        'shot_details':rows,'optic_checks':optics,'playback':playback}
                    print(client,'PASS' if report['clients'][client]['pass'] else 'FAIL',
                          'shots',len(rows),'audio',len(sounds['profiles']),'errors',len(errors),'failed',len(failures),flush=True)
                finally:page.close()
        finally:browser.close()
    out=ROOT/'acceptance/P86-ADS-AUDIO-REAL-WEBGL.json'
    out.write_text(json.dumps(report,indent=2)+'\n')
    return 0 if all(c['pass'] for c in report['clients'].values()) else 1
if __name__=='__main__':sys.exit(main())

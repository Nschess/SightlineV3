#!/usr/bin/env python3
"""P8.4 matched capture: real Three.js asset side views and deterministic game-canvas FPS/ADS from actual source.
Source pair, scene state, cameras, FOV and viewport are identical between captures.
Does not count as manual visual approval, Android testing or two-browser LAN E2E.
"""
import argparse, base64, json, re, os, shutil, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=Path(__file__).resolve().parents[1]
P82=None
ASSETS='AndroidProject/app/src/main/assets'
# sorted intentionally by type/release review
KEYS=['hawk','pistol','kestrel','mako','needle','switchback','smg','breacher','ember','hammer','scatter','thunder','aurora','falcon','rampart','stinger','carbine','longbow','pinion','ranger','tide','vantage','bastion','bulwark','cyclone','forge','mistral']

INJECT=r'''window.__p83={
  THREE:THREE, gunFor:gunFor, WEAPONS:WEAPONS, models:gunFor,
  init:function(){
    if(window.__p83.gameStarted)return;
    R.mode='deathmatch';R.bots=1;R.mates=-1;R.dmKills=50;
    startMatch();beginRound();
    // Preserve actual loaded map and player physics; remove moving NPCs from
    // screenshot-only deterministic scene (never modify source gameplay).
    clearUnits();P.x=MAPD.spawn.x;P.z=MAPD.spawn.z;P.y=0;
    window.__p83.gameStarted=true;
  },
  live:function(key,aim){
    this.init();owned[key]=true;gunFor(key);state='live';setWeapon(key);
    P.x=MAPD.spawn.x;P.z=MAPD.spawn.z;P.y=0;P.vx=P.vy=P.vz=0;
    P.yaw=0;P.pitch=0;P.punch=0;P.bob=0;P.alive=true;
    scoped=aim;adsT=aim?1:0;speedFrac=0;drawT=0;gunKick=0;T=20;el.msg.classList.remove('on');el.msg.style.display='none';
    // A stable world camera, same map, position, scene, model and FOV.
    updatePlayer(.035);
    syncViewCamera();
    renderer.autoClear=false;renderer.clear(true,true,true);
    // Fixed buffer dimensions and camera aspect for byte-comparable scene geometry.
    renderer.setPixelRatio(1);renderer.setSize(907,508,false);
    camera.aspect=907/508;camera.updateProjectionMatrix();
    viewCamera.aspect=907/508;viewCamera.updateProjectionMatrix();
    renderer.render(scene,camera);renderer.clearDepth();
    renderer.render(viewScene,viewCamera);
    return {key,aim,cur,state,adsT,cameraFov:camera.fov,sceneChildren:scene.children.length};
  },
  side:function(key){
    var THREE=this.THREE,g=gunFor(key).clone(true),sc=new THREE.Scene();
    g.visible=true;g.position.set(0,0,0);g.rotation.set(0,0,0);
    g.traverse(function(o){if(o.isMesh&&(o.material===mGlove||o.material===mSleeve))o.visible=false;});
    sc.add(g);sc.background=new THREE.Color(0x202c37);
    sc.add(new THREE.AmbientLight(0xffffff,.80));
    var a=new THREE.DirectionalLight(0xffffff,1.20);a.position.set(2,4,2);sc.add(a);
    var b=new THREE.DirectionalLight(0xb4d0ec,.58);b.position.set(-3,1,-2);sc.add(b);
    var c=new THREE.OrthographicCamera(-1.06,1.06,.40,-.40,.01,20);
    c.position.set(3.0,.34,.0);c.lookAt(0,-.015,-.13);
    var ren=window.__p83.sideRenderer;
    if(!ren){ren=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});ren.setPixelRatio(1);ren.setSize(850,320);ren.setClearColor(0x202c37);window.__p83.sideRenderer=ren;
      ren.domElement.id='p83-side';ren.domElement.style.cssText='position:fixed;top:0;left:0;z-index:999999;width:850px;height:320px;';document.body.appendChild(ren.domElement);
    }
    ren.render(sc,c);
    var debug={key,art:[],meshCount:0,visible:0};g.traverse(function(o){if(o.isMesh){debug.meshCount++;if(o.visible)debug.visible++;}if(o.name&&(o.name.startsWith('P8')||o.name.startsWith('P83')))debug.art.push(o.name);});
    // do NOT dispose geometry/materials: clone shares them with gameplay.
    sc.remove(g);
    debug.drawCalls=ren.info.render.calls;debug.triangles=ren.info.render.triangles;return debug;
  }
};
'''

def inline_html(folder):
    src=(folder/'index.html').read_text(encoding='utf-8')
    src=re.sub(r'<script src="([^"]+)"></script>', lambda m:'<script>'+(folder/m[1]).read_text(encoding='utf-8')+'</script>',src)
    needle=r'if (/[?&]debug\b/.test(location.search)) window.__sl'
    if needle not in src: raise RuntimeError('missing instrumentation anchor')
    return src.replace(needle,INJECT+'\n'+needle,1)

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--scope',choices=['baseline','candidate','both'],default='candidate')
    p.add_argument('--baseline',help='Previously extracted baseline root, e.g. P8.2/SightlineV3-P4-BROADER-GAMEPLAY')
    p.add_argument('--clients',choices=['www','phone-host','both'],default='www')
    p.add_argument('--key',default=None,help='single weapon key or comma separated')
    p.add_argument('--no-live',action='store_true')
    p.add_argument('--no-side',action='store_true')
    p.add_argument('--out',default='p83-visual-captures')
    args=p.parse_args(); keys=args.key.split(',') if args.key else KEYS
    baseline=Path(args.baseline).resolve() if args.baseline else None
    if args.scope in ('baseline','both') and (not baseline or not (baseline/ASSETS/'www/index.html').is_file()):
        p.error('--baseline must point to an extracted source root with AndroidProject/app/src/main/assets/www/index.html')
    roots={'baseline':baseline,'candidate':BASE}
    scopes=list(roots) if args.scope=='both' else [args.scope]
    clients=['www','phone-host'] if args.clients=='both' else [args.clients]
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    errors=[];measures=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=not bool(os.environ.get('DISPLAY')),executable_path=shutil.which('chromium'), args=['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage'])
        try:
            for client in clients:
                for scope in scopes:
                    folder=roots[scope]/ASSETS/client
                    print('START',client,scope,flush=True)
                    page=browser.new_page(viewport={'width':960,'height':540},device_scale_factor=1)
                    page.set_default_timeout(60000)
                    page.on('pageerror',lambda e,client=client,scope=scope:errors.append(f'{client} {scope}: {e}'))
                    try:
                        page.set_content(inline_html(folder),wait_until='domcontentloaded',timeout=30000)
                        page.wait_for_function('window.__p83 && typeof window.__p83.gunFor==="function"',timeout=12000)
                        page.wait_for_timeout(350)
                        frames=out/client/scope;frames.mkdir(parents=True,exist_ok=True)
                        for ix,key in enumerate(keys):
                            if not args.no_side:
                                info=page.evaluate('(key)=>window.__p83.side(key)',key)
                                side_url=page.evaluate('''() => document.querySelector('#p83-side').toDataURL('image/png')''')
                                import base64
                                (frames/f'{key}-side.png').write_bytes(base64.b64decode(side_url.split(',',1)[1]))
                                measures.append({'scope':scope,'client':client,'mode':'side','key':key,**info})
                            if not args.no_live:
                                # side renderer overlays main canvas, hide while capturing live
                                page.evaluate('()=>{const a=document.querySelector("#p83-side");if(a)a.style.display="none";}')
                                for mode in ('idle','ads'):
                                    packet=page.evaluate('''([key,aim]) => {
                                      const state=window.__p83.live(key,aim);
                                      return {state,image:document.querySelector('#gl').toDataURL('image/png')};
                                    }''',[key,mode=='ads'])
                                    info=packet['state']
                                    # Read pixels immediately after rendering; WebGL preserveDrawingBuffer=false.
                                    image_url=packet['image']
                                    (frames/f'{key}-{mode}.png').write_bytes(base64.b64decode(image_url.split(',',1)[1]))
                                    measures.append({'scope':scope,'client':client,'mode':mode,'key':key,**info})
                                page.evaluate('()=>{const a=document.querySelector("#p83-side");if(a)a.style.display="block";}')
                            if (ix+1)%7==0: print('  ',scope,client,ix+1,'/',len(keys),flush=True)
                    except Exception as exc:
                        errors.append(f'{client} {scope}: {repr(exc)}')
                        print('ERROR',repr(exc),flush=True)
                    finally: page.close()
        finally:browser.close()
    (out/'measurements.json').write_text(json.dumps({'measurements':measures,'errors':errors},indent=2))
    print('FRAMES',len(measures),'ERRORS',errors[:4],flush=True)
    return 1 if errors else 0
if __name__=='__main__':sys.exit(main())

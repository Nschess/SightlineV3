#!/usr/bin/env python3
"""Independent source-level and Chromium WebGL regression for configured Deathmatch score limits.

Test-only instrumentation never mutates saved game files or weapon statistics.
Usage: xvfb-run -a python tests/p4-deathmatch-result-webgl.py [output.json]
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re, sys
root=Path(__file__).resolve().parents[1]/'AndroidProject/app/src/main/assets/www'
html=(root/'index.html').read_text()
html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(root/m[1]).read_text()+'</script>',html)
html=html.replace('if (/[?&]debug\\b/.test(location.search)) window.__sl','if (true) window.__sl')
html=html.replace("var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);", "DEF_R.mode='deathmatch';DEF_R.bots=1;DEF_R.mates=-1;var R_KEY = 'sightline.rules.v1', R = loadObj(R_KEY, DEF_R);")
html=html.replace('/* ---------- boot ---------- */','''window.__p4dm={setTarget:function(n){R.dmKills=n;},start:startMatch,score:dmScore,finish:endMatch,get rule(){return R;},get state(){return state;}};
/* ---------- boot ---------- */''',1)
rows=[];errors=[];failure=None
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':960,'height':600},device_scale_factor=1)
  page.on('pageerror', lambda error: errors.append(str(error)))
  page.set_content(html,wait_until='load',timeout=35000)
  page.locator('#btn-start').click(timeout=15000)
  page.wait_for_function("window.__sl?.state==='live'",timeout=15000)
  # The live game scoring function ends the match, rather than a mock rendering of results.
  for target in (10,20,30,50):
   row=page.evaluate('''target=>{
    const q=window.__p4dm;q.setTarget(target);q.start();
    window.__sl.M.you=target-1;window.__sl.M.bots=2;
    q.score(0);
    const reason=document.getElementById('end-text').textContent;
    return {target,state:q.state,reason,title:document.getElementById('end-title').textContent};
   }''',target)
   row['pass']=row['state']=='matchend' and 'Victory' in row['title'] and 'Score limit reached' in row['reason']
   rows.append(row)
   if target==20 and len(sys.argv)>1:page.screenshot(path=str(Path(sys.argv[1]).with_suffix('.png')),animations='disabled')
  for label,won in [('defeat',False),('timer',True)]:
   row=page.evaluate('''([label,won])=>{
     const q=window.__p4dm;q.setTarget(20);q.start();
     window.__sl.M.you=won?7:1;window.__sl.M.bots=won?5:19;
     if(label==='timer')q.finish();else q.score(1);
     return {target:20,state:q.state,reason:document.getElementById('end-text').textContent,title:document.getElementById('end-title').textContent};
   }''',[label,won])
   row['case']=label
   row['pass']=row['state']=='matchend' and ('Time expired' in row['reason'] if label=='timer' else ('Score limit reached' in row['reason'] and 'Defeat' in row['title']))
   rows.append(row)
  browser.close()
except Exception as e:failure=str(e)
result={'pass':not failure and not errors and all(r['pass'] for r in rows) and len(rows)==6,'cases':rows,'javascriptErrors':errors,'failure':failure,'scope':'Actual Chromium WebGL offline game scoring; test-only fixture sets score to threshold before calling dmScore'}
if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
if not result['pass']:sys.exit(1)

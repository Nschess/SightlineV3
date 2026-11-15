"""Targeted current-baseline integrity and gameplay-source regression checks.
Does not substitute for Android compilation or a physical-device test.
"""
from pathlib import Path
import hashlib, json, subprocess, re, xml.etree.ElementTree as ET, sys
P=Path(__file__).resolve().parents[1]; W=P/'app/src/main/assets/www'
base=json.loads((P/'qa/BASELINE-ASSET-SHA256.json').read_text())
checks={}
def ck(k,v): checks[k]=bool(v)
ck('original 12 game files present',len(base)==12 and all((W/n).is_file() for n in base))
ck('11 unchanged external game modules',all(hashlib.sha256((W/n).read_bytes()).hexdigest()==hash_ for n,hash_ in base.items() if n!='index.html'))
text=(W/'index.html').read_text(encoding='utf-8')
java=(P/'app/src/main/java/com/sightline/v3/MainActivity.java').read_text(encoding='utf-8')
ck('secondary fire button present', text.count('id="tb-fire-alt"')==1)
hud_edit_ids=re.search(r'var HUD_EDIT_IDS=\[[^\n]+',text)
ck('secondary fire part of layout editor',bool(hud_edit_ids and "'tb-fire-alt'" in hud_edit_ids.group(0)))
ck('independent trigger ownership', all(x in text for x in ['var touchFireOwners = new Set();','touchFireOwners.add(e.pointerId)','touchFireOwners.delete(e&&e.pointerId)','fireHeld=touchFireOwners.size>0']))
ck('secondary pointer cancellation via shared button helper',"tbtn('#tb-fire-alt'" in text and "b.addEventListener('pointercancel',finish)" in text)
ck('scoped recoil aligned in trace and render', text.count('1-0.6*adsT')==1 and text.count('1 - 0.6 * adsT')==1)
ck('no zombie health changes',hashlib.sha256((W/'zombie-balance.js').read_bytes()).hexdigest()==base['zombie-balance.js'])
ck('walkers use authoritative balance at spawn', 'b.hp = b.maxhp = ZB.health(type,wave,R.mode)' in text)
ck('zombie hit applies real HP subtraction', 'b.hp -= dmg;' in text)
ck('attack telegraph remains visual-only', 'var windup=' in text and 'u.g.rotation.x=-.35*u.lunge-windup;' in text)
ck('native immersive on focus return', 'onWindowFocusChanged(boolean hasFocus)' in java and 'if (hasFocus) immersive()' in java)
ck('existing WebView fix preserved','void onReceivedError(' not in java)
ck('offline and LAN launcher flows intact','openGame(null)' in java and 'askForHost' in java)
ck('package id unchanged', "applicationId 'com.sightline.v3'" in (P/'app/build.gradle').read_text())
ck('updates disabled by default',"getOrElse('').trim()" in (P/'app/build.gradle').read_text())
ck('Gradle wrapper not fabricated',not (P/'gradle/wrapper/gradle-wrapper.jar').exists() and (P/'tools/bootstrap-build.ps1').exists())
ck('Android manifest parses',bool(ET.parse(P/'app/src/main/AndroidManifest.xml')))
for f in W.glob('*.js'):
 c=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
 ck('js syntax '+f.name,c.returncode==0)
# Inline scripts also require JavaScript parsing.
for n,block in enumerate(re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>',text)):
 if not block.strip():continue
 r=subprocess.run(['node','--check','-'],input=block,capture_output=True,text=True,encoding='utf-8')
 ck('inline js syntax '+str(n),r.returncode==0)
result={'verdict':'PASS' if all(checks.values()) else 'FAIL','checks':len(checks),'passed':sum(checks.values()),'failed':[x for x,v in checks.items() if not v],'details':checks,'android_compiled':False,'device_tested':False}
print(json.dumps(result,indent=2));sys.exit(result['verdict']!='PASS')

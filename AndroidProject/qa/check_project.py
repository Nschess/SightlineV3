"""Static source QA. This does NOT compile/install/test Android."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import re,xml.etree.ElementTree as ET,subprocess,json,sys
project=Path(__file__).resolve().parents[1]
web=project/'app/src/main/assets/www'
html=(web/'index.html').read_text('utf-8')
baseline_name='SightlineV3-SNIPER-AUTOADS-LAN-DIAGNOSTICS-QA-Windows-BETA.zip'
baseline=next((ancestor/baseline_name for ancestor in (project, *project.parents) if (ancestor/baseline_name).exists()), None)
expected='dfd10479ea4a18135a2895c1f846e249ccca088ade1d8f26c411a9e65efc02d3'
refs=re.findall(r'<script src="([^\"]+)"',html)
issues=[]
required={'three.min.js','vr18-v31.js','navigation.js','zombie-hunt.js','squad-tactics.js',
          'bot-tactics.js','character-poses.js','zombie-counterplay.js','infection-evasion.js',
          'squad-loadout.js','deathmatch-rules.js','weapon-skins.js','optics-v1.js','character-realism.js',
          'character-skins.js'}
missing=required-set(refs)
if missing: issues.append('Missing required game module imports: '+', '.join(sorted(missing)))
if refs.count('vr18-v31.js')!=1 or refs.count('optics-v1.js')!=1: issues.append('Core VR18/optics import missing or duplicated')
for ref in refs:
 rel=Path(ref)
 target=(web/rel).resolve()
 try: target.relative_to(web.resolve()); safe=True
 except ValueError: safe=False
 if rel.is_absolute() or '..' in rel.parts or not safe or not target.is_file(): issues.append('Missing or unsafe local script: '+ref)
if 'https://fonts.googleapis.com' in html or 'https://cdnjs.cloudflare.com/' in html: issues.append('External stylesheet/CDN referenced offline')
for mode in ('tactical','deathmatch','infection','outbreak'):
 if "'"+mode+"'" not in html:issues.append('Mode absent: '+mode)
for f in (project/'app/src/main').rglob('*.xml'):
 try:ET.parse(f)
 except Exception as e:issues.append('Invalid XML '+str(f)+': '+str(e))
if baseline is not None and sha256(baseline.read_bytes()).hexdigest()!=expected:issues.append('Baseline digest changed')
else:
 if baseline is not None:
  with ZipFile(baseline) as z:
   for file in set(refs):
    if z.read(file)!=(web/file).read_bytes():issues.append('Gameplay JavaScript changed: '+file)
 if baseline is None:print('Baseline archive unavailable; skipped digest comparison')
if not (project/'app/src/main/java/com/sightline/v3/MainActivity.java').exists():issues.append('Missing Android entry point')
if not (project/'app/src/main/AndroidManifest.xml').read_text().count('INTERNET')==1:issues.append('Unexpected Android permissions')
report={'result':'FAIL' if issues else 'STATIC_PASS','source_scripts':len(refs),'unique_scripts':len(set(refs)),'xml_checked':len(list((project/'app/src/main').rglob('*.xml'))),'game_modes':['Tactical','Deathmatch','Infection','Outbreak'],'issues':issues,'apk_built':False,'android_device_tested':False}
print(json.dumps(report,indent=2))
sys.exit(bool(issues))

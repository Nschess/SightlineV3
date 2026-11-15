"""Deterministic Android source merge verification. This does NOT build an APK."""
from pathlib import Path
import hashlib,json,re,xml.etree.ElementTree as ET,sys
R=Path(__file__).resolve().parents[1]
checks=[]
def ck(cond,label):
 checks.append({'name':label,'status':'PASS' if cond else 'FAIL'})
assets=json.loads((R/'qa/BASELINE-ASSET-SHA256.json').read_text())
W=R/'app/src/main/assets/www'
ck(len(assets)==12,'12 original offline game files tracked')
# Historical checksums apply to unchanged supporting files. The P4-approved game
# entry page intentionally differs; verify the P8.8 reviewed source hash while retaining P4 history.
source_hashes={}
for record in (R.parent/'acceptance/ACTIVE-SOURCE-SHA256SUMS.txt').read_text().splitlines():
 digest,relative=record.split('  ',1)
 source_hashes[relative]=digest
for name,sha in assets.items():
 f=W/name
 if name=='index.html':
  sha=next(x['p111_sha256'] for x in json.loads((R.parent/'workflow/APPROVED-P111-CHANGES.json').read_text())['changes'] if x['path'].endswith('/www/index.html'))
 ck(f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest()==sha,
    ('approved P4 entry-page integrity ' if name=='index.html' else 'historical game asset unchanged ')+name)
main=(R/'app/src/main/java/com/sightline/v3/MainActivity.java').read_text()
ck('void onReceivedError(' not in main,'do not restore incompatible WebViewClientCompat override')
ck('onRenderProcessGone(' in main and 'HostPolicy.normalize(' in main,'working WebView and LAN flow retained')
ck('setTheme(R.style.Theme_Sightline)' in main,'native splash-to-activity theme')
ck('WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE' in main and 'WindowInsets.Type.statusBars()' in main,'Android API 30+ immersive system bars and legacy fallback')
ck('Join LAN Game (Phone or PC)' in main and 'copyJoinAddress(' in main,'PC-free join address messaging and native copy action')
ck('FileProvider.getUriForFile' in main and 'ACTION_MANAGE_UNKNOWN_APP_SOURCES' in main,'user approved APK installer')
ck('BuildConfig.UPDATE_MANIFEST_URL' in (R/'app/src/main/java/com/sightline/v3/UpdateManager.java').read_text(),'optional updater and default URL read')
ck("getOrElse('').trim()" in (R/'app/build.gradle').read_text(),'updates disabled without official host')
ck('VERSION_CODE=3' in (R/'app/version.properties').read_text(),'provisional code 3')
ck(r'distributionUrl=https\://services.gradle.org/distributions/gradle-8.13-bin.zip' in (R/'gradle/wrapper/gradle-wrapper.properties').read_text(),'Gradle 8.13 wrapper configuration retained')
manifest=ET.parse(R/'app/src/main/AndroidManifest.xml').getroot()
ns='{http://schemas.android.com/apk/res/android}'
perms=sorted(n.attrib[ns+'name'] for n in manifest.findall('uses-permission'))
# Phone-host service requires network state and foreground service permissions.
# Reject extra permissions; the exact approved P4 set is intentional.
approved_perms=['android.permission.ACCESS_NETWORK_STATE',
 'android.permission.CHANGE_WIFI_STATE',
 'android.permission.FOREGROUND_SERVICE',
 'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
 'android.permission.INTERNET','android.permission.REQUEST_INSTALL_PACKAGES']
ck(perms==approved_perms,'approved P4 Android permission set; no extras')
app=manifest.find('application')
ck(app.attrib[ns+'icon']=='@mipmap/ic_launcher' and app.attrib[ns+'theme']=='@style/Theme.Sightline.Starting','branding wired in manifest')
ck(not list(R.rglob('*.bak')),'broken MainActivity backup excluded')
ck(not [p for ext in ['*.jks','*.keystore','*.p12','*.apk'] for p in R.rglob(ext)],'no private keys or fabricated APK')
for f in (R/'app/src/main/res').rglob('*.xml'):
 try: ET.parse(f); ck(True,'resource XML '+f.name)
 except ET.ParseError: ck(False,'resource XML '+f.name)
for dens,pixels in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
 for kind in ['ic_launcher','ic_launcher_round']:
  p=R/'app/src/main/res'/('mipmap-'+dens)/(kind+'.png')
  b=p.read_bytes() if p.exists() else b''
  ck(len(b)>24 and b[:8]==b'\x89PNG\r\n\x1a\n' and int.from_bytes(b[16:20],'big')==pixels and int.from_bytes(b[20:24],'big')==pixels,'icon '+dens+' '+kind)
ck((R/'app/src/main/res/drawable-nodpi/ic_sightline_monochrome.png').is_file(),'monochrome launcher icon present')
ck((R/'app/src/main/res/drawable-nodpi/splash_mark.png').is_file(),'splash art present')
out={'result':'STATIC_PASS' if all(t['status']=='PASS' for t in checks) else 'FAIL','checks':len(checks),'passed':sum(t['status']=='PASS' for t in checks),'tests':checks,'apk_compiled':False,'device_verified':False}
print(json.dumps(out,indent=2));sys.exit(out['result']!='STATIC_PASS')

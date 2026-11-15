"""Static QA for Android release integration. Never claims an installed/running APK."""
from pathlib import Path
import json, re, sys, xml.etree.ElementTree as ET
import struct, zlib

def read_png(file):
    """Decode the RGBA 8-bit PNGs we ship using only the Python standard library."""
    data=file.read_bytes()
    assert data.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG signature'
    pos=8; chunks=[]; width=height=0
    while pos < len(data):
        n=struct.unpack_from('>I',data,pos)[0]; pos+=4
        name=data[pos:pos+4]; pos+=4
        blob=data[pos:pos+n]; pos+=n+4 # skip CRC
        if name==b'IHDR':
            width,height,depth,ctype,compression,filter_method,interlace=struct.unpack('>IIBBBBB',blob)
            assert (depth,ctype,compression,filter_method,interlace)==(8,6,0,0,0), 'Unsupported PNG format'
        if name==b'IDAT': chunks.append(blob)
        if name==b'IEND': break
    raw=zlib.decompress(b''.join(chunks))
    stride=width*4; start=0; before=bytearray(stride); rows=[]
    for _ in range(height):
        f=raw[start];start+=1
        row=bytearray(raw[start:start+stride]);start+=stride
        for i in range(stride):
            a=row[i-4] if i>=4 else 0
            b=before[i];c=before[i-4] if i>=4 else 0
            if f==0: pred=0
            elif f==1: pred=a
            elif f==2: pred=b
            elif f==3: pred=(a+b)//2
            elif f==4:
                p=a+b-c; ds=(abs(p-a),abs(p-b),abs(p-c)); pred=(a,b,c)[ds.index(min(ds))]
            else: raise ValueError('Unsupported PNG filter')
            row[i]=(row[i]+pred)&255
        rows.append(row);before=row
    return width,height,rows
root=Path(__file__).resolve().parents[1]
res=root/'app/src/main/res'
web=root/'app/src/main/assets/www'
issues=[]; tests=[]
def check(cond,label):
 tests.append({'name':label,'pass':bool(cond)})
 if not cond: issues.append(label)
manifest=ET.parse(root/'app/src/main/AndroidManifest.xml').getroot()
android='{http://schemas.android.com/apk/res/android}'
app=manifest.find('application')
check(app is not None and app.attrib.get(android+'label')=='Sightline V3','branded application label')
check(app is not None and app.attrib.get(android+'icon')=='@mipmap/ic_launcher','launcher icon resource')
check(app is not None and app.attrib.get(android+'roundIcon')=='@mipmap/ic_launcher_round','round launcher icon resource')
check(app is not None and app.attrib.get(android+'theme')=='@style/Theme.Sightline.Starting','native splash theme')
check(app is not None and app.attrib.get(android+'allowBackup')=='false','do not loosen backup security')
perms=[p.attrib.get(android+'name') for p in manifest.findall('uses-permission')]
check(sorted(perms)==['android.permission.INTERNET','android.permission.REQUEST_INSTALL_PACKAGES'],'existing only Android permissions')
activity=app.find('activity')
check(activity is not None and activity.attrib.get(android+'screenOrientation')=='sensorLandscape','landscape preserved')
check((root/'app/version.properties').read_text().startswith('VERSION_CODE=3\n'),'versionCode 3 source candidate')
gradle=(root/'app/build.gradle').read_text()
check("applicationId 'com.sightline.v3'" in gradle,'package name unchanged')
check("getOrElse('').trim()" in gradle,'updates default disabled')
check('if (!releaseSigningProvided || !file(releaseKeyPath).isFile())' in gradle,'release build rejects missing key')
manager=(root/'app/src/main/java/com/sightline/v3/UpdateManager.java').read_text()
for label,fragment in [('hash verification','hex(digest.digest()).equals(info.sha256)'),('higher APK version','code<=installedCode()'),('matching installed signer','APK signing certificate mismatch'),('HTTPS only','"https".equals(uri.getScheme())'),('no redirects','setInstanceFollowRedirects(false)')]:
 check(fragment in manager,'update '+label)
main=(root/'app/src/main/java/com/sightline/v3/MainActivity.java').read_text()
check('android:theme' not in main and 'setTheme(R.style.Theme_Sightline)' in main,'transition into branded native activity theme')
check('brand.setImageResource(R.drawable.sightline_launcher_brand)' in main,'branded native home image')
check('FileProvider.getUriForFile' in main and 'Intent.FLAG_GRANT_READ_URI_PERMISSION' in main,'explicit Android installer retained')
check('new WebViewAssetLoader.Builder()' in main and 'HostPolicy.normalize(' in main,'offline and LAN entry points retained')
check('web.setWebViewClient(new WebViewClientCompat()' in main,'restricted WebView navigation retained')
check((res/'mipmap-anydpi-v26/ic_launcher.xml').exists() and (res/'mipmap-anydpi-v26/ic_launcher_round.xml').exists(),'adaptive icon entries')
for p in res.rglob('*.xml'):
 try: ET.parse(p)
 except Exception: check(False,'valid XML '+p.relative_to(root).as_posix())
check(len(list(res.rglob('*.xml'))) >= 6,'brand XML resources present')
for scale,px in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
 for name in ['ic_launcher','ic_launcher_round']:
  f=res/('mipmap-'+scale)/(name+'.png')
  ok=f.is_file() and read_png(f)[:2]==(px,px)
  check(ok,f'{name} {scale} {px}px')
for name in ['ic_sightline_foreground','ic_sightline_monochrome','splash_mark']:
 f=res/'drawable-nodpi'/(name+'.png')
 check(f.is_file() and read_png(f)[:2]==(432,432),name+' 432px')
width,height,rgba=read_png(res/'drawable-nodpi/ic_sightline_monochrome.png')
check(rgba[0][3]==0,'monochrome has transparent background')
check(rgba[260][216*4+3] > 0,'monochrome foreground visible')
for name in ['THREE-CONCEPTS-COMPARISON.png','ADAPTIVE-MASK-PREVIEW.png','selected-chevron.svg']:
 check((root/'branding'/name).exists(),'art evidence '+name)
check((res/'drawable-nodpi/sightline_launcher_brand.png').is_file(),'native launcher header asset')
check(len(list(web.glob('*.js')))==11,'11 game JS modules included')
check((web/'index.html').exists(),'offline HTML retained')
keys=list(root.rglob('*.jks'))+list(root.rglob('*.keystore'))+list(root.rglob('*.p12'))
check(not keys,'no private signing material packaged')
result={'verdict':'STATIC_PASS' if not issues else 'FAIL','assertions':len(tests),'passed':sum(t['pass'] for t in tests),'failed':issues,'apk_compiled':False,'real_android_tested':False,'tests':tests}
print(json.dumps(result,indent=2))
sys.exit(bool(issues))

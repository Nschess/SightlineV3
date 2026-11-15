from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'evidence'/'phase8'
DATA=json.loads((BASE/'review-results.json').read_text(encoding='utf-8'))
OUT=BASE/'contact'
OUT.mkdir(parents=True,exist_ok=True)
keys=DATA['builds']['after']['keys']
font=ImageFont.load_default()

def label(im, text):
    d=ImageDraw.Draw(im)
    d.rectangle((0,0,im.width,20),fill=(17,25,31))
    d.text((5,4),text,fill=(245,245,235),font=font)

def sheet(build, angle, state, name, size=(320,180)):
    cellw,cellh=size
    cols=4; rows=(len(keys)+cols-1)//cols
    canvas=Image.new('RGB',(cols*cellw,rows*cellh),(22,28,31))
    for i,key in enumerate(keys):
        src=BASE/build/(f'{key}__{angle}__{state}.jpg')
        im=Image.open(src).convert('RGB').resize((cellw,cellh),Image.Resampling.LANCZOS)
        label(im,key)
        canvas.paste(im,((i%cols)*cellw,(i//cols)*cellh))
    canvas.save(OUT/name,quality=90,optimize=True)

for build in ('before','after'):
    for angle in ('front','right','rear','left','threequarter'):
        sheet(build,angle,'idle',f'{build}-{angle}-idle.jpg')
    for pose in ('movement','aiming','firing','reload'):
        sheet(build,'threequarter',pose,f'{build}-threequarter-{pose}.jpg')

# Paired overview emphasizes the shared third-person rig change at fixed view.
cellw,cellh=420,244; cols=2; rows=(len(keys)+cols-1)//cols
paired=Image.new('RGB',(cols*cellw,rows*cellh),(22,28,31))
for i,key in enumerate(keys):
    tile=Image.new('RGB',(cellw,cellh),(30,34,36));d=ImageDraw.Draw(tile)
    d.text((5,3),key,fill=(245,245,235),font=font)
    for j,build in enumerate(('before','after')):
        im=Image.open(BASE/build/f'{key}__threequarter__idle.jpg').convert('RGB').resize((208,220),Image.Resampling.LANCZOS)
        label(im,build.upper())
        tile.paste(im,(j*210,22))
    paired.paste(tile,((i%cols)*cellw,(i//cols)*cellh))
paired.save(OUT/'before-after-threequarter-all-weapons.jpg',quality=91,optimize=True)

print(json.dumps({'weapons':len(keys),'sheets':len(list(OUT.glob('*.jpg'))),'output':str(OUT)},indent=2))

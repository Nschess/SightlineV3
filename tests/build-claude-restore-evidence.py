from pathlib import Path
import csv, json
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
evidence = root / 'evidence' / 'claude-restore'
before = json.loads((evidence / 'before' / 'results.json').read_text(encoding='utf-8'))
after = json.loads((evidence / 'after' / 'results.json').read_text(encoding='utf-8'))
assert before['pass'] and after['pass']
bm = {c['id']: c for c in before['characters']}
am = {c['id']: c for c in after['characters']}
assert len(bm) == len(am) == 42 and set(bm) == set(am)

font_path = Path('C:/Windows/Fonts/arial.ttf')
font = ImageFont.truetype(str(font_path), 20) if font_path.exists() else ImageFont.load_default()
small = ImageFont.truetype(str(font_path), 14) if font_path.exists() else ImageFont.load_default()

def full_pair(cid, out_name):
    left = Image.open(evidence / 'before' / f'{cid}.jpg').convert('RGB')
    right = Image.open(evidence / 'after' / f'{cid}.jpg').convert('RGB')
    assert left.size == right.size == (1280, 1268)
    canvas = Image.new('RGB', (2560, 1310), '#101820')
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 9), 'BEFORE — REJECTED THREE-WAY MERGE', fill='white', font=font)
    draw.text((1304, 9), 'AFTER — CLAUDE V12.8 RESTORE', fill='white', font=font)
    canvas.paste(left, (0, 42))
    canvas.paste(right, (1280, 42))
    canvas.save(evidence / out_name, quality=90, optimize=True)

full_pair('riptide', 'riptide-before-after.jpg')
full_pair('ashfall', 'ashfall-before-after.jpg')

# Use the same third-quarter idle cell in each actual WebGL capture.
# The screenshot harness lays that view into cell 3: (960,48), 320x236.
def idle_crop(which, cid):
    img = Image.open(evidence / which / f'{cid}.jpg').convert('RGB')
    return img.crop((960, 48, 1280, 284)).resize((220, 162), Image.Resampling.LANCZOS)

def roster_sheet(ids, out_name, title):
    cols, pair_w, cell_h, header_h = 3, 452, 186, 52
    rows = (len(ids) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * pair_w, header_h + rows * cell_h), '#111a21')
    draw = ImageDraw.Draw(canvas)
    draw.text((18, 10), title, fill='white', font=font)
    draw.text((18, 32), 'Matched WebGL camera cell · left = before · right = restored Claude source', fill='#c5d2dc', font=small)
    for i, cid in enumerate(ids):
        x = (i % cols) * pair_w
        y = header_h + (i // cols) * cell_h
        draw.text((x + 8, y + 4), cid, fill='white', font=small)
        left = idle_crop('before', cid)
        right = idle_crop('after', cid)
        canvas.paste(left, (x + 6, y + 22))
        canvas.paste(right, (x + 226, y + 22))
        draw.rectangle((x + 5, y + 21, x + 226, y + 185), outline='#768895', width=1)
        draw.rectangle((x + 225, y + 21, x + 446, y + 185), outline='#768895', width=1)
    canvas.save(evidence / out_name, quality=90, optimize=True)

humans = sorted(cid for cid, c in bm.items() if not c['zombie'])
hollowed = sorted(cid for cid, c in bm.items() if c['zombie'])
roster_sheet(humans, 'human-roster-before-after.jpg', 'SIGHTLINE V3 · 34 HUMAN VARIANTS')
roster_sheet(hollowed, 'hollowed-roster-before-after.jpg', 'SIGHTLINE V3 · 8 HOLLOWED VARIANTS')

with (evidence / 'comparison-matrix.csv').open('w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['id', 'type', 'team', 'role', 'before_fingerprint', 'after_fingerprint', 'fingerprint_changed', 'before_triangles', 'after_triangles', 'triangle_delta', 'before_capture', 'after_capture'])
    for cid in sorted(bm):
        b, a = bm[cid], am[cid]
        w.writerow([cid, 'Hollowed' if b['zombie'] else 'human', b.get('team', ''), b.get('role', ''),
                    b['fingerprint'], a['fingerprint'], b['fingerprint'] != a['fingerprint'],
                    b['bodyTriangles'], a['bodyTriangles'], a['bodyTriangles'] - b['bodyTriangles'],
                    f'before/{cid}.jpg', f'after/{cid}.jpg'])

summary = {
    'capture': 'Actual Sightline game renderer via isolated headless Chromium/WebGL SwiftShader',
    'conditions': 'Same game page, WebGL renderer, viewport, scene, light setup, camera cells, poses, and harness on both candidates.',
    'before_candidate': 'Untouched three-way character merge candidate',
    'after_candidate': 'Claude v12.8 source with the original shoulder proportion restored and arm-pose adapter',
    'before_pass': before['pass'], 'after_pass': after['pass'],
    'characters': len(am), 'humans': len(humans), 'hollowed': len(hollowed),
    'webgl_page_errors_before': len(before['errors']), 'webgl_page_errors_after': len(after['errors']),
    'unique_human_geometry_after': after['summary']['uniqueHumanGeometry'],
    'unique_hollowed_geometry_after': after['summary']['uniqueZombieGeometry'],
    'before_geometry_fingerprints_changed': sum(bm[k]['fingerprint'] != am[k]['fingerprint'] for k in bm),
    'before_mean_character_triangles': before['summary']['meanBodyTriangles'],
    'after_mean_character_triangles': after['summary']['meanBodyTriangles'],
    'before_performance': before['benchmark'], 'after_performance': after['benchmark'],
    'screenshots': ['riptide-before-after.jpg', 'ashfall-before-after.jpg', 'human-roster-before-after.jpg', 'hollowed-roster-before-after.jpg'],
    'matrix': 'comparison-matrix.csv',
    'limits': ['Software-rendered WebGL timings are not device FPS.', 'Pose harness captures render supported states, not live input-driven animation sequences.']
}
(evidence / 'comparison-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps({k: summary[k] for k in ['characters', 'humans', 'hollowed', 'before_geometry_fingerprints_changed', 'before_mean_character_triangles', 'after_mean_character_triangles']}, indent=2))

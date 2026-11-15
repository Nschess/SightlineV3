from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'evidence' / 'firstperson-character' / 'comparison'
out.mkdir(parents=True, exist_ok=True)
for operator in ('riptide', 'ashfall'):
    before = Image.open(root / 'evidence' / 'firstperson-character' / 'before' / f'{operator}-hip.png').convert('RGB')
    after = Image.open(root / 'evidence' / 'firstperson-character' / 'after' / f'{operator}-hip.png').convert('RGB')
    size = (960, 540)
    before.thumbnail(size, Image.Resampling.LANCZOS)
    after.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (size[0] * 2, size[1] + 54), '#111923')
    draw = ImageDraw.Draw(canvas)
    draw.text((14, 16), f'{operator.title()} — BEFORE', fill='#f4f7fa')
    draw.text((size[0] + 14, 16), f'{operator.title()} — AFTER', fill='#f4f7fa')
    canvas.paste(before, (0, 54))
    canvas.paste(after, (size[0], 54))
    canvas.save(out / f'{operator}-before-after.png', optimize=True)
print(f'Wrote comparison images to {out}')

"""Build reproducible contact sheets from the Phase 7 actual-game captures."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "phase7"
OUT = EVIDENCE / "contact"
OUT.mkdir(parents=True, exist_ok=True)
RESULTS = json.loads((EVIDENCE / "gameplay-results.json").read_text(encoding="utf-8"))
KEYS = [g["key"] for g in RESULTS["after"]["guns"]]
STATES = ("hip", "ads", "firing", "reload", "third-person", "third-person-close")
THUMB = (240, 135)
LABEL_H = 24
GAP = 6
COLS = 4
FONT = ImageFont.load_default()

def load_capture(version: str, key: str, state: str) -> Image.Image:
    return Image.open(EVIDENCE / version / f"{key}-{state}.png").convert("RGB")

def card(img: Image.Image, label: str) -> Image.Image:
    img = img.resize(THUMB, Image.Resampling.LANCZOS)
    tile = Image.new("RGB", (THUMB[0], THUMB[1] + LABEL_H), "#101820")
    tile.paste(img, (0, 0))
    ImageDraw.Draw(tile).text((6, THUMB[1] + 5), label, fill="#f2f5f7", font=FONT)
    return tile

for state in STATES:
    cards = [card(load_capture("after", key, state), key.upper()) for key in KEYS]
    rows = (len(cards) + COLS - 1) // COLS
    w, h = COLS * THUMB[0] + (COLS + 1) * GAP, rows * (THUMB[1] + LABEL_H) + (rows + 1) * GAP
    sheet = Image.new("RGB", (w, h), "#263746")
    for i, tile in enumerate(cards):
        sheet.paste(tile, (GAP + (i % COLS) * (THUMB[0] + GAP), GAP + (i // COLS) * (THUMB[1] + LABEL_H + GAP)))
    sheet.save(OUT / f"after-{state}-28.png", optimize=True)

    # Each card keeps the same camera and state: original at left, updated at right.
    pair_w = THUMB[0] * 2 + 8
    pair_h = THUMB[1] + LABEL_H
    pair_cards = []
    for key in KEYS:
        tile = Image.new("RGB", (pair_w, pair_h), "#101820")
        tile.paste(load_capture("before", key, state).resize(THUMB, Image.Resampling.LANCZOS), (0, 0))
        tile.paste(load_capture("after", key, state).resize(THUMB, Image.Resampling.LANCZOS), (THUMB[0] + 8, 0))
        ImageDraw.Draw(tile).text((6, THUMB[1] + 5), f"{key.upper()}  ·  BEFORE / AFTER", fill="#f2f5f7", font=FONT)
        pair_cards.append(tile)
    pair_w_total = COLS * pair_w + (COLS + 1) * GAP
    pair_h_total = rows * pair_h + (rows + 1) * GAP
    compare = Image.new("RGB", (pair_w_total, pair_h_total), "#263746")
    for i, tile in enumerate(pair_cards):
        compare.paste(tile, (GAP + (i % COLS) * (pair_w + GAP), GAP + (i // COLS) * (pair_h + GAP)))
    compare.save(OUT / f"comparison-{state}-28.png", optimize=True)

print(f"Wrote {len(STATES) * 2} contact sheets to {OUT}")

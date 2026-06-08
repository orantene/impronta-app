#!/usr/bin/env python3
"""Side-by-side QA compare PNGs (mockup left, implementation right)."""

from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("pip install Pillow required for QA compare generation")

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "qa"
QA.mkdir(exist_ok=True)

PAIRS = [
    ("qa-style-tab-compare.png", "inspector-style-tab.png", "inspector-style-tab.png"),
    ("qa-layout-tab-compare.png", "layout-responsive-settings.png", "layout-responsive-settings.png"),
    ("qa-page-structure-compare.png", "page-structure-layers.png", "page-structure-layers.png"),
    ("qa-canvas-toolbar-compare.png", "canvas-text-toolbar-target.png", "canvas-text-toolbar-target.png"),
    ("qa-text-selection-compare.png", "canvas-text-toolbar-target.png", "canvas-text-toolbar-target.png"),
    ("qa-builder-canvas-compare.png", "inspector-style-tab.png", "inspector-style-tab.png"),
]

LABEL_H = 28


def compose(out_name: str, left_name: str, right_name: str) -> None:
    left = Image.open(ROOT / left_name).convert("RGBA")
    right = Image.open(ROOT / right_name).convert("RGBA")
    h = max(left.height, right.height)
    w = left.width + right.width
    canvas = Image.new("RGBA", (w, h + LABEL_H), (255, 255, 255, 255))
    canvas.paste(left, (0, LABEL_H))
    canvas.paste(right, (left.width, LABEL_H))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 6), "Mockup (left) · Implementation (right)", fill=(80, 80, 90))
    canvas.convert("RGB").save(QA / out_name)
    print(f"wrote {QA / out_name}")


if __name__ == "__main__":
    for out, left, right in PAIRS:
        compose(out, left, right)

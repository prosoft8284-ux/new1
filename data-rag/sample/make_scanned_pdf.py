"""Build an image-only (scanned-style) Persian PDF from docs.jsonl for OCR tests.

    python sample/make_scanned_pdf.py --in sample/docs.jsonl --out sample/scan.pdf --pages 4
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFilter, ImageFont, features

HAS_RAQM = features.check("raqm")


def shape(text: str) -> str:
    """Return text ready for Pillow's basic layout engine.

    With libraqm, Pillow does Arabic shaping and bidi itself: feed it the logical
    string unchanged (pre-shaping it again would mirror the line).
    """
    if HAS_RAQM:
        return text
    import arabic_reshaper
    from bidi.algorithm import get_display

    return get_display(arabic_reshaper.reshape(text))


def wrap_rtl(paragraph: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Wrap by measured pixel width so nothing is clipped at the left margin."""
    lines: list[str] = []
    current = ""
    for word in paragraph.split():
        trial = f"{current} {word}".strip()
        try:
            fits = font.getlength(trial, direction="rtl") <= max_width
        except TypeError:
            fits = font.getlength(trial) <= max_width
        if fits or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def render_page(lines: list[str], font_path: str, size: tuple[int, int],
                font_size: int, rng: random.Random) -> Image.Image:
    img = Image.new("L", size, 245)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(font_path, font_size)
    width, height = size
    y = 90
    for paragraph in lines:
        wrapped = wrap_rtl(paragraph, font, width - 180)
        for row in wrapped:
            if HAS_RAQM:
                draw.text((width - 90, y), shape(row), font=font, fill=30,
                          anchor="ra", direction="rtl")
            else:
                draw.text((90, y), shape(row), font=font, fill=30, anchor="la")
            y += int(font_size * 1.85)
            if y > height - 120:
                break
        y += int(font_size * 0.7)
        if y > height - 120:
            break
    # a light "scan" look: noise + a small rotation
    img = img.rotate(rng.uniform(-0.25, 0.25), resample=Image.BICUBIC, fillcolor=245)
    noise = Image.effect_noise(size, 12).convert("L")
    return Image.blend(img, noise, 0.05).filter(ImageFilter.SMOOTH)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default="sample/docs.jsonl")
    ap.add_argument("--out", default="sample/scan.pdf")
    ap.add_argument("--pages", type=int, default=4)
    ap.add_argument("--font", default=None)
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--font-size", type=int, default=34)
    ap.add_argument("--source-out", default="sample/scan_source.jsonl")
    args = ap.parse_args()

    font = args.font or str(Path.home() / "tools" / "Vazirmatn.ttf")
    rng = random.Random(7)
    rows = [json.loads(line) for line in Path(args.src).open(encoding="utf-8")][: args.pages]

    mm_to_px = args.dpi / 25.4
    size = (int(148 * mm_to_px), int(210 * mm_to_px))  # A5 portrait
    out = pymupdf.open()
    sources = []
    for i, row in enumerate(rows, start=1):
        img = render_page(row["text"].split("\n\n"), font, size, args.font_size, rng)
        png = f"/tmp/scan-page-{i}.png"
        img.save(png)
        page = out.new_page(width=148 * 72 / 25.4, height=210 * 72 / 25.4)
        page.insert_image(page.rect, filename=png)
        sources.append({"page": i, "text": row["text"]})

    out.save(args.out)
    out.close()
    Path(args.source_out).write_text(
        "\n".join(json.dumps(s, ensure_ascii=False) for s in sources) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(rows)} image-only pages -> {args.out} (source: {args.source_out})")


if __name__ == "__main__":
    main()

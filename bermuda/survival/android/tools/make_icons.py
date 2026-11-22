#!/usr/bin/env python3
"""Draw the BERMUDA SIEGE launcher icon and write every density.

One 512 px artwork (evening sea, a single blade, sun on the horizon) scaled with
Lanczos into mipmap-* so the icon is crisp from a 2015 phone to a tablet.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter

RES = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "res"))
S = 512


def grad(size, top, bottom):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        k = y / (size - 1)
        d.line([(0, y), (size, y)], fill=(
            int(top[0] + (bottom[0] - top[0]) * k),
            int(top[1] + (bottom[1] - top[1]) * k),
            int(top[2] + (bottom[2] - top[2]) * k),
        ))
    return img


def main():
    img = grad(S, (26, 54, 74), (206, 186, 148)).convert("RGBA")

    # sun sitting on the horizon
    sun = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sun)
    cx, cy = S * 0.5, S * 0.60
    for r in range(150, 0, -2):
        a = int(70 * (1 - r / 150) ** 1.6) + 8
        sd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 226, 170, a))
    sd.ellipse([cx - 42, cy - 42, cx + 42, cy + 42], fill=(255, 244, 214, 235))
    img = Image.alpha_composite(img, sun.filter(ImageFilter.GaussianBlur(2)))

    # sea band
    sea = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(sea)
    dd.rectangle([0, int(S * 0.62), S, S], fill=(22, 92, 108, 235))
    for i in range(7):                      # horizon glints
        y = S * 0.64 + i * 12
        w = 120 - i * 12
        dd.ellipse([cx - w, y, cx + w, y + 6], fill=(255, 240, 205, 30))
    img = Image.alpha_composite(img, sea)

    # a blade, drawn as a tapered diamond with a warm highlight
    blade = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blade)
    tipx, tipy = S * 0.66, S * 0.13
    gx, gy = S * 0.34, S * 0.79
    nx, ny = -(gy - tipy), (gx - tipx)
    ln = math.hypot(nx, ny) or 1
    nx, ny = nx / ln, ny / ln
    w = 26
    bd.polygon([
        (tipx, tipy),
        (tipx + nx * w * 0.35, tipy + ny * w * 0.35),
        (gx + nx * w, gy + ny * w),
        (gx - nx * w * 0.5, gy - ny * w * 0.5),
        (tipx - nx * w * 0.2, tipy - ny * w * 0.2),
    ], fill=(226, 235, 242, 255))
    bd.polygon([
        (tipx, tipy),
        (tipx + nx * 5, tipy + ny * 5),
        (gx, gy),
        (tipx - nx * 6, tipy - ny * 6),
    ], fill=(255, 255, 255, 210))
    # guard and grip
    bd.line([(gx - nx * 74, gy - ny * 74), (gx + nx * 74, gy + ny * 74)], fill=(176, 138, 82, 255), width=16)
    bd.line([(gx, gy), (gx - 46, gy + 62)], fill=(74, 54, 36, 255), width=22)
    bd.ellipse([gx - 60, gy + 52, gx - 26, gy + 82], fill=(176, 138, 82, 255))
    img = Image.alpha_composite(img, blade.filter(ImageFilter.GaussianBlur(0.6)))

    # vignette + soft inner border
    vig = Image.new("L", (S, S), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-S * 0.22, -S * 0.22, S * 1.22, S * 1.22], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(60))
    dark = Image.new("RGBA", (S, S), (4, 6, 8, 255))
    img = Image.composite(img, dark, vig)

    frame = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle([10, 10, S - 10, S - 10], radius=86, outline=(216, 201, 163, 60), width=4)
    img = Image.alpha_composite(img, frame)

    for folder, px in (("mipmap-mdpi", 48), ("mipmap-hdpi", 72), ("mipmap-xhdpi", 96),
                       ("mipmap-xxhdpi", 144), ("mipmap-xxxhdpi", 192)):
        out = os.path.join(RES, folder)
        os.makedirs(out, exist_ok=True)
        img.resize((px, px), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"), optimize=True)
        print("wrote", os.path.join(folder, "ic_launcher.png"), px)

    img.resize((512, 512), Image.LANCZOS).save(os.path.join(RES, "..", "icon-512.png"))


if __name__ == "__main__":
    main()

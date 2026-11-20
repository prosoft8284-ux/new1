#!/usr/bin/env python3
"""ساخت لوگو و آیکون‌های اپ (PNG) + آیکون‌های لانچر اندروید، بدون وابستگی به فونت فارسی."""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024
NAVY_TOP = (17, 36, 56)
NAVY_BOT = (31, 74, 110)
CREAM = (246, 241, 229)
CREAM_DIM = (222, 213, 195)
SAFFRON = (233, 164, 62)
GOLD_LIGHT = (247, 199, 118)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size):
    img = Image.new("RGB", (size, size), NAVY_TOP)
    d = ImageDraw.Draw(img)
    for y in range(size):
        d.line([(0, y), (size, y)], fill=lerp(NAVY_TOP, NAVY_BOT, y / size))
    return img


def book(d, ox=0, oy=0, scale=1.0, ink=CREAM, dim=CREAM_DIM):
    """کتاب باز: دو صفحهٔ قرینه + عطف + خطوط صفحه"""
    def P(x, y):
        return (ox + x * scale, oy + y * scale)

    left = [P(150, 452), P(492, 498), P(492, 748), P(150, 690)]
    right = [P(874, 452), P(532, 498), P(532, 748), P(874, 690)]
    d.polygon(left, fill=ink)
    d.polygon(right, fill=ink)
    # عطف
    d.polygon([P(486, 496), P(538, 496), P(538, 752), P(486, 752)], fill=dim)
    # خطوط متن روی صفحه‌ها
    for i, y in enumerate((560, 610, 660)):
        w = 1 - i * 0.2
        d.line([P(216, y + 34 - i * 6), P(216 + 226 * w, y + 6 - i * 6)], fill=(60, 82, 104), width=max(2, int(9 * scale)))
        d.line([P(808, y + 34 - i * 6), P(808 - 226 * w, y + 6 - i * 6)], fill=(60, 82, 104), width=max(2, int(9 * scale)))
    # قاعدهٔ زعفرانی
    d.rounded_rectangle([P(268, 800), P(756, 830)], radius=15 * scale, fill=SAFFRON)


def spark(d, ox=0, oy=0, scale=1.0):
    """ستارهٔ چهارپر بالای کتاب"""
    cx, cy = ox + 512 * scale, oy + 300 * scale
    r_long, r_short = 118 * scale, 38 * scale
    pts = []
    for i in range(8):
        ang = i * 45
        r = r_long if i % 2 == 0 else r_short
        import math
        a = math.radians(ang - 90)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=SAFFRON)
    d.ellipse([cx - 26 * scale, cy - 26 * scale, cx + 26 * scale, cy + 26 * scale], fill=GOLD_LIGHT)


def art(size, with_bg=True, content_scale=1.0, round_mask=False):
    big = gradient(S) if with_bg else Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # کوچک‌کردن محتوا حول مرکز برای حاشیهٔ ایمن آیکون تطبیقی
    c = (S - S * content_scale) / 2
    off = c if content_scale != 1.0 else 0
    book(d, off, off, content_scale, CREAM, CREAM_DIM)
    spark(d, off, off, content_scale)
    if with_bg:
        big = big.convert("RGBA")
        big.alpha_composite(layer)
    else:
        big = layer
    if round_mask:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=190, fill=255)
        big.putalpha(mask)
    return big.resize((size, size), Image.LANCZOS)


def main():
    app = os.path.join(ROOT, "app")
    icon512 = art(512)
    icon512.save(os.path.join(app, "icon-512.png"))
    art(1024).save(os.path.join(ROOT, "app", "icon-1024.png"))
    art(192).save(os.path.join(app, "icon-192.png"))

    res = os.path.join(ROOT, "mobile", "android", "app", "src", "main", "res")
    dens = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    if os.path.isdir(res):
        for name, px in dens.items():
            folder = os.path.join(res, "mipmap-" + name)
            os.makedirs(folder, exist_ok=True)
            art(px).save(os.path.join(folder, "ic_launcher.png"))
            art(px, round_mask=True).save(os.path.join(folder, "ic_launcher_round.png"))
            fg = int(px * 108 / 48)
            art(fg, with_bg=False, content_scale=0.62).save(os.path.join(folder, "ic_launcher_foreground.png"))
        bg = os.path.join(res, "drawable", "ic_launcher_background.xml")
        if os.path.exists(bg):
            with open(bg, "w", encoding="utf-8") as f:
                f.write('<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n  <solid android:color="#122438"/>\n</shape>\n')
        fgx = os.path.join(res, "drawable-v24", "ic_launcher_foreground.xml")
        if os.path.exists(fgx):
            with open(fgx, "w", encoding="utf-8") as f:
                f.write('<?xml version="1.0" encoding="utf-8"?>\n<inset xmlns:android="http://schemas.android.com/apk/res/android"\n    android:drawable="@mipmap/ic_launcher_foreground"\n    android:inset="0dp" />\n')
    print("icons written")


if __name__ == "__main__":
    main()

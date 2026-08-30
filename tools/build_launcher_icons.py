#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
從網頁 PWA 圖示產生 Android launcher icon（各密度 mipmap）。

用途
----
每次重打包 APK 前執行一次，確保手機桌面圖示是「熊貓」，
不會因為 decoded/ 基底是從原始 v3.41 APK 反編譯而退回舊圖示。

用法
----
    python tools/build_launcher_icons.py <decoded的res目錄> [來源圖]

    # 例（來源省略時用 icons/icon-512.png）
    python tools/build_launcher_icons.py ../decoded/res
    python tools/build_launcher_icons.py ../decoded/res icons/icon-512.png

需要 Pillow：pip install Pillow

為什麼不能直接把來源圖塞進 mipmap？
----------------------------------
網頁 icon-512.png 是一張**真實照片**：RGB 無 alpha，四角是雜亂的拍攝背景
（左上 #7a7a5e、左下 #040406、右下 #968a72）。若整張滿版當 launcher，
Android 各廠牌的遮罩（圓形 / 圓角方形 / 水滴）裁下去會露出那圈雜亂背景。

因此本腳本改為「品牌藍滿版 + 中央圓形熊貓」構圖：
  * 圓直徑 = 圖示的 74%，大於 Android adaptive icon 的 66% 安全區，
    保證主體不被任何遮罩裁到
  * 圓外一圈白色細環（高斯模糊柔邊），讓主體從底色浮出，小尺寸也認得出
  * 遮罩只會裁到藍色邊，熊貓永遠完整

底色 #2563eb 沿用 res/drawable/ic_launcher.xml 的品牌藍，
與網頁 icons/icon-maskable-512.png 視覺一致。
"""
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFilter

BRAND_BLUE = (37, 99, 235)          # #2563eb
RING_WHITE = (255, 255, 255, 255)
CIRCLE_RATIO = 0.74                 # 熊貓圓形直徑佔圖示的比例
RING_RATIO = 0.028                  # 白色環寬度佔比
BASE = 512                          # 先在大尺寸作圖再縮小，邊緣最平滑

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def build_base(src_path, size=BASE):
    """產生基準尺寸的構圖。"""
    photo = Image.open(src_path).convert("RGB")

    d = int(size * CIRCLE_RATIO)
    ring = max(2, int(size * RING_RATIO))

    # 取照片中央正方形（熊貓臉就在畫面中央），縮成正圓所需尺寸
    side = min(photo.width, photo.height)
    left = (photo.width - side) // 2
    top = (photo.height - side) // 2
    photo = photo.crop((left, top, left + side, top + side))
    photo = photo.resize((d, d), Image.LANCZOS)

    # 高解析遮罩再縮小，圓邊不鋸齒
    scale = 4
    mask = Image.new("L", (d * scale, d * scale), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d * scale - 1, d * scale - 1), fill=255)
    mask = mask.resize((d, d), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), BRAND_BLUE + (255,))

    # 白色細環
    ring_d = d + ring * 2
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - ring_d) // 2
    ImageDraw.Draw(layer).ellipse(
        (off, off, off + ring_d - 1, off + ring_d - 1), fill=RING_WHITE)
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius=size * 0.004)))

    # 熊貓本體
    off = (size - d) // 2
    canvas.paste(photo, (off, off), mask)
    return canvas


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    res_dir = sys.argv[1]
    if len(sys.argv) >= 3:
        src = sys.argv[2]
    else:
        src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "icons", "icon-512.png")

    if not os.path.isfile(src):
        print("找不到來源圖: %s" % src)
        sys.exit(1)
    if not os.path.isdir(res_dir):
        print("找不到 res 目錄: %s" % res_dir)
        sys.exit(1)

    base_img = build_base(src)
    before = after = 0

    for dens, px in DENSITIES.items():
        out_dir = os.path.join(res_dir, dens)
        os.makedirs(out_dir, exist_ok=True)
        img = base_img.resize((px, px), Image.LANCZOS)

        for fname in ("ic_launcher.png", "ic_launcher_round.png"):
            path = os.path.join(out_dir, fname)
            if os.path.exists(path):
                before += os.path.getsize(path)
            img.save(path, "PNG", optimize=True)
            after += os.path.getsize(path)

        print("%-16s %3dx%-3d  %d bytes each"
              % (dens, px, px, os.path.getsize(os.path.join(out_dir, "ic_launcher.png"))))

    print("\n來源: %s" % src)
    print("輸出: %s" % res_dir)
    print("總大小: %d -> %d bytes" % (before, after))
    print("\n完成。接著照 BUILD.md 4.2 繼續 apktool b -> zipalign -> apksigner。")


if __name__ == "__main__":
    main()

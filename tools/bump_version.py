#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
記帳 app 版本自動跳號工具（bump_version.py）

功能：
  每次發版只需跑這一支，就會自動把版本號與「更新於」日期同步到所有地方，
  不用再手動改 4 個位置。

版本號規則（依使用者慣例）：
  - 小更新（預設）：minor +1       例 3.73 -> 3.74、3.79 -> 3.80
  - 大版本（--major）：minor 進位到下一個十位並補零  例 3.73 -> 3.80、3.99 -> 4.00

會更新的位置：
  1. js/app.yu-vX.YZ.js        檔名（改名）
  2. js/app.yu-vX.YZ.js        const APP_VERSION / APP_BUILD_DATE
  3. index.html                css/styles.css?v=... 與 app script src/js/app...js?v=...
  4. sw.js                     const CACHE = 'billkeeper-vN'（每發版 +1，清舊快取）

用法：
  python tools/bump_version.py            # dry-run，只顯示將做的事，不寫入
  python tools/bump_version.py --apply    # 實際寫入檔案
  python tools/bump_version.py --major    # 大版本跳號（仍需加 --apply 才寫入）
  python tools/bump_version.py --repo 路徑  # 指定 repo 根目錄（預設為本檔上層）

注意：
  - cloud.yu-vX.YZ.js 是另一個模組，本工具不動它，請單獨處理。
  - 本工具只改版本號/日期，不會 git commit / push / 重打包 APK。
"""

import os
import re
import sys
import glob
import datetime
import shutil

DEFAULT_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # tools/ 的上層 = repo 根


def parse_version(ver_str):
    """'3.73' -> (3, 73)"""
    m = re.match(r'^(\d+)\.(\d+)$', ver_str.strip())
    if not m:
        raise ValueError(f"無法解析版本號：{ver_str!r}")
    return int(m.group(1)), int(m.group(2))


def next_version(major, minor, big):
    if big:
        # 進位到下一個十位並補零；99 -> 100 則进位到下一主版
        if minor >= 90:
            return major + 1, 0
        return major, ((minor // 10) + 1) * 10
    else:
        minor += 1
        if minor >= 100:
            major += 1
            minor = 0
        return major, minor


def fmt_version(major, minor):
    return f"{major}.{minor:02d}"


def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    big = "--major" in args
    repo = DEFAULT_REPO
    for i, a in enumerate(args):
        if a == "--repo" and i + 1 < len(args):
            repo = args[i + 1]

    repo = os.path.abspath(repo)
    if not os.path.isdir(repo):
        print(f"[錯誤] repo 不存在：{repo}")
        sys.exit(1)

    index_html = os.path.join(repo, "index.html")
    sw_js = os.path.join(repo, "sw.js")
    js_dir = os.path.join(repo, "js")
    if not (os.path.isfile(index_html) and os.path.isdir(js_dir)):
        print(f"[錯誤] 這不是 expense-tracker repo 根目錄：{repo}")
        sys.exit(1)

    # 1) 從 index.html 取得目前 app 引用的 js 版本
    with open(index_html, encoding="utf-8") as f:
        html = f.read()
    m = re.search(r'src="js/app\.yu-v([\d.]+)\.js\?v=yu-v[\d.]+"', html)
    if not m:
        print("[錯誤] 在 index.html 找不到 app.yu-vX.YZ.js 的引用")
        sys.exit(1)
    cur_ver = m.group(1)
    major, minor = parse_version(cur_ver)
    nmajor, nminor = next_version(major, minor, big)
    new_ver = fmt_version(nmajor, nminor)
    today = datetime.date.today().strftime("%Y-%m-%d")

    old_js = os.path.join(js_dir, f"app.yu-v{cur_ver}.js")
    new_js = os.path.join(js_dir, f"app.yu-v{new_ver}.js")
    if not os.path.isfile(old_js):
        print(f"[錯誤] 找不到目前的 js 檔：{old_js}")
        sys.exit(1)

    # 2) sw.js CACHE 計數
    with open(sw_js, encoding="utf-8") as f:
        sw = f.read()
    cm = re.search(r"const CACHE = 'billkeeper-v(\d+)'", sw)
    if not cm:
        print("[錯誤] 在 sw.js 找不到 CACHE 宣告")
        sys.exit(1)
    cur_cache = int(cm.group(1))
    new_cache = cur_cache + 1

    print("=" * 56)
    print(f"  記帳 app 版本跳號  {'[乾跑 dry-run]' if not apply else '[實際寫入]'}")
    print("=" * 56)
    print(f"  目前版本 : yu-v{cur_ver}")
    print(f"  新版本   : yu-v{new_ver}  ({'大版本' if big else '小更新'})")
    print(f"  更新於   : {today}")
    print(f"  sw CACHE : billkeeper-v{cur_cache} -> billkeeper-v{new_cache}")
    print("-" * 56)
    print(f"  [1] 改檔名 : {os.path.basename(old_js)} -> {os.path.basename(new_js)}")
    print(f"  [2] js 內   : APP_VERSION / APP_BUILD_DATE")
    print(f"  [3] index   : css ?v= 與 app script src")
    print(f"  [4] sw.js   : CACHE +1")
    print("=" * 56)

    if not apply:
        print("（未加 --apply，僅預覽，未做任何修改）")
        return

    # ---- 實際寫入 ----
    # [2] 讀 js 內容並改版本/日期，先寫到新檔名
    with open(old_js, encoding="utf-8") as f:
        js = f.read()
    js = re.sub(r"const APP_VERSION = 'yu-v[\d.]+';",
                f"const APP_VERSION = 'yu-v{new_ver}';", js, count=1)
    js = re.sub(r"const APP_BUILD_DATE = '\d{4}-\d{2}-\d{2}';",
                f"const APP_BUILD_DATE = '{today}';", js, count=1)
    with open(new_js, "w", encoding="utf-8") as f:
        f.write(js)
    # 備份舊檔後刪除（用 shutil 移到 .bak，避免誤刪）
    bak = old_js + ".bak"
    if os.path.exists(bak):
        os.remove(bak)
    shutil.move(old_js, bak)

    # [3] index.html
    html2 = html
    html2 = re.sub(r'href="css/styles.css\?v=yu-v[\d.]+"',
                   f'href="css/styles.css?v=yu-v{new_ver}"', html2, count=1)
    html2 = re.sub(r'src="js/app\.yu-v[\d.]+\.js\?v=yu-v[\d.]+"',
                   f'src="js/app.yu-v{new_ver}.js?v=yu-v{new_ver}"', html2, count=1)
    with open(index_html, "w", encoding="utf-8") as f:
        f.write(html2)

    # [4] sw.js
    sw2 = re.sub(r"const CACHE = 'billkeeper-v\d+'",
                 f"const CACHE = 'billkeeper-v{new_cache}'", sw, count=1)
    with open(sw_js, "w", encoding="utf-8") as f:
        f.write(sw2)

    print("✅ 已完成版本跳號。下一步建議：")
    print("   git add -A && git commit -m 'release: yu-v%s' && git push origin main" % new_ver)
    print("   （若只改網頁，push 後 GitHub Pages 約 1 分鐘上線，APK 無需重打包）")


if __name__ == "__main__":
    main()

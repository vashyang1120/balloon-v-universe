#!/usr/bin/env python3
"""方塊派對 UI 測試版：由派對島原始按鈕 PNG 產生 Sandbox 專用衍生素材（v0.2.1-test-1）

來源（只讀，不修改原檔）：vashyang1120/balloon-v-rush 的
  assets/adventure/ui/components/ui_button_purple.png
  assets/adventure/ui/components/ui_button_yellow.png.png   ← Repository 實際檔名就是 .png.png
  assets/adventure/ui/components/ui_button_blue.png.png     ← 同上
處理：
  1. 讀取 Alpha，找出按鈕本體的 bounding box（只計 alpha ≥ 200 且每列／欄至少 3 個像素，避免孤立雜點）
  2. 往外擴到 alpha 低於 16 為止（最多 24px），保留金框外緣、陰影與抗鋸齒
  3. 只裁掉透明留白，不重畫、不改色；等比例縮小成寬 960px（手機 3 倍解析度約 320pt 寬仍清晰）
  4. 輸出 universe/tetris-ui-test/assets/btn_{purple,yellow,blue}.png，並印出 3-slice 端蓋寬度建議
用法：python3 -I universe/tetris-ui-test/tools/make_button_assets.py <balloon-v-rush clone>
"""
import sys, os, json, hashlib
from PIL import Image
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else "../balloon-v-rush"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
FILES = {"purple": "ui_button_purple.png", "yellow": "ui_button_yellow.png.png", "blue": "ui_button_blue.png.png"}
TARGET_W = 960
report = {}
for key, name in FILES.items():
    rel = "assets/adventure/ui/components/" + name
    path = os.path.join(SRC, rel)
    raw = open(path, "rb").read()
    im = Image.open(path).convert("RGBA"); a = np.array(im)[:, :, 3]
    strong = a >= 200
    cols = np.where(strong.sum(axis=0) >= 3)[0]; rows = np.where(strong.sum(axis=1) >= 3)[0]
    x0, x1, y0, y1 = int(cols.min()), int(cols.max()) + 1, int(rows.min()), int(rows.max()) + 1
    def expand(x0, y0, x1, y1):
        for _ in range(24):
            grew = False
            if x0 > 0 and a[y0:y1, x0 - 1].max() >= 16: x0 -= 1; grew = True
            if x1 < im.width and a[y0:y1, x1].max() >= 16: x1 += 1; grew = True
            if y0 > 0 and a[y0 - 1, x0:x1].max() >= 16: y0 -= 1; grew = True
            if y1 < im.height and a[y1, x0:x1].max() >= 16: y1 += 1; grew = True
            if not grew: break
        return x0, y0, x1, y1
    bx = expand(x0, y0, x1, y1)
    allbox = Image.open(path).getbbox()
    crop = im.crop(bx)
    h = round(crop.height * TARGET_W / crop.width)
    out = crop.resize((TARGET_W, h), Image.LANCZOS)
    dst = os.path.join(OUT, f"btn_{key}.png")
    out.save(dst, optimize=True)
    report[key] = {"source_repo": "vashyang1120/balloon-v-rush", "source_path": rel, "source_size": list(im.size),
                   "source_sha256": hashlib.sha256(raw).hexdigest(), "alpha_bbox_all_pixels": list(allbox),
                   "alpha_bbox_button_body": [x0, y0, x1, y1], "crop_box": list(bx), "crop_size": [crop.width, crop.height],
                   "output": f"universe/tetris-ui-test/assets/btn_{key}.png", "output_size": [TARGET_W, h], "output_bytes": os.path.getsize(dst)}
    print(key, json.dumps(report[key], ensure_ascii=False))
json.dump(report, open(os.path.join(OUT, "button-sources.json"), "w"), ensure_ascii=False, indent=1)

#!/usr/bin/env python3
"""Batch 2-C Test 1｜BP-01 黃色齒輪狀關節：從原始地圖擷取動畫圖層。

用法：
    python3 -I build_gear_assets.py <universe_map_bg.png> <輸出目錄>

只讀原圖。全部像素都取自原圖；修補區只複製輪廓外側最近的原圖像素。
產出（座標皆為原圖 1536×1024）：
    gear-assets/bp01-plate.png      修補底圖（齒輪移開後露出的窄邊用）
    gear-assets/bp01-gear.png       後方齒輪（花瓣）透明圖層，含前方輪轂邊緣下的延伸
    gear-assets/bp01-hub.png        前方輪轂（圓環）透明圖層
    gear-assets/bp01-mask.png       允許改寫的範圍（齒輪輪廓外擴 4 px）
    gear-assets/bp01-layout.json    範圍、旋轉中心、像素統計
    gear-assets.js                  上述 PNG 的 data URI，供離線 file:// 預覽
    map-asset.js                    原始地圖的 data URI（只供本樣本離線預覽）
"""
import base64, hashlib, io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd

MAP_SHA = "78c4885e61f71b4cb5c63680eed97a04c0023aed81f2e58ae839ff3ff913953f"
RECT = (396, 284, 76, 74)          # x, y, w, h：工作範圍（含修補與遮罩）
SEARCH = (404, 288, 64, 64)        # 齒輪色塊搜尋窗
HUB_CIRCLE = (423.25, 331.8, 17.3) # 前方輪轂外圓（目測＋輪廓擬合）
HUB_PIVOT = (417.6, 332.0)         # 輪轂軸孔中心
GEAR_PIVOT = (437.0, 320.0)        # 後方花瓣齒輪的中心
MASK_GROW = 4                      # 允許改寫的外擴 px
UNDER_HUB = 4                      # 輪轂邊緣下，齒輪延伸 px


def png_bytes(arr):
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "PNG", optimize=True)
    return buf.getvalue()


def main(src, out):
    data = Path(src).read_bytes()
    if hashlib.sha256(data).hexdigest() != MAP_SHA:
        sys.exit("原圖 SHA-256 不符，停止。")
    full = np.array(Image.open(src).convert("RGBA"))
    assert full.shape[:2] == (1024, 1536)
    rgb = full[..., :3].astype(int)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    yellow = (R > 195) & (G > 140) & (B < 175) & (R - B > 55)
    win = np.zeros_like(yellow)
    sx, sy, sw, sh = SEARCH
    win[sy:sy + sh, sx:sx + sw] = True
    lab, n = nd.label(yellow & win)
    sizes = nd.sum(yellow & win, lab, range(1, n + 1))
    union = lab == (int(np.argmax(sizes)) + 1)
    # 外緣的淺黃高光（藍色分量較高）用相鄰成長補進來
    pale = (R > 200) & (G > 160) & (R - B > 15) & win
    for _ in range(4):
        union |= pale & nd.binary_dilation(union, iterations=1)
    union = nd.binary_fill_holes(nd.binary_closing(union, iterations=2))
    # 外擴 1 px 收進原圖的抗鋸齒邊，讓靜止畫面與原圖逐像素相同
    d1 = nd.binary_dilation(union, iterations=1)
    yy, xx = np.mgrid[0:1024, 0:1536]
    cx, cy, cr = HUB_CIRCLE
    circle = (xx - cx) ** 2 + (yy - cy) ** 2 <= cr ** 2
    # 後方花瓣齒輪＝輪轂外圓以外的主體；開運算去掉輪轂左下方 1–2 px 的細邊
    flower = nd.binary_opening(union & ~circle, iterations=2)
    gear_core = d1 & ~circle & nd.binary_dilation(flower, iterations=1)
    hub = d1 & ~gear_core & nd.binary_dilation(circle, iterations=2)
    # 不屬於齒輪也不屬於輪轂的細邊（手臂黃色接環旁的連接像素）保持原圖靜止
    anim = gear_core | hub
    static_rim = d1 & ~anim

    # 修補底圖：動畫圖層內的像素取「圖層外擴 1 px 以外」最近的原圖像素（避開抗鋸齒混色）
    outside = ~nd.binary_dilation(anim, iterations=1)
    _, (iy, ix) = nd.distance_transform_edt(~outside, return_indices=True)
    plate = full.copy()
    fill = anim  # 只修補動畫圖層原本覆蓋的像素；靜止時圖層蓋回原圖，畫面與原圖逐像素相同
    plate[fill, :3] = full[iy[fill], ix[fill], :3]

    # 後方齒輪：輪轂邊緣下 UNDER_HUB px 內，若最近的非輪轂像素是齒輪，就延伸齒輪顏色
    dist_g, (gy, gx) = nd.distance_transform_edt(~gear_core, return_indices=True)
    ext = hub & circle & (dist_g <= UNDER_HUB)
    gear = np.zeros_like(full)
    gear[gear_core] = full[gear_core]
    gear[gear_core, 3] = 255
    gear[ext, :3] = full[gy[ext], gx[ext], :3]
    gear[ext, 3] = 255

    hub_l = np.zeros_like(full)
    hub_l[hub] = full[hub]
    hub_l[hub, 3] = 255

    mask = nd.binary_dilation(anim, iterations=MASK_GROW)
    x, y, w, h = RECT
    ys, xs = np.where(mask)
    assert xs.min() >= x and ys.min() >= y and xs.max() < x + w and ys.max() < y + h, "遮罩超出工作範圍"

    out = Path(out)
    (out / "gear-assets").mkdir(parents=True, exist_ok=True)
    crop = lambda arr: arr[y:y + h, x:x + w]
    m8 = np.zeros((h, w, 4), np.uint8)
    m8[crop(mask)] = [255, 255, 255, 255]
    files = {
        "plate": crop(plate).astype(np.uint8),
        "gear": crop(gear).astype(np.uint8),
        "hub": crop(hub_l).astype(np.uint8),
        "mask": m8,
    }
    uris, shas = {}, {}
    for k, arr in files.items():
        b = png_bytes(arr)
        (out / "gear-assets" / f"bp01-{k}.png").write_bytes(b)
        uris[k] = "data:image/png;base64," + base64.b64encode(b).decode()
        shas[f"gear-assets/bp01-{k}.png"] = hashlib.sha256(b).hexdigest()

    # 最遠的像素到各自旋轉中心的距離（估算位移）
    gy_, gx_ = np.where(gear_core)
    hy_, hx_ = np.where(hub)
    rg = float(np.max(np.hypot(gx_ + .5 - GEAR_PIVOT[0], gy_ + .5 - GEAR_PIVOT[1])))
    rh = float(np.max(np.hypot(hx_ + .5 - HUB_PIVOT[0], hy_ + .5 - HUB_PIVOT[1])))
    layout = {
        "mapSha256": MAP_SHA, "rectXYWH": list(RECT),
        "unionBBoxXYXY": [int(np.where(union)[1].min()), int(np.where(union)[0].min()), int(np.where(union)[1].max()), int(np.where(union)[0].max())],
        "unionPixels": int(union.sum()), "maskPixels": int(mask.sum()),
        "hubCircleXYR": list(HUB_CIRCLE), "hubPivotXY": list(HUB_PIVOT), "gearPivotXY": list(GEAR_PIVOT),
        "maxRadiusPx": {"gear": round(rg, 2), "hub": round(rh, 2)},
        "underHubExtensionPixels": int(ext.sum()), "staticRimPixels": int(static_rim.sum()),
        "assets": shas,
    }
    (out / "gear-assets" / "bp01-layout.json").write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")
    js = ("\"use strict\";\n// 由 build_gear_assets.py 產生：BP-01 圖層全部取自原始地圖像素。\n"
          "const LobbyGearAssets = " + json.dumps({"layout": {k: layout[k] for k in ("rectXYWH", "hubPivotXY", "gearPivotXY")}, "images": uris}) + ";\n")
    (out / "gear-assets.js").write_text(js, encoding="utf-8")
    # 離線預覽用的原始地圖 data URI（內容與原圖逐位元組相同）
    (out / "map-asset.js").write_text(
        "\"use strict\";\n// 原始地圖 assets/universe_map_bg.png（SHA-256 " + MAP_SHA + "）的 data URI，讓 file:// 離線預覽可讀取像素。\n"
        "const LobbyMapImage = \"data:image/png;base64," + base64.b64encode(data).decode() + "\";\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in layout.items() if k != "assets"}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

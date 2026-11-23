#!/usr/bin/env python3
"""Batch 2-C Revision 1 Test 2｜吊臂搬運：BP-02 手臂＋BP-01 齒輪＋③ 支柱塔＋④ 粉紅大方塊，從原始地圖擷取動畫圖層。

用法：
    python3 -I build_crane_assets.py <universe_map_bg.png> <輸出目錄>

只讀原圖。所有圖層像素都取自原圖：
- 可見部分＝原圖像素原封不動。
- 「隱藏延伸」只放在上層零件正下方（靜止時完全被蓋住），沿零件自己的軸向複製原圖截面，
  讓關節轉動時露出的是同一根管子的延續，而不是背景。
- 修補底圖只處理活動零件原本覆蓋的位置，以輪廓外側原圖像素做鏡射／最近鄰複製。

產出（座標皆為原圖 1536×1024）：
    arm-assets/plate.png       修補底圖
    arm-assets/boom.png        雙管主臂（繞肩部紅色圓環軸孔轉動）
    arm-assets/coupler.png     肘部圓頭＋前臂（以藍色鉚釘為肘關節）
    arm-assets/torus.png       肩部紅色圓環（固定）
    arm-assets/load.png        ③ 支柱塔＋④ 粉紅大方塊（整組垂直吊起），含方塊堆後方的方塊延伸、齒輪下的支架延伸
    arm-assets/front.png       固定前景：⑤ 彩色方塊堆、左側黃色方塊柱（永遠畫在大方塊前面）
    arm-assets/gear.png        後方齒輪（繞齒輪中心轉動）
    arm-assets/hub.png         前方輪轂（與齒輪同軸）
    arm-assets/mask.png        允許改寫範圍
    arm-assets/layout.json     範圍、支點、零件統計
    arm-assets.js              上述 PNG 的 data URI
    map-asset.js               原始地圖 data URI（只供離線預覽）
"""
import base64, hashlib, io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as nd
from PIL import ImageDraw

MAP_SHA = "78c4885e61f71b4cb5c63680eed97a04c0023aed81f2e58ae839ff3ff913953f"
RECT = (268, 212, 256, 336)                 # x, y, w, h 工作範圍

# 支點與結構（原圖座標，目測＋輪廓擬合）
SHOULDER = (327.8, 367.5)                   # 肩部紅色圓環軸孔中心＝主臂轉軸
TORUS = (332.5, 369.5, 13.5, 16.0)          # 肩部圓環橢圓（cx, cy, rx, ry）
ELBOW = (389.6, 305.0)                      # 肘部藍色鉚釘中心＝肘關節
KNUCKLE = (390.5, 303.0, 17.5)              # 肘部圓頭（cx, cy, r）
FOREARM_AXIS = (26.4, 3.5)                  # 前臂軸向
PIN = None                                  # 由 ELBOW + 29 px 沿前臂軸計算（隱藏在齒輪左上瓣後）
GEAR_PIVOT = (437.0, 320.0)                 # 齒輪中心（沿用 Test 1）
HUB_PIVOT = (417.6, 332.0)                  # 輪轂軸孔中心（沿用 Test 1）
HUB_CIRCLE = (423.25, 331.8, 17.3)
BP04_TIE = (410.0, 296.0)                   # BP-04 繩尾在畫面上的位置（屬後方區域，與手臂無連接；只量測）
MASK_GROW = 28


def png_bytes(arr):
    buf = io.BytesIO()
    Image.fromarray(arr.astype(np.uint8)).save(buf, "PNG", optimize=True)
    return buf.getvalue()


def largest(mask):
    lab, n = nd.label(mask)
    if n == 0:
        return mask
    sizes = nd.sum(mask, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def extend_along(full, visible, zone, axis, max_steps=60, step=0.5):
    """zone 內每個像素沿 -axis 回溯，取第一個落在 visible 的原圖像素（同一根管子的截面延續）。"""
    out = np.zeros(full.shape, np.uint8)
    hit = np.zeros(zone.shape, bool)
    ys, xs = np.where(zone)
    ux, uy = axis
    for y, x in zip(ys, xs):
        for k in range(1, max_steps + 1):
            sx = int(round(x - ux * k * step))
            sy = int(round(y - uy * k * step))
            if 0 <= sx < full.shape[1] and 0 <= sy < full.shape[0] and visible[sy, sx]:
                out[y, x, :3] = full[sy, sx, :3]
                out[y, x, 3] = 255
                hit[y, x] = True
                break
    return out, hit


def mirror_along(full, visible, zone, axis, max_steps=60, step=0.5):
    """zone 內每個像素沿 -axis 找到可見邊界（距離 k），改取邊界另一側距離 k 的原圖像素（鏡射延續，保留圓管的明暗形狀）。"""
    out = np.zeros(full.shape, np.uint8)
    hit = np.zeros(zone.shape, bool)
    ys, xs = np.where(zone)
    ux, uy = axis
    for y, x in zip(ys, xs):
        for k in range(1, max_steps + 1):
            sx = int(round(x - ux * k * step)); sy = int(round(y - uy * k * step))
            if 0 <= sx < full.shape[1] and 0 <= sy < full.shape[0] and visible[sy, sx]:
                mx = int(round(x - ux * 2 * k * step)); my = int(round(y - uy * 2 * k * step))
                if 0 <= mx < full.shape[1] and 0 <= my < full.shape[0] and visible[my, mx]:
                    sx, sy = mx, my
                out[y, x, :3] = full[sy, sx, :3]; out[y, x, 3] = 255; hit[y, x] = True
                break
    return out, hit


def lateral(xx, yy, origin, axis):
    ox, oy = origin
    ux, uy = axis
    along = (xx - ox) * ux + (yy - oy) * uy
    across = -(xx - ox) * uy + (yy - oy) * ux
    return along, across


def main(src, out):
    data = Path(src).read_bytes()
    if hashlib.sha256(data).hexdigest() != MAP_SHA:
        sys.exit("原圖 SHA-256 不符，停止。")
    full = np.array(Image.open(src).convert("RGBA")).astype(np.uint8)
    rgb = full[..., :3].astype(int)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    H, W = R.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(float)

    # ---------- 齒輪（與 Test 1 相同的擷取規則） ----------
    win = np.zeros((H, W), bool); win[288:352, 404:468] = True
    yellow = (R > 195) & (G > 140) & (B < 175) & (R - B > 55)
    gear_u = largest(yellow & win)
    pale = (R > 200) & (G > 160) & (R - B > 15) & win
    for _ in range(4):
        gear_u |= pale & nd.binary_dilation(gear_u)
    gear_u = nd.binary_fill_holes(nd.binary_closing(gear_u, iterations=2))
    g_d1 = nd.binary_dilation(gear_u)
    hcx, hcy, hcr = HUB_CIRCLE
    circle = (xx - hcx) ** 2 + (yy - hcy) ** 2 <= hcr ** 2
    flower = nd.binary_opening(gear_u & ~circle, iterations=2)
    gear_core = g_d1 & ~circle & nd.binary_dilation(flower)
    hub = g_d1 & ~gear_core & nd.binary_dilation(circle, iterations=2)
    gear_static_rim = g_d1 & ~(gear_core | hub)

    # ---------- 粉紅手臂 ----------
    awin = np.zeros((H, W), bool); awin[276:394, 308:424] = True
    pink = (R > 170) & (R - G > 60) & (B > 60) & (B < 215) & (R - B > 15)
    arm = nd.binary_fill_holes(nd.binary_closing(largest(pink & awin), iterations=2))
    # 收進手臂外圍的深紅／暗粉描邊（相鄰成長 3 次）
    outline = (R > 85) & (R - G > 30) & (R >= B) & awin
    for _ in range(3):
        arm |= outline & nd.binary_dilation(arm)
    # BP-04 已驗收氣球束的繩尾：保持靜止，不屬於任何活動零件
    string = np.zeros((H, W), bool); string[279:300, 406:416] = True
    string &= (R - B > 60) & (G > 95)
    string = nd.binary_dilation(string) & ((R - B > 40) & (G > 80))
    arm &= ~gear_u & ~string
    tcx, tcy, trx, tr_y = TORUS
    torus_shape = ((xx - tcx) / trx) ** 2 + ((yy - tcy) / tr_y) ** 2 <= 1
    kcx, kcy, kr = KNUCKLE
    knuckle_shape = (xx - kcx) ** 2 + (yy - kcy) ** 2 <= kr ** 2
    torus = arm & torus_shape
    forearm = arm & (xx >= 401) & (yy <= 322) & ~knuckle_shape
    coupler = (arm & knuckle_shape) | forearm
    boom = arm & ~torus & ~coupler
    # 抗鋸齒外緣：外擴 1 px，依上下層順序分配（上層優先）
    # 手臂貼著樹叢的深色接觸陰影（2 px 內、亮度低）跟著手臂走，避免移動後留下殘影線
    lum = 0.299 * R + 0.587 * G + 0.114 * B
    shadow = nd.binary_dilation(arm, iterations=2) & ~arm & (lum < 100) & awin
    arm_d1 = (nd.binary_dilation(arm) | shadow) & ~(gear_core | hub) & ~string  # 外擴 1 px 抗鋸齒邊＋接觸陰影
    rim = arm_d1 & ~arm
    taken = np.zeros((H, W), bool)
    parts = {}
    for name, m in (("torus", torus), ("coupler", coupler), ("boom", boom)):
        own = (m | (rim & nd.binary_dilation(m, iterations=2))) & ~taken
        parts[name] = own
        taken |= own
    torus, coupler, boom = parts["torus"], parts["coupler"], parts["boom"]

    # ---------- ③ 支柱塔＋④ 粉紅大方塊（吊起的整組）與固定前景 ----------
    def poly(pts):
        im = Image.new("L", (W, H), 0); ImageDraw.Draw(im).polygon(pts, fill=1)
        return np.array(im).astype(bool)
    cube_p = poly([(396, 404), (403, 397), (477, 397), (483, 407), (483, 470), (475, 479), (450, 480), (396, 476)])
    pile = poly([(384, 459), (394, 454), (411, 453), (422, 450), (433, 457), (446, 460), (455, 466), (458, 482), (462, 522), (384, 522)])
    cube_colors = (R > 165) & (B > 125) & (G < R - 25)        # 粉紅、薰衣草紫：屬於大方塊，跟著吊起
    pile &= ~(cube_colors & cube_p & ~nd.binary_erosion(pile, iterations=6))  # 方塊堆上緣內的粉紫像素歸大方塊
    column = poly([(384, 398), (400, 398), (400, 470), (384, 470)]) & (R > 190) & (G > 140) & (B < 150)
    bgc = cube_p & ((G > R - 12) | ((R > 195) & (G > 160) & (B > 100) & (B < 190) & (R > B + 30) & (R - G < 60)))
    lab_b, _ = nd.label(bgc)
    border = cube_p & ~nd.binary_erosion(cube_p)
    touch = np.unique(lab_b[border & bgc]); bgc = np.isin(lab_b, touch[touch > 0])
    cube = cube_p & ~pile & ~column & ~bgc
    tower_env = poly([(418, 334), (452, 334), (462, 356), (463, 380), (459, 403), (417, 403), (415, 380), (416, 356)])
    warm = ((R > 170) & (G > 100) & (B < 130) & (R - B > 70)) | ((R > 80) & (R < 215) & (G > 45) & (G < 155) & (B < 115) & (R - G > 25) & (R - B > 45))
    tower = nd.binary_closing(warm & tower_env, iterations=1) & tower_env
    load = largest(cube | tower)
    load = nd.binary_fill_holes(load) & ~gear_u & ~arm & ~pile & ~column
    load_d1 = (nd.binary_dilation(load) & ~gear_u & ~arm & ~pile & ~column & ~nd.binary_dilation(gear_u)) | load
    load = load_d1
    front = pile | column

    # ---------- 隱藏延伸（只在上層零件下方） ----------
    ub = np.array(ELBOW) - np.array(SHOULDER); ub /= np.linalg.norm(ub)
    uf = np.array(FOREARM_AXIS, float); uf /= np.linalg.norm(uf)
    pin = np.array(ELBOW) + 29 * uf
    _, across_b = lateral(xx, yy, SHOULDER, ub)
    boom_band = np.abs(across_b) <= 14
    under_knuckle = nd.binary_erosion(coupler & knuckle_shape, iterations=1) & boom_band
    under_torus = nd.binary_erosion(torus, iterations=2) & boom_band  # 留 2 px 在圓環內，轉動時不外露
    ext_boom_k, hit_bk = extend_along(full, boom, under_knuckle, ub)
    ext_boom_t, hit_bt = extend_along(full, boom, under_torus, -ub)
    along_f, across_f = lateral(xx, yy, ELBOW, uf)
    fore_band = (np.abs(across_f - 3.5) <= 13) & (along_f > 20) & (along_f <= 29 + 10)
    under_gear = (gear_core | hub) & fore_band
    ext_fore, hit_f = extend_along(full, forearm, under_gear, uf)

    # 方塊堆後方：大方塊向下延伸（以可見邊界為軸做垂直鏡射延續；靜止時被方塊堆擋住）
    below_cube = np.zeros((H, W), bool)
    vis_cols = np.where(load.any(axis=0))[0]
    zone_c = pile & poly([(396, 440), (483, 440), (483, 500), (396, 500)]) & ~load  # 延伸到大方塊外框下緣以下，15 px 吊起也不露底
    ext_cube, hit_c = mirror_along(full, cube & load, zone_c, (0.0, 1.0), max_steps=50)
    # 齒輪下方：支架中柱向上延伸（沿垂直方向複製，靜止時被齒輪擋住）
    zone_b = (gear_core | hub) & (xx >= 424) & (xx <= 447) & (yy >= 326)
    ext_bracket, hit_br = extend_along(full, tower & load, zone_b, (0.0, -1.0), max_steps=60)

    # ---------- 修補底圖 ----------
    # 活動零件（外擴 2 px）以外的原圖像素為來源，以 OpenCV Telea 修補向內推進；只填活動零件原本覆蓋的位置。
    import cv2
    moving = boom | coupler | gear_core | hub | load
    hole = nd.binary_dilation(moving, iterations=2) & ~torus & ~gear_static_rim & ~string & ~front
    x0, y0, x1, y1 = 270, 215, 515, 545
    bgr = cv2.cvtColor(full[y0:y1, x0:x1, :3].copy(), cv2.COLOR_RGB2BGR)
    filled = cv2.inpaint(bgr, hole[y0:y1, x0:x1].astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA)
    filled = cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)
    plate = full.copy()
    fill = moving & ~torus & ~gear_static_rim & ~string & ~front
    region = np.zeros((H, W), bool); region[y0:y1, x0:x1] = True
    sub = fill[y0:y1, x0:x1]
    plate[y0:y1, x0:x1, :3][sub] = filled[sub]
    # 大方塊右下方吊起後露出的地面：改用輪廓外側的鏡射取樣，保留石板路與弧形邊線的紋理
    outside_l = ~nd.binary_dilation(moving, iterations=2)
    dist_l, (ly, lx) = nd.distance_transform_edt(~outside_l, return_indices=True)
    ground = fill & (yy >= 440) & (xx >= 446) & (dist_l <= 18)
    gy_, gx_ = np.where(ground)
    by_, bx_ = ly[gy_, gx_], lx[gy_, gx_]
    my_, mx_ = 2 * by_ - gy_, 2 * bx_ - gx_
    okm = (my_ >= 0) & (my_ < H) & (mx_ >= 0) & (mx_ < W)
    okm[okm] &= outside_l[my_[okm], mx_[okm]] & ~front[my_[okm], mx_[okm]]
    plate[gy_[okm], gx_[okm], :3] = full[my_[okm], mx_[okm], :3]

    def layer(mask, *exts):
        L = np.zeros_like(full)
        L[mask] = full[mask]
        L[mask, 3] = 255
        for e in exts:
            put = (e[..., 3] > 0) & (L[..., 3] == 0)
            L[put] = e[put]
        return L

    # 齒輪輪轂下延伸（Test 1 規則）
    dist_g, (gy, gx) = nd.distance_transform_edt(~gear_core, return_indices=True)
    ext_h = hub & circle & (dist_g <= 4)
    gear_l = layer(gear_core)
    gear_l[ext_h, :3] = full[gy[ext_h], gx[ext_h], :3]; gear_l[ext_h, 3] = 255
    layers = {
        "plate": plate,
        "boom": layer(boom, ext_boom_k, ext_boom_t),
        "coupler": layer(coupler, ext_fore),
        "torus": layer(torus),
        "load": layer(load, ext_cube, ext_bracket),
        "front": layer(front),
        "gear": gear_l,
        "hub": layer(hub),
    }
    mask = nd.binary_dilation(moving, iterations=MASK_GROW)
    x, y, w, h = RECT
    mys, mxs = np.where(mask)
    assert mxs.min() >= x and mys.min() >= y and mxs.max() < x + w and mys.max() < y + h, f"遮罩超出工作範圍 {mxs.min()},{mys.min()},{mxs.max()},{mys.max()}"
    m8 = np.zeros((H, W, 4), np.uint8); m8[mask] = 255

    outp = Path(out); (outp / "arm-assets").mkdir(parents=True, exist_ok=True)
    crop = lambda a: a[y:y + h, x:x + w]
    uris, shas = {}, {}
    for k, arr in list(layers.items()) + [("mask", m8)]:
        b = png_bytes(crop(arr))
        (outp / "arm-assets" / f"{k}.png").write_bytes(b)
        uris[k] = "data:image/png;base64," + base64.b64encode(b).decode()
        shas[f"arm-assets/{k}.png"] = hashlib.sha256(b).hexdigest()

    count = lambda m: int(m.sum())
    layout = {
        "mapSha256": MAP_SHA, "rectXYWH": list(RECT),
        "shoulderXY": list(SHOULDER), "elbowXY": list(ELBOW), "pinXY": [round(float(v), 2) for v in pin],
        "gearPivotXY": list(GEAR_PIVOT), "hubPivotXY": list(HUB_PIVOT), "bp04TieXY": list(BP04_TIE),
        "boomLength": round(float(np.hypot(*(np.array(ELBOW) - np.array(SHOULDER)))), 2),
        "forearmLength": 29.0,
        "gearPinRadius": round(float(np.hypot(*(pin - np.array(GEAR_PIVOT)))), 2),
        "pixels": {"boom": count(boom), "coupler": count(coupler), "torus": count(torus), "gear": count(gear_core), "hub": count(hub),
                   "boomUnderKnuckle": count(hit_bk), "boomUnderTorus": count(hit_bt), "forearmUnderGear": count(hit_f),
                   "gearUnderHub": count(ext_h), "plateRepaired": count(fill), "bp04StringProtected": count(string), "load": count(load), "front": count(front),
                   "cubeBehindPile": count(hit_c), "bracketUnderGear": count(hit_br), "mask": count(mask)},
        "assets": shas,
    }
    (outp / "arm-assets" / "layout.json").write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")
    keys = ("rectXYWH", "shoulderXY", "elbowXY", "pinXY", "gearPivotXY", "hubPivotXY", "bp04TieXY")
    (outp / "arm-assets.js").write_text(
        "\"use strict\";\n// 由 build_crane_assets.py 產生：BP-02 手臂與 BP-01 齒輪圖層全部取自原始地圖像素。\n"
        "const LobbyArmAssets = " + json.dumps({"layout": {k: layout[k] for k in keys}, "images": uris}) + ";\n", encoding="utf-8")
    (outp / "map-asset.js").write_text(
        "\"use strict\";\n// 原始地圖 assets/universe_map_bg.png（SHA-256 " + MAP_SHA + "）的 data URI，讓 file:// 離線預覽可讀取像素。\n"
        "const LobbyMapImage = \"data:image/png;base64," + base64.b64encode(data).decode() + "\";\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in layout.items() if k != "assets"}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

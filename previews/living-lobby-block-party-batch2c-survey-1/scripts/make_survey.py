#!/usr/bin/env python3
"""Batch 2-C Survey 1 輔助腳本（只讀原圖，不修改任何美術）。

用法：
    python3 make_survey.py <universe_map_bg.png> <輸出目錄>

產出：
    markers/block-zone-markers.png   方塊派對區域標記圖（原圖裁切 + 標記疊圖）
    markers/block-zone-clean.png     同範圍的原圖裁切（無標記，供對照）
    crops/BP-xx.png                  每個候選物件的原圖局部截圖（3 倍放大，含 8px 邊距）
    survey-metrics.json              每個物件的原圖 SHA、邊緣背景複雜度
"""
import hashlib, json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from items import ITEMS, ZONE_CROP, PROTECTED  # noqa: E402

COLORS = {"A": (255, 40, 100), "B": (255, 165, 0), "C": (40, 140, 255), "D": (160, 60, 255), "L": (30, 200, 120)}
LABELS = {"A": "A 建議優先動態化", "B": "B 可動態化（非必要）", "C": "C 建議維持靜態", "D": "D 技術風險待確認", "L": "已驗收鎖定"}


def font(size):
    for p in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
              "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"]:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def ring_complexity(gray_edges, box, pad=6):
    """box 外圍 pad px 環帶的平均邊緣強度：數值越高，背景越複雜、修補越難。"""
    x, y, w, h = box
    W, H = gray_edges.size
    outer = gray_edges.crop((max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)))
    o = ImageStat.Stat(outer)
    inner_area = w * h
    outer_area = outer.size[0] * outer.size[1]
    inner = gray_edges.crop((x, y, x + w, y + h))
    i = ImageStat.Stat(inner)
    ring_sum = o.sum[0] - i.sum[0]
    return round(ring_sum / max(1, outer_area - inner_area), 2)


def main(src, out):
    out = Path(out)
    (out / "markers").mkdir(parents=True, exist_ok=True)
    (out / "crops").mkdir(parents=True, exist_ok=True)
    data = Path(src).read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    im = Image.open(src).convert("RGBA")
    assert im.size == (1536, 1024), im.size
    rgb = im.convert("RGB")
    edges = rgb.convert("L").filter(ImageFilter.FIND_EDGES)

    zx0, zy0, zx1, zy1 = ZONE_CROP
    S = 2
    clean = rgb.crop(ZONE_CROP).resize(((zx1 - zx0) * S, (zy1 - zy0) * S), Image.LANCZOS)
    clean.save(out / "markers" / "block-zone-clean.png")

    # 標記圖：原圖淡化 25%，再以半透明色塊 + 外框標示，不改動原圖檔
    base = clean.convert("RGBA")
    veil = Image.new("RGBA", base.size, (255, 255, 255, 64))
    base = Image.alpha_composite(base, veil)
    fill = Image.new("RGBA", base.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(fill)
    items = sorted(ITEMS, key=lambda it: -(it["box"][2] * it["box"][3]))
    for it in items + PROTECTED:
        x, y, w, h = it["box"]
        c = COLORS[it["cat"]]
        r = [(x - zx0) * S, (y - zy0) * S, (x - zx0 + w) * S, (y - zy0 + h) * S]
        alpha = 26 if it["cat"] in "CL" else 60
        fd.rectangle(r, fill=c + (alpha,))
    base = Image.alpha_composite(base, fill)
    d = ImageDraw.Draw(base)
    f = font(20)
    for it in items + PROTECTED:
        x, y, w, h = it["box"]
        c = COLORS[it["cat"]]
        r = [(x - zx0) * S, (y - zy0) * S, (x - zx0 + w) * S, (y - zy0 + h) * S]
        dash = it["cat"] in "CL"
        if dash:
            for k in range(int(r[0]), int(r[2]), 14):
                d.line([k, r[1], min(k + 7, r[2]), r[1]], fill=c, width=3)
                d.line([k, r[3], min(k + 7, r[2]), r[3]], fill=c, width=3)
            for k in range(int(r[1]), int(r[3]), 14):
                d.line([r[0], k, r[0], min(k + 7, r[3])], fill=c, width=3)
                d.line([r[2], k, r[2], min(k + 7, r[3])], fill=c, width=3)
        else:
            d.rectangle(r, outline=c, width=4)
        tag = it["id"]
        tx, ty = r[0] + 4, r[1] + 4
        if it.get("labelPos") == "below":
            ty = r[3] + 4
        elif it.get("labelPos") == "above":
            ty = r[1] - 30
        tw = d.textlength(tag, font=f)
        d.rounded_rectangle([tx - 3, ty - 2, tx + tw + 5, ty + 26], radius=6, fill=(255, 255, 255, 235), outline=c, width=2)
        d.text((tx + 1, ty), tag, fill=c, font=f)

    # 圖例
    lw = 380
    legend = Image.new("RGBA", (base.size[0] + lw, base.size[1]), (255, 255, 255, 255))
    legend.paste(base, (0, 0))
    ld = ImageDraw.Draw(legend)
    ft, fs = font(26), font(19)
    lx = base.size[0] + 22
    ld.text((lx, 20), "Batch 2-C Survey 1", fill=(40, 30, 60), font=ft)
    ld.text((lx, 56), "方塊派對區域動態盤點", fill=(40, 30, 60), font=fs)
    ld.text((lx, 84), f"原圖 x {zx0}–{zx1}、y {zy0}–{zy1}（×{S}）", fill=(90, 90, 90), font=fs)
    yy = 128
    for k in "ABCDL":
        ld.rectangle([lx, yy, lx + 28, yy + 22], outline=COLORS[k], width=4, fill=COLORS[k] + (70,))
        ld.text((lx + 38, yy - 1), LABELS[k], fill=(40, 40, 40), font=fs)
        yy += 34
    yy += 10
    ld.text((lx, yy), "實線框＝建議動態化區域", fill=(40, 40, 40), font=fs); yy += 28
    ld.text((lx, yy), "虛線框＝建議保留靜態／鎖定", fill=(40, 40, 40), font=fs); yy += 40
    for it in sorted(ITEMS, key=lambda t: t["id"]):
        ld.text((lx, yy), f"{it['id']} {it['cat']}  {it['name']}", fill=COLORS[it["cat"]], font=fs)
        yy += 27
    for it in PROTECTED:
        ld.text((lx, yy), f"{it['id']}  {it['name']}", fill=COLORS["L"], font=fs)
        yy += 27
    ld.text((lx, legend.size[1] - 60), "示意圖，非正式美術素材", fill=(150, 40, 40), font=fs)
    ld.text((lx, legend.size[1] - 34), f"map sha256 {sha[:16]}…", fill=(120, 120, 120), font=font(15))
    legend.convert("RGB").save(out / "markers" / "block-zone-markers.png")

    # 局部截圖
    metrics = []
    for it in ITEMS:
        x, y, w, h = it["box"]
        p = 8
        b = (max(0, x - p), max(0, y - p), min(1536, x + w + p), min(1024, y + h + p))
        crop = rgb.crop(b)
        sc = 3 if max(crop.size) < 220 else 2 if max(crop.size) < 400 else 1
        crop = crop.resize((crop.size[0] * sc, crop.size[1] * sc), Image.LANCZOS)
        cd = ImageDraw.Draw(crop)
        cd.rectangle([(x - b[0]) * sc, (y - b[1]) * sc, (x - b[0] + w) * sc - 1, (y - b[1] + h) * sc - 1], outline=COLORS[it["cat"]], width=2)
        crop.save(out / "crops" / f"{it['id']}.png")
        region = im.crop((x, y, x + w, y + h)).tobytes()
        metrics.append({
            "id": it["id"], "boxXYWH": list(it["box"]), "cropScale": sc,
            "regionSha256": hashlib.sha256(region).hexdigest(),
            "edgeRingComplexity": ring_complexity(edges, it["box"]),
        })
    (out / "survey-metrics.json").write_text(json.dumps({"mapSha256": sha, "zoneCropXYXY": list(ZONE_CROP), "items": metrics}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("map sha256", sha)
    for m in metrics:
        print(m["id"], m["edgeRingComplexity"])


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

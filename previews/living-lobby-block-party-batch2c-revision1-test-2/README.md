# Living Lobby Art v1.0｜Batch 2-C Revision 1 Test 2｜吊臂搬運

方案 A＋B 合併的加大版，依使用者 2026-11-23 的確認製作：

- ② 黃色齒輪、③ 黃色支柱塔、④ 粉紅大方塊是一整組，由 ① 粉紅機械手臂吊起再放下。
- 吊起時齒輪同時轉動。
- 只做上下，不做左右轉向。左右轉向需要原圖沒有畫的側面，只能重畫，所以不做。
- 吊起高度先做 10–15 px，預設 12 px。

> **非完整動態大廳整合預覽。**大廳畫面只有「原始地圖＋吊臂動畫＋已驗收瀑布」。完整大廳需要 Batch 2-B Test 2 工程包裡的 `assets.js`，目前還沒有取得。

## 觀看方式

**電腦**：完整解壓 ZIP，用 Chrome 開啟 `index.html`，可以離線播放。上方按鈕可以暫停／播放、重新播放、切換吊起高度 10／12／15 px、顯示結構標記，以及切換像素格放大。頁面依序是：

1. **局部放大**：原圖與吊臂搬運並排。
2. **正常大廳比例**：電腦 1388 px。
3. **手機大廳寬度**：392 px，原圖與吊臂搬運並排。
4. 動作參數。

用手機開 `index.html`，看到的就是手機大廳的實際寬度。

**直接看影片**（`videos/`，都是吊起 12 px）：

| 影片 | 內容 |
| --- | --- |
| `compare-zoom.mp4` | 局部 3 倍放大，原圖與吊臂搬運並排 |
| `lobby-desktop.mp4` | 電腦大廳 1388 px |
| `lobby-phone.mp4` | 手機大廳 392 px |

## 完整大廳整合（取得 assets.js 後）

```sh
node build.cjs <解壓後的 Batch 2-B Test 2 目錄> <新的輸出目錄>
cd <新的輸出目錄> && python3 check-integration.py
```

## 重建與複驗（工程師用）

```sh
python3 -I scripts/build_crane_assets.py <repo>/assets/universe_map_bg.png .
python3 check-crane.py
python3 scripts/record.py .
```

需要 Python 3（Pillow、NumPy、SciPy、OpenCV、Playwright）、Chrome 與 ffmpeg。

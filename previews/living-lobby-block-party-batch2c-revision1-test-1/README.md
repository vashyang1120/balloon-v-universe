# Living Lobby Art v1.0｜Batch 2-C Revision 1 Test 1

方塊派對 **BP-02 粉紅機械手臂**動態化，加上 **BP-01 黃色齒輪**連動。共兩種方案，等使用者比較選擇。

> **非完整動態大廳整合預覽。**這裡的大廳比例畫面只有「原始地圖＋手臂動畫＋已驗收瀑布」。完整大廳需要 Batch 2-B Test 2 工程包裡的 `assets.js`，目前還沒有取得。

## 觀看方式

**電腦**：完整解壓 ZIP，用 Chrome 開啟 `index.html`，可以離線播放。頁面上方有「暫停／播放」「重新播放」「顯示結構標記」「像素格放大」四個按鈕。頁面依序是：

1. **局部放大**：原始靜態、方案 A、方案 B 三格並排。
2. **正常大廳比例**（電腦 1388 px）：方案 A、方案 B。
3. **手機大廳寬度**（392 px）：原始、方案 A、方案 B。
4. 兩種方案的參數表。

用手機開 `index.html`，看到的就是手機版大廳寬度的實際效果。

**直接看影片**（`videos/`）：

| 影片 | 內容 |
| --- | --- |
| `compare-zoom.mp4` | 局部 3 倍放大：原始、A、B 並排 |
| `lobby-A.mp4`／`lobby-B.mp4` | 電腦大廳 1388 px |
| `phone-A.mp4`／`phone-B.mp4` | 手機大廳 392 px（影片本身就是 392 px 寬） |

## 兩種方案

| | 方案 A｜手臂擺動 | 方案 B｜齒輪驅動連桿 |
| --- | --- | --- |
| 主動件 | 粉紅主臂繞肩部圓環軸孔擺動 | 黃色齒輪繞中心轉動 |
| 齒輪 | 不動 | 0 → 18° → 0 |
| 主臂 | ±4.5°（上下雙向） | 被帶動 0 → 4.7° → 0 |
| 肘部 | 跟著轉，最大 14.8° | 跟著轉，最大 20.8° |
| 前臂末端 | 沿齒輪後方的隱藏滑槽滑動，最多 7.5 px | 銷釘固定在齒輪上，跟著齒輪走 |
| 節奏 | 正弦，一個來回 3.6 秒 | 餘弦緩入緩出，一個來回 3.2 秒 |

為什麼要這樣設計，請見 `HANDOFF.md` 的「結構分析」。

## 完整大廳整合（取得 assets.js 後）

```sh
node build.cjs <解壓後的 Batch 2-B Test 2 目錄> <新的輸出目錄>
cd <新的輸出目錄> && python3 check-integration.py
```

整合版會多一顆「機械手臂」按鈕，可以在方案 A、方案 B、關閉之間切換。`check-integration.py` 會檢查手臂與 BP-04 氣球束的重疊情況。

## 重建與複驗（工程師用）

```sh
python3 -I scripts/build_arm_assets.py <repo>/assets/universe_map_bg.png .   # 從原圖重新擷取圖層
python3 check-arm.py                                                       # 自動檢查，結果寫入 tests/
python3 scripts/record.py .                                                # 重新錄製 videos/
```

需要 Python 3（Pillow、NumPy、SciPy、OpenCV、Playwright）、Chrome 與 ffmpeg。

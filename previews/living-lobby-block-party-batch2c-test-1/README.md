# Living Lobby Art v1.0｜Batch 2-C Test 1

方塊派對 **BP-01 黃色齒輪狀關節**小角度往復旋轉樣本。只處理 BP-01，不處理氣球束、其他方塊裝飾和 BP-02 手臂，也不加音效。

## 觀看方式

**電腦**：完整解壓 ZIP，用 Chrome 開啟 `index.html`，可離線播放。頁面依序是：

1. **局部放大**：左邊原圖靜止，右邊動畫。按「顯示接點標記」會標出手臂末端（粉紅虛線）與旋轉中心（藍色十字）。
2. **原始尺寸**：1:1 原圖像素。
3. **大廳比例**：原始地圖＋BP-01＋已驗收瀑布，寬 1388 px。
4. **手機大廳寬度**：392 px。

上方的「幅度」可切換 ±3°／±4°／±5°。「前方輪轂」可切換「與齒輪同軸一起轉」或「固定，只轉後方齒輪」，方便比較。預設是 ±4°、同軸一起轉。

**手機**：直接看 `videos/` 裡的三段 MP4。

| 影片 | 內容 |
| --- | --- |
| `bp01-zoom.mp4` | 局部 4 倍放大，原圖與動畫並排，3 個循環 |
| `bp01-lobby.mp4` | 大廳比例 1388 px |
| `bp01-phone.mp4` | 手機大廳寬度 392 px |

## 完整大廳整合

完整大廳需要 Batch 2-B Test 2 工程包裡的 `assets.js`，熱氣球、旗幟、氣球束、角色、賊鷗、音響的素材都在這個檔案裡，GitHub 沒有收錄。取得工程包後執行：

```sh
node build.cjs <解壓後的 Batch 2-B Test 2 目錄> <新的輸出目錄>
cd <新的輸出目錄> && python3 check-integration.py
```

`build.cjs` 會先比對基準檔指紋（`baseline-fingerprints.json`），在新目錄生成副本，只加入 3 處程式接點和一顆「齒輪動態」開關，來源目錄不會被修改。`node build.cjs --dry-run <目錄>` 可以只確認接點是否吻合。

## 重建與複驗（工程師用）

```sh
python3 -I scripts/build_gear_assets.py <repo>/assets/universe_map_bg.png .   # 重新從原圖擷取圖層
python3 check-gear.py                                                        # 自動檢查，結果寫入 tests/
python3 scripts/record.py .                                                  # 重新錄製 videos/
```

需要 Python 3（Pillow、NumPy、SciPy、Playwright）與 Chrome。

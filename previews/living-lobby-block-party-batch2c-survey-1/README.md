# Living Lobby Art v1.0｜Batch 2-C Survey 1

方塊派對區域動態元素盤點。**只有調查與施工建議，沒有動畫、沒有正式美術。**

## 先看這三個檔案

1. `markers/block-zone-markers.png`：標記圖。實線框是建議動態化的物件，虛線框是建議維持靜態或已鎖定的物件，右側附圖例。
2. `BATCH-2C-SURVEY-1.md`：完整盤點報告，共 17 個候選物件，每項都有分類與 10 項調查內容。
3. `BATCH-2C-CONSTRUCTION-PLAN.md`：施工優先順序與建議先做的樣本。

## 目錄

| 路徑 | 內容 |
| --- | --- |
| `crops/BP-xx.png` | 每個候選物件的原圖局部截圖（放大，外框標示範圍） |
| `markers/block-zone-clean.png` | 同一範圍、沒有標記的原圖裁切，供對照 |
| `survey-metrics.json` | 每個物件的座標、原圖區域 SHA-256、背景複雜度數值 |
| `scripts/` | 產生標記圖與截圖的輔助腳本（只讀原圖） |
| `HANDOFF.md`、`manifest.json` | 工程交接 |

## 重新產生標記圖（工程師用）

需要 Python 3 與 Pillow。

```sh
python3 scripts/make_survey.py <repo>/assets/universe_map_bg.png <輸出目錄>
```

物件座標與分類集中在 `scripts/items.py`。腳本會先檢查原圖尺寸是否為 1536×1024，並輸出原圖 SHA-256，應為 `78c4885e61f71b4cb5c63680eed97a04c0023aed81f2e58ae839ff3ff913953f`。

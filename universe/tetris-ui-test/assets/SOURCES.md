# Sandbox 專用衍生素材來源紀錄（tetris-universe-ui-v0.2.1-test-1）

這個資料夾只放方塊派對 UI 測試版（Sandbox）用的衍生素材。原始美術檔案沒有修改、沒有移動。

| 衍生素材 | 原始 Repository | 原始路徑 | 原始尺寸 | 按鈕本體 Alpha bounding box | 輸出尺寸 |
|---|---|---|---|---|---|
| `btn_purple.png` | vashyang1120/balloon-v-rush | `assets/adventure/ui/components/ui_button_purple.png` | 1774×887 | x 44–1730、y 160–694（含外緣抗鋸齒裁切框 43,159–1731,695） | 960×305 |
| `btn_yellow.png` | vashyang1120/balloon-v-rush | `assets/adventure/ui/components/ui_button_yellow.png.png` | 1774×887 | x 58–1714、y 154–684（裁切框 57,153–1716,686） | 960×308 |
| `btn_blue.png` | vashyang1120/balloon-v-rush | `assets/adventure/ui/components/ui_button_blue.png.png` | 1774×887 | x 82–1691、y 187–705（裁切框 81,185–1692,706） | 960×310 |

- 黃色、藍色原始檔名在 Repository 中就是 `.png.png`，依實際檔名記錄。
- 原始 SHA-256 與完整數據見 `button-sources.json`。
- 處理方式（`tools/make_button_assets.py`）：
  1. 讀取 Alpha，只計 alpha ≥ 200 且每列／欄至少 3 個像素的區域作為按鈕本體，排除原圖四周的零星透明雜點
     （整張圖的非透明範圍其實是 x 0–1756、y 39–871，主要是雜點）。
  2. 往外擴到 alpha < 16 為止，保留金框外緣、深棕底邊、陰影與抗鋸齒。
  3. 只裁掉透明留白、等比例縮小成寬 960px；沒有重畫、改色或加字。
- 使用方式：`ui-brand.css` 以水平三段式（CSS border-image）延展：左右各 250px 端蓋（含左上高光與兩端金框圓弧）等比例縮放，只延展中段。

E-01 背景沒有複製：直接以相對路徑引用同一 Repository 的 `assets/universe_map_bg.png`（1536×1024，原檔不變）。

# Batch 2-C Survey 1｜工程交接

## 基準

- 原始地圖：`assets/universe_map_bg.png`，SHA-256 `78c4885e61f71b4cb5c63680eed97a04c0023aed81f2e58ae839ff3ff913953f`，Git blob `9c3e05124b6c85e6a33d828f7d2e57879407a065`，與 Integration Preview Test 1 基準一致。
- 調查所用的工程狀態：分支 `dev/living-lobby-speakers-batch2b` 的 `3dc75c2be2676f3a6360ec339c8ff1f76e0d65e4`（含 Batch 2-A 瀑布、Integration Preview Test 2 與 2-B Test 2 四組音響）。
- `main`（`0a3a2445`）不含任何 Living Lobby 動畫，不能作為施工底稿。

## 缺少的素材

| 素材 | 狀態 | 影響 |
| --- | --- | --- |
| Integration Preview Test 1 ZIP（`libfile_14cc95e5410481918888ef2444759e22`） | GitHub 與使用者「下載」資料夾都沒有 | 無法核對既有 5 束氣球、12 面旗幟、11 顆熱氣球的精確座標 |
| `assets.js`（SHA-256 `1b12b701bbc6ff3fe776663aae46bf9430f64698b8d2c301846761f916414853`） | 只存在於工程包中 | BP-03、04、13、14、16 的「是否已有動畫」標為待核對 |

本次沒有用任何舊版素材替代這些檔案。

## 本次做了什麼

- 以原圖逐區目視盤點方塊派對區域（標記圖範圍 x 0–620、y 200–800），列出 17 個候選物件與 2 個已鎖定瀑布。
- 由原圖計算每個物件外圍 6 px 環帶的邊緣強度，作為背景修補難度的輔助指標。
- 從 2-B 分支 `preview.js` 讀出目前的繪製順序，寫入報告第 5 節。

## 沒有做的事

- 沒有製作任何動畫，沒有分離或修補任何素材。
- 原圖、已驗收動畫、遊戲入口、點擊熱區與正式部署都沒有修改。
- 沒有合併到 `main`，沒有開 PR，也沒有部署。

標記圖是在原圖裁切上加半透明色塊與外框，只作示意，**不得當作正式美術素材**。

## 下一步

1. 使用者與總 PM 根據報告決定哪些物件要動。
2. 提供 Test 1 ZIP，完成氣球束歸屬核對。
3. 另行發布 Batch 2-C Test 1 施工通知。沒有批准前，不進入施工。

建議樣本：BP-01 齒輪狀關節＋BP-04 小氣球束（必要時加入 BP-03），詳見 `BATCH-2C-CONSTRUCTION-PLAN.md`。

# Living Lobby Art v1.0｜Batch 2-A Test 2

《氣球小V遊戲宇宙》方塊區主瀑布的自然流水樣本。依 Test 1 回饋微調水柱亮紋在縮小後的可辨識度。

## 觀看

解壓工程 ZIP 後，在 Chrome 開啟 `open-in-chrome.html`，可離線播放。

- **局部放大**並排比較原始靜態與動態樣本。
- **全圖對照**保留構圖，按「對照 Test 1」比較同一播放時間的兩版水流，也可切換到原圖。
- **暫停／播放**可定格檢查水柱邊界和底部水花。系統若開啟減少動態效果，樣本預設暫停。
- `waterfall-batch2a-test2.webm` 為局部並排錄影，約 9.6 秒，涵蓋兩次 4.8 秒循環。

## 工程檔

`index.html`、`preview.css`、`preview.js` 為 HTTP 預覽的介面與控制。`waterfall.js` 包含原圖裁切座標、局部遮罩及循環演算法。`assets/universe_map_bg.png` 是驗收包內的原始地圖。GitHub 分支的原始碼預覽沿用儲存庫同 blob 的地圖。

在本目錄執行 `node build-offline.cjs . open-in-chrome.html` 可產生離線單檔。已安裝 Playwright 及 Chrome 時，可執行 `node check.cjs open-in-chrome.html` 複驗。Playwright 安裝在其他目錄時可設定 `PLAYWRIGHT_MODULE`。

`HANDOFF.md` 有瀑布盤點、風險、測試及後續整合範圍。`chrome-results.json` 與 `visibility-results.json` 記錄 Test 2 的測試，`baseline-regression.json` 為 Test 1 階段重跑的全場基準檢查。可用 `node check-visibility.cjs open-in-chrome.html` 重測縮放後的亮紋。

# Universe Living Lobby v1.0｜Integration Preview Test 2

全場瀑布動畫驗收版。原圖 9 處瀑布群已加入流水，包含音樂舞台植栽之間的兩段可見水流。

## 觀看

完整解壓 ZIP，使用 Chrome 開啟 `index.html`。預覽可以離線播放。地圖下方的「瀑布動態」可單獨開關流水，方便在大廳實際比例比較。若系統啟用減少動態效果，從「播放控制」啟動動畫。

`living-lobby-waterfalls-full-preview.webm` 為 12 秒全場錄影。

## 複驗

使用 Node.js、Chrome 和 Playwright。在本目錄執行 `node check.cjs` 複驗既有場景與互動，執行 `node check-waterfalls.cjs index.html` 檢查瀑布。Playwright 位於其他目錄時可設定 `PLAYWRIGHT_MODULE`。瀑布腳本也接受第三個參數，即已驗收的 Batch 2-A Test 2 `waterfall.js` 路徑，用於核對方塊區主瀑布。

重建整合版時，從本目錄執行 `node integrate.cjs <解壓後的 Integration Preview Test 1 目錄> <新目錄>`。整合程式會檢查基準檔案的 SHA-256。

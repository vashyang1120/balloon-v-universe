# Living Lobby Art v1.0｜Batch 2-B Test 2

## Chrome 預覽

完整解壓 ZIP，使用 Chrome 開啟 `index.html`。開啟頁首的「放大比較音樂舞台」，可以並看原始靜態圖與局部動畫。全場地圖下方的「音響動態」會切換四組音響，音符和瀑布會繼續播放。若裝置啟用了減少動態效果，可展開「播放控制」啟動播放。

`speaker-stage-preview.webm` 是同一個 Chrome 預覽畫面的近景錄影。手機可觀看影片，支援開啟多檔本機 HTML 的瀏覽器也可使用完整預覽。

## 重建與複驗

準備原始的 **Integration Preview Test 2** 解壓目錄。使用 Node.js 執行 `node build.cjs <瀑布整合預覽目錄> <新的輸出目錄>`。全場資產 `assets.js` 由該工程包提供。接著在新目錄安裝或指定 Playwright（`PLAYWRIGHT_MODULE`），並使用本機 Chrome 執行：

```sh
node check-speakers.cjs
node check.cjs
node check-waterfalls.cjs index.html <Batch 2-A Test 2 已驗收版 waterfall.js>
```

測試產物位於 `tests/`。加上環境變數 `SPEAKER_EXPORT=1` 可匯出素材和測試畫面。執行時從原始地圖擷取透明圖層，因此主預覽可離線播放。

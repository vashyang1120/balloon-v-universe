# 方塊派對 — 遊戲宇宙入口 UI v0.3.3

遊戲宇宙大廳「方塊工坊 → 開始遊玩」原本即導向 `universe/tetris/`。本版把已驗收 `universe/tetris-ui-test/` UI v0.3.2-test-2 升到這個既有入口，不將正式玩家導入 Sandbox。

- 大廳：https://vashyang1120.github.io/balloon-v-universe/
- 遊戲入口：https://vashyang1120.github.io/balloon-v-universe/universe/tetris/
- 正式玩家以大廳交接的 `?bvPlayerId=` 或既有同網域選擇載入；沒有有效玩家時，沿用原有錯誤／返回大廳流程，不建立「UI測試員」。
- 獨立測試頁 `universe/tetris-ui-test/` 保持永久 Sandbox；正式入口只有明確加 `sandbox=1` 才為沙盒。

## 升版範圍

基準：PR #36 合併後 `e867402`，UI v0.3.2-test-2 經使用者手機／電腦實測通過。

沿用完整首頁、手機 HUD／操作配置、桌機播放器修正、原始氣球素材、R2 真實棋盤四步教學、紫金全頁創作故事、三張已遮臉照片、宇宙首頁 BGM 與既有按鈕音效。正式介面顯示 UI v0.3.3，移除固定 UI 測試／Sandbox 徽章；明確進沙盒時仍顯示徽章。

`universe-shell.js`、共用 SDK、大廳路由、後端、玩家資料與存檔、成績／V幣／排行榜開關均未修改。原入口的伺服器確認與受控試營運狀態照常運作；後端未開啟的功能也不會因這次 UI 升版自行開啟。教學不呼叫開局或結算 API，不取得獎勵。

原版遊戲來源為 `vparty-tetris@7f3388562c35ca24572b3fb8cd861f7302f81509`。核心、計分、碰撞、速度、原 DOM／內嵌 CSS／事件處理程式皆保持逐字相同，只在標記區塊載入外部 UI 層。舊獨立 vparty-tetris repo 不受影響。

## 建置

```
# 升版／重新套用已驗收介面
python3 -I universe/tetris/tools/build_release.py
python3 -I universe/tetris/tools/build_release.py --check
# Sandbox 仍可獨立重建；會先排除正式入口新增的 UI 載入標記，避免載入兩次
python3 -I universe/tetris-ui-test/tools/build_ui_test.py --check
# 若更新原遊戲換殼來源，先產生基底，再套用升版
python3 -I universe/tetris/tools/build_prototype.py <vparty-tetris>/index.html universe/tetris/index.html
python3 -I universe/tetris/tools/build_release.py
```

`build_release.py` 將固定清單的已驗收 JS、CSS 與素材複製到正式目錄，正式入口不依賴測試目錄。大部分內容逐位元組一致，僅 `ui-test.js` 增加「只在明確沙盒顯示徽章」、`ui-brand.js` 修改正式 UI 版本與網頁標題。兩個 `BV-TETRIS-UI` 標記區塊使反覆建置冪等。原始照片不在部署資產內。

## 驗證與實機驗收

```
node --test universe/tetris/tests/*.test.mjs universe/tetris-ui-test/tests/*.test.*
node --test universe/shared/tests/sdk-official.test.mjs
```

含既有 52 項 UI／核心／沙盒測試，以及 7 項正式升版檢查：入口與載入順序、無 Sandbox guard／示範玩家、JS／CSS／資產與已驗收版一致、可重現建置、真實 SDK 正式玩家讀取／明確沙盒、正式／沙盒徽章區分。整合測試以模擬 DOM／音訊驗證，並非真實瀏覽器排版測試。

部署後：從大廳選既有玩家進方塊，確認玩家 ID／頭像正確及 UI v0.3.3；首頁 BGM／按鈕音效、四步教學後正式開局、故事滑動與返回、桌機播放器及手機操作正常。正式資料流程由既有後端開關與伺服器判定，本升版不建立額外驗收玩家／成績。

回退可還原此 UI 升版提交；無資料遷移，也不需刪除任何玩家或成績。獨立測試頁保留不動，方便後續驗證。

## v0.3.3 正式個人最佳與故事按鈕修正

使用者發現正式榜個人最佳 78,300，首頁卻顯示本分頁 14,168，低分也顯示新紀錄。現在正式模式從 total 排行榜的 me 取得個人最佳（不受前幾名限制），舊 localBest 不作正式判定；獨立 officialBest 快取只作離線顯示。進入及每局開始讀取，榜單頁亦同步。正式新紀錄只看本局伺服器 accepted 且 total.improved=true；送出中／待審／拒絕／同分不宣稱破紀錄。讀取失敗顯示未知或已確認快取，非零分。過期查詢、跨局及跨玩家回應均隔離。

這次只調整玩家成績呈現與判定，不改得分規則或伺服器歷史資料。故事按鈕套用其他首頁功能相同的藍色金框、46px 高度、Nunito／Noto Sans TC 字體與按壓回饋。殼層、JS／CSS 加版本碼避免舊快取。

新增 10 項回歸：78,300 對連續低分、真破紀錄延遲回應、同分／拒絕／待審／排隊、查詢與初始化失敗、快取、舊查詢不覆寫、跨裝置新最佳、跨玩家與跨局回應、本機沙盒隔離。

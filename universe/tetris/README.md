# 方塊派對 — 遊戲宇宙換殼原型（test-1）

**這是測試版**：玩家身份改用遊戲宇宙，成績只存在目前分頁（Mock），不會寫入正式排行榜；V幣、稱號、頭像收藏尚未開放。
正式方塊遊戲（vparty-tetris）完全沒有被修改，在大廳正式切換入口之前持續照常運作。

## 開啟方式

合併後（GitHub Pages）：
```
https://vashyang1120.github.io/balloon-v-universe/universe/tetris/?bvPlayerId=<playerId>
https://vashyang1120.github.io/balloon-v-universe/universe/tetris/?sandbox=1&bvPlayerId=<沙盒 playerId>
```
- `playerId` 可以在大廳「我的通行證」→「通行證代碼」看到（`p_` 開頭 22 個字元）。
- 沒有參數時，會沿用同一分頁先前的玩家，或大廳目前選擇的玩家（同網域）。
- 大廳的正式遊戲入口**沒有**改指向這個原型。

## 檔案

| 檔案 | 說明 |
|---|---|
| `index.html` | 由正式版 `vparty-tetris@7f33885/index.html` 經 `tools/build_prototype.py` 產生（54 處修改，全部是玩家系統） |
| `universe-shell.js` | 換殼層：身份、未開放功能、Mock 成績與排行榜、測試版標示 |
| `universe-shell.css` | 換殼層樣式（只新增） |
| `../shared/universe-sdk.js` | 三款共用 SDK |
| `tools/build_prototype.py` | 建置腳本：每處修改必須剛好命中一次 |
| `tools/js-functions.mjs` | 函式擷取與雜湊 |
| `tools/original-functions.sha256.json` | 原版 174 個函式、CSS、頁面結構、頂層程式的基準 |
| `tests/tetris-core-integrity.test.mjs` | 遊戲核心與原版逐字相同的驗證 |
| `tests/browser/prototype-e2e.mjs` | 真實瀏覽器測試（需要 Playwright 與兩個正式遊戲的唯讀 clone） |

素材不複製：方塊圖片讀 `vashyang1120.github.io/vparty-tetris/assets/`、BGM 讀節奏遊戲 `songs.json`，
身份頭像讀遊戲宇宙 `assets/avatars/base/`（與大廳同一份）。

## 重新建置與測試

```
python3 -I universe/tetris/tools/build_prototype.py <vparty-tetris>/index.html universe/tetris/index.html
node --test universe/tetris/tests/tetris-core-integrity.test.mjs
node universe/tetris/tests/browser/prototype-e2e.mjs <vparty-tetris clone> <vparty-rhythm-game clone> <截圖資料夾>
```

## 換殼前後對照

| 功能 | 正式版 | 換殼原型 |
|---|---|---|
| 玩法、計分、等級、速度、音效、BGM、手機操作、全螢幕 | — | **完全相同**（函式 SHA-256 相同；同隨機種子結果相同） |
| 玩家身份 | ID＋頭像 → playerKey（本機） | 遊戲宇宙 playerId（`GET /v1/players/:id`，唯讀） |
| 角色設定 | 可改 ID／身份頭像 | 唯讀；切換玩家回大廳 |
| 身份頭像 | 17 款（節奏遊戲素材） | 33 款（遊戲宇宙 `assets/avatars/base/`） |
| V幣 | 前端直接改餘額 | 未開放（本場不發放） |
| 稱號、頭像收藏 | 前端寫入 | 準備中 |
| 成績、排行榜 | 寫舊 Firebase | Mock（本分頁、明確標示） |
| 最高紀錄 | 全裝置共用 | 依 playerId 分開 |
| 管理後台 | 標題點 5 下、前端密碼與 PIN | 停用；PIN 已清空 |
| 舊 Firebase | 讀寫 | 完全不載入 |

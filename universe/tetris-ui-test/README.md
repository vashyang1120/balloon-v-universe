# 方塊派對 — 手機 UI 測試版（tetris-universe-ui-v0.1.0-test-1）

**這是永久 Sandbox 的 UI 測試版**：不讀、不寫任何正式資料（成績、排行榜、V幣、稱號、頭像、玩家資料）。
正式宇宙版 `universe/tetris/`、大廳入口 `zones.js`、共用 SDK、後端 Worker 都**沒有修改**；大廳也**沒有**連到這個測試版。

## 開啟方式

```
https://vashyang1120.github.io/balloon-v-universe/universe/tetris-ui-test/
```
不需要任何參數。網址加不加 `sandbox=1`、帶不帶玩家代碼，都一樣是 Sandbox，玩家固定是「UI測試員」
（只有從同一分頁的沙盒大廳 `index.html?sandbox=1` 建立的模擬玩家可以沿用）。

## 這一版改了什麼（只有手機版畫面）

| 項目 | 正式宇宙版 | UI 測試版 |
|---|---|---|
| 棋盤格子（390×844） | 19px，棋盤 194×384 | 36px，棋盤 364×724（依畫面動態計算，整數正方形） |
| 觸控按鍵 | 下方獨立一列（佔 170px 高） | 半透明圓形浮動按鍵，覆蓋在棋盤底部；左下 ← →、右下 旋轉／加速／落下 |
| 長按 | 沒有（只能一下一下點） | 左右、加速下降可長按連續動作；放開立即停止 |
| 資訊欄 | 棋盤左右兩欄 | 頂部兩列：身份／暫停／音樂／全螢幕／離開；分數／連消／消除行／關卡／NEXT |
| 手機橫式 | 棋盤被裁切 | 棋盤完整顯示，資訊在兩側、按鍵在兩側下角 |
| 桌機（寬度 > 900） | — | 與正式版相同（只多一個 Sandbox 標示） |

遊戲核心（方塊、旋轉、碰撞、計分、連消、速度、關卡、落下鎖定、結束判定）一個字都沒改；
按鍵呼叫的是原版同一組函式，條件與原版鍵盤相同。

## 檔案

| 檔案 | 說明 |
|---|---|
| `index.html` | **產生的檔案，請勿手改**：由 `universe/tetris/index.html` 經 `tools/build_ui_test.py` 產生（只在 `<head>`／`</body>` 插入載入標籤、改標題） |
| `universe-shell.js` | **產生的檔案**：由 `universe/tetris/universe-shell.js` 產生，只把 Session 改成永久 Sandbox |
| `universe-shell.css` | 由正式版原樣複製 |
| `sandbox-guard.js` | Sandbox 強制隔離（在 SDK 之前載入） |
| `ui-test.css` | 手機版 UI 樣式（全部在 `html.uit-m` 底下，桌機不受影響） |
| `ui-test.js` | 手機版 UI 程式：棋盤尺寸、觸控按鍵、HUD 標記 |
| `tools/build_ui_test.py` | 測試版建置腳本（不修改正式建置流程） |
| `tests/ui-test-integrity.test.mjs` | 核心完整性＋Sandbox 隔離單元測試 |
| `tests/browser/ui-test-e2e.mjs` | 瀏覽器測試（Playwright 模擬手機；不是實機） |

正式版 `universe/tetris/tools/build_prototype.py` 重新產生正式版之後，執行
`python3 -I universe/tetris-ui-test/tools/build_ui_test.py` 就會跟上，UI 修改不會遺失（UI 全在獨立檔案）。

## Sandbox 隔離（四層）

1. `universe-shell.js` 寫死 `mode:"sandbox"`、services 全部 mock；`sandbox-guard.js` 沒載入就停止啟動（不會退回正式模式）
2. SDK 的 API Client 改用永遠拒絕的 `blockedFetch`（連一個請求都送不出去）
3. SDK 的 API 網址改成不存在的 `https://sandbox.invalid`
4. 全頁網路防護：遊戲宇宙 API（workers.dev）、Firebase、Google 網域一律封鎖；其他只允許本站與 github.io 的讀取（GET）

## 測試

```
python3 -I universe/tetris-ui-test/tools/build_ui_test.py --check
node --test universe/tetris-ui-test/tests/ui-test-integrity.test.mjs universe/tetris/tests/tetris-core-integrity.test.mjs
NODE_PATH=$(npm root -g) node universe/tetris-ui-test/tests/browser/ui-test-e2e.mjs <vparty-tetris clone> <vparty-rhythm-game clone> [截圖資料夾]
```
瀏覽器測試刻意把後端「正式成績／V幣」設為開啟，並建立一位真的玩家，證明測試版在這種情況下仍然不送出任何請求。

## 可調參數（`ui-test.js` 開頭的 `CFG`）

按鍵不透明度 35%、按鍵直徑上限 64px／單列下限 52px、左右長按 170ms 後每 55ms 移動一格、加速下降長按 120ms 後每 45ms 下降一格。

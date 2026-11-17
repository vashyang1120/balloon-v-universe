# 方塊派對 — 手機 UI 測試版（tetris-universe-ui-v0.2.3-test-1）

**這是永久 Sandbox 的 UI 測試版**：不讀、不寫任何正式資料（成績、排行榜、V幣、稱號、頭像、玩家資料）。
正式宇宙版 `universe/tetris/`、大廳入口 `zones.js`、共用 SDK、後端 Worker 都**沒有修改**；大廳也**沒有**連到這個測試版。

## 開啟方式

```
https://vashyang1120.github.io/balloon-v-universe/universe/tetris-ui-test/
```
不需要任何參數。網址加不加 `sandbox=1`、帶不帶玩家代碼，都一樣是 Sandbox，玩家固定是「UI測試員」
（只有從同一分頁的沙盒大廳 `index.html?sandbox=1` 建立的模擬玩家可以沿用）。

## 版本紀錄

- **v0.2.3-test-1（待手機驗收）**：以已驗收 v0.2.2-test-1 為基準，新增首頁標語與「方塊派對的誕生」故事視窗。第一人稱故事使用原始 `balloon_base.png`，支援關閉按鈕、Escape、背景點擊與焦點返回。已加入本次提供的三張真實氣球作品照片（橫向滑動），以生成的獨立動畫頭像貼紙覆蓋臉部後才輸出網站圖；原始未遮臉照片不放入程式庫。照片合成前後已比對貼紙矩形之外像素完全一致，網站 WebP 僅作壓縮。尚待手機故事視窗驗收。保留既有玩法、操作與畫面；互動教學留待 v0.3.0。


- **v0.2.2-test-1**：以 v0.2.1-test-1 為基準，新增 `balloon-assets.js` 與原始 `assets/balloon_base.png` 本地副本。開始前等待 PNG 成功載入；載入失敗或逾時顯示重試，不產生普通方格快取。原玩法、已驗收介面與 Sandbox 隔離維持。首頁故事規劃 v0.2.3，品牌開場與互動教學規劃 v0.3.0。


- **v0.2.1-test-1**（Universe Art Enhancement，方案 B 遊戲宇宙延伸風格）：
  - 首頁、結算（一般／新紀錄）、排行榜背景改用遊戲宇宙既有 E-01 地圖（`../../assets/universe_map_bg.png`，原檔不複製、不修改）；遊戲中棋盤與 HUD 不使用。
  - 按鈕改用 balloon-v-rush 原始金框 PNG（U-12 紫／U-13 黃／U-14 藍），只裁透明留白、縮小，存成 `assets/btn_*.png`；
    以水平三段式延展，文字用 HTML 文字。來源與處理見 `assets/SOURCES.md`、`tools/make_button_assets.py`。
  - 首頁：開始遊戲＝紫；難度未選＝藍、已選＝黃＋✓；排行榜／角色設定／操作說明／音樂＝藍（2×2），回遊戲宇宙獨立一列。
  - 結算：成績固定 2×2（分數｜關卡／消除行數｜最高連消），再玩一次＝紫、排行榜＝藍整列、回方塊首頁＋角色設定＝藍並排。
  - 版本顯示分開：「Game v（遊戲核心）｜UI v0.2.1-test-1」。玩家可見文字「玩家設定」改為「角色設定」（ID、功能、資料欄位不變）。
  - Sandbox 標示改放在首頁／結算卡片內，不覆蓋按鈕。
- **v0.2.0-test-1**（第二階段品牌視覺，企劃規格 v0.2.0-spec-1）：
  - 首頁改為上下式：玩家資訊（原版玩家卡）→ 標題「氣球小V方塊派對」→ 小V V-03（`assets/rpg/v_full_open_arms.png`）→ 難度＋開始遊戲 → 次要功能（原有按鈕）。
    難度沿用原版三個選項，預設「普通」（原版 `startGame` 預設值）；開始遊戲直接以選好的難度開局。
  - 結算：同一模板。一般「挑戰完成！」＋V-06（`v_bust_happy.png`）；新紀錄「新紀錄！」＋V-18（`v_bust_congrats.png`）＋粉黃強調。
    新紀錄只沿用原版判斷（`gameOver()` 中 score > 本機個人最佳，即原本的「🏆 新紀錄！」）。
  - 再玩一次：直接以上一局難度開新局。「回首頁」改名「回方塊首頁」（目的地不變）。
  - 遊戲中 HUD 只換顏色（深紫／HUD 紫、邊框色、陰影）；與 v0.1.0-test-2 逐像素比對幾何完全相同。
  - 新檔案：`ui-brand.css`、`ui-brand.js`；`ui-test.css`、`ui-test.js`、`sandbox-guard.js` 未修改。
  - 瀏覽器測試：`tests/browser/ui-brand-e2e.mjs`（第四個參數可給 c170921 worktree 做 HUD 幾何比對）。
- **test-2**：右側三顆按鍵改為由左至右「加速下降 → 直接落下 → 旋轉」（只用 CSS `order` 調整視覺順序，按鍵、事件、功能、尺寸、透明度、連發速度都不變）。
  極窄螢幕兩層配置：下層「加速下降、直接落下」，旋轉在上層、位於直接落下正上方。左側方向鍵、棋盤、HUD 與 test-1 相同。
- **test-1**：第一版手機 UI（已部署，使用者實測：棋盤大小、透明按鍵、HUD 通過）。

## test-1 改了什麼（只有手機版畫面）

| 項目 | 正式宇宙版 | UI 測試版 |
|---|---|---|
| 棋盤格子（390×844） | 19px，棋盤 194×384 | 36px，棋盤 364×724（依畫面動態計算，整數正方形） |
| 觸控按鍵 | 下方獨立一列（佔 170px 高） | 半透明圓形浮動按鍵，覆蓋在棋盤底部；左下 ← →、右下 加速／落下／旋轉（test-2 順序） |
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
| `ui-brand.css` | 品牌視覺樣式（E-01 背景、金框 PNG 按鈕、結算、HUD 配色；HUD 不使用圖片） |
| `ui-brand.js` | 第二階段：上下式首頁、首頁難度與開始、結算角色切換、同難度再玩一次 |
| `assets/btn_purple.png`、`btn_yellow.png`、`btn_blue.png` | 衍生按鈕素材（v0.2.1；來源見 `assets/SOURCES.md`、`assets/button-sources.json`） |
| `tools/make_button_assets.py` | 由 balloon-v-rush 原始按鈕產生上面三張衍生素材 |
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

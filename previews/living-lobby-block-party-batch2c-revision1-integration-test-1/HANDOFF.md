# Batch 2-C Revision 1 Integration Test 1｜吊臂搬運｜完整動態大廳整合｜工程交接

## 基準核對（2026-11-23）

| 項目 | 實際狀態 |
| --- | --- |
| 正式大廳 `main` | `c6ec0d396e5449872575d3a7b90b85c0ce2b05ae`（PR #49，2026-11-22 18:57）。Living Lobby 已於 PR #47 正式上線，之後由 #48、#49 修正 |
| 正式動畫架構 | `assets/living-lobby/`：`assets.js`（素材清單，指向 `art/` 下依 SHA-256 命名的 57 張圖）、`engine.js`、`waterfall.js`、`waterfall-layouts.js`、`speakers.js`。**`assets.js` 已在 main 上**；舊工程包裡內嵌 data URI 的版本，已改成這種依檔名引用的架構 |
| 吊臂動畫來源 | `dev/living-lobby-block-party-batch2c-revision1-test2` `b40f9b2593f09770e93dad71953f3f5fbb517524`（Test 2，動作已驗收） |
| 正式 `background`（`art/e8ec82a0…`）與原圖 | 在吊臂範圍內 RGB 逐像素相同（Alpha 為 255）。Test 2 的圖層可以直接沿用，不會產生重影 |
| 已驗收氣球束 | 正式版的 5 組是 B07-12、B07-03（BP-13）、B07-01（BP-03）、B07-10（BP-14）、B07-11。正式 README 註明 **BP-04 與 BP-16 目前保留靜態原圖**，不屬於氣球束動畫。最靠近吊臂的 B07-10（x 501–575）位在吊臂右側，與會動的部分沒有重疊 |

本分支 `dev/living-lobby-block-party-batch2c-revision1-integration-test1` 從 `main` `c6ec0d3` 開出，**沒有合併回 main**，正式入口不受影響。

## 修改內容

| 檔案 | 修改 |
| --- | --- |
| `assets/living-lobby/engine.js` | 新增 2 行：載入吊臂狀態；在 `paintScene` 中，音響之後、熱氣球之前繪製吊臂 |
| `index.html` | 在 `engine.js` 前加入 `crane-assets.js`、`crane.js`；`engine.js` 快取版本號改為 `batch2c-r1-int1` |
| `assets/living-lobby/crane.js`（新增） | 動作與 Test 2 完全相同（4.5 秒循環，吊起 12 px，齒輪每 px 轉 1.25°） |
| `assets/living-lobby/crane-assets.js`（新增） | 圖層路徑與支點座標 |
| `assets/living-lobby/crane/*.png`（新增 9 張）、`crane/layout.json` | 與 Test 2 的 `arm-assets/` 相同。唯一差別是 `plate.png` 的 Alpha 改為 255（RGB 不變），以配合正式 `background` |

熱氣球、旗幟、音符、音響、瀑布、氣球束、角色、賊鷗、遊戲入口、熱區（`zones.js`）、`main.js`、`style.css` 都沒有修改。

**正式版的合成方式**：吊臂先在自己的 256×336 小畫布上合成，用二值遮罩裁切後，直接貼到大廳畫布上，**不從大廳畫布讀回像素**，避免實機 GPU 同步讀取造成卡頓。這時大廳畫布的 Alpha 是 255，之後才由 engine 套用地圖 Alpha，所以結果與 Test 2 一致。

**預覽用網址參數**：`?craneLift=10`、`12`（預設）、`15` 切換已驗收的三種吊起高度；`?craneLift=0` 關閉吊臂（只用於比對）。沒有新增更大的幅度。

## 測試紀錄（`tests/integration-results.json`，Chrome 153）

測試方法：只在瀏覽器端替 `engine.js` 加一行測試掛鉤，repo 檔案不變。兩頁（有吊臂、無吊臂）以相同秒數呼叫正式 `render()`，逐像素比對整張動態大廳畫面，共 9 個時間點，涵蓋放著、吊起、高處、放下，以及第 2、3 個循環。

| 檢查 | 桌面 10 px | 桌面 12 px | 桌面 15 px | Pixel 7 12 px |
| --- | --- | --- | --- | --- |
| 吊臂遮罩外像素變化（含所有已驗收動畫） | 0 | 0 | 0 | 0 |
| Alpha 變化 | 0 | 0 | 0 | 0 |
| 放著不動時（0、0.6、4.5 秒）與正式大廳逐像素相同 | 通過 | 通過 | 通過 | 通過 |
| 遊戲入口、熱區、SVG 圖層結構與正式版相同 | 相同 | 相同 | 相同 | 相同 |
| 頁面錯誤 | 無 | 無 | 無 | 無 |

**效能**（無 GPU 的 headless Chrome，全部用 CPU 繪圖）：正式大廳每幀約 19–20 ms，加上吊臂後約 25 ms，多 5–7 ms。有 GPU 的實機會快得多，但這部分**尚未在實機上量測**。

本機測試無法連到後端 API 與 Google 登入（環境限制），因此玩家資料相關功能沒有測到。地圖動畫不依賴後端。

## 影片（`videos/`，吊起 12 px，新手引導對話框只在錄影時隱藏）

- `full-lobby-desktop.mp4`：桌面 1440×1000 完整大廳
- `full-lobby-phone.mp4`：手機 412 寬（地圖區）

## 獨立預覽部署（2026-11-24）

**部署方式**：使用專案原有的 Cloudflare Pages 測試專案 `balloon-v-universe-staging`。這個專案已連接本 repo，非 main 分支推送時會自動建置分支預覽（使用 `staging/build.mjs`）。部署過程中**沒有修改**任何發布設定、權限或憑證，也沒有動到 main 或正式 GitHub Pages。

- 分支固定網址（永遠指向本分支最新 commit）：https://dev-living-lobby-block-party-53if.balloon-v-universe-staging.pages.dev/
- `4b458c6` 的部署：https://ec8ec033.balloon-v-universe-staging.pages.dev/（GitHub check「Cloudflare Pages」：Deploy successful）

在線上預覽站實際確認到的測試站保護：
- 頁面帶有 `noindex,nofollow`，`robots.txt` 禁止收錄。
- Content-Security-Policy 的 `connect-src` 只允許本站與**測試後端** `https://balloon-v-universe-api-staging.vashyang1120.workers.dev`，瀏覽器無法連到正式後端與正式玩家資料。

## 部署後驗證

| 項目 | 結果 | 測試環境 |
| --- | --- | --- |
| 線上預覽站載入完整動態大廳 | 通過（素材約 1.6 秒載入完成，`living-lobby-ready`） | **線上預覽站**，使用者電腦上的 Claude 內建瀏覽器，1440×1000 |
| 預設吊起高度 | 實測 12 px，曲線為停住 → 上升 → 停在高處 → 放下 | 線上預覽站 |
| `?craneLift=10`／`?craneLift=15` | 實測 10 px／15 px | 線上預覽站 |
| `?craneLift=0` | 吊臂區域像素變化最大 1/255（無動作） | 線上預覽站 |
| 其他動畫不受影響、無新增圖層錯誤 | 吊臂遮罩外 0 像素變化 | 本機 Chrome 153，同一 commit 逐像素比對 |
| 小V、蓬蓬、Eric 前景點擊放大 | 通過，整合版與正式版 `c6ec0d3` 行為相同（桌面點擊、手機觸控都會開啟放大圖） | 本機 Chrome 153，同一 commit |
| 熱區、遊戲入口 | DOM 結構與正式版相同（academy／stage／blocks／island） | 本機 Chrome 153 |
| 手機版面比例 | 正常（Pixel 7 模擬 412×915） | 本機 Chrome 153 |

線上預覽站的桌面測試做到一半時，使用者電腦和這個對話的連線中斷了，所以線上預覽站的畫面截圖、手機版與前景點擊，改在本機以**同一個 commit** 測試。

## 尚未驗證

- **實機效能**：未在有 GPU 的電腦或實體手機上量測。headless Chrome（無 GPU）每幀多 5–7 ms。線上預覽站測試時，瀏覽器面板在背景執行，幀率數字不能代表實際效能。
- **實體手機瀏覽**：只做過模擬（Pixel 7 412×915），沒有用真的手機開啟線上預覽站。
- **玩家資料 API**：線上預覽站連的是測試後端。測試後端是否正常運作、登入與玩家資料流程都沒有驗證，也沒有用正式玩家資料測試。
- **實際點擊熱區進入遊戲**：只確認了熱區結構相同，沒有點進各遊戲。
- **線上預覽站的前景點擊放大**：只在本機以同一 commit 驗證過。

## 追加修正（2026-11-24）｜預覽站無法建立／找回玩家

### 根因（已在線上預覽站實測確認）

- 預覽站經 `staging/build.mjs` 建置後，只允許連到**測試後端** `https://balloon-v-universe-api-staging.vashyang1120.workers.dev`。
- 測試後端的 `ALLOWED_ORIGINS`（`backend/worker/wrangler.jsonc` 的 `env.staging`）只有 `https://balloon-v-universe-staging.pages.dev` 一個來源。
- 分支預覽網址 `https://dev-living-lobby-block-party-53if.balloon-v-universe-staging.pages.dev` 不在允許名單內，瀏覽器因跨來源限制擋下所有請求（實測 `fetch(...)/health` 回報 Failed to fetch）。從允許的 `balloon-v-universe-staging.pages.dev` 送出同樣的請求，則正常回應 `200 status:ok`（v0.5.0）。
- 結論：測試後端本身運作正常，問題出在「分支預覽網址不被測試後端允許」。這與吊臂整合無關，所有 Cloudflare 分支預覽都會遇到。

### 正式修復需要的操作（**未執行，需要授權**）

以下任一做法都會動到 Cloudflare 設定，需要使用者或總 PM 同意並由有權限的人執行：

1. 在測試後端的 `ALLOWED_ORIGINS` 加入分支預覽網址，然後重新部署 `balloon-v-universe-api-staging`。需要 Cloudflare 帳號權限。目前的格式只接受完整網址，不支援萬用字元。
2. 或者把這個整合版部署到 `balloon-v-universe-staging.pages.dev` 的主網址。但這會取代該網址目前的內容，可能影響其他人的驗收。

### 本批採用：既有的測試沙盒當作訪客試玩入口（不改程式）

`?sandbox=1` 是專案原本就有的測試沙盒：玩家資料只存在當下的瀏覽器分頁（sessionStorage 的模擬 API），**不連任何後端，也不寫入任何資料庫**，畫面上方會顯示「測試沙盒：資料只存在這個分頁，不會寫入正式資料庫」。遊戲宇宙 SDK 也支援這個模式，進入遊戲時會帶著沙盒身份。

試玩網址：
- 預設 12 px：https://dev-living-lobby-block-party-53if.balloon-v-universe-staging.pages.dev/?sandbox=1
- 10 px：`?sandbox=1&craneLift=10`；15 px：`?sandbox=1&craneLift=15`；關閉吊臂：`?sandbox=1&craneLift=0`

### 線上預覽站實際操作紀錄

使用者電腦上的 Claude 內建瀏覽器，清除沙盒資料後從全新狀態開始：

| 項目 | 結果 |
| --- | --- |
| 1. 新玩家建立（沙盒） | 通過：玩家 ID「預覽測試」＋「貓咪1」→ 取得通行證；過程中沒有對後端送出任何請求 |
| 2. 玩家找回（沙盒） | 通過：清除本機記住的玩家後，走「我玩過了」→「找回通行證」，顯示「找到了！歡迎回來，預覽測試！」。限同一個瀏覽器分頁 |
| 3. 訪客入口 | 使用既有 `?sandbox=1` |
| 4. 進入完整動態大廳 | 通過（電腦 1440×1000、手機 375×812） |
| 5. 吊臂動畫 | 通過：電腦實測吊起 12 px。手機版有在動，但瀏覽器面板在背景時會降頻，無法量到準確高度 |
| 6. 前景角色點擊放大 | 通過：電腦點擊、手機觸控都會開啟放大圖並可關閉 |
| 7. 四款遊戲入口 | 方塊工坊、知識學院、音樂舞台：帶著沙盒玩家身份進入遊戲（標示 Sandbox）。派對島：會開到 `balloon-v-universe-staging.pages.dev`（不同網址，見下方），沙盒身份帶不過去，遊戲內「以訪客遊玩」可正常開始冒險 |
| 8. 返回大廳 | 通過：從方塊派對按「回遊戲宇宙」回到大廳，玩家狀態保留 |

### 仍未修復、未通過的項目

- **測試後端的玩家建立與找回**：根因已查明，修復需要 Cloudflare 權限（見上方），**未修復**。
- **派對島身份串接**：預覽站建置時，派對島連結被改寫成 `balloon-v-universe-staging.pages.dev`，與分支預覽網址不同，所以沙盒身份帶不過去，只能用訪客模式遊玩；從派對島「回到遊戲宇宙大廳」也會回到那個網址，而不是這個分支預覽。
- 沙盒玩家只存在當下的瀏覽器分頁，關閉分頁就會消失，無法跨裝置找回。
- 實機效能、真實手機瀏覽、正式後端相關功能，仍然都未驗證。

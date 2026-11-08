# 氣球小V遊戲宇宙 後端 API（Cloudflare Worker）

版本：**universe-backend-v0.3.0-player-foundation-test-1**（API 0.3.0）
Worker 名稱：`balloon-v-universe-api`
公開網址：https://balloon-v-universe-api.vashyang1120.workers.dev

這是遊戲宇宙所有遊戲共用的後端「基礎工程」。目前提供健康檢查、統一格式、錯誤處理、CORS、
Firebase 伺服器端連線模組、管理員驗證與 Firebase 只讀連線診斷；玩家、V幣、成績、排行榜等功能只預留路由，一律回 `501`。

v0.2.0 新增：診斷 API 回報「卡在哪一步＋安全原因代碼＋中文排除建議」，以及配套的管理員測試頁
（Repository 根目錄的 `admin-test/`，見該資料夾 README）。

v0.3.0 新增：共用玩家身份系統——`POST /v1/players`（建立）、`POST /v1/players/resolve`（找回）、
`GET /v1/players/:playerId`（公開資料）、`GET /v1/avatars/base`（固定身份圖案清單）。
完整規格、資料結構、並發設計與大廳相容性見 [docs/PLAYERS.md](docs/PLAYERS.md)。

> 這個資料夾和大廳網站完全獨立：大廳是 GitHub Pages 靜態網頁，這裡是 Cloudflare Worker。
> 大廳的任何檔案都沒有引用這裡的程式。

---

## 1. 指令

| 用途 | 在哪裡執行 | 指令 |
|---|---|---|
| **專案根目錄** | — | `backend/worker/` |
| 安裝 | `backend/worker/` | `npm ci` |
| 語法檢查＋私密資料掃描＋測試 | `backend/worker/` | `npm run verify` |
| 只跑測試 | `backend/worker/` | `npm test` |
| 本機執行（Workers 執行環境） | `backend/worker/` | `npm run dev` → http://localhost:8787/health |
| 建置 | — | **不需要**（純 JavaScript，Wrangler 部署時自動打包） |
| 部署前演練（不上傳） | `backend/worker/` | `npm run deploy:dry` |
| 部署 | `backend/worker/` | `npx wrangler deploy`（需要先 `npx wrangler login`） |

需要 Node.js 20 以上。Wrangler 版本固定為 4.152.0（package.json）。

---

## 2. 目錄與模組

```
backend/worker/
  src/
    index.js                 Worker 進入點（只建立 app）
    app.js                   請求主流程：requestId → CORS → 路由 → 權限 → handler → 統一錯誤
    router.js                路由比對（404 / 405 + Allow）
    config.js                讀取 vars 與 Secrets（只回報「有沒有設定」，不回傳內容）
    games.js                 遊戲代碼登記表（新增遊戲只要加一筆）
    routes/
      players.js             玩家 API 與身份圖案清單
      health.js              GET /health（只代表 Worker 本身）
      meta.js                GET /v1/meta（API 版本、遊戲登記表、功能分類狀態）
      admin.js               GET /v1/admin/whoami、GET /v1/admin/diagnostics/firebase
      reserved.js            9 個預留分類（players、wallet、game-results、leaderboards、
                             avatars、titles、shop、admin、exports），回 501
      game-results.js        遊戲結果「信封格式」驗證（含唯一 submissionId）
    middleware/
      rate-limit.js          限流（Cloudflare binding 或記憶體備援）
      cors.js                只信任名單內的網站，絕不回 *
      admin-auth.js          Firebase ID Token 驗證＋Google 登入＋伺服器端 UID 名單
      client-info.js         解析 X-BV-Client（遊戲版本識別）
      body.js                JSON 內容大小、格式檢查
    players/
      id-rules.js            玩家 ID 正規化與驗證（NFKC、字數、禁用字元）
      base-avatars.js        固定身份圖案目錄（17 款，可擴充）
      identity-key.js        identityKey（SHA-256 雜湊索引鍵）
      player-service.js      建立／找回／讀取、ETag 原子判定、profile 自動修復
    services/
      google-oauth.js        服務帳戶 → Google Access Token（RS256 簽章、快取、超時）
      firebase-rest.js       Realtime Database REST Client（超時、重試、ETag 條件寫入）
      firebase-id-token.js   Firebase ID Token 驗證、Google 公開金鑰快取
    utils/
      errors.js              統一錯誤代碼表
      response.js            統一回應格式
      logger.js              已遮罩的結構化記錄
      validate.js            輕量資料驗證
      ids.js                 playerId 產生、台灣日期
      base64url.js           編碼工具
  tests/                     自動化測試（node:test，無外部測試套件）
  scripts/
    check-syntax.mjs         node --check 全部檔案
    scan-secrets.mjs         掃描整個 Repository 有沒有私鑰或 Token
  docs/ARCHITECTURE.md       API 規格、資料一致性、安全與免費方案設計
  wrangler.jsonc             Worker 設定（只放公開設定）
  .dev.vars.example          本機私密設定範例（不含真實值）
```

---

## 3. 設定：vars（公開）與 Secrets（私密）

### 公開設定（寫在 `wrangler.jsonc`，會進 GitHub）
| 名稱 | 目前值 | 說明 |
|---|---|---|
| `SERVICE_ENV` | `production` | 只有 `development` 才允許 `http://` 來源 |
| `ALLOWED_ORIGINS` | `https://vashyang1120.github.io` | 允許呼叫 API 的網站；`*` 會被忽略 |
| `FIREBASE_PROJECT_ID` | `balloon-v-universe` | ⚠ 由資料庫網址推得，**部署前請在 Firebase 確認** |
| `FIREBASE_DATABASE_URL` | `https://balloon-v-universe-default-rtdb.asia-southeast1.firebasedatabase.app` | 只接受 Firebase 網域 |
| `FIREBASE_TIMEOUT_MS` | `8000` | 1000～20000 |

### 私密設定（只放 Cloudflare Secrets，不進 GitHub）
| 名稱 | 內容 | 沒設定時 |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 服務帳戶 JSON 檔「整份內容」 | 所有需要資料庫的功能回 `503 SERVICE_NOT_CONFIGURED` |
| `ADMIN_UIDS` | 管理員的 Firebase UID，多個用逗號分隔 | 所有管理 API 回 `503`（全部拒絕） |

注意：
- 用 `wrangler deploy` 或 GitHub 自動部署時，**`wrangler.jsonc` 的 vars 會覆蓋後台手動改的 vars**；Secrets 不會被覆蓋。
- Firebase Web API Key（前端 firebaseConfig 的 apiKey）**不是**管理憑證，這裡用不到。

---

## 4. 雲端設定步驟（需要使用者在控制台操作）

### 4.1 確認 Firebase 專案 ID
Firebase 主控台 → 齒輪「專案設定」→「一般」→ **專案 ID**。
如果不是 `balloon-v-universe`，修改 `wrangler.jsonc` 的 `FIREBASE_PROJECT_ID`。

### 4.2 建立「最小權限」服務帳戶
不要使用 Firebase 主控台「服務帳戶 → 產生新的私密金鑰」的預設帳戶（firebase-adminsdk），它的權限比需要的大。

1. 開 Google Cloud 主控台 https://console.cloud.google.com/ ，上方選擇專案 **Balloon V Universe**。
2. 左側「IAM 與管理」→「服務帳戶」→「建立服務帳戶」。
   - 名稱：`universe-worker`
   - 角色：**Firebase Realtime Database Admin**（只有 Realtime Database 的權限）
3. 建立後點進該帳戶 →「金鑰」→「新增金鑰」→「建立新的金鑰」→ JSON → 下載。
4. 這份 JSON 檔就是私密金鑰：**不要傳給任何人、不要貼到對話、不要上傳 GitHub**。

### 4.3 把金鑰放進 Cloudflare Secret
1. Cloudflare 後台 →「Workers 和 Pages」→ `balloon-v-universe-api` →「設定」→「變數和祕密」。
2. 新增 → 類型選 **祕密（Secret）** → 名稱 `FIREBASE_SERVICE_ACCOUNT_JSON` → 值：用記事本打開 JSON 檔，全選複製貼上 → 儲存。
3. 確認儲存成功後，**刪除電腦上下載的 JSON 檔**。
4. 日後若懷疑外流：回到 Google Cloud 該服務帳戶的「金鑰」頁刪除舊金鑰，再建一把新的、重新貼上。

### 4.4 設定管理員 UID
管理員必須先用 Google 登入一次才會有 UID：
1. 開管理員測試頁 `https://vashyang1120.github.io/balloon-v-universe/admin-test/`（需先完成該頁 README 的 Firebase 網頁設定）。
2. 用 Google 登入 → 按「複製 UID」。
   （也可以在 Firebase 主控台 → Authentication →「使用者」找到該 Google 帳號的「使用者 UID」。）
3. Cloudflare → `balloon-v-universe-api` → Settings → Variables and Secrets → Add：
   Type **Secret**、Name `ADMIN_UIDS`、Value 貼上 UID → 儲存。
4. 格式：多位管理員用逗號（或空白）分隔，例如 `UID甲,UID乙`。每個 UID 只接受英數字與 `:_-`，最長 128 字。
5. 沒設定時，所有管理 API 一律回 503（任何 Google 帳號都不會被當成管理員）。

### 4.5 資料庫安全規則
**維持現在的「全部拒絕」不用改**：
```json
{ "rules": { ".read": false, ".write": false } }
```
Worker 使用服務帳戶連線，不受這份規則限制；瀏覽器則完全不能直接讀寫。之後開放玩家直接讀取（例如排行榜）時，再逐一開放「只讀」路徑。

---

## 4.6 （選用）啟用 Cloudflare Rate Limiting binding
玩家 API 目前用「單一 Worker 實例記憶體計數」限流（基本防護）。若確認你的 Cloudflare 方案可使用
Rate Limiting binding，可在 `wrangler.jsonc` 加入下列設定（尚未加入，避免方案不支援時自動部署失敗）：
```jsonc
"ratelimits": [
  { "name": "RL_PLAYER_CREATE", "namespace_id": "1001", "simple": { "limit": 30, "period": 60 } },
  { "name": "RL_PLAYER_LOOKUP", "namespace_id": "1002", "simple": { "limit": 120, "period": 60 } }
]
```
程式會自動偵測；沒有設定時退回記憶體計數。

## 5. Cloudflare GitHub 自動部署

（已於 v0.1.0-deploy-test-1 連接並驗證。以下為設定紀錄。）

Cloudflare 後台 → `balloon-v-universe-api` →「設定」→「建置（Builds）」→「連接」：

| 項目 | 填寫 |
|---|---|
| Git 帳戶／Repository | `vashyang1120/balloon-v-universe` |
| 正式分支 | `main`（合併 PR 之後才會部署） |
| **根目錄（Root directory）** | `backend/worker` |
| 建置指令（Build command） | `npm run verify`（測試沒過就不部署） |
| 部署指令（Deploy command） | `npx wrangler deploy` |
| 非正式分支建置 | 關閉 |
| 建置監看路徑（若後台有此選項） | 只包含 `backend/worker/*`，避免上傳大廳圖片時也觸發部署 |

注意：
- 連接後，第一次部署會用這份程式**取代** Hello World。
- Cloudflare 會自動依 `package-lock.json` 安裝套件。
- 免費方案的建置次數／時間有上限，請在 Cloudflare 後台確認目前額度。
- 不需要、也不應該把 Cloudflare API Token 交給任何人；連接 GitHub 是在 Cloudflare 後台按授權完成。

---

## 6. 部署後的驗證

1. 開 https://balloon-v-universe-api.vashyang1120.workers.dev/health → 看到 `"status":"ok"`、`"version":"0.1.0"`。
   這只代表 Worker 正常，**不代表 Firebase 已連線**（`dependencies.firebase` 是 `not_checked`）。
2. Firebase 是否真的連得上：管理員在測試頁按「測試 Firebase 連線」（呼叫 `GET /v1/admin/diagnostics/firebase`），
   看到 `"connected": true` 才算成功。只讀，不寫入資料；空資料庫回 `readResult: "null"` 是正常的。
   失敗時回傳 `stage`（config／token／database）、`reason`（安全原因代碼）與 `hint`（中文排除建議），
   不含 Token、私鑰、服務帳戶內容或資料庫內容。

---

## 7. 安全重點

- 瀏覽器不能修改 V幣、頭像、稱號、排行榜：資料庫規則全部拒絕，相關 API 只預留、尚未開放。
- 管理員 = 有效的 Firebase ID Token ＋ Google 登入 ＋ UID 在伺服器端名單。不看 Email、沒有固定密碼、沒有測試後門。
- CORS 只限制「其他網站的網頁」，擋不住直接呼叫 API；真正的保護是伺服器端驗證。
- 記錄會遮罩 Token、私鑰、Authorization；錯誤回應不含堆疊與 Firebase 原始訊息。
- 本資料夾的程式會隨 GitHub Pages 公開（例如 `/backend/worker/README.md` 可被瀏覽），所以**這裡永遠不放私密資料**；`npm run check` 會掃描整個 Repository。

更多設計細節見 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 8. 部署驗證紀錄

| 版本 | 日期 | 目的 | 正式 Worker | 部署來源 |
|---|---|---|---|---|
| v0.1.0-deploy-test-1 | 2026-11-09 | 驗證 Cloudflare GitHub Builds 自動部署流程（不含新功能） | `balloon-v-universe-api` | `main` / `backend/worker` |

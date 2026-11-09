# 共用玩家身份系統（v0.3.0）

版本：universe-backend-v0.3.0-player-foundation-test-2
狀態：**程式開發與測試完成；尚未部署、尚未對正式 Firebase 寫入。**

---

## 1. 三種「身份」不要混為一談

| 層級 | 是什麼 | 怎麼取得 | 可以做什麼 |
|---|---|---|---|
| A. 可找回的玩家身份 | ID＋固定身份圖案 → playerId | 任何人輸入同樣的 ID＋圖案 | 讀取這位玩家的公開資料、以這個身份玩遊戲 |
| B. 目前裝置上的使用情境 | 大廳記住「這台裝置目前選的是哪個 playerId」 | 建立或找回後由前端保存 | 方便下次直接進入；**不是**權限 |
| C. 經過額外驗證的擁有者 | （尚未實作） | 未來另外設計，例如家長驗證 | 未來才開放：V幣消費、設定消費 PIN、刪除資料 |

ID＋圖案容易記，但**不是秘密**。v0.3.0 只實作 A：建立、找回、讀取公開資料。
沒有任何修改、刪除玩家資料的 API，也不發出任何可以用來消費的憑證。
Firebase 匿名登入 UID（若之後使用）只代表「某台裝置」，不能當作擁有權證明。

---

## 2. 資料結構（Firebase Realtime Database）

資料庫 Rules 維持 `.read: false / .write: false`；只有 Worker（服務帳戶）能讀寫。

### 本版實作
```
identities/
  {identityKey}:                     ← 身份索引（原子判定點）
    playerId:        "p_k3x7…"       不可變內部 ID
    displayId:       "小明"           正規化後的玩家 ID
    baseAvatarKey:   "boy1"          固定身份圖案
    createdAt:       1762600000000   伺服器時間（毫秒）
    createRequestId: "uuid…"         建立請求的冪等鍵（重送辨識）
    schemaVersion:   1
    source: { gameId, gameVersion, sdkVersion }   建立來源（自稱資訊）

players/
  {playerId}/
    profile:                          ← 公開基本資料的來源
      playerId, displayId, baseAvatarKey,
      displayAvatarKey                展示頭像（建立時＝baseAvatarKey）
      identityKey                     反查身份索引、檢查一致性
      createdAt, updatedAt, status: "active", schemaVersion: 1
```

### 未來預留（本版**不**建立任何資料）
| 路徑 | 責任 | 查詢方式 |
|---|---|---|
| `players/{playerId}/games/{gameId}/progress` | 各遊戲進度（低價值、玩家自己的） | 依 playerId |
| `wallets/{playerId}` | V幣餘額（只由伺服器以 ETag 條件寫入） | 依 playerId |
| `walletTx/{playerId}/{txId}` | 交易紀錄；txId 由來源決定（`daily-2026-11-09`、`result-{submissionId}`）避免重複記帳 | 依 playerId、時間 |
| `dailyClaims/{playerId}/{台灣日期}` | 每日獎勵領取紀錄（只能建立一次） | 依 playerId |
| `gameResults/{gameId}/{yyyy-mm}/{submissionId}` | 每場結果；依月份分片，避免單一大節點 | 依遊戲＋月份 |
| `leaderboards/{gameId}/{boardId}/{playerId}` | 每位玩家最佳成績（只存最佳，不存每場） | `orderByChild` + `limitToLast` |
| `avatarCatalog/{avatarKey}` | 頭像目錄（管理員） | 整份小量讀取 |
| `avatarUnlocks/{playerId}/{avatarKey}` | 已解鎖頭像 | 依 playerId |
| `titleCatalog/{gameId}/{titleKey}`、`titleUnlocks/{playerId}/{gameId}/{titleKey}` | 稱號 | 依 playerId |
| `shopCatalog`、`purchases/{playerId}/{purchaseId}` | 商店（需層級 C 驗證後才開放） | 依 playerId |
| `adminAuditLogs/{yyyy-mm}/{logId}` | 管理員操作紀錄 | 依月份 |

原則：所有玩家資料都掛在 `playerId` 下或以 `playerId` 為鍵；大量紀錄依月份分片；
排行榜只存每人最佳成績；從不需要讀取「全部玩家」或「全部場次」的大節點。

---

## 3. identityKey

```
identityKey = "i1_" + base64url( SHA-256( "bv-identity-v1" ␀ displayId ␀ baseAvatarKey ) )
例：i1_Q2x7…（共 46 字）
```
- displayId 先經過正規化（第 5 節），所以同樣看起來的 ID 一定得到同一個鍵。
- ␀（U+0000）當分隔：displayId 已禁止控制字元、baseAvatarKey 只有 `a-z0-9_`，所以不會碰撞。
- 只含 Firebase 路徑安全字元；資料庫鍵名不含 ID 原文，無法從鍵名列舉玩家 ID。
- 讀到身份索引時會再比對 `displayId`、`baseAvatarKey` 是否完全相同，不符就回 `INTEGRITY_ERROR`。
- `i1_` 是版本前綴；規則若改變可用 `i2_` 並存。

對照：舊系統 `playerKey = encodeURIComponent(ID) + "__" + baseAvatarKey`（無正規化、`__` 分隔理論上可碰撞）。
新系統不使用舊 playerKey 當資料主鍵。

## 4. playerId
- 格式 `p_` ＋ 20 個小寫 base32 字元（約 100 位元隨機），由 Worker 以 `crypto.getRandomValues` 產生。
- 瀏覽器不能指定（建立 API 拒絕任何多餘欄位）。
- 不使用 Email、不使用 Firebase UID；不因展示頭像、裝置、遊戲而改變。
- 無法猜測或依序列舉。

## 5. 玩家 ID 規則（`src/players/id-rules.js`）
1. 原始輸入最多 200 個 UTF-16 單位（防惡意超長字串）。
2. Unicode **NFKC** 正規化：全形英數→半形（「ＡＢＣ１」→「ABC1」）、組合字統一、全形空白→空白。
   ⚠ 會讓少數符號變形，例如「①」→「1」、「㈱」→「(株)」。**不改變英文大小寫**。
3. 所有空白類字元（含換行、全形空白）→ 一般空白；連續空白合併為一個；去除頭尾空白。
4. 拒絕：控制字元、隱形格式字元（零寬字元、文字方向控制）、私用區、未定義字元、以組合符號開頭。
   例外：組成 emoji 必要的隱形字元可以用——家庭 👨‍👩‍👧、職業 👩🏽‍💻、彩虹旗 🏳️‍🌈、地區旗 🏴󠁧󠁢󠁳󠁣󠁴󠁿（大廳 v0.3.3 允許輸入它們）。
   拆開或放在一般文字中間的隱形連接字元（例如「小‍明」）仍會被拒絕。
5. 長度以「看得到的字數」（grapheme）計算：**1～20 字**（test-2 起與大廳 v0.3.3 相同）；
   另限 64 個碼位、UTF-8 200 bytes（防止用大量組合字元塞爆單一字）。
6. 保留字：「玩家」（與大廳相同）。
7. 錯誤代碼（`details.errors[0].issue`）：`ID_EMPTY`、`ID_TOO_SHORT`、`ID_TOO_LONG`、`ID_INVALID_CHAR`、`ID_RESERVED`、`ID_NOT_TEXT`，訊息為繁體中文。
8. **顯示值**：正規化後的 displayId 就是正式顯示的 ID。若和玩家輸入（去掉頭尾空白後）不同，
   建立與找回的回應會帶 `displayIdChanged: true`，大廳應顯示回傳的 `player.displayId`
   （例如孩子用全形輸入「測試Ａ」，畫面應告訴他「你的 ID 是 測試A」）。之後用全形或半形輸入都找得回。

## 6. 固定身份圖案（`src/players/base-avatars.js`）
- 沿用大廳 v0.3.3 的 17 款識別鍵：boy1、girl1、boy2、girl2、cat1、cat2、fat1、girl3、curl1、boy3、girl4、girl5、curl2、dog1、dog2、dog3、dog4。
- 每筆有 `status`：只有 `active` 會出現在清單、能用來建立新玩家；新圖案先以 `planned` 加入，素材上線才改 `active`。
- 找回時接受所有「已知」圖案（含日後若改為下架的），所以下架圖案不會讓舊玩家找不回。
- 展示用頭像（xiaov_base 等）不能當身份圖案。
- 圖片不在後端，前端以 key 對應自己的圖檔。

---

## 7. API

所有回應使用統一格式 `{ ok, data | error, meta }`。都不需要登入；都套用 CORS 白名單與限流。

### POST /v1/players — 建立
```json
// Request（Content-Type: application/json，最多 2 KB；不接受其他欄位）
{ "displayId": "小明", "baseAvatarKey": "boy1", "createRequestId": "3f0c2c9e-6a4e-4a8f-9a37-0b8f3c1d2e44" }

// 201 Created
{ "ok": true, "data": { "status": "created", "replayed": false, "displayIdChanged": false,
  "player": { "playerId": "p_k3x7q2m9a4bz6c8d1e5f", "displayId": "小明", "baseAvatarKey": "boy1",
              "displayAvatarKey": "boy1", "createdAt": "2026-11-09T05:00:00.000Z" } }, "meta": {…} }

// 200：同一個 createRequestId 重送 → "replayed": true，player 相同
// 409：{ "ok": false, "error": { "code": "IDENTITY_EXISTS", "message": "這個玩家 ID 和身份圖案已經有人使用；如果是你，請用「我玩過了」找回",
//        "details": { "canResolve": true } } }   ← 不回傳既有玩家的資料
// 400：VALIDATION_FAILED（details.errors[0].issue 見第 5 節，或 AVATAR_NOT_AVAILABLE）
// 429：RATE_LIMITED（Retry-After: 60）
```
`createRequestId`：大廳每次按下「建立」前產生一次（`crypto.randomUUID()`），同一次操作的重試沿用同一個值。

### POST /v1/players/resolve — 找回
```json
{ "displayId": "小明", "baseAvatarKey": "boy1" }
// 200 { "ok": true, "data": { "status": "found", "displayIdChanged": false, "player": { …同上… } } }
// 404 { "ok": false, "error": { "code": "IDENTITY_NOT_FOUND", "message": "找不到這位玩家，請確認玩家 ID 和當初選的身份圖案" } }
```

### GET /v1/players/:playerId — 公開基本資料
```json
// 200 { "ok": true, "data": { "player": { …同上 5 個欄位… } } }
// 404 PLAYER_NOT_FOUND（格式錯誤的 playerId 直接 404，不查資料庫）
```
只回傳 5 個公開欄位；不回傳 identityKey、createRequestId、來源、狀態等內部欄位。
沒有「列出所有玩家」的 API。

### GET /v1/avatars/base — 固定身份圖案清單
```json
{ "ok": true, "data": { "catalogVersion": 1, "avatars": [ { "key": "boy1", "label": "男生1", "order": 1 }, … ] } }
```

---

## 8. 並發與故障恢復

**原子判定點**：`identities/{identityKey}` 的 ETag 條件寫入（讀到「不存在」的 ETag → `if-match` 寫入）。

**寫入順序**：①身份索引 → ②profile。profile 只會用「已成功寫入的身份索引」裡的 playerId 建立，
且以「只在不存在時寫入」的條件寫入。

| 情況 | 結果 |
|---|---|
| 兩台以上裝置同時建立同一組 | 只有一台的條件寫入成功；其他得到衝突 → 重讀 → `IDENTITY_EXISTS` |
| 同一裝置連點（同 createRequestId） | 全部回傳同一位玩家（第一個 201，其餘 200 replayed） |
| 身份索引寫入其實成功、但回應逾時 | 前端用同一個 createRequestId 重試 → 認出是自己 → 回傳該玩家並補上 profile |
| 身份索引成功、profile 寫入失敗 | 狀態停在「索引在、profile 缺」；下一次重試建立或找回時自動重建 profile（留下修復記錄） |
| profile 存在但沒有身份索引 | 只可能來自人工修改資料庫；不會被覆蓋，新建立會得到新的 playerId |
| 身份索引內容損壞或與 profile 不符 | 回 `INTEGRITY_ERROR`（500），不寫入任何資料，記錄供管理員檢查 |

這**不是**多路徑交易；兩個位置不是同一次寫入。保證的是：任何中斷都只會停在一種可自動修復的狀態，
且不會產生第二個 playerId 或無主 profile。

每次建立固定只寫 2 個位置；找回與讀取不寫入（除非需要補 profile）。

---

## 9. 濫用防護與免費方案（test-2 修訂）

| 動作 | 規則 | 用途 |
|---|---|---|
| 建立玩家 | ① 每 IP 每分鐘 60 次 | 一班 30～40 人同一個學校 IP 各建立一次、部分重按都不會被擋；單一來源機器人每分鐘最多 60 個 |
| 建立玩家 | ② 全體（每個 Cloudflare 機房）每分鐘 300 次 | 攻擊者換很多 IP 時，仍限制寫入總量，保護 Firebase 免費額度 |
| 找回＋讀取公開資料 | ③ 每 IP 每分鐘 300 次 | 只讀取；全班同時找回、重試都足夠 |
| 身份圖案清單 | 不限流 | 靜態內容、不讀資料庫 |

- 建立和找回分開計數：建立額度用完仍可找回。
- 不用玩家 ID 或 createRequestId 當限流鍵（使用者自填，換一個就能繞過）。
- **實作**：`wrangler.jsonc` 已設定 Cloudflare Rate Limiting binding（`RL_CREATE_IP`、`RL_CREATE_GLOBAL`、`RL_LOOKUP_IP`）；
  沒有 binding 或 binding 故障時，自動退回單一 Worker 實例記憶體計數。
- ⚠ Cloudflare 官方說明 binding 是**近似值、各機房分開計數、最終一致**，不是無法繞過的安全機制。
- ⚠ Cloudflare 文件**沒有說明 Workers Free 是否包含**此功能，要在正式部署時確認（見 ACCEPTANCE_v0.3.0.md 第 2 節）。
  本機 `wrangler dev` 已確認會模擬 binding（記錄顯示 `layer: "binding"`）。

**可觀測性（test-3）**：每個玩家 API 請求的 `request` 記錄有 `rl` 欄位（例如 `lookup:binding`、`lookup:memory(missing)`、`lookup:memory(error)`），
binding 缺少或失敗時每個 Worker 實例只警告一次 `rate limit fallback`。用來分辨官方限流是否真的在運作；不對玩家公開。

可能誤擋的情境：
- 大型活動或整個學校（同一個對外 IP）在同一分鐘內有超過 60 人建立身份 → 部分人要等 1 分鐘再按。
- 同一個機房在同一分鐘內全體超過 300 次建立（正常情況下不會發生）。
- 需要時可調整 `src/middleware/rate-limit.js` 的 `RULES` 與 `wrangler.jsonc` 的 `ratelimits`（兩邊數字要一致，測試會檢查）。

仍無法完全防止：大量分散 IP 的機器人（只能被全體上限壓住總量）；找回 API 能確認某組 ID＋圖案是否存在（只能靠限流降低試探速度）。
不合法的請求在連線 Firebase 之前就被拒絕，不會產生資料庫操作。

Firebase Spark：每次建立約 2 次讀＋2 次寫，資料量約 1 KB／玩家。

---

## 10. 與大廳 v0.3.3 的相容性（本版**沒有**修改大廳）

| 項目 | 大廳 v0.3.3 現況 | 新後端 | 差異與最小相容方案 |
|---|---|---|---|
| ID 長度 | 1～20 個字（`Array.from` 計算碼位），輸入框 maxlength 40 | 1～20 個字（grapheme）＋64 碼位上限 | **test-2 已改為相容**：大廳接受的長度後端一定接受（20 碼位一定 ≤ 20 字） |
| 空白 | 只去頭尾 | 去頭尾＋合併連續空白（含全形空白、換行） | 例如「小  明」存成「小 明」；回應 `displayIdChanged: true`，大廳顯示回傳值 |
| Unicode 正規化 | 無 | NFKC（全形→半形、組合字統一） | 例如「Ａｍｙ」存成「Amy」；之後全形或半形都找得回；大廳顯示回傳值 |
| emoji | 以碼位計算長度，全部接受 | 以看得到的字數計算；組合 emoji（家庭、職業、旗幟）可用 | 相容；只有拆開或夾在文字中的隱形連接字元會被拒絕 |
| 隱形／控制字元 | 接受 | 拒絕（ID_INVALID_CHAR） | 刻意保留的安全檢查；大廳接入後應把後端的中文錯誤訊息顯示給孩子 |
| 英文大小寫 | 區分 | 區分 | 一致 |
| 保留字 | 「玩家」 | 「玩家」 | 一致 |
| 身份圖案 | 17 款 builtinAvatars | 相同 17 款 | 一致；未來可改讀 `GET /v1/avatars/base` |
| 身份鍵 | `playerKey`（舊編碼） | `playerId`＋`identityKey` | 大廳本機記住的改為 playerId；舊 playerKey 不再當正式身份 |
| 建立 | `Store.createPlayer` 直接寫舊 Firebase | `POST /v1/players` | 改 `player-store.js` 的 createPlayer；`duplicate` 對應 409 IDENTITY_EXISTS（UI 流程不變） |
| 我玩過了 | `loadPlayerData` 讀舊 Firebase | `POST /v1/players/resolve` | 改 player-store.js 找回函式；`notFound` 對應 404 |
| 本機記住的玩家 | `bvUniverse_currentPlayerKey_v1`、玩家清單存 playerKey | 存 playerId | 新增新版本鍵（例如 `_v2`），**不要**把舊 localStorage 身份當成新玩家；舊鍵保留不刪 |
| 切換玩家 | 切換 playerKey | 切換 playerId | 切換時清掉上一位玩家在記憶體中的資料，避免混用 |
| 進入遊戲交接 | `?bvPlayerKey=` | 改傳 playerId | 遊戲改版時一併處理（不在本版範圍） |

最小修改點：`player-store.js`（建立、找回、讀取三個函式＋Firebase 換成呼叫 API，並以回傳的 `player.displayId` 顯示）、
`zones.js` 的 API 網址設定。ID 長度規則已相容，`identity.js` 不必改。畫面、動畫、對話不需要改。

---

## 11. 真實 Firebase 寫入驗收計畫

完整步驟見 [ACCEPTANCE_v0.3.0.md](ACCEPTANCE_v0.3.0.md)（**尚未執行，等使用者確認**）。
重點：只建立 4 組以「測試」開頭的身份；不清空、不批次寫入、不改 Rules；有問題可在 Cloudflare 一鍵回滾。

# 後端架構與 API 規格（v0.1.0）

## 1. 路由格式
- 所有業務 API 在 `/v1/<分類>/...`；破壞相容性的改版才開 `/v2`。
- `GET /health` 是唯一不在 `/v1` 下、也不用統一信封格式的端點（給監測工具）。
- 分類（v0.1.0 已固定前綴與權限，內容回 501）：

| 分類 | 權限 | 用途 |
|---|---|---|
| players | player | 建立身份、找回、切換展示頭像 |
| wallet | player | V幣查詢、交易紀錄、每日獎勵 |
| game-results | player | 提交遊戲結果 |
| leaderboards | public（讀） | 排行榜；寫入只由伺服器 |
| avatars | public（讀） | 頭像目錄；解鎖只由伺服器 |
| titles | public（讀） | 稱號目錄；發放只由伺服器 |
| shop | player＋加強驗證 | V幣消費（未開放） |
| admin | admin | 管理後台 |
| exports | admin | CSV 匯出 |

權限等級在路由層統一套用（`app.js`），handler 不需要自己檢查；尚未實作的 admin／exports 也先要求管理員。

## 2. 回應格式
```
成功 { "ok": true,  "data": {...}, "meta": { "requestId", "service", "version", "timestamp" } }
失敗 { "ok": false, "error": { "code", "message", "details?" }, "meta": {...} }
```
每個回應都有 `X-Request-Id` 標頭，玩家回報問題時可用它在 Cloudflare 記錄中找到對應請求。

## 3. 錯誤代碼
| code | HTTP | 意義 |
|---|---|---|
| BAD_REQUEST | 400 | 格式錯誤（JSON、標頭） |
| VALIDATION_FAILED | 400 | 欄位不符規格（details.errors 列出欄位） |
| UNKNOWN_GAME | 400 | gameId 不在登記表 |
| UNAUTHENTICATED | 401 | 沒有或無效的 Token |
| FORBIDDEN | 403 | Token 有效但沒有權限 |
| ORIGIN_NOT_ALLOWED | 403 | 網站來源不在名單 |
| NOT_FOUND | 404 | 沒有這個 API |
| METHOD_NOT_ALLOWED | 405 | 方法不對（附 Allow） |
| CONFLICT | 409 | 資料同時被更新（ETag 不符），可重試 |
| DUPLICATE_SUBMISSION | 409 | 同一個 submissionId 已處理過 |
| PAYLOAD_TOO_LARGE | 413 | 內容超過 32 KB |
| UNSUPPORTED_MEDIA_TYPE | 415 | 不是 application/json |
| RATE_LIMITED | 429 | 太頻繁（之後版本） |
| INTERNAL | 500 | 未預期錯誤（不回傳細節） |
| NOT_IMPLEMENTED | 501 | 尚未開放 |
| UPSTREAM_UNAVAILABLE | 502 | Firebase／Google 無法使用或拒絕 |
| SERVICE_NOT_CONFIGURED | 503 | 缺少設定或 Secret |
| UPSTREAM_TIMEOUT | 504 | Firebase／Google 逾時 |

## 4. 遊戲版本識別
- 標頭：`X-BV-Client: <gameId>/<gameVersion> sdk/<sdkVersion>`，例如 `tetris/2.0.0 sdk/1.0.0`。
- gameId 必須在 `src/games.js` 登記；版本必須是 `1.2.3` 或 `1.2.3-test-1` 格式。
- 提交成績時，信封內的 gameId／gameVersion 必須和標頭一致。
- 這是「自稱」資訊，只用於記錄與相容性判斷，不作為安全依據。

## 5. 玩家身份（v0.3.0 已實作，完整規格見 PLAYERS.md）
> 以下為 v0.1.0 時的設計草案；實作細節（identityKey 雜湊、NFKC、冪等鍵、修復流程）以 [PLAYERS.md](PLAYERS.md) 為準。

- **playerId**：伺服器產生、永不改變（`p_` + 20 碼）。所有玩家資料都掛在 playerId 下。
- **身份鍵**：`identities/{encode(玩家ID)}__{baseAvatarKey}` → playerId。同一個 ID 搭配不同固定圖案是不同玩家。
- **baseAvatarKey** 用於身份識別，建立後不可改；**displayAvatarKey** 只用於展示，換頭像不改身份。
- **匿名登入 UID 只是「技術身份」**：記錄這台裝置用過哪個 playerId，不代表擁有權。知道 ID＋圖案的人可以取得同一個玩家身份——這是第一版接受的便利性風險。
- **不允許**「只憑 ID＋圖案」就設定永久消費 PIN 並視為已驗證擁有者（否則先冒用的人就能把 PIN 搶走）。之後開放 V幣消費時，需要另一種驗證（例如連結 Google 帳號，或由管理員核發綁定碼）。

## 6. 資料一致性與防重複（下一版實作的設計）
Realtime Database REST 沒有多路徑交易，因此用 **ETag 條件寫入**（`firebase-rest.js` 的 `getWithEtag`／`putIfMatch`）處理：

| 情境 | 作法 |
|---|---|
| 遊戲結果重送 | 遊戲端每場產生唯一 `submissionId`。伺服器寫 `gameResults/{gameId}/{submissionId}` 前先讀 ETag，資料已存在 → `DUPLICATE_SUBMISSION`（並回傳上次的處理結果），不重複發獎勵。 |
| 每日獎勵只能領一次 | `dailyClaims/{playerId}/{台灣日期}` 以「原本不存在」的 ETag 條件寫入；兩個請求同時到，只有一個成功，另一個得到 `CONFLICT`。日期由伺服器 `taipeiDateKey()` 計算，不信任裝置時間。 |
| V幣餘額 | `wallets/{playerId}` 讀 ETag → 計算新餘額 → 條件寫入；不符就重讀重算（最多數次）。每筆異動另寫 `walletTx/{playerId}/{txId}`，txId 由來源決定（例如 `daily-2026-11-08`、`result-{submissionId}`），同一來源不會記兩次帳。 |
| 寫入順序 | 先寫「領取紀錄／交易紀錄」，再改餘額；中途失敗時可由紀錄重建或補正，不會出現「錢加了但沒有紀錄」。 |

## 7. 管理員驗證
1. `Authorization: Bearer <Firebase ID Token>`
2. 依 Firebase 規格驗證：RS256、kid 對應 Google 公開金鑰、`aud`＝專案 ID、`iss`＝`https://securetoken.google.com/<專案 ID>`、`exp`／`iat`／`auth_time`、`sub` 非空、簽章。
3. `firebase.sign_in_provider` 必須是 `google.com`（匿名一律拒絕）。
4. UID 必須在 Secret `ADMIN_UIDS`。之後若需要多位管理員，可改為資料庫保護區 `system/admins/{uid}`（瀏覽器無法讀寫，只有 Worker 能讀）。
5. 測試用的金鑰只存在測試程式中、由測試「注入」；正式程式沒有任何接受假 Token 的開關。

尚未做的：ID Token 撤銷檢查（需要呼叫 Identity Toolkit；目前以 Token 1 小時效期＋UID 名單控制）。

## 8. 免費方案設計
**Cloudflare Workers Free**：每日 10 萬次請求、每次請求 CPU 10 毫秒（等待網路的時間不算 CPU）。
- 服務帳戶 RSA 簽章只在換 Token 時做一次，Token 快取約 55 分鐘。
- Google 公開金鑰依 Cache-Control 快取；匯入後的 CryptoKey 也快取。
- `/health` 不碰任何外部服務。
- 不使用 KV、Durable Objects、Queues 等可能有額度或費用的服務。

**Firebase Spark**：同時連線 100、儲存 1 GB、下載每月 10 GB。
- Worker 用 REST 短連線，不保持長連線。
- 讀取時盡量用 `shallow`、`limitToLast`，不讀整棵樹。
- 排行榜等常讀資料，之後可在 Worker 記憶體做短時間快取，降低下載量。
- 不使用 Cloud Functions、不升級 Blaze。

**尚未解決、需要之後決定**：頻率限制（Rate limiting）。免費方案下可行的作法是在資料庫記錄「每玩家每分鐘次數」，但會增加讀寫量；需要在實作 game-results 時再評估。

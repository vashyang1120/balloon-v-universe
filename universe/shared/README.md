# Universe SDK（三款遊戲共用）

`universe-sdk.js`：一個檔案、不需打包工具。遊戲以 `<script src="../shared/universe-sdk.js">` 載入，取得 `window.BVUniverse`；
Node 測試以 `require()` 載入。三款遊戲**共用這一份**，不各自複製玩家系統。

## 架構

```
BVUniverse
├─ createGameSession(opts)        ← 遊戲只需要這個
│   ├─ 身份交接 readHandoff()      網址 ?bvPlayerId= → 本分頁先前玩家 → 大廳目前玩家（同網域）
│   ├─ 玩家上下文 start()/switchPlayer()/getPlayer()/onChange()/onReset()
│   ├─ playerStore                 依 playerId 分開的本機暫存（bvUniverseGame_v1_{mode}_{gameId}__{playerId}__{name}）
│   ├─ avatars                     imageUrl(key) → assets/avatars/base/{key}.png；loadList() 讀後端 active 清單
│   ├─ services
│   │   ├─ players       production：GET /v1/players/:id（唯讀）／sandbox：Mock（讀大廳沙盒玩家）
│   │   ├─ wallet        production：NOT_IMPLEMENTED／sandbox 可選 Mock（每人每天一次 +30 契約）
│   │   ├─ scores        NOT_IMPLEMENTED，或遊戲明確選擇 Mock
│   │   ├─ leaderboard   NOT_IMPLEMENTED，或 Mock（只由本分頁 Mock 成績計算）
│   │   └─ gameLogs／titles／avatarUnlocks   NOT_IMPLEMENTED
│   ├─ capabilities()              給畫面判斷「未開放／準備中／Mock」
│   └─ newScoreSubmission()        共用外層＋遊戲專屬 scoreData
├─ createApiClient()               fetch＋逾時（AbortController）＋錯誤分類；只有 GET
├─ classifyPlayerIdInput()         p_＋20 碼才是 playerId；含 "__" 的舊 playerKey 明確拒絕
├─ buildScoreSubmission()／validateScoreSubmission()／SCORE_SCHEMAS
├─ taipeiDateKey()                 Asia/Taipei 日期鍵（每日獎勵用）
└─ UniverseError                   kind：missingPlayer／legacyPlayerKey／invalidPlayerId／notFound／rateLimited／timeout／network／server／validation／notImplemented／forbidden
```

## 使用方式（遊戲端）

```js
var S = BVUniverse.createGameSession({
  gameId: "tetris",                         // tetris | rhythm | quiz
  gameVersion: "tetris-v1.3.7+universe-v0.1.0-test-1",
  avatarBaseUrl: "../../assets/avatars/base/",
  services: { scores: "mock", leaderboard: "mock" }   // 正式 API 完成前，明確選擇 Mock（畫面必須標示）
});
S.onReset(function () { /* 清除上一位玩家的畫面狀態 */ });
S.start().then(function (player) {
  // player: { playerId, displayId, baseAvatarKey, displayAvatarKey, mode, trust:"low-recoverable-identity", canSpendVCoins:false, isAdmin:false }
}, function (err) {
  // err.kind / err.userMessage / err.retryable / err.retryAfterSec
});
```

## 正式與 Sandbox

| | production（預設） | sandbox（網址 `?sandbox=1`） |
|---|---|---|
| 玩家資料 | `GET /v1/players/:id`（唯讀） | 讀大廳沙盒（`sessionStorage bvUniverseSandbox_v2_api`）與測試用示範玩家，**完全不連網** |
| 大廳目前玩家鍵 | `bvUniverse_v2_currentPlayerId` | `bvUniverseSandbox_v2_currentPlayerId`（不會讀到正式玩家） |
| V幣 | NOT_IMPLEMENTED | 可選 Mock（標示 `source:"mock"`） |
| 成績／排行榜 | NOT_IMPLEMENTED 或 Mock | NOT_IMPLEMENTED 或 Mock |
| Mock 資料位置 | `sessionStorage bvUniverseSdk_v1_mockDb__production` | `…__sandbox` |

Mock 資料只存在目前分頁，結果一律 `serverConfirmed:false`，不會寫入任何資料庫。

## 安全

- 不含 Firebase 設定、API Key、服務帳戶或任何私鑰（單元測試會檢查）。
- 不連線舊 Firebase；API 失敗時回報錯誤，**不會**退回舊 Firebase。
- 只發出 GET；建立／找回玩家是大廳的工作。
- playerId 是低信任識別：網址參數不能取得管理員或 V幣消費權限。

## 測試

```
node --test universe/shared/tests/universe-sdk.test.mjs
```
20 項：身份交接、舊 playerKey 拒絕、404／429／逾時／網路／500、快速切換（舊回應不覆蓋）、玩家暫存隔離、
Sandbox 不連網、NOT_IMPLEMENTED、正式模式禁止 Mock 錢包、ScoreSubmission 驗證與去重、每日 +30 一天一次（跨遊戲、台灣午夜邊界）、
原始碼不含私鑰、網址參數不能提權。另以「故意植入錯誤」確認測試能抓到問題。

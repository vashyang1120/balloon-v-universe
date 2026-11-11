# 遊戲宇宙共用資料契約（草案 v0.1）

適用：方塊派對、節奏遊戲、知識挑戰（未來可擴充冒險遊戲）。
本文件只定義**契約**；除了玩家 API 以外，下列後端 API **都還不存在**。
SDK 在正式模式一律回報 `NOT_IMPLEMENTED`，不會偷偷退回舊 Firebase；Mock 只在畫面明確標示的測試情境使用。

## 0. 三個信任層次（不可混用）

| 層次 | 內容 | 目前的憑證 | 可以做 | 不可以做 |
|---|---|---|---|---|
| ① 玩家身份識別 | 這場遊戲屬於哪個 playerId | 網址 `?bvPlayerId=`（大廳交接）；ID＋身份圖案可找回 | 顯示玩家資料、把成績**提報**到這個 playerId | 當成密碼或授權 |
| ② 遊戲使用情境 | 這一場是不是真的玩過 | 未來：後端發給的 game session（開局時取得） | 提交成績、觸發每日獎勵檢查 | 決定自己的分數是否被接受 |
| ③ 正式資料寫入授權 | 誰能改錢包、排行榜、解鎖、管理資料 | **只有後端**（服務帳戶）；管理員＝Firebase Auth＋ADMIN_UIDS | 帳本入帳、成績確認、排行榜計算、管理操作 | — |

- playerId 出現在網址上不代表擁有者驗證；**不能**用來消費 V幣，也**不能**修改別人的錢包或成績。
- V幣消費（商店）需要另外的高信任授權（例如裝置綁定 session＋家長登入或 PIN），在設計完成前一律拒絕（SDK `wallet.spend()` → `forbidden`）。
- 網址參數不能提升權限：SDK 的玩家物件固定 `isAdmin:false`、`canSpendVCoins:false`。

## 1. 玩家（已上線）

| API | 用途 | 遊戲是否使用 |
|---|---|---|
| `POST /v1/players` | 建立玩家（ID＋身份圖案 → 伺服器產生 playerId） | 否（只有大廳） |
| `POST /v1/players/resolve` | 用 ID＋身份圖案找回 playerId | 否（只有大廳） |
| `GET /v1/players/:playerId` | 公開資料：playerId、displayId、baseAvatarKey、displayAvatarKey、createdAt | **是**（SDK 唯讀） |
| `GET /v1/avatars/base` | 身份圖案 active 清單（33 款，權威來源） | 只有需要「選擇」圖案的畫面（大廳） |

身份圖案圖片統一在 `balloon-v-universe/assets/avatars/base/{key}.png`，遊戲不得各自複製。

## 2. V幣（WalletService）— 後端尚未實作

### 2.1 已定案規則（不可修改）
- V幣屬於玩家，不屬於單一遊戲；同一 playerId 在所有遊戲看到相同餘額。
- **每日獎勵：每個玩家每天最多一次 +30 V幣**，日期以 `Asia/Taipei` 計算；換遊戲不能再領。
- 每日領取必須在後端做**原子性＋防重複**；遊戲前端不得改寫餘額。

### 2.2 舊系統的其他 V幣來源（需要決定是否保留）
方塊／節奏／問答「今日挑戰」各 +10（見 GAME-INVENTORY.md）。本版**不改動**這些規則，只記錄；
是否在新後端保留、金額多少，需要使用者決定。

### 2.3 提議 API

```
GET  /v1/players/:playerId/wallet
  → { balance, updatedAt }                       // 公開讀取（低風險）；不含交易明細

POST /v1/rewards/daily
  body { playerId, gameId, submissionId }        // submissionId 必須是「已被接受」的當日成績
  → 200 { status: "claimed", amount: 30, dateKey: "YYYYMMDD", txId, balance }
  → 200 { status: "already_claimed", dateKey, claimedByGameId, balance }
  → 409 { code: "SUBMISSION_NOT_ACCEPTED" }       // 沒有完成任何一場就不能領

POST /v1/wallet/spend                            // 未來；需要第 ③ 層授權，目前一律 403
```

後端寫入（建議 RTDB 結構，`balloon-v-universe` 專案，只有 Worker 可寫）：

```
wallets/{playerId}            { balance, updatedAt, version }
walletLedger/{playerId}/{txId}
  { txId, type: "daily_reward"|"daily_challenge"|"admin_adjust"|"spend",
    amount, balanceAfter, gameId, dateKey, submissionId, createdAt, source: "server" }
dailyRewards/{playerId}/{YYYYMMDD}  { txId, gameId, claimedAt }   // 存在 = 已領
```

原子性做法：以 `dailyRewards/{playerId}/{date}` 的 ETag 條件寫入（不存在才建立）＋錢包 ETag 條件更新＋帳本寫入；
任一步衝突就重試或回傳 `already_claimed`（與玩家 API 的身份唯一性相同機制）。

SDK 對應：`session.services.wallet.getBalance / claimDailyReward / listTransactions / spend`；
正式模式＝`NOT_IMPLEMENTED`；sandbox 可選 Mock（只存在分頁，結果標示 `source:"mock"`、`serverConfirmed:false`），
Mock 已實作「同一台灣日期只能領一次、換遊戲也不行」以驗證契約（單元測試涵蓋 23:59／00:00 邊界）。

## 3. 成績（ScoreService）— 後端尚未實作

### 3.1 ScoreSubmission（共用外層＋遊戲專屬 scoreData）

```jsonc
{
  "schemaVersion": 1,
  "submissionId": "uuid",            // 開局時產生；同一場重送用同一個 → 後端去重
  "playerId": "p_xxxxxxxxxxxxxxxxxxxx",
  "gameId": "tetris" | "rhythm" | "quiz",
  "gameVersion": "tetris-v1.3.7+universe-v0.1.0-test-1",
  "mode": "production" | "sandbox",  // sandbox 不得進正式資料庫
  "startedAt": "ISO",
  "finishedAt": "ISO",
  "scoreData": { ... 遊戲專屬 ... },
  "client": { "sdkVersion": "0.1.0", "reportedBy": "client" }
}
```

| gameId | scoreData 欄位 | 用來排名的值 |
|---|---|---|
| tetris | `score`、`level`(≥1)、`lines`、`difficulty`(easy／normal／hard)、`peakCombo` | score |
| rhythm | `songId`(songNNN)、`difficulty`(easy／normal／hard)、`score`、`grade`(S／A+／A／B／C／D／E)、`accuracy`(0–100)、`maxCombo`、`perfect`、`good`、`miss` | 每首歌×難度的 score |
| quiz | `gradeBand`(low／middle／high)、`subject`、`score`、`correctCount`、`totalQuestions`、`maxCombo`、`accuracy`(0–1)、`timeUsedTotal`(秒)；建議加 `usedQuestionIds`、`answers` | 科目最佳 → 年級榜 → 主榜 |

不同遊戲**不強迫**塞成同一個分數格式；共用外層只負責歸屬、去重、時間與版本。

### 3.2 提議 API

```
POST /v1/game-sessions        { playerId, gameId, gameVersion } → { sessionId, startedAt(server) }   // 建議 v0.2 加入
POST /v1/scores               ScoreSubmission (+ sessionId)
  → 202 { submissionId, recordStatus: "pending" | "accepted" | "rejected", reasons? }
  → 200 同上（重送同一個 submissionId、內容相同：回傳原結果）
  → 409 SUBMISSION_CONFLICT（同一 submissionId、內容不同）
GET  /v1/players/:playerId/scores?gameId=   → 該玩家已接受的紀錄
```

### 3.3 客戶端回報 vs 伺服器確認
- 遊戲送出的是「**客戶端回報**」（`client.reportedBy:"client"`）。只有後端驗證後的 `recordStatus:"accepted"` 才能進排行榜、觸發獎勵。
- 建議的伺服器檢查（不改變計分規則，只檢查合理性）：
  - 共用：playerId 存在、gameId／版本白名單、`finishedAt - startedAt` 合理（不能是 0 秒或超過 6 小時）、同一 playerId 的提交頻率限制。
  - 方塊：`level == floor(lines / DIFF[difficulty].lperlv) + 1`；分數上限依 lines／level 推算；時間至少足以掉落這麼多方塊。
  - 節奏：後端有 beatmap → `perfect+good+miss` 必須等於該歌該難度的音符數；accuracy 與 grade 由後端依原公式重算。
  - 問答：後端有題庫答案 → 依 `usedQuestionIds`＋`answers` 重算答對數；score 不得超過 10 題 ×（100＋50）。
- 前端傳來的任意分數**不得**直接寫進正式排行榜（本版原型只寫 Mock）。

## 4. 排行榜（LeaderboardService）— 後端尚未實作

只由「已接受」的成績計算；每位玩家只顯示最佳一筆；以 **playerId** 歸屬（舊 playerKey 不併入）。

| 排行榜 | 鍵 | 個人最佳規則（沿用原版） | 排序 |
|---|---|---|---|
| 方塊 | `leaderboards/tetris/main/{playerId}` | 分數較高；同分保留較新的一筆（原版 `saveLB`） | score 由高到低 |
| 節奏 | `leaderboards/rhythm/{songId}/{difficulty}/{playerId}` | 分數嚴格較高才更新（原版 `saveScore`） | score 由高到低 |
| 問答年級榜 | `leaderboards/quiz/byGrade/{low\|middle\|high}/{playerId}` | 見下節 | gradeTotalScore 由高到低 |
| 問答主榜 | `leaderboards/quiz/main/{playerId}` | 見下節 | totalScore 由高到低 |

```
GET /v1/leaderboards/tetris?limit=30
GET /v1/leaderboards/rhythm/{songId}/{difficulty}?limit=30
GET /v1/leaderboards/quiz/byGrade/{grade}?limit=30
GET /v1/leaderboards/quiz/main?limit=30
→ { boardKey, source: "server", rows: [{ playerId, displayId, displayAvatarKey, score, scoreData, achievedAt, equippedTitle? }] }
```

顯示名稱一律做 HTML 跳脫（舊方塊排行榜未跳脫，有 XSS 風險）。

## 5. 問答年級榜相容方式（規則逐字沿用 quiz-v0.2.44）

1. **科目最佳紀錄**（`players/{id}/quizProgress/{grade}/{subject}`）：新紀錄比舊紀錄好才取代，比較順序
   分數高 → 答對多 → 最高連對多 → 用時少 → 時間較新（原版 `shouldUpdateBestRecord`）；`attempts` 每次 +1；
   `perfect = bestCorrectCount ≥ bestTotalQuestions`。
2. **年級榜**（low／middle／high）：`gradeTotalScore = 該年級所有已玩科目 bestScore 加總`；
   另記 completedSubjects、perfectSubjects、totalCorrect、totalQuestions、totalMaxCombo、totalTimeUsed、totalAttempts、subjectKeys／Names
   （原版 `buildGradeRecordFromProgress`）。
3. **主榜 main**：`totalScore = low + middle + high 三個年級的 gradeTotalScore 加總`（只加有完成科目的年級）；
   `gradeSummary = { low, middle, high }`、`completedGrades`（原版 `buildMainRecordFromGradeRecords`）。
4. 新系統差異只有：歸屬改用 playerId、由後端在成績被接受後計算（前端不再自己寫三層資料）。
5. 舊資料不遷移；新榜從新紀錄開始累積。

## 6. 遊戲紀錄（GameLogService）與管理匯出

- 每一場（不論是否被接受）一筆：`gameLogs/{gameId}/{submissionId}` = ScoreSubmission ＋ `recordStatus`、`receivedAt`、`reasons`、`ipHash`（不存原始 IP）。
- 管理後台（未來）：以 playerId／displayId 搜尋；查看各遊戲紀錄、成績、V幣交易、頭像解鎖；管理排行榜顯示（隱藏不刪除）。
- **單一完整 CSV 匯出**欄位：
  `gameId, submissionId, playerId, displayId, baseAvatarKey, displayAvatarKey, gameVersion, mode, startedAt, finishedAt, durationMs, recordStatus, receivedAt,`
  ＋ 依遊戲攤平的 `scoreData.*`（不存在的欄位留空）。三款遊戲共用欄位與專屬欄位清單見 GAME-INVENTORY.md「場次資料欄位」。
- 本版**不啟用**任何管理功能。

## 7. 其他服務（介面已在 SDK，正式模式 NOT_IMPLEMENTED）

| 服務 | 方法 | 備註 |
|---|---|---|
| TitleService | listUnlocked／unlock／equip | 稱號由後端依已接受成績授予；遊戲不得自行寫入 |
| AvatarUnlockService | listUnlocked／unlock／equipDisplay | 展示頭像只影響外觀；不可改變身份（baseAvatarKey） |
| GameLogService | append／listMine | 見第 6 節 |

## 8. 錯誤分類（SDK 統一）

| kind | 來源 | 可重試 | 給孩子看的訊息（摘要） |
|---|---|---|---|
| missingPlayer | 沒有 playerId | 否 | 請從遊戲宇宙大廳進入 |
| legacyPlayerKey | 網址帶舊 playerKey | 否 | 舊版玩家代碼，請從大廳重新進入 |
| invalidPlayerId | 格式錯誤 | 否 | 玩家代碼格式不正確 |
| notFound | HTTP 404 | 否 | 找不到這位玩家 |
| rateLimited | HTTP 429（含 `retry-after`） | 是 | 連線太頻繁，請稍等 |
| timeout | 逾時（預設 12 秒） | 是 | 連線逾時 |
| network | 連線失敗 | 是 | 網路連線失敗 |
| server | HTTP 5xx／格式錯誤 | 是 | 伺服器暫時無法使用 |
| notImplemented | 後端 API 尚未完成 | 否 | 功能準備中 |
| forbidden | 需要更高授權（例如 V幣消費） | 否 | 沒有權限 |

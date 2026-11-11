# 舊 Firebase 路徑對照表

三款正式遊戲共用同一個舊 Firebase 專案 **vparty-rhythm-game**（Realtime Database，前端匿名登入後直接讀寫）。
遊戲宇宙新系統使用另一個專案 **balloon-v-universe**，只由 Cloudflare Worker（服務帳戶）存取，Rules 為全部拒絕。

> 本次（v0.1.0-foundation）**不遷移、不刪除、不讀寫**任何舊資料。下表的「新系統」欄是未來的對應方式。
> `{playerKey}` = `encodeFirebaseKeyPart(ID) + "__" + baseAvatarKey`（舊身份鍵），**不能**當成新 `playerId`。

| 舊路徑 | 方塊 | 節奏 | 問答 | 讀／寫 | 內容 | 新系統（未來） | v0.1.0 原型處理 |
|---|---|---|---|---|---|---|---|
| `players/{playerKey}/profile` | ● | ● | ● | 讀寫 | id、name、playerKey、baseAvatarKey、displayAvatarKey、createdAt | `players/{playerId}/profile`（後端建立，已上線） | 不讀寫；改 `GET /v1/players/:playerId` |
| `players/{playerKey}/unlockedAvatars/{avatarKey}` | ● | ● | ● | 讀寫 | unlocked、source、unlockedAt | AvatarUnlockService（後端授予） | 準備中 |
| `avatarCatalog/{key}` | 讀 | 讀 | 讀＋寫 `xiaov_base` | 讀寫 | 學生／特殊頭像目錄 | 共用目錄 API | 準備中 |
| `players/{playerKey}/wallet/balance` | ● | ● | ● | 讀寫（transaction） | V幣餘額 | WalletService 帳本（後端唯一可寫） | 未開放 |
| `players/{playerKey}/vCoinLogs/{pushKey}` | ● | ● | ● | 寫 | 每筆 V幣異動 | 帳本交易（append-only） | 未開放 |
| `players/{playerKey}/dailyRewards/{YYYYMMDD}` | ● | ● | ● | 讀寫（transaction） | 每日 +30 是否已領（三款共用） | `dailyRewards/{playerId}/{YYYYMMDD}`（後端原子性） | 未開放 |
| `players/{playerKey}/dailyChallenges/{gameId}/{YYYYMMDD}` | tetris | rhythm | quiz | 讀寫（transaction） | 各遊戲今日挑戰 +10 | 每日挑戰 API（後端判定） | 未開放 |
| `players/{playerKey}/titles/{gameId}/{titleKey}` | ● | ● | — | 讀寫（transaction） | 稱號解鎖 | TitleService | 準備中 |
| `players/{playerKey}/titleLogs/{pushKey}` | ● | ● | — | 寫 | 稱號紀錄 | TitleService 紀錄 | 準備中 |
| `players/{playerKey}/equippedTitle` | ● | ● | ● | 讀寫 | 目前裝備稱號 | TitleService | 準備中 |
| `players/{playerKey}/quizEquippedTitle` | 讀 | 讀 | ● | 讀寫 | 舊問答稱號（備援） | 併入 TitleService | — |
| `players/{playerKey}/quizTitles`、`quizBadges` | — | — | ● | 讀寫 | 問答稱號、徽章 | TitleService | — |
| `players/{playerKey}/quizProgress/{grade}/{subject}` | — | — | ● | 讀寫 | 科目最佳紀錄、嘗試次數 | ScoreService 衍生資料（後端計算） | — |
| `players/{playerKey}/quizAcademyProgress` | — | — | ● | 讀寫 | 學院進度 | 後端計算 | — |
| `sharedCatalogs/titles[/rhythm]` | — | 讀 | — | 讀 | 稱號目錄 | 共用目錄 API | — |
| `gameLogs/tetris` | ● | — | — | 寫（push）／管理讀 | 每場紀錄 | GameLogService（每場一筆，含 submissionId） | 改送 Mock |
| `gameLogs/rhythm` | — | ● | — | 寫／管理讀 | 每場紀錄 | GameLogService | — |
| `gameLogs/quiz` | — | — | ● | 寫；**前端讀整個節點**算進度 | 每場紀錄 | GameLogService；不可再讓前端讀全部玩家 | — |
| `leaderboards/tetris/{playerKey}` | ● | — | — | 讀寫 | 個人最高分 | `leaderboards/tetris/main/{playerId}`（後端由已接受成績計算） | 改 Mock 排行榜 |
| `tetris-balloon/leaderboard` | ● | — | — | 讀寫（push、管理刪除） | 舊版排行榜 | 只讀封存（不遷移） | 不讀 |
| `leaderboards/rhythm/{songId}/{diff}/{playerKey}` | — | ● | — | 讀寫 | 歌曲×難度最高分 | `leaderboards/rhythm/{songId}/{diff}/{playerId}` | — |
| `scores` | — | ● | — | 讀寫（保留 300 筆） | 舊成績列表 | 只讀封存 | — |
| `dev/scores`、`dev/gameLogs/rhythm`、`dev/leaderboards/rhythm` | — | TEST_MODE | — | 讀寫 | 節奏測試模式 | sandbox 不寫正式資料庫 | — |
| `leaderboards/quiz/byGrade/{low\|middle\|high}/{playerKey}` | — | — | ● | 讀寫 | 年級榜 | `leaderboards/quiz/byGrade/{grade}/{playerId}`（後端計算） | — |
| `leaderboards/quiz/main/{playerKey}` | — | — | ● | 讀寫 | 主榜 | `leaderboards/quiz/main/{playerId}`（後端計算） | — |
| `quizQuestionOverrides/{questionId}` | — | — | 讀＋管理寫 | 讀寫 | 題目修正 | 共用管理後台 | — |

## 本機 localStorage 鍵（舊）

| 鍵 | 遊戲 | 用途 | 新系統 |
|---|---|---|---|
| `vtetris_playerId`、`vtetris_name`、`vtetris_avKey`、`vtetris_baseAvatarKey`、`vtetris_displayAvatarKey`、`vtetris_playerKey` | 方塊 | 身份 | 不使用；身份由 `?bvPlayerId=`＋SDK 取得 |
| `vtetris_best` | 方塊 | 最高分（**全裝置共用，不分玩家**） | `bvUniverseGame_v1_{mode}_tetris__{playerId}__localBest` |
| `vtetris_best_{playerKey}` | 方塊 | 雲端最高分快取 | 不使用 |
| `vtetris_firstRun` | 方塊 | 首次進入 | 不使用 |
| `vrhythm_name`、`vrhythm_avKey` | 節奏（方塊／問答也會讀） | 舊身份 | 不使用 |
| `vPartyPlayerProfile`、`vPartyProfile` | 三款 | 跨遊戲共用身份 | 不使用（大廳 `writeSharedProfileKey: false`） |
| `vPartyScores`、`vPartyScores_{songId}` | 節奏 | 本機成績備援 | 依 playerId 分開 |
| `vquiz_*`（playerId、playerKey、baseAvatarKey、displayAvatarKey、profileConfirmed） | 問答 | 身份 | 不使用 |
| `vquiz_localLogs` | 問答 | 最近 50 場（全裝置共用） | 依 playerId 分開 |
| `vquiz_soundEnabled` | 問答 | 音效開關 | 保留（裝置偏好，不屬於玩家） |
| `vtetris_admin_pw` 等管理密碼 | 三款 | 前端管理密碼 | 移除；改用共用管理後台（Firebase Auth＋ADMIN_UIDS） |

## 舊系統的安全問題（供後端設計參考，本次不修改正式遊戲）

1. **V幣由前端 transaction 直接改寫餘額**：任何人都能寫入任意餘額或重複領取（換一組 ID＋圖案就是新的 playerKey）。
2. **前端寫死的管理員 PIN 與預設密碼**：方塊 `ADMIN_UNLOCK_PIN`、`REMOTE_UNLOCK_PINS`、`getAdminPw()` 的預設密碼直接寫在程式中；看原始碼就能解鎖他人頭像或進後台。
3. **排行榜名稱以 innerHTML 輸出未跳脫**（方塊 `loadLB`）：舊排行榜有儲存型 XSS 風險。
4. **問答前端讀取整個 `gameLogs/quiz`**：可看到所有玩家的答題紀錄，資料量也會越來越大。
5. **成績完全由前端決定**：可以送任意分數到排行榜。

原型已處理 2、3（PIN 清空、管理後台停用、排行榜名稱跳脫）並且不寫入任何正式資料；1、4、5 需要後端 API（見 [DATA-CONTRACTS.md](DATA-CONTRACTS.md)）。

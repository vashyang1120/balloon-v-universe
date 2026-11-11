# 前三款遊戲換殼計畫與「換殼修改位置清單」

原則：**保留遊戲本身，只替換玩家與共用資料系統**。正式遊戲 Repository 在新版驗收、決定切換入口之前一律不改，舊版持續可玩。
所有換殼開發放在 `balloon-v-universe/universe/<遊戲>/`，以「建置腳本＋核心完整性測試」保證玩法與原版逐字相同。

## 共同做法（三款都適用）

1. 從正式版 commit 產生副本：`universe/<遊戲>/tools/build_prototype.py`（每處修改必須剛好命中一次）。
2. `<head>` 移除 Firebase SDK，改載入 `../shared/universe-sdk.js`＋該遊戲的 `universe-shell.js`。
3. 玩家系統函式改為呼叫換殼層；**遊戲核心函式不動**，以 `tests/<遊戲>-core-integrity.test.mjs` 用 SHA-256 鎖定。
4. 真實瀏覽器測試：玩法等價（同隨機種子，原版 vs 換殼版結果相同）＋身份／切換／錯誤／Sandbox／零外部連線。
5. 身份只從 `?bvPlayerId=` 交接（大廳 `Handoff.launchUrl` 已支援）；遊戲內不建立、不切換身份，切換回大廳。
6. 尚未完成的 API：V幣「未開放」、稱號與頭像收藏「準備中」、成績與排行榜 Mock（明確標示）。

---

## A. 方塊派對（v0.1.0 已完成可玩原型）

檔案：`vparty-tetris/index.html`（commit 7f33885）→ `universe/tetris/index.html`（共 54 處修改，見建置腳本）

| 函式／位置 | 原本行為 | 換殼後 | 安全風險 | 回歸測試 |
|---|---|---|---|---|
| `<head>` Firebase SDK 三個 script | 載入 compat SDK 9.23.0 | 改載入 universe-sdk.js、universe-shell.js | 低 | 瀏覽器：零外部連線；對照組原版確實會連 |
| `FIREBASE_CONFIG`／`FIREBASE_ENABLED` | 舊專案設定、啟用 | `null`／`false` | 低 | 完整性測試：不得出現 databaseURL／apiKey |
| `ADMIN_UNLOCK_PIN`、`REMOTE_UNLOCK_PINS` | 前端寫死 PIN | 清空 | 降低（原本任何人可看到 PIN） | 完整性測試 |
| `ensureFirebaseReady`、`initFirebase` | 匿名登入 | 回傳 false／不動作 | 低 | 瀏覽器：無 Firebase 連線 |
| `loadPlayer`、`savePlayerLocal`、`savePlayer` | 本機 vtetris_* 組 playerKey | `UniverseTetris.applyPlayerTo(PLAYER)`；playerKey 固定空字串 | 中：身份錯置 → 以 playerId 驗證 | 瀏覽器：playerId、displayId、頭像正確 |
| `ensurePlayerProfile` | 寫 players/{playerKey}/profile | 不寫 | 低 | 瀏覽器：玩家資料庫無變動 |
| `goProfile`（開始遊戲） | 首次進入要求設定身份 | 沒有玩家就不能開始；有玩家直接選難度 | 中：無身份計分 → 阻擋 | 瀏覽器：錯誤情境不能開始 |
| `openProfileFromTopCard`、`buildAvGrid`、`btn-profile-ok`、變更頭像按鈕 | 可改 ID／身份圖案 → 換身份 | 角色設定唯讀，顯示 playerId；切換回大廳 | 中 | 瀏覽器：輸入框唯讀、按鈕隱藏 |
| `getAvatarByKey`、`getBaseAvatarDisplayName` | 內建 17 款（節奏遊戲網址） | 身份圖案讀 `assets/avatars/base/`（33 款），名稱來自 manifest | 低 | 瀏覽器：新款頭像圖片載入成功 |
| `isDisplayAvatarAllowed`、`validateDisplayAvatarForCurrentIdentity`、`equipDisplayAvatar` | 展示頭像解鎖、寫本機與 Firebase | 只允許身份頭像；不寫入 | 低 | 瀏覽器：無舊本機鍵 |
| `loadAvatarCatalog`、`loadUnlockedAvatars`、`unlockAvatar` | 讀寫解鎖 | 準備中（不寫） | 低 | 瀏覽器：頭像收藏顯示準備中 |
| `loadPlayerWalletBalance`、`getWalletDisplayText`、`openVcoinHistory`、`loadVcoinWalletStatus`、`loadVcoinHistory` | 讀 wallet／vCoinLogs | 「未開放」 | 低 | 瀏覽器：顯示未開放（不是 0） |
| `claimDailyVCoinsForTetris`、`claimTetrisDailyChallengeReward`、`runVcoinRewardsAfterGame` | 前端 transaction 改餘額 | 不發放，結算顯示「本場不發放 V幣」 | **高**（舊系統可任意改餘額）→ 本版完全不寫 | 瀏覽器：結算訊息；資料庫無變動 |
| 稱號：`loadEquippedTitleForCurrentPlayer`、`checkAndUnlockTetrisTitles`、`unlockTetrisTitle`、`equipSharedTitle`、`toggleTitleCollection`、`loadUnlockedTitlesByGame`、`loadTetrisUnlockedTitles`、`loadLeaderboardTitles` | 讀寫稱號 | 「準備中」，不解鎖 | 低 | 瀏覽器：稱號顯示準備中 |
| `gameOver`（3 行） | 最佳分數寫全裝置共用 `vtetris_best` | 依 playerId 分開（`bvUniverseGame_v1_…__localBest`） | 低；修正原版「同裝置玩家共用最高分」 | 瀏覽器：A 的最高分不出現在 B |
| `saveLB` | 寫舊榜、gameLogs、leaderboards | 送 Mock ScoreService（ScoreSubmission） | **高**（前端任意分數）→ 只進 Mock | 瀏覽器：Mock 1 筆、serverConfirmed:false |
| `loadLB` | 讀新舊排行榜 | Mock 排行榜（標示、名稱跳脫） | 修正舊榜 XSS | 瀏覽器：標示「測試排行榜」 |
| `getLocalBestScore`×2、`updateBestDisp` | 本機＋雲端最佳 | 本機依 playerId | 低 | 瀏覽器 |
| 管理後台入口（標題點 5 下）、`btn-adm-pin`、`loadAdminData`、`deleteEntry` | 前端密碼進後台、刪除紀錄、PIN 解鎖 | 停用 | 降低 | 瀏覽器：點 5 下不進入 |
| 啟動流程 | `initFirebase()`＋讀解鎖 | `UniverseTetris.wrapStartGame()`＋`boot()` | 低 | 瀏覽器 |
| 「🏠 遊戲選單」按鈕（執行時） | 導向 balloonv.com | 「回遊戲宇宙」→ `../../index.html` | 低 | 瀏覽器 |
| `startGame`（**不修改**） | 開局 | 外層包裝只記錄開局時間（`submissionId` 用） | 無 | 玩法等價測試 |

**沒有修改**：方塊表、棋盤、`valid`／`rotate`／`tryRotate`／`mLeft`／`mRight`／`mDown`／`hardDrop`／`lock`／`clearLines`、計分、`DIFF` 速度與每級行數、`loop`、繪圖、粒子、音效 `tone`／`noise`、BGM 播放器、手機按鈕與滑動、全螢幕、暫停、CSS、HTML 結構（全部由完整性測試鎖定）。

---

## B. 節奏遊戲（v0.2 預定）

檔案：`vparty-rhythm-game/index.html`（commit 9caa7dc）。`tools/beatmap-editor/`、`songs/`、`songs.json` **不修改、不複製**（原型以絕對網址讀取）。

| 函式 | 原本行為 | 預定修改 | 安全風險 | 回歸測試 |
|---|---|---|---|---|
| Firebase SDK、`FIREBASE_CONFIG`、`ensureFirebaseReady` | 匿名登入舊專案 | 換成 SDK；設定清空 | 低 | 零外部連線（YouTube 除外：影片背景本來就用） |
| `migrateLocalProfile`、`loadPlayerProfile`、`initProfile`、`hasConfirmedPlayerIdentityForHint` | 本機 vPartyPlayerProfile | `applyPlayerTo(PLAYER)`（playerId） | 中 | 身份顯示、重新整理 |
| `savePlayerProfile`、`_saveLocalProfile`、`img.onclick`、`isProfileIdentityDirty` | 角色設定改身份 | 唯讀角色設定；切換回大廳 | 中 | 按鈕隱藏、輸入唯讀 |
| `ensurePlayerProfile`、`validateDisplayAvatarForCurrentIdentity`、`_applyDisplayAvatar`、`equipDisplayAvatar` | 寫 profile | 不寫 | 低 | 資料庫無變動 |
| `loadAvatarCatalog`、`loadUnlockedAvatars`、`unlockAvatar`（`endGame` 內 xiaov_base、balloon_brother_02） | 前端解鎖 | 準備中 | 低 | 結算不寫解鎖 |
| `refreshProfileMetaInfo`、`readVcoinWalletStatus`、`readRhythmDailyChallengeHintStatus` | 讀 V幣 | 未開放 | 低 | 顯示未開放 |
| `claimDailyVCoinsForRhythm`、`claimRhythmDailyChallengeVCoins` | 前端 transaction | 不發放（後端 API 完成後改 `POST /v1/rewards/daily`） | **高** | 結算訊息 |
| 稱號：`loadSharedTitleCatalog`、`loadSharedRhythmTitleCatalog`、`loadEquippedTitleForCurrentPlayer`、`loadUnlockedTitlesByGame`、`renderSharedTitleCollection`、`equipSharedTitle`、`clearEquippedTitle`、`unlockRhythmTitle`、`canAutoEquipNewRhythmTitle`、`autoEquipRhythmTitleIfNeeded`、`checkAndUnlockRhythmTitles` | 讀寫稱號 | 準備中 | 低 | 稱號準備中 |
| `saveScore`（`endGame` 之後呼叫） | 本機 vPartyScores_*＋gameLogs／scores／leaderboards | Mock ScoreService：scoreData = songId、difficulty、score、grade、accuracy、maxCombo、perfect、good、miss | **高** → 只進 Mock | Mock 紀錄欄位正確；**判定與計分不變** |
| `renderLBFromFirebase`、`renderLBFromLocal`、`dedupeByPlayerKeyOrName`、`normalizeEntry` | 讀歌曲×難度排行榜 | Mock 排行榜（`getBoard({gameId:"rhythm", songId, difficulty})`） | 低 | 標示 Mock |
| `vparty_admin.html`、`admin-unlock.html`、`adminClearAll`、`adminDeleteScore`、`adminMigrateScores`、`checkAdminPw`… | 前端管理 | 不納入換殼版（未來共用管理後台） | 降低 | 管理入口不存在 |
| `endGame`、音符判定、`finishHold`、`addScore`、`G`、beatmap 讀取、SRT、影片 | 遊戲核心 | **不修改**（完整性測試鎖定） | — | 玩法等價：同一 beatmap、同一輸入時間序列 → 相同 perfect／good／miss／score／grade |

特別注意：節奏判定依賴時間；等價測試需用 Playwright 時鐘控制（`page.clock`）＋固定輸入時間表。

---

## C. 知識挑戰（v0.2 預定）

檔案：`vparty-quiz-game/main.js`、`index.html`（commit 93df14f）。**正式題庫 `quiz_questions.json` 不修改**（原型以相對路徑或絕對網址唯讀載入）。

| 函式 | 原本行為 | 預定修改 | 安全風險 | 回歸測試 |
|---|---|---|---|---|
| Firebase SDK、`FIREBASE_CONFIG`、`ensureFirebaseReady` | 匿名登入 | 換成 SDK | 低 | 零外部連線 |
| `loadPlayerLocal`、`savePlayerLocal`、`hasConfirmedQuizProfile`、`buildAvatarPicker`、`getIdentityChangeWarningText` | 本機 vquiz_*、建立身份 | SDK playerId；唯讀角色設定 | 中 | 身份顯示 |
| `ensurePlayerProfile`、`writePlayerProfileCurrent`、`buildCurrentProfilePayload` | 寫 profile | 不寫 | 低 | 資料庫無變動 |
| `ensureXiaovBaseCatalog`、`unlockXiaovBaseAfterGameComplete`、`loadAvatarCatalog`、`loadUnlockedAvatars` | 前端寫 avatarCatalog 與解鎖 | 準備中 | 降低（原本前端寫目錄） | 不寫入 |
| `loadQuestionOverrides` | 讀 quizQuestionOverrides | v0.2：不讀（使用正式題庫原樣）；未來改共用後端唯讀 API | 低：題目修正暫時不生效 → 需使用者確認 | 題目與答案和正式題庫一致 |
| `loadWalletBalance`、`claimDailyAnyGameReward`、`applyVCoinEarnTransaction`、`saveDailyChallengeCompletion`、`loadDailyChallengeStatus` | 前端 transaction 發 V幣 | 未開放 | **高** | 結算訊息 |
| `loadQuizTitleData`、`equipQuizTitle`、`unlockQuizBadgeAndTitle`、`checkAndUnlockQuizBadges`、`syncLeaderboardTitleSnapshot` | 稱號徽章 | 準備中 | 低 | 準備中 |
| `saveQuizResult`、`buildQuizRecord`、`saveGameLog`、`saveLocalLog` | 寫 gameLogs、本機紀錄 | Mock ScoreService（gradeBand、subject、score、correctCount、totalQuestions、maxCombo、accuracy、timeUsedTotal、usedQuestionIds、answers）；本機紀錄依 playerId | **高** | Mock 紀錄欄位 |
| `updateQuizProgress`、`makeSubjectProgressFromRecord`、`updateGradeLeaderboard`、`buildGradeRecordFromProgress`、`updateMainLeaderboardFromGrades`、`buildMainRecordFromGradeRecords` | 前端寫三層排行榜 | Mock：在 Mock 資料上以**相同函式**計算年級榜與主榜（函式本身不改） | 低 | 同一組成績 → 年級榜／主榜數字與原版函式相同 |
| `readGameLogsProgressRoot`、`filterLogsByCurrentPlayer`、`calculateQuizAcademyProgress` 等 | 讀整個 gameLogs/quiz | 只讀自己的 Mock 紀錄 | 修正（原本讀全部玩家） | 學院進度只含自己 |
| `renderLeaderboard` | 讀主榜／年級榜 | Mock 排行榜（low／middle／high／main 四個分頁照舊） | 低 | 標示 Mock |
| 管理：`getAdminPassword`、`loadAdminData`、`exportAdminLogsCsv`、`updateQuestionOverride`、`changeAdminPassword` | 前端管理 | 停用 | 降低 | 入口不存在 |
| `revealAnswerResult`、計時、選題、題型、`bindEvents` 等 | 遊戲核心 | **不修改** | — | 玩法等價：固定隨機種子與作答序列 → 題目順序、分數、連對相同 |

---

## 部署與驗收步驟（建議）

| 階段 | 內容 | 誰執行 | 影響正式環境 |
|---|---|---|---|
| 0（本版） | 盤點、SDK、方塊原型，Draft PR | Claude | 否 |
| 1 | 審閱並合併本 PR → GitHub Pages 出現測試網址 `…/balloon-v-universe/universe/tetris/?bvPlayerId=…` | 使用者 | 只新增測試網址；大廳入口不變；後端不變（PR 不含 backend/ 修改） |
| 2 | 實機驗收：用既有測試玩家（例如「測試甲＋boy1」）的 playerId 開啟原型，桌機＋手機各玩一場 | 使用者 | 只有 `GET /v1/players/:id`（唯讀） |
| 3 | 後端：WalletService（每日 +30）、ScoreService（pending／accepted）、LeaderboardService | 下一版 | 新增 API |
| 4 | 方塊原型改接正式 Score／Wallet API；節奏、問答換殼原型 | 下一版 | — |
| 5 | 三款驗收後，大廳正式入口才切換到換殼版；舊版保留一段時間 | 使用者決定 | 是 |

## 已知風險

1. **素材仍讀正式遊戲網址**：方塊圖片與 BGM、頭像以外的素材讀 `vashyang1120.github.io/vparty-tetris`、`/vparty-rhythm-game`（只讀）。正式 Repository 若刪改素材，原型會受影響。決定切換入口前要評估是否搬移素材。
2. **低信任身份**：知道 playerId（或 ID＋圖案）的人可以用那個身份玩、提報成績。正式成績與獎勵必須由後端驗證；消費需要另外授權。
3. **全域函式覆寫**：換殼依賴原版函式皆為全域。未來若正式版改成模組化，建置腳本會因「命中 0 次」而停止（這是保護，不會默默改錯）。
4. **Mock 只在分頁內**：測試者換分頁或關閉分頁，Mock 成績就消失（這是刻意的，避免被誤認為正式成績）。
5. **原版本身的問題**（不在本次修正範圍）：前端 V幣 transaction、寫死管理 PIN／預設密碼、排行榜 XSS、問答讀取全部 gameLogs（見 LEGACY-FIREBASE-PATHS.md）。
6. **今日挑戰 +10 的去留**尚未決定（見 DATA-CONTRACTS.md 2.2）。

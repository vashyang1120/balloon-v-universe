# 三款正式遊戲盤點（universe-game-migration-v0.1.0-foundation-test-1）

本次對三款正式遊戲**只讀**：沒有對任何正式遊戲 Repository 提交、沒有修改正式 GitHub Pages、沒有讀寫正式 Firebase。

| 遊戲 | Repository | 盤點 Commit（main） | 遊戲版本 | 主要程式 |
|---|---|---|---|---|
| 方塊派對 | vashyang1120/vparty-tetris | `7f3388562c35ca24572b3fb8cd861f7302f81509`（2026-06-16） | v1.3.7 | `index.html` 單檔 4,804 行（CSS＋HTML＋JS 內嵌） |
| 節奏遊戲 | vashyang1120/vparty-rhythm-game | `9caa7dcb669ccbe83feedcb85c6237d773ad9b31`（2026-06-26） | v2.6.4 | `index.html` 單檔 6,914 行；`songs.json`；`songs/song001…009/`；`tools/beatmap-editor/`；`vparty_admin.html`；`admin-unlock.html` |
| 知識挑戰 | vashyang1120/vparty-quiz-game | `93df14f2ca3e19f7ebd34309548df7f65aa84967`（2026-06-14） | quiz-v0.2.44 | `index.html`（520 行）＋`main.js`（4,878 行）＋`style.css`＋`quiz_questions.json`（720 題） |

逐函式的「舊系統功能對照表」（檔案、行號、函式、用途、讀取來源、寫入目的地、是否換殼、是否影響核心）見
[LEGACY-FUNCTION-MAP.md](LEGACY-FUNCTION-MAP.md)；舊 Firebase 路徑總表見 [LEGACY-FIREBASE-PATHS.md](LEGACY-FIREBASE-PATHS.md)。

重新產生對照表（遊戲更新後）：
```
python3 -I universe/tools/inventory/analyze.py <vparty-tetris>/index.html 1020 4802 tetris.json
python3 -I universe/tools/inventory/analyze.py <vparty-rhythm-game>/index.html 2251 6909 rhythm.json
python3 -I universe/tools/inventory/analyze.py <vparty-quiz-game>/main.js 1 4878 quiz.json
python3 -I universe/tools/inventory/build_tables.py tetris.json rhythm.json quiz.json universe/docs/LEGACY-FUNCTION-MAP.md
```
（行號範圍是內嵌 `<script>` 的位置；遊戲更新後請先確認。）

---

## 28 項盤點

| # | 項目 | 方塊派對 | 節奏遊戲 | 知識挑戰 |
|---|---|---|---|---|
| 1 | 主要入口 HTML | `index.html`（`test/` 內有測試版副本） | `index.html`；另有 `vparty_admin.html`、`admin-unlock.html` 兩個管理頁 | `index.html` 載入 `main.js?v=quiz-v0.2.44`、`style.css` |
| 2 | JavaScript 模組 | 單一內嵌 `<script>`（第 1019–4803 行），177 個具名函式，全部掛在全域 | 單一內嵌 `<script>`（第 2250–6910 行），236 個具名函式 | `main.js` 一個檔，252 個具名函式 |
| 3 | CSS | 內嵌 `<style>`（第 10–661 行） | 內嵌 `<style>` | `style.css`（1,230 行） |
| 4 | 遊戲主循環 | `loop()` 以 `requestAnimationFrame` 驅動；重力由 `dropAcc` 累積，`DIFF[diff]` 決定速度 | `requestAnimationFrame` 驅動的音符判定迴圈（`G` 狀態物件） | 回合制：`showQuestion` → 倒數計時（每題 15 秒）→ `revealAnswerResult` |
| 5 | 遊戲狀態管理 | 全域 `let board,cur,nxt,cx,cy,score,lines,level,combo,peakCombo,running,paused,diff…` | 全域 `G = mkG()`（score、combo、perf、good、miss、song、diff…） | 全域 `quizState`（questions、score、correctCount、combo、maxCombo、answers…） |
| 6 | 玩家身份建立 | `loadPlayer`／`savePlayerLocal`：ID＋身份頭像 → `playerKey = encodeFirebaseKeyPart(ID)+"__"+baseAvatarKey`；`ensurePlayerProfile` 寫 `players/{playerKey}/profile` | `loadPlayerProfile`／`savePlayerProfile`（本機 `vPartyPlayerProfile`）＋`ensurePlayerProfile` | `loadPlayerLocal`／`savePlayerLocal`（本機 `vquiz_*`）＋`ensurePlayerProfile`／`writePlayerProfileCurrent` |
| 7 | 玩家身份切換 | 角色設定頁改 ID 或身份頭像 →「確認身份」即成為另一個 playerKey（`btn-profile-ok`） | 角色設定頁同樣方式（`img.onclick`、`savePlayerProfile`） | `buildAvatarPicker`＋身份變更警告 `getIdentityChangeWarningText` |
| 8 | Firebase 初始化 | `ensureFirebaseReady`：compat SDK 9.23.0、`signInAnonymously`，專案 `vparty-rhythm-game` | 相同 | 相同（`main.js` 第 7 行起的 `FIREBASE_CONFIG`） |
| 9 | Firebase 資料讀取 | profile、unlockedAvatars、avatarCatalog、wallet、dailyRewards、dailyChallenges/tetris、titles、equippedTitle、leaderboards/tetris、tetris-balloon/leaderboard | profile、unlockedAvatars、avatarCatalog、sharedCatalogs/titles、wallet、dailyRewards、dailyChallenges/rhythm、leaderboards/rhythm、scores | profile、unlockedAvatars、avatarCatalog、quizQuestionOverrides、wallet、dailyRewards、dailyChallenges/quiz、quizProgress、quizAcademyProgress、quizTitles／quizBadges、leaderboards/quiz、整個 gameLogs/quiz |
| 10 | Firebase 資料寫入 | profile、unlockedAvatars、wallet、vCoinLogs、dailyRewards、dailyChallenges、titles、titleLogs、equippedTitle、gameLogs/tetris、leaderboards/tetris、tetris-balloon/leaderboard | profile、unlockedAvatars、wallet、vCoinLogs、dailyRewards、dailyChallenges、titles、titleLogs、equippedTitle、gameLogs/rhythm、scores（保留 300 筆）、leaderboards/rhythm | profile、avatarCatalog/xiaov_base、unlockedAvatars、wallet、vCoinLogs、dailyRewards、dailyChallenges、quizProgress、quizAcademyProgress、quizBadges／quizTitles、equippedTitle、gameLogs/quiz、leaderboards/quiz（byGrade／main）、quizQuestionOverrides（管理） |
| 11 | V幣讀取 | `loadPlayerWalletBalance`、`loadVcoinWalletStatus`、`loadVcoinHistory` | `refreshProfileMetaInfo`、`readVcoinWalletStatus` | `loadWalletBalance` |
| 12 | V幣發放 | 每日 +30（`claimDailyVCoinsForTetris`）＋方塊今日挑戰 +10（`claimTetrisDailyChallengeReward`） | 每日 +30（`claimDailyVCoinsForRhythm`）＋節奏今日挑戰 +10（完成任一首，`claimRhythmDailyChallengeVCoins`） | 每日 +30（`claimDailyAnyGameReward`）＋問答今日挑戰 +10（`saveDailyChallengeCompletion` → `applyVCoinEarnTransaction`） |
| 13 | V幣紀錄 | `players/{playerKey}/vCoinLogs/{pushKey}`（type、gameId、amount、dateKey、source、ts…） | 同左 | 同左（reason、amount、gameId、sourceLogId、dateKey） |
| 14 | 排行榜讀取 | `loadLB`：合併 `leaderboards/tetris` 與舊 `tetris-balloon/leaderboard`，以 ID||圖案 去重，取前 30 | `renderLBFromFirebase`：`leaderboards/rhythm/{songId}/{diff}`＋舊 `scores`；本機備援 `renderLBFromLocal` | `renderLeaderboard`：`leaderboards/quiz/main` 或 `leaderboards/quiz/byGrade/{grade}` |
| 15 | 排行榜寫入 | `saveLB`：舊榜 push、gameLogs push、`leaderboards/tetris/{playerKey}` 只保留最高分 | `saveScore`：gameLogs push、scores push（超過 300 筆刪最舊）、`leaderboards/rhythm/{songId}/{diff}/{playerKey}` 只保留最高分 | `updateGradeLeaderboard`、`updateMainLeaderboardFromGrades`（每次結算重算整筆） |
| 16 | 單場成績結算 | `gameOver()`：score、level、lines、difficulty、peakCombo；分數 = 消除 `round(100·n²·level·mult·(1+(combo−1)·0.5))`＋硬降 2 分／格 | `endGame()`：perfect 300／good 150（長按 120）、acc = (perf + good×0.5)/總數；等級 S≥95、A+≥88、A≥80、B≥68、C≥55、D≥40、其餘 E | 答對 100＋連對加分 min((combo−1)×10, 50)；每回合 10 題；`buildQuizRecord` |
| 17 | 歷史遊玩紀錄 | `gameLogs/tetris`（每場一筆）；本機只有全裝置共用的 `vtetris_best` | `gameLogs/rhythm`、`scores`；本機 `vPartyScores_{songId}`（前 20） | `gameLogs/quiz`；本機 `vquiz_localLogs`（最多 50 筆，全裝置共用） |
| 18 | 頭像選單 | `buildAvGrid`：內建 17 款（讀節奏遊戲 `assets/avatars/`） | 頭像網格（`img.onclick`），素材在本 Repository `assets/avatars/` | `buildAvatarPicker`（讀節奏遊戲素材） |
| 19 | 解鎖頭像 | 完成一場 → `xiaov_base`；≥2000 分 → `balloon_brother_01`（`unlockAvatar` 前端直接寫入） | 完成一場 → `xiaov_base`；等級 A 以上 → `balloon_brother_02` | 完成一場 → `xiaov_base`（並由前端寫入 `avatarCatalog/xiaov_base`） |
| 20 | 稱號收藏 | 5 個方塊稱號（初次堆疊者、方塊新星 1000、氣球堆疊師 2000、連消高手 combo3、高塔建築師 LV5） | 讀 `sharedCatalogs/titles/rhythm`（有內建備援）；自動裝備 | 問答徽章＋稱號（依科目／年級完成度） |
| 21 | localStorage | `vtetris_playerId/name/avKey/baseAvatarKey/displayAvatarKey/playerKey/best/best_{playerKey}/firstRun`、`vrhythm_name/avKey`（讀）、`vPartyPlayerProfile`、`vPartyProfile`、`vtetris_admin_pw` | `vPartyPlayerProfile`、`vPartyProfile`、`vPartyScores`、`vPartyScores_{songId}`、管理密碼 | `vquiz_playerId/playerKey/baseAvatarKey/displayAvatarKey/profileConfirmed/localLogs/soundEnabled`、`vtetris_*`／`vrhythm_*`（讀）、`vPartyPlayerProfile`、管理密碼 |
| 22 | 手機控制 | `#mob-ctrl`：← → 轉 下 落（click）＋畫布觸控滑動（`touchstart`） | 觸控軌道（`touchstart`／`pointerdown`） | 只需點選答案（按鈕），沒有額外手勢 |
| 23 | 全螢幕 | `#fs-btn` → `toggleFullscreen()`（`requestFullscreen`／`webkit`） | 有 | 有 |
| 24 | 音效及音樂 | 音效：WebAudio 合成（`tone`／`noise`，沒有音檔）；BGM：讀 `vparty-rhythm-game/songs.json` 與 `songs/*/audio.mp3` | 每首歌 `audio.mp3`＋WebAudio 判定音效 | WebAudio 音效（可關閉，`vquiz_soundEnabled`）＋歌曲 BGM（讀節奏遊戲 `songs.json`） |
| 25 | 資源路徑 | 圖片全部用絕對網址 `https://vashyang1120.github.io/vparty-tetris/assets/*.png`；頭像與歌曲用 `…/vparty-rhythm-game/…` | `songs.json` 內為相對路徑，`resolveAssetPath` 轉換；YouTube 影片背景 | 主持人圖片 `assets/hosts/`（相對）；頭像與歌曲讀節奏遊戲絕對網址 |
| 26 | iframe／跨頁 | `postMessage({type:'iframeHeight'}, '*')` 通知 balloonv.com 父頁面調整高度；「遊戲選單」按鈕 `window.top.location` → balloonv.com | `postMessage` 只用於 YouTube 播放器控制 | 無 postMessage；「遊戲選單」導向 balloonv.com |
| 27 | Firebase 錯誤恢復 | `ensureFirebaseReady` 失敗回傳 false；各功能顯示「暫時無法確認」，排行榜不寫；SDK 未載入時每 250ms 重試 20 次 | 成績先寫本機 `vPartyScores_*`，Firebase 在背景寫；失敗只記 console | 結算失敗時保留本機 `vquiz_localLogs`；各功能顯示錯誤提示 |
| 28 | 現有測試與版本 | 無自動化測試；`test/index.html`、`test/index-v1.3.7-mobile-controls-ui-test-1.html` 為手動測試副本；版本 v1.3.7 | 無自動化測試；`test/index.html`；`TEST_MODE`（寫入 `dev/` 路徑）；版本 v2.6.4 | 無自動化測試；`test/` 內完整測試副本；版本 quiz-v0.2.44 |

---

## 節奏遊戲特別檢查

| 項目 | 現況 | 換殼影響 |
|---|---|---|
| 歌曲目錄 | `songs.json`（9 首：id、title、artist、audioUrl、videoUrl、youtubeId、bpm、duration、beatmapUrl、srtUrl、lyrics） | 不變；方塊與問答也讀這份清單當 BGM |
| 歌曲音檔 | `songs/songNNN/audio.mp3` | 不變（不複製） |
| 字幕 | `songs/songNNN/subtitles.srt`（`loadSRT`／`parseSRT`），無檔案時用 `lyrics` | 不變 |
| beatmap | `songs/songNNN/beatmap.json` | 不變 |
| 節奏判定 | perfect／good／miss 視窗與分數（見第 16 項） | 不變；成績提交時原樣帶入 scoreData |
| 影片背景 | `video.mp4`（song001）或 YouTube embed | 不變 |
| 音樂編輯器 | `tools/beatmap-editor/index.html`：**不連 Firebase**，只下載 `beatmap.json` | 不修改（已驗收） |
| 歌曲成績 | `leaderboards/rhythm/{songId}/{diff}/{playerKey}` 最高分 | 改為 playerId（見資料契約） |
| 每日獎勵 | 每日 +30（共用）＋節奏今日挑戰 +10（完成任一首） | 改為後端帳本 API |
| 手機操作 | 觸控軌道 | 不變 |

## 知識挑戰特別檢查

| 項目 | 現況 | 換殼影響 |
|---|---|---|
| 題庫載入 | `fetch("./quiz_questions.json")`（720 題）＋ Firebase `quizQuestionOverrides`（管理修正） | 正式題庫不修改；overrides 未來由共用後端提供唯讀 API |
| 題型 | 四選一（`answerIndex`） | 不變 |
| 答題流程 | 選年級 → 選科目 → 10 題、每題 15 秒 → 結算 | 不變 |
| 年級 | low（小一～小二）、middle（小三～小四）、high（小五～小六） | 不變；ScoreSubmission 驗證只接受這三個值 |
| 科目 | math、mandarin、science、social、english、balloon… | 不變 |
| 計分 | 答對 100＋連對加分（上限 50） | 不變 |
| 排行榜 | 年級榜＝該年級各科最佳分數加總；主榜＝三個年級總分加總 | 規則原樣移到後端（見資料契約） |
| 稱號 | 徽章＋稱號（科目／年級完成度） | 共用稱號 API 完成前顯示「準備中」 |
| V幣 | 每日 +30＋問答今日挑戰 +10（依日期雜湊指定年級與科目） | 改為後端帳本 API |
| 全螢幕 | 有 | 不變 |
| 玩家資料卡 | `updatePlayerUI` | 資料來源改為 SDK |

---

## V幣來源總整理（目前正式版）

| 來源 | 金額 | 條件 | 防重複方式 | 寫入路徑（舊） | 問題 |
|---|---|---|---|---|---|
| 每日遊玩獎勵（三款共用） | +30 | 任一遊戲完成一場，每個台灣日期一次 | `players/{playerKey}/dailyRewards/{YYYYMMDD}.claimed` 在 transaction 中檢查 | `wallet/balance`、`dailyRewards/{date}`、`vCoinLogs` | 前端直接改餘額；換身份（新 playerKey）就能再領 |
| 方塊今日挑戰 | +10 | 依日期輪替 5 種任務之一（完成一場／500 分／消 5 行／LV2／連消 2） | `dailyChallenges/tetris/{date}.claimed` | 同上 | 前端判斷是否完成 |
| 節奏今日挑戰 | +10 | 完成任一首歌 | `dailyChallenges/rhythm/{date}.claimed` | 同上 | 同上 |
| 問答今日挑戰 | +10 | 完成當日指定年級＋科目 | `dailyChallenges/quiz/{date}`（含處理中鎖定） | 同上 | 同上 |

⚠ 舊系統的 V幣全部由**瀏覽器端 transaction 直接改寫 `wallet.balance`**。任何人打開開發者工具都能寫入任意餘額。
新系統必須由後端帳本處理（見 [DATA-CONTRACTS.md](DATA-CONTRACTS.md)），遊戲前端不得再改寫錢包。

## 場次資料欄位（給未來共用資料庫與管理匯出）

### 三款共用欄位

| 欄位 | 型別 | 來源 | 可能缺值 | 說明 |
|---|---|---|---|---|
| playerId | string（`p_`＋20 碼） | Universe SDK | 否 | 新系統唯一歸屬依據 |
| displayId | string | 後端 profile（快照） | 否 | 結算當下的 ID，顯示用 |
| baseAvatarKey | string | 後端 profile | 否 | 身份圖案 |
| displayAvatarKey | string | 後端 profile | 否 | 展示頭像（目前等於身份圖案） |
| gameId | `tetris`／`rhythm`／`quiz` | 遊戲 | 否 | |
| gameVersion | string | 遊戲 | 否 | 例：`tetris-v1.3.7+universe-v0.1.0-test-1` |
| submissionId | UUID | 遊戲（開局時產生） | 否 | 防止重複提交 |
| startedAt／finishedAt | ISO 時間 | 遊戲 | 舊資料只有 `ts`（結束時間） | |
| durationMs | number | 由上兩欄計算 | 舊資料缺 | |
| mode | `production`／`sandbox` | SDK | 否 | sandbox 資料不得進正式資料庫 |
| equippedTitleKey／Name／GameId | string | 舊系統快照 | 是（稱號未開放） | |
| recordStatus | `mock`／`pending`／`accepted`／`rejected` | 後端 | 否 | 客戶端回報 ≠ 伺服器確認 |

### 各遊戲專屬欄位

| 遊戲 | 欄位（型別） | 可能缺值 |
|---|---|---|
| 方塊派對 | score（int）、level（int ≥1）、lines（int）、difficulty（easy／normal／hard）、peakCombo（int） | 舊資料 peakCombo 可能缺；舊榜有 `avKey`、`name` 等舊欄位 |
| 節奏遊戲 | songId（`songNNN`）、song（標題）、difficulty（easy／normal／hard）、score、grade（S／A+／A／B／C／D／E）、accuracy（0–100 整數）、maxCombo、perfect、good、miss | 舊 gameLogs 沒有 perfect／good／miss 明細（只有 grade、acc、maxCombo） |
| 知識挑戰 | gradeBand（low／middle／high）、subject、score、correctCount、totalQuestions（10）、maxCombo、accuracy（0–1）、timeUsedTotal（秒）、usedQuestionIds（陣列）、answers（陣列） | 舊資料 difficulty 一律 null |

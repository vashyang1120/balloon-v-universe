# 舊系統功能對照表（自動盤點＋人工標註）

由 `universe/tools/inventory/analyze.py` 掃描三款遊戲正式版程式，找出每個具名函式的行範圍、
舊 Firebase 路徑（`.ref(...)`）、讀寫動作與 localStorage 鍵；「原本用途／是否影響核心／預定處理」為人工標註。

| 遊戲 | 正式版 Commit | 分析範圍 |
|---|---|---|
| 方塊派對 | vparty-tetris@7f3388562c35ca24572b3fb8cd861f7302f81509 | index.html 第 1020–4802 行（內嵌腳本） |
| 節奏遊戲 | vparty-rhythm-game@9caa7dcb669ccbe83feedcb85c6237d773ad9b31 | index.html 第 2251–6909 行（內嵌腳本） |
| 知識挑戰 | vparty-quiz-game@93df14f2ca3e19f7ebd34309548df7f65aa84967 | main.js 全檔 |

> 讀取來源／寫入目的地中的路徑為程式原文（例如 `DB_PATHS.players + '/' + pKey + '/profile'`）。
> 寫入動作：set／update／push／transaction／remove。transaction 代表前端直接改寫資料（例如 V幣餘額）。

## 方塊派對（共 177 個具名函式；玩家系統相關 44 個）

| 檔案 | 行 | 函式 | 原本用途 | 讀取來源 | 寫入目的地 | 換殼 | 影響遊戲核心 | 預定處理 |
|---|---|---|---|---|---|---|---|---|
| vparty-tetris/index.html | 1116–1142 | `loadAvatarCatalog` | 讀取學生／特殊頭像目錄 | Firebase DB_PATHS.avatarCatalog | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 1201–1242 | `ensurePlayerProfile` | 建立或讀取 players/{playerKey}/profile | Firebase DB_PATHS.players + '/' + pKey + '/profile' | Firebase(set) DB_PATHS.players + '/' + pKey + '/profile' | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-tetris/index.html | 1245–1259 | `loadUnlockedAvatars` | 讀取已解鎖展示頭像 | Firebase DB_PATHS.players + '/' + pKey + '/unlockedAvatars' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 1262–1293 | `unlockAvatar` | 前端直接寫入頭像解鎖 | — | Firebase(set) DB_PATHS.players + '/' + pKey + '/unlockedAvatars/' + avatarKey | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 1296–1333 | `equipDisplayAvatar` | 更換展示頭像（寫本機＋Firebase profile） | localStorage.getItem('vPartyPlayerProfile') | Firebase(update) DB_PATHS.players + '/' + pKey + '/profile'; localStorage.setItem('vPartyPlayerProfile'); localStorage.setItem('vPartyProfile') | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 1336–1340 | `isProfileIdentityDirty` | 判斷 ID／圖案是否變更（以 playerKey 比較） | — | — | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-tetris/index.html | 1395–1405 | `getLeaderboardIdentityKey` | 排行榜去重用的 ID\|\|圖案 鍵 | — | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-tetris/index.html | 1407–1409 | `normalizePlayerId` | ID 去空白，空白時預設「玩家」 | — | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-tetris/index.html | 1411–1418 | `encodeFirebaseKeyPart` | ID 轉 Firebase 安全鍵 | — | — | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-tetris/index.html | 1421–1423 | `makePlayerKey` | 舊身份鍵 = encode(ID)+'__'+圖案 | — | — | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-tetris/index.html | 1470–1490 | `loadPlayer` | 從本機讀 ID／圖案並組合 playerKey | localStorage.getItem("vrhythm_avKey"); localStorage.getItem("vrhythm_name"); localStorage.getItem("vtetris_avKey"); localStorage.getItem("vtetris_baseAvatarKey"); localStorage.getItem("vtetris_displayAvatarKey"); localStorage.getItem("vtetris_name"); localStorage.getItem("vtetris_playerId") | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-tetris/index.html | 1493–1511 | `savePlayerLocal` | 把身份寫入本機 vtetris_* | — | localStorage.setItem("vtetris_avKey"); localStorage.setItem("vtetris_baseAvatarKey"); localStorage.setItem("vtetris_displayAvatarKey"); localStorage.setItem("vtetris_name"); localStorage.setItem("vtetris_playerId"); localStorage.setItem("vtetris_playerKey") | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-tetris/index.html | 1543–1560 | `updateTopPlayerCard` | 右上角玩家卡（ID、稱號、V幣） | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-tetris/index.html | 1562–1570 | `updateProfileIdentityBox` | 角色設定頁顯示 playerKey | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-tetris/index.html | 1582–1612 | `loadPlayerWalletBalance` | 讀 players/{playerKey}/wallet/balance | Firebase DB_PATHS.players + '/' + playerKey + '/wallet/balance' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 1642–1684 | `loadEquippedTitleForCurrentPlayer` | 讀裝備稱號（含問答稱號備援） | Firebase basePath + '/equippedTitle'; Firebase basePath + '/quizEquippedTitle' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 1708–1716 | `syncProfilePreviewUI` | 角色設定頁預覽 | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-tetris/index.html | 1718–1741 | `openProfileFromTopCard` | 開啟角色設定頁並重新讀取資料 | — | — | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-tetris/index.html | 1752–1771 | `showScreen` | 切換畫面 | — | — | 否 | 否（畫面框架） | 保留（不涉及資料寫入） |
| vparty-tetris/index.html | 1857–2069 | `buildAvGrid` | 頭像選單；選擇後寫入本機與 Firebase profile | — | Firebase(update) DB_PATHS.players + "/" + PLAYER.playerKey + "/profile"; localStorage.setItem("vtetris_displayAvatarKey"); localStorage.setItem("vtetris_playerKey") | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-tetris/index.html | 2076–2103 | `goProfile` | 開始遊戲前：首次進入要求設定身份 | localStorage.getItem("vtetris_firstRun") | localStorage.setItem("vtetris_firstRun") | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-tetris/index.html | 2251–2341 | `loadVcoinHistory` | 讀 V幣餘額與 vCoinLogs | Firebase basePath + '/vCoinLogs'; Firebase basePath + '/wallet/balance' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 2418–2514 | `claimTetrisDailyChallengeReward` | 方塊今日挑戰 +10：前端 transaction 改餘額 | （transaction：同一路徑先讀後寫） | Firebase(push/transaction) DB_PATHS.players + '/' + playerKey; Firebase(push/transaction) DB_PATHS.players + '/' + playerKey + '/vCoinLogs' | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-tetris/index.html | 2574–2661 | `loadVcoinWalletStatus` | 讀餘額／今日獎勵／今日挑戰狀態 | Firebase basePath + '/dailyChallenges/tetris/' + yyyyMMdd; Firebase basePath + '/dailyRewards/' + yyyyMMdd; Firebase basePath + '/wallet/balance' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 2667–2672 | `refreshVcoinWalletStatus` | 重新讀取 V幣錢包狀態 | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 2729–2773 | `openVcoinHistory` | 顯示 V幣錢包面板 | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 2856–2890 | `showDiffSelect` | 選擇難度畫面（返回時顯示玩家預覽） | — | — | 否 | 否 | 保留（不涉及資料寫入） |
| vparty-tetris/index.html | 2976–3009 | `startGame` | 開始新的一局（遊戲中顯示玩家頭像） | — | — | 否 | 是（遊戲核心：保留原樣，原型以外層包裝記錄開局時間） | 保留（不涉及資料寫入） |
| vparty-tetris/index.html | 3363–3392 | `validateDisplayAvatarForCurrentIdentity` | 展示頭像不合法時改回身份頭像（寫本機＋Firebase） | — | Firebase(update) DB_PATHS.players + "/" + PLAYER.playerKey + "/profile"; localStorage.setItem("vtetris_avKey"); localStorage.setItem("vtetris_displayAvatarKey") | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 3494–3566 | `unlockTetrisTitle` | 前端 transaction 寫入稱號解鎖＋titleLogs | （transaction：同一路徑先讀後寫） | Firebase(push/transaction) basePath + '/equippedTitle'; Firebase(push/transaction) basePath + '/titleLogs'; Firebase(push/transaction) titlePath | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-tetris/index.html | 3622–3646 | `loadUnlockedTitlesByGame` | 讀 players/{playerKey}/titles/{gameId} | Firebase basePath + '/' + gameId | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 3652–3667 | `loadTetrisUnlockedTitles` | 讀方塊稱號 | Firebase DB_PATHS.players + '/' + playerKey + '/titles/tetris' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 3797–3829 | `equipSharedTitle` | 裝備稱號（寫 equippedTitle） | — | Firebase(set) DB_PATHS.players + '/' + playerKey + '/equippedTitle' | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 3859–3948 | `claimDailyVCoinsForTetris` | 每日 +30：前端 transaction 改 wallet.balance | （transaction：同一路徑先讀後寫） | Firebase(push/transaction) DB_PATHS.players + '/' + playerKey; Firebase(push/transaction) DB_PATHS.players + '/' + playerKey + '/vCoinLogs' | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-tetris/index.html | 3950–4012 | `gameOver` | 遊戲結束：解鎖、最佳分數、稱號、排行榜、V幣、結算畫面 | localStorage.getItem("vtetris_best") | localStorage.setItem("vtetris_best") | 是 | 結算（只換資料寫入，不改判定） | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-tetris/index.html | 4238–4280 | `saveLB` | 寫 tetris-balloon/leaderboard、gameLogs/tetris、leaderboards/tetris/{playerKey} | Firebase DB_PATHS.gameLogs; Firebase DB_PATHS.leaderboards + '/' + pk; Firebase DB_PATHS.legacyLeaderboard | Firebase(push/set) DB_PATHS.gameLogs; Firebase(push/set) DB_PATHS.leaderboards + '/' + pk; Firebase(push/set) DB_PATHS.legacyLeaderboard | 是 | 否 | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-tetris/index.html | 4283–4312 | `loadLeaderboardTitles` | 排行榜每列讀取裝備稱號 | Firebase basePath + '/equippedTitle'; Firebase basePath + '/quizEquippedTitle' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-tetris/index.html | 4314–4385 | `loadLB` | 讀新舊排行榜合併去重 | Firebase DB_PATHS.leaderboards; Firebase DB_PATHS.legacyLeaderboard | — | 是 | 否 | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-tetris/index.html | 4437–4439 | `getLocalBestScore` | 讀全裝置共用的 vtetris_best | localStorage.getItem("vtetris_best") | — | 是 | 否 | 本機暫存改為依 playerId 分開（bvUniverseGame_v1_…） |
| vparty-tetris/index.html | 4446–4448 | `getLocalBestScore` | 讀全裝置共用的 vtetris_best | localStorage.getItem("vtetris_best") | — | 是 | 否 | 本機暫存改為依 playerId 分開（bvUniverseGame_v1_…） |
| vparty-tetris/index.html | 4455–4509 | `updateBestDisp` | 讀雲端最佳分數（新舊排行榜） | Firebase DB_PATHS.leaderboards + '/' + PLAYER.playerKey; Firebase DB_PATHS.legacyLeaderboard; localStorage.getItem("vtetris_best_" + PLAYER.playerKey) | localStorage.setItem("vtetris_best_" + PLAYER.playerKey) | 是 | 否 | 本機暫存改為依 playerId 分開（bvUniverseGame_v1_…） |
| vparty-tetris/index.html | 4513–4513 | `getAdminPw` | 管理密碼（本機，預設寫在程式中） | localStorage.getItem(ADMIN_PW_KEY) | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-tetris/index.html | 4552–4609 | `loadAdminData` | 管理後台讀 gameLogs／排行榜 | Firebase DB_PATHS.gameLogs; Firebase DB_PATHS.legacyLeaderboard | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-tetris/index.html | 4662–4679 | `deleteEntry` | 管理後台刪除排行榜紀錄 | — | Firebase(remove) DB_PATHS.legacyLeaderboard+"/"+fbKey | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |

## 節奏遊戲（共 236 個具名函式；玩家系統相關 49 個）

| 檔案 | 行 | 函式 | 原本用途 | 讀取來源 | 寫入目的地 | 換殼 | 影響遊戲核心 | 預定處理 |
|---|---|---|---|---|---|---|---|---|
| vparty-rhythm-game/index.html | 2736–2749 | `loadAvatarCatalog` | 讀取學生／特殊頭像目錄 | Firebase 'avatarCatalog' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 2752–2754 | `normalizePlayerId` | ID 去空白，空白時預設「玩家」 | — | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-rhythm-game/index.html | 2756–2758 | `makePlayerKey` | 舊身份鍵 = encode(ID)+'__'+圖案 | — | — | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-rhythm-game/index.html | 2760–2767 | `encodeFirebaseKeyPart` | ID 轉 Firebase 安全鍵 | — | — | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-rhythm-game/index.html | 2792–2827 | `ensurePlayerProfile` | 建立或讀取 players/{playerKey}/profile | Firebase DB_PATHS.players + '/' + pKey + '/profile' | Firebase(set) DB_PATHS.players + '/' + pKey + '/profile' | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-rhythm-game/index.html | 2829–2843 | `loadUnlockedAvatars` | 讀取已解鎖展示頭像 | Firebase DB_PATHS.players + '/' + pKey + '/unlockedAvatars' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 2845–2875 | `unlockAvatar` | 前端直接寫入頭像解鎖 | — | Firebase(set) DB_PATHS.players + '/' + pKey + '/unlockedAvatars/' + avatarKey | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 2877–2914 | `equipDisplayAvatar` | 更換展示頭像（寫本機＋Firebase profile） | localStorage.getItem('vPartyPlayerProfile') | Firebase(update) DB_PATHS.players + '/' + pKey + '/profile'; localStorage.setItem('vPartyPlayerProfile'); localStorage.setItem('vPartyProfile') | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 2999–3015 | `migrateLocalProfile` | 舊 vPartyProfile 轉 vPartyPlayerProfile | localStorage.getItem('vPartyProfile') | localStorage.setItem('vPartyPlayerProfile') | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-rhythm-game/index.html | 3017–3032 | `loadPlayerProfile` | 從本機 vPartyPlayerProfile 讀身份 | localStorage.getItem('vPartyPlayerProfile') | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-rhythm-game/index.html | 3034–3091 | `savePlayerProfile` | 儲存身份（本機＋Firebase profile） | — | — | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-rhythm-game/index.html | 3094–3104 | `_saveLocalProfile` | 寫入本機 vPartyPlayerProfile／vPartyProfile | — | localStorage.setItem('vPartyPlayerProfile'); localStorage.setItem('vPartyProfile') | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-rhythm-game/index.html | 3106–3116 | `isProfileIdentityDirty` | 判斷 ID／圖案是否變更（以 playerKey 比較） | — | — | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-rhythm-game/index.html | 3148–3173 | `validateDisplayAvatarForCurrentIdentity` | 展示頭像不合法時改回身份頭像（寫本機＋Firebase） | — | Firebase(update) DB_PATHS.players + '/' + PLAYER.playerKey + '/profile' | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 3192–3200 | `updateProfileDataStatic` | 角色設定頁靜態資料 | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-rhythm-game/index.html | 3225–3254 | `refreshProfileMetaInfo` | 角色設定頁讀 V幣餘額 | Firebase DB_PATHS.players + '/' + pKey + '/wallet/balance' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 3312–3353 | `img.onclick` | 頭像選單點擊（切換身份圖案） | — | — | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-rhythm-game/index.html | 3478–3500 | `_applyDisplayAvatar` | 套用展示頭像並寫 Firebase profile | — | Firebase(update) DB_PATHS.players + '/' + pKey + '/profile' | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 3502–3531 | `initProfile` | 啟動時讀身份 | — | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-rhythm-game/index.html | 3679–3702 | `loadSharedTitleCatalog` | 讀 sharedCatalogs/titles | Firebase 'sharedCatalogs/titles' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 3704–3722 | `loadSharedRhythmTitleCatalog` | 讀 sharedCatalogs/titles/rhythm | Firebase 'sharedCatalogs/titles/rhythm' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 3779–3810 | `loadEquippedTitleForCurrentPlayer` | 讀裝備稱號（含問答稱號備援） | Firebase basePath + '/equippedTitle'; Firebase basePath + '/quizEquippedTitle' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 3811–3835 | `loadUnlockedTitlesByGame` | 讀 players/{playerKey}/titles/{gameId} | Firebase basePath + '/' + gameId | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 3906–3975 | `renderSharedTitleCollection` | 稱號收藏畫面 | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 3995–4039 | `equipSharedTitle` | 裝備稱號（寫 equippedTitle） | — | Firebase(set) DB_PATHS.players + '/' + playerKey + '/equippedTitle' | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 4040–4054 | `clearEquippedTitle` | 移除裝備稱號 | — | Firebase(remove) DB_PATHS.players + '/' + playerKey + '/equippedTitle' | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 4114–4165 | `unlockRhythmTitle` | 前端寫入節奏稱號＋titleLogs | Firebase DB_PATHS.players + '/' + playerKey + '/titleLogs'; Firebase titlePath | Firebase(push/set) DB_PATHS.players + '/' + playerKey + '/titleLogs'; Firebase(push/set) titlePath | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-rhythm-game/index.html | 4166–4179 | `canAutoEquipNewRhythmTitle` | 是否自動裝備新稱號 | Firebase basePath + '/equippedTitle'; Firebase basePath + '/quizEquippedTitle' | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-rhythm-game/index.html | 4180–4206 | `autoEquipRhythmTitleIfNeeded` | 自動裝備稱號（寫 equippedTitle） | — | Firebase(set) DB_PATHS.players + '/' + playerKey + '/equippedTitle' | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-rhythm-game/index.html | 4207–4232 | `checkAndUnlockRhythmTitles` | 依結算判斷節奏稱號 | — | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-rhythm-game/index.html | 4318–4365 | `readVcoinWalletStatus` | 讀餘額／每日獎勵／節奏今日挑戰 | Firebase basePath + '/dailyChallenges/rhythm/' + dateKey; Firebase basePath + '/dailyRewards/' + dateKey; Firebase basePath + '/wallet/balance' | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 4394–4400 | `hasConfirmedPlayerIdentityForHint` | 是否已確認身份（首頁提示用） | localStorage.getItem('vPartyPlayerProfile') | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-rhythm-game/index.html | 4401–4419 | `readRhythmDailyChallengeHintStatus` | 讀節奏今日挑戰狀態 | Firebase DB_PATHS.players + '/' + pKey + '/dailyChallenges/rhythm/' + dateKey | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-rhythm-game/index.html | 4867–4885 | `updateGamePlayerCard` | 遊戲中玩家卡 | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-rhythm-game/index.html | 5770–5830 | `claimDailyVCoinsForRhythm` | 每日 +30：前端 transaction 改餘額 | （transaction：同一路徑先讀後寫） | Firebase(push/transaction) DB_PATHS.players + '/' + pKey; Firebase(push/transaction) DB_PATHS.players + '/' + pKey + '/vCoinLogs' | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-rhythm-game/index.html | 5832–5909 | `claimRhythmDailyChallengeVCoins` | 節奏今日挑戰 +10：前端 transaction | （transaction：同一路徑先讀後寫） | Firebase(push/transaction) DB_PATHS.players + '/' + pKey; Firebase(push/transaction) DB_PATHS.players + '/' + pKey + '/vCoinLogs' | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-rhythm-game/index.html | 5959–6057 | `saveScore` | 本機 vPartyScores_{songId}＋gameLogs／scores／leaderboards/rhythm/{songId}/{diff}/{playerKey} | Firebase DB_PATHS.gameLogs; Firebase DB_PATHS.writeScores; Firebase DB_PATHS.writeScores + '/' + oldestKey; Firebase lbPath; localStorage.getItem(key) | Firebase(push/remove/set) DB_PATHS.gameLogs; Firebase(push/remove/set) DB_PATHS.writeScores; Firebase(push/remove/set) DB_PATHS.writeScores + '/' + oldestKey; Firebase(push/remove/set) lbPath; localStorage.setItem(key) | 是 | 否（結算後呼叫） | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-rhythm-game/index.html | 6118–6228 | `renderLBFromFirebase` | 讀歌曲×難度排行榜（含舊 scores） | Firebase DB_PATHS.leaderboardsBase + '/' + songId + '/' + d; Firebase DB_PATHS.leaderboardsBase + '/' + songId + '/' + lbMode; Firebase DB_PATHS.legacyScoresReadOnly; Firebase DB_PATHS.writeScores | — | 是 | 否 | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-rhythm-game/index.html | 6126–6150 | `normalizeEntry` | 整理排行榜資料 | — | — | 是 | 否 | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-rhythm-game/index.html | 6230–6241 | `_renderLBResult` | 排行榜畫面 | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-rhythm-game/index.html | 6264–6306 | `renderLBFromLocal` | 本機排行榜備援 | localStorage.getItem('vPartyScores'); localStorage.getItem('vPartyScores_' + songId) | — | 是 | 否 | 本機暫存改為依 playerId 分開（bvUniverseGame_v1_…） |
| vparty-rhythm-game/index.html | 6308–6323 | `dedupeByPlayerKeyOrName` | 排行榜去重（playerKey 或名字） | — | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-rhythm-game/index.html | 6372–6385 | `adminClearAll` | 管理：清空排行榜 | — | Firebase(remove) DB_PATHS.leaderboardsBase; Firebase(remove) DB_PATHS.writeScores; localStorage.removeItem('vPartyScores') | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-rhythm-game/index.html | 6388–6404 | `adminDeleteScore` | 管理：刪除單筆成績 | — | Firebase(remove) path | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-rhythm-game/index.html | 6407–6453 | `renderAdminPanel` | 管理面板讀 gameLogs／scores | Firebase DB_PATHS.gameLogs; Firebase DB_PATHS.legacyScoresReadOnly; Firebase DB_PATHS.writeScores | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-rhythm-game/index.html | 6521–6541 | `checkAdminPw` | 管理密碼檢查（本機） | localStorage.getItem(ADMIN_PW_KEY) | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-rhythm-game/index.html | 6549–6558 | `adminExportLB` | 管理：匯出本機排行榜 | localStorage.getItem('vPartyScores') | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-rhythm-game/index.html | 6561–6616 | `adminMigrateScores` | 管理：舊 scores 搬到 leaderboards | Firebase DB_PATHS.leaderboardsBase + '/' + k; Firebase DB_PATHS.legacyScoresReadOnly | Firebase(transaction) DB_PATHS.leaderboardsBase + '/' + k; Firebase(transaction) DB_PATHS.legacyScoresReadOnly | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-rhythm-game/index.html | 6618–6631 | `adminChangePw` | 管理：改本機密碼 | — | localStorage.setItem(ADMIN_PW_KEY) | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |

## 知識挑戰（共 252 個具名函式；玩家系統相關 61 個）

| 檔案 | 行 | 函式 | 原本用途 | 讀取來源 | 寫入目的地 | 換殼 | 影響遊戲核心 | 預定處理 |
|---|---|---|---|---|---|---|---|---|
| vparty-quiz-game/main.js | 950–952 | `normalizePlayerId` | ID 去空白，空白時預設「玩家」 | — | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-quiz-game/main.js | 954–961 | `encodeFirebaseKeyPart` | ID 轉 Firebase 安全鍵 | — | — | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-quiz-game/main.js | 963–965 | `makePlayerKey` | 舊身份鍵 = encode(ID)+'__'+圖案 | — | — | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-quiz-game/main.js | 1154–1176 | `loadAvatarCatalog` | 讀取學生／特殊頭像目錄 | Firebase DB_PATHS.avatarCatalog | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 1178–1193 | `loadUnlockedAvatars` | 讀取已解鎖展示頭像 | Firebase DB_PATHS.players + "/" + PLAYER.playerKey + "/unlockedAvatars" | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 1195–1247 | `ensurePlayerProfile` | 建立或讀取 players/{playerKey}/profile | Firebase DB_PATHS.players + "/" + PLAYER.playerKey + "/profile" | Firebase(set/update) DB_PATHS.players + "/" + PLAYER.playerKey + "/profile" | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-quiz-game/main.js | 1249–1273 | `loadPlayerLocal` | 從本機 vquiz_* 讀身份 | localStorage.getItem("vquiz_baseAvatarKey"); localStorage.getItem("vquiz_displayAvatarKey"); localStorage.getItem("vquiz_playerId"); localStorage.getItem("vrhythm_avKey"); localStorage.getItem("vrhythm_name"); localStorage.getItem("vtetris_avKey"); localStorage.getItem("vtetris_baseAvatarKey"); localStorage.getItem("vtetris_displayAvatarKey"); localStorage.getItem("vtetris_name"); localStorage.getItem("vtetris_playerId") | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-quiz-game/main.js | 1275–1299 | `savePlayerLocal` | 把身份寫入本機 vtetris_* | — | localStorage.setItem("vPartyPlayerProfile"); localStorage.setItem("vquiz_baseAvatarKey"); localStorage.setItem("vquiz_displayAvatarKey"); localStorage.setItem("vquiz_playerId"); localStorage.setItem("vquiz_playerKey"); localStorage.setItem("vquiz_profileConfirmed") | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-quiz-game/main.js | 1301–1306 | `hasConfirmedQuizProfile` | 是否已確認身份 | localStorage.getItem("vquiz_baseAvatarKey"); localStorage.getItem("vquiz_playerId"); localStorage.getItem("vquiz_playerKey"); localStorage.getItem("vquiz_profileConfirmed") | — | 是 | 否 | 改由 Universe SDK 取得（playerId 唯讀） |
| vparty-quiz-game/main.js | 1308–1322 | `buildCurrentProfilePayload` | 組 profile 寫入內容 | — | — | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-quiz-game/main.js | 1326–1339 | `writePlayerProfileCurrent` | 更新 players/{playerKey}/profile | Firebase DB_PATHS.players + "/" + PLAYER.playerKey + "/profile" | Firebase(update) DB_PATHS.players + "/" + PLAYER.playerKey + "/profile" | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-quiz-game/main.js | 1364–1367 | `getFriendlyIdentityLabel` | 身份顯示文字 | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-quiz-game/main.js | 1369–1385 | `updatePlayerUI` | 玩家資料卡 | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-quiz-game/main.js | 1449–1461 | `getIdentityChangeWarningText` | 變更身份警告 | — | — | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-quiz-game/main.js | 1469–1555 | `buildAvatarPicker` | 頭像選單（建立身份） | — | — | 是 | 否 | 身份唯讀：遊戲內不建立／不切換身份，切換回大廳 |
| vparty-quiz-game/main.js | 1564–1578 | `loadQuestionOverrides` | 讀 quizQuestionOverrides（題目修正） | Firebase DB_PATHS.questionOverrides | — | 是 | 否（題庫，不可修改正式題庫） | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2013–2059 | `buildQuizRecord` | 組單場答題紀錄 | — | — | 是 | 否 | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-quiz-game/main.js | 2061–2068 | `saveLocalLog` | 本機 vquiz_localLogs（最多 50 筆，全裝置共用） | localStorage.getItem("vquiz_localLogs") | localStorage.setItem("vquiz_localLogs") | 是 | 否 | 本機暫存改為依 playerId 分開（bvUniverseGame_v1_…） |
| vparty-quiz-game/main.js | 2070–2075 | `saveGameLog` | push gameLogs/quiz | — | Firebase(push) DB_PATHS.gameLogs | 是 | 否 | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-quiz-game/main.js | 2078–2119 | `ensureXiaovBaseCatalog` | 前端寫入 avatarCatalog/xiaov_base | Firebase "avatarCatalog/xiaov_base" | Firebase(set/update) "avatarCatalog/xiaov_base" | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-quiz-game/main.js | 2121–2152 | `unlockXiaovBaseAfterGameComplete` | 完成一場後解鎖小V頭像 | Firebase DB_PATHS.players + "/" + PLAYER.playerKey + "/unlockedAvatars/xiaov_base" | Firebase(set) DB_PATHS.players + "/" + PLAYER.playerKey + "/unlockedAvatars/xiaov_base" | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2222–2224 | `getDailyChallengeRef` | 問答今日挑戰路徑 | Firebase DB_PATHS.players + "/" + playerKey + "/dailyChallenges/" + DAILY_CHALLENGE_GAME_ID + "/" + dateKey | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2226–2253 | `loadDailyChallengeStatus` | 讀問答今日挑戰 | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 2255–2443 | `saveDailyChallengeCompletion` | 今日挑戰：鎖定＋+10 V幣（前端 transaction） | — | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2295–2310 | `alreadyClaimedResult` | 已領取結果 | — | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2312–2326 | `pendingResult` | 處理中結果 | — | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2592–2610 | `loadWalletBalance` | 讀 players/{playerKey}/wallet | Firebase DB_PATHS.players + "/" + playerKey + "/wallet" | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 2612–2654 | `applyVCoinEarnTransaction` | 前端 transaction 加 V幣＋寫 vCoinLogs | （transaction：同一路徑先讀後寫） | Firebase(push/transaction) DB_PATHS.players + "/" + playerKey + "/vCoinLogs"; Firebase(push/transaction) DB_PATHS.players + "/" + playerKey + "/wallet" | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2656–2713 | `claimDailyAnyGameReward` | 每日 +30（dailyRewards/{date}） | （transaction：同一路徑先讀後寫） | Firebase(transaction) DB_PATHS.players + "/" + playerKey + "/dailyRewards/" + dateKey | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2776–2795 | `syncLeaderboardTitleSnapshot` | 把裝備稱號寫進年級榜／主榜 | — | Firebase(push/update) DB_PATHS.leaderboardsByGrade + "/" + gradeBand + "/" + PLAYER.playerKey; Firebase(push/update) DB_PATHS.leaderboardsMain + "/" + PLAYER.playerKey | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2797–2826 | `loadQuizTitleData` | 讀稱號／徽章 | Firebase base + "/equippedTitle"; Firebase base + "/quizBadges"; Firebase base + "/quizEquippedTitle"; Firebase base + "/quizTitles" | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 2828–2858 | `equipQuizTitle` | 裝備問答稱號 | — | Firebase(set) DB_PATHS.players + "/" + PLAYER.playerKey + "/equippedTitle" | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 2904–2922 | `fallbackCompletedSubjectCount` | 讀 quizProgress 計算完成科目 | Firebase DB_PATHS.players + "/" + PLAYER.playerKey + "/quizProgress/" + gradeBand | — | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 2956–3007 | `unlockQuizBadgeAndTitle` | 前端寫入徽章與稱號 | Firebase base + "/quizBadges/" + def.badgeKey; Firebase base + "/quizTitles/" + def.titleKey | Firebase(push/set) base + "/quizBadges/" + def.badgeKey; Firebase(push/set) base + "/quizTitles/" + def.titleKey | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 3009–3050 | `checkAndUnlockQuizBadges` | 依進度判斷徽章／稱號 | — | Firebase(set) DB_PATHS.players + "/" + PLAYER.playerKey + "/equippedTitle" | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 3096–3276 | `saveQuizResult` | 結算後：本機紀錄、gameLogs、進度、年級榜、主榜、V幣、解鎖 | — | — | 是 | 結算（只換資料寫入，不改計分） | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-quiz-game/main.js | 3279–3329 | `makeSubjectProgressFromRecord` | 科目最佳紀錄規則（分數→答對→連對→時間→時間戳） | — | — | 是 | 否（排行榜規則，原樣保留到後端） | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 3331–3342 | `updateQuizProgress` | 寫 players/{playerKey}/quizProgress/{grade}/{subject} | Firebase path | Firebase(set) path | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 3368–3436 | `buildGradeRecordFromProgress` | 年級榜紀錄＝各科最佳分數加總 | — | — | 是 | 否（規則原樣保留） | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 3438–3450 | `updateGradeLeaderboard` | 寫 leaderboards/quiz/byGrade/{grade}/{playerKey} | Firebase DB_PATHS.leaderboardsByGrade + "/" + gradeBand + "/" + PLAYER.playerKey; Firebase DB_PATHS.players + "/" + PLAYER.playerKey + "/quizProgress/" + gradeBand | Firebase(set) DB_PATHS.leaderboardsByGrade + "/" + gradeBand + "/" + PLAYER.playerKey; Firebase(set) DB_PATHS.players + "/" + PLAYER.playerKey + "/quizProgress/" + gradeBand | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 3452–3515 | `buildMainRecordFromGradeRecords` | 主榜＝low＋middle＋high 年級總分加總 | — | — | 是 | 否（規則原樣保留） | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 3517–3534 | `updateMainLeaderboardFromGrades` | 寫 leaderboards/quiz/main/{playerKey} | Firebase DB_PATHS.leaderboardsByGrade + "/" + g.key + "/" + PLAYER.playerKey; Firebase DB_PATHS.leaderboardsMain + "/" + PLAYER.playerKey | Firebase(set) DB_PATHS.leaderboardsByGrade + "/" + g.key + "/" + PLAYER.playerKey; Firebase(set) DB_PATHS.leaderboardsMain + "/" + PLAYER.playerKey | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 3549–3556 | `readQuizProgressMap` | 讀 quizProgress | Firebase DB_PATHS.players + "/" + PLAYER.playerKey + "/quizProgress" | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 3558–3647 | `calculateQuizAcademyProgress` | 學院進度計算 | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 3656–3666 | `readStoredQuizAcademyProgress` | 讀 quizAcademyProgress | Firebase DB_PATHS.players + "/" + PLAYER.playerKey + "/quizAcademyProgress" | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 3697–3742 | `buildAcademyProgressFromGradeLeaderboards` | 由年級榜推算學院進度 | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 3744–3767 | `readGradeLeaderboardSelfSummary` | 讀自己的年級榜紀錄 | Firebase DB_PATHS.leaderboardsByGrade + "/" + g.key + "/" + PLAYER.playerKey | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 3770–3791 | `normalizeLogRecordForProgress` | 整理 gameLogs 給進度用 | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 3863–3870 | `filterLogsByCurrentPlayer` | 以 playerKey 篩選 gameLogs | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 3872–3894 | `readGameLogsProgressRoot` | 讀整個 gameLogs/quiz（全部玩家） | Firebase DB_PATHS.gameLogs | — | 是 | 否 | 移除（不再讀寫舊 Firebase） |
| vparty-quiz-game/main.js | 3945–3952 | `updateQuizAcademyProgress` | 寫 quizAcademyProgress | — | Firebase(set) DB_PATHS.players + "/" + PLAYER.playerKey + "/quizAcademyProgress" | 是 | 否 | 未來改接共用後端 API（伺服器驗證） |
| vparty-quiz-game/main.js | 4010–4023 | `refreshAcademyProgressCard` | 學院進度卡 | — | — | 是 | 否 | 改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED） |
| vparty-quiz-game/main.js | 4065–4088 | `renderLeaderboard` | 讀主榜／年級榜 | Firebase path | — | 是 | 否 | 改送 Mock ScoreService／LeaderboardService（明確標示測試） |
| vparty-quiz-game/main.js | 4100–4134 | `renderLeaderboardRows` | 排行榜畫面 | — | — | 是 | 否 | 保留畫面，資料來源改為 SDK |
| vparty-quiz-game/main.js | 4153–4155 | `getAdminPassword` | 管理密碼（本機） | localStorage.getItem(ADMIN_PW_KEY) | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-quiz-game/main.js | 4279–4305 | `loadAdminData` | 管理後台讀 gameLogs／排行榜 | Firebase DB_PATHS.gameLogs | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-quiz-game/main.js | 4307–4321 | `renderAdminStats` | 管理統計 | — | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-quiz-game/main.js | 4411–4440 | `exportAdminLogsCsv` | 管理：匯出 CSV | — | — | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-quiz-game/main.js | 4538–4557 | `updateQuestionOverride` | 管理：寫入題目修正 | — | Firebase(set) DB_PATHS.questionOverrides + "/" + questionId | 是 | 否（不可修改正式題庫） | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-quiz-game/main.js | 4596–4606 | `changeAdminPassword` | 管理：改本機密碼 | — | localStorage.setItem(ADMIN_PW_KEY) | 是 | 否 | 停用（舊管理功能移到未來的共用管理後台） |
| vparty-quiz-game/main.js | 4694–4837 | `bindEvents` | 綁定所有按鈕（含音效開關 vquiz_soundEnabled） | — | localStorage.setItem("vquiz_soundEnabled") | 否 | 否 | 保留（不涉及資料寫入） |


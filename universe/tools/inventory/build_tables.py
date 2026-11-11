#!/usr/bin/env python3
"""三款遊戲「舊系統功能對照表」產生器
用法：
  python3 -I analyze.py <檔案> <起> <迄> <遊戲>.json        # 先分析（見 docs/GAME-INVENTORY.md 的指令）
  python3 -I build_tables.py <tetris.json> <rhythm.json> <quiz.json> <輸出 .md>
欄位：檔案、行、函式、原本用途、讀取來源、寫入目的地、是否換殼、是否影響遊戲核心、預定處理
「讀取來源／寫入目的地」由 analyze.py 自動找出（Firebase .ref() 路徑、localStorage 鍵）；用途與處理方式為人工標註。
"""
import json
import sys

# 預定處理代碼
P = {
    "SDK": "改由 Universe SDK 取得（playerId 唯讀）",
    "RM": "移除（不再讀寫舊 Firebase）",
    "NI": "改為「未開放／準備中」（共用 API 尚未完成，NOT_IMPLEMENTED）",
    "MOCK": "改送 Mock ScoreService／LeaderboardService（明確標示測試）",
    "API": "未來改接共用後端 API（伺服器驗證）",
    "LOCK": "身份唯讀：遊戲內不建立／不切換身份，切換回大廳",
    "SCOPE": "本機暫存改為依 playerId 分開（bvUniverseGame_v1_…）",
    "ADMIN": "停用（舊管理功能移到未來的共用管理後台）",
    "KEEP": "保留（不涉及資料寫入）",
    "UI": "保留畫面，資料來源改為 SDK",
}

# name: (原本用途, 處理代碼, 是否影響核心)
T = {
    "loadAvatarCatalog": ("讀取學生／特殊頭像目錄", "NI", "否"),
    "ensureFirebaseReady": ("初始化舊 Firebase＋匿名登入", "RM", "否"),
    "ensurePlayerProfile": ("建立或讀取 players/{playerKey}/profile", "SDK", "否"),
    "loadUnlockedAvatars": ("讀取已解鎖展示頭像", "NI", "否"),
    "unlockAvatar": ("前端直接寫入頭像解鎖", "NI", "否"),
    "equipDisplayAvatar": ("更換展示頭像（寫本機＋Firebase profile）", "NI", "否"),
    "isProfileIdentityDirty": ("判斷 ID／圖案是否變更（以 playerKey 比較）", "LOCK", "否"),
    "getLeaderboardIdentityKey": ("排行榜去重用的 ID||圖案 鍵", "API", "否"),
    "normalizePlayerId": ("ID 去空白，空白時預設「玩家」", "SDK", "否"),
    "encodeFirebaseKeyPart": ("ID 轉 Firebase 安全鍵", "RM", "否"),
    "makePlayerKey": ("舊身份鍵 = encode(ID)+'__'+圖案", "RM", "否"),
    "resolveAvatarSrc": ("相對頭像路徑轉節奏遊戲網址", "SDK", "否"),
    "getAvatarByKey": ("由 key 找頭像圖片（內建 17 款＋解鎖＋目錄）", "SDK", "否"),
    "loadPlayer": ("從本機讀 ID／圖案並組合 playerKey", "SDK", "否"),
    "savePlayerLocal": ("把身份寫入本機 vtetris_*", "LOCK", "否"),
    "savePlayer": ("寫本機＋同步 Firebase profile", "LOCK", "否"),
    "getBaseAvatarDisplayName": ("身份圖案顯示名稱", "UI", "否"),
    "getWalletDisplayText": ("V幣餘額文字", "NI", "否"),
    "updateProfileIdentityBox": ("角色設定頁顯示 playerKey", "UI", "否"),
    "loadPlayerWalletBalance": ("讀 players/{playerKey}/wallet/balance", "NI", "否"),
    "loadEquippedTitleForCurrentPlayer": ("讀裝備稱號（含問答稱號備援）", "NI", "否"),
    "openProfileFromTopCard": ("開啟角色設定頁並重新讀取資料", "LOCK", "否"),
    "buildAvGrid": ("頭像選單；選擇後寫入本機與 Firebase profile", "LOCK", "否"),
    "goProfile": ("開始遊戲前：首次進入要求設定身份", "LOCK", "否"),
    "loadVcoinHistory": ("讀 V幣餘額與 vCoinLogs", "NI", "否"),
    "claimTetrisDailyChallengeReward": ("方塊今日挑戰 +10：前端 transaction 改餘額", "API", "否"),
    "runVcoinRewardsAfterGame": ("結算後依序領每日 +30 與今日挑戰", "API", "否"),
    "loadVcoinWalletStatus": ("讀餘額／今日獎勵／今日挑戰狀態", "NI", "否"),
    "openVcoinHistory": ("顯示 V幣錢包面板", "NI", "否"),
    "isDisplayAvatarAllowed": ("展示頭像是否已解鎖", "NI", "否"),
    "validateDisplayAvatarForCurrentIdentity": ("展示頭像不合法時改回身份頭像（寫本機＋Firebase）", "NI", "否"),
    "unlockTetrisTitle": ("前端 transaction 寫入稱號解鎖＋titleLogs", "API", "否"),
    "checkAndUnlockTetrisTitles": ("依本場成績判斷稱號條件並解鎖", "API", "否"),
    "loadUnlockedTitlesByGame": ("讀 players/{playerKey}/titles/{gameId}", "NI", "否"),
    "loadTetrisUnlockedTitles": ("讀方塊稱號", "NI", "否"),
    "toggleTitleCollection": ("稱號收藏面板", "NI", "否"),
    "equipSharedTitle": ("裝備稱號（寫 equippedTitle）", "NI", "否"),
    "claimDailyVCoinsForTetris": ("每日 +30：前端 transaction 改 wallet.balance", "API", "否"),
    "gameOver": ("遊戲結束：解鎖、最佳分數、稱號、排行榜、V幣、結算畫面", "MOCK", "結算（只換資料寫入，不改判定）"),
    "saveLB": ("寫 tetris-balloon/leaderboard、gameLogs/tetris、leaderboards/tetris/{playerKey}", "MOCK", "否"),
    "loadLeaderboardTitles": ("排行榜每列讀取裝備稱號", "NI", "否"),
    "loadLB": ("讀新舊排行榜合併去重", "MOCK", "否"),
    "getLocalBestScore": ("讀全裝置共用的 vtetris_best", "SCOPE", "否"),
    "updateBestDisp": ("讀雲端最佳分數（新舊排行榜）", "SCOPE", "否"),
    "getAdminPw": ("管理密碼（本機，預設寫在程式中）", "ADMIN", "否"),
    "loadAdminData": ("管理後台讀 gameLogs／排行榜", "ADMIN", "否"),
    "deleteEntry": ("管理後台刪除排行榜紀錄", "ADMIN", "否"),
    "renderAdminList": ("管理後台列表", "ADMIN", "否"),
    "updateTopPlayerCard": ("右上角玩家卡（ID、稱號、V幣）", "UI", "否"),
    "syncProfilePreviewUI": ("角色設定頁預覽", "UI", "否"),
    "updateProfileWalletBox": ("角色設定頁 V幣", "NI", "否"),
    "updateProfileTitleBox": ("角色設定頁稱號", "NI", "否"),
    "getCurrentDisplayAvatarKey": ("目前展示頭像 key", "UI", "否"),
    "showScreen": ("切換畫面", "KEEP", "否（畫面框架）"),
    "toggleFullscreen": ("全螢幕", "KEEP", "否"),
    "getCurrentEquippedTitleSnapshot": ("成績附帶的稱號快照", "NI", "否"),
    "normalizeEquippedTitleData": ("整理稱號資料格式", "NI", "否"),
    "setLastKnownVcoinBalance": ("記住最後一次 V幣餘額", "NI", "否"),
    "getLastKnownVcoinBalance": ("讀最後一次 V幣餘額", "NI", "否"),
    "getCurrentDisplayedVcoinBalanceFallback": ("V幣備援顯示值", "NI", "否"),
    "loadSongs": ("讀節奏遊戲 songs.json 當 BGM", "KEEP", "否（音樂）"),
    "loadSong": ("載入 BGM 歌曲", "KEEP", "否（音樂）"),
    "updateSongList": ("BGM 歌單", "KEEP", "否（音樂）"),
    "isTitleGridVisible": ("稱號面板是否開啟", "KEEP", "否"),
    "escapeHtml": ("HTML 跳脫", "KEEP", "否"),
    "refreshVcoinWalletStatus": ("重新讀取 V幣錢包狀態", "NI", "否"),
    "showDiffSelect": ("選擇難度畫面（返回時顯示玩家預覽）", "KEEP", "否"),
    "startGame": ("開始新的一局（遊戲中顯示玩家頭像）", "KEEP", "是（遊戲核心：保留原樣，原型以外層包裝記錄開局時間）"),
    # ---------- 節奏 ----------
    "migrateLocalProfile": ("舊 vPartyProfile 轉 vPartyPlayerProfile", "RM", "否"),
    "loadPlayerProfile": ("從本機 vPartyPlayerProfile 讀身份", "SDK", "否"),
    "savePlayerProfile": ("儲存身份（本機＋Firebase profile）", "LOCK", "否"),
    "_saveLocalProfile": ("寫入本機 vPartyPlayerProfile／vPartyProfile", "LOCK", "否"),
    "updateProfileDataStatic": ("角色設定頁靜態資料", "UI", "否"),
    "refreshProfileMetaInfo": ("角色設定頁讀 V幣餘額", "NI", "否"),
    "img.onclick": ("頭像選單點擊（切換身份圖案）", "LOCK", "否"),
    "_applyDisplayAvatar": ("套用展示頭像並寫 Firebase profile", "NI", "否"),
    "initProfile": ("啟動時讀身份", "SDK", "否"),
    "loadSharedTitleCatalog": ("讀 sharedCatalogs/titles", "NI", "否"),
    "loadSharedRhythmTitleCatalog": ("讀 sharedCatalogs/titles/rhythm", "NI", "否"),
    "renderSharedTitleCollection": ("稱號收藏畫面", "NI", "否"),
    "clearEquippedTitle": ("移除裝備稱號", "NI", "否"),
    "unlockRhythmTitle": ("前端寫入節奏稱號＋titleLogs", "API", "否"),
    "canAutoEquipNewRhythmTitle": ("是否自動裝備新稱號", "API", "否"),
    "autoEquipRhythmTitleIfNeeded": ("自動裝備稱號（寫 equippedTitle）", "API", "否"),
    "checkAndUnlockRhythmTitles": ("依結算判斷節奏稱號", "API", "否"),
    "readVcoinWalletStatus": ("讀餘額／每日獎勵／節奏今日挑戰", "NI", "否"),
    "hasConfirmedPlayerIdentityForHint": ("是否已確認身份（首頁提示用）", "SDK", "否"),
    "readRhythmDailyChallengeHintStatus": ("讀節奏今日挑戰狀態", "NI", "否"),
    "updateGamePlayerCard": ("遊戲中玩家卡", "UI", "否"),
    "claimDailyVCoinsForRhythm": ("每日 +30：前端 transaction 改餘額", "API", "否"),
    "claimRhythmDailyChallengeVCoins": ("節奏今日挑戰 +10：前端 transaction", "API", "否"),
    "saveScore": ("本機 vPartyScores_{songId}＋gameLogs／scores／leaderboards/rhythm/{songId}/{diff}/{playerKey}", "MOCK", "否（結算後呼叫）"),
    "renderLBFromFirebase": ("讀歌曲×難度排行榜（含舊 scores）", "MOCK", "否"),
    "normalizeEntry": ("整理排行榜資料", "MOCK", "否"),
    "_renderLBResult": ("排行榜畫面", "UI", "否"),
    "renderLBFromLocal": ("本機排行榜備援", "SCOPE", "否"),
    "dedupeByPlayerKeyOrName": ("排行榜去重（playerKey 或名字）", "API", "否"),
    "adminClearAll": ("管理：清空排行榜", "ADMIN", "否"),
    "adminDeleteScore": ("管理：刪除單筆成績", "ADMIN", "否"),
    "renderAdminPanel": ("管理面板讀 gameLogs／scores", "ADMIN", "否"),
    "checkAdminPw": ("管理密碼檢查（本機）", "ADMIN", "否"),
    "adminExportLB": ("管理：匯出本機排行榜", "ADMIN", "否"),
    "adminMigrateScores": ("管理：舊 scores 搬到 leaderboards", "ADMIN", "否"),
    "adminChangePw": ("管理：改本機密碼", "ADMIN", "否"),
    # ---------- 問答 ----------
    "loadPlayerLocal": ("從本機 vquiz_* 讀身份", "SDK", "否"),
    "hasConfirmedQuizProfile": ("是否已確認身份", "SDK", "否"),
    "buildCurrentProfilePayload": ("組 profile 寫入內容", "RM", "否"),
    "writePlayerProfileCurrent": ("更新 players/{playerKey}/profile", "RM", "否"),
    "getFriendlyIdentityLabel": ("身份顯示文字", "UI", "否"),
    "updatePlayerUI": ("玩家資料卡", "UI", "否"),
    "getIdentityChangeWarningText": ("變更身份警告", "LOCK", "否"),
    "buildAvatarPicker": ("頭像選單（建立身份）", "LOCK", "否"),
    "loadQuestionOverrides": ("讀 quizQuestionOverrides（題目修正）", "API", "否（題庫，不可修改正式題庫）"),
    "buildQuizRecord": ("組單場答題紀錄", "MOCK", "否"),
    "saveLocalLog": ("本機 vquiz_localLogs（最多 50 筆，全裝置共用）", "SCOPE", "否"),
    "saveGameLog": ("push gameLogs/quiz", "MOCK", "否"),
    "ensureXiaovBaseCatalog": ("前端寫入 avatarCatalog/xiaov_base", "RM", "否"),
    "unlockXiaovBaseAfterGameComplete": ("完成一場後解鎖小V頭像", "API", "否"),
    "getDailyChallengeRef": ("問答今日挑戰路徑", "API", "否"),
    "loadDailyChallengeStatus": ("讀問答今日挑戰", "NI", "否"),
    "saveDailyChallengeCompletion": ("今日挑戰：鎖定＋+10 V幣（前端 transaction）", "API", "否"),
    "alreadyClaimedResult": ("已領取結果", "API", "否"),
    "pendingResult": ("處理中結果", "API", "否"),
    "loadWalletBalance": ("讀 players/{playerKey}/wallet", "NI", "否"),
    "applyVCoinEarnTransaction": ("前端 transaction 加 V幣＋寫 vCoinLogs", "API", "否"),
    "claimDailyAnyGameReward": ("每日 +30（dailyRewards/{date}）", "API", "否"),
    "syncLeaderboardTitleSnapshot": ("把裝備稱號寫進年級榜／主榜", "API", "否"),
    "loadQuizTitleData": ("讀稱號／徽章", "NI", "否"),
    "equipQuizTitle": ("裝備問答稱號", "NI", "否"),
    "fallbackCompletedSubjectCount": ("讀 quizProgress 計算完成科目", "API", "否"),
    "unlockQuizBadgeAndTitle": ("前端寫入徽章與稱號", "API", "否"),
    "checkAndUnlockQuizBadges": ("依進度判斷徽章／稱號", "API", "否"),
    "saveQuizResult": ("結算後：本機紀錄、gameLogs、進度、年級榜、主榜、V幣、解鎖", "MOCK", "結算（只換資料寫入，不改計分）"),
    "makeSubjectProgressFromRecord": ("科目最佳紀錄規則（分數→答對→連對→時間→時間戳）", "API", "否（排行榜規則，原樣保留到後端）"),
    "updateQuizProgress": ("寫 players/{playerKey}/quizProgress/{grade}/{subject}", "API", "否"),
    "buildGradeRecordFromProgress": ("年級榜紀錄＝各科最佳分數加總", "API", "否（規則原樣保留）"),
    "updateGradeLeaderboard": ("寫 leaderboards/quiz/byGrade/{grade}/{playerKey}", "API", "否"),
    "buildMainRecordFromGradeRecords": ("主榜＝low＋middle＋high 年級總分加總", "API", "否（規則原樣保留）"),
    "updateMainLeaderboardFromGrades": ("寫 leaderboards/quiz/main/{playerKey}", "API", "否"),
    "readQuizProgressMap": ("讀 quizProgress", "NI", "否"),
    "calculateQuizAcademyProgress": ("學院進度計算", "NI", "否"),
    "readStoredQuizAcademyProgress": ("讀 quizAcademyProgress", "NI", "否"),
    "buildAcademyProgressFromGradeLeaderboards": ("由年級榜推算學院進度", "NI", "否"),
    "readGradeLeaderboardSelfSummary": ("讀自己的年級榜紀錄", "NI", "否"),
    "normalizeLogRecordForProgress": ("整理 gameLogs 給進度用", "NI", "否"),
    "filterLogsByCurrentPlayer": ("以 playerKey 篩選 gameLogs", "NI", "否"),
    "readGameLogsProgressRoot": ("讀整個 gameLogs/quiz（全部玩家）", "RM", "否"),
    "updateQuizAcademyProgress": ("寫 quizAcademyProgress", "API", "否"),
    "refreshAcademyProgressCard": ("學院進度卡", "NI", "否"),
    "renderLeaderboard": ("讀主榜／年級榜", "MOCK", "否"),
    "renderLeaderboardRows": ("排行榜畫面", "UI", "否"),
    "getAdminPassword": ("管理密碼（本機）", "ADMIN", "否"),
    "renderAdminStats": ("管理統計", "ADMIN", "否"),
    "exportAdminLogsCsv": ("管理：匯出 CSV", "ADMIN", "否"),
    "updateQuestionOverride": ("管理：寫入題目修正", "ADMIN", "否（不可修改正式題庫）"),
    "changeAdminPassword": ("管理：改本機密碼", "ADMIN", "否"),
    "bindEvents": ("綁定所有按鈕（含音效開關 vquiz_soundEnabled）", "KEEP", "否"),
}

FILES = {"tetris": "vparty-tetris/index.html", "rhythm": "vparty-rhythm-game/index.html", "quiz": "vparty-quiz-game/main.js"}
NAMES = {"tetris": "方塊派對", "rhythm": "節奏遊戲", "quiz": "知識挑戰"}


def cell(x):
    return str(x).replace("|", "\\|").replace("\n", " ")


def rows_for(game, data):
    out = []
    for f in data["functions"]:
        relevant = f["refs"] or f["writes"] or f["ls"] or "identity" in f["kw"]
        if not relevant:
            continue
        purpose, plan, core = T.get(f["name"], ("（自動盤點：與玩家／資料相關）", "UI", "否"))
        fb_reads = list(f["refs"]) if (f.get("reads", 0) > 0 or not f["writes"]) else []
        fb_writes = f["refs"] if f["writes"] else []
        ls_get = [x for x in f["ls"] if x.startswith("getItem")]
        ls_set = [x for x in f["ls"] if not x.startswith("getItem")]
        reads = "; ".join(["Firebase " + r for r in fb_reads] + ["localStorage." + x for x in ls_get]) or "—"
        writes = "; ".join([f"Firebase({'/'.join(f['writes'])}) {r}" for r in fb_writes] + ["localStorage." + x for x in ls_set]) or "—"
        if fb_writes and not fb_reads and "transaction" in f["writes"]:
            reads = "（transaction：同一路徑先讀後寫）"
        migrate = "是" if plan not in ("KEEP",) else "否"
        out.append(f"| {FILES[game]} | {f['start']}–{f['end']} | `{cell(f['name'])}` | {cell(purpose)} | {cell(reads)} | {cell(writes)} | {migrate} | {cell(core)} | {cell(P[plan])} |")
    return out


def main():
    paths = dict(zip(["tetris", "rhythm", "quiz"], sys.argv[1:4]))
    out_path = sys.argv[4]
    md = ["# 舊系統功能對照表（自動盤點＋人工標註）", "",
          "由 `universe/tools/inventory/analyze.py` 掃描三款遊戲正式版程式，找出每個具名函式的行範圍、",
          "舊 Firebase 路徑（`.ref(...)`）、讀寫動作與 localStorage 鍵；「原本用途／是否影響核心／預定處理」為人工標註。", "",
          "| 遊戲 | 正式版 Commit | 分析範圍 |", "|---|---|---|",
          "| 方塊派對 | vparty-tetris@7f3388562c35ca24572b3fb8cd861f7302f81509 | index.html 第 1020–4802 行（內嵌腳本） |",
          "| 節奏遊戲 | vparty-rhythm-game@9caa7dcb669ccbe83feedcb85c6237d773ad9b31 | index.html 第 2251–6909 行（內嵌腳本） |",
          "| 知識挑戰 | vparty-quiz-game@93df14f2ca3e19f7ebd34309548df7f65aa84967 | main.js 全檔 |", "",
          "> 讀取來源／寫入目的地中的路徑為程式原文（例如 `DB_PATHS.players + '/' + pKey + '/profile'`）。",
          "> 寫入動作：set／update／push／transaction／remove。transaction 代表前端直接改寫資料（例如 V幣餘額）。", ""]
    for g in ["tetris", "rhythm", "quiz"]:
        data = json.load(open(paths[g], encoding="utf-8"))
        rows = rows_for(g, data)
        md += [f"## {NAMES[g]}（共 {data['totalFunctions']} 個具名函式；玩家系統相關 {len(rows)} 個）", "",
               "| 檔案 | 行 | 函式 | 原本用途 | 讀取來源 | 寫入目的地 | 換殼 | 影響遊戲核心 | 預定處理 |",
               "|---|---|---|---|---|---|---|---|---|"] + rows + [""]
    open(out_path, "w", encoding="utf-8").write("\n".join(md) + "\n")
    print("written", out_path)


main()

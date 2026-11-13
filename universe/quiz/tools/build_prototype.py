#!/usr/bin/env python3
"""由正式版 vparty-quiz-game（index.html、main.js、style.css）產生「知識挑戰宇宙版」universe/quiz/

用法（repository 根目錄）：
  python3 -I universe/quiz/tools/build_prototype.py <vparty-quiz-game 唯讀 clone> universe/quiz

保留（tests/quiz-core-integrity.test.mjs 以 SHA-256 驗證）：
  正式題庫（由原版網址唯讀載入）、題型、出題與選項順序規則、15 秒倒數、答題判定、計分、連續答對（combo）、
  年級／科目分類、結算、手機操作、V學園成績單等教育功能、年級榜與總榜的計算函式
  （makeSubjectProgressFromRecord、shouldUpdateBestRecord、buildGradeRecordFromProgress、
   buildMainRecordFromGradeRecords、compareMainRows、compareGradeRows、calculateQuizAcademyProgress…）。
只替換玩家資料層：身份、舊 Firebase、V幣、稱號／徽章、頭像解鎖、成績與排行榜的「儲存位置」（改為 Mock）、管理後台。
題目修正（quizQuestionOverrides）：原版只存在舊 Firebase；宇宙版改讀 approved-question-overrides.json（唯讀、
  需由管理者匯出），套用規則 applyQuestionOverrides／isQuestionEnabled 完全不變。尚未匯出時畫面會標示，報告列為阻塞。
"""
import os
import shutil
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "shared", "tools"))
from buildlib import Builder, TAG  # noqa: E402

SOURCE_REPO = "vashyang1120/vparty-quiz-game"
SOURCE_COMMIT = "93df14f2ca3e19f7ebd34309548df7f65aa84967"
U = "UniverseQuiz"

src_dir, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(out_dir, exist_ok=True)

# ================= main.js =================
b = Builder(os.path.join(src_dir, "main.js"), U)

b.rep_re(r"var FIREBASE_CONFIG = \{.*?\};\nvar FIREBASE_ENABLED = true;",
         f"// {TAG} 舊 Firebase 設定已移除：宇宙版不讀、不寫舊 Firebase\nvar FIREBASE_CONFIG = null;\nvar FIREBASE_ENABLED = false;",
         "FIREBASE_CONFIG")
b.rep_re(r'var GAME_MENU_URL = "[^"]*";',
         f'var GAME_MENU_URL = {U}.lobbyUrl();  // {TAG} 「遊戲選單」改回遊戲宇宙大廳（同一位玩家）', "回遊戲選單 → 大廳")

# --- Firebase 初始化 ---
b.replace_body("ensureFirebaseReady", "  return Promise.resolve(false);")

# --- 身份：由遊戲宇宙 playerId 決定（唯讀；不讀寫 vquiz_* / vtetris_* / vrhythm_* / vPartyPlayerProfile） ---
b.replace_body("loadPlayerLocal", f"  {U}.applyPlayerTo(PLAYER);")
b.replace_body("savePlayerLocal", f"  {U}.applyPlayerTo(PLAYER);  // 身份由遊戲宇宙管理，遊戲內不寫入本機身份")
b.replace_body("hasConfirmedQuizProfile", f"  return {U}.isReady();")
b.replace_body("makePlayerKey", f"  return {U}.playerKeyFor();  // 宇宙版：成績歸屬一律是遊戲宇宙 playerId，絕不以 ID＋圖案組合")
b.replace_body("ensurePlayerProfile", "  return Promise.resolve(null);")
b.replace_body("writePlayerProfileCurrent", "  return Promise.resolve(null);")
b.replace_body("savePlayer", f"  {U}.applyPlayerTo(PLAYER);\n  return Promise.resolve(true);")
b.replace_body("loadAvatarCatalog", "  return Promise.resolve({});")
b.replace_body("loadUnlockedAvatars", "  unlockedAvatars = {};\n  return Promise.resolve({});")
b.replace_body("isDisplayAvatarAllowed", f"  return {U}.isDisplayAvatarAllowed(key);  // v0.3.1：身份頭像或遊戲宇宙共用收藏目前裝備的展示頭像")
b.replace_body("validateDisplayAvatarForCurrentIdentity",
               f"  {U}.applyPlayerTo(PLAYER);  // v0.3.1：展示頭像＝遊戲宇宙共用收藏目前裝備的（伺服器已檢查）\n  return true;")
b.guard("getAvatarByKey", f"var uni = {U}.avatarFor(key); if (uni) return uni;")
b.guard("getBaseAvatarName", f"var uniLabel = {U}.avatarLabel(key); if (uniLabel) return uniLabel;")
b.guard("buildAvatarPicker", f"if ({U}.avatarPickerBlocked(mode)) return;")

# --- 題目修正：改讀唯讀的 approved-question-overrides.json（不讀舊 Firebase）；套用規則不變 ---
b.replace_body("loadQuestionOverrides",
               "  QUESTION_OVERRIDES = {};\n"
               f"  return {U}.loadApprovedOverrides().then(function(ov){{\n"
               "    QUESTION_OVERRIDES = ov || {};\n    return QUESTION_OVERRIDES;\n  });")
b.rep('  return fetch("./quiz_questions.json?v=" + encodeURIComponent(QUIZ_VERSION), { cache:"no-store" })\n',
      f'  return fetch(QUIZ_ASSET_ROOT + "quiz_questions.json?v=" + encodeURIComponent(QUIZ_VERSION), {{ cache:"no-store" }})  // {TAG} 正式題庫（原版網址，唯讀）\n',
      "題庫來源：原版網址")

# --- 成績：Mock（本分頁、依 playerId 分開）；年級榜／總榜用原版計算函式 ---
b.replace_body("saveLocalLog", "  return;  // 不寫入 vquiz_localLogs（裝置共用、不分玩家）")
b.replace_body("saveGameLog", f"  return {U}.submitRecord(record);")
b.replace_body("ensureXiaovBaseCatalog", "  return Promise.resolve(null);")
b.replace_body("unlockXiaovBaseAfterGameComplete", "  return Promise.resolve(null);  // 共用頭像解鎖 API 尚未完成")
b.replace_body("updateQuizProgress",
               f"  return {U}.mock.getProgressRoot().then(function(root){{\n"
               "    var oldProgress = (root[record.gradeBand] && root[record.gradeBand][record.subject]) || {};\n"
               "    var result = makeSubjectProgressFromRecord(record, oldProgress);\n"
               "    root[record.gradeBand] = root[record.gradeBand] || {};\n"
               "    root[record.gradeBand][record.subject] = result.progress;\n"
               f"    return {U}.mock.setProgressRoot(root).then(function(){{ return result; }});\n  }});")
b.replace_body("updateGradeLeaderboard",
               f"  return {U}.mock.getProgressRoot().then(function(root){{\n"
               "    var gradeRecord = buildGradeRecordFromProgress(gradeBand, root[gradeBand] || {});\n"
               f"    return {U}.mock.putBoard(gradeBand, gradeRecord).then(function(){{ return gradeRecord; }});\n  }});")
b.replace_body("updateMainLeaderboardFromGrades",
               f"  return {U}.mock.getMyGradeRecords().then(function(gradeRecords){{\n"
               "    var mainRecord = buildMainRecordFromGradeRecords(gradeRecords);\n"
               f"    return {U}.mock.putBoard('main', mainRecord).then(function(){{ return mainRecord; }});\n  }});")
b.replace_body("readQuizProgressMap", f"  return {U}.mock.getProgressRoot();")
b.replace_body("readGameLogsProgressRoot", "  return Promise.resolve(null);  // 不讀舊 gameLogs")
b.replace_body("readGameLogsAcademyFallback", "  return Promise.resolve(null);")
b.replace_body("readStoredQuizAcademyProgress", f"  return {U}.mock.getAcademy();")
b.replace_body("readGradeLeaderboardSelfSummary",
               f"  return {U}.mock.getMyGradeRecords().then(function(records){{\n"
               "    return Object.keys(records).length ? buildAcademyProgressFromGradeLeaderboards(records) : null;\n  });")
b.replace_body("updateQuizAcademyProgress",
               "  return loadQuizAcademyProgressSummary().then(function(academy){\n"
               f"    return {U}.mock.putAcademy(academy).then(function(){{ return academy; }});\n  }});")
b.replace_body("renderLeaderboard",
               "  var listEl = $(\"leaderboard-list\");\n  listEl.textContent = \"載入中...\";\n  updateLeaderboardTabs();\n"
               f"  return {U}.mock.listBoard(leaderboardMode).then(function(rows){{\n"
               "    renderLeaderboardRows(rows, false);\n"
               "  }).catch(function(e){\n"
               "    listEl.innerHTML = '<div class=\"muted\">排行榜暫時無法顯示。</div>';\n  });")
b.rep('      var lines = ["✅ 本次紀錄已保存"];\n',
      f'      var lines = ["✅ " + {U}.savedText()];  // {TAG} 本場成績只存在本分頁（Mock）\n', "結算說明")
b.rep('        lines.push("🎯 今日挑戰完成，+10 V幣待補領");\n',
      f'        lines.push("🎯 今日挑戰完成（" + {U}.labels.dailyRewardPending + "）");  // {TAG} +10 待 WalletService 決議\n',
      "今日挑戰結算文字")
b.rep('      $("save-status").textContent = "⚠️ Firebase 寫入可能失敗，已保留本機測試紀錄。";\n',
      f'      $("save-status").textContent = {U}.saveFailedText();  // {TAG}\n', "保存失敗文字")

# --- V幣：未開放（不發放、不寫入）；今日挑戰保留完成判定，+10 待開放 ---
b.replace_body("loadWalletBalance", "  updateWalletBalanceUI();\n  return Promise.resolve(null);")
b.replace_body("updateWalletBalanceUI",
               f"  if ($(\"top-vcoin-balance\")) $(\"top-vcoin-balance\").textContent = \"🪙 V幣：\" + {U}.walletText();\n"
               f"  if ($(\"profile-vcoin-balance\")) $(\"profile-vcoin-balance\").textContent = {U}.walletText();")
b.replace_body("applyVCoinEarnTransaction", "  return Promise.resolve({ claimed:false, amount:0, reason:\"not_implemented\" });")
b.replace_body("claimDailyAnyGameReward",
               "  return Promise.resolve({ claimed:false, amount:0, reason:\"not_implemented\", dateKey:getTaiwanDateKey() });")
b.guard("showVCoinRewardBanner", f"if ({U}.showVcoinNotice(vcoinResult)) return;")
b.replace_body("loadDailyChallengeStatus",
               "  var challenge = getDailyChallengeForDate();\n"
               f"  var done = {U}.isDailyChallengeDone(challenge);\n"
               "  DAILY_CHALLENGE_STATUS = { challenge: challenge, completed: done, record: done ? { completed: true, rewardClaimed: false } : null, loaded: true };\n"
               "  renderDailyChallengeCard();\n  return Promise.resolve(DAILY_CHALLENGE_STATUS);")
b.replace_body("saveDailyChallengeCompletion",
               "  var challenge = getDailyChallengeForDate();\n"
               "  if (!isRecordMatchingDailyChallenge(record, challenge)) {\n"
               "    return Promise.resolve({ completed:false, reason:\"not_today_challenge\", challenge:challenge });\n  }\n"
               f"  {U}.markDailyChallengeDone(challenge);  // 只記錄完成（依 playerId＋台灣日期），不發 +10 V幣\n"
               "  DAILY_CHALLENGE_STATUS = { challenge: challenge, completed: true, record: { completed: true, rewardClaimed: false }, loaded: true };\n"
               "  renderDailyChallengeCard();\n"
               "  return Promise.resolve({ completed:true, rewardClaimed:false, reason:\"reward_not_implemented\", challenge:challenge });")
b.rep('      stat.textContent = "今日挑戰已完成，但 +10 V幣尚未領取；再完成一次今日挑戰可嘗試補領。";\n',
      f'      stat.textContent = {U}.dailyChallengeText(true);  // {TAG}\n', "今日挑戰卡（已完成）")
b.rep('      stat.textContent = "完成指定年級與科目後，可領取 +10 V幣。";\n',
      f'      stat.textContent = {U}.dailyChallengeText(false);  // {TAG}\n', "今日挑戰卡（未完成）")
b.rep('    btn.textContent = status.completed ? (recordForButton.rewardClaimed === true ? "已完成" : "補領今日獎勵") : "開始今日挑戰";\n',
      f'    btn.textContent = status.completed ? (recordForButton.rewardClaimed === true ? "已完成" : "再挑戰一次") : "開始今日挑戰";  // {TAG} 不再提示補領 V幣\n',
      "今日挑戰按鈕")

# --- 稱號／徽章：共用 API 尚未完成 ---
b.replace_body("loadQuizTitleData",
               "  PLAYER_QUIZ_TITLES = {};\n  PLAYER_QUIZ_BADGES = {};\n  PLAYER_EQUIPPED_TITLE = null;\n  renderEquippedTitle();\n"
               "  return Promise.resolve({ badges:{}, titles:{}, equipped:null });")
b.rep('  var name = (PLAYER_EQUIPPED_TITLE && PLAYER_EQUIPPED_TITLE.name) ? PLAYER_EQUIPPED_TITLE.name : "未裝備";\n',
      f'  var name = (PLAYER_EQUIPPED_TITLE && PLAYER_EQUIPPED_TITLE.name) ? PLAYER_EQUIPPED_TITLE.name : {U}.titleText();  // {TAG}\n',
      "稱號顯示")
b.replace_body("equipQuizTitle", f"  {U}.notReady('titles');\n  return Promise.resolve(false);")
b.replace_body("openProfileTitleCollection", f"  {U}.notReady('titles');")
b.replace_body("unlockQuizBadgeAndTitle", "  return Promise.resolve(null);")
b.replace_body("checkAndUnlockQuizBadges", "  return Promise.resolve({ unlocked: [] });  // 共用徽章／稱號 API 尚未完成")
b.replace_body("syncLeaderboardTitleSnapshot", "  return Promise.resolve(false);")

# --- 舊管理後台：停用（不顯示、不寫入題目修正） ---
b.replace_body("initAdminEntrance", "  return;  // 管理後台停用（一般玩家入口不混入管理功能）")
b.replace_body("getAdminPassword", "  return null;")
b.replace_body("tryAdminLogin", "  return;")
b.replace_body("loadAdminData", "  return Promise.resolve(null);")
b.replace_body("updateQuestionOverride", "  return Promise.reject(new Error(\"管理後台停用：宇宙版不能修改題目\"));")
b.replace_body("setAdminQuestionDisabled", "  return;")
b.replace_body("saveAdminQuestionNote", "  return;")
b.replace_body("changeAdminPassword", "  return;")

# --- 啟動：先由 SDK 讀取玩家，再執行原版 init；不在遊戲內要求建立身份 ---
b.rep('  showScreen(alreadyConfirmed ? "screen-title" : "screen-profile");\n  if (!alreadyConfirmed) {\n    toast("首次遊玩請先確認玩家身份。", 3200);\n  }\n',
      f'  showScreen("screen-title");  // {TAG} 身份由遊戲宇宙提供，不在遊戲內建立身份\n', "啟動畫面")
b.rep('document.addEventListener("DOMContentLoaded", init);',
      f'document.addEventListener("DOMContentLoaded", function(){{ {U}.boot(init); }});  // {TAG} 先讀遊戲宇宙玩家，再啟動原版流程',
      "啟動流程")

header = (f"/* 遊戲宇宙版 universe-game-migration-v0.2.0-three-games-integration-test-1\n"
          f"   由 {SOURCE_REPO}@{SOURCE_COMMIT} main.js（SHA-256 {b.sha}）\n"
          f"   經 universe/quiz/tools/build_prototype.py 產生。請勿直接修改正式遊戲 Repository。 */\n")
b.s = header + b.s
open(os.path.join(out_dir, "main.js"), "w", encoding="utf-8").write(b.s)
print("main.js source sha256:", b.sha)
print("\n".join(b.log))
print("main.js edits:", len(b.log))

# ================= index.html =================
h = Builder(os.path.join(src_dir, "index.html"), U)
h.rep('  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>\n'
      '  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>\n'
      '  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>\n',
      f'  <!-- {TAG} 不再載入 Firebase SDK；改用遊戲宇宙共用 SDK（唯讀玩家資料；成績只進 Mock） -->\n'
      '  <script src="../shared/universe-sdk.js"></script>\n'
      '  <script src="universe-shell.js"></script>\n'
      '  <link rel="stylesheet" href="../shared/universe-ui.css">\n', "Firebase SDK → Universe SDK")
h.rep('  <link rel="stylesheet" href="./style.css?v=quiz-v0.2.44">\n',
      '  <link rel="stylesheet" href="./style.css?v=quiz-v0.2.44">\n  <link rel="stylesheet" href="universe-shell.css">\n', "換殼樣式")
h.rep("<title>小V知識挑戰｜quiz-v0.2.44</title>", "<title>小V知識挑戰｜遊戲宇宙版（測試）</title>", "標題")
h.rep('  <script src="./main.js?v=quiz-v0.2.44"></script>', '  <script src="./main.js?v=quiz-v0.2.44-universe-0.2.0"></script>', "main.js 版本")
html = h.s.replace("<!DOCTYPE html>",
                   "<!DOCTYPE html>\n<!-- 遊戲宇宙版 universe-game-migration-v0.2.0-three-games-integration-test-1\n"
                   f"     由 {SOURCE_REPO}@{SOURCE_COMMIT} index.html（SHA-256 {h.sha}）產生 -->", 1)
open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8").write(html)
print("index.html edits:", len(h.log))

# ================= style.css（原樣複製，不修改） =================
shutil.copyfile(os.path.join(src_dir, "style.css"), os.path.join(out_dir, "style.css"))
print("style.css copied unchanged")

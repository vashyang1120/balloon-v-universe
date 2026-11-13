#!/usr/bin/env python3
"""由正式版 vparty-rhythm-game/index.html 產生「節奏遊戲宇宙版」universe/rhythm/index.html

用法（repository 根目錄）：
  python3 -I universe/rhythm/tools/build_prototype.py <正式版 index.html> universe/rhythm/index.html

本次只替換玩家資料層。以下一律不修改（tests/rhythm-core-integrity.test.mjs 以 SHA-256 驗證）：
  音符判定、音符速度、Hit Window（PERF_MS／GOOD_MS）、Perfect／Good／Miss、Hold Note、計分公式、Combo、
  歌曲資料、Beatmap、字幕、音訊播放、YouTube／MV、既有難度規則、手機操作、遊戲結算流程（endGame）、
  音樂編輯器（tools/beatmap-editor，本版不複製、不修改）。
歌曲、Beatmap、字幕、音訊仍由原版網址 vashyang1120.github.io/vparty-rhythm-game/ 唯讀載入（與原版完全相同）。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "shared", "tools"))
from buildlib import Builder, TAG  # noqa: E402

SOURCE_REPO = "vashyang1120/vparty-rhythm-game"
SOURCE_COMMIT = "9caa7dcb669ccbe83feedcb85c6237d773ad9b31"
U = "UniverseRhythm"

src_path, out_path = sys.argv[1], sys.argv[2]
b = Builder(src_path, U)

# ---------- 1. 不再載入 Firebase SDK；改載入共用 SDK 與換殼層 ----------
b.rep('  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>\n'
      '  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>\n'
      '  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>\n'
      '</head>',
      f'  <!-- {TAG} 不再載入 Firebase SDK；改用遊戲宇宙共用 SDK（唯讀玩家資料；成績只進 Mock） -->\n'
      '  <script src="../shared/universe-sdk.js"></script>\n'
      '  <script src="universe-shell.js"></script>\n'
      '  <link rel="stylesheet" href="../shared/universe-ui.css">\n'
      '  <link rel="stylesheet" href="universe-shell.css">\n'
      '</head>', "Firebase SDK → Universe SDK")
b.rep("<title>氣球小V魔法派對</title>", "<title>氣球小V魔法派對｜遊戲宇宙版（測試）</title>", "標題")

# ---------- 2. 移除舊 Firebase 設定、前端寫死的 PIN 與管理密碼 ----------
b.rep_re(r"var FIREBASE_CONFIG = \{.*?\};\nvar FIREBASE_ENABLED = true;",
         f"// {TAG} 舊 Firebase 設定已移除：宇宙版不讀、不寫舊 Firebase\nvar FIREBASE_CONFIG = null;\nvar FIREBASE_ENABLED = false;",
         "FIREBASE_CONFIG")
b.rep_re(r"var ADMIN_UNLOCK_PIN = '[^']*';\nvar REMOTE_UNLOCK_PINS = \{.*?\};",
         f"// {TAG} 前端寫死的解鎖 PIN 已移除（任何人都能看到原始碼，不安全）\nvar ADMIN_UNLOCK_PIN = '';\nvar REMOTE_UNLOCK_PINS = {{}};",
         "解鎖 PIN")
b.rep_re(r"var ADMIN_DEFAULT_PW = '[^']*';",
         f"var ADMIN_DEFAULT_PW = '';  // {TAG} 前端預設管理密碼已移除（管理後台停用）", "管理預設密碼")

# ---------- 3. Firebase 初始化 ----------
b.replace_body("ensureFirebaseReady", "  return Promise.resolve(false);")
b.replace_body("initFirebase", "  return;")

# ---------- 4. 身份：由遊戲宇宙 playerId 決定（唯讀；不讀寫 vPartyPlayerProfile／vPartyProfile） ----------
b.replace_body("migrateLocalProfile", "  return null;  // 不讀取、不遷移舊版本機玩家資料")
b.replace_body("loadPlayerProfile", f"  {U}.applyPlayerTo(PLAYER);")
b.replace_body("_saveLocalProfile", f"  {U}.applyPlayerTo(PLAYER);  // 身份由遊戲宇宙管理，遊戲內不寫入本機身份")
b.replace_body("savePlayerProfile", f"  {U}.applyPlayerTo(PLAYER);\n  return Promise.resolve(true);")
b.replace_body("isProfileIdentityDirty", "  return false;")
b.replace_body("ensurePlayerProfile", "  return Promise.resolve();")
b.replace_body("isDisplayAvatarAllowed", f"  return {U}.isDisplayAvatarAllowed(key);  // v0.3.1：身份頭像或遊戲宇宙共用收藏目前裝備的展示頭像")
b.replace_body("validateDisplayAvatarForCurrentIdentity",
               f"  {U}.applyPlayerTo(PLAYER);  // v0.3.1：展示頭像＝遊戲宇宙共用收藏目前裝備的（伺服器已檢查）\n  return true;")
b.guard("getAvatarByKey", f"var uni = {U}.avatarFor(key); if (uni) return uni;")
b.guard("getAvatarDisplayName", f"var uniLabel = {U}.avatarLabel(key); if (uniLabel) return uniLabel;")
b.rep("  if (keyEl) keyEl.textContent = pKey || '—';\n",
      f"  if (keyEl) keyEl.textContent = PLAYER.playerId || '—';  // {TAG} 顯示遊戲宇宙 playerId（不組合舊 playerKey）\n",
      "角色設定顯示 playerId")
b.guard("startEditBaseAvatar", f"if ({U}.identityLocked()) return;")
b.guard("startEditDisplayAvatar", f"if ({U}.identityLocked()) return;")
b.replace_body("refreshProfileMetaInfo",
               "  updateProfileDataStatic();\n"
               "  var balanceEl = document.getElementById('profile-vcoin-balance');\n"
               "  var titleEl = document.getElementById('profile-equipped-title');\n"
               f"  if (balanceEl) balanceEl.textContent = {U}.walletText();\n"
               f"  if (titleEl) titleEl.textContent = {U}.titleText();\n"
               "  updateGamePlayerCard();")
b.rep("  if (vcoin) vcoin.textContent = '🪙 V幣：' + vcoinText;\n",
      f"  if (vcoin) vcoin.textContent = '🪙 V幣：' + {U}.walletText();  // {TAG} V幣尚未開放\n", "遊戲中玩家卡 V幣")

# ---------- 5. 頭像解鎖／稱號：共用 API 尚未完成 ----------
b.replace_body("loadAvatarCatalog", "  return Promise.resolve({});")
b.replace_body("loadUnlockedAvatars", "  return Promise.resolve({});")
b.replace_body("unlockAvatar", "  return Promise.resolve(false);  // 共用頭像解鎖 API 尚未完成（NOT_IMPLEMENTED）")
b.replace_body("equipDisplayAvatar", f"  {U}.notReady('avatarUnlocks');")
b.replace_body("handleUnlockPin", f"  {U}.notReady('avatarUnlocks');\n  return false;")
b.replace_body("submitUnlockPin", f"  {U}.notReady('avatarUnlocks');")
b.replace_body("openUnlockPanel", f"  {U}.notReady('avatarUnlocks');")
b.replace_body("loadEquippedTitleForCurrentPlayer", "  setEquippedTitleUI(null);\n  return Promise.resolve(null);")
b.replace_body("checkAndUnlockRhythmTitles", "  return Promise.resolve({ unlocked: [], autoEquipped: null });  // 共用稱號 API 尚未完成")
b.replace_body("unlockRhythmTitle", "  return Promise.resolve(null);")
b.replace_body("equipSharedTitle", f"  {U}.notReady('titles');\n  return Promise.resolve(false);")
b.replace_body("toggleTitleCollectionPanel", f"  {U}.notReady('titles');")

# ---------- 6. V幣：正式帳本 API 尚未完成 → 不發放、不寫入；今日挑戰保留完成判定（+10 待開放） ----------
b.replace_body("toggleVcoinWalletPanel", f"  {U}.notReady('wallet');")
b.replace_body("claimDailyVCoinsForRhythm", "  return Promise.resolve({ claimed: false, amount: 0, balance: null, notImplemented: true });")
b.replace_body("claimRhythmDailyChallengeVCoins", "  return Promise.resolve({ claimed: false, amount: 0, balance: null, notImplemented: true });")
b.replace_body("claimRhythmVCoinRewardsAfterSong",
               f"  {U}.markDailyChallengeDone();  // 今日挑戰「完成任一首歌」：只記錄完成，不發 +10 V幣\n"
               "  return Promise.resolve({ daily: null, challenge: null, balance: null, totalClaimed: 0, notImplemented: true });")
b.replace_body("buildRhythmVCoinResultMessage", f"  return {U}.resultVcoinText();")
b.replace_body("hasConfirmedPlayerIdentityForHint", f"  return {U}.isReady();")
b.replace_body("readRhythmDailyChallengeHintStatus",
               f"  return Promise.resolve({{ status: {U}.dailyChallengeStatus(), dateKey: getTaiwanDateKey() }});")
b.replace_body("getRhythmDailyChallengeHintText", f"  return {U}.dailyChallengeText(status);")

# ---------- 7. 成績／排行榜：Mock（本分頁、依 playerId 分開），不寫 localStorage 舊成績鍵 ----------
b.replace_body("saveScore",
               f"  return {U}.recordSongResult({{\n"
               "    songId: (G.song && G.song.id) || 'song001', songTitle: (G.song && G.song.title) || '',\n"
               "    difficulty: normalizeDiff(G.diff || 'normal'), score: G.score, maxCombo: G.maxCombo || 0,\n"
               "    perfect: G.perf, good: G.good, miss: G.miss, accuracy: acc, grade: grade\n  });")
b.replace_body("renderLBFromLocal",
               "  var el = document.getElementById('lb-list');\n"
               "  var lbMode = normalizeLBDiff(lbDiff);\n  lbDiff = lbMode;\n"
               f"  return {U}.renderMockBoard(el, lbSongId || 'song001', lbMode, renderLBRows);")

# ---------- 8. 舊管理後台：停用（不顯示、不寫入） ----------
b.guard("handleLogoClick", f"if ({U}.adminDisabled()) return;")
b.replace_body("checkAdminPw", "  return;  // 管理後台停用")
b.replace_body("adminChangePw", "  return;")
b.replace_body("adminClearAll", "  return;")
b.replace_body("adminDeleteScore", "  return;")
b.replace_body("adminExportLB", "  return;")
b.replace_body("adminMigrateScores", "  return;")
b.replace_body("renderAdminPanel", "  return;")

# ---------- 9. 按鈕與啟動流程 ----------
b.rep("document.getElementById('btn-play').onclick        = function(){ setProfileOpenedFromGameUI(false); initProfile(); go('s-profile'); };\n",
      f"document.getElementById('btn-play').onclick        = function(){{ if (!{U}.isReady()) {{ {U}.explainNotReady(); return; }} setProfileOpenedFromGameUI(false); loadSongs(); go('s-songlist'); }};  // {TAG} 身份由遊戲宇宙提供，直接選歌\n",
      "開始遊戲 → 選歌")
b.rep("document.getElementById('btn-back-song').onclick    = function(){ go('s-profile'); };\n",
      f"document.getElementById('btn-back-song').onclick    = function(){{ go('s-title'); }};  // {TAG} 選歌返回首頁（不經過身份設定）\n",
      "選歌返回")
b.rep("// 啟動時提前初始化 Firebase + 載入歌曲，減少等待\nensureFirebaseReady();\nensureSongsLoaded();\n",
      f"// {TAG} 不初始化 Firebase；由遊戲宇宙 SDK 讀取玩家（網址 ?bvPlayerId=），歌曲照原版提前載入\n"
      f"{U}.boot(function(){{\n  loadPlayerProfile();\n  validateDisplayAvatarForCurrentIdentity();\n"
      "  updateGamePlayerCard();\n  updateRhythmDailyChallengeHint();\n});\nensureSongsLoaded();\n",
      "啟動流程")

header = (f"<!-- 遊戲宇宙版 universe-game-migration-v0.2.0-three-games-integration-test-1\n"
          f"     由 {SOURCE_REPO}@{SOURCE_COMMIT} index.html（SHA-256 {b.sha}）\n"
          f"     經 universe/rhythm/tools/build_prototype.py 產生。請勿直接修改正式遊戲 Repository。 -->\n")
b.write(out_path, header)

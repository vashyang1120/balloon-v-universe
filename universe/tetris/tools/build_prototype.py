#!/usr/bin/env python3
"""由正式版 vparty-tetris/index.html 產生「遊戲宇宙換殼原型」universe/tetris/index.html

用法（repository 根目錄）：
  python3 -I universe/tetris/tools/build_prototype.py <正式版 index.html> universe/tetris/index.html

原則：
  - 只改「玩家系統」相關函式（身份、Firebase、V幣、稱號、頭像解鎖、排行榜、管理後台）
  - 遊戲玩法函式一律不動；tests/tetris-core-integrity.test.mjs 會以 SHA-256 驗證
  - 每一處修改都必須「剛好命中一次」，否則停止，避免改錯地方
"""
import hashlib
import re
import sys

SOURCE_REPO = "vashyang1120/vparty-tetris"
SOURCE_COMMIT = "7f3388562c35ca24572b3fb8cd861f7302f81509"

src_path, out_path = sys.argv[1], sys.argv[2]
raw = open(src_path, "rb").read()
sha = hashlib.sha256(raw).hexdigest()
s = raw.decode("utf-8")
log = []


def mask(text):
    """把字串、註解、regex 內容換成空白（長度不變），讓大括號配對不受干擾"""
    out, i, n, st = [], 0, len(text), None
    while i < n:
        c = text[i]; nx = text[i + 1] if i + 1 < n else ""
        if st is None:
            if c == "/" and nx == "/": st = "line"; out.append("  "); i += 2; continue
            if c == "/" and nx == "*": st = "block"; out.append("  "); i += 2; continue
            if c in "'\"`": st = c; out.append(c); i += 1; continue
            if c == "/":
                k = len(out) - 1
                while k >= 0 and out[k] in " \t": k -= 1
                prev = out[k] if k >= 0 else "\n"
                if prev in "(,=:[!&|?{};\n+-*%<>~^":
                    j, inclass = i + 1, False
                    while j < n and text[j] != "\n":
                        if text[j] == "\\": j += 2; continue
                        if text[j] == "[": inclass = True
                        elif text[j] == "]": inclass = False
                        elif text[j] == "/" and not inclass: break
                        j += 1
                    if j < n and text[j] == "/":
                        out.append(" " * (j - i + 1)); i = j + 1; continue
            out.append(c); i += 1; continue
        if st == "line":
            if c == "\n": st = None; out.append("\n")
            else: out.append(" ")
            i += 1; continue
        if st == "block":
            if c == "*" and nx == "/": st = None; out.append("  "); i += 2; continue
            out.append("\n" if c == "\n" else " "); i += 1; continue
        if c == "\\": out.append("  "); i += 2; continue
        if c == st: st = None; out.append(c); i += 1; continue
        out.append("\n" if c == "\n" else " "); i += 1
    return "".join(out)


def body_span(text, name, occurrence_ok=1):
    """回傳 function name(...) { ... } 內 { 與 } 的位置清單"""
    spans = []
    for m in re.finditer(r"(?:async\s+)?function\s+" + re.escape(name) + r"\s*\(", text):
        masked = mask(text)
        p = masked.find("{", m.end())
        depth, q = 0, p
        while q < len(masked):
            if masked[q] == "{": depth += 1
            elif masked[q] == "}":
                depth -= 1
                if depth == 0: break
            q += 1
        spans.append((p, q))
    assert len(spans) == occurrence_ok, f"{name}: 找到 {len(spans)} 個定義（預期 {occurrence_ok}）"
    return spans


def replace_body(name, new_body, occurrences=1):
    global s
    for p, q in reversed(body_span(s, name, occurrences)):
        s = s[:p + 1] + "\n  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）\n" + new_body.rstrip() + "\n" + s[q:]
    log.append(f"replace body: {name} ×{occurrences}")


def insert_at_start(name, code):
    global s
    (p, q), = body_span(s, name)
    s = s[:p + 1] + "\n  " + code + "  // [Universe 換殼]" + s[p + 1:]
    log.append(f"guard: {name}")


def rep(old, new, label):
    global s
    assert s.count(old) == 1, f"{label}: 命中 {s.count(old)} 次"
    s = s.replace(old, new)
    log.append(f"replace: {label}")


# ---------- 1. 不再載入 Firebase SDK；改載入共用 SDK 與換殼層 ----------
rep('<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>\n'
    '<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>\n'
    '<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>\n',
    '<!-- [Universe 換殼] 不再載入 Firebase SDK；改用遊戲宇宙共用 SDK（唯讀玩家資料；成績只進 Mock） -->\n'
    '<script src="../shared/universe-sdk.js"></script>\n'
    '<script src="universe-shell.js"></script>\n',
    "Firebase SDK → Universe SDK")
rep("</head>", '<link rel="stylesheet" href="universe-shell.css">\n</head>', "換殼層樣式")
rep("<title>氣球小V方塊派對 🎈</title>", "<title>氣球小V方塊派對 🎈｜遊戲宇宙換殼測試版</title>", "標題")

# ---------- 2. 移除舊 Firebase 設定與管理員 PIN ----------
m = re.search(r"var FIREBASE_CONFIG = \{.*?\};\nvar FIREBASE_ENABLED = true;", s, re.S)
assert m, "FIREBASE_CONFIG"
s = s[:m.start()] + ("// [Universe 換殼] 舊 Firebase 設定已移除：本原型不讀、不寫舊 Firebase\n"
                     "var FIREBASE_CONFIG = null;\nvar FIREBASE_ENABLED = false;") + s[m.end():]
log.append("replace: FIREBASE_CONFIG")
m = re.search(r"var ADMIN_UNLOCK_PIN = '[^']*';\nvar REMOTE_UNLOCK_PINS = \{.*?\};", s, re.S)
assert m, "PIN"
s = s[:m.start()] + ("// [Universe 換殼] 前端寫死的管理員 PIN 已移除（任何人都能看到原始碼，不安全）\n"
                     "var ADMIN_UNLOCK_PIN = '';\nvar REMOTE_UNLOCK_PINS = {};") + s[m.end():]
log.append("replace: ADMIN PIN")

# ---------- 3. Firebase 初始化 ----------
replace_body("ensureFirebaseReady", "  return Promise.resolve(false);")
replace_body("initFirebase", "  return;")

# ---------- 4. 身份：由遊戲宇宙 playerId 決定（唯讀） ----------
replace_body("loadPlayer", "  UniverseTetris.applyPlayerTo(PLAYER);")
replace_body("savePlayerLocal", "  UniverseTetris.applyPlayerTo(PLAYER);  // 身份由遊戲宇宙管理，遊戲內不寫入本機身份")
replace_body("savePlayer", "  savePlayerLocal();")
replace_body("ensurePlayerProfile", "  return Promise.resolve();")
replace_body("isProfileIdentityDirty", "  return false;")
replace_body("isDisplayAvatarAllowed", "  return !!key && key === PLAYER.baseAvatarKey;  // 展示頭像解鎖尚未接入：只允許身份頭像")
replace_body("validateDisplayAvatarForCurrentIdentity",
             "  PLAYER.displayAvatarKey = PLAYER.baseAvatarKey;\n  PLAYER.avatarKey = PLAYER.baseAvatarKey;\n"
             "  PLAYER.avKey = PLAYER.baseAvatarKey;\n  PLAYER.avatarSrc = getAvatarUrl(PLAYER.baseAvatarKey);\n"
             "  PLAYER.avUrl = PLAYER.avatarSrc;\n  return true;")
insert_at_start("getAvatarByKey", "var uni = UniverseTetris.avatarFor(key); if (uni) return uni;")
insert_at_start("getBaseAvatarDisplayName", "var uniLabel = UniverseTetris.avatarLabel(baseAvatarKey || (PLAYER && PLAYER.baseAvatarKey)); if (uniLabel) return uniLabel;")
rep("  if(keyEl) keyEl.textContent = PLAYER.playerKey || makePlayerKey(id, PLAYER.baseAvatarKey || 'boy1');",
    "  if(keyEl) keyEl.textContent = PLAYER.playerId || '—';  // [Universe 換殼] 顯示遊戲宇宙 playerId（不組合舊 playerKey）",
    "角色設定顯示 playerId")
replace_body("goProfile", "  if(!UniverseTetris.isReady()){ UniverseTetris.explainNotReady(); return; }\n  loadPlayer();\n  showDiffSelect();")
replace_body("openProfileFromTopCard",
             "  loadPlayer();\n  profileOriginalId = PLAYER.id;\n  profileOriginalBaseAvatarKey = PLAYER.baseAvatarKey;\n"
             "  var hint = document.getElementById('profile-id-dirty-hint');\n  if(hint) hint.style.display = 'none';\n"
             "  hideAvGrid();\n  hideTitleGrid();\n  closeVcoinHistory();\n  setProfileDataCollapsed(false);\n"
             "  syncProfilePreviewUI();\n  showScreen('s-profile');\n  refreshPlayerMetaUI();")
insert_at_start("buildAvGrid", "if (UniverseTetris.identityLocked()) return;")

# ---------- 5. 頭像解鎖／稱號：共用 API 尚未完成 ----------
replace_body("loadAvatarCatalog", "  return Promise.resolve({});")
replace_body("loadUnlockedAvatars", "  return Promise.resolve({});")
replace_body("unlockAvatar", "  return Promise.resolve(false);  // 共用頭像解鎖 API 尚未完成（NOT_IMPLEMENTED）")
replace_body("equipDisplayAvatar", "  UniverseTetris.notReady('avatarUnlocks');")
replace_body("loadEquippedTitleForCurrentPlayer",
             "  window.currentEquippedTitleData = null;\n  playerEquippedTitleName = UniverseTetris.titleText();\n"
             "  updateTopPlayerCard();\n  updateProfileTitleBox();\n  return Promise.resolve(playerEquippedTitleName);")
replace_body("checkAndUnlockTetrisTitles", "  return Promise.resolve([]);  // 共用稱號 API 尚未完成（NOT_IMPLEMENTED）")
replace_body("unlockTetrisTitle", "  return Promise.resolve(null);")
replace_body("equipSharedTitle", "  UniverseTetris.notReady('titles');\n  return Promise.resolve(false);")
replace_body("loadUnlockedTitlesByGame", "  return Promise.resolve({});")
replace_body("loadTetrisUnlockedTitles", "  return Promise.resolve({});")
replace_body("loadLeaderboardTitles", "  return entries || [];")
replace_body("toggleTitleCollection", "  UniverseTetris.notReady('titles');")
rep('document.getElementById("btn-unlock-collection").addEventListener("click", function(){\n',
    'document.getElementById("btn-unlock-collection").addEventListener("click", function(){\n'
    "  if (UniverseTetris.notReady('avatarUnlocks')) return;  // [Universe 換殼]\n", "頭像收藏按鈕")
rep('document.getElementById("btn-change-base-avatar").addEventListener("click", function(){\n',
    'document.getElementById("btn-change-base-avatar").addEventListener("click", function(){\n'
    "  if (UniverseTetris.identityLocked()) return;  // [Universe 換殼]\n", "變更身份頭像按鈕")
rep('document.getElementById("btn-change-display-avatar").addEventListener("click", function(){\n',
    'document.getElementById("btn-change-display-avatar").addEventListener("click", function(){\n'
    "  if (UniverseTetris.identityLocked()) return;  // [Universe 換殼]\n", "變更顯示頭像按鈕")
rep('document.getElementById("btn-profile-ok").addEventListener("click",function(){\n',
    'document.getElementById("btn-profile-ok").addEventListener("click",function(){\n'
    '  if (UniverseTetris.identityLocked()) { showScreen("s-title"); return; }  // [Universe 換殼]\n', "確認身份按鈕")

# ---------- 6. V幣：共用帳本 API 尚未完成 → 未開放（不發放、不寫入） ----------
replace_body("getWalletDisplayText", "  return UniverseTetris.walletText();")
replace_body("loadPlayerWalletBalance", "  playerWalletBalance = null;\n  updateTopPlayerCard();\n  updateProfileWalletBox();\n  return Promise.resolve(null);")
replace_body("loadVcoinHistory", "  return Promise.resolve({ balance: null, logs: [], notImplemented: true });")
replace_body("loadVcoinWalletStatus", "  return Promise.resolve({ balanceError: true, commonDailyRewardError: true, tetrisDailyChallengeError: true, notImplemented: true, yyyyMMdd: getTaiwanDateKey() });")
replace_body("claimDailyVCoinsForTetris", "  return Promise.resolve({ status: 'notImplemented', balance: null });")
replace_body("claimTetrisDailyChallengeReward", "  return Promise.resolve({ status: 'notImplemented', balance: null });")
replace_body("runVcoinRewardsAfterGame", "  setResultVCoinMessage(UniverseTetris.resultVcoinText(), 'offline');\n  return Promise.resolve(null);")
replace_body("openVcoinHistory",
             "  var wrap = document.getElementById('vcoin-history-wrap');\n  if(!wrap) return;\n  hideAvGrid();\n  hideTitleGrid();\n"
             "  wrap.style.display = 'block';\n  setProfileDataCollapsed(true);\n"
             "  UniverseTetris.renderNotReadyPanel('wallet', document.getElementById('vcoin-history-summary'), document.getElementById('vcoin-history-list'));")

# ---------- 7. 成績／排行榜：Mock（本分頁），最佳分數依 playerId 分開 ----------
replace_body("saveLB", "  return UniverseTetris.submitScore({ score: score, level: level, lines: lines, difficulty: diff, peakCombo: peakCombo || 0 });")
replace_body("loadLB", "  return UniverseTetris.renderMockLeaderboard($(\"lb-list\"), getAvatarUrl);")
replace_body("getLocalBestScore", "  return UniverseTetris.getLocalBest();", occurrences=2)
replace_body("updateBestDisp", "  var b = UniverseTetris.getLocalBest();\n  renderBestScore(b);\n  return Promise.resolve(b);")
rep('  const prev=parseInt(localStorage.getItem("vtetris_best")||"0");\n  const isNew=score>prev;\n'
    '  if(isNew){ localStorage.setItem("vtetris_best",score); updateBestDisp(); }\n',
    '  const prev=UniverseTetris.getLocalBest();  // [Universe 換殼] 最佳分數依 playerId 分開（原版為全裝置共用）\n  const isNew=score>prev;\n'
    '  if(isNew){ UniverseTetris.setLocalBest(score); updateBestDisp(); }\n', "gameOver 最佳分數")

# ---------- 8. 舊管理後台：停用 ----------
rep('document.getElementById("logo-title").addEventListener("click",()=>{\n',
    'document.getElementById("logo-title").addEventListener("click",()=>{\n'
    "  if (UniverseTetris.adminDisabled()) return;  // [Universe 換殼] 測試版停用舊管理後台\n", "管理後台入口")
rep('$("btn-adm-pin").addEventListener("click", async function(){\n',
    '$("btn-adm-pin").addEventListener("click", async function(){\n'
    "  if (UniverseTetris.adminDisabled()) return;  // [Universe 換殼]\n", "PIN 解鎖")
replace_body("loadAdminData", "  return;")
replace_body("getAdminPw", "  return \"\";  // 前端預設管理密碼已移除（管理後台停用）")
rep('window.deleteEntry=async function(fbKey){\n',
    'window.deleteEntry=async function(fbKey){\n  if (UniverseTetris.adminDisabled()) return;  // [Universe 換殼]\n', "刪除紀錄")

# ---------- 9. 啟動流程 ----------
rep("initFirebase();\nensureFirebaseReady().then(function(){\n  return loadAvatarCatalog();\n}).then(function(){\n"
    "  loadUnlockedAvatars().then(function(res){\n    unlockedAvatars = res || {};\n"
    "    validateDisplayAvatarForCurrentIdentity();\n    refreshPlayerMetaUI();\n  });\n});\n",
    "// [Universe 換殼] 不初始化 Firebase；由遊戲宇宙 SDK 讀取玩家（網址 ?bvPlayerId=）\n"
    "UniverseTetris.wrapStartGame();\n"
    "UniverseTetris.boot(function(){\n  loadPlayer();\n"
    "  var baseImg = document.getElementById(\"base-avatar-preview\");\n"
    "  var dispImg = document.getElementById(\"av-preview-img\");\n"
    "  if(baseImg) baseImg.src = getAvatarUrl(PLAYER.baseAvatarKey);\n"
    "  if(dispImg) dispImg.src = getAvatarUrl(PLAYER.displayAvatarKey);\n"
    "  refreshPlayerMetaUI();\n  updateBestDisp();\n});\n", "啟動流程")

header = (f"<!-- 遊戲宇宙換殼原型 universe-game-migration-v0.1.0-foundation-test-1\n"
          f"     由 {SOURCE_REPO}@{SOURCE_COMMIT} index.html（SHA-256 {sha}）\n"
          f"     經 universe/tetris/tools/build_prototype.py 產生。請勿直接修改正式遊戲 Repository。 -->\n")
s = s.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n" + header, 1) if s.startswith("<!DOCTYPE html>") else header + s
open(out_path, "w", encoding="utf-8").write(s)
print("source sha256:", sha)
print("\n".join(log))
print("edits:", len(log))

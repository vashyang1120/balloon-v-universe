/* 方塊派對換殼原型：「遊戲核心沒有被修改」驗證
   執行：node --test universe/tetris/tests/tetris-core-integrity.test.mjs   （在 repository 根目錄）

   基準：tools/original-functions.sha256.json（由正式版 vparty-tetris@7f33885 index.html 計算）
   - 玩法、計分、等級、速度、音效、音樂、手機操作、全螢幕等函式：必須與原版逐字相同（SHA-256）
   - 只有列在 ALLOWED_CHANGES 的「玩家系統」函式允許修改
   - <style> 與頁面 HTML 結構必須與原版逐字相同
   - 函式以外的程式（常數、方塊表、音效表、鍵盤事件…）只允許列出的換殼差異 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inlineScripts, extractFunctions, sha256, styleBlock, bodyMarkup, residueLines } from "../tools/js-functions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, "..");
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const baseline = JSON.parse(fs.readFileSync(path.join(DIR, "tools/original-functions.sha256.json"), "utf8"));
const js = inlineScripts(html);
const fns = extractFunctions(js);
const now = Object.fromEntries(fns.map((f) => [f.name, f.sha256]));

/* 允許修改的玩家系統函式（身份、Firebase、V幣、稱號、頭像解鎖、排行榜、管理後台）＋結算 gameOver（只改最佳分數 3 行） */
const ALLOWED_CHANGES = new Set([
  "loadAvatarCatalog", "ensureFirebaseReady", "start", "initFirebase", "ensurePlayerProfile", "loadUnlockedAvatars", "unlockAvatar",
  "equipDisplayAvatar", "isProfileIdentityDirty", "getAvatarByKey", "loadPlayer", "savePlayerLocal", "savePlayer",
  "getBaseAvatarDisplayName", "getWalletDisplayText", "updateProfileIdentityBox", "loadPlayerWalletBalance",
  "loadEquippedTitleForCurrentPlayer", "openProfileFromTopCard", "buildAvGrid", "goProfile", "loadVcoinHistory",
  "makeUnavailableResult", "claimTetrisDailyChallengeReward", "runVcoinRewardsAfterGame", "loadVcoinWalletStatus",
  "openVcoinHistory", "isDisplayAvatarAllowed", "validateDisplayAvatarForCurrentIdentity", "unlockTetrisTitle",
  "checkAndUnlockTetrisTitles", "loadUnlockedTitlesByGame", "loadTetrisUnlockedTitles", "toggleTitleCollection",
  "equipSharedTitle", "claimDailyVCoinsForTetris", "gameOver", "saveLB", "loadLeaderboardTitles", "loadLB",
  "getLocalBestScore", "getLocalBestScore#2", "updateBestDisp", "loadAdminData", "getAdminPw"
]);

/* 遊戲核心（必須存在且逐字相同） */
const CORE = [
  "initCanvas", "randPiece", "newBoard", "startGame", "loop", "rotate", "tryRotate", "valid", "mLeft", "mRight", "mDown",
  "hardDrop", "lock", "clearLines", "getStickerKey", "updateHUD", "lighten", "darken", "initBalloon", "getTinted",
  "drawCell", "drawRopes", "draw", "drawNext", "spawnParticles", "updParticles", "drawParticles", "showSticker",
  "checkDanger", "showLvFlash", "clearGameVisualState", "togglePause", "getACtx", "tone", "noise",
  "loadSongs", "loadSong", "playSong", "pauseSong", "togglePlay", "updPlayBtns", "startProg", "stopProg",
  "toggleFullscreen", "showDiffSelect", "showScreen", "isGameScreenActive", "shouldShowMobileControls",
  "updateMobileControlsVisibility", "syncMobileControlsVisibility", "notifyParentHeight"
];

test("遊戲核心函式（方塊、旋轉、碰撞、消除、計分、等級、速度、音效、音樂、手機、全螢幕）與原版逐字相同", () => {
  for (const name of CORE) {
    assert.ok(baseline.functions[name], `基準缺少 ${name}`);
    assert.equal(now[name], baseline.functions[name], `核心函式被修改：${name}`);
  }
});

test("除了列出的玩家系統函式之外，所有原版函式都沒有被修改", () => {
  const changed = Object.keys(baseline.functions).filter((n) => now[n] !== baseline.functions[n]);
  const unexpected = changed.filter((n) => !ALLOWED_CHANGES.has(n));
  assert.deepEqual(unexpected, [], "未預期的修改：" + unexpected.join(", "));
  assert.ok(Object.keys(baseline.functions).length >= 170, "基準函式數量異常");
});

test("CSS 與頁面 HTML 結構和原版逐字相同（換殼只在 <head> 加入 SDK）", () => {
  assert.equal(sha256(styleBlock(html)), baseline.styleSha256, "<style> 被修改");
  assert.equal(sha256(bodyMarkup(html)), baseline.bodyMarkupSha256, "頁面結構被修改");
});

function multisetDiff(a, b) {   // a 有、b 沒有的行（考慮重複次數）
  const count = new Map();
  for (const l of b) count.set(l, (count.get(l) || 0) + 1);
  const out = [];
  for (const l of a) { const c = count.get(l) || 0; if (c > 0) count.set(l, c - 1); else out.push(l); }
  return out;
}

/* 允許刪除的原版頂層程式：舊 Firebase 設定、前端寫死的管理員 PIN、Firebase 啟動流程 */
const ALLOWED_REMOVED = [
  /^var FIREBASE_CONFIG = \{$/, /^  (apiKey|authDomain|databaseURL|projectId|storageBucket|messagingSenderId|appId|measurementId):/, /^\};$/,
  /^var FIREBASE_ENABLED = true;$/, /^var ADMIN_UNLOCK_PIN = '\[REDACTED\]';$/, /^var REMOTE_UNLOCK_PINS = \{$/, /^  '\[REDACTED\]': '[a-z_0-9]+',?$/,
  /^initFirebase\(\);$/, /^ensureFirebaseReady\(\)\.then\(function\(\)\{$/, /^  return loadAvatarCatalog\(\);$/,
  /^\}\)\.then\(function\(\)\{$/, /^  loadUnlockedAvatars\(\)\.then\(function\(res\)\{$/, /^    unlockedAvatars = res \|\| \{\};$/,
  /^    validateDisplayAvatarForCurrentIdentity\(\);$/, /^    refreshPlayerMetaUI\(\);$/, /^  \}\);$/, /^\}\);$/,
  /^  const prev=parseInt\(localStorage\.getItem\("vtetris_best"\)/, /^  if\(isNew\)\{ localStorage\.setItem\("vtetris_best"/
];
/* 允許新增：標記 [Universe 換殼] 的行、新的設定值、新的啟動流程 */
const ALLOWED_ADDED = [
  /\[Universe 換殼\]/, /^var FIREBASE_CONFIG = null;$/, /^var FIREBASE_ENABLED = false;$/, /^var ADMIN_UNLOCK_PIN = '';$/, /^var REMOTE_UNLOCK_PINS = \{\};$/,
  /^UniverseTetris\.wrapStartGame\(\);$/, /^UniverseTetris\.boot\(function\(\)\{$/, /^  loadPlayer\(\);$/,
  /^  var (baseImg|dispImg) = document\.getElementById\("(base-avatar-preview|av-preview-img)"\);$/,
  /^  if\((baseImg|dispImg)\) \1\.src = getAvatarUrl\(PLAYER\.(baseAvatarKey|displayAvatarKey)\);$/,
  /^  refreshPlayerMetaUI\(\);$/, /^  updateBestDisp\(\);$/, /^\}\);$/
];

test("函式以外的程式（常數、方塊表、音效表、鍵盤與按鈕事件…）只有預期的換殼差異", () => {
  const now = residueLines(js), orig = baseline.residueLines;
  assert.ok(Array.isArray(orig) && orig.length > 300, "基準缺少頂層程式");
  const removed = multisetDiff(orig, now), added = multisetDiff(now, orig);
  const badRemoved = removed.filter((l) => !ALLOWED_REMOVED.some((r) => r.test(l)));
  const badAdded = added.filter((l) => !ALLOWED_ADDED.some((r) => r.test(l)));
  assert.deepEqual(badRemoved, [], "未預期刪除的原版程式");
  assert.deepEqual(badAdded, [], "未預期新增的程式");
  assert.ok(now.includes("const COLS=10, ROWS=20;"), "棋盤大小常數必須保留");
});

test("網頁不載入 Firebase SDK、沒有舊資料庫網址或 API Key", () => {
  assert.doesNotMatch(html, /gstatic\.com\/firebasejs/);
  assert.doesNotMatch(html, /firebaseio\.com/);
  assert.doesNotMatch(html, /AIza[0-9A-Za-z_-]{20,}/);
  assert.match(html, /<script src="\.\.\/shared\/universe-sdk\.js"><\/script>/);
  assert.match(html, /<script src="universe-shell\.js"><\/script>/);
});

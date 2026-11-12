/* 節奏遊戲宇宙版：「遊戲核心沒有被修改」驗證
   執行：node --test universe/rhythm/tests/rhythm-core-integrity.test.mjs   （在 repository 根目錄）

   基準：tools/original-functions.sha256.json（由正式版 vparty-rhythm-game@9caa7dc index.html 計算）
   - 音符判定、速度、Hit Window、Perfect/Good/Miss、Hold、計分、Combo、歌曲、Beatmap、字幕、音訊、YouTube、
     難度、手機操作、結算流程：必須與原版逐字相同（SHA-256）
   - 只有列在 ALLOWED_CHANGES 的「玩家資料層」函式允許修改
   - <style> 與頁面 HTML 結構必須與原版逐字相同
   - 函式以外的程式（常數、判定視窗、按鍵、事件…）只允許列出的換殼差異 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inlineScripts, extractFunctions, sha256, styleBlock, bodyMarkup, residueLines, revertShellEdits } from "../../shared/tools/js-functions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, "..");
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const baseline = JSON.parse(fs.readFileSync(path.join(DIR, "tools/original-functions.sha256.json"), "utf8"));
const js = inlineScripts(html);
const all = extractFunctions(js);
const now = Object.fromEntries(all.map((f) => [f.name, f.sha256]));
const textOf = Object.fromEntries(all.map((f) => [f.name, f.text]));

/* 允許修改的玩家資料層函式（身份、Firebase、V幣、稱號、頭像解鎖、Mock 成績、排行榜資料來源、管理後台） */
const ALLOWED_CHANGES = new Set([
  "loadAvatarCatalog", "getAvatarByKey", "ensurePlayerProfile", "loadUnlockedAvatars", "unlockAvatar", "equipDisplayAvatar",
  "handleUnlockPin", "migrateLocalProfile", "loadPlayerProfile", "savePlayerProfile", "_saveLocalProfile",
  "isProfileIdentityDirty", "isDisplayAvatarAllowed", "validateDisplayAvatarForCurrentIdentity", "getAvatarDisplayName",
  "updateProfileDataStatic", "refreshProfileMetaInfo", "startEditBaseAvatar", "startEditDisplayAvatar",
  "loadEquippedTitleForCurrentPlayer", "toggleTitleCollectionPanel", "equipSharedTitle", "unlockRhythmTitle",
  "checkAndUnlockRhythmTitles", "hasConfirmedPlayerIdentityForHint", "readRhythmDailyChallengeHintStatus",
  "getRhythmDailyChallengeHintText", "toggleVcoinWalletPanel", "updateGamePlayerCard", "openUnlockPanel", "submitUnlockPin",
  "ensureFirebaseReady", "start", "initFirebase", "claimDailyVCoinsForRhythm", "claimRhythmDailyChallengeVCoins",
  "claimRhythmVCoinRewardsAfterSong", "buildRhythmVCoinResultMessage", "saveScore", "renderLBFromLocal",
  "adminClearAll", "adminDeleteScore", "renderAdminPanel", "checkAdminPw", "adminExportLB", "adminMigrateScores",
  "adminChangePw", "handleLogoClick"
]);

/* 遊戲核心（必須存在且逐字相同） */
const CORE = [
  // 判定、計分、Combo、Hold
  "press", "noteHit", "noteMiss", "addScore", "finishHold", "tickHolds", "updateHUD", "checkComboMilestone",
  "triggerMilestone", "resetMilestones", "playMilestoneSound",
  // 音符產生、速度、移動、主迴圈
  "spawnNotes", "makeNote", "moveNotes", "getNoteSpeed", "getLeadMs", "getHZpx", "loop", "startLoop", "countdown", "showCnt",
  // 開局、結算、暫停
  "initGame", "endGame", "mkG", "togglePause", "resumeGame", "quitGame", "resumeGameWithCountdown", "pauseGameForProfile",
  "resumeGameFromProfile", "openProfileFromGameCard", "getGradeMsg",
  // 難度、Beatmap、歌曲、字幕
  "normalizeDiff", "normalizeLBDiff", "getSelectedGameDiff", "filterBeatmapByDiff", "makeBeatmap", "normalizeSongPaths",
  "ensureSongsLoaded", "loadSongs", "renderSongCards", "parseSRT", "loadSRT", "updateLyrics", "resolvePublicAssetSrc",
  "resolveAssetPath",
  // 音訊、YouTube／MV
  "initACtx", "loadAudio", "startAudio", "stopAudio", "pauseAudio", "resumeAudio", "getGameTimeSec", "getGameTimeMs",
  "ytCmd", "ytPlay", "ytResume", "ytPlayFrom", "ytPause", "ytStop", "setupBackground", "toggleMV",
  // 軌道、特效、手機與畫面
  "buildLanes", "flashLane", "showFX", "updatePortraitClass", "toggleFullscreen", "updateFsBtn", "go",
  // 排行榜畫面（只換資料來源 renderLBFromLocal）
  "renderLB", "renderLBRows"
];

test("遊戲核心函式（判定、速度、Hit Window、Hold、計分、Combo、歌曲、Beatmap、字幕、音訊、YouTube、難度、手機、結算）與原版逐字相同", () => {
  for (const name of CORE) {
    assert.ok(baseline.functions[name], `基準缺少 ${name}`);
    assert.equal(now[name], baseline.functions[name], `核心函式被修改：${name}`);
  }
});

/* 只改一行或只加守門的函式：還原後必須與原版逐字相同 */
const TAG = "  // [Universe 換殼]";
const SMALL_EDITS = {
  getAvatarByKey: [], getAvatarDisplayName: [], startEditBaseAvatar: [], startEditDisplayAvatar: [], handleLogoClick: [],
  updateProfileDataStatic: [["  if (keyEl) keyEl.textContent = PLAYER.playerId || '—';" + TAG + " 顯示遊戲宇宙 playerId（不組合舊 playerKey）", "  if (keyEl) keyEl.textContent = pKey || '—';"]],
  updateGamePlayerCard: [["  if (vcoin) vcoin.textContent = '🪙 V幣：' + UniverseRhythm.walletText();" + TAG + " V幣尚未開放", "  if (vcoin) vcoin.textContent = '🪙 V幣：' + vcoinText;"]]
};
test("只做小修改的函式：還原列出的修改行後與原版逐字相同", () => {
  for (const [name, reps] of Object.entries(SMALL_EDITS)) {
    assert.notEqual(now[name], baseline.functions[name], `${name} 應該有換殼修改`);
    assert.equal(sha256(revertShellEdits(textOf[name], reps)), baseline.functions[name], `${name} 有未列出的修改`);
  }
});

test("除了列出的玩家資料層函式之外，所有原版函式都沒有被修改", () => {
  const changed = Object.keys(baseline.functions).filter((n) => now[n] !== baseline.functions[n]);
  const unexpected = changed.filter((n) => !ALLOWED_CHANGES.has(n));
  assert.deepEqual(unexpected, [], "未預期的修改：" + unexpected.join(", "));
  assert.equal(Object.keys(baseline.functions).length, 228, "基準函式數量異常");
  const added = Object.keys(now).filter((n) => !(n in baseline.functions));
  assert.deepEqual(added, [], "不應新增遊戲內函式（新功能放在 universe-shell.js）");
});

test("CSS 與頁面 HTML 結構和原版逐字相同（換殼只在 <head> 加入 SDK）", () => {
  assert.equal(sha256(styleBlock(html)), baseline.styleSha256, "<style> 被修改");
  assert.equal(sha256(bodyMarkup(html)), baseline.bodyMarkupSha256, "頁面結構被修改");
});

function multisetDiff(a, b) {
  const count = new Map();
  for (const l of b) count.set(l, (count.get(l) || 0) + 1);
  const out = [];
  for (const l of a) { const c = count.get(l) || 0; if (c > 0) count.set(l, c - 1); else out.push(l); }
  return out;
}

/* 允許刪除：舊 Firebase 設定、前端寫死的 PIN 與管理密碼、Firebase 啟動、原本「開始遊戲 → 角色設定」的導向 */
const ALLOWED_REMOVED = [
  /^var FIREBASE_CONFIG = \{$/, /^  (apiKey|authDomain|databaseURL|projectId|storageBucket|messagingSenderId|appId|measurementId):\s+"\[REDACTED\]",?$/,
  /^\};$/, /^var FIREBASE_ENABLED = true;$/, /^var ADMIN_UNLOCK_PIN = '\[REDACTED\]';$/, /^var REMOTE_UNLOCK_PINS = \{$/,
  /^  '\[REDACTED\]': '[a-z_0-9]+',?$/, /^var ADMIN_DEFAULT_PW = '\[REDACTED\]';$/,
  /^\/\/ 啟動時提前初始化 Firebase \+ 載入歌曲，減少等待$/, /^ensureFirebaseReady\(\);$/,
  /^document\.getElementById\('btn-play'\)\.onclick += function\(\)\{ setProfileOpenedFromGameUI\(false\); initProfile\(\); go\('s-profile'\); \};$/,
  /^document\.getElementById\('btn-back-song'\)\.onclick += function\(\)\{ go\('s-profile'\); \};$/
];
const ALLOWED_ADDED = [
  /\[Universe 換殼\]/, /^var FIREBASE_CONFIG = null;$/, /^var FIREBASE_ENABLED = false;$/, /^var ADMIN_UNLOCK_PIN = '';$/,
  /^var REMOTE_UNLOCK_PINS = \{\};$/, /^UniverseRhythm\.boot\(function\(\)\{$/, /^  loadPlayerProfile\(\);$/,
  /^  validateDisplayAvatarForCurrentIdentity\(\);$/, /^  updateGamePlayerCard\(\);$/, /^  updateRhythmDailyChallengeHint\(\);$/, /^\}\);$/
];

test("函式以外的程式（判定視窗、按鍵、歌曲清單、事件綁定…）只有預期的換殼差異", () => {
  const cur = residueLines(js), orig = baseline.residueLines;
  assert.equal(orig.length, 651, "基準頂層程式行數異常");
  const removed = multisetDiff(orig, cur), added = multisetDiff(cur, orig);
  assert.deepEqual(removed.filter((l) => !ALLOWED_REMOVED.some((r) => r.test(l))), [], "未預期刪除的原版程式");
  assert.deepEqual(added.filter((l) => !ALLOWED_ADDED.some((r) => r.test(l))), [], "未預期新增的程式");
  assert.ok(cur.includes("var PERF_MS = 72, GOOD_MS = 145;"), "Hit Window 常數必須保留");
  assert.ok(cur.some((l) => /^var KEYS\b/.test(l) || /KEYS *= *\[/.test(l)), "鍵位設定必須保留");
});

test("網頁不載入 Firebase SDK、沒有 API Key、PIN 或管理密碼；歌曲資料仍由原版網址唯讀載入", () => {
  assert.doesNotMatch(html, /gstatic\.com\/firebasejs/);
  assert.doesNotMatch(html, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(html, /vparty-rhythm-game-default-rtdb/);
  assert.match(html, /var ADMIN_UNLOCK_PIN = '';/);
  assert.match(html, /var REMOTE_UNLOCK_PINS = \{\};/);
  assert.match(html, /var ADMIN_DEFAULT_PW = '';/);
  assert.match(html, /<script src="\.\.\/shared\/universe-sdk\.js"><\/script>/);
  assert.match(html, /<script src="universe-shell\.js"><\/script>/);
  assert.match(html, /fetch\('https:\/\/vashyang1120\.github\.io\/vparty-rhythm-game\/songs\.json\?'/);
  // 宇宙版沒有複製音樂編輯器或管理頁
  assert.ok(!fs.existsSync(path.join(DIR, "tools/beatmap-editor")));
  assert.ok(!fs.existsSync(path.join(DIR, "vparty_admin.html")));
});

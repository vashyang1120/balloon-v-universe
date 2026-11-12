/* 知識挑戰宇宙版：「遊戲核心沒有被修改」驗證
   執行：node --test universe/quiz/tests/quiz-core-integrity.test.mjs   （在 repository 根目錄）

   基準：tools/original-functions.sha256.json（由正式版 vparty-quiz-game@93df14f main.js／style.css／index.html 計算）
   - 出題、選項順序、倒數、判定、計分、combo、年級／科目、結算、教育功能、年級榜與總榜計算：逐字相同（SHA-256）
   - 只做「小修改」的函式：把列出的修改行還原後，必須與原版逐字相同
   - 只有列在 REPLACED 的玩家資料層函式整段替換
   - style.css 與頁面 HTML 結構和原版逐字相同 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFunctions, sha256, externalBodyMarkup, residueLines, revertShellEdits } from "../../shared/tools/js-functions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, "..");
const js = fs.readFileSync(path.join(DIR, "main.js"), "utf8");
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const css = fs.readFileSync(path.join(DIR, "style.css"), "utf8");
const baseline = JSON.parse(fs.readFileSync(path.join(DIR, "tools/original-functions.sha256.json"), "utf8"));
const fns = Object.fromEntries(extractFunctions(js).map((f) => [f.name, f]));
const TAG = "  // [Universe 換殼]";

/* 整段替換的玩家資料層函式 */
const REPLACED = new Set([
  "openProfileTitleCollection", "makePlayerKey", "isDisplayAvatarAllowed", "validateDisplayAvatarForCurrentIdentity",
  "ensureFirebaseReady", "start", "loadAvatarCatalog", "loadUnlockedAvatars", "ensurePlayerProfile", "loadPlayerLocal",
  "savePlayerLocal", "hasConfirmedQuizProfile", "writePlayerProfileCurrent", "savePlayer", "loadQuestionOverrides",
  "saveLocalLog", "saveGameLog", "ensureXiaovBaseCatalog", "unlockXiaovBaseAfterGameComplete", "loadDailyChallengeStatus",
  "saveDailyChallengeCompletion", "buildCompletionPayload", "alreadyClaimedResult", "pendingResult", "updateWalletBalanceUI",
  "loadWalletBalance", "applyVCoinEarnTransaction", "claimDailyAnyGameReward", "syncLeaderboardTitleSnapshot",
  "loadQuizTitleData", "equipQuizTitle", "unlockQuizBadgeAndTitle", "checkAndUnlockQuizBadges", "updateQuizProgress",
  "updateGradeLeaderboard", "updateMainLeaderboardFromGrades", "readQuizProgressMap", "readStoredQuizAcademyProgress",
  "readGradeLeaderboardSelfSummary", "readGameLogsProgressRoot", "readGameLogsAcademyFallback", "updateQuizAcademyProgress",
  "renderLeaderboard", "getAdminPassword", "tryAdminLogin", "initAdminEntrance", "loadAdminData", "updateQuestionOverride",
  "setAdminQuestionDisabled", "saveAdminQuestionNote", "changeAdminPassword"
]);

/* 只改幾行（或只加一行守門）的函式：還原後必須與原版逐字相同 */
const SMALL_EDITS = {
  getAvatarByKey: [],
  getBaseAvatarName: [],
  buildAvatarPicker: [],
  showVCoinRewardBanner: [],
  loadQuestions: [[
    '  return fetch(QUIZ_ASSET_ROOT + "quiz_questions.json?v=" + encodeURIComponent(QUIZ_VERSION), { cache:"no-store" })' + TAG + " 正式題庫（原版網址，唯讀）",
    '  return fetch("./quiz_questions.json?v=" + encodeURIComponent(QUIZ_VERSION), { cache:"no-store" })'
  ]],
  saveQuizResult: [
    ['      var lines = ["✅ " + UniverseQuiz.savedText()];' + TAG + " 本場成績只存在本分頁（Mock）", '      var lines = ["✅ 本次紀錄已保存"];'],
    ['        lines.push("🎯 今日挑戰完成（" + UniverseQuiz.labels.dailyRewardPending + "）");' + TAG + " +10 待 WalletService 決議", '        lines.push("🎯 今日挑戰完成，+10 V幣待補領");'],
    ['      $("save-status").textContent = UniverseQuiz.saveFailedText();' + TAG, '      $("save-status").textContent = "⚠️ Firebase 寫入可能失敗，已保留本機測試紀錄。";']
  ],
  renderDailyChallengeCard: [
    ["      stat.textContent = UniverseQuiz.dailyChallengeText(true);" + TAG, '      stat.textContent = "今日挑戰已完成，但 +10 V幣尚未領取；再完成一次今日挑戰可嘗試補領。";'],
    ["      stat.textContent = UniverseQuiz.dailyChallengeText(false);" + TAG, '      stat.textContent = "完成指定年級與科目後，可領取 +10 V幣。";'],
    ['    btn.textContent = status.completed ? (recordForButton.rewardClaimed === true ? "已完成" : "再挑戰一次") : "開始今日挑戰";' + TAG + " 不再提示補領 V幣",
      '    btn.textContent = status.completed ? (recordForButton.rewardClaimed === true ? "已完成" : "補領今日獎勵") : "開始今日挑戰";']
  ],
  renderEquippedTitle: [[
    "  var name = (PLAYER_EQUIPPED_TITLE && PLAYER_EQUIPPED_TITLE.name) ? PLAYER_EQUIPPED_TITLE.name : UniverseQuiz.titleText();" + TAG,
    '  var name = (PLAYER_EQUIPPED_TITLE && PLAYER_EQUIPPED_TITLE.name) ? PLAYER_EQUIPPED_TITLE.name : "未裝備";'
  ]],
  init: [[
    '  showScreen("screen-title");' + TAG + " 身份由遊戲宇宙提供，不在遊戲內建立身份",
    '  showScreen(alreadyConfirmed ? "screen-title" : "screen-profile");\n  if (!alreadyConfirmed) {\n    toast("首次遊玩請先確認玩家身份。", 3200);\n  }'
  ]]
};

/* 遊戲核心（必須存在且逐字相同） */
const CORE = [
  // 題庫、出題、選項順序、題目修正的套用規則
  "applyQuestionOverrides", "isQuestionEnabled", "getQuestionById", "getQuestionPool", "shuffle", "getDedupedQuestionPool",
  "normalizeQuestionChoicesForPlay", "prepareQuestionsForPlay", "buildSetupOptions", "updateQuestionCountHint",
  "randInt", "buildUniqueChoices", "makeMathQuestionPayload", "makeGeneratedMathQuestion", "buildGeneratedMathQuestions",
  // 作答流程、倒數、判定、計分、combo、結算
  "startQuiz", "startQuizTimer", "stopQuizTimer", "stopQuestionTimer", "startQuestionCountdown", "updateQuestionTimerUI",
  "handleQuestionTimeout", "pauseQuiz", "resumeQuiz", "showPauseOverlay", "hidePauseOverlay", "renderQuestion",
  "answerQuestion", "revealAnswerResult", "nextQuestion", "finishQuiz", "buildQuizRecord",
  // 年級榜／總榜／V學園（教育功能）計算
  "makeSubjectProgressFromRecord", "shouldUpdateBestRecord", "buildGradeRecordFromProgress", "buildMainRecordFromGradeRecords",
  "compareMainRows", "compareGradeRows", "renderLeaderboardRows", "updateLeaderboardTabs", "getGradeName", "getSubjectName",
  "subjectSortIndex", "getTotalSubjectSlots", "calculateQuizAcademyProgress", "hasAcademyActivity",
  "calculateQuizPowerFromGradeSummary", "buildAcademyProgressFromGradeLeaderboards", "mergeProgressRoots",
  "pickBetterSubjectProgress", "loadQuizAcademyProgressSummary", "getAcademyTitle", "renderAcademyProgress",
  "refreshAcademyProgressCard", "buildAcademyResultLines", "isFullScoreRecord",
  // 今日挑戰的出題與完成判定
  "getTaiwanDateKey", "hashDateKeyForDailyChallenge", "getDailyChallengeForDate", "isRecordMatchingDailyChallenge",
  "openDailyChallenge", "showDailyChallengeResultBanner",
  // 音效、音樂、主持人、手機與畫面
  "ensureAudioContext", "beep", "playTick", "playCorrect", "playWrong", "playTimeout", "loadSongs", "playSong",
  "setHostMessage", "setImageSrc", "showScreen", "toggleFullscreen", "bindEvents", "bindMusicEvents"
];

test("遊戲核心（題庫套用規則、出題、倒數、判定、計分、combo、結算、年級榜／總榜計算、V學園、今日挑戰判定）與原版逐字相同", () => {
  for (const name of CORE) {
    assert.ok(baseline.functions[name], `基準缺少 ${name}`);
    assert.ok(fns[name], `缺少函式 ${name}`);
    assert.equal(fns[name].sha256, baseline.functions[name], `核心函式被修改：${name}`);
  }
});

test("只做小修改的函式：還原列出的修改行後與原版逐字相同（證明其他部分沒動）", () => {
  for (const [name, reps] of Object.entries(SMALL_EDITS)) {
    assert.notEqual(fns[name].sha256, baseline.functions[name], `${name} 應該有換殼修改`);
    assert.equal(sha256(revertShellEdits(fns[name].text, reps)), baseline.functions[name], `${name} 有未列出的修改`);
  }
});

test("除了列出的玩家資料層函式之外，所有原版函式都沒有被修改", () => {
  const changed = Object.keys(baseline.functions).filter((n) => !fns[n] || fns[n].sha256 !== baseline.functions[n]);
  const unexpected = changed.filter((n) => !REPLACED.has(n) && !(n in SMALL_EDITS));
  assert.deepEqual(unexpected, [], "未預期的修改：" + unexpected.join(", "));
  assert.equal(Object.keys(baseline.functions).length, 239);
  assert.deepEqual(Object.keys(fns).filter((n) => !(n in baseline.functions)), [], "不應新增遊戲內函式");
});

test("style.css 與頁面 HTML 結構和原版逐字相同", () => {
  assert.equal(sha256(css), baseline.styleSha256, "style.css 被修改");
  assert.equal(sha256(externalBodyMarkup(html)), baseline.bodyMarkupSha256, "頁面結構被修改");
});

function multisetDiff(a, b) {
  const count = new Map();
  for (const l of b) count.set(l, (count.get(l) || 0) + 1);
  const out = [];
  for (const l of a) { const c = count.get(l) || 0; if (c > 0) count.set(l, c - 1); else out.push(l); }
  return out;
}

test("函式以外的程式（常數、題目時間、年級／科目表…）只有預期的換殼差異", () => {
  const cur = residueLines(js), orig = baseline.residueLines;
  assert.equal(orig.length, 387);
  const removed = multisetDiff(orig, cur), added = multisetDiff(cur, orig);
  const okRemoved = [/^var FIREBASE_CONFIG = \{$/, /^  (apiKey|authDomain|databaseURL|projectId|storageBucket|messagingSenderId|appId|measurementId):"\[REDACTED\]",?$/,
    /^\};$/, /^var FIREBASE_ENABLED = true;$/, /^var GAME_MENU_URL = "https:\/\/balloonv\.com\/[^"]+";$/, /^document\.addEventListener\("DOMContentLoaded", init\);$/];
  const okAdded = [/\[Universe 換殼\]/, /^var FIREBASE_CONFIG = null;$/, /^var FIREBASE_ENABLED = false;$/, /^\/\* 遊戲宇宙版 /, /^   由 vashyang1120\/vparty-quiz-game@/, /^   經 universe\/quiz\/tools\/build_prototype\.py/];
  assert.deepEqual(removed.filter((l) => !okRemoved.some((r) => r.test(l))), [], "未預期刪除");
  assert.deepEqual(added.filter((l) => !okAdded.some((r) => r.test(l))), [], "未預期新增");
  assert.ok(cur.includes("var QUESTION_TIME_LIMIT = 15;"), "每題 15 秒必須保留");
});

test("不載入 Firebase SDK、沒有舊資料庫設定；管理後台與題目修改停用；題目修正改讀唯讀檔案", () => {
  assert.doesNotMatch(html, /gstatic\.com\/firebasejs/);
  assert.doesNotMatch(js, /AIza[0-9A-Za-z_-]{20,}/);
  assert.doesNotMatch(js, /firebaseio\.com|firebasedatabase\.app/);
  assert.match(js, /var FIREBASE_ENABLED = false;/);
  assert.doesNotMatch(fns.getAdminPassword.text, /localStorage/);
  assert.match(fns.updateQuestionOverride.text, /Promise\.reject/);
  assert.match(fns.loadQuestionOverrides.text, /UniverseQuiz\.loadApprovedOverrides/);
  const ov = JSON.parse(fs.readFileSync(path.join(DIR, "approved-question-overrides.json"), "utf8"));
  assert.equal(ov.schema, "bv-quiz-question-overrides-v1");
  assert.ok(["not_exported", "exported"].includes(ov.status));
  assert.deepEqual(ov.allowedFields, ["disabled", "active", "quality", "reviewNote", "reason", "updatedAt", "updatedBy"]);
});

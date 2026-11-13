/* 遊戲宇宙版 universe-game-migration-v0.2.0-three-games-integration-test-1
   由 vashyang1120/vparty-quiz-game@93df14f2ca3e19f7ebd34309548df7f65aa84967 main.js（SHA-256 3d3153f49af6f7e4c4ba7cdc94932bad7b066552d2ceb6cc19cbba1fa798f354）
   經 universe/quiz/tools/build_prototype.py 產生。請勿直接修改正式遊戲 Repository。 */
/* 小V知識挑戰 quiz-v0.2.44
   目標：穩定可跑、沿用共用玩家身份、寫入 gameLogs/quiz、quizProgress 與年級累積排行榜。
   V幣：每日任一遊戲完成一次 +30 V幣；問答今日挑戰 +10 V幣，分別寫入 dailyRewards 與 dailyChallenges/quiz，正式來源為 Firebase wallet / vCoinLogs。
*/

// Firebase compat SDK - same project as rhythm/tetris games
// [Universe 換殼] 舊 Firebase 設定已移除：宇宙版不讀、不寫舊 Firebase
var FIREBASE_CONFIG = null;
var FIREBASE_ENABLED = false;

var QUIZ_VERSION = "quiz-v0.2.44";

var DB_PATHS = {
  gameLogs:            "gameLogs/quiz",
  leaderboards:        "leaderboards/quiz/main",
  leaderboardsMain:    "leaderboards/quiz/main",
  leaderboardsByGrade: "leaderboards/quiz/byGrade",
  players:             "players",
  avatarCatalog:       "avatarCatalog",
  questionOverrides:  "quizQuestionOverrides"
};

var db = null;
var firebaseDb = null;
var firebaseAuthReady = false;
var firebaseInitPromise = null;
var AVATAR_CATALOG = {};
var unlockedAvatars = {};

var AV_BASE = "https://vashyang1120.github.io/vparty-rhythm-game/assets/avatars/";
var AVATARS = [
  {key:"boy1",url:AV_BASE+"boy1.png",label:"男生1"},
  {key:"girl1",url:AV_BASE+"girl1.png",label:"女生1"},
  {key:"boy2",url:AV_BASE+"boy2.png",label:"男生2"},
  {key:"girl2",url:AV_BASE+"girl2.png",label:"女生2"},
  {key:"cat1",url:AV_BASE+"cat1.png",label:"貓咪1"},
  {key:"cat2",url:AV_BASE+"cat2.png",label:"貓咪2"},
  {key:"fat1",url:AV_BASE+"fat1.png",label:"胖胖"},
  {key:"girl3",url:AV_BASE+"girl3.png",label:"女生3"},
  {key:"curl1",url:AV_BASE+"curl1.png",label:"捲髮1"},
  {key:"boy3",url:AV_BASE+"boy3.png",label:"男生3"},
  {key:"girl4",url:AV_BASE+"girl4.png",label:"女生4"},
  {key:"girl5",url:AV_BASE+"girl5.png",label:"女生5"},
  {key:"curl2",url:AV_BASE+"curl2.png",label:"捲髮2"},
  {key:"dog1",url:AV_BASE+"dog1.png",label:"狗狗1"},
  {key:"dog2",url:AV_BASE+"dog2.png",label:"狗狗2"},
  {key:"dog3",url:AV_BASE+"dog3.png",label:"狗狗3"},
  {key:"dog4",url:AV_BASE+"dog4.png",label:"狗狗4"}
];

var UNLOCKABLE_AVATARS = [
  { key: "xiaov_base",         name: "小V",         file: AV_BASE + "xiaov_base.png" },
  { key: "dance_sister_01",    name: "唱跳姐姐",    file: AV_BASE + "dance_sister_01.png" },
  { key: "balloon_sister_01",  name: "氣球姐姐 1",  file: AV_BASE + "balloon_sister_01.png" },
  { key: "balloon_sister_02",  name: "氣球姐姐 2",  file: AV_BASE + "balloon_sister_02.png" },
  { key: "balloon_brother_01", name: "氣球哥哥 1",  file: AV_BASE + "balloon_brother_01.png" },
  { key: "balloon_brother_02", name: "氣球哥哥 2",  file: AV_BASE + "balloon_brother_02.png" },
  { key: "balloon_brother_03", name: "氣球哥哥 3",  file: AV_BASE + "balloon_brother_03.png" },
  { key: "bubble_brother_01",  name: "泡泡哥哥",    file: AV_BASE + "bubble_brother_01.png" },
  { key: "xiaov_special",      name: "小V 特別版",  file: AV_BASE + "xiaov_special.png" }
];

var PLAYER = {
  id: "玩家",
  name: "玩家",
  baseAvatarKey: "boy1",
  displayAvatarKey: "boy1",
  avatarKey: "boy1",
  avatarSrc: AV_BASE + "boy1.png",
  playerKey: ""
};
var PLAYER_WALLET_BALANCE = null;
var PLAYER_EQUIPPED_TITLE = null;
var PLAYER_QUIZ_TITLES = {};
var PLAYER_QUIZ_BADGES = {};

var QUESTIONS = [];
var QUESTION_OVERRIDES = {};
var selectedGrade = "low";
var selectedSubject = "math";
var leaderboardMode = "main";
var pickerMode = "base";

var QUESTION_TIME_LIMIT = 15;
var soundEnabled = localStorage.getItem("vquiz_soundEnabled") !== "false";
var audioCtx = null;
var SFX_MASTER_GAIN = 3.0;


var ASSET_ROOT = "https://vashyang1120.github.io/vparty-rhythm-game/";
var QUIZ_ASSET_ROOT = "https://vashyang1120.github.io/vparty-quiz-game/";
var RHYTHM_TEST_ASSET_ROOT = "https://vashyang1120.github.io/vparty-rhythm-game/test/";
var HOST_IMAGE_FALLBACK = AV_BASE + "xiaov_base.png";

function normalizeAssetPath(path) {
  if (!path) return "";
  var s = String(path).trim();
  s = s.replace(/^\.\//, "");
  while (s.indexOf("../") === 0) s = s.slice(3);
  s = s.replace(/^\/+/, "");
  if (s.indexOf("vparty-rhythm-game/") === 0) s = s.replace(/^vparty-rhythm-game\//, "");
  if (s.indexOf("vparty-quiz-game/") === 0) s = s.replace(/^vparty-quiz-game\//, "");
  return s;
}

function uniqueList(list) {
  var seen = {};
  return (list || []).filter(function(item){
    if (!item || seen[item]) return false;
    seen[item] = true;
    return true;
  });
}

function resolveQuizAssetPath(path) {
  if (!path) return "";
  var s = String(path).trim();
  if (/^https?:\/\//.test(s) || /^data:/.test(s)) return s;
  var clean = normalizeAssetPath(s);
  if (clean.indexOf("assets/") === 0) {
    return QUIZ_ASSET_ROOT + clean;
  }
  return s;
}

function resolveHostImageSrc(path) {
  var list = resolveHostImageCandidates(path);
  return list[0] || "";
}

function resolveHostImageCandidates(path) {
  if (!path) return [];
  var s = String(path).trim();
  if (/^https?:\/\//.test(s) || /^data:/.test(s)) return [s];
  var clean = normalizeAssetPath(s);
  if (clean.indexOf("assets/") !== 0) return [s];
  return uniqueList([
    "./" + clean,
    RHYTHM_TEST_ASSET_ROOT + clean,
    QUIZ_ASSET_ROOT + clean,
    ASSET_ROOT + clean,
    resolveQuizAssetPath(clean)
  ]);
}

var HOST_ART = {
  intro: "assets/hosts/xiaov_quiz_host_intro_v1.png",
  question: "assets/hosts/xiaov_quiz_host_question_v1.png",
  correct: "assets/hosts/xiaov_quiz_host_correct_v1.png",
  timewarning: "assets/hosts/xiaov_quiz_host_timewarning_v1.png",
  wrong: "assets/hosts/xiaov_quiz_host_wrong_v1.png",
  timeout: "assets/hosts/xiaov_quiz_host_timeout_v2.png",
  result: "assets/hosts/xiaov_quiz_host_result_v1.png",
  ranking: "assets/hosts/xiaov_quiz_host_ranking_v1.png"
};
var GAME_MENU_URL = UniverseQuiz.lobbyUrl();  // [Universe 換殼] 「遊戲選單」改回遊戲宇宙大廳（同一位玩家）

// 音樂播放器：讀取節奏遊戲 songs.json，歌曲檔不複製到問答 repo
var SONG_BASE = "https://vashyang1120.github.io/vparty-rhythm-game/";
var MUSIC_EMOJIS = ["🎈","🎤","✨","💫","🌟","🎵","🎶","🎀","🎪","⭐"];
var SONGS = [];
var musicAudio = new Audio();
var musicIndex = 0;
var musicPlaying = false;
var musicLoop = "all";
var musicShuffle = false;
var musicProgressTimer = null;
var quizBgmManaged = false;
musicAudio.volume = 0.10;

var quizState = {
  active: false,
  currentIndex: 0,
  questions: [],
  answers: [],
  score: 0,
  correctCount: 0,
  combo: 0,
  maxCombo: 0,
  startedAt: 0,
  questionStartedAt: 0,
  timeTimer: null,
  questionTimer: null,
  questionTimeLeft: QUESTION_TIME_LIMIT,
  questionAnswered: false,
  paused: false,
  pauseStartedAt: 0,
  wasMusicPlayingBeforePause: false,
  totalQuestions: 10
};

var GRADE_OPTIONS = [
  {key:"low", name:"低年級", desc:"小一～小二"},
  {key:"middle", name:"中年級", desc:"小三～小四"},
  {key:"high", name:"高年級", desc:"小五～小六"}
];

var SUBJECT_OPTIONS = [
  {key:"math", name:"數學", emoji:"➕"},
  {key:"mandarin", name:"國語", emoji:"📖"},
  {key:"science", name:"自然", emoji:"🔬"},
  {key:"social", name:"社會", emoji:"🌏"},
  {key:"english", name:"英文", emoji:"ABC"},
  {key:"balloon", name:"氣球知識", emoji:"🎈"},
  {key:"brand", name:"小V品牌", emoji:"✨"},
  {key:"brain", name:"腦筋急轉彎", emoji:"🧠"}
];

// ── v0.2.34 每日挑戰第一版：每日指定一個年級 + 科目，不額外發 V幣 ──
var DAILY_CHALLENGE_GAME_ID = "quiz";
var DAILY_CHALLENGE_STATUS = null;


// ── v0.2.33 數學題目模板系統：第一版只用在數學科目 ──
// 原則：每場數學最多混入 4 題動態模板題，其餘仍使用靜態題庫，降低風險並減少背答案。
var MATH_TEMPLATE_MAX_PER_GAME = 4;
var MATH_QUESTION_TEMPLATES = [
  {
    templateId: "low_add_within_20",
    gradeBand: "low",
    difficulty: 1,
    make: function(){
      var a = randInt(2, 12);
      var b = randInt(2, 8);
      var ans = a + b;
      return makeMathQuestionPayload(
        "小V有 " + a + " 顆氣球，又收到 " + b + " 顆，現在共有幾顆？",
        ans,
        " 顆",
        a + " + " + b + " = " + ans + "，所以共有 " + ans + " 顆。",
        [ans + 1, ans - 1, ans + 2]
      );
    }
  },
  {
    templateId: "low_sub_within_20",
    gradeBand: "low",
    difficulty: 1,
    make: function(){
      var a = randInt(8, 20);
      var b = randInt(2, Math.min(9, a - 1));
      var ans = a - b;
      return makeMathQuestionPayload(
        "桌上有 " + a + " 顆氣球，送出 " + b + " 顆，還剩幾顆？",
        ans,
        " 顆",
        a + " - " + b + " = " + ans + "，所以還剩 " + ans + " 顆。",
        [ans + 1, ans - 1, ans + 2]
      );
    }
  },
  {
    templateId: "low_two_digit_plus_one_digit",
    gradeBand: "low",
    difficulty: 1,
    make: function(){
      var a = randInt(12, 39);
      var b = randInt(2, 9);
      var ans = a + b;
      return makeMathQuestionPayload(
        a + " + " + b + " = ?",
        ans,
        "",
        a + " 加 " + b + " 等於 " + ans + "。",
        [ans + 1, ans - 1, ans + 10]
      );
    }
  },
  {
    templateId: "low_money_change_easy",
    gradeBand: "low",
    difficulty: 2,
    make: function(){
      var paid = [20, 30, 50][randInt(0,2)];
      var price = randInt(6, Math.min(25, paid - 3));
      var ans = paid - price;
      return makeMathQuestionPayload(
        "買一個小氣球花了 " + price + " 元，付 " + paid + " 元，要找回幾元？",
        ans,
        " 元",
        paid + " - " + price + " = " + ans + "，所以要找回 " + ans + " 元。",
        [ans + 1, Math.max(1, ans - 1), ans + 5]
      );
    }
  },
  {
    templateId: "middle_multiplication",
    gradeBand: "middle",
    difficulty: 2,
    make: function(){
      var a = randInt(3, 9);
      var b = randInt(3, 9);
      var ans = a * b;
      return makeMathQuestionPayload(
        "每束有 " + a + " 顆氣球，做 " + b + " 束，共需要幾顆？",
        ans,
        " 顆",
        a + " × " + b + " = " + ans + "。",
        [ans + a, ans - a, ans + b]
      );
    }
  },
  {
    templateId: "middle_division",
    gradeBand: "middle",
    difficulty: 2,
    make: function(){
      var b = randInt(3, 9);
      var ans = randInt(3, 9);
      var total = b * ans;
      return makeMathQuestionPayload(
        total + " 顆氣球平均分成 " + b + " 組，每組幾顆？",
        ans,
        " 顆",
        total + " ÷ " + b + " = " + ans + "。",
        [ans + 1, Math.max(1, ans - 1), ans + 2]
      );
    }
  },
  {
    templateId: "middle_two_step",
    gradeBand: "middle",
    difficulty: 3,
    make: function(){
      var groups = randInt(2, 5);
      var each = randInt(4, 9);
      var extra = randInt(3, 12);
      var ans = groups * each + extra;
      return makeMathQuestionPayload(
        "小V做了 " + groups + " 組氣球，每組 " + each + " 顆，又多做 " + extra + " 顆，共幾顆？",
        ans,
        " 顆",
        groups + " × " + each + " + " + extra + " = " + ans + "。",
        [ans + each, ans - extra, ans + groups]
      );
    }
  },
  {
    templateId: "middle_time_minutes",
    gradeBand: "middle",
    difficulty: 2,
    make: function(){
      var start = randInt(10, 35);
      var duration = randInt(12, 35);
      var ans = start + duration;
      return makeMathQuestionPayload(
        "氣球教學從第 " + start + " 分鐘開始，進行 " + duration + " 分鐘後，是第幾分鐘？",
        ans,
        " 分鐘",
        start + " + " + duration + " = " + ans + "。",
        [ans + 5, ans - 5, ans + 1]
      );
    }
  },
  {
    templateId: "high_fraction_same_denominator",
    gradeBand: "high",
    difficulty: 3,
    make: function(){
      var den = [6, 8, 10, 12][randInt(0,3)];
      var a = randInt(1, Math.floor(den/2));
      var b = randInt(1, den - a - 1);
      var num = a + b;
      var ans = num + "/" + den;
      return {
        question: "把 " + a + "/" + den + " 條長條氣球和 " + b + "/" + den + " 條合起來，共是多少條？",
        choices: buildUniqueChoices(ans, [ (num+1) + "/" + den, Math.max(1,num-1) + "/" + den, num + "/" + (den+2) ]),
        answerIndex: 0,
        explanation: "同分母分數相加，分母不變，分子相加：" + a + "/" + den + " + " + b + "/" + den + " = " + ans + "。"
      };
    }
  },
  {
    templateId: "high_decimal_add",
    gradeBand: "high",
    difficulty: 3,
    make: function(){
      var a = randInt(12, 48) / 10;
      var b = randInt(11, 39) / 10;
      var ansNum = Math.round((a + b) * 10) / 10;
      var ans = ansNum.toFixed(1);
      return makeMathQuestionPayload(
        "一段氣球長 " + a.toFixed(1) + " 公尺，另一段長 " + b.toFixed(1) + " 公尺，合起來幾公尺？",
        ans,
        " 公尺",
        a.toFixed(1) + " + " + b.toFixed(1) + " = " + ans + "。",
        [(ansNum + 0.1).toFixed(1), (ansNum - 0.1).toFixed(1), (ansNum + 1).toFixed(1)]
      );
    }
  },
  {
    templateId: "high_ratio",
    gradeBand: "high",
    difficulty: 3,
    make: function(){
      var unitA = randInt(2, 5);
      var unitB = randInt(1, 4);
      var times = randInt(3, 8);
      var totalA = unitA * times;
      var ans = unitB * times;
      return makeMathQuestionPayload(
        "粉色和黃色氣球比例是 " + unitA + ":" + unitB + "。如果粉色有 " + totalA + " 顆，黃色有幾顆？",
        ans,
        " 顆",
        "粉色從 " + unitA + " 變成 " + totalA + "，放大 " + times + " 倍，所以黃色是 " + unitB + " × " + times + " = " + ans + " 顆。",
        [ans + unitB, Math.max(1, ans - unitB), ans + times]
      );
    }
  },
  {
    templateId: "high_average",
    gradeBand: "high",
    difficulty: 3,
    make: function(){
      var a = randInt(6, 16);
      var b = randInt(6, 16);
      var c = randInt(6, 16);
      var sum = a + b + c;
      var ans = Math.round(sum / 3 * 10) / 10;
      var ansText = (ans % 1 === 0) ? String(ans) : ans.toFixed(1);
      return makeMathQuestionPayload(
        "三場活動分別用了 " + a + "、" + b + "、" + c + " 顆氣球，平均每場用幾顆？",
        ansText,
        " 顆",
        "先相加：" + a + " + " + b + " + " + c + " = " + sum + "，再除以 3，平均是 " + ansText + " 顆。",
        [String(Number(ansText)+1), String(Math.max(1, Number(ansText)-1)), String(sum)]
      );
    }
  }
];

function randInt(min, max){
  min = Math.ceil(min); max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildUniqueChoices(correct, distractors){
  var out = [];
  function add(v){
    var s = String(v);
    if (out.indexOf(s) < 0) out.push(s);
  }
  add(correct);
  (distractors || []).forEach(add);
  var base = String(correct);
  var n = parseFloat(base);
  var guard = 0;
  while (out.length < 4 && guard < 20) {
    guard++;
    if (!isNaN(n)) add(String(Math.max(0, Math.round(n + guard))));
    else add(base + "選項" + guard);
  }
  return out.slice(0, 4);
}

function makeMathQuestionPayload(question, answer, suffix, explanation, distractors){
  var correct = String(answer) + (suffix || "");
  var wrongs = (distractors || []).map(function(v){ return String(v) + (suffix || ""); });
  return {
    question: question,
    choices: buildUniqueChoices(correct, wrongs),
    answerIndex: 0,
    explanation: explanation
  };
}

function makeGeneratedMathQuestion(template, index){
  var payload = template.make();
  var now = Date.now();
  return {
    id: "gen:" + template.templateId + ":" + now + ":" + index + ":" + Math.random().toString(36).slice(2, 8),
    templateId: template.templateId,
    generated: true,
    type: "generated",
    source: "template",
    subject: "math",
    subjectName: "數學",
    gradeBand: template.gradeBand,
    gradeBandName: getGradeName(template.gradeBand),
    difficulty: template.difficulty || 1,
    question: payload.question,
    choices: payload.choices,
    answerIndex: payload.answerIndex || 0,
    explanation: payload.explanation,
    tags: ["動態題", "數學模板"],
    disabled: false,
    quality: "ok",
    reviewNote: ""
  };
}

function buildGeneratedMathQuestions(gradeBand, maxCount){
  if (selectedSubject !== "math") return [];
  var templates = MATH_QUESTION_TEMPLATES.filter(function(t){ return t.gradeBand === gradeBand; });
  var results = [];
  var seenTexts = {};
  var attempts = 0;
  while (results.length < maxCount && attempts < maxCount * 10) {
    attempts++;
    var template = templates[randInt(0, templates.length - 1)];
    if (!template) break;
    var q = makeGeneratedMathQuestion(template, attempts);
    var textKey = String(q.question || "").replace(/\s+/g, " ").trim();
    if (!textKey || seenTexts[textKey]) continue;
    seenTexts[textKey] = true;
    results.push(q);
  }
  return results;
}

var QUIZ_BADGE_DEFS = [
  { badgeKey:"quiz_first_clear", titleKey:"v_academy_freshman", name:"V學園新生", description:"完成第一場問答挑戰", type:"first_clear" },
  { badgeKey:"quiz_first_perfect", titleKey:"little_scholar", name:"小小學霸", description:"任一科滿分", type:"first_perfect" },
  { badgeKey:"quiz_brain_perfect", titleKey:"brain_teaser_king", name:"冷笑話王", description:"腦筋急轉彎任一場滿分", type:"brain_perfect" },
  { badgeKey:"quiz_low_all_subjects", titleKey:"low_grade_graduate", name:"低年級畢業", description:"低年級 8 科都挑戰過", type:"grade_all_subjects", gradeBand:"low" },
  { badgeKey:"quiz_middle_all_subjects", titleKey:"middle_grade_graduate", name:"中年級畢業", description:"中年級 8 科都挑戰過", type:"grade_all_subjects", gradeBand:"middle" },
  { badgeKey:"quiz_high_all_subjects", titleKey:"high_grade_graduate", name:"高年級畢業", description:"高年級 8 科都挑戰過", type:"grade_all_subjects", gradeBand:"high" }
];

function $(id){ return document.getElementById(id); }

function toast(msg, dur){
  var el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function(){ el.classList.remove("show"); }, dur || 2400);
}


function setImageSrc(id, src){
  var el = $(id);
  if (!el || !src) return;
  var candidates = resolveHostImageCandidates(src);
  var fallbackCandidates = resolveHostImageCandidates(HOST_IMAGE_FALLBACK);
  var queue = uniqueList(candidates.concat(fallbackCandidates));
  var index = 0;
  function applyNext(){
    if (index >= queue.length) {
      el.style.display = "none";
      return;
    }
    var nextSrc = queue[index++];
    if (el.dataset) {
      el.dataset.hostFallbackApplied = index > candidates.length ? "1" : "0";
      el.dataset.hostRequestedSrc = String(src);
      el.dataset.hostResolvedSrc = nextSrc;
    }
    el.style.display = "";
    el.src = nextSrc;
  }
  el.onerror = function(){
    var failed = el.dataset ? el.dataset.hostResolvedSrc : el.src;
    if (index <= candidates.length) {
      console.warn("[quiz host image retry]", id, failed);
    } else {
      console.warn("[quiz host image fallback]", id, failed);
    }
    applyNext();
  };
  applyNext();
}

function getHostArtByTone(tone){
  if (tone === "correct") return HOST_ART.correct;
  if (tone === "wrong") return HOST_ART.wrong || HOST_ART.question;
  if (tone === "timeout") return HOST_ART.timeout || HOST_ART.wrong || HOST_ART.question;
  if (tone === "urgent") return HOST_ART.timewarning;
  if (tone === "intro") return HOST_ART.intro;
  if (tone === "result") return HOST_ART.result || HOST_ART.correct;
  if (tone === "ranking") return HOST_ART.ranking || HOST_ART.intro;
  return HOST_ART.question;
}

function refreshBrandHostVisuals(){
  setImageSrc("home-host-image", HOST_ART.intro);
  setImageSrc("academy-host-image", HOST_ART.correct);
  setImageSrc("leaderboard-brand-image", HOST_ART.ranking || HOST_ART.intro);
  setImageSrc("result-host-image", HOST_ART.result || HOST_ART.correct);
  setImageSrc("host-image", HOST_ART.question);
  setImageSrc("mobile-host-image", HOST_ART.question);
  setImageSrc("pause-host-image", HOST_ART.timeout || HOST_ART.timewarning || HOST_ART.question);
}

function setHostMessage(msg, tone){
  var el = $("host-message");
  if (el) el.textContent = msg;
  var src = getHostArtByTone(tone);
  setImageSrc("host-image", src);
  setImageSrc("mobile-host-image", src);
  var card = $("host-card");
  if (card) {
    card.classList.remove("host-correct","host-wrong","host-urgent","host-timeout");
    if (tone) card.classList.add("host-" + tone);
  }
  var floater = $("mobile-host-sticker");
  if (floater) {
    floater.classList.remove("host-correct","host-wrong","host-urgent","host-timeout","host-reveal","pop");
    if (tone) floater.classList.add("host-" + tone);

    // 手機浮動主持人平時維持「站在旁邊」的正常狀態；
    // 只有公布結果/逾時時才放大強調，避免答題鎖定時先閃 timewarning。
    if (tone === "correct" || tone === "wrong" || tone === "timeout") {
      floater.classList.add("host-reveal");
      void floater.offsetWidth;
      floater.classList.add("pop");
    }
  }
}

function setResultHostVisual(){
  setImageSrc("result-host-image", HOST_ART.result || HOST_ART.correct || HOST_ART.intro);
}

function getQuizIntroMessage(){
  var n = quizState.currentIndex + 1;
  if (n === 1) return "第一題開始！請聽題～";
  if (n === quizState.totalQuestions) return "最後一題，穩住節奏，準備好了嗎？";
  if (n === 5) return "第 5 題來囉，集中注意力！";
  if (n >= 8) return "第 " + n + " 題，挑戰進入尾聲了！";
  return "第 " + n + " 題來囉！請聽題～";
}

function updateSoundButton(){
  var btn = $("btn-sound-toggle");
  if (!btn) return;
  btn.textContent = soundEnabled ? "🔊 音效" : "🔇 靜音";
  btn.classList.toggle("muted", !soundEnabled);
}

function ensureAudioContext(){
  if (!soundEnabled) return null;
  var Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(function(){});
  return audioCtx;
}

function clampGain(v){ return Math.max(0.0001, Math.min(0.55, v * SFX_MASTER_GAIN)); }

function beep(freq, duration, type, gainValue, when){
  if (!soundEnabled) return;
  var ctx = ensureAudioContext();
  if (!ctx) return;
  var t0 = typeof when === "number" ? when : ctx.currentTime;
  var dur = duration || 0.12;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq || 440, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(clampGain(gainValue || 0.06), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function playTick(secondsLeft){
  var left = Number(secondsLeft || quizState.questionTimeLeft || 5);
  var step = Math.max(1, Math.min(5, left));
  var freqMap = {5:520,4:620,3:760,2:930,1:1120};
  var gainMap = {5:0.075,4:0.09,3:0.115,2:0.14,1:0.17};
  var durMap = {5:0.08,4:0.075,3:0.065,2:0.055,1:0.048};
  beep(freqMap[step] || 720, durMap[step] || 0.055, "square", gainMap[step] || 0.065);
  if (step <= 2) {
    setTimeout(function(){ beep((freqMap[step] || 900) * 1.25, 0.04, "square", 0.09); }, 95);
  }
}
function playCorrect(){
  var ctx = ensureAudioContext();
  if (!ctx) return;
  var now = ctx.currentTime;
  beep(523.25, 0.10, "sine", 0.09, now);
  beep(659.25, 0.11, "sine", 0.105, now + 0.085);
  beep(783.99, 0.18, "triangle", 0.13, now + 0.17);
  beep(1046.5, 0.10, "sine", 0.08, now + 0.29);
}
function playWrong(){
  var ctx = ensureAudioContext();
  if (!ctx) return;
  var now = ctx.currentTime;
  beep(300, 0.10, "sawtooth", 0.095, now);
  beep(210, 0.15, "sawtooth", 0.09, now + 0.09);
  beep(130, 0.26, "triangle", 0.085, now + 0.22);
}
function playTimeout(){
  var ctx = ensureAudioContext();
  if (!ctx) return;
  var now = ctx.currentTime;
  beep(130, 0.48, "triangle", 0.17, now);
  beep(82, 0.60, "sine", 0.13, now + 0.07);
  beep(55, 0.42, "sine", 0.095, now + 0.18);
}

function musicFmt(sec){
  sec = Math.floor(sec || 0);
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}
function normalizeSongAudioPath(song){
  var raw = song.audioUrl || song.audio || song.file || song.src || "";
  if (!raw && song.id) raw = "songs/" + song.id + "/audio.mp3";
  if (/^https?:\/\//.test(raw)) return raw;
  return SONG_BASE + String(raw).replace(/^\.\//, "");
}
function normalizeSongList(data){
  var arr = Array.isArray(data) ? data : (data && Array.isArray(data.songs) ? data.songs : []);
  return arr.map(function(s, i){
    return {
      id: s.id || ("song" + String(i + 1).padStart(3, "0")),
      title: s.title || s.name || ("歌曲 " + (i + 1)),
      artist: s.artist || "氣球小V",
      duration: Number(s.duration || s.seconds || 120),
      audio: normalizeSongAudioPath(s),
      emoji: s.emoji || MUSIC_EMOJIS[i % MUSIC_EMOJIS.length]
    };
  }).filter(function(s){ return !!s.audio; });
}
function fallbackSongs(){
  return normalizeSongList([
    {id:"song001",title:"在小V派對裡夢想",artist:"氣球小V",duration:122,audio:"songs/song001/audio.mp3",emoji:"🎈"},
    {id:"song002",title:"V-MEN",artist:"氣球小V",duration:128,audio:"songs/song002/audio.mp3",emoji:"🎤"},
    {id:"song003",title:"掌心的初光",artist:"氣球小V",duration:123,audio:"songs/song003/audio.mp3",emoji:"✨"},
    {id:"song004",title:"一顆氣球的重量",artist:"氣球小V",duration:259,audio:"songs/song004/audio.mp3",emoji:"💫"},
    {id:"song005",title:"小V派對歌曲 5",artist:"氣球小V",duration:120,audio:"songs/song005/audio.mp3",emoji:"🌟"},
    {id:"song006",title:"小V派對歌曲 6",artist:"氣球小V",duration:120,audio:"songs/song006/audio.mp3",emoji:"🎵"}
  ]);
}
function loadSongs(){
  return fetch(SONG_BASE + "songs.json?v=" + encodeURIComponent(QUIZ_VERSION), { cache:"no-store" })
    .then(function(r){ if (!r.ok) throw new Error("songs.json " + r.status); return r.json(); })
    .then(function(data){
      SONGS = normalizeSongList(data);
      if (!SONGS.length) SONGS = fallbackSongs();
      loadSong(0, false);
      updateSongList();
      toast("🎵 已載入節奏遊戲播放清單：" + SONGS.length + " 首", 1800);
      return SONGS;
    })
    .catch(function(e){
      console.warn("[Music] songs.json load failed:", e.message);
      SONGS = fallbackSongs();
      loadSong(0, false);
      updateSongList();
      return SONGS;
    });
}
function loadSong(index, playAfter){
  if (!SONGS.length) return;
  musicIndex = ((index % SONGS.length) + SONGS.length) % SONGS.length;
  var song = SONGS[musicIndex];
  musicAudio.src = song.audio;
  musicAudio.load();
  var nt = $("mp-nt"), disc = $("mp-disc"), ar = $("mp-ar"), dur = $("mp-dur"), cur = $("mp-cur"), fill = $("mp-fill"), mini = $("mini-title");
  if (nt) nt.textContent = song.title;
  if (disc) disc.textContent = song.emoji;
  if (ar) ar.textContent = song.artist || "氣球小V";
  if (dur) dur.textContent = musicFmt(song.duration);
  if (cur) cur.textContent = "0:00";
  if (fill) fill.style.width = "0%";
  if (mini) mini.textContent = song.emoji + " " + song.title;
  updateSongList();
  if (playAfter) playSong();
}
function playSong(){
  if (!SONGS.length) return;
  if (!musicAudio.src) loadSong(musicIndex || 0, false);
  musicAudio.volume = Number(( $("mp-vol") && $("mp-vol").value ? $("mp-vol").value : 10)) / 100;
  musicAudio.play().then(function(){
    musicPlaying = true;
    updateMusicButtons();
    startMusicProgress();
    updateSongList();
    var disc = $("mp-disc"); if (disc) disc.classList.add("playing");
  }).catch(function(e){
    console.warn("[Music] play failed:", e.message);
    toast("瀏覽器需要你先點一下播放鍵才能播放音樂。", 2400);
  });
}
function pauseSong(){
  musicAudio.pause();
  musicPlaying = false;
  updateMusicButtons();
  stopMusicProgress();
  updateSongList();
  var disc = $("mp-disc"); if (disc) disc.classList.remove("playing");
}
function togglePlay(){ if (musicPlaying) pauseSong(); else playSong(); }
function updateMusicButtons(){
  var icon = musicPlaying ? "⏸" : "▶";
  if ($("mc-play")) $("mc-play").textContent = icon;
  if ($("mp-play2")) $("mp-play2").textContent = icon;
}
function startMusicProgress(){
  stopMusicProgress();
  musicProgressTimer = setInterval(function(){
    var dur = musicAudio.duration || (SONGS[musicIndex] && SONGS[musicIndex].duration) || 120;
    var cur = musicAudio.currentTime || 0;
    if ($("mp-cur")) $("mp-cur").textContent = musicFmt(cur);
    if ($("mp-fill")) $("mp-fill").style.width = dur ? ((cur / dur) * 100) + "%" : "0%";
  }, 500);
}
function stopMusicProgress(){
  if (musicProgressTimer) clearInterval(musicProgressTimer);
  musicProgressTimer = null;
}
function updateSongList(){
  var list = $("mp-list");
  if (!list) return;
  list.innerHTML = "";
  if (!SONGS.length) {
    list.innerHTML = '<div class="mp-item"><div class="mp-item-info"><div class="mp-item-name">播放清單載入中...</div></div></div>';
    return;
  }
  SONGS.forEach(function(song, i){
    var item = document.createElement("div");
    item.className = "mp-item" + (i === musicIndex ? " on" : "");
    item.innerHTML = '<div class="mp-item-num">' + (i + 1) + '</div>' +
      '<div class="mp-item-info"><div class="mp-item-name">' + escapeHtml(song.emoji + " " + song.title) + '</div>' +
      '<div class="mp-item-dur">' + escapeHtml(song.artist || "氣球小V") + ' · ' + musicFmt(song.duration) + '</div></div>' +
      '<div class="mp-eq" style="display:' + (i === musicIndex && musicPlaying ? "" : "none") + '">🎵</div>';
    item.addEventListener("click", function(){ loadSong(i, true); });
    list.appendChild(item);
  });
}
function openMusic(){ updateSongList(); if ($("music-modal")) $("music-modal").classList.add("show"); }
function closeMusic(){ if ($("music-modal")) $("music-modal").classList.remove("show"); }

function startQuizBgm(){
  quizBgmManaged = true;
  if (!SONGS.length) {
    loadSongs().then(function(){ playSong(); });
    return;
  }
  playSong();
}

function pauseQuizBgm(){
  if (!quizBgmManaged) return;
  pauseSong();
  quizBgmManaged = false;
}

function showScreen(id){
  var current = document.querySelector(".screen.active");
  var currentId = current ? current.id : "";

  // 問答 BGM 管理：開始答題後自動播放，結算畫面保持播放；離開結算或中途離開答題時暫停。
  if (quizBgmManaged) {
    var leavingResult = currentId === "screen-result" && id !== "screen-result";
    var leavingQuizBeforeResult = currentId === "screen-quiz" && id !== "screen-result" && id !== "screen-quiz";
    if (leavingResult || leavingQuizBeforeResult) pauseQuizBgm();
  }

  document.querySelectorAll(".screen").forEach(function(s){ s.classList.remove("active"); });
  var el = $(id);
  if (el) el.classList.add("active");
  var floater = $("mobile-host-sticker");
  if (floater) floater.classList.toggle("show", id === "screen-quiz");
  if (id !== "screen-quiz") { stopQuizTimer(); stopQuestionTimer(); quizState.paused = false; hidePauseOverlay(); }
  if (id === "screen-title") {
    setImageSrc("home-host-image", HOST_ART.intro);
    setImageSrc("academy-host-image", HOST_ART.correct);
    loadDailyChallengeStatus();
  }
  if (id === "screen-leaderboard") {
    setImageSrc("leaderboard-brand-image", HOST_ART.ranking || HOST_ART.intro);
    renderLeaderboard();
  }
  updateFullscreenButtonVisibility(id);
}

function setProfileDataCollapsed(collapsed){
  var card = $("profile-data-card");
  var toggle = $("profile-data-toggle");
  if (!card || !toggle) return;
  card.classList.toggle("collapsed", !!collapsed);
  toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  var label = toggle.querySelector("em");
  if (label) label.textContent = collapsed ? "點擊展開" : "點擊可收合";
}
function collapseProfileData(){ setProfileDataCollapsed(true); }
function expandProfileData(){ setProfileDataCollapsed(false); }
function toggleProfileData(){
  var card = $("profile-data-card");
  setProfileDataCollapsed(!(card && card.classList.contains("collapsed")));
}
function scrollToProfileDataToggle(){
  var el = $("profile-data-card") || $("profile-data-toggle");
  if (el && typeof el.scrollIntoView === "function") {
    setTimeout(function(){ el.scrollIntoView({ behavior:"smooth", block:"start" }); }, 40);
  }
}
function closeProfileTitleCollection(){
  var panel = $("profile-title-collection");
  if (panel) panel.classList.add("hidden");
}
function openProfileTitleCollection(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  UniverseQuiz.notReady('titles');
}
function updateFullscreenButtonVisibility(screenId){
  var btn = $("fs-btn");
  if (!btn) return;
  btn.classList.toggle("hidden", screenId === "screen-admin");
}
function isFullscreenActive(){
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function updateFullscreenButtonLabel(){
  var btn = $("fs-btn");
  if (!btn) return;
  btn.textContent = isFullscreenActive() ? "×" : "⛶";
  btn.title = isFullscreenActive() ? "退出全螢幕" : "全螢幕";
}
function toggleFullscreen(){
  var root = document.documentElement;
  if (isFullscreenActive()) {
    var exitFn = document.exitFullscreen || document.webkitExitFullscreen;
    if (exitFn) {
      var exitResult = exitFn.call(document);
      if (exitResult && typeof exitResult.catch === "function") exitResult.catch(function(){});
    }
    return;
  }
  var reqFn = root.requestFullscreen || root.webkitRequestFullscreen;
  if (reqFn) {
    var reqResult = reqFn.call(root);
    if (reqResult && typeof reqResult.catch === "function") reqResult.catch(function(){});
  }
}

function normalizePlayerId(id) {
  return (id || "").trim() || "玩家";
}

function encodeFirebaseKeyPart(s) {
  return encodeURIComponent(normalizePlayerId(s))
    .replace(/\./g, "%2E")
    .replace(/#/g, "%23")
    .replace(/\$/g, "%24")
    .replace(/\[/g, "%5B")
    .replace(/\]/g, "%5D");
}

function makePlayerKey(id, baseAvatarKey) {
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.playerKeyFor();  // 宇宙版：成績歸屬一律是遊戲宇宙 playerId，絕不以 ID＋圖案組合
}

// resolveAvatarSrc：所有 catalog/unlocked 相對路徑轉完整 GitHub Pages URL
// 確保 iframe 嵌入 balloonv.com 時不破圖
function resolveAvatarSrc(src) {
  if (!src) return "";
  var s = String(src);
  if (/^https?:\/\//.test(s)) return s;
  var base = "https://vashyang1120.github.io/vparty-rhythm-game/";
  if (s.indexOf("../assets/avatars/") === 0) return base + s.slice(3);
  if (s.indexOf("./assets/avatars/") === 0)  return base + s.slice(2);
  if (s.indexOf("assets/avatars/") === 0)    return base + s;
  return s;
}

function isBuiltinAvatar(key) {
  return AVATARS.some(function(a){ return a.key === key; });
}

function hasUnlockedAvatar(key) {
  if (!key || !unlockedAvatars) return false;
  var u = unlockedAvatars[key];
  if (!u) return false;
  if (u === true) return true;
  return u.unlocked === true;
}

function getCatalogVisibility(cat) {
  return String((cat && (cat.visibility || cat.visible || cat.displayMode)) || "").toLowerCase();
}

function isStudentCatalogAvatar(key, cat) {
  if (!cat) return false;
  var k = String(key || cat.key || "").toLowerCase();
  var tier = String(cat.tier || "").toLowerCase();
  var type = String(cat.type || cat.category || cat.group || cat.kind || "").toLowerCase();

  return tier === "student" ||
    type === "student" ||
    k.indexOf("student_") === 0 ||
    k.indexOf("student-") === 0 ||
    cat.studentOnly === true ||
    cat.private === true ||
    !!cat.ownerPlayerKey ||
    !!cat.exclusivePlayerKey;
}

function isHiddenUntilUnlockedCatalogAvatar(key, cat) {
  if (!cat) return false;
  var visibility = getCatalogVisibility(cat);
  return cat.hiddenUntilUnlocked === true ||
    visibility === "hiddenuntilunlocked" ||
    visibility === "lockeduntilunlocked" ||
    visibility === "unlock" ||
    visibility === "locked" ||
    cat.manualUnlock === true ||
    cat.requireUnlock === true;
}

function isLockedAvatarHiddenFromPicker(key, cat) {
  // 學生 / 私人 / 指定玩家專屬頭像：未解鎖時完全不出現在選單，避免洩漏。
  return isStudentCatalogAvatar(key, cat);
}

function getAvatarUnlockText(key, cat) {
  var text = cat && (cat.unlockText || cat.unlockCondition || cat.conditionText || cat.hint || cat.description);
  if (text) return String(text);
  if (key === "xiaov_base") return "完成任一遊戲即可解鎖。";
  if (key === "balloon_brother_01") return "完成方塊遊戲指定條件解鎖。";
  if (key === "balloon_brother_02") return "節奏遊戲達成 A / A+ / S 解鎖。";
  if (key === "balloon_brother_03") return "完成指定活動或任務解鎖。";
  return "尚未解鎖，請完成指定條件。";
}

function isDisplayAvatarAllowed(key) {
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.isDisplayAvatarAllowed(key);  // v0.3.1：身份頭像或遊戲宇宙共用收藏目前裝備的展示頭像
}

function getAvatarByKey(key) {
  var uni = UniverseQuiz.avatarFor(key); if (uni) return uni;  // [Universe 換殼]
  if (!key) return { key: AVATARS[0].key, src: AVATARS[0].url, url: AVATARS[0].url, name: AVATARS[0].label };

  var builtin = AVATARS.find(function(a){ return a.key === key; });
  if (builtin) return { key: builtin.key, src: builtin.url, url: builtin.url, name: builtin.label || builtin.key };

  var unlock = UNLOCKABLE_AVATARS.find(function(a){ return a.key === key; });
  if (unlock) {
    var uSrc = resolveAvatarSrc(unlock.src || unlock.file || unlock.url);
    return { key: unlock.key, src: uSrc, url: uSrc, name: unlock.name || unlock.key };
  }

  if (AVATAR_CATALOG[key]) {
    var cat = AVATAR_CATALOG[key];
    var cSrc = resolveAvatarSrc(cat.src || cat.file || cat.url || "");
    return { key: key, src: cSrc, url: cSrc, name: cat.name || key };
  }

  if (unlockedAvatars[key] && typeof unlockedAvatars[key] === "object") {
    var meta = unlockedAvatars[key];
    var mSrc = resolveAvatarSrc(meta.src || meta.file || meta.url || "");
    if (mSrc) return { key: key, src: mSrc, url: mSrc, name: meta.name || key };
  }

  return { key: AVATARS[0].key, src: AVATARS[0].url, url: AVATARS[0].url, name: AVATARS[0].label };
}

function getAvatarUrl(key) {
  var av = getAvatarByKey(key);
  return av.src || av.url || AVATARS[0].url;
}

function validateDisplayAvatarForCurrentIdentity() {
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  UniverseQuiz.applyPlayerTo(PLAYER);  // v0.3.1：展示頭像＝遊戲宇宙共用收藏目前裝備的（伺服器已檢查）
  return true;
}

function ensureFirebaseReady() {
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(false);
}

function loadAvatarCatalog() {
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve({});
}

function loadUnlockedAvatars() {
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  unlockedAvatars = {};
  return Promise.resolve({});
}

function ensurePlayerProfile() {
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(null);
}

function loadPlayerLocal(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  UniverseQuiz.applyPlayerTo(PLAYER);
}

function savePlayerLocal(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  UniverseQuiz.applyPlayerTo(PLAYER);  // 身份由遊戲宇宙管理，遊戲內不寫入本機身份
}

function hasConfirmedQuizProfile(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.isReady();
}

function buildCurrentProfilePayload(isCreate){
  validateDisplayAvatarForCurrentIdentity();
  var payload = {
    id: PLAYER.id,
    name: PLAYER.name || PLAYER.id,
    playerKey: PLAYER.playerKey,
    baseAvatarKey: PLAYER.baseAvatarKey,
    displayAvatarKey: PLAYER.displayAvatarKey,
    avatarKey: PLAYER.displayAvatarKey,
    avatarSrc: PLAYER.avatarSrc,
    updatedAt: Date.now()
  };
  if (isCreate) payload.createdAt = Date.now();
  return payload;
}

// v0.1.1：使用「目前畫面選擇」直接寫回 profile。
// 這個函式不會先讀 Firebase 舊 displayAvatarKey，因此不會把剛選的新顯示頭像蓋回舊值。
function writePlayerProfileCurrent(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(null);
}

function savePlayer(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  UniverseQuiz.applyPlayerTo(PLAYER);
  return Promise.resolve(true);
}

function getBaseAvatarName(key){
  var uniLabel = UniverseQuiz.avatarLabel(key); if (uniLabel) return uniLabel;  // [Universe 換殼]
  var found = AVATARS.find(function(a){ return a.key === key; });
  if (found) return found.label || found.name || found.key;
  var cat = AVATAR_CATALOG[key];
  if (cat) return cat.name || cat.label || key;
  return key || "未選擇";
}

function getAvatarName(key){
  return getBaseAvatarName(key);
}

function getFriendlyIdentityLabel(id, baseAvatarKey){
  var cleanId = normalizePlayerId(id || PLAYER.id || "玩家");
  return cleanId + " + " + getBaseAvatarName(baseAvatarKey || PLAYER.baseAvatarKey || "boy1");
}

function updatePlayerUI(){
  var av = getAvatarByKey(PLAYER.displayAvatarKey);
  PLAYER.avatarSrc = av.src || av.url;
  PLAYER.avatarKey = PLAYER.displayAvatarKey;

  if ($("top-avatar")) $("top-avatar").src = PLAYER.avatarSrc;
  if ($("top-name")) $("top-name").textContent = PLAYER.name || PLAYER.id || "玩家";
  if ($("top-player-key")) $("top-player-key").textContent = PLAYER.playerKey ? ("身份：" + getFriendlyIdentityLabel(PLAYER.id, PLAYER.baseAvatarKey)) : "尚未設定身份";
  renderEquippedTitle();
  updateWalletBalanceUI();

  if ($("player-id-input")) $("player-id-input").value = PLAYER.id || "";
  if ($("base-avatar-preview")) $("base-avatar-preview").src = getAvatarUrl(PLAYER.baseAvatarKey);
  if ($("display-avatar-preview")) $("display-avatar-preview").src = PLAYER.avatarSrc;
  if ($("profile-player-key")) $("profile-player-key").textContent = getFriendlyIdentityLabel(normalizePlayerId($("player-id-input").value), PLAYER.baseAvatarKey);
  if ($("profile-identity-label")) $("profile-identity-label").textContent = "身份：" + getFriendlyIdentityLabel(normalizePlayerId($("player-id-input").value), PLAYER.baseAvatarKey);
}

function getAvailableDisplayAvatars(){
  var list = AVATARS.map(function(a){
    return { key:a.key, name:a.label || a.key, src:a.url, type:"builtin", locked:false };
  });

  function addCandidate(item){
    if (!item || !item.key) return;
    var cat = AVATAR_CATALOG[item.key] || null;
    var unlocked = hasUnlockedAvatar(item.key);
    var mustHideWhenLocked = cat ? isLockedAvatarHiddenFromPicker(item.key, cat) : false;

    // 學生 / 私人專屬頭像：未解鎖時完全不出現。
    if (!unlocked && mustHideWhenLocked) return;

    item.locked = !unlocked && !isDisplayAvatarAllowed(item.key);
    item.unlockText = item.unlockText || getAvatarUnlockText(item.key, cat);
    list.push(item);
  }

  // 固定特殊頭像：未解鎖時也可顯示成鎖住，讓玩家知道解鎖條件。
  UNLOCKABLE_AVATARS.forEach(function(a){
    addCandidate({
      key:a.key,
      name:a.name || a.key,
      src:resolveAvatarSrc(a.file || a.src || a.url),
      type:"unlock",
      unlockText:getAvatarUnlockText(a.key, AVATAR_CATALOG[a.key] || null)
    });
  });

  Object.keys(AVATAR_CATALOG).forEach(function(key){
    var cat = AVATAR_CATALOG[key];
    if (!cat || cat.active === false) return;

    var src = resolveAvatarSrc(cat.src || cat.file || cat.url || "");
    if (!src) return;

    addCandidate({
      key:key,
      name:cat.name || key,
      src:src,
      type:"catalog",
      unlockText:getAvatarUnlockText(key, cat)
    });
  });

  // 去重：同 key 同時存在於 UNLOCKABLE_AVATARS 與 avatarCatalog 時，優先保留已解鎖資料；未解鎖則保留有解鎖文案的鎖定卡。
  var byKey = {};
  list.forEach(function(a){
    var prev = byKey[a.key];
    if (!prev) {
      byKey[a.key] = a;
      return;
    }
    if (prev.locked && !a.locked) byKey[a.key] = a;
    else if (!prev.unlockText && a.unlockText) byKey[a.key] = a;
  });

  return Object.keys(byKey).map(function(key){ return byKey[key]; });
}


function getIdentityChangeWarningText(newAvatarName, newAvatarKey){
  var currentKey = PLAYER.baseAvatarKey || "boy1";
  var playerId = normalizePlayerId(PLAYER.id || "玩家");
  var currentIdentity = getFriendlyIdentityLabel(playerId, currentKey);
  var nextIdentity = getFriendlyIdentityLabel(playerId, newAvatarKey || currentKey);
  return "你正在更換「身份頭像」。\n\n" +
    "身份頭像就像遊戲身分證，會決定成績、解鎖和排行榜歸在哪一個玩家身上。\n" +
    "換成「" + (newAvatarName || newAvatarKey || "新頭像") + "」後，系統會把你當成另一個玩家身份。\n\n" +
    "目前身份：" + currentIdentity + "\n" +
    "新身份：" + nextIdentity + "\n\n" +
    "原本成績、解鎖、排行榜不會自動一起帶過來。\n" +
    "確定要更換身份頭像嗎？";
}

function confirmBaseAvatarChange(av){
  if (!av || !av.key) return false;
  if (av.key === PLAYER.baseAvatarKey) return true;
  return confirm(getIdentityChangeWarningText(av.name || av.key, av.key));
}

function buildAvatarPicker(mode){
  if (UniverseQuiz.avatarPickerBlocked(mode)) return;  // [Universe 換殼]
  pickerMode = mode;
  var wrap = $("avatar-picker");
  var grid = $("avatar-grid");
  var title = $("avatar-picker-title");
  if (!wrap || !grid) return;
  closeProfileTitleCollection();
  collapseProfileData();

  title.textContent = mode === "base" ? "🔑 選擇身份頭像（遊戲身分證）" : "🎨 選擇顯示頭像（只改外觀）";
  grid.innerHTML = "";
  var oldNote = grid.parentNode.querySelector(".picker-note");
  if (oldNote) oldNote.remove();
  var note = document.createElement("div");
  note.className = "picker-note " + (mode === "base" ? "danger" : "safe");
  note.innerHTML = mode === "base"
    ? "<strong>⚠️ ID + 身份頭像 = 遊戲身分證</strong><br>會決定成績、解鎖和排行榜歸在哪一個玩家身上；只要更換 ID 或身份頭像，系統就會把你當成另一個玩家身份。"
    : "<strong>✅ 顯示頭像 = 外觀造型</strong><br>只改畫面長相，不會改變你的遊戲身份，也不會搬動成績。";
  grid.parentNode.insertBefore(note, grid);

  var list = mode === "base"
    ? AVATARS.map(function(a){ return { key:a.key, name:a.label || a.key, src:a.url }; })
    : getAvailableDisplayAvatars();

  list.forEach(function(av){
    var btn = document.createElement("button");
    btn.className = "avatar-item";
    if (av.locked) btn.classList.add("locked");
    var selected = mode === "base" ? av.key === PLAYER.baseAvatarKey : av.key === PLAYER.displayAvatarKey;
    if (selected) btn.classList.add("selected");
    btn.innerHTML = '<span class="avatar-img-wrap"><img src="' + escapeHtml(av.src) + '" alt="">' +
      (av.locked ? '<b class="avatar-lock-badge">🔒</b>' : '') +
      '</span><span>' + escapeHtml(av.name) + '</span>' +
      (av.locked ? '<em class="avatar-lock-text">未解鎖</em>' : '');
    btn.addEventListener("click", function(){
      if (mode === "base") {
        if (!confirmBaseAvatarChange(av)) {
          toast("已取消更換身份頭像。", 2200);
          return;
        }
        PLAYER.baseAvatarKey = av.key;
        PLAYER.playerKey = makePlayerKey(PLAYER.id, PLAYER.baseAvatarKey);
        // 切換身份頭像時，若目前 display 未必屬於新身份，先暫時退回 base，確認後會重新讀 unlocked。
        PLAYER.displayAvatarKey = av.key;
        PLAYER.avatarKey = av.key;
        PLAYER.avatarSrc = getAvatarUrl(av.key);
        savePlayerLocal();
        PLAYER_WALLET_BALANCE = null;
        PLAYER_QUIZ_TITLES = {};
        PLAYER_QUIZ_BADGES = {};
        PLAYER_EQUIPPED_TITLE = null;
        updatePlayerUI();
        loadWalletBalance();
        buildAvatarPicker("base");
        toast("已選擇身份頭像：" + av.name + "\n這會變成新的玩家身份，請再按「確認身份」。", 3600);
      } else {
        if (av.locked || !isDisplayAvatarAllowed(av.key)) {
          toast("🔒 " + av.name + " 尚未解鎖\\n" + (av.unlockText || "請完成指定條件解鎖。"), 3600);
          return;
        }

        var oldPlayerKey = PLAYER.playerKey;
        var oldBaseAvatarKey = PLAYER.baseAvatarKey;

        PLAYER.displayAvatarKey = av.key;
        PLAYER.avatarKey = av.key;
        PLAYER.avatarSrc = getAvatarUrl(av.key);

        // 防呆：顯示頭像不可改變身份
        PLAYER.baseAvatarKey = oldBaseAvatarKey;
        PLAYER.playerKey = oldPlayerKey;

        savePlayerLocal();
        updatePlayerUI();
        buildAvatarPicker("display");

        writePlayerProfileCurrent().then(function(){
          toast("已更換顯示頭像：" + av.name + "\n遊戲身份不會改變。");
        });
      }
    });
    grid.appendChild(btn);
  });

  wrap.classList.remove("hidden");
  scrollToProfileDataToggle();
}

function escapeHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(ch){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
  });
}


function loadQuestionOverrides(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  QUESTION_OVERRIDES = {};
  return UniverseQuiz.loadApprovedOverrides().then(function(ov){
    QUESTION_OVERRIDES = ov || {};
    return QUESTION_OVERRIDES;
  });
}

function applyQuestionOverrides(){
  if (!Array.isArray(QUESTIONS)) return;
  QUESTIONS = QUESTIONS.map(function(q){
    if (!q || !q.id) return q;
    var ov = QUESTION_OVERRIDES[q.id];
    if (!ov) return q;
    var merged = Object.assign({}, q);
    ["disabled", "active", "quality", "reviewNote", "reason", "updatedAt", "updatedBy"].forEach(function(k){
      if (Object.prototype.hasOwnProperty.call(ov, k)) merged[k] = ov[k];
    });
    merged.overrideApplied = true;
    return merged;
  });
}

function getQuestionById(questionId){
  return (QUESTIONS || []).find(function(q){ return q && q.id === questionId; }) || null;
}

function loadQuestions(){
  return fetch(QUIZ_ASSET_ROOT + "quiz_questions.json?v=" + encodeURIComponent(QUIZ_VERSION), { cache:"no-store" })  // [Universe 換殼] 正式題庫（原版網址，唯讀）
    .then(function(res){
      if (!res.ok) throw new Error("題庫讀取失敗");
      return res.json();
    })
    .then(function(data){
      QUESTIONS = Array.isArray(data) ? data : [];
      return loadQuestionOverrides().then(function(){
        applyQuestionOverrides();
        updateQuestionCountHint();
        return QUESTIONS;
      });
    })
    .catch(function(e){
      console.warn("[Questions] load failed:", e);
      QUESTIONS = [];
      updateQuestionCountHint();
      toast("題庫讀取失敗，請確認 quiz_questions.json 是否同資料夾。", 4000);
      return [];
    });
}

function buildSetupOptions(){
  var gradeWrap = $("grade-options");
  var subjectWrap = $("subject-options");
  gradeWrap.innerHTML = "";
  subjectWrap.innerHTML = "";

  GRADE_OPTIONS.forEach(function(g){
    var btn = document.createElement("button");
    btn.className = "option-card" + (g.key === selectedGrade ? " selected" : "");
    btn.innerHTML = escapeHtml(g.name) + "<small>" + escapeHtml(g.desc) + "</small>";
    btn.addEventListener("click", function(){
      selectedGrade = g.key;
      buildSetupOptions();
      updateQuestionCountHint();
    });
    gradeWrap.appendChild(btn);
  });

  SUBJECT_OPTIONS.forEach(function(s){
    var btn = document.createElement("button");
    btn.className = "option-card" + (s.key === selectedSubject ? " selected" : "");
    btn.innerHTML = "<div>" + escapeHtml(s.emoji) + "</div>" + escapeHtml(s.name);
    btn.addEventListener("click", function(){
      selectedSubject = s.key;
      buildSetupOptions();
      updateQuestionCountHint();
    });
    subjectWrap.appendChild(btn);
  });
}

function updateQuestionCountHint(){
  var list = getQuestionPool();
  var ready = list.length >= 10;
  var hint = $("question-count-hint");
  if (hint) hint.textContent = ready ? "題庫準備完成｜可挑戰" : "題庫準備中｜暫時不能挑戰";
  var startBtn = $("btn-start-quiz");
  if (startBtn) startBtn.disabled = !ready;
}

function isQuestionEnabled(q){
  if (!q) return false;
  if (q.disabled === true) return false;
  if (q.active === false) return false;
  if (String(q.quality || "").toLowerCase() === "disabled") return false;
  return true;
}

function getQuestionPool(){
  var staticPool = QUESTIONS.filter(function(q){
    return q.gradeBand === selectedGrade && q.subject === selectedSubject && isQuestionEnabled(q);
  });
  if (selectedSubject !== "math") return staticPool;
  var generated = buildGeneratedMathQuestions(selectedGrade, MATH_TEMPLATE_MAX_PER_GAME);
  return staticPool.concat(generated);
}

function shuffle(arr){
  var a = arr.slice();
  for (var i=a.length-1;i>0;i--) {
    var j = Math.floor(Math.random() * (i+1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function getDedupedQuestionPool(pool){
  var seenIds = {};
  var seenTexts = {};
  var result = [];
  shuffle(pool).forEach(function(q){
    if (!q) return;
    var idKey = String(q.id || "").trim();
    var textKey = String(q.question || "").replace(/\s+/g, " ").trim();
    if (idKey && seenIds[idKey]) return;
    if (textKey && seenTexts[textKey]) return;
    if (idKey) seenIds[idKey] = true;
    if (textKey) seenTexts[textKey] = true;
    result.push(q);
  });
  return result;
}

function normalizeQuestionChoicesForPlay(q, targetAnswerIndex){
  var choices = Array.isArray(q.choices) ? q.choices.slice() : [];
  var originalAnswerIndex = Number(q.answerIndex);
  if (!choices.length || originalAnswerIndex < 0 || originalAnswerIndex >= choices.length) {
    return Object.assign({}, q);
  }

  var correctChoice = choices[originalAnswerIndex];
  var wrongChoices = choices.filter(function(choice, idx){ return idx !== originalAnswerIndex; });
  wrongChoices = shuffle(wrongChoices);

  var answerIndex = Math.max(0, Math.min(choices.length - 1, Number(targetAnswerIndex) || 0));
  var newChoices = [];
  var wrongCursor = 0;
  for (var i=0;i<choices.length;i++) {
    if (i === answerIndex) newChoices[i] = correctChoice;
    else newChoices[i] = wrongChoices[wrongCursor++];
  }

  var cloned = Object.assign({}, q);
  cloned.choices = newChoices;
  cloned.answerIndex = answerIndex;
  cloned.originalAnswerIndex = originalAnswerIndex;
  return cloned;
}

function prepareQuestionsForPlay(pool, count){
  var uniquePool = getDedupedQuestionPool(pool);
  var selected = uniquePool.slice(0, count);
  var answerSlots = [];
  for (var i=0;i<selected.length;i++) answerSlots.push(i % 4);
  answerSlots = shuffle(answerSlots);
  return selected.map(function(q, idx){
    return normalizeQuestionChoicesForPlay(q, answerSlots[idx]);
  });
}

function startQuiz(){
  var pool = getQuestionPool();
  if (pool.length < 10) {
    toast("這個年級與科目的題目不足 10 題，請先補題。");
    return;
  }

  var uniquePool = getDedupedQuestionPool(pool);
  if (uniquePool.length < 10) {
    toast("這個年級與科目的不重複題目不足 10 題，請先補題或恢復題目。");
    return;
  }

  quizState.active = true;
  quizState.currentIndex = 0;
  quizState.questions = prepareQuestionsForPlay(pool, 10);
  quizState.answers = [];
  quizState.score = 0;
  quizState.correctCount = 0;
  quizState.combo = 0;
  quizState.maxCombo = 0;
  quizState.startedAt = Date.now();
  quizState.questionStartedAt = Date.now();
  quizState.questionTimeLeft = QUESTION_TIME_LIMIT;
  quizState.questionAnswered = false;
  quizState.paused = false;
  quizState.pauseStartedAt = 0;
  quizState.wasMusicPlayingBeforePause = false;
  hidePauseOverlay();
  quizState.totalQuestions = 10;
  ensureAudioContext();
  startQuizBgm();

  showScreen("screen-quiz");
  startQuizTimer();
  renderQuestion();
}

function startQuizTimer(){
  stopQuizTimer();
  quizState.timeTimer = setInterval(function(){
    if (quizState.paused) return;
    var sec = Math.floor((Date.now() - quizState.startedAt) / 1000);
    $("hud-time").textContent = sec + "s";
  }, 250);
}

function stopQuizTimer(){
  if (quizState.timeTimer) clearInterval(quizState.timeTimer);
  quizState.timeTimer = null;
}

function stopQuestionTimer(){
  if (quizState.questionTimer) clearInterval(quizState.questionTimer);
  quizState.questionTimer = null;
}

function startQuestionCountdown(reset){
  stopQuestionTimer();
  if (reset !== false) quizState.questionTimeLeft = QUESTION_TIME_LIMIT;
  updateQuestionTimerUI();
  quizState.questionTimer = setInterval(function(){
    if (!quizState.active || quizState.questionAnswered || quizState.paused) return;
    quizState.questionTimeLeft -= 1;
    if (quizState.questionTimeLeft <= 5 && quizState.questionTimeLeft > 0) {
      playTick(quizState.questionTimeLeft);
      setHostMessage("時間快到了！相信直覺，選一個答案吧！", "urgent");
    }
    updateQuestionTimerUI();
    if (quizState.questionTimeLeft <= 0) {
      handleQuestionTimeout();
    }
  }, 1000);
}

function updateQuestionTimerUI(){
  var left = Math.max(0, quizState.questionTimeLeft || 0);
  var pct = Math.max(0, Math.min(100, (left / QUESTION_TIME_LIMIT) * 100));
  var text = $("question-timer-text");
  var bar = $("question-timer-bar");
  var card = $("timer-card");
  if (text) text.textContent = left + "秒";
  if (bar) bar.style.width = pct + "%";
  if (card) card.classList.toggle("urgent", left <= 5 && left > 0 && !quizState.questionAnswered);
}

function handleQuestionTimeout(){
  stopQuestionTimer();
  if (quizState.questionAnswered) return;
  playTimeout();
  answerQuestion(-1, true);
}
function hidePauseOverlay(){
  var ov = $("quiz-pause-overlay");
  if (ov) ov.classList.add("hidden");
}

function showPauseOverlay(){
  setImageSrc("pause-host-image", HOST_ART.timeout || HOST_ART.timewarning || HOST_ART.question);
  var ov = $("quiz-pause-overlay");
  if (ov) ov.classList.remove("hidden");
}

function pauseQuiz(){
  if (!quizState.active || quizState.paused) return;
  if (quizState.questionAnswered) {
    toast("本題已作答，請先看解析或進下一題。");
    return;
  }
  quizState.paused = true;
  quizState.pauseStartedAt = Date.now();
  quizState.wasMusicPlayingBeforePause = !!musicPlaying;
  stopQuizTimer();
  stopQuestionTimer();
  if (musicPlaying) pauseSong();
  setHostMessage("挑戰暫停中。題目已遮住，準備好再繼續！", "urgent");
  showPauseOverlay();
}

function resumeQuiz(){
  if (!quizState.active || !quizState.paused) return;
  var pausedMs = Math.max(0, Date.now() - (quizState.pauseStartedAt || Date.now()));
  quizState.startedAt += pausedMs;
  quizState.questionStartedAt += pausedMs;
  quizState.paused = false;
  quizState.pauseStartedAt = 0;
  hidePauseOverlay();
  if (quizState.wasMusicPlayingBeforePause) playSong();
  setHostMessage("繼續挑戰！請看題～", "");
  startQuizTimer();
  startQuestionCountdown(false);
  updateQuestionTimerUI();
}


function renderQuestion(){
  var q = quizState.questions[quizState.currentIndex];
  if (!q) return finishQuiz();

  quizState.questionStartedAt = Date.now();
  quizState.questionAnswered = false;
  quizState.questionTimeLeft = QUESTION_TIME_LIMIT;
  setHostMessage(getQuizIntroMessage(), "");
  var qCard = document.querySelector(".question-card");
  if (qCard) qCard.classList.remove("show-correct","show-wrong","show-timeout");
  $("hud-progress").textContent = (quizState.currentIndex + 1) + " / " + quizState.totalQuestions;
  $("hud-score").textContent = quizState.score;
  $("hud-combo").textContent = quizState.combo;
  $("q-subject").textContent = q.subjectName || q.subject;
  $("q-grade").textContent = q.gradeBandName || q.gradeBand;
  $("q-difficulty").textContent = "★".repeat(Math.max(1, Math.min(3, q.difficulty || 1)));
  $("question-text").textContent = q.question;
  $("explanation-box").classList.add("hidden");
  $("btn-next-question").textContent = quizState.currentIndex === quizState.totalQuestions - 1 ? "🎓 查看成績單" : "🎤 下一題，請聽題！";

  var choices = $("choices");
  choices.innerHTML = "";
  (q.choices || []).forEach(function(choice, index){
    var btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = String.fromCharCode(65 + index) + ". " + choice;
    btn.addEventListener("click", function(){ answerQuestion(index); });
    choices.appendChild(btn);
  });
  startQuestionCountdown();
}

function answerQuestion(selectedIndex, timedOut){
  var q = quizState.questions[quizState.currentIndex];
  if (!q) return;

  var buttons = Array.prototype.slice.call(document.querySelectorAll(".choice-btn"));
  if (quizState.questionAnswered || buttons.some(function(b){ return b.disabled; })) return;
  quizState.questionAnswered = true;
  stopQuestionTimer();

  buttons.forEach(function(btn){ btn.disabled = true; });
  if (!timedOut && selectedIndex >= 0 && buttons[selectedIndex]) {
    buttons[selectedIndex].classList.add("selected-pending");
  }

  var revealDelay = timedOut ? 0 : 320;
  // 選答案後已經停止倒數，等待公布時不切 timewarning；
  // 真正公布時才切 correct / wrong / timeout，讓視覺差異更明確。
  setHostMessage(timedOut ? "時間到！" : "答案鎖定！小V要公布結果囉～", timedOut ? "timeout" : "");

  setTimeout(function(){
    revealAnswerResult(q, selectedIndex, !!timedOut, buttons);
  }, revealDelay);
}

function revealAnswerResult(q, selectedIndex, timedOut, buttons){
  var answerIndex = Number(q.answerIndex);
  var correct = !timedOut && selectedIndex === answerIndex;
  var timeUsed = Math.max(0, Math.round((Date.now() - quizState.questionStartedAt) / 1000));

  if (correct) {
    quizState.combo += 1;
    quizState.maxCombo = Math.max(quizState.maxCombo, quizState.combo);
    quizState.correctCount += 1;
    var bonus = Math.min(Math.max(quizState.combo - 1, 0) * 10, 50);
    quizState.score += 100 + bonus;
  } else {
    quizState.combo = 0;
  }

  quizState.answers.push({
    questionId: q.id,
    selectedIndex: selectedIndex,
    answerIndex: answerIndex,
    correct: correct,
    timedOut: !!timedOut,
    timeUsed: timeUsed
  });

  buttons.forEach(function(btn, idx){
    btn.classList.remove("selected-pending");
    if (idx === answerIndex) btn.classList.add("correct");
    if (idx === selectedIndex && !correct) btn.classList.add("wrong");
  });

  $("hud-score").textContent = quizState.score;
  $("hud-combo").textContent = quizState.combo;
  var qCard = document.querySelector(".question-card");
  if (qCard) qCard.classList.add(correct ? "show-correct" : (timedOut ? "show-timeout" : "show-wrong"));
  if (correct) { playCorrect(); setHostMessage("答對！太棒了，魔法氣球升起，combo 繼續累積！", "correct"); }
  else if (timedOut) { setHostMessage("時間到！沒關係，看看解析，下題再出發。", "timeout"); }
  else { playWrong(); setHostMessage("答錯了！沒關係，看看解析，下一題再追回來！", "wrong"); }

  $("answer-result").textContent = correct ? "✅ 答對了！" : (timedOut ? "⏰ 時間到！" : "❌ 答錯了");
  $("answer-result").style.color = correct ? "#158657" : "#b23838";
  $("explanation-text").textContent = q.explanation || "這題目前沒有解析。";
  $("explanation-box").classList.remove("hidden");
}

function nextQuestion(){
  quizState.currentIndex += 1;
  if (quizState.currentIndex >= quizState.totalQuestions) finishQuiz();
  else renderQuestion();
}

function finishQuiz(){
  stopQuestionTimer();
  stopQuizTimer();
  quizState.active = false;

  var totalTime = Math.max(0, Math.round((Date.now() - quizState.startedAt) / 1000));
  var accuracy = quizState.totalQuestions ? quizState.correctCount / quizState.totalQuestions : 0;

  $("result-score").textContent = quizState.score;
  $("result-correct").textContent = quizState.correctCount + " / " + quizState.totalQuestions;
  $("result-accuracy").textContent = Math.round(accuracy * 100) + "%";
  $("result-max-combo").textContent = quizState.maxCombo;
  $("result-time").textContent = totalTime + "s";

  var title = "🎉 小V宣布：挑戰完成！";
  var emoji = "🎈";
  if (quizState.correctCount === 10) { title = "🏆 V學園滿分王！"; emoji = "🏆"; }
  else if (quizState.correctCount >= 8) { title = "🌟 知識派對高手！"; emoji = "🌟"; }
  else if (quizState.correctCount >= 5) { title = "🎉 穩定挑戰者！"; emoji = "🎉"; }
  else { title = "💪 再接再厲學員！"; emoji = "💪"; }
  $("result-title").textContent = title;
  $("result-emoji").textContent = emoji;
  setResultHostVisual();
  if ($("result-unlock-banner")) $("result-unlock-banner").classList.add("hidden");
  if ($("result-vcoin-banner")) $("result-vcoin-banner").classList.add("hidden");

  showScreen("screen-result");
  saveQuizResult(totalTime, accuracy);
}

function buildQuizRecord(totalTime, accuracy){
  var subject = SUBJECT_OPTIONS.find(function(s){ return s.key === selectedSubject; }) || {};
  var grade = GRADE_OPTIONS.find(function(g){ return g.key === selectedGrade; }) || {};
  var now = Date.now();

  validateDisplayAvatarForCurrentIdentity();
  var av = getAvatarByKey(PLAYER.displayAvatarKey);

  var record = {
    gameId: "quiz",
    version: QUIZ_VERSION,
    mode: "mvp",

    id: PLAYER.id,
    name: PLAYER.name || PLAYER.id,
    playerKey: PLAYER.playerKey,
    baseAvatarKey: PLAYER.baseAvatarKey,
    displayAvatarKey: PLAYER.displayAvatarKey,
    avatarKey: PLAYER.displayAvatarKey,
    avatarSrc: resolveAvatarSrc(av.src || av.url || ""),

    gradeBand: selectedGrade,
    gradeBandName: grade.name || selectedGrade,
    subject: selectedSubject,
    subjectName: subject.name || selectedSubject,
    difficulty: null,

    score: quizState.score,
    correctCount: quizState.correctCount,
    totalQuestions: quizState.totalQuestions,
    maxCombo: quizState.maxCombo,
    accuracy: Number(accuracy.toFixed(4)),
    timeUsedTotal: totalTime,

    usedQuestionIds: quizState.questions.map(function(q){ return q.id; }),
    answers: quizState.answers.slice(),

    rewardsPreview: {
      vCoins: 30,
      note: "每日任一遊戲完成一次可領取；實際領取以 Firebase dailyRewards 判斷"
    },

    ts: now,
    date: new Date(now).toISOString()
  };
  return addEquippedTitleSnapshot(record);
}

function saveLocalLog(record){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return;  // 不寫入 vquiz_localLogs（裝置共用、不分玩家）
}

function saveGameLog(record){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.submitRecord(record);
}


function ensureXiaovBaseCatalog(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(null);
}

function unlockXiaovBaseAfterGameComplete(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(null);  // 共用頭像解鎖 API 尚未完成
}

function showAvatarUnlockBanner(unlockPayload){
  var box = $("result-unlock-banner");
  if (!box || !unlockPayload) return;
  var title = $("unlock-title");
  var msg = $("unlock-message");
  var name = unlockPayload.name || "新顯示頭像";
  if (title) title.textContent = "🎉 新頭像解鎖：" + name;
  if (msg) msg.textContent = "完成問答挑戰成功解鎖！到「玩家設定 → 選顯示頭像」可以手動裝備；目前遊戲身份不會改變。";
  box.classList.remove("hidden");
  box.classList.remove("pop");
  void box.offsetWidth;
  box.classList.add("pop");
}

function getTaiwanDateKey(dateInput){
  var d = dateInput ? new Date(dateInput) : new Date();
  try {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(d);
    var map = {};
    parts.forEach(function(part){ map[part.type] = part.value; });
    if (map.year && map.month && map.day) return map.year + map.month + map.day;
  } catch(e) {}
  // Fallback：用 UTC + 8 小時計算台灣日期，避免直接使用 UTC 日期。
  var tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  var y = tw.getUTCFullYear();
  var m = String(tw.getUTCMonth() + 1).padStart(2, "0");
  var day = String(tw.getUTCDate()).padStart(2, "0");
  return String(y) + m + day;
}


function hashDateKeyForDailyChallenge(dateKey){
  var str = "vquiz-daily-" + String(dateKey || "");
  var h = 0;
  for (var i=0;i<str.length;i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getDailyChallengeForDate(dateKey){
  dateKey = dateKey || getTaiwanDateKey();
  var h = hashDateKeyForDailyChallenge(dateKey);
  var grade = GRADE_OPTIONS[h % GRADE_OPTIONS.length];
  var subject = SUBJECT_OPTIONS[Math.floor(h / GRADE_OPTIONS.length) % SUBJECT_OPTIONS.length];
  return {
    dateKey: dateKey,
    gradeBand: grade.key,
    gradeBandName: grade.name,
    subject: subject.key,
    subjectName: subject.name,
    subjectEmoji: subject.emoji || "📘",
    title: "今日挑戰",
    description: (grade.name || grade.key) + "・" + (subject.name || subject.key)
  };
}

function isRecordMatchingDailyChallenge(record, challenge){
  if (!record || !challenge) return false;
  return record.gradeBand === challenge.gradeBand && record.subject === challenge.subject;
}

function getDailyChallengeRef(playerKey, dateKey){
  return firebaseDb.ref(DB_PATHS.players + "/" + playerKey + "/dailyChallenges/" + DAILY_CHALLENGE_GAME_ID + "/" + dateKey);
}

function loadDailyChallengeStatus(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  var challenge = getDailyChallengeForDate();
  var done = UniverseQuiz.isDailyChallengeDone(challenge);
  DAILY_CHALLENGE_STATUS = { challenge: challenge, completed: done, record: done ? { completed: true, rewardClaimed: false } : null, loaded: true };
  renderDailyChallengeCard();
  return Promise.resolve(DAILY_CHALLENGE_STATUS);
}

function saveDailyChallengeCompletion(record, sourceLogId){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  var challenge = getDailyChallengeForDate();
  if (!isRecordMatchingDailyChallenge(record, challenge)) {
    return Promise.resolve({ completed:false, reason:"not_today_challenge", challenge:challenge });
  }
  UniverseQuiz.markDailyChallengeDone(challenge);  // 只記錄完成（依 playerId＋台灣日期），不發 +10 V幣
  DAILY_CHALLENGE_STATUS = { challenge: challenge, completed: true, record: { completed: true, rewardClaimed: false }, loaded: true };
  renderDailyChallengeCard();
  return Promise.resolve({ completed:true, rewardClaimed:false, reason:"reward_not_implemented", challenge:challenge });
}

function renderDailyChallengeCard(){
  var card = $("daily-challenge-card");
  if (!card) return;
  var status = DAILY_CHALLENGE_STATUS || { challenge:getDailyChallengeForDate(), completed:false };
  var c = status.challenge || getDailyChallengeForDate();
  var title = $("daily-challenge-title");
  var desc = $("daily-challenge-desc");
  var stat = $("daily-challenge-status");
  var btn = $("btn-daily-challenge");
  if (title) title.textContent = "🎯 今日挑戰";
  if (desc) desc.textContent = (c.subjectEmoji || "📘") + " " + c.description;
  card.classList.toggle("completed", !!status.completed);
  if (stat) {
    var record = status.record || {};
    if (status.completed && record.rewardClaimed === true) {
      stat.textContent = "今日挑戰已完成，+10 V幣已領取。";
    } else if (status.completed) {
      stat.textContent = UniverseQuiz.dailyChallengeText(true);  // [Universe 換殼]
    } else {
      stat.textContent = UniverseQuiz.dailyChallengeText(false);  // [Universe 換殼]
    }
  }
  if (btn) {
    var recordForButton = status.record || {};
    btn.textContent = status.completed ? (recordForButton.rewardClaimed === true ? "已完成" : "再挑戰一次") : "開始今日挑戰";  // [Universe 換殼] 不再提示補領 V幣
    btn.disabled = !!(status.completed && recordForButton.rewardClaimed === true);
  }
}

function openDailyChallenge(){
  if (!hasConfirmedQuizProfile()) {
    toast("首次遊玩請先確認玩家身份。");
    showScreen("screen-profile");
    return;
  }
  var c = getDailyChallengeForDate();
  selectedGrade = c.gradeBand;
  selectedSubject = c.subject;
  buildSetupOptions();
  updateQuestionCountHint();
  showScreen("screen-setup");
  toast("今日挑戰：" + c.description);
}

function showDailyChallengeResultBanner(dailyResult){
  var box = $("result-daily-challenge-banner");
  if (!box) return;
  box.classList.add("hidden");
  box.classList.remove("pop", "completed", "missed", "failed");
  if (!dailyResult) return;

  // v0.2.38：每日首次完成 +30 與今日挑戰 +10 會在同一個結算流程中出現。
  // showVCoinRewardBanner 可能先用 +30 的 balanceAfter 更新右上角，
  // 因此今日挑戰 banner 必須再用最新的 +10 後餘額覆蓋一次，避免右上角停在 30。
  if (typeof dailyResult.balanceAfter === "number" && isFinite(dailyResult.balanceAfter)) {
    forceWalletBalanceUIDirect(dailyResult.balanceAfter, "show_daily_challenge_banner");
  }

  var title = $("daily-result-title");
  var msg = $("daily-result-message");
  var c = dailyResult.challenge || getDailyChallengeForDate();
  if (dailyResult.completed && dailyResult.rewardClaimed === true) {
    box.classList.add("completed");
    if (title) title.textContent = "🎯 今日挑戰完成！+" + (dailyResult.rewardAmount || 10) + " V幣";
    if (msg) msg.textContent = c.description + " 已完成，今日挑戰獎勵 +" + (dailyResult.rewardAmount || 10) + " V幣！" + (typeof dailyResult.balanceAfter === "number" ? "\n目前餘額：" + dailyResult.balanceAfter + " V幣" : "");
  } else if (dailyResult.completed && dailyResult.reason === "reward_pending") {
    box.classList.add("failed");
    if (title) title.textContent = "今日挑戰獎勵處理中";
    if (msg) msg.textContent = "今日挑戰已完成，但 +10 V幣尚未確認入帳。請稍後再試一次今日挑戰補領。" + (typeof dailyResult.balanceAfter === "number" ? "\n目前餘額：" + dailyResult.balanceAfter + " V幣" : "");
  } else if (dailyResult.completed && dailyResult.reason === "reward_failed") {
    box.classList.add("failed");
    if (title) title.textContent = "今日挑戰完成，但獎勵未入帳";
    if (msg) msg.textContent = "今日挑戰已完成，但 +10 V幣寫入失敗；系統保留補領狀態，請稍後再完成一次今日挑戰補領。" + (typeof dailyResult.balanceAfter === "number" ? "\n目前餘額：" + dailyResult.balanceAfter + " V幣" : "");
  } else if (dailyResult.completed) {
    box.classList.add("completed");
    if (title) title.textContent = "🎯 今日挑戰完成！";
    if (msg) msg.textContent = c.description + " 已完成。" + (typeof dailyResult.balanceAfter === "number" ? "\n目前餘額：" + dailyResult.balanceAfter + " V幣" : "");
  } else if (dailyResult.alreadyCompleted) {
    box.classList.add("completed");
    if (title) title.textContent = "今日挑戰已完成";
    if (msg) msg.textContent = "你今天已經完成今日挑戰，今日獎勵已領取。" + (typeof dailyResult.balanceAfter === "number" ? "\n目前餘額：" + dailyResult.balanceAfter + " V幣" : "");
  } else if (dailyResult.reason === "not_today_challenge") {
    return;
  } else if (dailyResult.reason === "write_failed") {
    box.classList.add("failed");
    if (title) title.textContent = "今日挑戰紀錄失敗";
    if (msg) msg.textContent = "本次成績已保存，但今日挑戰紀錄或 +10 V幣獎勵寫入失敗。";
  } else {
    return;
  }
  box.classList.remove("hidden");
  box.classList.remove("pop");
  void box.offsetWidth;
  box.classList.add("pop");
}

function normalizeWalletData(wallet){
  wallet = wallet || {};
  var balance = Number(wallet.balance || 0);
  var totalEarned = Number(wallet.totalEarned || 0);
  var totalSpent = Number(wallet.totalSpent || 0);
  if (!isFinite(balance)) balance = 0;
  if (!isFinite(totalEarned)) totalEarned = 0;
  if (!isFinite(totalSpent)) totalSpent = 0;
  return { balance: balance, totalEarned: totalEarned, totalSpent: totalSpent };
}

function updateWalletBalanceUI(balance){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  if ($("top-vcoin-balance")) $("top-vcoin-balance").textContent = "🪙 V幣：" + UniverseQuiz.walletText();
  if ($("profile-vcoin-balance")) $("profile-vcoin-balance").textContent = UniverseQuiz.walletText();
}

function forceWalletBalanceUIDirect(balance, reason){
  if (!(typeof balance === "number" && isFinite(balance))) return;
  PLAYER_WALLET_BALANCE = balance;
  var text = String(balance);

  function apply(){
    // v0.2.39：結算畫面右上角玩家卡偶爾會被舊的 +30 顯示結果覆蓋。
    // 這裡不只改全域狀態，也直接改 DOM，並在下一個 repaint / 短延遲後再補一次。
    var top = $("top-vcoin-balance");
    var profile = $("profile-vcoin-balance");
    if (top) {
      top.textContent = "🪙 V幣：" + text;
      top.setAttribute("data-wallet-balance", text);
      if (top.parentElement) top.parentElement.setAttribute("data-wallet-balance", text);
    }
    if (profile) {
      profile.textContent = text;
      profile.setAttribute("data-wallet-balance", text);
    }
    if (document && document.body) {
      document.body.setAttribute("data-wallet-balance", text);
      document.body.setAttribute("data-wallet-sync-reason", reason || "wallet_sync");
    }
  }

  updateWalletBalanceUI(balance);
  apply();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 120);
  setTimeout(apply, 400);
}

function loadWalletBalance(playerKey){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  updateWalletBalanceUI();
  return Promise.resolve(null);
}

function applyVCoinEarnTransaction(playerKey, tx){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve({ claimed:false, amount:0, reason:"not_implemented" });
}

function claimDailyAnyGameReward(playerKey, gameId, sourceLogId){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve({ claimed:false, amount:0, reason:"not_implemented", dateKey:getTaiwanDateKey() });
}


function getBrainSubjectKey(){
  var found = SUBJECT_OPTIONS.find(function(s){ return s.key === "brain"; });
  if (found) return found.key;
  var byName = SUBJECT_OPTIONS.find(function(s){ return String(s.name || "").indexOf("腦筋") >= 0; });
  return byName ? byName.key : "brain";
}

function normalizeEquippedTitleData(raw, fallbackGameId, fallbackSource){
  raw = raw || null;
  if (!raw || raw.unlocked === false) return null;

  var titleKey = raw.titleKey || raw.key || raw.id || "";
  var name = raw.name || raw.title || raw.label || titleKey || "";
  if (!titleKey && !name) return null;

  var gameId = raw.gameId || raw.sourceGameId || fallbackGameId || "quiz";
  var source = raw.source || raw.sourceKey || fallbackSource || gameId || "quiz";
  var originPath = raw.originPath || (titleKey ? ("titles/" + gameId + "/" + titleKey) : "");
  var equippedAt = raw.equippedAt || raw.updatedAt || raw.unlockedAt || raw.createdAt || 0;

  return {
    titleKey: titleKey,
    name: name || titleKey || "未命名稱號",
    gameId: gameId,
    source: source,
    originPath: originPath,
    equippedAt: equippedAt,
    updatedAt: raw.updatedAt || equippedAt || 0
  };
}

function normalizeQuizTitleData(raw){
  return normalizeEquippedTitleData(raw, "quiz", "quiz_legacy");
}

function renderEquippedTitle(){
  var name = (PLAYER_EQUIPPED_TITLE && PLAYER_EQUIPPED_TITLE.name) ? PLAYER_EQUIPPED_TITLE.name : UniverseQuiz.titleText();  // [Universe 換殼]
  if ($("top-player-title")) $("top-player-title").textContent = "稱號：" + name;
  if ($("profile-equipped-title")) $("profile-equipped-title").textContent = name;
  renderTitlePicker();
}

function getEquippedTitleSnapshot(){
  var t = normalizeEquippedTitleData(PLAYER_EQUIPPED_TITLE, "quiz", "quiz_legacy");
  return {
    equippedTitleKey: t && t.titleKey ? t.titleKey : "",
    equippedTitleName: t && t.name ? t.name : "",
    equippedTitleGameId: t && t.gameId ? t.gameId : ""
  };
}

function addEquippedTitleSnapshot(payload){
  payload = payload || {};
  var snap = getEquippedTitleSnapshot();
  payload.equippedTitleKey = snap.equippedTitleKey;
  payload.equippedTitleName = snap.equippedTitleName;
  payload.equippedTitleGameId = snap.equippedTitleGameId;
  return payload;
}

function syncLeaderboardTitleSnapshot(gradeBand){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(false);
}

function loadQuizTitleData(playerKey){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  PLAYER_QUIZ_TITLES = {};
  PLAYER_QUIZ_BADGES = {};
  PLAYER_EQUIPPED_TITLE = null;
  renderEquippedTitle();
  return Promise.resolve({ badges:{}, titles:{}, equipped:null });
}

function equipQuizTitle(titleKey){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  UniverseQuiz.notReady('titles');
  return Promise.resolve(false);
}

function renderTitlePicker(){
  var list = $("profile-title-list");
  if (!list) return;
  list.innerHTML = "";
  var titles = [];
  Object.keys(PLAYER_QUIZ_TITLES || {}).forEach(function(key){
    var t = PLAYER_QUIZ_TITLES[key];
    if (t && t.unlocked === true) {
      titles.push({ titleKey:key, name:t.name || key, unlockedAt:t.unlockedAt || 0 });
    }
  });
  titles.sort(function(a,b){ return (a.unlockedAt || 0) - (b.unlockedAt || 0); });
  if (!titles.length) {
    var empty = document.createElement("span");
    empty.className = "title-item empty";
    empty.textContent = "尚未解鎖稱號";
    list.appendChild(empty);
    return;
  }
  titles.forEach(function(t){
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "title-item" + (PLAYER_EQUIPPED_TITLE && PLAYER_EQUIPPED_TITLE.titleKey === t.titleKey ? " equipped" : "");
    btn.textContent = t.name;
    btn.addEventListener("click", function(){ equipQuizTitle(t.titleKey); });
    list.appendChild(btn);
  });
}

function isFullScoreRecord(record){
  var correct = Number(record && record.correctCount || 0);
  var total = Number(record && record.totalQuestions || 0);
  return total > 0 && correct >= total;
}

function gradeCompletedSubjectCountFromAcademy(academyAfter, gradeBand){
  if (!academyAfter || !gradeBand) return null;
  var source = academyAfter.gradeProgress || academyAfter.gradeSummary || {};
  var gp = source[gradeBand];
  if (!gp) return null;
  var completed = Number(gp.completedSubjects || 0);
  return isFinite(completed) ? completed : null;
}

function fallbackCompletedSubjectCount(gradeBand){
  if (!PLAYER.playerKey || !gradeBand) return Promise.resolve(0);
  return ensureFirebaseReady().then(function(ok){
    if (!ok || !firebaseDb) return 0;
    return firebaseDb.ref(DB_PATHS.players + "/" + PLAYER.playerKey + "/quizProgress/" + gradeBand).once("value").then(function(snap){
      var data = snap.val() || {};
      var count = 0;
      Object.keys(data).forEach(function(subjectKey){
        var p = data[subjectKey];
        if (!p || typeof p !== "object") return;
        if (Number(p.attempts || 0) > 0 || Number(p.bestScore || 0) > 0 || Number(p.lastScore || 0) > 0 || Number(p.updatedAt || 0) > 0) count += 1;
      });
      return count;
    });
  }).catch(function(e){
    console.warn("[QuizBadge] fallback completed subject read failed:", e);
    return 0;
  });
}

function evaluateQuizBadgeDefs(record, academyAfter){
  var candidates = [];
  var brainKey = getBrainSubjectKey();
  var fullScore = isFullScoreRecord(record);

  QUIZ_BADGE_DEFS.forEach(function(def){
    if (def.type === "first_clear") {
      candidates.push(def);
    } else if (def.type === "first_perfect" && fullScore) {
      candidates.push(def);
    } else if (def.type === "brain_perfect" && fullScore && record.subject === brainKey) {
      candidates.push(def);
    } else if (def.type === "grade_all_subjects") {
      var completed = gradeCompletedSubjectCountFromAcademy(academyAfter, def.gradeBand);
      if (completed !== null && completed >= SUBJECT_OPTIONS.length) candidates.push(def);
    }
  });

  var pendingFallbacks = QUIZ_BADGE_DEFS.filter(function(def){
    return def.type === "grade_all_subjects" && candidates.indexOf(def) < 0 && gradeCompletedSubjectCountFromAcademy(academyAfter, def.gradeBand) === null;
  });
  if (!pendingFallbacks.length) return Promise.resolve(candidates);

  var jobs = pendingFallbacks.map(function(def){
    return fallbackCompletedSubjectCount(def.gradeBand).then(function(count){ return { def:def, count:count }; });
  });
  return Promise.all(jobs).then(function(results){
    results.forEach(function(item){ if (item.count >= SUBJECT_OPTIONS.length) candidates.push(item.def); });
    return candidates;
  });
}

function unlockQuizBadgeAndTitle(def, sourceLogId, existingEquipped){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(null);
}

function checkAndUnlockQuizBadges(record, sourceLogId, academyAfter){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve({ unlocked: [] });  // 共用徽章／稱號 API 尚未完成
}

function showBadgeUnlockBanner(badgeResult){
  var box = $("result-badge-banner");
  if (!box) return;
  box.classList.add("hidden");
  box.classList.remove("pop");
  var unlocked = badgeResult && badgeResult.unlocked ? badgeResult.unlocked : [];
  if (!unlocked.length) return;
  var title = $("badge-unlock-title");
  var msg = $("badge-unlock-message");
  var names = unlocked.map(function(b){ return b.name; }).join("、");
  if (title) title.textContent = "🏅 新徽章解鎖！";
  if (msg) {
    if (unlocked.length === 1) msg.textContent = unlocked[0].name + "\n" + (unlocked[0].description || "新的 V學園稱號已解鎖");
    else msg.textContent = names;
  }
  box.classList.remove("hidden");
  void box.offsetWidth;
  box.classList.add("pop");
}

function showVCoinRewardBanner(vcoinResult){
  if (UniverseQuiz.showVcoinNotice(vcoinResult)) return;  // [Universe 換殼]
  var box = $("result-vcoin-banner");
  if (!box || !vcoinResult) return;
  var title = $("vcoin-title");
  var msg = $("vcoin-message");
  box.classList.remove("hidden", "claimed", "already", "failed");

  if (typeof vcoinResult.balanceAfter === "number") updateWalletBalanceUI(vcoinResult.balanceAfter);

  if (vcoinResult.claimed === true) {
    box.classList.add("claimed");
    if (title) title.textContent = "🎁 今日首次完成遊戲！";
    if (msg) msg.textContent = "+" + (vcoinResult.amount || 30) + " V幣" + (typeof vcoinResult.balanceAfter === "number" ? "\n目前餘額：" + vcoinResult.balanceAfter + " V幣" : "");
  } else if (vcoinResult.reason === "already_claimed") {
    box.classList.add("already");
    if (title) title.textContent = "今日 V幣已領取";
    if (msg) msg.textContent = "明天再完成任一遊戲可再領 +30" + (typeof vcoinResult.balanceAfter === "number" ? "\n目前餘額：" + vcoinResult.balanceAfter + " V幣" : "");
  } else {
    box.classList.add("failed");
    if (title) title.textContent = "V幣獎勵寫入失敗";
    if (msg) msg.textContent = "請稍後再試";
  }
}

function saveQuizResult(totalTime, accuracy){
  var record = buildQuizRecord(totalTime, accuracy);
  $("save-status").textContent = "正在保存本次成績、個人進度、排行榜與 V學園成績單...";
  if ($("result-academy-progress")) $("result-academy-progress").classList.add("hidden");
  if ($("result-unlock-banner")) $("result-unlock-banner").classList.add("hidden");
  if ($("result-vcoin-banner")) $("result-vcoin-banner").classList.add("hidden");
  if ($("result-badge-banner")) $("result-badge-banner").classList.add("hidden");
  if ($("result-daily-challenge-banner")) $("result-daily-challenge-banner").classList.add("hidden");

  saveLocalLog(record);

  var academyBefore = null;
  var sourceLogId = null;

  function safeStep(label, fn, fallback){
    return Promise.resolve().then(fn).catch(function(err){
      console.warn("[SaveResult] " + label + " failed:", err);
      return fallback;
    });
  }

  return safeStep("load academy before", function(){
      return loadQuizAcademyProgressSummary();
    }, null)
    .then(function(before){
      academyBefore = before;
      return saveGameLog(record);
    })
    .then(function(logRef){
      sourceLogId = logRef && logRef.key ? logRef.key : null;

      // gameLogs 已成功後，後續各項同步分開處理：
      // 任一附加流程失敗都不應把整場顯示為「成績保存失敗」。
      var result = {
        unlockResult: null,
        progressResult: null,
        gradeRecord: null,
        mainRecord: null,
        academyAfter: null,
        vcoinResult: null,
        badgeResult: null,
        dailyChallengeResult: null,
        syncWarnings: []
      };

      return safeStep("unlock xiaov_base", function(){
          return unlockXiaovBaseAfterGameComplete();
        }, null)
        .then(function(unlockResult){
          result.unlockResult = unlockResult;
          return safeStep("update quizProgress", function(){
            return updateQuizProgress(record);
          }, null);
        })
        .then(function(progressResult){
          result.progressResult = progressResult;
          if (!progressResult) result.syncWarnings.push("quizProgress");
          return safeStep("update grade leaderboard", function(){
            return updateGradeLeaderboard(record.gradeBand);
          }, null);
        })
        .then(function(gradeRecord){
          result.gradeRecord = gradeRecord;
          if (!gradeRecord) result.syncWarnings.push("gradeLeaderboard");
          return safeStep("update main leaderboard", function(){
            return updateMainLeaderboardFromGrades();
          }, null);
        })
        .then(function(mainRecord){
          result.mainRecord = mainRecord;
          if (!mainRecord) result.syncWarnings.push("mainLeaderboard");
          return safeStep("update academy progress", function(){
            return updateQuizAcademyProgress();
          }, null);
        })
        .then(function(academyAfter){
          result.academyAfter = academyAfter;
          if (!academyAfter) result.syncWarnings.push("academyProgress");
          return claimDailyAnyGameReward(PLAYER.playerKey, "quiz", sourceLogId).catch(function(err){
            console.warn("[Quiz] daily VCoin reward failed:", err);
            return { claimed:false, amount:0, reason:"write_failed", dateKey:getTaiwanDateKey(), error:err };
          });
        })
        .then(function(vcoinResult){
          result.vcoinResult = vcoinResult;
          return safeStep("check quiz badges", function(){
            return checkAndUnlockQuizBadges(record, sourceLogId, result.academyAfter);
          }, { unlocked: [] });
        })
        .then(function(badgeResult){
          result.badgeResult = badgeResult || { unlocked: [] };
          return safeStep("save daily challenge", function(){
            return saveDailyChallengeCompletion(record, sourceLogId);
          }, { completed:false, reason:"write_failed", challenge:getDailyChallengeForDate() });
        })
        .then(function(dailyChallengeResult){
          result.dailyChallengeResult = dailyChallengeResult || null;
          if (result.badgeResult && result.badgeResult.unlocked && result.badgeResult.unlocked.length) {
            return safeStep("sync leaderboard title snapshot", function(){
              return syncLeaderboardTitleSnapshot(record.gradeBand);
            }, false).then(function(){ return result; });
          }
          return result;
        });
    })
    .then(function(result){
      var progress = result.progressResult && result.progressResult.progress;
      var bestUpdated = result.progressResult && result.progressResult.bestUpdated;
      var gradeRecord = result.gradeRecord || {};
      var mainRecord = result.mainRecord || {};
      var academyAfter = result.academyAfter || null;
      var unlockResult = result.unlockResult || null;
      var vcoinResult = result.vcoinResult || null;
      var badgeResult = result.badgeResult || null;
      var dailyChallengeResult = result.dailyChallengeResult || null;
      var subjectName = record.subjectName || record.subject;

      showAvatarUnlockBanner(unlockResult);
      showVCoinRewardBanner(vcoinResult);
      showBadgeUnlockBanner(badgeResult);
      showDailyChallengeResultBanner(dailyChallengeResult);

      // v0.2.38：結算所有獎勵 banner 都渲染後，再做最後一次錢包 UI 對齊。
      // 優先使用今日挑戰 +10 後的 balanceAfter；沒有今日挑戰獎勵時才使用每日 +30 的 balanceAfter。
      var finalWalletBalance = null;
      if (dailyChallengeResult && typeof dailyChallengeResult.balanceAfter === "number" && isFinite(dailyChallengeResult.balanceAfter)) {
        finalWalletBalance = dailyChallengeResult.balanceAfter;
      } else if (vcoinResult && typeof vcoinResult.balanceAfter === "number" && isFinite(vcoinResult.balanceAfter)) {
        finalWalletBalance = vcoinResult.balanceAfter;
      }
      if (typeof finalWalletBalance === "number") {
        forceWalletBalanceUIDirect(finalWalletBalance, "result_final_sync_before_player_ui");
        updatePlayerUI();
        forceWalletBalanceUIDirect(finalWalletBalance, "result_final_sync_after_player_ui");
        loadWalletBalance(PLAYER.playerKey).then(function(firebaseBalance){
          if (typeof firebaseBalance === "number" && isFinite(firebaseBalance)) {
            forceWalletBalanceUIDirect(firebaseBalance, "result_final_firebase_wallet_confirm");
          }
        });
      }

      var lines = ["✅ " + UniverseQuiz.savedText()];  // [Universe 換殼] 本場成績只存在本分頁（Mock）
      if (bestUpdated) lines.push("✅ " + subjectName + "最佳紀錄刷新！");
      else if (progress) lines.push(subjectName + "最佳仍維持 " + (progress.bestScore || 0) + " 分");

      if (gradeRecord && typeof gradeRecord.gradeTotalScore !== "undefined") {
        lines.push("🌱 " + (record.gradeBandName || record.gradeBand) + "總分：" + (gradeRecord.gradeTotalScore || 0) + " 分");
      }
      if (mainRecord && typeof mainRecord.totalScore !== "undefined") {
        lines.push("🏆 總榜總分：" + (mainRecord.totalScore || 0) + " 分");
      }

      if (vcoinResult && vcoinResult.reason === "write_failed") {
        lines.push("⚠️ V幣獎勵寫入失敗，請稍後再試");
      }
      if (dailyChallengeResult && dailyChallengeResult.completed && dailyChallengeResult.rewardClaimed === true) {
        lines.push("🎯 今日挑戰完成，+" + (dailyChallengeResult.rewardAmount || 10) + " V幣");
      } else if (dailyChallengeResult && dailyChallengeResult.completed && dailyChallengeResult.rewardClaimed !== true) {
        lines.push("🎯 今日挑戰完成（" + UniverseQuiz.labels.dailyRewardPending + "）");  // [Universe 換殼] +10 待 WalletService 決議
      } else if (dailyChallengeResult && dailyChallengeResult.reason === "write_failed") {
        lines.push("⚠️ 今日挑戰紀錄或 +10 V幣獎勵寫入失敗");
      }
      if (result.syncWarnings && result.syncWarnings.length) {
        lines.push("⚠️ 部分進度 / 排行榜同步失敗，請稍後再試");
      }
      if (!bestUpdated) lines.push("再挑戰其他科目，也可以提升 V學園完成度。");
      $("save-status").textContent = lines.join("\n");

      if ($("result-academy-progress") && $("result-academy-lines") && academyAfter) {
        $("result-academy-lines").textContent = buildAcademyResultLines(academyBefore, academyAfter);
        $("result-academy-progress").classList.remove("hidden");
      }
      if (academyAfter) renderAcademyProgress(academyAfter);
    })
    .catch(function(e){
      // 只有 gameLogs 本身失敗，才視為本次 Firebase 成績保存失敗。
      console.warn("[SaveResult] gameLogs save failed:", e);
      $("save-status").textContent = UniverseQuiz.saveFailedText();  // [Universe 換殼]
      showVCoinRewardBanner({ claimed:false, amount:0, reason:"write_failed", dateKey:getTaiwanDateKey(), error:e });
    });
}


function makeSubjectProgressFromRecord(record, oldProgress){
  oldProgress = oldProgress || {};
  var now = Date.now();
  var totalQuestions = Number(record.totalQuestions || oldProgress.totalQuestions || oldProgress.bestTotalQuestions || 10);
  var current = {
    score: Number(record.score || 0),
    correctCount: Number(record.correctCount || 0),
    maxCombo: Number(record.maxCombo || 0),
    timeUsedTotal: Number(record.timeUsedTotal || record.timeUsed || 0),
    ts: Number(record.ts || record.updatedAt || now)
  };
  var oldBest = oldProgress && (oldProgress.bestScore || oldProgress.bestCorrectCount || oldProgress.bestMaxCombo || oldProgress.bestUpdatedAt) ? {
    score: Number(oldProgress.bestScore || 0),
    correctCount: Number(oldProgress.bestCorrectCount || 0),
    maxCombo: Number(oldProgress.bestMaxCombo || 0),
    timeUsedTotal: Number(oldProgress.bestTimeUsedTotal || 999999),
    ts: Number(oldProgress.bestUpdatedAt || oldProgress.updatedAt || 0)
  } : null;
  var bestUpdated = shouldUpdateBestRecord(oldBest, current);
  var attempts = Number(oldProgress.attempts || 0) + 1;

  var progress = {
    gameId: "quiz",
    version: QUIZ_VERSION,
    playerKey: record.playerKey || PLAYER.playerKey,
    gradeBand: record.gradeBand,
    gradeBandName: record.gradeBandName || getGradeName(record.gradeBand),
    subject: record.subject,
    subjectName: record.subjectName || getSubjectName(record.subject),

    bestScore: bestUpdated ? current.score : Number(oldProgress.bestScore || 0),
    bestCorrectCount: bestUpdated ? current.correctCount : Number(oldProgress.bestCorrectCount || 0),
    bestMaxCombo: bestUpdated ? current.maxCombo : Number(oldProgress.bestMaxCombo || 0),
    bestTimeUsedTotal: bestUpdated ? current.timeUsedTotal : Number(oldProgress.bestTimeUsedTotal || 0),
    bestTotalQuestions: bestUpdated ? totalQuestions : Number(oldProgress.bestTotalQuestions || oldProgress.totalQuestions || totalQuestions),
    bestUpdatedAt: bestUpdated ? current.ts : Number(oldProgress.bestUpdatedAt || oldProgress.updatedAt || current.ts),

    attempts: attempts,
    lastScore: current.score,
    lastCorrectCount: current.correctCount,
    lastMaxCombo: current.maxCombo,
    lastTimeUsedTotal: current.timeUsedTotal,
    lastTotalQuestions: totalQuestions,
    updatedAt: now
  };

  progress.totalQuestions = progress.bestTotalQuestions;
  progress.perfect = Number(progress.bestCorrectCount || 0) >= Number(progress.bestTotalQuestions || totalQuestions || 10);

  return { progress: progress, bestUpdated: bestUpdated };
}

function updateQuizProgress(record){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.mock.getProgressRoot().then(function(root){
    var oldProgress = (root[record.gradeBand] && root[record.gradeBand][record.subject]) || {};
    var result = makeSubjectProgressFromRecord(record, oldProgress);
    root[record.gradeBand] = root[record.gradeBand] || {};
    root[record.gradeBand][record.subject] = result.progress;
    return UniverseQuiz.mock.setProgressRoot(root).then(function(){ return result; });
  });
}

function shouldUpdateBestRecord(oldRecord, newRecord){
  if (!oldRecord) return true;
  if ((newRecord.score || 0) !== (oldRecord.score || 0)) return (newRecord.score || 0) > (oldRecord.score || 0);
  if ((newRecord.correctCount || 0) !== (oldRecord.correctCount || 0)) return (newRecord.correctCount || 0) > (oldRecord.correctCount || 0);
  if ((newRecord.maxCombo || 0) !== (oldRecord.maxCombo || 0)) return (newRecord.maxCombo || 0) > (oldRecord.maxCombo || 0);
  if ((newRecord.timeUsedTotal || 999999) !== (oldRecord.timeUsedTotal || 999999)) return (newRecord.timeUsedTotal || 999999) < (oldRecord.timeUsedTotal || 999999);
  return (newRecord.ts || 0) > (oldRecord.ts || 0);
}

function getGradeName(gradeKey){
  var g = GRADE_OPTIONS.find(function(item){ return item.key === gradeKey; });
  return g ? g.name : gradeKey;
}

function getSubjectName(subjectKey){
  var s = SUBJECT_OPTIONS.find(function(item){ return item.key === subjectKey; });
  return s ? s.name : subjectKey;
}

function subjectSortIndex(key){
  var idx = SUBJECT_OPTIONS.findIndex(function(s){ return s.key === key; });
  return idx < 0 ? 999 : idx;
}

function buildGradeRecordFromProgress(gradeBand, progressMap){
  var now = Date.now();
  var entries = [];
  Object.keys(progressMap || {}).forEach(function(subjectKey){
    var p = progressMap[subjectKey];
    if (!p || typeof p !== "object") return;
    if (!p.bestScore && !p.attempts) return;
    entries.push({ key:subjectKey, progress:p });
  });
  entries.sort(function(a,b){ return subjectSortIndex(a.key) - subjectSortIndex(b.key); });

  var subjectKeys = [];
  var subjectNames = [];
  var gradeTotalScore = 0;
  var perfectSubjects = 0;
  var totalCorrect = 0;
  var totalQuestions = 0;
  var totalMaxCombo = 0;
  var totalTimeUsed = 0;
  var totalAttempts = 0;

  entries.forEach(function(item){
    var p = item.progress;
    subjectKeys.push(p.subject || item.key);
    subjectNames.push(p.subjectName || getSubjectName(item.key));
    gradeTotalScore += Number(p.bestScore || 0);
    if (p.perfect === true) perfectSubjects += 1;
    totalCorrect += Number(p.bestCorrectCount || 0);
    totalQuestions += Number(p.bestTotalQuestions || p.totalQuestions || 10);
    totalMaxCombo += Number(p.bestMaxCombo || 0);
    totalTimeUsed += Number(p.bestTimeUsedTotal || 0);
    totalAttempts += Number(p.attempts || 0);
  });

  var av = getAvatarByKey(PLAYER.displayAvatarKey);
  var record = {
    gameId: "quiz",
    version: QUIZ_VERSION,

    id: PLAYER.id,
    name: PLAYER.name || PLAYER.id,
    playerKey: PLAYER.playerKey,
    baseAvatarKey: PLAYER.baseAvatarKey,
    displayAvatarKey: PLAYER.displayAvatarKey,
    avatarKey: PLAYER.displayAvatarKey,
    avatarSrc: resolveAvatarSrc(av.src || av.url || PLAYER.avatarSrc || ""),

    gradeBand: gradeBand,
    gradeBandName: getGradeName(gradeBand),

    gradeTotalScore: gradeTotalScore,
    completedSubjects: entries.length,
    perfectSubjects: perfectSubjects,

    subjectKeys: subjectKeys,
    subjectNames: subjectNames,
    subjectSummaryText: entries.length + "科：" + subjectNames.join(" / "),

    totalCorrect: totalCorrect,
    totalQuestions: totalQuestions,
    totalMaxCombo: totalMaxCombo,
    totalTimeUsed: totalTimeUsed,
    totalAttempts: totalAttempts,

    updatedAt: now,
    date: new Date(now).toISOString()
  };
  return addEquippedTitleSnapshot(record);
}

function updateGradeLeaderboard(gradeBand){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.mock.getProgressRoot().then(function(root){
    var gradeRecord = buildGradeRecordFromProgress(gradeBand, root[gradeBand] || {});
    return UniverseQuiz.mock.putBoard(gradeBand, gradeRecord).then(function(){ return gradeRecord; });
  });
}

function buildMainRecordFromGradeRecords(gradeRecords){
  var now = Date.now();
  var gradeSummary = {};
  var summaryParts = [];
  var totalScore = 0;
  var completedGrades = 0;
  var completedSubjects = 0;
  var perfectSubjects = 0;
  var totalCorrect = 0;
  var totalQuestions = 0;
  var totalMaxCombo = 0;
  var totalTimeUsed = 0;
  var totalAttempts = 0;

  GRADE_OPTIONS.forEach(function(g){
    var r = gradeRecords[g.key];
    var score = r ? Number(r.gradeTotalScore || 0) : 0;
    gradeSummary[g.key] = score;
    if (r && Number(r.completedSubjects || 0) > 0) {
      completedGrades += 1;
      completedSubjects += Number(r.completedSubjects || 0);
      perfectSubjects += Number(r.perfectSubjects || 0);
      totalCorrect += Number(r.totalCorrect || 0);
      totalQuestions += Number(r.totalQuestions || 0);
      totalMaxCombo += Number(r.totalMaxCombo || 0);
      totalTimeUsed += Number(r.totalTimeUsed || 0);
      totalAttempts += Number(r.totalAttempts || 0);
      summaryParts.push(g.name + Number(r.completedSubjects || 0) + "科");
      totalScore += score;
    }
  });

  var av = getAvatarByKey(PLAYER.displayAvatarKey);
  var record = {
    gameId: "quiz",
    version: QUIZ_VERSION,

    id: PLAYER.id,
    name: PLAYER.name || PLAYER.id,
    playerKey: PLAYER.playerKey,
    baseAvatarKey: PLAYER.baseAvatarKey,
    displayAvatarKey: PLAYER.displayAvatarKey,
    avatarKey: PLAYER.displayAvatarKey,
    avatarSrc: resolveAvatarSrc(av.src || av.url || PLAYER.avatarSrc || ""),

    totalScore: totalScore,
    completedGrades: completedGrades,
    completedSubjects: completedSubjects,
    perfectSubjects: perfectSubjects,

    gradeSummary: gradeSummary,
    gradeSummaryText: summaryParts.join(" / ") || "尚未完成挑戰",

    totalCorrect: totalCorrect,
    totalQuestions: totalQuestions,
    totalMaxCombo: totalMaxCombo,
    totalTimeUsed: totalTimeUsed,
    totalAttempts: totalAttempts,

    updatedAt: now,
    date: new Date(now).toISOString()
  };
  return addEquippedTitleSnapshot(record);
}

function updateMainLeaderboardFromGrades(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.mock.getMyGradeRecords().then(function(gradeRecords){
    var mainRecord = buildMainRecordFromGradeRecords(gradeRecords);
    return UniverseQuiz.mock.putBoard('main', mainRecord).then(function(){ return mainRecord; });
  });
}


function getTotalSubjectSlots(){
  return GRADE_OPTIONS.length * SUBJECT_OPTIONS.length;
}

function getEmptyGradeProgress(){
  return {
    completedSubjects: 0,
    perfectSubjects: 0,
    totalSubjects: SUBJECT_OPTIONS.length
  };
}

function readQuizProgressMap(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.mock.getProgressRoot();
}

function calculateQuizAcademyProgress(progressRoot){
  var now = Date.now();
  var totalSubjectSlots = getTotalSubjectSlots();
  var quizPower = 0;
  var completedSubjects = 0;
  var perfectSubjects = 0;
  var totalCorrect = 0;
  var totalQuestions = 0;
  var totalAttempts = 0;
  var allGradesPerfect = true;

  var gradeProgress = {};

  GRADE_OPTIONS.forEach(function(grade){
    var gradeMap = (progressRoot && progressRoot[grade.key]) || {};
    var gradeCompleted = 0;
    var gradePerfect = 0;
    var gradeCorrect = 0;
    var gradeQuestions = 0;
    var gradeAttempts = 0;

    SUBJECT_OPTIONS.forEach(function(subject){
      var p = gradeMap[subject.key];
      if (!p || typeof p !== "object" || (!p.bestScore && !p.attempts)) return;

      var bestCorrect = Number(p.bestCorrectCount || 0);
      var bestQuestions = Number(p.bestTotalQuestions || p.totalQuestions || 10);
      var bestScore = Number(p.bestScore || 0);
      var attempts = Number(p.attempts || 0);
      var isPerfect = p.perfect === true || (bestQuestions > 0 && bestCorrect >= bestQuestions);

      gradeCompleted += 1;
      completedSubjects += 1;
      totalCorrect += bestCorrect;
      totalQuestions += bestQuestions;
      totalAttempts += attempts;
      gradeCorrect += bestCorrect;
      gradeQuestions += bestQuestions;
      gradeAttempts += attempts;

      quizPower += 20;                // 已挑戰該科
      quizPower += bestCorrect * 5;   // 最佳答對題數
      if (bestScore >= 1000) quizPower += 30;
      if (isPerfect) {
        quizPower += 80;
        gradePerfect += 1;
        perfectSubjects += 1;
      }
    });

    if (gradeCompleted >= SUBJECT_OPTIONS.length) quizPower += 200;
    if (gradePerfect >= SUBJECT_OPTIONS.length) quizPower += 500;
    if (gradePerfect < SUBJECT_OPTIONS.length) allGradesPerfect = false;

    gradeProgress[grade.key] = {
      completedSubjects: gradeCompleted,
      perfectSubjects: gradePerfect,
      totalSubjects: SUBJECT_OPTIONS.length,
      totalCorrect: gradeCorrect,
      totalQuestions: gradeQuestions,
      totalAttempts: gradeAttempts
    };
  });

  if (perfectSubjects >= totalSubjectSlots && allGradesPerfect) quizPower += 1000;

  return {
    gameId: "quiz",
    version: QUIZ_VERSION,

    playerKey: PLAYER.playerKey,
    id: PLAYER.id,
    name: PLAYER.name || PLAYER.id,

    quizPower: quizPower,

    completedSubjects: completedSubjects,
    perfectSubjects: perfectSubjects,
    totalSubjectSlots: totalSubjectSlots,

    totalCorrect: totalCorrect,
    totalQuestions: totalQuestions,
    totalAttempts: totalAttempts,

    gradeProgress: gradeProgress,

    updatedAt: now,
    date: new Date(now).toISOString()
  };
}

function hasAcademyActivity(academy){
  if (!academy) return false;
  return Number(academy.completedSubjects || 0) > 0 ||
    Number(academy.quizPower || 0) > 0 ||
    Number(academy.totalCorrect || 0) > 0;
}

function readStoredQuizAcademyProgress(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.mock.getAcademy();
}

function calculateQuizPowerFromGradeSummary(summary){
  var quizPower = 0;
  var allGradesPerfect = true;

  GRADE_OPTIONS.forEach(function(g){
    var gp = summary.gradeProgress[g.key] || getEmptyGradeProgress();
    var completed = Number(gp.completedSubjects || 0);
    var perfect = Number(gp.perfectSubjects || 0);
    var totalSubjects = Number(gp.totalSubjects || SUBJECT_OPTIONS.length);
    var correct = Number(gp.totalCorrect || 0);
    var gradeScore = Number(gp.gradeTotalScore || 0);

    quizPower += completed * 20;
    quizPower += correct * 5;

    // byGrade 只有彙總資料，無法精準知道每一科是否達 1000 分；用年級總分保守估算。
    var estimatedHighScoreSubjects = Math.min(completed, Math.floor(gradeScore / 1000));
    quizPower += estimatedHighScoreSubjects * 30;

    quizPower += perfect * 80;
    if (completed >= totalSubjects) quizPower += 200;
    if (perfect >= totalSubjects) quizPower += 500;
    if (perfect < totalSubjects) allGradesPerfect = false;
  });

  if (summary.perfectSubjects >= summary.totalSubjectSlots && allGradesPerfect) quizPower += 1000;
  return quizPower;
}

function buildAcademyProgressFromGradeLeaderboards(gradeRecords){
  var now = Date.now();
  var totalSubjectSlots = getTotalSubjectSlots();
  var summary = {
    gameId: "quiz",
    version: QUIZ_VERSION,
    playerKey: PLAYER.playerKey,
    id: PLAYER.id,
    name: PLAYER.name || PLAYER.id,
    quizPower: 0,
    completedSubjects: 0,
    perfectSubjects: 0,
    totalSubjectSlots: totalSubjectSlots,
    totalCorrect: 0,
    totalQuestions: 0,
    totalAttempts: 0,
    gradeProgress: {},
    rebuiltFrom: "leaderboardsByGrade",
    updatedAt: now,
    date: new Date(now).toISOString()
  };

  GRADE_OPTIONS.forEach(function(g){
    var rec = gradeRecords && gradeRecords[g.key] ? gradeRecords[g.key] : null;
    var gp = getEmptyGradeProgress();
    if (rec) {
      gp.completedSubjects = Number(rec.completedSubjects || 0);
      gp.perfectSubjects = Number(rec.perfectSubjects || 0);
      gp.totalSubjects = SUBJECT_OPTIONS.length;
      gp.totalCorrect = Number(rec.totalCorrect || 0);
      gp.totalQuestions = Number(rec.totalQuestions || gp.completedSubjects * 10 || 0);
      gp.totalAttempts = Number(rec.totalAttempts || 0);
      gp.gradeTotalScore = Number(rec.gradeTotalScore || 0);

      summary.completedSubjects += gp.completedSubjects;
      summary.perfectSubjects += gp.perfectSubjects;
      summary.totalCorrect += gp.totalCorrect;
      summary.totalQuestions += gp.totalQuestions;
      summary.totalAttempts += gp.totalAttempts;
    }
    summary.gradeProgress[g.key] = gp;
  });

  summary.quizPower = calculateQuizPowerFromGradeSummary(summary);
  return summary;
}

function readGradeLeaderboardSelfSummary(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return UniverseQuiz.mock.getMyGradeRecords().then(function(records){
    return Object.keys(records).length ? buildAcademyProgressFromGradeLeaderboards(records) : null;
  });
}


function normalizeLogRecordForProgress(log){
  if (!log || typeof log !== "object") return null;
  if (log.playerKey !== PLAYER.playerKey) return null;
  if (!log.gradeBand || !log.subject) return null;

  var ts = Number(log.ts || log.updatedAt || Date.parse(log.date || "") || 0);
  return {
    gameId: "quiz",
    version: log.version || QUIZ_VERSION,
    playerKey: PLAYER.playerKey,
    gradeBand: log.gradeBand,
    gradeBandName: log.gradeBandName || getGradeName(log.gradeBand),
    subject: log.subject,
    subjectName: log.subjectName || getSubjectName(log.subject),
    score: Number(log.score || 0),
    correctCount: Number(log.correctCount || 0),
    maxCombo: Number(log.maxCombo || 0),
    timeUsedTotal: Number(log.timeUsedTotal || log.timeUsed || 0),
    totalQuestions: Number(log.totalQuestions || 10),
    ts: ts
  };
}

function buildProgressRootFromGameLogs(logMap){
  var progressRoot = {};
  var rows = [];
  Object.keys(logMap || {}).forEach(function(key){
    var rec = normalizeLogRecordForProgress(logMap[key]);
    if (rec) rows.push(rec);
  });

  // 依時間由舊到新重建，attempts 才會累加成接近真實遊玩次數。
  rows.sort(function(a,b){ return (a.ts || 0) - (b.ts || 0); });

  rows.forEach(function(rec){
    if (!progressRoot[rec.gradeBand]) progressRoot[rec.gradeBand] = {};
    var oldProgress = progressRoot[rec.gradeBand][rec.subject] || {};
    var result = makeSubjectProgressFromRecord(rec, oldProgress);
    progressRoot[rec.gradeBand][rec.subject] = result.progress;
  });

  return progressRoot;
}

function pickBetterSubjectProgress(a, b){
  if (!a) return b || null;
  if (!b) return a || null;

  var aBest = {
    score: Number(a.bestScore || 0),
    correctCount: Number(a.bestCorrectCount || 0),
    maxCombo: Number(a.bestMaxCombo || 0),
    timeUsedTotal: Number(a.bestTimeUsedTotal || 999999),
    ts: Number(a.bestUpdatedAt || a.updatedAt || 0)
  };
  var bBest = {
    score: Number(b.bestScore || 0),
    correctCount: Number(b.bestCorrectCount || 0),
    maxCombo: Number(b.bestMaxCombo || 0),
    timeUsedTotal: Number(b.bestTimeUsedTotal || 999999),
    ts: Number(b.bestUpdatedAt || b.updatedAt || 0)
  };

  var useB = shouldUpdateBestRecord(aBest, bBest);
  var picked = Object.assign({}, useB ? b : a);

  // 合併時 attempts 取較大值，避免 quizProgress 與 gameLogs 同一場重複加總。
  picked.attempts = Math.max(Number(a.attempts || 0), Number(b.attempts || 0));

  // last* 取 updatedAt 較新的來源，讓「最近一場」資訊合理。
  var aUpdated = Number(a.updatedAt || a.bestUpdatedAt || 0);
  var bUpdated = Number(b.updatedAt || b.bestUpdatedAt || 0);
  var latest = bUpdated >= aUpdated ? b : a;
  ["lastScore","lastCorrectCount","lastMaxCombo","lastTimeUsedTotal","lastTotalQuestions"].forEach(function(k){
    if (latest[k] !== undefined) picked[k] = latest[k];
  });

  picked.perfect = Number(picked.bestCorrectCount || 0) >= Number(picked.bestTotalQuestions || picked.totalQuestions || 10);
  picked.totalQuestions = Number(picked.bestTotalQuestions || picked.totalQuestions || 10);
  return picked;
}

function mergeProgressRoots(baseRoot, extraRoot){
  var merged = JSON.parse(JSON.stringify(baseRoot || {}));
  Object.keys(extraRoot || {}).forEach(function(gradeKey){
    if (!merged[gradeKey]) merged[gradeKey] = {};
    Object.keys(extraRoot[gradeKey] || {}).forEach(function(subjectKey){
      merged[gradeKey][subjectKey] = pickBetterSubjectProgress(merged[gradeKey][subjectKey], extraRoot[gradeKey][subjectKey]);
    });
  });
  return merged;
}

function filterLogsByCurrentPlayer(logs){
  var out = {};
  Object.keys(logs || {}).forEach(function(key){
    var log = logs[key];
    if (log && log.playerKey === PLAYER.playerKey) out[key] = log;
  });
  return out;
}

function readGameLogsProgressRoot(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(null);  // 不讀舊 gameLogs
}

function readGameLogsAcademyFallback(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(null);
}

function loadQuizAcademyProgressSummary(){
  var progressRootBase = {};

  return readQuizProgressMap()
    .then(function(progressRoot){
      progressRootBase = progressRoot || {};
      // 重要：即使 quizProgress 已有部分新資料，也要合併舊 gameLogs，避免只顯示最新一場。
      return readGameLogsProgressRoot();
    })
    .then(function(logProgressRoot){
      var mergedRoot = logProgressRoot ? mergeProgressRoots(logProgressRoot, progressRootBase) : progressRootBase;
      var mergedAcademy = calculateQuizAcademyProgress(mergedRoot);
      if (hasAcademyActivity(mergedAcademy)) {
        mergedAcademy.rebuiltFrom = logProgressRoot ? "quizProgress+gameLogs" : "quizProgress";
        return mergedAcademy;
      }
      return readStoredQuizAcademyProgress();
    })
    .then(function(stored){
      if (stored && hasAcademyActivity(stored)) return stored;
      return readGradeLeaderboardSelfSummary();
    })
    .then(function(fallback){
      if (fallback && hasAcademyActivity(fallback)) return fallback;
      return calculateQuizAcademyProgress({});
    })
    .catch(function(e){
      console.warn("[Academy] summary load failed:", e.message);
      return readStoredQuizAcademyProgress().then(function(stored){
        if (stored && hasAcademyActivity(stored)) return stored;
        return readGradeLeaderboardSelfSummary().then(function(fallback){
          if (fallback && hasAcademyActivity(fallback)) return fallback;
          return readGameLogsAcademyFallback().then(function(logFallback){
            return logFallback || calculateQuizAcademyProgress({});
          });
        });
      });
    });
}

function updateQuizAcademyProgress(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return loadQuizAcademyProgressSummary().then(function(academy){
    return UniverseQuiz.mock.putAcademy(academy).then(function(){ return academy; });
  });
}


function getAcademyTitle(quizPower){
  quizPower = Number(quizPower || 0);
  if (quizPower >= 6000) return "V學園傳說挑戰者";
  if (quizPower >= 4000) return "知識派對王";
  if (quizPower >= 2500) return "V學園優等生";
  if (quizPower >= 1500) return "氣球智慧使者";
  if (quizPower >= 800) return "派對知識學徒";
  if (quizPower >= 300) return "見習知識魔法師";
  return "V學園新生";
}

function setAcademyProgressBar(gradeKey, completed, total){
  var bar = $("academy-" + gradeKey + "-bar");
  if (!bar) return;
  total = Math.max(1, Number(total || SUBJECT_OPTIONS.length));
  var pct = Math.max(0, Math.min(100, Math.round((Number(completed || 0) / total) * 100)));
  bar.style.width = pct + "%";
}

function renderAcademyProgress(academy){
  academy = academy || {
    quizPower: 0,
    completedSubjects: 0,
    perfectSubjects: 0,
    totalSubjectSlots: getTotalSubjectSlots(),
    totalCorrect: 0,
    gradeProgress: {
      low: getEmptyGradeProgress(),
      middle: getEmptyGradeProgress(),
      high: getEmptyGradeProgress()
    }
  };

  var totalSlots = academy.totalSubjectSlots || getTotalSubjectSlots();
  var quizPower = Number(academy.quizPower || 0);
  if ($("academy-power")) $("academy-power").textContent = quizPower;
  if ($("academy-title")) $("academy-title").textContent = getAcademyTitle(quizPower);
  if ($("academy-completed")) $("academy-completed").textContent = (academy.completedSubjects || 0) + " / " + totalSlots;
  if ($("academy-perfect")) $("academy-perfect").textContent = academy.perfectSubjects || 0;
  if ($("academy-correct")) $("academy-correct").textContent = academy.totalCorrect || 0;

  GRADE_OPTIONS.forEach(function(g){
    var gp = (academy.gradeProgress && academy.gradeProgress[g.key]) || getEmptyGradeProgress();
    var total = gp.totalSubjects || SUBJECT_OPTIONS.length;
    var completed = gp.completedSubjects || 0;
    var el = $("academy-" + g.key);
    if (el) el.textContent = completed + " / " + total + "｜滿分 " + (gp.perfectSubjects || 0);
    setAcademyProgressBar(g.key, completed, total);
  });

  if ($("academy-updated")) {
    $("academy-updated").textContent = academy.updatedAt ? "已更新" : "尚未開始";
  }
}

function refreshAcademyProgressCard(){
  if (!hasConfirmedQuizProfile() || !PLAYER.playerKey) {
    renderAcademyProgress(null);
    return Promise.resolve(null);
  }
  return loadQuizAcademyProgressSummary().then(function(academy){
    renderAcademyProgress(academy);
    return academy;
  }).catch(function(e){
    console.warn("[Academy] refresh failed:", e.message);
    renderAcademyProgress(null);
    return null;
  });
}

function buildAcademyResultLines(before, after){
  after = after || null;
  if (!after) return "V學園進度暫時無法更新。";
  var beforePower = before ? Number(before.quizPower || 0) : 0;
  var afterPower = Number(after.quizPower || 0);
  var delta = afterPower - beforePower;
  var gradeKey = selectedGrade;
  var grade = GRADE_OPTIONS.find(function(g){ return g.key === gradeKey; }) || {name:gradeKey};
  var gp = (after.gradeProgress && after.gradeProgress[gradeKey]) || getEmptyGradeProgress();
  var lines = [];
  lines.push("知識力：" + beforePower + " → " + afterPower + (delta > 0 ? "（+" + delta + "）" : ""));
  lines.push("稱號：" + getAcademyTitle(afterPower));
  lines.push("已挑戰科目：" + (after.completedSubjects || 0) + " / " + (after.totalSubjectSlots || getTotalSubjectSlots()));
  lines.push("滿分科目：" + (after.perfectSubjects || 0));
  lines.push(grade.name + "進度：" + (gp.completedSubjects || 0) + " / " + (gp.totalSubjects || SUBJECT_OPTIONS.length) + "｜滿分 " + (gp.perfectSubjects || 0));
  if (delta <= 0) lines.push("提示：挑戰其他科目或刷新最佳紀錄，也能推進 V學園進度！");
  return lines.join("\n");
}

function compareMainRows(a,b){
  if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
  if ((b.perfectSubjects || 0) !== (a.perfectSubjects || 0)) return (b.perfectSubjects || 0) - (a.perfectSubjects || 0);
  if ((b.completedSubjects || 0) !== (a.completedSubjects || 0)) return (b.completedSubjects || 0) - (a.completedSubjects || 0);
  if ((b.totalCorrect || 0) !== (a.totalCorrect || 0)) return (b.totalCorrect || 0) - (a.totalCorrect || 0);
  if ((a.totalTimeUsed || 999999) !== (b.totalTimeUsed || 999999)) return (a.totalTimeUsed || 999999) - (b.totalTimeUsed || 999999);
  if ((b.totalMaxCombo || 0) !== (a.totalMaxCombo || 0)) return (b.totalMaxCombo || 0) - (a.totalMaxCombo || 0);
  if ((a.totalAttempts || 999999) !== (b.totalAttempts || 999999)) return (a.totalAttempts || 999999) - (b.totalAttempts || 999999);
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}

function compareGradeRows(a,b){
  if ((b.gradeTotalScore || 0) !== (a.gradeTotalScore || 0)) return (b.gradeTotalScore || 0) - (a.gradeTotalScore || 0);
  if ((b.perfectSubjects || 0) !== (a.perfectSubjects || 0)) return (b.perfectSubjects || 0) - (a.perfectSubjects || 0);
  if ((b.totalCorrect || 0) !== (a.totalCorrect || 0)) return (b.totalCorrect || 0) - (a.totalCorrect || 0);
  if ((a.totalTimeUsed || 999999) !== (b.totalTimeUsed || 999999)) return (a.totalTimeUsed || 999999) - (b.totalTimeUsed || 999999);
  if ((b.totalMaxCombo || 0) !== (a.totalMaxCombo || 0)) return (b.totalMaxCombo || 0) - (a.totalMaxCombo || 0);
  if ((a.totalAttempts || 999999) !== (b.totalAttempts || 999999)) return (a.totalAttempts || 999999) - (b.totalAttempts || 999999);
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}

function renderLeaderboard(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  var listEl = $("leaderboard-list");
  listEl.textContent = "載入中...";
  updateLeaderboardTabs();
  return UniverseQuiz.mock.listBoard(leaderboardMode).then(function(rows){
    renderLeaderboardRows(rows, false);
  }).catch(function(e){
    listEl.innerHTML = '<div class="muted">排行榜暫時無法顯示。</div>';
  });
}

function updateLeaderboardTabs(){
  document.querySelectorAll("[data-lb-mode]").forEach(function(btn){
    btn.classList.toggle("active", btn.getAttribute("data-lb-mode") === leaderboardMode);
  });
  var desc = $("leaderboard-desc");
  if (!desc) return;
  if (leaderboardMode === "main") desc.textContent = "🏆 總榜：低 / 中 / 高三個年級總分加總，代表玩家目前的 V學園整體成就。";
  else desc.textContent = "年級榜：該年級各科最佳分數加總，鼓勵挑戰不同科目。";
}

function renderLeaderboardRows(rows){
  var listEl = $("leaderboard-list");
  rows = (rows || []).sort(leaderboardMode === "main" ? compareMainRows : compareGradeRows).slice(0, 30);

  if (!rows.length) {
    listEl.innerHTML = '<div class="muted">目前還沒有排行榜紀錄。</div>';
    return;
  }

  listEl.innerHTML = "";
  rows.forEach(function(r, idx){
    var row = document.createElement("div");
    row.className = "lb-row" + (r.playerKey === PLAYER.playerKey ? " mine" : "");
    var src = resolveAvatarSrc(r.avatarSrc || getAvatarUrl(r.displayAvatarKey || r.avatarKey || r.baseAvatarKey));

    if (leaderboardMode === "main") {
      row.innerHTML =
        '<div class="lb-rank">' + (idx + 1) + '</div>' +
        '<img src="' + escapeHtml(src) + '" alt="">' +
        '<div class="lb-main"><strong>' + escapeHtml(r.name || r.id || "玩家") + '</strong>' +
        (r.equippedTitleName ? '<span class="lb-title-snapshot">🏅 ' + escapeHtml(r.equippedTitleName) + '</span>' : '') +
        '<span><b>總成就</b>｜' + (r.completedSubjects || 0) + '科 / 滿分' + (r.perfectSubjects || 0) + '科｜' + escapeHtml(r.gradeSummaryText || "尚未完成挑戰") + '</span></div>' +
        '<div class="lb-score"><small>總分</small>' + (r.totalScore || 0) + '</div>';
    } else {
      row.innerHTML =
        '<div class="lb-rank">' + (idx + 1) + '</div>' +
        '<img src="' + escapeHtml(src) + '" alt="">' +
        '<div class="lb-main"><strong>' + escapeHtml(r.name || r.id || "玩家") + '</strong>' +
        (r.equippedTitleName ? '<span class="lb-title-snapshot">🏅 ' + escapeHtml(r.equippedTitleName) + '</span>' : '') +
        '<span><b>年級累積</b>｜' + (r.completedSubjects || 0) + '科 / 滿分' + (r.perfectSubjects || 0) + '科｜' + escapeHtml((r.subjectNames || []).join(" / ") || r.subjectSummaryText || "-") + '｜' + formatSeconds(r.totalTimeUsed || 0) + '</span></div>' +
        '<div class="lb-score"><small>年級分</small>' + (r.gradeTotalScore || 0) + '</div>';
    }
    listEl.appendChild(row);
  });
}

function formatSeconds(sec){
  sec = Math.max(0, Number(sec || 0));
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  if (!m) return s + "秒";
  return m + "分" + String(s).padStart(2, "0") + "秒";
}



// ── v0.2.23 問答遊戲內建後台：題目覆寫 + CSV 匯出 ──
var ADMIN_PW_KEY = "vquiz_admin_pw";
var adminTapCount = 0;
var adminTapTimer = null;
var adminLogs = [];
var adminSortMode = "time_desc";

function getAdminPassword(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return null;
}

function openAdminPasswordModal(){
  var modal = $("admin-pwd-modal");
  if (!modal) return;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  if ($("admin-pwd-input")) $("admin-pwd-input").value = "";
  if ($("admin-pwd-error")) $("admin-pwd-error").classList.add("hidden");
  setTimeout(function(){ if ($("admin-pwd-input")) $("admin-pwd-input").focus(); }, 40);
}

function closeAdminPasswordModal(){
  var modal = $("admin-pwd-modal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

function tryAdminLogin(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return;
}

function initAdminEntrance(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return;  // 管理後台停用（一般玩家入口不混入管理功能）
}

function formatAdminDate(ts){
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("zh-TW", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
  } catch(e) { return String(ts); }
}

function isTodayTs(ts){
  if (!ts) return false;
  var d = new Date(ts);
  var n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function getGradeName(key){
  var g = GRADE_OPTIONS.find(function(item){ return item.key === key; });
  return g ? g.name : (key || "—");
}

function getSubjectName(key){
  var s = SUBJECT_OPTIONS.find(function(item){ return item.key === key; });
  return s ? s.name : (key || "—");
}

function renderAdminQuestionStats(){
  var total = QUESTIONS.length;
  var enabled = 0;
  var disabled = 0;
  var review = 0;
  var groups = {};

  QUESTIONS.forEach(function(q){
    var gKey = q.gradeBand || "unknown";
    var sKey = q.subject || "unknown";
    var key = gKey + "__" + sKey;
    if (!groups[key]) groups[key] = { gradeBand:gKey, subject:sKey, total:0, enabled:0, disabled:0, review:0 };
    groups[key].total += 1;
    var ok = isQuestionEnabled(q);
    if (ok) { enabled += 1; groups[key].enabled += 1; }
    else { disabled += 1; groups[key].disabled += 1; }
    var quality = String(q.quality || "ok").toLowerCase();
    if (quality !== "ok" || q.reviewNote) { review += 1; groups[key].review += 1; }
  });

  if ($("adm-q-total")) $("adm-q-total").textContent = total;
  if ($("adm-q-enabled")) $("adm-q-enabled").textContent = enabled;
  if ($("adm-q-disabled")) $("adm-q-disabled").textContent = disabled;
  if ($("adm-q-review")) $("adm-q-review").textContent = review;
  if ($("adm-question-summary")) $("adm-question-summary").textContent = "管理者用統計，不顯示給玩家｜數學動態模板 " + MATH_QUESTION_TEMPLATES.length + " 組";

  var wrap = $("adm-question-groups");
  if (!wrap) return;
  var ordered = [];
  GRADE_OPTIONS.forEach(function(g){
    SUBJECT_OPTIONS.forEach(function(s){
      var item = groups[g.key + "__" + s.key] || { gradeBand:g.key, subject:s.key, total:0, enabled:0, disabled:0, review:0 };
      ordered.push(item);
    });
  });
  wrap.innerHTML = "";
  ordered.forEach(function(item){
    var row = document.createElement("div");
    row.className = "admin-group-row";
    row.innerHTML = '<div>' + escapeHtml(getGradeName(item.gradeBand) + "・" + getSubjectName(item.subject)) +
      '<small>啟用 ' + item.enabled + ' / 總題 ' + item.total + '</small></div>' +
      '<div>' + (item.disabled ? '停用 ' + item.disabled : 'OK') + '</div>';
    wrap.appendChild(row);
  });
}

function normalizeAdminLog(child){
  var r = child && child.val ? child.val() : child;
  r = r || {};
  if (child && child.key && !r._key) r._key = child.key;
  return r;
}

function loadAdminData(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.resolve(null);
}

function renderAdminStats(){
  var identities = {};
  var topScore = 0;
  var today = 0;
  adminLogs.forEach(function(r){
    if (r.playerKey) identities[r.playerKey] = true;
    topScore = Math.max(topScore, Number(r.score || 0));
    if (isTodayTs(r.ts || Date.parse(r.date || ""))) today += 1;
  });
  if ($("adm-total")) $("adm-total").textContent = adminLogs.length;
  if ($("adm-identities")) $("adm-identities").textContent = Object.keys(identities).length;
  if ($("adm-topscore")) $("adm-topscore").textContent = topScore;
  if ($("adm-today")) $("adm-today").textContent = today;
  if ($("adm-log-count")) $("adm-log-count").textContent = "最近 " + adminLogs.length + " 筆";
}

function renderAdminHealth(firebaseOk){
  if ($("adm-health-version")) $("adm-health-version").textContent = QUIZ_VERSION;
  if ($("adm-health-firebase")) {
    $("adm-health-firebase").textContent = firebaseOk ? "已連線" : "未連線";
    $("adm-health-firebase").className = firebaseOk ? "health-ok" : "health-warn";
  }
  var overrideCount = QUESTION_OVERRIDES ? Object.keys(QUESTION_OVERRIDES).length : 0;
  if ($("adm-health-overrides")) {
    $("adm-health-overrides").textContent = overrideCount ? (overrideCount + " 筆覆寫") : "無覆寫";
    $("adm-health-overrides").className = overrideCount ? "health-warn" : "health-ok";
  }
  if ($("adm-health-templates")) {
    $("adm-health-templates").textContent = MATH_QUESTION_TEMPLATES.length + " 組";
    $("adm-health-templates").className = "health-ok";
  }
  if ($("adm-health-index")) {
    $("adm-health-index").textContent = "建議補上";
    $("adm-health-index").className = "health-warn";
  }
}

function getSortedAdminLogs(){
  var rows = adminLogs.slice();
  rows.sort(function(a,b){
    if (adminSortMode === "score_desc") return Number(b.score || 0) - Number(a.score || 0) || Number(b.ts || 0) - Number(a.ts || 0);
    if (adminSortMode === "time_asc") return Number(a.ts || 0) - Number(b.ts || 0);
    return Number(b.ts || 0) - Number(a.ts || 0);
  });
  return rows;
}

function renderAdminLogs(){
  var list = $("adm-log-list");
  if (!list) return;
  var rows = getSortedAdminLogs().slice(0, 80);
  if (!rows.length) {
    list.innerHTML = '<div class="muted">目前還沒有問答紀錄。</div>';
    return;
  }
  list.innerHTML = "";
  rows.forEach(function(r){
    var row = document.createElement("div");
    row.className = "admin-log-row";
    var avatar = resolveAvatarSrc(r.avatarSrc || getAvatarUrl(r.displayAvatarKey || r.avatarKey || r.baseAvatarKey));
    var ts = r.ts || Date.parse(r.date || "") || 0;
    var identity = getFriendlyIdentityLabel(r.id || r.name || "玩家", r.baseAvatarKey || "boy1");
    var meta = [
      formatAdminDate(ts),
      r.gradeBandName || getGradeName(r.gradeBand),
      r.subjectName || getSubjectName(r.subject),
      '答對 ' + (r.correctCount || 0) + ' / ' + (r.totalQuestions || 10),
      'Combo ' + (r.maxCombo || 0),
      formatSeconds(r.timeUsedTotal || 0)
    ].join('｜');
    row.innerHTML = '<img src="' + escapeHtml(avatar) + '" alt="">' +
      '<div class="admin-log-main"><strong>' + escapeHtml(identity) + '</strong><span>' + escapeHtml(meta) + '</span></div>' +
      '<div class="admin-log-score"><small>分數</small>' + Number(r.score || 0) + '</div>';
    list.appendChild(row);
  });
}

function exportAdminLogs(){
  if (!adminLogs.length) { toast("目前沒有資料可匯出"); return; }
  var blob = new Blob([JSON.stringify(adminLogs, null, 2)], { type:"application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "quiz_gamelogs_" + new Date().toISOString().slice(0,10) + ".json";
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  toast("已匯出最近問答紀錄 JSON");
}


function csvCell(value){
  var s = String(value == null ? "" : value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function downloadTextFile(filename, text, mime){
  var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
}

function exportAdminLogsCsv(){
  if (!adminLogs.length) { toast("目前沒有資料可匯出"); return; }
  var headers = ["時間","玩家ID","遊戲身份","身份頭像","顯示頭像","年級","科目","分數","答對題數","總題數","最高連擊","總用時秒數","是否滿分","版本","playerKey"];
  var lines = [headers.map(csvCell).join(",")];
  getSortedAdminLogs().forEach(function(r){
    var ts = r.ts || Date.parse(r.date || "") || 0;
    var total = Number(r.totalQuestions || 10);
    var correct = Number(r.correctCount || 0);
    var row = [
      ts ? new Date(ts).toLocaleString("zh-TW") : (r.date || ""),
      r.id || r.name || "",
      getFriendlyIdentityLabel(r.id || r.name || "玩家", r.baseAvatarKey || "boy1"),
      getAvatarName(r.baseAvatarKey || ""),
      getAvatarName(r.displayAvatarKey || r.avatarKey || ""),
      r.gradeBandName || getGradeName(r.gradeBand),
      r.subjectName || getSubjectName(r.subject),
      r.score || 0,
      correct,
      total,
      r.maxCombo || 0,
      r.timeUsedTotal || 0,
      correct >= total ? "是" : "否",
      r.version || "",
      r.playerKey || ""
    ];
    lines.push(row.map(csvCell).join(","));
  });
  downloadTextFile("quiz_gamelogs_" + new Date().toISOString().slice(0,10) + ".csv", "\ufeff" + lines.join("\n"), "text/csv;charset=utf-8");
  toast("已匯出最近問答紀錄 CSV");
}

function exportAdminQuestionsCsv(){
  if (!QUESTIONS.length) { toast("題庫尚未載入"); return; }
  var headers = ["questionId","年級","科目","題目","正確答案","解析","disabled","quality","reviewNote","source","overrideApplied"];
  var lines = [headers.map(csvCell).join(",")];
  QUESTIONS.forEach(function(q){
    var answer = (q.choices && q.choices[q.answerIndex]) || "";
    var row = [
      q.id || "",
      q.gradeBandName || getGradeName(q.gradeBand),
      q.subjectName || getSubjectName(q.subject),
      q.question || "",
      answer,
      q.explanation || "",
      q.disabled === true ? "true" : "false",
      q.quality || "ok",
      q.reviewNote || "",
      q.source || "manual",
      q.overrideApplied ? "true" : "false"
    ];
    lines.push(row.map(csvCell).join(","));
  });
  downloadTextFile("quiz_questions_" + new Date().toISOString().slice(0,10) + ".csv", "\ufeff" + lines.join("\n"), "text/csv;charset=utf-8");
  toast("已匯出題目清單 CSV");
}

function populateAdminQuestionFilters(){
  var subjectSel = $("adm-q-subject-filter");
  if (subjectSel && !populateAdminQuestionFilters._done) {
    SUBJECT_OPTIONS.forEach(function(s){
      var opt = document.createElement("option");
      opt.value = s.key;
      opt.textContent = s.name;
      subjectSel.appendChild(opt);
    });
    populateAdminQuestionFilters._done = true;
  }
}

function getAdminFilteredQuestions(){
  var g = ($("adm-q-grade-filter") && $("adm-q-grade-filter").value) || "all";
  var s = ($("adm-q-subject-filter") && $("adm-q-subject-filter").value) || "all";
  var kw = (($("adm-q-search") && $("adm-q-search").value) || "").trim().toLowerCase();
  var onlyDisabled = !!($("adm-q-only-disabled") && $("adm-q-only-disabled").checked);
  return QUESTIONS.filter(function(q){
    if (g !== "all" && q.gradeBand !== g) return false;
    if (s !== "all" && q.subject !== s) return false;
    if (onlyDisabled && isQuestionEnabled(q)) return false;
    if (kw) {
      var text = [q.id, q.question, q.explanation, (q.choices || []).join(" "), q.reviewNote].join(" ").toLowerCase();
      if (text.indexOf(kw) < 0) return false;
    }
    return true;
  });
}

function renderAdminQuestionManagement(){
  var list = $("adm-q-manage-list");
  var countEl = $("adm-q-manage-count");
  if (!list) return;
  var rows = getAdminFilteredQuestions();
  if (countEl) countEl.textContent = "符合條件 " + rows.length + " 題，畫面最多顯示前 80 題。";
  rows = rows.slice(0, 80);
  if (!rows.length) {
    list.innerHTML = '<div class="muted">沒有符合條件的題目。</div>';
    return;
  }
  list.innerHTML = "";
  rows.forEach(function(q){
    var enabled = isQuestionEnabled(q);
    var answer = (q.choices && q.choices[q.answerIndex]) || "—";
    var row = document.createElement("div");
    row.className = "admin-question-row" + (enabled ? "" : " disabled");
    row.innerHTML =
      '<div class="admin-question-row-head"><strong>' + escapeHtml(q.question || "") + '</strong><span>' + escapeHtml(q.id || "") + '</span></div>' +
      '<div class="admin-question-meta">' + escapeHtml((q.gradeBandName || getGradeName(q.gradeBand)) + '｜' + (q.subjectName || getSubjectName(q.subject)) + '｜難度 ' + (q.difficulty || '-')) +
      '　<span class="admin-status-badge ' + (enabled ? '' : 'off') + '">' + (enabled ? '啟用中' : '已停用') + '</span></div>' +
      '<div class="admin-question-answer">正解：' + escapeHtml(answer) + '</div>' +
      '<div class="admin-question-meta">解析：' + escapeHtml(q.explanation || '—') + '</div>' +
      '<div class="admin-question-note-row"><input id="adm-note-' + escapeHtml(q.id) + '" value="' + escapeHtml(q.reviewNote || '') + '" placeholder="管理備註，例如：題目太牽強，暫停出題">' +
      '<div class="admin-question-actions">' +
      '<button class="btn ghost tiny" data-admin-q-note="' + escapeHtml(q.id) + '" type="button">儲存備註</button>' +
      (enabled ? '<button class="btn secondary tiny" data-admin-q-disable="' + escapeHtml(q.id) + '" type="button">停用題目</button>' : '<button class="btn primary tiny" data-admin-q-enable="' + escapeHtml(q.id) + '" type="button">恢復題目</button>') +
      '</div></div>';
    list.appendChild(row);
  });
}

function formatQuestionOverrideWriteError(e){
  var msg = e && (e.message || e.code || String(e));
  var lower = String(msg || "").toLowerCase();
  if (lower.indexOf("permission") >= 0 || lower.indexOf("denied") >= 0 || lower.indexOf("permission_denied") >= 0) {
    return "題目狀態更新失敗：Firebase rules 尚未開放 quizQuestionOverrides 寫入。";
  }
  return "題目狀態更新失敗：" + (msg || "請稍後再試");
}

function updateQuestionOverride(questionId, patch){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return Promise.reject(new Error("管理後台停用：宇宙版不能修改題目"));
}

function setAdminQuestionDisabled(questionId, disabled){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return;
}

function saveAdminQuestionNote(questionId){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return;
}

function changeAdminPassword(){
  // [Universe 換殼] 原版玩家系統邏輯已改由遊戲宇宙換殼層處理（見 universe-shell.js）
  return;
}

function bindAdminEvents(){
  if (bindAdminEvents._bound) return;
  bindAdminEvents._bound = true;
  initAdminEntrance();
  if ($("btn-admin-pwd-ok")) $("btn-admin-pwd-ok").addEventListener("click", tryAdminLogin);
  if ($("btn-admin-pwd-cancel")) $("btn-admin-pwd-cancel").addEventListener("click", closeAdminPasswordModal);
  if ($("admin-pwd-input")) $("admin-pwd-input").addEventListener("keydown", function(e){ if (e.key === "Enter") tryAdminLogin(); });
  if ($("admin-pwd-modal")) $("admin-pwd-modal").addEventListener("click", function(e){ if (e.target === $("admin-pwd-modal")) closeAdminPasswordModal(); });
  if ($("btn-admin-out")) $("btn-admin-out").addEventListener("click", function(){ showScreen("screen-title"); });
  if ($("btn-admin-refresh")) $("btn-admin-refresh").addEventListener("click", loadAdminData);
  if ($("btn-admin-export")) $("btn-admin-export").addEventListener("click", exportAdminLogs);
  if ($("btn-admin-export-csv")) $("btn-admin-export-csv").addEventListener("click", exportAdminLogsCsv);
  if ($("btn-admin-q-export-csv")) $("btn-admin-q-export-csv").addEventListener("click", exportAdminQuestionsCsv);
  if ($("btn-admin-pw")) $("btn-admin-pw").addEventListener("click", changeAdminPassword);
  ["adm-q-grade-filter", "adm-q-subject-filter", "adm-q-search", "adm-q-only-disabled"].forEach(function(id){
    var el = $(id);
    if (!el) return;
    el.addEventListener(id === "adm-q-search" ? "input" : "change", renderAdminQuestionManagement);
  });
  var qList = $("adm-q-manage-list");
  if (qList) qList.addEventListener("click", function(e){
    var disableBtn = e.target.closest("[data-admin-q-disable]");
    var enableBtn = e.target.closest("[data-admin-q-enable]");
    var noteBtn = e.target.closest("[data-admin-q-note]");
    if (disableBtn) setAdminQuestionDisabled(disableBtn.getAttribute("data-admin-q-disable"), true);
    if (enableBtn) setAdminQuestionDisabled(enableBtn.getAttribute("data-admin-q-enable"), false);
    if (noteBtn) saveAdminQuestionNote(noteBtn.getAttribute("data-admin-q-note"));
  });
  document.querySelectorAll("[data-admin-sort]").forEach(function(btn){
    btn.addEventListener("click", function(){
      adminSortMode = btn.getAttribute("data-admin-sort") || "time_desc";
      document.querySelectorAll("[data-admin-sort]").forEach(function(b){ b.classList.toggle("active", b === btn); });
      renderAdminLogs();
    });
  });
}

function bindMusicEvents(){
  if (bindMusicEvents._bound) return;
  bindMusicEvents._bound = true;
  if ($("btn-music-title")) $("btn-music-title").addEventListener("click", openMusic);
  if ($("mc-prev")) $("mc-prev").addEventListener("click", function(){ if (SONGS.length) loadSong(musicIndex - 1, musicPlaying); });
  if ($("mc-next")) $("mc-next").addEventListener("click", function(){ if (SONGS.length) loadSong(musicIndex + 1, musicPlaying); });
  if ($("mc-play")) $("mc-play").addEventListener("click", togglePlay);
  if ($("mc-list")) $("mc-list").addEventListener("click", openMusic);
  if ($("mp-prev2")) $("mp-prev2").addEventListener("click", function(){ if (SONGS.length) loadSong(musicIndex - 1, musicPlaying); });
  if ($("mp-next2")) $("mp-next2").addEventListener("click", function(){ if (SONGS.length) loadSong(musicIndex + 1, musicPlaying); });
  if ($("mp-play2")) $("mp-play2").addEventListener("click", togglePlay);
  if ($("mp-close")) $("mp-close").addEventListener("click", closeMusic);
  if ($("music-modal")) $("music-modal").addEventListener("click", function(e){ if (e.target === $("music-modal")) closeMusic(); });
  if ($("mp-prog")) $("mp-prog").addEventListener("click", function(e){
    var r = $("mp-prog").getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    var dur = musicAudio.duration || (SONGS[musicIndex] && SONGS[musicIndex].duration) || 120;
    musicAudio.currentTime = pct * dur;
  });
  if ($("mp-vol")) $("mp-vol").addEventListener("input", function(e){ musicAudio.volume = Number(e.target.value || 10) / 100; });
  if ($("mp-shuf")) $("mp-shuf").addEventListener("click", function(){
    musicShuffle = !musicShuffle;
    $("mp-shuf").classList.toggle("act", musicShuffle);
    toast(musicShuffle ? "🔀 隨機播放開啟" : "🔀 隨機播放關閉");
  });
  if ($("mp-loop")) $("mp-loop").addEventListener("click", function(){
    var modes = ["all", "one", "none"];
    var labels = ["全部循環", "單曲循環", "不循環"];
    var icons = ["🔁", "🔂", "➡"];
    musicLoop = modes[(modes.indexOf(musicLoop) + 1) % modes.length];
    var i = modes.indexOf(musicLoop);
    $("mp-loop").textContent = icons[i];
    $("mp-badge").textContent = labels[i];
    $("mp-loop").classList.toggle("act", musicLoop !== "none");
    toast("循環模式：" + labels[i]);
  });
  musicAudio.addEventListener("ended", function(){
    if (musicLoop === "one") {
      musicAudio.currentTime = 0;
      playSong();
    } else if (musicLoop === "all" || musicShuffle) {
      var next = musicShuffle ? Math.floor(Math.random() * Math.max(1, SONGS.length)) : musicIndex + 1;
      loadSong(next, true);
    } else {
      pauseSong();
    }
  });
}

function bindEvents(){
  if ($("fs-btn")) $("fs-btn").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", updateFullscreenButtonLabel);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButtonLabel);
  updateFullscreenButtonLabel();
  if ($("profile-data-toggle")) $("profile-data-toggle").addEventListener("click", toggleProfileData);
  $("btn-go-profile").addEventListener("click", function(){ showScreen("screen-profile"); });
  if ($("btn-daily-challenge")) $("btn-daily-challenge").addEventListener("click", openDailyChallenge);

  if ($("top-player-card")) {
    $("top-player-card").addEventListener("click", function(){ showScreen("screen-profile"); });
    $("top-player-card").addEventListener("keydown", function(e){
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showScreen("screen-profile");
      }
    });
  }
  $("btn-go-setup").addEventListener("click", function(){
    if (!hasConfirmedQuizProfile()) {
      toast("首次遊玩請先確認玩家身份。");
      showScreen("screen-profile");
      return;
    }
    showScreen("screen-setup");
  });
  $("btn-go-leaderboard").addEventListener("click", function(){ showScreen("screen-leaderboard"); });
  if ($("btn-game-menu")) $("btn-game-menu").addEventListener("click", function(){
    window.top.location.href = GAME_MENU_URL;
  });
  $("btn-profile-back").addEventListener("click", function(){ showScreen("screen-title"); });
  $("btn-setup-back").addEventListener("click", function(){ showScreen("screen-title"); });
  $("btn-leaderboard-back").addEventListener("click", function(){ showScreen("screen-title"); });
  $("btn-result-home").addEventListener("click", function(){ showScreen("screen-title"); });
  $("btn-result-leaderboard").addEventListener("click", function(){ showScreen("screen-leaderboard"); });
  $("btn-refresh-leaderboard").addEventListener("click", renderLeaderboard);
  document.querySelectorAll("[data-lb-mode]").forEach(function(btn){
    btn.addEventListener("click", function(){
      leaderboardMode = btn.getAttribute("data-lb-mode") || "main";
      renderLeaderboard();
    });
  });
  if ($("btn-sound-toggle")) {
    updateSoundButton();
    $("btn-sound-toggle").addEventListener("click", function(){
      soundEnabled = !soundEnabled;
      localStorage.setItem("vquiz_soundEnabled", soundEnabled ? "true" : "false");
      if (soundEnabled) { ensureAudioContext(); beep(660, 0.10, "sine", 0.09); }
      updateSoundButton();
    });
  }
  bindMusicEvents();
  bindAdminEvents();
  if ($("btn-pause-quiz")) $("btn-pause-quiz").addEventListener("click", pauseQuiz);
  if ($("btn-resume-quiz")) $("btn-resume-quiz").addEventListener("click", resumeQuiz);
  if ($("btn-pause-quit")) $("btn-pause-quit").addEventListener("click", function(){
    if (confirm("確定要離開本次挑戰嗎？本局不會寫入紀錄。")) {
      quizState.paused = false;
      hidePauseOverlay();
      stopQuizTimer();
      stopQuestionTimer();
      showScreen("screen-title");
    }
  });
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && quizState.active && document.querySelector("#screen-quiz.active")) {
      if (quizState.paused) resumeQuiz();
      else pauseQuiz();
    }
  });
  $("btn-start-quiz").addEventListener("click", startQuiz);
  $("btn-play-again").addEventListener("click", function(){ showScreen("screen-setup"); });
  $("btn-quit-quiz").addEventListener("click", function(){
    if (confirm("確定要離開本次挑戰嗎？本局不會寫入紀錄。")) {
      quizState.paused = false;
      hidePauseOverlay();
      stopQuizTimer();
      stopQuestionTimer();
      showScreen("screen-title");
    }
  });

  $("btn-next-question").addEventListener("click", nextQuestion);

  $("btn-pick-base").addEventListener("click", function(){ buildAvatarPicker("base"); });
  $("btn-pick-display").addEventListener("click", function(){
    if (!PLAYER.playerKey) {
      toast("請先確認玩家身份。");
      return;
    }
    loadUnlockedAvatars().then(function(){
      validateDisplayAvatarForCurrentIdentity();
      buildAvatarPicker("display");
    });
  });
  $("btn-close-picker").addEventListener("click", function(){ $("avatar-picker").classList.add("hidden"); });
  if ($("btn-profile-avatar-collection")) $("btn-profile-avatar-collection").addEventListener("click", function(){
    if (!PLAYER.playerKey) {
      toast("請先確認玩家身份。");
      return;
    }
    loadUnlockedAvatars().then(function(){
      validateDisplayAvatarForCurrentIdentity();
      buildAvatarPicker("display");
    });
  });
  var titleCollectionBtn = $("btn-title-collection") || $("btn-profile-title-collection");
  if (titleCollectionBtn) titleCollectionBtn.addEventListener("click", openProfileTitleCollection);
  if ($("btn-close-title-collection")) $("btn-close-title-collection").addEventListener("click", function(){ closeProfileTitleCollection(); scrollToProfileDataToggle(); });

  $("player-id-input").addEventListener("input", function(){
    PLAYER.id = normalizePlayerId(this.value);
    PLAYER.name = PLAYER.id;
    PLAYER.playerKey = makePlayerKey(PLAYER.id, PLAYER.baseAvatarKey);
    PLAYER_QUIZ_TITLES = {};
    PLAYER_QUIZ_BADGES = {};
    PLAYER_EQUIPPED_TITLE = null;
    updatePlayerUI();
  });

  $("btn-save-profile").addEventListener("click", function(){
    PLAYER.id = normalizePlayerId($("player-id-input").value);
    PLAYER.name = PLAYER.id;
    PLAYER.playerKey = makePlayerKey(PLAYER.id, PLAYER.baseAvatarKey);
    savePlayerLocal();
    $("avatar-picker").classList.add("hidden");
    closeProfileTitleCollection();
    loadAvatarCatalog().then(loadUnlockedAvatars).then(function(){
      validateDisplayAvatarForCurrentIdentity();
      savePlayerLocal();
      updatePlayerUI();
      return ensurePlayerProfile();
    }).then(function(){
      return loadWalletBalance();
    }).then(function(){
      return loadQuizTitleData();
    }).then(function(){
      return refreshAcademyProgressCard();
    }).then(function(){
      toast("玩家身份已確認！\\n" + getFriendlyIdentityLabel(PLAYER.id, PLAYER.baseAvatarKey));
      showScreen("screen-setup");
    });
  });
}

function init(){
  bindEvents();
  var alreadyConfirmed = hasConfirmedQuizProfile();
  loadPlayerLocal();
  buildSetupOptions();
  updatePlayerUI();
  refreshBrandHostVisuals();
  loadSongs();

  // v0.1.1：獨立測試頁首次進入時，強制先確認玩家身份。
  // 未來統一遊戲入口完成後，可以改由入口傳入已確認的 profile。
  showScreen("screen-title");  // [Universe 換殼] 身份由遊戲宇宙提供，不在遊戲內建立身份

  ensureFirebaseReady()
    .then(loadAvatarCatalog)
    .then(loadUnlockedAvatars)
    .then(function(){
      validateDisplayAvatarForCurrentIdentity();
      updatePlayerUI();
      if (alreadyConfirmed) {
        return ensurePlayerProfile().then(function(){
          return loadWalletBalance();
        }).then(function(){
          return loadQuizTitleData();
        }).then(refreshAcademyProgressCard);
      }
      renderAcademyProgress(null);
      loadWalletBalance();
      loadQuizTitleData();
      return null;
    })
    .catch(function(e){ console.warn("[Init] Firebase/profile init skipped:", e.message); });

  loadQuestions();
}

document.addEventListener("DOMContentLoaded", function(){ UniverseQuiz.boot(init); });  // [Universe 換殼] 先讀遊戲宇宙玩家，再啟動原版流程

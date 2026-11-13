/**
 * 四款遊戲的正式成績規則（伺服器端）
 *
 * 每款遊戲提供：
 *   schema         scoreData 欄位格式（多餘欄位一律拒絕）
 *   check(data, t) 實際內容檢查 → { status, reasons, boards, challenge }
 *                   status：accepted（合理）／pending_review（可疑，需管理員確認）／rejected（明確無效）
 *   boards         這筆成績要參加的排行榜（每位玩家每個榜只保留個人最佳）
 *
 * 計分公式一律沿用各遊戲原版（只用來檢查「可不可能」，不重新計分、不改分數）：
 *   方塊：每次消行 round(100×n²×level×倍率×(1+(連消−1)×0.5))、硬降每格 2 分、全消 round(500×level×倍率)；
 *         level = floor(lines / 每級行數) + 1（easy 8／normal 10／hard 12）
 *   節奏：Perfect 300、Good 150（Hold 頭 80、尾 Perfect 300／Good 120）＋ 每次 floor(combo/10)×5；
 *         準確率 round((P＋G×0.5)／(P＋G＋M)×100)；等級 S≥95、A+≥88、A≥80、B≥68、C≥55、D≥40、其餘 E
 *   問答：每題 10 題中答對 100＋min((連對−1)×10, 50)；每題 15 秒
 *   派對島：由派對島自己計算大陸總分（五大分項各有上限＋連鎖撞擊加分），伺服器只檢查一致性與上限
 *
 * 純前端遊戲的分數無法只靠 client 回報就完全信任；這裡做的是「合理性檢查」：
 * 明顯不可能 → rejected；可能但可疑（太快、超出已知範圍、版本或歌曲未收錄）→ pending_review。
 */
import { RHYTHM_SONGS } from "./rhythm-songs.js";
import {
  QUIZ_GRADE_KEYS, QUIZ_SUBJECT_KEYS, QUIZ_QUESTIONS_PER_GAME, QUIZ_QUESTION_TIME_LIMIT_SEC,
  getQuizDailyChallengeForDate, isRecordMatchingDailyChallenge,
} from "./quiz-rules.js";

const DIFFS = ["easy", "normal", "hard"];
const int = (min, max) => ({ type: "integer", required: true, min, max });

/* ── 方塊 ── */
const TETRIS_DIFF = { easy: { lperlv: 8, mult: 1.0 }, normal: { lperlv: 10, mult: 1.5 }, hard: { lperlv: 12, mult: 2.0 } };
const TETRIS_DAILY = [
  { challengeKey: "complete_game", conditionType: "complete_game" },
  { challengeKey: "score_500", conditionType: "score", target: 500 },
  { challengeKey: "clear_5_lines", conditionType: "lines", target: 5 },
  { challengeKey: "reach_level_2", conditionType: "level", target: 2 },
  { challengeKey: "combo_2", conditionType: "maxCombo", target: 2 },
];
/** 原版 getTetrisDailyChallengeForDate（yyyymmdd 最後兩碼 % 5） */
export function getTetrisDailyChallengeForDate(yyyymmdd) {
  const n = Number(String(yyyymmdd || "").slice(-2)) || 1;
  return TETRIS_DAILY[n % TETRIS_DAILY.length] || TETRIS_DAILY[0];
}
/** 原版 isTetrisDailyChallengeCompleted */
export function isTetrisDailyChallengeCompleted(challenge, result) {
  challenge = challenge || {}; result = result || {};
  const scoreVal = Number(result.score || 0), linesVal = Number(result.lines || 0);
  const levelVal = Number(result.level || 0), comboVal = Number(result.maxCombo || result.peakCombo || 0);
  if (challenge.conditionType === "complete_game") return true;
  if (challenge.conditionType === "score") return scoreVal >= Number(challenge.target || 0);
  if (challenge.conditionType === "lines") return linesVal >= Number(challenge.target || 0);
  if (challenge.conditionType === "level") return levelVal >= Number(challenge.target || 0);
  if (challenge.conditionType === "maxCombo") return comboVal >= Number(challenge.target || 0);
  return false;
}

function tetrisCheck(d, t) {
  const reasons = [];
  const cfg = TETRIS_DIFF[d.difficulty];
  const expectLevel = Math.floor(d.lines / cfg.lperlv) + 1;
  if (d.level !== expectLevel) return { status: "rejected", reasons: ["tetris_level_mismatch"] };
  if (d.peakCombo > d.lines) return { status: "rejected", reasons: ["tetris_combo_exceeds_lines"] };
  // 上限：每行最多 400×level×倍率×連消倍數（四行消）＋全消＋硬降（每塊最多 20 格×2）
  const pieces = Math.ceil((d.lines * 10 + 200) / 4) + 1;
  const comboMul = 1 + Math.max(0, d.peakCombo - 1) * 0.5;
  const lineMax = d.lines * 400 * d.level * cfg.mult * comboMul;
  const allClearMax = Math.floor(d.lines / 1) * 500 * d.level * cfg.mult;
  const upper = Math.ceil(lineMax + allClearMax + pieces * 40);
  if (d.score > upper) return { status: "rejected", reasons: ["tetris_score_impossible"] };
  if (d.lines > 0 && d.score < 100 * cfg.mult) return { status: "rejected", reasons: ["tetris_score_too_low"] };
  // 時間合理性（伺服器場次時間）：每分鐘超過 60 行、或消行但不到 3 秒 → 待審核
  const minutes = t.serverDurationMs / 60000;
  if (d.lines > 0 && d.lines / Math.max(minutes, 1 / 60) > 60) reasons.push("tetris_too_fast");
  if (d.score > 0 && t.serverDurationMs < 3000) reasons.push("tetris_too_short");
  const challenge = getTetrisDailyChallengeForDate(t.yyyymmdd);
  return {
    status: reasons.length ? "pending_review" : "accepted", reasons,
    boards: [{ boardId: "total", score: d.score, extra: { lines: d.lines, level: d.level, peakCombo: d.peakCombo, difficulty: d.difficulty } }],
    challenge: { eligible: true, key: challenge.challengeKey, done: isTetrisDailyChallengeCompleted(challenge, d) },
  };
}

/* ── 節奏 ── */
export function rhythmGradeFor(acc) {
  if (acc >= 95) return "S"; if (acc >= 88) return "A+"; if (acc >= 80) return "A";
  if (acc >= 68) return "B"; if (acc >= 55) return "C"; if (acc >= 40) return "D"; return "E";
}
export function rhythmBoardId(songId, difficulty) { return `${songId}--${difficulty}`; }

function rhythmCheck(d, t) {
  const reasons = [];
  const tot = d.perfect + d.good + d.miss;
  const acc = tot === 0 ? 100 : Math.round((d.perfect + d.good * 0.5) / tot * 100);
  if (d.accuracy !== acc) return { status: "rejected", reasons: ["rhythm_accuracy_mismatch"] };
  if (d.grade !== rhythmGradeFor(acc)) return { status: "rejected", reasons: ["rhythm_grade_mismatch"] };
  const hits = d.perfect + d.good;
  if (d.maxCombo > hits) return { status: "rejected", reasons: ["rhythm_combo_exceeds_hits"] };
  const bonus = Math.floor(d.maxCombo / 10) * 5;
  const lower = d.perfect * 300 + d.good * 120;
  const upper = d.perfect * 380 + d.good * 200 + hits * 2 * bonus;
  if (d.score < lower || d.score > upper) return { status: "rejected", reasons: ["rhythm_score_impossible"] };
  const song = RHYTHM_SONGS[d.songId];
  if (!song) reasons.push("rhythm_song_not_in_catalog");
  else {
    if (tot !== song.notes[d.difficulty]) reasons.push("rhythm_note_count_mismatch");
    // 歌曲要播完才會結算：伺服器場次時間短於歌曲長度的 90% → 待審核
    if (song.durationSec > 0 && t.serverDurationMs < song.durationSec * 900) reasons.push("rhythm_too_short");
  }
  return {
    status: reasons.length ? "pending_review" : "accepted", reasons,
    boards: [{ boardId: rhythmBoardId(d.songId, d.difficulty), score: d.score, extra: { songId: d.songId, difficulty: d.difficulty, accuracy: d.accuracy, grade: d.grade, maxCombo: d.maxCombo } }],
    // 原版今日挑戰：完成任一首歌
    challenge: { eligible: true, key: "complete_any_song", done: true },
  };
}

/* ── 問答 ── */
/** 答對 c 題、最高連對 m 時，可能的最高加分（連對全部排在一起） */
function quizBonusMax(c, m) {
  let best = 0;
  // 依原版：第 k 個連續答對加 min((k−1)×10, 50)；連對長度最多 m，所以分成數段長度 ≤ m 的連續答對
  let left = c;
  while (left > 0) {
    const run = Math.min(m, left);
    for (let k = 1; k <= run; k++) best += Math.min((k - 1) * 10, 50);
    left -= run;
  }
  return best;
}
function quizBonusMin(c, m) {
  // 至少有一段長度 m 的連續答對，其餘全部分散（每段長度 1，沒有加分）
  if (c === 0) return 0;
  let s = 0;
  for (let k = 1; k <= m; k++) s += Math.min((k - 1) * 10, 50);
  return s;
}
function quizCheck(d, t) {
  const reasons = [];
  if (d.totalQuestions !== QUIZ_QUESTIONS_PER_GAME) return { status: "rejected", reasons: ["quiz_question_count"] };
  if (d.correctCount > d.totalQuestions) return { status: "rejected", reasons: ["quiz_correct_exceeds_total"] };
  if (d.maxCombo > d.correctCount || (d.correctCount > 0 && d.maxCombo < 1)) return { status: "rejected", reasons: ["quiz_combo_invalid"] };
  // 連對 m 的答對題數：需要 c ≤ 10 且答錯題數夠把連對切開（c − m 題答對要被至少一題答錯隔開）
  const wrong = d.totalQuestions - d.correctCount;
  if (d.maxCombo > 0 && d.correctCount > d.maxCombo && wrong < 1) return { status: "rejected", reasons: ["quiz_combo_invalid"] };
  const base = d.correctCount * 100;
  const bonus = d.score - base;
  if (bonus < quizBonusMin(d.correctCount, d.maxCombo) || bonus > quizBonusMax(d.correctCount, d.maxCombo) || bonus % 10 !== 0) {
    return { status: "rejected", reasons: ["quiz_score_impossible"] };
  }
  const acc = Number((d.correctCount / d.totalQuestions).toFixed(4));
  if (Math.abs(d.accuracy - acc) > 0.0001) return { status: "rejected", reasons: ["quiz_accuracy_mismatch"] };
  if (d.timeUsedTotal > d.totalQuestions * QUIZ_QUESTION_TIME_LIMIT_SEC * 1000 + 5000) reasons.push("quiz_time_exceeds_limit");
  // 每題至少要等答案揭曉（原版 320ms）＋按下一題：10 題少於 5 秒 → 待審核
  if (t.serverDurationMs < 5000) reasons.push("quiz_too_short");
  const challenge = getQuizDailyChallengeForDate(t.yyyymmdd);
  return {
    status: reasons.length ? "pending_review" : "accepted", reasons,
    boards: [{ boardId: "progress", score: d.score }],   // 問答：先更新科目最佳，再由原版規則算出年級榜與主榜
    challenge: { eligible: true, key: `${challenge.gradeBand}-${challenge.subject}`, done: isRecordMatchingDailyChallenge(d, challenge) },
  };
}

/* ── 派對島大作戰 ── */
export const ADVENTURE_CONTINENTS = Object.freeze({
  1: {
    status: "open", name: "第一大陸",
    scoreVersions: ["adventure-score-v2-test"],
    stages: ["1-1", "1-2b", "1-3", "2-1", "2-2", "2-3", "2-4"],
    partMax: { collect: 3000, explore: 2500, combat: 2000, survival: 1500, efficiency: 1000 },
    // 連鎖撞擊加分（撞死 +50、撞傷 +15）只能撞第一大陸的怪物：一般 11＋重甲 4 → 最多約 15×50；放寬一倍作為合理上限
    chainBonusMax: 1500,
  },
  2: { status: "planned", name: "第二大陸" },
  3: { status: "planned", name: "第三大陸" },
});
export function adventureBoardId(continentId) { return `continent-${continentId}`; }

function adventureCheck(d, t) {
  const reasons = [];
  const c = ADVENTURE_CONTINENTS[d.continentId];
  if (!c) return { status: "rejected", reasons: ["adventure_unknown_continent"] };
  if (c.status !== "open") return { status: "rejected", reasons: ["adventure_continent_not_open"] };
  if (!d.complete || !d.bossDefeated) return { status: "rejected", reasons: ["adventure_not_complete"] };
  const stages = Array.isArray(d.stages) ? d.stages : [];
  if (stages.length !== c.stages.length || c.stages.some((s, i) => stages[i] !== s)) return { status: "rejected", reasons: ["adventure_stages_incomplete"] };
  const parts = d.parts || {};
  let sum = 0;
  for (const [k, max] of Object.entries(c.partMax)) {
    const v = parts[k];
    if (!Number.isInteger(v) || v < 0 || v > max) return { status: "rejected", reasons: ["adventure_part_out_of_range"] };
    sum += v;
  }
  if (!Number.isInteger(d.chainBonus) || d.chainBonus < 0) return { status: "rejected", reasons: ["adventure_chain_invalid"] };
  if (d.total !== Math.min(10000, sum) + d.chainBonus) return { status: "rejected", reasons: ["adventure_total_mismatch"] };
  if (!c.scoreVersions.includes(d.scoreVersion)) reasons.push("adventure_score_version_unknown");
  if (d.chainBonus > c.chainBonusMax) reasons.push("adventure_chain_bonus_high");
  // 七關各自的通關秒數：合計少於 60 秒 → 待審核；伺服器場次時間也必須至少涵蓋通關秒數的一半（允許中途存檔接續）
  const secs = c.stages.map((s) => Number((d.stageClearSec || {})[s]));
  if (secs.some((s) => !Number.isFinite(s) || s <= 0)) reasons.push("adventure_stage_time_missing");
  else {
    const totalSec = secs.reduce((a, b) => a + b, 0);
    if (totalSec < 60) reasons.push("adventure_too_fast");
    if (t.serverDurationMs < totalSec * 500) reasons.push("adventure_session_shorter_than_play");
  }
  return {
    status: reasons.length ? "pending_review" : "accepted", reasons,
    boards: [{ boardId: adventureBoardId(d.continentId), score: d.total, extra: { continentId: d.continentId, rank: d.rank } }],
    challenge: { eligible: false },   // 派對島本次沒有今日挑戰 +10
  };
}

export const GAME_RULES = Object.freeze({
  tetris: {
    schema: { score: int(0, 50000000), level: int(1, 999), lines: int(0, 100000), peakCombo: int(0, 100000), difficulty: { type: "string", required: true, enum: DIFFS } },
    check: tetrisCheck,
  },
  rhythm: {
    schema: {
      songId: { type: "string", required: true, pattern: /^song\d{3,6}$/ }, difficulty: { type: "string", required: true, enum: DIFFS },
      score: int(0, 10000000), maxCombo: int(0, 100000), perfect: int(0, 100000), good: int(0, 100000), miss: int(0, 100000),
      accuracy: int(0, 100), grade: { type: "string", required: true, enum: ["S", "A+", "A", "B", "C", "D", "E"] },
    },
    check: rhythmCheck,
  },
  quiz: {
    schema: {
      gradeBand: { type: "string", required: true, enum: QUIZ_GRADE_KEYS }, subject: { type: "string", required: true, enum: QUIZ_SUBJECT_KEYS },
      score: int(0, 10000), correctCount: int(0, 100), totalQuestions: int(1, 100), maxCombo: int(0, 100),
      accuracy: { type: "number", required: true, min: 0, max: 1 }, timeUsedTotal: int(0, 3600000),
    },
    check: quizCheck,
  },
  adventure: {
    schema: {
      continentId: int(1, 99), total: int(0, 100000), rank: { type: "string", required: false, max: 4 },
      scoreVersion: { type: "string", required: true, max: 48, pattern: /^[A-Za-z0-9._-]+$/ },
      complete: { type: "boolean", required: true }, bossDefeated: { type: "boolean", required: true },
      parts: { type: "object", required: true, maxKeys: 8 }, chainBonus: int(0, 100000),
      stages: { type: "array", required: true, maxItems: 40 }, stageClearSec: { type: "object", required: true, maxKeys: 40 },
    },
    check: adventureCheck,
  },
});
export const OFFICIAL_GAME_IDS = Object.freeze(Object.keys(GAME_RULES));

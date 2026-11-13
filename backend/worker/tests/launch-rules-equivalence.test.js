// 後端排行榜／今日挑戰規則 ＝ 原版遊戲規則（直接在 vm 執行原版函式比對；不是重寫一份來比對自己）
// 需要唯讀 clone：BV_RO_DIR（預設 /home/claude/ro）底下的 vparty-quiz-game、vparty-tetris。找不到就略過並標示。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as Q from "../src/launch/quiz-rules.js";
import { getTetrisDailyChallengeForDate, isTetrisDailyChallengeCompleted } from "../src/launch/game-rules.js";

const RO = process.env.BV_RO_DIR || "/home/claude/ro";
const QUIZ = path.join(RO, "vparty-quiz-game/main.js");
const TETRIS = path.join(RO, "vparty-tetris/index.html");
const have = fs.existsSync(QUIZ) && fs.existsSync(TETRIS);
const skip = have ? false : "找不到原版唯讀 clone（設定 BV_RO_DIR）";

/** 從原始碼取出「function name(...){...}」整段（大括號配對） */
function extract(src, name) {
  const i = src.search(new RegExp(`function ${name}\\s*\\(`));
  if (i < 0) throw new Error("找不到原版函式 " + name);
  let depth = 0, j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error("函式不完整 " + name);
}
function extractVar(src, name) {
  const m = src.match(new RegExp(`var ${name} = \\[[\\s\\S]*?\\n\\];`));
  if (!m) throw new Error("找不到 " + name);
  return m[0];
}

function quizCtx(nowMs) {
  const src = fs.readFileSync(QUIZ, "utf8");
  const ctx = vm.createContext({
    QUIZ_VERSION: "orig", PLAYER: { playerKey: "k", id: "x", displayAvatarKey: "boy1" },
    getAvatarByKey: () => ({}), resolveAvatarSrc: () => "", addEquippedTitleSnapshot: (r) => r,
    Date: class extends Date { static now() { return nowMs; } },
  });
  const code = [extractVar(src, "GRADE_OPTIONS"), extractVar(src, "SUBJECT_OPTIONS"),
    ...["shouldUpdateBestRecord", "makeSubjectProgressFromRecord", "getGradeName", "getSubjectName", "subjectSortIndex",
      "buildGradeRecordFromProgress", "buildMainRecordFromGradeRecords", "compareMainRows", "compareGradeRows",
      "hashDateKeyForDailyChallenge", "getDailyChallengeForDate", "isRecordMatchingDailyChallenge"].map((n) => extract(src, n))].join("\n");
  vm.runInContext(code, ctx);
  return ctx;
}

// 可重現的亂數
function rng(seed) { return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const NUM_FIELDS_SUBJECT = ["bestScore", "bestCorrectCount", "bestMaxCombo", "bestTimeUsedTotal", "bestTotalQuestions", "bestUpdatedAt", "attempts", "lastScore", "perfect", "totalQuestions"];
const NUM_FIELDS_GRADE = ["gradeTotalScore", "completedSubjects", "perfectSubjects", "totalCorrect", "totalQuestions", "totalMaxCombo", "totalTimeUsed", "totalAttempts", "subjectSummaryText"];
const NUM_FIELDS_MAIN = ["totalScore", "completedGrades", "completedSubjects", "perfectSubjects", "totalCorrect", "totalQuestions", "totalMaxCombo", "totalTimeUsed", "totalAttempts", "gradeSummaryText"];
const pickF = (o, f) => Object.fromEntries(f.map((k) => [k, o[k]]));

test("問答：科目最佳／年級加總／主榜加總／排序，與原版函式結果一致（2,000 筆隨機成績）", { skip }, () => {
  const NOW = 1_763_000_000_000;
  const O = quizCtx(NOW);
  const r = rng(20261113);
  const players = Array.from({ length: 12 }, () => ({ mine: {}, orig: {} }));
  for (let n = 0; n < 2000; n++) {
    const p = pick(r, players);
    const g = pick(r, Q.QUIZ_GRADE_KEYS), s = pick(r, Q.QUIZ_SUBJECT_KEYS);
    const correct = Math.floor(r() * 11);
    const rec = { gradeBand: g, subject: s, score: correct * 100 + Math.floor(r() * 3) * 10, correctCount: correct, totalQuestions: 10,
      maxCombo: Math.min(correct, Math.floor(r() * 11)), timeUsedTotal: 10000 + Math.floor(r() * 140000), ts: NOW - Math.floor(r() * 1e8) };
    const oldMine = (p.mine[g] || {})[s], oldOrig = (p.orig[g] || {})[s];
    const a = Q.makeSubjectProgressFromRecord(rec, oldMine, NOW);
    const b = O.makeSubjectProgressFromRecord(rec, oldOrig);
    assert.equal(a.bestUpdated, b.bestUpdated, "是否更新最佳");
    assert.deepEqual(pickF(a.progress, NUM_FIELDS_SUBJECT), pickF(b.progress, NUM_FIELDS_SUBJECT));
    (p.mine[g] = p.mine[g] || {})[s] = a.progress;
    (p.orig[g] = p.orig[g] || {})[s] = b.progress;
  }
  const mainMine = [], mainOrig = [], gradeMine = { low: [], middle: [], high: [] }, gradeOrig = { low: [], middle: [], high: [] };
  players.forEach((p, idx) => {
    const gm = {}, go = {};
    for (const g of Q.QUIZ_GRADE_KEYS) {
      if (!p.mine[g]) continue;
      gm[g] = Q.buildGradeRecordFromProgress(g, p.mine[g], NOW);
      go[g] = O.buildGradeRecordFromProgress(g, p.orig[g]);
      assert.deepEqual(pickF(gm[g], NUM_FIELDS_GRADE), pickF(go[g], NUM_FIELDS_GRADE), "年級紀錄 " + g);
      gradeMine[g].push({ ...gm[g], idx }); gradeOrig[g].push({ ...go[g], idx });
    }
    const mm = Q.buildMainRecordFromGradeRecords(gm, NOW), mo = O.buildMainRecordFromGradeRecords(go);
    assert.deepEqual(pickF(mm, NUM_FIELDS_MAIN), pickF(mo, NUM_FIELDS_MAIN), "主榜紀錄");
    assert.deepEqual({ ...mm.gradeSummary }, { ...mo.gradeSummary });
    mainMine.push({ ...mm, idx }); mainOrig.push({ ...mo, idx });
  });
  assert.deepEqual(mainMine.sort(Q.compareMainRows).map((x) => x.idx), mainOrig.sort(O.compareMainRows).map((x) => x.idx), "主榜排序");
  for (const g of Q.QUIZ_GRADE_KEYS) {
    assert.deepEqual(gradeMine[g].sort(Q.compareGradeRows).map((x) => x.idx), gradeOrig[g].sort(O.compareGradeRows).map((x) => x.idx), "年級榜排序 " + g);
  }
});

test("問答今日挑戰：2026～2028 每一天的指定年級＋科目與原版一致", { skip }, () => {
  const O = quizCtx(Date.now());
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
    const a = Q.getQuizDailyChallengeForDate(key), b = O.getDailyChallengeForDate(key);
    assert.deepEqual([a.gradeBand, a.subject], [b.gradeBand, b.subject], key);
    const rec = { gradeBand: a.gradeBand, subject: a.subject };
    assert.equal(Q.isRecordMatchingDailyChallenge(rec, a), O.isRecordMatchingDailyChallenge(rec, b));
  }
});

test("方塊今日挑戰：題目輪替與完成判定與原版一致", { skip }, () => {
  const src = fs.readFileSync(TETRIS, "utf8");
  const ctx = vm.createContext({});
  vm.runInContext(["getTetrisDailyChallengeCatalog", "getTetrisDailyChallengeForDate", "isTetrisDailyChallengeCompleted"].map((n) => extract(src, n)).join("\n"), ctx);
  const r = rng(7);
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
    const a = getTetrisDailyChallengeForDate(key), b = ctx.getTetrisDailyChallengeForDate(key);
    assert.deepEqual([a.challengeKey, a.conditionType, a.target], [b.challengeKey, b.conditionType, b.target], key);
    const res = { score: Math.floor(r() * 1200), lines: Math.floor(r() * 9), level: 1 + Math.floor(r() * 3), peakCombo: Math.floor(r() * 4) };
    assert.equal(isTetrisDailyChallengeCompleted(a, res), ctx.isTetrisDailyChallengeCompleted(b, res), key + JSON.stringify(res));
  }
});

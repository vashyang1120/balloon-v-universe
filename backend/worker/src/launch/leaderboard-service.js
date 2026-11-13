/**
 * 正式排行榜（LeaderboardService）
 *
 *   leaderboards/{gameId}/{boardId}/{playerId} = 這位玩家在這個榜的個人最佳
 *     方塊   tetris/total
 *     節奏   rhythm/{songId}--{difficulty}（每首歌×每個難度各自獨立）
 *     問答   quiz/low、quiz/middle、quiz/high、quiz/main（沿用原版：科目最佳 → 年級加總 → 三個年級加總）
 *     派對島 adventure/continent-{n}（每個大陸獨立；只有完整通關的大陸總分）
 *   quizProgress/{playerId} = 問答各年級各科目的個人最佳（原版 quizProgress 結構）
 *
 * 只有後端 accepted 的成績會寫進來；pending_review／rejected 不入榜。
 * 每次更新都是單一節點 CAS：較低分不會覆蓋最佳分數，同時提交也不會互相蓋掉。
 */
import { casUpdate } from "./cas.js";
import {
  makeSubjectProgressFromRecord, buildGradeRecordFromProgress, buildMainRecordFromGradeRecords,
  compareMainRows, compareGradeRows, QUIZ_GRADE_KEYS,
} from "./quiz-rules.js";
import { RHYTHM_SONGS } from "./rhythm-songs.js";
import { ADVENTURE_CONTINENTS, adventureBoardId, rhythmBoardId } from "./game-rules.js";

export const boardPath = (gameId, boardId, playerId) => `leaderboards/${gameId}/${boardId}` + (playerId ? `/${playerId}` : "");
export const quizProgressPath = (playerId) => `quizProgress/${playerId}`;
const APPLIED_KEEP = 300;

const BOARD_ID = /^[A-Za-z0-9_-]{1,64}$/;
export function isValidBoard(gameId, boardId) {
  if (!BOARD_ID.test(boardId)) return false;
  if (gameId === "tetris") return boardId === "total";
  if (gameId === "rhythm") return /^song\d{3,6}--(easy|normal|hard)$/.test(boardId);
  if (gameId === "quiz") return ["low", "middle", "high", "main"].includes(boardId);
  if (gameId === "adventure") return /^continent-\d{1,2}$/.test(boardId);
  return false;
}

/** 排行榜目錄：大廳排行榜面板用（尚未開放的大陸只顯示「未開放」，不產生任何分數） */
export function boardCatalog() {
  return {
    tetris: { name: "方塊工坊／方塊派對", boards: [{ boardId: "total", name: "總分排行榜" }] },
    rhythm: {
      name: "音樂舞台／節奏遊戲",
      boards: Object.entries(RHYTHM_SONGS).flatMap(([songId, s]) => ["easy", "normal", "hard"].map((d) => ({ boardId: rhythmBoardId(songId, d), songId, songTitle: s.title, difficulty: d, name: `${s.title}（${{ easy: "簡單", normal: "普通", hard: "困難" }[d]}）` }))),
    },
    quiz: { name: "知識學院／知識挑戰", boards: [{ boardId: "main", name: "主榜" }, { boardId: "low", name: "低年級榜" }, { boardId: "middle", name: "中年級榜" }, { boardId: "high", name: "高年級榜" }] },
    adventure: {
      name: "派對島大作戰",
      boards: Object.entries(ADVENTURE_CONTINENTS).map(([id, c]) => ({ boardId: adventureBoardId(id), continentId: Number(id), name: c.name + "榜", status: c.status === "open" ? "open" : "not_open" })),
    },
  };
}

function snapshot(profile) {
  return { displayId: profile.displayId, displayAvatarKey: profile.displayAvatarKey || profile.baseAvatarKey };
}

export function createLeaderboardService({ db, now }) {
  /** 一般排行榜：分數較高才更新；同分保留先達成的紀錄 */
  async function updateBest(gameId, b, score, profile) {
    const t = now();
    const r = await casUpdate(db, boardPath(gameId, b.boardId, score.playerId), (cur) => {
      if (cur && cur.submissionId === score.submissionId) return { result: { improved: false, best: cur.score } };
      if (cur && Number(cur.score) >= b.score) return { result: { improved: false, best: cur.score } };
      const entry = { playerId: score.playerId, score: b.score, submissionId: score.submissionId, achievedAt: score.receivedAt, updatedAt: t, ...snapshot(profile), extra: b.extra || {} };
      return { value: entry, result: { improved: true, best: b.score, previous: cur ? cur.score : null } };
    });
    return { boardId: b.boardId, ...r.result };
  }

  /** 問答：科目最佳（原版 makeSubjectProgressFromRecord）→ 年級榜 → 主榜 */
  async function updateQuiz(score, profile) {
    const d = score.scoreData;
    const t = now();
    const r = await casUpdate(db, quizProgressPath(score.playerId), (cur) => {
      const doc = cur && typeof cur === "object" ? cur : { playerId: score.playerId, rev: 0, progress: {}, applied: {} };
      doc.progress = doc.progress || {}; doc.applied = doc.applied || {};
      if (doc.applied[score.submissionId]) return { result: { doc, already: true } };   // 重送：不重複計入 attempts
      const old = (doc.progress[d.gradeBand] || {})[d.subject] || {};
      const record = { ...d, ts: score.receivedAt };
      const { progress, bestUpdated } = makeSubjectProgressFromRecord(record, old, t);
      doc.progress[d.gradeBand] = { ...(doc.progress[d.gradeBand] || {}), [d.subject]: progress };
      doc.applied[score.submissionId] = t;
      const keys = Object.keys(doc.applied);
      if (keys.length > APPLIED_KEEP) keys.sort((a, b) => doc.applied[a] - doc.applied[b]).slice(0, keys.length - APPLIED_KEEP).forEach((k) => delete doc.applied[k]);
      return { value: { ...doc, rev: Number(doc.rev || 0) + 1, updatedAt: t }, result: { doc: null, bestUpdated } };
    });
    const doc = r.value;
    const rev = Number(doc.rev || 0);
    const grades = {};
    QUIZ_GRADE_KEYS.forEach((g) => { if (doc.progress[g]) grades[g] = buildGradeRecordFromProgress(g, doc.progress[g], t); });
    const main = buildMainRecordFromGradeRecords(grades, t);
    const writes = [];
    // 年級榜只更新這次的年級；主榜每次都重算（都由同一份 progress 算出）
    const changed = { [d.gradeBand]: grades[d.gradeBand], main };
    for (const [boardId, rec] of Object.entries(changed)) {
      writes.push(casUpdate(db, boardPath("quiz", boardId, score.playerId), (cur) => {
        if (cur && Number(cur.rev || 0) >= rev) return {};   // 已經是同一份或更新的 progress 算出來的
        return { value: { playerId: score.playerId, rev, ...rec, ...snapshot(profile), score: boardId === "main" ? rec.totalScore : rec.gradeTotalScore, submissionId: score.submissionId } };
      }));
    }
    await Promise.all(writes);
    return [
      { boardId: d.gradeBand, best: grades[d.gradeBand].gradeTotalScore, improved: !!(r.result && r.result.bestUpdated) },
      { boardId: "main", best: main.totalScore, improved: !!(r.result && r.result.bestUpdated) },
    ];
  }

  return {
    async applyScore(score, profile) {
      if (score.gameId === "quiz") return updateQuiz(score, profile);
      const out = [];
      for (const b of score.boards || []) out.push(await updateBest(score.gameId, b, score, profile));
      return out;
    },

    async getBoard(gameId, boardId, { limit = 50, playerId } = {}) {
      const raw = (await db.get(boardPath(gameId, boardId))) || {};
      let rows = Object.values(raw).filter((r) => r && typeof r === "object" && typeof r.playerId === "string");
      if (gameId === "quiz") rows.sort(boardId === "main" ? compareMainRows : compareGradeRows);
      else rows.sort((a, b) => (b.score - a.score) || (a.achievedAt - b.achievedAt));
      const ranked = rows.map((r, i) => ({ rank: i + 1, ...publicRow(gameId, boardId, r) }));
      const me = playerId ? ranked.find((r) => r.playerId === playerId) || null : null;
      return { gameId, boardId, total: ranked.length, rows: ranked.slice(0, limit), me };
    },

    async getQuizProgress(playerId) {
      const doc = (await db.get(quizProgressPath(playerId))) || {};
      return { playerId, progress: doc.progress || {}, rev: Number(doc.rev || 0) };
    },
  };
}

function publicRow(gameId, boardId, r) {
  const base = { playerId: r.playerId, displayId: r.displayId, displayAvatarKey: r.displayAvatarKey, score: Number(r.score || 0) };
  if (gameId === "quiz") {
    // 排序用的同分比較欄位也一起公開（與原版排行榜相同的統計數字，不含任何個資）
    return { ...base, completedSubjects: r.completedSubjects || 0, perfectSubjects: r.perfectSubjects || 0,
      totalCorrect: r.totalCorrect || 0, totalQuestions: r.totalQuestions || 0, totalTimeUsed: r.totalTimeUsed || 0,
      totalMaxCombo: r.totalMaxCombo || 0, totalAttempts: r.totalAttempts || 0, updatedAt: r.updatedAt || 0,
      summary: boardId === "main" ? r.gradeSummaryText : r.subjectSummaryText,
      subjectNames: boardId === "main" ? undefined : (r.subjectNames || []), gradeSummary: boardId === "main" ? r.gradeSummary : undefined };
  }
  return { ...base, achievedAt: r.achievedAt ? new Date(r.achievedAt).toISOString() : null, extra: r.extra || {} };
}

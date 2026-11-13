/**
 * 知識挑戰：年級榜／主榜與今日挑戰規則（伺服器版）
 *
 * 逐行對照原版 vparty-quiz-game main.js（quiz-v0.2.44）的：
 *   makeSubjectProgressFromRecord、shouldUpdateBestRecord、buildGradeRecordFromProgress、
 *   buildMainRecordFromGradeRecords、compareMainRows、compareGradeRows、subjectSortIndex、
 *   hashDateKeyForDailyChallenge、getDailyChallengeForDate、isRecordMatchingDailyChallenge
 * 只拿掉「讀取前端全域變數（PLAYER、頭像圖片、稱號快照）」的部分，計算規則完全相同。
 * tests/launch-quiz-rules.test.js 會把原版函式放進沙盒執行，逐一比對結果。
 */
export const QUIZ_GRADES = Object.freeze([
  { key: "low", name: "低年級" },
  { key: "middle", name: "中年級" },
  { key: "high", name: "高年級" },
]);
export const QUIZ_SUBJECTS = Object.freeze([
  { key: "math", name: "數學" }, { key: "mandarin", name: "國語" }, { key: "science", name: "自然" },
  { key: "social", name: "社會" }, { key: "english", name: "英文" }, { key: "balloon", name: "氣球知識" },
  { key: "brand", name: "小V品牌" }, { key: "brain", name: "腦筋急轉彎" },
]);
export const QUIZ_GRADE_KEYS = QUIZ_GRADES.map((g) => g.key);
export const QUIZ_SUBJECT_KEYS = QUIZ_SUBJECTS.map((s) => s.key);
export const QUIZ_QUESTIONS_PER_GAME = 10;
export const QUIZ_QUESTION_TIME_LIMIT_SEC = 15;

const gradeName = (k) => (QUIZ_GRADES.find((g) => g.key === k) || {}).name || k;
const subjectName = (k) => (QUIZ_SUBJECTS.find((s) => s.key === k) || {}).name || k;
export function subjectSortIndex(key) {
  const idx = QUIZ_SUBJECTS.findIndex((s) => s.key === key);
  return idx < 0 ? 999 : idx;
}

export function shouldUpdateBestRecord(oldRecord, newRecord) {
  if (!oldRecord) return true;
  if ((newRecord.score || 0) !== (oldRecord.score || 0)) return (newRecord.score || 0) > (oldRecord.score || 0);
  if ((newRecord.correctCount || 0) !== (oldRecord.correctCount || 0)) return (newRecord.correctCount || 0) > (oldRecord.correctCount || 0);
  if ((newRecord.maxCombo || 0) !== (oldRecord.maxCombo || 0)) return (newRecord.maxCombo || 0) > (oldRecord.maxCombo || 0);
  if ((newRecord.timeUsedTotal || 999999) !== (oldRecord.timeUsedTotal || 999999)) return (newRecord.timeUsedTotal || 999999) < (oldRecord.timeUsedTotal || 999999);
  return (newRecord.ts || 0) > (oldRecord.ts || 0);
}

/** 原版 makeSubjectProgressFromRecord（now 由伺服器提供） */
export function makeSubjectProgressFromRecord(record, oldProgress, now) {
  oldProgress = oldProgress || {};
  const totalQuestions = Number(record.totalQuestions || oldProgress.totalQuestions || oldProgress.bestTotalQuestions || 10);
  const current = {
    score: Number(record.score || 0),
    correctCount: Number(record.correctCount || 0),
    maxCombo: Number(record.maxCombo || 0),
    timeUsedTotal: Number(record.timeUsedTotal || record.timeUsed || 0),
    ts: Number(record.ts || record.updatedAt || now),
  };
  const oldBest = oldProgress && (oldProgress.bestScore || oldProgress.bestCorrectCount || oldProgress.bestMaxCombo || oldProgress.bestUpdatedAt) ? {
    score: Number(oldProgress.bestScore || 0),
    correctCount: Number(oldProgress.bestCorrectCount || 0),
    maxCombo: Number(oldProgress.bestMaxCombo || 0),
    timeUsedTotal: Number(oldProgress.bestTimeUsedTotal || 999999),
    ts: Number(oldProgress.bestUpdatedAt || oldProgress.updatedAt || 0),
  } : null;
  const bestUpdated = shouldUpdateBestRecord(oldBest, current);
  const attempts = Number(oldProgress.attempts || 0) + 1;
  const progress = {
    gameId: "quiz",
    gradeBand: record.gradeBand,
    gradeBandName: record.gradeBandName || gradeName(record.gradeBand),
    subject: record.subject,
    subjectName: record.subjectName || subjectName(record.subject),
    bestScore: bestUpdated ? current.score : Number(oldProgress.bestScore || 0),
    bestCorrectCount: bestUpdated ? current.correctCount : Number(oldProgress.bestCorrectCount || 0),
    bestMaxCombo: bestUpdated ? current.maxCombo : Number(oldProgress.bestMaxCombo || 0),
    bestTimeUsedTotal: bestUpdated ? current.timeUsedTotal : Number(oldProgress.bestTimeUsedTotal || 0),
    bestTotalQuestions: bestUpdated ? totalQuestions : Number(oldProgress.bestTotalQuestions || oldProgress.totalQuestions || totalQuestions),
    bestUpdatedAt: bestUpdated ? current.ts : Number(oldProgress.bestUpdatedAt || oldProgress.updatedAt || current.ts),
    attempts,
    lastScore: current.score,
    lastCorrectCount: current.correctCount,
    lastMaxCombo: current.maxCombo,
    lastTimeUsedTotal: current.timeUsedTotal,
    lastTotalQuestions: totalQuestions,
    updatedAt: now,
  };
  progress.totalQuestions = progress.bestTotalQuestions;
  progress.perfect = Number(progress.bestCorrectCount || 0) >= Number(progress.bestTotalQuestions || totalQuestions || 10);
  return { progress, bestUpdated };
}

/** 原版 buildGradeRecordFromProgress 的計分欄位（玩家顯示資料另外由伺服器加上） */
export function buildGradeRecordFromProgress(gradeBand, progressMap, now) {
  const entries = [];
  Object.keys(progressMap || {}).forEach((subjectKey) => {
    const p = progressMap[subjectKey];
    if (!p || typeof p !== "object") return;
    if (!p.bestScore && !p.attempts) return;
    entries.push({ key: subjectKey, progress: p });
  });
  entries.sort((a, b) => subjectSortIndex(a.key) - subjectSortIndex(b.key));
  const subjectKeys = [], subjectNames = [];
  let gradeTotalScore = 0, perfectSubjects = 0, totalCorrect = 0, totalQuestions = 0, totalMaxCombo = 0, totalTimeUsed = 0, totalAttempts = 0;
  entries.forEach((item) => {
    const p = item.progress;
    subjectKeys.push(p.subject || item.key);
    subjectNames.push(p.subjectName || subjectName(item.key));
    gradeTotalScore += Number(p.bestScore || 0);
    if (p.perfect === true) perfectSubjects += 1;
    totalCorrect += Number(p.bestCorrectCount || 0);
    totalQuestions += Number(p.bestTotalQuestions || p.totalQuestions || 10);
    totalMaxCombo += Number(p.bestMaxCombo || 0);
    totalTimeUsed += Number(p.bestTimeUsedTotal || 0);
    totalAttempts += Number(p.attempts || 0);
  });
  return {
    gradeBand, gradeBandName: gradeName(gradeBand), gradeTotalScore, completedSubjects: entries.length, perfectSubjects,
    subjectKeys, subjectNames, subjectSummaryText: entries.length + "科：" + subjectNames.join(" / "),
    totalCorrect, totalQuestions, totalMaxCombo, totalTimeUsed, totalAttempts, updatedAt: now,
  };
}

/** 原版 buildMainRecordFromGradeRecords 的計分欄位 */
export function buildMainRecordFromGradeRecords(gradeRecords, now) {
  const gradeSummary = {}, summaryParts = [];
  let totalScore = 0, completedGrades = 0, completedSubjects = 0, perfectSubjects = 0, totalCorrect = 0, totalQuestions = 0, totalMaxCombo = 0, totalTimeUsed = 0, totalAttempts = 0;
  QUIZ_GRADES.forEach((g) => {
    const r = gradeRecords[g.key];
    const score = r ? Number(r.gradeTotalScore || 0) : 0;
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
  return {
    totalScore, completedGrades, completedSubjects, perfectSubjects, gradeSummary,
    gradeSummaryText: summaryParts.join(" / ") || "尚未完成挑戰",
    totalCorrect, totalQuestions, totalMaxCombo, totalTimeUsed, totalAttempts, updatedAt: now,
  };
}

export function compareMainRows(a, b) {
  if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
  if ((b.perfectSubjects || 0) !== (a.perfectSubjects || 0)) return (b.perfectSubjects || 0) - (a.perfectSubjects || 0);
  if ((b.completedSubjects || 0) !== (a.completedSubjects || 0)) return (b.completedSubjects || 0) - (a.completedSubjects || 0);
  if ((b.totalCorrect || 0) !== (a.totalCorrect || 0)) return (b.totalCorrect || 0) - (a.totalCorrect || 0);
  if ((a.totalTimeUsed || 999999) !== (b.totalTimeUsed || 999999)) return (a.totalTimeUsed || 999999) - (b.totalTimeUsed || 999999);
  if ((b.totalMaxCombo || 0) !== (a.totalMaxCombo || 0)) return (b.totalMaxCombo || 0) - (a.totalMaxCombo || 0);
  if ((a.totalAttempts || 999999) !== (b.totalAttempts || 999999)) return (a.totalAttempts || 999999) - (b.totalAttempts || 999999);
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}
export function compareGradeRows(a, b) {
  if ((b.gradeTotalScore || 0) !== (a.gradeTotalScore || 0)) return (b.gradeTotalScore || 0) - (a.gradeTotalScore || 0);
  if ((b.perfectSubjects || 0) !== (a.perfectSubjects || 0)) return (b.perfectSubjects || 0) - (a.perfectSubjects || 0);
  if ((b.totalCorrect || 0) !== (a.totalCorrect || 0)) return (b.totalCorrect || 0) - (a.totalCorrect || 0);
  if ((a.totalTimeUsed || 999999) !== (b.totalTimeUsed || 999999)) return (a.totalTimeUsed || 999999) - (b.totalTimeUsed || 999999);
  if ((b.totalMaxCombo || 0) !== (a.totalMaxCombo || 0)) return (b.totalMaxCombo || 0) - (a.totalMaxCombo || 0);
  if ((a.totalAttempts || 999999) !== (b.totalAttempts || 999999)) return (a.totalAttempts || 999999) - (b.totalAttempts || 999999);
  return (b.updatedAt || 0) - (a.updatedAt || 0);
}

/* ── 今日挑戰（原版 v0.2.34：每天指定一個年級＋科目） ── */
export function hashDateKeyForDailyChallenge(dateKey) {
  const str = "vquiz-daily-" + String(dateKey || "");
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
/** @param {string} yyyymmdd 原版格式（例如 20261113） */
export function getQuizDailyChallengeForDate(yyyymmdd) {
  const h = hashDateKeyForDailyChallenge(yyyymmdd);
  const grade = QUIZ_GRADES[h % QUIZ_GRADES.length];
  const subject = QUIZ_SUBJECTS[Math.floor(h / QUIZ_GRADES.length) % QUIZ_SUBJECTS.length];
  return { dateKey: yyyymmdd, gradeBand: grade.key, subject: subject.key, description: grade.name + "・" + subject.name };
}
export function isRecordMatchingDailyChallenge(record, challenge) {
  if (!record || !challenge) return false;
  return record.gradeBand === challenge.gradeBand && record.subject === challenge.subject;
}

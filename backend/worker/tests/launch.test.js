// v0.3.0 正式成績／排行榜／V幣／管理審核（全部用「假 Firebase」本機模擬；不是真實資料庫，也不是正式環境）
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { app, req, baseEnv, fakeServiceAccount, ORIGIN, newRsaKey, staticJwks, makeIdToken, ADMIN_UID } from "./helpers.js";
import { createFakeRtdb } from "./fake-rtdb.js";
import { _resetMemoryLimiter } from "../src/middleware/rate-limit.js";
import { getQuizDailyChallengeForDate, QUIZ_GRADE_KEYS, QUIZ_SUBJECT_KEYS } from "../src/launch/quiz-rules.js";
import { getTetrisDailyChallengeForDate } from "../src/launch/game-rules.js";
import { RHYTHM_SONGS } from "../src/launch/rhythm-songs.js";
import { taipeiDateKey } from "../src/utils/ids.js";

const sa = await fakeServiceAccount();
const key = await newRsaKey("kid-launch");
const ON = { SCORES_ENABLED: "on", REWARDS_ENABLED: "on" };
beforeEach(() => _resetMemoryLimiter());

function setup(extraEnv = ON, startMs = Date.now()) {
  const db = createFakeRtdb();
  const clock = { t: startMs };
  const a = app({ fetch: db.fetch, now: () => clock.t, jwks: staticJwks(key) });
  const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: sa.json, ADMIN_UIDS: ADMIN_UID, ...extraEnv });
  let n = 0;
  const call = async (method, path, body, headers = {}) => {
    const h = { origin: ORIGIN, "cf-connecting-ip": `10.9.${Math.floor(n / 250)}.${(n++ % 250) + 1}`, ...headers };
    const init = { method, headers: h };
    if (body !== undefined) { init.body = JSON.stringify(body); h["content-type"] = "application/json"; }
    const res = await a.fetch(req(path, init), env);
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed, headers: res.headers, text };
  };
  const admin = async (method, path, body) => call(method, path, body, { authorization: "Bearer " + (await makeIdToken(key)) });
  return { db, call, clock, admin };
}
const rid = () => crypto.randomUUID();
async function newPlayer(call, name, avatar = "boy1") {
  const r = await call("POST", "/v1/players", { displayId: name, baseAvatarKey: avatar, createRequestId: rid() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data.player.playerId;
}
async function session(call, playerId, gameId, gameVersion = "test-1") {
  const r = await call("POST", "/v1/sessions", { playerId, gameId, gameVersion });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data.sessionId;
}
function submitBody(playerId, gameId, sessionId, scoreData, submissionId = rid(), gameVersion = "test-1") {
  return { schemaVersion: 1, submissionId, sessionId, playerId, gameId, gameVersion, mode: "production", scoreData };
}
/** 開一場、等 ms、提交 */
async function play(env, playerId, gameId, scoreData, waitMs, opts = {}) {
  const sid = await session(env.call, playerId, gameId);
  env.clock.t += waitMs;
  const body = submitBody(playerId, gameId, sid, scoreData, opts.submissionId);
  const r = await env.call("POST", "/v1/scores", body);
  return { r, body, sid };
}
const TETRIS_OK = { score: 2400, level: 2, lines: 12, peakCombo: 3, difficulty: "normal" };   // 滿足所有方塊今日挑戰條件
function rhythmData(songId = "song005", difficulty = "normal", perfectRatio = 0.9) {
  const total = RHYTHM_SONGS[songId].notes[difficulty];
  const perfect = Math.floor(total * perfectRatio), good = total - perfect - 2, miss = 2;
  const acc = Math.round((perfect + good * 0.5) / total * 100);
  const grade = acc >= 95 ? "S" : acc >= 88 ? "A+" : acc >= 80 ? "A" : acc >= 68 ? "B" : acc >= 55 ? "C" : acc >= 40 ? "D" : "E";
  return { songId, difficulty, score: perfect * 300 + good * 150 + 100, maxCombo: Math.min(60, perfect + good), perfect, good, miss, accuracy: acc, grade };
}
function quizData(gradeBand, subject, correct = 8) {
  // 依原版：連續答對；這裡用「前 correct 題全對、後面全錯」
  let score = 0; for (let k = 1; k <= correct; k++) score += 100 + Math.min((k - 1) * 10, 50);
  return { gradeBand, subject, score, correctCount: correct, totalQuestions: 10, maxCombo: correct, accuracy: Number((correct / 10).toFixed(4)), timeUsedTotal: 42000 };
}
const advData = (extra = {}) => ({ continentId: 1, total: 7350, rank: "B", scoreVersion: "adventure-score-v2-test", complete: true, bossDefeated: true,
  parts: { collect: 2500, explore: 1500, combat: 1600, survival: 1000, efficiency: 700 }, chainBonus: 50,
  stages: ["1-1", "1-2b", "1-3", "2-1", "2-2", "2-3", "2-4"], stageClearSec: { "1-1": 40, "1-2b": 35, "1-3": 50, "2-1": 30, "2-2": 40, "2-3": 45, "2-4": 50 }, ...extra });
function invariant(db, playerId) {
  const w = db.get(`wallets/${playerId}`);
  if (!w) return 0;
  const sum = Object.values(w.ledger || {}).reduce((s, tx) => s + tx.amount, 0);
  assert.equal(w.balance, sum, "餘額必須等於帳本加總");
  assert.equal(Object.keys(w.claims || {}).length, Object.keys(w.ledger || {}).length, "每個領獎標記對應一筆帳本");
  return w.balance;
}

/* ───────── 開關 ───────── */
test("SCORES_ENABLED 預設關閉：不能開場次、不能提交；排行榜與錢包可讀（空）", async () => {
  const e = setup({});
  const p = await newPlayer(e.call, "關閉甲");
  const s = await e.call("POST", "/v1/sessions", { playerId: p, gameId: "tetris", gameVersion: "x" });
  assert.equal(s.status, 503); assert.equal(s.body.error.code, "SERVICE_DISABLED");
  assert.equal((await e.call("POST", "/v1/scores", submitBody(p, "tetris", "s_" + "a".repeat(20), TETRIS_OK))).status, 503);
  const lb = await e.call("GET", "/v1/leaderboards/tetris/total");
  assert.equal(lb.status, 200); assert.equal(lb.body.data.total, 0); assert.equal(lb.body.data.scores, "disabled");
  const w = await e.call("GET", `/v1/wallet/${p}`);
  assert.equal(w.body.data.balance, 0); assert.equal(w.body.data.rewards, "disabled"); assert.equal(w.body.data.spending.enabled, false);
  assert.equal(e.db.get("scores"), null); assert.equal(e.db.get("wallets"), null);
  const st = await e.call("GET", "/v1/launch/status");
  assert.deepEqual([st.body.data.scores, st.body.data.rewards, st.body.data.spending], ["disabled", "disabled", "disabled"]);
});

test("REWARDS_ENABLED 關閉時：成績照常入榜，但不發 V幣", async () => {
  const e = setup({ SCORES_ENABLED: "on" });
  const p = await newPlayer(e.call, "無獎勵");
  const { r } = await play(e, p, "tetris", TETRIS_OK, 60000);
  assert.equal(r.body.data.status, "accepted"); assert.equal(r.body.data.rewardState, "disabled");
  assert.equal((await e.call("GET", "/v1/leaderboards/tetris/total")).body.data.total, 1);
  assert.equal(e.db.get("wallets"), null);
});

/* ───────── 場次與玩家 ───────── */
test("場次：玩家不存在 → 404；格式錯 → 400；遊戲代碼不正確 → 400", async () => {
  const e = setup();
  assert.equal((await e.call("POST", "/v1/sessions", { playerId: "p_aaaaaaaaaaaaaaaaaaaa", gameId: "tetris", gameVersion: "x" })).status, 404);
  assert.equal((await e.call("POST", "/v1/sessions", { playerId: "小明__boy1", gameId: "tetris", gameVersion: "x" })).status, 400);
  const p = await newPlayer(e.call, "場次甲");
  assert.equal((await e.call("POST", "/v1/sessions", { playerId: p, gameId: "lobby", gameVersion: "x" })).status, 400);
});

test("場次只能用一次、只屬於同一位玩家與遊戲、會過期", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "場次乙"), b = await newPlayer(e.call, "場次丙", "girl1");
  const sid = await session(e.call, a, "tetris");
  e.clock.t += 60000;
  assert.equal((await e.call("POST", "/v1/scores", submitBody(b, "tetris", sid, TETRIS_OK))).status, 403, "別人的場次");
  assert.equal((await e.call("POST", "/v1/scores", submitBody(a, "rhythm", sid, rhythmData()))).status, 403, "別的遊戲");
  assert.equal((await e.call("POST", "/v1/scores", submitBody(a, "tetris", sid, TETRIS_OK))).status, 201);
  const again = await e.call("POST", "/v1/scores", submitBody(a, "tetris", sid, TETRIS_OK));
  assert.equal(again.status, 409, "同一場次第二筆成績"); assert.equal(again.body.error.code, "DUPLICATE_SUBMISSION");
  const sid2 = await session(e.call, a, "tetris");
  e.clock.t += 7 * 3600 * 1000;
  const exp = await e.call("POST", "/v1/scores", submitBody(a, "tetris", sid2, TETRIS_OK));
  assert.equal(exp.status, 400); assert.match(exp.body.error.message, /過期/);
});

/* ───────── 驗證 ───────── */
test("明顯不可能的成績 → rejected，不入榜、不發幣", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "作弊測試");
  const cases = [
    ["tetris", { ...TETRIS_OK, score: 9000000 }, "tetris_score_impossible"],
    ["tetris", { ...TETRIS_OK, level: 5 }, "tetris_level_mismatch"],
    ["rhythm", { ...rhythmData(), accuracy: 100 }, "rhythm_accuracy_mismatch"],
    ["rhythm", { ...rhythmData(), score: 99 }, "rhythm_score_impossible"],
    ["quiz", { ...quizData("low", "math"), score: 2000 }, "quiz_score_impossible"],
    ["adventure", advData({ total: 9999 }), "adventure_total_mismatch"],
    ["adventure", advData({ complete: false }), "adventure_not_complete"],
    ["adventure", advData({ stages: ["1-1", "2-4"] }), "adventure_stages_incomplete"],
    ["adventure", advData({ continentId: 2 }), "adventure_continent_not_open"],
  ];
  for (const [g, d, reason] of cases) {
    const { r } = await play(e, p, g, d, 10 * 60000);
    assert.equal(r.status, 201, g + JSON.stringify(r.body));
    assert.equal(r.body.data.status, "rejected", reason);
    assert.ok(r.body.data.reasons.includes(reason), `${reason} ← ${r.body.data.reasons}`);
  }
  for (const [g, b] of [["tetris", "total"], ["rhythm", "song005--normal"], ["quiz", "main"], ["adventure", "continent-1"]]) {
    assert.equal((await e.call("GET", `/v1/leaderboards/${g}/${b}`)).body.data.total, 0, `${g} 不入榜`);
  }
  assert.equal(invariant(e.db, p), 0);
});

test("欄位格式：多餘欄位、型別錯誤一律 400（不只檢查欄位存在）", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "格式測試");
  const sid = await session(e.call, p, "tetris");
  assert.equal((await e.call("POST", "/v1/scores", submitBody(p, "tetris", sid, { ...TETRIS_OK, bonus: 1 }))).status, 400);
  assert.equal((await e.call("POST", "/v1/scores", submitBody(p, "tetris", sid, { ...TETRIS_OK, score: "999" }))).status, 400);
  assert.equal((await e.call("POST", "/v1/scores", { ...submitBody(p, "tetris", sid, TETRIS_OK), balance: 9999 })).status, 400);
});

/* ───────── 排行榜 ───────── */
test("方塊總分榜：重玩只更新個人最佳、較低分不覆蓋、不同玩家排序正確、附上自己的名次", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "方塊甲"), b = await newPlayer(e.call, "方塊乙", "girl1");
  await play(e, a, "tetris", TETRIS_OK, 120000);
  await play(e, b, "tetris", { score: 5000, level: 3, lines: 22, peakCombo: 4, difficulty: "normal" }, 180000);
  await play(e, a, "tetris", { score: 800, level: 1, lines: 4, peakCombo: 1, difficulty: "normal" }, 60000);
  let lb = (await e.call("GET", `/v1/leaderboards/tetris/total?playerId=${a}`)).body.data;
  assert.deepEqual(lb.rows.map((r) => [r.displayId, r.score, r.rank]), [["方塊乙", 5000, 1], ["方塊甲", 2400, 2]]);
  assert.equal(lb.me.rank, 2); assert.equal(lb.me.score, 2400);
  await play(e, a, "tetris", { score: 9000, level: 4, lines: 30, peakCombo: 5, difficulty: "normal" }, 300000);
  lb = (await e.call("GET", "/v1/leaderboards/tetris/total")).body.data;
  assert.deepEqual(lb.rows.map((r) => [r.displayId, r.score]), [["方塊甲", 9000], ["方塊乙", 5000]]);
  assert.equal(lb.rows[0].displayAvatarKey, "boy1");
});

test("節奏：每首歌×每個難度各自獨立排行，不互相混合", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "節奏甲");
  const d1 = rhythmData("song005", "normal"), d2 = rhythmData("song005", "hard", 0.95), d3 = rhythmData("song001", "easy");
  for (const [d, id] of [[d1, "song005"], [d2, "song005"], [d3, "song001"]]) {
    const { r } = await play(e, a, "rhythm", d, (RHYTHM_SONGS[id].durationSec + 10) * 1000);
    assert.equal(r.body.data.status, "accepted", JSON.stringify(r.body.data.reasons));
  }
  const n = (await e.call("GET", "/v1/leaderboards/rhythm/song005--normal")).body.data.rows;
  const h = (await e.call("GET", "/v1/leaderboards/rhythm/song005--hard")).body.data.rows;
  const s1 = (await e.call("GET", "/v1/leaderboards/rhythm/song001--easy")).body.data.rows;
  assert.deepEqual([n[0].score, h[0].score, s1[0].score], [d1.score, d2.score, d3.score]);
  assert.equal((await e.call("GET", "/v1/leaderboards/rhythm/song001--hard")).body.data.total, 0);
  assert.equal((await e.call("GET", "/v1/leaderboards/rhythm/song005")).status, 404, "不是有效榜名");
  assert.equal((await e.call("GET", "/v1/leaderboards/rhythm/song005--extreme")).status, 404);
});

test("問答：科目個人最佳 → 年級加總 → 三個年級加總成主榜（沿用原版規則）", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "問答甲");
  const w = 60000;
  await play(e, a, "quiz", quizData("low", "math", 6), w);
  await play(e, a, "quiz", quizData("low", "math", 9), w);      // 同科目較高 → 更新
  await play(e, a, "quiz", quizData("low", "math", 3), w);      // 較低 → 不覆蓋
  await play(e, a, "quiz", quizData("low", "mandarin", 5), w);
  await play(e, a, "quiz", quizData("high", "science", 10), w);
  const s = (c) => { let x = 0; for (let k = 1; k <= c; k++) x += 100 + Math.min((k - 1) * 10, 50); return x; };
  const low = (await e.call("GET", "/v1/leaderboards/quiz/low")).body.data.rows[0];
  const high = (await e.call("GET", "/v1/leaderboards/quiz/high")).body.data.rows[0];
  const main = (await e.call("GET", "/v1/leaderboards/quiz/main")).body.data.rows[0];
  assert.equal(low.score, s(9) + s(5)); assert.equal(low.completedSubjects, 2);
  assert.equal(high.score, s(10)); assert.equal(high.perfectSubjects, 1);
  assert.equal(main.score, s(9) + s(5) + s(10));
  assert.equal((await e.call("GET", "/v1/leaderboards/quiz/middle")).body.data.total, 0);
  const prog = (await e.call("GET", `/v1/players/${a}/quiz-progress`)).body.data.progress;
  assert.equal(prog.low.math.bestScore, s(9)); assert.equal(prog.low.math.attempts, 3);
});

test("派對島：每個大陸獨立排行；只有完整通關入榜；保留最高通關總分", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "冒險甲"), b = await newPlayer(e.call, "冒險乙", "girl1");
  const r1 = await play(e, a, "adventure", advData(), 20 * 60000);
  assert.equal(r1.r.body.data.status, "accepted", JSON.stringify(r1.r.body.data.reasons));
  await play(e, a, "adventure", advData({ total: 6050, parts: { collect: 2000, explore: 1500, combat: 1000, survival: 1000, efficiency: 500 } }), 20 * 60000);
  await play(e, b, "adventure", advData({ total: 8050, parts: { collect: 3000, explore: 2000, combat: 1500, survival: 1000, efficiency: 500 } }), 20 * 60000);
  const lb = (await e.call("GET", "/v1/leaderboards/adventure/continent-1")).body.data.rows;
  assert.deepEqual(lb.map((r) => [r.displayId, r.score]), [["冒險乙", 8050], ["冒險甲", 7350]]);
  assert.equal((await e.call("GET", "/v1/leaderboards/adventure/continent-2")).body.data.total, 0, "第二大陸不受第一大陸影響");
  const cat = (await e.call("GET", "/v1/leaderboards")).body.data.games.adventure.boards;
  assert.deepEqual(cat.map((x) => [x.boardId, x.status]), [["continent-1", "open"], ["continent-2", "not_open"], ["continent-3", "not_open"]]);
});

/* ───────── V幣 ───────── */
test("V幣：第一場 +30；方塊／節奏／問答今日挑戰各 +10；同天不重領；合計最多 +60；派對島不加 +10", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "獎勵甲");
  const day = taipeiDateKey(new Date(e.clock.t)).replace(/-/g, "");
  const qc = getQuizDailyChallengeForDate(day);
  const other = QUIZ_SUBJECT_KEYS.find((s) => s !== qc.subject);
  const t1 = await play(e, p, "tetris", TETRIS_OK, 120000);
  assert.deepEqual(t1.r.body.data.rewards.map((x) => [x.type, x.amount]), [["daily_play", 30], ["daily_challenge", 10]], getTetrisDailyChallengeForDate(day).challengeKey);
  assert.equal(t1.r.body.data.balance, 40);
  const t2 = await play(e, p, "tetris", TETRIS_OK, 120000);
  assert.deepEqual(t2.r.body.data.rewards, [], "同一天第二場方塊：不再加幣");
  const r1 = await play(e, p, "rhythm", rhythmData(), 150000);
  assert.deepEqual(r1.r.body.data.rewards.map((x) => [x.type, x.amount]), [["daily_challenge", 10]], "其他遊戲不重領 +30");
  const q0 = await play(e, p, "quiz", quizData(qc.gradeBand, other), 60000);
  assert.deepEqual(q0.r.body.data.rewards, [], "不是今日指定的年級＋科目：不算今日挑戰");
  const q1 = await play(e, p, "quiz", quizData(qc.gradeBand, qc.subject), 60000);
  assert.deepEqual(q1.r.body.data.rewards.map((x) => x.amount), [10]);
  const adv = await play(e, p, "adventure", advData(), 20 * 60000);
  assert.deepEqual(adv.r.body.data.rewards, []);
  assert.equal(invariant(e.db, p), 60);
  const w = (await e.call("GET", `/v1/wallet/${p}`)).body.data;
  assert.equal(w.balance, 60); assert.equal(w.today.dailyPlay, true); assert.deepEqual(w.today.challenges, { tetris: true, rhythm: true, quiz: true });
  assert.equal(w.recent.length, 4);
  const tx = e.db.get(`wallets/${p}`).ledger[t1.r.body.data.rewards[0].txId];
  for (const k of ["txId", "type", "gameId", "playerId", "dateKey", "amount", "balanceAfter", "sourceSubmissionId", "createdAt"]) assert.ok(k in tx, k);
});

test("V幣：派對島也能觸發共用每日 +30（任何已接受的有效場次）", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "冒險獎勵");
  const r = await play(e, p, "adventure", advData(), 20 * 60000);
  assert.deepEqual(r.r.body.data.rewards.map((x) => [x.type, x.amount]), [["daily_play", 30]]);
});

test("V幣：玩家 A、B 錢包與領獎資格完全獨立", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "錢包甲"), b = await newPlayer(e.call, "錢包乙", "girl1");
  await play(e, a, "tetris", TETRIS_OK, 120000);
  const rb = await play(e, b, "tetris", TETRIS_OK, 120000);
  assert.equal(rb.r.body.data.balance, 40, "B 有自己的 +30／+10");
  assert.equal(invariant(e.db, a), 40); assert.equal(invariant(e.db, b), 40);
});

test("跨午夜：獎勵日期以伺服器場次開始時間（台灣日期）判定；隔天可再領", async () => {
  // 台灣 23:59（UTC 15:59）開始、00:02 提交
  const base = new Date(); base.setUTCHours(15, 59, 0, 0);
  const e = setup(ON, base.getTime());
  const p = await newPlayer(e.call, "午夜甲");
  const day1 = taipeiDateKey(new Date(e.clock.t));
  const r1 = await play(e, p, "tetris", TETRIS_OK, 3 * 60000);
  assert.equal(r1.r.body.data.rewardDate, day1);
  assert.equal(r1.r.body.data.rewards[0].dateKey, day1);
  const r2 = await play(e, p, "tetris", TETRIS_OK, 3 * 60000);   // 這一場在隔天開始
  const day2 = taipeiDateKey(new Date(e.clock.t - 3 * 60000));
  assert.notEqual(day1, day2);
  assert.equal(r2.r.body.data.rewardDate, day2);
  assert.ok(r2.r.body.data.rewards.some((x) => x.type === "daily_play" && x.dateKey === day2), "隔天第一場再 +30");
});

test("重送同一場：回傳同一結果、不重複入帳；同編號不同內容 → 409", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "重送甲");
  const { r, body } = await play(e, p, "tetris", TETRIS_OK, 120000);
  const again = await e.call("POST", "/v1/scores", body);
  assert.equal(again.status, 200); assert.equal(again.body.data.replayed, true);
  assert.deepEqual(again.body.data.rewards, r.body.data.rewards);
  const changed = await e.call("POST", "/v1/scores", { ...body, scoreData: { ...TETRIS_OK, score: 2500 } });
  assert.equal(changed.status, 409);
  assert.equal(invariant(e.db, p), 40);
});

test("資料已寫入但回應中斷：重送會把沒做完的補齊，但不會重複加幣", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "中斷甲");
  const sid = await session(e.call, p, "tetris");
  e.clock.t += 120000;
  const body = submitBody(p, "tetris", sid, TETRIS_OK);
  // 錢包寫入成功後網路中斷 → 第一次請求失敗
  const off = e.db.fault((q) => (q.method === "PUT" && q.path.startsWith("wallets/") ? { afterCommit: "network" } : undefined));
  const first = await e.call("POST", "/v1/scores", body);
  assert.ok(first.status >= 500, "第一次回應失敗：" + first.status);
  off();
  const retry = await e.call("POST", "/v1/scores", body);
  assert.equal(retry.status, 200); assert.equal(retry.body.data.replayed, true);
  assert.equal(retry.body.data.balance, 40);
  assert.equal(invariant(e.db, p), 40);
  assert.equal(e.db.get(`scores/${body.submissionId}`).applied.rewards, "applied");
});

test("同時請求：同一筆送兩次、不同遊戲同時搶 +30 → 都只入帳一次", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "並發甲");
  const sid = await session(e.call, p, "tetris");
  e.clock.t += 120000;
  const body = submitBody(p, "tetris", sid, TETRIS_OK);
  e.db.holdUntil((q) => q.method === "GET" && q.path === `scores/${body.submissionId}`, 2);
  const [x, y] = await Promise.all([e.call("POST", "/v1/scores", body), e.call("POST", "/v1/scores", body)]);
  assert.deepEqual([x.status, y.status].sort(), [200, 201]);
  assert.equal(invariant(e.db, p), 40);
  // 另一位玩家：方塊與節奏同時提交，兩邊都想領今天的 +30
  const q = await newPlayer(e.call, "並發乙", "girl1");
  const s1 = await session(e.call, q, "tetris"), s2 = await session(e.call, q, "rhythm");
  e.clock.t += 200000;
  e.db.holdUntil((r) => r.method === "GET" && r.path === `wallets/${q}`, 2);
  const [m, n] = await Promise.all([
    e.call("POST", "/v1/scores", submitBody(q, "tetris", s1, TETRIS_OK)),
    e.call("POST", "/v1/scores", submitBody(q, "rhythm", s2, rhythmData())),
  ]);
  assert.equal(m.status, 201); assert.equal(n.status, 201);
  const daily = Object.values(e.db.get(`wallets/${q}`).ledger).filter((t) => t.type === "daily_play");
  assert.equal(daily.length, 1, "+30 只有一筆");
  assert.equal(invariant(e.db, q), 50);
});

/* ───────── 待審核與管理員 ───────── */
test("待審核：不入榜、不發幣；管理員接受後入榜並依原本遊玩日期補發；重複審核不重複發", async () => {
  const e = setup(ON, Date.now() - 2 * 86400000);   // 兩天前遊玩；管理員憑證用真實時間，所以審核時把時鐘調回現在
  const p = await newPlayer(e.call, "審核甲");
  const { r } = await play(e, p, "rhythm", rhythmData(), 20000);   // 歌曲還沒播完就結算 → 可疑
  assert.equal(r.body.data.status, "pending_review"); assert.ok(r.body.data.reasons.includes("rhythm_too_short"));
  assert.equal((await e.call("GET", "/v1/leaderboards/rhythm/song005--normal")).body.data.total, 0);
  assert.equal(invariant(e.db, p), 0);
  const playDay = r.body.data.rewardDate;
  e.clock.t = Date.now();   // 兩天後才審核
  const list = await e.admin("GET", "/v1/admin/scores?status=pending_review");
  assert.equal(list.status, 200); assert.equal(list.body.data.rows.length, 1);
  const ok1 = await e.admin("POST", `/v1/admin/scores/${r.body.data.submissionId}/review`, { decision: "accept", note: "家長在旁邊確認" });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.body)); assert.equal(ok1.body.data.status, "accepted");
  assert.ok(ok1.body.data.rewards.every((x) => x.dateKey === playDay), "補發日期＝原本遊玩日期");
  assert.equal((await e.call("GET", "/v1/leaderboards/rhythm/song005--normal")).body.data.total, 1);
  const ok2 = await e.admin("POST", `/v1/admin/scores/${r.body.data.submissionId}/review`, { decision: "accept" });
  assert.equal(ok2.body.data.replayed, true);
  assert.equal(invariant(e.db, p), 40);
  const flip = await e.admin("POST", `/v1/admin/scores/${r.body.data.submissionId}/review`, { decision: "reject" });
  assert.equal(flip.status, 409, "已接受的成績不能再改成拒絕");
  const audits = (await e.admin("GET", "/v1/admin/audits")).body.data.rows;
  assert.equal(audits.length, 1); assert.equal(audits[0].by, ADMIN_UID);
  assert.equal(Object.keys(e.db.get("scoreIndex/pending") || {}).length, 0, "待審核清單已清空");
});

test("管理員拒絕可疑成績：不入榜、不發幣", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "審核乙");
  const { r } = await play(e, p, "quiz", quizData("low", "math"), 1000);
  assert.equal(r.body.data.status, "pending_review");
  const rej = await e.admin("POST", `/v1/admin/scores/${r.body.data.submissionId}/review`, { decision: "reject", note: "太快" });
  assert.equal(rej.body.data.status, "rejected");
  assert.equal((await e.call("GET", "/v1/leaderboards/quiz/main")).body.data.total, 0);
  assert.equal(invariant(e.db, p), 0);
});

test("管理 API：非管理員不能使用；CSV 匯出成績與 V幣帳本（防公式注入）", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "=CMD()");
  await play(e, p, "tetris", TETRIS_OK, 120000);
  assert.equal((await e.call("GET", "/v1/admin/scores")).status, 401);
  assert.equal((await e.call("GET", "/v1/admin/exports/scores.csv")).status, 401);
  const csv = await e.admin("GET", "/v1/admin/exports/scores.csv");
  assert.equal(csv.status, 200); assert.match(csv.headers.get("content-type"), /text\/csv/);
  const lines = csv.text.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines.length, 2); assert.match(lines[0], /^submissionId,receivedAt,gameId,playerId,displayId,status,score/);
  assert.match(lines[1], /,'=CMD\(\),accepted,2400,/);
  const ledger = await e.admin("GET", `/v1/admin/exports/ledger.csv?playerId=${p}`);
  assert.equal(ledger.text.replace(/^﻿/, "").trim().split("\r\n").length, 3);
  const one = await e.admin("GET", `/v1/admin/wallet/${p}/ledger`);
  assert.equal(one.body.data.balance, 40);
});

test("讀取錯誤：排行榜不存在 → 404；遊戲代碼錯 → 404", async () => {
  const e = setup();
  assert.equal((await e.call("GET", "/v1/leaderboards/quiz/extra")).status, 404);
  assert.equal((await e.call("GET", "/v1/leaderboards/lobby/total")).status, 404);
  assert.equal((await e.call("GET", "/v1/players/p_aaaaaaaaaaaaaaaaaaaa/quiz-progress")).body.data.rev, 0);
});

test("Firebase 逾時：提交回 504，不會產生半套獎勵；之後重送成功", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "逾時甲");
  const sid = await session(e.call, p, "tetris");
  e.clock.t += 120000;
  const body = submitBody(p, "tetris", sid, TETRIS_OK);
  const off = e.db.fault((q) => (q.path.startsWith("leaderboards/") ? { throw: "hang" } : undefined));
  const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: sa.json, FIREBASE_TIMEOUT_MS: "1000", ...ON });
  const a = app({ fetch: e.db.fetch, now: () => e.clock.t });
  const res = await a.fetch(req("/v1/scores", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": "10.77.0.1" }, body: JSON.stringify(body) }), env);
  assert.equal(res.status, 504);
  off();
  assert.equal(e.db.get("wallets"), null, "入榜失敗時還沒發獎勵");
  const retry = await e.call("POST", "/v1/scores", body);
  assert.equal(retry.status, 200); assert.equal(retry.body.data.balance, 40);
  assert.equal(invariant(e.db, p), 40);
});

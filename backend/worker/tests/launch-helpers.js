// v0.3.1 測試共用工具（本機模擬：Worker 程式＋假 Firebase）
import assert from "node:assert/strict";
import { app, req, baseEnv, fakeServiceAccount, ORIGIN, newRsaKey, staticJwks, makeIdToken, ADMIN_UID } from "./helpers.js";
import { createFakeRtdb } from "./fake-rtdb.js";
import { RHYTHM_SONGS } from "../src/launch/rhythm-songs.js";
export const sa = await fakeServiceAccount();
export const key = await newRsaKey("kid-launch");
export const ON = { SCORES_ENABLED: "on", REWARDS_ENABLED: "on" };

export function setup(extraEnv = ON, startMs = Date.now(), existingDb = null) {
  const db = existingDb || createFakeRtdb();
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
export const rid = () => crypto.randomUUID();
export async function newPlayer(call, name, avatar = "boy1") {
  const r = await call("POST", "/v1/players", { displayId: name, baseAvatarKey: avatar, createRequestId: rid() });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data.player.playerId;
}
export async function session(call, playerId, gameId, gameVersion = "test-1") {
  const r = await call("POST", "/v1/sessions", { playerId, gameId, gameVersion });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data.sessionId;
}
export function submitBody(playerId, gameId, sessionId, scoreData, submissionId = rid(), gameVersion = "test-1") {
  return { schemaVersion: 1, submissionId, sessionId, playerId, gameId, gameVersion, mode: "production", scoreData };
}
/** 開一場、等 ms、提交 */
export async function play(env, playerId, gameId, scoreData, waitMs, opts = {}) {
  const sid = await session(env.call, playerId, gameId);
  env.clock.t += waitMs;
  const body = submitBody(playerId, gameId, sid, scoreData, opts.submissionId);
  const r = await env.call("POST", "/v1/scores", body);
  return { r, body, sid };
}
export const TETRIS_OK = { score: 2400, level: 2, lines: 12, peakCombo: 3, difficulty: "normal" };   // 滿足所有方塊今日挑戰條件
export function rhythmData(songId = "song005", difficulty = "normal", perfectRatio = 0.9) {
  const total = RHYTHM_SONGS[songId].notes[difficulty];
  const perfect = Math.floor(total * perfectRatio), good = total - perfect - 2, miss = 2;
  const acc = Math.round((perfect + good * 0.5) / total * 100);
  const grade = acc >= 95 ? "S" : acc >= 88 ? "A+" : acc >= 80 ? "A" : acc >= 68 ? "B" : acc >= 55 ? "C" : acc >= 40 ? "D" : "E";
  return { songId, difficulty, score: perfect * 300 + good * 150 + 100, maxCombo: Math.min(60, perfect + good), perfect, good, miss, accuracy: acc, grade };
}
export function quizData(gradeBand, subject, correct = 8) {
  // 依原版：連續答對；這裡用「前 correct 題全對、後面全錯」
  let score = 0; for (let k = 1; k <= correct; k++) score += 100 + Math.min((k - 1) * 10, 50);
  return { gradeBand, subject, score, correctCount: correct, totalQuestions: 10, maxCombo: correct, accuracy: Number((correct / 10).toFixed(4)), timeUsedTotal: 42000 };
}
export const advData = (extra = {}) => ({ continentId: 1, total: 7350, rank: "B", scoreVersion: "adventure-score-v2-test", complete: true, bossDefeated: true,
  parts: { collect: 2500, explore: 1500, combat: 1600, survival: 1000, efficiency: 700 }, chainBonus: 50,
  stages: ["1-1", "1-2b", "1-3", "2-1", "2-2", "2-3", "2-4"], stageClearSec: { "1-1": 40, "1-2b": 35, "1-3": 50, "2-1": 30, "2-2": 40, "2-3": 45, "2-4": 50 }, ...extra });
export function invariant(db, playerId) {
  const w = db.get(`wallets/${playerId}`);
  if (!w) return 0;
  const sum = Object.values(w.ledger || {}).reduce((s, tx) => s + tx.amount, 0);
  assert.equal(w.balance, sum, "餘額必須等於帳本加總");
  assert.equal(Object.keys(w.claims || {}).length, Object.keys(w.ledger || {}).length, "每個領獎標記對應一筆帳本");
  return w.balance;
}


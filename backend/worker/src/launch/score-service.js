/**
 * 正式成績（GameSession／ScoreService／GameLogService）
 *
 * 流程：
 *   1. 遊戲開始：POST /v1/sessions → 伺服器建立場次 sessions/{sessionId}（記錄伺服器開始時間）
 *   2. 遊戲完成：POST /v1/scores（帶 sessionId、唯一 submissionId）
 *      → 檢查玩家、遊戲、版本、場次（同一位玩家、同一款遊戲、未過期、只能用一次）、重複提交、
 *        分數與時間合理性、遊戲完成條件（見 game-rules.js）
 *      → accepted：入榜＋發獎勵；pending_review：不入榜、不發幣，等管理員；rejected：不入榜
 *   3. 管理員審核待審成績：接受 → 入榜＋依原本遊玩日期補發獎勵（重複審核不會重複發）
 *
 * 資料（新 Firebase balloon-v-universe；舊 Firebase 完全不使用）：
 *   sessions/{sessionId}            場次
 *   scores/{submissionId}           成績紀錄（GameLog）
 *   scoreIndex/byGame/{gameId}/{submissionId}、scoreIndex/byPlayer/{playerId}/{submissionId}、
 *   scoreIndex/pending/{submissionId}   管理查詢用索引
 *   adminAudit/{auditId}            審核紀錄
 *
 * 一致性：
 *   - 場次只能被一個 submissionId 使用（sessions 節點 CAS）
 *   - 成績紀錄「只在不存在時建立」（ETag），同一 submissionId 重送 → 回傳同一個結果
 *   - 入榜、發獎勵都是冪等的「補齊」動作（reconcile）：回應中斷後重送，會把沒做完的做完，但不會做第二次
 */
import { ApiError } from "../utils/errors.js";
import { assertValid, PATTERNS } from "../utils/validate.js";
import { taipeiDateKey } from "../utils/ids.js";
import { casUpdate } from "./cas.js";
import { GAME_RULES } from "./game-rules.js";
import { createLeaderboardService } from "./leaderboard-service.js";
import { createWalletService } from "./wallet-service.js";

export const SESSION_TTL_MS = 6 * 3600 * 1000;
export const SCORE_SCHEMA_VERSION = 1;
const GAME_VERSION = /^[A-Za-z0-9._+-]{1,80}$/;
export const paths = Object.freeze({
  session: (id) => `sessions/${id}`,
  score: (id) => `scores/${id}`,
  byGame: (g, id) => `scoreIndex/byGame/${g}/${id}`,
  byPlayer: (p, id) => `scoreIndex/byPlayer/${p}/${id}`,
  pending: (id) => `scoreIndex/pending/${id}`,
  audit: (id) => `adminAudit/${id}`,
  profile: (p) => `players/${p}/profile`,
});

export const SESSION_SCHEMA = Object.freeze({
  playerId: { type: "string", required: true, pattern: PATTERNS.playerId },
  gameId: { type: "string", required: true, enum: Object.keys(GAME_RULES) },
  gameVersion: { type: "string", required: true, pattern: GAME_VERSION },
  mode: { type: "string", required: false, enum: ["official"] },
});
export const SCORE_ENVELOPE = Object.freeze({
  schemaVersion: { type: "integer", required: false, min: 1, max: 1 },
  submissionId: { type: "string", required: true, pattern: PATTERNS.submissionId },
  sessionId: { type: "string", required: true, pattern: /^s_[A-Za-z0-9_-]{16,64}$/ },
  playerId: { type: "string", required: true, pattern: PATTERNS.playerId },
  gameId: { type: "string", required: true, enum: Object.keys(GAME_RULES) },
  gameVersion: { type: "string", required: true, pattern: GAME_VERSION },
  mode: { type: "string", required: false, enum: ["official", "production"] },
  startedAt: { type: "string", required: false, max: 40 },
  finishedAt: { type: "string", required: false, max: 40 },
  scoreData: { type: "object", required: true, maxKeys: 24 },
  client: { type: "object", required: false, maxKeys: 8 },
});

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
const yyyymmdd = (dateKey) => dateKey.replace(/-/g, "");

/** 回應給遊戲的成績結果（固定欄位） */
export function toPublicScore(s, extra = {}) {
  return {
    submissionId: s.submissionId, gameId: s.gameId, playerId: s.playerId, status: s.status, reasons: s.reasons || [],
    score: s.primaryScore, rewardDate: s.rewardDate, receivedAt: new Date(s.receivedAt).toISOString(),
    serverConfirmed: s.status === "accepted", ...extra,
  };
}

export function createScoreService({ db, now, newId, logger }) {
  const lb = createLeaderboardService({ db, now });
  const wallet = createWalletService({ db, now });

  async function getProfile(playerId) {
    const p = await db.get(paths.profile(playerId));
    if (!p || p.playerId !== playerId) throw new ApiError("PLAYER_NOT_FOUND");
    if (p.status && p.status !== "active") throw new ApiError("FORBIDDEN", { message: "這位玩家目前無法提交成績" });
    return p;
  }

  /** 已接受成績的補齊動作：入榜＋獎勵（重複執行安全） */
  async function reconcile(score, { rewardsEnabled }) {
    if (score.status !== "accepted") return { boards: [], rewards: [], balance: null };
    const profile = await getProfile(score.playerId);
    const boards = await lb.applyScore(score, profile);
    let rewards = [], balance = null, rewardState = "disabled";
    if (rewardsEnabled) {
      const w = await wallet.awardForScore(score);
      rewards = w.awarded.map((tx) => ({ txId: tx.txId, type: tx.type, amount: tx.amount, dateKey: tx.dateKey, balanceAfter: tx.balanceAfter }));
      balance = w.balance; rewardState = "applied";
    }
    await db.patch(paths.score(score.submissionId), { applied: { boards: true, rewards: rewardState, at: now() } });
    return { boards, rewards, balance, rewardState };
  }

  return {
    async startSession(body, client) {
      const v = assertValid(body, SESSION_SCHEMA);
      if (client && client.gameId && client.gameId !== v.gameId) {
        throw new ApiError("VALIDATION_FAILED", { details: { errors: [{ field: "gameId", issue: "與 X-BV-Client 標頭不一致" }] } });
      }
      await getProfile(v.playerId);
      const t = now();
      const sessionId = "s_" + newId().replace(/-/g, "");
      const rec = { sessionId, playerId: v.playerId, gameId: v.gameId, gameVersion: v.gameVersion, startedAt: t, expiresAt: t + SESSION_TTL_MS, status: "open" };
      await db.put(paths.session(sessionId), rec);
      return { sessionId, startedAt: new Date(t).toISOString(), expiresAt: new Date(rec.expiresAt).toISOString(), rewardDate: taipeiDateKey(new Date(t)) };
    },

    async submit(body, flags) {
      const env = assertValid(body, SCORE_ENVELOPE);
      const rules = GAME_RULES[env.gameId];
      const data = assertValid(env.scoreData, rules.schema);
      const bodyHash = (await sha(stable({ s: env.sessionId, p: env.playerId, g: env.gameId, d: data }))).slice(0, 32);

      // 重送：同一 submissionId 已經存在
      const existing = await db.get(paths.score(env.submissionId));
      if (existing) {
        if (existing.bodyHash !== bodyHash) throw new ApiError("DUPLICATE_SUBMISSION", { message: "這個成績編號已經用過，內容不同" });
        const rec = await reconcile(existing, flags);
        return toPublicScore(existing, { replayed: true, ...rec });
      }

      // 場次：同一位玩家、同一款遊戲、未過期、只能給一筆成績使用
      const t = now();
      const claim = await casUpdate(db, paths.session(env.sessionId), (s) => {
        if (!s) throw new ApiError("VALIDATION_FAILED", { message: "找不到這場遊戲的場次，請重新開始一局", details: { errors: [{ field: "sessionId", issue: "not_found" }] } });
        if (s.playerId !== env.playerId || s.gameId !== env.gameId) throw new ApiError("FORBIDDEN", { message: "場次與玩家或遊戲不符" });
        if (s.status === "used" && s.submissionId !== env.submissionId) throw new ApiError("DUPLICATE_SUBMISSION", { message: "這場遊戲已經提交過成績" });
        if (s.status === "used") return { result: s };
        if (t > s.expiresAt) throw new ApiError("VALIDATION_FAILED", { message: "這場遊戲的場次已過期，請重新開始一局", details: { errors: [{ field: "sessionId", issue: "expired" }] } });
        const next = { ...s, status: "used", submissionId: env.submissionId, usedAt: t };
        return { value: next, result: next };
      });
      const session = claim.result;
      const profile = await getProfile(env.playerId);

      const serverDurationMs = Math.max(0, (session.usedAt || t) - session.startedAt);
      const rewardDate = taipeiDateKey(new Date(session.startedAt));
      let verdict;
      try {
        verdict = rules.check(data, { serverDurationMs, yyyymmdd: yyyymmdd(rewardDate), now: t });
      } catch (e) {
        logger?.warn("score rule error", { gameId: env.gameId });
        verdict = { status: "pending_review", reasons: ["rule_error"], boards: [], challenge: { eligible: false } };
      }
      if (session.gameVersion !== env.gameVersion) {
        verdict = { ...verdict, status: verdict.status === "rejected" ? "rejected" : "pending_review", reasons: [...(verdict.reasons || []), "game_version_changed_mid_session"] };
      }
      const primary = (verdict.boards && verdict.boards[0] && verdict.boards[0].score) ?? data.score ?? data.total ?? 0;
      const score = {
        schemaVersion: SCORE_SCHEMA_VERSION, submissionId: env.submissionId, sessionId: env.sessionId, playerId: env.playerId,
        displayId: profile.displayId, gameId: env.gameId, gameVersion: env.gameVersion, scoreData: data, primaryScore: primary,
        status: verdict.status, reasons: verdict.reasons || [], boards: verdict.boards || [], challenge: verdict.challenge || { eligible: false },
        sessionStartedAt: session.startedAt, receivedAt: t, serverDurationMs, rewardDate, bodyHash,
        clientStartedAt: env.startedAt || null, clientFinishedAt: env.finishedAt || null,
      };
      // 只在不存在時建立（兩個請求同時送同一筆：只有一個成功，另一個走重送路徑）
      const created = await casUpdate(db, paths.score(env.submissionId), (cur) => (cur ? { result: cur } : { value: score, result: score }));
      const stored = created.result;
      if (!created.written) {
        if (stored.bodyHash !== bodyHash) throw new ApiError("DUPLICATE_SUBMISSION");
        return toPublicScore(stored, { replayed: true, ...(await reconcile(stored, flags)) });
      }
      const idx = { playerId: score.playerId, gameId: score.gameId, status: score.status, score: primary, receivedAt: t };
      await db.patch("scoreIndex", {
        [`byGame/${score.gameId}/${score.submissionId}`]: idx,
        [`byPlayer/${score.playerId}/${score.submissionId}`]: idx,
        ...(score.status === "pending_review" ? { [`pending/${score.submissionId}`]: idx } : {}),
      });
      const rec = await reconcile(score, flags);
      return toPublicScore(score, { replayed: false, ...rec });
    },

    /** 管理員審核：pending_review → accepted／rejected；同一筆重複審核不會重複發獎勵 */
    async review(submissionId, { decision, note }, admin, flags) {
      if (!["accept", "reject"].includes(decision)) throw new ApiError("VALIDATION_FAILED", { details: { errors: [{ field: "decision", issue: "accept 或 reject" }] } });
      const target = decision === "accept" ? "accepted" : "rejected";
      const t = now();
      const r = await casUpdate(db, paths.score(submissionId), (s) => {
        if (!s) throw new ApiError("NOT_FOUND", { message: "找不到這筆成績" });
        if (s.status === target && s.review) return { result: { s, replayed: true } };
        if (s.status !== "pending_review") throw new ApiError("CONFLICT", { message: `這筆成績已是 ${s.status}，不能改成 ${target}` });
        const next = { ...s, status: target, review: { decision, note: String(note || "").slice(0, 200), by: admin.uid, at: t, previousStatus: s.status } };
        return { value: next, result: { s: next, replayed: false } };
      });
      const s = r.result.s;
      if (!r.result.replayed) {
        const idx = { playerId: s.playerId, gameId: s.gameId, status: s.status, score: s.primaryScore, receivedAt: s.receivedAt };
        await db.patch("scoreIndex", { [`byGame/${s.gameId}/${s.submissionId}`]: idx, [`byPlayer/${s.playerId}/${s.submissionId}`]: idx, [`pending/${s.submissionId}`]: null });
        await db.put(paths.audit(`${submissionId}_${decision}`), { submissionId, decision, note: s.review.note, by: admin.uid, at: t, gameId: s.gameId, playerId: s.playerId, score: s.primaryScore, reasons: s.reasons || [] });
      }
      const rec = await reconcile(s, flags);
      return toPublicScore(s, { review: s.review, replayed: r.result.replayed, ...rec });
    },

    async list({ gameId, playerId, status, limit = 100 }) {
      let idx;
      if (playerId) idx = (await db.get(`scoreIndex/byPlayer/${playerId}`)) || {};
      else if (status === "pending_review") idx = (await db.get("scoreIndex/pending")) || {};
      else if (gameId) idx = (await db.get(`scoreIndex/byGame/${gameId}`)) || {};
      else {
        const all = (await db.get("scoreIndex/byGame")) || {};
        idx = Object.assign({}, ...Object.values(all));
      }
      let rows = Object.entries(idx).map(([submissionId, v]) => ({ submissionId, ...v }));
      if (gameId) rows = rows.filter((r) => r.gameId === gameId);
      if (status) rows = rows.filter((r) => r.status === status);
      rows.sort((a, b) => b.receivedAt - a.receivedAt);
      return rows.slice(0, Math.min(limit, 1000));
    },

    async getFull(submissionId) {
      const s = await db.get(paths.score(submissionId));
      if (!s) throw new ApiError("NOT_FOUND", { message: "找不到這筆成績" });
      return s;
    },

    async audits() {
      const a = (await db.get("adminAudit")) || {};
      return Object.values(a).sort((x, y) => y.at - x.at).slice(0, 500);
    },

    leaderboards: lb,
    wallet,
  };
}

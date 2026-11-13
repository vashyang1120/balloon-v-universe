/**
 * v0.3.0 正式上線 API：場次、成績、排行榜、錢包、管理審核（見 src/launch/*）
 *
 * 公開（不需登入；playerId 不是授權，只用來歸屬資料）：
 *   POST /v1/sessions                              遊戲開始：取得場次（SCORES_ENABLED=on 才開放）
 *   POST /v1/scores                                遊戲完成：提交成績（SCORES_ENABLED=on 才開放）
 *   GET  /v1/leaderboards                          排行榜目錄（四款遊戲各自的榜）
 *   GET  /v1/leaderboards/:gameId/:boardId         排行榜（?limit=50&playerId=p_… 會附上自己的名次）
 *   GET  /v1/players/:playerId/quiz-progress       問答各科個人最佳（V學園成績單用）
 *   GET  /v1/wallet/:playerId                      V幣餘額、今日領獎狀態、最近紀錄（唯讀）
 *   GET  /v1/launch/status                         功能狀態（成績／獎勵是否已啟用）
 * 管理員（Google 登入＋伺服器 ADMIN_UIDS 名單）：
 *   GET  /v1/admin/scores?gameId=&playerId=&status=&limit=
 *   GET  /v1/admin/scores/:submissionId
 *   POST /v1/admin/scores/:submissionId/review     { decision: "accept"|"reject", note }
 *   GET  /v1/admin/audits
 *   GET  /v1/admin/wallet/:playerId/ledger
 *   GET  /v1/admin/exports/scores.csv?gameId=&playerId=&status=
 *   GET  /v1/admin/exports/ledger.csv?playerId=
 * 預留：V幣消費與 PIN（/v1/shop/*、/v1/wallet/:playerId/pin）一律 501，消費功能準備好前維持停用。
 */
import { ok, json } from "../utils/response.js";
import { ApiError } from "../utils/errors.js";
import { PATTERNS } from "../utils/validate.js";
import { readJson } from "../middleware/body.js";
import { enforceRateLimit } from "../middleware/rate-limit.js";
import { taipeiDateKey } from "../utils/ids.js";
import { createScoreService } from "../launch/score-service.js";
import { boardCatalog, isValidBoard } from "../launch/leaderboard-service.js";
import { OFFICIAL_GAME_IDS } from "../launch/game-rules.js";
import { REWARD_RULES } from "../launch/wallet-service.js";

const MAX_BODY = 8 * 1024;

function svc(ctx) {
  return createScoreService({ db: lazyDb(ctx), now: ctx.now || (() => Date.now()), newId: () => crypto.randomUUID(), logger: ctx.logger });
}
/** 延後取得資料庫：輸入格式錯誤時不需要（也不會觸碰）Firebase */
function lazyDb(ctx) {
  const d = () => ctx.firebase();
  return { get: (...a) => d().get(...a), getWithEtag: (...a) => d().getWithEtag(...a), putIfMatch: (...a) => d().putIfMatch(...a),
    put: (...a) => d().put(...a), patch: (...a) => d().patch(...a) };
}
function flags(ctx) { return { scoresEnabled: ctx.cfg.scoresEnabled, rewardsEnabled: ctx.cfg.rewardsEnabled }; }
function requireScores(ctx) {
  if (!ctx.cfg.scoresEnabled) throw new ApiError("SERVICE_DISABLED", { details: { feature: "scores", hint: "正式成績服務尚未啟用（SCORES_ENABLED=off）" } });
}
function playerParam(ctx) {
  const id = ctx.params.playerId;
  if (!PATTERNS.playerId.test(String(id))) throw new ApiError("VALIDATION_FAILED", { details: { errors: [{ field: "playerId", issue: "格式不正確" }] } });
  return id;
}
function csvCell(v) {
  if (v == null) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // 避免試算表公式注入
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(header, rows) {
  return "﻿" + [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\r\n") + "\r\n";
}
function csvResponse(name, text) {
  return new Response(text, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
const iso = (t) => (t ? new Date(t).toISOString() : "");

export function launchRoutes() {
  return [
    {
      method: "GET", path: "/v1/launch/status", auth: "public", summary: "正式功能狀態",
      handler: (ctx) => ok(ctx, {
        scores: ctx.cfg.scoresEnabled ? "enabled" : "disabled",
        rewards: ctx.cfg.rewardsEnabled ? "enabled" : "disabled",
        spending: "disabled",
        games: OFFICIAL_GAME_IDS,
        rewardRules: { dailyPlay: REWARD_RULES.daily.amount, dailyChallenge: REWARD_RULES.challenge.amount, challengeGames: REWARD_RULES.challenge.games, timezone: "Asia/Taipei" },
        today: taipeiDateKey(new Date(ctx.now ? ctx.now() : Date.now())),
      }),
    },
    {
      method: "POST", path: "/v1/sessions", auth: "public", summary: "遊戲開始：取得場次",
      handler: async (ctx) => {
        requireScores(ctx);
        await enforceRateLimit(ctx, "score");
        const body = await readJson(ctx.request, MAX_BODY);
        return ok(ctx, await svc(ctx).startSession(body, ctx.client), 201);
      },
    },
    {
      method: "POST", path: "/v1/scores", auth: "public", summary: "遊戲完成：提交成績",
      handler: async (ctx) => {
        requireScores(ctx);
        await enforceRateLimit(ctx, "score");
        const body = await readJson(ctx.request, MAX_BODY);
        const r = await svc(ctx).submit(body, flags(ctx));
        return ok(ctx, r, r.replayed ? 200 : 201);
      },
    },
    {
      method: "GET", path: "/v1/leaderboards", auth: "public", summary: "排行榜目錄",
      handler: (ctx) => ok(ctx, { games: boardCatalog(), scores: ctx.cfg.scoresEnabled ? "enabled" : "disabled" }, 200, { "cache-control": "public, max-age=60" }),
    },
    {
      method: "GET", path: "/v1/leaderboards/:gameId/:boardId", auth: "public", summary: "排行榜",
      handler: async (ctx) => {
        await enforceRateLimit(ctx, "read");
        const { gameId, boardId } = ctx.params;
        if (!OFFICIAL_GAME_IDS.includes(gameId) || !isValidBoard(gameId, boardId)) throw new ApiError("NOT_FOUND", { message: "沒有這個排行榜" });
        const limit = Math.min(Math.max(parseInt(ctx.url.searchParams.get("limit") || "50", 10) || 50, 1), 100);
        const pid = ctx.url.searchParams.get("playerId");
        const board = await svc(ctx).leaderboards.getBoard(gameId, boardId, { limit, playerId: PATTERNS.playerId.test(String(pid)) ? pid : undefined });
        return ok(ctx, { ...board, official: true, scores: ctx.cfg.scoresEnabled ? "enabled" : "disabled" }, 200, { "cache-control": "public, max-age=15" });
      },
    },
    {
      method: "GET", path: "/v1/players/:playerId/quiz-progress", auth: "public", summary: "問答各科個人最佳",
      handler: async (ctx) => {
        await enforceRateLimit(ctx, "read");
        return ok(ctx, await svc(ctx).leaderboards.getQuizProgress(playerParam(ctx)));
      },
    },
    {
      method: "*", path: "/v1/wallet/:playerId/pin", auth: "public", summary: "預留：六位數消費 PIN",
      handler: () => { throw new ApiError("NOT_IMPLEMENTED", { details: { category: "wallet-pin", note: "V幣消費尚未開放；PIN 只會以伺服器雜湊保存，不會由 ID＋頭像重設" } }); },
    },
    {
      method: "GET", path: "/v1/wallet/:playerId", auth: "public", summary: "V幣餘額與紀錄（唯讀）",
      handler: async (ctx) => {
        await enforceRateLimit(ctx, "read");
        const today = taipeiDateKey(new Date(ctx.now ? ctx.now() : Date.now()));
        const w = await svc(ctx).wallet.getPublicSummary(playerParam(ctx), today);
        return ok(ctx, { ...w, rewards: ctx.cfg.rewardsEnabled ? "enabled" : "disabled" });
      },
    },
    /* ---------- 管理員 ---------- */
    {
      method: "GET", path: "/v1/admin/scores", auth: "admin", summary: "成績紀錄查詢",
      handler: async (ctx) => {
        const q = ctx.url.searchParams;
        const gameId = q.get("gameId") || undefined, playerId = q.get("playerId") || undefined, status = q.get("status") || undefined;
        if (gameId && !OFFICIAL_GAME_IDS.includes(gameId)) throw new ApiError("UNKNOWN_GAME");
        if (playerId && !PATTERNS.playerId.test(playerId)) throw new ApiError("VALIDATION_FAILED");
        if (status && !["accepted", "pending_review", "rejected"].includes(status)) throw new ApiError("VALIDATION_FAILED");
        const limit = Math.min(parseInt(q.get("limit") || "200", 10) || 200, 1000);
        return ok(ctx, { rows: await svc(ctx).list({ gameId, playerId, status, limit }) });
      },
    },
    {
      method: "GET", path: "/v1/admin/scores/:submissionId", auth: "admin", summary: "成績詳細",
      handler: async (ctx) => {
        if (!PATTERNS.submissionId.test(ctx.params.submissionId)) throw new ApiError("VALIDATION_FAILED");
        return ok(ctx, await svc(ctx).getFull(ctx.params.submissionId));
      },
    },
    {
      method: "POST", path: "/v1/admin/scores/:submissionId/review", auth: "admin", summary: "人工審核",
      handler: async (ctx) => {
        if (!PATTERNS.submissionId.test(ctx.params.submissionId)) throw new ApiError("VALIDATION_FAILED");
        const body = await readJson(ctx.request, 2048);
        return ok(ctx, await svc(ctx).review(ctx.params.submissionId, { decision: body && body.decision, note: body && body.note }, ctx.admin, flags(ctx)));
      },
    },
    {
      method: "GET", path: "/v1/admin/audits", auth: "admin", summary: "審核紀錄",
      handler: async (ctx) => ok(ctx, { rows: await svc(ctx).audits() }),
    },
    {
      method: "GET", path: "/v1/admin/wallet/:playerId/ledger", auth: "admin", summary: "V幣帳本",
      handler: async (ctx) => ok(ctx, await svc(ctx).wallet.getLedger(playerParam(ctx))),
    },
    {
      method: "GET", path: "/v1/admin/exports/scores.csv", auth: "admin", summary: "成績 CSV",
      handler: async (ctx) => {
        const q = ctx.url.searchParams;
        const s = svc(ctx);
        const rows = await s.list({ gameId: q.get("gameId") || undefined, playerId: q.get("playerId") || undefined, status: q.get("status") || undefined, limit: 1000 });
        const full = await Promise.all(rows.map((r) => s.getFull(r.submissionId).catch(() => null)));
        const out = full.filter(Boolean).map((f) => ({ submissionId: f.submissionId, receivedAt: iso(f.receivedAt), gameId: f.gameId, playerId: f.playerId, displayId: f.displayId,
          status: f.status, score: f.primaryScore, reasons: (f.reasons || []).join(" "), rewardDate: f.rewardDate, serverDurationSec: Math.round((f.serverDurationMs || 0) / 1000),
          gameVersion: f.gameVersion, scoreData: f.scoreData, reviewDecision: f.review ? f.review.decision : "", reviewBy: f.review ? f.review.by : "", reviewAt: f.review ? iso(f.review.at) : "" }));
        return csvResponse(`scores-${taipeiDateKey()}.csv`, toCsv(["submissionId", "receivedAt", "gameId", "playerId", "displayId", "status", "score", "reasons", "rewardDate", "serverDurationSec", "gameVersion", "scoreData", "reviewDecision", "reviewBy", "reviewAt"], out));
      },
    },
    {
      method: "GET", path: "/v1/admin/exports/ledger.csv", auth: "admin", summary: "V幣帳本 CSV",
      handler: async (ctx) => {
        const pid = ctx.url.searchParams.get("playerId");
        const db = lazyDb(ctx);
        let wallets;
        if (pid) { if (!PATTERNS.playerId.test(pid)) throw new ApiError("VALIDATION_FAILED"); wallets = { [pid]: await db.get(`wallets/${pid}`) }; }
        else wallets = (await db.get("wallets")) || {};
        const rows = [];
        for (const w of Object.values(wallets)) for (const tx of Object.values((w && w.ledger) || {})) rows.push({ ...tx, createdAt: iso(tx.createdAt) });
        rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        return csvResponse(`ledger-${taipeiDateKey()}.csv`, toCsv(["txId", "createdAt", "playerId", "gameId", "type", "dateKey", "amount", "balanceAfter", "sourceSubmissionId", "challengeKey"], rows));
      },
    },
  ];
}

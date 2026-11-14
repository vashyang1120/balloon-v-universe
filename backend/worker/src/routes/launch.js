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
 *
 * v0.3.1 新增：
 *   GET  /v1/collections/catalog                   稱號＋公開展示頭像目錄（私人頭像不列出）
 *   GET  /v1/players/:playerId/collection          這位玩家的稱號、頭像收藏與目前裝備
 *   POST /v1/players/:playerId/equip               裝備稱號／展示頭像 { displayId, baseAvatarKey, titleKey?, displayAvatarKey? }
 *                                                  （需要 ID＋身份頭像；只能選自己已解鎖的；不能改 playerId／baseAvatarKey）
 *   管理員：GET /v1/admin/launch、GET /v1/admin/collections/:playerId、POST /v1/admin/collections/:playerId/avatars、
 *           POST /v1/admin/collections/:playerId/backfill、GET /v1/admin/collection-audits、GET /v1/admin/exports/collections.csv、
 *           POST /v1/admin/selftest（真實資料庫自我檢查，只寫 _selftest/ 並清除）、POST /v1/admin/trial/purge（清除試營運資料）
 *   受控試營運：SCORES_ENABLED="trial" → 只有 TRIAL_PLAYER_IDS 可以寫入，資料全部在 trial/ 底下（見 launch/namespace.js）
 *
 * v0.3.2 管理員「玩家管理中心」：
 *   GET /v1/admin/players/search?q=        用玩家自訂 ID（中文／英文／數字；完全相同優先、再列包含的）或完整 playerId 搜尋
 *                                          同名不同身份圖案＝不同玩家，全部列出，由管理員選擇
 *   GET /v1/admin/players/:playerId/overview  玩家摘要：身份、目前裝備、V幣、成績數、各遊戲個人最佳、收藏數（試營運時讀 trial/）
 *   GET /v1/admin/audits?playerId=、GET /v1/admin/collection-audits?playerId=、GET /v1/admin/exports/collections.csv?playerId=  個人篩選
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
import { namespaceFor, namespacedDb, TRIAL_ROOT } from "../launch/namespace.js";
import { publicCatalog, TITLE_CATALOG, AVATAR_CATALOG, AVATARS_BY_KEY } from "../launch/collection-catalog.js";
import { normalizeDisplayId } from "../players/id-rules.js";

const MAX_BODY = 8 * 1024;

function svc(ctx) {
  return createScoreService({ db: lazyDb(ctx), now: ctx.now || (() => Date.now()), newId: () => crypto.randomUUID(), logger: ctx.logger });
}
/** 延後取得資料庫：輸入格式錯誤時不需要（也不會觸碰）Firebase。試營運時自動套上 trial/ 命名空間 */
function rawLazyDb(ctx) {
  const d = () => ctx.firebase();
  return { get: (...a) => d().get(...a), getWithEtag: (...a) => d().getWithEtag(...a), putIfMatch: (...a) => d().putIfMatch(...a),
    put: (...a) => d().put(...a), patch: (...a) => d().patch(...a), remove: (...a) => d().remove(...a) };
}
function lazyDb(ctx) { return namespacedDb(rawLazyDb(ctx), namespaceFor(ctx.cfg)); }
export function launchDb(ctx) { return lazyDb(ctx); }
function flags(ctx) { return { scoresEnabled: ctx.cfg.scoresMode !== "off", rewardsEnabled: ctx.cfg.rewardsMode !== "off" }; }
/** 這位玩家現在可以寫入正式資料嗎？on＝所有人；trial＝只有名單內；off＝沒有人 */
export function writeAllowed(cfg, playerId) {
  if (cfg.scoresMode === "on") return true;
  if (cfg.scoresMode === "trial") return cfg.trialPlayerIds.includes(playerId);
  return false;
}
function requireScores(ctx, playerId) {
  if (!writeAllowed(ctx.cfg, playerId)) {
    throw new ApiError("SERVICE_DISABLED", { details: { feature: "scores", hint: ctx.cfg.scoresMode === "trial" ? "目前是受控試營運，只有指定的測試玩家可以寫入" : "正式成績服務尚未啟用（SCORES_ENABLED=off）" } });
  }
}
function statusFor(ctx, playerId) {
  const allowed = playerId && PATTERNS.playerId.test(String(playerId)) ? writeAllowed(ctx.cfg, playerId) : ctx.cfg.scoresMode === "on";
  return { scores: allowed ? "enabled" : "disabled", rewards: allowed && ctx.cfg.rewardsMode !== "off" ? "enabled" : "disabled", mode: ctx.cfg.scoresMode };
}
async function profileOf(ctx, playerId) {
  const p = await ctx.firebase().get(`players/${playerId}/profile`);
  if (!p || p.playerId !== playerId || p.status === "deleted") throw new ApiError("PLAYER_NOT_FOUND");
  return p;
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


/**
 * 真實資料庫自我檢查（v0.3.1 驗收階段 2）：在 _selftest/{runId} 底下驗證這個 Worker 依賴的資料庫行為，最後刪除。
 * 不碰任何玩家、成績、排行榜、錢包資料。
 */
async function selfTest(db, now) {
  const runId = "t" + now() + "_" + crypto.randomUUID().slice(0, 8);
  const base = `_selftest/${runId}`;
  const steps = [];
  const step = async (name, fn) => {
    const t0 = Date.now();
    try { const detail = await fn(); steps.push({ name, ok: true, ms: Date.now() - t0, detail: detail || null }); return true; }
    catch (e) { steps.push({ name, ok: false, ms: Date.now() - t0, error: (e && (e.code || e.message)) || "error" }); return false; }
  };
  await step("寫入與讀回", async () => {
    await db.put(`${base}/a`, { v: 1 });
    const r = await db.get(`${base}/a`);
    if (!r || r.v !== 1) throw new Error("讀回內容不一致");
  });
  await step("條件寫入：版本相同時成功", async () => {
    const { etag } = await db.getWithEtag(`${base}/a`);
    if (!etag) throw new Error("沒有取得 ETag");
    await db.putIfMatch(`${base}/a`, { v: 2 }, etag);
  });
  await step("條件寫入：版本過期時被拒絕（防重複發幣的基礎）", async () => {
    const { etag } = await db.getWithEtag(`${base}/a`);
    await db.put(`${base}/a`, { v: 3 });
    try { await db.putIfMatch(`${base}/a`, { v: 99 }, etag); } catch (e) { if (e && e.code === "CONFLICT") return "412 → CONFLICT"; throw e; }
    throw new Error("過期版本仍然寫入成功");
  });
  await step("條件寫入：不存在時才建立", async () => {
    const { value, etag } = await db.getWithEtag(`${base}/new`);
    if (value !== null && value !== undefined) throw new Error("應該不存在");
    await db.putIfMatch(`${base}/new`, { created: true }, etag);
    const again = await db.getWithEtag(`${base}/new`);
    try { await db.putIfMatch(`${base}/new`, { created: "twice" }, etag); } catch (e) { if (e && e.code === "CONFLICT") return again.value && again.value.created === true ? "第二次建立被拒絕" : "?"; throw e; }
    throw new Error("同一個節點被建立兩次");
  });
  await step("同時兩個條件寫入：只有一個成功", async () => {
    const { etag } = await db.getWithEtag(`${base}/race`);
    const rs = await Promise.allSettled([db.putIfMatch(`${base}/race`, { w: "A" }, etag), db.putIfMatch(`${base}/race`, { w: "B" }, etag)]);
    const okN = rs.filter((r) => r.status === "fulfilled").length;
    if (okN !== 1) throw new Error(`成功 ${okN} 個`);
    return "1 成功／1 被拒絕";
  });
  await step("多路徑更新", async () => {
    await db.patch(base, { "m/x": 1, "m/y": 2 });
    const m = await db.get(`${base}/m`);
    if (!m || m.x !== 1 || m.y !== 2) throw new Error("多路徑更新不一致");
  });
  const cleaned = await step("清除測試資料", async () => {
    await db.remove(base);
    const r = await db.get(base);
    if (r !== null && r !== undefined) throw new Error("沒有清除乾淨");
  });
  if (!cleaned) { try { await db.remove(base); } catch { /* 交給管理員 */ } }
  return { runId, ok: steps.every((s) => s.ok), steps };
}


/* v0.3.2 玩家管理中心：管理員看到的玩家列（身份頭像固定；展示頭像與稱號＝目前裝備） */
const HUB_AVATAR_BASE = "https://vashyang1120.github.io/balloon-v-universe/assets/avatars/base/";
function avatarImage(key) {
  const a = key && AVATARS_BY_KEY[key];
  return a ? a.image : key ? HUB_AVATAR_BASE + key + ".png" : "";
}
function adminPlayerRow(p, pub) {
  const disp = (pub && pub.displayAvatarKey) || p.baseAvatarKey;
  return {
    playerId: p.playerId, displayId: p.displayId, baseAvatarKey: p.baseAvatarKey, baseAvatarImage: avatarImage(p.baseAvatarKey),
    displayAvatarKey: disp, displayAvatarImage: avatarImage(disp), displayAvatarName: (AVATARS_BY_KEY[disp] && AVATARS_BY_KEY[disp].name) || null,
    titleName: (pub && pub.titleName) || null, createdAt: iso(p.createdAt),
  };
}
function optionalPlayer(ctx) {
  const v = ctx.url.searchParams.get("playerId");
  if (!v) return null;
  if (!PATTERNS.playerId.test(v)) throw new ApiError("VALIDATION_FAILED", { details: { errors: [{ field: "playerId", issue: "格式不正確" }] } });
  return v;
}

export function launchRoutes() {
  return [
    {
      method: "GET", path: "/v1/launch/status", auth: "public", summary: "正式功能狀態",
      handler: (ctx) => ok(ctx, {
        ...statusFor(ctx, ctx.url.searchParams.get("playerId")),
        spending: "disabled",
        collections: "enabled",
        games: OFFICIAL_GAME_IDS,
        rewardRules: { dailyPlay: REWARD_RULES.daily.amount, dailyChallenge: REWARD_RULES.challenge.amount, challengeGames: REWARD_RULES.challenge.games, timezone: "Asia/Taipei" },
        today: taipeiDateKey(new Date(ctx.now ? ctx.now() : Date.now())),
      }),
    },
    {
      method: "POST", path: "/v1/sessions", auth: "public", summary: "遊戲開始：取得場次",
      handler: async (ctx) => {
        if (ctx.cfg.scoresMode === "off") requireScores(ctx);
        await enforceRateLimit(ctx, "score");
        const body = await readJson(ctx.request, MAX_BODY);
        requireScores(ctx, body && body.playerId);
        return ok(ctx, await svc(ctx).startSession(body, ctx.client), 201);
      },
    },
    {
      method: "POST", path: "/v1/scores", auth: "public", summary: "遊戲完成：提交成績",
      handler: async (ctx) => {
        if (ctx.cfg.scoresMode === "off") requireScores(ctx);
        await enforceRateLimit(ctx, "score");
        const body = await readJson(ctx.request, MAX_BODY);
        requireScores(ctx, body && body.playerId);
        const r = await svc(ctx).submit(body, flags(ctx));
        // mode：trial＝受控試營運（資料在 trial/，畫面必須標示「試營運」，不可當成正式資料）
        return ok(ctx, { ...r, mode: ctx.cfg.scoresMode }, r.replayed ? 200 : 201);
      },
    },
    {
      method: "GET", path: "/v1/leaderboards", auth: "public", summary: "排行榜目錄",
      handler: (ctx) => ok(ctx, { games: boardCatalog(), scores: ctx.cfg.scoresMode === "on" ? "enabled" : "disabled", mode: ctx.cfg.scoresMode }, 200, { "cache-control": "public, max-age=60" }),
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
        return ok(ctx, { ...board, official: true, scores: ctx.cfg.scoresMode === "on" ? "enabled" : "disabled", mode: ctx.cfg.scoresMode }, 200, { "cache-control": "public, max-age=15" });
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
        return ok(ctx, { ...w, rewards: statusFor(ctx, ctx.params.playerId).rewards, mode: ctx.cfg.scoresMode });
      },
    },

    /* ---------- v0.3.1：稱號＋展示頭像收藏 ---------- */
    {
      method: "GET", path: "/v1/collections/catalog", auth: "public", summary: "稱號與公開展示頭像目錄",
      handler: (ctx) => ok(ctx, publicCatalog(), 200, { "cache-control": "public, max-age=300" }),
    },
    {
      method: "GET", path: "/v1/players/:playerId/collection", auth: "public", summary: "玩家的稱號、頭像收藏與目前裝備",
      handler: async (ctx) => {
        await enforceRateLimit(ctx, "read");
        const pid = playerParam(ctx);
        const profile = await profileOf(ctx, pid);
        const view = await svc(ctx).collections.get(pid, profile);
        return ok(ctx, { ...view, canEquip: writeAllowed(ctx.cfg, pid), mode: ctx.cfg.scoresMode });
      },
    },
    {
      method: "POST", path: "/v1/players/:playerId/equip", auth: "public", summary: "裝備稱號／展示頭像",
      handler: async (ctx) => {
        await enforceRateLimit(ctx, "lookup");
        const pid = playerParam(ctx);
        const body = await readJson(ctx.request, 1024);
        if (!body || typeof body !== "object") throw new ApiError("VALIDATION_FAILED");
        const allowed = ["displayId", "baseAvatarKey", "titleKey", "displayAvatarKey"];
        const extra = Object.keys(body).filter((k) => !allowed.includes(k));
        if (extra.length) throw new ApiError("VALIDATION_FAILED", { details: { errors: extra.map((f) => ({ field: f, issue: "不接受的欄位" })) } });
        if (body.titleKey === undefined && body.displayAvatarKey === undefined) throw new ApiError("VALIDATION_FAILED", { message: "請選擇要裝備的稱號或頭像" });
        for (const f of ["titleKey", "displayAvatarKey"]) {
          if (body[f] !== undefined && body[f] !== null && !/^[a-z0-9_]{1,48}$/.test(String(body[f]))) throw new ApiError("VALIDATION_FAILED", { details: { errors: [{ field: f, issue: "格式不正確" }] } });
        }
        requireScores(ctx, pid);
        const profile = await profileOf(ctx, pid);
        // 身份確認：需要和找回玩家相同的 ID＋身份頭像（playerId 不是密碼）
        const n = normalizeDisplayId(body.displayId);
        if (!n.ok || n.value !== profile.displayId || body.baseAvatarKey !== profile.baseAvatarKey) throw new ApiError("FORBIDDEN", { message: "玩家 ID 或身份頭像不正確" });
        const view = await svc(ctx).collections.equip(pid, profile, { titleKey: body.titleKey, displayAvatarKey: body.displayAvatarKey });
        return ok(ctx, { ...view, canEquip: true, mode: ctx.cfg.scoresMode });
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
      handler: async (ctx) => {
        const pid = optionalPlayer(ctx);
        const rows = await svc(ctx).audits();
        return ok(ctx, { rows: pid ? rows.filter((r) => r.playerId === pid) : rows, scope: pid ? "player" : "all" });
      },
    },
    {
      method: "GET", path: "/v1/admin/wallet/:playerId/ledger", auth: "admin", summary: "V幣帳本",
      handler: async (ctx) => ok(ctx, { ...(await svc(ctx).wallet.getLedger(playerParam(ctx))), mode: ctx.cfg.rewardsMode }),   // v0.3.2：標示試營運
    },


    /* ---------- v0.3.2 玩家管理中心 ---------- */
    {
      method: "GET", path: "/v1/admin/players/search", auth: "admin", summary: "用玩家自訂 ID 或 playerId 搜尋玩家",
      handler: async (ctx) => {
        const q = String(ctx.url.searchParams.get("q") || "").trim();
        if (!q) throw new ApiError("VALIDATION_FAILED", { message: "請輸入玩家 ID" });
        if (q.length > 40) throw new ApiError("VALIDATION_FAILED", { message: "搜尋文字太長" });
        const fb = ctx.firebase();
        const profiles = [];
        let by = "displayId";
        if (PATTERNS.playerId.test(q)) {
          by = "playerId";
          const p = await fb.get(`players/${q}/profile`);
          if (p && p.playerId === q && p.status !== "deleted") profiles.push(p);
        } else {
          // 讀一次玩家清單在 Worker 篩選（不需要新增資料庫索引或修改 Rules）；只回傳管理需要的欄位
          const n = normalizeDisplayId(q);
          const needle = (n.ok ? n.value : q).toLowerCase();
          const all = (await fb.get("players")) || {};
          for (const v of Object.values(all)) {
            const p = v && v.profile;
            if (!p || p.status === "deleted" || typeof p.displayId !== "string") continue;
            if (p.displayId.toLowerCase().includes(needle)) profiles.push(p);
          }
          profiles.sort((a, b) => (Number(b.displayId.toLowerCase() === needle) - Number(a.displayId.toLowerCase() === needle)) || a.displayId.localeCompare(b.displayId, "zh-Hant") || a.createdAt - b.createdAt);
        }
        const pub = profiles.length ? ((await lazyDb(ctx).get("publicProfiles")) || {}) : {};
        const rows = profiles.slice(0, 50).map((p) => adminPlayerRow(p, pub[p.playerId]));
        return ok(ctx, { by, query: q, total: profiles.length, rows, truncated: profiles.length > 50, mode: ctx.cfg.scoresMode });
      },
    },
    {
      method: "GET", path: "/v1/admin/players/:playerId/overview", auth: "admin", summary: "玩家摘要（身份、裝備、V幣、成績、收藏）",
      handler: async (ctx) => {
        const pid = playerParam(ctx);
        const profile = await profileOf(ctx, pid);
        const db = lazyDb(ctx);
        const [pub, wallet, idx, col, tetris, rhythm, quiz, adventure] = await Promise.all([
          db.get(`publicProfiles/${pid}`), db.get(`wallets/${pid}`), db.get(`scoreIndex/byPlayer/${pid}`), db.get(`collections/${pid}`),
          db.get(`leaderboards/tetris/total/${pid}`), db.get("leaderboards/rhythm"), db.get("leaderboards/quiz"), db.get("leaderboards/adventure"),
        ]);
        const scores = Object.values(idx || {});
        const count = (st) => scores.filter((x) => x && x.status === st).length;
        const bests = [];
        if (tetris) bests.push({ gameId: "tetris", boardId: "total", score: tetris.score, achievedAt: iso(tetris.achievedAt) });
        for (const [board, rows] of Object.entries(rhythm || {})) if (rows && rows[pid]) bests.push({ gameId: "rhythm", boardId: board, score: rows[pid].score, achievedAt: iso(rows[pid].achievedAt), extra: rows[pid].extra || {} });
        for (const b of ["main", "low", "middle", "high"]) { const r = quiz && quiz[b] && quiz[b][pid]; if (r) bests.push({ gameId: "quiz", boardId: b, score: r.score, achievedAt: iso(r.updatedAt) }); }
        for (const [board, rows] of Object.entries(adventure || {})) if (rows && rows[pid]) bests.push({ gameId: "adventure", boardId: board, score: rows[pid].score, achievedAt: iso(rows[pid].achievedAt) });
        return ok(ctx, {
          ...adminPlayerRow(profile, pub),
          mode: ctx.cfg.scoresMode, namespace: namespaceFor(ctx.cfg) || "/",
          wallet: { balance: Number((wallet && wallet.balance) || 0), transactions: Object.keys((wallet && wallet.ledger) || {}).length },
          scores: { total: scores.length, accepted: count("accepted"), pending_review: count("pending_review"), rejected: count("rejected"),
            byGame: Object.fromEntries(["tetris", "rhythm", "quiz", "adventure"].map((g) => [g, scores.filter((x) => x && x.gameId === g).length])) },
          bests,
          collection: { titles: Object.keys((col && col.titles) || {}).length, avatars: Object.keys((col && col.avatars) || {}).length },
          canWrite: writeAllowed(ctx.cfg, pid),
        });
      },
    },

    /* ---------- v0.3.1 管理員：收藏、試營運、真實資料庫自我檢查 ---------- */
    {
      method: "GET", path: "/v1/admin/launch", auth: "admin", summary: "正式功能設定",
      handler: (ctx) => ok(ctx, { scoresMode: ctx.cfg.scoresMode, rewardsMode: ctx.cfg.rewardsMode, trialPlayers: ctx.cfg.trialPlayerIds.length, namespace: namespaceFor(ctx.cfg) || "/" }),
    },
    {
      method: "GET", path: "/v1/admin/collections/:playerId", auth: "admin", summary: "玩家收藏（含私人頭像）",
      handler: async (ctx) => {
        const pid = playerParam(ctx);
        const profile = await profileOf(ctx, pid);
        const view = await svc(ctx).collections.get(pid, profile);
        const raw = (await lazyDb(ctx).get(`collections/${pid}`)) || {};
        return ok(ctx, { ...view, displayId: profile.displayId, sources: { titles: raw.titles || {}, avatars: raw.avatars || {} },
          adminAvatars: AVATAR_CATALOG.filter((a) => a.unlock === "admin").map((a) => ({ avatarKey: a.avatarKey, name: a.name, private: a.visibility === "private", owned: !!(raw.avatars && raw.avatars[a.avatarKey]) })) });
      },
    },
    {
      method: "POST", path: "/v1/admin/collections/:playerId/avatars", auth: "admin", summary: "人工發放／收回頭像",
      handler: async (ctx) => {
        const pid = playerParam(ctx);
        const body = await readJson(ctx.request, 1024);
        const profile = await profileOf(ctx, pid);
        return ok(ctx, await svc(ctx).collections.adminAvatar(pid, profile, { avatarKey: body && body.avatarKey, action: body && body.action, note: body && body.note }, ctx.admin));
      },
    },
    {
      method: "POST", path: "/v1/admin/collections/:playerId/backfill", auth: "admin", summary: "歷史成績補判定",
      handler: async (ctx) => {
        const pid = playerParam(ctx);
        const body = (await readJson(ctx.request, 256)) || {};
        const offset = Math.max(0, parseInt(body.offset || 0, 10) || 0);
        return ok(ctx, await svc(ctx).backfill(pid, { offset }));
      },
    },
    {
      method: "GET", path: "/v1/admin/collection-audits", auth: "admin", summary: "收藏發放紀錄",
      handler: async (ctx) => {
        const pid = optionalPlayer(ctx);
        const rows = await svc(ctx).collections.adminAudits();
        return ok(ctx, { rows: pid ? rows.filter((r) => r.playerId === pid) : rows, scope: pid ? "player" : "all" });
      },
    },
    {
      method: "GET", path: "/v1/admin/exports/collections.csv", auth: "admin", summary: "收藏 CSV",
      handler: async (ctx) => {
        const only = optionalPlayer(ctx);
        const all = await svc(ctx).collections.all();
        const rows = [];
        for (const [pid, c] of Object.entries(all)) {
          if (only && pid !== only) continue;
          for (const t of Object.values((c && c.titles) || {})) rows.push({ playerId: pid, kind: "title", key: t.titleKey, gameId: t.gameId, unlockedAt: iso(t.unlockedAt), sourceType: t.source && t.source.type, sourceSubmissionId: t.source && t.source.submissionId, equipped: c.equipped && c.equipped.titleKey === t.titleKey ? "yes" : "" });
          for (const a of Object.values((c && c.avatars) || {})) rows.push({ playerId: pid, kind: "avatar", key: a.avatarKey, gameId: a.source && a.source.gameId, unlockedAt: iso(a.unlockedAt), sourceType: a.source && a.source.type, sourceSubmissionId: a.source && a.source.submissionId, equipped: c.equipped && c.equipped.displayAvatarKey === a.avatarKey ? "yes" : "" });
        }
        rows.sort((a, b) => (a.unlockedAt < b.unlockedAt ? -1 : 1));
        return csvResponse(`collections-${only ? only + "-" : ""}${taipeiDateKey()}.csv`, toCsv(["playerId", "kind", "key", "gameId", "unlockedAt", "sourceType", "sourceSubmissionId", "equipped"], rows));
      },
    },
    {
      method: "POST", path: "/v1/admin/selftest", auth: "admin", summary: "真實資料庫自我檢查（只寫 _selftest/ 並清除）",
      handler: async (ctx) => ok(ctx, await selfTest(rawLazyDb(ctx), ctx.now || (() => Date.now()))),
    },
    {
      method: "POST", path: "/v1/admin/trial/purge", auth: "admin", summary: "清除試營運資料（trial/）",
      handler: async (ctx) => {
        const body = (await readJson(ctx.request, 256)) || {};
        if (body.confirm !== "PURGE TRIAL") throw new ApiError("VALIDATION_FAILED", { message: "請輸入確認文字 PURGE TRIAL" });
        if (ctx.cfg.scoresMode === "on") throw new ApiError("CONFLICT", { message: "已全面開放（on），不能清除；請先改回 trial 或 off" });
        await rawLazyDb(ctx).remove(TRIAL_ROOT);
        return ok(ctx, { purged: TRIAL_ROOT + "/" });
      },
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

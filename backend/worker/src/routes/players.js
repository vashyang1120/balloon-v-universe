/**
 * 玩家 API（v0.3.0）
 *
 * POST /v1/players            建立玩家（ID＋固定身份圖案）
 * POST /v1/players/resolve    用 ID＋身份圖案找回既有玩家
 * GET  /v1/players/:playerId  讀取公開基本資料
 * GET  /v1/avatars/base       可選的固定身份圖案清單
 *
 * 信任程度：這些 API 不需要登入。知道 ID＋身份圖案就能找回玩家（已接受的便利性取捨），
 * 所以這裡「只」提供建立與讀取公開資料，沒有任何修改或刪除玩家資料的功能，
 * 也不會發出可以用來消費 V幣的憑證。
 */
import { ok } from "../utils/response.js";
import { assertValid, PATTERNS } from "../utils/validate.js";
import { readJson } from "../middleware/body.js";
import { enforceRateLimit } from "../middleware/rate-limit.js";
import { createPlayerService } from "../players/player-service.js";
import { publicBaseAvatarList, BASE_AVATAR_CATALOG_VERSION, AVATAR_KEY_PATTERN } from "../players/base-avatars.js";
import { ID_RULES } from "../players/id-rules.js";
import { namespaceFor, namespacedDb } from "../launch/namespace.js";

const MAX_PLAYER_BODY = 2 * 1024;

const CREATE_SCHEMA = Object.freeze({
  displayId:       { type: "string", required: true, max: ID_RULES.maxRawLength },
  baseAvatarKey:   { type: "string", required: true, pattern: AVATAR_KEY_PATTERN },
  createRequestId: { type: "string", required: true, pattern: PATTERNS.submissionId },
});
const RESOLVE_SCHEMA = Object.freeze({
  displayId:     { type: "string", required: true, max: ID_RULES.maxRawLength },
  baseAvatarKey: { type: "string", required: true, pattern: AVATAR_KEY_PATTERN },
});

function service(ctx) {
  return createPlayerService({ db: () => ctx.firebase(), logger: ctx.logger });
}

export function playerRoutes() {
  return [
    {
      method: "POST",
      path: "/v1/players/resolve",
      auth: "public",
      summary: "用 ID＋身份圖案找回玩家",
      handler: async (ctx) => {
        await enforceRateLimit(ctx, "lookup");
        const body = assertValid(await readJson(ctx.request, MAX_PLAYER_BODY), RESOLVE_SCHEMA);
        return ok(ctx, await service(ctx).resolve(body));
      },
    },
    {
      method: "POST",
      path: "/v1/players",
      auth: "public",
      summary: "建立玩家",
      handler: async (ctx) => {
        await enforceRateLimit(ctx, "create");
        // 不接受 playerId、displayAvatarKey 等其他欄位（assertValid 會拒絕多餘欄位）
        const body = assertValid(await readJson(ctx.request, MAX_PLAYER_BODY), CREATE_SCHEMA);
        const result = await service(ctx).create(body, ctx.client);
        return ok(ctx, result, result.replayed ? 200 : 201);
      },
    },
    {
      method: "GET",
      path: "/v1/players/:playerId",
      auth: "public",
      summary: "讀取玩家公開基本資料",
      handler: async (ctx) => {
        await enforceRateLimit(ctx, "lookup");
        const r = await service(ctx).getPublic(ctx.params.playerId);
        // v0.3.1：目前裝備的展示頭像與稱號（遊戲宇宙共用收藏；伺服器已檢查過只能是自己已解鎖的）
        //   baseAvatarKey 永遠不變；讀不到收藏時維持身份頭像，不影響玩家資料讀取
        try {
          const pp = await namespacedDb(ctx.firebase(), namespaceFor(ctx.cfg)).get(`publicProfiles/${r.player.playerId}`);
          if (pp && typeof pp.displayAvatarKey === "string" && /^[a-z0-9_]{1,48}$/.test(pp.displayAvatarKey)) r.player.displayAvatarKey = pp.displayAvatarKey;
          r.player.title = pp && pp.titleKey ? { titleKey: pp.titleKey, name: pp.titleName } : null;
        } catch { r.player.title = null; }
        return ok(ctx, r);
      },
    },
    {
      method: "GET",
      path: "/v1/avatars/base",
      auth: "public",
      summary: "固定身份圖案清單",
      handler: (ctx) =>
        ok(ctx, { catalogVersion: BASE_AVATAR_CATALOG_VERSION, avatars: publicBaseAvatarList() }, 200, { "cache-control": "public, max-age=300" }),
    },
  ];
}

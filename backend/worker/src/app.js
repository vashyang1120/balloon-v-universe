/**
 * 請求處理主流程（可注入依賴，方便測試）
 *
 *  1. 產生 requestId、讀設定、解析 X-BV-Client
 *  2. CORS：預檢請求、來源檢查
 *  3. 路由比對（404 / 405）
 *  4. 權限：public / player / admin
 *  5. 執行 handler
 *  6. 統一錯誤處理：ApiError → 對應狀態；其他錯誤 → 500 INTERNAL（不回傳堆疊與內部訊息）
 */
import { readConfig, RELEASE } from "./config.js";
import { compile, resolve } from "./router.js";
import { ApiError, isApiError } from "./utils/errors.js";
import { fail } from "./utils/response.js";
import { createLogger } from "./utils/logger.js";
import { newRequestId } from "./utils/ids.js";
import { handlePreflight, assertOriginAllowed, withCors } from "./middleware/cors.js";
import { parseClientInfo } from "./middleware/client-info.js";
import { requireAdmin } from "./middleware/admin-auth.js";
import { createServiceAccountTokenProvider } from "./services/google-oauth.js";
import { createFirebaseClient } from "./services/firebase-rest.js";
import { createGoogleJwksProvider } from "./services/firebase-id-token.js";
import { healthRoute } from "./routes/health.js";
import { metaRoute } from "./routes/meta.js";
import { adminRoutes } from "./routes/admin.js";
import { reservedRoutes } from "./routes/reserved.js";
import { playerRoutes } from "./routes/players.js";
import { launchRoutes } from "./routes/launch.js";
import { rateLimitSummary } from "./middleware/rate-limit.js";

// 順序重要：明確的路由在前，預留分類的萬用路由（/v1/<分類>/*）在最後
const ROUTES = compile([healthRoute(), metaRoute(), ...adminRoutes(), ...launchRoutes(), ...playerRoutes(), ...reservedRoutes()]);

/**
 * @param {object} [deps] 測試時注入：fetch、jwks、now、logSink
 */
export function createApp(deps = {}) {
  const outboundFetch = deps.fetch || ((...a) => fetch(...a));
  const jwks = deps.jwks || createGoogleJwksProvider({ fetch: outboundFetch });
  // 每個 Worker isolate 共用一份 Token 快取，避免每個請求都重新簽章
  let tokenProvider = null;
  let tokenProviderSecret = null;

  function firebaseFactory(env, cfg, logger) {
    let client = null;
    return () => {
      if (client) return client;
      if (!cfg.firebaseConfigured) {
        throw new ApiError("SERVICE_NOT_CONFIGURED", { internal: "firebase not configured" });
      }
      if (!tokenProvider || tokenProviderSecret !== env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        tokenProvider = createServiceAccountTokenProvider({
          serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON,
          expectedProjectId: cfg.projectId,
          fetch: outboundFetch,
          timeoutMs: cfg.firebaseTimeoutMs,
          now: deps.now,
        });
        tokenProviderSecret = env.FIREBASE_SERVICE_ACCOUNT_JSON;
      }
      client = createFirebaseClient({ databaseUrl: cfg.databaseUrl, tokenProvider, fetch: outboundFetch, timeoutMs: cfg.firebaseTimeoutMs, logger });
      return client;
    };
  }

  return {
    async fetch(request, env = {}) {
      const started = Date.now();
      const requestId = newRequestId();
      const cfg = readConfig(env);
      const url = new URL(request.url);
      const logger = createLogger({ requestId, release: RELEASE }, deps.logSink || console);
      const ctx = { request, env, cfg, requestId, logger, url, params: {}, client: null, admin: null, now: deps.now };
      ctx.firebase = firebaseFactory(env, cfg, logger);

      let response;
      try {
        if (request.method === "OPTIONS") {
          response = handlePreflight(request, cfg);
        } else {
          assertOriginAllowed(request, cfg);
          const { route, params } = resolve(ROUTES, request.method, url.pathname);
          ctx.params = params;
          ctx.client = parseClientInfo(request);

          if (route.auth === "admin") {
            ctx.admin = await requireAdmin(request, { cfg, jwks, now: deps.now, logger });
          } else if (route.auth === "player") {
            // 玩家驗證（ID＋固定身份圖案＋匿名登入綁定）在下一個版本設計，現在一律不開放
            throw new ApiError("NOT_IMPLEMENTED", { details: { reason: "player auth not available in this version" } });
          }
          response = await route.handler(ctx);
          if (request.method === "HEAD") response = new Response(null, response);
        }
      } catch (e) {
        response = fail(ctx, toApiError(e, logger));
      }

      response = withCors(response, request, cfg);
      response.headers.set("x-request-id", requestId);
      logger.info("request", {
        method: request.method,
        path: url.pathname.slice(0, 128),
        status: response.status,
        ms: Date.now() - started,
        client: ctx.client ? `${ctx.client.gameId}/${ctx.client.gameVersion}` : undefined,
        rl: rateLimitSummary(ctx), // 限流用了哪一層（只有玩家 API 會有）
      });
      return response;
    },
  };
}

export function toApiError(e, logger) {
  if (isApiError(e)) {
    if (e.internal || e.status >= 500) logger.warn("api error", { code: e.code, status: e.status, internal: e.internal });
    return e;
  }
  // 未預期的錯誤：只記錄名稱與已遮罩訊息，不回傳給使用者
  logger.error("unhandled error", { error: e });
  return new ApiError("INTERNAL");
}

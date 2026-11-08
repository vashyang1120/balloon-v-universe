/**
 * 管理員 API（v0.1.0 只有驗證與診斷用途，不改任何資料）
 *
 * GET /v1/admin/whoami                 確認管理員驗證是否成功
 * GET /v1/admin/diagnostics/firebase   實際讀取資料庫一個不存在的測試路徑，確認「Worker → Firebase」連線
 */
import { ok } from "../utils/response.js";
import { isApiError } from "../utils/errors.js";

export const DIAGNOSTIC_PATH = "_system/diagnostics/ping";

export function adminRoutes() {
  return [
    {
      method: "GET",
      path: "/v1/admin/whoami",
      auth: "admin",
      summary: "管理員身份確認",
      handler: (ctx) => ok(ctx, { uid: ctx.admin.uid, signInProvider: ctx.admin.signInProvider, role: "admin" }),
    },
    {
      method: "GET",
      path: "/v1/admin/diagnostics/firebase",
      auth: "admin",
      summary: "Firebase 連線診斷（只讀）",
      handler: async (ctx) => {
        const cfg = ctx.cfg;
        if (!cfg.firebaseConfigured) {
          return ok(ctx, {
            configured: false,
            connected: false,
            missing: [
              !cfg.projectId && "FIREBASE_PROJECT_ID",
              !cfg.databaseUrl && "FIREBASE_DATABASE_URL",
              !cfg.hasServiceAccount && "FIREBASE_SERVICE_ACCOUNT_JSON",
            ].filter(Boolean),
          });
        }
        const started = Date.now();
        try {
          await ctx.firebase().get(DIAGNOSTIC_PATH, { shallow: true });
          return ok(ctx, { configured: true, connected: true, latencyMs: Date.now() - started });
        } catch (e) {
          ctx.logger.warn("firebase diagnostics failed", { code: isApiError(e) ? e.code : "INTERNAL", internal: e && e.internal });
          return ok(ctx, { configured: true, connected: false, errorCode: isApiError(e) ? e.code : "INTERNAL", latencyMs: Date.now() - started });
        }
      },
    },
  ];
}

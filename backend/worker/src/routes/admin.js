/**
 * 管理員 API（只有驗證與診斷用途，不改任何資料）
 *
 * GET /v1/admin/whoami                 確認「伺服器認定你是管理員」
 * GET /v1/admin/diagnostics/firebase   Worker → Firebase 真實連線診斷（只讀）
 *
 * 診斷流程：
 *   1. 檢查設定是否齊全（專案 ID、資料庫網址、服務帳戶 Secret）
 *   2. 用服務帳戶向 Google 換 Access Token
 *   3. 用 Access Token 對資料庫一個固定的測試路徑發出「只讀、shallow」請求
 * 空資料庫回 null 是正常的；判斷成功與否看 HTTP 狀態，不看有沒有資料。
 * 回應只包含「成功／失敗、卡在哪一步、安全的原因代碼與中文提示」，
 * 不含 Token、私鑰、服務帳戶內容、資料庫內容或錯誤堆疊。
 */
import { ok } from "../utils/response.js";
import { isApiError } from "../utils/errors.js";

export const DIAGNOSTIC_PATH = "_system/diagnostics/ping";

/** 原因代碼 → 卡在哪一步＋給管理員看的排除建議（不含任何機密） */
export const DIAGNOSTIC_HINTS = Object.freeze({
  SERVICE_ACCOUNT_MISSING:          { stage: "config",   hint: "Cloudflare 沒有設定 FIREBASE_SERVICE_ACCOUNT_JSON。" },
  SERVICE_ACCOUNT_INVALID_JSON:     { stage: "config",   hint: "FIREBASE_SERVICE_ACCOUNT_JSON 不是完整的 JSON，請重新貼上整份金鑰檔內容。" },
  SERVICE_ACCOUNT_INVALID_FIELDS:   { stage: "config",   hint: "服務帳戶 JSON 缺少必要欄位，請確認貼上的是 Google Cloud 下載的服務帳戶金鑰檔。" },
  SERVICE_ACCOUNT_PROJECT_MISMATCH: { stage: "config",   hint: "服務帳戶屬於其他 Firebase 專案，請使用 balloon-v-universe 專案的服務帳戶。" },
  SERVICE_ACCOUNT_KEY_UNREADABLE:   { stage: "config",   hint: "服務帳戶私鑰無法讀取，請重新建立金鑰並更新 Secret。" },
  GOOGLE_TOKEN_REJECTED:            { stage: "token",    hint: "Google 拒絕這把服務帳戶金鑰（可能已刪除、停用或貼錯），請建立新金鑰並更新 Secret。" },
  GOOGLE_TOKEN_TIMEOUT:             { stage: "token",    hint: "向 Google 取得授權逾時，請稍後再試。" },
  GOOGLE_TOKEN_NETWORK:             { stage: "token",    hint: "無法連到 Google 授權服務，請稍後再試。" },
  FIREBASE_UNAUTHORIZED:            { stage: "database", hint: "Firebase 不接受這個授權，請確認服務帳戶屬於 balloon-v-universe 專案。" },
  FIREBASE_PERMISSION_DENIED:       { stage: "database", hint: "服務帳戶沒有資料庫權限，請在 Google Cloud IAM 確認角色為「Firebase Realtime Database Admin」。" },
  FIREBASE_DATABASE_NOT_FOUND:      { stage: "database", hint: "找不到資料庫，請確認 FIREBASE_DATABASE_URL 正確。" },
  FIREBASE_TIMEOUT:                 { stage: "database", hint: "Firebase 回應逾時，請稍後再試。" },
  FIREBASE_NETWORK:                 { stage: "database", hint: "無法連到 Firebase，請稍後再試。" },
  FIREBASE_ERROR_STATUS:            { stage: "database", hint: "Firebase 暫時發生錯誤，請稍後再試。" },
  FIREBASE_BAD_RESPONSE:            { stage: "database", hint: "Firebase 回應格式異常，請稍後再試。" },
  FIREBASE_BAD_REQUEST:             { stage: "database", hint: "Firebase 拒絕這個請求格式，請回報開發者。" },
});

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
            stage: "config",
            reason: "CONFIG_MISSING",
            hint: "Worker 缺少 Firebase 設定，請依 README 補上。",
            missing: [
              !cfg.projectId && "FIREBASE_PROJECT_ID",
              !cfg.databaseUrl && "FIREBASE_DATABASE_URL",
              !cfg.hasServiceAccount && "FIREBASE_SERVICE_ACCOUNT_JSON",
            ].filter(Boolean),
          });
        }
        const started = Date.now();
        try {
          const value = await ctx.firebase().get(DIAGNOSTIC_PATH, { shallow: true });
          return ok(ctx, {
            configured: true,
            connected: true,
            stage: "done",
            projectId: cfg.projectId,
            readMode: "read-only",
            // 只說「有沒有資料」，不回傳內容；空資料庫的 null 是正常結果
            readResult: value === null ? "null" : "has_data",
            latencyMs: Date.now() - started,
          });
        } catch (e) {
          const code = isApiError(e) ? e.code : "INTERNAL";
          const reason = isApiError(e) && e.reason && DIAGNOSTIC_HINTS[e.reason] ? e.reason : "UNKNOWN";
          const info = DIAGNOSTIC_HINTS[reason] || { stage: "unknown", hint: "發生未預期的錯誤，請稍後再試；若持續發生請回報 requestId。" };
          ctx.logger.warn("firebase diagnostics failed", { code, reason, internal: e && e.internal });
          return ok(ctx, {
            configured: true,
            connected: false,
            stage: info.stage,
            errorCode: code,
            reason,
            hint: info.hint,
            projectId: cfg.projectId,
            latencyMs: Date.now() - started,
          });
        }
      },
    },
  ];
}

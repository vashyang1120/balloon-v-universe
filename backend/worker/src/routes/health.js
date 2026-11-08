/**
 * GET /health —— 只代表「Worker 本身」正常運作。
 *
 * 不呼叫 Firebase、不讀取任何 Secret 內容，所以：
 *   - 很快、幾乎不耗 CPU，可以給監測工具頻繁呼叫
 *   - dependencies.firebase 永遠是 "not_checked"
 * 要確認 Firebase 真的連得上，請用管理員 API：GET /v1/admin/diagnostics/firebase
 */
import { SERVICE_NAME, API_VERSION } from "../config.js";
import { json } from "../utils/response.js";

export function healthRoute() {
  return {
    method: "GET",
    path: "/health",
    auth: "public",
    summary: "Worker 健康檢查（不含資料庫）",
    handler: (ctx) =>
      json({
        service: SERVICE_NAME,
        version: API_VERSION,
        status: "ok",
        timestamp: new Date().toISOString(),
        scope: "worker",
        dependencies: { firebase: "not_checked" },
        requestId: ctx.requestId,
      }),
  };
}

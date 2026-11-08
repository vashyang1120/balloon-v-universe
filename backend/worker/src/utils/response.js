/**
 * 統一 API 回應格式
 *
 * 成功：{ ok: true,  data: {...},                         meta: { requestId, version, timestamp } }
 * 失敗：{ ok: false, error: { code, message, details? }, meta: { requestId, version, timestamp } }
 *
 * 例外：GET /health 依規格回傳平面欄位（service、version、status、timestamp），
 *       方便監測工具直接讀取，見 routes/health.js。
 */
import { SERVICE_NAME, API_VERSION } from "../config.js";

const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function meta(ctx) {
  return { requestId: ctx?.requestId, service: SERVICE_NAME, version: API_VERSION, timestamp: new Date().toISOString() };
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function ok(ctx, data, status = 200, headers = {}) {
  return json({ ok: true, data: data ?? null, meta: meta(ctx) }, status, headers);
}

export function fail(ctx, apiError) {
  const error = { code: apiError.code, message: apiError.message };
  if (apiError.details !== undefined) error.details = apiError.details;
  return json({ ok: false, error, meta: meta(ctx) }, apiError.status, apiError.headers || {});
}

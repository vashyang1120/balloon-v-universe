/**
 * CORS：只信任 ALLOWED_ORIGINS 名單中的網站，從不回傳 "*"。
 *
 * 注意：CORS 只限制「瀏覽器中的其他網站」能不能讀取回應，
 * 擋不住直接用程式（curl 等）呼叫 API。真正的保護仍靠伺服器端驗證與權限檢查。
 */
import { ApiError } from "../utils/errors.js";

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOW_HEADERS = "Authorization, Content-Type, X-BV-Client, X-Request-Id";
const EXPOSE_HEADERS = "X-Request-Id";
const MAX_AGE = "600";

export function corsHeadersFor(origin, cfg) {
  if (!origin || !cfg.allowedOrigins.includes(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    "access-control-expose-headers": EXPOSE_HEADERS,
    vary: "Origin",
  };
}

/**
 * 預檢請求（OPTIONS）：來源在名單內才回 204 與允許標頭；否則 403。
 */
export function handlePreflight(request, cfg) {
  const origin = request.headers.get("origin");
  if (!origin || !cfg.allowedOrigins.includes(origin)) {
    throw new ApiError("ORIGIN_NOT_ALLOWED", { internal: "preflight from disallowed origin" });
  }
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": ALLOW_METHODS,
      "access-control-allow-headers": ALLOW_HEADERS,
      "access-control-max-age": MAX_AGE,
      vary: "Origin",
    },
  });
}

/**
 * 一般請求：如果帶了 Origin 但不在名單內，直接拒絕（不執行任何業務邏輯）。
 * 沒帶 Origin（伺服器對伺服器、監測工具）允許通過，但回應沒有 CORS 標頭。
 */
export function assertOriginAllowed(request, cfg) {
  const origin = request.headers.get("origin");
  if (origin && !cfg.allowedOrigins.includes(origin)) {
    throw new ApiError("ORIGIN_NOT_ALLOWED", { internal: "request from disallowed origin" });
  }
}

export function withCors(response, request, cfg) {
  const headers = corsHeadersFor(request.headers.get("origin"), cfg);
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) {
    if (k === "vary") {
      const cur = res.headers.get("vary");
      res.headers.set("vary", cur && !/\borigin\b/i.test(cur) ? `${cur}, Origin` : cur || "Origin");
    } else {
      res.headers.set(k, v);
    }
  }
  return res;
}

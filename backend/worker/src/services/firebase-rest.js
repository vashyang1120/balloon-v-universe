/**
 * Firebase Realtime Database REST Client（伺服器端專用）
 *
 * - 以服務帳戶 Access Token 呼叫（Authorization: Bearer），伺服器寫入不受資料庫 Rules 限制；
 *   因此資料庫 Rules 可以維持「瀏覽器全部拒絕」，由 Worker 統一把關。
 * - 每個請求都有超時；網路錯誤、超時、權限錯誤都轉成統一錯誤碼，不把 Firebase 原始回應交給玩家。
 * - 支援 ETag 條件寫入（putIfMatch / deleteIfMatch），日後用來做：
 *     每日獎勵只能領一次、V幣餘額不被同時請求覆蓋、遊戲結果重送去重。
 */
import { ApiError } from "../utils/errors.js";

const FORBIDDEN_IN_KEY = /[.#$\[\]\/\u0000-\u001f\u007f]/;
const MAX_PATH_BYTES = 768;
const MAX_DEPTH = 32;

/** 把 "players/p_xxx/profile" 驗證並轉成 URL 路徑；不合法直接拒絕（避免路徑注入） */
export function encodePath(path) {
  if (typeof path !== "string") throw new ApiError("INTERNAL", { internal: "firebase path must be string" });
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "";
  const parts = trimmed.split("/");
  if (parts.length > MAX_DEPTH) throw new ApiError("INTERNAL", { internal: "firebase path too deep" });
  if (new TextEncoder().encode(trimmed).length > MAX_PATH_BYTES) throw new ApiError("INTERNAL", { internal: "firebase path too long" });
  for (const p of parts) {
    if (p === "" || FORBIDDEN_IN_KEY.test(p)) throw new ApiError("INTERNAL", { internal: "firebase path has invalid segment" });
  }
  return parts.map(encodeURIComponent).join("/");
}

/**
 * @param {object} o
 * @param {string} o.databaseUrl    例：https://xxx-default-rtdb.asia-southeast1.firebasedatabase.app
 * @param {{getToken: () => Promise<string>, invalidate?: () => void}} o.tokenProvider
 * @param {typeof fetch} [o.fetch]
 * @param {number} [o.timeoutMs]
 * @param {object} [o.logger]
 */
export function createFirebaseClient(o) {
  if (!o || !o.databaseUrl || !o.tokenProvider) {
    throw new ApiError("SERVICE_NOT_CONFIGURED", { internal: "firebase client missing databaseUrl or tokenProvider" });
  }
  const base = o.databaseUrl.replace(/\/+$/, "");
  const doFetch = o.fetch || ((...a) => fetch(...a));
  const timeoutMs = o.timeoutMs || 8000;
  const log = o.logger;

  function url(path, query) {
    const p = encodePath(path);
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) {
      if (v === undefined) continue;
      // orderBy / equalTo 等參數 Firebase 要求 JSON 字串格式
      qs.set(k, typeof v === "string" && !["shallow", "print", "limitToFirst", "limitToLast", "timeout"].includes(k) ? JSON.stringify(v) : String(v));
    }
    const q = qs.toString();
    return `${base}/${p}.json${q ? "?" + q : ""}`;
  }

  async function send(method, path, { body, query, headers = {}, retryAuth = true, idempotent = false } = {}) {
    const token = await o.tokenProvider.getToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await doFetch(url(path, query), {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === "AbortError") {
        log?.warn("firebase timeout", { method, timeoutMs });
        throw new ApiError("UPSTREAM_TIMEOUT", { internal: "firebase request timeout" });
      }
      if (idempotent) return send(method, path, { body, query, headers, retryAuth, idempotent: false });
      log?.warn("firebase network error", { method });
      throw new ApiError("UPSTREAM_UNAVAILABLE", { internal: "firebase network error" });
    }
    clearTimeout(timer);

    if (res.status === 401 && retryAuth) {
      // Token 可能剛好過期或被撤銷：清掉快取重試一次
      o.tokenProvider.invalidate?.();
      return send(method, path, { body, query, headers, retryAuth: false, idempotent });
    }
    if (res.status === 412) {
      const err = new ApiError("CONFLICT", { internal: "firebase etag precondition failed" });
      err.currentEtag = res.headers.get("etag"); // 只給伺服器程式重試用，不會放進回應
      throw err;
    }
    if (res.status >= 500 && idempotent) {
      return send(method, path, { body, query, headers, retryAuth, idempotent: false });
    }
    if (!res.ok) {
      // 只記錄狀態碼，不記錄 Firebase 回應內容（可能包含資料）
      log?.warn("firebase error status", { method, status: res.status });
      if (res.status === 401 || res.status === 403) {
        throw new ApiError("UPSTREAM_UNAVAILABLE", { internal: `firebase auth rejected (${res.status})` });
      }
      if (res.status === 400) throw new ApiError("INTERNAL", { internal: "firebase rejected request (400)" });
      throw new ApiError("UPSTREAM_UNAVAILABLE", { internal: `firebase status ${res.status}` });
    }

    const text = await res.text();
    let value = null;
    if (text) {
      try { value = JSON.parse(text); } catch { throw new ApiError("UPSTREAM_UNAVAILABLE", { internal: "firebase returned non-JSON" }); }
    }
    return { value, etag: res.headers.get("etag") };
  }

  return {
    /** 讀取；options.shallow=true 只取下一層的鍵 */
    async get(path, options = {}) {
      const query = {};
      if (options.shallow) query.shallow = "true";
      if (options.orderBy) query.orderBy = options.orderBy;
      if (options.limitToFirst) query.limitToFirst = options.limitToFirst;
      if (options.limitToLast) query.limitToLast = options.limitToLast;
      return (await send("GET", path, { query, idempotent: true })).value;
    },
    /** 讀取並取得 ETag，配合 putIfMatch 做「讀取→檢查→條件寫入」 */
    async getWithEtag(path) {
      return send("GET", path, { headers: { "x-firebase-etag": "true" }, idempotent: true });
    },
    async put(path, value) {
      return (await send("PUT", path, { body: value, query: { print: "silent" } })).value;
    },
    /**
     * 條件寫入：只有資料仍是讀取時的版本才寫入，否則丟 CONFLICT（409）。
     * 「只在原本不存在時才建立」：先 getWithEtag 讀到 value 為 null 時的 ETag，再用它條件寫入。
     */
    async putIfMatch(path, value, etag) {
      if (!etag) throw new ApiError("INTERNAL", { internal: "putIfMatch requires etag" });
      return send("PUT", path, { body: value, headers: { "if-match": etag, "x-firebase-etag": "true" } });
    },
    async patch(path, value) {
      if (value == null || typeof value !== "object" || Array.isArray(value)) {
        throw new ApiError("INTERNAL", { internal: "patch value must be object" });
      }
      return (await send("PATCH", path, { body: value, query: { print: "silent" } })).value;
    },
    /** 新增一筆（Firebase 自動產生 push key），回傳 key */
    async post(path, value) {
      const r = await send("POST", path, { body: value });
      return r.value && typeof r.value.name === "string" ? r.value.name : null;
    },
    async remove(path) {
      if (encodePath(path) === "") throw new ApiError("INTERNAL", { internal: "refusing to delete database root" });
      await send("DELETE", path, { query: { print: "silent" } });
    },
  };
}

/**
 * 服務帳戶 → Google OAuth2 Access Token（給 Firebase Realtime Database REST API 使用）
 *
 * 流程（Google「服務帳戶 JWT 授權」）：
 *   1. 從 Cloudflare Secret FIREBASE_SERVICE_ACCOUNT_JSON 讀取服務帳戶資料
 *   2. 用私鑰以 RS256 簽一份 JWT（有效 1 小時）
 *   3. POST 到 https://oauth2.googleapis.com/token 換得 Access Token
 *   4. Token 快取在 Worker 記憶體，到期前 5 分鐘才重新取得（避免每個請求都做 RSA 簽章，節省 CPU）
 *
 * 安全：
 *   - 私鑰只存在 Secret 與記憶體中的 CryptoKey（設為不可匯出），從不寫進回應或記錄
 *   - 只接受官方 token_uri，避免被竄改的 JSON 把簽好的憑證送到別的網站
 *   - 錯誤訊息不包含任何金鑰、assertion 或 token 內容
 */
import { ApiError } from "../utils/errors.js";
import { pemToDer, textToBase64Url, bytesToBase64Url } from "../utils/base64url.js";

export const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
export const RTDB_SCOPES = [
  "https://www.googleapis.com/auth/firebase.database",
  "https://www.googleapis.com/auth/userinfo.email",
];
const REFRESH_MARGIN_S = 300;

/** 解析並檢查服務帳戶 JSON；失敗只回報「設定錯誤」，不回傳內容 */
export function parseServiceAccount(raw, expectedProjectId) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ApiError("SERVICE_NOT_CONFIGURED", { reason: "SERVICE_ACCOUNT_MISSING", internal: "FIREBASE_SERVICE_ACCOUNT_JSON missing" });
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new ApiError("SERVICE_NOT_CONFIGURED", { reason: "SERVICE_ACCOUNT_INVALID_JSON", internal: "service account JSON is not valid JSON" });
  }
  const problems = [];
  if (sa.type !== "service_account") problems.push("type");
  if (typeof sa.client_email !== "string" || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(sa.client_email)) problems.push("client_email");
  if (typeof sa.private_key !== "string" || !sa.private_key.includes("PRIVATE KEY")) problems.push("private_key");
  if (sa.token_uri != null && sa.token_uri !== GOOGLE_TOKEN_URI) problems.push("token_uri");
  if (expectedProjectId && sa.project_id && sa.project_id !== expectedProjectId) problems.push("project_id_mismatch");
  if (problems.length) {
    const reason = problems.includes("project_id_mismatch") ? "SERVICE_ACCOUNT_PROJECT_MISMATCH" : "SERVICE_ACCOUNT_INVALID_FIELDS";
    throw new ApiError("SERVICE_NOT_CONFIGURED", { reason, internal: "service account fields invalid: " + problems.join(",") });
  }
  return {
    clientEmail: sa.client_email,
    privateKeyPem: sa.private_key,
    privateKeyId: typeof sa.private_key_id === "string" ? sa.private_key_id : undefined,
    projectId: sa.project_id,
  };
}

/**
 * 建立 Token 提供者。
 * @param {object} o
 * @param {string} o.serviceAccountJson
 * @param {string} [o.expectedProjectId]
 * @param {typeof fetch} [o.fetch]
 * @param {() => number} [o.now]  毫秒
 * @param {number} [o.timeoutMs]
 */
export function createServiceAccountTokenProvider(o) {
  const doFetch = o.fetch || ((...a) => fetch(...a));
  const now = o.now || (() => Date.now());
  const timeoutMs = o.timeoutMs || 8000;
  let sa = null;
  let keyPromise = null;
  let cached = null;      // { token, expiresAt(ms) }
  let inflight = null;    // 同時多個請求只換一次 token

  function account() {
    if (!sa) sa = parseServiceAccount(o.serviceAccountJson, o.expectedProjectId);
    return sa;
  }

  function signingKey() {
    if (!keyPromise) {
      keyPromise = crypto.subtle
        .importKey("pkcs8", pemToDer(account().privateKeyPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
        .catch(() => {
          keyPromise = null;
          throw new ApiError("SERVICE_NOT_CONFIGURED", { reason: "SERVICE_ACCOUNT_KEY_UNREADABLE", internal: "service account private key could not be imported" });
        });
    }
    return keyPromise;
  }

  async function buildAssertion() {
    const a = account();
    const iat = Math.floor(now() / 1000);
    const header = { alg: "RS256", typ: "JWT", ...(a.privateKeyId ? { kid: a.privateKeyId } : {}) };
    const claims = { iss: a.clientEmail, scope: RTDB_SCOPES.join(" "), aud: GOOGLE_TOKEN_URI, iat, exp: iat + 3600 };
    const input = `${textToBase64Url(JSON.stringify(header))}.${textToBase64Url(JSON.stringify(claims))}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(), new TextEncoder().encode(input));
    return `${input}.${bytesToBase64Url(sig)}`;
  }

  async function exchange() {
    const assertion = await buildAssertion();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await doFetch(GOOGLE_TOKEN_URI, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw new ApiError("UPSTREAM_TIMEOUT", { reason: "GOOGLE_TOKEN_TIMEOUT", internal: "google token endpoint timeout" });
      throw new ApiError("UPSTREAM_UNAVAILABLE", { reason: "GOOGLE_TOKEN_NETWORK", internal: "google token endpoint network error" });
    } finally {
      clearTimeout(timer);
    }
    let body = null;
    try { body = await res.json(); } catch { /* 非 JSON 回應 */ }
    if (!res.ok || !body || typeof body.access_token !== "string") {
      // 只記錄 Google 回傳的錯誤「代碼」，不記錄內容
      const code = body && typeof body.error === "string" ? body.error.slice(0, 40) : "no_error_code";
      throw new ApiError("UPSTREAM_UNAVAILABLE", { reason: "GOOGLE_TOKEN_REJECTED", internal: `google token endpoint rejected (${res.status} ${code})` });
    }
    const ttl = Number.isFinite(body.expires_in) ? body.expires_in : 3600;
    cached = { token: body.access_token, expiresAt: now() + Math.max(ttl - REFRESH_MARGIN_S, 60) * 1000 };
    return cached.token;
  }

  return {
    async getToken() {
      if (cached && now() < cached.expiresAt) return cached.token;
      if (!inflight) inflight = exchange().finally(() => { inflight = null; });
      return inflight;
    },
    /** Firebase 回 401 時呼叫，強制下一次重新取得 */
    invalidate() { cached = null; },
  };
}

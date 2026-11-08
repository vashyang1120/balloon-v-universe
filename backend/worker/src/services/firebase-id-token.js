/**
 * Firebase ID Token 驗證（不使用 Firebase Admin SDK，適合 Cloudflare Workers）
 *
 * 依 Firebase 官方「使用第三方 JWT 函式庫驗證 ID Token」規格：
 *   header.alg = RS256，header.kid 必須是 Google 公開金鑰之一
 *   exp 在未來、iat 與 auth_time 在過去
 *   aud = Firebase 專案 ID，iss = https://securetoken.google.com/<專案 ID>
 *   sub = 非空字串（即 Firebase UID）
 *   簽章以對應 kid 的公開金鑰驗證
 * 公開金鑰依回應的 Cache-Control max-age 快取。
 *
 * 只要有任何一項不符就拒絕；沒有「測試用通行 Token」這種後門。
 * 測試時是由測試程式「注入」一組自己產生的金鑰（見 tests/helpers.js），正式部署不存在這個入口。
 */
import { base64UrlToBytes, base64UrlToText } from "../utils/base64url.js";

// 與官方 x509 憑證網址提供同一組金鑰的 JWK 格式（Web Crypto 可直接匯入）
export const GOOGLE_SECURETOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const CLOCK_SKEW_S = 60;
const MAX_TOKEN_LENGTH = 4096;
const MIN_REFETCH_INTERVAL_MS = 60_000;

export class TokenError extends Error {
  constructor(reason) {
    super("invalid id token");
    this.name = "TokenError";
    this.reason = reason; // 只寫進伺服器記錄
  }
}

/** 從 Google 取得公開金鑰（含快取） */
export function createGoogleJwksProvider({ fetch: doFetch = (...a) => fetch(...a), now = () => Date.now(), url = GOOGLE_SECURETOKEN_JWKS_URL, timeoutMs = 5000 } = {}) {
  let cache = null; // { keys: Map(kid → jwk), expiresAt, fetchedAt }
  let inflight = null;

  async function load() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("jwks status " + res.status);
      const body = await res.json();
      const keys = new Map();
      for (const k of (body && body.keys) || []) {
        if (k && k.kty === "RSA" && typeof k.kid === "string" && k.n && k.e) keys.set(k.kid, k);
      }
      if (!keys.size) throw new Error("jwks empty");
      const m = /max-age=(\d+)/i.exec(res.headers.get("cache-control") || "");
      const maxAge = m ? Math.min(Number(m[1]), 24 * 3600) : 3600;
      cache = { keys, expiresAt: now() + maxAge * 1000, fetchedAt: now() };
      return cache;
    } finally {
      clearTimeout(timer);
    }
  }

  async function current(force) {
    const fresh = cache && now() < cache.expiresAt;
    const mayRefetch = !cache || now() - cache.fetchedAt > MIN_REFETCH_INTERVAL_MS;
    if (fresh && !(force && mayRefetch)) return cache;
    if (!inflight) inflight = load().finally(() => { inflight = null; });
    return inflight;
  }

  return {
    async getKey(kid) {
      let c = await current(false);
      if (!c.keys.has(kid)) c = await current(true); // Google 輪替金鑰時重新抓一次
      return c.keys.get(kid) || null;
    },
  };
}

const keyCache = new Map(); // kid → Promise<CryptoKey>
function importJwk(jwk) {
  const id = jwk.kid + ":" + jwk.n.slice(0, 16);
  if (!keyCache.has(id)) {
    if (keyCache.size > 20) keyCache.clear();
    keyCache.set(id, crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    ));
  }
  return keyCache.get(id);
}

/**
 * @param {string} token
 * @param {object} o
 * @param {string} o.projectId
 * @param {{getKey: (kid:string) => Promise<object|null>}} o.jwks
 * @param {() => number} [o.now] 毫秒
 * @returns {Promise<{uid:string, signInProvider:string|null, email:string|null, emailVerified:boolean, claims:object}>}
 */
export async function verifyFirebaseIdToken(token, o) {
  if (!o || !o.projectId) throw new TokenError("project id not configured");
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) throw new TokenError("token missing or too long");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) throw new TokenError("malformed");

  let header, payload, signature;
  try {
    header = JSON.parse(base64UrlToText(parts[0]));
    payload = JSON.parse(base64UrlToText(parts[1]));
    signature = base64UrlToBytes(parts[2]);
  } catch {
    throw new TokenError("undecodable");
  }
  if (!header || header.alg !== "RS256") throw new TokenError("alg not RS256");
  if (typeof header.kid !== "string" || !header.kid) throw new TokenError("missing kid");

  const nowS = Math.floor((o.now ? o.now() : Date.now()) / 1000);
  const p = payload || {};
  if (p.aud !== o.projectId) throw new TokenError("aud mismatch");
  if (p.iss !== `https://securetoken.google.com/${o.projectId}`) throw new TokenError("iss mismatch");
  if (typeof p.sub !== "string" || !p.sub || p.sub.length > 128) throw new TokenError("bad sub");
  if (!Number.isFinite(p.exp) || p.exp <= nowS - CLOCK_SKEW_S) throw new TokenError("expired");
  if (!Number.isFinite(p.iat) || p.iat > nowS + CLOCK_SKEW_S) throw new TokenError("iat in future");
  if (!Number.isFinite(p.auth_time) || p.auth_time > nowS + CLOCK_SKEW_S) throw new TokenError("auth_time in future");

  let jwk;
  try {
    jwk = await o.jwks.getKey(header.kid);
  } catch {
    throw new TokenError("jwks unavailable");
  }
  if (!jwk) throw new TokenError("unknown kid");

  const key = await importJwk(jwk);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new TokenError("bad signature");

  const fb = p.firebase && typeof p.firebase === "object" ? p.firebase : {};
  return {
    uid: p.sub,
    signInProvider: typeof fb.sign_in_provider === "string" ? fb.sign_in_provider : null,
    email: typeof p.email === "string" ? p.email : null,
    emailVerified: p.email_verified === true,
    claims: p,
  };
}

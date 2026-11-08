// 測試工具：所有金鑰都在測試執行時用 Web Crypto 產生，沒有任何真實憑證寫在檔案裡
import { textToBase64Url, bytesToBase64Url } from "../src/utils/base64url.js";
import { createApp } from "../src/app.js";

export const PROJECT_ID = "balloon-v-universe";
export const DB_URL = "https://balloon-v-universe-default-rtdb.asia-southeast1.firebasedatabase.app";
export const ORIGIN = "https://vashyang1120.github.io";
export const ADMIN_UID = "adminUid0001";

const RSA = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };

export async function newRsaKey(kid = "test-kid-1") {
  const pair = await crypto.subtle.generateKey(RSA, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { kid, privateKey: pair.privateKey, publicKey: pair.publicKey, jwk: { ...jwk, kid, alg: "RS256", use: "sig" } };
}

/** 注入用的公開金鑰提供者（取代 Google 的 JWKS 網址） */
export function staticJwks(...keys) {
  const map = new Map(keys.map((k) => [k.kid, k.jwk]));
  return { getKey: async (kid) => map.get(kid) || null };
}

export async function signJwt(header, payload, privateKey) {
  const input = `${textToBase64Url(JSON.stringify(header))}.${textToBase64Url(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  return `${input}.${bytesToBase64Url(sig)}`;
}

export function idTokenClaims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: now - 60,
    user_id: ADMIN_UID,
    sub: ADMIN_UID,
    iat: now - 30,
    exp: now + 3600,
    firebase: { sign_in_provider: "google.com", identities: {} },
    ...overrides,
  };
}

export async function makeIdToken(key, overrides = {}, headerOverrides = {}) {
  return signJwt({ alg: "RS256", kid: key.kid, typ: "JWT", ...headerOverrides }, idTokenClaims(overrides), key.privateKey);
}

/** 產生一份「假的」服務帳戶 JSON（金鑰是剛產生的測試金鑰） */
export async function fakeServiceAccount(extra = {}) {
  const pair = await crypto.subtle.generateKey(RSA, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let b64 = "";
  for (const b of der) b64 += String.fromCharCode(b);
  b64 = btoa(b64).replace(/(.{64})/g, "$1\n");
  const label = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  const end = ["-----END", "PRIVATE KEY-----"].join(" ");
  const pem = `${label}\n${b64}\n${end}\n`;
  const json = JSON.stringify({
    type: "service_account",
    project_id: PROJECT_ID,
    private_key_id: "testkeyid",
    private_key: pem,
    client_email: `universe-worker@${PROJECT_ID}.iam.gserviceaccount.com`,
    token_uri: "https://oauth2.googleapis.com/token",
    ...extra,
  });
  return { json, publicKey: pair.publicKey, pem };
}

export function baseEnv(extra = {}) {
  return {
    SERVICE_ENV: "production",
    ALLOWED_ORIGINS: ORIGIN,
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIREBASE_DATABASE_URL: DB_URL,
    FIREBASE_TIMEOUT_MS: "8000",
    ...extra,
  };
}

/** 記錄所有輸出的 log sink，用來檢查有沒有洩漏私密資料 */
export function captureLogs() {
  const lines = [];
  const push = (s) => lines.push(String(s));
  return { sink: { log: push, warn: push, error: push }, lines, text: () => lines.join("\n") };
}

/**
 * 假的外部網路：依網址回應。handlers: [{ match: (url, init) => bool, respond: (url, init) => Response }]
 * 沒有符合的網址就丟錯（確保測試不會碰到真實網路）
 */
export function mockFetch(handlers) {
  const calls = [];
  const fn = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    for (const h of handlers) if (h.match(url, init)) return h.respond(url, init);
    throw new Error("unexpected outbound request: " + url.split("?")[0]);
  };
  fn.calls = calls;
  return fn;
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export function req(path, init = {}) {
  return new Request("https://balloon-v-universe-api.vashyang1120.workers.dev" + path, init);
}

export function app(deps = {}) {
  return createApp({ fetch: mockFetch([]), ...deps });
}

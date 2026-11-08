import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeServiceAccount, mockFetch, jsonResponse, PROJECT_ID } from "./helpers.js";
import { createServiceAccountTokenProvider, parseServiceAccount, GOOGLE_TOKEN_URI, RTDB_SCOPES } from "../src/services/google-oauth.js";
import { base64UrlToText, base64UrlToBytes } from "../src/utils/base64url.js";

const sa = await fakeServiceAccount();
const tokenEndpoint = (respond) => ({ match: (u) => u === GOOGLE_TOKEN_URI, respond });

test("服務帳戶 JSON 檢查：缺少、格式錯、token_uri 被改、專案不符 → SERVICE_NOT_CONFIGURED，訊息不含私鑰", () => {
  const bad = [
    "",
    "not json",
    JSON.stringify({ type: "user" }),
    JSON.stringify({ ...JSON.parse(sa.json), token_uri: "https://evil.example.com/token" }),
    JSON.stringify({ ...JSON.parse(sa.json), project_id: "another-project" }),
  ];
  for (const raw of bad) {
    try {
      parseServiceAccount(raw, PROJECT_ID);
      assert.fail("應該失敗");
    } catch (e) {
      assert.equal(e.code, "SERVICE_NOT_CONFIGURED");
      assert.ok(!String(e.message + (e.internal || "")).includes("PRIVATE KEY"));
      assert.ok(!String(e.message + (e.internal || "")).includes(JSON.parse(sa.json).private_key.slice(40, 80)));
    }
  }
  assert.equal(parseServiceAccount(sa.json, PROJECT_ID).clientEmail, `universe-worker@${PROJECT_ID}.iam.gserviceaccount.com`);
});

test("簽出的 JWT assertion 正確，且能用對應公鑰驗證", async () => {
  let form = null;
  const f = mockFetch([tokenEndpoint((u, init) => { form = new URLSearchParams(init.body); return jsonResponse({ access_token: "ya29.test-access-token", expires_in: 3600 }); })]);
  const p = createServiceAccountTokenProvider({ serviceAccountJson: sa.json, expectedProjectId: PROJECT_ID, fetch: f });
  assert.equal(await p.getToken(), "ya29.test-access-token");
  assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [h, c, s] = form.get("assertion").split(".");
  const header = JSON.parse(base64UrlToText(h));
  const claims = JSON.parse(base64UrlToText(c));
  assert.equal(header.alg, "RS256");
  assert.equal(header.kid, "testkeyid");
  assert.equal(claims.iss, `universe-worker@${PROJECT_ID}.iam.gserviceaccount.com`);
  assert.equal(claims.aud, GOOGLE_TOKEN_URI);
  assert.equal(claims.scope, RTDB_SCOPES.join(" "));
  assert.equal(claims.exp - claims.iat, 3600);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", sa.publicKey, base64UrlToBytes(s), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok, "簽章必須有效");
});

test("Token 快取：到期前不重新取得；同時多個請求只換一次", async () => {
  let t = 1_000_000;
  const f = mockFetch([tokenEndpoint(() => jsonResponse({ access_token: "ya29.tok-" + f.calls.length, expires_in: 3600 }))]);
  const p = createServiceAccountTokenProvider({ serviceAccountJson: sa.json, fetch: f, now: () => t });
  const [a, b, c] = await Promise.all([p.getToken(), p.getToken(), p.getToken()]);
  assert.equal(f.calls.length, 1);
  assert.equal(a, b); assert.equal(b, c);
  t += 3000 * 1000; // 50 分鐘後，仍在 (3600-300) 秒內
  await p.getToken();
  assert.equal(f.calls.length, 1);
  t += 400 * 1000; // 超過 3300 秒 → 重新取得
  await p.getToken();
  assert.equal(f.calls.length, 2);
  p.invalidate();
  await p.getToken();
  assert.equal(f.calls.length, 3);
});

test("Google 拒絕（invalid_grant）→ UPSTREAM_UNAVAILABLE，內部原因不含 assertion", async () => {
  const f = mockFetch([tokenEndpoint(() => jsonResponse({ error: "invalid_grant", error_description: "Invalid JWT Signature." }, 400))]);
  const p = createServiceAccountTokenProvider({ serviceAccountJson: sa.json, fetch: f });
  await assert.rejects(p.getToken(), (e) => {
    assert.equal(e.code, "UPSTREAM_UNAVAILABLE");
    assert.match(e.internal, /invalid_grant/);
    assert.ok(!e.internal.includes("eyJ"));
    return true;
  });
});

test("Google 逾時 → UPSTREAM_TIMEOUT；網路錯誤 → UPSTREAM_UNAVAILABLE", async () => {
  const hang = mockFetch([tokenEndpoint((u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))))]);
  const p = createServiceAccountTokenProvider({ serviceAccountJson: sa.json, fetch: hang, timeoutMs: 30 });
  await assert.rejects(p.getToken(), (e) => e.code === "UPSTREAM_TIMEOUT");

  const down = mockFetch([tokenEndpoint(() => { throw new TypeError("network down"); })]);
  const p2 = createServiceAccountTokenProvider({ serviceAccountJson: sa.json, fetch: down });
  await assert.rejects(p2.getToken(), (e) => e.code === "UPSTREAM_UNAVAILABLE");
});

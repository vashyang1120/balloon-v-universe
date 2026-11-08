import { test } from "node:test";
import assert from "node:assert/strict";
import {
  app, req, baseEnv, newRsaKey, staticJwks, makeIdToken, fakeServiceAccount, mockFetch, jsonResponse, captureLogs, ADMIN_UID, DB_URL,
} from "./helpers.js";
import { GOOGLE_TOKEN_URI } from "../src/services/google-oauth.js";

const key = await newRsaKey();
const sa = await fakeServiceAccount();
const ACCESS = "ya" + "29.diagnostic-access-token-zzzzzzzzzzzzzzzzzzzzzzzz";

async function diag({ env, fetch, logSink }) {
  const a = app({ jwks: staticJwks(key), fetch, logSink });
  const res = await a.fetch(req("/v1/admin/diagnostics/firebase", { headers: { authorization: `Bearer ${await makeIdToken(key)}` } }), env);
  return { status: res.status, text: await res.text() };
}

test("缺少服務帳戶 Secret → 明確回報「尚未設定」，不嘗試連線", async () => {
  const f = mockFetch([]);
  const r = await diag({ env: baseEnv({ ADMIN_UIDS: ADMIN_UID }), fetch: f });
  assert.equal(r.status, 200);
  const { data } = JSON.parse(r.text);
  assert.equal(data.configured, false);
  assert.equal(data.connected, false);
  assert.deepEqual(data.missing, ["FIREBASE_SERVICE_ACCOUNT_JSON"]);
  assert.equal(f.calls.length, 0);
});

test("Mock 環境下：換 Token → 讀取測試路徑 → connected:true", async () => {
  const f = mockFetch([
    { match: (u) => u === GOOGLE_TOKEN_URI, respond: () => jsonResponse({ access_token: ACCESS, expires_in: 3600 }) },
    { match: (u) => u.startsWith(DB_URL), respond: () => jsonResponse(null) },
  ]);
  const logs = captureLogs();
  const r = await diag({ env: baseEnv({ ADMIN_UIDS: ADMIN_UID, FIREBASE_SERVICE_ACCOUNT_JSON: sa.json }), fetch: f, logSink: logs.sink });
  const { data } = JSON.parse(r.text);
  assert.equal(data.configured, true);
  assert.equal(data.connected, true);
  assert.equal(f.calls[1].url, `${DB_URL}/_system/diagnostics/ping.json?shallow=true`);
  assert.equal(f.calls[1].init.method, "GET", "診斷只讀，不寫資料");
  for (const s of [r.text, logs.text()]) {
    assert.ok(!s.includes(ACCESS));
    assert.ok(!s.includes("PRIVATE KEY"));
  }
});

test("Firebase 拒絕（例如權限設錯）→ connected:false 與錯誤代碼，不外流細節", async () => {
  const f = mockFetch([
    { match: (u) => u === GOOGLE_TOKEN_URI, respond: () => jsonResponse({ access_token: ACCESS, expires_in: 3600 }) },
    { match: (u) => u.startsWith(DB_URL), respond: () => new Response('{"error":"Permission denied"}', { status: 403 }) },
  ]);
  const r = await diag({ env: baseEnv({ ADMIN_UIDS: ADMIN_UID, FIREBASE_SERVICE_ACCOUNT_JSON: sa.json }), fetch: f });
  const { data } = JSON.parse(r.text);
  assert.equal(data.connected, false);
  assert.equal(data.errorCode, "UPSTREAM_UNAVAILABLE");
  assert.ok(!r.text.includes("Permission denied"));
});

test("服務帳戶 JSON 損壞 → connected:false（SERVICE_NOT_CONFIGURED），不顯示內容", async () => {
  const r = await diag({ env: baseEnv({ ADMIN_UIDS: ADMIN_UID, FIREBASE_SERVICE_ACCOUNT_JSON: '{"type":"service_account","private_key":"oops' }), fetch: mockFetch([]) });
  const { data } = JSON.parse(r.text);
  assert.equal(data.connected, false);
  assert.equal(data.errorCode, "SERVICE_NOT_CONFIGURED");
  assert.ok(!r.text.includes("oops"));
});

test("非管理員不能呼叫診斷", async () => {
  const a = app({ jwks: staticJwks(key) });
  const res = await a.fetch(req("/v1/admin/diagnostics/firebase"), baseEnv({ ADMIN_UIDS: ADMIN_UID, FIREBASE_SERVICE_ACCOUNT_JSON: sa.json }));
  assert.equal(res.status, 401);
});

// v0.2.0：真實連線診斷的「階段、原因代碼、提示」與只讀保證（以 Mock 網路測試，不是真實 Firebase）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  app, req, baseEnv, newRsaKey, staticJwks, makeIdToken, fakeServiceAccount, mockFetch, jsonResponse, ADMIN_UID, DB_URL, ORIGIN,
} from "./helpers.js";
import { GOOGLE_TOKEN_URI } from "../src/services/google-oauth.js";
import { DIAGNOSTIC_HINTS } from "../src/routes/admin.js";

const key = await newRsaKey();
const sa = await fakeServiceAccount();
const ACCESS = "ya" + "29.v2-diagnostic-token-qqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const env = baseEnv({ ADMIN_UIDS: ADMIN_UID, FIREBASE_SERVICE_ACCOUNT_JSON: sa.json });
const tokenOk = { match: (u) => u === GOOGLE_TOKEN_URI, respond: () => jsonResponse({ access_token: ACCESS, expires_in: 3600 }) };

async function diag(handlers, e = env) {
  const f = mockFetch(handlers);
  const a = app({ jwks: staticJwks(key), fetch: f });
  const res = await a.fetch(req("/v1/admin/diagnostics/firebase", { headers: { origin: ORIGIN, authorization: `Bearer ${await makeIdToken(key)}` } }), e);
  const text = await res.text();
  return { res, text, body: JSON.parse(text), calls: f.calls };
}

test("空資料庫回 null → 判定為連線成功（readResult: null）", async () => {
  const r = await diag([tokenOk, { match: (u) => u.startsWith(DB_URL), respond: () => new Response("null", { status: 200 }) }]);
  assert.equal(r.res.status, 200);
  assert.equal(r.res.headers.get("access-control-allow-origin"), ORIGIN, "GitHub Pages 管理頁可讀取回應");
  assert.equal(r.body.data.connected, true);
  assert.equal(r.body.data.stage, "done");
  assert.equal(r.body.data.readResult, "null");
  assert.equal(r.body.data.readMode, "read-only");
  assert.equal(r.body.data.projectId, "balloon-v-universe");
});

test("有資料時只回報 has_data，不回傳內容", async () => {
  const r = await diag([tokenOk, { match: (u) => u.startsWith(DB_URL), respond: () => jsonResponse({ secretField: "player-data-xyz" }) }]);
  assert.equal(r.body.data.readResult, "has_data");
  assert.ok(!r.text.includes("player-data-xyz"));
  assert.ok(!r.text.includes("secretField"));
});

test("診斷只發出一個 GET 到資料庫，絕不寫入", async () => {
  const r = await diag([tokenOk, { match: (u) => u.startsWith(DB_URL), respond: () => new Response("null") }]);
  const dbCalls = r.calls.filter((c) => c.url.startsWith(DB_URL));
  assert.equal(dbCalls.length, 1);
  assert.equal(dbCalls[0].init.method, "GET");
  assert.equal(dbCalls[0].init.body, undefined);
  assert.ok(!r.calls.some((c) => ["PUT", "PATCH", "POST", "DELETE"].includes(c.init.method) && c.url.startsWith(DB_URL)));
});

const failures = [
  ["Google 拒絕金鑰", [{ match: (u) => u === GOOGLE_TOKEN_URI, respond: () => jsonResponse({ error: "invalid_grant" }, 400) }], "token", "GOOGLE_TOKEN_REJECTED"],
  ["Firebase 401", [tokenOk, { match: (u) => u.startsWith(DB_URL), respond: () => new Response("{}", { status: 401 }) }], "database", "FIREBASE_UNAUTHORIZED"],
  ["Firebase 403 權限不足", [tokenOk, { match: (u) => u.startsWith(DB_URL), respond: () => new Response('{"error":"Permission denied"}', { status: 403 }) }], "database", "FIREBASE_PERMISSION_DENIED"],
  ["資料庫不存在 404", [tokenOk, { match: (u) => u.startsWith(DB_URL), respond: () => new Response("", { status: 404 }) }], "database", "FIREBASE_DATABASE_NOT_FOUND"],
  ["Firebase 500", [tokenOk, { match: (u) => u.startsWith(DB_URL), respond: () => new Response("", { status: 500 }) }], "database", "FIREBASE_ERROR_STATUS"],
  ["Firebase 網路錯誤", [tokenOk, { match: (u) => u.startsWith(DB_URL), respond: () => { throw new TypeError("fetch failed"); } }], "database", "FIREBASE_NETWORK"],
];
for (const [name, handlers, stage, reason] of failures) {
  test(`失敗分類：${name} → stage=${stage}、reason=${reason}，有中文提示且不洩漏機密`, async () => {
    const r = await diag(handlers);
    assert.equal(r.res.status, 200);
    assert.equal(r.body.data.connected, false);
    assert.equal(r.body.data.stage, stage);
    assert.equal(r.body.data.reason, reason);
    assert.equal(r.body.data.hint, DIAGNOSTIC_HINTS[reason].hint);
    for (const bad of [ACCESS, "PRIVATE KEY", "Permission denied", "invalid_grant", "stack", "Bearer"]) {
      assert.ok(!r.text.includes(bad), bad);
    }
  });
}

test("服務帳戶屬於其他專案 → config 階段 SERVICE_ACCOUNT_PROJECT_MISMATCH，不嘗試連線", async () => {
  const other = await fakeServiceAccount({ project_id: "vparty-rhythm-game" });
  const r = await diag([], baseEnv({ ADMIN_UIDS: ADMIN_UID, FIREBASE_SERVICE_ACCOUNT_JSON: other.json }));
  assert.equal(r.body.data.stage, "config");
  assert.equal(r.body.data.reason, "SERVICE_ACCOUNT_PROJECT_MISMATCH");
  assert.equal(r.calls.length, 0);
});

test("Firebase 逾時 → FIREBASE_TIMEOUT", async () => {
  const hang = { match: (u) => u.startsWith(DB_URL), respond: (u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" })))) };
  const r = await diag([tokenOk, hang], { ...env, FIREBASE_TIMEOUT_MS: "1000" });
  assert.equal(r.body.data.reason, "FIREBASE_TIMEOUT");
  assert.equal(r.body.data.stage, "database");
});

test("每個原因代碼都有階段與中文提示", () => {
  for (const [k, v] of Object.entries(DIAGNOSTIC_HINTS)) {
    assert.match(k, /^[A-Z_]+$/);
    assert.ok(["config", "token", "database"].includes(v.stage), k);
    assert.ok(/[一-鿿]/.test(v.hint), k);
  }
});

test("管理員狀態三種情況可被前端區分：未設定 503、不是管理員 403、是管理員 200", async () => {
  const t = await makeIdToken(key);
  const a = app({ jwks: staticJwks(key) });
  const call = async (e, tok = t) => (await a.fetch(req("/v1/admin/whoami", { headers: { origin: ORIGIN, authorization: `Bearer ${tok}` } }), e)).status;
  assert.equal(await call(baseEnv({ ADMIN_UIDS: "" })), 503);
  assert.equal(await call(baseEnv({ ADMIN_UIDS: "someoneElse" })), 403);
  assert.equal(await call(baseEnv({ ADMIN_UIDS: ADMIN_UID })), 200);
  assert.equal(await call(baseEnv({ ADMIN_UIDS: `x, ${ADMIN_UID} y` })), 200, "多位管理員可用逗號或空白分隔");
});

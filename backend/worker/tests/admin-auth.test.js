import { test } from "node:test";
import assert from "node:assert/strict";
import {
  app, req, baseEnv, newRsaKey, staticJwks, makeIdToken, signJwt, idTokenClaims, captureLogs, ADMIN_UID, PROJECT_ID,
} from "./helpers.js";
import { textToBase64Url } from "../src/utils/base64url.js";

const key = await newRsaKey("kid-good");
const otherKey = await newRsaKey("kid-other");
const env = baseEnv({ ADMIN_UIDS: `${ADMIN_UID}, someoneElse` });

function adminApp(extra = {}) {
  return app({ jwks: staticJwks(key), ...extra });
}
async function call(token, path = "/v1/admin/whoami", e = env, a = adminApp()) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = await a.fetch(req(path, { headers }), e);
  return { status: res.status, body: await res.json() };
}

test("有效的 Google 登入 Token + UID 在名單 → 通過", async () => {
  const r = await call(await makeIdToken(key));
  assert.equal(r.status, 200);
  assert.equal(r.body.data.uid, ADMIN_UID);
  assert.equal(r.body.data.signInProvider, "google.com");
});

test("沒有 Token → 401", async () => {
  const r = await call(null);
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, "UNAUTHENTICATED");
});

test("格式錯誤或亂填的 Token → 401", async () => {
  for (const t of ["abc", "a.b.c", "test", "admin", "eyJhbGciOiJub25lIn0.e30."]) {
    assert.equal((await call(t)).status, 401, t);
  }
});

test("alg=none、HS256 → 401", async () => {
  const none = `${textToBase64Url(JSON.stringify({ alg: "none", kid: key.kid }))}.${textToBase64Url(JSON.stringify(idTokenClaims()))}.x`;
  assert.equal((await call(none)).status, 401);
  const hs = await makeIdToken(key, {}, { alg: "HS256" });
  assert.equal((await call(hs)).status, 401);
});

test("用別的金鑰簽、或 kid 不存在 → 401", async () => {
  const forged = await signJwt({ alg: "RS256", kid: key.kid }, idTokenClaims(), otherKey.privateKey);
  assert.equal((await call(forged)).status, 401);
  assert.equal((await call(await makeIdToken(otherKey))).status, 401);
});

test("竄改內容（簽章不符）→ 401", async () => {
  const t = await makeIdToken(key);
  const [h, , s] = t.split(".");
  const tampered = `${h}.${textToBase64Url(JSON.stringify(idTokenClaims({ sub: "attacker", user_id: "attacker" })))}.${s}`;
  assert.equal((await call(tampered)).status, 401);
});

test("錯誤的專案（aud / iss）→ 401", async () => {
  assert.equal((await call(await makeIdToken(key, { aud: "other-project" }))).status, 401);
  assert.equal((await call(await makeIdToken(key, { iss: "https://securetoken.google.com/other-project" }))).status, 401);
});

test("過期、iat 或 auth_time 在未來、sub 空白 → 401", async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await call(await makeIdToken(key, { exp: now - 3600 }))).status, 401);
  assert.equal((await call(await makeIdToken(key, { iat: now + 3600 }))).status, 401);
  assert.equal((await call(await makeIdToken(key, { auth_time: now + 3600 }))).status, 401);
  assert.equal((await call(await makeIdToken(key, { sub: "" }))).status, 401);
});

test("匿名登入的有效 Token → 403（匿名永遠不是管理員）", async () => {
  const r = await call(await makeIdToken(key, { firebase: { sign_in_provider: "anonymous" } }));
  assert.equal(r.status, 403);
});

test("Google 登入有效但 UID 不在名單 → 403；Email 再像管理員也沒用", async () => {
  const t = await makeIdToken(key, { sub: "randomUser", user_id: "randomUser", email: "vash@example.com", email_verified: true });
  assert.equal((await call(t)).status, 403);
});

test("管理員名單未設定 → 503，所有人都被拒絕，訊息不洩漏設定名稱", async () => {
  const r = await call(await makeIdToken(key), "/v1/admin/whoami", baseEnv({ ADMIN_UIDS: "" }));
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, "SERVICE_NOT_CONFIGURED");
  assert.ok(!JSON.stringify(r.body).includes("ADMIN_UIDS"));
});

test("開發模式也不接受假 Token（沒有測試後門）", async () => {
  const devEnv = baseEnv({ SERVICE_ENV: "development", ADMIN_UIDS: ADMIN_UID });
  for (const t of ["test", "dev-admin", "mock", "fake.fake.fake"]) {
    assert.equal((await call(t, "/v1/admin/whoami", devEnv)).status, 401, t);
  }
});

test("預留的 admin 與 exports 分類也先要求管理員", async () => {
  for (const p of ["/v1/admin/players", "/v1/exports/csv", "/v1/exports"]) {
    assert.equal((await call(null, p)).status, 401, p);
    const ok = await call(await makeIdToken(key), p);
    assert.equal(ok.status, 501, p);
  }
});

test("拒絕原因只寫在伺服器記錄，記錄中不出現 Token 原文", async () => {
  const logs = captureLogs();
  const t = await makeIdToken(key, { aud: "other" });
  await call(t, "/v1/admin/whoami", env, adminApp({ logSink: logs.sink }));
  assert.ok(logs.text().includes("aud mismatch"));
  assert.ok(!logs.text().includes(t.split(".")[2]));
});

test("Google 公開金鑰服務失敗 → 401（不放行）", async () => {
  const broken = app({ jwks: { getKey: async () => { throw new Error("down"); } } });
  assert.equal((await call(await makeIdToken(key), "/v1/admin/whoami", env, broken)).status, 401);
  assert.equal(PROJECT_ID, "balloon-v-universe");
});

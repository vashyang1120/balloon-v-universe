import { test } from "node:test";
import assert from "node:assert/strict";
import { app, req, baseEnv, ORIGIN } from "./helpers.js";
import { readConfig } from "../src/config.js";

test("允許的來源：預檢 204，回傳完全相同的來源（不是 *）", async () => {
  const res = await app().fetch(
    req("/v1/meta", { method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "GET" } }),
    baseEnv(),
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(res.headers.get("access-control-allow-headers"), /Authorization/);
  assert.match(res.headers.get("vary"), /Origin/);
});

test("不在名單的來源：預檢 403，沒有 CORS 允許標頭", async () => {
  const res = await app().fetch(
    req("/v1/meta", { method: "OPTIONS", headers: { origin: "https://evil.example.com" } }),
    baseEnv(),
  );
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.equal((await res.json()).error.code, "ORIGIN_NOT_ALLOWED");
});

test("不在名單的來源：一般請求直接 403，不執行業務邏輯", async () => {
  for (const origin of ["https://evil.example.com", "https://vashyang1120.github.io.evil.com", "http://vashyang1120.github.io", "null"]) {
    const res = await app().fetch(req("/v1/meta", { headers: { origin } }), baseEnv());
    assert.equal(res.status, 403, origin);
    assert.equal(res.headers.get("access-control-allow-origin"), null, origin);
  }
});

test("允許的來源：一般請求帶 CORS 標頭", async () => {
  const res = await app().fetch(req("/health", { headers: { origin: ORIGIN } }), baseEnv());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(res.headers.get("access-control-expose-headers"), "X-Request-Id");
});

test("沒有 Origin（監測工具）可以呼叫，但回應沒有 CORS 允許標頭", async () => {
  const res = await app().fetch(req("/health"), baseEnv());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("設定為 * 也不會變成信任所有網站", async () => {
  const res = await app().fetch(req("/health", { headers: { origin: "https://anything.example" } }), baseEnv({ ALLOWED_ORIGINS: "*" }));
  assert.equal(res.status, 403);
  assert.deepEqual(readConfig({ ALLOWED_ORIGINS: "*" }).allowedOrigins, []);
});

test("正式環境不接受 http:// 來源；開發環境可以", () => {
  const env = { ALLOWED_ORIGINS: "https://vashyang1120.github.io, http://localhost:8000, https://bad.com/path" };
  assert.deepEqual(readConfig({ ...env, SERVICE_ENV: "production" }).allowedOrigins, ["https://vashyang1120.github.io"]);
  assert.deepEqual(readConfig({ ...env, SERVICE_ENV: "development" }).allowedOrigins, ["https://vashyang1120.github.io", "http://localhost:8000"]);
});

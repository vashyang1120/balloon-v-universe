import { test } from "node:test";
import assert from "node:assert/strict";
import { app, req, baseEnv, captureLogs, fakeServiceAccount } from "./helpers.js";
import { toApiError } from "../src/app.js";
import { fail } from "../src/utils/response.js";
import { createLogger } from "../src/utils/logger.js";
import { API_VERSION } from "../src/config.js";

test("/health 回傳 service、version、status、timestamp", async () => {
  const res = await app().fetch(req("/health"), baseEnv());
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  const body = await res.json();
  assert.equal(body.service, "balloon-v-universe-api");
  assert.equal(body.version, API_VERSION);
  assert.equal(API_VERSION, "0.3.4");
  assert.equal(body.status, "ok");
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)), "timestamp 必須是 ISO-8601");
  assert.ok(Math.abs(Date.parse(body.timestamp) - Date.now()) < 5000, "timestamp 由伺服器即時產生");
  assert.equal(body.scope, "worker");
  assert.deepEqual(body.dependencies, { firebase: "not_checked" }, "健康檢查不代表 Firebase 已連線");
  assert.ok(res.headers.get("x-request-id"));
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("/health 不呼叫任何外部服務，也不輸出 Secret", async () => {
  const sa = await fakeServiceAccount();
  const logs = captureLogs();
  const calls = [];
  const a = app({ fetch: async (u) => { calls.push(u); throw new Error("no network"); }, logSink: logs.sink });
  const res = await a.fetch(req("/health"), baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: sa.json, ADMIN_UIDS: "adminUid0001" }));
  const text = await res.text();
  assert.equal(calls.length, 0);
  for (const s of [text, logs.text()]) {
    assert.ok(!s.includes("PRIVATE KEY"));
    assert.ok(!s.includes("adminUid0001"));
    assert.ok(!s.includes("service_account"));
  }
});

test("HEAD /health 沒有內容但狀態 200", async () => {
  const res = await app().fetch(req("/health", { method: "HEAD" }), baseEnv());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
});

test("不存在的路由 → 404 統一格式", async () => {
  const res = await app().fetch(req("/nope"), baseEnv());
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.ok(body.meta.requestId);
  assert.equal(body.meta.version, API_VERSION);
});

test("方法不對 → 405 並附 Allow", async () => {
  const res = await app().fetch(req("/health", { method: "POST" }), baseEnv());
  assert.equal(res.status, 405);
  assert.match(res.headers.get("allow"), /GET/);
  assert.equal((await res.json()).error.code, "METHOD_NOT_ALLOWED");
});

test("未預期錯誤 → 500 INTERNAL，不回傳內部訊息與堆疊，記錄已遮罩", async () => {
  const logs = captureLogs();
  const logger = createLogger({}, logs.sink);
  const boom = new Error("boom ya" + "29.SECRETSECRETSECRETSECRETSECRET1234 at /src/x.js:1");
  const apiErr = toApiError(boom, logger);
  const res = fail({ requestId: "r1" }, apiErr);
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!text.includes("boom"));
  assert.ok(!text.includes("ya29"));
  assert.ok(!text.includes("stack"));
  assert.ok(!logs.text().includes("ya29.SECRET"), "記錄中的 Token 必須被遮罩");
  assert.ok(!logs.text().includes('"stack"'), "記錄不輸出錯誤堆疊");
  assert.ok(!logs.text().includes("    at "), "記錄不輸出錯誤堆疊");
});

test("GET /v1/meta 列出遊戲登記表與預留分類", async () => {
  const res = await app().fetch(req("/v1/meta"), baseEnv());
  assert.equal(res.status, 200);
  const { ok, data } = await res.json();
  assert.equal(ok, true);
  assert.deepEqual(data.games.map((g) => g.id).sort(), ["adventure", "lobby", "quiz", "rhythm", "tetris"]);
  assert.deepEqual(
    data.categories.map((c) => c.name),
    ["players", "wallet", "game-results", "leaderboards", "avatars", "titles", "shop", "admin", "exports"],
  );
});

test("預留的玩家功能 → 501 NOT_IMPLEMENTED，不讀寫資料", async () => {
  const calls = [];
  const a = app({ fetch: async (u) => { calls.push(u); throw new Error("no"); } });
  for (const p of ["/v1/players", "/v1/wallet/me", "/v1/game-results", "/v1/shop/buy", "/v1/leaderboards/tetris"]) {
    const res = await a.fetch(req(p, { method: p.includes("game-results") ? "POST" : "GET" }), baseEnv());
    assert.equal(res.status, 501, p);
    assert.equal((await res.json()).error.code, "NOT_IMPLEMENTED");
  }
  assert.equal(calls.length, 0);
});

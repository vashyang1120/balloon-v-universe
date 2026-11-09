// v0.3.0-test-3：限流診斷（全部為本機／模擬測試；正式環境 Cloudflare binding 的實際行為不能用這裡的結果取代）
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { app, req, baseEnv, fakeServiceAccount, ORIGIN, captureLogs } from "./helpers.js";
import { createFakeRtdb } from "./fake-rtdb.js";
import { enforceRateLimit, _resetMemoryLimiter } from "../src/middleware/rate-limit.js";

const sa = await fakeServiceAccount();
const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: sa.json });
const FAKE = "p_" + "z".repeat(20); // 驗收工具使用的「格式正確但不存在」玩家
beforeEach(() => _resetMemoryLimiter());

function setup(extraEnv = {}) {
  const db = createFakeRtdb();
  const logs = captureLogs();
  const a = app({ fetch: db.fetch, logSink: logs.sink });
  const get = async (path, ip = "203.0.113.7") => {
    const res = await a.fetch(req(path, { headers: { origin: ORIGIN, "cf-connecting-ip": ip } }), { ...env, ...extraEnv });
    return { status: res.status, body: await res.json() };
  };
  return { db, logs, get };
}
const fakeCtx = (ip = "198.51.100.9", envExtra = {}) => ({ request: new Request("https://x/", { headers: { "cf-connecting-ip": ip } }), env: envExtra, logger: null });

/* ───────── 根因模擬：送太慢會跨過 60 秒計數週期 ───────── */

test("模擬舊驗收方式：一次一個、每次 0.25 秒 → 320 次花 80 秒，跨過 60 秒週期，一次 429 都不會出現", async () => {
  let now = 1_000_000;
  let first429 = 0;
  for (let i = 1; i <= 320; i++) {
    try { await enforceRateLimit(fakeCtx(), "lookup", now); } catch (e) { if (e.code === "RATE_LIMITED" && !first429) first429 = i; }
    now += 250;
  }
  assert.equal(first429, 0, "與正式環境「404×320、429×0」的現象相同");
});

test("模擬新驗收方式：同樣 320 次在 10 秒內送完 → 第 301 次出現 429", async () => {
  let now = 2_000_000;
  let first429 = 0;
  for (let i = 1; i <= 320; i++) {
    try { await enforceRateLimit(fakeCtx(), "lookup", now); } catch (e) { if (e.code === "RATE_LIMITED" && !first429) first429 = i; }
    now += 30;
  }
  assert.equal(first429, 301);
});

test("每次超過約 0.19 秒就湊不滿 300 次（60 秒 ÷ 300 = 0.2 秒）", async () => {
  for (const [gapMs, expect429] of [[150, true], [210, false]]) {
    _resetMemoryLimiter();
    let now = 3_000_000, hit = false;
    for (let i = 1; i <= 320; i++) {
      try { await enforceRateLimit(fakeCtx(), "lookup", now); } catch { hit = true; }
      now += gapMs;
    }
    assert.equal(hit, expect429, `間隔 ${gapMs}ms`);
  }
});

/* ───────── 請求路徑：限流在資料庫之前，沒有繞過路徑 ───────── */

test("格式正確但不存在的玩家：先經過限流，前 300 次 404（玩家不存在），第 301 次 429", async () => {
  const { db, get } = setup();
  const codes = [];
  for (let i = 0; i < 301; i++) codes.push((await get(`/v1/players/${FAKE}`)).status);
  assert.equal(codes.filter((c) => c === 404).length, 300);
  assert.equal(codes[300], 429);
  const r = await get(`/v1/players/${FAKE}`);
  assert.equal(r.body.error.code, "RATE_LIMITED");
  assert.equal(db.log.filter((q) => q.method === "GET").length, 300, "被限流的請求不會讀資料庫");
});

test("404 的種類可以分辨：路由不存在 NOT_FOUND、玩家不存在 PLAYER_NOT_FOUND、限流 RATE_LIMITED", async () => {
  const { get } = setup();
  assert.equal((await get("/v1/no-such-route")).body.error.code, "NOT_FOUND");
  assert.equal((await get(`/v1/players/${FAKE}`)).body.error.code, "PLAYER_NOT_FOUND");
  assert.equal((await get("/v1/players/not-valid")).body.error.code, "PLAYER_NOT_FOUND");
});

test("沒有繞過路徑：格式錯誤的 ID 也會計入限流（而且不讀資料庫）", async () => {
  const { db, get } = setup();
  for (let i = 0; i < 150; i++) await get(`/v1/players/${FAKE}`);
  for (let i = 0; i < 150; i++) await get("/v1/players/bad-format-" + i);
  assert.equal((await get(`/v1/players/${FAKE}`)).status, 429, "兩種請求共用同一個額度");
  assert.equal((await get("/v1/players/whatever")).status, 429);
  assert.equal(db.log.length, 150, "只有格式正確的 150 次讀了資料庫");
});

test("路由不存在的請求不計入限流，也不讀資料庫", async () => {
  const { db, get } = setup();
  for (let i = 0; i < 400; i++) assert.equal((await get("/v1/nothing")).status, 404);
  assert.equal((await get(`/v1/players/${FAKE}`)).status, 404, "玩家查詢額度未被消耗");
  assert.equal(db.log.length, 1);
});

/* ───────── 可觀測性：分辨官方 binding、binding 失敗、備援 ───────── */

const ruleLogs = (logs) => logs.lines.map((l) => JSON.parse(l));

test("沒有 binding：request 記錄 rl=lookup:memory(missing)，警告每個 binding 只出現一次", async () => {
  const { logs, get } = setup();
  for (let i = 0; i < 5; i++) await get(`/v1/players/${FAKE}`);
  const entries = ruleLogs(logs);
  const reqs = entries.filter((e) => e.msg === "request");
  assert.equal(reqs.length, 5);
  assert.ok(reqs.every((e) => e.rl === "lookup:memory(missing)"));
  const warns = entries.filter((e) => e.msg === "rate limit fallback");
  assert.equal(warns.length, 1);
  assert.equal(warns[0].binding, "RL_LOOKUP_IP");
  assert.equal(warns[0].reason, "missing");
});

test("binding 正常：rl=lookup:binding，沒有備援警告", async () => {
  const binding = { limit: async () => ({ success: true }) };
  const { logs, get } = setup({ RL_LOOKUP_IP: binding });
  await get(`/v1/players/${FAKE}`);
  const entries = ruleLogs(logs);
  assert.equal(entries.find((e) => e.msg === "request").rl, "lookup:binding");
  assert.equal(entries.filter((e) => e.msg === "rate limit fallback").length, 0);
});

test("binding 失敗：rl=lookup:memory(error)，只記錄錯誤類型名稱，不記錄錯誤內容，警告只一次", async () => {
  const binding = { limit: async () => { throw new TypeError("internal detail ya" + "29.SECRETSECRETSECRETSECRETSECRET"); } };
  const { logs, get } = setup({ RL_LOOKUP_IP: binding });
  for (let i = 0; i < 3; i++) assert.equal((await get(`/v1/players/${FAKE}`)).status, 404, "仍正常回應");
  const entries = ruleLogs(logs);
  assert.ok(entries.filter((e) => e.msg === "request").every((e) => e.rl === "lookup:memory(error)"));
  const warns = entries.filter((e) => e.msg === "rate limit fallback");
  assert.equal(warns.length, 1);
  assert.equal(warns[0].error, "TypeError");
  assert.ok(!logs.text().includes("internal detail") && !logs.text().includes("SECRET"));
});

test("建立玩家記錄兩條規則的計數層；非玩家 API 沒有 rl 欄位", async () => {
  const ok = { limit: async () => ({ success: true }) };
  const { logs, get } = setup({ RL_CREATE_IP: ok });
  const db = createFakeRtdb();
  const a = app({ fetch: db.fetch, logSink: logs.sink });
  await a.fetch(req("/v1/players", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": "203.0.113.8" }, body: JSON.stringify({ displayId: "記錄測試", baseAvatarKey: "boy1", createRequestId: crypto.randomUUID() }) }), { ...env, RL_CREATE_IP: ok });
  await get("/health");
  const reqs = ruleLogs(logs).filter((e) => e.msg === "request");
  assert.equal(reqs.find((e) => e.path === "/v1/players").rl, "create:binding,memory(missing)");
  assert.equal(reqs.find((e) => e.path === "/health").rl, undefined);
  assert.ok(!logs.text().includes("記錄測試"), "記錄不含玩家 ID");
});

test("被限流時：既有 rate limited 記錄標示規則與計數層", async () => {
  const deny = { limit: async () => ({ success: false }) };
  const { logs, get } = setup({ RL_LOOKUP_IP: deny });
  assert.equal((await get(`/v1/players/${FAKE}`)).status, 429);
  const e = ruleLogs(logs).find((x) => x.msg === "rate limited");
  assert.equal(e.rule, "lookup-ip");
  assert.equal(e.layer, "binding");
});

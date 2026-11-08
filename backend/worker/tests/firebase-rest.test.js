import { test } from "node:test";
import assert from "node:assert/strict";
import { mockFetch, jsonResponse, DB_URL, captureLogs } from "./helpers.js";
import { createFirebaseClient, encodePath } from "../src/services/firebase-rest.js";
import { createLogger } from "../src/utils/logger.js";

function tokens(list = ["ya" + "29.first-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "ya" + "29.second-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbb"]) {
  let i = 0, invalidated = 0;
  return {
    getToken: async () => list[Math.min(i, list.length - 1)],
    invalidate: () => { invalidated++; i++; },
    get invalidated() { return invalidated; },
  };
}
const db = (respond) => ({ match: (u) => u.startsWith(DB_URL), respond });

test("路徑驗證：拒絕 . # $ [ ] 、空段、控制字元，避免路徑注入", () => {
  assert.equal(encodePath("players/p_abc/profile"), "players/p_abc/profile");
  assert.equal(encodePath("/a/b/"), "a/b");
  assert.equal(encodePath("名字/中文"), "%E5%90%8D%E5%AD%97/%E4%B8%AD%E6%96%87");
  for (const bad of ["a/../b", "a/.b", "a#b", "a$b", "a[0]", "a//b", "a\u0000b", "a/.json"]) {
    assert.throws(() => encodePath(bad), (e) => e.code === "INTERNAL", bad);
  }
});

test("GET：正確網址、Bearer Token 放標頭（不放網址）、shallow 參數", async () => {
  const f = mockFetch([db(() => jsonResponse({ a: true }))]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: f });
  assert.deepEqual(await c.get("players/p_x", { shallow: true }), { a: true });
  const { url, init } = f.calls[0];
  assert.equal(url, `${DB_URL}/players/p_x.json?shallow=true`);
  assert.equal(init.method, "GET");
  assert.match(init.headers.authorization, /^Bearer ya29\./);
  assert.ok(!url.includes("access_token"), "Token 不可出現在網址");
});

test("orderBy 參數依 Firebase 規格加上引號", async () => {
  const f = mockFetch([db(() => jsonResponse({}))]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: f });
  await c.get("leaderboards/tetris", { orderBy: "score", limitToLast: 10 });
  assert.equal(f.calls[0].url, `${DB_URL}/leaderboards/tetris.json?orderBy=%22score%22&limitToLast=10`);
});

test("PUT / PATCH / POST / DELETE 的方法與內容", async () => {
  const f = mockFetch([db((u, init) => (init.method === "POST" ? jsonResponse({ name: "-Nabc" }) : new Response(null, { status: 204 })))]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: f });
  await c.put("a/b", { x: 1 });
  await c.patch("a", { b: 2 });
  assert.equal(await c.post("logs", { y: 1 }), "-Nabc");
  await c.remove("a/b");
  assert.deepEqual(f.calls.map((x) => x.init.method), ["PUT", "PATCH", "POST", "DELETE"]);
  assert.equal(f.calls[0].url, `${DB_URL}/a/b.json?print=silent`);
  assert.equal(f.calls[0].init.body, JSON.stringify({ x: 1 }));
  await assert.rejects(c.remove(""), (e) => e.code === "INTERNAL", "不允許刪除整個資料庫");
  await assert.rejects(c.patch("a", [1]), (e) => e.code === "INTERNAL");
});

test("401 → 清掉 Token 快取並重試一次；第二次仍 401 → UPSTREAM_UNAVAILABLE", async () => {
  const tp = tokens();
  const f = mockFetch([db((u, init) => (init.headers.authorization.includes("second") ? jsonResponse(42) : new Response("{}", { status: 401 })))]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tp, fetch: f });
  assert.equal(await c.get("x"), 42);
  assert.equal(tp.invalidated, 1);

  const always401 = mockFetch([db(() => new Response("{}", { status: 401 }))]);
  const c2 = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: always401 });
  await assert.rejects(c2.get("x"), (e) => e.code === "UPSTREAM_UNAVAILABLE");
  assert.equal(always401.calls.length, 2);
});

test("403（權限不足）→ UPSTREAM_UNAVAILABLE；400 → INTERNAL；回應內容不外流", async () => {
  const f = mockFetch([db((u) => (u.includes("bad") ? new Response('{"error":"Invalid data; secret"}', { status: 400 }) : new Response('{"error":"Permission denied"}', { status: 403 })))]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: f });
  await assert.rejects(c.get("x"), (e) => e.code === "UPSTREAM_UNAVAILABLE" && !e.message.includes("Permission"));
  await assert.rejects(c.put("bad", 1), (e) => e.code === "INTERNAL" && !e.message.includes("secret"));
});

test("讀取遇到 5xx 重試一次；寫入不自動重試", async () => {
  let n = 0;
  const f = mockFetch([db(() => (++n === 1 ? new Response("", { status: 503 }) : jsonResponse("ok")))]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: f });
  assert.equal(await c.get("x"), "ok");
  assert.equal(f.calls.length, 2);

  const w = mockFetch([db(() => new Response("", { status: 503 }))]);
  const c2 = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: w });
  await assert.rejects(c2.put("x", 1), (e) => e.code === "UPSTREAM_UNAVAILABLE");
  assert.equal(w.calls.length, 1);
});

test("逾時 → UPSTREAM_TIMEOUT；網路錯誤 → UPSTREAM_UNAVAILABLE", async () => {
  const hang = mockFetch([db((u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))))]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: hang, timeoutMs: 30 });
  await assert.rejects(c.get("x"), (e) => e.code === "UPSTREAM_TIMEOUT");

  const down = mockFetch([db(() => { throw new TypeError("fetch failed"); })]);
  const c2 = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: down });
  await assert.rejects(c2.put("x", 1), (e) => e.code === "UPSTREAM_UNAVAILABLE");
});

test("ETag 條件寫入：版本相符寫入；不符 → CONFLICT（409）", async () => {
  const f = mockFetch([db((u, init) => {
    if (init.method === "GET") return jsonResponse(null, 200, { etag: "etag-1" });
    return init.headers["if-match"] === "etag-1" ? jsonResponse({ claimed: true }, 200, { etag: "etag-2" }) : new Response("", { status: 412, headers: { etag: "etag-9" } });
  })]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: f });
  const r = await c.getWithEtag("dailyClaims/p_x/2026-11-08");
  assert.equal(r.value, null);
  assert.equal(r.etag, "etag-1");
  assert.equal(f.calls[0].init.headers["x-firebase-etag"], "true");
  const w = await c.putIfMatch("dailyClaims/p_x/2026-11-08", { claimed: true }, r.etag);
  assert.equal(w.etag, "etag-2");
  await assert.rejects(c.putIfMatch("dailyClaims/p_x/2026-11-08", { claimed: true }, "old"), (e) => {
    assert.equal(e.code, "CONFLICT");
    assert.equal(e.status, 409);
    assert.equal(e.currentEtag, "etag-9");
    return true;
  });
  await assert.rejects(c.putIfMatch("a", 1, ""), (e) => e.code === "INTERNAL");
});

test("記錄中不出現 Access Token", async () => {
  const logs = captureLogs();
  const f = mockFetch([db(() => new Response("", { status: 403 }))]);
  const c = createFirebaseClient({ databaseUrl: DB_URL, tokenProvider: tokens(), fetch: f, logger: createLogger({}, logs.sink) });
  await assert.rejects(c.get("x"));
  assert.ok(logs.lines.length > 0);
  assert.ok(!logs.text().includes("ya29."));
});

test("缺少設定時無法建立 Client", () => {
  assert.throws(() => createFirebaseClient({ databaseUrl: "", tokenProvider: tokens() }), (e) => e.code === "SERVICE_NOT_CONFIGURED");
});

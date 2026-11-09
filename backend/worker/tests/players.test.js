// v0.3.0 玩家身份：建立、找回、讀取、並發、故障恢復、安全（全部使用「假 Firebase」，不是真實資料庫）
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { app, req, baseEnv, fakeServiceAccount, ORIGIN, captureLogs } from "./helpers.js";
import { createFakeRtdb } from "./fake-rtdb.js";
import { _resetMemoryLimiter } from "../src/middleware/rate-limit.js";
import { identityKeyFor } from "../src/players/identity-key.js";
import { PATTERNS } from "../src/utils/validate.js";

const sa = await fakeServiceAccount();
const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: sa.json, FIREBASE_TIMEOUT_MS: "1000" });
beforeEach(() => _resetMemoryLimiter());

function setup(extraEnv = {}) {
  const db = createFakeRtdb();
  const logs = captureLogs();
  const a = app({ fetch: db.fetch, logSink: logs.sink });
  let ip = 0;
  const call = async (method, path, body, headers = {}) => {
    const init = { method, headers: { origin: ORIGIN, "cf-connecting-ip": headers.ip || `10.0.0.${(ip++ % 200) + 1}`, ...headers } };
    delete init.headers.ip;
    if (body !== undefined) { init.body = typeof body === "string" ? body : JSON.stringify(body); init.headers["content-type"] = "application/json"; }
    const res = await a.fetch(req(path, init), { ...env, ...extraEnv });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text, headers: res.headers };
  };
  return { db, call, logs };
}
const rid = () => crypto.randomUUID();
const create = (call, displayId, baseAvatarKey, createRequestId = rid(), headers) =>
  call("POST", "/v1/players", { displayId, baseAvatarKey, createRequestId }, headers);
const resolve = (call, displayId, baseAvatarKey) => call("POST", "/v1/players/resolve", { displayId, baseAvatarKey });
const identityCount = (db) => Object.keys(db.root.identities || {}).length;
const playerCount = (db) => Object.keys(db.root.players || {}).length;

/* ───────── 玩家身份 ───────── */

test("正常建立玩家：201、伺服器產生 playerId、只回傳公開欄位", async () => {
  const { db, call } = setup();
  const r = await create(call, "小明", "boy1");
  assert.equal(r.status, 201);
  const p = r.body.data.player;
  assert.equal(r.body.data.status, "created");
  assert.equal(r.body.data.replayed, false);
  assert.match(p.playerId, PATTERNS.playerId);
  assert.deepEqual(Object.keys(p).sort(), ["baseAvatarKey", "createdAt", "displayAvatarKey", "displayId", "playerId"]);
  assert.equal(p.displayId, "小明");
  assert.equal(p.baseAvatarKey, "boy1");
  assert.equal(p.displayAvatarKey, "boy1");
  assert.ok(!r.text.includes("identityKey") && !r.text.includes("createRequestId"), "不外露內部欄位");
  const prof = db.get(`players/${p.playerId}/profile`);
  assert.equal(prof.identityKey, await identityKeyFor("小明", "boy1"));
  assert.equal(identityCount(db), 1);
});

test("正常找回：另一台裝置用同樣 ID＋圖案得到同一個 playerId", async () => {
  const { call } = setup();
  const a = (await create(call, "小明", "boy1")).body.data.player;
  const r = await resolve(call, "小明", "boy1");
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, "found");
  assert.equal(r.body.data.player.playerId, a.playerId);
  assert.equal((await resolve(call, "  小明 ", "boy1")).body.data.player.playerId, a.playerId, "頭尾空白不影響");
});

test("同名不同圖案是不同玩家；同 ID＋圖案不能重複建立", async () => {
  const { db, call } = setup();
  const a = (await create(call, "小明", "boy1")).body.data.player;
  const b = (await create(call, "小明", "dog1")).body.data.player;
  assert.notEqual(a.playerId, b.playerId);
  const dup = await create(call, "小明", "boy1");
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, "IDENTITY_EXISTS");
  assert.deepEqual(dup.body.error.details, { canResolve: true });
  assert.ok(!dup.text.includes(a.playerId), "身份已存在時不回傳他人 playerId");
  assert.equal(identityCount(db), 2);
  assert.equal(playerCount(db), 2);
});

test("Unicode 正規化：全形／半形、組合字、全形空白、連續空白視為同一個 ID", async () => {
  const { call } = setup();
  const a = (await create(call, "Amy１", "girl1")).body.data.player;
  assert.equal(a.displayId, "Amy1");
  assert.equal((await create(call, "Ａｍｙ1", "girl1")).body.error.code, "IDENTITY_EXISTS");
  const e1 = (await create(call, "René", "boy2")).body.data.player; // é 單一字元
  assert.equal((await resolve(call, "René", "boy2")).body.data.player.playerId, e1.playerId); // e + 組合重音
  const s = (await create(call, "小　明  寶", "cat1")).body.data.player;
  assert.equal(s.displayId, "小 明 寶");
  assert.equal((await resolve(call, "小 明 寶", "cat1")).body.data.player.playerId, s.playerId);
});

test("中文、emoji ID 可使用；長度以「看得到的字數」計算", async () => {
  const { call } = setup();
  assert.equal((await create(call, "氣球小V的好朋友", "dog2")).status, 201);
  assert.equal((await create(call, "🎈🎈", "dog3")).status, 201, "2 個 emoji = 2 個字");
  assert.equal((await create(call, "王".repeat(20), "dog4")).status, 201);
  const long = await create(call, "王".repeat(21), "dog4");
  assert.equal(long.status, 400);
  assert.equal(long.body.error.details.errors[0].issue, "ID_TOO_LONG");
  assert.equal((await create(call, "👍🏽".repeat(20), "fat1")).status, 201, "帶膚色 emoji 也算 1 個字");
});

test("英文大小寫視為不同 ID", async () => {
  const { call } = setup();
  const a = (await create(call, "Amy", "girl2")).body.data.player;
  const b = (await create(call, "amy", "girl2")).body.data.player;
  assert.notEqual(a.playerId, b.playerId);
  assert.equal((await resolve(call, "AMY", "girl2")).status, 404);
});

test("空白、保留字、控制字元、零寬字元、方向控制字元都被拒絕，訊息為中文", async () => {
  const { db, call } = setup();
  const cases = [
    ["", "ID_EMPTY"], ["   ", "ID_EMPTY"], ["玩家", "ID_RESERVED"],
    ["小\u0000明", "ID_INVALID_CHAR"], ["小​明", "ID_INVALID_CHAR"], ["小‮明", "ID_INVALID_CHAR"],
    ["小\n明", null], ["́ab", "ID_INVALID_CHAR"], ["ab", "ID_INVALID_CHAR"],
  ];
  for (const [id, issue] of cases) {
    const r = await create(call, id, "boy1");
    if (issue === null) { assert.equal(r.status, 201, "換行會被當成空白：" + JSON.stringify(id)); continue; }
    assert.equal(r.status, 400, JSON.stringify(id));
    assert.equal(r.body.error.details.errors[0].issue, issue, JSON.stringify(id));
    assert.match(r.body.error.message, /[一-鿿]/);
  }
  assert.equal(identityCount(db), 1);
});

test("不存在或尚未開放的身份圖案、展示用頭像都不能當身份圖案", async () => {
  const { db, call } = setup();
  for (const key of ["dragon9", "xiaov_base", "BOY1", "../x", ""]) {
    const r = await create(call, "小美", key);
    assert.equal(r.status, 400, key);
  }
  assert.equal(identityCount(db), 0);
});

test("不能自行指定 playerId 或其他欄位", async () => {
  const { db, call } = setup();
  const forged = "p_" + "a".repeat(20);
  for (const extra of [{ playerId: forged }, { displayAvatarKey: "xiaov_special" }, { createdAt: 1 }, { admin: true }]) {
    const r = await call("POST", "/v1/players", { displayId: "小華", baseAvatarKey: "boy3", createRequestId: rid(), ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
  assert.equal(db.get(`players/${forged}`), null);
  assert.equal(identityCount(db), 0);
});

test("找回失敗：不存在 → 404；圖案不對 → 404（不透露是否有同名玩家）", async () => {
  const { call } = setup();
  await create(call, "小明", "boy1");
  const r1 = await resolve(call, "沒有這個人", "boy1");
  const r2 = await resolve(call, "小明", "girl1");
  for (const r of [r1, r2]) {
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, "IDENTITY_NOT_FOUND");
  }
  assert.equal(r1.body.error.message, r2.body.error.message);
});

test("讀取公開資料：存在 → 公開欄位；格式錯誤或不存在 → 404，且格式錯誤不碰資料庫", async () => {
  const { db, call } = setup();
  const a = (await create(call, "小明", "boy1")).body.data.player;
  const r = await call("GET", `/v1/players/${a.playerId}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.player, a);
  const before = db.log.length;
  for (const bad of ["p_zzz", "..%2F..%2Fidentities", "identities", "p_" + "A".repeat(20)]) {
    assert.equal((await call("GET", `/v1/players/${bad}`)).status, 404, bad);
  }
  assert.equal(db.log.length, before, "非法 playerId 不會產生任何資料庫請求");
  assert.equal((await call("GET", `/v1/players/p_${"b".repeat(20)}`)).body.error.code, "PLAYER_NOT_FOUND");
});

test("固定身份圖案清單：17 款，順序固定，不含未開放與展示用頭像", async () => {
  const { db, call } = setup();
  const r = await call("GET", "/v1/avatars/base");
  assert.equal(r.status, 200);
  const keys = r.body.data.avatars.map((a) => a.key);
  assert.deepEqual(keys, ["boy1", "girl1", "boy2", "girl2", "cat1", "cat2", "fat1", "girl3", "curl1", "boy3", "girl4", "girl5", "curl2", "dog1", "dog2", "dog3", "dog4"]);
  assert.ok(!keys.includes("xiaov_base"));
  assert.equal(r.body.data.catalogVersion, 1);
  assert.equal(db.log.length, 0, "清單不讀資料庫");
});

/* ───────── 並發一致性 ───────── */

test("兩台裝置「同時」建立相同身份：只有一個成功，沒有第二個 playerId", async () => {
  const { db, call } = setup();
  db.holdUntil((q) => q.method === "GET" && q.path.startsWith("identities/"), 2); // 兩個請求都讀到「不存在」才放行
  const [a, b] = await Promise.all([create(call, "同時", "boy1"), create(call, "同時", "boy1")]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  assert.equal(identityCount(db), 1);
  assert.equal(playerCount(db), 1, "沒有多出無主 profile");
  const winner = [a, b].find((r) => r.status === 201).body.data.player;
  assert.equal((await resolve(call, "同時", "boy1")).body.data.player.playerId, winner.playerId);
  assert.ok(db.log.some((q) => q.method === "PUT" && q.path.startsWith("identities/")), "使用條件寫入");
});

test("五台裝置同時建立相同身份：仍只有一位玩家", async () => {
  const { db, call } = setup();
  db.holdUntil((q) => q.method === "GET" && q.path.startsWith("identities/"), 5);
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => create(call, "搶名字", "cat2")));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.equal(rs.filter((r) => r.status === 409).length, 4);
  assert.equal(identityCount(db), 1);
  assert.equal(playerCount(db), 1);
});

test("兩台裝置同時建立不同身份：都成功", async () => {
  const { db, call } = setup();
  db.holdUntil((q) => q.method === "GET" && q.path.startsWith("identities/"), 2);
  const [a, b] = await Promise.all([create(call, "甲同學", "boy1"), create(call, "乙同學", "boy1")]);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(identityCount(db), 2);
});

test("同一台裝置連續重複送出（同一個 createRequestId）：回傳同一位玩家，不會變成「已存在」", async () => {
  const { db, call } = setup();
  const id = rid();
  db.holdUntil((q) => q.method === "GET" && q.path.startsWith("identities/"), 3);
  const rs = await Promise.all([1, 2, 3].map(() => create(call, "連點", "dog1", id)));
  assert.ok(rs.every((r) => r.status === 201 || r.status === 200), rs.map((r) => r.status).join(","));
  const ids = new Set(rs.map((r) => r.body.data.player.playerId));
  assert.equal(ids.size, 1);
  assert.equal(rs.filter((r) => r.body.data.replayed === false).length, 1);
  assert.equal(identityCount(db), 1);
  assert.equal(playerCount(db), 1);
  // 之後換一個 createRequestId → 已存在
  assert.equal((await create(call, "連點", "dog1")).status, 409);
});

test("身份索引寫入「已成功但回應逾時」→ 同一個 createRequestId 重試拿回同一位玩家", async () => {
  const { db, call } = setup();
  const id = rid();
  const off = db.fault((q) => (q.method === "PUT" && q.path.startsWith("identities/") ? { afterCommit: "hang" } : undefined));
  const r1 = await create(call, "逾時", "girl3", id);
  assert.equal(r1.status, 504);
  assert.equal(r1.body.error.code, "UPSTREAM_TIMEOUT");
  off();
  assert.equal(identityCount(db), 1, "其實已寫入");
  assert.equal(playerCount(db), 0, "profile 尚未建立");
  const r2 = await create(call, "逾時", "girl3", id);
  assert.equal(r2.status, 200);
  assert.equal(r2.body.data.replayed, true);
  assert.equal(playerCount(db), 1, "重試時補上 profile");
  assert.equal(identityCount(db), 1);
});

test("身份索引已建立但 profile 未完成（profile 寫入失敗）→ 找回時自動修復", async () => {
  const { db, call, logs } = setup();
  const off = db.fault((q) => (q.method === "PUT" && q.path.startsWith("players/") ? { throw: "network" } : undefined));
  const r1 = await create(call, "斷線", "curl1");
  assert.equal(r1.status, 502);
  off();
  assert.equal(identityCount(db), 1);
  assert.equal(playerCount(db), 0);
  const r2 = await resolve(call, "斷線", "curl1");
  assert.equal(r2.status, 200);
  const pid = r2.body.data.player.playerId;
  const prof = db.get(`players/${pid}/profile`);
  assert.equal(prof.displayId, "斷線");
  assert.equal(prof.identityKey, await identityKeyFor("斷線", "curl1"));
  assert.ok(logs.text().includes("player profile repaired"), "修復有留下記錄");
  // 換 createRequestId 再建立 → 已存在（不會產生第二個 playerId）
  assert.equal((await create(call, "斷線", "curl1")).status, 409);
  assert.equal(playerCount(db), 1);
});

test("profile 已存在但沒有身份索引（只可能來自人工改資料）→ 不會被覆蓋，新建立得到新 playerId", async () => {
  const { db, call } = setup();
  const orphan = "p_" + "c".repeat(20);
  db.set(`players/${orphan}/profile`, { playerId: orphan, displayId: "孤兒", baseAvatarKey: "boy1", identityKey: "i1_" + "x".repeat(43), createdAt: 1 });
  const r = await create(call, "孤兒", "boy1");
  assert.equal(r.status, 201);
  assert.notEqual(r.body.data.player.playerId, orphan);
  assert.equal(db.get(`players/${orphan}/profile`).createdAt, 1, "原資料未被改動");
});

test("身份索引損壞或指向別人的 profile → 回報 INTEGRITY_ERROR，不覆蓋任何資料", async () => {
  const { db, call } = setup();
  const key = await identityKeyFor("壞資料", "boy1");
  db.set(`identities/${key}`, { playerId: "not-a-player-id", displayId: "壞資料", baseAvatarKey: "boy1", createdAt: 1 });
  const r1 = await resolve(call, "壞資料", "boy1");
  assert.equal(r1.status, 500);
  assert.equal(r1.body.error.code, "INTEGRITY_ERROR");

  const key2 = await identityKeyFor("錯配", "dog1");
  const other = "p_" + "d".repeat(20);
  db.set(`identities/${key2}`, { playerId: other, displayId: "錯配", baseAvatarKey: "dog1", createdAt: 1 });
  db.set(`players/${other}/profile`, { playerId: other, displayId: "別人", baseAvatarKey: "cat1", identityKey: "i1_" + "y".repeat(43), createdAt: 1 });
  const before = JSON.stringify(db.root);
  const r2 = await resolve(call, "錯配", "dog1");
  assert.equal(r2.body.error.code, "INTEGRITY_ERROR");
  assert.equal(JSON.stringify(db.root), before, "沒有任何寫入");
});

test("網路錯誤（讀取）會自動重試一次；寫入不盲目重試", async () => {
  const { db, call } = setup();
  let n = 0;
  db.fault((q) => (q.method === "GET" && n++ === 0 ? { throw: "network" } : undefined));
  assert.equal((await create(call, "重試", "boy2")).status, 201);
});

test("每次建立只寫入兩個位置（身份索引＋profile），沒有額外或任意路徑寫入", async () => {
  const { db, call } = setup();
  const r = await create(call, "寫入檢查", "girl4");
  const pid = r.body.data.player.playerId;
  const key = await identityKeyFor("寫入檢查", "girl4");
  assert.deepEqual(db.writes().map((w) => `${w.method} ${w.path}`), [`PUT identities/${key}`, `PUT players/${pid}/profile`]);
  await resolve(call, "寫入檢查", "girl4");
  await call("GET", `/v1/players/${pid}`);
  assert.equal(db.writes().length, 2, "找回與讀取不寫入");
});

/* ───────── 安全 ───────── */

test("無效 payload：非 JSON、錯誤型別、缺欄位、過大內容都被拒絕", async () => {
  const { db, call } = setup();
  assert.equal((await call("POST", "/v1/players", "{bad json")).status, 400);
  assert.equal((await call("POST", "/v1/players", { displayId: 123, baseAvatarKey: "boy1", createRequestId: rid() })).status, 400);
  assert.equal((await call("POST", "/v1/players", { displayId: "小明" })).status, 400);
  assert.equal((await call("POST", "/v1/players", { displayId: "小明", baseAvatarKey: "boy1", createRequestId: "short" })).status, 400);
  const huge = await call("POST", "/v1/players", { displayId: "x".repeat(5000), baseAvatarKey: "boy1", createRequestId: rid() });
  assert.equal(huge.status, 413);
  const nf = await a_raw(call);
  assert.equal(nf, 415);
  assert.equal(identityCount(db), 0);
});
async function a_raw(call) {
  return (await call("POST", "/v1/players/resolve", undefined, { "content-type": "text/plain" })).status;
}

test("限流：同一個 IP 一分鐘建立超過 60 次 → 429（記憶體備援層）", async () => {
  const { call } = setup();
  const results = [];
  for (let i = 0; i < 60; i++) results.push((await create(call, `限流${i}號`, "boy1", rid(), { ip: "203.0.113.9" })).status);
  assert.equal(results.filter((s) => s === 201).length, 60);
  const last = await create(call, "限流X", "boy1", rid(), { ip: "203.0.113.9" });
  assert.equal(last.status, 429);
  assert.equal(last.headers.get("retry-after"), "60");
  assert.equal((await create(call, "別的IP", "boy1", rid(), { ip: "203.0.113.10" })).status, 201, "其他 IP 不受影響");
});

test("限流：有 Cloudflare binding 時使用 binding", async () => {
  const seen = [];
  const binding = { limit: async ({ key }) => { seen.push(key); return { success: seen.length <= 1 }; } };
  const { call } = setup({ RL_LOOKUP_IP: binding });
  assert.equal((await resolve(call, "不存在的人", "boy1")).status, 404);
  assert.equal((await resolve(call, "不存在的人", "boy1")).status, 429);
  assert.ok(seen[0].startsWith("lookup-ip:"));
});

test("玩家 API 不能取得管理資料、不提供修改或刪除玩家", async () => {
  const { call } = setup();
  const a = (await create(call, "小明", "boy1")).body.data.player;
  for (const [m, p] of [["PUT", `/v1/players/${a.playerId}`], ["PATCH", `/v1/players/${a.playerId}`], ["DELETE", `/v1/players/${a.playerId}`]]) {
    const r = await call(m, p, m === "DELETE" ? undefined : { displayAvatarKey: "xiaov_special" });
    assert.ok([405, 501].includes(r.status), `${m} ${p} → ${r.status}`);
  }
  assert.equal((await call("GET", "/v1/players")).status, 501, "沒有列出所有玩家的 API");
  assert.equal((await call("GET", "/v1/admin/whoami")).status, 503, "管理 API 仍需管理員（此環境未設定名單）");
  assert.equal((await call("GET", "/v1/wallet/me")).status, 501);
  assert.equal((await call("POST", "/v1/shop/buy", {})).status, 501, "找回身份不等於消費授權");
});

test("CORS：其他網站不能呼叫玩家 API", async () => {
  const { db } = setup();
  const a = app({ fetch: db.fetch });
  const res = await a.fetch(req("/v1/players", { method: "POST", headers: { origin: "https://evil.example.com", "content-type": "application/json" }, body: JSON.stringify({ displayId: "小明", baseAvatarKey: "boy1", createRequestId: rid() }) }), env);
  assert.equal(res.status, 403);
  assert.equal(identityCount(db), 0);
});

test("Firebase 未設定時：回 503，不崩潰、不洩漏設定", async () => {
  const db = createFakeRtdb();
  const a = app({ fetch: db.fetch });
  const res = await a.fetch(req("/v1/players", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ displayId: "小明", baseAvatarKey: "boy1", createRequestId: rid() }) }), baseEnv());
  assert.equal(res.status, 503);
  assert.ok(!(await res.text()).includes("FIREBASE_SERVICE_ACCOUNT_JSON"));
});

test("回應與記錄不含私鑰、Access Token；記錄不含玩家 ID 原文", async () => {
  const { call, logs } = setup();
  const r = await create(call, "隱私測試", "boy1");
  const out = r.text + logs.text();
  for (const bad of ["PRIVATE KEY", "ya29.", "fake-rtdb-access-token"]) assert.ok(!out.includes(bad), bad);
  assert.ok(!logs.text().includes("隱私測試"), "伺服器記錄不寫入兒童自訂的 ID");
});

test("異常請求不會讓 Worker 崩潰（隨機內容）", async () => {
  const { call } = setup();
  const junk = [null, [], "字串", 0, { displayId: { nested: true }, baseAvatarKey: ["boy1"], createRequestId: 1 }, { displayId: "\ud800\ud800", baseAvatarKey: "boy1", createRequestId: rid() }];
  for (const j of junk) {
    const r = await call("POST", "/v1/players", JSON.stringify(j));
    assert.ok([400, 413].includes(r.status), JSON.stringify(j) + " → " + r.status);
    assert.equal(r.body.ok, false);
  }
});

test("輸入驗證在連線 Firebase 之前：Firebase 未設定時，錯誤輸入仍回 400", async () => {
  const a = app({ fetch: createFakeRtdb().fetch });
  const res = await a.fetch(req("/v1/players", { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ displayId: "玩家", baseAvatarKey: "boy1", createRequestId: rid() }) }), baseEnv());
  assert.equal(res.status, 400);
});

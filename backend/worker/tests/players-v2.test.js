// v0.3.0-test-2：ID 長度改回大廳 1～20 字、大廳相容性、學校共用網路限流（全部用「假 Firebase」，不是真實資料庫）
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, req, baseEnv, fakeServiceAccount, ORIGIN } from "./helpers.js";
import { createFakeRtdb } from "./fake-rtdb.js";
import { _resetMemoryLimiter, RULES } from "../src/middleware/rate-limit.js";
import { normalizeDisplayId, ID_RULES } from "../src/players/id-rules.js";
import { BASE_AVATARS } from "../src/players/base-avatars.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sa = await fakeServiceAccount();
const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: sa.json });
beforeEach(() => _resetMemoryLimiter());

function setup(extraEnv = {}) {
  const db = createFakeRtdb();
  const a = app({ fetch: db.fetch });
  let n = 0;
  const call = async (method, path, body, ip) => {
    const headers = { origin: ORIGIN, "cf-connecting-ip": ip || `10.1.${Math.floor(n / 250)}.${(n++ % 250) + 1}` };
    const init = { method, headers };
    if (body !== undefined) { init.body = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await a.fetch(req(path, init), { ...env, ...extraEnv });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  return { db, call };
}
const rid = () => crypto.randomUUID();
const create = (call, displayId, baseAvatarKey = "boy1", ip) => call("POST", "/v1/players", { displayId, baseAvatarKey, createRequestId: rid() }, ip);
const resolve = (call, displayId, baseAvatarKey = "boy1", ip) => call("POST", "/v1/players/resolve", { displayId, baseAvatarKey }, ip);

/* ───────── ID 長度與大廳相容 ───────── */

test("1 字 ID 可以建立；20 字可以；21 字被拒絕", async () => {
  const { call } = setup();
  assert.equal((await create(call, "A")).status, 201);
  assert.equal((await create(call, "明", "girl1")).status, 201);
  assert.equal((await create(call, "王".repeat(20))).status, 201);
  const r = await create(call, "王".repeat(21));
  assert.equal(r.status, 400);
  assert.equal(r.body.error.details.errors[0].issue, "ID_TOO_LONG");
  assert.match(r.body.error.message, /20/);
  assert.equal(ID_RULES.minChars, 1);
  assert.equal(ID_RULES.maxChars, 20);
});

test("大廳 v0.3.3 接受的一般 ID，後端全部接受（以大廳的規則抽樣比對）", () => {
  // 大廳 identity.js：trim 後非空、Array.from 長度 ≤ 20、不是「玩家」
  const lobbyAccepts = (s) => { const t = s.trim(); return t.length > 0 && Array.from(t).length <= 20 && t !== "玩家"; };
  const samples = [
    "A", "小明", "Amy", "amy", "AMY", "王小明123", "小 明", "Tom & Jerry", "派對王#1", "ㄅㄆㄇ", "あいう", "한글",
    "🎈", "🎈小V", "👍🏽", "👨‍👩‍👧", "👩🏽‍💻", "🏳️‍🌈", "🇹🇼", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "1️⃣", "ＡＢＣ", "１２３", "小　明",
    "王".repeat(20), "a".repeat(20), "🎈".repeat(20), "(^_^)", "～小美～", "Ｑ小V", "  前後空白  ",
  ];
  for (const s of samples) {
    if (!lobbyAccepts(s)) continue;
    const r = normalizeDisplayId(s);
    assert.ok(r.ok, `大廳接受但後端拒絕：${JSON.stringify(s)} → ${r.code}`);
  }
});

test("大廳會接受、後端仍拒絕的只有隱形或危險字元（刻意保留的安全檢查）", () => {
  for (const s of ["小​明", "小‮明", "小\u0007明", "ab", "́ab", "小‍明"]) {
    assert.equal(normalizeDisplayId(s).ok, false, JSON.stringify(s));
  }
});

test("emoji：家庭、職業、彩虹旗、地區旗都算 1 個字；拆開的隱形連接字元被拒絕", () => {
  for (const s of ["👨‍👩‍👧", "👩🏽‍💻", "🏳️‍🌈", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "🇹🇼", "1️⃣"]) {
    const r = normalizeDisplayId(s);
    assert.ok(r.ok, s);
    assert.equal(r.chars, 1, s);
  }
  for (const s of ["‍🎈", "🎈‍", "a‍🎈", "🎈‍a"]) assert.equal(normalizeDisplayId(s).ok, false, JSON.stringify(s));
});

test("顯示值：全形變半形、連續空白合併時回 displayIdChanged:true，並回傳實際 displayId", async () => {
  const { call } = setup();
  const a = await create(call, "Ａｍｙ１", "girl2");
  assert.equal(a.status, 201);
  assert.equal(a.body.data.displayIdChanged, true);
  assert.equal(a.body.data.player.displayId, "Amy1");
  const b = await create(call, "  小明  ", "girl3");
  assert.equal(b.body.data.displayIdChanged, false, "只去頭尾空白不算改變");
  assert.equal(b.body.data.player.displayId, "小明");
  const c = await create(call, "小  明", "girl4");
  assert.equal(c.body.data.displayIdChanged, true);
  assert.equal(c.body.data.player.displayId, "小 明");
  const r = await resolve(call, "Amy1", "girl2");
  assert.equal(r.body.data.displayIdChanged, false);
  assert.equal(r.body.data.player.playerId, a.body.data.player.playerId);
  const r2 = await resolve(call, "Ａｍｙ１", "girl2");
  assert.equal(r2.body.data.displayIdChanged, true);
  assert.equal(r2.body.data.player.playerId, a.body.data.player.playerId, "全形輸入也找得回");
});

test("英文大小寫、保留字規則與 test-1 相同", async () => {
  const { call } = setup();
  const a = (await create(call, "Ben")).body.data.player;
  const b = (await create(call, "ben")).body.data.player;
  assert.notEqual(a.playerId, b.playerId);
  assert.equal((await create(call, "玩家")).body.error.details.errors[0].issue, "ID_RESERVED");
  assert.equal((await create(call, " 玩家 ")).body.error.details.errors[0].issue, "ID_RESERVED");
});

test("原有 17 款身份圖案鍵值與順序不變，且全部 active", () => {
  assert.deepEqual(BASE_AVATARS.slice(0, 17).map((a) => a.key), ["boy1", "girl1", "boy2", "girl2", "cat1", "cat2", "fat1", "girl3", "curl1", "boy3", "girl4", "girl5", "curl2", "dog1", "dog2", "dog3", "dog4"]);
  assert.ok(BASE_AVATARS.every((a) => a.status === "active"));
});

/* ───────── 學校共用網路與限流 ───────── */

test("學校情境：40 位學生同一個 IP、一分鐘內各建立一次身份 → 全部成功", async () => {
  const { db, call } = setup();
  const school = "203.0.113.50";
  const rs = [];
  for (let i = 1; i <= 40; i++) rs.push(await create(call, `同學${i}`, "boy1", school));
  assert.equal(rs.filter((r) => r.status === 201).length, 40);
  assert.equal(Object.keys(db.root.identities).length, 40);
});

test("學校情境：全班同時找回、重試 → 不會被擋（每 IP 每分鐘 300 次）", async () => {
  const { call } = setup();
  const school = "203.0.113.51";
  for (let i = 1; i <= 30; i++) await create(call, `學生${i}`, "cat1", school);
  const codes = [];
  for (let round = 0; round < 3; round++) for (let i = 1; i <= 30; i++) codes.push((await resolve(call, `學生${i}`, "cat1", school)).status);
  assert.equal(codes.length, 90);
  assert.ok(codes.every((c) => c === 200));
});

test("單一來源大量建立：第 61 次 → 429，Retry-After 60", async () => {
  const { call } = setup();
  const bot = "198.51.100.66";
  for (let i = 0; i < 60; i++) assert.equal((await create(call, `機器人${i}`, "dog1", bot)).status, 201);
  const r = await create(call, "機器人X", "dog1", bot);
  assert.equal(r.status, 429);
  assert.equal(r.body.error.code, "RATE_LIMITED");
  assert.equal(r.headers.get("retry-after"), "60");
});

test("建立與找回分開計數：建立額度用完，同一個 IP 仍可以找回", async () => {
  const { call } = setup();
  const ip = "198.51.100.70";
  for (let i = 0; i < 60; i++) await create(call, `額度${i}`, "dog2", ip);
  assert.equal((await create(call, "額度X", "dog2", ip)).status, 429);
  assert.equal((await resolve(call, "額度0", "dog2", ip)).status, 200);
});

test("全體建立上限：攻擊者換很多 IP，同一機房每分鐘最多 300 個新玩家", async () => {
  const { db, call } = setup();
  const codes = [];
  for (let i = 0; i < 301; i++) codes.push((await create(call, `分散${i}`, "girl5", `192.0.2.${i % 250}`)).status);
  assert.equal(codes.filter((c) => c === 201).length, 300);
  assert.equal(codes[300], 429);
  assert.equal(Object.keys(db.root.identities).length, 300, "寫入量被限制住");
});

test("有 Cloudflare binding 時：三條規則都走 binding，鍵值正確，不使用玩家自填內容", async () => {
  const keys = {};
  const mk = (name) => ({ limit: async ({ key }) => { (keys[name] ||= []).push(key); return { success: true }; } });
  const { call } = setup({ RL_CREATE_IP: mk("RL_CREATE_IP"), RL_CREATE_GLOBAL: mk("RL_CREATE_GLOBAL"), RL_LOOKUP_IP: mk("RL_LOOKUP_IP") });
  await create(call, "綁定測試", "boy2", "203.0.113.99");
  await resolve(call, "綁定測試", "boy2", "203.0.113.99");
  assert.deepEqual(keys.RL_CREATE_IP, ["create-ip:203.0.113.99"]);
  assert.deepEqual(keys.RL_CREATE_GLOBAL, ["create-global:all"]);
  assert.deepEqual(keys.RL_LOOKUP_IP, ["lookup-ip:203.0.113.99"]);
  assert.ok(!JSON.stringify(keys).includes("綁定測試"), "限流鍵不含玩家 ID");
});

test("binding 回報超過上限 → 429；binding 故障 → 退回記憶體計數，不讓 API 掛掉", async () => {
  const deny = { limit: async () => ({ success: false }) };
  const { call } = setup({ RL_CREATE_GLOBAL: deny });
  assert.equal((await create(call, "被擋")).status, 429);
  const broken = { limit: async () => { throw new Error("binding down"); } };
  const s2 = setup({ RL_CREATE_IP: broken, RL_CREATE_GLOBAL: broken, RL_LOOKUP_IP: broken });
  assert.equal((await create(s2.call, "照常建立")).status, 201);
});

test("不合法請求不會產生任何資料庫操作", async () => {
  const { db, call } = setup();
  const bad = [
    { displayId: "", baseAvatarKey: "boy1", createRequestId: rid() },
    { displayId: "王".repeat(21), baseAvatarKey: "boy1", createRequestId: rid() },
    { displayId: "小​明", baseAvatarKey: "boy1", createRequestId: rid() },
    { displayId: "小明", baseAvatarKey: "dragon", createRequestId: rid() },
    { displayId: "小明", baseAvatarKey: "boy1", createRequestId: "x" },
    { displayId: "小明", baseAvatarKey: "boy1", createRequestId: rid(), playerId: "p_" + "a".repeat(20) },
  ];
  for (const b of bad) assert.equal((await call("POST", "/v1/players", b)).status, 400);
  for (const b of [{ displayId: "", baseAvatarKey: "boy1" }, { displayId: "小明", baseAvatarKey: "../x" }]) {
    assert.equal((await call("POST", "/v1/players/resolve", b)).status, 400);
  }
  assert.equal((await call("GET", "/v1/players/not-a-player")).status, 404);
  assert.equal(db.log.length, 0, "沒有任何資料庫請求");
});

test("wrangler.jsonc 的 ratelimits 與程式 RULES 完全一致", () => {
  const raw = readFileSync(join(root, "wrangler.jsonc"), "utf8");
  const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
  const fromCode = Object.values(RULES).flat().map((r) => ({ name: r.binding, limit: r.limit, period: r.periodSec })).sort((a, b) => a.name.localeCompare(b.name));
  const fromCfg = cfg.ratelimits.map((r) => ({ name: r.name, limit: r.simple.limit, period: r.simple.period })).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(fromCfg, fromCode);
  for (const r of cfg.ratelimits) {
    assert.ok([10, 60].includes(r.simple.period));
    assert.match(r.namespace_id, /^\d+$/);
  }
  assert.equal(new Set(cfg.ratelimits.map((r) => r.namespace_id)).size, cfg.ratelimits.length, "namespace_id 不重複");
});

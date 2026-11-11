// v0.3.4：身份圖案目錄擴充為 33 款（模擬 Firebase；不是正式資料庫）
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { app, req, baseEnv, fakeServiceAccount, ORIGIN } from "./helpers.js";
import { createFakeRtdb } from "./fake-rtdb.js";
import { _resetMemoryLimiter } from "../src/middleware/rate-limit.js";
import { BASE_AVATARS, AVATAR_KEY_PATTERN, publicBaseAvatarList } from "../src/players/base-avatars.js";
import { identityKeyFor } from "../src/players/identity-key.js";

const sa = await fakeServiceAccount();
const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: sa.json });
beforeEach(() => _resetMemoryLimiter());

export const NEW_16 = [
  "avatar_rabbit_hoodie", "avatar_koala_hoodie", "avatar_unicorn_cape", "avatar_boy_star_hat",
  "avatar_turtle", "avatar_girl_bow", "avatar_panda_hoodie", "avatar_fox_blue_hat",
  "avatar_leopard_gecko", "avatar_blue_tongue_skink", "avatar_bearded_dragon", "avatar_hamster_hoodie",
  "avatar_green_iguana", "avatar_corn_snake", "avatar_dragon_purple_robe", "avatar_penguin_hoodie",
];

test("新增 16 款：鍵值等於美術檔名、順序 18～33、全部 active、符合鍵值格式", () => {
  const tail = BASE_AVATARS.slice(17);
  assert.deepEqual(tail.map((a) => a.key), NEW_16);
  tail.forEach((a, i) => {
    assert.equal(a.order, 18 + i);
    assert.equal(a.status, "active");
    assert.match(a.key, AVATAR_KEY_PATTERN);
    assert.ok(a.label && a.label.length <= 6, a.key);
  });
});

test("33 款鍵值、順序、名稱都不重複", () => {
  assert.equal(BASE_AVATARS.length, 33);
  assert.equal(new Set(BASE_AVATARS.map((a) => a.key)).size, 33);
  assert.equal(new Set(BASE_AVATARS.map((a) => a.order)).size, 33);
  assert.equal(new Set(BASE_AVATARS.map((a) => a.label)).size, 33);
  assert.deepEqual(publicBaseAvatarList().map((a) => a.order), Array.from({ length: 33 }, (_, i) => i + 1));
});

test("展示用／特殊頭像不在身份圖案清單中", () => {
  const keys = BASE_AVATARS.map((a) => a.key);
  for (const k of ["xiaov_base", "xiaov_special", "balloon_brother_01", "student_hanhan_01", "student_xuanxuan_01"]) assert.ok(!keys.includes(k), k);
});

function setup() {
  const db = createFakeRtdb();
  const a = app({ fetch: db.fetch });
  let n = 0;
  const post = async (path, body) => {
    const res = await a.fetch(req(path, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": `10.9.0.${++n}` }, body: JSON.stringify(body) }), env);
    return { status: res.status, body: await res.json() };
  };
  return { db, post };
}

test("每一款新圖案都能建立玩家、也能找回同一個 playerId", async () => {
  const { post } = setup();
  for (const key of NEW_16) {
    const c = await post("/v1/players", { displayId: "新圖案測試", baseAvatarKey: key, createRequestId: crypto.randomUUID() });
    assert.equal(c.status, 201, key);
    const r = await post("/v1/players/resolve", { displayId: "新圖案測試", baseAvatarKey: key });
    assert.equal(r.body.data.player.playerId, c.body.data.player.playerId, key);
  }
});

test("新增圖案不影響既有身份：舊玩家的 identityKey 與 playerId 不變，可照常找回", async () => {
  const { db, post } = setup();
  // 模擬目前正式資料庫裡的 3 位測試玩家（由 v0.3.0 建立）
  const existing = [["測試甲", "boy1"], ["測試甲", "dog1"], ["測試乙", "girl1"]];
  const ids = [];
  for (const [displayId, base] of existing) ids.push((await post("/v1/players", { displayId, baseAvatarKey: base, createRequestId: crypto.randomUUID() })).body.data.player.playerId);
  for (let i = 0; i < existing.length; i++) {
    const [displayId, base] = existing[i];
    const key = await identityKeyFor(displayId, base);
    assert.equal(db.get(`identities/${key}`).playerId, ids[i], "identityKey 計算方式未改變");
    assert.equal((await post("/v1/players/resolve", { displayId, baseAvatarKey: base })).body.data.player.playerId, ids[i]);
  }
  // 同一個 ID 用新圖案是「另一位」玩家，不會改寫舊玩家
  const n = await post("/v1/players", { displayId: "測試甲", baseAvatarKey: "avatar_panda_hoodie", createRequestId: crypto.randomUUID() });
  assert.equal(n.status, 201);
  assert.ok(!ids.includes(n.body.data.player.playerId));
  assert.equal((await post("/v1/players/resolve", { displayId: "測試甲", baseAvatarKey: "boy1" })).body.data.player.baseAvatarKey, "boy1");
});

test("未登記的圖案（例如舊遊戲的展示頭像）仍不能建立身份", async () => {
  const { post } = setup();
  for (const k of ["avatar_cat_hoodie", "xiaov_base", "avatar_rabbit_hoodie2"]) {
    assert.equal((await post("/v1/players", { displayId: "小明", baseAvatarKey: k, createRequestId: crypto.randomUUID() })).status, 400, k);
  }
});

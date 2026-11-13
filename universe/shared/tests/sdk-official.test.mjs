// SDK 正式成績流程 ↔ 後端 Worker（同一份程式碼，在本機用「假 Firebase」執行；屬於本機模擬測試，不是正式環境）
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { app, baseEnv, fakeServiceAccount, ORIGIN } from "../../../backend/worker/tests/helpers.js";
import { createFakeRtdb } from "../../../backend/worker/tests/fake-rtdb.js";
import { _resetMemoryLimiter } from "../../../backend/worker/src/middleware/rate-limit.js";

const require = createRequire(import.meta.url);
const U = require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../universe-sdk.js"));
const sa = await fakeServiceAccount();

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _map: m };
}

function world(flags = { SCORES_ENABLED: "on", REWARDS_ENABLED: "on" }) {
  _resetMemoryLimiter();
  const db = createFakeRtdb();
  const clock = { t: Date.now() };
  const a = app({ fetch: db.fetch, now: () => clock.t });
  const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: sa.json, ...flags });
  const calls = [];
  let n = 0;
  const net = { down: false, loseResponse: 0 };
  const fetch = async (url, init = {}) => {
    calls.push({ method: init.method || "GET", url });
    if (net.down) throw new TypeError("Failed to fetch");
    const headers = new Headers(init.headers || {});
    headers.set("origin", ORIGIN); headers.set("cf-connecting-ip", "10.5.0." + ((n++ % 250) + 1));
    const res = await a.fetch(new Request(url, { method: init.method, headers, body: init.body }), env);
    if (net.loseResponse > 0 && (init.method === "POST") && url.endsWith("/v1/scores")) { net.loseResponse--; throw new TypeError("connection reset"); }
    return res;
  };
  async function createPlayer(name, avatar = "boy1") {
    const r = await fetch(U.DEFAULT_API_BASE + "/v1/players", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayId: name, baseAvatarKey: avatar, createRequestId: crypto.randomUUID() }) });
    return (await r.json()).data.player.playerId;
  }
  function session(gameId, playerId, o = {}) {
    return U.createGameSession({ gameId, gameVersion: "test-1", location: { search: "?bvPlayerId=" + playerId + (o.sandbox ? "&sandbox=1" : "") },
      localStorage: o.local || memStorage(), sessionStorage: memStorage(), fetch, sleep: async () => {}, mockPlayers: o.sandbox ? [{ playerId, displayId: "沙盒", baseAvatarKey: "boy1" }] : undefined });
  }
  return { db, clock, calls, net, createPlayer, session };
}
const TETRIS = { score: 2400, level: 2, lines: 12, peakCombo: 3, difficulty: "normal" };

test("正式模式：開局取得場次 → 結算送出 → 伺服器接受、入榜、發 V幣；錢包與排行榜可讀", async () => {
  const w = world();
  const pid = await w.createPlayer("SDK甲");
  const s = w.session("tetris", pid);
  await s.start();
  await s.official.init();
  assert.equal(s.official.isEnabled(), true);
  const run = await s.official.beginRun();
  assert.equal(run.official, true); assert.match(run.sessionId, /^s_/);
  w.clock.t += 120000;
  const r = await s.official.submitRun(run, TETRIS);
  assert.equal(r.status, "accepted"); assert.equal(r.balance, 40);
  assert.match(s.describeOfficialResult(r), /已記入正式排行榜｜🪙 每日遊玩 \+30、今日挑戰 \+10 V幣/);
  const board = await s.official.getBoard("total");
  assert.equal(board.rows[0].playerId, pid); assert.equal(board.me.rank, 1);
  const wallet = await s.official.getWallet();
  assert.equal(wallet.balance, 40); assert.equal(wallet.spending.enabled, false);
});

test("正式寫入未啟用（預設）：beginRun 回傳 official:false，SDK 不會呼叫任何寫入 API", async () => {
  const w = world({});
  const pid = await w.createPlayer("SDK乙");
  const s = w.session("rhythm", pid);
  await s.start();
  const before = w.calls.length;
  const run = await s.official.beginRun();
  assert.deepEqual(run, { official: false, reason: "disabled" });
  assert.ok(w.calls.slice(before).every((c) => c.method === "GET"), "只讀取 /v1/launch/status");
  await assert.rejects(s.official.submitRun(run, TETRIS), (e) => e.kind === "disabled");
  assert.equal(w.db.get("sessions"), null);
});

test("沙盒：永遠不呼叫正式 API（連狀態也不讀）", async () => {
  const w = world();
  const s = w.session("tetris", "p_aaaaaaaaaaaaaaaaaaaa", { sandbox: true });
  await s.start();
  const run = await s.official.beginRun();
  assert.equal(run.official, false); assert.equal(run.reason, "sandbox");
  assert.equal(w.calls.length, 0);
});

test("回應中斷：自動重送同一筆（同 submissionId），不會重複計分或加幣", async () => {
  const w = world();
  const pid = await w.createPlayer("SDK丙");
  const s = w.session("tetris", pid);
  await s.start();
  const run = await s.official.beginRun();
  w.clock.t += 120000;
  w.net.loseResponse = 1;   // 伺服器已處理，但回應遺失
  const r = await s.official.submitRun(run, TETRIS);
  assert.equal(r.replayed, true); assert.equal(r.balance, 40);
  assert.equal(Object.keys(w.db.get(`wallets/${pid}`).ledger).length, 2);
});

test("斷線：重試仍失敗 → 放進本機待送清單；網路恢復後補送成功、只入帳一次", async () => {
  const w = world();
  const pid = await w.createPlayer("SDK丁");
  const local = memStorage();
  const s = w.session("tetris", pid, { local });
  await s.start();
  const run = await s.official.beginRun();
  w.clock.t += 120000;
  w.net.down = true;
  await assert.rejects(s.official.submitRun(run, TETRIS), (e) => e.kind === "network" && e.queued === true);
  assert.equal(s.official.pendingCount(), 1);
  w.net.down = false;
  // 重新進遊戲（新的 session 物件、同一個本機儲存）
  const s2 = w.session("tetris", pid, { local });
  await s2.start(); await s2.official.init();
  const sent = await s2.official.flushOutbox();
  assert.equal(sent.length, 1); assert.equal(sent[0].status, "accepted");
  assert.equal(s2.official.pendingCount(), 0);
  assert.equal(w.db.get(`wallets/${pid}`).balance, 40);
});

test("玩家 A 的待送成績不會被玩家 B 送出；遊戲中切換玩家則這一場不送", async () => {
  const w = world();
  const a = await w.createPlayer("SDK戊"), b = await w.createPlayer("SDK己", "girl1");
  const s = w.session("tetris", a);
  await s.start();
  const run = await s.official.beginRun();
  await s.switchPlayer(b);
  await assert.rejects(s.official.submitRun(run, TETRIS), (e) => e.kind === "missingPlayer");
  assert.equal(w.db.get("scores"), null);
});

test("派對島：SDK 可提交第一大陸完整通關總分，並讀取大陸排行榜（第二大陸未開放）", async () => {
  const w = world();
  const pid = await w.createPlayer("SDK冒險");
  const s = w.session("adventure", pid);
  await s.start();
  const run = await s.official.beginRun();
  w.clock.t += 20 * 60000;
  const data = { continentId: 1, total: 7350, rank: "B", scoreVersion: "adventure-score-v2-test", complete: true, bossDefeated: true,
    parts: { collect: 2500, explore: 1500, combat: 1600, survival: 1000, efficiency: 700 }, chainBonus: 50,
    stages: ["1-1", "1-2b", "1-3", "2-1", "2-2", "2-3", "2-4"], stageClearSec: { "1-1": 40, "1-2b": 35, "1-3": 50, "2-1": 30, "2-2": 40, "2-3": 45, "2-4": 50 } };
  const r = await s.official.submitRun(run, data);
  assert.equal(r.status, "accepted", JSON.stringify(r.reasons));
  assert.deepEqual(r.rewards.map((x) => x.amount), [30], "派對島只有共用每日 +30");
  const cat = await s.official.catalog();
  assert.deepEqual(cat.games.adventure.boards.map((x) => x.status), ["open", "not_open", "not_open"]);
  assert.equal((await s.official.getBoard("continent-1")).rows[0].score, 7350);
});

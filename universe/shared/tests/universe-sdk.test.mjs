/* Universe SDK 單元測試（Node 內建測試工具，不需安裝套件）
   執行：node --test universe/shared/tests/universe-sdk.test.mjs   （在 repository 根目錄） */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SDK_PATH = path.resolve(HERE, "../universe-sdk.js");
const U = require(SDK_PATH);

const PA = "p_aaaaaaaaaaaaaaaaaaaa";
const PB = "p_bbbbbbbbbbbbbbbbbbbb";

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _map: m
  };
}
function res(status, body, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => (body == null ? "" : JSON.stringify(body)) };
}
const profile = (id, name, base) => ({ playerId: id, displayId: name, baseAvatarKey: base, displayAvatarKey: base, createdAt: "2026-11-10T00:00:00.000Z" });

/** 假的正式 API：記錄每一次請求，只回應 GET */
function fakeApi(players, opts = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method });
    if (opts.delayFor && url.includes(opts.delayFor)) await new Promise((r) => setTimeout(r, opts.delayMs || 50));
    if (opts.status) return res(opts.status, { ok: false, error: { code: opts.code || "X", message: "x" } }, opts.headers);
    const m = url.match(/\/v1\/players\/([^/?]+)$/);
    if (m) {
      const p = players[decodeURIComponent(m[1])];
      return p ? res(200, { ok: true, data: { player: p } }) : res(404, { ok: false, error: { code: "PLAYER_NOT_FOUND", message: "找不到這位玩家" } });
    }
    if (url.endsWith("/v1/avatars/base")) return res(200, { ok: true, data: { catalogVersion: 2, avatars: [{ key: "boy1", label: "男孩1", order: 1 }] } });
    return res(404, { ok: false, error: { code: "NOT_FOUND" } });
  };
  return { fetch, calls };
}
function session(o = {}) {
  return U.createGameSession({
    gameId: "tetris", gameVersion: "test", location: { search: o.search ?? "" },
    localStorage: o.local ?? memStorage(), sessionStorage: o.sess ?? memStorage(),
    fetch: o.fetch, services: o.services, now: o.now, mode: o.mode, mockPlayers: o.mockPlayers, timeoutMs: o.timeoutMs
  });
}

/* ---------------- 身份識別 ---------------- */
test("playerId 格式：只接受 p_＋20 碼；舊 playerKey 會被明確辨識並拒絕", () => {
  assert.equal(U.isValidPlayerId(PA), true);
  assert.equal(U.isValidPlayerId("p_AAAAAAAAAAAAAAAAAAAA"), false);
  assert.deepEqual(U.classifyPlayerIdInput("%E5%B0%8F%E6%98%8E__boy1"), { ok: false, reason: "legacyPlayerKey" });
  assert.deepEqual(U.classifyPlayerIdInput("小明__boy1"), { ok: false, reason: "legacyPlayerKey" });
  assert.deepEqual(U.classifyPlayerIdInput(""), { ok: false, reason: "missingPlayer" });
  assert.deepEqual(U.classifyPlayerIdInput("p_123"), { ok: false, reason: "invalidPlayerId" });
});

test("身份交接：網址 bvPlayerId 優先，讀取正式玩家公開資料（只有 GET）", async () => {
  const api = fakeApi({ [PA]: profile(PA, "小明", "boy1") });
  const s = session({ search: "?bvPlayerId=" + PA, fetch: api.fetch });
  const p = await s.start();
  assert.equal(p.playerId, PA); assert.equal(p.displayId, "小明"); assert.equal(p.handoffSource, "url");
  assert.equal(p.trust, "low-recoverable-identity"); assert.equal(p.canSpendVCoins, false); assert.equal(p.isAdmin, false);
  assert.ok(Object.isFrozen(p), "玩家物件不可被遊戲改寫");
  assert.ok(api.calls.every((c) => c.method === "GET"), "SDK 只發出 GET 請求");
  assert.match(api.calls[0].url, /^https:\/\/balloon-v-universe-api\.vashyang1120\.workers\.dev\/v1\/players\/p_/);
});

test("重新整理：沒有網址參數時，沿用本分頁先前的玩家（同一個 playerId）", async () => {
  const api = fakeApi({ [PA]: profile(PA, "小明", "boy1") });
  const sess = memStorage();
  await session({ search: "?bvPlayerId=" + PA, fetch: api.fetch, sess }).start();
  const p2 = await session({ search: "", fetch: api.fetch, sess }).start();
  assert.equal(p2.playerId, PA); assert.equal(p2.handoffSource, "tabSession");
});

test("網址帶舊 playerKey → legacyPlayerKey 錯誤，完全不發出網路請求", async () => {
  const api = fakeApi({});
  const s = session({ search: "?bvPlayerId=" + encodeURIComponent("小明__boy1"), fetch: api.fetch });
  await assert.rejects(s.start(), (e) => e.kind === "legacyPlayerKey");
  assert.equal(api.calls.length, 0);
  assert.equal(s.getPlayer(), null);
});

test("不存在的 playerId → notFound（中文訊息），且清除本分頁暫存", async () => {
  const api = fakeApi({});
  const sess = memStorage({ "bvUniverseSdk_v1_production_tetris_playerId": PA });
  const s = session({ fetch: api.fetch, sess });
  await assert.rejects(s.start(), (e) => e.kind === "notFound" && /找不到/.test(e.userMessage));
  assert.equal(sess.getItem("bvUniverseSdk_v1_production_tetris_playerId"), null);
});

test("HTTP 429 → rateLimited，帶 retry-after 秒數；可重試", async () => {
  const s = session({ search: "?bvPlayerId=" + PA, fetch: fakeApi({}, { status: 429, code: "RATE_LIMITED", headers: { "retry-after": "60" } }).fetch });
  await assert.rejects(s.start(), (e) => e.kind === "rateLimited" && e.retryAfterSec === 60 && e.retryable === true && e.status === 429);
});

test("逾時 → timeout；網路失敗 → network；伺服器 500 → server", async () => {
  const hang = () => new Promise((_, rej) => {}); // 永不回應
  const slow = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  await assert.rejects(session({ search: "?bvPlayerId=" + PA, fetch: slow, timeoutMs: 30 }).start(), (e) => e.kind === "timeout");
  await assert.rejects(session({ search: "?bvPlayerId=" + PA, fetch: async () => { throw new TypeError("Failed to fetch"); } }).start(), (e) => e.kind === "network");
  await assert.rejects(session({ search: "?bvPlayerId=" + PA, fetch: fakeApi({}, { status: 500 }).fetch }).start(), (e) => e.kind === "server");
  void hang;
});

/* ---------------- 切換玩家隔離 ---------------- */
test("切換玩家：觸發 reset、玩家專屬暫存分開、上一位的資料不會殘留", async () => {
  const api = fakeApi({ [PA]: profile(PA, "小明", "boy1"), [PB]: profile(PB, "小華", "girl1") });
  const local = memStorage();
  const s = session({ search: "?bvPlayerId=" + PA, fetch: api.fetch, local });
  const resets = [];
  s.onReset((r) => resets.push(r.previousPlayerId));
  await s.start();
  s.playerStore.set("best", 1500);
  assert.equal(s.playerStore.get("best"), "1500");
  await s.switchPlayer(PB);
  assert.deepEqual(resets, [PA]);
  assert.equal(s.getPlayer().displayId, "小華");
  assert.equal(s.playerStore.get("best"), null, "B 看不到 A 的最佳分數");
  s.playerStore.set("best", 300);
  await s.switchPlayer(PA);
  assert.equal(s.playerStore.get("best"), "1500", "切回 A 仍是 A 自己的資料");
  assert.ok([...local._map.keys()].every((k) => k.startsWith("bvUniverseGame_v1_production_tetris__p_")));
});

test("快速切換：較慢的舊回應不會覆蓋新玩家", async () => {
  const api = fakeApi({ [PA]: profile(PA, "小明", "boy1"), [PB]: profile(PB, "小華", "girl1") }, { delayFor: PA, delayMs: 60 });
  const s = session({ fetch: api.fetch });
  const first = s.switchPlayer(PA).catch((e) => e);
  await s.switchPlayer(PB);
  await first;
  assert.equal(s.getPlayer().playerId, PB);
});

/* ---------------- 正式／沙盒 ---------------- */
test("sandbox：讀大廳沙盒建立的玩家，完全不發出網路請求", async () => {
  const api = fakeApi({});
  const sess = memStorage({ bvUniverseSandbox_v2_api: JSON.stringify({ identities: {}, players: { [PA]: { playerId: PA, displayId: "沙盒A", baseAvatarKey: "avatar_turtle", createdAt: 1 } } }) });
  const s = session({ search: "?sandbox=1&bvPlayerId=" + PA, fetch: api.fetch, sess });
  const p = await s.start();
  assert.equal(s.mode, "sandbox"); assert.equal(p.displayId, "沙盒A"); assert.equal(p.mode, "sandbox");
  assert.equal(api.calls.length, 0);
  assert.match(s.modeLabel, /Sandbox/);
});

test("sandbox 的大廳目前玩家鍵與正式分開（不會讀到正式玩家）", async () => {
  const local = memStorage({ bvUniverse_v2_currentPlayerId: PA });
  const s = session({ search: "?sandbox=1", local, fetch: fakeApi({}).fetch });
  await assert.rejects(s.start(), (e) => e.kind === "missingPlayer");
});

/* ---------------- 尚未存在的 API ---------------- */
test("正式模式：V幣／成績／排行榜／紀錄／稱號／頭像解鎖 全部回報 NOT_IMPLEMENTED（不偷偷退回舊 Firebase）", async () => {
  const s = session({ search: "?bvPlayerId=" + PA, fetch: fakeApi({ [PA]: profile(PA, "小明", "boy1") }).fetch });
  await s.start();
  const caps = s.capabilities();
  for (const k of ["wallet", "scores", "leaderboard", "gameLogs", "titles", "avatarUnlocks"]) assert.equal(caps[k], "notImplemented", k);
  await assert.rejects(s.services.wallet.claimDailyReward({ playerId: PA, gameId: "tetris" }), (e) => e.kind === "notImplemented" && e.code === "NOT_IMPLEMENTED");
  await assert.rejects(s.services.scores.submit({}), (e) => e.kind === "notImplemented");
});

test("正式模式不能啟用 Mock 錢包（避免 Mock V幣被當成正式資料）", () => {
  const s = session({ search: "?bvPlayerId=" + PA, services: { wallet: "mock" }, fetch: fakeApi({}).fetch });
  assert.equal(s.capabilities().wallet, "notImplemented");
});

/* ---------------- 成績契約與 Mock ---------------- */
function tetrisSub(s, extra = {}) {
  return s.newScoreSubmission({ startedAt: "2026-11-11T10:00:00.000Z", finishedAt: "2026-11-11T10:03:00.000Z", scoreData: { score: 1200, level: 3, lines: 14, peakCombo: 2, difficulty: "normal", ...extra } });
}
test("ScoreSubmission：共用外層＋遊戲專屬 scoreData；標示為客戶端回報", async () => {
  const s = session({ search: "?bvPlayerId=" + PA, fetch: fakeApi({ [PA]: profile(PA, "小明", "boy1") }).fetch, services: { scores: "mock" } });
  await s.start();
  const sub = tetrisSub(s);
  for (const k of ["schemaVersion", "submissionId", "playerId", "gameId", "gameVersion", "startedAt", "finishedAt", "scoreData"]) assert.ok(k in sub, k);
  assert.equal(sub.client.reportedBy, "client");
  assert.equal(U.validateScoreSubmission(sub).ok, true);
  assert.equal(U.validateScoreSubmission({ ...sub, playerId: "小明__boy1" }).ok, false);
  assert.equal(U.validateScoreSubmission({ ...sub, scoreData: { ...sub.scoreData, score: -5 } }).ok, false);
  assert.equal(U.validateScoreSubmission({ ...sub, finishedAt: "2026-11-11T09:00:00.000Z" }).ok, false);
});

test("Mock 成績：同一 submissionId 不會重複記錄；結果永遠是「未經伺服器確認」", async () => {
  const s = session({ search: "?bvPlayerId=" + PA, fetch: fakeApi({ [PA]: profile(PA, "小明", "boy1") }).fetch, services: { scores: "mock", leaderboard: "mock" } });
  await s.start();
  const sub = tetrisSub(s);
  const r1 = await s.services.scores.submit(sub);
  const r2 = await s.services.scores.submit(sub);
  assert.equal(r1.status, "recorded"); assert.equal(r2.status, "duplicate");
  assert.equal(r1.serverConfirmed, false); assert.equal(r1.recordStatus, "mock");
  assert.equal((await s.services.scores.listMine(PA, "tetris")).length, 1);
  const board = await s.services.leaderboard.getBoard({ gameId: "tetris" });
  assert.equal(board.source, "mock"); assert.equal(board.serverConfirmed, false); assert.equal(board.rows[0].playerId, PA);
});

test("三款遊戲的 scoreData 各自驗證（問答年級只能是 low／middle／high）", () => {
  const base = { schemaVersion: 1, submissionId: "11111111-2222-4333-8444-555555555555", playerId: PA, startedAt: "2026-11-11T10:00:00Z", finishedAt: "2026-11-11T10:02:00Z" };
  assert.equal(U.validateScoreSubmission({ ...base, gameId: "rhythm", scoreData: { songId: "song001", difficulty: "normal", score: 9000, maxCombo: 40, perfect: 30, good: 10, miss: 2, accuracy: 83, grade: "A" } }).ok, true);
  assert.equal(U.validateScoreSubmission({ ...base, gameId: "quiz", scoreData: { gradeBand: "middle", subject: "math", score: 1150, correctCount: 9, totalQuestions: 10, maxCombo: 6, accuracy: 0.9, timeUsedTotal: 75 } }).ok, true);
  assert.equal(U.validateScoreSubmission({ ...base, gameId: "quiz", scoreData: { gradeBand: "main", subject: "math", score: 1, correctCount: 1, totalQuestions: 10, maxCombo: 1, accuracy: 0.1, timeUsedTotal: 5 } }).ok, false);
});

/* ---------------- V幣契約（Mock，只在 sandbox） ---------------- */
test("Mock V幣：同一玩家每天（台灣時間）只能領一次 +30，換遊戲也不能再領", async () => {
  let now = new Date("2026-11-11T15:59:00Z"); // 台灣 23:59
  const sess = memStorage({ bvUniverseSandbox_v2_api: JSON.stringify({ players: { [PA]: { playerId: PA, displayId: "A", baseAvatarKey: "boy1" } } }) });
  const mk = (gameId) => U.createGameSession({ gameId, location: { search: "?sandbox=1&bvPlayerId=" + PA }, localStorage: memStorage(), sessionStorage: sess, services: { wallet: "mock" }, now: () => now });
  const t = mk("tetris"), q = mk("quiz");
  await t.start(); await q.start();
  assert.equal(t.capabilities().wallet, "mock");
  const c1 = await t.services.wallet.claimDailyReward({ playerId: PA, gameId: "tetris" });
  const c2 = await q.services.wallet.claimDailyReward({ playerId: PA, gameId: "quiz" });
  assert.equal(c1.status, "claimed"); assert.equal(c1.amount, 30); assert.equal(c1.dateKey, "20261111");
  assert.equal(c2.status, "already_claimed"); assert.equal(c2.claimedByGameId, "tetris"); assert.equal(c2.balance, 30);
  now = new Date("2026-11-11T16:00:00Z"); // 台灣 11/12 00:00
  const c3 = await q.services.wallet.claimDailyReward({ playerId: PA, gameId: "quiz" });
  assert.equal(c3.status, "claimed"); assert.equal(c3.dateKey, "20261112"); assert.equal(c3.balance, 60);
  assert.equal(c3.serverConfirmed, false); assert.equal(c3.source, "mock");
  await assert.rejects(t.services.wallet.spend({ playerId: PA, amount: 10 }), (e) => e.kind === "forbidden");
});

test("台灣日期鍵：UTC 15:59 / 16:00 分屬不同天", () => {
  assert.equal(U.taipeiDateKey(new Date("2026-01-01T15:59:59Z")), "20260101");
  assert.equal(U.taipeiDateKey(new Date("2026-01-01T16:00:00Z")), "20260102");
});

/* ---------------- 安全 ---------------- */
test("SDK 原始碼不含 Firebase 設定、私鑰、舊資料庫網址", () => {
  const src = fs.readFileSync(SDK_PATH, "utf8");
  for (const bad of [/firebaseio\.com/i, /gstatic\.com\/firebasejs/i, /BEGIN [A-Z ]*PRIVATE KEY/, /AIza[0-9A-Za-z_-]{20,}/, /private_key/, /initializeApp\(/, /client_email/]) {
    assert.doesNotMatch(src, bad, String(bad));
  }
});

test("網址參數不能取得管理員或消費權限", async () => {
  const s = session({ search: "?bvPlayerId=" + PA + "&admin=1&isAdmin=true&role=admin", fetch: fakeApi({ [PA]: profile(PA, "小明", "boy1") }).fetch });
  const p = await s.start();
  assert.equal(p.isAdmin, false); assert.equal(p.canSpendVCoins, false);
});

/* ---------------- v0.2.0：三款遊戲整合 ---------------- */
test("v0.2.0 身份交接順序：大廳已切換成 B 時，沒有網址參數也不會沿用本分頁上一位 A", async () => {
  const api = fakeApi({ [PA]: profile(PA, "小明", "boy1"), [PB]: profile(PB, "小華", "girl1") });
  const sess = memStorage(), local = memStorage();
  await session({ search: "?bvPlayerId=" + PA, fetch: api.fetch, sess, local }).start();
  local.setItem("bvUniverse_v2_currentPlayerId", PB);          // 使用者在大廳換成 B
  const p = await session({ search: "", fetch: api.fetch, sess, local }).start();
  assert.equal(p.playerId, PB); assert.equal(p.handoffSource, "lobbyCurrent");
  // 網址參數永遠最優先
  const q = await session({ search: "?bvPlayerId=" + PA, fetch: api.fetch, sess, local }).start();
  assert.equal(q.playerId, PA); assert.equal(q.handoffSource, "url");
});

test("v0.2.0 回大廳：正式與 Sandbox 各自回到對應大廳；goLobby 只導向大廳網址、不帶任何身份資料", async () => {
  const assigned = [];
  const loc = { search: "", assign: (u) => assigned.push(u) };
  const prod = U.createGameSession({ gameId: "rhythm", gameVersion: "t", location: loc, localStorage: memStorage(), sessionStorage: memStorage() });
  assert.equal(prod.lobbyUrl(), "../../index.html");
  assert.equal(prod.goLobby(), "../../index.html");
  const sbLoc = { search: "?sandbox=1", assign: (u) => assigned.push(u) };
  const sb = U.createGameSession({ gameId: "quiz", gameVersion: "t", location: sbLoc, localStorage: memStorage(), sessionStorage: memStorage() });
  sb.goLobby();
  assert.deepEqual(assigned, ["../../index.html", "../../index.html?sandbox=1"]);
});

test("v0.2.0 共用標示文字：結算一律「本場成績尚未記入正式排行榜」", () => {
  assert.equal(U.LABELS.resultNote, "本場成績尚未記入正式排行榜");
  assert.match(U.LABELS.boardNote, /不是正式排行榜/);
  assert.match(U.LABELS.dailyRewardPending, /待開放/);
});

test("v0.2.0 今日挑戰：只記錄完成（依 playerId＋台灣日期），換玩家不共用、隔天重置，不產生任何 V幣", async () => {
  const api = fakeApi({ [PA]: profile(PA, "小明", "boy1"), [PB]: profile(PB, "小華", "girl1") });
  const local = memStorage();
  let now = Date.parse("2026-11-12T03:00:00Z");
  const a = session({ search: "?bvPlayerId=" + PA, fetch: api.fetch, local, now: () => now });
  assert.equal(a.dailyChallenge.markDone("x"), false, "沒有玩家時不能記錄");
  await a.start();
  assert.equal(a.dailyChallenge.isDoneToday("x"), false);
  a.dailyChallenge.markDone("x");
  assert.equal(a.dailyChallenge.isDoneToday("x"), true);
  assert.equal(a.dailyChallenge.rewardStatus, "pending");
  const b = session({ search: "?bvPlayerId=" + PB, fetch: api.fetch, local, now: () => now });
  await b.start();
  assert.equal(b.dailyChallenge.isDoneToday("x"), false, "B 不會看到 A 的完成紀錄");
  now = Date.parse("2026-11-12T16:00:00Z");   // 台灣時間隔天 00:00
  assert.equal(a.dailyChallenge.isDoneToday("x"), false);
  await assert.rejects(a.services.wallet.getBalance(PA), (e) => e.kind === "notImplemented");
});

test("v0.2.0 遊戲專屬 Mock 紀錄（問答年級榜／總榜）：依遊戲＋playerId 分開、標示 Mock、正式模式預設 NOT_IMPLEMENTED", async () => {
  const sess = memStorage();
  const mk = (gameId, services) => U.createGameSession({ gameId, gameVersion: "t", location: { search: "" }, localStorage: memStorage(), sessionStorage: sess, services });
  const quiz = mk("quiz", { records: "mock" });
  await quiz.services.records.put("board-low", PA, { gradeTotalScore: 300 });
  await quiz.services.records.put("board-low", PB, { gradeTotalScore: 120 });
  const row = await quiz.services.records.get("board-low", PA);
  assert.equal(row.gradeTotalScore, 300); assert.equal(row.recordStatus, "mock"); assert.equal(row.serverConfirmed, false); assert.equal(row.playerId, PA);
  assert.equal((await quiz.services.records.list("board-low")).length, 2);
  assert.equal(await quiz.services.records.get("board-low", "p_cccccccccccccccccccc"), null);
  // 其他遊戲讀不到問答的紀錄
  assert.deepEqual(await mk("tetris", { records: "mock" }).services.records.list("board-low"), []);
  // 舊 playerKey、錯誤集合名稱一律拒絕
  await assert.rejects(quiz.services.records.put("board-low", "小明__boy1", {}), (e) => e.kind === "legacyPlayerKey");
  await assert.rejects(quiz.services.records.put("../x", PA, {}), (e) => e.kind === "validation");
  // 沒有明確選擇 Mock → NOT_IMPLEMENTED
  await assert.rejects(mk("quiz", {}).services.records.list("board-low"), (e) => e.kind === "notImplemented");
});

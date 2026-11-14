// v0.3.2 管理後台「玩家管理中心」：玩家自訂 ID 搜尋、同名處理、玩家摘要、個人篩選、權限、試營運（本機模擬）
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { _resetMemoryLimiter } from "../src/middleware/rate-limit.js";
import { ON, TETRIS_OK, newPlayer, play, rhythmData, setup } from "./launch-helpers.js";

beforeEach(() => _resetMemoryLimiter());
const search = (e, q) => e.admin("GET", "/v1/admin/players/search?q=" + encodeURIComponent(q));

test("搜尋：中文 ID 完全相同優先；英文大小寫不拘；包含的也列出；找不到有清楚結果", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "宇宙測試1", "girl2");
  await newPlayer(e.call, "宇宙測試12", "boy1");
  const c = await newPlayer(e.call, "Vash", "cat1");
  const r = (await search(e, "宇宙測試1")).body.data;
  assert.equal(r.by, "displayId");
  assert.deepEqual(r.rows.map((x) => x.displayId), ["宇宙測試1", "宇宙測試12"], "完全相同的排第一");
  assert.equal(r.rows[0].playerId, a);
  assert.match(r.rows[0].baseAvatarImage, /\/assets\/avatars\/base\/girl2\.png$/);
  const en = (await search(e, "vash")).body.data;
  assert.deepEqual(en.rows.map((x) => x.playerId), [c], "英文不分大小寫");
  const none = (await search(e, "不存在的人")).body.data;
  assert.deepEqual([none.total, none.rows.length], [0, 0]);
  assert.equal((await search(e, "")).status, 400);
});

test("同名不同身份圖案＝不同玩家：全部列出，附身份頭像、展示頭像、稱號（不合併）", async () => {
  const e = setup();
  const m1 = await newPlayer(e.call, "小明", "boy1");
  const m2 = await newPlayer(e.call, "小明", "dog2");
  await play(e, m2, "tetris", TETRIS_OK, 120000);   // m2 解鎖並自動裝備稱號
  await e.call("POST", `/v1/players/${m2}/equip`, { displayId: "小明", baseAvatarKey: "dog2", displayAvatarKey: "balloon_brother_01" });
  const r = (await search(e, "小明")).body.data;
  assert.equal(r.rows.length, 2);
  const byId = Object.fromEntries(r.rows.map((x) => [x.playerId, x]));
  assert.deepEqual([byId[m1].baseAvatarKey, byId[m1].displayAvatarKey, byId[m1].titleName], ["boy1", "boy1", null]);
  assert.deepEqual([byId[m2].baseAvatarKey, byId[m2].displayAvatarKey, byId[m2].titleName], ["dog2", "balloon_brother_01", "初次堆疊者"]);
  assert.equal(byId[m2].displayAvatarImage, "https://vashyang1120.github.io/vparty-rhythm-game/assets/avatars/balloon_brother_01.png");
});

test("進階：完整 playerId 精確查詢；格式錯誤或不存在", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "精確甲");
  const r = (await search(e, a)).body.data;
  assert.deepEqual([r.by, r.rows.length, r.rows[0].displayId], ["playerId", 1, "精確甲"]);
  assert.equal((await search(e, "p_aaaaaaaaaaaaaaaaaaaa")).body.data.total, 0);
});

test("權限：搜尋與摘要只有管理員可以用（一般訪客不能列舉玩家）", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "權限甲");
  assert.equal((await e.call("GET", "/v1/admin/players/search?q=權限")).status, 401);
  assert.equal((await e.call("GET", `/v1/admin/players/${a}/overview`)).status, 401);
  assert.equal((await e.call("GET", "/v1/players/search?q=權限")).status === 200, false, "沒有公開的搜尋 API");
});

test("玩家摘要：身份、目前裝備、V幣、成績數、各遊戲個人最佳、收藏數（全部來自資料庫）", async () => {
  const e = setup(ON, Date.now() - 3600000);
  const a = await newPlayer(e.call, "摘要甲", "girl2");
  await play(e, a, "tetris", TETRIS_OK, 120000);
  await play(e, a, "rhythm", rhythmData("song005", "hard", 0.9), 200000);
  await play(e, a, "rhythm", rhythmData(), 20000);   // 待審核
  e.clock.t = Date.now();
  const o = (await e.admin("GET", `/v1/admin/players/${a}/overview`)).body.data;
  assert.deepEqual([o.displayId, o.baseAvatarKey, o.titleName], ["摘要甲", "girl2", "初次堆疊者"]);
  assert.deepEqual(o.wallet, { balance: 50, transactions: 3 });
  assert.deepEqual([o.scores.total, o.scores.accepted, o.scores.pending_review, o.scores.byGame.rhythm], [3, 2, 1, 2]);
  assert.deepEqual(o.bests.map((b) => b.gameId + ":" + b.boardId).sort(), ["rhythm:song005--hard", "tetris:total"]);
  assert.ok(o.collection.titles >= 5 && o.collection.avatars >= 2);
  assert.deepEqual([o.mode, o.namespace], ["on", "/"]);
});

test("個人篩選：審核紀錄、收藏發放紀錄、收藏 CSV 只含選定玩家；不帶 playerId 時是全體", async () => {
  const e = setup(ON, Date.now() - 3600000);
  const a = await newPlayer(e.call, "篩選甲"), b = await newPlayer(e.call, "篩選乙", "girl1");
  const pa = await play(e, a, "rhythm", rhythmData(), 20000), pb = await play(e, b, "rhythm", rhythmData(), 20000);
  e.clock.t = Date.now();
  await e.admin("POST", `/v1/admin/scores/${pa.r.body.data.submissionId}/review`, { decision: "accept" });
  await e.admin("POST", `/v1/admin/scores/${pb.r.body.data.submissionId}/review`, { decision: "reject" });
  await e.admin("POST", `/v1/admin/collections/${b}/avatars`, { avatarKey: "student_hanhan", action: "grant" });
  const all = (await e.admin("GET", "/v1/admin/audits")).body.data, onlyA = (await e.admin("GET", `/v1/admin/audits?playerId=${a}`)).body.data;
  assert.deepEqual([all.rows.length, all.scope, onlyA.rows.length, onlyA.scope, onlyA.rows[0].playerId], [2, "all", 1, "player", a]);
  assert.equal((await e.admin("GET", `/v1/admin/collection-audits?playerId=${a}`)).body.data.rows.length, 0);
  assert.equal((await e.admin("GET", `/v1/admin/collection-audits?playerId=${b}`)).body.data.rows.length, 1);
  const csvA = (await e.admin("GET", `/v1/admin/exports/collections.csv?playerId=${a}`)).text.replace(/^﻿/, "").trim().split("\r\n");
  const csvAll = (await e.admin("GET", "/v1/admin/exports/collections.csv")).text.replace(/^﻿/, "").trim().split("\r\n");
  assert.ok(csvA.slice(1).every((l) => l.startsWith(a + ",")), "個人匯出只含選定玩家");
  assert.ok(csvAll.slice(1).some((l) => l.startsWith(b + ",")), "全體匯出包含所有玩家");
  assert.equal((await e.admin("GET", "/v1/admin/audits?playerId=xx")).status, 400);
});

test("試營運：摘要讀 trial/（標示 trial）；身份仍讀共用身份資料；試營運資料不被修改", async () => {
  const pre = setup({});
  const t = await newPlayer(pre.call, "試營摘要", "girl2");
  const e = setup({ SCORES_ENABLED: "trial", REWARDS_ENABLED: "trial", TRIAL_PLAYER_IDS: t }, Date.now(), pre.db);
  await play(e, t, "tetris", TETRIS_OK, 120000);
  const before = JSON.stringify(e.db.get("trial"));
  const s = (await search(e, "試營摘要")).body.data;
  assert.deepEqual([s.mode, s.rows[0].titleName], ["trial", "初次堆疊者"]);
  const o = (await e.admin("GET", `/v1/admin/players/${t}/overview`)).body.data;
  assert.deepEqual([o.mode, o.namespace, o.wallet.balance, o.scores.total, o.bests.length], ["trial", "trial/", 40, 1, 1]);
  assert.equal(JSON.stringify(e.db.get("trial")), before, "查詢不會修改試營運資料");
  assert.equal(e.db.get("wallets"), null);
});

// v0.3.3 正式全面上線：直接讀 wrangler.jsonc 的設定（合併後 Cloudflare 會部署的值）驗證正式模式
// 本機模擬：Worker 程式＋假 Firebase；不是正式環境
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { _resetMemoryLimiter } from "../src/middleware/rate-limit.js";
import { readConfig } from "../src/config.js";
import { TETRIS_OK, newPlayer, play, rhythmData, setup, invariant } from "./launch-helpers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "wrangler.jsonc"), "utf8");
const VARS = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars;
const PROD_ENV = { SCORES_ENABLED: VARS.SCORES_ENABLED, REWARDS_ENABLED: VARS.REWARDS_ENABLED, TRIAL_PLAYER_IDS: VARS.TRIAL_PLAYER_IDS };
const TRIAL_ENV = (ids) => ({ SCORES_ENABLED: "trial", REWARDS_ENABLED: "trial", TRIAL_PLAYER_IDS: ids });
const ROOTS = ["sessions", "scores", "scoreIndex", "leaderboards", "quizProgress", "wallets", "collections", "publicProfiles", "adminAudit", "collectionAudit"];
beforeEach(() => _resetMemoryLimiter());

test("wrangler.jsonc：正式全面上線（on／on／空名單）", () => {
  assert.deepEqual(PROD_ENV, { SCORES_ENABLED: "on", REWARDS_ENABLED: "on", TRIAL_PLAYER_IDS: "" });
  const cfg = readConfig({ ...VARS });
  assert.deepEqual([cfg.scoresMode, cfg.rewardsMode, cfg.trialPlayerIds], ["on", "on", []]);
  assert.equal(cfg.scoresEnabled, true);
});

test("試營運 → 清除 trial/ → 正式：沿用原本身份；試營運成績、V幣、收藏不會變成正式資料", async () => {
  // 1) 試營運期間（測試玩家）累積測試資料
  const pre = setup({});
  const t = await newPlayer(pre.call, "宇宙測試", "girl2");
  const other = await newPlayer(pre.call, "一般玩家", "boy1");
  const trial = setup(TRIAL_ENV(t), Date.now() - 3600000, pre.db);
  await play(trial, t, "tetris", TETRIS_OK, 120000);
  await play(trial, t, "rhythm", rhythmData("song005", "hard", 0.9), 200000);
  await trial.call("POST", `/v1/players/${t}/equip`, { displayId: "宇宙測試", baseAvatarKey: "girl2", displayAvatarKey: "balloon_brother_01" });
  assert.equal(trial.db.get(`trial/wallets/${t}`).balance, 50);
  const profT = JSON.stringify(trial.db.get(`players/${t}/profile`)), profO = JSON.stringify(trial.db.get(`players/${other}/profile`));
  trial.clock.t = Date.now();
  const st = (await trial.admin("GET", "/v1/admin/launch")).body.data;
  assert.deepEqual(st.trialRoots.includes("wallets") && st.trialRoots.includes("scores"), true, "後台看得到 trial/ 還有資料");
  // 2) 使用者在後台清除 trial/（仍是 trial 模式）
  assert.equal((await trial.admin("POST", "/v1/admin/trial/purge", { confirm: "PURGE TRIAL" })).status, 200);
  assert.equal(trial.db.get("trial"), null);
  assert.deepEqual((await trial.admin("GET", "/v1/admin/launch")).body.data.trialRoots, [], "清除後顯示已清空");
  for (const r of ROOTS) assert.equal(trial.db.get(r), null, "正式 " + r + "/ 一直是空的");
  // 3) 合併正式設定
  const on = setup(PROD_ENV, Date.now(), trial.db);
  assert.equal(JSON.stringify(on.db.get(`players/${t}/profile`)), profT, "玩家身份不變");
  assert.equal(JSON.stringify(on.db.get(`players/${other}/profile`)), profO);
  assert.equal((await on.call("GET", `/v1/wallet/${t}`)).body.data.balance, 0, "試營運 V幣沒有帶進正式錢包");
  const col = (await on.call("GET", `/v1/players/${t}/collection`)).body.data;
  assert.deepEqual([col.titles.length, col.avatars.length, col.mode], [0, 0, "on"], "試營運收藏沒有帶進正式收藏");
  const pl = (await on.call("GET", `/v1/players/${t}`)).body.data.player;
  assert.deepEqual([pl.baseAvatarKey, pl.displayAvatarKey], ["girl2", "girl2"], "身份頭像不變；試營運的展示頭像裝備不帶入");
  assert.equal((await on.call("GET", "/v1/leaderboards/tetris/total")).body.data.total, 0);
  const s0 = (await on.call("GET", `/v1/launch/status?playerId=${other}`)).body.data;
  assert.deepEqual([s0.scores, s0.rewards, s0.mode], ["enabled", "enabled", "on"], "所有玩家都能正式寫入");
  // 4) 第一筆正式成績（一般玩家與原測試玩家都可以）
  const a = await play(on, t, "tetris", TETRIS_OK, 120000);
  const b = await play(on, other, "rhythm", rhythmData("song005", "hard", 0.9), 200000);
  assert.deepEqual([a.r.body.data.status, a.r.body.data.balance, b.r.body.data.status, b.r.body.data.balance], ["accepted", 40, "accepted", 40]);
  assert.ok(on.db.get(`wallets/${t}`) && on.db.get(`leaderboards/tetris/total/${t}`) && on.db.get(`collections/${t}`).titles.tetris_first_clear, "寫在正式資料區");
  assert.equal(on.db.get("trial"), null, "正式模式不寫 trial/");
  assert.equal(invariant(on.db, t), 40); assert.equal(invariant(on.db, other), 40);   // 帳本與餘額一致
  const again = await play(on, t, "tetris", TETRIS_OK, 120000);
  assert.equal(again.r.body.data.balance, 40, "同一天重複遊玩不重複領獎");
  assert.equal(JSON.stringify(on.db.get(`players/${t}/profile`)), profT, "正式遊玩也不改身份資料");
  on.clock.t = Date.now();
  const ls = (await on.admin("GET", "/v1/admin/launch")).body.data;
  assert.deepEqual([ls.scoresMode, ls.rewardsMode, ls.namespace, ls.trialRoots], ["on", "on", "/", []]);
  assert.equal((await on.admin("POST", "/v1/admin/trial/purge", { confirm: "PURGE TRIAL" })).status, 409, "正式模式不能執行清除");
});

test("正式模式不讀 trial/：即使 trial/ 還留有資料（忘記清除），排行榜、錢包、收藏、後台摘要都只讀正式資料", async () => {
  const pre = setup({});
  const t = await newPlayer(pre.call, "殘留甲", "girl2");
  const trial = setup(TRIAL_ENV(t), Date.now() - 3600000, pre.db);
  await play(trial, t, "tetris", TETRIS_OK, 120000);
  const leftover = JSON.stringify(trial.db.get("trial"));
  const on = setup(PROD_ENV, Date.now(), trial.db);
  assert.equal((await on.call("GET", "/v1/leaderboards/tetris/total")).body.data.total, 0);
  assert.equal((await on.call("GET", `/v1/wallet/${t}`)).body.data.balance, 0);
  assert.equal((await on.call("GET", `/v1/players/${t}/collection`)).body.data.titles.length, 0);
  const o = (await on.admin("GET", `/v1/admin/players/${t}/overview`)).body.data;
  assert.deepEqual([o.mode, o.namespace, o.wallet.balance, o.scores.total, o.collection.titles], ["on", "/", 0, 0, 0]);
  const ls = (await on.admin("GET", "/v1/admin/launch")).body.data;
  assert.ok(ls.trialRoots.length > 0, "後台會提示 trial/ 還有資料");
  assert.equal(JSON.stringify(on.db.get("trial")), leftover, "也不會動到 trial/");
});

test("緊急停止：改成 off → 立即停止所有正式寫入；已接受的正式資料保留、仍可讀取", async () => {
  const on = setup(PROD_ENV, Date.now() - 3600000);
  const p = await newPlayer(on.call, "停用甲");
  await play(on, p, "tetris", TETRIS_OK, 120000);
  const snapshot = JSON.stringify(ROOTS.map((r) => on.db.get(r)));
  const off = setup({ SCORES_ENABLED: "off", REWARDS_ENABLED: "off", TRIAL_PLAYER_IDS: "" }, Date.now(), on.db);
  assert.equal((await off.call("POST", "/v1/sessions", { playerId: p, gameId: "tetris", gameVersion: "x" })).status, 503);
  assert.equal((await off.call("POST", `/v1/players/${p}/equip`, { displayId: "停用甲", baseAvatarKey: "boy1", displayAvatarKey: null })).status, 503);
  assert.equal((await off.call("GET", "/v1/leaderboards/tetris/total")).body.data.total, 1, "正式排行榜仍然看得到");
  assert.equal((await off.call("GET", `/v1/wallet/${p}`)).body.data.balance, 40, "正式錢包保留");
  assert.equal(JSON.stringify(ROOTS.map((r) => off.db.get(r))), snapshot, "停用不會刪除或修改任何正式資料");
  const back = setup(PROD_ENV, Date.now(), off.db);
  assert.equal((await back.call("GET", `/v1/wallet/${p}`)).body.data.balance, 40, "改回 on 後從原本的資料繼續");
});

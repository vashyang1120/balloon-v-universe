// v0.3.1-trial-setup：直接讀 wrangler.jsonc 的設定（合併後 Cloudflare 會部署的值）驗證受控試營運
// 本機模擬：Worker 程式＋假 Firebase；不是正式環境
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { _resetMemoryLimiter } from "../src/middleware/rate-limit.js";
import { readConfig } from "../src/config.js";
import { ON, TETRIS_OK, newPlayer, play, rhythmData, setup, invariant } from "./launch-helpers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "wrangler.jsonc"), "utf8");
const VARS = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars;
const TESTER = "p_qfvmhs7ewmcn6ez6bdub";
const TRIAL_ENV = { SCORES_ENABLED: VARS.SCORES_ENABLED, REWARDS_ENABLED: VARS.REWARDS_ENABLED, TRIAL_PLAYER_IDS: VARS.TRIAL_PLAYER_IDS };
beforeEach(() => _resetMemoryLimiter());

/** 在假資料庫建立「指定 playerId」的測試玩家（正式網站上這位玩家已存在；這裡只是本機模擬） */
async function seedTester(e) {
  const tmp = await newPlayer(e.call, "試營運測試", "boy1");
  const prof = e.db.get(`players/${tmp}/profile`);
  e.db.set(`players/${TESTER}/profile`, { ...prof, playerId: TESTER });
  return TESTER;
}

test("wrangler.jsonc：受控試營運設定（trial／trial／指定測試玩家）；沒有改成 on", () => {
  assert.deepEqual(TRIAL_ENV, { SCORES_ENABLED: "trial", REWARDS_ENABLED: "trial", TRIAL_PLAYER_IDS: TESTER });
  const cfg = readConfig({ ...VARS });
  assert.deepEqual([cfg.scoresMode, cfg.rewardsMode, cfg.trialPlayerIds], ["trial", "trial", [TESTER]]);
  assert.equal(cfg.scoresEnabled, false, "不是全面開放");
});

test("試營運設定：只有測試玩家能寫入；成績、排行榜、V幣、收藏都在 trial/；正式資料與身份不變", async () => {
  const e = setup(TRIAL_ENV);
  const t = await seedTester(e);
  const other = await newPlayer(e.call, "一般玩家", "girl1");
  const profBefore = JSON.stringify(e.db.get(`players/${t}/profile`));
  const otherBefore = JSON.stringify(e.db.get(`players/${other}/profile`));

  const st = (await e.call("GET", `/v1/launch/status?playerId=${t}`)).body.data;
  assert.deepEqual([st.scores, st.rewards, st.mode], ["enabled", "enabled", "trial"]);
  const so = (await e.call("GET", `/v1/launch/status?playerId=${other}`)).body.data;
  assert.deepEqual([so.scores, so.rewards, so.mode], ["disabled", "disabled", "trial"]);

  // 一般玩家：不能開場次、不能提交、不能裝備 → 不會拿到任何獎勵（遊戲本身照常，由前端維持本分頁測試成績）
  assert.equal((await e.call("POST", "/v1/sessions", { playerId: other, gameId: "tetris", gameVersion: "x" })).status, 503);
  assert.equal((await e.call("POST", `/v1/players/${other}/equip`, { displayId: "一般玩家", baseAvatarKey: "girl1", displayAvatarKey: null })).status, 503);

  // 測試玩家：方塊＋節奏
  const a = await play(e, t, "tetris", TETRIS_OK, 120000);
  const b = await play(e, t, "rhythm", rhythmData("song005", "hard", 0.9), 200000);
  assert.equal(a.r.body.data.status, "accepted"); assert.equal(b.r.body.data.status, "accepted");
  assert.equal(b.r.body.data.balance, 50, "試營運 V幣：+30＋方塊 +10＋節奏 +10");
  const w = e.db.get(`trial/wallets/${t}`);
  assert.equal(w.balance, 50);
  assert.equal(Object.values(w.ledger).reduce((s, x) => s + x.amount, 0), 50, "帳本與餘額一致");
  const col = e.db.get(`trial/collections/${t}`);
  assert.ok(col.titles.tetris_first_clear && col.titles.rhythm_hard_clear, "試營運稱號解鎖");
  assert.ok(col.avatars.xiaov_base && col.avatars.balloon_brother_01, "試營運展示頭像解鎖");
  assert.ok(e.db.get(`trial/leaderboards/tetris/total/${t}`), "試營運排行榜");

  // 正式資料沒有任何寫入
  for (const root of ["sessions", "scores", "scoreIndex", "leaderboards", "quizProgress", "wallets", "collections", "publicProfiles", "adminAudit", "collectionAudit"]) {
    assert.equal(e.db.get(root), null, "正式 " + root + "/ 沒有資料");
  }
  assert.equal(JSON.stringify(e.db.get(`players/${t}/profile`)), profBefore, "測試玩家身份資料沒有被修改");
  assert.equal(JSON.stringify(e.db.get(`players/${other}/profile`)), otherBefore, "其他玩家身份資料沒有被修改");

  // 裝備（試營運收藏）
  const eq = await e.call("POST", `/v1/players/${t}/equip`, { displayId: "試營運測試", baseAvatarKey: "boy1", displayAvatarKey: "balloon_brother_01" });
  assert.equal(eq.status, 200);
  assert.equal((await e.call("GET", `/v1/players/${t}`)).body.data.player.displayAvatarKey, "balloon_brother_01");
  assert.equal(e.db.get(`players/${t}/profile`).displayAvatarKey, JSON.parse(profBefore).displayAvatarKey, "裝備不寫入正式身份資料");

  // 讀取都標示 trial
  const lb = (await e.call("GET", "/v1/leaderboards/tetris/total")).body.data;
  assert.deepEqual([lb.mode, lb.rows.length], ["trial", 1]);
  assert.equal((await e.call("GET", `/v1/wallet/${t}`)).body.data.mode, "trial");
  assert.equal((await e.call("GET", `/v1/players/${t}/collection`)).body.data.mode, "trial");

  // 清除 → 正式根目錄仍然乾淨，切換成 on 時從空白開始
  assert.equal((await e.admin("POST", "/v1/admin/trial/purge", { confirm: "PURGE TRIAL" })).status, 200);
  assert.equal(e.db.get("trial"), null);
  assert.ok(e.db.get(`players/${t}/profile`), "清除不影響玩家身份");
  const on = setup(ON, Date.now(), e.db);
  assert.equal((await on.call("GET", "/v1/leaderboards/tetris/total")).body.data.total, 0);
  assert.equal((await on.call("GET", `/v1/wallet/${t}`)).body.data.balance, 0);
  assert.equal(invariant(on.db, t), 0);
});

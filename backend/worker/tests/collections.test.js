// v0.3.1 共用稱號＋展示頭像收藏、受控試營運、真實資料庫自我檢查（本機模擬：Worker 程式＋假 Firebase）
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { _resetMemoryLimiter } from "../src/middleware/rate-limit.js";
import { ON, TETRIS_OK, advData, newPlayer, play, quizData, rhythmData, setup, session, submitBody, invariant } from "./launch-helpers.js";
import { TITLE_CATALOG, AVATAR_CATALOG } from "../src/launch/collection-catalog.js";

beforeEach(() => _resetMemoryLimiter());
const col = (db, p) => db.get(`collections/${p}`) || { titles: {}, avatars: {} };
const titleKeys = (db, p) => Object.keys(col(db, p).titles || {}).sort();
const avatarKeys = (db, p) => Object.keys(col(db, p).avatars || {}).sort();
async function equip(e, pid, name, avatar, patch) { return e.call("POST", `/v1/players/${pid}/equip`, { displayId: name, baseAvatarKey: avatar, ...patch }); }

/* ───────── 目錄 ───────── */
test("目錄：沿用既有稱號 29 個（方塊 5、節奏 6、問答 6、派對島 12）；名稱與 ID 不變；私人頭像不公開", async () => {
  const e = setup();
  const r = await e.call("GET", "/v1/collections/catalog");
  assert.equal(r.status, 200);
  const by = (g) => r.body.data.titles.filter((t) => t.gameId === g);
  assert.deepEqual([by("tetris").length, by("rhythm").length, by("quiz").length, by("adventure").length], [5, 6, 6, 12]);
  assert.deepEqual(by("tetris").map((t) => t.name), ["初次堆疊者", "方塊新星", "氣球堆疊師", "連消高手", "高塔建築師"]);
  assert.equal(r.body.data.titles.find((t) => t.titleKey === "rhythm_full_combo").status, "preparing");
  assert.equal(r.body.data.titles.find((t) => t.titleKey === "adventure_kind_adventurer").status, "preparing");
  const av = r.body.data.avatars.map((a) => a.avatarKey);
  assert.ok(av.includes("xiaov_base") && av.includes("balloon_brother_03"));
  assert.ok(!av.some((k) => k.startsWith("student_")), "學生專屬頭像不出現在公開目錄");
  assert.ok(r.body.data.avatars.every((a) => a.image.startsWith("https://vashyang1120.github.io/vparty-rhythm-game/assets/avatars/")), "使用既有正式素材");
  assert.equal(TITLE_CATALOG.length, 29); assert.equal(AVATAR_CATALOG.length, 11);
});

/* ───────── 解鎖 ───────── */
test("方塊：已接受成績解鎖稱號與頭像；第一個稱號自動裝備；重複達成不重複建立", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "收藏甲");
  const { r } = await play(e, p, "tetris", TETRIS_OK, 120000);
  assert.equal(r.body.data.status, "accepted");
  assert.deepEqual(r.body.data.unlocks.titles.sort(), ["tetris_first_clear", "tetris_peak_combo_3", "tetris_score_1000", "tetris_score_2000"]);
  assert.deepEqual(r.body.data.unlocks.avatars.sort(), ["balloon_brother_01", "xiaov_base"]);
  const c1 = col(e.db, p);
  assert.equal(c1.equipped.titleKey, "tetris_first_clear", "從沒選過稱號 → 自動裝備第一個");
  const first = c1.titles.tetris_first_clear.unlockedAt;
  e.clock.t += 60000;
  const again = await play(e, p, "tetris", { ...TETRIS_OK, score: 2600 }, 120000);
  assert.deepEqual(again.r.body.data.unlocks, { titles: [], avatars: [] });
  assert.equal(col(e.db, p).titles.tetris_first_clear.unlockedAt, first, "解鎖時間不變");
  assert.equal(col(e.db, p).rev, c1.rev, "沒有任何新的寫入");
  assert.equal(col(e.db, p).titles.tetris_score_2000.source.type, "score");
  assert.equal(col(e.db, p).titles.tetris_score_2000.source.submissionId.length > 10, true);
});

test("節奏：等級 A＋困難 → 稱號與氣球哥哥 2；Full Combo（準備中）不發放", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "收藏乙");
  const d = rhythmData("song005", "hard", 0.88);
  const { r } = await play(e, p, "rhythm", d, 200000);
  assert.equal(r.body.data.status, "accepted", JSON.stringify(r.body.data.reasons));
  assert.ok(["A", "A+"].includes(d.grade), d.grade);
  assert.deepEqual(titleKeys(e.db, p), ["rhythm_first_stage", "rhythm_hard_clear", "rhythm_rank_a", "rhythm_rank_b"]);
  assert.deepEqual(avatarKeys(e.db, p), ["balloon_brother_02", "xiaov_base"]);
});

test("問答：首次完成、滿分、腦筋急轉彎滿分；低年級 8 科都挑戰過 → 低年級畢業", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "收藏丙");
  await play(e, p, "quiz", quizData("low", "math", 7), 60000);
  assert.deepEqual(titleKeys(e.db, p), ["v_academy_freshman"]);
  await play(e, p, "quiz", quizData("low", "brain", 10), 60000);
  assert.deepEqual(titleKeys(e.db, p), ["brain_teaser_king", "little_scholar", "v_academy_freshman"]);
  for (const s of ["mandarin", "science", "social", "english", "balloon"]) await play(e, p, "quiz", quizData("low", s, 3), 60000);
  assert.ok(!titleKeys(e.db, p).includes("low_grade_graduate"), "7 科還不夠");
  await play(e, p, "quiz", quizData("low", "brand", 2), 60000);
  assert.ok(titleKeys(e.db, p).includes("low_grade_graduate"), "8 科都挑戰過");
  assert.ok(!titleKeys(e.db, p).includes("middle_grade_graduate"));
});

test("派對島：分項滿分稱號由伺服器從已接受的大陸成績驗證；準備中的稱號不發放", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "收藏丁");
  const parts = { collect: 3000, explore: 1500, combat: 2000, survival: 1000, efficiency: 700 };
  const { r } = await play(e, p, "adventure", advData({ parts, total: 8200 + 50 }), 20 * 60000);
  assert.equal(r.body.data.status, "accepted", JSON.stringify(r.body.data.reasons));
  assert.deepEqual(titleKeys(e.db, p), ["adventure_battle_master", "adventure_treasure_hunter"]);
  assert.deepEqual(avatarKeys(e.db, p), ["xiaov_base"]);
});

test("待審核不解鎖；管理員接受後才解鎖；拒絕的不解鎖", async () => {
  const e = setup(ON, Date.now() - 86400000);
  const p = await newPlayer(e.call, "審核收藏"), q = await newPlayer(e.call, "審核收藏二", "girl1");
  const a = await play(e, p, "rhythm", rhythmData(), 20000);
  const b = await play(e, q, "rhythm", rhythmData(), 20000);
  assert.equal(a.r.body.data.status, "pending_review");
  assert.deepEqual([titleKeys(e.db, p), titleKeys(e.db, q)], [[], []]);
  e.clock.t = Date.now();
  const acc = await e.admin("POST", `/v1/admin/scores/${a.r.body.data.submissionId}/review`, { decision: "accept" });
  assert.equal(acc.status, 200);
  assert.ok(titleKeys(e.db, p).includes("rhythm_first_stage"));
  await e.admin("POST", `/v1/admin/scores/${b.r.body.data.submissionId}/review`, { decision: "reject" });
  assert.deepEqual(titleKeys(e.db, q), []);
  const again = await e.admin("POST", `/v1/admin/scores/${a.r.body.data.submissionId}/review`, { decision: "accept" });
  assert.deepEqual(again.body.data.unlocks, { titles: [], avatars: [] });
});

test("明顯無效（rejected）成績不解鎖任何東西", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "無效收藏");
  const { r } = await play(e, p, "tetris", { ...TETRIS_OK, level: 9 }, 120000);
  assert.equal(r.body.data.status, "rejected");
  assert.equal(e.db.get(`collections/${p}`), null);
});

/* ───────── 裝備 ───────── */
test("裝備：只能選自己已解鎖的；需要 ID＋身份頭像；不改 playerId／baseAvatarKey；排行榜與玩家資料同步", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "裝備甲", "cat1");
  await play(e, p, "tetris", TETRIS_OK, 120000);
  // 身份不符
  assert.equal((await equip(e, p, "裝備乙", "cat1", { titleKey: "tetris_score_1000" })).status, 403);
  assert.equal((await equip(e, p, "裝備甲", "cat2", { titleKey: "tetris_score_1000" })).status, 403);
  // 未解鎖
  assert.equal((await equip(e, p, "裝備甲", "cat1", { titleKey: "tetris_level_5" })).status, 403);
  assert.equal((await equip(e, p, "裝備甲", "cat1", { displayAvatarKey: "balloon_brother_02" })).status, 403);
  assert.equal((await equip(e, p, "裝備甲", "cat1", { displayAvatarKey: "student_hanhan" })).status, 403);
  assert.equal((await equip(e, p, "裝備甲", "cat1", { titleKey: "x", playerId: "p_aaaaaaaaaaaaaaaaaaaa" })).status, 400, "多餘欄位");
  // 已解鎖
  const ok1 = await equip(e, p, "裝備甲", "cat1", { titleKey: "tetris_score_2000", displayAvatarKey: "balloon_brother_01" });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.body));
  assert.deepEqual(ok1.body.data.equipped, { titleKey: "tetris_score_2000", titleName: "氣球堆疊師", displayAvatarKey: "balloon_brother_01", baseAvatarKey: "cat1" });
  const pl = (await e.call("GET", `/v1/players/${p}`)).body.data.player;
  assert.deepEqual([pl.playerId, pl.baseAvatarKey, pl.displayAvatarKey, pl.title.name], [p, "cat1", "balloon_brother_01", "氣球堆疊師"]);
  assert.equal(e.db.get(`players/${p}/profile`).baseAvatarKey, "cat1", "身份頭像沒有被改");
  const lb = (await e.call("GET", "/v1/leaderboards/tetris/total")).body.data.rows[0];
  assert.deepEqual([lb.playerId, lb.displayAvatarKey, lb.titleName], [p, "balloon_brother_01", "氣球堆疊師"], "排行榜顯示目前的展示頭像與稱號");
  // 還原
  const reset = await equip(e, p, "裝備甲", "cat1", { displayAvatarKey: null, titleKey: null });
  assert.deepEqual(reset.body.data.equipped, { titleKey: null, titleName: null, displayAvatarKey: "cat1", baseAvatarKey: "cat1" });
  const pl2 = (await e.call("GET", `/v1/players/${p}`)).body.data.player;
  assert.deepEqual([pl2.displayAvatarKey, pl2.title], ["cat1", null]);
  // 不裝備之後解鎖新稱號：不會被自動裝備回去
  await play(e, p, "tetris", { score: 3500, level: 5, lines: 42, peakCombo: 3, difficulty: "normal" }, 300000);
  assert.ok(titleKeys(e.db, p).includes("tetris_level_5"));
  assert.equal(col(e.db, p).equipped.titleKey, null);
  // 成績、V幣不受影響
  assert.equal(invariant(e.db, p), 40);
});

test("學生／私人頭像：不在公開目錄；未授權不能裝備；管理員授權後只出現在被授權玩家的收藏", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "學生甲", "girl3"), b = await newPlayer(e.call, "學生乙", "boy2");
  const before = await e.call("GET", `/v1/players/${a}/collection`);
  assert.ok(!before.body.data.catalog.avatars.some((x) => x.avatarKey.startsWith("student_")));
  assert.equal((await e.call("POST", `/v1/admin/collections/${a}/avatars`, { avatarKey: "student_hanhan", action: "grant" })).status, 401, "只有管理員");
  const g = await e.admin("POST", `/v1/admin/collections/${a}/avatars`, { avatarKey: "student_hanhan", action: "grant", note: "家長確認" });
  assert.equal(g.status, 200); assert.equal(g.body.data.changed, true);
  assert.equal((await e.admin("POST", `/v1/admin/collections/${a}/avatars`, { avatarKey: "student_hanhan", action: "grant" })).body.data.changed, false, "重複發放不重複建立");
  assert.equal((await e.admin("POST", `/v1/admin/collections/${a}/avatars`, { avatarKey: "xiaov_base", action: "grant" })).status, 400, "自動解鎖的頭像不能人工發");
  assert.equal((await e.admin("POST", `/v1/admin/collections/${a}/avatars`, { avatarKey: "balloon_brother_03", action: "grant" })).status, 400, "條件未定案的頭像不能發");
  const ca = (await e.call("GET", `/v1/players/${a}/collection`)).body.data;
  const cb = (await e.call("GET", `/v1/players/${b}/collection`)).body.data;
  assert.ok(ca.catalog.avatars.some((x) => x.avatarKey === "student_hanhan" && x.unlocked && x.private));
  assert.ok(!cb.catalog.avatars.some((x) => x.avatarKey.startsWith("student_")), "其他玩家看不到");
  assert.equal((await equip(e, b, "學生乙", "boy2", { displayAvatarKey: "student_hanhan" })).status, 403);
  assert.equal((await equip(e, a, "學生甲", "girl3", { displayAvatarKey: "student_hanhan" })).status, 200);
  // 收回：裝備中的會還原成身份頭像
  await e.admin("POST", `/v1/admin/collections/${a}/avatars`, { avatarKey: "student_hanhan", action: "revoke" });
  assert.equal((await e.call("GET", `/v1/players/${a}`)).body.data.player.displayAvatarKey, "girl3");
  const audits = (await e.admin("GET", "/v1/admin/collection-audits")).body.data.rows;
  assert.deepEqual(audits.map((x) => x.action).sort(), ["grant", "revoke"]);
});

test("A/B 隔離：收藏、裝備、錢包各自獨立", async () => {
  const e = setup();
  const a = await newPlayer(e.call, "隔離甲"), b = await newPlayer(e.call, "隔離乙", "girl1");
  await play(e, a, "tetris", TETRIS_OK, 120000);
  assert.deepEqual(titleKeys(e.db, b), []);
  assert.equal((await equip(e, b, "隔離乙", "girl1", { titleKey: "tetris_first_clear" })).status, 403, "B 不能裝備 A 的稱號");
  assert.equal((await e.call("GET", `/v1/players/${b}`)).body.data.player.title, null);
});

test("同時解鎖（兩場成績同時送出）不會互相蓋掉或重複", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "並發收藏");
  const s1 = await session(e.call, p, "tetris"), s2 = await session(e.call, p, "rhythm");
  e.clock.t += 200000;
  e.db.holdUntil((q) => q.method === "GET" && q.path === `collections/${p}`, 2);
  const [x, y] = await Promise.all([
    e.call("POST", "/v1/scores", submitBody(p, "tetris", s1, TETRIS_OK)),
    e.call("POST", "/v1/scores", submitBody(p, "rhythm", s2, rhythmData())),
  ]);
  assert.equal(x.status, 201); assert.equal(y.status, 201);
  const t = titleKeys(e.db, p);
  assert.ok(t.includes("tetris_first_clear") && t.includes("rhythm_first_stage"), t.join());
  assert.deepEqual(avatarKeys(e.db, p).filter((k) => k === "xiaov_base"), ["xiaov_base"]);
});

/* ───────── 歷史補判定 ───────── */
test("歷史補判定：只讀已接受的正式成績；可重複執行不重複發放；待審核不算", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "補判定");
  await play(e, p, "tetris", TETRIS_OK, 120000);
  await play(e, p, "rhythm", rhythmData(), 20000);   // 待審核
  // 模擬「收藏功能上線前就已有的正式成績」：清掉收藏與公開資料
  e.db.set(`collections/${p}`, null); e.db.set(`publicProfiles/${p}`, null);
  const r1 = await e.admin("POST", `/v1/admin/collections/${p}/backfill`, {});
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.data.totalAccepted, 1);
  assert.ok(titleKeys(e.db, p).includes("tetris_score_2000"));
  assert.ok(!titleKeys(e.db, p).some((k) => k.startsWith("rhythm")), "待審核成績不補判定");
  const rev = col(e.db, p).rev;
  const r2 = await e.admin("POST", `/v1/admin/collections/${p}/backfill`, {});
  assert.deepEqual(r2.body.data.granted, { titles: [], avatars: [] });
  assert.equal(col(e.db, p).rev, rev, "重跑沒有任何新的寫入");
  assert.equal(titleKeys(e.db, p).find((k) => k === "tetris_score_2000") !== undefined, true);
  assert.equal(col(e.db, p).titles.tetris_score_2000.source.type, "backfill");
});

/* ───────── 受控試營運 ───────── */
test("試營運：只有名單內玩家可以寫入；資料全部在 trial/；正式根目錄不受影響；可以清除", async () => {
  const pre = setup({});
  const tester = await newPlayer(pre.call, "試營運甲");
  const other = await newPlayer(pre.call, "試營運乙", "girl1");
  // 同一個資料庫，換成試營運設定
  const e = setup({ SCORES_ENABLED: "trial", REWARDS_ENABLED: "trial", TRIAL_PLAYER_IDS: tester }, Date.now(), pre.db);
  const st1 = (await e.call("GET", `/v1/launch/status?playerId=${tester}`)).body.data;
  const st2 = (await e.call("GET", `/v1/launch/status?playerId=${other}`)).body.data;
  assert.deepEqual([st1.scores, st1.rewards, st1.mode], ["enabled", "enabled", "trial"]);
  assert.deepEqual([st2.scores, st2.mode], ["disabled", "trial"]);
  assert.equal((await e.call("POST", "/v1/sessions", { playerId: other, gameId: "tetris", gameVersion: "x" })).status, 503, "名單外不能寫入");
  const { r } = await play(e, tester, "tetris", TETRIS_OK, 120000);
  assert.equal(r.body.data.status, "accepted"); assert.equal(r.body.data.balance, 40);
  assert.equal(e.db.get("scores"), null); assert.equal(e.db.get("wallets"), null); assert.equal(e.db.get("leaderboards"), null); assert.equal(e.db.get("collections"), null);
  assert.ok(e.db.get(`trial/scores/${r.body.data.submissionId}`)); assert.equal(e.db.get(`trial/wallets/${tester}`).balance, 40);
  assert.ok(e.db.get(`trial/collections/${tester}`).titles.tetris_first_clear);
  assert.equal((await e.call("GET", "/v1/leaderboards/tetris/total")).body.data.rows.length, 1, "試營運期間讀的是 trial/ 排行榜");
  assert.equal((await e.call("GET", `/v1/players/${tester}`)).body.data.player.title.name, "初次堆疊者");
  assert.equal((await equip(e, other, "試營運乙", "girl1", { displayAvatarKey: null })).status, 503, "名單外不能裝備");
  // 清除
  assert.equal((await e.admin("POST", "/v1/admin/trial/purge", {})).status, 400, "需要確認文字");
  assert.equal((await e.admin("POST", "/v1/admin/trial/purge", { confirm: "PURGE TRIAL" })).status, 200);
  assert.equal(e.db.get("trial"), null);
  assert.ok(e.db.get(`players/${tester}/profile`), "玩家身份不受影響");
  // 全面開放後：正式資料從乾淨狀態開始
  const on = setup(ON, Date.now(), pre.db);
  assert.equal((await on.call("GET", "/v1/leaderboards/tetris/total")).body.data.rows.length, 0);
  assert.equal((await on.admin("POST", "/v1/admin/trial/purge", { confirm: "PURGE TRIAL" })).status, 409, "全面開放後不能清除");
});

/* ───────── 管理 ───────── */
test("真實資料庫自我檢查：只用 _selftest/，結束後清除；包含條件寫入衝突與同時寫入", async () => {
  const e = setup({});
  const r = await e.admin("POST", "/v1/admin/selftest", {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.ok, true, JSON.stringify(r.body.data.steps));
  assert.equal(r.body.data.steps.length, 7);
  assert.equal(Object.keys(e.db.get("_selftest") || {}).length, 0, "清除乾淨");
  assert.equal((await e.call("POST", "/v1/admin/selftest", {})).status, 401);
});

test("管理：玩家收藏查詢（含來源）、收藏 CSV；既有成績／帳本 CSV 欄位不變", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "管理收藏");
  await play(e, p, "tetris", TETRIS_OK, 120000);
  const v = (await e.admin("GET", `/v1/admin/collections/${p}`)).body.data;
  assert.equal(v.displayId, "管理收藏"); assert.equal(v.titles.length, 4); assert.equal(v.sources.titles.tetris_first_clear.source.type, "score");
  assert.deepEqual(v.adminAvatars.map((a) => a.avatarKey), ["dance_sister_01", "balloon_sister_01", "balloon_sister_02", "bubble_brother_01", "xiaov_special", "student_hanhan", "student_xuanxuan"]);
  const csv = (await e.admin("GET", "/v1/admin/exports/collections.csv")).text.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(csv[0], "playerId,kind,key,gameId,unlockedAt,sourceType,sourceSubmissionId,equipped");
  assert.equal(csv.length, 1 + 4 + 2);
  const sc = (await e.admin("GET", "/v1/admin/exports/scores.csv")).text.replace(/^﻿/, "").split("\r\n")[0];
  assert.equal(sc, "submissionId,receivedAt,gameId,playerId,displayId,status,score,reasons,rewardDate,serverDurationSec,gameVersion,scoreData,reviewDecision,reviewBy,reviewAt");
  const lg = (await e.admin("GET", "/v1/admin/exports/ledger.csv")).text.replace(/^﻿/, "").split("\r\n")[0];
  assert.equal(lg, "txId,createdAt,playerId,gameId,type,dateKey,amount,balanceAfter,sourceSubmissionId,challengeKey");
  const launch = (await e.admin("GET", "/v1/admin/launch")).body.data;
  assert.deepEqual([launch.scoresMode, launch.rewardsMode], ["on", "on"]);
});

test("收藏功能不讀 Mock、不讀舊資料：沒有正式成績的玩家，收藏是空的", async () => {
  const e = setup();
  const p = await newPlayer(e.call, "空收藏");
  const v = (await e.call("GET", `/v1/players/${p}/collection`)).body.data;
  assert.deepEqual([v.titles.length, v.avatars.length, v.equipped.titleKey, v.equipped.displayAvatarKey], [0, 0, null, "boy1"]);
  assert.ok(v.catalog.titles.every((t) => t.unlocked === false));
});

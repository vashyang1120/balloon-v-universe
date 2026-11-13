/* v0.3.1 正式資料：稱號＋展示頭像收藏、四款同步、私人頭像權限、管理後台、試營運（真實瀏覽器；本機模擬後端）
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tests/browser/collection-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush> <輸出資料夾>
   環境：本 Repository 的 Worker 程式＋假 Firebase（本機模擬，不是真實資料庫、不是正式環境）。 */
import fs from "node:fs";
import path from "node:path";
import { createHarness, sleep, text, offscreenButtons, hasHorizontalScroll, ROOT } from "./harness.mjs";
const helpers = await import(path.join(ROOT, "backend/worker/tests/helpers.js"));

const [TETRIS, RHYTHM, QUIZ, RUSH, OUT] = process.argv.slice(2);
if (!OUT) { console.error("用法：collection-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush> <out>"); process.exit(2); }
const KEY = await helpers.newRsaKey("kid-coll-e2e");
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ, rush: RUSH }, out: OUT,
  flags: { SCORES_ENABLED: "on", REWARDS_ENABLED: "on", ADMIN_UIDS: helpers.ADMIN_UID }, jwks: helpers.staticJwks(KEY) });
const { check, newPage } = H;
const LOBBY = H.SITE + "index.html";
const RUSH_URL = "https://vashyang1120.github.io/balloon-v-rush/rpg-continent1-universe/";
const A = await H.apiCreate("收藏甲", "avatar_rabbit_hoodie");
const B = await H.apiCreate("收藏乙", "girl2");
const api = async (method, p, body, headers = {}) => {
  const init = { method, headers: { origin: H.ORIGIN, "cf-connecting-ip": "203.0.113.9", ...headers } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers["content-type"] = "application/json"; }
  const r = await H.app.fetch(new Request(H.API + p, init), H.env);
  return { status: r.status, body: await r.json().catch(() => null) };
};
const adminToken = async () => { const s = Math.floor((Date.now() + H.clock.offset) / 1000); return helpers.makeIdToken(KEY, { iat: s - 30, auth_time: s - 60, exp: s + 3600 }); };
/** API 直接完成一場（模擬：場次＋等待＋提交；伺服器規則照常檢查） */
async function apiPlay(pid, gameId, scoreData, waitMin) {
  const s = await api("POST", "/v1/sessions", { playerId: pid, gameId, gameVersion: "e2e" });
  H.clock.offset += waitMin * 60000;
  return api("POST", "/v1/scores", { schemaVersion: 1, submissionId: crypto.randomUUID(), sessionId: s.body.data.sessionId, playerId: pid, gameId, gameVersion: "e2e", scoreData });
}
const col = (pid) => H.db.get(`collections/${pid}`) || { titles: {}, avatars: {}, equipped: {} };

async function seedLobby(page, players, currentId) {
  await page.goto(LOBBY);
  await page.evaluate(({ players, currentId }) => {
    localStorage.setItem("bvUniverse_v2_rememberedPlayers", JSON.stringify(players.map((p, i) => ({ playerId: p.playerId, id: p.displayId, baseAvatarKey: p.baseAvatarKey, displayAvatarKey: p.baseAvatarKey, rememberedAt: 1000 + i }))));
    localStorage.setItem("bvUniverse_v2_currentPlayerId", currentId);
    players.forEach((p) => localStorage.setItem("bvUniverse_v2_lobbyTutorialDone__" + p.playerId, "1"));
  }, { players, currentId });
  await page.goto(LOBBY);
}
const lobbyReady = (page) => page.waitForFunction(() => { const c = document.getElementById("playerCard"); return c && !c.hidden && !c.classList.contains("is-loading") && document.getElementById("playerCardId").textContent.trim(); }, null, { timeout: 15000 });
async function openCollection(page) {
  if (await page.locator("#passModal").isHidden()) { await page.click("#signPass"); await page.waitForSelector("#passModal:not([hidden])"); }
  await page.click('#passModal [data-tab="collection"]');
  await page.waitForFunction(() => /目前稱號/.test(document.getElementById("passTabBody").textContent), null, { timeout: 10000 });
}
const collState = (page) => page.evaluate(() => ({
  body: document.getElementById("passTabBody").innerText,
  titles: [...document.querySelectorAll("#passTabBody [data-equip-title]")].filter((b) => b.dataset.equipTitle).map((b) => b.dataset.equipTitle + (b.classList.contains("is-on") ? "*" : "")),
  avatars: [...document.querySelectorAll("#passTabBody .coll-av")].map((b) => (b.dataset.equipAvatar || "BASE") + (b.classList.contains("is-on") ? "*" : "") + (b.classList.contains("is-locked") ? "#" : "")),
  card: (document.querySelector("#playerCard .av__face") || {}).getAttribute ? document.querySelector("#playerCard .av__face").getAttribute("src") : "",
  cardTitle: document.getElementById("playerCardTitle").textContent,
}));

/* ========== 1. 玩家 A 在真實遊戲完成一場方塊 → 解鎖；另用 API 完成節奏（A 等級） ========== */
{
  const { ctx, page } = await newPage();
  await page.goto(H.SITE + "universe/tetris/?bvPlayerId=" + A.playerId);
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady() && window.UniverseTetris.session.official.isEnabled(), null, { timeout: 15000 });
  await page.click("#btn-start"); await page.waitForSelector("#ov-btns button"); await page.click("#ov-btns button:nth-child(2)");
  await page.waitForFunction(() => running === true); await sleep(300);
  H.clock.offset += 120000;
  await page.evaluate(() => { for (let r = 0; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = (c === 4 ? null : "#3ecf8e"); cur = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff85a1" }; cx = 4; cy = -1; lock(); });
  await page.waitForFunction(() => /已記入|審核中|未通過|沒有記入/.test(document.getElementById("bv-result-note").textContent), null, { timeout: 10000 });
  const note = await text(page, "#bv-result-note");
  check("稱號｜解鎖", "方塊正式成績接受後，結算顯示新收藏（稱號「初次堆疊者」、頭像「小V」）", /新收藏：.*初次堆疊者.*小V/.test(note), note);
  check("稱號｜解鎖", "伺服器收藏有正式來源（成績編號）；第一個稱號自動裝備", col(A.playerId).titles.tetris_first_clear && col(A.playerId).titles.tetris_first_clear.source.type === "score" && col(A.playerId).equipped.titleKey === "tetris_first_clear", JSON.stringify(col(A.playerId).equipped));
  await page.screenshot({ path: `${OUT}/coll-01-tetris-unlock.png` });
  await ctx.close();
}
const rh = { songId: "song005", difficulty: "hard", score: 40000, maxCombo: 60, perfect: 127, good: 15, miss: 2, accuracy: 0, grade: "" };
rh.accuracy = Math.round((rh.perfect + rh.good * 0.5) / (rh.perfect + rh.good + rh.miss) * 100); rh.grade = rh.accuracy >= 95 ? "S" : rh.accuracy >= 88 ? "A+" : "A";
const rr = await apiPlay(A.playerId, "rhythm", rh, 4);
check("稱號｜解鎖", "節奏（模擬提交）困難＋A 以上 → 4 個節奏稱號與氣球哥哥 2", rr.body.data.status === "accepted" && ["rhythm_first_stage", "rhythm_rank_b", "rhythm_rank_a", "rhythm_hard_clear"].every((k) => col(A.playerId).titles[k]) && !!col(A.playerId).avatars.balloon_brother_02, JSON.stringify(rr.body.data.reasons) + Object.keys(col(A.playerId).titles).join());
const again = await apiPlay(A.playerId, "rhythm", rh, 4);
check("稱號｜重複", "再次達成同樣條件：不重複解鎖", again.body.data.status === "accepted" && again.body.data.unlocks.titles.length === 0 && again.body.data.unlocks.avatars.length === 0, JSON.stringify(again.body.data.unlocks));

/* ========== 2. 大廳通行證「收藏」：查看、裝備、還原 ========== */
const { ctx: mctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
await seedLobby(page, [A, B], A.playerId);
await lobbyReady(page);
await page.waitForFunction(() => /初次堆疊者/.test(document.getElementById("playerCardTitle").textContent), null, { timeout: 10000 }).catch(() => {});
await openCollection(page);
let cs = await collState(page);
check("大廳｜收藏", "通行證「收藏」列出已解鎖稱號（裝備中標示）與展示頭像（未解鎖顯示鎖定；沒有學生專屬）",
  cs.titles.includes("tetris_first_clear*") && cs.titles.length === 5 && cs.avatars[0] === "BASE*" && cs.avatars.includes("xiaov_base") && cs.avatars.includes("balloon_brother_03#") && !cs.avatars.some((a) => a.startsWith("student_")), JSON.stringify(cs.titles) + JSON.stringify(cs.avatars));
check("大廳｜同步", "右上玩家卡顯示目前稱號", /初次堆疊者/.test(cs.cardTitle), cs.cardTitle);
await page.screenshot({ path: `${OUT}/coll-02-pass-collection.png` });
await page.click('#passTabBody [data-equip-avatar="balloon_brother_02"]');
await page.waitForFunction(() => /已更新/.test((document.getElementById("collMsg") || {}).textContent || ""), null, { timeout: 10000 });
await page.click('#passTabBody [data-equip-title="rhythm_rank_a"]');
await page.waitForFunction(() => /派對節拍手/.test(document.getElementById("playerCardTitle").textContent), null, { timeout: 10000 });
cs = await collState(page);
const prof = H.db.get(`players/${A.playerId}/profile`);
check("大廳｜裝備", "點選已解鎖的展示頭像與稱號 → 伺服器更新；右上玩家卡立即換成新的頭像與稱號", cs.avatars.includes("balloon_brother_02*") && cs.titles.includes("rhythm_rank_a*") && /balloon_brother_02\.png/.test(cs.card) && /派對節拍手/.test(cs.cardTitle), JSON.stringify(cs));
check("身份不變", "裝備後 playerId、baseAvatarKey 不變（玩家資料只改展示）", prof.playerId === A.playerId && prof.baseAvatarKey === "avatar_rabbit_hoodie" && col(A.playerId).equipped.displayAvatarKey === "balloon_brother_02", JSON.stringify({ base: prof.baseAvatarKey, eq: col(A.playerId).equipped }));
const locked = await page.evaluate(() => { const b = document.querySelector('#passTabBody [data-equip-avatar="balloon_brother_03"]'); return b && b.disabled; });
const lockedApi = await api("POST", `/v1/players/${A.playerId}/equip`, { displayId: "收藏甲", baseAvatarKey: "avatar_rabbit_hoodie", displayAvatarKey: "balloon_brother_03" });
check("頭像｜權限", "未解鎖頭像：按鈕不能按，直接呼叫 API 也被伺服器拒絕（403）", locked === true && lockedApi.status === 403, String(lockedApi.status));
await page.screenshot({ path: `${OUT}/coll-03-pass-equipped.png` });
await page.click("#passClose");

/* ========== 3. 四款遊戲讀同一份資料 ========== */
for (const g of [{ id: "tetris", ready: "UniverseTetris" }, { id: "rhythm", ready: "UniverseRhythm" }, { id: "quiz", ready: "UniverseQuiz" }]) {
  const { ctx, page: p } = await newPage();
  await p.goto(H.SITE + `universe/${g.id}/?bvPlayerId=` + A.playerId);
  await p.waitForFunction((n) => window[n] && window[n].isReady(), g.ready, { timeout: 20000, polling: 100 });
  await p.waitForFunction((pid) => typeof PLAYER !== "undefined" && PLAYER.playerId === pid, A.playerId, { timeout: 15000, polling: 100 }).catch(() => {});
  const st = await p.evaluate((n) => ({ disp: PLAYER.displayAvatarKey, base: PLAYER.baseAvatarKey, pid: PLAYER.playerId, title: window[n].titleText(), src: PLAYER.avatarSrc }), g.ready);
  check("四款同步", `${g.id}：展示頭像＝氣球哥哥 2、稱號＝派對節拍手；身份頭像與 playerId 不變`, st.disp === "balloon_brother_02" && st.base === "avatar_rabbit_hoodie" && st.pid === A.playerId && st.title === "派對節拍手" && /balloon_brother_02\.png/.test(st.src), JSON.stringify(st));
  await p.evaluate((n) => window[n].notReady("titles"), g.ready);
  await p.waitForFunction(() => { const b = document.getElementById("bv-collection"); return b && !b.hidden && /派對節拍手/.test(b.textContent); }, null, { timeout: 8000, polling: 100 });
  const box = await text(p, "#bv-collection");
  check("四款同步", `${g.id}：共用收藏視窗（同一個畫面）顯示同一份收藏，更換請到大廳`, /目前稱號：派對節拍手/.test(box) && /稱號（5）/.test(box) && /大廳「我的通行證 → 收藏」/.test(box), box.replace(/\n/g, "／").slice(0, 160));
  if (g.id === "rhythm") await p.screenshot({ path: `${OUT}/coll-04-game-collection-viewer.png` });
  await ctx.close();
}
{
  const { ctx, page: p } = await newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(RUSH_URL + "?bvPlayerId=" + A.playerId);
  await p.waitForFunction(() => typeof C1U !== "undefined" && C1U.verify === "ok", null, { timeout: 20000 });
  const ad = await p.evaluate(() => ({ disp: C1U.profile.displayAvatarKey, base: C1U.profile.baseAvatarKey }));
  check("四款同步", "派對島：身份確認後讀到同一個展示頭像（身份頭像不變）", ad.disp === "balloon_brother_02" && ad.base === "avatar_rabbit_hoodie", JSON.stringify(ad));
  await ctx.close();
}

/* ========== 4. 排行榜顯示目前展示頭像與稱號 ========== */
await page.click("#signSelect"); await page.waitForSelector("#lbModal:not([hidden])");
await page.click('[data-lb-game="tetris"]');
await page.waitForFunction(() => document.querySelectorAll("#lbList .lb-row").length > 0, null, { timeout: 10000 });
const row = await page.evaluate(() => { const r = document.querySelector("#lbList .lb-row"); return { src: r.querySelector(".lb-row__av").getAttribute("src"), title: (r.querySelector(".lb-row__title") || {}).textContent || "" }; });
check("排行榜", "大廳排行榜顯示玩家目前的展示頭像與稱號（不是提交成績當時的）", /balloon_brother_02\.png/.test(row.src) && /派對節拍手/.test(row.title), JSON.stringify(row));
await page.screenshot({ path: `${OUT}/coll-05-leaderboard-avatar-title.png` });
await page.click("#lbClose");

/* ========== 5. 跨裝置：新的瀏覽器（沒有任何本機資料）讀到同一份收藏 ========== */
{
  const { ctx, page: p } = await newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await seedLobby(p, [A], A.playerId);
  await lobbyReady(p);
  await p.waitForFunction(() => /派對節拍手/.test(document.getElementById("playerCardTitle").textContent), null, { timeout: 10000 }).catch(() => {});
  await openCollection(p);
  const c2 = await collState(p);
  check("跨裝置", "另一台裝置（手機尺寸、全新本機資料）讀到同樣的收藏與裝備", c2.titles.includes("rhythm_rank_a*") && c2.avatars.includes("balloon_brother_02*") && /派對節拍手/.test(c2.cardTitle), JSON.stringify(c2.titles));
  const off = await offscreenButtons(p, "#passModal"), hs = await hasHorizontalScroll(p);
  await p.screenshot({ path: `${OUT}/coll-06-pass-collection-390.png` });
  check("視窗", "390×844：收藏頁按鈕都在畫面內、沒有水平捲動", off.length === 0 && !hs, off.join(","));
  await ctx.close();
}

/* ========== 6. 學生／私人頭像：管理員授權給 B；A 看不到、不能裝備 ========== */
{
  const token = await adminToken();
  const FAKE_APP = "export function initializeApp(){ return {}; }";
  const FAKE_AUTH = `const TOKEN=${JSON.stringify(token)}; const L=[]; const A={currentUser:null};
    export function getAuth(){ return A; } export const inMemoryPersistence={}; export async function setPersistence(){}
    export class GoogleAuthProvider{ setCustomParameters(){} }
    export function onAuthStateChanged(a,cb){ L.push(cb); setTimeout(()=>cb(A.currentUser),0); }
    export async function signInWithPopup(){ A.currentUser={ uid:${JSON.stringify(helpers.ADMIN_UID)}, getIdToken: async()=>TOKEN }; L.forEach(f=>f(A.currentUser)); }
    export async function signOut(){ A.currentUser=null; L.forEach(f=>f(null)); }`;
  const { ctx, page: p } = await newPage({ viewport: { width: 1280, height: 900 } });
  await ctx.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_APP }));
  await ctx.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_AUTH }));
  p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "PURGE TRIAL" : undefined));
  await p.goto(H.SITE + "universe/admin/");
  await p.waitForFunction(() => !document.getElementById("btnLogin").disabled, null, { timeout: 10000 });
  await p.click("#btnLogin");
  await p.waitForFunction(() => !document.getElementById("adminArea").classList.contains("hidden"), null, { timeout: 10000 });
  await p.waitForFunction(() => /全面開放/.test(document.getElementById("launchStatus").textContent), null, { timeout: 10000 });
  check("後台｜狀態", "顯示正式寫入狀態（本測試設定為全面開放）", /正式成績：全面開放｜V幣：全面開放/.test(await text(p, "#launchStatus")), await text(p, "#launchStatus"));
  // 玩家 A 收藏查詢
  await p.fill("#cPlayer", A.playerId); await p.click("#btnColl");
  await p.waitForFunction(() => /稱號 \d+ 個/.test(document.getElementById("collStatus").textContent), null, { timeout: 10000 });
  const rowsA = await p.evaluate(() => [...document.querySelectorAll("#collTable tbody tr")].map((r) => r.innerText.replace(/\s+/g, " ")));
  check("後台｜收藏查詢", "依 playerId 查詢稱號／頭像（含解鎖時間、來源成績）與目前裝備", rowsA.length === 7 && rowsA.every((r) => /正式成績 [0-9a-f-]{20,}/.test(r)) && /派對節拍手/.test(await text(p, "#collEquipped")), rowsA.join("｜").slice(0, 200));
  await p.screenshot({ path: `${OUT}/coll-07-admin-collection.png`, fullPage: true });
  // 授權學生頭像給 B
  await p.fill("#cPlayer", B.playerId); await p.click("#btnColl");
  await p.waitForSelector('#grantTable button[data-grant="student_hanhan"]');
  await p.fill("#gNote", "家長確認：涵涵本人");
  await p.click('#grantTable button[data-grant="student_hanhan"]');
  await p.waitForFunction(() => /已發放/.test(document.getElementById("collStatus").textContent), null, { timeout: 10000 });
  check("後台｜發放", "管理員把學生專屬頭像授權給 B（伺服器記錄發放者與備註）", !!col(B.playerId).avatars.student_hanhan && col(B.playerId).avatars.student_hanhan.source.type === "admin", JSON.stringify(col(B.playerId).avatars));
  // 歷史補判定、自我檢查、收藏 CSV
  await p.fill("#cPlayer", A.playerId); await p.click("#btnBackfill");
  await p.waitForFunction(() => /補判定完成/.test(document.getElementById("collStatus").textContent), null, { timeout: 15000 });
  check("後台｜補判定", "歷史成績補判定：讀取已接受的正式成績；已擁有的不重複（新增 0）", /新增稱號 0 個、頭像 0 個/.test(await text(p, "#collStatus")), await text(p, "#collStatus"));
  await p.click("#btnSelftest");
  await p.waitForFunction(() => /自我檢查(全部通過|有項目失敗)/.test(document.getElementById("launchStatus").textContent), null, { timeout: 15000 });
  check("後台｜資料庫自我檢查", "自我檢查 7 個步驟（本機假 Firebase；正式資料庫要部署後在後台按一次）", /全部通過/.test(await text(p, "#launchStatus")) && (await text(p, "#selftestOut")).split("\n").length === 7, await text(p, "#selftestOut"));
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click("#btnCsvColl")]);
  const csvPath = path.join(OUT, "admin-collections-export.csv"); await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  check("後台｜CSV", "收藏 CSV 可下載（新增的檔案；原本的成績／帳本 CSV 欄位不變）", csv[0] === "playerId,kind,key,gameId,unlockedAt,sourceType,sourceSubmissionId,equipped" && csv.length >= 9, csv[0] + " rows " + (csv.length - 1));
  await ctx.close();
}
// B 的大廳：看得到並裝備學生頭像；A 看不到
await page.evaluate((pid) => localStorage.setItem("bvUniverse_v2_currentPlayerId", pid), B.playerId);
await page.goto(LOBBY); await lobbyReady(page);
await openCollection(page);
let csB = await collState(page);
check("私人頭像", "B（被授權）的收藏出現學生專屬頭像，可以裝備", csB.avatars.includes("student_hanhan"), JSON.stringify(csB.avatars));
await page.click('#passTabBody [data-equip-avatar="student_hanhan"]');
await page.waitForFunction(() => /已更新/.test((document.getElementById("collMsg") || {}).textContent || ""), null, { timeout: 10000 });
csB = await collState(page);
check("私人頭像", "B 裝備後玩家卡換成學生專屬頭像（圖片沿用既有素材）", /student_hanhan_01\.png/.test(csB.card), csB.card);
check("A/B 隔離", "B 的收藏沒有 A 的稱號；A 的稱號沒有出現在 B", csB.titles.length === 0 && !/派對節拍手/.test(csB.cardTitle), JSON.stringify(csB.titles));
await page.screenshot({ path: `${OUT}/coll-08-private-avatar-B.png` });
await page.click("#passClose");
await page.evaluate((pid) => localStorage.setItem("bvUniverse_v2_currentPlayerId", pid), A.playerId);
await page.goto(LOBBY); await lobbyReady(page);
await openCollection(page);
cs = await collState(page);
const aTry = await api("POST", `/v1/players/${A.playerId}/equip`, { displayId: "收藏甲", baseAvatarKey: "avatar_rabbit_hoodie", displayAvatarKey: "student_hanhan" });
check("私人頭像", "A（沒有授權）的收藏看不到學生專屬頭像；直接呼叫 API 裝備被拒絕（403）", !cs.avatars.some((a) => a.startsWith("student_")) && aTry.status === 403, String(aTry.status));
// 還原預設展示頭像
await page.click('#passTabBody .coll-av[data-equip-avatar=""]');
await page.waitForFunction(() => /已更新/.test((document.getElementById("collMsg") || {}).textContent || ""), null, { timeout: 10000 });
cs = await collState(page);
check("頭像｜還原", "點身份頭像 → 還原成預設展示頭像（身份頭像）", cs.avatars[0] === "BASE*" && /avatar_rabbit_hoodie\.png/.test(cs.card), JSON.stringify(cs.avatars.slice(0, 2)) + cs.card);
await page.click('#passTabBody [data-equip-title=""]');
await page.waitForFunction(() => /未裝備/.test(document.getElementById("playerCardTitle").textContent), null, { timeout: 10000 });
check("稱號｜不裝備", "可以選擇不裝備稱號", col(A.playerId).equipped.titleKey === null, JSON.stringify(col(A.playerId).equipped));
await mctx.close();

/* ========== 7. 視窗：收藏頁 ========== */
for (const vp of [{ w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 360, h: 640, mobile: true }]) {
  const { ctx, page: p } = await newPage({ viewport: { width: vp.w, height: vp.h }, mobile: !!vp.mobile });
  await seedLobby(p, [A, B], A.playerId);
  await lobbyReady(p);
  await openCollection(p);
  const off = await offscreenButtons(p, "#passModal"), hs = await hasHorizontalScroll(p);
  await p.screenshot({ path: `${OUT}/coll-vp-${vp.w}x${vp.h}.png` });
  check("視窗", `${vp.w}×${vp.h}：收藏頁按鈕都在畫面內、沒有水平捲動`, off.length === 0 && !hs, off.join(","));
  await ctx.close();
}

/* ========== 安全 ========== */
check("安全", "前端沒有寫入錢包、稱號、頭像解鎖的 API（只有 equip 與成績流程）", !H.apiCalls.some((c) => /^(POST|PUT|PATCH|DELETE) \/v1\/(wallet|collections|titles|avatars)/.test(c)) && !H.apiCalls.some((c) => /^POST \/v1\/admin/.test(c) && false), "");
check("安全", "沒有連到舊 Firebase 或其他未允許的外部網址", H.external.filter((u) => !/fonts|youtube|ytimg/.test(u)).length === 0, H.external.slice(0, 5).join(" "));
const ok1 = await H.finish("collection-e2e");

/* ========== 8. 正式寫入關閉：收藏只能查看、不能更換 ========== */
const H2 = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ, rush: RUSH }, out: OUT });
{
  const C = await H2.apiCreate("關閉丙", "cat1");
  const { ctx, page: p } = await H2.newPage();
  await seedLobby(p, [C], C.playerId);
  await lobbyReady(p);
  await openCollection(p);
  const st = await p.evaluate(() => ({ note: (document.querySelector("#passTabBody .coll-note") || {}).textContent || "", enabled: [...document.querySelectorAll("#passTabBody .coll-av, #passTabBody .coll-chip")].filter((b) => !b.disabled).length }));
  H2.check("開關｜關閉", "正式寫入關閉（預設）：收藏只能查看、按鈕全部不能按、沒有任何寫入", /尚未開啟/.test(st.note) && st.enabled === 0 && !H2.apiCalls.some((c) => /^POST \/v1\/(players\/[^/]+\/equip|sessions|scores)/.test(c)), JSON.stringify(st));
  await p.screenshot({ path: `${OUT}/coll-09-flags-off.png` });
  await ctx.close();
}
const ok2 = await H2.finish("collection-e2e-flags-off");

/* ========== 9. 受控試營運：只有名單內玩家寫入 trial/；名單外照常遊玩但不寫入 ========== */
const H3pre = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ, rush: RUSH }, out: OUT });
const T1 = await H3pre.apiCreate("試營甲", "dog1");
const T2 = await H3pre.apiCreate("試營乙", "dog2");
await H3pre.finish("collection-e2e-trial-setup");
const H3 = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ, rush: RUSH }, out: OUT, flags: { SCORES_ENABLED: "trial", REWARDS_ENABLED: "trial", TRIAL_PLAYER_IDS: T1.playerId } });
// 沿用同一批玩家：把建立好的玩家複製到新的假資料庫
H3.db.set("players", H3pre.db.get("players")); H3.db.set("identities", H3pre.db.get("identities"));
for (const P of [T1, T2]) {
  const { ctx, page: p } = await H3.newPage();
  await p.goto(H3.SITE + "universe/tetris/?bvPlayerId=" + P.playerId);
  await p.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  await sleep(800);
  const on = await p.evaluate(() => window.UniverseTetris.session.official.isEnabled());
  await p.click("#btn-start"); await p.waitForSelector("#ov-btns button"); await p.click("#ov-btns button:nth-child(2)");
  await p.waitForFunction(() => running === true); await sleep(300);
  H3.clock.offset += 120000;
  await p.evaluate(() => { for (let r = 0; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = (c === 4 ? null : "#3ecf8e"); cur = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff85a1" }; cx = 4; cy = -1; lock(); });
  await p.waitForSelector("#s-result:not(.off)", { timeout: 8000 });
  await sleep(1500);
  const note = await text(p, "#bv-result-note");
  if (P === T1) H3.check("試營運", "名單內玩家：正式成績寫入 trial/（正式排行榜、正式錢包不受影響）", on && /已記入正式排行榜/.test(note) && !!H3.db.get(`trial/wallets/${T1.playerId}`) && H3.db.get("wallets") === null && H3.db.get("leaderboards") === null, note);
  else H3.check("試營運", "名單外玩家：遊戲照常，成績維持本分頁測試成績（不寫入任何正式資料）", !on && !/已記入正式排行榜/.test(note) && !H3.db.get(`trial/wallets/${T2.playerId}`), note);
  await ctx.close();
}
const ok3 = await H3.finish("collection-e2e-trial");
process.exit(ok1 && ok2 && ok3 ? 0 : 1);

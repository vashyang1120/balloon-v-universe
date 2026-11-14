/* v0.3.3 正式全面上線：切換流程（真實瀏覽器；本機模擬後端＝Worker 程式＋假 Firebase，不是正式環境）
   試營運累積測試資料 → 後台匯出 CSV → 後台「清除試營運資料」→ 確認 trial/ 已清空 → 套用 wrangler.jsonc 正式設定（模擬合併部署）
   → 後台顯示「正式成績：已啟用」→ 大廳／通行證／排行榜／遊戲沒有試營運文案 → 第一筆正式成績 → 身份不變
   用法：NODE_PATH=$(npm root -g) node universe/tests/browser/production-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush> <輸出資料夾> */
import fs from "node:fs";
import path from "node:path";
import { createHarness, sleep, text, ROOT } from "./harness.mjs";
const helpers = await import(path.join(ROOT, "backend/worker/tests/helpers.js"));
const LH = await import(path.join(ROOT, "backend/worker/tests/launch-helpers.js"));

const [TETRIS, RHYTHM, QUIZ, RUSH, OUT] = process.argv.slice(2);
if (!OUT) { console.error("用法：production-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush> <out>"); process.exit(2); }
const PROD = JSON.parse(fs.readFileSync(path.join(ROOT, "backend/worker/wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars;
const KEY = await helpers.newRsaKey("kid-production-e2e");
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ, rush: RUSH }, out: OUT,
  flags: { SCORES_ENABLED: "trial", REWARDS_ENABLED: "trial", TRIAL_PLAYER_IDS: "", ADMIN_UIDS: helpers.ADMIN_UID }, jwks: helpers.staticJwks(KEY) });
const { check, note, newPage } = H;
check("設定", "wrangler.jsonc 正式設定：SCORES_ENABLED=on、REWARDS_ENABLED=on、TRIAL_PLAYER_IDS 空白", PROD.SCORES_ENABLED === "on" && PROD.REWARDS_ENABLED === "on" && PROD.TRIAL_PLAYER_IDS === "", JSON.stringify([PROD.SCORES_ENABLED, PROD.REWARDS_ENABLED, PROD.TRIAL_PLAYER_IDS]));

/* ---------- 試營運期間（合併前）：測試玩家累積測試資料 ---------- */
const T = await H.apiCreate("宇宙測試1", "girl2");
const O = await H.apiCreate("一般玩家", "boy1");
H.env.TRIAL_PLAYER_IDS = T.playerId;
const e = {
  call: async (method, p, body) => {
    const init = { method, headers: { origin: H.ORIGIN, "cf-connecting-ip": "198.51.100." + (1 + Math.floor(Math.random() * 200)) } };
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers["content-type"] = "application/json"; }
    const r = await H.app.fetch(new Request(H.API + p, init), H.env); const t = await r.text(); let b = null; try { b = JSON.parse(t); } catch { b = t; }
    return { status: r.status, body: b };
  },
  clock: { get t() { return Date.now() + H.clock.offset; }, set t(v) { H.clock.offset = v - Date.now(); } },
};
H.clock.offset = -3 * 3600 * 1000;
await LH.play(e, T.playerId, "tetris", LH.TETRIS_OK, 120000);
await LH.play(e, T.playerId, "rhythm", LH.rhythmData("song005", "hard", 0.9), 200000);
H.clock.offset = 0;
await e.call("POST", `/v1/players/${T.playerId}/equip`, { displayId: "宇宙測試1", baseAvatarKey: "girl2", displayAvatarKey: "balloon_brother_02" });
const tw = H.db.get(`trial/wallets/${T.playerId}`);
check("試營運", "測試玩家在試營運得到測試 V幣、稱號、展示頭像（全部在 trial/）", tw && tw.balance === 50 && !!H.db.get(`trial/collections/${T.playerId}`).avatars.balloon_brother_02 && H.db.get("wallets") == null, JSON.stringify(tw && tw.balance));
const profT = JSON.stringify(H.db.get(`players/${T.playerId}/profile`)), profO = JSON.stringify(H.db.get(`players/${O.playerId}/profile`));
const idsBefore = JSON.stringify(H.db.get("identities"));

/* ---------- 管理後台 ---------- */
const FAKE_APP = "export function initializeApp(){ return {}; }";
async function adminPage() {
  const s = Math.floor((Date.now() + H.clock.offset) / 1000);
  const token = await helpers.makeIdToken(KEY, { iat: s - 30, auth_time: s - 60, exp: s + 3600 });
  const fakeAuth = `const TOKEN=${JSON.stringify(token)}; const L=[]; const A={currentUser:null};
    export function getAuth(){ return A; } export async function setPersistence(){} export const inMemoryPersistence={};
    export class GoogleAuthProvider{ setCustomParameters(){} }
    export function onAuthStateChanged(a,cb){ L.push(cb); setTimeout(()=>cb(A.currentUser),0); }
    export async function signInWithPopup(){ A.currentUser={ uid:${JSON.stringify(helpers.ADMIN_UID)}, getIdToken: async()=>TOKEN }; L.forEach(f=>f(A.currentUser)); }
    export async function signOut(){ A.currentUser=null; L.forEach(f=>f(null)); }`;
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } });
  await ctx.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_APP }));
  await ctx.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: fakeAuth }));
  await page.goto(H.SITE + "universe/admin/");
  await page.waitForFunction(() => !document.getElementById("btnLogin").disabled, null, { timeout: 10000 });
  await page.click("#btnLogin");
  await page.waitForFunction(() => /正式成績：/.test(document.getElementById("launchStatus").textContent), null, { timeout: 10000 });
  return { ctx, page };
}
const csvOf = async (p, btn, name) => {
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click(btn)]);
  const f = path.join(OUT, name); await dl.saveAs(f);
  return fs.readFileSync(f, "utf8").replace(/^﻿/, "").trim().split("\r\n");
};
{
  const { ctx, page: p } = await adminPage();
  const st = await text(p, "#launchStatus");
  check("清除前｜狀態", "第一步：後台顯示目前仍是受控試營運，並列出 trial/ 仍有哪些測試資料", /受控試營運/.test(st) && /trial\/ 仍有測試資料（.*wallets/.test(st), st);
  // 第三步：匯出 CSV 保留驗收證據
  await p.selectOption("#fStatus", ""); await p.click("#btnSearch");
  await p.waitForFunction(() => /共 \d+ 筆/.test(document.getElementById("listStatus").textContent), null, { timeout: 10000 });
  const c1 = await csvOf(p, "#btnCsvScores", "trial-scores.csv");
  await p.fill("#wPlayer", "");
  const c2 = await csvOf(p, "#btnCsvLedger", "trial-ledger.csv");
  const c3 = await csvOf(p, "#btnCsvColl", "trial-collections.csv");
  check("清除前｜CSV 備份", "第三步：清除前可以匯出試營運成績、帳本、收藏 CSV（驗收證據）", c1.length - 1 === 2 && c2.length - 1 === 3 && c3.slice(1).every((l) => l.startsWith(T.playerId + ",")) && c3.length > 5, `${c1.length - 1}/${c2.length - 1}/${c3.length - 1}`);
  await p.screenshot({ path: `${OUT}/prod-01-admin-before-purge.png`, fullPage: true });
  // 第四步：清除（輸入 PURGE TRIAL）
  await p.evaluate(() => { window.prompt = () => "PURGE TRIAL"; });   // 等同管理員在確認視窗輸入 PURGE TRIAL
  await p.click("#btnPurge");
  await p.waitForFunction(() => /trial\/ 已清空/.test(document.getElementById("launchStatus").textContent), null, { timeout: 10000 });
  const st2 = await text(p, "#launchStatus");
  check("清除｜結果", "第四、五步：清除後後台顯示「trial/ 已清空」；資料庫 trial/ 確實為空", /trial\/ 已清空/.test(st2) && H.db.get("trial") == null, st2);
  check("清除｜範圍", "只清除 trial/：players/、identities/ 與正式資料區都沒有被動到", JSON.stringify(H.db.get(`players/${T.playerId}/profile`)) === profT && JSON.stringify(H.db.get(`players/${O.playerId}/profile`)) === profO && JSON.stringify(H.db.get("identities")) === idsBefore, "");
  await p.screenshot({ path: `${OUT}/prod-02-admin-after-purge.png`, fullPage: true });
  await ctx.close();
}

/* ---------- 第六、七步：合併正式設定 → Cloudflare 部署（本機：套用 wrangler.jsonc 的值） ---------- */
Object.assign(H.env, { SCORES_ENABLED: PROD.SCORES_ENABLED, REWARDS_ENABLED: PROD.REWARDS_ENABLED, TRIAL_PLAYER_IDS: PROD.TRIAL_PLAYER_IDS });
{
  const { ctx, page: p } = await adminPage();
  const st = await text(p, "#launchStatus");
  check("部署後｜後台", "後台清楚標示「正式成績：已啟用｜V幣：已啟用」，資料位置是正式；清除按鈕停用", /^正式成績：已啟用｜V幣：已啟用｜資料位置：正式（\/）｜trial\/ 已清空$/.test(st) && await p.evaluate(() => document.getElementById("btnPurge").disabled), st);
  await p.screenshot({ path: `${OUT}/prod-03-admin-on.png`, fullPage: true });
  await ctx.close();
}

/* ---------- 大廳：沿用原本身份；沒有試營運文案；試營運資料沒有帶過來 ---------- */
const LOBBY = H.SITE + "index.html";
const { ctx: lctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
const bad = [];
page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_|Failed to load resource/.test(m.text())) bad.push(m.text()); });
await page.goto(LOBBY);
await page.evaluate(({ T, O }) => {
  localStorage.setItem("bvUniverse_v2_rememberedPlayers", JSON.stringify([T, O].map((p, i) => ({ playerId: p.playerId, id: p.displayId, baseAvatarKey: p.baseAvatarKey, displayAvatarKey: "balloon_brother_02", rememberedAt: 1000 + i }))));
  localStorage.setItem("bvUniverse_v2_currentPlayerId", T.playerId);
  [T, O].forEach((p) => localStorage.setItem("bvUniverse_v2_lobbyTutorialDone__" + p.playerId, "1"));
}, { T, O });
await page.goto(LOBBY);
const lobbyReady = () => page.waitForFunction(() => { const el = document.getElementById("playerCardId"); return el && el.textContent.trim() && !document.getElementById("playerCard").hidden && !document.getElementById("playerCard").classList.contains("is-loading"); }, null, { timeout: 15000 });
await lobbyReady();
await sleep(800);
const TRIAL_WORDS = /試營運|正式開放前會清除/;
async function passText(tab) {
  if (await page.locator("#passModal").isHidden()) { await page.click("#signPass"); await page.waitForSelector("#passModal:not([hidden])"); }
  await page.click(`#passModal [data-tab="${tab}"]`);
  await sleep(900);
  return text(page, "#passTabBody");
}
async function boardText() {
  if (await page.locator("#lbModal").isHidden()) { await page.click("#signSelect"); await page.waitForSelector("#lbModal:not([hidden])"); }
  if (!(await page.locator('[data-lb-game="tetris"]').count())) await page.click("#lbBack");
  await page.click('[data-lb-game="tetris"]');
  await page.waitForFunction(() => { const l = document.getElementById("lbList"); return l && !/載入中/.test(l.textContent); }, null, { timeout: 10000 });
  const t = await text(page, "#lbModal"); await page.click("#lbClose"); return t;
}
{
  const basic = await passText("basic"), coll = await passText("collection");
  await page.click("#passClose");
  const card = await text(page, "#playerCard");
  const board = await boardText();
  check("正式｜身份沿用", "大廳選擇原本的玩家（宇宙測試1，身份頭像 girl2）即可進入，不需要重新建立；playerId 不變", /宇宙測試1/.test(card) && basic.includes(T.playerId), card.replace(/\s+/g, " "));
  const colOn = (await e.call("GET", `/v1/players/${T.playerId}/collection`)).body.data;
  check("正式｜試營運資料不帶入", "正式 V幣 0、正式收藏 0、展示頭像回到身份頭像女生2（試營運的 50 V幣、稱號、頭像都不是正式資料）", /V幣\s*0/.test(basic) && /展示頭像\s*女生2/.test(basic) && colOn.titles.length === 0 && colOn.avatars.length === 0 && colOn.mode === "on", basic.replace(/\s+/g, " ").slice(0, 160));
  check("正式｜沒有試營運文案", "通行證、收藏、排行榜、玩家卡都沒有「試營運」「正式開放前會清除」等文字", !TRIAL_WORDS.test(basic + coll + board + card), (basic + coll + board).match(TRIAL_WORDS)?.[0] || "");
  check("正式｜排行榜", "正式排行榜從空白開始（試營運排行榜不會出現）", /還沒有|沒有成績|目前沒有/.test(board), board.replace(/\s+/g, " ").slice(0, 120));
  await page.screenshot({ path: `${OUT}/prod-04-lobby-on.png` });
}
// 方塊遊戲首頁標示
{
  await page.locator('.entry[data-zone="blocks"]').click();
  await page.waitForFunction(() => document.getElementById("infoPanel").getAttribute("aria-hidden") === "false", null, { timeout: 8000 });
  await sleep(250); await page.click("#playBtn");
  await page.waitForURL(/\/universe\/tetris\/\?bvPlayerId=/);
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady() && window.UniverseTetris.session.official.isEnabled(), null, { timeout: 15000 });
  const mark = await text(page, "#bv-status-mark"), title = await page.evaluate(() => document.getElementById("bv-status-mark").title);
  check("正式｜遊戲標示", "方塊首頁標示「正式成績」（不是試營運）", /正式成績/.test(mark) && !TRIAL_WORDS.test(mark + title), mark + "｜" + title);
  await page.screenshot({ path: `${OUT}/prod-05-tetris-on.png` });
}

/* ---------- 第一筆正式成績（本機模擬；正式網站由使用者實際遊玩） ---------- */
H.clock.offset = -3600 * 1000;
const first = await LH.play(e, T.playerId, "tetris", LH.TETRIS_OK, 120000);
const second = await LH.play(e, O.playerId, "rhythm", LH.rhythmData("song005", "hard", 0.9), 200000);
const again = await LH.play(e, T.playerId, "tetris", LH.TETRIS_OK, 120000);
H.clock.offset = 0;
const w = H.db.get(`wallets/${T.playerId}`);
check("首筆｜成績", "第一場正式遊戲 accepted，寫在正式資料區（不是 trial/）", first.r.body.data.status === "accepted" && !!H.db.get(`leaderboards/tetris/total/${T.playerId}`) && H.db.get("trial") == null, first.r.body.data.status);
check("首筆｜V幣", "共用每日 +30＋方塊今日挑戰 +10＝40；再玩一次不重複領獎；帳本與餘額一致", first.r.body.data.balance === 40 && again.r.body.data.balance === 40 && LH.invariant(H.db, T.playerId) === 40, JSON.stringify(Object.values(w.ledger).map((x) => x.type + ":" + x.amount)));
check("首筆｜收藏", "正式稱號、展示頭像依原規則自動解鎖", !!H.db.get(`collections/${T.playerId}`).titles.tetris_first_clear && !!H.db.get(`collections/${T.playerId}`).avatars.xiaov_base, Object.keys(H.db.get(`collections/${T.playerId}`).titles).join(","));
check("首筆｜所有玩家", "不在原試營運名單的一般玩家也能寫入正式成績與 V幣", second.r.body.data.status === "accepted" && second.r.body.data.balance === 40, "");
await page.goto(LOBBY); await lobbyReady(); await sleep(800);
{
  const basic = await passText("basic"); await page.click("#passClose");
  const board = await boardText();
  check("首筆｜通行證與排行榜", "通行證 V幣 40、排行榜出現宇宙測試1（沒有試營運文案）", /V幣\s*40/.test(basic) && /宇宙測試1/.test(board) && !TRIAL_WORDS.test(basic + board), board.replace(/\s+/g, " ").slice(0, 120));
  await page.screenshot({ path: `${OUT}/prod-06-lobby-first-record.png` });
}
await lctx.close();
{
  const { ctx, page: p } = await adminPage();
  await p.fill("#pQuery", "宇宙測試1"); await p.click("#btnPSearch");
  await p.waitForSelector(`#pResults button[data-pick="${T.playerId}"]`);
  await p.click(`#pResults button[data-pick="${T.playerId}"]`);
  await p.waitForFunction(() => /已選擇/.test(document.getElementById("pPanelStatus").textContent) && /餘額/.test(document.getElementById("pLedgerStatus").textContent), null, { timeout: 15000 });
  const sm = await p.evaluate(() => ({ bal: document.querySelector('#pSummary [data-k="balance"]').textContent, n: document.querySelector('#pSummary [data-k="scoreCount"]').textContent,
    trialTag: !document.getElementById("pTrialTag").classList.contains("hidden"), panel: document.getElementById("pPanelStatus").textContent, ledger: document.getElementById("pLedgerStatus").textContent }));
  check("首筆｜後台", "玩家管理中心查得到正式紀錄（V幣 40、成績 2 筆），沒有「試營運資料」標示", sm.bal === "40" && sm.n === "2" && !sm.trialTag && !TRIAL_WORDS.test(sm.panel + sm.ledger), JSON.stringify(sm));
  await p.screenshot({ path: `${OUT}/prod-07-admin-first-record.png`, fullPage: true });
  await ctx.close();
}
check("身份不變", "整個切換與正式遊玩過程，玩家身份資料（playerId、玩家 ID、身份頭像）沒有被修改", JSON.stringify(H.db.get(`players/${T.playerId}/profile`)) === profT && JSON.stringify(H.db.get(`players/${O.playerId}/profile`)) === profO, "");
check("安全", "沒有連到舊 Firebase 或其他未允許的外部網址", H.external.filter((u) => !/fonts|youtube|ytimg/.test(u)).length === 0, H.external.slice(0, 5).join(" "));
note("正式環境", "正式網站的清除、部署與第一筆正式成績，要由使用者在正式後台與遊戲中操作（本測試是本機模擬）");
const ok = await H.finish("production-e2e");
process.exit(ok ? 0 : 1);

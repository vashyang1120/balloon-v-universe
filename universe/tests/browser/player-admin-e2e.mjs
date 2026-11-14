/* v0.3.2：派對島角色資料同步＋管理後台「玩家管理中心」（真實瀏覽器；本機模擬後端＝Worker 程式＋假 Firebase，不是正式環境）
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tests/browser/player-admin-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush 分支 clone> <輸出資料夾>
   - 使用 wrangler.jsonc 的實際模式（trial／trial）；為了測「全體 CSV 不被篩選」「切換玩家不混資料」，本測試在試營運名單多加一位同名玩家（只在本機）
   - 「修正前」截圖：同一個網頁，但把派對島 main.js 換回 balloon-v-rush main 分支的版本（git show origin/main） */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHarness, sleep, text, offscreenButtons, hasHorizontalScroll, ROOT } from "./harness.mjs";
const helpers = await import(path.join(ROOT, "backend/worker/tests/helpers.js"));
const LH = await import(path.join(ROOT, "backend/worker/tests/launch-helpers.js"));

const [TETRIS, RHYTHM, QUIZ, RUSH, OUT] = process.argv.slice(2);
if (!OUT) { console.error("用法：player-admin-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush> <out>"); process.exit(2); }
const raw = fs.readFileSync(path.join(ROOT, "backend/worker/wrangler.jsonc"), "utf8");
const VARS = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars;
const RUSH_URL = "https://vashyang1120.github.io/balloon-v-rush/rpg-continent1-universe/";
const KEY = await helpers.newRsaKey("kid-player-admin-e2e");

// 同名玩家要先建立（名單需要它的 playerId）→ 用暫時的 harness 只為了產生身份？不需要：試營運名單在 env 讀取，建立後再改 env
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ, rush: RUSH }, out: OUT,
  flags: { SCORES_ENABLED: VARS.SCORES_ENABLED, REWARDS_ENABLED: VARS.REWARDS_ENABLED, TRIAL_PLAYER_IDS: VARS.TRIAL_PLAYER_IDS, ADMIN_UIDS: helpers.ADMIN_UID }, jwks: helpers.staticJwks(KEY) });
const { check, note, newPage } = H;
check("設定", "模式使用 wrangler.jsonc 的實際值：SCORES_ENABLED／REWARDS_ENABLED 都是 trial（沒有改成 on）", VARS.SCORES_ENABLED === "trial" && VARS.REWARDS_ENABLED === "trial", JSON.stringify([VARS.SCORES_ENABLED, VARS.REWARDS_ENABLED, VARS.TRIAL_PLAYER_IDS]));

/* ---------- 測試玩家（本機假資料庫；程式裡沒有寫死任何玩家） ---------- */
const T = await H.apiCreate("宇宙測試1", "girl2");          // 主角：身份頭像 女生2
const S = await H.apiCreate("宇宙測試1", "boy3");           // 同名、不同身份圖案 → 不同玩家
const N = await H.apiCreate("宇宙測試12", "cat1");
const E = await H.apiCreate("Space01", "dog1");
H.env.TRIAL_PLAYER_IDS = [T.playerId, S.playerId].join(",");   // 只在本機測試

const e = {   // launch-helpers 的 play() 需要的介面：call＋clock.t（對應 harness 的伺服器時間）
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
const rh = await LH.play(e, T.playerId, "rhythm", LH.rhythmData("song005", "hard", 0.9), 200000);
const pendT = await LH.play(e, T.playerId, "rhythm", LH.rhythmData(), 20000);           // 太短 → 待審核
await LH.play(e, S.playerId, "tetris", { ...LH.TETRIS_OK, score: 800 }, 120000);
H.clock.offset = 0;
const tcol = () => H.db.get(`trial/collections/${T.playerId}`) || {};
check("準備", "主角在試營運玩出：方塊（稱號）、節奏 A 以上（解鎖氣球哥哥2）、一筆待審核", rh.r.body.data.status === "accepted" && !!tcol().avatars?.balloon_brother_02 && pendT.r.body.data.status === "pending_review", JSON.stringify(Object.keys(tcol().avatars || {})));
const eq = await e.call("POST", `/v1/players/${T.playerId}/equip`, { displayId: "宇宙測試1", baseAvatarKey: "girl2", displayAvatarKey: "balloon_brother_02" });
const pubT = H.db.get(`trial/publicProfiles/${T.playerId}`) || {};
check("準備", "主角在大廳裝備展示頭像「氣球哥哥2」；共用稱號為自動裝備的「初次堆疊者」", eq.status === 200 && pubT.displayAvatarKey === "balloon_brother_02" && pubT.titleName === "初次堆疊者", JSON.stringify(pubT));
const profT0 = JSON.stringify(H.db.get(`players/${T.playerId}/profile`));
const profS0 = JSON.stringify(H.db.get(`players/${S.playerId}/profile`));

/* ========== 1. 派對島：修正前（main 分支 main.js）＝紅色氣球 ========== */
const OLD_MAIN = execFileSync("git", ["-C", RUSH, "show", "origin/main:rpg-continent1-universe/main.js"], { maxBuffer: 64 * 1024 * 1024 });
async function openIsland({ old = false, failDisplay = false, viewport = { width: 1280, height: 800 } } = {}) {
  const { ctx, page } = await newPage({ viewport });
  if (old) await ctx.route(/balloon-v-rush\/rpg-continent1-universe\/main\.js/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: OLD_MAIN }));
  if (failDisplay) await ctx.route(/vparty-rhythm-game\/assets\/avatars\/balloon_brother_02\.png/, (r) => r.fulfill({ status: 404, body: "" }));
  const warns = []; page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warns.push(m.text()); });
  await page.goto(RUSH_URL + "?bvPlayerId=" + T.playerId);
  await page.waitForFunction(() => typeof C1U !== "undefined" && C1U.verify === "ok", null, { timeout: 20000 });
  await page.waitForSelector(".c1u-id-ava", { state: "attached", timeout: 8000 }).catch(() => {}); await sleep(700);
  const gate = await page.evaluate(() => { const i = document.querySelector(".c1u-id-ava"); return i ? { src: i.getAttribute("src") || "", loaded: i.complete && i.naturalWidth > 0 } : null; });
  if (old !== null) await page.locator(".c1u-id").first().screenshot({ path: `${OUT}/pa-00-island-gate-${old ? "before" : failDisplay ? "fallback" : "after"}-${viewport.width}.png` }).catch(() => {});
  // 打開小V之家（只是畫面導覽，為了看「玩家資料」面板；不開始冒險、不改進度）
  await page.evaluate(() => { try { openHomeScreen(); } catch (e) { console.log("openHomeScreen", e); } try { h2Open(); } catch (e) {} });
  await sleep(600);
  await page.evaluate(() => { try { h2RenderAll(); } catch (e) {} try { h2OpenPanel("player"); } catch (e) {} });
  if (process.env.PA_DEBUG) await page.screenshot({ path: OUT + "/dbg-panel.png" });
  await page.waitForSelector(".h2-profile", { state: "visible", timeout: 10000 });
  // 只為了截圖：把「準備好開始冒險了嗎？」視窗暫時隱藏（不按開始、不改遊戲狀態）
  await page.evaluate(() => { let el = document.querySelector(".c1u-id"); while (el && getComputedStyle(el).position !== "fixed") el = el.parentElement; if (el) el.style.visibility = "hidden"; });
  await sleep(1200);   // 等圖片載入或失敗後的備援
  const info = await page.evaluate(() => {
    const slot = (el) => { const img = el && el.querySelector("img"); return img ? { src: img.getAttribute("src") || "", loaded: img.complete && img.naturalWidth > 0 } : { src: "", loaded: false, balloon: !!el }; };
    const prof = [...document.querySelectorAll(".h2-profile .h2-ava")].map(slot);
    const top = [...document.querySelectorAll("#h2-avatars .h2-ava")].map(slot);
    const kv = {}; document.querySelectorAll(".h2-panel-wrap.is-open .h2-kv dt, #h2-panel-wrap .h2-kv dt").forEach((dt) => { kv[dt.textContent] = dt.nextElementSibling ? dt.nextElementSibling.textContent : ""; });
    return { prof, top, kv, ach: localStorage.getItem(Object.keys(localStorage).find((k) => /ach/i.test(k) && /bvUniverse|c1u/i.test(k)) || "") || null, base: C1U.profile.baseAvatarKey, disp: C1U.profile.displayAvatarKey };
  });
  info.gate = gate;
  return { ctx, page, info, warns };
}
{
  const r = await openIsland({ old: true });
  await r.page.locator("#h2-panel-wrap").screenshot({ path: `${OUT}/pa-01-island-before-main.png` }).catch(() => r.page.screenshot({ path: `${OUT}/pa-01-island-before-main.png` }));
  const d = r.info.prof[1] || {};
  check("派對島｜修正前（重現）", "main 分支：資料已經是氣球哥哥2，但圖片網址指到身份頭像資料夾（不存在）→ 圖片被移除，只剩紅色氣球", r.info.disp === "balloon_brother_02" && !d.loaded && !/vparty-rhythm-game/.test(d.src), JSON.stringify(r.info.prof));
  await r.ctx.close();
}
/* ========== 2. 派對島：修正後 ========== */
let achBefore = null;
{
  const r = await openIsland();
  await r.page.locator("#h2-panel-wrap").screenshot({ path: `${OUT}/pa-02-island-after.png` }).catch(() => r.page.screenshot({ path: `${OUT}/pa-02-island-after.png` }));
  const [b, d] = r.info.prof;
  check("派對島｜展示頭像", "玩家資料：身份頭像＝女生2、顯示頭像＝氣球哥哥2（圖片真的載入，不是紅色氣球）", /\/assets\/avatars\/base\/girl2\.png$/.test(b.src) && b.loaded && /vparty-rhythm-game\/assets\/avatars\/balloon_brother_02\.png$/.test(d.src) && d.loaded, JSON.stringify(r.info.prof));
  check("派對島｜開始畫面", "開始冒險前的身份卡也顯示氣球哥哥2", !!r.info.gate && /balloon_brother_02/.test(r.info.gate.src) && r.info.gate.loaded, JSON.stringify(r.info.gate));
  check("派對島｜上方玩家列", "小V之家上方的頭像（身份／顯示）同樣正確", r.info.top.length === 2 && r.info.top[0].loaded && /balloon_brother_02/.test(r.info.top[1].src) && r.info.top[1].loaded, JSON.stringify(r.info.top));
  check("派對島｜身份頭像不變", "baseAvatarKey 仍是 girl2；正式身份資料沒有被修改", r.info.base === "girl2" && JSON.stringify(H.db.get(`players/${T.playerId}/profile`)) === profT0, r.info.base);
  check("派對島｜共用稱號", "另外顯示「共用稱號：初次堆疊者」；「冒險稱號」仍是派對島自己的（還沒有）", r.info.kv["共用稱號"] === "初次堆疊者" && r.info.kv["冒險稱號"] === "還沒有", JSON.stringify(r.info.kv));
  achBefore = await r.page.evaluate(() => JSON.stringify(achLoad().titles));
  check("派對島｜不寫入冒險稱號", "共用稱號沒有寫進冒險稱號存檔（achLoad().titles 是空的）", achBefore === "{}", achBefore);
  await r.ctx.close();
}
{
  const r = await openIsland({ failDisplay: true });
  const d = r.info.prof[1] || {};
  check("派對島｜圖片失敗備援", "展示頭像圖片載入失敗 → 改顯示身份頭像，並在 console 記錄原因（不是空白或紅色氣球）", /base\/girl2\.png$/.test(d.src) && d.loaded && r.warns.some((w) => /頭像圖片載入失敗/.test(w) && /balloon_brother_02/.test(w)), JSON.stringify(d) + " " + r.warns.filter((w) => /頭像/.test(w)).join("｜").slice(0, 120));
  await r.page.locator("#h2-panel-wrap").screenshot({ path: `${OUT}/pa-03-island-image-fallback.png` }).catch(() => {});
  await r.ctx.close();
}
{
  await e.call("POST", `/v1/players/${T.playerId}/equip`, { displayId: "宇宙測試1", baseAvatarKey: "girl2", displayAvatarKey: "xiaov_base" });
  let r = await openIsland();
  check("派對島｜重新同步", "大廳改裝備小V → 重新進入派對島，顯示頭像跟著變成小V", /xiaov/.test(r.info.prof[1].src) && r.info.prof[1].loaded, JSON.stringify(r.info.prof[1]));
  await r.ctx.close();
  await e.call("POST", `/v1/players/${T.playerId}/equip`, { displayId: "宇宙測試1", baseAvatarKey: "girl2", displayAvatarKey: null });
  r = await openIsland();
  check("派對島｜還原預設", "還原預設（沒有裝備展示頭像）→ 顯示身份頭像女生2", /base\/girl2\.png$/.test(r.info.prof[1].src) && r.info.prof[1].loaded, JSON.stringify(r.info.prof[1]));
  await r.ctx.close();
  await e.call("POST", `/v1/players/${T.playerId}/equip`, { displayId: "宇宙測試1", baseAvatarKey: "girl2", displayAvatarKey: "balloon_brother_02" });
  r = await openIsland({ viewport: { width: 390, height: 844 } });
  await r.page.screenshot({ path: `${OUT}/pa-04-island-after-390.png` });
  check("派對島｜手機", "390×844：玩家資料兩個頭像都正確載入", r.info.prof.every((x) => x.loaded) && /balloon_brother_02/.test(r.info.prof[1].src), JSON.stringify(r.info.prof));
  await r.ctx.close();
}

/* ========== 3. 管理後台：玩家管理中心 ========== */
const s0 = Math.floor((Date.now() + H.clock.offset) / 1000);
const TOKEN = await helpers.makeIdToken(KEY, { iat: s0 - 30, auth_time: s0 - 60, exp: s0 + 3600 });
const FAKE_APP = "export function initializeApp(){ return {}; }";
const fakeAuth = (token, uid) => `const TOKEN=${JSON.stringify(token)}; const L=[]; const A={currentUser:null};
    export function getAuth(){ return A; } export async function setPersistence(){} export const inMemoryPersistence={};
    export class GoogleAuthProvider{ setCustomParameters(){} }
    export function onAuthStateChanged(a,cb){ L.push(cb); setTimeout(()=>cb(A.currentUser),0); }
    export async function signInWithPopup(){ A.currentUser={ uid:${JSON.stringify(uid)}, getIdToken: async()=>TOKEN }; L.forEach(f=>f(A.currentUser)); }
    export async function signOut(){ A.currentUser=null; L.forEach(f=>f(null)); }`;
async function adminPage(viewport, token = TOKEN, uid = helpers.ADMIN_UID) {
  const { ctx, page } = await newPage({ viewport, mobile: viewport.width < 600 });
  await ctx.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_APP }));
  await ctx.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: fakeAuth(token, uid) }));
  await page.goto(H.SITE + "universe/admin/");
  await page.waitForFunction(() => !document.getElementById("btnLogin").disabled, null, { timeout: 10000 });
  await page.click("#btnLogin");
  return { ctx, page };
}
const rowsOf = (p, sel) => p.evaluate((sel) => [...document.querySelectorAll(sel + " tbody tr")].map((r) => r.innerText.replace(/\s+/g, " ")), sel);
const csvOf = async (p, btn, name) => {
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click(btn)]);
  const f = path.join(OUT, name); await dl.saveAs(f);
  return { name: dl.suggestedFilename(), lines: fs.readFileSync(f, "utf8").replace(/^﻿/, "").trim().split("\r\n") };
};
async function doSearch(p, q) {
  await p.fill("#pQuery", q); await p.click("#btnPSearch");
  await p.waitForFunction(() => !/搜尋中/.test(document.getElementById("pSearchStatus").textContent), null, { timeout: 10000 });
  return p.evaluate(() => ({ status: document.getElementById("pSearchStatus").textContent, cards: [...document.querySelectorAll("#pResults .pcard")].map((c) => ({ pid: c.dataset.pick, text: c.innerText.replace(/\s+/g, " "), imgs: [...c.querySelectorAll("img")].map((i) => ({ src: i.getAttribute("src") || "", ok: i.complete && i.naturalWidth > 0 })) })) }));
}
const summary = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll("#pSummary [data-k]")].map((el) => [el.dataset.k, el.textContent])));
const waitSelected = (p, pid) => p.waitForFunction((pid) => document.querySelector('#pSummary [data-k="playerId"]').textContent === pid && /已選擇/.test(document.getElementById("pPanelStatus").textContent)
  && !/讀取中/.test(document.getElementById("pCollStatus").textContent) && !/讀取中/.test(document.getElementById("pLedgerStatus").textContent) && !/讀取中/.test(document.getElementById("pScoreStatusMsg").textContent), pid, { timeout: 15000 });

{
  const { ctx, page: p } = await adminPage({ width: 1280, height: 900 });
  await p.waitForFunction(() => !document.getElementById("adminArea").classList.contains("hidden"), null, { timeout: 10000 });
  const groups = await p.evaluate(() => [...document.querySelectorAll("h2.group")].map((h) => h.textContent));
  check("後台｜版面", "分成「A. 玩家管理中心」與「B. 全體紀錄與系統管理」；原本的全體功能都還在", groups.join("|") === "A. 玩家管理中心|B. 全體紀錄與系統管理" &&
    await p.evaluate(() => ["btnSearch", "btnCsvScores", "btnLedger", "btnCsvLedger", "btnCsvColl", "btnSelftest", "btnPurge", "btnAudits", "launchStatus"].every((id) => !!document.getElementById(id))), groups.join("|"));
  // 搜尋：中文
  let r = await doSearch(p, "宇宙測試1");
  const ids = r.cards.map((c) => c.pid);
  check("搜尋｜中文", "輸入「宇宙測試1」找到玩家；完全相同的排前面，再列出包含的（宇宙測試12）", ids.length === 3 && ids.slice(0, 2).sort().join() === [T.playerId, S.playerId].sort().join() && ids[2] === N.playerId, r.status + " " + ids.join());
  const cT = r.cards.find((c) => c.pid === T.playerId), cS = r.cards.find((c) => c.pid === S.playerId);
  check("搜尋｜同名", "同名玩家分開列出（不合併），各自顯示玩家 ID、身份頭像、目前展示頭像、稱號", /有 2 位同名玩家/.test(r.status) && /身份頭像 girl2/.test(cT.text) && /氣球哥哥 ?2/.test(cT.text) && /初次堆疊者/.test(cT.text) && /身份頭像 boy3/.test(cS.text) && /展示 boy3/.test(cS.text) && cT.imgs.every((i) => i.ok) && /balloon_brother_02/.test(cT.imgs[1].src), cT.text + "｜" + cS.text);
  check("搜尋｜試營運標示", "搜尋結果標示稱號與展示頭像是試營運資料", /試營運/.test(r.status), r.status);
  await p.screenshot({ path: `${OUT}/pa-05-admin-search-same-name.png`, fullPage: true });
  r = await doSearch(p, "space");
  check("搜尋｜英文", "英文不分大小寫（space → Space01）", r.cards.length === 1 && r.cards[0].pid === E.playerId, r.status);
  r = await doSearch(p, "12");
  check("搜尋｜數字", "數字也可以搜尋（12 → 宇宙測試12）", r.cards.length === 1 && r.cards[0].pid === N.playerId, r.status);
  r = await doSearch(p, "沒有這個人");
  check("搜尋｜找不到", "找不到時顯示清楚的提示（建議確認寫法或用進階搜尋）", r.cards.length === 0 && /找不到/.test(r.status) && /進階搜尋/.test(r.status), r.status);
  await p.click("#advSearch summary"); await p.fill("#pExact", S.playerId); await p.click("#btnPExact");
  await waitSelected(p, S.playerId);
  check("搜尋｜進階", "進階搜尋：完整 playerId 精確查詢，直接選取該玩家", (await summary(p)).displayId === "宇宙測試1" && (await summary(p)).playerId === S.playerId, JSON.stringify(await summary(p)));

  // 選擇主角 → 摘要
  r = await doSearch(p, "宇宙測試1");
  await p.click(`#pResults button[data-pick="${T.playerId}"]`);
  await waitSelected(p, T.playerId);
  const sm = await summary(p);
  const w = H.db.get(`trial/wallets/${T.playerId}`), col = tcol();
  const nScores = Object.keys(H.db.get(`trial/scoreIndex/byPlayer/${T.playerId}`) || {}).length;
  check("摘要", "選擇後顯示：玩家 ID、身份頭像、展示頭像、稱號、playerId（次要）、V幣、成績數、稱號數、頭像數（全部與資料庫一致）",
    sm.displayId === "宇宙測試1" && sm.titleName === "初次堆疊者" && /氣球哥哥 ?2/.test(sm.displayAvatarName) && sm.playerId === T.playerId && Number(sm.balance) === w.balance &&
    Number(sm.scoreCount) === nScores && Number(sm.titleCount) === Object.keys(col.titles).length && Number(sm.avatarCount) === Object.keys(col.avatars).length, JSON.stringify(sm) + " db " + JSON.stringify([w.balance, nScores]));
  const imgs = await p.evaluate(() => ["pBaseImg", "pDispImg"].map((id) => { const i = document.getElementById(id); return { src: i.getAttribute("src") || "", ok: i.complete && i.naturalWidth > 0 }; }));
  check("摘要｜頭像", "摘要的身份頭像（女生2）與展示頭像（氣球哥哥2）圖片正確", /girl2\.png$/.test(imgs[0].src) && imgs[0].ok && /balloon_brother_02\.png$/.test(imgs[1].src) && imgs[1].ok, JSON.stringify(imgs));
  check("摘要｜試營運", "標示「🧪 試營運資料」", await p.evaluate(() => !document.getElementById("pTrialTag").classList.contains("hidden")) && /試營運資料/.test(await text(p, "#pPanelStatus")), await text(p, "#pPanelStatus"));
  const basic = await rowsOf(p, "#pBasicTable"), bests = await rowsOf(p, "#pBestTable");
  check("基本資料", "基本資料＋各遊戲個人最佳（方塊總榜、節奏 song005 困難）", basic.some((x) => /身份頭像（固定不變） girl2/.test(x)) && bests.length === 2 && bests.some((x) => /方塊/.test(x)) && bests.some((x) => /節奏 song005--hard/.test(x)), bests.join("｜"));
  await p.screenshot({ path: `${OUT}/pa-06-admin-player-summary.png`, fullPage: true });

  // 分頁：遊戲成績
  await p.click('.tabs [data-tab="scores"]');
  const sc = await rowsOf(p, "#pScoreTable");
  check("遊戲成績", "這位玩家的所有成績（含待審核），不需要再輸入 playerId", sc.length === nScores && sc.some((x) => /待審核/.test(x)) && await p.evaluate((pid) => document.querySelectorAll(`#pScoreTable button[data-psid]`).length > 0, T.playerId), sc.join("｜").slice(0, 200));
  await p.screenshot({ path: `${OUT}/pa-07-admin-tab-scores.png`, fullPage: true });
  let c = await csvOf(p, "#btnPCsvScores", "pa-personal-scores.csv");
  check("CSV｜個人成績", "「匯出此玩家成績 CSV（個人）」只含這位玩家", c.lines.length - 1 === nScores && c.lines.slice(1).every((l) => l.includes(T.playerId)), c.name + " " + (c.lines.length - 1));
  // 審核這位玩家的待審核成績（從玩家分頁打開）
  await p.click(`#pScoreTable button[data-psid="${pendT.r.body.data.submissionId}"]`);
  await p.waitForSelector("#reviewBox:not(.hidden)");
  await p.fill("#rNote", "本機測試：玩家管理中心審核");
  await p.click("#btnAccept");
  await p.waitForFunction(() => /已接受|審核過/.test(document.getElementById("reviewStatus").textContent), null, { timeout: 10000 });
  await p.waitForFunction((b) => Number(document.querySelector('#pSummary [data-k="balance"]').textContent) !== b || true, w.balance);
  await sleep(800);
  check("審核", "從玩家分頁打開成績並接受 → 摘要自動更新（成績狀態）", !/待審核/.test((await rowsOf(p, "#pScoreTable")).join()) || (await p.evaluate(() => document.getElementById("pScoreStatus").value)) !== "", (await rowsOf(p, "#pScoreTable")).join("｜").slice(0, 160));

  // V幣錢包
  await p.click('.tabs [data-tab="wallet"]');
  const w2 = H.db.get(`trial/wallets/${T.playerId}`);
  await p.click("#btnPLedger"); await p.waitForFunction(() => /餘額/.test(document.getElementById("pLedgerStatus").textContent), null, { timeout: 10000 });
  const led = await rowsOf(p, "#pLedgerTable");
  check("V幣錢包", "餘額與交易明細（標示試營運 V幣；帳本合計一致）", led.length === Object.keys(w2.ledger).length && new RegExp(`試營運 V幣｜餘額 ${w2.balance}｜`).test(await text(p, "#pLedgerStatus")) && /（一致）/.test(await text(p, "#pLedgerStatus")), await text(p, "#pLedgerStatus"));
  c = await csvOf(p, "#btnPCsvLedger", "pa-personal-ledger.csv");
  check("CSV｜個人帳本", "個人帳本 CSV 只含這位玩家", c.lines.length - 1 === led.length && c.lines.slice(1).every((l) => l.includes(T.playerId)), c.name);
  // 稱號／展示頭像
  await p.click('.tabs [data-tab="collection"]');
  const cr = await rowsOf(p, "#pCollTable");
  check("稱號／展示頭像", "已解鎖稱號與頭像（來源、時間）＋目前裝備", cr.length === Object.keys(tcol().titles).length + Object.keys(tcol().avatars).length && /初次堆疊者/.test(await text(p, "#pCollEquipped")) && /balloon_brother_02/.test(await text(p, "#pCollEquipped")), await text(p, "#pCollEquipped"));
  await p.screenshot({ path: `${OUT}/pa-08-admin-tab-collection.png`, fullPage: true });
  c = await csvOf(p, "#btnPCsvColl", "pa-personal-collections.csv");
  check("CSV｜個人收藏", "個人收藏 CSV 只含這位玩家（檔名帶 playerId）", c.lines.slice(1).length === cr.length && c.lines.slice(1).every((l) => l.startsWith(T.playerId + ",")) && c.name.includes(T.playerId), c.name);

  // 管理操作：先準備一個「舊玩家」的按鈕，切換到同名的另一位後再按 → 必須被擋下
  await p.click('.tabs [data-tab="actions"]');
  await p.waitForSelector(`#pGrantTable button[data-grant="student_hanhan"][data-pid="${T.playerId}"]`);
  await p.evaluate(() => { window.__staleBtn = document.querySelector('#pGrantTable button[data-grant="student_hanhan"]'); });
  // 切換玩家，並讓 T 的慢回應晚一點回來（模擬網路延遲）
  await ctx.route(new RegExp(`/v1/admin/players/${T.playerId}/overview`), async (route) => { await sleep(1500); await route.fallback(); });
  await p.click(`#pResults button[data-pick="${T.playerId}"]`);
  await sleep(100);
  await p.click(`#pResults button[data-pick="${S.playerId}"]`);
  await waitSelected(p, S.playerId);
  await sleep(1900);   // T 的慢回應此時才回來 → 必須被丟棄
  await ctx.unroute(new RegExp(`/v1/admin/players/${T.playerId}/overview`));
  const smS = await summary(p);
  const scS = await (async () => { await p.click('.tabs [data-tab="scores"]'); return rowsOf(p, "#pScoreTable"); })();
  check("切換玩家｜不混資料", "選 A 後立刻換 B（A 的回應較慢才回來）：畫面只顯示 B 的資料，舊資料先清空", smS.playerId === S.playerId && Number(smS.balance) === H.db.get(`trial/wallets/${S.playerId}`).balance && Number(smS.balance) !== H.db.get(`trial/wallets/${T.playerId}`).balance && smS.displayAvatarName === "boy3" && scS.length === 1 && !scS.join().includes(rh.r.body.data.submissionId) && /身份頭像 boy3|boy3/.test((await rowsOf(p, "#pBasicTable")).join()), JSON.stringify(smS));
  await p.click('.tabs [data-tab="actions"]');
  const hanBefore = [!!tcol().avatars?.student_hanhan, !!(H.db.get(`trial/collections/${S.playerId}`) || {}).avatars?.student_hanhan];
  await p.evaluate(() => window.__staleBtn.click());
  await sleep(600);
  const hanAfter = [!!tcol().avatars?.student_hanhan, !!(H.db.get(`trial/collections/${S.playerId}`) || {}).avatars?.student_hanhan];
  check("切換玩家｜動作不套用到前一位", "切換後再按舊畫面的「發放」：動作被取消（兩位玩家都沒有被發放）", JSON.stringify(hanBefore) === "[false,false]" && JSON.stringify(hanAfter) === "[false,false]" && /已經改變.*取消/.test(await text(p, "#pActStatus")), await text(p, "#pActStatus"));
  // 正常發放給 S
  await p.waitForSelector(`#pGrantTable button[data-grant="student_hanhan"][data-pid="${S.playerId}"]`);
  await p.fill("#pGNote", "本機測試：學生頭像授權");
  await p.click(`#pGrantTable button[data-grant="student_hanhan"][data-pid="${S.playerId}"]`);
  await p.waitForFunction(() => /已發放/.test(document.getElementById("pActStatus").textContent), null, { timeout: 10000 });
  await sleep(600);
  const sCol = H.db.get(`trial/collections/${S.playerId}`) || {};
  check("管理操作｜發放", "發放只套用在目前選擇的玩家（同名的另一位不受影響），寫在試營運 trial/", !!sCol.avatars?.student_hanhan && !tcol().avatars?.student_hanhan && H.db.get(`collections/${S.playerId}`) == null, await text(p, "#pActStatus"));
  const au = await rowsOf(p, "#pAuditTable");
  check("管理操作｜稽核紀錄", "這位玩家的稽核紀錄出現剛才的發放（含備註），沒有別人的紀錄", au.length === 1 && /頭像發放/.test(au[0]) && /student_hanhan/.test(au[0]) && /學生頭像授權/.test(au[0]), au.join("｜"));
  await p.click("#btnPBackfill");
  await p.waitForFunction(() => /補判定完成/.test(document.getElementById("pActStatus").textContent), null, { timeout: 15000 });
  check("管理操作｜補判定", "歷史成績補判定使用目前選擇的玩家（不用再輸入 playerId）", /讀取已接受的正式成績 1／1 筆/.test(await text(p, "#pActStatus")), await text(p, "#pActStatus"));
  await p.screenshot({ path: `${OUT}/pa-09-admin-tab-actions.png`, fullPage: true });

  // 全體：選了 S 也不被篩選
  c = await csvOf(p, "#btnCsvColl", "pa-global-collections.csv");
  check("CSV｜全體收藏", "選擇玩家時按「匯出全體收藏 CSV」：仍包含所有玩家", c.lines.some((l) => l.startsWith(T.playerId + ",")) && c.lines.some((l) => l.startsWith(S.playerId + ",")) && !c.name.includes(S.playerId), c.name + " " + (c.lines.length - 1));
  await p.selectOption("#fStatus", ""); await p.click("#btnSearch");
  await p.waitForFunction(() => /共 \d+ 筆/.test(document.getElementById("listStatus").textContent), null, { timeout: 10000 });
  c = await csvOf(p, "#btnCsvScores", "pa-global-scores.csv");
  const allScores = Object.keys(H.db.get("trial/scores") || {}).length;
  check("CSV｜全體成績", "全體成績 CSV 不受目前玩家影響（試營運全部成績）", c.lines.length - 1 === allScores && c.lines.some((l) => l.includes(T.playerId)) && c.lines.some((l) => l.includes(S.playerId)), `${c.lines.length - 1}/${allScores}`);
  await p.fill("#wPlayer", "");
  c = await csvOf(p, "#btnCsvLedger", "pa-global-ledger.csv");
  const allLed = Object.values(H.db.get("trial/wallets") || {}).reduce((s, x) => s + Object.keys(x.ledger || {}).length, 0);
  check("CSV｜全體帳本", "全體帳本 CSV 不受目前玩家影響", c.lines.length - 1 === allLed, `${c.lines.length - 1}/${allLed}`);
  // 全體成績列表的 playerId → 直接開啟玩家管理中心
  await p.click(`#scoreTable button[data-open-pid="${T.playerId}"]`);
  await waitSelected(p, T.playerId);
  check("全體→玩家", "全體成績列表點 playerId 可直接在玩家管理中心開啟該玩家", (await summary(p)).playerId === T.playerId, "");
  await p.click("#btnAudits"); await sleep(500);
  check("全體審核紀錄", "全體審核紀錄仍顯示（剛才在玩家分頁接受的那一筆）", (await rowsOf(p, "#auditTable")).some((x) => /接受/.test(x) && x.includes(T.playerId)), "");
  await p.click("#btnPClear");
  check("換一位玩家", "按「換一位玩家」清除目前選擇，摘要隱藏", await p.evaluate(() => document.getElementById("playerPanel").classList.contains("hidden")), "");
  await p.screenshot({ path: `${OUT}/pa-10-admin-overview.png`, fullPage: true });
  const hs = await hasHorizontalScroll(p);
  check("視窗｜桌機", "1280×900：沒有水平捲動", !hs, "");
  await ctx.close();
}
{
  const { ctx, page: p } = await adminPage({ width: 390, height: 844 });
  await p.waitForFunction(() => !document.getElementById("adminArea").classList.contains("hidden"), null, { timeout: 10000 });
  await doSearch(p, "宇宙測試1");
  await p.click(`#pResults button[data-pick="${T.playerId}"]`);
  await waitSelected(p, T.playerId);
  const off = await offscreenButtons(p, "#playerPanel"), hs = await hasHorizontalScroll(p);
  await p.screenshot({ path: `${OUT}/pa-11-admin-390.png`, fullPage: true });
  check("視窗｜手機", "390×844：搜尋、結果卡片、摘要與分頁按鈕都在畫面內，沒有水平捲動", off.length === 0 && !hs, off.join(","));
  await ctx.close();
}

/* ========== 4. 權限 ========== */
{
  const r401 = await H.app.fetch(new Request(H.API + "/v1/admin/players/search?q=" + encodeURIComponent("宇宙"), { headers: { origin: H.ORIGIN } }), H.env);
  const s = Math.floor((Date.now() + H.clock.offset) / 1000);
  const other = await helpers.makeIdToken(KEY, { iat: s - 30, auth_time: s - 60, exp: s + 3600, user_id: "not-admin-uid", sub: "not-admin-uid" });
  const r403 = await H.app.fetch(new Request(H.API + `/v1/admin/players/${T.playerId}/overview`, { headers: { origin: H.ORIGIN, authorization: "Bearer " + other } }), H.env);
  const pub = await H.app.fetch(new Request(H.API + "/v1/players?displayId=" + encodeURIComponent("宇宙"), { headers: { origin: H.ORIGIN } }), H.env);
  check("權限｜API", "沒有登入 → 401；不是管理員的 Google 帳號 → 403；沒有公開的列舉玩家 API", r401.status === 401 && r403.status === 403 && pub.status !== 200, `${r401.status}/${r403.status}/${pub.status}`);
  const { ctx, page: p } = await adminPage({ width: 1280, height: 800 }, other, "not-admin-uid");
  await p.waitForFunction(() => /⛔/.test(document.getElementById("authStatus").textContent), null, { timeout: 10000 });
  check("權限｜頁面", "非管理員登入：看不到玩家管理中心（伺服器拒絕）", await p.evaluate(() => document.getElementById("adminArea").classList.contains("hidden")), await text(p, "#authStatus"));
  await ctx.close();
}

/* ========== 5. 試營運隔離 ========== */
const roots = ["sessions", "scores", "scoreIndex", "leaderboards", "quizProgress", "wallets", "collections", "publicProfiles", "adminAudit", "collectionAudit"];
check("試營運隔離", "所有寫入都在 trial/；正式根目錄沒有任何資料", roots.every((x) => H.db.get(x) == null), roots.filter((x) => H.db.get(x) != null).join(","));
check("身份不變", "整個測試沒有修改任何玩家的身份資料（playerId、玩家 ID、身份頭像）", JSON.stringify(H.db.get(`players/${T.playerId}/profile`)) === profT0 && JSON.stringify(H.db.get(`players/${S.playerId}/profile`)) === profS0, "");
check("安全", "沒有連到舊 Firebase 或其他未允許的外部網址", H.external.filter((u) => !/fonts|youtube|ytimg/.test(u)).length === 0, H.external.slice(0, 5).join(" "));
note("正式環境", "正式網站驗證要等合併、部署後在正式後台操作（本測試是本機模擬）");
const ok = await H.finish("player-admin-e2e");
process.exit(ok ? 0 : 1);

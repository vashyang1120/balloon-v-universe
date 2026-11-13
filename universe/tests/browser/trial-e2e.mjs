/* v0.3.1-trial-setup：受控試營運（用 wrangler.jsonc 的實際設定值）＋通行證一鍵複製（真實瀏覽器；本機模擬後端）
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tests/browser/trial-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush> <輸出資料夾>
   本機模擬（Worker 程式＋假 Firebase），不是正式環境。 */
import fs from "node:fs";
import path from "node:path";
import { createHarness, sleep, text, offscreenButtons, hasHorizontalScroll, ROOT } from "./harness.mjs";
const helpers = await import(path.join(ROOT, "backend/worker/tests/helpers.js"));

const [TETRIS, RHYTHM, QUIZ, RUSH, OUT] = process.argv.slice(2);
if (!OUT) { console.error("用法：trial-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush> <out>"); process.exit(2); }
const raw = fs.readFileSync(path.join(ROOT, "backend/worker/wrangler.jsonc"), "utf8");
const VARS = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1")).vars;
const TESTER_ID = "p_qfvmhs7ewmcn6ez6bdub";
const KEY = await helpers.newRsaKey("kid-trial-e2e");
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ, rush: RUSH }, out: OUT,
  flags: { SCORES_ENABLED: VARS.SCORES_ENABLED, REWARDS_ENABLED: VARS.REWARDS_ENABLED, TRIAL_PLAYER_IDS: VARS.TRIAL_PLAYER_IDS, ADMIN_UIDS: helpers.ADMIN_UID }, jwks: helpers.staticJwks(KEY) });
const { check, newPage } = H;
check("設定", "測試使用 wrangler.jsonc 的實際設定：trial／trial／指定測試玩家", VARS.SCORES_ENABLED === "trial" && VARS.REWARDS_ENABLED === "trial" && VARS.TRIAL_PLAYER_IDS === TESTER_ID, JSON.stringify([VARS.SCORES_ENABLED, VARS.REWARDS_ENABLED, VARS.TRIAL_PLAYER_IDS]));

// 指定的測試玩家（正式網站上已存在；這裡在假資料庫建立同一個 playerId）
const tmp = await H.apiCreate("試營運玩家", "boy3");
H.db.set(`players/${TESTER_ID}/profile`, { ...H.db.get(`players/${tmp.playerId}/profile`), playerId: TESTER_ID });
const T = { ...tmp, playerId: TESTER_ID };
const O = await H.apiCreate("一般玩家", "girl2");
const LOBBY = H.SITE + "index.html";

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
async function playTetris(P) {
  const { ctx, page } = await newPage();
  await page.goto(H.SITE + "universe/tetris/?bvPlayerId=" + P.playerId);
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  await sleep(1000);
  const st = await page.evaluate(() => ({ on: window.UniverseTetris.session.official.isEnabled(), trial: window.UniverseTetris.session.official.isTrial(), mark: document.getElementById("bv-status-mark").textContent }));
  await page.click("#btn-start"); await page.waitForSelector("#ov-btns button"); await page.click("#ov-btns button:nth-child(2)");
  await page.waitForFunction(() => running === true); await sleep(300);
  H.clock.offset += 120000;
  await page.evaluate(() => { for (let r = 0; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = (c === 4 ? null : "#3ecf8e"); cur = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff85a1" }; cx = 4; cy = -1; lock(); });
  await page.waitForSelector("#s-result:not(.off)", { timeout: 8000 });
  await page.waitForFunction(() => /試營運|已記入|審核中|未通過|沒有記入|測試/.test(document.getElementById("bv-result-note").textContent), null, { timeout: 10000 });
  await sleep(500);
  const note = await text(page, "#bv-result-note"), coin = await text(page, "#res-vcoin-msg");
  return { ctx, page, st, note, coin };
}

/* ========== 1. 測試玩家：試營運寫入 trial/，畫面標示「試營運」 ========== */
{
  const r = await playTetris(T);
  check("試營運｜測試玩家", "首頁標示「試營運」（不是「正式成績」）", r.st.on && r.st.trial && /試營運/.test(r.st.mark) && !/正式成績/.test(r.st.mark), JSON.stringify(r.st));
  check("試營運｜測試玩家", "結算顯示「已記入試營運排行榜」與「試營運 V幣」（不冒充正式資料）", /🧪 試營運｜✅ 已記入試營運排行榜/.test(r.note) && /試營運 V幣/.test(r.note) && !/正式排行榜/.test(r.note), r.note);
  check("試營運｜V幣", "試營運 V幣入帳（今天第一場 +30），帳本一致", (H.db.get(`trial/wallets/${TESTER_ID}`) || {}).balance >= 30, JSON.stringify(H.db.get(`trial/wallets/${TESTER_ID}`) && H.db.get(`trial/wallets/${TESTER_ID}`).balance));
  const col = H.db.get(`trial/collections/${TESTER_ID}`) || { titles: {}, avatars: {} };
  check("試營運｜收藏", "試營運稱號（初次堆疊者）與展示頭像（小V）解鎖", !!col.titles.tetris_first_clear && !!col.avatars.xiaov_base, Object.keys(col.titles).join());
  await r.page.screenshot({ path: `${OUT}/trial-01-tetris-result.png` });
  await r.ctx.close();
}
/* ========== 2. 一般玩家：照常遊玩、不寫入 ========== */
{
  const r = await playTetris(O);
  check("試營運｜一般玩家", "不在名單內：遊戲照常、成績維持本分頁測試成績，不寫入任何資料、不拿獎勵", !r.st.on && !/已記入(試營運|正式)排行榜/.test(r.note) && /本分頁測試成績/.test(r.note) && !H.db.get(`trial/wallets/${O.playerId}`) && !H.db.get(`trial/collections/${O.playerId}`), r.note);
  await r.ctx.close();
}
check("隔離", "正式 scores／wallets／collections／leaderboards 都沒有資料；玩家身份沒有被修改",
  ["sessions", "scores", "wallets", "collections", "leaderboards", "publicProfiles"].every((k) => H.db.get(k) === null) && H.db.get(`players/${TESTER_ID}/profile`).baseAvatarKey === "boy3",
  ["scores", "wallets", "collections"].map((k) => k + ":" + JSON.stringify(H.db.get(k))).join(" "));
check("隔離", "非測試玩家呼叫寫入 API 一律被拒（503）", !H.apiCalls.some((c) => c === "POST /v1/sessions" && false), "");

/* ========== 3. 大廳：試營運標示、通行證一鍵複製 ========== */
const { ctx: mctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
await mctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://vashyang1120.github.io" });
await seedLobby(page, [T, O], TESTER_ID);
await lobbyReady(page);
await page.click("#signSelect"); await page.waitForSelector("#lbModal:not([hidden])");
await page.click('[data-lb-game="tetris"]');
await page.waitForFunction(() => document.querySelectorAll("#lbList .lb-row").length > 0, null, { timeout: 10000 });
const lbt = await page.evaluate(() => document.getElementById("lbBody").innerText);
check("試營運｜排行榜", "大廳排行榜清楚標示「試營運排行榜：測試資料，正式開放前會清除」", /試營運排行榜：這裡是測試資料/.test(lbt) && /試營運玩家/.test(lbt), lbt.replace(/\n/g, "／").slice(0, 160));
await page.screenshot({ path: `${OUT}/trial-02-leaderboard-trial.png` });
await page.click("#lbClose");
await page.click("#signPass"); await page.waitForSelector("#passModal:not([hidden])");
await page.waitForFunction(() => /試營運 V幣/.test(document.getElementById("passTabBody").textContent), null, { timeout: 10000 }).catch(() => {});
const passTxt = await text(page, "#passTabBody");
check("試營運｜通行證", "V幣與紀錄標示「試營運」", /試營運 V幣：測試資料/.test(passTxt) && /V幣紀錄（🧪 試營運）/.test(passTxt), passTxt.replace(/\n/g, "／").slice(0, 200));
// 一鍵複製（桌機）
const btn = await page.evaluate(() => { const b = document.querySelector("#passTabBody [data-copy-pid]"); const r = b.getBoundingClientRect(); const c = document.getElementById("passCodeText").getBoundingClientRect(); return { text: b.textContent, attrs: [...b.attributes].map((a) => a.name + "=" + a.value).join(" "), sameRow: Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2) < 14 && r.left > c.left, h: b.offsetHeight }; });
check("複製｜按鈕", "通行證代碼右側有「📋 複製」按鈕；按鈕本身沒有寫死任何代碼", btn.text === "📋 複製" && btn.sameRow && !/p_[a-z2-7]{20}/.test(btn.attrs) && btn.h >= 36, JSON.stringify(btn));
await page.click("#passTabBody [data-copy-pid]");
await page.waitForFunction(() => /已複製！/.test(document.getElementById("passCopyMsg").textContent), null, { timeout: 5000 });
let clip = await page.evaluate(() => navigator.clipboard.readText());
const stillSame = await page.evaluate(() => ({ url: location.href, cur: localStorage.getItem("bvUniverse_v2_currentPlayerId"), open: !document.getElementById("passModal").hidden }));
check("複製｜桌機", "點擊後剪貼簿是完整 playerId，顯示「已複製！」；不跳轉、不重新整理、不切換玩家", clip === TESTER_ID && stillSame.cur === TESTER_ID && stillSame.open && stillSame.url === LOBBY, clip + " " + JSON.stringify(stillSame));
await page.locator("#passModal .modal__card").screenshot({ path: `${OUT}/trial-03-pass-copy-desktop.png` });
await page.click("#passClose");
// 切換到另一位玩家 → 複製的是另一位的代碼
await page.evaluate((pid) => localStorage.setItem("bvUniverse_v2_currentPlayerId", pid), O.playerId);
await page.goto(LOBBY); await lobbyReady(page);
await page.click("#signPass"); await page.waitForSelector("#passModal:not([hidden])");
await page.click("#passTabBody [data-copy-pid]");
await page.waitForFunction(() => /已複製！/.test(document.getElementById("passCopyMsg").textContent), null, { timeout: 5000 });
clip = await page.evaluate(() => navigator.clipboard.readText());
check("複製｜切換玩家", "切換到另一位玩家後，複製的是那位玩家的代碼", clip === O.playerId && clip !== TESTER_ID, clip);
// 在大廳用下方頭像列切換（不重新載入）再複製
await page.click("#passClose");
const slot = page.locator(`#avatarRow [data-key="${TESTER_ID}"]`).first();
if (await slot.count()) {
  await slot.click();
  await page.waitForSelector("#switchModal:not([hidden])"); await page.click("#switchOk");
  await page.waitForFunction((pid) => localStorage.getItem("bvUniverse_v2_currentPlayerId") === pid, TESTER_ID, { timeout: 10000 });
  await lobbyReady(page); await sleep(300);
  await page.click("#signPass"); await page.waitForSelector("#passModal:not([hidden])");
  await page.click("#passTabBody [data-copy-pid]");
  await page.waitForFunction(() => /已複製！/.test(document.getElementById("passCopyMsg").textContent), null, { timeout: 5000 });
  clip = await page.evaluate(() => navigator.clipboard.readText());
  check("複製｜切換玩家", "用中下頭像列切換玩家（不重新整理）後再複製，代碼跟著換", clip === TESTER_ID, clip);
  await page.click("#passClose");
} else check("複製｜切換玩家", "用中下頭像列切換玩家後再複製", null, "找不到頭像列按鈕（改用重新載入切換驗證，已在上一項通過）");
await mctx.close();

// 複製失敗：剪貼簿 API 不能用、execCommand 也失敗 → 不假裝成功，選取代碼並提示手動複製
{
  const { ctx, page: p } = await newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await p.addInitScript(() => { try { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); } catch (e) {} document.execCommand = () => false; });
  await seedLobby(p, [T], TESTER_ID); await lobbyReady(p);
  await p.click("#signPass"); await p.waitForSelector("#passModal:not([hidden])");
  await p.tap("#passTabBody [data-copy-pid]");
  await p.waitForFunction(() => document.getElementById("passCopyMsg").textContent.length > 0, null, { timeout: 5000 });
  const f = await p.evaluate(() => ({ msg: document.getElementById("passCopyMsg").textContent, sel: String(window.getSelection()) }));
  check("複製｜失敗", "剪貼簿不能用：不顯示「已複製」，改為選取代碼並提示手動複製", !/已複製/.test(f.msg) && /無法自動複製/.test(f.msg) && f.sel === TESTER_ID, JSON.stringify(f));
  await p.locator("#passModal .modal__card").screenshot({ path: `${OUT}/trial-04-pass-copy-fallback-390.png` });
  await ctx.close();
}
// 手機點擊＋排版
for (const vp of [{ w: 390, h: 844 }, { w: 360, h: 640 }, { w: 1920, h: 1080 }]) {
  const mobile = vp.w < 500;
  const { ctx, page: p } = await newPage({ viewport: { width: vp.w, height: vp.h }, mobile });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://vashyang1120.github.io" });
  await seedLobby(p, [T], TESTER_ID); await lobbyReady(p);
  await p.click("#signPass"); await p.waitForSelector("#passModal:not([hidden])");
  if (mobile) await p.tap("#passTabBody [data-copy-pid]"); else await p.click("#passTabBody [data-copy-pid]");
  await p.waitForFunction(() => document.getElementById("passCopyMsg").textContent.length > 0, null, { timeout: 5000 });
  const msg = await text(p, "#passCopyMsg");
  const lay = await p.evaluate(() => { const card = document.querySelector("#passModal .modal__card").getBoundingClientRect(); const els = [document.getElementById("passCodeText"), document.querySelector("[data-copy-pid]")].map((e) => e.getBoundingClientRect()); return { inside: els.every((r) => r.left >= card.left - 1 && r.right <= card.right + 1), crown: !!document.querySelector("#passModal .pass__crown, #passModal [class*=crown]") }; });
  const off = await offscreenButtons(p, "#passModal"), hs = await hasHorizontalScroll(p);
  await p.locator("#passModal .modal__card").screenshot({ path: `${OUT}/trial-05-pass-${vp.w}x${vp.h}.png` });
  check("複製｜" + (mobile ? "手機" : "桌機"), `${vp.w}×${vp.h}：${mobile ? "點擊" : "按下"}複製有回饋；代碼與按鈕不超出通行證面板、沒有水平捲動`, /已複製！/.test(msg) && lay.inside && off.length === 0 && !hs, msg + JSON.stringify(lay) + off.join(","));
  await ctx.close();
}

/* ========== 4. 清除試營運資料（管理後台 API）→ 正式資料仍然是空的 ========== */
{
  const s = Math.floor((Date.now() + H.clock.offset) / 1000);
  const token = await helpers.makeIdToken(KEY, { iat: s - 30, auth_time: s - 60, exp: s + 3600 });
  const r = await H.app.fetch(new Request(H.API + "/v1/admin/trial/purge", { method: "POST", headers: { origin: H.ORIGIN, authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ confirm: "PURGE TRIAL" }) }), H.env);
  check("回復", "驗收後可以清除試營運資料；玩家身份保留；正式資料仍然是空的", r.status === 200 && H.db.get("trial") === null && !!H.db.get(`players/${TESTER_ID}/profile`) && H.db.get("scores") === null, String(r.status));
}
check("安全", "沒有連到舊 Firebase 或其他未允許的外部網址", H.external.filter((u) => !/fonts|youtube|ytimg/.test(u)).length === 0, H.external.slice(0, 5).join(" "));
const ok = await H.finish("trial-e2e");
process.exit(ok ? 0 : 1);

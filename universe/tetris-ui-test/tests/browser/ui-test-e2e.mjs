/* 方塊派對 UI 測試版（tetris-universe-ui-v0.1.0-test-2）瀏覽器測試
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tetris-ui-test/tests/browser/ui-test-e2e.mjs <vparty-tetris clone> <vparty-rhythm-game clone> [截圖資料夾]

   環境：Playwright + Chromium「模擬」手機（視窗大小、觸控、devicePixelRatio）。這不是手機實機測試。
   網址與正式網站相同網域（https://vashyang1120.github.io/balloon-v-universe/…，由本機檔案提供），
   遊戲宇宙 API 用本 Repository 的 Worker 程式＋假資料庫，而且「正式成績／V幣」刻意設為開啟（on），
   用來證明：就算後端開著、網址沒有 sandbox=1、帶著真正存在的玩家代碼，測試版也一個請求都不會送。 */
import fs from "node:fs";
import path from "node:path";
import { createHarness, sleep } from "../../../tests/browser/harness.mjs";

const [, , TETRIS, RHYTHM, OUT = "/tmp/tetris-ui-test-e2e"] = process.argv;
if (!TETRIS || !RHYTHM) { console.error("用法：node ui-test-e2e.mjs <vparty-tetris clone> <vparty-rhythm-game clone> [截圖資料夾]"); process.exit(2); }
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: TETRIS }, out: OUT, flags: { SCORES_ENABLED: "on", REWARDS_ENABLED: "on" } });
const { check, note } = H;
const TEST_URL = H.SITE + "universe/tetris-ui-test/";
const PROD_URL = H.SITE + "universe/tetris/";
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });

/* 所有非 GET 請求、所有送往 API 的請求（不論是否被 Sandbox 擋下）都記錄 */
function watchRequests(page) {
  const log = [];
  page.on("request", (r) => { const u = r.url(); if (r.method() !== "GET" && r.method() !== "HEAD" || u.startsWith(H.API) || /firebase/i.test(u)) log.push(r.method() + " " + u); });
  return log;
}
async function startGame(page, how = "click") {
  // 正式版：開始 → 難度視窗 → 普通；v0.2.0 測試版：首頁已預選「普通」，開始後直接開局
  if (how === "tap") await page.tap("#btn-start"); else await page.click("#btn-start");
  await page.waitForFunction(() => running === true || !!document.querySelector("#g-overlay:not(.off) #ov-btns button"));
  if (!(await page.evaluate(() => running === true))) {
    if (how === "tap") await page.tap("#ov-btns button:nth-child(2)"); else await page.click("#ov-btns button:nth-child(2)");
  }
  await page.waitForFunction(() => running === true && !document.getElementById("s-game").classList.contains("off"));
  await sleep(400);
}
async function freezeGravity(page) {   // 只在測試裡：把自動下落計時歸零，避免方塊在測試期間自己落下干擾判斷（不改遊戲程式）
  await page.evaluate(() => { window.__bvFreeze = setInterval(() => { dropAcc = 0; }, 4); });
}
async function unfreezeGravity(page) { await page.evaluate(() => clearInterval(window.__bvFreeze)); }

/* ---------- CDP 觸控：真正的多點觸控事件（Chrome 會轉成 pointer 事件） ---------- */
async function touchApi(page) {
  const cdp = await page.context().newCDPSession(page);
  const pts = new Map();
  async function center(sel) { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
  async function send(type) {
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [...pts.values()] });
  }
  return {
    async down(id, sel) { const c = await center(sel); pts.set(id, { x: c.x, y: c.y, id, radiusX: 8, radiusY: 8, force: 1 }); await send("touchStart"); },
    // CDP：列表中消失的觸控點＝放開；還有其他手指時用 touchMove 送出剩下的點，全部放開才送 touchEnd
    async up(id) { const p = pts.get(id); pts.delete(id); await cdp.send("Input.dispatchTouchEvent", pts.size ? { type: "touchMove", touchPoints: [...pts.values()] } : { type: "touchEnd", touchPoints: [] }); return p; },
    async cancel() { pts.clear(); await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] }); },
    async tap(sel) { await this.down(99, sel); await sleep(40); await this.up(99); }
  };
}

/* ---------- 版面量測 ---------- */
async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const vis = (el) => el && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().width > 0;
    const inView = (b) => b && b.x >= -0.5 && b.y >= -0.5 && b.r <= vw + 0.5 && b.b <= vh + 0.5;
    const canvas = document.getElementById("board-canvas");
    const cb = r(canvas);
    const hudIds = ["g-avatar", "g-name", "hud-score", "hud-combo", "hud-lines", "hud-level", "next-canvas", "pause-btn", "mc-play", "btn-quit"];
    const fs = vis(document.getElementById("uit-fs")) ? document.getElementById("uit-fs") : document.getElementById("fs-btn");
    const hud = hudIds.map((id) => [id, document.getElementById(id)]).concat([["fullscreen", fs]]).map(([id, el]) => ({ id, visible: vis(el), box: r(el), inView: inView(r(el)) }));
    const labels = [...document.querySelectorAll("#s-game .hud-label")].filter(vis).map((el) => ({ text: el.textContent.trim(), clipped: el.scrollWidth > el.clientWidth + 1 }));
    const vals = [...document.querySelectorAll("#s-game .hud-val")].filter(vis).map((el) => ({ fs: parseFloat(getComputedStyle(el).fontSize) }));
    const btns = [...document.querySelectorAll("#uit-ctrl .uit-btn")].filter(vis).map((el) => ({ act: el.dataset.act, box: r(el) }));
    let overlap = false;
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i].box, b = btns[j].box;
      if (a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b) overlap = true;
    }
    return {
      vw, vh, CELL, cls: document.documentElement.className,
      canvasPx: { w: canvas.width, h: canvas.height }, canvasCss: cb, wrap: r(document.getElementById("board-wrap")),
      square: canvas.width / 10 === canvas.height / 20 && Math.abs(cb.w / 10 - cb.h / 20) < 0.01 && Math.abs(cb.w - canvas.width) < 0.5,
      boardInView: inView(r(document.getElementById("board-wrap"))) && r(document.getElementById("board-wrap")).h + 0.5 >= cb.h,   // 外框在畫面內，而且沒有把棋盤裁掉
      hScroll: document.documentElement.scrollWidth > vw || document.body.scrollWidth > vw,
      hud, labels, minValFont: Math.min(...vals.map((v) => v.fs)), minLabelFont: Math.min(...[...document.querySelectorAll("#s-game .hud-label")].filter(vis).map((el) => parseFloat(getComputedStyle(el).fontSize))),
      btns, overlap, ctrlShown: vis(document.getElementById("uit-ctrl")),
      stacked: !!document.querySelector("#uit-ctrl.is-stacked"),
      mobCtrlShown: vis(document.getElementById("mob-ctrl"))
    };
  });
}

const VIEWS = [
  { name: "360x800", w: 360, h: 800, mobile: true },
  { name: "390x844", w: 390, h: 844, mobile: true },
  { name: "412x915", w: 412, h: 915, mobile: true },
  { name: "extra-320x640", w: 320, h: 640, mobile: true },   // 額外：極窄手機（右側按鍵改上下兩層）
  { name: "landscape-844x390", w: 844, h: 390, mobile: true },
  { name: "landscape-915x412", w: 915, h: 412, mobile: true },
  { name: "desktop-1366x768", w: 1366, h: 768, mobile: false }
];

/* =====================================================================
   1. Sandbox 隔離（後端正式成績＝開啟；真正存在的玩家；網址沒有 sandbox=1）
   ===================================================================== */
const realPlayer = await H.apiCreate("真的玩家", "girl1");
H.apiCalls.length = 0;

// 對照組：正式宇宙版確實會連到 API（證明偵測方式有效）
{
  const { page, ctx } = await H.newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await page.goto(PROD_URL + "?bvPlayerId=" + realPlayer.playerId);
  await sleep(1500);
  const n = H.apiCalls.length;
  check("隔離", "對照組：正式宇宙版（universe/tetris）同一位玩家會呼叫 API（偵測方式有效）", n > 0, H.apiCalls.slice(0, 4).join(" | "));
  await ctx.close();
  H.apiCalls.length = 0;
}

for (const [label, search, seedProd] of [
  ["沒有任何網址參數", "", false],
  ["只有正式玩家代碼（沒有 sandbox=1）", "?bvPlayerId=" + realPlayer.playerId, false],
  ["sandbox=0＋正式玩家代碼", "?sandbox=0&bvPlayerId=" + realPlayer.playerId, false],
  ["正式大廳目前玩家＋正式版待補送成績已存在本機", "", true]
]) {
  const { page, ctx } = await H.newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  const reqs = watchRequests(page);
  if (seedProd) {
    await page.addInitScript((pid) => {
      try {
        localStorage.setItem("bvUniverse_v2_currentPlayerId", pid);
        localStorage.setItem("bvUniverse_v3_outbox_tetris", JSON.stringify([{ schemaVersion: 1, submissionId: "11111111-1111-4111-8111-111111111111", sessionId: "s", playerId: pid, gameId: "tetris", gameVersion: "x", mode: "production", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), scoreData: { score: 99999, level: 9, lines: 90, difficulty: "hard", peakCombo: 9 } }]));
      } catch (e) {}
    }, realPlayer.playerId);
  }
  await page.goto(TEST_URL + search);
  await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady());
  const info = await page.evaluate(() => ({ mode: UniverseTetris.session.mode, pid: UniverseTetris.getPlayer().playerId, name: document.getElementById("top-name").textContent, mark: (document.getElementById("bv-status-mark") || {}).textContent, badge: (document.getElementById("uit-badge-page") || {}).textContent }));
  // 玩一場到結束：開局、操作、結算、看排行榜
  await startGame(page, "tap");
  await page.evaluate(() => { for (let i = 0; i < 60 && running; i++) hardDrop(); });
  await page.waitForFunction(() => !document.getElementById("s-result").classList.contains("off"), null, { timeout: 8000 }).catch(() => {});
  await sleep(800);
  const result = await page.evaluate(() => ({ onResult: !document.getElementById("s-result").classList.contains("off"), note: (document.getElementById("bv-result-note") || {}).textContent, vcoin: (document.getElementById("res-vcoin-msg") || {}).textContent }));
  await page.click("#btn-res-lb").catch(() => {});
  await sleep(600);
  const lbNote = await page.evaluate(() => (document.getElementById("bv-lb-note") || {}).textContent);
  const outboxLeft = await page.evaluate(() => localStorage.getItem("bvUniverse_v3_outbox_tetris"));
  check("隔離", `${label}：Session 固定 sandbox`, info.mode === "sandbox", info.mode);
  check("隔離", `${label}：只使用 Sandbox 測試玩家（不讀正式玩家）`, info.pid === "p_uitestsandboxplayera" && info.name === "UI測試員", info.pid + " " + info.name);
  check("隔離", `${label}：畫面有 Sandbox 標示`, /Sandbox/.test(info.mark || "") && /Sandbox/.test(info.badge || ""), info.mark + " / " + info.badge);
  check("隔離", `${label}：完整一局後到結算畫面，成績只存本分頁`, result.onResult && /尚未記入正式排行榜/.test(result.note || ""), JSON.stringify(result));
  check("隔離", `${label}：排行榜是本分頁測試排行榜`, /測試排行榜/.test(lbNote || ""), lbNote);
  check("隔離", `${label}：沒有任何請求送到遊戲宇宙 API／Firebase，也沒有任何寫入請求`, H.apiCalls.length === 0 && reqs.length === 0, H.apiCalls.concat(reqs).join(" | "));
  if (seedProd) check("隔離", `${label}：正式版待補送的成績沒有被送出（原樣留在本機）`, outboxLeft && JSON.parse(outboxLeft).length === 1, outboxLeft);
  check("隔離", `${label}：沒有 JavaScript 錯誤`, page.errors.length === 0, page.errors.join(" | "));
  if (label === "只有正式玩家代碼（沒有 sandbox=1）") await shot(page, "sandbox-leaderboard-390x844");
  await ctx.close();
  H.apiCalls.length = 0;
}

// 頁面裡直接嘗試連正式 API（模擬程式錯誤或被注入）：全部被擋，沒有送出
{
  const { page, ctx } = await H.newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await page.goto(TEST_URL + "?bvPlayerId=" + realPlayer.playerId);
  await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady());
  const r = await page.evaluate(async (API) => {
    const out = [];
    const tryIt = async (name, fn) => { try { await fn(); out.push(name + ":sent"); } catch (e) { out.push(name + ":blocked"); } };
    await tryIt("fetch POST /v1/scores", () => fetch(API + "/v1/scores", { method: "POST", body: "{}" }));
    await tryIt("fetch POST /v1/sessions", () => fetch(API + "/v1/sessions", { method: "POST", body: "{}" }));
    await tryIt("fetch GET /v1/wallet", () => fetch(API + "/v1/wallet/p_x"));
    await tryIt("XHR POST", () => new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open("POST", API + "/v1/scores"); try { x.send("{}"); ok(); } catch (e) { no(e); } }));
    out.push("beacon:" + (navigator.sendBeacon(API + "/v1/scores", "{}") ? "sent" : "blocked"));
    await tryIt("SDK getWallet", () => UniverseTetris.session.official.getWallet());
    await tryIt("SDK equip", () => UniverseTetris.session.official.equip({ titleKey: "x" }));
    await tryIt("SDK getBoard", () => UniverseTetris.session.official.getBoard("total"));
    return { out, blocked: BVUiTestSandbox.blocked.length };
  }, H.API);
  await sleep(300);
  check("隔離", "頁面內直接呼叫正式 API（fetch／XHR／sendBeacon／SDK）全部被封鎖", r.out.every((x) => /blocked$/.test(x)) && H.apiCalls.length === 0, r.out.join(", ") + " api=" + H.apiCalls.join("|"));
  await ctx.close();
  H.apiCalls.length = 0;
}

// 失效保護：sandbox-guard.js 載入失敗 → 換殼層停止，不會退回正式模式
{
  const { page, ctx } = await H.newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await page.route("**/universe/tetris-ui-test/sandbox-guard.js", (r) => r.abort());
  await page.goto(TEST_URL + "?bvPlayerId=" + realPlayer.playerId);
  await sleep(1500);
  const st = await page.evaluate(() => ({ shell: typeof window.UniverseTetris }));
  check("隔離", "失效保護：sandbox-guard.js 載入失敗時換殼層停止啟動，且沒有呼叫 API", st.shell === "undefined" && H.apiCalls.length === 0 && page.errors.some((e) => /sandbox-guard/.test(e)), JSON.stringify(st) + " " + page.errors.join("|") + " api=" + H.apiCalls.join("|"));
  await ctx.close();
  H.apiCalls.length = 0;
}

/* =====================================================================
   2. 各尺寸版面（含修改前後對照：同尺寸的正式宇宙版）
   ===================================================================== */
const compare = [];
for (const v of VIEWS) {
  for (const which of ["before", "after"]) {
    const { page, ctx } = await H.newPage({ viewport: { width: v.w, height: v.h }, mobile: v.mobile });
    await page.goto((which === "after" ? TEST_URL : PROD_URL + "?sandbox=1") + "");
    if (which === "before") {   // 正式宇宙版沙盒需要沙盒玩家：用相同的示範玩家
      await page.evaluate(() => { sessionStorage.setItem("bvUniverseSandbox_v2_api", JSON.stringify({ players: { p_uitestsandboxplayera: { playerId: "p_uitestsandboxplayera", displayId: "UI測試員", baseAvatarKey: "boy1" } } })); });
      await page.goto(PROD_URL + "?sandbox=1&bvPlayerId=p_uitestsandboxplayera");
    }
    await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady(), null, { timeout: 8000 }).catch(() => {});
    await sleep(500);
    if (which === "after") await shot(page, `title-${v.name}`);
    await startGame(page, v.mobile ? "tap" : "click");
    await page.evaluate(() => { for (let i = 0; i < 4; i++) hardDrop(); });   // 讓棋盤底部有方塊，截圖才看得出覆蓋效果
    await sleep(300);
    const m = await measure(page);
    await shot(page, `${which}-${v.name}`);
    compare.push({ view: v.name, which, touch: which === "before" ? m.mobCtrlShown : m.ctrlShown, boardFull: m.boardInView, CELL: m.CELL, board: m.wrap ? `${Math.round(m.wrap.w)}×${Math.round(m.wrap.h)}` : "", boardPct: m.wrap ? Math.round(m.wrap.w * m.wrap.h / (v.w * v.h) * 100) : 0 });
    if (which === "after") {
      const g = v.name;
      check("版面", `${g}：棋盤格子是正方形、顯示尺寸＝實際像素（不拉伸）`, m.square, JSON.stringify({ px: m.canvasPx, css: m.canvasCss }));
      check("版面", `${g}：棋盤完整顯示在畫面內`, m.boardInView, JSON.stringify(m.wrap));
      check("版面", `${g}：沒有水平捲動`, !m.hScroll);
      const hudBad = m.hud.filter((h) => !h.visible || !h.inView).map((h) => h.id);
      check("版面", `${g}：HUD（頭像、名稱、分數、連消、消除行、關卡、NEXT、暫停、音樂、全螢幕、離開）全部可見且沒被裁切`, hudBad.length === 0, hudBad.join(","));
      const clipped = m.labels.filter((l) => l.clipped).map((l) => l.text);
      check("版面", `${g}：HUD 標題文字沒有被截斷`, clipped.length === 0, clipped.join(","));
      if (v.mobile) {
        check("版面", `${g}：HUD 字級可閱讀（標題 ≥ 11px、數值 ≥ 17px）`, m.minLabelFont >= 11 && m.minValFont >= 17, `label ${m.minLabelFont} val ${m.minValFont}`);
        const sizes = m.btns.map((b) => Math.round(b.box.w));
        check("版面", `${g}：五顆觸控按鍵都顯示、互不重疊、直徑 ≥ 52px、都在畫面內`, m.ctrlShown && m.btns.length === 5 && !m.overlap && Math.min(...sizes) >= 52 && m.btns.every((b) => b.box.x >= 0 && b.box.r <= v.w && b.box.b <= v.h), `sizes=${sizes.join(",")} stacked=${m.stacked} overlap=${m.overlap}`);
        // test-2：右側由左至右 加速下降 → 直接落下 → 旋轉；兩層時旋轉在上層、位於直接落下正上方；左側 ← → 不變
        const B = Object.fromEntries(m.btns.map((x) => [x.act, x.box]));
        const cxOf = (k) => B[k].x + B[k].w / 2, cyOf = (k) => B[k].y + B[k].h / 2;
        const leftOk = cxOf("left") < cxOf("right") && Math.abs(cyOf("left") - cyOf("right")) < 1 && cxOf("right") < cxOf("down");
        const rightOk = m.stacked
          ? cxOf("down") < cxOf("drop") && Math.abs(cyOf("down") - cyOf("drop")) < 1 && cyOf("rotate") < cyOf("drop") - B.drop.h * 0.9 && Math.abs(cxOf("rotate") - cxOf("drop")) < 1
          : cxOf("down") < cxOf("drop") && cxOf("drop") < cxOf("rotate") && Math.abs(cyOf("down") - cyOf("rotate")) < 1 && Math.abs(cyOf("drop") - cyOf("rotate")) < 1;
        check("版面", `${g}：右側按鍵順序 ↓ → 落 → ↻（${m.stacked ? "兩層：↓ 落 在下、↻ 在落的正上方" : "單列"}）；左側 ← → 不變`, leftOk && rightOk,
          ["left", "right", "down", "drop", "rotate"].map((k) => `${k}(${Math.round(cxOf(k))},${Math.round(cyOf(k))})`).join(" "));
        const bottomOverlap = m.btns.every((b) => b.box.b > m.wrap.y + m.wrap.h * 0.6);
        check("版面", `${g}：按鍵位於畫面下方（${v.w > v.h ? "棋盤兩側下角" : "覆蓋在棋盤底部"}）`, bottomOverlap, JSON.stringify(m.btns.map((b) => Math.round(b.box.y))));
        check("版面", `${g}：原版下方按鍵列已隱藏（不再佔用高度）`, !m.mobCtrlShown);
      } else {
        check("版面", `${g}：桌機版不顯示觸控按鍵`, !m.ctrlShown && m.btns.length === 0);
      }
    }
    await ctx.close();
  }
}
const cmp = {};
for (const c of compare) { cmp[c.view] = cmp[c.view] || {}; cmp[c.view][c.which] = c; }
for (const [view, c] of Object.entries(cmp)) {
  if (view.startsWith("desktop")) check("版面", `${view}：桌機版棋盤與正式版相同（格子 ${c.before.CELL}px → ${c.after.CELL}px）`, c.before.CELL === c.after.CELL && c.before.board === c.after.board, JSON.stringify(c));
  else if (view.startsWith("landscape")) check("版面", `${view}：橫式棋盤完整顯示且不小於正式版（格子 ${c.before.CELL}px → ${c.after.CELL}px；顯示面積 ${c.before.boardPct}% → ${c.after.boardPct}%；橫式高度是限制）`, c.after.CELL >= c.before.CELL && c.after.boardPct >= c.before.boardPct, JSON.stringify(c));
  else check("版面", `${view}：棋盤比正式版大（格子 ${c.before.CELL}px → ${c.after.CELL}px，佔畫面 ${c.before.boardPct}% → ${c.after.boardPct}%）`, c.after.CELL > c.before.CELL, JSON.stringify(c));
}
fs.writeFileSync(path.join(OUT, "before-after.json"), JSON.stringify(cmp, null, 1));

/* =====================================================================
   3. 觸控操作（390×844 模擬手機；CDP 多點觸控）
   ===================================================================== */
{
  const { page, ctx } = await H.newPage({ viewport: { width: 390, height: 844 }, mobile: true });
  await page.addInitScript(H.SEED_FN + "; __bvSeed(20261116);");
  await page.goto(TEST_URL);
  await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady());
  await startGame(page, "tap");
  await freezeGravity(page);
  const T = await touchApi(page);
  const st = () => page.evaluate(() => ({ cx, cy, cells: JSON.stringify(cur.cells), key: cur.key, held: Object.keys(BVUiTest.held), stats: { ...BVUiTest.stats }, scrollY: window.scrollY, scale: window.visualViewport ? window.visualViewport.scale : 1, filled: board.flat().filter(Boolean).length }));
  const reset = async () => { await page.evaluate(() => { cx = 3; cy = 2; }); await sleep(30); };   // 只在測試：把目前方塊放回中間

  await reset(); let a = await st();
  await T.tap(".uit-btn-left"); await sleep(80); let b = await st();
  check("操作", "向左：點一下移動 1 格", b.cx === a.cx - 1, `${a.cx}→${b.cx}`);
  await reset(); a = await st();
  await T.tap(".uit-btn-right"); await sleep(80); b = await st();
  check("操作", "向右：點一下移動 1 格", b.cx === a.cx + 1, `${a.cx}→${b.cx}`);

  await reset(); a = await st();
  await T.down(1, ".uit-btn-left"); await sleep(120); const early = await st(); await sleep(400); const mid = await st();
  await T.up(1); await sleep(20); const rel = await st(); await page.evaluate(() => { cx = 1; }); await sleep(250); const after = await st();
  check("操作", "向左長按：先移 1 格，停頓後連續移動到牆邊", early.cx === a.cx - 1 && mid.cx === 0, `${a.cx}→${early.cx}→${mid.cx}`);
  check("操作", "放開按鍵立即停止（放開後不再移動）", rel.held.length === 0 && after.cx === 1, `held=${rel.held} cx=${after.cx}`);
  await reset(); a = await st();
  await T.down(1, ".uit-btn-right"); await sleep(500); b = await st(); await T.up(1);
  check("操作", "向右長按：連續移動", b.cx >= a.cx + 3, `${a.cx}→${b.cx}`);

  await reset();
  await page.evaluate(() => { if (cur.key === "O") { cur = nxt; } });
  a = await st();
  await T.tap(".uit-btn-rotate"); await sleep(80); b = await st();
  check("操作", "旋轉：點一下旋轉 1 次（不連發）", b.cells !== a.cells && b.stats.repeats === a.stats.repeats, `${a.key} ${a.cells} → ${b.cells}`);

  await reset(); a = await st();
  await T.down(1, ".uit-btn-down"); await sleep(450); b = await st(); await T.up(1);
  check("操作", "加速下降長按：連續下降", b.cy >= a.cy + 4, `cy ${a.cy}→${b.cy}`);

  await reset(); a = await st();
  await T.tap(".uit-btn-drop"); await sleep(120); b = await st();
  check("操作", "直接落下：方塊立即落到底並鎖定（產生新方塊）", b.filled > a.filled && b.cy <= 1, `filled ${a.filled}→${b.filled} cy=${b.cy}`);

  // 多點觸控：按住向左的同時點旋轉
  await reset(); await page.evaluate(() => { if (cur.key === "O") cur = nxt; cx = 6; }); a = await st();
  await T.down(1, ".uit-btn-left"); await sleep(60);
  await T.down(2, ".uit-btn-rotate"); await sleep(60); await T.up(2); await sleep(320);
  b = await st(); await T.up(1); await sleep(40); const c = await st();
  check("操作", "多點觸控：按住向左時點旋轉，兩個動作都生效", b.cells !== a.cells && b.cx < a.cx - 1 && c.held.length === 0, `cx ${a.cx}→${b.cx} rotated=${b.cells !== a.cells} held=${c.held}`);

  // pointercancel：觸控被系統取消（例如來電、手勢）
  await reset(); a = await st();
  await T.down(1, ".uit-btn-right"); await sleep(60); await T.cancel(); await sleep(20);
  b = await st(); await page.evaluate(() => { cx = 3; }); await sleep(300); const c2 = await st();
  check("操作", "pointercancel：清除按住狀態，不會繼續移動", b.held.length === 0 && b.stats.cancels > a.stats.cancels && c2.cx === 3, `held=${b.held} cancels ${a.stats.cancels}→${b.stats.cancels} cx=${c2.cx}`);

  // 視窗失焦
  await reset();
  await T.down(1, ".uit-btn-left"); await sleep(60);
  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await sleep(20);
  b = await st(); await page.evaluate(() => { cx = 3; }); await sleep(300); const c3 = await st();
  await T.cancel();
  check("操作", "視窗失焦：自動放開所有按鍵，不會卡鍵", b.held.length === 0 && c3.cx === 3, `held=${b.held} cx=${c3.cx}`);

  // 按鍵不造成捲動或縮放
  const ta = await page.evaluate(() => [...document.querySelectorAll(".uit-btn")].map((b) => getComputedStyle(b).touchAction).concat(getComputedStyle(document.getElementById("s-game")).touchAction));
  for (let i = 0; i < 6; i++) { await T.tap(".uit-btn-rotate"); await sleep(30); }   // 連點（雙擊縮放測試）
  b = await st();
  check("操作", "按鍵不造成網頁捲動或縮放（touch-action:none、連點後畫面未縮放）", ta.every((x) => x === "none") && b.scrollY === 0 && b.scale === 1, `${ta.join(",")} scrollY=${b.scrollY} scale=${b.scale}`);

  // 暫停與恢復
  await page.tap("#pause-btn"); await sleep(200);
  const p1 = await page.evaluate(() => ({ paused, ctrl: getComputedStyle(document.getElementById("uit-ctrl")).display, ov: !document.getElementById("g-overlay").classList.contains("off") }));
  a = await st(); await T.tap("#pause-btn").catch(() => {});
  await page.tap("#ov-btns button:nth-child(1)"); await sleep(250);
  const p2 = await page.evaluate(() => ({ paused, ctrl: getComputedStyle(document.getElementById("uit-ctrl")).display }));
  check("操作", "暫停：遊戲停止、出現暫停視窗、觸控按鍵隱藏", p1.paused === true && p1.ov && p1.ctrl === "none", JSON.stringify(p1));
  check("操作", "恢復：遊戲繼續、觸控按鍵重新出現", p2.paused === false && p2.ctrl !== "none", JSON.stringify(p2));
  // 暫停中按鍵不動作（與原版鍵盤相同）
  await page.evaluate(() => togglePause()); await reset(); a = await st();
  await page.evaluate(() => { document.querySelector(".uit-btn-left").dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, bubbles: true })); document.querySelector(".uit-btn-left").dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, bubbles: true })); });
  b = await st();
  check("操作", "暫停中觸控按鍵不會移動方塊（與原版鍵盤規則相同）", b.cx === a.cx, `${a.cx}→${b.cx}`);
  await page.evaluate(() => togglePause()); await page.evaluate(() => { document.getElementById("g-overlay").classList.add("off"); });

  // 音樂開關
  const m0 = await page.evaluate(() => ({ playing: mPlaying, txt: document.getElementById("mc-play").textContent }));
  await page.tap("#mc-play"); await sleep(500);
  const m1 = await page.evaluate(() => ({ playing: mPlaying, txt: document.getElementById("mc-play").textContent }));
  await page.tap("#mc-play"); await sleep(500);
  const m2 = await page.evaluate(() => ({ playing: mPlaying, txt: document.getElementById("mc-play").textContent }));
  const songs = await page.evaluate(() => SONGS.length);
  check("操作", "音樂開關：HUD 音樂按鈕可以切換播放／暫停", songs > 0 && m0.playing !== m1.playing && m1.playing !== m2.playing, `songs=${songs} ${JSON.stringify([m0, m1, m2])}`);

  // 全螢幕
  await page.tap("#uit-fs"); await sleep(400);
  const f1 = await page.evaluate(() => ({ fs: !!document.fullscreenElement, txt: document.getElementById("uit-fs").textContent }));
  await page.tap("#uit-fs"); await sleep(400);
  const f2 = await page.evaluate(() => ({ fs: !!document.fullscreenElement, txt: document.getElementById("uit-fs").textContent }));
  check("操作", "全螢幕：HUD 全螢幕按鈕可以進入與退出", f1.fs && f1.txt === "✕" && !f2.fs && f2.txt === "⛶", JSON.stringify([f1, f2]));

  // NEXT
  const nx = await page.evaluate(() => { const c = document.getElementById("next-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; const b = c.getBoundingClientRect(); return { n, w: b.width, key: nxt.key }; });
  check("操作", "NEXT：下一個方塊有畫出來、尺寸可辨識", nx.n > 50 && nx.w >= 30, JSON.stringify(nx));
  await shot(page, "controls-390x844");

  // 網址列收合（視窗高度改變）：重新計算，不錯位
  await page.setViewportSize({ width: 390, height: 760 }); await sleep(300);
  const v1 = await measure(page);
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  const v2 = await measure(page);
  const btnBottom = (m) => Math.max(...m.btns.map((b) => b.box.b));
  check("版面", "網址列展開／收合（高度 760 ↔ 844）：棋盤重新計算、仍完整顯示、按鍵貼齊底部", v1.boardInView && v2.boardInView && v1.square && v2.square && v2.CELL >= v1.CELL && Math.abs(btnBottom(v1) - (760 - 10)) < 2 && Math.abs(btnBottom(v2) - (844 - 10)) < 2, `CELL ${v1.CELL}→${v2.CELL} btnBottom ${btnBottom(v1)}/${btnBottom(v2)}`);
  // 轉向
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(300);
  const v3 = await measure(page);
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  const v4 = await measure(page);
  check("版面", "遊戲中轉成橫式再轉回直式：版面正確切換", v3.cls.includes("uit-land") && v3.boardInView && !v4.cls.includes("uit-land") && v4.boardInView && v4.CELL === v2.CELL, `${v3.CELL}/${v4.CELL}`);

  // 離開與返回
  await unfreezeGravity(page);
  await page.tap("#btn-quit"); await sleep(400);
  const q1 = await page.evaluate(() => ({ title: !document.getElementById("s-title").classList.contains("off"), ctrl: getComputedStyle(document.getElementById("uit-ctrl")).display, running }));
  await startGame(page, "tap");
  const q2 = await measure(page);
  check("操作", "離開：回到首頁、觸控按鍵隱藏", q1.title && q1.ctrl === "none" && q1.running === false, JSON.stringify(q1));
  check("操作", "返回：再開一局，棋盤與按鍵正常", q2.ctrlShown && q2.square && q2.CELL === v2.CELL, `CELL=${q2.CELL}`);
  const lobby = await page.evaluate(() => UniverseTetris.session.lobbyUrl());
  check("操作", "首頁「回遊戲宇宙」連到沙盒大廳（?sandbox=1），不是正式大廳", lobby === "../../index.html?sandbox=1", lobby);
  check("操作", "觸控測試期間沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* =====================================================================
   4. 完整一局（觸控，自然下落；直到遊戲結束）
   ===================================================================== */
{
  const { page, ctx } = await H.newPage({ viewport: { width: 360, height: 800 }, mobile: true });
  const reqs = watchRequests(page);
  await page.addInitScript(H.SEED_FN + "; __bvSeed(7);");
  await page.goto(TEST_URL);
  await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady());
  await startGame(page, "tap");
  const T = await touchApi(page);
  const seq = [".uit-btn-left", ".uit-btn-right", ".uit-btn-rotate", ".uit-btn-drop"];
  let i = 0;
  while (i < 200 && await page.evaluate(() => running)) {
    const sel = seq[i % 4 === 3 ? 3 : Math.floor(Math.random() * 3)];
    await T.tap(sel); await sleep(25); i++;
  }
  await page.waitForFunction(() => !document.getElementById("s-result").classList.contains("off"), null, { timeout: 8000 }).catch(() => {});
  await sleep(600);
  const r = await page.evaluate(() => ({ onResult: !document.getElementById("s-result").classList.contains("off"), score: document.getElementById("res-score").textContent, note: (document.getElementById("bv-result-note") || {}).textContent }));
  await shot(page, "result-360x800");
  check("完整一局", "只用觸控按鍵玩到遊戲結束，出現結算畫面（原版結算畫面未改）", r.onResult && Number(String(r.score).replace(/,/g, "")) > 0, JSON.stringify(r) + " taps=" + i);
  check("完整一局", "整局沒有呼叫 API、沒有寫入請求", H.apiCalls.length === 0 && reqs.length === 0, H.apiCalls.concat(reqs).join(" | "));
  check("完整一局", "沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* =====================================================================
   5. 桌機鍵盤（1366×768）
   ===================================================================== */
{
  const { page, ctx } = await H.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(TEST_URL);
  await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady());
  await startGame(page, "click");
  await freezeGravity(page);
  await page.evaluate(() => { cx = 3; cy = 2; if (cur.key === "O") cur = nxt; });
  const s0 = await page.evaluate(() => ({ cx, cells: JSON.stringify(cur.cells) }));
  await page.keyboard.press("ArrowLeft"); const s1 = await page.evaluate(() => cx);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); const s2 = await page.evaluate(() => cx);
  await page.keyboard.press("ArrowUp"); const s3 = await page.evaluate(() => JSON.stringify(cur.cells));
  const cy0 = await page.evaluate(() => cy); await page.keyboard.press("ArrowDown"); const cy1 = await page.evaluate(() => cy);
  const f0 = await page.evaluate(() => board.flat().filter(Boolean).length); await page.keyboard.press(" "); const f1 = await page.evaluate(() => board.flat().filter(Boolean).length);
  await page.keyboard.press("Escape"); const p1 = await page.evaluate(() => paused); await page.keyboard.press("Escape"); const p2 = await page.evaluate(() => paused);
  check("桌機", "鍵盤：← → 移動、↑ 旋轉、↓ 加速、空白 落下、Esc 暫停／恢復", s1 === s0.cx - 1 && s2 === s0.cx + 1 && s3 !== s0.cells && cy1 === cy0 + 1 && f1 > f0 && p1 === true && p2 === false,
    JSON.stringify({ s0, s1, s2, rot: s3 !== s0.cells, cy0, cy1, f0, f1, p1, p2 }));
  const m = await measure(page);
  check("桌機", "桌機版維持原版左右資訊欄、不顯示觸控按鍵與手機 HUD", !m.cls.includes("uit-m") && !m.ctrlShown && m.hud.every((h) => h.visible), m.cls);
  check("桌機", "沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

note("實機", "手機實機測試（iOS Safari、Android Chrome）", "本測試是 Chromium 模擬手機，不是實機；請使用者用手機實際試玩");
note("實機", "iPhone 瀏海／底部橫條安全區域的實際位置", "頁面 viewport 沒有 viewport-fit=cover，安全區域由瀏覽器自動留白；需實機確認");
console.log("\n修改前後（格子 px／棋盤顯示大小／棋盤佔畫面比例／棋盤完整顯示／觸控按鍵）：");
for (const [view, c] of Object.entries(cmp)) console.log(`  ${view.padEnd(20)} ${c.before.CELL}px ${c.before.board} (${c.before.boardPct}%) 完整=${c.before.boardFull} 觸控=${c.before.touch}  →  ${c.after.CELL}px ${c.after.board} (${c.after.boardPct}%) 完整=${c.after.boardFull} 觸控=${c.after.touch}`);
const ok = await H.finish("tetris-ui-test");
process.exit(ok ? 0 : 1);

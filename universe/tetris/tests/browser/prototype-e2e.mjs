/* 方塊派對換殼原型：真實瀏覽器測試（Playwright + Chromium）
   用法（repository 根目錄）：
     node universe/tetris/tests/browser/prototype-e2e.mjs <vparty-tetris 唯讀 clone> <vparty-rhythm-game 唯讀 clone> <截圖輸出資料夾>
   - 玩家 API：使用本 Repository 的 Worker 程式（backend/worker）＋ 假資料庫（不連正式 Firebase）
   - 遊戲素材：由兩個唯讀 clone 提供（代替 vashyang1120.github.io）
   - 其他所有外部連線（舊 Firebase、gstatic…）一律攔截並記錄 → 測試要求為 0 */
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const [TETRIS_REPO, RHYTHM_REPO, OUT] = process.argv.slice(2);
if (!TETRIS_REPO || !RHYTHM_REPO || !OUT) { console.error("用法：prototype-e2e.mjs <tetris clone> <rhythm clone> <out>"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const PORT = 8300 + Math.floor(Math.random() * 50), ORIGIN = `http://127.0.0.1:${PORT}`;
const API = "https://balloon-v-universe-api.vashyang1120.workers.dev";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".srt": "text/plain" };
function sendFile(r, f) {
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "access-control-allow-origin": "*" });
  fs.createReadStream(f).pipe(r);
}
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  if (p.startsWith("/orig/")) return sendFile(r, path.join(TETRIS_REPO, p.slice(6) || "index.html"));
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  sendFile(r, f);
});
await new Promise((ok) => srv.listen(PORT, "127.0.0.1", ok));

/* 玩家 API：真實 Worker 程式 + 假資料庫 */
const W = path.join(ROOT, "backend/worker");
const { createApp } = await import(path.join(W, "src/app.js"));
const { createFakeRtdb } = await import(path.join(W, "tests/fake-rtdb.js"));
const { fakeServiceAccount, baseEnv } = await import(path.join(W, "tests/helpers.js"));
const db = createFakeRtdb();
const app = createApp({ fetch: db.fetch, logSink: { log() {}, warn() {}, error() {} } });
const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: (await fakeServiceAccount()).json, ALLOWED_ORIGINS: ORIGIN, SERVICE_ENV: "development" });
async function apiCreate(displayId, base) {
  const r = await app.fetch(new Request(API + "/v1/players", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({ displayId, baseAvatarKey: base, createRequestId: crypto.randomUUID() }) }), env);
  return (await r.json()).data.player;
}
const A = await apiCreate("測試甲", "avatar_rabbit_hoodie");
const B = await apiCreate("測試乙", "boy1");
const dbAfterSeed = JSON.stringify(db.root);

const results = [];
const check = (group, name, ok, info = "") => results.push({ group, name, result: ok ? "PASS" : "FAIL", info: String(info).slice(0, 160) });
const external = [], apiCalls = [], originalExternal = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: opts.mobile ? 2 : 1 });
  await ctx.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith(ORIGIN)) return route.continue();
    if (u.startsWith(API)) {
      const rq = route.request();
      apiCalls.push(rq.method() + " " + u.slice(API.length));
      if (opts.apiDown) return route.abort("connectionrefused");
      const res = await app.fetch(new Request(u, { method: rq.method(), headers: { ...(await rq.allHeaders()), origin: ORIGIN, "cf-connecting-ip": "203.0.113.8" }, body: ["GET", "HEAD"].includes(rq.method()) ? undefined : rq.postData() }), env);
      const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
      return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) });
    }
    const m = u.match(/^https:\/\/vashyang1120\.github\.io\/(vparty-tetris|vparty-rhythm-game)\/(.*?)(\?.*)?$/);
    if (m) {
      const f = path.join(m[1] === "vparty-tetris" ? TETRIS_REPO : RHYTHM_REPO, decodeURIComponent(m[2]));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, path: f, headers: { "access-control-allow-origin": "*" } });
      return route.fulfill({ status: 404, body: "" });
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort();   // 字型：原版就有，測試環境不連外
    if (!opts.isOriginal) external.push(u);   // 原版（等價比較用）本來就會載入 Firebase SDK，不計入原型
    else originalExternal.push(u);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("dialog", (d) => d.dismiss());
  return { ctx, page };
}
const proto = (q) => `${ORIGIN}/universe/tetris/index.html${q || ""}`;
const lsKeys = (page) => page.evaluate(() => Object.keys(localStorage));
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => "");

/* ========== 1. 正式模式：身份、頭像、未開放功能 ========== */
{
  const { ctx, page } = await newPage();
  await page.goto(proto("?bvPlayerId=" + A.playerId));
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  await sleep(600);
  const st = await page.evaluate(() => ({
    name: document.getElementById("top-name").textContent, key: document.getElementById("top-player-key").textContent,
    wallet: document.getElementById("top-vcoin-balance").textContent, title: document.getElementById("top-player-title").textContent,
    avSrc: document.getElementById("top-avatar").getAttribute("src"), avW: document.getElementById("top-avatar").naturalWidth,
    pid: PLAYER.playerId, pkey: PLAYER.playerKey, banner: document.getElementById("bv-status-mark") && document.getElementById("bv-status-mark").textContent,
    marks: document.querySelectorAll(".bv-status-mark").length, oldBanner: !!document.getElementById("bv-test-banner")
  }));
  check("身份", "顯示正確玩家 ID（伺服器 displayId）", st.name === "測試甲", st.name);
  check("身份", "playerId 正確（來自網址 bvPlayerId，經 API 確認）", st.pid === A.playerId, st.pid);
  check("身份", "舊 playerKey 保持空白（不由 ID＋圖案組合）", st.pkey === "", JSON.stringify(st.pkey));
  check("身份", "身份頭像來自遊戲宇宙 assets/avatars/base/，圖片載入成功", st.avSrc === "../../assets/avatars/base/avatar_rabbit_hoodie.png" && st.avW > 0, st.avSrc + " w=" + st.avW);
  check("身份", "身份名稱使用共用頭像名稱（兔兔帽T）", /兔兔帽T/.test(st.key), st.key);
  check("未開放", "V幣顯示「未開放」（不是 0）", /未開放/.test(st.wallet), st.wallet);
  check("收藏", "v0.3.1：稱號顯示遊戲宇宙共用收藏的裝備狀態（沒有＝「未裝備」）", /未裝備/.test(st.title), st.title);
  check("標示", "v0.2.0：首頁只有一個簡潔測試標示（不再有常駐大型橫幅）", /測試版/.test(st.banner) && st.marks === 1 && !st.oldBanner, st.banner);
  await page.screenshot({ path: `${OUT}/01-title-desktop.png` });

  // 角色設定（唯讀）
  await page.click("#top-player-card");
  await page.waitForSelector("#s-profile:not(.off)");
  const pf = await page.evaluate(() => ({
    ro: document.getElementById("player-id-input").readOnly, val: document.getElementById("player-id-input").value,
    code: document.getElementById("profile-player-key").textContent,
    hidden: ["btn-change-base-avatar", "btn-change-display-avatar", "btn-profile-ok"].every((id) => getComputedStyle(document.getElementById(id)).display === "none"),
    wallet: document.getElementById("profile-vcoin-balance").textContent
  }));
  check("角色設定", "玩家 ID 唯讀、顯示 playerId、隱藏變更身份按鈕", pf.ro && pf.val === "測試甲" && pf.code === A.playerId && pf.hidden, JSON.stringify(pf));
  await page.click("#btn-vcoin-history"); await sleep(300);
  check("未開放", "V幣錢包面板顯示「尚未開放」", /尚未開放/.test(await text(page, "#vcoin-history-list")), await text(page, "#vcoin-history-list"));
  await page.screenshot({ path: `${OUT}/02-profile-readonly.png` });
  await page.click("#btn-unlock-collection");
  await page.waitForFunction(() => { const b = document.getElementById("bv-collection"); return b && !b.hidden && /要更換稱號或展示頭像/.test(b.textContent); }, null, { timeout: 8000, polling: 100 }).catch(() => {});
  check("收藏", "v0.3.1：開啟遊戲宇宙共用收藏視窗（只讀；更換在大廳通行證）", await page.evaluate(() => { const b = document.getElementById("bv-collection"); return !!b && !b.hidden && /我的收藏/.test(b.textContent) && /大廳「我的通行證 → 收藏」/.test(b.textContent); }));
  await page.click("#bv-collection [data-bv-close]");
  await page.click("#btn-title-collection");
  await page.waitForFunction(() => { const b = document.getElementById("bv-collection"); return b && !b.hidden && /要更換稱號或展示頭像/.test(b.textContent); }, null, { timeout: 8000, polling: 100 }).catch(() => {});
  check("收藏", "v0.3.1：開啟遊戲宇宙共用收藏視窗（只讀；更換在大廳通行證）", await page.evaluate(() => { const b = document.getElementById("bv-collection"); return !!b && !b.hidden && /我的收藏/.test(b.textContent) && /大廳「我的通行證 → 收藏」/.test(b.textContent); }));
  await page.click("#bv-collection [data-bv-close]");
  await page.click("#btn-profile-back");

  // 管理後台入口（點標題 5 下）已停用
  for (let i = 0; i < 6; i++) await page.click("#logo-title");
  await sleep(300);
  check("安全", "舊管理後台入口已停用（點標題 5 下不會進入）", await page.evaluate(() => document.getElementById("s-admin").classList.contains("off")));

  /* ---------- 遊玩：鍵盤操作 ---------- */
  await page.click("#btn-start");
  await page.waitForSelector("#ov-btns button");
  await page.click("#ov-btns button:nth-child(2)");   // 普通
  await page.waitForFunction(() => typeof running !== "undefined" && running === true, null, { timeout: 5000 });
  const s0 = await page.evaluate(() => ({ cx, cells: JSON.stringify(cur.cells) }));
  await page.keyboard.press("ArrowLeft"); await sleep(50);
  const s1 = await page.evaluate(() => ({ cx }));
  check("遊玩", "遊戲可以開始（選難度 → 進入遊戲）", true);
  check("遊玩", "← 鍵：方塊向左移動", s1.cx === s0.cx - 1, `${s0.cx} → ${s1.cx}`);
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await sleep(50);
  check("遊玩", "→ 鍵：方塊向右移動", (await page.evaluate(() => cx)) === s0.cx + 1);
  await page.evaluate(() => { cur = { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: "#c77dff" }; cy = 2; });   // T 方塊，確保旋轉後形狀不同
  const rBefore = await page.evaluate(() => JSON.stringify(cur.cells));
  await page.keyboard.press("ArrowUp"); await sleep(50);
  check("遊玩", "↑ 鍵：方塊旋轉", (await page.evaluate(() => JSON.stringify(cur.cells))) !== rBefore);
  const filledBefore = await page.evaluate(() => board.flat().filter(Boolean).length);
  await page.keyboard.press(" "); await sleep(100);
  check("遊玩", "空白鍵：方塊直接落下並固定", (await page.evaluate(() => board.flat().filter(Boolean).length)) === filledBefore + 4);

  // 消除、計分、等級：準備一列只差 4 格，放入 I 方塊
  await page.evaluate(() => {
    board = newBoard();   // 先清空盤面（前面的測試已放了方塊）
    for (let c = 0; c < 10; c++) board[19][c] = c >= 3 && c <= 6 ? null : "#ff85a1";
    lines = 9;   // 再消 1 行就達到普通難度的下一級
    cur = { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: "#4fc3f7" }; cx = 3; cy = 0;
  });
  const before = await page.evaluate(() => ({ score, lines, level }));
  await page.evaluate(() => hardDrop()); await sleep(100);
  const after = await page.evaluate(() => ({ score, lines, level, lperlv: DIFF[diff].lperlv }));
  check("遊玩", "消除：滿一列被消除、行數 +1", after.lines === before.lines + 1, JSON.stringify(after));
  check("遊玩", "計分：消除後分數增加", after.score > before.score, `${before.score} → ${after.score}`);
  check("遊玩", "等級：行數達門檻時升級（原版公式 floor(lines/lperlv)+1）", after.level === Math.floor(after.lines / after.lperlv) + 1, JSON.stringify(after));
  await page.screenshot({ path: `${OUT}/03-game-desktop.png` });

  // 音效
  const audioOk = await page.evaluate(() => { try { const c = getACtx(); return !!c && typeof c.createOscillator === "function"; } catch (e) { return false; } });
  check("音效", "音效引擎（WebAudio）可用", audioOk);

  // 遊戲結束 → 結算：只進 Mock
  await page.evaluate(() => { for (let r = 0; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = (c === 4 ? null : "#3ecf8e"); cur = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff85a1" }; cx = 4; cy = -1; lock(); });
  await page.waitForSelector("#s-result:not(.off)", { timeout: 5000 });
  await sleep(800);
  const res = await page.evaluate(() => ({ note: document.getElementById("bv-result-note").textContent, vcoin: document.getElementById("res-vcoin-msg").textContent, score: document.getElementById("res-score").textContent, best: document.getElementById("best-disp").textContent }));
  check("結算", "遊戲結束後顯示結算畫面", !!res.score, res.score);
  check("結算", "結算說明：「本場成績尚未記入正式排行榜」", /本場成績尚未記入正式排行榜/.test(res.note), res.note);
  check("結算", "V幣：測試版不發放", /不發放/.test(res.vcoin), res.vcoin);
  check("今日挑戰", "v0.2.0：今日挑戰保留原版完成判定，結算顯示完成狀態（+10 V幣待開放，不發放）", /今日挑戰「[^」]+」(已完成（\+10 V幣待開放）|尚未完成)/.test(res.vcoin), res.vcoin);
  const mock = await page.evaluate((pid) => window.UniverseTetris.session.services.scores.listMine(pid, "tetris"), A.playerId);
  check("結算", "Mock 成績 1 筆、playerId 正確、標示未經伺服器確認", mock.length === 1 && mock[0].playerId === A.playerId && mock[0].serverConfirmed === false && mock[0].recordStatus === "mock", JSON.stringify(mock.map((m) => [m.playerId, m.scoreData.score, m.recordStatus])));
  check("結算", "ScoreSubmission 含共用外層欄位與方塊專屬欄位", mock[0] && ["submissionId", "gameVersion", "startedAt", "finishedAt"].every((k) => mock[0][k]) && ["score", "level", "lines", "difficulty", "peakCombo"].every((k) => k in mock[0].scoreData), JSON.stringify(mock[0] && mock[0].scoreData));
  await page.screenshot({ path: `${OUT}/04-result-mock.png` });
  await page.click("#btn-res-lb"); await sleep(500);
  const lb = await page.evaluate(() => ({ note: document.getElementById("bv-lb-note").textContent, rows: [...document.querySelectorAll("#lb-list .lb-row")].map((r) => r.innerText.replace(/\n/g, " ")) }));
  check("排行榜", "排行榜明確標示「測試排行榜，不是正式排行榜」，只有本分頁成績", /不是正式排行榜/.test(lb.note) && lb.rows.length === 1 && /測試/.test(lb.rows[0]) && /測試甲/.test(lb.rows[0]), JSON.stringify(lb));
  await page.screenshot({ path: `${OUT}/05-leaderboard-mock.png` });

  // 重新整理（不帶參數）：同一分頁仍是同一位玩家
  await page.goto(proto(""));
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  check("身份", "重新整理（沒有網址參數）仍識別同一位玩家", (await page.evaluate(() => PLAYER.playerId)) === A.playerId);
  const bestA = await page.evaluate(() => document.getElementById("best-disp").textContent);

  // 換玩家 B（同一分頁）：A 的資料不殘留
  await page.goto(proto("?bvPlayerId=" + B.playerId));
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  await sleep(300);
  const sb = await page.evaluate(() => ({ name: document.getElementById("top-name").textContent, best: document.getElementById("best-disp").textContent, pid: PLAYER.playerId, av: document.getElementById("top-avatar").getAttribute("src") }));
  check("切換", "換玩家後顯示 B（ID、頭像、playerId）", sb.name === "測試乙" && sb.pid === B.playerId && /boy1\.png$/.test(sb.av), JSON.stringify(sb));
  check("切換", "A 的最佳分數不會出現在 B（各自分開）", bestA !== "—" && sb.best === "—", `A=${bestA} B=${sb.best}`);

  // localStorage：不寫入任何舊遊戲鍵
  const keys = await lsKeys(page);
  check("資料", "localStorage 沒有任何舊遊戲鍵（vtetris_*、vPartyPlayerProfile…）", keys.every((k) => k.startsWith("bvUniverseGame_v1_")), keys.join(","));
  check("資料", "本機最佳分數依 playerId 分開存放", keys.some((k) => k === `bvUniverseGame_v1_production_tetris__${A.playerId}__localBest`), keys.join(","));
  check("穩定", "整個流程沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* ========== 2. 手機：觸控按鈕、全螢幕、BGM ========== */
{
  const { ctx, page } = await newPage({ mobile: true, viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.__fs = 0;
    Element.prototype.requestFullscreen = function () { window.__fs++; return Promise.resolve(); };
  });
  await page.goto(proto("?bvPlayerId=" + A.playerId));
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  await sleep(500);
  await page.screenshot({ path: `${OUT}/06-title-mobile.png` });
  await page.tap("#btn-start");
  await page.waitForSelector("#ov-btns button");
  await page.tap("#ov-btns button:nth-child(2)");
  await page.waitForFunction(() => running === true);
  await sleep(300);
  check("手機", "遊戲中顯示手機操作按鈕", await page.evaluate(() => getComputedStyle(document.getElementById("mob-ctrl")).display !== "none"));
  const m0 = await page.evaluate(() => cx);
  await page.tap("#mob-left"); await sleep(80);
  check("手機", "觸控「←」按鈕可移動方塊", (await page.evaluate(() => cx)) === m0 - 1);
  await page.evaluate(() => { cur = { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: "#c77dff" }; cy = 2; });
  const mr = await page.evaluate(() => JSON.stringify(cur.cells));
  await page.tap("#mob-rotl"); await sleep(80);
  check("手機", "觸控「旋轉」按鈕可旋轉", (await page.evaluate(() => JSON.stringify(cur.cells))) !== mr);
  const mf = await page.evaluate(() => board.flat().filter(Boolean).length);
  await page.tap("#mob-drop"); await sleep(80);
  check("手機", "觸控「落下」按鈕可直接落下", (await page.evaluate(() => board.flat().filter(Boolean).length)) === mf + 4);
  await page.screenshot({ path: `${OUT}/07-game-mobile.png` });
  await page.tap("#fs-btn"); await sleep(200);
  check("全螢幕", "全螢幕按鈕會呼叫瀏覽器全螢幕", (await page.evaluate(() => window.__fs)) >= 1);
  // BGM：音樂播放器載入節奏遊戲的歌曲
  await page.evaluate(() => { if (running) togglePause(); });
  await page.evaluate(() => togglePlay());
  await page.waitForFunction(() => mPlaying === true, null, { timeout: 8000 }).catch(() => {});
  const bgm = await page.evaluate(() => ({ playing: mPlaying, src: mAudio.src, songs: SONGS.length }));
  check("音樂", "BGM：讀取歌曲清單並開始播放", bgm.playing && bgm.songs >= 4 && /vparty-rhythm-game\/songs\/song\d+\/audio\.mp3$/.test(bgm.src), JSON.stringify(bgm));
  check("穩定", "手機流程沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* ========== 3. 身份錯誤情境 ========== */
for (const [label, q, expect] of [
  ["不存在的 playerId", "?bvPlayerId=p_zzzzzzzzzzzzzzzzzzzz", /找不到這位玩家/],
  ["舊版 playerKey", "?bvPlayerId=" + encodeURIComponent("測試甲__avatar_rabbit_hoodie"), /舊版遊戲的玩家代碼/],
  ["沒有玩家", "", /請從遊戲宇宙大廳進入/]
]) {
  const { ctx, page } = await newPage();
  const before = apiCalls.length;
  await page.goto(proto(q));
  await page.waitForSelector("#bv-identity-card.is-error", { timeout: 15000 });
  const msg = await text(page, "#bv-identity-card");
  check("身份錯誤", `${label}：顯示合理錯誤訊息`, expect.test(msg), msg);
  await page.click("#btn-start"); await sleep(300);
  check("身份錯誤", `${label}：不能開始以未知身份計分的遊戲`, await page.evaluate(() => document.getElementById("s-game").classList.contains("off")));
  if (label === "舊版 playerKey") check("身份錯誤", "舊 playerKey 不會被送到 API 當成 playerId", apiCalls.length === before, apiCalls.slice(before).join(","));
  if (label === "不存在的 playerId") await page.screenshot({ path: `${OUT}/08-identity-error.png` });
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ apiDown: true });
  await page.goto(proto("?bvPlayerId=" + A.playerId));
  await page.waitForSelector("#bv-identity-card.is-error", { timeout: 20000 });
  const msg = await text(page, "#bv-identity-card");
  check("身份錯誤", "API 故障：顯示網路錯誤並提供重試，不退回舊 Firebase", /網路/.test(msg) && (await page.locator("#bv-retry").count()) === 1, msg);
  await ctx.close();
}
{
  const { ctx, page } = await newPage();
  await page.goto(proto("?bvPlayerId=" + A.playerId + "&admin=1&isAdmin=true"));
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  const p = await page.evaluate(() => window.UniverseTetris.getPlayer());
  check("安全", "網址參數不能取得管理員或 V幣消費權限", p.isAdmin === false && p.canSpendVCoins === false);
  await ctx.close();
}

/* ========== 4. Sandbox：完全不連 API ========== */
{
  const { ctx, page } = await newPage();
  const before = apiCalls.length;
  await page.goto(ORIGIN + "/universe/tetris/index.html?sandbox=1");   // 先開頁建立 sessionStorage
  await page.evaluate(() => sessionStorage.setItem("bvUniverseSandbox_v2_api", JSON.stringify({ identities: {}, players: { p_sandboxsandboxsandbo: { playerId: "p_sandboxsandboxsandbo", displayId: "沙盒小V", baseAvatarKey: "avatar_penguin_hoodie", createdAt: Date.now() } } })));
  await page.goto(proto("?sandbox=1&bvPlayerId=p_sandboxsandboxsandbo"));
  await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  const sb = await page.evaluate(() => ({ name: document.getElementById("top-name").textContent, banner: document.getElementById("bv-status-mark").textContent, mode: window.UniverseTetris.session.mode }));
  check("Sandbox", "Sandbox 讀取大廳沙盒玩家、標示 Sandbox", sb.name === "沙盒小V" && /Sandbox/.test(sb.banner) && sb.mode === "sandbox", JSON.stringify(sb));
  check("Sandbox", "Sandbox 沒有任何 API 連線", apiCalls.length === before, apiCalls.slice(before).join(","));
  await page.screenshot({ path: `${OUT}/09-sandbox.png` });
  await ctx.close();
}

/* ========== 5. 玩法等價：同一組隨機種子與操作，原版與原型結果完全相同 ========== */
async function scriptedPlay(url, isOriginal) {
  const { ctx, page } = await newPage({ isOriginal });
  await page.addInitScript(() => {
    let a = 20261111;
    Math.random = function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  await page.goto(url);
  await sleep(1500);
  const out = await page.evaluate(() => {
    let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    startGame("normal");
    const trace = [];
    for (let i = 0; i < 60 && running; i++) {
      const rot = Math.floor(rnd() * 4), mv = Math.floor(rnd() * 9) - 4;
      for (let k = 0; k < rot; k++) tryRotate();
      for (let k = 0; k < Math.abs(mv); k++) (mv < 0 ? mLeft : mRight)();
      hardDrop();
      trace.push(score + "/" + lines + "/" + level);
    }
    running = false;
    return { score, lines, level, peakCombo, board: board.map((r) => r.map((c) => (c ? "#" : ".")).join("")).join("|"), trace: trace.join(","), DIFF: JSON.stringify(DIFF), COLS, ROWS };
  });
  await ctx.close();
  return out;
}
{
  const o = await scriptedPlay(`${ORIGIN}/orig/index.html`, true);
  const p = await scriptedPlay(proto("?bvPlayerId=" + A.playerId));
  check("玩法等價", "同一組隨機種子與 60 次操作：分數、行數、等級、最高連消與原版完全相同", o.score === p.score && o.lines === p.lines && o.level === p.level && o.peakCombo === p.peakCombo, `原版 ${o.score}/${o.lines}/LV${o.level}/C${o.peakCombo}　原型 ${p.score}/${p.lines}/LV${p.level}/C${p.peakCombo}`);
  check("玩法等價", "每一步的分數／行數／等級軌跡與原版完全相同", o.trace === p.trace && o.trace.length > 50);
  check("玩法等價", "最終盤面與原版完全相同", o.board === p.board);
  check("玩法等價", "難度表（速度、每級行數、倍率）與棋盤大小相同", o.DIFF === p.DIFF && o.COLS === p.COLS && o.ROWS === p.ROWS, o.DIFF);
}

/* ========== 6. 全程安全檢查 ========== */
check("安全", "換殼原型全程沒有連線舊 Firebase、gstatic 或其他未預期的外部網址", external.length === 0, external.slice(0, 5).join(" "));
check("對照", "（對照組）原版遊戲確實會嘗試載入 Firebase SDK — 證明攔截機制有效", originalExternal.some((u) => /gstatic\.com\/firebasejs/.test(u)), originalExternal.length + " 筆");
check("安全", "對玩家 API 只有 GET（唯讀），沒有建立或修改玩家", apiCalls.every((c) => c.startsWith("GET ")), [...new Set(apiCalls.map((c) => c.split(" ")[0]))].join(","));
check("安全", "遊戲沒有改動玩家資料庫（與建立測試玩家後完全相同）", JSON.stringify(db.root) === dbAfterSeed);

await browser.close(); srv.close();
const pass = results.filter((r) => r.result === "PASS").length;
for (const r of results) console.log(`${r.result}  [${r.group}] ${r.name}${r.result === "PASS" ? "" : "  ← " + r.info}`);
console.log(`\n${pass}/${results.length} PASS`);
fs.writeFileSync(path.join(OUT, "e2e-results.json"), JSON.stringify(results, null, 1));
process.exit(pass === results.length ? 0 : 1);

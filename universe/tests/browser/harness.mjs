/* 遊戲宇宙瀏覽器測試共用環境（Playwright + Chromium）
   - 網站：本 Repository（大廳＋universe/ 三款宇宙版），由本機 HTTP 伺服器提供
   - 原版對照組：/orig/tetris/、/orig/rhythm/、/orig/quiz/ 由三個唯讀 clone 提供
   - 玩家 API：本 Repository 的 Worker 程式（backend/worker）＋ 假資料庫（不連正式 Firebase）
   - 原版遊戲素材網址 vashyang1120.github.io/<repo>/ 由唯讀 clone 提供（代替正式網站）
   - 其他所有外部連線（舊 Firebase、gstatic、YouTube…）一律攔截並記錄 */
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const { chromium } = require("playwright");
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const API = "https://balloon-v-universe-api.vashyang1120.workers.dev";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json",
  ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".srt": "text/plain; charset=utf-8", ".woff2": "font/woff2" };

/** clones = { tetris, rhythm, quiz, rush? }（唯讀 clone 路徑；rush＝balloon-v-rush，派對島大作戰）
    flags：Worker 環境變數覆寫（例如 { SCORES_ENABLED: "on" }）
    v0.3.0：本 Repository 也同時以 https://vashyang1120.github.io/balloon-v-universe/ 提供（與正式網站同網域，
    讓大廳 → 派對島 → 回大廳 走真正的跨 Repository 網址；兩個網站共用同一個 github.io 網域） */
export async function createHarness({ clones, out, flags = {}, jwks = null }) {
  fs.mkdirSync(out, { recursive: true });
  const REPO_DIR = { "vparty-tetris": clones.tetris, "vparty-rhythm-game": clones.rhythm, "vparty-quiz-game": clones.quiz };
  if (clones.rush) REPO_DIR["balloon-v-rush"] = clones.rush;
  const ORIG = { tetris: clones.tetris, rhythm: clones.rhythm, quiz: clones.quiz };

  function sendFile(r, f) {
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "access-control-allow-origin": "*", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(r);
  }
  const served = [];
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split("?")[0]);
    served.push(p);
    const m = p.match(/^\/orig\/(tetris|rhythm|quiz)\/(.*)$/);
    if (m) return sendFile(r, path.join(ORIG[m[1]], m[2] || "index.html"));
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
    sendFile(r, f);
  });
  const PORT = 8400 + Math.floor(Math.random() * 300);
  await new Promise((ok) => srv.listen(PORT, "127.0.0.1", ok));
  const ORIGIN = `http://127.0.0.1:${PORT}`;

  /* 玩家 API：真實 Worker 程式 + 假資料庫 */
  const W = path.join(ROOT, "backend/worker");
  const { createApp } = await import(path.join(W, "src/app.js"));
  const { createFakeRtdb } = await import(path.join(W, "tests/fake-rtdb.js"));
  const { fakeServiceAccount, baseEnv } = await import(path.join(W, "tests/helpers.js"));
  const db = createFakeRtdb();
  const clock = { offset: 0 };   // 伺服器時間＝真實時間＋offset（測試跨午夜、遊玩時間）
  const app = createApp({ fetch: db.fetch, now: () => Date.now() + clock.offset, jwks: jwks || undefined, logSink: { log() {}, warn() {}, error() {} } });
  const SITE_ORIGIN = "https://vashyang1120.github.io";
  const env = baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: (await fakeServiceAccount()).json, ALLOWED_ORIGINS: ORIGIN + "," + SITE_ORIGIN, SERVICE_ENV: "development", ...flags });
  const apiFault = { fn: null };   // (method, path) => "abort" | "loseResponse" | undefined
  let ipSeq = 10;
  async function apiCreate(displayId, base) {
    const r = await app.fetch(new Request(API + "/v1/players", { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "cf-connecting-ip": "203.0.113." + (ipSeq++) },
      body: JSON.stringify({ displayId, baseAvatarKey: base, createRequestId: crypto.randomUUID() }) }), env);
    const j = await r.json();
    if (!j.ok) throw new Error("建立測試玩家失敗：" + JSON.stringify(j));
    return j.data.player;
  }

  const results = [];
  const check = (group, name, ok, info = "") => { results.push({ group, name, result: ok ? "PASS" : "FAIL", info: String(info).slice(0, 220) }); return ok; };
  const note = (group, name, info = "") => results.push({ group, name, result: "NOT TESTED", info: String(info).slice(0, 220) });
  const external = [], apiCalls = [], originalExternal = [];
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

  async function newPage(opts = {}) {
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, isMobile: !!opts.mobile, hasTouch: !!opts.mobile,
      deviceScaleFactor: opts.scale || (opts.mobile ? 2 : 1) });
    await ctx.route("**/*", async (route) => {
      const u = route.request().url();
      if (u.startsWith(ORIGIN)) return route.continue();
      if (u.startsWith(API)) {
        const rq = route.request();
        apiCalls.push(rq.method() + " " + u.slice(API.length));
        if (opts.apiDown) return route.abort("connectionrefused");
        const fault = apiFault.fn ? apiFault.fn(rq.method(), u.slice(API.length)) : undefined;
        if (fault === "abort") return route.abort("connectionreset");
        const pageOrigin = (() => { try { return new URL(rq.frame().url()).origin; } catch { return ORIGIN; } })();
        const res = await app.fetch(new Request(u, { method: rq.method(), headers: { ...(await rq.allHeaders()), origin: pageOrigin.startsWith("http") ? pageOrigin : ORIGIN, "cf-connecting-ip": "203.0.113.200" },
          body: ["GET", "HEAD"].includes(rq.method()) ? undefined : rq.postData() }), env);
        if (fault === "loseResponse") return route.abort("connectionreset");   // 伺服器已處理，但回應在路上遺失
        const h = {}; res.headers.forEach((v, k) => { h[k] = v; });
        return route.fulfill({ status: res.status, headers: h, body: Buffer.from(await res.arrayBuffer()) });
      }
      const hub = u.match(/^https:\/\/vashyang1120\.github\.io\/balloon-v-universe\/(.*?)([?#].*)?$/);
      if (hub) {
        let rel = decodeURIComponent(hub[1]); if (rel === "" || rel.endsWith("/")) rel += "index.html";
        const f = path.join(ROOT, rel);
        if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, path: f, headers: { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" } });
        return route.fulfill({ status: 404, body: "" });
      }
      const m = u.match(/^https:\/\/vashyang1120\.github\.io\/(vparty-tetris|vparty-rhythm-game|vparty-quiz-game|balloon-v-rush)\/(.*?)([?#].*)?$/);
      if (m && REPO_DIR[m[1]]) {
        let rel = decodeURIComponent(m[2]); if (rel === "" || rel.endsWith("/")) rel += "index.html";
        const f = path.join(REPO_DIR[m[1]], rel);
        if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, path: f, headers: { "access-control-allow-origin": "*", "content-type": MIME[path.extname(f)] || "application/octet-stream" } });
        return route.fulfill({ status: 404, body: "" });
      }
      const raw = u.match(/^https:\/\/raw\.githubusercontent\.com\/vashyang1120\/(balloon-v-rush)\/main\/(.*?)([?#].*)?$/);
      if (raw && REPO_DIR[raw[1]]) {   // 派對島原本就從 GitHub raw 讀圖：由分支 clone 提供（不計入違規）
        const f = path.join(REPO_DIR[raw[1]], decodeURIComponent(raw[2]));
        if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ status: 200, path: f, headers: { "access-control-allow-origin": "*", "content-type": MIME[path.extname(f)] || "application/octet-stream" } });
        return route.fulfill({ status: 404, body: "" });
      }
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort();   // 字型：原版就有，測試環境不連外
      if (/^https:\/\/(www\.youtube\.com|i\.ytimg\.com|img\.youtube\.com|www\.youtube-nocookie\.com)\//.test(u)) return route.abort();   // 原版 MV／封面：測試環境不連外（不計入違規）
      if (opts.isOriginal) originalExternal.push(u); else external.push(u);
      return route.abort();
    });
    const page = await ctx.newPage();
    page.errors = [];
    page.on("pageerror", (e) => page.errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    return { ctx, page };
  }

  /* 原版對照組也需要 Math.random 固定：在指定時機重新播種 */
  const SEED_FN = `function __bvSeed(seed){ let a = seed >>> 0; Math.random = function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }`;

  async function finish(name) {
    await browser.close();
    srv.close();
    const pass = results.filter((r) => r.result === "PASS").length;
    const fail = results.filter((r) => r.result === "FAIL").length;
    for (const r of results) console.log(`${r.result.padEnd(10)} [${r.group}] ${r.name}${r.result === "PASS" ? "" : "  ← " + r.info}`);
    console.log(`\n${name}: ${pass} PASS / ${fail} FAIL / ${results.length - pass - fail} NOT TESTED`);
    fs.writeFileSync(path.join(out, `${name}-results.json`), JSON.stringify(results, null, 1));
    return fail === 0;
  }

  return { ORIGIN, SITE: SITE_ORIGIN + "/balloon-v-universe/", clock, apiFault, API, db, app, env, apiCreate, results, check, note, external, apiCalls, originalExternal, browser, newPage, SEED_FN, served, finish, out };
}

export const text = (page, sel) => page.locator(sel).first().innerText().catch(() => "");

/* 頁面上沒有被裁切／超出畫面的可見按鈕（回傳有問題的按鈕） */
export async function offscreenButtons(page, scope = "body") {
  return page.evaluate((scope) => {
    const W = window.innerWidth, H = window.innerHeight, bad = [];
    document.querySelectorAll(scope + " button, " + scope + " [role=button]").forEach((b) => {
      const s = getComputedStyle(b);
      if (s.display === "none" || s.visibility === "hidden" || b.offsetParent === null) return;
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.left < -1 || r.right > W + 1) bad.push((b.id || b.textContent.trim().slice(0, 12)) + ` x:${Math.round(r.left)}-${Math.round(r.right)}`);
    });
    return bad;
  }, scope);
}
export async function hasHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

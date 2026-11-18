/* 方塊派對 UI 測試版（tetris-universe-ui-v0.1.0-test-2）：核心完整性＋Sandbox 隔離（單元測試）
   執行（repository 根目錄）：node --test universe/tetris-ui-test/tests/ui-test-integrity.test.mjs

   正式版的 universe/tetris/tests/tetris-core-integrity.test.mjs 保留不動、照常執行。
   測試版因為 <head> 多了樣式與程式標籤，另外建立自己的基準：
     A. 測試版所有 <script> 內容（整個遊戲程式）與正式宇宙版逐字相同 → 遊戲核心不可能被改
     B. 核心函式與原版 vparty-tetris v1.3.7 基準（original-functions.sha256.json）逐字相同
     C. <style> 與頁面 HTML 結構和正式宇宙版相同；把建置腳本插入的標籤拿掉後，整份 HTML 與正式版逐字相同
     D. ui-test.js 不改寫任何遊戲狀態或核心函式（只包裝 initCanvas 決定格子大小）
     E. Sandbox：不論網址有沒有 sandbox=1，Session 都是 sandbox，SDK 任何呼叫都不會送出網路請求 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { inlineScripts, extractFunctions, styleBlock, bodyMarkup } from "../../shared/tools/js-functions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.resolve(HERE, "..");
const ROOT = path.resolve(TEST_DIR, "../..");
const PROD_DIR = path.join(ROOT, "universe/tetris");
const read = (p) => fs.readFileSync(p, "utf8");
const testHtml = read(path.join(TEST_DIR, "index.html"));
const prodHtml = read(path.join(PROD_DIR, "index.html"));
const baseline = JSON.parse(read(path.join(PROD_DIR, "tools/original-functions.sha256.json")));
const uiJs = read(path.join(TEST_DIR, "ui-test.js"));
const brandJs = read(path.join(TEST_DIR, "ui-brand.js"));
const guardJs = read(path.join(TEST_DIR, "sandbox-guard.js"));
const testShell = read(path.join(TEST_DIR, "universe-shell.js"));

/* 與正式版 tetris-core-integrity.test.mjs 相同的核心清單 */
const CORE = [
  "initCanvas", "randPiece", "newBoard", "startGame", "loop", "rotate", "tryRotate", "valid", "mLeft", "mRight", "mDown",
  "hardDrop", "lock", "clearLines", "getStickerKey", "updateHUD", "lighten", "darken", "initBalloon", "getTinted",
  "drawCell", "drawRopes", "draw", "drawNext", "spawnParticles", "updParticles", "drawParticles", "showSticker",
  "checkDanger", "showLvFlash", "clearGameVisualState", "togglePause", "getACtx", "tone", "noise",
  "loadSongs", "loadSong", "playSong", "pauseSong", "togglePlay", "updPlayBtns", "startProg", "stopProg",
  "toggleFullscreen", "showDiffSelect", "showScreen", "isGameScreenActive", "shouldShowMobileControls",
  "updateMobileControlsVisibility", "syncMobileControlsVisibility", "notifyParentHeight"
];

test("A. 測試版的遊戲程式（所有內嵌 <script>）與正式宇宙版逐字相同", () => {
  assert.equal(inlineScripts(testHtml), inlineScripts(prodHtml));
  assert.ok(inlineScripts(testHtml).length > 100000, "遊戲程式長度異常");
});

test("B. 核心函式（方塊、旋轉、碰撞、消除、計分、連消、速度、關卡、落下鎖定、結束判定…）與原版 v1.3.7 基準逐字相同", () => {
  const now = Object.fromEntries(extractFunctions(inlineScripts(testHtml)).map((f) => [f.name, f.sha256]));
  for (const name of CORE) {
    assert.ok(baseline.functions[name], `基準缺少 ${name}`);
    assert.equal(now[name], baseline.functions[name], `核心函式被修改：${name}`);
  }
  // 計分、消除、結束判定相關（不在 CORE 清單但屬於規則）：與正式宇宙版相同
  const prodFns = Object.fromEntries(extractFunctions(inlineScripts(prodHtml)).map((f) => [f.name, f.sha256]));
  assert.deepEqual(now, prodFns, "測試版與正式宇宙版的函式集合或內容不同");
  assert.match(inlineScripts(testHtml), /const COLS=10, ROWS=20;/, "棋盤 10×20 常數必須保留");
});

const INJECTED = [
  /^<!-- \[UI 測試版\] tetris-universe-ui-v\d+\.\d+\.\d+-test-\d+：由 universe\/tetris\/index\.html 經 .*$/,
  /^     永久 Sandbox（sandbox-guard\.js）；不讀寫任何正式資料。請勿手動修改本檔.*-->$/,
  /^<!-- \[UI 測試版\] Sandbox 強制隔離：必須在 SDK 之前載入 -->$/,
  /^<script src="sandbox-guard\.js"><\/script>$/,
  /^<!-- \[UI 測試版\] 手機版 UI 重新配置 -->$/,
  /^<link rel="stylesheet" href="ui-test\.css">$/,
  /^<!-- \[UI 測試版\] 手機版 UI：棋盤尺寸、半透明觸控按鍵、頂部 HUD -->$/,
  /^<script src="ui-test\.js"><\/script>$/,
  /^<!-- \[UI 測試版\] 第二階段品牌視覺（v0\.2\.0）：首頁、結算、HUD 配色 -->$/,
  /^<link rel="stylesheet" href="ui-brand\.css">$/,
  /^<!-- \[UI 測試版\] 第二階段品牌視覺：上下式首頁、結算角色、同難度再玩一次 -->$/,
  /^<script src="ui-brand\.js\?v=0\.3\.2-test-1"><\/script>$/,
  /^<script src="balloon-assets\.js"><\/script>$/,
  /^<script src="creation-story\.js\?v=0\.3\.2-test-1"><\/script>$/,
  /^<link rel="stylesheet" href="creation-story\.css\?v=0\.3\.2-test-1">$/,
  /^<link rel="stylesheet" href="tutorial\.css\?v=0\.3\.2-test-1">$/,
  /^<script src="guided-practice\.js\?v=0\.3\.2-test-1"><\/script>$/,
  /^<script src="tutorial\.js\?v=0\.3\.2-test-1"><\/script>$/,
  /^<script src="menu-audio\.js\?v=0\.1\.2-test-1"><\/script>$/
];

test("C. <style>、頁面 HTML 結構與正式宇宙版相同；拿掉插入的標籤後整份 HTML 逐字相同（只多了標題文字）", () => {
  assert.equal(styleBlock(testHtml), styleBlock(prodHtml), "<style> 被修改");
  assert.equal(bodyMarkup(testHtml), bodyMarkup(prodHtml), "頁面結構被修改");
  const stripped = testHtml.split("\n").filter((l) => !INJECTED.some((r) => r.test(l))).join("\n")
    .replace("<title>氣球小V方塊派對 🎈｜UI 測試版（Sandbox）</title>", "<title>氣球小V方塊派對 🎈｜遊戲宇宙換殼測試版</title>");
  assert.equal(stripped, prodHtml);
});

test("C2. 測試版可由建置腳本重現（不需要、也沒有修改正式建置流程）", () => {
  const out = execFileSync("python3", ["-I", path.join(TEST_DIR, "tools/build_ui_test.py"), "--check"], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.match(out, /可重現：OK/);
});

test("D. ui-test.js 只包裝 initCanvas（格子大小），不改寫遊戲狀態、規則或其他核心函式", () => {
  const code = uiJs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const windowAssign = [...code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(windowAssign)].sort(), ["BVUiTest", "initCanvas"]);
  const STATE = ["board", "cur", "nxt", "cx", "cy", "score", "lines", "level", "combo", "peakCombo", "running", "paused", "diff", "dropAcc", "lastT", "particles", "COLS", "ROWS", "DIFF", "PIECES", "PKEYS"];
  for (const v of STATE) assert.doesNotMatch(code, new RegExp("(^|[^.\\w$])" + v + "\\s*(=(?!=)|\\+=|-=|\\+\\+|--)", "m"), `ui-test.js 不得改寫 ${v}`);
  for (const fn of CORE.filter((n) => n !== "initCanvas")) assert.doesNotMatch(code, new RegExp("(^|[^.\\w$])" + fn + "\\s*=(?!=)", "m"), `ui-test.js 不得改寫 ${fn}`);
  // 按鍵只呼叫原版既有函式，條件與原版鍵盤相同（running 且未暫停）
  assert.match(code, /run: function \(\) \{ mLeft\(\); \}/);
  assert.match(code, /run: function \(\) \{ mRight\(\); \}/);
  assert.match(code, /run: function \(\) \{ if \(!mDown\(\)\) lock\(\); \}/);
  assert.match(code, /run: function \(\) \{ tryRotate\(\); \}/);
  assert.match(code, /run: function \(\) \{ hardDrop\(\); \}/);
  assert.match(code, /return running === true && paused !== true;/);
});

test("D2. ui-brand.js（第二階段品牌視覺）不改寫遊戲狀態、規則或任何核心函式；只換按鈕事件、排版與文字", () => {
  const code = brandJs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const windowAssign = [...code.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(windowAssign)].sort(), ["BVUiBrand"]);
  const STATE = ["board", "cur", "nxt", "cx", "cy", "score", "lines", "level", "combo", "peakCombo", "running", "paused", "diff", "dropAcc", "lastT", "particles", "COLS", "ROWS", "DIFF", "PIECES", "PKEYS", "CELL"];
  for (const v of STATE) assert.doesNotMatch(code, new RegExp("(^|[^.\\w$])" + v + "\\s*(=(?!=)|\\+=|-=|\\+\\+|--)", "m"), `ui-brand.js 不得改寫 ${v}`);
  for (const fn of CORE) assert.doesNotMatch(code, new RegExp("(^|[^.\\w$])" + fn + "\\s*=(?!=)", "m"), `ui-brand.js 不得改寫 ${fn}`);
  // 開局只透過原版函式：showScreen("s-game") → window.startGame（換殼層包好的版本）
  assert.match(code, /showScreen\("s-game"\);\s*window\.startGame\(selectedDiff\);/);
  assert.match(code, /showScreen\("s-game"\);\s*window\.startGame\(last\);/);
  // 只換掉兩個原有事件：開始遊戲（goProfile）與再玩一次（showDiffSelect）
  assert.deepEqual([...code.matchAll(/removeEventListener\("click", (\w+)\)/g)].map((m) => m[1]).sort(), ["goProfile", "showDiffSelect"]);
  // 新紀錄只讀原版判斷（#new-best），不寫入任何紀錄
  assert.match(code, /newBest\.style\.display === "block"/);
  assert.doesNotMatch(code, /setLocalBest|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon/);
  // 三張既有小V素材（不新增其他人物圖）
  const imgs = [...new Set([...brandJs.matchAll(/"(\.\.\/\.\.\/assets\/[^"]+\.png)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(imgs, ["../../assets/rpg/v_bust_congrats.png", "../../assets/rpg/v_bust_happy.png", "../../assets/rpg/v_full_open_arms.png"]);
  for (const p of imgs) assert.ok(fs.existsSync(path.join(TEST_DIR, p)), p + " 不存在");
});

test("D3. ui-brand.css 只引用已定案素材（E-01 背景、三張金框按鈕）；遊戲中 HUD 規則不用圖片、只改顏色／陰影", () => {
  const css = read(path.join(TEST_DIR, "ui-brand.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const urls = [...new Set([...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(urls, ["../../assets/universe_map_bg.png", "assets/btn_blue.png", "assets/btn_purple.png", "assets/btn_yellow.png"]);
  for (const u of urls) assert.ok(fs.existsSync(path.join(TEST_DIR, u)), u + " 不存在");
  assert.doesNotMatch(css, /item_round_balloon_bundle|item_star|sign_select_player|sign_my_pass|coin_gold/, "不得使用排除的素材");
  const hud = css.split("\n").filter((l) => /#s-game|#board-wrap|#next-canvas|#g-avatar/.test(l)).join("\n");
  assert.doesNotMatch(hud, /url\(/, "遊戲中不得使用 E-01 或金框按鈕");
  assert.doesNotMatch(hud, /(^|[\s;{])(width|height|min-|max-|padding|margin|font-size|border-width|border:|top|left|right|bottom|inset|transform|grid|flex|gap|position)\s*:/m, hud);
});

test("D4. Sandbox 衍生按鈕素材：只有三張，來源與處理紀錄完整，尺寸與紀錄一致", async () => {
  const dir = path.join(TEST_DIR, "assets");
  const pngs = fs.readdirSync(dir).filter((f) => /^btn_.*\.png$/.test(f)).sort();
  assert.deepEqual(pngs, ["btn_blue.png", "btn_purple.png", "btn_yellow.png"]);
  const src = JSON.parse(read(path.join(dir, "button-sources.json")));
  const expect = { purple: "ui_button_purple.png", yellow: "ui_button_yellow.png.png", blue: "ui_button_blue.png.png" };
  for (const [k, name] of Object.entries(expect)) {
    const r = src[k];
    assert.equal(r.source_repo, "vashyang1120/balloon-v-rush");
    assert.equal(r.source_path, "assets/adventure/ui/components/" + name);
    assert.match(r.source_sha256, /^[0-9a-f]{64}$/);
    const buf = fs.readFileSync(path.join(dir, `btn_${k}.png`));
    assert.equal(buf.readUInt32BE(16), r.output_size[0]); assert.equal(buf.readUInt32BE(20), r.output_size[1]);   // PNG IHDR 寬高
    assert.ok(buf[25] === 6, "必須是含透明通道的 RGBA PNG");
  }
  assert.match(read(path.join(dir, "SOURCES.md")), /balloon-v-rush/);
});

test("E1. 頁面載入順序：sandbox-guard.js 在 SDK 之前；換殼層缺少防護就停止", () => {
  const iGuard = testHtml.indexOf('<script src="sandbox-guard.js"></script>');
  const iSdk = testHtml.indexOf('<script src="../shared/universe-sdk.js"></script>');
  const iShell = testHtml.indexOf('<script src="universe-shell.js"></script>');
  assert.ok(iGuard > 0 && iGuard < iSdk && iSdk < iShell);
  assert.match(testShell, /if \(!window\.BVUiTestSandbox \|\| window\.BVUiTestSandbox\.forced !== true\) \{\n\s+throw new Error/);
  assert.match(testShell, /if \(S\.mode !== "sandbox" \|\| S\.isSandbox !== true\) \{\n\s+throw new Error/);
  assert.doesNotMatch(testShell, /services: \{ scores: "mock", leaderboard: "mock" \}   \/\/ 正式成績 API/);
});

/* ---------- E2：在 Node 裡實際執行 sandbox-guard.js＋SDK，模擬「正式網址」（沒有 sandbox=1） ---------- */
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _map: m };
}

function loadWorld(search, { local = {}, session = {} } = {}) {
  const calls = [];
  const spyFetch = async (url, init = {}) => { calls.push((init.method || "GET") + " " + url); return new Response('{"ok":true,"data":{}}', { status: 200 }); };
  const ctx = {
    console: { warn() {}, log() {}, error() {} }, URL, URLSearchParams, Promise, setTimeout, clearTimeout, TypeError, Error, JSON, Object, Array, Date, Math, String, Number,
    location: { origin: "https://vashyang1120.github.io", href: "https://vashyang1120.github.io/balloon-v-universe/universe/tetris-ui-test/" + search, search, assign() {} },
    navigator: { sendBeacon: () => { calls.push("BEACON"); return true; } },
    fetch: spyFetch,
    XMLHttpRequest: function () {},
    localStorage: memStorage(local), sessionStorage: memStorage(session)
  };
  ctx.XMLHttpRequest.prototype.open = function () {}; ctx.XMLHttpRequest.prototype.send = function () { calls.push("XHR"); };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(guardJs, ctx, { filename: "sandbox-guard.js" });
  vm.runInContext(read(path.join(ROOT, "universe/shared/universe-sdk.js")), ctx, { filename: "universe-sdk.js" });
  return { ctx, calls, U: ctx.BVUniverse, G: ctx.BVUiTestSandbox };
}

const REAL_ID = "p_abcdefghijklmnopqrst";   // 形狀像正式玩家代碼
const PROD_OUTBOX = { ["bvUniverse_v3_outbox_tetris"]: JSON.stringify([{ submissionId: "x", playerId: REAL_ID, scoreData: { score: 999 } }]),
  ["bvUniverse_v2_currentPlayerId"]: REAL_ID };

for (const search of ["", "?bvPlayerId=" + REAL_ID, "?sandbox=0&bvPlayerId=" + REAL_ID, "?sandbox=1&bvPlayerId=" + REAL_ID]) {
  test(`E2. 網址「${search || "（沒有參數）"}」：Session 永遠是 Sandbox、只用測試玩家、SDK 所有呼叫都不送出網路請求`, async () => {
    const { U, G, calls } = loadWorld(search, { local: PROD_OUTBOX });
    const S = U.createGameSession(Object.assign({ gameId: "tetris", gameVersion: "t", avatarBaseUrl: "x/", lobbyUrl: "../../index.html" }, G.sessionOptions()));
    assert.equal(S.mode, "sandbox"); assert.equal(S.isSandbox, true);
    const p = await S.start();
    assert.equal(p.playerId, G.demoPlayer.playerId, "必須使用 Sandbox 測試玩家，不能用網址或大廳的正式玩家");
    assert.equal(p.mode, "sandbox");
    const st = await S.official.init();
    assert.equal(st.scores, "sandbox");
    assert.equal(S.official.isEnabled(), false);
    await S.bootOfficial({ onWallet() {} });
    const run = await S.startRun();
    assert.deepEqual({ official: run.official, reason: run.reason }, { official: false, reason: "sandbox" });
    const fin = await S.finishRun({ score: 1, level: 1, lines: 0, difficulty: "normal", peakCombo: 0 });
    assert.equal(fin.official, false);
    assert.equal(JSON.stringify(await S.official.flushOutbox()), "[]");   // 不補送正式版暫存的成績
    // 成績只進 Mock（本分頁）
    const now = new Date().toISOString();
    const sub = S.newScoreSubmission({ startedAt: now, finishedAt: now, scoreData: { score: 5, level: 1, lines: 0, difficulty: "normal", peakCombo: 0 } });
    await S.services.scores.submit(sub);
    assert.equal((await S.services.leaderboard.getBoard({ gameId: "tetris" })).rows.length, 1);
    // 直接呼叫所有讀寫 API（SDK 的讀取函式本身不檢查 sandbox → 由 blockedFetch 擋住）
    const attempts = [
      () => S.official.submitRun({ official: true, playerId: p.playerId, submissionId: "s", sessionId: "s" }, { score: 1 }),
      () => S.official.getWallet(), () => S.official.getBoard("total"), () => S.official.getCollection(), () => S.official.catalog(),
      () => S.official.equip({ titleKey: "x" }), () => S.official.getQuizProgress(),
      () => S.services.wallet.claimDailyReward(), () => S.services.titles.unlock(), () => S.services.avatarUnlocks.unlock(),
      () => S.avatars.loadList(), () => S.switchPlayer(REAL_ID)
    ];
    for (const a of attempts) await a().then(() => {}, () => {});
    // 切換成正式玩家代碼：Sandbox 找不到 → 不會讀到正式資料
    assert.equal(S.getStatus().error && S.getStatus().error.kind, "notFound");
    assert.deepEqual(calls, [], "不得有任何網路請求：" + calls.join(", "));
    assert.ok(G.blocked.length >= 1, "SDK 嘗試連線時應被記錄為已封鎖");
    assert.ok(G.blocked.every((b) => b.kind === "sdk"));
  });
}

test("E3. 全頁網路防護：正式後端、Firebase 一律封鎖；寫入請求一律封鎖；只允許本站與 github.io 的讀取", async () => {
  const { ctx, G, calls } = loadWorld("");
  const API = "https://balloon-v-universe-api.vashyang1120.workers.dev";
  await ctx.fetch(API + "/v1/scores", { method: "POST", body: "{}" }).then(() => assert.fail("應被封鎖"), (e) => assert.ok(e.bvSandboxBlocked));
  await ctx.fetch(API + "/v1/players/" + REAL_ID).then(() => assert.fail("應被封鎖"), (e) => assert.ok(e.bvSandboxBlocked));
  await ctx.fetch("https://vparty-rhythm-game-default-rtdb.firebaseio.com/x.json").then(() => assert.fail(), (e) => assert.ok(e.bvSandboxBlocked));
  await ctx.fetch("https://balloon-v-universe-default-rtdb.asia-southeast1.firebasedatabase.app/x.json").then(() => assert.fail(), (e) => assert.ok(e.bvSandboxBlocked));
  await ctx.fetch("https://vashyang1120.github.io/x", { method: "POST" }).then(() => assert.fail(), (e) => assert.ok(e.bvSandboxBlocked));
  await ctx.fetch("https://example.com/x").then(() => assert.fail(), (e) => assert.ok(e.bvSandboxBlocked));
  assert.equal(ctx.navigator.sendBeacon(API + "/v1/scores", "{}"), false);
  const x = new ctx.XMLHttpRequest(); x.open("POST", API + "/v1/sessions");
  assert.throws(() => x.send("{}"));
  assert.deepEqual(calls, [], "被封鎖的請求不得送出");
  await ctx.fetch("https://vashyang1120.github.io/vparty-rhythm-game/songs.json");
  assert.deepEqual(calls, ["GET https://vashyang1120.github.io/vparty-rhythm-game/songs.json"], "遊戲素材讀取（GET github.io）應允許");
  assert.ok(G.blocked.length >= 8);
});

test("E4. 沙盒大廳在同一分頁建立的玩家可以沿用；正式玩家代碼不行", async () => {
  const sandboxId = "p_sandboxlobbyplayerab";
  const lobbyDb = { players: { [sandboxId]: { playerId: sandboxId, displayId: "沙盒小明", baseAvatarKey: "girl1" } } };
  const { U, G, calls } = loadWorld("?bvPlayerId=" + sandboxId, { session: { bvUniverseSandbox_v2_api: JSON.stringify(lobbyDb) } });
  const S = U.createGameSession(Object.assign({ gameId: "tetris", gameVersion: "t" }, G.sessionOptions()));
  const p = await S.start();
  assert.equal(p.playerId, sandboxId); assert.equal(p.displayId, "沙盒小明");
  assert.deepEqual(calls, []);
});

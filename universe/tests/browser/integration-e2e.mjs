/* 三款遊戲＋大廳 整合測試（真實瀏覽器）
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tests/browser/integration-e2e.mjs <tetris clone> <rhythm clone> <quiz clone> <輸出資料夾>

   流程：
   1. 玩家 A：大廳 → 方塊工坊 → 完成一場 → 回大廳；→ 音樂舞台 → 完成一首 → 回大廳；→ 知識學院 → 完成一局 → 回大廳
   2. 大廳切換成玩家 B → 三款遊戲都顯示 B、看不到 A 的資料 → 回大廳仍是 B
   3. 派對島大作戰（v0.3.0）：直接開啟 balloon-v-rush 第一大陸宇宙版，網址帶 playerId（完整流程見 launch-e2e.mjs）
   4. 四種視窗（1920×1080、1440×900、390×844、360×640）：大廳 → 各遊戲開始畫面與遊戲中畫面 → 回大廳
   全程確認：playerId 一致、沒有重建身份（沒有 POST）、沒有舊 Firebase 或其他外部連線、玩家資料庫不變 */
import fs from "node:fs";
import { createHarness, sleep, text, offscreenButtons, hasHorizontalScroll } from "./harness.mjs";

const [TETRIS, RHYTHM, QUIZ, OUT] = process.argv.slice(2);
if (!OUT) { console.error("用法：integration-e2e.mjs <tetris clone> <rhythm clone> <quiz clone> <out>"); process.exit(2); }
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ }, out: OUT });
const { ORIGIN, check, newPage } = H;
const A = await H.apiCreate("宇宙甲", "avatar_rabbit_hoodie");
const B = await H.apiCreate("宇宙乙", "girl2");
const dbAfterSeed = JSON.stringify(H.db.root);
const LOBBY = `${ORIGIN}/index.html`;

/* 節奏遊戲加速用的虛擬時鐘：只在 universe/rhythm/ 頁面啟用（大廳與其他遊戲不受影響） */
const VCLOCK = `(() => { if (!/\\/universe\\/rhythm\\//.test(location.pathname) || !window.__bvFastRhythm) return;
  window.__vt = 0; const q = new Map(); let id = 0;
  window.requestAnimationFrame = (cb) => { id++; q.set(id, cb); return id; };
  window.cancelAnimationFrame = (i) => { q.delete(i); };
  window.__frame = (ms) => { const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(ms)); };
  function stub() { const f = function () { return stub(); }; return new Proxy(f, { get(t, p) { if (p === "then") return undefined; if (p in t) return t[p]; return stub(); }, set(t, p, v) { t[p] = v; return true; }, apply() { return stub(); } }); }
  class FakeAC { constructor() { this.state = "running"; this.destination = stub(); }
    get currentTime() { return window.__vt; } resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
    decodeAudioData(b, ok) { const d = { duration: 600 }; if (ok) ok(d); return Promise.resolve(d); }
    createBufferSource() { return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createGain() { return stub(); } createOscillator() { return stub(); } }
  window.AudioContext = FakeAC; window.webkitAudioContext = FakeAC; })();`;

async function seedLobby(page, players, currentId) {
  await page.goto(LOBBY);
  await page.evaluate(({ players, currentId }) => {
    localStorage.setItem("bvUniverse_v2_rememberedPlayers", JSON.stringify(players.map((p, i) => ({ playerId: p.playerId, id: p.displayId, baseAvatarKey: p.baseAvatarKey, displayAvatarKey: p.baseAvatarKey, rememberedAt: 1000 + i }))));
    localStorage.setItem("bvUniverse_v2_currentPlayerId", currentId);
    players.forEach((p) => localStorage.setItem("bvUniverse_v2_lobbyTutorialDone__" + p.playerId, "1"));
  }, { players, currentId });
  await page.goto(LOBBY);
}
const lobbyPlayer = (page) => page.waitForFunction(() => { const el = document.getElementById("playerCardId"); const card = document.getElementById("playerCard"); return el && el.textContent.trim().length > 0 && !card.hidden && !card.classList.contains("is-loading"); }, null, { timeout: 15000 })
  .then(() => page.evaluate(() => ({ id: document.getElementById("playerCardId").textContent.trim(), cur: localStorage.getItem("bvUniverse_v2_currentPlayerId"), flowHidden: document.getElementById("flow").hidden })));

async function enterGame(page, zone) {
  await page.locator(`.entry[data-zone="${zone}"]`).click();
  await page.waitForFunction(() => document.getElementById("infoPanel").getAttribute("aria-hidden") === "false", null, { timeout: 8000 });
  await sleep(250);
  await page.click("#playBtn");
}
const ZONES = [
  { zone: "blocks", game: "tetris", name: "方塊工坊", path: "/universe/tetris/", ready: () => window.UniverseTetris && window.UniverseTetris.isReady(), nameOf: () => document.getElementById("top-name").textContent, pidOf: () => PLAYER.playerId },
  { zone: "stage", game: "rhythm", name: "音樂舞台", path: "/universe/rhythm/", ready: () => window.UniverseRhythm && window.UniverseRhythm.isReady(), nameOf: () => document.getElementById("bv-player-chip-name").textContent, pidOf: () => PLAYER.playerId },
  { zone: "academy", game: "quiz", name: "知識學院", path: "/universe/quiz/", ready: () => window.UniverseQuiz && window.UniverseQuiz.isReady() && QUESTIONS.length > 0, nameOf: () => document.getElementById("top-name").textContent, pidOf: () => PLAYER.playerId }
];

async function completeRound(page, z) {
  if (z.game === "tetris") {
    await page.click("#btn-start");
    await page.waitForSelector("#ov-btns button");
    await page.click("#ov-btns button:nth-child(2)");
    await page.waitForFunction(() => running === true, null, { timeout: 5000 });
    await page.keyboard.press("ArrowLeft"); await page.keyboard.press(" ");
    await page.evaluate(() => { for (let r = 0; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = (c === 4 ? null : "#3ecf8e"); cur = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff85a1" }; cx = 4; cy = -1; lock(); });
    await page.waitForSelector("#s-result:not(.off)", { timeout: 5000 });
    await sleep(700);
    return { note: await text(page, "#bv-result-note"), score: await text(page, "#res-score") };
  }
  if (z.game === "rhythm") {
    await page.click("#btn-play");
    await page.waitForSelector("#s-songlist:not(.off)");
    await page.waitForFunction(() => SONGS.length > 0, null, { polling: 100 });
    await page.evaluate(() => { songIdx = SONGS.findIndex((s) => s.id === "song005"); renderSongCards(); });
    await page.click('#diff-wrap .db[data-d="easy"]');
    await page.click("#btn-start");
    await page.waitForFunction(() => G.running === true, null, { timeout: 30000, polling: 100 });
    await page.evaluate(() => {
      const K = ["d", "f", "j", "k"]; const ev = [];
      G.beatmap.forEach((b, k) => { if (k % 4 === 3) return; const t = Math.round(b.t * 1000 + (k % 3) * 30); ev.push([t, b.lane, "keydown"], [t + 50, b.lane, "keyup"]); });
      ev.sort((a, b) => a[0] - b[0]); let i = 0;
      for (let t = 0; t <= G.duration + 3000 && G.running; t += 16) {
        window.__vt = t / 1000; window.__frame(t);
        while (i < ev.length && ev[i][0] <= t) { const e = ev[i++]; document.dispatchEvent(new KeyboardEvent(e[2], { key: K[e[1]], bubbles: true })); }
      }
    });
    await page.waitForFunction(() => !document.getElementById("s-result").classList.contains("off"), null, { timeout: 15000, polling: 100 });
    await sleep(700);
    return { note: await text(page, "#bv-result-note"), score: await text(page, "#r-score") };
  }
  // quiz
  await page.click("#btn-go-setup");
  await page.waitForSelector("#screen-setup.active");
  await page.click("#btn-start-quiz");
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction((i) => quizState.currentIndex === i && document.querySelectorAll(".choice-btn:not([disabled])").length > 0, i, { timeout: 10000 });
    const pick = await page.evaluate(() => { const q = quizState.questions[quizState.currentIndex]; return quizState.currentIndex % 3 === 2 ? (q.answerIndex + 1) % q.choices.length : q.answerIndex; });
    await page.locator(".choice-btn").nth(pick).click();
    await page.waitForSelector("#explanation-box:not(.hidden)");
    await page.click("#btn-next-question");
  }
  await page.waitForSelector("#screen-result.active");
  await page.waitForFunction(() => !/正在保存/.test(document.getElementById("save-status").textContent), null, { timeout: 10000 });
  await sleep(300);
  return { note: await text(page, "#save-status"), score: await text(page, "#result-score") };
}

async function backToLobby(page, z) {
  if (z.game === "tetris") { await page.click("#btn-res-home"); await page.waitForSelector("#s-title:not(.off)"); await page.click("#bv-btn-lobby"); }
  else if (z.game === "rhythm") { await page.click("#btn-r-home"); await page.waitForSelector("#s-title:not(.off)"); await page.click("#bv-btn-lobby"); }
  else { await page.click("#btn-result-home"); await page.waitForSelector("#screen-title.active"); await page.click("#btn-game-menu"); }
  await page.waitForURL(/\/index\.html(\?.*)?$/, { timeout: 10000 });
}

/* ========== 1. 玩家 A：大廳 → 三款遊戲各完成一場 → 回大廳 ========== */
const ctxMain = await newPage();
const page = ctxMain.page;
await page.addInitScript("window.__bvFastRhythm = true;");
await page.addInitScript(VCLOCK);
await seedLobby(page, [A, B], A.playerId);
let lp = await lobbyPlayer(page);
check("整合｜大廳", "大廳顯示目前玩家 A（不需重新建立身份）", lp.id === "宇宙甲" && lp.cur === A.playerId && lp.flowHidden, JSON.stringify(lp));
await page.screenshot({ path: `${OUT}/int-00-lobby-A.png` });
const postsBefore = H.apiCalls.filter((c) => c.startsWith("POST")).length;
for (const [i, z] of ZONES.entries()) {
  await enterGame(page, z.zone);
  await page.waitForURL(new RegExp(z.path.replace(/\//g, "\\/") + "\\?bvPlayerId="), { timeout: 10000 });
  const url = new URL(page.url());
  check(`整合｜${z.name}`, `從大廳「${z.name}」進入 ${z.path}，網址帶目前玩家 playerId（不需手動複製）`, url.pathname === z.path && url.searchParams.get("bvPlayerId") === A.playerId, url.pathname + url.search);
  await page.waitForFunction(z.ready, null, { timeout: 20000, polling: 100 });
  await sleep(500);
  const who = { name: await page.evaluate(z.nameOf), pid: await page.evaluate(z.pidOf) };
  check(`整合｜${z.name}`, "遊戲顯示玩家 A，playerId 與大廳一致", who.name === "宇宙甲" && who.pid === A.playerId, JSON.stringify(who));
  await page.screenshot({ path: `${OUT}/int-0${i + 1}a-${z.game}-entered-A.png` });
  const res = await completeRound(page, z);
  check(`整合｜${z.name}`, "完成一場並顯示結算「本場成績尚未記入正式排行榜」", /本場成績尚未記入正式排行榜/.test(res.note) && !!res.score, res.note.replace(/\n/g, "｜").slice(0, 80));
  await page.screenshot({ path: `${OUT}/int-0${i + 1}b-${z.game}-result-A.png` });
  await backToLobby(page, z);
  lp = await lobbyPlayer(page);
  check(`整合｜${z.name}`, "回到大廳仍是玩家 A（不重建玩家、不重新輸入 ID、不重選頭像）", lp.id === "宇宙甲" && lp.cur === A.playerId && lp.flowHidden, JSON.stringify(lp));
  await page.screenshot({ path: `${OUT}/int-0${i + 1}c-${z.game}-back-to-lobby-A.png` });
}
check("整合｜身份", "整個 A 流程沒有建立玩家（沒有任何 POST）", H.apiCalls.filter((c) => c.startsWith("POST")).length === postsBefore);

/* ========== 2. 大廳切換成 B → 三款遊戲都顯示 B，看不到 A 的資料 ========== */
await page.locator(`.av-item[data-key="${B.playerId}"]`).click();
await page.waitForSelector("#switchModal:not([hidden])");
await page.click("#switchOk");
await page.waitForFunction((n) => document.getElementById("playerCardId").textContent.trim() === n, "宇宙乙", { timeout: 10000 });
lp = await lobbyPlayer(page);
check("整合｜切換", "大廳切換成玩家 B", lp.id === "宇宙乙" && lp.cur === B.playerId, JSON.stringify(lp));
await page.screenshot({ path: `${OUT}/int-04-lobby-switched-B.png` });
for (const [i, z] of ZONES.entries()) {
  await enterGame(page, z.zone);
  await page.waitForURL(new RegExp(z.path.replace(/\//g, "\\/") + "\\?bvPlayerId="), { timeout: 10000 });
  await page.waitForFunction(z.ready, null, { timeout: 20000, polling: 100 });
  await sleep(500);
  const who = { name: await page.evaluate(z.nameOf), pid: await page.evaluate(z.pidOf), url: new URL(page.url()).searchParams.get("bvPlayerId") };
  check(`整合｜切換`, `${z.name} 顯示玩家 B（不是上一位 A）`, who.name === "宇宙乙" && who.pid === B.playerId && who.url === B.playerId, JSON.stringify(who));
  const leak = await page.evaluate(({ game, a, b }) => {
    const S = (window.UniverseTetris || window.UniverseRhythm || window.UniverseQuiz).session;
    return S.services.scores.listMine(b, game).then((mine) => ({ mineB: mine.length, best: game === "tetris" ? document.getElementById("best-disp").textContent : null,
      dc: game === "rhythm" ? document.getElementById("home-daily-challenge-status").textContent : null,
      academy: game === "quiz" ? document.getElementById("academy-completed").textContent : null }));
  }, { game: z.game, a: A.playerId, b: B.playerId });
  const clean = leak.mineB === 0 && (z.game !== "tetris" || leak.best === "—") && (z.game !== "rhythm" || /今天還沒完成/.test(leak.dc)) && (z.game !== "quiz" || leak.academy === "0 / 24");
  check(`整合｜切換`, `${z.name}：A 的成績／最佳紀錄／今日挑戰／進度不會出現在 B`, clean, JSON.stringify(leak));
  await page.screenshot({ path: `${OUT}/int-0${5 + i}-${z.game}-entered-B.png` });
  if (z.game === "tetris") await page.click("#bv-btn-lobby");
  else if (z.game === "rhythm") await page.click("#bv-btn-lobby");
  else await page.click("#btn-game-menu");
  await page.waitForURL(/\/index\.html$/, { timeout: 10000 });
  lp = await lobbyPlayer(page);
  check(`整合｜切換`, `${z.name} → 回大廳仍是玩家 B`, lp.id === "宇宙乙" && lp.cur === B.playerId, JSON.stringify(lp));
}
await page.screenshot({ path: `${OUT}/int-08-lobby-B-after-games.png` });

/* ========== 3. 派對島大作戰（v0.3.0）：直接開啟真正的遊戲 ========== */
check("整合｜穩定", "整合流程沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
// 這個測試不載入 balloon-v-rush（派對島完整流程在 launch-e2e.mjs）：用一個空白頁代替，只確認網址
await page.context().route("https://vashyang1120.github.io/balloon-v-rush/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>派對島（測試替身）</title>" }));
await enterGame(page, "island");
await page.waitForURL(/balloon-v-rush\/rpg-continent1-universe\/\?bvPlayerId=/, { timeout: 10000 }).catch(() => {});
const islandUrl = page.url();
check("整合｜派對島", "派對島大作戰：直接開啟 balloon-v-rush 第一大陸宇宙版，網址帶目前玩家 playerId（不再顯示說明視窗）", islandUrl === "https://vashyang1120.github.io/balloon-v-rush/rpg-continent1-universe/?bvPlayerId=" + B.playerId, islandUrl);
await page.goto(LOBBY);
await lobbyPlayer(page);

/* ========== 4. 大廳新手教學、33 款頭像 ========== */
{
  const tut = await page.evaluate(async () => { window.Onboarding.runTutorial(); await new Promise((r) => setTimeout(r, 1500)); return { rpg: !document.getElementById("rpg").hidden }; });
  check("整合｜大廳", "大廳新手教學仍可正常啟動（RPG 對話出現）", tut.rpg, JSON.stringify(tut));
  await page.screenshot({ path: `${OUT}/int-10-lobby-tutorial.png` });
  const av = await page.evaluate(() => ({ n: window.MAP_CONFIG.player.builtinAvatars.length, base: window.MAP_CONFIG.player.avatarBaseUrl }));
  check("整合｜大廳", "大廳 33 款身份頭像設定不變", av.n === 33 && av.base === "assets/avatars/base/", JSON.stringify(av));
}
await ctxMain.ctx.close();

/* ========== 5. 四種視窗：大廳 → 各遊戲（開始畫面＋遊戲中）→ 回大廳 ========== */
/* 原版同一視窗大小、同一遊戲畫面中「超出畫面的按鈕」（用來區分：原版既有 vs 換殼造成） */
async function originalOffscreen(game, vp) {
  if (game === "rhythm") return [];
  const { ctx, page } = await newPage({ viewport: { width: vp.w, height: vp.h }, mobile: vp.mobile, isOriginal: true });
  if (game === "tetris") { await page.goto(`${ORIGIN}/orig/tetris/index.html`); await sleep(1500); await page.evaluate(() => startGame("normal")); }
  else { await page.goto(`${ORIGIN}/orig/quiz/index.html`); await page.waitForFunction(() => QUESTIONS.length > 0); await page.evaluate(() => { selectedGrade = "low"; selectedSubject = "mandarin"; startQuiz(); }); }
  await sleep(400);
  const off = await offscreenButtons(page, game === "quiz" ? "#screen-quiz" : "#s-game");
  await page.screenshot({ path: `${OUT}/vp-${vp.w}x${vp.h}-${game}-0-original-playing.png` });
  await ctx.close();
  return off;
}
const idsOf = (list) => list.map((s) => s.split(" ")[0]).sort().join(",");

const VIEWPORTS = [{ w: 1920, h: 1080, mobile: false }, { w: 1440, h: 900, mobile: false }, { w: 390, h: 844, mobile: true }, { w: 360, h: 640, mobile: true }];
const vpRows = [];
for (const vp of VIEWPORTS) {
  const tag = `${vp.w}x${vp.h}`;
  const { ctx, page } = await newPage({ viewport: { width: vp.w, height: vp.h }, mobile: vp.mobile });
  await seedLobby(page, [A, B], A.playerId);
  await lobbyPlayer(page);
  await page.screenshot({ path: `${OUT}/vp-${tag}-0-lobby.png` });
  for (const z of ZONES) {
    await enterGame(page, z.zone);
    await page.waitForURL(new RegExp(z.path.replace(/\//g, "\\/")), { timeout: 10000 });
    await page.waitForFunction(z.ready, null, { timeout: 20000, polling: 100 });
    await sleep(600);
    const titleScope = z.game === "quiz" ? "#screen-title" : "#s-title";
    const off = await offscreenButtons(page, titleScope), hs = await hasHorizontalScroll(page);
    const who = await page.evaluate(z.pidOf);
    await page.screenshot({ path: `${OUT}/vp-${tag}-${z.game}-1-title.png` });
    // 開始遊戲＋主要操作
    let started = false, ctrl = "";
    if (z.game === "tetris") {
      await page.locator("#btn-start").click(); await page.waitForSelector("#ov-btns button"); await page.locator("#ov-btns button:nth-child(2)").click();
      await page.waitForFunction(() => running === true, null, { timeout: 5000 });
      const x0 = await page.evaluate(() => cx);
      if (vp.mobile) await page.locator("#mob-left").tap(); else await page.keyboard.press("ArrowLeft");
      await sleep(80);
      started = (await page.evaluate(() => cx)) === x0 - 1; ctrl = vp.mobile ? "觸控 ←" : "鍵盤 ←";
      if (vp.mobile) ctrl += (await page.evaluate(() => getComputedStyle(document.getElementById("mob-ctrl")).display !== "none")) ? "（手機按鈕顯示）" : "（手機按鈕未顯示）";
    } else if (z.game === "rhythm") {
      await page.locator("#btn-play").click(); await page.waitForSelector("#s-songlist:not(.off)");
      await page.waitForFunction(() => SONGS.length > 0);
      await page.locator("#btn-start").click();
      await page.waitForFunction(() => G.running === true, null, { timeout: 30000 });
      await sleep(800);
      const lane = page.locator("#lanes .lane.l2");
      if (vp.mobile) await lane.tap(); else { await page.keyboard.down("j"); await sleep(30); await page.keyboard.up("j"); }
      started = await page.evaluate(() => G.running && document.querySelectorAll("#lanes .lane").length === 4 && document.getElementById("audio-lbl").textContent === "AUDIO");
      ctrl = vp.mobile ? "觸控軌道" : "鍵盤 J";
    } else {
      await page.locator("#btn-go-setup").click(); await page.waitForSelector("#screen-setup.active");
      await page.locator("#btn-start-quiz").click(); await page.waitForSelector("#screen-quiz.active");
      await page.waitForFunction(() => document.querySelectorAll(".choice-btn:not([disabled])").length > 0);
      if (vp.mobile) await page.locator(".choice-btn").first().tap(); else await page.locator(".choice-btn").first().click();
      await page.waitForSelector("#explanation-box:not(.hidden)");
      started = true; ctrl = vp.mobile ? "觸控選項" : "點擊選項";
    }
    const gameScope = z.game === "quiz" ? "#screen-quiz" : "#s-game";
    const offGame = await offscreenButtons(page, gameScope);
    await page.screenshot({ path: `${OUT}/vp-${tag}-${z.game}-2-playing.png` });
    check(`視窗｜${tag}`, `${z.name}：玩家正確、開始遊戲＋主要操作（${ctrl}）正常、首頁按鈕沒有超出畫面、沒有水平捲動`,
      who === A.playerId && started && off.length === 0 && !hs, JSON.stringify({ off, hs, started }));
    const origOff = await originalOffscreen(z.game, vp);
    check(`視窗｜${tag}`, `${z.name}：遊戲中畫面排版與原版相同（超出畫面的按鈕與原版一致：${offGame.length ? idsOf(offGame) + "＝原版既有" : "無"}）`,
      idsOf(offGame) === idsOf(origOff), JSON.stringify({ universe: offGame, original: origOff }));
    vpRows.push({ viewport: tag, game: z.game, started, ctrl, titleOffscreen: off, gameOffscreen: offGame, originalGameOffscreen: origOff, horizontalScroll: hs });
    // 回大廳
    if (z.game === "tetris") { await page.evaluate(() => { running = false; }); await page.evaluate(() => window.UniverseTetris.goLobby()); }
    else if (z.game === "rhythm") { await page.evaluate(() => { quitGame(); }); await sleep(200); await page.locator("#bv-btn-lobby").click(); }
    else { await page.evaluate(() => { quizState.active = false; stopQuestionTimer(); stopQuizTimer(); showScreen("screen-title"); }); await page.locator("#btn-game-menu").click(); }
    await page.waitForURL(/\/index\.html$/, { timeout: 10000 });
    const back = await lobbyPlayer(page);
    check(`視窗｜${tag}`, `${z.name} → 回大廳仍是玩家 A`, back.id === "宇宙甲" && back.cur === A.playerId, JSON.stringify(back));
  }
  check(`視窗｜${tag}`, "沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}
fs.writeFileSync(`${OUT}/viewport-results.json`, JSON.stringify(vpRows, null, 1));

/* ========== 6. 全程安全 ========== */
check("整合｜安全", "全程沒有連線舊 Firebase、gstatic 或其他未預期外部網址", H.external.length === 0, H.external.slice(0, 5).join(" "));
check("整合｜安全", "對玩家 API 只有 GET（沒有建立、修改玩家）", H.apiCalls.every((c) => c.startsWith("GET ")), [...new Set(H.apiCalls.map((c) => c.split(" ")[0]))].join(","));
check("整合｜安全", "玩家資料庫沒有被改動（沒有 V幣、沒有正式排行榜、沒有成績寫入）", JSON.stringify(H.db.root) === dbAfterSeed);
process.exit((await H.finish("integration-e2e")) ? 0 : 1);

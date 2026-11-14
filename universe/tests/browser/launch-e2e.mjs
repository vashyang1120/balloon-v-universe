/* v0.3.0 正式上線整合：四款遊戲＋共用正式成績／排行榜／V幣（真實瀏覽器，本機模擬後端）
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tests/browser/launch-e2e.mjs <tetris clone> <rhythm clone> <quiz clone> <balloon-v-rush 分支 clone> <輸出資料夾>

   環境（全部在本機，不連任何正式服務）：
   - 網站以 https://vashyang1120.github.io/balloon-v-universe/ 與 …/balloon-v-rush/ 提供（同一個 github.io 網域，和正式網站一樣）
   - 後端：本 Repository 的 Worker 程式＋假 Firebase；SCORES_ENABLED / REWARDS_ENABLED = on（模擬「驗收後開啟正式寫入」）
   - 伺服器時間可以往前撥（clock.offset），用來模擬實際遊玩所需的時間；遊戲本身的計分與判定完全不動
   流程：
   1. 大廳：左下木牌顯示「排行榜」、總覽四款遊戲、派對島未開放大陸、空排行榜
   2. 玩家 A：大廳 → 方塊 → 節奏 → 問答（各完成一場）→ 伺服器接受、入榜、V幣 +30（一次）＋今日挑戰 +10
   3. 大廳通行證：正式 V幣餘額與紀錄；排行榜顯示 A 的成績與名次
   4. 派對島：大廳 → 派對島第一大陸（帶 playerId，不重新輸入）→ 第一大陸結算 → 伺服器接受 → 大陸排行榜 → 回大廳
   5. 玩家 B：錢包、名次與 A 完全分開
   6. 失敗情境：回應遺失（自動重送不重複加幣）、斷線（暫存→下次補送）、排行榜讀取失敗（重試）、跨站 SDK 載入失敗
   7. 視窗：1920×1080、1440×900、390×844、360×640；派對島手機橫向 844×390 */
import fs from "node:fs";
import path from "node:path";
import { createHarness, sleep, text, offscreenButtons, hasHorizontalScroll, ROOT } from "./harness.mjs";
const helpers = await import(path.join(ROOT, "backend/worker/tests/helpers.js"));
const ADMIN_KEY = await helpers.newRsaKey("kid-launch-e2e");

const [TETRIS, RHYTHM, QUIZ, RUSH, OUT] = process.argv.slice(2);
if (!OUT) { console.error("用法：launch-e2e.mjs <tetris> <rhythm> <quiz> <balloon-v-rush> <out>"); process.exit(2); }
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ, rush: RUSH }, out: OUT, flags: { SCORES_ENABLED: "on", REWARDS_ENABLED: "on", ADMIN_UIDS: helpers.ADMIN_UID }, jwks: helpers.staticJwks(ADMIN_KEY) });
const { check, note, newPage } = H;
const A = await H.apiCreate("上線甲", "avatar_rabbit_hoodie");
const B = await H.apiCreate("上線乙", "girl2");
const LOBBY = H.SITE + "index.html";
const RUSH_URL = "https://vashyang1120.github.io/balloon-v-rush/rpg-continent1-universe/";
const wallet = (pid) => H.db.get(`wallets/${pid}`) || { balance: 0, ledger: {} };
const ledgerOk = (pid) => { const w = wallet(pid); const sum = Object.values(w.ledger || {}).reduce((s, t) => s + t.amount, 0); return sum === (w.balance || 0); };
const minutes = (n) => { H.clock.offset += n * 60000; };

const VCLOCK = `(() => { if (!/\\/universe\\/rhythm\\//.test(location.pathname)) return;
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
const lobbyReady = (page) => page.waitForFunction(() => { const el = document.getElementById("playerCardId"); return el && el.textContent.trim() && !document.getElementById("playerCard").hidden && !document.getElementById("playerCard").classList.contains("is-loading"); }, null, { timeout: 15000 });
async function enterGame(page, zone) {
  await page.locator(`.entry[data-zone="${zone}"]`).click();
  await page.waitForFunction(() => document.getElementById("infoPanel").getAttribute("aria-hidden") === "false", null, { timeout: 8000 });
  await sleep(250);
  await page.click("#playBtn");
}
async function openBoard(page, gameId, tab) {
  if (await page.locator("#lbModal").isHidden()) { await page.click("#signSelect"); await page.waitForSelector("#lbModal:not([hidden])"); }
  if (!(await page.locator(`[data-lb-game="${gameId}"]`).count())) { await page.click("#lbBack"); }
  await page.click(`[data-lb-game="${gameId}"]`);
  await page.waitForSelector("#lbList");
  if (tab) await page.click(`[data-lb-tab="${tab}"]`);
  await page.waitForFunction(() => { const l = document.getElementById("lbList"); return l && !/載入中/.test(l.textContent); }, null, { timeout: 10000 });
  return page.evaluate(() => ({ text: document.getElementById("lbList").innerText, rows: [...document.querySelectorAll("#lbList .lb-row")].map((r) => r.innerText.replace(/\s+/g, " ")), me: [...document.querySelectorAll("#lbList .lb-row.is-me")].length }));
}

/* ========== 1. 大廳：排行榜木牌與總覽 ========== */
const { ctx: mainCtx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(VCLOCK);
await seedLobby(page, [A, B], A.playerId);
await lobbyReady(page);
const sign = await page.evaluate(() => {
  const s = document.getElementById("signSelect"); const r = s.getBoundingClientRect();
  return { text: s.querySelector(".sign__text").textContent, aria: s.getAttribute("aria-label"), bg: getComputedStyle(s.querySelector(".sign__img")).backgroundImage, left: r.left, bottom: r.bottom, h: innerHeight,
    pass: document.querySelector("#signPass .sign__text").textContent, avatars: document.querySelectorAll("#avatarRow .avatar-slot, #avatarRow [role=listitem]").length };
});
check("大廳｜排行榜木牌", "左下木牌文字改成「排行榜」（原木牌圖案不變；我的通行證不變）", sign.text === "排行榜" && sign.aria === "排行榜" && /sign_select_player_idle\.png/.test(sign.bg) && sign.pass === "我的通行證" && sign.left < 400, JSON.stringify(sign));
await page.screenshot({ path: `${OUT}/launch-01-lobby-leaderboard-sign-1440.png` });
await page.locator("#signSelect").screenshot({ path: `${OUT}/launch-01b-sign-closeup.png` });
await page.click("#signSelect");
await page.waitForSelector("#lbModal:not([hidden])");
const ov = await page.evaluate(() => [...document.querySelectorAll("[data-lb-game]")].map((b) => b.dataset.lbGame + ":" + b.closest(".lb-game").innerText.replace(/\s+/g, "")));
check("大廳｜排行榜總覽", "總覽列出四款遊戲，各自有「查看排行榜」按鈕", ov.length === 4 && ["tetris", "rhythm", "quiz", "adventure"].every((g, i) => ov[i].startsWith(g + ":")) && ov.every((x) => /查看排行榜/.test(x)), ov.join("｜"));
await page.screenshot({ path: `${OUT}/launch-02-leaderboard-overview.png` });
let b = await openBoard(page, "tetris");
check("大廳｜排行榜", "沒有成績時顯示空狀態（不是假資料）", b.rows.length === 0 && /還沒有人上榜/.test(b.text), b.text);
await page.click("#lbBack");
await page.click('[data-lb-game="adventure"]');
await page.waitForSelector("#lbList");
const adv = await page.evaluate(() => [...document.querySelectorAll(".lb-tabs .tab")].map((t) => t.dataset.lbTab + ":" + (t.disabled ? "disabled" : "open") + ":" + t.innerText.replace(/\s+/g, "")));
check("大廳｜派對島排行榜", "每個大陸一個榜；第二、三大陸顯示「未開放」且不能點、沒有分數", adv.length === 3 && /^continent-1:open/.test(adv[0]) && /continent-2:disabled:.*未開放/.test(adv[1]) && /continent-3:disabled:.*未開放/.test(adv[2]), adv.join("｜"));
await page.screenshot({ path: `${OUT}/launch-03-leaderboard-adventure-empty.png` });
await page.click("#lbClose");

/* ========== 2. 玩家 A：三款遊戲各一場（從大廳進入） ========== */
async function backToLobby(game) {
  if (game === "tetris") { await page.click("#btn-res-home"); await page.waitForSelector("#s-title:not(.off)"); await page.click("#bv-btn-lobby"); }
  else if (game === "rhythm") { await page.click("#btn-r-home"); await page.waitForSelector("#s-title:not(.off)"); await page.click("#bv-btn-lobby"); }
  else { await page.click("#btn-result-home"); await page.waitForSelector("#screen-title.active"); await page.click("#btn-game-menu"); }
  await page.waitForURL(/balloon-v-universe\/index\.html(\?.*)?$/, { timeout: 10000 });
  await lobbyReady(page);
}
const sessionsBefore = () => H.apiCalls.filter((c) => c.startsWith("POST /v1/sessions")).length;

// 方塊
await enterGame(page, "blocks");
await page.waitForURL(/\/universe\/tetris\/\?bvPlayerId=/);
await page.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady() && window.UniverseTetris.session.official.isEnabled(), null, { timeout: 15000 });
const tMark = await text(page, "#bv-status-mark");
check("方塊｜正式模式", "後端開啟正式成績時，首頁標示改為「正式成績」（不再顯示測試版）", /正式成績/.test(tMark), tMark);
let s0 = sessionsBefore();
await page.click("#btn-start");
await page.waitForSelector("#ov-btns button");
await page.click("#ov-btns button:nth-child(2)");
await page.waitForFunction(() => running === true, null, { timeout: 5000 });
await page.waitForFunction((n) => true, s0);
await sleep(400);
check("方塊｜場次", "開始遊戲時向伺服器取得一個場次（POST /v1/sessions）", sessionsBefore() === s0 + 1, String(sessionsBefore() - s0));
minutes(2);   // 模擬玩了 2 分鐘（伺服器時間）
await page.keyboard.press("ArrowLeft"); await page.keyboard.press(" ");
await page.evaluate(() => { for (let r = 0; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = (c === 4 ? null : "#3ecf8e"); cur = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff85a1" }; cx = 4; cy = -1; lock(); });
await page.waitForSelector("#s-result:not(.off)", { timeout: 5000 });
await page.waitForFunction(() => /已記入正式排行榜|審核中|未通過|沒有記入/.test(document.getElementById("bv-result-note").textContent), null, { timeout: 10000 });
const tNote = await text(page, "#bv-result-note"), tCoin = await text(page, "#res-vcoin-msg");
const tScore = await page.evaluate(() => score);
check("方塊｜正式成績", "結算後伺服器接受並記入正式排行榜，畫面顯示 +30 每日遊玩", /已記入正式排行榜/.test(tNote) && /每日遊玩 \+30/.test(tNote), tNote);
check("方塊｜V幣", "結算畫面的 V幣訊息改為伺服器結果（今天第一場 +30）", /每日遊玩 \+30/.test(tCoin), tCoin);
check("方塊｜後端", "伺服器排行榜分數＝遊戲畫面分數（遊戲自己算，後端只存與排名）", (H.db.get(`leaderboards/tetris/total/${A.playerId}`) || {}).score === tScore, JSON.stringify(H.db.get(`leaderboards/tetris/total/${A.playerId}`)) + " vs " + tScore);
await page.screenshot({ path: `${OUT}/launch-04-tetris-result-official.png` });
await backToLobby("tetris");

// 節奏（song005 簡單；用虛擬時鐘播放）
await enterGame(page, "stage");
await page.waitForURL(/\/universe\/rhythm\/\?bvPlayerId=/);
await page.waitForFunction(() => window.UniverseRhythm && window.UniverseRhythm.isReady() && window.UniverseRhythm.session.official.isEnabled(), null, { timeout: 15000, polling: 100 });
await page.click("#btn-play");
await page.waitForSelector("#s-songlist:not(.off)", { state: "attached" });
await page.waitForFunction(() => SONGS.length > 0, null, { polling: 100 });
await page.evaluate(() => { songIdx = SONGS.findIndex((s) => s.id === "song005"); renderSongCards(); });
await page.click('#diff-wrap .db[data-d="easy"]');
await page.click("#btn-start");
await page.waitForFunction(() => G.running === true, null, { timeout: 30000, polling: 100 });
await sleep(300);
const songSec = await page.evaluate(() => G.duration / 1000);
minutes(Math.ceil(songSec / 60) + 1);
await page.evaluate(() => {
  const K = ["d", "f", "j", "k"]; const ev = [];
  G.beatmap.forEach((b, k) => { if (k % 5 === 4) return; const t = Math.round(b.t * 1000 + (k % 3) * 30); const hold = (b.hold || 0) > 10 ? b.hold : (b.hold || 0) * 1000; ev.push([t, b.lane, "keydown"], [t + Math.max(50, hold + 30), b.lane, "keyup"]); });
  ev.sort((a, b) => a[0] - b[0]); let i = 0;
  for (let t = 0; t <= G.duration + 3000 && G.running; t += 16) {
    window.__vt = t / 1000; window.__frame(t);
    while (i < ev.length && ev[i][0] <= t) { const e = ev[i++]; document.dispatchEvent(new KeyboardEvent(e[2], { key: K[e[1]], bubbles: true })); }
  }
});
await page.waitForFunction(() => !document.getElementById("s-result").classList.contains("off"), null, { timeout: 15000, polling: 100 });
await page.waitForFunction(() => /已記入正式排行榜|審核中|未通過|沒有記入/.test(document.getElementById("bv-result-note").textContent), null, { timeout: 10000, polling: 100 });
const rNote = await text(page, "#bv-result-note");
const rG = await page.evaluate(() => ({ score: G.score }));
check("節奏｜正式成績", "完成一首歌 → 伺服器接受；今日挑戰（完成任一首歌）+10；不重複領 +30", /已記入正式排行榜/.test(rNote) && /今日挑戰 \+10/.test(rNote) && !/每日遊玩/.test(rNote), rNote);
check("節奏｜排行榜", "歌曲×難度排行榜（song005--easy）記錄遊戲畫面的分數", (H.db.get(`leaderboards/rhythm/song005--easy/${A.playerId}`) || {}).score === rG.score, JSON.stringify(H.db.get(`leaderboards/rhythm/song005--easy/${A.playerId}`)));
await page.screenshot({ path: `${OUT}/launch-05-rhythm-result-official.png` });
await backToLobby("rhythm");

// 問答（今日挑戰指定的年級＋科目）
await enterGame(page, "academy");
await page.waitForURL(/\/universe\/quiz\/\?bvPlayerId=/);
await page.waitForFunction(() => window.UniverseQuiz && window.UniverseQuiz.isReady() && QUESTIONS.length > 0 && window.UniverseQuiz.session.official.isEnabled(), null, { timeout: 20000 });
const qc = await page.evaluate(() => getDailyChallengeForDate());
await page.click("#btn-go-setup");
await page.waitForSelector("#screen-setup.active");
await page.evaluate((c) => { selectedGrade = c.gradeBand; selectedSubject = c.subject; }, qc);
await page.click("#btn-start-quiz");
await sleep(300);
minutes(2);
for (let i = 0; i < 10; i++) {
  await page.waitForFunction((i) => quizState.currentIndex === i && document.querySelectorAll(".choice-btn:not([disabled])").length > 0, i, { timeout: 10000 });
  const pick = await page.evaluate(() => { const q = quizState.questions[quizState.currentIndex]; return quizState.currentIndex % 4 === 3 ? (q.answerIndex + 1) % q.choices.length : q.answerIndex; });
  await page.locator(".choice-btn").nth(pick).click();
  await page.waitForSelector("#explanation-box:not(.hidden)");
  await page.click("#btn-next-question");
}
await page.waitForSelector("#screen-result.active");
await page.waitForFunction(() => !/正在保存/.test(document.getElementById("save-status").textContent) && document.getElementById("save-status").textContent.length > 0, null, { timeout: 15000 });
await sleep(500);
const qStatus = await text(page, "#save-status");
const qBanner = await text(page, "#result-vcoin-banner");
const qScore = await page.evaluate(() => quizState.score);
check("問答｜正式成績", "完成今日挑戰（指定年級＋科目）→ 伺服器接受；今日挑戰 +10", /已記入正式排行榜/.test(qStatus) && /今日挑戰 \+10/.test(qStatus), qStatus.replace(/\n/g, "／"));
check("問答｜V幣", "結算 V幣橫幅顯示伺服器結果與目前餘額（30＋10＋10＝50）", /\+10/.test(qBanner) && /目前 50 V幣/.test(qBanner), qBanner.replace(/\n/g, "／"));
const qp = H.db.get(`quizProgress/${A.playerId}`);
check("問答｜排行榜", "伺服器用原版規則更新科目最佳、年級榜與主榜", qp && qp.progress[qc.gradeBand][qc.subject].bestScore === qScore && (H.db.get(`leaderboards/quiz/main/${A.playerId}`) || {}).score === qScore, JSON.stringify(H.db.get(`leaderboards/quiz/main/${A.playerId}`) || {}).slice(0, 120));
await page.screenshot({ path: `${OUT}/launch-06-quiz-result-official.png` });
// V學園進度：重新整理後仍讀到伺服器進度
await page.reload();
await page.waitForFunction(() => window.UniverseQuiz && window.UniverseQuiz.isReady() && QUESTIONS.length > 0, null, { timeout: 20000 });
await sleep(800);
const prog = await page.evaluate(() => window.UniverseQuiz.mock.getProgressRoot());
check("問答｜V學園", "重新整理後 V學園進度來自伺服器（不是分頁內測試資料）", prog && prog[qc.gradeBand] && prog[qc.gradeBand][qc.subject] && prog[qc.gradeBand][qc.subject].bestScore === qScore, JSON.stringify(prog).slice(0, 100));
await page.click("#btn-game-menu");
await page.waitForURL(/balloon-v-universe\/index\.html/);
await lobbyReady(page);

check("V幣｜規則", "A 今天：+30（一次）＋方塊/節奏/問答今日挑戰（方塊今天的任務未完成）→ 50；帳本與餘額一致", wallet(A.playerId).balance === 50 && ledgerOk(A.playerId) && Object.keys(wallet(A.playerId).ledger).length === 3, JSON.stringify(Object.values(wallet(A.playerId).ledger || {}).map((t) => t.type + ":" + t.gameId + ":" + t.amount)));

/* ========== 3. 大廳：通行證 V幣、排行榜名次 ========== */
await page.waitForFunction(() => /50/.test(document.getElementById("playerCardCoins").textContent), null, { timeout: 8000 }).catch(() => {});
const card = await text(page, "#playerCardCoins");
await page.click("#signPass");
await page.waitForSelector("#passModal:not([hidden])");
await page.waitForFunction(() => /V幣紀錄/.test(document.getElementById("passTabBody").textContent), null, { timeout: 8000 }).catch(() => {});
const passTxt = await text(page, "#passTabBody");
check("大廳｜V幣", "右上玩家卡與通行證顯示正式 V幣 50；通行證有 V幣紀錄（3 筆）；標示消費尚未開放", /50/.test(card) && /V幣\s*50/.test(passTxt) && /消費功能尚未開放/.test(passTxt) && (passTxt.match(/\+(30|10)/g) || []).length === 3, card + "｜" + passTxt.replace(/\n/g, "／").slice(0, 300));
await page.screenshot({ path: `${OUT}/launch-07-pass-wallet.png` });
await page.click("#passClose");
b = await openBoard(page, "tetris");
check("大廳｜方塊排行榜", "總分榜顯示 A（名次、玩家 ID、分數），標示自己", b.rows.length === 1 && /上線甲/.test(b.rows[0]) && b.me === 1, b.rows.join("｜"));
await page.click("#lbBack");
b = await openBoard(page, "rhythm", "easy");
const songSel = await page.evaluate(() => document.getElementById("lbSong").value);
if (songSel !== "song005") { await page.selectOption("#lbSong", "song005"); await page.waitForFunction(() => !/載入中/.test(document.getElementById("lbList").textContent)); b = await page.evaluate(() => ({ rows: [...document.querySelectorAll("#lbList .lb-row")].map((r) => r.innerText) })); }
check("大廳｜節奏排行榜", "選歌＋難度（song005 簡單）顯示 A 的成績", b.rows.length === 1 && /上線甲/.test(b.rows[0]), JSON.stringify(b.rows));
await page.click('[data-lb-tab="hard"]');
await page.waitForFunction(() => !/載入中/.test(document.getElementById("lbList").textContent));
check("大廳｜節奏排行榜", "同一首歌其他難度是獨立排行榜（困難：沒有成績）", /還沒有人上榜/.test(await text(page, "#lbList")));
await page.screenshot({ path: `${OUT}/launch-08-leaderboard-rhythm.png` });
await page.click("#lbBack");
b = await openBoard(page, "quiz", "main");
const bLow = (await openBoard(page, "quiz", qc.gradeBand)).rows;
check("大廳｜問答排行榜", "主榜與該年級榜都有 A；其他年級榜沒有", b.rows.length === 1 && bLow.length === 1, b.rows.join() + "｜" + bLow.join());
await page.screenshot({ path: `${OUT}/launch-09-leaderboard-quiz.png` });
await page.click("#lbClose");

/* ========== 4. 派對島大作戰：大廳 → 第一大陸（跨 Repository）→ 結算 → 回大廳 ========== */
await enterGame(page, "island");
await page.waitForURL((u) => u.href.startsWith(RUSH_URL + "?bvPlayerId=" + A.playerId), { timeout: 15000 });
check("派對島｜入口", "大廳「開始遊玩」直接開啟真正的遊戲（balloon-v-rush 第一大陸宇宙版），網址帶 playerId", page.url().startsWith(RUSH_URL + "?bvPlayerId=" + A.playerId), page.url());
await page.waitForFunction(() => typeof C1U !== "undefined" && C1U.verify === "ok", null, { timeout: 20000 });
await page.waitForFunction(() => window.C1UOfficial && window.C1UOfficial.client.isEnabled(), null, { timeout: 10000 }).catch(() => {});
const ad = await page.evaluate(() => ({ pid: C1U.playerId, source: C1U.source, name: C1U.profile && C1U.profile.displayId, guest: C1U.guest, hook: !!window.C1UOfficial, enabled: window.C1UOfficial && window.C1UOfficial.client.isEnabled() }));
check("派對島｜身份", "自動接收 playerId 並經伺服器確認（不用重新輸入 ID、不用重選頭像、不用複製代碼）", ad.pid === A.playerId && ad.source === "url" && ad.name === "上線甲" && !ad.guest, JSON.stringify(ad));
check("派對島｜正式成績掛鉤", "載入新的成績掛鉤，且讀到後端正式成績已開啟", ad.hook && ad.enabled, JSON.stringify(ad));
await page.screenshot({ path: `${OUT}/launch-10-adventure-loaded.png` });
// 正式冒險：1-1 開始 → 取得場次（走遊戲自己的 advOnAttemptStart）
s0 = sessionsBefore();
const started = await page.evaluate(() => {
  try {
    advPlayMode = "official";
    const d = advLoad(); d.active = null; advSave(d);
    currentLevelIndex = LEVELS.findIndex((l) => l.stageId === "1-1");
    advOnAttemptStart();
    const run = advLoad().active;
    return { ok: !!run, status: run && run.status, cid: run && run.challengeId };
  } catch (e) { return { ok: false, err: String(e) }; }
});
await sleep(1200);
check("派對島｜場次", "正式冒險從 1-1 開始時取得伺服器場次（每趟一次）", started.ok && started.status === "in_progress" && sessionsBefore() === s0 + 1, JSON.stringify(started) + " sessions+" + (sessionsBefore() - s0));
minutes(20);
// 七關通關資料（模擬：不是手動玩完七關；結算計分與資格判定都是遊戲原本的程式）
const fin = await page.evaluate(() => {
  const d = advLoad(); const run = d.active;
  const C = ADV_RESOURCE_CATALOG.stages;
  OFFICIAL_ADVENTURE_STAGE_IDS.forEach((sid, i) => {
    const cat = C[sid] || {};
    const ids = (k) => (Array.isArray(cat[k]) ? cat[k].map((x) => (typeof x === "string" ? x : x.id)).filter(Boolean) : []);
    run.stageResults[sid] = { stageId: sid, clearedAt: Date.now(), clearSec: 70 + i * 5, coins: ids("coins").slice(0, Math.ceil(ids("coins").length / 2)), b260: [], round: [], roundSpawned: 0,
      enemies: { normal: ids("normal").slice(0, 1), big: [] }, explore: [], bossDefeated: sid === "2-4", hpLost: 1, bringDog: false, chain: { doubleKills: 0, impacts: 0, score: 0, keys: [] } };
  });
  run.currentStageId = "2-4"; run.lastAttemptCleared = true; run.live = null;
  advSave(d);
  currentLevelIndex = LEVELS.findIndex((l) => l.stageId === "2-4");
  advPlayMode = "official";
  advAfterClear();
  const snap = advLastSnapshot;
  return { total: snap && snap.total, complete: snap && snap.complete, testOnly: snap && snap.testOnly, eligible: c1uFinalCtx && c1uFinalCtx.eligible };
});
await page.waitForFunction(() => { const el = document.getElementById("c1u-official-result"); return el && !/正在/.test(el.textContent); }, null, { timeout: 15000 });
const advLine = await text(page, "#c1u-official-result");
const advBoard = H.db.get(`leaderboards/adventure/continent-1/${A.playerId}`) || {};
check("派對島｜第一大陸成績", "完整、正式通關 → 送出派對島自己算的大陸總分 → 伺服器接受並入第一大陸排行榜", fin.complete && fin.eligible && !fin.testOnly && /已記入正式排行榜/.test(advLine) && advBoard.score === fin.total, JSON.stringify(fin) + "｜" + advLine + "｜" + advBoard.score);
check("派對島｜V幣", "派對島沒有今日挑戰 +10；A 今天已領過 +30 → 不再加幣（仍是 50）", wallet(A.playerId).balance === 50 && ledgerOk(A.playerId), String(wallet(A.playerId).balance));
await page.screenshot({ path: `${OUT}/launch-11-adventure-final-official.png` });
// 練習模式不送
const practice = await page.evaluate(() => { const n = (window.C1UOfficial.client.pendingCount && window.C1UOfficial.client.pendingCount()) || 0; advPlayMode = "practice"; return n; });
const postsBeforePractice = H.apiCalls.filter((c) => c.startsWith("POST /v1/scores")).length;
await page.evaluate(() => { try { advAfterClear(); } catch (e) {} advPlayMode = "official"; });
await sleep(800);
check("派對島｜練習模式", "練習／王關重戰不送成績", H.apiCalls.filter((c) => c.startsWith("POST /v1/scores")).length === postsBeforePractice, String(practice));
// 回大廳
await page.evaluate(() => { const b = document.getElementById("btn-adv-final-lobby"); if (b) b.click(); else c1uGoLobby(); });
await page.waitForURL(/balloon-v-universe\/?(index\.html)?(\?.*)?$/, { timeout: 15000 });
await lobbyReady(page);
check("派對島｜回大廳", "按「回到遊戲宇宙大廳」回到大廳，仍是同一位玩家 A", (await text(page, "#playerCardId")) === "上線甲", await text(page, "#playerCardId"));
b = await openBoard(page, "adventure", "continent-1");
check("大廳｜派對島排行榜", "第一大陸排行榜顯示 A 的完整通關總分", b.rows.length === 1 && /上線甲/.test(b.rows[0]) && b.rows[0].includes(Number(fin.total).toLocaleString()), b.rows.join());
await page.screenshot({ path: `${OUT}/launch-12-leaderboard-adventure.png` });
await page.click("#lbClose");

/* ========== 5. 玩家 B：完全分開 ========== */
await page.evaluate((pid) => localStorage.setItem("bvUniverse_v2_currentPlayerId", pid), B.playerId);
await page.goto(LOBBY);
await lobbyReady(page);
await page.click("#signPass");
await page.waitForSelector("#passModal:not([hidden])");
await page.waitForFunction(() => /V幣紀錄/.test(document.getElementById("passTabBody").textContent), null, { timeout: 8000 }).catch(() => {});
const passB = await text(page, "#passTabBody");
check("A/B 隔離", "切換到 B：通行證 V幣 0、沒有 A 的紀錄", /上線乙/.test(passB) && /V幣\s*0/.test(passB) && /還沒有 V幣紀錄/.test(passB), passB.replace(/\n/g, "／").slice(0, 200));
await page.click("#passClose");
b = await openBoard(page, "tetris");
check("A/B 隔離", "排行榜仍顯示 A 的成績，但不會標成 B 的；顯示「B 還沒有成績」", b.rows.length === 1 && b.me === 0 && /上線乙」還沒有這個排行榜的成績/.test(b.text), b.text.replace(/\n/g, "／"));
await page.click("#lbClose");
await mainCtx.close();

/* ========== 6. 失敗情境 ========== */
// 6a. 回應遺失：伺服器已處理，SDK 自動重送同一筆 → 不重複加幣
{
  const { ctx, page: p } = await newPage();
  await p.goto(H.SITE + "universe/tetris/?bvPlayerId=" + B.playerId);
  await p.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady() && window.UniverseTetris.session.official.isEnabled(), null, { timeout: 15000 });
  await p.click("#btn-start"); await p.waitForSelector("#ov-btns button"); await p.click("#ov-btns button:nth-child(2)");
  await p.waitForFunction(() => running === true); await sleep(400);
  minutes(2);
  let lost = 0;
  H.apiFault.fn = (m, path) => (m === "POST" && path === "/v1/scores" && lost++ === 0 ? "loseResponse" : undefined);
  await p.evaluate(() => { for (let r = 0; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = (c === 4 ? null : "#3ecf8e"); cur = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff85a1" }; cx = 4; cy = -1; lock(); });
  await p.waitForFunction(() => /已記入正式排行榜|暫存|沒有記入/.test(document.getElementById("bv-result-note").textContent), null, { timeout: 15000 });
  H.apiFault.fn = null;
  const n = await text(p, "#bv-result-note");
  check("失敗｜回應遺失", "伺服器已寫入但回應遺失 → 自動重送同一筆 → 只入帳一次（B：30）", /已記入正式排行榜/.test(n) && wallet(B.playerId).balance === 30 && ledgerOk(B.playerId) && Object.keys(H.db.get("scores") || {}).filter((k) => H.db.get(`scores/${k}`).playerId === B.playerId).length === 1, n + "｜" + wallet(B.playerId).balance);
  // 6b. 斷線：三次都失敗 → 暫存 → 重新整理後自動補送
  await p.click("#btn-res-retry").catch(() => {});
  await p.evaluate(() => { if (!running) { const b = [...document.querySelectorAll("#ov-btns button")][1]; if (b) b.click(); else startGame("normal"); } });
  await p.waitForFunction(() => running === true, null, { timeout: 8000 }).catch(() => {});
  await sleep(400);
  minutes(2);
  H.apiFault.fn = (m, path) => (m === "POST" && path === "/v1/scores" ? "abort" : undefined);
  await p.evaluate(() => { for (let r = 0; r < 20; r++) for (let c = 0; c < 10; c++) board[r][c] = (c === 4 ? null : "#3ecf8e"); cur = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff85a1" }; cx = 4; cy = -1; lock(); });
  await p.waitForFunction(() => /暫存|沒有記入|已記入/.test(document.getElementById("bv-result-note").textContent), null, { timeout: 20000 });
  const q = await text(p, "#bv-result-note");
  const queued = await p.evaluate(() => window.UniverseTetris.session.official.pendingCount());
  H.apiFault.fn = null;
  await p.reload();
  await p.waitForFunction(() => window.UniverseTetris && window.UniverseTetris.isReady(), null, { timeout: 15000 });
  await p.waitForFunction(() => window.UniverseTetris.session.official.pendingCount() === 0, null, { timeout: 10000 }).catch(() => {});
  const scoresB = Object.values(H.db.get("scores") || {}).filter((s) => s.playerId === B.playerId);
  check("失敗｜斷線", "送出時斷線 → 成績暫存並提示；重新整理後自動補送成功（B 共 2 筆成績、V幣不重複）", /暫存/.test(q) && queued === 1 && scoresB.length === 2 && wallet(B.playerId).balance === 30 && ledgerOk(B.playerId), q + "｜queued " + queued + "｜scores " + scoresB.length);
  await ctx.close();
}
// 6c. 排行榜讀取失敗 → 錯誤訊息＋重試
{
  const { ctx, page: p } = await newPage();
  await seedLobby(p, [A], A.playerId);
  await lobbyReady(p);
  H.apiFault.fn = (m, path) => (path.startsWith("/v1/leaderboards/tetris") ? "abort" : undefined);
  await p.click("#signSelect"); await p.click('[data-lb-game="tetris"]');
  await p.waitForSelector("[data-lb-retry]", { timeout: 15000 });
  const err = await text(p, "#lbList");
  await p.screenshot({ path: `${OUT}/launch-13-leaderboard-error.png` });
  H.apiFault.fn = null;
  await p.click("[data-lb-retry]");
  await p.waitForFunction(() => document.querySelectorAll("#lbList .lb-row").length > 0, null, { timeout: 10000 });
  check("失敗｜排行榜", "讀取失敗顯示錯誤與「再試一次」，按下後成功顯示", /網路連線失敗|逾時/.test(err), err);
  await ctx.close();
}
// 6d. 跨站載入失敗：派對島載不到大廳的共用 SDK → 遊戲照常開啟，不送成績、不報錯中斷
{
  const { ctx, page: p } = await newPage();
  await ctx.route(/^https:\/\/vashyang1120\.github\.io\/balloon-v-universe\/universe\/shared\/universe-sdk\.js(\?.*)?$/, (r) => r.abort());
  await p.goto(RUSH_URL + "?bvPlayerId=" + A.playerId);
  await p.waitForFunction(() => typeof C1U !== "undefined" && typeof LEVELS !== "undefined", null, { timeout: 20000 });
  await sleep(1500);
  const st = await p.evaluate(() => ({ verify: C1U.verify, hook: !!window.C1UOfficial, canvas: !!document.querySelector("canvas") }));
  check("失敗｜跨站載入", "派對島載不到共用 SDK：遊戲仍可開啟（離線身份），成績掛鉤不啟用、不寫入", st.canvas && !st.hook && p.errors.filter((e) => !/BVUniverse/.test(e)).length === 0, JSON.stringify(st) + " errors:" + p.errors.join("|").slice(0, 120));
  await ctx.close();
}

/* ========== 6e. 管理後台：待審核 → 接受（補發 V幣、入榜）／拒絕；重複審核；CSV ========== */
{
  const C = await H.apiCreate("審核丙", "cat1");
  const D = await H.apiCreate("審核丁", "dog1");
  // C、D 各玩一首歌，但伺服器時間只過了幾秒（歌曲還沒播完就結算）→ 待審核
  for (const P of [C, D]) {
    const { ctx, page: p } = await newPage();
    await p.addInitScript(VCLOCK);
    await p.goto(H.SITE + "universe/rhythm/?bvPlayerId=" + P.playerId);
    await p.waitForFunction(() => window.UniverseRhythm && window.UniverseRhythm.isReady() && window.UniverseRhythm.session.official.isEnabled(), null, { timeout: 15000, polling: 100 });
    await p.click("#btn-play");
    await p.waitForFunction(() => SONGS.length > 0, null, { polling: 100 });
    await p.evaluate(() => { songIdx = SONGS.findIndex((s) => s.id === "song005"); renderSongCards(); });
    await p.click('#diff-wrap .db[data-d="easy"]');
    await p.click("#btn-start");
    await p.waitForFunction(() => G.running === true, null, { timeout: 30000, polling: 100 });
    await p.evaluate(() => {
      const K = ["d", "f", "j", "k"]; const ev = [];
      G.beatmap.forEach((b) => { const t = Math.round(b.t * 1000); const hold = (b.hold || 0) > 10 ? b.hold : (b.hold || 0) * 1000; ev.push([t, b.lane, "keydown"], [t + Math.max(50, hold + 30), b.lane, "keyup"]); });
      ev.sort((a, b) => a[0] - b[0]); let i = 0;
      for (let t = 0; t <= G.duration + 3000 && G.running; t += 16) { window.__vt = t / 1000; window.__frame(t); while (i < ev.length && ev[i][0] <= t) { const e = ev[i++]; document.dispatchEvent(new KeyboardEvent(e[2], { key: K[e[1]], bubbles: true })); } }
    });
    await p.waitForFunction(() => /審核中|已記入|未通過|沒有記入/.test(document.getElementById("bv-result-note").textContent), null, { timeout: 15000, polling: 100 });
    const n = await text(p, "#bv-result-note");
    check("審核｜待審核", `${P.displayId}：可疑成績（歌曲還沒播完就結算）→ 待審核，不入榜、不發 V幣`, /審核中/.test(n) && !H.db.get(`leaderboards/rhythm/song005--easy/${P.playerId}`) && wallet(P.playerId).balance === 0, n);
    if (P === C) await p.screenshot({ path: `${OUT}/launch-14-rhythm-pending.png` });
    await ctx.close();
  }
  const pendC = Object.values(H.db.get("scores")).find((x) => x.playerId === C.playerId), pendD = Object.values(H.db.get("scores")).find((x) => x.playerId === D.playerId);
  minutes(24 * 60);   // 隔天才審核：補發仍算原本遊玩那天
  const nowSec = Math.floor((Date.now() + H.clock.offset) / 1000);   // 憑證時間跟著（往前撥的）伺服器時間
  const token = await helpers.makeIdToken(ADMIN_KEY, { iat: nowSec - 30, auth_time: nowSec - 60, exp: nowSec + 3600 });
  const FAKE_APP = "export function initializeApp(){ return {}; }";
  const FAKE_AUTH = `const TOKEN=${JSON.stringify(token)}; const L=[]; const A={currentUser:null};
    export function getAuth(){ return A; } export const inMemoryPersistence={}; export async function setPersistence(){}
    export class GoogleAuthProvider{ setCustomParameters(){} }
    export function onAuthStateChanged(a,cb){ L.push(cb); setTimeout(()=>cb(A.currentUser),0); }
    export async function signInWithPopup(){ A.currentUser={ uid:${JSON.stringify(helpers.ADMIN_UID)}, email:"admin@example.test", providerData:[{providerId:"google.com"}], getIdToken: async()=>TOKEN }; L.forEach(f=>f(A.currentUser)); }
    export async function signOut(){ A.currentUser=null; L.forEach(f=>f(null)); }`;
  const { ctx, page: p } = await newPage({ viewport: { width: 1280, height: 900 } });
  await ctx.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_APP }));
  await ctx.route("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js", (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_AUTH }));
  await p.goto(H.SITE + "universe/admin/");
  await p.waitForFunction(() => !document.getElementById("btnLogin").disabled, null, { timeout: 10000 });
  const pre = await p.evaluate(() => ({ area: document.getElementById("adminArea").classList.contains("hidden"), html: document.documentElement.outerHTML }));
  check("審核｜登入", "未登入前看不到管理功能；頁面沒有寫死任何密碼或 PIN", pre.area && !/password|密碼\s*[:=]|PIN\s*[:=]/i.test(pre.html.replace(/沒有任何密碼|沒有任何密碼或 PIN/g, "")), "");
  await p.click("#btnLogin");
  await p.waitForFunction(() => !document.getElementById("adminArea").classList.contains("hidden"), null, { timeout: 10000 });
  await p.waitForFunction(() => document.querySelectorAll("#scoreTable tbody tr").length >= 2, null, { timeout: 10000 }).catch(() => {});
  await sleep(600);
  const list = await p.evaluate(() => [...document.querySelectorAll("#scoreTable tbody tr")].map((r) => r.innerText.replace(/\s+/g, " ")));
  check("審核｜列表", "伺服器確認管理員後，列出待審核成績與異常原因", list.length === 2 && list.every((r) => /待審核/.test(r) && /rhythm_too_short/.test(r)), list.join("｜"));
  await p.screenshot({ path: `${OUT}/launch-15-admin-pending.png`, fullPage: true });
  // 接受 C
  await p.click(`button[data-sid="${pendC.submissionId}"]`);
  await p.waitForSelector("#reviewBox:not(.hidden)");
  await p.fill("#rNote", "家長在旁邊確認是真的玩完");
  await p.click("#btnAccept");
  await p.waitForFunction(() => /已接受|審核過/.test(document.getElementById("reviewStatus").textContent), null, { timeout: 10000 });
  const accTxt = await text(p, "#reviewStatus");
  const txC = Object.values(wallet(C.playerId).ledger || {});
  check("審核｜接受", "接受後列入排行榜，並依「原本遊玩日期」補發 V幣（每日 +30＋今日挑戰 +10）", /已接受/.test(accTxt) && !!H.db.get(`leaderboards/rhythm/song005--easy/${C.playerId}`) && wallet(C.playerId).balance === 40 && txC.length === 2 && txC.every((t) => t.dateKey === pendC.rewardDate) && ledgerOk(C.playerId), accTxt + "｜" + JSON.stringify(txC.map((t) => t.dateKey + ":" + t.amount)));
  await p.screenshot({ path: `${OUT}/launch-16-admin-accepted.png`, fullPage: true });
  // 重複審核（直接再送一次 API）→ 不重複發
  const again = await p.evaluate(async ({ sid, api }) => { const r = await fetch(api + "/v1/admin/scores/" + sid + "/review", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + (await (await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js")).getAuth().currentUser.getIdToken()) }, body: JSON.stringify({ decision: "accept" }) }); return r.json(); }, { sid: pendC.submissionId, api: H.API });
  const flip = await p.evaluate(async ({ sid, api }) => { const r = await fetch(api + "/v1/admin/scores/" + sid + "/review", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + (await (await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js")).getAuth().currentUser.getIdToken()) }, body: JSON.stringify({ decision: "reject" }) }); return r.status; }, { sid: pendC.submissionId, api: H.API });
  check("審核｜重複審核", "同一筆再按接受：不重複入帳；已接受的不能改成拒絕（409）", again.ok && again.data.replayed === true && wallet(C.playerId).balance === 40 && flip === 409, JSON.stringify(again).slice(0, 120) + " flip " + flip);
  // 拒絕 D
  await p.selectOption("#fStatus", "pending_review"); await p.click("#btnSearch");
  await p.waitForFunction((sid) => !!document.querySelector(`button[data-sid="${sid}"]`), pendD.submissionId, { timeout: 10000 });
  await p.click(`button[data-sid="${pendD.submissionId}"]`);
  await p.waitForSelector("#reviewBox:not(.hidden)");
  await p.click("#btnReject");
  await p.waitForFunction(() => /已拒絕/.test(document.getElementById("reviewStatus").textContent), null, { timeout: 10000 });
  check("審核｜拒絕", "拒絕後不入榜、不發 V幣", !H.db.get(`leaderboards/rhythm/song005--easy/${D.playerId}`) && wallet(D.playerId).balance === 0, "");
  // 帳本查詢
  await p.fill("#wPlayer", C.playerId); await p.click("#btnLedger");
  await p.waitForFunction(() => /餘額/.test(document.getElementById("ledgerStatus").textContent), null, { timeout: 10000 });
  check("審核｜V幣帳本", "依 playerId 查詢帳本：餘額與帳本合計一致", /餘額 40｜帳本 2 筆，合計 40（一致）/.test(await text(p, "#ledgerStatus")), await text(p, "#ledgerStatus"));
  await p.click("#btnAudits"); await sleep(500);
  const audits = await p.evaluate(() => [...document.querySelectorAll("#auditTable tbody tr")].map((r) => r.innerText.replace(/\s+/g, " ")));
  check("審核｜審核紀錄", "審核紀錄列出接受與拒絕各一筆（含備註，只在後台）", audits.length === 2 && audits.some((a) => /接受/.test(a) && /家長/.test(a)) && audits.some((a) => /拒絕/.test(a)), audits.join("｜"));
  // CSV 匯出
  await p.selectOption("#fStatus", ""); await p.click("#btnSearch"); await sleep(500);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click("#btnCsvScores")]);
  const csvPath = path.join(OUT, "admin-scores-export.csv");
  await dl.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  await p.fill("#wPlayer", "");   // 不填 playerId → 匯出全部帳本
  const [dl2] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click("#btnCsvLedger")]);
  const ledPath = path.join(OUT, "admin-ledger-export.csv");
  await dl2.saveAs(ledPath);
  const led = fs.readFileSync(ledPath, "utf8").replace(/^﻿/, "").trim().split("\r\n");
  const nScores = Object.keys(H.db.get("scores")).length;
  check("審核｜CSV", `成績 CSV（${nScores} 筆＋標題）與 V幣帳本 CSV 可下載，內容與伺服器一致`, csv.length === nScores + 1 && /^submissionId,receivedAt,gameId,playerId/.test(csv[0]) && led.length - 1 === Object.values(H.db.get("wallets")).reduce((s, w) => s + Object.keys(w.ledger || {}).length, 0), `scores ${csv.length - 1}｜ledger ${led.length - 1}`);
  await ctx.close();
  // 非管理員：沒有登入憑證 → 401
  const r401 = await H.app.fetch(new Request(H.API + "/v1/admin/scores", { headers: { origin: H.ORIGIN } }), H.env);
  check("審核｜權限", "沒有管理員憑證不能使用管理 API（401）", r401.status === 401, String(r401.status));
}

/* ========== 7. 視窗 ========== */
for (const vp of [{ w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 390, h: 844, mobile: true }, { w: 360, h: 640, mobile: true }]) {
  const { ctx, page: p } = await newPage({ viewport: { width: vp.w, height: vp.h }, mobile: !!vp.mobile });
  await seedLobby(p, [A, B], A.playerId);
  await lobbyReady(p);
  await sleep(500);
  const sg = await p.evaluate(() => { const r = document.getElementById("signSelect").getBoundingClientRect(); return { vis: r.width > 0 && r.bottom <= innerHeight + 1 && r.left >= -1, text: document.querySelector("#signSelect .sign__text").textContent }; });
  await p.screenshot({ path: `${OUT}/launch-vp-${vp.w}x${vp.h}-lobby.png` });
  await p.click("#signSelect");
  await p.waitForSelector("#lbModal:not([hidden])");
  await p.click('[data-lb-game="quiz"]');
  await p.waitForFunction(() => document.querySelectorAll("#lbList .lb-row").length > 0 || /還沒有/.test((document.getElementById("lbList") || {}).textContent || ""), null, { timeout: 10000 });
  const off = await offscreenButtons(p, "#lbModal"), hs = await hasHorizontalScroll(p);
  await p.screenshot({ path: `${OUT}/launch-vp-${vp.w}x${vp.h}-leaderboard.png` });
  check("視窗", `${vp.w}×${vp.h}：排行榜木牌可見；排行榜視窗按鈕都在畫面內、沒有水平捲動`, sg.vis && sg.text === "排行榜" && off.length === 0 && !hs, JSON.stringify(sg) + " " + off.join(","));
  await ctx.close();
}
{
  const { ctx, page: p } = await newPage({ viewport: { width: 844, height: 390 }, mobile: true });
  await p.goto(RUSH_URL + "?bvPlayerId=" + A.playerId);
  await p.waitForFunction(() => typeof C1U !== "undefined" && C1U.verify === "ok", null, { timeout: 20000 });
  await sleep(1500);
  const hs = await hasHorizontalScroll(p);
  await p.screenshot({ path: `${OUT}/launch-vp-844x390-adventure-landscape.png` });
  check("視窗", "派對島手機橫向 844×390：遊戲開啟、身份確認、沒有水平捲動", !hs, String(hs));
  await ctx.close();
}

/* ========== 安全 ========== */
check("安全", "沒有連到舊 Firebase 或其他未允許的外部網址", H.external.filter((u) => !/fonts|youtube|ytimg/.test(u)).length === 0, H.external.slice(0, 5).join(" "));
check("安全", "沒有任何前端寫入 V幣的 API（只有 sessions／scores；錢包只有 GET）", !H.apiCalls.some((c) => /^(POST|PUT|PATCH|DELETE) \/v1\/wallet/.test(c)), "");
const ok = await H.finish("launch-e2e");
process.exit(ok ? 0 : 1);

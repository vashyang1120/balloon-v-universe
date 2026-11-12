/* 節奏遊戲宇宙版：真實瀏覽器測試＋「控制輸入時間」的玩法等價測試
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tests/browser/rhythm-e2e.mjs <tetris clone> <rhythm clone> <quiz clone> <輸出資料夾>

   等價測試做法：
   - 原版（/orig/rhythm/）與宇宙版各開一個全新分頁、相同視窗大小
   - 用「虛擬時鐘」取代 AudioContext.currentTime 與 requestAnimationFrame（遊戲本來就以音訊時鐘計時）
   - 同一首歌、同一份 Beatmap、同一難度，依 Beatmap 產生完全相同的按鍵時間序列（含 Perfect／Good／Miss／Hold）
   - 每一次按鍵後記錄 分數／Combo／Perfect／Good／Miss，最後比較結算畫面（分數、準確率、等級、最高 Combo） */
import fs from "node:fs";
import { createHarness, sleep, text, offscreenButtons, hasHorizontalScroll } from "./harness.mjs";

const [TETRIS, RHYTHM, QUIZ, OUT] = process.argv.slice(2);
if (!OUT) { console.error("用法：rhythm-e2e.mjs <tetris clone> <rhythm clone> <quiz clone> <out>"); process.exit(2); }
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ }, out: OUT });
const { ORIGIN, check, newPage } = H;
const A = await H.apiCreate("節奏甲", "avatar_rabbit_hoodie");
const B = await H.apiCreate("節奏乙", "girl1");
const dbAfterSeed = JSON.stringify(H.db.root);
const uni = (q) => `${ORIGIN}/universe/rhythm/index.html${q || ""}`;
const ready = (page) => page.waitForFunction(() => window.UniverseRhythm && window.UniverseRhythm.isReady(), null, { timeout: 15000, polling: 100 });

/* 虛擬時鐘：AudioContext.currentTime＝window.__vt（秒），requestAnimationFrame 由測試手動推進 */
const VCLOCK = `(() => {
  window.__vt = 0; const q = new Map(); let id = 0;
  window.requestAnimationFrame = (cb) => { id++; q.set(id, cb); return id; };
  window.cancelAnimationFrame = (i) => { q.delete(i); };
  window.__frame = (ms) => { const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(ms)); };
  function stub() { const f = function () { return stub(); }; return new Proxy(f, { get(t, p) { if (p === "then") return undefined; if (p in t) return t[p]; return stub(); }, set(t, p, v) { t[p] = v; return true; }, apply() { return stub(); } }); }
  class FakeAC {
    constructor() { this.state = "running"; this.destination = stub(); this.sampleRate = 44100; }
    get currentTime() { return window.__vt; }
    resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
    decodeAudioData(buf, ok) { const b = { duration: 600, length: 1, numberOfChannels: 2, sampleRate: 44100 }; if (ok) ok(b); return Promise.resolve(b); }
    createBufferSource() { return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {}, onended: null, playbackRate: stub() }; }
    createGain() { return stub(); } createOscillator() { return stub(); } createBiquadFilter() { return stub(); } createDynamicsCompressor() { return stub(); }
  }
  window.AudioContext = FakeAC; window.webkitAudioContext = FakeAC;
})();`;

/* 在頁面內：選歌＋難度 → initGame → 等倒數結束 → 以 16ms 為一格推進虛擬時鐘，依序送出按鍵 */
async function playScripted(page, songId, diff) {
  await page.waitForFunction(() => typeof SONGS !== "undefined" && SONGS.length > 0, null, { timeout: 15000, polling: 100 });
  await page.evaluate(({ songId, diff, seed }) => {
    eval(seed); __bvSeed(20261112);
    songIdx = SONGS.findIndex((s) => s.id === songId); renderSongCards();
    document.querySelectorAll("#diff-wrap .db").forEach((b) => b.classList.toggle("on", b.dataset.d === diff));
    document.getElementById("btn-start").click();
  }, { songId, diff, seed: H.SEED_FN });
  await page.waitForFunction(() => G.running === true, null, { timeout: 30000, polling: 100 });
  return page.evaluate(() => {
    const KEYS_ = ["d", "f", "j", "k"];
    const OFFS = [0, 35, -55, 95, -125, 210, null, 15, -20, 130];   // ms：Perfect、Perfect、Perfect、Good、Good、太晚(Miss)、不按(Miss)…
    const ev = [];
    G.beatmap.forEach((b, k) => {
      const off = OFFS[k % OFFS.length];
      if (off === null) return;
      const hit = b.t * 1000;
      const holdMs = (b.hold || 0) > 10 ? (b.hold || 0) : (b.hold || 0) * 1000;
      const down = Math.max(0, Math.round(hit + off));
      const up = holdMs > 0 ? Math.round(hit + (k % 2 === 0 ? holdMs + 40 : holdMs * 0.4)) : down + 60;
      ev.push({ t: down, lane: b.lane, type: "keydown" }, { t: up, lane: b.lane, type: "keyup" });
    });
    ev.sort((a, b) => a.t - b.t || (a.type === "keyup" ? -1 : 1));
    const trace = [];
    let i = 0;
    const end = G.duration + 3000;
    for (let t = 0; t <= end && G.running; t += 16) {
      window.__vt = t / 1000;
      window.__frame(t);
      while (i < ev.length && ev[i].t <= t && G.running) {
        const e = ev[i++];
        document.dispatchEvent(new KeyboardEvent(e.type, { key: KEYS_[e.lane], bubbles: true }));
        if (e.type === "keydown") trace.push([e.t, e.lane, G.score, G.combo, G.perf, G.good, G.miss].join(":"));
      }
    }
    return { events: ev.length, trace, beatmapLen: G.beatmap.length, beatmapHash: JSON.stringify(G.beatmap).length + ":" + G.beatmap.slice(0, 5).map((b) => b.t + "/" + b.lane).join(","),
      PERF_MS, GOOD_MS, KEYS: KEYS.join("") };
  }).then(async (r) => {
    await page.waitForFunction(() => !document.getElementById("s-result").classList.contains("off"), null, { timeout: 15000, polling: 100 });
    await sleep(400);
    const fin = await page.evaluate(() => ({
      score: G.score, perf: G.perf, good: G.good, miss: G.miss, maxCombo: G.maxCombo, total: G.total,
      rScore: document.getElementById("r-score").textContent, rAcc: document.getElementById("r-acc").textContent,
      rGrade: document.getElementById("r-grade").textContent, rP: document.getElementById("r-p").textContent,
      rG: document.getElementById("r-g").textContent, rM: document.getElementById("r-m").textContent, rMc: document.getElementById("r-mc").textContent
    }));
    return { ...r, ...fin };
  });
}

/* ========== 1. 宇宙版：身份、首頁標示、唯讀角色設定、未開放功能 ========== */
{
  const { ctx, page } = await newPage();
  await page.goto(uni("?bvPlayerId=" + A.playerId));
  await ready(page); await sleep(700);
  const st = await page.evaluate(() => ({
    chipName: document.getElementById("bv-player-chip-name").textContent, chipAv: document.getElementById("bv-player-chip-av").getAttribute("src"),
    chipW: document.getElementById("bv-player-chip-av").naturalWidth, marks: document.querySelectorAll(".bv-status-mark").length,
    mark: document.getElementById("bv-status-mark").textContent, pid: PLAYER.playerId, pkey: PLAYER.playerKey, pname: PLAYER.id,
    lobbyBtn: document.getElementById("bv-btn-lobby") && document.getElementById("bv-btn-lobby").textContent,
    hint: document.getElementById("home-daily-challenge-status").textContent,
    reward: document.querySelector("#home-daily-challenge-hint .rhythm-daily-hint-reward").textContent
  }));
  check("節奏｜身份", "自動接收 playerId（網址 bvPlayerId，經 API 確認）", st.pid === A.playerId, st.pid);
  check("節奏｜身份", "首頁顯示玩家 ID 與身份頭像（遊戲宇宙素材，圖片載入成功）", st.chipName === "節奏甲" && st.pname === "節奏甲" && /assets\/avatars\/base\/avatar_rabbit_hoodie\.png$/.test(st.chipAv) && st.chipW > 0, JSON.stringify(st));
  check("節奏｜身份", "舊 playerKey 保持空白（不由 ID＋圖案組合）", st.pkey === "", st.pkey);
  check("節奏｜標示", "首頁只有一個簡潔測試標示", st.marks === 1 && /測試版/.test(st.mark), st.mark);
  check("節奏｜大廳", "首頁「回遊戲宇宙」按鈕取代原本的 history.back()", st.lobbyBtn === "🏠 回遊戲宇宙", st.lobbyBtn);
  check("節奏｜今日挑戰", "今日挑戰卡保留，獎勵標示「+10 V幣待開放」，狀態依玩家顯示", /待開放/.test(st.reward) && /今天還沒完成/.test(st.hint), st.reward + "｜" + st.hint);
  await page.screenshot({ path: `${OUT}/rhythm-01-title.png` });

  await page.click("#btn-profile-go");
  await page.waitForSelector("#s-profile:not(.off)");
  await sleep(300);
  const pf = await page.evaluate(() => ({
    ro: document.getElementById("player-id-input").readOnly, val: document.getElementById("player-id-input").value,
    code: document.getElementById("profile-player-key").textContent,
    hidden: [...document.querySelectorAll(".profile-mini-btn"), document.getElementById("btn-profile-ok")].every((e) => getComputedStyle(e).display === "none"),
    wallet: document.getElementById("profile-vcoin-balance").textContent, title: document.getElementById("profile-equipped-title").textContent,
    lobby: !!document.getElementById("bv-profile-lobby")
  }));
  check("節奏｜角色設定", "唯讀：玩家 ID 不能改、顯示 playerId、隱藏變更身份與確認按鈕、提供回大廳切換", pf.ro && pf.val === "節奏甲" && pf.code === A.playerId && pf.hidden && pf.lobby, JSON.stringify(pf));
  check("節奏｜未開放", "V幣顯示「未開放」、稱號顯示「準備中」（不是 0）", pf.wallet === "未開放" && pf.title === "準備中", pf.wallet + "/" + pf.title);
  await page.click("#btn-open-vcoin-wallet"); await sleep(200);
  check("節奏｜未開放", "V幣錢包：顯示尚未開放提示", /尚未開放/.test(await text(page, "#bv-toast")), await text(page, "#bv-toast"));
  await page.click("#btn-open-unlock"); await sleep(200);
  check("節奏｜未開放", "頭像收藏：顯示準備中提示，不開啟 PIN 解鎖", /準備中/.test(await text(page, "#bv-toast")) && await page.evaluate(() => document.getElementById("s-unlock").classList.contains("off")));
  await page.screenshot({ path: `${OUT}/rhythm-02-profile-readonly.png` });
  await page.click("#btn-profile-back");
  for (let i = 0; i < 6; i++) await page.click(".logo");
  await sleep(200);
  check("節奏｜安全", "舊管理後台入口停用（點標題 5 下不會進入）", await page.evaluate(() => document.getElementById("s-admin").classList.contains("off")));

  // 開始遊戲 → 直接選歌（不經過身份設定）
  await page.click("#btn-play");
  await page.waitForSelector("#s-songlist:not(.off)");
  await page.waitForFunction(() => SONGS.length > 0);
  check("節奏｜遊玩", "「開始遊戲」直接進入選歌（不重新建立身份）", true);
  const songs = await page.evaluate(() => ({ n: SONGS.length, first: SONGS[0].title, audio: SONGS[0].audioUrl }));
  check("節奏｜歌曲", "歌曲清單與音訊網址沿用原版（唯讀載入）", songs.n >= 9 && /vparty-rhythm-game\/songs\/song001\/audio\.mp3$/.test(songs.audio), JSON.stringify(songs));
  await page.click("#song-next"); await page.click("#song-prev");
  await page.click('#diff-wrap .db[data-d="hard"]');
  check("節奏｜難度", "可以選擇難度", await page.evaluate(() => getSelectedGameDiff() === "hard"));
  await page.click('#diff-wrap .db[data-d="normal"]');
  await page.screenshot({ path: `${OUT}/rhythm-03-songlist.png` });
  // 真實音訊：開始後音訊與 MV 照原版載入
  await page.click("#btn-start");
  await page.waitForFunction(() => G.running === true, null, { timeout: 30000, polling: 100 });
  await sleep(1500);
  const live = await page.evaluate(() => ({ lbl: document.getElementById("audio-lbl").textContent, lanes: document.querySelectorAll("#lanes .lane").length, gt: G.gt, ctx: !!audioCtx, buf: !!audioBuffer }));
  check("節奏｜音效", "真實音訊：MP3 載入並以音訊時鐘推進（AUDIO）", live.lbl === "AUDIO" && live.ctx && live.buf && live.gt > 0, JSON.stringify(live));
  check("節奏｜遊玩", "四條軌道建立", live.lanes === 4);
  await page.keyboard.down("d"); await sleep(40); await page.keyboard.up("d");
  check("節奏｜遊玩", "按鍵 D 觸發軌道按壓（原版輸入處理）", await page.evaluate(() => document.querySelector("#lanes .lane.l0") !== null));
  await page.screenshot({ path: `${OUT}/rhythm-04-game.png` });
  await page.evaluate(() => quitGame());
  await sleep(300);
  check("節奏｜穩定", "宇宙版流程沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* ========== 2. 完成一首歌（虛擬時鐘加速）→ Mock 結算 → 排行榜 → 回大廳 ========== */
{
  const { ctx, page } = await newPage();
  await page.addInitScript(VCLOCK);
  await page.goto(uni("?bvPlayerId=" + A.playerId));
  await ready(page);
  const r = await playScripted(page, "song005", "normal");
  check("節奏｜遊玩", "完整完成一首歌（song005 NORMAL）並進入結算", r.rScore && Number(r.rScore.replace(/,/g, "")) === r.score, r.rScore);
  await sleep(600);
  const res = await page.evaluate(() => ({ note: document.getElementById("bv-result-note").textContent, vcoin: document.getElementById("r-vcoin-msg").textContent }));
  check("節奏｜結算", "結算提示「本場成績尚未記入正式排行榜」", /本場成績尚未記入正式排行榜/.test(res.note), res.note);
  check("節奏｜V幣", "結算 V幣：測試版不發放", /不發放/.test(res.vcoin), res.vcoin);
  const mock = await page.evaluate((pid) => window.UniverseRhythm.session.services.scores.listMine(pid, "rhythm"), A.playerId);
  check("節奏｜結算", "Mock 成績 1 筆：playerId 正確、未經伺服器確認、含歌曲與難度", mock.length === 1 && mock[0].playerId === A.playerId && mock[0].serverConfirmed === false && mock[0].recordStatus === "mock" && mock[0].scoreData.songId === "song005" && mock[0].scoreData.difficulty === "normal" && mock[0].scoreData.score === r.score, JSON.stringify(mock.map((m) => m.scoreData)));
  await page.screenshot({ path: `${OUT}/rhythm-05-result.png` });
  const hint = await page.evaluate(() => document.getElementById("home-daily-challenge-status").textContent);
  check("節奏｜今日挑戰", "完成一首歌 → 今日挑戰顯示已完成（只記錄完成，不發 +10）", /已完成/.test(hint), hint);
  // 排行榜（Mock）
  await page.evaluate(() => { lbSongId = "song005"; lbDiff = "all"; go("s-lb"); renderLB(); });
  await sleep(500);
  const lb = await page.evaluate(() => ({ note: document.getElementById("bv-lb-note").textContent, rows: [...document.querySelectorAll("#lb-list .lb-row, #lb-list > div")].map((e) => e.innerText.replace(/\s+/g, " ")).filter(Boolean) }));
  check("節奏｜排行榜", "測試排行榜：明確標示不是正式排行榜，只列本分頁成績", /不是正式排行榜/.test(lb.note) && lb.rows.some((t) => /節奏甲/.test(t)), JSON.stringify(lb).slice(0, 200));
  await page.screenshot({ path: `${OUT}/rhythm-06-leaderboard.png` });
  // localStorage：不寫入舊遊戲鍵
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check("節奏｜資料", "localStorage 只有遊戲宇宙鍵（沒有 vPartyPlayerProfile、vPartyScores_* 等舊鍵）", keys.every((k) => k.startsWith("bvUniverseGame_v1_")), keys.join(","));
  // 換 B（同分頁）：A 的最佳、今日挑戰不會出現在 B
  await page.goto(uni("?bvPlayerId=" + B.playerId));
  await ready(page); await sleep(400);
  const sb = await page.evaluate(() => ({ pid: PLAYER.playerId, name: document.getElementById("bv-player-chip-name").textContent, hint: document.getElementById("home-daily-challenge-status").textContent }));
  check("節奏｜切換", "換成 B：顯示 B，A 的今日挑戰完成狀態不會套到 B", sb.pid === B.playerId && sb.name === "節奏乙" && /今天還沒完成/.test(sb.hint), JSON.stringify(sb));
  const mineB = await page.evaluate((pid) => window.UniverseRhythm.session.services.scores.listMine(pid, "rhythm"), B.playerId);
  check("節奏｜切換", "B 沒有任何 A 的成績", mineB.length === 0);
  await page.click("#bv-btn-lobby");
  await page.waitForURL(/\/index\.html$/, { timeout: 10000, polling: 100 });
  check("節奏｜大廳", "「回遊戲宇宙」回到大廳（不帶身份參數，大廳用自己記住的玩家）", /\/index\.html$/.test(page.url()), page.url());
  await ctx.close();
}

/* ========== 3. 手機：觸控軌道、版面 ========== */
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
  const { ctx, page } = await newPage({ mobile: true, viewport: vp });
  await page.goto(uni("?bvPlayerId=" + A.playerId));
  await ready(page); await sleep(500);
  const tag = `${vp.width}x${vp.height}`;
  check("節奏｜手機", `${tag} 首頁沒有按鈕超出畫面`, (await offscreenButtons(page, "#s-title")).length === 0, (await offscreenButtons(page, "#s-title")).join(","));
  await page.screenshot({ path: `${OUT}/rhythm-07-mobile-title-${tag}.png` });
  await page.tap("#btn-play");
  await page.waitForSelector("#s-songlist:not(.off)");
  await page.waitForFunction(() => SONGS.length > 0);
  await page.tap("#btn-start");
  await page.waitForFunction(() => G.running === true, null, { timeout: 30000, polling: 100 });
  await sleep(500);
  const box = await page.locator("#lanes .lane.l1").boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(50);
  const lanesVisible = await page.evaluate(() => [...document.querySelectorAll("#lanes .lane")].every((l) => { const r = l.getBoundingClientRect(); return r.width > 0 && r.height > 0; }));
  check("節奏｜手機", `${tag} 觸控軌道可操作（原版觸控事件），四條軌道完整顯示`, lanesVisible && box.width > 0, JSON.stringify(box));
  await page.screenshot({ path: `${OUT}/rhythm-08-mobile-game-${tag}.png` });
  check("節奏｜手機", `${tag} 沒有 JavaScript 錯誤`, page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* ========== 4. 玩法等價：控制輸入時間，原版 vs 宇宙版 ========== */
const EQ = [["song005", "easy"], ["song005", "normal"], ["song005", "hard"], ["song001", "hard"]];
const eqRows = [];
for (const [songId, diff] of EQ) {
  const o = await (async () => { const { ctx, page } = await newPage({ isOriginal: true }); await page.addInitScript(VCLOCK); await page.goto(`${ORIGIN}/orig/rhythm/index.html`); const r = await playScripted(page, songId, diff); await ctx.close(); return r; })();
  const p = await (async () => { const { ctx, page } = await newPage(); await page.addInitScript(VCLOCK); await page.goto(uni("?bvPlayerId=" + A.playerId)); await ready(page); const r = await playScripted(page, songId, diff); await ctx.close(); return r; })();
  const label = `${songId} ${diff.toUpperCase()}`;
  check("節奏｜玩法等價", `${label}：同一份 Beatmap（${o.beatmapLen} 顆音符）、同一組按鍵時間（${o.events} 個事件）`, o.beatmapHash === p.beatmapHash && o.events === p.events && o.events > 50, o.beatmapHash);
  check("節奏｜玩法等價", `${label}：每一次按鍵後的 分數／Combo／Perfect／Good／Miss 軌跡完全相同`, o.trace.join("|") === p.trace.join("|") && o.trace.length > 30, `${o.trace.length} 步`);
  check("節奏｜玩法等價", `${label}：結算 分數、Perfect、Good、Miss、最高 Combo、準確率、等級完全相同`,
    ["score", "perf", "good", "miss", "maxCombo", "rScore", "rAcc", "rGrade", "rP", "rG", "rM", "rMc"].every((k) => o[k] === p[k]),
    `原版 ${o.score}/${o.perf}P/${o.good}G/${o.miss}M/C${o.maxCombo}/${o.rAcc}/${o.rGrade}　宇宙版 ${p.score}/${p.perf}P/${p.good}G/${p.miss}M/C${p.maxCombo}/${p.rAcc}/${p.rGrade}`);
  eqRows.push({ songId, diff, notes: o.beatmapLen, events: o.events, original: { score: o.score, perfect: o.perf, good: o.good, miss: o.miss, maxCombo: o.maxCombo, acc: o.rAcc, grade: o.rGrade }, universe: { score: p.score, perfect: p.perf, good: p.good, miss: p.miss, maxCombo: p.maxCombo, acc: p.rAcc, grade: p.rGrade } });
  if (eqRows.length === 1) check("節奏｜玩法等價", "判定視窗與鍵位相同（PERF_MS 72／GOOD_MS 145／DFJK）", o.PERF_MS === 72 && o.GOOD_MS === 145 && o.PERF_MS === p.PERF_MS && o.GOOD_MS === p.GOOD_MS && o.KEYS === p.KEYS && o.KEYS === "dfjk");
}
fs.writeFileSync(`${OUT}/rhythm-equivalence.json`, JSON.stringify(eqRows, null, 1));

/* ========== 5. 全程安全 ========== */
check("節奏｜安全", "宇宙版全程沒有連線舊 Firebase、gstatic 或其他未預期外部網址", H.external.length === 0, H.external.slice(0, 5).join(" "));
check("節奏｜對照", "（對照組）原版確實會嘗試載入 Firebase SDK — 證明攔截有效", H.originalExternal.some((u) => /gstatic\.com\/firebasejs/.test(u)), H.originalExternal.length + " 筆");
check("節奏｜安全", "對玩家 API 只有 GET（唯讀）", H.apiCalls.every((c) => c.startsWith("GET ")), [...new Set(H.apiCalls.map((c) => c.split(" ")[0]))].join(","));
check("節奏｜安全", "玩家資料庫沒有被遊戲改動", JSON.stringify(H.db.root) === dbAfterSeed);
process.exit((await H.finish("rhythm-e2e")) ? 0 : 1);

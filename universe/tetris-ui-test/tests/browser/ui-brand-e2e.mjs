/* 方塊派對 UI 測試版 第二階段品牌視覺（v0.2.0-test-1 起；v0.2.1-test-1 美術強化）瀏覽器測試
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tetris-ui-test/tests/browser/ui-brand-e2e.mjs <vparty-tetris clone> <vparty-rhythm-game clone> [截圖資料夾] [第一階段基準 worktree]

   Playwright + Chromium「模擬」手機，不是實機。後端「正式成績／V幣」刻意設為開啟，並建立一位真的玩家，
   證明測試版在這種情況下仍然不送出任何請求。
   第四個參數（可省略）：上一版（v0.2.1 時為 v0.2.0-test-1，af3f48d）的 checkout，用來逐像素比對遊戲中 HUD 幾何與配色。 */
import fs from "node:fs";
import path from "node:path";
import { createHarness, sleep } from "../../../tests/browser/harness.mjs";

const [, , TETRIS, RHYTHM, OUT = "/tmp/tetris-ui-brand-e2e", BASE_ROOT] = process.argv;
if (!TETRIS || !RHYTHM) { console.error("用法：node ui-brand-e2e.mjs <vparty-tetris clone> <vparty-rhythm-game clone> [截圖資料夾] [基準 worktree]"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const clones = { tetris: TETRIS, rhythm: RHYTHM, quiz: TETRIS };
const H = await createHarness({ clones, out: OUT, flags: { SCORES_ENABLED: "on", REWARDS_ENABLED: "on" } });
const { check, note } = H;
const URL_ = H.SITE + "universe/tetris-ui-test/";
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });
const realPlayer = await H.apiCreate("真的玩家", "girl1");
H.apiCalls.length = 0;
const nonGet = [];
const bad = [];   // 4xx／5xx 或載入失敗的素材

async function open(w, h, opts = {}) {
  const { page, ctx } = await H.newPage({ viewport: { width: w, height: h }, mobile: opts.mobile !== false });
  page.on("request", (r) => { if (r.method() !== "GET" && r.method() !== "HEAD") nonGet.push(r.method() + " " + r.url()); });
  page.on("response", (r) => { if (r.status() >= 400 && !/fonts\.g/.test(r.url())) bad.push(r.status() + " " + r.url()); });
  page.on("requestfailed", (r) => { if (!/fonts\.g/.test(r.url())) bad.push("failed " + r.url()); });
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(URL_ + (opts.search || ""));
  await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady() && window.BVUiBrand);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await sleep(500);
  return { page, ctx };
}
async function homeInfo(page) {
  return page.evaluate(() => {
    const vh = window.visualViewport ? window.visualViewport.height : innerHeight, vw = innerWidth;
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const hero = document.querySelector(".uit-hero");
    const hb = r(hero);
    const z3 = r(document.querySelector(".uit-z3"));
    const start = r(document.getElementById("btn-start"));
    const card = document.getElementById("top-player-card");
    const name = document.getElementById("top-name"), title = document.getElementById("top-player-title"), coin = document.getElementById("top-vcoin-balance");
    const overlap = (a, b) => a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
    const diffBtns = [...document.querySelectorAll(".uit-diff-btn")].map((b) => ({ k: b.dataset.diff, sel: b.classList.contains("is-selected"), h: b.getBoundingClientRect().height, text: b.textContent }));
    const sec = [...document.querySelectorAll(".uit-z5 .btn")].map((b) => ({ id: b.id, text: b.textContent.trim(), h: b.getBoundingClientRect().height }));
    return {
      vw, vh, hero: { natW: hero.naturalWidth, natH: hero.naturalHeight, ...hb, src: hero.getAttribute("src"), complete: hero.complete },
      heroInZone: hb.y >= z3.y - 0.5 && hb.b <= z3.b + 0.5 && hb.x >= -0.5 && hb.r <= vw + 0.5,
      ratioOk: Math.abs(hb.w / hb.h - hero.naturalWidth / hero.naturalHeight) < 0.01,
      start: start, startVisible: start.y >= 0 && start.b <= vh + 0.5, startH: start.h,
      title: document.getElementById("logo-title").textContent.replace(/\s+/g, ""),
      cardInHome: card.parentNode === document.querySelector(".uit-z1"),
      avatar: document.getElementById("top-avatar").currentSrc || document.getElementById("top-avatar").src,
      avatarLoaded: document.getElementById("top-avatar").naturalWidth > 0,
      name: name.textContent, titleText: title.textContent, coinText: coin.textContent,
      noOverlap: !overlap(r(name), r(coin)) && !overlap(r(title), r(coin)),
      diffBtns, sec, hScroll: document.documentElement.scrollWidth > vw || document.getElementById("s-title").scrollWidth > vw,
      z5Top: r(document.querySelector(".uit-z5")).y, more: document.querySelector(".uit-more").classList.contains("is-on"),
      heroVar: getComputedStyle(document.documentElement).getPropertyValue("--uit-hero-h").trim()
    };
  });
}

async function pngInfo(page, scope) {
  return page.evaluate((scope) => {
    const sc = document.querySelector(scope);
    const vis = (e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== "none";
    const btns = [...sc.querySelectorAll(".uit-pngbtn")].filter(vis);
    const color = (b) => (getComputedStyle(b).borderImageSource.match(/btn_(purple|yellow|blue)\.png/) || [])[1] || "none";
    const map = {}; btns.forEach((b) => { map[b.id || b.dataset.diff] = color(b) + (b.classList.contains("is-selected") ? "✓" : ""); });
    const exp = { easy: "blue", normal: "yellow✓", hard: "blue", "btn-start": "purple", "btn-lb": "blue", "btn-change-profile": "blue", "btn-how": "blue", "btn-music-title": "blue", "bv-btn-lobby": "blue" };
    const ok = scope !== "#s-title" || Object.keys(exp).every((k) => map[k] === exp[k]);
    const clipped = btns.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id || b.dataset.diff);
    const r = btns.map((b) => [b.id || b.dataset.diff, b.getBoundingClientRect()]);
    const overlap = [];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i][1], c = r[j][1]; if (a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5) overlap.push(r[i][0] + "×" + r[j][0]); }
    const cs = scope === "#s-title" ? getComputedStyle(sc, "::before") : getComputedStyle(sc);
    return { map, ok, clipped, overlap, bg: cs.backgroundImage, bgSize: cs.backgroundSize, filter: cs.filter, pos: cs.position,
      fgFilter: [...sc.querySelectorAll(".uit-pngbtn, #uit-hero, .uit-home")].map((e) => getComputedStyle(e).filter).filter((f) => /blur|saturate|opacity/.test(f)) };
  }, scope);
}

/* =====================================================================
   A. 首頁＋B. RWD
   ===================================================================== */
const SIZES = [
  { n: "320x640", w: 320, h: 640, range: [100, 130] },
  { n: "375x667", w: 375, h: 667, range: [120, 150] },
  { n: "390x844", w: 390, h: 844, range: [160, 190] },
  { n: "430x932", w: 430, h: 932, range: [190, 220] }
];
for (const s of SIZES) {
  const { page, ctx } = await open(s.w, s.h);
  const m = await homeInfo(page);
  await shot(page, `home-${s.n}`);
  const g = s.n;
  check("首頁", `${g}：V-03 是原檔 v_full_open_arms.png（378×469）且已載入`, m.hero.complete && m.hero.natW === 378 && m.hero.natH === 469 && m.hero.src === "../../assets/rpg/v_full_open_arms.png", JSON.stringify(m.hero));
  check("首頁", `${g}：V-03 沒有變形（顯示比例＝原圖比例）`, m.ratioOk, `${m.hero.w.toFixed(1)}×${m.hero.h.toFixed(1)}`);
  check("首頁", `${g}：V-03 完整顯示（頭、雙手、鞋子都在畫面內，沒有被裁切）`, m.heroInZone, JSON.stringify(m.hero));
  check("RWD", `${g}：V-03 高度 ${Math.round(m.hero.h)}px（企劃參考 ${s.range[0]}–${s.range[1]}px）`, m.hero.h >= s.range[0] - 0.5 && m.hero.h <= s.range[1] + 0.5, m.heroVar);
  check("首頁", `${g}：標題「氣球小V方塊派對」`, m.title.startsWith("氣球小V方塊派對"), m.title);
  check("首頁", `${g}：玩家資訊在首頁第一區（頭像、名稱、稱號、V幣）`, m.cardInHome && m.avatarLoaded && m.name === "UI測試員" && /稱號/.test(m.titleText) && /V幣/.test(m.coinText), `${m.name} / ${m.titleText} / ${m.coinText}`);
  check("RWD", `${g}：玩家名稱、稱號不會蓋住 V幣`, m.noOverlap);
  check("首頁", `${g}：難度沿用原版三個選項，預設「普通」已選取`, m.diffBtns.map((d) => d.k).join(",") === "easy,normal,hard" && m.diffBtns.filter((d) => d.sel).map((d) => d.k).join() === "normal", JSON.stringify(m.diffBtns.map((d) => d.text + (d.sel ? "*" : ""))));
  check("RWD", `${g}：難度按鈕 ≥ 44px、開始遊戲 48–52px`, m.diffBtns.every((d) => d.h >= 44) && m.startH >= 48 && m.startH <= 52.5, `diff ${m.diffBtns.map((d) => Math.round(d.h))} start ${Math.round(m.startH)}`);
  check("RWD", `${g}：開始遊戲在第一屏內、沒被遮住`, m.startVisible, JSON.stringify(m.start));
  check("RWD", `${g}：沒有橫向溢出`, !m.hScroll);
  check("首頁", `${g}：次要功能＝原有按鈕（排行榜、角色設定、操作說明、音樂、回遊戲宇宙），都 ≥ 44px`, m.sec.map((b) => b.id).join(",") === "btn-lb,btn-change-profile,btn-how,btn-music-title,bv-btn-lobby" && m.sec.every((b) => b.h >= 44), m.sec.map((b) => b.text).join("、"));
  const scrolled = await page.evaluate(() => { const t = document.getElementById("s-title"); t.scrollTop = t.scrollHeight; const b = document.getElementById("bv-btn-lobby").getBoundingClientRect(); return b.bottom <= (window.visualViewport ? visualViewport.height : innerHeight) + 0.5; });
  check("RWD", `${g}：次要功能可以捲動到並操作（最後一顆「回遊戲宇宙」可完整露出）`, scrolled);
  const art = await pngInfo(page, "#s-title");
  check("美術", `${g}：首頁背景是 E-01（universe_map_bg.png，cover 等比例、不拉伸）`, /universe_map_bg\.png/.test(art.bg) && /cover/.test(art.bgSize), art.bg.slice(0, 120) + " / " + art.bgSize);
  check("美術", `${g}：首頁 E-01 是遠景（只有背景層模糊＋降飽和、固定不隨捲動；前景按鈕／小V 無濾鏡）`, /blur\(\d/.test(art.filter) && /saturate/.test(art.filter) && art.pos === "fixed" && art.fgFilter.length === 0, art.filter + " / " + art.pos + " / fg=" + art.fgFilter.join(","));
  check("美術", `${g}：難度未選＝藍色 PNG、已選＝黃色 PNG＋勾選；開始遊戲＝紫色 PNG；次要功能＝藍色 PNG`, art.ok, JSON.stringify(art.map));
  check("美術", `${g}：所有金框按鈕文字都在按鈕內（沒有被裁切或壓到金框）`, art.clipped.length === 0, art.clipped.join(","));
  check("美術", `${g}：按鈕觸控範圍＝可見按鈕，彼此不重疊`, art.overlap.length === 0, art.overlap.join(","));
  const bdg = await page.evaluate(() => { const b = document.getElementById("uit-badge-page"), l = document.getElementById("bv-btn-lobby"); const x = b.getBoundingClientRect(), y = l.getBoundingClientRect(); return { inline: b.classList.contains("uit-badge-inline"), pos: getComputedStyle(b).position, overlap: x.left < y.right && y.left < x.right && x.top < y.bottom && y.top < x.bottom }; });
  check("RWD", `${g}：Sandbox 標示放在版面最下方，不遮住「回遊戲宇宙」`, bdg.inline && bdg.pos === "static" && !bdg.overlap, JSON.stringify(bdg));
  const ver = await page.evaluate(() => document.querySelector(".uit-ver").textContent);
  check("文案", `${g}：版本分開顯示「Game v1.3.7｜UI v0.2.1-test-1」`, ver === "Game v1.3.7｜UI v0.2.1-test-1", ver);
  check("首頁", `${g}：沒有 JavaScript 錯誤`, page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

// 瀏覽器工具列展開（可視高度變小）、手機橫向、文字放大
{
  const { page, ctx } = await open(390, 844);
  await page.setViewportSize({ width: 390, height: 700 }); await sleep(400);
  const a = await homeInfo(page);
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  const b = await homeInfo(page);
  check("RWD", "瀏覽器工具列展開（844→700）：小V自動縮小、開始遊戲仍在第一屏、沒有變形", a.startVisible && a.ratioOk && a.hero.h < b.hero.h && a.hero.h >= 100, `hero ${Math.round(b.hero.h)}→${Math.round(a.hero.h)} start.b=${Math.round(a.start.b)}`);
  await ctx.close();
}
{
  const { page, ctx } = await open(844, 390);
  const m = await homeInfo(page);
  await shot(page, "home-landscape-844x390");
  const canScrollToStart = await page.evaluate(() => { const b = document.getElementById("btn-start"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  check("RWD", "手機橫向 844×390：允許捲動；開始遊戲可捲動到並完整顯示；無橫向溢出；小V不變形", canScrollToStart && !m.hScroll && m.ratioOk && m.hero.h >= 100, `hero ${Math.round(m.hero.h)}`);
  await ctx.close();
}
{
  // 文字放大：以 CSS zoom 130% 模擬（不是系統字體設定）
  const { page, ctx } = await open(390, 844);
  await page.evaluate(() => { document.getElementById("s-title").style.zoom = "1.3"; });
  await sleep(400);
  const r = await page.evaluate(() => { const t = document.getElementById("s-title"); const over = t.scrollWidth > t.clientWidth + 1; const s = document.getElementById("btn-start"); s.scrollIntoView({ block: "center" }); const b = s.getBoundingClientRect(); return { over, ok: b.top >= 0 && b.bottom <= innerHeight, sh: t.scrollHeight, ch: t.clientHeight }; });
  await shot(page, "home-zoom130-390x844");
  check("RWD", "文字放大（以 CSS zoom 130% 模擬）：可垂直捲動、開始遊戲可操作、無橫向溢出", !r.over && r.ok && r.sh > r.ch, JSON.stringify(r));
  await ctx.close();
}

// 首頁功能：難度切換＋開始、次要功能
{
  const { page, ctx } = await open(390, 844);
  await page.tap('.uit-diff-btn[data-diff="hard"]'); await sleep(100);
  const sel = await page.evaluate(() => ({ s: BVUiBrand.getSelectedDiff(), aria: [...document.querySelectorAll(".uit-diff-btn")].map((b) => b.getAttribute("aria-checked")).join(",") }));
  const swapPre = await page.evaluate(() => [...document.querySelectorAll(".uit-diff-btn")].map((b) => (getComputedStyle(b).borderImageSource.match(/btn_(\w+)\.png/) || [])[1]).join(","));
  await page.tap("#btn-start");
  await page.waitForFunction(() => running === true);
  const g = await page.evaluate(() => ({ diff, overlay: !document.getElementById("g-overlay").classList.contains("off"), screen: !document.getElementById("s-game").classList.contains("off") }));
  check("美術", "選「挑戰」：挑戰變黃色 PNG＋勾選，其他變藍色", swapPre === "blue,blue,yellow", swapPre);
  check("首頁", "選「挑戰」後按開始遊戲：直接以 hard 開局（不再跳出難度視窗）", sel.s === "hard" && sel.aria === "false,false,true" && g.diff === "hard" && !g.overlay && g.screen, JSON.stringify({ sel, g }));
  await page.evaluate(() => { running = false; showScreen("s-title"); });
  await sleep(300);
  const back = await page.evaluate(() => ({ s: BVUiBrand.getSelectedDiff(), card: document.getElementById("top-player-card").parentNode.className }));
  check("首頁", "回到首頁：保留剛才選的難度、玩家卡回到首頁版面", back.s === "hard" && /uit-z1/.test(back.card), JSON.stringify(back));
  const nav = {};
  await page.tap("#btn-lb"); await sleep(300); nav.lb = await page.evaluate(() => !document.getElementById("s-lb").classList.contains("off")); await page.tap("#btn-lb-back"); await sleep(300);
  await page.tap("#btn-change-profile"); await sleep(300); nav.profile = await page.evaluate(() => !document.getElementById("s-profile").classList.contains("off"));
  nav.profTitle = await page.evaluate(() => document.querySelector("#s-profile h2").textContent + "｜" + document.getElementById("top-player-card").title + "｜" + document.body.innerText.includes("玩家設定") + "｜" + document.body.innerText.includes("更改角色"));
  nav.cardOutside = await page.evaluate(() => document.getElementById("top-player-card").parentNode.id !== "" || !document.getElementById("top-player-card").closest(".uit-z1"));
  await page.evaluate(() => showScreen("s-title")); await sleep(300);
  await page.tap("#btn-how"); await sleep(300); nav.how = await page.evaluate(() => { const t = document.getElementById("toast"); return t.classList.contains("show") && /旋轉/.test(t.textContent); });   // 原版：操作說明是提示訊息
  await page.evaluate(() => showScreen("s-title")); await sleep(200);
  await page.tap("#btn-music-title"); await sleep(300); nav.music = await page.evaluate(() => { const m = document.getElementById("music-modal"); return getComputedStyle(m).display !== "none" && m.classList.length > 0; });
  await page.evaluate(() => { const c = document.getElementById("mp-close"); if (c) c.click(); }); await sleep(200);
  nav.lobby = await page.evaluate(() => UniverseTetris.session.lobbyUrl());
  check("首頁", "次要功能：排行榜、角色設定、操作說明、音樂都開得起來", nav.lb && nav.profile && nav.how && nav.music, JSON.stringify(nav));
  check("首頁", "回遊戲宇宙：目的地不變（Sandbox 大廳 ../../index.html?sandbox=1）", nav.lobby === "../../index.html?sandbox=1", nav.lobby);
  check("首頁", "角色設定頁：玩家卡離開首頁版面、回到原本位置", nav.cardOutside);
  check("文案", "玩家可見的「玩家設定」統一為「角色設定」（頁面標題、玩家卡提示）；畫面上沒有「玩家設定」「更改角色」", nav.profTitle === "✨ 角色設定｜開啟角色設定｜false｜false", nav.profTitle);
  check("首頁", "首頁功能測試期間沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* =====================================================================
   D. 結算＋E. 再玩一次
   ===================================================================== */
async function endGame(page) {
  await page.evaluate(() => { for (let i = 0; i < 80 && running; i++) hardDrop(); });
  await page.waitForFunction(() => !document.getElementById("s-result").classList.contains("off"), null, { timeout: 8000 });
  await sleep(400);
}
async function resultInfo(page) {
  return page.evaluate(() => {
    const art = document.querySelector(".uit-res-art");
    return {
      title: document.querySelector("#s-result .res-title").textContent, artSrc: art.getAttribute("src"), artNat: art.naturalWidth + "x" + art.naturalHeight,
      ratioOk: Math.abs(art.getBoundingClientRect().width / art.getBoundingClientRect().height - art.naturalWidth / art.naturalHeight) < 0.01,
      record: document.getElementById("s-result").classList.contains("uit-record"), newBestFlag: document.getElementById("new-best").style.display,
      resScore: document.getElementById("res-score").textContent, resLines: document.getElementById("res-lines").textContent,
      resLevel: document.getElementById("res-level").textContent, resCombo: document.getElementById("res-combo").textContent,
      gScore: score, gLines: lines, gLevel: level, gCombo: peakCombo,
      vcoin: (document.getElementById("res-vcoin-msg") || {}).textContent, note: (document.getElementById("bv-result-note") || {}).textContent,
      homeBtn: document.getElementById("btn-res-home").textContent.trim(),
      buttons: [...document.querySelectorAll("#s-result .btn")].map((b) => b.id || b.textContent.trim())
    };
  });
}
{
  // 一般結算：本機個人最佳設得很高 → 原版判斷不是新紀錄
  const { page, ctx } = await open(390, 844);
  await page.evaluate(() => UniverseTetris.setLocalBest(999999));
  await page.tap("#btn-start"); await page.waitForFunction(() => running === true);
  await endGame(page);
  const r = await resultInfo(page);
  await shot(page, "result-normal-390x844");
  check("結算", "一般結算：標題「挑戰完成！」＋ V-06 v_bust_happy.png（319×355，不變形）", r.title === "挑戰完成！" && r.artSrc === "../../assets/rpg/v_bust_happy.png" && r.artNat === "319x355" && r.ratioOk && !r.record, JSON.stringify(r));
  check("結算", "不誤判新紀錄：原版判斷為否（#new-best 未顯示）時不顯示 V-18", r.newBestFlag === "none" && !r.record);
  check("結算", "本局分數與既有統計（分數、關卡、消除、最高連消）與遊戲數值一致", r.resScore === r.gScore.toLocaleString() && r.resLines === String(r.gLines) && r.resLevel === String(r.gLevel) && r.resCombo === String(r.gCombo), JSON.stringify(r));
  check("結算", "V幣與成績狀態維持原有文字（Sandbox：測試版不發放、已存為本分頁測試成績）", /V幣/.test(r.vcoin || "") && /測試版不發放/.test(r.vcoin || "") && /本分頁測試成績/.test(r.note || ""), `${r.vcoin} / ${r.note}`);
  check("結算", "結算按鈕＝原有四顆；「回首頁」改名「回方塊首頁」（目的地不變）", r.buttons.join(",") === "btn-replay,btn-res-lb,btn-res-home,btn-res-profile" && r.homeBtn === "🏠 回方塊首頁", r.buttons.join(","));
  const lay = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("#s-result .stat-box")].map((b) => b.getBoundingClientRect());
    const rows = [...document.querySelectorAll("#s-result .btn")].map((b) => [b.id, b.getBoundingClientRect()]);
    const R = Object.fromEntries(rows.map(([id, r]) => [id, { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }]));
    return { grid2x2: boxes.length === 4 && Math.abs(boxes[0].y - boxes[1].y) < 1 && Math.abs(boxes[2].y - boxes[3].y) < 1 && boxes[2].y > boxes[0].y && new Set(boxes.map((b) => Math.round(b.width))).size === 1 && Math.abs(boxes[0].height - boxes[1].height) < 1 && Math.abs(boxes[2].height - boxes[3].height) < 1,
      order: [...document.querySelectorAll("#s-result .stat-lbl")].map((e) => e.textContent.replace(/\s/g, "")).join(","), R,
      bg: getComputedStyle(document.getElementById("s-result"), "::before").backgroundImage, filt: getComputedStyle(document.getElementById("s-result"), "::before").filter,
      cardA: +((getComputedStyle(document.querySelector("#s-result .res-card")).backgroundColor.match(/[\d.]+\)$/) || ["1)"])[0].slice(0, -1)), badge: document.getElementById("uit-badge-page").closest(".res-card") !== null };
  });
  const rpng = await pngInfo(page, "#s-result");
  check("結算", "成績固定 2×2（分數｜關卡／消除｜最高連消），四張等寬、同列等高", lay.grid2x2 && lay.order === "⭐分數,🎯關卡,📦消除,🔥最高連消", lay.order);
  check("結算", "再玩一次＝紫色 PNG 獨立一排；排行榜＝藍色獨立一排；回方塊首頁＋角色設定＝藍色並排", rpng.map["btn-replay"] === "purple" && rpng.map["btn-res-lb"] === "blue" && rpng.map["btn-res-home"] === "blue" && rpng.map["btn-res-profile"] === "blue"
    && lay.R["btn-replay"].w === lay.R["btn-res-lb"].w && lay.R["btn-res-lb"].y > lay.R["btn-replay"].y && lay.R["btn-res-home"].y === lay.R["btn-res-profile"].y && lay.R["btn-res-home"].y > lay.R["btn-res-lb"].y && lay.R["btn-replay"].h > lay.R["btn-res-lb"].h,
    JSON.stringify({ map: rpng.map, R: lay.R }));
  check("結算", "結算按鈕文字沒有被裁切、觸控範圍不重疊", rpng.clipped.length === 0 && rpng.overlap.length === 0, rpng.clipped.concat(rpng.overlap).join(","));
  check("結算", "結算背景延續 E-01；Sandbox 標示放在結算卡片內最下方", /universe_map_bg\.png/.test(lay.bg) && lay.badge, lay.bg.slice(0, 100));
  check("結算", "結算背景與首頁同樣是遠景（模糊＋降飽和）；成績卡片維持不透明度 ≥ 0.85 以保持可讀", /blur\(\d/.test(lay.filt) && /saturate/.test(lay.filt) && lay.cardA >= 0.85, lay.filt + " / card α=" + lay.cardA);
  await page.tap("#btn-res-lb"); await sleep(500);
  const lb = await page.evaluate(() => ({ on: !document.getElementById("s-lb").classList.contains("off"), bg: getComputedStyle(document.getElementById("s-lb"), "::before").backgroundImage, filt: getComputedStyle(document.getElementById("s-lb"), "::before").filter, rows: document.querySelectorAll("#lb-list .lb-row").length, back: (getComputedStyle(document.getElementById("btn-lb-back")).borderImageSource.match(/btn_(\w+)/) || [])[1] }));
  await shot(page, "leaderboard-390x844");
  check("排行榜", "排行榜延續 E-01 背景；資料照常顯示（本分頁測試排行榜）；返回鍵為藍色 PNG", lb.on && /universe_map_bg\.png/.test(lb.bg) && /blur\(\d/.test(lb.filt) && lb.rows >= 1 && lb.back === "blue", JSON.stringify(lb).slice(0, 200));
  await page.tap("#btn-lb-back"); await sleep(300);
  await page.evaluate(() => showScreen("s-result")); await sleep(300);
  await page.tap("#btn-res-home"); await sleep(300);
  check("結算", "回方塊首頁：回到方塊遊戲首頁（不是遊戲宇宙）", await page.evaluate(() => !document.getElementById("s-title").classList.contains("off") && location.pathname.endsWith("/tetris-ui-test/")));
  await ctx.close();
}
{
  // 新紀錄結算：本機個人最佳 0 → 原版判斷為新紀錄；分數 0 的局不算
  const { page, ctx } = await open(390, 844);
  await page.evaluate(() => UniverseTetris.setLocalBest(0));
  await page.tap("#btn-start"); await page.waitForFunction(() => running === true);
  // 先讓分數 0 就結束：直接觸發原版 gameOver（不經過計分）
  await page.evaluate(() => { score = 0; gameOver(); });
  await page.waitForFunction(() => !document.getElementById("s-result").classList.contains("off"));
  await sleep(300);
  const z = await resultInfo(page);
  check("結算", "分數 0 的局：原版判斷不是新紀錄 → 顯示一般結算（不誤判）", !z.record && z.title === "挑戰完成！", JSON.stringify(z));
  await page.tap("#btn-res-home"); await sleep(300);
  await page.tap("#btn-start"); await page.waitForFunction(() => running === true);
  await endGame(page);
  const r = await resultInfo(page);
  await shot(page, "result-record-390x844");
  check("結算", "新紀錄結算：原版判斷為新紀錄時，標題「新紀錄！」＋ V-18 v_bust_congrats.png（340×358，不變形）＋粉黃強調", r.title === "新紀錄！" && r.artSrc === "../../assets/rpg/v_bust_congrats.png" && r.artNat === "340x358" && r.ratioOk && r.record && r.newBestFlag === "block", JSON.stringify(r));
  const best = await page.evaluate(() => UniverseTetris.getLocalBest());
  check("結算", "新紀錄判斷來源＝原版本機個人最佳（結算後更新為本局分數）", best === Number(r.gScore), `best=${best} score=${r.gScore}`);
  await ctx.close();
}
{
  // 再玩一次：同難度、重置、不重複提交、不重複發獎
  const { page, ctx } = await open(390, 844);
  await page.tap('.uit-diff-btn[data-diff="hard"]');
  await page.evaluate(() => {
    window.__runs = 0; window.__submits = 0;
    const S = UniverseTetris.session;
    const sr = S.startRun.bind(S); S.startRun = function () { window.__runs++; return sr(); };
    const sb = S.services.scores.submit.bind(S.services.scores); S.services.scores.submit = function (x) { window.__submits++; window.__lastSub = x.submissionId; return sb(x); };
  });
  await page.tap("#btn-start"); await page.waitForFunction(() => running === true);
  await page.evaluate(() => { for (let i = 0; i < 6; i++) hardDrop(); });
  await endGame(page);
  const before = await page.evaluate(async () => ({ runs: __runs, submits: __submits, sub: __lastSub, board: (await UniverseTetris.session.services.leaderboard.getBoard({ gameId: "tetris" })).rows.length, coin: document.getElementById("top-vcoin-balance").textContent, pid: UniverseTetris.getPlayer().playerId, title: document.getElementById("top-player-title").textContent, best: UniverseTetris.getLocalBest(), lastScore: score }));
  // 連點兩次再玩一次
  await page.evaluate(() => { const b = document.getElementById("btn-replay"); b.click(); b.click(); });
  await page.waitForFunction(() => running === true);
  await sleep(500);
  const after = await page.evaluate(async () => ({ runs: __runs, submits: __submits, diff, score, lines, level, combo, peakCombo, filled: board.flat().filter(Boolean).length, screen: !document.getElementById("s-game").classList.contains("off"), overlay: !document.getElementById("g-overlay").classList.contains("off"), board: (await UniverseTetris.session.services.leaderboard.getBoard({ gameId: "tetris" })).rows.length, coin: document.getElementById("top-vcoin-balance").textContent, pid: UniverseTetris.getPlayer().playerId, title: document.getElementById("top-player-title").textContent, best: UniverseTetris.getLocalBest() }));
  await shot(page, "replay-game-390x844");
  check("再玩一次", "使用上一局相同難度（hard）直接開始新局，沒有回到難度選擇", after.diff === "hard" && after.screen && !after.overlay, JSON.stringify(after));
  check("再玩一次", "棋盤、分數、消除行數、關卡、連消都重置", after.score === 0 && after.lines === 0 && after.level === 1 && after.combo === 0 && after.peakCombo === 0 && after.filled === 0, JSON.stringify(after));
  check("再玩一次", "連點兩次只開一局（開局流程只多 1 次）", after.runs === before.runs + 1, `${before.runs}→${after.runs}`);
  check("再玩一次", "不重複提交上一局成績（提交次數與排行榜筆數不變）", after.submits === before.submits && after.board === before.board, `submits ${before.submits}→${after.submits} board ${before.board}→${after.board}`);
  check("再玩一次", "玩家身份、稱號、V幣顯示不變；歷史最佳紀錄不消失", after.pid === before.pid && after.title === before.title && after.coin === before.coin && after.best === before.best, JSON.stringify({ before, after }));
  await endGame(page);
  const end2 = await page.evaluate(async () => ({ submits: __submits, sub: __lastSub, board: (await UniverseTetris.session.services.leaderboard.getBoard({ gameId: "tetris" })).rows.length }));
  check("再玩一次", "第二局結束只提交第二局（提交 +1，submissionId 與上一局不同）", end2.submits === before.submits + 1 && end2.sub !== before.sub, JSON.stringify({ before, end2 }));
  check("再玩一次", "沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

{
  // 大分數：只在測試裡把分數設成 12,345,678 再觸發原版 gameOver（不改遊戲程式）
  const { page, ctx } = await open(320, 640);
  await page.evaluate(() => UniverseTetris.setLocalBest(0));
  await page.tap("#btn-start"); await page.waitForFunction(() => running === true);
  await page.evaluate(() => { score = 12345678; gameOver(); });
  await page.waitForFunction(() => !document.getElementById("s-result").classList.contains("off")); await sleep(400);
  const big = await page.evaluate(() => { const v = document.getElementById("res-score"); return { text: v.textContent, fits: v.scrollWidth <= v.clientWidth + 1, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  await shot(page, "result-bigscore-320x640");
  const reach = await page.evaluate(() => { const r = document.getElementById("s-result"); r.scrollTop = r.scrollHeight; const b = document.getElementById("btn-res-profile").getBoundingClientRect(); return b.bottom <= innerHeight + 0.5 && b.top >= 0; });
  check("結算", "大分數 12,345,678（320 寬）：千分位、不撐破卡片、無橫向溢出；需要捲動時最後一顆按鈕可捲到並完整顯示", big.text === "12,345,678" && big.fits && big.sw <= big.vw && reach, JSON.stringify(big));
  await ctx.close();
}
{
  // 較長的玩家名稱（沙盒大廳建立的 20 字名稱）與較長稱號（測試時直接填入顯示文字）
  const longId = "p_longnamesandboxplayr";   // p_ ＋ 20 字（a-z、2-7）
  const db = JSON.stringify({ players: { [longId]: { playerId: longId, displayId: "氣球小V超級無敵方塊派對大師二號機", baseAvatarKey: "girl1", displayAvatarKey: "girl1" } } });
  const { page, ctx } = await open(320, 640, { search: "?bvPlayerId=" + longId, init: `try{sessionStorage.setItem("bvUniverseSandbox_v2_api", ${JSON.stringify(db)})}catch(e){}` });
  await page.evaluate(() => { document.getElementById("top-player-title").textContent = "稱號：傳說中的氣球方塊建築大師・彩虹派對之王"; });
  await sleep(300);
  const m = await homeInfo(page);
  await shot(page, "home-longname-320x640");
  check("RWD", "較長玩家名稱與稱號（320 寬）：以省略號收合、不蓋住 V幣、無橫向溢出", m.name.length >= 15 && m.noOverlap && !m.hScroll, `${m.name} / ${m.titleText}`);
  await ctx.close();
}
{
  // 按鈕細節：3 倍解析度放大截圖（金框、光澤、文字、不同寬度、選中難度）
  const { page, ctx } = await H.newPage({ viewport: { width: 390, height: 844 }, mobile: true, scale: 3 });
  await page.goto(URL_); await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady() && window.BVUiBrand); await sleep(800);
  const box = await page.evaluate(() => { const a = document.querySelector(".uit-diff").getBoundingClientRect(), b = document.getElementById("bv-btn-lobby").getBoundingClientRect(); return { x: 0, y: Math.floor(a.top) - 6, width: innerWidth, height: Math.ceil(b.bottom - a.top) + 12 }; });
  await page.screenshot({ path: path.join(OUT, "buttons-detail-390x844@3x.png"), clip: box });
  await ctx.close();
}

/* =====================================================================
   C. HUD：與第一階段（c170921）逐像素比對幾何；暫停、操作
   ===================================================================== */
async function hudGeom(page) {
  return page.evaluate(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); if (!b.width) return null; return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10).join(","); };
    const o = { CELL, canvas: document.getElementById("board-canvas").width + "x" + document.getElementById("board-canvas").height, board: r(document.getElementById("board-wrap")),
      gameBg: getComputedStyle(document.getElementById("s-game")).backgroundImage, cardBg: getComputedStyle(document.getElementById("hud-score").closest(".hud-card")).backgroundColor,
      pngInGame: document.querySelectorAll("#s-game .uit-pngbtn").length, e01InGame: /universe_map_bg/.test(getComputedStyle(document.getElementById("s-game")).backgroundImage)
        || ["s-title", "s-result", "s-lb"].some((id) => getComputedStyle(document.getElementById(id)).opacity !== "0") };
    for (const id of ["g-avatar", "g-name", "hud-score", "hud-combo", "hud-lines", "hud-level", "next-canvas", "pause-btn", "mc-play", "uit-fs", "fs-btn", "btn-quit"]) o["hud:" + id] = r(document.getElementById(id));
    for (const b of document.querySelectorAll(".uit-btn")) { o["btn:" + b.dataset.act] = r(b); o["bg:" + b.dataset.act] = getComputedStyle(b).backgroundColor; }
    const s = document.querySelector(".uit-hud-dummy"); return o;
  });
}
async function startPlain(page) {
  await page.click("#btn-start");
  await page.waitForFunction(() => running === true || !!document.querySelector("#g-overlay:not(.off) #ov-btns button"));
  if (!(await page.evaluate(() => running === true))) await page.click("#ov-btns button:nth-child(2)");
  await page.waitForFunction(() => running === true); await sleep(600);
}
const GEOM_VIEWS = [[320, 640], [360, 800], [390, 844], [412, 915], [430, 932], [844, 390], [915, 412], [1366, 768]];
const geomNew = {};
for (const [w, h] of GEOM_VIEWS) {
  const { page, ctx } = await open(w, h, { mobile: w < 1000 });
  await startPlain(page);
  geomNew[w + "x" + h] = await hudGeom(page);
  if (w === 390) await shot(page, "hud-390x844");
  if (w === 1366) await shot(page, "hud-desktop-1366x768");
  await ctx.close();
}
if (BASE_ROOT) {
  const { createHarness: createBase } = await import(path.join(BASE_ROOT, "universe/tests/browser/harness.mjs"));
  const HB = await createBase({ clones, out: path.join(OUT, "baseline") });
  let same = 0, diffs = [];
  for (const [w, h] of GEOM_VIEWS) {
    const { page, ctx } = await HB.newPage({ viewport: { width: w, height: h }, mobile: w < 1000 });
    await page.goto(HB.SITE + "universe/tetris-ui-test/");
    await page.waitForFunction(() => window.UniverseTetris && UniverseTetris.isReady()); await sleep(500);
    await startPlain(page);
    const a = await hudGeom(page), b = geomNew[w + "x" + h];
    const changed = Object.keys(a).filter((k) => a[k] !== b[k]);
    if (changed.length) diffs.push(`${w}x${h}: ` + changed.map((k) => `${k} ${a[k]}→${b[k]}`).join("; ")); else same++;
    await ctx.close();
  }
  await HB.finish("baseline");
  check("HUD", `與上一版 v0.2.0-test-1（af3f48d）比對 ${GEOM_VIEWS.length} 種尺寸：棋盤格子／棋盤／HUD 每個元素／五顆按鍵位置大小與透明度／遊戲背景／HUD 卡片配色完全相同；遊戲中沒有 E-01 與金框按鈕`, diffs.length === 0, diffs.join(" | ") || `${same} 種尺寸全部相同`);
} else {
  note("HUD", "與第一階段逐像素比對", "沒有提供第一階段 worktree，未比對");
}
{
  const { page, ctx } = await open(390, 844);
  await startPlain(page);
  const g = geomNew["390x844"];
  const order = await page.evaluate(() => [...document.querySelectorAll(".uit-btn")].map((b) => ({ a: b.dataset.act, x: b.getBoundingClientRect().x, y: b.getBoundingClientRect().y })).filter((b) => ["down", "drop", "rotate"].includes(b.a)).sort((p, q) => p.x - q.x).map((b) => b.a).join(","));
  check("HUD", "棋盤 10×20、正方形格子", /^\d+x\d+$/.test(g.canvas) && Number(g.canvas.split("x")[0]) / 10 === Number(g.canvas.split("x")[1]) / 20, g.canvas);
  check("HUD", "右側按鍵順序仍為 ↓、落、↻", order === "down,drop,rotate", order);
  const p1 = await page.evaluate(() => { document.getElementById("pause-btn").click(); return paused; });
  const p2 = await page.evaluate(() => { togglePause(); return paused; });
  check("HUD", "暫停與恢復正常", p1 === true && p2 === false);
  const colors = await page.evaluate(() => ({ bg: getComputedStyle(document.getElementById("s-game")).backgroundImage, card: getComputedStyle(document.getElementById("hud-score").closest(".hud-card")).backgroundColor }));
  check("HUD", "HUD 套用品牌配色（深紫／HUD 紫）", /37, 28, 61|64, 48, 93/.test(colors.bg) && /64, 48, 93/.test(colors.card), JSON.stringify(colors));
  await ctx.close();
}

/* =====================================================================
   F. 隔離
   ===================================================================== */
check("美術", "整個測試期間所有素材載入成功（沒有 404 或載入失敗）", bad.length === 0, bad.join(" | "));
check("隔離", "整個測試期間：遊戲宇宙 API 0 個請求、任何網域 0 個寫入請求（後端正式成績＝開啟、真的玩家存在）", H.apiCalls.length === 0 && nonGet.length === 0, H.apiCalls.concat(nonGet).join(" | "));
note("實機", "手機實機（iOS Safari、Android Chrome）、系統字體放大、實際 Safe Area", "本測試是 Chromium 模擬，未驗證");
const ok = await H.finish("tetris-ui-brand");
process.exit(ok ? 0 : 1);

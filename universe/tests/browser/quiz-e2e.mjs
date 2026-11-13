/* 知識挑戰宇宙版：真實瀏覽器測試＋玩法等價測試
   用法（repository 根目錄）：
     NODE_PATH=$(npm root -g) node universe/tests/browser/quiz-e2e.mjs <tetris clone> <rhythm clone> <quiz clone> <輸出資料夾>

   等價測試做法：原版（/orig/quiz/）與宇宙版各開全新分頁，使用同一份題庫檔、
   在開局前把 Math.random 重新播種成同一個種子，送出完全相同的作答序列（含答錯與逾時），
   比較：題目順序、每題選項順序與正解位置、每題判定、分數軌跡、正確率、最高連對、結算標題。 */
import fs from "node:fs";
import crypto from "node:crypto";
import { createHarness, sleep, text, offscreenButtons, hasHorizontalScroll } from "./harness.mjs";

const [TETRIS, RHYTHM, QUIZ, OUT] = process.argv.slice(2);
if (!OUT) { console.error("用法：quiz-e2e.mjs <tetris clone> <rhythm clone> <quiz clone> <out>"); process.exit(2); }
const H = await createHarness({ clones: { tetris: TETRIS, rhythm: RHYTHM, quiz: QUIZ }, out: OUT });
const { ORIGIN, check, newPage } = H;
const A = await H.apiCreate("問答甲", "avatar_penguin_hoodie");
const B = await H.apiCreate("問答乙", "boy2");
const dbAfterSeed = JSON.stringify(H.db.root);
const BANK = JSON.parse(fs.readFileSync(`${QUIZ}/quiz_questions.json`, "utf8"));
const BANK_SHA = crypto.createHash("sha256").update(fs.readFileSync(`${QUIZ}/quiz_questions.json`)).digest("hex");
/* 已核准題目修正（公開檔，v0.2.0-test-2 由舊 Firebase 唯讀匯出後匯入） */
const APPROVED = JSON.parse(fs.readFileSync(new URL("../../quiz/approved-question-overrides.json", import.meta.url), "utf8"));
const DISABLED_IDS = ["brain_low_021", "brain_low_030", "brain_middle_012", "brain_middle_027"];
const uni = (q) => `${ORIGIN}/universe/quiz/index.html${q || ""}`;
const ready = (page) => page.waitForFunction(() => window.UniverseQuiz && window.UniverseQuiz.isReady() && typeof QUESTIONS !== "undefined" && QUESTIONS.length > 0, null, { timeout: 20000 });

/* 透過畫面點擊玩完一局：pattern[i] = "c" 答對、"w" 答錯 */
async function playRoundByClicks(page, pattern, tap = false) {
  await page.waitForSelector("#screen-quiz.active");
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction((i) => quizState.currentIndex === i && document.querySelectorAll(".choice-btn:not([disabled])").length > 0, i, { timeout: 10000 });
    const pick = await page.evaluate((mode) => { const q = quizState.questions[quizState.currentIndex]; const n = q.choices.length; return mode === "c" ? q.answerIndex : (q.answerIndex + 1) % n; }, pattern[i % pattern.length]);
    const btn = page.locator(".choice-btn").nth(pick);
    if (tap) await btn.tap(); else await btn.click();
    await page.waitForSelector("#explanation-box:not(.hidden)", { timeout: 5000 });
    if (i === 0) await page.screenshot({ path: `${OUT}/quiz-question-answered${tap ? "-mobile" : ""}.png` }).catch(() => {});
    const next = page.locator("#btn-next-question");
    if (tap) await next.tap(); else await next.click();
  }
  await page.waitForSelector("#screen-result.active", { timeout: 10000 });
  await page.waitForFunction(() => !/正在保存/.test(document.getElementById("save-status").textContent), null, { timeout: 10000 });
  await sleep(300);
}

/* ========== 1. 宇宙版：身份、首頁標示、唯讀玩家設定、題目修正狀態 ========== */
{
  const { ctx, page } = await newPage();
  await page.goto(uni("?bvPlayerId=" + A.playerId));
  await ready(page); await sleep(800);
  const st = await page.evaluate(() => ({
    screen: document.querySelector(".screen.active").id, name: document.getElementById("top-name").textContent,
    av: document.getElementById("top-avatar").getAttribute("src"), avW: document.getElementById("top-avatar").naturalWidth,
    pid: PLAYER.playerId, pkey: PLAYER.playerKey, marks: document.querySelectorAll(".bv-status-mark").length,
    ov: document.getElementById("bv-override-note").textContent, ovHidden: document.getElementById("bv-override-note").hidden,
    menu: document.getElementById("btn-game-menu").textContent, wallet: document.getElementById("top-vcoin-balance").textContent,
    title: document.getElementById("top-player-title").textContent, dc: document.getElementById("daily-challenge-status").textContent,
    bank: QUESTIONS.length, bankVersion: QUIZ_VERSION
  }));
  check("問答｜身份", "自動接收 playerId，直接進入首頁（不要求建立身份）", st.pid === A.playerId && st.screen === "screen-title", st.screen);
  check("問答｜身份", "顯示玩家 ID 與身份頭像（遊戲宇宙素材，圖片載入成功）", st.name === "問答甲" && /assets\/avatars\/base\/avatar_penguin_hoodie\.png$/.test(st.av) && st.avW > 0, st.av);
  check("問答｜身份", "成績歸屬鍵＝遊戲宇宙 playerId（不是舊 ID＋圖案 playerKey）", st.pkey === A.playerId && !/__/.test(st.pkey), st.pkey);
  check("問答｜標示", "首頁只有一個簡潔測試標示", st.marks === 1);
  check("問答｜題目修正", "題目修正已同步 → 首頁不再顯示「尚未同步」提醒", st.ovHidden && !/尚未同步/.test(st.ov), st.ov);
  check("問答｜題庫", `正式題庫完整載入（${BANK.length} 題，由原版網址唯讀載入）`, st.bank === BANK.length, st.bank);
  check("問答｜大廳", "「遊戲選單」改為「回遊戲宇宙」", st.menu === "🏠 回遊戲宇宙", st.menu);
  check("問答｜未開放", "V幣顯示「未開放」；v0.3.1 稱號顯示共用收藏的裝備狀態（未裝備）", /未開放/.test(st.wallet) && /未裝備/.test(st.title), st.wallet + "／" + st.title);
  check("問答｜今日挑戰", "今日挑戰卡保留，標示「+10 V幣待開放」", /待開放/.test(st.dc), st.dc);
  await page.screenshot({ path: `${OUT}/quiz-01-title.png` });

  await page.click("#btn-go-profile");
  await page.waitForSelector("#screen-profile.active");
  const pf = await page.evaluate(() => ({
    ro: document.getElementById("player-id-input").readOnly, val: document.getElementById("player-id-input").value,
    hidden: ["btn-pick-base", "btn-pick-display", "btn-save-profile"].every((id) => getComputedStyle(document.getElementById(id)).display === "none"),
    lobby: !!document.getElementById("bv-profile-lobby")
  }));
  check("問答｜玩家設定", "唯讀：ID 不能改、隱藏選頭像與確認身份、提供回大廳切換", pf.ro && pf.val === "問答甲" && pf.hidden && pf.lobby, JSON.stringify(pf));
  await page.click("#btn-profile-avatar-collection");
  await page.waitForFunction(() => { const b = document.getElementById("bv-collection"); return b && !b.hidden && /要更換稱號或展示頭像/.test(b.textContent); }, null, { timeout: 8000, polling: 100 }).catch(() => {});
  check("問答｜收藏", "v0.3.1：開啟遊戲宇宙共用收藏視窗（只讀；更換在大廳通行證）", await page.evaluate(() => { const b = document.getElementById("bv-collection"); return !!b && !b.hidden && /我的收藏/.test(b.textContent) && /大廳「我的通行證 → 收藏」/.test(b.textContent); }));
  await page.click("#bv-collection [data-bv-close]");
  await page.click("#btn-title-collection");
  await page.waitForFunction(() => { const b = document.getElementById("bv-collection"); return b && !b.hidden && /要更換稱號或展示頭像/.test(b.textContent); }, null, { timeout: 8000, polling: 100 }).catch(() => {});
  check("問答｜收藏", "v0.3.1：開啟遊戲宇宙共用收藏視窗（只讀；更換在大廳通行證）", await page.evaluate(() => { const b = document.getElementById("bv-collection"); return !!b && !b.hidden && /我的收藏/.test(b.textContent) && /大廳「我的通行證 → 收藏」/.test(b.textContent); }));
  await page.click("#bv-collection [data-bv-close]");
  await page.screenshot({ path: `${OUT}/quiz-02-profile-readonly.png` });
  await page.click("#btn-profile-back");
  for (let i = 0; i < 6; i++) await page.click("#quiz-logo-title");
  await sleep(200);
  check("問答｜安全", "舊管理後台入口停用（點標題 5 下不會出現密碼框）", await page.evaluate(() => !document.getElementById("admin-pwd-modal").classList.contains("show") && !document.getElementById("screen-admin").classList.contains("active")));

  /* ---- 第 1 局：今日挑戰（指定年級＋科目）----- */
  const today = await page.evaluate(() => getDailyChallengeForDate());
  await page.click("#btn-daily-challenge");
  await page.waitForSelector("#screen-setup.active");
  check("問答｜今日挑戰", "「開始今日挑戰」帶入今天指定的年級與科目（原版規則）", await page.evaluate((t) => selectedGrade === t.gradeBand && selectedSubject === t.subject, today), today.description);
  await page.click("#btn-start-quiz");
  const audioOk = await page.evaluate(() => { try { ensureAudioContext(); return !!audioCtx || true; } catch (e) { return false; } });
  check("問答｜音效", "音效引擎（WebAudio）可用", audioOk);
  await playRoundByClicks(page, ["c", "c", "w", "c", "c", "c", "w", "c", "c", "c"]);
  const r1 = await page.evaluate(() => ({ score: quizState.score, correct: quizState.correctCount, combo: quizState.maxCombo, status: document.getElementById("save-status").textContent,
    resScore: document.getElementById("result-score").textContent, vcoin: document.getElementById("result-vcoin-banner").innerText, vHidden: document.getElementById("result-vcoin-banner").classList.contains("hidden"),
    daily: document.getElementById("result-daily-challenge-banner").innerText, dHidden: document.getElementById("result-daily-challenge-banner").classList.contains("hidden") }));
  check("問答｜遊玩", "完整玩完一局 10 題並進入結算（8 題答對）", r1.correct === 8 && r1.resScore === String(r1.score), JSON.stringify({ s: r1.score, c: r1.correct }));
  check("問答｜計分", "計分與連對：原版公式（100＋連對加成，上限 50）", r1.score === 100 + 110 + 100 + 110 + 120 + 100 + 110 + 120 && r1.combo === 3, r1.score + " / combo " + r1.combo);
  check("問答｜結算", "結算提示「本場成績尚未記入正式排行榜」", /本場成績尚未記入正式排行榜/.test(r1.status), r1.status.replace(/\n/g, "｜"));
  check("問答｜V幣", "V幣：測試版不發放（不顯示「寫入失敗」）", !r1.vHidden && /不發放/.test(r1.vcoin) && !/失敗/.test(r1.vcoin), r1.vcoin.replace(/\n/g, "｜"));
  check("問答｜今日挑戰", "完成今日挑戰：照原版判定顯示完成，+10 V幣待開放（不發放）", !r1.dHidden && /今日挑戰完成/.test(r1.daily) && !/\+10 V幣！/.test(r1.daily) && /待開放/.test(r1.status), r1.daily.replace(/\n/g, "｜"));
  await page.screenshot({ path: `${OUT}/quiz-03-result.png` });

  /* ---- 第 2 局：另一個年級（驗證總榜＝各年級總分加總）----- */
  const other = today.gradeBand === "low" ? "middle" : "low";
  await page.click("#btn-play-again");
  await page.waitForSelector("#screen-setup.active");
  const gIdx = ["low", "middle", "high"].indexOf(other);
  await page.locator("#grade-options .option-card").nth(gIdx).click();
  await page.locator("#subject-options .option-card").nth(1).click();   // 國語
  await page.click("#btn-start-quiz");
  await playRoundByClicks(page, ["c", "w"]);
  const r2score = await page.evaluate(() => quizState.score);
  const boards = await page.evaluate(async (pid) => {
    const rec = window.UniverseQuiz.session.services.records;
    return { prog: await rec.get("progress", pid), low: await rec.get("board-low", pid), middle: await rec.get("board-middle", pid), high: await rec.get("board-high", pid), main: await rec.get("board-main", pid),
      subs: await window.UniverseQuiz.session.services.scores.listMine(pid, "quiz") };
  }, A.playerId);
  const g1 = boards[today.gradeBand], g2 = boards[other];
  check("問答｜年級榜", "年級榜（Mock）＝該年級各科最佳分數加總（原版 buildGradeRecordFromProgress）", g1 && g1.gradeTotalScore === r1.score && g2 && g2.gradeTotalScore === r2score && g1.recordStatus === "mock", `${today.gradeBand}=${g1 && g1.gradeTotalScore} ${other}=${g2 && g2.gradeTotalScore}`);
  check("問答｜總榜", "總榜（Mock）＝低／中／高年級總分加總（原版 buildMainRecordFromGradeRecords）", boards.main && boards.main.totalScore === r1.score + r2score && boards.main.completedGrades === 2 && boards.main.serverConfirmed === false, boards.main && boards.main.totalScore);
  check("問答｜結算", "ScoreSubmission（Mock）2 筆：playerId 正確、問答專屬欄位、未經伺服器確認", boards.subs.length === 2 && boards.subs.every((s) => s.playerId === A.playerId && s.serverConfirmed === false && ["gradeBand", "subject", "score", "correctCount", "totalQuestions", "maxCombo", "accuracy"].every((k) => k in s.scoreData)), boards.subs.length);
  const academy = await page.evaluate(() => document.getElementById("academy-completed").textContent);
  check("問答｜教育功能", "V學園成績單更新（已挑戰 2 科）", /^2 \/ 24$/.test(academy), academy);

  await page.click("#btn-result-leaderboard");
  await page.waitForSelector("#screen-leaderboard.active");
  await sleep(300);
  const lbMain = await page.evaluate(() => ({ note: document.getElementById("bv-lb-note").textContent, rows: [...document.querySelectorAll("#leaderboard-list .lb-row")].map((r) => ({ t: r.innerText.replace(/\s+/g, " "), mine: r.classList.contains("mine") })) }));
  check("問答｜排行榜", "總榜（測試）：標示不是正式排行榜；自己的列標示 mine", /不是正式排行榜/.test(lbMain.note) && lbMain.rows.length === 1 && lbMain.rows[0].mine && /問答甲/.test(lbMain.rows[0].t), JSON.stringify(lbMain).slice(0, 200));
  await page.screenshot({ path: `${OUT}/quiz-04-leaderboard-main.png` });
  await page.click(`[data-lb-mode="${today.gradeBand}"]`); await sleep(300);
  check("問答｜排行榜", "年級榜分頁可切換並顯示年級分", /年級分/.test(await text(page, "#leaderboard-list")), await text(page, "#leaderboard-list"));
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check("問答｜資料", "localStorage 只有遊戲宇宙鍵（沒有 vquiz_playerId、vquiz_localLogs、vPartyPlayerProfile）", keys.every((k) => k.startsWith("bvUniverseGame_v1_")), keys.join(","));

  /* ---- 換玩家 B（同分頁）----- */
  await page.goto(uni("?bvPlayerId=" + B.playerId));
  await ready(page); await sleep(500);
  const sb = await page.evaluate(() => ({ name: document.getElementById("top-name").textContent, pid: PLAYER.playerId, academy: document.getElementById("academy-completed").textContent, dc: document.getElementById("daily-challenge-status").textContent }));
  check("問答｜切換", "換成 B：顯示 B，A 的 V學園進度與今日挑戰完成狀態不會出現在 B", sb.name === "問答乙" && sb.pid === B.playerId && sb.academy === "0 / 24" && !/已完成/.test(sb.dc), JSON.stringify(sb));
  const bSubs = await page.evaluate((pid) => window.UniverseQuiz.session.services.scores.listMine(pid, "quiz"), B.playerId);
  check("問答｜切換", "B 沒有任何 A 的成績", bSubs.length === 0);
  await page.click("#btn-game-menu");
  await page.waitForURL(/\/index\.html$/, { timeout: 10000 });
  check("問答｜大廳", "「回遊戲宇宙」回到大廳", /\/index\.html$/.test(page.url()), page.url());
  check("問答｜穩定", "整個流程沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* ========== 2a. 題目修正（實際公開檔）：四題在宇宙版被停用，正常遊戲不會抽到，其他題目不受影響 ========== */
{
  const { ctx, page } = await newPage();
  await page.goto(uni("?bvPlayerId=" + A.playerId));
  await ready(page); await sleep(400);
  const r = await page.evaluate(({ ids, seed }) => {
    eval(seed);
    const state = window.UniverseQuiz.overrideState();
    const flags = ids.map((id) => { const q = QUESTIONS.find((x) => x.id === id); return q ? [id, q.disabled, q.quality, isQuestionEnabled(q)] : [id, "missing"]; });
    const enabled = QUESTIONS.filter(isQuestionEnabled).length;
    const pools = {}, drawn = {};
    for (const g of ["low", "middle"]) {
      selectedGrade = g; selectedSubject = "brain";
      pools[g] = getQuestionPool().map((q) => q.id);
      drawn[g] = 0;
      for (let i = 0; i < 40; i++) {   // 真正的開局流程 startQuiz（每局不同種子）
        __bvSeed(1000 + i); startQuiz();
        drawn[g] += quizState.questions.filter((q) => ids.indexOf(q.id) >= 0).length;
        stopQuestionTimer(); stopQuizTimer(); quizState.active = false;
      }
    }
    showScreen("screen-title");
    return { state, flags, enabled, total: QUESTIONS.length, poolLow: pools.low.length, poolMid: pools.middle.length,
      inPool: ids.filter((id) => pools.low.concat(pools.middle).indexOf(id) >= 0), drawn };
  }, { ids: DISABLED_IDS, seed: H.SEED_FN });
  const bankLow = BANK.filter((q) => q.gradeBand === "low" && q.subject === "brain").length;
  const bankMid = BANK.filter((q) => q.gradeBand === "middle" && q.subject === "brain").length;
  check("問答｜題目修正", "宇宙版正確讀取公開修正檔：已匯出、4 筆", r.state.status === "exported" && r.state.count === 4, JSON.stringify(r.state));
  check("問答｜題目修正", "四個題目 ID 都在正式題庫，套用後為 disabled／quality: disabled，判定為停用", r.flags.every((f) => f[1] === true && f[2] === "disabled" && f[3] === false), JSON.stringify(r.flags));
  check("問答｜題目修正", "其他題目不受影響：可出題數＝題庫總數－4", r.enabled === r.total - 4 && r.total === BANK.length, `${r.enabled}/${r.total}`);
  check("問答｜題目修正", "腦筋急轉彎題池：低年級、中年級各少 2 題，且不含停用題", r.poolLow === bankLow - 2 && r.poolMid === bankMid - 2 && r.inPool.length === 0, `low ${r.poolLow}/${bankLow} middle ${r.poolMid}/${bankMid}`);
  check("問答｜題目修正", "正常開局（低／中年級腦筋急轉彎各 40 局、每局不同隨機種子）一次也沒有抽到停用題", r.drawn.low === 0 && r.drawn.middle === 0, JSON.stringify(r.drawn));
  check("問答｜題目修正", "整個流程沒有 JavaScript 錯誤", page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* ========== 2b. 題目修正機制：其他停用方式也照原版規則；多餘欄位與後台資訊不會進入遊戲 ========== */
{
  const { ctx, page } = await newPage();
  const target = BANK.filter((q) => q.gradeBand === "middle" && q.subject === "science").slice(0, 3).map((q) => q.id);
  await page.route("**/universe/quiz/approved-question-overrides.json*", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ schema: "bv-quiz-question-overrides-v1", status: "exported", exportedAt: "2026-11-12T00:00:00Z",
      overrides: { [target[0]]: { disabled: true, reviewNote: "後台備註", updatedBy: "admin" }, [target[1]]: { active: false }, [target[2]]: { quality: "disabled", injected: "<script>" } } }) }));
  await page.goto(uni("?bvPlayerId=" + A.playerId));
  await ready(page); await sleep(400);
  const ov = await page.evaluate((ids) => {
    selectedGrade = "middle"; selectedSubject = "science";
    const pool = getQuestionPool().map((q) => q.id);
    return { state: window.UniverseQuiz.overrideState(), excluded: ids.every((id) => pool.indexOf(id) < 0), poolSize: pool.length,
      note: document.getElementById("bv-override-note").hidden, injected: "injected" in (QUESTION_OVERRIDES[ids[2]] || {}),
      admin: ["reviewNote", "updatedBy"].some((k) => k in (QUESTION_OVERRIDES[ids[0]] || {})) };
  }, target);
  check("問答｜題目修正", "匯出的已核准修正（disabled／active:false／quality:disabled）全部套用：題目不會出現", ov.state.status === "exported" && ov.state.count === 3 && ov.excluded, JSON.stringify(ov));
  check("問答｜題目修正", "只保留出題判定欄位：多餘欄位與後台管理資訊（reviewNote／updatedBy）被丟棄；已同步時不顯示提醒", !ov.injected && !ov.admin && ov.note === true, JSON.stringify(ov));
  await ctx.close();
}

/* ========== 2c. 修正檔讀不到或退回 not_exported → 畫面明確提醒（不默默忽略） ========== */
{
  const { ctx, page } = await newPage();
  await page.route("**/universe/quiz/approved-question-overrides.json*", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ schema: "bv-quiz-question-overrides-v1", status: "not_exported", overrides: {} }) }));
  await page.goto(uni("?bvPlayerId=" + A.playerId));
  await ready(page); await sleep(400);
  const n = await page.evaluate(() => ({ hidden: document.getElementById("bv-override-note").hidden, t: document.getElementById("bv-override-note").textContent }));
  check("問答｜題目修正", "（防退化）修正檔變回 not_exported 時，首頁顯示「尚未同步」提醒", !n.hidden && /尚未同步/.test(n.t), n.t);
  await ctx.close();
}

/* ========== 3. 手機 ========== */
for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
  const { ctx, page } = await newPage({ mobile: true, viewport: vp });
  const tag = `${vp.width}x${vp.height}`;
  await page.goto(uni("?bvPlayerId=" + A.playerId));
  await ready(page); await sleep(500);
  check("問答｜手機", `${tag} 首頁沒有按鈕超出畫面、沒有水平捲動`, (await offscreenButtons(page, "#screen-title")).length === 0 && !(await hasHorizontalScroll(page)), (await offscreenButtons(page, "#screen-title")).join(","));
  await page.screenshot({ path: `${OUT}/quiz-05-mobile-title-${tag}.png` });
  await page.locator("#btn-go-setup").tap();
  await page.waitForSelector("#screen-setup.active");
  await page.locator("#btn-start-quiz").tap();
  await playRoundByClicks(page, ["c"], true);
  check("問答｜手機", `${tag} 觸控完成一局並顯示結算`, /本場成績尚未記入正式排行榜/.test(await text(page, "#save-status")));
  check("問答｜手機", `${tag} 結算畫面沒有按鈕超出畫面`, (await offscreenButtons(page, "#screen-result")).length === 0, (await offscreenButtons(page, "#screen-result")).join(","));
  await page.screenshot({ path: `${OUT}/quiz-06-mobile-result-${tag}.png`, fullPage: true });
  check("問答｜手機", `${tag} 沒有 JavaScript 錯誤`, page.errors.length === 0, page.errors.join(" | "));
  await ctx.close();
}

/* ========== 4. 玩法等價：同題庫、同種子、同作答序列 ========== */
async function scripted(url, isOriginal, grade, subject) {
  const { ctx, page } = await newPage({ isOriginal });
  await page.goto(url);
  await page.waitForFunction(() => typeof QUESTIONS !== "undefined" && QUESTIONS.length > 0, null, { timeout: 20000 });
  if (!isOriginal) await ready(page);
  await sleep(300);
  // 原版的題目修正來自舊 Firebase（測試環境已攔截）；這裡把同一份已核准修正交給原版自己的 applyQuestionOverrides，
  // 等同正式原版載入修正後的狀態，兩邊才是同一個題目池
  if (isOriginal) await page.evaluate((ov) => { QUESTION_OVERRIDES = ov; applyQuestionOverrides(); }, APPROVED.overrides);
  const out = await page.evaluate(async ({ grade, subject, seed }) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    selectedGrade = grade; selectedSubject = subject;
    eval(seed); __bvSeed(77);
    // 數學「生成題」的 ID 含產生當下的時間戳記：開局那一刻把時鐘固定，兩邊才會產生相同 ID（只影響 ID 文字，不影響題目內容）
    const realNow = Date.now; Date.now = () => 1794451140000;
    try { startQuiz(); } finally { Date.now = realNow; quizState.startedAt = realNow(); quizState.questionStartedAt = realNow(); }
    const plan = ["c", "c", "w", "c", "t", "c", "c", "c", "w", "c"];
    const steps = [];
    for (let i = 0; i < 10; i++) {
      const q = quizState.questions[i];
      const mode = plan[i];
      if (mode === "t") answerQuestion(-1, true);
      else answerQuestion(mode === "c" ? q.answerIndex : (q.answerIndex + 1) % q.choices.length);
      await wait(380);
      steps.push([q.id, q.answerIndex, q.choices.join("¦"), quizState.score, quizState.combo, quizState.correctCount].join("#"));
      nextQuestion();
    }
    await wait(200);
    return { steps, ids: quizState.questions.map((q) => q.id), score: quizState.score, correct: quizState.correctCount, maxCombo: quizState.maxCombo,
      answers: quizState.answers.map((a) => [a.questionId, a.selectedIndex, a.answerIndex, a.correct, a.timedOut].join(":")),
      acc: document.getElementById("result-accuracy").textContent, title: document.getElementById("result-title").textContent,
      correctText: document.getElementById("result-correct").textContent, limit: QUESTION_TIME_LIMIT, version: QUIZ_VERSION, bank: QUESTIONS.length };
  }, { grade, subject, seed: H.SEED_FN });
  await ctx.close();
  return out;
}
const eqRows = [];
for (const [grade, subject] of [["low", "math"], ["middle", "mandarin"], ["high", "science"], ["middle", "brain"], ["low", "brain"]]) {
  const o = await scripted(`${ORIGIN}/orig/quiz/index.html`, true, grade, subject);
  const p = await scripted(uni("?bvPlayerId=" + A.playerId), false, grade, subject);
  const label = `${grade}／${subject}`;
  check("問答｜玩法等價", `${label}：同一題庫版本（${o.version}，${o.bank} 題，SHA-256 ${BANK_SHA.slice(0, 12)}…）`, o.version === p.version && o.bank === p.bank && o.bank === BANK.length);
  check("問答｜玩法等價", `${label}：題目順序、每題選項順序與正解位置完全相同`, o.ids.join() === p.ids.join() && o.steps.map((s) => s.split("#").slice(0, 3).join("#")).join("|") === p.steps.map((s) => s.split("#").slice(0, 3).join("#")).join("|"), o.ids.slice(0, 3).join(","));
  check("問答｜玩法等價", `${label}：每題判定（含答錯、逾時）、分數軌跡、連對完全相同`, o.answers.join() === p.answers.join() && o.steps.join("|") === p.steps.join("|"));
  check("問答｜玩法等價", `${label}：結算 分數、答對數、正確率、最高連對、結算標題完全相同`,
    o.score === p.score && o.correct === p.correct && o.maxCombo === p.maxCombo && o.acc === p.acc && o.title === p.title && o.correctText === p.correctText,
    `原版 ${o.score}/${o.correctText}/${o.acc}/C${o.maxCombo}/${o.title}　宇宙版 ${p.score}/${p.correctText}/${p.acc}/C${p.maxCombo}/${p.title}`);
  if (subject === "brain") check("問答｜玩法等價", `${label}：兩邊都沒有抽到已停用的題目`, ![...o.ids, ...p.ids].some((id) => DISABLED_IDS.includes(id)));
  eqRows.push({ grade, subject, questionIds: o.ids, original: { score: o.score, correct: o.correctText, acc: o.acc, maxCombo: o.maxCombo, title: o.title }, universe: { score: p.score, correct: p.correctText, acc: p.acc, maxCombo: p.maxCombo, title: p.title } });
  if (eqRows.length === 1) check("問答｜玩法等價", "每題作答時間相同（15 秒）", o.limit === 15 && p.limit === 15);
}
fs.writeFileSync(`${OUT}/quiz-equivalence.json`, JSON.stringify({ bankSha256: BANK_SHA, rows: eqRows }, null, 1));

/* ========== 5. 全程安全 ========== */
check("問答｜安全", "宇宙版全程沒有連線舊 Firebase、gstatic 或其他未預期外部網址", H.external.length === 0, H.external.slice(0, 5).join(" "));
check("問答｜對照", "（對照組）原版確實會嘗試載入 Firebase SDK — 證明攔截有效", H.originalExternal.some((u) => /gstatic\.com\/firebasejs/.test(u)), H.originalExternal.length + " 筆");
check("問答｜安全", "對玩家 API 只有 GET（唯讀）", H.apiCalls.every((c) => c.startsWith("GET ")));
check("問答｜安全", "玩家資料庫沒有被遊戲改動", JSON.stringify(H.db.root) === dbAfterSeed);
process.exit((await H.finish("quiz-e2e")) ? 0 : 1);

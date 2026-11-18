/* ==========================================================
   氣球小V方塊派對 UI 測試版 — 第二階段品牌視覺（tetris-universe-ui-v0.2.0-test-1）

   範圍（企劃規格 v0.2.0-spec-1）：
     1. 首頁改為上下式：玩家資訊 → 標題 → 小V（V-03）→ 難度＋開始遊戲 → 次要功能
     2. 結算：同一模板，一般「挑戰完成！」＋V-06，新紀錄「新紀錄！」＋V-18
     3. 再玩一次：直接用上一局難度開新局
   做法：只移動／加上畫面元素、換文字與樣式；遊戲核心一個字都不改。
     - 原有按鈕（含 ID 與事件）全部保留，只是排進新的版面
     - 開始遊戲、再玩一次呼叫原版同一組函式（loadPlayer、showScreen、startGame），
       startGame 仍是換殼層包好的版本（開局流程、Sandbox 隔離都照舊）
     - 新紀錄只沿用原版既有的判斷（gameOver 內 score > 本機個人最佳 → 顯示「🏆 新紀錄！」），
       不新增任何紀錄資料
   ========================================================== */
(function () {
  "use strict";
  document.title = "氣球小V方塊派對 🎈｜遊戲宇宙";

  var VERSION = "tetris-universe-ui-v0.3.3";
  var UI_LABEL = "UI v0.3.3";
  var DOC = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  /* 三張既有小V素材（Repository 根目錄 assets/rpg/，本頁在 universe/tetris-ui-test/） */
  var ART = {
    home: "../../assets/rpg/v_full_open_arms.png",     // V-03 首頁歡迎
    result: "../../assets/rpg/v_bust_happy.png",       // V-06 一般結算
    record: "../../assets/rpg/v_bust_congrats.png"     // V-18 新紀錄結算
  };
  /* 難度：沿用原版 showDiffSelect 的三個選項與文字；預設沿用原版 startGame 的預設值 "normal" */
  var DIFFS = [["easy", "🌸 輕鬆"], ["normal", "🎪 普通"], ["hard", "🔥 挑戰"]];
  var DEFAULT_DIFF = "normal";
  var selectedDiff = DEFAULT_DIFF;   // 只存在這個分頁（原版也沒有保存難度）

  var title = $("s-title"), result = $("s-result");
  if (!title || !result) return;
  DOC.classList.add("uit-brand");

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ========================= 首頁 ========================= */
  var logo = $("logo-title");
  var ver = logo ? logo.nextElementSibling : null;                  // 原版版本字樣 v1.3.7
  var deco = title.querySelector(".title-deco");
  var card = title.querySelector(".title-card");
  var sub = title.querySelector(".title-sub");
  var best = title.querySelector(".best-box");
  var idCard = $("bv-identity-card");                               // 換殼層：讀取中／錯誤卡
  var status = $("bv-status-mark");                                 // 換殼層：Sandbox 標示
  var btnStart = $("btn-start"), btnLb = $("btn-lb"), btnProfile = $("btn-change-profile"),
      btnMusic = $("btn-music-title"), btnHow = $("btn-how"), btnLobby = $("bv-btn-lobby");
  var playerCard = $("top-player-card");
  var playerCardHome = playerCard ? playerCard.parentNode : null, playerCardNext = playerCard ? playerCard.nextSibling : null;

  var home = el("div", "uit-home");
  home.id = "uit-home";
  var z1 = el("section", "uit-z uit-z1"); z1.setAttribute("aria-label", "玩家資訊");
  var z2 = el("section", "uit-z uit-z2"); z2.setAttribute("aria-label", "遊戲標題");
  var z3 = el("section", "uit-z uit-z3"); z3.setAttribute("aria-label", "小V");
  var z4 = el("section", "uit-z uit-z4"); z4.setAttribute("aria-label", "難度與開始遊戲");
  var z5 = el("section", "uit-z uit-z5"); z5.setAttribute("aria-label", "其他功能");
  home.appendChild(z1); home.appendChild(z2); home.appendChild(z3); home.appendChild(z4); home.appendChild(z5);

  // 第二區：標題（原版 logo、版本字樣、Sandbox 標示、最高紀錄，都是原元素）
  if (logo) { logo.innerHTML = '<span class="uit-t1">氣球小V</span><span class="uit-t2">方塊派對</span><small>BALLOON V TETRIS</small>'; z2.appendChild(logo); }
  var metaRow = el("div", "uit-meta");
  if (status) metaRow.appendChild(status);
  if (best) metaRow.appendChild(best);
  z2.appendChild(metaRow);
  // 版本：遊戲核心版本（原版字樣，例如 v1.3.7，不改數字）與 UI 測試版本分開顯示
  if (ver) {
    var coreVer = (ver.textContent || "").trim();
    if (/^v\d+\.\d+\.\d+$/.test(coreVer)) ver.textContent = "Game " + coreVer + "｜" + UI_LABEL;
    ver.classList.add("uit-ver"); z2.appendChild(ver);
  }

  // 第三區：V-03（等比例縮放、完整顯示）＋原版歡迎文案
  var hero = el("img", "uit-hero");
  hero.src = ART.home; hero.alt = "小V張開雙手歡迎你"; hero.decoding = "async"; hero.draggable = false;
  hero.width = 378; hero.height = 469;
  z3.appendChild(hero);
  if (sub) { sub.classList.add("uit-welcome"); z3.appendChild(sub); }

  // 第四區：難度（未選取／已選取／按下回饋）＋開始遊戲
  if (idCard) z4.appendChild(idCard);
  var diffBox = el("div", "uit-diff"); diffBox.setAttribute("role", "radiogroup"); diffBox.setAttribute("aria-label", "選擇難度");
  var diffBtns = {};
  DIFFS.forEach(function (d) {
    var b = el("button", "uit-diff-btn", d[1]);
    b.type = "button"; b.dataset.diff = d[0]; b.setAttribute("role", "radio");
    b.addEventListener("click", function () { setDiff(d[0]); });
    diffBtns[d[0]] = b; diffBox.appendChild(b);
  });
  z4.appendChild(el("div", "uit-diff-label", "選擇難度"));
  z4.appendChild(diffBox);
  if (btnStart) { btnStart.classList.add("uit-start"); z4.appendChild(btnStart); }
  var more = el("div", "uit-more", "往下滑還有更多功能 ▾"); more.setAttribute("aria-hidden", "true");
  z4.appendChild(more);

  function setDiff(k) {
    selectedDiff = k;
    Object.keys(diffBtns).forEach(function (key) {
      var on = key === k;
      diffBtns[key].classList.toggle("is-selected", on);
      diffBtns[key].setAttribute("aria-checked", on ? "true" : "false");
      if (diffBtns[key].classList.contains("uit-pngbtn")) {
        diffBtns[key].classList.toggle("uit-png-yellow", on);
        diffBtns[key].classList.toggle("uit-png-blue", !on);
      }
    });
  }
  setDiff(DEFAULT_DIFF);

  // 第五區：次要功能（全部是原有按鈕；不新增功能）
  [btnLb, btnProfile, btnHow, btnMusic, btnLobby].forEach(function (b) { if (b) { b.classList.add("uit-sec"); z5.appendChild(b); } });

  // 原版 title-card 與裝飾保留在頁面中（隱藏），裡面已經沒有可見的功能
  if (card) card.classList.add("uit-hidden");
  if (deco) deco.classList.add("uit-hidden");
  title.insertBefore(home, title.firstChild);

  /* 第一區：玩家資訊卡（原版 #top-player-card，資料與點擊開啟角色設定都不變）
     只在首頁時放進版面；離開首頁就放回原位（其他畫面維持原樣） */
  function placePlayerCard() {
    if (!playerCard) return;
    var onHome = !title.classList.contains("off");
    if (onHome && playerCard.parentNode !== z1) { z1.appendChild(playerCard); playerCard.classList.add("uit-in-home"); }
    if (!onHome && playerCard.parentNode === z1) {
      playerCard.classList.remove("uit-in-home");
      if (playerCardNext && playerCardNext.parentNode === playerCardHome) playerCardHome.insertBefore(playerCard, playerCardNext);
      else playerCardHome.appendChild(playerCard);
    }
  }

  /* v0.2.1：原始金框按鈕 PNG（紫＝主要、黃＝已選難度、藍＝其他）。只加 class，按鈕元素與事件不變 */
  function skin(b, color) {
    if (!b) return;
    b.classList.add("uit-pngbtn");
    ["uit-png-purple", "uit-png-yellow", "uit-png-blue"].forEach(function (c) { b.classList.remove(c); });
    b.classList.add("uit-png-" + color);
  }
  skin(btnStart, "purple");
  [btnLb, btnProfile, btnHow, btnMusic, btnLobby].forEach(function (b) { skin(b, "blue"); });
  skin($("btn-replay"), "purple");
  ["btn-res-lb", "btn-res-home", "btn-res-profile", "btn-lb-back"].forEach(function (id) { skin($(id), "blue"); });
  Object.keys(diffBtns).forEach(function (k) { skin(diffBtns[k], k === selectedDiff ? "yellow" : "blue"); });

  /* 文案：玩家可見的「玩家設定」統一為「角色設定」（ID、函式、資料欄位都不改） */
  var profH = document.querySelector("#s-profile h2");
  if (profH && /玩家設定/.test(profH.textContent)) profH.textContent = profH.textContent.replace("玩家設定", "角色設定");
  if (playerCard && /玩家設定/.test(playerCard.getAttribute("title") || "")) playerCard.setAttribute("title", playerCard.getAttribute("title").replace("玩家設定", "角色設定"));

  /* 開始遊戲：直接用首頁選好的難度開局
     原版：開始 → goProfile（檢查玩家、loadPlayer）→ 難度視窗 → startGame(diff)。
     現在：開始 → 同樣檢查玩家、loadPlayer → showScreen("s-game") → startGame(選好的難度) */
  function startSelected() {
    if (!window.UniverseTetris || !UniverseTetris.isReady()) { if (window.UniverseTetris) UniverseTetris.explainNotReady(); return; }
    if (typeof loadPlayer === "function") loadPlayer();
    showScreen("s-game");
    window.startGame(selectedDiff);
  }
  if (btnStart && typeof goProfile === "function") {
    btnStart.removeEventListener("click", goProfile);
    btnStart.addEventListener("click", startSelected);
  }

  /* 第三區小V高度：依實際可視高度計算（瀏覽器工具列、安全區域都算進去）
     主要操作（第 1～4 區）優先一屏；放得下時第 5 區也放進第一屏 */
  var MIN_H = 100, MAX_H = 220;
  function fitHero() {
    if (title.classList.contains("off")) return;
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var vw = window.innerWidth;
    // 上限：寬度的一半、可視高度約 20%（企劃參考：320×640 約 100–130、390×844 約 160–190、430×932 約 190–220）
    var cap = Math.max(MIN_H, Math.min(MAX_H, Math.round(Math.min(vw, 440) * 0.5), Math.floor(vh * 0.204)));
    var cs = getComputedStyle(home);
    var pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.rowGap || cs.gap || 0) * 4;
    var welcomeH = sub ? sub.getBoundingClientRect().height + 4 : 0;
    var h1 = z1.getBoundingClientRect().height, h2 = z2.getBoundingClientRect().height,
        h4 = z4.getBoundingClientRect().height - (more.offsetParent ? more.getBoundingClientRect().height : 0),
        h5 = z5.getBoundingClientRect().height;
    var availAll = vh - pad - h1 - h2 - h4 - h5 - welcomeH;
    var availMain = vh - pad - h1 - h2 - h4 - welcomeH;
    var h = availAll >= MIN_H + 20 ? Math.min(cap, availAll) : Math.max(MIN_H, Math.min(cap, availMain));
    h = Math.floor(h);
    DOC.style.setProperty("--uit-hero-h", h + "px");
    // 第 5 區在第一屏以下時，顯示輕微的向下提示（不覆蓋任何按鈕）
    requestAnimationFrame(function () {
      var below = z5.getBoundingClientRect().top > vh - 8 && title.scrollTop < 4;
      more.classList.toggle("is-on", below);
    });
    return h;
  }
  var fitQueued = false;
  function queueFit() { if (fitQueued) return; fitQueued = true; requestAnimationFrame(function () { fitQueued = false; fitHero(); }); }
  window.addEventListener("resize", queueFit);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", queueFit);
  title.addEventListener("scroll", function () { if (title.scrollTop > 4) more.classList.remove("is-on"); }, { passive: true });
  hero.addEventListener("load", queueFit);
  if (window.ResizeObserver) new ResizeObserver(queueFit).observe(z1);

  /* ========================= 結算 ========================= */
  var resCard = result.querySelector(".res-card");
  var resTitle = result.querySelector(".res-title");
  var resEmoji = $("res-emoji");
  var newBest = $("new-best");
  var resArt = el("img", "uit-res-art");
  resArt.alt = ""; resArt.decoding = "async"; resArt.draggable = false;
  if (resEmoji) resEmoji.insertAdjacentElement("afterend", resArt);
  [ART.result, ART.record].forEach(function (src) { var i = new Image(); i.src = src; });   // 預先載入，切換時不閃

  var homeBtn = $("btn-res-home");
  if (homeBtn) homeBtn.textContent = "🏠 回方塊首頁";   // 目的地不變：方塊遊戲首頁（不是遊戲宇宙）

  /* 依原版既有判斷決定：#new-best 由 gameOver() 在顯示結算前設定（score > 本機個人最佳） */
  function applyResultMode() {
    var isRecord = !!(newBest && newBest.style.display === "block");
    result.classList.toggle("uit-record", isRecord);
    if (resTitle) resTitle.textContent = isRecord ? "新紀錄！" : "挑戰完成！";
    resArt.src = isRecord ? ART.record : ART.result;
    resArt.width = isRecord ? 340 : 319; resArt.height = isRecord ? 358 : 355;
    resArt.alt = isRecord ? "小V歡呼慶祝新紀錄" : "小V開心地為你鼓掌";
    if (resCard) resCard.dataset.mode = isRecord ? "record" : "normal";
  }

  /* 再玩一次：直接用上一局難度開新局（不回難度選擇）
     原版：再玩一次 → showDiffSelect → 選難度 → startGame(diff)。
     上一局的成績在 gameOver() 當下就已交給換殼層（finishRun 取走該場的場次），
     新局由 startGame 重新取得場次與 submissionId，所以不會重送上一局成績或獎勵。 */
  var replayBtn = $("btn-replay");
  var replayLock = false;
  function replaySameDiff() {
    if (replayLock || result.classList.contains("off")) return;   // 防止連點開兩局
    if (!window.UniverseTetris || !UniverseTetris.isReady()) { if (window.UniverseTetris) UniverseTetris.explainNotReady(); return; }
    var last = (typeof diff === "string" && diff) ? diff : selectedDiff;   // 原版全域：上一局難度（只讀）
    replayLock = true;
    setTimeout(function () { replayLock = false; }, 600);
    showScreen("s-game");
    window.startGame(last);
  }
  if (replayBtn && typeof showDiffSelect === "function") {
    replayBtn.removeEventListener("click", showDiffSelect);
    replayBtn.addEventListener("click", replaySameDiff);
  }

  /* ========================= 畫面切換 ========================= */
  /* Sandbox 標示：首頁、結算時放進版面最下方（不再固定在畫面底部遮住按鈕）；其他畫面維持原位 */
  var badge = $("uit-badge-page"), badgeHome = badge ? badge.parentNode : null;
  var badgeSlotHome = el("div", "uit-badge-slot"), badgeSlotResult = el("div", "uit-badge-slot");
  home.appendChild(badgeSlotHome);
  if (resCard) resCard.appendChild(badgeSlotResult);
  function placeBadge() {
    if (!badge) return;
    var target = !title.classList.contains("off") ? badgeSlotHome : (!result.classList.contains("off") ? badgeSlotResult : badgeHome);
    if (badge.parentNode !== target) target.appendChild(badge);
    badge.classList.toggle("uit-badge-inline", target !== badgeHome);
  }

  function onScreens() {
    DOC.classList.toggle("uit-on-home", !title.classList.contains("off"));
    DOC.classList.toggle("uit-on-result", !result.classList.contains("off"));
    placePlayerCard();
    placeBadge();
    if (!title.classList.contains("off")) { queueFit(); }
    if (!result.classList.contains("off")) applyResultMode();
  }
  var mo = new MutationObserver(onScreens);
  [title, result, $("s-lb")].forEach(function (s) { if (s) mo.observe(s, { attributes: true, attributeFilter: ["class"] }); });
  onScreens();
  // The server verdict can arrive after the result screen's 500ms transition.
  if (newBest) new MutationObserver(function () { if (!result.classList.contains("off")) applyResultMode(); })
    .observe(newBest, { attributes: true, attributeFilter: ["style"] });

  window.BVUiBrand = {
    version: VERSION,
    art: ART,
    getSelectedDiff: function () { return selectedDiff; },
    fitHero: fitHero
  };
})();

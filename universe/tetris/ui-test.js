/* ==========================================================
   氣球小V方塊派對 UI 測試版 — 手機版 UI 重新配置（tetris-universe-ui-v0.1.0-test-2）

   只改「畫面配置」，遊戲核心一個字都不改：
     - 方塊、旋轉、碰撞、計分、連消、速度、關卡、落下鎖定、結束判定：完全沒有碰
     - 按鍵只呼叫原版既有的同一組函式（mLeft／mRight／mDown＋lock／tryRotate／hardDrop），
       判斷條件與原版鍵盤相同（running 且未暫停）
     - 棋盤：原版 initCanvas() 先照常執行，手機版再依可用空間重新決定格子大小（整數像素、正方形）
   桌機版（寬度 > 900 且不是觸控橫式手機）完全維持原版畫面與鍵盤操作。
   ========================================================== */
(function () {
  "use strict";

  var VERSION = "tetris-universe-ui-v0.1.0-test-2";
  var DOC = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 可調參數（給企劃驗收時調整） ---------- */
  var CFG = {
    btnAlpha: 0.35,       // 按鍵背景不透明度（初始值 35%）
    btnMax: 64,           // 按鍵最大直徑（CSS px）
    btnMin: 52,           // 單列配置的最小直徑；小於這個就改成「右側上下兩層」配置，不再縮小
    btnGap: 10,           // 同一組按鍵之間的距離
    edge: 10,             // 按鍵離螢幕邊緣（再加安全區域）
    middleGap: 16,        // 左右兩組之間至少保留的距離
    moveDelay: 170,       // 左右長按：開始連續移動前的等待（毫秒）
    moveRepeat: 55,       // 左右長按：連續移動間隔
    downDelay: 120,       // 加速下降長按：開始連續下降前的等待
    downRepeat: 45        // 加速下降長按：連續下降間隔
  };

  /* ---------- 版面模式 ---------- */
  var coarse = window.matchMedia ? window.matchMedia("(pointer: coarse)") : { matches: false };
  function isMobileLayout() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w <= 900) return true;                    // 與原版手機判斷相同
    return !!coarse.matches && h <= 500;          // 大尺寸手機橫式（例如 915×412）也用手機版
  }
  function isLandscape() { return window.innerWidth > window.innerHeight; }
  function gameScreenOn() { var g = $("s-game"); return !!(g && !g.classList.contains("off")); }
  function canAct() {
    try { return running === true && paused !== true; } catch (e) { return false; }   // 原版全域狀態（只讀）
  }

  /* ---------- 標記原版 HUD 元素（只加 class，不移動、不刪除） ---------- */
  function tag(el, cls) { if (el) el.classList.add(cls); return el; }
  function card(id) { var el = $(id); return el ? el.closest(".hud-card") : null; }
  tag($("g-avatar") && $("g-avatar").parentElement, "uit-id");
  tag(card("hud-score"), "uit-score");
  tag(card("hud-combo"), "uit-combo");
  tag(card("hud-lines"), "uit-lines");
  tag(card("hud-level"), "uit-level");
  tag(card("next-canvas"), "uit-next");
  tag(document.querySelector("#s-game .ctrl-hint") && document.querySelector("#s-game .ctrl-hint").closest(".hud-card"), "uit-hint");
  tag($("pause-btn"), "uit-pause");
  tag($("btn-quit"), "uit-quit");
  tag(document.querySelector("#s-game .music-mini"), "uit-music");
  tag($("game-mid"), "uit-board");

  /* 全螢幕：HUD 內的對應按鈕（呼叫原版 toggleFullscreen） */
  var fsBtn = document.createElement("button");
  fsBtn.type = "button"; fsBtn.id = "uit-fs"; fsBtn.className = "uit-hud-btn"; fsBtn.title = "全螢幕"; fsBtn.setAttribute("aria-label", "全螢幕");
  fsBtn.textContent = "⛶";
  fsBtn.addEventListener("click", function () { if (typeof toggleFullscreen === "function") toggleFullscreen(); });
  $("s-game").appendChild(fsBtn);
  function syncFs() {
    var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    fsBtn.textContent = on ? "✕" : "⛶";
    fsBtn.title = on ? "退出全螢幕" : "全螢幕";
  }
  document.addEventListener("fullscreenchange", syncFs);
  document.addEventListener("webkitfullscreenchange", syncFs);

  /* Sandbox 標示：棋盤左上角（遊戲中）＋其他畫面左下角 */
  if (window.UniverseTetris && UniverseTetris.session.isSandbox) {
  var badgeBoard = document.createElement("div");
  badgeBoard.id = "uit-badge-board"; badgeBoard.className = "uit-badge"; badgeBoard.textContent = "🧪 Sandbox";
  ($("g-avatar") && $("g-avatar").parentElement || $("board-wrap")).appendChild(badgeBoard);   // 放在身份旁，不遮棋盤
  var badgePage = document.createElement("div");
  badgePage.id = "uit-badge-page"; badgePage.className = "uit-badge"; badgePage.textContent = "🧪 UI 測試版｜Sandbox｜不寫入正式資料";
  document.body.appendChild(badgePage);
  }

  /* ---------- 觸控按鍵 ---------- */
  var ICONS = {
    left:   '<path d="M15 5l-7 7 7 7"/>',
    right:  '<path d="M9 5l7 7-7 7"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
    down:   '<path d="M6 9l6 6 6-6"/>',
    drop:   '<path d="M6 5l6 6 6-6"/><path d="M6 12l6 6 6-6"/><path d="M5 21h14"/>'
  };
  var LABELS = { left: "向左", right: "向右", rotate: "旋轉", down: "加速下降", drop: "直接落下" };
  var ACTIONS = {
    left:   { run: function () { mLeft(); },  repeat: true, delay: CFG.moveDelay, every: CFG.moveRepeat },
    right:  { run: function () { mRight(); }, repeat: true, delay: CFG.moveDelay, every: CFG.moveRepeat },
    down:   { run: function () { if (!mDown()) lock(); }, repeat: true, delay: CFG.downDelay, every: CFG.downRepeat },   // 與原版 ↓ 鍵相同
    rotate: { run: function () { tryRotate(); }, repeat: false },
    drop:   { run: function () { hardDrop(); },  repeat: false }
  };

  var ctrl = document.createElement("div");
  ctrl.id = "uit-ctrl"; ctrl.setAttribute("aria-label", "觸控操作"); ctrl.hidden = true;
  var groupL = document.createElement("div"); groupL.className = "uit-group uit-group-l";
  var groupR = document.createElement("div"); groupR.className = "uit-group uit-group-r";
  ctrl.appendChild(groupL); ctrl.appendChild(groupR);
  var buttons = {};
  function makeBtn(name, parent) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "uit-btn uit-btn-" + name; b.dataset.act = name;
    b.setAttribute("aria-label", LABELS[name]); b.title = LABELS[name];
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";
    parent.appendChild(b); buttons[name] = b;
    return b;
  }
  makeBtn("left", groupL); makeBtn("right", groupL);
  var rowTop = document.createElement("div"); rowTop.className = "uit-row uit-row-top";
  var rowBottom = document.createElement("div"); rowBottom.className = "uit-row uit-row-bottom";
  groupR.appendChild(rowTop); groupR.appendChild(rowBottom);
  makeBtn("rotate", rowTop); makeBtn("down", rowBottom); makeBtn("drop", rowBottom);
  document.body.appendChild(ctrl);
  DOC.style.setProperty("--uit-btn-alpha", String(CFG.btnAlpha));

  /* 每個按鍵各自追蹤「哪一根手指按著」→ 多點觸控互不干擾 */
  var held = {};   // name → { pointerId, timer }
  var stats = { presses: 0, repeats: 0, cancels: 0 };   // 測試用計數（不影響遊戲）

  function stop(name, why) {
    var h = held[name];
    if (!h) return;
    clearTimeout(h.timer); clearInterval(h.timer);
    delete held[name];
    buttons[name].classList.remove("is-down");
    if (why === "cancel") stats.cancels++;
  }
  function stopAll(why) { Object.keys(held).forEach(function (n) { stop(n, why); }); }

  function fire(name, isRepeat) {
    if (!canAct()) { stop(name); return false; }
    ACTIONS[name].run();
    if (isRepeat) stats.repeats++; else stats.presses++;
    return true;
  }

  function onDown(e) {
    var b = e.currentTarget, name = b.dataset.act;
    e.preventDefault();
    if (held[name]) return;                         // 同一顆鍵已經被另一根手指按著
    try { b.setPointerCapture(e.pointerId); } catch (err) {}
    b.classList.add("is-down");
    var h = held[name] = { pointerId: e.pointerId, timer: null };
    if (!fire(name, false)) return;
    var a = ACTIONS[name];
    if (a.repeat) {
      h.timer = setTimeout(function () {
        if (held[name] !== h) return;
        h.timer = setInterval(function () { if (held[name] === h) fire(name, true); }, a.every);
      }, a.delay);
    }
  }
  function onUp(e) {
    var name = e.currentTarget.dataset.act;
    if (held[name] && held[name].pointerId === e.pointerId) stop(name, e.type === "pointercancel" ? "cancel" : "up");
  }
  Object.keys(buttons).forEach(function (name) {
    var b = buttons[name];
    b.addEventListener("pointerdown", onDown);
    b.addEventListener("pointerup", onUp);
    b.addEventListener("pointercancel", onUp);
    b.addEventListener("lostpointercapture", onUp);
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    // 阻止 iOS 雙擊縮放與模擬滑鼠事件（觸控仍由 pointer 事件處理）
    b.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });
    b.addEventListener("click", function (e) { e.preventDefault(); });
  });
  // 視窗失焦、切到背景、離開頁面：全部放開，不會卡鍵
  window.addEventListener("blur", function () { stopAll("cancel"); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stopAll("cancel"); });
  window.addEventListener("pagehide", function () { stopAll("cancel"); });

  /* ---------- 按鍵配置：依寬度決定大小；太窄就改兩層，不把按鍵縮到難按 ---------- */
  // 安全區域：用探測元素讀出 env(safe-area-inset-*) 的實際像素
  var probe = document.createElement("div");
  probe.id = "uit-safe-probe";
  probe.setAttribute("aria-hidden", "true");
  document.body.appendChild(probe);
  function safe(name) {
    var cs = getComputedStyle(probe);
    var v = { l: cs.paddingLeft, r: cs.paddingRight, t: cs.paddingTop, b: cs.paddingBottom }[name];
    return parseFloat(v) || 0;
  }
  function layoutButtons() {
    var w = window.innerWidth;
    var avail = w - safe("l") - safe("r") - CFG.edge * 2 - CFG.middleGap;
    var size = Math.floor((avail - CFG.btnGap * 3) / 5);   // 單列：左 2 顆＋右 3 顆
    var stacked = false;
    if (size < CFG.btnMin) {                              // 右側改成「旋轉在上、加速／落下在下」
      stacked = true;
      size = Math.floor((avail - CFG.btnGap * 2) / 4);
    }
    size = Math.max(Math.min(size, CFG.btnMax), 44);      // 44px：觸控最小可用尺寸（只有極窄螢幕才會用到）
    ctrl.classList.toggle("is-stacked", stacked);
    DOC.style.setProperty("--uit-btn", size + "px");
    DOC.style.setProperty("--uit-btn-gap", CFG.btnGap + "px");
    DOC.style.setProperty("--uit-edge", CFG.edge + "px");
    return { size: size, stacked: stacked };
  }

  /* ---------- 棋盤尺寸：手機版依可用空間重新計算（正方形整數格） ---------- */
  var BORDER = 4;   // #board-wrap 左右／上下邊框合計
  function fitBoard() {
    var mid = $("game-mid"), canvas = $("board-canvas");
    if (!mid || !canvas) return null;
    var r = mid.getBoundingClientRect();
    var availW = r.width - BORDER, availH = r.height - BORDER;
    if (isLandscape()) availW = Math.min(availW, window.innerWidth * 0.56 - BORDER);
    var cell = Math.floor(Math.min(availH / ROWS, availW / COLS));
    if (!(cell > 0)) return null;
    cell = Math.max(cell, 10);
    CELL = cell;                                   // 原版全域格子大小（所有繪圖都用它）
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    canvas.style.width = canvas.width + "px";      // 顯示尺寸＝實際像素，不拉伸
    canvas.style.height = canvas.height + "px";
    DOC.style.setProperty("--uit-board-w", (COLS * CELL + BORDER) + "px");
    return cell;
  }
  function clearBoardStyle() {
    var canvas = $("board-canvas");
    if (canvas) { canvas.style.width = ""; canvas.style.height = ""; }
  }

  /* 原版 initCanvas 照常執行（取得畫布、粒子畫布大小…），手機版再改格子大小 */
  var originalInitCanvas = window.initCanvas;
  window.initCanvas = function () {
    var out = originalInitCanvas.apply(this, arguments);
    applyMode();
    if (DOC.classList.contains("uit-m")) {
      if (isLandscape()) fitBoard();               // 橫式：先算一次，讓棋盤欄寬就定位
      fitBoard();
    } else {
      clearBoardStyle();
    }
    return out;
  };

  /* ---------- 狀態同步：模式、遊戲畫面、暫停 ---------- */
  function applyMode() {
    var m = isMobileLayout();
    DOC.classList.toggle("uit-m", m);
    DOC.classList.toggle("uit-land", m && isLandscape());
    DOC.classList.toggle("uit-game", gameScreenOn());
    var playing = false;
    try { playing = running === true && paused !== true; } catch (e) {}
    DOC.classList.toggle("uit-playing", playing);
    var show = m && gameScreenOn() && playing;
    if (ctrl.hidden === show) ctrl.hidden = !show;
    if (!show) stopAll("cancel");
    if (m) layoutButtons();
  }

  var refitQueued = false;
  function refit() {
    if (refitQueued) return;
    refitQueued = true;
    requestAnimationFrame(function () {
      refitQueued = false;
      applyMode();
      if (!gameScreenOn()) return;
      if (typeof window.initCanvas === "function") window.initCanvas();
      try { if (board && cur && typeof draw === "function") draw(); } catch (e) {}
    });
  }

  // 網址列收合／展開、旋轉、鍵盤彈出：都重新計算
  window.addEventListener("resize", refit);
  window.addEventListener("orientationchange", refit);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe($("game-mid"));
  // 畫面切換（開始遊戲、離開、結算）
  new MutationObserver(function () { applyMode(); if (!gameScreenOn()) stopAll("cancel"); })
    .observe($("s-game"), { attributes: true, attributeFilter: ["class"] });
  // 暫停／繼續、遊戲結束：原版沒有事件，輕量輪詢（只讀狀態、只切換 class）
  setInterval(applyMode, 120);
  applyMode();

  window.BVUiTest = {
    version: VERSION,
    config: CFG,
    stats: stats,
    held: held,
    isMobileLayout: isMobileLayout,
    layoutButtons: layoutButtons,
    fitBoard: fitBoard
  };
})();

/* ==========================================================
   氣球小V遊戲宇宙 — RPG 對話框元件
   balloon-v-universe-v0.3.3-rpg-ux-polish-test-1

   用法：
     RpgDialogue.play(lines, opts) / RpgDialogue.ask(lines, opts) → Promise<{ choice, skipped }>
   每一句：
     text: "一般文字，可用 {t:操作目標} {i:身份名詞} {n:重要提醒} 強調"（見 rpg-text.js）
     ask:  "要再試一次嗎？"                  有選項時：先顯示 text，最後一頁只放這個短問句＋選項
     choices: [{ label, value, primary }]   選項按鈕（v0.3.3：顯示在對話框內、文字下方）
     noSkip: true                            重要提醒，不可略過
     waitAction: true                        等待玩家在畫面上實際操作（教學用），由外部 RpgDialogue.next() 繼續
     nextHint: "按紫色箭頭繼續 ▶"            一開始就顯示紫色箭頭提示
     actor: { mood, full, enter, sparkle, gesture }   角色演出（rpg-actor.js）
   opts：
     shield: false     不用全畫面保護層（新手卡片、教學）
     focus: false      不進入「對話專注」狀態（教學自己有聚光燈與防呆時使用）
     keep: () => [元素]  對話專注時仍保持亮度的元素（例如剛做好的通行證）；一樣不可操作
     allowSkip: false
     avoid: () => [元素或 DOMRect…]   對話框要避開（並靠近）的目標
     onWaitClick: fn   waitAction 時玩家點了對話框

   v0.3.3：
   - 長文字依 PNG 實際奶油色可寫範圍自動分頁（不縮小字、不裁切、不捲動）
   - 關鍵字強調可和逐字顯示一起使用
   - 選項顯示在對話框內；顯示選項時隱藏紫色箭頭
   - 對話專注：只要按紫色箭頭／選選項時，背景變暗、不可操作；點其他地方溫和提醒
   ========================================================== */

(function () {
  "use strict";

  var CFG = (window.MAP_CONFIG && window.MAP_CONFIG.dialogue) || {};
  var ACFG = (window.MAP_CONFIG && window.MAP_CONFIG.audio) || {};
  var desktopMQ = window.matchMedia((window.MAP_CONFIG && window.MAP_CONFIG.desktopQuery) || "(min-width: 900px)");
  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var RT = window.RpgText;
  function sfx(n) { try { if (window.BVAudio) window.BVAudio.sfx(n); } catch (e) {} }
  var Actor = window.RpgActor || null;
  function actorCall(fn) { if (!Actor) return; try { fn(Actor); } catch (e) { console.warn("[RpgActor]", e); } }

  var el = {
    root: document.getElementById("rpg"),
    shield: document.getElementById("rpgShield"),
    wrap: document.getElementById("rpgWrap"),
    box: document.getElementById("rpgBox"),
    portrait: document.getElementById("rpgPortrait"),
    name: document.getElementById("rpgName"),
    text: document.getElementById("rpgText"),
    next: document.getElementById("rpgNext"),
    nextHint: document.getElementById("rpgNextHint"),
    skip: document.getElementById("rpgSkip"),
    choices: document.getElementById("rpgChoices"),
    dim: document.getElementById("rpgDim")
  };
  var dimBlocks = el.dim ? [].slice.call(el.dim.children) : [];

  var s = { lines: [], index: 0, chars: [], pages: [], page: 0, shown: 0, timer: 0, typing: false, opts: {}, resolve: null, lastFocus: null, placeTimer: 0 };

  function play(lines, opts) {
    if (!lines || !lines.length) return Promise.resolve({ choice: null, skipped: false });
    var wasOpen = !el.root.hidden;
    finish(null, true);
    s.lines = lines;
    s.index = 0;
    s.opts = opts || {};
    s.lastFocus = document.activeElement;
    el.root.hidden = false;
    el.root.classList.toggle("rpg--noshield", s.opts.shield === false);
    document.body.classList.add("rpg-open");
    if (window.BVAudio) window.BVAudio.duck(true);
    if (!wasOpen && !(Actor && Actor.recentlyVisible())) sfx("pop");
    showLine();
    clearInterval(s.placeTimer);
    s.placeTimer = setInterval(place, 250);
    return new Promise(function (resolve) { s.resolve = resolve; });
  }

  function current() { return s.lines[s.index] || {}; }
  function hasChoices(line) { return !!(line.choices && line.choices.length); }
  function onLastPage() { return s.page >= s.pages.length - 1; }

  /* ---------- 對話專注：只等紫色箭頭或選項時，背景變暗、不可操作 ---------- */
  var keepEls = [];
  function setFocus(on) {
    keepEls.forEach(function (k) { k.classList.remove("rpg-keep"); });
    keepEls = [];
    el.root.classList.toggle("rpg--focus", !!on);
    document.body.classList.toggle("rpg-focus", !!on);
    if (on && s.opts.keep) {
      try { keepEls = (s.opts.keep() || []).filter(Boolean); } catch (e) { keepEls = []; }
      keepEls.forEach(function (k) { k.classList.add("rpg-keep"); });
    }
    layoutDim();
  }
  /* 暗化層：四塊圍出保持亮度的元素（沒有 keep 時整片暗化） */
  function layoutDim() {
    if (!dimBlocks.length || !el.root.classList.contains("rpg--focus")) return;
    var W = window.innerWidth, H = window.innerHeight;
    var r = null;
    keepEls.forEach(function (k) {
      if (!k.isConnected || k.hidden) return;
      var b = k.getBoundingClientRect();
      if (!b.width) return;
      r = r ? { l: Math.min(r.l, b.left), t: Math.min(r.t, b.top), r: Math.max(r.r, b.right), b: Math.max(r.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
    });
    if (!r) r = { l: 0, t: 0, r: 0, b: 0 };
    var pad = r.r > r.l ? 6 : 0;
    var l = Math.max(0, r.l - pad), t = Math.max(0, r.t - pad), rr = Math.min(W, r.r + pad), bb = Math.min(H, r.b + pad);
    var set = function (blk, x, y, w, h) { blk.style.left = x + "px"; blk.style.top = y + "px"; blk.style.width = Math.max(0, w) + "px"; blk.style.height = Math.max(0, h) + "px"; };
    if (rr <= l) { set(dimBlocks[0], 0, 0, W, H); set(dimBlocks[1], 0, 0, 0, 0); set(dimBlocks[2], 0, 0, 0, 0); set(dimBlocks[3], 0, 0, 0, 0); return; }
    set(dimBlocks[0], 0, 0, W, t);
    set(dimBlocks[1], 0, bb, W, H - bb);
    set(dimBlocks[2], 0, t, l, bb - t);
    set(dimBlocks[3], rr, t, W - rr, bb - t);
  }
  function focusWanted(line) {
    if (s.opts.focus === false) return false;
    return !line.waitAction;            // 教學「實際操作」步驟：保留目標亮度與操作
  }

  function showLine() {
    var line = current();
    el.name.textContent = line.speaker || CFG.speakerName || "";

    var portrait = line.portrait || CFG.portrait;
    if (portrait) { el.portrait.style.backgroundImage = "url('" + portrait + "')"; el.portrait.hidden = false; }
    else el.portrait.hidden = true;

    el.skip.hidden = !(s.opts.allowSkip !== false && !line.noSkip);
    el.root.classList.toggle("rpg--wait", !!line.waitAction);
    setFocus(focusWanted(line));

    // 角色先決定大小（半身像在對話框上方需要預留的空間），再分頁與定位
    actorCall(function (A) { A.show(line.actor || { mood: "normal" }, { avoid: s.opts.avoid }); A.size(); });

    // 文字 → 每個字＋強調樣式；有選項且有短問句時，問句單獨成為最後一頁
    var body = RT.parse(line.text || "");
    var ask = line.ask ? RT.parse(line.ask) : null;
    s.chars = ask && body.length ? body.concat([{ ch: "\n", cls: "", cut: true }], ask) : (ask || body);
    s.pages = paginateLine(line, body.length, !!ask);
    s.page = 0;
    showPage();
  }

  /* 依實際文字區大小分頁；最後一頁若有選項，使用「下方放選項」的較矮文字區量測 */
  function paginateLine(line, bodyLen, hasAsk) {
    el.root.classList.remove("rpg--choosing");
    clearChoices();
    var pages;
    if (hasAsk && bodyLen) {
      pages = RT.paginate(el.text, s.chars.slice(0, bodyLen)).concat(
        shiftPages(RT.paginate(el.text, s.chars.slice(bodyLen + 1), { lastLayout: choiceLayout(line) }), bodyLen + 1));
    } else {
      pages = RT.paginate(el.text, s.chars, hasChoices(line) ? { lastLayout: choiceLayout(line) } : null);
    }
    return pages;
  }
  function shiftPages(p, d) { return p.map(function (x) { return [x[0] + d, x[1] + d]; }); }

  /* 量測用：暫時放上選項按鈕，讓文字區變矮；回傳還原函式 */
  function choiceLayout(line) {
    return function () {
      buildChoices(line, true);
      return function () { clearChoices(); };
    };
  }

  function clearChoices() {
    el.choices.innerHTML = "";
    el.choices.hidden = true;
    el.choices.classList.remove("is-tray");
    el.text.style.bottom = "";
    el.root.classList.remove("rpg--choosing");
  }
  /* 選項放在對話框內、文字下方；文字區底部自動上移到選項上方。
     按鈕排不下一列（太窄）時改放在對話框正下方的選項列（仍屬於對話框，不會跑到畫面上方） */
  function buildChoices(line, measureOnly) {
    el.choices.innerHTML = "";
    el.choices.classList.remove("is-tray");
    el.choices.classList.toggle("is-many", line.choices.length >= 3);   // 三個以上選項：按鈕稍微精簡，才能放在框內
    line.choices.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "rpg__choice" + (c.primary ? " rpg__choice--primary" : "");
      b.textContent = c.label;
      if (!measureOnly) b.addEventListener("click", function (e) { e.stopPropagation(); sfx("confirm"); finish({ choice: c.value, skipped: false }); });
      el.choices.appendChild(b);
    });
    el.choices.hidden = false;
    el.root.classList.add("rpg--choosing");
    var first = el.choices.firstElementChild;
    var oneRow = Array.prototype.every.call(el.choices.children, function (b) { return Math.abs(b.offsetTop - first.offsetTop) < 4; });
    if (oneRow) {
      var boxH = el.box.clientHeight;
      var top = el.choices.offsetTop;   // 選項列在對話框內的位置
      el.text.style.bottom = Math.max(0, boxH - top + 2) + "px";
      // 字體放大（系統文字縮放）時，選項上方連一行字都放不下 → 改用對話框正下方的選項列
      var lh = parseFloat(getComputedStyle(el.text).lineHeight) || 20;
      if (el.text.clientHeight < lh - 1) oneRow = false;
    }
    if (!oneRow) {
      el.choices.classList.add("is-tray");
      el.text.style.bottom = "";
    }
  }

  function showPage() {
    var line = current();
    var pg = s.pages[s.page] || [0, s.chars.length];
    var last = onLastPage();
    clearChoices();
    if (last && hasChoices(line)) buildChoices(line, true);   // 先排好版面（按鈕在文字打完才可以按）
    el.choices.classList.add("is-pending");
    el.root.classList.toggle("rpg--hintnext", !!line.nextHint && !(last && hasChoices(line)));
    el.root.classList.remove("rpg--nudge", "rpg--ready");
    setNextHint(line.nextHint && !(last && hasChoices(line)) ? line.nextHint : "", false);
    s.shown = 0;
    s.typing = true;
    RT.render(el.text, s.chars, 0, pg[0], pg[1]);
    el.text.setAttribute("aria-label", s.chars.slice(pg[0], pg[1]).map(function (c) { return c.ch; }).join(""));
    actorCall(function (A) { A.talk(true); });
    place();

    var speed = CFG.typeSpeedMs == null ? 45 : CFG.typeSpeedMs;
    var every = ACFG.typeSoundEvery || 3;
    if (speed <= 0 || reduceMQ.matches) { finishTyping(); return; }
    clearInterval(s.timer);
    var total = pg[1] - pg[0];
    s.timer = setInterval(function () {
      s.shown++;
      RT.render(el.text, s.chars, s.shown, pg[0], pg[1]);
      var ch = s.chars[pg[0] + s.shown - 1];
      if (s.shown % every === 1 && ch && /\S/.test(ch.ch)) sfx("type");
      if (s.shown >= total) finishTyping();
    }, speed);
  }

  function setNextHint(text, show) {
    el.nextHint.textContent = text || "";
    el.nextHint.hidden = !text && !show;
  }

  function finishTyping() {
    clearInterval(s.timer);
    s.timer = 0;
    s.typing = false;
    actorCall(function (A) { A.talk(false); });
    var pg = s.pages[s.page] || [0, s.chars.length];
    RT.render(el.text, s.chars, null, pg[0], pg[1]);
    var line = current();
    el.root.classList.add("rpg--ready");
    if (onLastPage() && hasChoices(line)) {
      buildChoices(line, false);
      el.choices.classList.remove("is-pending");
      place();
      var first = el.choices.querySelector("button");
      if (first && desktopMQ.matches) first.focus({ preventScroll: true });
    } else if (!line.waitAction && el.root.classList.contains("rpg--focus") && !line.nextHint) {
      // 對話專注：字打完後在紫色箭頭旁出現「按紫色箭頭繼續」
      setNextHint(CFG.focusHint || "按紫色箭頭繼續 ▶", true);
    }
    // 不對箭頭按鈕呼叫 focus()：瀏覽器的預設焦點框會在 PNG 圓鈕外多畫一圈。
  }

  function advance() {
    if (el.root.hidden) return;
    if (s.typing) { finishTyping(); return; }
    var line = current();
    if (onLastPage() && hasChoices(line)) { nudgeChoices(); return; }
    if (line.waitAction && onLastPage()) { if (s.opts.onWaitClick) s.opts.onWaitClick(); return; }
    sfx("tick");
    goNext();
  }

  function goNext() {
    if (s.page < s.pages.length - 1) { s.page++; showPage(); return; }
    if (s.index < s.lines.length - 1) { s.index++; showLine(); }
    else finish({ choice: null, skipped: false });
  }

  function finish(result, silent) {
    clearInterval(s.timer);
    clearInterval(s.placeTimer);
    s.timer = 0;
    if (el.root.hidden) return;
    el.root.hidden = true;
    clearChoices();
    setFocus(false);
    document.body.classList.remove("rpg-open");
    actorCall(function (A) { A.talk(false); A.hide(); });
    var resolve = s.resolve, opts = s.opts;
    s.resolve = null;
    if (silent) { if (resolve) resolve({ choice: null, skipped: true, replaced: true }); return; }
    if (window.BVAudio) window.BVAudio.duck(false);
    if (s.lastFocus && s.lastFocus.focus && document.contains(s.lastFocus)) s.lastFocus.focus({ preventScroll: true });
    if (opts.onEnd) opts.onEnd(result);
    if (resolve) resolve(result);
  }

  function skip() {
    if (el.root.hidden || el.skip.hidden) return;
    finish({ choice: null, skipped: true });
  }

  /* 提醒玩家該按紫色箭頭（介紹步驟點錯、對話專注時點了別的地方） */
  function nudgeNext() {
    if (el.root.hidden) return;
    var line = current();
    if (onLastPage() && hasChoices(line)) { nudgeChoices(); return; }
    el.root.classList.remove("rpg--nudge");
    void el.root.offsetWidth;
    el.root.classList.add("rpg--nudge");
    if (!el.nextHint.textContent) setNextHint(line.nextHint || CFG.focusHint || "按紫色箭頭繼續 ▶", true);
    el.nextHint.hidden = false;
  }
  function nudgeChoices() {
    el.choices.classList.remove("is-nudge");
    void el.choices.offsetWidth;
    el.choices.classList.add("is-nudge");
  }

  /* ==========================================================
     位置計算：依實際可視範圍與目標位置
     ========================================================== */
  function toRect(x) {
    if (!x) return null;
    if (x.getBoundingClientRect) {
      if (x.hidden || !x.isConnected) return null;
      var r = x.getBoundingClientRect();
      return r.width || r.height ? r : null;
    }
    return x;
  }
  function place() {
    if (el.root.hidden) return;
    var vv = window.visualViewport;
    var vh = vv ? vv.height : window.innerHeight, vt = vv ? vv.offsetTop : 0;
    var h = el.wrap.offsetHeight;
    if (el.choices.classList.contains("is-tray") && !el.choices.hidden) h += el.choices.offsetHeight + 8;   // 對話框正下方的選項列
    var topSafe = vt + (document.body.classList.contains("is-sandbox") ? 34 : 8);
    var bottomLimit = vt + vh - 10;
    var avoid = [];
    try { avoid = ((s.opts.avoid && s.opts.avoid()) || []).map(toRect).filter(Boolean); } catch (e) { avoid = []; }
    var top;
    if (s.opts.position === "top") {
      top = topSafe + 48;
    } else if (!avoid.length) {
      top = desktopMQ.matches ? bottomLimit - h - 6 : vt + (vh - h) * 0.56;
    } else {
      var u = avoid.reduce(function (a, r) {
        return { top: Math.min(a.top, r.top), bottom: Math.max(a.bottom, r.bottom) };
      }, { top: Infinity, bottom: -Infinity });
      var gap = 14;
      var below = u.bottom + gap, above = u.top - gap - h;
      if (below + h <= bottomLimit) top = below;
      else if (above >= topSafe) top = above;
      else top = (bottomLimit - u.bottom) >= (u.top - topSafe) ? bottomLimit - h : topSafe;   // 兩邊都放不下：選空間大的一側
    }
    top = Math.max(topSafe, Math.min(top, bottomLimit - h));
    el.wrap.style.top = Math.round(top) + "px";
    el.wrap.style.bottom = "auto";
    // 對話專注時背景不可操作：角色不必為了背景卡片讓位；教學實際操作時才讓位給目標
    var focusOn = el.root.classList.contains("rpg--focus");
    actorCall(function (A) { A.layout(el.box.getBoundingClientRect(), avoid, { yieldToTargets: !focusOn }); });
    layoutDim();
  }
  /* 視窗大小改變：重新決定角色大小、重新分頁（目前這一頁的開頭保留） */
  function relayout() {
    if (el.root.hidden) return;
    actorCall(function (A) { A.size(); });
    var line = current();
    var start = (s.pages[s.page] || [0])[0];
    var ask = line.ask ? RT.parse(line.ask) : null;
    var bodyLen = ask ? RT.parse(line.text || "").length : s.chars.length;
    var pages = paginateLine(line, bodyLen, !!ask);
    var idx = 0;
    pages.forEach(function (p, i) { if (p[0] <= start) idx = i; });
    s.pages = pages; s.page = idx;
    if (s.typing) { s.shown = 0; showPage(); } else { showPage(); finishTyping(); }
  }
  var relayoutTimer = 0;
  function onResize() { place(); clearTimeout(relayoutTimer); relayoutTimer = setTimeout(relayout, 160); }
  window.addEventListener("resize", onResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
    window.visualViewport.addEventListener("scroll", place);
  }

  /* ---------- 事件 ---------- */
  el.box.addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target === el.skip) { skip(); return; }
    if (el.choices.contains(e.target)) return;
    advance();
  });
  /* 保護層：一般對話點畫面任何地方 = 下一步；對話專注時 = 溫和提醒（不跳過） */
  el.shield.addEventListener("click", function (e) {
    e.stopPropagation();
    if (el.root.classList.contains("rpg--focus")) {
      if (s.typing) { finishTyping(); return; }
      sfx("tick");
      nudgeNext();
      return;
    }
    advance();
  });
  el.skip.addEventListener("click", function (e) { e.stopPropagation(); sfx("tick"); skip(); });

  document.addEventListener("keydown", function (e) {
    if (el.root.hidden) return;
    if (e.target && e.target.classList && e.target.classList.contains("rpg__choice") && (e.key === "Enter" || e.key === " ")) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); skip(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopImmediatePropagation(); advance(); }
  }, true);

  window.RpgDialogue = {
    play: play,
    ask: play,
    next: function () { if (!el.root.hidden) { if (s.typing) finishTyping(); goNext(); } },
    close: function () { finish({ choice: null, skipped: true }); },
    isOpen: function () { return !el.root.hidden; },
    isTyping: function () { return !el.root.hidden && s.typing; },
    finishTyping: function () { if (!el.root.hidden && s.typing) finishTyping(); },
    currentLine: function () { return el.root.hidden ? null : current(); },
    pageInfo: function () { return el.root.hidden ? null : { page: s.page, pages: s.pages.length, line: s.index, lines: s.lines.length }; },
    nudgeNext: nudgeNext,
    react: function (mood, ms) { actorCall(function (A) { A.react(mood || "remind", ms); }); },
    reposition: place
  };
})();

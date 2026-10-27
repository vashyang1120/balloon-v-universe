/* ==========================================================
   氣球小V遊戲宇宙 — RPG 對話框元件
   balloon-v-universe-v0.3.1-onboarding-audio-ux-test-1

   用法（v0.2 / v0.3.0 照常可用）：
     RpgDialogue.play(lines, opts) / RpgDialogue.ask(lines, opts) → Promise<{ choice, skipped }>
   每一句：
     choices: [{ label, value, primary }]   選項按鈕
     noSkip: true                            重要提醒，不可略過
     waitAction: true                        等待玩家在畫面上實際操作（教學用），由外部 RpgDialogue.next() 繼續
     nextHint: "按紫色箭頭繼續 ▶"            在紫色箭頭旁顯示提示並高亮箭頭（只是介紹的步驟）
   opts：
     shield: false     不用全畫面保護層（教學／新手卡片時）
     allowSkip: false
     avoid: () => [元素或 DOMRect…]   對話框要避開（並靠近）的目標；會依實際視窗高度計算位置
     onWaitClick: fn   waitAction 時玩家點了對話框（給溫和提醒用）

   位置規則（v0.3.1）：
     - 有目標：放在目標正下方；放不下就放上方；兩邊都放不下才選空間大的一側
     - 沒有目標：手機放在可視範圍中央略偏下；桌機放在下方
     - 依 visualViewport（含 Android Chrome 工具列與虛擬鍵盤）即時重算

   音效：開啟 pop、下一句 tick、逐字每幾個字一次輕微 type、選項 confirm（由 audio.js 播放）
   ========================================================== */

(function () {
  "use strict";

  var CFG = (window.MAP_CONFIG && window.MAP_CONFIG.dialogue) || {};
  var ACFG = (window.MAP_CONFIG && window.MAP_CONFIG.audio) || {};
  var desktopMQ = window.matchMedia((window.MAP_CONFIG && window.MAP_CONFIG.desktopQuery) || "(min-width: 900px)");
  function sfx(n) { try { if (window.BVAudio) window.BVAudio.sfx(n); } catch (e) {} }

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
    choices: document.getElementById("rpgChoices")
  };

  var s = { lines: [], index: 0, chars: [], shown: 0, timer: 0, typing: false, opts: {}, resolve: null, lastFocus: null, placeTimer: 0 };

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
    if (!wasOpen) sfx("pop");
    showLine();
    clearInterval(s.placeTimer);
    s.placeTimer = setInterval(place, 250);
    return new Promise(function (resolve) { s.resolve = resolve; });
  }

  function current() { return s.lines[s.index] || {}; }

  function showLine() {
    var line = current();
    el.name.textContent = line.speaker || CFG.speakerName || "";

    var portrait = line.portrait || CFG.portrait;
    if (portrait) { el.portrait.style.backgroundImage = "url('" + portrait + "')"; el.portrait.hidden = false; }
    else el.portrait.hidden = true;

    el.skip.hidden = !(s.opts.allowSkip !== false && !line.noSkip);
    el.choices.innerHTML = "";
    el.choices.hidden = true;
    el.root.classList.toggle("rpg--wait", !!line.waitAction);
    el.root.classList.remove("rpg--choosing", "rpg--nudge");
    el.root.classList.toggle("rpg--hintnext", !!line.nextHint);
    el.nextHint.textContent = line.nextHint || "";
    el.nextHint.hidden = !line.nextHint;

    s.chars = Array.from(line.text || "");
    s.shown = 0;
    el.text.textContent = "";
    s.typing = true;
    place();

    var speed = CFG.typeSpeedMs == null ? 45 : CFG.typeSpeedMs;
    var every = ACFG.typeSoundEvery || 3;
    if (speed <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { finishTyping(); return; }
    clearInterval(s.timer);
    s.timer = setInterval(function () {
      s.shown++;
      el.text.textContent = s.chars.slice(0, s.shown).join("");
      if (s.shown % every === 1 && s.chars[s.shown - 1] && /\S/.test(s.chars[s.shown - 1])) sfx("type");
      if (s.shown >= s.chars.length) finishTyping();
    }, speed);
  }

  function finishTyping() {
    clearInterval(s.timer);
    s.timer = 0;
    s.typing = false;
    el.text.textContent = s.chars.join("");
    var line = current();
    if (line.choices && line.choices.length) {
      el.root.classList.add("rpg--choosing");
      el.choices.hidden = false;
      line.choices.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rpg__choice" + (c.primary ? " rpg__choice--primary" : "");
        b.textContent = c.label;
        b.addEventListener("click", function (e) { e.stopPropagation(); sfx("confirm"); finish({ choice: c.value, skipped: false }); });
        el.choices.appendChild(b);
      });
      place();
      var first = el.choices.querySelector("button");
      if (first) first.focus({ preventScroll: true });
    }
    // 不對箭頭按鈕呼叫 focus()：瀏覽器的預設焦點框會在 PNG 圓鈕外多畫一圈。
    // 鍵盤 Enter／空白鍵由下方 document keydown 處理，仍可繼續。
  }

  function advance() {
    if (el.root.hidden) return;
    if (s.typing) { finishTyping(); return; }
    var line = current();
    if (line.choices && line.choices.length) { nudgeChoices(); return; }
    if (line.waitAction) { if (s.opts.onWaitClick) s.opts.onWaitClick(); return; }
    sfx("tick");
    goNext();
  }

  function goNext() {
    if (s.index < s.lines.length - 1) { s.index++; showLine(); }
    else finish({ choice: null, skipped: false });
  }

  function finish(result, silent) {
    clearInterval(s.timer);
    clearInterval(s.placeTimer);
    s.timer = 0;
    if (el.root.hidden) return;
    el.root.hidden = true;
    el.choices.innerHTML = "";
    document.body.classList.remove("rpg-open");
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

  /* 提醒玩家該按紫色箭頭（介紹步驟點錯時由教學呼叫） */
  function nudgeNext() {
    if (el.root.hidden) return;
    el.root.classList.remove("rpg--nudge");
    void el.root.offsetWidth;
    el.root.classList.add("rpg--nudge");
    el.nextHint.hidden = false;
    if (!el.nextHint.textContent) el.nextHint.textContent = (window.MAP_CONFIG.tutorial || {}).nextHint || "按這裡繼續 ▶";
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
  }
  window.addEventListener("resize", place);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", place);
    window.visualViewport.addEventListener("scroll", place);
  }

  /* ---------- 事件 ---------- */
  el.box.addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target === el.skip) { skip(); return; }
    advance();
  });
  el.shield.addEventListener("click", function (e) { e.stopPropagation(); advance(); });
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
    nudgeNext: nudgeNext,
    reposition: place
  };
})();

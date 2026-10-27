/* ==========================================================
   氣球小V遊戲宇宙 — RPG 對話框元件
   balloon-v-universe-v0.3.0-unified-player-lobby-test-1

   v0.2 用法照常可用：
     RpgDialogue.play([{ speaker, text }], { onEnd: fn });

   v0.3.0 新增：
     RpgDialogue.ask(lines, opts) → Promise<{ choice, skipped }>
     每一句可以加上：
       choices: [{ label, value, primary }]  這句打完字後顯示選項按鈕
       noSkip: true                           重要提醒：隱藏「略過」，必須看完
       waitAction: true                       等待玩家在畫面上實際操作（教學用）
                                              → 由外部呼叫 RpgDialogue.next() 繼續
     opts：
       shield: true/false   是否用保護層擋住背景（預設 true；教學聚光燈時為 false）
       allowSkip: true/false

   操作：點對話框 / 右下箭頭 / Enter / 空白鍵 = 繼續（打字中先顯示整句）
         「略過」/ Esc = 結束（noSkip 的句子無法略過）
   ========================================================== */

(function () {
  "use strict";

  var CFG = (window.MAP_CONFIG && window.MAP_CONFIG.dialogue) || {};

  var el = {
    root: document.getElementById("rpg"),
    shield: document.getElementById("rpgShield"),
    box: document.getElementById("rpgBox"),
    portrait: document.getElementById("rpgPortrait"),
    name: document.getElementById("rpgName"),
    text: document.getElementById("rpgText"),
    next: document.getElementById("rpgNext"),
    skip: document.getElementById("rpgSkip"),
    choices: document.getElementById("rpgChoices")
  };

  var s = { lines: [], index: 0, chars: [], shown: 0, timer: 0, typing: false, opts: {}, resolve: null, lastFocus: null };

  function play(lines, opts) {
    if (!lines || !lines.length) return Promise.resolve({ choice: null, skipped: false });
    finish(null, true);  // 結束上一段（不觸發 callback）
    s.lines = lines;
    s.index = 0;
    s.opts = opts || {};
    s.lastFocus = document.activeElement;
    el.root.hidden = false;
    el.root.classList.toggle("rpg--noshield", s.opts.shield === false);
    el.root.classList.toggle("rpg--top", s.opts.position === "top");
    document.body.classList.add("rpg-open");
    showLine();
    return new Promise(function (resolve) { s.resolve = resolve; });
  }

  function current() { return s.lines[s.index] || {}; }

  function showLine() {
    var line = current();
    el.name.textContent = line.speaker || CFG.speakerName || "";

    var portrait = line.portrait || CFG.portrait;
    if (portrait) { el.portrait.style.backgroundImage = "url('" + portrait + "')"; el.portrait.hidden = false; }
    else el.portrait.hidden = true;

    var canSkip = s.opts.allowSkip !== false && !line.noSkip;
    el.skip.hidden = !canSkip;
    el.choices.innerHTML = "";
    el.choices.hidden = true;
    el.root.classList.toggle("rpg--wait", !!line.waitAction);
    el.root.classList.remove("rpg--choosing");

    s.chars = Array.from(line.text || "");
    s.shown = 0;
    el.text.textContent = "";
    s.typing = true;

    var speed = CFG.typeSpeedMs == null ? 45 : CFG.typeSpeedMs;
    if (speed <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { finishTyping(); return; }
    clearInterval(s.timer);
    s.timer = setInterval(function () {
      s.shown++;
      el.text.textContent = s.chars.slice(0, s.shown).join("");
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
        b.addEventListener("click", function (e) { e.stopPropagation(); finish({ choice: c.value, skipped: false }); });
        el.choices.appendChild(b);
      });
      var first = el.choices.querySelector("button");
      if (first) first.focus({ preventScroll: true });
    } else if (!line.waitAction) {
      el.next.focus({ preventScroll: true });
    }
  }

  function advance() {
    if (el.root.hidden) return;
    if (s.typing) { finishTyping(); return; }
    var line = current();
    if (line.choices && line.choices.length) return;   // 必須選一個選項
    if (line.waitAction) return;                       // 等待玩家實際操作
    goNext();
  }

  function goNext() {
    if (s.index < s.lines.length - 1) { s.index++; showLine(); }
    else finish({ choice: null, skipped: false });
  }

  function finish(result, silent) {
    clearInterval(s.timer);
    s.timer = 0;
    if (el.root.hidden) return;
    el.root.hidden = true;
    el.choices.innerHTML = "";
    document.body.classList.remove("rpg-open");
    var resolve = s.resolve, opts = s.opts;
    s.resolve = null;
    if (silent) { if (resolve) resolve({ choice: null, skipped: true, replaced: true }); return; }
    if (s.lastFocus && s.lastFocus.focus && document.contains(s.lastFocus)) s.lastFocus.focus({ preventScroll: true });
    if (opts.onEnd) opts.onEnd(result);
    if (resolve) resolve(result);
  }

  function skip() {
    if (el.root.hidden || el.skip.hidden) return;
    finish({ choice: null, skipped: true });
  }

  el.box.addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target === el.skip) { skip(); return; }
    advance();
  });
  el.shield.addEventListener("click", function (e) { e.stopPropagation(); advance(); });
  el.skip.addEventListener("click", function (e) { e.stopPropagation(); skip(); });

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
    currentLine: function () { return el.root.hidden ? null : current(); }
  };
})();

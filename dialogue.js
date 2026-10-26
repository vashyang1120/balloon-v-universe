/* ==========================================================
   氣球小V遊戲宇宙 — RPG 對話框元件
   balloon-v-universe-v0.2.0-lobby-integration-test-1

   使用方式（未來劇情也用同一個元件）：
     RpgDialogue.play([
       { speaker: "氣球小V", text: "第一句話" },
       { speaker: "氣球小V", text: "第二句話", portrait: "assets/xxx.png" }
     ], { onEnd: function () { ... } });

   操作：
   - 點對話框任何地方 / 「繼續」/ Enter / 空白鍵：
       文字還在出現 → 立刻顯示整句；整句已出現 → 下一句或結束
   - 「略過」/ Esc：直接結束整段對話
   - 對話期間有透明保護層，背景地圖與按鈕不會被誤觸

   設定（逐字速度、預設角色名稱、半身像）在 zones.js 的 dialogue 區。
   ========================================================== */

(function () {
  "use strict";

  var CFG = (window.MAP_CONFIG && window.MAP_CONFIG.dialogue) || {};

  var el = {
    root: document.getElementById("rpg"),
    shield: document.getElementById("rpgShield"),
    portrait: document.getElementById("rpgPortrait"),
    name: document.getElementById("rpgName"),
    text: document.getElementById("rpgText"),
    next: document.getElementById("rpgNext"),
    skip: document.getElementById("rpgSkip")
  };

  var s = { lines: [], index: 0, chars: [], shown: 0, timer: 0, typing: false, onEnd: null, lastFocus: null };

  function play(lines, opts) {
    if (!lines || !lines.length) return;
    stopTyping();
    s.lines = lines;
    s.index = 0;
    s.onEnd = (opts && opts.onEnd) || null;
    s.lastFocus = document.activeElement;
    el.root.hidden = false;
    document.body.classList.add("rpg-open");
    showLine();
    el.next.focus({ preventScroll: true });
  }

  function showLine() {
    var line = s.lines[s.index];
    el.name.textContent = line.speaker || CFG.speakerName || "";

    // 半身像：只有指定了正式素材才顯示，沒有就隱藏（不使用替代圖）
    var portrait = line.portrait || CFG.portrait;
    if (portrait) {
      el.portrait.style.backgroundImage = "url('" + portrait + "')";
      el.portrait.hidden = false;
    } else {
      el.portrait.hidden = true;
    }

    s.chars = Array.from(line.text || "");   // 正確處理中文與表情符號
    s.shown = 0;
    el.text.textContent = "";
    el.next.textContent = "…";
    s.typing = true;

    var speed = CFG.typeSpeedMs == null ? 45 : CFG.typeSpeedMs;
    if (speed <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishTyping();
      return;
    }
    s.timer = setInterval(function () {
      s.shown++;
      el.text.textContent = s.chars.slice(0, s.shown).join("");
      if (s.shown >= s.chars.length) finishTyping();
    }, speed);
  }

  function stopTyping() {
    clearInterval(s.timer);
    s.timer = 0;
  }

  function finishTyping() {
    stopTyping();
    s.typing = false;
    el.text.textContent = s.chars.join("");
    el.next.textContent = s.index < s.lines.length - 1 ? "繼續 ▼" : "完成 ✓";
  }

  function advance() {
    if (el.root.hidden) return;
    if (s.typing) { finishTyping(); return; }
    if (s.index < s.lines.length - 1) { s.index++; showLine(); }
    else close();
  }

  function close() {
    if (el.root.hidden) return;
    stopTyping();
    el.root.hidden = true;
    document.body.classList.remove("rpg-open");
    var cb = s.onEnd;
    s.onEnd = null;
    if (s.lastFocus && s.lastFocus.focus) s.lastFocus.focus({ preventScroll: true });
    if (cb) cb();
  }

  // 點對話框或保護層都算「繼續」；略過按鈕單獨處理
  el.root.addEventListener("click", function (e) {
    e.stopPropagation();
    if (e.target === el.skip) { close(); return; }
    advance();
  });

  document.addEventListener("keydown", function (e) {
    if (el.root.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopImmediatePropagation(); advance(); }
  }, true);

  window.RpgDialogue = {
    play: play,
    close: close,
    isOpen: function () { return !el.root.hidden; }
  };
})();

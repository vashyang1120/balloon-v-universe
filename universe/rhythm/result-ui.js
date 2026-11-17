/* ==========================================================
   v2.6.5 — 橫向結算頁＋結算動態演出

   原則：
   - 只「搬移」原有結算 DOM（#r-grade、#r-grade-msg、.stats、#r-rec、#r-vcoin-msg、#r-title-unlock-msg、
     #r-unlock-notify、#btn-retry、#btn-r-lb、#btn-r-home）到新的左右版面；保留原 id 與原事件
   - endGame() 不修改、不重複呼叫；成績、rank、NEW RECORD、獎勵全部沿用 endGame() 已寫好的結果
   - SCORE 累加只是畫面上的暫時覆蓋層：#r-score 原本的文字完全不改，動畫結束後直接顯示原文字
   - 動畫、計時器、彩紙只在結算頁存在；離開結算頁立即取消
   ========================================================== */
(function () {
  "use strict";

  var BUST = "../../assets/rpg/";
  /* 評價 → 小V（只影響美術）。原本 rank：S、A+、A、B、C、D、E */
  var CHAR_BY_GRADE = {
    "S": "v_bust_congrats.png", "A+": "v_bust_congrats.png",     // V-18 歡呼
    "A": "v_bust_happy.png", "B": "v_bust_happy.png",            // V-06 開心
    "C": "v_bust_point.png",                                     // V-12 手指提示：再往前一點
    "D": "v_bust_remind.png", "E": "v_bust_remind.png"           // V-15 溫柔提醒
  };
  var TIER_BY_GRADE = { "S": "high", "A+": "high", "A": "good", "B": "good", "C": "cheer", "D": "cheer", "E": "cheer" };
  var REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  var root = null, heroImg = null, songLine = null, scoreOverlay = null, fx = null;
  var timers = [], raf = 0, recObserver = null, active = false, shownAt = 0;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function move(node, parent) { if (node && parent) parent.appendChild(node); return node; }
  function later(fn, ms) { var t = setTimeout(function () { timers = timers.filter(function (x) { return x !== t; }); fn(); }, ms); timers.push(t); return t; }

  function mount() {
    var s = $("s-result");
    if (!s || s.querySelector(".rv-result")) return;
    root = el("div", "rv-result");
    var bg = el("picture", "rv-result-bg-pic");
    bg.innerHTML = '<source type="image/webp" srcset="assets/ui/rhythm_songselect_bg.webp"><img class="rv-result-bg" src="assets/ui/rhythm_songselect_bg.png" alt="" decoding="async">';
    root.appendChild(bg);

    /* 左：評價、NEW RECORD、小V、鼓勵文字 */
    var left = el("section", "rv-res-left");
    var gradeWrap = el("div", "rv-res-grade-wrap");
    gradeWrap.innerHTML = '<i class="rv-res-burst" aria-hidden="true"></i><i class="rv-res-star rv-rs1" aria-hidden="true">★</i><i class="rv-res-star rv-rs2" aria-hidden="true">★</i><i class="rv-res-star rv-rs3" aria-hidden="true">✦</i>';
    move($("r-grade"), gradeWrap);
    left.appendChild(gradeWrap);
    var rec = move($("r-rec"), left);
    if (rec) rec.classList.add("rv-res-rec");
    var heroBox = el("div", "rv-res-hero");
    heroImg = el("img", "rv-res-hero-img"); heroImg.alt = "小V哥哥"; heroImg.decoding = "async"; heroImg.draggable = false;
    heroBox.appendChild(heroImg);
    left.appendChild(heroBox);
    move($("r-grade-msg"), left);
    fx = el("div", "rv-res-fx"); fx.setAttribute("aria-hidden", "true");
    left.appendChild(fx);

    /* 右：歌曲、六項成績、通知、操作 */
    var right = el("section", "rv-res-right");
    var head = el("div", "rv-res-head");
    var h2 = s.querySelector("h2");
    if (h2) { h2.textContent = "🌟 RESULT"; head.appendChild(h2); }
    songLine = el("div", "rv-res-song");
    head.appendChild(songLine);
    var tag = el("div", "rv-test-tag", "節奏遊戲 v2.6.5");   // 版本號放在提示文字（首頁、選歌頁已完整顯示）
    tag.title = window.RV27UI ? window.RV27UI.version : "";
    head.appendChild(tag);
    right.appendChild(head);

    var stats = move(s.querySelector(".stats"), right);
    if (stats) {
      stats.classList.add("rv-res-stats");
      [].forEach.call(stats.querySelectorAll(".stat"), function (st, i) { st.style.setProperty("--i", i); });
      var scoreEl = stats.querySelector("#r-score");   // .stats 已搬進尚未掛上頁面的 right，需從 stats 內尋找
      var scoreStat = scoreEl && scoreEl.parentNode;
      if (scoreStat) {
        scoreStat.classList.add("rv-res-score-stat");
        scoreOverlay = el("div", "stat-v rv-score-anim"); scoreOverlay.setAttribute("aria-hidden", "true");
        scoreStat.appendChild(scoreOverlay);
      }
    }

    var notes = el("div", "rv-res-notes");
    notes.setAttribute("aria-label", "獎勵與保存狀態");
    move($("bv-result-note"), notes);
    move($("r-vcoin-msg"), notes);
    move($("r-title-unlock-msg"), notes);
    move($("r-unlock-notify"), notes);
    right.appendChild(notes);

    var actions = el("div", "rv-res-actions");
    var retry = $("btn-retry");
    if (retry) { retry.textContent = "▶ 再玩一次"; retry.className = "btn rv-art-btn rv-art-yellow rv-size-main rv-sheen"; actions.appendChild(retry); }
    var row = el("div", "rv-res-row");
    // 「選擇歌曲」：原本沒有這個入口，沿用既有 go('s-songlist') 切換（目前歌曲與難度保留在原本的 songIdx／難度按鈕）
    var sel = el("button", "btn rv-art-btn rv-art-blue rv-size-res", "🎵 選擇歌曲");
    sel.id = "rv-btn-r-songs"; sel.type = "button";
    sel.addEventListener("click", function () { if (typeof window.go === "function") window.go("s-songlist"); });
    row.appendChild(sel);
    var lb = $("btn-r-lb");
    if (lb) { lb.textContent = "🏆 排行榜"; lb.className = "btn rv-art-btn rv-art-purple rv-size-res"; row.appendChild(lb); }
    var home = $("btn-r-home");
    if (home) { home.textContent = "🏠 返回首頁"; home.className = "btn rv-art-btn rv-art-purple rv-size-res"; row.appendChild(home); }
    actions.appendChild(row);
    right.appendChild(actions);

    root.appendChild(left);
    root.appendChild(right);
    s.appendChild(root);
    s.classList.add("rv-ui");
  }

  function cancelAll() {
    timers.forEach(clearTimeout); timers = [];
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (recObserver) { recObserver.disconnect(); recObserver = null; }
    if (fx) fx.innerHTML = "";
    var sc = $("r-score");
    if (sc) sc.style.visibility = "";
    if (scoreOverlay) scoreOverlay.textContent = "";
    if (root) root.classList.remove("rv-res-intro", "rv-res-shown", "rv-res-counting", "rv-res-newrec");
  }

  /* SCORE 累加：只更新覆蓋層，最後顯示 #r-score 的原文字（endGame 寫入的精確值） */
  function countScore(delayMs, durMs) {
    var sc = $("r-score");
    if (!sc || !scoreOverlay) return;
    var finalText = sc.textContent;
    var finalNum = Number(String(finalText).replace(/[^\d]/g, "")) || 0;
    if (REDUCED || finalNum === 0) return;
    sc.style.visibility = "hidden";
    scoreOverlay.textContent = "0";
    root.classList.add("rv-res-counting");
    later(function () {
      var t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / durMs);
        var e = 1 - Math.pow(1 - k, 3);
        scoreOverlay.textContent = Math.floor(finalNum * e).toLocaleString();
        if (k < 1) { raf = requestAnimationFrame(step); return; }
        raf = 0;
        sc.style.visibility = "";
        scoreOverlay.textContent = "";
        root.classList.remove("rv-res-counting");
      })(t0);
    }, delayMs);
  }

  function confetti() {
    if (!fx || REDUCED) return;
    var colors = ["#ffd23f", "#ff6fa8", "#7ad7ff", "#b583ec", "#ffffff", "#8fe6be"];
    var html = "";
    for (var i = 0; i < 16; i++) {
      var left = 6 + Math.random() * 88, delay = Math.random() * 0.35, dur = 1.1 + Math.random() * 0.6, rot = Math.round(Math.random() * 360);
      var shape = i % 4 === 0 ? "★" : "";
      html += '<i class="rv-confetti' + (shape ? " is-star" : "") + '" style="left:' + left.toFixed(1) + "%;background:" + (shape ? "transparent" : colors[i % colors.length]) +
        ";color:" + colors[i % colors.length] + ";animation-delay:" + delay.toFixed(2) + "s;animation-duration:" + dur.toFixed(2) + "s;--r:" + rot + 'deg">' + shape + "</i>";
    }
    fx.innerHTML = html;
    later(function () { if (fx) fx.innerHTML = ""; }, 2400);          // 自動結束
  }

  function setHero(grade, newRecord) {
    var file = newRecord ? "v_bust_congrats.png" : (CHAR_BY_GRADE[grade] || "v_bust_happy.png");
    var src = BUST + file;
    if (heroImg.getAttribute("src") !== src) heroImg.src = src;
    heroImg.dataset.file = file;
  }

  /* 結算頁出現（由 go('s-result') 的 UI hook 呼叫；endGame 已同步寫好成績） */
  function show() {
    if (!root) return;
    cancelAll();
    active = true;
    shownAt = performance.now();
    var gEl = $("r-grade");
    var grade = gEl ? (gEl.getAttribute("data-grade") || gEl.textContent || "").trim() : "";
    root.dataset.grade = grade;
    root.dataset.tier = TIER_BY_GRADE[grade] || "good";
    var song = window.G && window.G.song;
    var diff = window.G && window.G.diff ? String(window.G.diff).toUpperCase() : "";
    songLine.textContent = song ? (song.title || "") + (diff ? " · " + diff : "") : "";
    var rec = $("r-rec");
    setHero(grade, false);

    // NEW RECORD 由 endGame() 在 go('s-result') 之後非同步判定（saveScore 完成才切換 #r-rec）。
    // 進入結算頁時 #r-rec 仍是上一場的顯示狀態，先清成隱藏，再觀察 endGame() 這一場的判定結果
    if (rec) {
      rec.classList.add("hidden");
      recObserver = new MutationObserver(function () {
        if (!active || rec.classList.contains("hidden")) return;
        var wait = REDUCED ? 0 : Math.max(0, 800 - (performance.now() - shownAt));   // 依時間軸 0.8 秒後才演出
        later(function () { if (active && !rec.classList.contains("hidden")) onNewRecord(); }, wait);
      });
      recObserver.observe(rec, { attributes: true, attributeFilter: ["class"] });
    }

    void root.offsetWidth;
    if (REDUCED) { root.classList.add("rv-res-shown"); return; }
    root.classList.add("rv-res-intro");
    countScore(400, 600);
    later(function () { root.classList.remove("rv-res-intro"); root.classList.add("rv-res-shown"); }, 1600);
  }
  function onNewRecord() {
    if (!active || root.classList.contains("rv-res-newrec")) return;
    root.classList.add("rv-res-newrec");
    setHero(root.dataset.grade, true);
    confetti();
  }
  function hide() {
    if (!active) return;
    active = false;
    cancelAll();            // 離開結算頁：取消 rAF、計時器、彩紙、觀察器
  }

  window.RV27Result = {
    mount: mount,
    onScreenChange: function (id) { if (id === "s-result") show(); else hide(); },
    charMap: CHAR_BY_GRADE,
    state: function () {
      return { active: active, cls: root ? root.className : "", hero: heroImg ? heroImg.dataset.file : "", timers: timers.length, raf: !!raf,
        confetti: fx ? fx.children.length : 0 };
    }
  };
})();

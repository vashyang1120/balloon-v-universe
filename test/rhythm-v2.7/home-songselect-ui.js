/* ==========================================================
   v2.7.0-home-songselect-ui-test-1
   首頁＋歌曲選擇頁 A-4 橫向魔法音樂舞台、橫向提示（只在 test/rhythm-v2.7/ 使用）

   原則：
   - 只「搬移」原有元素到新的版面容器，保留原 id 與原事件（開始遊戲、排行榜、切歌、難度、開始歌曲）
   - 不改歌曲資料、切歌邏輯、難度資料、開始遊戲流程、遊戲核心
   - 不寫入任何資料；最佳成績只讀測試命名空間的 Mock 成績
   - 直向提示：手機直向時蓋上全畫面提示；演奏中改呼叫原本的 togglePause()，轉回橫向後用原本「繼續」＋3 秒倒數
   ========================================================== */
(function () {
  "use strict";

  var RUSH = "https://vashyang1120.github.io/balloon-v-rush/assets/adventure/";
  var ASSETS = {
    hero: "../../assets/rpg/v_full_open_arms.png",                 // V-03（balloon-v-universe）
    frame: "../../assets/ui/avatar_frame_pink_idle.png",            // U-06（balloon-v-universe）
    arrowL: RUSH + "ui/components/ui_arrow_left.png",               // U-19（balloon-v-rush）
    arrowR: RUSH + "ui/components/ui_arrow_right.png",              // U-20（balloon-v-rush）
    balloonRed: RUSH + "items/balloon_round_red.png",               // B-03（balloon-v-rush）
    balloonBlue: RUSH + "items/balloon_260_blue.png"                // B-04（balloon-v-rush）
  };
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var shell = null;   // window.UniverseRhythm（測試換殼層）

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function move(node, parent) { if (node && parent) parent.appendChild(node); return node; }
  function img(src, cls, alt) {
    var i = el("img", cls); i.src = src; i.alt = alt || ""; i.decoding = "async"; i.draggable = false;
    i.addEventListener("error", function () { i.classList.add("rv-img-failed"); });
    return i;
  }

  /* ---------- 舞台背景（CSS／SVG；不新增持續粒子） ---------- */
  var STAGE_SVG =
    '<svg class="rv-stage-svg" viewBox="0 0 480 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
    '<defs>' +
    '<radialGradient id="rvSpot" cx="50%" cy="0%" r="80%"><stop offset="0" stop-color="#fff6c9" stop-opacity=".85"/><stop offset="1" stop-color="#fff6c9" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="rvCurtain" x1="0" x2="1"><stop offset="0" stop-color="#c13d8c"/><stop offset=".5" stop-color="#e46aae"/><stop offset="1" stop-color="#b03380"/></linearGradient>' +
    '<linearGradient id="rvFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd7f0"/><stop offset="1" stop-color="#d9a6f2"/></linearGradient>' +
    "</defs>" +
    // 城堡與雲朵剪影
    '<g fill="#ffffff" opacity=".35"><ellipse cx="70" cy="200" rx="60" ry="18"/><ellipse cx="410" cy="190" rx="70" ry="20"/><ellipse cx="260" cy="215" rx="90" ry="16"/></g>' +
    '<g fill="#b98ae0" opacity=".28"><rect x="300" y="120" width="70" height="80"/><rect x="292" y="104" width="18" height="96"/><rect x="360" y="104" width="18" height="96"/>' +
    '<polygon points="292,104 301,86 310,104"/><polygon points="360,104 369,86 378,104"/><rect x="322" y="96" width="26" height="104"/><polygon points="322,96 335,72 348,96"/></g>' +
    // 聚光燈
    '<polygon points="150,0 230,0 300,250 90,250" fill="url(#rvSpot)" class="rv-spot"/>' +
    '<polygon points="260,0 330,0 390,250 200,250" fill="url(#rvSpot)" opacity=".55" class="rv-spot rv-spot-b"/>' +
    // 圓形舞台
    '<ellipse cx="240" cy="272" rx="190" ry="34" fill="#b875e0" opacity=".55"/>' +
    '<ellipse cx="240" cy="262" rx="182" ry="30" fill="url(#rvFloor)" stroke="#fff3a8" stroke-width="3"/>' +
    '<ellipse cx="240" cy="258" rx="130" ry="17" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="2" stroke-dasharray="6 7"/>' +
    // 左右布幕
    '<path d="M0 0 H86 C70 70 92 150 60 300 H0 Z" fill="url(#rvCurtain)"/>' +
    '<path d="M480 0 H394 C410 70 388 150 420 300 H480 Z" fill="url(#rvCurtain)"/>' +
    '<path d="M0 0 H480 V26 C420 40 360 18 300 34 C260 44 220 44 180 34 C120 18 60 40 0 26 Z" fill="#a52d78"/>' +
    '<path d="M0 26 C60 40 120 18 180 34 C220 44 260 44 300 34 C360 18 420 40 480 26" fill="none" stroke="#ffd166" stroke-width="3"/>' +
    // 星星與音符（靜態，少量）
    '<g fill="#ffe27a"><path class="rv-twinkle" d="M120 70l4 9 10 1-8 6 3 10-9-6-9 6 3-10-8-6 10-1z"/>' +
    '<path class="rv-twinkle rv-d2" d="M372 58l3 7 8 1-6 5 2 8-7-5-7 5 2-8-6-5 8-1z"/>' +
    '<path class="rv-twinkle rv-d3" d="M402 150l2 5 6 1-4 3 1 6-5-3-5 3 1-6-4-3 6-1z"/>' +
    '<path class="rv-twinkle rv-d2" d="M96 168l2 5 6 1-4 3 1 6-5-3-5 3 1-6-4-3 6-1z"/></g>' +
    '<g fill="#ffffff" opacity=".9" font-family="serif" font-size="26"><text x="140" y="130" class="rv-note">♪</text><text x="330" y="96" class="rv-note rv-d2">♫</text><text x="356" y="200" class="rv-note rv-d3">♪</text></g>' +
    "</svg>";

  /* ---------- 首頁 ---------- */
  function mountHome() {
    var s = $("s-title");
    if (!s || s.querySelector(".rv-home")) return;
    var home = el("div", "rv-home");

    var stage = el("section", "rv-stage");
    stage.innerHTML = STAGE_SVG;
    var balloons = el("div", "rv-balloons");
    balloons.appendChild(img(ASSETS.balloonRed, "rv-balloon rv-balloon-red"));
    balloons.appendChild(img(ASSETS.balloonBlue, "rv-balloon rv-balloon-blue"));
    stage.appendChild(balloons);
    var heading = el("div", "rv-heading");
    move(s.querySelector(".logo"), heading);                       // 保留 handleLogoClick
    heading.appendChild(el("div", "rv-subtitle", "V宇宙節奏遊戲"));
    stage.appendChild(heading);
    var heroWrap = el("div", "rv-hero");
    heroWrap.appendChild(el("div", "rv-hero-glow"));
    heroWrap.appendChild(img(ASSETS.hero, "rv-hero-img", "小V哥哥"));
    stage.appendChild(heroWrap);

    var panel = el("section", "rv-panel");
    var meta = el("div", "rv-meta");
    move($("game-version"), meta);
    move(s.querySelector(".bv-title-meta"), meta);                 // 測試版標示（狀態標記、讀取／錯誤卡）
    panel.appendChild(meta);

    var card = el("div", "rv-player-card");
    card.id = "rv-player-card";
    card.innerHTML =
      '<div class="rv-avatar-box"><img id="rv-player-avatar" class="rv-player-avatar" alt="" src="' + BLANK + '"></div>' +
      '<div class="rv-player-text"><div class="rv-player-label">目前玩家</div>' +
      '<div id="rv-player-name" class="rv-player-name">讀取中…</div>' +
      '<div id="rv-player-title" class="rv-player-title"></div></div>';
    card.querySelector(".rv-avatar-box").insertBefore(img(ASSETS.frame, "rv-frame"), card.querySelector(".rv-player-avatar").nextSibling);
    panel.appendChild(card);

    move($("home-daily-challenge-hint"), panel);

    var play = $("btn-play");
    if (play) { play.textContent = "▶ 開始遊戲"; play.classList.add("rv-btn-main"); panel.appendChild(play); }
    var row = el("div", "rv-btn-row");
    var lb = $("btn-lb-go");
    if (lb) { lb.textContent = "🏆 排行榜"; lb.classList.add("rv-btn-purple"); row.appendChild(lb); }
    var lobby = $("bv-btn-lobby");
    if (lobby) { lobby.textContent = "🏠 返回 V宇宙"; lobby.classList.add("rv-btn-yellow"); row.appendChild(lobby); }
    panel.appendChild(row);

    var minor = el("div", "rv-btn-row rv-btn-row-minor");
    move($("btn-profile-go"), minor);
    var mv = s.querySelector('button[onclick*="youtube.com/playlist"]');
    if (mv) { mv.classList.add("rv-btn-mini"); minor.appendChild(mv); }
    panel.appendChild(minor);

    // 玩法教學：只預留位置（不可點擊），等新手教學版本完成再啟用
    var slot = el("div", "rv-tutorial-slot", "🎓 玩法教學・下個版本開放");
    slot.setAttribute("aria-hidden", "true");
    panel.appendChild(slot);

    home.appendChild(stage);
    home.appendChild(panel);
    s.appendChild(home);
    s.classList.add("rv-ui");
  }

  function refreshPlayerCard() {
    var d = shell && shell.playerCardData ? shell.playerCardData() : null;
    var name = $("rv-player-name"), title = $("rv-player-title"), av = $("rv-player-avatar");
    if (!name) return;
    if (!d) {
      name.textContent = shell && shell.entryMode === "chooser" ? "未選擇玩家" : "讀取中…";
      title.textContent = ""; av.src = BLANK; return;
    }
    name.textContent = d.displayId;
    title.textContent = d.mock ? "Mock 測試角色（不是正式玩家）" : (d.titleName ? "🏅 " + d.titleName : "尚未裝備稱號");
    title.classList.toggle("is-empty", !d.mock && !d.titleName);
    av.src = d.avatarSrc || BLANK;
  }

  /* ---------- 歌曲選擇頁 ---------- */
  function mountSongSelect() {
    var s = $("s-songlist");
    if (!s || s.querySelector(".rv-select")) return;
    var wrap = el("div", "rv-select");

    var left = el("section", "rv-cover-side");
    var h2 = s.querySelector("h2");
    if (h2) { h2.textContent = "🎵 選擇歌曲"; left.appendChild(h2); }
    var cards = move($("song-cards"), left);
    [["song-prev", ASSETS.arrowL, "上一首"], ["song-next", ASSETS.arrowR, "下一首"]].forEach(function (a) {
      var b = left.querySelector("#" + a[0]);   // song-cards 已搬進尚未掛上頁面的 left，需從 left 內尋找
      if (!b) return;
      b.setAttribute("aria-label", a[2]);
      b.innerHTML = '<span class="rv-arrow-fallback">' + (a[0] === "song-prev" ? "◀" : "▶") + "</span>";
      var i = img(a[1], "rv-arrow-img");
      i.addEventListener("load", function () { b.classList.add("rv-arrow-ready"); });
      b.appendChild(i);
    });
    move($("song-counter"), left);
    if (cards) cards.classList.add("rv-cards");

    var right = el("section", "rv-info-side");
    var info = el("div", "rv-song-info");
    info.innerHTML =
      '<div id="rv-song-title" class="rv-song-title"></div>' +
      '<div id="rv-song-artist" class="rv-song-artist"></div>' +
      '<div id="rv-song-chips" class="rv-song-chips"></div>' +
      '<div class="rv-best"><span class="rv-best-label">我的最佳（測試）</span><span id="rv-best-value" class="rv-best-value">—</span></div>';
    right.appendChild(info);
    move($("songlist-daily-challenge-hint"), right);
    var diff = move($("diff-wrap"), right);
    if (diff) {
      var lab = diff.querySelector("label"); if (lab) lab.textContent = "選擇難度";
      diff.querySelectorAll(".db").forEach(function (b) { b.addEventListener("click", function () { setTimeout(updateSongInfo, 0); }); });
    }
    var actions = el("div", "rv-select-actions");
    var back = $("btn-back-song");
    if (back) { back.textContent = "← 返回"; back.classList.add("rv-btn-back"); actions.appendChild(back); }
    var start = $("btn-start");
    if (start) { start.textContent = "▶ 開始歌曲"; start.classList.add("rv-btn-main", "rv-btn-start"); actions.appendChild(start); }
    right.appendChild(actions);

    wrap.appendChild(left);
    wrap.appendChild(right);
    s.appendChild(wrap);
    s.classList.add("rv-ui");
    var oldRow = s.querySelector(":scope > .btn-row");
    if (oldRow && !oldRow.children.length) oldRow.remove();

    // 原 renderSongCards() 照常執行（切歌順序、封面、頁碼不變），之後補上右側資訊
    var orig = window.renderSongCards;
    if (typeof orig === "function" && !orig.__rvWrapped) {
      var wrapped = function () { var r = orig.apply(this, arguments); updateSongInfo(); return r; };
      wrapped.__rvWrapped = true;
      window.renderSongCards = wrapped;
    }
  }

  function fmtLen(sec) { sec = Math.round(Number(sec)); return Math.floor(sec / 60) + ":" + ("0" + sec % 60).slice(-2); }
  function currentSong() { return (window.SONGS && window.SONGS.length && typeof window.songIdx === "number") ? window.SONGS[window.songIdx] : null; }
  function currentDiff() { var on = document.querySelector("#diff-wrap .db.on"); return on ? on.getAttribute("data-d") : "normal"; }

  var bestReq = 0;
  function updateSongInfo() {
    var song = currentSong();
    if (!$("rv-song-title")) return;
    if (!song) { $("rv-song-title").textContent = "歌曲載入中…"; return; }
    $("rv-song-title").textContent = song.title || "";
    $("rv-song-artist").textContent = song.artist || "";
    var chips = [];
    if (typeof song.bpm === "number" && song.bpm > 0) chips.push("BPM " + song.bpm);
    if (typeof song.duration === "number" && song.duration > 0) chips.push("長度 " + fmtLen(song.duration));
    $("rv-song-chips").innerHTML = chips.map(function (c) { return '<span class="rv-chip">' + esc(c) + "</span>"; }).join("");
    var diff = currentDiff();
    var out = $("rv-best-value");
    out.textContent = "讀取中…";
    var my = ++bestReq;
    if (!shell || !shell.bestScoreFor) { out.textContent = "—"; return; }
    shell.bestScoreFor(song.id, diff).then(function (b) {
      if (my !== bestReq) return;
      out.textContent = b ? (b.score + " 分 · " + diff.toUpperCase() + (b.grade ? " · " + b.grade : "")) : ("這個難度還沒有測試成績（" + diff.toUpperCase() + "）");
      out.classList.toggle("is-empty", !b);
    }, function () { if (my === bestReq) { out.textContent = "暫時無法顯示"; out.classList.add("is-empty"); } });
  }

  /* ---------- 直向提示（不使用強制鎖定 API） ---------- */
  var mask = null, pausedByRotate = false, watchTimer = null;
  function isTouchDevice() {
    return (window.matchMedia && matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 0 || ("ontouchstart" in window);
  }
  function isPortrait() {
    if (window.matchMedia) return matchMedia("(orientation: portrait)").matches;
    return window.innerHeight > window.innerWidth;
  }
  function gameState() {
    var G = window.G;
    return { running: !!(G && G.running), paused: !!(G && G.paused), counting: !!window.isResumeCountingDown };
  }
  function pauseForRotate() {
    var st = gameState();
    if (!st.running || st.paused || st.counting) return;
    if (typeof window.togglePause === "function") { window.togglePause(); pausedByRotate = true; }
  }
  function onOrientation() {
    var show = isTouchDevice() && isPortrait();
    if (!mask) return;
    mask.hidden = !show;
    document.body.classList.toggle("rv-rotate-needed", show);
    if (show) {
      pauseForRotate();
      // 3 秒倒數途中轉直向：等倒數結束（恢復播放）的下一刻，再用原本 togglePause() 暫停
      if (!watchTimer) watchTimer = setInterval(function () { if (mask.hidden) { clearInterval(watchTimer); watchTimer = null; return; } pauseForRotate(); }, 100);
    } else {
      if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
      // 轉回橫向：保留原本暫停選單，由玩家按「繼續」→ 原本 3 秒倒數
      pausedByRotate = false;
    }
  }
  function mountRotateMask() {
    if ($("rv-rotate-mask")) return;
    mask = el("div", "rv-rotate-mask");
    mask.id = "rv-rotate-mask";
    mask.hidden = true;
    mask.setAttribute("role", "alertdialog");
    mask.setAttribute("aria-live", "assertive");
    mask.innerHTML =
      '<div class="rv-rotate-card"><div class="rv-rotate-phone" aria-hidden="true">📱</div>' +
      "<h2>請將手機轉成橫向</h2><p>轉動手機，一起進入小V哥哥的魔法音樂派對！</p>" +
      '<p class="rv-rotate-sub">演奏中轉成直向會自動暫停；轉回橫向後按「繼續」，會倒數 3 秒再開始。</p></div>';
    document.body.appendChild(mask);
    window.addEventListener("resize", onOrientation);
    window.addEventListener("orientationchange", function () { setTimeout(onOrientation, 120); });
    if (window.matchMedia) { var mq = matchMedia("(orientation: portrait)"); if (mq.addEventListener) mq.addEventListener("change", onOrientation); else if (mq.addListener) mq.addListener(onOrientation); }
    onOrientation();
  }

  window.RV27UI = {
    version: "v2.7.0-home-songselect-ui-test-1",
    assets: ASSETS,
    mount: function (api) {
      shell = api;
      document.body.classList.add("rv27-ui");
      mountHome();
      mountSongSelect();
      mountRotateMask();
      // 換頁後補更新（原 go() 照常執行；回到選歌頁時重新顯示最佳成績）
      var origGo = window.go;
      if (typeof origGo === "function" && !origGo.__rvWrapped) {
        var wrappedGo = function (id) {
          var r = origGo.apply(this, arguments);
          if (id === "s-songlist") updateSongInfo();
          if (id === "s-title") refreshPlayerCard();
          return r;
        };
        wrappedGo.__rvWrapped = true;
        window.go = wrappedGo;
      }
      refreshPlayerCard();
      updateSongInfo();
    },
    refreshPlayer: function () { refreshPlayerCard(); updateSongInfo(); },
    updateSongInfo: updateSongInfo,
    checkOrientation: onOrientation
  };
})();

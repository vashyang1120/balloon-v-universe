/* ==========================================================
   v2.6.5
   首頁＋歌曲選擇頁：正式美術整合、登場／待機動畫、遊戲按鈕美術、切歌動畫、直向提示
   （遊戲宇宙節奏遊戲入口）

   原則：
   - 只「搬移」原有元素到新版面，保留原 id、原事件、原無障礙名稱
   - 不改歌曲資料、切歌邏輯、難度、開始遊戲流程、遊戲核心；不寫入任何資料
   - 背景、小V、Logo 用同一個「背景座標框」定位：小V腳底固定在背景圓形舞台上
   - 動畫只在首頁／選歌頁可見時執行；待機效果只用 CSS（transform／opacity），離開畫面即移除
   ========================================================== */
(function () {
  "use strict";

  var ASSET = "assets/ui/";
  var ASSETS = {
    homeBg: ASSET + "rhythm_home_bg.webp",              homeBgPng: ASSET + "rhythm_home_bg.png",
    selectBg: ASSET + "rhythm_songselect_bg.webp",      selectBgPng: ASSET + "rhythm_songselect_bg.png",
    logo: ASSET + "rhythm_title_logo.webp",             logoPng: ASSET + "rhythm_title_logo.png",
    hero: "../../assets/rpg/v_full_open_arms.png",      // V-03（原圖，不修改）
    frame: "../../assets/ui/avatar_frame_pink_idle.png", // U-06
    btnYellow: ASSET + "buttons/ui_button_yellow.webp", // U-13（balloon-v-rush ui_button_yellow.png.png 裁透明留白）
    btnPurple: ASSET + "buttons/ui_button_purple.webp", // U-12（balloon-v-rush ui_button_purple.png）
    btnBlue: ASSET + "buttons/ui_button_blue.webp",     // U-14（balloon-v-rush ui_button_blue.png.png）
    arrowL: ASSET + "buttons/ui_arrow_left.webp",       // U-19
    arrowR: ASSET + "buttons/ui_arrow_right.webp"       // U-20
  };
  /* 背景座標：rhythm_home_bg 為 1672×941；圓形舞台頂面中心約在 (26.7%, 86.5%) */
  var BG_AR = 1672 / 941, FEET_X = 0.267, FEET_Y = 0.865, STAGE_MIN_X = 0.12, STAGE_MAX_X = 0.42;
  var HERO_AR = 378 / 469, HERO_SOLE = 464 / 469, HERO_FEET_CX = 0.49;   // 鞋底在原圖 y=464
  var LOGO_AR = 1774 / 887;
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var shell = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function move(node, parent) { if (node && parent) parent.appendChild(node); return node; }
  function picture(webp, png, cls, alt) {
    var p = el("picture", cls ? cls + "-pic" : "");
    var s = document.createElement("source"); s.type = "image/webp"; s.srcset = webp; p.appendChild(s);
    var i = el("img", cls); i.src = png; i.alt = alt || ""; i.decoding = "async"; i.draggable = false;
    p.appendChild(i);
    return { pic: p, img: i };
  }
  function img(src, cls, alt) {
    var i = el("img", cls); i.src = src; i.alt = alt || ""; i.decoding = "async"; i.draggable = false;
    i.addEventListener("error", function () { i.classList.add("rv-img-failed"); });
    return i;
  }
  function visible(screenId) { var s = $(screenId); return !!s && !s.classList.contains("off"); }
  function maskShown() { var m = $("rv-rotate-mask"); return !!m && !m.hidden; }

  /* 遊戲按鈕美術：圖片畫在 ::before（九宮格），文字仍是原 HTML */
  function artButton(btn, kind, size) {
    if (!btn) return;
    btn.classList.add("rv-art-btn", "rv-art-" + kind, "rv-size-" + size);
  }

  /* ==========================================================
     首頁
     ========================================================== */
  var home = null, scene = null, heroBox = null, logoBox = null;

  function mountHome() {
    var s = $("s-title");
    if (!s || s.querySelector(".rv-home")) return;
    home = el("div", "rv-home rv-pre");

    scene = el("div", "rv-scene");
    var bg = picture(ASSETS.homeBg, ASSETS.homeBgPng, "rv-scene-bg", "");
    scene.appendChild(bg.pic);
    // 輕量光暈（疊在背景聚光燈位置，慢速改變亮度）與少量獨立閃爍光點；位置以背景百分比表示
    scene.insertAdjacentHTML("beforeend",
      '<i class="rv-light rv-light-a" aria-hidden="true"></i><i class="rv-light rv-light-b" aria-hidden="true"></i>' +
      '<i class="rv-spark" style="left:34%;top:20%" aria-hidden="true"></i><i class="rv-spark rv-s2" style="left:70%;top:14%" aria-hidden="true"></i>' +
      '<i class="rv-spark rv-s3" style="left:9%;top:47%" aria-hidden="true"></i><i class="rv-spark rv-s4" style="left:57%;top:56%" aria-hidden="true"></i>' +
      '<i class="rv-spark rv-s5" style="left:91%;top:33%" aria-hidden="true"></i>');
    home.appendChild(scene);

    heroBox = el("div", "rv-hero");
    var heroMove = el("div", "rv-hero-move");
    heroMove.appendChild(img(ASSETS.hero, "rv-hero-img", "小V哥哥"));
    heroBox.appendChild(heroMove);
    home.appendChild(heroBox);

    // 正式 Logo 取代文字標題：沿用原 .logo 元素（保留 onclick="handleLogoClick()"）
    logoBox = el("div", "rv-logo-box");
    var logo = s.querySelector(".logo");
    if (!logo) logo = el("div", "logo");
    logo.textContent = "";
    logo.classList.add("rv-logo");
    var lg = picture(ASSETS.logo, ASSETS.logoPng, "rv-logo-img", "氣球小V魔法派對 遊戲宇宙・節奏遊戲");
    logo.appendChild(lg.pic);
    logoBox.appendChild(logo);
    home.appendChild(logoBox);

    var panel = el("section", "rv-panel");
    var meta = el("div", "rv-meta");
    move($("game-version"), meta);
    move(s.querySelector(".bv-title-meta"), meta);     // 遊戲宇宙服務狀態標記與讀取／錯誤卡
    panel.appendChild(meta);

    var card = el("div", "rv-player-card rv-in rv-in-card");
    card.id = "rv-player-card";
    card.innerHTML =
      '<div class="rv-avatar-box"><img id="rv-player-avatar" class="rv-player-avatar" alt="" src="' + BLANK + '"></div>' +
      '<div class="rv-player-text"><div class="rv-player-label">目前玩家</div>' +
      '<div id="rv-player-name" class="rv-player-name">讀取中…</div>' +
      '<div id="rv-player-title" class="rv-player-title"></div></div>';
    card.querySelector(".rv-avatar-box").insertBefore(img(ASSETS.frame, "rv-frame"), card.querySelector(".rv-player-avatar"));
    panel.appendChild(card);

    var daily = move($("home-daily-challenge-hint"), panel);
    if (daily) daily.classList.add("rv-in", "rv-in-daily");

    var play = $("btn-play");
    if (play) { play.textContent = "▶ 開始遊戲"; artButton(play, "yellow", "main"); play.classList.add("rv-in", "rv-in-b1", "rv-sheen"); panel.appendChild(play); }
    var row = el("div", "rv-btn-row");
    var lb = $("btn-lb-go");
    if (lb) { lb.textContent = "🏆 排行榜"; artButton(lb, "purple", "mid"); lb.classList.add("rv-in", "rv-in-b2"); row.appendChild(lb); }
    var lobby = $("bv-btn-lobby");
    if (lobby) { lobby.textContent = "🏠 返回遊戲宇宙"; artButton(lobby, "purple", "mid"); lobby.classList.add("rv-in", "rv-in-b3"); row.appendChild(lobby); }
    panel.appendChild(row);

    var minor = el("div", "rv-btn-row rv-btn-row-minor");
    var prof = $("btn-profile-go");
    if (prof) { artButton(prof, "purple", "small"); prof.classList.add("rv-in", "rv-in-b4"); minor.appendChild(prof); }
    var mv = s.querySelector('button[onclick*="youtube.com/playlist"]');
    if (mv) { artButton(mv, "blue", "small"); mv.classList.add("rv-in", "rv-in-b5"); minor.appendChild(mv); }
    panel.appendChild(minor);

    // 玩法教學：只預留 U-14 藍色風格的位置（不是按鈕、不可點擊），等新手教學版本完成再啟用
    var slot = el("div", "rv-tutorial-slot", "🎓 玩法教學・準備中");
    slot.setAttribute("aria-hidden", "true");
    panel.appendChild(slot);

    home.appendChild(panel);
    s.appendChild(home);
    s.classList.add("rv-ui");
  }

  function px(n) { return Math.round(n) + "px"; }
  /* 背景、小V、Logo 共用同一個背景座標框（cover、靠左下對齊）；只在尺寸改變時計算 */
  function layoutHome() {
    if (!home) return;
    var W = home.clientWidth, H = home.clientHeight;
    if (!W || !H) return;
    var cs = getComputedStyle(home);
    var safeT = parseFloat(cs.paddingTop) || 0, safeL = parseFloat(cs.paddingLeft) || 0;
    var sw, sh;
    if (W / H >= BG_AR) { sw = W; sh = W / BG_AR; } else { sh = H; sw = H * BG_AR; }
    var sx = 0, sy = H - sh;                       // 寬螢幕裁上方、窄螢幕裁右側；舞台永遠完整
    scene.style.left = px(sx); scene.style.top = px(sy); scene.style.width = px(sw); scene.style.height = px(sh);

    var colW = W * 0.48;
    var feetX = sx + FEET_X * sw, feetY = sy + FEET_Y * sh;
    var top = safeT + Math.max(6, H * 0.025), gap = Math.max(4, H * 0.012);
    var heroIdeal = Math.min(0.58 * sh, 0.64 * H);
    var heroMin = 0.36 * H;
    var logoMaxByW = (colW - safeL - 12) * 0.94 / LOGO_AR;
    var logoH = Math.min(logoMaxByW, 0.42 * H, Math.max(0.2 * H, feetY - heroIdeal - top - gap));
    var heroH = Math.min(heroIdeal, feetY - top - logoH - gap);
    if (heroH < heroMin) { logoH = Math.max(0.16 * H, feetY - heroMin - top - gap); heroH = Math.max(heroMin * 0.85, feetY - top - logoH - gap); }
    var heroW = heroH * HERO_AR;
    if (heroW > colW - 8) { heroW = colW - 8; heroH = heroW / HERO_AR; }
    // 腳底中心：盡量對準舞台中心，但不超出左欄；且必須留在舞台頂面範圍內
    var fc = Math.min(feetX, colW - 6 - heroW * (1 - HERO_FEET_CX));
    fc = Math.max(sx + STAGE_MIN_X * sw, Math.min(sx + STAGE_MAX_X * sw, fc));
    var heroLeft = fc - heroW * HERO_FEET_CX, heroTop = feetY - heroH * HERO_SOLE;
    heroBox.style.left = px(heroLeft); heroBox.style.top = px(heroTop); heroBox.style.width = px(heroW); heroBox.style.height = px(heroH);

    var logoW = logoH * LOGO_AR;
    var headY = heroTop + heroH * (2 / 469);
    var logoTop = top + Math.max(0, (headY - gap - top - logoH) / 2);
    var logoLeft = Math.max(safeL + 6, Math.min(colW - logoW - 6, fc - logoW / 2));
    logoBox.style.left = px(logoLeft); logoBox.style.top = px(logoTop); logoBox.style.width = px(logoW); logoBox.style.height = px(logoH);
    home.dataset.feet = Math.round(fc) + "," + Math.round(feetY);
  }

  /* ---------- 登場 → 待機；返回首頁短暫淡入 ---------- */
  var introDone = false, introTimer = null, introPending = false;
  function setHomeAnim(mode) {   // "intro" | "idle" | "return" | "off"
    if (!home) return;
    home.classList.remove("rv-intro", "rv-idle", "rv-return");
    if (introTimer) { clearTimeout(introTimer); introTimer = null; }
    if (mode === "off") return;
    if (mode === "intro") {
      home.classList.remove("rv-pre");
      void home.offsetWidth;
      home.classList.add("rv-intro");
      introTimer = setTimeout(function () { introTimer = null; introDone = true; setHomeAnim("idle"); }, 1500);
      return;
    }
    home.classList.remove("rv-pre");
    if (mode === "return") {
      void home.offsetWidth;
      home.classList.add("rv-return");
      introTimer = setTimeout(function () { introTimer = null; setHomeAnim("idle"); }, 320);
      return;
    }
    home.classList.add("rv-idle");
  }
  function waitImages(imgs, maxMs) {
    return new Promise(function (resolve) {
      var left = imgs.length, done = false;
      function one() { if (--left <= 0 && !done) { done = true; resolve(); } }
      if (!left) return resolve();
      imgs.forEach(function (i) { if (i.complete) one(); else { i.addEventListener("load", one, { once: true }); i.addEventListener("error", one, { once: true }); } });
      setTimeout(function () { if (!done) { done = true; resolve(); } }, maxMs);
    });
  }
  /* 首次進入：等首頁可見、旋轉遮罩解除、主要圖片就緒後才播放完整登場（只播一次） */
  function maybeIntro() {
    if (!home || introDone || introPending || introTimer) return;
    if (!visible("s-title") || maskShown()) return;
    introPending = true;
    layoutHome();
    waitImages([].slice.call(home.querySelectorAll(".rv-scene-bg, .rv-hero-img, .rv-logo-img")), 1800).then(function () {
      introPending = false;
      if (!visible("s-title") || maskShown()) return;          // 等待期間離開或轉成直向：下次再播
      layoutHome();
      if (window.RV27Audio) window.RV27Audio.onHomeIntro();     // 配合 Logo 登場淡入選單 BGM（被瀏覽器擋就等第一次點擊）
      if (REDUCED) { introDone = true; setHomeAnim("idle"); return; }
      setHomeAnim("intro");
    });
  }
  function onScreenChange(id) {
    if (id === "s-title") {
      layoutHome();
      if (!introDone) maybeIntro(); else setHomeAnim(REDUCED ? "idle" : "return");
    } else {
      setHomeAnim("off");                                       // 離開首頁：停止所有首頁動畫與計時器
      if (!introDone && home) home.classList.add("rv-pre");
    }
    if (id === "s-songlist") { selectAnimOn(true); updateSongInfo(); } else selectAnimOn(false);
    if (window.RV27Result) window.RV27Result.onScreenChange(id);                    // 結算頁演出（離開即取消）
    if (window.RV27Audio) window.RV27Audio.update(id === "s-game" ? "game" : id);   // 選單 BGM：演奏畫面停止、選單畫面延續
  }

  function refreshPlayerCard() {
    var d = shell && shell.playerCardData ? shell.playerCardData() : null;
    var name = $("rv-player-name"), title = $("rv-player-title"), av = $("rv-player-avatar");
    if (!name) return;
    if (!d) {
      name.textContent = "讀取中…";
      title.textContent = ""; av.src = BLANK; return;
    }
    name.textContent = d.displayId;
    title.textContent = d.titleName ? "🏅 " + d.titleName : "尚未裝備稱號";
    title.classList.toggle("is-empty", !d.titleName);
    av.src = d.avatarSrc || BLANK;
  }

  /* ==========================================================
     歌曲選擇頁
     ========================================================== */
  var select = null;
  function mountSongSelect() {
    var s = $("s-songlist");
    if (!s || s.querySelector(".rv-select")) return;
    select = el("div", "rv-select");
    var bg = picture(ASSETS.selectBg, ASSETS.selectBgPng, "rv-select-bg", "");
    select.appendChild(bg.pic);

    var left = el("section", "rv-cover-side");
    var h2 = s.querySelector("h2");
    if (h2) { h2.textContent = "🎵 選擇歌曲"; left.appendChild(h2); }
    var cards = move($("song-cards"), left);
    [["song-prev", ASSETS.arrowL, "上一首"], ["song-next", ASSETS.arrowR, "下一首"]].forEach(function (a) {
      var b = left.querySelector("#" + a[0]);   // song-cards 已搬進尚未掛上頁面的 left，需從 left 內尋找
      if (!b) return;
      b.setAttribute("aria-label", a[2]);
      b.innerHTML = '<span class="rv-arrow-fallback" aria-hidden="true">' + (a[0] === "song-prev" ? "◀" : "▶") + "</span>";
      var i = img(a[1], "rv-arrow-img");
      i.addEventListener("load", function () { b.classList.add("rv-arrow-ready"); });
      b.appendChild(i);
      b.classList.add("rv-press");
    });
    move($("song-counter"), left);
    if (cards) cards.classList.add("rv-cards");
    var tag = el("div", "rv-test-tag", ""節奏遊戲 · " + esc(window.RV27UI ? window.RV27UI.version : ""));
    left.appendChild(tag);

    var right = el("section", "rv-info-side");
    var info = el("div", "rv-song-info");
    info.id = "rv-song-info";
    info.innerHTML =
      '<div id="rv-song-title" class="rv-song-title"></div>' +
      '<div id="rv-song-artist" class="rv-song-artist"></div>' +
      '<div id="rv-song-chips" class="rv-song-chips"></div>' +
      '<div class="rv-best"><span class="rv-best-label">我的最佳</span><span id="rv-best-value" class="rv-best-value">—</span></div>';
    right.appendChild(info);
    move($("songlist-daily-challenge-hint"), right);
    var diff = move($("diff-wrap"), right);
    if (diff) {
      var lab = diff.querySelector("label"); if (lab) lab.textContent = "選擇難度";
      diff.querySelectorAll(".db").forEach(function (b) {
        b.addEventListener("click", function () {
          b.classList.remove("rv-bounce"); void b.offsetWidth; if (!REDUCED) b.classList.add("rv-bounce");
          setTimeout(updateSongInfo, 0);
        });
      });
    }
    var actions = el("div", "rv-select-actions");
    var back = $("btn-back-song");
    if (back) { back.textContent = "← 返回首頁"; artButton(back, "purple", "mid"); actions.appendChild(back); }
    var start = $("btn-start");
    if (start) { start.textContent = "▶ 開始歌曲"; artButton(start, "yellow", "main"); start.classList.add("rv-sheen"); actions.appendChild(start); }
    right.appendChild(actions);

    select.appendChild(left);
    select.appendChild(right);
    s.appendChild(select);
    s.classList.add("rv-ui");

    // 原 renderSongCards() 照常執行（切歌順序、封面、頁碼不變）；之後只做呈現用的轉場與右側資訊
    var orig = window.renderSongCards;
    if (typeof orig === "function" && !orig.__rvWrapped) {
      var wrapped = function () {
        var wrapEl = $("song-card-wrap");
        var prevIdx = lastIdx, ghost = null;
        cancelCardAnims();
        var old = wrapEl && wrapEl.querySelector(".song-card:not(.rv-card-ghost)");
        if (old && prevIdx !== null && typeof window.songIdx === "number" && prevIdx !== window.songIdx && !REDUCED && visible("s-songlist")) {
          var r0 = wrapEl.getBoundingClientRect(), r1 = old.getBoundingClientRect();
          ghost = old.cloneNode(true);
          ghost.classList.add("rv-card-ghost");
          ghost.setAttribute("aria-hidden", "true");
          ghost.style.left = px(r1.left - r0.left); ghost.style.top = px(r1.top - r0.top); ghost.style.width = px(r1.width);
        }
        var result = orig.apply(this, arguments);
        lastIdx = typeof window.songIdx === "number" ? window.songIdx : null;
        if (ghost && wrapEl) {
          var dir = lastIdx > prevIdx ? 1 : -1;   // 下一首：舊封面往左、新封面從右；上一首相反
          wrapEl.appendChild(ghost);
          var fresh = wrapEl.querySelector(".song-card:not(.rv-card-ghost)");
          var a1 = ghost.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(" + (-dir * 30) + "%)", opacity: 0 }], { duration: 220, easing: "ease-in" });
          a1.onfinish = a1.oncancel = function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); };
          cardAnims.push(a1);
          if (fresh) cardAnims.push(fresh.animate([{ transform: "translateX(" + (dir * 30) + "%)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }));
          var infoEl = $("rv-song-info");
          if (infoEl) cardAnims.push(infoEl.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 220, easing: "ease-out" }));
        }
        updateSongInfo();
        return result;
      };
      wrapped.__rvWrapped = true;
      window.renderSongCards = wrapped;
    }
  }
  var lastIdx = null, cardAnims = [];
  function cancelCardAnims() {
    cardAnims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    cardAnims = [];
    var w = $("song-card-wrap");
    if (w) w.querySelectorAll(".rv-card-ghost").forEach(function (g) { g.parentNode.removeChild(g); });
  }
  function selectAnimOn(on) {
    if (!select) return;
    select.classList.toggle("rv-active", !!on);
    if (!on) cancelCardAnims();
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
    var diff = currentDiff(), songId = song.id;
    var out = $("rv-best-value");
    out.textContent = "讀取中…";
    var my = ++bestReq;                       // 只採用最新一次查詢（快速切歌不會顯示過期成績）
    if (!shell || !shell.bestScoreFor) { out.textContent = "—"; return; }
    shell.bestScoreFor(songId, diff).then(function (b) {
      if (my !== bestReq) return;
      out.textContent = b ? (b.score + " 分 · " + diff.toUpperCase() + (b.grade ? " · " + b.grade : "")) : ("這個難度還沒有成績（" + diff.toUpperCase() + "）");
      out.classList.toggle("is-empty", !b);
    }, function () { if (my === bestReq) { out.textContent = "暫時無法顯示"; out.classList.add("is-empty"); } });
  }

  /* ==========================================================
     直向提示（不使用強制鎖定 API；不輪詢）
     ========================================================== */
  var mask = null;
  function isTouchDevice() {
    return (window.matchMedia && matchMedia("(pointer: coarse)").matches) || navigator.maxTouchPoints > 0 || ("ontouchstart" in window);
  }
  function isPortrait() {
    if (window.matchMedia) return matchMedia("(orientation: portrait)").matches;
    return window.innerHeight > window.innerWidth;
  }
  /* 演奏中轉直向：
     - 3 秒恢復倒數進行中 → 呼叫 cancelResumeCountdown()，立即中止該次恢復（音訊、MV、計時都不啟動），回到暫停選單
     - 正在演奏 → 呼叫原本的 togglePause()
     - 已暫停 → 保持暫停 */
  function pauseForRotate() {
    var G = window.G;
    if (!G || !G.running) return;
    if (window.isResumeCountingDown) { if (typeof window.cancelResumeCountdown === "function") window.cancelResumeCountdown(); return; }
    if (!G.paused && typeof window.togglePause === "function") window.togglePause();
  }
  function onOrientation() {
    if (!mask) return;
    var show = isTouchDevice() && isPortrait();
    var was = !mask.hidden;
    mask.hidden = !show;
    document.body.classList.toggle("rv-rotate-needed", show);
    if (show) pauseForRotate();
    if (window.RV27Audio) window.RV27Audio.update("rotate");   // 直向提示期間暫停選單 BGM，轉回橫向依狀態恢復
    // 轉回橫向：保留暫停選單，由玩家按「繼續」→ 原本完整 3 秒倒數；不自動恢復
    if (visible("s-title")) layoutHome();
    if (was && !show) maybeIntro();
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
      '<p class="rv-rotate-sub">演奏中轉成直向會立即暫停；轉回橫向後按「繼續」，會重新倒數 3 秒再開始。</p></div>';
    document.body.appendChild(mask);
    var t = null;
    function soon() { if (t) clearTimeout(t); t = setTimeout(function () { t = null; onOrientation(); }, 60); }
    window.addEventListener("resize", soon);
    window.addEventListener("orientationchange", soon);
    if (window.matchMedia) { var mq = matchMedia("(orientation: portrait)"); if (mq.addEventListener) mq.addEventListener("change", onOrientation); else if (mq.addListener) mq.addListener(onOrientation); }
    onOrientation();
  }

  window.RV27UI = {
    version: "v2.6.5",
    assets: ASSETS,
    mount: function (api) {
      if (document.body.classList.contains("rv27-ui")) return;   // 防止重複掛載
      shell = api;
      document.body.classList.add("rv27-ui");
      if (REDUCED) document.body.classList.add("rv-reduced");
      document.addEventListener("touchstart", function () {}, { passive: true });   // 讓 iOS 觸發 :active 按壓效果
      mountHome();
      mountSongSelect();
      mountRotateMask();
      if (window.RV27Result) window.RV27Result.mount();
      if (window.RV27Audio) window.RV27Audio.mount();
      var origGo = window.go;
      if (typeof origGo === "function" && !origGo.__rvWrapped) {
        var wrappedGo = function (id) { var r = origGo.apply(this, arguments); try { onScreenChange(id); } catch (e) { console.warn("[RV27UI]", e); } return r; };
        wrappedGo.__rvWrapped = true;
        window.go = wrappedGo;
      }
      refreshPlayerCard();
      updateSongInfo();
      layoutHome();
      onScreenChange(visible("s-title") ? "s-title" : (visible("s-songlist") ? "s-songlist" : ""));
    },
    refreshPlayer: function () { refreshPlayerCard(); updateSongInfo(); },   // 資料更新只換內容，不重播登場
    updateSongInfo: updateSongInfo,
    checkOrientation: onOrientation,
    layoutHome: layoutHome,
    state: function () { return { introDone: introDone, anim: home ? home.className : "", feet: home ? home.dataset.feet : "" }; }
  };
})();

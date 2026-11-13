/* ==========================================================
   氣球小V遊戲宇宙 — 排行榜總覽＋正式 V幣（v0.3.0 正式上線整合）
   balloon-v-universe-v0.3.0-launch-integration-test-1

   ■ 左下木牌「排行榜」→ 排行榜總覽：四款遊戲各自一個「查看排行榜」按鈕
       方塊工坊：總分榜（個人最佳）
       音樂舞台：每首歌 × 每個難度各一個榜
       知識學院：主榜／低年級／中年級／高年級（原版規則：科目最佳 → 年級加總 → 三個年級加總）
       派對島大作戰：每個大陸一個榜（只收完整通關總分）；尚未開放的大陸顯示「未開放」，不顯示任何分數
   ■ 我的通行證：顯示伺服器上的正式 V幣餘額與最近紀錄（只讀；消費尚未開放）
   ■ v0.3.1 我的通行證「收藏」：遊戲宇宙共用稱號＋展示頭像；可以裝備（POST /v1/players/:id/equip，
     伺服器檢查 ID＋身份頭像，而且只能選自己已解鎖的）。四款遊戲讀同一份資料。
   ■ 除了「裝備」之外只有讀取（GET）；V幣、稱號、頭像解鎖都由伺服器依正式成績發放，前端不能寫入。
   ■ 測試沙盒（?sandbox=1）不連線正式排行榜與錢包。
   ========================================================== */
(function () {
  "use strict";

  var CFG = window.MAP_CONFIG;
  var Store = window.PlayerStore;
  var L = window.Lobby;
  if (!CFG || !Store || !L) return;
  var API = String(CFG.player.apiBaseUrl || "").replace(/\/+$/, "");
  var SANDBOX = !!Store.sandbox;
  var esc = L.escapeHtml;
  var AV = CFG.player.avatarBaseUrl || "assets/avatars/base/";

  var GAMES = [
    { gameId: "tetris", zone: "方塊工坊", name: "方塊派對", btn: "btn_tetris" },
    { gameId: "rhythm", zone: "音樂舞台", name: "節奏遊戲", btn: "btn_rhythm" },
    { gameId: "quiz", zone: "知識學院", name: "知識挑戰", btn: "btn_quiz" },
    { gameId: "adventure", zone: "派對島", name: "派對島大作戰", btn: "btn_adventure" }
  ];
  var DIFF = { easy: "簡單", normal: "普通", hard: "困難" };
  var QUIZ_TABS = [["main", "主榜"], ["low", "低年級"], ["middle", "中年級"], ["high", "高年級"]];

  function $(id) { return document.getElementById(id); }
  var els = { modal: $("lbModal"), close: $("lbClose"), title: $("lbTitle"), back: $("lbBack"), body: $("lbBody") };
  if (!els.modal) return;

  /* ---------- 只讀 API ---------- */
  function get(path) { return call("GET", path); }
  function call(method, path, body) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.player.apiTimeoutMs || 15000);
    var headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    return fetch(API + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        clearTimeout(timer);
        if (res.status === 200 && res.body && res.body.ok) return res.body.data;
        var e = new Error((res.body && res.body.error && res.body.error.message) || "伺服器暫時無法使用");
        e.status = res.status; throw e;
      }, function (err) {
        clearTimeout(timer);
        var e = new Error(err && err.name === "AbortError" ? "連線逾時，請檢查網路後再試一次" : "網路連線失敗，請檢查網路後再試一次");
        e.network = true; throw e;
      });
  }

  /* ==========================================================
     排行榜
     ========================================================== */
  var state = { view: "overview", catalog: null, status: null, gameId: null, boardId: null, songId: null, reqToken: 0 };

  function open() {
    els.modal.hidden = false;
    showOverview();
    els.close.focus();
    L.emit("leaderboardOpened");
  }
  function close() {
    if (els.modal.hidden) return;
    els.modal.hidden = true;
    state.reqToken++;
    L.emit("leaderboardClosed");
  }

  function loadingHtml() { return '<p class="lb-state">🎈 載入中…</p>'; }
  function errorHtml(msg) {
    return '<div class="lb-state lb-state--error"><p>⚠️ ' + esc(msg || "排行榜暫時無法顯示") + '</p><button class="btn btn--primary lb-retry" type="button" data-lb-retry>🔄 再試一次</button></div>';
  }

  function ensureCatalog() {
    if (state.catalog) return Promise.resolve(state.catalog);
    var me = L.current();
    return Promise.all([get("/v1/leaderboards"), get("/v1/launch/status" + (me ? "?playerId=" + encodeURIComponent(me.playerId) : "")).catch(function () { return null; })]).then(function (r) {
      state.catalog = r[0]; state.status = r[1];
      return state.catalog;
    });
  }

  function showOverview() {
    state.view = "overview";
    els.title.textContent = "🏆 排行榜";
    els.back.hidden = true;
    var note = SANDBOX ? '<p class="lb-note">🧪 測試沙盒不連線正式排行榜；正式網站才會顯示排行榜。</p>' : "";
    els.body.innerHTML = note + '<div class="lb-games">' + GAMES.map(function (g) {
      return '<div class="lb-game">' +
        '<img class="lb-game__art" src="' + esc(CFG.ui[g.btn]) + '" alt="" draggable="false">' +
        '<div class="lb-game__text"><b>' + esc(g.name) + '</b><span>' + esc(g.zone) + "</span></div>" +
        '<button class="btn btn--primary lb-game__btn" type="button" data-lb-game="' + g.gameId + '"' + (SANDBOX ? " disabled" : "") + ">查看排行榜</button></div>";
    }).join("") + "</div>";
  }

  function gameName(gameId) { var g = GAMES.filter(function (x) { return x.gameId === gameId; })[0]; return g ? g.name : gameId; }

  function showGame(gameId) {
    state.view = "game"; state.gameId = gameId;
    els.title.textContent = "🏆 " + gameName(gameId);
    els.back.hidden = false;
    els.body.innerHTML = loadingHtml();
    var token = ++state.reqToken;
    ensureCatalog().then(function (cat) {
      if (token !== state.reqToken) return;
      var boards = (cat.games[gameId] || {}).boards || [];
      if (gameId === "tetris") return renderBoardShell(gameId, "", [], "total");
      if (gameId === "quiz") return renderBoardShell(gameId, tabsHtml(QUIZ_TABS.map(function (t) { return { id: t[0], label: t[1] }; }), "main"), [], "main");
      if (gameId === "adventure") {
        var tabs = boards.map(function (b) { return { id: b.boardId, label: b.name.replace(/榜$/, ""), disabled: b.status !== "open", badge: b.status !== "open" ? "未開放" : "" }; });
        var first = (boards.filter(function (b) { return b.status === "open"; })[0] || {}).boardId || "continent-1";
        return renderBoardShell(gameId, tabsHtml(tabs, first), boards, first);
      }
      // 節奏：先選歌，再選難度
      var songs = [];
      boards.forEach(function (b) { if (songs.every(function (s) { return s.songId !== b.songId; })) songs.push({ songId: b.songId, title: b.songTitle }); });
      state.songId = state.songId && songs.some(function (s) { return s.songId === state.songId; }) ? state.songId : (songs[0] && songs[0].songId);
      var pick = '<label class="lb-pick"><span>歌曲</span><select id="lbSong">' + songs.map(function (s) {
        return '<option value="' + esc(s.songId) + '"' + (s.songId === state.songId ? " selected" : "") + ">" + esc(s.title) + "</option>";
      }).join("") + "</select></label>";
      var diffTabs = tabsHtml(["easy", "normal", "hard"].map(function (d) { return { id: d, label: DIFF[d] }; }), "normal");
      renderBoardShell(gameId, pick + diffTabs, boards, state.songId + "--normal");
    }, function (err) {
      if (token !== state.reqToken) return;
      els.body.innerHTML = errorHtml(err.message);
    });
  }

  function tabsHtml(tabs, active) {
    return '<div class="tabs lb-tabs" role="tablist">' + tabs.map(function (t) {
      return '<button class="tab' + (t.id === active ? " is-active" : "") + '" type="button" role="tab" data-lb-tab="' + esc(t.id) + '"' +
        (t.disabled ? ' disabled aria-disabled="true"' : "") + ">" + esc(t.label) + (t.badge ? '<em class="lb-badge">' + esc(t.badge) + "</em>" : "") + "</button>";
    }).join("") + "</div>";
  }

  function renderBoardShell(gameId, controls, boards, boardId) {
    var mode = state.status && state.status.mode;
    var off = mode === "off" || (!mode && state.status && state.status.scores !== "enabled");
    els.body.innerHTML = controls +
      (mode === "trial" ? '<p class="lb-note lb-note--trial">🧪 試營運排行榜：這裡是測試資料，不是正式排名；正式開放前會清除。</p>' : "") +
      (off ? '<p class="lb-note">正式成績功能還沒有開啟，目前排行榜不會有成績。</p>' : "") +
      '<div class="lb-list" id="lbList"></div>';
    loadBoard(gameId, boardId);
  }

  function loadBoard(gameId, boardId) {
    state.boardId = boardId;
    var list = $("lbList");
    if (!list) return;
    list.innerHTML = loadingHtml();
    var me = L.current();
    var token = ++state.reqToken;
    get("/v1/leaderboards/" + encodeURIComponent(gameId) + "/" + encodeURIComponent(boardId) + "?limit=50" + (me ? "&playerId=" + encodeURIComponent(me.playerId) : "")).then(function (b) {
      if (token !== state.reqToken) return;
      list.innerHTML = boardHtml(gameId, boardId, b, me);
    }, function (err) {
      if (token !== state.reqToken) return;
      list.innerHTML = errorHtml(err.message);
    });
  }

  function metaFor(gameId, boardId, r) {
    var x = r.extra || {};
    if (gameId === "tetris") return "LV" + (x.level || "-") + "・" + (x.lines || 0) + " 行・" + ({ easy: "輕鬆", normal: "普通", hard: "挑戰" }[x.difficulty] || "");
    if (gameId === "rhythm") return (x.grade || "") + "・ACC " + (x.accuracy != null ? x.accuracy : "-") + "%・最高 Combo " + (x.maxCombo || 0);
    if (gameId === "quiz") return (r.completedSubjects || 0) + " 科／滿分 " + (r.perfectSubjects || 0) + " 科" + (r.summary ? "・" + r.summary : "");
    if (gameId === "adventure") return "完整通關" + (x.rank ? "・評價 " + x.rank : "");
    return "";
  }

  function boardHtml(gameId, boardId, b, me) {
    if (!b.rows.length) return '<p class="lb-state">還沒有人上榜，成為第一名吧！🎈</p>';
    var rows = b.rows.map(function (r) {
      var mine = me && r.playerId === me.playerId;
      var medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : String(r.rank);
      return '<li class="lb-row' + (mine ? " is-me" : "") + '">' +
        '<span class="lb-row__rank">' + medal + "</span>" +
        '<img class="lb-row__av" src="' + esc(window.PlayerIdentity.avatarSrc(r.displayAvatarKey) || (AV + r.displayAvatarKey + ".png")) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="lb-row__info"><b>' + esc(r.displayId || "玩家") + (mine ? " ⭐" : "") + "</b>" + (r.titleName ? '<em class="lb-row__title">🎖 ' + esc(r.titleName) + "</em>" : "") + "<small>" + esc(metaFor(gameId, boardId, r)) + "</small></span>" +
        '<span class="lb-row__score">' + Number(r.score || 0).toLocaleString() + "</span></li>";
    }).join("");
    var mineLine = "";
    if (me && b.me && b.me.rank > b.rows.length) mineLine = '<p class="lb-mine">我的名次：第 ' + b.me.rank + " 名（" + Number(b.me.score).toLocaleString() + "）</p>";
    else if (me && !b.me) mineLine = '<p class="lb-mine lb-mine--none">「' + esc(me.id) + "」還沒有這個排行榜的成績</p>";
    return '<ol class="lb-rows">' + rows + "</ol>" + mineLine + '<p class="lb-foot">共 ' + b.total + " 位玩家・每位玩家只列個人最佳</p>";
  }

  els.body.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t || t.disabled) return;
    if (t.dataset.lbGame) return showGame(t.dataset.lbGame);
    if (t.hasAttribute("data-lb-retry")) {
      if (state.view === "game" && $("lbList") && state.boardId) return loadBoard(state.gameId, state.boardId);
      state.catalog = null; return showGame(state.gameId);
    }
    if (t.dataset.lbTab) {
      t.parentNode.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("is-active", x === t); });
      var id = t.dataset.lbTab;
      if (state.gameId === "rhythm") id = state.songId + "--" + id;
      loadBoard(state.gameId, id);
    }
  });
  els.body.addEventListener("change", function (e) {
    if (e.target.id !== "lbSong") return;
    state.songId = e.target.value;
    var act = els.body.querySelector(".lb-tabs .tab.is-active");
    loadBoard("rhythm", state.songId + "--" + (act ? act.dataset.lbTab : "normal"));
  });
  els.back.addEventListener("click", showOverview);
  els.close.addEventListener("click", close);
  els.modal.addEventListener("click", function (e) { if (e.target === els.modal) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !els.modal.hidden) { e.stopImmediatePropagation(); close(); } }, true);

  /* ==========================================================
     正式 V幣（我的通行證／右上玩家卡）
     ========================================================== */
  var walletToken = 0;
  function loadWallet(d) {
    if (SANDBOX || !d || !d.playerId) return;
    var token = ++walletToken;
    d.walletState = "loading";
    get("/v1/wallet/" + encodeURIComponent(d.playerId)).then(function (w) {
      if (token !== walletToken || L.current() !== d) return;
      d.features.wallet = true;
      d.balance = Number(w.balance || 0);
      d.wallet = w;
      d.walletState = "ok";
      L.renderAll();
      L.emit("walletLoaded", w);
    }, function (err) {
      if (token !== walletToken || L.current() !== d) return;
      d.walletState = "error";
      d.walletError = err.message;
      L.emit("walletFailed", err);
    });
  }

  /* ==========================================================
     v0.3.1 共用收藏（稱號＋展示頭像）— 我的通行證「收藏」頁
     ========================================================== */
  var GAME_NAMES = CFG.player.gameNames;
  var collToken = 0;
  function applyCollection(d, c) {
    d.collection = c;
    d.features.titles = true;
    d.features.avatarUnlocks = true;
    d.title = c.equipped.titleKey ? { titleKey: c.equipped.titleKey, name: c.equipped.titleName } : null;
    d.unlockedTitles = c.titles.map(function (t) { return { titleKey: t.titleKey, gameId: t.gameId, name: t.name }; });
    d.unlockedAvatarKeys = c.avatars.map(function (a) { return a.avatarKey; });
    d.unlockedAvatars = {};
    c.catalog.avatars.forEach(function (a) { d.unlockedAvatars[a.avatarKey] = { image: a.image, name: a.name, unlocked: a.unlocked }; });
    d.displayAvatarKey = c.equipped.displayAvatarKey || d.baseAvatarKey;
  }
  function loadCollection(d) {
    if (SANDBOX || !d || !d.playerId) return;
    var token = ++collToken;
    get("/v1/players/" + encodeURIComponent(d.playerId) + "/collection").then(function (c) {
      if (token !== collToken || L.current() !== d) return;
      applyCollection(d, c);
      L.renderAll();
      L.emit("collectionLoaded", c);
    }, function (err) {
      if (token !== collToken || L.current() !== d) return;
      d.collectionError = err.message;
    });
  }

  function collectionHtml(d) {
    var c = d.collection;
    var off = !c.canEquip;
    var note = (c.mode === "trial" ? '<p class="coll-note">🧪 試營運收藏：這裡是測試資料，正式開放前會清除。' + (off ? "你不在試營運名單內，目前只能查看。" : "") + "</p>" : "") +
      (off && c.mode !== "trial" ? '<p class="coll-note">正式收藏功能尚未開啟：目前只能查看，暫時不能更換。</p>' : "");
    var eqT = c.equipped.titleKey;
    // 稱號：已解鎖（可裝備）＋各遊戲尚未解鎖／準備中
    var unlocked = c.titles.length
      ? '<div class="coll-chips">' + c.titles.map(function (t) {
          var on = t.titleKey === eqT;
          return '<button type="button" class="coll-chip' + (on ? " is-on" : "") + '" data-equip-title="' + esc(t.titleKey) + '"' + (off || on ? " disabled" : "") + ">" +
            esc(t.name) + "<small>" + esc(GAME_NAMES[t.gameId] || t.gameId) + (on ? "・裝備中" : "") + "</small></button>";
        }).join("") + "</div>" +
        (eqT ? '<button type="button" class="coll-link" data-equip-title=""' + (off ? " disabled" : "") + ">不裝備稱號</button>" : "")
      : '<p class="empty">還沒有解鎖稱號。玩遊戲達成條件就會自動解鎖！</p>';
    var locked = ["tetris", "rhythm", "quiz", "adventure"].map(function (g) {
      var rows = c.catalog.titles.filter(function (t) { return t.gameId === g && !t.unlocked; });
      if (!rows.length) return "";
      return "<details class=\"coll-locked\"><summary>" + esc(GAME_NAMES[g]) + "：還有 " + rows.length + " 個稱號</summary><ul>" + rows.map(function (t) {
        return "<li>🔒 <b>" + esc(t.name) + "</b><span>" + esc(t.status === "preparing" ? "準備中" : t.conditionText) + "</span></li>";
      }).join("") + "</ul></details>";
    }).join("");
    // 展示頭像：身份頭像＋可解鎖頭像（未解鎖顯示鎖定；私人頭像只有被授權才會出現）
    var eqA = c.equipped.displayAvatarKey || d.baseAvatarKey;
    var avs = [{ avatarKey: d.baseAvatarKey, name: "身份頭像", unlocked: true, base: true }].concat(c.catalog.avatars);
    var grid = '<div class="coll-avs">' + avs.map(function (a) {
      var on = a.avatarKey === eqA;
      var src = a.base ? window.PlayerIdentity.avatarSrc(a.avatarKey) : a.image;
      return '<button type="button" class="coll-av' + (on ? " is-on" : "") + (a.unlocked ? "" : " is-locked") + '" data-equip-avatar="' + esc(a.base ? "" : a.avatarKey) + '"' +
        (!a.unlocked || on || off ? " disabled" : "") + ' title="' + esc(a.unlocked ? a.name : a.conditionText) + '">' +
        '<img src="' + esc(src) + '" alt="" onerror="this.style.visibility=\'hidden\'">' + (a.unlocked ? "" : '<i aria-hidden="true">🔒</i>') +
        "<small>" + esc(a.name) + (on ? "・使用中" : "") + "</small></button>";
    }).join("") + "</div>";
    return note +
      '<h4 class="sec">🎖 目前稱號：' + esc(c.equipped.titleName || "未裝備") + "</h4>" + unlocked + locked +
      '<h4 class="sec">🖼 展示頭像</h4><p class="coll-hint">身份頭像固定不變；展示頭像只改變外觀，不會改變玩家身份、成績、排行榜和 V幣。</p>' + grid +
      '<p class="coll-msg" id="collMsg" role="status"></p>';
  }

  var equipBusy = false;
  function equip(patch) {
    var d = L.current();
    if (!d || !d.collection || equipBusy) return;
    equipBusy = true;
    var msg = $("collMsg"); if (msg) msg.textContent = "儲存中…";
    call("POST", "/v1/players/" + encodeURIComponent(d.playerId) + "/equip", Object.assign({ displayId: d.id, baseAvatarKey: d.baseAvatarKey }, patch)).then(function (c) {
      equipBusy = false;
      if (L.current() !== d) return;
      applyCollection(d, c);
      L.renderAll();
      L.emit("collectionLoaded", c);
      var m = $("collMsg"); if (m) m.textContent = "✅ 已更新，四款遊戲會一起換成新的展示內容";
    }, function (err) {
      equipBusy = false;
      var m = $("collMsg"); if (m) m.textContent = "⚠️ " + err.message;
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#passTabBody [data-equip-title], #passTabBody [data-equip-avatar]");
    if (!b || b.disabled) return;
    if (b.hasAttribute("data-equip-title")) equip({ titleKey: b.getAttribute("data-equip-title") || null });
    else equip({ displayAvatarKey: b.getAttribute("data-equip-avatar") || null });
  });

  L.on("playerChanged", function (d) { loadWallet(d); loadCollection(d); });
  L.on("passOpened", function () { var d = L.current(); if (d && d.walletState !== "loading") loadWallet(d); if (d) loadCollection(d); });
  if (L.current()) { loadWallet(L.current()); loadCollection(L.current()); }

  window.LobbyLaunch = { open: open, close: close, showGame: showGame, loadWallet: loadWallet, loadCollection: loadCollection, collectionHtml: collectionHtml,
    isOpen: function () { return !els.modal.hidden; } };
})();

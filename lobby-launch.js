/* ==========================================================
   氣球小V遊戲宇宙 — 排行榜總覽＋正式 V幣（v0.3.0 正式上線整合）
   balloon-v-universe-v0.3.0-launch-integration-test-1

   ■ 左下木牌「排行榜」→ 排行榜總覽：四款遊戲各自一個「查看排行榜」按鈕
       方塊工坊：總分榜（個人最佳）
       音樂舞台：每首歌 × 每個難度各一個榜
       知識學院：主榜／低年級／中年級／高年級（原版規則：科目最佳 → 年級加總 → 三個年級加總）
       派對島大作戰：每個大陸一個榜（只收完整通關總分）；尚未開放的大陸顯示「未開放」，不顯示任何分數
   ■ 我的通行證：顯示伺服器上的正式 V幣餘額與最近紀錄（只讀；消費尚未開放）
   ■ 只有讀取（GET）；這個檔案不會寫入任何資料。
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
  function get(path) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.player.apiTimeoutMs || 15000);
    return fetch(API + path, { method: "GET", headers: { accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined })
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
    return Promise.all([get("/v1/leaderboards"), get("/v1/launch/status").catch(function () { return null; })]).then(function (r) {
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
    var off = state.status && state.status.scores !== "enabled";
    els.body.innerHTML = controls +
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
        '<img class="lb-row__av" src="' + esc(AV + r.displayAvatarKey + ".png") + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="lb-row__info"><b>' + esc(r.displayId || "玩家") + (mine ? " ⭐" : "") + "</b><small>" + esc(metaFor(gameId, boardId, r)) + "</small></span>" +
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
  L.on("playerChanged", loadWallet);
  L.on("passOpened", function () { var d = L.current(); if (d && d.walletState !== "loading") loadWallet(d); });
  if (L.current()) loadWallet(L.current());

  window.LobbyLaunch = { open: open, close: close, showGame: showGame, loadWallet: loadWallet, isOpen: function () { return !els.modal.hidden; } };
})();

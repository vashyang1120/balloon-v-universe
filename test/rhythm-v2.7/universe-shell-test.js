/* ==========================================================
   氣球小V節奏遊戲 — v2.7.0-universe-foundation-test-1
   測試專用換殼層（取代 universe/rhythm/universe-shell.js，只在 test/rhythm-v2.7/ 使用）

   以正式宇宙版 universe/rhythm/universe-shell.js 為基準，對外介面（window.UniverseRhythm）完全相同，
   遊戲本體 index.html 呼叫的方式不變。差異只有「資料隔離」：

   1. 身份：只接受網址 ?bvPlayerId=，用正式 SDK 的 production 玩家讀取（GET /v1/players/:id，唯讀）
            allowLobbyFallback:false → 不讀大廳記住的上一位玩家（bvUniverse_v2_currentPlayerId）
   2. 沒有 bvPlayerId → 測試入口選擇畫面（返回大廳／純 UI 測試角色 Mock）；不進入舊 ID／頭像流程
   3. 傳給 SDK 的 fetch 只允許 GET /v1/players/:playerId 與 GET /v1/avatars/base；其他一律拒絕
   4. 傳給 SDK 的 localStorage / sessionStorage 全部加上前綴 vRhythmV270UniverseTest1::
   5. S.official（正式成績／排行榜／V幣／收藏／裝備）全部換成停用版本並凍結；S.startRun / finishRun / bootOfficial 停用
   6. 成績與排行榜一律使用 SDK 的 Mock（存在本測試命名空間的 sessionStorage）
   7. 返回大廳固定 https://vashyang1120.github.io/balloon-v-universe/
   ========================================================== */
(function () {
  "use strict";

  var TEST_VERSION = "v2.7.0-universe-foundation-test-1";
  var GAME_VERSION = "rhythm-" + TEST_VERSION;
  var NS = "vRhythmV270UniverseTest1::";
  var LOBBY_URL = "https://vashyang1120.github.io/balloon-v-universe/";
  var API_BASE = "https://balloon-v-universe-api.vashyang1120.workers.dev";
  var AV_BASE = "../../assets/avatars/base/";
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var MOCK_PLAYER = { playerId: "p_mockuitestplayer2222", displayId: "Mock 測試角色", baseAvatarKey: "boy1", displayAvatarKey: "boy1", createdAt: null };
  var U = window.BVUniverse;
  var L = U.LABELS;

  /* ---------- 測試命名空間 Storage（與 Web Storage 相同介面，所有 key 加前綴） ---------- */
  function nsStorage(kind) {
    var mem = {};
    function real() { try { return window[kind]; } catch (e) { return null; } }
    function ownKeys() {
      var s = real(), out = [];
      try { if (s) for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(NS) === 0) out.push(k.slice(NS.length)); } } catch (e) {}
      if (!s) out = Object.keys(mem);
      return out;
    }
    return {
      getItem: function (k) { var s = real(); try { if (s) return s.getItem(NS + k); } catch (e) {} return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { var s = real(); try { if (s) { s.setItem(NS + k, String(v)); return; } } catch (e) {} mem[k] = String(v); },
      removeItem: function (k) { var s = real(); try { if (s) s.removeItem(NS + k); } catch (e) {} delete mem[k]; },
      key: function (i) { return ownKeys()[i] || null; },
      get length() { return ownKeys().length; }
    };
  }
  var testLocal = nsStorage("localStorage");
  var testSession = nsStorage("sessionStorage");

  /* ---------- SDK 專用唯讀 fetch：只允許讀玩家公開資料與身份頭像清單 ---------- */
  var READ_ONLY_PATHS = [/^\/v1\/players\/p_[a-z2-7]{20}$/, /^\/v1\/avatars\/base$/];
  function readOnlyFetch(url, init) {
    var method = String((init && init.method) || "GET").toUpperCase();
    var path = "";
    if (String(url).indexOf(API_BASE + "/") === 0) path = String(url).slice(API_BASE.length).split("?")[0];
    var ok = method === "GET" && path && READ_ONLY_PATHS.some(function (re) { return re.test(path); });
    if (!ok) {
      console.warn("[TestIsolation] SDK 請求已封鎖：", method, url);
      return Promise.reject(new TypeError("Test isolation: blocked " + method + " " + url));
    }
    return window.fetch(url, init);
  }

  /* ---------- 入口模式 ---------- */
  var params = new URLSearchParams(location.search || "");
  var entry = params.has("bvPlayerId") ? "player" : (params.get("bvTestMock") === "1" ? "mock" : "chooser");

  var S = U.createGameSession({
    gameId: "rhythm",
    gameVersion: GAME_VERSION,
    avatarBaseUrl: AV_BASE,
    lobbyUrl: LOBBY_URL,
    mode: entry === "mock" ? "sandbox" : "production",
    // Mock：在 SDK 內以示範玩家 ID 交接；正式：只看真正網址的 bvPlayerId
    location: entry === "mock" ? { search: "?bvPlayerId=" + MOCK_PLAYER.playerId, href: location.href } : { search: entry === "player" ? location.search : "", href: location.href },
    allowLobbyFallback: false,
    localStorage: testLocal,
    sessionStorage: testSession,
    fetch: readOnlyFetch,
    mockPlayers: [MOCK_PLAYER],
    services: { scores: "mock", leaderboard: "mock" }
  });

  /* ---------- 停用所有正式寫入（在遊戲初始化前完成） ---------- */
  function disabled() { return Promise.reject(U.UniverseError("disabled", { userMessage: "測試版／資料隔離：不連線正式成績、排行榜、V幣與收藏" })); }
  var LOCKED_STATUS = Object.freeze({ scores: "test-isolated", rewards: "test-isolated", spending: "disabled" });
  ["init", "status", "isEnabled", "isTrial", "beginRun", "submitRun", "flushOutbox", "pendingCount", "catalog", "getBoard",
    "getWallet", "getCollection", "equip", "getQuizProgress"].forEach(function (k) { S.official[k] = disabled; });
  S.official.init = function () { return Promise.resolve(LOCKED_STATUS); };
  S.official.status = function () { return LOCKED_STATUS; };
  S.official.isEnabled = function () { return false; };
  S.official.isTrial = function () { return false; };
  S.official.beginRun = function () { return Promise.resolve({ official: false, reason: "testIsolated" }); };
  S.official.flushOutbox = function () { return Promise.resolve([]); };
  S.official.pendingCount = function () { return 0; };
  Object.freeze(S.official);
  S.bootOfficial = function () { return Promise.resolve(false); };
  S.startRun = function () { return Promise.resolve({ official: false, reason: "testIsolated" }); };
  S.finishRun = function () { return Promise.resolve({ official: false, reason: "testIsolated" }); };
  S.goLobby = function () { location.assign(LOBBY_URL); return LOBBY_URL; };
  S.lobbyUrl = function () { return LOBBY_URL; };

  var player = null;
  var labels = {};
  var round = { startedAt: null, submissionId: null };
  var readyCallbacks = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var FEATURE_TEXT = {
    wallet: "🧪 測試版／資料隔離：不讀取、不發放正式 V幣。",
    titles: "🧪 測試版／資料隔離：不讀取、不修改正式稱號收藏。",
    avatarUnlocks: "🧪 測試版／資料隔離：不讀取、不解鎖正式頭像收藏。",
    identity: "👤 玩家 ID 與身份頭像由遊戲宇宙管理。要切換玩家，請回到遊戲宇宙大廳。"
  };

  function goLobby() { location.assign(LOBBY_URL); }

  /* ---------- 頁面裝飾（沿用正式宇宙版，只把標示改為測試版／資料隔離） ---------- */
  function decorate() {
    document.body.classList.add("bv-universe", "bv-test-isolated");
    if (S.isSandbox) document.body.classList.add("bv-sandbox");

    var ver = $("game-version");
    if (ver) {
      var wrap = document.createElement("div");
      wrap.className = "bv-title-meta";
      var mark = U.ui.statusMark(S);
      if (mark) {
        mark.textContent = "🧪 測試版／資料隔離" + (entry === "mock" ? "｜Mock 測試角色" : "");
        mark.title = "成績只存在測試命名空間；不記入正式排行榜、不發 V幣、不修改正式玩家資料";
        wrap.appendChild(mark);
      }
      var chip = document.createElement("div");
      chip.className = "bv-player-chip";
      chip.id = "bv-player-chip";
      chip.hidden = true;
      chip.innerHTML = '<img id="bv-player-chip-av" src="' + BLANK + '" alt=""><span class="bv-player-name" id="bv-player-chip-name"></span>';
      wrap.appendChild(chip);
      var card = document.createElement("div");
      card.id = "bv-identity-card";
      card.className = "bv-identity-card";
      card.hidden = true;
      wrap.appendChild(card);
      ver.insertAdjacentElement("afterend", wrap);
    }

    var back = document.querySelector('#s-title button[onclick="history.back()"]');
    if (back) {
      back.removeAttribute("onclick");
      back.textContent = "🏠 回遊戲宇宙";
      back.id = "bv-btn-lobby";
      back.addEventListener("click", goLobby);
    }

    ["home", "songlist"].forEach(function (prefix) {
      var c = $(prefix + "-daily-challenge-hint");
      var reward = c && c.querySelector(".rhythm-daily-hint-reward");
      if (reward) reward.textContent = "完成任一首歌（測試版不發 V幣）";
    });

    var note = document.querySelector("#s-profile .profile-note");
    if (note) note.textContent = "玩家 ID 與身份頭像由遊戲宇宙統一管理，這裡只能查看。要切換玩家，請回到遊戲宇宙大廳。";
    var input = $("player-id-input");
    if (input) { input.readOnly = true; input.setAttribute("aria-readonly", "true"); input.maxLength = 40; }
    var actions = $("profile-action-bar");
    if (actions) {
      var lobbyBtn = document.createElement("button");
      lobbyBtn.type = "button";
      lobbyBtn.className = "btn btn-outline";
      lobbyBtn.id = "bv-profile-lobby";
      lobbyBtn.textContent = "🏠 回遊戲宇宙切換玩家";
      lobbyBtn.addEventListener("click", goLobby);
      actions.appendChild(lobbyBtn);
    }

    var rec = $("r-rec");
    if (rec) rec.insertAdjacentHTML("afterend", '<div id="bv-result-note" class="bv-note">' + esc("測試版／資料隔離：本場成績不會記入正式排行榜") + "</div>");
    var lbList = $("lb-list");
    if (lbList) lbList.insertAdjacentHTML("beforebegin", '<div id="bv-lb-note" class="bv-note">' + esc("Mock 排行榜：只含本測試版這個分頁的測試成績，不是正式排行榜") + "</div>");
  }

  function renderChip() {
    var chip = $("bv-player-chip");
    if (!chip) return;
    if (!player) { chip.hidden = true; return; }
    $("bv-player-chip-av").src = S.avatars.imageUrl(player.baseAvatarKey) || BLANK;
    $("bv-player-chip-name").textContent = player.displayId + (entry === "mock" ? "（Mock）" : "");
    chip.title = "玩家：" + player.displayId + (entry === "mock" ? "（純 UI 測試角色，不是正式玩家）" : "（遊戲宇宙玩家，唯讀）");
    chip.hidden = false;
  }

  function showIdentityState(kind, err) {
    var card = $("bv-identity-card");
    if (!card) return;
    if (kind === "ready") { card.hidden = true; card.innerHTML = ""; renderChip(); return; }
    renderChip();
    card.hidden = false;
    if (kind === "loading") {
      card.className = "bv-identity-card is-loading";
      card.textContent = "🎈 正在讀取遊戲宇宙玩家資料…";
      return;
    }
    card.className = "bv-identity-card is-error";
    card.innerHTML = '<div class="bv-identity-msg">⚠️ ' + esc(err && err.userMessage || "無法讀取玩家資料") + "</div>" +
      '<div class="bv-identity-actions">' +
      '<button type="button" class="bv-btn bv-btn-primary" id="bv-retry">🔄 重新讀取</button>' +
      '<button type="button" class="bv-btn bv-btn-outline" id="bv-go-lobby">🏠 返回 V宇宙大廳</button></div>';
    $("bv-retry").addEventListener("click", start);
    $("bv-go-lobby").addEventListener("click", goLobby);
  }

  /* ---------- 沒有 bvPlayerId：測試入口選擇畫面 ---------- */
  function showChooser() {
    var box = document.createElement("div");
    box.id = "bv-test-chooser";
    box.className = "bv-test-chooser";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = '<div class="bv-test-chooser__card">' +
      '<div class="bv-test-chooser__tag">🧪 測試版／資料隔離</div>' +
      "<h2>節奏遊戲 " + esc(TEST_VERSION) + "</h2>" +
      "<p>網址沒有遊戲宇宙玩家（bvPlayerId）。請選擇：</p>" +
      '<button type="button" class="bv-btn bv-btn-primary" id="bv-chooser-lobby">🏠 返回 V宇宙大廳</button>' +
      '<button type="button" class="bv-btn bv-btn-outline" id="bv-chooser-mock">🧸 使用純 UI 測試角色（Mock）</button>' +
      '<p class="bv-test-chooser__hint">Mock 角色不是正式玩家：不會建立玩家、不讀取上一位玩家、不送正式成績、不發 V幣、不改稱號或頭像。</p>' +
      "</div>";
    document.body.appendChild(box);
    $("bv-chooser-lobby").addEventListener("click", goLobby);
    $("bv-chooser-mock").addEventListener("click", function () {
      location.assign(location.pathname + "?bvTestMock=1");
    });
  }

  function loadLabels() {
    if (!window.fetch) return Promise.resolve();
    return fetch(AV_BASE + "manifest.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      (m && m.avatars || []).forEach(function (a) { labels[a.key] = a.label; });
    }).catch(function () {});
  }

  function start() {
    showIdentityState("loading");
    return S.start().then(function (p) {
      player = p;
      showIdentityState("ready");
      readyCallbacks.forEach(function (fn) { try { fn(); } catch (e) { console.warn("[UniverseTest] ready callback", e); } });
      return p;
    }, function (err) {
      player = null;
      showIdentityState("error", err);
      console.warn("[UniverseTest] 玩家讀取失敗：", err && err.kind, err && err.userMessage);
    });
  }

  S.onReset(function () { player = null; round.startedAt = null; round.submissionId = null; });

  function wrapInitGame() {
    var orig = window.initGame;
    if (typeof orig !== "function" || orig.__bvWrapped) return;
    var wrapped = function () {
      round.startedAt = new Date().toISOString();
      round.submissionId = null;
      return orig.apply(this, arguments);   // 測試版：不呼叫 S.startRun（不建立正式場次）
    };
    wrapped.__bvWrapped = true;
    window.initGame = wrapped;
  }

  function bestKey(songId) { return "best_" + songId; }

  window.UniverseRhythm = {
    session: S,
    gameVersion: GAME_VERSION,
    testVersion: TEST_VERSION,
    entryMode: entry,

    boot: function (onReady) {
      decorate();
      wrapInitGame();
      ["btn-start", "btn-retry"].forEach(function (id) { var el = $(id); if (el) el.onclick = window.initGame; });
      if (onReady) readyCallbacks.push(onReady);
      if (entry === "chooser") { showChooser(); return Promise.resolve(null); }
      loadLabels().then(function () { if (player && onReady) onReady(); });
      return start();
    },
    isReady: function () { return !!player; },
    getPlayer: function () { return player; },

    applyPlayerTo: function (P) {
      if (player) {
        P.playerId = player.playerId;
        P.id = player.displayId;
        P.baseAvatarKey = player.baseAvatarKey;
        P.displayAvatarKey = player.displayAvatarKey || player.baseAvatarKey;
        P.avatarKey = P.displayAvatarKey;
        P.avatarSrc = S.avatars.imageUrl(P.displayAvatarKey) || S.avatars.imageUrl(player.baseAvatarKey);
      } else {
        P.playerId = "";
        P.id = entry === "chooser" ? "未選擇玩家" : "讀取中…";
        P.baseAvatarKey = ""; P.displayAvatarKey = ""; P.avatarKey = "";
        P.avatarSrc = BLANK;
      }
      P.playerKey = "";
      return P;
    },

    isDisplayAvatarAllowed: function (key) { return !!key && !!player && (key === player.baseAvatarKey || key === player.displayAvatarKey); },
    avatarFor: function (key) {
      if (!key) return player ? null : { key: "", src: BLANK };
      var mine = player && (key === player.baseAvatarKey || key === player.displayAvatarKey);
      if (!mine && !labels[key] && !U.isDisplayAvatarKey(key)) return null;
      var url = S.avatars.imageUrl(key);
      return url ? { key: key, src: url, name: labels[key] || key } : null;
    },
    avatarLabel: function (key) { return labels[key] || ""; },

    notReady: function (feature) { U.ui.toast(FEATURE_TEXT[feature] || "測試版／資料隔離：這個功能不連線正式資料"); return true; },
    identityLocked: function () { U.ui.toast(FEATURE_TEXT.identity); return true; },
    adminDisabled: function () { return true; },
    explainNotReady: function () {
      if (entry === "chooser") { U.ui.toast("請先選擇：返回 V宇宙大廳，或使用純 UI 測試角色（Mock）"); return; }
      var st = S.getStatus();
      U.ui.toast(st.status === "error" && st.error ? st.error.userMessage : "正在讀取玩家資料，請稍候…");
    },
    walletText: function () { return "測試版不發放"; },
    titleText: function () { return entry === "mock" ? "Mock" : (player && player.title ? player.title.name : "未裝備"); },
    resultVcoinText: function () { return L.vcoinResult; },

    markDailyChallengeDone: function () { return S.dailyChallenge.markDone("rhythm_any_song"); },
    dailyChallengeStatus: function () {
      if (!player) return "need_profile";
      return S.dailyChallenge.isDoneToday("rhythm_any_song") ? "claimed" : "not_claimed";
    },
    dailyChallengeText: function (status) {
      if (status === "claimed") return "✅ 今日已完成（測試）";
      if (status === "not_claimed") return "今天還沒完成";
      if (status === "need_profile") return "請從遊戲宇宙大廳進入";
      return "狀態暫時無法確認";
    },

    /* 結算：只存測試成績（本機最佳＋SDK Mock 成績），不送正式成績 */
    recordSongResult: function (d) {
      var note = $("bv-result-note");
      if (!player) {
        if (note) note.textContent = "測試版／資料隔離：沒有玩家，本場未記錄";
        return false;
      }
      var prevRaw = S.playerStore.get(bestKey(d.songId));
      var prev = prevRaw == null ? null : Number(prevRaw);
      var isNew = prev === null || d.score > prev;
      if (isNew) S.playerStore.set(bestKey(d.songId), String(d.score));

      var now = new Date().toISOString();
      var sub;
      try {
        sub = S.newScoreSubmission({
          submissionId: round.submissionId || undefined,
          startedAt: round.startedAt || now,
          finishedAt: now,
          scoreData: { songId: d.songId, difficulty: d.difficulty, score: d.score, maxCombo: d.maxCombo,
            perfect: d.perfect, good: d.good, miss: d.miss, accuracy: d.accuracy, grade: d.grade }
        });
      } catch (e) {
        if (note) note.textContent = "測試版／資料隔離：本場未記錄";
        return isNew;
      }
      round.submissionId = sub.submissionId;
      S.services.scores.submit(sub).then(function () {
        if (note) note.textContent = "測試版／資料隔離：已存為測試成績（不會記入正式排行榜）";
      }, function (err) {
        if (note) note.textContent = "測試版／資料隔離：本場未記錄（" + (err && err.userMessage || "未知錯誤") + "）";
      });
      return isNew;
    },

    renderMockBoard: function (el, songId, lbMode, renderRows) {
      if (!el) return Promise.resolve();
      var q = { gameId: "rhythm", songId: songId, limit: 15 };
      if (lbMode && lbMode !== "all") q.difficulty = lbMode;
      return S.services.leaderboard.getBoard(q).then(function (board) {
        var titleOf = {};
        (window.SONGS || []).forEach(function (s) { titleOf[s.id] = s.title; });
        var rows = board.rows.map(function (r) {
          var prof = r.profile || {};
          var mine = player && r.playerId === player.playerId;
          return {
            playerKey: r.playerId,
            name: (prof.displayId || "玩家") + (mine ? " ⭐" : ""),
            displayAvatarKey: prof.displayAvatarKey || prof.baseAvatarKey || "",
            bestScore: r.score, score: r.score,
            diff: r.scoreData.difficulty, grade: r.scoreData.grade, acc: r.scoreData.accuracy,
            song: (titleOf[r.scoreData.songId] || r.scoreData.songId) + " · 測試",
            date: new Date(r.finishedAt).toLocaleDateString("zh-TW")
          };
        });
        renderRows(el, rows);
      }, function (err) {
        el.innerHTML = '<div style="text-align:center;padding:28px;">' + esc(err && err.userMessage || "排行榜暫時無法顯示") + "</div>";
      });
    },

    goLobby: goLobby
  };
})();

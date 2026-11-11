/* ==========================================================
   氣球小V方塊派對 — 遊戲宇宙換殼層（Universe Shell）
   universe-game-migration-v0.1.0-foundation-test-1

   原版遊戲（vparty-tetris v1.3.7）的玩家系統函式改成呼叫這裡：
     身份      → BVUniverse SDK 讀取 playerId 的公開資料（唯讀，網址 ?bvPlayerId=）
     V幣       → 尚未開放（共用 V幣帳本 API 尚未完成）
     稱號／頭像收藏 → 準備中（共用 API 尚未完成）
     成績／排行榜   → Mock（只存在目前分頁，畫面明確標示，不寫入正式排行榜）
     舊 Firebase    → 完全不載入、不讀、不寫
   遊戲玩法（方塊、旋轉、碰撞、計分、等級、速度、音效、音樂、手機操作、全螢幕）完全沒有修改。
   ========================================================== */
(function () {
  "use strict";

  var GAME_VERSION = "tetris-v1.3.7+universe-v0.1.0-test-1";
  var AV_BASE = "../../assets/avatars/base/";
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var U = window.BVUniverse;

  var S = U.createGameSession({
    gameId: "tetris",
    gameVersion: GAME_VERSION,
    avatarBaseUrl: AV_BASE,
    lobbyUrl: "../../index.html",
    services: { scores: "mock", leaderboard: "mock" }   // 正式成績 API 尚未完成 → 明確使用 Mock
  });

  var player = null;
  var labels = {};          // 身份圖案名稱（來自 assets/avatars/base/manifest.json）
  var game = { startedAt: null, submissionId: null };
  var readyCallbacks = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toastSafe(msg, ms) { if (typeof window.toast === "function") window.toast(msg, ms || 3200); }

  var FEATURE_TEXT = {
    wallet: "🪙 V幣錢包尚未開放：遊戲宇宙共用 V幣帳本完成後才會開放。",
    titles: "🎖 稱號收藏準備中：共用稱號 API 尚未開放。",
    avatarUnlocks: "🏆 頭像收藏準備中：共用頭像解鎖 API 尚未開放。",
    identity: "👤 玩家 ID 與身份頭像由遊戲宇宙管理。要切換玩家，請回到遊戲宇宙大廳。"
  };

  /* ---------- 頁面裝飾：測試版標示、唯讀角色設定 ---------- */
  function decorate() {
    document.body.classList.add("bv-universe");
    if (S.isSandbox) document.body.classList.add("bv-sandbox");

    var banner = document.createElement("div");
    banner.id = "bv-test-banner";
    banner.setAttribute("role", "status");
    var modeText = S.isSandbox ? "Sandbox／Test Mode" : "Test Mode";
    banner.innerHTML =
      '<span class="bv-long">🧪 遊戲宇宙換殼測試版｜' + modeText + "｜成績只存在這個分頁（Mock），不會寫入正式排行榜</span>" +
      '<span class="bv-short">🧪 換殼測試版｜' + modeText + "｜成績只存在這個分頁（Mock）</span>" +
      '<span class="bv-tiny">🧪 測試版｜Mock</span>';
    document.body.appendChild(banner);

    var ver = document.querySelector("#s-title .logo + div");
    if (ver) ver.insertAdjacentHTML("beforeend", ' <span class="bv-ver-tag">＋遊戲宇宙換殼 test-1</span>');

    var help = document.querySelector("#s-profile .profile-help");
    if (help) help.textContent = "角色設定：玩家 ID 與身份頭像由遊戲宇宙統一管理，這裡只能查看。要切換玩家，請回到遊戲宇宙大廳。";
    var note = document.querySelector("#s-profile .profile-save-note");
    if (note) note.innerHTML = '<button type="button" class="btn btn-outline btn-sm" id="bv-profile-lobby">🏠 回遊戲宇宙切換玩家</button>';
    var lb = $("bv-profile-lobby"); if (lb) lb.addEventListener("click", goLobby);

    var input = $("player-id-input");
    if (input) { input.readOnly = true; input.setAttribute("aria-readonly", "true"); input.maxLength = 40; }

    var resMsg = $("res-vcoin-msg");
    if (resMsg) resMsg.insertAdjacentHTML("afterend", '<div id="bv-result-note" class="bv-note">🧪 測試版：本場成績只記錄在這個分頁（Mock），不會寫入正式排行榜。</div>');

    var lbList = $("lb-list");
    if (lbList) lbList.insertAdjacentHTML("beforebegin", '<div id="bv-lb-note" class="bv-note">🧪 測試排行榜：只顯示這個分頁的 Mock 成績，不是正式排行榜。</div>');

    var mainMenu = document.querySelector('#s-title button[onclick*="balloonv.com"]');
    if (mainMenu) {
      mainMenu.removeAttribute("onclick");
      mainMenu.textContent = "🏠 回遊戲宇宙";
      mainMenu.id = "bv-btn-lobby";
      mainMenu.addEventListener("click", goLobby);
    }

    var card = document.createElement("div");
    card.id = "bv-identity-card";
    card.className = "bv-identity-card";
    card.hidden = true;
    var titleCard = document.querySelector("#s-title .title-card");
    if (titleCard) titleCard.insertAdjacentElement("afterbegin", card);
  }

  function showIdentityState(kind, err) {
    var card = $("bv-identity-card");
    if (!card) return;
    if (kind === "ready") { card.hidden = true; card.innerHTML = ""; return; }
    card.hidden = false;
    if (kind === "loading") {
      card.className = "bv-identity-card is-loading";
      card.innerHTML = "🎈 正在讀取遊戲宇宙玩家資料…";
      return;
    }
    card.className = "bv-identity-card is-error";
    card.innerHTML = '<div class="bv-identity-msg">⚠️ ' + esc(err && err.userMessage || "無法讀取玩家資料") + "</div>" +
      '<div class="bv-identity-actions">' +
      (err && err.retryable ? '<button type="button" class="btn btn-p btn-sm" id="bv-retry">🔄 再試一次</button>' : "") +
      '<button type="button" class="btn btn-outline btn-sm" id="bv-go-lobby">🏠 回遊戲宇宙大廳</button></div>';
    var r = $("bv-retry"); if (r) r.addEventListener("click", start);
    var g = $("bv-go-lobby"); if (g) g.addEventListener("click", goLobby);
  }

  function goLobby() { location.href = S.lobbyUrl(); }

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
      readyCallbacks.forEach(function (fn) { try { fn(); } catch (e) { console.warn("[Universe] ready callback", e); } });
      return p;
    }, function (err) {
      player = null;
      showIdentityState("error", err);
      console.warn("[Universe] 玩家讀取失敗：", err && err.kind, err && err.userMessage);
    });
  }

  /* 切換玩家（同一頁內）：清掉上一位的狀態。目前遊戲內不提供切換，切換請回大廳 */
  S.onReset(function () { player = null; game.startedAt = null; game.submissionId = null; });

  window.UniverseTetris = {
    session: S,
    gameVersion: GAME_VERSION,

    boot: function (onReady) {
      decorate();
      if (onReady) readyCallbacks.push(onReady);
      loadLabels().then(function () { if (player && onReady) onReady(); });
      return start();
    },
    isReady: function () { return !!player; },
    getPlayer: function () { return player; },

    /* 把遊戲宇宙玩家套用到原版遊戲的 PLAYER 物件（playerKey 一律留空，絕不由 ID＋圖案組合） */
    applyPlayerTo: function (P) {
      if (player) {
        P.playerId = player.playerId;
        P.id = player.displayId;
        P.name = player.displayId;
        P.baseAvatarKey = player.baseAvatarKey;
        P.displayAvatarKey = player.baseAvatarKey;     // 展示頭像解鎖尚未接入：先等於身份頭像
        P.avatarKey = player.baseAvatarKey;
        P.avKey = player.baseAvatarKey;
        P.avatarSrc = S.avatars.imageUrl(player.baseAvatarKey);
        P.avUrl = P.avatarSrc;
      } else {
        P.playerId = "";
        P.id = "讀取中…"; P.name = P.id;
        P.baseAvatarKey = ""; P.displayAvatarKey = ""; P.avatarKey = ""; P.avKey = "";
        P.avatarSrc = BLANK; P.avUrl = BLANK;
      }
      P.playerKey = "";
      return P;
    },

    /* 身份圖案：遊戲宇宙統一素材 assets/avatars/base/（不複製到遊戲資料夾） */
    avatarFor: function (key) {
      if (!key) return player ? null : { key: "", url: BLANK, src: BLANK, name: "" };
      var mine = player && (key === player.baseAvatarKey || key === player.displayAvatarKey);
      if (!mine && !labels[key]) return null;
      var url = S.avatars.imageUrl(key);
      if (!url) return null;
      return { key: key, url: url, src: url, name: labels[key] || key };
    },
    avatarLabel: function (key) { return labels[key] || ""; },

    /* 尚未開放的功能：顯示提示並回傳 true（呼叫端就此停止） */
    notReady: function (feature) { toastSafe(FEATURE_TEXT[feature] || "這個功能準備中"); return true; },
    identityLocked: function () { toastSafe(FEATURE_TEXT.identity); return true; },
    adminDisabled: function () { return true; },   // 測試版停用舊管理後台（不顯示、不寫入）
    explainNotReady: function () {
      var st = S.getStatus();
      toastSafe(st.status === "error" && st.error ? st.error.userMessage : "正在讀取玩家資料，請稍候…");
    },
    walletText: function () { return "未開放"; },
    titleText: function () { return "準備中"; },
    resultVcoinText: function () { return "🪙 V幣：測試版尚未開放，本場不發放 V幣。"; },
    renderNotReadyPanel: function (feature, summaryEl, listEl) {
      if (summaryEl) summaryEl.textContent = feature === "wallet" ? "V幣：未開放" : "準備中";
      if (listEl) listEl.innerHTML = '<div class="vcoin-empty-msg bv-not-ready">' + esc(FEATURE_TEXT[feature] || "準備中") + "</div>";
    },

    /* 本機最佳分數：依 playerId 分開存放（不同玩家不共用；不是正式紀錄） */
    getLocalBest: function () { return parseInt(S.playerStore.get("localBest") || "0", 10) || 0; },
    setLocalBest: function (n) { S.playerStore.set("localBest", String(n)); },

    /* 每一場開局時固定 submissionId，結算時用來防止重複提交 */
    wrapStartGame: function () {
      var orig = window.startGame;
      if (typeof orig !== "function" || orig.__bvWrapped) return;
      var wrapped = function () {
        game.startedAt = new Date().toISOString();
        game.submissionId = null;
        return orig.apply(this, arguments);
      };
      wrapped.__bvWrapped = true;
      window.startGame = wrapped;
    },

    submitScore: function (d) {
      var note = $("bv-result-note");
      if (!player) {
        if (note) note.textContent = "🧪 測試版：沒有遊戲宇宙玩家，本場成績未記錄。";
        return Promise.resolve(null);
      }
      var now = new Date().toISOString();
      var sub = S.newScoreSubmission({
        submissionId: game.submissionId || undefined,
        startedAt: game.startedAt || now,
        finishedAt: now,
        scoreData: { score: d.score, level: d.level, lines: d.lines, difficulty: d.difficulty, peakCombo: d.peakCombo }
      });
      game.submissionId = sub.submissionId;
      return S.services.scores.submit(sub).then(function (r) {
        if (note) note.textContent = "🧪 測試版：本場成績已記錄在這個分頁的 Mock 排行榜（未經伺服器確認），不會寫入正式排行榜。";
        return r;
      }, function (err) {
        if (note) note.textContent = "🧪 測試版：本場成績未記錄（" + (err && err.userMessage || "未知錯誤") + "）。";
        console.warn("[Universe] Mock 成績提交失敗：", err && err.userMessage);
        return null;
      });
    },

    renderMockLeaderboard: function (listEl, avatarUrlOf) {
      if (!listEl) return Promise.resolve();
      listEl.innerHTML = '<div class="lb-msg">🎈 載入中...</div>';
      return S.services.leaderboard.getBoard({ gameId: "tetris", limit: 30 }).then(function (board) {
        if (!board.rows.length) { listEl.innerHTML = '<div class="lb-msg">這個分頁還沒有測試成績！玩一場試試看🎈</div>'; return; }
        listEl.innerHTML = "";
        var dLabel = { easy: "輕鬆", normal: "普通", hard: "挑戰" };
        board.rows.forEach(function (r, i) {
          var prof = r.profile || {};
          var key = prof.displayAvatarKey || prof.baseAvatarKey || "";
          var mine = player && r.playerId === player.playerId;
          var rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1);
          var row = document.createElement("div");
          row.className = "lb-row " + (i < 1 ? "r1" : i < 2 ? "r2" : i < 3 ? "r3" : "") + (mine ? " mine" : "");
          row.innerHTML = '<div class="lb-rank">' + rank + '</div><div class="lb-av"><img src="' + esc(avatarUrlOf ? avatarUrlOf(key) : S.avatars.imageUrl(key)) + '" alt=""></div>' +
            '<div class="lb-info"><div class="lb-name">' + esc(prof.displayId || r.playerId) + (mine ? " ⭐" : "") + '</div>' +
            '<div class="lb-meta">LV' + esc(r.scoreData.level) + " · " + esc(r.scoreData.lines) + "行 · " + esc(dLabel[r.scoreData.difficulty] || "") + ' · <span class="bv-mock-tag">Mock</span></div></div>' +
            '<div class="lb-score">' + Number(r.score || 0).toLocaleString() + "</div>";
          listEl.appendChild(row);
        });
      }, function (err) {
        listEl.innerHTML = '<div class="lb-msg">' + esc(err && err.userMessage || "排行榜暫時無法顯示") + "</div>";
      });
    },

    goLobby: goLobby
  };
})();

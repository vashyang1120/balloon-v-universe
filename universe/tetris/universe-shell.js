/* ==========================================================
   氣球小V方塊派對 — 遊戲宇宙換殼層（Universe Shell）
   universe-game-migration-v0.1.0-foundation-test-1

   原版遊戲（vparty-tetris v1.3.7）的玩家系統函式改成呼叫這裡：
     身份      → BVUniverse SDK 讀取 playerId 的公開資料（唯讀，網址 ?bvPlayerId=）
     V幣       → 尚未開放（共用 V幣帳本 API 尚未完成）
     稱號／頭像收藏 → 準備中（共用 API 尚未完成）
     成績／排行榜   → v0.3.0：後端正式成績開啟時 → 開局取得場次、結算送出、伺服器判定後入榜／發 V幣；
                      未開啟或沙盒 → Mock（只存在目前分頁，畫面明確標示，不寫入正式排行榜）
     舊 Firebase    → 完全不載入、不讀、不寫
   遊戲玩法（方塊、旋轉、碰撞、計分、等級、速度、音效、音樂、手機操作、全螢幕）完全沒有修改。
   ========================================================== */
(function () {
  "use strict";

  var GAME_VERSION = "tetris-v1.3.7+universe-v0.3.1-test-1";
  var AV_BASE = "../../assets/avatars/base/";
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var U = window.BVUniverse;
  var L = U.LABELS;

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
  var wallet = null;        // 正式 V幣（後端回傳；只讀）
  var lastOfficial = null;  // 最近一場的伺服器判定

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

    // v0.2.0：不再使用常駐橫幅；首頁只放一個簡潔的狀態標示（遊戲中不顯示）
    var ver = document.querySelector("#s-title .logo + div");
    if (ver) ver.insertAdjacentElement("afterend", U.ui.statusMark(S));

    var help = document.querySelector("#s-profile .profile-help");
    if (help) help.textContent = "角色設定：玩家 ID 與身份頭像由遊戲宇宙統一管理，這裡只能查看。要切換玩家，請回到遊戲宇宙大廳。";
    var note = document.querySelector("#s-profile .profile-save-note");
    if (note) note.innerHTML = '<button type="button" class="btn btn-outline btn-sm" id="bv-profile-lobby">🏠 回遊戲宇宙切換玩家</button>';
    var lb = $("bv-profile-lobby"); if (lb) lb.addEventListener("click", goLobby);

    var input = $("player-id-input");
    if (input) { input.readOnly = true; input.setAttribute("aria-readonly", "true"); input.maxLength = 40; }

    var resMsg = $("res-vcoin-msg");
    if (resMsg) resMsg.insertAdjacentHTML("afterend", '<div id="bv-result-note" class="bv-note">' + esc(L.resultNote) + '</div>');

    var lbList = $("lb-list");
    if (lbList) lbList.insertAdjacentHTML("beforebegin", '<div id="bv-lb-note" class="bv-note">' + esc(L.boardNote) + '</div>');

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

  function goLobby() { S.goLobby(); }

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
      initOfficial();
      readyCallbacks.forEach(function (fn) { try { fn(); } catch (e) { console.warn("[Universe] ready callback", e); } });
      return p;
    }, function (err) {
      player = null;
      showIdentityState("error", err);
      console.warn("[Universe] 玩家讀取失敗：", err && err.kind, err && err.userMessage);
    });
  }

  /* 切換玩家（同一頁內）：清掉上一位的狀態。目前遊戲內不提供切換，切換請回大廳 */
  S.onReset(function () { player = null; wallet = null; game.startedAt = null; game.submissionId = null; });


  /* ---------- v0.3.0 正式成績／V幣 ---------- */
  function officialOn() { return S.official.isEnabled(); }
  function applyOfficialMode() {
    if (!officialOn()) return;
    document.body.classList.add("bv-official");
    var mark = $("bv-status-mark");
    if (mark) { mark.textContent = "🎈 遊戲宇宙｜正式成績"; mark.title = "成績由伺服器確認後記入正式排行榜；V幣由伺服器發放"; }
    var n1 = $("bv-result-note"); if (n1) n1.textContent = "結算後成績會送到遊戲宇宙伺服器確認";
    var n2 = $("bv-lb-note"); if (n2) n2.textContent = "遊戲宇宙正式排行榜（每位玩家只列個人最佳）";
  }
  function refreshWallet() {
    if (!officialOn() || !player) return Promise.resolve(null);
    return S.official.getWallet().then(function (w) {
      wallet = w;
      if (typeof window.updateTopPlayerCard === "function") { try { window.updateTopPlayerCard(); } catch (e) {} }
      return w;
    }, function () { return null; });
  }
  function initOfficial() {
    return S.official.init().then(function () {
      applyOfficialMode();
      if (!officialOn()) return;
      return S.official.flushOutbox().then(function (sent) {
        if (sent && sent.length) toastSafe("📮 已補送上次沒送出的 " + sent.length + " 筆成績");
        return refreshWallet();
      });
    });
  }
  function setVcoinMsg(text, type) {
    if (typeof window.setResultVCoinMessage === "function") { try { window.setResultVCoinMessage(text, type); return; } catch (e) {} }
    var el = $("res-vcoin-msg"); if (el) el.textContent = text;
  }
  function officialRowsHtml(board, avatarUrlOf, metaOf) {
    return board.rows.map(function (r, i) {
      var mine = player && r.playerId === player.playerId;
      var rank = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : String(r.rank);
      return '<div class="lb-row ' + (r.rank === 1 ? "r1" : r.rank === 2 ? "r2" : r.rank === 3 ? "r3" : "") + (mine ? " mine" : "") + '">' +
        '<div class="lb-rank">' + rank + '</div><div class="lb-av"><img src="' + esc(avatarUrlOf ? avatarUrlOf(r.displayAvatarKey) : S.avatars.imageUrl(r.displayAvatarKey)) + '" alt=""></div>' +
        '<div class="lb-info"><div class="lb-name">' + esc(r.displayId || "") + (mine ? " ⭐" : "") + '</div><div class="lb-meta">' + esc(metaOf(r)) + '</div></div>' +
        '<div class="lb-score">' + Number(r.score || 0).toLocaleString() + "</div></div>";
    }).join("");
  }

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
        P.displayAvatarKey = player.displayAvatarKey || player.baseAvatarKey;   // v0.3.1：遊戲宇宙共用收藏目前裝備的展示頭像（baseAvatarKey 不變）
        P.avatarKey = P.displayAvatarKey;
        P.avKey = P.displayAvatarKey;
        P.avatarSrc = S.avatars.imageUrl(P.displayAvatarKey) || S.avatars.imageUrl(player.baseAvatarKey);
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
    /* v0.3.1：展示頭像只能是身份頭像，或伺服器回傳的目前裝備展示頭像 */
    isDisplayAvatarAllowed: function (key) { return !!key && !!player && (key === player.baseAvatarKey || key === player.displayAvatarKey); },
    avatarFor: function (key) {
      if (!key) return player ? null : { key: "", url: BLANK, src: BLANK, name: "" };
      var mine = player && (key === player.baseAvatarKey || key === player.displayAvatarKey);
      if (!mine && !labels[key] && !U.isDisplayAvatarKey(key)) return null;
      var url = S.avatars.imageUrl(key);
      if (!url) return null;
      return { key: key, url: url, src: url, name: labels[key] || key };
    },
    avatarLabel: function (key) { return labels[key] || ""; },

    /* 尚未開放的功能：顯示提示並回傳 true（呼叫端就此停止） */
    notReady: function (feature) {
      // v0.3.1：稱號／頭像收藏 → 遊戲宇宙共用收藏視窗（只讀；更換在大廳通行證）
      if ((feature === "titles" || feature === "avatarUnlocks") && !S.isSandbox && player) { U.ui.showCollection(S); return true; } toastSafe(FEATURE_TEXT[feature] || "這個功能準備中"); return true; },
    identityLocked: function () { toastSafe(FEATURE_TEXT.identity); return true; },
    adminDisabled: function () { return true; },   // 測試版停用舊管理後台（不顯示、不寫入）
    explainNotReady: function () {
      var st = S.getStatus();
      toastSafe(st.status === "error" && st.error ? st.error.userMessage : "正在讀取玩家資料，請稍候…");
    },
    walletText: function () { return officialOn() && wallet ? Number(wallet.balance || 0).toLocaleString() + " V幣" : (officialOn() ? "讀取中" : "未開放"); },
    titleText: function () { return S.isSandbox ? "準備中" : (player && player.title ? player.title.name : "未裝備"); },
    /* 結算 V幣說明：不發放；今日挑戰照原版判定是否完成，+10 待開放 */
    resultVcoinText: function (ch) {
      if (officialOn()) return lastOfficial ? S.describeOfficialResult(lastOfficial) : "🪙 V幣：成績送出中，等待伺服器確認…";
      var t = L.vcoinResult;
      if (ch && ch.challenge) t += "｜今日挑戰「" + (ch.challenge.name || "今日任務") + "」" + (ch.status === "pending_completed" ? "已完成（" + L.dailyRewardPending + "）" : "尚未完成");
      return t;
    },
    markDailyChallengeDone: function (challenge) { return S.dailyChallenge.markDone("tetris_" + (challenge && challenge.challengeKey || "daily")); },
    renderNotReadyPanel: function (feature, summaryEl, listEl) {
      if (feature === "wallet" && officialOn()) {
        if (summaryEl) summaryEl.textContent = "V幣：讀取中…";
        if (listEl) listEl.innerHTML = "";
        return refreshWallet().then(function (w) {
          if (!w) { if (summaryEl) summaryEl.textContent = "V幣：暫時無法讀取，請稍後再試"; return; }
          if (summaryEl) summaryEl.textContent = "V幣：" + Number(w.balance || 0).toLocaleString() + "（消費功能尚未開放）";
          if (listEl) listEl.innerHTML = w.recent.length ? w.recent.map(function (t) {
            return '<div class="vcoin-log-row"><span>' + esc(t.dateKey) + " " + esc(t.type === "daily_play" ? "每日遊玩" : "今日挑戰") + "（" + esc({ tetris: "方塊", rhythm: "節奏", quiz: "問答", adventure: "派對島" }[t.gameId] || t.gameId) + '）</span><b>+' + Number(t.amount) + "</b></div>";
          }).join("") : '<div class="vcoin-empty-msg">還沒有 V幣紀錄，玩一場就能領每日 +30！</div>';
        });
      }
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
        lastOfficial = null;
        if (player) S.startRun();   // 正式成績開啟時向伺服器取得場次（沒開啟／沙盒不會寫入任何資料）
        return orig.apply(this, arguments);
      };
      wrapped.__bvWrapped = true;
      window.startGame = wrapped;
    },

    submitScore: function (d) {
      var note = $("bv-result-note");
      if (!player) {
        if (note) note.textContent = L.resultNote + "（沒有遊戲宇宙玩家，本場未記錄）";
        return Promise.resolve(null);
      }
      var scoreData = { score: d.score, level: d.level, lines: d.lines, difficulty: d.difficulty, peakCombo: d.peakCombo };
      if (officialOn()) {
        if (note) note.textContent = "📮 正在把成績送到遊戲宇宙伺服器…";
        return S.finishRun(scoreData).then(function (out) {
          if (out.official && out.result) {
            lastOfficial = out.result;
            if (note) note.textContent = S.describeOfficialResult(out.result);
            setVcoinMsg(S.describeOfficialResult(out.result), out.result.status === "accepted" ? "success" : "already");
            refreshWallet();
          } else if (out.queued) {
            if (note) note.textContent = "📶 網路不穩，成績已暫存，下次進入遊戲會自動補送";
          } else {
            if (note) note.textContent = "本場成績沒有記入正式排行榜（" + ((out.error && out.error.userMessage) || "沒有取得正式場次") + "）";
          }
          return out;
        });
      }
      S.finishRun(null);   // 未開啟正式成績：丟棄（不會送出）
      var now = new Date().toISOString();
      var sub = S.newScoreSubmission({
        submissionId: game.submissionId || undefined,
        startedAt: game.startedAt || now,
        finishedAt: now,
        scoreData: scoreData
      });
      game.submissionId = sub.submissionId;
      return S.services.scores.submit(sub).then(function (r) {
        if (note) note.textContent = L.resultNote + "（已存為本分頁測試成績）";
        return r;
      }, function (err) {
        if (note) note.textContent = L.resultNote + "（本場未記錄：" + (err && err.userMessage || "未知錯誤") + "）";
        console.warn("[Universe] Mock 成績提交失敗：", err && err.userMessage);
        return null;
      });
    },

    renderMockLeaderboard: function (listEl, avatarUrlOf) {
      if (!listEl) return Promise.resolve();
      listEl.innerHTML = '<div class="lb-msg">🎈 載入中...</div>';
      if (officialOn()) {
        var dl = { easy: "輕鬆", normal: "普通", hard: "挑戰" };
        var load = function () {
          listEl.innerHTML = '<div class="lb-msg">🎈 載入中...</div>';
          return S.official.getBoard("total", { limit: 50 }).then(function (board) {
            if (!board.rows.length) { listEl.innerHTML = '<div class="lb-msg">正式排行榜還沒有成績，成為第一名吧！🎈</div>'; return; }
            listEl.innerHTML = officialRowsHtml(board, avatarUrlOf, function (r) { var x = r.extra || {}; return (r.titleName ? "🎖" + r.titleName + " · " : "") + "LV" + (x.level || "-") + " · " + (x.lines || 0) + "行 · " + (dl[x.difficulty] || ""); }) +
              (board.me && board.me.rank > board.rows.length ? '<div class="lb-msg">我的名次：第 ' + board.me.rank + " 名（" + Number(board.me.score).toLocaleString() + "）</div>" : "");
          }, function (err) {
            listEl.innerHTML = '<div class="lb-msg">⚠️ ' + esc(err && err.userMessage || "排行榜暫時無法顯示") + ' <button type="button" class="btn btn-outline btn-sm" id="bv-lb-retry">🔄 再試一次</button></div>';
            var b = $("bv-lb-retry"); if (b) b.addEventListener("click", load);
          });
        };
        return load();
      }
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
            '<div class="lb-meta">LV' + esc(r.scoreData.level) + " · " + esc(r.scoreData.lines) + "行 · " + esc(dLabel[r.scoreData.difficulty] || "") + ' · <span class="bv-mock-tag">' + esc(L.mockTag) + '</span></div></div>' +
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

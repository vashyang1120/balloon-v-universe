/* ==========================================================
   氣球小V節奏遊戲 — 遊戲宇宙換殼層（Universe Shell）
   universe-game-migration-v0.2.0-three-games-integration-test-1

   本次只替換玩家資料層。原版（vparty-rhythm-game v2.6.4）的玩家系統函式改成呼叫這裡：
     身份      → BVUniverse SDK 讀取 playerId 的公開資料（唯讀，網址 ?bvPlayerId=）
     V幣       → 未開放（不發放、不寫入）；今日挑戰保留「完成任一首歌」判定，+10 待開放
     稱號／頭像收藏 → 準備中（共用 API 尚未完成）
     成績／排行榜   → v0.3.0：後端正式成績開啟時 → 開局取得場次、結算送出、伺服器判定（每首歌×每個難度一個排行榜）；
                      未開啟或沙盒 → Mock（只存在目前分頁，依 playerId 分開，畫面標示「尚未記入正式排行榜」）
     舊 Firebase    → 完全不載入、不讀、不寫
   音符判定、速度、Hit Window、Perfect/Good/Miss、Hold、計分、Combo、歌曲、Beatmap、字幕、音訊、
   YouTube、難度、手機操作、結算流程、音樂編輯器：完全沒有修改。
   ========================================================== */
(function () {
  "use strict";

  var GAME_VERSION = "rhythm-v2.6.4+universe-v0.3.1-test-1";
  var AV_BASE = "../../assets/avatars/base/";
  var BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var U = window.BVUniverse;
  var L = U.LABELS;

  var S = U.createGameSession({
    gameId: "rhythm",
    gameVersion: GAME_VERSION,
    avatarBaseUrl: AV_BASE,
    lobbyUrl: "../../index.html",
    services: { scores: "mock", leaderboard: "mock" }   // 正式成績 API 尚未完成 → 明確使用 Mock
  });

  var player = null;
  var labels = {};
  var round = { startedAt: null, submissionId: null };
  var readyCallbacks = [];
  var wallet = null, lastOfficial = null;
  function officialOn() { return S.official.isEnabled(); }
  function onWallet(w) {
    wallet = w;
    if (typeof window.refreshProfileMetaInfo === "function") { try { window.refreshProfileMetaInfo(); } catch (e) {} }
  }
  function refreshWallet() { if (officialOn() && player) S.official.getWallet().then(onWallet, function () {}); }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var FEATURE_TEXT = {
    wallet: "🪙 V幣錢包尚未開放：遊戲宇宙共用 V幣帳本完成後才會開放。",
    titles: "🏷️ 稱號收藏準備中：共用稱號 API 尚未開放。",
    avatarUnlocks: "🏆 頭像收藏準備中：共用頭像解鎖 API 尚未開放。",
    identity: "👤 玩家 ID 與身份頭像由遊戲宇宙管理。要切換玩家，請回到遊戲宇宙大廳。"
  };

  function goLobby() { S.goLobby(); }

  /* ---------- 頁面裝飾：首頁一個狀態標示＋玩家小卡；角色設定唯讀；結算一行說明 ---------- */
  function decorate() {
    document.body.classList.add("bv-universe");
    if (S.isSandbox) document.body.classList.add("bv-sandbox");

    var ver = $("game-version");
    if (ver) {
      var wrap = document.createElement("div");
      wrap.className = "bv-title-meta";
      wrap.appendChild(U.ui.statusMark(S));
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

    // 「← 回到遊戲選單」（原版 history.back）→ 回遊戲宇宙大廳
    var back = document.querySelector('#s-title button[onclick="history.back()"]');
    if (back) {
      back.removeAttribute("onclick");
      back.textContent = "🏠 回遊戲宇宙";
      back.id = "bv-btn-lobby";
      back.addEventListener("click", goLobby);
    }

    // 今日挑戰卡：保留，只把獎勵說明改成「待開放」
    ["home", "songlist"].forEach(function (prefix) {
      var card = $(prefix + "-daily-challenge-hint");
      var reward = card && card.querySelector(".rhythm-daily-hint-reward");
      if (reward) reward.textContent = "完成任一首歌（" + L.dailyRewardPending + "）";
    });

    // 角色設定：唯讀
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

    // 結算：一行資料狀態說明
    var rec = $("r-rec");
    if (rec) rec.insertAdjacentHTML("afterend", '<div id="bv-result-note" class="bv-note">' + esc(L.resultNote) + "</div>");
    // 排行榜：一行說明
    var lbList = $("lb-list");
    if (lbList) lbList.insertAdjacentHTML("beforebegin", '<div id="bv-lb-note" class="bv-note">' + esc(L.boardNote) + "</div>");
  }

  function renderChip() {
    var chip = $("bv-player-chip");
    if (!chip) return;
    if (!player) { chip.hidden = true; return; }
    $("bv-player-chip-av").src = S.avatars.imageUrl(player.baseAvatarKey) || BLANK;
    $("bv-player-chip-name").textContent = player.displayId;
    chip.title = "玩家：" + player.displayId + "（由遊戲宇宙大廳選擇）";
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
      (err && err.retryable ? '<button type="button" class="bv-btn bv-btn-primary" id="bv-retry">🔄 再試一次</button>' : "") +
      '<button type="button" class="bv-btn bv-btn-outline" id="bv-go-lobby">🏠 回遊戲宇宙大廳</button></div>';
    var r = $("bv-retry"); if (r) r.addEventListener("click", start);
    var g = $("bv-go-lobby"); if (g) g.addEventListener("click", goLobby);
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
      S.bootOfficial({ onWallet: onWallet });
      readyCallbacks.forEach(function (fn) { try { fn(); } catch (e) { console.warn("[Universe] ready callback", e); } });
      return p;
    }, function (err) {
      player = null;
      showIdentityState("error", err);
      console.warn("[Universe] 玩家讀取失敗：", err && err.kind, err && err.userMessage);
    });
  }

  S.onReset(function () { player = null; wallet = null; round.startedAt = null; round.submissionId = null; });

  /* 每一場開局時固定 submissionId（再玩一次＝新的一場），結算時用來防止重複提交 */
  function wrapInitGame() {
    var orig = window.initGame;
    if (typeof orig !== "function" || orig.__bvWrapped) return;
    var wrapped = function () {
      round.startedAt = new Date().toISOString();
      round.submissionId = null;
      lastOfficial = null;
      if (player) S.startRun();   // 正式成績開啟時向伺服器取得場次（沒開啟／沙盒不會寫入任何資料）
      return orig.apply(this, arguments);
    };
    wrapped.__bvWrapped = true;
    window.initGame = wrapped;
  }

  function bestKey(songId) { return "best_" + songId; }


  /* 正式排行榜：每首歌×每個難度一個榜。「全部」頁籤分成三個難度各列前 5 名（不把不同難度混在同一個名次裡） */
  var DIFF_NAME = { easy: "EASY", normal: "NORMAL", hard: "HARD" };
  function toRows(board, songTitle) {
    return board.rows.map(function (r) {
      var mine = player && r.playerId === player.playerId;
      var x = r.extra || {};
      return { playerKey: r.playerId, name: (r.displayId || "玩家") + (mine ? " ⭐" : ""), displayAvatarKey: r.displayAvatarKey || "", equippedTitleName: r.titleName || "",
        bestScore: r.score, score: r.score, diff: x.difficulty, grade: x.grade, acc: x.accuracy, song: songTitle,
        date: r.achievedAt ? new Date(r.achievedAt).toLocaleDateString("zh-TW") : "" };
    });
  }
  function renderOfficialBoard(el, songId, lbMode, renderRows) {
    var titleOf = {};
    (window.SONGS || []).forEach(function (s) { titleOf[s.id] = s.title; });
    var title = titleOf[songId] || songId;
    var diffs = lbMode && lbMode !== "all" ? [lbMode] : ["easy", "normal", "hard"];
    el.innerHTML = '<div style="text-align:center;padding:28px;">🎈 載入中…</div>';
    return Promise.all(diffs.map(function (d) { return S.official.getBoard(songId + "--" + d, { limit: diffs.length > 1 ? 5 : 15 }); })).then(function (boards) {
      if (diffs.length === 1) {
        renderRows(el, toRows(boards[0], title));
        var me = boards[0].me;
        if (me && me.rank > boards[0].rows.length) el.insertAdjacentHTML("beforeend", '<div class="bv-note">我的名次：第 ' + me.rank + " 名（" + Number(me.score).toLocaleString() + "）</div>");
        return;
      }
      el.innerHTML = "";
      boards.forEach(function (b, i) {
        var h = document.createElement("div"); h.className = "bv-note"; h.textContent = DIFF_NAME[diffs[i]] + " 排行榜";
        var box = document.createElement("div");
        el.appendChild(h); el.appendChild(box);
        renderRows(box, toRows(b, title));
      });
    }, function (err) {
      el.innerHTML = '<div style="text-align:center;padding:28px;">⚠️ ' + esc(err && err.userMessage || "排行榜暫時無法顯示") + ' <button type="button" class="bv-btn bv-btn-outline" id="bv-lb-retry">🔄 再試一次</button></div>';
      var b = document.getElementById("bv-lb-retry"); if (b) b.addEventListener("click", function () { renderOfficialBoard(el, songId, lbMode, renderRows); });
    });
  }

  window.UniverseRhythm = {
    session: S,
    gameVersion: GAME_VERSION,

    boot: function (onReady) {
      decorate();
      wrapInitGame();
      // 原版在載入時就把按鈕綁到 initGame；這裡改綁到包裝後的版本（行為完全相同，只多記錄開局時間）
      ["btn-start", "btn-retry"].forEach(function (id) { var el = $(id); if (el) el.onclick = window.initGame; });
      if (onReady) readyCallbacks.push(onReady);
      loadLabels().then(function () { if (player && onReady) onReady(); });
      return start();
    },
    isReady: function () { return !!player; },
    getPlayer: function () { return player; },

    /* 把遊戲宇宙玩家套用到原版的 PLAYER（playerKey 一律留空，絕不由 ID＋圖案組合） */
    applyPlayerTo: function (P) {
      if (player) {
        P.playerId = player.playerId;
        P.id = player.displayId;
        P.baseAvatarKey = player.baseAvatarKey;
        P.displayAvatarKey = player.displayAvatarKey || player.baseAvatarKey;   // v0.3.1：遊戲宇宙共用收藏目前裝備的展示頭像（baseAvatarKey 不變）
        P.avatarKey = P.displayAvatarKey;
        P.avatarSrc = S.avatars.imageUrl(P.displayAvatarKey) || S.avatars.imageUrl(player.baseAvatarKey);
      } else {
        P.playerId = "";
        P.id = "讀取中…";
        P.baseAvatarKey = ""; P.displayAvatarKey = ""; P.avatarKey = "";
        P.avatarSrc = BLANK;
      }
      P.playerKey = "";
      return P;
    },

    /* 身份圖案：遊戲宇宙統一素材 assets/avatars/base/ */
    /* v0.3.1：展示頭像只能是身份頭像，或伺服器回傳的目前裝備展示頭像 */
    isDisplayAvatarAllowed: function (key) { return !!key && !!player && (key === player.baseAvatarKey || key === player.displayAvatarKey); },
    avatarFor: function (key) {
      if (!key) return player ? null : { key: "", src: BLANK };
      var mine = player && (key === player.baseAvatarKey || key === player.displayAvatarKey);
      if (!mine && !labels[key] && !U.isDisplayAvatarKey(key)) return null;
      var url = S.avatars.imageUrl(key);
      return url ? { key: key, src: url, name: labels[key] || key } : null;
    },
    avatarLabel: function (key) { return labels[key] || ""; },

    notReady: function (feature) {
      // v0.3.1：稱號／頭像收藏 → 遊戲宇宙共用收藏視窗（只讀；更換在大廳通行證）
      if ((feature === "titles" || feature === "avatarUnlocks") && !S.isSandbox && player) { U.ui.showCollection(S); return true; }
      if (feature === "wallet" && officialOn()) {
        U.ui.toast(wallet ? "🪙 V幣餘額：" + Number(wallet.balance || 0).toLocaleString() + "（V幣紀錄請到遊戲宇宙大廳「我的通行證」查看；消費尚未開放）" : "🪙 V幣讀取中…");
        refreshWallet();
        return true;
      }
      U.ui.toast(FEATURE_TEXT[feature] || "這個功能準備中"); return true;
    },
    identityLocked: function () { U.ui.toast(FEATURE_TEXT.identity); return true; },
    adminDisabled: function () { return true; },   // 宇宙版停用舊管理後台（不顯示、不寫入）
    explainNotReady: function () {
      var st = S.getStatus();
      U.ui.toast(st.status === "error" && st.error ? st.error.userMessage : "正在讀取玩家資料，請稍候…");
    },
    walletText: function () { return officialOn() && wallet ? Number(wallet.balance || 0).toLocaleString() : (officialOn() ? "讀取中" : L.vcoinClosed); },
    titleText: function () { return S.isSandbox ? "準備中" : (player && player.title ? player.title.name : "未裝備"); },
    resultVcoinText: function () {
      if (officialOn()) return lastOfficial ? S.describeOfficialResult(lastOfficial) : "🪙 V幣：成績送出中，等待伺服器確認…";
      return L.vcoinResult;
    },

    /* 今日挑戰「完成任一首歌」：完成判定保留，只記錄完成，不發 +10 */
    markDailyChallengeDone: function () { return S.dailyChallenge.markDone("rhythm_any_song"); },
    dailyChallengeStatus: function () {
      if (!player) return "need_profile";
      return S.dailyChallenge.isDoneToday("rhythm_any_song") ? "claimed" : "not_claimed";
    },
    dailyChallengeText: function (status) {
      if (status === "claimed") return "✅ 今日已完成";
      if (status === "not_claimed") return "今天還沒完成";
      if (status === "need_profile") return "請從遊戲宇宙大廳進入";
      return "狀態暫時無法確認";
    },

    /* 結算：本機最佳（依 playerId＋歌曲分開，給 NEW RECORD 用）＋ Mock 成績提交。
       回傳值與原版 saveScore 相同：本場是否為新紀錄（同步布林值） */
    recordSongResult: function (d) {
      var note = $("bv-result-note");
      if (!player) {
        if (note) note.textContent = L.resultNote + "（沒有遊戲宇宙玩家，本場未記錄）";
        return false;
      }
      var prevRaw = S.playerStore.get(bestKey(d.songId));
      var prev = prevRaw == null ? null : Number(prevRaw);
      var isNew = prev === null || d.score > prev;
      if (isNew) S.playerStore.set(bestKey(d.songId), String(d.score));

      var scoreData = { songId: d.songId, difficulty: d.difficulty, score: d.score, maxCombo: d.maxCombo,
        perfect: d.perfect, good: d.good, miss: d.miss, accuracy: d.accuracy, grade: d.grade };
      if (officialOn()) {
        if (note) note.textContent = L.sending;
        S.finishRun(scoreData).then(function (out) {
          if (out.official && out.result) {
            lastOfficial = out.result;
            var msg = S.describeOfficialResult(out.result);
            if (note) note.textContent = msg;
            if (typeof window.setResultVCoinMessage === "function") { try { window.setResultVCoinMessage(msg, out.result.status === "accepted" && out.result.rewards.length ? "ok" : "claimed"); } catch (e) {} }
            refreshWallet();
          } else if (out.queued) {
            if (note) note.textContent = L.queued;
          } else if (note) {
            note.textContent = "本場成績沒有記入正式排行榜（" + ((out.error && out.error.userMessage) || "沒有取得正式場次") + "）";
          }
        });
        return isNew;
      }
      S.finishRun(null);   // 未開啟正式成績：丟棄（不會送出）
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
        if (note) note.textContent = L.resultNote + "（本場未記錄）";
        return isNew;
      }
      round.submissionId = sub.submissionId;
      round.songTitle = d.songTitle;
      S.services.scores.submit(sub).then(function () {
        if (note) note.textContent = L.resultNote + "（已存為本分頁測試成績）";
      }, function (err) {
        if (note) note.textContent = L.resultNote + "（本場未記錄：" + (err && err.userMessage || "未知錯誤") + "）";
        console.warn("[Universe] Mock 成績提交失敗：", err && err.userMessage);
      });
      return isNew;
    },

    /* 測試排行榜：用原版的 renderLBRows 畫（版面相同），資料來自本分頁 Mock */
    renderMockBoard: function (el, songId, lbMode, renderRows) {
      if (!el) return Promise.resolve();
      if (officialOn()) return renderOfficialBoard(el, songId, lbMode, renderRows);
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

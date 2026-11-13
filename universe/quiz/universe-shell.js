/* ==========================================================
   小V知識挑戰 — 遊戲宇宙換殼層（Universe Shell）
   universe-game-migration-v0.2.0-three-games-integration-test-1

   原版（vparty-quiz-game quiz-v0.2.44）的玩家系統函式改成呼叫這裡：
     身份      → BVUniverse SDK 讀取 playerId 的公開資料（唯讀，網址 ?bvPlayerId=）
     成績      → v0.3.0：後端正式成績開啟時 → 開局取得場次、結算送出；科目最佳／年級榜／總榜由伺服器用原版規則計算
                 （V學園進度讀伺服器的 quiz-progress）。未開啟或沙盒 → Mock（只存在目前分頁，依 playerId 分開）
     年級榜／總榜／V學園成績單 → Mock 模式：用原版計算函式算出，存在 Mock（不寫正式排行榜）
     題目修正  → 讀取 approved-question-overrides.json（唯讀、管理者匯出）；套用規則與原版相同
     V幣       → 未開放（不發放、不寫入）；今日挑戰保留完成判定，+10 待開放
     舊 Firebase → 完全不載入、不讀、不寫

   宇宙版的 PLAYER.playerKey 欄位存放「遊戲宇宙 playerId」（原版用它決定成績歸屬）。
   它不是舊系統的 ID＋圖案 playerKey，也不會被送到任何資料庫。
   ========================================================== */
(function () {
  "use strict";

  var GAME_VERSION = "quiz-v0.2.44+universe-v0.3.1-test-1";
  var AV_BASE = "../../assets/avatars/base/";
  var OVERRIDES_URL = "approved-question-overrides.json";
  /* 公開檔只需要原版 isQuestionEnabled 用到的三個欄位；其他欄位（含後台管理資訊）一律丟棄 */
  var OVERRIDE_FIELDS = ["disabled", "active", "quality"];
  var U = window.BVUniverse;
  var L = U.LABELS;

  var S = U.createGameSession({
    gameId: "quiz",
    gameVersion: GAME_VERSION,
    avatarBaseUrl: AV_BASE,
    lobbyUrl: "../../index.html",
    services: { scores: "mock", leaderboard: "mock", records: "mock" }
  });

  var player = null;
  var labels = {};
  var booted = false;
  var overrideState = { status: "loading", count: 0, source: OVERRIDES_URL };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function say(msg) { if (typeof window.toast === "function") window.toast(msg, 3200); else U.ui.toast(msg); }

  var FEATURE_TEXT = {
    wallet: "🪙 V幣錢包尚未開放：遊戲宇宙共用 V幣帳本完成後才會開放。",
    titles: "🎖 稱號收藏準備中：共用稱號 API 尚未開放。",
    avatarUnlocks: "🏆 頭像收藏準備中：共用頭像解鎖 API 尚未開放。",
    identity: "👤 玩家 ID 與身份頭像由遊戲宇宙管理。要切換玩家，請回到遊戲宇宙大廳。"
  };

  function goLobby() { S.goLobby(); }

  /* ---------- 題目修正：唯讀資料來源 ---------- */
  function overrideNoteText() {
    if (overrideState.status === "exported") return "";
    if (overrideState.status === "loading") return "";
    return "⚠️ 題目修正資料尚未同步：已停用的題目可能出現（測試版）";
  }
  function renderOverrideNote() {
    var el = $("bv-override-note");
    if (!el) return;
    var t = overrideNoteText();
    el.textContent = t;
    el.hidden = !t;
  }
  function loadApprovedOverrides() {
    if (!window.fetch) { overrideState = { status: "unavailable", count: 0 }; renderOverrideNote(); return Promise.resolve({}); }
    return fetch(OVERRIDES_URL + "?v=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (doc) {
      if (!doc || doc.schema !== "bv-quiz-question-overrides-v1") throw new Error("格式不符");
      if (doc.status !== "exported") {
        overrideState = { status: doc.status || "not_exported", count: 0, source: OVERRIDES_URL };
        renderOverrideNote();
        return {};
      }
      var out = {};
      Object.keys(doc.overrides || {}).forEach(function (id) {
        var src = doc.overrides[id];
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !src || typeof src !== "object") return;
        var ov = {};
        OVERRIDE_FIELDS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(src, k)) ov[k] = src[k]; });
        out[id] = ov;
      });
      overrideState = { status: "exported", count: Object.keys(out).length, source: OVERRIDES_URL, exportedAt: doc.exportedAt || null };
      renderOverrideNote();
      return out;
    }).catch(function (e) {
      console.warn("[Universe] 題目修正資料讀取失敗：", e && e.message);
      overrideState = { status: "unavailable", count: 0, source: OVERRIDES_URL };
      renderOverrideNote();
      return {};
    });
  }

  /* ---------- 頁面裝飾 ---------- */
  function decorate() {
    document.body.classList.add("bv-universe");
    if (S.isSandbox) document.body.classList.add("bv-sandbox");

    // 首頁：原本的「每日 V幣測試版」說明 → 一個狀態標示＋（需要時）題目修正狀態
    var notice = document.querySelector("#screen-title .notice");
    if (notice) {
      notice.textContent = "";
      notice.id = "bv-title-notice";
      notice.appendChild(U.ui.statusMark(S));
      var ov = document.createElement("div");
      ov.id = "bv-override-note";
      ov.className = "bv-override-note";
      ov.hidden = true;
      notice.appendChild(ov);
    }
    var card = document.createElement("div");
    card.id = "bv-identity-card";
    card.className = "bv-identity-card";
    card.hidden = true;
    var hero = document.querySelector("#screen-title .hero-card");
    if (hero) hero.insertAdjacentElement("afterbegin", card);

    var menu = $("btn-game-menu");
    if (menu) { menu.textContent = "🏠 回遊戲宇宙"; }

    // 玩家設定：唯讀
    var intro = document.querySelector("#screen-profile .panel > p.muted");
    if (intro) intro.textContent = "玩家 ID 與身份頭像由遊戲宇宙統一管理，這裡只能查看。要切換玩家，請回到遊戲宇宙大廳。";
    var input = $("player-id-input");
    if (input) { input.readOnly = true; input.setAttribute("aria-readonly", "true"); input.maxLength = 40; }
    var actions = document.querySelector("#screen-profile .profile-floating-actions");
    if (actions) {
      var lb = document.createElement("button");
      lb.type = "button"; lb.className = "btn ghost small"; lb.id = "bv-profile-lobby";
      lb.textContent = "🏠 回遊戲宇宙切換玩家";
      lb.addEventListener("click", goLobby);
      actions.insertBefore(lb, $("btn-profile-back"));
    }

    // 排行榜：一行說明
    var lbList = $("leaderboard-list");
    if (lbList) lbList.insertAdjacentHTML("beforebegin", '<div id="bv-lb-note" class="bv-note">' + esc(L.boardNote) + "</div>");

    // 尚未讀到玩家時，不進入挑戰（原版會導向「建立身份」畫面）
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("#btn-go-setup, #btn-daily-challenge, #btn-go-profile, #top-player-card");
      if (t && !player) { e.stopImmediatePropagation(); e.preventDefault(); explainNotReady(); }
    }, true);
  }

  function showIdentityState(kind, err) {
    var card = $("bv-identity-card");
    if (!card) return;
    if (kind === "ready") { card.hidden = true; card.innerHTML = ""; return; }
    card.hidden = false;
    if (kind === "loading") { card.className = "bv-identity-card is-loading"; card.textContent = "🎈 正在讀取遊戲宇宙玩家資料…"; return; }
    card.className = "bv-identity-card is-error";
    card.innerHTML = '<div class="bv-identity-msg">⚠️ ' + esc(err && err.userMessage || "無法讀取玩家資料") + "</div>" +
      '<div class="bv-identity-actions">' +
      (err && err.retryable ? '<button type="button" class="bv-btn bv-btn-primary" id="bv-retry">🔄 再試一次</button>' : "") +
      '<button type="button" class="bv-btn bv-btn-outline" id="bv-go-lobby">🏠 回遊戲宇宙大廳</button></div>';
    var r = $("bv-retry"); if (r) r.addEventListener("click", function () { start().then(refreshAfterLogin); });
    var g = $("bv-go-lobby"); if (g) g.addEventListener("click", goLobby);
  }

  function explainNotReady() {
    var st = S.getStatus();
    say(st.status === "error" && st.error ? st.error.userMessage : "正在讀取玩家資料，請稍候…");
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
      return p;
    }, function (err) {
      player = null;
      showIdentityState("error", err);
      console.warn("[Universe] 玩家讀取失敗：", err && err.kind, err && err.userMessage);
      return null;
    });
  }

  /* 重試成功後，把玩家套用到原版畫面（init 只會執行一次） */
  function refreshAfterLogin() {
    if (!player || !booted) return;
    try {
      window.loadPlayerLocal();
      window.updatePlayerUI();
      window.loadDailyChallengeStatus();
      window.refreshAcademyProgressCard();
    } catch (e) { console.warn("[Universe] refresh", e); }
  }

  S.onReset(function () { player = null; official.root = null; official.last = null; official.wallet = null; });

  /* ---------- v0.3.0 正式模式 ---------- */
  function officialOn() { return S.official.isEnabled(); }
  var official = { root: null, last: null, wallet: null };
  function loadServerProgress() {
    return S.official.getQuizProgress().then(function (d) { official.root = (d && d.progress) || {}; return official.root; });
  }
  function onWallet(w) {
    official.wallet = w;
    try { if (typeof window.updatePlayerUI === "function") window.updatePlayerUI(); } catch (e) {}
  }
  function gradeRecordsFromRoot(root) {
    var out = {};
    ["low", "middle", "high"].forEach(function (g) {
      if (root && root[g] && Object.keys(root[g]).length && typeof window.buildGradeRecordFromProgress === "function") out[g] = window.buildGradeRecordFromProgress(g, root[g]);
    });
    return out;
  }
  function wrapStartQuiz() {
    var orig = window.startQuiz;
    if (typeof orig !== "function" || orig.__bvWrapped) return;
    var wrapped = function () {
      official.last = null;
      if (player) S.startRun();   // 正式成績開啟時向伺服器取得場次（沒開啟／沙盒不會寫入任何資料）
      return orig.apply(this, arguments);
    };
    wrapped.__bvWrapped = true;
    window.startQuiz = wrapped;
  }

  function records() { return S.services.records; }
  function pid() { if (!player) throw U.UniverseError("missingPlayer"); return player.playerId; }
  function guard(fn) { try { return fn(); } catch (e) { return Promise.reject(e); } }

  /* Mock：問答專屬紀錄（集合 progress／board-low…／board-main／academy，依 playerId 分開） */
  var mock = {
    getProgressRoot: function () {
      if (officialOn()) {
        // 正式模式：伺服器的科目最佳（原版 quizProgress 結構）。結算時用「送出前」的快照，讓原版流程算出的提示與伺服器一致
        if (official.root) return Promise.resolve(JSON.parse(JSON.stringify(official.root)));
        return guard(function () { pid(); return loadServerProgress().then(function (r) { return JSON.parse(JSON.stringify(r)); }); });
      }
      return guard(function () { return records().get("progress", pid()).then(function (r) { return (r && r.root) || {}; }); });
    },
    setProgressRoot: function (root) {
      if (officialOn()) {
        // 不寫入任何資料（伺服器已用同一套原版規則更新）；只有伺服器接受的成績才更新畫面上的進度
        if (official.last && official.last.status === "accepted") official.root = JSON.parse(JSON.stringify(root));
        return Promise.resolve(null);
      }
      return guard(function () { return records().put("progress", pid(), { root: root }); });
    },
    putBoard: function (boardId, record) {
      if (officialOn()) return Promise.resolve(null);   // 年級榜／總榜由伺服器計算
      return guard(function () { return records().put("board-" + boardId, pid(), record); });
    },
    getMyGradeRecords: function () {
      if (officialOn()) return mock.getProgressRoot().then(gradeRecordsFromRoot);
      return guard(function () {
        var me = pid();
        return Promise.all(["low", "middle", "high"].map(function (g) {
          return records().get("board-" + g, me).then(function (r) { return { key: g, val: r }; });
        })).then(function (rows) {
          var out = {};
          rows.forEach(function (row) { if (row.val) out[row.key] = row.val; });
          return out;
        });
      });
    },
    listBoard: function (boardId) {
      if (officialOn()) {
        return S.official.getBoard(boardId, { limit: 30 }).then(function (b) {
          return b.rows.map(function (r) {
            var row = { playerKey: r.playerId, playerId: r.playerId, name: r.displayId, displayAvatarKey: r.displayAvatarKey, equippedTitleName: r.titleName || "",
              completedSubjects: r.completedSubjects, perfectSubjects: r.perfectSubjects, totalCorrect: r.totalCorrect, totalQuestions: r.totalQuestions,
              totalTimeUsed: r.totalTimeUsed, totalMaxCombo: r.totalMaxCombo, totalAttempts: r.totalAttempts, updatedAt: r.updatedAt };
            if (boardId === "main") { row.totalScore = r.score; row.gradeSummaryText = r.summary; row.gradeSummary = r.gradeSummary; }
            else { row.gradeTotalScore = r.score; row.subjectSummaryText = r.summary; row.subjectNames = r.subjectNames || []; }
            return row;
          });
        });
      }
      return guard(function () {
        return records().list("board-" + boardId).then(function (rows) {
          return rows.map(function (r) { return Object.assign({}, r, { playerKey: r.playerId }); });
        });
      });
    },
    getAcademy: function () {
      if (!player) return Promise.resolve(null);
      if (officialOn()) return Promise.resolve(null);   // 由伺服器進度重新計算（原版 calculateQuizAcademyProgress）
      return records().get("academy", player.playerId).then(function (r) { return r && r.academy || null; }, function () { return null; });
    },
    putAcademy: function (academy) {
      if (officialOn()) return Promise.resolve(null);
      return guard(function () { return records().put("academy", pid(), { academy: academy }); });
    }
  };

  window.UniverseQuiz = {
    session: S,
    gameVersion: GAME_VERSION,
    labels: L,
    mock: mock,

    boot: function (init) {
      decorate();
      return Promise.all([start(), loadLabels()]).then(function () {
        wrapStartQuiz();
        return player ? S.bootOfficial({ onWallet: onWallet }).then(function (on) {
          if (!on) return null;
          window.UniverseQuiz.labels = Object.assign({}, L, { dailyRewardPending: "+10 V幣由伺服器確認後發放" });
          return loadServerProgress().catch(function () {});
        }) : null;
      }).then(function () {
        booted = true;
        init();
        renderOverrideNote();
      });
    },
    isReady: function () { return !!player; },
    getPlayer: function () { return player; },
    playerKeyFor: function () { return player ? player.playerId : ""; },
    lobbyUrl: function () { return S.lobbyUrl(); },
    goLobby: goLobby,
    overrideState: function () { return JSON.parse(JSON.stringify(overrideState)); },
    loadApprovedOverrides: loadApprovedOverrides,

    applyPlayerTo: function (P) {
      if (player) {
        P.id = player.displayId;
        P.name = player.displayId;
        P.playerId = player.playerId;
        P.playerKey = player.playerId;          // 成績歸屬＝遊戲宇宙 playerId（不是舊 playerKey）
        P.baseAvatarKey = player.baseAvatarKey;
        P.displayAvatarKey = player.displayAvatarKey || player.baseAvatarKey;   // v0.3.1：遊戲宇宙共用收藏目前裝備的展示頭像（baseAvatarKey 不變）
        P.avatarKey = P.displayAvatarKey;
        P.avatarSrc = S.avatars.imageUrl(P.displayAvatarKey) || S.avatars.imageUrl(player.baseAvatarKey);
      } else {
        P.id = ""; P.name = "讀取中…"; P.playerId = ""; P.playerKey = "";
      }
      return P;
    },
    /* v0.3.1：展示頭像只能是身份頭像，或伺服器回傳的目前裝備展示頭像 */
    isDisplayAvatarAllowed: function (key) { return !!key && !!player && (key === player.baseAvatarKey || key === player.displayAvatarKey); },
    avatarFor: function (key) {
      if (!key) return null;
      var mine = player && (key === player.baseAvatarKey || key === player.displayAvatarKey);
      if (!mine && !labels[key] && !U.isDisplayAvatarKey(key)) return null;
      var url = S.avatars.imageUrl(key);
      return url ? { key: key, src: url, url: url, name: labels[key] || key } : null;
    },
    avatarLabel: function (key) { return labels[key] || ""; },
    avatarPickerBlocked: function (mode) {
      if (mode === "base") say(FEATURE_TEXT.identity);
      else if (!S.isSandbox && player) U.ui.showCollection(S);   // v0.3.1：展示頭像 → 共用收藏視窗（更換在大廳通行證）
      else say(FEATURE_TEXT.avatarUnlocks);
      return true;
    },
    notReady: function (feature) {
      // v0.3.1：稱號／頭像收藏 → 遊戲宇宙共用收藏視窗（只讀；更換在大廳通行證）
      if ((feature === "titles" || feature === "avatarUnlocks") && !S.isSandbox && player) { U.ui.showCollection(S); return true; }
      if (feature === "wallet" && officialOn()) {
        say(official.wallet ? (S.official.isTrial() ? "🧪 試營運 V幣：" : "🪙 V幣餘額：") + Number(official.wallet.balance || 0).toLocaleString() + "（V幣紀錄請到遊戲宇宙大廳「我的通行證」查看；消費尚未開放）" : "🪙 V幣讀取中…");
        return true;
      }
      say(FEATURE_TEXT[feature] || "這個功能準備中"); return true;
    },
    explainNotReady: explainNotReady,
    walletText: function () { return officialOn() && official.wallet ? Number(official.wallet.balance || 0).toLocaleString() + (S.official.isTrial() ? "（試營運）" : "") : (officialOn() ? "讀取中" : L.vcoinClosed); },
    titleText: function () { return S.isSandbox ? "準備中" : (player && player.title ? player.title.name : "未裝備"); },

    /* 結算：ScoreSubmission（Mock）。回傳像原版 gameLogs push 的結果（含 key） */
    submitRecord: function (record) {
      if (!player) return Promise.reject(U.UniverseError("missingPlayer"));
      if (officialOn()) {
        var data = { gradeBand: record.gradeBand, subject: record.subject, score: record.score, correctCount: record.correctCount,
          totalQuestions: record.totalQuestions, maxCombo: record.maxCombo, accuracy: record.accuracy, timeUsedTotal: record.timeUsedTotal };
        // 先取得送出前的伺服器進度（原版流程用它計算「最佳是否刷新」），再送出
        return loadServerProgress().catch(function () { return null; }).then(function () { return S.finishRun(data); }).then(function (out) {
          if (out.official && out.result) {
            official.last = out.result;
            S.official.getWallet().then(onWallet, function () {});
            if (out.result.status === "accepted") return { key: out.result.submissionId };
            throw U.UniverseError("validation", { userMessage: S.describeOfficialResult(out.result) });
          }
          if (out.queued) throw U.UniverseError("network", { userMessage: L.queued });
          throw U.UniverseError("server", { userMessage: "本場成績沒有記入正式排行榜（" + ((out.error && out.error.userMessage) || "沒有取得正式場次") + "）" });
        }).catch(function (e) { official.failMsg = e && e.userMessage; throw e; });
      }
      var now = new Date();
      var startedAt = (window.quizState && window.quizState.startedAt) ? new Date(window.quizState.startedAt) : now;
      var sub;
      try {
        sub = S.newScoreSubmission({
          startedAt: startedAt.toISOString(),
          finishedAt: now.toISOString(),
          scoreData: { gradeBand: record.gradeBand, subject: record.subject, score: record.score, correctCount: record.correctCount,
            totalQuestions: record.totalQuestions, maxCombo: record.maxCombo, accuracy: record.accuracy, timeUsedTotal: record.timeUsedTotal }
        });
      } catch (e) { return Promise.reject(e); }
      return S.services.scores.submit(sub).then(function (saved) { return { key: saved.submissionId }; });
    },
    savedText: function () { return officialOn() && official.last ? S.describeOfficialResult(official.last) : L.resultNote + "（已存為本分頁測試成績）"; },
    saveFailedText: function () { return officialOn() ? (official.failMsg || "⚠️ 本場成績沒有記入正式排行榜") : "⚠️ " + L.resultNote + "（本場未記錄）"; },

    showVcoinNotice: function (v) {
      if (officialOn()) {
        var bx = $("result-vcoin-banner");
        if (!bx) return true;
        var r = official.last;
        var coins = r && r.status === "accepted" ? (r.rewards || []) : [];
        bx.classList.remove("hidden", "claimed", "failed", "already");
        bx.classList.add(coins.length ? "claimed" : (r ? "already" : "failed"));
        var tt = $("vcoin-title"), mm = $("vcoin-message");
        if (tt) tt.textContent = coins.length ? "🪙 +" + coins.reduce(function (a, x) { return a + x.amount; }, 0) + " V幣" : "🪙 V幣";
        if (mm) mm.textContent = r ? S.describeOfficialResult(r) + (typeof r.balance === "number" && r.status === "accepted" ? "｜目前 " + r.balance + (S.official.isTrial() ? " 試營運 V幣" : " V幣") : "") : (official.failMsg || "本場沒有發放 V幣");
        return true;
      }
      if (!v || v.reason !== "not_implemented") return false;
      var box = $("result-vcoin-banner");
      if (!box) return true;
      box.classList.remove("hidden", "claimed", "failed");
      box.classList.add("already");
      var t = $("vcoin-title"), m = $("vcoin-message");
      if (t) t.textContent = L.vcoinResult;
      if (m) m.textContent = "每日 +30 V幣將由正式錢包統一發放（尚未開放）";
      return true;
    },

    /* 今日挑戰：完成判定照原版（指定年級＋科目），只記錄完成，不發 +10 */
    isDailyChallengeDone: function (c) { return S.dailyChallenge.isDoneToday("quiz_daily"); },
    markDailyChallengeDone: function (c) { return S.dailyChallenge.markDone("quiz_daily"); },
    dailyChallengeText: function (done) {
      var pend = officialOn() ? "+10 V幣" : L.dailyRewardPending;
      return done ? "今日挑戰已完成（" + pend + "）" : "完成指定年級與科目即達成（" + pend + "）";
    }
  };
})();

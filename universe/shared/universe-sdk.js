/* ==========================================================
   氣球小V遊戲宇宙 — Universe SDK（三款遊戲共用）
   universe-game-migration-v0.1.0-foundation-test-1

   一個檔案、不需打包工具：遊戲用 <script src="../shared/universe-sdk.js"> 載入，
   取得全域 window.BVUniverse；Node 測試用 require() 載入。

   ■ 這個 SDK 負責
     1. 身份交接：從網址 ?bvPlayerId= 取得 playerId（低信任識別，不是密碼）
     2. 讀取玩家公開資料：GET /v1/players/:playerId（唯讀，不建立、不修改玩家）
     3. 玩家切換的狀態隔離：每位玩家的暫存資料分開存放，切換時清除上一位
     4. 錯誤分類：逾時、HTTP 429、網路故障、找不到玩家、伺服器錯誤
     5. 正式（production）／沙盒（sandbox）明確區分
     6. 資料契約：ScoreSubmission、V幣、排行榜（給未來後端 API 使用）
     7. 尚未存在的 API：一律回報 NOT_IMPLEMENTED，或使用「明確標示的 Mock」

   ■ 這個 SDK 絕對不做
     - 不包含任何 Firebase 設定或服務帳戶私鑰
     - 不連線舊 Firebase（vparty-rhythm-game），也不會在失敗時退回舊 Firebase
     - 不直接寫入任何正式資料庫；Mock 資料只存在目前分頁（sessionStorage）
     - 不把 playerId／ID＋圖案 當成 V幣消費或管理員權限的授權
   ========================================================== */

(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BVUniverse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  var SDK_VERSION = "0.1.0";
  var DEFAULT_API_BASE = "https://balloon-v-universe-api.vashyang1120.workers.dev";
  var PLAYER_ID_RE = /^p_[a-z2-7]{20}$/;
  var AVATAR_KEY_RE = /^[a-z0-9_]{1,40}$/;
  var GAME_IDS = ["tetris", "rhythm", "quiz"];
  var LOBBY_SANDBOX_DB_KEY = "bvUniverseSandbox_v2_api";   // 大廳 ?sandbox=1 的模擬玩家資料（同一分頁）

  /* ==========================================================
     1. 錯誤：統一種類＋給孩子看的中文訊息
     ========================================================== */
  var ERROR_KINDS = {
    missingPlayer:   "還沒有選擇玩家，請從遊戲宇宙大廳進入遊戲。",
    legacyPlayerKey: "這是舊版遊戲的玩家代碼，新版需要從遊戲宇宙大廳重新進入。",
    invalidPlayerId: "玩家代碼格式不正確，請從遊戲宇宙大廳重新進入。",
    notFound:        "找不到這位玩家，請回到遊戲宇宙大廳重新選擇。",
    rateLimited:     "連線太頻繁了，請稍等一下再試。",
    timeout:         "連線逾時，請檢查網路後再試一次。",
    network:         "網路連線失敗，請檢查網路後再試一次。",
    server:          "遊戲宇宙伺服器暫時無法使用，請稍後再試。",
    validation:      "資料格式不正確。",
    notImplemented:  "這個功能還在準備中，尚未開放。",
    forbidden:       "沒有權限進行這個動作。"
  };

  function UniverseError(kind, opts) {
    opts = opts || {};
    var msg = opts.userMessage || ERROR_KINDS[kind] || "發生未知錯誤";
    var e = new Error(msg);
    e.name = "UniverseError";
    e.kind = kind;
    e.userMessage = msg;
    e.code = opts.code || kind;
    e.status = opts.status || 0;
    e.retryAfterSec = opts.retryAfterSec || 0;
    e.service = opts.service || "";
    e.retryable = kind === "rateLimited" || kind === "timeout" || kind === "network" || kind === "server";
    return e;
  }
  function isUniverseError(e) { return !!(e && e.name === "UniverseError" && e.kind); }

  /* ==========================================================
     2. 身份識別工具
     ========================================================== */
  function isValidPlayerId(v) { return typeof v === "string" && PLAYER_ID_RE.test(v); }

  /* 舊系統 playerKey = encodeFirebaseKeyPart(ID) + "__" + baseAvatarKey —— 絕不可當成新 playerId */
  function looksLikeLegacyPlayerKey(v) {
    return typeof v === "string" && v.indexOf("__") > 0 && !PLAYER_ID_RE.test(v);
  }

  function classifyPlayerIdInput(raw) {
    if (raw == null || String(raw).trim() === "") return { ok: false, reason: "missingPlayer" };
    var v = String(raw).trim();
    if (isValidPlayerId(v)) return { ok: true, playerId: v };
    if (looksLikeLegacyPlayerKey(v)) return { ok: false, reason: "legacyPlayerKey" };
    return { ok: false, reason: "invalidPlayerId" };
  }

  /* 台灣日期鍵（Asia/Taipei）："YYYYMMDD"；每日 +30 V幣以這個日期判斷 */
  function taipeiDateKey(date) {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(date || new Date());
    var y = "", m = "", d = "";
    parts.forEach(function (p) { if (p.type === "year") y = p.value; if (p.type === "month") m = p.value; if (p.type === "day") d = p.value; });
    return y + m + d;
  }

  function uuid() {
    var c = root && root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  /* 安全的 Storage 包裝（隱私模式／被封鎖時不會讓遊戲壞掉） */
  function safeStorage(s) {
    return {
      get: function (k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } },
      set: function (k, v) { try { if (s) s.setItem(k, v); return !!s; } catch (e) { return false; } },
      remove: function (k) { try { if (s) s.removeItem(k); } catch (e) {} },
      keys: function () {
        var out = [];
        try { if (s) for (var i = 0; i < s.length; i++) out.push(s.key(i)); } catch (e) {}
        return out;
      },
      json: function (k, fallback) { try { var v = JSON.parse(s.getItem(k)); return v == null ? fallback : v; } catch (e) { return fallback; } }
    };
  }

  /* ==========================================================
     3. API Client（只有讀取；建立／找回玩家由大廳負責）
     ========================================================== */
  function createApiClient(opts) {
    opts = opts || {};
    var base = String(opts.baseUrl || DEFAULT_API_BASE).replace(/\/+$/, "");
    var timeoutMs = opts.timeoutMs || 12000;
    var fetchImpl = opts.fetch || (root && root.fetch && root.fetch.bind(root));

    function request(method, path) {
      if (!fetchImpl) return Promise.reject(UniverseError("network"));
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timedOut = false;
      var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, timeoutMs);
      return Promise.resolve()
        .then(function () {
          return fetchImpl(base + path, { method: method, headers: { accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined });
        })
        .then(function (res) {
          clearTimeout(timer);
          return res.text().then(function (text) {
            var body = null;
            try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
            if (res.ok && body && body.ok === true) return body.data;
            var code = body && body.error && body.error.code;
            var serverMsg = body && body.error && body.error.message;
            if (res.status === 429) {
              var ra = Number(res.headers && res.headers.get && res.headers.get("retry-after")) || 60;
              throw UniverseError("rateLimited", { status: 429, code: code || "RATE_LIMITED", retryAfterSec: ra });
            }
            if (res.status === 404) throw UniverseError("notFound", { status: 404, code: code || "NOT_FOUND" });
            if (res.status === 400) throw UniverseError("validation", { status: 400, code: code, userMessage: serverMsg });
            if (res.status === 403) throw UniverseError("forbidden", { status: 403, code: code });
            throw UniverseError("server", { status: res.status, code: code || "SERVER_ERROR" });
          });
        }, function (err) {
          clearTimeout(timer);
          if (timedOut || (err && err.name === "AbortError")) throw UniverseError("timeout");
          throw UniverseError("network");
        });
    }

    return {
      baseUrl: base,
      getPlayer: function (playerId) {
        var c = classifyPlayerIdInput(playerId);
        if (!c.ok) return Promise.reject(UniverseError(c.reason));
        return request("GET", "/v1/players/" + encodeURIComponent(c.playerId)).then(function (d) { return d && d.player; });
      },
      listBaseAvatars: function () { return request("GET", "/v1/avatars/base"); },
      _request: request
    };
  }

  /* ==========================================================
     4. Adapters
     ========================================================== */
  function notImplementedAdapter(service, methods) {
    var a = { mode: "notImplemented", service: service, label: "尚未開放（後端 API 準備中）" };
    methods.forEach(function (m) {
      a[m] = function () { return Promise.reject(UniverseError("notImplemented", { service: service, code: "NOT_IMPLEMENTED" })); };
    });
    return a;
  }

  /* --- 玩家：正式（唯讀 API） --- */
  function productionPlayerAdapter(api) {
    return {
      mode: "production",
      label: "正式玩家資料（唯讀）",
      getPlayer: function (id) { return api.getPlayer(id); },
      listBaseAvatars: function () { return api.listBaseAvatars(); }
    };
  }

  /* --- 玩家：Mock（不連網；讀大廳沙盒建立的玩家＋測試用示範玩家） --- */
  function mockPlayerAdapter(opts) {
    var sess = safeStorage(opts.sessionStorage);
    var seeds = {};
    (opts.mockPlayers || []).forEach(function (p) { seeds[p.playerId] = p; });
    function pub(p) {
      return {
        playerId: p.playerId,
        displayId: p.displayId,
        baseAvatarKey: p.baseAvatarKey,
        displayAvatarKey: p.displayAvatarKey || p.baseAvatarKey,
        createdAt: typeof p.createdAt === "number" ? new Date(p.createdAt).toISOString() : (p.createdAt || null)
      };
    }
    return {
      mode: "mock",
      label: "測試沙盒（模擬玩家資料，不連線正式資料庫）",
      getPlayer: function (id) {
        var c = classifyPlayerIdInput(id);
        if (!c.ok) return Promise.reject(UniverseError(c.reason));
        var lobby = sess.json(LOBBY_SANDBOX_DB_KEY, { players: {} });
        var p = (lobby.players && lobby.players[c.playerId]) || seeds[c.playerId];
        return new Promise(function (resolve, reject) {
          setTimeout(function () { if (p) resolve(pub(p)); else reject(UniverseError("notFound", { status: 404, code: "PLAYER_NOT_FOUND" })); }, 0);
        });
      },
      listBaseAvatars: function () {
        if (opts.mockAvatarList) return Promise.resolve({ catalogVersion: 0, avatars: opts.mockAvatarList.slice() });
        return Promise.reject(UniverseError("notImplemented", { service: "avatars" }));
      }
    };
  }

  /* --- 分頁內 Mock 資料庫（sessionStorage；分頁關閉就消失，絕不寫入正式資料庫） --- */
  function mockDb(sessionStorageImpl, mode) {
    var s = safeStorage(sessionStorageImpl);
    var KEY = "bvUniverseSdk_v1_mockDb__" + mode;
    return {
      read: function () { return s.json(KEY, { scores: {}, wallet: {}, ledger: [], dailyRewards: {} }); },
      write: function (db) { s.set(KEY, JSON.stringify(db)); },
      clear: function () { s.remove(KEY); }
    };
  }

  /* --- V幣：Mock 錢包（只在 sandbox；用來驗證「每人每天一次＋30」契約，不是真的 V幣） --- */
  var DAILY_REWARD_AMOUNT = 30;
  function mockWalletAdapter(db, clock) {
    return {
      mode: "mock",
      label: "測試 V幣（Mock，只存在這個分頁，不是正式 V幣）",
      getBalance: function (playerId) {
        var d = db.read();
        return Promise.resolve({ playerId: playerId, balance: Number(d.wallet[playerId] || 0), source: "mock", serverConfirmed: false });
      },
      /* 每日獎勵：同一 playerId 在同一個台灣日期只能領一次，不分遊戲 */
      claimDailyReward: function (req) {
        var c = classifyPlayerIdInput(req && req.playerId);
        if (!c.ok) return Promise.reject(UniverseError(c.reason));
        if (GAME_IDS.indexOf(req.gameId) < 0) return Promise.reject(UniverseError("validation", { userMessage: "未知的遊戲" }));
        var d = db.read();
        var dateKey = taipeiDateKey(clock());
        var k = c.playerId + "|" + dateKey;
        if (d.dailyRewards[k]) {
          return Promise.resolve({ status: "already_claimed", dateKey: dateKey, claimedByGameId: d.dailyRewards[k].gameId, amount: 0, balance: Number(d.wallet[c.playerId] || 0), source: "mock", serverConfirmed: false });
        }
        var tx = { txId: uuid(), playerId: c.playerId, type: "daily_reward", amount: DAILY_REWARD_AMOUNT, gameId: req.gameId, dateKey: dateKey, createdAt: clock().toISOString(), source: "mock" };
        d.dailyRewards[k] = { gameId: req.gameId, txId: tx.txId };
        d.wallet[c.playerId] = Number(d.wallet[c.playerId] || 0) + DAILY_REWARD_AMOUNT;
        d.ledger.push(tx);
        db.write(d);
        return Promise.resolve({ status: "claimed", dateKey: dateKey, amount: DAILY_REWARD_AMOUNT, txId: tx.txId, balance: d.wallet[c.playerId], source: "mock", serverConfirmed: false });
      },
      listTransactions: function (playerId) {
        return Promise.resolve(db.read().ledger.filter(function (t) { return t.playerId === playerId; }));
      },
      spend: function () { return Promise.reject(UniverseError("forbidden", { service: "wallet", userMessage: "V幣消費需要另外的安全授權，目前尚未開放。" })); }
    };
  }

  /* ==========================================================
     5. 成績資料契約 ScoreSubmission
     共用外層：playerId / gameId / gameVersion / submissionId / startedAt / finishedAt / scoreData
     scoreData 依遊戲各自定義（不強迫塞成同一個分數格式）
     ========================================================== */
  function isInt(v, min) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= (min || 0); }
  function isNum(v, min, max) { return typeof v === "number" && isFinite(v) && v >= min && v <= max; }

  var SCORE_SCHEMAS = {
    tetris: {
      required: { score: isInt, level: function (v) { return isInt(v, 1); }, lines: isInt, peakCombo: isInt,
        difficulty: function (v) { return v === "easy" || v === "normal" || v === "hard"; } },
      bestMetric: "score"
    },
    rhythm: {
      required: { songId: function (v) { return typeof v === "string" && /^song\d{3,}$/.test(v); },
        difficulty: function (v) { return v === "easy" || v === "normal" || v === "hard"; },
        score: isInt, maxCombo: isInt, perfect: isInt, good: isInt, miss: isInt,
        accuracy: function (v) { return isInt(v) && v <= 100; },
        grade: function (v) { return ["S", "A+", "A", "B", "C", "D", "E"].indexOf(v) >= 0; } },
      bestMetric: "score"
    },
    quiz: {
      required: { gradeBand: function (v) { return v === "low" || v === "middle" || v === "high"; },
        subject: function (v) { return typeof v === "string" && /^[a-z_]{1,20}$/.test(v); },
        score: isInt, correctCount: isInt, totalQuestions: function (v) { return isInt(v, 1); }, maxCombo: isInt,
        accuracy: function (v) { return isNum(v, 0, 1); }, timeUsedTotal: isInt },
      bestMetric: "score"
    }
  };

  function buildScoreSubmission(o) {
    o = o || {};
    return {
      schemaVersion: 1,
      submissionId: o.submissionId || uuid(),        // 同一場遊戲固定一個；後端以此防止重複提交
      playerId: o.playerId,
      gameId: o.gameId,
      gameVersion: o.gameVersion || "",
      mode: o.mode || "production",
      startedAt: o.startedAt,                        // ISO 字串
      finishedAt: o.finishedAt,
      scoreData: o.scoreData || {},
      client: { sdkVersion: SDK_VERSION, reportedBy: "client" }   // 客戶端回報，尚未經伺服器確認
    };
  }

  function validateScoreSubmission(s) {
    var errors = [];
    if (!s || typeof s !== "object") return { ok: false, errors: ["submission 必須是物件"] };
    if (s.schemaVersion !== 1) errors.push("schemaVersion");
    if (!/^[0-9a-f-]{16,64}$/i.test(String(s.submissionId || ""))) errors.push("submissionId");
    if (!isValidPlayerId(s.playerId)) errors.push(looksLikeLegacyPlayerKey(s.playerId) ? "playerId（不可使用舊 playerKey）" : "playerId");
    if (GAME_IDS.indexOf(s.gameId) < 0) errors.push("gameId");
    var t0 = Date.parse(s.startedAt), t1 = Date.parse(s.finishedAt);
    if (!isFinite(t0)) errors.push("startedAt");
    if (!isFinite(t1)) errors.push("finishedAt");
    if (isFinite(t0) && isFinite(t1) && (t1 < t0 || t1 - t0 > 6 * 3600 * 1000)) errors.push("startedAt/finishedAt 範圍");
    var schema = SCORE_SCHEMAS[s.gameId];
    if (schema) {
      var d = s.scoreData || {};
      Object.keys(schema.required).forEach(function (k) { if (!schema.required[k](d[k])) errors.push("scoreData." + k); });
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* --- 成績：Mock（分頁內；結果一律標示「未經伺服器確認」） --- */
  function mockScoreAdapter(db, clock) {
    return {
      mode: "mock",
      label: "測試成績（Mock，只存在這個分頁，不會寫入正式排行榜）",
      submit: function (sub) {
        var v = validateScoreSubmission(sub);
        if (!v.ok) return Promise.reject(UniverseError("validation", { userMessage: "成績資料格式不正確：" + v.errors.join("、") }));
        var d = db.read();
        var list = d.scores[sub.playerId] || (d.scores[sub.playerId] = []);
        var dup = list.find(function (r) { return r.submissionId === sub.submissionId; });
        if (dup) return Promise.resolve({ status: "duplicate", submissionId: sub.submissionId, recordStatus: "mock", serverConfirmed: false });
        var rec = JSON.parse(JSON.stringify(sub));
        rec.recordStatus = "mock";          // 未來正式後端：pending → accepted / rejected
        rec.serverConfirmed = false;
        rec.receivedAt = clock().toISOString();
        list.push(rec);
        db.write(d);
        return Promise.resolve({ status: "recorded", submissionId: sub.submissionId, recordStatus: "mock", serverConfirmed: false });
      },
      listMine: function (playerId, gameId) {
        var list = (db.read().scores[playerId] || []).filter(function (r) { return !gameId || r.gameId === gameId; });
        return Promise.resolve(list);
      },
      getBest: function (playerId, gameId) {
        var metric = (SCORE_SCHEMAS[gameId] || {}).bestMetric || "score";
        return this.listMine(playerId, gameId).then(function (list) {
          var best = null;
          list.forEach(function (r) { if (!best || Number(r.scoreData[metric]) > Number(best.scoreData[metric])) best = r; });
          return best;
        });
      }
    };
  }

  /* --- 排行榜：Mock（只由本分頁 Mock 成績計算；每位玩家只取最佳一筆） --- */
  function mockLeaderboardAdapter(db, profileLookup) {
    return {
      mode: "mock",
      label: "測試排行榜（只含這個分頁的 Mock 成績，不是正式排行榜）",
      getBoard: function (q) {
        q = q || {};
        var d = db.read();
        var rows = [];
        Object.keys(d.scores).forEach(function (pid) {
          var best = null;
          d.scores[pid].forEach(function (r) {
            if (r.gameId !== q.gameId) return;
            if (q.gameId === "rhythm" && ((q.songId && r.scoreData.songId !== q.songId) || (q.difficulty && r.scoreData.difficulty !== q.difficulty))) return;
            if (!best || r.scoreData.score > best.scoreData.score) best = r;
          });
          if (best) rows.push({ playerId: pid, score: best.scoreData.score, scoreData: best.scoreData, finishedAt: best.finishedAt, profile: profileLookup(pid) });
        });
        rows.sort(function (a, b) { return b.score - a.score || Date.parse(a.finishedAt) - Date.parse(b.finishedAt); });
        return Promise.resolve({ boardKey: q.gameId + (q.songId ? "/" + q.songId + "/" + (q.difficulty || "") : "/main"), source: "mock", serverConfirmed: false, rows: rows.slice(0, q.limit || 50) });
      }
    };
  }

  /* ==========================================================
     6. 遊戲 Session：身份交接＋玩家上下文＋服務
     ========================================================== */
  function createGameSession(opts) {
    opts = opts || {};
    if (GAME_IDS.indexOf(opts.gameId) < 0) throw new Error("BVUniverse: 未知的 gameId " + opts.gameId);
    var loc = opts.location || (root && root.location) || { search: "", href: "" };
    var params = new URLSearchParams(loc.search || "");
    var mode = opts.mode || (params.get("sandbox") === "1" ? "sandbox" : "production");
    if (mode !== "production" && mode !== "sandbox") throw new Error("BVUniverse: mode 必須是 production 或 sandbox");
    var clock = opts.now || function () { return new Date(); };
    var local = safeStorage(opts.localStorage !== undefined ? opts.localStorage : (root && root.localStorage));
    var sess = safeStorage(opts.sessionStorage !== undefined ? opts.sessionStorage : (root && root.sessionStorage));
    var sessionRaw = opts.sessionStorage !== undefined ? opts.sessionStorage : (root && root.sessionStorage);
    var prefix = mode === "sandbox" ? "bvUniverseSandbox_" : "bvUniverse_";
    var TAB_KEY = "bvUniverseSdk_v1_" + mode + "_" + opts.gameId + "_playerId";
    var LOBBY_CURRENT_KEY = prefix + "v2_currentPlayerId";
    var avatarBaseUrl = opts.avatarBaseUrl || "../../assets/avatars/base/";

    var api = createApiClient({ baseUrl: opts.apiBaseUrl, timeoutMs: opts.timeoutMs, fetch: opts.fetch });
    var players = mode === "sandbox"
      ? mockPlayerAdapter({ sessionStorage: sessionRaw, mockPlayers: opts.mockPlayers, mockAvatarList: opts.mockAvatarList })
      : productionPlayerAdapter(api);
    var store = mockDb(sessionRaw, mode);
    var svc = opts.services || {};
    var profiles = {};   // playerId → 公開資料（只用來顯示 Mock 排行榜名稱）

    var services = {
      players: players,
      /* V幣：正式後端未完成 → NOT_IMPLEMENTED；只有 sandbox 可用 Mock 驗證契約 */
      wallet: (mode === "sandbox" && svc.wallet === "mock") ? mockWalletAdapter(store, clock)
        : notImplementedAdapter("wallet", ["getBalance", "claimDailyReward", "listTransactions", "spend"]),
      /* 成績：正式 API 未完成 → 預設 NOT_IMPLEMENTED；遊戲可明確選擇 Mock（並在畫面標示） */
      scores: svc.scores === "mock" ? mockScoreAdapter(store, clock)
        : notImplementedAdapter("scores", ["submit", "listMine", "getBest"]),
      leaderboard: svc.leaderboard === "mock" ? mockLeaderboardAdapter(store, function (pid) { return profiles[pid] || null; })
        : notImplementedAdapter("leaderboard", ["getBoard"]),
      gameLogs: notImplementedAdapter("gameLogs", ["append", "listMine"]),
      titles: notImplementedAdapter("titles", ["listUnlocked", "unlock", "equip"]),
      avatarUnlocks: notImplementedAdapter("avatarUnlocks", ["listUnlocked", "unlock", "equipDisplay"])
    };

    var state = { player: null, status: "idle", error: null, epoch: 0, handoff: null };
    var listeners = { change: [], reset: [] };
    function emit(type, arg) { listeners[type].forEach(function (fn) { try { fn(arg); } catch (e) {} }); }

    /* 玩家專屬的本機暫存鍵：不同玩家、不同模式、不同遊戲彼此不會混用 */
    function playerKeyPrefix(pid) { return "bvUniverseGame_v1_" + mode + "_" + opts.gameId + "__" + pid + "__"; }
    var playerStore = {
      get: function (name) { return state.player ? local.get(playerKeyPrefix(state.player.playerId) + name) : null; },
      set: function (name, v) { if (state.player) local.set(playerKeyPrefix(state.player.playerId) + name, String(v)); },
      remove: function (name) { if (state.player) local.remove(playerKeyPrefix(state.player.playerId) + name); }
    };

    /* 身份交接：網址 bvPlayerId → 本分頁先前的玩家 → 大廳目前玩家（同網域） */
    function readHandoff() {
      if (params.has("bvPlayerId")) return { raw: params.get("bvPlayerId"), source: "url" };
      var tab = sess.get(TAB_KEY);
      if (tab) return { raw: tab, source: "tabSession" };
      if (opts.allowLobbyFallback !== false) {
        var lobby = local.get(LOBBY_CURRENT_KEY);
        if (lobby) return { raw: lobby, source: "lobbyCurrent" };
      }
      return { raw: null, source: "none" };
    }

    function freezePlayer(p, source) {
      return Object.freeze({
        playerId: p.playerId,
        displayId: p.displayId,
        baseAvatarKey: p.baseAvatarKey,
        displayAvatarKey: p.displayAvatarKey || p.baseAvatarKey,
        createdAt: p.createdAt || null,
        mode: mode,
        handoffSource: source,
        /* 信任層級：ID＋圖案可找回的低信任識別。不能消費 V幣，也不是管理員 */
        trust: "low-recoverable-identity",
        canSpendVCoins: false,
        isAdmin: false
      });
    }

    function load(rawId, source) {
      var myEpoch = ++state.epoch;
      var c = classifyPlayerIdInput(rawId);
      // 先清掉上一位玩家的狀態（遊戲端的 reset 監聽也會被呼叫）
      if (state.player) emit("reset", { previousPlayerId: state.player.playerId });
      state.player = null;
      state.handoff = { source: source };
      if (!c.ok) {
        state.status = "error"; state.error = UniverseError(c.reason);
        emit("change", { status: state.status, player: null, error: state.error });
        return Promise.reject(state.error);
      }
      state.status = "loading"; state.error = null;
      emit("change", { status: "loading", player: null });
      return players.getPlayer(c.playerId).then(function (p) {
        if (myEpoch !== state.epoch) throw UniverseError("validation", { userMessage: "玩家已切換，忽略較舊的回應" });
        if (!p || p.playerId !== c.playerId) throw UniverseError("server", { userMessage: "玩家資料不一致，請重新進入" });
        state.player = freezePlayer(p, source);
        profiles[p.playerId] = { displayId: p.displayId, baseAvatarKey: p.baseAvatarKey, displayAvatarKey: p.displayAvatarKey || p.baseAvatarKey };
        state.status = "ready";
        sess.set(TAB_KEY, p.playerId);
        emit("change", { status: "ready", player: state.player });
        return state.player;
      }, function (err) {
        if (myEpoch !== state.epoch) throw err;
        var e = isUniverseError(err) ? err : UniverseError("server");
        state.status = "error"; state.error = e;
        if (e.kind === "notFound") sess.remove(TAB_KEY);
        emit("change", { status: "error", player: null, error: e });
        throw e;
      });
    }

    var avatarLabels = {};
    var session = {
      sdkVersion: SDK_VERSION,
      gameId: opts.gameId,
      gameVersion: opts.gameVersion || "",
      mode: mode,
      isSandbox: mode === "sandbox",
      modeLabel: mode === "sandbox" ? "Sandbox／Test Mode（模擬資料，不連線正式資料庫）" : "Production 玩家資料（唯讀）",
      services: services,
      start: function () { var h = readHandoff(); return load(h.raw, h.source); },
      switchPlayer: function (playerId) { return load(playerId, "switch"); },
      getPlayer: function () { return state.player; },
      getStatus: function () { return { status: state.status, error: state.error, handoff: state.handoff }; },
      onChange: function (fn) { listeners.change.push(fn); },
      onReset: function (fn) { listeners.reset.push(fn); },
      playerStore: playerStore,
      /* 回大廳（切換玩家請回大廳；遊戲內不建立身份） */
      lobbyUrl: function () { return (opts.lobbyUrl || "../../index.html") + (mode === "sandbox" ? "?sandbox=1" : ""); },
      /* 身份圖案：統一使用遊戲宇宙 assets/avatars/base/，清單以後端 active 為準 */
      avatars: {
        imageUrl: function (key) { return AVATAR_KEY_RE.test(String(key || "")) ? avatarBaseUrl + key + ".png" : ""; },
        label: function (key) { return avatarLabels[key] || ""; },
        loadList: function () {
          return players.listBaseAvatars().then(function (d) {
            (d && d.avatars || []).forEach(function (a) { avatarLabels[a.key] = a.label; });
            return d;
          });
        }
      },
      capabilities: function () {
        return {
          players: players.mode, wallet: services.wallet.mode, scores: services.scores.mode,
          leaderboard: services.leaderboard.mode, gameLogs: "notImplemented", titles: "notImplemented", avatarUnlocks: "notImplemented"
        };
      },
      /* 建立這一場的成績提交物件（submissionId 在開局時就固定，防止重複提交） */
      newScoreSubmission: function (o) {
        if (!state.player) throw UniverseError("missingPlayer");
        return buildScoreSubmission({
          submissionId: o && o.submissionId, playerId: state.player.playerId, gameId: opts.gameId,
          gameVersion: opts.gameVersion, mode: mode, startedAt: o && o.startedAt, finishedAt: o && o.finishedAt, scoreData: o && o.scoreData
        });
      },
      /* 清除這個分頁的 Mock 資料（測試用） */
      clearMockData: function () { store.clear(); }
    };
    return session;
  }

  return {
    SDK_VERSION: SDK_VERSION,
    DEFAULT_API_BASE: DEFAULT_API_BASE,
    GAME_IDS: GAME_IDS.slice(),
    DAILY_REWARD_AMOUNT: DAILY_REWARD_AMOUNT,
    ERROR_KINDS: ERROR_KINDS,
    UniverseError: UniverseError,
    isUniverseError: isUniverseError,
    isValidPlayerId: isValidPlayerId,
    looksLikeLegacyPlayerKey: looksLikeLegacyPlayerKey,
    classifyPlayerIdInput: classifyPlayerIdInput,
    taipeiDateKey: taipeiDateKey,
    createApiClient: createApiClient,
    createGameSession: createGameSession,
    buildScoreSubmission: buildScoreSubmission,
    validateScoreSubmission: validateScoreSubmission,
    SCORE_SCHEMAS: SCORE_SCHEMAS
  };
});

/* ==========================================================
   氣球小V遊戲宇宙 — 玩家資料層
   v0.3.0 新增；v0.3.4 改接遊戲宇宙共用玩家 API
   universe-lobby-v0.3.4-shared-player-avatar-expansion-test-1

   ■ 正式資料來源：Cloudflare Worker（MAP_CONFIG.player.apiBaseUrl）
       POST /v1/players            建立玩家（ID＋固定身份圖案）→ 伺服器產生 playerId
       POST /v1/players/resolve    用 ID＋身份圖案找回 playerId
       GET  /v1/players/:playerId  公開基本資料
       GET  /v1/avatars/base       後端開放的固定身份圖案清單
     大廳不再載入 Firebase SDK、不再連線舊專案 vparty-rhythm-game。
     API 失敗時只會顯示錯誤讓玩家重試，「絕不」退回舊 Firebase 建立身份。

   ■ 尚未接入的資料（V幣、稱號、展示頭像解鎖、遊戲紀錄）：
     data.features 全部為 false，畫面顯示「準備中／未開放」，不會假裝餘額是 0。

   ■ 本機記憶（v2 新鍵；舊 v1 鍵保留不讀不刪，舊身份不會被當成新玩家）：
       bvUniverse_v2_rememberedPlayers      這台裝置用過的玩家 [{ playerId, id, baseAvatarKey, displayAvatarKey, rememberedAt }]
       bvUniverse_v2_currentPlayerId        目前選用的玩家
       bvUniverse_v2_lobbyTutorialDone__{playerId}
     本機記憶只是方便，不是身份來源；每次切換都會向伺服器重新讀取。

   ■ ?sandbox=1：使用分頁內的「模擬 API」（sessionStorage），完全不連網，
     本機鍵也加上 Sandbox 前綴。在沙盒建立的玩家不存在於正式資料庫。

   ⚠ ID＋圖案屬於「低信任」的身份找回：知道這兩項就能找回同一個 playerId，
     不能當成未來 V幣消費的授權。
   ========================================================== */

(function () {
  "use strict";

  var CFG = window.MAP_CONFIG;
  var P = CFG.player;
  var ID = window.PlayerIdentity;
  var SANDBOX = /[?&]sandbox=1\b/.test(location.search);
  var LS_PREFIX = SANDBOX ? "bvUniverseSandbox_v2_" : "bvUniverse_v2_";
  var KEY_REMEMBERED = LS_PREFIX + "rememberedPlayers";
  var KEY_CURRENT = LS_PREFIX + "currentPlayerId";
  var KEY_TUTORIAL = LS_PREFIX + "lobbyTutorialDone__";
  var PLAYER_ID = /^p_[a-z2-7]{20}$/;

  /* ---------- 安全的本機存取 ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsJson(k, fallback) {
    try { var v = JSON.parse(lsGet(k)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.from(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }

  /* ==========================================================
     錯誤：統一成大廳看得懂的種類＋給孩子看的中文訊息
     ========================================================== */
  function StoreError(kind, userMessage, extra) {
    var e = new Error(userMessage);
    e.kind = kind;               // validation / rateLimited / network / server
    e.userMessage = userMessage;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  function errorFrom(res) {
    var err = res.body && res.body.error;
    if (res.status === 400 && err) {
      var field = err.details && err.details.errors && err.details.errors[0];
      return StoreError("validation", err.message || "資料格式不正確", { field: field && field.field, issue: field && field.issue });
    }
    if (res.status === 429) return StoreError("rateLimited", "現在太多人同時操作了，請等 1 分鐘再試一次");
    return StoreError("server", "伺服器暫時無法使用，請稍後再試", { status: res.status, code: err && err.code });
  }

  /* ==========================================================
     API 轉接：正式（Worker）或 Sandbox（分頁內模擬）
     兩者回傳相同格式：{ status, body }；網路錯誤丟 StoreError("network")
     ========================================================== */
  var RealApi = {
    mode: "api",
    label: "遊戲宇宙 API",
    request: function (method, path, body) {
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, P.apiTimeoutMs || 15000) : null;
      var init = { method: method, headers: { accept: "application/json" }, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" };
      if (ctrl) init.signal = ctrl.signal;
      if (body !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
      return fetch(P.apiBaseUrl + path, init).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) { return { status: res.status, body: json }; });
      }, function () {
        throw StoreError("network", "網路連線不穩定，請檢查網路後再試一次");
      }).finally(function () { if (timer) clearTimeout(timer); });
    }
  };

  /* 模擬 API：規則盡量與後端一致（NFKC、空白合併、1～20 字、保留字、ID＋圖案唯一），但只存在這個分頁 */
  var SandboxApi = {
    mode: "sandbox",
    label: "測試沙盒（模擬 API，不連線、不寫入正式資料庫）",
    _key: "bvUniverseSandbox_v2_api",
    _read: function () { try { return JSON.parse(sessionStorage.getItem(this._key)) || { identities: {}, players: {} }; } catch (e) { return { identities: {}, players: {} }; } },
    _write: function (db) { try { sessionStorage.setItem(this._key, JSON.stringify(db)); } catch (e) {} },
    _norm: function (raw) {
      if (typeof raw !== "string") return { ok: false, msg: "請輸入玩家 ID" };
      var s = raw.normalize("NFKC").replace(/[\s　]+/g, " ").trim();
      if (!s) return { ok: false, msg: "請輸入玩家 ID" };
      if (/[\u0000-\u001f\u007f​‌‎‏‪-‮⁠-⁤﻿]/.test(s)) return { ok: false, msg: "玩家 ID 裡有看不見或無法使用的特殊字元，請重新輸入" };
      var n = 0;
      try { var it = new Intl.Segmenter("zh-Hant", { granularity: "grapheme" }).segment(s); for (var x of it) n++; } catch (e) { n = Array.from(s).length; }
      if (n > 20) return { ok: false, msg: "玩家 ID 最多 20 個字" };
      if (s === "玩家") return { ok: false, msg: "「玩家」是遊戲的預設名稱，請換一個 ID" };
      return { ok: true, value: s, changed: s !== raw.trim() };
    },
    _pid: function () {
      var a = "abcdefghijklmnopqrstuvwxyz234567", b = new Uint8Array(20), s = "p_";
      crypto.getRandomValues(b); for (var i = 0; i < 20; i++) s += a[b[i] & 31];
      return s;
    },
    _pub: function (p) {
      return { playerId: p.playerId, displayId: p.displayId, baseAvatarKey: p.baseAvatarKey, displayAvatarKey: p.baseAvatarKey, createdAt: new Date(p.createdAt).toISOString() };
    },
    request: function (method, path, body) {
      var self = this;
      return new Promise(function (resolve) {
        setTimeout(function () {
          var db = self._read(), out;
          var bad = function (msg, issue) { return { status: 400, body: { ok: false, error: { code: "VALIDATION_FAILED", message: msg, details: { errors: [{ field: "displayId", issue: issue || "INVALID" }] } } } }; };
          if (method === "GET" && path === "/v1/avatars/base") {
            out = { status: 200, body: { ok: true, data: { catalogVersion: 2, avatars: ID.builtinAvatars.map(function (a) { return { key: a.key, label: a.label, order: a.order }; }) } } };
          } else if (method === "POST" && (path === "/v1/players" || path === "/v1/players/resolve")) {
            var n = self._norm(body.displayId);
            if (!n.ok) out = bad(n.msg);
            else if (!ID.isBuiltinAvatar(body.baseAvatarKey)) out = bad("請選擇一個身份圖案", "AVATAR_NOT_AVAILABLE");
            else {
              var key = n.value + "\u0000" + body.baseAvatarKey, rec = db.identities[key];
              if (path === "/v1/players/resolve") {
                out = rec ? { status: 200, body: { ok: true, data: { status: "found", displayIdChanged: n.changed, player: self._pub(db.players[rec.playerId]) } } }
                          : { status: 404, body: { ok: false, error: { code: "IDENTITY_NOT_FOUND", message: "找不到這位玩家，請確認玩家 ID 和當初選的身份圖案" } } };
              } else if (rec && rec.createRequestId === body.createRequestId) {
                out = { status: 200, body: { ok: true, data: { status: "created", replayed: true, displayIdChanged: n.changed, player: self._pub(db.players[rec.playerId]) } } };
              } else if (rec) {
                out = { status: 409, body: { ok: false, error: { code: "IDENTITY_EXISTS", message: "這個玩家 ID 和身份圖案已經有人使用", details: { canResolve: true } } } };
              } else {
                var p = { playerId: self._pid(), displayId: n.value, baseAvatarKey: body.baseAvatarKey, createdAt: Date.now() };
                db.identities[key] = { playerId: p.playerId, createRequestId: body.createRequestId };
                db.players[p.playerId] = p;
                self._write(db);
                out = { status: 201, body: { ok: true, data: { status: "created", replayed: false, displayIdChanged: n.changed, player: self._pub(p) } } };
              }
            }
          } else if (method === "GET" && path.indexOf("/v1/players/") === 0) {
            var pl = db.players[decodeURIComponent(path.slice(12))];
            out = pl ? { status: 200, body: { ok: true, data: { player: self._pub(pl) } } } : { status: 404, body: { ok: false, error: { code: "PLAYER_NOT_FOUND", message: "找不到這位玩家" } } };
          } else {
            out = { status: 404, body: { ok: false, error: { code: "NOT_FOUND", message: "找不到這個 API" } } };
          }
          resolve(out);
        }, 150);
      });
    }
  };

  var API = SANDBOX ? SandboxApi : RealApi;

  /* ---------- 伺服器回傳 → 大廳畫面用的玩家資料（只屬於這位玩家） ---------- */
  function toLobbyData(player) {
    var created = Date.parse(player.createdAt);
    return {
      playerId: player.playerId,
      id: player.displayId,
      baseAvatarKey: player.baseAvatarKey,
      displayAvatarKey: ID.isDisplayAvatarAllowed(player.displayAvatarKey) ? player.displayAvatarKey : player.baseAvatarKey,
      createdAt: isFinite(created) ? created : null,
      // 尚未接入的功能：明確標示「沒有資料來源」，不是 0 或空清單
      features: { wallet: false, titles: false, avatarUnlocks: false, records: false },
      balance: null,
      title: null,
      unlockedAvatars: {},
      unlockedAvatarKeys: [],
      unlockedTitles: []
    };
  }

  /* ---------- 固定身份圖案清單（讀到後才開放新款；失敗時維持原有 17 款） ---------- */
  var avatarsPromise = null;
  function loadBaseAvatars() {
    if (!avatarsPromise) {
      avatarsPromise = API.request("GET", "/v1/avatars/base").then(function (res) {
        if (res.status !== 200 || !res.body || !res.body.ok) throw errorFrom(res);
        var keys = res.body.data.avatars.map(function (a) { return a.key; });
        ID.setServerActiveKeys(keys);
        return keys;
      }).catch(function (e) {
        avatarsPromise = null; // 下次再試
        console.warn("[PlayerStore] 身份圖案清單讀取失敗，暫時只顯示原有 17 款：", e && e.message);
        return null;
      });
    }
    return avatarsPromise;
  }

  /* ==========================================================
     建立玩家
     同一組 ID＋圖案在「同一次建立」中重試（例如逾時後再按一次）會沿用同一個 createRequestId，
     伺服器認得是同一個請求，不會建立第二位玩家。
     ========================================================== */
  var pendingCreate = {};   // "ID␀圖案" → createRequestId

  function createPlayer(id, baseAvatarKey) {
    var k = id + "\u0000" + baseAvatarKey;
    var rid = pendingCreate[k] || (pendingCreate[k] = uuid());
    return API.request("POST", "/v1/players", { displayId: id, baseAvatarKey: baseAvatarKey, createRequestId: rid }).then(function (res) {
      var b = res.body;
      if ((res.status === 201 || res.status === 200) && b && b.ok) {
        delete pendingCreate[k];
        return { status: "created", replayed: !!b.data.replayed, displayIdChanged: !!b.data.displayIdChanged, data: toLobbyData(b.data.player) };
      }
      if (res.status === 409 && b && b.error && b.error.code === "IDENTITY_EXISTS") {
        delete pendingCreate[k];
        return { status: "duplicate" };
      }
      var e = errorFrom(res);
      if (e.kind === "validation") delete pendingCreate[k];
      throw e;
    });
  }

  /* ---------- 找回玩家（我玩過了） ---------- */
  function resolvePlayer(id, baseAvatarKey) {
    return API.request("POST", "/v1/players/resolve", { displayId: id, baseAvatarKey: baseAvatarKey }).then(function (res) {
      var b = res.body;
      if (res.status === 200 && b && b.ok) return { status: "found", displayIdChanged: !!b.data.displayIdChanged, data: toLobbyData(b.data.player) };
      if (res.status === 404 && b && b.error && b.error.code === "IDENTITY_NOT_FOUND") return { status: "notFound" };
      throw errorFrom(res);
    });
  }

  /* ---------- 讀取一位玩家（切換玩家、重新整理後） ---------- */
  function loadPlayerData(playerId) {
    if (!PLAYER_ID.test(String(playerId))) return Promise.resolve({ status: "notFound" });
    return API.request("GET", "/v1/players/" + encodeURIComponent(playerId)).then(function (res) {
      var b = res.body;
      if (res.status === 200 && b && b.ok) return { status: "ok", data: toLobbyData(b.data.player) };
      if (res.status === 404) return { status: "notFound" };
      throw errorFrom(res);
    });
  }

  /* ==========================================================
     本機記憶（只寫大廳自己的 v2 鍵）
     ========================================================== */
  function getRemembered() {
    var list = lsJson(KEY_REMEMBERED, []);
    return Array.isArray(list) ? list.filter(function (p) { return p && PLAYER_ID.test(String(p.playerId)) && p.id && ID.isBuiltinAvatar(p.baseAvatarKey); }) : [];
  }
  function remember(entry) {
    var list = getRemembered();
    var i = list.findIndex(function (p) { return p.playerId === entry.playerId; });
    var row = {
      playerId: entry.playerId,
      id: entry.id,
      baseAvatarKey: entry.baseAvatarKey,
      displayAvatarKey: entry.displayAvatarKey || entry.baseAvatarKey,
      rememberedAt: (i >= 0 && list[i].rememberedAt) || Date.now()
    };
    if (i >= 0) list[i] = row; else list.push(row);
    lsSet(KEY_REMEMBERED, JSON.stringify(list));
    return list;
  }
  function getCurrentPlayerId() { var v = lsGet(KEY_CURRENT); return PLAYER_ID.test(String(v)) ? v : null; }
  function setCurrentPlayerId(id) { if (PLAYER_ID.test(String(id))) lsSet(KEY_CURRENT, id); }
  function tutorialDone(id) { return lsGet(KEY_TUTORIAL + id) === "1"; }
  function markTutorialDone(id) { lsSet(KEY_TUTORIAL + id, "1"); }

  /* 這台裝置上是否有「舊系統」（v0.3.3 大廳）的玩家紀錄 —— 只用來提示，不讀取、不匯入、不刪除 */
  function hasLegacyLocalPlayers() {
    if (SANDBOX) return false;
    var old = lsJson("bvUniverse_rememberedPlayers_v1", []);
    return Array.isArray(old) && old.length > 0;
  }

  /* ==========================================================
     身份交接（大廳端介面，本版只產生測試資料，不會自動跳轉）
     ⚠ 這只是「告訴遊戲現在是誰」，屬於低信任資訊，不是登入證明，也不能用於 V幣消費。
     ⚠ 四款遊戲目前都還不能接收 playerId，需要後續改版。
     ========================================================== */
  var Handoff = {
    payload: function (player, gameId) {
      if (!player) return null;
      return {
        type: "bv-universe-identity",
        version: 2,
        trust: "recoverable-identity",
        gameId: gameId || "",
        playerId: player.playerId,
        id: player.id,
        baseAvatarKey: player.baseAvatarKey,
        displayAvatarKey: player.displayAvatarKey,
        issuedAt: Date.now()
      };
    },
    launchUrl: function (player, gameId) {
      var url = P.gameUrls[gameId];
      if (!url || !player) return "";
      // Sandbox 大廳進入的遊戲也維持 Sandbox（只讀分頁內模擬玩家，不連 API）
      return url + "?bvPlayerId=" + encodeURIComponent(player.playerId) + (SANDBOX ? "&sandbox=1" : "");
    },
    /* 給未來 iframe 整合用：只送到指定 origin，不用 "*" */
    postToFrame: function (frameWindow, targetOrigin, player, gameId) {
      if (!frameWindow || !targetOrigin || targetOrigin === "*") return false;
      frameWindow.postMessage(this.payload(player, gameId), targetOrigin);
      return true;
    },
    /* v0.3.4 起停用：舊遊戲讀的共用鍵 vPartyPlayerProfile 是舊身份格式，不再寫入 */
    writeSharedProfile: function () { return false; }
  };

  window.PlayerStore = {
    sandbox: SANDBOX,
    mode: API.mode,
    sourceLabel: API.label,
    ready: function () { return Promise.resolve(true); },
    loadBaseAvatars: loadBaseAvatars,
    createPlayer: createPlayer,
    resolvePlayer: resolvePlayer,
    loadPlayerData: loadPlayerData,
    getRemembered: getRemembered,
    remember: remember,
    getCurrentPlayerId: getCurrentPlayerId,
    setCurrentPlayerId: setCurrentPlayerId,
    tutorialDone: tutorialDone,
    markTutorialDone: markTutorialDone,
    hasLegacyLocalPlayers: hasLegacyLocalPlayers,
    handoff: Handoff
  };
})();

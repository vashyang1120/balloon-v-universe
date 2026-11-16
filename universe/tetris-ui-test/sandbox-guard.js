/* ==========================================================
   氣球小V方塊派對 UI 測試版 — Sandbox 強制隔離（tetris-universe-ui-v0.1.0-test-1）

   這個檔案必須在 universe-sdk.js 之前載入。它不依賴網址參數：
   不論網址有沒有 ?sandbox=1，本測試版永遠是 Sandbox。

   隔離分四層（任何一層單獨失效，其他層仍會擋住）：
     1. universe-shell.js 建立 Session 時寫死 mode:"sandbox"、services 全部 mock
     2. SDK 的 API Client 改用這裡的 blockedFetch（永遠拒絕，不送出任何請求）
     3. SDK 的 API 網址改成不存在的 https://sandbox.invalid
     4. 全頁網路防護：fetch／XMLHttpRequest／sendBeacon／WebSocket／EventSource
        - 遊戲宇宙 API（workers.dev）、Firebase、Google 登入網域：一律封鎖（GET 也封鎖）
        - 其他網址：只允許 GET／HEAD，而且只限本站與 vashyang1120.github.io（遊戲素材、歌曲清單）
   被封鎖的請求會記在 window.BVUiTestSandbox.blocked（測試用），並在 Console 警告。

   玩家：一律使用 Sandbox 測試玩家，不會讀取任何正式玩家資料。
     - 網址的 bvPlayerId 只有在「同一分頁的沙盒大廳」建立過時才使用
     - 其他情況（沒有參數、正式玩家代碼、找不到）→ 固定的示範玩家「UI測試員」
   ========================================================== */
(function () {
  "use strict";

  var DEMO_PLAYER = Object.freeze({
    playerId: "p_uitestsandboxplayera",
    displayId: "UI測試員",
    baseAvatarKey: "boy1",
    displayAvatarKey: "boy1",
    createdAt: "2026-11-16T00:00:00.000Z"
  });
  var LOBBY_SANDBOX_DB_KEY = "bvUniverseSandbox_v2_api";   // 與 universe-sdk.js 相同（沙盒大廳在同一分頁建立的模擬玩家）
  var BLOCKED_API_BASE = "https://sandbox.invalid";

  var BLOCK_HOST_RE = /(^|\.)(workers\.dev|firebaseio\.com|firebasedatabase\.app|firebaseapp\.com|googleapis\.com|gstatic\.com|google\.com|cloudfunctions\.net|sandbox\.invalid)$/i;
  var READ_ALLOWED_ORIGINS = [location.origin, "https://vashyang1120.github.io"];

  var blocked = [];
  function record(kind, method, url, reason) {
    var item = { kind: kind, method: String(method || "GET").toUpperCase(), url: String(url), reason: reason, at: Date.now() };
    blocked.push(item);
    try { console.warn("[UI 測試版 Sandbox] 已封鎖網路請求：", item.kind, item.method, item.url, "（" + reason + "）"); } catch (e) {}
    return item;
  }

  /* 判斷一個請求能不能送出；回傳 null＝允許，字串＝封鎖原因 */
  function verdict(method, rawUrl) {
    var m = String(method || "GET").toUpperCase();
    var u;
    try { u = new URL(String(rawUrl), location.href); } catch (e) { return "網址無法解析"; }
    if (u.protocol === "data:" || u.protocol === "blob:") return null;
    if (BLOCK_HOST_RE.test(u.hostname)) return "正式後端／資料庫網域";
    if (m !== "GET" && m !== "HEAD") return "Sandbox 不允許寫入請求（" + m + "）";
    if (READ_ALLOWED_ORIGINS.indexOf(u.origin) < 0) return "不在允許的唯讀來源";
    return null;
  }

  function blockedError(reason) {
    var e = new TypeError("UI 測試版 Sandbox：已封鎖網路請求（" + reason + "）");
    e.bvSandboxBlocked = true;
    return e;
  }

  /* ---------- fetch ---------- */
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && typeof input === "object" && input.method) || "GET";
      var why = verdict(method, url);
      if (why) { record("fetch", method, url, why); return Promise.reject(blockedError(why)); }
      return nativeFetch(input, init);
    };
  }

  /* ---------- XMLHttpRequest ---------- */
  if (window.XMLHttpRequest) {
    var XP = window.XMLHttpRequest.prototype;
    var nativeOpen = XP.open, nativeSend = XP.send;
    XP.open = function (method, url) {
      this.__bvSandboxWhy = verdict(method, url);
      this.__bvSandboxReq = { method: method, url: url };
      return nativeOpen.apply(this, arguments);
    };
    XP.send = function () {
      if (this.__bvSandboxWhy) {
        record("xhr", this.__bvSandboxReq.method, this.__bvSandboxReq.url, this.__bvSandboxWhy);
        try { this.abort(); } catch (e) {}
        throw blockedError(this.__bvSandboxWhy);
      }
      return nativeSend.apply(this, arguments);
    };
  }

  /* ---------- sendBeacon（一定是 POST） ---------- */
  if (navigator.sendBeacon) {
    var nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      var why = verdict("POST", url);
      if (why) { record("beacon", "POST", url, why); return false; }
      return nativeBeacon(url, data);
    };
  }

  /* ---------- WebSocket／EventSource（本遊戲不需要，一律封鎖） ---------- */
  ["WebSocket", "EventSource"].forEach(function (name) {
    if (!window[name]) return;
    window[name] = function (url) {
      record(name, "OPEN", url, "Sandbox 不允許即時連線");
      throw blockedError("Sandbox 不允許即時連線");
    };
  });

  /* SDK 專用：永遠拒絕（API Client 連一個位元組都送不出去） */
  function blockedFetch(url, init) {
    var why = "SDK API Client 在 Sandbox 測試版一律停用";
    record("sdk", init && init.method, url, why);
    return Promise.reject(blockedError(why));
  }

  /* 只有同一分頁沙盒大廳建立的玩家可以沿用；其他一律改用示範玩家 */
  function sandboxLobbyHas(playerId) {
    try {
      var db = JSON.parse(sessionStorage.getItem(LOBBY_SANDBOX_DB_KEY) || "null");
      return !!(db && db.players && db.players[playerId]);
    } catch (e) { return false; }
  }

  function sessionLocation() {
    var params = new URLSearchParams(location.search || "");
    var asked = params.get("bvPlayerId");
    var pid = asked && sandboxLobbyHas(asked) ? asked : DEMO_PLAYER.playerId;
    var p = new URLSearchParams();
    p.set("sandbox", "1");
    p.set("bvPlayerId", pid);
    return {
      search: "?" + p.toString(),
      href: location.href,
      assign: function (u) { location.assign(u); }
    };
  }

  window.BVUiTestSandbox = Object.freeze({
    forced: true,
    demoPlayer: DEMO_PLAYER,
    blockedApiBase: BLOCKED_API_BASE,
    blocked: blocked,
    verdict: verdict,
    blockedFetch: blockedFetch,
    sessionLocation: sessionLocation,
    /* 給 universe-shell.js 的 createGameSession 參數（寫死 Sandbox） */
    sessionOptions: function () {
      return {
        mode: "sandbox",
        services: { scores: "mock", leaderboard: "mock" },
        apiBaseUrl: BLOCKED_API_BASE,
        fetch: blockedFetch,
        allowLobbyFallback: false,
        mockPlayers: [DEMO_PLAYER],
        location: sessionLocation()
      };
    }
  });
})();

/* ==========================================================
   氣球小V遊戲宇宙 — 玩家資料層（v0.3.0 新增）
   balloon-v-universe-v0.3.0-unified-player-lobby-test-1

   ■ 資料來源：與四款遊戲相同的 Firebase Realtime Database
       players/{playerKey}/profile            { id, name, playerKey, baseAvatarKey, displayAvatarKey, avatarKey, createdAt, updatedAt }
       players/{playerKey}/wallet/balance     V幣餘額
       players/{playerKey}/equippedTitle      目前稱號（遊戲優先讀這裡）
       players/{playerKey}/quizEquippedTitle  舊版問答稱號（遊戲的備援讀法）
       players/{playerKey}/unlockedAvatars    已解鎖頭像 { key: { unlocked: true, ... } }
       players/{playerKey}/titles/{gameId}    各遊戲已解鎖稱號
       players/{playerKey}/quizTitles         問答遊戲稱號（舊路徑）
       avatarCatalog                          頭像目錄（只讀）

   ■ 大廳「唯一」會寫入 Firebase 的地方：
       建立新玩家時，用 transaction 寫入 players/{playerKey}/profile，
       而且只有在 profile 完全不存在時才會寫入（存在就自動放棄）。
       欄位與四款遊戲建立 profile 時完全相同，不新增任何欄位。
       大廳不會寫入 V幣、稱號、收藏、遊戲紀錄。

   ■ 本機記憶（大廳自己的鍵，不會覆蓋四款遊戲的本機資料）：
       bvUniverse_rememberedPlayers_v1   本機記住的玩家清單
       bvUniverse_currentPlayerKey_v1    目前選用的玩家
       bvUniverse_lobbyTutorialDone_v1__{playerKey}  大廳教學是否看過

   ■ ?sandbox=1 測試沙盒：
       使用分頁內的記憶體資料庫，不連線 Firebase，本機鍵也加上 Sandbox 前綴。
   ========================================================== */

(function () {
  "use strict";

  var CFG = window.MAP_CONFIG;
  var P = CFG.player;
  var ID = window.PlayerIdentity;
  var SANDBOX = /[?&]sandbox=1\b/.test(location.search);
  var LS_PREFIX = SANDBOX ? "bvUniverseSandbox_" : "bvUniverse_";
  var KEY_REMEMBERED = LS_PREFIX + "rememberedPlayers_v1";
  var KEY_CURRENT = LS_PREFIX + "currentPlayerKey_v1";
  var KEY_TUTORIAL = LS_PREFIX + "lobbyTutorialDone_v1__";

  /* ---------- 安全的本機存取 ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsJson(k, fallback) {
    try { var v = JSON.parse(lsGet(k)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }

  /* ==========================================================
     資料庫轉接：Firebase（正式）或 Sandbox（記憶體）
     兩者提供相同介面：ready() / get(path) / createIfAbsent(path, value)
     ========================================================== */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("無法載入 " + src)); };
      document.head.appendChild(s);
    });
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error((label || "操作") + "逾時")); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  var FirebaseAdapter = {
    mode: "firebase",
    _db: null,
    _ready: null,
    ready: function () {
      var self = this;
      if (self._ready) return self._ready;
      var v = P.firebaseSdkVersion;
      var base = "https://www.gstatic.com/firebasejs/" + v + "/";
      self._ready = loadScript(base + "firebase-app-compat.js")
        .then(function () { return loadScript(base + "firebase-auth-compat.js"); })
        .then(function () { return loadScript(base + "firebase-database-compat.js"); })
        .then(function () {
          if (!firebase.apps.length) firebase.initializeApp(P.firebaseConfig);
          // 與四款遊戲相同：匿名登入後才讀寫
          return withTimeout(firebase.auth().signInAnonymously(), 15000, "匿名登入");
        })
        .then(function () { self._db = firebase.database(); return true; })
        .catch(function (e) { self._ready = null; throw e; });
      return self._ready;
    },
    get: function (path) {
      var self = this;
      return self.ready().then(function () {
        return withTimeout(self._db.ref(path).once("value"), 15000, "讀取");
      }).then(function (snap) { return snap.val(); });
    },
    /* 只有節點不存在時才寫入；存在時放棄，回傳 { created: false } */
    createIfAbsent: function (path, value) {
      var self = this;
      return self.ready().then(function () {
        return withTimeout(self._db.ref(path).transaction(function (current) {
          if (current === null) return value;
          return; // undefined = 放棄，不改動既有資料
        }, undefined, false), 20000, "建立");
      }).then(function (res) { return { created: !!(res && res.committed) }; });
    }
  };

  var SandboxAdapter = {
    mode: "sandbox",
    _key: "bvUniverseSandbox_db",
    _read: function () { try { return JSON.parse(sessionStorage.getItem(this._key)) || {}; } catch (e) { return {}; } },
    _write: function (db) { try { sessionStorage.setItem(this._key, JSON.stringify(db)); } catch (e) {} },
    _at: function (db, path) {
      return path.split("/").reduce(function (node, part) { return node == null ? null : (node[part] == null ? null : node[part]); }, db);
    },
    ready: function () { return Promise.resolve(true); },
    get: function (path) {
      var self = this;
      return new Promise(function (r) { setTimeout(function () { r(JSON.parse(JSON.stringify(self._at(self._read(), path)))); }, 120); });
    },
    createIfAbsent: function (path, value) {
      var self = this;
      return new Promise(function (r) {
        setTimeout(function () {
          var db = self._read();
          if (self._at(db, path) !== null) return r({ created: false });
          var parts = path.split("/"), node = db;
          for (var i = 0; i < parts.length - 1; i++) { node[parts[i]] = node[parts[i]] || {}; node = node[parts[i]]; }
          node[parts[parts.length - 1]] = value;
          self._write(db);
          r({ created: true });
        }, 200);
      });
    }
  };

  var DB = SANDBOX ? SandboxAdapter : FirebaseAdapter;

  function playerPath(key, sub) { return P.playersPath + "/" + key + (sub ? "/" + sub : ""); }

  /* ---------- 頭像目錄（只讀，失敗不影響其他功能） ---------- */
  var catalogPromise = null;
  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = DB.get("avatarCatalog").then(function (cat) {
        ID.setRemoteCatalog(cat || {});
      }).catch(function (e) { console.warn("[PlayerStore] avatarCatalog 讀取失敗：", e.message); });
    }
    return catalogPromise;
  }

  /* ==========================================================
     身份是否存在
     只要下列任何一個節點有資料，就視為「這組 ID＋圖案已經有人使用」，
     包含沒有 profile 但已有其他遊戲資料的早期玩家。
     ========================================================== */
  var EXIST_PROBES = ["profile", "wallet", "unlockedAvatars", "equippedTitle", "quizEquippedTitle", "titles", "quizTitles", "quizProgress"];

  function identityExists(playerKey) {
    return Promise.all(EXIST_PROBES.map(function (sub) { return DB.get(playerPath(playerKey, sub)); }))
      .then(function (vals) { return vals.some(function (v) { return v !== null && v !== undefined; }); });
  }

  /* ---------- 建立新玩家：與遊戲建立 profile 的欄位完全相同 ---------- */
  function createPlayer(id, baseAvatarKey) {
    if (!ID.isBuiltinAvatar(baseAvatarKey)) return Promise.reject(new Error("身份圖案必須是內建頭像"));
    var playerKey = ID.makePlayerKey(id, baseAvatarKey);
    return identityExists(playerKey).then(function (exists) {
      if (exists) return { status: "duplicate", playerKey: playerKey };
      var now = Date.now();
      var profile = {
        id: id,
        name: id,
        playerKey: playerKey,
        baseAvatarKey: baseAvatarKey,
        displayAvatarKey: baseAvatarKey,
        avatarKey: baseAvatarKey,
        createdAt: now,
        updatedAt: now
      };
      return DB.createIfAbsent(playerPath(playerKey, "profile"), profile).then(function (res) {
        // 放棄寫入 = 同時間有別人建立了同一組身份 → 一律當作重複處理
        if (!res.created) return { status: "duplicate", playerKey: playerKey };
        return { status: "created", playerKey: playerKey, profile: profile };
      });
    });
  }

  /* ==========================================================
     讀取一位玩家的完整資料（只讀）
     回傳的物件只屬於這位玩家，畫面只從這個物件顯示，避免兩人資料混用。
     ========================================================== */
  function normalizeTitle(raw) {
    if (!raw) return null;
    var name = raw.name || raw.title || raw.label || "";
    if (!name) return null;
    return { titleKey: raw.titleKey || raw.key || raw.id || "", name: String(name), gameId: raw.gameId || "" };
  }
  function isUnlockedRecord(rec) {
    if (rec === true) return true;
    if (!rec) return false;
    return rec.unlocked === true || rec.claimed === true || rec.owned === true || rec.active === true;
  }

  function loadPlayerData(playerKey, fallbackIdentity) {
    var subs = ["profile", "wallet/balance", "equippedTitle", "quizEquippedTitle", "unlockedAvatars", "titles", "quizTitles"];
    return Promise.all([loadCatalog()].concat(subs.map(function (s) { return DB.get(playerPath(playerKey, s)); })))
      .then(function (r) {
        var profile = r[1], balance = r[2], eq = r[3], quizEq = r[4], unlocked = r[5] || {}, titles = r[6] || {}, quizTitles = r[7] || {};
        var hasAny = profile || balance != null || eq || quizEq || r[5] || r[6] || r[7];
        if (!hasAny) return { status: "notFound", playerKey: playerKey };

        var fb = fallbackIdentity || {};
        var id = (profile && profile.id) || fb.id || "";
        var base = (profile && profile.baseAvatarKey) || fb.baseAvatarKey || "";
        // 與遊戲相同：雲端 displayAvatarKey 必須通過驗證才使用，否則退回身份圖案
        var cloudDisplay = profile && (profile.displayAvatarKey || profile.avatarKey);
        var display = ID.isDisplayAvatarAllowed(cloudDisplay, unlocked) ? cloudDisplay : base;

        // 與遊戲相同：先讀 equippedTitle，沒有才讀 quizEquippedTitle
        var title = normalizeTitle(eq) || normalizeTitle(quizEq);
        var bal = Number(balance);

        var unlockedTitles = [];
        P.gameIds.forEach(function (g) {
          var group = titles[g] || {};
          Object.keys(group).forEach(function (k) {
            if (isUnlockedRecord(group[k])) unlockedTitles.push({ gameId: g, titleKey: k, name: (group[k] && group[k].name) || k });
          });
        });
        Object.keys(quizTitles).forEach(function (k) {
          var rec = quizTitles[k];
          if (!isUnlockedRecord(rec) && !(rec && rec.name)) return;
          var dup = unlockedTitles.some(function (t) { return t.gameId === "quiz" && t.titleKey === k; });
          if (!dup) unlockedTitles.push({ gameId: "quiz", titleKey: k, name: (rec && rec.name) || k });
        });

        var unlockedAvatarKeys = Object.keys(unlocked).filter(function (k) { return unlocked[k] && unlocked[k].unlocked; });

        return {
          status: "ok",
          data: {
            playerKey: playerKey,
            id: id,
            baseAvatarKey: base,
            displayAvatarKey: display,
            hasProfile: !!profile,
            createdAt: profile && profile.createdAt || null,
            balance: isFinite(bal) && balance !== null ? bal : 0,
            balanceExists: balance !== null && balance !== undefined,
            title: title,
            unlockedAvatars: unlocked,
            unlockedAvatarKeys: unlockedAvatarKeys,
            unlockedTitles: unlockedTitles
          }
        };
      });
  }

  /* ==========================================================
     本機記憶（只寫大廳自己的鍵）
     ========================================================== */
  function getRemembered() {
    var list = lsJson(KEY_REMEMBERED, []);
    return Array.isArray(list) ? list.filter(function (p) { return p && p.playerKey && p.id && p.baseAvatarKey; }) : [];
  }
  function remember(entry) {
    var list = getRemembered();
    var i = list.findIndex(function (p) { return p.playerKey === entry.playerKey; });
    var row = {
      playerKey: entry.playerKey,
      id: entry.id,
      baseAvatarKey: entry.baseAvatarKey,
      displayAvatarKey: entry.displayAvatarKey || entry.baseAvatarKey,
      rememberedAt: (i >= 0 && list[i].rememberedAt) || Date.now()
    };
    if (i >= 0) list[i] = row; else list.push(row);
    lsSet(KEY_REMEMBERED, JSON.stringify(list));
    return list;
  }
  function getCurrentKey() { return lsGet(KEY_CURRENT); }
  function setCurrentKey(k) { lsSet(KEY_CURRENT, k); }
  function tutorialDone(k) { return lsGet(KEY_TUTORIAL + k) === "1"; }
  function markTutorialDone(k) { lsSet(KEY_TUTORIAL + k, "1"); }

  /* 讀取這台裝置上「四款遊戲」本機記住的身份（只讀，不修改任何遊戲資料）
     僅在同一網域（vashyang1120.github.io）下才讀得到。 */
  function detectGameLocalIdentities() {
    var found = [];
    function add(id, base, source) {
      id = (id || "").trim();
      if (!id || id === "玩家" || id === "Player" || !ID.isBuiltinAvatar(base)) return;
      var key = ID.makePlayerKey(id, base);
      var row = found.find(function (f) { return f.playerKey === key; });
      if (row) { if (row.sources.indexOf(source) < 0) row.sources.push(source); }
      else found.push({ playerKey: key, id: id, baseAvatarKey: base, sources: [source] });
    }
    var shared = lsJson("vPartyPlayerProfile", null);
    if (shared) add(shared.id, shared.baseAvatarKey, "共用紀錄");
    add(lsGet("vquiz_playerId"), lsGet("vquiz_baseAvatarKey"), "知識挑戰");
    add(lsGet("vtetris_playerId"), lsGet("vtetris_baseAvatarKey"), "方塊派對");
    var adv = lsJson("balloonVAdventurePlayerProfile", null);
    if (adv) add(adv.id, adv.baseAvatarKey, "派對島大作戰");
    return found;
  }

  /* ==========================================================
     身份交接（大廳端介面，本版只產生測試資料，不會自動跳轉）
     ⚠ 這些資料只是「告訴遊戲現在是誰」，不是安全的登入證明。
     ⚠ 四款遊戲目前都沒有接收外部 playerKey 的程式，需要後續修改遊戲。
     ========================================================== */
  var Handoff = {
    payload: function (player, gameId) {
      if (!player) return null;
      return {
        type: "bv-universe-identity",
        version: 1,
        gameId: gameId || "",
        playerKey: player.playerKey,
        id: player.id,
        baseAvatarKey: player.baseAvatarKey,
        displayAvatarKey: player.displayAvatarKey,
        issuedAt: Date.now()
      };
    },
    launchUrl: function (player, gameId) {
      var url = P.gameUrls[gameId];
      if (!url || !player) return "";
      return url + "?bvPlayerKey=" + encodeURIComponent(player.playerKey);
    },
    /* 給未來 iframe 整合用：只送到指定 origin，不用 "*" */
    postToFrame: function (frameWindow, targetOrigin, player, gameId) {
      if (!frameWindow || !targetOrigin || targetOrigin === "*") return false;
      frameWindow.postMessage(this.payload(player, gameId), targetOrigin);
      return true;
    },
    /* 共用鍵 vPartyPlayerProfile：預設關閉（見 zones.js player.writeSharedProfileKey） */
    writeSharedProfile: function (player) {
      if (!P.writeSharedProfileKey || SANDBOX || !player) return false;
      return lsSet("vPartyPlayerProfile", JSON.stringify({
        id: player.id, baseAvatarKey: player.baseAvatarKey,
        displayAvatarKey: player.displayAvatarKey, avatarKey: player.displayAvatarKey, playerKey: player.playerKey
      }));
    }
  };

  window.PlayerStore = {
    sandbox: SANDBOX,
    mode: DB.mode,
    ready: function () { return DB.ready(); },
    identityExists: identityExists,
    createPlayer: createPlayer,
    loadPlayerData: loadPlayerData,
    getRemembered: getRemembered,
    remember: remember,
    getCurrentKey: getCurrentKey,
    setCurrentKey: setCurrentKey,
    tutorialDone: tutorialDone,
    markTutorialDone: markTutorialDone,
    detectGameLocalIdentities: detectGameLocalIdentities,
    handoff: Handoff
  };
})();

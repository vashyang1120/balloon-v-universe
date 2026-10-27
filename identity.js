/* ==========================================================
   氣球小V遊戲宇宙 — 玩家身份工具（v0.3.0 新增）
   balloon-v-universe-v0.3.0-unified-player-lobby-test-1

   ⚠ 本檔的 normalizePlayerId / encodeFirebaseKeyPart / makePlayerKey
     逐字取自節奏遊戲、方塊遊戲、問答遊戲（三款完全相同的實作），
     不可自行修改，否則大廳產生的 playerKey 會和遊戲不一致。

     來源：
       vparty-rhythm-game/index.html  normalizePlayerId / makePlayerKey / encodeFirebaseKeyPart
       vparty-tetris/index.html       同上
       vparty-quiz-game/main.js       同上

   身份定義：
     playerKey      = encodeFirebaseKeyPart(ID) + "__" + baseAvatarKey
     baseAvatarKey  = 固定身份圖案（建立後不可改，只能是 17 個內建頭像之一）
     displayAvatarKey = 可更換的展示頭像（內建頭像，或已解鎖的特殊頭像）
   ========================================================== */

(function () {
  "use strict";

  var P = window.MAP_CONFIG.player;

  /* ---------- 以下三個函式與遊戲逐字相同 ---------- */
  function normalizePlayerId(id) {
    return (id || '').trim() || '玩家';
  }

  function encodeFirebaseKeyPart(s) {
    return encodeURIComponent(normalizePlayerId(s))
      .replace(/\./g, '%2E')
      .replace(/#/g, '%23')
      .replace(/\$/g, '%24')
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D');
  }

  function makePlayerKey(id, baseAvatarKey) {
    return encodeFirebaseKeyPart(id) + '__' + (baseAvatarKey || 'boy1');
  }
  /* ---------- 以上三個函式與遊戲逐字相同 ---------- */

  var builtin = P.builtinAvatars.map(function (a) { return { key: a[0], label: a[1] }; });
  var builtinByKey = {};
  builtin.forEach(function (a) { builtinByKey[a.key] = a; });
  var unlockableByKey = {};
  P.unlockableAvatars.forEach(function (a) { unlockableByKey[a[0]] = { key: a[0], label: a[1] }; });

  var remoteCatalog = {};   // Firebase avatarCatalog（只讀，由 player-store 載入）

  function isBuiltinAvatar(key) { return !!builtinByKey[key]; }

  /* 與遊戲 resolveAvatarSrc 相同規則：相對路徑一律指向節奏遊戲的頭像資料夾 */
  function resolveAvatarSrc(src) {
    if (!src) return "";
    var s = String(src);
    if (/^https?:\/\//.test(s)) return s;
    var base = P.avatarBaseUrl.replace(/assets\/avatars\/$/, "");
    if (s.indexOf("../assets/avatars/") === 0) return base + s.slice(3);
    if (s.indexOf("./assets/avatars/") === 0) return base + s.slice(2);
    if (s.indexOf("assets/avatars/") === 0) return base + s;
    return s;
  }

  /* 與遊戲 getAvatarByKey 相同的查找順序：內建 → 固定解鎖 → avatarCatalog → 玩家解鎖資料 */
  function avatarSrc(key, unlockedAvatars) {
    if (!key) return "";
    if (builtinByKey[key] || unlockableByKey[key]) return P.avatarBaseUrl + key + ".png";
    var cat = remoteCatalog[key];
    if (cat && cat.file) return resolveAvatarSrc(cat.file);
    var u = unlockedAvatars && unlockedAvatars[key];
    if (u && u.file) return resolveAvatarSrc(u.file);
    return "";
  }

  function avatarLabel(key) {
    if (builtinByKey[key]) return builtinByKey[key].label;
    if (unlockableByKey[key]) return unlockableByKey[key].label;
    var cat = remoteCatalog[key];
    if (cat && (cat.name || cat.label)) return String(cat.name || cat.label);
    return key || "";
  }

  /* 與遊戲 isDisplayAvatarAllowed 相同：內建永遠允許；其他必須 unlockedAvatars[key].unlocked === true */
  function isDisplayAvatarAllowed(key, unlockedAvatars) {
    if (!key) return false;
    if (isBuiltinAvatar(key)) return true;
    var u = unlockedAvatars && unlockedAvatars[key];
    return !!(u && u.unlocked);
  }

  /* 大廳輸入檢查（只做大廳端限制，不改變 ID 本身的編碼方式） */
  function validateNewId(raw) {
    var id = (raw || "").trim();
    if (!id) return { ok: false, msg: "請輸入玩家 ID" };
    if (id === "玩家") return { ok: false, msg: "「玩家」是遊戲的預設名稱，請換一個 ID" };
    if (Array.from(id).length > P.idMaxLength) return { ok: false, msg: "ID 最多 " + P.idMaxLength + " 個字" };
    return { ok: true, id: id };
  }

  window.PlayerIdentity = {
    normalizePlayerId: normalizePlayerId,
    encodeFirebaseKeyPart: encodeFirebaseKeyPart,
    makePlayerKey: makePlayerKey,
    builtinAvatars: builtin,
    isBuiltinAvatar: isBuiltinAvatar,
    avatarSrc: avatarSrc,
    avatarLabel: avatarLabel,
    resolveAvatarSrc: resolveAvatarSrc,
    isDisplayAvatarAllowed: isDisplayAvatarAllowed,
    validateNewId: validateNewId,
    setRemoteCatalog: function (cat) { remoteCatalog = cat || {}; }
  };
})();

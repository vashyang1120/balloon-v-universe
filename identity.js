/* ==========================================================
   氣球小V遊戲宇宙 — 玩家身份工具
   v0.3.0 新增；v0.3.4 改為遊戲宇宙共用玩家系統

   身份定義（v0.3.4 起）：
     playerId         = 伺服器產生的不可變內部 ID（例如 p_k3x7…），身份歸屬的唯一依據
     displayId        = 玩家看得到的 ID（伺服器正規化後的結果，例如「測試Ａ」→「測試A」）
     baseAvatarKey    = 固定身份圖案（建立後不可改；33 款之一）
     displayAvatarKey = 展示頭像（目前等於 baseAvatarKey；解鎖收藏尚未接入）

   ⚠ 舊系統的 playerKey（encodeFirebaseKeyPart(ID) + "__" + baseAvatarKey）已不使用：
     新身份一律由伺服器以 ID＋圖案找回 playerId，大廳不自行組合身份鍵。
   ========================================================== */

(function () {
  "use strict";

  var P = window.MAP_CONFIG.player;

  var builtin = P.builtinAvatars.map(function (a, i) { return { key: a[0], label: a[1], full: a[2] === "full", order: i + 1 }; });
  var builtinByKey = {};
  builtin.forEach(function (a) { builtinByKey[a.key] = a; });
  var unlockableByKey = {};
  P.unlockableAvatars.forEach(function (a) { unlockableByKey[a[0]] = { key: a[0], label: a[1] }; });

  /* 後端 GET /v1/avatars/base 回傳的可選清單（null = 還沒讀到） */
  var serverActive = null;

  function isBuiltinAvatar(key) { return !!builtinByKey[key]; }

  /* 選單可以顯示的身份圖案：
     - 讀到後端清單後：大廳有圖片 ∩ 後端已開放（兩邊都有才顯示，避免「選得到但建立失敗」）
     - 還沒讀到時：只顯示所有後端版本都接受的原有 17 款 */
  function selectableAvatars() {
    if (serverActive) return builtin.filter(function (a) { return serverActive[a.key]; });
    return builtin.slice(0, P.safeDefaultAvatarCount || 17);
  }
  function setServerActiveKeys(keys) {
    var map = {};
    (keys || []).forEach(function (k) { map[k] = true; });
    serverActive = map;
  }

  /* 身份圖案一律由遊戲宇宙提供；只有展示用可解鎖頭像仍讀節奏遊戲的舊位置 */
  function avatarSrc(key) {
    if (!key) return "";
    if (builtinByKey[key]) return P.avatarBaseUrl + key + ".png";
    if (unlockableByKey[key]) return P.legacyDisplayAvatarBaseUrl + key + ".png";
    return "";
  }

  /* 新款透明全身圖：顯示時完整放進圓框，不做臉部放大 */
  function isFullFigure(key) { return !!(builtinByKey[key] && builtinByKey[key].full); }

  function avatarLabel(key) {
    if (builtinByKey[key]) return builtinByKey[key].label;
    if (unlockableByKey[key]) return unlockableByKey[key].label;
    return key || "";
  }

  /* 展示頭像：v0.3.4 只允許身份圖案本身（解鎖收藏尚未接入） */
  function isDisplayAvatarAllowed(key) { return isBuiltinAvatar(key); }

  /* 大廳輸入檢查（與後端規則一致：去頭尾空白後 1～20 個字、不可為「玩家」）。
     最後以伺服器的檢查為準，伺服器的中文錯誤訊息會直接顯示給玩家。 */
  function validateNewId(raw) {
    var id = (raw || "").trim();
    if (!id) return { ok: false, msg: "請輸入玩家 ID" };
    if (id === "玩家") return { ok: false, msg: "「玩家」是遊戲的預設名稱，請換一個 ID" };
    if (Array.from(id).length > P.idMaxLength) return { ok: false, msg: "ID 最多 " + P.idMaxLength + " 個字" };
    return { ok: true, id: id };
  }

  window.PlayerIdentity = {
    builtinAvatars: builtin,
    selectableAvatars: selectableAvatars,
    setServerActiveKeys: setServerActiveKeys,
    isBuiltinAvatar: isBuiltinAvatar,
    isFullFigure: isFullFigure,
    avatarSrc: avatarSrc,
    avatarLabel: avatarLabel,
    isDisplayAvatarAllowed: isDisplayAvatarAllowed,
    validateNewId: validateNewId
  };
})();

/* ==========================================================
   氣球小V遊戲宇宙 — 地圖互動與玩家大廳
   balloon-v-universe-v0.3.1-onboarding-audio-ux-test-1

   結構：
   1. 地圖（v0.2.1 定案，程式未改）
      a. 原始底圖（兩層）  b. 聚焦層（黑白＋灰霧＋暗色，SVG mask 挖空）
      c. 選中光暈          d. 中央角色＋陰影（不攔截點擊）  e. 點擊熱區
   2. v0.3.0 大廳
      - 四個遊戲入口：正式 PNG（btn_*_idle.png）＋程式文字
      - 右上玩家資訊卡、下方玩家頭像列、選擇玩家／我的通行證木牌
      - 切換玩家確認、我的通行證、遊戲介紹面板、歡迎泡泡
   3. 玩家資料只從 state.player.data 顯示；切換時先清空成「載入中」，
      載入成功才換上新玩家；失敗就換回原本的玩家，兩人資料不會混在一起。
   ========================================================== */

(function () {
  "use strict";

  var CFG = window.MAP_CONFIG;
  var UI = CFG.ui;
  var ID = window.PlayerIdentity;
  var Store = window.PlayerStore;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var XLINK_NS = "http://www.w3.org/1999/xlink";
  var DEBUG = /[?&]debug=1\b/.test(location.search);
  var desktopMQ = window.matchMedia(CFG.desktopQuery);

  function $(id) { return document.getElementById(id); }

  var els = {
    stage: $("mapStage"),
    svg: $("mapSvg"),
    entries: $("entries"),
    status: $("mapStatus"),
    assetWarning: $("assetWarning"),
    debugBox: $("debugBox"),
    panel: $("infoPanel"),
    infoArt: $("infoArt"),
    infoZone: $("infoZone"),
    infoType: $("infoType"),
    infoGame: $("infoGame"),
    infoIntro: $("infoIntro"),
    closeBtn: $("closeBtn"),
    playBtn: $("playBtn"),
    talkBtn: $("talkBtn"),
    testModal: $("testModal"),
    testDetail: $("testDetail"),
    testHandoff: $("testHandoff"),
    testOk: $("testOk"),
    card: $("playerCard"),
    cardAvatar: $("playerCardAvatar"),
    cardId: $("playerCardId"),
    cardTitle: $("playerCardTitle"),
    cardCoins: $("playerCardCoins"),
    dock: $("dock"),
    avatarRow: $("avatarRow"),
    signSelect: $("signSelect"),
    signPass: $("signPass"),
    switchModal: $("switchModal"),
    switchAvatar: $("switchAvatar"),
    switchId: $("switchId"),
    switchCancel: $("switchCancel"),
    switchOk: $("switchOk"),
    passModal: $("passModal"),
    passClose: $("passClose"),
    passPanel: $("passModalPanel"),
    passTabBody: $("passTabBody"),
    bubble: $("welcomeBubble"),
    bubbleText: $("welcomeText"),
    toast: $("toast"),
    sandbox: $("sandboxBanner")
  };

  var state = {
    selected: null,
    scaleX: 1,
    scaleY: 1,
    focusLayer: null,
    grayImage: null,
    hazeRect: null,
    darkRect: null,
    holes: {},
    glows: {},
    entries: {},
    anim: { focus: 0, holes: {} },
    rafId: 0,
    /* 玩家：data 為 null 時代表尚未選定玩家 */
    player: { data: null, loading: false, loadingEntry: null, error: false, token: 0 },
    switchTarget: null,
    passTab: "basic"
  };

  var zoneById = {};
  CFG.zones.forEach(function (z) {
    zoneById[z.id] = z;
    state.anim.holes[z.id] = 0;
  });

  var rootStyle = document.documentElement.style;
  rootStyle.setProperty("--panel-ms", CFG.animation.panelMs + "ms");
  rootStyle.setProperty("--breathe", CFG.glow.breatheSeconds + "s");
  /* 讓 CSS 可以用到 14 張素材（避免在 CSS 裡寫死路徑） */
  Object.keys(UI).forEach(function (k) { rootStyle.setProperty("--ui-" + k, "url('" + UI[k] + "')"); });
  if (DEBUG) document.body.classList.add("debug");

  /* 實際可視高度（含 Android Chrome 工具列與虛擬鍵盤）→ CSS 變數 --vvh，讓固定操作列永遠在畫面內 */
  function updateVvh() {
    var h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    rootStyle.setProperty("--vvh", Math.round(h) + "px");
  }
  updateVvh();
  window.addEventListener("resize", updateVvh);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", updateVvh);
  if (Store.sandbox) { els.sandbox.hidden = false; document.body.classList.add("is-sandbox"); }

  /* ---------- 小型事件中心（教學用） ---------- */
  var listeners = {};
  function on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); return function () { off(name, fn); }; }
  function off(name, fn) { listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; }); }
  function emit(name, data) { (listeners[name] || []).slice().forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function sfx(name) { try { if (window.BVAudio) window.BVAudio.sfx(name); } catch (e) {} }

  /* ==========================================================
     教學互動守衛（v0.3.1）
     所有大廳主要操作在執行前都先問 guard(動作, 資料)。
     平常沒有規則 → 全部允許；教學時由 onboarding.js 設定規則：
       規則回傳 true  → 允許執行（正確操作）
       規則回傳 false → 不執行，並由規則本身給玩家回饋（提示文字＋提醒音＋高亮正確目標）
     動作名稱：selectZone / mapBlank / closePanel / play / talk / avatarSelf / avatarOther /
               addPlayer / signSelect / signPass / card / passTab / passClose / escape
     ========================================================== */
  var guardPolicy = null;
  function guard(action, data) {
    if (!guardPolicy) return true;
    try { return guardPolicy(action, data || {}) !== false; } catch (e) { console.error(e); return true; }
  }

  var toastTimer = 0;
  function toast(msg, ms) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, ms || 2600);
  }

  /* ---------- 工具 ---------- */

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function setHref(imageEl, src) {
    imageEl.setAttribute("href", src);
    imageEl.setAttributeNS(XLINK_NS, "xlink:href", src);
  }

  function isDesktop() { return desktopMQ.matches; }
  function focusParams() { return isDesktop() ? CFG.focus.desktop : CFG.focus.mobile; }

  /* 把選區的點（設計座標）換算成原圖座標，並畫成平滑封閉曲線 */
  function smoothPath(points) {
    var sx = state.scaleX, sy = state.scaleY;
    var p = points.map(function (pt) { return [pt[0] * sx, pt[1] * sy]; });
    var n = p.length;
    var d = "M" + p[0][0].toFixed(1) + "," + p[0][1].toFixed(1);
    for (var i = 0; i < n; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " +
                 c2x.toFixed(1) + "," + c2y.toFixed(1) + " " +
                 p2[0].toFixed(1) + "," + p2[1].toFixed(1);
    }
    return d + "Z";
  }

  /* ---------- 1. 載入底圖並建立座標系統 ---------- */

  function loadMap() {
    var img = new Image();
    img.onload = function () {
      var W = img.naturalWidth, H = img.naturalHeight;
      state.scaleX = W / CFG.designWidth;
      state.scaleY = H / CFG.designHeight;
      rootStyle.setProperty("--map-ratio", (W / H).toFixed(5));
      buildSvg(W, H);
      buildEntries();
      makeGrayscale(img, W, H);
      loadCharacter();
      applyModeParams();
      els.status.hidden = true;
    };
    img.onerror = function () {
      els.status.textContent = "⚠️ 找不到正式底圖：" + CFG.mapSrc +
        "\n請確認檔案已上傳到 repository 的這個路徑。";
      els.status.style.whiteSpace = "pre-line";
      els.status.classList.add("is-error");
    };
    img.src = CFG.mapSrc;
  }

  /* 在瀏覽器記憶體中做一張黑白版底圖（原始檔案完全不變），用於未選區域去色 */
  function makeGrayscale(img, W, H) {
    try {
      var canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      var data = ctx.getImageData(0, 0, W, H);
      var px = data.data;
      for (var i = 0; i < px.length; i += 4) {
        var l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        px[i] = px[i + 1] = px[i + 2] = l;
        px[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      canvas.toBlob(function (blob) {
        if (blob) setHref(state.grayImage, URL.createObjectURL(blob));
      });
    } catch (err) {
      // 例如直接用 file:// 開啟時瀏覽器不允許讀取像素：只用暗化，不去色
      console.warn("黑白聚焦層無法建立，改為只暗化：", err);
    }
  }

  /* ---------- 2. 建立 SVG 圖層 ---------- */

  function buildSvg(W, H) {
    var svg = els.svg;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var feather = CFG.focus.featherSize * state.scaleX;
    var defs = svgEl("defs", {}, svg);

    function blurFilter(id, amount) {
      var f = svgEl("filter", {
        id: id, filterUnits: "userSpaceOnUse",
        x: -W * 0.05, y: -H * 0.05, width: W * 1.1, height: H * 1.1
      }, defs);
      svgEl("feGaussianBlur", { stdDeviation: amount }, f);
    }
    blurFilter("featherBlur", feather);
    blurFilter("glowBlur", CFG.glow.blur * state.scaleX);

    // 角色腳下陰影的漸層
    var grad = svgEl("radialGradient", { id: "shadowGrad" }, defs);
    svgEl("stop", { offset: "0%", "stop-color": "#2a1608", "stop-opacity": 1 }, grad);
    svgEl("stop", { offset: "60%", "stop-color": "#2a1608", "stop-opacity": 0.55 }, grad);
    svgEl("stop", { offset: "100%", "stop-color": "#2a1608", "stop-opacity": 0 }, grad);

    // 聚焦遮罩：白色 = 套用暗化去色；黑色 = 挖空（保持原圖）
    var mask = svgEl("mask", {
      id: "spotMask", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H
    }, defs);
    svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }, mask);
    var holeGroup = svgEl("g", { filter: "url(#featherBlur)" }, mask);

    // a. 原始底圖（畫兩層：底圖檔案本身 alpha 約 95%，疊兩層才不會透出網頁背景）
    for (var i = 0; i < 2; i++) {
      var base = svgEl("image", {
        "class": "map-base", x: 0, y: 0, width: W, height: H, preserveAspectRatio: "none"
      }, svg);
      setHref(base, CFG.mapSrc);
    }

    // b. 聚焦層（只蓋地圖，不會蓋到 HTML 介面）
    state.focusLayer = svgEl("g", {
      "class": "focus-layer", mask: "url(#spotMask)", opacity: 0
    }, svg);
    state.grayImage = svgEl("image", {
      x: 0, y: 0, width: W, height: H, preserveAspectRatio: "none"
    }, state.focusLayer);
    state.hazeRect = svgEl("rect", {
      x: 0, y: 0, width: W, height: H, fill: CFG.focus.hazeColor, opacity: 0
    }, state.focusLayer);
    state.darkRect = svgEl("rect", {
      x: 0, y: 0, width: W, height: H, fill: "#0a0f2a"
    }, state.focusLayer);

    var glowLayer = svgEl("g", { "class": "glow-layer" }, svg);
    state.characterLayer = svgEl("g", { "class": "character-layer", "pointer-events": "none" }, svg);
    var outlineLayer = svgEl("g", { "class": "outline-layer" }, svg);
    var hitLayer = svgEl("g", { "class": "hit-layer" }, svg);

    CFG.zones.forEach(function (z) {
      var d = smoothPath(z.points);

      state.holes[z.id] = svgEl("path", { d: d, fill: "#000", opacity: 0 }, holeGroup);

      // c. 光暈：外圈金色 + 內圈白色
      var g = svgEl("g", { "class": "glow", "data-zone": z.id }, glowLayer);
      svgEl("path", {
        "class": "glow__line glow__outer", d: d, fill: "none",
        stroke: CFG.glow.color, "stroke-linejoin": "round", filter: "url(#glowBlur)"
      }, g);
      svgEl("path", {
        "class": "glow__line glow__inner", d: d, fill: "none",
        stroke: CFG.glow.innerColor, "stroke-opacity": 0.8,
        "stroke-linejoin": "round", filter: "url(#glowBlur)"
      }, g);
      svgEl("path", {   // 清楚的金邊線（不模糊；手機粗細為 0 = 不顯示）
        "class": "glow__edge", d: d, fill: "none",
        stroke: CFG.glow.edgeColor, "stroke-opacity": 0.95, "stroke-linejoin": "round"
      }, g);
      state.glows[z.id] = g;

      svgEl("path", {
        "class": "zone-outline", d: d, fill: "rgba(255,0,170,.12)",
        stroke: "#ff00aa", "stroke-width": 3 * state.scaleX, "stroke-dasharray": "12 8"
      }, outlineLayer);

      // e. 點擊熱區
      var hit = svgEl("path", { "class": "hit", d: d, "data-zone": z.id }, hitLayer);
      var title = svgEl("title", {}, hit);
      title.textContent = z.name;

      hit.addEventListener("pointerenter", function () {
        if (state.selected !== z.id) g.classList.add("is-hover");
      });
      hit.addEventListener("pointerleave", function () { g.classList.remove("is-hover"); });
    });

    // 點地圖：點到熱區 → 選取；點到空白（含中央廣場與角色）→ 取消
    svg.addEventListener("click", function (e) {
      var hit = e.target.closest ? e.target.closest(".hit") : null;
      if (DEBUG) showDebugCoords(e);
      if (hit) {
        var zid = hit.getAttribute("data-zone");
        if (!guard("selectZone", { zone: zid, via: "map" })) return;
        if (state.selected !== zid) sfx("select");
        selectZone(zid);
      } else {
        if (!guard("mapBlank")) return;
        clearSelection();
      }
    });
  }

  /* ---------- d. 中央廣場角色 ---------- */

  function loadCharacter() {
    var C = CFG.character;
    var img = new Image();
    img.onload = function () {
      var h = C.height * state.scaleY;
      var w = h * img.naturalWidth / img.naturalHeight;
      var footX = C.footX * state.scaleX, footY = C.footY * state.scaleY;
      var layer = state.characterLayer;

      svgEl("ellipse", {
        "class": "character-shadow",
        cx: footX, cy: footY + C.shadow.offsetY * state.scaleY,
        rx: w * C.shadow.widthRatio / 2, ry: h * C.shadow.heightRatio / 2,
        fill: "url(#shadowGrad)", opacity: C.shadow.opacity
      }, layer);

      var ch = svgEl("image", {
        "class": "character",
        x: footX - w * C.anchorX, y: footY - h * C.anchorY,
        width: w, height: h, preserveAspectRatio: "none"
      }, layer);
      setHref(ch, C.src);

      if (DEBUG) {   // 腳底定位十字
        var s = 14 * state.scaleX;
        svgEl("path", {
          d: "M" + (footX - s) + "," + footY + "H" + (footX + s) + "M" + footX + "," + (footY - s) + "V" + (footY + s),
          stroke: "#ff00aa", "stroke-width": 3 * state.scaleX
        }, layer);
      }
    };
    img.onerror = function () {
      els.assetWarning.textContent = "⚠️ 找不到角色素材：" + C.src;
      els.assetWarning.hidden = false;
    };
    img.src = C.src;
  }

  /* ==========================================================
     遊戲入口（btn_*_idle.png ＋ 程式文字）
     ========================================================== */

  function entryArtHtml(z) {
    return '<img class="entry__art" src="' + UI[z.button] + '" alt="" draggable="false">' +
      '<span class="entry__name">' + escapeHtml(z.name) + "</span>" +
      '<span class="entry__type">' + escapeHtml(z.gameType) + "</span>";
  }

  function buildEntries() {
    CFG.zones.forEach(function (z) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "entry";
      btn.dataset.zone = z.id;
      btn.style.setProperty("--x", (z.entry.x / CFG.designWidth * 100) + "%");
      btn.style.setProperty("--y", (z.entry.y / CFG.designHeight * 100) + "%");
      btn.style.setProperty("--w", (z.entry.width / CFG.designWidth * 100) + "%");
      btn.innerHTML = entryArtHtml(z);
      btn.setAttribute("aria-label", z.name + "：" + z.game);
      btn.addEventListener("click", function () {
        if (!guard("selectZone", { zone: z.id, via: "entry" })) return;
        if (state.selected !== z.id) sfx("select");
        selectZone(z.id);
      });
      els.entries.appendChild(btn);
      state.entries[z.id] = btn;
    });
  }

  /* ---------- 桌機 / 手機各自的聚焦強度與光暈粗細 ---------- */

  function applyModeParams() {
    if (!state.focusLayer) return;
    var f = focusParams(), desk = isDesktop(), G = CFG.glow;
    state.grayImage.setAttribute("opacity", (1 - f.saturation).toFixed(3));
    state.hazeRect.setAttribute("opacity", f.haze || 0);
    state.darkRect.setAttribute("opacity", f.darkness);
    state.darkRect.setAttribute("fill", f.darkColor || "#0a0f2a");
    var width = (desk ? G.desktopWidth : G.mobileWidth) * state.scaleX;
    var edge = (desk ? G.desktopEdgeWidth : G.mobileEdgeWidth) * state.scaleX;
    var color = desk ? (G.desktopColor || G.color) : G.color;
    els.svg.querySelectorAll(".glow__outer").forEach(function (p) {
      p.setAttribute("stroke-width", width);
      p.setAttribute("stroke", color);
    });
    els.svg.querySelectorAll(".glow__inner").forEach(function (p) { p.setAttribute("stroke-width", width * 0.35); });
    els.svg.querySelectorAll(".glow__edge").forEach(function (p) {
      p.setAttribute("stroke-width", edge);
      p.style.display = edge > 0 ? "" : "none";
    });
    document.body.classList.toggle("is-desktop", desk);
  }
  if (desktopMQ.addEventListener) desktopMQ.addEventListener("change", applyModeParams);
  else if (desktopMQ.addListener) desktopMQ.addListener(applyModeParams);

  /* ==========================================================
     選取邏輯（唯一入口：地圖熱區、遊戲入口按鈕都呼叫這裡）
     ========================================================== */

  function setActiveClasses(id) {
    CFG.zones.forEach(function (z) {
      var on = z.id === id;
      if (state.glows[z.id]) {
        state.glows[z.id].classList.toggle("is-active", on);
        state.glows[z.id].classList.remove("is-hover");
      }
      if (state.entries[z.id]) {
        state.entries[z.id].classList.toggle("is-active", on);
        state.entries[z.id].classList.toggle("is-muted", !!id && !on);
      }
    });
  }

  function zoneCenterX(z) {
    return z.points.reduce(function (s, p) { return s + p[0]; }, 0) / z.points.length;
  }

  function selectZone(id) {
    var z = zoneById[id];
    if (!z || state.selected === id) return;
    var switching = !!state.selected;
    state.selected = id;

    els.stage.classList.add("is-selected");
    setActiveClasses(id);

    els.infoArt.innerHTML = entryArtHtml(z);
    els.infoZone.textContent = z.name;
    els.infoType.textContent = z.gameType;
    els.infoGame.textContent = z.game;
    els.infoIntro.textContent = z.intro;
    // 介紹面板放在選中區域的另一側，避免擋住剛選的建築
    els.panel.classList.toggle("is-right", zoneCenterX(z) < CFG.designWidth * 0.4);
    els.panel.classList.add("is-open");
    els.panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("panel-open");
    if (switching) {
      els.panel.classList.remove("is-swap");
      void els.panel.offsetWidth;
      els.panel.classList.add("is-swap");
    }
    animateTo(id);
    emit("zoneSelected", id);
  }

  function clearSelection() {
    if (!state.selected) return;
    state.selected = null;
    els.stage.classList.remove("is-selected");
    setActiveClasses(null);
    els.panel.classList.remove("is-open", "is-swap");
    els.panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("panel-open");
    animateTo(null);
  }

  /* ---------- 聚焦過渡動畫（用 JS 逐格更新，所有瀏覽器表現一致） ---------- */

  function animateTo(id) {
    if (!state.focusLayer) return;
    var from = { focus: state.anim.focus, holes: Object.assign({}, state.anim.holes) };
    var to = { focus: id ? 1 : 0, holes: {} };
    CFG.zones.forEach(function (z) { to.holes[z.id] = z.id === id ? 1 : 0; });

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var duration = reduce ? 0 : CFG.animation.focusMs;
    var start = performance.now();
    cancelAnimationFrame(state.rafId);

    function frame(now) {
      var t = duration ? Math.min(1, (now - start) / duration) : 1;
      var e = 1 - Math.pow(1 - t, 3);  // easeOutCubic
      state.anim.focus = from.focus + (to.focus - from.focus) * e;
      state.focusLayer.setAttribute("opacity", state.anim.focus.toFixed(3));
      CFG.zones.forEach(function (z) {
        var v = from.holes[z.id] + (to.holes[z.id] - from.holes[z.id]) * e;
        state.anim.holes[z.id] = v;
        state.holes[z.id].setAttribute("opacity", v.toFixed(3));
      });
      if (t < 1) state.rafId = requestAnimationFrame(frame);
    }
    state.rafId = requestAnimationFrame(frame);
  }

  /* ---------- 校準模式：顯示點擊位置的原圖座標 ---------- */

  function showDebugCoords(e) {
    var pt = els.svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    var p = pt.matrixTransform(els.svg.getScreenCTM().inverse());
    var x = Math.round(p.x / state.scaleX), y = Math.round(p.y / state.scaleY);
    els.debugBox.hidden = false;
    els.debugBox.textContent = "座標 [" + x + ", " + y + "]\n模式：" + (isDesktop() ? "桌機" : "手機");
    console.log("[地圖座標]", "[" + x + ", " + y + "]");
  }

  /* ==========================================================
     頭像元件：頭像框（中央是奶油白底，不是透明）在下層，
     頭像圖片以圓形裁切疊在奶油白圓的「上層」，所以白底不會蓋住頭像。
     圓心與直徑依實際 PNG 量測（見 style.css .av--blue / --pink / --gold）。
     ========================================================== */

  /* v0.3.1：頭像放在獨立的圓形裁切層 .av__clip 裡，可以單獨放大臉部（--zoom），
     頭像框（含氣球、星星裝飾）維持原圖完整，不會被裁切 */
  function avatarHtml(key, frame, unlocked, extraClass) {
    var src = ID.avatarSrc(key, unlocked);
    var frameSrc = frame === "gold" ? UI.frameGold : frame === "pink" ? UI.framePink : UI.frameBlue;
    return '<span class="av av--' + frame + (extraClass ? " " + extraClass : "") + '">' +
      '<img class="av__frame" src="' + frameSrc + '" alt="" draggable="false">' +
      '<span class="av__clip">' +
      (src ? '<img class="av__face" src="' + escapeHtml(src) + '" alt="" draggable="false" onerror="this.style.visibility=\'hidden\'">' : "") +
      "</span></span>";
  }

  function frameFor(index) { return index % 2 === 0 ? "blue" : "pink"; }

  /* ---------- 通行證面板（panel_pass_idle.png） ---------- */
  function fmtDate(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
  }

  function passPanelHtml(p, mode) {
    // mode = "created"：只顯示 ID、固定身份圖案（與建立日期）
    // mode = "full"   ：加上 V幣、稱號
    var lower = "";
    if (mode === "full") {
      lower =
        '<span class="pass__stat"><b>V幣</b>' + escapeHtml(p.balance) + "</span>" +
        '<span class="pass__stat"><b>稱號</b>' + escapeHtml(p.title ? p.title.name : "未裝備") + "</span>";
    } else if (p.createdAt) {
      lower = '<span class="pass__stat"><b>建立日期</b>' + fmtDate(p.createdAt) + "</span>";
    }
    return '<div class="pass">' +
      '<img class="pass__bg" src="' + UI.panelPass + '" alt="" draggable="false">' +
      '<span class="pass__face">' + (ID.avatarSrc(p.baseAvatarKey) ? '<img src="' + ID.avatarSrc(p.baseAvatarKey) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : "") + "</span>" +
      '<span class="pass__ribbon">' + escapeHtml(p.id) + "</span>" +
      '<span class="pass__main">' +
        '<span class="pass__label">玩家 ID</span>' +
        '<span class="pass__id">' + escapeHtml(p.id) + "</span>" +
        '<span class="pass__base">專屬身份圖案：' + escapeHtml(ID.avatarLabel(p.baseAvatarKey)) + "</span>" +
      "</span>" +
      '<span class="pass__lower">' + lower + "</span>" +
      "</div>";
  }

  /* ==========================================================
     玩家狀態與畫面
     ========================================================== */

  function current() { return state.player.data; }

  function renderPlayerCard() {
    var p = state.player;
    els.card.hidden = !(p.data || p.loading || p.error);
    els.card.classList.toggle("is-loading", p.loading);
    els.card.classList.toggle("is-error", p.error && !p.loading);
    if (p.loading) {
      // 載入中：只顯示目標玩家的 ID（已知），其餘一律顯示「載入中」，絕不沿用上一位玩家的數值
      var e = p.loadingEntry || {};
      els.cardAvatar.innerHTML = avatarHtml(e.displayAvatarKey || e.baseAvatarKey, "gold", null, "is-dim");
      els.cardId.textContent = e.id || "";
      els.cardTitle.textContent = "載入中…";
      els.cardCoins.textContent = "載入中…";
      return;
    }
    if (p.error && !p.data) {
      var en = p.loadingEntry || {};
      els.cardAvatar.innerHTML = avatarHtml(en.baseAvatarKey, "gold", null, "is-dim");
      els.cardId.textContent = en.id || "";
      els.cardTitle.textContent = "讀取失敗";
      els.cardCoins.textContent = "點這裡重試";
      return;
    }
    var d = p.data;
    if (!d) return;
    els.cardAvatar.innerHTML = avatarHtml(d.displayAvatarKey, "gold", d.unlockedAvatars);
    els.cardId.textContent = d.id;
    els.cardTitle.textContent = d.title ? d.title.name : "未裝備";
    els.cardCoins.textContent = String(d.balance);
  }

  function renderAvatarRow() {
    var list = Store.getRemembered();
    var curKey = state.player.loading ? (state.player.loadingEntry || {}).playerKey : (current() && current().playerKey);
    els.avatarRow.innerHTML = "";
    list.forEach(function (entry, i) {
      var isCur = entry.playerKey === curKey;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "av-item" + (isCur ? " is-current" : "");
      b.setAttribute("role", "listitem");
      b.dataset.key = entry.playerKey;
      b.setAttribute("aria-label", (isCur ? "目前玩家：" : "切換到 ") + entry.id);
      b.innerHTML = avatarHtml(entry.displayAvatarKey || entry.baseAvatarKey, isCur ? "gold" : frameFor(i)) +
        '<span class="av-item__id">' + escapeHtml(entry.id) + "</span>";
      b.addEventListener("click", function () {
        var me = current();
        var self = !!(me && entry.playerKey === me.playerKey);
        if (!guard(self ? "avatarSelf" : "avatarOther", { entry: entry })) return;
        onAvatarTap(entry);
      });
      els.avatarRow.appendChild(b);
    });
    var add = document.createElement("button");
    add.type = "button";
    add.className = "av-item av-item--add";
    add.id = "addPlayerBtn";
    add.setAttribute("aria-label", "新增玩家");
    add.innerHTML = '<span class="av av--add"><img class="av__frame" src="' + UI.addPlayer + '" alt="" draggable="false"></span><span class="av-item__id">新增</span>';
    add.addEventListener("click", function () {
      if (!guard("addPlayer")) return;
      emit("addPlayer");
    });
    els.avatarRow.appendChild(add);
  }

  function renderBubble() {
    var d = current();
    var show = !!d && !state.player.loading && (isDesktop() || CFG.welcomeBubble.showOnMobile);
    els.bubble.hidden = !show;
    if (show) els.bubbleText.textContent = d.id + "，歡迎來玩！";
  }

  function renderAll() {
    renderPlayerCard();
    renderAvatarRow();
    renderBubble();
    if (DEBUG) renderDebugHandoff();
  }

  function renderDebugHandoff() {
    var d = current();
    if (!d) return;
    els.debugBox.hidden = false;
    els.debugBox.textContent = "playerKey：" + d.playerKey +
      "\nbaseAvatarKey：" + d.baseAvatarKey + "　displayAvatarKey：" + d.displayAvatarKey +
      "\n資料來源：" + (Store.sandbox ? "測試沙盒" : "Firebase") +
      "\n交接網址範例：" + Store.handoff.launchUrl(d, "rhythm");
  }

  /* 載入並切換成某位玩家。
     成功 → 換上新玩家；失敗 → 留在原本的玩家（或保留錯誤狀態），不混用資料。 */
  function loadPlayer(entry, opts) {
    opts = opts || {};
    var p = state.player;
    var token = ++p.token;
    var previous = p.data;
    p.loading = true;
    p.error = false;
    p.loadingEntry = entry;
    clearSelection();
    renderAll();
    return Store.loadPlayerData(entry.playerKey, entry).then(function (res) {
      if (token !== p.token) return { status: "stale" };
      if (res.status !== "ok") throw Object.assign(new Error("notFound"), { notFound: true });
      p.data = res.data;
      p.loading = false;
      p.loadingEntry = null;
      Store.setCurrentKey(res.data.playerKey);
      Store.remember(res.data);
      renderAll();
      emit("playerChanged", res.data);
      return { status: "ok", data: res.data };
    }).catch(function (err) {
      if (token !== p.token) return { status: "stale" };
      console.warn("[Lobby] 玩家資料讀取失敗：", err && err.message);
      p.loading = false;
      if (previous) {
        p.data = previous;          // 換回原本玩家
        p.loadingEntry = null;
        p.error = false;
      } else {
        p.data = null;
        p.error = true;             // 沒有原本玩家可換回：顯示讀取失敗
      }
      renderAll();
      if (!opts.silent) toast(previous ? "載入失敗，維持原本的玩家「" + previous.id + "」" : "玩家資料讀取失敗，請檢查網路");
      return { status: err && err.notFound ? "notFound" : "error", error: err };
    });
  }

  /* ---------- 頭像列：點自己 / 點別人 ---------- */
  function onAvatarTap(entry) {
    var d = current();
    if (state.player.loading) return;
    if (d && entry.playerKey === d.playerKey) {
      emit("avatarTapped", { self: true, entry: entry });
      toast("這是目前的玩家：" + d.id);
      return;
    }
    emit("avatarTapped", { self: false, entry: entry });
    openSwitchConfirm(entry);
  }

  function openSwitchConfirm(entry) {
    state.switchTarget = entry;
    els.switchAvatar.innerHTML = avatarHtml(entry.displayAvatarKey || entry.baseAvatarKey, "blue");
    els.switchId.textContent = entry.id;
    els.switchModal.hidden = false;
    els.switchOk.focus();
  }

  els.switchCancel.addEventListener("click", function () {
    els.switchModal.hidden = true;
    state.switchTarget = null;
    emit("switchCancelled");
  });
  els.switchOk.addEventListener("click", function () {
    var target = state.switchTarget;
    els.switchModal.hidden = true;
    state.switchTarget = null;
    if (!target) return;
    loadPlayer(target).then(function (r) {
      if (r.status === "ok") { sfx("success"); toast("已切換為「" + r.data.id + "」"); }
      else if (r.status !== "stale") sfx("error");
      emit("switchDone", r);
    });
  });

  els.card.addEventListener("click", function () {
    if (!guard("card")) return;
    if (state.player.error && !state.player.data && state.player.loadingEntry) { loadPlayer(state.player.loadingEntry); return; }
    if (current()) openPass();
  });

  /* ---------- 選擇玩家木牌：引導注意下方頭像列（不另開選擇頁） ---------- */
  els.signSelect.addEventListener("click", function () {
    if (!guard("signSelect")) return;
    els.avatarRow.classList.remove("is-hint");
    void els.avatarRow.offsetWidth;
    els.avatarRow.classList.add("is-hint");
    toast("點下方的玩家頭像就可以切換玩家，按「＋」新增玩家");
    emit("signSelectTapped");
  });

  /* ==========================================================
     我的通行證
     ========================================================== */

  function openPass() {
    var d = current();
    if (!d) return;
    els.passPanel.innerHTML = passPanelHtml(d, "full");
    setPassTab("basic");
    els.passModal.hidden = false;
    els.passClose.focus();
    emit("passOpened");
  }
  function closePass() {
    if (els.passModal.hidden) return;
    els.passModal.hidden = true;
    emit("passClosed");
  }

  function setPassTab(tab) {
    state.passTab = tab;
    document.querySelectorAll("#passModal .tab").forEach(function (t) {
      t.classList.toggle("is-active", t.dataset.tab === tab);
      t.setAttribute("aria-selected", t.dataset.tab === tab ? "true" : "false");
    });
    var d = current();
    if (!d) return;
    var html = "";
    var names = CFG.player.gameNames;
    if (tab === "basic") {
      html =
        row("玩家 ID", escapeHtml(d.id)) +
        row("專屬身份圖案", avatarHtml(d.baseAvatarKey, "blue", null, "av--sm") + "<span>" + escapeHtml(ID.avatarLabel(d.baseAvatarKey)) + '<em class="muted">（固定，不能更換）</em></span>') +
        row("展示頭像", avatarHtml(d.displayAvatarKey, "pink", d.unlockedAvatars, "av--sm") + "<span>" + escapeHtml(ID.avatarLabel(d.displayAvatarKey)) + "</span>") +
        row("稱號", escapeHtml(d.title ? d.title.name : "未裝備")) +
        row("V幣", escapeHtml(d.balance) + (d.balanceExists ? "" : '<em class="muted">（尚無 V幣紀錄）</em>')) +
        row("通行證代碼", '<code class="muted">' + escapeHtml(d.playerKey) + "</code>");
    } else if (tab === "collection") {
      var av = d.unlockedAvatarKeys;
      html = '<h4 class="sec">已解鎖頭像</h4>' + (av.length
        ? '<div class="av-grid">' + av.map(function (k) {
            return '<div class="av-grid__item">' + avatarHtml(k, "blue", d.unlockedAvatars, "av--sm") + "<span>" + escapeHtml(ID.avatarLabel(k)) + "</span></div>";
          }).join("") + "</div>"
        : '<p class="empty">還沒有解鎖特殊頭像</p>');
      var titles = d.unlockedTitles;
      html += '<h4 class="sec">已解鎖稱號</h4>' + (titles.length
        ? '<ul class="title-list">' + titles.map(function (t) {
            return "<li><b>" + escapeHtml(t.name) + "</b><span>" + escapeHtml(names[t.gameId] || t.gameId) + "</span></li>";
          }).join("") + "</ul>"
        : '<p class="empty">還沒有解鎖稱號</p>');
    } else {
      html = '<ul class="record-list">' + CFG.player.gameIds.map(function (g) {
        var n = d.unlockedTitles.filter(function (t) { return t.gameId === g; }).length;
        return "<li><b>" + escapeHtml(names[g]) + "</b><span>已解鎖稱號 " + n + " 個</span></li>";
      }).join("") + "</ul>" +
        '<p class="empty">分數與關卡進度請在各遊戲中查看；大廳整合各遊戲紀錄將在後續版本開放。</p>';
    }
    els.passTabBody.innerHTML = html;
  }
  function row(label, value) { return '<div class="kv"><span class="kv__k">' + label + '</span><span class="kv__v">' + value + "</span></div>"; }

  document.querySelectorAll("#passModal .tab").forEach(function (t) {
    t.addEventListener("click", function () { if (!guard("passTab")) return; setPassTab(t.dataset.tab); });
  });
  els.passClose.addEventListener("click", function () { if (!guard("passClose")) return; closePass(); });
  els.passModal.addEventListener("click", function (e) { if (e.target === els.passModal && guard("passClose")) closePass(); });
  els.signPass.addEventListener("click", function () { if (!guard("signPass")) return; openPass(); emit("signPassTapped"); });

  /* ==========================================================
     遊戲介紹面板按鈕
     ========================================================== */

  els.closeBtn.addEventListener("click", function () { if (!guard("closePanel")) return; clearSelection(); });

  els.playBtn.addEventListener("click", function () {
    if (!guard("play")) return;
    var z = zoneById[state.selected];
    var d = current();
    if (!z) return;
    els.testDetail.textContent = "已選擇「" + z.name + "」→ " + z.game + (d ? "（玩家：" + d.id + "）" : "");
    els.testHandoff.textContent = d
      ? "身份交接測試資料：playerKey = " + d.playerKey + "。四款遊戲目前尚未支援接收大廳身份，正式跳轉留待後續版本。"
      : "";
    els.testModal.hidden = false;
    els.testOk.focus();
    emit("playPressed", z.id);
  });

  els.talkBtn.addEventListener("click", function () {
    if (!guard("talk")) return;
    var z = zoneById[state.selected];
    if (!z) return;
    window.RpgDialogue.play([{ speaker: CFG.dialogue.speakerName, text: z.vLine }]);
  });

  els.testOk.addEventListener("click", function () { els.testModal.hidden = true; });
  els.testModal.addEventListener("click", function (e) { if (e.target === els.testModal) els.testModal.hidden = true; });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || window.RpgDialogue.isOpen()) return;
    if (!guard("escape")) return;
    if (!els.testModal.hidden) els.testModal.hidden = true;
    else if (!els.switchModal.hidden) els.switchCancel.click();
    else if (!els.passModal.hidden) closePass();
    else clearSelection();
  });

  if (desktopMQ.addEventListener) desktopMQ.addEventListener("change", renderBubble);

  /* ---------- 通用按鈕確認音（集中一處；同一次點擊只會有一個提示音） ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button");
    if (!b || b.disabled || b.closest("#rpg") || b.closest(".audio-ctl")) return;
    if (b.classList.contains("entry")) return;   // 選區有自己的 select 音
    sfx("confirm");
  });

  /* ==========================================================
     音樂／音效設定（小按鈕＋小型設定）
     ========================================================== */
  (function audioUi() {
    var A = window.BVAudio;
    var btn = $("audioBtn"), pop = $("audioPop"), dot = $("audioDot"), icon = $("audioIcon");
    var bgmT = $("bgmToggle"), sfxT = $("sfxToggle"), status = $("audioStatus");
    if (!A || !btn) return;
    var TEXT = {
      idle: "背景音樂：準備中", waiting: "背景音樂：點畫面任一處開始播放", loading: "背景音樂：載入中…",
      playing: "背景音樂：播放中", blocked: "瀏覽器暫停了音樂，點一下畫面再試一次", off: "背景音樂：已關閉",
      missing: "找不到背景音樂檔案", hidden: "背景音樂：分頁在背景，暫停中"
    };
    function render() {
      var p = A.prefs(), st = A.bgmState();
      bgmT.checked = p.bgm; sfxT.checked = p.sfx;
      status.textContent = TEXT[st] || st;
      btn.dataset.state = st;
      icon.textContent = p.bgm || p.sfx ? "🎵" : "🔇";
      btn.setAttribute("aria-label", "聲音設定：" + (TEXT[st] || st) + "；介面音效" + (p.sfx ? "開" : "關"));
      dot.title = TEXT[st] || "";
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      btn.setAttribute("aria-expanded", String(!pop.hidden));
      render();
    });
    pop.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { if (!pop.hidden) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
    bgmT.addEventListener("change", function () { A.setBgm(bgmT.checked); render(); });
    sfxT.addEventListener("change", function () { A.setSfx(sfxT.checked); if (sfxT.checked) A.sfx("confirm"); render(); });
    var blockedToastShown = false;
    A.onBgmState(function (st) {
      render();
      if (st === "blocked" && !blockedToastShown) { blockedToastShown = true; toast("瀏覽器暫停了音樂，點一下畫面就能再試一次"); }
    });
    render();
  })();

  function setLobbyVisible(v) {
    els.dock.hidden = !v;
    document.body.classList.toggle("lobby-ready", v);
  }

  /* ---------- 歡迎泡泡位置（原圖座標 → 百分比） ---------- */
  (function placeBubble() {
    var B = CFG.welcomeBubble;
    els.bubble.style.left = (B.x / CFG.designWidth * 100) + "%";
    els.bubble.style.top = (B.y / CFG.designHeight * 100) + "%";
    els.bubble.style.width = (B.width / CFG.designWidth * 100) + "%";
    els.bubble.style.backgroundImage = "url('" + UI.speechWelcome + "')";
  })();

  /* ---------- 啟動地圖 ---------- */
  loadMap();

  window.BalloonUniverse = {
    version: CFG.version,
    selectZone: selectZone,
    clearSelection: clearSelection,
    getSelected: function () { return state.selected; },
    getPlayer: function () { return current(); },
    isPlayerLoading: function () { return state.player.loading; },
    handoff: function (gameId) { return Store.handoff.payload(current(), gameId); }
  };

  window.Lobby = {
    on: on,
    emit: emit,
    toast: toast,
    loadPlayer: loadPlayer,
    current: current,
    renderAll: renderAll,
    setLobbyVisible: setLobbyVisible,
    avatarHtml: avatarHtml,
    passPanelHtml: passPanelHtml,
    escapeHtml: escapeHtml,
    openPass: openPass,
    closePass: closePass,
    setGuard: function (fn) { guardPolicy = fn; document.body.classList.toggle("is-guarded", !!fn); },
    clearGuard: function () { guardPolicy = null; document.body.classList.remove("is-guarded"); },
    sfx: sfx,
    isDesktop: isDesktop,
    els: els
  };
})();

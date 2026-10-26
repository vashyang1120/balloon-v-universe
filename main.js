/* ==========================================================
   氣球小V遊戲宇宙 — 地圖互動
   balloon-v-universe-v0.2.0-lobby-integration-test-1

   結構：
   1. 讀取底圖實際尺寸 → 以原圖像素建立 SVG 座標系統
   2. 圖層（由下到上）：
      a. 原始底圖（畫兩層，抵銷底圖檔案本身約 4% 的半透明）
      b. 聚焦層：黑白版底圖 + 暗色，用 SVG mask 挖空選中區域（邊緣羽化）
      c. 選中區域光暈
      d. 中央廣場角色（小V與氣球小狗）＋腳下陰影 —— 不會被暗化、不攔截點擊
      e. 透明點擊熱區（最上層）
   3. selectZone() / clearSelection() 是唯一的選取邏輯，
      地圖熱區、地圖名牌、導覽牌按鈕都呼叫它
   4. 所有數值都來自 zones.js（MAP_CONFIG）
   ========================================================== */

(function () {
  "use strict";

  var CFG = window.MAP_CONFIG;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var XLINK_NS = "http://www.w3.org/1999/xlink";
  var DEBUG = /[?&]debug=1\b/.test(location.search);
  var desktopMQ = window.matchMedia(CFG.desktopQuery);

  var els = {
    stage: document.getElementById("mapStage"),
    svg: document.getElementById("mapSvg"),
    pins: document.getElementById("pins"),
    status: document.getElementById("mapStatus"),
    assetWarning: document.getElementById("assetWarning"),
    debugBox: document.getElementById("debugBox"),
    guideGrid: document.getElementById("guideGrid"),
    panel: document.getElementById("infoPanel"),
    infoZone: document.getElementById("infoZone"),
    infoIcon: document.getElementById("infoIcon"),
    infoGame: document.getElementById("infoGame"),
    infoIntro: document.getElementById("infoIntro"),
    closeBtn: document.getElementById("closeBtn"),
    playBtn: document.getElementById("playBtn"),
    talkBtn: document.getElementById("talkBtn"),
    testModal: document.getElementById("testModal"),
    testDetail: document.getElementById("testDetail"),
    testOk: document.getElementById("testOk"),
    passChip: document.getElementById("passChip"),
    passModal: document.getElementById("passModal"),
    passOk: document.getElementById("passOk")
  };

  var state = {
    selected: null,       // 目前選取的區域 id，null = 未選取
    scaleX: 1,            // 原圖實際寬 / designWidth
    scaleY: 1,
    focusLayer: null,     // 聚焦層（黑白 + 暗色），整層淡入淡出
    grayImage: null,
    darkRect: null,
    holes: {},            // 遮罩挖空 path（依區域 id）
    glows: {},
    pins: {},
    guideBtns: {},
    anim: { focus: 0, holes: {} },
    rafId: 0
  };

  var zoneById = {};
  CFG.zones.forEach(function (z) {
    zoneById[z.id] = z;
    state.anim.holes[z.id] = 0;
  });

  var rootStyle = document.documentElement.style;
  rootStyle.setProperty("--panel-ms", CFG.animation.panelMs + "ms");
  rootStyle.setProperty("--breathe", CFG.glow.breatheSeconds + "s");
  if (DEBUG) document.body.classList.add("debug");

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
      buildPins();
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
      if (hit) selectZone(hit.getAttribute("data-zone"));
      else clearSelection();
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

  /* ---------- 地圖名牌（與熱區同一套座標） ---------- */

  function buildPins() {
    CFG.zones.forEach(function (z) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pin";
      btn.style.setProperty("--x", z.pin.x / CFG.designWidth);
      btn.style.setProperty("--y", z.pin.y / CFG.designHeight);
      btn.innerHTML = '<span class="pin__icon">' + z.icon + '</span><span class="pin__name">' + z.name + "</span>";
      btn.setAttribute("aria-label", z.name + "：" + z.game);
      btn.addEventListener("click", function () { selectZone(z.id); });
      els.pins.appendChild(btn);
      state.pins[z.id] = btn;
    });
  }

  /* ---------- 園區導覽牌按鈕 ---------- */

  function buildGuide() {
    CFG.zones.forEach(function (z) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "guide-btn";
      btn.innerHTML =
        '<span class="guide-btn__icon">' + z.icon + "</span>" +
        '<span class="guide-btn__text">' +
          '<span class="guide-btn__name">' + z.name + "</span>" +
          '<span class="guide-btn__dir">地圖' + z.direction + "</span>" +
        "</span>";
      btn.addEventListener("click", function () { selectZone(z.id); });
      els.guideGrid.appendChild(btn);
      state.guideBtns[z.id] = btn;
    });
  }

  /* ---------- 桌機 / 手機各自的聚焦強度與光暈粗細 ---------- */

  function applyModeParams() {
    if (!state.focusLayer) return;
    var f = focusParams();
    state.grayImage.setAttribute("opacity", (1 - f.saturation).toFixed(3));
    state.darkRect.setAttribute("opacity", f.darkness);
    var width = (isDesktop() ? CFG.glow.desktopWidth : CFG.glow.mobileWidth) * state.scaleX;
    els.svg.querySelectorAll(".glow__outer").forEach(function (p) { p.setAttribute("stroke-width", width); });
    els.svg.querySelectorAll(".glow__inner").forEach(function (p) { p.setAttribute("stroke-width", width * 0.35); });
  }
  if (desktopMQ.addEventListener) desktopMQ.addEventListener("change", applyModeParams);
  else if (desktopMQ.addListener) desktopMQ.addListener(applyModeParams);

  /* ---------- 3. 選取邏輯（唯一入口） ---------- */

  function setActiveClasses(id) {
    CFG.zones.forEach(function (z) {
      var on = z.id === id;
      if (state.glows[z.id]) {
        state.glows[z.id].classList.toggle("is-active", on);
        state.glows[z.id].classList.remove("is-hover");
      }
      if (state.pins[z.id]) {
        state.pins[z.id].classList.toggle("is-active", on);
        state.pins[z.id].classList.toggle("is-muted", !!id && !on);
      }
      if (state.guideBtns[z.id]) state.guideBtns[z.id].classList.toggle("is-active", on);
    });
  }

  function selectZone(id) {
    var z = zoneById[id];
    if (!z || state.selected === id) return;
    var switching = !!state.selected;
    state.selected = id;

    els.stage.classList.add("is-selected");
    setActiveClasses(id);

    els.infoZone.textContent = z.name;
    els.infoIcon.textContent = z.icon;
    els.infoGame.textContent = z.game;
    els.infoIntro.textContent = z.intro;
    els.panel.classList.add("is-open");
    els.panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("panel-open");
    if (switching) {
      els.panel.classList.remove("is-swap");
      void els.panel.offsetWidth;  // 重新觸發切換動畫
      els.panel.classList.add("is-swap");
    }

    animateTo(id);
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
    els.debugBox.textContent = "座標 [" + x + ", " + y + "]";
    console.log("[地圖座標]", "[" + x + ", " + y + "]");
  }

  /* ---------- 面板、按鈕、對話、提示 ---------- */

  function openModal(m, focusEl) { m.hidden = false; if (focusEl) focusEl.focus(); }
  function closeModal(m) { m.hidden = true; }

  els.closeBtn.addEventListener("click", clearSelection);

  els.playBtn.addEventListener("click", function () {
    var z = zoneById[state.selected];
    if (!z) return;
    els.testDetail.textContent = "已選擇「" + z.name + "」→ " + z.game;
    openModal(els.testModal, els.testOk);
  });

  els.talkBtn.addEventListener("click", function () {
    var z = zoneById[state.selected];
    if (!z || !window.RpgDialogue) return;
    window.RpgDialogue.play([{ speaker: CFG.dialogue.speakerName, text: z.vLine }]);
  });

  els.passChip.addEventListener("click", function () { openModal(els.passModal, els.passOk); });

  [[els.testModal, els.testOk], [els.passModal, els.passOk]].forEach(function (pair) {
    var m = pair[0];
    pair[1].addEventListener("click", function () { closeModal(m); });
    m.addEventListener("click", function (e) { if (e.target === m) closeModal(m); });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!els.testModal.hidden) closeModal(els.testModal);
    else if (!els.passModal.hidden) closeModal(els.passModal);
    else clearSelection();
  });

  /* ---------- 啟動 ---------- */
  buildGuide();
  loadMap();

  // 方便未來 RPG / 玩家系統串接
  window.BalloonUniverse = {
    version: CFG.version,
    selectZone: selectZone,
    clearSelection: clearSelection,
    getSelected: function () { return state.selected; }
  };
})();

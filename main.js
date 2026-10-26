/* ==========================================================
   氣球小V遊戲宇宙 — 地圖互動
   balloon-v-universe-v0.1.0-map-interaction-test-1

   結構：
   1. 讀取底圖實際尺寸 → 以原圖像素建立 SVG 座標系統
   2. 一張底圖 + 一層暗色矩形（用 SVG mask 挖空選中區域，邊緣羽化）
   3. 光暈層、點擊熱區、名牌全部使用 zones.js 的同一組座標
   4. selectZone() / clearSelection() 是唯一的選取邏輯，
      地圖熱區、地圖名牌、導覽牌按鈕都呼叫它
   ========================================================== */

(function () {
  "use strict";

  var CFG = window.MAP_CONFIG;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var XLINK_NS = "http://www.w3.org/1999/xlink";
  var DEBUG = /[?&]debug=1\b/.test(location.search);

  var els = {
    stage: document.getElementById("mapStage"),
    svg: document.getElementById("mapSvg"),
    pins: document.getElementById("pins"),
    plaza: document.getElementById("plazaSlot"),
    status: document.getElementById("mapStatus"),
    debugBox: document.getElementById("debugBox"),
    guideGrid: document.getElementById("guideGrid"),
    panel: document.getElementById("infoPanel"),
    infoZone: document.getElementById("infoZone"),
    infoGame: document.getElementById("infoGame"),
    infoIntro: document.getElementById("infoIntro"),
    closeBtn: document.getElementById("closeBtn"),
    playBtn: document.getElementById("playBtn"),
    modal: document.getElementById("testModal"),
    modalDetail: document.getElementById("testDetail"),
    modalOk: document.getElementById("testOk")
  };

  var state = {
    selected: null,       // 目前選取的區域 id，null = 未選取
    scaleX: 1,            // 原圖實際寬 / designWidth
    scaleY: 1,
    dimRect: null,
    holes: {},            // 遮罩挖空 path（依區域 id）
    glows: {},
    pins: {},
    guideBtns: {},
    anim: { dim: 0, holes: {} },  // 目前動畫值
    rafId: 0
  };

  var zoneById = {};
  CFG.zones.forEach(function (z) {
    zoneById[z.id] = z;
    state.anim.holes[z.id] = 0;
  });

  document.documentElement.style.setProperty("--dim", CFG.dimOpacity);
  if (DEBUG) document.body.classList.add("debug");

  /* ---------- 工具 ---------- */

  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

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
      document.documentElement.style.setProperty("--map-ratio", (W / H).toFixed(5));
      buildSvg(W, H);
      buildPins();
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

  /* ---------- 2. 建立 SVG 圖層 ---------- */

  function buildSvg(W, H) {
    var svg = els.svg;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    var feather = CFG.featherSize * state.scaleX;
    var defs = svgEl("defs", {}, svg);

    // 遮罩羽化（柔和邊緣）
    var fFeather = svgEl("filter", {
      id: "featherBlur", filterUnits: "userSpaceOnUse",
      x: -W * 0.05, y: -H * 0.05, width: W * 1.1, height: H * 1.1
    }, defs);
    svgEl("feGaussianBlur", { stdDeviation: feather }, fFeather);

    // 光暈模糊
    var fGlow = svgEl("filter", {
      id: "glowBlur", filterUnits: "userSpaceOnUse",
      x: -W * 0.05, y: -H * 0.05, width: W * 1.1, height: H * 1.1
    }, defs);
    svgEl("feGaussianBlur", { stdDeviation: feather * 0.8 }, fGlow);

    // 暗化遮罩：白色 = 顯示暗色；黑色 = 挖空（顯示原圖亮度）
    var mask = svgEl("mask", {
      id: "spotMask", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H
    }, defs);
    svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }, mask);
    var holeGroup = svgEl("g", { filter: "url(#featherBlur)" }, mask);

    // 底圖（原圖，不做任何修改）
    var image = svgEl("image", {
      x: 0, y: 0, width: W, height: H, preserveAspectRatio: "none"
    }, svg);
    image.setAttribute("href", CFG.mapSrc);
    image.setAttributeNS(XLINK_NS, "xlink:href", CFG.mapSrc);

    // 暗色層（只蓋地圖，不會蓋到 HTML 介面）
    state.dimRect = svgEl("rect", {
      "class": "dim-rect", x: 0, y: 0, width: W, height: H,
      fill: "#0b1430", opacity: 0, mask: "url(#spotMask)"
    }, svg);

    var glowLayer = svgEl("g", { "class": "glow-layer" }, svg);
    var outlineLayer = svgEl("g", { "class": "outline-layer" }, svg);
    var hitLayer = svgEl("g", { "class": "hit-layer" }, svg);

    CFG.zones.forEach(function (z) {
      var d = smoothPath(z.points);

      state.holes[z.id] = svgEl("path", { d: d, fill: "#000", opacity: 0 }, holeGroup);

      var g = svgEl("g", { "class": "glow", "data-zone": z.id }, glowLayer);
      svgEl("path", {
        "class": "glow__line", d: d, fill: "none",
        stroke: "#fff6c2", "stroke-width": 10 * state.scaleX,
        "stroke-linejoin": "round", filter: "url(#glowBlur)"
      }, g);
      svgEl("path", {
        "class": "glow__line", d: d, fill: "none",
        stroke: "#ffffff", "stroke-opacity": 0.55, "stroke-width": 3 * state.scaleX,
        "stroke-linejoin": "round", filter: "url(#glowBlur)"
      }, g);
      state.glows[z.id] = g;

      svgEl("path", {
        "class": "zone-outline", d: d, fill: "rgba(255,0,170,.12)",
        stroke: "#ff00aa", "stroke-width": 3 * state.scaleX, "stroke-dasharray": "12 8"
      }, outlineLayer);

      var hit = svgEl("path", { "class": "hit", d: d, "data-zone": z.id }, hitLayer);
      var title = svgEl("title", {}, hit);
      title.textContent = z.name;

      hit.addEventListener("pointerenter", function () {
        if (state.selected !== z.id) g.classList.add("is-hover");
      });
      hit.addEventListener("pointerleave", function () { g.classList.remove("is-hover"); });
    });

    // 點地圖：點到熱區 → 選取；點到空白 → 取消
    svg.addEventListener("click", function (e) {
      var hit = e.target.closest ? e.target.closest(".hit") : null;
      if (DEBUG) showDebugCoords(e);
      if (hit) selectZone(hit.getAttribute("data-zone"));
      else clearSelection();
    });
  }

  /* ---------- 地圖名牌（與熱區同一套座標） ---------- */

  function buildPins() {
    CFG.zones.forEach(function (z) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pin";
      btn.style.setProperty("--x", z.pin.x / CFG.designWidth);
      btn.style.setProperty("--y", z.pin.y / CFG.designHeight);
      btn.innerHTML = '<span class="pin__icon">' + z.icon + "</span>" + z.name;
      btn.setAttribute("aria-label", z.name + "：" + z.game);
      btn.addEventListener("click", function () { selectZone(z.id); });
      els.pins.appendChild(btn);
      state.pins[z.id] = btn;
    });

    els.plaza.style.left = (CFG.plaza.x / CFG.designWidth * 100) + "%";
    els.plaza.style.top = (CFG.plaza.y / CFG.designHeight * 100) + "%";
  }

  /* ---------- 園區導覽牌按鈕 ---------- */

  function buildGuide() {
    // 依地圖方位排列：上排 知識學院(上中)、音樂舞台(右上)；下排 方塊工坊(左)、派對島(右下)
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

  /* ---------- 3. 選取邏輯（唯一入口） ---------- */

  function selectZone(id) {
    var z = zoneById[id];
    if (!z) return;
    var switching = state.selected && state.selected !== id;
    if (state.selected === id) return;
    state.selected = id;

    els.stage.classList.add("is-selected");
    CFG.zones.forEach(function (other) {
      var on = other.id === id;
      if (state.glows[other.id]) {
        state.glows[other.id].classList.toggle("is-active", on);
        state.glows[other.id].classList.remove("is-hover");
      }
      if (state.pins[other.id]) state.pins[other.id].classList.toggle("is-active", on);
      if (state.guideBtns[other.id]) state.guideBtns[other.id].classList.toggle("is-active", on);
    });

    els.infoZone.textContent = z.icon + " " + z.name;
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
    CFG.zones.forEach(function (z) {
      if (state.glows[z.id]) state.glows[z.id].classList.remove("is-active");
      if (state.pins[z.id]) state.pins[z.id].classList.remove("is-active");
      if (state.guideBtns[z.id]) state.guideBtns[z.id].classList.remove("is-active");
    });
    els.panel.classList.remove("is-open", "is-swap");
    els.panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("panel-open");
    animateTo(null);
  }

  /* ---------- 暗化 / 挖空的過渡動畫（用 JS 逐格更新，所有瀏覽器表現一致） ---------- */

  function animateTo(id) {
    if (!state.dimRect) return;
    var from = { dim: state.anim.dim, holes: Object.assign({}, state.anim.holes) };
    var to = { dim: id ? CFG.dimOpacity : 0, holes: {} };
    CFG.zones.forEach(function (z) { to.holes[z.id] = z.id === id ? 1 : 0; });

    var duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;
    var start = performance.now();
    cancelAnimationFrame(state.rafId);

    function frame(now) {
      var t = duration ? Math.min(1, (now - start) / duration) : 1;
      var e = 1 - Math.pow(1 - t, 3);  // easeOutCubic
      state.anim.dim = from.dim + (to.dim - from.dim) * e;
      state.dimRect.setAttribute("opacity", state.anim.dim.toFixed(3));
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

  /* ---------- 面板、按鈕、測試提示 ---------- */

  function openTestModal() {
    var z = zoneById[state.selected];
    if (!z) return;
    els.modalDetail.textContent = "已選擇「" + z.name + "」→ " + z.game;
    els.modal.hidden = false;
    els.modalOk.focus();
  }

  function closeTestModal() { els.modal.hidden = true; }

  els.closeBtn.addEventListener("click", clearSelection);
  els.playBtn.addEventListener("click", openTestModal);
  els.modalOk.addEventListener("click", closeTestModal);
  els.modal.addEventListener("click", function (e) { if (e.target === els.modal) closeTestModal(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!els.modal.hidden) closeTestModal();
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

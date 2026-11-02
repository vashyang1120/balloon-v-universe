/* ==========================================================
   氣球小V遊戲宇宙 — RPG 角色演出元件（v0.3.2 新增，v0.3.3 重新排版）
   balloon-v-universe-v0.3.3-rpg-ux-polish-test-1

   由 dialogue.js 呼叫，各畫面只需要在對話句子上標註演出狀態：
     { text, actor: { mood: "happy", full: "wave", enter: true, sparkle: true, gesture: "point" } }
       mood   ：normal / happy / remind / congrats（半身像）；沒指定 = normal
       full   ：姿勢名稱（wave / openArms / gentleRemind）；桌機站在對話框旁；放不下時改用半身像
       enter  ：完整登場（只用在第一次歡迎、新場景、通行證完成等特別情境）
       sparkle：星光
       gesture："point" 只用在「真的要玩家點某一個目標」的句子；
                而且要圖片中手指的方向實際對得到目標（依 PNG 量到的指尖位置與方向計算），
                才會換成指向姿勢；對不到就用 mood 的一般表情，由原本的聚光燈／箭頭指引。
                一般說明句一律不指向。圖片不鏡像翻轉。

   v0.3.3 半身像位置：站在對話框「後面」說話
     圖層：背景／暗化 → 半身小V → 對話框美術 → 名牌、文字、按鈕
     站在名牌上方（避開左右城堡塔），臉與肩膀露在對話框上緣之上，下半身藏在對話框後面；
     大小依對話框高度與可視高度計算（不是固定 96px）。

   演出規則（風格 B：活潑但有節奏）：
     登場     從下方滑入 + 90% → 105% → 100%，約 480ms，彈性緩動
     說話中   輕微上下起伏、約 1.4 度傾斜、約 1.5% 縮放（逐字顯示期間）
     文字完成 安靜呼吸；等待下一步時偶爾輕微傾斜
     換姿勢   200ms 交叉淡化 + 輕微位移
     提醒／恭喜 較大的單次反應
   ⚠ PNG 沒有獨立嘴巴、眼睛、手臂圖層：這裡只做整張圖片的微動畫，
     不是嘴型同步、眨眼或手臂關節動畫。

   角色圖片一律 pointer-events: none，不會擋住按鈕或教學目標的點擊。
   ========================================================== */

(function () {
  "use strict";

  var CFG = window.MAP_CONFIG;
  var AC = CFG.actor;
  var desktopMQ = window.matchMedia(CFG.desktopQuery);
  var root = document.documentElement;

  var T = AC.timing;
  root.style.setProperty("--actor-enter-ms", T.enterMs + "ms");
  root.style.setProperty("--actor-enter-rise", T.enterRise + "px");
  root.style.setProperty("--actor-swap-ms", T.swapMs + "ms");
  root.style.setProperty("--actor-swap-shift", T.swapShift + "px");
  root.style.setProperty("--actor-talk-ms", T.talkPeriodMs + "ms");
  root.style.setProperty("--actor-talk-lift", T.talkLift + "px");
  root.style.setProperty("--actor-talk-tilt", T.talkTilt + "deg");
  root.style.setProperty("--actor-talk-scale", String(1 + T.talkScale));
  root.style.setProperty("--actor-idle-ms", T.idlePeriodMs + "ms");
  root.style.setProperty("--actor-wait-ms", T.waitTiltEveryMs + "ms");
  root.style.setProperty("--actor-react-ms", T.reactMs + "ms");

  /* 低效能裝置：降低動畫幅度 */
  try {
    if ((navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)) {
      document.documentElement.classList.add("low-motion");
    }
  } catch (e) {}
  /* 分頁在背景：暫停角色動畫 */
  document.addEventListener("visibilitychange", function () {
    document.documentElement.classList.toggle("page-hidden", document.hidden);
  });

  /* ---------- 預載 10 張角色圖（避免換姿勢時才載入造成空白） ---------- */
  var loaded = {}, failed = {};
  function preload() {
    [AC.bust, AC.full].forEach(function (group) {
      Object.keys(group).forEach(function (k) {
        var src = group[k].src;
        if (loaded[src] || failed[src]) return;
        var im = new Image();
        im.decoding = "async";
        im.onload = function () { loaded[src] = { w: im.naturalWidth, h: im.naturalHeight }; };
        im.onerror = function () { failed[src] = true; console.warn("[RpgActor] 角色素材載入失敗：", src); };
        im.src = src;
      });
    });
  }

  /* ---------- 兩個演員：半身（在對話框內）／全身（對話框旁） ---------- */
  function makeActor(el) {
    return {
      el: el,
      enter: el.querySelector(".actor__enter"),
      motion: el.querySelector(".actor__motion"),
      slots: [].slice.call(el.querySelectorAll(".actor__img")),
      fx: el.querySelector(".actor__fx"),
      cur: 0, src: "", visible: false
    };
  }
  var bust = makeActor(document.getElementById("actorBust"));
  var full = makeActor(document.getElementById("actorFull"));
  // 登場／反應動畫播完就移除標記，下次才能重新播放
  [bust, full].forEach(function (a) {
    a.enter.addEventListener("animationend", function (e) {
      if (e.target === a.enter) a.enter.classList.remove("is-entering", "is-react");
    });
  });

  var state = { spec: null, mode: "bust", lastVisibleAt: 0, hideTimer: 0, reactTimer: 0, baseMood: "normal", talking: false, avoid: null, pointing: false, lastAim: null };

  function setPose(actor, pose, animate) {
    if (!pose) return;
    if (actor.src === pose.src) return;
    var next = actor.slots[1 - actor.cur], prev = actor.slots[actor.cur];
    next.src = pose.src;
    next.style.setProperty("--s", pose.scale);
    next.style.setProperty("--ox", pose.offsetX);
    next.style.setProperty("--oy", pose.offsetY);
    if (animate && actor.src) {
      next.classList.add("is-in"); prev.classList.remove("is-in");
      next.classList.remove("is-out"); prev.classList.add("is-out");
    } else {
      next.classList.add("is-in", "no-anim"); prev.classList.remove("is-in", "is-out");
      void next.offsetWidth; next.classList.remove("no-anim");
    }
    actor.cur = 1 - actor.cur;
    actor.src = pose.src;
    actor.el.dataset.pose = pose.key;
  }

  function sparkle(actor) {
    if (!actor.fx) return;
    actor.fx.innerHTML = "";
    var n = 7;
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "actor__star";
      s.textContent = i % 3 === 0 ? "✦" : "★";
      var ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      s.style.setProperty("--dx", Math.round(Math.cos(ang) * 60) + "%");
      s.style.setProperty("--dy", Math.round(Math.sin(ang) * 45 - 20) + "%");
      s.style.animationDelay = (i * 40) + "ms";
      actor.fx.appendChild(s);
    }
    setTimeout(function () { if (actor.fx) actor.fx.innerHTML = ""; }, 1100);
  }

  function playEnter(actor) {
    actor.enter.classList.remove("is-entering", "is-react");
    void actor.enter.offsetWidth;
    actor.enter.classList.add("is-entering");
  }
  function playReact(actor) {
    actor.enter.classList.remove("is-react");
    void actor.enter.offsetWidth;
    actor.enter.classList.add("is-react");
  }

  function showActor(actor, on) {
    actor.visible = on;
    actor.el.classList.toggle("is-shown", on);
  }

  function bustPose(mood) { var p = AC.bust[mood] || AC.bust.normal; p.key = mood in AC.bust ? mood : "normal"; return p; }
  function fullPose(name) { var p = AC.full[name] || AC.full.wave; p.key = name in AC.full ? name : "wave"; return p; }

  /* ---------- 公開：顯示一句的演出 ---------- */
  function show(spec, ctx) {
    spec = spec || {};
    clearTimeout(state.hideTimer);
    clearTimeout(state.reactTimer);
    state.reacting = false;
    var fresh = Date.now() - state.lastVisibleAt > 1500 && !bust.visible && !full.visible;
    state.spec = spec;
    state.avoid = (ctx && ctx.avoid) || null;
    state.baseMood = spec.mood || "normal";
    state.mode = spec.full && desktopMQ.matches ? "full" : "bust";
    if (state.baseMood === "point") state.baseMood = "happy";   // 「指向」不是情緒：由 gesture 與實際目標決定
    document.body.classList.toggle("rpg-actor-full", state.mode === "full");

    // 姿勢先依情緒決定；指向類在 layout() 依目標位置再修正
    setPose(bust, bustPose(state.baseMood), !fresh);
    if (state.mode === "full") {
      var fname = typeof spec.full === "string" && !/^point/.test(spec.full) ? spec.full : (AC.fullFor[state.baseMood] || "wave");
      setPose(full, fullPose(fname), !fresh);
      showActor(full, true); showActor(bust, false);
    } else {
      showActor(bust, true); showActor(full, false);
    }
    var a = state.mode === "full" ? full : bust;
    if (fresh || spec.enter) playEnter(a);
    else if (spec.mood === "remind" || spec.mood === "congrats") playReact(a);
    if (spec.sparkle) sparkle(a);
    state.lastVisibleAt = Date.now();
  }

  function talk(on) {
    state.talking = !!on;
    [bust, full].forEach(function (a) {
      a.motion.classList.toggle("is-talking", !!on);
      a.motion.classList.toggle("is-waiting", !on);
    });
  }

  /* 點錯等情境：暫時換成提醒表情，之後回到原本表情 */
  function react(mood, ms) {
    var a = state.mode === "full" && full.visible ? full : bust;
    if (!a.visible) return;
    clearTimeout(state.reactTimer);
    state.reacting = true;   // 反應期間 layout() 不要把姿勢改回指向
    if (a === full) setPose(full, fullPose(AC.fullFor[mood] || "gentleRemind"), true);
    else setPose(bust, bustPose(mood), true);
    playReact(a);
    state.reactTimer = setTimeout(function () {
      state.reacting = false;
      if (a === full) setPose(full, fullPose(typeof (state.spec || {}).full === "string" && !/^point/.test(state.spec.full) ? state.spec.full : (AC.fullFor[state.baseMood] || "wave")), true);
      else setPose(bust, bustPose(state.baseMood), true);
      layout(null, state.lastRects || []);
    }, ms || 1600);
  }

  function hide() {
    clearTimeout(state.hideTimer);
    // 稍微延遲：教學換步驟時對話框會立刻重開，角色不必消失再登場
    state.hideTimer = setTimeout(function () {
      if (bust.visible || full.visible) state.lastVisibleAt = Date.now();
      showActor(bust, false); showActor(full, false);
      document.body.classList.remove("rpg-actor-full");
    }, 140);
  }

  function rectsOverlap(a, b) { return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top); }

  /* ---------- 半身像大小：依對話框高度與可視高度 ----------
     由 dialogue.js 在每一句開始與視窗改變時呼叫（要在定位對話框之前，才能預留上方空間） */
  var BL = AC.bustLayout, ART = AC.boxArt;
  function size() {
    var box = document.getElementById("rpgBox");
    var Hb = box ? box.offsetHeight : 0;
    if (!Hb) return;
    var mob = !desktopMQ.matches;
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var bh = Math.round(Math.max(BL.minPx, Math.min(Hb * BL.sizeVsBox, vh * (mob ? BL.maxVh.mobile : BL.maxVh.desktop))));
    var foot = typeof BL.footY === "object" ? (mob ? BL.footY.mobile : BL.footY.desktop) : BL.footY;
    var vis = Math.max(0, Math.round(bh - (foot - ART.edgeTop) * Hb));
    root.style.setProperty("--actor-bust-h", bh + "px");
    root.style.setProperty("--actor-bust-vis", vis + "px");
    root.style.setProperty("--actor-bust-cx", BL.centerX);
    root.style.setProperty("--actor-bust-foot", foot);
    state.bh = bh; state.Hb = Hb;
  }

  /* ---------- 指向判斷：依 PNG 量到的指尖位置與方向 ---------- */
  function poseRect(containerRect, pose, natural) {
    // 與 CSS 相同：高度 = 容器高 × scale，水平置中＋offsetX，底部對齊＋offsetY（單位：容器高）
    var ch = containerRect.bottom - containerRect.top;
    var h = ch * (pose.scale || 1), w = h * natural.w / natural.h;
    var cx = (containerRect.left + containerRect.right) / 2 + (pose.offsetX || 0) * ch;
    var bottom = containerRect.bottom + (pose.offsetY || 0) * ch;
    return { left: cx - w / 2, top: bottom - h, width: w, height: h };
  }
  function aimOk(handKey, imgRect, target) {
    var hand = AC.hands[handKey];
    if (!hand || !target) return false;
    var hx = imgRect.left + hand.x * imgRect.width, hy = imgRect.top + hand.y * imgRect.height;
    var tx = (target.left + target.right) / 2, ty = (target.top + target.bottom) / 2;
    var ang = Math.atan2(-(ty - hy), tx - hx) * 180 / Math.PI;           // 0 = 右、90 = 上
    var diff = Math.abs(((ang - hand.dir) % 360 + 540) % 360 - 180);
    state.lastAim = { hand: handKey, angle: Math.round(ang), dir: hand.dir, diff: Math.round(diff), hx: Math.round(hx), hy: Math.round(hy) };
    return diff <= (AC.aimTolerance || 40);
  }
  /* 原圖尺寸：已預載就用實際值，否則用設定檔中量好的尺寸 */
  var HAND_SRC = { "assets/rpg/v_bust_point.png": "bust:point", "assets/rpg/v_full_point_left.png": "full:pointLeft", "assets/rpg/v_full_point_right.png": "full:pointRight" };
  function naturalOf(src) {
    if (loaded[src]) return loaded[src];
    var h = AC.hands[HAND_SRC[src]];
    return h ? { w: h.w, h: h.h } : { w: 1, h: 1 };
  }
  /* 指尖被對話框美術（名牌、城堡塔、上緣）擋住時也不算對得到 */
  function handVisible(handKey, imgRect, boxRect) {
    var hand = AC.hands[handKey];
    var hx = imgRect.left + hand.x * imgRect.width, hy = imgRect.top + hand.y * imgRect.height;
    var W = boxRect.right - boxRect.left, H = boxRect.bottom - boxRect.top;
    var fx = (hx - boxRect.left) / W, fy = (hy - boxRect.top) / H;
    if (fy >= ART.edgeTop) return false;                                    // 在對話框上緣之下
    if (fx >= ART.plate[0] && fx <= ART.plate[1] && fy >= ART.plateTop) return false;
    return !ART.towers.some(function (t) { return fx >= t[0] && fx <= t[1] && fy >= t[2]; });
  }

  /* ---------- 版面：由 dialogue.js 在每次定位後呼叫 ----------
     boxRect：對話框（美術）目前位置；avoidRects：教學目標（優先保留可見） */
  function layout(boxRect, avoidRects, lopts) {
    avoidRects = avoidRects || [];
    if (lopts) state.yieldToTargets = lopts.yieldToTargets !== false;
    state.lastRects = avoidRects;
    state.lastBox = boxRect || state.lastBox;
    boxRect = state.lastBox;
    var spec = state.spec || {};
    var target = avoidRects.length === 1 ? avoidRects[0] : null;   // 只有「單一目標」才可能指向
    var wantPoint = spec.gesture === "point" && !!target && !state.reacting;
    var fallbackMood = spec.mood && spec.mood !== "point" ? spec.mood : "happy";
    var W = window.innerWidth, H = window.innerHeight;
    state.pointing = false;
    state.lastAim = null;

    if (state.mode === "full" && boxRect) {
      var fh = Math.min(AC.fullHeight.desktop, Math.round(H * 0.42));
      var ok = fh >= AC.fullHeight.minDesktop;
      var fw = fh * 0.8;
      var rectFor = function (sd) {
        var left = sd === "left" ? boxRect.left - fw * 0.72 : boxRect.right - fw * 0.28;
        return { left: left, right: left + fw, top: boxRect.bottom - fh, bottom: boxRect.bottom };
      };
      var bad = function (rr) { return rr.left < 4 || rr.right > W - 4 || rr.top < 4 || avoidRects.some(function (t) { return rectsOverlap(rr, t); }); };
      var choice = null;
      if (wantPoint) {
        // 兩側都試：位置放得下、而且指尖方向真的對得到目標，才用指向姿勢
        ["left", "right"].some(function (sd) {
          var r = rectFor(sd);
          if (!ok || bad(r)) return false;
          return ["pointLeft", "pointRight"].some(function (pn) {
            var p = fullPose(pn);
            if (aimOk("full:" + pn, poseRect(r, p, naturalOf(p.src)), target)) { choice = { side: sd, rect: r, pose: pn }; return true; }
            return false;
          });
        });
      }
      if (!choice) {
        var fname = typeof spec.full === "string" && !/^point/.test(spec.full) ? spec.full : (AC.fullFor[state.baseMood] || "wave");
        var side = spec.side || "left";
        var r0 = rectFor(side);
        if (ok && bad(r0)) { side = side === "left" ? "right" : "left"; r0 = rectFor(side); }
        if (ok && !bad(r0) && (!wantPoint || spec.full)) choice = { side: side, rect: r0, pose: fname };
      }
      if (!choice) {
        // 空間不夠、會擋到目標、或要指向但對不到：改用半身像
        state.mode = "bust";
        document.body.classList.remove("rpg-actor-full");
        showActor(full, false); showActor(bust, true);
      } else {
        var rr = choice.rect;
        Object.assign(full.el.style, { left: Math.round(rr.left) + "px", top: Math.round(rr.top) + "px", width: Math.round(fw) + "px", height: Math.round(fh) + "px" });
        full.el.dataset.side = choice.side;
        if (!state.reacting) setPose(full, fullPose(choice.pose), true);
        state.pointing = /^point/.test(choice.pose);
      }
    }

    if (state.mode === "bust" && bust.visible) {
      if (!state.reacting) {
        var usePoint = false;
        if (wantPoint && boxRect) {
          var bpose = bustPose("point");
          var ir = poseRect(bust.el.getBoundingClientRect(), bpose, naturalOf(bpose.src));
          usePoint = handVisible("bust:point", ir, boxRect) && aimOk("bust:point", ir, target);
        }
        setPose(bust, bustPose(usePoint ? "point" : fallbackMood), true);
        state.pointing = usePoint;
      }
      // 教學目標優先：角色會蓋到目標時暫時讓位（對話框位置已先避開目標，通常不會發生）
      var b = bust.el.getBoundingClientRect();
      var hit = state.yieldToTargets !== false && b.width && avoidRects.some(function (t) { return rectsOverlap(b, t); });
      bust.el.classList.toggle("is-yield", !!hit);
    }
  }

  window.RpgActor = {
    preload: preload,
    show: show,
    talk: talk,
    react: react,
    hide: hide,
    layout: layout,
    size: size,
    recentlyVisible: function () { return bust.visible || full.visible || Date.now() - state.lastVisibleAt < 1500; },
    state: function () {
      return { mode: state.mode, bust: { shown: bust.visible, pose: bust.el.dataset.pose || "", yield: bust.el.classList.contains("is-yield") },
               full: { shown: full.visible, pose: full.el.dataset.pose || "", side: full.el.dataset.side || "" },
               talking: state.talking, pointing: !!state.pointing, aim: state.lastAim || null, bustHeight: state.bh || 0,
               loaded: Object.keys(loaded).length, failed: Object.keys(failed) };
    }
  };

  // 地圖載入後的空檔預載角色圖
  if ("requestIdleCallback" in window) requestIdleCallback(preload, { timeout: 2500 }); else setTimeout(preload, 800);
})();

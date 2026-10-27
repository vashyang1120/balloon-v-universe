/* ==========================================================
   氣球小V遊戲宇宙 — RPG 角色演出元件（v0.3.2 新增）
   balloon-v-universe-v0.3.2-lobby-foreground-rpg-animation-test-1

   由 dialogue.js 呼叫，各畫面只需要在對話句子上標註演出狀態：
     { text, actor: { mood: "happy", full: true, enter: true, sparkle: true, point: true } }
       mood   ：normal / happy / point / remind / congrats（半身像）；沒指定 = normal
       full   ：true 或姿勢名稱（wave / pointLeft / pointRight / openArms / gentleRemind）
                只在桌機、有足夠空間、不會蓋到目標時使用；否則自動改用半身像
       enter  ：完整登場（只用在第一次歡迎、新場景、通行證完成等特別情境）
       sparkle：星光
       point  ：依目標實際位置決定指向（pointLeft／pointRight 或半身 point）

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

  var state = { spec: null, mode: "bust", lastVisibleAt: 0, hideTimer: 0, reactTimer: 0, baseMood: "normal", talking: false, avoid: null };

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
    document.body.classList.toggle("rpg-actor-full", state.mode === "full");

    // 姿勢先依情緒決定；指向類在 layout() 依目標位置再修正
    setPose(bust, bustPose(state.baseMood), !fresh);
    if (state.mode === "full") {
      var fname = typeof spec.full === "string" ? spec.full : (AC.fullFor[state.baseMood] || "wave");
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
      if (a === full) setPose(full, fullPose(typeof (state.spec || {}).full === "string" ? state.spec.full : (AC.fullFor[state.baseMood] || "wave")), true);
      else setPose(bust, bustPose(state.baseMood), true);
      if (state.spec && state.spec.point) layout(null, state.lastRects || []);
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

  /* ---------- 版面：由 dialogue.js 在每次定位後呼叫 ----------
     wrapRect：對話框目前位置；avoidRects：教學目標（優先保留可見） */
  function layout(wrapRect, avoidRects) {
    avoidRects = avoidRects || [];
    state.lastRects = avoidRects;
    var spec = state.spec || {};
    var target = avoidRects[0] || null;
    var W = window.innerWidth, H = window.innerHeight;

    // 半身像大小：手機較小；螢幕很矮時再縮小
    var bh = desktopMQ.matches ? AC.bustHeight.desktop : AC.bustHeight.mobile;
    if (H < 680) bh = Math.round(bh * 0.88);
    root.style.setProperty("--actor-bust-h", bh + "px");

    if (state.mode === "full" && wrapRect) {
      var fh = Math.min(AC.fullHeight.desktop, Math.round(H * 0.42));
      var ok = fh >= AC.fullHeight.minDesktop;
      var fw = fh * 0.8;
      var side = "left";
      if (spec.point && target) side = (target.left + target.right) / 2 < (wrapRect.left + wrapRect.right) / 2 ? "left" : "right";
      function rectFor(sd) {
        var left = sd === "left" ? wrapRect.left - fw * 0.72 : wrapRect.right - fw * 0.28;
        return { left: left, right: left + fw, top: wrapRect.bottom - fh, bottom: wrapRect.bottom };
      }
      var r = rectFor(side);
      function bad(rr) { return rr.left < 4 || rr.right > W - 4 || rr.top < 4 || avoidRects.some(function (t) { return rectsOverlap(rr, t); }); }
      if (ok && bad(r)) { side = side === "left" ? "right" : "left"; r = rectFor(side); }
      if (!ok || bad(r)) {
        // 空間不夠或會擋到目標：改用半身像
        state.mode = "bust";
        document.body.classList.remove("rpg-actor-full");
        showActor(full, false); showActor(bust, true);
      } else {
        Object.assign(full.el.style, { left: Math.round(r.left) + "px", top: Math.round(r.top) + "px", width: Math.round(fw) + "px", height: Math.round(fh) + "px" });
        full.el.dataset.side = side;
        if (spec.point && target && !state.reacting) {
          var cx = (r.left + r.right) / 2, tx = (target.left + target.right) / 2;
          setPose(full, fullPose(tx < cx ? "pointLeft" : "pointRight"), true);
        }
      }
    }

    if (state.mode === "bust" && bust.visible) {
      // 半身指引圖只指向右方：目標在角色右邊才用，否則用一般表情（目標旁另有箭頭提示）
      if (spec.point && !state.reacting) {
        var br = bust.el.getBoundingClientRect();
        var bx = (br.left + br.right) / 2;
        var useP = target && (target.left + target.right) / 2 > bx + 20;
        setPose(bust, bustPose(useP ? "point" : (spec.mood && spec.mood !== "point" ? spec.mood : "normal")), true);
      }
      // 教學目標優先：角色會蓋到目標時暫時隱藏
      var b = bust.el.getBoundingClientRect();
      var hit = b.width && avoidRects.some(function (t) { return rectsOverlap(b, t); });
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
    recentlyVisible: function () { return bust.visible || full.visible || Date.now() - state.lastVisibleAt < 1500; },
    state: function () {
      return { mode: state.mode, bust: { shown: bust.visible, pose: bust.el.dataset.pose || "", yield: bust.el.classList.contains("is-yield") },
               full: { shown: full.visible, pose: full.el.dataset.pose || "", side: full.el.dataset.side || "" },
               talking: state.talking, loaded: Object.keys(loaded).length, failed: Object.keys(failed) };
    }
  };

  // 地圖載入後的空檔預載角色圖
  if ("requestIdleCallback" in window) requestIdleCallback(preload, { timeout: 2500 }); else setTimeout(preload, 800);
})();

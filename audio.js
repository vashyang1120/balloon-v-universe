/* ==========================================================
   氣球小V遊戲宇宙 — 全域音訊管理（v0.3.1 新增）
   balloon-v-universe-v0.3.1-onboarding-audio-ux-test-1

   ■ 背景音樂 BGM
     - 檔案：zones.js audio.bgmSrc（使用者上傳的 Suno 原檔，不改寫）
     - 整個遊戲宇宙入口（歡迎、建立通行證、RPG、大廳、切換玩家）是同一個音樂場景，
       BGM 由本模組在頁面載入時建立一次，畫面切換不會重新播放。
     - 遵守瀏覽器自動播放規則：使用者第一次有效點擊後才嘗試播放；
       被拒絕時不影響操作，狀態顯示「點一下開始音樂」，下次點擊再試。
     - 循環：兩個 <audio> 交替播放，在結尾前 crossfadeSec 秒做交叉淡化
       （原曲結尾沒有淡出，直接 loop 會有明顯斷點）。
     - 音量：GainNode 控制（手機上也有效），RPG 對話時輕微壓低。
     - 分頁切到背景時淡出暫停，回到前景時恢復。

   ■ 介面音效 SFX（Web Audio API 即時合成，不需要音檔）
     pop / tick / type / confirm / select / error / success / pass

   ■ 設定：BGM 與 SFX 各自開關，存在本機 bvUniverse_audioPrefs_v1（裝置偏好，不寫 Firebase）
   ========================================================== */

(function () {
  "use strict";

  var A = window.MAP_CONFIG.audio;
  var PREF_KEY = "bvUniverse_audioPrefs_v1";
  var log = [];                 // 最近播放紀錄（測試與 debug 用）
  function note(kind, name) { log.push({ kind: kind, name: name, t: Date.now() }); if (log.length > 400) log.shift(); }

  /* ---------- 偏好設定 ---------- */
  var prefs = { bgm: A.defaultBgmOn, sfx: A.defaultSfxOn };
  try { var saved = JSON.parse(localStorage.getItem(PREF_KEY)); if (saved) { prefs.bgm = saved.bgm !== false; prefs.sfx = saved.sfx !== false; } } catch (e) {}
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} }

  /* ---------- AudioContext（第一次有效點擊後才建立／恢復） ---------- */
  var ctx = null, sfxGain = null, bgmBus = null;
  function getCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      sfxGain = ctx.createGain(); sfxGain.gain.value = A.sfxVolume; sfxGain.connect(ctx.destination);
      bgmBus = ctx.createGain(); bgmBus.gain.value = 1; bgmBus.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  /* ==========================================================
     BGM
     ========================================================== */
  var listeners = [];
  var bgm = {
    state: "idle",       // idle / waiting(等待點擊) / loading / playing / blocked / off / missing / hidden
    els: [], gains: [], cur: 0, useGraph: false, timer: 0, xfading: false, ducked: false, wasPlaying: false
  };
  function setState(s) {
    if (bgm.state === s) return;
    bgm.state = s;
    listeners.forEach(function (f) { try { f(s); } catch (e) {} });
  }

  function makeEl() {
    var el = new Audio();
    el.src = A.bgmSrc;
    el.preload = "auto";
    el.loop = false;
    el.crossOrigin = "anonymous";
    el.addEventListener("error", function () { if (el.error) { setState("missing"); note("bgm", "missing"); } });
    return el;
  }

  function ensureEls() {
    if (bgm.els.length) return;
    bgm.els = [makeEl(), makeEl()];
    var c = getCtx();
    if (c) {
      try {
        bgm.gains = bgm.els.map(function (el) {
          var src = c.createMediaElementSource(el);
          var g = c.createGain(); g.gain.value = 0;
          src.connect(g); g.connect(bgmBus);
          return g;
        });
        bgm.useGraph = true;
      } catch (e) { bgm.useGraph = false; }
    }
  }

  function targetVol() { return A.bgmVolume * (bgm.ducked ? A.duckRatio : 1); }

  /* 把第 i 條音軌的音量在 sec 秒內變到 v */
  function ramp(i, v, sec) {
    if (bgm.useGraph && ctx) {
      var g = bgm.gains[i].gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(v, now + Math.max(0.01, sec));
    } else {
      var el = bgm.els[i], start = el.volume, t0 = performance.now();
      (function step() {
        var k = Math.min(1, (performance.now() - t0) / (sec * 1000 || 1));
        try { el.volume = Math.max(0, Math.min(1, start + (v - start) * k)); } catch (e) {}
        if (k < 1) requestAnimationFrame(step);
      })();
    }
  }

  function startBgm() {
    if (!prefs.bgm) { setState("off"); return; }
    if (bgm.state === "missing") return;
    if (document.hidden) { bgm.wasPlaying = true; return; }
    ensureEls();
    var c = getCtx();
    var resume = c && c.state !== "running" ? c.resume() : Promise.resolve();
    var el = bgm.els[bgm.cur];
    setState("loading");
    resume.then(function () {
      if (!bgm.useGraph) el.volume = 0;
      var p = el.play();
      return p && p.then ? p : Promise.resolve();
    }).then(function () {
      ramp(bgm.cur, targetVol(), A.fadeInSec);
      setState("playing");
      note("bgm", "play");
      watchLoop();
    }).catch(function (e) {
      // 自動播放被瀏覽器拒絕：不卡住畫面，下次點擊再試
      setState(e && e.name === "NotAllowedError" ? "blocked" : (bgm.state === "missing" ? "missing" : "blocked"));
      note("bgm", "blocked");
    });
  }

  function stopBgm(fadeSec, nextState) {
    clearInterval(bgm.timer);
    bgm.els.forEach(function (el, i) {
      if (el.paused) return;
      ramp(i, 0, fadeSec);
      setTimeout(function () { try { el.pause(); } catch (e) {} }, fadeSec * 1000 + 30);
    });
    bgm.xfading = false;
    setState(nextState || "off");
  }

  /* 循環：結尾前 crossfadeSec 秒，另一條音軌從頭開始並交叉淡化 */
  function watchLoop() {
    clearInterval(bgm.timer);
    bgm.timer = setInterval(function () {
      var el = bgm.els[bgm.cur];
      if (!el || el.paused || !isFinite(el.duration)) return;
      var left = el.duration - el.currentTime;
      if (!bgm.xfading && left <= A.crossfadeSec) crossfade();
    }, 100);
  }
  function crossfade() {
    var from = bgm.cur, to = 1 - bgm.cur, next = bgm.els[to];
    bgm.xfading = true;
    try { next.currentTime = 0; } catch (e) {}
    if (!bgm.useGraph) next.volume = 0;
    var p = next.play();
    (p && p.then ? p : Promise.resolve()).then(function () {
      ramp(to, targetVol(), A.crossfadeSec);
      ramp(from, 0, A.crossfadeSec);
      bgm.cur = to;
      note("bgm", "loop");
      setTimeout(function () { try { bgm.els[from].pause(); } catch (e) {} bgm.xfading = false; }, A.crossfadeSec * 1000 + 60);
    }).catch(function () { bgm.xfading = false; });
  }

  /* 第一次有效點擊：解鎖音訊並啟動 BGM（之後若被拒絕，下一次點擊再試） */
  function onGesture() {
    var c = getCtx();
    if (c && c.state === "suspended" && !document.hidden) { try { c.resume(); } catch (e) {} }
    if (prefs.bgm && (bgm.state === "idle" || bgm.state === "waiting" || bgm.state === "blocked")) startBgm();
  }
  ["pointerdown", "keydown", "touchend"].forEach(function (t) { document.addEventListener(t, onGesture, true); });

  /* 分頁切到背景：淡出暫停；回到前景：恢復 */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      bgm.wasPlaying = bgm.state === "playing";
      if (bgm.wasPlaying) stopBgm(0.3, "hidden");
      if (ctx && ctx.state === "running") { setTimeout(function () { if (document.hidden && ctx) ctx.suspend(); }, 350); }
    } else {
      if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
      if (bgm.state === "hidden" && prefs.bgm) startBgm();
    }
  });
  window.addEventListener("pagehide", function () { stopBgm(0, "idle"); });

  /* ==========================================================
     SFX：Web Audio 即時合成的柔和音效
     ========================================================== */
  var PRIORITY = { type: 0, tick: 1, pop: 1, select: 2, confirm: 2, error: 3, success: 3, pass: 3 };
  var last = { t: 0, p: -1 };

  function tone(c, at, freq, dur, opt) {
    opt = opt || {};
    var o = c.createOscillator(), g = c.createGain();
    o.type = opt.type || "sine";
    o.frequency.setValueAtTime(freq, at);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, at + dur);
    var v = opt.vol == null ? 0.35 : opt.vol;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + (opt.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(at); o.stop(at + dur + 0.02);
  }

  var SOUNDS = {
    // A. 對話框出現：輕柔 pop
    pop: function (c, t) { tone(c, t, 420, 0.12, { to: 880, vol: 0.28 }); },
    // B. 下一句：短促 boop
    tick: function (c, t) { tone(c, t, 660, 0.07, { type: "triangle", vol: 0.22 }); },
    // C. 逐字：非常輕微
    type: function (c, t) { tone(c, t, 1150 + Math.random() * 150, 0.035, { type: "triangle", vol: 0.06, attack: 0.003 }); },
    // D. 按鈕確認：清脆柔和
    confirm: function (c, t) { tone(c, t, 784, 0.09, { type: "triangle", vol: 0.24 }); tone(c, t + 0.06, 1175, 0.12, { vol: 0.2 }); },
    select: function (c, t) { tone(c, t, 587, 0.08, { type: "triangle", vol: 0.22 }); tone(c, t + 0.05, 880, 0.1, { vol: 0.16 }); },
    // E. 操作錯誤：俏皮溫和的兩音下行（不是警報）
    error: function (c, t) { tone(c, t, 523, 0.13, { type: "triangle", vol: 0.24 }); tone(c, t + 0.12, 392, 0.18, { type: "triangle", vol: 0.22, to: 370 }); },
    // F. 切換玩家完成：愉快三音上行
    success: function (c, t) { [659, 784, 1047].forEach(function (f, i) { tone(c, t + i * 0.08, f, 0.16, { type: "triangle", vol: 0.22 }); }); },
    // G. 通行證建立成功：小小的儀式感＋閃亮尾音
    pass: function (c, t) {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(c, t + i * 0.11, f, 0.22, { type: "triangle", vol: 0.24 }); });
      tone(c, t + 0.46, 1568, 0.5, { vol: 0.12 }); tone(c, t + 0.52, 2093, 0.45, { vol: 0.08 });
    }
  };

  function play(name) {
    if (!prefs.sfx || !SOUNDS[name]) return false;
    var c = getCtx();
    if (!c || c.state !== "running") return false;       // 尚未解鎖或在背景：安靜略過，不影響操作
    var now = performance.now(), p = PRIORITY[name] || 0;
    // 同一次點擊只播一個提示音：90ms 內只允許更高優先的聲音
    if (now - last.t < 90 && p <= last.p) return false;
    if (name === "type" && now - last.t < 90) return false;
    last = { t: now, p: p };
    try { SOUNDS[name](c, c.currentTime + 0.005); note("sfx", name); return true; } catch (e) { return false; }
  }

  /* ==========================================================
     對外介面
     ========================================================== */
  window.BVAudio = {
    sfx: play,
    prefs: function () { return { bgm: prefs.bgm, sfx: prefs.sfx }; },
    setBgm: function (on) {
      prefs.bgm = !!on; savePrefs();
      if (on) { if (bgm.state !== "playing") startBgm(); }
      else stopBgm(0.6, "off");
    },
    setSfx: function (on) { prefs.sfx = !!on; savePrefs(); },
    bgmState: function () { return bgm.state; },
    onBgmState: function (f) { listeners.push(f); },
    /* RPG 對話時壓低 BGM，讓對話音效清楚 */
    duck: function (on) {
      bgm.ducked = !!on;
      if (bgm.state === "playing") ramp(bgm.cur, targetVol(), 0.4);
    },
    /* 給未來正式進入遊戲時使用：淡出交給遊戲自己的音樂（本版沒有呼叫） */
    handoffToGame: function () { stopBgm(0.8, "idle"); },
    debug: function () {
      var el = bgm.els[bgm.cur];
      return {
        state: bgm.state, cur: bgm.cur, useGraph: bgm.useGraph, ctx: ctx ? ctx.state : "none",
        time: el ? el.currentTime : 0, duration: el ? el.duration : 0,
        paused: bgm.els.map(function (e) { return e.paused; }),
        gains: bgm.useGraph ? bgm.gains.map(function (g) { return +g.gain.value.toFixed(3); }) : bgm.els.map(function (e) { return +e.volume.toFixed(3); }),
        log: log.slice()
      };
    },
    _els: function () { return bgm.els; }
  };

  // 初始狀態：音樂開著 → 等待第一次點擊；關著 → off
  setState(prefs.bgm ? "waiting" : "off");
})();

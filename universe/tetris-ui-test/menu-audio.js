/* 方塊派對 menu-audio-v0.1.0-test-1
   Reuses the rhythm menu-audio implementation and existing universe lobby BGM.
   UI click copied unchanged from balloon-v-rush/assets/audio/sfx/ui/ui_button_click.mp3.
   Menu BGM yields immediately to the ORIGINAL game/song player; no new gameplay SFX.
   Reads universe device audio preferences only; writes no player or audio storage. */
(function () {
  "use strict";

  var CFG = {
    version: "tetris-menu-audio-v0.1.0-test-1",
    bgmSrc: "../../assets/audio/universe_lobby_bgm.mp3",
    bgmVolume: 0.22,          // 大廳 bgmVolume 0.25；節奏遊戲選單略低，不比正式歌曲大聲
    fadeInSec: 0.45,
    fadeOutSec: 0.25,
    crossfadeSec: 2.5,        // 同大廳 audio.js
    clickSrc: "assets/audio/ui_button_click.mp3",
    clickVolume: 0.55 * 0.85, // 同派對島 uiClick vol × SFX.volume
    clickMinGapMs: 90, clickMaxVoices: 2, sameButtonMs: 450
  };

  var PREF_KEY = "bvUniverse_audioPrefs_v1";
  var prefs = { bgm: true, sfx: true };
  function readPrefs() {
    try { var saved = JSON.parse(localStorage.getItem(PREF_KEY)); prefs.bgm = !saved || saved.bgm !== false; prefs.sfx = !saved || saved.sfx !== false; } catch (e) {}
  }
  readPrefs();
  var ctx = null, master = null;
  var log = [];
  function note(kind, name) { log.push({ kind: kind, name: name, t: Math.round(performance.now()) }); if (log.length > 300) log.shift(); }
  function getCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }

  /* ==========================================================
     BGM
     ========================================================== */
  var bgm = { els: [], gains: [], graph: false, cur: 0, playing: false, unlocked: false, blocked: false,
              generation: 0, loopTimer: 0, xfading: false, pauseTimers: [], leaving: false, attempts: 0 };

  function makeEl() {
    var el = new Audio();
    el.src = CFG.bgmSrc; el.preload = "auto"; el.loop = false; el.setAttribute("playsinline", "");
    el.addEventListener("error", function () { note("bgm", "error"); });
    return el;
  }
  function ensureEls() {
    if (bgm.els.length) return;
    bgm.els = [makeEl(), makeEl()];
    var c = getCtx();
    if (c) {
      try {
        bgm.gains = bgm.els.map(function (el) { var s = c.createMediaElementSource(el), g = c.createGain(); g.gain.value = 0; s.connect(g); g.connect(master); return g; });
        bgm.graph = true;
      } catch (e) { bgm.graph = false; }
    }
  }
  function ramp(i, v, sec) {
    if (bgm.graph && ctx) {
      var g = bgm.gains[i].gain, now = ctx.currentTime;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(v, now + Math.max(0.01, sec));
    } else {
      var el = bgm.els[i], from = el.volume, t0 = performance.now();
      (function step() {
        var k = Math.min(1, (performance.now() - t0) / Math.max(10, sec * 1000));
        try { el.volume = Math.max(0, Math.min(1, from + (v - from) * k)); } catch (e) {}
        if (k < 1) requestAnimationFrame(step);
      })();
    }
  }
  function clearPauseTimers() { bgm.pauseTimers.forEach(clearTimeout); bgm.pauseTimers = []; }

  /* 是否應該播放選單 BGM（唯一判斷點） */
  function visibleScreen() {
    var list = ["s-game", "s-title", "s-songlist", "s-result", "s-lb", "s-profile", "s-admin"];
    for (var i = 0; i < list.length; i++) { var s = document.getElementById(list[i]); if (s && !s.classList.contains("off")) return list[i]; }
    return "";
  }
  function maskShown() { var m = document.getElementById("rv-rotate-mask"); return !!m && !m.hidden; }
  function shouldPlay() {
    if (!prefs.bgm || bgm.leaving || document.hidden) return false;
    if (typeof mAudio !== "undefined" && !mAudio.paused && !mAudio.ended) return false;                       // 演奏中、暫停、恢復倒數、遊戲中開角色設定
    var scr = visibleScreen();
    if (!scr || scr === "s-game") return false;
    if (maskShown()) return false;                          // 直向提示期間暫停
    if (document.getElementById("bv-test-chooser")) return false;
    return true;
  }

  function startPlay(fromGesture) {
    if (bgm.playing) return;
    ensureEls();
    clearPauseTimers();
    var el = bgm.els[bgm.cur], c = getCtx();
    bgm.playing = true;
    var generation = ++bgm.generation;
    if (!bgm.graph) el.volume = 0;
    var resume = (c && c.state !== "running") ? c.resume() : Promise.resolve();
    var p;
    try { p = el.play(); } catch (e) { p = Promise.reject(e); }   // 在使用者手勢中同步呼叫 play()
    Promise.all([resume, (p && p.then) ? p : Promise.resolve()]).then(function () {
      if (generation !== bgm.generation) return;
      bgm.unlocked = true; bgm.blocked = false;
      if (!bgm.playing) { try { el.pause(); } catch (e) {} return; }
      // 手勢解鎖：等這次點擊的原事件（例如開始歌曲）跑完，再確認一次
      setTimeout(function () {
        if (generation !== bgm.generation || !bgm.playing) return;
        if (!shouldPlay()) { pausePlay(0); return; }
        el.muted = false;
        ramp(bgm.cur, CFG.bgmVolume, CFG.fadeInSec);
        watchLoop();
        note("bgm", fromGesture ? "play-gesture" : "play");
      }, fromGesture ? 120 : 0);
    }).catch(function (err) {
      if (generation !== bgm.generation) return;
      bgm.playing = false; el.muted = false;
      if (err && err.name === "AbortError") {        // 自己呼叫 pause() 中斷（例如第一次點擊就是開始歌曲）：不是被瀏覽器擋
        if (fromGesture) bgm.unlocked = true;          // 這次手勢已解鎖播放權限
        note("bgm", "aborted");
        return;
      }
      bgm.blocked = true;                              // 被瀏覽器擋：不影響畫面，等下一次點擊
      note("bgm", "blocked");
    });
  }
  function pausePlay(fadeSec) {
    ++bgm.generation;
    if (!bgm.els.length) { bgm.playing = false; return; }
    var wasPlaying = bgm.playing;
    bgm.playing = false;
    clearInterval(bgm.loopTimer); bgm.loopTimer = 0;
    clearPauseTimers();
    bgm.els.forEach(function (el, i) {
      if (fadeSec > 0 && !el.paused) {
        ramp(i, 0, fadeSec);
        bgm.pauseTimers.push(setTimeout(function () { if (!bgm.playing) { try { el.pause(); } catch (e) {} } }, fadeSec * 1000 + 40));
      } else {
        if (bgm.graph) { try { bgm.gains[i].gain.cancelScheduledValues(0); bgm.gains[i].gain.value = 0; } catch (e) {} } else { try { el.volume = 0; } catch (e) {} }
        try { el.pause(); } catch (e) {}
      }
    });
    if (bgm.xfading) {   // 交叉淡化途中暫停：只保留目前主軌
      bgm.xfading = false;
    }
    if (wasPlaying) note("bgm", fadeSec > 0 ? "fade-pause" : "pause");
  }
  function watchLoop() {
    clearInterval(bgm.loopTimer);
    bgm.loopTimer = setInterval(function () {
      var el = bgm.els[bgm.cur];
      if (!bgm.playing || !el || el.paused || !isFinite(el.duration)) return;
      if (!bgm.xfading && el.duration - el.currentTime <= CFG.crossfadeSec) crossfade();
    }, 250);
  }
  function crossfade() {
    var from = bgm.cur, to = 1 - bgm.cur, next = bgm.els[to], generation = bgm.generation;
    bgm.xfading = true;
    try { next.currentTime = 0; } catch (e) {}
    if (!bgm.graph) next.volume = 0;
    var p = next.play();
    (p && p.then ? p : Promise.resolve()).then(function () {
      if (generation !== bgm.generation) return;
      if (!bgm.playing) { try { next.pause(); } catch (e) {} bgm.xfading = false; return; }
      ramp(to, CFG.bgmVolume, CFG.crossfadeSec); ramp(from, 0, CFG.crossfadeSec);
      bgm.cur = to; note("bgm", "loop");
      bgm.pauseTimers.push(setTimeout(function () { if (generation !== bgm.generation) return; try { bgm.els[from].pause(); } catch (e) {} bgm.xfading = false; }, CFG.crossfadeSec * 1000 + 60));
    }).catch(function () { if (generation === bgm.generation) bgm.xfading = false; });
  }

  /* 依目前狀態播放或暫停（畫面切換、旋轉、分頁切換時呼叫） */
  function update(reason) {
    if (shouldPlay()) {
      if (bgm.playing) return;
      if (bgm.unlocked) { startPlay(false); return; }
      // 尚未經過使用者操作：瀏覽器有回報「已互動」才嘗試自動播放；否則等第一次有效點擊（不產生錯誤、不卡畫面）
      var ua = navigator.userActivation;
      if (!ua || ua.hasBeenActive) { if (!bgm.blocked) startPlay(false); }
      else { bgm.blocked = true; note("bgm", "wait-gesture"); }
    } else if (bgm.playing) {
      // 進入演奏：較短淡出，確保在歌曲開始前完全停止
      pausePlay(reason === "game" ? 0.15 : CFG.fadeOutSec);
    }
  }

  /* 第一次有效點擊：在手勢內解鎖 AudioContext 與 BGM（靜音播放），原事件跑完後再決定是否出聲 */
  function onGesture(e) {
    var c = getCtx();
    if (c && c.state === "suspended" && !document.hidden) { try { c.resume(); } catch (err) {} }
    decodeClick();
    if (bgm.playing || bgm.leaving || document.hidden) return;
    if (!bgm.unlocked || bgm.blocked) {
      ensureEls();
      bgm.els[bgm.cur].muted = true;      // 先靜音解鎖；確認仍在選單畫面才取消靜音並淡入
      startPlay(true);
    }
  }

  /* ==========================================================
     UI 按鈕音效（派對島 uiClick）
     ========================================================== */
  var sfx = { raw: null, buffer: null, loading: false, pending: 0, voices: [], lastAt: -1e9, lastBtn: null, lastBtnAt: 0 };
  /* 頁面載入時先下載音效檔（不建立 AudioContext）；第一次點擊建立 AudioContext 後再解碼 */
  function prefetchClick() {
    if (sfx.raw || sfx.loading) return;
    sfx.loading = true;
    fetch(CFG.clickSrc).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.arrayBuffer(); })
      .then(function (ab) { sfx.raw = ab; sfx.loading = false; if (ctx) decodeClick(); })
      .catch(function () { sfx.loading = false; sfx.buffer = false; note("sfx", "load-failed"); });
  }
  var decoding = false;
  function decodeClick() {
    var c = ctx;
    if (!c || !sfx.raw || sfx.buffer || decoding) return;
    decoding = true;
    var ab = sfx.raw.slice(0);
    new Promise(function (res, rej) { var pr = c.decodeAudioData(ab, res, rej); if (pr && pr.then) pr.then(res, rej); })
      .then(function (buf) {
        sfx.buffer = buf; decoding = false; note("sfx", "decoded");
        if (sfx.pending && performance.now() - sfx.pending < 250) { sfx.pending = 0; sfx.lastAt = -1e9; playClick(); }   // 第一次點擊在解碼完成前發生：補播一次
      })
      .catch(function () { decoding = false; sfx.buffer = false; note("sfx", "decode-failed"); });
  }
  function playClick() {
    var c = ctx;
    if (!prefs.sfx || bgm.leaving || document.hidden) return false;
    if (c && !sfx.buffer && sfx.buffer !== false) { sfx.pending = performance.now(); decodeClick(); return false; }
    if (!c || !sfx.buffer) return false;
    var now = performance.now();
    if (now - sfx.lastAt < CFG.clickMinGapMs) return false;
    sfx.lastAt = now;
    function go() {
      sfx.voices = sfx.voices.filter(function (v) { return !v.ended; });
      if (sfx.voices.length >= CFG.clickMaxVoices) { try { sfx.voices[0].src.stop(); } catch (e) {} sfx.voices[0].ended = true; sfx.voices.shift(); }
      var src = c.createBufferSource(), g = c.createGain();
      src.buffer = sfx.buffer; g.gain.value = CFG.clickVolume; src.connect(g); g.connect(master);
      var v = { src: src, ended: false }; src.onended = function () { v.ended = true; };
      src.start(0); sfx.voices.push(v); note("sfx", "click");
    }
    if (c.state === "running") go();
    else { try { c.resume().then(function () { if (performance.now() - now < 200) go(); }); } catch (e) {} }
    return true;
  }
  function uiPress(e) {
    try {
      var t = e.target && e.target.closest ? e.target.closest('button, [role="button"]') : null;
      if (!t || t.disabled || t.getAttribute("aria-disabled") === "true") return;
      if (t.closest("#uit-ctrl, #mob-ctrl")) return; // 原遊戲操作保留原音效
      var now = performance.now();
      if (t === sfx.lastBtn && now - sfx.lastBtnAt < CFG.sameButtonMs) return;   // pointerdown＋click 只算一次
      sfx.lastBtn = t; sfx.lastBtnAt = now;
      playClick();
    } catch (err) {}
  }

  /* ==========================================================
     生命週期
     ========================================================== */
  var mounted = false;
  function mount() {
    if (mounted) return;          // 只註冊一次監聽器
    mounted = true;
    prefetchClick();
    ["pointerdown", "touchend", "keydown", "click"].forEach(function (t) { document.addEventListener(t, onGesture, true); });
    document.addEventListener("pointerdown", function (e) { if (e.isPrimary !== false) uiPress(e); }, true);
    document.addEventListener("click", function (e) { if (e.detail === 0) uiPress(e); }, true);   // 鍵盤 Enter／空白鍵
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { pausePlay(0); if (ctx && ctx.state === "running") { try { ctx.suspend(); } catch (e) {} } }
      else { if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} } update("visible"); }
    });
    window.addEventListener("pagehide", function () { stopAll(); });
    window.addEventListener("pageshow", function (e) { if (e.persisted) { bgm.leaving = false; update("pageshow"); } });
  }
  function stopAll() {
    bgm.leaving = true;
    pausePlay(0);
    sfx.voices.forEach(function (v) { try { v.src.stop(); } catch (e) {} });
    sfx.voices = [];
    note("bgm", "stop-all");
  }

  window.BVTetrisMenuAudio = {
    config: CFG,
    mount: mount,
    update: update,                 // 畫面切換／旋轉後呼叫
    onHomeIntro: function () { update("intro"); },   // 首次首頁登場時嘗試淡入
    onGameStart: function () { pausePlay(0.15); },   // 開始歌曲／再玩一次：立即淡出
    stopAll: stopAll,               // 返回遊戲宇宙、離開頁面
    shouldPlay: shouldPlay,
    debug: function () {
      var el = bgm.els[bgm.cur];
      return { playing: bgm.playing, unlocked: bgm.unlocked, blocked: bgm.blocked, graph: bgm.graph, els: bgm.els.length, cur: bgm.cur,
        paused: bgm.els.map(function (e) { return e.paused; }), muted: bgm.els.map(function (e) { return e.muted; }),
        gains: bgm.graph ? bgm.gains.map(function (g) { return +g.gain.value.toFixed(3); }) : bgm.els.map(function (e) { return +e.volume.toFixed(3); }),
        time: el ? +el.currentTime.toFixed(2) : 0, ctx: ctx ? ctx.state : "none", clickLoaded: !!sfx.buffer, log: log.slice() };
    }
  };

  var originalPlaySong = window.playSong;
  if (typeof originalPlaySong === "function") {
    window.playSong = function () {
      pausePlay(0);
      var result = originalPlaySong.apply(this, arguments);
      setTimeout(function () { update("song-request"); }, 300);
      return result;
    };
  }
  var originalStartGame = window.startGame;
  if (typeof originalStartGame === "function") {
    window.startGame = function () { pausePlay(0); return originalStartGame.apply(this, arguments); };
  }
  if (typeof mAudio !== "undefined") {
    mAudio.addEventListener("play", function () { pausePlay(0); });
    ["pause", "ended", "error"].forEach(function (name) { mAudio.addEventListener(name, function () { update("song-" + name); }); });
  }
  var screens = ["s-title", "s-game", "s-result", "s-lb", "s-profile"];
  var observer = new MutationObserver(function () { update("screen"); });
  screens.forEach(function (id) { var el = document.getElementById(id); if (el) observer.observe(el, { attributes: true, attributeFilter: ["class"] }); });
  window.addEventListener("storage", function (e) { if (e.key === PREF_KEY || e.key === null) { readPrefs(); update("prefs"); } });
  window.addEventListener("pagehide", function () { if (typeof pauseSong === "function") pauseSong(); });
  mount();
  update("mount");
})();

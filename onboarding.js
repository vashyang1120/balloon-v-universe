/* ==========================================================
   氣球小V遊戲宇宙 — 新手引導、找回通行證、首次入園教學（v0.3.0 新增）
   balloon-v-universe-v0.3.1-onboarding-audio-ux-test-1

   啟動規則：
   - 本機沒有記住任何玩家 → 小V歡迎 →「建立新玩家」或「我玩過了」
   - 本機記住一位或多位玩家 → 直接進入大廳（目前玩家 = 上次選用的玩家）

   建立新玩家流程：
     小V歡迎 → 輸入 ID → 第一次固定圖案提醒（完整 RPG，不可略過）
     → 選擇身份圖案 → 第二次完整提醒與確認（不可略過；可重新選擇）
     → 檢查是否已存在 → 建立 → 展示通行證 → 轉場 → 大廳 → 首次教學
   ========================================================== */

(function () {
  "use strict";

  var CFG = window.MAP_CONFIG;
  var T = CFG.onboarding;
  var TU = CFG.tutorial;
  var ID = window.PlayerIdentity;
  var Store = window.PlayerStore;
  var L = window.Lobby;
  var D = window.RpgDialogue;
  var esc = L.escapeHtml;

  var flow = document.getElementById("flow");
  var card = document.getElementById("flowCard");
  var V = CFG.dialogue.speakerName;

  /* 新手流程中的對話：不用保護層、不可略過，並避開目前顯示的操作卡片（依實際位置計算） */
  function FLOW_OPTS() {
    return { shield: false, allowSkip: false, avoid: function () { return flow.hidden || card.hidden ? [] : [card]; } };
  }
  function err(id, msg) { var e = document.getElementById(id); if (e) e.textContent = msg; L.sfx("error"); }

  function say(text, extra) { return Object.assign({ speaker: V, text: text }, extra || {}); }
  function fill(s, draft) {
    return s.replace("{id}", draft.id || "").replace("{avatar}", ID.avatarLabel(draft.base) || "");
  }

  /* ---------- 操作卡片 ---------- */
  function showFlow(html, cls) {
    flow.hidden = false;
    document.body.classList.add("flow-open");
    card.className = "flow__card" + (cls ? " " + cls : "");
    card.innerHTML = html || "";
    card.hidden = !html;
  }
  function closeFlow() {
    flow.hidden = true;
    card.innerHTML = "";
    document.body.classList.remove("flow-open");
  }

  function avatarGrid(selected) {
    return '<div class="pick-grid" role="radiogroup" aria-label="身份圖案">' +
      ID.builtinAvatars.map(function (a, i) {
        var on = a.key === selected;
        return '<button type="button" class="pick' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '" data-key="' + a.key + '" aria-label="' + esc(a.label) + '">' +
          L.avatarHtml(a.key, on ? "gold" : (i % 2 ? "pink" : "blue"), null, "av--pick") +
          '<span class="pick__check" aria-hidden="true">✓</span>' +
          '<span class="pick__label">' + esc(a.label) + "</span></button>";
      }).join("") + "</div>";
  }
  /* 選了圖案後：底部固定列顯示「已選：xxx」，確認按鈕變成可按的高亮狀態 */
  function markPicked(key) {
    var lab = document.getElementById("fPicked"), btn = card.querySelector(".flow__foot .btn--primary");
    if (lab) { lab.innerHTML = key ? "已選：<b>" + esc(ID.avatarLabel(key)) + "</b>" : "還沒有選擇圖案"; lab.classList.toggle("is-on", !!key); }
    if (btn) { btn.classList.toggle("is-ready", !!key); if (key) { btn.classList.remove("is-pop"); void btn.offsetWidth; btn.classList.add("is-pop"); } }
  }
  function pickFoot(backLabel, nextId, nextLabel) {
    return '<div class="flow__foot">' +
      '<span class="flow__picked" id="fPicked">還沒有選擇圖案</span>' +
      '<p class="flow__error" id="fErr" role="alert"></p>' +
      '<div class="flow__buttons">' +
        '<button class="btn btn--ghost" id="fBack" type="button">' + backLabel + "</button>" +
        '<button class="btn btn--primary" id="' + nextId + '" type="button">' + nextLabel + "</button>" +
      "</div></div>";
  }
  function bindGrid(onPick) {
    card.querySelectorAll(".pick").forEach(function (b, i) {
      b.addEventListener("click", function () {
        card.querySelectorAll(".pick").forEach(function (o, j) {
          var on = o === b;
          o.classList.toggle("is-on", on);
          o.setAttribute("aria-checked", on);
          var key = o.dataset.key;
          o.querySelector(".av").outerHTML = L.avatarHtml(key, on ? "gold" : (j % 2 ? "pink" : "blue"), null, "av--pick");
        });
        L.sfx("select");
        onPick(b.dataset.key);
        markPicked(b.dataset.key);
      });
    });
  }

  /* ==========================================================
     入口：建立新玩家 / 我玩過了
     ========================================================== */
  function startGate(fromLobby) {
    showFlow(null);
    var choices = [
      { label: "建立新玩家", value: "new", primary: true },
      { label: "我玩過了", value: "returning" }
    ];
    if (fromLobby) choices.push({ label: "取消", value: "cancel" });
    var lines = fromLobby
      ? [say(T.addPlayerPrompt, { choices: choices })]
      : [say(T.welcome[0]), say(T.welcome[1], { choices: choices })];
    D.ask(lines, FLOW_OPTS()).then(function (r) {
      if (r.replaced) return;
      if (r.choice === "new") newPlayer({ fromLobby: fromLobby });
      else if (r.choice === "returning") returning({ fromLobby: fromLobby });
      else closeFlow();
    });
  }

  /* ==========================================================
     建立新玩家
     ========================================================== */
  function newPlayer(opts) {
    var draft = { id: "", base: "", seenR1: false, seenR2: false, fromLobby: !!(opts && opts.fromLobby) };
    D.ask([say(T.newStart)], FLOW_OPTS()).then(function () { stepId(draft); });
  }

  function stepId(draft) {
    showFlow(
      '<div class="flow__step">建立通行證 · 1 / 3</div>' +
      '<h2 class="flow__title">輸入你的玩家 ID</h2>' +
      '<p class="flow__hint">' + esc(T.askId) + "</p>" +
      '<input class="flow__input" id="fId" type="text" maxlength="40" autocomplete="off" placeholder="例如：小明" value="' + esc(draft.id) + '">' +
      '<p class="flow__error" id="fErr" role="alert"></p>' +
      '<div class="flow__buttons">' +
        '<button class="btn btn--ghost" id="fBack" type="button">返回</button>' +
        '<button class="btn btn--primary" id="fNext" type="button">下一步</button>' +
      "</div>", "flow__card--id");
    var input = document.getElementById("fId");
    setTimeout(function () { input.focus(); }, 50);
    function next() {
      var v = ID.validateNewId(input.value);
      if (!v.ok) { err("fErr", v.msg); input.focus(); return; }
      draft.id = v.id;
      if (draft.seenR1) { stepAvatar(draft); return; }
      // 第一次提醒：完整 RPG，不可略過；看完才進入圖案選擇
      showFlow(null);
      D.ask([say(T.reminder1, { noSkip: true })], FLOW_OPTS()).then(function () {
        draft.seenR1 = true;
        stepAvatar(draft);
      });
    }
    document.getElementById("fNext").addEventListener("click", next);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); next(); } });
    document.getElementById("fBack").addEventListener("click", function () { startGate(draft.fromLobby); });
  }

  function stepAvatar(draft) {
    showFlow(
      '<div class="flow__head">' +
        '<div class="flow__step">建立通行證 · 2 / 3</div>' +
        '<h2 class="flow__title">選擇你的專屬身份圖案</h2>' +
        '<p class="flow__notice">⚠️ ' + esc(T.reminder1) + "</p>" +
      "</div>" +
      '<div class="flow__body">' + avatarGrid(draft.base) + "</div>" +
      pickFoot("上一步", "fNext", "確認這個圖案"), "flow__card--pick");
    markPicked(draft.base);
    bindGrid(function (key) { draft.base = key; document.getElementById("fErr").textContent = ""; });
    document.getElementById("fBack").addEventListener("click", function () { stepId(draft); });
    document.getElementById("fNext").addEventListener("click", function () {
      if (!draft.base) { err("fErr", "請先點一個圖案喔！"); return; }
      stepConfirm(draft);
    });
  }

  function previewCard(draft, sub) {
    return '<div class="flow__step">建立通行證 · 3 / 3</div>' +
      '<h2 class="flow__title">確認你的專屬身份</h2>' +
      '<div class="confirm">' +
        L.avatarHtml(draft.base, "gold", null, "av--lg") +
        '<div class="confirm__text"><span class="confirm__label">玩家 ID</span><b class="confirm__id">' + esc(draft.id) + "</b>" +
        '<span class="confirm__label">專屬身份圖案</span><b>' + esc(ID.avatarLabel(draft.base)) + "</b></div>" +
      "</div>" + (sub || "");
  }

  function stepConfirm(draft) {
    showFlow(previewCard(draft), "flow__card--confirm");
    var choices = [
      { label: "確認建立", value: "ok", primary: true },
      { label: "重新選擇圖案", value: "avatar" },
      { label: "修改 ID", value: "id" }
    ];
    // 第二次完整提醒：不可省略。重選後再確認時使用較短但內容完整的版本
    var lines = draft.seenR2
      ? [say(fill(T.reminder2Short, draft), { noSkip: true, choices: choices })]
      : [say(fill(T.reminder2[0], draft), { noSkip: true }),
         say(fill(T.reminder2[1], draft), { noSkip: true }),
         say(fill(T.reminder2[2], draft), { noSkip: true, choices: choices })];
    D.ask(lines, FLOW_OPTS()).then(function (r) {
      if (r.replaced) return;
      draft.seenR2 = true;
      if (r.choice === "ok") create(draft);
      else if (r.choice === "avatar") stepAvatar(draft);
      else stepId(draft);
    });
  }

  function create(draft) {
    showFlow(previewCard(draft, '<p class="flow__busy"><span class="spinner"></span>' + esc(T.creating) + "</p>"), "flow__card--confirm");
    Store.createPlayer(draft.id, draft.base).then(function (res) {
      if (res.status === "duplicate") {
        showFlow(previewCard(draft), "flow__card--confirm");
        return D.ask([say(T.duplicate, { choices: [
          { label: "我玩過了", value: "returning", primary: true },
          { label: "重新選擇", value: "retry" }
        ] })], FLOW_OPTS()).then(function (r) {
          if (r.choice === "returning") returning({ fromLobby: draft.fromLobby, prefill: { id: draft.id, base: draft.base } });
          else stepId(draft);   // 保留已輸入的 ID 與圖案，讓玩家修改
        });
      }
      var entry = { playerKey: res.playerKey, id: draft.id, baseAvatarKey: draft.base, displayAvatarKey: draft.base };
      Store.remember(entry);
      Store.setCurrentKey(res.playerKey);
      showPass(entry, res.profile);
    }).catch(function (err) {
      console.warn("[Onboarding] 建立失敗：", err && err.message);
      showFlow(previewCard(draft), "flow__card--confirm");
      D.ask([say(T.createFailed, { choices: [
        { label: "再試一次", value: "retry", primary: true },
        { label: "返回修改", value: "back" }
      ] })], FLOW_OPTS()).then(function (r) {
        if (r.choice === "retry") create(draft); else stepConfirm(draft);
      });
    });
  }

  /* ---------- 通行證展示 → 轉場進入大廳 ---------- */
  function showPass(entry, profile) {
    var p = { id: entry.id, baseAvatarKey: entry.baseAvatarKey, createdAt: profile && profile.createdAt };
    showFlow(
      '<h2 class="flow__title">🎉 你的專屬通行證</h2>' +
      '<div class="pass-panel">' + L.passPanelHtml(p, "created") + "</div>" +
      '<p class="flow__hint">記住你的玩家 ID「' + esc(entry.id) + "」和這個「" + esc(ID.avatarLabel(entry.baseAvatarKey)) + "」圖案，下次就能找回這張通行證。</p>" +
      '<div class="flow__buttons"><button class="btn btn--primary btn--big" id="fEnter" type="button">進入遊樂園 ▶</button></div>',
      "flow__card--pass");
    L.sfx("pass");
    D.ask([say(T.created)], FLOW_OPTS());
    document.getElementById("fEnter").addEventListener("click", function () {
      if (D.isOpen()) D.close();
      enterLobby(entry, { tutorial: true, transition: true });
    });
  }

  function enterLobby(entry, opts) {
    opts = opts || {};
    var ms = CFG.animation.passToLobbyMs;
    function go() {
      closeFlow();
      flow.classList.remove("is-leaving");
      L.setLobbyVisible(true);
      L.loadPlayer(entry).then(function (r) {
        if (r.status !== "ok") return;
        if (opts.tutorial && !Store.tutorialDone(r.data.playerKey)) setTimeout(runTutorial, 400);
        else if (opts.welcomeBack) D.ask([say(T.returningFound.replace("{id}", r.data.id))]);
      });
    }
    if (opts.transition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      flow.style.setProperty("--leave-ms", ms + "ms");
      flow.classList.add("is-leaving");
      setTimeout(go, ms);
    } else go();
  }

  /* ==========================================================
     我玩過了：用 ID ＋ 當初的身份圖案找回通行證
     ========================================================== */
  function returning(opts) {
    opts = opts || {};
    var pre = opts.prefill || {};
    var sel = { id: pre.id || "", base: pre.base || "" };
    var detected = Store.detectGameLocalIdentities().filter(function (d) {
      return !Store.getRemembered().some(function (r) { return r.playerKey === d.playerKey; });
    });
    var quick = detected.length
      ? '<div class="quick"><p class="flow__hint">在這台裝置找到你玩過的遊戲身份，點一下就能帶入：</p>' +
        detected.map(function (d, i) {
          return '<button type="button" class="quick__item" data-i="' + i + '">' + L.avatarHtml(d.baseAvatarKey, "blue", null, "av--sm") +
            "<span><b>" + esc(d.id) + "</b><small>" + esc(d.sources.join("、")) + "</small></span></button>";
        }).join("") + "</div>"
      : "";
    showFlow(
      '<div class="flow__head">' +
        '<div class="flow__step">我玩過了</div>' +
        '<h2 class="flow__title">找回我的通行證</h2>' +
        '<p class="flow__hint">' + esc(T.returningAsk) + "</p>" +
      "</div>" +
      '<div class="flow__body">' + quick +
        '<input class="flow__input" id="fId" type="text" maxlength="40" autocomplete="off" placeholder="玩家 ID" value="' + esc(sel.id) + '">' +
        '<p class="flow__label">當初選的專屬身份圖案</p>' +
        avatarGrid(sel.base) +
      "</div>" +
      pickFoot("返回", "fFind", "找回通行證"), "flow__card--pick");
    markPicked(sel.base);
    bindGrid(function (key) { sel.base = key; });
    card.querySelectorAll(".quick__item").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = detected[+b.dataset.i];
        returning({ fromLobby: opts.fromLobby, prefill: { id: d.id, base: d.baseAvatarKey } });
      });
    });
    document.getElementById("fBack").addEventListener("click", function () { startGate(opts.fromLobby); });
    document.getElementById("fFind").addEventListener("click", function () {
      var errEl = document.getElementById("fErr");
      var id = document.getElementById("fId").value.trim();
      if (!id) { err("fErr", "請輸入玩家 ID"); return; }
      if (!sel.base) { err("fErr", "請選擇當初的身份圖案"); return; }
      var key = ID.makePlayerKey(id, sel.base);
      var btn = document.getElementById("fFind");
      btn.disabled = true;
      btn.textContent = "尋找中…";
      Store.loadPlayerData(key, { id: id, baseAvatarKey: sel.base }).then(function (res) {
        if (res.status !== "ok") {
          return D.ask([say(T.returningNotFound, { choices: [
            { label: "再試一次", value: "retry", primary: true },
            { label: "建立新玩家", value: "new" }
          ] })], FLOW_OPTS()).then(function (r) {
            if (r.choice === "new") newPlayer({ fromLobby: opts.fromLobby });
            else returning({ fromLobby: opts.fromLobby, prefill: { id: id, base: sel.base } });
          });
        }
        var d = res.data;
        var entry = { playerKey: d.playerKey, id: d.id || id, baseAvatarKey: d.baseAvatarKey || sel.base, displayAvatarKey: d.displayAvatarKey };
        Store.remember(entry);
        Store.setCurrentKey(entry.playerKey);
        enterLobby(entry, { welcomeBack: true });
      }).catch(function (e) {
        console.warn("[Onboarding] 找回失敗：", e && e.message);
        btn.disabled = false;
        btn.textContent = "找回通行證";
        errEl.textContent = T.loadFailed;
        L.sfx("error");
      });
    });
  }

  /* ==========================================================
     首次入園教學（v0.3.1 重寫）
     - 每一步明確定義：類型（intro 只是介紹 / action 要實際操作）、合法操作、點錯回饋
     - 所有大廳操作都經過 main.js 的 guard()；教學只要設定一個規則函式，
       不需要在各個按鈕寫特例，也不是靠 pointer-events 擋住（點錯一定有回饋）
     - 聚光燈只負責「看哪裡」（不攔截點擊）；目標旁的小提示負責「點哪裡」
     ========================================================== */
  var spot = document.getElementById("spot");
  var ring = document.getElementById("spotRing");
  var hint = document.getElementById("spotHint");
  var hintText = document.getElementById("spotHintText");
  var blocks = {};
  spot.querySelectorAll(".spot__block").forEach(function (b) { blocks[b.dataset.side] = b; });
  var spotTargets = null, spotRaf = 0, hintTimer = 0, hintNormal = "";

  function rectOf(targets) {
    var r = null;
    (targets || []).forEach(function (t) {
      if (!t || t.hidden || !t.isConnected) return;
      var b = t.getBoundingClientRect();
      if (!b.width && !b.height) return;
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
            : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    return r;
  }
  function layoutSpot() {
    if (!spotTargets) return;
    var r = rectOf(spotTargets);
    var W = window.innerWidth, H = window.innerHeight;
    if (r) {
      var pad = 8;
      var l = Math.max(0, r.left - pad), t = Math.max(0, r.top - pad), rr = Math.min(W, r.right + pad), bb = Math.min(H, r.bottom + pad);
      Object.assign(blocks.top.style, { left: 0, top: 0, width: W + "px", height: t + "px" });
      Object.assign(blocks.bottom.style, { left: 0, top: bb + "px", width: W + "px", height: Math.max(0, H - bb) + "px" });
      Object.assign(blocks.left.style, { left: 0, top: t + "px", width: l + "px", height: Math.max(0, bb - t) + "px" });
      Object.assign(blocks.right.style, { left: rr + "px", top: t + "px", width: Math.max(0, W - rr) + "px", height: Math.max(0, bb - t) + "px" });
      Object.assign(ring.style, { left: l + "px", top: t + "px", width: (rr - l) + "px", height: (bb - t) + "px" });
      if (!hint.hidden) {
        // 目標旁小提示：優先放在目標上方，放不下就放下方；左右不超出畫面
        var hw = hint.offsetWidth, hh = hint.offsetHeight, cx = (l + rr) / 2;
        var above = t - hh - 14 >= 8;
        var ht = above ? t - hh - 14 : Math.min(H - hh - 8, bb + 14);
        var hl = Math.max(8, Math.min(W - hw - 8, cx - hw / 2));
        hint.style.left = hl + "px"; hint.style.top = ht + "px";
        hint.style.setProperty("--arrow-x", Math.max(16, Math.min(hw - 16, cx - hl)) + "px");
        hint.classList.toggle("is-above", above);
        hint.classList.toggle("is-below", !above);
      }
    }
    spotRaf = requestAnimationFrame(layoutSpot);
  }
  function showSpot(targets, hintMsg, opts) {
    opts = opts || {};
    spotTargets = (targets || []).filter(Boolean);
    spot.hidden = false;
    spot.classList.toggle("spot--hintonly", !!opts.hintOnly);
    hintNormal = hintMsg || "";
    setHint(hintNormal, false);
    var first = spotTargets[0];
    if (first && first.scrollIntoView && !opts.noScroll) first.scrollIntoView({ block: "nearest", behavior: "instant" });
    cancelAnimationFrame(spotRaf);
    layoutSpot();
  }
  function setHint(msg, isWrong) {
    hint.hidden = !msg;
    hintText.textContent = msg || "";
    hint.classList.toggle("is-wrong", !!isWrong);
  }
  function hideSpot() {
    spot.hidden = true; spotTargets = null; cancelAnimationFrame(spotRaf);
    clearTimeout(hintTimer); setHint("", false);
  }
  /* 點錯：小提示換成溫和提醒、聚光燈框抖一下、播放提醒音；2.4 秒後恢復原本小提示 */
  function wrongFeedback(msg) {
    L.sfx("error");
    ring.classList.remove("is-shake"); void ring.offsetWidth; ring.classList.add("is-shake");
    if (msg) {
      setHint(msg, true);
      clearTimeout(hintTimer);
      hintTimer = setTimeout(function () { setHint(hintNormal, false); }, 2400);
    }
  }

  function waitFor(eventName, filter) {
    var offFn;
    var p = new Promise(function (resolve) {
      offFn = L.on(eventName, function (d) { if (!filter || filter(d)) { offFn(); resolve({ ok: true, data: d }); } });
    });
    p.cancel = function () { if (offFn) offFn(); };
    return p;
  }

  var tutorialRunning = false;
  function runTutorial() {
    var me = L.current();
    if (!me || tutorialRunning) return Promise.resolve();
    tutorialRunning = true;
    var key = me.playerKey, els = L.els, S = TU.steps;
    var ended = false;
    var mapTargets = function () { return L.isDesktop() ? [els.stage] : [els.stage, els.entries]; };
    var myAvatar = function () { return els.avatarRow.querySelector(".av-item.is-current"); };

    function end() {
      if (ended) return;
      ended = true;
      tutorialRunning = false;
      L.clearGuard();                 // 恢復所有正常操作
      hideSpot();
      Store.markTutorialDone(key);
      document.body.classList.remove("tutorial-on");
      if (D.isOpen()) D.close();
    }

    /* 只是介紹：唯一正確操作是紫色箭頭；其他大廳操作 → 溫和提醒＋高亮箭頭 */
    function intro(cfg, targets) {
      if (ended) return Promise.resolve();
      showSpot(targets, "", {});
      L.setGuard(function () {
        wrongFeedback(null);
        L.toast(TU.wrongIntro);
        D.nudgeNext();
        return false;
      });
      return D.ask([say(cfg.text, { nextHint: TU.nextHint })], {
        shield: false, allowSkip: true,
        avoid: function () { return (targets || []).filter(function (t) { return t && rectOf([t]) && (rectOf([t]).bottom - rectOf([t]).top) < window.innerHeight * 0.6; }); }
      }).then(function (r) { if (r && r.skipped && !r.replaced) end(); });
    }

    /* 要實際操作：只有指定目標算正確；其他操作 → 目標旁提示溫和提醒，不中斷、不跳步驟 */
    function action(cfg, targetsFn, allow, eventName, filter, extra) {
      if (ended) return Promise.resolve(false);
      extra = extra || {};
      return new Promise(function (resolve) {
        var done = false;
        var ev = waitFor(eventName, filter);
        showSpot(targetsFn(), cfg.hint, { hintOnly: extra.hintOnly });
        L.setGuard(function (act, data) {
          if (allow(act, data)) return true;
          var msg = (act === "addPlayer" && cfg.wrongAdd) || (act === "avatarOther" && cfg.wrongOther) || cfg.wrong;
          wrongFeedback(msg);
          return false;
        });
        if (!extra.noDialog) {
          D.ask([say(cfg.text, { waitAction: true })], {
            shield: false, allowSkip: true,
            avoid: function () { return targetsFn().concat([hint]); },
            onWaitClick: function () { wrongFeedback(cfg.wrong); }
          }).then(function (r) {
            if (!done && r && r.skipped && !r.replaced) { done = true; ev.cancel(); end(); resolve(false); }
          });
        }
        ev.then(function (res) {
          if (done) return;
          done = true;
          L.setGuard(function () { return false; });   // 推進前先鎖住，避免連點跳步
          if (D.isOpen()) D.next();
          resolve(res);
        });
      });
    }

    document.body.classList.add("tutorial-on");
    L.closePass();
    window.BalloonUniverse.clearSelection();

    return intro(S.zones, mapTargets())
      .then(function () {
        return action(S.tryZone, mapTargets, function (a) { return a === "selectZone"; }, "zoneSelected");
      })
      .then(function (ok) {
        if (ended || ok === false) return;
        return intro(S.play, [els.panel]);
      })
      .then(function () {
        if (ended) return;
        window.BalloonUniverse.clearSelection();
        return action(S.avatar, function () { return [myAvatar()]; }, function (a) { return a === "avatarSelf"; }, "avatarTapped", function (d) { return d && d.self; });
      })
      .then(function (ok) {
        if (ended || ok === false) return;
        return intro(S.avatarDone, [els.avatarRow]);
      })
      .then(function () {
        if (ended) return;
        return intro(S.info, [els.card]);
      })
      .then(function () {
        if (ended) return;
        return action(S.pass, function () { return [els.signPass]; }, function (a) { return a === "signPass"; }, "passOpened");
      })
      .then(function (ok) {
        if (ended || ok === false) return;
        // 通行證打開時：不放大對話框擋住內容，只在 ✕ 旁顯示短提示；可切換分頁、按 ✕ 關閉
        return action(S.passView, function () { return [document.getElementById("passClose")]; },
          function (a) { return a === "passClose" || a === "passTab" || a === "escape"; }, "passClosed", null, { noDialog: true, hintOnly: true });
      })
      .then(function (ok) {
        if (ended || ok === false) return;
        hideSpot();
        L.setGuard(function () { return true; });
        return D.ask([say(S.done.text)], { shield: false });
      })
      .then(function () { end(); });
  }

  /* ==========================================================
     啟動
     ========================================================== */
  L.on("addPlayer", function () { startGate(true); });

  function boot() {
    document.body.classList.remove("is-booting");
    var list = Store.getRemembered();
    if (!list.length) {
      L.setLobbyVisible(false);
      startGate(false);
      return;
    }
    var curKey = Store.getCurrentKey();
    var entry = list.find(function (p) { return p.playerKey === curKey; }) || list[list.length - 1];
    L.setLobbyVisible(true);
    L.loadPlayer(entry);
  }

  window.Onboarding = { startGate: startGate, runTutorial: runTutorial };
  boot();
})();

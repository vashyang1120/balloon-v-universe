/* ==========================================================
   氣球小V遊戲宇宙 — 新手引導、找回通行證、首次入園教學（v0.3.0 新增）
   balloon-v-universe-v0.3.0-unified-player-lobby-test-1

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
        return '<button type="button" class="pick' + (on ? " is-on" : "") + '" role="radio" aria-checked="' + on + '" data-key="' + a.key + '">' +
          L.avatarHtml(a.key, on ? "gold" : (i % 2 ? "pink" : "blue")) +
          '<span class="pick__label">' + esc(a.label) + "</span></button>";
      }).join("") + "</div>";
  }
  function bindGrid(onPick) {
    card.querySelectorAll(".pick").forEach(function (b, i) {
      b.addEventListener("click", function () {
        card.querySelectorAll(".pick").forEach(function (o, j) {
          var on = o === b;
          o.classList.toggle("is-on", on);
          o.setAttribute("aria-checked", on);
          var key = o.dataset.key;
          o.querySelector(".av").outerHTML = L.avatarHtml(key, on ? "gold" : (j % 2 ? "pink" : "blue"));
        });
        onPick(b.dataset.key);
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
    D.ask(lines, { shield: false, allowSkip: false }).then(function (r) {
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
    D.ask([say(T.newStart)], { shield: false, allowSkip: false }).then(function () { stepId(draft); });
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
      if (!v.ok) { document.getElementById("fErr").textContent = v.msg; input.focus(); return; }
      draft.id = v.id;
      if (draft.seenR1) { stepAvatar(draft); return; }
      // 第一次提醒：完整 RPG，不可略過；看完才進入圖案選擇
      showFlow(null);
      D.ask([say(T.reminder1, { noSkip: true })], { shield: false, allowSkip: false }).then(function () {
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
      '<div class="flow__step">建立通行證 · 2 / 3</div>' +
      '<h2 class="flow__title">選擇你的專屬身份圖案</h2>' +
      '<p class="flow__notice">⚠️ ' + esc(T.reminder1) + "</p>" +
      avatarGrid(draft.base) +
      '<p class="flow__error" id="fErr" role="alert"></p>' +
      '<div class="flow__buttons">' +
        '<button class="btn btn--ghost" id="fBack" type="button">上一步</button>' +
        '<button class="btn btn--primary" id="fNext" type="button">確定這個圖案</button>' +
      "</div>", "flow__card--pick");
    bindGrid(function (key) { draft.base = key; document.getElementById("fErr").textContent = ""; });
    document.getElementById("fBack").addEventListener("click", function () { stepId(draft); });
    document.getElementById("fNext").addEventListener("click", function () {
      if (!draft.base) { document.getElementById("fErr").textContent = "請先選一個圖案"; return; }
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
    D.ask(lines, { shield: false, allowSkip: false }).then(function (r) {
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
        ] })], { shield: false, allowSkip: false }).then(function (r) {
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
      ] })], { shield: false, allowSkip: false }).then(function (r) {
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
    D.ask([say(T.created)], { shield: false, allowSkip: false });
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
      '<div class="flow__step">我玩過了</div>' +
      '<h2 class="flow__title">找回我的通行證</h2>' +
      '<p class="flow__hint">' + esc(T.returningAsk) + "</p>" + quick +
      '<input class="flow__input" id="fId" type="text" maxlength="40" autocomplete="off" placeholder="玩家 ID" value="' + esc(sel.id) + '">' +
      '<p class="flow__label">當初選的專屬身份圖案</p>' +
      avatarGrid(sel.base) +
      '<p class="flow__error" id="fErr" role="alert"></p>' +
      '<div class="flow__buttons">' +
        '<button class="btn btn--ghost" id="fBack" type="button">返回</button>' +
        '<button class="btn btn--primary" id="fFind" type="button">找回通行證</button>' +
      "</div>", "flow__card--pick");
    bindGrid(function (key) { sel.base = key; });
    card.querySelectorAll(".quick__item").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = detected[+b.dataset.i];
        returning({ fromLobby: opts.fromLobby, prefill: { id: d.id, base: d.baseAvatarKey } });
      });
    });
    document.getElementById("fBack").addEventListener("click", function () { startGate(opts.fromLobby); });
    document.getElementById("fFind").addEventListener("click", function () {
      var err = document.getElementById("fErr");
      var id = document.getElementById("fId").value.trim();
      if (!id) { err.textContent = "請輸入玩家 ID"; return; }
      if (!sel.base) { err.textContent = "請選擇當初的身份圖案"; return; }
      var key = ID.makePlayerKey(id, sel.base);
      var btn = document.getElementById("fFind");
      btn.disabled = true;
      btn.textContent = "尋找中…";
      Store.loadPlayerData(key, { id: id, baseAvatarKey: sel.base }).then(function (res) {
        if (res.status !== "ok") {
          return D.ask([say(T.returningNotFound, { choices: [
            { label: "再試一次", value: "retry", primary: true },
            { label: "建立新玩家", value: "new" }
          ] })], { shield: false, allowSkip: false }).then(function (r) {
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
        err.textContent = T.loadFailed;
      });
    });
  }

  /* ==========================================================
     首次入園教學：聚光燈 + 小V對話 + 玩家實際點擊
     ========================================================== */
  var spot = document.getElementById("spot");
  var ring = document.getElementById("spotRing");
  var blocks = {};
  spot.querySelectorAll(".spot__block").forEach(function (b) { blocks[b.dataset.side] = b; });
  var spotTargets = null, spotRaf = 0, spotPass = false;

  function rectOf(targets) {
    var r = null;
    targets.forEach(function (t) {
      if (!t || t.hidden) return;
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
    if (r) {
      var pad = 8, W = window.innerWidth, H = window.innerHeight;
      var l = Math.max(0, r.left - pad), t = Math.max(0, r.top - pad), rr = Math.min(W, r.right + pad), bb = Math.min(H, r.bottom + pad);
      Object.assign(blocks.top.style, { left: 0, top: 0, width: W + "px", height: t + "px" });
      Object.assign(blocks.bottom.style, { left: 0, top: bb + "px", width: W + "px", height: Math.max(0, H - bb) + "px" });
      Object.assign(blocks.left.style, { left: 0, top: t + "px", width: l + "px", height: Math.max(0, bb - t) + "px" });
      Object.assign(blocks.right.style, { left: rr + "px", top: t + "px", width: Math.max(0, W - rr) + "px", height: Math.max(0, bb - t) + "px" });
      Object.assign(ring.style, { left: l + "px", top: t + "px", width: (rr - l) + "px", height: (bb - t) + "px" });
    }
    spotRaf = requestAnimationFrame(layoutSpot);
  }
  function showSpot(targets, passThrough) {
    spotTargets = targets.filter(Boolean);
    spotPass = !!passThrough;
    ring.classList.toggle("is-block", !spotPass);
    spot.hidden = false;
    var first = spotTargets[0];
    if (first && first.scrollIntoView) first.scrollIntoView({ block: "center", behavior: "instant" });
    cancelAnimationFrame(spotRaf);
    layoutSpot();
  }
  function hideSpot() { spot.hidden = true; spotTargets = null; cancelAnimationFrame(spotRaf); }

  function dialogPos(targets) {
    var r = rectOf(targets.filter(Boolean));
    if (!r) return "bottom";
    return (r.top + r.bottom) / 2 > window.innerHeight * 0.5 ? "top" : "bottom";
  }

  /* 等待某個大廳事件或玩家按「略過」 */
  function waitFor(eventName, filter) {
    return new Promise(function (resolve) {
      var offFn = L.on(eventName, function (d) { if (!filter || filter(d)) { offFn(); resolve({ ok: true, data: d }); } });
    });
  }

  function runTutorial() {
    var d = L.current();
    if (!d) return;
    var key = d.playerKey;
    var els = L.els;
    var mapTargets = L.isDesktop() ? [els.stage] : [els.stage, els.entries];
    var ended = false;
    function end() {
      if (ended) return;
      ended = true;
      hideSpot();
      Store.markTutorialDone(key);
      document.body.classList.remove("tutorial-on");
    }
    function talk(text, targets, extra) {
      return D.ask([say(text, extra)], { shield: false, position: dialogPos(targets), allowSkip: true }).then(function (r) {
        if (r.skipped && !r.replaced) end();
        return r;
      });
    }
    /* 等待實際操作的步驟：對話顯示提示（沒有繼續鍵），玩家做完操作才往下 */
    function act(text, targets, eventName, filter) {
      return new Promise(function (resolve) {
        var done = false;
        talk(text, targets, { waitAction: true }).then(function (r) { if (!done && r.skipped) { done = true; resolve(false); } });
        waitFor(eventName, filter).then(function (res) { if (done) return; done = true; D.next(); resolve(res); });
      });
    }

    document.body.classList.add("tutorial-on");
    L.closePass();

    // 1. 四個遊戲區域
    showSpot(mapTargets, false);
    talk(TU.zones, mapTargets).then(function () {
      if (ended) return;
      // 2. 實際點一個遊戲區域
      showSpot(mapTargets, true);
      return act(TU.tryZone, mapTargets, "zoneSelected");
    }).then(function (ok) {
      if (ended || ok === false) return end();
      // 3. 介紹面板與開始遊玩（不強制按）
      var t = [els.panel];
      showSpot(t, false);
      return talk(TU.tryPlay, t);
    }).then(function () {
      if (ended) return;
      window.BalloonUniverse.clearSelection();
      // 4. 下方頭像列：實際點一下自己的頭像（不強制切換成別人）
      var t = [els.avatarRow];
      showSpot(t, true);
      return act(TU.avatars, t, "avatarTapped");
    }).then(function (res) {
      if (ended || res === false) return end();
      if (res && res.data && !res.data.self) {
        // 玩家點了別人：已跳出真正的切換確認視窗，等他取消或確認
        hideSpot();
        return Promise.race([waitFor("switchCancelled"), waitFor("switchDone")]).then(function () {
          var t = [els.avatarRow];
          showSpot(t, false);
          return talk(TU.avatarsDone, t);
        });
      }
      var t2 = [els.avatarRow];
      showSpot(t2, false);
      return talk(TU.avatarsDone, t2);
    }).then(function () {
      if (ended) return;
      // 5. 右上角玩家資料
      var t = [els.card];
      showSpot(t, false);
      return talk(TU.info, t);
    }).then(function () {
      if (ended) return;
      // 6. 我的通行證：實際點開
      var t = [els.signPass];
      showSpot(t, true);
      return act(TU.pass, t, "passOpened");
    }).then(function (res) {
      if (ended || res === false) return end();
      hideSpot();
      return waitFor("passClosed").then(function () {
        return D.ask([say(TU.done)], { shield: false });
      });
    }).then(function () { end(); });
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

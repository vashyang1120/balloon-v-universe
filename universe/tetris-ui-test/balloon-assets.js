/* v0.2.2-test-1: local original balloon texture; wait before starting a run.
   Only image loading/render readiness is wrapped. Rules and timing are unchanged. */
(function () {
  "use strict";
  var ready = false, pending = null, attempt = 0, timer;
  var originalStart = window.startGame, originalTinted = window.getTinted;
  var blank = document.createElement("canvas"); blank.width = blank.height = 64;
  var panel = document.createElement("div");
  panel.setAttribute("role", "status");
  panel.style.cssText = "position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:#251541ed;color:white;text-align:center;padding:24px";
  panel.hidden = true; panel.style.display = "none";
  var box = document.createElement("div"), message = document.createElement("p"), retry = document.createElement("button");
  retry.textContent = "重新載入氣球方塊"; retry.className = "btn";
  box.append(message, retry); panel.append(box); document.body.append(panel);
  function status(text, failed) {
    message.textContent = text; retry.hidden = !failed;
    panel.style.display = "flex"; panel.hidden = false;
  }
  function hide() { panel.hidden = true; panel.style.display = "none"; }
  function load() {
    var id = ++attempt, image = new Image();
    clearTimeout(timer); ready = false; balloonCache = {};
    status("🎈 正在準備氣球方塊…", false);
    function fail() {
      if (id !== attempt) return;
      clearTimeout(timer); ++attempt;
      status("氣球方塊未能載入，請點一下重試。", true);
    }
    image.onerror = fail;
    image.onload = function () {
      if (id !== attempt) return;
      if (!image.naturalWidth || !image.naturalHeight) { fail(); return; }
      clearTimeout(timer); balloonImg = image; balloonCache = {}; ready = true;
      hide();
      if (pending) { var run = pending; pending = null; originalStart.apply(run.self, run.args); }
    };
    timer = setTimeout(fail, 12000);
    image.src = new URL("assets/balloon_base.png" + (id > 1 ? "?retry=" + id : ""), document.baseURI).href;
    IMG.balloon = image.src;
  }
  // Never cache the original renderer's solid square while the PNG is unavailable.
  window.getTinted = function (color) { return ready ? originalTinted(color) : blank; };
  window.startGame = function () {
    if (ready) return originalStart.apply(this, arguments);
    if (!pending) pending = { self: this, args: Array.prototype.slice.call(arguments) };
    panel.hidden = false; panel.style.display = "flex";
  };
  retry.addEventListener("click", load);
  load();
})();

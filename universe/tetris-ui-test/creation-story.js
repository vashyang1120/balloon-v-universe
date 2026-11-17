/* v0.2.3-test-2: homepage creation story only; no game or player data changes.
   Uses supplied classroom photos with flattened privacy head stickers. */
(function () {
  "use strict";
  var title = document.querySelector(".uit-z2");
  if (!title) return;
  var tagline = document.createElement("p");
  tagline.className = "bv-story-tagline";
  tagline.textContent = "從氣球教室誕生的方塊遊戲！";
  var button = document.createElement("button");
  button.type = "button"; button.className = "btn btn-outline bv-story-open";
  button.textContent = "📖 方塊派對的誕生";
  button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-controls", "bv-creation-story");
  title.append(tagline, button);
  var dialog = document.createElement("dialog");
  dialog.id = "bv-creation-story"; dialog.setAttribute("aria-labelledby", "bv-story-heading");
  dialog.innerHTML = '<div class="bv-story-content">' +
    '<button type="button" class="btn bv-story-close" aria-label="關閉創作故事">關閉 ✕</button>' +
    '<h2 id="bv-story-heading">方塊派對的誕生</h2>' +
    '<p class="bv-story-lead">從氣球教室，到方塊世界！</p>' +
    '<p>我是小V哥哥。這個遊戲的靈感，來自我和孩子們一起上氣球課的時光。</p>' +
    '<p>在課堂上，我們用長條氣球折出一顆顆立方體，也就是氣球骰子。這些孩子們親手完成的作品，就是方塊派對每一顆基本方塊的起點。</p>' +
    '<section class="bv-story-classroom" aria-label="孩子們完成的真實氣球作品"><h3>氣球教室裡的方塊</h3>' +
    '<p class="bv-story-gallery-hint">← 左右滑動看照片 →</p>' +
    '<div class="bv-story-gallery-controls"><button type="button" class="bv-story-prev" aria-label="上一張照片">‹</button><span class="bv-story-count" aria-live="polite">1 / 3</span><button type="button" class="bv-story-next" aria-label="下一張照片">›</button></div>' +
    '<div class="bv-story-gallery" tabindex="0" aria-label="課堂作品照片，可左右滑動或使用左右方向鍵">' +
    '<figure><img src="assets/story/classroom-01.webp" width="717" height="1536" loading="lazy" decoding="async" alt="孩子雙手捧著親手完成的黃色問號氣球立方體，臉部以動畫頭像貼紙遮住"><figcaption>一顆顆親手完成的氣球立方體</figcaption></figure>' +
    '<figure><img src="assets/story/classroom-02.webp" width="717" height="1536" loading="lazy" decoding="async" alt="孩子展示畫有表情的黃色氣球立方體，臉部以動畫頭像貼紙遮住"><figcaption>每件作品都有自己的模樣</figcaption></figure>' +
    '<figure><img src="assets/story/classroom-03.webp" width="717" height="1536" loading="lazy" decoding="async" alt="孩子高舉完成的黃色問號氣球立方體，臉部以動畫頭像貼紙遮住"><figcaption>把完成作品的快樂，帶進遊戲裡</figcaption></figure>' +
    '</div><p class="bv-story-privacy">真實課堂作品照片・孩子臉部已以頭像貼紙遮蔽</p></section>' +
    '<figure class="bv-story-original"><img src="assets/balloon_base.png" width="112" height="112" alt="方塊派對使用的原始氣球立方體素材"><figcaption>遊戲裡每顆基本方塊使用的原始氣球素材</figcaption></figure>' +
    '<p>把四顆氣球立方體組合起來，就能排出遊戲裡不同的方塊形狀。於是，氣球課上的作品，也走進了可以移動、旋轉、消除的方塊世界。</p>' +
    '<p>我想把這份一起動手做氣球的快樂，帶到遊戲裡。希望你每次轉動方塊時，也能想起：這個世界，是從我和孩子們一起完成的氣球作品開始的。</p>' +
    '<button type="button" class="btn bv-story-back">回到方塊首頁</button></div>';
  document.body.append(dialog);
  var gallery = dialog.querySelector(".bv-story-gallery");
  var slides = Array.prototype.slice.call(gallery.querySelectorAll("figure"));
  var prev = dialog.querySelector(".bv-story-prev"), next = dialog.querySelector(".bv-story-next");
  var count = dialog.querySelector(".bv-story-count");
  function index() {
    var box = gallery.getBoundingClientRect(), best = 0, distance = Infinity;
    slides.forEach(function (slide, i) {
      var r = slide.getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - (box.left + box.right) / 2);
      if (d < distance) { best = i; distance = d; }
    });
    return best;
  }
  function update() {
    var i = index(); count.textContent = (i + 1) + " / " + slides.length;
    prev.disabled = i === 0; next.disabled = i === slides.length - 1;
  }
  function move(delta) {
    var i = Math.max(0, Math.min(slides.length - 1, index() + delta));
    var r = slides[i].getBoundingClientRect(), g = gallery.getBoundingClientRect();
    gallery.scrollBy({ left: (r.left + r.right - g.left - g.right) / 2,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  prev.addEventListener("click", function () { move(-1); });
  next.addEventListener("click", function () { move(1); });
  gallery.addEventListener("scroll", update, { passive: true });
  gallery.addEventListener("keydown", function (event) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
  });
  window.addEventListener("resize", function () { if (dialog.open) update(); });
  prev.disabled = true;
  function close() { dialog.close(); }
  button.addEventListener("click", function () { if (!dialog.open) { dialog.showModal(); dialog.scrollTop = 0; update(); } });
  dialog.querySelector(".bv-story-close").addEventListener("click", close);
  dialog.querySelector(".bv-story-back").addEventListener("click", close);
  dialog.addEventListener("close", function () { button.focus({ preventScroll: true }); });
  // Close on the backdrop, while leaving content taps alone.
  dialog.addEventListener("click", function (event) {
    if (event.target !== dialog) return;
    var r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  });
})();

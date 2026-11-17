/* v0.2.3-test-1: homepage creation story only; no game or player data changes.
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
    '<div class="bv-story-gallery">' +
    '<figure><img src="assets/story/classroom-01.webp" width="717" height="1536" loading="lazy" decoding="async" alt="孩子雙手捧著親手完成的黃色問號氣球立方體，臉部以動畫頭像貼紙遮住"><figcaption>一顆顆親手完成的氣球立方體</figcaption></figure>' +
    '<figure><img src="assets/story/classroom-02.webp" width="717" height="1536" loading="lazy" decoding="async" alt="孩子展示畫有表情的黃色氣球立方體，臉部以動畫頭像貼紙遮住"><figcaption>每件作品都有自己的模樣</figcaption></figure>' +
    '<figure><img src="assets/story/classroom-03.webp" width="717" height="1536" loading="lazy" decoding="async" alt="孩子高舉完成的黃色問號氣球立方體，臉部以動畫頭像貼紙遮住"><figcaption>把完成作品的快樂，帶進遊戲裡</figcaption></figure>' +
    '</div><p class="bv-story-privacy">真實課堂作品照片・孩子臉部已以頭像貼紙遮蔽</p></section>' +
    '<figure class="bv-story-original"><img src="assets/balloon_base.png" width="112" height="112" alt="方塊派對使用的原始氣球立方體素材"><figcaption>遊戲裡每顆基本方塊使用的原始氣球素材</figcaption></figure>' +
    '<p>把四顆氣球立方體組合起來，就能排出遊戲裡不同的方塊形狀。於是，氣球課上的作品，也走進了可以移動、旋轉、消除的方塊世界。</p>' +
    '<p>我想把這份一起動手做氣球的快樂，帶到遊戲裡。希望你每次轉動方塊時，也能想起：這個世界，是從我和孩子們一起完成的氣球作品開始的。</p>' +
    '<button type="button" class="btn bv-story-back">回到方塊首頁</button></div>';
  document.body.append(dialog);
  function close() { dialog.close(); }
  button.addEventListener("click", function () { if (!dialog.open) { dialog.showModal(); dialog.scrollTop = 0; } });
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

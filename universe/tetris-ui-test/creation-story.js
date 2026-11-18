/* v0.3.2-test-1: approved R2 full-page story, existing privacy-masked photos. */
(function () {
  'use strict';
  var title = document.querySelector('.uit-z2');
  if (!title) return;
  var tagline = document.createElement('p');
  tagline.className = 'bv-story-tagline';
  tagline.textContent = '從氣球教室誕生的方塊遊戲！';
  var button = document.createElement('button');
  button.type = 'button'; button.className = 'btn btn-outline bv-story-open';
  button.textContent = '📖 方塊派對的誕生';
  button.setAttribute('aria-controls','s-story');
  title.append(tagline,button);
  var holder = document.createElement('div');
  holder.innerHTML = "<section id=\"s-story\" class=\"screen off\" aria-labelledby=\"bv-story-heading\"><div class=\"story-inner\"><div class=\"story-top\"><span>氣球小V · 方塊派對</span><button class=\"story-back\">回到方塊首頁 ↗</button></div><p class=\"story-kicker\">THE STORY BEHIND THE BLOCKS</p><h1 class=\"story-title\" id=\"bv-story-heading\" tabindex=\"-1\">方塊派對的誕生</h1><p class=\"story-subtitle\">從氣球教室，到方塊世界！</p><figure class=\"story-photo-frame\"><img id=\"review-photo\" width=\"717\" height=\"1536\" decoding=\"async\" tabindex=\"0\" src=\"assets/story/classroom-01.webp\" alt=\"已遮蔽臉部的真實氣球課照片\"><figcaption class=\"story-chip\">孩子們親手完成的氣球作品</figcaption></figure><p class=\"story-swipe-hint\">← 左右滑動照片，看看更多作品 →</p><div class=\"story-photo-nav\"><button id=\"review-prev\" aria-label=\"上一張\">‹</button><span id=\"review-count\" aria-live=\"polite\">● ○ ○　1 / 3</span><button id=\"review-next\" aria-label=\"下一張\">›</button></div><article class=\"story-text-panel\"><div class=\"story-text-head\"><img src=\"../../assets/rpg/v_bust_point.png\" alt=\"小V老師\"><div><small>A LITTLE STORY FROM BALLOON V</small><h2>這些方塊，是我們一起做的。</h2></div></div><p>我是小V老師。在氣球課裡，我和孩子們用長條氣球，折出一顆顆立方體。</p><p>每一件作品都有自己的模樣。這些<strong>孩子們親手完成的氣球方塊</strong>，就是這個遊戲的起點。</p><div class=\"story-blocks\"><img src=\"assets/balloon_base.png\" width=\"34\" height=\"34\" alt=\"原始氣球方塊\"><img src=\"assets/balloon_base.png\" width=\"34\" height=\"34\" alt=\"原始氣球方塊\"><img src=\"assets/balloon_base.png\" width=\"34\" height=\"34\" alt=\"原始氣球方塊\"><img src=\"assets/balloon_base.png\" width=\"34\" height=\"34\" alt=\"原始氣球方塊\"></div><p>四顆氣球立方體，組成不同的遊戲方塊。我想把一起動手做氣球的快樂，也帶進可以移動、旋轉、消除的世界裡。</p><p class=\"story-small\">真實作品照片・孩子臉部已以頭像貼紙保護</p></article><button class=\"story-cta\">帶著這份快樂，開始玩！</button></div></section>";
  var page=holder.firstElementChild; document.body.append(page);
  var image=page.querySelector('#review-photo'),count=page.querySelector('#review-count'),idx=0,start=null;
  var photos=['assets/story/classroom-01.webp','assets/story/classroom-02.webp','assets/story/classroom-03.webp'];
  var alts=['孩子雙手捧著親手完成的黃色問號氣球立方體，臉部已以頭像貼紙遮蔽','孩子展示畫有表情的黃色氣球立方體，臉部已以頭像貼紙遮蔽','孩子高舉完成的黃色問號氣球立方體，臉部已以頭像貼紙遮蔽'];
  function move(delta){idx=(idx+delta+photos.length)%photos.length;image.src=photos[idx];image.alt=alts[idx];count.textContent=[0,1,2].map(function(i){return i===idx?'●':'○';}).join(' ')+'　'+(idx+1)+' / 3';}
  function open(){if(typeof running!=='undefined'&&running)return;idx=0;move(0);showScreen('s-story');page.scrollTop=0;page.querySelector('h1').focus({preventScroll:true});}
  function close(){showScreen('s-title');button.focus({preventScroll:true});}
  button.addEventListener('click',open);
  page.querySelector('.story-back').addEventListener('click',close);
  page.querySelector('.story-cta').addEventListener('click',function(){close();document.getElementById('btn-start').click();});
  page.querySelector('#review-prev').addEventListener('click',function(){move(-1);});
  page.querySelector('#review-next').addEventListener('click',function(){move(1);});
  image.addEventListener('touchstart',function(e){var t=e.touches[0];start={x:t.clientX,y:t.clientY};},{passive:true});
  image.addEventListener('touchcancel',function(){start=null;},{passive:true});
  image.addEventListener('touchend',function(e){if(!start)return;var t=e.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;start=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.3)move(dx<0?1:-1);},{passive:true});
  document.addEventListener('keydown',function(e){if(page.classList.contains('off'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopImmediatePropagation();move(e.key==='ArrowLeft'?-1:1);}},true);
  move(0);
  window.BVTetrisStory={version:'v0.3.2-test-1',open:open,close:close};
})();

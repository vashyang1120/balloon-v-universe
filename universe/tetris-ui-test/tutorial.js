/* v0.3.0-test-1: optional intro and isolated, action-gated practice. */
(function () {
  'use strict';
  var how=document.getElementById('btn-how'), E=window.BVTetrisPractice;
  if(!how || !E)return;
  var KEY='bv.tetris.tutorial.v1.seen', state=null, mode='welcome', timer=null, holdDelay=null, repeat=null, disposed=false;
  var d=document.createElement('dialog'); d.id='bv-tutorial'; d.setAttribute('aria-labelledby','bv-tut-title');
  d.innerHTML='<div class="bvt-wrap"><header><h2 id="bv-tut-title">一起玩氣球方塊！</h2><button type="button" data-tut="exit">跳過教學 ✕</button></header>'+
    '<p class="bvt-note">練習模式・不計成績、不發放獎勵</p><div class="bvt-content"></div></div>';
  document.body.append(d);
  var content=d.querySelector('.bvt-content');
  var steps=[['左右移動','先向左、向右各移動一次，再把方塊移到虛線位置。'],['旋轉方塊','把長條氣球方塊轉成直的，看看方向怎麼改變。'],['加速下降','按住或點按「加速下降」，讓方塊往下移動三格。'],['直接落下與消除','按「直接落下」，把方塊放進缺口，補滿最下面一行！']];
  function seen(){try{localStorage.setItem(KEY,'1');}catch(e){}}
  function clear(){clearTimeout(timer);clearTimeout(holdDelay);clearInterval(repeat); timer=holdDelay=repeat=null;}
  function close(){seen();clear();state=null;mode='closed';if(d.open)d.close();}
  function open(){if(d.open)return;if(typeof running!=='undefined' && running)return;disposed=false;mode='welcome';welcome();d.showModal();}
  function welcome(){content.innerHTML='<p class="bvt-lead">這些氣球方塊，來自我和孩子們一起完成的氣球立方體。</p><p>要先跟小V哥哥練習一下嗎？完成移動、旋轉與消除，就能開始挑戰！</p><div class="bvt-choices"><button type="button" data-tut="intro">開始練習</button><button type="button" data-tut="exit">我會玩了，回首頁</button><button type="button" data-tut="text">查看文字操作說明</button></div>';}
  function intro(){
    clear();mode='intro';
    content.innerHTML='<div class="bvt-intro" aria-label="四顆氣球立方體組成遊戲方塊">'+[0,1,2,3].map(function(i){return '<img class="bvt-cube bvt-cube-'+i+'" src="assets/balloon_base.png" alt="氣球立方體">';}).join('')+'</div><p class="bvt-lead">從氣球教室，到方塊世界！</p><p>四顆立方體，組成不同的遊戲方塊。</p><button type="button" data-tut="practice">跳過開場，開始練習</button>';
    timer=setTimeout(practice,window.matchMedia('(prefers-reduced-motion: reduce)').matches?1000:3500);
  }
  function practice(){clear();mode='practice';state=E.create(0);render();}
  function isTouch(){return window.matchMedia('(pointer: coarse)').matches;}
  function render(){
    clearInterval(repeat);repeat=null;
    if(mode!=='practice')return;
    var s=steps[state.step],passed=state.passed;
    content.innerHTML='<p class="bvt-progress">練習 '+(state.step+1)+' / 4</p><h3>'+s[0]+'</h3><p class="bvt-instruction" aria-live="polite">'+(passed?'太棒了！'+(state.step===3?'你完成了一行消除！':'這一步完成了！'):s[1])+'</p>'+
      '<p class="bvt-input-hint">'+(isTouch()?'點下方按鈕操作；加速下降可以長按。':'鍵盤：← → 移動、↑ 旋轉、↓ 加速、空白鍵直接落下。')+'</p>'+
      '<canvas width="256" height="320" class="bvt-board" role="img" aria-label="獨立教學棋盤，八欄十列"></canvas>'+
      '<div class="bvt-controls">'+[['left','← 左'],['right','右 →'],['rotate','↑ 旋轉'],['down','↓ 加速下降'],['drop','⤓ 直接落下']].map(function(a){var allowed=!passed && (state.step===0?(a[0]==='left'||a[0]==='right'):a[0]===['','rotate','down','drop'][state.step]);return '<button type="button" data-action="'+a[0]+'" '+(allowed?'':'disabled')+'>'+a[1]+'</button>';}).join('')+'</div>'+
      '<div class="bvt-bottom"><button type="button" data-tut="reset">重練這一步</button><button type="button" data-tut="next" '+(passed?'':'disabled')+'>'+(state.step===3?'完成練習':'下一步')+'</button></div><p class="bvt-text-help">'+(state.step===0?'虛線是要移動到的位置。':state.step===2?'加速下降會一格格往下；直接落下則會一次落到底。':'')+'</p>';
    draw();
  }
  function textureReady(){return typeof balloonImg!=='undefined' && balloonImg && balloonImg.complete && balloonImg.naturalWidth>0 && typeof IMG!=='undefined' && balloonImg.src===IMG.balloon;}
  function draw(){
    var canvas=content.querySelector('canvas');if(!canvas || !state)return;
    var ctx=canvas.getContext('2d'),size=32;ctx.clearRect(0,0,256,320);ctx.fillStyle='#241638';ctx.fillRect(0,0,256,320);
    ctx.strokeStyle='#ffffff20';ctx.lineWidth=1;
    for(var x=0;x<=8;x++){ctx.beginPath();ctx.moveTo(x*size,0);ctx.lineTo(x*size,320);ctx.stroke();}
    for(var y=0;y<=10;y++){ctx.beginPath();ctx.moveTo(0,y*size);ctx.lineTo(256,y*size);ctx.stroke();}
    function cell(x,y,color){if(textureReady())ctx.drawImage(getTinted(color),x*size+1,y*size+1,30,30);}
    state.board.forEach(function(row,y){row.forEach(function(v,x){if(v)cell(x,y,'#c6a8ed');});});
    if(state.step===0&&!state.passed){ctx.strokeStyle='#ffdc76';ctx.lineWidth=3;ctx.setLineDash([5,3]);ctx.strokeRect(3*size+2,2,60,60);ctx.setLineDash([]);}
    state.cells.forEach(function(c){cell(state.x+c[0],state.y+c[1],'#ffd166');});
    // An unavailable image stays a visible loading message, never ordinary square blocks.
    if(!(textureReady())){ctx.fillStyle='white';ctx.font='16px sans-serif';ctx.fillText('🎈 氣球素材準備中…',42,160);}
  }
  function action(a){if(mode!=='practice'||!state)return;if(!(textureReady())){return;}var passed=state.passed;if(E.act(state,a)){if(!passed&&state.passed)render();else draw();}}
  content.addEventListener('click',function(event){var b=event.target.closest('button');if(!b||b.disabled)return;var a=b.dataset.action,t=b.dataset.tut;if(a){action(a);return;}if(t==='intro')intro();if(t==='practice')practice();if(t==='reset'){state=E.create(state.step);render();}if(t==='next'&&state&&state.passed){if(state.step<3){state=E.create(state.step+1);render();}else{seen();mode='complete';content.innerHTML='<h3>你完成練習了！🎉</h3><p>把氣球課的快樂，帶進你的方塊挑戰！</p><button type="button" data-tut="play">開始挑戰</button><button type="button" data-tut="again">再練一次</button>';}}if(t==='again')practice();if(t==='play'){close();document.getElementById('btn-start').click();}if(t==='text'){close();if(typeof toast==='function')toast('← → 移動　↑ 旋轉　↓ 加速　空白 落下　Esc 暫停',6000);}});
  // Long press only for the gradual descent exercise. Tapping also works via click.
  content.addEventListener('contextmenu',function(event){if(event.target.closest('[data-action]'))event.preventDefault();});
  content.addEventListener('pointerdown',function(event){var b=event.target.closest('[data-action="down"]');if(!b||b.disabled)return;clearInterval(repeat);holdDelay=setTimeout(function(){repeat=setInterval(function(){action('down');},90);},250);});
  function release(){clearTimeout(holdDelay);clearInterval(repeat);holdDelay=repeat=null;}
  window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);window.addEventListener('blur',release);
  d.addEventListener('click',function(event){if(event.target.closest('[data-tut="exit"]'))close();});
  d.addEventListener('cancel',function(event){event.preventDefault();close();});
  d.addEventListener('close',function(){clear();state=null;mode='closed';how.focus({preventScroll:true});});
  document.addEventListener('keydown',function(event){if(!d.open)return;event.stopImmediatePropagation();if(event.key==='Escape'){event.preventDefault();close();return;}var keys={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',ArrowDown:'down',' ':'drop'};if(mode==='practice'&&keys[event.key]&&!(event.key===' '&&event.target.tagName==='BUTTON')){event.preventDefault();action(keys[event.key]);}},true);
  how.addEventListener('click',function(event){event.preventDefault();event.stopImmediatePropagation();open();},true);
  // Repaint after image arrival and viewport changes without progressing the exercise.
  var repaint=setInterval(function(){if(mode==='practice')draw();},500);
  window.addEventListener('pagehide',function(){clear();clearInterval(repaint);disposed=true;});
  window.addEventListener('pageshow',function(){if(disposed){repaint=setInterval(function(){if(mode==='practice')draw();},500);disposed=false;}});
  try{if(localStorage.getItem(KEY)!=='1')open();}catch(e){open();}
})();

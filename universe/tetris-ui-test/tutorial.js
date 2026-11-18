/* v0.3.2-test-1: approved R2 guidance over the ORIGINAL game and controls.
   Practice never calls startGame(), gameOver(), a session API, or a second engine. */
(function () {
  'use strict';
  var how=document.getElementById('btn-how');
  if(!how || !window.BVGuidedPractice) return;
  var holder=document.createElement('div');
  holder.innerHTML="<div class=\"review-coach\" hidden><img src=\"../../assets/rpg/v_bust_point.png\" alt=\"小V老師引導\"><div class=\"review-speech\"><small>小V老師陪你練習 · 1 / 4</small><span aria-live=\"polite\">先試試<strong>左、右移動</strong>！<br>按亮起的原本按鈕，把氣球方塊移過去。</span></div></div>\n<div class=\"review-step-picker\" role=\"region\" aria-label=\"逐步教學\" hidden><div class=\"review-progress\" aria-label=\"教學進度\">●　○　○　○</div><div class=\"review-teaching-actions\"><button id=\"review-retry\">重試這一步</button><button id=\"review-next-step\" disabled>下一步 →</button><button id=\"review-restart\" hidden>再練一次</button><button id=\"review-play\" hidden>開始挑戰</button><button id=\"review-exit\">跳過教學</button></div></div>";
  while(holder.firstElementChild)document.body.appendChild(holder.firstElementChild);
  var coach=document.querySelector('.review-coach'),picker=document.querySelector('.review-step-picker');
  var next=document.getElementById('review-next-step'),retry=document.getElementById('review-retry');
  var restart=document.getElementById('review-restart'),play=document.getElementById('review-play'),exitButton=document.getElementById('review-exit');
  var original={left:window.mLeft,right:window.mRight,rotate:window.tryRotate,down:window.mDown,drop:window.hardDrop,lock:window.lock};
  var drawTimer=null,oldIdentity=null;
  var legacy=[['mob-left','left'],['mob-right','right'],['mob-rotl','rotate'],['mob-down','down'],['mob-drop','drop']];
  function cancelHeld(){
    if(window.BVUiTest)Object.keys(BVUiTest.held).forEach(function(k){var h=BVUiTest.held[k];clearTimeout(h.timer);clearInterval(h.timer);delete BVUiTest.held[k];});
    document.querySelectorAll('.uit-btn.is-down').forEach(function(b){b.classList.remove('is-down');});
  }
  function resetPuzzle(step){
    if(raf)cancelAnimationFrame(raf);raf=null;
    clearTimeout(stkTmr);
    board=newBoard();var k=step===1?'I':'O';
    cur={key:k,cells:PIECES[k].cells.map(function(c){return c.slice();}),color:PIECES[k].color};
    nxt={key:'T',cells:PIECES.T.cells.map(function(c){return c.slice();}),color:PIECES.T.color};
    cx=3;cy=5;score=0;lines=0;level=1;combo=0;peakCombo=0;diff='normal';particles=[];running=true;paused=false;dropAcc=0;
    if(step===3)for(var x=0;x<COLS;x++)if(x!==3&&x!==4)board[ROWS-1][x]='#bb9de5';
    clearGameVisualState();
    ['cl-flash','lv-flash'].forEach(function(id){var e=document.getElementById(id);if(e)e.classList.remove('show');});
    document.getElementById('g-overlay').classList.add('off');
    document.getElementById('pause-btn').textContent='⏸ 暫停';
    updateHUD();initCanvas();paint();
    document.getElementById('g-name').textContent='教學練習';
    document.getElementById('g-avatar').src=coach.querySelector('img').src;
    positionCoach();
  }
  var guard=BVGuidedPractice({cancelHeld:cancelHeld,reset:resetPuzzle,snapshot:function(){return {x:cx,y:cy,cells:cur.cells.map(function(c){return c.slice();}),lines:lines};}},update);
  [['mLeft','left'],['mRight','right'],['tryRotate','rotate'],['mDown','down'],['hardDrop','drop'],['lock','lock']].forEach(function(pair){
    window[pair[0]]=function(){return guard.invoke(pair[1],original[pair[1]],this,arguments);};
  });
  var originalLoop=window.loop,originalGameOver=window.gameOver,originalStart=window.startGame;
  window.loop=function(){if(!guard.info().active)return originalLoop.apply(this,arguments);};
  window.gameOver=function(){if(!guard.info().active)return originalGameOver.apply(this,arguments);};
  window.startGame=function(){if(guard.info().active)cleanup();return originalStart.apply(this,arguments);};
  var texts=[
    '先按<strong>左鍵</strong>移動一次，<br>再把方塊移到<strong>右側亮框</strong>裡。',
    '按亮起的<strong>原本旋轉鍵</strong>，<br>把這顆長條氣球方塊轉成直的。',
    '按住或點按<strong>加速下降</strong>，<br>讓方塊往下移動<strong>三格</strong>。',
    '按<strong>直接落下</strong>，<br>填進缺口，消除最下面一行！'
  ];
  var keyboardTexts=[
    '按鍵盤<strong>←</strong>移動一次，<br>再用<strong>→</strong>移到右側亮框裡。',
    '按鍵盤<strong>↑（旋轉）</strong>，<br>把長條氣球方塊轉成直的。',
    '按住或點按鍵盤<strong>↓</strong>，<br>讓方塊往下移動<strong>三格</strong>。',
    '按鍵盤<strong>空白鍵</strong>直接落下，<br>填進缺口，消除最下面一行！'
  ];
  function update(s){
    document.querySelectorAll('.review-highlight').forEach(function(e){e.classList.remove('review-highlight');});
    document.querySelectorAll('.uit-btn').forEach(function(b){
      var allowed=s.active&&guard.allows(b.dataset.act);
      b.disabled=s.active&&!allowed;
      b.classList.toggle('review-locked',s.active&&!allowed);
      if(allowed)b.classList.add('review-highlight');
    });
    legacy.forEach(function(pair){var b=document.getElementById(pair[0]);if(!b)return;var allowed=s.active&&guard.allows(pair[1]);b.disabled=s.active&&!allowed;b.classList.toggle('review-locked',s.active&&!allowed);if(allowed)b.classList.add('review-highlight');});
    if(!s.active)return;
    var desktop=window.BVUiTest&&!BVUiTest.isMobileLayout();
    var hint=document.querySelector('#s-game .ctrl-hint');
    if(desktop&&hint&&!s.passed&&!s.complete)hint.classList.add('review-highlight');
    var label=coach.querySelector('small'),message=coach.querySelector('span');
    if(s.complete){label.textContent='小V老師陪你練習 · 完成！';message.innerHTML='<strong>四個步驟都完成了！</strong><br>準備好，就來挑戰方塊派對吧！';}
    else{label.textContent='小V老師陪你練習 · '+(s.step+1)+' / 4';message.innerHTML=s.passed?'<strong>太棒了，這一步完成了！</strong><br>按「下一步」，準備新的練習。':(desktop?keyboardTexts:texts)[s.step];}
    next.disabled=!s.passed;next.hidden=s.complete;
    retry.hidden=s.complete;restart.hidden=!s.complete;play.hidden=!s.complete;
    exitButton.textContent=s.complete?'回到首頁':'跳過教學';
    picker.querySelector('.review-progress').textContent=[0,1,2,3].map(function(i){return s.complete||i<s.step?'✓':i===s.step?'●':'○';}).join('　');
  }
  function positionCoach(){
    if(!guard||!guard.info().active)return;
    var r=document.getElementById('board-wrap').getBoundingClientRect();
    document.documentElement.style.setProperty('--bv-coach-top',Math.max(8,r.top+4)+'px');
  }
  function paint(){
    if(!board||!cur)return;
    draw();
    if(guard&&guard.info().active&&!guard.info().passed&&guard.info().step===0){
      bCtx.save();bCtx.strokeStyle='#ffde78';bCtx.lineWidth=3;bCtx.setLineDash([6,4]);
      bCtx.strokeRect(5*CELL+2,5*CELL+2,2*CELL-4,2*CELL-4);bCtx.restore();
    }
  }
  function cleanup(){
    guard.exit();clearInterval(drawTimer);drawTimer=null;
    if(raf)cancelAnimationFrame(raf);raf=null;
    clearTimeout(stkTmr);clearGameVisualState();
    running=false;paused=false;particles=[];
    coach.hidden=picker.hidden=true;
    document.documentElement.classList.remove('bv-guided');
    if(oldIdentity){document.getElementById('g-name').textContent=oldIdentity.name;document.getElementById('g-avatar').src=oldIdentity.avatar;oldIdentity=null;}
  }
  function focusBoard(){var canvas=document.getElementById('board-canvas');canvas.setAttribute('tabindex','-1');canvas.focus({preventScroll:true});}
  function exit(){cleanup();showScreen('s-title');how.focus({preventScroll:true});}
  function begin(){
    if(guard.info().active){guard.start();focusBoard();return;}
    if(typeof running!=='undefined'&&running)return;
    // The texture loader already blocks entry while loading; never show solid substitute blocks.
    if(!balloonImg.complete||!balloonImg.naturalWidth||balloonImg.src!==IMG.balloon){toast('🎈 氣球素材準備中，請稍後再試');return;}
    oldIdentity={name:document.getElementById('g-name').textContent,avatar:document.getElementById('g-avatar').src};
    if(typeof pauseSong==='function')pauseSong();
    if(window.BVTetrisMenuAudio)BVTetrisMenuAudio.onGameStart();
    document.documentElement.classList.add('bv-guided');
    showScreen('s-game');coach.hidden=picker.hidden=false;
    guard.start();
    clearInterval(drawTimer);drawTimer=setInterval(function(){if(guard.info().active&&!document.hidden){paint();positionCoach();}},100);
    focusBoard();
  }
  retry.addEventListener('click',function(){guard.retry();paint();focusBoard();});
  next.addEventListener('click',function(){guard.next();paint();if(guard.info().complete)play.focus({preventScroll:true});else focusBoard();});
  restart.addEventListener('click',begin);
  exitButton.addEventListener('click',exit);
  play.addEventListener('click',function(){exit();document.getElementById('btn-start').click();});
  how.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();begin();},true);
  document.addEventListener('keydown',function(e){
    if(!guard.info().active)return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();exit();return;}
    var key={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',z:'rotate',Z:'rotate',ArrowDown:'down',' ':'drop'}[e.key];
    if(!key)return;
    // Navigation buttons retain native keyboard activation; gameplay must not consume that same key.
    if((e.key===' '||e.key==='ArrowLeft'||e.key==='ArrowRight')&&e.target.closest('.review-step-picker')){e.stopImmediatePropagation();return;}
    if(!guard.allows(key)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  document.addEventListener('pointerdown',function(e){
    if(!guard.info().active)return;
    var b=e.target.closest('.uit-btn');
    if(b&&!guard.allows(b.dataset.act)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  // Some original click handlers captured function references before our wrappers.
  // Route those same buttons through the guard too (e.g. wide touchscreen PCs).
  legacy.forEach(function(pair){var b=document.getElementById(pair[0]);if(!b)return;b.addEventListener('click',function(e){if(!guard.info().active)return;e.preventDefault();e.stopImmediatePropagation();if(guard.allows(pair[1]))window[{left:'mLeft',right:'mRight',rotate:'tryRotate',down:'mDown',drop:'hardDrop'}[pair[1]]]();},true);});
  // Use the actual exit button; pause and song browsing cannot disrupt the scripted exercise.
  ['pause-btn','btn-quit','mc-play','mc-list','mc-prev','mc-next'].forEach(function(id){
    var b=document.getElementById(id);if(b)b.addEventListener('click',function(e){if(!guard.info().active)return;e.preventDefault();e.stopImmediatePropagation();if(id==='btn-quit')exit();},true);
  });
  window.addEventListener('resize',function(){if(guard.info().active){positionCoach();update(guard.info());}});
  window.addEventListener('pagehide',function(){if(guard.info().active)exit();});
  new MutationObserver(function(){if(guard.info().active&&document.getElementById('s-game').classList.contains('off'))cleanup();})
    .observe(document.getElementById('s-game'),{attributes:true,attributeFilter:['class']});
  window.BVTetrisTutorial={version:'v0.3.2-test-1',open:begin,close:exit,info:guard.info};
})();

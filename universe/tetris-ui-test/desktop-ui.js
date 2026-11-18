/* UI v0.3.4: fit the ORIGINAL renderer to the centered desktop layout.
   No board, physics, input, timing, player or score state is changed. */
(function () {
  'use strict';
  var originalInit=window.initCanvas;
  function fit() {
    if(!window.BVUiTest || BVUiTest.isMobileLayout())return false;
    var game=document.getElementById('s-game');
    if(!game || game.classList.contains('off'))return false;
    var sides=game.querySelectorAll('.side'),canvas=document.getElementById('board-canvas');
    if(sides.length!==2 || !canvas)return false;
    var cs=getComputedStyle(game),box=game.getBoundingClientRect();
    var num=function(x){return parseFloat(x)||0;};
    var width=box.width-num(cs.paddingLeft)-num(cs.paddingRight)-sides[0].getBoundingClientRect().width-sides[1].getBoundingClientRect().width-2*num(cs.columnGap)-4;
    var height=box.height-num(cs.paddingTop)-num(cs.paddingBottom)-4;
    var size=Math.max(8,Math.min(56,Math.floor(Math.min(width/COLS,height/ROWS))));
    CELL=size; canvas.width=COLS*CELL; canvas.height=ROWS*CELL;
    canvas.style.width=canvas.width+'px';canvas.style.height=canvas.height+'px';
    game.style.setProperty('--dt-board-h',(canvas.height+4)+'px');
    return true;
  }
  // ui-test.js already refits via this same entry on resize, fullscreen and mode changes.
  window.initCanvas=function(){var out=originalInit.apply(this,arguments);fit();return out;};
  window.BVTetrisDesktop={version:'v0.3.4',fit:fit};
})();

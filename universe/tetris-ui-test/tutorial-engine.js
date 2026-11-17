/* Independent practice state. No access to real board, scores, sessions or rewards. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BVTetrisPractice = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var W = 8, H = 10;
  function create(step) {
    var board = Array.from({length:H}, function () { return Array(W).fill(0); });
    if (step === 3) board[H-1] = [1,1,1,0,0,1,1,1];
    return { step:step || 0, board:board, cells:step === 1 ? [[0,0],[1,0],[2,0],[3,0]] : [[0,0],[1,0],[0,1],[1,1]],
      x:step === 0 ? 1 : (step === 1 ? 2 : 3), y:0, left:false, right:false, passed:false, cleared:0 };
  }
  function valid(s, cells, x, y) {
    return cells.every(function (c) { return x+c[0]>=0 && x+c[0]<W && y+c[1]>=0 && y+c[1]<H && !s.board[y+c[1]][x+c[0]]; });
  }
  function act(s, action) {
    if (s.passed) return false;
    if (s.step===0 && (action==='left'||action==='right')) {
      var nx=s.x+(action==='left'?-1:1);
      if (!valid(s,s.cells,nx,s.y)) return false;
      s.x=nx; s[action]=true; s.passed=s.left && s.right && s.x===3; return true;
    }
    if (s.step===1 && action==='rotate') {
      // Same clockwise cell transform and wall-kick order as the existing game.
      var max=Math.max.apply(null,s.cells.map(function(c){return c[0];}));
      var cells=s.cells.map(function(c){return [c[1],max-c[0]];});
      for (var k of [0,-1,1,-2,2]) if(valid(s,cells,s.x+k,s.y)) {
        s.cells=cells; s.x+=k; s.passed=true; return true;
      }
      return false;
    }
    if(s.step===2 && action==='down' && valid(s,s.cells,s.x,s.y+1)) {
      s.y++; s.passed=s.y>=3; return true;
    }
    if(s.step===3 && action==='drop') {
      while(valid(s,s.cells,s.x,s.y+1))s.y++;
      s.cells.forEach(function(c){s.board[s.y+c[1]][s.x+c[0]]=1;});
      var rows=s.board.filter(function(row){return row.some(function(v){return !v;});});
      s.cleared=H-rows.length;
      while(rows.length<H)rows.unshift(Array(W).fill(0));
      s.board=rows; s.cells=[]; s.passed=s.cleared===1; return true;
    }
    return false;
  }
  return {width:W,height:H,create:create,valid:valid,act:act};
});

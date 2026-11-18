import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {extractFunctions,inlineScripts} from '../../shared/tools/js-functions.mjs';
const require=createRequire(import.meta.url),createGuard=require('../guided-practice.js');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const funcs=new Map(extractFunctions(inlineScripts(html)).map(f=>[f.name,f.text]));
function engine(){
 const c=vm.createContext({console,setTimeout,clearTimeout});
 vm.runInContext(`var COLS=10,ROWS=20,board,cur,nxt,cx,cy,score,lines,level,combo,peakCombo,diff='normal',dropAcc,CELL=32;
 var DIFF={normal:{mult:1.5,lperlv:10}};
 var sfx=new Proxy({},{get:()=>()=>{}});
 var element={style:{},classList:{add(){},remove(){}},getBoundingClientRect(){return {left:0,top:0}}};
 function $(id){return element;}function updateHUD(){}function showSticker(){}function spawnParticles(){}function showLvFlash(){}function checkDanger(){}function gameOver(){throw Error('unexpected gameOver');}
 function randPiece(){return {key:'O',cells:[[0,0],[1,0],[0,1],[1,1]],color:'#ff85a1'};}
 `+['newBoard','valid','mLeft','mRight','mDown','tryRotate','hardDrop','lock','clearLines','getStickerKey'].map(n=>funcs.get(n)).join('\n'),c);
 let phase=0,cancels=0;
 const guard=createGuard({cancelHeld(){cancels++;},reset(step){phase=step;vm.runInContext(`board=newBoard();cur=${step===1?"{key:'I',cells:[[0,1],[1,1],[2,1],[3,1]],color:'#4fc3f7'}":"randPiece()"};nxt=randPiece();cx=3;cy=5;score=0;lines=0;level=1;combo=0;peakCombo=0;running=true;paused=false;`,c);if(step===3)vm.runInContext("for(var x=0;x<COLS;x++)if(x!==3&&x!==4)board[19][x]='#bb9de5';",c);},snapshot(){return {x:c.cx,y:c.cy,cells:c.cur.cells,lines:c.lines};}});
 for(const [fn,a] of [['mLeft','left'],['mRight','right'],['mDown','down'],['tryRotate','rotate'],['hardDrop','drop'],['lock','lock']]){const original=c[fn];c[fn]=function(...args){return guard.invoke(a,original,this,args);};}
 guard.start();return {c,guard,get cancels(){return cancels;}};
}
function finishMove(e){e.c.mLeft();e.c.mRight();e.c.mRight();e.c.mRight();assert.equal(e.guard.info().passed,true);}
function toStep(e,step){finishMove(e);if(step===0)return;e.guard.next();e.c.tryRotate();if(step===1)return;e.guard.next();e.c.mDown();e.c.mDown();e.c.mDown();if(step===2)return;e.guard.next();}
test('uses actual 10x20 board, prevents arbitrary next and early hard-drop',()=>{const e=engine();assert.equal(e.c.board.length,20);assert.equal(e.c.board[0].length,10);assert.equal(e.guard.next(),false);e.c.hardDrop();assert.equal(e.c.cy,5);assert.equal(e.c.lines,0);assert.equal(e.c.cur.key,'O');});
test('blocked down is consumed so ORIGINAL touch handler cannot lock a piece',()=>{const e=engine();for(let i=0;i<100;i++)if(!e.c.mDown())e.c.lock();assert.equal(e.c.cy,5);assert.ok(e.c.board.flat().every(v=>v===null));});
test('movement requires both directions and exact target using original movement',()=>{const e=engine();e.c.mRight();e.c.mRight();assert.equal(e.c.cx,5);assert.equal(e.guard.info().passed,false);e.c.mLeft();e.c.mRight();assert.equal(e.guard.info().passed,true);e.c.mLeft();assert.equal(e.c.cx,5);assert.equal(e.guard.next(),true);assert.equal(e.c.cx,3);assert.equal(e.c.cy,5);assert.equal(e.c.cur.key,'I');});
test('rotation uses real rotation function and only then unlocks next',()=>{const e=engine();finishMove(e);e.guard.next();e.c.mDown();assert.equal(e.c.cy,5);e.c.tryRotate();assert.equal(e.guard.info().passed,true);assert.ok(e.c.cur.cells.every(c=>c[0]===1));e.guard.next();assert.equal(e.c.cur.key,'O');assert.equal(e.c.cy,5);});
test('holding gradual descent stops after THREE cells; later ticks cannot lock or move',()=>{const e=engine();toStep(e,2); // the helper leaves step 2 already completed
 assert.equal(e.c.cy,8);for(let i=0;i<200;i++)if(!e.c.mDown())e.c.lock();assert.equal(e.c.cy,8);assert.equal(e.c.lines,0);assert.ok(e.c.board.flat().every(v=>v===null));assert.ok(e.cancels>=4);});
test('hard-drop may call original down/lock internally; exactly one real line clears',()=>{const e=engine();toStep(e,3);assert.equal(e.c.cy,5);e.c.hardDrop();assert.equal(e.c.lines,1);assert.equal(e.guard.info().passed,true);assert.equal(e.c.board.flat().filter(Boolean).length,2);assert.equal(e.guard.next(),true);assert.equal(e.guard.info().complete,true);assert.equal(e.guard.next(),false);});
test('retry repairs a sabotaged bottomed-out piece and empties prior state',()=>{const e=engine();toStep(e,2);e.c.cy=18;e.c.board[19][0]='#fff';assert.equal(e.guard.retry(),true);assert.equal(e.c.cy,5);assert.equal(e.guard.info().passed,false);assert.ok(e.c.board.flat().every(v=>v===null));for(let i=0;i<3;i++)e.c.mDown();assert.equal(e.guard.info().passed,true);});
test('resetting final step rebuilds the gap, after completed clear',()=>{const e=engine();toStep(e,3);e.c.hardDrop();e.guard.retry();assert.equal(e.c.lines,0);assert.equal(e.c.cy,5);assert.equal(e.c.board[19][3],null);assert.equal(e.c.board[19][4],null);assert.equal(e.c.board[19].filter(Boolean).length,8);e.c.hardDrop();assert.equal(e.c.lines,1);});
test('exit cancels held inputs, restart returns to step one',()=>{const e=engine();const n=e.cancels;e.guard.exit();assert.equal(e.guard.info().active,false);assert.ok(e.cancels>n);e.guard.start();assert.equal(e.guard.info().step,0);assert.equal(e.c.cy,5);assert.equal(e.guard.next(),false);});

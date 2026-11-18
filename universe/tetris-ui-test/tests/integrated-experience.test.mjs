// Real tutorial/story modules + original game functions; DOM, timers and rendering are mocked.
// This validates lifecycle/input wiring, not CSS layout or browser touch synthesis.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {extractFunctions,inlineScripts} from '../../shared/tools/js-functions.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'),funcs=new Map(extractFunctions(inlineScripts(html)).map(f=>[f.name,f.text]));
function fixture({mobile=false}={}) {
 const ids=new Map(),all=[],events={},intervals=new Map();let context,id=0,normalStarts=0,submissions=0,loopTicks=0;
 class Node {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.listeners={};this.dataset={};this.hidden=false;this.disabled=false;this.style={setProperty(){}};this._classes=new Set();this.classList={add:(...a)=>a.forEach(x=>this._classes.add(x)),remove:(...a)=>a.forEach(x=>this._classes.delete(x)),contains:x=>this._classes.has(x),toggle:(x,on)=>{if(on??!this._classes.has(x))this._classes.add(x);else this._classes.delete(x);}};all.push(this);}
  set id(v){this._id=v;ids.set(v,this);}get id(){return this._id;}
  set className(v){this._classes=new Set(v.split(/\s+/).filter(Boolean));}get className(){return [...this._classes].join(' ');}
  set innerHTML(s){this._html=s;this.children=[];parse(s,this);}get innerHTML(){return this._html||'';}
  get firstElementChild(){return this.children[0];}
  append(...nodes){for(const n of nodes){if(n.parentNode)n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);n.parentNode=this;this.children.push(n);}}appendChild(n){this.append(n);return n;}
  setAttribute(k,v){if(k==='class')this.className=v;else if(k==='id')this.id=v;else this[k]=v;}
  addEventListener(t,fn,opt){(this.listeners[t]??=[]).push({fn,capture:opt===true});}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
  querySelectorAll(sel){const descendants=[];function visit(n){for(const c of n.children){descendants.push(c);visit(c);}}visit(this);return descendants.filter(n=>match(n,sel));}
  closest(sel){for(let n=this;n;n=n.parentNode)if(match(n,sel))return n;return null;}
  getBoundingClientRect(){return {top:140,left:100,right:400,width:300,height:600};}
  focus(){document.activeElement=this;}
  emit(type,data={}){const e={target:this,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...data};for(const l of (this.listeners[type]||[]).slice().sort((a,b)=>b.capture-a.capture)){l.fn(e);if(e.stopped)break;}return e;}
  click(){if(!this.disabled)this.emit('click');}
 }
 function match(n,sel){if(sel.includes(' ')){const p=sel.split(/\s+/);return match(n,p.pop())&&!!n.parentNode?.closest(p.join(' '));}if(sel.startsWith('#'))return n.id===sel.slice(1);if(sel.startsWith('.'))return sel.slice(1).split('.').every(c=>n.classList.contains(c));return n.tagName===sel.toUpperCase();}
 function parse(s,root){const stack=[root];for(const token of s.match(/<[^>]+>/g)||[]){if(/^<\//.test(token)){stack.pop();continue;}const m=token.match(/^<([\w-]+)/);if(!m)continue;const n=new Node(m[1]);for(const a of token.matchAll(/([\w-]+)="([^"]*)"/g))n.setAttribute(a[1],a[2]);if(/\shidden(?:\s|>)/.test(token))n.hidden=true;if(/\sdisabled(?:\s|>)/.test(token))n.disabled=true;stack.at(-1).append(n);if(!['img','br','input','hr'].includes(m[1]))stack.push(n);}}
 const document={body:new Node('body'),documentElement:new Node('html'),hidden:false,activeElement:null,createElement:tag=>new Node(tag),getElementById:k=>ids.get(k)||null,querySelector:sel=>all.find(n=>match(n,sel))||null,querySelectorAll:sel=>all.filter(n=>match(n,sel)),addEventListener(t,fn,capture){(events[t]??=[]).push({fn,capture});}};
 function node(id,tag='div',cls=''){const n=new Node(tag);n.id=id;n.className=cls;document.body.append(n);return n;}
 const title=node('s-title','div','screen'),game=node('s-game','div','screen off');const zone=node('title-zone','div','uit-z2');title.append(zone);
 for(const n of ['btn-how','btn-start','pause-btn','btn-quit','mc-play','mc-list','mc-prev','mc-next','mob-left','mob-right','mob-down','mob-rotl','mob-drop'])node(n,'button');
 for(const n of ['g-name','g-avatar','g-overlay','danger-img','cl-flash','lv-flash','sticker-img','board-wrap','board-canvas'])node(n,n==='g-avatar'?'img':'div');
 const hint=node('hint','div','ctrl-hint');game.append(hint);
 ids.get('g-name').textContent='測試玩家';ids.get('g-avatar').src='original-avatar.png';
 const controls=['left','right','rotate','down','drop'].map(a=>{const n=node('touch-'+a,'button','uit-btn');n.dataset.act=a;return n;});
 const canvasContext=new Proxy({},{get:()=>()=>{}});
 context=vm.createContext({document,console,innerWidth:mobile?390:1440,BVUiTest:{held:{},isMobileLayout:()=>mobile},setTimeout:()=>++id,clearTimeout(){},setInterval(fn){intervals.set(++id,fn);return id;},clearInterval(i){intervals.delete(i);},requestAnimationFrame:()=>++id,cancelAnimationFrame(){},MutationObserver:class{observe(){}},addEventListener(){},BVTetrisMenuAudio:{onGameStart(){}},pauseSong(){},toast(){},initCanvas(){},updateHUD(){},draw(){},clearGameVisualState(){},showScreen(id){document.querySelectorAll('.screen').forEach(n=>n.classList.add('off'));document.getElementById(id).classList.remove('off');},startGame(){normalStarts++;context.running=true;},gameOver(){submissions++;},loop(){loopTicks++;},get bCtx(){return canvasContext;}});
 context.window=context;
 vm.runInContext(`var COLS=10,ROWS=20,CELL=30,board,cur,nxt,cx,cy,score,lines,level,combo,peakCombo,diff='normal',particles=[],raf=null,stkTmr=null,dropAcc=0,running=false,paused=false;
 var balloonImg={complete:true,naturalWidth:64,src:'local.png'},IMG={balloon:'local.png'};
 var DIFF={normal:{mult:1.5,lperlv:10}},sfx=new Proxy({},{get:()=>()=>{}});
 var PIECES={O:{cells:[[0,0],[1,0],[0,1],[1,1]],color:'#ff85a1'},I:{cells:[[0,1],[1,1],[2,1],[3,1]],color:'#4fc3f7'},T:{cells:[[1,0],[0,1],[1,1],[2,1]],color:'#c77dff'}};
 function randPiece(){return {key:'O',cells:PIECES.O.cells.map(c=>c.slice()),color:PIECES.O.color};}
 function $(id){return document.getElementById(id)||{style:{},classList:{add(){},remove(){}}};}
 function showSticker(){}function spawnParticles(){}function showLvFlash(){}function checkDanger(){}
 `+['newBoard','valid','mLeft','mRight','mDown','tryRotate','hardDrop','lock','clearLines','getStickerKey'].map(n=>funcs.get(n)).join('\n'),context);
 ids.get('btn-start').addEventListener('click',()=>{context.showScreen('s-game');context.startGame('normal');});
 // Register the real keyboard handler before the capture guard, as in index.html.
 vm.runInContext(html.slice(html.indexOf('// keyboard\n')+12,html.indexOf('// mobile\n',html.indexOf('// keyboard\n'))),context);
 vm.runInContext(html.slice(html.indexOf('// mobile\n')+10,html.indexOf('// touch swipe on board',html.indexOf('// mobile\n'))),context);
 for(const p of ['creation-story.js','guided-practice.js','tutorial.js'])vm.runInContext(read(p),context);
 function key(k){const e={key:k,target:document.activeElement||document.body,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const l of [...(events.keydown||[])].sort((a,b)=>(b.capture?1:0)-(a.capture?1:0))){l.fn(e);if(e.stopped)break;}}
 return {c:context,document,ids,controls,intervals,key,get starts(){return normalStarts;},get submissions(){return submissions;},get ticks(){return loopTicks;}};
}
function finish(e){e.key('ArrowLeft');for(let i=0;i<3;i++)e.key('ArrowRight');e.ids.get('review-next-step').click();e.key('ArrowUp');e.ids.get('review-next-step').click();for(let i=0;i<3;i++)e.key('ArrowDown');e.ids.get('review-next-step').click();e.key(' ');e.ids.get('review-next-step').click();}
test('actual desktop keyboard completes all four steps; practice never starts/submits a run',()=>{const e=fixture();assert.equal(e.c.BVTetrisTutorial.info().active,false);e.ids.get('btn-how').click();assert.equal(e.document.activeElement.id,'board-canvas');e.c.loop();e.c.gameOver();assert.equal(e.ticks,0);assert.equal(e.submissions,0);e.key(' ');assert.equal(e.c.cy,5);finish(e);assert.equal(e.c.lines,1);assert.equal(e.c.BVTetrisTutorial.info().complete,true);assert.equal(e.document.activeElement.id,'review-play');assert.equal(e.starts,0);e.ids.get('review-play').click();assert.equal(e.starts,1);assert.equal(e.c.BVTetrisTutorial.info().active,false);assert.equal(e.intervals.size,0);assert.ok(e.controls.every(n=>!n.disabled&&!n.classList.contains('review-locked')));e.c.loop();e.c.gameOver();assert.equal(e.ticks,1);assert.equal(e.submissions,1);});
test('mobile only enables original requested controls; exit cancels holds and restores identity',()=>{const e=fixture({mobile:true});e.c.BVTetrisTutorial.open();assert.deepEqual(e.controls.filter(n=>!n.disabled).map(n=>n.dataset.act),['left','right']);e.c.BVUiTest.held.down={timer:7};e.c.mLeft();e.c.mRight();e.c.mRight();e.c.mRight();e.ids.get('review-next-step').click();assert.deepEqual(e.controls.filter(n=>!n.disabled).map(n=>n.dataset.act),['rotate']);e.key('Escape');assert.equal(e.c.running,false);assert.equal(e.ids.get('g-name').textContent,'測試玩家');assert.equal(e.ids.get('g-avatar').src,'original-avatar.png');assert.equal(Object.keys(e.c.BVUiTest.held).length,0);assert.equal(e.document.activeElement.id,'btn-how');assert.equal(e.intervals.size,0);e.c.BVTetrisTutorial.open();assert.equal(e.c.BVTetrisTutorial.info().step,0);assert.equal(e.c.cy,5);});
test('story swaps the real screen, supports arrows/swipes, returns home and starts the real game',()=>{const e=fixture();e.c.BVTetrisStory.open();assert.equal(e.ids.get('s-title').classList.contains('off'),true);assert.equal(e.ids.get('s-story').classList.contains('off'),false);e.key('ArrowRight');assert.match(e.ids.get('review-photo').src,/02.webp$/);const photo=e.ids.get('review-photo');photo.emit('touchstart',{touches:[{clientX:200,clientY:200}]});photo.emit('touchend',{changedTouches:[{clientX:100,clientY:205}]});assert.match(photo.src,/03.webp$/);e.key('Escape');assert.equal(e.ids.get('s-story').classList.contains('off'),true);e.c.BVTetrisStory.open();assert.match(photo.src,/01.webp$/);e.document.querySelector('.story-cta').click();assert.equal(e.starts,1);assert.equal(e.ids.get('s-story').classList.contains('off'),true);});

test('legacy original click references on wide touchscreen PCs cannot bypass the current step',()=>{const e=fixture();e.c.BVTetrisTutorial.open();const dropped=e.c.cur.key;e.ids.get('mob-drop').emit('click');assert.equal(e.c.cy,5);assert.equal(e.c.cur.key,dropped);assert.equal(e.c.lines,0);e.ids.get('mob-left').click();for(let i=0;i<3;i++)e.ids.get('mob-right').click();assert.equal(e.c.BVTetrisTutorial.info().passed,true);e.ids.get('review-next-step').click();const x=e.c.cx;e.ids.get('mob-left').emit('click');assert.equal(e.c.cx,x);e.ids.get('mob-rotl').click();assert.equal(e.c.BVTetrisTutorial.info().passed,true);});

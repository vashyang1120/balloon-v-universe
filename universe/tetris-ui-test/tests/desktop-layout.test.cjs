const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../desktop-ui.js'),'utf8');
function setup(w,h,{mobile=false,practice=false}={}){
 const side=Math.max(190,Math.min(260,w*.18)),gap=Math.max(16,Math.min(32,w*.02)),outer=Math.max(16,Math.min(32,w*.02));
 let calls=0;const props={};const canvas={width:380,height:760,style:{}};
 const game={classList:{contains:()=>false},getBoundingClientRect:()=>({width:w,height:h}),querySelectorAll:()=>[0,1].map(()=>({getBoundingClientRect:()=>({width:side})})),style:{setProperty(k,v){props[k]=v}}};
 const styles={paddingLeft:outer+'px',paddingRight:outer+'px',paddingTop:'24px',paddingBottom:(practice?124:24)+'px',columnGap:gap+'px'};
 const c={COLS:10,ROWS:20,CELL:38,score:78300,cx:3,cy:5,BVUiTest:{isMobileLayout:()=>mobile},initCanvas(){calls++;c.CELL=38;canvas.width=380;canvas.height=760;},document:{getElementById:id=>id==='s-game'?game:canvas},getComputedStyle:()=>styles};c.window=c;vm.createContext(c);vm.runInContext(source,c);c.initCanvas();return{c,canvas,props,get calls(){return calls},side,gap,outer,styles};
}
test('desktop viewport matrix: board and both panels fit horizontally and vertically, with square cells',()=>{
 for(const [w,h] of [[1920,936],[1920,1080],[1366,768],[1024,768],[901,600],[1280,480],[2560,1440]]){
  for(const practice of [false,true]){const f=setup(w,h,{practice});assert.equal(f.calls,1);assert.equal(f.canvas.width/10,f.canvas.height/20);assert.ok(f.canvas.width+4+f.side*2+f.gap*2+f.outer*2<=w,`${w}x${h} width`);assert.ok(f.canvas.height+4+24+Number.parseFloat(f.styles.paddingBottom)<=h,`${w}x${h} height`);assert.equal(f.props['--dt-board-h'],f.canvas.height+4+'px');assert.equal(f.c.score,78300);assert.equal(f.c.cx,3);assert.equal(f.c.cy,5);}
 }
});
test('large desktop actually grows the board beyond the old 38px cap',()=>{const f=setup(1920,936);assert.ok(f.c.CELL>38);assert.ok(f.canvas.height>760);});
test('mobile portrait and landscape leave the original canvas sizing untouched',()=>{for(const [w,h] of [[390,844],[430,932],[915,412]]){const f=setup(w,h,{mobile:true});assert.equal(f.calls,1);assert.equal(f.c.CELL,38);assert.equal(f.canvas.width,380);assert.equal(f.canvas.height,760);assert.deepEqual(f.props,{});}});
test('tutorial leaves an extra clear area for the accepted navigation below the board',()=>{const regular=setup(1366,768),practice=setup(1366,768,{practice:true});assert.ok(practice.canvas.height<regular.canvas.height);assert.ok(practice.canvas.height+4<=768-24-124);});

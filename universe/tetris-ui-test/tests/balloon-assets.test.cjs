const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../balloon-assets.js'),'utf8');
for(const scenario of ['success','error','timeout']) test('texture readiness: '+scenario,()=>{
 let image,timer,starts=0,retry;
 const element=()=>({style:{},setAttribute(){},append(){},addEventListener(_,fn){retry=fn;}});
 const ctx={document:{baseURI:'https://example.test/universe/tetris-ui-test/',body:{append(){}},createElement:element},Image:function(){image=this;},URL,setTimeout(fn){timer=fn;return 1;},clearTimeout(){},balloonCache:{stale:1},balloonImg:{},IMG:{},getTinted(){return 'texture';},startGame(d){starts++;assert.equal(d,'hard');}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
 ctx.startGame('hard');ctx.startGame('hard');assert.equal(starts,0);assert.notEqual(ctx.getTinted('red'),'texture');
 if(scenario==='error') image.onerror();
 if(scenario==='timeout') timer();
 if(scenario!=='success'){assert.equal(starts,0);const stale=image;retry();stale.naturalWidth=64;stale.naturalHeight=64;stale.onload();assert.equal(starts,0);}
 image.naturalWidth=64;image.naturalHeight=64;image.onload();assert.equal(starts,1);assert.equal(ctx.getTinted('red'),'texture');assert.equal(Object.keys(ctx.balloonCache).length,0);assert.match(image.src,/tetris-ui-test\/assets\/balloon_base.png/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../mv-sync.js',import.meta.url),'utf8');
function fixture(){
 let now=0,clock=0,seq=0,timers=new Map(),players=[],nodes={};
 const node=id=>({id,style:{},pause(){this.pauses=(this.pauses||0)+1;},load(){},removeAttribute(){},appendChild(n){nodes[n.id]=n;}});
 nodes['bg-video']=node('bg-video');nodes['yt-iframe-wrap']=node('yt-iframe-wrap');nodes['mv-btn']=node('mv-btn');
 const schedule=(fn,delay,repeat)=>{let key=++seq;timers.set(key,{fn,at:now+delay,delay,repeat});return key;};
 function advance(ms){let end=now+ms;for(;;){let due=[...timers].filter(([k,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;let [k,v]=due;now=v.at;if(v.repeat)v.at+=v.delay;else timers.delete(k);v.fn();}now=end;}
 class Player{
 constructor(id,opt){this.opt=opt;this.time=0;this.seeks=[];this.plays=0;this.pauses=0;players.push(this);}
 emit(n){this.opt.events.onStateChange({data:n,target:this});}
 ready(){this.opt.events.onReady({target:this});}
 cueVideoById(o){this.time=o.startSeconds;this.cue=o;}
 mute(){this.muted=true;}
 playVideo(){this.plays++;}
 pauseVideo(){this.pauses++;}
 seekTo(t){this.time=t;this.seeks.push(t);}
 getCurrentTime(){return this.time;}
 getDuration(){return 180;}
 destroy(){this.destroyed=true;}
 }
 let ctx={document:{getElementById:id=>nodes[id],createElement:()=>node(''),head:{appendChild(){}}},location:{origin:'https://example.test'},YT:{Player},G:{running:true,paused:false},getGameTimeSec:()=>clock,Date:{now:()=>now},setTimeout:(f,d)=>schedule(f,d,false),setInterval:(f,d)=>schedule(f,d,true),clearTimeout:k=>timers.delete(k),clearInterval:k=>timers.delete(k),addEventListener(){}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
 return {mv:ctx.RVMV,players,nodes,ctx,advance,clock(t){clock=t;}};
}
const song={youtubeId:'Ba_DPuAf0qU'};
const tick=()=>new Promise(r=>setImmediate(r));
test('cue is muted; no play before GO; no redundant seek; pause/resume reuse player',async()=>{let f=fixture(),p=f.mv.prepare(song);await tick();let y=f.players[0];y.ready();assert.equal(y.muted,true);assert.equal(y.plays,0);y.emit(5);assert.equal(await p,'ready');f.mv.play(0);assert.equal(y.plays,1);assert.equal(y.seeks.length,0);f.mv.pause();assert.equal(y.pauses,1);f.mv.play(12.3);assert.equal(y.seeks[0],12.3);assert.equal(f.players.length,1);});
test('buffer recovery seeks to audio clock and drift correction is throttled',async()=>{let f=fixture(),p=f.mv.prepare(song);await tick();let y=f.players[0];y.ready();y.emit(5);await p;f.mv.play(0);y.emit(3);f.clock(10);f.advance(4000);assert.equal(y.seeks.length,0);y.emit(1);assert.equal(y.time,10);f.clock(14);f.advance(1000);assert.equal(y.time,10);f.advance(3000);assert.equal(y.time,14);});
test('timeout does not block countdown; late ready catches up only when playing',async()=>{let f=fixture(),p=f.mv.prepare(song);await tick();let y=f.players[0];f.advance(6500);assert.equal(await p,'timeout');f.mv.play(0);f.clock(9);y.ready();y.emit(5);assert.equal(y.time,9);assert.equal(y.plays,1);});
test('stale player callbacks cannot affect replacement round; stop clears player',async()=>{let f=fixture(),a=f.mv.prepare(song);await tick();let old=f.players[0];let b=f.mv.prepare({youtubeId:'abcdefghijk',mvOffsetSec:2});assert.equal(await a,'cancelled');await tick();let y=f.players[1];old.emit(5);old.ready();assert.equal(old.destroyed,true);y.ready();y.emit(5);assert.equal(await b,'ready');assert.equal(y.cue.startSeconds,2);f.mv.play(6);assert.equal(y.time,8);f.mv.stop();assert.equal(y.destroyed,true);assert.equal(f.mv.debug(),null);});
test('no MV and provider error settle without blocking',async()=>{let f=fixture();assert.equal(await f.mv.prepare({}),'none');let p=f.mv.prepare(song);await tick();f.players[0].opt.events.onError({data:100});assert.equal(await p,'error');f.mv.play(0);assert.equal(f.players[0].plays,0);});
test('native video is prepared without autoplay, then reuses playback position',async()=>{let f=fixture(),v=f.nodes['bg-video'];v.currentTime=0;v.duration=180;v.play=function(){this.plays=(this.plays||0)+1;return Promise.resolve();};let p=f.mv.prepare({videoUrl:'video.mp4'});assert.equal(v.plays,undefined);v.oncanplay();assert.equal(await p,'ready');f.mv.play(0);assert.equal(v.plays,1);f.mv.pause();f.mv.play(4);assert.equal(v.currentTime,4);assert.equal(v.muted,true);});

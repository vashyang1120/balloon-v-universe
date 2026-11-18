/* v2.7.0-tutorial-test-2 — one real MV session, checkpoint retry, no submissions. */
(function(){
"use strict";
var mode="",stage=0,epoch=0,priorSong=null,overlay=null,marker=null,baseline=null,autoChecked=false;
var START=207,END=226.7,asset="../../assets/rpg/";
var lessons=[
 {at:0.35, end:3.6, notes:[{t:2.9,lane:0}], title:"圓形音符", text:"看到這顆圓形音符了嗎？這種音符只要點一下喔！"},
 {at:4.2,end:9.4,notes:[{t:5.5,lane:0},{t:6.6,lane:1},{t:7.7,lane:2},{t:8.8,lane:3}],title:"連擊 COMBO",text:"連續擊中音符就會累積 COMBO！如果 MISS，連擊就會重新開始。試試看連續打中四顆音符！"},
 {at:10.2,end:16.4,notes:[{t:12.2,lane:2,hold:1.6},{t:14.5,lane:3,hold:1.2}],title:"長音符",text:"長長的音符碰到白色判定線時，按住對應軌道，直到整條尾巴通過白線才放開。"}
];
function $(id){return document.getElementById(id);}
function key(){var p=window.UniverseRhythm&&UniverseRhythm.getPlayer();return p&&p.playerId?"vRhythmV270UniverseTest1::tutorialSeen::"+p.playerId:null;}
function seen(){try{return key()&&localStorage.getItem(key());}catch(e){return false;}}
function remember(v){try{if(key())localStorage.setItem(key(),v);}catch(e){}}
function clear(){if(overlay)overlay.remove();if(marker)marker.remove();overlay=marker=null;document.querySelectorAll(".rv-coach-target").forEach(function(n){n.classList.remove("rv-coach-target");});}
function halt(){G.running=false;G.paused=false;cancelAnimationFrame(G.raf);stopAudio();RVMV.stop();resumeCountdownToken++;isResumeCountingDown=false;G.holding=[false,false,false,false];}
function card(title,text,action,label,pose,target,skip){
 clear();
 var panel=document.createElement("div");panel.className="rv-coach-card";
 var img=document.createElement("img");img.src=asset+(pose||"v_full_point_right.png");img.alt="小V老師";panel.appendChild(img);
 var body=document.createElement("div"),heading=document.createElement("strong"),p=document.createElement("p"),btn=document.createElement("button"),quit=document.createElement("button"),row=document.createElement("div");
 heading.textContent=title;p.textContent=text;btn.textContent=label||"繼續";btn.className="btn btn-y";btn.onclick=action;
 quit.textContent=skip?"略過教學":"離開教學";quit.className="btn btn-outline";quit.onclick=function(){remember("skipped");exit();};
 row.className="rv-coach-actions";row.append(btn,quit);body.append(heading,p,row);panel.appendChild(body);
 var host=mode==="welcome"?$("s-title"):$("s-game");host.appendChild(panel);overlay=panel;
 if(target)highlight(target);
}
function highlight(target){
 if(target==="line"){
  document.querySelectorAll("#lanes .hline").forEach(function(el){el.classList.add("rv-coach-target");});
  var line=document.querySelector("#lanes .hline");if(!line)return;
  marker=document.createElement("div");marker.className="rv-coach-arrow";marker.textContent="白色判定線 →";
  var r=line.getBoundingClientRect(),g=$("s-game").getBoundingClientRect();marker.style.left=Math.max(8,r.left-g.left-145)+"px";marker.style.top="12%";$("s-game").appendChild(marker);
 }else{
  var note=G.notes.find(function(n){return !n.missed&&n.el;});if(note){note.el.classList.add("rv-coach-target");if(note.tailEl)note.tailEl.classList.add("rv-coach-target");}
 }
}
function freeze(){
 if(audioSource){G.gt=getGameTimeMs();pauseAudio();}else audioPauseOffset=G.gt/1000;
 RVMV.pause();G.paused=true;cancelAnimationFrame(G.raf);G.raf=null;G.holding=[false,false,false,false];
 $("pause-ov").classList.add("off");
}
function restore(at){
 stopAudio();RVMV.pause();G.notes.forEach(function(n){if(n.el)n.el.remove();if(n.tailEl)n.tailEl.remove();});
 G.notes=[];G.nid=0;G.beatIdx=0;G.holding=[false,false,false,false];G.tutorialEarlyRelease=false;
 G.gt=at*1000;audioPauseOffset=at;RVMV.seekPaused(at);
 while(G.beatIdx<G.beatmap.length&&G.beatmap[G.beatIdx].t<at)G.beatIdx++;
 if(baseline){["score","combo","maxCombo","perf","good","miss"].forEach(function(k){G[k]=baseline[k];});}
 laneEls.forEach(function(l){l.classList.remove("pressing");});
 spawnNotes();
 // Include the first target even if it has not reached the left edge on a short viewport.
 var next=G.beatmap[G.beatIdx];if(!G.notes.length&&next&&stage<lessons.length&&next.t===lessons[stage].notes[0].t){makeNote(next.lane,next.t*1000,(next.hold||0)*1000);G.beatIdx++;}
 moveNotes();lastLyricTxt="";updateLyrics();updateHUD();
}
function resume(){
 clear();G.paused=false;G.running=true;
 if(audioCtx.state==="suspended")audioCtx.resume().catch(function(){});
 startAudio(audioPauseOffset);RVMV.play(audioPauseOffset);cancelAnimationFrame(G.raf);G.raf=requestAnimationFrame(loop);
}
function explain(){
 freeze();mode="explain";
 var l=lessons[stage];baseline={};["score","combo","maxCombo","perf","good","miss"].forEach(function(k){baseline[k]=G[k];});
 // Spawn the actual target at this checkpoint even on a narrow screen.
 restore(l.at);
 card(l.title,l.text,stage===0?lineExplanation:tryLesson,"繼續","v_full_point_right.png",stage===1?"line":"note");
}
function lineExplanation(){card("白色判定線","等音符移動到右側白色判定線時，按下對應軌道。PERFECT 分數最高，GOOD 是差一點點，MISS 是 0 分。",tryLesson,"開始試試看","v_full_point_right.png","line");}
function tryLesson(){mode="try";restore(lessons[stage].at);resume();}
function retry(){freeze();mode="retry";restore(lessons[stage].at);card("再試一次","沒關係！"+(stage===2?"長音符要按到尾巴完全通過白線。":"等音符碰到白色判定線，記得按對軌道。"),tryLesson,"再練習","v_full_remind.png","line");}
function success(){
 freeze();mode="success";
 card("太棒了！",stage===2?"長音符也學會了！跟著音樂，把這段回憶好好玩完吧！":"你抓到節奏了！接著學習下一個技巧。",function(){stage++;mode=stage<lessons.length?"playing":"free";resume();},"繼續","v_bust_congrats.png");
}
function afterFrame(){
 if(mode==="playing"&&stage<lessons.length&&G.gt>=lessons[stage].at*1000){explain();return true;}
 if(mode==="try"){
  if(G.miss>baseline.miss||G.tutorialEarlyRelease){retry();return true;}
  if(G.perf+G.good-baseline.perf-baseline.good>=lessons[stage].notes.length){success();return true;}
  if(G.gt>=lessons[stage].end*1000){retry();return true;}
 }
 return false;
}
async function clip(){
 clear();halt();G=mkG();G.diff="easy";buildLanes();updateHUD();$("prog").style.width="0%";$("pause-ov").classList.add("off");$("countdown").textContent="";$("lyric-main").textContent="";$("lyric-sub").textContent="";lastLyricTxt="";
 go("s-game");mode="loading";var token=++epoch;
 card("準備演奏","正在準備原版音樂與 MV…",function(){remember("skipped");exit();},"取消","v_full_wave.png");
 try{
  await ensureSongsLoaded();if(token!==epoch)return;
  var song=SONGS.find(function(s){return s.id==="song009";});if(!song)throw Error("找不到教學歌曲");
  G.song=song;G.tutorialClipStart=START;G.duration=Math.round((END-START)*1000);
  initACtx();if(audioCtx.state==="suspended")audioCtx.resume().catch(function(){});
  var mv=RVMV.prepare(Object.assign({},song,{mvOffsetSec:START+(Number(song.mvOffsetSec)||0)}));
  var results=await Promise.all([loadAudio(song.audioUrl),loadSRT(song.srtUrl),mv]);
  if(token!==epoch)return;
  if(!audioBuffer||audioBuffer.duration<END)throw Error("音樂無法載入");
  G.beatmap=lessons.flatMap(function(l){return l.notes;}).concat([{t:17.35,lane:0},{t:18.1,lane:1},{t:18.85,lane:2}]);G.total=G.beatmap.length;
  G.lyrics=results[1].filter(function(l){return l.t>=206.633&&l.t<END;}).map(function(l){return {t:Math.max(0,l.t-START),text:l.text};});
  if(G.lyrics.length!==4)throw Error("字幕無法載入");
  clear();mode="playing";countdown(3);
 }catch(e){if(token!==epoch)return;halt();mode="loading";card("載入未完成",String(e.message||e)+"，請再試一次。",clip,"重新載入","v_full_remind.png");}
}
function complete(){if(!mode)return;freeze();halt();mode="complete";remember("completed");card("教學完成！","太棒了！你已經學會怎麼玩囉！還有好多首充滿故事的歌曲等著你一起探索呢！",exit,"回到首頁","v_bust_congrats.png");}
function exit(){++epoch;halt();clear();mode="";G=mkG();selectedSong=priorSong;go("s-title");}
function enter(){if(mode)return;priorSong=selectedSong;stage=0;baseline=null;mode="welcome";
 card("歡迎來到魔法音樂派對！","今天小V老師帶你一起打節奏！這首《那間教室的氣球時光》，記錄了我和孩子們一起上氣球課的美好回憶。",clip,"開始教學","v_full_open_arms.png",null,true);}
function maybeAuto(){if(autoChecked||!key()||!$("s-title")||$("s-title").classList.contains("off"))return;autoChecked=true;if(!seen())enter();}
function interceptPause(){return mode==="explain"||mode==="retry"||mode==="success"||mode==="complete"||mode==="loading";}
window.RVCoach={enter:enter,exit:exit,maybeAuto:maybeAuto,active:function(){return !!mode;},afterFrame:afterFrame,complete:complete,interceptPause:interceptPause,debug:function(){return {mode:mode,stage:stage,start:START,end:END,checkpoint:lessons[stage]&&lessons[stage].at};}};
})();

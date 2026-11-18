/* v2.7.0-tutorial-test-1: real lane engine, no score submission. */
(function(){
"use strict";
var mode="",stage=0,epoch=0,priorSong=null,origin=0,frozen=0,overlay=null;
var START=207,END=226.7;
var PICK=[207.65,208.763,209.623,212.205,213.498,214.494,215.342,217.356,218.585,219.651,220.474,222.46,223.692,224.294,225.241,225.669];
var lessons=[
 {text:"音符會由左往右移動。到達右側圓圈時，點一下該軌道（電腦可按圓圈上的鍵）。",notes:[{t:2,lane:0}]},
 {text:"四條軌道都要注意！連續擊中可以累積 COMBO；PERFECT 比 GOOD 更準，漏接是 MISS。",notes:[{t:2,lane:0},{t:3.3,lane:1},{t:4.6,lane:2},{t:5.9,lane:3}]},
 {text:"長音符到達圓圈時按住，直到尾巴完全通過才放開。",notes:[{t:2,lane:2,hold:1.5}]}
];
function $(id){return document.getElementById(id);}
function halt(){G.running=false;cancelAnimationFrame(G.raf);stopAudio();RVMV.stop();resumeCountdownToken++;isResumeCountingDown=false;G.holding=[false,false,false,false];}
function reset(){halt();G=mkG();G.diff="easy";buildLanes();updateHUD();$("prog").style.width="0%";$("pause-ov").classList.add("off");$("countdown").textContent="";$("lyric-main").textContent="";$("lyric-sub").textContent="";lastLyricTxt="";go("s-game");}
function clear(){if(overlay){overlay.remove();overlay=null;}}
function card(title,text,action,label){
 clear();
 var panel=document.createElement("div");panel.className="rv-coach-card";
 var img=document.createElement("img");img.src="../../assets/rpg/v_bust_point.png";img.alt="小V老師";panel.appendChild(img);
 var body=document.createElement("div"),h=document.createElement("strong"),p=document.createElement("p"),btn=document.createElement("button"),quit=document.createElement("button");
 h.textContent=title;p.textContent=text;btn.textContent=label||"開始練習";btn.className="btn btn-y";btn.onclick=action;quit.textContent="離開教學";quit.className="btn btn-outline";quit.onclick=exit;
 body.append(h,p,btn,quit);panel.appendChild(body);$("s-game").appendChild(panel);overlay=panel;
}
function hint(text){clear();var n=document.createElement("div");n.className="rv-coach-hint";n.textContent=text;$("s-game").appendChild(n);overlay=n;}
function selectNotes(notes){return PICK.map(function(t){var n=notes.find(function(n){return Math.abs(n.t-t)<0.0005;});if(!n)throw Error("教學原譜面缺少音符 "+t);return {t:n.t-START,lane:n.lane,hold:n.hold||0};});}
function lesson(){reset();mode="intro";card("小V老師・練習 "+(stage+1)+"/3",lessons[stage].text,practice);}
function practice(){reset();mode="practice";G.tutorialPractice=true;G.beatmap=lessons[stage].notes.map(function(n){return Object.assign({},n);});G.total=G.beatmap.length;G.duration=20000;origin=performance.now();frozen=0;G.running=true;hint(lessons[stage].text);G.raf=requestAnimationFrame(loop);}
function practiceClock(){return G.paused?frozen:(performance.now()-origin)/1000;}
function pausePractice(){frozen=G.gt/1000;}
function resumePractice(){origin=performance.now()-frozen*1000;}
function afterFrame(){
 if(mode!=="practice")return false;
 if(G.miss||G.tutorialEarlyRelease){halt();mode="intro";card("再試一次","沒關係！看準圓圈，長音符要按到底喔。",practice,"再練習");return true;}
 if(G.perf+G.good>=G.total){halt();stage++;if(stage<lessons.length){mode="intro";card("成功！","做得很好，接下來學習下一個技巧。",lesson,"下一步");}else story();return true;}return false;
}
function story(){mode="story";card("歌曲背後的故事","這首《那間教室的氣球時光》，是小V老師為了記錄和孩子們一起上氣球課的美好回憶而創作的喔！跟著音樂，一起把這些回憶變成快樂的節奏吧！",clip,"開始演奏");}
async function clip(){
 reset();mode="loading";var token=++epoch;
 card("準備演奏","正在準備原版音樂與 MV…",exit,"取消");
 try{
  await ensureSongsLoaded();if(token!==epoch)return;
  var song=SONGS.find(function(s){return s.id==="song009";});if(!song)throw Error("找不到教學歌曲");
  G.song=song;G.tutorialClipStart=START;G.duration=Math.round((END-START)*1000);
  initACtx();if(audioCtx.state==="suspended")audioCtx.resume().catch(function(){});
  var mv=RVMV.prepare(Object.assign({},song,{mvOffsetSec:START+(Number(song.mvOffsetSec)||0)}));
  var results=await Promise.all([loadAudio(song.audioUrl),fetch(song.beatmapUrl).then(function(r){if(!r.ok)throw Error("譜面無法載入");return r.json();}),loadSRT(song.srtUrl),mv]);
  if(token!==epoch)return;
  if(!audioBuffer||audioBuffer.duration<END)throw Error("音樂無法載入");
  G.beatmap=selectNotes(results[1]);G.total=G.beatmap.length;
  G.lyrics=results[2].filter(function(l){return l.t>=206.633&&l.t<END;}).map(function(l){return {t:Math.max(0,l.t-START),text:l.text};});
  if(G.lyrics.length!==4)throw Error("字幕無法載入");
  clear();mode="clip";countdown(3);
 }catch(e){if(token!==epoch)return;halt();mode="story";card("載入未完成",String(e.message||e)+"，請再試一次。",clip,"重新載入");}
}
function complete(){if(!mode)return;halt();mode="complete";card("教學完成！","太棒了！你已經學會怎麼玩囉！還有好多首充滿故事的歌曲等著你一起探索呢！",exit,"回到首頁");}
function exit(){++epoch;halt();clear();mode="";G=mkG();selectedSong=priorSong;go("s-title");}
function enter(){if(mode)return;priorSong=selectedSong;stage=0;initACtx();if(audioCtx.state==="suspended")audioCtx.resume().catch(function(){});reset();mode="intro";card("歡迎來到魔法音樂派對！","今天小V老師要帶你一起學習怎麼跟著音樂打出好聽的節奏！",lesson,"開始教學");}
window.RVCoach={enter:enter,exit:exit,active:function(){return !!mode;},afterFrame:afterFrame,practiceClock:practiceClock,pausePractice:pausePractice,resumePractice:resumePractice,complete:complete,debug:function(){return {mode:mode,stage:stage,start:START,end:END,picks:PICK.slice()};}};
})();

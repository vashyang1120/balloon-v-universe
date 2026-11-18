/* v2.7.0: audio clock is authoritative; MV never blocks gameplay indefinitely. */
(function(){
  "use strict";
  var active=null, generation=0, apiPromise=null, MAX_WAIT=6500;
  function $(id){return document.getElementById(id);}
  function call(p,k,args){try{return p&&typeof p[k]==="function"?p[k].apply(p,args||[]):undefined;}catch(e){return undefined;}}
  function api(){
    if(window.YT&&YT.Player)return Promise.resolve(YT);
    if(apiPromise)return apiPromise;
    apiPromise=new Promise(function(resolve,reject){
      var old=window.onYouTubeIframeAPIReady, timer=setTimeout(function(){reject(Error("YT API timeout"));},MAX_WAIT);
      window.onYouTubeIframeAPIReady=function(){clearTimeout(timer);try{if(old)old();}finally{resolve(window.YT);}};
      var script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.onerror=function(){clearTimeout(timer);reject(Error("YT API unavailable"));};document.head.appendChild(script);
    }).catch(function(e){apiPromise=null;throw e;});
    return apiPromise;
  }
  function current(s){return active===s&&s.gen===generation;}
  function target(s,sec){return Math.max(0,Number(sec||0)+s.offset);}
  function clock(){return typeof window.getGameTimeSec==="function"?Math.max(0,window.getGameTimeSec()):0;}
  function settle(s,status){if(!current(s))return;s.status=status;if(s.resolve){clearTimeout(s.timeout);var r=s.resolve;s.resolve=null;r(status);}}
  function seek(s,sec,force){
    var t=target(s,sec),actual=s.video?s.video.currentTime:call(s.player,"getCurrentTime");
    if(!force&&(!Number.isFinite(actual)||Math.abs(t-actual)<0.65))return;
    var duration=s.video?s.video.duration:call(s.player,"getDuration");
    if(Number.isFinite(duration)&&duration>0&&t>=duration)t=Math.max(0,duration-0.1);
    try{if(s.video)s.video.currentTime=t;else call(s.player,"seekTo",[t,true]);}catch(e){}
    s.lastSeek=Date.now();
  }
  function start(s,sec){
    if(!current(s)||!s.want||!s.ready)return;
    // Keep a cued frame at the correct position; avoid an unnecessary network seek at GO.
    var actual=s.video?s.video.currentTime:call(s.player,"getCurrentTime");
    if(!Number.isFinite(actual)||Math.abs(target(s,sec)-actual)>0.15)seek(s,sec,true);
    if(s.video){s.video.muted=true;var p=s.video.play();if(p&&p.catch)p.catch(function(){s.status="blocked";});}
    else{call(s.player,"mute");call(s.player,"playVideo");}
  }
  function stop(){
    ++generation;var s=active;active=null;
    if(s){clearTimeout(s.timeout);clearInterval(s.interval);if(s.resolve)s.resolve("cancelled");if(s.player)call(s.player,"destroy");if(s.video){s.video.oncanplay=null;s.video.onerror=null;s.video.onwaiting=null;s.video.onplaying=null;s.video.onended=null;}}
    var v=$("bg-video");if(v){v.pause();v.removeAttribute("src");v.load();v.style.display="none";}
    var wrap=$("yt-iframe-wrap");if(wrap){wrap.textContent="";var f=document.createElement("div");f.id="yt-player";wrap.appendChild(f);}
  }
  function prepare(song){
    stop();var s={gen:generation,song:song,offset:Number(song.mvOffsetSec)||0,want:false,ready:false,status:"loading",lastSeek:0,player:null,video:null,buffering:false};
    active=s;
    var btn=$("mv-btn");if(btn)btn.style.display="none";
    var promise=new Promise(function(resolve){s.resolve=resolve;s.timeout=setTimeout(function(){settle(s,"timeout");},MAX_WAIT);});
    s.interval=setInterval(function(){if(!current(s)||!s.want||!s.ready||!window.G||!G.running||G.paused)return;
      if(Date.now()-s.lastSeek>2500&&!s.buffering)seek(s,clock(),false);
    },1000);
    if(song.videoUrl){
      var v=$("bg-video");s.video=v;v.muted=true;v.preload="auto";v.loop=false;v.style.display="block";
      v.oncanplay=function(){if(!current(s))return;s.ready=true;settle(s,"ready");if(s.want)start(s,clock());};
      v.onwaiting=function(){if(current(s))s.buffering=true;};
      v.onplaying=function(){if(!current(s))return;var was=s.buffering;s.buffering=false;if(!s.want)v.pause();else if(was)seek(s,clock(),false);};
      v.onended=function(){if(current(s))s.want=false;};
      v.onerror=function(){if(current(s)){s.ready=false;settle(s,"error");}};v.src=song.videoUrl;v.load();
      return promise;
    }
    var id=String(song.youtubeId||"").trim().replace(/.*shorts\//,"").replace(/.*v=/,"").replace(/[?&].*/,"");
    if(!/^[\w-]{11}$/.test(id)){settle(s,"none");return promise;}
    api().then(function(YT){
      if(!current(s))return;
      s.player=new YT.Player("yt-player",{width:"100%",height:"100%",videoId:id,playerVars:{autoplay:0,controls:0,playsinline:1,rel:0,origin:location.origin,enablejsapi:1},events:{
        onReady:function(e){if(!current(s)){call(e.target,"destroy");return;}s.player=e.target;call(s.player,"mute");call(s.player,"cueVideoById",[{videoId:id,startSeconds:target(s,0)}]);},
        onStateChange:function(e){
          if(!current(s))return;
          if(e.data===5){var first=!s.ready;s.ready=true;settle(s,"ready");if(first&&s.want)start(s,clock());}
          if(e.data===3){s.buffering=true;}
          if(e.data===1){var was=s.buffering;s.buffering=false;if(!s.want){call(s.player,"pauseVideo");return;}if(was||Date.now()-s.lastSeek>500)seek(s,clock(),false);}
          if(e.data===0){s.want=false;}
        },
        onError:function(){if(current(s)){s.ready=false;settle(s,"error");}}
      }});
    }).catch(function(){settle(s,"error");});
    return promise;
  }
  window.RVMV={
    prepare:prepare,
    play:function(sec){var s=active;if(!s)return;s.want=true;start(s,sec);},
    pause:function(){var s=active;if(!s)return;s.want=false;if(s.video)s.video.pause();else call(s.player,"pauseVideo");},
    seekPaused:function(sec){var s=active;if(!s||!s.ready)return;s.want=false;seek(s,sec,true);},
    stop:stop,
    debug:function(){var s=active;return s?{status:s.status,want:s.want,ready:s.ready,offset:s.offset,time:s.video?s.video.currentTime:call(s.player,"getCurrentTime"),audio:clock(),buffering:s.buffering}:null;}
  };
  window.addEventListener("pagehide",stop);
})();

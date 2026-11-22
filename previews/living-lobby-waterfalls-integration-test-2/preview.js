"use strict";
const scene = document.createElement("canvas");
scene.width = 1536;
scene.height = 1024;
const ctx = scene.getContext("2d");
const view = document.querySelector("#map");
const display = view.getContext("2d");
const flyover = document.querySelector("#flyover").getContext("2d");
const characterLayer = document.querySelector("#character-layer");
characterLayer.width = 3072;
characterLayer.height = 2048;
const characterContext = characterLayer.getContext("2d");
const status = document.querySelector("#status");
const hotspot = document.querySelector("#art-hotspot");
const dialog = document.querySelector("#art-dialog");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const toggle = document.querySelector("#play");
const reset = document.querySelector("#reset");
const visitName = document.querySelector("#visit-name");
let selectedArt;
let characterMode = "star";
let elapsed = 0;
let last = null;
let animation = 0;
let running = !motion.matches;

function envelope(t, period, delay, keys) {
  t = ((t-delay)%period+period)%period;
  for(let i=1;i<keys.length;i++){
    const [end, peak]=keys[i];
    if(t>end) continue;
    const [start, base]=keys[i-1];
    const u=(t-start)/(end-start);
    return base+(peak-base)*u*u*(3-2*u);
  }
  return 0;
}
function makePulse(sprite, note, settings){
  const [ox,oy,w,h]=note.boundsXYWH;
  const canvas=document.createElement('canvas');
  canvas.width=w;
  canvas.height=h;
  const paint=canvas.getContext('2d',{willReadFrequently:true});
  paint.drawImage(sprite,0,0);
  const source=paint.getImageData(0,0,w,h).data;
  const image=paint.createImageData(w,h);
  const centers=settings.centers.map(([x,y])=>[x-ox,y-oy]);
  const {core,radius,keyframes}=settings;
  return (t,gain,period,delay)=>{
    const beats=[envelope(t,period,0,keyframes),envelope(t,period,delay,keyframes)];
    const index=beats.findIndex(value=>value!==0);
    if(index<0) return sprite;
    const [cx,cy]=centers[index];
    image.data.set(source);
    for(let y=Math.max(0,cy-radius);y<Math.min(h,cy+radius);y++){
      for(let x=Math.max(0,cx-radius);x<Math.min(w,cx+radius);x++){
        const distance=Math.hypot(x-cx,y-cy);
        if(distance>=radius) continue;
        const u=Math.max(0,(distance-core)/(radius-core));
        // Blend the head's scale into the original stem without splitting the sprite.
        const scale=1+gain/100*beats[index]*(1-(settings.wholeShare??0))*(1-u*u*(3-2*u));
        const xx=cx+(x-cx)/scale, yy=cy+(y-cy)/scale;
        const left=Math.floor(xx), top=Math.floor(yy);
        let alpha=0,red=0,green=0,blue=0;
        for(let v=0;v<2;v++){
          for(let k=0;k<2;k++){
            if(left+k<0 || top+v<0 || left+k>=w || top+v>=h) continue;
            const pos=4*((top+v)*w+left+k);
            const weight=(k?xx-left:1-(xx-left))*(v?yy-top:1-(yy-top));
            const a=source[pos+3]*weight;
            alpha+=a;
            red+=source[pos]*a;
            green+=source[pos+1]*a;
            blue+=source[pos+2]*a;
          }
        }
        const pos=4*(y*w+x);
        image.data[pos]=alpha?red/alpha:0;
        image.data[pos+1]=alpha?green/alpha:0;
        image.data[pos+2]=alpha?blue/alpha:0;
        image.data[pos+3]=alpha;
      }
    }
    paint.putImageData(image,0,0);
    return canvas;
  };
}


function load(src){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(Error(src.slice(0,90)));
    image.src=src;
  });
}
function makeWarp(sprite, flag) {
  const [x,y,sourceWidth,sourceHeight]=flag.boundsXYWH;
  const vertical=flag.axis==='y';
  const w=vertical?sourceHeight:sourceWidth, h=vertical?sourceWidth:sourceHeight;
  const pad=5, width=w+2*pad, height=h+2*pad;
  const work=document.createElement('canvas');
  work.width=width;
  work.height=height;
  const paint=work.getContext('2d',{willReadFrequently:true});
  paint.save();
  if(vertical) paint.transform(0,1,1,0,0,0);
  paint.drawImage(sprite,pad,pad);
  paint.restore();
  const source=paint.getImageData(0,0,width,height).data;
  const target=paint.createImageData(width,height);
  const anchor=flag.warpAnchorXY ?? flag.anchorXY;
  const root=vertical?anchor[1]-y+pad:anchor[0]-x+pad;
  const length=flag.axis==='both'?Math.max(root-pad,w-(root-pad))-2:w-2;
  return function draw(seconds){
    const cycle=seconds*2*Math.PI/flag.periodSeconds + flag.phaseRadians;
    for(let column=0;column<width;column++){
      const direction=flag.axis==='both'?(column+.5<root?-1:1):flag.flagDirection;
      const signed=(column+.5-root)*direction;
      const u=Math.max(0,Math.min(1,(signed-1.5)/length));
      // Wind sweeps from the fixed seam toward the free edge.
      const phase=cycle-3.4*u;
      const strength=u*u*(3-2*u);
      const dy=flag.maxVerticalAmplitudePx*strength*(.8*Math.sin(phase)+.2*Math.sin(1.7*cycle-4.6*u));
      const dx=direction*1.38*strength*(.5+.5*Math.cos(phase));
      for(let row=0;row<height;row++){
        const address=4*(row*width+column);
        const sx=column+dx, sy=row-dy;
        const ix=Math.floor(sx), iy=Math.floor(sy);
        if(sx===column && sy===row){
          for(let channel=0;channel<4;channel++) target.data[address+channel]=source[address+channel];
          continue;
        }
        let alpha=0, red=0, green=0, blue=0;
        for(let v=0;v<2;v++){
          for(let u=0;u<2;u++){
            const px=ix+u, py=iy+v;
            if(px<0 || px>=width || py<0 || py>=height) continue;
            const weight=(u?sx-ix:1-sx+ix)*(v?sy-iy:1-sy+iy);
            const pos=4*(py*width+px);
            const opacity=source[pos+3]*weight;
            alpha+=opacity;
            red+=source[pos]*opacity;
            green+=source[pos+1]*opacity;
            blue+=source[pos+2]*opacity;
          }
        }
        target.data[address]=alpha?red/alpha:0;
        target.data[address+1]=alpha?green/alpha:0;
        target.data[address+2]=alpha?blue/alpha:0;
        target.data[address+3]=alpha;
      }
    }
    paint.putImageData(target,0,0);
    if(vertical){
      ctx.save();
      ctx.transform(0,1,1,0,x-pad,y-pad);
      ctx.drawImage(work,0,0);
      ctx.restore();
    }else ctx.drawImage(work,x-pad,y-pad);
  };
}

function measureVenues(sheet){return measure(sheet,[0,.319,.653,1]);}
function measure(sheet,splitFraction){
  const mask=document.createElement("canvas");
  mask.width=sheet.naturalWidth;mask.height=sheet.naturalHeight;
  const scan=mask.getContext("2d");
  scan.drawImage(sheet,0,0);
  const pixels=scan.getImageData(0,0,mask.width,mask.height).data;
  const cuts=(Array.isArray(splitFraction)?splitFraction:[0,splitFraction,1]).map(f=>Math.floor(mask.width*f));
  return cuts.slice(1).map((to,index)=>[cuts[index],to]).map(([from,to])=>{
    let left=to,top=mask.height,right=from,bottom=0;
    for(let y=0;y<mask.height;y++)for(let x=from;x<to;x++){
      if(pixels[(y*mask.width+x)*4+3]<24)continue;
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    }
    return [left,top,right-left+1,bottom-top+1];
  });
}


async function start() {
  const [[background, alpha, rest, , ...sprites], bouquetSheets, characterArt, map, original, loadedBirds] = await Promise.all([
    Promise.all(files.map(load)),
    Promise.all(bouquets.map(item => load(item.atlas))),
    Promise.all(characterSheets.map(load)),
    load(mapImage),
    load(centralImage),
    Promise.all(skuas.map(async bird => ({...bird, images:Object.fromEntries(await Promise.all(Object.entries(bird.frames).map(async ([id,src]) => [id,await load(src)])))})))
  ]);
  const waterfallPatches = LobbyWaterfalls.prepare(map,background);
  const waterfallToggle = document.querySelector('#waterfalls');
  let waterfallsEnabled = true;
  waterfallToggle.onclick = () => {
    waterfallsEnabled = !waterfallsEnabled;
    waterfallToggle.setAttribute('aria-pressed', String(waterfallsEnabled));
    waterfallToggle.textContent = waterfallsEnabled ? '瀑布動態：開' : '瀑布動態：關';
    render(elapsed,neutral);
  };
  waterfallToggle.disabled = false;
  const [previousArt, nextArt, angleArt, venueArt] = characterArt;
  const clips = [...measure(previousArt,.497), ...measure(nextArt,.486), measure(angleArt,1)[0], ...measureVenues(venueArt)];
  const balloons = sprites.slice(0, config.balloons.length);
  const note = sprites.at(-1);
  const flags = sprites.slice(balloons.length,-1).map((sprite,i) => makeWarp(sprite,config.flags[i]));
  const pulse = makePulse(note, config.note, pulseSettings);
  const width = 200 * original.width / original.height;
  const x = 735 - width * .511;
  const y = 708 - 200 * .986;
  const shadow = document.createElement("canvas");
  shadow.width = 3072;
  shadow.height = 2048;
  const backgroundShadow = shadow.getContext("2d");
  {
    const background = backgroundShadow;
    background.scale(2,2);
        background.translate(735, 702);
    background.scale(width * 0.92 / 2, 13);
    const shadow = background.createRadialGradient(0, 0, 0, 0, 0, 1);
    shadow.addColorStop(0, "rgba(42,22,8,.38)");
    shadow.addColorStop(0.6, "rgba(42,22,8,.209)");
    shadow.addColorStop(1, "rgba(42,22,8,0)");
    background.fillStyle = shadow;
    background.fillRect(-1, -1, 2, 2);

  }

    function paintScene(seconds){
    {
      ctx.clearRect(0,0,scene.width,scene.height);
      ctx.drawImage(background,0,0);
      if (waterfallsEnabled) LobbyWaterfalls.paint(ctx,waterfallPatches,seconds);
      balloons.forEach((sprite,i)=>{
        const {boundsXYWH:[x,y],anchorXY:[ax,ay],motionAmplitudeXYDegrees:[dx,dy,rotation],periodMs}=config.balloons[i];
        const cycle=(seconds*1000/periodMs)*2*Math.PI;
        const sway=Math.sin(cycle);
        ctx.save();
        ctx.translate(ax+dx*sway,ay+dy*Math.sin(cycle*2));
        ctx.rotate(rotation*Math.PI/180*sway);
        ctx.drawImage(sprite,x-ax,y-ay);
        ctx.restore();
      });
      flags.forEach(draw=>draw(seconds));
      const {boundsXYWH:[nx,ny],anchorXY:[ax,ay],periodSeconds,phaseRadians,
             amplitudePx,rotationDegrees,rotationPhaseOffsetRadians}=config.note;
      const phase=seconds*2*Math.PI/periodSeconds+phaseRadians;
      ctx.save();
      ctx.translate(ax,ay+12*Math.sin(seconds*2*Math.PI/3.6+phaseRadians));
      ctx.rotate(rotationDegrees*Math.PI/180*Math.sin(phase+rotationPhaseOffsetRadians));
      const [gain,period,delay]=pulseSettings.defaults;
      {
        const keys=pulseSettings.keyframes;
        const beat=envelope(seconds,period,0,keys)+envelope(seconds,period,delay,keys);
        const scale=1+pulseSettings.wholeShare*gain/100*beat;
        ctx.scale(scale,scale);
      }
      const sprite=pulse(seconds,gain,period,delay);
      ctx.drawImage(sprite,nx-ax,ny-ay);
      ctx.restore();
      ctx.globalCompositeOperation='destination-in';
      ctx.drawImage(alpha,0,0);
      ctx.globalCompositeOperation='source-over';
    }
  }

  function paintInteraction(scene) {
    const ctx = characterContext;
    const full = true, ratio = 1, left = 0, top = 0, layered = true;
    const view = {width:1536,height:1024};
      const [x,y,w,h]=scene.box;
  const anchorX=(scene.x-left)*ratio, anchorY=(scene.y-top)*ratio;
  if (scene.art!==undefined) {
    const pose=scene===scenes.road&&layered?4:scene.art; const [sx,sy,sw,sh]=clips[pose];
        // Source artwork measurement is hair-to-shoe on Little V, excluding both dogs.
    const boyHeight=[633,684,667,588,755,470,449,415][pose];
    const scale=scene.boyHeightOnMap*ratio/boyHeight; const size=scale*sh; const [boyFootX,boyFootY]=[[475,741],[1335,783],[428,755],[1350,744],[775,816],[365,562],[812,574],[1597,548]][pose];
    const width=size*sw/sh;
    const sheet=pose>=5?venueArt:pose===4?angleArt:pose<2?previousArt:nextArt;
    const artLeft=anchorX-(boyFootX-sx)*scale;
    const artTop=anchorY-(boyFootY-sy)*scale;
    if(full){
      hotspot.hidden=false;
      hotspot.style.left=((artLeft+width/2)/view.width*100)+"%";
      hotspot.style.top=((artTop+size/2)/view.height*100)+"%";
      hotspot.style.width=(width/view.width*100)+"%";
      hotspot.style.height=(size/view.height*100)+"%";
      selectedArt={sheet,sx,sy,sw,sh};
    }
    {
      // Feet and seated body contact points in the source art.
      const contacts=[
        [[215,758,114],[475,734,82],[698,703,94]],
        [[1055,759,103],[1335,772,112],[1575,754,85]],
        [[205,749,102],[428,745,105],[680,754,98]],
        [[1020,746,110],[1350,737,108],[1588,742,104]],
        [[415,930,185],[775,806,113],[1020,875,131]],
        [[289,661,126],[365,551,85],[551,422,100]],
        [[812,563,114],[1200,433,117],[1195,661,124]],
        [[1597,541,95],[1965,521,100],[1779,658,143]]
      ];
      for(const [px,py,spread] of contacts[pose]){
        const x=anchorX+(px-boyFootX)*scale;
        const y=anchorY+(py-boyFootY)*scale;
        const radius=spread*scale;
        ctx.save();ctx.translate(x,y);ctx.scale(1,.28);
        const shadow=ctx.createRadialGradient(0,0,0,0,0,radius);
        shadow.addColorStop(0,"rgba(66,43,28,.31)");
        shadow.addColorStop(.48,"rgba(66,43,28,.18)");
        shadow.addColorStop(1,"rgba(66,43,28,0)");
        ctx.fillStyle=shadow;ctx.fillRect(-radius,-radius,radius*2,radius*2);
        ctx.restore();
      }
      ctx.drawImage(sheet,sx,sy,sw,sh,artLeft,artTop,width,size);
      if(scene===scenes.road){
        // Restore the original foreground silhouettes where they cross the lower paws.
        const foreground=[
          [[593,790],[601,778],[613,767],[622,770],[630,764],[640,772],[644,781],[658,788],[669,797],[670,808],[659,814],[635,811],[621,808],[606,805],[595,803]],
          [[799,810],[805,802],[811,797],[819,796],[824,785],[832,783],[838,788],[845,788],[852,797],[852,815],[835,824],[810,825]]
        ];
        ctx.save();
        ctx.beginPath();
        for(const outline of foreground){
          outline.forEach(([x,y],index)=>{
            const px=(x-left)*ratio,py=(y-top)*ratio;
            if(index===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
          });
          ctx.closePath();
        }
        ctx.clip();
        ctx.drawImage(map,0,0);
        ctx.restore();
      }
    }
  }

  }

  let characterKey;
  function updateCharacter() {
    if (characterKey === characterMode) return;
    characterKey = characterMode;
    characterContext.setTransform(1,0,0,1,0,0);
    characterContext.clearRect(0,0,3072,2048);
    hotspot.hidden = true;
    if (characterMode === "none") return;
    if (characterMode === "central") {
      characterContext.drawImage(shadow,0,0);
      characterContext.setTransform(2,0,0,2,0,0);
      characterContext.drawImage(original,x,y,width,200);
    } else {
      characterContext.setTransform(2,0,0,2,0,0);
      paintInteraction(scenes[characterMode]);
    }
  }

  function drawBouquets(seconds) {
    for (const [index,item] of bouquets.entries()) {
      const [x,y,right,bottom] = item.cropXYXY;
      const w=right-x, h=bottom-y;
      const i=Math.floor((seconds+item.offset)*item.fps)%item.frames;
      ctx.drawImage(bouquetSheets[index], i%item.columns*w, Math.floor(i/item.columns)*h, w,h,x,y,w,h);
    }
  }

  function birdPositions(seconds) {
    return loadedBirds.flatMap(bird => {
      const age = seconds + bird.phase;
      if (age < 0) return [];
      const pass = Math.floor(age / bird.period);
      const phase = age % bird.period;
      const near = pass % 2 === 0;
      const route = near ? bird.near : bird.far;
      if (phase >= route.duration) return [];
      const progress = phase / route.duration;
      const total = bird.durations.reduce((sum,ms) => sum+ms,0);
      let time = (phase * 1000) % total;
      const index = bird.durations.findIndex(ms => {
        if (time < ms) return true;
        time -= ms;
        return false;
      });
      const approach = Math.sin(Math.PI * progress) ** 2;
      const span = near ? route.farWidth + (route.nearWidth - route.farWidth) * approach : route.width;
      const width = span * 1254 / bird.glideSpan;
      const margin = near ? 320 : 70;
      return [{bird, frame:bird.order[index], depth:near ? "near" : "far", width,
        x:-margin + progress*(1536+2*margin) + route.drift*approach,
        y:route.entryY + (route.exitY-route.entryY)*progress + route.arc*approach}];
    });
  }

  function render(seconds, neutral = false) {
    if (neutral) {
      ctx.clearRect(0,0,1536,1024);
      ctx.drawImage(map,0,0);
    } else {
      paintScene(seconds);
      drawBouquets(seconds);
    }
    updateCharacter();
    display.clearRect(0,0,view.width,view.height);
    display.drawImage(scene,0,0,view.width,view.height);
    flyover.clearRect(0,0,1536,1024);
    if (!neutral) {
      for (const {bird,frame,x,y,width,depth} of birdPositions(seconds)) {
        const ratio = width / 1254;
        const layer = depth === "near" ? flyover : display;
        const scale = depth === "near" ? 1 : 2;
        layer.drawImage(bird.images[frame], (x-bird.anchor[0]*ratio)*scale, (y-bird.anchor[1]*ratio)*scale, width*scale, width*scale);
      }
    }
  }

  function tick(now) {
    if (last !== null) {
      const delta = Math.min((now-last)/1000,.25);
      elapsed += delta;
      advanceVisitClock(delta);
    }
    last = now;
    render(elapsed);
    animation = requestAnimationFrame(tick);
  }
  function setRunning(value) {
    cancelAnimationFrame(animation);
    running = value;
    last = null;
    toggle.textContent = running ? "暫停" : "播放";
    if (running) animation = requestAnimationFrame(tick);
  }

  toggle.onclick = () => setRunning(!running);
  reset.onclick = () => {
    setRunning(false);
    elapsed = 0;
    visitTime = visitStart = 0;
    visitLength = 5;
    visitGap = 1.2;
    currentVisit = "star";
    remaining = Object.keys(scenes).filter(id => id !== currentVisit);
    showVisit(currentVisit);
    render(elapsed,true);
  };
  let neutral = !running;
  reset.addEventListener("click", () => { neutral = true; });
  toggle.addEventListener("click", () => { if (running) neutral = false; });
  motion.addEventListener("change", event => {
    if (event.matches) reset.click();
  });
  document.addEventListener("visibilitychange", () => {last = null;});
  hotspot.onclick = () => {
    const {sheet,sx,sy,sw,sh} = selectedArt;
    const detail = document.querySelector("#art-detail");
    detail.width = sw;
    detail.height = sh;
    detail.getContext("2d").drawImage(sheet,sx,sy,sw,sh,0,0,sw,sh);
    document.querySelector("#art-dialog-title").textContent = scenes[characterMode].name;
    dialog.showModal();
  };
  dialog.onclick = event => { if (event.target === dialog) dialog.close(); };
  let visitTime = 0;
  let visitStart = 0;
  let visitLength = 5;
  let visitGap = 1.2;
  let currentVisit = "star";
  let remaining = Object.keys(scenes).filter(id => id !== currentVisit);

  function advanceVisitClock(delta) {
    if (dialog.open) return;
    visitTime += delta;
    if (visitTime >= visitStart + visitLength + visitGap) {
      visitStart += visitLength + visitGap;
      if (!remaining.length) remaining = Object.keys(scenes).filter(id => id !== currentVisit);
      const index = Math.floor(Math.random() * remaining.length);
      [currentVisit] = remaining.splice(index,1);
      visitLength = 4.5 + Math.random()*2;
      visitGap = .8 + Math.random()*1.5;
    }
    const age = visitTime - visitStart;
    const opacity = motion.matches ? Number(age < visitLength)
      : Math.max(0, Math.min(1, visitStart === 0 ? 1 : (age+.05)/.4, (visitLength-age)/.65));
    showVisit(opacity > 0 ? currentVisit : "none",opacity);
  }

  function showVisit(id,opacity = 1) {
    characterMode = id;
    characterLayer.style.opacity = opacity;
    hotspot.style.opacity = opacity;
    hotspot.disabled = opacity < .3;
    const name = scenes[id]?.name.split(" · ")[0] || "";
    if (visitName.textContent !== name) visitName.textContent = name;
  }

  window.inspectLobby = {
    render(seconds, mode, original = false) {
      setRunning(false);
      characterMode = mode;
      elapsed = seconds;
      neutral = original;
      showVisit(mode);
      render(seconds,original);
    },
    stepVisit(delta) { advanceVisitClock(delta); render(elapsed,neutral); return {mode:characterMode, opacity:Number(characterLayer.style.opacity)}; },
    environment: scene, characters: characterLayer, sourceMap: map, revision3Rest: rest,
    waterfallPatches,
    birdsAt(seconds) { return birdPositions(seconds).map(({bird,frame,x,y,width,depth}) => ({variant:bird.variant,frame,x,y,width,depth})); },
    counts: [balloons.length, flags.length, 2, bouquets.length]
  };
  showVisit(characterMode);
  render(elapsed,neutral);
  setRunning(running);
  for (const control of [toggle,reset]) control.disabled = false;
  status.textContent = "";
  document.body.dataset.ready = "true";
}
start().catch(error => {
  status.textContent = "預覽素材載入失敗。請確認已完整解壓工程包。";
  console.error(error);
});



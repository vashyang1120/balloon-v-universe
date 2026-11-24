(() => {
  "use strict";
  const BOX = [630, 80, 112, 80];
  const CORNERS = [[686,99],[719,95],[727,143],[689,141]];
  const PERIOD = 7, TURN = 1.02, START = 1.1, STRIPS = 22;
  const stage = document.querySelector("#scene");
  const patch = document.querySelector("#page-turn");
  const background = stage.getContext("2d");
  const display = patch.getContext("2d");
  const overlay = document.createElement("canvas");
  overlay.width=BOX[2]*4;
  overlay.height=BOX[3]*4;
  const paper=overlay.getContext("2d");
  let ctx=display;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const params = new URLSearchParams(location.search);
  const detail = params.get("view") === "detail";
  const view = detail ? [606,65,162,112] : [0,0,1536,1024];
  const density = detail ? 4 : 2;
  stage.width = view[2]*density;
  stage.height = view[3]*density;
  patch.width=BOX[2]*4;
  patch.height=BOX[3]*4;
  const percent=(n,total)=>100*n/total+"%";
  Object.assign(patch.style,{
    left:percent(BOX[0]-view[0],view[2]),top:percent(BOX[1]-view[1],view[3]),
    width:percent(BOX[2],view[2]),height:percent(BOX[3],view[3])
  });
  document.body.classList.toggle("detail", detail);
  const mix = (a,b,t) => a+(b-a)*t;
  const smooth = t => { t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); };
  const between = (t,a,b) => smooth((t-a)/(b-a));
  const line = (a,b,t) => a.map((x,i)=>mix(x,b[i],t));
  const source = (u,v) => line(line(CORNERS[0],CORNERS[1],u),line(CORNERS[3],CORNERS[2],u),v);
  const fetchImage = path => new Promise((resolve,reject) => {
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error(path));
    image.src=path;
  });
  function polygon(points) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for(const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
  }
  function triangle(image, from, to, brightness) {
    const [[x,y],[x1,y1],[x2,y2]]=from;
    const [[X,Y],[X1,Y1],[X2,Y2]]=to;
    const det=(x1-x)*(y2-y)-(x2-x)*(y1-y);
    const a=((X1-X)*(y2-y)-(X2-X)*(y1-y))/det;
    const c=((X2-X)*(x1-x)-(X1-X)*(x2-x))/det;
    const b=((Y1-Y)*(y2-y)-(Y2-Y)*(y1-y))/det;
    const d=((Y2-Y)*(x1-x)-(Y1-Y)*(x2-x))/det;
    if(Math.abs(a*d-b*c)<.001) return;
    const center=to.reduce((sum,p)=>[sum[0]+p[0]/3,sum[1]+p[1]/3],[0,0]);
    const clip=to.map(p=>{
      const direction=p.map((x,i)=>x-center[i]);
      const length=Math.hypot(...direction)||1;
      return p.map((x,i)=>x+direction[i]*.62/length);
    });
    ctx.save();
    polygon(clip);
    ctx.clip();
    ctx.transform(a,b,c,d,X-a*x-c*y,Y-b*x-d*y);
    ctx.filter="brightness("+brightness+")";
    ctx.drawImage(image,BOX[0],BOX[1],BOX[2],BOX[3]);
    ctx.restore();
  }
  function geometry(u,v,t) {
    const [x,y]=source(u,v);
    const [hingeX,hingeY]=source(0,v);
    const turn=between(t,.07,.88);
    const curl=Math.sin(Math.PI*t);
    const length=x-hingeX;
    let horizontal=0, depth=0;
    const samples=12;
    for(let i=0;i<samples;i++){
      const along=u*(i+.5)/samples;
      const angle=Math.PI*turn + curl*(along-.26)*1.05 + (.5-v)*.32*curl;
      horizontal+=Math.cos(angle)*length/samples;
      depth+=Math.sin(angle)*length/samples;
    }
    const perspective=1+Math.max(0,depth)*.002;
    return {
      point:[hingeX+horizontal*perspective,
        hingeY+(y-hingeY)*perspective-depth*.29+u*turn*mix(5,1,v)],
      depth
    };
  }
  function leaf(front, back, t, opacity) {
    const strips=[];
    const top=[], bottom=[];
    for(let i=0;i<=STRIPS;i++){
      top.push(geometry(i/STRIPS,0,t));
      bottom.push(geometry(i/STRIPS,1,t));
    }
    for(let i=0;i<STRIPS;i++){
      const u=i/STRIPS, next=(i+1)/STRIPS;
      const corners=[top[i],top[i+1],bottom[i+1],bottom[i]];
      const to=corners.map(p=>p.point);
      const from=[source(u,0),source(next,0),source(next,1),source(u,1)];
      const forward=(to[1][0]+to[2][0])>(to[0][0]+to[3][0]);
      const normal=Math.min(1,Math.abs(to[1][0]-to[0][0])*STRIPS/30);
      strips.push({to,from,forward,shade:.88+.12*normal,depth:corners.reduce((a,p)=>a+p.depth,0)});
    }
    const outline=[...top.map(p=>p.point),...bottom.slice().reverse().map(p=>p.point)];
    ctx.save();
    ctx.globalAlpha=opacity;
    polygon(outline);
    ctx.fillStyle="#ead1ac";
    ctx.fill();
    ctx.clip();
    for(const {to,from,forward,shade} of strips.sort((a,b)=>a.depth-b.depth)){
      const texture=forward?front:back;
      for(const indices of [[0,1,2],[0,2,3]]) {
        triangle(texture,indices.map(i=>from[i]),indices.map(i=>to[i]),shade);
      }
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha=opacity*.72;
    ctx.lineWidth=.7;
    ctx.strokeStyle="#bb9366";
    ctx.beginPath();
    ctx.moveTo(...top.at(-1).point);
    ctx.lineTo(...bottom.at(-1).point);
    for(const point of bottom.slice(0,-1).reverse()) ctx.lineTo(...point.point);
    ctx.stroke();
    ctx.restore();
  }
  const originalPath=fetchImage("assets/lobby.png").catch(()=>fetchImage("../../assets/universe_map_bg.png"));
  Promise.all([originalPath,...["assets/original-book.png","assets/right-under.png","assets/page-back.png"].map(fetchImage)])
    .then(([map, front, under, back])=>{
      background.setTransform(density,0,0,density,-view[0]*density,-view[1]*density);
      background.drawImage(map,view[0],view[1],view[2],view[3],...view);
      function render(seconds) {
        ctx.setTransform(4,0,0,4,-BOX[0]*4,-BOX[1]*4);
        ctx.clearRect(...BOX);
        const t=((seconds%PERIOD+PERIOD)%PERIOD-START)/TURN;
        if(t<=0 || t>=1) return;
        const lift=between(t,0,.14);
        const settle=1-between(t,.84,1);
        ctx.save();
        ctx.globalAlpha=lift*settle;
        ctx.drawImage(under,...BOX);
        // Keep the contact shadow inside the exposed right sheet.
        polygon(CORNERS);
        ctx.clip();
        const shadow=ctx.createLinearGradient(686,120,713,120);
        const strength=.20*Math.sin(Math.PI*t);
        shadow.addColorStop(0,"rgba(91,53,29,"+strength+")");
        shadow.addColorStop(1,"rgba(91,53,29,0)");
        ctx.fillStyle=shadow;
        ctx.fillRect(...BOX);
        ctx.restore();
        paper.setTransform(4,0,0,4,-BOX[0]*4,-BOX[1]*4);
        paper.clearRect(...BOX);
        ctx=paper;
        leaf(front,back,t,1);
        ctx=display;
        ctx.save();
        ctx.globalAlpha=lift*settle;
        ctx.drawImage(overlay,...BOX);
        ctx.restore();
      }
      window.renderBookSample=render;
      function animate(now){
        const seconds=reduce.matches?0:(now-origin)/1000;
        const position=seconds%PERIOD;
        const active=position>START && position<START+TURN;
        if(active||wasActive) render(seconds);
        wasActive=active;
        requestAnimationFrame(animate);
      }
      function play(){
        origin=performance.now();
        if(!playing){playing=true;requestAnimationFrame(animate);}
      }
      let origin=performance.now(), playing=false, wasActive=false;
      render(0);
      if(!params.has("frame")) play();
      document.querySelector("button").addEventListener("click",play);
    }).catch(error=>{
      document.querySelector("output").textContent="素材載入失敗 ("+error.message+")";
    });
})();





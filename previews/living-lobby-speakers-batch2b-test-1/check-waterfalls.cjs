const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const preview = pathToFileURL(path.resolve(process.argv[2] || 'index.html')).href;

async function inspect(page, sampleSource) {
  return page.evaluate(sampleSource => {
    const lobby = window.inspectLobby;
    document.querySelector('#speakers').click();
    const button = document.querySelector('#waterfalls');
    const {environment, waterfallPatches} = lobby;
    const ctx = environment.getContext('2d');
    const w = environment.width, h = environment.height;
    const grab = () => ctx.getImageData(0,0,w,h).data;
    const test2 = sampleSource ? new Function(sampleSource + '\nreturn LobbyWaterfall;')().create(lobby.sourceMap) : null;
    const matchingMain = LobbyWaterfall.create(lobby.sourceMap);
    const owner = new Uint8Array(w*h);
    for (const [i,{region,mask}] of waterfallPatches.entries()) {
      for (let p=0; p<mask.length; p++) {
        if (!mask[p]) continue;
        const at = (region.y + Math.floor(p/region.width))*w + region.x + p%region.width;
        if (owner[at]) throw new Error('Waterfall masks overlap');
        owner[at] = i+1;
      }
    }
    function difference(a,b) {
      const byPatch = new Array(waterfallPatches.length).fill(0);
      let outside = 0, alpha = 0;
      for (let i=0; i<a.length;i+=4) {
        alpha += Number(a[i+3] !== b[i+3]);
        if (a[i]===b[i]&&a[i+1]===b[i+1]&&a[i+2]===b[i+2]&&a[i+3]===b[i+3]) continue;
        const patch = owner[i/4];
        if (patch) byPatch[patch-1]++;
        else outside++;
      }
      return {byPatch,outside,alpha};
    }
    const frames = [];
    const start = performance.now();
    // Warm Chromium's readback path before measuring the first frame.
    lobby.render(0,'none');
    for (let i=0;i<4;i++) grab();
    let test2Mismatches = 0;
    for (const seconds of [0, .53, 1.47, 2.6, 3.55, 4.8]) {
      lobby.render(seconds,'none');
      const on = grab();
      button.click();
      const off = grab();
      button.click();
      frames.push({seconds, ...difference(on,off)});
      if (test2) {
        const original = test2.render(seconds).data;
        const current = matchingMain.render(seconds).data;
        test2Mismatches += original.reduce((sum,value,index) => sum + Number(value !== current[index]),0);
      }
    }
    const times = [];
    for (let i=0;i<60;i++) {
      const t=performance.now();
      lobby.render(i/60,'none');
      times.push(performance.now()-t);
    }
    times.sort((a,b)=>a-b);
    const patches = waterfallPatches.map(({id,mask,render},i) => {
      const initial = render(0).data.slice();
      const end = render(LobbyWaterfall.loopSeconds).data;
      const loopMismatch = initial.reduce((sum,value,index)=>sum+Number(value!==end[index]),0);
      const changed = frames.map(f=>f.byPatch[i]);
      return {id, maskPixels:mask.reduce((a,b)=>a+b,0), minChanged:Math.min(...changed), maxChanged:Math.max(...changed), loopMismatch};
    });
    lobby.render(2,'star');
    return {
      mapDisplayPx:document.querySelector('#map').getBoundingClientRect().width,
      viewport:innerWidth, documentWidth:document.documentElement.scrollWidth,
      frames, patches, originalSampleChannelMismatches:test2 ? test2Mismatches : null,
      renderMs:{median:times[30],p95:times[56]}, inspectionMs:performance.now()-start
    };
  }, sampleSource);
}

async function record(page, filename) {
  const chunks = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width=1440; canvas.height=960;
    const ctx=canvas.getContext('2d');
    const map=document.querySelector('#map');
    const actors=document.querySelector('#character-layer');
    const birds=document.querySelector('#flyover');
    const stream=canvas.captureStream(30);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:7200000});
    const parts=[];
    recorder.ondataavailable=e=>parts.push(e.data);
    const stopped=new Promise(resolve=>recorder.onstop=resolve);
    function paint() {
      ctx.fillStyle='#e1ecf2';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(map,0,0,canvas.width,canvas.height);
      ctx.globalAlpha=Number(actors.style.opacity || 1);
      ctx.drawImage(actors,0,0,canvas.width,canvas.height);
      ctx.globalAlpha=1;
      ctx.drawImage(birds,0,0,canvas.width,canvas.height);
    }
    paint();
    recorder.start();
    await new Promise(resolve=>{
      const start=performance.now();
      function frame(now) {
        paint();
        if(now-start<12000) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    recorder.stop();
    await stopped;
    for(const track of stream.getTracks()) track.stop();
    const blob=new Blob(parts,{type:'video/webm'});
    return new Promise(resolve=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  });
  fs.writeFileSync(filename,Buffer.from(chunks,'base64'));
}

async function main() {
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const sampleSource = process.argv[3] ? fs.readFileSync(process.argv[3],'utf8') : null;
    const profiles = [];
    for (const mobile of [false,true]) {
      const page = await browser.newPage(mobile ? devices['Pixel 7'] : {viewport:{width:1440,height:1050}});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(preview);
      await page.locator('body[data-ready=true]').waitFor({state:'attached'});
      const result=await inspect(page,sampleSource);
      if(process.env.WATER_DEBUG) console.error(JSON.stringify(result));
      assert.equal(result.documentWidth,result.viewport);
      assert.equal(result.patches.length,10);
      assert(result.patches.every(p=>p.minChanged>0&&p.loopMismatch===0));
      assert(result.frames.every(f=>f.outside===0&&f.alpha===0));
      if(sampleSource) assert.equal(result.originalSampleChannelMismatches,0);
      assert(result.renderMs.p95 < 16.7);
      await page.locator('#waterfalls').click();
      assert.equal(await page.locator('#waterfalls').getAttribute('aria-pressed'),'false');
      await page.locator('#waterfalls').click();
      assert.equal(await page.locator('#waterfalls').getAttribute('aria-pressed'),'true');
      await page.locator('#art-hotspot').click();
      assert(await page.locator('#art-dialog').isVisible());
      await page.keyboard.press('Escape');
      assert(!(await page.locator('#art-dialog').isVisible()));
      assert.deepEqual(errors,[]);
      profiles.push({profile:mobile?'Pixel 7 emulation':'Desktop Chrome',...result});
      await page.close();
    }
    console.log(JSON.stringify({chrome:browser.version(),profiles},null,2));
    if(process.argv[4]) {
      const page=await browser.newPage({viewport:{width:1440,height:1010}});
      await page.goto(preview);
      await page.locator('body[data-ready=true]').waitFor({state:'attached'});
      await record(page,process.argv[4]);
    }
  } finally {
    await browser.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

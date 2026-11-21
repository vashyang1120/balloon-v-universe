const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function check(browser, file, mobile) {
  const page = await browser.newPage(mobile ? devices['Pixel 7'] : {viewport:{width:1440,height:1050}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(pathToFileURL(file).href);
  await page.locator('body[data-ready=true]').waitFor({state:'attached'});
  const initial = await page.evaluate(() => {
    const scope = LobbyWaterfall.region;
    const {width, height} = scope;
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(mapImage, 0, 0);
    const original = ctx.getImageData(0, 0, 1536, 1024).data;
    const crop = ctx.getImageData(scope.x, scope.y, width, height).data;
    const actualStatic = still.getImageData(0, 0, width, height).data;

    function difference(a, b, predicate = () => true) {
      let pixels = 0, maximum = 0, energy = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (!predicate(i / 4)) continue;
        const delta = Math.max(...[0,1,2,3].map(c => Math.abs(a[i+c] - b[i+c])));
        pixels += Number(delta > 0);
        maximum = Math.max(maximum, delta);
        energy += delta;
      }
      return {pixels, maximum, energy};
    }

    const effect = LobbyWaterfall.create(mapImage);
    function frame(t) {
      return effect.render(t).data.slice();
    }
    const period = LobbyWaterfall.loopSeconds;
    const first = frame(0);
    const laps = Array.from({length:3}, (_, i) => difference(first, frame(period * (i + 1))).pixels);
    const frameDiff = difference(crop, frame(1.17));
    let outsideMaskChanges = 0;
    let alphaChanges = 0;
    let maxAdjustment = 0;
    const timings = [];
    for (let i = 0; i < 288; i++) {
      const start = performance.now();
      const result = effect.render(i / 60);
      motion.putImageData(result, 0, 0);
      timings.push(performance.now() - start);
      if (i % 6 !== 0) continue;
      const data = result.data;
      for (let j = 0; j < effect.mask.length; j++) {
        const p = j * 4;
        const amount = Math.max(Math.abs(crop[p]-data[p]), Math.abs(crop[p+1]-data[p+1]), Math.abs(crop[p+2]-data[p+2]));
        outsideMaskChanges += Number(!effect.mask[j] && amount > 0);
        alphaChanges += Number(crop[p+3] !== data[p+3]);
        maxAdjustment = Math.max(maxAdjustment, amount);
      }
    }
    timings.sort((a,b) => a - b);
    const transitions = [
      difference(frame(period - 1/60), first),
      difference(first, frame(1/60)),
      difference(frame(period - 2/60), frame(period - 1/60))
    ];
    ctx.putImageData(effect.render(1.17),scope.x,scope.y);
    const outside = pixel => {
      const x = pixel % 1536 - scope.x;
      const y = Math.floor(pixel/1536) - scope.y;
      return x < 0 || x >= width || y < 0 || y >= height || !effect.mask[y * width + x];
    };
    return {
      viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      staticComparison: difference(crop,actualStatic), cropMatchesOriginal: difference(crop,actualStatic).pixels === 0, laps, frameDiff, transitions,
      maxAdjustment, outsideMaskChanges, alphaChanges,
      fullOutsideMaskChanges:difference(original,ctx.getImageData(0,0,1536,1024).data,outside).pixels,
      activeMaskPixels: effect.mask.reduce((a,b)=>a+b,0),
      timingMs: {median:timings[144],p95:timings[273]}
    };
  });
  if (process.env.DEBUG_WATER) console.error(initial);
  assert.equal(initial.viewport,initial.documentWidth);
  assert(initial.cropMatchesOriginal);
  assert.deepEqual(initial.laps,[0,0,0]);
  assert(initial.frameDiff.pixels > 1500);
  assert(initial.transitions[0].energy < Math.max(initial.transitions[1].energy,initial.transitions[2].energy) * 1.3);
  assert.equal(initial.outsideMaskChanges,0);
  assert.equal(initial.alphaChanges,0);
  assert.equal(initial.fullOutsideMaskChanges,0);
  assert(initial.timingMs.p95 < 16.7);
  await page.locator('#play').click();
  const paused = await page.locator('#motion').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(180);
  assert.equal(await page.locator('#motion').evaluate(canvas => canvas.toDataURL()), paused);
  await page.locator('#play').click();
  await page.waitForTimeout(180);
  assert.notEqual(await page.locator('#motion').evaluate(canvas => canvas.toDataURL()), paused);
  await page.locator('#map').click();
  assert(await page.locator('#overview').isVisible());
  await page.locator('#original').click();
  const correctFull = await page.evaluate(() => {
    const expected = document.createElement('canvas');
    expected.width = 1536;
    expected.height = 1024;
    expected.getContext('2d',{willReadFrequently:true}).drawImage(mapImage,0,0);
    return expected.toDataURL() === full.canvas.toDataURL();
  });
  assert(correctFull);
  await page.locator('#original').click();
  await page.locator('#local').click();
  assert(await page.locator('#closeups').isVisible());
  assert.deepEqual(errors,[]);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload();
  await page.locator('body[data-ready=true]').waitFor({state:'attached'});
  assert.equal(await page.locator('#play').textContent(),'播放');
  await page.close();
  return {profile:mobile ? 'Pixel 7 emulation' : 'Desktop Chrome', ...initial, controls:true, reducedMotion:true, noErrors:true};
}

async function exportVideo(browser, file, output) {
  const page = await browser.newPage({viewport:{width:1100,height:700},reducedMotion:'reduce'});
  await page.goto(pathToFileURL(file).href);
  await page.locator('body[data-ready=true]').waitFor({state:'attached'});
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1048;
    canvas.height = 534;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4800000});
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    const effect = LobbyWaterfall.create(mapImage);
    const {width,height} = LobbyWaterfall.region;
    const sample = document.createElement('canvas');
    sample.width = width;
    sample.height = height;
    const sampleCtx = sample.getContext('2d', {willReadFrequently:true});
    function paint(t) {
      ctx.fillStyle = '#241b38';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#fff8ef';
      ctx.font = '600 21px system-ui, "Microsoft JhengHei", sans-serif';
      ctx.fillText('原始靜態',14,37);
      ctx.fillText('動態樣本',532,37);
      ctx.drawImage(still.canvas,14,56,width*2,height*2);
      sampleCtx.putImageData(effect.render(t),0,0);
      ctx.drawImage(sample,532,56,width*2,height*2);
      ctx.font = '14px system-ui, "Microsoft JhengHei", sans-serif';
      ctx.fillText('Living Lobby Art v1.0 · Batch 2-A Test 1',14,524);
    }
    paint(0);
    recorder.start();
    await new Promise(resolve => {
      let start;
      function frame(now) {
        start ??= now;
        const seconds = (now-start)/1000;
        paint(seconds);
        if (seconds < 9.6) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    recorder.stop();
    await done;
    for (const track of stream.getTracks()) track.stop();
    const blob = new Blob(chunks,{type:'video/webm'});
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    });
  });
  fs.writeFileSync(output,Buffer.from(bytes,'base64'));
  await page.close();
}

async function main() {
  const file = path.resolve(process.argv[2] || 'open-in-chrome.html');
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const profiles = [];
    for (const mobile of [false,true]) profiles.push(await check(browser,file,mobile));
    console.log(JSON.stringify({chrome:browser.version(), profiles},null,2));
    if (process.argv[3]) await exportVideo(browser,file,process.argv[3]);
  } finally {
    await browser.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});

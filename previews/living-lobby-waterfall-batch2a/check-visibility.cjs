const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage({reducedMotion:'reduce'});
    await page.goto(pathToFileURL(resolve(process.argv[2] || 'open-in-chrome.html')).href);
    await page.locator('body[data-ready=true]').waitFor({state:'attached'});
    const test1Source = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : null;
    const result = await page.evaluate(source => {
      const sample = LobbyWaterfall.create(mapImage);
      const previous = source ? new Function(source + '\nreturn LobbyWaterfall;')().create(mapImage) : null;
      const {x,y,width,height} = LobbyWaterfall.region;
      const patches = [392,1388].map(mapWidth => {
        const scale = mapWidth / 1536;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        return {mapWidth,canvas,ctx,scale,sums:[0,0],pixels:0,last:[null,null]};
      });
      const native = document.createElement('canvas');
      native.width = width;
      native.height = height;
      const nativeCtx = native.getContext('2d', {willReadFrequently:true});
      let foamChanges = 0;
      let test1Mismatches = 0;

      for (let i = 0; i < 48; i++) {
        const seconds = i / 10;
        const earlier = sample.render(seconds,false).data.slice();
        const later = sample.render(seconds,true).data.slice();
        if (previous) {
          const expected = previous.render(seconds).data;
          test1Mismatches += earlier.reduce((sum,value,index) => sum + Number(value !== expected[index]), 0);
        }
        for (let p = (710-y)*width*4; p < earlier.length; p++) {
          foamChanges += Number(earlier[p] !== later[p]);
        }
        for (const [revision, data] of [earlier,later].entries()) {
          nativeCtx.putImageData(new ImageData(data,width,height),0,0);
          for (const p of patches) {
            p.ctx.clearRect(0,0,p.canvas.width,p.canvas.height);
            p.ctx.drawImage(native,0,0,p.canvas.width,p.canvas.height);
            const rendered = p.ctx.getImageData(0,0,p.canvas.width,p.canvas.height).data;
            const last = p.last[revision];
            if (last) {
              for (let row = Math.ceil((643-y)*p.scale); row < Math.floor((704-y)*p.scale); row++) {
                for (let col = Math.ceil((168-x)*p.scale); col < Math.floor((253-x)*p.scale); col++) {
                  const index = (row * p.canvas.width + col) * 4 + 1;
                  p.sums[revision] += (rendered[index] - last[index]) ** 2;
                  if (revision === 0) p.pixels++;
                }
              }
            }
            p.last[revision] = rendered;
          }
        }
      }
      return {foamChanges,test1Mismatches:previous ? test1Mismatches : null, sizes:patches.map(p=>({
        mapWidth:p.mapWidth,
        waterfallPatchWidth:p.canvas.width,
        test1Rms:Math.sqrt(p.sums[0]/p.pixels),
        test2Rms:Math.sqrt(p.sums[1]/p.pixels),
        ratio:Math.sqrt(p.sums[1]/p.sums[0])
      }))};
    }, test1Source);
    assert.equal(result.foamChanges,0);
    if (test1Source) assert.equal(result.test1Mismatches,0);
    console.log(JSON.stringify(result,null,2));
    assert(result.sizes.every(p => p.ratio > 1.25));
  } finally {
    await browser.close();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});

// Run from repo root: NODE_PATH=<runtime node_modules> node <this file>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 try {
  for(const scenario of ['normal','delayed','retry']) {
   const page = await browser.newPage({viewport:{width:390,height:844}});
   let requests = 0, release;
   const delayed = new Promise(r=>release=r);
   await page.route('**/*', async route=>{
    const url = route.request().url();
    if(!url.startsWith('http://localhost:8765/')) return route.abort();
    if(url.includes('/assets/balloon_base.png')) {
     requests++;
     if(scenario==='retry' && requests===1) return route.abort();
     if(scenario==='delayed') await delayed;
    }
    return route.continue();
   });
   await page.goto('http://localhost:8765/universe/tetris-ui-test/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.BVUiBrand);
   if(scenario!=='normal') {
    if(scenario==='retry') await page.getByRole('button',{name:'重新載入氣球方塊'}).waitFor();
    assert.equal(await page.evaluate(()=>{window.startGame('normal');return running;}),false);
    assert.equal(await page.evaluate(()=>{const c=getTinted('#ff0000');return c.getContext('2d').getImageData(32,32,1,1).data[3];}),0);
    if(scenario==='retry') await page.getByRole('button',{name:'重新載入氣球方塊'}).click();
    else release();
    await page.waitForFunction(()=>running===true);
   }
   await page.waitForFunction(()=>balloonImg.src.includes('/tetris-ui-test/assets/balloon_base.png') && balloonImg.complete && balloonImg.naturalWidth>0);
   const result=await page.evaluate(()=>{
    const c=getTinted('#ff0000'),ctx=c.getContext('2d');
    return {center:ctx.getImageData(32,32,1,1).data[3],corner:ctx.getImageData(0,0,1,1).data[3],sandbox:UniverseTetris.session.mode};
   });
   assert.ok(result.center>0); assert.equal(result.corner,0); assert.equal(result.sandbox,'sandbox');
   console.log(scenario+' PASS'); await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

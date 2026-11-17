/* Isolated UI integration fixture. Run with Playwright + Chromium available.
   node universe/tetris-ui-test/tests/browser/tutorial-e2e.cjs */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.clock.install();
  await page.route('https://tutorial.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><button id="btn-how">操作說明</button><button id="btn-start">開始遊戲</button>'}));
  await page.goto('https://tutorial.test/');
  await page.addStyleTag({content:fs.readFileSync(path.join(ROOT,'tutorial.css'),'utf8')});
  await page.evaluate(()=>{window.running=false;window.realScore=99;window.starts=0;window.realKeys=0;window.IMG={balloon:"local.png"};window.balloonImg={complete:true,naturalWidth:64,src:"local.png"};window.getTinted=()=>document.createElement('canvas');document.getElementById('btn-start').onclick=()=>starts++;document.addEventListener('keydown',()=>realKeys++);});
  await page.addScriptTag({path:path.join(ROOT,'tutorial-engine.js')});await page.addScriptTag({path:path.join(ROOT,'tutorial.js')});
  const dialog=page.locator('#bv-tutorial');await dialog.waitFor();
  const bounds=await dialog.boundingBox();assert.ok(Math.abs(bounds.x-(390-bounds.width)/2)<2);
  await page.getByRole('button',{name:'開始練習',exact:true}).click();await page.clock.runFor(3600);
  assert.equal(await page.getByRole('button',{name:'下一步',exact:true}).isEnabled(),false);
  for(const key of ['ArrowLeft','ArrowRight','ArrowRight','ArrowRight'])await page.keyboard.press(key);
  await page.getByRole('button',{name:'下一步',exact:true}).click();await page.keyboard.press('ArrowUp');
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  for(let i=0;i<3;i++)await page.locator('[data-action="down"]').click();
  await page.getByRole('button',{name:'下一步',exact:true}).click();await page.locator('[data-action="drop"]').click();
  await page.getByRole('button',{name:'完成練習',exact:true}).click();await page.getByRole('button',{name:'開始挑戰',exact:true}).click();
  assert.equal(await page.evaluate(()=>starts),1);assert.equal(await page.evaluate(()=>realScore),99);assert.equal(await page.evaluate(()=>realKeys),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('bv.tetris.tutorial.v1.seen')),'1');
  await page.locator('#btn-how').click();await page.keyboard.press('Escape');assert.equal(await dialog.evaluate(d=>d.open),false);
  await page.locator('#btn-how').click();await page.getByRole('button',{name:'我會玩了，回首頁'}).click();assert.equal(await dialog.evaluate(d=>d.open),false);
  console.log('PASS: first prompt, centering, action gates, keyboard/touch buttons, complete/start once, isolation, seen, replay, skip/Escape');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

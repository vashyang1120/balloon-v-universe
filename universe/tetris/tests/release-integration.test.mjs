import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inlineScripts} from '../../shared/tools/js-functions.mjs';
const DIR=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),UI=path.resolve(DIR,'../tetris-ui-test');
const read=(p)=>fs.readFileSync(p,'utf8'),html=read(path.join(DIR,'index.html'));
const mem=()=>{const m=new Map();return{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('live lobby retains its existing entry and loads release UI without the sandbox guard',()=>{
 assert.match(read(path.resolve(DIR,'../../zones.js')),/tetris: "universe\/tetris\/"/);
 assert.doesNotMatch(html,/sandbox-guard|UI測試員|tetris-ui-test\//);
 const src=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(src.slice(-8),['ui-test.js','desktop-ui.js','ui-brand.js','balloon-assets.js','creation-story.js','guided-practice.js','tutorial.js','menu-audio.js'].map(x=>x+'?v=0.3.4'));
 for(const x of src)assert.ok(fs.existsSync(path.resolve(DIR,x.split('?')[0])),x);
 assert.equal(inlineScripts(html),inlineScripts(read(path.join(UI,'index.html'))));
 assert.match(read(path.join(DIR,'ui-brand.js')),/var UI_LABEL = "UI v0.3.4"/);
});
test('approved tutorial, story, audio, desktop/mobile CSS and assets are promoted byte-for-byte',()=>{
 for(const f of ['tutorial.js','guided-practice.js','creation-story.js','balloon-assets.js','menu-audio.js','desktop-ui.js','ui-test.css','ui-brand.css','desktop-ui.css','tutorial.css','creation-story.css'])assert.deepEqual(fs.readFileSync(path.join(DIR,f)),fs.readFileSync(path.join(UI,f)),f);
 function walk(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(p,d.name)):[path.join(p,d.name)]);}
 for(const f of walk(path.join(DIR,'assets'))){const rel=path.relative(DIR,f);assert.deepEqual(fs.readFileSync(f),fs.readFileSync(path.join(UI,rel)),rel);}
});
test('release is reproducible; rebuilding sandbox neither doubles UI nor copies live identity settings',()=>{
 assert.match(execFileSync('python3',['-I',path.join(DIR,'tools/build_release.py'),'--check'],{encoding:'utf8'}),/reproducible OK/);
 assert.match(execFileSync('python3',['-I',path.join(UI,'tools/build_ui_test.py'),'--check'],{encoding:'utf8'}),/可重現：OK/);
 const sandbox=read(path.join(UI,'index.html'));assert.equal((sandbox.match(/src="ui-test.js"/g)||[]).length,1);assert.match(sandbox,/sandbox-guard.js/);
});
for(const sandbox of [false,true])test('real SDK/session remains '+(sandbox?'explicit sandbox':'production with lobby playerId')+', without a demo player',async()=>{
 const pid='p_abcdefghijklmnopqrst',calls=[];
 const ctx={console,URL,URLSearchParams,setTimeout,clearTimeout,localStorage:mem(),sessionStorage:mem(),location:{search:'?bvPlayerId='+pid+(sandbox?'&sandbox=1':''),href:'https://example.test/universe/tetris/',assign(){}},fetch:async(url,init={})=>{calls.push({url,method:init.method||'GET'});return new Response(JSON.stringify({ok:true,data:{player:{playerId:pid,displayId:'入口玩家',baseAvatarKey:'boy1',displayAvatarKey:'boy1'}}}),{status:200});}};
 ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
 vm.runInContext(read(path.resolve(DIR,'../shared/universe-sdk.js')),ctx);
 vm.runInContext(read(path.join(DIR,'universe-shell.js')),ctx);
 const session=ctx.UniverseTetris.session;
 assert.equal(session.mode,sandbox?'sandbox':'production');assert.equal(session.isSandbox,sandbox);
 if(!sandbox){const p=await session.start();assert.equal(p.playerId,pid);assert.equal(p.displayId,'入口玩家');assert.equal(calls.length,1);assert.match(calls[0].url,new RegExp('/v1/players/'+pid+'$'));assert.equal(calls[0].method,'GET');}
 assert.doesNotMatch(read(path.join(DIR,'universe-shell.js')),/UI測試員|p_uitestsandboxplayera|BVUiTestSandbox/);
});
for(const sandbox of [false,true])test('sandbox badges are '+(sandbox?'retained in explicit sandbox':'absent from live player UI'),()=>{
 const js=read(path.join(DIR,'ui-test.js'));const block=js.slice(js.indexOf('  if (window.UniverseTetris && UniverseTetris.session.isSandbox)'),js.indexOf('  /* ---------- 觸控按鍵'));
 let appended=0;const parent={appendChild(){appended++}},ctx={window:null,UniverseTetris:{session:{isSandbox:sandbox}},document:{createElement:()=>({}),body:parent},$:()=>({parentElement:parent})};ctx.window=ctx;vm.runInNewContext(block,ctx);assert.equal(appended,sandbox?2:0);
});

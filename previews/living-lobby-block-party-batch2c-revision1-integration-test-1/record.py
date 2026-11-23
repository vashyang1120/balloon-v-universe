#!/usr/bin/env python3
"""錄製完整動態大廳影片（吊起 12 px）。用法：python3 record.py [網址根] [輸出目錄]
只在錄影時隱藏新手引導對話框（#rpg、#flow），並在瀏覽器端加測試掛鉤以固定秒數繪製；不修改 repo 檔案。"""
import asyncio, subprocess, sys, shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else 'videos'); OUT.mkdir(parents=True, exist_ok=True)
TMP = Path('/tmp/lobbyframes')
async def record(b, name, viewport, mobile, query, clip_map):
    ctx = await b.new_context(viewport=viewport, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page()
    async def hook(route):
        resp = await route.fetch(); body = await resp.text()
        await route.fulfill(response=resp, body=body.replace('    showVisit(characterMode);\n', '    window.__lobbyRender = render;\n    showVisit(characterMode);\n'))
    await pg.route('**/assets/living-lobby/engine.js*', hook)
    await pg.clock.install(time=0); await pg.clock.pause_at(1000)
    await pg.goto(ROOT + 'index.html' + query)
    for _ in range(600):
        if await pg.evaluate('!!window.__lobbyRender'): break
        await pg.wait_for_timeout(100)
    await pg.add_style_tag(content='#rpg,#flow{display:none!important}')
    await pg.wait_for_timeout(300)
    box = await pg.locator('#mapSvg').bounding_box() if clip_map else None
    shutil.rmtree(TMP, ignore_errors=True); TMP.mkdir()
    for i in range(270):
        await pg.evaluate(f'window.__lobbyRender({i / 30})')
        await pg.screenshot(path=str(TMP / f'{i:04d}.png'), clip=box) if box else await pg.screenshot(path=str(TMP / f'{i:04d}.png'))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(TMP / '%04d.png'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
                    '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-movflags', '+faststart', str(OUT / f'{name}.mp4')], check=True)
    await ctx.close(); print(name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        await record(b, 'full-lobby-desktop', {'width': 1440, 'height': 1000}, False, '?craneLift=12', False)
        await record(b, 'full-lobby-phone', {'width': 412, 'height': 915}, True, '?craneLift=12', True)
        await b.close()
asyncio.run(main())

#!/usr/bin/env python3
"""Batch 2-C Revision 1 Integration Test 1｜完整動態大廳整合檢查。

用法：在 repo 根目錄啟動靜態伺服器（例如 python3 -m http.server 8765），再執行
    python3 previews/living-lobby-block-party-batch2c-revision1-integration-test-1/check-integration.py [網址根] [Chrome 路徑]
測試時只在瀏覽器端替 engine.js 加一行測試掛鉤（window.__lobbyRender = render），不修改 repo 檔案；
時鐘維持暫停，讓「有吊臂（?craneLift=10/12/15）」與「無吊臂（?craneLift=0）」兩頁以完全相同的秒數呼叫正式 render()，逐像素比對整張動態大廳畫面：
- 兩頁差異必須全部落在吊臂遮罩內（其餘熱氣球、旗幟、音符、音響、瀑布、氣球束、賊鷗逐像素不變）
- Alpha 不變；遊戲入口、熱區與 SVG 結構不變
結果寫入 tests/integration-results.json，畫面寫入 tests/frames/。
"""
import asyncio, base64, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/'
CHROME = sys.argv[2] if len(sys.argv) > 2 else '/usr/bin/google-chrome'
REPO = HERE.parents[1]
MASK = np.array(Image.open(REPO / 'assets/living-lobby/crane/mask.png'))[..., 3] > 0
RX, RY, RW, RH = json.loads((REPO / 'assets/living-lobby/crane/layout.json').read_text())['rectXYWH']
TIMES_MS = [0, 600, 1450, 2550, 3200, 3900, 4500, 7050, 12300]

GRAB = r"""() => {
  const view = document.querySelector('#mapSvg .living-lobby-layer canvas');
  const c = document.createElement('canvas'); c.width = 1536; c.height = 1024;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(view, 0, 0, 3072, 2048, 0, 0, 1536, 1024);   // 取 2x 顯示畫面的每 2 px 一點
  return c.toDataURL('image/png');
}"""
DOM = r"""() => ({
  entries: [...document.querySelectorAll('#entries button, #entries a')].map(e => e.textContent.trim()),
  zones: [...document.querySelectorAll('#mapSvg [data-zone], #mapSvg .zone')].map(e => e.getAttribute('data-zone') || e.id),
  layers: [...document.querySelectorAll('#mapSvg > *')].map(e => e.tagName + '.' + (e.getAttribute('class') || '')),
})"""

async def open_page(browser, query, viewport, mobile):
    ctx = await browser.new_context(viewport=viewport, device_scale_factor=2.625 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    page = await ctx.new_page(); errors = []
    async def hook(route):
        resp = await route.fetch(); body = await resp.text()
        marker = '    showVisit(characterMode);\n'
        assert body.count(marker) == 1
        await route.fulfill(response=resp, body=body.replace(marker, '    window.__lobbyRender = render;\n' + marker))
    await page.route('**/assets/living-lobby/engine.js*', hook)
    page.on('pageerror', lambda e: errors.append(str(e)))
    await page.clock.install(time=0)
    await page.clock.pause_at(1000)
    await page.goto(ROOT + 'index.html' + query)
    # 時鐘維持暫停，只以真實時間等待素材載入；兩頁的動畫時間都從 0 開始，才能逐影格比對
    for _ in range(600):
        if await page.evaluate("document.getElementById('mapSvg').classList.contains('living-lobby-ready')"):
            break
        await page.wait_for_timeout(100)
    return ctx, page, errors

def decode(d):
    import io
    return np.array(Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGBA')).astype(int)

async def main():
    out = HERE / 'tests'; (out / 'frames').mkdir(parents=True, exist_ok=True)
    report = {'date': time.strftime('%Y-%m-%d %H:%M'), 'root': ROOT, 'runs': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        report['chrome'] = b.version
        for profile, vp, mobile, lifts in [('desktop-1440', {'width': 1440, 'height': 1000}, False, [10, 12, 15]), ('pixel7-412', {'width': 412, 'height': 915}, True, [12])]:
            for lift in lifts:
                base_ctx, base, base_err = await open_page(b, '?craneLift=0', vp, mobile)
                ctx, page, err = await open_page(b, f'?craneLift={lift}', vp, mobile)
                run = {'profile': profile, 'liftPx': lift, 'frames': []}
                run['domSame'] = (await page.evaluate(DOM)) == (await base.evaluate(DOM))
                for t in TIMES_MS:
                    await page.evaluate(f'window.__lobbyRender({t / 1000})'); await base.evaluate(f'window.__lobbyRender({t / 1000})')
                    on, off = decode(await page.evaluate(GRAB)), decode(await base.evaluate(GRAB))
                    diff = np.abs(on - off)
                    rgb = diff[..., :3].max(axis=2) > 0
                    alpha = int((diff[..., 3] > 0).sum())
                    full_mask = np.zeros(rgb.shape, bool); full_mask[RY:RY + RH, RX:RX + RW] = MASK
                    outside = int((rgb & ~full_mask).sum())
                    rec = {'ms': t, 'changedInMask': int((rgb & full_mask).sum()), 'changedOutsideMask': outside, 'alphaChanged': alpha}
                    if outside:
                        ys, xs = np.where(rgb & ~full_mask)
                        rec['outsideBBoxXYXY'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
                        Image.fromarray(np.concatenate([on, off], axis=1).astype(np.uint8)).save(out / 'frames' / f'outside-{profile}-{lift}-{t}.png')
                    run['frames'].append(rec)
                    if profile.startswith('desktop') and lift == 12 and t in (600, 2550):
                        Image.fromarray(on.astype(np.uint8)).crop((250, 200, 560, 560)).resize((620, 720), Image.NEAREST).save(out / 'frames' / f'lobby-crop-{t}ms.png')
                run['errors'] = err
                if lift == 12:
                    await page.evaluate('window.__lobbyRender(2.55)')
                    await page.screenshot(path=str(out / 'frames' / f'{profile}-lift12.png'))
                run['baselineErrors'] = base_err
                report['runs'].append(run)
                await ctx.close(); await base_ctx.close()
        await b.close()
    (out / 'integration-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for r in report['runs']:
        print(json.dumps(r, ensure_ascii=False)[:900])

asyncio.run(main())

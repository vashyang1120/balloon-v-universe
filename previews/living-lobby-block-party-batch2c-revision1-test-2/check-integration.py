#!/usr/bin/env python3
"""Batch 2-C Revision 1 Test 2｜全場整合檢查（吊臂搬運）（需先以 build.cjs 產生整合目錄）。

用法：在整合目錄執行 python3 check-integration.py [Chrome 路徑]
結果寫入 tests/integration-results.json。
檢查：手臂方案開／關在同一時間點的全場差異只落在手臂遮罩內、Alpha 不變；
遮罩內的手臂像素沒有被後續圖層（氣球束、角色等）蓋掉；已驗收氣球束（特別是 BP-04）與手臂範圍是否重疊。
"""
import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
CHROME = sys.argv[1] if len(sys.argv) > 1 else '/usr/bin/google-chrome'

JS = r"""
(key) => {
  const lobby = window.inspectLobby, st = lobby.craneState;
  const ctx = lobby.environment.getContext('2d', {willReadFrequently: true});
  const W = 1536, H = 1024;
  const mask = new Uint8Array(W * H);
  for (const at of st.mask) { const i = at / 4; mask[(st.y + Math.floor(i / st.width)) * W + st.x + i % st.width] = 1; }
  const grab = (t, on) => { lobby.setCrane(on); lobby.render(t, 'none'); return ctx.getImageData(0, 0, W, H).data; };
  const scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H;
  const s = scratch.getContext('2d', {willReadFrequently: true});
  const P = LobbyCrane.period(st.settings);
  const times = [0, .6, 1.2, 1.45, 2.3, 2.55, 3.1, 3.9, P, 5.85, 7.05];
  const frames = times.map(t => {
    const off = grab(t, false), on = grab(t, true);
    s.putImageData(new ImageData(new Uint8ClampedArray(off), W, H), 0, 0);
    LobbyCrane.paint(s, st, t);
    const expected = s.getImageData(0, 0, W, H).data;
    let outside = 0, alpha = 0, changed = 0, overwritten = 0;
    for (let p = 0; p < W * H; p++) {
      const k = p * 4;
      if (on[k + 3] !== off[k + 3]) alpha++;
      const diff = on[k] !== off[k] || on[k + 1] !== off[k + 1] || on[k + 2] !== off[k + 2];
      if (diff && !mask[p]) outside++;
      if (diff) changed++;
      if (mask[p] && (expected[k] !== on[k] || expected[k + 1] !== on[k + 1] || expected[k + 2] !== on[k + 2])) overwritten++;
    }
    return {t: +t.toFixed(3), changed, outside, alpha, overwrittenInMask: overwritten};
  });
  lobby.setCrane(true);
  const overlaps = (typeof bouquets === 'undefined' ? [] : bouquets).map((b, i) => {
    const [x, y, r, bt] = b.cropXYXY; let n = 0;
    for (let yy = Math.max(y, st.y); yy < Math.min(bt, st.y + st.height); yy++)
      for (let xx = Math.max(x, st.x); xx < Math.min(r, st.x + st.width); xx++) if (mask[yy * W + xx]) n++;
    return {index: i, cropXYXY: b.cropXYXY, maskPixelsInside: n};
  }).filter(o => o.maskPixelsInside);
  return {scheme: key, frames, bouquetOverlaps: overlaps, counts: lobby.counts};
}
"""

async def main():
    out = HERE / 'tests'; out.mkdir(exist_ok=True)
    report = {'runs': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--allow-file-access-from-files', '--disable-accelerated-2d-canvas'])
        report['chrome'] = b.version
        for name, vp, mobile in [('desktop-1440', {'width': 1440, 'height': 1050}, False), ('pixel7-412', {'width': 412, 'height': 915}, True)]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=2.625 if mobile else 1, is_mobile=mobile, has_touch=mobile)
            pg = await ctx.new_page(); errors = []
            pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
            await pg.goto((HERE / 'index.html').as_uri())
            await pg.wait_for_selector('body[data-ready=true]', state='attached', timeout=90000)
            run = {'schemes': [await pg.evaluate(JS, 'crane')]}
            run.update(profile=name, errors=errors)
            await pg.evaluate("inspectLobby.render(0.7,'none')")
            await pg.screenshot(path=str(out / f'integration-{name}.png'), full_page=False)
            report['runs'].append(run)
            await ctx.close()
        await b.close()
    (out / 'integration-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for r in report['runs']:
        print(r['profile'], 'errors', r['errors'])
        for sc in r['schemes']:
            print(' ', sc['scheme'], 'counts', sc['counts'], 'overlaps', sc['bouquetOverlaps'])
            for f in sc['frames']:
                print('   ', f)

asyncio.run(main())

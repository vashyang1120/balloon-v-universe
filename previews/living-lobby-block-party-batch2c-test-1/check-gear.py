#!/usr/bin/env python3
"""Batch 2-C Test 1｜BP-01 自動檢查（Chrome + Playwright）。

用法：python3 check-gear.py [Chrome 路徑]
在本目錄執行，結果寫入 tests/gear-results.json，接點放大圖寫入 tests/frames/。
"""
import asyncio, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
CHROME = sys.argv[1] if len(sys.argv) > 1 else '/usr/bin/google-chrome'

JS = r"""
async ({amp, hubFollows}) => {
  const {map, gear} = window.inspectGear;
  gear.settings.amplitudeDegrees = amp; gear.settings.hubFollows = hubFollows;
  const P = gear.settings.periodSeconds;
  const W = 1536, H = 1024;
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  const b = base.getContext('2d', {willReadFrequently: true}); b.drawImage(map, 0, 0);
  const orig = b.getImageData(0, 0, W, H).data;
  const maskSet = new Uint8Array(W * H);
  for (const at of gear.mask) { const i = at / 4, x = gear.x + i % gear.width, y = gear.y + Math.floor(i / gear.width); maskSet[y * W + x] = 1; }
  const work = document.createElement('canvas'); work.width = W; work.height = H;
  const w = work.getContext('2d', {willReadFrequently: true});
  const [rx, ry, rw, rh] = [gear.x - 6, gear.y - 6, gear.width + 12, gear.height + 12];
  function frameAt(t) {
    w.clearRect(0, 0, W, H); w.drawImage(map, 0, 0);
    LobbyGear.paint(w, gear, t);
    return w.getImageData(0, 0, W, H).data;
  }
  // 手臂（粉紅）像素：只在原圖局部判定
  const isPink = (d, k) => d[k] > 190 && d[k + 1] < 150 && d[k + 2] > 80 && d[k] - d[k + 1] > 70;
  const result = {amplitude: amp, hubFollows, periodSeconds: P, samples: []};
  const times = []; for (let i = 0; i <= 24; i++) times.push(i * P / 24);
  times.push(P * 2, P * 3 + .123, P * 7.5);
  let restExact = true, outsideMax = 0, alphaMax = 0, foreignMax = 0, foreignOver = 0, changedMax = 0;
  let armOutsideChanged = 0, armInsideChanged = 0, armLost = 0, armGained = 0;
  for (const t of times) {
    const f = frameAt(t);
    let outside = 0, alpha = 0, changed = 0;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const k = (y * W + x) * 4; const d = Math.abs(f[k] - orig[k]) + Math.abs(f[k + 1] - orig[k + 1]) + Math.abs(f[k + 2] - orig[k + 2]);
      if (f[k + 3] !== orig[k + 3]) alpha++;
      if (!d) continue;
      changed++;
      if (!maskSet[y * W + x]) outside++;
      if (isPink(orig, k)) { if (maskSet[y * W + x]) armInsideChanged++; else armOutsideChanged++; }
      // 外來色檢查：變動像素須能在原圖 7×7 鄰域找到相近顏色
      let best = 1e9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const q = ((y + dy) * W + x + dx) * 4;
        const e = (f[k] - orig[q]) ** 2 + (f[k + 1] - orig[q + 1]) ** 2 + (f[k + 2] - orig[q + 2]) ** 2;
        if (e < best) best = e;
      }
      best = Math.sqrt(best); if (best > foreignMax) foreignMax = best; if (best > 30) foreignOver++;
    }
    // 全圖抽查：遮罩區以外整張地圖不得變動（含 Alpha）
    let fullOutside = 0, fullAlpha = 0;
    for (let i = 0; i < W * H; i += 7) { const k = i * 4; if (f[k + 3] !== orig[k + 3]) fullAlpha++; if (!maskSet[i] && (f[k] !== orig[k] || f[k + 1] !== orig[k + 1] || f[k + 2] !== orig[k + 2])) fullOutside++; }
    const angle = LobbyGear.angle(gear, t) * 180 / Math.PI;
    if (Math.abs(Math.sin(2 * Math.PI * t / P)) < 1e-9 && changed) restExact = false;
    outsideMax = Math.max(outsideMax, outside + fullOutside); alphaMax = Math.max(alphaMax, alpha + fullAlpha); changedMax = Math.max(changedMax, changed);
    result.samples.push({t: +t.toFixed(4), angleDegrees: +angle.toFixed(3), changed, outsideMask: outside + fullOutside, alphaChanged: alpha + fullAlpha});
  }
  // 手臂輪廓：峰值角度時，遮罩內的粉紅像素增減
  for (const t of [P / 4, 3 * P / 4]) {
    const f = frameAt(t);
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const k = (y * W + x) * 4; const a = isPink(orig, k), c = isPink(f, k);
      if (a && !c) armLost++; if (!a && c) armGained++;
    }
  }
  // 循環與同角度一致性
  const same = (p, q) => { for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false; return true; };
  const loopExact = same(frameAt(.37), frameAt(.37 + P)) && same(frameAt(1.9), frameAt(1.9 + 3 * P));
  const mirrorExact = same(frameAt(.4), frameAt(P / 2 - .4)) && same(frameAt(1.6), frameAt(1.5 * P - 1.6));
  // 60 fps 連續影格差異
  let stepMax = 0, stepMean = 0, n = 0, prev = frameAt(0);
  for (let i = 1; i <= Math.round(P * 60); i++) {
    const f = frameAt(i / 60); let m = 0, s = 0, c = 0;
    for (const at of gear.mask) { const idx = at / 4, x = gear.x + idx % gear.width, y = gear.y + Math.floor(idx / gear.width), k = (y * W + x) * 4;
      const d = Math.max(Math.abs(f[k] - prev[k]), Math.abs(f[k + 1] - prev[k + 1]), Math.abs(f[k + 2] - prev[k + 2])); if (d > m) m = d; s += d; c++; }
    stepMax = Math.max(stepMax, m); stepMean += s / c; n++; prev = f;
  }
  // 效能：只計算 BP-01 單層合成
  const t0 = performance.now(); for (let i = 0; i < 400; i++) LobbyGear.paint(w, gear, i / 60); const perFrame = (performance.now() - t0) / 400;
  Object.assign(result, {restExact, outsideMaskMax: outsideMax, alphaChangedMax: alphaMax, changedPixelsMax: changedMax,
    foreignColorMaxDistance: +foreignMax.toFixed(1), foreignColorPixelsOver30: foreignOver,
    armPixels: {outsideMaskChanged: armOutsideChanged, insideMaskChangedTotal: armInsideChanged, peakLost: armLost, peakGained: armGained},
    loopExact, sameAngleExact: mirrorExact, frameStep60fps: {max: stepMax, meanPerPixel: +(stepMean / n).toFixed(3)}, paintMsPerFrame: +perFrame.toFixed(3)});
  return result;
}
"""

async def main():
    out = HERE / 'tests'; (out / 'frames').mkdir(parents=True, exist_ok=True)
    report = {'chrome': None, 'date': time.strftime('%Y-%m-%d'), 'runs': [], 'layout': json.loads((HERE / 'gear-assets/bp01-layout.json').read_text())}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        report['chrome'] = b.version
        for name, vp, mobile in [('desktop-1440', {'width': 1440, 'height': 1000}, False), ('pixel7-412', {'width': 412, 'height': 915}, True)]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=2.625 if mobile else 1, is_mobile=mobile, has_touch=mobile)
            pg = await ctx.new_page(); errors = []
            pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
            await pg.goto((HERE / 'index.html').as_uri())
            await pg.wait_for_function('window.inspectGear', timeout=60000)
            await pg.evaluate('inspectGear.pause()')
            layout = await pg.evaluate("""(()=>{const r=e=>document.getElementById(e).getBoundingClientRect();return {lobby:r('lobby').width, phone:r('phone').width, overflow:document.documentElement.scrollWidth>innerWidth}})()""")
            run = {'profile': name, 'layout': layout, 'errors': errors, 'checks': []}
            combos = [(4, True), (3, True), (5, True), (4, False)] if not mobile else [(4, True)]
            for amp, hub in combos:
                run['checks'].append(await pg.evaluate(JS, {'amp': amp, 'hubFollows': hub}))
            if not mobile:
                await pg.evaluate('inspectGear.gear.settings.amplitudeDegrees=4; inspectGear.gear.settings.hubFollows=true')
                for t, tag in [(0, 'rest'), (0.7, 'peak-plus'), (2.1, 'peak-minus')]:
                    await pg.evaluate(f'inspectGear.seek({t})')
                    await pg.evaluate("""(tag)=>{const s=inspectGear.scene,c=document.createElement('canvas');c.width=90*8;c.height=80*8;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(s,385,280,90,80,0,0,c.width,c.height);window.__f=c.toDataURL()}""", tag)
                    import base64
                    (out / 'frames' / f'joint-{tag}.png').write_bytes(base64.b64decode((await pg.evaluate('window.__f')).split(',')[1]))
                await pg.screenshot(path=str(out / 'frames' / 'page-desktop.png'), full_page=True)
            else:
                await pg.screenshot(path=str(out / 'frames' / 'page-pixel7.png'), full_page=True)
            run['errors'] = errors
            report['runs'].append(run)
            await ctx.close()
        await b.close()
    lay = report['layout']['maxRadiusPx']
    report['visibility'] = {f'±{a}°': {'mapPx': round(max(lay.values()) * a * 3.14159 / 180, 2),
                                         'desktop1388Px': round(max(lay.values()) * a * 3.14159 / 180 * 1388 / 1536, 2),
                                         'phone392Px': round(max(lay.values()) * a * 3.14159 / 180 * 392 / 1536, 2)} for a in (3, 4, 5)}
    (out / 'gear-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for run in report['runs']:
        print(run['profile'], run['layout'], 'errors', run['errors'])
        for c in run['checks']:
            print({k: c[k] for k in c if k != 'samples'})
    print(report['visibility'])

asyncio.run(main())

#!/usr/bin/env python3
"""Batch 2-C Revision 1 Test 2｜吊臂搬運自動檢查（Chrome + Playwright）。

用法：在本目錄執行 python3 check-arm.py [Chrome 路徑]
結果寫入 tests/crane-results.json，關鍵影格寫入 tests/frames/。
"""
import asyncio, base64, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
CHROME = sys.argv[1] if len(sys.argv) > 1 else '/usr/bin/google-chrome'

JS = r"""
(lift) => {
  const {map, state: st} = window.inspectCrane, g = st.geometry, se = st.settings;
  se.liftPx = lift;
  const P = LobbyCrane.period(se), W = 1536, H = 1024;
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  const b = base.getContext('2d', {willReadFrequently: true}); b.drawImage(map, 0, 0);
  const orig = b.getImageData(0, 0, W, H).data;
  const inMask = new Uint8Array(W * H);
  for (const at of st.mask) { const i = at / 4; inMask[(st.y + Math.floor(i / st.width)) * W + st.x + i % st.width] = 1; }
  const work = document.createElement('canvas'); work.width = W; work.height = H;
  const w = work.getContext('2d', {willReadFrequently: true});
  const frameAt = t => { w.clearRect(0, 0, W, H); w.drawImage(map, 0, 0); LobbyCrane.paint(w, st, t); return w.getImageData(0, 0, W, H).data; };
  const layerAlpha = name => { const c = document.createElement('canvas'); c.width = st.width; c.height = st.height; const k = c.getContext('2d'); k.drawImage(st.images[name], 0, 0); return k.getImageData(0, 0, st.width, st.height).data; };
  const torusA = layerAlpha('torus'), frontA = layerAlpha('front');
  const inLayer = (A, x, y) => { const lx = x - st.x, ly = y - st.y; return lx >= 0 && ly >= 0 && lx < st.width && ly < st.height && A[(ly * st.width + lx) * 4 + 3] > 0; };
  const rx = st.x - 8, ry = st.y - 8, rw = st.width + 16, rh = st.height + 16;
  const times = []; for (let i = 0; i <= 54; i++) times.push(i * P / 54);
  times.push(2 * P + 1.3, 3 * P + .137, 7.5 * P);
  const res = {liftPx: lift, periodSeconds: P, samples: []};
  let restExact = true, outsideMax = 0, alphaMax = 0, foreignMax = 0, foreignOver = 0, torusMax = 0, frontMax = 0, changedMax = 0;
  for (const t of times) {
    const f = frameAt(t), p = LobbyCrane.pose(st, t);
    let outside = 0, alpha = 0, changed = 0, torus = 0, front = 0;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const k = (y * W + x) * 4;
      if (f[k + 3] !== orig[k + 3]) alpha++;
      if (f[k] === orig[k] && f[k + 1] === orig[k + 1] && f[k + 2] === orig[k + 2]) continue;
      changed++;
      if (!inMask[y * W + x]) outside++;
      if (inLayer(torusA, x, y)) torus++;
      if (inLayer(frontA, x, y)) front++;
      if ((x + y) % 2 === 0) {
        let best = 1e9;
        for (let dy = -16; dy <= 16; dy += 2) for (let dx = -16; dx <= 16; dx += 2) { const q = ((y + dy) * W + x + dx) * 4; const e = (f[k] - orig[q]) ** 2 + (f[k + 1] - orig[q + 1]) ** 2 + (f[k + 2] - orig[q + 2]) ** 2; if (e < best) best = e; }
        best = Math.sqrt(best); if (best > foreignMax) foreignMax = best; if (best > 30) foreignOver++;
      }
    }
    let fullOutside = 0;
    for (let i = 0; i < W * H; i += 5) { const k = i * 4; if (f[k + 3] !== orig[k + 3]) alpha++; if (!inMask[i] && (f[k] !== orig[k] || f[k + 1] !== orig[k + 1] || f[k + 2] !== orig[k + 2])) fullOutside++; }
    if (p.fraction === 0 && changed) restExact = false;
    outsideMax = Math.max(outsideMax, outside + fullOutside); alphaMax = Math.max(alphaMax, alpha); changedMax = Math.max(changedMax, changed);
    torusMax = Math.max(torusMax, torus); frontMax = Math.max(frontMax, front);
    res.samples.push({t: +t.toFixed(3), lift: +p.lift.toFixed(2), gearDeg: +(p.gear * 180 / Math.PI).toFixed(2), boomDeg: +(p.boom * 180 / Math.PI).toFixed(2),
      couplerDeg: +(p.coupler * 180 / Math.PI).toFixed(2), elbowPx: +Math.hypot(p.E[0] - g.E0[0], p.E[1] - g.E0[1]).toFixed(2), linkMarginPx: +p.margin.toFixed(2), changed});
  }
  let envelope = 0;
  for (const t of times) {
    const d = LobbyCrane.render(st, t);
    for (let i = 0; i < st.width * st.height; i++) {
      const x = st.x + i % st.width, y = st.y + Math.floor(i / st.width), k = (y * W + x) * 4;
      // 容許 ±2：此區地圖 Alpha 為 241–254，瀏覽器讀回半透明像素時有 ±1 進位誤差
      if (!inMask[y * W + x] && Math.max(Math.abs(d[i * 4] - orig[k]), Math.abs(d[i * 4 + 1] - orig[k + 1]), Math.abs(d[i * 4 + 2] - orig[k + 2])) > 2) envelope++;
    }
  }
  const same = (p, q) => { for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false; return true; };
  const loopExact = same(frameAt(1.3), frameAt(1.3 + P)) && same(frameAt(2.9), frameAt(2.9 + 3 * P));
  const mirror = t => 2 * se.holdDown + 2 * se.rise + se.holdUp - t;
  const sameAngle = same(frameAt(1.2), frameAt(mirror(1.2))) && same(frameAt(1.75), frameAt(mirror(1.75)));
  let stepMax = 0, stepMean = 0, n = 0, prev = frameAt(0);
  for (let i = 1; i <= Math.round(P * 60); i++) {
    const f = frameAt(i / 60); let m = 0, s = 0, c = 0;
    for (const at of st.mask) { const idx = at / 4, x = st.x + idx % st.width, y = st.y + Math.floor(idx / st.width), k = (y * W + x) * 4;
      const d = Math.max(Math.abs(f[k] - prev[k]), Math.abs(f[k + 1] - prev[k + 1]), Math.abs(f[k + 2] - prev[k + 2])); if (d > m) m = d; s += d; c++; }
    stepMax = Math.max(stepMax, m); stepMean += s / c; n++; prev = f;
  }
  const t0 = performance.now(); for (let i = 0; i < 200; i++) LobbyCrane.paint(w, st, i / 60); const ms = (performance.now() - t0) / 200;
  const peak = k2 => Math.max(...res.samples.map(s => Math.abs(s[k2])));
  Object.assign(res, {restExact, outsideMaskMax: outsideMax, maskEnvelopeLeaks: envelope, alphaChangedMax: alphaMax, changedPixelsMax: changedMax,
    foreignColorMaxDistance: +foreignMax.toFixed(1), foreignColorPixelsOver30: foreignOver,
    protected: {torusChangedMax: torusMax, frontPileAndColumnChangedMax: frontMax},
    peaks: {liftPx: peak('lift'), gearDeg: peak('gearDeg'), boomDeg: peak('boomDeg'), couplerDeg: peak('couplerDeg'), elbowPx: peak('elbowPx')},
    minLinkMarginPx: Math.min(...res.samples.map(s => s.linkMarginPx)),
    loopExact, sameAngleExact: sameAngle, frameStep60fps: {max: stepMax, meanPerPixel: +(stepMean / n).toFixed(3)}, paintMsPerFrame: +ms.toFixed(3)});
  se.liftPx = 12;
  return res;
}
"""

async def main():
    out = HERE / 'tests'; (out / 'frames').mkdir(parents=True, exist_ok=True)
    report = {'date': time.strftime('%Y-%m-%d'), 'runs': [], 'layout': json.loads((HERE / 'arm-assets/layout.json').read_text())}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME)
        report['chrome'] = b.version
        for name, vp, mobile in [('desktop-1440', {'width': 1440, 'height': 1000}, False), ('pixel7-412', {'width': 412, 'height': 915}, True)]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=2.625 if mobile else 1, is_mobile=mobile, has_touch=mobile)
            pg = await ctx.new_page(); errors = []
            pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
            await pg.goto((HERE / 'index.html').as_uri())
            await pg.wait_for_function('window.inspectCrane', timeout=60000)
            await pg.evaluate('inspectCrane.pause()')
            layout = await pg.evaluate("""(()=>{const r=e=>document.getElementById(e).getBoundingClientRect().width;return {lobby:r('lobby'),phone:r('phone-live'),overflow:document.documentElement.scrollWidth>innerWidth}})()""")
            run = {'profile': name, 'layout': layout, 'checks': []}
            for lift in ([10, 12, 15] if not mobile else [12]):
                run['checks'].append(await pg.evaluate(JS, lift))
            if not mobile:
                for lift, t, tag in [(12, 0, 'rest'), (12, 1.45, 'half'), (12, 2.55, 'up-12px'), (15, 2.55, 'up-15px')]:
                    d = await pg.evaluate("""([l,t])=>{inspectCrane.setLift(l);inspectCrane.seek(t);const s=inspectCrane.scene,c=document.createElement('canvas');c.width=206*4;c.height=296*4;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(s,296,236,206,296,0,0,c.width,c.height);return c.toDataURL()}""", [lift, t])
                    (out / 'frames' / f'crane-{tag}.png').write_bytes(base64.b64decode(d.split(',')[1]))
                await pg.evaluate('inspectCrane.setLift(12)')
                await pg.screenshot(path=str(out / 'frames' / 'page-desktop.png'), full_page=True)
            else:
                await pg.screenshot(path=str(out / 'frames' / 'page-pixel7.png'), full_page=True)
            run['errors'] = errors
            report['runs'].append(run)
            await ctx.close()
        await b.close()
    vis = {}
    for c in report['runs'][0]['checks']:
        pk = c['peaks']
        rim = 28 * pk['gearDeg'] * 3.14159 / 180
        top = max(pk['liftPx'], pk['elbowPx'])
        vis[f"{c['liftPx']}px"] = {'loadLiftMapPx': round(pk['liftPx'], 2), 'gearRimTurnMapPx': round(rim, 2), 'elbowMapPx': round(pk['elbowPx'], 2),
                                  'desktop1388Px': round(top * 1388 / 1536, 2), 'phone392Px': round(top * 392 / 1536, 2)}
    report['visibility'] = vis
    (out / 'crane-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for r in report['runs']:
        print(r['profile'], r['layout'], 'errors', r['errors'])
        for c in r['checks']:
            print({k: c[k] for k in c if k not in ('samples',)})
    print(json.dumps(vis, ensure_ascii=False))

asyncio.run(main())

#!/usr/bin/env python3
"""Batch 2-C Revision 1 Test 1｜方案 A、B 自動檢查（Chrome + Playwright）。

用法：在本目錄執行 python3 check-arm.py [Chrome 路徑]
結果寫入 tests/arm-results.json，關鍵影格寫入 tests/frames/。
"""
import asyncio, base64, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
CHROME = sys.argv[1] if len(sys.argv) > 1 else '/usr/bin/google-chrome'

JS = r"""
(key) => {
  const {map, states} = window.inspectArm, st = states[key], g = st.geometry, P = st.settings.periodSeconds;
  const W = 1536, H = 1024;
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  const b = base.getContext('2d', {willReadFrequently: true}); b.drawImage(map, 0, 0);
  const orig = b.getImageData(0, 0, W, H).data;
  const inMask = new Uint8Array(W * H);
  for (const at of st.mask) { const i = at / 4; inMask[(st.y + Math.floor(i / st.width)) * W + st.x + i % st.width] = 1; }
  const work = document.createElement('canvas'); work.width = W; work.height = H;
  const w = work.getContext('2d', {willReadFrequently: true});
  const frameAt = t => { w.clearRect(0, 0, W, H); w.drawImage(map, 0, 0); LobbyArm.paint(w, st, t); return w.getImageData(0, 0, W, H).data; };
  const rx = st.x - 8, ry = st.y - 8, rw = st.width + 16, rh = st.height + 16;
  // 保護區：肩部圓環、齒輪（方案 A）、BP-04 繩尾、屋頂與左側方塊建築
  const torusImg = (() => { const c = document.createElement('canvas'); c.width = st.width; c.height = st.height; const k = c.getContext('2d'); k.drawImage(st.images.torus, 0, 0); return k.getImageData(0, 0, st.width, st.height).data; })();
  const gearImg = (() => { const c = document.createElement('canvas'); c.width = st.width; c.height = st.height; const k = c.getContext('2d'); k.drawImage(st.images.gear, 0, 0); k.drawImage(st.images.hub, 0, 0); return k.getImageData(0, 0, st.width, st.height).data; })();
  const isTorus = (x, y) => { const lx = x - st.x, ly = y - st.y; return lx >= 0 && ly >= 0 && lx < st.width && ly < st.height && torusImg[(ly * st.width + lx) * 4 + 3] > 0; };
  const isGear = (x, y) => { const lx = x - st.x, ly = y - st.y; return lx >= 0 && ly >= 0 && lx < st.width && ly < st.height && gearImg[(ly * st.width + lx) * 4 + 3] > 0; };
  const isString = (x, y, d) => x >= 406 && x < 416 && y >= 279 && y < 300 && d[(y * W + x) * 4] - d[(y * W + x) * 4 + 2] > 60 && d[(y * W + x) * 4 + 1] > 95;
  const steps = 48, times = [];
  for (let i = 0; i <= steps; i++) times.push(i * P / steps);
  times.push(2 * P, 3 * P + .137, 7.5 * P);
  const res = {scheme: key, settings: st.settings, periodSeconds: P, samples: []};
  let restExact = true, outsideMax = 0, alphaMax = 0, foreignMax = 0, foreignOver = 0, torusMax = 0, gearMax = 0, stringMax = 0, roofMax = 0, changedMax = 0;
  for (const t of times) {
    const f = frameAt(t), p = LobbyArm.pose(st, t);
    let outside = 0, alpha = 0, changed = 0, torus = 0, gear = 0, str = 0, roof = 0;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const k = (y * W + x) * 4;
      if (f[k + 3] !== orig[k + 3]) alpha++;
      if (f[k] === orig[k] && f[k + 1] === orig[k + 1] && f[k + 2] === orig[k + 2]) continue;
      changed++;
      if (!inMask[y * W + x]) outside++;
      if (isTorus(x, y)) torus++;
      if (key === 'A' && isGear(x, y)) gear++;
      if (isString(x, y, orig)) str++;
      if (y >= 386 || x < 316) roof++;
      // 外來色（破洞、黑邊、透明）檢查：變動像素須能在原圖半徑 11 px（最大位移＋3）內找到相近顏色
      if ((x + y) % 2 === 0) {
        let best = 1e9;
        for (let dy = -11; dy <= 11; dy++) for (let dx = -11; dx <= 11; dx++) { const q = ((y + dy) * W + x + dx) * 4; const e = (f[k] - orig[q]) ** 2 + (f[k + 1] - orig[q + 1]) ** 2 + (f[k + 2] - orig[q + 2]) ** 2; if (e < best) best = e; }
        best = Math.sqrt(best); if (best > foreignMax) foreignMax = best; if (best > 30) foreignOver++;
      }
    }
    let fullOutside = 0;
    for (let i = 0; i < W * H; i += 5) { const k = i * 4; if (f[k + 3] !== orig[k + 3]) alpha++; if (!inMask[i] && (f[k] !== orig[k] || f[k + 1] !== orig[k + 1] || f[k + 2] !== orig[k + 2])) fullOutside++; }
    const atRest = Math.abs(p.boom) < 1e-9 && Math.abs(p.gear) < 1e-9 && Math.abs(p.coupler) < 1e-9;
    if (atRest && changed) restExact = false;
    outsideMax = Math.max(outsideMax, outside + fullOutside); alphaMax = Math.max(alphaMax, alpha); changedMax = Math.max(changedMax, changed);
    torusMax = Math.max(torusMax, torus); gearMax = Math.max(gearMax, gear); stringMax = Math.max(stringMax, str); roofMax = Math.max(roofMax, roof);
    res.samples.push({t: +t.toFixed(4), boomDeg: +(p.boom * 180 / Math.PI).toFixed(3), couplerDeg: +(p.coupler * 180 / Math.PI).toFixed(3), gearDeg: +(p.gear * 180 / Math.PI).toFixed(3),
      elbowPx: +Math.hypot(p.E[0] - g.E0[0], p.E[1] - g.E0[1]).toFixed(2), pinPx: +Math.hypot(p.P[0] - g.P0[0], p.P[1] - g.P0[1]).toFixed(2),
      bp04TiePx: +Math.hypot(p.tie[0] - g.T0[0], p.tie[1] - g.T0[1]).toFixed(2), changed, outsideMask: outside + fullOutside});
  }
  // 遮罩是否足夠：不套遮罩的整塊合成，遮罩外必須等於原圖
  let envelope = 0;
  for (const t of times) {
    const d = LobbyArm.render(st, t);
    for (let i = 0; i < st.width * st.height; i++) {
      const x = st.x + i % st.width, y = st.y + Math.floor(i / st.width), k = (y * W + x) * 4;
      if (!inMask[y * W + x] && (d[i * 4] !== orig[k] || d[i * 4 + 1] !== orig[k + 1] || d[i * 4 + 2] !== orig[k + 2])) envelope++;
    }
  }
  const same = (p, q) => { for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false; return true; };
  const loopExact = same(frameAt(.41), frameAt(.41 + P)) && same(frameAt(1.37), frameAt(1.37 + 3 * P));
  const mirror = key === 'A' ? (t => P / 2 - t) : (t => P - t);
  const sameAngle = same(frameAt(.33), frameAt(mirror(.33))) && same(frameAt(1.21), frameAt(mirror(1.21)));
  let stepMax = 0, stepMean = 0, n = 0, prev = frameAt(0);
  for (let i = 1; i <= Math.round(P * 60); i++) {
    const f = frameAt(i / 60); let m = 0, s = 0, c = 0;
    for (const at of st.mask) { const idx = at / 4, x = st.x + idx % st.width, y = st.y + Math.floor(idx / st.width), k = (y * W + x) * 4;
      const d = Math.max(Math.abs(f[k] - prev[k]), Math.abs(f[k + 1] - prev[k + 1]), Math.abs(f[k + 2] - prev[k + 2])); if (d > m) m = d; s += d; c++; }
    stepMax = Math.max(stepMax, m); stepMean += s / c; n++; prev = f;
  }
  const t0 = performance.now(); for (let i = 0; i < 300; i++) LobbyArm.paint(w, st, i / 60); const ms = (performance.now() - t0) / 300;
  const peak = (k2) => Math.max(...res.samples.map(s => Math.abs(s[k2])));
  Object.assign(res, {restExact, outsideMaskMax: outsideMax, maskEnvelopeLeaks: envelope, alphaChangedMax: alphaMax, changedPixelsMax: changedMax,
    foreignColorMaxDistance: +foreignMax.toFixed(1), foreignColorPixelsOver30: foreignOver,
    protected: {torusChangedMax: torusMax, gearChangedMaxSchemeA: key === 'A' ? gearMax : null, bp04StringChangedMax: stringMax, roofAndLeftBuildingChangedMax: roofMax},
    peaks: {boomDeg: peak('boomDeg'), couplerDeg: peak('couplerDeg'), gearDeg: peak('gearDeg'), elbowPx: peak('elbowPx'), pinPx: peak('pinPx'), bp04TiePx: peak('bp04TiePx')},
    loopExact, sameAngleExact: sameAngle, frameStep60fps: {max: stepMax, meanPerPixel: +(stepMean / n).toFixed(3)}, paintMsPerFrame: +ms.toFixed(3)});
  delete res.samples_tmp;
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
            await pg.wait_for_function('window.inspectArm', timeout=60000)
            await pg.evaluate('inspectArm.pause()')
            layout = await pg.evaluate("""(()=>{const r=e=>document.getElementById(e).getBoundingClientRect().width;return {lobbyA:r('lobby-A'),phoneA:r('phone-A'),overflow:document.documentElement.scrollWidth>innerWidth}})()""")
            run = {'profile': name, 'layout': layout, 'checks': []}
            for key in (['A', 'B'] if not mobile else ['A', 'B']):
                run['checks'].append(await pg.evaluate(JS, key))
            if not mobile:
                for key, t, tag in [('A', 0, 'rest'), ('A', .9, 'A-up'), ('A', 2.7, 'A-down'), ('B', 1.6, 'B-peak')]:
                    d = await pg.evaluate("""([k,t])=>{inspectArm.seek(t);const s=inspectArm.scenes[k].canvas,c=document.createElement('canvas');c.width=180*5;c.height=140*5;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(s,300,262,180,140,0,0,c.width,c.height);return c.toDataURL()}""", [key, t])
                    (out / 'frames' / f'joint-{tag}.png').write_bytes(base64.b64decode(d.split(',')[1]))
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
        # 最大可見位移：取肘部、前臂銷釘、齒輪外緣（半徑 28 px）中的最大值；方案 A 為雙向，峰對峰為兩倍
        gear_rim = 28 * pk['gearDeg'] * 3.14159 / 180
        one_way = max(pk['elbowPx'], pk['pinPx'], gear_rim)
        travel = one_way * (2 if c['scheme'] == 'A' else 1)
        vis[c['scheme']] = {'peakDisplacementMapPx': round(one_way, 2), 'travelPeakToPeakMapPx': round(travel, 2),
                            'desktop1388Px': round(travel * 1388 / 1536, 2), 'phone392Px': round(travel * 392 / 1536, 2)}
    report['visibility'] = vis
    (out / 'arm-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    for r in report['runs']:
        print(r['profile'], r['layout'], 'errors', r['errors'])
        for c in r['checks']:
            print({k: c[k] for k in c if k not in ('samples', 'settings')})
    print(json.dumps(vis, ensure_ascii=False))

asyncio.run(main())

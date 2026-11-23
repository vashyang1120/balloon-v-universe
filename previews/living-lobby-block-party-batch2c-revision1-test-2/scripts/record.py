#!/usr/bin/env python3
"""錄製吊臂搬運 MP4（需 Chrome、Playwright、ffmpeg）。用法：python3 scripts/record.py <本目錄>"""
import asyncio, base64, subprocess, sys, shutil
from pathlib import Path
from playwright.async_api import async_playwright
PKG = Path(sys.argv[1]).resolve(); OUT = PKG / 'videos'; OUT.mkdir(exist_ok=True)
TMP = Path('/tmp/craneframes')
JS = r"""([t, kind]) => {
  const g = window.inspectCrane; g.seek(t);
  const [cx, cy, cw, ch] = g.CROP, c = document.createElement('canvas'), x = c.getContext('2d');
  if (kind === 'compare') {
    const z = 3, pw = cw * z, ph = ch * z; c.width = pw * 2 + 16; c.height = ph + 44;
    x.fillStyle = '#f8f5ee'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingEnabled = false;
    [['原始靜態', g.map], ['吊臂搬運（吊起 12 px）', g.scene]].forEach(([label, src], i) => {
      x.drawImage(src, cx, cy, cw, ch, i * (pw + 16), 44, pw, ph);
      x.fillStyle = '#2b2440'; x.font = 'bold 26px "Noto Sans CJK TC", sans-serif'; x.fillText(label, i * (pw + 16) + 6, 32);
    });
  } else {
    const w = +kind; c.width = w; c.height = Math.round(w * 1024 / 1536);
    x.imageSmoothingQuality = 'high'; x.drawImage(g.scene, 0, 0, c.width, c.height);
  }
  return c.toDataURL('image/png');
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg = await b.new_page(viewport={'width': 1440, 'height': 1000})
        await pg.goto((PKG / 'index.html').as_uri()); await pg.wait_for_function('window.inspectCrane', timeout=60000)
        await pg.evaluate('inspectCrane.pause(); inspectCrane.setLift(12)')
        for kind, name in [('compare', 'compare-zoom'), ('1388', 'lobby-desktop'), ('392', 'lobby-phone')]:
            shutil.rmtree(TMP, ignore_errors=True); TMP.mkdir()
            n = int(round(9.0 * 30))
            for i in range(n):
                d = await pg.evaluate(JS, [i / 30, kind])
                (TMP / f'{i:04d}.png').write_bytes(base64.b64decode(d.split(',')[1]))
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(TMP / '%04d.png'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
                            '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-movflags', '+faststart', str(OUT / f'{name}.mp4')], check=True)
            print(name, n, 'frames')
        await b.close()
asyncio.run(main())

import asyncio, base64, subprocess, sys, shutil
from pathlib import Path
from playwright.async_api import async_playwright
PKG = Path(sys.argv[1]); OUT = PKG / 'videos'; OUT.mkdir(exist_ok=True)
TMP = Path('/tmp/gearframes')
JS = r"""([t, kind]) => {
  const g = window.inspectGear; g.seek(t);
  const [cx, cy, cw, ch] = g.CROP;
  const c = document.createElement('canvas'), x = c.getContext('2d');
  if (kind === 'zoom') { c.width = cw * 4 * 2 + 24; c.height = ch * 4 + 40; x.fillStyle = '#f8f5ee'; x.fillRect(0, 0, c.width, c.height);
    x.imageSmoothingEnabled = false; x.drawImage(g.map, cx, cy, cw, ch, 0, 40, cw * 4, ch * 4); x.drawImage(g.scene, cx, cy, cw, ch, cw * 4 + 24, 40, cw * 4, ch * 4);
    x.fillStyle = '#2b2440'; x.font = '24px sans-serif'; x.fillText('原始靜態', 8, 28); x.fillText('BP-01 動畫 ±4°', cw * 4 + 32, 28); }
  else { const w = kind === 'lobby' ? 1388 : 392; c.width = w; c.height = Math.round(w * 1024 / 1536); x.imageSmoothingQuality = 'high'; x.drawImage(g.scene, 0, 0, c.width, c.height); }
  return c.toDataURL('image/png');
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg = await b.new_page(viewport={'width': 1440, 'height': 1000})
        await pg.goto((PKG / 'index.html').as_uri()); await pg.wait_for_function('window.inspectGear', timeout=60000)
        await pg.evaluate('inspectGear.pause()')
        for kind, cycles in [('zoom', 3), ('lobby', 3), ('phone', 3)]:
            shutil.rmtree(TMP, ignore_errors=True); TMP.mkdir()
            n = int(round(2.8 * cycles * 30))
            for i in range(n):
                d = await pg.evaluate(JS, [i / 30, kind])
                (TMP / f'{i:04d}.png').write_bytes(base64.b64decode(d.split(',')[1]))
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(TMP / '%04d.png'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', str(OUT / f'bp01-{kind}.mp4')], check=True)
            print(kind, n, 'frames')
        await b.close()
asyncio.run(main())

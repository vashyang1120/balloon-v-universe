const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const {chromium, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const write = (dir, name, url) => fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));

async function run() {
  // Use a fixed 2D backend for byte-level comparisons across repeat draws.
  const browser = await chromium.launch({channel:'chrome',
    args:['--allow-file-access-from-files','--disable-accelerated-2d-canvas']});
  const profiles = [];
  try {
    for (const mobile of [false,true]) {
      const page = await browser.newPage(mobile ? devices['Pixel 7'] : {viewport:{width:1440,height:1050}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(url);
      await page.locator('body[data-ready=true]').waitFor({state:'attached'});
      await page.locator('#speaker-comparison summary').click();
      assert.equal(await page.locator('#speaker-comparison').getAttribute('open'), '');
      assert(await page.locator('#speaker-live').isVisible());
      const report = await page.evaluate(async () => {
        const lobby = window.inspectLobby;
        const {groups} = lobby.speakerState;
        const context = lobby.environment.getContext('2d');
        const pixels = () => context.getImageData(0,0,1536,1024).data;
        const button = document.querySelector('#speakers');
        const grab = (time, active) => {
          if ((button.getAttribute('aria-pressed') === 'true') !== active) button.click();
          lobby.render(time, 'none');
          return pixels();
        };
        const owner = new Uint8Array(1536*1024);
        const sample = document.createElement('canvas');
        sample.width=1536; sample.height=1024;
        const paint = sample.getContext('2d',{willReadFrequently:true});
        for (const [index,group] of groups.entries()) {
          paint.clearRect(0,0,1536,1024);
          paint.beginPath();
          group.clip.forEach(([x,y],i) => i ? paint.lineTo(x,y) : paint.moveTo(x,y));
          paint.closePath();
          paint.fill();
          const {data} = paint.getImageData(0,0,1536,1024);
          for (let p=0;p<owner.length;p++) if (data[p*4+3]) owner[p]=index+1;
        }
        const timings = [0,.025,.05,.09,.142,.195,.265,.32,.37,.41,.462,.515,.76,.84,.89,2.57,4.57,7.93];
        const frames = timings.map(time => {
          const inactive = grab(time,false);
          const active = grab(time,true);
          const counts = [0,0,0], stars = [0,0];
          let alpha = 0;
          for (let p=0;p<owner.length;p++) {
            let i = 4*p;
            if (inactive[i+3] !== active[i+3]) alpha++;
            if (inactive[i] === active[i] && inactive[i+1] === active[i+1] && inactive[i+2] === active[i+2]) continue;
            counts[owner[p]]++;
            if (owner[p] && Math.floor(p/1536) < [244,277][owner[p]-1]) stars[owner[p]-1]++;
          }
          return {time, outside: counts[0], left: counts[1], right: counts[2], stars, alpha};
        });
        const pose = (t, side) => LobbySpeakers.beatPose(t,envelope,pulseSettings,side);
        const period = pulseSettings.defaults[1];
        const loopDelta = Math.max(...timings.flatMap(t => [-1,1].flatMap(side =>
          Object.keys(pose(t,side)).map(key => Math.abs(pose(t,side)[key]-pose(t+period,side)[key])))));
        lobby.render(.37,'none');
        const elapsed = await new Promise(resolve => {
          document.querySelector('#play').click();
          let count = 0;
          const step = () => {if (++count === 35) resolve(count); else requestAnimationFrame(step);};
          requestAnimationFrame(step);
        });
        lobby.render(.05,'none');
        const live = document.querySelector('#speaker-live');
        const first = live.toDataURL();
        lobby.render(.37,'none');
        const second = live.toDataURL();
        return {frames, loopDelta, elapsed, differentPeaks: first !== second,
          matchesWidth: innerWidth === document.documentElement.scrollWidth,
          period, overlap: pulseSettings.defaults[2], leftPeak: pose(.05,-1),
          rightAtLeftPeak: pose(.05,1), rightPeak: pose(.37,1)};
      });
      assert(report.frames.every(frame => frame.outside === 0 && frame.alpha === 0));
      assert(report.frames.filter(frame => [.05,.37].includes(frame.time)).every(frame =>
        frame.left > 100 && frame.right > 100 && frame.stars.every(count => count > 40)));
      assert(report.frames.filter(frame => [0,.265,.32,.76,.84].includes(frame.time)).every(frame =>
        frame.left === 0 && frame.right === 0));
      assert(report.loopDelta < 1e-10 && report.elapsed === 35 && report.differentPeaks && report.matchesWidth);
      if (!mobile && process.env.SPEAKER_EXPORT) {
        const dir = path.join(__dirname,'speaker-assets');
        fs.mkdirSync(dir,{recursive:true});
        const groups = await page.evaluate(() => window.inspectLobby.speakerState.groups.map(
          group => ({id:group.id, sprite:group.sprite.toDataURL(), plate:group.plate.toDataURL()})));
        for (const group of groups) {
          write(dir,group.id+'-speaker-star.png',group.sprite);
          write(dir,group.id+'-background-repair.png',group.plate);
        }
        await page.screenshot({path:path.join(__dirname,'stage-comparison.png')});
        for (const time of [0,.05,.37]) {
          const image = await page.evaluate(time => {
            window.inspectLobby.render(time,'none');
            return document.querySelector('#speaker-live').toDataURL();
          },time);
          write(dir,'check-'+time+'.png',image);
        }
      }
      const before = await page.locator('#waterfalls').getAttribute('aria-pressed');
      await page.locator('#speakers').click();
      assert.equal(await page.locator('#speakers').getAttribute('aria-pressed'),'false');
      assert.equal(await page.locator('#waterfalls').getAttribute('aria-pressed'),before);
      assert.deepEqual(errors, []);
      profiles.push({profile:mobile?'Pixel 7 emulation':'Desktop Chrome', ...report, errors});
      await page.close();
    }
    console.log(JSON.stringify({chrome:browser.version(),profiles},null,2));
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode=1; });

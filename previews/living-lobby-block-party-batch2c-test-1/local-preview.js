"use strict";
(async () => {
  const CROP = [300, 236, 190, 150];               // 局部範圍（含 BP-02 手臂與周圍背景）
  const ARM_TIP = [[396, 286], [420, 290], [421, 324], [404, 334], [392, 318]]; // BP-02 末端（只作標記）
  const $ = id => document.getElementById(id);
  const status = $('status');
  const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  const map = await load(LobbyMapImage);
  const scene = document.createElement('canvas');
  scene.width = 1536; scene.height = 1024;
  const ctx = scene.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(map, 0, 0);
  const water = typeof LobbyWaterfalls === 'object' ? LobbyWaterfalls.prepare(map, map) : [];
  const gear = await LobbyGear.prepare(LobbyGearAssets);

  const views = {
    zoomOriginal: $('zoom-original').getContext('2d'), zoomLive: $('zoom-live').getContext('2d'),
    nativeOriginal: $('native-original').getContext('2d'), nativeLive: $('native-live').getContext('2d'),
    lobby: $('lobby').getContext('2d'), phone: $('phone').getContext('2d')
  };
  views.zoomOriginal.drawImage(map, ...CROP, 0, 0, CROP[2], CROP[3]);
  views.nativeOriginal.drawImage(map, ...CROP, 0, 0, CROP[2], CROP[3]);

  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gearOn = true, jointOn = false, elapsed = 0, last = performance.now();

  function overlay(id, live) {
    const o = $(id).getContext('2d');
    o.clearRect(0, 0, 950, 750);
    if (!jointOn) return;
    const s = 5, [cx, cy] = CROP;
    o.setLineDash([8, 6]); o.lineWidth = 3; o.strokeStyle = '#ff2f7a';
    o.beginPath(); ARM_TIP.forEach(([x, y], i) => i ? o.lineTo((x - cx) * s, (y - cy) * s) : o.moveTo((x - cx) * s, (y - cy) * s)); o.closePath(); o.stroke();
    o.setLineDash([]); o.strokeStyle = '#1e7bff'; o.lineWidth = 2;
    for (const [px, py] of [gear.gearPivot, gear.hubPivot]) {
      const x = (px - cx) * s, y = (py - cy) * s;
      o.beginPath(); o.moveTo(x - 12, y); o.lineTo(x + 12, y); o.moveTo(x, y - 12); o.lineTo(x, y + 12); o.stroke();
    }
    if (live) {
      o.fillStyle = '#2b2440'; o.font = '22px system-ui';
      o.fillText(`角度 ${(LobbyGear.angle(gear, elapsed) * 180 / Math.PI).toFixed(2)}°`, 12, 30);
    }
  }

  function render(seconds) {
    if (water.length) LobbyWaterfalls.paint(ctx, water, seconds);
    if (gearOn) LobbyGear.paint(ctx, gear, seconds);
    else LobbyGear.paint(ctx, gear, 0);
    views.zoomLive.drawImage(scene, ...CROP, 0, 0, CROP[2], CROP[3]);
    views.nativeLive.drawImage(scene, ...CROP, 0, 0, CROP[2], CROP[3]);
    views.lobby.drawImage(scene, 0, 0);
    views.phone.drawImage(scene, 0, 0);
    overlay('overlay-original', false);
    overlay('overlay-live', true);
  }

  function frame(now) {
    if (playing) elapsed += Math.min(.1, (now - last) / 1000);
    last = now;
    render(elapsed);
    requestAnimationFrame(frame);
  }

  $('play').onclick = e => { playing = !playing; e.target.setAttribute('aria-pressed', playing); e.target.textContent = playing ? '暫停' : '播放'; };
  $('amplitude').onchange = e => { gear.settings.amplitudeDegrees = Number(e.target.value); };
  $('hub').onchange = e => { gear.settings.hubFollows = e.target.value === 'follow'; };
  $('gear-toggle').onclick = e => { gearOn = !gearOn; e.target.setAttribute('aria-pressed', gearOn); e.target.textContent = gearOn ? '齒輪動態：開' : '齒輪動態：關'; };
  $('joint').onclick = e => { jointOn = !jointOn; e.target.setAttribute('aria-pressed', jointOn); };
  $('pixel').onclick = e => { const on = $('zoom-pair').classList.toggle('pixel'); e.target.setAttribute('aria-pressed', on); };
  document.querySelectorAll('button,select').forEach(el => el.disabled = false);
  if (!playing) { $('play').textContent = '播放'; $('play').setAttribute('aria-pressed', 'false'); }
  status.textContent = '';

  window.inspectGear = {
    map, scene, gear, water, CROP,
    pause() { playing = false; },
    seek(t) { elapsed = t; render(t); },
    setGear(on) { gearOn = on; }
  };
  requestAnimationFrame(frame);
})().catch(error => {
  document.getElementById('status').textContent = '載入失敗：' + error.message;
  throw error;
});

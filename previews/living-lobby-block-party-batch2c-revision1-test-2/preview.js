"use strict";
(async () => {
  const CROP = [296, 236, 206, 296];
  const $ = id => document.getElementById(id);
  const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  const map = await load(LobbyMapImage);
  const state = await LobbyCrane.prepare(LobbyArmAssets);
  const scene = document.createElement('canvas');
  scene.width = 1536; scene.height = 1024;
  const ctx = scene.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(map, 0, 0);
  const water = typeof LobbyWaterfalls === 'object' ? LobbyWaterfalls.prepare(map, map) : [];
  const c2 = id => $(id).getContext('2d');
  c2('zoom-original').drawImage(map, ...CROP, 0, 0, CROP[2], CROP[3]);
  c2('phone-original').drawImage(map, 0, 0);

  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let marks = false, elapsed = 0, last = performance.now();

  function overlay() {
    const o = c2('overlay'), s = 3, [cx, cy] = CROP;
    o.clearRect(0, 0, 618, 888);
    if (!marks) return;
    const g = state.geometry, p = LobbyCrane.pose(state, elapsed);
    const X = v => (v[0] - cx) * s, Y = v => (v[1] - cy) * s;
    const cross = v => { o.strokeStyle = '#1e7bff'; o.lineWidth = 3; o.beginPath(); o.moveTo(X(v) - 11, Y(v)); o.lineTo(X(v) + 11, Y(v)); o.moveTo(X(v), Y(v) - 11); o.lineTo(X(v), Y(v) + 11); o.stroke(); };
    cross(g.S); cross(p.E); cross([g.G[0], g.G[1] - p.lift]);
    o.fillStyle = '#ff2f7a'; o.beginPath(); o.arc(X(p.P), Y(p.P), 7, 0, 7); o.fill(); o.strokeStyle = 'white'; o.lineWidth = 2; o.stroke();
    o.fillStyle = '#2b2440'; o.font = '22px system-ui';
    o.fillText(`吊起 ${p.lift.toFixed(1)} px　齒輪 ${(p.gear * 180 / Math.PI).toFixed(1)}°　主臂 ${(p.boom * 180 / Math.PI).toFixed(1)}°`, 10, 876);
  }

  function render(seconds) {
    if (water.length) LobbyWaterfalls.paint(ctx, water, seconds);
    LobbyCrane.paint(ctx, state, seconds);
    c2('zoom-live').drawImage(scene, ...CROP, 0, 0, CROP[2], CROP[3]);
    c2('lobby').drawImage(scene, 0, 0);
    c2('phone-live').drawImage(scene, 0, 0);
    overlay();
  }

  function frame(now) {
    if (playing) elapsed += Math.min(.1, (now - last) / 1000);
    last = now;
    render(elapsed);
    requestAnimationFrame(frame);
  }

  const playButton = $('play');
  const syncPlay = () => { playButton.textContent = playing ? '暫停' : '播放'; playButton.setAttribute('aria-pressed', String(!playing)); };
  playButton.onclick = () => { playing = !playing; syncPlay(); };
  $('replay').onclick = () => { elapsed = 0; playing = true; syncPlay(); };
  document.querySelectorAll('.lift').forEach(button => button.onclick = () => {
    state.settings.liftPx = Number(button.dataset.lift);
    document.querySelectorAll('.lift').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  });
  $('marks').onclick = e => { marks = !marks; e.currentTarget.setAttribute('aria-pressed', String(marks)); };
  $('pixel').onclick = e => { const on = $('zoom-grid').classList.toggle('pixel'); e.currentTarget.setAttribute('aria-pressed', String(on)); };
  document.querySelectorAll('button').forEach(b => b.disabled = false);
  syncPlay();
  $('status').textContent = '';

  window.inspectCrane = {
    map, state, scene, CROP,
    pause() { playing = false; syncPlay(); },
    seek(t) { elapsed = t; render(t); },
    setLift(px) { state.settings.liftPx = px; render(elapsed); },
    setMarks(on) { marks = on; render(elapsed); }
  };
  requestAnimationFrame(frame);
})().catch(error => {
  document.getElementById('status').textContent = '載入失敗：' + error.message;
  throw error;
});

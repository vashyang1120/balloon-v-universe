"use strict";
(async () => {
  const CROP = [300, 240, 190, 160];
  const $ = id => document.getElementById(id);
  const load = src => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  const map = await load(LobbyMapImage);
  const states = {A: await LobbyArm.prepare(LobbyArmAssets, 'A'), B: await LobbyArm.prepare(LobbyArmAssets, 'B')};
  const scenes = {};
  for (const key of ['A', 'B']) {
    const canvas = document.createElement('canvas');
    canvas.width = 1536; canvas.height = 1024;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    ctx.drawImage(map, 0, 0);
    scenes[key] = {canvas, ctx, water: typeof LobbyWaterfalls === 'object' ? LobbyWaterfalls.prepare(map, map) : []};
  }
  const ctx2d = id => $(id).getContext('2d');
  ctx2d('zoom-original').drawImage(map, ...CROP, 0, 0, CROP[2], CROP[3]);
  ctx2d('phone-original').drawImage(map, 0, 0);

  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let marks = false, elapsed = 0, last = performance.now();

  function overlay(key) {
    const o = ctx2d('overlay-' + key), s = 4, [cx, cy] = CROP;
    o.clearRect(0, 0, 760, 640);
    if (!marks) return;
    const st = states[key], g = st.geometry, p = LobbyArm.pose(st, elapsed);
    const X = v => (v[0] - cx) * s, Y = v => (v[1] - cy) * s;
    const cross = (v, color) => { o.strokeStyle = color; o.lineWidth = 3; o.beginPath(); o.moveTo(X(v) - 12, Y(v)); o.lineTo(X(v) + 12, Y(v)); o.moveTo(X(v), Y(v) - 12); o.lineTo(X(v), Y(v) + 12); o.stroke(); };
    const dot = (v, color) => { o.fillStyle = color; o.beginPath(); o.arc(X(v), Y(v), 7, 0, 7); o.fill(); o.strokeStyle = 'white'; o.lineWidth = 2; o.stroke(); };
    if (key === 'A') {
      const a = st.settings.slotDegrees * Math.PI / 180, d = 14;
      o.setLineDash([8, 6]); o.strokeStyle = '#6b6b6b'; o.lineWidth = 3; o.beginPath();
      o.moveTo(X([g.P0[0] - d * Math.cos(a), g.P0[1] - d * Math.sin(a)]), Y([g.P0[0] - d * Math.cos(a), g.P0[1] - d * Math.sin(a)]));
      o.lineTo(X([g.P0[0] + d * Math.cos(a), g.P0[1] + d * Math.sin(a)]), Y([g.P0[0] + d * Math.cos(a), g.P0[1] + d * Math.sin(a)]));
      o.stroke(); o.setLineDash([]);
    }
    cross(g.S, '#1e7bff'); cross(p.E, '#1e7bff'); cross(g.G, '#1e7bff');
    dot(p.P, '#ff2f7a'); dot(p.tie, '#13a35b');
    o.fillStyle = '#2b2440'; o.font = '22px system-ui';
    o.fillText(`主臂 ${(p.boom * 180 / Math.PI).toFixed(1)}°　齒輪 ${(p.gear * 180 / Math.PI).toFixed(1)}°`, 10, 628);
  }

  function render(seconds) {
    for (const key of ['A', 'B']) {
      const sc = scenes[key];
      if (sc.water.length) LobbyWaterfalls.paint(sc.ctx, sc.water, seconds);
      LobbyArm.paint(sc.ctx, states[key], seconds);
      ctx2d('zoom-' + key).drawImage(sc.canvas, ...CROP, 0, 0, CROP[2], CROP[3]);
      ctx2d('lobby-' + key).drawImage(sc.canvas, 0, 0);
      ctx2d('phone-' + key).drawImage(sc.canvas, 0, 0);
      overlay(key);
    }
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
  $('marks').onclick = e => { marks = !marks; e.currentTarget.setAttribute('aria-pressed', String(marks)); };
  $('pixel').onclick = e => { const on = $('zoom-grid').classList.toggle('pixel'); e.currentTarget.setAttribute('aria-pressed', String(on)); };
  document.querySelectorAll('button').forEach(b => b.disabled = false);
  syncPlay();
  $('status').textContent = '';

  window.inspectArm = {
    map, states, scenes, CROP,
    pause() { playing = false; syncPlay(); },
    seek(t) { elapsed = t; render(t); },
    setMarks(on) { marks = on; render(elapsed); }
  };
  requestAnimationFrame(frame);
})().catch(error => {
  document.getElementById('status').textContent = '載入失敗：' + error.message;
  throw error;
});

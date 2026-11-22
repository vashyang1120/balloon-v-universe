"use strict";
/* Living Lobby Art v1.0｜Batch 2-C Revision 1 Test 1
   BP-02 粉紅機械手臂＋BP-01 黃色齒輪：兩種方案。

   原圖結構（見 HANDOFF）：肩部紅色圓環（固定在屋頂）→ 雙管主臂 → 肘部圓頭（藍色鉚釘＝肘關節）
   → 前臂 → 插入齒輪左上瓣後方 → 齒輪裝在固定的黃色支柱塔上。
   兩端都被固定，所以手臂要動，前臂末端一定要能在齒輪處移動：
     方案 A：齒輪靜止，前臂末端在齒輪後方的隱藏滑槽中滑動（主臂繞肩部擺動，雙向）。
     方案 B：齒輪轉動，前臂末端的銷釘跟著齒輪走（四連桿；主臂、肘部被齒輪帶動，單向往返）。
   每個零件都是剛體，只做旋轉／平移，沒有伸縮。只改寫遮罩內的 RGB，保留畫布原本的 Alpha。 */
const LobbyArm = (() => {
  const schemes = {
    A: {label: '方案 A｜手臂擺動', boomDegrees: 4.5, periodSeconds: 3.6, slotDegrees: -20},
    B: {label: '方案 B｜齒輪驅動', gearDegrees: 18, periodSeconds: 3.2}
  };

  const load = src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

  async function prepare(assets = LobbyArmAssets, scheme = 'A', options = {}) {
    const names = ['plate', 'boom', 'coupler', 'torus', 'gear', 'hub', 'mask'];
    const images = Object.fromEntries(await Promise.all(names.map(async n => [n, await load(assets.images[n])])));
    const L = assets.layout;
    const [x, y, width, height] = L.rectXYWH;
    const frame = document.createElement('canvas');
    frame.width = width; frame.height = height;
    const paint = frame.getContext('2d', {willReadFrequently: true});
    paint.drawImage(images.mask, 0, 0);
    const maskData = paint.getImageData(0, 0, width, height).data;
    const indices = [];
    for (let i = 0; i < width * height; i++) if (maskData[i * 4 + 3]) indices.push(i * 4);
    const S = L.shoulderXY, E0 = L.elbowXY, P0 = L.pinXY, G = L.gearPivotXY;
    return {
      x, y, width, height, images, frame, paint, mask: Int32Array.from(indices), layout: L,
      geometry: {
        S, E0, P0, G, H: L.hubPivotXY, T0: L.bp04TieXY,
        L1: Math.hypot(E0[0] - S[0], E0[1] - S[1]),
        L2: Math.hypot(P0[0] - E0[0], P0[1] - E0[1]),
        R: Math.hypot(P0[0] - G[0], P0[1] - G[1])
      },
      scheme, settings: {...schemes[scheme], ...options}
    };
  }

  const rotate = ([vx, vy], a) => [vx * Math.cos(a) - vy * Math.sin(a), vx * Math.sin(a) + vy * Math.cos(a)];
  const angleOf = ([vx, vy]) => Math.atan2(vy, vx);

  // 方案 A：主臂角度為正弦（雙向，端點自然減速）；前臂末端沿隱藏滑槽移動，齒輪不動。
  function poseA(state, seconds) {
    const g = state.geometry, s = state.settings;
    const boom = s.boomDegrees * Math.PI / 180 * Math.sin(2 * Math.PI * seconds / s.periodSeconds);
    const [ex, ey] = rotate([g.E0[0] - g.S[0], g.E0[1] - g.S[1]], boom);
    const E = [g.S[0] + ex, g.S[1] + ey];
    const slot = s.slotDegrees * Math.PI / 180, t = [Math.cos(slot), Math.sin(slot)];
    const w = [E[0] - g.P0[0], E[1] - g.P0[1]];
    const b = t[0] * w[0] + t[1] * w[1], c = w[0] * w[0] + w[1] * w[1] - g.L2 * g.L2;
    const disc = Math.max(0, b * b - c);
    const r1 = b + Math.sqrt(disc), r2 = b - Math.sqrt(disc);
    const slide = Math.abs(r1) < Math.abs(r2) ? r1 : r2;
    const P = [g.P0[0] + slide * t[0], g.P0[1] + slide * t[1]];
    const coupler = angleOf([P[0] - E[0], P[1] - E[1]]) - angleOf([g.P0[0] - g.E0[0], g.P0[1] - g.E0[1]]);
    return {boom, coupler, gear: 0, E, P, slide};
  }

  // 方案 B：齒輪角度 0 → 最大 → 0（餘弦緩入緩出）；銷釘隨齒輪走，主臂與肘部依四連桿解出。
  function poseB(state, seconds) {
    const g = state.geometry, s = state.settings;
    const gear = s.gearDegrees * Math.PI / 180 * (1 - Math.cos(2 * Math.PI * seconds / s.periodSeconds)) / 2;
    const [px, py] = rotate([g.P0[0] - g.G[0], g.P0[1] - g.G[1]], gear);
    const P = [g.G[0] + px, g.G[1] + py];
    const d = Math.hypot(P[0] - g.S[0], P[1] - g.S[1]);
    const a = (g.L1 * g.L1 - g.L2 * g.L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, g.L1 * g.L1 - a * a));
    const m = [g.S[0] + a * (P[0] - g.S[0]) / d, g.S[1] + a * (P[1] - g.S[1]) / d];
    const n = [-(P[1] - g.S[1]) / d, (P[0] - g.S[0]) / d];
    const c1 = [m[0] + h * n[0], m[1] + h * n[1]], c2 = [m[0] - h * n[0], m[1] - h * n[1]];
    const dist = q => Math.hypot(q[0] - g.E0[0], q[1] - g.E0[1]);
    const E = dist(c1) < dist(c2) ? c1 : c2;
    const boom = angleOf([E[0] - g.S[0], E[1] - g.S[1]]) - angleOf([g.E0[0] - g.S[0], g.E0[1] - g.S[1]]);
    const coupler = angleOf([P[0] - E[0], P[1] - E[1]]) - angleOf([g.P0[0] - g.E0[0], g.P0[1] - g.E0[1]]);
    return {boom, coupler, gear, E, P};
  }

  function pose(state, seconds) {
    const p = state.scheme === 'B' ? poseB(state, seconds) : poseA(state, seconds);
    const g = state.geometry;
    const [tx, ty] = rotate([g.T0[0] - g.E0[0], g.T0[1] - g.E0[1]], p.coupler);
    p.tie = [p.E[0] + tx, p.E[1] + ty];  // BP-04 繩尾所在的肘部位置（量測用）
    return p;
  }

  function draw(ctx, image, x, y, pivot, radians, offset = [0, 0]) {
    // 靜止姿勢（含浮點誤差）直接原位繪製，確保與原圖逐像素相同
    if (Math.abs(radians) < 1e-9 && Math.abs(offset[0]) < 1e-9 && Math.abs(offset[1]) < 1e-9) { ctx.drawImage(image, 0, 0); return; }
    const px = pivot[0] - x, py = pivot[1] - y;
    ctx.save();
    ctx.translate(px + offset[0], py + offset[1]);
    ctx.rotate(radians);
    ctx.translate(-px, -py);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  function render(state, seconds) {
    const {paint, x, y, width, height, images, geometry: g} = state;
    const p = pose(state, seconds);
    paint.imageSmoothingEnabled = true;
    paint.imageSmoothingQuality = 'high';
    paint.clearRect(0, 0, width, height);
    paint.drawImage(images.plate, 0, 0);
    draw(paint, images.boom, x, y, g.S, p.boom);
    draw(paint, images.coupler, x, y, g.E0, p.coupler, [p.E[0] - g.E0[0], p.E[1] - g.E0[1]]);
    paint.drawImage(images.torus, 0, 0);
    draw(paint, images.gear, x, y, g.G, p.gear);
    draw(paint, images.hub, x, y, g.H, p.gear);
    return paint.getImageData(0, 0, width, height).data;
  }

  function paintInto(ctx, state, seconds) {
    const source = render(state, seconds);
    const target = ctx.getImageData(state.x, state.y, state.width, state.height);
    const out = target.data;
    for (const at of state.mask) {
      out[at] = source[at]; out[at + 1] = source[at + 1]; out[at + 2] = source[at + 2];
    }
    ctx.putImageData(target, state.x, state.y);
  }

  return {schemes, prepare, pose, render, paint: paintInto};
})();

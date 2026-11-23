"use strict";
/* Living Lobby Art v1.0｜Batch 2-C Revision 1 Integration Test 1｜吊臂搬運
   動作與 Test 2（b40f9b2）完全相同，只改為從 assets/living-lobby/crane/ 載入圖層。
   預覽用網址參數：?craneLift=10、12（預設）、15；?craneLift=0 關閉吊臂（比對用）。
   正式版合成方式：吊臂在自己的小畫布合成、以遮罩裁切後直接貼上，不讀回大廳畫布像素。
   ② 黃色齒輪＋③ 支柱塔＋④ 粉紅大方塊為一組，被機械手臂垂直吊起再放下；吊起時齒輪同時轉動（像捲揚機）。
   ① 粉紅手臂：肩部圓環固定，主臂繞軸孔轉動，肘部以藍色鉚釘為關節，前臂末端銷釘固定在齒輪上（四連桿）。
   ⑤ 彩色方塊堆與左側黃色方塊柱是固定前景，永遠畫在大方塊前面。
   每個零件都是剛體，只做旋轉／平移，沒有伸縮。只改寫遮罩內的 RGB，保留畫布原本的 Alpha。 */
const LobbyCrane = (() => {
  const assetBase = new URL(".", document.currentScript.src);
  const liftOptions = [10, 12, 15];
  const requested = new URLSearchParams(location.search).get("craneLift");
  const enabled = requested !== "0";
  const chosenLift = liftOptions.includes(Number(requested)) ? Number(requested) : 12;
  const defaults = {
    liftPx: 12,              // 吊起高度（原圖像素；已驗收選項 10／12／15）
    gearDegreesPerPx: -1.25, // 每吊起 1 px 齒輪轉動的角度（負值＝畫面逆時針）
    holdDown: .6, rise: 1.7, holdUp: .5, lower: 1.7  // 秒：放著 → 吊起 → 停在高處 → 放下
  };

  const load = src => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = new URL(src, assetBase).href;
  });

  async function prepare(assets = LobbyArmAssets, options = {}) {
    if (!enabled) return null;
    options = {liftPx: chosenLift, ...options};
    const names = ['plate', 'boom', 'coupler', 'torus', 'load', 'gear', 'hub', 'front', 'mask'];
    const images = Object.fromEntries(await Promise.all(names.map(async n => [n, await load(assets.images[n])])));
    const L = assets.layout;
    const [x, y, width, height] = L.rectXYWH;
    const frame = document.createElement('canvas');
    frame.width = width; frame.height = height;
    const paint = frame.getContext('2d');
    const probe = document.createElement('canvas');  // 只在載入時讀一次遮罩（供檢查工具使用）
    probe.width = width; probe.height = height;
    const probeContext = probe.getContext('2d', {willReadFrequently: true});
    probeContext.drawImage(images.mask, 0, 0);
    const maskData = probeContext.getImageData(0, 0, width, height).data;
    const indices = [];
    for (let i = 0; i < width * height; i++) if (maskData[i * 4 + 3]) indices.push(i * 4);
    const S = L.shoulderXY, E0 = L.elbowXY, P0 = L.pinXY, G = L.gearPivotXY;
    return {
      x, y, width, height, images, frame, paint, mask: Int32Array.from(indices), layout: L,
      geometry: {S, E0, P0, G, H: L.hubPivotXY, T0: L.bp04TieXY,
        L1: Math.hypot(E0[0] - S[0], E0[1] - S[1]), L2: Math.hypot(P0[0] - E0[0], P0[1] - E0[1])},
      settings: {...defaults, ...options}
    };
  }

  const period = s => s.holdDown + s.rise + s.holdUp + s.lower;
  const ease = u => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;

  // 0 → 1 → 0：靜止、緩緩吊起、停在高處、緩緩放下（端點速度為零，沒有突然加速或停止）
  function liftFraction(s, seconds) {
    const P = period(s);
    let t = ((seconds % P) + P) % P;
    if (t < s.holdDown) return 0;
    t -= s.holdDown;
    if (t < s.rise) return ease(t / s.rise);
    t -= s.rise;
    if (t < s.holdUp) return 1;
    t -= s.holdUp;
    return 1 - ease(t / s.lower);
  }

  const rotate = ([vx, vy], a) => [vx * Math.cos(a) - vy * Math.sin(a), vx * Math.sin(a) + vy * Math.cos(a)];
  const angleOf = ([vx, vy]) => Math.atan2(vy, vx);

  function pose(state, seconds) {
    const g = state.geometry, s = state.settings;
    const f = liftFraction(s, seconds);
    const lift = s.liftPx * f;
    const gear = s.gearDegreesPerPx * lift * Math.PI / 180;
    const center = [g.G[0], g.G[1] - lift];
    const [px, py] = rotate([g.P0[0] - g.G[0], g.P0[1] - g.G[1]], gear);
    const P = [center[0] + px, center[1] + py];
    const d = Math.hypot(P[0] - g.S[0], P[1] - g.S[1]);
    const a = (g.L1 * g.L1 - g.L2 * g.L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, g.L1 * g.L1 - a * a));
    const m = [g.S[0] + a * (P[0] - g.S[0]) / d, g.S[1] + a * (P[1] - g.S[1]) / d];
    const n = [-(P[1] - g.S[1]) / d, (P[0] - g.S[0]) / d];
    const c1 = [m[0] + h * n[0], m[1] + h * n[1]], c2 = [m[0] - h * n[0], m[1] - h * n[1]];
    const near = q => Math.hypot(q[0] - g.E0[0], q[1] - g.E0[1]);
    const E = near(c1) < near(c2) ? c1 : c2;
    const boom = angleOf([E[0] - g.S[0], E[1] - g.S[1]]) - angleOf([g.E0[0] - g.S[0], g.E0[1] - g.S[1]]);
    const coupler = angleOf([P[0] - E[0], P[1] - E[1]]) - angleOf([g.P0[0] - g.E0[0], g.P0[1] - g.E0[1]]);
    const [tx, ty] = rotate([g.T0[0] - g.E0[0], g.T0[1] - g.E0[1]], coupler);
    return {fraction: f, lift, gear, boom, coupler, E, P, margin: g.L1 + g.L2 - d, tie: [E[0] + tx, E[1] + ty]};
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
    const up = [0, -p.lift];
    paint.imageSmoothingEnabled = true;
    paint.imageSmoothingQuality = 'high';
    paint.clearRect(0, 0, width, height);
    paint.drawImage(images.plate, 0, 0);
    draw(paint, images.boom, x, y, g.S, p.boom);
    draw(paint, images.coupler, x, y, g.E0, p.coupler, [p.E[0] - g.E0[0], p.E[1] - g.E0[1]]);
    paint.drawImage(images.torus, 0, 0);
    draw(paint, images.load, x, y, g.G, 0, up);
    draw(paint, images.gear, x, y, g.G, p.gear, up);
    draw(paint, images.hub, x, y, g.H, p.gear, up);
    paint.drawImage(images.front, 0, 0);
    // 只保留遮罩內的像素；遮罩為 0／255 二值，修補底圖與各圖層皆不透明，貼上後 RGB 與合成結果逐像素相同
    paint.globalCompositeOperation = 'destination-in';
    paint.drawImage(images.mask, 0, 0);
    paint.globalCompositeOperation = 'source-over';
    return state.frame;
  }

  // 正式大廳版：不從大廳畫布讀回像素（避免 GPU 同步讀取），直接把裁好的吊臂畫面貼上。
  // 此時大廳畫布的 Alpha 為 255（background），之後才由 engine 套用地圖 Alpha。
  function paintInto(ctx, state, seconds) {
    ctx.drawImage(render(state, seconds), state.x, state.y);
  }

  return {defaults, period, liftFraction, prepare, pose, render, paint: paintInto};
})();

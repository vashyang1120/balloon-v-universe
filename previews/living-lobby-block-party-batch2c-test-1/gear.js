"use strict";
/* Living Lobby Art v1.0｜Batch 2-C Test 1
   BP-01 黃色齒輪狀關節：小角度往復旋轉。
   圖層全部取自原始地圖（見 gear-assets.js / gear-assets/）。粉紅機械手臂 BP-02 不在任何動畫圖層內。
   只改寫遮罩內的 RGB，保留畫布原本的 Alpha；遮罩外像素完全不碰。 */
const LobbyGear = (() => {
  const defaults = {
    amplitudeDegrees: 4,   // 往復幅度 ±4°（測試值）
    periodSeconds: 2.8,    // 一個來回 2.8 秒
    hubFollows: true       // true：前方輪轂與後方齒輪同軸同步；false：只轉後方齒輪
  };

  function load(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function prepare(assets = LobbyGearAssets, options = {}) {
    const [plate, gear, hub, maskImage] = await Promise.all(
      ['plate', 'gear', 'hub', 'mask'].map(key => load(assets.images[key])));
    const [x, y, width, height] = assets.layout.rectXYWH;
    const frame = document.createElement('canvas');
    frame.width = width;
    frame.height = height;
    const paint = frame.getContext('2d', {willReadFrequently: true});
    paint.drawImage(maskImage, 0, 0);
    const maskData = paint.getImageData(0, 0, width, height).data;
    const indices = [];
    for (let i = 0; i < width * height; i++) if (maskData[i * 4 + 3]) indices.push(i * 4);
    return {
      x, y, width, height, plate, gear, hub, frame, paint,
      mask: Int32Array.from(indices),
      gearPivot: assets.layout.gearPivotXY,
      hubPivot: assets.layout.hubPivotXY,
      settings: {...defaults, ...options}
    };
  }

  // 正弦往復：端點自然減速、平順回到原角度，沒有停頓或彈跳。
  function angle(state, seconds) {
    const {amplitudeDegrees, periodSeconds} = state.settings;
    return amplitudeDegrees * Math.PI / 180 * Math.sin(2 * Math.PI * seconds / periodSeconds);
  }

  function drawRotated(context, image, pivot, x, y, radians) {
    if (radians === 0) {
      context.drawImage(image, 0, 0);
      return;
    }
    const px = pivot[0] - x, py = pivot[1] - y;
    context.save();
    context.translate(px, py);
    context.rotate(radians);
    context.translate(-px, -py);
    context.drawImage(image, 0, 0);
    context.restore();
  }

  function render(state, seconds) {
    const {paint, x, y, width, height} = state;
    const radians = angle(state, seconds);
    paint.imageSmoothingEnabled = true;
    paint.imageSmoothingQuality = 'high';
    paint.clearRect(0, 0, width, height);
    paint.drawImage(state.plate, 0, 0);
    drawRotated(paint, state.gear, state.gearPivot, x, y, radians);
    drawRotated(paint, state.hub, state.hubPivot, x, y, state.settings.hubFollows ? radians : 0);
    return paint.getImageData(0, 0, width, height).data;
  }

  function paintInto(ctx, state, seconds) {
    const source = render(state, seconds);
    const target = ctx.getImageData(state.x, state.y, state.width, state.height);
    const out = target.data;
    for (const at of state.mask) {
      out[at] = source[at];
      out[at + 1] = source[at + 1];
      out[at + 2] = source[at + 2];
    }
    ctx.putImageData(target, state.x, state.y);
  }

  return {defaults, prepare, angle, render, paint: paintInto};
})();

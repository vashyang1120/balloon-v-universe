/* Source-space coordinates, in pixels on universe_map_bg.png (1536 × 1024). */
const LobbyWaterfall = (() => {
  const region = { x: 74, y: 592, width: 251, height: 224 };
  const loopSeconds = 4.8;
  const tau = 2 * Math.PI;
  const streams = [
    { edge: [[178,650],[187,641],[200,638],[198,649],[192,669],[190,696],[189,711],[169,711],[169,691],[172,669]],
      travel: 32, cycles: 4, phase: .10 },
    { edge: [[202,642],[212,639],[209,656],[205,674],[204,695],[203,719],[187,718],[188,691],[192,673],[195,655]],
      travel: 38, cycles: 4, phase: .63 },
    { edge: [[222,643],[232,641],[235,645],[228,659],[222,677],[220,704],[221,720],[207,719],[208,692],[211,672],[216,655]],
      travel: 35, cycles: 5, phase: .34 },
    { edge: [[245,644],[256,639],[253,655],[250,675],[249,702],[251,722],[229,721],[228,702],[229,681],[234,662]],
      travel: 42, cycles: 4, phase: .86 }
  ];
  const foam = [[174,710],[193,711],[219,713],[241,714],[255,718],[267,725],[278,732],[275,743],[251,746],[231,746],[214,741],[196,738],[189,724]];
  const ripples = [[203,742],[223,748],[251,749],[269,747],[271,751],[260,759],[244,760],[226,757],[215,752]];

  function edgeDistance(x, y, polygon) {
    let inside = false;
    let distance = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, ay] = polygon[j];
      const [bx, by] = polygon[i];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax;
      const dy = by - ay;
      const portion = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      distance = Math.min(distance, Math.hypot(x - ax - portion * dx, y - ay - portion * dy));
    }
    return inside ? distance : 0;
  }

  function smooth(value) {
    const unit = Math.max(0, Math.min(1, value));
    return unit * unit * (3 - 2 * unit);
  }

  function create(map) {
    if (map.naturalWidth !== 1536 || map.naturalHeight !== 1024) throw new Error('地圖尺寸與驗收基準不符');
    const { x, y, width, height } = region;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(map, x, y, width, height, 0, 0, width, height);
    const source = ctx.getImageData(0, 0, width, height);
    const frame = ctx.createImageData(width, height);
    frame.data.set(source.data);

    const active = [];
    const light = new Float32Array(width * height);
    const wet = new Float32Array(width * height);
    const mask = new Uint8Array(width * height);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const pixel = row * width + col;
        const p = pixel * 4;
        const [red, green, blue] = source.data.subarray(p, p + 3);
        light[pixel] = .24 * red + .65 * green + .11 * blue;
        // Water is blue even in its bright core. This also excludes exposed brown rock and foliage.
        wet[pixel] = smooth((blue - red - 7) / 25) * smooth((blue - green + 1) / 12);
      }
    }
    const detail = new Float32Array(light.length);
    for (let pixel = 0; pixel < light.length; pixel++) {
      const offset = width * 6;
      const above = light[Math.max(pixel % width, pixel - offset)];
      const below = light[Math.min(light.length - width + pixel % width, pixel + offset)];
      detail[pixel] = (light[pixel] - (above + below) / 2) * wet[pixel];
    }

    function sampleDetail(column, row) {
      const first = Math.floor(row);
      const fraction = row - first;
      const start = first * width + column;
      return detail[start] * (1 - fraction) + detail[start + width] * fraction;
    }

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const pixel = row * width + col;
        const mapX = x + col + .5;
        const mapY = y + row + .5;
        const water = wet[pixel];
        const streamWeights = streams.map(stream => smooth(edgeDistance(mapX, mapY, stream.edge) / 6) * water);
        const foamWeight = smooth(edgeDistance(mapX, mapY, foam) / 7) * water;
        const rippleWeight = smooth(edgeDistance(mapX, mapY, ripples) / 5) * water;
        if (!streamWeights.some(Boolean) && !foamWeight && !rippleWeight) continue;
        mask[pixel] = 1;
        // Taper the stronger highlights before the original splash and ripple areas.
        const highlightStrength = 18 * smooth((710 - mapY) / 19);
        active.push({pixel, streamWeights, foamWeight, rippleWeight, highlightStrength, row, col});
      }
    }

    function render(seconds, enhanced = true) {
      const cycle = ((seconds / loopSeconds) % 1 + 1) % 1;
      for (const { pixel, streamWeights, foamWeight, rippleWeight, highlightStrength, row, col } of active) {
        let change = 0;
        for (let lane = 0; lane < streams.length; lane++) {
          const weight = streamWeights[lane];
          if (!weight) continue;
          const { travel, cycles, phase } = streams[lane];
          const progress = cycle * cycles + phase;
          const first = progress % 1;
          const second = (first + .5) % 1;
          const blend = .5 - .5 * Math.cos(tau * first);
          // Two downward samples blend out before wrapping. Fixed low-frequency color stays in place.
          const shifted = blend * sampleDetail(col, row - travel * (first - .5)) +
            (1 - blend) * sampleDetail(col, row - travel * (second - .5));
          const streak = Math.sin(tau * (row / travel - progress) + .36 * Math.sin(col * .48));
          const shimmer = Math.sin(tau * (row / (travel * .5) - 2 * progress) + col * .32);
          change += weight * (Math.max(-13, Math.min(13, (shifted - detail[pixel] * .36) * .67)) +
            (5.4 * streak + 2.5 * shimmer) * (.64 + .36 * Math.sin(col * .71) ** 2));
          // Boost the broad moving pattern so it survives downscaling, using the same phase and speed.
          if (enhanced) change += weight * highlightStrength * streak;
        }
        change += foamWeight * (4.8 * Math.sin(tau * (cycle * 3 - row / 11) + col * .23) +
          2.2 * Math.sin(tau * cycle * 5 + col * .47 + row * .27));
        change += rippleWeight * 3.6 * Math.sin(tau * (cycle * 2 - row / 5.7) + .5 * Math.cos(col * .21));
        const p = pixel * 4;
        frame.data[p] = source.data[p] + change;
        frame.data[p + 1] = source.data[p + 1] + change;
        frame.data[p + 2] = source.data[p + 2] + change;
      }
      return frame;
    }

    return { render, mask };
  }

  return { region, loopSeconds, create };
})();

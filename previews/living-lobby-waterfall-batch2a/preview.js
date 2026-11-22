const localButton = document.querySelector('#local');
const mapButton = document.querySelector('#map');
const originalButton = document.querySelector('#original');
const previousButton = document.querySelector('#previous');
const playButton = document.querySelector('#play');
const closeups = document.querySelector('#closeups');
const overview = document.querySelector('#overview');
const still = document.querySelector('#still').getContext('2d', { willReadFrequently: true });
const motion = document.querySelector('#motion').getContext('2d', { willReadFrequently: true });
const full = document.querySelector('#full').getContext('2d', { willReadFrequently: true });
const status = document.querySelector('#status');
const mapCaption = document.querySelector('#map-caption');
const mapImage = new Image();
let waterfall;
let mapMode = false;
let original = false;
let previous = false;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let elapsed = 0;
let lastTime = null;
let animation = null;

function paint(seconds) {
  if (mapMode && original) return;
  const animated = waterfall.render(seconds, !mapMode || !previous);
  if (mapMode) {
    const { x, y } = LobbyWaterfall.region;
    full.putImageData(animated, x, y);
  } else {
    motion.putImageData(animated, 0, 0);
  }
}

function syncPlayback() {
  playButton.textContent = playing ? '暫停' : '播放';
  if (playing && !document.hidden && (!mapMode || !original)) {
    if (animation === null) animation = requestAnimationFrame(tick);
  } else if (animation !== null) {
    cancelAnimationFrame(animation);
    animation = null;
    lastTime = null;
  }
}

function tick(now) {
  if (lastTime !== null) elapsed += Math.min((now - lastTime) / 1000, .1);
  lastTime = now;
  paint(elapsed);
  animation = requestAnimationFrame(tick);
}

function showMode(isMap) {
  mapMode = isMap;
  localButton.setAttribute('aria-pressed', String(!mapMode));
  mapButton.setAttribute('aria-pressed', String(mapMode));
  originalButton.hidden = !mapMode;
  previousButton.hidden = !mapMode || original;
  closeups.hidden = mapMode;
  overview.hidden = !mapMode;
  if (mapMode) {
    mapCaption.textContent = original ? '全圖 · 原始地圖' : `全圖 · 動態樣本 Test ${previous ? 1 : 2}`;
    full.clearRect(0, 0, full.canvas.width, full.canvas.height);
    full.drawImage(mapImage, 0, 0);
  }
  paint(elapsed);
  syncPlayback();
}

mapImage.onload = () => {
  try {
    const { x, y, width, height } = LobbyWaterfall.region;
    waterfall = LobbyWaterfall.create(mapImage);
    still.drawImage(mapImage, x, y, width, height, 0, 0, width, height);
    localButton.onclick = () => showMode(false);
    mapButton.onclick = () => showMode(true);
    originalButton.onclick = () => {
      original = !original;
      originalButton.setAttribute('aria-pressed', String(original));
      originalButton.textContent = original ? '切換到動態' : '切換到原圖';
      showMode(true);
    };
    previousButton.onclick = () => {
      previous = !previous;
      previousButton.setAttribute('aria-pressed', String(previous));
      previousButton.textContent = previous ? '回到 Test 2' : '對照 Test 1';
      showMode(true);
    };
    playButton.onclick = () => { playing = !playing; syncPlayback(); };
    document.addEventListener('visibilitychange', syncPlayback);
    status.hidden = true;
    playButton.disabled = false;
    showMode(false);
    document.body.dataset.ready = 'true';
  } catch (error) {
    status.textContent = error.message;
  }
};
mapImage.onerror = () => {
  status.textContent = '找不到驗收地圖。請完整解壓工程 ZIP 後再開啟 index.html。';
};
mapImage.src = document.currentScript.dataset.map || 'assets/universe_map_bg.png';

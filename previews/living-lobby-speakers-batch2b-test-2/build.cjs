const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) throw Error('Usage: node build.cjs <Integration Preview Test 2> <new preview directory>');
const source = path.resolve(sourceArg);
const target = path.resolve(targetArg);
if (source === target || fs.existsSync(path.join(target, 'index.html'))) {
  throw Error('Choose a fresh destination so the source and any existing preview stay intact.');
}
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(source, file))).digest('hex');
const expected = {
  'assets.js': '1b12b701bbc6ff3fe776663aae46bf9430f64698b8d2c301846761f916414853',
  'assets/universe_map_bg.png': '78c4885e61f71b4cb5c63680eed97a04c0023aed81f2e58ae839ff3ff913953f'
};
for (const [file, digest] of Object.entries(expected)) {
  if (sha256(file) !== digest) throw Error('Unexpected baseline: ' + file);
}

function edit(content, replacements) {
  for (const [before, after] of replacements) {
    if (content.split(before).length !== 2) throw Error('Unexpected baseline markup: ' + before);
    content = content.replace(before, after);
  }
  return content;
}
const read = file => fs.readFileSync(path.join(source, file), 'utf8').replace(/\r\n/g, '\n');
const html = edit(read('index.html'), [
  ['<title>氣球小V遊戲宇宙｜Integration Preview Test 2</title>', '<title>氣球小V遊戲宇宙｜Batch 2-B Test 2</title>'],
  ['<p>Universe Living Lobby v1.0｜Integration Preview Test 2</p>', '<p>Living Lobby Art v1.0｜Batch 2-B Test 2</p>'],
  ['</style>', `#speaker-comparison{margin:12px 0}
#speaker-comparison summary{width:fit-content;cursor:pointer;padding:8px 0}
.speaker-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:12px}
.speaker-pair figure{margin:0}
.speaker-pair canvas{display:block;width:100%;height:auto;border-radius:8px;background:#e1ecf2}
.speaker-pair figcaption{margin:4px 0}
@media(max-width:700px){.speaker-pair{grid-template-columns:1fr}}
</style>`],
  ['<div class="stage">', `<details id="speaker-comparison">
  <summary>放大比較音樂舞台</summary>
  <div class="speaker-pair">
    <figure><figcaption>原始靜態畫面</figcaption><canvas id="speaker-original" width="371" height="215" aria-label="音樂舞台原圖"></canvas></figure>
    <figure><figcaption>音響與音符動畫</figcaption><canvas id="speaker-live" width="371" height="215" aria-label="音樂舞台動態預覽"></canvas></figure>
  </div>
</details>
<div class="stage">`],
  ['  <button id="waterfalls"', '  <button id="speakers" type="button" aria-pressed="true" disabled>音響動態：開</button>\n  <button id="waterfalls"'],
  ['<script src="preview.js">', '<script src="speakers.js"></script>\n<script src="preview.js">']
]);
const js = edit(read('preview.js'), [
  ['  const waterfallToggle', `  const speakerState = LobbySpeakers.prepare(map);
  const speakerToggle = document.querySelector('#speakers');
  let speakersEnabled = true;
  speakerToggle.onclick = () => {
    speakersEnabled = !speakersEnabled;
    speakerToggle.setAttribute('aria-pressed', String(speakersEnabled));
    speakerToggle.textContent = speakersEnabled ? '音響動態：開' : '音響動態：關';
    render(elapsed, neutral);
  };
  speakerToggle.disabled = false;
  speakerState.comparison.addEventListener('toggle', () => LobbySpeakers.compare(speakerState, scene));
  const waterfallToggle`],
  ['      balloons.forEach', '      if (speakersEnabled) LobbySpeakers.paint(ctx, speakerState, seconds, envelope, pulseSettings);\n      balloons.forEach'],
  ['    updateCharacter();\n    display.clearRect', '    LobbySpeakers.compare(speakerState, scene);\n    updateCharacter();\n    display.clearRect'],
  ['    waterfallPatches,', '    waterfallPatches, speakerState,']
]);
fs.mkdirSync(target, {recursive:true});
for (const name of ['assets', 'assets.js', 'waterfall.js', 'waterfall-layouts.js', 'source-records', 'check.cjs']) {
  fs.cpSync(path.join(source, name), path.join(target, name), {recursive:true});
}
for (const name of ['HANDOFF.md','manifest.json']) {
  fs.copyFileSync(path.join(source,name), path.join(target,'source-records','waterfalls-integration-'+name));
}
fs.writeFileSync(path.join(target, 'index.html'), html);
fs.writeFileSync(path.join(target, 'preview.js'), js);
fs.writeFileSync(path.join(target, 'check-waterfalls.cjs'), edit(read('check-waterfalls.cjs'), [
  ['    const lobby = window.inspectLobby;', "    const lobby = window.inspectLobby;\n    document.querySelector('#speakers').click();"]
]));
for (const name of ['speakers.js','build.cjs','check-speakers.cjs','manifest.json','README.md','HANDOFF.md']) {
  const from = path.join(__dirname, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(target, name));
}

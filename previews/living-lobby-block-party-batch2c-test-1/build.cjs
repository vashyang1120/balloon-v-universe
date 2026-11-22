// Batch 2-C Test 1｜把 BP-01 齒輪接入 Batch 2-B Test 2 全場預覽的「獨立副本」。
// 用法：node build.cjs <解壓後的 Batch 2-B Test 2 目錄> <新的輸出目錄>
//       node build.cjs --dry-run <含 index.html、preview.js 的 Batch 2-B Test 2 目錄>
// 來源目錄完全不會被修改。熱氣球、旗幟、氣球束、角色、賊鷗、音響、瀑布的程式與素材逐檔照抄。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const args = process.argv.slice(2);
const dryRun = args[0] === '--dry-run';
const [sourceArg, targetArg] = dryRun ? args.slice(1) : args;
if (!sourceArg || (!dryRun && !targetArg)) throw Error('Usage: node build.cjs <Batch 2-B Test 2> <new preview directory>');
const source = path.resolve(sourceArg);
const sha256 = file => {
  let data = fs.readFileSync(path.join(source, file));
  if (/\.(js|html)$/.test(file)) data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));  // Windows 換行不影響比對
  return crypto.createHash('sha256').update(data).digest('hex');
};
const read = file => fs.readFileSync(path.join(source, file), 'utf8').replace(/\r\n/g, '\n');

// 已驗收 2-B Test 2 的檔案指紋：index.html、preview.js、speakers.js 取自 Git 3dc75c2b，assets.js 與地圖取自工程包基準。
const fingerprints = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline-fingerprints.json'), 'utf8'));
for (const [file, digest] of Object.entries(fingerprints)) {
  if (dryRun && !['index.html', 'preview.js', 'speakers.js'].includes(file)) continue;
  if (sha256(file) !== digest) throw Error('Unexpected baseline: ' + file);
}

function edit(content, replacements) {
  for (const [before, after] of replacements) {
    if (content.split(before).length !== 2) throw Error('Unexpected baseline markup: ' + before.slice(0, 60));
    content = content.replace(before, after);
  }
  return content;
}

const html = edit(read('index.html'), [
  ['<title>氣球小V遊戲宇宙｜Batch 2-B Test 2</title>', '<title>氣球小V遊戲宇宙｜Batch 2-C Test 1</title>'],
  ['<p>Living Lobby Art v1.0｜Batch 2-B Test 2</p>', '<p>Living Lobby Art v1.0｜Batch 2-C Test 1（BP-01 齒輪）</p>'],
  ['  <button id="speakers"', '  <button id="gear" type="button" aria-pressed="true" disabled>齒輪動態：開</button>\n  <button id="speakers"'],
  ['<script src="preview.js">', '<script src="gear-assets.js"></script>\n<script src="gear.js"></script>\n<script src="preview.js">']
]);
const js = edit(read('preview.js'), [
  ['  const speakerState = LobbySpeakers.prepare(map);\n', `  const speakerState = LobbySpeakers.prepare(map);
  const gearState = await LobbyGear.prepare(LobbyGearAssets);
  const gearToggle = document.querySelector('#gear');
  let gearEnabled = true;
  gearToggle.onclick = () => {
    gearEnabled = !gearEnabled;
    gearToggle.setAttribute('aria-pressed', String(gearEnabled));
    gearToggle.textContent = gearEnabled ? '齒輪動態：開' : '齒輪動態：關';
    render(elapsed, neutral);
  };
  gearToggle.disabled = false;
`],
  ['      if (speakersEnabled) LobbySpeakers.paint(ctx, speakerState, seconds, envelope, pulseSettings);\n',
   '      if (speakersEnabled) LobbySpeakers.paint(ctx, speakerState, seconds, envelope, pulseSettings);\n      if (gearEnabled) LobbyGear.paint(ctx, gearState, seconds);\n'],
  ['    waterfallPatches, speakerState,', '    waterfallPatches, speakerState, gearState,']
]);

if (dryRun) {
  console.log('Dry run OK: all', 7, 'edits apply once to index.html and preview.js.');
  process.exit(0);
}
const target = path.resolve(targetArg);
if (source === target || fs.existsSync(path.join(target, 'index.html'))) {
  throw Error('Choose a fresh destination so the source and any existing preview stay intact.');
}
fs.cpSync(source, target, {recursive: true});
fs.mkdirSync(path.join(target, 'source-records'), {recursive: true});
for (const name of ['HANDOFF.md', 'manifest.json', 'README.md']) {
  if (fs.existsSync(path.join(source, name))) fs.copyFileSync(path.join(source, name), path.join(target, 'source-records', 'batch2b-test2-' + name));
}
fs.writeFileSync(path.join(target, 'index.html'), html);
fs.writeFileSync(path.join(target, 'preview.js'), js);
fs.cpSync(path.join(__dirname, 'gear-assets'), path.join(target, 'gear-assets'), {recursive: true});
for (const name of ['gear.js', 'gear-assets.js', 'build.cjs', 'baseline-fingerprints.json', 'check-integration.py', 'manifest.json', 'README.md', 'HANDOFF.md']) {
  const from = path.join(__dirname, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(target, name));
}
console.log('Built', target);

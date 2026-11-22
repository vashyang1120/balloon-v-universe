const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [baseline, output] = process.argv.slice(2).map(value => path.resolve(value));
if (!baseline || !output || fs.existsSync(output)) {
  throw new Error('Usage: node integrate.cjs <extracted Integration Preview Test 1> <new output directory>');
}

const hashes = {
  'index.html':'9832387e44e88b49459416d82db72f3d28bb8079a9603450599620419c2d48d6',
  'preview.js':'3a0e3f2c6ca795f596bd8384b454aa023f3a944a818b77335e69b31a1dc5249d',
  'assets.js':'1b12b701bbc6ff3fe776663aae46bf9430f64698b8d2c301846761f916414853',
  'assets/universe_map_bg.png':'78c4885e61f71b4cb5c63680eed97a04c0023aed81f2e58ae839ff3ff913953f'
};
for (const [file, expected] of Object.entries(hashes)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(baseline,file))).digest('hex');
  if (actual !== expected) throw new Error('Baseline hash mismatch: ' + file);
}

function replaceOnce(source, needle, replacement) {
  const start = source.indexOf(needle);
  if (start < 0 || source.indexOf(needle,start + needle.length) >= 0) {
    throw new Error('Expected one baseline insertion point for ' + needle);
  }
  return source.slice(0,start) + replacement + source.slice(start + needle.length);
}

fs.mkdirSync(output,{recursive:true});
for (const name of ['assets.js','assets','serve.cjs','check.cjs','source-records']) {
  fs.cpSync(path.join(baseline,name),path.join(output,name),{recursive:true});
}
for (const file of ['waterfall.js','waterfall-layouts.js']) {
  fs.copyFileSync(path.join(__dirname,file),path.join(output,file));
}

let index = fs.readFileSync(path.join(baseline,'index.html'),'utf8').replaceAll('Integration Preview Test 1','Integration Preview Test 2');
index = replaceOnce(index,'<script src="preview.js"></script>','<script src="waterfall.js"></script>\n<script src="waterfall-layouts.js"></script>\n<script src="preview.js"></script>');
index = replaceOnce(index,'<p id="visit-name"></p>','<p id="visit-name"></p>\n  <button id="waterfalls" type="button" aria-pressed="true" disabled>瀑布動態：開</button>');
fs.writeFileSync(path.join(output,'index.html'),index);

let preview = fs.readFileSync(path.join(baseline,'preview.js'),'utf8');
preview = replaceOnce(preview,'  const [previousArt, nextArt, angleArt, venueArt] = characterArt;', `  const waterfallPatches = LobbyWaterfalls.prepare(map,background);
  const waterfallToggle = document.querySelector('#waterfalls');
  let waterfallsEnabled = true;
  waterfallToggle.onclick = () => {
    waterfallsEnabled = !waterfallsEnabled;
    waterfallToggle.setAttribute('aria-pressed', String(waterfallsEnabled));
    waterfallToggle.textContent = waterfallsEnabled ? '瀑布動態：開' : '瀑布動態：關';
    render(elapsed,neutral);
  };
  waterfallToggle.disabled = false;
  const [previousArt, nextArt, angleArt, venueArt] = characterArt;`);
preview = replaceOnce(preview,'      ctx.drawImage(background,0,0);','      ctx.drawImage(background,0,0);\n      if (waterfallsEnabled) LobbyWaterfalls.paint(ctx,waterfallPatches,seconds);');
preview = replaceOnce(preview,'    environment: scene, characters: characterLayer, sourceMap: map, revision3Rest: rest,','    environment: scene, characters: characterLayer, sourceMap: map, revision3Rest: rest,\n    waterfallPatches,');
fs.writeFileSync(path.join(output,'preview.js'),preview);

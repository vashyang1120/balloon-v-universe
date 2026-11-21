const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || __dirname);
const out = path.resolve(process.argv[3] || path.join(root, 'open-in-chrome.html'));
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const localMap = path.join(root,'assets/universe_map_bg.png');
const repoMap = path.join(root,'../../assets/universe_map_bg.png');
const map = fs.readFileSync(fs.existsSync(localMap) ? localMap : repoMap).toString('base64');
const html = read('index.html')
  .replace('<link rel="stylesheet" href="preview.css">', () => '<style>\n'+read('preview.css')+'</style>')
  .replace('<script src="waterfall.js" defer></script>','')
  .replace(/<script src="preview\.js"[^>]*><\/script>/,'')
  .replace('</body>', () => '<script>\n'+read('waterfall.js')+'\n'+read('preview.js').replace("document.currentScript.dataset.map || 'assets/universe_map_bg.png'", () => "'data:image/png;base64,"+map+"'")+'</script>\n</body>');
fs.writeFileSync(out, html);

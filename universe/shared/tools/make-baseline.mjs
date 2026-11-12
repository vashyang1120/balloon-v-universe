/* 由「正式版遊戲 index.html」產生核心完整性基準（函式 SHA-256、CSS、頁面結構、頂層程式）
   用法：node universe/shared/tools/make-baseline.mjs <正式版 index.html> <輸出 json> <repo> <commit> [外部 main.js] [外部 style.css]
   （知識挑戰的程式與樣式在獨立檔案：傳入 main.js 與 style.css）

   舊遊戲前端寫死的 Firebase 設定值、解鎖 PIN、管理預設密碼一律遮蔽成 [REDACTED]（不留雜湊），
   避免在本 Repository 再存一份。被遮蔽的行在比對時以「允許刪除」規則處理。 */
import fs from "node:fs";
import { inlineScripts, extractFunctions, sha256, styleBlock, bodyMarkup, externalBodyMarkup, residueLines } from "./js-functions.mjs";

const [src, out, repo, commit, extJs, extCss] = process.argv.slice(2);
const html = fs.readFileSync(src, "utf8");
const js = extJs ? fs.readFileSync(extJs, "utf8") : inlineScripts(html);

const REDACT = [
  [/^(\s*(?:apiKey|authDomain|databaseURL|projectId|storageBucket|messagingSenderId|appId|measurementId)\s*:\s*)(["']).*\2(,?)$/, "$1$2[REDACTED]$2$3"],
  [/^(var ADMIN_UNLOCK_PIN = )'[^']*';$/, "$1'[REDACTED]';"],
  [/^(var ADMIN_DEFAULT_PW = )'[^']*';$/, "$1'[REDACTED]';"],
  [/^(\s*)'\d{4,6}'(\s*:\s*'[a-z_0-9]+',?)$/, "$1'[REDACTED]'$2"]
];
const residue = residueLines(js).map((l) => { for (const [re, to] of REDACT) l = l.replace(re, to); return l; });

const functions = {};
for (const f of extractFunctions(js)) functions[f.name] = f.sha256;

const baseline = {
  source: { repo, commit, file: "index.html", sha256: sha256(fs.readFileSync(src)),
    ...(extJs ? { scriptFile: "main.js", scriptSha256: sha256(fs.readFileSync(extJs)) } : {}),
    ...(extCss ? { styleFile: "style.css", styleFileSha256: sha256(fs.readFileSync(extCss)) } : {}) },
  styleSha256: extCss ? sha256(fs.readFileSync(extCss, "utf8")) : sha256(styleBlock(html)),
  // 外部程式的遊戲：頁面結構取 <body> 到載入 main.js 之前
  bodyMarkupSha256: sha256(extJs ? externalBodyMarkup(html) : bodyMarkup(html)),
  functions,
  residueLines: residue,
  redactionNote: "舊遊戲的 Firebase 設定值、解鎖 PIN 與管理預設密碼已遮蔽，避免在本 Repository 再存一份。"
};
fs.writeFileSync(out, JSON.stringify(baseline, null, 1) + "\n");
console.log(`functions: ${Object.keys(functions).length}, residue lines: ${residue.length}`);

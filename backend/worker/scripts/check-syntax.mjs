// 語法檢查：對 src、tests、scripts 下每個 .js / .mjs 執行 node --check
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
for (const dir of ["src", "tests", "scripts"]) walk(join(root, dir));

function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(name)) files.push(p);
  }
}

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    failed++;
    console.error("✗ " + f.slice(root.length + 1) + "\n" + String(e.stderr || e.message));
  }
}
console.log(`語法檢查：${files.length - failed}/${files.length} 個檔案通過`);
process.exit(failed ? 1 : 0);

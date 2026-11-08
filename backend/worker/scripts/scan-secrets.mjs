// 私密資料掃描：整個 Repository（排除 node_modules、.git、.wrangler、圖片音訊）
// 找到疑似私鑰、服務帳戶 JSON、Google Access Token、Cloudflare API Token 就失敗。
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(workerRoot, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".wrangler", "dist"]);
const BINARY = /\.(png|jpe?g|gif|webp|mp3|mp4|ogg|wav|m4a|ico|woff2?|ttf|zip)$/i;

const RULES = [
  { name: "PEM 私鑰", re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----\s*[A-Za-z0-9+/=]{40,}/ },
  { name: "服務帳戶 JSON", re: /"type"\s*:\s*"service_account"[\s\S]{0,400}"private_key"\s*:\s*"-----BEGIN/ },
  { name: "Google Access Token", re: /ya29\.[A-Za-z0-9_-]{30,}/ },
  { name: "Google OAuth Refresh Token", re: /\b1\/\/0[A-Za-z0-9_-]{30,}/ },
  { name: "Cloudflare API Token 指派", re: /CLOUDFLARE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]{30,}/ },
  { name: "GitHub Token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
];

const hits = [];
let scanned = 0;
walk(repoRoot);

function walk(d) {
  for (const name of readdirSync(d)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(d, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (BINARY.test(name) || st.size > 2 * 1024 * 1024) continue;
    // .dev.vars 是本機私密檔，本來就不提交（.gitignore 已排除）；掃描時略過
    if (/^\.dev\.vars$/.test(name)) continue;
    const text = readFileSync(p, "utf8");
    scanned++;
    for (const r of RULES) if (r.re.test(text)) hits.push(`${relative(repoRoot, p)}：${r.name}`);
  }
}

if (hits.length) {
  console.error("✗ 發現疑似私密資料：\n  " + hits.join("\n  "));
  process.exit(1);
}
console.log(`私密資料掃描：${scanned} 個文字檔，未發現私鑰或 Token`);

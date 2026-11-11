/* 從 HTML 內嵌腳本找出所有具名函式（function name(...) {...}）並計算 SHA-256。
   用於「遊戲核心未修改」驗證：原版與換殼原型的核心函式必須逐字相同。 */
import crypto from "node:crypto";

/* 把字串、註解、regex 內容換成空白（長度不變），讓大括號配對不受干擾 */
export function maskJs(text) {
  const out = [];
  let i = 0, st = null;
  const n = text.length;
  while (i < n) {
    const c = text[i], nx = text[i + 1] || "";
    if (st === null) {
      if (c === "/" && nx === "/") { st = "line"; out.push("  "); i += 2; continue; }
      if (c === "/" && nx === "*") { st = "block"; out.push("  "); i += 2; continue; }
      if (c === "'" || c === '"' || c === "`") { st = c; out.push(c); i += 1; continue; }
      if (c === "/") {
        let k = out.length - 1;
        while (k >= 0 && (out[k] === " " || out[k] === "\t")) k--;
        const prev = k >= 0 ? out[k] : "\n";
        if ("(,=:[!&|?{};\n+-*%<>~^".includes(prev)) {
          let j = i + 1, inClass = false;
          while (j < n && text[j] !== "\n") {
            if (text[j] === "\\") { j += 2; continue; }
            if (text[j] === "[") inClass = true;
            else if (text[j] === "]") inClass = false;
            else if (text[j] === "/" && !inClass) break;
            j++;
          }
          if (j < n && text[j] === "/") { out.push(" ".repeat(j - i + 1)); i = j + 1; continue; }
        }
      }
      out.push(c); i++; continue;
    }
    if (st === "line") { out.push(c === "\n" ? "\n" : " "); if (c === "\n") st = null; i++; continue; }
    if (st === "block") {
      if (c === "*" && nx === "/") { st = null; out.push("  "); i += 2; continue; }
      out.push(c === "\n" ? "\n" : " "); i++; continue;
    }
    if (c === "\\") { out.push("  "); i += 2; continue; }
    if (c === st) { st = null; out.push(c); i++; continue; }
    out.push(c === "\n" ? "\n" : " "); i++;
  }
  return out.join("");
}

export function inlineScripts(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n/*--script--*/\n");
}

/** 回傳 [{ name, index, sha256, text }]（同名函式依出現順序加上 #2、#3） */
export function extractFunctions(js) {
  const masked = maskJs(js);
  const re = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const seen = {};
  const out = [];
  let m;
  while ((m = re.exec(masked))) {
    const start = m.index;
    const open = masked.indexOf("{", re.lastIndex);
    let depth = 0, q = open;
    for (; q < masked.length; q++) {
      if (masked[q] === "{") depth++;
      else if (masked[q] === "}") { depth--; if (depth === 0) break; }
    }
    const text = js.slice(start, q + 1);
    seen[m[1]] = (seen[m[1]] || 0) + 1;
    const name = seen[m[1]] > 1 ? `${m[1]}#${seen[m[1]]}` : m[1];
    out.push({ name, index: start, sha256: crypto.createHash("sha256").update(text).digest("hex"), text });
  }
  return out;
}

export function sha256(text) { return crypto.createHash("sha256").update(text).digest("hex"); }

/* 原版頁面結構：<style> 內容與 <body> 標記（腳本以外）— 換殼原型必須逐字相同 */
export function styleBlock(html) { const m = html.match(/<style>([\s\S]*?)<\/style>/); return m ? m[1] : ""; }
export function bodyMarkup(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<script>/);
  return m ? m[1] : "";
}

/* 去掉所有具名函式後剩下的頂層程式（常數、方塊表、音效表、事件綁定…），逐行（去掉行尾空白與空行） */
export function residueLines(source) {
  const parts = extractFunctions(source).sort((a, b) => a.index - b.index);
  let out = "", last = 0;
  for (const f of parts) { if (f.index < last) continue; out += source.slice(last, f.index); last = f.index + f.text.length; }
  out += source.slice(last);
  return out.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
}

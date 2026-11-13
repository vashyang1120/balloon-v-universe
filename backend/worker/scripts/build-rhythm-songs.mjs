/* 由節奏遊戲正式版（唯讀 clone）產生後端驗證用的歌曲表 src/launch/rhythm-songs.js
   用法：node scripts/build-rhythm-songs.mjs <vparty-rhythm-game clone>
   - 音符數用原版 filterBeatmapByDiff（從 index.html 取出原函式執行）計算，不自己重寫規則
   - 歌曲或 Beatmap 之後若被音樂編輯器更新：重新執行本工具；在那之前，數量不符的成績會進「待審核」，不會被拒絕 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";

const repo = process.argv[2];
const html = fs.readFileSync(path.join(repo, "index.html"), "utf8");
const m = html.match(/function filterBeatmapByDiff\(all, diff\) \{[\s\S]*?\n\}\n/);
if (!m) throw new Error("找不到 filterBeatmapByDiff");
const ctx = vm.createContext({});
vm.runInContext(m[0], ctx);
const songs = JSON.parse(fs.readFileSync(path.join(repo, "songs.json"), "utf8"));
const out = {};
for (const s of songs) {
  if (!/^song\d{3,}$/.test(s.id)) continue;
  const bmPath = path.join(repo, s.beatmapUrl || "");
  if (!s.beatmapUrl || !fs.existsSync(bmPath)) continue;
  const raw = fs.readFileSync(bmPath);
  const all = JSON.parse(raw.toString("utf8"));
  const notes = {}, holds = {};
  for (const d of ["easy", "normal", "hard"]) {
    const bm = ctx.filterBeatmapByDiff(all, d);
    notes[d] = bm.length;
    holds[d] = bm.filter((n) => (n.hold || 0) > 0).length;
  }
  out[s.id] = { title: s.title, durationSec: Number(s.duration) || 0, notes, holds, beatmapSha256: crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16) };
}
const head = `/* 自動產生：scripts/build-rhythm-songs.mjs（來源 vparty-rhythm-game songs.json＋各曲 beatmap.json，原版 filterBeatmapByDiff 計算）
   請勿手動修改。歌曲更新後重新產生；未收錄或數量不符的成績會進「待審核」。 */\n`;
fs.writeFileSync(new URL("../src/launch/rhythm-songs.js", import.meta.url), head + "export const RHYTHM_SONGS = Object.freeze(" + JSON.stringify(out, null, 1) + ");\n");
console.log(Object.keys(out).length, "songs", JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.notes]))));

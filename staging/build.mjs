import { cp, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, relative, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";

const productionApi = "https://balloon-v-universe-api.vashyang1120.workers.dev";
const productionHub = "https://vashyang1120.github.io/balloon-v-universe/";
const productionAdventure = "https://vashyang1120.github.io/balloon-v-rush/";
const games = ["universe/tetris", "universe/rhythm", "universe/quiz", "rpg-continent1-universe"];
const hubFiles = ["index.html", "assets", "audio.js", "dialogue.js", "identity.js", "lobby-launch.js",
  "main.js", "onboarding.js", "player-store.js", "rpg-actor.js", "rpg-text.js", "style.css", "zones.js",
  "universe/shared", ...games.slice(0, 3)];
const rushFiles = ["rpg-continent1-universe", "minigames",
  "motion-comic/player", "motion-comic/assets",
  "motion-comic/projects/party-island-opening.js", "motion-comic/projects/party-island-opening.json"];
const adventureRepository = "https://github.com/vashyang1120/balloon-v-rush.git";

function stagingOrigin(value, service) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use an HTTPS origin without a path or credentials.");
  }
  if (url.hostname === "vashyang1120.github.io" || url.origin === productionApi ||
      (service && !/^balloon-v-universe-api-staging\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname))) {
    throw new Error("Use dedicated Staging origins.");
  }
  return url.origin;
}

export async function buildStaging({ universe, adventure, output, web, api, sandboxPreview = false }) {
  const site = stagingOrigin(web, false);
  const worker = stagingOrigin(api, true);
  if (site === worker) throw new Error("Use distinct site and Worker origins.");
  const roots = await Promise.all([realpath(universe), realpath(adventure)]);
  // A fresh target prevents stale files or an accidental production checkout overwrite.
  const target = resolve(output);
  if (roots.some((root) => { const rel = relative(root, target); return !rel || (rel !== ".." && !rel.startsWith(".." + sep) && !rel.includes(":")); })) {
    throw new Error("Build outside both source checkouts.");
  }
  await mkdir(target);
  for (const path of hubFiles) await cp(resolve(roots[0], path), resolve(target, path), { recursive: true });
  for (const path of rushFiles) await cp(resolve(roots[1], path), resolve(target, path), { recursive: true });
  await cp(resolve(roots[1], "assets"), resolve(target, "assets"), { recursive: true, force: false, errorOnExist: false });

  const csp = (sandboxPreview ? "connect-src 'self'" : "connect-src 'self' " + worker) + "; form-action 'self'; base-uri 'self'";
  const sitePath = sandboxPreview ? "/" : site + "/";
  const sandboxScript = '<script>const previewUrl = new URL(location.href); previewUrl.searchParams.set("sandbox", "1"); history.replaceState(history.state, "", previewUrl);</script>';
  async function rewrite(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, item.name);
      if (item.isDirectory()) { await rewrite(path); continue; }
      if (![".html", ".js", ".css", ".mjs"].includes(extname(item.name))) continue;
      let body = await readFile(path, "utf8");
      body = body.replaceAll(productionApi, worker).replaceAll(productionHub, sitePath).replaceAll(productionAdventure, sitePath);
      if (item.name.endsWith(".html")) {
        body = body.replace(/<head[^>]*>/i, (head) => head +
          '\n<meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="' + csp + '">' +
          (sandboxPreview ? sandboxScript : ""));
        if (sandboxPreview && path === resolve(target, "index.html")) {
          body = body.replace('id="sandboxBanner" hidden>🧪 測試沙盒',
            'id="sandboxBanner" hidden>🧪 Universe Brand Story v1.0-test-2 · 測試沙盒');
        }
      }
      await writeFile(path, body);
    }
  }
  await rewrite(target);
  const sdk = await readFile(resolve(target, "universe/shared/universe-sdk.js"), "utf8");
  if (!sdk.includes('var DEFAULT_API_BASE = "' + worker + '"')) throw new Error("Staging SDK API base mismatch.");
  for (const path of [".", ...games]) {
    const html = await readFile(resolve(target, path, "index.html"), "utf8");
    if (!html.includes(csp)) throw new Error("Missing Staging connect policy: " + path);
  }
  await writeFile(resolve(target, "robots.txt"), "User-agent: *\nDisallow: /\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [universe, adventure, output, web, api] = process.argv.slice(2);
  // The Pages checkout bootstraps Adventure. The Universe review branch pins the release to serve.
  if (process.env.CF_PAGES === "1") {
    const revision = (await readFile(resolve(universe, "staging/adventure-revision.txt"), "utf8")).trim();
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Expected a pinned Adventure commit.");
    const current = execFileSync("git", ["-C", adventure, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (current !== revision) {
      execFileSync("git", ["-C", adventure, "fetch", "--depth=1", adventureRepository, revision], { stdio: "inherit" });
      execFileSync("git", ["-C", adventure, "checkout", "--quiet", "--detach", revision], { stdio: "inherit" });
    }
  }
  const sandboxPreview = process.env.CF_PAGES_BRANCH === "dev/universe-brand-story-v1";
  await buildStaging({ universe, adventure, output, web, api, sandboxPreview });
}

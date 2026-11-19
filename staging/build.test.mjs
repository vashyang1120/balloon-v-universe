import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildStaging } from "./build.mjs";

test("all game pages and shared SDK are locked to the test Worker", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "balloon-staging-"));
  const universe = join(fixture, "universe"), adventure = join(fixture, "adventure");
  const output = join(fixture, "dist");
  const api = "https://balloon-v-universe-api-staging.example.workers.dev";
  const web = "https://example-staging.pages.dev";
  const put = async (root, name, content = "") => {
    const path = join(root, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };
  const prodApi = "https://balloon-v-universe-api.vashyang1120.workers.dev";
  const prodSDK = "https://vashyang1120.github.io/balloon-v-universe/universe/shared/universe-sdk.js";
  const html = '<html><head><script src="' + prodSDK + '"></script></head>' +
    '<body><div id="sandboxBanner" hidden>🧪 測試沙盒</div></body></html>';
  const pages = ["index.html", "universe/tetris/index.html", "universe/rhythm/index.html", "universe/quiz/index.html"];
  for (const page of pages) await put(universe, page, html);
  for (const file of ["audio.js","dialogue.js","identity.js","lobby-launch.js","main.js","onboarding.js",
    "player-store.js","rpg-actor.js","rpg-text.js","style.css","zones.js","assets/image.txt"]) await put(universe, file);
  await put(universe, "universe/shared/universe-sdk.js", 'var DEFAULT_API_BASE = "' + prodApi + '";');
  const adventurePage = "rpg-continent1-universe/index.html";
  await put(adventure, adventurePage, html);
  await put(adventure, "minigames/sample/index.html", html);
  await put(adventure, "assets/adventure/image.txt");
  const comicPage = "motion-comic/player/index.html";
  await put(adventure, comicPage, html);
  const comicFiles = ["motion-comic/player/motion-comic-player.js", "motion-comic/player/motion-comic-audio.js",
    "motion-comic/assets/scene1_bg.png", "motion-comic/assets/ui_button_click.mp3",
    "motion-comic/projects/party-island-opening.js", "motion-comic/projects/party-island-opening.json"];
  for (const file of comicFiles) await put(adventure, file, file);
  const opts = { universe, adventure, output, web, api };
  await assert.rejects(buildStaging({ ...opts, api: prodApi }), /dedicated Staging/);
  await buildStaging(opts);
  for (const page of [...pages, adventurePage, "minigames/sample/index.html", comicPage]) {
    const result = await readFile(join(output, page), "utf8");
    assert.ok(result.includes("connect-src 'self' " + api));
    assert.ok(result.includes(web + "/universe/shared/universe-sdk.js"));
    assert.ok(!result.includes("vashyang1120.github.io"));
  }
  for (const file of comicFiles) assert.equal(await readFile(join(output, file), "utf8"), file);

  const preview = join(fixture, "preview");
  await buildStaging({ ...opts, output: preview, sandboxPreview: true });
  for (const page of [...pages, adventurePage, comicPage]) {
    const result = await readFile(join(preview, page), "utf8");
    assert.match(result, /connect-src 'self';/);
    assert.match(result, /previewUrl\.searchParams\.set\("sandbox", "1"\)/);
    assert.ok(result.includes('src="/universe/shared/universe-sdk.js"'));
    assert.ok(!result.includes(api) && !result.includes(web));
  }
  const home = await readFile(join(preview, "index.html"), "utf8");
  assert.ok(home.includes("Universe Brand Story v1.0-test-1"));
});

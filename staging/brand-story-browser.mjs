import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BRAND_STORY_URL || "http://127.0.0.1:8000/";
const origin = new URL(base).origin;
const shots = "brand-story-screenshots";
const colors = { t: "rgb(106, 43, 214)", i: "rgb(200, 31, 102)", n: "rgb(191, 86, 0)" };
const cases = [
  [
    "blocks",
    "把我們在氣球課堂上一起創作的作品，變成好玩的方塊遊戲！",
    4
  ],
  [
    "stage",
    "每一首歌、每一部 MV，都是我們一起走過的美好時光！",
    4
  ],
  [
    "academy",
    "讓知識變成遊戲，讓學習充滿樂趣！",
    5
  ],
  [
    "island",
    "拿起你的氣球武器，展開充滿想像力的冒險！",
    6
  ]
];
const routes = { blocks: "/universe/tetris/", stage: "/universe/rhythm/", academy: "/universe/quiz/", island: "/rpg-continent1-universe/" };
const browser = await chromium.launch();
await mkdir(shots, { recursive: true });

async function openLobby(page, seed = true) {
  if (seed) await page.addInitScript(() => {
    const sample = [
      { playerId: "p_aaaaaaaaaaaaaaaaaaaa", displayId: "品牌故事試玩", baseAvatarKey: "cat1", createdAt: 1 },
      { playerId: "p_bbbbbbbbbbbbbbbbbbbb", displayId: "品牌故事試玩二", baseAvatarKey: "cat1", createdAt: 1 },
    ];
    const map = Object.fromEntries(sample.map(p => [p.playerId, p]));
    sessionStorage.setItem("bvUniverseSandbox_v2_api", JSON.stringify({ players: map, identities: {} }));
    localStorage.setItem("bvUniverseSandbox_v2_rememberedPlayers", JSON.stringify(sample.map(p => ({ ...p, id: p.displayId }))));
    localStorage.setItem("bvUniverseSandbox_v2_currentPlayerId", sample[0].playerId);
    for (const p of sample) localStorage.setItem("bvUniverseSandbox_v2_lobbyTutorialDone__" + p.playerId, "1");
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.PlayerStore?.sandbox === true && document.getElementById("sandboxBanner")?.textContent.includes("Universe Brand Story v1.0-test-1"));
  assert.equal(new URL(page.url()).searchParams.get("sandbox"), "1");
  if (seed) await page.waitForFunction(() => window.BalloonUniverse?.getPlayer()?.id === "品牌故事試玩");
}

try {
  for (const [label, width, height] of [["desktop",1440,900], ["phone",390,844], ["landscape",844,390], ["small-phone",320,640]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: label !== "desktop", hasTouch: label !== "desktop", locale: "zh-TW" });
    const failures = [];
    const remote = [];
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      remote.push(route.request().url());
      return route.abort();
    });
    page.on("pageerror", e => failures.push(e.message));
    page.on("response", r => { if (r.status() >= 400) failures.push(r.status() + " " + r.url()); });
    await openLobby(page);
    const text = page.locator("#rpgText");
    const next = page.locator("#rpgNext");
    const ready = () => page.waitForFunction(() => document.querySelector("#rpg").classList.contains("rpg--ready"));
    const fullPage = async () => {
      if (!await page.locator("#rpg").evaluate(e => e.classList.contains("rpg--ready"))) await page.keyboard.press("Enter");
      await ready();
    };
    const box = async id => {
      await page.locator(`button.entry[data-zone="${id}"]`).click();
      await page.locator("#infoPanel.is-open").waitFor({ state: "visible" });
    };
    for (const [id, slogan, length] of cases) {
      await box(id);
      assert.equal(await page.locator("#infoIntro").textContent(), slogan);
      await page.waitForFunction(() => {
        const info = document.getElementById("infoIntro"), play = document.getElementById("playBtn"), talk = document.getElementById("talkBtn");
        const r = info.getBoundingClientRect();
        const separated = b => r.right <= b.left + 1 || r.bottom <= b.top + 1;
        return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 &&
          info.scrollWidth <= info.clientWidth + 1 && info.scrollHeight <= info.clientHeight + 1 &&
          separated(play.getBoundingClientRect()) && separated(talk.getBoundingClientRect());
      });
      if (["desktop","phone"].includes(label)) {
        await page.screenshot({ path: `${shots}/${label}-${id}-panel.png`, animations: "disabled" });
      }
      await page.locator("#talkBtn").click();
      const expected = await page.evaluate(id => MAP_CONFIG.zones.find(z => z.id === id).introDialogue.map(l => RpgText.plain(l.text)), id);
      assert.equal(expected.length, length);
      const required = id === "academy" ? ["t","n"] : Object.keys(colors);
      const testedColors = new Set();
      let collected = "";
      let count = 0;
      while (await page.locator("#rpg").isVisible() && count < 40) {
        if (count === 0 && label === "desktop" && id === "blocks") {
          await page.waitForFunction(() => document.querySelector("#rpgText .rpg-hl-i") && !document.querySelector("#rpg").classList.contains("rpg--ready"));
          assert.equal(await text.locator(".rpg-hl-i").evaluate(e => getComputedStyle(e).color), colors.i);
        }
        await fullPage();
        const sample = await text.evaluate(el => ({
          content: el.textContent,
          fits: el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1,
          colors: [...el.querySelectorAll("span")].map(s => [s.className.match(/rpg-hl-([tin])/u)?.[1], getComputedStyle(s).color]),
        }));
        assert.ok(sample.fits, `${label} ${id} page ${count} overflows`);
        assert.doesNotMatch(sample.content, /[{}]/u);
        assert.ok(sample.content.length > 2, `${label} ${id}: ${sample.content}`);
        assert.doesNotMatch(sample.content, /^[，、。！？；：）」』]/u);
        for (const [key, color] of sample.colors) {
          assert.equal(color, colors[key]);
          testedColors.add(key);
        }
        if (label === "desktop" && count === 0) {
          await page.screenshot({ path: `${shots}/rpg-${id}.png`, animations: "disabled" });
        }
        if (label === "phone") for (const [key] of sample.colors) {
          if (id === "blocks" && (key === "t" || key === "i") || id === "academy" && key === "n") {
            await page.screenshot({ path: `${shots}/highlight-${key}.png`, animations: "disabled" });
          }
        }
        collected += sample.content;
        await next.click();
        count++;
      }
      assert.equal(collected.replace(/\s/gu, ""), expected.join("").replace(/\s/gu, ""), `${label} ${id}`);
      for (const key of required) assert.ok(testedColors.has(key), `${label} ${id} color ${key}`);
      assert.equal(await page.evaluate(() => BalloonUniverse.getSelected()), id);
      assert.ok(await page.locator("#playBtn").isEnabled());
    }
    await page.locator("#talkBtn").click();
    await page.locator("#rpgSkip").click();
    assert.equal(await page.evaluate(() => BalloonUniverse.getSelected()), "island");
    await page.locator("#talkBtn").click();
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => BalloonUniverse.getSelected()), "island");
    if (label === "phone") {
      await page.locator("#talkBtn").click();
      await fullPage();
      const before = await text.textContent();
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForFunction(() => innerWidth > innerHeight && document.querySelector("#rpg").classList.contains("rpg--ready"));
      const after = await text.textContent();
      assert.ok(after.includes(before) || before.includes(after));
      assert.ok(await next.isVisible());
      await page.keyboard.press("Escape");
    }
    if (label === "desktop") {
      await page.locator("#closeBtn").click();
      await page.locator("#signPass").click();
      await page.locator("#passModal").waitFor({ state: "visible" });
      await page.locator("#passClose").click();
      // Check the existing launch action without running a game or writing a result.
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (route.request().isNavigationRequest() && Object.values(routes).includes(url.pathname)) {
          return route.fulfill({ body: "Sandbox launch target" });
        }
        return route.fallback();
      });
      for (const [id] of cases) {
        await box(id);
        await Promise.all([page.waitForURL(url => url.origin === origin && url.pathname === routes[id] &&
          url.searchParams.get("sandbox") === "1" && url.searchParams.get("bvPlayerId") === "p_aaaaaaaaaaaaaaaaaaaa"),
          page.locator("#playBtn").click()]);
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.BalloonUniverse?.getPlayer()?.id === "品牌故事試玩");
      }
    }
    assert.deepEqual(failures, [], `${label} resource or script failures`);
    assert.deepEqual(remote, [], `${label} attempted external connections`);
    await page.close();
    console.log(`PASS ${label}: four panels, four stories, colors, navigation and isolation`);
  }
  const fresh = await browser.newPage();
  await openLobby(fresh, false);
  assert.ok(await fresh.locator("#flow").isVisible() || await fresh.locator("#rpg").isVisible());
  await fresh.close();
} finally {
  await browser.close();
}

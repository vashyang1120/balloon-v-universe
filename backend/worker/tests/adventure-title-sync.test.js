import test from "node:test";
import assert from "node:assert/strict";
import { advData, newPlayer, play, setup } from "./launch-helpers.js";

const prefix = "adventure_";
const key = (suffix) => prefix + suffix;
const titles = (result) => result.body.data.unlocks.titles.sort();
const track = (kills, damage, purchases) => ({ kills, damage, purchases });
const game = (e, p, counts) => play(e, p, "adventure", advData(counts === undefined ? {} : { achievementTrack: counts }), 20 * 60000);
const player = { displayId: "Title Test", baseAvatarKey: "boy1" };
const volley = (opponent, cpuScore = 0) => ({ kind: "volleyball", opponent, playerScore: 7, cpuScore, winner: "player" });

test("complete adventure counters, partial and legacy records, and the five original score titles", async () => {
  const e = setup();
  const cases = [
    [track(0, 0, 0), ["kind_adventurer", "peace_ambassador", "super_thrifty"]],
    [track(0, 1, 1), ["kind_adventurer"]],
    [track(1, 0, 0), ["super_thrifty"]],
    [track(1, 1, 1), []],
    [undefined, []],
    [{ kills: 0, purchases: 0 }, null],
    [track(-1, 0, 0), null],
    [track("0", 0, 0), null],
  ];
  for (const [i, [counts, expected]] of cases.entries()) {
    const p = await newPlayer(e.call, "Run Test " + i);
    const { r } = await game(e, p, counts);
    assert.equal(r.status, 201);
    if (expected === null) {
      assert.equal(r.body.data.status, "rejected");
      assert.deepEqual(titles(r), []);
    } else {
      assert.equal(r.body.data.status, "accepted");
      assert.deepEqual(titles(r), expected.map(key));
    }
  }
  const p = await newPlayer(e.call, "Score Titles");
  const parts = { collect: 3000, explore: 2500, combat: 2000, survival: 1500, efficiency: 1000 };
  const { r } = await play(e, p, "adventure", advData({ parts, total: 10050 }), 20 * 60000);
  assert.equal(r.body.data.status, "accepted");
  assert.deepEqual(titles(r), ["battle_master", "secret_explorer", "swift_adventurer", "treasure_hunter", "unyielding_hero"].map(key));
});

test("minigame awards use bound sessions without scores, V coins or duplicate collection entries", async () => {
  const e = setup();
  const pid = await newPlayer(e.call, player.displayId);
  const base = "/v1/players/" + pid + "/adventure-title-";
  const req = (action, body, identity = player) => e.call("POST", base + action, { ...identity, ...body });
  const cases = [
    [volley("scorpion"), ["volleyball_rookie"]],
    [volley("orange"), ["volleyball_expert"]],
    [volley("orange_king"), ["volleyball_king"]],
    [volley("orange", 1), []],
    [{ kind: "whack", score: 659 }, []],
    [{ kind: "whack", score: 660 }, ["whack_legend"]],
  ];
  assert.equal((await req("session", { id: "bad-id", kind: "whack" }, { ...player, baseAvatarKey: "boy2" })).status, 403);
  assert.equal((await req("result", { id: "no-session", evidence: volley("orange") })).status, 400);
  assert.equal((await req("session", { id: "bad-kind", kind: "continent" })).status, 400);
  for (const [i, [evidence, expected]] of cases.entries()) {
    const id = "match-" + i;
    assert.equal((await req("session", { id, kind: evidence.kind })).status, 201);
    if (i === 5) assert.equal((await req("result", { id, evidence })).status, 400);
    e.clock.t += 30000;
    const first = await req("result", { id, evidence });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.data.fresh.titles, expected.map(key));
    const replay = await req("result", { id, evidence });
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body.data.fresh.titles, []);
  }
  const catalog = await e.call("GET", "/v1/collections/catalog");
  assert.equal(catalog.body.data.titles.filter((t) => t.gameId === "adventure" && t.status === "active").length, 12);
  const set = (titleKey) => e.call("POST", "/v1/players/" + pid + "/equip", { ...player, titleKey });
  assert.equal((await set(key("whack_legend"))).status, 200);
  assert.equal((await set(key("kind_adventurer"))).status, 403);
  const fromOtherDevice = await e.call("GET", "/v1/players/" + pid);
  assert.equal(fromOtherDevice.body.data.player.title.titleKey, key("whack_legend"));
  assert.equal(e.db.get("scores"), null);
  assert.equal(e.db.get("wallets/" + pid), null);
});

test("admin review validates historical evidence and records its reviewer without duplicating the collection", async () => {
  const e = setup();
  const p = await newPlayer(e.call, player.displayId);
  const uri = "/v1/admin/collections/" + p + "/adventure-evidence";
  const valid = { note: "Compared with the player's retained game history", evidence: [
    { id: "history-endboss", kind: "continent", complete: true, track: track(5, 5, 0) },
    { id: "history-volley", ...volley("orange_king") },
    { id: "history-whack", kind: "whack", score: 660 },
  ] };
  assert.equal((await e.call("POST", uri, valid)).status, 401);
  for (const evidence of [
    { id: "bad-track", kind: "continent", complete: true, track: {} },
    { id: "bad-whack", kind: "whack", score: 659 },
    { id: "bad-opponent", ...volley("orangeKing") },
    { id: "bad-title", titleKey: "tetris_first_clear" },
  ]) assert.equal((await e.admin("POST", uri, { ...valid, evidence: [evidence] })).status, 400);
  const a = await e.admin("POST", uri, valid);
  assert.equal(a.status, 200);
  assert.deepEqual(a.body.data.fresh.titles, ["super_thrifty", "volleyball_king", "whack_legend"].map(key));
  const b = await e.admin("POST", uri, valid);
  assert.deepEqual(b.body.data.fresh.titles, []);
  const audit = Object.values(e.db.get("collectionAudit"));
  assert.equal(audit.length, 3);
  assert.ok(audit.every((row) => row.by && row.playerId === p));
  assert.equal(e.db.get("wallets/" + p), null);
});

test("trial title submissions stay in the trial namespace and simultaneous awards are retained", async () => {
  const prod = setup();
  const pid = await newPlayer(prod.call, player.displayId);
  const trial = setup({ SCORES_ENABLED: "trial", REWARDS_ENABLED: "off", TRIAL_PLAYER_IDS: pid }, prod.clock.t, prod.db);
  const base = "/v1/players/" + pid + "/adventure-title-";
  const cases = ["scorpion", "orange"].map((op) => ({ ...player, id: "match-" + op, kind: "volleyball", evidence: volley(op) }));
  for (const body of cases) assert.equal((await trial.call("POST", base + "session", body)).status, 201);
  trial.clock.t += 30000;
  const res = await Promise.all(cases.map((body) => trial.call("POST", base + "result", body)));
  assert.ok(res.every((r) => r.status === 200));
  assert.equal(prod.db.get("collections/" + pid), null);
  const collection = await trial.call("GET", "/v1/players/" + pid + "/collection");
  assert.deepEqual(collection.body.data.titles.map((t) => t.titleKey).sort(), ["volleyball_expert", "volleyball_rookie"].map(key));
});

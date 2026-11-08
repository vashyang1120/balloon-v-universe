// 規格與設定檔檢查：遊戲版本識別、提交信封格式、Wrangler 設定、私密資料不外流
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, req, baseEnv, ORIGIN } from "./helpers.js";
import { validateGameResultEnvelope } from "../src/routes/game-results.js";
import { parseClientInfo } from "../src/middleware/client-info.js";
import { newPlayerId, taipeiDateKey } from "../src/utils/ids.js";
import { PATTERNS } from "../src/utils/validate.js";
import { readConfig } from "../src/config.js";
import { redact, REDACTED } from "../src/utils/logger.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function goodEnvelope(extra = {}) {
  return {
    submissionId: crypto.randomUUID(),
    gameId: "tetris",
    gameVersion: "2.0.0-test-1",
    sdkVersion: "1.0.0",
    playerId: newPlayerId(),
    durationMs: 120000,
    result: { score: 2100, lines: 12, level: 3 },
    ...extra,
  };
}

test("遊戲結果信封：合格資料通過", () => {
  const v = validateGameResultEnvelope(goodEnvelope());
  assert.equal(v.gameId, "tetris");
});

test("遊戲結果信封：缺少 submissionId、未知遊戲、多餘欄位、格式錯誤都被拒絕", () => {
  const cases = [
    goodEnvelope({ submissionId: undefined }),
    goodEnvelope({ submissionId: "short" }),
    goodEnvelope({ gameId: "minecraft" }),
    goodEnvelope({ gameVersion: "latest" }),
    goodEnvelope({ playerId: "Player__boy1" }),
    goodEnvelope({ durationMs: -1 }),
    goodEnvelope({ result: [1, 2] }),
    goodEnvelope({ coins: 9999 }),
  ];
  for (const c of cases) {
    assert.throws(() => validateGameResultEnvelope(c), (e) => ["VALIDATION_FAILED", "UNKNOWN_GAME"].includes(e.code), JSON.stringify(c).slice(0, 80));
  }
});

test("遊戲結果信封與 X-BV-Client 標頭不一致 → 拒絕", () => {
  assert.throws(
    () => validateGameResultEnvelope(goodEnvelope(), { gameId: "rhythm", gameVersion: "2.0.0-test-1" }),
    (e) => e.code === "VALIDATION_FAILED",
  );
});

test("X-BV-Client：正確解析；格式錯誤 400；未知遊戲 400", async () => {
  const mk = (v) => new Request("https://x/", { headers: v == null ? {} : { "x-bv-client": v } });
  assert.deepEqual(parseClientInfo(mk("tetris/2.0.0 sdk/1.0.0")), { gameId: "tetris", gameVersion: "2.0.0", sdkVersion: "1.0.0" });
  assert.equal(parseClientInfo(mk(null)), null);
  assert.throws(() => parseClientInfo(mk("tetris")), (e) => e.code === "BAD_REQUEST");
  assert.throws(() => parseClientInfo(mk("snake/1.0.0")), (e) => e.code === "UNKNOWN_GAME");

  const res = await app().fetch(req("/v1/meta", { headers: { origin: ORIGIN, "x-bv-client": "bad header" } }), baseEnv());
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN, "錯誤回應也要有 CORS，遊戲才讀得到錯誤原因");
});

test("playerId 格式固定、每次不同；台灣日期以 UTC+8 計算", () => {
  const a = newPlayerId(), b = newPlayerId();
  assert.match(a, PATTERNS.playerId);
  assert.notEqual(a, b);
  assert.equal(taipeiDateKey(new Date("2026-11-08T15:59:59Z")), "2026-11-08");
  assert.equal(taipeiDateKey(new Date("2026-11-08T16:00:00Z")), "2026-11-09");
});

test("記錄遮罩：敏感欄位名稱與私鑰、JWT、Google Token 內容都被遮蔽", () => {
  const pemLabel = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  const out = redact({
    authorization: "Bearer abc",
    nested: { private_key: "x", refreshToken: "y" },
    note: `${pemLabel}\nMIIabc\n`,
    jwt: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXNpZ24",
    access: "token is ya29.abcdefg",
    ok: "hello",
  });
  assert.equal(out.authorization, REDACTED);
  assert.equal(out.nested.private_key, REDACTED);
  assert.equal(out.nested.refreshToken, REDACTED);
  assert.ok(!out.note.includes("MIIabc"));
  assert.equal(out.jwt, REDACTED);
  assert.ok(!out.access.includes("ya29.abcdefg"));
  assert.equal(out.ok, "hello");
});

test("readConfig：只回報是否設定，不回傳 Secret 內容", () => {
  const cfg = readConfig(baseEnv({ FIREBASE_SERVICE_ACCOUNT_JSON: '{"secret":1}', ADMIN_UIDS: "u1,u2  u3" }));
  assert.equal(cfg.firebaseConfigured, true);
  assert.deepEqual(cfg.adminUids, ["u1", "u2", "u3"]);
  assert.ok(!JSON.stringify(cfg).includes('"secret"'));
  assert.equal(readConfig({ FIREBASE_DATABASE_URL: "https://evil.example.com" }).databaseUrl, "", "資料庫網址只接受 Firebase 網域");
});

test("wrangler.jsonc：Worker 名稱、進入點正確；vars 中沒有私密設定", () => {
  const raw = readFileSync(join(root, "wrangler.jsonc"), "utf8");
  const cfg = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
  assert.equal(cfg.name, "balloon-v-universe-api");
  assert.equal(cfg.main, "src/index.js");
  assert.ok(existsSync(join(root, cfg.main)));
  assert.ok(cfg.compatibility_date);
  for (const k of Object.keys(cfg.vars)) {
    assert.ok(!/SERVICE_ACCOUNT|ADMIN_UIDS|TOKEN|SECRET|PRIVATE/i.test(k), "vars 不可放私密設定：" + k);
  }
  assert.ok(!raw.includes("PRIVATE KEY"));
  assert.ok(!/"ALLOWED_ORIGINS"\s*:\s*"\*"/.test(raw));
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name, "balloon-v-universe-api");
});

test(".gitignore 排除本機私密檔與金鑰檔", () => {
  const gi = readFileSync(join(root, ".gitignore"), "utf8");
  for (const p of [".dev.vars", "node_modules/", ".wrangler/", "*service-account*.json"]) assert.ok(gi.includes(p), p);
});

test("JSON 內容檢查：Content-Type、大小、格式", async () => {
  const { readJson } = await import("../src/middleware/body.js");
  const mk = (body, type = "application/json") => new Request("https://x/", { method: "POST", headers: { "content-type": type }, body });
  assert.deepEqual(await readJson(mk('{"a":1}')), { a: 1 });
  await assert.rejects(readJson(mk('{"a":1}', "text/plain")), (e) => e.code === "UNSUPPORTED_MEDIA_TYPE");
  await assert.rejects(readJson(mk("{bad")), (e) => e.code === "BAD_REQUEST");
  await assert.rejects(readJson(mk("")), (e) => e.code === "BAD_REQUEST");
  await assert.rejects(readJson(mk(JSON.stringify({ x: "a".repeat(40000) }))), (e) => e.code === "PAYLOAD_TOO_LARGE");
});

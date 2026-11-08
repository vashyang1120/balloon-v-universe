import { test } from "node:test";
import assert from "node:assert/strict";
import { newRsaKey, mockFetch, jsonResponse } from "./helpers.js";
import { createGoogleJwksProvider, GOOGLE_SECURETOKEN_JWKS_URL } from "../src/services/firebase-id-token.js";

const k1 = await newRsaKey("k1");
const k2 = await newRsaKey("k2");

test("依 Cache-Control max-age 快取 Google 公開金鑰", async () => {
  let t = 0;
  const f = mockFetch([{ match: (u) => u === GOOGLE_SECURETOKEN_JWKS_URL, respond: () => jsonResponse({ keys: [k1.jwk] }, 200, { "cache-control": "public, max-age=100" }) }]);
  const p = createGoogleJwksProvider({ fetch: f, now: () => t });
  assert.ok(await p.getKey("k1"));
  t = 50_000;
  assert.ok(await p.getKey("k1"));
  assert.equal(f.calls.length, 1);
  t = 101_000;
  await p.getKey("k1");
  assert.equal(f.calls.length, 2);
});

test("遇到新 kid 重新抓一次（金鑰輪替），但不會被無限觸發", async () => {
  let t = 0, round = 0;
  const f = mockFetch([{ match: () => true, respond: () => jsonResponse({ keys: round++ === 0 ? [k1.jwk] : [k1.jwk, k2.jwk] }, 200, { "cache-control": "max-age=3600" }) }]);
  const p = createGoogleJwksProvider({ fetch: f, now: () => t });
  await p.getKey("k1");
  t = 61_000;
  assert.ok(await p.getKey("k2"), "輪替後找得到新金鑰");
  assert.equal(f.calls.length, 2);
  t = 62_000;
  assert.equal(await p.getKey("unknown"), null);
  assert.equal(f.calls.length, 2, "60 秒內不重抓，避免被假 kid 灌爆");
});

test("Google 服務失敗 → 丟錯（上層會拒絕管理員請求）", async () => {
  const f = mockFetch([{ match: () => true, respond: () => new Response("", { status: 500 }) }]);
  const p = createGoogleJwksProvider({ fetch: f });
  await assert.rejects(p.getKey("k1"));
});

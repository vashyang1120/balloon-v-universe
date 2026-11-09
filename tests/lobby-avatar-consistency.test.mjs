/* 大廳 × 後端 身份圖案一致性檢查（v0.3.4）
   執行：node --test tests/lobby-avatar-consistency.test.mjs  （在 repository 根目錄）
   - 大廳 zones.js 的 33 款 key / 順序 / 名稱 必須與後端 BASE_AVATARS（active）完全一致
   - 每個 key 都有對應圖片，manifest.json 記錄的大小與 sha256 與實際檔案一致
   - 原有 17 款 key 與順序不可改變
   - 大廳不再引用舊 Firebase 設定與舊 playerKey 函式 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { BASE_AVATARS, BASE_AVATAR_CATALOG_VERSION, publicBaseAvatarList } from "../backend/worker/src/players/base-avatars.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AV_DIR = path.join(ROOT, "assets/avatars/base");

function lobbyConfig() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "zones.js"), "utf8"), ctx);
  return JSON.parse(JSON.stringify(ctx.window.MAP_CONFIG.player)); // 換成本程式的陣列（vm 內的陣列不能直接 deepEqual）
}
const P = lobbyConfig();
const ORIGINAL_17 = ["boy1","girl1","boy2","girl2","cat1","cat2","fat1","girl3","curl1","boy3","girl4","girl5","curl2","dog1","dog2","dog3","dog4"];
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

test("大廳 33 款與後端 active 清單：key、順序、名稱完全一致", () => {
  const backend = publicBaseAvatarList();
  assert.equal(backend.length, 33);
  assert.equal(P.builtinAvatars.length, 33);
  backend.forEach((a, i) => {
    assert.equal(P.builtinAvatars[i][0], a.key, `第 ${i + 1} 款 key`);
    assert.equal(P.builtinAvatars[i][1], a.label, `第 ${i + 1} 款名稱`);
    assert.equal(a.order, i + 1);
  });
  assert.equal(BASE_AVATARS.filter((a) => a.status === "active").length, 33);
});

test("原有 17 款 key 與順序不變；大廳預設安全清單是前 17 款", () => {
  assert.deepEqual(P.builtinAvatars.slice(0, 17).map((a) => a[0]), ORIGINAL_17);
  assert.deepEqual(BASE_AVATARS.slice(0, 17).map((a) => a.key), ORIGINAL_17);
  assert.equal(P.safeDefaultAvatarCount, 17);
  P.builtinAvatars.forEach((a, i) => assert.equal(a[2] === "full", i >= 17, `${a[0]} 的 full 標記`));
});

test("每個 key 都有圖片；manifest 與實際檔案一致", () => {
  const m = JSON.parse(fs.readFileSync(path.join(AV_DIR, "manifest.json"), "utf8"));
  assert.equal(m.catalogVersion, BASE_AVATAR_CATALOG_VERSION);
  assert.equal(m.count, 33);
  const pngs = fs.readdirSync(AV_DIR).filter((f) => f.endsWith(".png")).sort();
  assert.deepEqual(pngs, P.builtinAvatars.map((a) => a[0] + ".png").sort(), "資料夾內 PNG 剛好 33 張，不多不少");
  m.avatars.forEach((e, i) => {
    assert.equal(e.key, P.builtinAvatars[i][0]);
    assert.equal(e.order, i + 1);
    const f = path.join(AV_DIR, e.file);
    assert.equal(fs.statSync(f).size, e.bytes, e.file + " 大小");
    const buf = fs.readFileSync(f);
    if (e.format === "PNG") {
      assert.equal(buf.subarray(1, 4).toString(), "PNG", e.file + " 是 PNG");
      assert.equal(buf.readUInt32BE(16), e.width); assert.equal(buf.readUInt32BE(20), e.height);
      assert.equal(e.group, "v1.0-16", "新款都是 PNG");
    } else {
      // 原有 17 款的原檔內容是 JPEG（副檔名 .png），沿用原檔不轉檔
      assert.equal(e.format, "JPEG"); assert.equal(e.group, "original-17");
      assert.deepEqual([...buf.subarray(0, 3)], [0xff, 0xd8, 0xff], e.file + " 是 JPEG 內容");
    }
    if (e.group === "original-17") assert.equal(sha(f), e.source.sha256, e.file + " 與原檔逐位元組相同");
  });
});

test("大廳圖片網址指向遊戲宇宙自己的資料夾", () => {
  assert.equal(P.avatarBaseUrl, "assets/avatars/base/");
  assert.match(P.apiBaseUrl, /^https:\/\/balloon-v-universe-api\.[a-z0-9-]+\.workers\.dev$/);
});

test("大廳程式不再引用舊 Firebase 與舊 playerKey 函式", () => {
  const bad = /firebaseConfig|firebaseSdkVersion|gstatic\.com|vparty-rhythm-game-default-rtdb|makePlayerKey|encodeFirebaseKeyPart\(|getCurrentKey|setCurrentKey|detectGameLocalIdentities|\.playerKey\b/;
  for (const f of ["zones.js", "identity.js", "player-store.js", "main.js", "onboarding.js", "index.html"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(src, bad, f);
  }
});

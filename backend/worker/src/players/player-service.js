/**
 * 玩家身份服務：建立、找回、讀取公開資料
 *
 * 資料庫（Firebase Realtime Database，只有 Worker 能讀寫）：
 *   identities/{identityKey}   身份索引 —— 「這組 ID＋身份圖案屬於哪個 playerId」
 *   players/{playerId}/profile 玩家基本資料
 *
 * ── 一致性設計 ──────────────────────────────────────────────
 * 原子判定點：identities/{identityKey} 的 ETag 條件寫入。
 *   先讀到「不存在」時的 ETag，再用它寫入；兩台裝置同時建立，只有一台會成功，
 *   另一台得到 412 衝突 → 重讀 → 發現已存在。
 *
 * 寫入順序：先身份索引，後 profile。
 *   身份索引本身就包含 playerId、displayId、baseAvatarKey、createdAt，
 *   所以 profile 永遠可以從身份索引「重建」：
 *     - 索引寫好、profile 沒寫成（網路斷、Worker 中止）→ 下一次建立重試／找回時自動補上
 *     - profile 只會在索引成功之後、且只用索引裡的 playerId 寫入 → 不會產生無主 profile
 *   profile 補寫也用 ETag「只在不存在時寫入」，不會覆蓋之後被更新的 profile。
 *
 * 重送安全（冪等）：建立請求帶 createRequestId（遊戲端產生的隨機值）。
 *   同一個 createRequestId 重送（重複點擊、逾時重試）→ 回傳同一位玩家，不會變成「身份已存在」。
 *   換了 createRequestId（例如重新整理頁面）→ 回「身份已存在」，由大廳引導改用找回。
 *
 * 這不是多路徑交易：兩個路徑不是一次寫入，但任何中斷都只會停在
 * 「索引在、profile 缺」這一種狀態，且一定能自動修復。
 */
import { ApiError } from "../utils/errors.js";
import { PATTERNS } from "../utils/validate.js";
import { newPlayerId as defaultNewPlayerId } from "../utils/ids.js";
import { normalizeDisplayId } from "./id-rules.js";
import { isActiveBaseAvatar, isKnownBaseAvatar } from "./base-avatars.js";
import { identityKeyFor, IDENTITY_KEY_PATTERN } from "./identity-key.js";

export const SCHEMA_VERSION = 1;
export const paths = Object.freeze({
  identity: (identityKey) => `identities/${identityKey}`,
  profile: (playerId) => `players/${playerId}/profile`,
});
const MAX_CLAIM_ATTEMPTS = 3;

/** 給前端的公開資料：只挑固定欄位，不把資料庫物件原樣傳出 */
export function toPublicProfile(p) {
  return {
    playerId: p.playerId,
    displayId: p.displayId,
    baseAvatarKey: p.baseAvatarKey,
    displayAvatarKey: p.displayAvatarKey || p.baseAvatarKey,
    createdAt: new Date(p.createdAt).toISOString(),
  };
}

function validateDisplayId(raw) {
  const r = normalizeDisplayId(raw);
  if (!r.ok) throw new ApiError("VALIDATION_FAILED", { message: r.message, details: { errors: [{ field: "displayId", issue: r.code }] } });
  return r.value;
}

function integrity(internal) {
  return new ApiError("INTEGRITY_ERROR", { internal });
}

/** 讀到的身份索引必須完整且和這次查詢一致（防止資料損壞或雜湊碰撞被誤用） */
function checkIdentityRecord(rec, displayId, baseAvatarKey) {
  if (!rec || typeof rec !== "object") throw integrity("identity record not an object");
  if (!PATTERNS.playerId.test(String(rec.playerId))) throw integrity("identity record has invalid playerId");
  if (rec.displayId !== displayId || rec.baseAvatarKey !== baseAvatarKey) throw integrity("identity record does not match lookup");
  if (!Number.isFinite(rec.createdAt)) throw integrity("identity record missing createdAt");
  return rec;
}

/**
 * @param {object} deps
 * @param {object|function} deps.db     firebase-rest client，或回傳 client 的函式（延後到驗證通過後才取得）
 * @param {() => number} [deps.now]
 * @param {() => string} [deps.newPlayerId]
 * @param {object} [deps.logger]
 */
export function createPlayerService(deps) {
  // 延後取得資料庫：輸入驗證失敗時不需要（也不會觸碰）Firebase 設定
  const getDb = typeof deps.db === "function" ? deps.db : () => deps.db;
  const db = {
    getWithEtag: (...a) => getDb().getWithEtag(...a),
    putIfMatch: (...a) => getDb().putIfMatch(...a),
    get: (...a) => getDb().get(...a),
  };
  const now = deps.now || (() => Date.now());
  const makeId = deps.newPlayerId || defaultNewPlayerId;
  const log = deps.logger;

  /** 確保 profile 存在且屬於這個身份；不存在就由身份索引重建 */
  async function ensureProfile(identity, identityKey) {
    const path = paths.profile(identity.playerId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const { value, etag } = await db.getWithEtag(path);
      if (value) {
        if (value.playerId !== identity.playerId || value.identityKey !== identityKey) {
          throw integrity("profile belongs to a different identity");
        }
        return value;
      }
      const t = now();
      const profile = {
        playerId: identity.playerId,
        displayId: identity.displayId,
        baseAvatarKey: identity.baseAvatarKey,
        displayAvatarKey: identity.baseAvatarKey,
        identityKey,
        createdAt: identity.createdAt,
        updatedAt: t,
        status: "active",
        schemaVersion: SCHEMA_VERSION,
      };
      try {
        await db.putIfMatch(path, profile, etag);
        if (attempt > 0 || identity.__repair) log?.info("player profile repaired", { playerId: identity.playerId });
        return profile;
      } catch (e) {
        if (e && e.code === "CONFLICT") continue; // 別的請求剛好也在補寫：重讀確認
        throw e;
      }
    }
    throw new ApiError("CONFLICT", { internal: "profile write kept conflicting" });
  }

  return {
    /**
     * 建立玩家
     * @param {{displayId:string, baseAvatarKey:string, createRequestId:string}} input
     * @param {{gameId?:string, gameVersion?:string, sdkVersion?:string}|null} client
     * @returns {Promise<{status:"created", replayed:boolean, player:object}>}
     */
    async create(input, client) {
      const displayId = validateDisplayId(input.displayId);
      if (!isActiveBaseAvatar(input.baseAvatarKey)) {
        throw new ApiError("VALIDATION_FAILED", { message: "請選擇一個身份圖案", details: { errors: [{ field: "baseAvatarKey", issue: "AVATAR_NOT_AVAILABLE" }] } });
      }
      const baseAvatarKey = input.baseAvatarKey;
      const identityKey = await identityKeyFor(displayId, baseAvatarKey);
      const idPath = paths.identity(identityKey);

      for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
        const { value: existing, etag } = await db.getWithEtag(idPath);

        if (existing) {
          const rec = checkIdentityRecord(existing, displayId, baseAvatarKey);
          if (rec.createRequestId && rec.createRequestId === input.createRequestId) {
            // 同一個建立請求重送（重複點擊、逾時重試）：回傳同一位玩家，順便補齊 profile
            const profile = await ensureProfile({ ...rec, __repair: true }, identityKey);
            return { status: "created", replayed: true, player: toPublicProfile(profile) };
          }
          throw new ApiError("IDENTITY_EXISTS", { details: { canResolve: true } });
        }

        const t = now();
        const record = {
          playerId: makeId(),
          displayId,
          baseAvatarKey,
          createdAt: t,
          createRequestId: input.createRequestId,
          schemaVersion: SCHEMA_VERSION,
          source: {
            gameId: client?.gameId || "unknown",
            gameVersion: client?.gameVersion || "unknown",
            sdkVersion: client?.sdkVersion || "unknown",
          },
        };
        try {
          await db.putIfMatch(idPath, record, etag); // ← 原子判定點
        } catch (e) {
          if (e && e.code === "CONFLICT") continue;   // 被別台裝置搶先：重讀
          throw e; // 逾時等「結果不明」的錯誤：交給前端用同一個 createRequestId 重試
        }
        const profile = await ensureProfile(record, identityKey);
        log?.info("player created", { playerId: record.playerId, client: record.source.gameId });
        return { status: "created", replayed: false, player: toPublicProfile(profile) };
      }
      throw new ApiError("CONFLICT", { internal: "identity claim kept conflicting" });
    },

    /** 用 ID＋身份圖案找回既有玩家（低信任：知道這組資訊就能找回） */
    async resolve(input) {
      const displayId = validateDisplayId(input.displayId);
      if (!isKnownBaseAvatar(input.baseAvatarKey)) {
        throw new ApiError("VALIDATION_FAILED", { message: "請選擇當初的身份圖案", details: { errors: [{ field: "baseAvatarKey", issue: "AVATAR_UNKNOWN" }] } });
      }
      const identityKey = await identityKeyFor(displayId, input.baseAvatarKey);
      const { value } = await db.getWithEtag(paths.identity(identityKey));
      if (!value) throw new ApiError("IDENTITY_NOT_FOUND");
      const rec = checkIdentityRecord(value, displayId, input.baseAvatarKey);
      const profile = await ensureProfile({ ...rec, __repair: true }, identityKey);
      return { status: "found", player: toPublicProfile(profile) };
    },

    /** 讀取公開基本資料 */
    async getPublic(playerId) {
      if (!PATTERNS.playerId.test(String(playerId))) throw new ApiError("PLAYER_NOT_FOUND");
      const p = await db.get(paths.profile(playerId));
      if (!p || p.playerId !== playerId || p.status === "deleted") throw new ApiError("PLAYER_NOT_FOUND");
      if (!IDENTITY_KEY_PATTERN.test(String(p.identityKey))) throw integrity("profile missing identityKey");
      return { player: toPublicProfile(p) };
    },
  };
}

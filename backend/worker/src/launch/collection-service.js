/**
 * 共用收藏（TitleService＋AvatarUnlockService，v0.3.1）
 *
 * 資料（同一位玩家的收藏在同一個節點 → 每次變更都是一次條件寫入，不會重複建立、不會互相蓋掉）：
 *   collections/{playerId} = {
 *     playerId, rev, updatedAt,
 *     titles:  { titleKey:  { titleKey, gameId, unlockedAt, source: { type: "score"|"backfill", submissionId, gameId } } },
 *     avatars: { avatarKey: { avatarKey, unlockedAt, source: { type: "score"|"backfill"|"admin", submissionId?, by?, note? } } },
 *     equipped: { titleKey, displayAvatarKey, updatedAt, auto? }
 *   }
 *   publicProfiles/{playerId} = { displayAvatarKey, titleKey, titleName, updatedAt }   排行榜／遊戲讀取用（一次讀整個節點）
 *   collectionAudit/{id}                                                             管理員發放／收回紀錄
 *
 * 規則：
 *   - 只有「已接受」的正式成績會觸發解鎖（呼叫端保證）；解鎖永久保留，重複達成不會產生第二筆
 *   - 裝備稱號只能選自己已解鎖的；裝備展示頭像只能選自己的身份頭像或已解鎖的頭像（後端檢查，不信任前端）
 *   - 更換展示頭像／稱號不會改 playerId、baseAvatarKey、成績、排行榜、V幣
 *   - 第一次解鎖稱號而且從來沒有選過稱號時，自動裝備（沿用方塊原版「自動裝備第一個稱號」）
 */
import { ApiError } from "../utils/errors.js";
import { casUpdate } from "./cas.js";
import { TITLES_BY_KEY, AVATARS_BY_KEY, TITLE_CATALOG, AVATAR_CATALOG, evaluateUnlocks, GAME_LABEL } from "./collection-catalog.js";

export const cpaths = Object.freeze({
  collection: (p) => `collections/${p}`,
  publicProfile: (p) => `publicProfiles/${p}`,
  audit: (id) => `collectionAudit/${id}`,
});

function empty(playerId) { return { playerId, rev: 0, titles: {}, avatars: {}, equipped: {} }; }

export function createCollectionService({ db, now }) {
  async function mirror(playerId, col, profile) {
    const eq = (col && col.equipped) || {};
    const t = eq.titleKey && TITLES_BY_KEY[eq.titleKey];
    await db.put(cpaths.publicProfile(playerId), {
      displayAvatarKey: eq.displayAvatarKey || (profile && profile.baseAvatarKey) || null,
      titleKey: t ? t.titleKey : null, titleName: t ? t.name : null, updatedAt: now(),
    });
  }

  /** 新增解鎖（冪等）。返回這次新解鎖的 key */
  async function grant(playerId, { titles = [], avatars = [] }, source, profile) {
    const t = now();
    const r = await casUpdate(db, cpaths.collection(playerId), (cur) => {
      const c = cur && typeof cur === "object" ? { ...cur } : empty(playerId);
      c.titles = { ...(c.titles || {}) }; c.avatars = { ...(c.avatars || {}) }; c.equipped = { ...(c.equipped || {}) };
      const fresh = { titles: [], avatars: [] };
      for (const k of titles) {
        if (c.titles[k] || !TITLES_BY_KEY[k]) continue;
        c.titles[k] = { titleKey: k, gameId: TITLES_BY_KEY[k].gameId, unlockedAt: t, source };
        fresh.titles.push(k);
      }
      for (const k of avatars) {
        if (c.avatars[k] || !AVATARS_BY_KEY[k]) continue;
        c.avatars[k] = { avatarKey: k, unlockedAt: t, source };
        fresh.avatars.push(k);
      }
      if (!fresh.titles.length && !fresh.avatars.length) return { result: { fresh, col: c, changed: false } };
      // 從來沒有選過稱號 → 自動裝備第一個新解鎖的稱號
      if (fresh.titles.length && !("titleKey" in c.equipped)) c.equipped = { ...c.equipped, titleKey: fresh.titles[0], updatedAt: t, auto: true };
      const next = { ...c, playerId, rev: Number(c.rev || 0) + 1, updatedAt: t };
      return { value: next, result: { fresh, col: next, changed: true } };
    });
    if (r.result.changed) await mirror(playerId, r.result.col, profile);
    return r.result.fresh;
  }

  function view(playerId, col, profile) {
    const c = col || empty(playerId);
    const eq = c.equipped || {};
    const base = profile ? profile.baseAvatarKey : null;
    const titles = Object.values(c.titles || {}).filter((x) => TITLES_BY_KEY[x.titleKey]).sort((a, b) => a.unlockedAt - b.unlockedAt)
      .map((x) => ({ titleKey: x.titleKey, gameId: x.gameId, name: TITLES_BY_KEY[x.titleKey].name, unlockedAt: new Date(x.unlockedAt).toISOString() }));
    const avatars = Object.values(c.avatars || {}).filter((x) => AVATARS_BY_KEY[x.avatarKey]).sort((a, b) => a.unlockedAt - b.unlockedAt)
      .map((x) => { const a = AVATARS_BY_KEY[x.avatarKey]; return { avatarKey: a.avatarKey, name: a.name, image: a.image, private: a.visibility === "private", unlockedAt: new Date(x.unlockedAt).toISOString() }; });
    const owned = new Set(Object.keys(c.avatars || {}));
    const eqTitle = eq.titleKey && c.titles && c.titles[eq.titleKey] ? TITLES_BY_KEY[eq.titleKey] : null;
    const eqAvatar = eq.displayAvatarKey && (eq.displayAvatarKey === base || owned.has(eq.displayAvatarKey)) ? eq.displayAvatarKey : base;
    return {
      playerId,
      equipped: { titleKey: eqTitle ? eqTitle.titleKey : null, titleName: eqTitle ? eqTitle.name : null, displayAvatarKey: eqAvatar, baseAvatarKey: base },
      titles, avatars,
      // 目錄：全部稱號（含準備中）＋公開頭像（未解鎖顯示鎖定）＋這位玩家已被授權的私人頭像
      catalog: {
        titles: TITLE_CATALOG.map((t) => ({ titleKey: t.titleKey, gameId: t.gameId, gameName: GAME_LABEL[t.gameId], name: t.name, conditionText: t.conditionText, status: t.status, unlocked: !!(c.titles && c.titles[t.titleKey]) })),
        avatars: AVATAR_CATALOG.filter((a) => a.visibility === "public" || owned.has(a.avatarKey))
          .map((a) => ({ avatarKey: a.avatarKey, name: a.name, image: a.image, unlock: a.unlock, conditionText: a.conditionText, private: a.visibility === "private", unlocked: owned.has(a.avatarKey) })),
      },
    };
  }

  return {
    /** 已接受成績 → 判定並解鎖（冪等；同一筆成績重跑不會重複建立） */
    async applyScore(score, profile, { quizProgress, sourceType = "score" } = {}) {
      const { titles, avatars } = evaluateUnlocks(score.gameId, score.scoreData || {}, { quizProgress });
      if (!titles.length && !avatars.length) return { titles: [], avatars: [] };
      return grant(score.playerId, { titles, avatars }, { type: sourceType, submissionId: score.submissionId, gameId: score.gameId }, profile);
    },

    /** 直接指定要解鎖的 key（歷史補判定用；仍然只接受目錄內、規則可驗證的 key） */
    async grantKeys(playerId, profile, keys, source) { return grant(playerId, keys, source, profile); },

    async get(playerId, profile) { return view(playerId, await db.get(cpaths.collection(playerId)), profile); },

    /** 裝備：titleKey（null＝不裝備）／displayAvatarKey（null＝還原成身份頭像） */
    async equip(playerId, profile, { titleKey, displayAvatarKey }) {
      const t = now();
      const r = await casUpdate(db, cpaths.collection(playerId), (cur) => {
        const c = cur && typeof cur === "object" ? { ...cur } : empty(playerId);
        const eq = { ...(c.equipped || {}) };
        if (titleKey !== undefined) {
          if (titleKey !== null && !(c.titles && c.titles[titleKey])) throw new ApiError("FORBIDDEN", { message: "這個稱號還沒有解鎖" });
          eq.titleKey = titleKey; eq.auto = false;
        }
        if (displayAvatarKey !== undefined) {
          if (displayAvatarKey !== null && displayAvatarKey !== profile.baseAvatarKey && !(c.avatars && c.avatars[displayAvatarKey])) {
            throw new ApiError("FORBIDDEN", { message: "這個頭像還沒有解鎖" });
          }
          eq.displayAvatarKey = displayAvatarKey === profile.baseAvatarKey ? null : displayAvatarKey;
        }
        eq.updatedAt = t;
        const next = { ...c, playerId, equipped: eq, rev: Number(c.rev || 0) + 1, updatedAt: t };
        return { value: next, result: next };
      });
      await mirror(playerId, r.result, profile);
      return view(playerId, r.result, profile);
    },

    /** 管理員：發放／收回「只能人工發放」的頭像（學生專屬、活動、社群） */
    async adminAvatar(playerId, profile, { avatarKey, action, note }, admin) {
      const a = AVATARS_BY_KEY[avatarKey];
      if (!a) throw new ApiError("VALIDATION_FAILED", { message: "沒有這個頭像" });
      if (a.unlock !== "admin") throw new ApiError("VALIDATION_FAILED", { message: "這個頭像只能由遊戲成績自動解鎖或條件尚未定案，不能人工發放" });
      if (!["grant", "revoke"].includes(action)) throw new ApiError("VALIDATION_FAILED");
      const t = now();
      const r = await casUpdate(db, cpaths.collection(playerId), (cur) => {
        const c = cur && typeof cur === "object" ? { ...cur } : empty(playerId);
        c.avatars = { ...(c.avatars || {}) }; c.equipped = { ...(c.equipped || {}) };
        const has = !!c.avatars[avatarKey];
        if (action === "grant" && has) return { result: { col: c, changed: false } };
        if (action === "revoke" && !has) return { result: { col: c, changed: false } };
        if (action === "grant") c.avatars[avatarKey] = { avatarKey, unlockedAt: t, source: { type: "admin", by: admin.uid, note: String(note || "").slice(0, 200) } };
        else { delete c.avatars[avatarKey]; if (c.equipped.displayAvatarKey === avatarKey) c.equipped.displayAvatarKey = null; }
        const next = { ...c, playerId, rev: Number(c.rev || 0) + 1, updatedAt: t };
        return { value: next, result: { col: next, changed: true } };
      });
      if (r.result.changed) {
        await db.put(cpaths.audit(`${playerId}_${avatarKey}_${action}_${t}`), { playerId, avatarKey, action, note: String(note || "").slice(0, 200), by: admin.uid, at: t });
        await mirror(playerId, r.result.col, profile);
      }
      return { changed: r.result.changed, collection: view(playerId, r.result.col, profile) };
    },

    async adminAudits() {
      const a = (await db.get("collectionAudit")) || {};
      return Object.values(a).sort((x, y) => y.at - x.at).slice(0, 500);
    },

    /** 排行榜／遊戲用：全部玩家目前的展示頭像與稱號（一次讀取） */
    async publicProfiles() { return (await db.get("publicProfiles")) || {}; },
    async publicProfile(playerId) { return (await db.get(cpaths.publicProfile(playerId))) || null; },
    async all() { return (await db.get("collections")) || {}; },
  };
}

/**
 * 正式資料的「命名空間」（v0.3.1）
 *
 * SCORES_ENABLED="on"    → 正式資料寫在資料庫根目錄（sessions/、scores/、leaderboards/、wallets/、collections/ …）
 * SCORES_ENABLED="trial" → 同一套程式，但所有正式資料改寫在 trial/ 底下（trial/scores/、trial/wallets/ …）
 *                           只有 TRIAL_PLAYER_IDS 名單內的玩家可以寫入。驗收完成後清除 trial/，
 *                           再改成 "on"：正式排行榜、正式錢包從乾淨的狀態開始，不會被測試資料污染。
 *
 * 玩家身份資料（players/、identities/）永遠在根目錄、不受影響（試營運玩家就是真正的遊戲宇宙玩家）。
 */
export const LAUNCH_ROOTS = Object.freeze(["sessions", "scores", "scoreIndex", "adminAudit", "leaderboards", "quizProgress", "wallets",
  "collections", "publicProfiles", "collectionAudit"]);
export const TRIAL_ROOT = "trial";

export function namespaceFor(cfg) { return cfg.scoresMode === "trial" ? TRIAL_ROOT + "/" : ""; }

function prefixPath(prefix, path) {
  if (!prefix) return path;
  const first = String(path).split("/")[0];
  return LAUNCH_ROOTS.includes(first) ? prefix + path : path;
}

/** 把資料庫操作套上命名空間（multi-path PATCH 的每一個鍵也會套用） */
export function namespacedDb(db, prefix) {
  if (!prefix) return db;
  const p = (path) => prefixPath(prefix, path);
  return {
    get: (path, o) => db.get(p(path), o),
    getWithEtag: (path) => db.getWithEtag(p(path)),
    putIfMatch: (path, v, e) => db.putIfMatch(p(path), v, e),
    put: (path, v) => db.put(p(path), v),
    remove: (path) => db.remove(p(path)),
    patch: (path, v) => {
      if (path === "" || path === "/") {
        const out = {};
        for (const [k, val] of Object.entries(v)) out[p(k)] = val;
        return db.patch("", out);
      }
      return db.patch(p(path), v);
    },
  };
}

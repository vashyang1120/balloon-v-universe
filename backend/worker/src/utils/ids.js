/**
 * ID 與日期工具
 *
 * playerId：玩家建立後永遠不變的內部 ID（例如 p_k3x7…）。
 *   與「玩家 ID 文字」「baseAvatarKey」分開：之後即使允許改名或加強驗證，資料主鍵都不用重建。
 */
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export function newPlayerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let s = "p_";
  for (const b of bytes) s += BASE32[b & 31];
  return s;
}

export function newRequestId() {
  return crypto.randomUUID();
}

/** 台灣日期（UTC+8，無日光節約）YYYY-MM-DD，給每日獎勵使用；以伺服器時間計算 */
export function taipeiDateKey(date = new Date()) {
  const t = new Date(date.getTime() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

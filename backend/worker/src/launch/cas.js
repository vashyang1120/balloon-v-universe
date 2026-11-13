/**
 * 單一節點的「讀取 → 計算 → 條件寫入」交易（Compare-And-Swap）
 *
 * Firebase Realtime Database REST：GET 帶 X-Firebase-ETag 取得版本，PUT 帶 if-match 只在版本相同時寫入，
 * 否則回 412。這在「同一個節點」上是真正的原子操作：同一時間只有一個寫入能成功，
 * 其他請求重讀最新內容後重算。需要一起保持一致的資料（例如 V幣餘額、領獎標記、帳本）
 * 必須放在同一個節點底下，才會在同一個交易邊界內。
 */
import { ApiError } from "../utils/errors.js";

/**
 * @param {object} db firebase client（getWithEtag／putIfMatch）
 * @param {string} path
 * @param {(current:any) => {value?:any, result?:any}} compute  回傳 value === undefined 代表不需要寫入
 * @param {number} [maxAttempts]
 */
export async function casUpdate(db, path, compute, maxAttempts = 8) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { value: current, etag } = await db.getWithEtag(path);
    const out = compute(current === undefined ? null : current) || {};
    if (out.value === undefined) return { written: false, value: current, result: out.result };
    try {
      await db.putIfMatch(path, out.value, etag);
      return { written: true, value: out.value, result: out.result };
    } catch (e) {
      if (e && e.code === "CONFLICT") continue;
      throw e;
    }
  }
  throw new ApiError("CONFLICT", { internal: "cas retries exhausted: " + path.split("/")[0] });
}

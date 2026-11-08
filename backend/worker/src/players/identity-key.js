/**
 * identityKey：把「正規化後的 displayId ＋ baseAvatarKey」變成資料庫索引鍵
 *
 *   identityKey = "i1_" + base64url( SHA-256( "bv-identity-v1" ␀ displayId ␀ baseAvatarKey ) )
 *
 * 為什麼不用舊的 encodeURIComponent(ID) + "__" + avatar：
 *   - 舊寫法依賴 "__" 分隔，ID 本身也能含 "__"，理論上會碰撞
 *   - 舊寫法沒有 Unicode 正規化，同樣看起來的 ID 會變成不同鍵
 *   - 新寫法用 ␀（U+0000）分隔，而 displayId 已禁止控制字元，所以兩段絕不會混淆
 *   - 長度固定 46 字、只含 Firebase 路徑安全字元
 *   - 索引鍵不含 ID 原文：無法從資料庫鍵名直接看出或列舉玩家 ID
 * "i1_" 是版本前綴：未來若規則改變，可以用 i2_ 並存，不需要一次遷移。
 */
import { bytesToBase64Url } from "../utils/base64url.js";

export const IDENTITY_KEY_PATTERN = /^i1_[A-Za-z0-9_-]{43}$/;

export async function identityKeyFor(displayId, baseAvatarKey) {
  const input = `bv-identity-v1\u0000${displayId}\u0000${baseAvatarKey}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return "i1_" + bytesToBase64Url(digest);
}

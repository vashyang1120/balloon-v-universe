/**
 * 管理員驗證 Middleware
 *
 * 必須「全部」通過才算管理員：
 *   1. 請求帶 Authorization: Bearer <Firebase ID Token>
 *   2. Token 通過完整驗證（簽章、專案、期限，見 services/firebase-id-token.js）
 *   3. 登入方式是 Google（google.com）——匿名登入一律不是管理員
 *   4. Token 的 UID 在伺服器端名單 ADMIN_UIDS（Cloudflare Secret）中
 *
 * 不使用 Email 字串判斷，也沒有任何固定管理員密碼。
 * 名單未設定時，所有管理請求一律拒絕（fail closed）。
 */
import { ApiError } from "../utils/errors.js";
import { verifyFirebaseIdToken, TokenError } from "../services/firebase-id-token.js";

export const ADMIN_SIGN_IN_PROVIDERS = Object.freeze(["google.com"]);

export function bearerToken(request) {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * @returns {Promise<{uid:string, signInProvider:string}>}
 */
export async function requireAdmin(request, { cfg, jwks, now, logger }) {
  if (!cfg.adminConfigured) {
    throw new ApiError("SERVICE_NOT_CONFIGURED", { message: "管理功能尚未設定", internal: "ADMIN_UIDS or FIREBASE_PROJECT_ID missing" });
  }
  const token = bearerToken(request);
  if (!token) throw new ApiError("UNAUTHENTICATED");

  let user;
  try {
    user = await verifyFirebaseIdToken(token, { projectId: cfg.projectId, jwks, now });
  } catch (e) {
    const reason = e instanceof TokenError ? e.reason : "verify error";
    logger?.warn("admin token rejected", { reason });
    throw new ApiError("UNAUTHENTICATED", { internal: "id token rejected: " + reason });
  }

  if (!ADMIN_SIGN_IN_PROVIDERS.includes(user.signInProvider)) {
    logger?.warn("admin rejected: sign-in provider", { provider: user.signInProvider });
    throw new ApiError("FORBIDDEN");
  }
  if (!cfg.adminUids.includes(user.uid)) {
    logger?.warn("admin rejected: uid not in allowlist");
    throw new ApiError("FORBIDDEN");
  }
  return { uid: user.uid, signInProvider: user.signInProvider };
}

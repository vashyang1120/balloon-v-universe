/**
 * 遊戲版本識別
 *
 * 遊戲端每個請求帶標頭：
 *   X-BV-Client: <gameId>/<gameVersion> sdk/<sdkVersion>
 *   例：X-BV-Client: tetris/2.0.0 sdk/1.0.0
 *
 * 用途：記錄、相容性判斷，以及之後依遊戲版本套用不同驗證規則。
 * 這只是「自稱」的資訊，不能當作安全依據。
 */
import { ApiError } from "../utils/errors.js";
import { PATTERNS } from "../utils/validate.js";
import { GAME_ID_PATTERN, isKnownGame } from "../games.js";

const CLIENT = /^([a-z][a-z0-9-]{1,31})\/(\S{1,48})(?:\s+sdk\/(\S{1,48}))?$/;

export function parseClientInfo(request) {
  const raw = request.headers.get("x-bv-client");
  if (raw == null || raw === "") return null;
  const m = CLIENT.exec(raw.trim());
  if (!m || !GAME_ID_PATTERN.test(m[1]) || !PATTERNS.semver.test(m[2]) || (m[3] && !PATTERNS.semver.test(m[3]))) {
    throw new ApiError("BAD_REQUEST", { message: "X-BV-Client 標頭格式不正確", details: { expected: "gameId/1.2.3 sdk/1.0.0" } });
  }
  if (!isKnownGame(m[1])) throw new ApiError("UNKNOWN_GAME", { details: { gameId: m[1] } });
  return { gameId: m[1], gameVersion: m[2], sdkVersion: m[3] || null };
}

/**
 * 遊戲結果提交的「信封格式」驗證（v0.1.0 只定格式，尚未開放提交）
 *
 * 每場遊戲結果必須有唯一 submissionId（遊戲端用 crypto.randomUUID() 產生），
 * 網路不穩重送時，伺服器用它判斷「同一場」而不會重複發獎勵：
 *   gameResults/{gameId}/{submissionId} 以 ETag 條件寫入，已存在就回 DUPLICATE_SUBMISSION。
 *
 * result 內容由各遊戲自訂，伺服器依 gameId 套用不同的合理範圍檢查（之後版本實作）。
 */
import { assertValid, PATTERNS } from "../utils/validate.js";
import { ApiError } from "../utils/errors.js";
import { GAME_ID_PATTERN, isKnownGame } from "../games.js";

export const GAME_RESULT_ENVELOPE = Object.freeze({
  submissionId: { type: "string", required: true, pattern: PATTERNS.submissionId },
  gameId:       { type: "string", required: true, pattern: GAME_ID_PATTERN },
  gameVersion:  { type: "string", required: true, pattern: PATTERNS.semver },
  sdkVersion:   { type: "string", required: false, pattern: PATTERNS.semver },
  playerId:     { type: "string", required: true, pattern: PATTERNS.playerId },
  mode:         { type: "string", required: false, max: 32, pattern: /^[a-z0-9_-]+$/ },
  startedAt:    { type: "integer", required: false, min: 0 },
  durationMs:   { type: "integer", required: true, min: 0, max: 3 * 3600 * 1000 },
  result:       { type: "object", required: true, maxKeys: 40 },
});

export function validateGameResultEnvelope(body, client) {
  const v = assertValid(body, GAME_RESULT_ENVELOPE);
  if (!isKnownGame(v.gameId)) throw new ApiError("UNKNOWN_GAME", { details: { gameId: v.gameId } });
  if (client && (client.gameId !== v.gameId || client.gameVersion !== v.gameVersion)) {
    throw new ApiError("VALIDATION_FAILED", { details: { errors: [{ field: "gameId/gameVersion", issue: "與 X-BV-Client 標頭不一致" }] } });
  }
  return v;
}

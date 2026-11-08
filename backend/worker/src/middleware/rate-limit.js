/**
 * 限流（防止機器人大量建立身份、大量查詢）
 *
 * 兩層：
 *   1. Cloudflare Rate Limiting binding（若 wrangler.jsonc 有設定 RL_PLAYER_CREATE / RL_PLAYER_LOOKUP）
 *      —— 由 Cloudflare 在各機房計數，跨 Worker 實例有效，但仍是「近似值」
 *   2. 沒有 binding 時退回「單一 Worker 實例記憶體計數」
 *      —— 只能擋住同一實例上的連續濫用；Cloudflare 會把流量分散到多個實例，
 *         所以這只是基本防護，不是可靠的全域限流
 *
 * 以連線 IP（CF-Connecting-IP）為單位。學校、補習班多人共用同一個 IP，
 * 所以建立上限刻意放寬（每分鐘 30 次），避免一整班同時建立身份被擋。
 */
import { ApiError } from "../utils/errors.js";

export const LIMITS = Object.freeze({
  "player-create": { limit: 30, periodMs: 60_000, binding: "RL_PLAYER_CREATE" },
  "player-lookup": { limit: 120, periodMs: 60_000, binding: "RL_PLAYER_LOOKUP" },
});

const MAX_TRACKED = 5000;
const memory = new Map(); // key → { count, resetAt }

function clientKey(request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  return ip.slice(0, 64);
}

function memoryHit(key, rule, nowMs) {
  let e = memory.get(key);
  if (!e || nowMs >= e.resetAt) {
    if (memory.size >= MAX_TRACKED) {
      for (const [k, v] of memory) if (nowMs >= v.resetAt) memory.delete(k);
      if (memory.size >= MAX_TRACKED) memory.clear();
    }
    e = { count: 0, resetAt: nowMs + rule.periodMs };
    memory.set(key, e);
  }
  e.count++;
  return e.count <= rule.limit;
}

/**
 * @returns {Promise<"binding"|"memory">} 使用了哪一層
 */
export async function enforceRateLimit(ctx, bucket, nowMs = Date.now()) {
  const rule = LIMITS[bucket];
  if (!rule) throw new ApiError("INTERNAL", { internal: "unknown rate limit bucket" });
  const key = `${bucket}:${clientKey(ctx.request)}`;
  const binding = ctx.env && ctx.env[rule.binding];
  let allowed;
  let layer;
  if (binding && typeof binding.limit === "function") {
    layer = "binding";
    try {
      allowed = (await binding.limit({ key })).success !== false;
    } catch {
      layer = "memory"; // binding 暫時故障：退回記憶體計數，不讓整個 API 掛掉
      allowed = memoryHit(key, rule, nowMs);
    }
  } else {
    layer = "memory";
    allowed = memoryHit(key, rule, nowMs);
  }
  if (!allowed) {
    ctx.logger?.warn("rate limited", { bucket, layer });
    throw new ApiError("RATE_LIMITED", { headers: { "retry-after": String(Math.ceil(rule.periodMs / 1000)) } });
  }
  return layer;
}

/** 測試用：清空記憶體計數 */
export function _resetMemoryLimiter() {
  memory.clear();
}

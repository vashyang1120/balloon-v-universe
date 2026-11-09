/**
 * 限流（防止機器人大量建立身份、大量查詢）—— v0.3.0-test-2
 *
 * ── 為什麼這樣分 ───────────────────────────────────────
 * 遊戲宇宙的玩家有很多是兒童，常見「一整班用同一個學校 Wi-Fi（同一個 IP）同時建立身份」。
 * 所以不能用很低的「每 IP 上限」；改用兩種規則搭配：
 *
 *   建立玩家（會寫入資料庫，最需要防護）
 *     ① 每個 IP：每分鐘 60 次     → 一班 30～40 人各建立一次、部分重按也不會被擋；
 *                                   單一來源的機器人每分鐘最多 60 個
 *     ② 全體（每個 Cloudflare 機房）：每分鐘 300 次
 *                                 → 就算攻擊者換很多 IP，一個機房每分鐘最多寫入 300 個新玩家，
 *                                   讓 Firebase 免費額度不會被瞬間灌爆
 *   找回玩家＋讀取公開資料（只讀取）
 *     ③ 每個 IP：每分鐘 300 次     → 一班同時找回、重試都足夠
 *   身份圖案清單：不限流（靜態內容、不讀資料庫、可快取）
 *
 * 不使用「玩家 ID」或「createRequestId」當限流鍵：那些都是使用者自己填的，
 * 換一個值就能繞過，對防大量建立沒有幫助。
 *
 * ── 兩層實作 ───────────────────────────────────────────
 *   1. Cloudflare Rate Limiting binding（wrangler.jsonc 的 ratelimits）：
 *      由 Cloudflare 在「每個機房」分別計數，跨 Worker 實例有效。
 *      ⚠ 官方說明：計數是近似值、各機房分開、最終一致 —— 不是無法繞過的安全機制。
 *   2. 沒有 binding（或 binding 暫時故障）時，退回「單一 Worker 實例記憶體計數」：
 *      只能擋住同一實例上的連續濫用，屬於基本防護。
 *
 * 數字都在下方 RULES，可依實際使用情況調整（只能選 10 或 60 秒的週期，這是 Cloudflare 的限制）。
 *
 * ── 可觀測性（v0.3.0-test-3 加入）─────────────────────
 *   每個請求的既有「request」記錄會多一個 rl 欄位，例如：
 *     rl: "lookup:binding"            官方 binding 正常計數
 *     rl: "lookup:memory(missing)"    沒有 binding（設定未部署或名稱不符）→ 備援
 *     rl: "lookup:memory(error)"      binding 呼叫失敗 → 備援
 *   另外每個 Worker 實例對每個 binding 的「缺少」或「失敗」只會警告一次（不洗版），
 *   只記錄錯誤類型名稱，不記錄任何內容。不會多產生每個請求的額外記錄。
 */
import { ApiError } from "../utils/errors.js";

export const RULES = Object.freeze({
  create: Object.freeze([
    Object.freeze({ id: "create-ip",     binding: "RL_CREATE_IP",     limit: 60,  periodSec: 60, scope: "ip" }),
    Object.freeze({ id: "create-global", binding: "RL_CREATE_GLOBAL", limit: 300, periodSec: 60, scope: "global" }),
  ]),
  lookup: Object.freeze([
    Object.freeze({ id: "lookup-ip",     binding: "RL_LOOKUP_IP",     limit: 300, periodSec: 60, scope: "ip" }),
  ]),
});

const MAX_TRACKED = 5000;
const memory = new Map(); // key → { count, resetAt }
const warned = new Set(); // 每個 Worker 實例：已經警告過的「binding:原因」

function clientIp(request) {
  return (request.headers.get("cf-connecting-ip") || "unknown").slice(0, 64);
}

function memoryHit(key, rule, nowMs) {
  let e = memory.get(key);
  if (!e || nowMs >= e.resetAt) {
    if (memory.size >= MAX_TRACKED) {
      for (const [k, v] of memory) if (nowMs >= v.resetAt) memory.delete(k);
      if (memory.size >= MAX_TRACKED) memory.clear();
    }
    e = { count: 0, resetAt: nowMs + rule.periodSec * 1000 };
    memory.set(key, e);
  }
  e.count++;
  return e.count <= rule.limit;
}

function warnOnce(ctx, rule, reason, errorName) {
  const id = `${rule.binding}:${reason}`;
  if (warned.has(id)) return;
  warned.add(id);
  ctx.logger?.warn("rate limit fallback", { binding: rule.binding, reason, error: errorName });
}

async function check(ctx, rule, nowMs) {
  const key = rule.scope === "global" ? `${rule.id}:all` : `${rule.id}:${clientIp(ctx.request)}`;
  const binding = ctx.env && ctx.env[rule.binding];
  if (binding && typeof binding.limit === "function") {
    try {
      const r = await binding.limit({ key });
      return { allowed: r == null || r.success !== false, layer: "binding" };
    } catch (e) {
      // binding 暫時故障：退回記憶體計數，不讓整個 API 掛掉；只記錄錯誤類型名稱
      warnOnce(ctx, rule, "error", e && typeof e.name === "string" ? e.name.slice(0, 40) : "Error");
      return { allowed: memoryHit(key, rule, nowMs), layer: "memory(error)" };
    }
  }
  warnOnce(ctx, rule, "missing");
  return { allowed: memoryHit(key, rule, nowMs), layer: "memory(missing)" };
}

/**
 * 依序檢查這個動作的所有規則；任何一條超過就回 429。
 * @param {"create"|"lookup"} action
 * @returns {Promise<string[]>} 每條規則使用的層（binding / memory），測試與記錄用
 */
export async function enforceRateLimit(ctx, action, nowMs = Date.now()) {
  const rules = RULES[action];
  if (!rules) throw new ApiError("INTERNAL", { internal: "unknown rate limit action" });
  const layers = [];
  ctx.rateLimit = { action, layers };
  for (const rule of rules) {
    const { allowed, layer } = await check(ctx, rule, nowMs);
    layers.push(layer);
    if (!allowed) {
      ctx.logger?.warn("rate limited", { rule: rule.id, layer });
      throw new ApiError("RATE_LIMITED", { headers: { "retry-after": String(rule.periodSec) } });
    }
  }
  return layers;
}

/** 給 request 記錄用的簡短摘要，例如 "lookup:binding" 或 "create:binding,memory(missing)" */
export function rateLimitSummary(ctx) {
  const r = ctx && ctx.rateLimit;
  if (!r || !r.layers.length) return undefined;
  const uniq = [...new Set(r.layers)];
  return `${r.action}:${uniq.join(",")}`;
}

/** 測試用：清空記憶體計數與「已警告」紀錄 */
export function _resetMemoryLimiter() {
  memory.clear();
  warned.clear();
}

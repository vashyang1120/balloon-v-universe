/**
 * 已遮罩的結構化記錄。
 * 規則：
 *  - 欄位名稱像 token / secret / key / password / authorization / assertion 的值一律遮罩
 *  - 字串內容若像私鑰（-----BEGIN）、JWT（eyJ…）、Google Access Token（ya29.）也遮罩
 *  - 不輸出錯誤堆疊
 */
const SENSITIVE_KEY = /(token|secret|password|passwd|authorization|assertion|private|credential|api[-_]?key|cookie|service[-_]?account)/i;
const PEM = /-----BEGIN [A-Z ]+-----[\s\S]*?(-----END [A-Z ]+-----|$)/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const GOOGLE_TOKEN = /ya29\.[A-Za-z0-9._-]+/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

export const REDACTED = "[REDACTED]";

export function scrubString(s) {
  return String(s)
    .replace(PEM, REDACTED)
    .replace(JWT, REDACTED)
    .replace(GOOGLE_TOKEN, REDACTED)
    .replace(BEARER, "Bearer " + REDACTED);
}

export function redact(value, depth = 0) {
  if (depth > 6) return "[…]";
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message) };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

export function createLogger(base = {}, sink = console) {
  function emit(level, msg, fields) {
    const line = redact({ level, msg, ...base, ...(fields || {}), time: new Date().toISOString() });
    const fn = level === "error" ? sink.error : level === "warn" ? sink.warn : sink.log;
    try { fn.call(sink, JSON.stringify(line)); } catch { /* 記錄失敗不影響請求 */ }
  }
  return {
    info: (msg, f) => emit("info", msg, f),
    warn: (msg, f) => emit("warn", msg, f),
    error: (msg, f) => emit("error", msg, f),
    child: (more) => createLogger({ ...base, ...more }, sink),
  };
}

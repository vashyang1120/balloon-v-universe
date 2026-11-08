/**
 * 輕量資料驗證（不引入外部套件，避免增加 Worker 大小與 CPU 時間）
 *
 * schema 寫法：
 *   { field: { type: "string", required: true, min: 1, max: 32, pattern: /.../, enum: [...] } }
 *   type 支援：string、integer、number、boolean、object
 * 回傳 { value, errors }；errors 為 [{ field, issue }]
 */
import { ApiError } from "./errors.js";

export function validate(input, schema) {
  const errors = [];
  const value = {};
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return { value, errors: [{ field: "(body)", issue: "必須是 JSON 物件" }] };
  }
  for (const [field, rule] of Object.entries(schema)) {
    const v = input[field];
    if (v === undefined || v === null) {
      if (rule.required) errors.push({ field, issue: "必填" });
      continue;
    }
    const issue = checkOne(v, rule);
    if (issue) errors.push({ field, issue });
    else value[field] = v;
  }
  for (const k of Object.keys(input)) {
    if (!(k in schema)) errors.push({ field: k, issue: "不允許的欄位" });
  }
  return { value, errors };
}

function checkOne(v, r) {
  switch (r.type) {
    case "string":
      if (typeof v !== "string") return "必須是文字";
      if (r.min != null && [...v].length < r.min) return `至少 ${r.min} 個字`;
      if (r.max != null && [...v].length > r.max) return `最多 ${r.max} 個字`;
      if (r.pattern && !r.pattern.test(v)) return "格式不正確";
      if (r.enum && !r.enum.includes(v)) return "不是允許的值";
      return null;
    case "integer":
      if (!Number.isInteger(v)) return "必須是整數";
      return range(v, r);
    case "number":
      if (typeof v !== "number" || !Number.isFinite(v)) return "必須是數字";
      return range(v, r);
    case "boolean":
      return typeof v === "boolean" ? null : "必須是 true 或 false";
    case "object":
      if (typeof v !== "object" || Array.isArray(v)) return "必須是物件";
      if (r.maxKeys != null && Object.keys(v).length > r.maxKeys) return `最多 ${r.maxKeys} 個欄位`;
      return null;
    default:
      return "未知的驗證型別";
  }
}

function range(v, r) {
  if (r.min != null && v < r.min) return `不可小於 ${r.min}`;
  if (r.max != null && v > r.max) return `不可大於 ${r.max}`;
  return null;
}

/** 驗證失敗直接丟 VALIDATION_FAILED */
export function assertValid(input, schema) {
  const { value, errors } = validate(input, schema);
  if (errors.length) throw new ApiError("VALIDATION_FAILED", { details: { errors } });
  return value;
}

/** 共用格式 */
export const PATTERNS = Object.freeze({
  // 遊戲結果的唯一提交 ID：由遊戲端產生（建議 crypto.randomUUID()），用於重試去重
  submissionId: /^[A-Za-z0-9_-]{16,64}$/,
  // 版本號：1.2.3 或 1.2.3-test-1
  semver: /^\d{1,4}\.\d{1,4}\.\d{1,4}(-[0-9A-Za-z.-]{1,32})?$/,
  // 伺服器產生的玩家內部 ID（見 utils/ids.js）
  playerId: /^p_[a-z2-7]{20}$/,
  // Firebase UID
  firebaseUid: /^[A-Za-z0-9:_-]{1,128}$/,
});

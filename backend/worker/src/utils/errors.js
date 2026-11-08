/**
 * 統一錯誤代碼。
 * 每個代碼固定對應一個 HTTP 狀態與一段「可以給玩家看的」中文訊息。
 * 內部細節（Firebase 回應、堆疊）永遠不放進回應，只放在已遮罩的伺服器記錄。
 */
export const ERROR_CODES = Object.freeze({
  BAD_REQUEST:            { status: 400, message: "請求格式不正確" },
  VALIDATION_FAILED:      { status: 400, message: "資料內容不符合規格" },
  UNKNOWN_GAME:           { status: 400, message: "不認得的遊戲代碼" },
  UNAUTHENTICATED:        { status: 401, message: "需要登入" },
  FORBIDDEN:              { status: 403, message: "沒有權限執行這個動作" },
  ORIGIN_NOT_ALLOWED:     { status: 403, message: "這個網站來源不被允許" },
  NOT_FOUND:              { status: 404, message: "找不到這個 API" },
  METHOD_NOT_ALLOWED:     { status: 405, message: "不支援這個請求方法" },
  CONFLICT:               { status: 409, message: "資料已被其他請求更新，請重試" },
  DUPLICATE_SUBMISSION:   { status: 409, message: "這筆資料已經送出過" },
  PAYLOAD_TOO_LARGE:      { status: 413, message: "送出的資料太大" },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "請使用 application/json" },
  RATE_LIMITED:           { status: 429, message: "請求太頻繁，請稍後再試" },
  INTERNAL:               { status: 500, message: "伺服器發生錯誤" },
  NOT_IMPLEMENTED:        { status: 501, message: "這個功能尚未開放" },
  UPSTREAM_UNAVAILABLE:   { status: 502, message: "資料服務暫時無法使用" },
  SERVICE_NOT_CONFIGURED: { status: 503, message: "服務尚未完成設定" },
  UPSTREAM_TIMEOUT:       { status: 504, message: "資料服務回應逾時" },
});

export class ApiError extends Error {
  /**
   * @param {keyof ERROR_CODES} code
   * @param {object} [opts]
   * @param {string} [opts.message]  覆蓋給使用者看的訊息（不可含私密資訊）
   * @param {object} [opts.details]  給使用者看的補充（例如哪個欄位錯）
   * @param {string} [opts.internal] 只寫進伺服器記錄的原因（會再經過遮罩）
   * @param {object} [opts.headers]  額外回應標頭（例如 Allow）
   */
  constructor(code, opts = {}) {
    const def = ERROR_CODES[code] || ERROR_CODES.INTERNAL;
    super(opts.message || def.message);
    this.name = "ApiError";
    this.code = ERROR_CODES[code] ? code : "INTERNAL";
    this.status = def.status;
    this.details = opts.details;
    this.internal = opts.internal;
    this.headers = opts.headers;
  }
}

export function isApiError(e) {
  return e instanceof ApiError;
}

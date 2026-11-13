/**
 * 讀取並檢查環境設定。
 * 公開設定來自 wrangler.jsonc 的 vars；私密設定來自 Cloudflare Secrets。
 * 這裡只回報「有沒有設定」，絕不回傳私密值本身。
 */
export const SERVICE_NAME = "balloon-v-universe-api";
export const API_VERSION = "0.5.0";
export const RELEASE = "balloon-v-universe-v0.3.1-trial-setup-test-1";

const DB_URL = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const ORIGIN = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;

export function readConfig(env = {}) {
  const serviceEnv = env.SERVICE_ENV === "development" ? "development" : "production";

  const allowedOrigins = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s && s !== "*" && ORIGIN.test(s))
    // 正式環境不接受 http:// 來源（例如 localhost）
    .filter((s) => serviceEnv === "development" || s.startsWith("https://"));

  const projectId = PROJECT_ID.test(String(env.FIREBASE_PROJECT_ID || "")) ? env.FIREBASE_PROJECT_ID : "";
  const databaseUrl = DB_URL.test(String(env.FIREBASE_DATABASE_URL || "").replace(/\/+$/, ""))
    ? String(env.FIREBASE_DATABASE_URL).replace(/\/+$/, "")
    : "";

  const timeout = Number.parseInt(env.FIREBASE_TIMEOUT_MS, 10);
  const firebaseTimeoutMs = Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1000), 20000) : 8000;

  const adminUids = String(env.ADMIN_UIDS || "")
    .split(/[\s,]+/)
    .filter((s) => /^[A-Za-z0-9:_-]{1,128}$/.test(s));

  return {
    serviceEnv,
    allowedOrigins,
    projectId,
    databaseUrl,
    firebaseTimeoutMs,
    adminUids,
    hasServiceAccount: typeof env.FIREBASE_SERVICE_ACCOUNT_JSON === "string" && env.FIREBASE_SERVICE_ACCOUNT_JSON.trim().length > 0,
    // 是否已具備真實連線 Firebase 的所有條件（仍不代表連線成功）
    firebaseConfigured: Boolean(projectId && databaseUrl && env.FIREBASE_SERVICE_ACCOUNT_JSON),
    adminConfigured: Boolean(projectId && adminUids.length),
    // v0.3.0：正式寫入開關（預設關閉；只有明確設成 "on" 才開啟）
    scoresEnabled: env.SCORES_ENABLED === "on",
    rewardsEnabled: env.SCORES_ENABLED === "on" && env.REWARDS_ENABLED === "on",
    // v0.3.1：受控試營運（"trial"）
    //   SCORES_ENABLED="trial"：只有 TRIAL_PLAYER_IDS 名單內的玩家可以寫入；所有正式資料寫在獨立的 trial/ 底下
    //   （不碰正式排行榜、正式錢包；驗收後可用管理後台一鍵清除，再切換成 "on"）
    //   REWARDS_ENABLED="trial" 或 "on"：試營運時也發 V幣（同樣寫在 trial/ 底下）
    scoresMode: env.SCORES_ENABLED === "on" ? "on" : env.SCORES_ENABLED === "trial" ? "trial" : "off",
    rewardsMode: env.SCORES_ENABLED === "on" ? (env.REWARDS_ENABLED === "on" ? "on" : "off")
      : env.SCORES_ENABLED === "trial" ? (env.REWARDS_ENABLED === "trial" || env.REWARDS_ENABLED === "on" ? "trial" : "off") : "off",
    trialPlayerIds: String(env.TRIAL_PLAYER_IDS || "").split(/[\s,]+/).filter((s) => /^p_[a-z2-7]{20}$/.test(s)).slice(0, 20),
  };
}

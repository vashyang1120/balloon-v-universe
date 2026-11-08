/**
 * 預留的功能分類。v0.1.0 只先固定「路由前綴、權限等級」，
 * 尚未實作的一律回 501 NOT_IMPLEMENTED（統一格式），不會有任何資料被讀寫。
 *
 * 權限等級在路由層就先套用：admin、exports 即使還沒實作，也必須先通過管理員驗證，
 * 避免未來補上功能時忘記加權限。
 */
import { ApiError } from "../utils/errors.js";

export const CATEGORIES = Object.freeze([
  { name: "players",      auth: "player", status: "reserved", note: "建立身份、找回、切換展示頭像" },
  { name: "wallet",       auth: "player", status: "reserved", note: "查詢 V幣、交易紀錄、每日獎勵" },
  { name: "game-results", auth: "player", status: "reserved", note: "提交遊戲結果（需唯一 submissionId）" },
  { name: "leaderboards", auth: "public", status: "reserved", note: "讀取排行榜（寫入只由伺服器）" },
  { name: "avatars",      auth: "public", status: "reserved", note: "頭像目錄；解鎖只由伺服器" },
  { name: "titles",       auth: "public", status: "reserved", note: "稱號目錄；發放只由伺服器" },
  { name: "shop",         auth: "player", status: "reserved", note: "V幣消費（需加強身份驗證後才開放）" },
  { name: "admin",        auth: "admin",  status: "reserved", note: "管理後台" },
  { name: "exports",      auth: "admin",  status: "reserved", note: "CSV 匯出" },
]);

export function reservedRoutes() {
  const out = [];
  for (const c of CATEGORIES) {
    const handler = () => {
      throw new ApiError("NOT_IMPLEMENTED", { details: { category: c.name } });
    };
    out.push({ method: "*", path: `/v1/${c.name}`, auth: c.auth, handler, summary: `預留：${c.note}` });
    out.push({ method: "*", path: `/v1/${c.name}/*`, auth: c.auth, handler, summary: `預留：${c.note}` });
  }
  return out;
}

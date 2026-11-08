/**
 * 玩家 ID（displayId）規則 —— 遊戲宇宙所有遊戲共用
 *
 * 處理順序（每一步都固定，確保不同裝置輸入同樣看起來的 ID 會得到同一個結果）：
 *   1. 原始輸入長度上限（防止超長惡意字串耗 CPU）
 *   2. Unicode NFKC 正規化：
 *        - 全形英數 → 半形（「ＡＢＣ１」→「ABC1」），中文輸入法常打出全形字
 *        - 組合字統一（例如「é」兩種編碼視為同一個字）
 *        - 全形空白「　」→ 一般空白
 *      ⚠ NFKC 不會改變英文大小寫：「Amy」和「amy」是不同 ID
 *   3. 所有空白類字元換成一般空白，連續空白合併成一個，去除頭尾空白（保留中間空白）
 *   4. 拒絕控制字元、隱形格式字元（零寬字元、文字方向控制）、私用區、未定義字元、換行
 *   5. 以「看得到的字數」（grapheme）計算長度：中文 1 字＝1、emoji 1 個＝1
 *
 * 正規化後的結果就是正式的 displayId（會存進資料庫、顯示給玩家）。
 */
export const ID_RULES = Object.freeze({
  minChars: 2,          // ⚠ 大廳 v0.3.3 目前允許 1～20 個字（見 docs/PLAYERS.md 相容性一節）
  maxChars: 16,
  maxUtf8Bytes: 128,    // 16 個帶膚色的 emoji 約 128 bytes
  maxRawLength: 200,    // 正規化前的原始輸入上限（UTF-16 長度）
  reserved: Object.freeze(["玩家"]), // 舊遊戲與大廳的預設名稱，避免混淆
});

// 控制字元、格式字元（含零寬字元、方向控制）、代理字元、私用區、未定義、行／段落分隔
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;
const LEADING_MARK = /^\p{M}/u;
const SPACES = /[\s\p{Zs}]+/gu;

let segmenter = null;
function graphemeCount(s) {
  try {
    if (!segmenter) segmenter = new Intl.Segmenter("zh-Hant", { granularity: "grapheme" });
    let n = 0;
    for (const _ of segmenter.segment(s)) n++;
    return n;
  } catch {
    return Array.from(s).length; // 環境不支援時退回以字元計算（較嚴格）
  }
}

/**
 * @returns {{ ok: true, value: string, chars: number } | { ok: false, code: string, message: string }}
 */
export function normalizeDisplayId(raw) {
  if (typeof raw !== "string") return bad("ID_NOT_TEXT", "請輸入玩家 ID");
  if (raw.length > ID_RULES.maxRawLength) return bad("ID_TOO_LONG", `玩家 ID 最多 ${ID_RULES.maxChars} 個字`);

  let s;
  try {
    s = raw.normalize("NFKC");
  } catch {
    return bad("ID_INVALID_CHAR", "玩家 ID 裡有無法使用的字");
  }
  s = s.replace(SPACES, " ").trim();

  if (!s) return bad("ID_EMPTY", "請輸入玩家 ID");
  if (FORBIDDEN.test(s)) return bad("ID_INVALID_CHAR", "玩家 ID 裡有看不見或無法使用的特殊字元，請重新輸入");
  if (LEADING_MARK.test(s)) return bad("ID_INVALID_CHAR", "玩家 ID 的第一個字無法使用，請重新輸入");

  const chars = graphemeCount(s);
  if (chars < ID_RULES.minChars) return bad("ID_TOO_SHORT", `玩家 ID 至少要 ${ID_RULES.minChars} 個字`);
  if (chars > ID_RULES.maxChars) return bad("ID_TOO_LONG", `玩家 ID 最多 ${ID_RULES.maxChars} 個字`);
  if (new TextEncoder().encode(s).length > ID_RULES.maxUtf8Bytes) return bad("ID_TOO_LONG", "玩家 ID 太長了，請少用一些表情符號");
  if (ID_RULES.reserved.includes(s)) return bad("ID_RESERVED", `「${s}」是遊戲的預設名稱，請換一個 ID`);

  return { ok: true, value: s, chars };
}

function bad(code, message) {
  return { ok: false, code, message };
}

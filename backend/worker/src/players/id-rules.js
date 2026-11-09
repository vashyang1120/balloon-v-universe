/**
 * 玩家 ID（displayId）規則 —— 遊戲宇宙所有遊戲共用
 *
 * 長度沿用大廳 v0.3.3 已驗收的規則：1～20 個字。
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
 *      例外：組成 emoji 必要的隱形字元可以使用（家庭 👨‍👩‍👧、職業 👩🏽‍💻、彩虹旗 🏳️‍🌈、
 *      蘇格蘭旗 🏴󠁧󠁢󠁳󠁣󠁴󠁿），因為大廳 v0.3.3 允許輸入它們
 *   5. 以「看得到的字數」（grapheme）計算長度：中文 1 字＝1、emoji 1 個＝1
 *
 * 正規化後的結果就是正式的 displayId（會存進資料庫、顯示給玩家）。
 * 若和玩家輸入的樣子不同（例如全形變半形），API 會回 displayIdChanged: true，
 * 大廳應顯示伺服器回傳的 displayId，讓孩子知道自己的 ID 實際長什麼樣子。
 */
export const ID_RULES = Object.freeze({
  minChars: 1,          // 與大廳 v0.3.3 相同
  maxChars: 20,         // 與大廳 v0.3.3 相同（大廳以碼位計算，最多 20 碼位一定 ≤ 20 字）
  maxCodePoints: 64,    // 防止用大量組合字元塞爆單一「字」
  maxUtf8Bytes: 200,
  maxRawLength: 200,    // 正規化前的原始輸入上限（UTF-16 長度）
  reserved: Object.freeze(["玩家"]), // 與大廳 v0.3.3 相同：舊遊戲與大廳的預設名稱
});

// 控制字元、格式字元（含零寬字元、方向控制）、代理字元、私用區、未定義、行／段落分隔
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;
const LEADING_MARK = /^\p{M}/u;
const SPACES = /[\s\p{Zs}]+/gu;
// emoji 中合法的 ZWJ：前面是圖形 emoji（可帶 FE0F 或膚色），後面也是圖形 emoji
const EMOJI_ZWJ = /(\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)‍(?=\p{Extended_Pictographic})/gu;
// 地區旗幟（🏴 + 標籤字元 + 結束標籤），例如蘇格蘭旗
const EMOJI_TAG_FLAG = /\u{1F3F4}[\u{E0061}-\u{E007A}]{2,7}\u{E007F}/gu;

let segmenter = null;
function graphemeCount(s) {
  try {
    if (!segmenter) segmenter = new Intl.Segmenter("zh-Hant", { granularity: "grapheme" });
    let n = 0;
    for (const _ of segmenter.segment(s)) n++;
    return n;
  } catch {
    return Array.from(s).length; // 環境不支援時退回以碼位計算（較嚴格）
  }
}

/** 只用來檢查：把合法 emoji 裡的隱形字元拿掉，剩下的若還有隱形字元就是不合法 */
function withoutEmojiJoiners(s) {
  return s.replace(EMOJI_TAG_FLAG, "\u{1F3F4}").replace(EMOJI_ZWJ, "$1");
}

/**
 * @returns {{ ok: true, value: string, chars: number, changed: boolean }
 *         | { ok: false, code: string, message: string }}
 *   changed：正規化後和「玩家輸入去掉頭尾空白」的樣子不同（例如全形變半形、連續空白合併）
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
  if (FORBIDDEN.test(withoutEmojiJoiners(s))) return bad("ID_INVALID_CHAR", "玩家 ID 裡有看不見或無法使用的特殊字元，請重新輸入");
  if (LEADING_MARK.test(s)) return bad("ID_INVALID_CHAR", "玩家 ID 的第一個字無法使用，請重新輸入");

  const chars = graphemeCount(s);
  if (chars < ID_RULES.minChars) return bad("ID_TOO_SHORT", `玩家 ID 至少要 ${ID_RULES.minChars} 個字`);
  if (chars > ID_RULES.maxChars) return bad("ID_TOO_LONG", `玩家 ID 最多 ${ID_RULES.maxChars} 個字`);
  if (Array.from(s).length > ID_RULES.maxCodePoints || new TextEncoder().encode(s).length > ID_RULES.maxUtf8Bytes) {
    return bad("ID_TOO_LONG", "玩家 ID 太長了，請少用一些表情符號");
  }
  if (ID_RULES.reserved.includes(s)) return bad("ID_RESERVED", `「${s}」是遊戲的預設名稱，請換一個 ID`);

  return { ok: true, value: s, chars, changed: s !== raw.trim() };
}

function bad(code, message) {
  return { ok: false, code, message };
}

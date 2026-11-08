/**
 * 固定身份圖案目錄（baseAvatarKey）
 *
 * - 身份圖案是「身份的一部分」：ID＋身份圖案決定是哪一位玩家，建立後不能更換。
 * - 展示頭像（displayAvatarKey）是另一回事，之後由頭像收藏系統管理，切換不影響身份。
 * - 前 17 款沿用大廳 v0.3.3（zones.js builtinAvatars）的識別鍵與名稱，鍵值永遠不改名。
 * - 新增圖案：在下方加一筆 status: "planned"，素材確定上線後改成 "active"。
 *   只有 active 會出現在 API 清單、也只有 active 能用來建立新玩家；
 *   已經建立的玩家不受影響（資料庫不需要遷移）。
 * - 圖片檔不在後端：前端以 key 對應自己的圖片（目前大廳用 <key>.png）。
 */
export const BASE_AVATAR_CATALOG_VERSION = 1;

export const BASE_AVATARS = Object.freeze([
  { key: "boy1",  label: "男生1", status: "active", order: 1 },
  { key: "girl1", label: "女生1", status: "active", order: 2 },
  { key: "boy2",  label: "男生2", status: "active", order: 3 },
  { key: "girl2", label: "女生2", status: "active", order: 4 },
  { key: "cat1",  label: "貓咪1", status: "active", order: 5 },
  { key: "cat2",  label: "貓咪2", status: "active", order: 6 },
  { key: "fat1",  label: "胖胖",  status: "active", order: 7 },
  { key: "girl3", label: "女生3", status: "active", order: 8 },
  { key: "curl1", label: "捲髮1", status: "active", order: 9 },
  { key: "boy3",  label: "男生3", status: "active", order: 10 },
  { key: "girl4", label: "女生4", status: "active", order: 11 },
  { key: "girl5", label: "女生5", status: "active", order: 12 },
  { key: "curl2", label: "捲髮2", status: "active", order: 13 },
  { key: "dog1",  label: "狗狗1", status: "active", order: 14 },
  { key: "dog2",  label: "狗狗2", status: "active", order: 15 },
  { key: "dog3",  label: "狗狗3", status: "active", order: 16 },
  { key: "dog4",  label: "狗狗4", status: "active", order: 17 },
  // 約 13 款新圖案將在素材定案後加入，例如：
  // { key: "rabbit1", label: "兔兔1", status: "planned", order: 18 },
].map(Object.freeze));

export const AVATAR_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

const byKey = new Map(BASE_AVATARS.map((a) => [a.key, a]));

/** 能用來「建立」新玩家：必須是 active */
export function isActiveBaseAvatar(key) {
  const a = typeof key === "string" ? byKey.get(key) : null;
  return Boolean(a && a.status === "active");
}

/** 已知的身份圖案（含 planned）：找回舊玩家、驗證資料用 */
export function isKnownBaseAvatar(key) {
  return typeof key === "string" && byKey.has(key);
}

export function publicBaseAvatarList() {
  return BASE_AVATARS.filter((a) => a.status === "active")
    .sort((x, y) => x.order - y.order)
    .map(({ key, label, order }) => ({ key, label, order }));
}

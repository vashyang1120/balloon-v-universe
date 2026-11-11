/**
 * 固定身份圖案目錄（baseAvatarKey）
 *
 * - 身份圖案是「身份的一部分」：ID＋身份圖案決定是哪一位玩家，建立後不能更換。
 * - 展示頭像（displayAvatarKey）是另一回事，之後由頭像收藏系統管理，切換不影響身份。
 * - 前 17 款沿用大廳 v0.3.3（zones.js builtinAvatars）的識別鍵與名稱，鍵值永遠不改名。
 * - 第 18～33 款（v0.3.4 加入）：美術交付 balloon-v-universe-base-avatars-v1.0.zip 的 16 張 PNG，
 *   識別鍵＝檔名去掉 .png（avatar_ 前綴，不會與舊 17 款衝突）。
 * - 新增圖案：在下方加一筆 status: "planned"，素材確定上線後改成 "active"。
 *   只有 active 會出現在 API 清單、也只有 active 能用來建立新玩家；
 *   已經建立的玩家不受影響（資料庫不需要遷移）。
 * - 圖片檔不在後端：前端以 key 對應自己的圖片（目前大廳用 <key>.png）。
 */
export const BASE_AVATAR_CATALOG_VERSION = 2; // v0.3.4：17 → 33 款

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
  // v0.3.4：新增 16 款（素材已驗收為 1254×1254 RGBA 透明 PNG）
  { key: "avatar_rabbit_hoodie",      label: "兔兔帽T",   status: "active", order: 18 },
  { key: "avatar_koala_hoodie",       label: "無尾熊帽T", status: "active", order: 19 },
  { key: "avatar_unicorn_cape",       label: "獨角獸斗篷", status: "active", order: 20 },
  { key: "avatar_boy_star_hat",       label: "星星帽男孩", status: "active", order: 21 },
  { key: "avatar_turtle",             label: "小烏龜",     status: "active", order: 22 },
  { key: "avatar_girl_bow",           label: "蝴蝶結女孩", status: "active", order: 23 },
  { key: "avatar_panda_hoodie",       label: "熊貓帽T",   status: "active", order: 24 },
  { key: "avatar_fox_blue_hat",       label: "藍帽狐狸",   status: "active", order: 25 },
  { key: "avatar_leopard_gecko",      label: "豹紋守宮",   status: "active", order: 26 },
  { key: "avatar_blue_tongue_skink",  label: "藍舌石龍子", status: "active", order: 27 },
  { key: "avatar_bearded_dragon",     label: "鬆獅蜥",     status: "active", order: 28 },
  { key: "avatar_hamster_hoodie",     label: "倉鼠帽T",   status: "active", order: 29 },
  { key: "avatar_green_iguana",       label: "綠鬣蜥",     status: "active", order: 30 },
  { key: "avatar_corn_snake",         label: "玉米蛇",     status: "active", order: 31 },
  { key: "avatar_dragon_purple_robe", label: "紫袍小龍",   status: "active", order: 32 },
  { key: "avatar_penguin_hoodie",     label: "企鵝帽T",   status: "active", order: 33 },
  // 之後再新增：status 先設 "planned"，素材上線後改 "active"。
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

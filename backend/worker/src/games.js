/**
 * 遊戲代碼登記表 —— 新增第五款遊戲時，只要在這裡加一筆，
 * 玩家身份、V幣、頭像、稱號、排行榜都共用既有 API，不需要重寫。
 *
 * status：
 *   planned  已預留代碼，尚未接入新系統（後端會拒絕它的成績）
 *   testing  接入測試中
 *   live     正式接入
 */
export const GAMES = Object.freeze({
  lobby:     { name: "遊戲宇宙大廳", status: "planned", kind: "portal" },
  tetris:    { name: "氣球方塊",     status: "planned", kind: "game" },
  rhythm:    { name: "節奏遊戲",     status: "planned", kind: "game" },
  quiz:      { name: "問答遊戲",     status: "planned", kind: "game" },
  adventure: { name: "派對島冒險",   status: "planned", kind: "game" },
});

export const GAME_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export function isKnownGame(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(GAMES, id);
}

export function publicGameList() {
  return Object.entries(GAMES).map(([id, g]) => ({ id, name: g.name, status: g.status, kind: g.kind }));
}

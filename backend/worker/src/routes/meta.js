/**
 * GET /v1/meta —— 給遊戲 SDK 查詢 API 版本、已登記的遊戲與各功能分類的開放狀態。
 * 不含任何私密或設定細節。
 */
import { API_VERSION, RELEASE } from "../config.js";
import { publicGameList } from "../games.js";
import { ok } from "../utils/response.js";
import { CATEGORIES } from "./reserved.js";

export function metaRoute() {
  return {
    method: "GET",
    path: "/v1/meta",
    auth: "public",
    summary: "API 版本、遊戲登記表、功能分類狀態",
    handler: (ctx) =>
      ok(ctx, {
        apiVersion: API_VERSION,
        release: RELEASE,
        basePath: "/v1",
        clientHeader: "X-BV-Client: <gameId>/<gameVersion> sdk/<sdkVersion>",
        games: publicGameList(),
        categories: CATEGORIES.map((c) => ({ name: c.name, auth: c.auth, status: c.status })),
      }),
  };
}

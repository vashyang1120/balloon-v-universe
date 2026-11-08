/**
 * 氣球小V遊戲宇宙 後端 API — Cloudflare Worker 進入點
 * 版本：universe-backend-v0.3.0-player-foundation-test-1
 *
 * 所有邏輯在 app.js；這裡只建立一份 app（同一個 isolate 共用 Token 與公開金鑰快取）。
 */
import { createApp } from "./app.js";

const app = createApp();

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
};

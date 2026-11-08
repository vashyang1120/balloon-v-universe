/*
 * 遊戲宇宙「新」Firebase 專案（balloon-v-universe）的 Web App 設定
 * ------------------------------------------------------------------
 * ⚠ 目前是範本，尚未填入真實值 —— 管理員登入頁會顯示「尚未設定」並停用登入按鈕。
 *
 * 取得方式：Firebase 主控台 → 專案 Balloon V Universe → 齒輪「專案設定」→「一般」
 *          →「您的應用程式」→ 註冊網頁應用程式（</>）→ 複製 firebaseConfig 裡的值。
 *
 * 這些值是「公開的前端設定」，不是私密金鑰，可以放在 GitHub。
 * 但必須屬於 balloon-v-universe 專案；不可以使用舊專案 vparty-rhythm-game 的設定
 * （大廳 zones.js 裡那一份是舊專案的，與這裡無關）。
 *
 * 服務帳戶 JSON、管理員 UID 名單「絕對不可」寫在這裡。
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: "REPLACE_WITH_WEB_API_KEY",
  authDomain: "balloon-v-universe.firebaseapp.com",
  projectId: "balloon-v-universe",
  appId: "REPLACE_WITH_WEB_APP_ID",
};

/* 後端 Worker 正式網址 */
export const API_BASE = "https://balloon-v-universe-api.vashyang1120.workers.dev";

/* 本頁要求的 Firebase 專案 ID（設定不符就拒絕啟動） */
export const EXPECTED_PROJECT_ID = "balloon-v-universe";

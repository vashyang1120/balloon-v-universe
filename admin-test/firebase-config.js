/*
 * 遊戲宇宙「新」Firebase 專案（balloon-v-universe）的 Web App 設定
 * ------------------------------------------------------------------
 * 已填入：使用者於 2026-11-09 在 Firebase 主控台註冊的 Web App（專案 balloon-v-universe）。
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
  apiKey: "AIzaSyDpcG7svud91fj7EKlOc3NU3LdcsmTdu-8",
  authDomain: "balloon-v-universe.firebaseapp.com",
  databaseURL: "https://balloon-v-universe-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "balloon-v-universe",
  storageBucket: "balloon-v-universe.firebasestorage.app",
  messagingSenderId: "367595491135",
  appId: "1:367595491135:web:610b1ecfe05fb70dfd0d8a",
};

/* 後端 Worker 正式網址 */
export const API_BASE = "https://balloon-v-universe-api.vashyang1120.workers.dev";

/* 本頁要求的 Firebase 專案 ID（設定不符就拒絕啟動） */
export const EXPECTED_PROJECT_ID = "balloon-v-universe";

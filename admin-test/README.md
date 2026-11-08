# 遊戲宇宙 管理員連線測試頁（admin-test）

版本：universe-backend-v0.2.0-admin-auth-test-1

用途：管理員用 Google 登入，取得自己的 Firebase UID、確認伺服器是否認定為管理員，
並執行 Worker → Firebase 的**只讀**連線測試。

- 這不是正式管理後台，也不是給玩家用的頁面。
- 頁面網址是公開的；所有受保護的動作都由後端 Worker 驗證後才執行。
- 與大廳完全獨立：大廳的任何檔案都沒有引用這裡。

合併到 main 後的網址：
https://vashyang1120.github.io/balloon-v-universe/admin-test/

## 檔案
| 檔案 | 用途 |
|---|---|
| `index.html` | 頁面（不使用大廳的 RPG 美術） |
| `admin-test.js` | 登入、權限確認、連線測試 |
| `firebase-config.js` | 新 Firebase 專案（balloon-v-universe）的**公開**網頁設定（2026-11-09 已填入） |

## 一次性設定（Firebase 主控台）

### 1. 註冊網頁應用程式，取得網頁設定
1. Firebase 主控台 → 專案 **Balloon V Universe** → 左上齒輪「專案設定」→「一般」。
2. 往下到「您的應用程式」→ 點網頁圖示 `</>`。
3. 暱稱填 `universe-admin-test`；**不要**勾選 Firebase Hosting → 註冊。
4. 畫面會出現一段 `firebaseConfig`。需要的是 `apiKey` 和 `appId` 兩個值
   （`authDomain` 應為 `balloon-v-universe.firebaseapp.com`、`projectId` 應為 `balloon-v-universe`）。
5. 這兩個值是**公開設定**，不是私密金鑰，可以直接提供給開發者填進 `firebase-config.js`。

> 不要使用大廳 `zones.js` 裡的設定——那是舊專案 `vparty-rhythm-game` 的。頁面會檢查並拒絕舊專案設定。

### 2. 加入授權網域（Google 登入必須）
Firebase 主控台 → Authentication →「設定」→「授權網域（Authorized domains）」→「新增網域」→
填入 `vashyang1120.github.io` → 新增。

### 3. 確認 Google 登入已啟用
Authentication →「登入方式」→ Google 為「已啟用」，並已選擇專案支援電子郵件。

## 使用步驟
1. 開啟本頁 → 按「使用 Google 登入」→ 選擇你的 Google 帳號。
2. 畫面顯示「Google 登入成功」與 **Firebase UID**。
3. 步驟 2 若顯示「伺服器尚未設定管理員名單（ADMIN_UIDS）」：
   1. 按「複製 UID」。
   2. Cloudflare → Workers & Pages → `balloon-v-universe-api` → Settings → Variables and Secrets → Add。
   3. Type 選 **Secret**、Name 填 `ADMIN_UIDS`、Value 貼上 UID → 儲存。
   4. 回到本頁按「重新確認權限」，應顯示「✅ 伺服器確認：你是遊戲宇宙管理員」。
4. 按「測試 Firebase 連線」：
   - 成功：「✅ Firebase 真實連線成功：Worker 已能讀取 Firebase」，資料庫空的會顯示讀到 null（正常）。
   - 失敗：會顯示卡在哪一步（Worker 設定／向 Google 取得授權／讀取資料庫）與排除建議。

## 安全說明
- Firebase ID Token 只放在請求的 `Authorization: Bearer` 標頭；不顯示、不放網址、不存瀏覽器儲存空間。
- 登入狀態只存在記憶體，關閉或重新整理分頁就登出。
- 「Google 登入成功」不等於管理員；管理員由 Worker 驗證 Token＋Google 登入＋`ADMIN_UIDS` 決定。
- `ADMIN_UIDS` 只存在 Cloudflare Secret，不會出現在這個頁面或 GitHub。
- 多位管理員：`ADMIN_UIDS` 裡用逗號分隔，例如 `UID甲,UID乙`。

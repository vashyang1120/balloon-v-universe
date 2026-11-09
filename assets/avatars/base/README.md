# 遊戲宇宙固定身份圖案（baseAvatarKey）

版本：universe-lobby-v0.3.4-shared-player-avatar-expansion-test-1
網址：`https://vashyang1120.github.io/balloon-v-universe/assets/avatars/base/<key>.png`

遊戲宇宙統一提供 33 款固定身份圖案。大廳與日後接入的遊戲都從這裡讀圖，
後端 `GET /v1/avatars/base` 的清單與這裡的檔案一一對應（自動測試會檢查）。
完整清單、來源、雜湊值與處理方式見 `manifest.json`。

## 原有 17 款（第 1～17 款）
- 來源：`vashyang1120/vparty-rhythm-game` 的 `assets/avatars/<key>.png`（commit `9caa7dc`）
- 處理：**逐位元組複製，未做任何修改**（SHA-256 與原檔相同）；節奏遊戲的原圖沒有被修改或刪除
- 規格：501×501、RGB（黑色背景、沒有透明通道）、每張約 28～53 KB，合計 705 KB
- 注意：這 17 張原檔的內容其實是 **JPEG**，只是副檔名叫 `.png`（節奏遊戲原本就是這樣）。
  為了與原檔逐位元組相同，本版**不轉檔**；瀏覽器會依內容正常顯示。

## 新增 16 款（第 18～33 款）
- 來源：美術交付的 `balloon-v-universe-base-avatars-v1.0.zip`（每張 1254×1254 RGBA 透明 PNG）
- 處理：**只做等比例縮小**為 320×320（Lanczos），存成無損 PNG；
  沒有改顏色、沒有裁切、沒有加背景、透明背景保留
- 大小：原圖合計 21,953 KB → 縮圖合計 1,776 KB（減少 91.9%）
- 原圖不放進 Repository（避免手機下載大檔）；原始 ZIP 是正式素材檔，請妥善保存。
  每張原圖的 SHA-256 記在 `manifest.json`，可用來核對素材是否被替換。

## 規則
- 識別鍵永遠不改名；同一個鍵永遠指向同一個角色。
- 新增圖案：後端 `backend/worker/src/players/base-avatars.js` 先加入並設為 active，
  再把圖片放進這個資料夾、加入 `manifest.json` 與大廳 `zones.js`。

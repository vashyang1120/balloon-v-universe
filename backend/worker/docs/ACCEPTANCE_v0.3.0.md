# v0.3.0 真實 Firebase 玩家驗收計畫

版本：universe-backend-v0.3.0-player-foundation-test-2
狀態：**計畫，尚未執行。** 需使用者確認後才合併 PR #4 並開始。

驗收工具頁（合併到 main 後才會上線）：
https://vashyang1120.github.io/balloon-v-universe/backend/worker/acceptance/player-api-test.html

## 測試身份（共 4 組，都以「測試」開頭）
| 代號 | 玩家 ID | 身份圖案 | 用途 |
|---|---|---|---|
| T1 | 測試甲 | boy1（男生1） | 建立、跨裝置找回、重複建立被拒 |
| T2 | 測試甲 | dog1（狗狗1） | 同名不同圖案 |
| T3 | 測試乙 | girl1（女生1） | 兩個請求同時建立 |
| T4 | 測試Ａ（全形 Ａ） | cat1（貓咪1） | 全形轉半形：應存成「測試A」並回報 ID 已正規化 |

全部做完後，資料庫應剛好有 **4 個 identities、4 個 players**。

---

## 1. 安全合併 PR #4
1. 打開 PR #4，確認「Files changed」只有 `backend/worker/` 底下的檔案。
2. 按「Ready for review」→「Merge pull request」→「Confirm merge」。
3. 合併後 Cloudflare 會自動建置並部署；GitHub Pages 也會更新（驗收工具頁上線）。

## 2. 確認 Cloudflare 自動部署成功
1. Cloudflare → Workers & Pages → `balloon-v-universe-api` → Deployments：最上面一筆來源是剛合併的 commit，狀態 Ready。
2. **限流 binding 是否可用**：Settings → Bindings 應看到 `RL_CREATE_IP`、`RL_CREATE_GLOBAL`、`RL_LOOKUP_IP`（類型 Rate Limit）。
3. 如果建置失敗、錯誤訊息提到 `ratelimits` 或 Rate Limiting：代表 Workers Free 不包含此功能。
   線上會繼續跑舊版本（不會中斷）。處理方式：開一個小 PR 刪除 `wrangler.jsonc` 的 `ratelimits` 區塊，
   程式會自動改用記憶體計數；並在驗收報告記錄「官方限流不可用」。

## 3. 驗證 API 版本為 0.3.0
驗收工具「步驟 1：檢查版本」→ 應顯示版本 0.3.0、release `universe-backend-v0.3.0-player-foundation-test-2`、players 分類 partial。
（也可直接開 `/health`，看到 `"version":"0.3.0"`。）

## 4. 建立少量測試玩家
工具「步驟 2」：輸入 T1（測試甲＋男生1）→「建立」→ 應顯示 created 和一個 `p_` 開頭的 playerId。記下 playerId。

## 5. 測試 ID＋身份圖案唯一性
同樣 T1 →「同組合再建立一次」→ 應顯示「✅ 正確拒絕：IDENTITY_EXISTS」。

## 6. 測試跨裝置找回
用**另一台裝置**（手機或另一個瀏覽器）開驗收工具 → 輸入 T1 →「找回」→ playerId 必須和步驟 4 完全相同。

## 7. 測試同名不同圖案
輸入 T2（測試甲＋狗狗1）→「建立」→ 成功，且 playerId 和 T1 不同。

## 8. 測試同時建立同一身份
輸入 T3（測試乙＋女生1）→「兩個請求同時建立」→ 應顯示一個 created、一個 IDENTITY_EXISTS。
（若兩個都 409，表示 T3 先前已被建立過，換「測試丙」再測一次，並把總數控制在 5 組內。）

再輸入 T4（測試Ａ＋貓咪1）→「建立」→ displayId 應顯示「測試A」並標示「ID 已正規化」。

## 9. 確認資料寫入正確
工具「步驟 3」：分別讀取 4 個 playerId，每個都應回 5 個欄位（playerId、displayId、baseAvatarKey、displayAvatarKey、createdAt），
沒有其他內部欄位。

## 10. 在 Firebase 後台檢查
Firebase 主控台 → Realtime Database →「資料」：
- `identities` 底下 4 個鍵，都以 `i1_` 開頭；每個裡面有 playerId、displayId、baseAvatarKey、createdAt、createRequestId、schemaVersion、source。
- `players` 底下 4 個 `p_` 開頭的鍵，各有 `profile`；profile 的 `identityKey` 對應上面某個 `i1_` 鍵。
- 除了 `identities`、`players`，**沒有其他節點**。

## 11. 避免影響未來正式玩家
- 測試 ID 都以「測試」開頭，正式玩家不太可能使用；驗收工具也只允許「測試」開頭。
- 不清空資料庫、不批次建立；總數 ≤ 5。
- 大廳還沒有接新 API，一般玩家此時無法建立新系統的身份。

## 12. 追蹤與處理測試資料
- 工具「驗收紀錄」→「複製全部紀錄」，貼進驗收報告（包含時間、HTTP 狀態、playerId）。
- 驗收後由使用者決定：保留（建議，可當日後回歸測試用），或在 Firebase 主控台**只刪除**這 4 組的
  `identities/i1_…` 與 `players/p_…` 節點。刪除時兩邊都要刪，不要只刪一邊。

## 13. 確認資料庫 Rules 仍為鎖定
Firebase 主控台 → Realtime Database →「規則」：仍是 `.read: false`、`.write: false`。

## 14. 限流檢查與停止／回滾
- 工具「步驟 4：限流檢查」（只讀）：大約第 301 次開始回 429。之後到 Cloudflare → Observability 搜尋 `rate limited`：
  `layer: "binding"` 代表官方限流已生效；`layer: "memory"` 代表退回記憶體計數。
- **立即停止**的情況：出現 `INTEGRITY_ERROR`、同一組身份得到兩個不同 playerId、版本不是 0.3.0、出現預期外的資料庫節點。
- **回滾部署**：Cloudflare → Deployments → 選上一個版本 →「Rollback」（立即生效，不需改 GitHub）；
  之後再於 GitHub 對 PR #4 按「Revert」建立還原 PR。回滾不會刪除已寫入的測試資料。

---

驗收通過後才算「v0.3.0 玩家身份系統正式上線（後端）」。
一般兒童開始使用前，還需要：大廳接入新 API、確認限流在正式環境的實際效果。

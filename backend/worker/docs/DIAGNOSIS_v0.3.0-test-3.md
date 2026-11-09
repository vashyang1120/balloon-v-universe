# 正式環境限流異常診斷（v0.3.0-rate-limit-diagnostic-test-3）

## 現象（正式環境，使用者實測）
驗收工具「步驟 4：限流檢查」送出 320 次 `GET /v1/players/p_zzzzzzzzzzzzzzzzzzzz`：
HTTP 404 × 320、HTTP 429 × 0。

## 請求實際路徑（依程式碼追蹤，已證實）
1. 工具（`acceptance/player-api-test.html`，test-2 版）以 `for` 迴圈**逐一** `await fetch`，一次只有 1 個請求在途中，**沒有記錄耗時**。
2. URL `GET /v1/players/p_zzzzzzzzzzzzzzzzzzzz` → 路由 `GET /v1/players/:playerId`（不是路由不存在的 404）。
3. handler 第一行 `enforceRateLimit(ctx, "lookup")`：**限流在讀資料庫之前執行**。
4. `env.RL_LOOKUP_IP` 存在時呼叫 `binding.limit({ key: "lookup-ip:<IP>" })`；不存在或丟錯時用記憶體計數。
5. 放行後 `getPublic()`：`p_` + 20 個 `z` 符合格式 → 讀 `players/p_zzz…/profile` → null → `PLAYER_NOT_FOUND`（HTTP 404）。
6. 所以 320 個 404 都是「玩家不存在」，每一個都經過了限流判斷，且都被判定放行。
7. 工具的狀態碼統計正確（直接以回應的 HTTP 狀態計數）。

## 已證實
- main `b934ccd` 的 `backend/` 與 test-2 `518f1f0` 相同；Cloudflare 建置／部署成功（Version ID `45e4fb12…`），部署設定包含 3 個 ratelimits。
- 綁定名稱一致：`wrangler.jsonc` 的 `RL_CREATE_IP`、`RL_CREATE_GLOBAL`、`RL_LOOKUP_IP` 與程式 `RULES` 相同（自動測試檢查）。
- 呼叫方式符合官方文件：`await env.X.limit({ key })`，判斷 `success`。
- 沒有繞過路徑：格式錯誤的 ID、不存在的 ID 都先計入限流；路由不存在的請求不計數也不讀資料庫。
- **可觀測性缺陷**：test-2 在 binding 丟錯時「靜默」退回記憶體計數，也沒有任何記錄顯示用了哪一層，所以正式環境無法從記錄分辨「binding 正常／失敗／備援」。
- **驗收工具缺陷**：逐一送出又不計時。只要每次往返超過約 0.2 秒（60 秒 ÷ 300 次），320 次就會跨過 60 秒計數週期，**即使限流完全正常也不會出現 429**。本機以模擬時間重現：每次 0.25 秒 → 0 次 429；每次 0.03 秒 → 第 301 次 429。

## 合理推測（尚未驗證）
- 正式環境每次請求要經過 Cloudflare → Firebase（新加坡）讀取，加上台灣到 Cloudflare 的往返，單次超過 0.2 秒的機率高，因此最可能的原因是上面的驗收工具缺陷。
- 官方文件說明計數是「近似值、各機房分開、在背景同步」，請求可能超過上限才被擋；也可能讓 429 晚於第 301 次出現。

## 尚未驗證
- 正式環境中 `env.RL_LOOKUP_IP` 是否存在、`limit()` 是否正常（需 test-3 部署後看記錄的 `rl` 欄位）。
- Workers Free 是否會實際執行計數（官方文件未說明方案範圍；部署成功不代表一定有執行）。
- 計數週期是固定或滑動（官方文件未說明）。

## test-3 修正（只修已證實的問題）
1. **可觀測性**：既有 `request` 記錄加 `rl` 欄位（`lookup:binding`／`lookup:memory(missing)`／`lookup:memory(error)`）；
   binding 缺少或失敗時，每個 Worker 實例每個 binding 只警告一次 `rate limit fallback`（只記錄錯誤類型名稱）。不增加每個請求的記錄筆數。
2. **驗收工具**：同時 8 個請求、記錄耗時／速率／回應中位數、最多 400 次、出現 429 後再 20 次自動停止、可手動停止、執行中不能重複點、失敗不重試；
   超過 55 秒未出現 429 時判定「無法判斷」而不是「失敗」。
3. 限流規則、數值、玩家 API、資料模型、ETag、playerId、identityKey **都沒有改**。

## 正式環境驗證方法（test-3 部署後）
1. 驗收工具步驟 4，用較快的網路（Wi-Fi）執行一次。
2. Cloudflare → `balloon-v-universe-api` → Observability → Events，篩選 `msg = request` 且 `path` 含 `/v1/players/p_`：
   - `rl` = `lookup:binding` → 官方 binding 有被呼叫
   - `rl` = `lookup:memory(missing)` → 正式環境沒有 binding（設定沒生效）
   - `rl` = `lookup:memory(error)` → binding 呼叫失敗；再搜尋 `rate limit fallback` 看錯誤類型
3. 搜尋 `rate limited`：`layer = binding` 代表由官方限流擋下。
4. 若 `rl` 全是 `lookup:binding`、測試在 60 秒內送超過 300 次、卻仍沒有 429 → 代表 binding 被呼叫但沒有實際限制（可能是方案或近似計數），屆時再評估替代方案。

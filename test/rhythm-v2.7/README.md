# 節奏遊戲 v2.7.0-universe-foundation-test-1（測試版／資料隔離）

測試網址（合併到 main 後生效）：https://vashyang1120.github.io/balloon-v-universe/test/rhythm-v2.7/

基準：`universe/rhythm/index.html`（main 11192ed）。正式大廳、正式節奏遊戲、`universe-sdk.js` 都沒有修改，只被這裡唯讀引用。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 複製自正式宇宙節奏版。和正式版只差 6 行（網頁標題、4 個 SDK／換殼檔的載入路徑、版本文字），另外在 `<head>` 最前面加網路守衛，畫面頂部加「測試版／資料隔離」標籤。遊戲程式（判定、計分、hold、四軌、音樂同步）完全相同。 |
| `universe-shell-test.js` | 測試專用換殼層，取代 `universe/rhythm/universe-shell.js`。對遊戲提供的 `window.UniverseRhythm` 介面與正式版相同。 |
| `test-isolation.css` | 測試標籤與入口選擇畫面的樣式。 |

## 進入方式

- `?bvPlayerId=p_xxxxxxxxxxxxxxxxxxxx`：用正式 SDK 唯讀查詢這位玩家（`GET /v1/players/:id`），套用到 `PLAYER`。
- 沒有參數：顯示選擇畫面，可以「返回 V宇宙大廳」，或「使用純 UI 測試角色（Mock）」。選 Mock 會改用 `?bvTestMock=1` 重新開啟。
- 格式錯誤、找不到玩家、API 失敗：顯示錯誤訊息，並提供「重新讀取」與「返回 V宇宙大廳」。
- 不會讀取大廳記住的上一位玩家（`allowLobbyFallback: false`）。

## 資料隔離（四層）

1. **換殼層不呼叫寫入**：不呼叫 `S.startRun`、`S.finishRun`、`S.bootOfficial`、`S.official.*`；結算一律存成 Mock 成績。
2. **SDK 正式功能鎖死**：遊戲初始化前，`S.official` 的所有方法都換成停用版本，然後 `Object.freeze`，無法重新打開。`startRun`、`finishRun`、`bootOfficial`、`goLobby` 也都換掉。
3. **SDK 只能用唯讀連線**：傳給 SDK 的 fetch 只允許 `GET /v1/players/p_…` 與 `GET /v1/avatars/base`。
4. **頁面全域守衛**：封鎖所有不是 GET／HEAD 的請求，封鎖 Firebase 網域，封鎖 API 上前一項以外的所有路徑（例如 sessions、scores、launch/status、leaderboards、wallet、collection、equip），也停用 sendBeacon。

Storage：傳給 SDK 的 localStorage／sessionStorage 都加上前綴 `vRhythmV270UniverseTest1::`，所以不會覆寫正式的 `bvUniverse_v2_currentPlayerId`、`bvUniverse_v2_rememberedPlayers`、`bvUniverseSdk_v1_production_rhythm_playerId`，也不會讀取它們。

返回大廳固定使用 `https://vashyang1120.github.io/balloon-v-universe/`。

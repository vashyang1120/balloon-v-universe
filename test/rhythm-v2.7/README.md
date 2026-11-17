# 節奏遊戲 v2.7.0-home-songselect-ui-test-1（測試版／資料隔離）

以 v2.7.0-universe-foundation-test-1 為基準。下方的資料隔離規則完全沿用，沒有更改。

測試網址：https://vashyang1120.github.io/balloon-v-universe/test/rhythm-v2.7/

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

## v2.7.0-home-songselect-ui-test-1：首頁＋選歌頁 A-4 橫向魔法音樂舞台

| 檔案 | 用途 |
|---|---|
| `home-songselect-ui.js` | 把原本首頁和選歌頁的元素搬進新的左右版面，保留原本的 id 和事件。另外負責首頁玩家資料卡、選歌頁右側歌曲資訊與「我的最佳（測試）」，以及手機直向時的旋轉提示。 |
| `home-songselect-ui.css` | 樣式只作用在 `#s-title.rv-ui`、`#s-songlist.rv-ui` 和 `#rv-rotate-mask`。遊戲畫面、HUD、結算、排行榜、角色設定的樣式都沒有改。 |

- 首頁：左邊約 48% 是魔法舞台（V-03 小V、CSS／SVG 舞台、B-03／B-04 氣球），右邊約 52% 是玩家資料卡（U-06 頭像框）、今日挑戰、開始遊戲、排行榜、返回 V宇宙。玩法教學只預留位置，不能點。
- 選歌頁：左邊約 45% 是封面（沿用原本封面來源，contain 完整比例）和 U-19／U-20 切歌箭頭；右邊約 55% 是歌名、BPM 與長度（有資料才顯示）、我的最佳（測試）、今日挑戰、難度、開始歌曲。
- 直向提示：手機直向時顯示全畫面提示。演奏中轉成直向會呼叫原本的 `togglePause()` 暫停；轉回橫向後按原本的「繼續」，會跑原本的 3 秒倒數。
- 素材：V-03、U-06 讀本 repo 的 `assets/`；U-19、U-20、B-03、B-04 讀 balloon-v-rush 的 GitHub Pages。U-12、U-13 只當配色參考，用 CSS 做出同樣效果的按鈕。

# 節奏遊戲 v2.7.0-audio-result-test-1（測試版／資料隔離）

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

## v2.7.0-home-songselect-ui-test-2：正式美術整合＋動態演出

### 正式美術（`assets/ui/`）
| 檔案 | 說明 |
|---|---|
| `rhythm_home_bg.png`／`.webp` | 首頁背景（1672×941）。PNG 是原圖原封不動；頁面載入 WebP（品質 86，約 109KB） |
| `rhythm_songselect_bg.png`／`.webp` | 選歌頁背景（1672×941）。PNG 是原圖；WebP 約 64KB |
| `rhythm_title_logo.png`／`.webp` | 透明 Logo（1774×887 RGBA）。PNG 是原圖；WebP 保留透明，約 223KB |

### 按鈕美術（`assets/ui/buttons/`，來自 balloon-v-rush `assets/adventure/ui/components/`）
只裁掉透明留白（以 alpha>8 為邊界，外留 8px 保留陰影），等比例縮成高 200px 的 WebP；原圖沒有修改。
| 本目錄 | 原始檔 | 用在 |
|---|---|---|
| `ui_button_yellow.webp` | U-13 `ui_button_yellow.png.png` | 開始遊戲、開始歌曲 |
| `ui_button_purple.webp` | U-12 `ui_button_purple.png` | 排行榜、返回遊戲宇宙、角色設定、選歌頁返回首頁 |
| `ui_button_blue.webp` | U-14 `ui_button_blue.png.png` | 觀看MV（玩法教學預留位置沿用藍色風格） |
| `ui_arrow_left.webp`／`ui_arrow_right.webp` | U-19／U-20 | 上一首／下一首 |

按鈕圖用九宮格（`border-image`，左右端各保留 150px 不拉伸）畫在 `::before`，文字仍是原 HTML，原 id、事件與無障礙名稱都不變。

### 動態
- 首頁登場約 1.4 秒，只在第一次進首頁時播放：背景 0–0.3 秒 → Logo 0.15–0.85 秒彈入 → 小V 0.4–0.95 秒從左側滑入 → 玩家卡 0.65 秒、今日挑戰 0.72 秒 → 按鈕從 0.85 秒起每隔約 70ms 依序彈入。要等首頁可見、旋轉遮罩解除、主要圖片就緒後才開始播。
- 返回首頁只淡入 0.28 秒。
- 待機動畫全用 CSS（transform／opacity）：Logo 每 6.5 秒放大到 1.03 倍、小V以腳底為基準輕微呼吸、兩處燈光慢速改變亮度、5 個閃爍光點、主按鈕每 4.8 秒一次高光。離開首頁就移除動畫 class；畫面隱藏時也會暫停動畫。
- 切歌：Web Animations 260ms 滑動轉場。新的切換會先取消上一個轉場，資料一律以最新的 `songIdx` 為準。
- 有開啟減少動態時：不播登場與待機動畫，所有功能照常使用。

### 旋轉與恢復倒數（測試頁 `index.html` 的最小必要修改）
- 新增 `resumeCountdownToken`，並在 `resumeGameWithCountdown()` 的 `step()`／`done()` 開頭加上代號檢查。
- 新增 `cancelResumeCountdown()`。
- 倒數中轉成直向：立即中止這次恢復，不啟動音訊、MV、計時，回到原本的暫停選單；轉回橫向後按「繼續」，重新完整倒數 3 秒。
- 不使用輪詢。

## v2.7.0-audio-result-test-1：選單 BGM、UI 按鈕音效、橫向結算頁

### 選單 BGM（`menu-audio.js`）
- 來源（唯讀引用，未複製、未改寫）：`../../assets/audio/universe_lobby_bgm.mp3`。這是正式大廳 `zones.js` 的 `MAP_CONFIG.audio.bgmSrc`，由 `audio.js` 播放。
- 音量 0.22（大廳是 0.25）。淡入 0.45 秒、淡出 0.25 秒；進入演奏時 0.15 秒淡出。
- 循環方式和大廳一樣：曲尾前 2.5 秒由第二個 `<audio>` 交叉淡化接上。管理器只有一個，整個頁面最多建立 2 個 `<audio>`，畫面切換只暫停或繼續，不會從頭播放。
- 是否播放只看一個條件 `shouldPlay()`：不在演奏畫面、`G.running` 為 false（包含暫停、恢復倒數、遊戲中開角色設定時都不播）、沒有直向提示、分頁在前景、沒有離開頁面。
- 自動播放：瀏覽器有回報使用者已互動（`navigator.userActivation.hasBeenActive`）才嘗試直接播放；否則等第一次有效點擊。點擊當下先靜音播放來解鎖，等原本的點擊事件跑完再決定要不要出聲；所以第一次點擊就是「開始歌曲」時不會出聲。
- 返回遊戲宇宙、`pagehide`、分頁進入背景：停止或暫停。

### UI 按鈕音效
- 來源：派對島大作戰正式版（balloon-v-rush `rpg-continent1-universe/main.js` 的 `SFX_DEFS.uiClick`）使用的 `assets/audio/sfx/ui/ui_button_click.mp3`，原檔複製到 `assets/audio/ui_button_click.mp3`，內容未改。
- 播放方式同派對島：Web Audio buffer、`pointerdown` 時播放（鍵盤 Enter／空白鍵用 `click` 且 `detail===0`）、同一顆按鈕 450ms 內只算一次、90ms 最小間隔、最多 2 個同時發聲、音量 0.55×0.85。
- 不響的情況：停用的按鈕、`#lanes` 四軌、演奏進行中除了「暫停」以外的按鈕。

### 橫向結算頁（`result-ui.js`／`result-ui.css`）
- 原本按鈕看不到的原因：`#s-result` 是全螢幕、內容垂直置中、沒有捲動的直向長列表。844×390 時內容高 450px，按鈕落在 y=407～450，`html`、`body` 又不能捲動；568×320 時按鈕在 y=362 以下。按鈕和事件其實都在。
- 新版面：左 40% 是評價、NEW RECORD、小V、鼓勵文字；右 60% 是六項成績（3 欄 2 列）、通知區（可內部捲動）、操作按鈕。只搬移原本的 DOM，原 id 與事件保留；新增「選擇歌曲」（`#rv-btn-r-songs`，使用原本的 `go('s-songlist')`）。
- 評價對應小V（只影響美術）：S、A+ → `v_bust_congrats`（V-18）；A、B → `v_bust_happy`（V-06）；C → `v_bust_point`（V-12）；D、E → `v_bust_remind`（V-15）；NEW RECORD → `v_bust_congrats`。
- SCORE 累加只是覆蓋在上面的顯示層，`#r-score` 原本的文字完全不改；動畫結束就顯示原文字。
- NEW RECORD 只看 `endGame()` 判定後的 `#r-rec`。進入結算頁時先清掉上一場的顯示狀態，再用 MutationObserver 等這一場的判定結果。
- 離開結算頁會取消 rAF、計時器、彩紙與觀察器。

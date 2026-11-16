# 氣球小V遊戲宇宙｜官網（balloonv.com）遊戲截圖素材

素材版本：`balloonv-website-game-assets-v1.0`（2026-11-16）

這個資料夾只有官網用的圖片素材與來源紀錄，**沒有任何遊戲程式**，遊戲不會讀取這裡的檔案。

## 1. 六張正式素材

| 檔名 | 尺寸 | 大小 | 建議 Elementor 比例 | 建議 WordPress 媒體庫檔名 |
|---|---|---|---|---|
| `universe-hero-desktop.webp` | 1920 × 1080 | 429 KB | 16:9（首頁主視覺，桌機） | `balloonv-game-universe-hero-desktop.webp` |
| `universe-hero-mobile.webp` | 1080 × 1350 | 343 KB | 4:5（首頁主視覺，手機） | `balloonv-game-universe-hero-mobile.webp` |
| `game-tetris.webp` | 1600 × 900 | 38 KB | 16:9（遊戲卡片） | `balloonv-game-block-party.webp` |
| `game-rhythm.webp` | 1600 × 900 | 29 KB | 16:9（遊戲卡片） | `balloonv-game-rhythm.webp` |
| `game-quiz.webp` | 1600 × 900 | 37 KB | 16:9（遊戲卡片） | `balloonv-game-quiz-challenge.webp` |
| `game-party-island.webp` | 1600 × 900 | 185 KB | 16:9（遊戲卡片） | `balloonv-game-party-island.webp` |

四張遊戲卡片都是 16:9，可以使用同一個圖片容器比例，不需要留白或拉伸。

## 2. ALT 與 Title

| 檔名 | ALT（替代文字） | Title |
|---|---|---|
| universe-hero-desktop | 氣球小V遊戲宇宙大廳地圖：漂浮在雲上的遊樂園，有知識學院、音樂舞台、方塊工坊、派對島四座遊戲島嶼，小V和小狗站在中央廣場 | 氣球小V遊戲宇宙｜四座遊戲島嶼大廳 |
| universe-hero-mobile | 手機版氣球小V遊戲宇宙大廳：漂浮島嶼地圖與知識學院、音樂舞台、方塊工坊、派對島四個遊戲入口 | 氣球小V遊戲宇宙｜手機版大廳 |
| game-tetris | 方塊派對遊戲畫面：彩色氣球方塊堆疊在遊戲盤上，上方有正在落下的方塊，旁邊顯示分數與下一個方塊 | 方塊派對｜氣球方塊消除遊戲 |
| game-rhythm | 節奏遊戲進行中：四條節奏軌道上有彩色音符，畫面中央顯示 30 COMBO 與 GREAT 判定 | 節奏遊戲｜跟著音樂按節拍 |
| game-quiz | 知識挑戰問答畫面：氣球知識中年級題目「表演時把氣球交給壽星，主要增加什麼？」與四個選項，小V在旁邊陪伴作答 | 知識挑戰｜邊玩邊學的問答遊戲 |
| game-party-island | 派對島大作戰遊戲畫面：小V在第一章森林氣球小徑奔跑，周圍有樹屋、熱氣球、愛心氣球、金幣與氣球蠍子 | 氣球小V：派對島大作戰｜第一章森林氣球小徑 |

## 3. 來源與處理

所有畫面都是**正式遊戲程式＋正式美術**在瀏覽器（Playwright＋Chromium）實際執行後截圖；沒有 AI 生成、沒有重繪、沒有移動或修改畫面內容。處理只有：裁切、等比例縮小、轉成 WebP（品質 84）。

截圖在本機安全測試環境進行：網頁檔案來自下列 Repository 的 main 分支；遊戲後端使用相同的 Worker 程式，但資料庫是本機假資料庫，**沒有寫入正式網站的成績、排行榜或 V幣**。畫面中的玩家「小V玩家」是只存在於本機測試的玩家，不是任何真實玩家。Google 字型（Fredoka One、Nunito、M PLUS Rounded 1c）以相同字型檔在本機提供；Noto Sans TC 使用本機安裝的同款字型。

| 檔名 | 來源網址（正式網站對應頁面） | Repository＠Commit | 遊戲版本 | 畫面說明 | 原始截圖 | 裁切方式 |
|---|---|---|---|---|---|---|
| universe-hero-desktop | https://vashyang1120.github.io/balloon-v-universe/ | balloon-v-universe＠a42b55b | 大廳（v0.3.3 正式上線後 main） | 已選擇玩家的大廳地圖，沒有任何視窗；包含四個島嶼招牌、小V與小狗、歡迎泡泡、下方玩家頭像列以外的地圖 | originals/original-01（1920×1080 視窗，2 倍像素，3840×2160） | 裁切地圖框內 (410,126)–(3380,1796)，去掉頁首與右上玩家卡，縮小為 1920×1080 |
| universe-hero-mobile | 同上（手機版版面） | 同上 | 同上 | 手機版大廳：地圖、四個遊戲入口招牌、玩家頭像列 | originals/original-02（432×660 手機視窗，3 倍像素，1296×1980） | 裁切 (24,192)–(1272,1752)，去掉頁首與下方排行榜／通行證按鈕，縮小為 1080×1350 |
| game-tetris | https://vashyang1120.github.io/balloon-v-universe/universe/tetris/ | balloon-v-universe＠a42b55b（方塊宇宙版；原版 vparty-tetris＠7f33885） | 方塊派對宇宙版 | 實際用鍵盤遊玩 16 顆方塊（旋轉、移動、快速落下），堆到約一半高度，下一顆方塊正在落下（含落點預覽） | originals/original-03（1280×720 視窗，2.5 倍，3200×1800） | 整個畫面等比例縮小為 1600×900 |
| game-rhythm | https://vashyang1120.github.io/balloon-v-universe/universe/rhythm/ | balloon-v-universe＠a42b55b（歌曲與譜面：vparty-rhythm-game＠9caa7dc） | 節奏遊戲宇宙版 | 《夢想啟動時》困難，依譜面按鍵約 31 秒，30 COMBO 判定出現的瞬間 | originals/original-04（1600×900，2 倍，3200×1800） | 整個畫面等比例縮小為 1600×900 |
| game-quiz | https://vashyang1120.github.io/balloon-v-universe/universe/quiz/ | balloon-v-universe＠a42b55b（題庫：vparty-quiz-game＠93df14f） | quiz-v0.2.44 | 中年級＋氣球知識，前 3 題答對後的第 4 題（作答前） | originals/original-05（1600×900，2 倍，3200×1800） | 整個畫面等比例縮小為 1600×900 |
| game-party-island | https://vashyang1120.github.io/balloon-v-rush/rpg-continent1-universe/ | balloon-v-rush＠d375d89 | adventure-v0.4.1-continent1-universe-test-1 | 第一章「森林氣球小徑」（1-1），略過開場故事與教學後，以鍵盤往右走時的畫面 | originals/original-06（1600×900，2 倍，3200×1800） | 裁切遊戲畫面 (0,430)–(2436,1800)，去掉上方生命／時間列與武器面板，縮小為 1600×900 |

### 特別說明

- **節奏遊戲**：無頭瀏覽器沒有音效裝置，所以把「音樂播放時間」改由測試程式推進（和專案既有的自動化測試相同做法）；音符、軌道、判定與畫面都是遊戲本身繪製的。這幾首歌沒有內建背景影片（MV 要玩家另外點按才會載入），所以截圖就是預設的遊玩畫面。
- **方塊派對**：落點是測試程式讀取盤面（只讀）後決定，再用鍵盤操作；沒有直接改寫盤面。
- **大廳頁首**：正式大廳頁首目前顯示版本標籤「v0.3.1 試營運準備」（遊戲已正式上線，這個標籤尚未更新）。為了不在官網出現「試營運」字樣，主視覺裁切在地圖框內，沒有修改標籤本身。
- **派對島**：遊戲上方資訊列顯示開發版本字串「adventure-v0.4.1-continent1-universe-test-1 Build…」，所以裁切在資訊列下方。

## 4. 沒有使用的畫面

- 原始地圖美術 `assets/universe_map_bg.png`（1536×1024，3:2）：沒有島嶼名稱招牌與小V，而且解析度不足 1920×1080，所以主視覺改用實際大廳截圖。
- 派對島開場動態漫畫：畫面很漂亮，但屬於故事過場，不是遊戲畫面。
- 方塊／節奏／問答首頁、選歌畫面、結算畫面、派對島挑戰失敗畫面。

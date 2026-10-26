# balloon-v-universe
Balloon V Game Universe - Player Portal &amp; Game Lobby

氣球小V遊戲宇宙 — 統一玩家入口

## 目前版本
`balloon-v-universe-v0.2.1-focus-and-character-tuning-test-1`（桌機聚焦與中央角色調校測試版）

## 檔案
| 檔案 | 用途 |
|---|---|
| `index.html` | 頁面結構 |
| `style.css` | 外觀樣式（桌機 / 手機） |
| `main.js` | 地圖、聚焦遮罩、光暈、中央角色、選取邏輯 |
| `dialogue.js` | RPG 對話框元件（逐字顯示、繼續、略過） |
| `zones.js` | **集中設定檔：選區座標、聚焦強度、光暈、動畫速度、角色位置與大小、RPG 設定** |
| `assets/universe_map_bg.png` | 正式遊樂園底圖（不可修改） |
| `assets/universe_lobby_v_dog.png` | 中央廣場小V與氣球小狗合圖（不可修改） |

## 校準
在網址後加上 `?debug=1`：顯示四個選區外框與角色腳底十字，
點地圖任一處，左上角會顯示該點的原圖座標，填入 `zones.js` 即可。

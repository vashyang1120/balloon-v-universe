# balloon-v-universe
Balloon V Game Universe - Player Portal &amp; Game Lobby

氣球小V遊戲宇宙 — 統一玩家入口

## 目前版本
`balloon-v-universe-v0.1.0-map-interaction-test-1`（地圖互動測試版）

## 檔案
| 檔案 | 用途 |
|---|---|
| `index.html` | 頁面結構 |
| `style.css` | 版面與樣式（桌機 / 手機） |
| `main.js` | 地圖、遮罩、光暈、選取邏輯 |
| `zones.js` | **四個選區的座標與文字（校準時只改這個檔）** |
| `assets/universe_map_bg.png` | 正式遊樂園底圖（不可修改） |

## 校準選區
在網址後加上 `?debug=1`，會顯示所有選區外框；
點地圖任一處，左上角會顯示該點的原圖座標，填入 `zones.js` 的 `points` 即可。

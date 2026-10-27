# balloon-v-universe
Balloon V Game Universe - Player Portal &amp; Game Lobby

氣球小V遊戲宇宙 — 統一玩家入口

## 目前版本
`balloon-v-universe-v0.3.1-onboarding-audio-ux-test-1`（新手體驗、教學防呆、音樂音效整合測試版）

## 檔案
| 檔案 | 用途 |
|---|---|
| `index.html` | 頁面結構 |
| `style.css` | 外觀樣式（桌機 / 手機） |
| `zones.js` | **集中設定檔**：選區、聚焦、角色、UI 素材路徑、遊戲入口位置、玩家系統設定、引導與教學文案 |
| `main.js` | 地圖互動（v0.2.1 定案）＋大廳：遊戲入口、玩家資訊卡、頭像列、切換玩家、我的通行證 |
| `identity.js` | 玩家身份工具：playerKey 公式逐字取自四款遊戲（v0.3.0 新增） |
| `player-store.js` | 玩家資料層：Firebase 讀取、建立新玩家、本機記憶、身份交接介面（v0.3.0 新增） |
| `onboarding.js` | 新手引導、找回通行證、首次入園教學（v0.3.0 新增） |
| `dialogue.js` | RPG 對話框元件（正式底板、選項、不可略過的提醒、依目標自動定位） |
| `audio.js` | 全域音訊管理：大廳 BGM（循環交叉淡化）、Web Audio 介面音效、聲音設定（v0.3.1 新增） |
| `assets/universe_map_bg.png` | 正式遊樂園底圖（不可修改） |
| `assets/universe_lobby_v_dog.png` | 中央廣場小V與氣球小狗（不可修改） |
| `assets/ui/*.png` | 14 張正式 UI 素材（不可修改） |
| `assets/audio/universe_lobby_bgm.mp3` | 正式大廳 BGM（使用者上傳的 Suno 原檔，不可修改） |

## 玩家資料規則
- `playerKey = encodeFirebaseKeyPart(ID) + "__" + baseAvatarKey`（與遊戲相同）
- `baseAvatarKey` 固定身份圖案；`displayAvatarKey` 可更換的展示頭像
- 大廳只會在「建立新玩家」時寫入 `players/{playerKey}/profile`，而且只有完全不存在時才寫入
- 大廳不會寫入 V幣、稱號、收藏或遊戲紀錄

## 測試方式
- `?sandbox=1`：測試沙盒，資料只存在瀏覽器分頁，不會連線或寫入正式 Firebase
- `?debug=1`：顯示選區外框、角色腳底十字、座標與身份交接資料

## 聲音
- 背景音樂在第一次點擊畫面後才開始播放（瀏覽器自動播放規則）
- 右上角 🎵 按鈕可分別開關「背景音樂」與「介面音效」，設定存在這台裝置

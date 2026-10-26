/* ==========================================================
   氣球小V遊戲宇宙 — 集中設定檔
   balloon-v-universe-v0.2.1-focus-and-character-tuning-test-1

   ★ 所有可調整的數值都集中在這個檔案：
     選區座標、聚焦暗化、光暈、動畫速度、中央角色、RPG 對話。
     其他檔案不需要修改。

   座標說明：
   - 所有座標都是「原始底圖上的像素位置」(x, y)。
   - 原點 (0,0) 在圖片左上角，往右 x 變大、往下 y 變大。
   - 目前底圖 assets/universe_map_bg.png 實際尺寸為 1536 × 1024。
   - 若日後換成不同解析度（但構圖相同）的圖片，
     程式會依 designWidth / designHeight 自動等比換算。

   校準方法：
   - 網址後面加上 ?debug=1
     例如 https://vashyang1120.github.io/balloon-v-universe/?debug=1
   - 會顯示四個選區外框（粉紅虛線）與角色腳底定位點（粉紅十字），
     點地圖任何位置，左上角會顯示該點的圖片座標。
   ========================================================== */

window.MAP_CONFIG = {
  version: "balloon-v-universe-v0.2.1-focus-and-character-tuning-test-1",

  /* 正式底圖路徑（不可替換成其他圖片） */
  mapSrc: "assets/universe_map_bg.png",

  /* 下面所有座標所依據的圖片尺寸 */
  designWidth: 1536,
  designHeight: 1024,

  /* 哪些畫面算「桌機」（與 style.css 的桌機版面條件相同） */
  desktopQuery: "(min-width: 900px) and (min-aspect-ratio: 1/1)",

  /* ---------- 聚焦效果 ----------
     darkness   ：未選區域變暗程度（0 = 不變暗，1 = 全黑）
     saturation ：未選區域保留多少色彩（1 = 原色，0 = 黑白）
     haze       ：未選區域蓋上一層中性灰霧，降低對比與活力（0 = 不加）
     darkColor  ：暗化用的顏色（v0.2.0 桌機與手機都是深藍 #0a0f2a）
     featherSize：選區邊緣柔和度（原圖像素）
     v0.2.0 桌機原值：darkness 0.5、saturation 0.45、haze 0、darkColor #0a0f2a */
  focus: {
    desktop: { darkness: 0.62, saturation: 0.2, haze: 0.22, darkColor: "#12121c" },
    mobile:  { darkness: 0.38, saturation: 0.65, haze: 0,    darkColor: "#0a0f2a" },
    hazeColor: "#88888e",      // 中性灰（不帶顏色，才不會反而增加色彩）
    featherSize: 14
  },

  /* ---------- 選中區域光暈 ---------- */
  glow: {
    color: "#ffe680",        // 手機外圈金色（未改）
    desktopColor: "#ffd84d", // 桌機外圈金色，較飽和（v0.2.0 桌機也是 #ffe680）
    innerColor: "#ffffff",   // 內圈白色
    edgeColor: "#fff3b0",    // 清楚的金邊線（不模糊）
    desktopWidth: 28,        // 桌機光暈粗細（v0.2.0：18）
    mobileWidth: 11,         // 手機光暈粗細（未改）
    desktopEdgeWidth: 4,     // 桌機清楚金邊粗細（v0.2.0 沒有）
    mobileEdgeWidth: 0,      // 手機不加金邊，維持原樣
    blur: 9,                 // 光暈模糊程度
    breatheSeconds: 2.4      // 呼吸光一次的秒數
  },

  /* ---------- 動畫速度（毫秒） ---------- */
  animation: {
    focusMs: 500,            // 暗化 / 聚焦切換
    panelMs: 350             // 介紹面板滑入
  },

  /* ---------- 中央廣場角色（小V與氣球小狗合圖） ----------
     footX / footY ：角色腳底要站在地圖上的哪一點（原圖座標）
     height        ：整張角色 PNG 在地圖上的顯示高度（原圖像素）
     anchorX/Y     ：角色 PNG 內「腳底點」的位置（0～1，相對於 PNG 寬高）
                     目前 = PNG 內角色範圍的底部中央
     shadow        ：腳下陰影大小與深淺（大小會跟著 height 自動等比放大）
     v0.2.0 原值：footX 735、footY 752、height 185                  */
  character: {
    src: "assets/universe_lobby_v_dog.png",
    footX: 735,              // 未改（維持在廣場與階梯的中軸線上）
    footY: 708,              // 752 → 708，往地圖後方移 44 像素
    height: 200,             // 185 → 200，放大為 108.1%
    anchorX: 0.511,
    anchorY: 0.986,
    shadow: { widthRatio: 0.92, heightRatio: 0.13, offsetY: -6, opacity: 0.38 }
  },

  /* ---------- RPG 對話框 ---------- */
  dialogue: {
    speakerName: "氣球小V",
    typeSpeedMs: 45,         // 每個字出現的間隔（越小越快）
    portrait: null           // 正式 RPG 半身像（尚未指定，先不顯示）
  },

  /* ---------- 四個遊戲區域 ---------- */
  zones: [
    {
      id: "academy",
      name: "知識學院",
      game: "小V知識挑戰",
      intro: "一起挑戰有趣的知識題目！",
      vLine: "準備好動動腦了嗎？一起來挑戰知識吧！",
      icon: "📚",
      direction: "上方中央",
      pin: { x: 690, y: 238 },          // 地圖上名牌的位置
      points: [
        [505, 150], [540, 60], [610, 20], [680, 0], [760, 10],
        [830, 70], [865, 150], [880, 215], [850, 255], [760, 268],
        [690, 272], [610, 265], [530, 250], [495, 205]
      ]
    },
    {
      id: "stage",
      name: "音樂舞台",
      game: "氣球小V節奏遊戲",
      intro: "跟著音樂節奏一起挑戰！",
      vLine: "跟著音樂一起玩，看看你的節奏感有多厲害！",
      icon: "🎵",
      direction: "右上方",
      pin: { x: 1180, y: 345 },
      points: [
        [960, 250], [1010, 190], [1100, 155], [1210, 140], [1320, 150],
        [1380, 200], [1415, 270], [1400, 350], [1340, 405], [1200, 420],
        [1060, 410], [985, 380], [950, 320]
      ]
    },
    {
      id: "blocks",
      name: "方塊工坊",
      game: "氣球小V方塊派對",
      intro: "動動腦，挑戰更高分！",
      vLine: "來挑戰方塊吧！看看你能拿到多少分！",
      icon: "🧩",
      direction: "左側",
      pin: { x: 270, y: 548 },
      points: [
        [30, 420], [45, 350], [110, 320], [190, 280], [240, 245],
        [300, 270], [400, 285], [470, 330], [500, 420], [510, 500],
        [470, 570], [360, 600], [200, 600], [80, 575], [30, 510]
      ]
    },
    {
      id: "island",
      name: "派對島",
      game: "氣球小V：派對島大作戰",
      intro: "跟著小V和氣球小狗展開冒險！",
      vLine: "準備好冒險了嗎？我們一起出發吧！",
      icon: "🏝️",
      direction: "右側",
      pin: { x: 1240, y: 610 },
      points: [
        [1000, 500], [1030, 450], [1120, 420], [1240, 400], [1360, 420],
        [1450, 460], [1515, 510], [1515, 590], [1460, 640], [1330, 665],
        [1180, 670], [1070, 655], [1010, 600]
      ]
    }
  ]
};

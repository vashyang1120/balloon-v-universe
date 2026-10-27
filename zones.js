/* ==========================================================
   氣球小V遊戲宇宙 — 集中設定檔
   balloon-v-universe-v0.3.2-lobby-foreground-rpg-animation-test-1

   ★ 所有可調整的數值與文字都集中在這個檔案：
     選區座標、聚焦暗化、光暈、動畫速度、中央角色、RPG 對話、
     UI 素材路徑、遊戲入口位置、玩家系統設定、新手引導與教學文案。

   座標說明：
   - 所有地圖座標都是「原始底圖上的像素位置」(x, y)。
   - 原點 (0,0) 在圖片左上角，往右 x 變大、往下 y 變大。
   - 目前底圖 assets/universe_map_bg.png 實際尺寸為 1536 × 1024。

   校準方法：
   - 網址後面加上 ?debug=1
   - 會顯示四個選區外框（粉紅虛線）、角色腳底定位點（粉紅十字）、
     點地圖任何位置左上角會顯示座標，並顯示目前玩家的身份交接資料。

   測試沙盒：
   - 網址後面加上 ?sandbox=1
   - 玩家資料只存在這個瀏覽器分頁，完全不會連線或寫入正式 Firebase。
   ========================================================== */

window.MAP_CONFIG = {
  version: "balloon-v-universe-v0.3.2-lobby-foreground-rpg-animation-test-1",

  /* 正式底圖路徑（不可替換成其他圖片） */
  mapSrc: "assets/universe_map_bg.png",

  /* 下面所有座標所依據的圖片尺寸 */
  designWidth: 1536,
  designHeight: 1024,

  /* 哪些畫面算「桌機」（與 style.css 的桌機版面條件相同） */
  desktopQuery: "(min-width: 900px) and (min-aspect-ratio: 1/1)",

  /* ---------- 聚焦效果（v0.2.1 定案，未改） ---------- */
  focus: {
    desktop: { darkness: 0.62, saturation: 0.2, haze: 0.22, darkColor: "#12121c" },
    mobile:  { darkness: 0.38, saturation: 0.65, haze: 0,    darkColor: "#0a0f2a" },
    hazeColor: "#88888e",
    featherSize: 14
  },

  /* ---------- 選中區域光暈（v0.2.1 定案，未改） ---------- */
  glow: {
    color: "#ffe680",
    desktopColor: "#ffd84d",
    innerColor: "#ffffff",
    edgeColor: "#fff3b0",
    desktopWidth: 28,
    mobileWidth: 11,
    desktopEdgeWidth: 4,
    mobileEdgeWidth: 0,
    blur: 9,
    breatheSeconds: 2.4
  },

  /* ---------- 動畫速度（毫秒） ---------- */
  animation: {
    focusMs: 500,
    panelMs: 350,
    passToLobbyMs: 900       // 通行證 → 大廳 轉場（v0.3.0 新增）
  },

  /* ---------- 中央廣場角色（v0.2.1 定案，未改） ---------- */
  character: {
    src: "assets/universe_lobby_v_dog.png",
    footX: 735,
    footY: 708,
    height: 200,
    anchorX: 0.511,
    anchorY: 0.986,
    shadow: { widthRatio: 0.92, heightRatio: 0.13, offsetY: -6, opacity: 0.38 }
  },

  /* ---------- 歡迎泡泡（桌機顯示在小V右上方，原圖座標） ---------- */
  welcomeBubble: {
    x: 858,                  // 泡泡中心
    y: 430,
    width: 230,              // 泡泡寬度（原圖像素）
    showOnMobile: false      // 手機地圖太小，泡泡字會看不清楚，先不顯示
  },

  /* ---------- RPG 對話框 ---------- */
  dialogue: {
    speakerName: "氣球小V",
    typeSpeedMs: 45,
    portrait: null           // 正式 RPG 半身像（尚未指定，先不顯示）
  },

  /* ---------- 14 張正式 UI 素材（路徑必須與 repository 完全一致） ---------- */
  ui: {
    btn_quiz:        "assets/ui/btn_quiz_idle.png",
    btn_rhythm:      "assets/ui/btn_rhythm_idle.png",
    btn_tetris:      "assets/ui/btn_tetris_idle.png",
    btn_adventure:   "assets/ui/btn_adventure_idle.png",
    signSelect:      "assets/ui/sign_select_player_idle.png",
    signPass:        "assets/ui/sign_my_pass_idle.png",
    panelDialogue:   "assets/ui/panel_dialogue_idle.png",
    panelPass:       "assets/ui/panel_pass_idle.png",
    panelProfile:    "assets/ui/panel_profile_idle.png",
    speechWelcome:   "assets/ui/speech_welcome.png",
    frameBlue:       "assets/ui/avatar_frame_blue_idle.png",
    framePink:       "assets/ui/avatar_frame_pink_idle.png",
    frameGold:       "assets/ui/avatar_frame_gold_idle.png",
    addPlayer:       "assets/ui/avatar_add_player_idle.png"
  },

  /* ---------- 玩家系統（依四款遊戲現有程式盤點結果） ----------
     ⚠ 以下設定必須與四款遊戲完全一致，請勿自行修改：
       - Firebase 專案與資料路徑 players/{playerKey}
       - playerKey = encodeFirebaseKeyPart(ID) + "__" + baseAvatarKey
       - 身份圖案只能從 17 個內建頭像選擇（與四款遊戲相同）               */
  player: {
    firebaseSdkVersion: "9.23.0",            // 四款遊戲使用的版本
    firebaseConfig: {                          // 與四款遊戲相同（公開的前端設定）
      apiKey: "AIzaSyAZ8WTuAHOslZSa4eqqX3dHR771mkaSNd8",
      authDomain: "vparty-rhythm-game.firebaseapp.com",
      databaseURL: "https://vparty-rhythm-game-default-rtdb.firebaseio.com",
      projectId: "vparty-rhythm-game",
      storageBucket: "vparty-rhythm-game.firebasestorage.app",
      messagingSenderId: "1043884247859",
      appId: "1:1043884247859:web:24b1c030d159d1e9374c46"
    },
    playersPath: "players",
    avatarBaseUrl: "https://vashyang1120.github.io/vparty-rhythm-game/assets/avatars/",
    idMaxLength: 20,                           // 只限制大廳輸入框長度
    /* 17 個內建頭像：可作為「固定身份圖案」，也永遠可作為展示頭像 */
    builtinAvatars: [
      ["boy1", "男生1"], ["girl1", "女生1"], ["boy2", "男生2"], ["girl2", "女生2"],
      ["cat1", "貓咪1"], ["cat2", "貓咪2"], ["fat1", "胖胖"], ["girl3", "女生3"],
      ["curl1", "捲髮1"], ["boy3", "男生3"], ["girl4", "女生4"], ["girl5", "女生5"],
      ["curl2", "捲髮2"], ["dog1", "狗狗1"], ["dog2", "狗狗2"], ["dog3", "狗狗3"],
      ["dog4", "狗狗4"]
    ],
    /* 可解鎖頭像：只能當「展示頭像」，不能當身份圖案（與遊戲相同） */
    unlockableAvatars: [
      ["xiaov_base", "小V"], ["dance_sister_01", "唱跳姐姐"],
      ["balloon_sister_01", "氣球姐姐 1"], ["balloon_sister_02", "氣球姐姐 2"],
      ["balloon_brother_01", "氣球哥哥 1"], ["balloon_brother_02", "氣球哥哥 2"],
      ["balloon_brother_03", "氣球哥哥 3"], ["bubble_brother_01", "泡泡哥哥"],
      ["xiaov_special", "小V 特別版"]
    ],
    gameIds: ["quiz", "rhythm", "tetris", "adventure"],
    gameNames: { quiz: "知識挑戰", rhythm: "節奏遊戲", tetris: "方塊派對", adventure: "派對島大作戰" },
    /* 四款遊戲網址（本版只用於身份交接測試資料，不會自動跳轉） */
    gameUrls: {
      quiz: "https://vashyang1120.github.io/vparty-quiz-game/",
      rhythm: "https://vashyang1120.github.io/vparty-rhythm-game/",
      tetris: "https://vashyang1120.github.io/vparty-tetris/",
      adventure: "https://vashyang1120.github.io/balloon-v-rush/rpg-test/"
    },
    /* 是否把目前玩家寫入共用鍵 vPartyPlayerProfile。
       目前只有節奏遊戲會讀這個鍵，寫入後會直接改變節奏遊戲下次開啟時的玩家。
       未經使用者確認前保持 false。 */
    writeSharedProfileKey: false
  },

  /* ---------- 新手引導文案 ---------- */
  onboarding: {
    welcome: [
      "歡迎來到氣球小V遊樂園！我是小V！",
      "要進入遊樂園，需要一張專屬通行證喔。你是第一次來玩嗎？"
    ],
    addPlayerPrompt: "要幫誰加入通行證呢？",
    newStart: "太好了！我們一起來做一張你的專屬通行證吧！",
    askId: "先告訴我你的玩家 ID 吧！",
    reminder1: "這個圖案會和你的玩家 ID 組成專屬身份，要記住你選的圖案喔！",
    reminder2: [
      "請再確認一次：玩家 ID「{id}」加上這個「{avatar}」圖案，就是你的專屬身份。",
      "這個圖案建立後就會固定用來認出你。以後換裝置、或進入其他遊戲，都要記得同一個 ID 和這個圖案喔！",
      "之後就算更換展示頭像，這個專屬身份圖案也不會改變。確定要用這個圖案嗎？"
    ],
    reminder2Short: "再確認一次：ID「{id}」＋「{avatar}」圖案會固定成為你的專屬身份，以後要記得這兩樣喔！之後換展示頭像也不會改變它。確定嗎？",
    duplicate: "咦？這張通行證已經有人使用了耶！\n如果這是你以前的通行證，可以選擇『我玩過了』；如果不是，就換個 ID 或專屬圖案吧！",
    creating: "正在幫你製作通行證…",
    created: "完成了！這是你的專屬通行證！",
    createFailed: "哎呀，連線出了點問題，通行證還沒有建立成功。要再試一次嗎？",
    returningAsk: "歡迎回來！請輸入你的玩家 ID，再選你當初選的專屬圖案。",
    returningNotFound: "咦？找不到這張通行證耶…請確認 ID 和圖案是不是和當初一樣。",
    returningFound: "找到了！歡迎回來，{id}！",
    loadFailed: "哎呀，資料讀取失敗了，請檢查網路後再試一次。"
  },

  /* ---------- 首次入園教學（spotlight 聚光燈 + 實際點擊） ---------- */
  /* 每一步都標明：
       intro  = 只是介紹 → 唯一正確操作是「紫色箭頭」（文案不暗示現在就按其他按鈕）
       action = 要玩家實際操作 → 唯一正確操作是指定目標
     hint  = 顯示在目標旁的短提示（不重複整段對話）
     wrong = 點錯時的溫和提醒                                                    */
  tutorial: {
    nextHint: "按紫色箭頭繼續 ▶",
    wrongIntro: "先看完這個小介紹喔！按紫色箭頭繼續。",
    steps: {
      zones:  { type: "intro",  actor: { mood: "happy", full: "openArms", enter: true }, text: "這裡有四個遊戲區域：知識學院、音樂舞台、方塊工坊和派對島！請按紫色箭頭繼續。" },
      tryZone:{ type: "action", actor: { mood: "point", point: true }, text: "點一下任何一個遊戲區域試試看！", hint: "點一個遊戲區域", wrong: "先點一個遊戲區域試試看喔！" },
      play:   { type: "intro",  actor: { mood: "point", point: true }, text: "這裡就是遊戲入口！等教學結束後，就可以按「開始遊玩」出發囉。現在請按紫色箭頭繼續。" },
      avatar: { type: "action", actor: { mood: "point", point: true }, text: "下面是這台裝置記住的玩家。請按一下你自己的頭像！", hint: "這是你！點這裡", wrong: "現在先點自己的頭像喔！",
                wrongAdd: "現在不是新增玩家喔！先點自己的頭像。", wrongOther: "現在先不要切換玩家喔！先點自己的頭像。" },
      avatarDone: { type: "intro", actor: { mood: "happy" }, text: "這就是你！以後要換其他玩家時點他的頭像，我會先問你要不要切換；按「＋」可以加入新的玩家。請按紫色箭頭繼續。" },
      info:   { type: "intro",  actor: { mood: "point", point: true, full: true }, text: "右上角是你的玩家資料：ID、稱號和 V幣。請按紫色箭頭繼續。" },
      pass:   { type: "action", actor: { mood: "point", point: true }, text: "最後，請點「我的通行證」看看你的完整資料吧！", hint: "點這裡打開", wrong: "請點「我的通行證」木牌喔！" },
      passView: { type: "action", text: "這是你的完整通行證！看完後按右上角的 ✕ 關閉。", hint: "看完按 ✕ 關閉", wrong: "看完後按 ✕ 關閉通行證喔！" },
      done:   { type: "intro",  actor: { mood: "congrats", full: "openArms", enter: true, sparkle: true }, text: "教學完成！現在可以自由探索遊樂園囉！" }
    }
  },

  /* ---------- 音樂與音效（v0.3.1 新增） ----------
     bgmSrc：使用者上傳的正式大廳 BGM（Suno），原始檔案不壓縮、不改寫
     bgmVolume：0～1，預設 0.25（25%）
     crossfadeSec：循環接點交叉淡化秒數（原曲結尾沒有淡出，直接循環會有斷點）
     duckRatio：RPG 對話時背景音樂暫時降到原音量的比例，讓對話音效更清楚
     sfxVolume：介面音效音量                                                  */
  audio: {
    bgmSrc: "assets/audio/universe_lobby_bgm.mp3",
    bgmVolume: 0.25,
    crossfadeSec: 2.5,
    fadeInSec: 1.5,
    duckRatio: 0.7,
    sfxVolume: 0.5,
    typeSoundEvery: 3,        // 逐字顯示時，每幾個字播一次輕微文字音
    defaultBgmOn: true,
    defaultSfxOn: true
  },

  /* ---------- RPG 角色演出（v0.3.2 新增，rpg-actor.js 使用） ----------
     風格：B. 活潑但有節奏 —— 登場有活力、說話時微動、重點情緒才有較大反應。
     ⚠ 這批 PNG 沒有獨立嘴巴／眼睛／手臂圖層：只做整張圖片的微動畫，不是嘴型同步或眨眼。

     每張圖的 scale / offsetX / offsetY：讓不同姿勢切換時頭部與身體不跳位
       半身像：以 v_bust_normal 為基準，對齊頭部中心與頭頂（依 PNG 像素量測）
       全身像：以 v_full_wave 為基準，腳底貼齊地面，只對齊身體中心
       offsetX / offsetY 單位 = 角色容器高度的比例；scale = 相對高度（都等比縮放）
     point（半身指引）圖中手指向「畫面右側」→ 只用在目標位於角色右方時；
       目標在左方時改用一般表情＋目標旁箭頭（不鏡像翻轉圖片）                       */
  actor: {
    bust: {
      normal:   { src: "assets/rpg/v_bust_normal.png",   scale: 1.000, offsetX: 0.000,  offsetY: 0.000 },
      happy:    { src: "assets/rpg/v_bust_happy.png",    scale: 1.027, offsetX: -0.048, offsetY: 0.021 },
      point:    { src: "assets/rpg/v_bust_point.png",    scale: 0.995, offsetX: 0.054,  offsetY: -0.009, pointsTo: "right" },
      remind:   { src: "assets/rpg/v_bust_remind.png",   scale: 0.969, offsetX: -0.025, offsetY: -0.032 },
      congrats: { src: "assets/rpg/v_bust_congrats.png", scale: 1.038, offsetX: -0.058, offsetY: 0.035 }
    },
    full: {
      wave:         { src: "assets/rpg/v_full_wave.png",        scale: 1, offsetX: 0.000,  offsetY: 0 },
      pointLeft:    { src: "assets/rpg/v_full_point_left.png",  scale: 1, offsetX: -0.090, offsetY: 0, pointsTo: "left" },
      pointRight:   { src: "assets/rpg/v_full_point_right.png", scale: 1, offsetX: 0.110,  offsetY: 0, pointsTo: "right" },
      openArms:     { src: "assets/rpg/v_full_open_arms.png",   scale: 1, offsetX: 0.064,  offsetY: 0 },
      gentleRemind: { src: "assets/rpg/v_full_remind.png",      scale: 1, offsetX: 0.020,  offsetY: 0 }
    },
    /* 情緒 → 預設全身姿勢（只有標記 full: true 的重要句子才用全身像） */
    fullFor: { happy: "wave", congrats: "openArms", remind: "gentleRemind", normal: "wave" },
    /* 大小（桌機／手機分開；手機空間不足時只用半身像） */
    bustHeight: { desktop: 168, mobile: 96 },       // px
    fullHeight: { desktop: 330, minDesktop: 220 },  // px，全身像只在桌機使用
    /* 動畫時間（毫秒）與幅度 */
    timing: {
      enterMs: 480,          // 登場：從下方滑入 + 90% → 105% → 100%
      enterRise: 18,         // 登場滑入距離（px）
      swapMs: 200,           // 換姿勢：交叉淡化 + 輕微位移
      swapShift: 6,          // 換姿勢時的位移（px）
      talkPeriodMs: 1150,    // 說話微動一個來回
      talkLift: 3,           // 說話上下起伏（px）
      talkTilt: 1.4,         // 說話傾斜（度）
      talkScale: 0.015,      // 說話縮放（1.5%）
      idlePeriodMs: 3400,    // 文字完成後的呼吸
      waitTiltEveryMs: 6500, // 等待下一步時偶爾輕微傾斜
      reactMs: 320           // 提醒／恭喜時的較大反應
    },
    /* 和中央廣場的小V＋小狗同時出現時，廣場圖層暫時降低存在感（不修改原圖） */
    plazaDimWhenFull: 0.55
  },

  /* ---------- 手機前景（v0.3.2） ----------
     src：正式手機前景素材路徑。檔案不存在時自動使用保守的雲霧淡化回退畫面，
          其他功能不受影響；?debug=1 會顯示缺少素材提示。                         */
  mobileForeground: {
    src: "assets/lobby_mobile_foreground_base.png",
    position: "center top",
    mist: true                // 地圖與前景接縫處的雲霧過渡
  },

  /* ---------- 木牌加長腳柱裁切（v0.3.2） ----------
     visible：只顯示 PNG 上方這個比例（牌面＋上半段腳柱），下半段藏入地面；圖片本身不變。
     依像素量測：選擇玩家牌面與裝飾到 54.24%，我的通行證到 56.91%，各再露出約 12% 腳柱。
     legFade：可見區最下方多少比例做淡出（腳柱自然沒入地面，不是一刀切）            */
  signCrop: {
    select: { visible: 0.665, legFade: 0.10 },
    pass:   { visible: 0.690, legFade: 0.10 }
  },

  /* ---------- 身份圖案選擇畫面（v0.3.1） ----------
     faceZoom：頭像框內真正頭像的放大倍率（頭像原圖臉部周圍有黑色留白）     */
  picker: {
    faceZoom: 1.22,
    facePosY: "38%"
  },

  /* ---------- 四個遊戲區域 ----------
     entry：桌機時遊戲入口按鈕在地圖上的位置（原圖座標，中心點）與寬度    */
  zones: [
    {
      id: "academy",
      gameId: "quiz",
      name: "知識學院",
      game: "小V知識挑戰",
      gameType: "問答遊戲",
      intro: "一起挑戰有趣的知識題目！",
      vLine: "準備好動動腦了嗎？一起來挑戰知識吧！",
      button: "btn_quiz",
      direction: "上方中央",
      entry: { x: 405, y: 150, width: 150 },
      points: [
        [505, 150], [540, 60], [610, 20], [680, 0], [760, 10],
        [830, 70], [865, 150], [880, 215], [850, 255], [760, 268],
        [690, 272], [610, 265], [530, 250], [495, 205]
      ]
    },
    {
      id: "stage",
      gameId: "rhythm",
      name: "音樂舞台",
      game: "氣球小V節奏遊戲",
      gameType: "節奏遊戲",
      intro: "跟著音樂節奏一起挑戰！",
      vLine: "跟著音樂一起玩，看看你的節奏感有多厲害！",
      button: "btn_rhythm",
      direction: "右上方",
      entry: { x: 880, y: 225, width: 150 },
      points: [
        [960, 250], [1010, 190], [1100, 155], [1210, 140], [1320, 150],
        [1380, 200], [1415, 270], [1400, 350], [1340, 405], [1200, 420],
        [1060, 410], [985, 380], [950, 320]
      ]
    },
    {
      id: "blocks",
      gameId: "tetris",
      name: "方塊工坊",
      game: "氣球小V方塊派對",
      gameType: "方塊遊戲",
      intro: "動動腦，挑戰更高分！",
      vLine: "來挑戰方塊吧！看看你能拿到多少分！",
      button: "btn_tetris",
      direction: "左側",
      entry: { x: 560, y: 470, width: 150 },
      points: [
        [30, 420], [45, 350], [110, 320], [190, 280], [240, 245],
        [300, 270], [400, 285], [470, 330], [500, 420], [510, 500],
        [470, 570], [360, 600], [200, 600], [80, 575], [30, 510]
      ]
    },
    {
      id: "island",
      gameId: "adventure",
      name: "派對島",
      game: "氣球小V：派對島大作戰",
      gameType: "冒險遊戲",
      intro: "跟著小V和氣球小狗展開冒險！",
      vLine: "準備好冒險了嗎？我們一起出發吧！",
      button: "btn_adventure",
      direction: "右側",
      entry: { x: 962, y: 578, width: 150 },
      points: [
        [1000, 500], [1030, 450], [1120, 420], [1240, 400], [1360, 420],
        [1450, 460], [1515, 510], [1515, 590], [1460, 640], [1330, 665],
        [1180, 670], [1070, 655], [1010, 600]
      ]
    }
  ]
};

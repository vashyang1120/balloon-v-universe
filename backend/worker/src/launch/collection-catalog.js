/**
 * 共用稱號目錄＋展示頭像目錄（v0.3.1）
 *
 * 來源（只沿用已存在、已定案的內容；名稱、ID、條件文字都不改）：
 *   方塊 5 個稱號  ← vparty-tetris TETRIS_TITLES＋checkTetrisTitleUnlocks
 *   節奏 6 個稱號  ← vparty-rhythm-game RHYTHM_TITLES＋checkRhythmTitleUnlocks（Full Combo 原本就標示「條件確認中」，不自動解鎖）
 *   問答 6 個稱號  ← vparty-quiz-game QUIZ_BADGE_DEFS＋evaluateQuizBadgeDefs
 *   派對島 12 個稱號 ← balloon-v-rush C1U_TITLES
 *       ‧ 5 個「分項滿分」稱號：伺服器可以從已接受的第一大陸成績（五大分項）直接驗證 → 正式開放
 *       ‧ 善良冒險家／和平大使／超勤儉冒險家、4 個小遊戲稱號：規則已定，但判定資料（擊倒、傷害、購買、小遊戲比分）
 *         不在正式成績裡，伺服器無法驗證 → 「準備中」（不發放），待使用者決定
 *   展示頭像 ← vparty-tetris／vparty-rhythm-game UNLOCKABLE_AVATARS（圖片沿用節奏遊戲 assets/avatars 正式素材）
 *       ‧ 小V：完成任一遊戲 1 場；氣球哥哥 1：方塊 2,000 分；氣球哥哥 2：節奏任一首 A 以上 → 正式自動解鎖
 *       ‧ 氣球哥哥 3「冒險遊戲通過指定進度」：進度沒有定義 → 準備中
 *       ‧ 唱跳姐姐、氣球姐姐 1／2（社群追蹤、好評）、泡泡哥哥（活動）、小V 特別版（特別活動）→ 只能由管理員人工發放
 *       ‧ 學生專屬（涵涵、萱萱）→ 私人頭像：只有管理員授權給指定 playerId 才會出現在該玩家的收藏
 *
 * 規則函式只讀「已接受的正式成績」（scoreData）與伺服器自己的問答進度，不讀前端傳來的解鎖結果。
 */
import { ADVENTURE_CONTINENTS } from "./game-rules.js";

export const LEGACY_AVATAR_BASE = "https://vashyang1120.github.io/vparty-rhythm-game/assets/avatars/";
export const GAME_LABEL = Object.freeze({ tetris: "方塊派對", rhythm: "節奏遊戲", quiz: "知識挑戰", adventure: "派對島大作戰" });

/* ---------- 規則小工具（與原版一致） ---------- */
// 節奏原版 getRankValue：S/SS/SSS/P=5、A+=4、A=3、B=2、C=1、其他 0
function rankValue(rank) {
  const r = String(rank || "").toUpperCase();
  if (r === "S" || r === "SS" || r === "SSS" || r === "P") return 5;
  if (r === "A+") return 4;
  if (r === "A") return 3;
  if (r === "B") return 2;
  if (r === "C") return 1;
  return 0;
}
const isFullScore = (d) => Number(d.totalQuestions || 0) > 0 && Number(d.correctCount || 0) >= Number(d.totalQuestions || 0);
// 問答原版：某年級「挑戰過」的科目數（attempts／bestScore／lastScore／updatedAt 任一 > 0）
function attemptedSubjects(progress, grade) {
  const g = (progress && progress[grade]) || {};
  return Object.values(g).filter((p) => p && typeof p === "object" &&
    (Number(p.attempts || 0) > 0 || Number(p.bestScore || 0) > 0 || Number(p.lastScore || 0) > 0 || Number(p.updatedAt || 0) > 0)).length;
}
const QUIZ_SUBJECT_COUNT = 8;
const partFull = (part) => (d) => Number(d.continentId) === 1 && Number((d.parts || {})[part]) === ADVENTURE_CONTINENTS[1].partMax[part];

/* ---------- 稱號 ---------- */
// rule(scoreData, ctx) → boolean；ctx = { quizProgress }（問答會帶伺服器更新後的進度）
const T = (gameId, titleKey, name, conditionText, rule, extra = {}) => Object.freeze({ gameId, titleKey, name, conditionText, status: rule ? "active" : "preparing", rule: rule || null, ...extra });

export const TITLE_CATALOG = Object.freeze([
  T("tetris", "tetris_first_clear", "初次堆疊者", "完成方塊遊戲 1 場", () => true),
  T("tetris", "tetris_score_1000", "方塊新星", "單場分數達 1000", (d) => Number(d.score || 0) >= 1000),
  T("tetris", "tetris_score_2000", "氣球堆疊師", "單場分數達 2000", (d) => Number(d.score || 0) >= 2000),
  T("tetris", "tetris_peak_combo_3", "連消高手", "單場最高連消達 3", (d) => Number(d.peakCombo || 0) >= 3),
  T("tetris", "tetris_level_5", "高塔建築師", "單場 Level 達 5", (d) => Number(d.level || 0) >= 5),

  T("rhythm", "rhythm_first_stage", "魔法初登場", "完成任一首歌。", () => true),
  T("rhythm", "rhythm_rank_b", "節奏小新星", "任一首歌達 B 以上。", (d) => rankValue(d.grade) >= rankValue("B")),
  T("rhythm", "rhythm_rank_a", "派對節拍手", "任一首歌達 A 以上。", (d) => rankValue(d.grade) >= rankValue("A")),
  T("rhythm", "rhythm_rank_s", "魔法節奏家", "任一首歌達 S 以上。", (d) => rankValue(d.grade) >= rankValue("S")),
  T("rhythm", "rhythm_hard_clear", "困難模式挑戰者", "完成任一 hard 難度歌曲。", (d) => d.difficulty === "hard"),
  T("rhythm", "rhythm_full_combo", "Full Combo 挑戰者", "任一首歌達成 Full Combo。", null, { note: "原版標示「條件確認中」，不自動解鎖" }),

  T("quiz", "v_academy_freshman", "V學園新生", "完成第一場問答挑戰", () => true),
  T("quiz", "little_scholar", "小小學霸", "任一科滿分", (d) => isFullScore(d)),
  T("quiz", "brain_teaser_king", "冷笑話王", "腦筋急轉彎任一場滿分", (d) => isFullScore(d) && d.subject === "brain"),
  T("quiz", "low_grade_graduate", "低年級畢業", "低年級 8 科都挑戰過", (d, c) => attemptedSubjects(c.quizProgress, "low") >= QUIZ_SUBJECT_COUNT),
  T("quiz", "middle_grade_graduate", "中年級畢業", "中年級 8 科都挑戰過", (d, c) => attemptedSubjects(c.quizProgress, "middle") >= QUIZ_SUBJECT_COUNT),
  T("quiz", "high_grade_graduate", "高年級畢業", "高年級 8 科都挑戰過", (d, c) => attemptedSubjects(c.quizProgress, "high") >= QUIZ_SUBJECT_COUNT),

  T("adventure", "adventure_treasure_hunter", "寶藏獵人", "第一大陸完整結算時「收集」滿分", partFull("collect")),
  T("adventure", "adventure_secret_explorer", "秘境探險家", "第一大陸完整結算時「探索」滿分", partFull("explore")),
  T("adventure", "adventure_battle_master", "戰鬥大師", "第一大陸完整結算時「戰鬥」滿分", partFull("combat")),
  T("adventure", "adventure_unyielding_hero", "不屈勇者", "第一大陸完整結算時「生存」滿分", partFull("survival")),
  T("adventure", "adventure_swift_adventurer", "神速冒險家", "第一大陸完整結算時「效率」滿分", partFull("efficiency")),
  T("adventure", "adventure_kind_adventurer", "善良冒險家", "整個第一大陸都沒有擊倒任何怪物（直接或間接都不行；橘子王決戰不計）", null, { note: "判定資料不在正式成績內，伺服器無法驗證" }),
  T("adventure", "adventure_peace_ambassador", "和平大使", "整個第一大陸都沒有對任何怪物造成傷害（橘子王決戰不計）；同時獲得「善良冒險家」", null, { note: "判定資料不在正式成績內，伺服器無法驗證" }),
  T("adventure", "adventure_super_thrifty", "超勤儉冒險家", "整個第一大陸都沒有在商店成功購買任何東西（打地鼠入場費不算）", null, { note: "判定資料不在正式成績內，伺服器無法驗證" }),
  T("adventure", "adventure_volleyball_rookie", "排球新星", "氣球排球 7：0 完封蠍子怪", null, { note: "小遊戲成績不是正式成績" }),
  T("adventure", "adventure_volleyball_expert", "排球高手", "氣球排球 7：0 完封橘子怪", null, { note: "小遊戲成績不是正式成績" }),
  T("adventure", "adventure_volleyball_king", "排球王者", "氣球排球 7：0 完封橘子王", null, { note: "小遊戲成績不是正式成績" }),
  T("adventure", "adventure_whack_legend", "傳奇槌王", "氣球槌打地鼠分數達到 660 分", null, { note: "小遊戲成績不是正式成績" }),
]);
export const TITLES_BY_KEY = Object.freeze(Object.fromEntries(TITLE_CATALOG.map((t) => [t.titleKey, t])));

/* ---------- 展示頭像 ---------- */
// unlock: "auto"（正式成績自動解鎖）｜"admin"（只能管理員人工發放）｜"preparing"（條件未定，不發放）
// visibility: "public"（所有人看得到，未解鎖顯示鎖定）｜"private"（只有被授權的玩家看得到）
const A = (avatarKey, name, file, unlock, conditionText, rule, visibility = "public") =>
  Object.freeze({ avatarKey, name, image: LEGACY_AVATAR_BASE + file, unlock, conditionText, rule: rule || null, visibility });

export const AVATAR_CATALOG = Object.freeze([
  A("xiaov_base", "小V", "xiaov_base.png", "auto", "完成任一遊戲 1 場", () => true),
  A("balloon_brother_01", "氣球哥哥 1", "balloon_brother_01.png", "auto", "方塊遊戲達 2,000 分", (d, c) => c.gameId === "tetris" && Number(d.score || 0) >= 2000),
  A("balloon_brother_02", "氣球哥哥 2", "balloon_brother_02.png", "auto", "節奏遊戲任一首達 A 以上", (d, c) => c.gameId === "rhythm" && rankValue(d.grade) >= rankValue("A")),
  A("balloon_brother_03", "氣球哥哥 3", "balloon_brother_03.png", "preparing", "冒險遊戲通過指定進度（進度尚未定案）"),
  A("dance_sister_01", "唱跳姐姐", "dance_sister_01.png", "admin", "追蹤 IG 或 FB 粉專（由管理員確認後發放）"),
  A("balloon_sister_01", "氣球姐姐 1", "balloon_sister_01.png", "admin", "加官方 LINE 好友（由管理員確認後發放）"),
  A("balloon_sister_02", "氣球姐姐 2", "balloon_sister_02.png", "admin", "Google 商家 5 星好評（由管理員確認後發放）"),
  A("bubble_brother_01", "泡泡哥哥", "bubble_brother_01.png", "admin", "泡泡活動限定 / 特別活動（由管理員發放）"),
  A("xiaov_special", "小V 特別版", "xiaov_special.png", "admin", "打敗小V / 特別活動 / 高階成就（由管理員發放）"),
  A("student_hanhan", "涵涵", "student_hanhan_01.png", "admin", "學生專屬", null, "private"),
  A("student_xuanxuan", "萱萱", "student_xuanxuan_01.png", "admin", "學生專屬", null, "private"),
]);
export const AVATARS_BY_KEY = Object.freeze(Object.fromEntries(AVATAR_CATALOG.map((a) => [a.avatarKey, a])));

/** 已接受成績可以解鎖的稱號與頭像（只回傳 key；是否已擁有由收藏服務判斷） */
export function evaluateUnlocks(gameId, scoreData, ctx = {}) {
  const c = { ...ctx, gameId };
  const titles = TITLE_CATALOG.filter((t) => t.gameId === gameId && t.rule && safe(() => t.rule(scoreData, c))).map((t) => t.titleKey);
  const avatars = AVATAR_CATALOG.filter((a) => a.unlock === "auto" && a.rule && safe(() => a.rule(scoreData, c))).map((a) => a.avatarKey);
  return { titles, avatars };
}
function safe(fn) { try { return !!fn(); } catch { return false; } }

/** 公開目錄（私人頭像不列出；規則函式不輸出） */
export function publicCatalog() {
  return {
    titles: TITLE_CATALOG.map(({ rule, ...t }) => ({ ...t, gameName: GAME_LABEL[t.gameId] })),
    avatars: AVATAR_CATALOG.filter((a) => a.visibility === "public").map(({ rule, ...a }) => a),
  };
}

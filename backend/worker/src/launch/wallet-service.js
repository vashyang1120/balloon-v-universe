/**
 * 共用 V幣錢包（WalletService）
 *
 * 資料：wallets/{playerId} = {
 *   playerId, balance, rev, updatedAt,
 *   claims: { "daily:2026-11-13": txId, "challenge:tetris:2026-11-13": txId, ... },
 *   ledger: { txId: { txId, type, gameId, playerId, dateKey, amount, balanceAfter, sourceSubmissionId, createdAt } }
 * }
 * 餘額、領獎標記、帳本都在「同一個節點」→ 每次入帳都是一次 CAS（見 cas.js），同時請求、重送、
 * 不同裝置同時提交都不會重複加幣；任何時候 balance ＝ 帳本金額加總（tests 會驗證）。
 *
 * 規則（已定案）：
 *   共用每日 +30：四款遊戲共用，每天（Asia/Taipei）第一場「後端 accepted」的有效遊戲
 *   今日挑戰 +10：方塊／節奏／問答各自每天最多一次，完成規則沿用各遊戲已驗收的規則；派對島本次沒有
 *   日期：以伺服器場次開始時間（台灣日期）判定；待審核後才接受的成績，仍算原本遊玩那天
 *
 * 前端不能直接增加餘額：這個服務只由「成績被接受」觸發。
 * 消費（扣 V幣）尚未開放：沒有任何扣款路徑；未來消費需經六位數 PIN（伺服器雜湊比對）。
 */
import { casUpdate } from "./cas.js";

export const REWARD_RULES = Object.freeze({
  daily: { amount: 30, type: "daily_play" },
  challenge: { amount: 10, type: "daily_challenge", games: ["tetris", "rhythm", "quiz"] },
});
export const walletPath = (playerId) => `wallets/${playerId}`;

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** 交易 ID 由「玩家＋領獎標記」決定：同一個獎勵永遠是同一個 ID，重試不會產生第二筆 */
export async function txIdFor(playerId, claimKey) {
  return "tx_" + (await sha(playerId + "|" + claimKey)).slice(0, 24);
}

/** 依成績決定可能的獎勵（只是「資格」；實際是否發放由錢包內的領獎標記決定） */
export function rewardCandidates(score) {
  const out = [{ claimKey: `daily:${score.rewardDate}`, type: REWARD_RULES.daily.type, amount: REWARD_RULES.daily.amount }];
  if (REWARD_RULES.challenge.games.includes(score.gameId) && score.challenge && score.challenge.done) {
    out.push({ claimKey: `challenge:${score.gameId}:${score.rewardDate}`, type: REWARD_RULES.challenge.type, amount: REWARD_RULES.challenge.amount, challengeKey: score.challenge.key });
  }
  return out;
}

export function createWalletService({ db, now }) {
  return {
    /**
     * 對一筆已接受的成績發放獎勵（冪等）。
     * @returns {{ awarded: object[], balance: number }}  awarded 只含「這一次」或之前因同一場而入帳的交易
     */
    async awardForScore(score) {
      const cands = rewardCandidates(score);
      const ids = await Promise.all(cands.map((c) => txIdFor(score.playerId, c.claimKey)));
      const t = now();
      const r = await casUpdate(db, walletPath(score.playerId), (cur) => {
        const w = cur && typeof cur === "object" ? cur : { playerId: score.playerId, balance: 0, rev: 0, claims: {}, ledger: {} };
        w.claims = w.claims || {}; w.ledger = w.ledger || {};
        const fresh = [];
        let balance = Number(w.balance || 0);
        cands.forEach((c, i) => {
          if (w.claims[c.claimKey]) return;   // 今天已經領過（可能是別的遊戲／別的裝置）
          balance += c.amount;
          const tx = { txId: ids[i], type: c.type, gameId: score.gameId, playerId: score.playerId, dateKey: score.rewardDate, amount: c.amount,
            balanceAfter: balance, sourceSubmissionId: score.submissionId, createdAt: t };
          if (c.challengeKey) tx.challengeKey = c.challengeKey;
          w.claims[c.claimKey] = ids[i];
          w.ledger[ids[i]] = tx;
          fresh.push(tx);
        });
        if (!fresh.length) return { result: { fresh: [], w } };
        return { value: { ...w, balance, rev: Number(w.rev || 0) + 1, updatedAt: t }, result: { fresh } };
      });
      const w = r.value || {};
      // 這場成績對應的全部入帳（包含先前重送時已入帳的），讓重送回應一致
      const mine = Object.values(w.ledger || {}).filter((tx) => tx.sourceSubmissionId === score.submissionId);
      return { awarded: mine, fresh: r.result.fresh || [], balance: Number(w.balance || 0) };
    },

    async getPublicSummary(playerId, todayKey) {
      const w = (await db.get(walletPath(playerId))) || {};
      const ledger = Object.values(w.ledger || {}).sort((a, b) => b.createdAt - a.createdAt);
      const claims = w.claims || {};
      return {
        playerId, balance: Number(w.balance || 0), currency: "V幣",
        today: {
          dateKey: todayKey,
          dailyPlay: !!claims[`daily:${todayKey}`],
          challenges: Object.fromEntries(REWARD_RULES.challenge.games.map((g) => [g, !!claims[`challenge:${g}:${todayKey}`]])),
        },
        recent: ledger.slice(0, 20).map((tx) => ({ txId: tx.txId, type: tx.type, gameId: tx.gameId, dateKey: tx.dateKey, amount: tx.amount, balanceAfter: tx.balanceAfter, createdAt: new Date(tx.createdAt).toISOString() })),
        spending: { enabled: false, pinRequired: true, note: "V幣消費尚未開放；開放後需輸入玩家自訂的六位數 PIN" },
      };
    },

    async getLedger(playerId) {
      const w = (await db.get(walletPath(playerId))) || {};
      return { balance: Number(w.balance || 0), ledger: Object.values(w.ledger || {}).sort((a, b) => a.createdAt - b.createdAt) };
    },
  };
}

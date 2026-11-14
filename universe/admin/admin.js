/*
 * 遊戲宇宙 成績管理（balloon-v-universe-v0.3.2-player-management-sync-test-1）
 *
 * v0.3.2：A. 玩家管理中心 —— 用玩家自己取的 ID 搜尋（同名分開列出、由管理員選擇），選一次之後
 *         基本資料／遊戲成績／V幣錢包／稱號與展示頭像／管理操作（發放、補判定、稽核）全部共用同一位玩家。
 *         切換玩家時先清空舊資料；每個非同步讀取都帶「選擇編號」，回來時若已換人就丟棄，動作送出前再確認目標仍是目前玩家。
 *         B. 全體紀錄與系統管理 —— 原本的全體功能；全體 CSV 不會被目前選擇的玩家篩選。
 *
 * 安全原則（與 admin-test 相同）：
 *  - 管理員身份只由 Worker 判斷（Firebase ID Token ＋ 伺服器 ADMIN_UIDS 名單）；頁面沒有任何寫死的密碼或 PIN
 *  - ID Token 只在送出請求當下取得、放進 Authorization 標頭；不顯示、不放網址、不存瀏覽器儲存空間
 *  - 登入狀態只在記憶體（inMemoryPersistence）
 *  - 所有資料用 textContent 顯示（不把伺服器資料當成 HTML）
 */
import { FIREBASE_WEB_CONFIG, API_BASE, EXPECTED_PROJECT_ID } from "../../admin-test/firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const $ = (id) => document.getElementById(id);
const GAME = { tetris: "方塊", rhythm: "節奏", quiz: "問答", adventure: "派對島" };
const STATUS = { accepted: "已接受", pending_review: "待審核", rejected: "已拒絕" };
const TYPE = { daily_play: "每日遊玩 +30", daily_challenge: "今日挑戰 +10" };
const PID = /^p_[a-z2-7]{20}$/;
let auth = null, sdk = null, current = null;

function setStatus(id, kind, text) { const el = $(id); el.className = "status" + (kind ? " " + kind : ""); el.textContent = text; el.classList.remove("hidden"); }
function show(id, on) { $(id).classList.toggle("hidden", !on); }
function fmt(t) { if (!t) return ""; const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleString("zh-TW", { hour12: false }); }
function cell(tr, text, cls) { const td = document.createElement("td"); td.textContent = text == null ? "" : String(text); if (cls) td.className = cls; tr.appendChild(td); return td; }

async function api(method, path, body, { raw = false } = {}) {
  const user = auth && auth.currentUser;
  if (!user) throw Object.assign(new Error("請先登入"), { kind: "NO_USER" });
  const headers = { accept: raw ? "text/csv" : "application/json", authorization: "Bearer " + (await user.getIdToken()) };
  if (body !== undefined) headers["content-type"] = "application/json";
  let res;
  try { res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" }); }
  catch { throw Object.assign(new Error("無法連到後端 Worker"), { kind: "NETWORK" }); }
  if (raw && res.ok) return res;
  let j = null; try { j = await res.json(); } catch { /* 非 JSON */ }
  if (res.ok && j && j.ok) return j.data;
  const code = j && j.error ? j.error.code : "HTTP_" + res.status;
  const msg = { FORBIDDEN: "這個 Google 帳號不是管理員", NOT_ADMIN: "這個 Google 帳號不是管理員", ADMIN_NOT_CONFIGURED: "伺服器尚未設定管理員名單", UNAUTHENTICATED: "登入已過期，請重新登入", CONFLICT: (j && j.error && j.error.message) || "狀態已改變，請重新整理" }[code];
  throw Object.assign(new Error(msg || (j && j.error && j.error.message) || "伺服器回應異常"), { code, status: res.status });
}

/* ---------- 成績 ---------- */
function query() {
  const p = new URLSearchParams();
  if ($("fGame").value) p.set("gameId", $("fGame").value);
  if ($("fStatus").value) p.set("status", $("fStatus").value);
  const pid = $("fPlayer").value.trim();
  if (pid) { if (!PID.test(pid)) throw new Error("playerId 格式不正確（p_ 加 20 碼）"); p.set("playerId", pid); }
  return p.toString();
}
async function search() {
  const tb = $("scoreTable").querySelector("tbody");
  tb.textContent = "";
  let q; try { q = query(); } catch (e) { setStatus("listStatus", "bad", e.message); return; }
  setStatus("listStatus", "", "查詢中…");
  try {
    const d = await api("GET", "/v1/admin/scores?" + q);
    if (!d.rows.length) { setStatus("listStatus", "", "沒有符合條件的成績"); return; }
    setStatus("listStatus", "ok", `共 ${d.rows.length} 筆`);
    d.rows.forEach((r) => {
      const tr = document.createElement("tr");
      cell(tr, fmt(r.receivedAt)); cell(tr, GAME[r.gameId] || r.gameId);
      const pc = cell(tr, ""); const pb = document.createElement("button"); pb.type = "button"; pb.className = "secondary"; pb.style.minHeight = "32px"; pb.style.padding = "2px 8px";
      pb.textContent = r.playerId; pb.title = "在玩家管理中心開啟"; pb.dataset.openPid = r.playerId; pb.addEventListener("click", () => openPlayerById(r.playerId)); pc.appendChild(pb);
      cell(tr, Number(r.score || 0).toLocaleString());
      const st = cell(tr, ""); const pill = document.createElement("span"); pill.className = "pill " + r.status; pill.textContent = STATUS[r.status] || r.status; st.appendChild(pill);
      cell(tr, (r.reasons || []).join("、"), "wrap");
      const td = cell(tr, ""); const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = "查看"; b.dataset.sid = r.submissionId;
      b.addEventListener("click", () => openDetail(r.submissionId)); td.appendChild(b);
      tb.appendChild(tr);
    });
    // 索引沒有異常原因：逐筆補上（只讀）
    d.rows.slice(0, 50).forEach(async (r, i) => {
      try { const f = await api("GET", "/v1/admin/scores/" + encodeURIComponent(r.submissionId)); tb.rows[i].cells[5].textContent = (f.reasons || []).join("、"); } catch { /* 略過 */ }
    });
  } catch (e) { setStatus("listStatus", "bad", e.message); }
}

async function openDetail(sid) {
  show("detailCard", true); show("reviewBox", false); $("reviewStatus").classList.add("hidden");
  $("dId").textContent = sid; $("dSummary").textContent = "讀取中…"; $("dData").textContent = "";
  try {
    const f = await api("GET", "/v1/admin/scores/" + encodeURIComponent(sid));
    current = f;
    $("dId").textContent = sid + "（" + (f.displayId || "") + "）";
    $("dSummary").textContent = `${GAME[f.gameId] || f.gameId}｜${f.displayId || ""}（${f.playerId}）｜分數 ${Number(f.primaryScore || 0).toLocaleString()}｜${STATUS[f.status] || f.status}｜遊玩日期 ${f.rewardDate}｜伺服器場次 ${Math.round((f.serverDurationMs || 0) / 1000)} 秒｜異常原因：${(f.reasons || []).join("、") || "無"}` +
      (f.review ? `｜已審核：${f.review.decision === "accept" ? "接受" : "拒絕"}（${fmt(f.review.at)}）` : "");
    $("dData").textContent = JSON.stringify({ scoreData: f.scoreData, gameVersion: f.gameVersion, applied: f.applied || null }, null, 2);
    show("reviewBox", f.status === "pending_review");
    $("rNote").value = "";
    $("detailCard").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { $("dSummary").textContent = "⚠️ " + e.message; }
}

async function review(decision) {
  if (!current) return;
  $("btnAccept").disabled = $("btnReject").disabled = true;
  setStatus("reviewStatus", "", "處理中…");
  try {
    const r = await api("POST", `/v1/admin/scores/${encodeURIComponent(current.submissionId)}/review`, { decision, note: $("rNote").value.trim() });
    const coins = (r.rewards || []).map((x) => (TYPE[x.type] || x.type)).join("、");
    setStatus("reviewStatus", "ok", r.replayed ? "這筆已經審核過（沒有重複處理）" : decision === "accept" ? `已接受：已列入排行榜${coins ? "，補發 " + coins + "（依原本遊玩日期）" : "（該日獎勵先前已領過）"}` : "已拒絕：不列入排行榜、不發 V幣");
    show("reviewBox", false);
    search(); loadAudits();
    if (sel.playerId && current && current.playerId === sel.playerId) { loadOverview(); loadPlayerScores(); loadPlayerLedger(); loadPlayerCollection(); loadPlayerAudits(); }
  } catch (e) { setStatus("reviewStatus", "bad", e.message); }
  $("btnAccept").disabled = $("btnReject").disabled = false;
}

/* ---------- V幣帳本 ---------- */
async function ledger() {
  const tb = $("ledgerTable").querySelector("tbody"); tb.textContent = "";
  const pid = $("wPlayer").value.trim();
  if (!PID.test(pid)) { setStatus("ledgerStatus", "bad", "playerId 格式不正確（p_ 加 20 碼）"); return; }
  setStatus("ledgerStatus", "", "查詢中…");
  try {
    const d = await api("GET", `/v1/admin/wallet/${encodeURIComponent(pid)}/ledger`);
    const sum = d.ledger.reduce((s, t) => s + t.amount, 0);
    setStatus("ledgerStatus", sum === d.balance ? "ok" : "bad", `餘額 ${d.balance}｜帳本 ${d.ledger.length} 筆，合計 ${sum}` + (sum === d.balance ? "（一致）" : "（不一致！請檢查）"));
    d.ledger.forEach((t) => { const tr = document.createElement("tr"); [fmt(t.createdAt), t.dateKey, TYPE[t.type] || t.type, GAME[t.gameId] || t.gameId, "+" + t.amount, t.balanceAfter, t.sourceSubmissionId, t.txId].forEach((v) => cell(tr, v)); tb.appendChild(tr); });
  } catch (e) { setStatus("ledgerStatus", "bad", e.message); }
}

async function loadAudits() {
  const tb = $("auditTable").querySelector("tbody"); tb.textContent = "";
  try {
    const d = await api("GET", "/v1/admin/audits");
    d.rows.forEach((a) => { const tr = document.createElement("tr"); [fmt(a.at), a.decision === "accept" ? "接受" : "拒絕", GAME[a.gameId] || a.gameId, a.playerId, a.score, a.submissionId, a.note].forEach((v, i) => cell(tr, v, i === 6 ? "wrap" : "")); tb.appendChild(tr); });
  } catch { /* 略過 */ }
}

/* ---------- v0.3.2 A. 玩家管理中心 ---------- */
const KIND = { title: "稱號", avatar: "頭像" };
const SRC = { score: "正式成績", backfill: "歷史補判定", admin: "管理員發放" };
const BOARD = { total: "總榜", main: "主榜", low: "低年級", middle: "中年級", high: "高年級" };
/** 目前選擇的玩家。token 每次選擇／清除都會 +1；非同步結果回來時 token 不同就丟棄（不會把 A 的資料畫到 B 身上） */
const sel = { playerId: null, token: 0, row: null, overview: null };
const live = (t) => t === sel.token && !!sel.playerId;
/** 同一位玩家的同一個分頁連續重新整理時，只畫最後一次的結果（避免兩次回應疊成重複列） */
const seqs = {}; const nextSeq = (k) => (seqs[k] = (seqs[k] || 0) + 1); const lastSeq = (k, n) => seqs[k] === n;
const enc = encodeURIComponent;
function tbody(id) { const tb = $(id).querySelector("tbody"); return tb; }
function clearBody(id) { tbody(id).textContent = ""; }

function setImg(img, src, fallback) {
  img.dataset.fallback = fallback || "";
  img.onerror = () => {   // 圖片失敗：改用身份頭像一次，再失敗就留空（記錄原因）
    console.warn("[管理後台] 頭像圖片載入失敗：", img.src);
    const fb = img.dataset.fallback; img.dataset.fallback = "";
    if (fb && fb !== img.src) img.src = fb; else { img.removeAttribute("src"); img.onerror = null; }
  };
  if (src) img.src = src; else img.removeAttribute("src");
}

async function playerSearch(exact) {
  const q = (exact ? $("pExact") : $("pQuery")).value.trim();
  const box = $("pResults"); box.textContent = "";
  if (!q) { setStatus("pSearchStatus", "bad", exact ? "請輸入完整 playerId" : "請輸入玩家 ID"); return; }
  if (exact && !PID.test(q)) { setStatus("pSearchStatus", "bad", "playerId 格式不正確（p_ 加 20 碼）"); return; }
  setStatus("pSearchStatus", "", "搜尋中…");
  try {
    const d = await api("GET", "/v1/admin/players/search?q=" + enc(q));
    if (!d.rows.length) { setStatus("pSearchStatus", "warn", `找不到「${q}」。請確認玩家 ID 的寫法（中文、英文大小寫、數字），或改用進階搜尋輸入完整 playerId。`); return; }
    const same = d.rows.filter((r) => r.displayId === d.rows[0].displayId).length;
    setStatus("pSearchStatus", "ok", `找到 ${d.total} 位玩家${d.truncated ? `（只顯示前 ${d.rows.length} 位，請輸入更完整的 ID）` : ""}` +
      (same > 1 ? `｜「${d.rows[0].displayId}」有 ${same} 位同名玩家（身份圖案不同＝不同玩家），請看頭像選擇正確的一位` : "") + (d.mode === "trial" ? "｜🧪 稱號與展示頭像為試營運資料" : ""));
    d.rows.forEach((r) => box.appendChild(resultCard(r)));
    if (d.rows.length === 1 && d.by === "playerId") selectPlayer(d.rows[0]);
  } catch (e) { setStatus("pSearchStatus", "bad", e.message); }
}

function resultCard(r) {
  const b = document.createElement("button"); b.type = "button"; b.className = "pcard"; b.dataset.pick = r.playerId;
  const i1 = document.createElement("img"); i1.className = "ava"; i1.alt = "身份頭像"; setImg(i1, r.baseAvatarImage);
  const i2 = document.createElement("img"); i2.className = "ava"; i2.alt = "展示頭像"; setImg(i2, r.displayAvatarImage, r.baseAvatarImage);
  const t = document.createElement("span"); t.className = "t";
  const n = document.createElement("b"); n.textContent = r.displayId;
  const s1 = document.createElement("small"); s1.textContent = `身份頭像 ${r.baseAvatarKey}｜展示 ${r.displayAvatarName || r.displayAvatarKey}`;
  const s2 = document.createElement("small"); s2.textContent = "稱號：" + (r.titleName || "未裝備");
  const s3 = document.createElement("small"); s3.textContent = r.playerId + (r.createdAt ? "｜建立 " + fmt(r.createdAt) : "");
  t.append(n, s1, s2, s3); b.append(i1, i2, t);
  b.classList.toggle("sel", r.playerId === sel.playerId);
  b.addEventListener("click", () => selectPlayer(r));
  return b;
}

/** 清掉「目前玩家」的所有畫面（切換玩家或清除選擇時先做，避免顯示上一位的資料） */
function resetPanel() {
  ["pBasicTable", "pBestTable", "pScoreTable", "pLedgerTable", "pCollTable", "pGrantTable", "pAuditTable"].forEach(clearBody);
  $("pSummary").querySelectorAll("[data-k]").forEach((el) => { el.textContent = "…"; });
  $("pCollEquipped").textContent = ""; $("pGNote").value = "";
  setImg($("pBaseImg"), ""); setImg($("pDispImg"), "");
  show("pTrialTag", false);
  ["pPanelStatus", "pScoreStatusMsg", "pLedgerStatus", "pCollStatus"].forEach((id) => setStatus(id, "", "讀取中…"));
  setStatus("pActStatus", "", "以下動作只會套用在上方「目前選擇的玩家」。");
  if (current && current.playerId !== sel.playerId) { current = null; show("detailCard", false); }
}

function selectPlayer(row) {
  sel.token++; sel.playerId = row.playerId; sel.row = row; sel.overview = null;
  document.querySelectorAll("#pResults .pcard").forEach((c) => c.classList.toggle("sel", c.dataset.pick === row.playerId));
  resetPanel();
  show("playerPanel", true);
  fillSummary(row);
  refreshPlayer();
  $("playerPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}
function clearPlayer() {
  sel.token++; sel.playerId = null; sel.row = null; sel.overview = null;
  resetPanel(); show("playerPanel", false);
  document.querySelectorAll("#pResults .pcard").forEach((c) => c.classList.remove("sel"));
  $("pQuery").focus();
}
function refreshPlayer() { loadOverview(); loadPlayerScores(); loadPlayerLedger(); loadPlayerCollection(); loadPlayerAudits(); }

function fillSummary(o) {
  const v = { displayId: o.displayId, titleName: o.titleName || "未裝備", displayAvatarName: o.displayAvatarName || o.displayAvatarKey, playerId: o.playerId,
    balance: o.wallet ? o.wallet.balance : "…", scoreCount: o.scores ? o.scores.total : "…", titleCount: o.collection ? o.collection.titles : "…", avatarCount: o.collection ? o.collection.avatars : "…" };
  $("pSummary").querySelectorAll("[data-k]").forEach((el) => { el.textContent = String(v[el.dataset.k] ?? ""); });
  setImg($("pBaseImg"), o.baseAvatarImage); setImg($("pDispImg"), o.displayAvatarImage, o.baseAvatarImage);
}

async function loadOverview() {
  const t = sel.token, pid = sel.playerId, n = nextSeq("overview");
  try {
    const o = await api("GET", `/v1/admin/players/${enc(pid)}/overview`);
    if (!live(t) || !lastSeq("overview", n)) return;
    sel.overview = o;
    fillSummary(o);
    show("pTrialTag", o.mode === "trial");
    setStatus("pPanelStatus", o.mode === "trial" ? "warn" : "ok", (o.mode === "trial" ? "🧪 試營運資料（資料位置 trial/）：" : "") + `已選擇「${o.displayId}」。下面所有分頁與管理操作都使用這位玩家，不需要再輸入 playerId。`);
    const tb = tbody("pBasicTable"); tb.textContent = "";
    [["玩家 ID", o.displayId], ["playerId", o.playerId], ["身份頭像（固定不變）", o.baseAvatarKey], ["目前展示頭像", `${o.displayAvatarName || ""}（${o.displayAvatarKey}）`],
      ["目前稱號", o.titleName || "未裝備"], ["建立時間", fmt(o.createdAt)], ["V幣餘額", `${o.wallet.balance}（${o.wallet.transactions} 筆交易）`],
      ["成績", `共 ${o.scores.total} 筆：已接受 ${o.scores.accepted}、待審核 ${o.scores.pending_review}、已拒絕 ${o.scores.rejected}`],
      ["各遊戲成績筆數", Object.entries(o.scores.byGame || {}).map(([g, n]) => `${GAME[g] || g} ${n}`).join("、") || "無"],
      ["收藏", `稱號 ${o.collection.titles} 個、展示頭像 ${o.collection.avatars} 個`], ["資料模式", o.mode === "trial" ? "🧪 試營運資料（trial/）" : o.mode === "on" ? "正式資料" : "正式寫入關閉"]]
      .forEach(([k, v]) => { const tr = document.createElement("tr"); const th = document.createElement("th"); th.textContent = k; tr.appendChild(th); cell(tr, v, "wrap"); tb.appendChild(tr); });
    const bt = tbody("pBestTable"); bt.textContent = "";
    if (!o.bests.length) { const tr = document.createElement("tr"); cell(tr, "還沒有已接受的正式成績").colSpan = 4; bt.appendChild(tr); }
    o.bests.forEach((b) => { const tr = document.createElement("tr"); [GAME[b.gameId] || b.gameId, BOARD[b.boardId] || b.boardId, Number(b.score || 0).toLocaleString(), fmt(b.achievedAt)].forEach((x) => cell(tr, x)); bt.appendChild(tr); });
  } catch (e) { if (live(t)) setStatus("pPanelStatus", "bad", "讀取玩家摘要失敗：" + e.message); }
}

function playerScoreQuery() {
  const p = new URLSearchParams({ playerId: sel.playerId });
  if ($("pScoreGame").value) p.set("gameId", $("pScoreGame").value);
  if ($("pScoreStatus").value) p.set("status", $("pScoreStatus").value);
  return p.toString();
}
async function loadPlayerScores() {
  const t = sel.token, n = nextSeq("scores"); if (!sel.playerId) return;
  setStatus("pScoreStatusMsg", "", "讀取中…");
  try {
    const d = await api("GET", "/v1/admin/scores?" + playerScoreQuery());
    if (!live(t) || !lastSeq("scores", n)) return;
    clearBody("pScoreTable");
    setStatus("pScoreStatusMsg", d.rows.length ? "ok" : "", d.rows.length ? `共 ${d.rows.length} 筆` : "沒有符合條件的成績");
    const tb = tbody("pScoreTable");
    d.rows.forEach((r) => {
      const tr = document.createElement("tr");
      cell(tr, fmt(r.receivedAt)); cell(tr, GAME[r.gameId] || r.gameId); cell(tr, Number(r.score || 0).toLocaleString());
      const st = cell(tr, ""); const pill = document.createElement("span"); pill.className = "pill " + r.status; pill.textContent = STATUS[r.status] || r.status; st.appendChild(pill);
      cell(tr, r.submissionId);
      const td = cell(tr, ""); const b = document.createElement("button"); b.type = "button"; b.className = "secondary"; b.textContent = "查看"; b.dataset.psid = r.submissionId;
      b.addEventListener("click", () => openDetail(r.submissionId)); td.appendChild(b);
      tb.appendChild(tr);
    });
  } catch (e) { if (live(t)) setStatus("pScoreStatusMsg", "bad", e.message); }
}

async function loadPlayerLedger() {
  const t = sel.token, pid = sel.playerId, n = nextSeq("ledger"); if (!pid) return;
  try {
    const d = await api("GET", `/v1/admin/wallet/${enc(pid)}/ledger`);
    if (!live(t) || !lastSeq("ledger", n)) return;
    clearBody("pLedgerTable");
    const sum = d.ledger.reduce((s, x) => s + x.amount, 0);
    setStatus("pLedgerStatus", sum === d.balance ? "ok" : "bad", (d.mode === "trial" ? "🧪 試營運 V幣｜" : "") + `餘額 ${d.balance}｜帳本 ${d.ledger.length} 筆，合計 ${sum}` + (sum === d.balance ? "（一致）" : "（不一致！請檢查）"));
    const tb = tbody("pLedgerTable");
    d.ledger.forEach((x) => { const tr = document.createElement("tr"); [fmt(x.createdAt), x.dateKey, TYPE[x.type] || x.type, GAME[x.gameId] || x.gameId, (x.amount > 0 ? "+" : "") + x.amount, x.balanceAfter, x.sourceSubmissionId, x.txId].forEach((v) => cell(tr, v)); tb.appendChild(tr); });
  } catch (e) { if (live(t)) setStatus("pLedgerStatus", "bad", e.message); }
}

async function loadPlayerCollection() {
  const t = sel.token, pid = sel.playerId, n = nextSeq("coll"); if (!pid) return;
  try {
    const c = await api("GET", `/v1/admin/collections/${enc(pid)}`);
    if (!live(t) || !lastSeq("coll", n) || c.playerId !== sel.playerId) return;
    clearBody("pCollTable"); clearBody("pGrantTable");
    setStatus("pCollStatus", "ok", (c.mode === "trial" ? "🧪 試營運資料｜" : "") + `稱號 ${c.titles.length} 個、展示頭像 ${c.avatars.length} 個`);
    $("pCollEquipped").textContent = `目前裝備：稱號「${c.equipped.titleName || "未裝備"}」｜展示頭像 ${c.equipped.displayAvatarKey}（身份頭像 ${c.equipped.baseAvatarKey}，固定不變）`;
    const tb = tbody("pCollTable");
    c.titles.forEach((x) => { const s0 = (c.sources.titles[x.titleKey] || {}).source || {}; const tr = document.createElement("tr"); [KIND.title, x.name, x.titleKey, GAME[x.gameId] || x.gameId, fmt(x.unlockedAt), (SRC[s0.type] || s0.type || "") + (s0.submissionId ? " " + s0.submissionId : "")].forEach((v) => cell(tr, v)); tb.appendChild(tr); });
    c.avatars.forEach((x) => { const s0 = (c.sources.avatars[x.avatarKey] || {}).source || {}; const tr = document.createElement("tr"); [KIND.avatar, x.name, x.avatarKey, "", fmt(x.unlockedAt), (SRC[s0.type] || s0.type || "") + (s0.submissionId ? " " + s0.submissionId : "") + (s0.note ? "｜" + s0.note : "")].forEach((v) => cell(tr, v)); tb.appendChild(tr); });
    const gb = tbody("pGrantTable");
    c.adminAvatars.forEach((x) => {
      const tr = document.createElement("tr");
      cell(tr, x.name); cell(tr, x.avatarKey); cell(tr, x.private ? "學生／私人" : ""); cell(tr, x.owned ? "已擁有" : "未擁有");
      const td = cell(tr, ""); const b = document.createElement("button"); b.type = "button"; b.className = x.owned ? "bad" : "ok"; b.textContent = x.owned ? "收回" : "發放";
      b.dataset.grant = x.avatarKey; b.dataset.action = x.owned ? "revoke" : "grant"; b.dataset.pid = pid;
      b.addEventListener("click", () => grantAvatar(pid, t, x.avatarKey, x.owned ? "revoke" : "grant")); td.appendChild(b);
      gb.appendChild(tr);
    });
  } catch (e) { if (live(t)) setStatus("pCollStatus", "bad", e.message); }
}

async function loadPlayerAudits() {
  const t = sel.token, pid = sel.playerId, n = nextSeq("audit"); if (!pid) return;
  try {
    const [a, c] = await Promise.all([api("GET", "/v1/admin/audits?playerId=" + enc(pid)), api("GET", "/v1/admin/collection-audits?playerId=" + enc(pid))]);
    if (!live(t) || !lastSeq("audit", n)) return;
    clearBody("pAuditTable");
    const rows = a.rows.filter((x) => x.playerId === pid).map((x) => ({ at: x.at, kind: "成績審核", text: `${x.decision === "accept" ? "接受" : "拒絕"}｜${GAME[x.gameId] || x.gameId} ${x.score}｜${x.submissionId}`, note: x.note }))
      .concat(c.rows.filter((x) => x.playerId === pid).map((x) => ({ at: x.at, kind: "頭像發放", text: `${x.action === "grant" ? "發放" : "收回"} ${x.avatarKey}`, note: x.note })))
      .sort((x, y) => new Date(y.at) - new Date(x.at));
    const tb = tbody("pAuditTable");
    if (!rows.length) { const tr = document.createElement("tr"); cell(tr, "這位玩家還沒有稽核紀錄").colSpan = 4; tb.appendChild(tr); }
    rows.forEach((r) => { const tr = document.createElement("tr"); [fmt(r.at), r.kind, r.text, r.note].forEach((v, i) => cell(tr, v, i >= 2 ? "wrap" : "")); tb.appendChild(tr); });
  } catch { /* 略過 */ }
}

/** 管理操作：送出前確認目標仍是「目前選擇的玩家」（畫面若已換人就取消，不會套用到前一位） */
function guard(pid, t) {
  if (pid !== sel.playerId || t !== sel.token) { setStatus("pActStatus", "bad", "目前選擇的玩家已經改變，這個動作已取消。請重新確認後再操作。"); return false; }
  return true;
}
async function grantAvatar(pid, t, avatarKey, action) {
  if (!guard(pid, t)) return;
  const who = sel.overview ? sel.overview.displayId : (sel.row && sel.row.displayId);
  setStatus("pActStatus", "", `處理中：${action === "grant" ? "發放" : "收回"} ${avatarKey} → ${who}…`);
  try {
    const r = await api("POST", `/v1/admin/collections/${enc(pid)}/avatars`, { avatarKey, action, note: $("pGNote").value.trim() });
    if (!live(t)) return;
    setStatus("pActStatus", "ok", r.changed ? `${action === "grant" ? "已發放" : "已收回"}：${avatarKey}（玩家「${who}」）` : "沒有變更（已經是這個狀態）");
    loadPlayerCollection(); loadOverview(); loadPlayerAudits(); loadCollAudits();
  } catch (e) { if (live(t)) setStatus("pActStatus", "bad", e.message); }
}
async function backfill() {
  const t = sel.token, pid = sel.playerId;
  if (!pid || !guard(pid, t)) return;
  setStatus("pActStatus", "", "補判定中…");
  try {
    let offset = 0, scanned = 0, titles = [], avatars = [], total = 0;
    for (let i = 0; i < 40; i++) {
      if (!guard(pid, t)) return;
      const r = await api("POST", `/v1/admin/collections/${enc(pid)}/backfill`, { offset });
      scanned += r.scanned; total = r.totalAccepted; titles = titles.concat(r.granted.titles); avatars = avatars.concat(r.granted.avatars);
      if (r.next == null) break;
      offset = r.next;
    }
    if (!live(t)) return;
    setStatus("pActStatus", "ok", `補判定完成：讀取已接受的正式成績 ${scanned}／${total} 筆，新增稱號 ${titles.length} 個、頭像 ${avatars.length} 個（已擁有的不會重複）`);
    loadPlayerCollection(); loadOverview();
  } catch (e) { if (live(t)) setStatus("pActStatus", "bad", e.message); }
}
function switchTab(name) {
  document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("hidden", p.id !== "tab-" + name));
}
/** 從全體成績紀錄的 playerId 直接開啟玩家管理中心 */
async function openPlayerById(pid) {
  try {
    const d = await api("GET", "/v1/admin/players/search?q=" + enc(pid));
    if (d.rows[0]) { $("pExact").value = pid; selectPlayer(d.rows[0]); }
  } catch (e) { setStatus("listStatus", "bad", e.message); }
}

/* ---------- 全體收藏發放紀錄 ---------- */
async function loadCollAudits() {
  const tb = tbody("collAuditTable"); tb.textContent = "";
  try {
    const d = await api("GET", "/v1/admin/collection-audits");
    d.rows.forEach((x) => { const tr = document.createElement("tr"); [fmt(x.at), x.action === "grant" ? "發放" : "收回", x.avatarKey, x.playerId, x.note].forEach((v, i) => cell(tr, v, i === 4 ? "wrap" : "")); tb.appendChild(tr); });
  } catch { /* 略過 */ }
}

/* ---------- v0.3.1 正式寫入狀態、真實資料庫自我檢查、試營運清除 ---------- */
const MODE = { off: "關閉", trial: "受控試營運", on: "全面開放" };
async function launchStatus() {
  try {
    const l = await api("GET", "/v1/admin/launch");
    setStatus("launchStatus", l.scoresMode === "on" ? "ok" : "warn", `正式成績：${MODE[l.scoresMode]}｜V幣：${MODE[l.rewardsMode]}｜試營運玩家 ${l.trialPlayers} 位｜資料位置 ${l.namespace}`);
    $("btnPurge").disabled = l.scoresMode === "on";
  } catch (e) { setStatus("launchStatus", "bad", e.message); }
}
async function selftest() {
  setStatus("launchStatus", "", "自我檢查中…");
  try {
    const r = await api("POST", "/v1/admin/selftest");
    $("selftestOut").textContent = r.steps.map((x) => `${x.ok ? "✅" : "❌"} ${x.name}（${x.ms} ms）${x.detail ? "：" + x.detail : ""}${x.error ? "：" + x.error : ""}`).join("\n");
    show("selftestOut", true);
    setStatus("launchStatus", r.ok ? "ok" : "bad", r.ok ? "真實資料庫自我檢查全部通過" : "真實資料庫自我檢查有項目失敗，請把結果截圖回報");
  } catch (e) { setStatus("launchStatus", "bad", "自我檢查失敗：" + e.message); }
}
async function purge() {
  const typed = window.prompt("清除試營運資料（trial/）。正式資料與玩家身份不受影響。\n請輸入 PURGE TRIAL 確認：");
  if (typed !== "PURGE TRIAL") { setStatus("launchStatus", "", "已取消"); return; }
  try { await api("POST", "/v1/admin/trial/purge", { confirm: "PURGE TRIAL" }); setStatus("launchStatus", "ok", "已清除 trial/"); }
  catch (e) { setStatus("launchStatus", "bad", e.message); }
}

/* ---------- CSV（帶管理員憑證下載；檔案只存在管理員自己的電腦） ---------- */
async function download(path, fallbackName, statusId) {
  try {
    const res = await api("GET", path, undefined, { raw: true });
    const blob = await res.blob();
    const name = ((res.headers.get("content-disposition") || "").match(/filename="([^"]+)"/) || [])[1] || fallbackName;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    setStatus(statusId, "ok", `已下載 ${name}`);
  } catch (e) { setStatus(statusId, "bad", "匯出失敗：" + e.message); }
}

/* ---------- 登入 ---------- */
async function onUser(user) {
  show("btnLogout", !!user); $("btnLogin").disabled = !!user || !auth;
  if (!user) { show("adminArea", false); clearPlayer(); setStatus("authStatus", "", "尚未登入"); return; }
  setStatus("authStatus", "", "Google 登入成功，正在向伺服器確認管理員身份…");
  try {
    const me = await api("GET", "/v1/admin/whoami");
    if (me.uid !== user.uid) throw new Error("伺服器回應不一致");
    setStatus("authStatus", "ok", "✅ 伺服器確認：你是遊戲宇宙管理員");
    show("adminArea", true);
    search(); loadAudits(); launchStatus(); loadCollAudits();
  } catch (e) { show("adminArea", false); setStatus("authStatus", "bad", "⛔ " + e.message); }
}

async function start() {
  $("btnSearch").addEventListener("click", search);
  $("btnAccept").addEventListener("click", () => review("accept"));
  $("btnReject").addEventListener("click", () => review("reject"));
  $("btnLedger").addEventListener("click", ledger);
  $("btnAudits").addEventListener("click", loadAudits);
  $("btnCsvScores").addEventListener("click", () => { let q = ""; try { q = query(); } catch (e) { setStatus("listStatus", "bad", e.message); return; } download("/v1/admin/exports/scores.csv?" + q, "scores.csv", "listStatus"); });
  $("btnCsvLedger").addEventListener("click", () => { const pid = $("wPlayer").value.trim(); if (pid && !PID.test(pid)) { setStatus("ledgerStatus", "bad", "playerId 格式不正確"); return; } download("/v1/admin/exports/ledger.csv" + (pid ? "?playerId=" + encodeURIComponent(pid) : ""), "ledger.csv", "ledgerStatus"); });
  $("btnCsvColl").addEventListener("click", () => download("/v1/admin/exports/collections.csv", "collections.csv", "collStatus"));   // 全體：不帶目前玩家
  $("btnCollAudits").addEventListener("click", loadCollAudits);
  // A. 玩家管理中心
  $("btnPSearch").addEventListener("click", () => playerSearch(false));
  $("pQuery").addEventListener("keydown", (e) => { if (e.key === "Enter") playerSearch(false); });
  $("btnPExact").addEventListener("click", () => playerSearch(true));
  $("pExact").addEventListener("keydown", (e) => { if (e.key === "Enter") playerSearch(true); });
  $("btnPClear").addEventListener("click", clearPlayer);
  document.querySelectorAll(".tabs [data-tab]").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("btnPScores").addEventListener("click", loadPlayerScores);
  $("pScoreGame").addEventListener("change", loadPlayerScores); $("pScoreStatus").addEventListener("change", loadPlayerScores);
  $("btnPLedger").addEventListener("click", loadPlayerLedger);
  $("btnPBackfill").addEventListener("click", backfill);
  $("btnPCsvScores").addEventListener("click", () => { if (sel.playerId) download("/v1/admin/exports/scores.csv?" + playerScoreQuery(), `scores-${sel.playerId}.csv`, "pScoreStatusMsg"); });
  $("btnPCsvLedger").addEventListener("click", () => { if (sel.playerId) download("/v1/admin/exports/ledger.csv?playerId=" + enc(sel.playerId), `ledger-${sel.playerId}.csv`, "pLedgerStatus"); });
  $("btnPCsvColl").addEventListener("click", () => { if (sel.playerId) download("/v1/admin/exports/collections.csv?playerId=" + enc(sel.playerId), `collections-${sel.playerId}.csv`, "pCollStatus"); });
  $("btnSelftest").addEventListener("click", selftest);
  $("btnPurge").addEventListener("click", purge);
  $("btnLogin").addEventListener("click", async () => {
    try { const p = new sdk.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" }); await sdk.signInWithPopup(auth, p); }
    catch (e) { setStatus("authStatus", "bad", "Google 登入沒有完成" + (e && e.code ? `（${e.code}）` : "")); }
  });
  $("btnLogout").addEventListener("click", () => sdk.signOut(auth).catch(() => {}));
  if (!FIREBASE_WEB_CONFIG || FIREBASE_WEB_CONFIG.projectId !== EXPECTED_PROJECT_ID) { setStatus("authStatus", "bad", "Firebase 網頁設定不是 balloon-v-universe 專案"); return; }
  try {
    const appMod = await import(`${SDK}/firebase-app.js`);
    sdk = await import(`${SDK}/firebase-auth.js`);
    auth = sdk.getAuth(appMod.initializeApp(FIREBASE_WEB_CONFIG, "universe-admin"));
    await sdk.setPersistence(auth, sdk.inMemoryPersistence);
    sdk.onAuthStateChanged(auth, onUser);
    $("btnLogin").disabled = false;
    setStatus("authStatus", "", "尚未登入");
  } catch { setStatus("authStatus", "bad", "無法載入 Google 登入元件（www.gstatic.com）"); }
}
start();

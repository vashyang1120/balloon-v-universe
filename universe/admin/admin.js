/*
 * 遊戲宇宙 成績管理（balloon-v-universe-v0.3.0-launch-integration-test-1）
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
      cell(tr, fmt(r.receivedAt)); cell(tr, GAME[r.gameId] || r.gameId); cell(tr, r.playerId); cell(tr, Number(r.score || 0).toLocaleString());
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
  if (!user) { show("adminArea", false); setStatus("authStatus", "", "尚未登入"); return; }
  setStatus("authStatus", "", "Google 登入成功，正在向伺服器確認管理員身份…");
  try {
    const me = await api("GET", "/v1/admin/whoami");
    if (me.uid !== user.uid) throw new Error("伺服器回應不一致");
    setStatus("authStatus", "ok", "✅ 伺服器確認：你是遊戲宇宙管理員");
    show("adminArea", true);
    search(); loadAudits();
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

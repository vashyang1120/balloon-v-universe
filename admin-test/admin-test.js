/*
 * 遊戲宇宙 管理員連線測試頁（universe-backend-v0.2.0-admin-auth-test-1）
 *
 * 安全原則：
 *  - Firebase ID Token 只在送出請求的當下向 Firebase SDK 取得，放進 Authorization 標頭；
 *    不顯示在畫面、不放網址、不存 localStorage / sessionStorage、不寫進錯誤訊息。
 *  - 登入狀態只存在記憶體（inMemoryPersistence），關閉或重新整理分頁就登出。
 *  - 「Google 登入成功」與「伺服器認定為管理員」分開顯示；管理員身份只看 Worker 的判斷。
 *  - 這個頁面是公開網址；所有受保護的動作都由 Worker 驗證後才執行。
 */
import { FIREBASE_WEB_CONFIG, API_BASE, EXPECTED_PROJECT_ID } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const $ = (id) => document.getElementById(id);

let auth = null;
let sdk = null;          // firebase-auth 模組
let isAdmin = false;
let currentUid = null;

/* ---------- 畫面工具 ---------- */
function setStatus(id, kind, title, detail) {
  const el = $(id);
  el.className = "status" + (kind ? " " + kind : "");
  el.textContent = "";
  const t = document.createElement("strong");
  t.textContent = title;
  el.appendChild(t);
  if (detail) {
    const d = document.createElement("small");
    d.textContent = detail;
    el.appendChild(d);
  }
}
function show(id, on) { $(id).classList.toggle("hidden", !on); }

/* ---------- 設定檢查（不猜測任何值） ---------- */
function checkConfig(c) {
  const problems = [];
  if (!c || typeof c !== "object") return ["找不到設定"];
  if (c.projectId !== EXPECTED_PROJECT_ID) problems.push(`projectId 必須是 ${EXPECTED_PROJECT_ID}`);
  if (c.projectId === "vparty-rhythm-game") problems.push("這是舊專案的設定，不能使用");
  if (typeof c.apiKey !== "string" || !/^AIza[0-9A-Za-z_-]{35}$/.test(c.apiKey)) problems.push("apiKey 尚未填入");
  if (typeof c.appId !== "string" || !/^1:\d+:web:[0-9a-f]+$/.test(c.appId)) problems.push("appId 尚未填入");
  if (c.authDomain !== `${EXPECTED_PROJECT_ID}.firebaseapp.com`) problems.push("authDomain 不正確");
  return problems;
}

/* ---------- 呼叫 Worker ---------- */
async function callApi(path, { withToken = false } = {}) {
  const headers = { accept: "application/json" };
  if (withToken) {
    const user = auth && auth.currentUser;
    if (!user) throw Object.assign(new Error("not signed in"), { kind: "NO_USER" });
    // Token 只存在這個區域變數裡，請求送出後就不再被引用
    headers.authorization = "Bearer " + (await user.getIdToken());
  }
  let res;
  try {
    res = await fetch(API_BASE + path, { method: "GET", headers, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    throw Object.assign(new Error("network"), { kind: "NETWORK" });
  }
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, body, requestId: res.headers.get("x-request-id") || (body && body.meta && body.meta.requestId) || "" };
}

/* ---------- 後端狀態（公開，不需登入） ---------- */
async function checkWorker() {
  try {
    const r = await callApi("/health");
    if (r.status === 200 && r.body && r.body.status === "ok") {
      setStatus("workerStatus", "ok", `後端 Worker 正常運作（版本 ${r.body.version}）`, "這只代表 Worker 本身正常，不代表 Firebase 已連線。");
    } else {
      setStatus("workerStatus", "bad", "後端 Worker 回應異常", `HTTP ${r.status}`);
    }
  } catch {
    setStatus("workerStatus", "bad", "無法連到後端 Worker", "請確認網路，或稍後再試。");
  }
}

/* ---------- 步驟 2：管理員權限 ---------- */
async function checkAdmin() {
  isAdmin = false;
  updateButtons();
  show("adminSetup", false);
  setStatus("adminStatus", "", "正在向伺服器確認…");
  let r;
  try {
    r = await callApi("/v1/admin/whoami", { withToken: true });
  } catch (e) {
    setStatus("adminStatus", "bad", e.kind === "NETWORK" ? "無法連到後端 Worker" : "請先登入");
    return;
  }
  const rid = r.requestId ? `（請求編號 ${r.requestId}）` : "";
  if (r.status === 200 && r.body && r.body.ok && r.body.data && r.body.data.uid === currentUid) {
    isAdmin = true;
    setStatus("adminStatus", "ok", "✅ 伺服器確認：你是遊戲宇宙管理員", "Worker 已驗證你的 Google 登入，且 UID 在管理員名單中。");
  } else if (r.body && r.body.error && r.body.error.code === "ORIGIN_NOT_ALLOWED") {
    setStatus("adminStatus", "bad", "⛔ 這個網址不被伺服器允許", "請從 https://vashyang1120.github.io 開啟本頁。" + rid);
  } else if (r.status === 503) {
    show("adminSetup", true);
    setStatus("adminStatus", "warn", "⚠ 伺服器尚未設定管理員名單（ADMIN_UIDS）", "Google 登入是成功的，但目前沒有任何人具有管理員權限。請依下方步驟把你的 UID 設定進去。" + rid);
  } else if (r.status === 403) {
    show("adminSetup", true);
    setStatus("adminStatus", "bad", "⛔ 不是管理員", "Google 登入有效，但這個 UID 不在伺服器的管理員名單中。" + rid);
  } else if (r.status === 401) {
    setStatus("adminStatus", "bad", "⛔ 伺服器不接受這次登入", "可能是登入已過期，或網頁設定的 Firebase 專案與伺服器不一致。請登出後重新登入。" + rid);
  } else {
    setStatus("adminStatus", "bad", "伺服器回應異常", `HTTP ${r.status}${rid}`);
  }
  updateButtons();
}

/* ---------- 步驟 3：Firebase 只讀診斷 ---------- */
const STAGE_TEXT = { config: "Worker 設定", token: "向 Google 取得授權", database: "讀取 Firebase 資料庫", unknown: "未知階段" };

async function runDiagnostics() {
  $("btnDiag").disabled = true;
  setStatus("diagStatus", "", "正在測試，請稍候…");
  let r;
  try {
    r = await callApi("/v1/admin/diagnostics/firebase", { withToken: true });
  } catch (e) {
    setStatus("diagStatus", "bad", e.kind === "NETWORK" ? "無法連到後端 Worker" : "請先登入");
    updateButtons();
    return;
  }
  const rid = r.requestId ? `請求編號 ${r.requestId}` : "";
  const d = r.body && r.body.ok ? r.body.data : null;
  if (r.status !== 200 || !d) {
    const code = r.body && r.body.error ? r.body.error.code : `HTTP ${r.status}`;
    setStatus("diagStatus", "bad", "❌ 無法執行測試", `伺服器拒絕：${code}。${rid}`);
  } else if (d.connected === true) {
    const empty = d.readResult === "null" ? "資料庫目前是空的（讀到 null），這是正常的。" : "資料庫已有資料（內容不會顯示）。";
    setStatus("diagStatus", "ok", "✅ Firebase 真實連線成功：Worker 已能讀取 Firebase", `${empty} 專案 ${d.projectId || ""}，耗時 ${d.latencyMs} 毫秒。${rid}`);
  } else if (d.configured === false) {
    setStatus("diagStatus", "bad", "❌ Worker 缺少 Firebase 設定", `缺少：${(d.missing || []).join("、")}。${rid}`);
  } else {
    const stage = STAGE_TEXT[d.stage] || STAGE_TEXT.unknown;
    const hint = d.hint || "請稍後再試。";
    const reason = d.reason || d.errorCode || "";
    setStatus("diagStatus", "bad", `❌ 連線失敗（卡在：${stage}）`, `${hint} 原因代碼：${reason}。${rid}`);
  }
  updateButtons();
}

/* ---------- 按鈕狀態 ---------- */
function updateButtons() {
  const signedIn = Boolean(auth && auth.currentUser);
  $("btnLogin").disabled = !auth || signedIn;
  show("btnLogout", signedIn);
  show("btnCopyUid", signedIn);
  $("btnCheckAdmin").disabled = !signedIn;
  $("btnDiag").disabled = !(signedIn && isAdmin);
  if (signedIn && !isAdmin) setStatus("diagStatus", "", "伺服器確認你是管理員後才能測試");
}

/* ---------- 登入狀態 ---------- */
function onUser(user) {
  isAdmin = false;
  currentUid = user ? user.uid : null;
  if (!user) {
    show("userInfo", false);
    show("adminSetup", false);
    setStatus("loginStatus", "", "尚未登入");
    setStatus("adminStatus", "", "登入後會自動向伺服器確認");
    setStatus("diagStatus", "", "伺服器確認你是管理員後才能測試");
    updateButtons();
    return;
  }
  const provider = (user.providerData && user.providerData[0] && user.providerData[0].providerId) || "";
  $("userEmail").textContent = user.email || "（未提供）";
  $("userProvider").textContent = provider === "google.com" ? "Google" : provider || "未知";
  $("userUid").textContent = user.uid;
  show("userInfo", true);
  setStatus("loginStatus", "ok", "Google 登入成功", "這代表 Firebase 已確認你的 Google 帳號，但「是不是管理員」要看步驟 2 伺服器的判斷。");
  updateButtons();
  checkAdmin();
}

async function login() {
  $("btnLogin").disabled = true;
  try {
    const provider = new sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await sdk.signInWithPopup(auth, provider);
  } catch (e) {
    const code = e && typeof e.code === "string" ? e.code : "";
    const msg = {
      "auth/popup-closed-by-user": "登入視窗被關閉了，請再試一次。",
      "auth/cancelled-popup-request": "登入視窗被關閉了，請再試一次。",
      "auth/popup-blocked": "瀏覽器擋住了登入視窗，請允許本網站開啟彈出視窗後再試。",
      "auth/unauthorized-domain": "這個網址尚未加入 Firebase 的授權網域（Authorized domains）。",
      "auth/operation-not-allowed": "Firebase 尚未啟用 Google 登入。",
      "auth/invalid-api-key": "Firebase 網頁設定的 apiKey 不正確。",
      "auth/network-request-failed": "網路連線失敗，請稍後再試。",
    }[code] || "登入失敗，請稍後再試。";
    setStatus("loginStatus", "bad", "Google 登入沒有完成", msg + (code ? `（${code}）` : ""));
  }
  updateButtons();
}

async function logout() {
  try { await sdk.signOut(auth); } catch { /* 忽略 */ }
}

async function copyUid() {
  if (!currentUid) return;
  try {
    await navigator.clipboard.writeText(currentUid);
    $("btnCopyUid").textContent = "已複製 UID";
    setTimeout(() => { $("btnCopyUid").textContent = "複製 UID"; }, 1800);
  } catch {
    $("btnCopyUid").textContent = "請手動選取 UID 複製";
  }
}

/* ---------- 啟動 ---------- */
async function start() {
  $("btnLogin").addEventListener("click", login);
  $("btnLogout").addEventListener("click", logout);
  $("btnCopyUid").addEventListener("click", copyUid);
  $("btnCheckAdmin").addEventListener("click", checkAdmin);
  $("btnDiag").addEventListener("click", runDiagnostics);

  checkWorker();

  const problems = checkConfig(FIREBASE_WEB_CONFIG);
  if (problems.length) {
    setStatus("configStatus", "warn", "⚠ Firebase 網頁設定尚未完成，暫時無法登入",
      problems.join("；") + "。請依 admin-test/README.md 在 Firebase 主控台註冊網頁應用程式，再填入 firebase-config.js。");
    updateButtons();
    return;
  }
  try {
    const appMod = await import(`${SDK}/firebase-app.js`);
    sdk = await import(`${SDK}/firebase-auth.js`);
    const app = appMod.initializeApp(FIREBASE_WEB_CONFIG, "universe-admin-test");
    auth = sdk.getAuth(app);
    await sdk.setPersistence(auth, sdk.inMemoryPersistence);
    sdk.onAuthStateChanged(auth, onUser);
    setStatus("configStatus", "ok", "Firebase 網頁設定已載入（專案 balloon-v-universe）");
  } catch {
    setStatus("configStatus", "bad", "無法載入 Firebase 登入元件", "請確認網路可以連到 www.gstatic.com，或稍後再試。");
  }
  updateButtons();
}

start();

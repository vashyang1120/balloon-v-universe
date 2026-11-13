// 測試用的「假 Firebase Realtime Database」：在記憶體中模擬 REST API 的 ETag 條件寫入語意，
// 並可以注入故障（網路錯誤、逾時、寫入後才逾時）與控制同時到達的請求順序。
// ⚠ 這是模擬，不是真實 Firebase；真實行為需在正式環境驗收。
import { DB_URL, jsonResponse } from "./helpers.js";
import { GOOGLE_TOKEN_URI } from "../src/services/google-oauth.js";

function etagOf(value) {
  if (value === null || value === undefined) return '"null_etag"';
  const s = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `"${h.toString(16)}-${s.length}"`;
}
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export function createFakeRtdb() {
  const root = {};
  const log = [];          // 每個資料庫請求：{ method, path }
  let faults = [];         // (req) => action | undefined
  let gate = null;         // { match, count, waiting: [] }

  function getAt(path) {
    let node = root;
    for (const k of path.split("/").filter(Boolean)) {
      if (node == null || typeof node !== "object" || !(k in node)) return null;
      node = node[k];
    }
    return clone(node);
  }
  function setAt(path, value) {
    const parts = path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] == null || typeof node[parts[i]] !== "object") node[parts[i]] = {};
      node = node[parts[i]];
    }
    if (value === null) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = clone(value);
  }

  async function handleDb(url, init) {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.replace(/\.json$/, "")).replace(/^\/+/, "");
    const method = init.method || "GET";
    const headers = init.headers || {};
    const req = { method, path, n: log.length };
    log.push(req);

    if (gate && gate.match(req)) {
      await new Promise((resolve) => {
        gate.waiting.push(resolve);
        if (gate.waiting.length >= gate.count) { const w = gate.waiting; gate = null; w.forEach((r) => r()); }
      });
    }

    let action;
    for (const f of faults) { action = f(req); if (action) break; }
    if (action?.throw === "network") throw new TypeError("fetch failed");
    if (action?.throw === "hang") {
      return new Promise((_, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    }
    if (action?.status) return new Response("{}", { status: action.status });

    let res;
    if (method === "GET") {
      const v = getAt(path);
      res = new Response(JSON.stringify(v), { status: 200, headers: headers["x-firebase-etag"] ? { etag: etagOf(v) } : {} });
    } else if (method === "PUT") {
      const ifMatch = headers["if-match"];
      if (ifMatch && ifMatch !== etagOf(getAt(path))) {
        res = new Response('{"error":"etag mismatch"}', { status: 412, headers: { etag: etagOf(getAt(path)) } });
      } else {
        setAt(path, JSON.parse(init.body));
        res = new Response(u.searchParams.get("print") === "silent" ? "" : init.body, { status: 200, headers: { etag: etagOf(getAt(path)) } });
      }
    } else if (method === "PATCH") {
      // Firebase PATCH：每個鍵（可以是 "a/b" 多層路徑）各自寫入；值為 null 代表刪除
      for (const [k, v] of Object.entries(JSON.parse(init.body))) setAt((path ? path + "/" : "") + k, v);
      res = new Response("", { status: 200 });
    } else if (method === "DELETE") {
      setAt(path, null);
      res = new Response("", { status: 200 });
    } else {
      res = new Response("", { status: 405 });
    }

    // 寫入「已經成功」但回應沒送回來（逾時或斷線）：最難處理的情況
    if (action?.afterCommit === "network") throw new TypeError("fetch failed after commit");
    if (action?.afterCommit === "hang") {
      return new Promise((_, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    }
    return res;
  }

  const fetchFn = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === GOOGLE_TOKEN_URI) return jsonResponse({ access_token: "ya" + "29.fake-rtdb-access-token-0000000000000000", expires_in: 3600 });
    if (url.startsWith(DB_URL)) return handleDb(url, init);
    throw new Error("unexpected outbound request: " + url.split("?")[0]);
  };

  return {
    fetch: fetchFn,
    root,
    log,
    get: getAt,
    set: setAt,
    /** 注入故障：fn(req) 回傳 { throw: "network"|"hang" } / { status } / { afterCommit: "network"|"hang" } */
    fault(fn) { faults.push(fn); return () => { faults = faults.filter((x) => x !== fn); }; },
    clearFaults() { faults = []; },
    /** 讓符合條件的前 count 個請求「同時」放行，用來製造並發競爭 */
    holdUntil(match, count) { gate = { match, count, waiting: [] }; },
    writes() { return log.filter((r) => r.method !== "GET"); },
  };
}

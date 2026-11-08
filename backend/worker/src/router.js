/**
 * 極簡路由器
 *
 * 路由定義：{ method, path, auth, handler, summary }
 *   method：GET / POST / PUT / PATCH / DELETE / "*"
 *   path  ：/v1/players/:playerId 這類寫法；結尾 /* 代表「這個前綴底下全部」
 *   auth  ：public（不需登入）、player（玩家，尚未開放）、admin（管理員）
 */
import { ApiError } from "./utils/errors.js";

export function compile(routes) {
  return routes.map((r) => {
    const wildcard = r.path.endsWith("/*");
    const segs = (wildcard ? r.path.slice(0, -2) : r.path).split("/").filter(Boolean);
    return { ...r, segs, wildcard };
  });
}

function matchPath(route, parts) {
  if (route.wildcard ? parts.length < route.segs.length : parts.length !== route.segs.length) return null;
  const params = {};
  for (let i = 0; i < route.segs.length; i++) {
    const s = route.segs[i];
    if (s.startsWith(":")) {
      try { params[s.slice(1)] = decodeURIComponent(parts[i]); } catch { return null; }
    } else if (s !== parts[i]) {
      return null;
    }
  }
  return params;
}

export function resolve(compiled, method, pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length > 16 || pathname.length > 512) throw new ApiError("NOT_FOUND");
  const allowed = new Set();
  for (const r of compiled) {
    const params = matchPath(r, parts);
    if (!params) continue;
    if (r.method === "*" || r.method === method || (method === "HEAD" && r.method === "GET")) return { route: r, params };
    allowed.add(r.method);
  }
  if (allowed.size) {
    throw new ApiError("METHOD_NOT_ALLOWED", { headers: { allow: [...allowed, "OPTIONS"].join(", ") } });
  }
  throw new ApiError("NOT_FOUND");
}

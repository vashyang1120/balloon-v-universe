/**
 * 讀取 JSON 請求內容：檢查 Content-Type、大小上限、JSON 格式。
 */
import { ApiError } from "../utils/errors.js";

export const MAX_BODY_BYTES = 32 * 1024;

export async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const type = request.headers.get("content-type") || "";
  if (!/^application\/json\b/i.test(type)) throw new ApiError("UNSUPPORTED_MEDIA_TYPE");

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ApiError("PAYLOAD_TOO_LARGE");

  const buf = await request.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new ApiError("PAYLOAD_TOO_LARGE");
  if (buf.byteLength === 0) throw new ApiError("BAD_REQUEST", { message: "請求內容是空的" });

  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new ApiError("BAD_REQUEST", { message: "JSON 格式不正確" });
  }
}

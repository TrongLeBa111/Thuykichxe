// Hash chứng từ: keccak256 trên JSON chuẩn hóa (giống evidence/hash.js). Máy chủ lưu bằng chứng làm ở bước sau;
// hiện chỉ tính hash để đưa lên chuỗi.
import { keccak256, toUtf8Bytes } from "ethers";

export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
export const hashDoc = (kind, data) => keccak256(toUtf8Bytes(canonical({ kind, ...data })));

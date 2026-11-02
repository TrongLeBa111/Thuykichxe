// Hash bằng chứng: keccak256 trên JSON đã chuẩn hóa (khóa sắp xếp, không khoảng trắng).
const { keccak256, toUtf8Bytes } = require("ethers");

function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
const hashEvidence = (obj) => keccak256(toUtf8Bytes(canonical(obj)));

module.exports = { canonical, hashEvidence };

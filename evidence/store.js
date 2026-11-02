// Kho bằng chứng ngoài chuỗi (SQLite). Chỉ hash được đưa lên chuỗi.
const path = require("path");
const Database = require("better-sqlite3");
const { canonical, hashEvidence } = require("./hash");

const db = new Database(process.env.EVIDENCE_DB || path.join(__dirname, "evidence.db"));
db.exec("CREATE TABLE IF NOT EXISTS evidence (hash TEXT PRIMARY KEY, body TEXT NOT NULL, created_at INTEGER NOT NULL)");

function put(obj) {
  const hash = hashEvidence(obj);
  db.prepare("INSERT OR IGNORE INTO evidence (hash, body, created_at) VALUES (?, ?, ?)")
    .run(hash, canonical(obj), Date.now());
  return hash;
}

// Trả về nội dung đang lưu VÀ hash tính lại từ nội dung đó.
function get(hash) {
  const row = db.prepare("SELECT body FROM evidence WHERE hash = ?").get(hash);
  if (!row) return null;
  const body = JSON.parse(row.body);
  const recomputed = hashEvidence(body);
  return { hash, body, recomputed, match: recomputed === hash };
}

module.exports = { put, get, db };

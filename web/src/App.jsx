import React, { useEffect, useRef, useState } from "react";
import { listAccounts } from "./chain.js";
import { accountLabel, roleName } from "./ui.jsx";
import { DEMO } from "./demo.js";
import Lookup from "./Lookup.jsx";
import Owner from "./Owner.jsx";
import Members from "./Members.jsx";

const NAV = [["lookup", "🔎 Tra cứu xe"], ["owner", "📝 Chủ xe khai báo"]];

function Popover({ id, label, title, open, setOpen, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  return (
    <div className="pop-wrap" ref={ref}>
      <button className={`iconbtn${open ? " on" : ""}`} aria-label={title} title={title} aria-expanded={!!open} onClick={() => setOpen(open ? null : id)}>{label}</button>
      {open && <div className={`pop${wide ? " wide" : ""}`} role="dialog" aria-label={title}>{children}</div>}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(() => (new URLSearchParams(location.search).get("vin") ? "lookup" : sessionStorage.getItem("tab") || "lookup"));
  const [accounts, setAccounts] = useState([]);
  const [idx, setIdx] = useState(() => Number(sessionStorage.getItem("acct") ?? 8));
  const [menu, setMenu] = useState(null); // "acct" | "demo" | null
  const [preset, setPreset] = useState(null);     // điền sẵn cho trang tra cứu
  const [ownerVin, setOwnerVin] = useState({ vin: "", n: 0 });
  const [err, setErr] = useState("");

  useEffect(() => {
    listAccounts().then(setAccounts).catch((e) => setErr("Không nối được hệ thống (" + (e.shortMessage || e.message) + ")"));
  }, [tab]);
  useEffect(() => { try { sessionStorage.setItem("tab", tab); } catch {} }, [tab]);
  useEffect(() => { try { sessionStorage.setItem("acct", idx); } catch {} }, [idx]);

  const reload = () => listAccounts().then(setAccounts).catch(() => {});
  useEffect(() => { if (menu === "acct") reload(); }, [menu]); // vai trò có thể vừa đổi
  const acct = accounts[idx];
  const isMember = acct && acct.role > 0;

  const go = (t) => { setTab(t); setMenu(null); window.scrollTo(0, 0); };
  const runDemo = (vin, t) => { setPreset({ vin, seal: t.seal, noSeal: t.noSeal, nonce: Date.now() }); go("lookup"); };
  const runOwner = (vin, o) => { setIdx(o.index); setOwnerVin({ vin, n: Date.now() }); go("owner"); };

  return (
    <>
      <header className="site-top">
        <div className="wrap">
          <a className="brand" href="/" onClick={(e) => { e.preventDefault(); history.replaceState(null, "", "/"); location.reload(); }}>
            <span className="logo" aria-hidden="true">💧</span>
            <span>Tra cứu thủy kích ô tô<small>Hồ sơ xác thực thông tin xe của bạn</small></span>
          </a>
          <div className="top-tools">
            <Popover id="demo" label="🧪" title="Dữ liệu minh họa để chạy thử" open={menu === "demo"} setOpen={setMenu} wide>
              <h3>Dữ liệu minh họa</h3>
              <p className="muted small-text">Các xe và số tem dưới đây chỉ để chạy thử hệ thống. Bấm một ca để tra cứu kèm số tem tương ứng. Muốn thử lại từ đầu, khởi động lại dữ liệu mẫu.</p>
              <ul className="demo-list">
                {DEMO.map((d) => (
                  <li key={d.vin}>
                    <div><b>{d.vin}</b> — {d.title}</div>
                    <div className="muted small-text">{d.about}</div>
                    <div className="demo-actions">
                      {d.tests.map((t) => (
                        <button key={t.label} className="chip-btn" onClick={() => runDemo(d.vin, t)} title={`Kỳ vọng: ${t.expect}`}>
                          {t.label}{t.seal ? ` · ${t.seal}` : ""}
                        </button>
                      ))}
                      {d.owner && <button className="chip-btn" onClick={() => runOwner(d.vin, d.owner)} title={`Kỳ vọng: ${d.owner.expect}`}>{d.owner.label}</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </Popover>

            <Popover id="acct" label={<>👤<span className="acct-tag">{acct ? `#${acct.index}` : ""}</span></>} title="Chọn tài khoản (mô phỏng ví)" open={menu === "acct"} setOpen={setMenu}>
              <h3>Tài khoản đang dùng</h3>
              <p className="muted small-text">Mô phỏng ví của từng bên. Chủ xe dùng trang khai báo; gara, bảo hiểm, đăng kiểm và hội đồng dùng khu vực thành viên.</p>
              <label>Chọn tài khoản
                <select aria-label="Tài khoản" value={idx} onChange={(e) => setIdx(+e.target.value)} disabled={!accounts.length}>
                  {accounts.map((a) => <option key={a.index} value={a.index}>{accountLabel(a)}</option>)}
                </select>
              </label>
              {acct && <p className="small-text">Vai trò: <b>{roleName[acct.role]}</b></p>}
              {err && <p className="error">{err}</p>}
              <div className="pop-actions">
                {isMember
                  ? <button onClick={() => go("members")}>Mở khu vực thành viên</button>
                  : <button onClick={() => go("owner")}>Mở trang chủ xe khai báo</button>}
              </div>
            </Popover>
          </div>
        </div>
      </header>

      <nav className="nav" aria-label="Điều hướng chính">
        <div className="wrap">
          {NAV.map(([k, t]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{t}</button>)}
          {tab === "members" && <button className="on">🔒 Khu vực thành viên</button>}
        </div>
      </nav>

      <main>
        {tab === "lookup" && <Lookup preset={preset} />}
        {tab === "owner" && acct && <Owner key={ownerVin.n + ":" + idx} acct={acct} accounts={accounts} presetVin={ownerVin.vin} />}
        {tab === "members" && acct && <Members acct={acct} accounts={accounts} onRolesChanged={reload} />}
        {tab !== "lookup" && !acct && !err && <div className="wrap"><p className="muted" style={{ margin: 24 }}>Đang tải…</p></div>}
        {tab !== "lookup" && err && <div className="wrap"><p className="error">{err}</p></div>}
      </main>

      <footer className="site-foot">
        <div className="wrap">
          <b>Hồ sơ xác thực thông tin xe của bạn</b>
          <span>Tra cứu lịch sử ngập nước và thủy kích ô tô theo số khung. Đề tài môn Blockchain — Lê Bá Trọng, Hoàng Thị Diệu Hiền, Đỗ Phúc Khang. Dữ liệu trong hệ thống là mô phỏng.</span>
          <span>Hệ thống không phán xử, không chẩn đoán tình trạng máy; “không có ghi nhận” không có nghĩa là xe chưa từng ngập.</span>
        </div>
      </footer>
    </>
  );
}

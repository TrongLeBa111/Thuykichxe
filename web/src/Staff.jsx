import React, { useEffect, useState } from "react";
import { reader, write, eventArg } from "./chain.js";
import { vinHashOf, sealHashOf, engineHashOf, loadHistory } from "./lookup.js";
import { hashDoc } from "./evidence.js";
import { ActionForm, toUnix, accountLabel } from "./ui.jsx";
import {
  ZERO, Kind, FLOOD_LABEL, CONCLUSION_LABEL, KIND_LABEL, LEVEL_LABEL, normalizeVin, isValidVin, VIN_RULE, explainError,
} from "@shared/status.mjs";
import info from "./contract.json";

const orgName = (addr) => info.orgs?.[addr] ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`;
const NOTE = { name: "note", label: "Ghi chú (tùy chọn)", optional: true };
const FILE = { name: "file", label: "Ảnh / biên bản đính kèm (tùy chọn)", type: "file", optional: true };
const day = (ts) => new Date(ts * 1000).toLocaleDateString("vi-VN");

/**
 * Khu làm việc của đơn vị xác nhận: nhập số khung MỘT lần, hệ thống đọc hồ sơ và chỉ đưa ra những việc
 * hợp lệ với tình trạng xe. Mọi biểu mẫu dùng lại số khung đã mở, không phải nhập lại.
 */
export default function Staff({ acct, accounts }) {
  const a = acct.index;
  const [vinInput, setVinInput] = useState(() => { try { return sessionStorage.getItem("ws-vin") || ""; } catch { return ""; } });
  const [cur, setCur] = useState(null);     // { vin, data }
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState(null);
  const [done, setDone] = useState("");
  const [pending, setPending] = useState([]); // đính chính đang chờ tôi ký

  const owners = accounts.map((x) => [x.address, accountLabel(x)]);

  async function open(q) {
    const vin = normalizeVin(q);
    setErr(""); setDone(""); setTask(null);
    if (!isValidVin(vin)) { setCur(null); setErr(VIN_RULE); return; }
    setBusy(true);
    try {
      const data = await loadHistory(reader, vin);
      setCur({ vin, data });
      try { sessionStorage.setItem("ws-vin", vin); } catch {}
      setVinInput(vin);
    } catch (e) { setErr(explainError(e)); }
    setBusy(false);
  }
  const reload = async () => { if (cur) setCur({ vin: cur.vin, data: await loadHistory(reader, cur.vin) }); await loadPending(); };

  async function loadPending() {
    const list = [];
    for (let i = 0; i < 60; i++) {
      let p;
      try { p = await reader.amends(i); } catch { break; }
      if (!p.done && p.proposer.toLowerCase() !== acct.address.toLowerCase()) {
        list.push({ id: i, vinHash: p.vinHash, index: Number(p.index), proposer: p.proposer });
      }
    }
    setPending(list);
  }
  useEffect(() => { loadPending(); if (vinInput && isValidVin(vinInput)) open(vinInput); }, [a]);

  // Gói một thao tác ghi: chạy, đọc lại hồ sơ, đóng biểu mẫu, hiện thông báo.
  const act = (fn) => async (v) => {
    const msg = await fn(v);
    await reload();
    setTask(null); setDone(msg);
    return msg;
  };
  const doc = (kind, v, extra = {}) => hashDoc(kind, { vin: cur.vin, note: v.note ?? "", file: v.file?.hash ?? null, ...extra });
  const send = (method, args) => write(a, method, args);
  const key = () => vinHashOf(cur.vin);

  async function cosign(id) {
    setDone(""); setErr("");
    try { await write(a, "coSignAmend", [id]); await reload(); setDone("Đã ký đính chính; sự kiện được đánh dấu đã đính chính."); }
    catch (e) { setErr(explainError(e)); }
  }

  const v = cur?.data.vehicle;
  const records = cur?.data.records ?? [];
  const exists = !!v?.exists;
  const isOwner = exists && v.owner.toLowerCase() === acct.address.toLowerCase();
  const ownerAcct = exists && accounts.find((x) => x.address.toLowerCase() === v.owner.toLowerCase());
  const lastIdx = (kind) => { for (let i = records.length - 1; i >= 0; i--) if (records[i].kind === kind) return i; return -1; };
  const needsRepair = exists && v.flood && lastIdx(Kind.Repair) < Math.max(lastIdx(Kind.Flood), lastIdx(Kind.Inspection));
  const mine = records.map((r, i) => [r, i]).filter(([r, i]) => r.actor.toLowerCase() === acct.address.toLowerCase() && r.kind !== Kind.Amendment && !cur.data.amended.includes(i));

  const tiles = !exists ? [] : [
    { k: "inspect", icon: "🔍", t: "Kiểm tra xe", s: "Đăng kiểm, kiểm tra xe cũ, sau khai báo của chủ xe", hot: v.openRequest > 0 },
    { k: "flood", icon: "🌊", t: "Ghi nhận ngập", s: "Theo hồ sơ giám định / bồi thường" },
    v.flood && { k: "repair", icon: "🛠️", t: "Sửa xong", s: "Kèm tem mới nếu đã dán", hot: needsRepair },
    { k: "seal", icon: "🏷️", t: "Thay tem", s: "Bảo dưỡng, sửa chữa, mở máy" },
    { k: "engine", icon: "⚙️", t: "Thay động cơ", s: "Ghi số máy mới" },
    !v.totalLoss && { k: "loss", icon: "⛔", t: "Tổn thất toàn bộ", s: "Theo quyết định bồi thường" },
    isOwner && { k: "transfer", icon: "🔁", t: "Chuyển chủ", s: "Bán, thanh lý, giao xe kèm bảo hành" },
    mine.length > 0 && { k: "amend", icon: "✏️", t: "Đính chính", s: "Sự kiện do đơn vị bạn ghi; cần thành viên khác ký" },
  ].filter(Boolean);

  const forms = !exists ? null : {
    inspect: (
      <ActionForm key="inspect" title="Kiểm tra xe"
        hint={v.openRequest > 0 ? `Chủ xe đang chờ kiểm tra (${LEVEL_LABEL[v.openRequest]}). Chọn một kết luận để đóng yêu cầu.` : "Chỉ cần ghi số km nếu chỉ đọc số liệu; chọn kết luận khi đã đánh giá xe."}
        fields={[
          { name: "km", label: "Số km", type: "number", def: "" },
          { name: "seenMode", label: "Tem trên máy", type: "select", options: [["has", "Còn tem — nhập số"], ["none", "Không thấy tem"]] },
          { name: "seen", label: "Số tem đọc được", placeholder: "Số in trên tem", when: (f) => f.seenMode === "has" },
          { name: "c", label: "Kết luận về ngập", type: "select", options: CONCLUSION_LABEL.map((t, i) => [i, t]), def: 0 },
          { name: "reseal", label: "Đã dán tem mới", type: "check" },
          { name: "newSeal", label: "Số tem mới", placeholder: "Số in trên tem mới", when: (f) => f.reseal },
          FILE, NOTE,
        ]}
        run={act(async (f) => {
          const seen = f.seenMode === "has" ? sealHashOf(f.seen) : ZERO;
          const newSeal = f.reseal ? sealHashOf(f.newSeal) : ZERO;
          await send("inspect", [key(), +f.km, seen, +f.c, newSeal, doc("inspection", f, { km: +f.km, seen: f.seen ?? "", c: +f.c, newSeal: f.newSeal ?? "" })]);
          return +f.c === 0 ? "Đã ghi kiểm tra." : `Đã ghi kết luận: ${CONCLUSION_LABEL[+f.c]}.`;
        })} />
    ),
    flood: (
      <ActionForm key="flood" title="Ghi nhận ngập / thủy kích" hint="Bật cờ một chiều; không có cách tắt."
        fields={[{ name: "type", label: "Loại", type: "select", options: FLOOD_LABEL.map((t, i) => [i, t]) },
          { name: "when", label: "Thời điểm xảy ra", type: "datetime" }, FILE, NOTE]}
        run={act(async (f) => { await send("reportFlood", [key(), +f.type, toUnix(f.when), doc("flood-report", f, { type: +f.type })]); return "Đã ghi nhận ngập."; })} />
    ),
    repair: (
      <ActionForm key="repair" title="Sửa xong" hint="Cờ ngập giữ nguyên. Nếu đã dán tem mới, nhập số tem."
        fields={[{ name: "reseal", label: "Đã dán tem mới", type: "check", def: true },
          { name: "newSeal", label: "Số tem mới", placeholder: "Số in trên tem mới", when: (f) => f.reseal }, FILE, NOTE]}
        run={act(async (f) => { await send("repairCompleted", [key(), f.reseal ? sealHashOf(f.newSeal) : ZERO, doc("repair", f, { newSeal: f.newSeal ?? "" })]); return "Đã ghi sửa xong."; })} />
    ),
    seal: (
      <ActionForm key="seal" title="Thay tem" hint="Tem cũ được thay bằng tem mới; mỗi số tem chỉ dùng một lần."
        fields={[{ name: "reason", label: "Lý do", type: "select", options: ["bảo dưỡng định kỳ", "sửa không liên quan ngập", "sửa do ngập / thủy kích", "thay động cơ"].map((t, i) => [i, t]) },
          { name: "newSeal", label: "Số tem mới", placeholder: "Số in trên tem mới" }, FILE, NOTE]}
        run={act(async (f) => { await send("changeSeal", [key(), sealHashOf(f.newSeal), +f.reason, doc("seal-change", f, { newSeal: f.newSeal, reason: +f.reason })]); return "Đã ghi thay tem."; })} />
    ),
    engine: (
      <ActionForm key="engine" title="Thay động cơ" hint="Chỉ hash của số máy được lưu; cờ ngập/thủy kích không đổi."
        fields={[{ name: "engine", label: "Số máy mới", placeholder: "Số in trên động cơ" }, FILE, NOTE]}
        run={act(async (f) => { await send("changeEngine", [key(), engineHashOf(f.engine), doc("engine-change", f, { engine: f.engine })]); return "Đã ghi thay động cơ."; })} />
    ),
    loss: (
      <ActionForm key="loss" title="Tổn thất toàn bộ" hint="Cờ nặng nhất, không tắt được; đi theo xe qua các lần chuyển chủ."
        fields={[FILE, NOTE]}
        run={act(async (f) => { await send("declareTotalLoss", [key(), doc("total-loss", f)]); return "Đã ghi tổn thất toàn bộ."; })} />
    ),
    transfer: (
      <ActionForm key="transfer" title="Chuyển chủ" hint="Bạn đang đứng tên xe này. Cờ cảnh báo đi theo xe, không đổi theo chủ."
        fields={[{ name: "to", label: "Chủ mới", type: "select", options: owners.filter(([ad]) => ad.toLowerCase() !== acct.address.toLowerCase()) },
          { name: "days", label: "Bảo hành (ngày, 0 = không)", type: "number", def: 0 }, FILE, NOTE]}
        run={act(async (f) => { await send("transfer", [key(), f.to, +f.days, doc("transfer", f, { to: f.to, days: +f.days })]); return "Đã chuyển chủ."; })} />
    ),
    amend: (
      <ActionForm key="amend" title="Đề xuất đính chính" hint="Sự kiện cũ vẫn còn trong lịch sử, chỉ được đánh dấu. Cần một thành viên khác ký."
        fields={[{ name: "index", label: "Sự kiện cần đính chính", type: "select", options: mine.map(([r, i]) => [i, `Số ${i + 1} · ${KIND_LABEL[r.kind]} · ${day(r.recordedAt)}`]) }, FILE, NOTE]}
        run={act(async (f) => {
          const r = await send("proposeAmend", [key(), +f.index, doc("amendment", f, { index: +f.index })]);
          return `Đã đề xuất đính chính (mã ${eventArg(r, "AmendProposed", "id")}). Một thành viên khác sẽ thấy việc này ở mục “Chờ bạn ký”.`;
        })} />
    ),
  };

  return (
    <section className="block">
      <h2 className="title">Hồ sơ xe</h2>
      <form className="inline" onSubmit={(e) => { e.preventDefault(); open(vinInput); }}>
        <label className="grow">Số khung (VIN) — nhập một lần, các việc bên dưới dùng lại
          <input aria-label="Số khung đang xử lý" value={vinInput} onChange={(e) => setVinInput(e.target.value)} placeholder="17 ký tự, ví dụ RLXDEMB0000000ABC" />
        </label>
        <button disabled={busy || !vinInput.trim()}>{busy ? "Đang mở…" : "Mở hồ sơ"}</button>
      </form>
      {err && <p className="bad-text" role="alert">{err}</p>}
      {done && <p className="ok-text" role="status">✔ {done}</p>}

      {pending.length > 0 && (
        <div className="card pending">
          <h3>Chờ bạn ký ({pending.length})</h3>
          <ul className="plain">
            {pending.map((p) => (
              <li key={p.id}>
                Đính chính sự kiện số {p.index + 1} · xe {p.vinHash.slice(0, 10)}… · đề xuất bởi {orgName(p.proposer)}
                <button className="small" onClick={() => cosign(p.id)}>Ký</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cur && !exists && (
        <ActionForm key={"reg" + cur.vin} title={`Xe ${cur.vin} chưa có hồ sơ — đăng ký xe`}
          hint="Chỉ đơn vị xác nhận mới đăng ký xe. Số tem và số máy có thể bổ sung sau."
          fields={[{ name: "owner", label: "Chủ xe", type: "select", options: owners },
            { name: "seal", label: "Số tem (nếu đã dán)", optional: true, placeholder: "Số in trên tem" },
            { name: "engine", label: "Số máy (nếu có)", optional: true, placeholder: "Số in trên động cơ" }, FILE, NOTE]}
          run={act(async (f) => {
            await send("registerVehicle", [key(), f.owner, f.seal?.trim() ? sealHashOf(f.seal) : ZERO, f.engine?.trim() ? engineHashOf(f.engine) : ZERO,
              doc("registration", f, { seal: f.seal ?? "", engine: f.engine ?? "" })]);
            return "Đã đăng ký xe.";
          })} />
      )}

      {cur && exists && (
        <>
          <div className="card vsum">
            <h3>{cur.vin}</h3>
            <p className="muted">Chủ xe: {ownerAcct ? accountLabel(ownerAcct) : v.owner} · {records.length} sự kiện</p>
            <p className="flags">
              {v.hydrolock && <span className="chip bad">Thủy kích</span>}
              {v.flood && !v.hydrolock && <span className="chip warn">Ngập</span>}
              {v.totalLoss && <span className="chip bad">Tổn thất toàn bộ</span>}
              {v.unrecordedOpening && <span className="chip warn">Mở máy ngoài hệ thống</span>}
              {!v.flood && !v.totalLoss && !v.unrecordedOpening && <span className="chip done">Chưa có cờ cảnh báo</span>}
            </p>
            {v.openRequest > 0 && <p className="warn-text">⚠ Chủ xe đã khai báo ngập ({LEVEL_LABEL[v.openRequest]}) và đang chờ kiểm tra.</p>}
          </div>

          <div className="tiles" role="group" aria-label="Việc có thể làm với xe này">
            {tiles.map((t) => (
              <button key={t.k} className={`tile${task === t.k ? " on" : ""}${t.hot ? " hot" : ""}`} onClick={() => { setDone(""); setTask(task === t.k ? null : t.k); }}>
                <span className="ti" aria-hidden="true">{t.icon}</span>
                <b>{t.t}</b>
                <small>{t.s}</small>
              </button>
            ))}
          </div>
          {task && forms[task]}
        </>
      )}
    </section>
  );
}

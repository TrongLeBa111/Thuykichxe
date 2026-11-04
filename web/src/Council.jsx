import React, { useEffect, useState } from "react";
import { reader, write, eventArg } from "./chain.js";
import { ActionForm, accountLabel, roleName } from "./ui.jsx";
import { explainError } from "@shared/status.mjs";

const ACTIONS = ["Cấp quyền", "Thu hồi quyền", "Đổi ngưỡng"];

export default function Council({ acct, accounts, onRolesChanged }) {
  const [props, setProps] = useState([]);
  const [size, setSize] = useState(0);
  const [msg, setMsg] = useState("");
  const [th, setTh] = useState(null);
  const a = acct.index;
  const who = (addr) => { const x = accounts.find((y) => y.address === addr); return x ? accountLabel(x) : addr; };

  async function refresh() {
    const n = Number(await reader.proposalCount());
    const list = [];
    for (let i = n - 1; i >= Math.max(0, n - 12); i--) {
      const p = await reader.proposals(i); // Result của ethers: đọc theo tên, không spread
      list.push({ id: i, action: p.action, target: p.target, role: p.role, a: p.a, b: p.b, approvals: p.approvals, executed: p.executed });
    }
    onRolesChanged?.();
    setProps(list); setSize(Number(await reader.councilSize()));
    setTh([Number(await reader.depthThreshold()), Number(await reader.soakThreshold())]);
  }
  useEffect(() => { refresh(); }, [accounts]);

  const needed = Math.ceil((size * 2) / 3);
  const addrOptions = accounts.map((x) => [x.address, accountLabel(x)]);
  const act = (fn) => async (v) => { const r = await fn(v); await refresh(); return r; };

  async function approve(id) {
    setMsg("");
    try { await write(a, "approveProposal", [id]); await refresh(); setMsg(`Đã bỏ phiếu cho đề xuất #${id}.`); }
    catch (e) { setMsg("✘ " + explainError(e)); }
  }

  return (
    <section className="block">
      <h2 className="title">Hội đồng</h2>
      <p className="muted">Hội đồng có {size} thành viên; mọi quyết định cần ≥ 2/3 = <b>{needed}</b> phiếu. Ngưỡng hiện tại: ngập ≥ {th?.[0]} cm, ngâm ≥ {th?.[1]} phút.{acct.role !== 1 ? " Chỉ thành viên hội đồng (#0–#3) mới đề xuất và bỏ phiếu được." : ""}</p>

      <section className="card">
        <h3>Đề xuất gần đây</h3>
        {msg && <p role="status">{msg}</p>}
        {props.length === 0 && <p className="muted">Chưa có đề xuất.</p>}
        <ul className="plain">
          {props.map((p) => (
            <li key={p.id}>
              <b>#{p.id}</b> {ACTIONS[Number(p.action)]}
              {Number(p.action) === 2 ? ` ${p.a} cm / ${p.b} phút` : ` ${who(p.target)}${Number(p.action) === 0 ? " → " + roleName[Number(p.role)] : ""}`}
              {" · "}{Number(p.approvals)}/{needed} phiếu
              {p.executed ? <span className="chip done"> đã thực hiện</span> : <button className="small" onClick={() => approve(p.id)}>Bỏ phiếu thuận</button>}
            </li>
          ))}
        </ul>
      </section>

      {acct.role === 1 && (<>
      <ActionForm title="Đề xuất cấp quyền ghi" fields={[
        { name: "who", label: "Tài khoản", type: "select", options: addrOptions },
        { name: "role", label: "Vai trò", type: "select", options: [[2, "Đơn vị xác nhận"], [1, "Hội đồng"]] }]}
        submit="Đề xuất" run={act(async (v) => { const r = await write(a, "proposeAddMember", [v.who, +v.role]); return `Đã đề xuất #${eventArg(r, "ProposalCreated", "id")} (bạn đã tính 1 phiếu).`; })} />

      <ActionForm title="Đề xuất thu hồi quyền" fields={[{ name: "who", label: "Tài khoản", type: "select", options: addrOptions }]}
        submit="Đề xuất" run={act(async (v) => { const r = await write(a, "proposeRevokeMember", [v.who]); return `Đã đề xuất #${eventArg(r, "ProposalCreated", "id")}.`; })} />

      <ActionForm title="Đề xuất đổi ngưỡng" fields={[
        { name: "d", label: "Độ ngập (cm)", type: "number", def: 30 }, { name: "s", label: "Thời gian ngâm (phút)", type: "number", def: 30 }]}
        submit="Đề xuất" run={act(async (v) => { const r = await write(a, "proposeThresholds", [+v.d, +v.s]); return `Đã đề xuất #${eventArg(r, "ProposalCreated", "id")}.`; })} />

      </>)}
    </section>
  );
}

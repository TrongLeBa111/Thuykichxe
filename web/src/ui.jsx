import React, { useState } from "react";
import { keccak256 } from "ethers";
import { explainError } from "@shared/status.mjs";

/** Đọc tệp (ảnh, biên bản) và trả { name, hash }: chỉ hash đi lên chuỗi, tệp ở lại máy/máy chủ bằng chứng. */
export async function hashFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  return { name: file.name, size: file.size, hash: keccak256(buf) };
}

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const roleName = ["Chủ xe / không có vai trò", "Hội đồng", "Đơn vị xác nhận"];
export const accountLabel = (a) => `#${a.index} · ${roleName[a.role]} · ${short(a.address)}`;

/**
 * Form một thao tác ghi. fields: [{name,label,type,options,def,optional,placeholder}]
 * when(values) → false thì ẩn trường (và không bắt buộc).
 * type: text | number | select | check | datetime | area | file (giá trị: { name, size, hash } hoặc "")
 * run(values) → chuỗi kết quả (hoặc ném lỗi; lỗi revert được dịch sang tiếng Việt).
 */
export function ActionForm({ title, hint, fields, run, submit = "Ghi lên chuỗi" }) {
  const init = () => Object.fromEntries(fields.map((f) => [f.name, f.def ?? (f.type === "check" ? false : f.type === "datetime" ? nowLocal() : f.options?.[0]?.[0] ?? "")]));
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const set = (k, val) => setV((o) => ({ ...o, [k]: val }));

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true); setRes(null);
    try { setRes({ ok: true, msg: await run(v) }); }
    catch (err) { setRes({ ok: false, msg: explainError(err) }); }
    setBusy(false);
  }
  const missing = fields.some((f) => !(f.when && !f.when(v)) && !f.optional && f.type !== "check" && f.type !== "file" && String(v[f.name]).trim() === "");

  return (
    <form className={"action" + (title ? " card" : " bare")} onSubmit={onSubmit}>
      {title && <h3>{title}</h3>}
      {hint && <p className="muted">{hint}</p>}
      <div className="fields">
        {fields.map((f) => (f.when && !f.when(v) ? null : (
          <label key={f.name} className={f.type === "check" ? "check" : ""}>
            {f.type === "check" ? <><input type="checkbox" checked={v[f.name]} onChange={(e) => set(f.name, e.target.checked)} /> {f.label}</> : f.label}
            {f.type === "select" && (
              <select value={v[f.name]} onChange={(e) => set(f.name, e.target.value)}>
                {f.options.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
              </select>
            )}
            {f.type === "file" && (
              <input type="file" accept="image/*,application/pdf" onChange={async (e) => set(f.name, e.target.files[0] ? await hashFile(e.target.files[0]) : "")} />
            )}
            {f.type === "area" && <textarea rows={4} value={v[f.name]} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />}
            {f.type === "datetime" && <input type="datetime-local" value={v[f.name]} onChange={(e) => set(f.name, e.target.value)} />}
            {(f.type === "text" || f.type === "number" || !f.type) && (
              <input type={f.type === "number" ? "number" : "text"} min={f.type === "number" ? 0 : undefined} value={v[f.name]}
                placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />
            )}
          </label>
        )))}
      </div>
      <button disabled={busy || missing}>{busy ? "Đang ghi…" : submit}</button>
      {res && <p className={res.ok ? "ok-text" : "bad-text"} role="status">{res.ok ? "✔ " : "✘ "}{res.msg}</p>}
    </form>
  );
}

export function nowLocal() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
export const toUnix = (local) => Math.floor(new Date(local).getTime() / 1000);

import React, { useState } from "react";
import { reader, write } from "./chain.js";
import { vinHashOf, loadHistory } from "./lookup.js";
import { hashDoc } from "./evidence.js";
import { ActionForm, toUnix, accountLabel } from "./ui.jsx";
import { computeStatus, LEVEL_LABEL, LEVEL_ADVICE } from "@shared/status.mjs";

const day = (ts) => new Date(ts * 1000).toLocaleDateString("vi-VN");

export default function Owner({ acct, presetVin = "" }) {
  const [vin, setVin] = useState(presetVin);
  const [found, setFound] = useState(null); // { vin, data, status, warranty }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function check(e) {
    e.preventDefault();
    const q = vin.trim();
    if (!q) return;
    setBusy(true); setErr(""); setFound(null);
    try {
      const data = await loadHistory(reader, q);
      const warranty = data.vehicle.exists ? await reader.inWarranty(vinHashOf(q)) : false;
      setFound({ vin: q.toUpperCase(), data, status: computeStatus(data), warranty });
    } catch (ex) { setErr("Chưa đọc được dữ liệu từ hệ thống: " + (ex.shortMessage || ex.message)); }
    setBusy(false);
  }

  const v = found?.data.vehicle;
  const exists = !!v?.exists;
  const isOwner = exists && v.owner.toLowerCase() === acct.address.toLowerCase();
  const ready = exists && isOwner;
  const warrantyEnd = exists && v.handoverAt ? v.handoverAt + v.warrantyDays * 86400 : 0;

  return (
    <div className="page">
      <section className="hero small">
        <div className="wrap">
          <h1>Chủ xe khai báo</h1>
          <p className="lead">Xe của bạn vừa đi qua vùng ngập? Khai báo để nhận khuyến nghị và đưa xe đến gara kiểm tra. Cần đăng nhập bằng tài khoản chủ xe.</p>
        </div>
      </section>

      <div className="wrap">
        <section className="card step-card">
          <h3><span className="num">1</span> Nhập mã xe để đối chiếu hồ sơ</h3>
          <form className="inline" onSubmit={check}>
            <label className="grow">Số khung (VIN)
              <input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Nhập số khung xe (VIN)" />
            </label>
            <button disabled={busy || !vin.trim()}>{busy ? "Đang kiểm tra…" : "Kiểm tra mã xe"}</button>
          </form>
          {err && <p className="bad-text">{err}</p>}
          {found && !exists && <p className="bad-text">✘ Không tìm thấy xe {found.vin} trong hệ thống. Kiểm tra lại số khung hoặc liên hệ gara đã đăng ký xe.</p>}
          {found && exists && (
            <div className="found">
              <p className="ok-text">✔ Đã tìm thấy xe {found.vin}</p>
              <p className="muted">Xe đã có hồ sơ với {found.data.records.length} sự kiện được ghi nhận.</p>
              {v.openRequest > 0 && <p className="muted">Xe đang có một khai báo chờ gara kiểm tra ({LEVEL_LABEL[v.openRequest]}).</p>}
              {isOwner
                ? <p className="ok-text">✔ Tài khoản của bạn là chủ xe hiện tại.</p>
                : <p className="bad-text">✘ Tài khoản đang dùng không phải chủ xe hiện tại của xe này. Hãy đăng nhập đúng tài khoản chủ xe.</p>}
            </div>
          )}
        </section>

        <section className={`card step-card${ready ? "" : " locked"}`}>
          <h3><span className="num">2</span> Khai báo xe qua vùng ngập</h3>
          {!ready && <p className="muted">Hoàn tất bước 1 bằng đúng tài khoản chủ xe để khai báo.</p>}
          {ready && (
            <ActionForm
              key={"rep" + found.vin}
              title=""
              fields={[
                { name: "depth", label: "Độ ngập (cm)", type: "number", def: 20 },
                { name: "soak", label: "Thời gian ngâm (phút)", type: "number", def: 10 },
                { name: "stalled", label: "Xe bị chết máy trong vùng ngập", type: "check" },
                { name: "when", label: "Thời điểm xảy ra", type: "datetime" },
              ]}
              submit="Gửi khai báo"
              run={async (f) => {
                const key = vinHashOf(found.vin);
                const doc = hashDoc("owner-report", { vin: found.vin, depthCm: +f.depth, soakMin: +f.soak, stalled: f.stalled });
                await write(acct.index, "ownerReport", [key, +f.depth, +f.soak, f.stalled, toUnix(f.when), doc]);
                const lvl = Number((await reader.getVehicle(key)).openRequest);
                return `Đã ghi nhận khai báo. ${LEVEL_LABEL[lvl]}. ${LEVEL_ADVICE[lvl]}`;
              }}
            />
          )}
          <p className="save-note"><b>Thông tin được lưu để xác nhận:</b> mã xe, độ ngập, thời gian ngâm, xe có chết máy không, thời điểm xảy ra và tài khoản khai báo. Không lưu họ tên, số điện thoại hay biển số.</p>
        </section>

        <section className={`card step-card${ready ? "" : " locked"}`}>
          <h3><span className="num">3</span> Yêu cầu bảo hành (nếu xe còn bảo hành)</h3>
          {!ready && <p className="muted">Hoàn tất bước 1 bằng đúng tài khoản chủ xe để gửi yêu cầu.</p>}
          {ready && !v.handoverAt && <p className="muted">Xe này chưa có biên bản giao xe nên chưa có bảo hành.</p>}
          {ready && v.handoverAt > 0 && (
            <p className={found.warranty ? "ok-text" : "bad-text"}>
              {found.warranty ? `✔ Còn trong thời hạn bảo hành, đến hết ngày ${day(warrantyEnd)}.` : `✘ Đã hết hạn bảo hành từ ngày ${day(warrantyEnd)}.`}
            </p>
          )}
          {ready && found.warranty && (
            <ActionForm
              key={"war" + found.vin}
              title=""
              fields={[{ name: "note", label: "Mô tả sự cố", optional: true }]}
              submit="Gửi yêu cầu bảo hành"
              run={async (f) => {
                await write(acct.index, "claimWarranty", [vinHashOf(found.vin), hashDoc("claim", { vin: found.vin, note: f.note })]);
                return "Đã ghi yêu cầu bảo hành. Gara hoặc đơn vị bảo hành sẽ xem xét theo điều khoản đã ký.";
              }}
            />
          )}
          <p className="save-note"><b>Thông tin được lưu để xác nhận:</b> mã xe, ngày gửi yêu cầu, mô tả sự cố và tài khoản chủ xe.</p>
        </section>
      </div>
    </div>
  );
}

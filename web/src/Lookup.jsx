import React, { useMemo, useState, useEffect } from "react";
import { loadHistory, sealHashOf } from "./lookup.js";
import {
  ZERO, Kind, FLOOD_LABEL, KIND_LABEL, CONCLUSION_LABEL, LEVEL_LABEL, computeStatus, warrantyView,
} from "@shared/status.mjs";
import { reader as contract } from "./chain.js";
import info from "./contract.json";

const VERDICT_ICON = { ok: "✔", bad: "!", warn: "!", neutral: "?" };
const ROLE_PUBLIC = ["", "Hội đồng", "Gara / đại lý được cấp phép", "Doanh nghiệp bảo hiểm", "Đơn vị đăng kiểm"];

const day = (ts) => new Date(ts * 1000).toLocaleDateString("vi-VN");
const dt = (ts) => new Date(ts * 1000).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
const short = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : "");

/** Danh sách thông tin ĐÃ CÓ trên sổ cái (không có thì không hiện). Mỗi mục đều lấy từ chuỗi nên đã xác thực. */
function buildProofs(data, org) {
  const { vehicle: v, records: rs } = data;
  const of = (pred) => rs.filter(pred);
  const items = [];
  const floods = of((r) => r.kind === Kind.Flood);
  const resolutions = of((r) => r.kind === Kind.Resolution);

  if (v.hydrolock) {
    const r = [...floods.filter((x) => x.sub === 2), ...resolutions.filter((x) => x.sub === 3)].sort((a, b) => a.recordedAt - b.recordedAt).at(-1);
    items.push({ tone: "bad", title: "Có ghi nhận thủy kích", detail: r ? `${r.kind === Kind.Flood ? `Xảy ra ngày ${day(r.occurredAt)}` : `Gara kết luận ngày ${day(r.recordedAt)}`} · ghi nhận bởi ${org(r.actor)}` : "" });
  } else if (v.flood) {
    const r = [...floods, ...resolutions.filter((x) => x.sub >= 1)].sort((a, b) => a.recordedAt - b.recordedAt).at(-1);
    items.push({ tone: "warn", title: `Có ghi nhận ${r.kind === Kind.Flood ? FLOOD_LABEL[r.sub] : CONCLUSION_LABEL[r.sub]}`, detail: `${r.kind === Kind.Flood ? `Xảy ra ngày ${day(r.occurredAt)}` : `Ngày ${day(r.recordedAt)}`} · ghi nhận bởi ${org(r.actor)}` });
  }
  for (const r of of((x) => x.kind === Kind.Repair)) {
    items.push({ tone: "ok", title: `Đã sửa chữa bởi ${org(r.actor)}`, detail: `Hoàn tất ngày ${day(r.recordedAt)}` });
  }
  const tl = of((r) => r.kind === Kind.TotalLoss).at(-1);
  if (tl) items.push({ tone: "bad", title: "Từng bị tuyên bố tổn thất toàn bộ", detail: `Ngày ${day(tl.recordedAt)} · ${org(tl.actor)}` });
  if (v.unrecordedOpening) {
    const r = of((x) => x.kind === Kind.Inspection && x.sub === 1).at(0);
    items.push({ tone: "bad", title: "Tem trên máy từng không khớp hồ sơ", detail: `Có thể máy đã được mở ngoài hệ thống${r ? ` · phát hiện ngày ${day(r.recordedAt)} bởi ${org(r.actor)}` : ""}` });
  }
  const insp = of((r) => r.kind === Kind.Inspection).at(-1);
  if (insp) items.push({ tone: insp.sub ? "bad" : "ok", title: `Kiểm định gần nhất: ${insp.num.toLocaleString("vi-VN")} km`, detail: `Ngày ${day(insp.recordedAt)} · ${org(insp.actor)}` });
  if (v.handoverAt) items.push({ tone: "ok", title: "Có biên bản giao xe", detail: `Ngày ${day(v.handoverAt)} · bảo hành ${v.warrantyDays} ngày` });
  if (v.openRequest > 0) items.push({ tone: "warn", title: "Chủ xe vừa khai báo xe qua vùng ngập", detail: `${LEVEL_LABEL[v.openRequest]} · đang chờ gara kiểm tra` });
  return items;
}

function Timeline({ records, orgOf, amended, markAt }) {
  let marked = false;
  const rows = [];
  records.forEach((r, i) => {
    if (markAt && !marked && r.recordedAt > markAt) {
      marked = true;
      rows.push(<li key="mark" className="mark">Sau ngày giao xe</li>);
    }
    const d = r.kind === Kind.Flood ? `${FLOOD_LABEL[r.sub]} · xảy ra ${day(r.occurredAt)}`
      : r.kind === Kind.OwnerReport ? `${LEVEL_LABEL[r.sub]}`
      : r.kind === Kind.Resolution ? `Kết luận: ${CONCLUSION_LABEL[r.sub]}`
      : r.kind === Kind.Inspection ? `${r.num.toLocaleString("vi-VN")} km · ${r.sub ? "tem không khớp hồ sơ" : "tem khớp"}`
      : r.kind === Kind.Handover ? `Bảo hành ${r.num} ngày`
      : r.kind === Kind.Amendment ? `Đính chính sự kiện số ${r.num + 1}` : "";
    rows.push(
      <li key={i} className={`ev k${r.kind}${amended.includes(i) ? " amended" : ""}`}>
        <div className="ev-head">
          <b>{KIND_LABEL[r.kind]}</b>
          {amended.includes(i) && <span className="chip">đã đính chính</span>}
          <time>{dt(r.recordedAt)}</time>
        </div>
        {d && <div className="ev-detail">{d}</div>}
        <div className="ev-meta" title={r.dataHash !== ZERO ? `Mã chứng từ ${short(r.dataHash)}` : ""}>
          {orgOf(r.actor)} · <span className="verified">✔ Đã xác thực</span>
        </div>
      </li>
    );
  });
  return <ol className="timeline">{rows}</ol>;
}

function Guide() {
  return (
    <>
      <section className="band">
        <div className="wrap">
          <h2 className="title">Cách tra cứu</h2>
          <div className="steps">
            <div className="step"><div className="num">1</div><h3>Nhập số khung (VIN)</h3><p>Số khung đóng trên xe hoặc ghi trong giấy đăng ký. Quét mã QR trên xe sẽ mở sẵn trang của đúng xe đó.</p></div>
            <div className="step"><div className="num">2</div><h3>Xem hồ sơ xác thực</h3><p>Xe có từng ngập nước, thủy kích hay sửa máy không, ai sửa, kiểm định lần gần nhất.</p></div>
            <div className="step"><div className="num">3</div><h3>Đối chiếu tem trên máy</h3><p>Đọc số in trên tem dán ở nắp máy và nhập vào. Hệ thống báo khớp hay không khớp với hồ sơ.</p></div>
          </div>
        </div>
      </section>
      <section className="band alt">
        <div className="wrap">
          <h2 className="title">Ba kết quả bạn có thể nhận</h2>
          <div className="levels">
            <div className="level bad"><h3>Có ghi nhận ngập, thủy kích</h3><p>Xe có hồ sơ ngập hoặc thủy kích. Xem ai đã sửa, sửa khi nào và cân nhắc khi trả giá.</p></div>
            <div className="level ok"><h3>Không có ghi nhận, hồ sơ liên tục</h3><p>Không có cảnh báo, tem trên máy khớp hồ sơ và có kiểm định. Bạn vẫn nên lái thử.</p></div>
            <div className="level warn"><h3>Có khoảng trống</h3><p>Tem không khớp hoặc mất, hoặc xe chưa có hồ sơ. Nên mang xe ra gara kiểm tra.</p></div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function Lookup({ preset }) {
  const initial = new URLSearchParams(location.search).get("vin") || "";
  const [vin, setVin] = useState(initial);
  const [seen, setSeen] = useState("");
  const [noSeal, setNoSeal] = useState(false);
  const [data, setData] = useState(null);
  const [queried, setQueried] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function search(v = vin, opts = {}) {
    const q = v.trim();
    if (!q) return;
    setBusy(true); setErr("");
    try {
      setData(await loadHistory(contract, q));
      setQueried(q.toUpperCase());
      setSeen(opts.seal || ""); setNoSeal(!!opts.noSeal);
      history.replaceState(null, "", `?vin=${encodeURIComponent(q)}`);
    } catch (e) {
      setData(null);
      setErr("Chưa đọc được dữ liệu từ hệ thống. Vui lòng thử lại sau. (" + (e.shortMessage || e.message) + ")");
    }
    setBusy(false);
  }
  useEffect(() => { if (initial) search(initial); }, []);
  useEffect(() => { if (preset) { setVin(preset.vin); search(preset.vin, preset); } }, [preset?.nonce]);

  const orgOf = (addr) => info.orgs?.[addr] ?? ROLE_PUBLIC[data?.roles?.[addr]] ?? "Đơn vị đã thu hồi quyền";
  const seenSerial = noSeal ? ZERO : seen.trim() ? sealHashOf(seen) : undefined;
  const status = useMemo(() => (data ? computeStatus({ ...data, seenSerial }) : null), [data, seenSerial]);
  const wv = useMemo(() => (data && data.vehicle.exists ? warrantyView(data) : null), [data]);
  const proofs = useMemo(() => (data && data.vehicle.exists ? buildProofs(data, orgOf) : []), [data]);
  const v = data?.vehicle;
  const lastSeal = data?.records?.filter((r) => r.kind === Kind.SealApplied).at(-1);
  const reasons = status ? status.reasons.filter((r) => status.verdict === "pending" || status.verdict === "gap" ? !r.startsWith("Chưa có mốc") : !r.startsWith("Chưa")) : [];

  return (
    <div>
      <section className="hero">
        <div className="wrap">
          <h1>Hồ sơ xác thực thông tin xe của bạn</h1>
          <p className="lead">Nhập số khung (VIN) để biết xe đã từng ngập nước, thủy kích hay được sửa máy chưa. Mọi thông tin lấy từ sổ cái dùng chung và đã được xác thực. Miễn phí, không cần tài khoản.</p>
          <form className="search" onSubmit={(e) => { e.preventDefault(); search(); }} role="search">
            <input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="Nhập số khung xe (VIN)" aria-label="Số khung (VIN)" autoFocus />
            <button disabled={busy || !vin.trim()}>{busy ? "Đang tra…" : "Tra cứu"}</button>
          </form>
        </div>
      </section>

      {err && <div className="wrap"><p className="error" role="alert">{err}</p></div>}
      {!data && !err && <Guide />}

      {data && status && (
        <>
          <section className="band">
            <div className="wrap">
              <div className="result-head">
                <span className="muted">Kết quả cho số khung</span>
                <span className="vin">{queried}</span>
                <span className="muted">— hãy so với số đóng trên khung xe.</span>
              </div>
              <div className="summary">
                <section className={`verdict ${status.tone}`} aria-live="polite">
                  <div className="icon" aria-hidden="true">{VERDICT_ICON[status.tone]}</div>
                  <div>
                    <h2>{status.label}</h2>
                    <p>{status.advice}</p>
                    {reasons.length > 0 && <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                  </div>
                </section>
                {v.exists && (
                  <div className="proofs">
                    <h3>Thông tin đã xác thực</h3>
                    {proofs.length === 0 && <p className="muted">Chưa có thông tin nào được ghi nhận cho xe này.</p>}
                    {proofs.map((p, i) => (
                      <div key={i} className={`proof ${p.tone}`}>
                        <div><b>{p.title}</b><span>{p.detail}</span></div>
                        <span className="badge" title="Dữ liệu nằm trên sổ cái chung, không bên nào sửa hay xóa được">✔ Đã xác thực</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {v.exists && (
            <section className="band alt">
              <div className="wrap">
                <div className="cols two">
                  <section className="card">
                    <h3>Đối chiếu tem trên máy</h3>
                    {v.currentSeal === ZERO ? (
                      <p className="muted">Hồ sơ ghi hiện xe không có tem niêm phong (đã bóc, chưa đặt tem mới). Nếu trên máy có tem, đó là tem không qua hệ thống.</p>
                    ) : (
                      <p className="muted">Tem niêm phong hiện tại{lastSeal ? ` do ${orgOf(lastSeal.actor)} đặt ngày ${day(lastSeal.recordedAt)}` : ""}. Tem dán ở ốc nắp máy. Nhập số in trên tem — số được giữ kín để tránh bị làm giả, hệ thống sẽ tự so.</p>
                    )}
                    <label>Số tem đọc được
                      <input value={seen} disabled={noSeal} onChange={(e) => setSeen(e.target.value)} placeholder="Số in trên tem niêm phong" />
                    </label>
                    <label className="check" style={{ marginTop: 10 }}>
                      <input type="checkbox" checked={noSeal} onChange={(e) => setNoSeal(e.target.checked)} /> Trên máy không có tem
                    </label>
                    {seenSerial !== undefined && (
                      <p className={seenSerial === v.currentSeal ? "ok-text" : "bad-text"} role="status">
                        {seenSerial === v.currentSeal ? "✔ Khớp tem cuối trên hồ sơ." : "✘ Không khớp tem cuối trên hồ sơ."}
                      </p>
                    )}
                  </section>

                  <section className="card">
                    <h3>Lịch sử chi tiết ({data.records.length} sự kiện)</h3>
                    <Timeline records={data.records} orgOf={orgOf} amended={data.amended} />
                  </section>
                </div>
              </div>
            </section>
          )}

          {wv && (
            <section className="band">
              <div className="wrap">
                <h2 className="title">Theo ngày giao xe — {day(v.handoverAt)}, bảo hành {v.warrantyDays} ngày</h2>
                <div className="cols two">
                  <div>
                    <p className="muted">Tem lúc giao: {v.sealAtHandover === v.currentSeal ? "trùng tem hiện tại." : "KHÁC tem hiện tại."}</p>
                    {wv.hints.length > 0 && <ul>{wv.hints.map((h) => <li key={h}>{h}</li>)}</ul>}
                    <p className="note">Đây là gợi ý cách đọc hồ sơ, không phải phán quyết. Việc ai chịu chi phí theo điều khoản bảo hành hoặc giám định.</p>
                  </div>
                  <section className="card">
                    <Timeline records={data.records} orgOf={orgOf} amended={data.amended} markAt={v.handoverAt} />
                  </section>
                </div>
              </div>
            </section>
          )}
          <div className="wrap"><p className="note" style={{ margin: "20px 16px" }}>{status.note}</p></div>
        </>
      )}
    </div>
  );
}

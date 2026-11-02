import React from "react";
import { write, eventArg } from "./chain.js";
import { vinHashOf, sealHashOf } from "./lookup.js";
import { hashDoc } from "./evidence.js";
import { ActionForm, toUnix, accountLabel } from "./ui.jsx";
import { ZERO, FLOOD_LABEL, CONCLUSION_LABEL } from "@shared/status.mjs";

const VIN = { name: "vin", label: "Số khung (VIN)" };
const NOTE = { name: "note", label: "Ghi chú chứng từ (được hash)", optional: true };
const norm = (s) => s.trim().toUpperCase();

export default function Staff({ acct, accounts }) {
  const a = acct.index;
  const owners = accounts.filter((x) => x.role === 0).map((x) => [x.address, accountLabel(x)]);
  const doc = (kind, v, extra = {}) => hashDoc(kind, { vin: norm(v.vin), note: v.note ?? "", ...extra });
  const send = (method, args, okMsg) => async () => { await write(a, method, args); return okMsg; };

  const floodForm = (
    <ActionForm key="flood" title="Ghi nhận ngập / thủy kích" hint="Bật cờ một chiều; không có cách tắt."
      fields={[VIN, { name: "type", label: "Loại", type: "select", options: FLOOD_LABEL.map((t, i) => [i, t]) },
        { name: "when", label: "Thời điểm xảy ra", type: "datetime" }, NOTE]}
      run={(v) => send("reportFlood", [vinHashOf(v.vin), +v.type, toUnix(v.when), doc("flood-report", v, { type: +v.type })], "Đã bật cờ ngập.")()} />
  );

  const amendForms = [
    <ActionForm key="pa" title="Đề xuất đính chính (bên ghi gốc)" hint="Sự kiện cũ vẫn còn trong lịch sử; cần một thành viên khác ký. Cờ không tắt."
      fields={[VIN, { name: "index", label: "Chỉ số sự kiện (số #… trên dòng thời gian)", type: "number" }, NOTE]}
      run={async (v) => {
        const r = await write(a, "proposeAmend", [vinHashOf(v.vin), +v.index, doc("amendment", v, { index: +v.index })]);
        return `Đã đề xuất. Mã đính chính: ${eventArg(r, "AmendProposed", "id")} — gửi mã này cho thành viên khác ký.`;
      }} />,
    <ActionForm key="ca" title="Ký đính chính (thành viên khác)" fields={[{ name: "id", label: "Mã đính chính", type: "number" }]}
      run={(v) => send("coSignAmend", [+v.id], "Đã ký; sự kiện được đánh dấu đính chính.")()} />,
  ];

  const forms = {
    2: [
      <ActionForm key="reg" title="Đăng ký xe + đặt tem số 1"
        fields={[VIN, { name: "owner", label: "Ví chủ xe", type: "select", options: owners }, { name: "seal", label: "Số tem (đã được hội đồng phát hành)", placeholder: "Số in trên tem" }, NOTE]}
        run={(v) => send("registerVehicle", [vinHashOf(v.vin), v.owner, sealHashOf(v.seal), doc("registration", v, { seal: v.seal })], "Đã đăng ký xe và đặt tem.")()} />,
      <ActionForm key="brk" title="Phá tem (mở máy)" hint="Chỉ hợp lệ với tem đang gắn trên đúng VIN."
        fields={[VIN, { name: "seal", label: "Số tem đang gắn" }, { name: "note", label: "Lý do" }]}
        run={(v) => send("breakSeal", [vinHashOf(v.vin), sealHashOf(v.seal), doc("seal-break", v, { seal: v.seal })], "Đã ghi phá tem.")()} />,
      <ActionForm key="app" title="Đặt tem mới" fields={[VIN, { name: "seal", label: "Số tem mới" }, NOTE]}
        run={(v) => send("applySeal", [vinHashOf(v.vin), sealHashOf(v.seal), doc("seal-apply", v, { seal: v.seal })], "Đã đặt tem.")()} />,
      <ActionForm key="rep" title="Sửa xong" hint="Chỉ khi xe đã có ghi nhận ngập. Cờ giữ nguyên; để trống tem nếu chưa đặt tem mới."
        fields={[VIN, { name: "seal", label: "Số tem mới (nếu đặt ngay)", optional: true }, NOTE]}
        run={(v) => send("repairCompleted", [vinHashOf(v.vin), v.seal.trim() ? sealHashOf(v.seal) : ZERO, doc("repair", v, { seal: v.seal })], "Đã ghi sửa xong.")()} />,
      <ActionForm key="res" title="Kiểm tra và đóng yêu cầu của chủ xe" hint="Kết luận ngập/thủy kích sẽ bật cờ; “không ngập” chỉ đóng yêu cầu."
        fields={[VIN, { name: "c", label: "Kết luận", type: "select", options: CONCLUSION_LABEL.map((t, i) => [i, t]) }, NOTE]}
        run={(v) => send("resolveRequest", [vinHashOf(v.vin), +v.c, doc("resolution", v, { c: +v.c })], "Đã đóng yêu cầu và ghi kết luận.")()} />,
      <ActionForm key="ho" title="Giao xe kèm bảo hành" hint="Hợp đồng tự lấy tem hiện tại làm tem lúc giao."
        fields={[VIN, { name: "owner", label: "Ví chủ xe mới", type: "select", options: owners }, { name: "days", label: "Số ngày bảo hành", type: "number", def: 180 }, NOTE]}
        run={(v) => send("handover", [vinHashOf(v.vin), v.owner, +v.days, doc("handover", v, { days: +v.days })], "Đã ghi giao xe.")()} />,
      floodForm, ...amendForms,
    ],
    3: [
      floodForm,
      <ActionForm key="tl" title="Tổn thất toàn bộ" hint="Cờ nặng nhất, không tắt được." fields={[VIN, NOTE]}
        run={(v) => send("declareTotalLoss", [vinHashOf(v.vin), doc("total-loss", v)], "Đã ghi tổn thất toàn bộ.")()} />,
      ...amendForms,
    ],
    4: [
      <ActionForm key="ins" title="Mốc kiểm định" hint="Nhập số tem đang thấy trên máy; để trống nếu không thấy tem. Không khớp hồ sơ → bật cờ “mở máy không ghi nhận”."
        fields={[VIN, { name: "km", label: "Số km", type: "number" }, { name: "seal", label: "Số tem thấy trên máy", optional: true }, NOTE]}
        run={(v) => send("inspectionCheckpoint", [vinHashOf(v.vin), +v.km, v.seal.trim() ? sealHashOf(v.seal) : ZERO, doc("inspection", v, { km: +v.km, seal: v.seal })], "Đã ghi mốc kiểm định.")()} />,
      ...amendForms,
    ],
  }[acct.role];

  if (!forms) return null;
  return (
    <section className="block">
      <h2 className="title">Ghi sự kiện</h2>
      {forms}
    </section>
  );
}

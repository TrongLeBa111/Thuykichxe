// Chạy tự động tình huống A, B, C, các kịch bản tấn công T1/T3/T4/T5 và các luồng Đợt 1 trên chuỗi đã seed.
//   node scripts/scenarios.js
const { connect, ACC, vinHash, serial, evidence, wait, nowSec, advanceDays, load, isValidVin } = require("./lib");
const { DEMO_VINS: V, DEMO_SEALS: SL, DEMO_OWNERS: OW } = require("../shared/demo.mjs");

let S; // shared/status.mjs (ESM) nạp động
const fmt = (ts) => new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 16);
const head = (t) => { console.log(); console.log("═".repeat(72)); console.log(t); console.log("═".repeat(72)); };

function describe(r) {
  let extra = "";
  if (r.kind === S.Kind.Flood) extra = ` (${S.FLOOD_LABEL[r.sub]}, xảy ra ${fmt(r.occurredAt)})`;
  if (r.kind === S.Kind.OwnerReport) extra = ` (${S.LEVEL_LABEL[r.sub]})`;
  if (r.kind === S.Kind.Resolution || r.kind === S.Kind.Reinspection) extra = ` (${S.CONCLUSION_LABEL[r.sub]})`;
  if (r.kind === S.Kind.Inspection) extra = ` (${r.num} km, ${r.sub ? "TEM KHÔNG KHỚP" : "tem khớp"})`;
  if (r.kind === S.Kind.Handover) extra = ` (bảo hành ${r.num} ngày)`;
  if (r.kind === S.Kind.SealBroken) extra = ` (${S.BREAK_LABEL[r.sub]})`;
  if (r.kind === S.Kind.CheckIn) extra = ` (${S.CHECKIN_LABEL[r.sub]})`;
  return `${fmt(r.recordedAt)}  ${S.KIND_LABEL[r.kind]}${extra}`;
}
function timeline(records, markAt) {
  let marked = false;
  records.forEach((r, i) => {
    if (markAt && !marked && r.recordedAt > markAt) { console.log("   ───── (sau ngày giao xe) ─────"); marked = true; }
    console.log(`   [${i}] ${describe(r)}`);
  });
}
function show(st) {
  console.log(`   Kết luận: ${st.label}  → ${st.advice}`);
  if (st.flags.length) console.log(`   Cờ: ${st.flags.join(" · ")}`);
  st.reasons.forEach((r) => console.log(`   • ${r}`));
  st.details.forEach((r) => console.log(`   • ${r}`));
}

async function main() {
  S = await import("../shared/status.mjs");
  const { as, view, addrs } = await connect();
  const results = [];
  const ok = (name, cond) => { results.push([name, !!cond]); console.log(`   ${cond ? "✔" : "✘"} ${name}`); };
  const rejects = async (p) => { try { await p; return false; } catch (e) { console.log(`     ↳ bị từ chối: ${S.explainError(e)}`); return true; } };
  const x = (k) => evidence("x", { k });

  // ───────────── VIN ─────────────
  head("KIỂM TRA SỐ KHUNG (VIN)");
  ok("VIN demo đủ 17 ký tự, không I/O/Q", Object.values(V).every(isValidVin));
  ok("mã ngắn '123' bị từ chối", !isValidVin("123"));
  ok("VIN chứa chữ O bị từ chối", !isValidVin("RLXDEMO0000000123"));

  // ───────────── A ─────────────
  head(`TÌNH HUỐNG A — Anh A định mua xe cũ ${V.honest} (người bán trung thực)`);
  let d = await load(view, V.honest);
  timeline(d.records);
  let st = S.computeStatus({ ...d, seenSerial: serial(SL.honest) });
  show(st);
  ok("có ghi nhận thủy kích → 'Có ghi nhận'", st.verdict === "flagged" && d.vehicle.hydrolock);
  ok("tem hiện tại khớp, sửa tại Gara C sau khi chủ xe ký tiếp nhận",
    d.vehicle.currentSeal === serial(SL.honest) && d.records.some((r) => r.kind === S.Kind.CheckIn && r.actor === addrs[ACC.garageC]) && d.records.some((r) => r.kind === S.Kind.Repair && r.actor === addrs[ACC.garageC]));
  ok("phá tem ghi lý do 'sửa do ngập / thủy kích'", d.records.some((r) => r.kind === S.Kind.SealBroken && r.sub === S.BreakReason.FloodRepair));
  ok("hiện 'hồ sơ bắt đầu từ ngày'", st.details.some((t) => t.startsWith("Hồ sơ bắt đầu từ ngày")));

  d = await load(view, V.clean);
  const cleanSeal = d.vehicle.currentSeal;
  ok("xe sạch + tem khớp + có kiểm định → 'hồ sơ liên tục'", S.computeStatus({ ...d, seenSerial: cleanSeal }).verdict === "continuous");
  ok("tem trên máy khác hồ sơ → 'có khoảng trống'", S.computeStatus({ ...d, seenSerial: serial("T-999999") }).verdict === "gap");
  ok("xe chưa đăng ký → 'có khoảng trống'", S.computeStatus(await load(view, V.unknown)).verdict === "gap");

  // ───────────── B ─────────────
  head(`TÌNH HUỐNG B — Anh B vừa chạy qua đường ngập với xe ${V.clean}`);
  for (const [label, depth, soak, stalled, expected] of [
    ["ngập 15 cm, 10 phút, xe chạy bình thường", 15, 10, false, 1],
    ["ngập 40 cm, 20 phút, xe vẫn chạy", 40, 20, false, 2],
    ["chết máy trong vùng ngập", 40, 20, true, 3],
  ]) {
    const lvl = Number(await view.classify(depth, soak, stalled));
    console.log(`   • ${label} → ${S.LEVEL_LABEL[lvl]}`);
    ok(`phân loại đúng mức ${expected}`, lvl === expected);
  }
  await wait(as(OW.clean).ownerReport(vinHash(V.clean), 40, 20, true, await nowSec(), evidence("owner-report", { vin: V.clean, stalled: true })));
  d = await load(view, V.clean);
  console.log(`   Lời khuyên: ${S.LEVEL_ADVICE[d.vehicle.openRequest]}`);
  ok("khai báo mở yêu cầu mức 3 nhưng KHÔNG bật cờ", d.vehicle.openRequest === 3 && !d.vehicle.flood);
  ok("chủ xe không tự đóng được yêu cầu", await rejects(as(OW.clean).resolveRequest.staticCall(vinHash(V.clean), 0, x(1))));
  ok("Gara C chưa được tiếp nhận xe thì không đóng được yêu cầu", await rejects(as(ACC.garageC).resolveRequest.staticCall(vinHash(V.clean), 3, x(2))));
  await wait(as(OW.clean).checkIn(vinHash(V.clean), addrs[ACC.garageC], evidence("check-in", { vin: V.clean })));
  await wait(as(ACC.garageC).resolveRequest(vinHash(V.clean), 3, evidence("resolution", { vin: V.clean, conclusion: "thủy kích" })));
  await wait(as(ACC.garageC).checkOut(vinHash(V.clean), evidence("check-out", { vin: V.clean })));
  d = await load(view, V.clean);
  ok("chủ xe ký tiếp nhận → Gara C kiểm tra, đóng yêu cầu, bật cờ → bàn giao", d.vehicle.openRequest === 0 && d.vehicle.hydrolock && d.vehicle.custodian === "0x" + "0".repeat(40));

  // ───────────── C ─────────────
  head(`TÌNH HUỐNG C — Bảo hành 6 tháng, tháng thứ 4 báo thủy kích (${V.warranty})`);
  let w = await load(view, V.warranty);
  const handoverAt = w.vehicle.handoverAt;
  await advanceDays(120);
  console.log("   … 120 ngày sau …");
  await wait(as(ACC.insurer).reportFlood(vinHash(V.warranty), 2, await nowSec(), evidence("flood-report", { vin: V.warranty, note: "tháng 4" })));
  await wait(as(OW.warrantyBuyer).claimWarranty(vinHash(V.warranty), evidence("claim", { vin: V.warranty })));
  w = await load(view, V.warranty);
  timeline(w.records, handoverAt);
  const wv = S.warrantyView(w);
  wv.hints.forEach((h) => console.log(`   Gợi ý: ${h}`));
  ok("sự kiện ngập nằm SAU ngày giao xe", wv.after.some((r) => r.kind === S.Kind.Flood));
  ok("tem lúc giao khớp tem hiện tại", w.vehicle.sealAtHandover === w.vehicle.currentSeal);
  ok("yêu cầu bảo hành trong hạn được ghi", wv.after.some((r) => r.kind === S.Kind.WarrantyClaim));
  await advanceDays(100);
  ok("yêu cầu ngày ~220 > 180 bị từ chối", await rejects(as(OW.warrantyBuyer).claimWarranty.staticCall(vinHash(V.warranty), x(3))));

  // ───────────── Đợt 1: tiếp nhận, phiếu giấy, niêm phong lại ─────────────
  head("ĐỢT 1 — TIẾP NHẬN XE, PHIẾU GIẤY, LÝ DO PHÁ TEM, NIÊM PHONG LẠI");
  d = await load(view, V.paper);
  timeline(d.records);
  ok("phiếu giấy: Gara C tiếp nhận sau khi một thành viên khác xác nhận", d.records.some((r) => r.kind === S.Kind.CheckIn && r.sub === 1 && r.actor === addrs[ACC.garageC]));
  ok("phá tem vì bảo dưỡng không bật cờ ngập", d.records.some((r) => r.kind === S.Kind.SealBroken && r.sub === S.BreakReason.Maintenance) && !d.vehicle.flood);
  ok("xe bảo dưỡng có ghi nhận vẫn 'hồ sơ liên tục' khi tem khớp", S.computeStatus({ ...d, seenSerial: serial(SL.paper) }).verdict === "continuous");

  d = await load(view, V.recheck);
  timeline(d.records);
  st = S.computeStatus({ ...d, seenSerial: serial(SL.recheck) });
  show(st);
  ok("mở máy ngoài hệ thống: cờ vẫn bật (không tắt)", d.vehicle.unrecordedOpening);
  ok("đã kiểm tra lại + tem mới khớp → không bị xếp chung với sửa lén", st.verdict === "continuous" && st.rechecked);
  ok("tem cũ được ghi 'đã bị mở ngoài hệ thống'", d.records.some((r) => r.kind === S.Kind.SealBroken && r.sub === S.BreakReason.Unrecorded));

  // ───────────── Tấn công ─────────────
  head("KỊCH BẢN TẤN CÔNG (proposal mục 8)");
  const names = view.interface.fragments.filter((f) => f.type === "function").map((f) => f.name.toLowerCase());
  ok("T1: hợp đồng không có hàm xóa/sửa/tắt cờ", !names.some((n) => /delete|remove|clear|reset|unset|disable/.test(n)));
  console.log(`   T3 – Đại lý A ghi khống thủy kích cho xe ${V.fakeSeal} (xe không ở xưởng của họ):`);
  ok("T3: Workshop không giữ xe thì không ghi ngập được", await rejects(as(ACC.agentA).reportFlood.staticCall(vinHash(V.fakeSeal), 2, 0, x(4))));
  ok("T3: … cũng không phá tem được", await rejects(as(ACC.agentA).breakSeal.staticCall(vinHash(V.fakeSeal), serial(SL.fakeSeal), 2, x(5))));
  ok("T3: Workshop tự xác nhận phiếu giấy của mình bị từ chối", await (async () => {
    await wait(as(ACC.agentA).proposeCheckIn(vinHash(V.fakeSeal), evidence("paper", { vin: V.fakeSeal })));
    const id = (await view.paperCheckInCount()) - 1n;
    return rejects(as(ACC.agentA).confirmCheckIn.staticCall(id));
  })());
  console.log("   T4 – cấp quyền gara 'ma':");
  const ghost = addrs[19];
  ok("T4: gara chưa được duyệt không ghi được", await rejects(as(19).registerVehicle.staticCall(vinHash("RLXDEMX0000000001"), ghost, serial("T-004999"), x(6))));
  ok("T4: một thành viên hội đồng một mình không cấp quyền được", await (async () => {
    await wait(as(0).proposeAddMember(ghost, 2));
    return (await view.roles(ghost)) === 0n;
  })());
  console.log(`   T5 – sửa lén (${V.gap}):`);
  d = await load(view, V.gap);
  st = S.computeStatus({ ...d, seenSerial: "0x" + "0".repeat(64) });
  show(st);
  ok("T5: cờ 'mở máy không ghi nhận', chưa kiểm tra lại", d.vehicle.unrecordedOpening && !st.rechecked);
  d = await load(view, V.fakeSeal);
  ok("tem lạ → 'có khoảng trống'", S.computeStatus({ ...d, seenSerial: serial("T-FAKE-0001") }).verdict === "gap");

  head("TỔNG KẾT");
  const pass = results.filter(([, p]) => p).length;
  console.log(`   ${pass}/${results.length} kiểm tra đạt`);
  if (pass !== results.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

// Chạy tự động các quy trình nghiệp vụ trên chuỗi đã seed (node scripts/scenarios.js).
// Nhóm: người mua tra cứu · chủ xe khai báo · bán kèm bảo hành · kiểm tra lại sau mở máy ·
// thay động cơ · thanh lý xe tổn thất · kiểm soát quyền.
const { connect, ACC, vinHash, serial, evidence, wait, nowSec, advanceDays, load, isValidVin } = require("./lib");
const { id } = require("ethers");
const { DEMO_VINS: V, DEMO_SEALS: SL, DEMO_OWNERS: OW } = require("../shared/demo.mjs");

let S; // shared/status.mjs (ESM) nạp động
const ZERO = "0x" + "0".repeat(64);
const fmt = (ts) => new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 16);
const head = (t) => { console.log(); console.log("═".repeat(72)); console.log(t); console.log("═".repeat(72)); };

function describe(r) {
  let extra = "";
  if (r.kind === S.Kind.Flood) extra = ` (${S.FLOOD_LABEL[r.sub]}, xảy ra ${fmt(r.occurredAt)})`;
  if (r.kind === S.Kind.OwnerReport) extra = ` (${S.LEVEL_LABEL[r.sub]})`;
  if (r.kind === S.Kind.Inspection) extra = ` (${r.num} km, ${S.CONCLUSION_LABEL[S.inspectConclusion(r.sub)]}${S.inspectMismatch(r.sub) ? ", TEM KHÔNG KHỚP" : ""})`;
  if (r.kind === S.Kind.Transfer && r.num) extra = ` (bảo hành ${r.num} ngày)`;
  if (r.kind === S.Kind.SealChange) extra = ` (${S.SEAL_LABEL[r.sub]})`;
  return `${fmt(r.recordedAt)}  ${S.KIND_LABEL[r.kind]}${extra}`;
}
function timeline(records, markAt) {
  let marked = false;
  records.forEach((r, i) => {
    if (markAt && !marked && r.recordedAt > markAt) { console.log("   ───── (sau ngày chuyển chủ) ─────"); marked = true; }
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

  head("SỐ KHUNG (VIN)");
  ok("VIN demo đủ 17 ký tự, không I/O/Q", Object.values(V).every(isValidVin));
  ok("mã ngắn '123' bị từ chối", !isValidVin("123"));
  ok("VIN chứa chữ O bị từ chối", !isValidVin("RLXDEMO0000000123"));

  head(`NGƯỜI MUA TRA CỨU XE CŨ (${V.honest})`);
  let d = await load(view, V.honest);
  timeline(d.records);
  let st = S.computeStatus({ ...d, seenSerial: serial(SL.honest) });
  show(st);
  ok("có ghi nhận thủy kích → 'Có ghi nhận'", st.verdict === "flagged" && d.vehicle.hydrolock);
  ok("bảo hiểm ghi ngập, Gara C sửa và dán tem mới (lý do: sửa do ngập)",
    d.records.some((r) => r.kind === S.Kind.Flood && r.actor === addrs[ACC.insurer]) &&
    d.records.some((r) => r.kind === S.Kind.Repair && r.actor === addrs[ACC.garageC]) &&
    d.records.some((r) => r.kind === S.Kind.SealChange && r.sub === S.SealReason.FloodRepair) &&
    d.vehicle.currentSeal === serial(SL.honest));
  ok("hiện 'hồ sơ bắt đầu từ ngày'", st.details.some((t) => t.startsWith("Hồ sơ bắt đầu từ ngày")));
  d = await load(view, V.clean);
  ok("xe sạch + tem khớp + có kiểm tra → 'hồ sơ liên tục'", S.computeStatus({ ...d, seenSerial: d.vehicle.currentSeal }).verdict === "continuous");
  ok("tem trên máy khác hồ sơ → 'có khoảng trống'", S.computeStatus({ ...d, seenSerial: serial("T-999999") }).verdict === "gap");
  ok("xe chưa đăng ký → 'có khoảng trống'", S.computeStatus(await load(view, V.unknown)).verdict === "gap");
  d = await load(view, V.fakeSeal);
  ok("tem lạ → 'có khoảng trống'", S.computeStatus({ ...d, seenSerial: serial("T-FAKE-0001") }).verdict === "gap");

  head(`CHỦ XE KHAI BÁO NGẬP, GARA KẾT LUẬN (${V.clean})`);
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
  ok("khai báo mở yêu cầu mức 3 nhưng KHÔNG bật cờ", d.vehicle.openRequest === 3 && !d.vehicle.flood);
  ok("chủ xe không tự kết luận được", await rejects(as(OW.clean).inspect.staticCall(vinHash(V.clean), 0, d.vehicle.currentSeal, 4, ZERO, x(1))));
  await wait(as(ACC.garageC).inspect(vinHash(V.clean), 15100, d.vehicle.currentSeal, 4, ZERO, evidence("inspection", { vin: V.clean, conclusion: "thủy kích" })));
  d = await load(view, V.clean);
  ok("Gara C kiểm tra, kết luận thủy kích → đóng yêu cầu, bật cờ", d.vehicle.openRequest === 0 && d.vehicle.hydrolock);

  head(`ĐẠI LÝ BÁN XE KÈM BẢO HÀNH, THÁNG 4 BÁO THỦY KÍCH (${V.warranty})`);
  let w = await load(view, V.warranty);
  const handoverAt = w.vehicle.handoverAt;
  ok("đại lý đứng tên xe trong kho, chuyển cho khách kèm bảo hành 180 ngày", w.vehicle.owner === addrs[OW.warrantyBuyer] && w.vehicle.warrantyDays === 180);
  await advanceDays(120);
  console.log("   … 120 ngày sau …");
  await wait(as(ACC.insurer).reportFlood(vinHash(V.warranty), 2, await nowSec(), evidence("flood-report", { vin: V.warranty, note: "tháng 4" })));
  await wait(as(OW.warrantyBuyer).claimWarranty(vinHash(V.warranty), evidence("claim", { vin: V.warranty })));
  w = await load(view, V.warranty);
  timeline(w.records, handoverAt);
  const wv = S.warrantyView(w);
  wv.hints.forEach((h) => console.log(`   Gợi ý: ${h}`));
  ok("sự kiện ngập nằm SAU ngày chuyển chủ", wv.after.some((r) => r.kind === S.Kind.Flood));
  ok("tem lúc chuyển khớp tem hiện tại", w.vehicle.sealAtHandover === w.vehicle.currentSeal);
  ok("yêu cầu bảo hành trong hạn được ghi", wv.after.some((r) => r.kind === S.Kind.WarrantyClaim));
  await advanceDays(100);
  ok("yêu cầu ngày ~220 > 180 bị từ chối", await rejects(as(OW.warrantyBuyer).claimWarranty.staticCall(vinHash(V.warranty), x(3))));

  head(`KIỂM TRA LẠI SAU KHI TEM BỊ MỞ NGOÀI HỆ THỐNG (${V.recheck})`);
  d = await load(view, V.recheck);
  timeline(d.records);
  st = S.computeStatus({ ...d, seenSerial: serial(SL.recheck) });
  show(st);
  ok("mở máy ngoài hệ thống: cờ vẫn bật (không tắt)", d.vehicle.unrecordedOpening);
  ok("đã kiểm tra lại + tem mới khớp → không bị xếp chung với sửa lén", st.verdict === "continuous" && st.rechecked);
  ok("tem mới ghi lý do 'đã bị mở ngoài hệ thống'", d.records.some((r) => r.kind === S.Kind.SealChange && r.sub === S.SealReason.Unrecorded));
  d = await load(view, V.gap);
  st = S.computeStatus({ ...d, seenSerial: ZERO });
  show(st);
  ok("sửa lén: đăng kiểm thấy mất tem, chưa ai kiểm tra lại → chưa 'đã kiểm tra lại'", d.vehicle.unrecordedOpening && !st.rechecked);

  head(`THAY ĐỘNG CƠ SAU THỦY KÍCH (${V.engine})`);
  d = await load(view, V.engine);
  timeline(d.records);
  st = S.computeStatus({ ...d, seenSerial: d.vehicle.currentSeal });
  show(st);
  ok("ghi sự kiện thay động cơ, số máy hiện tại là số máy mới", d.records.some((r) => r.kind === S.Kind.EngineChange) && d.vehicle.engineHash === id("engine:ENG-NEW-002"));
  ok("thay động cơ không xóa cờ thủy kích", d.vehicle.hydrolock && st.verdict === "flagged");
  ok("trang tra cứu nêu việc đã thay động cơ", st.details.some((t) => t.startsWith("Đã thay động cơ")));

  head(`THANH LÝ XE TỔN THẤT TOÀN BỘ (${V.salvage})`);
  d = await load(view, V.salvage);
  timeline(d.records);
  st = S.computeStatus({ ...d, seenSerial: d.vehicle.currentSeal });
  show(st);
  ok("chủ xe → bảo hiểm → người mua: hai lần chuyển chủ", d.records.filter((r) => r.kind === S.Kind.Transfer).length === 2 && d.vehicle.owner === addrs[OW.salvageBuyer]);
  ok("cờ tổn thất toàn bộ và ngập vẫn còn sau khi thanh lý", d.vehicle.totalLoss && d.vehicle.flood && st.verdict === "flagged");

  head("KIỂM SOÁT QUYỀN");
  const names = view.interface.fragments.filter((f) => f.type === "function").map((f) => f.name.toLowerCase());
  ok("hợp đồng không có hàm xóa/sửa/tắt cờ", !names.some((n) => /delete|remove|clear|reset|unset|disable/.test(n)));
  ok("chủ xe không tự ghi nhận ngập", await rejects(as(OW.fakeSeal).reportFlood.staticCall(vinHash(V.fakeSeal), 2, 0, x(4))));
  ok("chủ xe cũ không còn quyền sau khi chuyển chủ", await rejects(as(OW.warrantySeller).ownerReport.staticCall(vinHash(V.warranty), 1, 1, false, 1, x(5))));
  ok("số tem đã dùng cho xe khác không được tái sử dụng", await rejects(as(ACC.garageC).changeSeal.staticCall(vinHash(V.fakeSeal), serial(SL.honest), 0, x(6))));
  const ghost = addrs[19];
  ok("đơn vị chưa được duyệt không ghi được", await rejects(as(19).registerVehicle.staticCall(vinHash("RLXDEMX0000000001"), ghost, serial("T-004999"), ZERO, x(7))));
  ok("một thành viên hội đồng một mình không cấp quyền được", await (async () => {
    await wait(as(0).proposeAddMember(ghost, 2));
    return (await view.roles(ghost)) === 0n;
  })());
  ok("thành viên hội đồng không ghi dữ liệu xe", await rejects(as(0).reportFlood.staticCall(vinHash(V.fakeSeal), 2, 0, x(8))));

  head("TỔNG KẾT");
  const pass = results.filter(([, p]) => p).length;
  console.log(`   ${pass}/${results.length} kiểm tra đạt`);
  if (pass !== results.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

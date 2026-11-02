// Chạy tự động tình huống A, B, C và các kịch bản tấn công T1/T4/T5 trên chuỗi đã seed.
//   node scripts/scenarios.js
const { connect, ACC, vinHash, serial, evidence, wait, nowSec, advanceDays, load } = require("./lib");

let S; // shared/status.mjs (ESM) nạp động
const fmt = (ts) => new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 16);
const head = (t) => { console.log(); console.log("═".repeat(72)); console.log(t); console.log("═".repeat(72)); };

function describe(r) {
  let extra = "";
  if (r.kind === S.Kind.Flood) extra = ` (${S.FLOOD_LABEL[r.sub]}, xảy ra ${fmt(r.occurredAt)})`;
  if (r.kind === S.Kind.OwnerReport) extra = ` (${S.LEVEL_LABEL[r.sub]})`;
  if (r.kind === S.Kind.Resolution) extra = ` (${S.CONCLUSION_LABEL[r.sub]})`;
  if (r.kind === S.Kind.Inspection) extra = ` (${r.num} km, ${r.sub ? "TEM KHÔNG KHỚP" : "tem khớp"})`;
  if (r.kind === S.Kind.Handover) extra = ` (bảo hành ${r.num} ngày)`;
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
  const rejects = async (p, name) => { try { await p; return false; } catch (e) { console.log(`     ↳ bị từ chối: ${S.explainError(e)}`); return true; } };

  // ───────────── A ─────────────
  head("TÌNH HUỐNG A — Anh A định mua xe cũ mã 123 (người bán trung thực)");
  let d = await load(view, "123");
  timeline(d.records);
  console.log(`   Tem hiện tại trên chuỗi: T-004512 · ra xe đọc tem trên máy: T-004512`);
  let st = S.computeStatus({ ...d, seenSerial: serial("T-004512") });
  show(st);
  ok("123: có ghi nhận thủy kích → mức 'Có ghi nhận'", st.verdict === "flagged" && d.vehicle.hydrolock);
  ok("123: đã sửa tại Gara C, tem hiện tại T-004512 khớp", d.vehicle.currentSeal === serial("T-004512") && d.records.some((r) => r.kind === S.Kind.Repair && r.actor === addrs[ACC.garageC]));

  console.log("\n   Xe sạch có hồ sơ liên tục (abc, trước khi B xảy ra), tem khớp:");
  d = await load(view, "abc");
  const cleanSeal = d.vehicle.currentSeal;
  st = S.computeStatus({ ...d, seenSerial: cleanSeal });
  show(st);
  ok("abc: không cờ + tem khớp + có mốc kiểm định → 'hồ sơ liên tục'", st.verdict === "continuous");
  st = S.computeStatus({ ...d, seenSerial: serial("T-999999") });
  ok("tem trên máy khác hồ sơ → 'có khoảng trống'", st.verdict === "gap");
  st = S.computeStatus({ ...(await load(view, "KHONG-CO-TRONG-HE-THONG")) });
  ok("xe chưa đăng ký → 'có khoảng trống'", st.verdict === "gap");

  // ───────────── B ─────────────
  head("TÌNH HUỐNG B — Anh B vừa chạy qua đường ngập với xe mã abc");
  const abcOwner = ACC.ownerBase + 1;
  for (const [label, depth, soak, stalled, expected] of [
    ["ngập 15 cm, 10 phút, xe chạy bình thường", 15, 10, false, 1],
    ["ngập 40 cm, 20 phút, xe vẫn chạy", 40, 20, false, 2],
    ["chết máy trong vùng ngập", 40, 20, true, 3],
  ]) {
    const lvl = Number(await view.classify(depth, soak, stalled));
    console.log(`   • ${label} → ${S.LEVEL_LABEL[lvl]}`);
    ok(`phân loại đúng mức ${expected}`, lvl === expected);
  }
  await wait(as(abcOwner).ownerReport(vinHash("abc"), 40, 20, true, await nowSec(),
    evidence("owner-report", { vin: "abc", depthCm: 40, soakMin: 20, stalled: true })));
  d = await load(view, "abc");
  console.log(`   Lời khuyên: ${S.LEVEL_ADVICE[d.vehicle.openRequest]}`);
  show(S.computeStatus({ ...d, seenSerial: cleanSeal }));
  ok("khai báo mở yêu cầu mức 3 nhưng KHÔNG bật cờ", d.vehicle.openRequest === 3 && !d.vehicle.flood && !d.vehicle.hydrolock);
  ok("chủ xe không tự đóng được yêu cầu", await rejects(as(abcOwner).resolveRequest.staticCall(vinHash("abc"), 0, evidence("x", {})), ""));
  ok("người không phải chủ xe không khai báo được", await rejects(as(ACC.ownerBase + 5).ownerReport.staticCall(vinHash("abc"), 10, 5, false, 0, evidence("x", {})), ""));
  await wait(as(ACC.garageC).resolveRequest(vinHash("abc"), 3, evidence("resolution", { vin: "abc", conclusion: "thủy kích" })));
  d = await load(view, "abc");
  ok("Workshop kiểm tra rồi mới đóng yêu cầu và bật cờ", d.vehicle.openRequest === 0 && d.vehicle.hydrolock);

  // ───────────── C ─────────────
  head("TÌNH HUỐNG C — Bảo hành 6 tháng, tháng thứ 4 báo thủy kích (wty-001)");
  const buyer = ACC.ownerBase + 6;
  let w = await load(view, "wty-001");
  const sealAtHandover = w.vehicle.sealAtHandover;
  const handoverAt = w.vehicle.handoverAt;
  console.log(`   Lúc giao xe: tem ${sealAtHandover === w.vehicle.currentSeal ? "= tem hiện tại" : "khác tem hiện tại"}, không cờ`);
  await advanceDays(120);
  console.log("   … 120 ngày sau …");
  await wait(as(ACC.insurer).reportFlood(vinHash("wty-001"), 2, await nowSec(), evidence("flood-report", { vin: "wty-001", type: 2, note: "tháng 4" })));
  await wait(as(buyer).claimWarranty(vinHash("wty-001"), evidence("claim", { vin: "wty-001" })));
  w = await load(view, "wty-001");
  timeline(w.records, handoverAt);
  const wv = S.warrantyView(w);
  wv.hints.forEach((h) => console.log(`   Gợi ý: ${h}`));
  ok("sự kiện ngập nằm SAU ngày giao xe", wv.after.some((r) => r.kind === S.Kind.Flood));
  ok("tem lúc giao khớp tem hiện tại (không có lần mở máy)", w.vehicle.sealAtHandover === w.vehicle.currentSeal);
  ok("yêu cầu bảo hành trong hạn được ghi", wv.after.some((r) => r.kind === S.Kind.WarrantyClaim));
  await advanceDays(100);
  ok("yêu cầu ngày ~220 > 180 bị từ chối", await rejects(as(buyer).claimWarranty.staticCall(vinHash("wty-001"), evidence("x", {})), ""));

  // ───────────── T1, T4, T5 ─────────────
  head("KỊCH BẢN TẤN CÔNG (proposal mục 8)");
  console.log("   T1 – người bán nhờ xóa/hạ cờ của xe 123:");
  const names = view.interface.fragments.filter((f) => f.type === "function").map((f) => f.name.toLowerCase());
  ok("T1: contract không có hàm xóa/sửa/tắt cờ", !names.some((n) => /delete|remove|clear|reset|unset|disable/.test(n)));
  ok("T1: đính chính không tắt cờ (cần xem test)", (await load(view, "123")).vehicle.hydrolock);

  console.log("   T4 – cấp quyền gara 'ma':");
  const ghost = addrs[19];
  ok("T4: gara chưa được duyệt không ghi được", await rejects(as(19).registerVehicle.staticCall(vinHash("ghost-1"), ghost, serial("T-004999"), evidence("x", {})), ""));
  ok("T4: một thành viên hội đồng một mình không cấp quyền được",
    await (async () => {
      await wait(as(0).proposeAddMember(ghost, 2));
      return (await view.roles(ghost)) === 0n;
    })());

  console.log("   T5 – sửa lén (gap-001):");
  d = await load(view, "gap-001");
  timeline(d.records);
  st = S.computeStatus({ ...d, seenSerial: "0x" + "0".repeat(64) });
  show(st);
  ok("T5: cờ 'mở máy không ghi nhận' được bật bởi mốc kiểm định", d.vehicle.unrecordedOpening);

  console.log("   Tem lạ (seal-001): người bán dán tem trắng khác lên máy");
  d = await load(view, "seal-001");
  st = S.computeStatus({ ...d, seenSerial: serial("T-FAKE-0001") });
  show(st);
  ok("tem lạ → 'có khoảng trống'", st.verdict === "gap");

  head("TỔNG KẾT");
  const pass = results.filter(([, p]) => p).length;
  console.log(`   ${pass}/${results.length} kiểm tra đạt`);
  if (pass !== results.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

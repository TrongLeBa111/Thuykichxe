// Dữ liệu mẫu theo proposal + phản biện Đợt 1 (tiếp nhận xe, lý do phá tem, niêm phong lại, VIN 17 ký tự).
//   node scripts/seed.js          → 20 xe
//   node scripts/seed.js 500      → 500 xe
const { connect, ACC, vinHash, serial, evidence, wait, nowSec } = require("./lib");
const { DEMO_VINS: V, DEMO_SEALS: SL, DEMO_OWNERS: OW, randomVin } = require("../shared/demo.mjs");

const FT = { Floor: 0, Engine: 1, Hydrolock: 2 };
const BR = { Maintenance: 0, NonFloodRepair: 1, FloodRepair: 2, EngineReplacement: 3 };
const T_FLOOD_HN = Math.floor(Date.UTC(2025, 9, 2) / 1000); // 02/10/2025 – ngập Hà Nội
const N = Number(process.argv[2] || process.env.SEED_VEHICLES || 20);
const ZERO = "0x" + "0".repeat(64);

async function main() {
  const { as, addrs, view } = await connect();
  if ((await view.getVehicle(vinHash(V.honest))).exists) {
    console.log("Đã có dữ liệu mẫu trên chuỗi này. Tắt hardhat node, bật lại, chạy deploy rồi seed lại.");
    return;
  }
  const { agentA, garageC, insurer, inspector, ownerBase, ownerCount } = ACC;
  let events = 0, vehicles = 0;
  const tx = async (p) => { await wait(p); events++; };

  // ── Hội đồng phát hành số tem: các số đặt sẵn cho xe minh họa + dải T-004600… cho xe ngẫu nhiên ──
  const named = Object.values(SL);
  const pool = [];
  for (let i = 0; i < N * 3 + 40; i++) pool.push(`T-${String(4600 + i).padStart(6, "0")}`);
  const all = [...named, ...pool];
  for (let i = 0; i < all.length; i += 150) await wait(as(ACC.council[0]).issueSeals(all.slice(i, i + 150).map(serial)));
  let cursor = 0;
  const nextSeal = () => pool[cursor++];

  const doc = (kind, vin, extra = {}) => evidence(kind, { vin, ...extra });
  const register = async (vin, ownerIdx, seal, ws = agentA) => {
    await tx(as(ws).registerVehicle(vinHash(vin), addrs[ownerIdx], serial(seal), doc("registration", vin, { seal })));
    vehicles++;
  };
  // Đăng ký xong xe vẫn ở đại lý; giao cho chủ xe = bàn giao (checkOut)
  const out = (vin, by) => tx(as(by).checkOut(vinHash(vin), doc("check-out", vin)));
  const checkIn = (vin, ownerIdx, ws) => tx(as(ownerIdx).checkIn(vinHash(vin), addrs[ws], doc("check-in", vin, { ws: addrs[ws] })));
  const flood = (vin, type, when, by = insurer) =>
    tx(as(by).reportFlood(vinHash(vin), type, when, doc("flood-report", vin, { type, note: "biên bản giám định, ảnh vết ngập" })));
  const openSeal = (vin, s, reason, ws) => tx(as(ws).breakSeal(vinHash(vin), serial(s), reason, doc("seal-break", vin, { seal: s, reason })));
  const repaired = (vin, newSeal, ws) =>
    tx(as(ws).repairCompleted(vinHash(vin), newSeal ? serial(newSeal) : ZERO, doc("repair", vin, { newSeal, parts: "xi-lanh, tay biên, lọc gió" })));
  const checkpoint = (vin, km, seen) =>
    tx(as(inspector).inspectionCheckpoint(vinHash(vin), km, seen ? serial(seen) : ZERO, doc("inspection", vin, { km, seen })));

  // ── A. Người bán trung thực: thủy kích 02/10/2025, sửa tại Gara C, tem hiện tại T-004512 ──
  await register(V.honest, OW.honest, SL.honestFirst);
  await out(V.honest, agentA);
  await flood(V.honest, FT.Hydrolock, T_FLOOD_HN);              // bảo hiểm ghi theo hồ sơ bồi thường
  await checkIn(V.honest, OW.honest, garageC);                  // chủ xe ký cho Gara C tiếp nhận
  await openSeal(V.honest, SL.honestFirst, BR.FloodRepair, garageC);
  await repaired(V.honest, SL.honest, garageC);
  await out(V.honest, garageC);
  await checkpoint(V.honest, 31200, SL.honest);

  // ── B. Xe sạch, hồ sơ liên tục ──
  await register(V.clean, OW.clean, SL.clean);
  await out(V.clean, agentA);
  await checkpoint(V.clean, 15000, SL.clean);

  // ── C. Giao xe kèm bảo hành 180 ngày (giao xe = bàn giao) ──
  await register(V.warranty, OW.warrantySeller, SL.warranty);
  await checkpoint(V.warranty, 120, SL.warranty);
  await tx(as(agentA).handover(vinHash(V.warranty), addrs[OW.warrantyBuyer], 180, doc("handover", V.warranty, { warrantyDays: 180, seal: SL.warranty })));

  // ── Sửa lén (T5): sửa có ghi nhận, sau đó máy bị mở ngoài hệ thống, kiểm định thấy mất tem ──
  await register(V.gap, OW.gap, SL.gapFirst);
  await out(V.gap, agentA);
  await flood(V.gap, FT.Hydrolock, T_FLOOD_HN + 86400);
  await checkIn(V.gap, OW.gap, garageC);
  await openSeal(V.gap, SL.gapFirst, BR.FloodRepair, garageC);
  await repaired(V.gap, SL.gap, garageC);
  await out(V.gap, garageC);
  await checkpoint(V.gap, 40000, null);

  // ── Hồ sơ sạch, dùng để thử tem lạ ──
  await register(V.fakeSeal, OW.fakeSeal, SL.fakeSeal);
  await out(V.fakeSeal, agentA);
  await checkpoint(V.fakeSeal, 8000, SL.fakeSeal);

  // ── Chủ xe khai báo, chờ gara ──
  await register(V.pending, OW.pending, SL.pending);
  await out(V.pending, agentA);
  await tx(as(OW.pending).ownerReport(vinHash(V.pending), 40, 20, false, await nowSec(), doc("owner-report", V.pending, { depthCm: 40, soakMin: 20, stalled: false })));

  // ── Tiếp nhận bằng phiếu giấy: chủ xe không có ví; Gara C đề xuất, Đại lý A xác nhận; bảo dưỡng thay gioăng ──
  await register(V.paper, OW.paper, SL.paperFirst);
  await out(V.paper, agentA);
  await tx(as(garageC).proposeCheckIn(vinHash(V.paper), doc("paper-check-in", V.paper, { note: "phiếu tiếp nhận giấy có chữ ký chủ xe" })));
  await tx(as(agentA).confirmCheckIn((await view.paperCheckInCount()) - 1n));
  await openSeal(V.paper, SL.paperFirst, BR.Maintenance, garageC);
  await tx(as(garageC).applySeal(vinHash(V.paper), serial(SL.paper), doc("seal-apply", V.paper, { seal: SL.paper })));
  await out(V.paper, garageC);
  await checkpoint(V.paper, 22000, SL.paper);

  // ── Mở máy ngoài hệ thống rồi được kiểm tra lại: chủ xe thay gioăng ở gara ngoài, đăng kiểm thấy mất tem,
  //    chủ xe mang xe tới Gara C kiểm tra lại và niêm phong ──
  await register(V.recheck, OW.recheck, SL.recheckFirst);
  await out(V.recheck, agentA);
  await checkpoint(V.recheck, 10000, SL.recheckFirst);
  await checkpoint(V.recheck, 18000, null);
  await checkIn(V.recheck, OW.recheck, garageC);
  await tx(as(garageC).reinspect(vinHash(V.recheck), 0, serial(SL.recheck), doc("reinspection", V.recheck, { conclusion: "không có dấu hiệu ngập", seal: SL.recheck })));
  await out(V.recheck, garageC);

  // ── Xe ngẫu nhiên (xác định) ──
  let seed = 20261101;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 1; vehicles < N; i++) {
    const vin = randomVin(i);
    const ws = rnd(2) ? agentA : garageC;
    const ownerIdx = ownerBase + (i % ownerCount);
    let seal = nextSeal();
    await register(vin, ownerIdx, seal, ws);            // ws đang giữ xe cho tới khi bàn giao
    const kind = rnd(10); // 0–3 sạch · 4 ngập sàn · 5 ngập máy · 6–7 thủy kích đã sửa · 8 tổn thất toàn bộ · 9 sửa lén
    const when = T_FLOOD_HN + rnd(60) * 86400;
    if (kind <= 3) {
      await out(vin, ws);
      for (let k = 0, m = 1 + rnd(3); k < m; k++) await checkpoint(vin, 5000 * (k + 1) + rnd(900), seal);
      continue;
    }
    if (kind <= 5) {
      await flood(vin, kind === 4 ? FT.Floor : FT.Engine, when, rnd(2) ? insurer : ws);
    } else if (kind <= 7 || kind === 9) {
      await flood(vin, FT.Hydrolock, when);
      await openSeal(vin, seal, BR.FloodRepair, ws);
      seal = nextSeal();
      await repaired(vin, seal, ws);
    } else {
      await flood(vin, FT.Engine, when);
      await tx(as(insurer).declareTotalLoss(vinHash(vin), doc("total-loss", vin, { note: "quyết định bồi thường toàn bộ" })));
    }
    await out(vin, ws);
    if (kind !== 8) await checkpoint(vin, 20000 + rnd(30000), kind === 9 ? null : seal);
  }

  // ── Một đính chính mẫu: Insurer đề xuất đính chính ghi nhận ngập của xe ngẫu nhiên đầu tiên (nếu có) ──
  const first = randomVin(1);
  const hist = await view.getHistory(vinHash(first));
  const idx = hist.findIndex((r) => Number(r.kind) === 3 && r.actor === addrs[insurer]);
  if (idx >= 0) {
    await tx(as(insurer).proposeAmend(vinHash(first), idx, doc("amendment", first, { note: "đính chính mức độ ngập" })));
    await tx(as(garageC).coSignAmend(0)); // đề xuất đính chính duy nhất của seed → id 0
  }

  console.log(`Seed xong: ${events} giao dịch, ${vehicles} xe, ${all.length} số tem phát hành.`);
  console.log("Xe minh họa:", Object.entries(V).map(([k, v]) => `${k}=${v}`).join(" · "));
}
main().catch((e) => { console.error(e); process.exit(1); });

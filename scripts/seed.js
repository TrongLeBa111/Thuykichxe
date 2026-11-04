// Dữ liệu mẫu theo các quy trình nghiệp vụ: đại lý bán xe, bảo hiểm giám định / thanh lý, gara sửa chữa,
// đăng kiểm, chủ xe tự khai báo, thay tem, thay động cơ, chuyển chủ.
//   node scripts/seed.js          → 20 xe
//   node scripts/seed.js 500      → 500 xe
const { connect, ACC, vinHash, serial, evidence, wait, nowSec } = require("./lib");
const { id } = require("ethers");
const { DEMO_VINS: V, DEMO_SEALS: SL, DEMO_OWNERS: OW, randomVin } = require("../shared/demo.mjs");

const FT = { Floor: 0, Engine: 1, Hydrolock: 2 };
const CL = { NotAssessed: 0, NoFlood: 1, Floor: 2, Engine: 3, Hydrolock: 4 };
const SR = { Maintenance: 0, NonFloodRepair: 1, FloodRepair: 2, EngineReplacement: 3 };
const T_FLOOD_HN = Math.floor(Date.UTC(2025, 9, 2) / 1000); // 02/10/2025 – ngập Hà Nội
const N = Number(process.argv[2] || process.env.SEED_VEHICLES || 20);
const ZERO = "0x" + "0".repeat(64);
const engineHash = (s) => id("engine:" + s);

async function main() {
  const { as, addrs, view } = await connect();
  if ((await view.getVehicle(vinHash(V.honest))).exists) {
    console.log("Đã có dữ liệu mẫu trên chuỗi này. Tắt hardhat node, bật lại, chạy deploy rồi seed lại.");
    return;
  }
  const { agentA, garageC, insurer, inspector, ownerBase, ownerCount } = ACC;
  let events = 0, vehicles = 0;
  const tx = async (p) => { await wait(p); events++; };

  const pool = [];
  for (let i = 0; i < N * 3 + 40; i++) pool.push(`T-${String(4600 + i).padStart(6, "0")}`);
  let cursor = 0;
  const nextSeal = () => pool[cursor++];

  const doc = (kind, vin, extra = {}) => evidence(kind, { vin, ...extra });
  const register = async (vin, ownerIdx, seal, eng, by = agentA) => {
    await tx(as(by).registerVehicle(vinHash(vin), addrs[ownerIdx], serial(seal), engineHash(eng || "E-" + vin), doc("registration", vin, { seal })));
    vehicles++;
  };
  const flood = (vin, type, when, by = insurer) =>
    tx(as(by).reportFlood(vinHash(vin), type, when, doc("flood-report", vin, { type, note: "biên bản giám định, ảnh vết ngập" })));
  const repaired = (vin, newSeal, by) =>
    tx(as(by).repairCompleted(vinHash(vin), newSeal ? serial(newSeal) : ZERO, doc("repair", vin, { newSeal, parts: "xi-lanh, tay biên, lọc gió" })));
  // Một lần ghi kiểm tra: km, tem đọc được (null = không thấy tem), kết luận, tem mới (nếu dán lại)
  const inspect = (vin, km, seen, concl = CL.NotAssessed, newSeal = null, by = inspector) =>
    tx(as(by).inspect(vinHash(vin), km, seen ? serial(seen) : ZERO, concl, newSeal ? serial(newSeal) : ZERO, doc("inspection", vin, { km, seen, concl, newSeal })));

  // ── Gara sửa thủy kích, ghi đủ: bảo hiểm ghi ngập 02/10/2025, Gara C sửa và dán tem mới T-004512 ──
  await register(V.honest, OW.honest, SL.honestFirst);
  await flood(V.honest, FT.Hydrolock, T_FLOOD_HN);
  await repaired(V.honest, SL.honest, garageC);
  await inspect(V.honest, 31200, SL.honest);

  // ── Xe sạch, hồ sơ liên tục ──
  await register(V.clean, OW.clean, SL.clean);
  await inspect(V.clean, 15000, SL.clean);

  // ── Đại lý bán xe kèm bảo hành 180 ngày (đại lý đứng tên xe trong kho, ký chuyển cho khách) ──
  await register(V.warranty, OW.warrantySeller, SL.warranty);
  await inspect(V.warranty, 120, SL.warranty);
  await tx(as(agentA).transfer(vinHash(V.warranty), addrs[OW.warrantyBuyer], 180, doc("transfer", V.warranty, { warrantyDays: 180, seal: SL.warranty })));

  // ── Sửa lén: sửa có ghi nhận, sau đó máy bị mở ngoài hệ thống, đăng kiểm thấy mất tem ──
  await register(V.gap, OW.gap, SL.gapFirst);
  await flood(V.gap, FT.Hydrolock, T_FLOOD_HN + 86400);
  await repaired(V.gap, SL.gap, garageC);
  await inspect(V.gap, 40000, null);

  // ── Hồ sơ sạch, dùng để thử tem lạ ──
  await register(V.fakeSeal, OW.fakeSeal, SL.fakeSeal);
  await inspect(V.fakeSeal, 8000, SL.fakeSeal);

  // ── Chủ xe khai báo, chờ gara ──
  await register(V.pending, OW.pending, SL.pending);
  await tx(as(OW.pending).ownerReport(vinHash(V.pending), 40, 20, false, await nowSec(), doc("owner-report", V.pending, { depthCm: 40, soakMin: 20, stalled: false })));

  // ── Mở máy ngoài hệ thống rồi được kiểm tra lại: đăng kiểm thấy mất tem, chủ xe mang tới Gara C,
  //    Gara C kiểm tra, kết luận không ngập và dán tem mới trong một lần ghi ──
  await register(V.recheck, OW.recheck, SL.recheckFirst);
  await inspect(V.recheck, 10000, SL.recheckFirst);
  await inspect(V.recheck, 18000, null);
  await inspect(V.recheck, 18050, null, CL.NoFlood, SL.recheck, garageC);

  // ── Thủy kích rồi thay động cơ: Gara C thay máy, ghi số máy mới và dán tem mới ──
  await register(V.engine, OW.engine, SL.engineFirst, "ENG-OLD-001");
  await flood(V.engine, FT.Hydrolock, T_FLOOD_HN + 5 * 86400);
  await tx(as(garageC).changeEngine(vinHash(V.engine), engineHash("ENG-NEW-002"), doc("engine-change", V.engine, { old: "ENG-OLD-001", new: "ENG-NEW-002" })));
  await repaired(V.engine, SL.engine, garageC);

  // ── Tổn thất toàn bộ rồi thanh lý: bảo hiểm ghi ngập và tổn thất, chủ xe ký chuyển cho bảo hiểm,
  //    bảo hiểm bán lại cho người mua. Cờ đi theo xe. ──
  await register(V.salvage, OW.salvageFirst, SL.salvage);
  await flood(V.salvage, FT.Engine, T_FLOOD_HN + 3 * 86400);
  await tx(as(insurer).declareTotalLoss(vinHash(V.salvage), doc("total-loss", V.salvage, { note: "quyết định bồi thường toàn bộ" })));
  await tx(as(OW.salvageFirst).transfer(vinHash(V.salvage), addrs[insurer], 0, doc("transfer", V.salvage, { note: "chuyển cho bảo hiểm sau bồi thường" })));
  await tx(as(insurer).transfer(vinHash(V.salvage), addrs[OW.salvageBuyer], 0, doc("transfer", V.salvage, { note: "bảo hiểm bán thanh lý" })));

  // ── Xe ngẫu nhiên (xác định) ──
  let seed = 20261101;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 1; vehicles < N; i++) {
    const vin = randomVin(i);
    const ws = rnd(2) ? agentA : garageC;
    const ownerIdx = ownerBase + (i % ownerCount);
    let seal = nextSeal();
    await register(vin, ownerIdx, seal, null, ws);
    const kind = rnd(10); // 0–3 sạch · 4 ngập sàn · 5 ngập máy · 6–7 thủy kích đã sửa · 8 tổn thất toàn bộ · 9 sửa lén
    const when = T_FLOOD_HN + rnd(60) * 86400;
    if (kind <= 3) {
      for (let k = 0, m = 1 + rnd(3); k < m; k++) await inspect(vin, 5000 * (k + 1) + rnd(900), seal);
      continue;
    }
    if (kind <= 5) {
      await flood(vin, kind === 4 ? FT.Floor : FT.Engine, when, rnd(2) ? insurer : ws);
    } else if (kind <= 7 || kind === 9) {
      await flood(vin, FT.Hydrolock, when);
      seal = nextSeal();
      await repaired(vin, seal, ws);
    } else {
      await flood(vin, FT.Engine, when);
      await tx(as(insurer).declareTotalLoss(vinHash(vin), doc("total-loss", vin, { note: "quyết định bồi thường toàn bộ" })));
    }
    if (kind !== 8) await inspect(vin, 20000 + rnd(30000), kind === 9 ? null : seal);
  }

  // ── Một đính chính mẫu: bảo hiểm đề xuất đính chính ghi nhận ngập của xe ngẫu nhiên đầu tiên (nếu có) ──
  const first = randomVin(1);
  const hist = await view.getHistory(vinHash(first));
  const idx = hist.findIndex((r) => Number(r.kind) === 1 && r.actor === addrs[insurer]);
  if (idx >= 0) {
    await tx(as(insurer).proposeAmend(vinHash(first), idx, doc("amendment", first, { note: "đính chính mức độ ngập" })));
    await tx(as(garageC).coSignAmend(0)); // đề xuất đính chính duy nhất của seed → id 0
  }

  console.log(`Seed xong: ${events} giao dịch, ${vehicles} xe.`);
  console.log("Xe minh họa:", Object.entries(V).map(([k, v]) => `${k}=${v}`).join(" · "));
}
main().catch((e) => { console.error(e); process.exit(1); });

// Dữ liệu mẫu theo proposal: xe cho tình huống A/B/C, xe sửa lén, xe tem không khớp, rồi xe ngẫu nhiên (xác định).
//   node scripts/seed.js          → 20 xe
//   node scripts/seed.js 500      → 500 xe (~3.000 sự kiện, mục 8a của proposal)
const { connect, ACC, vinHash, serial, evidence, wait, nowSec } = require("./lib");

const FT = { Floor: 0, Engine: 1, Hydrolock: 2 };
const T_FLOOD_HN = Math.floor(Date.UTC(2025, 9, 2) / 1000); // 02/10/2025 – ngập Hà Nội
const N = Number(process.argv[2] || process.env.SEED_VEHICLES || 20);

async function main() {
  const { as, addrs, view } = await connect();
  if ((await view.getVehicle(vinHash("123"))).exists) {
    console.log("Đã có dữ liệu mẫu trên chuỗi này. Tắt hardhat node, bật lại, chạy deploy rồi seed lại.");
    return;
  }
  const { agentA, garageC, insurer, inspector, ownerBase, ownerCount } = ACC;
  const owner = (i) => ownerBase + (i % ownerCount);
  let events = 0, vehicles = 0;
  const tx = async (p) => { await wait(p); events++; };

  // ── Hội đồng phát hành lô số tem (T-004500 trở đi; T-004512 dành riêng cho xe 123 như trong proposal) ──
  const seals = [];
  const need = N * 3 + 60;
  for (let i = 0; i < need; i++) seals.push(`T-${String(4500 + i).padStart(6, "0")}`);
  for (let i = 0; i < seals.length; i += 150) {
    await wait(as(ACC.council[0]).issueSeals(seals.slice(i, i + 150).map(serial)));
  }
  let cursor = 0;
  const nextSeal = () => { while (seals[cursor] === "T-004512") cursor++; return seals[cursor++]; };

  const doc = (kind, vin, extra = {}) => evidence(kind, { vin, ...extra });
  const register = async (vin, ownerIdx, ws = agentA) => {
    const s = nextSeal();
    await tx(as(ws).registerVehicle(vinHash(vin), addrs[owner(ownerIdx)], serial(s), doc("registration", vin, { seal: s })));
    vehicles++;
    return s;
  };
  const flood = (vin, type, when, by = insurer) =>
    tx(as(by).reportFlood(vinHash(vin), type, when, doc("flood-report", vin, { type, note: "biên bản giám định, ảnh vết ngập" })));
  const openSeal = (vin, s, ws = garageC) => tx(as(ws).breakSeal(vinHash(vin), serial(s), doc("seal-break", vin, { seal: s, reason: "mở máy sửa chữa" })));
  const repaired = (vin, newSeal, ws = garageC) =>
    tx(as(ws).repairCompleted(vinHash(vin), newSeal ? serial(newSeal) : "0x" + "0".repeat(64), doc("repair", vin, { newSeal, parts: "xi-lanh, tay biên, lọc gió" })));
  const checkpoint = (vin, km, seen) =>
    tx(as(inspector).inspectionCheckpoint(vinHash(vin), km, seen ? serial(seen) : "0x" + "0".repeat(64), doc("inspection", vin, { km, seen })));

  // ── Tình huống A (người bán trung thực): 123 – thủy kích 02/10/2025, đã sửa tại Gara C, tem hiện tại T-004512 ──
  let s = await register("123", 0);
  await flood("123", FT.Hydrolock, T_FLOOD_HN);
  await openSeal("123", s);
  await repaired("123", "T-004512");
  await checkpoint("123", 31200, "T-004512");

  // ── Tình huống B: abc – xe sạch có hồ sơ liên tục; chủ xe sẽ khai báo ngập trong scenarios ──
  s = await register("abc", 1);
  await checkpoint("abc", 15000, s);

  // ── Tình huống C: wty-001 – giao xe kèm bảo hành 180 ngày, tem khớp lúc giao ──
  s = await register("wty-001", 2);
  await checkpoint("wty-001", 120, s);
  await tx(as(agentA).handover(vinHash("wty-001"), addrs[owner(6)], 180, doc("handover", "wty-001", { warrantyDays: 180, seal: s })));

  // ── Sửa lén (T5): thủy kích, sửa có ghi nhận; sau đó chủ xe mở máy ngoài hệ thống, bóc tem; đăng kiểm thấy mất tem ──
  s = await register("gap-001", 3);
  await flood("gap-001", FT.Hydrolock, T_FLOOD_HN + 86400);
  await openSeal("gap-001", s);
  const s2 = nextSeal();
  await repaired("gap-001", s2);
  await checkpoint("gap-001", 40000, null); // không thấy tem → cờ "mở máy không ghi nhận"

  // ── Tem lạ: hồ sơ sạch, tem trên chuỗi khác với thứ người bán dán (scenarios nhập sê-ri lạ) ──
  s = await register("seal-001", 4);
  await checkpoint("seal-001", 8000, s);

  // ── Khai báo chưa xử lý: yêu cầu mở nhưng không bật cờ ──
  s = await register("req-001", 5);
  await tx(as(owner(5)).ownerReport(vinHash("req-001"), 40, 20, false, await nowSec(), doc("owner-report", "req-001", { depthCm: 40, soakMin: 20, stalled: false })));

  // ── Xe ngẫu nhiên ──
  let seed = 20261101;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 1; vehicles < N; i++) {
    const vin = `VN${String(i).padStart(6, "0")}`;
    const ws = rnd(2) ? agentA : garageC;
    let seal = await register(vin, i, ws);
    const kind = rnd(10); // 0–3 sạch · 4 ngập sàn · 5 ngập máy · 6–7 thủy kích đã sửa · 8 tổn thất toàn bộ · 9 sửa lén
    const when = T_FLOOD_HN + rnd(60) * 86400;
    if (kind <= 3) {
      for (let k = 0, m = 1 + rnd(3); k < m; k++) await checkpoint(vin, 5000 * (k + 1) + rnd(900), seal);
    } else if (kind <= 5) {
      await flood(vin, kind === 4 ? FT.Floor : FT.Engine, when, rnd(2) ? insurer : ws);
      await checkpoint(vin, 20000 + rnd(5000), seal);
    } else if (kind <= 7) {
      await flood(vin, FT.Hydrolock, when);
      await openSeal(vin, seal, ws);
      seal = nextSeal();
      await repaired(vin, seal, ws);
      await checkpoint(vin, 30000 + rnd(9000), seal);
    } else if (kind === 8) {
      await flood(vin, FT.Engine, when);
      await tx(as(insurer).declareTotalLoss(vinHash(vin), doc("total-loss", vin, { note: "quyết định bồi thường toàn bộ" })));
    } else {
      await flood(vin, FT.Hydrolock, when);
      await openSeal(vin, seal, ws);
      seal = nextSeal();
      await repaired(vin, seal, ws);
      await checkpoint(vin, 45000 + rnd(9000), null);
    }
  }

  // ── Một đính chính mẫu: Insurer đề xuất đính chính ghi nhận ngập của VN000001 nếu có, bên khác ký ──
  const first = "VN000001";
  const hist = await view.getHistory(vinHash(first));
  const idx = hist.findIndex((r) => Number(r.kind) === 3 && r.actor === addrs[insurer]);
  if (idx >= 0) {
    await tx(as(insurer).proposeAmend(vinHash(first), idx, doc("amendment", first, { note: "đính chính mức độ ngập" })));
    await tx(as(garageC).coSignAmend(0)); // đề xuất đính chính duy nhất của seed → id 0
  }

  console.log(`Seed xong: ${events} giao dịch, ${vehicles} xe, ${seals.length} số tem phát hành.`);
  console.log("Xe mẫu: 123 (A, trung thực) · abc (B) · wty-001 (C) · gap-001 (sửa lén) · seal-001 (tem lạ) · req-001 (yêu cầu mở)");
}
main().catch((e) => { console.error(e); process.exit(1); });

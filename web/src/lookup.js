// Đọc hồ sơ một VIN từ hợp đồng (chỉ đọc, không cần ví). Thuần ESM, nhận contract từ ngoài để test được bằng node.
import { id } from "ethers";
import { normalizeVin, isValidVin, VIN_RULE } from "@shared/status.mjs";

/** VIN chuẩn hóa → vinHash. Ném lỗi (tiếng Việt) nếu VIN sai định dạng — mọi form ghi đều đi qua đây. */
export const vinHashOf = (vin) => {
  if (!isValidVin(vin)) throw new Error(VIN_RULE);
  return id(normalizeVin(vin));
};
// Số tem / số máy: bỏ khoảng trắng, in hoa (nhập tay dễ lệch chữ hoa/thường).
const tidy = (t) => String(t).replace(/\s+/g, "").toUpperCase();
export const sealHashOf = (text) => id("seal:" + tidy(text));
export const engineHashOf = (text) => id("engine:" + tidy(text));

export async function loadHistory(contract, vin) {
  const k = vinHashOf(vin);
  const [v, recs] = await Promise.all([contract.getVehicle(k), contract.getHistory(k)]);
  const vehicle = {
    exists: v.exists, owner: v.owner, flood: v.flood, hydrolock: v.hydrolock, totalLoss: v.totalLoss,
    unrecordedOpening: v.unrecordedOpening, openRequest: Number(v.openRequest), currentSeal: v.currentSeal,
    handoverAt: Number(v.handoverAt), warrantyDays: Number(v.warrantyDays), sealAtHandover: v.sealAtHandover,
    engineHash: v.engineHash,
  };
  const records = recs.map((r) => ({
    kind: Number(r.kind), actor: r.actor, occurredAt: Number(r.occurredAt), recordedAt: Number(r.recordedAt),
    sub: Number(r.sub), dataHash: r.dataHash, ref: r.ref, num: Number(r.num),
  }));
  const amended = (await Promise.all(records.map((_, i) => contract.isAmended(k, i))))
    .map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
  // vai trò của từng bên ghi (để hiện "Workshop 0x…" thay vì chỉ địa chỉ)
  const actors = [...new Set(records.map((r) => r.actor))];
  const roles = Object.fromEntries(await Promise.all(actors.map(async (a) => [a, Number(await contract.roles(a))])));
  return { vehicle, records, amended, roles };
}

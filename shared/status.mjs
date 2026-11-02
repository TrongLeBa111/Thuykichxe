// Logic hiển thị dùng chung cho web và script (tính từ dữ liệu chuỗi). Theo proposal mục 5.3.
export const ZERO = "0x" + "0".repeat(64);
export const Role = { None: 0, Council: 1, Workshop: 2, Insurer: 3, Inspector: 4 };
export const Kind = { Registered: 0, SealApplied: 1, SealBroken: 2, Flood: 3, Repair: 4, TotalLoss: 5, Inspection: 6, Handover: 7, OwnerReport: 8, Resolution: 9, WarrantyClaim: 10, Amendment: 11 };
export const FloodType = { Floor: 0, Engine: 1, Hydrolock: 2 };
export const Conclusion = { NoFlood: 0, Floor: 1, Engine: 2, Hydrolock: 3 };
export const Level = { None: 0, Watch: 1, Inspect: 2, Urgent: 3 };

export const ROLE_LABEL = ["—", "Hội đồng", "Workshop", "Insurer", "Inspector"];
export const KIND_LABEL = [
  "Đăng ký xe", "Đặt tem", "Phá tem", "Ghi nhận ngập", "Sửa xong", "Tổn thất toàn bộ",
  "Mốc kiểm định", "Giao xe", "Khai báo của chủ xe", "Workshop đóng yêu cầu", "Yêu cầu bảo hành", "Đính chính",
];
export const FLOOD_LABEL = ["ngập sàn", "ngập máy", "thủy kích"];
export const CONCLUSION_LABEL = ["không ngập", "ngập sàn", "ngập máy", "thủy kích"];
export const LEVEL_LABEL = ["—", "Mức 1 – Theo dõi", "Mức 2 – Cần kiểm tra tại gara", "Mức 3 – Không khởi động lại, gọi cứu hộ"];
export const LEVEL_ADVICE = [
  "",
  "Theo dõi xe vài ngày: chú ý tiếng máy, khói, đèn báo lỗi.",
  "Đưa xe vào gara kiểm tra sớm; chưa nên chạy đường dài.",
  "KHÔNG khởi động lại động cơ. Gọi cứu hộ kéo xe về gara.",
];

export const VERDICT = {
  flagged: { label: "Có ghi nhận ngập, thủy kích", advice: "Xem chi tiết sửa chữa, mặc cả giá.", tone: "bad" },
  continuous: { label: "Không có ghi nhận, hồ sơ liên tục", advice: "Tin mức cao hơn, vẫn nên lái thử.", tone: "ok" },
  gap: { label: "Có khoảng trống", advice: "Mang xe ra gara kiểm tra như hiện nay.", tone: "warn" },
  pending: { label: "Chưa đủ căn cứ để kết luận", advice: "Ra xe đọc số tem trên máy và nhập vào để đối chiếu.", tone: "neutral" },
};
export const NO_RECORD_NOTE = "Hệ thống không phán xử và không biết những lần sửa không ai ghi. “Không có ghi nhận” không có nghĩa là xe chưa từng ngập.";

export const ERROR_VI = {
  NotCouncil: "Chỉ thành viên hội đồng mới thực hiện được.",
  NotWorkshop: "Chỉ Workshop được cấp quyền mới thực hiện được.",
  NotInsurer: "Chỉ Insurer được cấp quyền mới thực hiện được.",
  NotInspector: "Chỉ Inspector được cấp quyền mới thực hiện được.",
  NotInsurerOrWorkshop: "Chỉ Insurer hoặc Workshop mới ghi nhận ngập.",
  NotVehicleOwner: "Chỉ chủ xe hiện tại mới thực hiện được.",
  NotMember: "Địa chỉ này không phải thành viên.",
  AlreadyMember: "Địa chỉ này đã có vai trò.",
  CannotRemoveLastCouncil: "Không thể bỏ thành viên hội đồng cuối cùng.",
  InvalidRole: "Vai trò không hợp lệ.",
  InvalidThreshold: "Ngưỡng phải lớn hơn 0.",
  ProposalClosed: "Đề xuất đã được thực hiện.",
  AlreadyVoted: "Bạn đã bỏ phiếu cho đề xuất này.",
  EmptyInput: "Thiếu dữ liệu bắt buộc.",
  VehicleExists: "Mã xe này đã được đăng ký.",
  VehicleNotFound: "Xe chưa đăng ký trong hệ thống.",
  SealNotAvailable: "Số tem chưa được hội đồng phát hành hoặc đã dùng.",
  SealAlreadyOnVehicle: "Xe đang có tem; phải phá tem cũ trước.",
  WrongSeal: "Tem này không phải tem đang gắn trên xe này.",
  FutureTime: "Thời điểm xảy ra không được ở tương lai.",
  NoFloodFlag: "Xe chưa có ghi nhận ngập nên chưa có gì để “sửa xong”.",
  NoOpenRequest: "Không có yêu cầu kiểm tra nào đang mở.",
  NoHandover: "Xe chưa có biên bản giao xe.",
  WarrantyExpired: "Đã quá thời hạn bảo hành.",
  BadRecordIndex: "Không có sự kiện với chỉ số này.",
  NotOriginalActor: "Chỉ bên ghi gốc mới đề xuất đính chính.",
  NeedOtherMember: "Cần một thành viên khác với bên ghi gốc ký.",
  AlreadyAmended: "Sự kiện này đã được đính chính.",
  AmendClosed: "Đề xuất đính chính đã hoàn tất.",
};

export function explainError(e) {
  const name = e?.revert?.name || e?.errorName
    || Object.keys(ERROR_VI).find((n) => String(e?.message || e).includes(n));
  if (name && ERROR_VI[name]) return ERROR_VI[name];
  return e?.shortMessage || e?.message || String(e);
}

/**
 * @param vehicle  getVehicle đã chuẩn hóa số
 * @param records  getHistory; @param amended mảng chỉ số đã bị đính chính
 * @param seenSerial  undefined = chưa đối chiếu; ZERO = trên máy không có tem; còn lại = số tem đọc được
 */
export function computeStatus({ vehicle, records, amended = [], seenSerial }) {
  if (!vehicle.exists) {
    return { verdict: "gap", ...VERDICT.gap, reasons: ["Xe chưa từng được đăng ký vào hệ thống."], flags: [], details: [], note: NO_RECORD_NOTE };
  }
  const flags = [];
  if (vehicle.flood) flags.push("Đã ghi nhận ngập");
  if (vehicle.hydrolock) flags.push("Đã ghi nhận thủy kích");
  if (vehicle.totalLoss) flags.push("Tổn thất toàn bộ");
  if (vehicle.unrecordedOpening) flags.push("Mở máy không ghi nhận");

  const seenChecked = seenSerial !== undefined;
  const sealMatch = seenChecked && vehicle.currentSeal !== ZERO && seenSerial === vehicle.currentSeal;
  const hasInspection = records.some((r) => r.kind === Kind.Inspection);

  const reasons = [];
  if (vehicle.unrecordedOpening) reasons.push("Mốc kiểm định từng thấy tem không khớp hồ sơ.");
  if (seenChecked && !sealMatch) {
    reasons.push(seenSerial === ZERO ? "Trên máy không có tem." : "Số tem trên máy KHÔNG khớp tem cuối trên chuỗi.");
  }
  if (!seenChecked) reasons.push("Chưa đối chiếu số tem trên máy.");
  if (!hasInspection) reasons.push("Chưa có mốc kiểm định nào.");

  const anyFlag = vehicle.flood || vehicle.hydrolock || vehicle.totalLoss;
  const gap = vehicle.unrecordedOpening || (seenChecked && !sealMatch);
  let verdict;
  if (anyFlag) verdict = "flagged";
  else if (gap) verdict = "gap";
  else if (vehicle.openRequest > 0) { verdict = "pending"; reasons.push("Chủ xe đã khai báo ngập, đang chờ gara kiểm tra."); }
  else if (seenChecked && sealMatch && hasInspection) verdict = "continuous";
  else verdict = "pending";

  // Chi tiết: sửa ở đâu, yêu cầu mở, thời điểm giao xe
  const details = [];
  if (vehicle.openRequest > 0) details.push(`Chủ xe đã khai báo ngập (${LEVEL_LABEL[vehicle.openRequest]}), đang chờ gara kiểm tra.`);
  if (amended.length) details.push(`${amended.length} sự kiện đã được đính chính (vẫn còn trong lịch sử).`);

  return { verdict, ...VERDICT[verdict], reasons, flags, details, note: NO_RECORD_NOTE };
}

/** Đọc hồ sơ theo mốc giao xe (tình huống C): trả về nhóm trước/sau và gợi ý theo bảng mục 5.3. */
export function warrantyView({ vehicle, records }) {
  const at = vehicle.handoverAt;
  if (!at) return null;
  const before = records.filter((r) => r.recordedAt <= at);
  const after = records.filter((r) => r.recordedAt > at);
  const hints = [];
  const floodBefore = before.some((r) => r.kind === Kind.Flood);
  const floodAfter = after.some((r) => r.kind === Kind.Flood || r.kind === Kind.OwnerReport);
  const sealNow = vehicle.currentSeal;
  if (floodBefore) hints.push("Trước ngày giao đã có ghi nhận ngập; đối chiếu biên bản giao xem có nêu không.");
  else if (floodAfter) hints.push("Lúc giao không có cờ; có ngập/khai báo mới sau ngày giao → thủy kích mới sau khi mua.");
  if (vehicle.sealAtHandover !== sealNow) hints.push("Tem hiện tại khác tem lúc giao → có thay/phá tem sau giao xe (xem sự kiện).");
  return { before, after, hints };
}

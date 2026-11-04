// Logic hiển thị dùng chung cho web và script (tính từ dữ liệu chuỗi). Theo proposal mục 5.3.
export const ZERO = "0x" + "0".repeat(64);
export const Role = { None: 0, Council: 1, Attester: 2 };
export const Kind = { Registered: 0, Flood: 1, Repair: 2, TotalLoss: 3, Inspection: 4, SealChange: 5, EngineChange: 6, Transfer: 7, OwnerReport: 8, WarrantyClaim: 9, Amendment: 10 };
export const SealReason = { Maintenance: 0, NonFloodRepair: 1, FloodRepair: 2, EngineReplacement: 3, Unrecorded: 4 };
export const FloodType = { Floor: 0, Engine: 1, Hydrolock: 2 };
export const Conclusion = { NotAssessed: 0, NoFlood: 1, Floor: 2, Engine: 3, Hydrolock: 4 };
export const Level = { None: 0, Watch: 1, Inspect: 2, Urgent: 3 };

export const ROLE_LABEL = ["—", "Hội đồng", "Đơn vị xác nhận"];
export const KIND_LABEL = [
  "Đăng ký xe", "Ghi nhận ngập", "Sửa xong", "Tổn thất toàn bộ", "Kiểm tra xe", "Thay tem niêm phong",
  "Thay động cơ", "Chuyển chủ", "Khai báo của chủ xe", "Yêu cầu bảo hành", "Đính chính",
];
export const SEAL_LABEL = ["bảo dưỡng định kỳ", "sửa không liên quan ngập", "sửa do ngập / thủy kích", "thay động cơ", "đã bị mở ngoài hệ thống"];
// Inspection.sub = kết luận (4 bit thấp) + 0x10 nếu tem đọc được không khớp hồ sơ
export const inspectConclusion = (sub) => sub & 0x0f;
export const inspectMismatch = (sub) => (sub & 0x10) !== 0;

// ── Số khung (VIN): 17 ký tự, chữ in hoa và số, không có I, O, Q (dễ nhầm với 1 và 0).
// Không kiểm chữ số kiểm tra ở vị trí 9 vì chỉ bắt buộc ở một số thị trường.
export const VIN_RULE = "Số khung (VIN) phải có đúng 17 ký tự, gồm chữ in hoa và số, không có chữ I, O, Q.";
export const normalizeVin = (v) => String(v ?? "").replace(/[\s-]/g, "").toUpperCase();
export const isValidVin = (v) => /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(v));

export const FLOOD_LABEL = ["ngập sàn", "ngập máy", "thủy kích"];
export const CONCLUSION_LABEL = ["chưa kết luận", "không có dấu hiệu ngập", "ngập sàn", "ngập máy", "thủy kích"];
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
  NotAttester: "Chỉ đơn vị xác nhận được cấp quyền mới thực hiện được.",
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
  SealAlreadyUsed: "Số tem này đã được dùng cho một xe; mỗi số tem chỉ dùng một lần.",
  FutureTime: "Thời điểm xảy ra không được ở tương lai.",
  NoFloodFlag: "Xe chưa có ghi nhận ngập nên chưa có gì để “sửa xong”.",
  NoHandover: "Xe chưa từng chuyển chủ nên chưa có bảo hành.",
  WarrantyExpired: "Đã quá thời hạn bảo hành.",
  BadRecordIndex: "Không có sự kiện với chỉ số này.",
  NotOriginalActor: "Chỉ bên ghi gốc mới đề xuất đính chính.",
  NeedOtherMember: "Cần một thành viên khác với bên ghi gốc ký.",
  AlreadyAmended: "Sự kiện này đã được đính chính.",
  AmendClosed: "Đề xuất đính chính đã hoàn tất.",
  InvalidReason: "Lý do đổi tem không hợp lệ.",
  SameOwner: "Chủ mới trùng chủ hiện tại.",
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
  const since = records.length ? records[0].recordedAt : 0;
  const day = (ts) => new Date(ts * 1000).toLocaleDateString("vi-VN");
  // Lần mở máy ngoài hệ thống: còn "hở" nếu có lần kiểm tra thấy tem lệch mà chưa có kết luận,
  // và chưa có lần kiểm tra nào sau đó (hoặc cùng lần) kết luận về xe.
  let gapOpen = false, recheckRec = null;
  for (const r of records) {
    if (r.kind !== Kind.Inspection) continue;
    if (inspectConclusion(r.sub) !== Conclusion.NotAssessed) { if (gapOpen || inspectMismatch(r.sub)) recheckRec = r; gapOpen = false; }
    else if (inspectMismatch(r.sub)) gapOpen = true;
  }
  const rechecked = vehicle.unrecordedOpening && !gapOpen && !!recheckRec;

  const reasons = [];
  if (vehicle.unrecordedOpening && !rechecked) reasons.push("Máy từng được mở ngoài hệ thống và chưa được gara thành viên kiểm tra lại.");
  if (rechecked) {
    reasons.push(`Máy từng được mở ngoài hệ thống; đã được kiểm tra lại ngày ${day(recheckRec.recordedAt)}, kết luận: ${CONCLUSION_LABEL[inspectConclusion(recheckRec.sub)]}.`);
  }
  if (seenChecked && !sealMatch) {
    reasons.push(seenSerial === ZERO ? "Trên máy không có tem." : "Số tem trên máy KHÔNG khớp tem cuối trên chuỗi.");
  }
  if (!seenChecked) reasons.push("Chưa đối chiếu số tem trên máy.");
  if (!hasInspection) reasons.push("Chưa có mốc kiểm định nào.");

  const anyFlag = vehicle.flood || vehicle.hydrolock || vehicle.totalLoss;
  const gap = (vehicle.unrecordedOpening && !rechecked) || (seenChecked && !sealMatch);
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

  const engines = records.filter((r) => r.kind === Kind.EngineChange);
  if (engines.length) details.push(`Đã thay động cơ ${engines.length} lần, gần nhất ngày ${day(engines[engines.length - 1].recordedAt)}.`);
  if (since) details.push(`Hồ sơ bắt đầu từ ngày ${day(since)}; hệ thống không có dữ liệu trước ngày này.`);
  return { verdict, ...VERDICT[verdict], reasons, flags, details, since, rechecked, note: NO_RECORD_NOTE };
}

/** Đọc hồ sơ theo mốc chuyển chủ gần nhất (để đối chiếu bảo hành): trả về nhóm trước/sau và gợi ý. */
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

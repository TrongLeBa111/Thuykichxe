// Dữ liệu minh họa dùng chung cho seed, scenarios và ngăn 🧪 trên web.
// VIN giả đủ 17 ký tự, không chứa I, O, Q. Tiền tố RLXDEM để dễ nhận ra là dữ liệu demo.
export const DEMO_VINS = {
  honest: "RLXDEMA0000000123",   // từng thủy kích, đã sửa tại gara và ghi đủ
  clean: "RLXDEMB0000000ABC",    // xe sạch, hồ sơ liên tục
  warranty: "RLXDEMC0000WTY001", // đại lý bán kèm bảo hành 180 ngày
  gap: "RLXDEMD0000GAP001",      // sửa xong rồi bị mở máy ngoài hệ thống, đăng kiểm thấy mất tem
  fakeSeal: "RLXDEME000SEAL001", // hồ sơ sạch, dùng để thử tem lạ
  pending: "RLXDEMF0000REP001",  // chủ xe đã khai báo ngập, chờ gara kiểm tra
  recheck: "RLXDEMH000RECHK01",  // mở máy ngoài hệ thống, sau đó được gara kiểm tra lại và dán tem mới
  engine: "RLXDEMJ0000ENG001",  // thủy kích rồi thay động cơ
  salvage: "RLXDEMK0000SLV001", // tổn thất toàn bộ, bảo hiểm thu hồi rồi bán lại
  unknown: "RLXDEMZ9999999999",  // đúng định dạng nhưng chưa đăng ký
};

// Số tem gắn cho các xe trên (seed dùng đúng các số này).
export const DEMO_SEALS = {
  honestFirst: "T-004500", honest: "T-004512",
  clean: "T-004501",
  warranty: "T-004502",
  gapFirst: "T-004503", gap: "T-004504",
  fakeSeal: "T-004505",
  pending: "T-004506",
  recheckFirst: "T-004509", recheck: "T-004510",
  engineFirst: "T-004513", engine: "T-004514",
  salvage: "T-004515",
};

// Chỉ số tài khoản Hardhat của chủ xe từng xe minh họa (4 = đại lý A, 6 = công ty bảo hiểm B).
export const DEMO_OWNERS = {
  honest: 8, clean: 9, warrantySeller: 4, warrantyBuyer: 14, gap: 11,
  fakeSeal: 12, pending: 13, recheck: 16, engine: 17, salvageFirst: 18, salvageBuyer: 19,
};

export const randomVin = (i) => `RLXDEMR${String(i).padStart(10, "0")}`;
export const webTestVin = (i) => `RLXDEMW${String(i).padStart(10, "0")}`;

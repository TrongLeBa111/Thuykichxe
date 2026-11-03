// Dữ liệu minh họa dùng chung cho seed, scenarios và ngăn 🧪 trên web.
// VIN giả đủ 17 ký tự, không chứa I, O, Q. Tiền tố RLXDEM để dễ nhận ra là dữ liệu demo.
export const DEMO_VINS = {
  honest: "RLXDEMA0000000123",   // tình huống A: thủy kích 02/10/2025, đã sửa tại Gara C
  clean: "RLXDEMB0000000ABC",    // tình huống B: xe sạch, chủ xe sẽ khai báo
  warranty: "RLXDEMC0000WTY001", // tình huống C: giao xe kèm bảo hành 180 ngày
  gap: "RLXDEMD0000GAP001",      // sửa lén: kiểm định thấy mất tem
  fakeSeal: "RLXDEME000SEAL001", // hồ sơ sạch, dùng để thử tem lạ
  pending: "RLXDEMF0000REP001",  // chủ xe đã khai báo, chờ gara
  paper: "RLXDEMG0000PAPER1",    // tiếp nhận bằng phiếu giấy (chủ xe không có ví)
  recheck: "RLXDEMH000RECHK01",  // mở máy ngoài hệ thống, đã được kiểm tra lại và niêm phong
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
  paperFirst: "T-004507", paper: "T-004508",
  recheckFirst: "T-004509", recheck: "T-004510",
};

// Chỉ số tài khoản Hardhat của chủ xe từng xe minh họa.
export const DEMO_OWNERS = {
  honest: 8, clean: 9, warrantySeller: 10, warrantyBuyer: 14, gap: 11,
  fakeSeal: 12, pending: 13, paper: 15, recheck: 16,
};

export const randomVin = (i) => `RLXDEMR${String(i).padStart(10, "0")}`;
export const webTestVin = (i) => `RLXDEMW${String(i).padStart(10, "0")}`;

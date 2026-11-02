// Dữ liệu minh họa để chạy thử (khớp scripts/seed.js). Không thuộc giao diện chính; chỉ hiện trong ngăn 🧪.
export const DEMO = [
  {
    vin: "123", title: "Xe cũ từng thủy kích, đã sửa",
    about: "Thủy kích ngày 02/10/2025, đã sửa tại Gara độc lập C, có kiểm định. Hồ sơ liên tục.",
    tests: [
      { label: "Nhập đúng số tem", seal: "T-004512", expect: "Báo khớp tem" },
      { label: "Nhập số tem lạ", seal: "T-000000", expect: "Báo không khớp tem" },
    ],
  },
  {
    vin: "abc", title: "Xe sạch, hồ sơ liên tục",
    about: "Không có ghi nhận ngập, có mốc kiểm định.",
    tests: [{ label: "Nhập đúng số tem", seal: "T-004501", expect: "Không có ghi nhận, hồ sơ liên tục" }],
    owner: { index: 9, label: "Chủ xe khai báo ngập (tài khoản #9)", expect: "Mức khuyến nghị 1–3 theo độ ngập, thời gian ngâm, chết máy" },
  },
  {
    vin: "wty-001", title: "Xe mới giao, bảo hành 180 ngày",
    about: "Có biên bản giao xe, tem lúc giao trùng tem hiện tại.",
    tests: [{ label: "Nhập đúng số tem", seal: "T-004502", expect: "Hiện mục theo ngày giao xe" }],
    owner: { index: 14, label: "Chủ xe gửi yêu cầu bảo hành (tài khoản #14)", expect: "Hiện còn hạn bảo hành" },
  },
  {
    vin: "gap-001", title: "Có dấu hiệu sửa máy ngoài hệ thống",
    about: "Từng thủy kích, sửa có ghi nhận; sau đó kiểm định thấy mất tem.",
    tests: [{ label: "Trên máy không có tem", noSeal: true, expect: "Cảnh báo tem không khớp" }],
  },
  {
    vin: "seal-001", title: "Hồ sơ sạch, thử tem giả",
    about: "Không có ghi nhận ngập, có kiểm định.",
    tests: [
      { label: "Nhập đúng số tem", seal: "T-004505", expect: "Hồ sơ liên tục" },
      { label: "Nhập số tem lạ", seal: "T-FAKE-0001", expect: "Có khoảng trống" },
    ],
  },
  {
    vin: "req-001", title: "Chủ xe vừa khai báo, chờ gara",
    about: "Đang có khai báo ngập chưa được gara kiểm tra.",
    tests: [{ label: "Tra cứu", expect: "Chưa đủ căn cứ để kết luận" }],
    owner: { index: 13, label: "Xem trang chủ xe (tài khoản #13)", expect: "Hiện khai báo đang chờ" },
  },
  {
    vin: "khong-co-xe", title: "Mã xe chưa đăng ký",
    about: "Không có hồ sơ trong hệ thống.",
    tests: [{ label: "Tra cứu", expect: "Có khoảng trống" }],
  },
];

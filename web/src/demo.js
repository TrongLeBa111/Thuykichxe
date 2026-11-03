// Dữ liệu minh họa để chạy thử (khớp scripts/seed.js qua shared/demo.mjs). Chỉ hiện trong ngăn 🧪.
import { DEMO_VINS as V, DEMO_SEALS as S, DEMO_OWNERS as O } from "@shared/demo.mjs";

export const DEMO = [
  {
    vin: V.honest, title: "Xe cũ từng thủy kích, đã sửa",
    about: "Thủy kích ngày 02/10/2025; chủ xe ký cho Gara độc lập C tiếp nhận, sửa và đặt tem mới; có kiểm định.",
    tests: [
      { label: "Nhập đúng số tem", seal: S.honest, expect: "Báo khớp tem" },
      { label: "Nhập số tem lạ", seal: "T-000000", expect: "Báo không khớp tem" },
    ],
  },
  {
    vin: V.clean, title: "Xe sạch, hồ sơ liên tục",
    about: "Không có ghi nhận ngập, có mốc kiểm định.",
    tests: [{ label: "Nhập đúng số tem", seal: S.clean, expect: "Không có ghi nhận, hồ sơ liên tục" }],
    owner: { index: O.clean, label: `Chủ xe khai báo ngập, cho gara tiếp nhận (tài khoản #${O.clean})`, expect: "Mức khuyến nghị 1–3; sau đó chọn gara tiếp nhận" },
  },
  {
    vin: V.warranty, title: "Xe mới giao, bảo hành 180 ngày",
    about: "Có biên bản giao xe, tem lúc giao trùng tem hiện tại.",
    tests: [{ label: "Nhập đúng số tem", seal: S.warranty, expect: "Hiện mục theo ngày giao xe" }],
    owner: { index: O.warrantyBuyer, label: `Chủ xe gửi yêu cầu bảo hành (tài khoản #${O.warrantyBuyer})`, expect: "Hiện còn hạn bảo hành" },
  },
  {
    vin: V.gap, title: "Máy bị mở ngoài hệ thống, chưa kiểm tra lại",
    about: "Từng thủy kích, sửa có ghi nhận; sau đó kiểm định thấy mất tem.",
    tests: [{ label: "Trên máy không có tem", noSeal: true, expect: "Cảnh báo máy từng được mở ngoài hệ thống" }],
  },
  {
    vin: V.recheck, title: "Mở máy ngoài hệ thống, đã kiểm tra lại",
    about: "Chủ xe thay gioăng ở gara ngoài; kiểm định thấy mất tem; Gara C kiểm tra lại, kết luận không ngập, niêm phong tem mới.",
    tests: [{ label: "Nhập đúng số tem mới", seal: S.recheck, expect: "Hồ sơ liên tục, kèm dòng đã kiểm tra lại" }],
  },
  {
    vin: V.paper, title: "Tiếp nhận bằng phiếu giấy",
    about: "Chủ xe không có ví: Gara C lập phiếu giấy, Đại lý A xác nhận; bảo dưỡng định kỳ, đặt tem mới.",
    tests: [{ label: "Nhập đúng số tem", seal: S.paper, expect: "Hồ sơ liên tục; lý do phá tem: bảo dưỡng" }],
  },
  {
    vin: V.fakeSeal, title: "Hồ sơ sạch, thử tem giả",
    about: "Không có ghi nhận ngập, có kiểm định.",
    tests: [
      { label: "Nhập đúng số tem", seal: S.fakeSeal, expect: "Hồ sơ liên tục" },
      { label: "Nhập số tem lạ", seal: "T-FAKE-0001", expect: "Có khoảng trống" },
    ],
  },
  {
    vin: V.pending, title: "Chủ xe vừa khai báo, chờ gara",
    about: "Đang có khai báo ngập chưa được gara kiểm tra.",
    tests: [{ label: "Tra cứu", expect: "Chưa đủ căn cứ để kết luận" }],
    owner: { index: O.pending, label: `Xem trang chủ xe (tài khoản #${O.pending})`, expect: "Hiện khai báo đang chờ" },
  },
  {
    vin: V.unknown, title: "Số khung chưa đăng ký",
    about: "Đúng định dạng VIN nhưng không có hồ sơ.",
    tests: [{ label: "Tra cứu", expect: "Có khoảng trống" }],
  },
];

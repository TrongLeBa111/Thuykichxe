// Dữ liệu minh họa để chạy thử (khớp scripts/seed.js qua shared/demo.mjs). Chỉ hiện trong ngăn 🧪.
import { DEMO_VINS as V, DEMO_SEALS as S, DEMO_OWNERS as O } from "@shared/demo.mjs";

export const DEMO = [
  {
    vin: V.honest, title: "Xe cũ từng thủy kích, đã sửa",
    about: "Thủy kích ngày 02/10/2025, bảo hiểm ghi nhận; Gara độc lập C sửa và dán tem mới; có kiểm tra gần nhất.",
    tests: [
      { label: "Nhập đúng số tem", seal: S.honest, expect: "Báo khớp tem" },
      { label: "Nhập số tem lạ", seal: "T-000000", expect: "Báo không khớp tem" },
    ],
  },
  {
    vin: V.clean, title: "Xe sạch, hồ sơ liên tục",
    about: "Không có ghi nhận ngập, có mốc kiểm tra.",
    tests: [{ label: "Nhập đúng số tem", seal: S.clean, expect: "Không có ghi nhận, hồ sơ liên tục" }],
    owner: { index: O.clean, label: `Chủ xe khai báo ngập (tài khoản #${O.clean})`, expect: "Mức khuyến nghị 1–3" },
  },
  {
    vin: V.warranty, title: "Đại lý bán xe kèm bảo hành 180 ngày",
    about: "Đại lý A chuyển chủ cho khách, kèm bảo hành; tem lúc chuyển trùng tem hiện tại.",
    tests: [{ label: "Nhập đúng số tem", seal: S.warranty, expect: "Hiện mục theo lần chuyển chủ" }],
    owner: { index: O.warrantyBuyer, label: `Chủ xe gửi yêu cầu bảo hành (tài khoản #${O.warrantyBuyer})`, expect: "Hiện còn hạn bảo hành" },
  },
  {
    vin: V.gap, title: "Máy bị mở ngoài hệ thống, chưa kiểm tra lại",
    about: "Từng thủy kích, sửa có ghi nhận; sau đó đăng kiểm thấy mất tem.",
    tests: [{ label: "Trên máy không có tem", noSeal: true, expect: "Cảnh báo máy từng được mở ngoài hệ thống" }],
  },
  {
    vin: V.recheck, title: "Mở máy ngoài hệ thống, đã kiểm tra lại",
    about: "Đăng kiểm thấy mất tem; Gara C kiểm tra lại, kết luận không ngập và dán tem mới trong cùng một lần ghi.",
    tests: [{ label: "Nhập đúng số tem mới", seal: S.recheck, expect: "Hồ sơ liên tục, kèm dòng đã kiểm tra lại" }],
  },
  {
    vin: V.engine, title: "Thủy kích rồi thay động cơ",
    about: "Gara C thay động cơ, ghi số máy mới và dán tem mới. Cờ thủy kích vẫn còn.",
    tests: [{ label: "Nhập đúng số tem", seal: S.engine, expect: "Có ghi nhận thủy kích, đã thay động cơ" }],
  },
  {
    vin: V.salvage, title: "Tổn thất toàn bộ, đã thanh lý",
    about: "Bảo hiểm ghi tổn thất, nhận xe từ chủ cũ rồi bán lại; cờ đi theo xe.",
    tests: [{ label: "Nhập đúng số tem", seal: S.salvage, expect: "Có ghi nhận ngập, tổn thất toàn bộ, đã chuyển chủ 2 lần" }],
  },
  {
    vin: V.fakeSeal, title: "Hồ sơ sạch, thử tem giả",
    about: "Không có ghi nhận ngập, có kiểm tra.",
    tests: [
      { label: "Nhập đúng số tem", seal: S.fakeSeal, expect: "Hồ sơ liên tục" },
      { label: "Nhập số tem lạ", seal: "T-FAKE-0001", expect: "Có khoảng trống" },
    ],
  },
  {
    vin: V.pending, title: "Chủ xe vừa khai báo, chờ kiểm tra",
    about: "Đang có khai báo ngập chưa có đơn vị nào kết luận.",
    tests: [{ label: "Tra cứu", expect: "Chưa đủ căn cứ để kết luận" }],
    owner: { index: O.pending, label: `Xem trang chủ xe (tài khoản #${O.pending})`, expect: "Hiện khai báo đang chờ" },
  },
  {
    vin: V.unknown, title: "Số khung chưa đăng ký",
    about: "Đúng định dạng VIN nhưng không có hồ sơ.",
    tests: [{ label: "Tra cứu", expect: "Có khoảng trống" }],
  },
];

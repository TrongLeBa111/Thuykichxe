# flood-chain — Tra cứu lịch sử ngập nước và thủy kích ô tô theo VIN trên blockchain

Prototype môn Blockchain (nhóm: Lê Bá Trọng, Hoàng Thị Diệu Hiền, Đỗ Phúc Khang). Mô hình theo proposal: sổ cái có cấp quyền, nhiều bên ghi là đối thủ, người mua tra theo VIN mà không cần ví. Hệ thống **không phán xử** và **không chẩn đoán** tình trạng máy.

> Trạng thái: **đang triển khai** — hợp đồng, test, dữ liệu mẫu, kịch bản đã xong; web, máy chủ bằng chứng, Besu 4 node, đối chứng database chưa làm.

## Tiến độ

- [x] **Hợp đồng `FloodRecord.sol`** theo proposal (hội đồng 2/3, 4 vai trò ghi, cờ một chiều, tem niêm phong, ownerReport, bảo hành, đính chính)
- [x] **Test Hardhat** — 34 test xanh (vòng sửa 1/3)
- [x] **Dữ liệu mẫu** `seed.js` (20 xe mặc định; `node scripts/seed.js 500` tạo 500 xe)
- [x] **Kịch bản** `scenarios.js` — A, B, C, T1, T4, T5, tem lạ: 22/22 kiểm tra đạt
- [x] Web: trang tra cứu theo VIN (`web/`, chỉ đọc, không cần ví)
- [x] Web: trang Chủ xe (khai báo ngập, bảo hành), Ghi sự kiện (Workshop/Insurer/Inspector, đính chính), Hội đồng (đề xuất, bỏ phiếu 2/3, phát hành tem) — chọn tài khoản Hardhat để mô phỏng ví; kiểm tra tự động trên Edge 22/22
- [ ] Máy chủ bằng chứng (Express + SQLite) và nút kiểm tra hash (`evidence/store.js` đã có phần lưu/hash)
- [ ] Mạng Besu QBFT 4 node bằng Docker (xem `infra/README.md`)
- [ ] Đối chứng A (PostgreSQL + audit log), B (PostgreSQL + ECDSA) và chạy T1–T6
- [ ] Đo gas, thời gian ghi/tra, điền mục [Kết quả](#kết-quả)

## Mô hình

| Vai trò | Quyền |
|---|---|
| Hội đồng | Cấp/thu hồi quyền ghi, đổi ngưỡng — mọi việc cần **≥ 2/3** phiếu; phát hành số tem (mỗi số dùng một lần) |
| Workshop | Đăng ký xe + tem, đặt/phá tem, ghi ngập, sửa xong, giao xe kèm bảo hành, đóng yêu cầu kiểm tra |
| Insurer | Ghi ngập/thủy kích, tổn thất toàn bộ |
| Inspector | Mốc kiểm định (km, số tem đang thấy trên máy) |
| Chủ xe | Khai báo ngập (nhận mức khuyến nghị, **không bật cờ**), yêu cầu bảo hành |
| Người tra | Đọc theo VIN, không cần ví |

- **Khóa xe:** `vinHash = keccak256(VIN.trim().toUpperCase())`. Chuỗi không lưu tên, số điện thoại, biển số. Chủ xe chỉ là một địa chỉ ví.
- **Cờ một chiều:** `flood`, `hydrolock`, `totalLoss`, `unrecordedOpening` chỉ có đường bật. Sửa xong chỉ thêm sự kiện `Repair`. Không có hàm xóa/sửa sự kiện (có test kiểm ABI).
- **Tem niêm phong:** `Issued → Applied → Broken`. `breakSeal` chỉ hợp lệ với tem đang gắn trên đúng VIN. Mốc kiểm định có số tem khác tem hiện tại (hoặc mất tem) → bật `unrecordedOpening`.
- **Khai báo của chủ xe:** `ownerReport` tính mức 1/2/3 theo ngưỡng (mặc định 30 cm / 30 phút / chết máy), mở `openRequest`; chỉ Workshop mới đóng bằng `resolveRequest` và ghi kết luận (kết luận ngập mới bật cờ).
- **Đính chính:** `proposeAmend` (bên ghi gốc) + `coSignAmend` (thành viên khác) → ghi sự kiện `Amendment`, sự kiện cũ vẫn còn, cờ không tắt.
- **Giao xe:** `handover` tự đọc tem hiện tại làm `sealAtHandover` (không nhận từ người gọi).
- **Kết luận 3 mức** tính ở `shared/status.mjs`: *Có ghi nhận* · *Hồ sơ liên tục* (không cờ, tem khớp, có mốc kiểm định, không có yêu cầu mở) · *Có khoảng trống*. Khi chưa đủ căn cứ (chưa nhập số tem trên máy, chưa có mốc kiểm định, có khai báo chưa kiểm tra) trang hiện **“Chưa đủ căn cứ”** thay vì kết luận vội.

## Chạy

```bash
npm install
npx hardhat test

# cửa sổ 1
npx hardhat node

# cửa sổ 2
npx hardhat run scripts/deploy.js --network localhost
node scripts/seed.js            # hoặc: node scripts/seed.js 500
node scripts/scenarios.js
```

Chạy lại từ đầu: tắt `hardhat node`, bật lại, chạy lại `deploy.js` và `seed.js`.
Tài khoản Hardhat: `0–3` Hội đồng · `4` Đại lý A · `5` Gara C · `6` Insurer · `7` Inspector · `8–19` Chủ xe.
Web tra cứu (sau khi đã deploy + seed): `npm --prefix web install && npm --prefix web run dev` rồi mở http://localhost:5173 (hoặc `?vin=123`, dùng cho QR trên xe).

Xe mẫu: `123` (A, trung thực, thủy kích 02/10/2025, tem T-004512) · `abc` (B) · `wty-001` (C) · `gap-001` (sửa lén) · `seal-001` (tem lạ) · `req-001` (yêu cầu đang mở).

## Quy ước thử nghiệm

Mỗi lần chạy test–sửa lỗi **tối đa 3 vòng**; nếu chưa xanh thì dừng và báo lại, không lặp tiếp.

## Kết quả

*Điền khi đo xong (chưa đo).* Đã biết: seed 500 xe tạo 1.694 giao dịch (proposal ước ~3.000 sự kiện — cần tăng số sự kiện mỗi xe nếu muốn khớp), mất ~3 phút trên Hardhat automine.

| Chỉ số | Giá trị |
|---|---|
| Số test xanh | 34 |
| Kịch bản `scenarios.js` | 22/22 |
| Gas từng loại sự kiện | chưa đo |
| Thời gian ghi / tra 50 sự kiện | chưa đo |
| T1–T6 trên A/B/C | chưa chạy (cần Besu + Postgres) |

## Giới hạn (theo proposal, bổ sung)

- Không chẩn đoán tình trạng máy; không biết những lần sửa không ai ghi và không phá tem; bên được cấp quyền ghi sai từ đầu thì sổ vẫn ghi sai.
- Không chặn tem giả trùng sê-ri hay đục lại số khung. Tem là thiết bị giả định.
- Hardhat một node chỉ mô phỏng nhiều bên; kết luận về “không máy chủ nào giấu được bản ghi” phải đo trên Besu 4 node.
- `issueSeals` hiện do **một** thành viên hội đồng gọi được (đơn giản hóa so với “hội đồng phát hành”).
- Phiếu 2/3 tính trên quy mô hội đồng tại thời điểm bỏ phiếu; phiếu của thành viên bị thu hồi sau đó vẫn được giữ.

## Nhật ký

| Ngày | Nội dung |
|---|---|
| 2026-10-31 | Tạo README bản đầu (mô hình admin + gara), 34 test, deploy/seed/scenarios |
| 2026-11-01 | Web tra cứu theo VIN (Vite + React, chỉ đọc); đối chiếu 7 ca với chuỗi thật khớp kỳ vọng |
| 2026-11-02 | Web ghi sự kiện theo vai trò + hội đồng; chạy thật trên Edge (puppeteer-core): 22/22, sửa 2 lỗi (revert không giải mã, danh sách đề xuất mất tên trường) và tràn ngang ở 390px |
| 2026-11-02 | Giao diện mới: tông xanh nước sáng + trắng, trang chủ là cổng tra cứu công khai cho người mua xe (hướng dẫn 3 bước, giải nghĩa kết luận, ô cờ cảnh báo), khu vực thành viên tách riêng (🔒); test trình duyệt 22/22 |
| 2026-11-02 | Giao diện v2: slogan "Hồ sơ xác thực thông tin xe của bạn"; trang tra cứu chia dải toàn màn hình, chỉ hiện thông tin đã có kèm nhãn "Đã xác thực" và tên đơn vị ghi/sửa (không lộ địa chỉ ví, không lộ số tem); trang chủ xe 3 bước; test trình duyệt 33/33 |
| 2026-11-02 | Giao diện v3: tài khoản mô phỏng thành biểu tượng 👤 ở góc (mở khu vực thành viên từ đó); gộp "Ghi sự kiện" + "Hội đồng" thành một trang; ngăn 🧪 chứa xe/số tem minh họa; ô nhập dùng gợi ý chung; sửa lỗi vai trò không tự cập nhật sau khi hội đồng cấp quyền; test trình duyệt 38/38 |
| 2026-11-01 | Chuyển sang mô hình proposal: hội đồng 2/3, Workshop/Insurer/Inspector, cờ một chiều, tem niêm phong, đính chính, ownerReport; 34 test xanh vòng 1; scenarios 22/22; seed 500 xe |

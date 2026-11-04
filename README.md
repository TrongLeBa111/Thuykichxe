# flood-chain — Tra cứu lịch sử ngập nước và thủy kích ô tô theo VIN trên blockchain

Prototype môn Blockchain (nhóm: Lê Bá Trọng, Hoàng Thị Diệu Hiền, Đỗ Phúc Khang). Mô hình theo proposal: sổ cái có cấp quyền, nhiều bên ghi là đối thủ, người mua tra theo VIN mà không cần ví. Hệ thống **không phán xử** và **không chẩn đoán** tình trạng máy.

> Trạng thái: **đang triển khai** — hợp đồng, test, dữ liệu mẫu, kịch bản đã xong; web, máy chủ bằng chứng, Besu 4 node, đối chứng database chưa làm.

## Tiến độ

- [x] **Hợp đồng `FloodRecord.sol`** (lõi gọn): hội đồng 2/3, **một loại Đơn vị xác nhận**, cờ một chiều, tem niêm phong, ownerReport, chuyển chủ, thay động cơ, bảo hành, đính chính
- [x] **Test Hardhat** — 35 test xanh (vòng 1/3)
- [x] **Dữ liệu mẫu** `seed.js` (20 xe mặc định; `node scripts/seed.js 500` tạo 500 xe)
- [x] **Kịch bản nghiệp vụ** `scenarios.js` — người mua tra cứu, chủ xe khai báo, bán kèm bảo hành, kiểm tra lại sau mở máy, thay động cơ, thanh lý xe tổn thất, kiểm soát quyền: 37/37 (vòng 2/3)
- [x] Web: trang tra cứu theo VIN (`web/`, chỉ đọc, không cần ví)
- [x] Web: trang Chủ xe (khai báo ngập, chuyển chủ, bảo hành); **Khu vực thành viên theo VIN** (nhập số khung một lần, ô việc theo tình trạng xe, đính kèm ảnh/biên bản, ký đính chính một lần bấm) + Hội đồng; kiểm tra tự động trên Edge 47/47 (vòng 2/3, `npm --prefix web run e2e`)
- [ ] Máy chủ bằng chứng (Express + SQLite) và nút kiểm tra hash (`evidence/store.js` đã có phần lưu/hash)
- [ ] Mạng Besu QBFT 4 node bằng Docker (xem `infra/README.md`)
- [ ] Đối chứng A (PostgreSQL + audit log), B (PostgreSQL + ECDSA) và chạy T1–T6
- [x] **Thu gọn lõi** — 5 vai trò → hội đồng + đơn vị xác nhận, bỏ lớp “xe đang ở xưởng” và phiếu giấy, một hàm `inspect` thay 5 thao tác; lý do đổi tem chuẩn hóa; "hồ sơ bắt đầu từ ngày"; VIN 17 ký tự
- [x] Chuyển chủ (mua bán, đại lý bán kèm bảo hành, thanh lý xe tổn thất) và thay động cơ
- [ ] Tiếp theo — phản hồi bảo hành, phản đối, thang đo ngập, khôi phục chủ xe mất ví
- [ ] Đo gas, thời gian ghi/tra, điền mục [Kết quả](#kết-quả)

Tài liệu kiến trúc chi tiết: [docs/kien-truc-he-thong.md](docs/kien-truc-he-thong.md).

## Mô hình

| Bên | Quyền |
|---|---|
| Hội đồng | Cấp/thu hồi quyền ghi, đổi ngưỡng — mọi việc cần **≥ 2/3** phiếu. Không ghi dữ liệu xe. |
| Đơn vị xác nhận (gara, đại lý, bảo hiểm, đăng kiểm…) | Đăng ký xe, ghi ngập/thủy kích, tổn thất toàn bộ, **kiểm tra xe** (km + tem + kết luận + tem mới trong một lần ghi), sửa xong, thay tem, thay động cơ, đính chính. Loại đơn vị chỉ để hiển thị. |
| Chủ xe | Khai báo ngập (nhận mức khuyến nghị, **không bật cờ**), **chuyển chủ**, yêu cầu bảo hành |
| Người tra | Đọc theo VIN, không cần ví |

- **Khóa xe:** `vinHash = keccak256(VIN.trim().toUpperCase())`. Chuỗi không lưu tên, số điện thoại, biển số. Chủ xe chỉ là một địa chỉ ví.
- **Cờ một chiều:** `flood`, `hydrolock`, `totalLoss`, `unrecordedOpening` chỉ có đường bật. Sửa xong chỉ thêm sự kiện `Repair`. Không có hàm xóa/sửa sự kiện (có test kiểm ABI).
- **Tem niêm phong:** mỗi số tem chỉ gắn cho một xe, một lần. `inspect` thấy tem khác tem hồ sơ (hoặc mất tem) → bật `unrecordedOpening`; nếu cùng lần đó có kết luận thì trang tra cứu coi là “đã kiểm tra lại”.
- **Khai báo của chủ xe:** `ownerReport` tính mức 1/2/3 theo ngưỡng (mặc định 30 cm / 30 phút / chết máy), mở `openRequest`; đơn vị xác nhận đóng bằng `inspect` có kết luận (kết luận ngập mới bật cờ).
- **Chuyển chủ:** `transfer` do chính chủ xe ký; cờ đi theo xe; tem lúc chuyển được ghi để đối chiếu bảo hành. Thanh lý xe tổn thất = chủ xe → bảo hiểm → người mua.
- **Thay động cơ:** `changeEngine` ghi hash số máy; không tắt cờ.
- **Đính chính:** `proposeAmend` (bên ghi gốc) + `coSignAmend` (thành viên khác) → sự kiện cũ vẫn còn, cờ không tắt.
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

# kiểm thử trình duyệt (cần dev server đang chạy, chuỗi mới seed)
npm --prefix web run e2e
```

Chạy lại từ đầu: tắt `hardhat node`, bật lại, chạy lại `deploy.js` và `seed.js`.
Tài khoản Hardhat: `0–3` Hội đồng · `4` Đại lý A · `5` Gara C · `6` Bảo hiểm B · `7` Đăng kiểm D (cùng vai trò Đơn vị xác nhận) · `8–19` Chủ xe.
Web tra cứu (sau khi đã deploy + seed): `npm --prefix web install && npm --prefix web run dev` rồi mở http://localhost:5173 (hoặc `?vin=<VIN>`, dùng cho QR trên xe).

Xe minh họa (VIN giả đủ 17 ký tự, xem `shared/demo.mjs` hoặc ngăn 🧪 trên web): `RLXDEMA0000000123` (thủy kích đã sửa, tem T-004512) · `RLXDEMB0000000ABC` (xe sạch) · `RLXDEMC0000WTY001` (đại lý bán kèm bảo hành) · `RLXDEMD0000GAP001` (sửa lén) · `RLXDEME000SEAL001` (thử tem lạ) · `RLXDEMF0000REP001` (khai báo chờ kiểm tra) · `RLXDEMH000RECHK01` (đã kiểm tra lại) · `RLXDEMJ0000ENG001` (thay động cơ) · `RLXDEMK0000SLV001` (thanh lý xe tổn thất).

## Quy ước thử nghiệm

Mỗi lần chạy test–sửa lỗi **tối đa 3 vòng**; nếu chưa xanh thì dừng và báo lại, không lặp tiếp.

## Kết quả

*Điền khi đo xong (chưa đo).* Đã biết: seed 500 xe tạo 1.694 giao dịch (proposal ước ~3.000 sự kiện — cần tăng số sự kiện mỗi xe nếu muốn khớp), mất ~3 phút trên Hardhat automine.

| Chỉ số | Giá trị |
|---|---|
| Số test xanh | 35 |
| Kịch bản `scenarios.js` | 37/37 |
| Kiểm thử trình duyệt | 47/47 |
| Gas từng loại sự kiện | chưa đo |
| Thời gian ghi / tra 50 sự kiện | chưa đo |
| T1–T6 trên A/B/C | chưa chạy (cần Besu + Postgres) |

## Giới hạn (theo proposal, bổ sung)

- Sau khi thu gọn, **mọi đơn vị xác nhận ghi được cho mọi VIN**; chống ghi khống dựa vào danh tính đơn vị, thu hồi quyền 2/3 và đính chính (xem mục 10 của tài liệu kiến trúc).
- Không chẩn đoán tình trạng máy; không biết những lần sửa không ai ghi và không phá tem; bên được cấp quyền ghi sai từ đầu thì sổ vẫn ghi sai.
- Không chặn tem giả trùng sê-ri hay đục lại số khung. Tem là thiết bị giả định.
- Hardhat một node chỉ mô phỏng nhiều bên; kết luận về “không máy chủ nào giấu được bản ghi” phải đo trên Besu 4 node.
- Phiếu 2/3 tính trên quy mô hội đồng tại thời điểm bỏ phiếu; phiếu của thành viên bị thu hồi sau đó vẫn được giữ.

## Nhật ký

| Ngày | Nội dung |
|---|---|
| 2026-10-31 | Tạo README bản đầu (mô hình admin + gara), 34 test, deploy/seed/scenarios |
| 2026-11-01 | Web tra cứu theo VIN (Vite + React, chỉ đọc); đối chiếu 7 ca với chuỗi thật khớp kỳ vọng |
| 2026-11-02 | Web ghi sự kiện theo vai trò + hội đồng; chạy thật trên Edge (puppeteer-core): 22/22, sửa 2 lỗi (revert không giải mã, danh sách đề xuất mất tên trường) và tràn ngang ở 390px |
| 2026-11-02 | Giao diện mới: tông xanh nước sáng + trắng, trang chủ là cổng tra cứu công khai cho người mua xe (hướng dẫn 3 bước, giải nghĩa kết luận, ô cờ cảnh báo), khu vực thành viên tách riêng (🔒); test trình duyệt 22/22 |
| 2026-11-02 | Giao diện v2: slogan "Hồ sơ xác thực thông tin xe của bạn"; trang tra cứu chia dải toàn màn hình, chỉ hiện thông tin đã có kèm nhãn "Đã xác thực" và tên đơn vị ghi/sửa (không lộ địa chỉ ví, không lộ số tem); trang chủ xe 3 bước; test trình duyệt 33/33 |
| 2026-11-04 | **Thu gọn lõi** theo phản hồi “quá nhiều bên, nhiều thao tác”: 2 nhóm thành viên (hội đồng + đơn vị xác nhận), bỏ custody/phiếu giấy/phát hành tem, hàm `inspect` gộp 5 thao tác, thêm `transfer` (mua bán, thanh lý) và `changeEngine`; khu thành viên làm lại theo VIN (nhập một lần, ô việc theo tình trạng xe, đính kèm tệp); thêm kỹ năng Karpathy và `CLAUDE.md` (chọn mô hình, tiết kiệm token); test 35/35, kịch bản 37/37, trình duyệt 47/47 (vòng 2/3) |
| 2026-11-03 | Đợt 1 theo phản biện (đã được thu gọn ở dòng trên): gara chỉ ghi cho xe đang ở xưởng mình (chủ xe ký tiếp nhận hoặc phiếu giấy + thành viên khác xác nhận), lý do phá tem chuẩn hóa, niêm phong lại sau kiểm tra, "hồ sơ bắt đầu từ ngày", VIN 17 ký tự; test 49/49, kịch bản 35/35, trình duyệt 39/39 — đều đạt ở vòng 1/3; e2e đưa vào `web/e2e/` |
| 2026-11-02 | Giao diện v3: tài khoản mô phỏng thành biểu tượng 👤 ở góc (mở khu vực thành viên từ đó); gộp "Ghi sự kiện" + "Hội đồng" thành một trang; ngăn 🧪 chứa xe/số tem minh họa; ô nhập dùng gợi ý chung; sửa lỗi vai trò không tự cập nhật sau khi hội đồng cấp quyền; test trình duyệt 38/38 |
| 2026-11-01 | Chuyển sang mô hình proposal: hội đồng 2/3, Workshop/Insurer/Inspector, cờ một chiều, tem niêm phong, đính chính, ownerReport; 34 test xanh vòng 1; scenarios 22/22; seed 500 xe |

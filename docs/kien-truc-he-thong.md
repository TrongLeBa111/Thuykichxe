# Kiến trúc hệ thống — Hồ sơ xác thực thông tin xe

Tài liệu giải thích những gì nhóm đã xây cho prototype **tra cứu lịch sử ngập nước và thủy kích ô tô theo VIN trên blockchain**: các thành phần, dữ liệu, luồng nghiệp vụ, quy tắc bất biến, cách kiểm thử, và đánh giá từng phần theo góc nhìn triển khai thực tế của từng bên liên quan.

> Trạng thái: **prototype chạy trên Hardhat (một node)**, đã qua **Đợt 1** chỉnh sửa theo phản biện nghiệp vụ (xem [mục 11](#11-đợt-1-chỉnh-theo-phản-biện-nghiệp-vụ)). Mạng Besu 4 node, máy chủ chứng từ và phương án đối chứng database **chưa làm** — xem [mục 9](#9-từ-prototype-tới-triển-khai-thật).
> Cách cài đặt và chạy: xem [README](../README.md).

---

## 1. Bài toán và nguyên tắc thiết kế

Người mua xe cũ không kiểm tra được xe đã từng thủy kích hay bị mở máy chưa, vì bằng chứng nằm rải rác ở hãng, gara, bảo hiểm — những bên không chia sẻ cho nhau — còn người bán có lợi khi giấu.

Bốn nguyên tắc chi phối mọi lựa chọn bên dưới:

1. **Chỉ ghi thêm.** Không có hàm xóa hay sửa sự kiện. Sai sót được xử lý bằng một sự kiện đính chính trỏ về sự kiện cũ.
2. **Cờ cảnh báo một chiều.** Đã bật thì không tắt; sửa xong chỉ thêm sự kiện "đã sửa".
3. **Không bên nào một mình quyết ai được ghi.** Quyền ghi do hội đồng cấp với ≥ 2/3 phiếu.
4. **Hệ thống không phán xử, không chẩn đoán.** Nó chỉ cho biết những gì đã được các bên có thẩm quyền ghi nhận.

## 2. Tổng quan kiến trúc

```mermaid
flowchart LR
  subgraph Trình duyệt [Web — Vite + React]
    L[Tra cứu công khai<br/>không cần ví]
    O[Chủ xe khai báo]
    M[Khu vực thành viên<br/>ghi sự kiện + hội đồng]
  end
  S[shared/status.mjs<br/>logic kết luận, bản dịch lỗi]
  C[(FloodRecord.sol<br/>trên Hardhat node)]
  E[(Kho chứng từ<br/>SQLite — chỉ lưu ngoài chuỗi)]
  D[Danh bạ đơn vị<br/>contract.json → orgs]
  L -- đọc --> C
  O -- ownerReport, claimWarranty --> C
  M -- ghi theo vai trò --> C
  L & O & M --> S
  L --> D
  M -. hash chứng từ .-> C
  E -. hash .-> C
```

| Thành phần | Vị trí | Vai trò |
|---|---|---|
| Hợp đồng `FloodRecord` | `contracts/FloodRecord.sol` | Sổ cái: phân quyền, xe, tem, sự kiện, cờ, bảo hành, đính chính |
| Kiểm thử hợp đồng | `test/FloodRecord.test.js` | 49 test (Hardhat + chai) |
| Dữ liệu minh họa | `shared/demo.mjs` | VIN, số tem, chủ xe của các xe minh họa — dùng chung cho seed, scenarios, web, e2e |
| Kiểm thử trình duyệt | `web/e2e/run.mjs` | Puppeteer điều khiển Edge/Chrome có sẵn: `npm --prefix web run e2e` |
| Script | `scripts/deploy.js`, `seed.js`, `scenarios.js`, `lib.js` | Triển khai + cấp quyền qua 2/3 phiếu; dữ liệu mẫu; chạy tự động các tình huống |
| Logic dùng chung | `shared/status.mjs` | Kết luận tra cứu, nhãn tiếng Việt, dịch lỗi hợp đồng — dùng chung cho web và script |
| Chứng từ | `evidence/hash.js`, `evidence/store.js`, `web/src/evidence.js` | Băm JSON chuẩn hóa; lưu nội dung ngoài chuỗi (SQLite) |
| Web | `web/src/` | `Lookup` (tra cứu), `Owner` (chủ xe), `Members` = `Staff` + `Council` (thành viên), `demo.js` (dữ liệu minh họa) |

**Trên chuỗi** chỉ có: khóa xe dạng hash, trạng thái cờ, tem (dạng hash), sự kiện (loại, bên ghi, thời điểm, hash chứng từ), bảo hành, đề xuất của hội đồng.
**Ngoài chuỗi:** ảnh, biên bản, nội dung khai báo, tên đơn vị. Không lưu tên, số điện thoại, biển số của chủ xe ở bất kỳ đâu.

## 3. Các bên và quyền

| Vai trò | Ngoài đời | Được gọi | Không được |
|---|---|---|---|
| Hội đồng | Đại diện các tổ chức chạy node | `proposeAddMember`, `proposeRevokeMember`, `proposeThresholds`, `approveProposal`, `issueSeals` | Ghi sự kiện về xe |
| Workshop | Đại lý ủy quyền, gara được duyệt | `registerVehicle`; **với xe đang ở xưởng mình**: `applySeal`, `breakSeal`, `repairCompleted`, `reinspect`, `resolveRequest`, `handover`, `reportFlood`, `checkOut`; `proposeCheckIn` (phiếu giấy) | Tự cấp quyền; ghi cho xe không ở xưởng mình |
| Insurer | Doanh nghiệp bảo hiểm | `reportFlood`, `declareTotalLoss` | Đặt/phá tem |
| Inspector | Đơn vị đăng kiểm | `inspectionCheckpoint` | Ghi ngập |
| Chủ xe | Địa chỉ ví đang là `owner` của xe | `ownerReport`, `claimWarranty`, `checkIn` (cho một gara tiếp nhận), `checkOut` (nhận xe về) | Ghi sự kiện hư hỏng, đóng yêu cầu |
| Người tra cứu | Người mua, cửa hàng xe cũ | Mọi hàm `view` (miễn phí, không cần ví) | — |

Bất kỳ thành viên nào cũng **xác nhận phiếu tiếp nhận giấy** của một Workshop khác (`confirmCheckIn`). Bất kỳ thành viên nào (Workshop/Insurer/Inspector) cũng tham gia **đính chính**: bên ghi gốc đề xuất (`proposeAmend`), một thành viên khác ký (`coSignAmend`).

**Hội đồng 2/3.** Mỗi đề xuất được thực hiện khi `số phiếu × 3 ≥ số thành viên hội đồng × 2`. Với 4 thành viên cần 3 phiếu; người đề xuất tự tính 1 phiếu. Không thể thu hồi thành viên hội đồng cuối cùng.

## 4. Mô hình dữ liệu

### 4.1 Khóa và hash

| Đối tượng | Cách tính | Ghi chú |
|---|---|---|
| Xe | `vinHash = keccak256(VIN chuẩn hóa)` — bỏ khoảng trắng, gạch nối, in hoa | Client chỉ nhận VIN **đúng 17 ký tự, không có I, O, Q** (`isValidVin` trong `shared/status.mjs`). Không kiểm chữ số kiểm tra ở vị trí 9 vì chỉ bắt buộc ở một số thị trường. Hợp đồng nhận `bytes32` nên không tự kiểm định dạng |
| Số tem | `keccak256("seal:" + số in trên tem)` | Chuỗi chỉ giữ hash → trang công khai **không hiện được** số tem, người mua phải đọc trên máy |
| Chứng từ | `keccak256(JSON chuẩn hóa)` — khóa sắp xếp, không khoảng trắng | Cùng thuật toán ở `evidence/hash.js` và `web/src/evidence.js` |

### 4.2 Cấu trúc trên chuỗi

- **`Vehicle`**: `owner`, `custodian` (Workshop đang giữ xe, 0 nếu không ở xưởng nào), bốn cờ một chiều (`flood`, `hydrolock`, `totalLoss`, `unrecordedOpening`), `openRequest` (mức khai báo của chủ xe đang chờ), `currentSeal`, và thông tin giao xe (`handoverAt`, `warrantyDays`, `sealAtHandover`, `handoverHash`).
- **`Record`** (mảng chỉ thêm theo xe): `kind`, `actor`, `occurredAt` (do người khai), `recordedAt` (`block.timestamp`), `sub` (loại ngập / mức / kết luận / tem lệch), `dataHash`, `seal`, `num` (km, số ngày bảo hành, chỉ số sự kiện bị đính chính).
- **`Seal`**: `None → Issued → Applied → Broken`, kèm `vinHash` của xe đang gắn.
- **`Proposal`** và **`Amend`**: đề xuất của hội đồng và đề xuất đính chính.

15 loại sự kiện: Đăng ký xe, Đặt tem, Phá tem, Ghi nhận ngập, Sửa xong, Tổn thất toàn bộ, Mốc kiểm định, Giao xe, Khai báo của chủ xe, Workshop đóng yêu cầu, Yêu cầu bảo hành, Đính chính, **Tiếp nhận xe vào xưởng, Bàn giao xe, Kiểm tra lại và niêm phong**.

Lý do phá tem được chuẩn hóa (`BreakReason`, lưu ở `sub`): bảo dưỡng định kỳ · sửa không liên quan ngập · sửa do ngập/thủy kích · thay động cơ · đã bị mở ngoài hệ thống (chỉ ghi qua `reinspect`).

## 5. Luồng nghiệp vụ

### 5.1 Kết nạp thành viên
Hội đồng #0 `proposeAddMember(addr, role)` → #1, #2 `approveProposal(id)` → đủ 3/4 phiếu thì vai trò có hiệu lực. `scripts/deploy.js` dùng đúng luồng này để cấp quyền cho 2 Workshop, 1 Insurer, 1 Inspector — không có "cửa sau" admin.

### 5.2 Vòng đời một chiếc xe

```mermaid
sequenceDiagram
  participant HĐ as Hội đồng
  participant W as Workshop
  participant I as Insurer
  participant K as Inspector
  participant C as Chuỗi
  participant O as Chủ xe
  HĐ->>C: issueSeals([T-004500 …])
  W->>C: registerVehicle(vin, owner, tem#1)
  Note over C: Registered + SealApplied, W đang giữ xe
  W->>C: checkOut(vin) — giao xe cho chủ
  I->>C: reportFlood(vin, Hydrolock, 02/10/2025)
  Note over C: bật flood + hydrolock (không tắt được)
  O->>C: checkIn(vin, W) — cho gara tiếp nhận
  W->>C: breakSeal(vin, tem#1, "sửa do ngập")
  W->>C: repairCompleted(vin, tem#2)
  Note over C: Repair + SealApplied, cờ giữ nguyên
  W->>C: checkOut(vin) — bàn giao, hết quyền ghi
  K->>C: inspectionCheckpoint(vin, km, số tem thấy)
  Note over C: tem lệch hoặc mất → bật unrecordedOpening
```

### 5.3 Tiếp nhận xe vào xưởng (neo quyền ghi của Workshop)

Ngoài đời, gara chỉ có quyền nói về một chiếc xe khi xe đó đang nằm trong xưởng, có phiếu tiếp nhận hoặc lệnh sửa chữa ký với chủ xe. Hợp đồng mô phỏng đúng điều đó bằng trường `custodian`:

| Cách tiếp nhận | Ai làm | Ghi trên chuỗi |
|---|---|---|
| Đăng ký xe | Workshop đăng ký | Workshop đó mặc nhiên đang giữ xe |
| Chủ xe ký (quét QR tại quầy) | Chủ xe gọi `checkIn(vin, workshop)` | `CheckIn`, actor = Workshop, sub = 0 |
| Phiếu giấy (chủ xe không có ví) | Workshop `proposeCheckIn(vin, hash phiếu)` → **một thành viên khác** `confirmCheckIn(id)` | `CheckIn`, actor = Workshop, sub = 1, num = mã phiếu |

Từ lúc tiếp nhận đến lúc **bàn giao** (`checkOut` do gara hoặc chủ xe, hoặc `handover`), chỉ Workshop đang giữ xe mới gọi được các hàm ghi về xe. Insurer (ghi theo hồ sơ bồi thường) và Inspector không cần tiếp nhận. Workshop không tự xác nhận phiếu giấy của mình; Workshop bị thu hồi quyền trước khi phiếu được xác nhận thì phiếu mất hiệu lực.

Điều này **chặn ghi khống** (gara ghi ngập cho xe của đối thủ) nhưng **không chặn che giấu**: gara muốn giấu chỉ cần không lập tiếp nhận. Phần che giấu vẫn chỉ phát hiện được một phần nhờ tem và mốc kiểm định.

### 5.4 Chủ xe khai báo (tình huống B)
`ownerReport(vin, độ ngập, thời gian ngâm, chết máy, thời điểm)` → hợp đồng tính mức khuyến nghị:

| Điều kiện | Mức |
|---|---|
| Chết máy | 3 — không khởi động lại, gọi cứu hộ |
| Ngập ≥ 30 cm hoặc ngâm ≥ 30 phút | 2 — đưa xe vào gara |
| Còn lại | 1 — theo dõi |

Khai báo **không bật cờ**, chỉ mở `openRequest` (chỉ tăng, không giảm). Chủ xe đưa xe vào gara bằng `checkIn`; chỉ Workshop **đang giữ xe** đóng được bằng `resolveRequest(vin, kết luận)`; kết luận ngập/thủy kích mới bật cờ. Ngưỡng là tham số, hội đồng đổi bằng 2/3 phiếu.

### 5.5 Giao xe và bảo hành (tình huống C)
`handover(vin, chủ mới, số ngày, biên bản)` — hợp đồng **tự đọc** tem hiện tại làm `sealAtHandover` thay vì nhận từ người gọi, để bên bán không khai sai. `handover` đồng thời là bàn giao xe ra khỏi xưởng. `claimWarranty` chỉ nhận từ chủ hiện tại và trong hạn; hệ thống chỉ ghi yêu cầu, không quyết định bồi thường.

### 5.6 Niêm phong lại sau kiểm tra

Chủ xe thay gioăng ở gara ngoài hệ thống, tem bị bóc. Thay vì để xe mãi bị xếp "có khoảng trống" như xe sửa lén, chủ xe mang xe đến một gara thành viên: cho gara tiếp nhận → gara gọi `reinspect(vin, kết luận, tem mới)`. Hợp đồng:
1. ghi tem cũ (nếu còn trên hồ sơ) là "đã bị mở ngoài hệ thống";
2. bật cờ `unrecordedOpening` — một chiều, vì đó là sự thật đã xảy ra;
3. ghi sự kiện "Kiểm tra lại và niêm phong" kèm kết luận (kết luận ngập/thủy kích thì bật cờ tương ứng);
4. đặt tem mới.

Trang tra cứu hiện dòng "đã được kiểm tra lại và niêm phong ngày …, kết luận …". Nếu sau lần kiểm tra lại không có mốc kiểm định nào phát hiện tem lệch nữa, xe không bị xếp "có khoảng trống".

### 5.7 Đính chính
Bên ghi gốc `proposeAmend(vin, chỉ số, hash văn bản đính chính)` → thành viên khác `coSignAmend(id)`. Kết quả: sự kiện cũ **vẫn còn**, được đánh dấu `isAmended`, và một sự kiện `Amendment` mới trỏ về nó. Cờ không tắt.

## 6. Quy tắc bất biến và cách bảo đảm

| Quy tắc | Bảo đảm bởi | Kiểm chứng |
|---|---|---|
| Không xóa/sửa sự kiện, không tắt cờ | Hợp đồng không có hàm nào làm việc đó | Test quét ABI tìm `delete/remove/clear/reset/unset/disable/edit/modify` |
| Mỗi số tem dùng một lần | `Seal.state` chỉ đi một chiều; `issueSeals` từ chối số đã tồn tại | Test tem đã phá không gắn lại được |
| Phá tem đúng xe | `breakSeal` yêu cầu tem đang `Applied`, đúng `vinHash`, đúng `currentSeal` | Test phá tem của xe khác bị từ chối |
| Thời điểm ghi nhận không giả được | `recordedAt = block.timestamp`; `occurredAt` không được ở tương lai | Test so `recordedAt` với block |
| Tem lúc giao xe trung thực | `sealAtHandover` do hợp đồng đọc | Test handover |
| Chủ xe không tự "làm sạch" | `resolveRequest` chỉ Workshop | Test chủ xe đóng yêu cầu bị từ chối |
| Không cấp quyền đơn phương | Mọi thay đổi vai trò qua đề xuất 2/3 | Test 2/4 phiếu chưa có hiệu lực, 3/4 thì có |
| Gara chỉ ghi cho xe đang ở xưởng mình | `_requireCustody` trong mọi hàm ghi của Workshop | Test 7 hàm ghi của gara không giữ xe đều bị chặn |
| Phiếu giấy cần người thứ hai | `confirmCheckIn` từ chối chính Workshop đề xuất | Test tự xác nhận bị từ chối |
| Lý do phá tem không giả "ngoài hệ thống" | `breakSeal` từ chối `Unrecorded`; chỉ `reinspect` ghi lý do này | Test lý do không hợp lệ |

Lỗi dùng `custom error` (34 loại) để tiết kiệm gas và để web dịch sang tiếng Việt (`ERROR_VI` trong `shared/status.mjs`). Web gọi `staticCall` trước mỗi giao dịch để lấy được tên lỗi.

## 7. Trang tra cứu: từ dữ liệu chuỗi tới kết luận

`computeStatus` (trong `shared/status.mjs`) cho ra một trong bốn kết luận:

| Kết luận | Điều kiện |
|---|---|
| **Có ghi nhận ngập, thủy kích** | Có cờ `flood`, `hydrolock` hoặc `totalLoss` |
| **Có khoảng trống** | Cờ `unrecordedOpening` mà **chưa được kiểm tra lại** sau lần phát hiện cuối, hoặc số tem người tra nhập không khớp, hoặc xe chưa đăng ký |
| **Không có ghi nhận, hồ sơ liên tục** | Không cờ, tem khớp, có ít nhất một mốc kiểm định, không có khai báo đang chờ |
| **Chưa đủ căn cứ** | Các trường hợp còn lại (chưa nhập tem, chưa có kiểm định, có khai báo chờ gara) |

Ba mức đầu theo proposal; mức thứ tư do nhóm thêm để không kết luận "sạch" khi chưa đủ dữ liệu.

Mọi kết quả đều kèm dòng **"Hồ sơ bắt đầu từ ngày …; hệ thống không có dữ liệu trước ngày này"** (ngày của sự kiện đầu tiên). Lý do: xe mới vào hệ thống hôm qua và xe có 5 năm lịch sử cùng có thể ra "hồ sơ liên tục"; người mua cần biết hồ sơ dài bao lâu.

Những lựa chọn giao diện có lý do nghiệp vụ:
- **Chỉ hiện thông tin đã có**, mỗi mục gắn nhãn "Đã xác thực"; không liệt kê "không có ghi nhận" cho từng cờ.
- **Hiện tên đơn vị, không hiện địa chỉ ví.** Tên lấy từ danh bạ ngoài chuỗi (`orgs` trong `contract.json`, do `deploy.js` ghi).
- **Không hiện số tem.** Nếu trang công khai số tem, kẻ gian chỉ cần in tem giả đúng số. Trang chỉ cho biết tem do ai đặt, ngày nào; người mua nhập số đọc trên máy để hệ thống so.
- **Tra cứu không cần ví**: chỉ gọi hàm `view` qua RPC.

Các trang khác: **Chủ xe khai báo** (3 bước: đối chiếu mã xe và quyền chủ xe → khai báo → bảo hành, mỗi bước ghi rõ thông tin được lưu); **Khu vực thành viên** (form theo vai trò + hội đồng). Tài khoản mô phỏng ví chọn ở biểu tượng 👤; dữ liệu minh họa ở biểu tượng 🧪 (`web/src/demo.js`), tách khỏi giao diện chính.

## 8. Kiểm thử

| Mức | Công cụ | Kết quả gần nhất |
|---|---|---|
| Hợp đồng | `npx hardhat test` | 49/49 |
| Tình huống A, B, C, tấn công T1, T3, T4, T5 và luồng Đợt 1 | `node scripts/scenarios.js` | 35/35 điều kiện |
| Giao diện đầu–cuối trên trình duyệt | `npm --prefix web run e2e` (Puppeteer + Edge) | 39/39, không lỗi console |
| Quy mô (trước Đợt 1) | `node scripts/seed.js 500` | 500 xe, 1.694 giao dịch, ~3 phút |

Quy ước: mỗi lần test–sửa tối đa 3 vòng; chưa xanh thì dừng và báo lại.

Kiểm thử trình duyệt đã phát hiện và sửa 4 lỗi thật: lỗi revert không được giải mã; danh sách đề xuất mất tên trường khi trải (`...`) kết quả ethers; tràn ngang ở màn hình 390px; vai trò không tự cập nhật sau khi hội đồng cấp quyền.

Bộ kiểm thử trình duyệt ghi lên chuỗi, nên mỗi lần chạy cần node mới + deploy + seed. Ảnh chụp lưu ở `web/e2e/shots/` (không đưa lên repo).

## 9. Từ prototype tới triển khai thật

| Hạng mục | Prototype | Triển khai thật cần |
|---|---|---|
| Mạng | Hardhat 1 node, automine | Besu QBFT 4 node, mỗi tổ chức một node; chịu được 1 node gian |
| Khóa | 20 tài khoản Hardhat công khai | Ví riêng từng tổ chức, quy trình đổi/thu hồi khóa |
| Chứng từ | Hash tính ở client; kho SQLite chung | Mỗi bên tự giữ chứng từ của mình; máy chủ trả nội dung + hash để kiểm |
| Danh bạ đơn vị | File ngoài chuỗi do script ghi | Đăng ký trên chuỗi qua hội đồng (tên, số giấy phép) |
| Nâng cấp hợp đồng | Không có | Quy trình chuyển dữ liệu hoặc tách lưu trữ/logic |
| Đối chứng | Chưa có | Phương án A (PostgreSQL + audit log), B (+ chữ ký ECDSA) chạy cùng kịch bản T1–T6 |

## 10. Đánh giá theo góc nhìn triển khai thực tế

Phần này soi prototype qua góc nhìn từng bên phải vận hành nó, để biết cái gì đã đủ, cái gì còn là giả định.

| Góc nhìn | Đã có trong prototype | Còn thiếu khi đưa vào thực tế |
|---|---|---|
| **Điều hành hệ sinh thái** | Hội đồng 2/3, không có admin đơn lẻ | Ai lập hội đồng; vì sao gara chịu ghi điều bất lợi; bắt đầu từ phạm vi hẹp nào; chỉ số đo độ phủ |
| **Vận hành** | Luồng đầy đủ: kết nạp → đăng ký → tiếp nhận → ngập → sửa → bàn giao → kiểm định → giao xe; tiếp nhận bằng phiếu giấy | Mua bán giữa cá nhân và thanh lý xe tổn thất (Đợt 2); khai báo chờ không có hạn xử lý; chưa có cách hủy tem mất/hỏng; chưa có thủ tục xác minh giấy phép trước khi bỏ phiếu |
| **Tài chính** | Ghi rõ chi phí vận hành node là chi phí chính | Ai trả node, tem vật lý; nguồn thu (phí thành viên, phí tem, báo cáo cho cửa hàng xe cũ) |
| **Kỹ thuật** | Hợp đồng có test, logic dùng chung web–script; VIN kiểm 17 ký tự, không I/O/Q | Chưa có nâng cấp hợp đồng; chưa có chỉ mục cho tra cứu lớn |
| **An ninh** | Không xóa, không tắt cờ, tem dùng một lần, cấp quyền 2/3; **gara chỉ ghi cho xe đang ở xưởng mình** (chặn ghi khống) | Insurer vẫn ghi được cho mọi xe (dựa trên hồ sơ bồi thường, không kiểm được trên chuỗi); chưa có quy trình khi lộ khóa; chủ xe khai báo không giới hạn |
| **Pháp lý** | Không lưu tên, số điện thoại, biển số; chỉ hash lên chuỗi | Địa chỉ ví + VIN vẫn có thể liên kết với người; quyền xóa dữ liệu vs sổ không xóa được (giải pháp: xóa chứng từ ngoài chuỗi); điều lệ hội đồng; trách nhiệm khi ghi sai. Cần hỏi giảng viên/luật sư về văn bản hiện hành |
| **Dữ liệu** | 12 loại sự kiện, 3 loại ngập, 4 kết luận | Thang đo ngập thống nhất; mẫu chứng từ; nhãn "nhập bổ sung" cho dữ liệu lịch sử trước khi có hệ thống |
| **Sản phẩm** | Tra cứu công khai, chủ xe khai báo, khu vực thành viên | Người bán trung thực chưa chia sẻ được "hồ sơ đã xác thực" (link/QR); chủ xe chưa được báo khi có sự kiện ghi lên xe mình |
| **Hỗ trợ người dùng** | Lỗi hiển thị tiếng Việt, ghi chú "thông tin được lưu" | Kênh khiếu nại/tranh chấp; chủ xe chưa tự phản đối được một sự kiện |

Ba rủi ro lớn nhất, nên trình bày thẳng khi bảo vệ:
1. **Động lực ngược chiều**: gara sửa lén có lợi khi không ghi. Tem và mốc kiểm định chỉ phát hiện được một phần.
2. **"Không có ghi nhận" dễ bị hiểu là "xe sạch"** khi dữ liệu còn mỏng. Trang đã có cảnh báo; nên hiện thêm độ phủ (số gara tham gia).
3. **Quyền ghi quá rộng** — *đã xử lý một phần ở Đợt 1*: Workshop chỉ ghi cho xe đang ở xưởng mình. Còn lại: Insurer vẫn ghi được cho mọi xe, và tiếp nhận không chặn được việc gara không ghi (che giấu).

## 11. Đợt 1: chỉnh theo phản biện nghiệp vụ

Phản biện soi prototype theo cách nghiệp vụ diễn ra ngoài đời (10 điểm, chia 3 đợt). Đợt 1 làm 4 việc:

| Phản biện | Đã làm | Ở đâu |
|---|---|---|
| Gara ghi được cho mọi xe | Tiếp nhận / bàn giao; chủ xe ký hoặc phiếu giấy + thành viên khác xác nhận | Hợp đồng (`custodian`, `checkIn`, `proposeCheckIn`, `confirmCheckIn`, `checkOut`), trang Chủ xe bước 3, khu vực thành viên |
| Phá tem không phải lúc nào cũng do ngập | Lý do phá tem chuẩn hóa; niêm phong lại sau kiểm tra | `BreakReason`, `reinspect`, `computeStatus` (`rechecked`), trang tra cứu |
| Xe cũ trước khi có hệ thống | Mọi kết quả hiện "Hồ sơ bắt đầu từ ngày …" | `computeStatus` (`since`), trang tra cứu |
| Kiểm tra VIN | 17 ký tự, không I/O/Q; VIN demo đổi sang VIN giả hợp lệ | `isValidVin`, `shared/demo.mjs` |

Ghi chú khi đối chiếu phản biện với code: điểm "xe cũ mãi mãi chưa đủ căn cứ" chưa chính xác — xe có mốc kiểm định và tem khớp vẫn ra "hồ sơ liên tục". Vấn đề thật là chiều ngược lại (xe mới vào hệ thống cũng được gắn nhãn đó), nên giải pháp là hiện ngày bắt đầu hồ sơ.

**Còn lại cho Đợt 2–3:** chuyển chủ hợp nhất (mua bán cá nhân, thanh lý xe tổn thất, khôi phục khi mất ví), thay động cơ gắn số máy, phản hồi bảo hành và phản đối của chủ xe, thang đo ngập chi tiết, tách vai trò đơn vị kiểm tra xe cũ khỏi đăng kiểm, ghi căn cứ đồng ý chia sẻ dữ liệu bảo hiểm.

**Giả định cần xác minh ngoài thực địa** (nhóm hỏi, không tự điền): vị trí ốc chỉ mở khi đại tu hoặc thủy kích (hỏi kỹ thuật viên gara); xe tổn thất toàn bộ đi đâu sau bồi thường và biên bản giám định ngập ghi những trường gì (hỏi cán bộ bồi thường); quy trình đăng kiểm có mở nắp ca-pô và đối chiếu số máy không (hỏi trung tâm đăng kiểm).

## Phụ lục A — Tài khoản và dữ liệu mẫu

| Tài khoản Hardhat | Vai trò | Tên hiển thị |
|---|---|---|
| #0–#3 | Hội đồng | — |
| #4 | Workshop | Đại lý ủy quyền A |
| #5 | Workshop | Gara độc lập C |
| #6 | Insurer | Công ty bảo hiểm B |
| #7 | Inspector | Trung tâm đăng kiểm D |
| #8–#19 | Chủ xe | — |

Xe minh họa (`shared/demo.mjs`, xem thêm ngăn 🧪 trên web):

| VIN | Tình huống | Tem hiện tại | Chủ xe |
|---|---|---|---|
| `RLXDEMA0000000123` | A — thủy kích 02/10/2025, chủ xe ký cho Gara C tiếp nhận, sửa | `T-004512` | #8 |
| `RLXDEMB0000000ABC` | B — xe sạch, chủ xe sẽ khai báo | `T-004501` | #9 |
| `RLXDEMC0000WTY001` | C — giao xe bảo hành 180 ngày | `T-004502` | #14 (người mua) |
| `RLXDEMD0000GAP001` | Sửa lén: kiểm định thấy mất tem, chưa kiểm tra lại | `T-004504` (trên máy không có) | #11 |
| `RLXDEME000SEAL001` | Hồ sơ sạch, thử tem lạ | `T-004505` | #12 |
| `RLXDEMF0000REP001` | Chủ xe đã khai báo, chờ gara | `T-004506` | #13 |
| `RLXDEMG0000PAPER1` | Tiếp nhận bằng phiếu giấy, bảo dưỡng định kỳ | `T-004508` | #15 |
| `RLXDEMH000RECHK01` | Mở máy ngoài hệ thống, đã kiểm tra lại và niêm phong | `T-004510` | #16 |
| `RLXDEMZ9999999999` | Đúng định dạng, chưa đăng ký | — | — |

Xe ngẫu nhiên: `RLXDEMR0000000001`…

## Phụ lục B — Bản đồ mã nguồn

```
contracts/FloodRecord.sol   hợp đồng
test/FloodRecord.test.js    34 test
scripts/deploy.js           triển khai, cấp quyền 2/3, ghi web/src/contract.json (+ danh bạ orgs)
scripts/seed.js             dữ liệu mẫu (tham số: số xe)
shared/demo.mjs             VIN, số tem, chủ xe của xe minh họa (dùng chung)
web/e2e/run.mjs             kiểm thử trình duyệt (npm --prefix web run e2e)
scripts/scenarios.js        chạy A, B, C, T1, T4, T5
scripts/lib.js              kết nối node, hash VIN/tem, đọc hồ sơ
shared/status.mjs           kết luận tra cứu, nhãn, dịch lỗi
evidence/hash.js, store.js  hash chứng từ, kho SQLite
web/src/Lookup.jsx          tra cứu công khai
web/src/Owner.jsx           chủ xe khai báo (3 bước)
web/src/Members.jsx         khu vực thành viên = Staff.jsx + Council.jsx
web/src/demo.js             dữ liệu minh họa cho ngăn 🧪
web/src/chain.js            provider, tài khoản, ghi giao dịch (staticCall trước)
infra/README.md             kế hoạch Besu + PostgreSQL (chưa triển khai)
```

# flood-chain — quy ước làm việc

Kỹ năng đi kèm: `.claude/skills/karpathy-guidelines` (nghĩ trước khi code, đơn giản, sửa đúng chỗ, có tiêu chí kiểm chứng).

## Giới hạn
- Test tối đa 3 vòng test-sửa; vẫn lỗi thì dừng và báo cáo.
- Chỉ commit/push khi được yêu cầu. Không force-push khi chưa được đồng ý.
- Git trên máy này: TrongLeBa111 / trongleba69@gmail.com.
- Ưu tiên khớp nghiệp vụ thực tế; tình huống A/B/C chỉ là minh họa.

## Chọn mô hình theo tác vụ (tiết kiệm token)
| Tác vụ | Mô hình |
|---|---|
| Thiết kế kiến trúc, phản biện nghiệp vụ, rà soát bảo mật hợp đồng | opus |
| Viết/sửa code, test, UI thường ngày | sonnet |
| Tìm file, đọc log, đổi tên hàng loạt, định dạng | haiku (hoặc subagent Explore) |

Đổi bằng `/model`. Không tự đẩy tác vụ nhỏ lên mô hình lớn.

## Tiết kiệm token
- Đọc đúng đoạn cần (offset/limit), không đọc cả `docs/kien-truc-he-thong.md` hay `contracts/FloodRecord.sol` nếu chỉ cần một hàm; dùng Grep trước.
- Không spawn subagent trừ khi được yêu cầu; không lặp lại nội dung đã thống nhất.
- Chạy test gọn: `npx hardhat test` rồi chỉ đọc phần lỗi; e2e chỉ khi đổi giao diện.
- Sửa nhỏ dùng Edit, không ghi lại cả file.
- Việc phụ (ghi chú tạm, script vá) để trong scratchpad, không đưa vào repo.

## Chạy thử
`npx hardhat node` → `node scripts/deploy.js` → `node scripts/seed.js` → `npm --prefix web run dev`; kiểm tra: `npx hardhat test`, `node scripts/scenarios.js`, `npm --prefix web run e2e`.

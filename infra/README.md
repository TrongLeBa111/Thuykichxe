# Hạ tầng (chưa triển khai)

Dự kiến theo proposal mục 7–8; chưa có cấu hình nào được chạy thử, nên chưa đưa file compose vào để tránh cấu hình chưa kiểm chứng.

1. **Besu QBFT 4 node (Docker):** sinh genesis + khóa bằng `besu operator generate-blockchain-config` (QBFT, 4 validator), mỗi tổ chức một node. Deploy `FloodRecord` bằng Hardhat với network trỏ vào một node; hội đồng là 4 tài khoản của 4 tổ chức.
2. **Thí nghiệm 2–3 (tắt 1 node, node sửa dữ liệu cục bộ):** `docker stop` một node rồi tra/ghi; sửa DB cục bộ của một node và quan sát 3 node còn lại.
3. **Đối chứng:** A = PostgreSQL + audit log; B = PostgreSQL + chữ ký ECDSA từng sự kiện. Chạy lại T1–T6 và ghi mỗi ô là chặn / phát hiện / không phát hiện (ghi dự đoán trước).

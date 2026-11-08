# 02 — Phiếu việc của Quý (mảng độc lập)

> Người: **Quý**. Vai trò: **mảng độc lập** gồm trang `/how-it-works` (Cách học, có 16 thẻ khái niệm), trang `/history` (Lịch sử nộp bài) và áp phích của đội.
> **Vì sao tách thành luồng tự chủ:** để các phần song song không chặn nhau. Mảng này chạy trọn gói từ đầu đến cuối, không nằm trên đường găng. Không phiếu nào của 4 người còn lại chờ đầu ra của mảng này. Nếu mảng này trễ hoặc phải bỏ, sản phẩm chính và buổi demo vẫn chạy bình thường. Link tới các trang của mảng được ẩn bằng 1 dòng (`enabled`) trong `src/lib/nav.ts`, do Thiện sửa.
> **Công cụ:** Quý dùng **Codex** thay cho Claude. Prompt trong phiếu dán y hệt; chỗ nào tài liệu chung ghi "Claude" thì Quý hiểu là Codex.
> Luật chung cho mọi phiếu: xem đầu file [`02_PHIEU_THIEN.md`](02_PHIEU_THIEN.md).

## Ranh giới của mảng

- **Được sửa:** chỉ file trong `src/app/how-it-works/`, `src/components/how-it-works/`, `src/app/history/`, `src/components/history/`.
- **Được đọc, không sửa:** `src/contracts/*` (kiểu đã ổn định sau 13:00), token màu trong `src/app/globals.css`, hàm `createClient()` trong `src/lib/supabase/client.ts`, các thành phần `Button`, `Chip`, `PageHeader`, `EmptyState` trong `src/components/ui/`, các API đã chạy (`GET /api/sessions`, và `GET /api/sessions/{id}/history` nếu TH-15 đã làm xong).
- **Không đụng:** contracts, `layout.tsx`, `globals.css`, `package.json`, migration, mọi file trong `src/app/api/`, `src/store/`, `src/lib/api.ts`, `src/lib/nav.ts`, `src/components/layout/`, code của `/learn`.
- **Cần thay đổi ở phần chung** (thêm link, thêm gói, đổi API): ghi yêu cầu vào PR của mình hoặc nhắn Thiện. Không tự sửa.
- Mọi PR đi qua CI và Thiện merge như mọi người. Commit bằng tài khoản của Quý, đều đặn trong suốt giờ thi.

## Danh sách phiếu của Quý

Mỗi mã phiếu là 1 file trong thư mục [`phieu/quy/`](phieu/quy/). Đầu mỗi file là **prompt dán cho Codex** (hoặc ghi rõ phiếu không dùng Codex). Làm theo đúng thứ tự giờ.

| Mã | Tên việc | Giờ | Cách làm |
| :-- | :-- | :-- | :-- |
| [QU-01](phieu/quy/QU-01.md) | Khung trang Cách học | 12:20 → 13:00 | Codex |
| [QU-02](phieu/quy/QU-02.md) | Nội dung 4 bước cách học và câu hỏi thường gặp | 13:00 → 15:00 | Codex |
| [QU-03](phieu/quy/QU-03.md) | 16 thẻ khái niệm viết tay | 15:00 → 17:30 | Codex |
| [QU-04](phieu/quy/QU-04.md) | Áp phích của đội (bản nháp) | 17:30 → 19:00 | Không dùng Codex |
| [QU-05](phieu/quy/QU-05.md) | Trang Lịch sử nộp bài với dữ liệu mẫu | 19:00 → 21:30 | Codex |
| [QU-06](phieu/quy/QU-06.md) | Trang Lịch sử nối API thật, trạng thái lỗi | 00:30 → 02:30 | Codex |
| [QU-07](phieu/quy/QU-07.md) | Áp phích bản cuối có ảnh sản phẩm thật | 02:30 → 04:00 | Không dùng Codex |
| [QU-08](phieu/quy/QU-08.md) | Hoàn thiện mảng độc lập và commit cuối | 04:00 → 09:00 | Codex |

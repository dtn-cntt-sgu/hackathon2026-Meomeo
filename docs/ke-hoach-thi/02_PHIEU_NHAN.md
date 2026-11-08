# 02 — Phiếu việc của Nhân (AI + BKT)

> Người: **Nhân**. Vai trò: hàm thuần BKT, lời gọi Gemini, prompt, cổng gác (bản nới), chấm bài, giải thích đoạn chọn (server), Offline (logic); duyệt tay output AI; **giữ quyền merge 00:30–03:30**; **người nói chính** khi thuyết trình (Q-10).
> Ghi chú phải xử lý: **1** (câu hỏi khó), **3** (bớt gọi lại AI), **4** (server), **6** (nới khóa).
> Luật chung cho mọi phiếu: xem đầu file [`02_PHIEU_THIEN.md`](02_PHIEU_THIEN.md).

## Danh sách phiếu của Nhân

Mỗi mã phiếu là 1 file trong thư mục [`phieu/nhan/`](phieu/nhan/). Đầu mỗi file là **prompt dán cho Claude** (hoặc ghi rõ phiếu không dùng Claude). Làm theo đúng thứ tự giờ.

| Mã | Tên việc | Giờ | Cách làm |
| :-- | :-- | :-- | :-- |
| [NH-01](phieu/nhan/NH-01.md) | Contracts AI, người học và gọi thử Gemini | 12:20 → 13:00 | Claude |
| [NH-02](phieu/nhan/NH-02.md) | Fixture phản hồi AI cho giao diện | 13:00 → 13:30 | Claude |
| [NH-03](phieu/nhan/NH-03.md) | Hàm thuần: BKT, kế hoạch câu hỏi, trạng thái node, độ giống, bộ lọc an toàn | 13:30 → 15:00 | Claude |
| [NH-04](phieu/nhan/NH-04.md) | Lời gọi Gemini, hạn mức token, cổng gác bản nới | 15:00 → 16:45 | Claude |
| [NH-05](phieu/nhan/NH-05.md) | `analyze-node`: X-Ray có điểm dở thật | 16:45 → 18:30 | Claude |
| [NH-06](phieu/nhan/NH-06.md) | `enrich-node`: câu hỏi dễ hiểu cho người mới (ghi chú 1) | 18:30 → 20:30 | Claude |
| [NH-07](phieu/nhan/NH-07.md) | `evaluate-feynman` và `reveal`: chấm bài không khóa gắt (ghi chú 6) | 20:30 → 22:30 | Claude |
| [NH-08](phieu/nhan/NH-08.md) | Ghép lát dọc 2 và chạy bài thử "giám khảo" | 22:30 → 23:30 | Claude |
| [NH-09](phieu/nhan/NH-09.md) | Giải thích đoạn chọn phía server (ghi chú 4) | 23:30 → 00:30 | Claude |
| [NH-10](phieu/nhan/NH-10.md) | Logic Offline và script ghi bundle; giữ quyền merge | 00:30 → 02:30 | Claude |
| [NH-11](phieu/nhan/NH-11.md) | Duyệt tay output AI trên repo demo đã chốt | 02:30 → 04:00 | Không dùng Claude |
| [NH-12](phieu/nhan/NH-12.md) | Ghi bundle Offline trên bản đóng băng | 04:00 → 05:00 | Không dùng Claude |
| [NH-13](phieu/nhan/NH-13.md) | Tập nói và commit cuối | 08:30 → 09:00 | Claude (mẫu sửa lỗi, điền lỗi trước khi dán) |

### Phiếu tăng tốc (thêm sau, xem [`09_PHIEU_TANG_TOC.md`](09_PHIEU_TANG_TOC.md))

| Mã | Tên việc | Giờ | Cách làm |
| :-- | :-- | :-- | :-- |
| [NH-14](phieu/nhan/NH-14.md) | Chấm bài và giải thích đoạn chọn dùng flash-lite (T1) | Ngay, làm tiếp trên PR #39 | Claude |
| [NH-15](phieu/nhan/NH-15.md) | Giới hạn thời gian chờ tối đa của lời gọi AI (T2) | Ngay sau NH-14, cùng PR #39 | Claude |
| [NH-16](phieu/nhan/NH-16.md) | Chạy trước repo demo để làm nóng cache (T4, phần Nhân) | 04:00 → 05:00, cùng NH-12 | Không dùng Claude |

# 02 — Phiếu việc của Minh (Engine Tầng 1–2)

> Người: **Minh**. Vai trò: parser, danh bạ tên, đồ thị gọi hàm, lát cắt, node, xếp hạng, nhóm bài, Java/Spring; slide chính sau đóng băng.
> Ranh giới với Thiện (ghi chú 2): Minh giữ `src/server/engine/graph/*` và `src/server/engine/index.ts`. Thiện giữ `src/server/engine/ingest/*`. Hai bên nối bằng `IngestSource` (đầu vào) và `IngestOutput` (đầu ra Tầng 0) trong `src/contracts/engine-internal.ts`, và 2 hàm: `runIngest(src)` của Thiện, `buildGraph(input)` của Minh.
> Luật chung cho mọi phiếu: xem đầu file [`02_PHIEU_THIEN.md`](02_PHIEU_THIEN.md).

## Danh sách phiếu của Minh

Mỗi mã phiếu là 1 file trong thư mục [`phieu/minh/`](phieu/minh/). Đầu mỗi file là **prompt dán cho Claude** (hoặc ghi rõ phiếu không dùng Claude). Làm theo đúng thứ tự giờ.

| Mã | Tên việc | Giờ | Cách làm |
| :-- | :-- | :-- | :-- |
| [MI-01](phieu/minh/MI-01.md) | Contracts engine và kiểu nối với Tầng 0 | 12:20 → 13:00 | Claude |
| [MI-02](phieu/minh/MI-02.md) | Parser Tree-sitter, bảng ngôn ngữ, grammar, bộ chạy thử | 13:00 → 14:00 | Claude |
| [MI-03](phieu/minh/MI-03.md) | Danh bạ tên và resolver TS/JS | 14:00 → 15:30 | Claude |
| [MI-04](phieu/minh/MI-04.md) | Đồ thị gọi hàm và điểm entry | 15:30 → 17:00 | Claude |
| [MI-05](phieu/minh/MI-05.md) | Lát cắt, node và tên bài | 17:00 → 18:30 | Claude |
| [MI-06](phieu/minh/MI-06.md) | Khử chu trình, xếp hạng, giữ tối đa 20 bài, nhóm và cạnh, điểm nhập engine | 18:30 → 19:30 | Claude |
| [MI-07](phieu/minh/MI-07.md) | Chạy repo TS dự phòng, sửa bài lỗi, test tất định | 19:30 → 20:30 | Claude |
| [MI-08](phieu/minh/MI-08.md) | Java và Spring Boot cho repo demo Q-03 | 20:30 → 23:00 | Claude |
| [MI-09](phieu/minh/MI-09.md) | Sửa theo repo demo đã chốt và các dòng engine của DoD | 23:00 → 00:30 | Claude |
| [MI-10](phieu/minh/MI-10.md) | Bàn giao engine trước khi ngủ | 00:30 → 01:00 | Không dùng Claude |
| [MI-11](phieu/minh/MI-11.md) | Kiểm engine theo DoD và sửa lỗi chặn demo | 04:00 → 05:30 | Claude (mẫu sửa lỗi, điền lỗi trước khi dán) |
| [MI-12](phieu/minh/MI-12.md) | Slide thuyết trình (người chính) và đoạn video Offline | 05:30 → 07:30 | Không dùng Claude |
| [MI-13](phieu/minh/MI-13.md) | Tập bấm demo và commit cuối | 07:30 → 09:00 | Claude (mẫu sửa lỗi, điền lỗi trước khi dán) |

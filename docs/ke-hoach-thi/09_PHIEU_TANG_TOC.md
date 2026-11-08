# 09 — Phiếu tăng tốc website

> Mục tiêu: người dùng bấm vào thì đa phần đã có sẵn. Việc nào bắt buộc phải chờ thì chờ ngắn và có báo đang làm gì.
> File này là **tổng quan và bảng theo dõi**. Từng phiếu nằm trong thư mục phiếu của người làm, cùng định dạng với các phiếu khác (prompt dán cho Claude, chi tiết phiếu, tiêu chí đạt). Mã **T1–T6** của bản đề xuất ứng với mã phiếu mới ở Mục 2.
> Luật chung (nhánh, 3 lệnh kiểm, commit nhỏ, không `git add -A`, không sửa `docs/`): xem đầu [`02_PHIEU_THIEN.md`](02_PHIEU_THIEN.md) và [`03_GIT_PUSH_PULL.md`](03_GIT_PUSH_PULL.md).
> Số đo "9 giây", "84 giây", "15 lần hỏi DB" là số của bản đề xuất. Mỗi phiếu có yêu cầu đo trước/sau: người làm ghi số thật vào PR, không chép lại số này.

## 1. Nguyên tắc giao việc

1. **Mỗi việc giao cho người đang giữ file đó**, để không ai sửa file của người khác.
2. **Việc nhỏ và nằm riêng file thì làm ngay.** NH-14, NH-15 (file của Nhân) làm ngay trên PR #39.
3. **Việc nằm chung file với task đang làm thì làm ké trong task đó.** TH-20 làm cùng TH-12 (`progress.ts`); làm riêng sẽ xung đột.
4. **Tính năng phải chạy đúng trước, tăng tốc sau**, trừ những việc rẻ và nằm riêng file.
5. **PH-16 chờ Phát xong phiếu đang làm** để không chen vào giữa phiếu của Phát (cùng file `workbench.ts`).

## 2. Chia việc, mã phiếu và thời điểm

| Mã gốc | Phiếu | Việc | Ai | Khi nào | Ước tính | File chính | Lý do giao người này |
| :-: | :-- | :-- | :-: | :-- | :-: | :-- | :-- |
| T1 | [NH-14](phieu/nhan/NH-14.md) | Chấm bài và giải thích đoạn chọn dùng flash-lite | Nhân | **Ngay**, gộp vào PR #39 (`nhan/cau-hoi-moi`) | ~15 phút | `gemini.ts`, `explain.ts`, `config.ts` (Thiện merge) | File của Nhân. Nhân đang đi trước lịch, còn trống tới 22:00 |
| T2 | [NH-15](phieu/nhan/NH-15.md) | Giới hạn thời gian chờ tối đa | Nhân | **Ngay**, sau NH-14, cùng PR #39 | ~10 phút | `gemini.ts`, `config.ts` | Cùng file với NH-14 |
| T6 | [TH-20](phieu/thien/TH-20.md) | Giảm số lần hỏi DB khi nộp bài | Thiện | Trong TH-12 (~22:00) | trong 60 phút của TH-12 | `progress.ts` | Sửa đúng các hàm Thiện đang chuyển sang `progress.ts`. Làm riêng sẽ xung đột |
| T3 | [PH-16](phieu/phat/PH-16.md) | Tính trước câu hỏi và phân tích | Phát | Sau phiếu Phát đang làm, **trước 22:30** | ~45 phút | `workbench.ts` | File store của Phát. Tác dụng lớn nhất; nên có trước NH-08 để lúc thử như giám khảo đo được tốc độ thật |
| T5 | [PH-17](phieu/phat/PH-17.md) | Báo từng bước khi chờ | Phát | Sau PH-16, nếu còn giờ | ~30 phút | `XRayPanel.tsx`, `AnswerBox.tsx`, … | Chỉ sửa giao diện, ít rủi ro, làm muộn cũng được |
| T4 | [NH-16](phieu/nhan/NH-16.md), [TH-21](phieu/thien/TH-21.md) | Chạy trước repo demo | Nhân và Thiện | 04:00, cùng NH-12 | — | không viết code | Phải làm trên bản đóng băng thì cache mới đúng |

Thứ tự khuyến nghị: **NH-14 → NH-15** (Nhân, ngay) · **TH-20** (Thiện, trong TH-12) · **PH-16** (Phát, trước 22:30) · **PH-17** (Phát, nếu còn giờ) · **NH-16 + TH-21** (04:00).

## 3. Phụ thuộc và xung đột file

| Phiếu | Cần có trước | Dễ đụng với | Cách tránh |
| :-- | :-- | :-- | :-- |
| NH-14, NH-15 | PR #39 còn mở | NH-08 (cũng sửa `config.ts`, `grade.ts`) | Làm tiếp **trên nhánh của #39**, không mở PR mới. Thiện xem dòng `config.ts` rồi merge cả #39 |
| TH-20 | TH-12 (cùng người, cùng PR) | NH-07 / NH-06 đang ghi tạm bằng `db.tx` trong `evaluate.ts`, `enrich.ts` | Thiện chốt tên tham số `ctx` trong `progress.ts`, Nhân đổi chỗ gọi (đã có trong `phieu/nhan/00_CHO_DOI.md` Mục 3). Chi tiết ở mục "Chia với Nhân" của TH-20 |
| PH-16 | PH-09 đã merge; không cần sửa server | PH-10, PH-11 (cùng sửa `workbench.ts`) | Chỉ bắt đầu khi Phát không còn PR nào đang mở trên `workbench.ts`; `git pull` ngay trước khi tạo nhánh |
| PH-17 | Nên có PH-16 trước | PH-07, PH-08 đã merge | Chỉ thêm chữ chờ, không đổi bố cục (giữ khớp `docs/prototype.html`) |
| NH-16, TH-21 | TH-17 (đóng băng 04:00), NH-12 | — | Làm sau khi bản production lên, trước khi giám khảo vào |

## 4. Không làm

| Mã gốc | Việc | Lý do |
| :-- | :-- | :-- |
| T7 | Cache câu hỏi theo (bài, bậc) để người học thứ hai có câu hỏi ngay | **Trái quyết định D-37** (câu hỏi sinh riêng cho từng người). Muốn làm thì cả nhóm phải quyết lại D-37 trước; không có phiếu |
| T8 | Streaming, chữ hiện dần khi AI đang viết | Tốn công nhất. Chỉ xét nếu còn dư giờ sau khi xong các phiếu trên và đã đo lại |

## 5. Điều cần cả nhóm biết

- **Thời gian xấu nhất của NH-15** tính theo code: ANALYZE/QUESTIONS ≈ 32,5 giây, GRADE/EXPLAIN ≈ 20,5 giây. Kế hoạch ghi "còn khoảng 25 giây", chưa khớp. Nhân đo lại và báo số thật; muốn ≤ 25 giây thì cả nhóm quyết (hạ `LLM_PRIMARY_TIMEOUT_MS` hoặc bỏ fallback ở lượt đầu).
- **NH-14 đổi model chấm bài**: không merge trước khi Nhân chạy lại bài đo chấm trên N3.
- **PR #39 và `config.ts`**: đã có sẵn dòng contracts của NH-08 chờ Thiện xem; NH-14 và NH-15 thêm vào cùng PR, Thiện xem một lượt.

## 6. Theo dõi

Cập nhật trạng thái vào [`08_TIEN_DO_PHIEU.md`](08_TIEN_DO_PHIEU.md) theo cách đã ghi ở đó (thêm mục "Tăng tốc" khi có phiếu đầu tiên merge). Mỗi người nhắn nhóm "đã merge <mã phiếu>" như `00_CAM_TAY_CHI_VIEC.md` Mục 3.

| Phiếu | Người | Trạng thái | PR | Số đo trước → sau |
| :-- | :-: | :-: | :-: | :-- |
| NH-14 | Nhân | ⬜ | #39 (cùng PR) | thời gian chấm: ? → ? |
| NH-15 | Nhân | ⬜ | #39 (cùng PR) | trường hợp xấu nhất: ? → ? |
| TH-20 | Thiện | 🔄 | #64 và nhánh `thien/th-20-it-lan-hoi-db` | số câu SQL trong transaction, lần nộp kết thúc bài: 11 → 9 (mock `tx`) |
| PH-16 | Phát | ⬜ | — | chờ câu hỏi sau "Bắt đầu trả lời": ? → ? |
| PH-17 | Phát | ⬜ | — | — |
| NH-16 | Nhân | ⬜ | — | repo demo, tài khoản mới: ? → ? |
| TH-21 | Thiện | ⬜ | — | `minScale` = 1, cache còn khớp sau deploy |

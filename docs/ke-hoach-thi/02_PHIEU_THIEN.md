# 02 — Phiếu việc của Thiện (Trưởng tích hợp + Tầng 0 engine)

> Người: **Thiện**. Vai trò: khung dự án, contracts, DB, API phiên học, Tầng 0 của engine (ghi chú 2), deploy Cloud Run, giữ quyền merge.
> Quyền merge dự phòng khi Thiện ngủ (00:30–03:30): **Nhân**.
> **Deploy (GD-03, `07_GHI_CHU_VA_CHOT.md` Mục 1):** từ khi TH-19 chạy được, mọi lần deploy ở TH-10, TH-14, TH-16, TH-17, TH-18 đi qua pipeline: merge vào `main` ⇒ staging tự cập nhật ⇒ Thiện duyệt `production` trong tab Actions. Chỗ nào phiếu ghi "lệnh ngắn" thì đó là đường lùi khi pipeline đỏ. Chỉ Thiện duyệt `production`.
> Đọc trước: [`03_GIT_PUSH_PULL.md`](03_GIT_PUSH_PULL.md), [`05_DEPLOY_CLOUD_RUN.md`](05_DEPLOY_CLOUD_RUN.md).

## Luật chung cho mọi phiếu (áp cho cả 5 người)

1. **Repo thi bắt đầu trống, chưa có `src/`.** Mọi code được AI viết mới từ đầu trong giờ thi, theo phiếu này và `docs/spec/`. Phiếu đã ghi đủ tên file, tên hàm, chữ ký và luồng; không cần tra thêm nguồn nào khác.
2. Thư mục `docs/` (spec, kế hoạch, prototype, pitch…) được Thiện commit lên `main` lúc 12:00 trong **1 commit riêng** (TH-01); cả đội `git pull` là có. Trong giờ thi **không ai sửa, xóa hay add file trong `docs/`**. Không ai dùng `git add -f`.
3. Chỉ sửa file trong mục "File được sửa". Cần sửa file khác thì nhắn người giữ file đó. Cần sửa `src/contracts/*` sau 13:00 thì nhắn Thiện.
4. Tên hàm, tên kiểu, chữ ký ghi trong phiếu là **hợp đồng giữa 5 người**. Không tự đổi tên. Muốn đổi thì nhắn người dùng hàm đó trước.
5. Mỗi phiếu làm trên nhánh `<ten>/<ma-phieu>`, ví dụ `thien/th-05`. Commit nhỏ, khoảng 200 dòng trở xuống. Message có dạng `feat(phạm-vi): việc đã làm`.
6. Trước khi mở PR: chạy `npm run typecheck`, `npm run lint`, `npm test` đều xanh.
7. Agent chạy quá 30 phút chưa xong thì dừng, chia nhỏ phiếu. Làm lại tối đa 1 lần, vẫn sai thì người tự code tay.
8. Con số lấy từ `CONFIG` của `docs/spec/02_CONTRACTS.md` Mục 1, không tự đặt. Không bịa số đo.
9. Commit bằng chính tài khoản của mình. Không dùng `--date`, không đặt `GIT_COMMITTER_DATE`, không sửa thời gian commit.
10. Test cần DB thì giả lập `db` và `tx` bằng mock của vitest để CI chạy được (CI không có Postgres). Kiểm với Supabase thật làm tay trên máy, ghi kết quả vào PR.
11. Sau 04:00 chỉ merge 2 loại PR: nhãn `fix-demo` (lỗi chặn demo) và nhãn `sau-dong-bang` (bundle Offline, sửa hiển thị nhỏ của mảng độc lập, test hồi quy, README, commit cuối). Không loại nào được thêm tính năng.
12. PR nằm trên đường găng (`04_TIMELINE_VA_PHU_THUOC.md` Mục 2) được merge ngay khi CI xanh, không chờ cửa sổ merge.
13. `Prompt giao agent` của mỗi phiếu chép nguyên văn vào AI. Nếu AI hỏi lại thì trả lời bằng phiếu và spec, không tự thêm yêu cầu. Phiếu sửa lỗi (sau đóng băng) tự viết prompt theo đúng 4 câu: (1) "Hãy đọc kỹ file `docs/spec/<file>.md` (mục …) cùng với file `src/…` bị lỗi trước khi viết code." (2) "Tạo mới và chỉ chỉnh sửa các file sau: …; giữ nguyên mọi tên hàm và chữ ký đang export." (3) "Triển khai luồng xử lý gồm: tái hiện lỗi …, sửa …; lưu ý không thêm tính năng, và tuyệt đối không khóa cứng người dùng ở bước …" (4) "Tránh các lỗi sau: …; sau khi viết xong, hãy tự chạy lệnh `npm run typecheck`, `npm run lint`, `npm test` để đảm bảo pass 100%."
14. **Cách làm mỗi phiếu với Claude:** mở file phiếu `docs/ke-hoach-thi/phieu/<ten>/<MÃ>.md`, chép nguyên khối "Prompt dán cho Claude" ở Mục 1 vào Claude (mở trong thư mục repo thi). Claude tự tạo nhánh, đọc tài liệu, code, chạy 3 lệnh kiểm, commit nhỏ, push và mở PR bằng `gh`. Người làm chỉ trả lời khi Claude hỏi, thử tay theo "Tiêu chí đạt", rồi **tự bấm merge PR của mình** trên GitHub khi CI xanh ("Create a merge commit"). PR sửa `src/contracts/*` thì Thiện bấm merge. Phiếu ghi "Không dùng Claude" thì làm tay theo mục Yêu cầu. **Quý dùng Codex** thay cho Claude, cách làm giống hệt.

## Danh sách phiếu của Thiện

Mỗi mã phiếu là 1 file trong thư mục [`phieu/thien/`](phieu/thien/). Đầu mỗi file là **prompt dán cho Claude** (hoặc ghi rõ phiếu không dùng Claude). Làm theo đúng thứ tự giờ.

| Mã | Tên việc | Giờ | Cách làm |
| :-- | :-- | :-- | :-- |
| [TH-01](phieu/thien/TH-01.md) | Khung dự án và commit đầu | 12:00 → 12:20 | Claude (đẩy thẳng lên main) |
| [TH-02](phieu/thien/TH-02.md) | Contracts phần chung và cờ menu | 12:20 → 13:00 | Claude |
| [TH-03](phieu/thien/TH-03.md) | CI tối thiểu và thử luồng PR | 13:00 → 13:20 | Claude |
| [TH-04](phieu/thien/TH-04.md) | Bản khung đầu tiên lên Cloud Run, có Vercel dự phòng | 13:20 → 14:30 | Claude |
| [TH-19](phieu/thien/TH-19.md) | Pipeline deploy: Dockerfile, 2 image, staging, smoke, duyệt production | 14:30 → 16:15 (song song TH-05, TH-06, cửa sổ Claude thứ 2) | Claude |
| [TH-05](phieu/thien/TH-05.md) | Bảng DB, kết nối Postgres, lỗi API, log | 14:30 → 15:30 | Claude |
| [TH-06](phieu/thien/TH-06.md) | Đăng nhập GitHub và `/api/me` gọi 1 lần | 15:30 → 16:15 | Claude |
| [TH-07](phieu/thien/TH-07.md) | `/api/ingest`, phiên học, snapshot và cache RAM (engine giả) | 16:15 → 17:00 | Claude |
| [TH-08](phieu/thien/TH-08.md) | Tầng 0 phần A: link, kiểm repo, tải zip | 17:00 → 18:00 | Claude |
| [TH-09](phieu/thien/TH-09.md) | Tầng 0 phần B: giải nén, lọc, che secret, chọn file, vân tay tối giản | 18:00 → 19:15 | Claude |
| [TH-10](phieu/thien/TH-10.md) | Ghép engine thật, lát dọc 1, deploy và kiểm Vertex AI | 19:15 → 20:00 | Claude |
| [TH-11](phieu/thien/TH-11.md) | Danh sách phiên, mở lại phiên, API tiến độ | 20:00 → 21:00 | Claude |
| [TH-12](phieu/thien/TH-12.md) | `progress.ts`: ghi BKT trong transaction, kết thúc run, mở khóa | 21:00 → 22:00 | Claude |
| [TH-13](phieu/thien/TH-13.md) | Trang chủ: "Tiếp tục học" và mở lại phiên | 22:00 → 23:00 | Claude |
| [TH-14](phieu/thien/TH-14.md) | Deploy lát dọc 2 và đo lần 1 trên Cloud Run | 23:00 → 23:45 | Không dùng Claude |
| [TH-15](phieu/thien/TH-15.md) | API persona và API lịch sử (cho mảng độc lập) | 23:45 → 00:15 | Claude |
| [TH-16](phieu/thien/TH-16.md) | Diễn tập đường lùi và giao agent trước khi ngủ | 00:15 → 00:30 | Không dùng Claude |
| [TH-17](phieu/thien/TH-17.md) | Đóng băng tính năng, Definition of Done, deploy production | 03:30 → 05:00 | Không dùng Claude |
| [TH-18](phieu/thien/TH-18.md) | Trực sửa lỗi chặn demo, nộp slide, commit cuối | 05:00 → 09:15 | Claude (mẫu sửa lỗi, điền lỗi trước khi dán) |

### Phiếu tăng tốc (thêm sau, xem [`09_PHIEU_TANG_TOC.md`](09_PHIEU_TANG_TOC.md))

| Mã | Tên việc | Giờ | Cách làm |
| :-- | :-- | :-- | :-- |
| [TH-20](phieu/thien/TH-20.md) | Giảm số lần hỏi DB khi nộp bài, làm cùng TH-12 (T6) | 21:00 → 22:00, trong TH-12 | Claude (dán thêm vào prompt TH-12) |
| [TH-21](phieu/thien/TH-21.md) | Cloud Run min-instances và kiểm cache sau deploy (T4, phần Thiện) | 04:00 → 05:00, cùng TH-17 và TH-18 | Không dùng Claude |

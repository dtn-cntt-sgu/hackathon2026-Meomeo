# 06 — Thuyết trình, Definition of Done, lịch luyện, việc trước giờ thi

> Kịch bản gốc: `docs/pitch/KICH_BAN_DEMO.md` (bản 5 phút, Mục 2), phản biện: `docs/pitch/PHAN_BIEN_BGK.md`. File này chỉ ghi phần **đổi so với bản gốc** do cắt tính năng, cùng lịch tập và checklist.

## 1. Thuyết trình

### 1.1. Vai trên sân khấu (Q-10, mặc định)

| Vai | Người | Lý do |
| :-- | :-- | :-- |
| Nói chính, cả 5 phút | **Nhân** | Hiểu AI + BKT (phần ấn tượng nhất); ngủ 05:00–08:30, sát giờ lên |
| Bấm máy | **Phát** | Người dựng giao diện; ngủ 05:00–08:00 |
| Trả lời phản biện hạ tầng, quy trình, luật thi | Thiện | Người deploy |
| Trả lời phản biện engine | Minh | Người làm engine |
| Bấm giờ, cầm điện thoại có mạng di động dự phòng | Quý | — |

Kịch bản gốc ghi "Vai A nói, Vai B bấm, Vai C nói". Giờ gộp lại: **Nhân nói thay cả Vai A và Vai C**, Phát bấm thay Vai B.

### 1.2. Câu phải đổi so với kịch bản gốc

| Chỗ trong kịch bản gốc | Đổi thành | Vì sao |
| :-- | :-- | :-- |
| "mới kiểm chứng trên TS/JS và Python" (Mục 7.1) | "đã chạy trên TS/JS" + "Java Spring" (chỉ nói nếu cổng G5 đạt) | Python bị cắt (B03) |
| Phút 4:20 cửa sổ Tổng quan có "Nhận định của AI" | Tổng quan chỉ có phần do code dựng, 0 token | AI tổng quan bị cắt (B06) |
| Phút 3:50 persona `SENIOR_RUSTY` | Giữ nếu Q-14 cho bật `DEMO_MODE` trên bản demo; không thì làm trong Offline | Production đặt `DEMO_MODE="false"` |
| Mọi con số độ trễ | Đọc số trong sổ đo lúc 04:00 kèm giờ đo; số chưa đo thì nói "mục tiêu, chưa đo" | Luật không bịa số đo |
| Bản 7 phút: mở `review/` | Mở sổ duyệt tay của đội (ngoài repo thi) | `review/` không nằm trong repo thi |

### 1.3. Câu dẫn khi chờ AI (mỗi lần chấm có thể mất hơn 10 giây)

- Khi bấm Nộp: "Trong lúc AI chấm, em nói thêm: điểm Đạt không dựa vào câu dài, mà dựa vào việc nêu đủ các ý bắt buộc."
- Khi mở bài mới: "Phần khung bài này do code dựng nên hiện ngay. Lời giải thích từng bước là AI viết, đang tải."
- Chờ quá 20 giây: chuyển sang tab Vercel. Vẫn chậm thì bật Offline. Câu chuyển: "Để kịp giờ, em chuyển sang bản ghi lại từ chính hệ thống lúc 4 giờ sáng nay."

### 1.4. Khung slide (Minh làm ở MI-12, 05:30–07:30)

1. Vấn đề: sinh viên đọc code dự án thật không biết bắt đầu từ đâu.
2. Giải pháp 1 câu + ảnh trang học.
3. Bản đồ do code dựng: số bài, `ingest_ms + engine_ms` (số đo thật lúc 04:00), 0 token.
4. X-Ray: tour từng bước, điểm hay, điểm dở "Nhận định của AI".
5. Feynman: sai ⇒ gợi ý ⇒ đúng ⇒ BKT đổi điểm ⇒ bài xanh.
6. Cổng gác: chặn tên bịa (test GUARD-04), giới hạn nói thật (`PHAN_BIEN_BGK.md` Mục 4).
7. Hạ tầng: Cloud Run + Supabase + Vertex AI, đường lùi Vercel và Offline.
8. Kết + đội 5 người.

Slide dự phòng (chỉ mở khi giám khảo hỏi): PageRank/Tarjan, BKT, sổ duyệt tay (AI nêu N mục, đúng X/N).

Tên file theo cú pháp thể lệ `[Tên đội thi]_[Tên sản phẩm]` (Mục VII). Thiện nộp lúc 09:15, Minh dự phòng.

## 2. Definition of Done đã lọc (chạy ở TH-17, 04:00)

Nguồn: `spec/50` Mục 5. "Đã cắt" nghĩa là không kiểm, và không được nhắc trên sân khấu.

| # | Dòng DoD | Trạng thái | Người kiểm |
| :-- | :-- | :-- | :-- |
| 1 | Dán link repo demo ⇒ 6–20 bài; đồng hồ hiện `ingest_ms + engine_ms` thật | Giữ | Minh |
| 2 | Cùng link 2 lần ⇒ cùng `node_id`, cùng tọa độ | Giữ | Minh |
| 3 | Điểm bắt đầu cùng hàng; node thuật toán có cạnh nối | Giữ phần điểm bắt đầu; phần node thuật toán **đã cắt** (B13) | Minh |
| 4 | Test entry mobile, entry `main` | **Đã cắt** (B02) | — |
| 5 | Repo private, sai link, rỗng, quá lớn ⇒ đúng mã lỗi và thông điệp | Giữ | Thiện |
| 6 | `tiangolo/fastapi` ⇒ cảnh báo repo lớn | **Đã cắt** (B01, B03) | — |
| 7 | Mọi bài có phân tích, có điểm hay + điểm dở; không tên bịa (kiểm tay 3 bài) | Giữ | Nhân |
| 8 | Persona `NEWBIE`: kịch bản A3 → A7 | Giữ | Nhân |
| 9 | "Bỏ qua câu này" ⇒ câu ❌, hiện đáp án, bài đỏ, bài con mở kèm ⚠ | Giữ | Phát |
| 10 | Mọi kỹ năng đã thạo vẫn hỏi 1 câu (D-34) | Giữ (test đơn vị) | Nhân |
| 11 | `SENIOR_RUSTY` ⇒ thanh nhạt + "đang mài mòn" | Giữ (online hoặc Offline theo Q-14) | Phát |
| 12 | Tải lại trang ⇒ tiến độ còn; mở lại từ "Tiếp tục học" | Giữ | Thiện |
| 13 | DevTools: không lộ `misconception`, đáp án câu chưa xong | Giữ | Nhân |
| 14 | Sửa `attempt_number` ⇒ `ERR_ATTEMPT_OUT_OF_SYNC` | Giữ | Nhân |
| 15 | `Ctrl+Shift+D` ⇒ Offline chạy hết kịch bản | Giữ | Nhân |
| 16 | Bố cục 3 cột, 2 chủ đề ở 1366×768; **khớp `prototype.html` (6 cặp ảnh)** | Giữ; bảng dưới và trình chiếu đầy đủ **đã cắt** (B09, B10) | Phát |
| 17 | Có bài tới `DATA_ACCESS`; Capstone không từ file test; không bài `<module>` | Giữ | Minh |
| 18 | Repo NestJS thứ hai | Làm nếu còn giờ | Minh |
| 19 | Mọi test xanh (`npx vitest run`) | Giữ | Thiện |
| 20 | Test tên bắt đầu `GUARD-04` chạy xanh | Giữ | Nhân |
| 21 | Bộ lọc an toàn: che email, SĐT, CCCD, secret; từ xấu ⇒ không mất lượt | Giữ | Nhân |
| 22 | `deploy.yml` staging ⇒ smoke ⇒ production | Giữ (GD-03, TH-19). Nếu đã bỏ pipeline ở cổng 00:00 thì ghi **Đã cắt** và không nhắc trên sân khấu | Thiện |
| 23 | `AI_DISABLED`, `/api/health`, `ai_usage` | Giữ (`ai_usage` tối giản) | Thiện |
| 24 | **Thêm:** 7 bài thử "giám khảo" của ghi chú 6 | Giữ | Nhân |
| 25 | **Thêm:** 5 bước kiểm nút Giải thích (ghi chú 4) | Giữ | Phát |
| 26 | **Thêm:** 1 request `/api/me` mỗi lần tải trang (ghi chú 3) | Giữ | Phát |

## 3. Lịch luyện thuyết trình (04:00–10:00)

Đây là lịch tập **duy nhất**. `04_TIMELINE_VA_PHU_THUOC.md` và các phiếu chỉ trỏ về bảng này.

| Giờ | Ai | Làm gì |
| :-- | :-- | :-- |
| 04:30–05:00 | Nhân | Trong lúc script ghi bundle chạy (NH-12): đọc kịch bản 1 lần, đánh dấu câu phải đổi (Mục 1.2) |
| 05:30–07:30 | Minh | Làm slide. Ghi chú cho người nói ngay dưới mỗi slide |
| 06:00–06:30 | Thiện | Tự tập trả lời phản biện hạ tầng và luật thi (`PHAN_BIEN_BGK.md` Mục 5 E, F), mỗi câu bản 30 giây |
| 07:30–07:40 | Thiện | Duyệt slide, sửa số đo cho khớp sổ đo |
| 07:40–08:00 | Thiện + Minh | Tập trả lời 10 câu phản biện khó nhất trong `PHAN_BIEN_BGK.md` Mục 5 (B, C, E, F), mỗi câu bản 30 giây |
| 08:00–08:20 | Minh nói thay, Phát bấm, Quý bấm giờ | **Tổng duyệt 1** (người nói chính ngủ tới 08:30) |
| 08:30–08:45 | Cả 5 | Push hết việc còn lại (`03_GIT_PUSH_PULL.md` Mục 6) |
| 08:50–09:10 | **Nhân nói, Phát bấm**, Quý bấm giờ | **Tổng duyệt 2** trên production |
| 09:10–09:30 | Nhân nói, Phát bấm, Quý bấm giờ, Minh hỏi ngang | **Tổng duyệt 3**, có người hỏi ngang ở 3 chỗ bất kỳ (`KICH_BAN_DEMO.md` Mục 5). Thiện nộp file lúc 09:15 |
| 09:30–10:00 | Phát | Chuẩn bị máy demo (Mục 3.1) |

Mỗi câu trả lời dùng trên sân khấu phải đã chạy 3/3 lần ổn định (NH-11). Câu nào không ổn định thì dùng Offline.

### 3.1. Checklist máy demo

**30 phút trước khi lên:**
- [ ] Máy demo cắm sạc, tắt thông báo, tắt cập nhật tự động. Độ phân giải 1366×768 hoặc cao hơn, zoom trình duyệt 100%.
- [ ] Tab 1: Cloud Run production, đã đăng nhập tài khoản demo. Tab 2: Vercel, đã đăng nhập. Tab 3: `?offline=1`.
- [ ] Nạp sẵn grammar bằng cách quét **một repo khác**. Không quét repo demo trong 10 phút trước khi lên (`CONFIG.INGESTION_CACHE_TTL_MS`), để số trên đồng hồ là lần tải thật.
- [ ] Bấm "Xóa tài khoản" rồi đăng nhập lại nếu cần tiến độ trống.
- [ ] Điện thoại phát mạng di động sẵn sàng (Quý cầm).

**2 phút trước:** đóng mọi cửa sổ khác; mở sẵn trang chủ; Phát đặt tay lên phím `Ctrl+Shift+D`.

## 4. Việc trước giờ thi

### 4.1. Sáng 07/11, trước 10:00 (không phải code)

- [ ] Các câu chờ chốt đã chốt sáng 07/11 (`07_GHI_CHU_VA_CHOT.md` Mục 1). Minh điền repo TS/JS dự phòng trước 11:30.
- [ ] Thiện làm `05_DEPLOY_CLOUD_RUN.md` Mục 2 (gồm phần GCP, Supabase cho TH-19). Đánh thức Supabase.
- [ ] Mỗi người đọc phiếu của mình **và** phiếu của người giao việc cho mình.
- [ ] Mỗi người soạn sẵn prompt agent cho 3 phiếu đầu, lưu ngoài repo. Prompt chỉ là chữ, không có code.

### 4.2. 10:00–12:00 ngày thi

| Việc | Ai | Xong khi |
| :-- | :-- | :-- |
| Điểm danh với BTC | Cả 5 | — |
| Node 22 (`node -v`), `npm -v`, `git --version`, `gcloud --version` | Cả 5 | Đúng phiên bản |
| `git config user.email` đúng email đã xác minh trên GitHub của mình | Cả 5 | Thiện xem tận mắt |
| Clone repo thi vào thư mục mới, **trống**; trong thư mục làm việc của agent không có file code nào từ trước | Cả 5 | — |
| Clone nhánh `docs-thi` vào thư mục riêng (không phải repo thi) để chép `docs/` ở TH-01 | Thiện | — |
| `docs/` lên repo thi sau 12:00 trong 1 commit riêng của Thiện (TH-01, sau `create-next-app` vì lệnh này cần thư mục trống); 4 người còn lại chỉ `git pull`, không tự chép (`03_GIT_PUSH_PULL.md` Mục 2) | Cả 5 | Agent đọc được |
| Key AI Studio riêng chạy được ở máy | Cả 5 | 1 lần gọi thử thành công |
| Thử mạng hội trường và mạng di động | Quý | Ghi tốc độ vào sổ đo |
| Tạo repo thi **public, trống**, không tick README/license/.gitignore; mời 4 người; cấp `Maintain` cho Nhân | Thiện | 4 người đã nhận lời mời |
| Claude Code chạy được trên máy (Quý: Codex CLI); `gh --version` có; `gh auth login` bằng tài khoản GitHub của **chính mình** (`gh auth status` hiện đúng tên) | Cả 5 | Claude mở được trong 1 thư mục thử |
| Nhãn PR `fix-demo` và `sau-dong-bang`: **không** tạo trước giờ thi (repo phải trống khi BTC kiểm). Thiện tạo lúc 13:00 trong TH-03 | Thiện | — |
| Nộp link repo cho BTC | Thiện | BTC xác nhận |
| Hỏi BTC: Q-01 (giờ ngừng code), Q-15 (áp phích), Q-17 (slide chuẩn bị trước), **xác nhận được commit thư mục `docs/` (tài liệu đặc tả soạn trước, không phải code) vào repo thi, tốt nhất bằng văn bản** | Thiện | Ghi câu trả lời vào `07_GHI_CHU_VA_CHOT.md` Mục 1 |
| **Không ai commit trước 12:00** | Cả 5 | — |

# 01 — Kiểm kê tính năng và thứ tự cắt (chỉ mở khi trễ)

> **Chỉ dùng khi trễ.** Lúc làm bình thường, chỉ làm theo phiếu (`phieu/<ten>/<MÃ>.md`) và `docs/spec/`. File này cho biết tính năng nào giữ, tính năng nào đã cắt từ đầu, và **cắt tiếp theo thứ tự nào** khi một cổng ở [`04_TIMELINE_VA_PHU_THUOC.md`](04_TIMELINE_VA_PHU_THUOC.md) Mục 6 báo trễ.
> Cột "Phiếu" cho biết phiếu nào làm tính năng đó. Đường dẫn file lấy theo mục "File được sửa" của phiếu.
> Độ khó: **D** dễ (≤ 1 lượt agent 30–45 phút) · **V** vừa (2–3 lượt) · **K** khó (≥ 4 lượt, dễ sai). Đây là ước tính, chưa đo.

## 1. Luật chọn

- **Giữ:** giám khảo thấy được trong 5 phút demo (`pitch/KICH_BAN_DEMO.md` Mục 2), hoặc có trong danh sách không bao giờ cắt.
- **Tối giản:** cần có để luồng chính chạy, nhưng chỉ làm đường thẳng: không xử lý ca hiếm, không có màn hình riêng.
- **Cắt:** giám khảo khó thấy. Cắt nghĩa là **không code trong giờ thi**. Nếu còn nút thì ẩn nút.

**Danh sách không bao giờ cắt:** bản đồ tất định · phần X-Ray · câu hỏi + chấm + gợi ý · BKT ở server · offline mode · cổng gác · đăng nhập GitHub · bản chạy trên Cloud Run · cả 5 người đều có commit.

## 2. Nhóm A — tính năng giữ lại

| Mã | Tính năng | Quyết định | Độ khó | Lưu ý khi làm | Phụ thuộc | Phiếu | Người |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| A01 | Đăng nhập GitHub qua Supabase (D-44) | Giữ | V | Site URL còn `localhost`; sau proxy Cloud Run `request.url` mang host nội bộ, phải dùng `x-forwarded-host` (`doc-de-hieu/01_deploy.md` Mục 4.4) | Supabase OAuth App làm trước giờ thi | TH-06 | Thiện |
| A02 | Dán link → tải zip trong RAM (Tầng 0) | Giữ | V | GitHub có thể trả 429 khi thử repo lớn liên tục | contracts engine | TH-08 | Thiện |
| A03 | Giải nén, lọc rác, che secret, chọn ≤ `CONFIG.MAX_CLEAN_FILES` file | Giữ | V | File test có thể thành bài Capstone; thư mục `__MACOSX`; tên file hoa thường; tỉ lệ nén (zip bomb) | A02 | TH-09 | Thiện |
| A04 | Kéo thả `.zip` ≤ `CONFIG.MAX_UPLOAD_BYTES` | Giữ | D | Kiểm cỡ ở client trước khi gửi | A03 | TH-07 (server), PH-04 (UI) | Thiện, Phát |
| A05 | Vân tay tối giản: ngôn ngữ chính, framework | **Tối giản** | D | Chỉ giữ `language_breakdown`, `detected_framework` | A03 | TH-09 | Thiện |
| A06 | Parser Tree-sitter WASM (TS, TSX, JS, Java) | Giữ | V | Lệch ABI grammar (D-32); nhớ `serverExternalPackages: ["web-tree-sitter"]` và `outputFileTracingIncludes` cho `.wasm`, `queries/*.scm` (D-70) | grammar `.wasm` từ bản phát hành chính thức | MI-02 | Minh |
| A07 | Danh bạ tên, resolver TS/JS | Giữ | K | Import qua barrel, alias trong `tsconfig` | A06 | MI-03 | Minh |
| A08 | Đồ thị gọi hàm, điểm entry Express/Nest/Next | Giữ | K | — | A07 | MI-04 | Minh |
| A09 | Lát cắt và node (`trace_steps`, `snippet`, `snippet_line_map`, `dto_snippet`) | Giữ | K | Chặn node 0 bước và bước `<module>` | A08 | MI-05 | Minh |
| A10 | Khử chu trình, xếp hạng, giữ ≤ `CONFIG.DISPLAY_MAX_NODES` bài (D-88) | Giữ | V | — | A09 | MI-06 | Minh |
| A11 | Nhóm bài, cạnh phụ thuộc (D-84, D-85) | **Tối giản**: thực thể lấy theo đoạn đầu route, không đọc thực thể từ code | V | — | A09 | MI-06 | Minh |
| A12 | Tên bài do code đặt | **Tối giản**: route + tên hàm | D | — | A09 | MI-05 | Minh |
| A13 | Java + Spring Boot (repo demo Q-03 của `spec/00`) | Giữ, **có cổng G5 lúc 23:00** | K | Nhận đuôi `.java`, thư mục `src/main/java` lồng sâu | A06–A09 | MI-08 | Minh |
| A14 | Phiên học, snapshot Postgres (D-59), mở lại phiên | Giữ | V | — | A03, DB | TH-07, TH-11 | Thiện |
| A15 | `analyze-node`: bước, điểm hay, điểm dở, kỹ năng | Giữ | V | JSON bị cắt giữa chừng do trần token ra; cổng gác chặt quá sẽ lọc hết điểm dở; `summary` phải nói bài làm gì | A09, Gemini | NH-05 | Nhân |
| A16 | `enrich-node`: câu hỏi theo kế hoạch BKT | Giữ | K | Câu hỏi nói sai quan hệ giữa các dòng; câu FLOW chép X-Ray là trả lời được; **câu hỏi phải dễ với người mới (ghi chú 1)** | A15, A19 | NH-03 (kế hoạch), NH-06 | Nhân |
| A17 | `evaluate-feynman`: chấm, gợi ý 3 nấc | Giữ | K | **Luật Đạt nới, gõ bậy vẫn có gợi ý (ghi chú 6)** | A16, A19 | NH-07 | Nhân |
| A18 | Bỏ qua câu → hiện đáp án | Giữ | D | — | A17 | NH-07 | Nhân |
| A19 | BKT ở server, mở khóa node | Giữ | V | — | DB | NH-03 (hàm thuần), TH-12 (`progress.ts`) | Nhân, Thiện |
| A20 | Cổng gác: tên bịa, công nghệ ngoài repo, chèn lệnh | Giữ, **nới** (chỉ chặn 3 lỗi nặng, Q-09) | V | Chặn rồi gọi lại AI làm chậm `enrich-node` (ghi chú 3) | — | NH-04 | Nhân |
| A21 | Bộ lọc an toàn: che email, SĐT, CCCD, secret, chặn từ xấu (D-65) | Giữ | D | — | — | NH-03 | Nhân |
| A22 | Offline mode (`Ctrl+Shift+D`, `mock_bundle.json`) | Giữ | V | Bundle ghi **trong giờ thi**, sau khi đóng băng | A15–A19 | NH-10, NH-12 (logic), PH-12 (UI) | Nhân, Phát |
| A23 | Trang học 3 cột theo `prototype.html` | Giữ | V | **Phải giống prototype (ghi chú 5)** | fixture | PH-05 … PH-09, PH-13 | Phát |
| A24 | Monaco chỉ đọc, mỗi file 1 tab, chỉ code của bước | Giữ | V | Tự host Monaco, không tải CDN | A23 | PH-06 | Phát |
| A25 | Tour X-Ray: thẻ vai trò → bước → tóm tắt | Giữ | V | — | A24, A15 | PH-07 | Phát |
| A26 | Feynman: câu, ô trả lời, kết quả, gợi ý mở bước, đáp án mẫu | Giữ | V | Kết quả hiện trong cột, không dùng hộp thoại (ghi chú 5) | A17 | PH-08 | Phát |
| A27 | Giải thích đoạn chọn (D-82) | Giữ | V | **Nút phải luôn hiện (ghi chú 4)** | A24 | NH-09 (server), PH-10 (UI) | Nhân, Phát |
| A28 | Mài mòn chỉ hiển thị (D-35) | Giữ | D | — | A19 | PH-09 | Phát |
| A29 | Persona demo (`SENIOR_RUSTY`) | Giữ | D | — | A19 | TH-15 (API), PH-11 (UI) | Thiện, Phát |
| A30 | `/api/health`, `AI_DISABLED`, hạn mức token phiên | Giữ | D | — | — | TH-04, NH-04 | Thiện, Nhân |
| A31 | Bản chạy Cloud Run (pipeline có staging) + Vercel dự phòng | Giữ | V | Revision Cloud Run, Vertex AI, đăng nhập về `*.run.app` cần lộ lỗi sớm từ 13:20 | A30 | TH-04, TH-19, TH-10, TH-14, TH-17 | Thiện |
| A32 | CI: typecheck, lint, test khi mở PR | **Tối giản** | D | — | — | TH-03 | Thiện |
| A33 | Trang chủ: đăng nhập, ô link, thả zip, "Tiếp tục học" | Giữ | V | Đồng hồ quét tách component riêng, không làm vẽ lại cả trang (ghi chú 3) | A01, A14 | PH-04, rồi TH-13 | Phát, rồi Thiện |
| A34 | Tổng quan nhịp 1 (facts, 0 API) | Giữ | D | — | A10 | PH-11 | Phát |
| A35 | Chủ đề tối mặc định, có chủ đề sáng; màu nhấn theo prototype (Q-11) | Giữ | D | Không dùng nền trắng cố định | — | PH-01 | Phát |

## 3. Nhóm B — râu ria, cắt hoặc làm tối giản

| Mã | Tính năng | Quyết định | Lý do (giám khảo có thấy không) | Tiết kiệm (ước tính) |
| :-- | :-- | :-- | :-- | :-- |
| B01 | Tải chọn lọc repo lớn (D-63) | Cắt | Repo demo nhỏ hơn `CONFIG.MAX_STREAM_BYTES` | 2–3 giờ engine |
| B02 | Go, Dart, tầng `STRUCTURAL`, entry mobile (D-57, D-58), React Native | Cắt | Đã cắt theo D-76 | — |
| B03 | Resolver Python | **Cắt từ đầu** (Q-19) | Repo demo không dùng Python. Pitch **không được nói** "đã kiểm chứng Python" (`06_THUYET_TRINH_VA_TRUOC_GIO_THI.md`) | 1–2 giờ |
| B04 | Nút "Báo sai" + bảng `dispute_reports` (D-22) | Cắt | Không có trong kịch bản demo | 1 giờ |
| B05 | Màn hình lịch sử `/history` | Chuyển sang mảng độc lập của Quý, link ẩn được | Không nằm trên đường găng | 1 giờ của nhóm chính |
| B06 | AI tổng quan + AI đặt tên bài (`analyze-overview`, D-83 phần AI) | Cắt, giữ nhịp 1 (`facts`) | Bớt 1 lời gọi AI | 2 giờ |
| B07 | `/report` (RadarChart), `/roadmap`, `/roadmap/[courseId]` | Cắt | Không có trong kịch bản demo | 2 giờ UI |
| B08 | ReactFlow + Dagre | Cắt (Q-20) | `spec/30` Mục 4: bản đồ là danh sách nhóm, không vẽ đồ thị. `position` gán theo tầng tô-pô đơn giản | Bớt gói nặng, 1 giờ |
| B09 | Kéo vạch chia khung, menu bố cục, bảng dưới `ProblemsPanel`, phím `Ctrl+Alt+J/B` | Cắt; giữ 2 nút ẩn/hiện cột như `prototype.html` | Không có trong kịch bản demo | 1,5 giờ UI |
| B10 | Chế độ trình chiếu | **Tối giản**: 1 nút phóng cỡ chữ code theo `CONFIG.UI_PRESENTATION_FONT_SCALE` | Có ích trên máy chiếu, bản đầy đủ thì tốn công | 0,5 giờ |
| B11 | Popover thẻ khái niệm trong X-Ray (D-81) | Cắt khỏi trang học. 16 thẻ hiển thị ở `/how-it-works` (Q-21) | Chip kỹ năng đã có nhãn + câu `skills[].reason` | 1 giờ UI |
| B12 | Chỉ số Uncle Bob I·A·D, độ phức tạp nhận thức trong "Chi tiết bài" | Cắt | `<details>` đóng sẵn, giám khảo không mở | 1,5 giờ engine |
| B13 | Node thuật toán `ALGORITHMIC_CORE`, nối D-56, chế độ B của prompt | Cắt | Repo web nghiệp vụ hầu như không có | 2 giờ |
| B14 | Chế độ `degraded` / PROCEDURAL đầy đủ | **Tối giản**: không có entry ⇒ `ERR_NO_ARCHITECTURAL_SLICE` | Repo demo có entry rõ | 1 giờ |
| B15 | Đổi thư mục phân tích (`subdir_override`), chip monorepo | Cắt | Không có trong demo | 1 giờ |
| B16 | "Học lại từ đầu" (D-42), chip `ENGINE_UPDATED` | Cắt | Thi chỉ có 1 bản engine; muốn làm lại thì dùng "Xóa tài khoản" | 0,5 giờ |
| B17 | Bảng chi phí `ai_usage` (D-66 L1/L2) | **Tối giản**: 1 lệnh INSERT, không có màn hình | Không hiện trên UI | 0,5 giờ |
| B18 | Staging S2, smoke test bằng bot, cổng duyệt production, 2 image Docker | **Giữ** (GD-03), làm ở **TH-19**, có cổng GP | 20:00 chưa tới production thì deploy tay; 00:00 vẫn đỏ thì bỏ pipeline (`05_DEPLOY_CLOUD_RUN.md` Mục 1) | — |
| B19 | Budget alert, Uptime check, CodeQL, Dependabot | Làm trên console **trước giờ thi** (không phải code), hoặc bỏ | Không thấy trên sân khấu | — |
| B20 | Lottie, `HeroArt`, glow, ping, hiệu ứng phóng node | Cắt; giữ chuyển màu và shimmer | Dễ gây giật trên máy yếu (ghi chú 3); bundle nặng | 0,5 giờ, bớt giật |
| B21 | Menu cài đặt nhiều mục | **Tối giản**: Đăng xuất, Xóa tài khoản, Mở Offline | — | 1 giờ |
| B22 | Kiểm hậu kỳ phức tạp của cổng gác: đếm bước FLOW, kiểm số dòng, đếm câu feedback | Chuyển sang **chỉ ghi log**, không chặn (Q-09) | Ghi chú 6; bớt gọi lại AI | Bớt độ trễ |
| B23 | Log chuẩn hóa đầy đủ (`spec/04` Mục 9) | **Tối giản**: `pino` 1 dòng JSON, không bao giờ log code hay câu trả lời | — | 0,5 giờ |
| B24 | Luồng UI riêng cho mã lỗi hiếm (451, gợi ý submodule…) | **Tối giản**: bảng `ERROR_MESSAGES` vẫn đủ mọi khóa (bắt buộc để biên dịch), không làm luồng riêng | — | 0,5 giờ |
| B25 | Xử lý nhiều tab cùng nộp ở client | **Tối giản**: server vẫn kiểm `ERR_ATTEMPT_OUT_OF_SYNC`, client chỉ tải lại run | — | 0,5 giờ |

## 4. Thứ tự cắt khi trễ ≥ 1 giờ

Đã cắt từ đầu: B01–B04, B06–B09, B11–B16. Pipeline (B18) có cổng riêng GP: 20:00 chưa tới production thì deploy tay, 00:00 vẫn đỏ thì bỏ pipeline.

Khi một cổng ở [`04_TIMELINE_VA_PHU_THUOC.md`](04_TIMELINE_VA_PHU_THUOC.md) Mục 6 báo trễ, cắt tiếp **từ trên xuống**:

1. **Java/Spring (A13):** demo bằng repo TS/JS dự phòng (Q-02). Người quyết: Thiện cùng Minh, ở cổng G5 (23:00).
2. **`/history` (B05):** ẩn link bằng `src/lib/nav.ts` (Thiện sửa 1 dòng).
3. **Persona online (A29):** chỉ dùng persona trong Offline.
4. **Phần "Còn dùng ở" của popover giải thích (A27):** chỉ còn "Là gì" và "Ở đây".
5. **Chủ đề sáng (A35):** chỉ giữ chủ đề tối.
6. **Danh sách "Tiếp tục học" (A33):** chỉ giữ mở lại phiên gần nhất từ `sf.last_session`.

Không bao giờ cắt: danh sách ở Mục 1.

## 5. Kết luận khả thi

- Phạm vi giữ lại (nhóm A, sau khi tối giản) có **35 mục**. Đường găng là engine (Minh) và trang học (Phát). Tải theo giờ ở `04` Mục 3.
- Mốc đóng băng 04:00 **chỉ khả thi** khi: (1) cắt nhóm B như bảng trên; (2) engine làm TS/JS trước, Java chốt ở cổng G5 (23:00); (3) pipeline chạy song song, đỏ thì deploy tay theo cổng GP, không để gỡ lỗi pipeline lấn vào đường găng; (4) mỗi agent chạy quá 30 phút thì chia nhỏ, làm lại tối đa 1 lần.
- Nếu lát dọc 1 (cổng G4, 20:00) trễ quá 1 giờ thì **không còn khả thi** giữ cả Java lẫn giải thích đoạn chọn đầy đủ. Khi đó cắt theo Mục 4.

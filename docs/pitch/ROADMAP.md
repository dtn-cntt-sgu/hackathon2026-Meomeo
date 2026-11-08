# LỘ TRÌNH SAU CUỘC THI — SIMPLIFEY V2 PRO

> **Mục đích:** lộ trình sau hackathon (công nghệ, thuật toán, cách đo, KPI) để trình bày và trả lời BGK, nhất là ở vòng 3 ngày 09/11/2026 (D-47). Gộp từ `04_ROADMAP_KY_THUAT/ROADMAP_KY_THUAT_CHI_TIET.md` và `KyVong45.md` Phần III, đã sửa theo thiết kế mới và định hướng D-33.
> **Không dùng để code. Khi lệch với `spec/`, `spec/` đúng.** Ngưỡng được nêu bằng **tên hằng** trong [`../spec/02_CONTRACTS.md`](../spec/02_CONTRACTS.md) Mục 1 (`CONFIG.*`). KPI là **mục tiêu cần đo baseline**, không phải kết quả.

---

## 0. Nguyên tắc

- **Định hướng (D-33):** trục chính là **mã nguồn mở cho cộng đồng** (ai cũng tự clone, tự điền API key của mình trong `.env`), **nghiên cứu học thuật** (AI ảo giác, độ tin cậy khi AI chấm bài, BKT trên kỹ năng kiến trúc) và kinh nghiệm cho CV. Nhóm **không thương mại hóa, không bán cho trường**. Mọi ý thương mại / B2B / công cụ cho trường học chỉ nằm ở Mục 9 "Khả năng, chưa theo đuổi".
- Chỉ thêm hạ tầng khi có **ngưỡng đo được** biện minh.
- Không hứa thuật toán mà công cụ hiện có không làm được.
- Số nào là ước lượng thì ghi "ước lượng".
- Giữ nguyên các bất biến của `spec/`:
  - không lưu file mã nguồn; chỉ lưu đoạn code đã cắt của phiên (D-59);
  - server là nơi duy nhất ghi tiến độ học;
  - mọi văn bản AI qua cổng gác;
  - đồ thị dựng tất định, không dùng LLM.

---

## 1. Mốc xuất phát: bản thi vòng 2 (07–08/11/2026)

| Nhóm | Nội dung |
| :-- | :-- |
| **Có trong spec phải chạy** (D-04) | Bản đồ tất định 0 token; 4 lời gọi AI; cổng gác; câu hỏi theo kỹ năng + 3 nấc gợi ý; BKT ở server; node đã thạo vẫn hỏi 1 câu (D-34); mài mòn kiểu Duolingo, chỉ hiển thị (D-35); đăng nhập GitHub bắt buộc (D-44); mở lại phiên theo commit SHA (D-39); persona; chế độ Offline; Language Registry; chạy trên Cloud Run + Supabase (Vercel dự phòng demo, D-64) |
| **Có thể bị cắt nếu trễ** (mục "Nếu trễ" của phiếu trong `ke-hoach-thi/phieu/`) ⇒ làm đầu tiên sau thi | "Báo sai"; màn hình lịch sử; phần AI của Tổng quan |
| **Đã cắt khỏi bản thi (D-76)** ⇒ làm đầu tiên sau thi | Resolver Java/Go/Dart, tầng `STRUCTURAL`, màn hình Flutter, Android, iOS |
| **Đã đặc tả, tắt bằng cờ** | Câu thứ 2 cho kỹ năng NOVICE (`NOVICE_SECOND_QUESTION`); xoáy vào ý còn hổng (`GAP_TARGETING`) |
| **Chưa có — là roadmap** | Chạy với LLM local; cờ nghi dán; nhập giọng nói; repo private qua GitHub App; VS Code/JetBrains |

---

## 2. Giai đoạn 0 — Giữa vòng 2 và vòng 3 (khoảng 1 ngày)

Theo lịch D-47, vòng 3 chỉ cách vòng 2 khoảng 1 ngày (08/11 → 09/11/2026), nên không còn thời gian tổ chức pilot và đo lường giữa hai vòng. Repo thi đóng băng: thể lệ chỉ chấp nhận commit trong thời gian thử thách, nên nhóm không commit thêm. Giai đoạn này chỉ giữ các việc làm được trong 1 ngày:

- **Ghi lại lỗi đã biết:** ghi các lỗi phát hiện khi chạy thật hoặc demo ở vòng 2 để nói thật khi phản biện và sửa sau thi.
- **Tổng hợp số đo từ log:** tổng hợp chi phí token thật, thời gian dựng bản đồ từ log của vòng 2.
- **Hoàn thiện slide:** cập nhật số đo thực tế vào slide thuyết trình vòng 3, hoàn thiện nội dung phản biện và kịch bản demo. Thêm phần định hướng: mã nguồn mở, người dùng tự mang API key, câu hỏi nghiên cứu, bảng đối thủ (xem [`PHAN_BIEN_BGK.md`](PHAN_BIEN_BGK.md) Mục 3 và câu A6).

---

## 3. Quyết định thiết kế cho roadmap (đã sửa theo spec mới)

| # | Chủ đề | Quyết định |
| :-: | :-- | :-- |
| R1 | Hạ tầng | Giữ **Google Cloud Run (`asia-southeast1`) + Supabase** như bản thi (D-64; Vercel dự phòng demo Phương án C); cache RAM chỉ để nhanh, không được dựa vào (đọc `session_snapshots`). Chỉ tách ingest ra worker riêng khi log cho thấy chạm giới hạn tài nguyên container, hoặc `ERR_SERVER_BUSY` xuất hiện thường xuyên. Người tự cài có thể chạy bằng npm (`npm run dev`) hoặc Docker container (D-45) |
| R2 | Cache | Bản phân tích node và tổng quan được cache dùng chung ở Postgres (`ai_cache`, D-37); câu hỏi **không** cache. Redis chỉ thêm khi cần chia sẻ cache RAM `StaticEngineResult` giữa các instance. **Không** dùng Explicit Context Caching. Tận dụng Implicit Caching bằng cách đặt phần tĩnh của prompt lên đầu |
| R3 | Quan sát cho BKT | Mỗi câu cho **1 kết quả** cho đúng 1 kỹ năng: `PASS_FIRST` / `PASS_AFTER_HINT` / `FAILED`. Khi fit thì giữ quan sát nhị phân, và mô hình hóa lượt có gợi ý bằng tham số đoán riêng (đang dùng `BKT_P_G_HINT`) |
| R4 | Lát cắt | Giữ **Scoped Call-Chain Slicing** (`SLICE_MAX_HOPS`). Không hứa PDG hay program slicing theo nghĩa Weiser. Lát cắt bám biến chỉ là tùy chọn best-effort và phải có đo đạc |
| R5 | LLM local (người tự cài) | Sinh tự do + `jsonrepair` + kiểm schema + gọi lại 1 lần. Vẫn hỏng thì **bỏ câu đó**, giống bản thi (không có câu dự phòng từ AST). Cổng gác vẫn chạy sau cùng |
| R6 | Bảo vệ mã nguồn khi tự host | **LLM local:** giữ nguyên định danh, code không rời máy. **LLM cloud:** che có chọn lọc (bí mật, tên do người dùng khai), giữ từ vựng nghiệp vụ |
| R7 | Hiển thị code | Giữ Monaco ở chế độ chỉ đọc |

---

## 4. Khoảng trống kỹ thuật xuyên suốt

| # | Bản thi | Vấn đề | Hướng nâng cấp |
| :-: | :-- | :-- | :-- |
| G1 | Postgres theo từng người học (`skill_states`, `learning_sessions`, `node_progress`, `node_runs`, `question_attempts`, `ai_cache`) | Log chưa đủ trường để fit và đo KPI nghiên cứu | Thêm `llm_calls`; mở rộng `question_attempts` |
| G2 | Tham số `BKT_P_*` đặt tay; ngưỡng `PASS_CORE_ACCURACY` + luật D-13 | Nhiễu của bộ chấm LLM bị coi là nhãn chắc chắn | Fit EM bằng pyBKT; hiệu chuẩn ngưỡng đạt bằng nhãn giảng viên |
| G3 | Phân giải import bằng heuristic; tầng `STRUCTURAL` cho cạnh `INFERRED` | Sai với gọi động, DI, alias | LSP/SCIP; độ tin cậy dạng số trên từng cạnh |
| G4 | Call-chain, tối đa `SLICE_MAX_HOPS` bước | Chưa mịn tới mức biến | Lát cắt bám biến best-effort, có đo |
| G5 | Trần `MAX_CLEAN_FILES` / `MAX_STREAM_BYTES` / `MAX_UPLOAD_BYTES`, `DISPLAY_MAX_NODES`; chỉ nhánh mặc định (D-38) | Chưa dùng được cho repo rất lớn hay nhánh khác | Phân cụm cộng đồng, index tăng dần theo commit; chọn nhánh |
| G6 | Cổng gác: tên, từ cấm, bằng chứng kỹ năng; regex chặn câu lệnh | Chưa phát hiện nhờ AI trả lời hộ | Tín hiệu hành vi và câu hỏi nối tiếp |
| G7 | Phai trí nhớ theo `DECAY_HALF_LIFE_DAYS` cố định, chỉ hiển thị mài mòn (D-35) | Ai cũng quên với cùng tốc độ | Half-Life Regression (Settles & Meeder, 2016) |
| G8 | Gọi lại kèm lý do, ghi mã lỗi khi cổng gác chặn (D-51) | Lỗi gặp nhiều chưa được đưa ngược vào prompt | Người review viết ca test cho lỗi đó, qua ca test mới nâng system prompt; kết quả tụt thì không nhận |

---

## 5. Giai đoạn 1 (0–3 tháng) — Phát hành mã nguồn mở & thu dữ liệu nghiên cứu

**Bản chất:** từ sản phẩm thi thành dự án mã nguồn mở người khác tự chạy được, và **thu dữ liệu sạch** (có đồng ý) cho GĐ2.
**KPI mục tiêu:** người ngoài nhóm tự cài và chạy được theo README; pilot tình nguyện 15–30 SV đủ dữ liệu cho GĐ2; kiểm soát trần lượt AI. Mọi KPI chỉ được báo sau khi **đo baseline**.

**Công nghệ**
- **Tự cài đặt:** README hướng dẫn 2 cách (D-45): chạy trực tiếp bằng Node/npm là chính (`npm install && npm run dev`), hoặc chạy bằng Docker container là phụ (`docker run`); điền key trong `.env`, kết nối Supabase, hoặc tự deploy lên Cloud Run / Vercel.
- **Trần lượt AI toàn web mỗi ngày:** đặt trần lượt gọi AI toàn web mỗi ngày trước khi đưa link rộng rãi; hết lượt thì hệ thống thông báo rõ và chỉ sang README hướng dẫn tự chạy bằng key cá nhân.
- **Bảng mới:** `llm_calls` (token vào/ra, token trúng cache, độ trễ, `LLM_MODEL`, `PROMPT_VERSION`, cổng gác chặn gì) — dữ liệu cho câu hỏi nghiên cứu về AI ảo giác.
- **Log nộp bài:** mở rộng `question_attempts` vốn chỉ thêm, không sửa. Thêm `latency_ms`, số lần dán, thời gian gõ, tier, `focus`, `PROMPT_VERSION`, model. Đây là dữ liệu để fit ở GĐ2, nên phải thiết kế ngay.
- **Rate-limit theo user/IP** cho `/api/*`. Bản thi mới có quota token theo phiên (`SESSION_TOKEN_QUOTA`), đếm ở server.
- **Vận hành & Giám sát:** Phân công người trực (on-call rotation), bảng theo dõi sự cố (incident post-mortem log), chính sách sao lưu định kỳ, quy trình dọn dữ liệu cũ (xóa `session_snapshots` và `learning_sessions` của phiên không hoạt động lâu ngày, khớp D-59).
- **An toàn & Bảo mật nâng cao:** Đặt trần AI theo người và theo ngày; dùng `zod` xác thực mọi route API; thiết lập CSP (Content Security Policy) chặt chẽ; bật bộ lọc an toàn Gemini (safety settings); kiểm tra từ xấu ở cả đầu ra AI.
- **Đảm bảo chất lượng AI:** Quy trình đổi model (chạy qua bộ test trước khi đổi); kiểm thử thiên lệch (bias testing); định kỳ lập báo cáo đánh giá (evaluation report).
- **Tuân thủ:** màn hình xin đồng ý theo Nghị định 13/2023; ẩn danh khi xuất dữ liệu nghiên cứu; dùng API trả phí cho pilot.

**Thuật toán, thành phần mới**
1. **Phát hiện nhờ AI trả lời hộ.** Dùng sự kiện dán, tốc độ gõ so với độ dài, đổi tab, và câu hỏi nối tiếp sinh từ chính câu trả lời. Chỉ gắn cờ, không tự phạt.
2. **Chống prompt injection, chốt 3.** Output AI không được chứa URL hay lệnh lạ. Đi kèm hai lớp đã có: bọc dữ liệu trong prompt, đánh dấu `suspicious_instruction_files`.
3. **Chặn trùng theo ngữ nghĩa.** Giữ so độ giống ký tự (`ANSWER_DUPLICATE_SIMILARITY`), thêm so bằng embedding để bắt câu diễn đạt lại cùng ý.
4. **Bật các cờ đã đặc tả** (`NOVICE_SECOND_QUESTION`, `GAP_TARGETING`) sau khi đo token.
5. **Pilot 15–30 sinh viên SGU** (tình nguyện, có đồng ý cho dùng dữ liệu ẩn danh để nghiên cứu): đo chi phí thật mỗi phiên từ `usage_metadata`, thời gian dựng bản đồ thật, tỉ lệ repo xử lý được, mức đồng thuận AI–người, điểm SUS; khảo sát ≥ 50 sinh viên và 2–3 ý kiến giảng viên.

**Đo:** SUS; tỉ lệ bị cổng gác chặn; token thật mỗi người học; tỉ lệ trúng `ai_cache`; số người ngoài nhóm tự cài thành công.

---

## 6. Giai đoạn 2 (3–6 tháng) — Nghiên cứu: đồ án tốt nghiệp & bài báo

**KPI gốc** (AUC ≥ 0,82, RMSE ≤ 0,28, giảm 45% điểm mù) **đã chỉnh:** AUC **vượt baseline PFA/Elo có ý nghĩa thống kê, mục tiêu ≥ 0,78, kéo giãn 0,82**. Tài liệu BKT thường báo khoảng 0,70–0,78 (ước lượng). "Điểm mù" chỉ báo số sau khi định nghĩa ở mục Thí nghiệm.

**Câu hỏi nghiên cứu (D-33):** (1) cổng gác bằng code chặn được bao nhiêu phần ảo giác của AI, và loại ảo giác nào lọt qua; (2) AI chấm bài tự giải thích đáng tin tới đâu so với giảng viên; (3) BKT có mô hình hóa được kỹ năng kiến trúc trên repo thật không.

**Mô hình người học**
- **Fit EM** (Baum-Welch) bằng pyBKT trên log GĐ1, theo từng kỹ năng, với ràng buộc $P(G)+P(S)<1$, $P(G)\le0.3$, $P(S)\le0.3$.
  - Kiểm phiên bản pyBKT có `forgets`, `multigs`, `multiprior` trước khi cam kết ablation.
  - Mỗi câu chỉ gắn 1 kỹ năng, nên không cần nhân bản dòng.
- **Ablation:** BKT chuẩn → BKT + quên → BKT cá nhân hóa. Baseline là PFA và Elo/IRT 1PL; DKT/SAKT làm cận trên.
- **Hiệu chuẩn nhãn đạt.** Hồi quy logistic trên ≥ 300 câu do giảng viên chấm, đặc trưng gồm `core_accuracy`, tỉ lệ ý bắt buộc được trích đúng, `simplicity`. Chọn ngưỡng tại điểm vận hành tối ưu rồi thay ngưỡng cứng `PASS_CORE_ACCURACY`. Tập hiệu chuẩn phải tách khỏi tập đo AUC.
- **Half-Life Regression** thay `DECAY_HALF_LIFE_DAYS` cố định, để thanh mài mòn phản ánh đúng tốc độ quên của từng người.
- **Ý tương lai — miễn thi (Fast-Track):** bản thi đã bỏ (D-34). Chỉ cân nhắc lại sau khi BKT đã fit và hiệu chuẩn, khi có số đo cho thấy điểm "đã thạo" đủ tin để bỏ qua câu hỏi.
- **Kiểm định danh mục kỹ năng.** Viết định nghĩa vận hành cho 16 kỹ năng. Đo đồng thuận giữa **AI gắn kỹ năng kèm bằng chứng** (D-01) và 2 chuyên gia bằng Cohen's κ. So log-likelihood khi bỏ hoặc thêm một kỹ năng.

**Hiệu chuẩn bộ chấm (LLM-as-judge)**
- Tập vàng ≥ 300 câu, 2 giảng viên chấm độc lập. Báo Quadratic Weighted κ ≥ 0,7 cho cả cặp AI–người và người–người.
- Giảm nhiễu: chấm 3 lần lấy trung vị, few-shot neo, kiểm thiên vị câu dài, thử một model chấm thứ hai.

**Đánh giá lát cắt và cạnh**
- **Bộ nhãn tay 30–40 repo sinh viên** (2 người gán "lát cắt đúng"). Đo precision/recall của cạnh gọi hàm và độ trùng của lát cắt.
- So với: repo-map kiểu Aider; gom theo thư mục.
- **Độ tin cậy cạnh dạng số:** import tĩnh 1,0; qua interface→implementation 0,8; heuristic theo tên 0,5. UI vẽ nét đứt cho cạnh dưới ngưỡng.

**Thí nghiệm**
- **Architecture Blindspot Rate** = số node sinh viên không giải thích được khi **vấn đáp có người chấm** / tổng node. Không dùng điểm của chính hệ thống, để tránh lập luận vòng tròn.
- A/B ngẫu nhiên: SimpliFey với tự học. Power analysis với $d=0{,}5$, α = 0,05, power 0,8 cho khoảng 64 sinh viên mỗi nhóm (ước lượng). Phân tích ANCOVA với pre-test làm hiệp biến.
- Cross-validation **tách theo sinh viên**. Báo AUC, RMSE, log-loss, ECE và khoảng tin cậy bootstrap.
- **Công bố mở:** bộ nhãn tay và log đã ẩn danh (khi người tham gia đồng ý) để người khác kiểm lại.

---

## 7. Giai đoạn 3 (6–12 tháng) — Cộng đồng mã nguồn mở

**KPI mục tiêu:** có người đóng góp ngoài nhóm; ngôn ngữ mới đạt conformance test do cộng đồng gửi.

- **Chạy với LLM local** (Ollama / vLLM) theo R5, R6: code không rời máy người dùng. Đo lại chất lượng câu hỏi và tỉ lệ bị chặn so với Gemini trước khi khuyên dùng.
- **Adapter ngôn ngữ do cộng đồng đóng góp:** mọi ngôn ngữ có grammar Tree-sitter chạy ở `STRUCTURAL`; nâng lên `RESOLVED` khi qua **conformance test** (precision/recall cạnh trên bộ nhãn tay) với ngưỡng đặt trước.
- **Repo private:** GitHub App với quyền chỉ đọc `contents:read`; token chỉ sống trong bộ nhớ; vẫn không ghi đĩa.
- **Chi phí AI do người dùng tự trả theo key của họ.** Ước lượng ở `02` Mục 1.1 (khoảng 0,05 USD cho người đầu tiên của một repo, 0,03 USD cho người sau, chưa đo) để người tự cài biết trước.

---

## 8. Giai đoạn 4 (dài hạn) — Công cụ cho lập trình viên (mã nguồn mở)

**KPI mục tiêu:** extension VS Code và JetBrains; API kiểm toán kiến trúc cho CI/CD; lượt tải kèm retention D7/D30.

- **Tách `simplifey-core`** (TypeScript, không phụ thuộc UI): ingest → parse → graph → slice → metrics → BKT. Web, VS Code, JetBrains và CI là các client mỏng gọi lõi qua JSON-RPC.
- **VS Code:** lõi chạy trong extension host; webview dùng lại ReactFlow + Monaco. **JetBrains:** plugin gọi lõi như một sidecar Node.
- **Phân giải chính xác nhờ IDE:** dùng LSP hoặc chỉ mục SCIP; heuristic giữ làm dự phòng. Đo bằng bộ nhãn tay của GĐ2.
- **Phân tích tăng dần khi gõ:** Tree-sitter incremental parse, debounce 300–500 ms, chỉ tính lại lát cắt chứa file vừa đổi.
- **Kiểm toán kiến trúc trong CI** theo từng diff:
  - xuất hiện chu trình mới (Tarjan);
  - chỉ số D của Uncle Bob rơi vào `ZONE_OF_PAIN`;
  - **rủi ro tri thức:** lát cắt bị sửa mà ít hơn N người có kỹ năng liên quan ≥ `TIER_ARCHITECT_MIN` thì cần reviewer am hiểu. Ngưỡng N chốt khi làm.
  - Luật kiến trúc khai báo kiểu ArchUnit, chỉ áp trên cạnh đủ tin cậy. Xuất SARIF 2.1, comment PR, GitHub Action / GitLab CI.
- **Thứ tự kiểm chứng ngôn ngữ:** sau TS/JS và Python là Java (DI Spring), Go (interface ngầm), Dart (cầu nối sự kiện BLoC/Provider); tiếp theo là C#, PHP, Kotlin, Rust.
- **Cầu nối sự kiện** (dispatch/on<Event>) cho BLoC, Redux, Provider để luồng mobile/frontend không bị đứt.
- **Mobile ít phổ biến (D-57):** nhận màn hình của Ionic/Capacitor, .NET MAUI/Xamarin, NativeScript, Kotlin Multiplatform, router tự viết; và hiện cảnh báo khi biết là app mobile mà không tìm thấy màn hình nào (thay vì im lặng).

---

## 9. Khả năng, chưa theo đuổi (D-33)

Các ý dưới đây có thể làm được về kỹ thuật nhưng **nhóm không theo đuổi** (không thương mại hóa, không bán cho trường). Giữ lại để trả lời BGK nếu được hỏi; ai muốn có thể tự fork mã nguồn để làm.

**Cho lớp học / giảng viên**
- Đăng nhập Google Workspace `@sgu.edu.vn`; bảng `courses`, `enrollments`.
- **Bộ tạo đề vấn đáp:** chọn N câu tối đa hóa độ phủ kỹ năng yếu bằng greedy cho hàm submodular $\sum_k (1-P_k)$, kèm MMR chống trùng ý; đề vẫn qua cổng gác.
- **Dashboard giảng viên:** heatmap sinh viên × 16 kỹ năng (điểm đã phai); "điểm mù" là kỹ năng có điểm đã phai < `TIER_PRACTITIONER_MIN`.

**Cá nhân trả phí (B2C) — "Pro Mock Defense"**
- Hội thoại nhiều lượt (PROBE → FOLLOW_UP → CHALLENGE → CLOSE), mỗi lượt vẫn qua cổng gác; chọn câu kiểu CAT theo mức giảm entropy kỳ vọng của 16 xác suất; mô phỏng hội đồng 3 giám khảo; giọng nói (không đưa tốc độ nói vào BKT); thanh toán và quan sát hệ thống.

**Doanh nghiệp (B2B) — onboarding, chạy on-prem**
- Docker Compose/Helm với LLM nội bộ; SSO SAML/OIDC, RBAC, audit log; phân cụm Louvain/Leiden cho repo lớn; adapter GitLab, Bitbucket, Azure DevOps.
- Thuật toán onboarding: hotspot = tần suất sửa × độ phức tạp (`git log`); bus factor (`git blame`); lộ trình = sắp xếp tô-pô + knapsack có ràng buộc tiên quyết.
- Mọi cam kết độ trễ / chất lượng với khách chỉ đặt sau khi đo.

**Chi phí nếu có người vận hành dịch vụ chung (ước lượng, chưa đo):** dùng số ở `02` Mục 1.1. 1.000 người dùng tháng × 4 phiên/tháng ra khoảng **80–200 USD/tháng chỉ riêng tiền LLM**, tách khỏi chi phí hạ tầng cố định; tính lại khi có số đo thực tế (D-50).

---

## 10. Bảng KPI tổng hợp

| Giai đoạn | KPI mục tiêu | Cách đo | Điều kiện để được nói là đạt |
| :-- | :-- | :-- | :-- |
| 0 (giữa vòng 2 và 3) | Ghi lại lỗi đã biết, tổng hợp số đo từ log vòng 2, hoàn thiện slide | Log hệ thống | Hoàn thành trước giờ thi vòng 3 |
| 1 (0–3 tháng) | Người ngoài nhóm tự cài được; pilot tình nguyện 15–30 SV đủ dữ liệu; kiểm soát trần lượt AI | README + báo lỗi; log pilot, `llm_calls`, trần ngày | Có đồng ý của người tham gia |
| 2 (3–6 tháng) | AUC ≥ 0,78 và vượt PFA/Elo; QWK ≥ 0,7; κ kỹ năng; Blindspot Rate; tỉ lệ ảo giác bị cổng gác chặn | pyBKT CV tách theo SV; tập vàng 300 câu; A/B + ANCOVA | Tập hiệu chuẩn tách khỏi tập đánh giá; ground truth là vấn đáp có người chấm |
| 3 (6–12 tháng) | Người đóng góp ngoài nhóm; ngôn ngữ mới qua conformance | Lịch sử PR; bộ conformance test | Test công khai, ngưỡng đặt trước |
| 4 (dài hạn) | Lượt tải extension; retention D7/D30 | Marketplace; telemetry opt-in; CI | Telemetry ẩn danh, có đồng ý |

---

## 11. Số cũ đã sửa trong lộ trình

| Tài liệu cũ ghi | Bây giờ |
| :-- | :-- |
| Fast-Track `P ≥ 0.85` | Bỏ khỏi bản thi (D-34): node mà mọi kỹ năng ≥ `CONFIG.MASTERED_MIN` vẫn hỏi 1 câu; miễn thi chỉ còn là ý tương lai (Mục 6) |
| Ngưỡng cứng "70/70" (`core_accuracy` và `simplicity`) | `PASS_CORE_ACCURACY` + luật D-13 (đủ ý bắt buộc có trích dẫn thật); `simplicity` **không** ảnh hưởng đạt |
| Quota 10.000 token/phiên **đếm ở client** | `SESSION_TOKEN_QUOTA` (200.000), **đếm ở server** (API-06) |
| Debounce bằng Jaccard | Độ giống `1 − Levenshtein/max(len)` ≥ `ANSWER_DUPLICATE_SIMILARITY` (0,8), kiểm ở server |
| ≈ $0.03/phiên; "$110–120/tháng cho 1.000 MAU"; "chi phí vận hành < $15/tháng" | ~0,05 USD người đầu / ~0,03 USD người sau (ước lượng); người tự cài trả theo key của mình |
| Response Cache trên Redis khóa `hash(snippet)+tier` | `ai_cache` ở Postgres, đã có, chỉ cho bản phân tích node và tổng quan; câu hỏi không cache (D-37) |
| Bảng `feynman_attempts`; `target_skills` nhiều kỹ năng / câu | `question_attempts`; **1 kỹ năng / câu** |
| Câu hỏi dự phòng dựng từ AST | Bỏ: câu hỏng ⇒ gọi lại 1 lần ⇒ bỏ câu |
| Tải ngầm node kế tiếp (prefetch) | Tải trước 1–2 node kế tiếp (D-46) |
| `_internal_reasoning`, `candidate_probes` trong output | Không còn trong `responseSchema` |
| "On-premise cam kết 100% không rò rỉ" | "Code không rời máy / mạng nội bộ khi dùng LLM local" |
| BKT chạy ở client, lưu `localStorage` | BKT chạy ở server, lưu Postgres; client chỉ đọc (D-02), trừ chế độ Offline |
| Railway, tiến trình Node sống lâu | Vercel + Supabase gói free (D-27) |

---

## 12. Mở rộng hệ thống theo 4 bậc

Kiến trúc module hóa một chiều (`spec/04` §4) cho phép mở rộng tuần tự theo tải thực tế. Ngưỡng nâng bậc chỉ chốt khi có số đo.

```mermaid
flowchart LR
    B1["Bậc 1: Bản thi<br/>Cloud Run + cache RAM theo bản sao + Semaphore"]
    B2["Bậc 2: Cache dùng chung<br/>Upstash Redis"]
    B3["Bậc 3: Tách Ingest Worker<br/>Hàng đợi pgmq / BullMQ"]
    B4["Bậc 4: Hàng đợi gọi AI<br/>Rate-limited LLM Queue + Paid Billing"]

    B1 --> B2 --> B3 --> B4
```

| Bậc kiến trúc | Dấu hiệu cần nâng bậc | Thay đổi trong Code | Hạ tầng bổ sung |
| :-- | :-- | :-- | :-- |
| **Bậc 1** *(Bản thi)* | Khởi đầu demo, nhóm nhỏ người học. | Giữ nguyên kiến trúc hiện tại (`spec/05`). | Google Cloud Run (`asia-southeast1`, D-64) + Supabase Free + Gemini API (Vercel dự phòng demo). |
| **Bậc 2: Cache dùng chung** | Log cho thấy nhiều lần đọc lại `session_snapshots` từ Postgres vì trượt cache RAM giữa các instance. | Chuyển LRU cache `StaticEngineResult` sang bộ nhớ dùng chung. | **Upstash Redis** gói free làm tầng đệm dùng chung. |
| **Bậc 3: Tách Ingest Worker** | Ingest chạm giới hạn thời gian / RAM của Cloud Run container (hoặc Vercel Functions dự phòng); `ERR_SERVER_BUSY` thường xuyên. | Tách `engine/*` thành Worker riêng; `/api/ingest` đẩy job vào queue và trả job ID để polling. | Hàng đợi **`pgmq` (Supabase Queues)** chạy trên Postgres, hoặc BullMQ. |
| **Bậc 4: Hàng đợi gọi AI** | Chạm trần quota gói Free của Gemini. | Chuyển `analyze-node`, `analyze-overview` qua worker bất đồng bộ theo batch. | Gắn Google Cloud Billing (Paid Tier, không dùng dữ liệu để huấn luyện); hàng đợi có rate-limit (vd Upstash QStash). |

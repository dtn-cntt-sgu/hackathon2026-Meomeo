# 02 — Phiếu việc của Phát (Giao diện trang học)

> Người: **Phát**. Vai trò: token giao diện, store, client API, trang chủ tối thiểu, trang học `/learn` theo `docs/prototype.html` và `docs/spec/30_UI.md`, nút Giải thích, Offline (giao diện); **người bấm máy** khi thuyết trình (Q-10); video dự phòng.
> Ghi chú phải xử lý: **3** (gom `/api/me`, tải chậm, trạng thái chờ), **4** (nút Giải thích), **5** (giống prototype), **6** (không khóa gắt ở UI).
> Người đỡ lúc cao điểm: **Thiện** nhận trang chủ "Tiếp tục học" lúc 22:00 (TH-13).
> **Luật UI:** bố cục, nhãn chữ, thành phần, luồng lấy theo `docs/prototype.html`. Màu và font lấy theo `docs/spec/30_UI.md` Mục 11 (D-89), **riêng màu nhấn `--accent` lấy theo prototype** (Q-11). Kết quả chốt các chỗ lệch ở `07_GHI_CHU_VA_CHOT.md` Mục 1 (Q-11, Q-12).
> Luật chung cho mọi phiếu: xem đầu file [`02_PHIEU_THIEN.md`](02_PHIEU_THIEN.md).

## Bảng hợp đồng UI ⇄ API (dùng chung cho mọi phiếu của Phát, Thiện, Quý)

Mọi hàm nằm trong `src/lib/api.ts`. Mỗi hàm có 2 bản: bản thường trả dữ liệu hoặc ném `ApiClientError`, bản `…Safe` trả `ApiResult<T>` (`{ ok: true; data: T }` hoặc `{ ok: false; code: ErrorCode; message: string; retryable: boolean }`). UI chỉ dùng bản `…Safe`. Kiểu lấy từ `src/contracts/api.ts` (`docs/spec/02_CONTRACTS.md` Mục 8).

| Hàm trong `src/lib/api.ts` | Endpoint | Gửi đi | Nhận về | Server (phiếu) |
| :-- | :-- | :-- | :-- | :-- |
| `getMeSafe()` | `GET /api/me` | — | `MeResponse { profile, server_now }` | TH-06 |
| `deleteMeSafe()` | `DELETE /api/me` | — | 204 | TH-06 |
| `ingestRepoSafe(data: IngestRequest \| FormData)` | `POST /api/ingest` | `{ repo_url }` hoặc `{ session_id }` hoặc multipart trường `archive` | `IngestResponse { session_id, result, progress, analyses, resumed, from_cache }` | TH-07, TH-10 |
| `getSessionsSafe()` | `GET /api/sessions` | — | `SessionsResponse { sessions }` | TH-11 |
| `getSessionProgressSafe(sessionId)` | `GET /api/sessions/{id}/progress` | — | `ProgressResponse { progress }` | TH-11 |
| `analyzeNodeSafe(sessionId, nodeId)` | `POST /api/analyze-node` | `AnalyzeNodeRequest { session_id, node_id }` | `AnalyzeNodeResponse { node_id, analysis, node_state, unlocked_node_ids, tokens_used }` | NH-05 |
| `enrichNodeSafe(sessionId, nodeId, mode = "LEARN")` | `POST /api/enrich-node` | `EnrichNodeRequest { session_id, node_id, mode }` | `EnrichNodeResponse { node_id, run_id, mode, questions, node_state, tokens_used }` | NH-06 |
| `evaluateFeynmanSafe(data)` | `POST /api/evaluate-feynman` | `EvaluateFeynmanRequest { session_id, run_id, question_index, student_answer, attempt_number }` | `EvaluateFeynmanResponse` (điểm, `intent`, `is_passed`, `feedback`, `follow_up`, `question`, `skill_change`, `node_state`, `unlocked_node_ids`, `tokens_used`) | NH-07 |
| `revealSafe(data)` | `POST /api/reveal` | `RevealRequest { session_id, run_id, question_index }` | `RevealResponse { question, skill_change, node_state, unlocked_node_ids }` | NH-07 |
| `explainSelectionSafe(data)` | `POST /api/explain-selection` | `ExplainSelectionRequest { session_id, node_id, step_number, range: { line_start, col_start, line_end, col_end }, selected_text }` (số dòng gốc, cột từ 1, `col_end` loại trừ) | `ExplainSelectionResponse { explanation, references, tokens_used }` | NH-09 |
| `switchPersonaSafe(mode)` | `POST /api/demo/persona` | `PersonaRequest { mode }` | `PersonaResponse` (= `MeResponse`) | TH-15 |

Store duy nhất: `src/store/workbench.ts` (Zustand), export `useWorkbenchStore`. State theo `ClientWorkbenchState` (`docs/spec/02_CONTRACTS.md` Mục 10, `docs/spec/30_UI.md` Mục 7.1). Action dùng chung (tên cố định, các phiếu sau chỉ thêm, không đổi tên): `loadMe()`, `loadSessions()`, `ingest(req)`, `applyIngest(res)`, `resetSession()`, `openNode(nodeId)`, `requestAnalysis(nodeId, retry?)`, `loadRun(nodeId)`, `submitAnswer(nodeId, questionIndex, answer)`, `skipQuestion(nodeId, questionIndex)`, `applyNodeState(state)`, `refreshProgress()`, `setActiveStep(step)`, `setActiveTab(tab)`, `setXrayStage(stage)`, `tourNext()`, `tourPrev()`, `openHintStep(step)`, `setHl(hl)`, `setDraft(key, text)`, `explainSelection(nodeId, stepNumber, range, selectedText)`, `setOfflineMode(enabled)`, `setOfflinePersona(p)`, `switchPersona(mode)`.

## Danh sách phiếu của Phát

Mỗi mã phiếu là 1 file trong thư mục [`phieu/phat/`](phieu/phat/). Đầu mỗi file là **prompt dán cho Claude** (hoặc ghi rõ phiếu không dùng Claude). Làm theo đúng thứ tự giờ.

| Mã | Tên việc | Giờ | Cách làm |
| :-- | :-- | :-- | :-- |
| [PH-01](phieu/phat/PH-01.md) | Token giao diện, chủ đề tối/sáng, font, thành phần cơ bản | 12:20 → 13:00 | Claude |
| [PH-02](phieu/phat/PH-02.md) | Client API, store duy nhất, bảng thông điệp lỗi | 13:00 → 14:15 | Claude |
| [PH-03](phieu/phat/PH-03.md) | Fixture bản đồ `shop-api` | 14:15 → 14:45 | Claude |
| [PH-04](phieu/phat/PH-04.md) | Trang chủ tối thiểu: đăng nhập, ô link, thả zip, đồng hồ quét | 14:45 → 15:45 | Claude |
| [PH-05](phieu/phat/PH-05.md) | Khung trang học 3 cột, thanh trên, bản đồ bài học | 15:45 → 17:15 | Claude |
| [PH-06](phieu/phat/PH-06.md) | Khung code Monaco, tab theo file, code theo bước | 17:15 → 18:30 | Claude |
| [PH-07](phieu/phat/PH-07.md) | Tour X-Ray: thẻ vai trò, từng bước, tóm tắt; hàng phân tích | 18:30 → 19:45 | Claude |
| [PH-08](phieu/phat/PH-08.md) | Feynman: câu hỏi, ô trả lời, kết quả trong cột, gợi ý, đáp án mẫu | 19:45 → 21:45 | Claude |
| [PH-09](phieu/phat/PH-09.md) | Áp kết quả: đổi trạng thái node, mở khóa, toast, mài mòn | 21:45 → 22:45 | Claude |
| [PH-10](phieu/phat/PH-10.md) | Nút "Giải thích" cho đoạn bôi đen (ghi chú 4) | 22:45 → 23:45 | Claude |
| [PH-11](phieu/phat/PH-11.md) | Tổng quan nhịp 1, ô persona, menu tài khoản, kiểm dưới 1024 px | 23:45 → 02:00 | Claude |
| [PH-12](phieu/phat/PH-12.md) | Nối giao diện Offline | 02:00 → 03:00 | Claude |
| [PH-13](phieu/phat/PH-13.md) | So ảnh với `prototype.html` và sửa lệch (ghi chú 5) | 03:00 → 04:00 | Claude |
| [PH-14](phieu/phat/PH-14.md) | Sửa lỗi giao diện sau DoD và quay video dự phòng | 04:00 → 05:00 | Claude (mẫu sửa lỗi, điền lỗi trước khi dán) |
| [PH-15](phieu/phat/PH-15.md) | Tập bấm demo và commit cuối | 08:00 → 09:00 | Claude (mẫu sửa lỗi, điền lỗi trước khi dán) |

### Phiếu tăng tốc (thêm sau, xem [`09_PHIEU_TANG_TOC.md`](09_PHIEU_TANG_TOC.md))

| Mã | Tên việc | Giờ | Cách làm |
| :-- | :-- | :-- | :-- |
| [PH-16](phieu/phat/PH-16.md) | Tính trước, chạy ngầm trong lúc người dùng đọc (T3) | Sau phiếu đang làm, trước 22:30 | Claude |
| [PH-17](phieu/phat/PH-17.md) | Hiện phần có sẵn trước, báo từng bước khi chờ (T5) | Sau PH-16, nếu còn giờ (trước 04:00) | Claude |

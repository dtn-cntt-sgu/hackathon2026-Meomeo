# 01 — KIẾN TRÚC, BẤT BIẾN & LUỒNG HỆ THỐNG

> Kiểu: `02_CONTRACTS.md`. Endpoint & giao dịch: `03_API_VA_LUU_TRU.md`. Hằng số: `CONFIG.*`.

---

## 1. Sản phẩm trong 1 đoạn

SimpliFey V2 Pro biến một repo GitHub public (hoặc file `.zip`) thành **bản đồ học tập** gồm tối đa `CONFIG.DISPLAY_MAX_NODES` node. Mỗi node là một **lát cắt nghiệp vụ xuyên file** (route → middleware → service → repository), không phải một file. Bản đồ dựng bằng **code thuần, 0 token** (Tree-sitter, Tarjan, PageRank, lát cắt, Dagre). Sau đó AI (Gemini) làm 5 việc:
1. phân tích từng node (kỹ năng + điểm hay + điểm dở, dùng chung cho mọi người học);
2. viết tổng quan repo (gọi ngay sau khi quét, đặt tên nhóm và tên bài);
3. đặt câu hỏi Feynman cho đúng các kỹ năng người học còn yếu;
4. chấm câu trả lời và gợi ý theo lượt và bậc (trỏ `20` AI-31) rồi lộ đáp án;
5. giải thích đoạn code người học chọn.

Mô hình **BKT** ghi nhận năng lực của 16 kỹ năng lâu dài trong Postgres. Từ đó server chọn kỹ năng cần hỏi — kỹ năng đã thạo vẫn bị hỏi 1 câu, không node nào được miễn (D-34) — và kỹ năng của node đang mở hiện "đang mài mòn" khi trí nhớ phai, chỉ hiển thị (D-35).

---

## 2. Bất biến (INV-xx) — sửa spec không được phá

| ID | Bất biến |
| :-- | :-- |
| **INV-01** | **1 node = 1 lát cắt xuyên file** mở đầu bằng 1 hàm entry đã đăng ký (D-06); không bao giờ là 1 file đơn lẻ. Node thuật toán (`ALGORITHMIC_CORE`) là 1 hàm phức tạp tách riêng. |
| **INV-02** | **Code thuần trước, AI sau.** Bản đồ (Tầng 0–2) không gọi AI, mục tiêu < 1.5 s. AI chỉ chạy ở **5 lời gọi**: `analyze-node`, `analyze-overview`, `enrich-node` (đặt câu hỏi), `evaluate-feynman` (chấm), `explain-selection` (giải thích đoạn chọn). Không có Intent Router, không có Actor-Critic nhiều lượt. |
| **INV-03** | **Zero-Trust:** không `git clone`, không chạy code người dùng; chỉ phân tích tĩnh. Tải từ `codeload.github.com` sau HEAD probe; zip bị cắt ⇒ GitHub API + `raw.githubusercontent.com` (D-63); file zip upload chỉ nằm trong RAM. |
| **INV-04** | **Không lưu file mã nguồn:** file code, buffer zip, AST không bao giờ ghi đĩa hay DB. Thứ duy nhất có code được lưu là **đoạn code đã cắt của các node** trong `StaticEngineResult` của phiên (bảng `session_snapshots`, D-59), để mọi lần vào phiên hiện cùng đoạn code; client không đọc trực tiếp bảng này. Ngoài ra Postgres chỉ chứa dữ liệu học tập + văn bản AI đã qua kiểm (API-01). |
| **INV-05** | **Server là nơi ghi duy nhất** của tiến độ học: lập kế hoạch câu hỏi, BKT, đếm lượt, mở khóa, quyết định mở đáp án. Client giữ bản sao chỉ đọc. `localStorage` chỉ giữ tiện ích giao diện, không giữ hồ sơ người học. |
| **INV-06** | **Phần X-Ray** hiện luồng, kiến trúc, điểm hay **và điểm dở** do AI tìm, gắn nhãn "Nhận định của AI". Phần X-Ray **không** nêu con số theo tình huống, cách sửa, tình huống biên — đó là thứ câu hỏi hỏi. |
| **INV-07** | **Đáp án** (`reference_answer`, `must_have_points`, `fix`) chỉ nằm ở server: cột câu hỏi của `node_runs` (`03` Mục 3.1), client không có quyền đọc bảng này (RLS, `03`); chỉ gửi xuống client khi câu **xong** (đạt / hết lượt / bỏ qua). |
| **INV-08** | **Mọi văn bản AI phải qua cổng gác trước khi hiển thị** (`21`). Cổng gác chặn tên bịa, kỹ năng ngoài danh mục, công nghệ ngoài repo; nó **không** kiểm được nghĩa đúng/sai. Không bao giờ tuyên bố "diệt 100% ảo giác". Câu hỏi hỏng ⇒ gọi lại 1 lần ⇒ bỏ câu đó; **không có** câu dự phòng dựng từ AST. |
| **INV-09** | **Đa ngôn ngữ theo tầng** (Language Registry): `RESOLVED` (có `ImportResolver`: TS/JS, Python, Java, Go, Dart) cạnh chính xác; `STRUCTURAL` (có grammar Tree-sitter) cạnh `INFERRED`, không bảo đảm 100%; `UNSUPPORTED` ⇒ `ERR_UNSUPPORTED_LANGUAGE`. Bản thi chỉ nạp và kiểm chứng TS/JS, Python (D-76). Không regex fallback, không dùng LLM để dựng đồ thị. |
| **INV-10** | **Engine tất định:** cùng repo + cùng commit + cùng `ENGINE_VERSION` ⇒ cùng đồ thị, cùng `node_id`, cùng tọa độ (D-10). Mọi vòng lặp duyệt theo khóa đã sort. |
| **INV-11** | **Màu & lớp hiển thị:** ở mọi chủ đề (D-79), `AVAILABLE` vàng; `COMPLETED` xanh lá; `FAILED` đỏ (vẫn mở node con — soft-bypass); `LOCKED` xám, viền đứt. Mã màu: `30` Mục 11. Tam giác cảnh báo, "đang phân tích…" (trên node) và "đang mài mòn" (kỹ năng của node đang mở, D-35) là **lớp hiển thị**, không phải trạng thái FSM. |
| **INV-12** | **Mọi con số nằm ở `CONFIG`** (`02` Mục 1); mọi kiểu nằm ở `02`. File khác chỉ nhắc tên. |
| **INV-13** | **Định vị:** không tuyên bố tự phát minh Compound AI, BKT, PageRank, Tree-sitter repo-map (Aider đã có). Điểm mới là **cách kết hợp và ứng dụng** vào học kiến trúc mã nguồn. |

---

## 3. Sơ đồ thành phần

```mermaid
flowchart LR
    subgraph Browser["Trình duyệt (Next.js client, Zustand chỉ đọc)"]
        UI["Giao diện học<br/>ReactFlow · Monaco · X-Ray · Feynman · Tổng quan · Giải thích đoạn chọn"]
    end
    subgraph Server["Cloud Run (Next.js route handlers, D-27, D-64)"]
        API["/api/* (03)"]
        ENG["Engine Tầng 0–2<br/>(10, 11) — RAM"]
        AI["AI client + cổng gác<br/>(20, 21)"]
        BKT["bkt-engine + planNodeQuestions<br/>(22)"]
        CACHE["LRU StaticEngineResult<br/>(RAM 1 instance, INGESTION_CACHE_TTL_MS,<br/>chỉ để nhanh; bản gốc ở session_snapshots)"]
    end
    GH[("GitHub: codeload, API, raw")]
    GEM[("Gemini API")]
    DB[("Supabase Postgres + Auth")]
    UI -- "Bearer token" --> API
    API --> ENG --> GH
    ENG --> CACHE
    API --> AI --> GEM
    API --> BKT
    API --> DB
    UI -- "Đăng nhập GitHub" --> DB
```

---

## 4. Các tầng xử lý

| Tầng | Việc | Token | Spec |
| :-- | :-- | :-: | :-- |
| 0 | Phân tích link, HEAD probe, tải zip vào RAM, đọc commit SHA, lọc rác, chọn ≤ `MAX_CLEAN_FILES` file, che secret, nhận diện monorepo / archetype / tech_stack | 0 | `10` |
| 1 | Tree-sitter + Language Registry, bảng symbol, đồ thị gọi hàm (`RESOLVED` / `INFERRED`), Tarjan SCC | 0 | `11` |
| 2 | Lát cắt từ entry (D-06), độ phức tạp & VIP, PageRank xếp hạng, Uncle Bob, cạnh giữa node (D-07, D-73), Display Budget, gom nhóm chức năng (D-84), đặt tên tất định, Dagre | 0 | `11` |
| 3b | `analyze-overview`: chạy ngay sau khi quét: bức tranh chung, tên nhóm, tên bài từ gói ngữ cảnh không có code (D-83) | AI | `20`, `21` |
| 3a | `analyze-node`: kỹ năng + bằng chứng, mẫu kiến trúc, giải thích từng bước, điểm hay, điểm dở — cache dùng chung | AI | `20`, `21` |
| 4 | `enrich-node`: server lập kế hoạch câu hỏi theo hồ sơ người học, AI viết câu hỏi + đáp án | AI | `20`, `21`, `22` |
| 5 | `evaluate-feynman`: AI chấm + gợi ý theo lượt và bậc (trỏ `20` AI-31) rồi lộ đáp án; server quyết Đạt, cập nhật BKT, mở khóa | AI + 0 | `20`, `21`, `22`, `03` |
| 6 | `explain-selection`: giải thích đoạn chọn khi người học bấm nút, cache dùng chung (D-82) | AI | `03`, `20`, `21` |

---

## 5. Luồng end-to-end

### 5.1. Mở web → bản đồ → phân tích node đang mở

```mermaid
sequenceDiagram
    autonumber
    actor U as Người học
    participant FE as Trình duyệt
    participant BE as API
    participant DB as Postgres
    participant AI as Gemini
    U->>FE: Mở web
    FE->>DB: Supabase signInWithOAuth (về /auth/callback)
    FE->>BE: GET /api/me
    BE->>DB: profiles + skill_states
    BE-->>FE: MeResponse (điểm GỐC + server_now)
    U->>FE: Dán link / kéo thả .zip
    FE->>BE: POST /api/ingest
    BE->>BE: Tầng 0–2 trong RAM (0 token)
    BE->>DB: Tạo / mở learning_sessions + session_snapshots (đoạn code đã cắt, D-59)
    BE-->>FE: IngestResponse (bản đồ + progress + analyses có sẵn trong cache)
    FE->>BE: POST /api/analyze-overview
    BE->>AI: Tổng quan (nếu cache trượt)
    BE->>DB: ai_cache
    BE-->>FE: AnalyzeOverviewResponse
    loop Node đang mở và 1–2 node kế tiếp (tối đa ANALYZE_CONCURRENCY cùng lúc, D-46)
        FE->>BE: POST /api/analyze-node
        BE->>AI: Phân tích (nếu cache trượt)
        BE->>DB: ai_cache
        BE-->>FE: AnalyzeNodeResponse
    end
```

Node chưa phân tích xong hiện "đang phân tích…". Bấm vào node đó thì phần X-Ray chờ bản phân tích; phần Feynman khóa cho tới khi có bản phân tích.

### 5.2. Học 1 node

```mermaid
sequenceDiagram
    autonumber
    actor U as Người học
    participant FE as Trình duyệt
    participant BE as API
    participant DB as Postgres
    participant AI as Gemini
    U->>FE: Bấm node VÀNG
    FE->>FE: Phần X-Ray hiện ngay từ NodeAnalysisView
    FE->>BE: POST /api/enrich-node { session_id, node_id, mode: LEARN } (chạy nền)
    alt Đã có run LEARN chưa xong (tải lại trang, tab khác)
        BE-->>FE: Trả lại đúng run đó (câu hỏi đọc từ DB)
    else Chưa có run
        BE->>DB: Đọc skill_states ⇒ planNodeQuestions (n ≥ 1 câu, D-34)
        BE->>AI: Viết n câu hỏi, không cache (câu hỏng ⇒ gọi lại 1 lần ⇒ DROPPED)
        alt Mọi câu DROPPED
            BE-->>FE: ERR_AI_REJECTED ⇒ nút Thử lại, không tạo run
        else Còn ít nhất 1 câu
            BE->>DB: Tạo node_runs (n câu + đáp án, D-36)
            BE-->>FE: EnrichNodeResponse (n câu, không có đáp án)
        end
    end
    loop Mỗi câu chưa xong của run, theo question_index (bỏ câu DROPPED)
        loop Tới khi câu này xong (đạt / hết lượt / bỏ qua)
            U->>FE: Viết câu trả lời ⇒ Nộp
            FE->>BE: POST /api/evaluate-feynman { session_id, run_id, question_index, student_answer, attempt_number }
            BE->>DB: Đọc câu hỏi + đáp án · kiểm độ dài, lượt, trùng, regex
            BE->>AI: Chấm (nếu không bị regex chặn)
            BE->>DB: Transaction: attempt + (BKT nếu câu xong) + (chốt node nếu đây là câu cuối chưa xong của run) + mở khóa
            BE-->>FE: Điểm, nhận xét, gợi ý nấc kế / đáp án nếu câu xong
        end
        Note over U,BE: Bỏ qua câu này ⇒ POST /api/reveal ⇒ câu xong, FAILED
        Note over U,BE: Câu FAILED do nộp bài ⇒ Báo sai ⇒ POST /api/report-wrong (D-22) ⇒ 🚩
        U->>FE: Xem đáp án ⇒ bấm Sang câu tiếp
    end
    FE->>FE: Tổng kết run ✅ ❌ 🚩, đổi màu node theo node_state (không tự tính)
```

- **1 run = n câu cố định**, 1 câu cho mỗi kỹ năng chưa thạo của node (`22` BKT-41, BKT-42). Mọi kỹ năng đã thạo ⇒ vẫn 1 câu cho kỹ năng có điểm thấp nhất; không có node miễn thi (D-34). Mỗi câu có 1 kỹ năng, lượt và gợi ý riêng (Mục 7). Mọi câu trả về ngay khi tạo run, nên chuyển câu không gọi thêm API.
- **Câu hỏi + đáp án lưu ở DB** (`node_runs`), client không đọc trực tiếp; chấm bài đọc từ DB, AI chấm không nhận code (D-36).
- **Câu xong** ⇒ hiện đáp án và nút "Sang câu {k} →", không tự nhảy (`30` UI-54).
- **Run xong** khi mọi câu không `DROPPED` đều xong ⇒ server chốt màu node (`22` Mục 8), trả `node_state` và `unlocked_node_ids` (`30` UI-57).

### 5.3. Không ôn tập — hiển thị mài mòn (D-35)

- Không có run ôn: node đỏ giữ đỏ, node xanh giữ xanh.
- Kỹ năng của node đang mở hiện thanh nhạt dần theo điểm đã decay và nhãn "đang mài mòn" khi bậc của điểm đã decay thấp hơn bậc của điểm gốc (`22` BKT-24). Chỉ hiển thị, không có nút ôn (`22`, `30`).

### 5.4. Mở lại phiên

Màn hình trống hiện danh sách "Tiếp tục học" (`GET /api/sessions`). Bấm mở ⇒ `POST /api/ingest { session_id }` ⇒ server đọc `StaticEngineResult` đã lưu của phiên (trúng cache RAM hoặc đọc `session_snapshots`, không tải lại zip) ⇒ ghép `node_progress` và các run (D-39, D-59). Mọi lần vào phiên hiện đúng cùng bản đồ và đoạn code, kể cả phiên từ `.zip`. Repo có commit mới ⇒ dán link ⇒ bản đồ và phiên mới. Phiên tạo bằng `engine_version` cũ ⇒ chỉ xem lịch sử.

"Học lại từ đầu" ⇒ phiên mới cùng repo: tiến độ node làm lại, điểm kỹ năng giữ nguyên, câu hỏi sinh mới (D-42).

---

## 6. Vòng đời node (trong 1 phiên)

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE: Node gốc
    [*] --> LOCKED: Còn node cha chưa thông
    LOCKED --> AVAILABLE: Mọi node cha thông (COMPLETED / FAILED / phân tích lỗi)
    AVAILABLE --> COMPLETED: Run LEARN xong, không còn câu FAILED chưa 🚩 (BKT-72)
    AVAILABLE --> FAILED: Run LEARN xong, ≥ 1 câu FAILED chưa 🚩 (trượt hết lượt hoặc bỏ qua)
    FAILED --> COMPLETED: Báo sai làm mọi câu FAILED còn lại đều 🚩 (D-22)
```

| Chuyển | Ai kích hoạt | Endpoint | Ghi gì | Client nhận |
| :-- | :-- | :-- | :-- | :-- |
| `LOCKED → AVAILABLE` | Server (suy ra) | Bất kỳ lệnh làm node cha xong | Không ghi (suy ra khi đọc, `03` Mục 5.1) | `unlocked_node_ids`, `node_state` |
| `AVAILABLE → COMPLETED / FAILED` | Server, khi câu cuối của run `LEARN` xong | `evaluate-feynman`, `reveal` | `node_runs.finished_at`, `node_progress.status` | `node_state` |
| `FAILED → COMPLETED` | Server | `report-wrong` | `node_progress.status` | `node_state` |
| Phân tích lỗi | Server | `analyze-node` | `node_progress.analysis_failed = true` | `analysis = null`, node con mở kèm tam giác |

Chuyển `FAILED → AVAILABLE` **không tồn tại** (D-16).

## 7. Vòng đời 1 câu hỏi (trong 1 run)

Một run có n câu (Mục 5.2); bảng dưới áp riêng cho từng câu (loại gợi ý theo lượt và tier trỏ `20` AI-31). Câu xong ⇒ người học bấm sang câu kế; câu cuối xong ⇒ run xong.

Lượt tối đa: `CONFIG.MAX_ATTEMPTS_PER_QUESTION`. Lượt nào là lượt tối đa thì áp dòng "Lượt cuối".

| Lượt | Đạt (D-13) | Chưa đạt |
| :-: | :-- | :-- |
| 1 | Xong, `PASS_FIRST` ⇒ BKT | Gợi ý nấc 1 `CONCEPT`: hỏi khái niệm bị hiểu sai, chưa chỉ chỗ |
| 2 | Xong, `PASS_AFTER_HINT` ⇒ BKT | Gợi ý nấc 2 `CODE_POINTER` (chỉ bước) |
| Lượt cuối | Xong, `PASS_AFTER_HINT` ⇒ BKT | Xong, `FAILED` ⇒ BKT, hiện đáp án |
| Bất kỳ | — | "Bỏ qua câu này" ⇒ xong, `FAILED`, `ended_by = SKIP` ⇒ BKT, hiện đáp án |
| Sau khi xong | — | Câu `FAILED` do nộp bài ⇒ "Báo sai" ⇒ 🚩, hoàn BKT nếu kỹ năng chưa có cập nhật khác (D-22, `22` BKT-63) |

- `intent = GIVE_UP` (gõ "chịu", "không biết") ⇒ tính 1 lượt trượt, vẫn nhận gợi ý nấc kế.
- Regex tấn công khớp ⇒ tính 1 lượt, 0 điểm, `OFF_TOPIC`, không gợi ý, không gọi AI.
- AI lỗi ⇒ không tính lượt.
- Mỗi câu cập nhật BKT **đúng 1 lần**, cho đúng 1 kỹ năng của câu đó, ngay khi câu xong.

---

## 8. Dữ liệu nằm ở đâu

| Dữ liệu | Vị trí lưu | Thời gian sống (TTL) | Ai được ghi | Ai được đọc |
| :-- | :-- | :-- | :-- | :-- |
| **Mã nguồn repo, buffer zip, AST** | RAM server (`RAMCodeStore`, `ManifestStore`) | Chỉ trong lúc chạy Tầng 0–2 | Engine | Engine nội bộ |
| **`StaticEngineResult` của phiên** (node + đoạn code đã cắt + tên, không có file nguồn) | Supabase Postgres (`session_snapshots`, D-59); bản sao RAM (LRU, 1 instance) chỉ để nhanh (D-27) | Theo phiên học (xóa khi xóa phiên / tài khoản); RAM tối đa `CONFIG.INGESTION_CACHE_TTL_MS` | Server (`DATABASE_URL`), lúc tạo phiên | Route handlers nội bộ (Client CẤM đọc) |
| **`ClientStaticEngineResult` (snippet hiển thị)** | Trình duyệt (Zustand Store) | Phiên làm việc (reload ⇒ server trả lại đúng bản đã lưu) | Server trả về | Trình duyệt |
| **Tài khoản, phiên, hồ sơ kỹ năng (`skill_states`)** | Supabase Postgres | Vĩnh viễn (tới khi xóa tài khoản) | Server (`DATABASE_URL`) | Chủ sở hữu (`auth.uid() = user_id`) |
| **Tiến độ node (`node_progress`)** | Supabase Postgres | Vĩnh viễn theo phiên học | Server (`DATABASE_URL`) | Chủ phiên học |
| **Lượt học (`node_runs`): câu hỏi, đáp án mẫu, ý bắt buộc** | Supabase Postgres | Vĩnh viễn theo phiên học | Server (`DATABASE_URL`) | Chỉ server; client đọc qua API, đáp án chỉ lộ khi câu đã xong (INV-07, D-36) |
| **Lịch sử nộp (`question_attempts`), Báo sai** | Supabase Postgres | Vĩnh viễn theo tài khoản | Server (`DATABASE_URL`) | Chủ phiên học qua API |
| **Văn bản AI đã kiểm (`ai_cache`)** | Supabase Postgres (`ai_cache`) | Lâu dài; khóa theo phiên bản repo + engine + prompt + model | Server (`DATABASE_URL`) | Server nội bộ (Client CẤM đọc) |
| **`ai_usage`** (lưu vết chi phí từng lời gọi AI) | Supabase Postgres (`ai_usage`) | Lâu dài theo phiên (xóa theo phiên / tài khoản) | Server (`DATABASE_URL`) | Server nội bộ, client cấm đọc (D-66) |
| **Tùy chọn giao diện (tab, cỡ chữ)** | Trình duyệt (`localStorage`) | Vĩnh viễn trên trình duyệt | Client UI | Client UI |

---

## 9. Chế độ suy biến & giới hạn phải nói thật

- **Repo không có kiến trúc tầng** (`PROCEDURAL`) ⇒ engine dựng node ảo theo `11`; repo toàn thuật toán rời không có entry chạy chế độ thường, chỉ có node thuật toán (D-54). AI dùng chế độ B (câu hỏi về thuật toán, Big-O, tình huống biên).
- **Ngôn ngữ `STRUCTURAL`** ⇒ cạnh nét đứt, huy hiệu độ tin cậy thấp, cổng gác chạy Relaxed Mode (`21`).
- **AI hiểu sai nghĩa** ⇒ code không bắt được (INV-08). Bù lại bằng 3 cách:
  - duyệt tay toàn bộ output của repo demo (`21` Mục 6);
  - hiện bằng chứng (bước + tên) cho người học;
  - nút "Báo sai".
- **Mọi số độ trễ / token / chi phí là mục tiêu, chưa đo** (`02` Mục 1.1). Khi trình bày, kèm số đo thật hiện trên giao diện.

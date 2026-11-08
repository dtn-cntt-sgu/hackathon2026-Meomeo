# 02 — HỢP ĐỒNG DỮ LIỆU & BẢNG HẰNG SỐ (NGUỒN CHÂN LÝ DUY NHẤT)

> Quy định mọi kiểu dữ liệu và mọi hằng số; file khác chỉ nhắc tên (`HybridArchitecturalNode`, `CONFIG.MASTERED_MIN`), không chép lại định nghĩa hay con số (INV-12). Người đọc: cả nhóm.
> **Trong repo thi:** Mục 1 ⇒ `src/contracts/config.ts`; Mục 2–10 ⇒ `src/contracts/*.ts` (tách theo mục). Gõ / sinh trong giờ thi, commit từng phần (xem `ke-hoach-thi/03_GIT_PUSH_PULL.md`).
> **Quy ước:** JSON qua mạng dùng `snake_case`; thời điểm là số mili-giây Unix (`number`); xác suất ∈ [0, 1]; số dòng code tính từ 1. Không dùng `any`.

## Đọc nhanh

- Bảng tra: `CONFIG` (Mục 1) cho con số; kiểu (Mục 2–7, 10) cho hàm / component; request / response (Mục 8) và mã lỗi (Mục 9) cho route.
- Đổi con số ⇒ sửa `CONFIG`, không sửa ở nơi dùng. Số ở Mục 1.1 là mục tiêu / ước lượng, chưa đo.
- Nhãn 5.1–5.4 là chú thích trong khối code của Mục 5, không phải tiêu đề.
- Kiểu ghi `// nội bộ` chỉ dùng trong 1 file spec được để tại file đó; kiểu đi qua API, ghi DB hoặc dùng ở ≥ 2 file spec nằm ở đây (D-61).

| Mục | Nhóm kiểu / nội dung | File spec dùng nhiều nhất |
| :-: | :-- | :-- |
| 1 | `CONFIG`; 1.1 mục tiêu / ước lượng | `11`, `22`, `10` |
| 2 | Kiểu nền: `SWE_SKILLS`, `LearnerTier`, `NodeStatus` | `22`, `10`, `20` |
| 3 | Đầu ra Engine: `HybridArchitecturalNode`, `StaticEngineResult` | `10`, `11`, `21` |
| 4 | Kiểu nội bộ Engine: `LanguageAdapter`, `SymbolDefinition` | `10`, `11` |
| 5 | AI: `NodeAnalysis` (5.1), `RepoOverviewRaw` (5.2), `QuestionPlanItem` (5.3), `GradingRaw` (5.4), `ExplainSelectionRaw` (5.5) | `20`, `22`, `21` |
| 6 | Người học, BKT, tiến độ: `QuestionState`, `NodeStateView`, `PERSONAS` | `22`, `30`, `03` |
| 7 | Lưu trữ: `GraphSkeletonNode`, `RunStepRef`, `RunQuestion`, `SessionRow` | `03`, `30` |
| 8 | API: request / response từng endpoint | `03`, `30` |
| 9 | Lỗi: `ErrorCode`, `ApiError`, bảng mã HTTP | `03`, `30`, `20` |
| 10 | Trình duyệt và Offline: `ClientWorkbenchState`, `OfflineMockBundle` | `30`, `21` |

---

## 1. CONFIG — bảng hằng số duy nhất

```typescript
export const CONFIG = {
  // ---------- Phiên bản (đổi ⇒ khóa cache mới) ----------
  ENGINE_VERSION: "1.7.0",      // Đổi khi đổi bất kỳ luật Tầng 0–2 làm đổi đồ thị / node_id (D-10, D-53 … D-58, D-61, D-63, D-65)
  PROMPT_VERSION: "1.2.0",            // Đổi khi đổi prompt hoặc responseSchema của 5 lời gọi AI (D-74)

  // ---------- Tầng 0: tải & lọc (10_ENGINE_INGEST) ----------
  MAX_STREAM_BYTES: 15 * 1024 * 1024, // Byte nén tải từ GitHub
  MAX_UPLOAD_BYTES: 4.5 * 1024 * 1024,// File zip upload — trần upload chung, D-27, D-64
  MAX_INFLATED_BYTES: 8 * 1024 * 1024,// Tổng byte sau giải nén của file được giữ
  MAX_COMPRESSION_RATIO: 100,         // uncompressed / compressed của 1 entry
  MAX_CLEAN_FILES: 100,               // Số file code tối đa giữ lại (D-41)
  MAX_SINGLE_FILE_BYTES: 1024 * 1024,
  MAX_NOTEBOOK_BYTES: 5 * 1024 * 1024,
  MAX_MANIFEST_BYTES: 256 * 1024,
  MAX_MANIFEST_DEPTH: 3,              // Độ sâu thư mục tối đa khi tìm manifest
  MAX_LINE_LENGTH: 1000,              // Có dòng dài hơn ⇒ coi là minified
  MAX_AVG_LINE_LENGTH: 200,
  BINARY_SNIFF_BYTES: 512,            // Số byte đầu dùng dò null byte
  STREAM_TIMEOUT_MS: 5000,            // Phủ toàn bộ kết nối + tải + giải nén
  STREAM_RETRY_DELAY_MS: 500,         // Thử lại stream 1 lần
  SELECTIVE_TIMEOUT_MS: 15000,        // Hạn `10` Mục 4A; đo lại ở H+1 (D-63)
  SELECTIVE_FETCH_CONCURRENCY: 16,
  AUTO_SCOPE_CHILD_RATIO: 0.5,        // `10` ING-47
  PREFLIGHT_TIMEOUT_MS: 1500,
  PREFLIGHT_PAGE_TIMEOUT_MS: 12000,  // Chỉ gọi trang repo khi archive/HEAD.zip trả 404 (10 Mục 2)
  PREFLIGHT_RETRY_DELAY_MS: 1000,     // Thử lại probe 1 lần
  DEFAULT_BRANCH_FALLBACKS: ["main", "master", "dev"],
  MAX_CONCURRENT_INGESTIONS: 4,       // Semaphore trong 1 instance, hàng đợi FIFO (D-31)
  INGEST_QUEUE_TIMEOUT_MS: 10000,     // Chờ hàng đợi quá lâu ⇒ ERR_SERVER_BUSY
  INGESTION_CACHE_TTL_MS: 10 * 60 * 1000,
  INGESTION_CACHE_MAX_ENTRIES: 20,    // LRU StaticEngineResult trong RAM — chỉ để nhanh, không được dựa vào (D-27)
  SECRET_MIN_VALUE_LENGTH: 6,
  UNSUPPORTED_LANGUAGE_RATIO: 0.5,    // > 50% byte code thuộc tier UNSUPPORTED ⇒ ERR_UNSUPPORTED_LANGUAGE
  MONOREPO_DOMINANT_RATIO: 0.7,
  GRAPH_CONFIDENCE_HIGH_RATIO: 0.8,   // ≥ 80% byte thuộc RESOLVED ⇒ HIGH
  GRAPH_CONFIDENCE_LOW_RATIO: 0.5,    // ≥ 50% byte thuộc STRUCTURAL ⇒ LOW
  FPS_IN_SCOPE: 3,                    // Trọng số FilePriorityScore
  FPS_ROLE_NAME: 2,
  FPS_TEST_PENALTY: -2,
  FPS_TINY_PENALTY: -1,
  FPS_TINY_BYTES: 200,

  // ---------- Tầng 1–2: đồ thị & lát cắt (11_ENGINE_DO_THI) ----------
  ENGINE_BUDGET_MS: 600,              // CHỈ cảnh báo trong ingestion_report, KHÔNG cắt file (D-10)
  PARSE_ERROR_RATIO_MAX: 0.30,        // Tỉ lệ byte nằm trong node ERROR > ngưỡng ⇒ bỏ file
  BARREL_MAX_DEPTH: 5,
  GIANT_SCC_RATIO: 0.40,
  GIANT_SCC_MAX_WEAK_EDGE_REMOVALS: 3,
  PROCEDURAL_MAX_FILES: 2,            // Không có entry REGISTERED/GENERIC và n ≤ 2 file ⇒ PROCEDURAL (D-54)
  FUNCTION_GRAPH_MIN_NODES: 3,
  LONG_FUNCTION_LINES: 300,
  PAGERANK_DAMPING: 0.85,
  PAGERANK_MAX_ITER: 20,
  PAGERANK_TOLERANCE: 1e-6,
  INGRESS_BONUS: 0.5,
  VIP_COMPLEXITY_MIN: 15,             // Độ phức tạp > ngưỡng ⇒ VIP
  VIP_FALLBACK_TOP_K: 6,
  VIP_FALLBACK_MIN_SCORE: 5,
  SLICE_MAX_HOPS: 4,                  // Số bước nhảy hàm tối đa từ entry (D-06)
  STEP_MAX_LINES: 30,
  NODE_MAX_LINES: 100,
  NODE_MAX_CODE_TOKENS: 1500,
  CHARS_PER_TOKEN: 4,
  CLAMP_WINDOW_LINES: 30,             // Cửa sổ Hard Clamp quanh criterion (≤ STEP_MAX_LINES)
  UNCLE_BOB_BALANCED_MAX_D: 0.30,
  UNCLE_BOB_ZONE_MIN_D: 0.50,
  DISPLAY_MIN_NODES: 6,
  DISPLAY_MAX_NODES: 20,              // D-53
  CRITICAL_PATH_MAX_NODES: 6,         // D-53
  DAGRE_RANKDIR: "TB",
  DAGRE_RANKSEP: 100,
  DAGRE_NODESEP: 80,
  NODE_BOX_WIDTH: 240,
  NODE_BOX_HEIGHT: 90,
  TITLE_MAX_CHARS: 32,
  TITLE_MAX_TOKENS: 4,
  TITLE_MIN_TOKEN_CHARS: 3,           // Bỏ token ≤ 2 ký tự trừ ACRONYMS
  ROUTE_SEGMENT_MAX_CHARS: 30,
  HIGH_ENTROPY_MIN_CHARS: 16,
  HIGH_ENTROPY_MIN_BITS: 3.5,
  DOMAIN_TERMS_MAX: 2,
  DOMAIN_TERM_MIN_TF: 2,

  // ---------- AI (20_AI_GOI_VA_PROMPT, 21_AI_KIEM_VA_DUYET) ----------
  LLM_MODEL: "gemini-3.5-flash-lite", // D-50
  LLM_TEMPERATURE: 0,
  LLM_THINKING_BUDGET: 0,
  LLM_TIMEOUT_MS: 30000,              // Đo lại ở H+1
  LLM_MAX_RETRIES: 1,                 // Lỗi mạng / 429 / 503 / JSON hỏng / bị cổng gác chặn ⇒ gọi lại 1 lần; bị chặn thì kèm lý do (AI-37)
  LLM_RETRY_DELAY_MS: 500,            // Chờ trước khi gọi lại sau 429 / 503
  LLM_RETRY_DELAY_MAX_MS: 20000,      // Trần retryDelay từ server, vượt ⇒ không gọi lại (D-74 R1)
  LLM_RETRY_JITTER_MS: 100,           // Cộng ngẫu nhiên [0, JITTER)
  GUARD_FEEDBACK_MAX_CHARS: 400,     // Trần khối <guard_feedback> khi gọi lại (AI-37)
  GRADING_QUOTE_MIN_CHARS: 3,         // Đoạn trích (đã chuẩn hóa) ngắn hơn ⇒ ý đó không tính (D-13)
  LLM_MAX_OUTPUT_TOKENS: { ANALYZE: 1400, OVERVIEW: 1500, QUESTIONS: 900, GRADE: 500, EXPLAIN: 400 },   // Đo thật: OVERVIEW 13 bài vượt 600 (C-12); ANALYZE bài 5 bước vượt 900 (C-02)
  LLM_PRICE_INPUT_USD_PER_M: 0.30,    // USD / 1 triệu token vào (D-69)
  LLM_PRICE_OUTPUT_USD_PER_M: 2.50,   // USD / 1 triệu token ra, gồm token suy nghĩ (D-69)
  ANALYZE_CONCURRENCY: 3,             // Số lời gọi analyze-node chạy cùng lúc / phiên
  OVERVIEW_README_MAX_CHARS: 2000,    // Trần readme_excerpt, chưa đo (D-83)
  EXPLAIN_SELECTION_MAX_CHARS: 300,   // Trần vùng chọn của explain-selection, chưa đo (D-82)
  EXPLAIN_MAX_PER_SESSION: 30,        // Số lời gọi AI explain-selection / phiên, chưa đo (D-82)
  SESSION_TOKEN_QUOTA: 200000,        // Tổng token vào + ra / phiên học, đếm ở server
  ANALYSIS_MIN_SKILLS: 1,
  ANALYSIS_MAX_SKILLS: 3,
  ANALYSIS_MAX_PATTERNS: 2,
  WEAK_POINTS_PER_SKILL_MAX: 1,
  MUST_HAVE_POINTS_MIN: 2,
  MUST_HAVE_POINTS_MAX: 3,
  HISTORY_MISSED_POINTS_MAX: 3,       // Số ý bắt buộc đã hụt tối đa nạp vào prompt đặt câu hỏi (D-74 A5b)
  GRADE_REFERENCED_MAX: 3,            // Số tên hàm node khác tối đa tra khi chấm (D-74 M1)
  FLOW_ANSWER_MIN_STEPS: 2,           // Đáp án câu FLOW phải nhắc tên ở ≥ 2 bước
  FEEDBACK_MAX_SENTENCES: 2,

  // ---------- Nộp bài ----------
  ANSWER_MIN_CHARS: 15,               // Sau khi bỏ khoảng trắng
  ANSWER_MAX_CHARS: 2000,
  ANSWER_DUPLICATE_SIMILARITY: 0.8,   // 1 - Levenshtein / max(len): ≥ ngưỡng so với lần nộp trước của CÙNG câu ⇒ chặn
  SUBMIT_DEBOUNCE_MS: 3000,
  PASS_CORE_ACCURACY: 70,
  MAX_ATTEMPTS_PER_QUESTION: 3,

  // ---------- BKT (22_BKT_VA_KE_HOACH_CAU_HOI) ----------
  BKT_P_L0: 0.25,
  BKT_P_T_CORRECT: 0.08,
  BKT_P_T_INCORRECT: 0.03,
  BKT_P_G: 0.25,
  BKT_P_G_HINT: 0.50,
  BKT_P_S: 0.12,
  BKT_P_MIN: 0.01,
  BKT_P_MAX: 0.99,
  BKT_REVERT_EPSILON: 1e-9,          // Sai số so p_mastery với p_after khi Báo sai (D-22)
  DECAY_HALF_LIFE_DAYS: 14,
  DECAY_FLOOR: 0.25,                  // = BKT_P_L0
  TIER_PRACTITIONER_MIN: 0.45,
  TIER_ARCHITECT_MIN: 0.75,
  MASTERED_MIN: 0.92,                 // Ngưỡng "đã thạo" khi lập kế hoạch câu hỏi (22, D-34, D-60)
  NOVICE_SECOND_QUESTION: false,      // bật sau khi đo token
  GAP_TARGETING: false,

  // ---------- Lưu trữ (03_API_VA_LUU_TRU) ----------
  DB_RETRY_DELAYS_MS: [100, 300],     // Thử lại tối đa 2 lần
  DEMO_MODE_ENV: "DEMO_MODE",         // Biến môi trường bật /api/demo/persona

  REPORT_NOTE_MAX_CHARS: 500,         // = check char_length(note) của dispute_reports

  // ---------- Giao diện (30_UI) ----------
  UI_PRESENTATION_FOCUS_PCT: 60,      // Cột code ở chế độ trình chiếu; 2 cột còn lại chia đều phần còn lại
  UI_PRESENTATION_FONT_SCALE: 1.25,

  // ---------- Đơn vị ----------
  MS_PER_DAY: 86_400_000,
} as const;
```

### 1.1. Mục tiêu & ước lượng (không phải hằng số; **chưa đo trên code thật**)

| Hạng mục | Mục tiêu / ước lượng | Ghi chú |
| :-- | :-- | :-- |
| Tầng 0 (probe + tải + lọc) | 0.8 – 1.2 s; probe ≤ 0.3 s | Timeout cứng = `STREAM_TIMEOUT_MS` |
| Tầng 1 + 2 (grammar đã warm) | < 0.25 s | `ENGINE_BUDGET_MS` chỉ để cảnh báo |
| **Cold-start bản đồ (0 token)** | **< 1.5 s** | Repo ≤ 15 MB nén, mạng ổn định |
| Repo lớn, tải chọn lọc (D-63) | ~6–8 s | Đo 01/11 trên 3 repo từ máy dev: zip cắt 2,2–2,6 s + danh sách và 100 file 3,9–5,5 s; chưa đo trên Cloud Run |
| `analyze-node` / `enrich-node` | 6,5–8 s, đo 31/10 bằng đề ngắn; prompt thật chưa đo | Phân tích node đang mở và 1–2 node kế tiếp (D-46), `ANALYZE_CONCURRENCY` song song |
| `analyze-overview` | chưa đo, dự kiến cùng bậc | Ngay sau khi quét, trước khi tải trước node (D-83) |
| `evaluate-feynman` | chưa đo, dự kiến cùng bậc | |
| `explain-selection` | chưa đo, dự kiến cùng bậc | Chỉ khi người học bấm nút (D-82) |
| Đọc hồ sơ `GET /api/me` | 0.05 – 0.1 s | Server và Supabase cùng vùng |
| Token: phân tích / tổng quan / đặt câu hỏi / chấm | ~2,000→700 · ~1,500→400 · ~1,600→650 · ~800→200 (vào→ra) | Mỗi lời gọi ra ≤ `LLM_MAX_OUTPUT_TOKENS` |
| **Người học đầu tiên của 1 repo (7 node, ~15 câu)** | ~37 lời gọi · **~58,500 token** · ~$0.05 | Đơn giá `CONFIG.LLM_PRICE_*` (D-69) |
| Người học sau cùng repo (trúng cache phân tích) | ~29 lời gọi · ~38,000 token · ~$0.03 | Tốn lượt đặt câu hỏi + chấm (câu hỏi không cache, D-37) |
| **Người học đầu tiên của repo 20 node** | ~106 lời gọi · **~167,000 token** · ~$0.14 | Tính tỉ lệ từ dòng 7 node, chưa đo |
| Người học sau, repo 20 node | ~83 lời gọi · ~109,000 token · ~$0.09 | Tính tỉ lệ từ dòng 7 node, chưa đo |
| Chế độ Offline | 0 token | Dữ liệu ghi lại, đã duyệt tay |
| Dung lượng Postgres / người học | < 100 KB, cộng `session_snapshots` tới ~120 KB phần code với phiên 20 node, chưa đo | Gồm câu trả lời ≤ `ANSWER_MAX_CHARS`; phần code = `NODE_MAX_CODE_TOKENS` × `CHARS_PER_TOKEN` × 20 |

---

## 2. Kiểu nền

```typescript
export const SWE_SKILLS = [
  "HTTP_ROUTING", "DTO_VALIDATION", "AUTH_SECURITY", "DEPENDENCY_INJECTION",
  "LAYERED_SEPARATION", "DB_OPTIMIZATION", "ASYNC_CONCURRENCY", "TRANSACTION_INTEGRITY",
  "ERROR_HANDLING", "STATE_MANAGEMENT", "ALGORITHMIC_COMPLEXITY", "MEMORY_MANAGEMENT",
  "API_CONTRACT_DESIGN", "CACHING_STRATEGY", "RATE_LIMIT_RESILIENCE", "DATA_SERIALIZATION",
] as const;
export type SWESkill = typeof SWE_SKILLS[number];

export type LearnerTier = "NOVICE" | "PRACTITIONER" | "ARCHITECT";

// Trạng thái FSM của node trong 1 phiên học (lưu ở node_progress; LOCKED chỉ suy ra, không lưu)
export type NodeStatus = "LOCKED" | "AVAILABLE" | "COMPLETED" | "FAILED";

export type ProjectArchetype =
  | "WEB_BACKEND" | "WEB_FRONTEND" | "MOBILE_APP" | "DESKTOP_APP" | "CLI_TOOL" | "ALGORITHM_CORE";

// Mã ngôn ngữ của Language Registry: UPPER_SNAKE theo tên adapter (VD "TYPESCRIPT", "TSX", "PYTHON", "CSHARP")
export type LanguageId = string;
export type LanguageSupportTier = "RESOLVED" | "STRUCTURAL" | "UNSUPPORTED";

export type ArchitecturalLayer =
  | "ENTRY_POINT" | "MIDDLEWARE" | "BUSINESS_LOGIC" | "DATA_ACCESS"       // Lát cắt nghiệp vụ
  | "ALGO_SETUP" | "ALGO_EXECUTION" | "ALGO_TERMINATION";                // Node thuật toán

export type NodeType = "ARCHITECTURAL_DATA_FLOW" | "ALGORITHMIC_CORE";
export type DegradedMode = "PROCEDURAL";
export type GraphConfidence = "HIGH" | "MIXED" | "LOW";

// Danh mục mẫu kiến trúc cố định (AI chỉ được chọn trong danh mục)
export const ARCHITECTURE_PATTERNS = [
  "LAYERED", "MVC", "REPOSITORY", "MIDDLEWARE_CHAIN", "DEPENDENCY_INJECTION", "FACTORY",
  "OBSERVER_EVENT", "STRATEGY", "ADAPTER", "SINGLETON", "PIPELINE", "ALGORITHMIC", "PROCEDURAL", "OTHER",
] as const;
export type ArchitecturePattern = typeof ARCHITECTURE_PATTERNS[number];
```

---

## 3. Đầu ra Engine (Tầng 0–2)

```typescript
export interface LanguageSupportInfo {
  language: LanguageId;
  tier: LanguageSupportTier;
  code_bytes: number;
}

export interface ProjectFingerprint {
  archetype: ProjectArchetype;
  primary_language: LanguageId;                 // Nhiều byte code nhất
  language_breakdown: LanguageSupportInfo[];    // Giảm dần theo code_bytes
  graph_confidence: GraphConfidence;            // Ngưỡng: CONFIG.GRAPH_CONFIDENCE_*
  detected_framework: string | null;            // Từ manifest (VD "Express", "NestJS", "FastAPI"); không đoán được ⇒ null
  tech_stack: string[];                         // Tên gói chuẩn hóa chữ thường từ mọi manifest (VD "express", "typeorm", "pg")
  is_monorepo: boolean;
  root_dir_offset: string;                      // "" hoặc "server/"
}

export type NodeTitleSource = "ROUTE" | "ENTRY_SYMBOL" | "DOMAIN_TERMS" | "DIRECTORY" | "FILE_BASENAME" | "VIRTUAL";
// Nhóm suy ra (UI thêm tiền tố "~"): DOMAIN_TERMS, DIRECTORY, FILE_BASENAME

export interface ExecutionTraceStep {
  step_number: number;          // 1..n theo thứ tự gọi
  layer: ArchitecturalLayer;
  file_path: string;            // POSIX, tương đối gốc repo
  function_name: string;        // "OrderService.checkout" hoặc "checkout"
  line_start: number;           // Dòng gốc của hàm trong file
  line_end: number;
  snippet: string;              // ≤ CONFIG.STEP_MAX_LINES dòng, đã che secret, dòng bị lược = 1 marker comment
  snippet_line_map: number[];   // snippet_line_map[i] = số dòng gốc của dòng i trong snippet (marker ⇒ 0)
  origin_note?: string;         // File ảo từ .ipynb/.vue/.svelte: "cell 4" / "<script>" (SourceMapStore)
}

export interface UncleBobMetrics {
  instability: number;          // I = Ce / (Ca + Ce)
  abstractness: number;         // A = Na / (Na + Nc)
  distance: number;             // D = |A + I − 1|
  diagnosis: "BALANCED" | "ZONE_OF_PAIN" | "ZONE_OF_USELESSNESS";
  is_exempt: boolean;           // Miễn trừ ⇒ D = 0, BALANCED
}

export type EntityOp = "CREATE" | "READ" | "UPDATE" | "DELETE";   // D-84

export interface HybridArchitecturalNode {
  id: string;                   // Tất định (D-08)
  title: string;                // Thuật toán đặt tên tất định, 0 token, AI không đổi
  title_source: NodeTitleSource;
  title_evidence: string;       // VD "POST /orders/checkout"
  node_type: NodeType;
  entry_symbol: string | null;  // Khóa SymbolTable của hàm entry; null với node ảo
  prerequisites: string[];      // id node cha (= cạnh đi vào)
  position: { x: number; y: number };
  files: string[];              // files[0] = file của step 1
  languages: LanguageId[];
  support_tier: LanguageSupportTier;   // Tier thấp nhất trong các file
  cognitive_complexity: number;        // max độ phức tạp các hàm trong lát cắt (D-12)
  rank_score: number;                  // PageRank + ingress bonus của file entry
  is_vip_algorithm: boolean;
  is_capstone: boolean;                // Đúng 1 node / đồ thị (D-12)
  uncle_bob: UncleBobMetrics;
  trace_steps: ExecutionTraceStep[];   // Tổng dòng snippet ≤ CONFIG.NODE_MAX_LINES
  dto_snippet: string;                 // Khai báo kiểu dữ liệu mà các step dùng (≤ CONFIG.STEP_MAX_LINES dòng), "" nếu không có
  group_id: string;                    // = group_id của 1 phần tử StaticEngineResult.groups (D-84)
  entities: Array<{ name: string; ops: EntityOp[] }>;   // Thực thể bài chạm tới và thao tác (D-84)
}

export interface GraphEdge {
  id: string;                          // `${source}->${target}`
  source: string;
  target: string;
  confidence: "RESOLVED" | "INFERRED"; // INFERRED nếu chuỗi lời gọi tạo ra cạnh có ≥ 1 cạnh hàm suy luận, hoặc là cạnh cây D-73
  via_entities: string[];              // Thực thể mà cạnh đi qua, [] nếu không qua thực thể (D-84)
}

export type IngestionErrorCode =
  | "ERR_INVALID_GITHUB_URL" | "ERR_PREFLIGHT_404_OR_PRIVATE" | "ERR_NETWORK_TIMEOUT" | "ERR_BRANCH_NOT_FOUND"
  | "ERR_EMPTY_REPOSITORY" | "ERR_REPO_UNAVAILABLE_451" | "ERR_GITHUB_RATE_LIMIT_CDN" | "ERR_STREAM_TIMEOUT"
  | "ERR_STREAM_CORRUPTED" | "ERR_STREAM_QUOTA_EXCEEDED" | "ERR_UNSUPPORTED_LANGUAGE" | "ERR_NO_SOURCE_FILES_FOUND"
  | "ERR_NO_ARCHITECTURAL_SLICE" | "ERR_UPLOAD_INVALID" | "ERR_SERVER_BUSY";

export interface IngestionReport {
  truncated: boolean;
  selective_fetch: boolean;                   // `10` Mục 4A thành công (D-63)
  code_file_count: number;
  manifest_count: number;
  omitted_node_count: number;                 // Node bị bỏ vì vượt DISPLAY_MAX_NODES (D-53)
  skipped: { garbage: number; binary: number; oversized: number; unsupported_lang: number; quota: number; parse_error: number };
  warnings: string[];                         // Tiếng Việt, hiển thị cho người học
  degraded_mode: DegradedMode | null;
  redacted_secret_count: number;
  engine_ms: number;                          // Thời gian Tầng 1–2 đo được (hiện ở đồng hồ đo)
  ingest_ms: number;                          // Thời gian Tầng 0
  suspicious_instruction_files: string[];     // CHỈ SERVER — bị lọc khỏi bản client
}

export interface RepoSnapshotKey {
  source: "GITHUB" | "ZIP";
  repo_key: string;                    // "owner/repo" hoặc tên file zip
  snapshot_id: string;                 // Commit SHA 40 hex hoặc SHA-256 của TOÀN BỘ buffer zip; phiên gắn cố định (D-39)
  snapshot_id_kind: "COMMIT_SHA" | "ARCHIVE_HASH";
  subdir: string;                      // "" khi phân tích cả repo
  ref_label: string | null;            // Nhánh mặc định nếu biết; null khi GitHub chỉ trả SHA — chỉ hiển thị
}

// Bản đầy đủ — CHỈ SERVER: cache RAM + session_snapshots (D-59), không có file nguồn
export interface StaticEngineResult {
  engine_version: string;              // = CONFIG.ENGINE_VERSION
  repo_name: string;
  snapshot: RepoSnapshotKey;
  fingerprint: ProjectFingerprint;
  total_files: number;
  nodes: HybridArchitecturalNode[];    // DISPLAY_MIN_NODES..DISPLAY_MAX_NODES khi repo đủ lớn
  edges: GraphEdge[];
  groups: Array<{                      // Nhóm chức năng tất định (D-84)
    group_id: string;
    key: string;                       // Nhãn dự phòng khi AI chưa đặt tên
    key_kind: "ENTITY" | "ROUTE_PREFIX" | "STANDALONE";
    node_ids: string[];
  }>;
  symbol_whitelist: string[];          // Phạm vi repo, đã sort (D-19)
  file_index: string[];                // Mọi file code đã nạp, đã sort
  readme_excerpt: string | null;       // Chép từ IngestOutput để analyze-overview đọc từ snapshot (D-83)
  manifest_description: string | null; // Chép từ IngestOutput (D-83)
  ingestion_report: IngestionReport;
}

// Bản gửi trình duyệt — server dựng bằng toClientResult() theo danh sách trường cho phép
export type ClientStaticEngineResult =
  Omit<StaticEngineResult, "symbol_whitelist" | "ingestion_report" | "readme_excerpt" | "manifest_description"> & {
    ingestion_report: Omit<IngestionReport, "suspicious_instruction_files">;
  };
```

---

## 4. Kiểu nội bộ Engine (dùng chung giữa `10` và `11`)

```typescript
export interface LanguageAdapter {
  id: LanguageId;
  extensions: string[];               // ".ts", ".py"...
  wasm_grammar: string;               // Tên file .wasm trong public/grammars/, đóng gói vào route ingest (`04` Mục 16)
  query_file: string;                 // Đường dẫn .scm (định nghĩa, lời gọi, import)
  manifest_files: string[];           // "package.json", "requirements.txt"...
  import_resolver?: "TS_JS" | "PYTHON" | "JAVA" | "GO" | "DART"; // Có ⇒ tier RESOLVED
  ingress_patterns?: string[];        // Tên mẫu ingress trên AST (11 Mục 4, bảng ở 12 Mục 1)
  abstraction_kinds?: string[];       // Loại node AST tính là trừu tượng (Uncle Bob)
  comment_prefix: string;             // "//" hoặc "#" — dùng cho marker lược dòng
}

export interface GithubRepoInfo {
  owner: string;
  repo: string;
  path_trimmed: boolean;              // Link có /tree/…, /blob/… ⇒ đã cắt về gốc repo, UI ghi chú "Chỉ hỗ trợ nhánh mặc định" (D-38)
  clean_url: string;                  // https://github.com/owner/repo
}

export type ProbeResult = "OK" | "NOT_FOUND_OR_PRIVATE" | "UNAVAILABLE_451" | "RATE_LIMITED" | "TIMEOUT" | "EMPTY";

export interface SymbolDefinition {
  key: string;                        // "filePath#Class.method"
  kind: "FUNCTION" | "METHOD" | "CLASS" | "INTERFACE" | "TYPE" | "VARIABLE";
  name: string;
  file_path: string;
  line_start: number;
  line_end: number;
  is_exported: boolean;
}

export interface FunctionCallEdge {    // Đồ thị gọi hàm (cấp hàm, dùng cho lát cắt)
  caller: string;                     // Khóa SymbolTable
  callee: string;
  confidence: "RESOLVED" | "INFERRED";
  ambiguous: boolean;                 // Nhiều implementor / nhiều ứng viên cùng hậu tố
  call_count: number;
}

export type IngestSource =
  | { kind: "GITHUB_URL"; repo_url: string; subdir_override: string | null }
  | { kind: "GITHUB_COMMIT"; owner: string; repo: string; sha: string; subdir: string }  // 03 §4 — chỉ khi phiên thiếu session_snapshots (D-59)
  | { kind: "ZIP_UPLOAD"; file_name: string; bytes: Uint8Array; subdir_override: string | null };

export interface VirtualFileOrigin {  // SourceMapStore
  kind: "NOTEBOOK" | "SFC";
  original_path: string;              // "nb/eda.ipynb"
  line_origin: string[];              // [i] = nhãn của dòng ảo i+1: "cell 4" | "<script>" | ""
}

export interface IngestOutput {       // Chỉ sống trong runEngine
  repo_name: string;
  snapshot: RepoSnapshotKey;
  fingerprint: ProjectFingerprint;
  report: IngestionReport;            // engine_ms = 0, skipped.parse_error = 0 — 11 điền tiếp
  code: Map<string, string>;          // RAMCodeStore: path POSIX ⇒ nội dung đã làm sạch + che secret
  file_language: Map<string, LanguageId>;
  manifests: Map<string, string>;     // ManifestStore — không tính vào CONFIG.MAX_CLEAN_FILES
  source_map: Map<string, VirtualFileOrigin>;
  module_info: { go_module_path: string | null; dart_package_name: string | null; package_entry_files: string[] };
  readme_excerpt: string | null;      // Đoạn đầu README, đã che secret, ≤ CONFIG.OVERVIEW_README_MAX_CHARS (D-83)
  manifest_description: string | null;
}
```

---

## 5. AI — đầu vào, đầu ra thô, bản đã kiểm

```typescript
// ---------- 5.1 analyze-node ----------
export interface AnalysisSkill { skill: SWESkill; step: number; symbol: string; reason: string }
export interface AnalysisStepText { step: number; text: string }
export interface AnalysisWeakPoint { skill: SWESkill; step: number; symbol: string; what: string; consequence: string }

export interface NodeAnalysisRaw {      // = responseSchema của lời gọi analyze
  skills: AnalysisSkill[];
  architecture: { patterns: ArchitecturePattern[]; summary: string };
  steps: AnalysisStepText[];
  strengths: AnalysisStepText[];
  weak_points: AnalysisWeakPoint[];
}

export interface NodeAnalysis extends NodeAnalysisRaw {  // Sau khi qua kiểm (21) — lưu ai_cache, dùng chung (D-37)
  node_id: string;
  skeleton_only: boolean;               // true ⇒ phần chữ bị bỏ sau 2 lần trượt gác, chỉ còn skills + khung bước
}

export interface NodeAnalysisView {     // Gửi trình duyệt (phần X-Ray)
  node_id: string;
  skills: Array<AnalysisSkill & { file_path: string; line_start: number; line_end: number }>;
  architecture: { patterns: ArchitecturePattern[]; summary: string };
  steps: Array<{ step: number; layer: ArchitecturalLayer; file_path: string; line_start: number; line_end: number; text: string | null }>;
  strengths: AnalysisStepText[];
  weak_points: Array<AnalysisWeakPoint & { file_path: string; line_start: number; line_end: number }>; // dòng = cả step
  shared_files: Array<{ file_path: string; node_ids: string[] }>;   // "Liên quan" — code tính
  skeleton_only: boolean;
}

// ---------- 5.2 analyze-overview ----------
export interface RepoOverviewRaw {      // = responseSchema của lời gọi overview (D-83)
  summary: string;                      // Tối đa 2 câu
  groups: Array<{ group_id: string; name: string }>;
  node_titles: Array<{ node_id: string; title: string }>;   // Tên tiếng Việt; node.id không đổi (D-08)
}
export interface RepoOverviewView {
  facts: {                              // Do code tính
    archetype: ProjectArchetype; framework: string | null; tech_stack: string[];
    root_node_ids: string[]; main_path_node_ids: string[];
  };
  ai: RepoOverviewRaw | null;           // null ⇒ AI hỏng sau thử lại hoặc bị cổng gác chặn, chỉ hiện phần facts (D-83)
}

// ---------- 5.3 enrich-node (đặt câu hỏi) ----------
export type QuestionFocus = "FLOW" | "ARCHITECTURE" | "WEAKNESS" | "CHANGE";
export type RunMode = "LEARN";          // D-35

export interface QuestionPlanItem {
  question_index: number;               // 1..n
  skill: SWESkill;
  tier: LearnerTier;
  focus: QuestionFocus;
  step_indices: number[];               // Các bước gửi cho AI khi đặt câu hỏi và khi chấm
}

export interface GeneratedQuestionRaw {  // Phần tử của responseSchema lời gọi đặt câu hỏi
  skill: SWESkill;
  feynman_question: string;
  reference_answer: string;
  must_have_points: string[];           // MUST_HAVE_POINTS_MIN..MAX
  fix: string;                          // Cách sửa; câu không về điểm dở ⇒ có thể là câu nói "không cần sửa"
}

export interface QuestionPromptPayload {  // Gói gửi AI — CHỈ SERVER
  macro_context: {
    repo_name: string; archetype: ProjectArchetype; tech_stack: string[];
    graph_confidence: GraphConfidence; degraded_mode: DegradedMode | null;
    node_id: string; node_title: string; node_type: NodeType;
  };
  micro_trace: { scoped_code_snippet: string; dto_interfaces: string };
  node_analysis: Pick<NodeAnalysis, "steps" | "strengths" | "architecture" | "weak_points">;
  invariants: {
    questions_plan: Array<Pick<QuestionPlanItem, "skill" | "tier" | "focus" | "step_indices">>;
    forbidden_external_keywords: string[];
  };
}

// ---------- 5.4 evaluate-feynman (chấm) ----------
export type AnswerIntent = "ANSWER" | "GIVE_UP" | "OFF_TOPIC";
export type FollowUpType = "CONCEPT" | "CODE_POINTER";

export interface GradingRaw {           // = responseSchema của lời gọi chấm — CHỈ SERVER
  core_accuracy: number;                // 0..100
  simplicity: number;                   // 0..100, không ảnh hưởng Đạt
  intent: AnswerIntent;
  points: Array<{ index: number; covered: boolean; quote: string }>; // index theo must_have_points (1..n)
  misconception: string;                // Không bao giờ gửi trình duyệt
  follow_up_question: string | null;
  follow_up_type: FollowUpType | null;
  follow_up_step_index: number | null;
  feedback: string;                     // ≤ CONFIG.FEEDBACK_MAX_SENTENCES câu
  detected_jargons: string[];
}
// Đầu vào chấm đọc từ node_runs.questions (03), không có code_context (D-36)

export type GuardCall = "analyze" | "overview" | "questions" | "grade" | "explain";
export type GuardCode =                                  // 21: A1–A7, O1–O6, Q1–Q9, E1–E4, G1–G2
  | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7"
  | "O1" | "O2" | "O3" | "O4" | "O5" | "O6"
  | "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8" | "Q9"
  | "E1" | "E2" | "E3" | "E4"
  | "G1" | "G2";
export interface GuardIssue {                            // Lý do cổng gác, do code dựng (GUARD-22)
  code: GuardCode;
  question?: number;                                     // Vị trí câu trong request vừa gửi, tính từ 1
  step?: number;                                         // Số bước hợp lệ
  name?: string;                                         // Tên bị chặn; chỉ dùng khi khớp trọn IDENT_RE
}
export interface GuardLogEntry {                         // Một dòng log mỗi lần chặn (04 Mục 9, GUARD-22)
  event: "guard_blocked";
  call: GuardCall;
  attempt: number;                                       // Số thứ tự request, tính từ 1
  node_id: string | null;                                // null với overview
  codes: GuardCode[];                                    // Không trùng
  prompt_version: string;
  llm_model: string;
}

// ---------- 5.5 explain-selection (D-82) ----------
export interface ExplainSelectionRaw {  // = responseSchema của lời gọi explain
  kind: "KEYWORD" | "NAME" | "CODE";
  what: string;                         // 2–3 câu
  here: string;                         // 1–2 câu
  analogy: string;                      // 0–1 câu, "" nếu không hợp
  skill: SWESkill | null;
}
```

---

## 6. Người học, BKT, tiến độ

```typescript
export type NodeOutcome = "PASS_FIRST" | "PASS_AFTER_HINT" | "FAILED";

export interface CognitiveSkillState {   // = 1 dòng skill_states
  skill: SWESkill;
  p_mastery: number;                    // Điểm GỐC sau lần cập nhật gần nhất ∈ [BKT_P_MIN, BKT_P_MAX]; decay không ghi đè
  last_practiced_at: number;
  practice_count: number;
  correct_count: number;
}

export interface LearnerCognitiveProfile {   // Đi theo NGƯỜI HỌC, dùng chung mọi repo
  user_id: string;                      // = auth.users.id
  display_name: string | null;
  skills: Partial<Record<SWESkill, CognitiveSkillState>>; // Thiếu kỹ năng ⇒ đọc là P = BKT_P_L0
  overall_tier: LearnerTier;            // Chỉ hiển thị (D-20)
}

export interface QuestionReveal { reference_answer: string; must_have_points: string[]; fix: string }

export interface QuestionState {
  question_index: number;
  feynman_question: string;             // Server đọc từ node_runs.questions (D-36)
  skill: SWESkill;
  tier: LearnerTier;
  focus: QuestionFocus;
  attempts_used: number;                // 0..MAX_ATTEMPTS_PER_QUESTION
  finished: boolean;
  outcome: NodeOutcome | null;
  ended_by: "ANSWER" | "SKIP" | "DROPPED" | null;   // DROPPED = AI không đặt được câu (D-03), không cập nhật BKT
  disputed: boolean;                    // Người học bấm "Báo sai" (D-22)
  reveal: QuestionReveal | null;        // Có khi finished
}

export interface NodeRunView {
  run_id: string;
  node_id: string;
  mode: RunMode;
  started_at: number;
  finished_at: number | null;
  questions: QuestionState[];
}

export interface NodeStateView {         // 1 node trong 1 phiên
  node_id: string;
  status: NodeStatus;
  has_warning: boolean;                 // Có node cha FAILED hoặc phân tích lỗi (soft-bypass)
  analysis_failed: boolean;             // D-03
  last_run: NodeRunView | null;
}

export interface SessionProgress {
  session_id: string;
  nodes: Record<string, NodeStateView>;
  tokens_used: number;                  // So với CONFIG.SESSION_TOKEN_QUOTA
}

export interface SkillChange { skill: SWESkill; p_before: number; p_after: number; outcome: NodeOutcome }

export type PersonaMode = "NEWBIE" | "MID_LEVEL" | "SENIOR_RUSTY";
// Dữ liệu mẫu demo (fixture), không phải tham số — không đưa vào CONFIG
export const PERSONAS: Record<PersonaMode, { initial_p_mastery: number; days_idle: number; label: string }> = {
  NEWBIE:        { initial_p_mastery: 0.25, days_idle: 0,  label: "Sinh viên năm 2" },
  MID_LEVEL:     { initial_p_mastery: 0.65, days_idle: 0,  label: "Mid-level dev" },
  SENIOR_RUSTY:  { initial_p_mastery: 0.95, days_idle: 30, label: "Senior nghỉ 30 ngày (demo mài mòn, D-35)" },
};
```

---

## 7. Lưu trữ & phiên học

```typescript
export interface GraphSkeletonNode {     // learning_sessions.graph_skeleton — KHÔNG chứa code
  node_id: string;
  title: string;
  prerequisites: string[];
  is_capstone: boolean;
}

export interface LearningSessionSummary {
  session_id: string;
  snapshot: RepoSnapshotKey;
  repo_name: string;
  engine_version: string;
  created_at: number;
  last_active_at: number;
  completed_count: number;
  failed_count: number;
  total_nodes: number;
  can_resume: boolean;
  resume_blocker: "ENGINE_UPDATED" | null; // 03 Mục 2 (D-59)
}

export interface RunStepRef {             // node_runs.steps — chỉ tên, KHÔNG có code (D-36)
  step_index: number;                     // = ExecutionTraceStep.step_number
  layer: ArchitecturalLayer;
  file_path: string;
  function_name: string;
}

export interface AttemptHistoryItem {
  node_id: string;
  node_title: string;
  mode: RunMode;
  question_index: number;
  skill: SWESkill;
  attempt_number: number;
  core_accuracy: number;
  is_passed: boolean;
  intent: AnswerIntent;
  student_answer: string;
  created_at: number;
}

export interface RunQuestion extends QuestionPlanItem, Omit<GeneratedQuestionRaw, "skill"> {  // node_runs.questions (`03` Mục 3.1); câu hỏi + reference_answer + must_have_points + fix (D-36); CHỈ SERVER
  attempts_used: number;
  finished: boolean;
  outcome: NodeOutcome | null;
  ended_by: "ANSWER" | "SKIP" | "DROPPED" | null;
  disputed: boolean;
  p_before: number | null;           // Điểm kỹ năng trước / sau lần cập nhật BKT của câu này (cho D-22)
  p_after: number | null;
  last_answer: string | null;        // Kiểm trùng ở server
}

export type GradeContext = RunQuestion & { steps: RunStepRef[]; forbidden_external_keywords: string[] };  // Dựng từ 1 dòng node_runs (`03` Mục 3.1): câu question_index + steps + forbidden_external_keywords của run; CHỈ SERVER

export interface SessionRow {            // 1 dòng learning_sessions (`03` Mục 3); CHỈ SERVER
  id: string;
  user_id: string;
  engine_version: string;
  tokens_used: number;
}

export type DbTx = unknown;              // CHỈ SERVER; handle transaction của tầng lưu trữ, thao tác ở `03` Mục 4, 6
```

---

## 8. API — request / response mọi endpoint

Mọi endpoint cần phiên Supabase (đăng nhập GitHub), gửi qua header `Authorization: Bearer <access_token>`. Lỗi trả `ApiError` (Mục 9). Hành vi và luồng ghi: `03_API_VA_LUU_TRU.md`.

```typescript
// GET /api/me
export interface MeResponse { profile: LearnerCognitiveProfile; server_now: number }

// DELETE /api/me  ⇒ 204, không body

// GET /api/sessions
export interface SessionsResponse { sessions: LearningSessionSummary[] }

// GET /api/sessions/{session_id}/history
export interface HistoryResponse { items: AttemptHistoryItem[] }

// GET /api/sessions/{session_id}/progress — chỉ đọc DB (graph_skeleton + node_progress + node_runs ⇒ deriveNodeStates), không chạy engine, không AI
export interface ProgressResponse { progress: SessionProgress }

// POST /api/ingest — JSON hoặc multipart/form-data (trường "archive" = file .zip, trường "subdir" tùy chọn)
export type IngestRequest =
  | { repo_url: string; subdir_override?: string }   // Chỉ link gốc repo (D-38); subdir_override: chọn lại thư mục khi repo là monorepo
  | { session_id: string; restart?: boolean };       // Mở lại phiên cũ; restart = "Học lại từ đầu" ⇒ phiên mới cùng snapshot (D-42)
export interface IngestResponse {
  session_id: string;
  result: ClientStaticEngineResult;
  progress: SessionProgress;
  analyses: Record<string, NodeAnalysisView>;        // Node đã có trong ai_cache (trúng cache ⇒ khỏi gọi analyze-node)
  resumed: boolean;
  from_cache: boolean;                               // true ⇒ ingest_ms / engine_ms là số đo của lần dựng gốc (UI ghi "kết quả đã lưu")
}

// POST /api/analyze-node
export interface AnalyzeNodeRequest { session_id: string; node_id: string }
export interface AnalyzeNodeResponse {
  node_id: string;
  analysis: NodeAnalysisView | null;     // null ⇒ phân tích lỗi (analysis_failed = true)
  node_state: NodeStateView;
  unlocked_node_ids: string[];           // Node con mở nhờ analysis_failed (D-03)
  tokens_used: number;
}

// POST /api/analyze-overview
export interface AnalyzeOverviewRequest { session_id: string }
export interface AnalyzeOverviewResponse { overview: RepoOverviewView; tokens_used: number }

// POST /api/explain-selection — server cắt lại vùng chọn từ snapshot phiên (03 Mục 6.9)
export interface ExplainSelectionRequest {
  session_id: string;
  node_id: string;
  step_number: number;
  range: { line_start: number; col_start: number; line_end: number; col_end: number };   // Số dòng gốc; cột tính từ 1 như Monaco; col_end loại trừ
  selected_text: string;
}
export interface ExplainSelectionResponse {
  explanation: ExplainSelectionRaw | null;   // null ⇒ cổng gác chặn
  references: Array<{ node_id: string; step_number: number; name: string }>;
  tokens_used: number;
}

// POST /api/enrich-node
export interface EnrichNodeRequest { session_id: string; node_id: string; mode: RunMode }
export interface QuestionView {
  question_index: number;
  skill: SWESkill;
  tier: LearnerTier;
  focus: QuestionFocus;
  feynman_question: string;
  state: QuestionState;                  // Không có đáp án khi câu chưa xong
}
export interface EnrichNodeResponse {
  node_id: string;
  run_id: string;                        // Kế hoạch luôn ≥ 1 câu (D-34)
  mode: RunMode;
  questions: QuestionView[];             // Run đang dở ⇒ trả lại đúng run đó
  node_state: NodeStateView;
  tokens_used: number;
}

// POST /api/evaluate-feynman — server đọc câu hỏi + đáp án từ DB theo (run_id, question_index) (D-36)
export interface EvaluateFeynmanRequest {
  session_id: string;
  run_id: string;
  question_index: number;
  student_answer: string;
  attempt_number: number;                // = attempts_used + 1 phía client; lệch ⇒ ERR_ATTEMPT_OUT_OF_SYNC
}
export interface FollowUp { type: FollowUpType; question: string; step_index: number | null }
export interface EvaluateFeynmanResponse {
  question_index: number;
  attempt_number: number;
  core_accuracy: number;
  simplicity: number;
  intent: AnswerIntent;
  is_passed: boolean;                    // Server tính lại (D-13)
  points_covered: boolean[];             // Theo thứ tự must_have_points (chỉ cờ, không lộ nội dung khi chưa xong)
  feedback: string;
  detected_jargons: string[];
  follow_up: FollowUp | null;            // null khi đạt, khi hết lượt, hoặc khi intent OFF_TOPIC do regex
  question: QuestionState;               // Có reveal khi câu xong
  skill_change: SkillChange | null;      // Có khi câu vừa xong và BKT được cập nhật
  node_state: NodeStateView;
  unlocked_node_ids: string[];
  tokens_used: number;
}

// POST /api/reveal — nút "Bỏ qua câu này"
export interface RevealRequest { session_id: string; run_id: string; question_index: number }
export interface RevealResponse {
  question: QuestionState;               // finished, outcome FAILED, ended_by SKIP, reveal có
  skill_change: SkillChange;             // BKT cập nhật FAILED
  node_state: NodeStateView;
  unlocked_node_ids: string[];
}

// POST /api/report-wrong — nút "Báo sai" (D-22)
export interface ReportWrongRequest { session_id: string; run_id: string; question_index: number; note: string }
export interface ReportWrongResponse { question: QuestionState; skill_change: SkillChange | null; node_state: NodeStateView }

// POST /api/demo/persona — chỉ khi DEMO_MODE=true
export interface PersonaRequest { mode: PersonaMode }
export type PersonaResponse = MeResponse;
```

---

## 9. Lỗi

```typescript
export type LearningErrorCode =
  | "ERR_NODE_NOT_AVAILABLE"        // Tạo run cho node không AVAILABLE
  | "ERR_ANALYSIS_NOT_READY"        // enrich khi node chưa có bản phân tích
  | "ERR_QUESTION_FINISHED"         // Nộp / bỏ qua câu đã xong
  | "ERR_ATTEMPT_OUT_OF_SYNC"       // attempt_number lệch số lượt thật (2 tab)
  | "ERR_ANSWER_TOO_SHORT" | "ERR_ANSWER_TOO_LONG" | "ERR_ANSWER_DUPLICATE" | "ERR_ANSWER_INAPPROPRIATE"   // Không tính lượt
  | "ERR_REPORT_NOT_ALLOWED"        // Báo sai câu không FAILED / đã báo
  | "ERR_SELECTION_INVALID"         // Vùng chọn không khớp code hoặc quá dài
  | "ERR_EXPLAIN_LIMIT";            // Phiên đã dùng hết EXPLAIN_MAX_PER_SESSION

export type AiErrorCode =
  | "ERR_AI_UNAVAILABLE"            // Timeout / 429 / 503 / JSON hỏng sau LLM_MAX_RETRIES — không tính lượt
  | "ERR_AI_REJECTED"               // Mọi câu hỏi hỏng sau thử lại
  | "ERR_TOKEN_QUOTA_EXCEEDED";     // Phiên đã dùng ≥ SESSION_TOKEN_QUOTA — khóa lời gọi AI mới

export type PersistenceErrorCode =
  | "ERR_UNAUTHENTICATED"
  | "ERR_SESSION_NOT_FOUND"         // Phiên / run không thuộc người gọi hoặc không còn
  | "ERR_SESSION_ENGINE_OUTDATED"   // Phiên tạo bằng engine_version khác ⇒ chỉ xem lịch sử
  | "ERR_PERSISTENCE_UNAVAILABLE"   // Postgres lỗi khi đọc hoặc ghi ⇒ nút "Thử lại" (D-40)
  | "ERR_DEMO_MODE_DISABLED";

export type ClientErrorCode = "ERR_CLIENT_NETWORK"; // Chỉ client tạo (fetch bị từ chối / body không phải JSON); server không bao giờ trả

export type ErrorCode = IngestionErrorCode | LearningErrorCode | AiErrorCode | PersistenceErrorCode | ClientErrorCode;

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;                 // Tiếng Việt, hiển thị được ngay (bảng thông điệp: 30_UI Mục lỗi)
    retryable: boolean;
    details?: Record<string, string | number | boolean>;
    // ERR_UNSUPPORTED_LANGUAGE ⇒ details.language; ERR_NO_SOURCE_FILES_FOUND ⇒ details.hint ∈
    // "submodule" | "only_unsupported" | "only_manifests" | "no_code" | "empty_subdir" (10 ING-80, ING-131)
  };
}
```

| HTTP | Mã lỗi |
| :-: | :-- |
| 400 | `ERR_INVALID_GITHUB_URL`, `ERR_UPLOAD_INVALID`, `ERR_ANSWER_TOO_SHORT`, `ERR_ANSWER_TOO_LONG`, `ERR_ANSWER_DUPLICATE`, `ERR_ANSWER_INAPPROPRIATE`, `ERR_SELECTION_INVALID` |
| 401 | `ERR_UNAUTHENTICATED` |
| 403 | `ERR_DEMO_MODE_DISABLED`, `ERR_REPORT_NOT_ALLOWED` |
| 404 | `ERR_PREFLIGHT_404_OR_PRIVATE`, `ERR_BRANCH_NOT_FOUND`, `ERR_SESSION_NOT_FOUND` |
| 409 | `ERR_ATTEMPT_OUT_OF_SYNC`, `ERR_NODE_NOT_AVAILABLE`, `ERR_QUESTION_FINISHED`, `ERR_ANALYSIS_NOT_READY` |
| 410 | `ERR_SESSION_ENGINE_OUTDATED` |
| 413 | `ERR_STREAM_QUOTA_EXCEEDED` |
| 422 | `ERR_EMPTY_REPOSITORY`, `ERR_UNSUPPORTED_LANGUAGE`, `ERR_NO_SOURCE_FILES_FOUND`, `ERR_NO_ARCHITECTURAL_SLICE`, `ERR_STREAM_CORRUPTED`, `ERR_AI_REJECTED` |
| 429 | `ERR_GITHUB_RATE_LIMIT_CDN`, `ERR_TOKEN_QUOTA_EXCEEDED`, `ERR_EXPLAIN_LIMIT` |
| 451 | `ERR_REPO_UNAVAILABLE_451` |
| 503 | `ERR_AI_UNAVAILABLE`, `ERR_PERSISTENCE_UNAVAILABLE`, `ERR_SERVER_BUSY` |
| 504 | `ERR_NETWORK_TIMEOUT`, `ERR_STREAM_TIMEOUT` |

`retryable = true` với: `ERR_NETWORK_TIMEOUT`, `ERR_STREAM_TIMEOUT`, `ERR_GITHUB_RATE_LIMIT_CDN`, `ERR_SERVER_BUSY`, `ERR_AI_UNAVAILABLE`, `ERR_PERSISTENCE_UNAVAILABLE`, `ERR_ATTEMPT_OUT_OF_SYNC`.

---

## 10. Trạng thái trình duyệt & gói Offline

```typescript
export interface ClientWorkbenchState {          // Zustand — bản sao CHỈ ĐỌC dữ liệu server trả về
  session_id: string | null;
  result: ClientStaticEngineResult | null;
  profile: LearnerCognitiveProfile | null;
  progress: SessionProgress | null;
  analyses: Record<string, NodeAnalysisView | "PENDING" | "FAILED">;
  overview: RepoOverviewView | "PENDING" | null;
  runs: Record<string, EnrichNodeResponse>;      // Theo node_id — run đang mở gần nhất
  active_node_id: string | null;
  active_tab: "XRAY" | "FEYNMAN" | "OVERVIEW";   // tab cột phải; "OVERVIEW" không dùng (Tổng quan là cửa sổ, D-78)
  active_question_index: number | null;
  active_step: number | null;                     // Bước đang tô ở Monaco
  last_failed_answers: Record<string, string>;    // `${run_id}:${question_index}` ⇒ câu vừa trượt (kiểm trùng ở client)
  is_offline_mode: boolean;
  server_clock_offset_ms: number;                 // server_now − Date.now() (tính decay trên client)
}

export interface OfflineMockBundle {               // public/demo/mock_bundle.json — GHI LẠI từ API thật, đã duyệt tay
  bundle_version: string;
  recorded_from: { repo: string; snapshot_id: string; engine_version: string; prompt_version: string; model: string; recorded_at: number };
  ingest: IngestResponse;
  analyses: Record<string, NodeAnalysisView>;
  overview: RepoOverviewView;
  enrich: Record<string, EnrichNodeResponse>;      // Khóa run R = `${node_id}:${mode}:${persona}`
  scripted_answers: Record<string, Array<{ answer: string; response: EvaluateFeynmanResponse }>>; // Khóa `${R}:${question_index}:${attempt_number}`
  reveals: Record<string, RevealResponse>;         // Khóa `${R}:${question_index}`
}
```

Chế độ Offline so câu trả lời với `scripted_answers` (độ giống ≥ `CONFIG.ANSWER_DUPLICATE_SIMILARITY`); không khớp ⇒ thông báo "Chế độ offline chỉ chấm được câu trả lời trong kịch bản". `profile` và `progress` tính lại trên trình duyệt bằng `bkt-engine` (`22`), không ghi Postgres.

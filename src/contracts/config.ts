export const CONFIG = {
  // ---------- Phiên bản (đổi ⇒ khóa cache mới) ----------
  ENGINE_VERSION: "1.8.1",      // Đổi khi đổi bất kỳ luật Tầng 0–2 làm đổi đồ thị / node_id (D-10, D-53 … D-58, D-61, D-63, D-65)
  PROMPT_VERSION: "1.7.0",            // Đổi khi đổi prompt hoặc responseSchema của 5 lời gọi AI (D-74)

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
  LLM_MODEL: "gemini-3.8-flash", // model chính, thay D-50; số đo 07/11
  LLM_MODEL_FALLBACK: "gemini-3.5-flash-lite", // dùng khi model chính quá LLM_PRIMARY_TIMEOUT_MS hoặc lỗi
  LLM_PRIMARY_TIMEOUT_MS: 12000, // đo 07/11: 8/9 lần 3.8-flash ≤ 11,4 s; xấu nhất ~12 s + ~3 s flash-lite
  LLM_TEMPERATURE: 0,
  LLM_THINKING_BUDGET: 0,
  LLM_TIMEOUT_MS: 30000,              // Đo lại ở H+1 (không còn dùng cho flash-lite, xem LLM_LITE_TIMEOUT_MS)
  LLM_LITE_TIMEOUT_MS: 10000,         // NH-15: mọi lời gọi flash-lite (model chính của GRADE/EXPLAIN và fallback); đo 07/11 trung bình 2,8 s
  // NH-14: model chính theo loại lời gọi. Chấm và giải thích cần nhanh ⇒ flash-lite; phân tích, tổng quan, câu hỏi được tính trước ⇒ 3.8-flash
  LLM_MODEL_BY_KIND: {
    ANALYZE: "gemini-3.8-flash",
    OVERVIEW: "gemini-3.8-flash",
    QUESTIONS: "gemini-3.8-flash",
    GRADE: "gemini-3.5-flash-lite",
    EXPLAIN: "gemini-3.5-flash-lite",
  },
  LLM_MAX_RETRIES: 1,                 // Lỗi mạng / 429 / 503 / JSON hỏng / bị cổng gác chặn ⇒ gọi lại 1 lần; bị chặn thì kèm lý do (AI-37)
  LLM_RETRY_DELAY_MS: 500,            // Chờ trước khi gọi lại sau 429 / 503
  LLM_RETRY_DELAY_MAX_MS: 20000,      // Trần retryDelay từ server, vượt ⇒ không gọi lại (D-74 R1)
  LLM_RETRY_JITTER_MS: 100,           // Cộng ngẫu nhiên [0, JITTER)
  GUARD_FEEDBACK_MAX_CHARS: 400,     // Trần khối <guard_feedback> khi gọi lại (AI-37)
  GRADING_QUOTE_MIN_CHARS: 3,         // Đoạn trích (đã chuẩn hóa) ngắn hơn ⇒ ý đó không tính (D-13)
  LLM_MAX_OUTPUT_TOKENS: { ANALYZE: 2200, OVERVIEW: 1500, QUESTIONS: 900, GRADE: 500, EXPLAIN: 400 },   // Đo thật: OVERVIEW 13 bài vượt 600 (C-12); ANALYZE bài 5 bước vượt 900 (C-02)
  LLM_PRICES_USD_PER_M: {
    "gemini-3.8-flash": { INPUT: 0.75, OUTPUT: 3.75 },
    "gemini-3.5-flash-lite": { INPUT: 0.30, OUTPUT: 2.50 },
  }, // 3.8-flash giá ưu đãi tới 31/12/2026, nguồn tổng hợp, chưa đối chiếu trang Google
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
  ANSWER_MIN_CHARS: 5,  // Q-05 (spec ghi 15) // Sau khi bỏ khoảng trắng
  ANSWER_MAX_CHARS: 2000,
  ANSWER_DUPLICATE_SIMILARITY: 0.95,  // Q-06 (spec ghi 0.8) // 1 - Levenshtein / max(len): ≥ ngưỡng so với lần nộp trước của CÙNG câu ⇒ chặn
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
  UI_PANE_WIDTHS_PCT: [24, 45, 31],   // Bản đồ / Code / X-Ray từ 1024 px, theo prototype.html (applyChrome)
  UI_PRESENTATION_FOCUS_PCT: 60,      // Cột code ở chế độ trình chiếu; 2 cột còn lại chia đều phần còn lại
  UI_PRESENTATION_FONT_SCALE: 1.25,

  // ---------- Đơn vị ----------
  MS_PER_DAY: 86_400_000,
} as const;

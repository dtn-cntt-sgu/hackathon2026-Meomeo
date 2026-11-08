import type { ArchitecturalLayer, DegradedMode, GraphConfidence, LanguageId, LanguageSupportTier, NodeType, ProjectArchetype } from "./base";

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

// Bước chỉ chạy khi một điều kiện đúng (nhánh phụ). Điều kiện lấy nguyên từ code, không dùng AI.
export interface StepBranch {
  kind: "IF" | "ELSE" | "SWITCH" | "TERNARY" | "CATCH" | "LOOP";
  condition: string;            // Đoạn code điều kiện, 1 dòng, ≤ 80 ký tự
}

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
  branch?: StepBranch | null;   // Thiếu hoặc null ⇒ luồng chính
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
  uncle_bob: UncleBobMetrics | null;
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

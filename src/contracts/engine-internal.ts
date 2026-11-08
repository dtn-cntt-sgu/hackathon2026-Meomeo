import type { LanguageId } from "./base";
import type { IngestionReport, ProjectFingerprint, RepoSnapshotKey } from "./engine";

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

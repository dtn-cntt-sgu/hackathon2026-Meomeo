import type { Tree } from "web-tree-sitter";
import type {
  FunctionCallEdge,
  HybridArchitecturalNode,
  IngestOutput,
  LanguageId,
  LanguageSupportTier,
  StepBranch,
  SymbolDefinition,
} from "@/contracts";

export interface ExternalCall {
  is_data_sink?: boolean;
  caller: string;
  line: number;
  receiver_chain: string[];
  method: string;
  import_source: string | null;
}

export interface RouteBinding {
  file_path: string;
  line_start: number;
  line_end: number;
  kind: "HTTP" | "PAGE" | "SCREEN" | "COMMAND";
  method: string | null;
  path: string | null;
  handler: string;
  middlewares: string[];
  display_name: string;
}

export interface EntryPoint {
  key: string;
  binding: RouteBinding | null;
  source: "REGISTERED" | "GENERIC" | "PROGRAM";
}

export interface Candidate
  extends Pick<
    HybridArchitecturalNode,
    | "id"
    | "node_type"
    | "entry_symbol"
    | "trace_steps"
    | "dto_snippet"
    | "cognitive_complexity"
    | "rank_score"
    | "title_source"
    | "title_evidence"
  > {
  kind: "SLICE" | "ALGO" | "VNODE";
  order_key: string;
  functions: string[];
  binding: RouteBinding | null;
  base_title: string;
}

export interface CallSite {
  callee: string;
  line: number;
  column: number;
  end_index: number; // Vị trí kết thúc: lời gọi nằm trong đối số kết thúc trước hàm bọc nó
  confidence: "RESOLVED" | "INFERRED";
  ambiguous: boolean;
  guard?: StepBranch | null; // Điều kiện gần nhất bao lời gọi trong hàm gọi, null ⇒ luôn chạy
  guard_line?: number | null; // Dòng của câu điều kiện đó (if/else/case/catch/vòng lặp), để snippet bước cha giữ dòng này
}

export interface FunctionInfo extends SymbolDefinition {
  params: string[];
  locals: string[];
  complexity: number;
}

export interface ParsedFile {
  path: string;
  language: LanguageId;
  tier: LanguageSupportTier;
  tree: Tree;
  source: string;
}

export interface ImportedSymbol {
  local_name: string;
  imported_name: string;
  source: string;
  resolved_file: string | null;
  is_default: boolean;
  is_namespace: boolean;
  line: number;
}

export interface ReExport {
  exported_name: string;
  imported_name: string;
  source: string;
  resolved_file: string | null;
  line: number;
}

export type SymbolTable = Map<string, SymbolDefinition>;

export type ImportMap = Map<string, Map<string, ImportedSymbol>>;

export type FieldTypeMap = Map<string, string>;

export type InterfaceImplMap = Map<string, string[]>;

export type LocalSymbolIndex = Map<string, Set<string>>;

export interface SymbolIndex {
  symbols: SymbolTable;
  imports: ImportMap;
  re_exports: Map<string, ReExport[]>;
  field_types: FieldTypeMap;
  interface_impls: InterfaceImplMap;
  class_parents: Map<string, string>;
  locals: LocalSymbolIndex;
  functions: Map<string, FunctionInfo>;
  type_fields: Set<string>;
}

export interface EngineContext {
  input: IngestOutput;
  files: ParsedFile[];
  index: SymbolIndex;
  call_edges: FunctionCallEdge[];
  call_sites: Map<string, CallSite[]>;
  external_calls: Map<string, ExternalCall[]>;
  bindings: RouteBinding[];
  file_rank: Map<string, number>;
}

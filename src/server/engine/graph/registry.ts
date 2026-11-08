import type { LanguageAdapter, LanguageId, LanguageSupportTier } from "@/contracts";

export const LANGUAGE_REGISTRY: LanguageAdapter[] = [
  {
    id: "TYPESCRIPT",
    extensions: [".ts", ".mts", ".cts"],
    wasm_grammar: "tree-sitter-typescript.wasm",
    query_file: "queries/typescript.scm",
    manifest_files: ["package.json", "tsconfig.json"],
    import_resolver: "TS_JS",
    comment_prefix: "//",
  },
  {
    id: "TSX",
    extensions: [".tsx"],
    wasm_grammar: "tree-sitter-tsx.wasm",
    query_file: "queries/tsx.scm",
    manifest_files: ["package.json", "tsconfig.json"],
    import_resolver: "TS_JS",
    comment_prefix: "//",
  },
  {
    id: "JAVASCRIPT",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    wasm_grammar: "tree-sitter-javascript.wasm",
    query_file: "queries/javascript.scm",
    manifest_files: ["package.json", "jsconfig.json"],
    import_resolver: "TS_JS",
    comment_prefix: "//",
  },
  {
    id: "JAVA",
    extensions: [".java"],
    wasm_grammar: "tree-sitter-java.wasm",
    query_file: "queries/java.scm",
    manifest_files: ["pom.xml", "build.gradle", "build.gradle.kts"],
    import_resolver: "JAVA",
    comment_prefix: "//",
  },
];

export const KNOWN_NO_GRAMMAR: Record<string, LanguageId> = {
  ".py": "PYTHON",
  ".go": "GO",
  ".dart": "DART",
  ".cs": "CSHARP",
  ".php": "PHP",
  ".kt": "KOTLIN",
  ".kts": "KOTLIN",
  ".c": "C",
  ".h": "C",
  ".cpp": "CPP",
  ".cc": "CPP",
  ".cxx": "CPP",
  ".hpp": "CPP",
  ".hh": "CPP",
  ".rs": "RUST",
  ".rb": "RUBY",
  ".swift": "SWIFT",
  ".scala": "SCALA",
  ".sol": "SOLIDITY",
  ".vhd": "VHDL",
  ".vhdl": "VHDL",
  ".pas": "PASCAL",
  ".f90": "FORTRAN",
  ".f95": "FORTRAN",
  ".cob": "COBOL",
  ".cbl": "COBOL",
  ".asm": "ASSEMBLY",
  ".abap": "ABAP",
};

export function tierOf(adapter: LanguageAdapter): LanguageSupportTier {
  return adapter.import_resolver ? "RESOLVED" : "STRUCTURAL";
}

export function getAdapter(id: LanguageId): LanguageAdapter | undefined {
  return LANGUAGE_REGISTRY.find((adapter) => adapter.id === id);
}

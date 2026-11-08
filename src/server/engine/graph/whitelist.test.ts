import { beforeAll, describe, expect, it } from "vitest";
import type {
  GraphEdge,
  HybridArchitecturalNode,
  IngestionReport,
  LanguageId,
  StaticEngineResult,
} from "@/contracts";
import { initParsers, parseAll } from "./parser";
import { collectSymbols, resolveImports } from "./symbols";
import { buildSymbolWhitelist, mainPath } from "./whitelist";

function createMockReport(): IngestionReport {
  return {
    truncated: false,
    selective_fetch: false,
    code_file_count: 0,
    manifest_count: 0,
    omitted_node_count: 0,
    skipped: {
      garbage: 0,
      binary: 0,
      oversized: 0,
      unsupported_lang: 0,
      quota: 0,
      parse_error: 0,
    },
    warnings: [],
    degraded_mode: null,
    redacted_secret_count: 0,
    engine_ms: 0,
    ingest_ms: 0,
    suspicious_instruction_files: [],
  };
}

async function parseVirtualFiles(
  files: Record<string, string>,
  lang: LanguageId = "TYPESCRIPT"
) {
  const code = new Map<string, string>();
  const langs = new Map<string, LanguageId>();
  for (const [p, content] of Object.entries(files)) {
    code.set(p, content);
    langs.set(p, lang);
  }
  const report = createMockReport();
  return await parseAll(code, langs, report);
}

describe("whitelist and mainPath", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("interface và type có field ⇒ tên field nằm trong whitelist", async () => {
    const files = await parseVirtualFiles({
      "src/types.ts": `
        export interface UserProfile {
          username: string;
          emailAddress: string;
        }
        export type OrderInfo = {
          orderId: number;
          totalAmount: number;
        };
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const whitelist = buildSymbolWhitelist(idx, []);
    expect(whitelist).toContain("username");
    expect(whitelist).toContain("emailAddress");
    expect(whitelist).toContain("orderId");
    expect(whitelist).toContain("totalAmount");
  });

  it("T-ENG-35 (n-a→n-b→n-d, n-a→n-c→n-d ⇒ ['n-a','n-b','n-d'])", () => {
    const nodes = [
      { id: "n-a", prerequisites: [] },
      { id: "n-b", prerequisites: ["n-a"] },
      { id: "n-c", prerequisites: ["n-a"] },
      { id: "n-d", prerequisites: ["n-b", "n-c"] },
    ] as unknown as HybridArchitecturalNode[];

    const edges: GraphEdge[] = [
      { id: "n-a->n-b", source: "n-a", target: "n-b", confidence: "RESOLVED", via_entities: [] },
      { id: "n-b->n-d", source: "n-b", target: "n-d", confidence: "RESOLVED", via_entities: [] },
      { id: "n-a->n-c", source: "n-a", target: "n-c", confidence: "RESOLVED", via_entities: [] },
      { id: "n-c->n-d", source: "n-c", target: "n-d", confidence: "RESOLVED", via_entities: [] },
    ];

    const graph = {
      nodes,
      edges,
    } as unknown as StaticEngineResult;

    const pathResult = mainPath(graph);
    expect(pathResult).toEqual(["n-a", "n-b", "n-d"]);
  });

  it("đồ thị rỗng ⇒ []", () => {
    const graph = {
      nodes: [],
      edges: [],
    } as unknown as StaticEngineResult;

    expect(mainPath(graph)).toEqual([]);
  });

  it("whitelist bỏ tên chứa <, không trùng, đã sort", async () => {
    const files = await parseVirtualFiles({
      "src/service.ts": `
        export class MyService {
          public runTask(paramA: string) {
            const localB = 123;
            return localB;
          }
        }
      `,
    });
    const idx = collectSymbols(files);

    // Thêm symbol synthetic có <...> và hậu tố ~2
    idx.symbols.set("src/service.ts#<module>", {
      key: "src/service.ts#<module>",
      kind: "FUNCTION",
      name: "<module>",
      file_path: "src/service.ts",
      line_start: 1,
      line_end: 10,
      is_exported: false,
    });
    idx.symbols.set("src/service.ts#MyService.runTask~2", {
      key: "src/service.ts#MyService.runTask~2",
      kind: "METHOD",
      name: "runTask",
      file_path: "src/service.ts",
      line_start: 2,
      line_end: 7,
      is_exported: true,
    });

    const whitelist = buildSymbolWhitelist(idx, ["src/service.ts#MyService.runTask"]);
    expect(whitelist.some((w) => w.includes("<"))).toBe(false);
    expect(whitelist).toContain("paramA");
    expect(whitelist).toContain("localB");
    expect(whitelist).toContain("MyService");
    expect(whitelist).toContain("runTask");
    expect(whitelist).toContain("MyService.runTask");
    expect(whitelist.some((w) => w.includes("~"))).toBe(false);

    const sorted = [...whitelist].sort();
    expect(whitelist).toEqual(sorted);

    const set = new Set(whitelist);
    expect(whitelist.length).toBe(set.size);
  });
});

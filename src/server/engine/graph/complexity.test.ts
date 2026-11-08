import { beforeAll, describe, expect, it } from "vitest";
import type { IngestionReport, LanguageId } from "@/contracts";
import { fillComplexity } from "./complexity";
import { initParsers, parseAll } from "./parser";
import { collectSymbols } from "./symbols";

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

describe("complexity (ENG-71)", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("T-ENG-01: findPath: if (!graph || !start) lồng 0, for 0, if 1, for 2, if 3 => 12", async () => {
    const files = await parseVirtualFiles({
      "src/path.ts": `
        export function findPath(graph: any, start: any, target: any) {
          if (!graph || !start) {
            return null;
          }
          for (const node of graph) {
            if (node === target) {
              for (const neighbor of node.neighbors) {
                if (neighbor.visited) {
                  return neighbor;
                }
              }
            }
          }
          return null;
        }
      `,
    });

    const idx = collectSymbols(files);
    fillComplexity(files, idx.functions);

    const fn = idx.functions.get("src/path.ts#findPath");
    expect(fn).toBeDefined();
    expect(fn?.complexity).toBe(12);
  });

  it("T-ENG-02: for of items { if ... else if ... else } va a && b || c => 5 + 2", async () => {
    const files = await parseVirtualFiles({
      "src/sample.ts": `
        export function checkItems(items: any[], a: boolean, b: boolean, c: boolean) {
          for (const x of items) {
            if (x > 10) {
              console.log(1);
            } else if (x > 5) {
              console.log(2);
            } else {
              console.log(3);
            }
          }
          if (a && b || c) {
            return true;
          }
          return false;
        }
      `,
    });

    const idx = collectSymbols(files);
    fillComplexity(files, idx.functions);

    const fn = idx.functions.get("src/sample.ts#checkItems");
    expect(fn).toBeDefined();
    // for (1) + if (2) + else if (1) + else (1) + if (1) + && (1) + || (1) = 8
    // In T-ENG-02 table:
    // for + if + else if + else = 5
    // a && b || c = +2 (1 for &&, 1 for ||)
    // plus the outer if (+1) = 8
    expect(fn?.complexity).toBe(8);

    // Also verify standalone computeComplexity on a function with just the loop:
    const loopOnlyFiles = await parseVirtualFiles({
      "src/loop.ts": `
        export function loopOnly(items: any[]) {
          for (const x of items) {
            if (x > 10) {
              console.log(1);
            } else if (x > 5) {
              console.log(2);
            } else {
              console.log(3);
            }
          }
        }
      `,
    });
    const loopIdx = collectSymbols(loopOnlyFiles);
    fillComplexity(loopOnlyFiles, loopIdx.functions);
    const loopFn = loopIdx.functions.get("src/loop.ts#loopOnly");
    expect(loopFn?.complexity).toBe(5);
  });
});

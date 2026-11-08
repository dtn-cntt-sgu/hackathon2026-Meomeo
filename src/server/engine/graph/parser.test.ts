import { beforeAll, describe, expect, it } from "vitest";
import type { IngestionReport, LanguageId } from "@/contracts";
import {
  createParser,
  getLanguage,
  getQuery,
  initParsers,
  parseAll,
} from "./parser";

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

describe("parser", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("nạp đủ 4 ngôn ngữ", () => {
    const languages: LanguageId[] = ["TYPESCRIPT", "TSX", "JAVASCRIPT", "JAVA"];
    for (const lang of languages) {
      expect(() => getLanguage(lang)).not.toThrow();
      expect(() => getQuery(lang)).not.toThrow();
      expect(getLanguage(lang)).toBeDefined();
      expect(getQuery(lang)).toBeDefined();
    }
  });

  it("gọi initParsers() lần 2 không lỗi", async () => {
    await expect(initParsers()).resolves.toBeUndefined();
  });

  it("parse 1 hàm TS và query ra capture def.function, name, call", () => {
    const parser = createParser("TYPESCRIPT");
    const query = getQuery("TYPESCRIPT");
    const source = `
      function add(a: number, b: number): number {
        console.log(a, b);
        return a + b;
      }
    `;
    const tree = parser.parse(source);
    expect(tree).not.toBeNull();
    const captures = query.captures(tree!.rootNode);
    const captureNames = captures.map((c) => c.name);
    expect(captureNames).toContain("def.function");
    expect(captureNames).toContain("name");
    expect(captureNames).toContain("call");
    tree!.delete();
    parser.delete();
  });

  it("parse 1 method Java và query ra def.method, call", () => {
    const parser = createParser("JAVA");
    const query = getQuery("JAVA");
    const source = `
      class Test {
        public void hello() {
          System.out.println("hi");
        }
      }
    `;
    const tree = parser.parse(source);
    expect(tree).not.toBeNull();
    const captures = query.captures(tree!.rootNode);
    const captureNames = captures.map((c) => c.name);
    expect(captureNames).toContain("def.method");
    expect(captureNames).toContain("call");
    tree!.delete();
    parser.delete();
  });

  it("file rác toàn ký tự vô nghĩa bị bỏ, report.skipped.parse_error === 1, có 1 warning, file tốt đi cùng vẫn trả về", async () => {
    const report = createMockReport();
    const code = new Map<string, string>();
    const langs = new Map<string, LanguageId>();

    code.set("valid.ts", "function ok(): void {}");
    langs.set("valid.ts", "TYPESCRIPT");

    code.set("garbage.ts", "}{][)(!@# $%^ &*(!@ #$% ^&* (!@ #$% ^&* @@## $$%%");
    langs.set("garbage.ts", "TYPESCRIPT");

    const parsed = await parseAll(code, langs, report);

    expect(report.skipped.parse_error).toBe(1);
    expect(report.warnings.length).toBe(1);
    expect(report.warnings[0]).toBe("File garbage.ts có cú pháp không phân tích được");
    expect(parsed.length).toBe(1);
    expect(parsed[0].path).toBe("valid.ts");
  });

  it("kết quả parseAll sort theo path", async () => {
    const report = createMockReport();
    const code = new Map<string, string>();
    const langs = new Map<string, LanguageId>();

    code.set("z.ts", "const z = 1;");
    langs.set("z.ts", "TYPESCRIPT");

    code.set("a.ts", "const a = 1;");
    langs.set("a.ts", "TYPESCRIPT");

    code.set("m.ts", "const m = 1;");
    langs.set("m.ts", "TYPESCRIPT");

    const parsed = await parseAll(code, langs, report);
    const paths = parsed.map((f) => f.path);
    expect(paths).toEqual(["a.ts", "m.ts", "z.ts"]);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { CONFIG } from "@/contracts";
import type { IngestionReport, LanguageId } from "@/contracts";
import { buildCallGraph, findEntries } from "./callgraph";
import { fillComplexity } from "./complexity";
import { initParsers, parseAll } from "./parser";
import { buildSlice, findSharedHelpers, isDataAccessFile, isDataSinkCall } from "./slicing";
import { collectSymbols, resolveImports } from "./symbols";
import type { EngineContext, EntryPoint, ExternalCall } from "./types";

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

async function createTestContext(
  filesObj: Record<string, string>,
  techStack: string[] = ["express", "typeorm"]
): Promise<{ ctx: EngineContext; entries: EntryPoint[] }> {
  const code = new Map<string, string>();
  const langs = new Map<string, LanguageId>();
  for (const [p, content] of Object.entries(filesObj)) {
    code.set(p, content);
    langs.set(p, "TYPESCRIPT");
  }

  const report = createMockReport();
  const parsedFiles = await parseAll(code, langs, report);
  const idx = collectSymbols(parsedFiles);
  resolveImports(parsedFiles, idx, new Map(), {
    go_module_path: null,
    dart_package_name: null,
    package_entry_files: [],
  });

  const callGraph = buildCallGraph(parsedFiles, idx);
  fillComplexity(parsedFiles, idx.functions);

  const ctx: EngineContext = {
    input: {
      repo_name: "test-repo",
      snapshot: { source: "ZIP", repo_key: "test", snapshot_id: "0", snapshot_id_kind: "ARCHIVE_HASH", subdir: "", ref_label: null, },
      fingerprint: {
        archetype: "WEB_BACKEND",
        primary_language: "TYPESCRIPT",
        language_breakdown: [],
        graph_confidence: "HIGH",
        detected_framework: "Express",
        tech_stack: techStack,
        is_monorepo: false,
        root_dir_offset: "",
      },
      report,
      code,
      file_language: langs,
      manifests: new Map(),
      source_map: new Map(),
      module_info: {
        go_module_path: null,
        dart_package_name: null,
        package_entry_files: [],
      },
      readme_excerpt: null,
      manifest_description: null,
    },
    files: parsedFiles,
    index: idx,
    call_edges: callGraph.edges,
    call_sites: callGraph.call_sites,
    external_calls: callGraph.external_calls,
    bindings: callGraph.bindings,
    file_rank: new Map(),
  };

  const entries = findEntries(parsedFiles, idx, callGraph, "");
  return { ctx, entries };
}

describe("slicing (Spec 11 §8, ENG-80 -> ENG-89)", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("isDataSinkCall va isDataAccessFile", () => {
    const extCall: ExternalCall = {
      caller: "src/services/order.ts#OrderService.checkout",
      line: 10,
      receiver_chain: ["this", "orderRepo"],
      method: "save",
      import_source: null,
    };
    expect(isDataSinkCall(extCall, ["typeorm"])).toBe(true);

    const nonSinkCall: ExternalCall = {
      caller: "src/services/order.ts#OrderService.checkout",
      line: 12,
      receiver_chain: ["console"],
      method: "log",
      import_source: null,
    };
    expect(isDataSinkCall(nonSinkCall, ["typeorm"])).toBe(false);

    expect(isDataAccessFile("src/repositories/user.repo.ts")).toBe(true);
    expect(isDataAccessFile("src/services/user.service.ts")).toBe(false);
  });

  it("T-ENG-08: router.post(/checkout) authMiddleware orderService.checkout productRepo.findOne", async () => {
    const files = {
      "src/routes/order.routes.ts": `
        import express from "express";
        import { authMiddleware } from "../middlewares/auth.middleware";
        import { OrderService } from "../services/order.service";

        const router = express.Router();
        const orderService = new OrderService();

        router.post("/checkout", authMiddleware, async (req, res) => {
          const result = await orderService.checkout(req.body);
          res.json(result);
        });
      `,
      "src/middlewares/auth.middleware.ts": `
        const JWT_SECRET = "secret";

        export function authMiddleware(req: any, res: any, next: any) {
          const token = req.headers.authorization;
          if (token === JWT_SECRET) {
            next();
          }
        }
      `,
      "src/services/order.service.ts": `
        export class OrderService {
          async checkout(data: any) {
            const product = await productRepo.findOne({ id: data.productId });
            return product;
          }
        }
      `,
    };

    const { ctx, entries } = await createTestContext(files, ["express", "typeorm"]);
    expect(entries.length).toBeGreaterThan(0);

    const postEntry = entries.find((e) => e.binding?.path === "/checkout");
    expect(postEntry).toBeDefined();

    const candidate = buildSlice(postEntry!, ctx);
    expect(candidate.trace_steps.length).toBe(3);

    // Bước 1: ENTRY_POINT
    expect(candidate.trace_steps[0].layer).toBe("ENTRY_POINT");
    expect(candidate.trace_steps[0].function_name).toBe("router.post('/checkout')");
    expect(candidate.entry_symbol).toContain("#<POST /checkout>");

    // Bước 2: MIDDLEWARE kèm biến JWT_SECRET
    expect(candidate.trace_steps[1].layer).toBe("MIDDLEWARE");
    expect(candidate.trace_steps[1].function_name).toBe("authMiddleware");
    expect(candidate.trace_steps[1].snippet).toContain("JWT_SECRET");

    // Bước 3: OrderService.checkout có DATA_ACCESS
    expect(candidate.trace_steps[2].layer).toBe("DATA_ACCESS");
    expect(candidate.trace_steps[2].function_name).toContain("checkout");
  });

  it("T-ENG-09: const t0 = Date.now(), logger.info(x) thanh marker va khong co buoc logger", async () => {
    const files = {
      "src/routes/log.routes.ts": `
        import express from "express";
        import { doWork } from "../services/work.service";

        const router = express.Router();
        router.get("/work", (req, res) => {
          doWork();
          res.send("ok");
        });
      `,
      "src/services/work.service.ts": `
        import { logInfo } from "../utils/logger";

        export function doWork() {
          const t0 = Date.now();
          logInfo("started");
          return 42;
        }
      `,
      "src/utils/logger.ts": `
        export function logInfo(msg: string) {
          console.log(msg);
        }
      `,
    };

    const { ctx, entries } = await createTestContext(files, ["express"]);
    const workEntry = entries.find((e) => e.binding?.path === "/work");
    expect(workEntry).toBeDefined();

    const candidate = buildSlice(workEntry!, ctx);
    const stepNames = candidate.trace_steps.map((s) => s.function_name);
    // logInfo is pruned because return value unused, no DATA_SINK, no throw
    expect(stepNames).not.toContain("logInfo");
  });

  it("T-ENG-10: hàm 80 dòng, criterion dòng 50, chữ ký 1 dòng ⇒ 30 dòng, 2 marker", async () => {
    const bodyLines = ["export function longFunction() {", "  let x = 0;"];
    for (let i = 3; i <= 79; i++) {
      bodyLines.push(i === 50 ? "  const product = productRepo.save({ x });" : `  x = x + ${i};`);
    }
    bodyLines.push("  return x + product;", "}");

    const { ctx, entries } = await createTestContext(
      {
        "src/routes/long.routes.ts":
          'import express from "express";\n' +
          'import { longFunction } from "../services/long.service";\n' +
          "const router = express.Router();\n" +
          'router.post("/long", (req, res) => {\n' +
          "  res.json(longFunction());\n" +
          "});\n",
        "src/services/long.service.ts": bodyLines.join("\n"),
      },
      ["express"]
    );

    const candidate = buildSlice(entries[0], ctx);
    const step = candidate.trace_steps.find((s) => s.function_name === "longFunction");
    const lines = step?.snippet.split("\n") ?? [];
    expect(lines).toHaveLength(30);
    expect(lines[0]).toBe("export function longFunction() {");
    expect(lines[29]).toBe("}");
    expect(lines.filter((l) => l.includes("… ("))).toHaveLength(2);
    expect(step?.snippet).toContain("productRepo.save");
    expect(step?.snippet_line_map.filter((n) => n === 0)).toHaveLength(2);
  });

  describe("ENG-87 giữ dòng dẫn sang bước sau", () => {
    const route = (name: string) =>
      'import express from "express";\n' +
      `import { ${name} } from "../services/long.service";\n` +
      "const router = express.Router();\n" +
      'router.post("/long", (req, res) => {\n' +
      `  res.json(${name}());\n` +
      "});\n";

    const filler = (from: number, to: number) => {
      const lines: string[] = [];
      for (let i = from; i <= to; i++) {
        lines.push(`  x = x + ${i};`);
      }
      return lines;
    };

    async function stepOf(service: string[], name: string) {
      const { ctx, entries } = await createTestContext(
        { "src/routes/long.routes.ts": route(name), "src/services/long.service.ts": service.join("\n") },
        ["express"]
      );
      const candidate = buildSlice(entries[0], ctx);
      return { candidate, step: candidate.trace_steps.find((s) => s.function_name === name) };
    }

    it("lệnh dữ liệu đầu hàm không đẩy mất lời gọi bước sau và return cuối", async () => {
      const { candidate, step } = await stepOf(
        [
          "function audit(value) {",
          "  return auditRepo.save({ value });",
          "}",
          "export function longFunction() {",
          "  let x = 0;",
          "  const found = productRepo.findOne({ id: 1 });",
          ...filler(1, 60),
          "  const saved = audit(found);",
          ...filler(61, 80),
          "  return x + saved;",
          "}",
        ],
        "longFunction"
      );

      expect(candidate.trace_steps.map((s) => s.function_name)).toContain("audit");
      expect(step?.snippet).toContain("productRepo.findOne");
      expect(step?.snippet).toContain("audit(found)");
      expect(step?.snippet).toContain("return x + saved;");
      expect(step?.snippet.split("\n").length).toBeLessThanOrEqual(CONFIG.STEP_MAX_LINES);
    });

    it("lệnh nhiều dòng giữ cả dòng đóng ngoặc", async () => {
      const { step } = await stepOf(
        [
          "export function longFunction() {",
          "  let x = 0;",
          "  const first = productRepo.findOne({ id: 1 });",
          ...filler(1, 50),
          "  const saved = productRepo.save({",
          "    a: x,",
          ...Array.from({ length: 30 }, (_, i) => `    b${i}: x + ${i},`),
          "  });",
          "  return first + saved;",
          "}",
        ],
        "longFunction"
      );

      const lines = step?.snippet.split("\n") ?? [];
      const open = lines.indexOf("  const saved = productRepo.save({");
      expect(open).toBeGreaterThan(0);
      expect(lines.slice(open)).toContain("  });");
    });

    it("quá nhiều dòng ưu tiên vẫn không vượt trần, số dòng gốc tăng dần", async () => {
      const calls = Array.from({ length: 45 }, (_, i) => [
        `  const r${i} = productRepo.save({ i: ${i} });`,
        `  x = x + r${i};`,
      ]).flat();
      const { step } = await stepOf(
        ["export function longFunction() {", "  let x = 0;", ...calls, "  return x;", "}"],
        "longFunction"
      );

      const rows = step?.snippet_line_map.filter((row) => row > 0) ?? [];
      expect(step?.snippet.split("\n").length).toBeLessThanOrEqual(CONFIG.STEP_MAX_LINES);
      expect(rows).toEqual([...rows].sort((a, b) => a - b));
      expect(new Set(rows).size).toBe(rows.length);
    });

    it("marker cộng cả marker cũ nằm trong đoạn lược, không có 2 marker liền nhau", async () => {
      const { step } = await stepOf(
        [
          "export function longFunction() {",
          "  let x = 0;",
          "  const found = productRepo.findOne({ id: 1 });",
          ...Array.from({ length: 45 }, (_, i) => [`  x = x + ${i};`, `  console.log(${i});`]).flat(),
          "  return x + found;",
          "}",
        ],
        "longFunction"
      );

      const map = step?.snippet_line_map ?? [];
      const markers = step?.snippet.split("\n").filter((_, i) => map[i] === 0) ?? [];
      const hidden = markers.reduce((sum, l) => sum + Number(/\((\d+) dòng\)/.exec(l)?.[1] ?? 0), 0);
      const shown = map.filter((row) => row > 0).length;

      expect(shown + hidden).toBe(95);
      expect(map.some((row, i) => row === 0 && map[i + 1] === 0)).toBe(false);
    });
  });

  it("T-ENG-11: 5 buoc, nhieu dong => cat bo la khong bao ve", async () => {
    // A chain of 5 functions
    const files = {
      "src/routes/chain.routes.ts": `
        import express from "express";
        import { f2 } from "../services/chain";

        const router = express.Router();
        router.get("/chain", (req, res) => {
          f2();
          res.send("ok");
        });
      `,
      "src/services/chain.ts": `
        import { f3 } from "./f3";
        export function f2() {
          return f3();
        }
      `,
      "src/services/f3.ts": `
        import { f4 } from "./f4";
        export function f3() {
          const saved = productRepo.save({ id: 1 });
          f4();
          return saved;
        }
      `,
      "src/services/f4.ts": `
        import { f5 } from "./f5";
        export function f4() {
          return f5();
        }
      `,
      "src/services/f5.ts": `
        export function f5() {
          const a = 1;
          return a;
        }
      `,
    };

    const { ctx, entries } = await createTestContext(files, ["express", "typeorm"]);
    const chainEntry = entries.find((e) => e.binding?.path === "/chain");
    expect(chainEntry).toBeDefined();

    const candidate = buildSlice(chainEntry!, ctx);
    // Criterion is at f3 (DATA_SINK: productRepo.save)
    // f4 and f5 are unprotected leaves after f3
    expect(candidate.trace_steps.length).toBeGreaterThanOrEqual(2);
    // step_number renumbered from 1..n
    for (let i = 0; i < candidate.trace_steps.length; i++) {
      expect(candidate.trace_steps[i].step_number).toBe(i + 1);
    }
  });

  it("snippet_line_map dung so dong goc, marker = 0", async () => {
    const files = {
      "src/app.ts": `
        import express from "express";
        const app = express();
        app.get("/test", (req, res) => {
          res.json({ test: true });
        });
      `,
    };

    const { ctx, entries } = await createTestContext(files, ["express"]);
    const testEntry = entries[0];
    expect(testEntry).toBeDefined();

    const candidate = buildSlice(testEntry, ctx);
    expect(candidate.trace_steps.length).toBeGreaterThan(0);

    const step = candidate.trace_steps[0];
    const lines = step.snippet.split("\n");
    expect(lines.length).toBe(step.snippet_line_map.length);

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("… (")) {
        expect(step.snippet_line_map[i]).toBe(0);
      } else {
        expect(step.snippet_line_map[i]).toBeGreaterThan(0);
      }
    }
  });

  it("khong co buoc ten <module>", async () => {
    const files = {
      "src/routes/mod.routes.ts": `
        import express from "express";
        const router = express.Router();
        export const x = 10;
        router.get("/mod", (req, res) => {
          res.send("mod");
        });
      `,
    };

    const { ctx, entries } = await createTestContext(files, ["express"]);
    const entry = entries.find((e) => e.binding?.path === "/mod");
    expect(entry).toBeDefined();

    const candidate = buildSlice(entry!, ctx);
    for (const step of candidate.trace_steps) {
      expect(step.function_name).not.toContain("<module>");
    }
    for (const fn of candidate.functions) {
      expect(fn).not.toContain("<module>");
    }
  });

  it("handler an danh: snippet la ca cau lenh dang ky", async () => {
    const files = {
      "src/routes/anon.routes.ts": `
        import express from "express";
        const router = express.Router();
        router.post("/checkout", (req, res) => {
          res.json({ status: "ok" });
        });
      `,
    };

    const { ctx, entries } = await createTestContext(files, ["express"]);
    const entry = entries.find((e) => e.binding?.path === "/checkout");
    expect(entry).toBeDefined();

    const candidate = buildSlice(entry!, ctx);
    expect(candidate.trace_steps.length).toBe(1);
    const step = candidate.trace_steps[0];
    expect(step.snippet).toContain('router.post("/checkout"');
    expect(step.snippet).toContain('res.json({ status: "ok" })');
  });

  it("D-87 voi 4 route goi chung 1 ham vat", async () => {
    const files = {
      "src/routes/r1.ts": `
        import express from "express";
        import { formatResponse } from "../utils/helper";
        const r1 = express.Router();
        r1.get("/r1", (req, res) => {
          res.json(formatResponse("1"));
        });
      `,
      "src/routes/r2.ts": `
        import express from "express";
        import { formatResponse } from "../utils/helper";
        const r2 = express.Router();
        r2.get("/r2", (req, res) => {
          res.json(formatResponse("2"));
        });
      `,
      "src/routes/r3.ts": `
        import express from "express";
        import { formatResponse } from "../utils/helper";
        const r3 = express.Router();
        r3.get("/r3", (req, res) => {
          res.json(formatResponse("3"));
        });
      `,
      "src/routes/r4.ts": `
        import express from "express";
        import { formatResponse } from "../utils/helper";
        const r4 = express.Router();
        r4.get("/r4", (req, res) => {
          res.json(formatResponse("4"));
        });
      `,
      "src/utils/helper.ts": `
        export function formatResponse(val: string) {
          return { data: val };
        }
      `,
    };

    const { ctx, entries } = await createTestContext(files, ["express"]);
    expect(entries.length).toBe(4);

    const helpers = findSharedHelpers(entries, ctx);
    expect(helpers.has("src/utils/helper.ts#formatResponse")).toBe(true);

    const candidate = buildSlice(entries[0], ctx, helpers);
    const fnNames = candidate.trace_steps.map((s) => s.function_name);
    expect(fnNames).not.toContain("formatResponse");
  });

  it("handler có tên hiện thân hàm, không chỉ dòng đăng ký", async () => {
    const { ctx, entries } = await createTestContext(
      {
        "src/r.ts":
          'import express from "express";\nconst router = express.Router();\n' +
          "function list(req, res) {\n  const items = db.find();\n  res.json(items);\n}\n" +
          'router.get("/items", list);\n',
      },
      ["express"]
    );
    const step = buildSlice(entries[0], ctx).trace_steps[0];
    expect(step.function_name).toBe("list");
    expect(step.snippet).toBe("function list(req, res) {\n  const items = db.find();\n  res.json(items);\n}");
    expect(step.snippet_line_map).toEqual([3, 4, 5, 6]);
  });

  it("câu lệnh nhiều dòng giữ đủ, khối bao ngoài có dấu đóng", async () => {
    const { ctx, entries } = await createTestContext(
      {
        "src/r.ts":
          'import express from "express";\nconst router = express.Router();\n' +
          "async function create(req, res) {\n" +
          "  const t0 = Date.now();\n" +
          "  if (req.body) {\n" +
          "    const row = await prisma.user.create({\n" +
          "      data: req.body,\n" +
          "    });\n" +
          "    return res.json(row);\n" +
          "  }\n" +
          "}\n" +
          'router.post("/u", create);\n',
      },
      ["express"]
    );
    const step = buildSlice(entries[0], ctx).trace_steps[0];
    expect(step.snippet).toContain("data: req.body,");
    expect(step.snippet).toContain("    });");
    expect(step.snippet.split("\n")).toContain("  }");
    expect(step.snippet).toContain("// … (1 dòng)");
    expect(step.snippet).not.toContain("Date.now");
  });

  it("throw new X() không thành bước, method thật thì có tên lớp", async () => {
    const { ctx, entries } = await createTestContext(
      {
        "src/err.ts": "export class HttpError {\n  constructor(public code: number) {\n    this.code = code;\n  }\n}\n",
        "src/s.ts":
          'import { HttpError } from "./err";\n' +
          "export class S {\n  run() {\n    if (!db.find()) {\n      throw new HttpError(404);\n    }\n    return 1;\n  }\n}\n",
        "src/r.ts":
          'import express from "express";\nimport { S } from "./s";\nconst router = express.Router();\nconst s = new S();\n' +
          'router.get("/x", (req, res) => {\n  res.json(s.run());\n});\n',
      },
      ["express"]
    );
    const names = buildSlice(entries[0], ctx).trace_steps.map((step) => step.function_name);
    expect(names).toEqual(["router.get('/x')", "S.run"]);
  });

  it("method thụt lề và hàm nằm trong lớp có complexity thật", async () => {
    const { ctx, entries } = await createTestContext(
      {
        "src/r.ts":
          'import express from "express";\nconst router = express.Router();\n' +
          "class C {\n  run(a, b) {\n    if (a) {\n      if (b) {\n        return 1;\n      }\n    }\n    return 2;\n  }\n}\n" +
          "const c = new C();\n" +
          'router.get("/x", c.run);\n',
      },
      ["express"]
    );
    fillComplexity(ctx.files, ctx.index.functions);
    expect(buildSlice(entries[0], ctx).cognitive_complexity).toBe(3);
  });

  it("route gốc / không ra tên rác", async () => {
    const { ctx, entries } = await createTestContext(
      {
        "src/home/main.ts":
          'import express from "express";\nconst app = express();\napp.get("/", (req, res) => {\n  res.json({});\n});\n',
      },
      ["express"]
    );
    expect(buildSlice(entries[0], ctx).base_title).toBe("Home");
  });

  describe("ENG-80 thứ tự bước theo thứ tự chạy", () => {
    const order = (c: { trace_steps: { function_name: string }[] }): string[] =>
      c.trace_steps.map((s) => s.function_name.split(".").pop() ?? "");

    it("TS: lời gọi trong đối số đứng trước hàm bọc nó", async () => {
      const { ctx, entries } = await createTestContext(
        {
          "src/app.ts": [
            'import express from "express";',
            'import { wrap, load } from "./lib";',
            "const app = express();",
            'app.get("/items", (req, res) => {',
            "  res.json(wrap(load(req.query.id)));",
            "});",
          ].join("\n"),
          "src/lib.ts": [
            "export function load(id: string) {",
            "  const row = db.query(id);",
            "  return row;",
            "}",
            "export function wrap(data: unknown) {",
            "  const out = { data };",
            "  return out;",
            "}",
          ].join("\n"),
        },
        ["express"]
      );
      expect(order(buildSlice(entries[0], ctx)).slice(1)).toEqual(["load", "wrap"]);
    });

    it("hai lệnh liền nhau giữ nguyên thứ tự dòng", async () => {
      const { ctx, entries } = await createTestContext(
        {
          "src/app.ts": [
            'import express from "express";',
            'import { first, second } from "./lib";',
            "const app = express();",
            'app.get("/items", (req, res) => {',
            "  const a = first();",
            "  const b = second(a);",
            "  res.json(b);",
            "});",
          ].join("\n"),
          "src/lib.ts": [
            "export function second(x: unknown) {",
            "  return db.query(x);",
            "}",
            "export function first() {",
            "  return db.query(1);",
            "}",
          ].join("\n"),
        },
        ["express"]
      );
      expect(order(buildSlice(entries[0], ctx)).slice(1)).toEqual(["first", "second"]);
    });
  });
});

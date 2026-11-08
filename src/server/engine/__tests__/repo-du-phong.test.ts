import { beforeAll, describe, expect, it } from "vitest";
import { CONFIG } from "@/contracts";
import type { IngestOutput, LanguageId } from "@/contracts";
import { buildGraph } from "../graph";
import { initParsers } from "../graph/parser";

function ingest(sources: Record<string, string>): IngestOutput {
  const code = new Map(Object.entries(sources));
  return {
    repo_name: "demo",
    snapshot: {
      source: "ZIP",
      repo_key: "demo",
      snapshot_id: "0",
      snapshot_id_kind: "ARCHIVE_HASH",
      subdir: "",
      ref_label: null,
    },
    fingerprint: {
      archetype: "WEB_BACKEND",
      primary_language: "TYPESCRIPT",
      language_breakdown: [],
      graph_confidence: "HIGH",
      detected_framework: "Express",
      tech_stack: ["express"],
      is_monorepo: false,
      root_dir_offset: "",
    },
    report: {
      truncated: false,
      selective_fetch: false,
      code_file_count: code.size,
      manifest_count: 0,
      omitted_node_count: 0,
      skipped: { garbage: 0, binary: 0, oversized: 0, unsupported_lang: 0, quota: 0, parse_error: 0 },
      warnings: [],
      degraded_mode: null,
      redacted_secret_count: 0,
      engine_ms: 0,
      ingest_ms: 0,
      suspicious_instruction_files: [],
    },
    code,
    file_language: new Map<string, LanguageId>(Object.keys(sources).map((p) => [p, "TYPESCRIPT"])),
    manifests: new Map(),
    source_map: new Map(),
    module_info: { go_module_path: null, dart_package_name: null, package_entry_files: [] },
    readme_excerpt: null,
    manifest_description: null,
  };
}

// `count` route, mỗi route có handler gọi sang 1 service riêng nên có 2 bước.
function routesWithService(count: number): Record<string, string> {
  const names = Array.from({ length: count }, (_, i) => `item${String.fromCharCode(97 + i)}s`);
  const service = names
    .map((n) => `export function load${n}() {\n  return db.find("${n}");\n}\n`)
    .join("\n");
  const imports = names.map((n) => `load${n}`).join(", ");
  const routes = names
    .map((n) => `router.get("/${n}", (req, res) => {\n  res.json(load${n}());\n});\n`)
    .join("\n");
  return {
    "src/service.ts": service,
    "src/routes.ts":
      `import express from "express";\nimport { ${imports} } from "./service";\n` +
      `const router = express.Router();\n${routes}`,
  };
}

describe("hồi quy MI-07 trên repo tự dựng", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("MI07-1 bỏ bài 1 bước khi vẫn đủ số bài tối thiểu", async () => {
    const sources = routesWithService(CONFIG.DISPLAY_MIN_NODES);
    sources["src/routes.ts"] += 'router.get("/", (req, res) => {\n  res.json({});\n});\n';
    const { nodes } = await buildGraph(ingest(sources));
    expect(nodes).toHaveLength(CONFIG.DISPLAY_MIN_NODES);
    expect(nodes.every((n) => n.trace_steps.length >= 2)).toBe(true);
  });

  it("MI07-2 giữ bài 1 bước khi bỏ đi thì thiếu bài", async () => {
    const sources = routesWithService(CONFIG.DISPLAY_MIN_NODES - 1);
    sources["src/routes.ts"] += 'router.get("/", (req, res) => {\n  res.json({});\n});\n';
    const { nodes } = await buildGraph(ingest(sources));
    expect(nodes).toHaveLength(CONFIG.DISPLAY_MIN_NODES);
    expect(nodes.filter((n) => n.trace_steps.length === 1)).toHaveLength(1);
  });

  it("MI07-3 Capstone không lấy từ file test dù phức tạp hơn", async () => {
    const sources = routesWithService(CONFIG.DISPLAY_MIN_NODES);
    sources["src/a.spec.ts"] =
      'import express from "express";\nconst r = express.Router();\n' +
      'r.get("/spec", (req, res) => {\n  if (req.a) {\n    if (req.b) {\n      if (req.c) {\n        res.json(1);\n      }\n    }\n  }\n});\n';
    const { nodes } = await buildGraph(ingest(sources));
    expect(nodes.filter((n) => n.is_capstone)).toHaveLength(1);
    expect(nodes.some((n) => n.files[0] === "src/a.spec.ts")).toBe(false);
  });

  it("MI07-4 route số ít đặt tên Get, không phải List", async () => {
    const { nodes } = await buildGraph(
      ingest({
        "src/routes.ts":
          'import express from "express";\nconst router = express.Router();\n' +
          'function me() {\n  return db.find();\n}\nrouter.get("/user", (req, res) => {\n  res.json(me());\n});\n',
      })
    );
    expect(nodes[0].title).toBe("Get User");
  });

  it("MI07-5 hàm truy cập dữ liệu không bị đổi tầng vì new Exception ở thư mục models", async () => {
    const { nodes } = await buildGraph(
      ingest({
        "src/models/http-exception.model.ts":
          "export class HttpException {\n  constructor(public code: number) {\n    this.code = code;\n  }\n}\n",
        "src/service.ts":
          'import { HttpException } from "./models/http-exception.model";\n' +
          "export async function load() {\n  const row = await prisma.user.findFirst();\n" +
          "  if (!row) {\n    throw new HttpException(404);\n  }\n  return row;\n}\n",
        "src/routes.ts":
          'import express from "express";\nimport { load } from "./service";\n' +
          'const router = express.Router();\nrouter.get("/items", async (req, res) => {\n  res.json(await load());\n});\n',
      })
    );
    expect(nodes[0].trace_steps.map((s) => [s.function_name, s.layer])).toEqual([
      ["router.get('/items')", "ENTRY_POINT"],
      ["load", "DATA_ACCESS"],
    ]);
  });

  it("MI07-7 constructor chỉ gán field không thành bước rỗng", async () => {
    const { nodes } = await buildGraph(
      ingest({
        "src/user.ts":
          "export class User {\n  name: string;\n  age: number;\n" +
          "  constructor(name: string, age: number) {\n    this.name = name;\n    this.age = age;\n  }\n}\n",
        "src/routes.ts":
          'import express from "express";\nimport { User } from "./user";\n' +
          'const router = express.Router();\nrouter.post("/users", (req, res) => {\n' +
          '  const user = new User("a", 1);\n  res.json(user);\n});\n',
      })
    );
    expect(nodes[0].trace_steps.map((s) => s.function_name)).toEqual(["router.post('/users')"]);
  });

  it("MI07-6 chạy 2 lần cùng node_id, cùng tọa độ, điểm bắt đầu cùng hàng", async () => {
    const sources = routesWithService(CONFIG.DISPLAY_MIN_NODES);
    const first = await buildGraph(ingest(sources));
    const second = await buildGraph(ingest(sources));
    const shape = (r: typeof first) => r.nodes.map((n) => [n.id, n.position.x, n.position.y]);
    expect(shape(second)).toEqual(shape(first));

    const minY = Math.min(...first.nodes.map((n) => n.position.y));
    const starts = first.nodes.filter(
      (n) => n.prerequisites.length === 0 && first.edges.some((e) => e.source === n.id)
    );
    expect(starts.every((n) => n.position.y === minY)).toBe(true);
  });
});

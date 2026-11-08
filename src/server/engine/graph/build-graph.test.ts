import { beforeAll, describe, expect, it } from "vitest";
import { CONFIG } from "@/contracts";
import type { IngestOutput, IngestionReport, LanguageId } from "@/contracts";
import { ApiHttpError } from "@/server/errors";
import { buildGraph } from "./index";
import { initParsers } from "./parser";
import { tarjanScc } from "./tarjan";
import { toClientResult } from "./to-client";

function createIngestInput(files: Record<string, string>): IngestOutput {
  const code = new Map<string, string>();
  const file_language = new Map<string, LanguageId>();
  for (const [p, content] of Object.entries(files)) {
    code.set(p, content);
    file_language.set(p, "TYPESCRIPT");
  }

  const report: IngestionReport = {
    truncated: false,
    selective_fetch: false,
    code_file_count: code.size,
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
    suspicious_instruction_files: ["secret.txt"],
  };

  return {
    repo_name: "test-app",
    snapshot: {
      source: "ZIP",
      repo_key: "test/app",
      snapshot_id: "test-sha",
      snapshot_id_kind: "COMMIT_SHA",
      subdir: "",
      ref_label: "main",
    },
    fingerprint: {
      archetype: "WEB_BACKEND",
      primary_language: "TYPESCRIPT",
      language_breakdown: [
        { language: "TYPESCRIPT", tier: "RESOLVED", code_bytes: 1000 },
      ],
      graph_confidence: "HIGH",
      detected_framework: "Express",
      tech_stack: ["express"],
      is_monorepo: false,
      root_dir_offset: "",
    },
    report,
    code,
    file_language,
    manifests: new Map(),
    source_map: new Map(),
    module_info: {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    },
    readme_excerpt: "# Test App",
    manifest_description: "A test express application",
  };
}

describe("buildGraph & Engine Pipeline", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("Repo không entry ⇒ throw ERR_NO_ARCHITECTURAL_SLICE", async () => {
    const input = createIngestInput({
      "src/utils.ts": `
        export function helper() {
          return 42;
        }
      `,
    });

    await expect(buildGraph(input)).rejects.toThrowError(ApiHttpError);
    await expect(buildGraph(input)).rejects.toMatchObject({
      code: "ERR_NO_ARCHITECTURAL_SLICE",
    });
  });

  it("Có ≥ 1 cạnh cha ⇒ con khi 2 bài cùng thực thể (POST tạo Order nối tới GET đọc Order)", async () => {
    const input = createIngestInput({
      "src/app.ts": `
        import express from "express";
        import { createOrder, listOrders } from "./order.controller";
        const app = express();
        app.post("/orders", createOrder);
        app.get("/orders", listOrders);
      `,
      "src/order.controller.ts": `
        export function createOrder(req: any, res: any) {
          res.status(201).json({ id: 1 });
        }
        export function listOrders(req: any, res: any) {
          res.json([]);
        }
      `,
    });

    const result = await buildGraph(input);
    expect(result.nodes.length).toBe(2);

    // Có cạnh từ bài CREATE tới bài READ
    const postNode = result.nodes.find((n) => n.title_evidence.startsWith("POST"));
    const getNode = result.nodes.find((n) => n.title_evidence.startsWith("GET"));
    expect(postNode).toBeDefined();
    expect(getNode).toBeDefined();

    const edge = result.edges.find(
      (e) => e.source === postNode!.id && e.target === getNode!.id
    );
    expect(edge).toBeDefined();
    expect(edge?.via_entities).toContain("Order");
    expect(getNode!.prerequisites).toContain(postNode!.id);
  });

  it("Đồ thị có vòng ⇒ cạnh kết quả không còn vòng", async () => {
    // 3 route:
    // Route 1 (GET /products, dễ nhất): gọi fn12 ⇒ đọc Product
    // Route 2 (GET /inventory, vừa): gọi fn12 và fn23
    // Route 3 (POST /products, khó nhất): gọi fn23 ⇒ tạo Product
    // Data edge: Route 3 -> Route 1 (tạo Product -> đọc Product)
    // D-07: Route 1 -> Route 2 (chung fn12, dễ -> vừa), Route 2 -> Route 3 (chung fn23, vừa -> khó)
    // Tạo thành vòng: 1 -> 2 -> 3 -> 1
    // Kết quả khử chu trình: cạnh 3 -> 1 (bài khó tới bài dễ) bị xóa, đồ thị thành DAG
    const input = createIngestInput({
      "src/app.ts": `
        import express from "express";
        import { listProducts, getInventory, createProduct } from "./controllers";
        const app = express();
        app.get("/products", listProducts);
        app.get("/inventory", getInventory);
        app.post("/products", createProduct);
      `,
      "src/controllers.ts": `
        import { fn12 } from "./helpers12";
        import { fn23 } from "./helpers23";

        export function listProducts(req: any, res: any) {
          fn12();
          res.json([]);
        }

        export function getInventory(req: any, res: any) {
          if (req) {
            for (let i = 0; i < 5; i++) {
              fn12();
              fn23();
            }
          }
          res.json({});
        }

        export function createProduct(req: any, res: any) {
          if (req) {
            for (let i = 0; i < 10; i++) {
              if (i % 2 === 0) {
                while (i > 0) {
                  fn23();
                  i--;
                }
              }
            }
          }
          res.status(201).json({});
        }
      `,
      "src/helpers12.ts": `
        export function fn12() {
          return 12;
        }
      `,
      "src/helpers23.ts": `
        export function fn23() {
          return 23;
        }
      `,
    });

    const result = await buildGraph(input);
    expect(result.nodes.length).toBe(3);

    const nodeIds = result.nodes.map((n) => n.id);
    const adj = new Map<string, string[]>();
    for (const id of nodeIds) {
      adj.set(id, []);
    }
    for (const e of result.edges) {
      adj.get(e.source)?.push(e.target);
    }

    const sccs = tarjanScc(nodeIds, adj);
    // Mọi SCC đều có độ dài 1 ⇒ không còn chu trình
    for (const scc of sccs) {
      expect(scc.length).toBe(1);
    }
  });

  it("Mọi điểm bắt đầu cùng position.y nhỏ nhất", async () => {
    const input = createIngestInput({
      "src/app.ts": `
        import express from "express";
        import { createOrder, listOrders, createUser, listUsers } from "./controllers";
        const app = express();
        app.post("/orders", createOrder);
        app.get("/orders", listOrders);
        app.post("/users", createUser);
        app.get("/users", listUsers);
      `,
      "src/controllers.ts": `
        export function createOrder(req: any, res: any) { res.json({}); }
        export function listOrders(req: any, res: any) { res.json({}); }
        export function createUser(req: any, res: any) { res.json({}); }
        export function listUsers(req: any, res: any) { res.json({}); }
      `,
    });

    const result = await buildGraph(input);
    // Điểm bắt đầu là node có cạnh ra, prerequisites = []
    const startNodes = result.nodes.filter(
      (n) => n.prerequisites.length === 0 && result.edges.some((e) => e.source === n.id)
    );

    expect(startNodes.length).toBeGreaterThan(1);
    const minY = Math.min(...startNodes.map((n) => n.position.y));
    for (const sn of startNodes) {
      expect(sn.position.y).toBe(minY);
    }
  });

  it("T-ENG-36: 25 route ⇒ giữ đúng CONFIG.DISPLAY_MAX_NODES (20), omitted_node_count 5 và đúng warning", async () => {
    const routesCode: string[] = [];
    const handlersCode: string[] = [];

    for (let i = 1; i <= 25; i++) {
      routesCode.push(`app.get("/resource-${i}", handler${i});`);
      handlersCode.push(`export function handler${i}(req: any, res: any) { res.json(${i}); }`);
    }

    const input = createIngestInput({
      "src/app.ts": `
        import express from "express";
        import { ${Array.from({ length: 25 }, (_, i) => `handler${i + 1}`).join(", ")} } from "./handlers";
        const app = express();
        ${routesCode.join("\n")}
      `,
      "src/handlers.ts": handlersCode.join("\n"),
    });

    const result = await buildGraph(input);
    expect(result.nodes.length).toBe(CONFIG.DISPLAY_MAX_NODES);
    expect(result.ingestion_report.omitted_node_count).toBe(5);
    expect(result.ingestion_report.warnings).toContain(
      "5 luồng khác không hiển thị trên bản đồ"
    );
  });

  it("T-ENG-33: toClientResult không có symbol_whitelist và suspicious_instruction_files", async () => {
    const input = createIngestInput({
      "src/app.ts": `
        import express from "express";
        import { testHandler } from "./test";
        const app = express();
        app.get("/test", testHandler);
      `,
      "src/test.ts": `
        export function testHandler(req: any, res: any) { res.json({}); }
      `,
    });

    const staticResult = await buildGraph(input);
    expect(staticResult.symbol_whitelist).toBeDefined();
    expect(staticResult.ingestion_report.suspicious_instruction_files).toBeDefined();

    const clientResult = toClientResult(staticResult);
    expect(clientResult).not.toHaveProperty("symbol_whitelist");
    expect(clientResult).not.toHaveProperty("readme_excerpt");
    expect(clientResult).not.toHaveProperty("manifest_description");
    expect(clientResult.ingestion_report).not.toHaveProperty("suspicious_instruction_files");
  });

  it("T-ENG-34: Tính tất định - chạy 2 lần cùng input cho kết quả JSON giống hệt", async () => {
    const createInput = () =>
      createIngestInput({
        "src/app.ts": `
          import express from "express";
          import { createOrder, listOrders, getHealth } from "./controllers";
          const app = express();
          app.post("/orders", createOrder);
          app.get("/orders", listOrders);
          app.get("/health", getHealth);
        `,
        "src/controllers.ts": `
          export function createOrder(req: any, res: any) { res.json({}); }
          export function listOrders(req: any, res: any) { res.json({}); }
          export function getHealth(req: any, res: any) { res.json({ ok: true }); }
        `,
      });

    const res1 = await buildGraph(createInput());
    const res2 = await buildGraph(createInput());

    expect(JSON.stringify(res1.nodes)).toBe(JSON.stringify(res2.nodes));
    expect(JSON.stringify(res1.edges)).toBe(JSON.stringify(res2.edges));
    expect(JSON.stringify(res1.groups)).toBe(JSON.stringify(res2.groups));
    expect(JSON.stringify(res1.symbol_whitelist)).toBe(
      JSON.stringify(res2.symbol_whitelist)
    );
  });

  it("T-ENG-42: 7 route ở src/ + hàm phức tạp ở src/a.spec.ts ⇒ không có node từ .spec, Capstone ở src/", async () => {
    const routesCode: string[] = [];
    const handlersCode: string[] = [];
    for (let i = 1; i <= 7; i++) {
      routesCode.push(`app.get("/route-${i}", handler${i});`);
      handlersCode.push(`export function handler${i}(req: any, res: any) { res.json(${i}); }`);
    }

    const input = createIngestInput({
      "src/app.ts": `
        import express from "express";
        import { ${Array.from({ length: 7 }, (_, i) => `handler${i + 1}`).join(", ")} } from "./handlers";
        const app = express();
        ${routesCode.join("\n")}
      `,
      "src/handlers.ts": handlersCode.join("\n"),
      "src/a.spec.ts": `
        import express from "express";
        export function complexTestFunc(req: any, res: any) {
          if (req) {
            for (let i = 0; i < 10; i++) {
              if (i % 2 === 0) {
                res.json(i);
              }
            }
          }
        }
        const app = express();
        app.get("/test-spec-route", complexTestFunc);
      `,
    });

    const result = await buildGraph(input);
    // Không có node nào chứa file .spec
    for (const node of result.nodes) {
      expect(node.files.some((f) => f.includes(".spec"))).toBe(false);
    }

    // Capstone ở src/ và không thuộc file spec
    const capstoneNode = result.nodes.find((n) => n.is_capstone);
    expect(capstoneNode).toBeDefined();
    expect(capstoneNode?.files[0]).toMatch(/^src\//);
    expect(capstoneNode?.files[0]).not.toContain(".spec");
  });

  it("T-ENG-43: 2 route ở src/ + 8 route ở integration/ ⇒ 6 node: đủ 2 route src/, bù 4 route integration/, Capstone ở src/", async () => {
    const integrationRoutes: string[] = [];
    const integrationHandlers: string[] = [];
    for (let i = 1; i <= 8; i++) {
      integrationRoutes.push(`app.get("/integ-${i}", integHandler${i});`);
      integrationHandlers.push(
        `export function integHandler${i}(req: any, res: any) { res.json(${i}); }`
      );
    }

    const input = createIngestInput({
      "src/app.ts": `
        import express from "express";
        import { hSrc1, hSrc2 } from "./handlers";
        const app = express();
        app.get("/src-1", hSrc1);
        app.get("/src-2", hSrc2);
      `,
      "src/handlers.ts": `
        export function hSrc1(req: any, res: any) { res.json(1); }
        export function hSrc2(req: any, res: any) { res.json(2); }
      `,
      "integration/app.ts": `
        import express from "express";
        import { ${Array.from({ length: 8 }, (_, i) => `integHandler${i + 1}`).join(", ")} } from "./handlers";
        const app = express();
        ${integrationRoutes.join("\n")}
      `,
      "integration/handlers.ts": integrationHandlers.join("\n"),
    });

    const result = await buildGraph(input);
    // Bù đủ CONFIG.DISPLAY_MIN_NODES (6)
    expect(result.nodes.length).toBe(CONFIG.DISPLAY_MIN_NODES);

    const srcNodes = result.nodes.filter((n) => n.files[0]?.startsWith("src/"));
    const integNodes = result.nodes.filter((n) => n.files[0]?.startsWith("integration/"));
    expect(srcNodes.length).toBe(2);
    expect(integNodes.length).toBe(4);

    const capstone = result.nodes.find((n) => n.is_capstone);
    expect(capstone).toBeDefined();
    expect(capstone?.files[0]).toMatch(/^src\//);
  });

  it("T-ENG-44: 8 route, tất cả ở integration/ ⇒ giữ đủ 8 node", async () => {
    const integrationRoutes: string[] = [];
    const integrationHandlers: string[] = [];
    for (let i = 1; i <= 8; i++) {
      integrationRoutes.push(`app.get("/integ-${i}", integHandler${i});`);
      integrationHandlers.push(
        `export function integHandler${i}(req: any, res: any) { res.json(${i}); }`
      );
    }

    const input = createIngestInput({
      "integration/app.ts": `
        import express from "express";
        import { ${Array.from({ length: 8 }, (_, i) => `integHandler${i + 1}`).join(", ")} } from "./handlers";
        const app = express();
        ${integrationRoutes.join("\n")}
      `,
      "integration/handlers.ts": integrationHandlers.join("\n"),
    });

    const result = await buildGraph(input);
    expect(result.nodes.length).toBe(8);
  });
});

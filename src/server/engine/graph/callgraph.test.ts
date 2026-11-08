import { beforeAll, describe, expect, it } from "vitest";
import type { IngestionReport, LanguageId } from "@/contracts";
import { buildCallGraph, fileGraph, findEntries } from "./callgraph";
import { initParsers, parseAll } from "./parser";
import { collectSymbols, resolveImports } from "./symbols";
import { buildSymbolWhitelist } from "./whitelist";

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

describe("callgraph and routes", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("app Express tự viết 3 route, 1 middleware, handler ở file khác ⇒ đúng 3 entry, đúng path và method, đúng cạnh", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        import express from "express";
        import { getHandler, postHandler, deleteHandler, myMiddleware } from "./handlers";
        const app = express();
        app.get("/items", myMiddleware, getHandler);
        app.post("/items", postHandler);
        app.delete("/items/:id", deleteHandler);
      `,
      "src/handlers.ts": `
        export function myMiddleware(req: any, res: any, next: any) { next(); }
        export function getHandler(req: any, res: any) {}
        export function postHandler(req: any, res: any) {}
        export function deleteHandler(req: any, res: any) {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const entries = findEntries(files, idx, graph, "");

    expect(entries).toHaveLength(3);
    expect(graph.bindings).toHaveLength(3);

    const bGet = graph.bindings.find((b) => b.method === "GET");
    const bPost = graph.bindings.find((b) => b.method === "POST");
    const bDelete = graph.bindings.find((b) => b.method === "DELETE");

    expect(bGet).toBeDefined();
    expect(bGet?.path).toBe("/items");
    expect(bGet?.handler).toBe("src/handlers.ts#getHandler");
    expect(bGet?.middlewares).toContain("src/handlers.ts#myMiddleware");

    expect(bPost).toBeDefined();
    expect(bPost?.path).toBe("/items");
    expect(bPost?.handler).toBe("src/handlers.ts#postHandler");

    expect(bDelete).toBeDefined();
    expect(bDelete?.path).toBe("/items/:id");
    expect(bDelete?.handler).toBe("src/handlers.ts#deleteHandler");

    expect(
      graph.edges.some(
        (e) =>
          e.callee === "src/handlers.ts#getHandler" &&
          e.confidence === "RESOLVED"
      )
    ).toBe(true);
    expect(
      graph.edges.some(
        (e) =>
          e.callee === "src/handlers.ts#myMiddleware" &&
          e.confidence === "RESOLVED"
      )
    ).toBe(true);
    expect(
      graph.edges.some(
        (e) =>
          e.callee === "src/handlers.ts#postHandler" &&
          e.confidence === "RESOLVED"
      )
    ).toBe(true);
    expect(
      graph.edges.some(
        (e) =>
          e.callee === "src/handlers.ts#deleteHandler" &&
          e.confidence === "RESOLVED"
      )
    ).toBe(true);
  });

  it("callback nặc danh có khóa file#<GET /x> và cạnh từ thân nó", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        import express from "express";
        import { doWork } from "./worker";
        const app = express();
        app.get("/x", (req: any, res: any) => {
          doWork();
        });
      `,
      "src/worker.ts": `
        export function doWork() {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const entries = findEntries(files, idx, graph, "");

    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("src/app.ts#<GET /x>");

    const edgeFromAnon = graph.edges.find((e) => e.caller === "src/app.ts#<GET /x>");
    expect(edgeFromAnon).toBeDefined();
    expect(edgeFromAnon?.callee).toBe("src/worker.ts#doWork");
    expect(edgeFromAnon?.confidence).toBe("RESOLVED");
  });

  it("app.use('/api', userRouter) từ file khác ⇒ path có tiền tố", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        import express from "express";
        import userRouter from "./userRouter";
        const app = express();
        app.use("/api", userRouter);
      `,
      "src/userRouter.ts": `
        import { Router } from "express";
        const router = Router();
        router.get("/users", (req: any, res: any) => {});
        export default router;
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const entries = findEntries(files, idx, graph, "");

    expect(entries).toHaveLength(1);
    expect(entries[0].binding?.path).toBe("/api/users");
  });

  it("asyncHandler(ctrl.create)", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        import express from "express";
        import { asyncHandler } from "./utils";
        import { ctrl } from "./ctrl";
        const app = express();
        app.post("/users", asyncHandler(ctrl.create));
      `,
      "src/utils.ts": `
        export function asyncHandler(fn: any) { return fn; }
      `,
      "src/ctrl.ts": `
        export const ctrl = {
          create: () => {}
        };
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const entries = findEntries(files, idx, graph, "");

    expect(entries).toHaveLength(1);
    expect(entries[0].binding?.handler).toMatch(/src\/ctrl\.ts#(ctrl\.)?create/);
  });

  it("app.get('view engine') không phải route", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        import express from "express";
        const app = express();
        const engine = app.get("view engine");
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    expect(graph.bindings).toHaveLength(0);
  });

  it("R từ gói ngoài lạ không phải route", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        import axios from "axios";
        axios.get("/api/data", () => {});
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    expect(graph.bindings).toHaveLength(0);
  });

  it("this.repo.find() qua private readonly repo: Repo ⇒ RESOLVED", async () => {
    const files = await parseVirtualFiles({
      "src/service.ts": `
        import { Repo } from "./repo";
        export class Service {
          private readonly repo: Repo;
          constructor(repo: Repo) {
            this.repo = repo;
          }
          public doWork() {
            this.repo.find();
          }
        }
      `,
      "src/repo.ts": `
        export class Repo {
          public find() {}
        }
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const edge = graph.edges.find(
      (e) =>
        e.caller === "src/service.ts#Service.doWork" &&
        e.callee === "src/repo.ts#Repo.find"
    );
    expect(edge).toBeDefined();
    expect(edge?.confidence).toBe("RESOLVED");
  });

  it("productService.listProducts() với export const productService = new ProductService() import từ file khác ⇒ RESOLVED", async () => {
    const files = await parseVirtualFiles({
      "src/client.ts": `
        import { productService } from "./productService";
        export function list() {
          productService.listProducts();
        }
      `,
      "src/productService.ts": `
        export class ProductService {
          public listProducts() {}
        }
        export const productService = new ProductService();
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const edge = graph.edges.find(
      (e) =>
        e.caller === "src/client.ts#list" &&
        e.callee === "src/productService.ts#ProductService.listProducts"
    );
    expect(edge).toBeDefined();
    expect(edge?.confidence).toBe("RESOLVED");
  });

  it("ns.f() với import * as ns", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        import * as ns from "./math";
        export function run() {
          ns.f();
        }
      `,
      "src/math.ts": `
        export function f() {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const edge = graph.edges.find(
      (e) => e.caller === "src/app.ts#run" && e.callee === "src/math.ts#f"
    );
    expect(edge).toBeDefined();
    expect(edge?.confidence).toBe("RESOLVED");
  });

  it("interface 1 lớp cài đặt ⇒ RESOLVED, 2 lớp ⇒ ambiguous", async () => {
    // 1 lớp cài đặt
    const files1 = await parseVirtualFiles({
      "src/types.ts": `
        export interface Notifier {
          send(): void;
        }
      `,
      "src/email.ts": `
        import { Notifier } from "./types";
        export class EmailNotifier implements Notifier {
          public send() {}
        }
      `,
      "src/sender.ts": `
        import { Notifier } from "./types";
        export class Sender {
          private readonly n: Notifier;
          constructor(n: Notifier) { this.n = n; }
          public notify() {
            this.n.send();
          }
        }
      `,
    });
    const idx1 = collectSymbols(files1);
    resolveImports(files1, idx1, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph1 = buildCallGraph(files1, idx1);
    const edge1 = graph1.edges.find(
      (e) =>
        e.caller === "src/sender.ts#Sender.notify" &&
        e.callee === "src/email.ts#EmailNotifier.send"
    );
    expect(edge1).toBeDefined();
    expect(edge1?.confidence).toBe("RESOLVED");
    expect(edge1?.ambiguous).toBe(false);

    // 2 lớp cài đặt
    const files2 = await parseVirtualFiles({
      "src/types.ts": `
        export interface Notifier {
          send(): void;
        }
      `,
      "src/email.ts": `
        import { Notifier } from "./types";
        export class EmailNotifier implements Notifier {
          public send() {}
        }
      `,
      "src/sms.ts": `
        import { Notifier } from "./types";
        export class SmsNotifier implements Notifier {
          public send() {}
        }
      `,
      "src/sender.ts": `
        import { Notifier } from "./types";
        export class Sender {
          private readonly n: Notifier;
          constructor(n: Notifier) { this.n = n; }
          public notify() {
            this.n.send();
          }
        }
      `,
    });
    const idx2 = collectSymbols(files2);
    resolveImports(files2, idx2, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph2 = buildCallGraph(files2, idx2);
    const edgesFromNotify = graph2.edges.filter(
      (e) => e.caller === "src/sender.ts#Sender.notify"
    );
    expect(edgesFromNotify).toHaveLength(2);
    expect(edgesFromNotify.every((e) => e.ambiguous === true)).toBe(true);
    expect(edgesFromNotify.every((e) => e.confidence === "RESOLVED")).toBe(true);
  });

  it("console.log(), res.json() ⇒ ExternalCall, không có cạnh", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        export function logSomething(res: any) {
          console.log("hello");
          res.json({ ok: true });
        }
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    expect(graph.edges).toHaveLength(0);

    const extCalls = graph.external_calls.get("src/app.ts#logSomething");
    expect(extCalls).toBeDefined();
    expect(
      extCalls?.some(
        (e) => e.method === "log" && e.receiver_chain.includes("console")
      )
    ).toBe(true);
    expect(
      extCalls?.some(
        (e) => e.method === "json" && e.receiver_chain.includes("res")
      )
    ).toBe(true);
  });

  it("gộp 2 lần gọi ⇒ call_count: 2", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        import { helper } from "./helper";
        export function run() {
          helper();
          helper();
        }
      `,
      "src/helper.ts": `
        export function helper() {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const edge = graph.edges.find(
      (e) => e.caller === "src/app.ts#run" && e.callee === "src/helper.ts#helper"
    );
    expect(edge).toBeDefined();
    expect(edge?.call_count).toBe(2);
  });

  it("fileGraph cộng weight, bỏ cạnh cùng file", async () => {
    const files = await parseVirtualFiles({
      "src/a.ts": `
        import { bFunc } from "./b";
        function localHelper() {}
        export function aFunc() {
          bFunc();
          bFunc();
          localHelper();
        }
      `,
      "src/b.ts": `
        export function bFunc() {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const fg = fileGraph(graph.edges);

    const aTargets = fg.get("src/a.ts");
    expect(aTargets).toBeDefined();
    expect(aTargets?.get("src/b.ts")?.weight).toBe(2);
    expect(aTargets?.has("src/a.ts")).toBe(false);
  });

  it("NestJS controller có prefix và @UseGuards", async () => {
    const files = await parseVirtualFiles({
      "src/user.controller.ts": `
        import { Controller, Get, UseGuards } from "@nestjs/common";
        import { AuthGuard } from "./auth.guard";

        @Controller("users")
        @UseGuards(AuthGuard)
        export class UserController {
          @Get(":id")
          public getUser() {}
        }
      `,
      "src/auth.guard.ts": `
        export class AuthGuard {
          public canActivate() { return true; }
        }
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    expect(graph.bindings).toHaveLength(1);

    const b = graph.bindings[0];
    expect(b.path).toBe("/users/:id");
    expect(b.method).toBe("GET");
    expect(b.handler).toBe("src/user.controller.ts#UserController.getUser");
    expect(b.middlewares.some((m) => m.includes("AuthGuard.canActivate"))).toBe(true);
  });

  it("Next src/app/api/users/[id]/route.ts ⇒ /api/users/:id", async () => {
    const files = await parseVirtualFiles({
      "src/app/api/users/[id]/route.ts": `
        export function GET(req: any) {}
        export function POST(req: any) {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    expect(graph.bindings).toHaveLength(2);

    const getRoute = graph.bindings.find((b) => b.method === "GET");
    const postRoute = graph.bindings.find((b) => b.method === "POST");

    expect(getRoute?.path).toBe("/api/users/:id");
    expect(getRoute?.handler).toBe("src/app/api/users/[id]/route.ts#GET");
    expect(postRoute?.path).toBe("/api/users/:id");
  });

  it("repo không route ⇒ entry GENERIC", async () => {
    const files = await parseVirtualFiles({
      "src/controllers/user.ts": `
        export function listUsers() {}
        function internalHelper() {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const entries = findEntries(files, idx, graph, "");

    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("GENERIC");
    expect(entries[0].key).toBe("src/controllers/user.ts#listUsers");
    expect(entries[0].binding).toBeNull();
  });

  it("repo không gì cả ⇒ []", async () => {
    const files = await parseVirtualFiles({
      "src/utils.ts": `
        function internalOnly() {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const entries = findEntries(files, idx, graph, "");

    expect(entries).toEqual([]);
  });

  it("scope loại entry ngoài thư mục", async () => {
    const files = await parseVirtualFiles({
      "src/api/users/route.ts": `
        export function GET() {}
      `,
      "external/api/orders/route.ts": `
        export function GET() {}
      `,
    });
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);

    const scopedEntries = findEntries(files, idx, graph, "src/");
    expect(scopedEntries).toHaveLength(1);
    expect(scopedEntries[0].key).toBe("src/api/users/route.ts#GET");
  });
});

describe("các ca dễ sót của đồ thị gọi hàm và route", () => {
  beforeAll(async () => {
    await initParsers();
  });

  async function graphOf(sources: Record<string, string>, lang: LanguageId = "TYPESCRIPT") {
    const files = await parseVirtualFiles(sources, lang);
    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });
    const graph = buildCallGraph(files, idx);
    const has = (caller: string, callee: string) =>
      graph.edges.some((e) => e.caller === caller && e.callee === callee);
    return { idx, graph, has, entries: findEntries(files, idx, graph, "") };
  }

  it("export default function: lời gọi vào và ra cùng đi qua khóa thật", async () => {
    const { has } = await graphOf({
      "src/a.ts": 'import create from "./b";\nexport function main() { create(); }',
      "src/b.ts": "function g() {}\nexport default function create() { g(); }",
    });
    expect(has("src/a.ts#main", "src/b.ts#create")).toBe(true);
    expect(has("src/b.ts#create", "src/b.ts#g")).toBe(true);
  });

  it("export default class: nối qua field và lời gọi tĩnh", async () => {
    const { has } = await graphOf({
      "src/s.ts": "export default class S { m() {} static n() {} }",
      "src/c.ts":
        'import S from "./s";\n' +
        "export class C {\n  constructor(private s: S) {}\n  run() {\n    this.s.m();\n    S.n();\n  }\n}",
    });
    expect(has("src/c.ts#C.run", "src/s.ts#S.m")).toBe(true);
    expect(has("src/c.ts#C.run", "src/s.ts#S.n")).toBe(true);
  });

  it("module.exports = new S() và export default new S()", async () => {
    const js = await graphOf(
      {
        "src/s.js": "class S { m() {} }\nmodule.exports = new S();",
        "src/c.js": 'const s = require("./s");\nfunction run() { s.m(); }',
      },
      "JAVASCRIPT"
    );
    expect(js.has("src/c.js#run", "src/s.js#S.m")).toBe(true);

    const ts = await graphOf({
      "src/s.ts": "class S { m() {} }\nexport default new S();",
      "src/c.ts": 'import s from "./s";\nexport function run() { s.m(); }',
    });
    expect(ts.has("src/c.ts#run", "src/s.ts#S.m")).toBe(true);
  });

  it("tham số trùng tên hàm cấp file không tạo cạnh", async () => {
    const { graph, has } = await graphOf({
      "src/a.ts": "function g() {}\nexport function f(g: () => void) { g(); }",
    });
    expect(has("src/a.ts#f", "src/a.ts#g")).toBe(false);
    expect(graph.external_calls.get("src/a.ts#f")?.[0].method).toBe("g");
  });

  it("hàm toàn cục và receiver từ gói ngoài không nối vào file nội bộ", async () => {
    const { graph } = await graphOf({
      "src/a.ts":
        'import axios from "axios";\nimport { x } from "./b";\n' +
        'export function run() { fetch("/a"); axios.get("/a"); JSON.parse("1"); return x; }',
      "src/b.ts": "export const x = 1;\nexport function fetch() {}\nexport function get() {}\nexport function parse() {}",
    });
    expect(graph.edges.filter((e) => e.caller === "src/a.ts#run")).toEqual([]);
    const ext = graph.external_calls.get("src/a.ts#run") ?? [];
    expect(ext.find((c) => c.method === "get")?.import_source).toBe("axios");
  });

  it("import tới tên không phải hàm thì không tạo cạnh", async () => {
    const { graph } = await graphOf({
      "src/a.ts": 'import { missing } from "./b";\nexport function run() { missing(); }',
      "src/b.ts": "export const other = 1;",
    });
    expect(graph.edges.filter((e) => e.caller === "src/a.ts#run")).toEqual([]);
  });

  it("lớp cha trỏ vòng không treo", async () => {
    const { graph } = await graphOf({
      "src/a.ts": "class A extends B { run() { this.x(); } }\nclass B extends A {}",
    });
    expect(graph.edges.filter((e) => e.caller === "src/a.ts#A.run")).toEqual([]);
  });

  it("super.m() nối lên lớp cha", async () => {
    const { has } = await graphOf({
      "src/a.ts": "class P { m() {} }\nexport class C extends P { m() { super.m(); } }",
    });
    expect(has("src/a.ts#C.m", "src/a.ts#P.m")).toBe(true);
  });

  it("handler dạng ctrl.list.bind(ctrl), và ctrl tạo từ lớp import", async () => {
    const { entries } = await graphOf({
      "src/ctrl.ts": "export class Ctrl { list() {} }",
      "src/r.ts":
        'import express from "express";\nimport { Ctrl } from "./ctrl";\n' +
        'const app = express();\nconst ctrl = new Ctrl();\napp.get("/x", ctrl.list.bind(ctrl));',
    });
    expect(entries.map((e) => e.key)).toEqual(["src/ctrl.ts#Ctrl.list"]);
  });

  it('const router = require("express").Router() và mount bằng require', async () => {
    const { entries } = await graphOf(
      {
        "src/app.js": 'const express = require("express");\nconst app = express();\napp.use("/users", require("./routes/users"));',
        "src/routes/users.js":
          'const router = require("express").Router();\nfunction list(req, res) {}\nrouter.get("/all", list);\nmodule.exports = router;',
      },
      "JAVASCRIPT"
    );
    expect(entries.map((e) => e.binding?.path)).toEqual(["/users/all"]);
  });

  it("app.use có middleware xen giữa prefix và router con", async () => {
    const { entries } = await graphOf({
      "src/app.ts":
        'import express from "express";\nimport { userRouter } from "./users";\nimport { auth } from "./auth";\n' +
        'const app = express();\napp.use("/api", auth, userRouter);',
      "src/auth.ts": "export function auth() {}",
      "src/users.ts":
        'import { Router } from "express";\nexport const userRouter = Router();\nfunction list() {}\nuserRouter.get("/u", list);',
    });
    expect(entries.map((e) => e.binding?.path)).toEqual(["/api/u"]);
  });

  it("app.use(router) không bị tính là middleware", async () => {
    const { entries } = await graphOf({
      "src/app.ts":
        'import express from "express";\nimport { userRouter } from "./users";\n' +
        'function list() {}\nconst app = express();\napp.use(userRouter);\napp.get("/a", list);',
      "src/users.ts": 'import { Router } from "express";\nexport const userRouter = Router();',
    });
    expect(entries[0].binding?.middlewares).toEqual([]);
  });

  it("tham số tên lạ không bị coi là router", async () => {
    const { entries } = await graphOf({
      "src/a.ts": 'export function load(api: Api, opts: Opts) { return api.get("/x", opts); }',
    });
    expect(entries.filter((e) => e.source === "REGISTERED")).toEqual([]);
  });

  it("tham số tên app, router vẫn là router", async () => {
    const { entries } = await graphOf({
      "src/routes.ts": 'function list() {}\nexport function setup(app: App) { app.get("/x", list); }',
    });
    expect(entries.map((e) => e.key)).toEqual(["src/routes.ts#list"]);
  });

  it("this.router.get(path, this.list) trong lớp", async () => {
    const { entries } = await graphOf({
      "src/r.ts":
        'import { Router } from "express";\n' +
        'export class R { router = Router(); list() {} init() { this.router.get("/x", this.list); } }',
    });
    expect(entries.map((e) => e.key)).toEqual(["src/r.ts#R.list"]);
  });

  it("handler không có trong repo thì không thành entry, không tạo cạnh", async () => {
    const { entries, graph } = await graphOf({
      "src/a.ts":
        'import express from "express";\nimport { pkgHandler } from "pkg";\n' +
        'const app = express();\napp.get("/x", pkgHandler);',
    });
    expect(entries).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("hàm trong object cấp file có symbol riêng", async () => {
    const { has } = await graphOf({
      "src/ctrl.ts": "const ctrl = {\n  create: () => {},\n  list() {},\n};\nexport default ctrl;",
      "src/a.ts": 'import ctrl from "./ctrl";\nexport function run() { ctrl.create(); ctrl.list(); }',
    });
    expect(has("src/a.ts#run", "src/ctrl.ts#ctrl.create")).toBe(true);
    expect(has("src/a.ts#run", "src/ctrl.ts#ctrl.list")).toBe(true);
  });

  it("mount chuỗi Router().use(a) rồi Router().use('/api', api)", async () => {
    const { entries } = await graphOf({
      "src/tag.ts":
        'import { Router } from "express";\nconst router = Router();\n' +
        'router.get("/tags", (req, res) => res.json([]));\nexport default router;',
      "src/routes.ts":
        'import { Router } from "express";\nimport tags from "./tag";\n' +
        "const api = Router().use(tags);\nexport default Router().use('/api', api);",
      "src/main.ts":
        'import express from "express";\nimport routes from "./routes";\n' +
        "const app = express();\napp.use(routes);",
    });
    expect(entries.map((e) => e.binding?.path)).toEqual(["/api/tags"]);
  });

  it("file có 2 router: mount chỉ áp vào router được import", async () => {
    const { entries } = await graphOf({
      "src/r.ts":
        'import { Router } from "express";\nfunction a() {}\nfunction b() {}\n' +
        'export const aRouter = Router();\nexport const bRouter = Router();\n' +
        'aRouter.get("/a", a);\nbRouter.get("/b", b);',
      "src/app.ts":
        'import express from "express";\nimport { aRouter } from "./r";\n' +
        'const app = express();\napp.use("/x", aRouter);',
    });
    expect(entries.map((e) => e.binding?.path)).toEqual(["/x/a", "/b"]);
  });

  it("T-ENG-12: comment chứa lời gọi không tạo cạnh", async () => {
    const { graph } = await graphOf({
      "src/a.ts": "// orderItemRepo.save()\nexport function run() {\n  // repo.save()\n  return 1;\n}",
    });
    expect(graph.edges).toEqual([]);
    expect(graph.external_calls.size).toBe(0);
  });

  it("T-ENT-02: GENERIC với user.controller.ts, hàm private không là entry", async () => {
    const { entries } = await graphOf({
      "src/user.controller.ts": "export function list() {}\nfunction helper() {}",
    });
    expect(entries.map((e) => [e.key, e.source])).toEqual([["src/user.controller.ts#list", "GENERIC"]]);
  });

  it("T-ENT-03: các ca không phải route và có route", async () => {
    const notRoute = await graphOf({
      "src/a.ts":
        'import { http } from "msw";\nimport { config } from "./c";\nimport { cache } from "./c";\n' +
        'function fn() {}\nconfig.get("K", "7d");\ncache.get("k", fn);\nhttp.get("/u", fn);',
      "src/c.ts": "export const config = {};\nexport const cache = {};",
    });
    expect(notRoute.graph.bindings).toEqual([]);

    const route = await graphOf({
      "src/a.ts":
        'import { Router } from "express";\nconst router = Router();\n' +
        'const h = makeHandler(cfg);\nrouter.get("/x", h);\n' +
        'function h2() {}\nexport function reg(app: App) { app.get("/y", h2); }',
    });
    expect(route.graph.bindings.map((b) => b.path)).toEqual(["/x", "/y"]);
  });

  it("fastify.get(path, opts, handler) và mảng middleware", async () => {
    const { graph } = await graphOf({
      "src/a.ts":
        'import fastify from "fastify";\nconst app = fastify();\nfunction a() {}\nfunction b() {}\nfunction h() {}\n' +
        'app.get("/x", { schema: {} }, h);\napp.post("/y", [a, b], h);',
    });
    expect(graph.bindings[0].middlewares).toEqual([]);
    expect(graph.bindings[1].middlewares).toEqual(["src/a.ts#a", "src/a.ts#b"]);
  });

  it("T-ENG-32: whitelist có class, method, tham số, field của DTO", async () => {
    const { idx } = await graphOf({
      "src/order.ts":
        "interface OrderDto { qty: number }\n" +
        "export class OrderService {\n  checkout(userId: string, items: OrderDto[]) {\n    return items;\n  }\n}",
    });
    const whitelist = buildSymbolWhitelist(idx, ["src/order.ts#OrderService.checkout"]);
    expect(whitelist).toEqual(
      expect.arrayContaining(["OrderService", "checkout", "OrderService.checkout", "userId", "items", "qty"])
    );
    expect(whitelist).toEqual([...whitelist].sort());
    expect(whitelist).not.toContain("<module>");
  });

  it("call_sites giữ từng lời gọi theo dòng", async () => {
    const { graph } = await graphOf({
      "src/a.ts": "function a() {}\nfunction b() {}\nexport function f() {\n  b();\n  a();\n  b();\n}",
    });
    expect(graph.call_sites.get("src/a.ts#f")?.map((s) => [s.callee, s.line])).toEqual([
      ["src/a.ts#b", 4],
      ["src/a.ts#a", 5],
      ["src/a.ts#b", 6],
    ]);
  });
});

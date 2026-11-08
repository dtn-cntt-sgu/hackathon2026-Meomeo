import { beforeAll, describe, expect, it } from "vitest";
import { CONFIG } from "@/contracts";
import type { IngestionReport, LanguageId } from "@/contracts";
import { parseJsonc, stripJsonc } from "../jsonc";
import { initParsers, parseAll } from "./parser";
import {
  followBarrelReExport,
  resolveTsJsImport,
} from "./resolvers/ts_js";
import {
  collectSymbols,
  resolveImports,
} from "./symbols";

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

describe("symbols and resolvers", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("import tương đối", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": 'import { add } from "./math";\nconsole.log(add(1, 2));',
      "src/math.ts": "export function add(a: number, b: number): number { return a + b; }",
    });

    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const appImports = idx.imports.get("src/app.ts");
    expect(appImports).toBeDefined();
    const addImport = appImports?.get("add");
    expect(addImport).toBeDefined();
    expect(addImport?.resolved_file).toBe("src/math.ts");
    expect(addImport?.imported_name).toBe("add");
  });

  it("import index", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": 'import { util } from "./utils";\nutil();',
      "src/utils/index.ts": "export function util(): void {}",
    });

    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const appImports = idx.imports.get("src/app.ts");
    const utilImport = appImports?.get("util");
    expect(utilImport?.resolved_file).toBe("src/utils/index.ts");
  });

  it("barrel 2 tầng tới đúng file định nghĩa", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": 'import { foo } from "./barrel1";\nfoo();',
      "src/barrel1.ts": 'export { foo } from "./barrel2";',
      "src/barrel2.ts": 'export { foo } from "./origin";',
      "src/origin.ts": "export function foo(): string { return 'ok'; }",
    });

    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const appImports = idx.imports.get("src/app.ts");
    const fooImport = appImports?.get("foo");
    expect(fooImport?.resolved_file).toBe("src/origin.ts");
    expect(fooImport?.imported_name).toBe("foo");
  });

  it("export * qua barrel", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": 'import { bar } from "./barrel";\nbar();',
      "src/barrel.ts": 'export * from "./origin";',
      "src/origin.ts": "export function bar(): void {}",
    });

    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const appImports = idx.imports.get("src/app.ts");
    const barImport = appImports?.get("bar");
    expect(barImport?.resolved_file).toBe("src/origin.ts");
    expect(barImport?.imported_name).toBe("bar");
  });

  it("alias @/ theo paths trong tsconfig có comment và dấu phẩy thừa", async () => {
    const tsconfigJson = `{
      // Comment trong tsconfig
      "compilerOptions": {
        "baseUrl": ".",
        "paths": {
          "@/*": ["src/*"],
        },
      },
    }`;

    const manifests = new Map<string, string>();
    manifests.set("tsconfig.json", tsconfigJson);

    const files = await parseVirtualFiles({
      "src/pages/home.ts": 'import { Header } from "@/components/header";\nHeader();',
      "src/components/header.ts": "export function Header(): void {}",
    });

    const idx = collectSymbols(files);
    resolveImports(files, idx, manifests, {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const homeImports = idx.imports.get("src/pages/home.ts");
    const headerImport = homeImports?.get("Header");
    expect(headerImport?.resolved_file).toBe("src/components/header.ts");
  });

  it("@/ khi không có tsconfig", async () => {
    const manifests = new Map<string, string>();

    const files = await parseVirtualFiles({
      "src/pages/home.ts": 'import { Header } from "@/components/header";\nHeader();',
      "src/components/header.ts": "export function Header(): void {}",
    });

    const idx = collectSymbols(files);
    resolveImports(files, idx, manifests, {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const homeImports = idx.imports.get("src/pages/home.ts");
    const headerImport = homeImports?.get("Header");
    expect(headerImport?.resolved_file).toBe("src/components/header.ts");
  });

  it("./x.js về x.ts", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": 'import { x } from "./x.js";\nconsole.log(x);',
      "src/x.ts": "export const x = 42;",
    });

    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const appImports = idx.imports.get("src/app.ts");
    const xImport = appImports?.get("x");
    expect(xImport?.resolved_file).toBe("src/x.ts");
  });

  it("tên gói ⇒ null", () => {
    const allFiles = new Set(["src/app.ts"]);
    const resolved = resolveTsJsImport("src/app.ts", "express", allFiles, null, "");
    expect(resolved).toBeNull();
  });

  it("sai hoa thường ⇒ null", () => {
    const allFiles = new Set(["src/utils.ts"]);
    const resolved = resolveTsJsImport("src/app.ts", "./Utils", allFiles, null, "");
    expect(resolved).toBeNull();
  });

  it("../ vượt gốc ⇒ null", () => {
    const allFiles = new Set(["secret.ts"]);
    const resolved = resolveTsJsImport("src/app.ts", "../../secret", allFiles, null, "");
    expect(resolved).toBeNull();
  });

  it("barrel trỏ vòng kết thúc, không treo", () => {
    const reExports = new Map();
    reExports.set("src/a.ts", [
      {
        exported_name: "circular",
        imported_name: "circular",
        source: "./b",
        resolved_file: "src/b.ts",
        line: 1,
      },
    ]);
    reExports.set("src/b.ts", [
      {
        exported_name: "circular",
        imported_name: "circular",
        source: "./a",
        resolved_file: "src/a.ts",
        line: 1,
      },
    ]);

    const result = followBarrelReExport(
      "src/a.ts",
      "circular",
      reExports,
      0,
      new Set(),
      () => false
    );
    expect(result).toBeNull();
  });

  it("barrel sâu hơn CONFIG.BARREL_MAX_DEPTH ⇒ null", () => {
    const reExports = new Map();
    const maxDepth = CONFIG.BARREL_MAX_DEPTH;

    for (let i = 0; i <= maxDepth + 1; i++) {
      const fromFile = `src/b${i}.ts`;
      const toFile = `src/b${i + 1}.ts`;
      reExports.set(fromFile, [
        {
          exported_name: "deep",
          imported_name: "deep",
          source: `./b${i + 1}`,
          resolved_file: toFile,
          line: 1,
        },
      ]);
    }

    const result = followBarrelReExport(
      "src/b0.ts",
      "deep",
      reExports,
      0,
      new Set(),
      (file) => file === `src/b${maxDepth + 2}.ts`
    );
    expect(result).toBeNull();
  });

  it("require cả 2 dạng", async () => {
    const files = await parseVirtualFiles({
      "src/app.ts": `
        const utils = require("./utils");
        const { add, sub: minus } = require("./math");
      `,
      "src/utils.ts": "export const a = 1;",
      "src/math.ts": "export const add = 1; export const sub = 2;",
    });

    const idx = collectSymbols(files);
    resolveImports(files, idx, new Map(), {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    });

    const appImports = idx.imports.get("src/app.ts");
    expect(appImports).toBeDefined();

    const utilsImp = appImports?.get("utils");
    expect(utilsImp?.is_namespace).toBe(true);
    expect(utilsImp?.imported_name).toBe("*");
    expect(utilsImp?.resolved_file).toBe("src/utils.ts");

    const addImp = appImports?.get("add");
    expect(addImp?.is_namespace).toBe(false);
    expect(addImp?.imported_name).toBe("add");
    expect(addImp?.local_name).toBe("add");
    expect(addImp?.resolved_file).toBe("src/math.ts");

    const minusImp = appImports?.get("minus");
    expect(minusImp?.is_namespace).toBe(false);
    expect(minusImp?.imported_name).toBe("sub");
    expect(minusImp?.local_name).toBe("minus");
    expect(minusImp?.resolved_file).toBe("src/math.ts");
  });

  it("khóa file#Class.method", async () => {
    const files = await parseVirtualFiles({
      "src/service.ts": `
        class UserService {
          getUser() { return 1; }
        }
      `,
    });

    const idx = collectSymbols(files);
    expect(idx.symbols.has("src/service.ts#UserService.getUser")).toBe(true);
    const methodDef = idx.symbols.get("src/service.ts#UserService.getUser");
    expect(methodDef?.kind).toBe("METHOD");
  });

  it("trùng tên ra ~2", async () => {
    const files = await parseVirtualFiles({
      "src/dup.ts": `
        function run(): void {}
        function run(): void {}
      `,
    });

    const idx = collectSymbols(files);
    expect(idx.symbols.has("src/dup.ts#run")).toBe(true);
    expect(idx.symbols.has("src/dup.ts#run~2")).toBe(true);
  });

  it("is_exported của export, export { a }, module.exports, exports.a", async () => {
    const files = await parseVirtualFiles({
      "src/exp.ts": `
        export function f1(): void {}
        function f2(): void {}
        export { f2 };
        function f3(): void {}
        module.exports = f3;
        function f4(): void {}
        exports.f4 = f4;
      `,
    });

    const idx = collectSymbols(files);
    expect(idx.symbols.get("src/exp.ts#f1")?.is_exported).toBe(true);
    expect(idx.symbols.get("src/exp.ts#f2")?.is_exported).toBe(true);
    expect(idx.symbols.get("src/exp.ts#f3")?.is_exported).toBe(true);
    expect(idx.symbols.get("src/exp.ts#f4")?.is_exported).toBe(true);
  });

  it("file#default", async () => {
    const files = await parseVirtualFiles({
      "src/comp.ts": "export default class Component {}",
    });

    const idx = collectSymbols(files);
    expect(idx.symbols.has("src/comp.ts#default")).toBe(true);
    const defaultDef = idx.symbols.get("src/comp.ts#default");
    expect(defaultDef?.is_exported).toBe(true);
    expect(defaultDef?.kind).toBe("CLASS");
  });

  it("line_start lấy từ decorator", async () => {
    const files = await parseVirtualFiles({
      "src/dec.ts": `@Controller("/test")
export class TestController {
  @Get("/hello")
  hello() {}
}`,
    });

    const idx = collectSymbols(files);
    const classDef = idx.symbols.get("src/dec.ts#TestController");
    expect(classDef?.line_start).toBe(1);

    const methodDef = idx.symbols.get("src/dec.ts#TestController.hello");
    expect(methodDef?.line_start).toBe(3);
  });

  it("field_types với constructor private readonly s: S", async () => {
    const files = await parseVirtualFiles({
      "src/service.ts": `
        interface S {}
        class Service {
          constructor(private readonly s: S) {}
        }
      `,
    });

    const idx = collectSymbols(files);
    expect(idx.field_types.get("src/service.ts#Service.s")).toBe("S");
  });

  it('stripJsonc giữ "http://x"', () => {
    const raw = '{\n  "url": "http://x", // comment\n}';
    const stripped = stripJsonc(raw);
    expect(stripped).toContain('"http://x"');
    const parsed = parseJsonc<{ url: string }>(raw);
    expect(parsed.url).toBe("http://x");
  });
});

describe("các ca dễ sót của bảng symbol và import", () => {
  beforeAll(async () => {
    await initParsers();
  });

  const moduleInfo = {
    go_module_path: null,
    dart_package_name: null,
    package_entry_files: [],
  };

  async function build(
    sources: Record<string, string>,
    lang: LanguageId = "TYPESCRIPT",
    manifests = new Map<string, string>()
  ) {
    const files = await parseVirtualFiles(sources, lang);
    const idx = collectSymbols(files);
    resolveImports(files, idx, manifests, moduleInfo);
    return idx;
  }

  it("arrow function có tham số, biến cục bộ, biến vòng lặp và catch", async () => {
    const idx = await build({
      "src/a.ts":
        "export const create = async (req: Req, res: Res) => {\n" +
        "  const user = 1;\n" +
        "  for (const item of items) { use(item); }\n" +
        "  try { run(); } catch (err) { log(err); }\n" +
        "};",
    });
    const fn = idx.functions.get("src/a.ts#create");
    expect(fn?.params).toEqual(["req", "res"]);
    expect(fn?.locals).toEqual(expect.arrayContaining(["user", "item", "err"]));
  });

  it("arrow function 1 tham số không ngoặc", async () => {
    const idx = await build({ "src/a.js": "const f = x => x + 1;" }, "JAVASCRIPT");
    expect(idx.functions.get("src/a.js#f")?.params).toEqual(["x"]);
  });

  it("destructuring có giá trị mặc định", async () => {
    const idx = await build({ "src/a.ts": "function f({ a = 1, b }: P) { return a + b; }" });
    expect(idx.functions.get("src/a.ts#f")?.params).toEqual(["a", "b"]);
  });

  it("require nằm trong hàm có export vẫn được ghi", async () => {
    const idx = await build({
      "src/m.ts": 'export function f() { const a = require("./a"); return a; }',
      "src/a.ts": "export const x = 1;",
    });
    expect(idx.imports.get("src/m.ts")?.get("a")?.resolved_file).toBe("src/a.ts");
  });

  it("require lấy 1 thuộc tính", async () => {
    const idx = await build(
      {
        "src/m.js": 'const y = require("./a").y;',
        "src/a.js": "exports.y = function () {};",
      },
      "JAVASCRIPT"
    );
    const imp = idx.imports.get("src/m.js")?.get("y");
    expect(imp?.imported_name).toBe("y");
    expect(imp?.is_namespace).toBe(false);
    expect(imp?.resolved_file).toBe("src/a.js");
  });

  it("abstract class ở file sau vẫn ghi được lớp con", async () => {
    const idx = await build({
      "src/a.ts": 'import { Base } from "./z";\nexport class A extends Base {}',
      "src/z.ts": "export abstract class Base {}",
    });
    expect(idx.interface_impls.get("Base")).toEqual(["src/a.ts#A"]);
  });

  it("ghi lớp cha của mọi class, cả TS và JS", async () => {
    const ts = await build({ "src/a.ts": "class P {}\nclass C extends P {}" });
    expect(ts.class_parents.get("src/a.ts#C")).toBe("P");
    const js = await build({ "src/a.js": "class P {}\nclass C extends P {}" }, "JAVASCRIPT");
    expect(js.class_parents.get("src/a.js#C")).toBe("P");
  });

  it("method của interface Java có tên interface trong khóa", async () => {
    const idx = await build(
      { "UserRepo.java": "public interface UserRepo { User find(int id); }" },
      "JAVA"
    );
    expect(idx.symbols.has("UserRepo.java#UserRepo.find")).toBe(true);
  });

  it("hàm lồng trong hàm export không tính là export", async () => {
    const idx = await build({
      "src/a.ts": "export function a() { function b() {} const c = () => {}; return [b, c]; }",
    });
    expect(idx.symbols.get("src/a.ts#a")?.is_exported).toBe(true);
    expect(idx.symbols.get("src/a.ts#b")?.is_exported).toBe(false);
    expect(idx.symbols.get("src/a.ts#c")?.is_exported).toBe(false);
  });

  it("CommonJS: module.exports.x, module.exports = X, object và exports.x = function", async () => {
    const idx = await build(
      {
        "src/a.js": "function a() {}\nmodule.exports.a = a;",
        "src/b.js": "function b() {}\nmodule.exports = b;",
        "src/c.js": "module.exports = { m() {}, n: function () {}, o: () => {} };",
        "src/d.js": "exports.p = function () {};",
        "src/e.js": "module.exports = function () {};",
      },
      "JAVASCRIPT"
    );
    expect(idx.symbols.get("src/a.js#a")?.is_exported).toBe(true);
    expect(idx.symbols.get("src/b.js#default")?.name).toBe("b");
    expect(idx.symbols.get("src/c.js#m")?.is_exported).toBe(true);
    expect(idx.symbols.get("src/c.js#n")?.is_exported).toBe(true);
    expect(idx.symbols.get("src/c.js#o")?.is_exported).toBe(true);
    expect(idx.symbols.get("src/d.js#p")?.is_exported).toBe(true);
    expect(idx.functions.has("src/e.js#default")).toBe(true);
  });

  it("export default hàm không tên", async () => {
    const idx = await build({ "src/a.ts": "export default function () { return 1; }" });
    expect(idx.functions.has("src/a.ts#default")).toBe(true);
  });

  it("export default object có method", async () => {
    const idx = await build({ "src/a.ts": "export default { n: () => 1 };" });
    expect(idx.symbols.get("src/a.ts#n")?.is_exported).toBe(true);
  });

  it("kiểu field bỏ null và mảng", async () => {
    const idx = await build({
      "src/a.ts": "class C { constructor(private r: Repo | null) {} items: Item[] = []; }",
    });
    expect(idx.field_types.get("src/a.ts#C.r")).toBe("Repo");
    expect(idx.field_types.get("src/a.ts#C.items")).toBe("Item");
  });

  it("new T() cục bộ không ghi đè kiểu cấp file, this.x = new T() trong constructor có ghi", async () => {
    const idx = await build({
      "src/a.ts":
        "const s = new A();\n" +
        "function f() { const s = new B(); return s; }\n" +
        "class C { constructor() { this.x = new T(); } }",
    });
    expect(idx.field_types.get("src/a.ts#s")).toBe("A");
    expect(idx.field_types.get("src/a.ts#C.x")).toBe("T");
  });

  it("export { r as router } cùng file nối về tên gốc", async () => {
    const idx = await build({
      "src/b.ts": "const r = 1;\nexport { r as router };",
      "src/m.ts": 'import { router } from "./b";',
    });
    const imp = idx.imports.get("src/m.ts")?.get("router");
    expect(imp?.resolved_file).toBe("src/b.ts");
    expect(imp?.imported_name).toBe("r");
  });

  it("barrel kiểu import rồi export lại", async () => {
    const idx = await build({
      "src/x.ts": "export default function x() {}",
      "src/index.ts": 'import X from "./x";\nexport { X };',
      "src/m.ts": 'import { X } from "./index";',
      "src/d.ts": 'import X from "./x";\nexport default X;',
      "src/n.ts": 'import Y from "./d";',
    });
    expect(idx.imports.get("src/m.ts")?.get("X")?.resolved_file).toBe("src/x.ts");
    expect(idx.imports.get("src/m.ts")?.get("X")?.imported_name).toBe("default");
    expect(idx.imports.get("src/n.ts")?.get("Y")?.resolved_file).toBe("src/x.ts");
  });

  it("@/ không có paths thì lấy src cạnh tsconfig gần nhất", async () => {
    const idx = await build(
      {
        "server/src/a.ts": 'import { b } from "@/b";',
        "server/src/b.ts": "export const b = 1;",
      },
      "TYPESCRIPT",
      new Map([["server/tsconfig.json", "{}"]])
    );
    expect(idx.imports.get("server/src/a.ts")?.get("b")?.resolved_file).toBe("server/src/b.ts");
  });
});

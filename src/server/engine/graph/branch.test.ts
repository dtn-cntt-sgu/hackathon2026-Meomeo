import { beforeAll, describe, expect, it } from "vitest";
import type { Node } from "web-tree-sitter";
import type { IngestOutput, IngestionReport, LanguageId, StepBranch } from "@/contracts";
import { conditionText, guardInfoOf, guardOf } from "./branch";
import { buildGraph } from "./index";
import { initParsers, parseAll } from "./parser";
import { toClientResult } from "./to-client";

function report(): IngestionReport {
  return {
    truncated: false,
    selective_fetch: false,
    code_file_count: 0,
    manifest_count: 0,
    omitted_node_count: 0,
    skipped: { garbage: 0, binary: 0, oversized: 0, unsupported_lang: 0, quota: 0, parse_error: 0 },
    warnings: [],
    degraded_mode: null,
    redacted_secret_count: 0,
    engine_ms: 0,
    ingest_ms: 0,
    suspicious_instruction_files: [],
  };
}

const langOf = (path: string): LanguageId => (path.endsWith(".java") ? "JAVA" : "TYPESCRIPT");

/** Guard của lời gọi `name` (lần xuất hiện thứ `nth`) trong 1 đoạn code. */
async function guard(code: string, name: string, lang: "ts" | "java" = "ts", nth = 0): Promise<StepBranch | null> {
  const path = lang === "ts" ? "src/a.ts" : "src/main/java/A.java";
  const [file] = await parseAll(new Map([[path, code]]), new Map([[path, langOf(path)]]), report());
  const calls: Node[] = [];
  const walk = (n: Node): void => {
    const callee =
      n.type === "call_expression"
        ? n.childForFieldName("function")?.text
        : n.type === "method_invocation"
          ? n.childForFieldName("name")?.text
          : undefined;
    if (callee !== undefined && (callee === name || callee.endsWith(`.${name}`))) calls.push(n);
    for (const c of n.namedChildren) if (c) walk(c);
  };
  walk(file.tree.rootNode);
  const call = calls[nth];
  if (!call) throw new Error(`không thấy lời gọi ${name}`);
  return guardOf(call);
}

function ingest(sources: Record<string, string>, techStack: string[] = ["express"]): IngestOutput {
  const code = new Map(Object.entries(sources));
  return {
    repo_name: "demo",
    snapshot: { source: "ZIP", repo_key: "demo", snapshot_id: "0", snapshot_id_kind: "ARCHIVE_HASH", subdir: "", ref_label: null },
    fingerprint: {
      archetype: "WEB_BACKEND",
      primary_language: "TYPESCRIPT",
      language_breakdown: [],
      graph_confidence: "HIGH",
      detected_framework: null,
      tech_stack: techStack,
      is_monorepo: false,
      root_dir_offset: "",
    },
    report: report(),
    code,
    file_language: new Map(Object.keys(sources).map((p) => [p, langOf(p)])),
    manifests: new Map(),
    source_map: new Map(),
    module_info: { go_module_path: null, dart_package_name: null, package_entry_files: [] },
    readme_excerpt: null,
    manifest_description: null,
  };
}

/** Nhánh của từng bước trong bài đầu tiên có bước `fnName`: { tên hàm: branch }. */
async function branchesOf(sources: Record<string, string>, fnName: string, techStack?: string[]) {
  const result = await buildGraph(ingest(sources, techStack));
  const node = result.nodes.find((n) => n.trace_steps.some((s) => s.function_name.endsWith(fnName)));
  if (!node) throw new Error(`không có bài chứa ${fnName}`);
  const out: Record<string, StepBranch | null> = {};
  for (const s of node.trace_steps) out[s.function_name.split(".").pop() ?? ""] = s.branch ?? null;
  return { out, node, result };
}

describe("guardOf: điều kiện gần nhất bao lời gọi", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("if / else (TS) và if lồng, else-if lấy if gần nhất", async () => {
    const code = `function f(user) {
  if (user) { notify(user); } else { log(); }
  if (a) { x(); } else if (b) { if (c) { y(); } }
}`;
    expect(await guard(code, "notify")).toEqual({ kind: "IF", condition: "user" });
    expect(await guard(code, "log")).toEqual({ kind: "ELSE", condition: "!(user)" });
    expect(await guard(code, "y")).toEqual({ kind: "IF", condition: "c" });
  });

  it("lời gọi nằm ngay trong điều kiện không phải nhánh", async () => {
    const code = `function f(x) {\n  if (isValid(x)) { go(); }\n}`;
    expect(await guard(code, "isValid")).toBeNull();
    expect(await guard(code, "go")).toEqual({ kind: "IF", condition: "isValid(x)" });
  });

  it("return sớm: lời gọi sau khối if là luồng chính", async () => {
    const code = `function f(c) {\n  if (c) { return a(); }\n  return b();\n}`;
    expect(await guard(code, "a")).toEqual({ kind: "IF", condition: "c" });
    expect(await guard(code, "b")).toBeNull();
  });

  it("ternary, switch, try/catch", async () => {
    const code = `function f(x, s) {
  const v = x ? one() : two();
  switch (s) { case "A": caseA(); break; default: other(); }
  try { risky(); } catch (err) { recover(err); }
}`;
    expect(await guard(code, "one")).toEqual({ kind: "TERNARY", condition: "x" });
    expect(await guard(code, "two")).toEqual({ kind: "ELSE", condition: "!(x)" });
    expect(await guard(code, "caseA")).toEqual({ kind: "SWITCH", condition: '"A"' });
    expect(await guard(code, "other")).toEqual({ kind: "SWITCH", condition: "default" });
    expect(await guard(code, "risky")).toBeNull();
    expect(await guard(code, "recover")).toEqual({ kind: "CATCH", condition: "err" });
  });

  it("vòng lặp và callback forEach (TS)", async () => {
    const code = `function f(items) {
  for (const it of items) { save(it); }
  while (more()) { pull(); }
  items.forEach((x) => store(x));
  const g = () => later();
}`;
    expect(await guard(code, "save")).toEqual({ kind: "LOOP", condition: "const it of items" });
    expect(await guard(code, "more")).toBeNull();
    expect(await guard(code, "pull")).toEqual({ kind: "LOOP", condition: "more()" });
    expect(await guard(code, "store")).toEqual({ kind: "LOOP", condition: "forEach" });
    expect(await guard(code, "later")).toBeNull();
  });

  it("Java: Optional.map là luồng chính, stream().map là vòng lặp", async () => {
    const code = `class A {
  Object get(Long id) {
    return repo.findById(id).map(p -> toResponse(p)).orElseThrow();
  }
  Object all(java.util.List<Item> items) {
    items.forEach(i -> audit(i));
    return items.stream().map(x -> convert(x)).toList();
  }
}`;
    expect(await guard(code, "toResponse", "java")).toBeNull();
    expect(await guard(code, "audit", "java")).toEqual({ kind: "LOOP", condition: "forEach" });
    expect(await guard(code, "convert", "java")).toEqual({ kind: "LOOP", condition: "map" });
  });

  it("Java: if, else, switch mới, for-each, catch", async () => {
    const code = `class A {
  void f(Req req, Status s, java.util.List<Item> items) {
    if (req.templateId() != null) { clone(req); } else { blank(); }
    switch (s) { case ACTIVE -> run(); default -> idle(); }
    for (Item it : items) { save(it); }
    try { risky(); } catch (IllegalStateException e) { recover(); }
  }
}`;
    expect(await guard(code, "clone", "java")).toEqual({ kind: "IF", condition: "req.templateId() != null" });
    expect(await guard(code, "blank", "java")).toEqual({ kind: "ELSE", condition: "!(req.templateId() != null)" });
    expect(await guard(code, "run", "java")).toEqual({ kind: "SWITCH", condition: "ACTIVE" });
    expect(await guard(code, "idle", "java")).toEqual({ kind: "SWITCH", condition: "default" });
    expect(await guard(code, "save", "java")).toEqual({ kind: "LOOP", condition: "Item it : items" });
    expect(await guard(code, "risky", "java")).toBeNull();
    expect(await guard(code, "recover", "java")).toEqual({ kind: "CATCH", condition: "IllegalStateException e" });
  });

  it("điều kiện nhiều dòng gộp 1 dòng, cắt ≤ 80 ký tự", () => {
    const long = `(user.isActive() &&\n   user.roles.includes("ADMIN") &&\n   user.plan.limits.projects > currentProjects.length + 1)`;
    const text = conditionText(long);
    expect(text).not.toContain("\n");
    expect(text.length).toBeLessThanOrEqual(80);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("branch của từng bước trong bài", () => {
  beforeAll(async () => {
    await initParsers();
  });

  const app = (handlerBody: string, imports: string) => `import express from "express";
import { ${imports} } from "./svc";
const app = express();
app.post("/users", async (req, res) => {
${handlerBody}
});
`;

  it("TS: if ⇒ IF, else ⇒ ELSE, lời gọi ngoài if ⇒ null", async () => {
    const { out } = await branchesOf(
      {
        "src/app.ts": app(
          "  const user = await save(req.body);\n  if (user) { await notify(user); } else { await log(); }\n  res.json(user);",
          "save, notify, log"
        ),
        "src/svc.ts": `export async function save(u: any) { return db.query(u); }
export async function notify(u: any) { return db.query(u); }
export async function log() { return db.query("log"); }
`,
      },
      "notify"
    );
    expect(out.save).toBeNull();
    expect(out.notify).toEqual({ kind: "IF", condition: "user" });
    expect(out.log).toEqual({ kind: "ELSE", condition: "!(user)" });
  });

  it("hàm con của bước nhánh phụ thừa kế nhánh; return sớm không gắn !cond cho phần sau", async () => {
    const { out } = await branchesOf(
      {
        "src/app.ts": app("  res.json(await create(req.body));", "create"),
        "src/svc.ts": `export async function create(req: any) {
  if (req.templateId) {
    return clone(req);
  }
  const p = await db.query(req);
  return finish(p);
}
export async function clone(req: any) {
  const id = parseId(req);
  return db.query(id);
}
export function parseId(req: any) {
  return Number(req.templateId);
}
export async function finish(p: any) { return db.query(p); }
`,
      },
      "clone"
    );
    expect(out.create).toBeNull();
    expect(out.clone).toEqual({ kind: "IF", condition: "req.templateId" });
    expect(out.parseId).toEqual({ kind: "IF", condition: "req.templateId" });
    expect(out.finish).toBeNull();
  });

  it("cùng 1 hàm gọi ở 2 chỗ (1 trong if, 1 ngoài) ⇒ null", async () => {
    const { out } = await branchesOf(
      {
        "src/app.ts": app("  res.json(await create(req.body));", "create"),
        "src/svc.ts": `export async function create(req: any) {
  if (req.x) { await audit(req); }
  await audit(req);
  return db.query(req);
}
export async function audit(r: any) { return db.query(r); }
`,
      },
      "audit"
    );
    expect(out.audit).toBeNull();
  });

  it("mọi bước (trừ entry) đều có điều kiện ⇒ tất cả null", async () => {
    const { out } = await branchesOf(
      {
        "src/app.ts": app("  if (req.body.ok) {\n    res.json(await work(req.body));\n  }", "work"),
        "src/svc.ts": `export async function work(r: any) { return db.query(r); }\n`,
      },
      "work"
    );
    expect(Object.values(out).every((b) => b === null)).toBe(true);
  });

  it("Java kiểu Create Project: clone và hàm con IF templateId, phần còn lại null; toClientResult giữ branch", async () => {
    const base = "src/main/java/com/demo";
    const { out, result, node } = await branchesOf(
      {
        [`${base}/api/ProjectController.java`]: `package com.demo.api;
import com.demo.service.ProjectService;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/projects")
public class ProjectController {
  private final ProjectService projectService;
  public ProjectController(ProjectService projectService) { this.projectService = projectService; }
  @PostMapping
  public Object createProject(@RequestBody Req req) {
    return projectService.createProject(req);
  }
}
`,
        [`${base}/service/ProjectService.java`]: `package com.demo.service;
import com.demo.repository.ProjectRepository;
public class ProjectService {
  private final ProjectRepository projectRepository;
  public ProjectService(ProjectRepository projectRepository) { this.projectRepository = projectRepository; }
  public Object createProject(Req req) {
    if (req.templateId() != null) {
      return cloneTemplate(req);
    }
    Object saved = projectRepository.save(new Object());
    return ownerName(saved);
  }
  private Object cloneTemplate(Req req) {
    Long id = numericId(req);
    return projectRepository.save(id);
  }
  private Long numericId(Req req) {
    return Long.valueOf(req.templateId());
  }
  private Object ownerName(Object saved) {
    return projectRepository.findById(1L);
  }
}
`,
        [`${base}/repository/ProjectRepository.java`]: `package com.demo.repository;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ProjectRepository extends JpaRepository<Object, Long> {}
`,
      },
      "cloneTemplate",
      []
    );
    expect(out.createProject).toBeNull();
    expect(out.cloneTemplate).toEqual({ kind: "IF", condition: "req.templateId() != null" });
    expect(out.numericId).toEqual({ kind: "IF", condition: "req.templateId() != null" });
    expect(out.ownerName).toBeNull();

    const client = toClientResult(result).nodes.find((n) => n.id === node.id);
    expect(client?.trace_steps.find((s) => s.function_name.endsWith("cloneTemplate"))?.branch).toEqual({
      kind: "IF",
      condition: "req.templateId() != null",
    });
  });
});

describe("guardInfoOf: dòng của câu điều kiện (để bước cha giữ dòng này)", () => {
  async function info(code: string, name: string, lang: "ts" | "java" = "ts") {
    const path = lang === "ts" ? "src/a.ts" : "src/main/java/A.java";
    const [file] = await parseAll(new Map([[path, code]]), new Map([[path, langOf(path)]]), report());
    let found: Node | null = null;
    const walk = (n: Node): void => {
      const callee =
        n.type === "call_expression"
          ? n.childForFieldName("function")?.text
          : n.type === "method_invocation"
            ? n.childForFieldName("name")?.text
            : undefined;
      if (!found && callee !== undefined && (callee === name || callee.endsWith(`.${name}`))) found = n;
      for (const c of n.namedChildren) if (c) walk(c);
    };
    walk(file.tree.rootNode);
    if (!found) throw new Error(`không thấy lời gọi ${name}`);
    return guardInfoOf(found);
  }

  it("Java if: dòng của if, không phải dòng lời gọi", async () => {
    const code = [
      "class A {",
      "  Object create(Req req) {",
      "    if (req.templateId() != null) {",
      "      Object x = build(req);",
      "      return svc.cloneTemplate(x);",
      "    }",
      "    return null;",
      "  }",
      "}",
    ].join("\n");
    const res = await info(code, "cloneTemplate", "java");
    expect(res?.branch).toEqual({ kind: "IF", condition: "req.templateId() != null" });
    expect(res?.line).toBe(3);
  });

  it("TS else: dòng của else", async () => {
    const code = ["function f(a: number) {", "  if (a > 1) {", "    one();", "  } else {", "    two();", "  }", "}"].join("\n");
    const res = await info(code, "two");
    expect(res?.branch.kind).toBe("ELSE");
    expect(res?.line).toBe(4);
  });

  it("không có điều kiện ⇒ null", async () => {
    expect(await info("function f() {\n  go();\n}", "go")).toBeNull();
  });
});

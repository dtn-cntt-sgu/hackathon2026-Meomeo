import { beforeAll, describe, expect, it } from "vitest";
import type { IngestionReport, LanguageId } from "@/contracts";
import { findEntries } from "./callgraph";
import { initParsers, parseAll } from "./parser";
import {
  buildJavaPackageMap,
  collectJavaImports,
  collectJavaSymbols,
  extractJavaPackage,
} from "./resolvers/java";
import { buildJavaCallGraph, isJavaTestSource, isSpringDataAccessFile } from "./spring";
import { collectSymbols } from "./symbols";

function emptyReport(): IngestionReport {
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

const BASE = "src/main/java/io/spring";

async function javaGraph(sources: Record<string, string>) {
  const code = new Map(Object.entries(sources));
  const langs = new Map<string, LanguageId>(Object.keys(sources).map((p) => [p, "JAVA"]));
  const files = await parseAll(code, langs, emptyReport());
  const idx = collectSymbols(files);
  const packages = buildJavaPackageMap(files);
  for (const file of files) {
    collectJavaSymbols(file, { idx });
    collectJavaImports(file, files, idx, packages);
  }
  const graph = buildJavaCallGraph(files, idx);
  const edge = (caller: string, callee: string) =>
    graph.edges.find((e) => e.caller === caller && e.callee === callee);
  return { files, idx, graph, edge, entries: findEntries(files, idx, graph, "") };
}

const ctrl = (body: string) => `package io.spring.api;
import org.springframework.web.bind.annotation.*;
${body}
`;

describe("Java và Spring Boot", () => {
  beforeAll(async () => {
    await initParsers();
  });

  it("đọc package và lớp ở thư mục lồng sâu", async () => {
    const { files } = await javaGraph({
      [`${BASE}/deep/er/still/A.java`]: "package io.spring.deep.er.still;\npublic class A {}\n",
    });
    expect(extractJavaPackage(files[0].tree.rootNode)).toBe("io.spring.deep.er.still");
    expect(buildJavaPackageMap(files).classes.get("io.spring.deep.er.still.A")).toBe(
      `${BASE}/deep/er/still/A.java`
    );
  });

  it("import đầy đủ, import *, cùng package, gói ngoài", async () => {
    const { idx } = await javaGraph({
      [`${BASE}/a/A.java`]:
        "package io.spring.a;\nimport io.spring.b.B;\nimport io.spring.c.*;\nimport java.util.List;\npublic class A {}\n",
      [`${BASE}/a/Same.java`]: "package io.spring.a;\npublic class Same {}\n",
      [`${BASE}/b/B.java`]: "package io.spring.b;\npublic class B {}\n",
      [`${BASE}/c/C.java`]: "package io.spring.c;\npublic class C {}\n",
    });
    const imports = idx.imports.get(`${BASE}/a/A.java`);
    expect(imports?.get("B")?.resolved_file).toBe(`${BASE}/b/B.java`);
    expect(imports?.get("C")?.resolved_file).toBe(`${BASE}/c/C.java`);
    expect(imports?.get("Same")?.resolved_file).toBe(`${BASE}/a/Same.java`);
    expect(imports?.get("List")?.resolved_file).toBeNull();
  });

  it("field Lombok không annotation vẫn nối controller ⇒ service", async () => {
    const { edge } = await javaGraph({
      [`${BASE}/api/A.java`]: ctrl(`import io.spring.app.Svc;
@AllArgsConstructor
@RestController
public class A {
  private Svc svc;

  @GetMapping
  public String list() {
    return svc.run();
  }
}`),
      [`${BASE}/app/Svc.java`]: "package io.spring.app;\npublic class Svc {\n  public String run() {\n    return \"x\";\n  }\n}\n",
    });
    expect(edge(`${BASE}/api/A.java#A.list`, `${BASE}/app/Svc.java#Svc.run`)?.confidence).toBe("RESOLVED");
  });

  it("T-ENT-04: route Spring, kể cả method = POST kiểu static import", async () => {
    const { graph } = await javaGraph({
      [`${BASE}/api/O.java`]: ctrl(`@RestController
@RequestMapping("/owners")
public class O {
  @GetMapping("/{id}")
  public String get() {
    return "a";
  }

  @RequestMapping(value = "/x", method = RequestMethod.POST)
  public String x() {
    return "b";
  }

  @RequestMapping("/y")
  public String y() {
    return "c";
  }

  @RequestMapping(path = "/z", method = PUT)
  public String z() {
    return "d";
  }

  @GetMapping
  public String root() {
    return "e";
  }
}`),
    });
    expect(graph.bindings.map((b) => `${b.method} ${b.path}`)).toEqual([
      "GET /owners/{id}",
      "POST /owners/x",
      "ALL /owners/y",
      "PUT /owners/z",
      "GET /owners",
    ]);
  });

  it("T-ENT-05: DATA_SINK theo kiểu, không theo tên receiver", async () => {
    const { graph, edge } = await javaGraph({
      [`${BASE}/app/S.java`]: `package io.spring.app;
import javax.persistence.EntityManager;
public class S {
  private final OwnerRepository owners;
  private final EntityManager entityManager;
  private final OrderService orderService;

  public void run(Object o) {
    owners.findById(1);
    entityManager.persist(o);
    orderService.findById(1);
  }
}
`,
      [`${BASE}/app/OwnerRepository.java`]:
        "package io.spring.app;\npublic interface OwnerRepository extends JpaRepository<Owner, Integer> {\n}\n",
      [`${BASE}/app/OrderService.java`]:
        "package io.spring.app;\npublic class OrderService {\n  public int findById(int id) {\n    return id;\n  }\n}\n",
    });
    const run = `${BASE}/app/S.java#S.run`;
    const calls = graph.external_calls.get(run) ?? [];
    expect(calls.map((c) => [c.method, c.is_data_sink])).toEqual([
      ["findById", true],
      ["persist", true],
    ]);
    expect(edge(run, `${BASE}/app/OrderService.java#OrderService.findById`)).toBeDefined();
  });

  it("@Mapper không có thân là DATA_SINK, không thành bước", async () => {
    const { graph, files } = await javaGraph({
      [`${BASE}/repo/R.java`]: `package io.spring.repo;
@Repository
public class R {
  private UserMapper userMapper;

  public void save(Object u) {
    userMapper.insert(u);
  }
}
`,
      [`${BASE}/repo/UserMapper.java`]:
        "package io.spring.repo;\n@Mapper\npublic interface UserMapper {\n  void insert(Object u);\n}\n",
    });
    expect(graph.edges).toEqual([]);
    expect(graph.external_calls.get(`${BASE}/repo/R.java#R.save`)?.[0].is_data_sink).toBe(true);
    expect(files.filter(isSpringDataAccessFile)).toHaveLength(2);
  });

  it("T-ENT-06: interface 1 lớp cài đặt RESOLVED, 2 lớp INFERRED ambiguous", async () => {
    const svc = (name: string, parent: string) =>
      `package io.spring.app;\npublic class ${name} implements ${parent} {\n  public void run() {\n    int x = 1;\n  }\n}\n`;
    const { edge } = await javaGraph({
      [`${BASE}/app/A.java`]: `package io.spring.app;
public class A {
  private One one;
  private Two two;

  public void go() {
    one.run();
    two.run();
  }
}
`,
      [`${BASE}/app/One.java`]: "package io.spring.app;\npublic interface One {\n  void run();\n}\n",
      [`${BASE}/app/Two.java`]: "package io.spring.app;\npublic interface Two {\n  void run();\n}\n",
      [`${BASE}/app/OneImpl.java`]: svc("OneImpl", "One"),
      [`${BASE}/app/TwoA.java`]: svc("TwoA", "Two"),
      [`${BASE}/app/TwoB.java`]: svc("TwoB", "Two"),
    });
    const go = `${BASE}/app/A.java#A.go`;
    const one = edge(go, `${BASE}/app/OneImpl.java#OneImpl.run`);
    expect([one?.confidence, one?.ambiguous]).toEqual(["RESOLVED", false]);
    const two = edge(go, `${BASE}/app/TwoA.java#TwoA.run`);
    expect([two?.confidence, two?.ambiguous]).toEqual(["INFERRED", true]);
    expect(edge(go, `${BASE}/app/TwoB.java#TwoB.run`)).toBeDefined();
  });

  it("lời gọi trong lớp ẩn danh và lambda tính cho hàm chứa", async () => {
    const { edge } = await javaGraph({
      [`${BASE}/app/A.java`]: `package io.spring.app;
public class A {
  private Svc svc;

  public Object go() {
    return new HashMap<String, Object>() {
      {
        put("a", svc.q());
      }
    };
  }
}
`,
      [`${BASE}/app/Svc.java`]: "package io.spring.app;\npublic class Svc {\n  public int q() {\n    return 1;\n  }\n}\n",
    });
    expect(edge(`${BASE}/app/A.java#A.go`, `${BASE}/app/Svc.java#Svc.q`)).toBeDefined();
  });

  it("ENG-80: lời gọi trong đối số kết thúc trước hàm bọc nó", async () => {
    const { graph } = await javaGraph({
      [`${BASE}/api/Api.java`]: ctrl(`@RestController
public class Api {
  @GetMapping("/a")
  public String get() {
    return wrap(load());
  }
  private String load() { return "x"; }
  private String wrap(String v) { return v; }
}`),
    });
    const sites = graph.call_sites.get(`${BASE}/api/Api.java#Api.get`) ?? [];
    const endOf = (name: string) => sites.find((s) => s.callee.endsWith(name))?.end_index ?? -1;
    expect(endOf("load")).toBeGreaterThan(0);
    expect(endOf("load")).toBeLessThan(endOf("wrap"));
  });

  it("kế thừa vòng không treo", async () => {
    const { graph } = await javaGraph({
      [`${BASE}/app/A.java`]: `package io.spring.app;
public class A extends B {
  public void go() {
    missing();
  }
}
`,
      [`${BASE}/app/B.java`]: "package io.spring.app;\npublic class B extends A {\n}\n",
    });
    expect(graph.edges).toEqual([]);
  });

  it("file test và lớp không có @RestController không tạo entry", async () => {
    const { entries, graph } = await javaGraph({
      "src/test/java/XTest.java": ctrl(`@RestController
public class XTest {
  @GetMapping("/t")
  public String t() {
    return "t";
  }
}`),
      [`${BASE}/graphql/Q.java`]: ctrl(`@DgsComponent
public class Q {
  @GetMapping("/q")
  public String q() {
    return "q";
  }
}`),
    });
    expect(graph.bindings).toEqual([]);
    expect(entries.filter((e) => e.source === "REGISTERED")).toEqual([]);
    expect(isJavaTestSource("src/test/java/XTest.java")).toBe(true);
    expect(isJavaTestSource(`${BASE}/api/Api.java`)).toBe(false);
  });
});

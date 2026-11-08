import type { EntityOp, HybridArchitecturalNode } from "@/contracts";
import { describe, expect, it } from "vitest";
import type { IngestionReport } from "@/contracts";
import {
  assembleGraph,
  computeEdgesOnKept,
  isEasier,
  isTestCandidate,
  transitiveReduction, assignCapstone } from "./nodes";
import type { Candidate, EngineContext } from "./types";

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

function createMockContext(): EngineContext {
  return {
    input: {
      repo_name: "test-repo",
      snapshot: { source: "ZIP", repo_key: "test", snapshot_id: "0", snapshot_id_kind: "ARCHIVE_HASH", subdir: "", ref_label: null, },
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
      report: createMockReport(),
      code: new Map(),
      file_language: new Map(),
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
    files: [],
    index: {
      symbols: new Map(),
      imports: new Map(),
      re_exports: new Map(),
      field_types: new Map(),
      interface_impls: new Map(),
      class_parents: new Map(),
      locals: new Map(),
      functions: new Map(),
      type_fields: new Set(),
    },
    call_edges: [],
    call_sites: new Map(),
    external_calls: new Map(),
    bindings: [],
    file_rank: new Map(),
  };
}

function createDummyCandidate(opts: {
  id: string;
  order_key?: string;
  functions: string[];
  complexity: number;
  filePath: string;
  stepsCount?: number;
}): Candidate {
  const stepsCount = opts.stepsCount ?? 1;
  const trace_steps = [];
  for (let i = 0; i < stepsCount; i++) {
    trace_steps.push({
      step_number: i + 1,
      layer: "BUSINESS_LOGIC" as const,
      file_path: opts.filePath,
      function_name: `func_${i + 1}`,
      line_start: i * 10 + 1,
      line_end: i * 10 + 5,
      snippet: "code",
      snippet_line_map: [i * 10 + 1],
    });
  }

  return {
    id: opts.id,
    order_key: opts.order_key ?? opts.id,
    kind: "SLICE",
    node_type: "ARCHITECTURAL_DATA_FLOW",
    entry_symbol: opts.id,
    functions: opts.functions,
    binding: null,
    base_title: opts.id,
    title_source: "FILE_BASENAME",
    title_evidence: opts.filePath,
    cognitive_complexity: opts.complexity,
    rank_score: 1,
    trace_steps,
    dto_snippet: "",
  };
}

describe("nodes (Spec 11 §11, ENG-110 -> ENG-114)", () => {
  it("T-ENG-14: A {a,s} cc 3, B {b,s,t} cc 8, C {c,t} cc 12, D {d,s,t} cc 20 => A->B->C->D", () => {
    const candA = createDummyCandidate({
      id: "nodeA",
      functions: ["f_a", "f_s"],
      complexity: 3,
      filePath: "src/a.ts",
    });
    const candB = createDummyCandidate({
      id: "nodeB",
      functions: ["f_b", "f_s", "f_t"],
      complexity: 8,
      filePath: "src/b.ts",
    });
    const candC = createDummyCandidate({
      id: "nodeC",
      functions: ["f_c", "f_t"],
      complexity: 12,
      filePath: "src/c.ts",
    });
    const candD = createDummyCandidate({
      id: "nodeD",
      functions: ["f_d", "f_s", "f_t"],
      complexity: 20,
      filePath: "src/d.ts",
    });

    const ctx = createMockContext();
    const report = createMockReport();

    const { nodes, edges } = assembleGraph(
      [candA, candB, candC, candD],
      ctx,
      report
    );

    expect(nodes.length).toBe(4);
    // Transitive reduction leaves A->B, B->C, C->D
    expect(edges.length).toBe(3);
    const edgeIds = edges.map((e) => e.id);
    expect(edgeIds).toContain("nodeA->nodeB");
    expect(edgeIds).toContain("nodeB->nodeC");
    expect(edgeIds).toContain("nodeC->nodeD");
  });

  it("T-ENG-15: transitiveReduction va computeEdgesOnKept", () => {
    // 1. A->B, B->C, A->C => A->B, B->C (loai A->C)
    const adj1 = new Map<string, Set<string>>([
      ["A", new Set(["B", "C"])],
      ["B", new Set(["C"])],
      ["C", new Set()],
    ]);
    const red1 = transitiveReduction(["A", "B", "C"], adj1);
    expect(red1.get("A")?.has("B")).toBe(true);
    expect(red1.get("A")?.has("C")).toBe(false);
    expect(red1.get("B")?.has("C")).toBe(true);

    // 2. Chuoi A->B->C, giu {A, C} => canh A->C
    const g0Adj = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set()],
    ]);
    const edgesKept = computeEdgesOnKept(["A", "C"], g0Adj);
    expect(edgesKept.length).toBe(1);
    expect(edgesKept[0].id).toBe("A->C");
  });

  it("khong node nao 0 buoc", () => {
    const zeroStepCand = createDummyCandidate({
      id: "zeroStep",
      functions: ["f1"],
      complexity: 1,
      filePath: "src/empty.ts",
      stepsCount: 0,
    });
    const validCand = createDummyCandidate({
      id: "validNode",
      functions: ["f2"],
      complexity: 5,
      filePath: "src/valid.ts",
      stepsCount: 2,
    });

    const ctx = createMockContext();
    const report = createMockReport();
    const { nodes } = assembleGraph([zeroStepCand, validCand], ctx, report);

    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe("validNode");
  });

  it("Capstone khong roi vao file test khi co node sach; dung 1 Capstone", () => {
    const cleanCand = createDummyCandidate({
      id: "cleanNode",
      functions: ["f_clean"],
      complexity: 10,
      filePath: "src/services/order.service.ts",
    });
    const testCand = createDummyCandidate({
      id: "testNode",
      functions: ["f_test"],
      complexity: 99,
      filePath: "src/__tests__/order.test.ts",
    });

    expect(isTestCandidate(cleanCand)).toBe(false);
    expect(isTestCandidate(testCand)).toBe(true);

    const ctx = createMockContext();
    const report = createMockReport();
    const { nodes } = assembleGraph([cleanCand, testCand], ctx, report);

    const capstones = nodes.filter((n) => n.is_capstone);
    expect(capstones.length).toBe(1);
    expect(capstones[0].id).toBe("cleanNode");
  });

  it("chay 2 lan cung dau vao, dao thu tu candidate => JSON.stringify giong het (X-01); id khong doi", () => {
    const c1 = createDummyCandidate({
      id: "node1",
      order_key: "k1",
      functions: ["f1", "f_shared"],
      complexity: 5,
      filePath: "src/s1.ts",
    });
    const c2 = createDummyCandidate({
      id: "node2",
      order_key: "k2",
      functions: ["f2", "f_shared"],
      complexity: 15,
      filePath: "src/s2.ts",
    });
    const c3 = createDummyCandidate({
      id: "node3",
      order_key: "k3",
      functions: ["f3"],
      complexity: 8,
      filePath: "src/s3.ts",
    });

    const ctx = createMockContext();
    const report1 = createMockReport();
    const report2 = createMockReport();

    const orderA = [c1, c2, c3];
    const orderB = [c3, c1, c2];

    const resA = assembleGraph(orderA, ctx, report1);
    const resB = assembleGraph(orderB, ctx, report2);

    expect(JSON.stringify(resA)).toBe(JSON.stringify(resB));
    expect(resA.nodes.map((n) => n.id)).toEqual(resB.nodes.map((n) => n.id));
  });

  it("isEasier: luồng ít bước hơn học trước, không xét độ phức tạp của hàm", () => {
    const steps = (n: number) => Array.from({ length: n }, () => ({}));
    const short = { id: "b", rank_score: 0, cognitive_complexity: 40, trace_steps: steps(2) };
    const long = { id: "a", rank_score: 0, cognitive_complexity: 1, trace_steps: steps(5) };
    expect(isEasier(short as unknown as Candidate, long as unknown as Candidate)).toBe(true);
    expect(isEasier(long as unknown as Candidate, short as unknown as Candidate)).toBe(false);
  });

  it("Trọng tâm là bài Sửa của thực thể có nhiều bài nhất, không theo độ phức tạp", () => {
    const steps = (n: number) => Array.from({ length: n }, () => ({}));
    const base = { position: { x: 0, y: 0 }, files: ["src/a.ts"], rank_score: 0, is_capstone: false };
    const nodes = [
      { ...base, id: "create-article", cognitive_complexity: 90, trace_steps: steps(9) },
      { ...base, id: "get-article", cognitive_complexity: 1, trace_steps: steps(7) },
      { ...base, id: "update-article", cognitive_complexity: 2, trace_steps: steps(5) },
      { ...base, id: "update-user", cognitive_complexity: 1, trace_steps: steps(8) },
    ] as unknown as HybridArchitecturalNode[];
    const data = (entity: string, op: EntityOp) => ({
      primary_entity: entity,
      entities: [{ name: entity, ops: [op] }],
      sub: "",
    });
    const dataById = new Map([
      ["create-article", data("Article", "CREATE")],
      ["get-article", data("Article", "READ")],
      ["update-article", data("Article", "UPDATE")],
      ["update-user", data("User", "UPDATE")],
    ]);
    assignCapstone(nodes, dataById);
    expect(nodes.filter((n) => n.is_capstone).map((n) => n.id)).toEqual(["update-article"]);
  });

  it("Trọng tâm: không có dữ liệu thực thể ⇒ bài có luồng dài nhất", () => {
    const steps = (n: number) => Array.from({ length: n }, () => ({}));
    const base = { position: { x: 0, y: 0 }, files: ["src/a.ts"], rank_score: 0, is_capstone: false };
    const nodes = [
      { ...base, id: "a", cognitive_complexity: 20, trace_steps: steps(2) },
      { ...base, id: "b", cognitive_complexity: 3, trace_steps: steps(6) },
    ] as unknown as HybridArchitecturalNode[];
    assignCapstone(nodes);
    expect(nodes.map((n) => n.is_capstone)).toEqual([false, true]);
  });
});

import { CONFIG } from "@/contracts";
import type {
  GraphEdge,
  HybridArchitecturalNode,
  IngestionReport,
  LanguageId,
  LanguageSupportTier,
} from "@/contracts";
import { dedupeTitles } from "./naming";
import type { LessonData } from "./data-deps";
import type { Candidate, EngineContext } from "./types";

const TEST_SEGMENTS = new Set([
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
  "example",
  "examples",
  "demo",
  "demos",
  "e2e",
  "fixtures",
  "mocks",
  "__mocks__",
  "migrations",
  "seeds",
  "docs",
  "scripts",
  "testdata",
  "bench",
  "benches",
  "benchmark",
  "benchmarks",
]);

const FIRST_SEGMENTS = new Set(["integration", "sample", "samples"]);

export function isTestCandidate(c: Candidate): boolean {
  const filePath = c.trace_steps[0]?.file_path;
  if (!filePath) {
    return false;
  }

  const segs = filePath.split("/");
  const fileName = segs[segs.length - 1] ?? "";

  // Từ src/main/ trở xuống chỉ xét tên file
  const srcMainIdx = filePath.indexOf("src/main/");
  if (srcMainIdx !== -1) {
    const stem = fileName.replace(/\.[^.]+$/, "");
    return (
      stem.endsWith(".test") ||
      stem.endsWith(".spec") ||
      stem.endsWith("_test") ||
      stem.startsWith("test_")
    );
  }

  // Check directory segments
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i].toLowerCase();
    if (TEST_SEGMENTS.has(s)) {
      return true;
    }
    if (s.startsWith(".") || s.endsWith("_src")) {
      return true;
    }
  }

  if (segs.length > 0 && FIRST_SEGMENTS.has(segs[0].toLowerCase())) {
    return true;
  }

  // Check file name stem
  const stem = fileName.replace(/\.[^.]+$/, "");
  return (
    stem.endsWith(".test") ||
    stem.endsWith(".spec") ||
    stem.endsWith("_test") ||
    stem.startsWith("test_")
  );
}

export function transitiveReduction(
  nodesList: string[],
  adjMap: Map<string, Set<string>>
): Map<string, Set<string>> {
  const reduced = new Map<string, Set<string>>();
  for (const n of nodesList) {
    reduced.set(n, new Set(adjMap.get(n) ?? []));
  }

  function hasPath(
    curr: string,
    target: string,
    visited: Set<string>
  ): boolean {
    if (curr === target) {
      return true;
    }
    if (visited.has(curr)) {
      return false;
    }
    visited.add(curr);

    const neighbors = adjMap.get(curr) ?? new Set();
    for (const next of neighbors) {
      if (hasPath(next, target, visited)) {
        return true;
      }
    }
    return false;
  }

  for (const u of nodesList) {
    const neighbors = Array.from(adjMap.get(u) ?? []);
    for (const v of neighbors) {
      // Check if there is an alternative path from u to v via another neighbor w
      let canReachViaOther = false;
      for (const w of neighbors) {
        if (w !== v) {
          if (hasPath(w, v, new Set())) {
            canReachViaOther = true;
            break;
          }
        }
      }
      if (canReachViaOther) {
        reduced.get(u)?.delete(v);
      }
    }
  }

  return reduced;
}

export function computeEdgesOnKept(
  keptIds: string[],
  g0Adj: Map<string, Set<string>>,
  edgeInfo?: Map<
    string,
    { confidence: "RESOLVED" | "INFERRED"; via_entities: string[] }
  >
): GraphEdge[] {
  // Compute reachability in g0 between pairs in keptIds
  function canReach(
    curr: string,
    target: string,
    visited: Set<string>
  ): boolean {
    if (curr === target) {
      return true;
    }
    if (visited.has(curr)) {
      return false;
    }
    visited.add(curr);

    const neighbors = g0Adj.get(curr) ?? new Set();
    for (const next of neighbors) {
      if (canReach(next, target, visited)) {
        return true;
      }
    }
    return false;
  }

  const reachabilityAdj = new Map<string, Set<string>>();
  for (const u of keptIds) {
    reachabilityAdj.set(u, new Set());
  }

  for (const u of keptIds) {
    for (const v of keptIds) {
      if (u !== v && canReach(u, v, new Set())) {
        reachabilityAdj.get(u)?.add(v);
      }
    }
  }

  // Transitive reduction on reachability DAG
  const reducedAdj = transitiveReduction(keptIds, reachabilityAdj);

  const edges: GraphEdge[] = [];
  for (const u of keptIds) {
    const neighbors = Array.from(reducedAdj.get(u) ?? []).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    for (const v of neighbors) {
      const edgeKey = `${u}->${v}`;
      const info = edgeInfo?.get(edgeKey);
      edges.push({
        id: edgeKey,
        source: u,
        target: v,
        confidence: info?.confidence ?? "RESOLVED",
        via_entities: info?.via_entities ?? [],
      });
    }
  }

  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return edges;
}

// Bài có luồng ngắn hơn học trước. Không dùng độ phức tạp của hàm: nó đo code rối, không đo luồng.
export function isEasier(
  a: Pick<Candidate, "trace_steps" | "rank_score" | "id">,
  b: Pick<Candidate, "trace_steps" | "rank_score" | "id">
): boolean {
  if (a.trace_steps.length !== b.trace_steps.length) {
    return a.trace_steps.length < b.trace_steps.length;
  }
  if (a.rank_score !== b.rank_score) {
    return a.rank_score > b.rank_score;
  }
  return a.id < b.id;
}

function isTestPath(filePath: string | undefined): boolean {
  return filePath !== undefined && isTestCandidate({ trace_steps: [{ file_path: filePath }] } as Candidate);
}

/**
 * Đúng 1 node Trọng tâm, là đích của vòng đời: thực thể có nhiều bài nhất ⇒ bài Sửa của chính
 * thực thể đó có luồng dài nhất (`Update Article`). Không có ⇒ bài luồng dài nhất của thực thể,
 * rồi của cả đồ thị. Có node sạch thì chỉ xét node sạch.
 */
export function assignCapstone(
  nodes: HybridArchitecturalNode[],
  dataById: Map<string, Pick<LessonData, "primary_entity" | "entities" | "sub">> = new Map()
): void {
  const clean = nodes.filter((n) => !isTestPath(n.files[0]));
  const pool = clean.length > 0 ? clean : nodes;

  const count = new Map<string, number>();
  for (const n of pool) {
    const entity = dataById.get(n.id)?.primary_entity;
    if (entity) count.set(entity, (count.get(entity) ?? 0) + 1);
  }
  const core = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  const ofCore = pool.filter((n) => core !== undefined && dataById.get(n.id)?.primary_entity === core);
  const isUpdate = (n: HybridArchitecturalNode): boolean =>
    dataById.get(n.id)?.entities.some((e) => e.name === core && e.ops.includes("UPDATE")) ?? false;
  const updates = ofCore.filter(isUpdate);
  // Ưu tiên Sửa chính thực thể (`PUT /articles/:slug`), không có thì Sửa nhánh con (`PUT .../phases/:id`).
  const mainUpdates = updates.filter((n) => (dataById.get(n.id)?.sub ?? "") === "");
  const candidates =
    mainUpdates.length > 0 ? mainUpdates : updates.length > 0 ? updates : ofCore.length > 0 ? ofCore : pool;

  const best = [...candidates].sort(
    (a, b) =>
      b.trace_steps.length - a.trace_steps.length ||
      b.rank_score - a.rank_score ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )[0];
  for (const node of nodes) {
    node.is_capstone = node.id === best?.id;
  }
}

export function assembleGraph(
  candidates: Candidate[],
  ctx: EngineContext,
  _report?: IngestionReport
): { nodes: HybridArchitecturalNode[]; edges: GraphEdge[] } {
  void _report;
  // 1. Bỏ candidate 0 bước
  const nonEmptyCandidates = candidates.filter((c) => c.trace_steps.length > 0);
  if (nonEmptyCandidates.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Bài chỉ có handler thì không có luồng để học: bỏ khi vẫn đủ số bài tối thiểu.
  const multiStepCandidates = nonEmptyCandidates.filter((c) => c.trace_steps.length >= 2);
  const validCandidates =
    multiStepCandidates.length >= CONFIG.DISPLAY_MIN_NODES ? multiStepCandidates : nonEmptyCandidates;

  // Sắp xếp đầu vào theo order_key tất định (ENG-01)
  validCandidates.sort((a, b) =>
    a.order_key < b.order_key ? -1 : a.order_key > b.order_key ? 1 : 0
  );

  // 2. ENG-110 Gộp: cùng tập functions ⇒ giữ order_key nhỏ nhất
  const funcGroups = new Map<string, Candidate>();
  for (const c of validCandidates) {
    const key = [...c.functions].sort().join(",");
    const existing = funcGroups.get(key);
    if (!existing) {
      funcGroups.set(key, c);
    } else {
      if (c.order_key < existing.order_key) {
        funcGroups.set(key, c);
      }
    }
  }

  const mergedCandidates = Array.from(funcGroups.values());

  // 3. ENG-110 Lọc: clean vs test
  const cleanCandidates = mergedCandidates.filter((c) => !isTestCandidate(c));
  let keptCandidates: Candidate[] = [];

  if (cleanCandidates.length >= CONFIG.DISPLAY_MIN_NODES) {
    // Đủ DISPLAY_MIN_NODES candidate sạch ⇒ bỏ mọi candidate mang cờ test
    keptCandidates = cleanCandidates;
  } else if (cleanCandidates.length > 0) {
    // Có candidate sạch nhưng thiếu ⇒ giữ sạch, bù candidate mang cờ cho đủ DISPLAY_MIN_NODES
    keptCandidates = [...cleanCandidates];
    const testCandidates = mergedCandidates.filter((c) => isTestCandidate(c));
    testCandidates.sort((a, b) => {
      if (a.rank_score !== b.rank_score) {
        return b.rank_score - a.rank_score; // rank_score giảm
      }
      if (a.trace_steps.length !== b.trace_steps.length) {
        return b.trace_steps.length - a.trace_steps.length; // luồng dài hơn trước
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // id tăng
    });

    const needed = CONFIG.DISPLAY_MIN_NODES - keptCandidates.length;
    keptCandidates.push(...testCandidates.slice(0, needed));
  } else {
    // Không có candidate sạch ⇒ giữ nguyên
    keptCandidates = mergedCandidates;
  }

  // Sắp xếp danh sách candidate giữ lại theo id để mọi bước tiếp theo đều tất định
  keptCandidates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const keptIds = keptCandidates.map((c) => c.id);

  // 4. Cạnh G0 chỉ từ cặp D-07 (functions giao nhau, chiều bài dễ tới bài khó theo ENG-112)
  const g0Adj = new Map<string, Set<string>>();
  for (const id of keptIds) {
    g0Adj.set(id, new Set());
  }

  for (let i = 0; i < keptCandidates.length; i++) {
    for (let j = i + 1; j < keptCandidates.length; j++) {
      const c1 = keptCandidates[i];
      const c2 = keptCandidates[j];

      // Check non-empty function intersection
      const set1 = new Set(c1.functions);
      const hasIntersection = c2.functions.some((f) => set1.has(f));
      if (hasIntersection) {
        if (isEasier(c1, c2)) {
          g0Adj.get(c1.id)?.add(c2.id);
        } else if (isEasier(c2, c1)) {
          g0Adj.get(c2.id)?.add(c1.id);
        }
      }
    }
  }

  // 5. computeEdgesOnKept
  const edges = computeEdgesOnKept(keptIds, g0Adj);

  // 6. Prerequisites sort
  const prereqMap = new Map<string, string[]>();
  for (const id of keptIds) {
    prereqMap.set(id, []);
  }
  for (const e of edges) {
    prereqMap.get(e.target)?.push(e.source);
  }
  for (const list of prereqMap.values()) {
    list.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  // 8. Dựng các node HybridArchitecturalNode
  const nodes: HybridArchitecturalNode[] = [];

  for (const c of keptCandidates) {
    const filesInSteps: string[] = [];
    const seenFiles = new Set<string>();
    for (const step of c.trace_steps) {
      if (!seenFiles.has(step.file_path)) {
        seenFiles.add(step.file_path);
        filesInSteps.push(step.file_path);
      }
    }

    const languages: LanguageId[] = Array.from(
      new Set(
        filesInSteps.map((f) => ctx.input.file_language.get(f) ?? "TYPESCRIPT")
      )
    ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    let tier: LanguageSupportTier = "RESOLVED";
    for (const f of filesInSteps) {
      const parsed = ctx.files.find((pf) => pf.path === f);
      if (parsed && parsed.tier === "STRUCTURAL") {
        tier = "STRUCTURAL";
        break;
      }
    }

    nodes.push({
      id: c.id,
      title: c.base_title,
      title_source: c.title_source,
      title_evidence: c.title_evidence,
      node_type: c.node_type,
      entry_symbol: c.entry_symbol,
      prerequisites: prereqMap.get(c.id) ?? [],
      position: { x: 0, y: 0 },
      files: filesInSteps,
      languages,
      support_tier: tier,
      cognitive_complexity: c.cognitive_complexity,
      rank_score: c.rank_score,
      is_vip_algorithm: false,
      is_capstone: false,
      uncle_bob: null,
      trace_steps: c.trace_steps,
      dto_snippet: c.dto_snippet,
      group_id: "",
      entities: [],
    });
  }

  assignCapstone(nodes);

  // Dedupe titles
  dedupeTitles(nodes);

  // Nodes sort theo id
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { nodes, edges };
}

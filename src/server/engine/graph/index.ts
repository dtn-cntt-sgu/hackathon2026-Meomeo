import { CONFIG } from "@/contracts";
import type {
  HybridArchitecturalNode,
  IngestOutput,
  IngestionReport,
  StaticEngineResult,
} from "@/contracts";
import { ApiHttpError } from "@/server/errors";
import { buildCallGraph, fileGraph, findEntries } from "./callgraph";
import type { CallGraphResult } from "./callgraph";
import { fillComplexity } from "./complexity";
import { buildDataEdges, buildGroups, readLessonData, toNodeEntities } from "./data-deps";
import type { LessonData } from "./data-deps";
import { layoutGraph } from "./layout";
import { dedupeTitles } from "./naming";
import {
  assembleGraph,
  assignCapstone,
  computeEdgesOnKept,
  isEasier,
  transitiveReduction,
} from "./nodes";
import { rankFiles } from "./pagerank";
import { initParsers, parseAll } from "./parser";
import { buildJavaPackageMap, collectJavaImports, collectJavaSymbols } from "./resolvers/java";
import { buildSlice, findSharedHelpers } from "./slicing";
import { buildJavaCallGraph } from "./spring";
import { collectSymbols, resolveImports } from "./symbols";
import { tarjanScc } from "./tarjan";
import type { Candidate, EngineContext, ParsedFile, SymbolIndex } from "./types";
import { buildSymbolWhitelist } from "./whitelist";

export { tarjanScc } from "./tarjan";
export { pageRank, rankFiles } from "./pagerank";
export { buildDataEdges, buildGroups, readLessonData, toNodeEntities } from "./data-deps";
export type { DataEdge, LessonData } from "./data-deps";
export { layoutGraph } from "./layout";
export { toClientResult } from "./to-client";

// File Java đi qua `buildJavaCallGraph`, các file còn lại qua `buildCallGraph`, rồi gộp kết quả.
function buildMixedCallGraph(files: ParsedFile[], idx: SymbolIndex): CallGraphResult {
  const javaFiles = files.filter((f) => f.language === "JAVA");
  const scriptGraph = buildCallGraph(
    files.filter((f) => f.language !== "JAVA"),
    idx
  );
  if (javaFiles.length === 0) {
    return scriptGraph;
  }

  const packages = buildJavaPackageMap(javaFiles);
  for (const file of javaFiles) {
    try {
      collectJavaSymbols(file, { idx });
      collectJavaImports(file, javaFiles, idx, packages);
    } catch {
      continue;
    }
  }

  const javaGraph = buildJavaCallGraph(javaFiles, idx);
  return {
    edges: [...scriptGraph.edges, ...javaGraph.edges],
    functions: idx.functions,
    external_calls: new Map([...scriptGraph.external_calls, ...javaGraph.external_calls]),
    bindings: [...scriptGraph.bindings, ...javaGraph.bindings],
    call_sites: new Map([...scriptGraph.call_sites, ...javaGraph.call_sites]),
  };
}

/**
 * buildGraph: Điểm nhập Tầng 1–2 của SimpliFey.
 * Luồng xử lý:
 * 1. parseAll
 * 2. collectSymbols + resolveImports
 * 3. buildCallGraph + findEntries + rankFiles + fillComplexity
 * 4. EngineContext + findSharedHelpers + buildSlice + assembleGraph
 * 5. G0: readLessonData + buildDataEdges + edges D-07 + khử chu trình bằng tarjanScc
 * 6. Display Budget (ENG-114, D-88)
 * 7. computeEdgesOnKept, prerequisites, toNodeEntities, assignCapstone, dedupeTitles, buildGroups, layoutGraph
 * 8. throw ERR_NO_ARCHITECTURAL_SLICE nếu không còn node
 * 9. symbol_whitelist, file_index, ingestion_report, engine_ms
 */
export async function buildGraph(input: IngestOutput): Promise<StaticEngineResult> {
  // ENG-11: nạp grammar lần đầu không tính vào engine_ms.
  await initParsers();
  const t0 = performance.now();

  const report: IngestionReport = {
    ...input.report,
    skipped: { ...input.report.skipped },
    warnings: [...input.report.warnings],
    suspicious_instruction_files: [...input.report.suspicious_instruction_files],
  };

  // 1. Phân tích cú pháp mọi file
  const files = await parseAll(input.code, input.file_language, report);

  // 2. Danh bạ tên và giải quyết import
  const idx = collectSymbols(files);
  resolveImports(
    files,
    idx,
    input.manifests,
    input.module_info,
    input.fingerprint.root_dir_offset
  );

  // 3. Đồ thị gọi hàm, điểm entry, xếp hạng file và độ phức tạp
  const graph = buildMixedCallGraph(files, idx);
  const entries = findEntries(
    files,
    idx,
    graph,
    input.fingerprint.root_dir_offset,
    report
  );

  const ingressFiles = new Set<string>();
  for (const entry of entries) {
    if (entry.source === "REGISTERED" || entry.source === "GENERIC") {
      const filePath = entry.key.split("#")[0];
      if (filePath) {
        ingressFiles.add(filePath);
      }
    }
  }

  const fg = fileGraph(graph.edges);
  const fileRank = rankFiles(fg, ingressFiles, report);
  fillComplexity(files, idx.functions);

  // 4. Ngữ cảnh engine và tạo lát cắt
  const ctx: EngineContext = {
    input,
    files,
    index: idx,
    call_edges: graph.edges,
    call_sites: graph.call_sites,
    external_calls: graph.external_calls,
    bindings: graph.bindings,
    file_rank: fileRank,
  };

  const helpers = findSharedHelpers(entries, ctx);
  const candidates: Candidate[] = [];
  for (const entry of entries) {
    candidates.push(buildSlice(entry, ctx, helpers));
  }

  if (candidates.length === 0) {
    throw new ApiHttpError("ERR_NO_ARCHITECTURAL_SLICE");
  }

  const initialGraph = assembleGraph(candidates, ctx, report);
  if (initialGraph.nodes.length === 0) {
    throw new ApiHttpError("ERR_NO_ARCHITECTURAL_SLICE");
  }

  // 5. Cạnh G0: dữ liệu từ route + D-07 + khử chu trình
  const nodeMap = new Map<string, HybridArchitecturalNode>();
  for (const n of initialGraph.nodes) {
    nodeMap.set(n.id, n);
  }

  const candidateMap = new Map<string, Candidate>();
  for (const c of candidates) {
    candidateMap.set(c.id, c);
  }

  const lessonDataList = initialGraph.nodes.map((n) => {
    const cand = candidateMap.get(n.id);
    return cand ? readLessonData(cand, ctx) : readLessonData(n, ctx);
  });
  const dataById = new Map<string, LessonData>(
    lessonDataList.map((ld) => [ld.node_id, ld])
  );

  const isEasierById = (aId: string, bId: string): boolean => {
    const aNode = nodeMap.get(aId);
    const bNode = nodeMap.get(bId);
    if (!aNode || !bNode) {
      return aId < bId;
    }
    return isEasier(aNode, bNode);
  };

  const foreignKeys = new Map<string, string[]>();
  const dataEdgesMap = buildDataEdges(lessonDataList, foreignKeys, isEasierById);

  const nodesWithDataEdges = new Set<string>();
  for (const de of dataEdgesMap.values()) {
    nodesWithDataEdges.add(de.source);
    nodesWithDataEdges.add(de.target);
  }

  const g0Edges = new Map<
    string,
    {
      source: string;
      target: string;
      confidence: "RESOLVED" | "INFERRED";
      via_entities: string[];
    }
  >();

  for (const de of dataEdgesMap.values()) {
    const edgeKey = `${de.source}->${de.target}`;
    g0Edges.set(edgeKey, {
      source: de.source,
      target: de.target,
      confidence: "RESOLVED",
      via_entities: [...de.via_entities],
    });
  }

  // Thêm cạnh D-07 cho bài chưa có cạnh dữ liệu (ENG-118 bước 3)
  for (const e of initialGraph.edges) {
    if (!nodesWithDataEdges.has(e.source) || !nodesWithDataEdges.has(e.target)) {
      const edgeKey = `${e.source}->${e.target}`;
      if (!g0Edges.has(edgeKey)) {
        g0Edges.set(edgeKey, {
          source: e.source,
          target: e.target,
          confidence: e.confidence,
          via_entities: [...(e.via_entities ?? [])],
        });
      }
    }
  }

  // Khử chu trình: tarjanScc trên G0, trong SCC > 1 đỉnh bỏ cạnh từ bài khó tới bài dễ
  const allNodeIds = initialGraph.nodes.map((n) => n.id);

  while (true) {
    const adj = new Map<string, string[]>();
    for (const id of allNodeIds) {
      adj.set(id, []);
    }
    for (const e of g0Edges.values()) {
      adj.get(e.source)?.push(e.target);
    }

    const sccs = tarjanScc(allNodeIds, adj);
    const cycleSccs = sccs.filter((s) => s.length > 1);
    if (cycleSccs.length === 0) {
      break;
    }

    let removedAny = false;
    for (const scc of cycleSccs) {
      const sccSet = new Set(scc);
      for (const [edgeKey, e] of Array.from(g0Edges.entries())) {
        if (sccSet.has(e.source) && sccSet.has(e.target)) {
          if (isEasierById(e.target, e.source)) {
            g0Edges.delete(edgeKey);
            removedAny = true;
          }
        }
      }
    }

    if (!removedAny) {
      for (const scc of cycleSccs) {
        const sccSet = new Set(scc);
        for (const [edgeKey, e] of Array.from(g0Edges.entries())) {
          if (sccSet.has(e.source) && sccSet.has(e.target)) {
            g0Edges.delete(edgeKey);
            removedAny = true;
            break;
          }
        }
        if (removedAny) {
          break;
        }
      }
    }
  }

  // 6. Display Budget (ENG-114, D-88)
  let keptNodes: HybridArchitecturalNode[];

  if (initialGraph.nodes.length <= CONFIG.DISPLAY_MAX_NODES) {
    keptNodes = [...initialGraph.nodes];
    report.omitted_node_count = 0;
  } else {
    // Rút gọn bắc cầu G0 ⇒ G0r
    const g0Adj = new Map<string, Set<string>>();
    for (const id of allNodeIds) {
      g0Adj.set(id, new Set());
    }
    for (const e of g0Edges.values()) {
      g0Adj.get(e.source)?.add(e.target);
    }
    const g0rAdj = transitiveReduction(allNodeIds, g0Adj);

    // Tìm đường dài nhất trên G0r (DP theo thứ tự Kahn)
    const indegree = new Map<string, number>();
    const children = new Map<string, string[]>();
    const parents = new Map<string, string[]>();
    for (const id of allNodeIds) {
      indegree.set(id, 0);
      children.set(id, []);
      parents.set(id, []);
    }
    for (const [u, targets] of g0rAdj.entries()) {
      for (const v of targets) {
        children.get(u)?.push(v);
        parents.get(v)?.push(u);
        indegree.set(v, (indegree.get(v) ?? 0) + 1);
      }
    }

    const ready = allNodeIds.filter((id) => indegree.get(id) === 0).sort();
    const order: string[] = [];
    while (ready.length > 0) {
      const id = ready.shift()!;
      order.push(id);
      for (const ch of children.get(id) ?? []) {
        const left = (indegree.get(ch) ?? 1) - 1;
        indegree.set(ch, left);
        if (left === 0) {
          ready.push(ch);
          ready.sort();
        }
      }
    }

    const length = new Map<string, number>();
    const prev = new Map<string, string | null>();
    for (const id of order) {
      let bestP: string | null = null;
      for (const p of parents.get(id) ?? []) {
        if (!length.has(p)) continue;
        const lenP = length.get(p)!;
        const lenBest = bestP !== null ? length.get(bestP)! : -1;
        if (lenP > lenBest) {
          bestP = p;
        } else if (lenP === lenBest && bestP !== null) {
          const pNode = nodeMap.get(p);
          const bNode = nodeMap.get(bestP);
          const pRank = pNode?.rank_score ?? 0;
          const bRank = bNode?.rank_score ?? 0;
          if (pRank > bRank || (pRank === bRank && p < bestP)) {
            bestP = p;
          }
        }
      }
      length.set(id, bestP === null ? 1 : length.get(bestP)! + 1);
      prev.set(id, bestP);
    }

    let end: string | null = null;
    for (const id of order) {
      const lenId = length.get(id)!;
      const lenEnd = end !== null ? length.get(end)! : -1;
      if (lenId > lenEnd) {
        end = id;
      } else if (lenId === lenEnd && end !== null) {
        const idNode = nodeMap.get(id);
        const endNode = nodeMap.get(end);
        const idRank = idNode?.rank_score ?? 0;
        const endRank = endNode?.rank_score ?? 0;
        if (idRank > endRank || (idRank === endRank && id < end)) {
          end = id;
        }
      }
    }

    const criticalPath: string[] = [];
    for (let cur = end; cur !== null; cur = prev.get(cur) ?? null) {
      criticalPath.unshift(cur);
    }

    const keptIdsSet = new Set<string>(
      criticalPath.slice(0, CONFIG.CRITICAL_PATH_MAX_NODES)
    );

    // Bổ sung node theo D-88 và ENG-114 ý (2)
    const remainingNodes = initialGraph.nodes.filter(
      (n) => !keptIdsSet.has(n.id)
    );

    const compareForDisplay = (
      a: HybridArchitecturalNode,
      b: HybridArchitecturalNode
    ): number => {
      // Chỉ xét luồng: file quan trọng hơn trước, rồi luồng dài hơn. Không ưu tiên hàm phức tạp.
      if (a.rank_score !== b.rank_score) {
        return b.rank_score - a.rank_score;
      }
      if (a.trace_steps.length !== b.trace_steps.length) {
        return b.trace_steps.length - a.trace_steps.length;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    };

    const apiNodes: HybridArchitecturalNode[] = [];
    const otherNodes: HybridArchitecturalNode[] = [];

    for (const n of remainingNodes) {
      const c = candidateMap.get(n.id);
      if (
        c?.binding?.kind === "HTTP" ||
        /^(GET|POST|PUT|PATCH|DELETE)\s/i.test(n.title_evidence)
      ) {
        apiNodes.push(n);
      } else {
        otherNodes.push(n);
      }
    }

    apiNodes.sort(compareForDisplay);
    otherNodes.sort(compareForDisplay);

    while (keptIdsSet.size < CONFIG.DISPLAY_MAX_NODES) {
      const next = apiNodes.shift() ?? otherNodes.shift();
      if (!next) {
        break;
      }
      keptIdsSet.add(next.id);
    }

    report.omitted_node_count = initialGraph.nodes.length - keptIdsSet.size;
    report.warnings.push(
      `${report.omitted_node_count} luồng khác không hiển thị trên bản đồ`
    );

    keptNodes = initialGraph.nodes.filter((n) => keptIdsSet.has(n.id));
  }

  if (keptNodes.length === 0) {
    throw new ApiHttpError("ERR_NO_ARCHITECTURAL_SLICE");
  }

  // 7. Hoàn thiện cạnh, nhóm và layout
  const keptIds = keptNodes
    .map((n) => n.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const g0Adj = new Map<string, Set<string>>();
  for (const id of allNodeIds) {
    g0Adj.set(id, new Set());
  }
  for (const e of g0Edges.values()) {
    g0Adj.get(e.source)?.add(e.target);
  }

  const edgeInfo = new Map<
    string,
    { confidence: "RESOLVED" | "INFERRED"; via_entities: string[] }
  >();
  for (const [key, e] of g0Edges.entries()) {
    edgeInfo.set(key, {
      confidence: e.confidence,
      via_entities: e.via_entities,
    });
  }

  const edges = computeEdgesOnKept(keptIds, g0Adj, edgeInfo);

  for (const n of keptNodes) {
    const prereqs = edges
      .filter((e) => e.target === n.id)
      .map((e) => e.source);
    prereqs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    n.prerequisites = prereqs;
  }

  for (const n of keptNodes) {
    const ld = dataById.get(n.id);
    n.entities = ld ? toNodeEntities(ld) : [];
  }

  assignCapstone(keptNodes, dataById);
  dedupeTitles(keptNodes);
  const groups = buildGroups(keptNodes, edges, dataById);
  layoutGraph(keptNodes, edges);

  keptNodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 9. Symbol whitelist, file_index, report
  const finalStepFunctionsSet = new Set<string>();
  for (const n of keptNodes) {
    const c = candidateMap.get(n.id);
    if (c) {
      for (const fn of c.functions) {
        finalStepFunctionsSet.add(fn);
      }
    }
  }
  const symbol_whitelist = buildSymbolWhitelist(
    idx,
    Array.from(finalStepFunctionsSet).sort()
  );

  const file_index = files
    .map((f) => f.path)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  report.degraded_mode = null;
  report.code_file_count = report.code_file_count || files.length;
  report.engine_ms = Math.round(performance.now() - t0);
  if (report.engine_ms > CONFIG.ENGINE_BUDGET_MS) {
    report.warnings.push("Thời gian phân tích đồ thị vượt ngân sách dự kiến");
  }

  return {
    engine_version: CONFIG.ENGINE_VERSION,
    repo_name: input.repo_name,
    snapshot: input.snapshot,
    fingerprint: input.fingerprint,
    total_files: report.code_file_count,
    nodes: keptNodes,
    edges,
    groups,
    symbol_whitelist,
    file_index,
    readme_excerpt: input.readme_excerpt,
    manifest_description: input.manifest_description,
    ingestion_report: report,
  };
}

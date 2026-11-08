import { CONFIG } from "@/contracts";
import type { IngestionReport } from "@/contracts";
import { tarjanScc } from "./tarjan";

/**
 * ENG-62: PageRank trên DAG.
 * - N = 1 ⇒ 1.
 * - PR_{k+1}(u) = (1 - d)/N + d * (sum_{v -> u} PR_k(v) / L(v) + (1/N) * sum_{L(w)=0} PR_k(w))
 * - Tối đa CONFIG.PAGERANK_MAX_ITER vòng.
 * - Dừng khi sum |PR_{k+1} - PR_k| < CONFIG.PAGERANK_TOLERANCE.
 */
export function pageRank(dag: Map<string, Iterable<string>>): Map<string, number> {
  const allNodesSet = new Set<string>();
  for (const [u, targets] of dag.entries()) {
    allNodesSet.add(u);
    for (const v of targets) {
      allNodesSet.add(v);
    }
  }

  const nodes = Array.from(allNodesSet).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  const N = nodes.length;
  if (N === 0) {
    return new Map();
  }
  if (N === 1) {
    return new Map([[nodes[0], 1]]);
  }

  const outNeighbors = new Map<string, string[]>();
  const inNeighbors = new Map<string, string[]>();
  for (const u of nodes) {
    outNeighbors.set(u, []);
    inNeighbors.set(u, []);
  }

  for (const [u, targets] of dag.entries()) {
    const uniqueTargets = Array.from(new Set(targets)).filter((v) => v !== u);
    for (const v of uniqueTargets) {
      if (outNeighbors.has(u) && inNeighbors.has(v)) {
        outNeighbors.get(u)!.push(v);
        inNeighbors.get(v)!.push(u);
      }
    }
  }

  let pr = new Map<string, number>();
  for (const u of nodes) {
    pr.set(u, 1 / N);
  }

  const d = CONFIG.PAGERANK_DAMPING;
  const base = (1 - d) / N;

  for (let iter = 0; iter < CONFIG.PAGERANK_MAX_ITER; iter++) {
    // Tổng PR của các đỉnh chìm (L(w) = 0)
    let sinkSum = 0;
    for (const u of nodes) {
      if (outNeighbors.get(u)!.length === 0) {
        sinkSum += pr.get(u)!;
      }
    }

    const nextPr = new Map<string, number>();
    let diff = 0;

    for (const u of nodes) {
      let inSum = 0;
      for (const v of inNeighbors.get(u)!) {
        const lv = outNeighbors.get(v)!.length;
        inSum += pr.get(v)! / lv;
      }

      const val = base + d * (inSum + (1 / N) * sinkSum);
      nextPr.set(u, val);
      diff += Math.abs(val - pr.get(u)!);
    }

    pr = nextPr;
    if (diff < CONFIG.PAGERANK_TOLERANCE) {
      break;
    }
  }

  return pr;
}

/**
 * Xếp hạng file theo đồ thị file:
 * - Tarjan co SCC
 * - Xử lý SCC khổng lồ (> CONFIG.GIANT_SCC_RATIO * số file): bỏ cạnh nội bộ weight nhỏ nhất
 *   (hòa ⇒ (source, target) nhỏ nhất), tối đa CONFIG.GIANT_SCC_MAX_WEAK_EDGE_REMOVALS lần
 * - PageRank trên DAG co cụm
 * - File nhận điểm của SCC chứa nó
 * - Cộng CONFIG.INGRESS_BONUS nếu là ingress file (D-09)
 * - File không có cạnh cũng có điểm
 */
export function rankFiles(
  fg: Map<string, Map<string, { weight: number; confidence: "RESOLVED" | "INFERRED" }>>,
  ingressFiles: Set<string>,
  report?: IngestionReport
): Map<string, number> {
  // 1. Thu thập mọi file
  const allFilesSet = new Set<string>();
  for (const [src, targets] of fg.entries()) {
    allFilesSet.add(src);
    for (const tgt of targets.keys()) {
      allFilesSet.add(tgt);
    }
  }
  for (const f of ingressFiles) {
    allFilesSet.add(f);
  }

  const allFiles = Array.from(allFilesSet).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  const M = allFiles.length;
  if (M === 0) {
    return new Map();
  }

  // Bản sao các cạnh làm việc
  const workingEdges = new Map<string, Map<string, number>>();
  for (const f of allFiles) {
    workingEdges.set(f, new Map());
  }
  for (const [src, targets] of fg.entries()) {
    for (const [tgt, info] of targets.entries()) {
      if (src !== tgt) {
        workingEdges.get(src)?.set(tgt, info.weight);
      }
    }
  }

  // 2. Kiểm tra và xử lý SCC khổng lồ
  let removals = 0;
  let currentSccs: string[][] = [];

  while (true) {
    const adj = new Map<string, string[]>();
    for (const f of allFiles) {
      adj.set(f, Array.from(workingEdges.get(f)?.keys() ?? []));
    }

    currentSccs = tarjanScc(allFiles, adj);

    // Tìm SCC lớn nhất
    let maxScc: string[] = [];
    for (const scc of currentSccs) {
      if (scc.length > maxScc.length) {
        maxScc = scc;
      }
    }

    const isGiant = maxScc.length > CONFIG.GIANT_SCC_RATIO * M;
    if (!isGiant || removals >= CONFIG.GIANT_SCC_MAX_WEAK_EDGE_REMOVALS) {
      if (isGiant && report) {
        report.warnings.push(
          `Phát hiện cụm phụ thuộc vòng lớn (${maxScc.length} file)`
        );
      }
      break;
    }

    // Tìm cạnh nội bộ trong maxScc có weight nhỏ nhất (hòa ⇒ (source, target) nhỏ nhất)
    const maxSccSet = new Set(maxScc);
    let bestEdge: { src: string; tgt: string; weight: number } | null = null;

    for (const u of maxScc) {
      const targets = workingEdges.get(u);
      if (!targets) continue;
      for (const [v, w] of targets.entries()) {
        if (maxSccSet.has(v)) {
          if (
            bestEdge === null ||
            w < bestEdge.weight ||
            (w === bestEdge.weight &&
              (u < bestEdge.src || (u === bestEdge.src && v < bestEdge.tgt)))
          ) {
            bestEdge = { src: u, tgt: v, weight: w };
          }
        }
      }
    }

    if (!bestEdge) {
      if (isGiant && report) {
        report.warnings.push(
          `Phát hiện cụm phụ thuộc vòng lớn (${maxScc.length} file)`
        );
      }
      break;
    }

    // Bỏ cạnh nội bộ
    workingEdges.get(bestEdge.src)?.delete(bestEdge.tgt);
    removals++;
  }

  // 3. Co SCC thành DAG
  const fileToSccIdx = new Map<string, number>();
  for (let i = 0; i < currentSccs.length; i++) {
    for (const file of currentSccs[i]) {
      fileToSccIdx.set(file, i);
    }
  }

  const condensedDag = new Map<string, Set<string>>();
  for (let i = 0; i < currentSccs.length; i++) {
    condensedDag.set(String(i), new Set());
  }

  for (const src of allFiles) {
    const srcScc = fileToSccIdx.get(src)!;
    const targets = workingEdges.get(src);
    if (!targets) continue;
    for (const tgt of targets.keys()) {
      const tgtScc = fileToSccIdx.get(tgt)!;
      if (srcScc !== tgtScc) {
        condensedDag.get(String(srcScc))!.add(String(tgtScc));
      }
    }
  }

  // 4. PageRank trên DAG co cụm
  const prMap = pageRank(condensedDag);

  // 5. Gán rank_score cho từng file: PR(f) + INGRESS_BONUS nếu là ingress file
  const rankScores = new Map<string, number>();
  for (const file of allFiles) {
    const sccIdx = fileToSccIdx.get(file)!;
    const prScore = prMap.get(String(sccIdx)) ?? 0;
    const isIngress = ingressFiles.has(file);
    const score = prScore + (isIngress ? CONFIG.INGRESS_BONUS : 0);
    rankScores.set(file, score);
  }

  return rankScores;
}

import { CONFIG } from "@/contracts";
import type { GraphEdge, HybridArchitecturalNode } from "@/contracts";

/**
 * ENG-114, Mục 14: Bố cục đồ thị.
 * - Không dùng Dagre
 * - Tầng tô-pô (Kahn, có visited): node có cạnh, không có prerequisites ở tầng 0
 * - y = tầng * (CONFIG.NODE_BOX_HEIGHT + CONFIG.DAGRE_RANKSEP)
 * - x = chỉ số trong tầng theo id * (CONFIG.NODE_BOX_WIDTH + CONFIG.DAGRE_NODESEP)
 * - Node không có cạnh theo Mục 14 ý 4 (cột bên phải)
 * - Mọi điểm bắt đầu cùng y nhỏ nhất (D-55)
 * - Làm tròn số nguyên
 */
export function layoutGraph(
  nodes: HybridArchitecturalNode[],
  edges: GraphEdge[]
): void {
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }

  const connectedNodes = nodes.filter((n) => connectedIds.has(n.id));
  const standaloneNodes = nodes.filter((n) => !connectedIds.has(n.id));

  const inDegree = new Map<string, number>();
  const outMap = new Map<string, string[]>();
  for (const n of connectedNodes) {
    inDegree.set(n.id, 0);
    outMap.set(n.id, []);
  }

  for (const e of edges) {
    if (inDegree.has(e.target) && outMap.has(e.source)) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
      outMap.get(e.source)!.push(e.target);
    }
  }

  // Tầng tô-pô Kahn có visited
  const layerMap = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const n of connectedNodes) {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      layerMap.set(n.id, 0);
      queue.push(n.id);
    }
  }
  queue.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  while (queue.length > 0) {
    const u = queue.shift()!;
    if (visited.has(u)) {
      continue;
    }
    visited.add(u);

    const uLayer = layerMap.get(u) ?? 0;
    const children = (outMap.get(u) ?? []).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );

    for (const v of children) {
      const vLayer = Math.max(layerMap.get(v) ?? 0, uLayer + 1);
      layerMap.set(v, vLayer);

      const deg = (inDegree.get(v) ?? 1) - 1;
      inDegree.set(v, deg);
      if (deg === 0 && !visited.has(v)) {
        queue.push(v);
        queue.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      }
    }
  }

  for (const n of connectedNodes) {
    if (!layerMap.has(n.id)) {
      layerMap.set(n.id, 0);
    }
  }

  const nodesByLayer = new Map<number, HybridArchitecturalNode[]>();
  for (const n of connectedNodes) {
    const layer = layerMap.get(n.id) ?? 0;
    let list = nodesByLayer.get(layer);
    if (!list) {
      list = [];
      nodesByLayer.set(layer, list);
    }
    list.push(n);
  }

  for (const [layer, list] of nodesByLayer.entries()) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (let idx = 0; idx < list.length; idx++) {
      const n = list[idx];
      n.position = {
        x: Math.round(idx * (CONFIG.NODE_BOX_WIDTH + CONFIG.DAGRE_NODESEP)),
        y: Math.round(layer * (CONFIG.NODE_BOX_HEIGHT + CONFIG.DAGRE_RANKSEP)),
      };
    }
  }

  // Node không có cạnh (Mục 14 ý 4, cột bên phải)
  const hasGraph = connectedNodes.length > 0;
  const columnX = hasGraph
    ? Math.max(...connectedNodes.map((n) => n.position.x)) +
      CONFIG.NODE_BOX_WIDTH +
      CONFIG.DAGRE_NODESEP
    : 0;
  const Y = hasGraph ? Math.min(...connectedNodes.map((n) => n.position.y)) : 0;

  standaloneNodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 0; i < standaloneNodes.length; i++) {
    const n = standaloneNodes[i];
    n.position = {
      x: Math.round(columnX),
      y: Math.round(Y + i * (CONFIG.NODE_BOX_HEIGHT + CONFIG.DAGRE_NODESEP)),
    };
  }
}

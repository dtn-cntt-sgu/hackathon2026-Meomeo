import { CONFIG } from "@/contracts/config";
import type {
  GraphSkeletonNode,
  NodeStateView,
  RepoOverviewView,
} from "@/contracts";

export type NodeProgressRow = {
  node_id: string;
  status: "AVAILABLE" | "COMPLETED" | "FAILED" | null;
  analysis_failed: boolean;
};

export type DerivedNodeState = Pick<
  NodeStateView,
  "node_id" | "status" | "has_warning" | "analysis_failed"
>;

export function deriveNodeStates(
  skeleton: GraphSkeletonNode[],
  progressRows: NodeProgressRow[]
): Record<string, DerivedNodeState> {
  const nodeMap = new Map<string, GraphSkeletonNode>();
  for (const node of skeleton) {
    nodeMap.set(node.node_id, node);
  }

  const progressMap = new Map<string, NodeProgressRow>();
  for (const row of progressRows) {
    progressMap.set(row.node_id, row);
  }

  // Lọc prerequisites chỉ giữ node có trong skeleton
  const validPrereqs = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const node of skeleton) {
    const prereqs = node.prerequisites.filter((pId) => nodeMap.has(pId));
    validPrereqs.set(node.node_id, prereqs);
    inDegree.set(node.node_id, prereqs.length);
    dependents.set(node.node_id, []);
  }

  for (const node of skeleton) {
    const prereqs = validPrereqs.get(node.node_id) ?? [];
    for (const pId of prereqs) {
      dependents.get(pId)?.push(node.node_id);
    }
  }

  // Kahn's algorithm: queue ưu tiên theo node_id tăng dần
  const ready: string[] = [];
  for (const node of skeleton) {
    if ((inDegree.get(node.node_id) ?? 0) === 0) {
      ready.push(node.node_id);
    }
  }
  ready.sort((a, b) => a.localeCompare(b));

  const topoOrder: string[] = [];
  while (ready.length > 0) {
    const currentId = ready.shift()!;
    topoOrder.push(currentId);

    const children = dependents.get(currentId) ?? [];
    for (const childId of children) {
      const deg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, deg);
      if (deg === 0) {
        ready.push(childId);
        ready.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  // Nếu có chu trình: node còn lại đưa vào topoOrder theo node_id tăng dần
  if (topoOrder.length < skeleton.length) {
    const visited = new Set(topoOrder);
    const remaining = skeleton
      .map((n) => n.node_id)
      .filter((id) => !visited.has(id))
      .sort((a, b) => a.localeCompare(b));
    topoOrder.push(...remaining);
  }

  const derived: Record<string, DerivedNodeState> = {};

  for (const nodeId of topoOrder) {
    const row = progressMap.get(nodeId);
    const analysisFailed = row?.analysis_failed ?? false;
    const prereqs = validPrereqs.get(nodeId) ?? [];

    let allParentsPassed = true;
    let hasFailedOrAnalysisFailedParent = false;

    for (const pId of prereqs) {
      const pState = derived[pId];
      if (!pState) {
        // Node cha chưa tính do chu trình
        allParentsPassed = false;
        continue;
      }
      const parentPassed =
        pState.status === "COMPLETED" ||
        pState.status === "FAILED" ||
        (pState.status === "AVAILABLE" && pState.analysis_failed);

      if (!parentPassed) {
        allParentsPassed = false;
      }

      if (
        pState.status === "FAILED" ||
        (pState.status === "AVAILABLE" && pState.analysis_failed)
      ) {
        hasFailedOrAnalysisFailedParent = true;
      }
    }

    let status: "AVAILABLE" | "COMPLETED" | "FAILED" | "LOCKED";
    if (row && row.status !== null) {
      status = row.status;
    } else {
      status = allParentsPassed ? "AVAILABLE" : "LOCKED";
    }

    const hasWarning = status !== "LOCKED" && hasFailedOrAnalysisFailedParent;

    derived[nodeId] = {
      node_id: nodeId,
      status,
      has_warning: hasWarning,
      analysis_failed: analysisFailed,
    };
  }

  return derived;
}

// Tên bài tiếng Việt do AI tổng quan đặt (đã qua kiểm ở server); chưa có ⇒ null, dùng tên tất định.
export function aiTitleOf(nodeId: string, overview: RepoOverviewView | null): string | null {
  return overview?.ai?.node_titles[nodeId] ?? null;
}

export function displayTitle(
  node: { id: string; title: string; title_source: string },
  overview: RepoOverviewView | null
): string {
  const aiTitle = aiTitleOf(node.id, overview);
  const rawTitle = aiTitle ?? node.title;
  const inferredSources = new Set(["DOMAIN_TERMS", "DIRECTORY", "FILE_BASENAME"]);
  // "~" chỉ đánh dấu tên tất định đoán từ thư mục/tên file; tên AI đã đọc cả luồng ⇒ không cần
  const titleWithPrefix = aiTitle === null && inferredSources.has(node.title_source)
    ? `~${rawTitle}`
    : rawTitle;

  const chars = [...titleWithPrefix];
  if (chars.length > CONFIG.TITLE_MAX_CHARS) {
    return `${chars.slice(0, CONFIG.TITLE_MAX_CHARS - 1).join("")}…`;
  }
  return titleWithPrefix;
}

import type { ClientStaticEngineResult, RepoOverviewView, SessionProgress } from "@/contracts";
import { displayTitle } from "@/lib/derive";
import { lessonGroups, mainPathOf, nodeStatesOf } from "@/lib/lesson-map";

// Tổng quan nhịp 1 (docs/spec/30_UI.md Mục 6.3, D-71, D-83): mọi thứ dựng từ `result` ở client, 0 API, 0 token.
// Nhịp 2 (AI tổng quan) chạy nền sau ingest: có `overview.ai` ⇒ dùng đoạn tóm tắt AI, chưa có ⇒ câu dự phòng.

/** Phần của `result` mà Tổng quan cần; `ClientStaticEngineResult` đầy đủ truyền vào đều được. */
export type OverviewResult = Pick<
  ClientStaticEngineResult,
  "repo_name" | "fingerprint" | "nodes" | "edges" | "groups"
>;

/** Cùng hình dạng với `RepoOverviewView["facts"]` để khớp với `overview` do bundle Offline mang sẵn. */
export interface OverviewFacts {
  archetype: RepoOverviewView["facts"]["archetype"];
  framework: string | null;
  tech_stack: string[];
  root_node_ids: string[];
  main_path_node_ids: string[];
}

/** Một thẻ nhóm của Tổng quan (`.gcard`): tên nhóm + tên các bài. */
export interface OverviewGroupView {
  group_id: string;
  name: string;
  key_kind: ClientStaticEngineResult["groups"][number]["key_kind"];
  node_ids: string[];
  /** Tên hiển thị của từng bài, cùng thứ tự `node_ids`. */
  titles: string[];
  /** Nhóm chứa bài đầu của đường chính ⇒ "★ Nên học trước". */
  recommended: boolean;
}

type OverviewSlot = RepoOverviewView | "PENDING" | null;

/** Tính `facts` trên client: vân tay của engine + bài gốc + đường chính (ENG-155, hàm thuần). */
export function buildOverviewFacts(result: OverviewResult): OverviewFacts {
  return {
    archetype: result.fingerprint.archetype,
    framework: result.fingerprint.detected_framework,
    tech_stack: [...result.fingerprint.tech_stack],
    root_node_ids: result.nodes.filter((n) => n.prerequisites.length === 0).map((n) => n.id),
    main_path_node_ids: mainPathOf(result.nodes, result.edges),
  };
}

/** Tên bài để hiện: cùng cách đặt tên với bản đồ bài học; không có bài ⇒ trả lại `nodeId`. */
export function overviewNodeTitle(result: OverviewResult, overview: OverviewSlot, nodeId: string): string {
  const node = result.nodes.find((n) => n.id === nodeId);
  return node ? displayTitle(node, overview === "PENDING" ? null : overview) : nodeId;
}

/** Thẻ nhóm theo thứ tự `result.groups` (D-84), mỗi thẻ kèm tên các bài. */
export function overviewGroups(result: OverviewResult, overview: OverviewSlot): OverviewGroupView[] {
  return lessonGroups(result, overview).map((g) => ({
    ...g,
    titles: g.node_ids.map((id) => overviewNodeTitle(result, overview, id)),
  }));
}

/** Câu dự phòng khi chưa có AI: "{repo_name}{ dùng {framework}} có {n} bài, chia thành {m} nhóm." */
export function overviewFallback(result: OverviewResult, facts: OverviewFacts = buildOverviewFacts(result)): string {
  const framework = facts.framework ? ` dùng ${facts.framework}` : "";
  return `${result.repo_name}${framework} có ${result.nodes.length} bài, chia thành ${result.groups.length} nhóm.`;
}

/** Đoạn mở đầu của Tổng quan: tóm tắt AI nếu đã có, không thì câu dự phòng. */
export function overviewLead(result: OverviewResult, overview: OverviewSlot, facts?: OverviewFacts): string {
  const summary = overview && overview !== "PENDING" ? overview.ai?.summary : undefined;
  return summary ? summary : overviewFallback(result, facts);
}

/**
 * Bài mà nút "Bắt đầu với: …" mở: bài đầu của đường chính; rỗng (hoặc bị khóa, không nên xảy ra)
 * ⇒ bài `AVAILABLE` đầu tiên theo `result.groups`; không có ⇒ `null`.
 */
export function startNodeId(
  result: Pick<ClientStaticEngineResult, "nodes" | "edges" | "groups">,
  progress: SessionProgress | null,
): string | null {
  const states = nodeStatesOf(result.nodes, progress);
  const first = mainPathOf(result.nodes, result.edges)[0];
  if (first !== undefined && states[first]?.status !== "LOCKED") return first;
  for (const group of result.groups) {
    const id = group.node_ids.find((nodeId) => states[nodeId]?.status === "AVAILABLE");
    if (id !== undefined) return id;
  }
  return null;
}

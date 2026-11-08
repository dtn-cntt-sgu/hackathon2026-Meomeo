import type {
  EntityOp,
  GraphEdge,
  HybridArchitecturalNode,
  StaticEngineResult,
} from "@/contracts";
import {
  ACTION_SEGMENTS,
  slug,
  staticRouteSegments,
  toSingular,
  toTitleCase,
} from "./naming";
import type { Candidate, EngineContext, RouteBinding } from "./types";

export interface LessonData {
  node_id: string;
  entities: Array<{ name: string; ops: EntityOp[] }>;
  primary_entity: string | null;
  // `POST /articles` tạo thẳng thực thể, khác `POST /articles/:slug/comments` tạo đồ con.
  creates_collection?: boolean;
  // Nhánh con của thực thể: `/articles/:slug/comments/:id` ⇒ "comments"; route của chính thực thể ⇒ "".
  sub?: string;
  // Xem 1 bản ghi của chính thực thể: `GET /articles/:slug`.
  reads_one?: boolean;
  // Số đoạn tĩnh của route: `POST /projects/:id/phases` = 2, `.../phases/connect` = 3.
  depth?: number;
}

export type DataEdge = {
  source: string;
  target: string;
  via_entities: string[];
};

const OP_ORDER: Record<EntityOp, number> = {
  CREATE: 0,
  READ: 1,
  UPDATE: 2,
  DELETE: 3,
};

/**
 * ENG-116: Thực thể từ route (A11).
 * - Lấy đoạn tĩnh S theo Mục 13 bậc 1
 * - Thực thể: Singular(S[0]), PascalCase
 * - POST ⇒ CREATE (trừ S[-1] thuộc ACTION_SEGMENTS khác register ⇒ READ)
 * - GET ⇒ READ
 * - PUT, PATCH ⇒ UPDATE
 * - DELETE ⇒ DELETE
 * - Không có binding HTTP hoặc S rỗng ⇒ entities: []
 */
export function readLessonData(
  c: Candidate | HybridArchitecturalNode,
  ctx?: EngineContext
): LessonData {
  let binding: RouteBinding | null = null;
  if ("binding" in c && c.binding) {
    binding = c.binding;
  } else if (ctx && c.entry_symbol) {
    binding = ctx.bindings.find((b) => b.handler === c.entry_symbol) ?? null;
  }

  let method: string | null = null;
  let path: string | null = null;

  if (binding) {
    if (binding.kind !== "HTTP") {
      return { node_id: c.id, entities: [], primary_entity: null };
    }
    method = binding.method ? binding.method.toUpperCase() : "GET";
    path = binding.path;
  } else if (c.title_evidence) {
    const match = c.title_evidence.match(
      /^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i
    );
    if (match) {
      method = match[1].toUpperCase();
      path = match[2].trim();
    }
  }

  if (!method || !path) {
    return { node_id: c.id, entities: [], primary_entity: null };
  }

  const S = staticRouteSegments(path);
  if (S.length === 0) {
    return { node_id: c.id, entities: [], primary_entity: null };
  }

  // Thực thể: Singular(S[0]), PascalCase
  const rawFirst = S[0];
  const parts = rawFirst.split(/[\s_-]+/).filter(Boolean);
  if (parts.length > 0) {
    parts[parts.length - 1] = toSingular(parts[parts.length - 1]);
  }
  const entityName = parts.map(toTitleCase).join("");

  let op: EntityOp;
  if (method === "POST") {
    const lastSeg = S[S.length - 1].toLowerCase();
    if (ACTION_SEGMENTS.has(lastSeg) && lastSeg !== "register") {
      op = "READ";
    } else {
      op = "CREATE";
    }
  } else if (method === "GET") {
    op = "READ";
  } else if (method === "PUT" || method === "PATCH") {
    op = "UPDATE";
  } else if (method === "DELETE") {
    op = "DELETE";
  } else {
    return { node_id: c.id, entities: [], primary_entity: null };
  }

  return {
    node_id: c.id,
    entities: [{ name: entityName, ops: [op] }],
    primary_entity: entityName,
    creates_collection: op === "CREATE" && S.length === 1,
    sub: S.slice(1).find((s) => !ACTION_SEGMENTS.has(s.toLowerCase()))?.toLowerCase() ?? "",
    depth: S.length,
    reads_one: op === "READ" && S.length === 1 && /[{:]/.test(path),
  };
}

/**
 * ENG-118: Dựng cạnh dữ liệu G0 (bước 1, 2).
 * - source(E) = bài dễ nhất có CREATE từ route; không có ⇒ bài dễ nhất có E
 * - Vòng đời: source(E) ⇒ bài Xem ⇒ bài Sửa/Xóa; nhánh con nối sau bài Xem 1 bản ghi
 * - Bài có CREATE E, E → P, source(P) khác bài đó ⇒ source(P) → bài đó
 * - Khóa Map là `${source}->${target}`, gộp via_entities đã sort
 */
export function buildDataEdges(
  lessons: LessonData[],
  foreignKeys: Map<string, string[]>,
  isEasier: (a: string, b: string) => boolean
): Map<string, DataEdge> {
  const entityMap = new Map<string, LessonData[]>();
  for (const l of lessons) {
    for (const ent of l.entities) {
      let list = entityMap.get(ent.name);
      if (!list) {
        list = [];
        entityMap.set(ent.name, list);
      }
      list.push(l);
    }
  }

  const sourceOfEntity = new Map<string, string>();
  for (const [entityName, touchingLessons] of entityMap.entries()) {
    const creators = touchingLessons.filter((l) =>
      l.entities.some(
        (ent) => ent.name === entityName && ent.ops.includes("CREATE")
      )
    );

    // Bài học phải bắt đầu từ route tạo chính thực thể, có thì không xét route tạo đồ con.
    const rootCreators = creators.filter((l) => l.creates_collection);
    const sourcePool = rootCreators.length > 0 ? rootCreators : creators;

    let bestLesson: LessonData;
    if (sourcePool.length > 0) {
      bestLesson = sourcePool[0];
      for (let i = 1; i < sourcePool.length; i++) {
        if (isEasier(sourcePool[i].node_id, bestLesson.node_id)) {
          bestLesson = sourcePool[i];
        }
      }
    } else {
      bestLesson = touchingLessons[0];
      for (let i = 1; i < touchingLessons.length; i++) {
        if (isEasier(touchingLessons[i].node_id, bestLesson.node_id)) {
          bestLesson = touchingLessons[i];
        }
      }
    }
    sourceOfEntity.set(entityName, bestLesson.node_id);
  }

  const edgesMap = new Map<string, DataEdge>();

  const addEdge = (source: string, target: string, entity: string): void => {
    if (source === target) return;
    const key = `${source}->${target}`;
    const existing = edgesMap.get(key);
    if (existing) {
      if (!existing.via_entities.includes(entity)) {
        existing.via_entities.push(entity);
        existing.via_entities.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      }
    } else {
      edgesMap.set(key, {
        source,
        target,
        via_entities: [entity],
      });
    }
  };

  // Vòng đời của E thay cho "source(E) → mọi bài": Tạo ⇒ Xem ⇒ Sửa/Xóa; mỗi nhánh con
  // (comments, favorite…) bắt đầu sau bài Xem 1 bản ghi của E rồi lặp lại cùng thứ tự.
  const easiest = (list: LessonData[]): LessonData | undefined =>
    list.reduce<LessonData | undefined>(
      (best, l) => (best === undefined || isEasier(l.node_id, best.node_id) ? l : best),
      undefined
    );
  const opOn = (l: LessonData, entityName: string): EntityOp =>
    l.entities.find((ent) => ent.name === entityName)?.ops[0] ?? "READ";
  const isChange = (op: EntityOp): boolean => op === "UPDATE" || op === "DELETE";

  for (const [entityName, touchingLessons] of entityMap.entries()) {
    const srcId = sourceOfEntity.get(entityName);
    if (!srcId) continue;

    const bySub = new Map<string, LessonData[]>();
    for (const l of touchingLessons) {
      const key = l.sub ?? "";
      bySub.set(key, [...(bySub.get(key) ?? []), l]);
    }

    const readsOf = (list: LessonData[], except: string): LessonData[] =>
      list.filter((l) => l.node_id !== except && opOn(l, entityName) === "READ");
    const pickGate = (list: LessonData[], except: string): LessonData | undefined => {
      const reads = readsOf(list, except);
      return easiest(reads.filter((l) => l.reads_one)) ?? easiest(reads);
    };
    // Bài Tạo đúng nhánh (`POST /projects/:id/phases`) trước bài thao tác sâu hơn (`.../phases/connect`).
    const pickHead = (list: LessonData[]): LessonData => {
      const creators = list.filter((l) => opOn(l, entityName) === "CREATE");
      const pool = creators.length > 0 ? creators : list;
      const minDepth = Math.min(...pool.map((l) => l.depth ?? 0));
      return easiest(pool.filter((l) => (l.depth ?? 0) === minDepth))!;
    };

    // Nhánh chính: E không có route tạo thẳng (chỉ có nhánh con như `follow`) ⇒ bắt đầu từ bài Xem E.
    const main = bySub.get("") ?? [];
    const srcInMain = main.some((l) => l.node_id === srcId);
    const rootId =
      srcInMain || main.length === 0 ? srcId : (pickGate(main, "") ?? easiest(main))!.node_id;
    const gateId = main.length === 0 ? srcId : (pickGate(main, rootId)?.node_id ?? rootId);

    for (const [sub, list] of bySub) {
      const headId =
        sub === "" ? rootId : list.some((l) => l.node_id === srcId) ? srcId : pickHead(list).node_id;
      if (sub !== "") {
        addEdge(gateId, headId, entityName);
      }
      const changeFrom = sub === "" ? gateId : (easiest(readsOf(list, headId))?.node_id ?? headId);

      for (const l of list) {
        if (l.node_id === headId) continue;
        addEdge(isChange(opOn(l, entityName)) ? changeFrom : headId, l.node_id, entityName);
      }
    }
  }

  // Bài có CREATE E, E → P, source(P) khác bài đó ⇒ source(P) → bài đó
  for (const l of lessons) {
    for (const ent of l.entities) {
      if (ent.ops.includes("CREATE")) {
        const parentEntities = foreignKeys.get(ent.name) ?? [];
        for (const p of parentEntities) {
          const srcP = sourceOfEntity.get(p);
          if (srcP && srcP !== l.node_id) {
            addEdge(srcP, l.node_id, p);
          }
        }
      }
    }
  }

  return edgesMap;
}

/**
 * entities sort theo name, ops theo thứ tự CREATE, READ, UPDATE, DELETE, không trùng.
 */
export function toNodeEntities(
  data: LessonData
): Array<{ name: string; ops: EntityOp[] }> {
  const result: Array<{ name: string; ops: EntityOp[] }> = [];

  for (const ent of data.entities) {
    const uniqueOps = Array.from(new Set(ent.ops)).sort(
      (a, b) => OP_ORDER[a] - OP_ORDER[b]
    );
    result.push({
      name: ent.name,
      ops: uniqueOps,
    });
  }

  result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return result;
}

/**
 * ENG-119: Nhóm (groups).
 * - STANDALONE: node không có cạnh (không chung dữ liệu, không chung hàm) hoặc không có thực thể chính
 *   key = "Bài độc lập", group_id = "group-standalone"
 * - ROUTE_PREFIX: theo thực thể chính, group_id = "group-route-<slug(key)>"
 * - depth = đường dài nhất từ điểm bắt đầu
 * - node_ids sort theo (depth, id)
 * - groups theo (depth nhỏ nhất, group_id), STANDALONE cuối
 * - Gán luôn group_id vào node
 */
export function buildGroups(
  nodes: HybridArchitecturalNode[],
  edges: GraphEdge[],
  dataById: Map<string, LessonData>
): StaticEngineResult["groups"] {
  const connectedNodeIds = new Set<string>();
  for (const e of edges) {
    connectedNodeIds.add(e.source);
    connectedNodeIds.add(e.target);
  }

  // Gán group_id vào từng node
  for (const n of nodes) {
    const ld = dataById.get(n.id);
    const isStandalone =
      !connectedNodeIds.has(n.id) ||
      !ld?.primary_entity;

    if (isStandalone) {
      n.group_id = "group-standalone";
    } else {
      const key = ld!.primary_entity!;
      n.group_id = `group-route-${slug(key)}`;
    }
  }

  // Tính depth cho từng node (đường dài nhất từ điểm bắt đầu)
  const inMap = new Map<string, string[]>();
  for (const n of nodes) {
    inMap.set(n.id, []);
  }
  for (const e of edges) {
    inMap.get(e.target)?.push(e.source);
  }

  const depthMap = new Map<string, number>();
  function getDepth(id: string, visited: Set<string>): number {
    if (depthMap.has(id)) return depthMap.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);

    const parents = inMap.get(id) ?? [];
    if (parents.length === 0) {
      depthMap.set(id, 0);
      return 0;
    }

    let maxD = 0;
    for (const p of parents) {
      maxD = Math.max(maxD, 1 + getDepth(p, visited));
    }
    depthMap.set(id, maxD);
    return maxD;
  }

  for (const n of nodes) {
    getDepth(n.id, new Set());
  }

  // Gom node vào từng nhóm
  const groupNodesMap = new Map<
    string,
    {
      key: string;
      key_kind: "ROUTE_PREFIX" | "STANDALONE";
      nodeIds: string[];
    }
  >();

  for (const n of nodes) {
    let g = groupNodesMap.get(n.group_id);
    if (!g) {
      if (n.group_id === "group-standalone") {
        g = { key: "Bài độc lập", key_kind: "STANDALONE", nodeIds: [] };
      } else {
        const ld = dataById.get(n.id);
        const key = ld?.primary_entity ?? "Chung";
        g = { key, key_kind: "ROUTE_PREFIX", nodeIds: [] };
      }
      groupNodesMap.set(n.group_id, g);
    }
    g.nodeIds.push(n.id);
  }

  // Sắp xếp node_ids trong nhóm theo (depth, id)
  for (const g of groupNodesMap.values()) {
    g.nodeIds.sort((a, b) => {
      const da = depthMap.get(a) ?? 0;
      const db = depthMap.get(b) ?? 0;
      if (da !== db) return da - db;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  // Sắp xếp các nhóm: STANDALONE cuối; các nhóm khác theo (depth nhỏ nhất, group_id)
  const groupList: StaticEngineResult["groups"] = [];
  let standaloneGroup: StaticEngineResult["groups"][number] | null = null;

  for (const [groupId, g] of groupNodesMap.entries()) {
    if (g.nodeIds.length === 0) continue;
    if (g.key_kind === "STANDALONE") {
      standaloneGroup = {
        group_id: groupId,
        key: g.key,
        key_kind: g.key_kind,
        node_ids: g.nodeIds,
      };
    } else {
      groupList.push({
        group_id: groupId,
        key: g.key,
        key_kind: g.key_kind,
        node_ids: g.nodeIds,
      });
    }
  }

  groupList.sort((a, b) => {
    const minDepthA = Math.min(...a.node_ids.map((id) => depthMap.get(id) ?? 0));
    const minDepthB = Math.min(...b.node_ids.map((id) => depthMap.get(id) ?? 0));
    if (minDepthA !== minDepthB) return minDepthA - minDepthB;
    return a.group_id < b.group_id ? -1 : a.group_id > b.group_id ? 1 : 0;
  });

  if (standaloneGroup) {
    groupList.push(standaloneGroup);
  }

  return groupList;
}

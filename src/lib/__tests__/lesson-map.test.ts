import { describe, expect, it } from "vitest";
import type { StaticEngineResult } from "@/contracts";
import fixtureJson from "@/server/engine/__fixtures__/shop-api.json";
import {
  blockedBy,
  crossGroupBlockers,
  groupTree,
  routeSubOf,
  cardAction,
  firstOpenableBlocker,
  groupOfNode,
  lessonGroups,
  mainPathOf,
  nodeStatesOf,
  openGroupsAfter,
  startNodeIds,
  weakParents,
  type NodeStates,
} from "../lesson-map";

const fixture = fixtureJson as unknown as StaticEngineResult;
const edge = (source: string, target: string) => ({ source, target });
const node = (id: string, prerequisites: string[] = []) => ({ id, prerequisites });
const st = (
  node_id: string,
  status: NodeStates[string]["status"],
  analysis_failed = false,
): NodeStates[string] => ({ node_id, status, has_warning: false, analysis_failed });

describe("mainPathOf (ENG-155, T-ENG-35)", () => {
  it("hòa thì chọn theo id nhỏ hơn", () => {
    const nodes = ["n-a", "n-b", "n-c", "n-d"].map((id) => node(id));
    const edges = [edge("n-a", "n-b"), edge("n-b", "n-d"), edge("n-a", "n-c"), edge("n-c", "n-d")];
    expect(mainPathOf(nodes, edges)).toEqual(["n-a", "n-b", "n-d"]);
  });

  it("không có node ⇒ rỗng; cạnh trỏ ra ngoài bị bỏ qua", () => {
    expect(mainPathOf([], [])).toEqual([]);
    expect(mainPathOf([node("a")], [edge("a", "zzz")])).toEqual(["a"]);
  });

  it("lấy đường dài nhất", () => {
    const nodes = ["a", "b", "c", "d"].map((id) => node(id));
    expect(mainPathOf(nodes, [edge("a", "d"), edge("a", "b"), edge("b", "c"), edge("c", "d")])).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});

describe("fixture shop-api", () => {
  it("3 nhóm, 7 bài, đúng 1 nhóm 'Nên học trước' chứa bài đầu đường chính", () => {
    const groups = lessonGroups(fixture, null);
    expect(groups).toHaveLength(3);
    expect(groups.flatMap((g) => g.node_ids)).toHaveLength(7);
    const recommended = groups.filter((g) => g.recommended);
    expect(recommended).toHaveLength(1);
    expect(recommended[0].node_ids).toContain(mainPathOf(fixture.nodes, fixture.edges)[0]);
  });

  it("bài gốc có cạnh ra là bài 'Bắt đầu'; bài có cha thì không", () => {
    const starts = startNodeIds(fixture.nodes, fixture.edges);
    expect(starts.size).toBeGreaterThan(0);
    for (const n of fixture.nodes) expect(starts.has(n.id)).toBe(n.prerequisites.length === 0 && fixture.edges.some((e) => e.source === n.id));
  });

  it("chưa có progress: node gốc sẵn sàng, node có cha bị khóa", () => {
    const states = nodeStatesOf(fixture.nodes, null);
    for (const n of fixture.nodes) {
      expect(states[n.id].status).toBe(n.prerequisites.length === 0 ? "AVAILABLE" : "LOCKED");
    }
  });
});

describe("nhóm", () => {
  const groups = lessonGroups(
    { groups: [{ group_id: "g1", key: "A", key_kind: "ENTITY", node_ids: ["n1"] }, { group_id: "g2", key: "B", key_kind: "STANDALONE", node_ids: ["n2"] }], nodes: [], edges: [] },
    null,
  );

  it("groupOfNode, openGroupsAfter", () => {
    expect(groupOfNode(groups, "n2")).toBe("g2");
    expect(groupOfNode(groups, "nx")).toBeNull();
    expect(openGroupsAfter(["g1"], groups, "n2")).toEqual(["g1", "g2"]);
    expect(openGroupsAfter(["g2"], groups, "n2")).toEqual(["g2"]);
    expect(openGroupsAfter(["g1"], groups, "nx")).toEqual(["g1"]);
  });
});

describe("blockedBy, weakParents", () => {
  const child = node("c", ["p1", "p2", "p3"]);
  const states: NodeStates = {
    p1: st("p1", "COMPLETED"),
    p2: st("p2", "AVAILABLE"),
    p3: st("p3", "FAILED"),
    c: st("c", "LOCKED"),
  };

  it("cha chưa thông = chưa xong và phân tích không lỗi", () => {
    expect(blockedBy(child, states)).toEqual(["p2"]);
  });

  it("cha FAILED hoặc phân tích lỗi cho đi tiếp nhưng bị đánh dấu yếu", () => {
    expect(weakParents(child, states)).toEqual(["p3"]);
    const s2 = { ...states, p2: st("p2", "AVAILABLE", true) };
    expect(blockedBy(child, s2)).toEqual([]);
    expect(weakParents(child, s2)).toEqual(["p2", "p3"]);
  });
});

describe("cardAction", () => {
  it("không khóa ⇒ mở bài", () => {
    expect(cardAction("AVAILABLE", [])).toEqual({ kind: "OPEN", ariaDisabled: false, hint: null });
    expect(cardAction("FAILED", [])).toMatchObject({ kind: "OPEN" });
  });

  it("khóa ⇒ chỉ báo 'Cần xong', luôn có chữ gợi ý", () => {
    expect(cardAction("LOCKED", ["Giỏ hàng", "Thanh toán"])).toEqual({
      kind: "BLOCKED",
      ariaDisabled: true,
      hint: "Cần xong: Giỏ hàng, Thanh toán",
    });
    expect(cardAction("LOCKED", []).hint).toBe("Cần xong các bài trước");
  });
});

describe("firstOpenableBlocker", () => {
  const nodes = [node("a"), node("b", ["a"]), node("c", ["b"])];

  it("đi ngược qua node khóa tới node bấm được", () => {
    const states: NodeStates = { a: st("a", "AVAILABLE"), b: st("b", "LOCKED"), c: st("c", "LOCKED") };
    expect(firstOpenableBlocker(nodes, states, "c")).toBe("a");
    expect(firstOpenableBlocker(nodes, states, "b")).toBe("a");
  });

  it("không có bài cần học trước ⇒ null", () => {
    const states: NodeStates = { a: st("a", "COMPLETED"), b: st("b", "AVAILABLE"), c: st("c", "LOCKED") };
    expect(firstOpenableBlocker(nodes, states, "a")).toBeNull();
    expect(firstOpenableBlocker(nodes, states, "c")).toBe("b");
  });
});

describe("cây bài học: routeSubOf, groupTree, crossGroupBlockers", () => {
  it("routeSubOf theo luật sub của engine", () => {
    expect(routeSubOf("PUT /api/v1/projects/{id}/phases/{phaseId}")).toBe("phases");
    expect(routeSubOf("POST /api/v1/projects")).toBe("");
    expect(routeSubOf("GET /projects/:id")).toBe("");
    expect(routeSubOf("POST /articles/:slug/comments")).toBe("comments");
    expect(routeSubOf("POST /users/login")).toBe("");
    expect(routeSubOf("ProjectService.createProject")).toBe("");
    expect(routeSubOf(null)).toBe("");
  });

  const ev = (id: string, title_evidence: string) => ({ id, title_evidence });
  const byId = new Map(
    [
      ev("create", "POST /api/v1/projects"),
      ev("publish", "POST /api/v1/projects/{id}/publish"),
      ev("artifact", "POST /api/v1/projects/{id}/artifacts"),
      ev("phase-new", "POST /api/v1/projects/{id}/phases"),
      ev("phase-upd", "PUT /api/v1/projects/{id}/phases/{pid}"),
      ev("job", "ProjectJob.run"),
    ].map((n) => [n.id, n]),
  );

  it("groupTree: ≥ 2 bài cùng sub mới thành thư mục, bài lẻ nằm thẳng, giữ thứ tự", () => {
    const tree = groupTree(["create", "phase-new", "publish", "artifact", "phase-upd", "job"], byId);
    expect(tree.direct).toEqual(["create", "publish", "artifact", "job"]);
    expect(tree.subs).toEqual([{ key: "phases", label: "Phases", node_ids: ["phase-new", "phase-upd"] }]);
  });

  it("groupTree: mọi bài cùng 1 sub ⇒ không tạo thư mục", () => {
    const tree = groupTree(["phase-new", "phase-upd"], byId);
    expect(tree.direct).toEqual(["phase-new", "phase-upd"]);
    expect(tree.subs).toEqual([]);
  });

  it("crossGroupBlockers chỉ giữ bài cha chưa thông ở nhóm khác", () => {
    const groups = [
      { group_id: "g1", name: "Template", key_kind: "ENTITY" as const, node_ids: ["tpl"], recommended: false },
      { group_id: "g2", name: "Dự án", key_kind: "ENTITY" as const, node_ids: ["create", "from-tpl"], recommended: true },
    ];
    const states: NodeStates = {
      tpl: st("tpl", "AVAILABLE"),
      create: st("create", "AVAILABLE"),
      "from-tpl": st("from-tpl", "LOCKED"),
    };
    expect(crossGroupBlockers(node("from-tpl", ["create", "tpl"]), states, groups)).toEqual(["tpl"]);
    expect(crossGroupBlockers(node("from-tpl", ["create"]), states, groups)).toEqual([]);
  });
});

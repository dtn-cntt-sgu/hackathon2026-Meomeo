import { describe, expect, it } from "vitest";
import type { HybridArchitecturalNode } from "@/contracts";
import {
  buildDataEdges,
  buildGroups,
  readLessonData,
  toNodeEntities,
} from "./data-deps";
import type { LessonData } from "./data-deps";
import type { Candidate } from "./types";

function createDummyCandidate(opts: {
  id: string;
  method: string;
  path: string;
  complexity?: number;
  rank?: number;
}): Candidate {
  return {
    id: opts.id,
    order_key: opts.id,
    kind: "SLICE",
    node_type: "ARCHITECTURAL_DATA_FLOW",
    entry_symbol: opts.id,
    functions: [opts.id],
    binding: {
      file_path: "src/routes.ts",
      line_start: 1,
      line_end: 10,
      kind: "HTTP",
      method: opts.method,
      path: opts.path,
      handler: opts.id,
      middlewares: [],
      display_name: opts.id,
    },
    base_title: opts.id,
    title_source: "ROUTE",
    title_evidence: `${opts.method} ${opts.path}`,
    cognitive_complexity: opts.complexity ?? 1,
    rank_score: opts.rank ?? 1,
    trace_steps: [],
    dto_snippet: "",
  };
}

describe("Data Dependencies & Groups (ENG-116, ENG-118, ENG-119)", () => {
  it("T-ENG-46: Đọc thực thể và thao tác từ route", () => {
    // POST /orders ⇒ Order CREATE
    const c1 = createDummyCandidate({
      id: "node-order-create",
      method: "POST",
      path: "/orders",
    });
    const d1 = readLessonData(c1);
    expect(d1.primary_entity).toBe("Order");
    expect(d1.entities).toEqual([{ name: "Order", ops: ["CREATE"] }]);

    // POST /auth/login ⇒ Auth READ (do login thuộc ACTION_SEGMENTS khác register)
    const c2 = createDummyCandidate({
      id: "node-auth-login",
      method: "POST",
      path: "/auth/login",
    });
    const d2 = readLessonData(c2);
    expect(d2.primary_entity).toBe("Auth");
    expect(d2.entities).toEqual([{ name: "Auth", ops: ["READ"] }]);

    // POST /auth/register ⇒ Auth CREATE (register là ngoại lệ)
    const c3 = createDummyCandidate({
      id: "node-auth-register",
      method: "POST",
      path: "/auth/register",
    });
    const d3 = readLessonData(c3);
    expect(d3.primary_entity).toBe("Auth");
    expect(d3.entities).toEqual([{ name: "Auth", ops: ["CREATE"] }]);

    // GET /orders/:id ⇒ Order READ
    const c4 = createDummyCandidate({
      id: "node-order-get",
      method: "GET",
      path: "/orders/:id",
    });
    const d4 = readLessonData(c4);
    expect(d4.primary_entity).toBe("Order");
    expect(d4.entities).toEqual([{ name: "Order", ops: ["READ"] }]);

    // DELETE /orders/:id ⇒ Order DELETE
    const c5 = createDummyCandidate({
      id: "node-order-delete",
      method: "DELETE",
      path: "/orders/:id",
    });
    const d5 = readLessonData(c5);
    expect(d5.primary_entity).toBe("Order");
    expect(d5.entities).toEqual([{ name: "Order", ops: ["DELETE"] }]);
  });

  it("toNodeEntities: chuẩn hóa, loại trùng và sắp xếp ops", () => {
    const data: LessonData = {
      node_id: "node-1",
      primary_entity: "Order",
      entities: [
        {
          name: "User",
          ops: ["DELETE", "CREATE", "READ", "CREATE"],
        },
        {
          name: "Article",
          ops: ["UPDATE", "READ"],
        },
      ],
    };

    const result = toNodeEntities(data);
    expect(result.length).toBe(2);
    // Entities sort theo name (Article trước User)
    expect(result[0].name).toBe("Article");
    expect(result[0].ops).toEqual(["READ", "UPDATE"]);

    expect(result[1].name).toBe("User");
    // Ops theo thứ tự CREATE, READ, UPDATE, DELETE
    expect(result[1].ops).toEqual(["CREATE", "READ", "DELETE"]);
  });

  it("T-ENG-47: E không có bài tạo, 2 bài đụng E ⇒ nguồn là bài dễ hơn", () => {
    // 2 bài đều READ thực thể Product (không bài nào CREATE)
    const lessons: LessonData[] = [
      {
        node_id: "node-easy",
        primary_entity: "Product",
        entities: [{ name: "Product", ops: ["READ"] }],
      },
      {
        node_id: "node-hard",
        primary_entity: "Product",
        entities: [{ name: "Product", ops: ["READ"] }],
      },
    ];

    const isEasier = (a: string, b: string) => a === "node-easy" && b === "node-hard";

    const edgesMap = buildDataEdges(lessons, new Map(), isEasier);
    expect(edgesMap.size).toBe(1);

    const edge = edgesMap.get("node-easy->node-hard");
    expect(edge).toBeDefined();
    expect(edge?.source).toBe("node-easy");
    expect(edge?.target).toBe("node-hard");
    expect(edge?.via_entities).toEqual(["Product"]);
  });

  it("T-ENG-47: 2 thực thể tạo cạnh ngược chiều ⇒ bỏ cạnh bài khó tới bài dễ", () => {
    // Lesson A (dễ hơn): tạo E1, đọc E2
    // Lesson B (khó hơn): tạo E2, đọc E1
    const lessons: LessonData[] = [
      {
        node_id: "node-A",
        primary_entity: "E1",
        entities: [
          { name: "E1", ops: ["CREATE"] },
          { name: "E2", ops: ["READ"] },
        ],
      },
      {
        node_id: "node-B",
        primary_entity: "E2",
        entities: [
          { name: "E1", ops: ["READ"] },
          { name: "E2", ops: ["CREATE"] },
        ],
      },
    ];

    const isEasier = (a: string, b: string) => a === "node-A" && b === "node-B";

    const edgesMap = buildDataEdges(lessons, new Map(), isEasier);
    // Có 2 cạnh ngược chiều: A->B (via E1) và B->A (via E2)
    expect(edgesMap.has("node-A->node-B")).toBe(true);
    expect(edgesMap.has("node-B->node-A")).toBe(true);

    // Tiến hành khử chu trình như trong ENG-118 bước 5: bỏ cạnh từ bài khó tới bài dễ
    for (const [key, edge] of Array.from(edgesMap.entries())) {
      // Nếu nguồn khó hơn đích (tức đích dễ hơn nguồn) ⇒ bỏ
      if (isEasier(edge.target, edge.source)) {
        edgesMap.delete(key);
      }
    }

    // Cạnh B->A (từ bài khó B tới bài dễ A) bị bỏ, chỉ còn A->B
    expect(edgesMap.has("node-B->node-A")).toBe(false);
    expect(edgesMap.has("node-A->node-B")).toBe(true);
  });

  it("buildGroups: bài không có cạnh được xếp vào group-standalone ('Bài độc lập')", () => {
    const node1: HybridArchitecturalNode = {
      id: "node-1",
      title: "Get Order",
      title_source: "ROUTE",
      title_evidence: "GET /orders",
      node_type: "ARCHITECTURAL_DATA_FLOW",
      entry_symbol: "getOrders",
      prerequisites: [],
      position: { x: 0, y: 0 },
      files: ["src/routes.ts"],
      languages: ["TYPESCRIPT"],
      support_tier: "RESOLVED",
      cognitive_complexity: 2,
      rank_score: 1,
      is_vip_algorithm: false,
      is_capstone: false,
      uncle_bob: null,
      trace_steps: [],
      dto_snippet: "",
      group_id: "",
      entities: [{ name: "Order", ops: ["READ"] }],
    };

    const node2Standalone: HybridArchitecturalNode = {
      id: "node-standalone",
      title: "Standalone Task",
      title_source: "ROUTE",
      title_evidence: "GET /health",
      node_type: "ARCHITECTURAL_DATA_FLOW",
      entry_symbol: "health",
      prerequisites: [],
      position: { x: 0, y: 0 },
      files: ["src/health.ts"],
      languages: ["TYPESCRIPT"],
      support_tier: "RESOLVED",
      cognitive_complexity: 1,
      rank_score: 1,
      is_vip_algorithm: false,
      is_capstone: false,
      uncle_bob: null,
      trace_steps: [],
      dto_snippet: "",
      group_id: "",
      entities: [{ name: "Health", ops: ["READ"] }],
    };

    const nodes = [node1, node2Standalone];
    // node-1 có cạnh giả định (hoặc là nguồn cạnh), node2Standalone không có cạnh
    const edges = [
      {
        id: "node-1->node-3",
        source: "node-1",
        target: "node-3",
        confidence: "RESOLVED" as const,
        via_entities: ["Order"],
      },
    ];

    const dataById = new Map<string, LessonData>([
      [
        "node-1",
        {
          node_id: "node-1",
          primary_entity: "Order",
          entities: [{ name: "Order", ops: ["READ"] }],
        },
      ],
      [
        "node-standalone",
        {
          node_id: "node-standalone",
          primary_entity: "Health",
          entities: [{ name: "Health", ops: ["READ"] }],
        },
      ],
    ]);

    const groups = buildGroups(nodes, edges, dataById);

    expect(node2Standalone.group_id).toBe("group-standalone");
    expect(node1.group_id).toBe("group-route-order");

    const standaloneGroup = groups.find((g) => g.group_id === "group-standalone");
    expect(standaloneGroup).toBeDefined();
    expect(standaloneGroup?.key).toBe("Bài độc lập");
    expect(standaloneGroup?.key_kind).toBe("STANDALONE");
    expect(standaloneGroup?.node_ids).toContain("node-standalone");

    // Nhóm STANDALONE phải nằm ở cuối danh sách groups
    expect(groups[groups.length - 1].group_id).toBe("group-standalone");
  });

  it("vòng đời: Tạo ⇒ Xem ⇒ Sửa/Xóa, nhánh con nối sau bài Xem 1 bản ghi", () => {
    const routes: Array<[string, string, string]> = [
      ["create", "POST", "/articles"],
      ["list", "GET", "/articles"],
      ["get", "GET", "/articles/:slug"],
      ["update", "PUT", "/articles/:slug"],
      ["delete", "DELETE", "/articles/:slug"],
      ["c-create", "POST", "/articles/:slug/comments"],
      ["c-list", "GET", "/articles/:slug/comments"],
      ["c-delete", "DELETE", "/articles/:slug/comments/:id"],
      ["c-like", "POST", "/articles/:slug/comments/:id/like"],
    ];
    const lessons = routes.map(([id, method, path]) =>
      readLessonData(createDummyCandidate({ id, method, path }))
    );
    expect(lessons.find((l) => l.node_id === "c-like")?.sub).toBe("comments");

    // Hòa ⇒ id nhỏ hơn dễ hơn, như isEasier khi số bước và rank bằng nhau.
    const edges = [...buildDataEdges(lessons, new Map(), (a, b) => a < b).keys()].sort();
    expect(edges).toEqual(
      [
        "create->list",
        "create->get",
        "get->update",
        "get->delete",
        "get->c-create",
        "c-create->c-list",
        "c-create->c-like",
        "c-list->c-delete",
      ].sort()
    );
  });

  it("vòng đời: không có route tạo thẳng ⇒ bắt đầu từ bài Xem, nhánh con theo sau", () => {
    const routes: Array<[string, string, string]> = [
      ["get", "GET", "/profiles/:username"],
      ["follow", "POST", "/profiles/:username/follow"],
      ["unfollow", "DELETE", "/profiles/:username/follow"],
    ];
    const lessons = routes.map(([id, method, path]) =>
      readLessonData(createDummyCandidate({ id, method, path }))
    );
    // follow dễ hơn get vẫn không được làm gốc
    const easier = (a: string, b: string) => a === "follow" || (a < b && b !== "follow");
    const edges = [...buildDataEdges(lessons, new Map(), easier).keys()].sort();
    expect(edges).toEqual(["follow->unfollow", "get->follow"]);
  });

  it("vòng đời: nhánh con bắt đầu từ bài Tạo đúng nhánh, không phải bài thao tác sâu hơn", () => {
    const routes: Array<[string, string, string]> = [
      ["create", "POST", "/projects"],
      ["get", "GET", "/projects/:id"],
      ["a-connect", "POST", "/projects/:id/phases/connect"],
      ["phase", "POST", "/projects/:id/phases"],
      ["phase-put", "PUT", "/projects/:id/phases/:phaseId"],
    ];
    const lessons = routes.map(([id, method, path]) =>
      readLessonData(createDummyCandidate({ id, method, path }))
    );
    const edges = [...buildDataEdges(lessons, new Map(), (a, b) => a < b).keys()].sort();
    expect(edges).toEqual(["create->get", "get->phase", "phase->a-connect", "phase->phase-put"]);
  });

  it("POST /articles làm gốc, không phải POST /articles/:slug/comments dù dễ hơn", () => {
    const lesson = (node_id: string, op: "CREATE" | "READ", creates_collection: boolean) => ({
      node_id,
      entities: [{ name: "Article", ops: [op] }],
      primary_entity: "Article",
      creates_collection,
    });
    const edges = buildDataEdges(
      [
        lesson("comment", "CREATE", false),
        lesson("create", "CREATE", true),
        lesson("list", "READ", false),
      ],
      new Map(),
      (a) => a === "comment"
    );
    expect([...edges.keys()].sort()).toEqual(["create->comment", "create->list"]);
  });
});

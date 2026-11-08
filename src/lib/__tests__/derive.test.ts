import { describe, expect, it } from "vitest";
import { CONFIG } from "@/contracts/config";
import type { GraphSkeletonNode } from "@/contracts";
import {
  aiTitleOf,
  deriveNodeStates,
  displayTitle,
  type NodeProgressRow,
} from "../derive";

describe("derive", () => {
  describe("deriveNodeStates", () => {
    it("DERIVE-01 Gốc AVAILABLE, con LOCKED khi chưa có tiến độ", () => {
      const skeleton: GraphSkeletonNode[] = [
        { node_id: "node-a", title: "Node A", prerequisites: [], is_capstone: false },
        { node_id: "node-b", title: "Node B", prerequisites: ["node-a"], is_capstone: false },
      ];
      const progress: NodeProgressRow[] = [];
      const derived = deriveNodeStates(skeleton, progress);

      expect(derived["node-a"]).toEqual({
        node_id: "node-a",
        status: "AVAILABLE",
        has_warning: false,
        analysis_failed: false,
      });
      expect(derived["node-b"]).toEqual({
        node_id: "node-b",
        status: "LOCKED",
        has_warning: false,
        analysis_failed: false,
      });
    });

    it("DERIVE-02 Cha COMPLETED => con AVAILABLE", () => {
      const skeleton: GraphSkeletonNode[] = [
        { node_id: "node-a", title: "Node A", prerequisites: [], is_capstone: false },
        { node_id: "node-b", title: "Node B", prerequisites: ["node-a"], is_capstone: false },
      ];
      const progress: NodeProgressRow[] = [
        { node_id: "node-a", status: "COMPLETED", analysis_failed: false },
      ];
      const derived = deriveNodeStates(skeleton, progress);

      expect(derived["node-a"].status).toBe("COMPLETED");
      expect(derived["node-b"]).toEqual({
        node_id: "node-b",
        status: "AVAILABLE",
        has_warning: false,
        analysis_failed: false,
      });
    });

    it("DERIVE-03 Cha FAILED => con AVAILABLE + has_warning", () => {
      const skeleton: GraphSkeletonNode[] = [
        { node_id: "node-a", title: "Node A", prerequisites: [], is_capstone: false },
        { node_id: "node-b", title: "Node B", prerequisites: ["node-a"], is_capstone: false },
      ];
      const progress: NodeProgressRow[] = [
        { node_id: "node-a", status: "FAILED", analysis_failed: false },
      ];
      const derived = deriveNodeStates(skeleton, progress);

      expect(derived["node-a"].status).toBe("FAILED");
      expect(derived["node-b"]).toEqual({
        node_id: "node-b",
        status: "AVAILABLE",
        has_warning: true,
        analysis_failed: false,
      });
    });

    it("DERIVE-04 Cha AVAILABLE + analysis_failed => con AVAILABLE + has_warning", () => {
      const skeleton: GraphSkeletonNode[] = [
        { node_id: "node-a", title: "Node A", prerequisites: [], is_capstone: false },
        { node_id: "node-b", title: "Node B", prerequisites: ["node-a"], is_capstone: false },
      ];
      const progress: NodeProgressRow[] = [
        { node_id: "node-a", status: "AVAILABLE", analysis_failed: true },
      ];
      const derived = deriveNodeStates(skeleton, progress);

      expect(derived["node-a"]).toEqual({
        node_id: "node-a",
        status: "AVAILABLE",
        has_warning: false,
        analysis_failed: true,
      });
      expect(derived["node-b"]).toEqual({
        node_id: "node-b",
        status: "AVAILABLE",
        has_warning: true,
        analysis_failed: false,
      });
    });

    it("DERIVE-05 Dòng có status thì dùng status của dòng đó", () => {
      const skeleton: GraphSkeletonNode[] = [
        { node_id: "node-a", title: "Node A", prerequisites: [], is_capstone: false },
        { node_id: "node-b", title: "Node B", prerequisites: ["node-a"], is_capstone: false },
      ];
      const progress: NodeProgressRow[] = [
        { node_id: "node-b", status: "COMPLETED", analysis_failed: false },
      ];
      const derived = deriveNodeStates(skeleton, progress);

      expect(derived["node-b"].status).toBe("COMPLETED");
    });

    it("DERIVE-06 Node cha không có trong skeleton => bỏ qua coi như đã thông", () => {
      const skeleton: GraphSkeletonNode[] = [
        {
          node_id: "node-b",
          title: "Node B",
          prerequisites: ["non-existent-parent"],
          is_capstone: false,
        },
      ];
      const progress: NodeProgressRow[] = [];
      const derived = deriveNodeStates(skeleton, progress);

      expect(derived["node-b"].status).toBe("AVAILABLE");
      expect(derived["node-b"].has_warning).toBe(false);
    });

    it("DERIVE-07 Có chu trình => xử lý theo node_id tăng dần, không ném lỗi", () => {
      const skeleton: GraphSkeletonNode[] = [
        { node_id: "node-a", title: "Node A", prerequisites: ["node-b"], is_capstone: false },
        { node_id: "node-b", title: "Node B", prerequisites: ["node-a"], is_capstone: false },
      ];
      const progress: NodeProgressRow[] = [];
      expect(() => deriveNodeStates(skeleton, progress)).not.toThrow();
      const derived = deriveNodeStates(skeleton, progress);
      expect(derived["node-a"]).toBeDefined();
      expect(derived["node-b"]).toBeDefined();
    });
  });

  describe("aiTitleOf", () => {
    it("DERIVE-08 aiTitleOf luôn trả về null", () => {
      expect(aiTitleOf("node-1", null)).toBeNull();
      expect(
        aiTitleOf("node-1", {
          facts: {
            archetype: "WEB_BACKEND",
            framework: "Express",
            tech_stack: ["express"],
            root_node_ids: ["node-1"],
            main_path_node_ids: ["node-1"],
          },
          ai: null,
        })
      ).toBeNull();
    });
  });

  describe("displayTitle", () => {
    it("DERIVE-09 Tiền tố ~ cho DOMAIN_TERMS, DIRECTORY, FILE_BASENAME", () => {
      expect(
        displayTitle(
          { id: "1", title: "User Profile", title_source: "DOMAIN_TERMS" },
          null
        )
      ).toBe("~User Profile");

      expect(
        displayTitle(
          { id: "2", title: "Services", title_source: "DIRECTORY" },
          null
        )
      ).toBe("~Services");

      expect(
        displayTitle(
          { id: "3", title: "auth.ts", title_source: "FILE_BASENAME" },
          null
        )
      ).toBe("~auth.ts");

      expect(
        displayTitle(
          { id: "4", title: "Get User", title_source: "METHOD" },
          null
        )
      ).toBe("Get User");
    });

    it("DERIVE-10 Cắt dài quá CONFIG.TITLE_MAX_CHARS thành 31 ký tự + …", () => {
      const longTitle = "A".repeat(CONFIG.TITLE_MAX_CHARS + 5);
      const res = displayTitle(
        { id: "1", title: longTitle, title_source: "OTHER" },
        null
      );
      expect([...res].length).toBe(CONFIG.TITLE_MAX_CHARS);
      expect(res.endsWith("…")).toBe(true);
      expect(res.slice(0, CONFIG.TITLE_MAX_CHARS - 1)).toBe("A".repeat(CONFIG.TITLE_MAX_CHARS - 1));
    });

    it("DERIVE-11 Không cắt nếu <= CONFIG.TITLE_MAX_CHARS", () => {
      const exactTitle = "A".repeat(CONFIG.TITLE_MAX_CHARS);
      const res = displayTitle(
        { id: "1", title: exactTitle, title_source: "OTHER" },
        null
      );
      expect(res).toBe(exactTitle);
    });
  });
});

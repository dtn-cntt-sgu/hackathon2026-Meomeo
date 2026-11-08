import { describe, expect, it } from "vitest";
import type { ExecutionTraceStep, HybridArchitecturalNode, NodeAnalysisView } from "@/contracts";
import { CONFIG } from "@/contracts/config";
import {
  REASON_MARKER,
  REASON_TOO_LONG,
  buildDtoModel,
  buildFileTabs,
  buildStepModel,
  findStep,
  hlToModelRanges,
  stepHl,
  toOriginalSelection,
  weakPointHl,
} from "../slice-model";

const step1: ExecutionTraceStep = {
  step_number: 1,
  layer: "ENTRY_POINT",
  file_path: "src/routes/order.routes.ts",
  function_name: "createOrder",
  line_start: 5,
  line_end: 8,
  snippet: "router.post('/orders', async (req, res) => {\n  const order = await service.checkout(req.body);\n  res.json(order);\n});",
  snippet_line_map: [5, 6, 7, 8],
};

// Dòng 2 là marker (lược các dòng 13–15): lineMap = 0.
const step2: ExecutionTraceStep = {
  step_number: 2,
  layer: "BUSINESS_LOGIC",
  file_path: "src/services/order.service.ts",
  function_name: "OrderService.checkout",
  line_start: 12,
  line_end: 20,
  snippet: "async checkout(dto) {\n  // ... 3 dòng đã lược\n  const user = await userRepo.findById(dto.userId);\n  return orderRepo.create(user);\n}",
  snippet_line_map: [12, 0, 16, 17, 18],
};

const node = {
  id: "n1",
  files: ["src/routes/order.routes.ts", "src/services/order.service.ts", "src/repos/unused.repo.ts"],
  trace_steps: [step1, step2],
  dto_snippet: "interface Order {\n  id: string;\n}",
} as unknown as HybridArchitecturalNode;

describe("slice-model", () => {
  describe("findStep / buildStepModel / buildDtoModel", () => {
    it("SM-01 model chỉ có snippet của bước đang xem, lineMap lấy từ snippet_line_map", () => {
      expect(findStep(node, 2)).toBe(step2);
      expect(findStep(node, 9)).toBeNull();
      expect(findStep(node, null)).toBeNull();
      expect(buildStepModel(node, 1)).toEqual({ text: step1.snippet, lineMap: [5, 6, 7, 8] });
      const m2 = buildStepModel(node, 2);
      expect(m2.text).toBe(step2.snippet);
      expect(m2.text).not.toContain("router.post");
      expect(m2.lineMap).toEqual([12, 0, 16, 17, 18]); // marker = 0
    });

    it("SM-02 bước không có ⇒ model rỗng, không ném lỗi", () => {
      expect(buildStepModel(node, 99)).toEqual({ text: "", lineMap: [] });
    });

    it("SM-03 model DTO không có số dòng", () => {
      expect(buildDtoModel(node)).toEqual({ text: node.dto_snippet, lineMap: [0, 0, 0] });
      expect(buildDtoModel({ ...node, dto_snippet: "" })).toEqual({ text: "", lineMap: [] });
    });
  });

  describe("buildFileTabs", () => {
    const analysis = {
      weak_points: [{ file_path: "src/services/order.service.ts", step: 2 }],
    } as unknown as NodeAnalysisView;

    it("SM-04 mỗi file 1 tab, bước đầu của file, chấm đỏ theo weak_points, tab DTO ở cuối", () => {
      const tabs = buildFileTabs(node, analysis);
      expect(tabs.map((t) => t.name)).toEqual(["order.routes.ts", "order.service.ts", "unused.repo.ts", "Kiểu dữ liệu"]);
      expect(tabs.map((t) => t.first_step)).toEqual([1, 2, null, null]);
      expect(tabs.map((t) => t.has_weak)).toEqual([false, true, false, false]);
      expect(tabs[3].kind).toBe("DTO");
    });

    it("SM-05 chưa có phân tích ⇒ không chấm đỏ; dto_snippet rỗng ⇒ không có tab DTO", () => {
      const tabs = buildFileTabs({ ...node, dto_snippet: "" }, "PENDING");
      expect(tabs).toHaveLength(3);
      expect(tabs.every((t) => !t.has_weak)).toBe(true);
    });
  });

  describe("tô sáng", () => {
    it("SM-06 stepHl phủ cả bước theo dòng gốc", () => {
      expect(stepHl(step2, "GOOD")).toEqual({ step: 2, line_start: 12, line_end: 18, kind: "GOOD" });
    });

    it("SM-07 weakPointHl: dòng gốc đầu tiên chứa symbol; không thấy ⇒ cả bước", () => {
      expect(weakPointHl(step2, "findById")).toEqual({ step: 2, line_start: 16, line_end: 16, kind: "BAD" });
      expect(weakPointHl(step2, "OrderService.checkout")).toEqual({ step: 2, line_start: 12, line_end: 12, kind: "BAD" });
      expect(weakPointHl(step2, "khongCo")).toEqual({ step: 2, line_start: 12, line_end: 18, kind: "BAD" });
    });

    it("SM-08 weakPointHl không khớp giữa chừng một từ và bỏ qua dòng marker", () => {
      expect(weakPointHl(step2, "find")).toEqual(stepHl(step2, "BAD"));
      expect(weakPointHl(step2, "dòng đã lược")).toEqual(stepHl(step2, "BAD"));
    });

    it("SM-09 hlToModelRanges đổi dòng gốc sang dòng model, tách đoạn ở marker", () => {
      const m = buildStepModel(node, 2);
      expect(hlToModelRanges(m, [{ step: 2, line_start: 16, line_end: 17, kind: "FOCUS" }])).toEqual([
        { start_line: 3, end_line: 4, kind: "FOCUS" },
      ]);
      expect(hlToModelRanges(m, [stepHl(step2, "GOOD")])).toEqual([
        { start_line: 1, end_line: 1, kind: "GOOD" },
        { start_line: 3, end_line: 5, kind: "GOOD" },
      ]);
      expect(hlToModelRanges(m, [{ step: 2, line_start: 100, line_end: 101, kind: "BAD" }])).toEqual([]);
    });
  });

  describe("toOriginalSelection", () => {
    const m2 = buildStepModel(node, 2);

    it("SM-10 đổi sang số dòng gốc, cột từ 1, hợp lệ ⇒ invalid_reason null", () => {
      // dòng model 3 = dòng gốc 16: "  const user = await userRepo.findById(dto.userId);"
      const sel = toOriginalSelection(m2, { startLineNumber: 3, startColumn: 9, endLineNumber: 3, endColumn: 13 });
      expect(sel).toEqual({
        range: { line_start: 16, col_start: 9, line_end: 16, col_end: 13 },
        selected_text: "user",
        invalid_reason: null,
      });
    });

    it("SM-11 vùng chọn nhiều dòng liền nhau ⇒ hợp lệ, hai đầu theo dòng gốc", () => {
      const sel = toOriginalSelection(m2, { startLineNumber: 3, startColumn: 3, endLineNumber: 4, endColumn: 9 });
      expect(sel.range).toEqual({ line_start: 16, col_start: 3, line_end: 17, col_end: 9 });
      expect(sel.invalid_reason).toBeNull();
      expect(sel.selected_text).toBe("const user = await userRepo.findById(dto.userId);\n  return");
    });

    it("SM-12 chạm dòng marker ⇒ VẪN trả kết quả (không null) kèm invalid_reason", () => {
      const sel = toOriginalSelection(m2, { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 8 });
      expect(sel).not.toBeNull();
      expect(sel.invalid_reason).toBe(REASON_MARKER);
      expect(sel.range.line_start).toBe(12);
      expect(sel.selected_text.length).toBeGreaterThan(0);
    });

    it("SM-13 chỉ chọn trong dòng marker ⇒ invalid_reason, không ném lỗi", () => {
      const sel = toOriginalSelection(m2, { startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 9 });
      expect(sel.invalid_reason).toBe(REASON_MARKER);
      expect(sel.range.line_start).toBe(0);
    });

    it("SM-14 quá EXPLAIN_SELECTION_MAX_CHARS ⇒ invalid_reason 'Chọn đoạn ngắn hơn'", () => {
      const long = "x".repeat(CONFIG.EXPLAIN_SELECTION_MAX_CHARS + 1);
      const model = { text: long, lineMap: [7] };
      const over = toOriginalSelection(model, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: long.length + 1 });
      expect(over.invalid_reason).toBe(REASON_TOO_LONG);
      expect(over.range).toEqual({ line_start: 7, col_start: 1, line_end: 7, col_end: long.length + 1 });
      const ok = toOriginalSelection(model, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: CONFIG.EXPLAIN_SELECTION_MAX_CHARS + 1 });
      expect(ok.invalid_reason).toBeNull();
    });

    it("SM-15 chọn nguyên dòng (kết thúc ở cột 1 dòng sau) không bị tính là chạm dòng sau", () => {
      // Kéo từ đầu dòng model 3 tới đầu dòng model 4 ⇒ chỉ dòng 3.
      const sel = toOriginalSelection(m2, { startLineNumber: 3, startColumn: 1, endLineNumber: 4, endColumn: 1 });
      expect(sel.range.line_end).toBe(16);
      expect(sel.invalid_reason).toBeNull();
      // Kéo từ cuối dòng 1 tới đầu dòng 3 (qua marker) vẫn chạm marker.
      const sel2 = toOriginalSelection(m2, { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 1 });
      expect(sel2.invalid_reason).toBe(REASON_MARKER);
    });

    it("SM-16 vùng chọn ngược chiều được chuẩn hóa; vùng trống ⇒ invalid_reason", () => {
      const rev = toOriginalSelection(m2, { startLineNumber: 3, startColumn: 13, endLineNumber: 3, endColumn: 9 });
      expect(rev.selected_text).toBe("user");
      expect(rev.range).toMatchObject({ col_start: 9, col_end: 13 });
      const empty = toOriginalSelection(m2, { startLineNumber: 3, startColumn: 5, endLineNumber: 3, endColumn: 5 });
      expect(empty.invalid_reason).not.toBeNull();
    });
  });
});

import { describe, expect, it } from "vitest";
import type { ClientStaticEngineResult, NodeAnalysisView } from "@/contracts";
import shop from "@/server/engine/__fixtures__/shop-api.json";
import {
  ENTITY_OP_LABELS,
  buildRoleCard,
  buildSummary,
  buildTourSteps,
  firstSentence,
  skillsAtStep,
} from "../role-card";

const result = shop as unknown as ClientStaticEngineResult;
const list = result.nodes.find((n) => n.id === "slice-product-list")!;

function analysisFor(node: typeof list, patch: Partial<NodeAnalysisView> = {}): NodeAnalysisView {
  const [s1, s2] = node.trace_steps;
  return {
    node_id: node.id,
    skills: [
      { skill: "HTTP_ROUTING", step: s1.step_number, symbol: s1.function_name, reason: "Route nhận GET /products", file_path: s1.file_path, line_start: s1.line_start, line_end: s1.line_end },
    ],
    architecture: { patterns: ["LAYERED"], summary: "Cho khách xem danh sách sản phẩm. Dữ liệu đi qua 3 tầng." },
    steps: node.trace_steps.map((s) => ({
      step: s.step_number,
      layer: s.layer,
      file_path: s.file_path,
      line_start: s.line_start,
      line_end: s.line_end,
      text: `Bước ${s.step_number}: ${s.function_name}`,
    })),
    strengths: [{ step: s1.step_number, text: "Route chỉ chuyển việc cho service." }],
    weak_points: [
      {
        skill: "DB_OPTIMIZATION",
        step: s2.step_number,
        symbol: s2.function_name,
        what: "Hỏi database từng sản phẩm một.",
        consequence: "Trang chậm khi có nhiều sản phẩm.",
        file_path: s2.file_path,
        line_start: s2.line_start,
        line_end: s2.line_end,
      },
    ],
    shared_files: [],
    skeleton_only: false,
    ...patch,
  };
}

describe("firstSentence", () => {
  it("lấy câu đầu, kể cả khi không có dấu chấm cuối", () => {
    expect(firstSentence("Cho khách xem sản phẩm. Câu sau.")).toBe("Cho khách xem sản phẩm.");
    expect(firstSentence("  Không có dấu chấm  ")).toBe("Không có dấu chấm");
    expect(firstSentence("   ")).toBeNull();
  });
});

describe("buildRoleCard", () => {
  it("dựng từ engine khi chưa có phân tích: ẩn dòng Vai trò, giữ Mở ra cho và Dữ liệu", () => {
    const card = buildRoleCard(list, result);
    expect(card.name).toContain(list.title);
    expect(card.evidence).toBe("GET /products");
    expect(card.role).toBeNull();
    expect(card.requires).toEqual([]);
    expect(card.unlocks).toEqual(["Place Order"]);
    expect(card.entities).toEqual([
      { name: "Product", ops: [{ op: "READ", label: ENTITY_OP_LABELS.READ }] },
      { name: "Category", ops: [{ op: "READ", label: "Đọc" }] },
    ]);
  });

  it("Vai trò = câu 1 của architecture.summary", () => {
    expect(buildRoleCard(list, result, analysisFor(list)).role).toBe("Cho khách xem danh sách sản phẩm.");
  });

  it("skeleton_only, PENDING, FAILED ⇒ không có Vai trò", () => {
    expect(buildRoleCard(list, result, analysisFor(list, { skeleton_only: true })).role).toBeNull();
    expect(buildRoleCard(list, result, "PENDING").role).toBeNull();
    expect(buildRoleCard(list, result, "FAILED").role).toBeNull();
  });

  it("Cần trước lấy tên các bài trong prerequisites", () => {
    const checkout = result.nodes.find((n) => n.id === "slice-order-checkout")!;
    expect(buildRoleCard(checkout, result).requires.sort()).toEqual(["Add To Cart", "List Products"]);
  });

  it("thiếu result thì vẫn dựng được thẻ, không ném lỗi", () => {
    const card = buildRoleCard(list);
    expect(card.requires).toEqual([]);
    expect(card.unlocks).toEqual([]);
  });
});

describe("buildTourSteps", () => {
  it("chưa có phân tích: vẫn đủ bước từ trace_steps, text = null", () => {
    const steps = buildTourSteps(list, undefined);
    expect(steps).toHaveLength(list.trace_steps.length);
    expect(steps.every((s) => s.text === null && s.total === steps.length)).toBe(true);
    expect(steps[0].layer_label).toBe("Nhận yêu cầu");
    expect(steps[0].function_name).toBe(list.trace_steps[0].function_name);
  });

  it("có phân tích: thêm chữ giải thích và đánh dấu bước có điểm dở", () => {
    const steps = buildTourSteps(list, analysisFor(list));
    expect(steps[0].text).toContain("Bước 1");
    expect(steps[0].has_weak).toBe(false);
    expect(steps[1].has_weak).toBe(true);
    expect(steps[1].weak_what).toBe("Hỏi database từng sản phẩm một.");
  });

  it("bước nhánh phụ có nhãn và điều kiện; luồng chính là null", () => {
    const node = {
      ...list,
      trace_steps: list.trace_steps.map((s, i) =>
        i === 0
          ? { ...s, branch: null }
          : i === 1
            ? { ...s, branch: { kind: "ELSE" as const, condition: "!(user == null)" } }
            : { ...s, branch: { kind: "CATCH" as const, condition: "IOException e" } }
      ),
    };
    const steps = buildTourSteps(node, undefined);
    expect(steps[0].branch).toBeNull();
    expect(steps[1].branch).toEqual({ label: "Chỉ chạy khi", condition: "!(user == null)" });
    if (steps.length > 2) expect(steps[2].branch).toEqual({ label: "Chỉ chạy khi có lỗi", condition: "IOException e" });
  });

  it("skillsAtStep chỉ lấy kỹ năng của đúng bước", () => {
    const a = analysisFor(list);
    expect(skillsAtStep(a, 1).map((s) => s.skill)).toEqual(["HTTP_ROUTING"]);
    expect(skillsAtStep(a, 2)).toEqual([]);
    expect(skillsAtStep("PENDING", 1)).toEqual([]);
  });
});

describe("buildSummary", () => {
  it("điểm hay tô GOOD cả bước, điểm dở tô BAD", () => {
    const { good, bad } = buildSummary(list, analysisFor(list));
    expect(good).toHaveLength(1);
    expect(good[0].hl?.kind).toBe("GOOD");
    expect(good[0].hl?.step).toBe(1);
    expect(bad).toHaveLength(1);
    expect(bad[0].hl?.kind).toBe("BAD");
    expect(bad[0].hl?.step).toBe(2);
    expect(bad[0].consequence).toBe("Trang chậm khi có nhiều sản phẩm.");
  });

  it("không đưa cách sửa ra khỏi dữ liệu tóm tắt (INV-06)", () => {
    const a = analysisFor(list);
    (a.weak_points[0] as unknown as Record<string, unknown>).fix = "Dùng JOIN";
    const { bad } = buildSummary(list, a);
    expect(JSON.stringify(bad)).not.toContain("Dùng JOIN");
  });

  it("chưa có phân tích ⇒ rỗng", () => {
    expect(buildSummary(list, "PENDING")).toEqual({ good: [], bad: [] });
  });
});

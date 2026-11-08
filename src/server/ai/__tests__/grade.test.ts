import { echoesQuestion, leaksNumbers, verifyFollowUp } from "../guard/followup";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts/config";
import type {
  GradeContext,
  GradingRaw,
  SessionRow,
} from "@/contracts";
import {
  INJECTION_MARKER,
  coveredFlags,
  decideFollowUp,
  decidePass,
  expectedFollowUpType,
  gradeWithAI,
  injectionGrading,
  normalizeGrading,
  staticFeedback,
  staticHint,
  staticTeachHint,
  isGiveUpText,
  giveUpGrading,
  toEvaluateResponse,
  type EvaluateResponseExtra,
} from "../grade";
import { giveUpHintRule, gradeRequest, parseGradingRaw } from "../prompts/grade";
import { callLLMWithRetry } from "../gemini";
import { logGuardBlocked } from "@/server/log";
import fixtureGradingN3Q1 from "../__fixtures__/grading-n3-q1.json";

vi.mock("@/server/ai/gemini", () => ({
  callLLMWithRetry: vi.fn(),
  assertGeminiEnv: vi.fn().mockReturnValue("studio"),
  isAiDisabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/server/log", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
  logGuardBlocked: vi.fn(),
  logAiCall: vi.fn(),
}));

function createMockGradeContext(): GradeContext {
  return {
    question_index: 1,
    skill: "DB_OPTIMIZATION",
    tier: "NOVICE",
    focus: "WEAKNESS",
    step_indices: [1, 2, 3],
    feynman_question:
      "Trang danh sách có 200 sản phẩm. Vì sao càng nhiều sản phẩm thì trang càng chậm?",
    reference_answer:
      "Sau khi `productRepo.findAll` lấy danh sách 1 lần, vòng lặp gọi `categoryRepo.findById` cho từng sản phẩm. Mỗi sản phẩm tốn thêm 1 truy vấn, nên 200 sản phẩm thành 201 truy vấn.",
    must_have_points: [
      "Mỗi sản phẩm tốn thêm 1 truy vấn để lấy loại hàng",
      "Số truy vấn tăng theo số sản phẩm, không cố định",
    ],
    fix: "Cho findAll lấy kèm loại hàng (relations: ['category']) ⇒ còn 1 truy vấn; hoặc gom các categoryId rồi tìm 1 lần bằng IN (...) ⇒ còn 2 truy vấn.",
    steps: [
      {
        step_index: 1,
        layer: "ENTRY_POINT",
        file_path: "src/controllers/product.controller.ts",
        function_name: "router.get",
      },
      {
        step_index: 2,
        layer: "BUSINESS_LOGIC",
        file_path: "src/services/product.service.ts",
        function_name: "listProducts",
      },
      {
        step_index: 3,
        layer: "DATA_ACCESS",
        file_path: "src/repos/category.repo.ts",
        function_name: "findById",
      },
    ],
    forbidden_external_keywords: ["redis", "kafka"],
    attempts_used: 0,
    finished: false,
    outcome: null,
    ended_by: null,
    disputed: false,
    p_before: null,
    p_after: null,
    last_answer: null,
  };
}

function createMockSession(): SessionRow {
  return {
    id: "session-test-1",
    user_id: "user-1",
    engine_version: CONFIG.ENGINE_VERSION,
    tokens_used: 1000,
  };
}

function createMockEvaluateExtra(): EvaluateResponseExtra {
  return {
    question: {
      question_index: 1,
      feynman_question:
        "Trang danh sách có 200 sản phẩm. Vì sao càng nhiều sản phẩm thì trang càng chậm?",
      skill: "DB_OPTIMIZATION",
      tier: "NOVICE",
      focus: "WEAKNESS",
      attempts_used: 1,
      finished: false,
      outcome: null,
      ended_by: null,
      disputed: false,
      reveal: null,
    },
    skill_change: null,
    node_state: {
      node_id: "N3",
      status: "AVAILABLE",
      has_warning: false,
      analysis_failed: false,
      last_run: null,
    },
    unlocked_node_ids: [],
    tokens_used: 100,
  };
}

describe("server/ai/grade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("expectedFollowUpType", () => {
    it("[AI-31] expectedFollowUpType trả về đúng loại cho đủ 3 bậc × lượt", () => {
      const max = 3;
      // NOVICE: 1 -> CODE_POINTER, 2 -> CODE_POINTER, 3 -> null
      expect(expectedFollowUpType(1, max, "NOVICE")).toBe("CODE_POINTER");
      expect(expectedFollowUpType(2, max, "NOVICE")).toBe("CODE_POINTER");
      expect(expectedFollowUpType(3, max, "NOVICE")).toBeNull();

      // PRACTITIONER: 1 -> CONCEPT, 2 -> CODE_POINTER, 3 -> null
      expect(expectedFollowUpType(1, max, "PRACTITIONER")).toBe("CONCEPT");
      expect(expectedFollowUpType(2, max, "PRACTITIONER")).toBe("CODE_POINTER");
      expect(expectedFollowUpType(3, max, "PRACTITIONER")).toBeNull();

      // ARCHITECT: 1 -> CONCEPT, 2 -> CONCEPT, 3 -> null
      expect(expectedFollowUpType(1, max, "ARCHITECT")).toBe("CONCEPT");
      expect(expectedFollowUpType(2, max, "ARCHITECT")).toBe("CONCEPT");
      expect(expectedFollowUpType(3, max, "ARCHITECT")).toBeNull();
    });
  });

  describe("parseGradingRaw", () => {
    it("[AI-29] parseGradingRaw phân tích đúng đối tượng JSON hợp lệ", () => {
      const parsed = parseGradingRaw(fixtureGradingN3Q1);
      expect(parsed).not.toBeNull();
      expect(parsed?.core_accuracy).toBe(50);
      expect(parsed?.intent).toBe("ANSWER");
      expect(parsed?.points).toHaveLength(2);
    });

    it("[AI-29] parseGradingRaw trả null khi dữ liệu thiếu trường hoặc sai kiểu", () => {
      expect(parseGradingRaw(null)).toBeNull();
      expect(parseGradingRaw("invalid")).toBeNull();
      expect(parseGradingRaw({ core_accuracy: 50 })).toBeNull();
      expect(
        parseGradingRaw({
          ...fixtureGradingN3Q1,
          intent: "INVALID_INTENT",
        }),
      ).toBeNull();
    });
  });

  describe("Kịch bản A (A4, A5, A6)", () => {
    it("[A4] Nộp Q1 lượt 1: chưa đạt, gợi ý CODE_POINTER cho NOVICE (AI trả CONCEPT bị đổi sang mẫu tĩnh), không lộ reveal", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const raw = fixtureGradingN3Q1 as unknown as GradingRaw;

      const normalized = normalizeGrading(raw, t, answer);
      const isPassed = decidePass(normalized, t.must_have_points, answer);
      const flags = coveredFlags(normalized, t.must_have_points, answer);
      const followUp = decideFollowUp(normalized, 1, 3, isPassed, t, answer);

      expect(isPassed).toBe(false);
      expect(flags).toEqual([false, false]);
      expect(followUp?.type).toBe("CODE_POINTER");
      expect(followUp?.step_index).toBe(2);

      const resp = toEvaluateResponse(
        normalized,
        t,
        answer,
        1,
        3,
        createMockEvaluateExtra(),
      );
      expect(resp.is_passed).toBe(false);
      expect(resp.question.finished).toBe(false);
      expect(resp.question.reveal).toBeNull();
      expect((resp as unknown as Record<string, unknown>).misconception).toBeUndefined();
    });

    it("[A5] Nộp Q1 lượt 2: đạt, cả 2 trích dẫn có thật, có reveal", () => {
      const t = createMockGradeContext();
      const answer =
        "Vì lấy danh sách xong, code còn hỏi database thêm một lần cho mỗi sản phẩm để lấy loại hàng. 200 sản phẩm là 201 lần hỏi, càng nhiều sản phẩm càng nhiều lần hỏi.";
      const raw: GradingRaw = {
        core_accuracy: 90,
        simplicity: 60,
        intent: "ANSWER",
        points: [
          {
            index: 1,
            covered: true,
            quote: "hỏi database thêm một lần cho mỗi sản phẩm",
          },
          {
            index: 2,
            covered: true,
            quote: "càng nhiều sản phẩm càng nhiều lần hỏi",
          },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback:
          "Chính xác! Bạn giải thích đúng vì sao số truy vấn tăng theo số sản phẩm.",
        detected_jargons: ["database"],
      };

      const normalized = normalizeGrading(raw, t, answer);
      const isPassed = decidePass(normalized, t.must_have_points, answer);
      const flags = coveredFlags(normalized, t.must_have_points, answer);
      const followUp = decideFollowUp(normalized, 2, 3, isPassed, t, answer);

      expect(isPassed).toBe(true);
      expect(flags).toEqual([true, true]);
      expect(followUp).toBeNull();

      const resp = toEvaluateResponse(
        normalized,
        t,
        answer,
        2,
        3,
        createMockEvaluateExtra(),
      );
      expect(resp.is_passed).toBe(true);
      expect(resp.question.finished).toBe(true);
      expect(resp.question.reveal).not.toBeNull();
      expect(resp.question.reveal?.reference_answer).toBe(t.reference_answer);
      expect(resp.question.reveal?.must_have_points).toEqual(t.must_have_points);
    });

    it("[A6] Nộp Q2 lượt 1: đạt ngay (PASS_FIRST)", () => {
      const t = createMockGradeContext();
      t.question_index = 2;
      t.skill = "LAYERED_SEPARATION";
      t.focus = "FLOW";
      t.feynman_question =
        "Sản phẩm trả về có thêm thông tin loại hàng. Loại hàng đó từ đâu mà có?";
      t.reference_answer =
        "Route ở `product.controller.ts` gọi `productService.listProducts`...";
      t.must_have_points = [
        "Nêu đúng đường đi: route gọi service, service nhờ repo tìm loại hàng",
        "Loại hàng tìm theo categoryId của từng sản phẩm rồi gắn vào sản phẩm trước khi trả về",
      ];

      const answer =
        "Đường đi là route gọi service, service nhờ repo tìm loại hàng, sau đó loại hàng tìm theo categoryId của từng sản phẩm rồi gắn vào sản phẩm trước khi trả về.";
      const raw: GradingRaw = {
        core_accuracy: 95,
        simplicity: 80,
        intent: "ANSWER",
        points: [
          {
            index: 1,
            covered: true,
            quote:
              "route gọi service, service nhờ repo tìm loại hàng",
          },
          {
            index: 2,
            covered: true,
            quote:
              "loại hàng tìm theo categoryId của từng sản phẩm rồi gắn vào sản phẩm trước khi trả về",
          },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Chính xác! Bạn nêu rất rõ luồng di chuyển của dữ liệu.",
        detected_jargons: [],
      };

      const normalized = normalizeGrading(raw, t, answer);
      const isPassed = decidePass(normalized, t.must_have_points, answer);
      expect(isPassed).toBe(true);

      const followUp = decideFollowUp(normalized, 1, 3, isPassed, t, answer);
      expect(followUp).toBeNull();
    });
  });

  describe("Kịch bản D (D1, D10)", () => {
    it("[D1] Chèn lệnh: injectionGrading tạo bản chấm 0 điểm, OFF_TOPIC, follow_up = null, không lộ misconception", () => {
      const t = createMockGradeContext();
      const g = injectionGrading(t);

      expect(g.core_accuracy).toBe(0);
      expect(g.simplicity).toBe(0);
      expect(g.intent).toBe("OFF_TOPIC");
      expect(g.misconception).toBe(INJECTION_MARKER);
      expect(g.points.every((p) => !p.covered)).toBe(true);

      const isPassed = decidePass(g, t.must_have_points, "chèn lệnh");
      expect(isPassed).toBe(false);

      const followUp = decideFollowUp(g, 1, 3, isPassed, t, "chèn lệnh");
      expect(followUp).toBeNull();

      const resp = toEvaluateResponse(
        g,
        t,
        "chèn lệnh",
        1,
        3,
        createMockEvaluateExtra(),
      );
      expect(resp.is_passed).toBe(false);
      expect(resp.follow_up).toBeNull();
      expect((resp as unknown as Record<string, unknown>).misconception).toBeUndefined();
    });

    it("[D10] Gõ 'chịu': intent = GIVE_UP vẫn tính lượt, có gợi ý tĩnh CODE_POINTER", () => {
      const t = createMockGradeContext();
      const raw: GradingRaw = {
        core_accuracy: 0,
        simplicity: 0,
        intent: "GIVE_UP",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "Người học bỏ cuộc.",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Đừng lo, hãy xem gợi ý để tiếp tục thử lại nhé.",
        detected_jargons: [],
      };

      const normalized = normalizeGrading(raw, t, "chịu");
      expect(normalized.core_accuracy).toBe(0);
      expect(normalized.intent).toBe("GIVE_UP");

      const isPassed = decidePass(normalized, t.must_have_points, "chịu");
      expect(isPassed).toBe(false);

      const followUp = decideFollowUp(normalized, 1, 3, isPassed, t, "chịu");
      expect(followUp).not.toBeNull();
      expect(followUp?.type).toBe("CODE_POINTER");
      expect(followUp?.step_index).toBe(2);
    });
  });

  describe("Luật nới K3", () => {
    it("[K3] Câu đúng nhưng trích dẫn lệch 1 dấu ⇒ Đạt (core_accuracy >= PASS_CORE_ACCURACY)", () => {
      const t = createMockGradeContext();
      const answer =
        "Vì lấy danh sách xong, code còn hỏi database thêm một lần cho mỗi sản phẩm để lấy loại hàng. 200 sản phẩm là 201 lần hỏi, càng nhiều sản phẩm càng nhiều lần hỏi.";

      // Quote ý 2 bị lệch 1 dấu chấm than so với câu trả lời
      const g: GradingRaw = {
        core_accuracy: 90,
        simplicity: 60,
        intent: "ANSWER",
        points: [
          {
            index: 1,
            covered: true,
            quote: "hỏi database thêm một lần cho mỗi sản phẩm",
          },
          {
            index: 2,
            covered: true,
            quote: "càng nhiều sản phẩm càng nhiều lần hỏi!",
          },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Tốt lắm!",
        detected_jargons: ["database"],
      };

      const flags = coveredFlags(g, t.must_have_points, answer);
      expect(flags).toEqual([true, true]);

      const isPassed = decidePass(g, t.must_have_points, answer);
      expect(isPassed).toBe(true);
    });

    it("[K3] core_accuracy < PASS_CORE_ACCURACY thì trích dẫn lệch sẽ không tính covered", () => {
      const t = createMockGradeContext();
      const answer = "Vì lấy danh sách xong, code còn hỏi database thêm.";

      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 50,
        intent: "ANSWER",
        points: [
          {
            index: 1,
            covered: true,
            quote: "code còn hỏi database thêm",
          },
          {
            index: 2,
            covered: true,
            quote: "đoạn này hoàn toàn không có trong câu trả lời",
          },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Chưa đủ ý.",
        detected_jargons: [],
      };

      const flags = coveredFlags(g, t.must_have_points, answer);
      expect(flags).toEqual([true, false]);

      const isPassed = decidePass(g, t.must_have_points, answer);
      expect(isPassed).toBe(false);
    });
  });

  describe("Câu bí và gợi ý nhắc lại đề", () => {
    it("isGiveUpText bắt câu bí ngắn (đúng các câu đã gõ khi thử tay)", () => {
      for (const a of ["em không biết", "em không biết á", "không biết luôn", "chưa biết luôn", "cũng chưa biết nó xử lí sao luôn", "Chịu.", "k biết", "ko bít", "bó tay", "?", "idk", "mình thật sự không hiểu"]) {
        expect(isGiveUpText(a), a).toBe(true);
      }
    });

    it("isGiveUpText KHÔNG nuốt câu trả lời thật có chữ 'không biết'", () => {
      for (const a of [
        "Hàm register không biết email đã tồn tại nên gọi findByEmail để kiểm tra",
        "không biết, nhưng chắc là parse ném lỗi",
        "Vì không biết trước số sản phẩm nên vòng lặp chạy nhiều lần",
        "hôm nay trời đẹp quá",
      ]) {
        expect(isGiveUpText(a), a).toBe(false);
      }
    });

    it("giveUpGrading: GIVE_UP, 0 điểm, không ý nào trúng, lời nhắn thân thiện", () => {
      const t = createMockGradeContext();
      const g = giveUpGrading(t);
      expect(g.intent).toBe("GIVE_UP");
      expect(g.core_accuracy).toBe(0);
      expect(g.points.every((p) => !p.covered)).toBe(true);
      expect(g.feedback).toContain("Không sao");
      expect(decideFollowUp(g, 1, 3, false, t, "em không biết")?.type).toBe("CODE_POINTER");
    });

    it("Gợi ý chỉ nhắc lại đề ⇒ cổng gác không dùng; câu mồi có tình huống mới ⇒ dùng", () => {
      const q = "Ở Bước 1, nếu dữ liệu gửi lên không đúng định dạng thì hàm registerSchema.parse sẽ phản hồi thế nào?";
      expect(echoesQuestion("Hàm registerSchema.parse sẽ phản hồi thế nào khi nhận dữ liệu không đúng định dạng?", q)).toBe(true);
      expect(echoesQuestion("Giả sử gửi lên body rỗng {}, hàm registerSchema.parse sẽ trả về kết quả gì?", q)).toBe(false);

      const t = { ...createMockGradeContext(), feynman_question: "Trang danh sách có 200 sản phẩm. Vì sao càng nhiều sản phẩm thì trang càng chậm?" };
      const g: GradingRaw = {
        core_accuracy: 10, simplicity: 50, intent: "ANSWER",
        points: [{ index: 1, covered: false, quote: "" }, { index: 2, covered: false, quote: "" }],
        misconception: "", follow_up_question: "Vì sao càng nhiều sản phẩm thì trang càng chậm?",
        follow_up_type: "CODE_POINTER", follow_up_step_index: 2,
        feedback: "Còn thiếu một chút.", detected_jargons: [],
      };
      expect(verifyFollowUp(g, t, "vì dữ liệu nhiều", false).follow_up_ok).toBe(false);
    });
  });

  describe("Luật nới K4", () => {
    it("[K4] GIVE_UP lượt 1 ⇒ có follow_up CODE_POINTER", () => {
      const t = createMockGradeContext();
      const g: GradingRaw = {
        core_accuracy: 0,
        simplicity: 0,
        intent: "GIVE_UP",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Chưa đạt.",
        detected_jargons: [],
      };

      const followUp = decideFollowUp(g, 1, 3, false, t, "em không biết");
      expect(followUp).not.toBeNull();
      expect(followUp?.type).toBe("CODE_POINTER");
    });

    it("[K4] GIVE_UP: câu mồi của AI qua cổng gác ⇒ dùng câu AI; lộ số đáp án ⇒ dùng câu tĩnh", () => {
      const t = createMockGradeContext();
      const base: GradingRaw = {
        core_accuracy: 0, simplicity: 0, intent: "GIVE_UP",
        points: [{ index: 1, covered: false, quote: "" }, { index: 2, covered: false, quote: "" }],
        misconception: "", follow_up_question: null, follow_up_type: "CODE_POINTER", follow_up_step_index: 2,
        feedback: "Chưa đạt.", detected_jargons: [],
      };
      const goodQ = "Giả sử chỉ có vài sản phẩm, lệnh tìm loại hàng trong vòng lặp sẽ chạy mấy lần?";
      const good = decideFollowUp({ ...base, follow_up_question: goodQ }, 1, 3, false, t, "chịu");
      expect(good?.question).toBe(goodQ);

      const secretNum = (t.reference_answer.match(/\d+/) ?? ["201"])[0];
      const leakQ = `Tổng cộng có phải ${secretNum} truy vấn không?`;
      const leak = decideFollowUp({ ...base, follow_up_question: leakQ }, 1, 3, false, t, "chịu");
      expect(leak?.type).toBe("CODE_POINTER");
      expect(leak?.question).not.toBe(leakQ);
    });

    it("[K4] Thang gợi ý khi bí: lượt 1 câu mồi tĩnh, lượt 2 gợi ý dạy nói thẳng ý đầu tiên còn thiếu", () => {
      const t = createMockGradeContext();
      const g: GradingRaw = {
        core_accuracy: 0, simplicity: 0, intent: "GIVE_UP",
        points: [{ index: 1, covered: false, quote: "" }, { index: 2, covered: false, quote: "" }],
        misconception: "", follow_up_question: null, follow_up_type: null, follow_up_step_index: null,
        feedback: "Chưa đạt.", detected_jargons: [],
      };
      const l1 = decideFollowUp(g, 1, 3, false, t, "không biết luôn");
      const l2 = decideFollowUp(g, 2, 3, false, t, "cũng chưa biết luôn");
      expect(l1?.type).toBe("CODE_POINTER");
      expect(l1?.question).not.toContain(t.must_have_points[0].replace(/\.$/, ""));
      expect(l2?.type).toBe("CODE_POINTER");
      expect(l2?.question).toContain(t.must_have_points[0]);
      expect(l2?.question).not.toContain("Gợi ý:");
      expect(l2?.question).not.toBe(l1?.question);
    });

    it("[K4] Gợi ý dạy tĩnh nói ý ĐẦU TIÊN CÒN THIẾU (bỏ qua ý đã trúng)", () => {
      const t = createMockGradeContext();
      const answer = "Mỗi sản phẩm tốn thêm 1 truy vấn để lấy loại hàng";
      const g: GradingRaw = {
        core_accuracy: 40, simplicity: 50, intent: "ANSWER",
        points: [{ index: 1, covered: true, quote: answer }, { index: 2, covered: false, quote: "" }],
        misconception: "", follow_up_question: null, follow_up_type: null, follow_up_step_index: null,
        feedback: "Chưa đạt.", detected_jargons: [],
      };
      const h = staticTeachHint(g, t, answer, 2);
      expect(h.question).toContain(t.must_have_points[1]);
      expect(h.question).not.toContain(t.must_have_points[0]);
      expect(h.step_index).toBe(2);
    });

    it("[K4] Lượt 2 bí, AI cho gợi ý dạy qua cổng gác ⇒ dùng câu của AI", () => {
      const t = createMockGradeContext();
      const aiQ = "`categoryRepo.findById` mỗi lần gọi là một lần hỏi cơ sở dữ liệu. Vậy nếu nó nằm trong vòng lặp, số lần hỏi có đổi theo số sản phẩm không?";
      const g: GradingRaw = {
        core_accuracy: 0, simplicity: 0, intent: "GIVE_UP",
        points: [{ index: 1, covered: false, quote: "" }, { index: 2, covered: false, quote: "" }],
        misconception: "", follow_up_question: aiQ, follow_up_type: "CODE_POINTER", follow_up_step_index: 2,
        feedback: "Chưa đạt.", detected_jargons: [],
      };
      expect(decideFollowUp(g, 2, 3, false, t, "chịu")?.question).toBe(aiQ);
    });

    it("[K4] gradeWithAI: bí ở lượt 2 và gợi ý AI trượt cổng gác ⇒ ra gợi ý dạy tĩnh, không phải câu chỉ chỗ", async () => {
      const t = createMockGradeContext();
      const secretNum = (t.reference_answer.match(/\d+/) ?? ["201"])[0];
      vi.mocked(callLLMWithRetry).mockResolvedValueOnce({
        ok: true,
        value: {
          core_accuracy: 0, simplicity: 0, intent: "GIVE_UP",
          points: [{ index: 1, covered: false, quote: "" }, { index: 2, covered: false, quote: "" }],
          misconception: "", follow_up_question: `Có phải ${secretNum} truy vấn không?`,
          follow_up_type: "CODE_POINTER", follow_up_step_index: 2,
          feedback: "Không sao, mình cùng xem lại nhé.", detected_jargons: [],
        } as GradingRaw,
        tokens_in: 100, tokens_out: 50, model: "gemini-3.8-flash", fell_back: false,
      });
      const g = await gradeWithAI(t, "chưa biết luôn", 2, 3, createMockSession());
      const fu = decideFollowUp(g, 2, 3, false, t, "chưa biết luôn");
      expect(fu?.question).toContain(t.must_have_points[0]);
    });

    it("[K4] Prompt chấm có luật bí theo lượt: lượt 1 CÂU HỎI MỒI, lượt 2 GỢI Ý DẠY, lượt cuối không có", () => {
      expect(giveUpHintRule(1, 3)).toContain("CÂU HỎI MỒI");
      expect(giveUpHintRule(2, 3)).toContain("GỢI Ý DẠY");
      expect(giveUpHintRule(3, 3)).toBeNull();
      const t = createMockGradeContext();
      const req = gradeRequest(t, "không biết", 2, 3, createMockSession());
      expect(JSON.stringify(req)).toContain("GỢI Ý DẠY");
    });

    it("[K4] GIVE_UP lượt cuối ⇒ không follow_up (null)", () => {
      const t = createMockGradeContext();
      const g: GradingRaw = {
        core_accuracy: 0,
        simplicity: 0,
        intent: "GIVE_UP",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Đã hết lượt.",
        detected_jargons: [],
      };

      const followUp = decideFollowUp(g, 3, 3, false, t, "em không biết");
      expect(followUp).toBeNull();
    });

    it("[K4] OFF_TOPIC (không phải injection) lượt 1 ⇒ có follow_up CODE_POINTER", () => {
      const t = createMockGradeContext();
      const g: GradingRaw = {
        core_accuracy: 0,
        simplicity: 0,
        intent: "OFF_TOPIC",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Bạn nói chuyện phiếm rồi.",
        detected_jargons: [],
      };

      const followUp = decideFollowUp(g, 1, 3, false, t, "Hôm nay trời đẹp quá");
      expect(followUp).not.toBeNull();
      expect(followUp?.type).toBe("CODE_POINTER");
    });
  });

  describe("GUARD-14 làm sạch thuật ngữ", () => {
    it("[GUARD-14] detected_jargons chỉ giữ từ có trong câu trả lời", () => {
      const t = createMockGradeContext();
      const answer = "Do truy vấn database nhiều lần.";
      const raw: GradingRaw = {
        core_accuracy: 50,
        simplicity: 60,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Cố lên.",
        detected_jargons: ["database", "N+1"],
      };

      const normalized = normalizeGrading(raw, t, answer);
      expect(normalized.detected_jargons).toEqual(["database"]);
    });
  });

  describe("gradeWithAI", () => {
    it("[AI-27] gradeWithAI gọi qua callLLMWithRetry và trả về kết quả đã chuẩn hóa", () => {
      vi.mocked(callLLMWithRetry).mockResolvedValueOnce({
        ok: true,
        value: fixtureGradingN3Q1 as unknown as GradingRaw,
        tokens_in: 120,
        tokens_out: 80,
        model: "gemini-3.8-flash",
        fell_back: false,
      });

      const t = createMockGradeContext();
      const session = createMockSession();

      return gradeWithAI(
        t,
        "Vì có 200 sản phẩm nên dữ liệu nhiều.",
        1,
        3,
        session,
      ).then((res) => {
        expect(res.core_accuracy).toBe(50);
        expect(res.intent).toBe("ANSWER");
        expect(callLLMWithRetry).toHaveBeenCalledTimes(1);
      });
    });

    it("[AI-27] gradeWithAI khi AI lỗi hẳn (outcome.ok = false) ⇒ ném ApiHttpError ERR_AI_UNAVAILABLE", async () => {
      vi.mocked(callLLMWithRetry).mockResolvedValueOnce({
        ok: false,
        kind: "TRANSIENT",
        tokens_in: 50,
        tokens_out: 0,
        model: "gemini-3.8-flash",
        fell_back: false,
      });

      const t = createMockGradeContext();
      const session = createMockSession();

      await expect(
        gradeWithAI(t, "Câu trả lời thử nghiệm", 1, 3, session),
      ).rejects.toMatchObject({ code: "ERR_AI_UNAVAILABLE" });
    });

    it("[AI-27] gradeWithAI khi quota đã hết ⇒ ném ERR_TOKEN_QUOTA_EXCEEDED không gọi AI", async () => {
      const t = createMockGradeContext();
      const session = {
        ...createMockSession(),
        tokens_used: CONFIG.SESSION_TOKEN_QUOTA + 10,
      };

      await expect(
        gradeWithAI(t, "Câu trả lời thử nghiệm", 1, 3, session),
      ).rejects.toMatchObject({ code: "ERR_TOKEN_QUOTA_EXCEEDED" });

      expect(callLLMWithRetry).not.toHaveBeenCalled();
    });

    it("[AI-27] gradeWithAI khi gợi ý AI trượt verifyFollowUp ⇒ log mã G1, thay bằng staticHint", async () => {
      // AI trả CONCEPT nhưng lộ tên hàm listProducts
      const badAIOutput: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "Nghĩ trang chậm do dữ liệu lớn.",
        follow_up_question: "Hãy nhìn vào hàm listProducts xem nó làm gì?",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Bạn thấy đúng là nhiều sản phẩm thì chậm hơn.",
        detected_jargons: [],
      };

      vi.mocked(callLLMWithRetry).mockResolvedValueOnce({
        ok: true,
        value: badAIOutput,
        tokens_in: 120,
        tokens_out: 80,
        model: "gemini-3.8-flash",
        fell_back: false,
      });

      const t = createMockGradeContext();
      const session = createMockSession();

      const res = await gradeWithAI(
        t,
        "Vì có 200 sản phẩm nên dữ liệu nhiều.",
        1,
        3,
        session,
      );

      expect(logGuardBlocked).toHaveBeenCalled();
      const blockedCall = vi.mocked(logGuardBlocked).mock.calls[0][0];
      expect(blockedCall.codes).toContain("G1");

      // Gợi ý AI bị thay bằng staticHint theo loại đúng bậc/lượt (AI-32), không còn câu của AI
      expect(res.follow_up_question).not.toBe(badAIOutput.follow_up_question);
    });
  });

  describe("staticHint và staticFeedback", () => {
    it("[AI-32] staticHint CONCEPT theo các focus", () => {
      const t = createMockGradeContext();
      t.focus = "WEAKNESS";
      expect(staticHint("CONCEPT", t).question).toContain("vấn đề gì");

      t.focus = "FLOW";
      expect(staticHint("CONCEPT", t).question).toContain("luồng");

      t.focus = "ARCHITECTURE";
      expect(staticHint("CONCEPT", t).question).toContain("Các tầng");

      t.focus = "CHANGE";
      expect(staticHint("CONCEPT", t).question).toContain("ảnh hưởng");
    });

    it("[AI-32] staticHint CODE_POINTER là câu hỏi mồi theo focus: tình huống nhỏ + việc đếm/lần theo", () => {
      const base = createMockGradeContext();
      const w = staticHint("CODE_POINTER", { ...base, focus: "WEAKNESS" }, 2);
      expect(w.type).toBe("CODE_POINTER");
      expect(w.step_index).toBe(2);
      expect(w.question).toContain("bước 2");
      expect(w.question).toContain("người dùng sẽ thấy gì");
      expect(w.question).not.toContain("điều gì xảy ra ở đây");
      expect(staticHint("CODE_POINTER", { ...base, focus: "FLOW" }, 2).question).toContain("1 đầu vào cụ thể");
      expect(staticHint("CODE_POINTER", { ...base, focus: "FLOW" }, 2).question).not.toContain("phần tử");
      expect(staticHint("CODE_POINTER", { ...base, focus: "ARCHITECTURE" }, 2).question).toContain("gọi hàm khác");
      expect(staticHint("CODE_POINTER", { ...base, focus: "CHANGE" }, 2).question).toContain("phải sửa");
    });

    it("[AI-32] staticHint CODE_POINTER không dùng số nên không lộ số của đáp án", () => {
      const base = createMockGradeContext();
      const t = { ...base, focus: "WEAKNESS" as const, reference_answer: "Có 3 truy vấn cho 3 sản phẩm.", must_have_points: ["ý một", "ý hai"] };
      const q = staticHint("CODE_POINTER", t, 2).question;
      expect(q).not.toMatch(/\d+ phần tử/u);
      expect(leaksNumbers(q, t, "")).toBe(false);
    });

    it("[AI-32] staticFeedback cho các trạng thái", () => {
      expect(staticFeedback(true, 1, 3)).toContain("Chính xác");
      expect(staticFeedback(false, 1, 3)).toContain("gợi ý bên dưới");
      expect(staticFeedback(false, 3, 3)).toContain("đáp án mẫu");
    });
  });
});

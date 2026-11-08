import { describe, expect, it } from "vitest";
import { leaksNumbers, verifyFollowUp } from "../followup";
import type { GradeContext, GradingRaw } from "@/contracts";

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

describe("guard/followup", () => {
  describe("leaksNumbers", () => {
    it("[GUARD-13] leaksNumbers: phát hiện số 201 trong reference_answer chưa có ở question/answer", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      expect(leaksNumbers("Tổng phải là 201", t, answer)).toBe(true);
    });

    it("[GUARD-13] leaksNumbers: không coi số 200 là lộ vì đã xuất hiện trong câu hỏi và câu trả lời", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      expect(leaksNumbers("Bạn đã nhắc đúng số 200 sản phẩm.", t, answer)).toBe(false);
    });
  });

  describe("verifyFollowUp", () => {
    it("[GUARD-13] 50 2.4 lượt 1: gợi ý CONCEPT hợp lệ và feedback hợp lệ", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "Nghĩ trang chậm do dữ liệu lớn.",
        follow_up_question:
          "Sau khi có danh sách, trang còn cần thêm thông tin gì cho từng sản phẩm? Thông tin đó được lấy bằng cách nào?",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Bạn thấy đúng là nhiều sản phẩm thì chậm hơn, nhưng chưa nói vì sao.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.follow_up_ok).toBe(true);
      expect(result.feedback_ok).toBe(true);
    });

    it("[GUARD-13] CONCEPT có 'bước 2' ⇒ follow_up_ok = false", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: "Hãy nhìn bước 2 để xem database được gọi thế nào?",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Chưa đúng.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.follow_up_ok).toBe(false);
    });

    it("[GUARD-13] CONCEPT chứa tên hàm listProducts ⇒ follow_up_ok = false", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: "Điều gì xảy ra khi listProducts thực thi?",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Chưa đúng.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.follow_up_ok).toBe(false);
    });

    it("[GUARD-13] CONCEPT chứa tên file ⇒ follow_up_ok = false", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: "Hãy xem file product.service.ts để hiểu rõ hơn.",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Chưa đúng.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.follow_up_ok).toBe(false);
    });

    it("[GUARD-13] Feedback chưa đạt có 'Bạn quên `findAll`' khi câu trả lời không có findAll ⇒ feedback_ok = false", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: "Hãy suy nghĩ thêm.",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Bạn quên `findAll` rồi.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.feedback_ok).toBe(false);
    });

    it("[GUARD-13] Feedback chưa đạt 'Tổng phải là 201' ⇒ lộ số ⇒ feedback_ok = false", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: "Hãy suy nghĩ thêm.",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Tổng phải là 201 truy vấn.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.feedback_ok).toBe(false);
    });

    it("[GUARD-13] Feedback chưa đạt có LOC_RE 'ở bước 2' mà câu trả lời không có ⇒ feedback_ok = false", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: "Hãy suy nghĩ thêm.",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Hãy xem lại ở bước 2 để làm rõ hơn.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.feedback_ok).toBe(false);
    });

    it("[GUARD-13] Feedback khi đạt (isPassed = true) có tên hàm trong backtick ⇒ feedback_ok = true", () => {
      const t = createMockGradeContext();
      const answer =
        "Vì lấy danh sách xong, code còn hỏi database thêm một lần cho mỗi sản phẩm để lấy loại hàng. 200 sản phẩm là 201 lần hỏi, càng nhiều sản phẩm càng nhiều lần hỏi.";
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
            quote: "càng nhiều sản phẩm càng nhiều lần hỏi",
          },
        ],
        misconception: "",
        follow_up_question: null,
        follow_up_type: null,
        follow_up_step_index: null,
        feedback: "Chính xác! Bạn giải thích đúng vai trò của `findById` trong vòng lặp.",
        detected_jargons: ["database"],
      };

      const result = verifyFollowUp(g, t, answer, true);
      expect(result.feedback_ok).toBe(true);
    });

    it("[GUARD-13] CODE_POINTER có step_index trong t.step_indices và không lộ số bí mật ⇒ follow_up_ok = true", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question:
          "Hãy nhìn vào hàm `listProducts` ở bước 2: điều gì xảy ra với mỗi sản phẩm?",
        follow_up_type: "CODE_POINTER",
        follow_up_step_index: 2,
        feedback: "Bạn thấy đúng là nhiều sản phẩm thì chậm hơn.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.follow_up_ok).toBe(true);
    });

    it("[GUARD-13] CODE_POINTER có step_index ngoài t.step_indices ⇒ follow_up_ok = false", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question:
          "Hãy nhìn vào hàm `listProducts` ở bước 9: điều gì xảy ra?",
        follow_up_type: "CODE_POINTER",
        follow_up_step_index: 9,
        feedback: "Chưa đúng.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.follow_up_ok).toBe(false);
    });

    it("[GUARD-13] Chứa công nghệ cấm (ví dụ redis) ⇒ follow_up_ok = false", () => {
      const t = createMockGradeContext();
      const answer = "Vì có 200 sản phẩm nên dữ liệu nhiều.";
      const g: GradingRaw = {
        core_accuracy: 50,
        simplicity: 70,
        intent: "ANSWER",
        points: [
          { index: 1, covered: false, quote: "" },
          { index: 2, covered: false, quote: "" },
        ],
        misconception: "",
        follow_up_question: "Có phải hệ thống nên dùng Redis để giảm tải không?",
        follow_up_type: "CONCEPT",
        follow_up_step_index: null,
        feedback: "Chưa đúng.",
        detected_jargons: [],
      };

      const result = verifyFollowUp(g, t, answer, false);
      expect(result.follow_up_ok).toBe(false);
    });
  });
});

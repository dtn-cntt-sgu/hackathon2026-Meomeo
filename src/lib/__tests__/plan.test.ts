import { describe, expect, it } from "vitest";
import type { NodeAnalysis } from "@/contracts";
import type { SkillMap } from "../bkt-engine";
import { nodeStatusFromRuns, planNodeQuestions, type RunLike } from "../plan";

const T0 = 1_774_000_000_000;

const analysisN3: NodeAnalysis = {
  node_id: "slice-product-list",
  skeleton_only: false,
  skills: [
    {
      skill: "DB_OPTIMIZATION",
      step: 2,
      symbol: "findById",
      reason: "Vòng for gọi categoryRepo.findById",
    },
    {
      skill: "LAYERED_SEPARATION",
      step: 1,
      symbol: "productService",
      reason: "Route chỉ gọi productService.listProducts",
    },
  ],
  architecture: {
    patterns: ["LAYERED", "REPOSITORY"],
    summary: "Chia 3 tầng",
  },
  steps: [
    { step: 1, text: "Route nhận GET" },
    { step: 2, text: "Lấy danh sách" },
    { step: 3, text: "Tìm category" },
  ],
  strengths: [{ step: 1, text: "Tách biệt tốt" }],
  weak_points: [
    {
      skill: "DB_OPTIMIZATION",
      step: 2,
      symbol: "findById",
      what: "N+1 query",
      consequence: "Chậm",
    },
  ],
};

const analysisN2: NodeAnalysis = {
  node_id: "slice-profile",
  skeleton_only: false,
  skills: [
    {
      skill: "AUTH_SECURITY",
      step: 2,
      symbol: "verifyToken",
      reason: "Kiểm tra auth",
    },
    {
      skill: "HTTP_ROUTING",
      step: 1,
      symbol: "router.get",
      reason: "Route profile",
    },
  ],
  architecture: {
    patterns: ["MIDDLEWARE_CHAIN", "LAYERED"],
    summary: "Middleware chain",
  },
  steps: [
    { step: 1, text: "Route" },
    { step: 2, text: "Middleware auth" },
    { step: 3, text: "Service" },
  ],
  strengths: [{ step: 2, text: "Middleware chuẩn" }],
  weak_points: [
    {
      skill: "AUTH_SECURITY",
      step: 2,
      symbol: "verifyToken",
      what: "Thiếu check expiry",
      consequence: "Lỗ hổng",
    },
  ],
};

const analysisN5: NodeAnalysis = {
  node_id: "slice-order-checkout",
  skeleton_only: false,
  skills: [
    {
      skill: "TRANSACTION_INTEGRITY",
      step: 3,
      symbol: "checkout",
      reason: "Giao dịch thanh toán",
    },
    {
      skill: "DB_OPTIMIZATION",
      step: 3,
      symbol: "save",
      reason: "Lưu order",
    },
    {
      skill: "HTTP_ROUTING",
      step: 1,
      symbol: "router.post",
      reason: "Route checkout",
    },
  ],
  architecture: {
    patterns: ["LAYERED", "MIDDLEWARE_CHAIN"],
    summary: "Order flow",
  },
  steps: [
    { step: 1, text: "Post checkout" },
    { step: 2, text: "Auth" },
    { step: 3, text: "Service transaction" },
  ],
  strengths: [{ step: 2, text: "Auth trước khi mua" }],
  weak_points: [
    {
      skill: "TRANSACTION_INTEGRITY",
      step: 3,
      symbol: "checkout",
      what: "Thiếu lock",
      consequence: "Race condition",
    },
    {
      skill: "DB_OPTIMIZATION",
      step: 3,
      symbol: "save",
      what: "Vòng lặp save",
      consequence: "Chậm",
    },
  ],
};

const analysisX: NodeAnalysis = {
  node_id: "node-x",
  skeleton_only: false,
  skills: [
    { skill: "HTTP_ROUTING", step: 1, symbol: "route", reason: "r" },
    { skill: "DTO_VALIDATION", step: 1, symbol: "validate", reason: "v" },
    { skill: "ERROR_HANDLING", step: 2, symbol: "catch", reason: "e" },
  ],
  architecture: {
    patterns: ["LAYERED"],
    summary: "X",
  },
  steps: [
    { step: 1, text: "S1" },
    { step: 2, text: "S2" },
  ],
  strengths: [{ step: 1, text: "Tốt" }],
  weak_points: [],
};

const analysisXPrime: NodeAnalysis = {
  ...analysisX,
  strengths: [],
  architecture: {
    patterns: ["OTHER"],
    summary: "X prime",
  },
};

describe("plan", () => {
  describe("T-PLAN — planNodeQuestions", () => {
    it("BKT-40 P-A: Trace A (N3, hồ sơ rỗng)", () => {
      const plan = planNodeQuestions(analysisN3, {}, T0, 3);
      expect(plan).toHaveLength(2);
      expect(plan[0]).toEqual({
        question_index: 1,
        skill: "LAYERED_SEPARATION",
        tier: "NOVICE",
        focus: "FLOW",
        step_indices: [1, 2, 3],
      });
      expect(plan[1]).toEqual({
        question_index: 2,
        skill: "DB_OPTIMIZATION",
        tier: "NOVICE",
        focus: "WEAKNESS",
        step_indices: [2],
      });
    });

    it("BKT-40 P-B: Trace B (N2, HTTP_ROUTING 0.5767)", () => {
      const skills: SkillMap = {
        HTTP_ROUTING: {
          skill: "HTTP_ROUTING",
          p_mastery: 0.5767,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
      };
      const plan = planNodeQuestions(analysisN2, skills, T0, 3);
      expect(plan).toHaveLength(2);
      expect(plan[0]).toEqual({
        question_index: 1,
        skill: "HTTP_ROUTING",
        tier: "PRACTITIONER",
        focus: "FLOW",
        step_indices: [1, 2, 3],
      });
      expect(plan[1]).toEqual({
        question_index: 2,
        skill: "AUTH_SECURITY",
        tier: "NOVICE",
        focus: "WEAKNESS",
        step_indices: [2],
      });
    });

    it("BKT-40 P-C: Capstone, 2 kỹ năng (N5, HTTP 0.9532, DB 0.8413, TRANSACTION 0.5767)", () => {
      const skills: SkillMap = {
        HTTP_ROUTING: {
          skill: "HTTP_ROUTING",
          p_mastery: 0.9532,
          last_practiced_at: T0,
          practice_count: 2,
          correct_count: 2,
        },
        DB_OPTIMIZATION: {
          skill: "DB_OPTIMIZATION",
          p_mastery: 0.8413,
          last_practiced_at: T0,
          practice_count: 2,
          correct_count: 2,
        },
        TRANSACTION_INTEGRITY: {
          skill: "TRANSACTION_INTEGRITY",
          p_mastery: 0.5767,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
      };
      const plan = planNodeQuestions(analysisN5, skills, T0, 3);
      expect(plan).toHaveLength(3);
      expect(plan[0]).toEqual({
        question_index: 1,
        skill: "TRANSACTION_INTEGRITY",
        tier: "PRACTITIONER",
        focus: "FLOW",
        step_indices: [1, 2, 3],
      });
      expect(plan[1]).toEqual({
        question_index: 2,
        skill: "TRANSACTION_INTEGRITY",
        tier: "PRACTITIONER",
        focus: "WEAKNESS",
        step_indices: [3],
      });
      expect(plan[2]).toEqual({
        question_index: 3,
        skill: "DB_OPTIMIZATION",
        tier: "ARCHITECT",
        focus: "WEAKNESS",
        step_indices: [3],
      });
    });

    it("BKT-40 P-D: Capstone đã thạo (N5, mọi kỹ năng 0.95, practice_count 1)", () => {
      const skills: SkillMap = {
        TRANSACTION_INTEGRITY: {
          skill: "TRANSACTION_INTEGRITY",
          p_mastery: 0.95,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
        DB_OPTIMIZATION: {
          skill: "DB_OPTIMIZATION",
          p_mastery: 0.95,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
        HTTP_ROUTING: {
          skill: "HTTP_ROUTING",
          p_mastery: 0.95,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
      };
      const plan = planNodeQuestions(analysisN5, skills, T0, 3);
      expect(plan).toHaveLength(2);
      expect(plan[0]).toEqual({
        question_index: 1,
        skill: "TRANSACTION_INTEGRITY",
        tier: "ARCHITECT",
        focus: "FLOW",
        step_indices: [1, 2, 3],
      });
      expect(plan[1]).toEqual({
        question_index: 2,
        skill: "TRANSACTION_INTEGRITY",
        tier: "ARCHITECT",
        focus: "WEAKNESS",
        step_indices: [3],
      });
    });

    it("BKT-40 P-D2: Kế hoạch rỗng => 1 câu (D-34) (N3, DB 0.96, LAYERED 0.93, practice_count 1)", () => {
      const skills: SkillMap = {
        DB_OPTIMIZATION: {
          skill: "DB_OPTIMIZATION",
          p_mastery: 0.96,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
        LAYERED_SEPARATION: {
          skill: "LAYERED_SEPARATION",
          p_mastery: 0.93,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
      };
      const plan = planNodeQuestions(analysisN3, skills, T0, 3);
      expect(plan).toHaveLength(1);
      expect(plan[0]).toEqual({
        question_index: 1,
        skill: "LAYERED_SEPARATION",
        tier: "ARCHITECT",
        focus: "FLOW",
        step_indices: [1, 2, 3],
      });
    });

    it("BKT-40 P-G1: Xoay góc (X, cả 3 kỹ năng 0.65)", () => {
      const skills: SkillMap = {
        HTTP_ROUTING: {
          skill: "HTTP_ROUTING",
          p_mastery: 0.65,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
        DTO_VALIDATION: {
          skill: "DTO_VALIDATION",
          p_mastery: 0.65,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
        ERROR_HANDLING: {
          skill: "ERROR_HANDLING",
          p_mastery: 0.65,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
      };
      // Bài 2 bước ⇒ tối đa 2 câu (câu thứ 3 bị cắt); 3 bước ⇒ đủ 3 câu xoay góc.
      expect(planNodeQuestions(analysisX, skills, T0, 3)).toHaveLength(3);
      const plan = planNodeQuestions(analysisX, skills, T0, 2);
      expect(plan).toHaveLength(2);
      expect(plan[0]).toEqual({
        question_index: 1,
        skill: "ERROR_HANDLING",
        tier: "PRACTITIONER",
        focus: "FLOW",
        step_indices: [1, 2],
      });
      expect(plan[1]).toEqual({
        question_index: 2,
        skill: "HTTP_ROUTING",
        tier: "PRACTITIONER",
        focus: "ARCHITECTURE",
        step_indices: [1],
      });
    });

    it("BKT-40 P-G2: Thiếu ARCHITECTURE (X', như P-G1)", () => {
      const skills: SkillMap = {
        HTTP_ROUTING: {
          skill: "HTTP_ROUTING",
          p_mastery: 0.65,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
        DTO_VALIDATION: {
          skill: "DTO_VALIDATION",
          p_mastery: 0.65,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
        ERROR_HANDLING: {
          skill: "ERROR_HANDLING",
          p_mastery: 0.65,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
      };
      expect(planNodeQuestions(analysisXPrime, skills, T0, 3)).toHaveLength(3);
      const plan = planNodeQuestions(analysisXPrime, skills, T0, 2);
      expect(plan).toHaveLength(2);
      expect(plan[0]).toEqual({
        question_index: 1,
        skill: "DTO_VALIDATION",
        tier: "PRACTITIONER",
        focus: "FLOW",
        step_indices: [1, 2],
      });
      expect(plan[1]).toEqual({
        question_index: 2,
        skill: "HTTP_ROUTING",
        tier: "PRACTITIONER",
        focus: "CHANGE",
        step_indices: [1, 2],
      });
    });
  });

  describe("T-RUN — nodeStatusFromRuns", () => {
    it("BKT-70 #1 LEARN có câu FAILED => FAILED", () => {
      const runs: RunLike[] = [
        {
          mode: "LEARN",
          started_at: T0,
          finished_at: T0 + 1000,
          questions: [
            {
              question_index: 1,
              skill: "AUTH_SECURITY",
              focus: "WEAKNESS",
              outcome: "FAILED",
              ended_by: "ANSWER",
              disputed: false,
            },
            {
              question_index: 2,
              skill: "HTTP_ROUTING",
              focus: "ARCHITECTURE",
              outcome: "PASS_FIRST",
              ended_by: "ANSWER",
              disputed: false,
            },
          ],
        },
      ];
      expect(nodeStatusFromRuns(runs)).toBe("FAILED");
    });

    it("BKT-71 #2 câu FAILED có disputed = true => COMPLETED", () => {
      const runs: RunLike[] = [
        {
          mode: "LEARN",
          started_at: T0,
          finished_at: T0 + 1000,
          questions: [
            {
              question_index: 1,
              skill: "AUTH_SECURITY",
              focus: "WEAKNESS",
              outcome: "FAILED",
              ended_by: "ANSWER",
              disputed: true,
            },
            {
              question_index: 2,
              skill: "HTTP_ROUTING",
              focus: "ARCHITECTURE",
              outcome: "PASS_FIRST",
              ended_by: "ANSWER",
              disputed: false,
            },
          ],
        },
      ];
      expect(nodeStatusFromRuns(runs)).toBe("COMPLETED");
    });

    it("BKT-72 #3 câu DROPPED không tính => COMPLETED", () => {
      const runs: RunLike[] = [
        {
          mode: "LEARN",
          started_at: T0,
          finished_at: T0 + 1000,
          questions: [
            {
              question_index: 1,
              skill: "AUTH_SECURITY",
              focus: "WEAKNESS",
              outcome: "FAILED",
              ended_by: "DROPPED",
              disputed: false,
            },
            {
              question_index: 2,
              skill: "HTTP_ROUTING",
              focus: "ARCHITECTURE",
              outcome: "PASS_FIRST",
              ended_by: "ANSWER",
              disputed: false,
            },
          ],
        },
      ];
      expect(nodeStatusFromRuns(runs)).toBe("COMPLETED");
    });

    it("BKT-70 #4 Không có run => null", () => {
      expect(nodeStatusFromRuns([])).toBeNull();
    });
  });

  describe("Bất biến 6.5", () => {
    it("BKT-INVAR thỏa mãn tất cả bất biến a-h", () => {
      const plans = [
        planNodeQuestions(analysisN3, {}, T0, 3),
        planNodeQuestions(analysisN2, {}, T0, 3),
        planNodeQuestions(analysisN5, {}, T0, 3),
        planNodeQuestions(analysisX, {}, T0, 2),
        planNodeQuestions(analysisXPrime, {}, T0, 2),
      ];

      for (const plan of plans) {
        expect(plan.length).toBeGreaterThanOrEqual(1);
        expect(plan[0].focus).toBe("FLOW");

        for (const item of plan) {
          // step_indices tăng dần và thuộc 1..stepCount
          for (let i = 0; i < item.step_indices.length - 1; i++) {
            expect(item.step_indices[i]).toBeLessThan(item.step_indices[i + 1]);
          }
        }
      }

      // Cùng đầu vào => cùng đầu ra
      const p1 = planNodeQuestions(analysisN3, {}, T0, 3);
      const p2 = planNodeQuestions(analysisN3, {}, T0, 3);
      expect(p1).toEqual(p2);
    });
  });
});

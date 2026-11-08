import { describe, expect, it } from "vitest";
import type {
  AnswerIntent,
  ArchitecturePattern,
  FollowUpType,
  GeneratedQuestionRaw,
  GradingRaw,
  NodeAnalysisRaw,
  SWESkill,
} from "@/contracts";
import { ARCHITECTURE_PATTERNS, SWE_SKILLS } from "@/contracts";
import analysisFixture from "../__fixtures__/analysis-n3.json";
import questionsFixture from "../__fixtures__/questions-n3.json";
import gradingFixture from "../__fixtures__/grading-n3-q1.json";

function isSWESkill(val: unknown): val is SWESkill {
  return typeof val === "string" && (SWE_SKILLS as readonly string[]).includes(val);
}

function isArchitecturePattern(val: unknown): val is ArchitecturePattern {
  return typeof val === "string" && (ARCHITECTURE_PATTERNS as readonly string[]).includes(val);
}

const VALID_ANSWER_INTENTS: readonly AnswerIntent[] = ["ANSWER", "GIVE_UP", "OFF_TOPIC"];
function isAnswerIntent(val: unknown): val is AnswerIntent {
  return typeof val === "string" && (VALID_ANSWER_INTENTS as readonly string[]).includes(val);
}

const VALID_FOLLOW_UP_TYPES: readonly FollowUpType[] = ["CONCEPT", "CODE_POINTER"];
function isFollowUpType(val: unknown): val is FollowUpType {
  return typeof val === "string" && (VALID_FOLLOW_UP_TYPES as readonly string[]).includes(val);
}

function assertNodeAnalysisRaw(data: unknown): NodeAnalysisRaw {
  if (!data || typeof data !== "object") {
    throw new Error("data must be an object");
  }
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.skills)) throw new Error("skills must be an array");
  if (!obj.architecture || typeof obj.architecture !== "object") throw new Error("architecture must be an object");
  if (!Array.isArray(obj.steps)) throw new Error("steps must be an array");
  if (!Array.isArray(obj.strengths)) throw new Error("strengths must be an array");
  if (!Array.isArray(obj.weak_points)) throw new Error("weak_points must be an array");

  const archObj = obj.architecture as Record<string, unknown>;
  if (!Array.isArray(archObj.patterns)) throw new Error("architecture.patterns must be an array");
  if (typeof archObj.summary !== "string") throw new Error("architecture.summary must be a string");

  const skills: NodeAnalysisRaw["skills"] = obj.skills.map((item, idx) => {
    if (!item || typeof item !== "object") throw new Error(`skills[${idx}] must be an object`);
    const s = item as Record<string, unknown>;
    if (!isSWESkill(s.skill)) throw new Error(`Invalid skill: ${String(s.skill)}`);
    if (typeof s.step !== "number") throw new Error(`skills[${idx}].step must be a number`);
    if (typeof s.symbol !== "string") throw new Error(`skills[${idx}].symbol must be a string`);
    if (typeof s.reason !== "string") throw new Error(`skills[${idx}].reason must be a string`);
    return {
      skill: s.skill,
      step: s.step,
      symbol: s.symbol,
      reason: s.reason,
    };
  });

  const patterns: ArchitecturePattern[] = archObj.patterns.map((p, idx) => {
    if (!isArchitecturePattern(p)) throw new Error(`Invalid pattern at patterns[${idx}]: ${String(p)}`);
    return p;
  });

  const steps: NodeAnalysisRaw["steps"] = obj.steps.map((item, idx) => {
    if (!item || typeof item !== "object") throw new Error(`steps[${idx}] must be an object`);
    const st = item as Record<string, unknown>;
    if (typeof st.step !== "number") throw new Error(`steps[${idx}].step must be a number`);
    if (typeof st.text !== "string") throw new Error(`steps[${idx}].text must be a string`);
    return { step: st.step, text: st.text };
  });

  const strengths: NodeAnalysisRaw["strengths"] = obj.strengths.map((item, idx) => {
    if (!item || typeof item !== "object") throw new Error(`strengths[${idx}] must be an object`);
    const st = item as Record<string, unknown>;
    if (typeof st.step !== "number") throw new Error(`strengths[${idx}].step must be a number`);
    if (typeof st.text !== "string") throw new Error(`strengths[${idx}].text must be a string`);
    return { step: st.step, text: st.text };
  });

  const weak_points: NodeAnalysisRaw["weak_points"] = obj.weak_points.map((item, idx) => {
    if (!item || typeof item !== "object") throw new Error(`weak_points[${idx}] must be an object`);
    const wp = item as Record<string, unknown>;
    if (!isSWESkill(wp.skill)) throw new Error(`Invalid weak point skill: ${String(wp.skill)}`);
    if (typeof wp.step !== "number") throw new Error(`weak_points[${idx}].step must be a number`);
    if (typeof wp.symbol !== "string") throw new Error(`weak_points[${idx}].symbol must be a string`);
    if (typeof wp.what !== "string") throw new Error(`weak_points[${idx}].what must be a string`);
    if (typeof wp.consequence !== "string") throw new Error(`weak_points[${idx}].consequence must be a string`);
    return {
      skill: wp.skill,
      step: wp.step,
      symbol: wp.symbol,
      what: wp.what,
      consequence: wp.consequence,
    };
  });

  return {
    skills,
    architecture: {
      patterns,
      summary: archObj.summary,
    },
    steps,
    strengths,
    weak_points,
  };
}

function assertGeneratedQuestionsRaw(data: unknown): GeneratedQuestionRaw[] {
  if (!Array.isArray(data)) {
    throw new Error("questions data must be an array");
  }
  return data.map((item, idx) => {
    if (!item || typeof item !== "object") throw new Error(`questions[${idx}] must be an object`);
    const q = item as Record<string, unknown>;
    if (!isSWESkill(q.skill)) throw new Error(`questions[${idx}].skill is invalid: ${String(q.skill)}`);
    if (typeof q.feynman_question !== "string") throw new Error(`questions[${idx}].feynman_question must be a string`);
    if (typeof q.reference_answer !== "string") throw new Error(`questions[${idx}].reference_answer must be a string`);
    if (!Array.isArray(q.must_have_points)) throw new Error(`questions[${idx}].must_have_points must be an array`);
    const must_have_points = q.must_have_points.map((p, pIdx) => {
      if (typeof p !== "string") throw new Error(`questions[${idx}].must_have_points[${pIdx}] must be a string`);
      return p;
    });
    if (typeof q.fix !== "string") throw new Error(`questions[${idx}].fix must be a string`);
    return {
      skill: q.skill,
      feynman_question: q.feynman_question,
      reference_answer: q.reference_answer,
      must_have_points,
      fix: q.fix,
    };
  });
}

function assertGradingRaw(data: unknown): GradingRaw {
  if (!data || typeof data !== "object") {
    throw new Error("grading must be an object");
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.core_accuracy !== "number" || obj.core_accuracy < 0 || obj.core_accuracy > 100) {
    throw new Error("core_accuracy must be a number 0..100");
  }
  if (typeof obj.simplicity !== "number" || obj.simplicity < 0 || obj.simplicity > 100) {
    throw new Error("simplicity must be a number 0..100");
  }
  if (!isAnswerIntent(obj.intent)) {
    throw new Error(`Invalid intent: ${String(obj.intent)}`);
  }
  if (!Array.isArray(obj.points)) {
    throw new Error("points must be an array");
  }
  const points = obj.points.map((pt, idx) => {
    if (!pt || typeof pt !== "object") throw new Error(`points[${idx}] must be an object`);
    const p = pt as Record<string, unknown>;
    if (typeof p.index !== "number") throw new Error(`points[${idx}].index must be a number`);
    if (typeof p.covered !== "boolean") throw new Error(`points[${idx}].covered must be a boolean`);
    if (typeof p.quote !== "string") throw new Error(`points[${idx}].quote must be a string`);
    return {
      index: p.index,
      covered: p.covered,
      quote: p.quote,
    };
  });

  if (typeof obj.misconception !== "string") throw new Error("misconception must be a string");

  if (obj.follow_up_question !== null && typeof obj.follow_up_question !== "string") {
    throw new Error("follow_up_question must be string or null");
  }

  let follow_up_type: FollowUpType | null = null;
  if (obj.follow_up_type !== null) {
    if (!isFollowUpType(obj.follow_up_type)) {
      throw new Error(`Invalid follow_up_type: ${String(obj.follow_up_type)}`);
    }
    follow_up_type = obj.follow_up_type;
  }

  if (obj.follow_up_step_index !== null && typeof obj.follow_up_step_index !== "number") {
    throw new Error("follow_up_step_index must be number or null");
  }

  if (typeof obj.feedback !== "string") throw new Error("feedback must be a string");

  if (!Array.isArray(obj.detected_jargons)) {
    throw new Error("detected_jargons must be an array");
  }
  const detected_jargons = obj.detected_jargons.map((j, idx) => {
    if (typeof j !== "string") throw new Error(`detected_jargons[${idx}] must be a string`);
    return j;
  });

  return {
    core_accuracy: obj.core_accuracy,
    simplicity: obj.simplicity,
    intent: obj.intent,
    points,
    misconception: obj.misconception,
    follow_up_question: obj.follow_up_question,
    follow_up_type,
    follow_up_step_index: obj.follow_up_step_index,
    feedback: obj.feedback,
    detected_jargons,
  };
}

describe("NH-02 — Fixture phản hồi AI của N3", () => {
  it("NH-02 analysis-n3.json gán đúng kiểu NodeAnalysisRaw và đạt kiểm runtime", () => {
    const analysis: NodeAnalysisRaw = assertNodeAnalysisRaw(analysisFixture);

    // Kiểm tra các trường bắt buộc không thiếu
    expect(analysis.skills).toBeDefined();
    expect(analysis.architecture).toBeDefined();
    expect(analysis.steps).toBeDefined();
    expect(analysis.strengths).toBeDefined();
    expect(analysis.weak_points).toBeDefined();

    // Mọi skill thuộc SWE_SKILLS
    expect(analysis.skills.length).toBeGreaterThan(0);
    for (const item of analysis.skills) {
      expect(SWE_SKILLS).toContain(item.skill);
      expect(item.step).toBeGreaterThan(0);
      expect(item.symbol.length).toBeGreaterThan(0);
      expect(item.reason.length).toBeGreaterThan(0);
    }

    // Mọi pattern thuộc ARCHITECTURE_PATTERNS
    expect(analysis.architecture.patterns.length).toBeGreaterThan(0);
    for (const pattern of analysis.architecture.patterns) {
      expect(ARCHITECTURE_PATTERNS).toContain(pattern);
    }
    expect(analysis.architecture.summary.length).toBeGreaterThan(0);

    // Steps và strengths
    expect(analysis.steps.length).toBe(3);
    for (const s of analysis.steps) {
      expect(s.step).toBeGreaterThan(0);
      expect(s.text.length).toBeGreaterThan(0);
    }
    expect(analysis.strengths.length).toBeGreaterThan(0);
    for (const st of analysis.strengths) {
      expect(st.step).toBeGreaterThan(0);
      expect(st.text.length).toBeGreaterThan(0);
    }

    // Weak points
    expect(analysis.weak_points.length).toBeGreaterThan(0);
    for (const wp of analysis.weak_points) {
      expect(SWE_SKILLS).toContain(wp.skill);
      expect(wp.step).toBeGreaterThan(0);
      expect(wp.symbol.length).toBeGreaterThan(0);
      expect(wp.what.length).toBeGreaterThan(0);
      expect(wp.consequence.length).toBeGreaterThan(0);
    }

    // Đã bỏ phần cố ý sai (kỹ năng AUTH_SECURITY trỏ verifyToken ở bước 3)
    const hasAuthSecurity = analysis.skills.some((s) => s.skill === "AUTH_SECURITY");
    expect(hasAuthSecurity).toBe(false);
    expect(analysis.skills.map((s) => s.skill)).toEqual([
      "DB_OPTIMIZATION",
      "LAYERED_SEPARATION",
    ]);
  });

  it("NH-02 questions-n3.json gán đúng kiểu GeneratedQuestionRaw[] và đạt kiểm runtime", () => {
    const questions: GeneratedQuestionRaw[] = assertGeneratedQuestionsRaw(questionsFixture);

    expect(Array.isArray(questions)).toBe(true);
    expect(questions.length).toBe(2);

    for (const q of questions) {
      // Mọi skill thuộc SWE_SKILLS
      expect(SWE_SKILLS).toContain(q.skill);

      // must_have_points có 2–3 phần tử
      expect(q.must_have_points.length).toBeGreaterThanOrEqual(2);
      expect(q.must_have_points.length).toBeLessThanOrEqual(3);
      for (const p of q.must_have_points) {
        expect(p.length).toBeGreaterThan(0);
      }

      // Trường bắt buộc không thiếu
      expect(q.feynman_question.length).toBeGreaterThan(0);
      expect(q.reference_answer.length).toBeGreaterThan(0);
      expect(q.fix.length).toBeGreaterThan(0);
    }
  });

  it("NH-02 grading-n3-q1.json gán đúng kiểu GradingRaw và đạt kiểm runtime", () => {
    const grading: GradingRaw = assertGradingRaw(gradingFixture);

    // core_accuracy, simplicity là số 0..100
    expect(typeof grading.core_accuracy).toBe("number");
    expect(grading.core_accuracy).toBeGreaterThanOrEqual(0);
    expect(grading.core_accuracy).toBeLessThanOrEqual(100);

    expect(typeof grading.simplicity).toBe("number");
    expect(grading.simplicity).toBeGreaterThanOrEqual(0);
    expect(grading.simplicity).toBeLessThanOrEqual(100);

    // intent hợp lệ
    expect(["ANSWER", "GIVE_UP", "OFF_TOPIC"]).toContain(grading.intent);

    // Lượt chưa đạt phải có follow_up_question, follow_up_type khác null để UI hiện gợi ý
    expect(grading.follow_up_question).not.toBeNull();
    expect(typeof grading.follow_up_question).toBe("string");
    expect(grading.follow_up_question!.length).toBeGreaterThan(0);

    expect(grading.follow_up_type).not.toBeNull();
    expect(["CONCEPT", "CODE_POINTER"]).toContain(grading.follow_up_type);

    // Trường bắt buộc không thiếu
    expect(Array.isArray(grading.points)).toBe(true);
    expect(grading.points.length).toBe(2);
    for (const p of grading.points) {
      expect(typeof p.index).toBe("number");
      expect(typeof p.covered).toBe("boolean");
      expect(typeof p.quote).toBe("string");
    }

    expect(typeof grading.misconception).toBe("string");
    expect(grading.misconception.length).toBeGreaterThan(0);

    expect(typeof grading.feedback).toBe("string");
    expect(grading.feedback.length).toBeGreaterThan(0);

    expect(Array.isArray(grading.detected_jargons)).toBe(true);
  });
});

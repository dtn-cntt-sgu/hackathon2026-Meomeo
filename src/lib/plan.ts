import { CONFIG } from "@/contracts/config";
import type {
  LearnerCognitiveProfile,
  LearnerTier,
  NodeAnalysis,
  NodeRunView,
  QuestionFocus,
  QuestionPlanItem,
  QuestionState,
  SWESkill,
} from "@/contracts";
import { getDecayedMastery, tierOf } from "./bkt-engine";

export type SkillMap = LearnerCognitiveProfile["skills"];

export type RunLike = Pick<NodeRunView, "mode" | "started_at" | "finished_at"> & {
  questions: Array<
    Pick<
      QuestionState,
      "question_index" | "skill" | "focus" | "outcome" | "ended_by" | "disputed"
    >
  >;
};

const CYCLE: QuestionFocus[] = ["FLOW", "ARCHITECTURE", "CHANGE"];
const START: Record<LearnerTier, QuestionFocus> = {
  NOVICE: "FLOW",
  PRACTITIONER: "ARCHITECTURE",
  ARCHITECT: "CHANGE",
};

function fromCycle(f: QuestionFocus): QuestionFocus[] {
  const i = CYCLE.indexOf(f);
  return [...CYCLE.slice(i), ...CYCLE.slice(0, i)];
}

function stepsFor(
  item: { skill: SWESkill; focus: QuestionFocus },
  analysis: NodeAnalysis,
  stepCount: number
): number[] {
  const ev = analysis.skills.find((s) => s.skill === item.skill)?.step;
  const rawSteps: number[] = [];

  if (item.focus === "WEAKNESS") {
    const weakSteps = analysis.weak_points
      .filter((w) => w.skill === item.skill)
      .map((w) => w.step);
    if (ev !== undefined) {
      rawSteps.push(ev);
    }
    rawSteps.push(...weakSteps);
  } else if (item.focus === "FLOW" || item.focus === "CHANGE") {
    for (let s = 1; s <= stepCount; s++) {
      rawSteps.push(s);
    }
  } else if (item.focus === "ARCHITECTURE") {
    rawSteps.push(1);
    if (ev !== undefined) {
      rawSteps.push(ev);
    }
    const strengthSteps = analysis.strengths.map((s) => s.step);
    rawSteps.push(...strengthSteps);
  }

  const validSteps = rawSteps.filter((s) => s >= 1 && s <= stepCount);
  const uniqueSteps = Array.from(new Set(validSteps)).sort((a, b) => a - b);
  return uniqueSteps.length > 0 ? uniqueSteps : [1];
}

export function planNodeQuestions(
  analysis: NodeAnalysis,
  skills: SkillMap,
  now: number,
  stepCount: number
): QuestionPlanItem[] {
  const order = analysis.skills.map((s) => s.skill);
  const p = (k: SWESkill) => getDecayedMastery(skills[k], now);
  const pc = (k: SWESkill) => skills[k]?.practice_count ?? 0;
  const weak = (k: SWESkill) => analysis.weak_points.some((w) => w.skill === k);
  const archOk =
    analysis.strengths.length > 0 ||
    analysis.architecture.patterns.some((x) => x !== "OTHER");
  const valid = (f: QuestionFocus) => f !== "ARCHITECTURE" || archOk;

  const byWeakest = (a: SWESkill, b: SWESkill) =>
    p(a) - p(b) || pc(a) - pc(b) || order.indexOf(a) - order.indexOf(b);

  const byPlan = (a: SWESkill, b: SWESkill) =>
    Number(!weak(a)) - Number(!weak(b)) || byWeakest(a, b);

  let picks: Array<{ skill: SWESkill; tier: LearnerTier }>;
  const open = order.filter((k) => p(k) < CONFIG.MASTERED_MIN);
  if (open.length > 0) {
    picks = [...open].sort(byPlan).map((k) => ({ skill: k, tier: tierOf(p(k)) }));
  } else {
    picks = [{ skill: [...order].sort(byWeakest)[0], tier: "ARCHITECT" }];
  }

  const items: Array<{ skill: SWESkill; tier: LearnerTier; focus: QuestionFocus }> = [];
  const usedNonWeak = new Set<QuestionFocus>();
  const take = (skill: SWESkill, tier: LearnerTier, focus: QuestionFocus) => {
    items.push({ skill, tier, focus });
    if (focus !== "WEAKNESS") {
      usedNonWeak.add(focus);
    }
  };
  const firstFree = (c: QuestionFocus[]) => c.find((f) => !usedNonWeak.has(f)) ?? c[0];

  for (const { skill, tier } of picks) {
    if (weak(skill)) {
      take(skill, tier, "WEAKNESS");
    } else {
      take(skill, tier, firstFree(fromCycle(START[tier]).filter(valid)));
    }
  }

  let f = items.findIndex((i) => i.focus === "FLOW");
  if (f < 0) {
    f = items.findIndex((i) => i.focus !== "WEAKNESS");
    if (f >= 0) {
      items[f] = { ...items[f], focus: "FLOW" };
    } else {
      items.unshift({
        skill: items[0].skill,
        tier: items[0].tier,
        focus: "FLOW",
      });
      f = 0;
    }
  }
  items.unshift(...items.splice(f, 1));
  // Số câu theo độ dài bài: 1 bước ⇒ 1 câu, 2 bước ⇒ tối đa 2, ≥ 3 bước ⇒ tối đa 3 (câu FLOW luôn giữ, đứng đầu).
  items.splice(Math.max(1, Math.min(3, stepCount)));

  return items.map((it, i) => ({
    question_index: i + 1,
    ...it,
    step_indices: stepsFor(it, analysis, stepCount),
  }));
}

export function nodeStatusFromRuns(
  runs: RunLike[]
): "COMPLETED" | "FAILED" | null {
  const finishedLearnRuns = runs.filter(
    (r) => r.mode === "LEARN" && r.finished_at !== null
  );
  if (finishedLearnRuns.length === 0) {
    return null;
  }

  const hasFailed = finishedLearnRuns.some((r) =>
    r.questions.some(
      (q) => q.outcome === "FAILED" && !q.disputed && q.ended_by !== "DROPPED"
    )
  );

  return hasFailed ? "FAILED" : "COMPLETED";
}

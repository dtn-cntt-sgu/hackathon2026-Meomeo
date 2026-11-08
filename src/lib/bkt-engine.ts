import { CONFIG } from "@/contracts/config";
import type {
  CognitiveSkillState,
  LearnerCognitiveProfile,
  LearnerTier,
  NodeOutcome,
  SkillChange,
  SWESkill,
} from "@/contracts";

export type SkillMap = LearnerCognitiveProfile["skills"];

export function getDecayedMastery(
  state: CognitiveSkillState | undefined,
  now: number
): number {
  if (!state) {
    return CONFIG.BKT_P_L0;
  }
  const p = state.p_mastery;
  const F = CONFIG.DECAY_FLOOR;
  if (p <= F) {
    return p;
  }
  const deltaDays = Math.max(0, now - state.last_practiced_at) / CONFIG.MS_PER_DAY;
  return F + (p - F) * Math.pow(2, -deltaDays / CONFIG.DECAY_HALF_LIFE_DAYS);
}

export function tierOf(p: number): LearnerTier {
  if (p < CONFIG.TIER_PRACTITIONER_MIN) {
    return "NOVICE";
  }
  if (p < CONFIG.TIER_ARCHITECT_MIN) {
    return "PRACTITIONER";
  }
  return "ARCHITECT";
}

export function overallTier(skills: SkillMap, now: number): LearnerTier {
  const practiced = Object.values(skills).filter(
    (s): s is CognitiveSkillState => !!s && s.practice_count > 0
  );
  if (practiced.length === 0) {
    return "NOVICE";
  }
  const sum = practiced.reduce((acc, s) => acc + getDecayedMastery(s, now), 0);
  const avg = sum / practiced.length;
  return tierOf(avg);
}

export function isDecaying(
  state: CognitiveSkillState | undefined,
  now: number
): boolean {
  if (!state) {
    return false;
  }
  const tierOrder: Record<LearnerTier, number> = {
    NOVICE: 0,
    PRACTITIONER: 1,
    ARCHITECT: 2,
  };
  const decayedP = getDecayedMastery(state, now);
  const decayedTier = tierOf(decayedP);
  const baseTier = tierOf(state.p_mastery);
  return tierOrder[decayedTier] < tierOrder[baseTier];
}

export function outcomeOf(isPassed: boolean, attemptsUsed: number): NodeOutcome {
  if (!isPassed) {
    return "FAILED";
  }
  if (attemptsUsed === 1) {
    return "PASS_FIRST";
  }
  return "PASS_AFTER_HINT";
}

export function updateSkill(
  skill: SWESkill,
  state: CognitiveSkillState | undefined,
  outcome: NodeOutcome,
  now: number
): CognitiveSkillState {
  const p = getDecayedMastery(state, now);
  const S = CONFIG.BKT_P_S;
  let GStar: number;
  let T: number;
  let isCorrect: boolean;

  if (outcome === "PASS_FIRST") {
    GStar = CONFIG.BKT_P_G;
    T = CONFIG.BKT_P_T_CORRECT;
    isCorrect = true;
  } else if (outcome === "PASS_AFTER_HINT") {
    GStar = CONFIG.BKT_P_G_HINT;
    T = CONFIG.BKT_P_T_CORRECT;
    isCorrect = true;
  } else {
    GStar = CONFIG.BKT_P_G;
    T = CONFIG.BKT_P_T_INCORRECT;
    isCorrect = false;
  }

  let pObs: number;
  if (isCorrect) {
    pObs = (p * (1 - S)) / (p * (1 - S) + (1 - p) * GStar);
  } else {
    pObs = (p * S) / (p * S + (1 - p) * (1 - GStar));
  }

  const pTransit = pObs + (1 - pObs) * T;
  const clampedP = Math.min(
    Math.max(pTransit, CONFIG.BKT_P_MIN),
    CONFIG.BKT_P_MAX
  );

  const lastPracticedAt = state
    ? Math.max(state.last_practiced_at, now)
    : now;
  const practiceCount = (state?.practice_count ?? 0) + 1;
  const correctCount = (state?.correct_count ?? 0) + (isCorrect ? 1 : 0);

  return {
    skill,
    p_mastery: clampedP,
    last_practiced_at: lastPracticedAt,
    practice_count: practiceCount,
    correct_count: correctCount,
  };
}

export function computeSkillChange(
  skill: SWESkill,
  state: CognitiveSkillState | undefined,
  outcome: NodeOutcome,
  now: number
): { next: CognitiveSkillState; change: SkillChange } {
  const pBefore = getDecayedMastery(state, now);
  const next = updateSkill(skill, state, outcome, now);
  const change: SkillChange = {
    skill,
    p_before: pBefore,
    p_after: next.p_mastery,
    outcome,
  };
  return { next, change };
}

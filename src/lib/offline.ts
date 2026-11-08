import { CONFIG } from "@/contracts/config";
import type {
  ClientStaticEngineResult,
  CognitiveSkillState,
  EnrichNodeResponse,
  EvaluateFeynmanResponse,
  GraphSkeletonNode,
  IngestResponse,
  LearnerCognitiveProfile,
  NodeAnalysisView,
  NodeRunView,
  NodeStateView,
  OfflineMockBundle,
  PersonaMode,
  QuestionState,
  RepoOverviewView,
  RevealResponse,
  RunMode,
  SessionProgress,
  SWESkill,
} from "@/contracts";
import { PERSONAS, SWE_SKILLS } from "@/contracts";
import type { ApiResult } from "@/lib/api";
import {
  computeSkillChange,
  outcomeOf,
  overallTier,
} from "@/lib/bkt-engine";
import { deriveNodeStates, type NodeProgressRow } from "@/lib/derive";
import { formatErrorMessage } from "@/lib/messages";
import { nodeStatusFromRuns, type RunLike } from "@/lib/plan";
import { similarity, validateAnswerLength } from "@/lib/similarity";

export type { ApiResult };

interface RuntimeRun {
  run: EnrichNodeResponse;
  started_at: number;
  finished_at: number | null;
}

let offlineActive = false;
let currentBundle: OfflineMockBundle | null = null;
let activePersona: PersonaMode = "NEWBIE";
let currentProfile: LearnerCognitiveProfile | null = null;
let currentRuns: Record<string, RuntimeRun> = {};
let currentProgress: SessionProgress = {
  session_id: "offline-session",
  nodes: {},
  tokens_used: 0,
};

function toRunLike(r: RuntimeRun): RunLike {
  return {
    mode: r.run.mode,
    started_at: r.started_at,
    finished_at: r.finished_at,
    questions: r.run.questions.map((q) => ({
      question_index: q.question_index,
      skill: q.skill,
      focus: q.focus,
      outcome: q.state.outcome,
      ended_by: q.state.ended_by,
      disputed: q.state.disputed,
    })),
  };
}

function toNodeRunView(r: RuntimeRun): NodeRunView {
  return {
    run_id: r.run.run_id,
    node_id: r.run.node_id,
    mode: r.run.mode,
    started_at: r.started_at,
    finished_at: r.finished_at,
    questions: r.run.questions.map((q) => q.state),
  };
}

function getSkeleton(result: ClientStaticEngineResult): GraphSkeletonNode[] {
  return result.nodes.map((n) => ({
    node_id: n.id,
    title: n.title,
    prerequisites: n.prerequisites,
    is_capstone: n.is_capstone,
  }));
}

function syncProgress(): string[] {
  if (!currentBundle) {
    return [];
  }

  const skeleton = getSkeleton(currentBundle.ingest.result);
  const progressRows: NodeProgressRow[] = skeleton.map((n) => {
    const r = currentRuns[n.node_id];
    let status: "AVAILABLE" | "COMPLETED" | "FAILED" | null = null;
    if (r && r.finished_at !== null) {
      status = nodeStatusFromRuns([toRunLike(r)]);
    }
    return {
      node_id: n.node_id,
      status,
      analysis_failed: false,
    };
  });

  const prevUnlocked = new Set(
    Object.keys(currentProgress.nodes).filter(
      (id) => currentProgress.nodes[id]?.status !== "LOCKED"
    )
  );

  const derived = deriveNodeStates(skeleton, progressRows);

  for (const n of skeleton) {
    const d = derived[n.node_id];
    const existing = currentProgress.nodes[n.node_id];
    currentProgress.nodes[n.node_id] = {
      node_id: n.node_id,
      status: d.status,
      has_warning: d.has_warning,
      analysis_failed: d.analysis_failed,
      last_run: currentRuns[n.node_id]
        ? toNodeRunView(currentRuns[n.node_id])
        : existing?.last_run ?? null,
    };
  }

  const newlyUnlocked: string[] = [];
  for (const n of skeleton) {
    if (!prevUnlocked.has(n.node_id) && derived[n.node_id].status !== "LOCKED") {
      newlyUnlocked.push(n.node_id);
    }
  }

  return newlyUnlocked;
}

function initProgress(): void {
  if (!currentBundle) {
    currentProgress = {
      session_id: "offline-session",
      nodes: {},
      tokens_used: 0,
    };
    return;
  }

  const skeleton = getSkeleton(currentBundle.ingest.result);
  const progressRows: NodeProgressRow[] = skeleton.map((n) => {
    const r = currentRuns[n.node_id];
    let status: "AVAILABLE" | "COMPLETED" | "FAILED" | null = null;
    if (r && r.finished_at !== null) {
      status = nodeStatusFromRuns([toRunLike(r)]);
    }
    return {
      node_id: n.node_id,
      status,
      analysis_failed: false,
    };
  });

  const derived = deriveNodeStates(skeleton, progressRows);
  const nodes: Record<string, NodeStateView> = {};

  for (const n of skeleton) {
    const d = derived[n.node_id];
    nodes[n.node_id] = {
      node_id: n.node_id,
      status: d.status,
      has_warning: d.has_warning,
      analysis_failed: d.analysis_failed,
      last_run: currentRuns[n.node_id]
        ? toNodeRunView(currentRuns[n.node_id])
        : null,
    };
  }

  currentProgress = {
    session_id: currentBundle.ingest.session_id,
    nodes,
    tokens_used: 0,
  };
}

export function isOfflineMode(): boolean {
  if (offlineActive) return true;
  try {
    if (typeof window !== "undefined" && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("offline") === "1") {
        return true;
      }
    }
  } catch {
    // Không ném lỗi ra ngoài
  }
  return false;
}

export function setOfflineMode(
  active: boolean,
  bundle?: OfflineMockBundle
): void {
  offlineActive = active;
  if (bundle) {
    currentBundle = bundle;
    initProgress();
    currentProfile = buildOfflineProfile(activePersona);
  } else if (active && currentBundle) {
    initProgress();
    currentProfile = buildOfflineProfile(activePersona);
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      // Chỉ cờ sf.prefs nếu cần
    }
  } catch {
    // Không ném lỗi ra ngoài
  }
}

export function getOfflineBundle(): OfflineMockBundle | null {
  return currentBundle;
}

export async function loadOfflineBundle(): Promise<OfflineMockBundle> {
  const res = await fetch("/demo/mock_bundle.json");
  if (!res.ok) {
    throw new Error(`Không đọc được gói demo Offline: HTTP ${res.status}`);
  }
  const data = (await res.json()) as OfflineMockBundle;
  currentBundle = data;
  offlineActive = true;
  initProgress();
  currentProfile = buildOfflineProfile(activePersona);
  return data;
}

export function getOfflinePersona(): PersonaMode {
  return activePersona;
}

export function setOfflinePersona(p: PersonaMode): void {
  activePersona = p;
  currentProfile = buildOfflineProfile(p);
  currentRuns = {};
  initProgress();
}

export function offlinePersonas(): typeof PERSONAS {
  return PERSONAS;
}

export function buildOfflineProfile(
  persona: PersonaMode = activePersona,
  now: number = Date.now()
): LearnerCognitiveProfile {
  const conf = PERSONAS[persona];
  const lastPracticedAt = now - conf.days_idle * CONFIG.MS_PER_DAY;

  const skills: Partial<Record<SWESkill, CognitiveSkillState>> = {};
  for (const skill of SWE_SKILLS) {
    skills[skill] = {
      skill,
      p_mastery: conf.initial_p_mastery,
      last_practiced_at: lastPracticedAt,
      practice_count:
        conf.days_idle > 0 || conf.initial_p_mastery > CONFIG.BKT_P_L0 ? 1 : 0,
      correct_count:
        conf.days_idle > 0 || conf.initial_p_mastery > CONFIG.BKT_P_L0 ? 1 : 0,
    };
  }

  return {
    user_id: "offline-user",
    display_name: conf.label,
    skills,
    overall_tier: overallTier(skills, now),
  };
}

export function getOfflineProfile(): LearnerCognitiveProfile {
  if (!currentProfile) {
    currentProfile = buildOfflineProfile(activePersona);
  }
  return currentProfile;
}

export function offlineProgress(): SessionProgress {
  return currentProgress;
}

export function offlineIngestRepo(req?: unknown): ApiResult<IngestResponse> {
  void req;
  if (!currentBundle) {
    return {
      ok: false,
      code: "ERR_SESSION_NOT_FOUND",
      message: formatErrorMessage("ERR_SESSION_NOT_FOUND"),
      retryable: false,
    };
  }
  return {
    ok: true,
    data: {
      ...currentBundle.ingest,
      progress: offlineProgress(),
    },
  };
}

export function offlineGetAnalysis(nodeId: string): ApiResult<NodeAnalysisView> {
  if (!currentBundle) {
    return {
      ok: false,
      code: "ERR_SESSION_NOT_FOUND",
      message: formatErrorMessage("ERR_SESSION_NOT_FOUND"),
      retryable: false,
    };
  }
  const analysis = currentBundle.analyses[nodeId];
  if (!analysis) {
    return {
      ok: false,
      code: "ERR_ANALYSIS_NOT_READY",
      message: formatErrorMessage("ERR_ANALYSIS_NOT_READY"),
      retryable: false,
    };
  }
  return {
    ok: true,
    data: analysis,
  };
}

export function offlineGetOverview(): ApiResult<RepoOverviewView> {
  if (!currentBundle) {
    return {
      ok: false,
      code: "ERR_SESSION_NOT_FOUND",
      message: formatErrorMessage("ERR_SESSION_NOT_FOUND"),
      retryable: false,
    };
  }
  return {
    ok: true,
    data: currentBundle.overview,
  };
}

export function offlineEnrichNode(
  nodeId: string,
  mode: RunMode = "LEARN",
  persona: PersonaMode = activePersona
): ApiResult<EnrichNodeResponse> {
  if (!currentBundle) {
    return {
      ok: false,
      code: "ERR_SESSION_NOT_FOUND",
      message: formatErrorMessage("ERR_SESSION_NOT_FOUND"),
      retryable: false,
    };
  }

  const R = `${nodeId}:${mode}:${persona}`;

  if (currentRuns[nodeId] && currentRuns[nodeId].run.mode === mode) {
    return {
      ok: true,
      data: currentRuns[nodeId].run,
    };
  }

  const enrichTemplate = currentBundle.enrich[R];
  if (!enrichTemplate) {
    return {
      ok: false,
      code: "ERR_AI_REJECTED",
      message: "Kịch bản offline không có câu hỏi cho node / persona này",
      retryable: false,
    };
  }

  const clonedRun: EnrichNodeResponse = structuredClone(enrichTemplate);
  clonedRun.node_state = currentProgress.nodes[nodeId] ?? clonedRun.node_state;

  const runtimeRun: RuntimeRun = {
    run: clonedRun,
    started_at: Date.now(),
    finished_at: null,
  };
  currentRuns[nodeId] = runtimeRun;

  if (currentProgress.nodes[nodeId]) {
    currentProgress.nodes[nodeId].last_run = toNodeRunView(runtimeRun);
  }

  return {
    ok: true,
    data: clonedRun,
  };
}

export function offlineEvaluateFeynman(
  nodeId: string,
  mode: RunMode,
  questionIndex: number,
  attemptNumber: number,
  answer: string,
  persona: PersonaMode = activePersona
): ApiResult<EvaluateFeynmanResponse> {
  if (!currentBundle) {
    return {
      ok: false,
      code: "ERR_SESSION_NOT_FOUND",
      message: formatErrorMessage("ERR_SESSION_NOT_FOUND"),
      retryable: false,
    };
  }

  const lengthError = validateAnswerLength(answer);
  if (lengthError === "ERR_ANSWER_TOO_SHORT") {
    return {
      ok: false,
      code: "ERR_ANSWER_TOO_SHORT",
      message: formatErrorMessage("ERR_ANSWER_TOO_SHORT"),
      retryable: false,
    };
  }
  if (lengthError === "ERR_ANSWER_TOO_LONG") {
    return {
      ok: false,
      code: "ERR_ANSWER_TOO_LONG",
      message: formatErrorMessage("ERR_ANSWER_TOO_LONG"),
      retryable: false,
    };
  }

  const existingRun = currentRuns[nodeId];
  const existingQuestion = existingRun?.run.questions.find(
    (q) => q.question_index === questionIndex
  );
  if (existingQuestion?.state.finished) {
    return {
      ok: false,
      code: "ERR_QUESTION_FINISHED",
      message: formatErrorMessage("ERR_QUESTION_FINISHED"),
      retryable: false,
    };
  }

  if (
    existingQuestion &&
    attemptNumber !== existingQuestion.state.attempts_used + 1
  ) {
    return {
      ok: false,
      code: "ERR_ATTEMPT_OUT_OF_SYNC",
      message: formatErrorMessage("ERR_ATTEMPT_OUT_OF_SYNC"),
      retryable: true,
    };
  }

  const R = `${nodeId}:${mode}:${persona}`;
  const scriptKey = `${R}:${questionIndex}:${attemptNumber}`;
  const candidates = currentBundle.scripted_answers[scriptKey] ?? [];

  let bestCandidate: {
    answer: string;
    response: EvaluateFeynmanResponse;
  } | null = null;
  let bestSimilarity = -1;

  for (const cand of candidates) {
    const sim = similarity(answer, cand.answer);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestCandidate = cand;
    }
  }

  if (
    !bestCandidate ||
    bestSimilarity < CONFIG.ANSWER_DUPLICATE_SIMILARITY
  ) {
    return {
      ok: false,
      code: "ERR_ANSWER_INAPPROPRIATE",
      message: "Chế độ offline chỉ chấm được câu trả lời trong kịch bản",
      retryable: false,
    };
  }

  const evalResponse: EvaluateFeynmanResponse = structuredClone(
    bestCandidate.response
  );
  evalResponse.question_index = questionIndex;
  evalResponse.attempt_number = attemptNumber;

  if (!currentRuns[nodeId]) {
    const enrichRes = offlineEnrichNode(nodeId, mode, persona);
    if (!enrichRes.ok) {
      return enrichRes;
    }
  }

  const activeRun = currentRuns[nodeId];
  const qView = activeRun.run.questions.find(
    (q) => q.question_index === questionIndex
  );

  const isPassed = evalResponse.is_passed;
  const isFinished =
    isPassed || attemptNumber >= CONFIG.MAX_ATTEMPTS_PER_QUESTION;

  evalResponse.question.attempts_used = attemptNumber;
  evalResponse.question.finished = isFinished;
  evalResponse.question.ended_by = "ANSWER";

  if (isFinished) {
    const outcome = outcomeOf(isPassed, attemptNumber);
    evalResponse.question.outcome = outcome;

    if (!evalResponse.question.reveal) {
      const revealKey = `${R}:${questionIndex}`;
      const rev = currentBundle.reveals[revealKey];
      if (rev?.question?.reveal) {
        evalResponse.question.reveal = rev.question.reveal;
      }
    }

    const now = Date.now();
    const skill = evalResponse.question.skill;
    const profile = getOfflineProfile();
    const { next, change } = computeSkillChange(
      skill,
      profile.skills[skill],
      outcome,
      now
    );
    profile.skills[skill] = next;
    profile.overall_tier = overallTier(profile.skills, now);
    evalResponse.skill_change = change;
  } else {
    evalResponse.question.outcome = null;
    evalResponse.question.reveal = null;
    evalResponse.skill_change = null;
  }

  if (qView) {
    qView.state = evalResponse.question;
  }

  const allFinished = activeRun.run.questions.every((q) => q.state.finished);
  if (allFinished) {
    activeRun.finished_at = Date.now();
  }

  const newlyUnlocked = syncProgress();
  evalResponse.node_state = currentProgress.nodes[nodeId];
  evalResponse.unlocked_node_ids = newlyUnlocked;
  activeRun.run.node_state = currentProgress.nodes[nodeId];

  return {
    ok: true,
    data: evalResponse,
  };
}

export function offlineRevealQuestion(
  nodeId: string,
  mode: RunMode,
  questionIndex: number,
  persona: PersonaMode = activePersona
): ApiResult<RevealResponse> {
  if (!currentBundle) {
    return {
      ok: false,
      code: "ERR_SESSION_NOT_FOUND",
      message: formatErrorMessage("ERR_SESSION_NOT_FOUND"),
      retryable: false,
    };
  }

  const existingRun = currentRuns[nodeId];
  const existingQuestion = existingRun?.run.questions.find(
    (q) => q.question_index === questionIndex
  );
  if (existingQuestion?.state.finished) {
    return {
      ok: false,
      code: "ERR_QUESTION_FINISHED",
      message: formatErrorMessage("ERR_QUESTION_FINISHED"),
      retryable: false,
    };
  }

  const R = `${nodeId}:${mode}:${persona}`;
  const revealKey = `${R}:${questionIndex}`;
  const recordedReveal = currentBundle.reveals[revealKey];

  if (!recordedReveal) {
    return {
      ok: false,
      code: "ERR_QUESTION_FINISHED",
      message: "Không tìm thấy dữ liệu reveal cho câu hỏi này",
      retryable: false,
    };
  }

  if (!currentRuns[nodeId]) {
    const enrichRes = offlineEnrichNode(nodeId, mode, persona);
    if (!enrichRes.ok) {
      return enrichRes;
    }
  }

  const activeRun = currentRuns[nodeId];
  const qView = activeRun.run.questions.find(
    (q) => q.question_index === questionIndex
  );

  const attemptsUsed = qView?.state.attempts_used ?? 1;
  const updatedQuestion: QuestionState = {
    ...recordedReveal.question,
    question_index: questionIndex,
    attempts_used: attemptsUsed,
    finished: true,
    outcome: "FAILED",
    ended_by: "SKIP",
    disputed: false,
    reveal: recordedReveal.question.reveal,
  };

  const now = Date.now();
  const skill = updatedQuestion.skill;
  const profile = getOfflineProfile();
  const { next, change } = computeSkillChange(
    skill,
    profile.skills[skill],
    "FAILED",
    now
  );
  profile.skills[skill] = next;
  profile.overall_tier = overallTier(profile.skills, now);

  if (qView) {
    qView.state = updatedQuestion;
  }

  const allFinished = activeRun.run.questions.every((q) => q.state.finished);
  if (allFinished) {
    activeRun.finished_at = now;
  }

  const newlyUnlocked = syncProgress();
  const nodeState = currentProgress.nodes[nodeId];
  activeRun.run.node_state = nodeState;

  return {
    ok: true,
    data: {
      question: updatedQuestion,
      skill_change: change,
      node_state: nodeState,
      unlocked_node_ids: newlyUnlocked,
    },
  };
}

export function resetOfflineRuntime(): void {
  currentRuns = {};
  activePersona = "NEWBIE";
  currentProfile = buildOfflineProfile("NEWBIE");
  initProgress();
}

import type {
  EnrichNodeResponse,
  EvaluateFeynmanResponse,
  IngestResponse,
  NodeAnalysisView,
  NodeStateView,
  OfflineMockBundle,
  PersonaMode,
  QuestionState,
  RevealResponse,
} from "@/contracts";
import { CONFIG } from "@/contracts";
import analysisRaw from "@/server/ai/__fixtures__/analysis-n3.json";
import questionsRaw from "@/server/ai/__fixtures__/questions-n3.json";

/**
 * Dữ liệu kịch bản A của `docs/spec/50_TEST_VA_FIXTURE.md` (A3 → A6) cho `?fixture=1`, ghép từ các fixture NH-02.
 * Chạy trên cùng bộ máy với Offline (`src/lib/offline.ts`) nên điểm kỹ năng, mở khóa và trạng thái bài do
 * `offline.ts` tính, không viết tay. Chỉ bài N3 (`slice-product-list`) có dữ liệu; bài khác vẫn đi tour từ `trace_steps`.
 *
 * Giống Offline, câu gõ phải gần như y hệt câu trong kịch bản (độ giống ≥ `CONFIG.ANSWER_DUPLICATE_SIMILARITY`).
 */
export const FIXTURE_NODE_ID = "slice-product-list";

/** Câu trả lời mẫu của kịch bản A: Q1 sai ⇒ gợi ý ⇒ đúng; Q2 đúng ngay. */
export const FIXTURE_ANSWERS = {
  q1Attempt1: "Vì có 200 sản phẩm nên dữ liệu nhiều.",
  q1Attempt2:
    "Vì lấy danh sách xong, code còn hỏi database thêm một lần cho mỗi sản phẩm để lấy loại hàng. 200 sản phẩm là 201 lần hỏi, càng nhiều sản phẩm càng nhiều lần hỏi.",
  q2Attempt1:
    "Route gọi productService.listProducts, service nhờ categoryRepo.findById tìm loại hàng theo categoryId của từng sản phẩm rồi gắn vào sản phẩm trước khi trả về.",
} as const;

const PERSONAS: PersonaMode[] = ["NEWBIE", "MID_LEVEL", "SENIOR_RUSTY"];

function nodeState(): NodeStateView {
  return { node_id: FIXTURE_NODE_ID, status: "AVAILABLE", has_warning: false, analysis_failed: false, last_run: null };
}

function questionState(index: 1 | 2, finished: boolean): QuestionState {
  const q = questionsRaw[index - 1];
  return {
    question_index: index,
    feynman_question: q.feynman_question,
    skill: q.skill as QuestionState["skill"],
    tier: "NOVICE",
    focus: index === 1 ? "WEAKNESS" : "FLOW",
    attempts_used: 0,
    finished,
    outcome: null,
    ended_by: null,
    disputed: false,
    reveal: finished
      ? { reference_answer: q.reference_answer, must_have_points: q.must_have_points, fix: q.fix }
      : null,
  };
}

function buildAnalysisView(result: IngestResponse["result"]): NodeAnalysisView | null {
  const node = result.nodes.find((n) => n.id === FIXTURE_NODE_ID);
  if (!node) return null;
  const at = (step: number) => node.trace_steps.find((s) => s.step_number === step);
  const where = (step: number) => {
    const s = at(step);
    return { file_path: s?.file_path ?? "", line_start: s?.line_start ?? 0, line_end: s?.line_end ?? 0 };
  };
  return {
    node_id: node.id,
    skills: analysisRaw.skills.map((s) => ({ ...(s as NodeAnalysisView["skills"][number]), ...where(s.step) })),
    architecture: analysisRaw.architecture as NodeAnalysisView["architecture"],
    steps: node.trace_steps.map((s) => ({
      step: s.step_number,
      layer: s.layer,
      file_path: s.file_path,
      line_start: s.line_start,
      line_end: s.line_end,
      text: analysisRaw.steps.find((x) => x.step === s.step_number)?.text ?? null,
    })),
    strengths: analysisRaw.strengths,
    weak_points: analysisRaw.weak_points.map((w) => ({
      ...(w as NodeAnalysisView["weak_points"][number]),
      ...where(w.step),
    })),
    shared_files: [],
    skeleton_only: false,
  };
}

function evaluation(
  index: 1 | 2,
  attempt: number,
  passed: boolean,
  fields: Pick<EvaluateFeynmanResponse, "core_accuracy" | "simplicity" | "feedback" | "detected_jargons" | "follow_up">,
): EvaluateFeynmanResponse {
  return {
    question_index: index,
    attempt_number: attempt,
    ...fields,
    intent: "ANSWER",
    is_passed: passed,
    points_covered: passed ? [true, true] : [false, false],
    question: questionState(index, false),
    skill_change: null,
    node_state: nodeState(),
    unlocked_node_ids: [],
    tokens_used: 0,
  };
}

/** Dựng bundle từ phản hồi ingest của fixture; `null` khi bản đồ không có bài N3. */
export function buildFixtureBundle(ingest: IngestResponse): OfflineMockBundle | null {
  const analysis = buildAnalysisView(ingest.result);
  if (!analysis) return null;

  const enrich: OfflineMockBundle["enrich"] = {};
  const scripted: OfflineMockBundle["scripted_answers"] = {};
  const reveals: OfflineMockBundle["reveals"] = {};

  for (const persona of PERSONAS) {
    const run = `${FIXTURE_NODE_ID}:LEARN:${persona}`;
    const response: EnrichNodeResponse = {
      node_id: FIXTURE_NODE_ID,
      run_id: `fixture-run-${persona}`,
      mode: "LEARN",
      questions: ([1, 2] as const).map((i) => {
        const state = questionState(i, false);
        return {
          question_index: i,
          skill: state.skill,
          tier: state.tier,
          focus: state.focus,
          feynman_question: state.feynman_question,
          state,
        };
      }),
      node_state: nodeState(),
      tokens_used: 0,
    };
    enrich[run] = response;

    scripted[`${run}:1:1`] = [
      {
        answer: FIXTURE_ANSWERS.q1Attempt1,
        response: evaluation(1, 1, false, {
          core_accuracy: 50,
          simplicity: 70,
          feedback: "Bạn thấy đúng là nhiều sản phẩm thì chậm hơn, nhưng chưa nói vì sao.",
          detected_jargons: [],
          follow_up: {
            type: "CODE_POINTER",
            question:
              "Mở Bước 2 trong tour. Giả sử có 3 sản phẩm đi qua vòng `for`, mỗi sản phẩm khiến code gọi ra ngoài mấy lần, và tổng cộng là bao nhiêu lần?",
            step_index: 2,
          },
        }),
      },
    ];
    scripted[`${run}:1:2`] = [
      {
        answer: FIXTURE_ANSWERS.q1Attempt2,
        response: evaluation(1, 2, true, {
          core_accuracy: 90,
          simplicity: 60,
          feedback: "Chính xác! Bạn giải thích đúng vì sao số truy vấn tăng theo số sản phẩm.",
          detected_jargons: ["database"],
          follow_up: null,
        }),
      },
    ];
    scripted[`${run}:2:1`] = [
      {
        answer: FIXTURE_ANSWERS.q2Attempt1,
        response: evaluation(2, 1, true, {
          core_accuracy: 90,
          simplicity: 75,
          feedback: "Đúng đường đi: route gọi service, service nhờ repo tìm loại hàng.",
          detected_jargons: [],
          follow_up: null,
        }),
      },
    ];

    for (const i of [1, 2] as const) {
      const state = questionState(i, true);
      const reveal: RevealResponse = {
        question: { ...state, attempts_used: 0, outcome: "FAILED", ended_by: "SKIP" },
        skill_change: { skill: state.skill, p_before: 0, p_after: 0, outcome: "FAILED" },
        node_state: nodeState(),
        unlocked_node_ids: [],
      };
      reveals[`${run}:${i}`] = reveal;
    }
  }

  return {
    bundle_version: "fixture",
    recorded_from: {
      repo: ingest.result.repo_name,
      snapshot_id: ingest.result.snapshot.snapshot_id,
      engine_version: ingest.result.engine_version,
      prompt_version: CONFIG.PROMPT_VERSION,
      model: "fixture",
      recorded_at: 0,
    },
    ingest,
    analyses: { [FIXTURE_NODE_ID]: analysis },
    overview: {
      facts: {
        archetype: ingest.result.fingerprint.archetype,
        framework: ingest.result.fingerprint.detected_framework,
        tech_stack: ingest.result.fingerprint.tech_stack,
        root_node_ids: ingest.result.nodes.filter((n) => n.prerequisites.length === 0).map((n) => n.id),
        main_path_node_ids: [],
      },
      ai: null,
    },
    enrich,
    scripted_answers: scripted,
    reveals,
  };
}

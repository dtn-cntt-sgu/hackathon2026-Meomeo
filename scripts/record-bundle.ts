/**
 * Script ghi Offline Mock Bundle phục vụ demo offline (public/demo/mock_bundle.json).
 *
 * Quy trình chạy 2 bước để ghi bundle:
 *
 * Bước 1 (Lấy câu hỏi Feynman cho node khả dụng):
 *   npx tsx scripts/record-bundle.ts <base-url> <repo-url> --persona NEWBIE --chi-cau-hoi
 *   - Script sẽ ingest, analyze và enrich node đầu tiên đang AVAILABLE.
 *   - Dừng ở node đó: KHÔNG gọi evaluate-feynman, KHÔNG gọi reveal.
 *   - Tạo / cập nhật file câu trả lời mẫu (mặc định scripts/answers.<persona>.json hoặc theo --answers <file>).
 *   - File chứa khóa "_cau_hoi" ghi nội dung câu hỏi để tiện soạn thảo, và các khóa "<node_id>:<q_index>" gán [].
 *   - Các node phía sau còn LOCKED sẽ được ghi nhận trong log cảnh báo.
 *
 * Soạn kịch bản trả lời:
 *   - Mở file answers đã sinh (vd: scripts/answers.newbie.json).
 *   - Viết các câu trả lời dạng mảng chuỗi vào khóa của câu hỏi tương ứng.
 *
 * Bước 2 (Gửi câu trả lời và hoàn thành node):
 *   npx tsx scripts/record-bundle.ts <base-url> <repo-url> --persona NEWBIE --answers scripts/answers.newbie.json [--reveal-con-lai]
 *   - Script đọc lại run đang mở (enrich-node là idempotent).
 *   - Bỏ qua các câu đã xong (state.finished === true).
 *   - Gửi các câu trả lời từ lượt attempts_used + 1 trở đi cho đến khi hoàn thành câu.
 *   - Nếu không có câu trả lời hoặc hết câu trả lời, mặc định bỏ qua (chỉ reveal khi truyền cờ --reveal-con-lai).
 *   - Khi node hoàn thành, server mở khóa node tiếp theo trong DB.
 *
 * Lặp lại:
 *   - Chạy lại Bước 1 để lấy câu hỏi cho node vừa được mở khóa.
 *   - Soạn câu trả lời -> Chạy Bước 2 -> Lặp lại cho đến hết các node cần ghi.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CONFIG } from "../src/contracts/config";
import type {
  AnalyzeNodeRequest,
  AnalyzeOverviewRequest,
  AnalyzeOverviewResponse,
  AnalyzeNodeResponse,
  ClientStaticEngineResult,
  EnrichNodeRequest,
  EnrichNodeResponse,
  EvaluateFeynmanRequest,
  EvaluateFeynmanResponse,
  IngestRequest,
  IngestResponse,
  NodeAnalysisView,
  OfflineMockBundle,
  PersonaMode,
  RepoOverviewView,
  RevealRequest,
  RevealResponse,
} from "../src/contracts";

interface CliOptions {
  baseUrl: string;
  repoUrl: string;
  persona: PersonaMode;
  answersFile?: string;
  nodes?: string[];
  outFile: string;
  onlyQuestions: boolean;
  revealRemaining: boolean;
}

export class ScriptApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(`[${path}] HTTP ${status} (${code}): ${message}`);
    this.name = "ScriptApiError";
  }
}

const RETRYABLE_CODES = new Set([
  "ERR_AI_UNAVAILABLE",
  "ERR_AI_REJECTED",
  "ERR_PERSISTENCE_UNAVAILABLE",
]);

const QUESTION_SKIPPABLE_ERRORS = new Set([
  "ERR_QUESTION_FINISHED",
  "ERR_ATTEMPT_OUT_OF_SYNC",
  "ERR_ANSWER_DUPLICATE",
  "ERR_ANSWER_TOO_SHORT",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function call<T>(
  baseUrl: string,
  token: string,
  endpoint: string,
  body: unknown
): Promise<T> {
  const url = `${baseUrl}${endpoint}`;
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (netErr) {
      const errMsg = netErr instanceof Error ? netErr.message : String(netErr);
      console.error(`${endpoint} network failure: ${errMsg}`);
      if (attempt < maxRetries) {
        console.log(
          `Đang thử lại sau 2 giây (lần ${attempt + 1}/${maxRetries})...`
        );
        await sleep(2000);
        continue;
      }
      throw new Error(`Không thể kết nối tới ${endpoint}: ${errMsg}`);
    }

    if (res.ok) {
      return (await res.json()) as T;
    }

    let code = "UNKNOWN_ERROR";
    let message = res.statusText || "Request failed";
    try {
      const errJson = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      if (errJson?.error?.code) {
        code = errJson.error.code;
      }
      if (errJson?.error?.message) {
        message = errJson.error.message;
      }
    } catch {
      // Bỏ qua lỗi parse JSON body
    }

    console.error(`${endpoint} status ${res.status}: ${code} - ${message}`);

    if (RETRYABLE_CODES.has(code) && attempt < maxRetries) {
      console.log(
        `Gặp lỗi có thể thử lại (${code}), chờ 2 giây trước khi gọi lại (lần ${attempt + 1}/${maxRetries})...`
      );
      await sleep(2000);
      continue;
    }

    throw new ScriptApiError(endpoint, res.status, code, message);
  }

  throw new Error(
    `Không thể hoàn thành yêu cầu tới ${endpoint} sau ${maxRetries} lần thử lại.`
  );
}

function parseCliArgs(argv: string[]): CliOptions {
  const positional: string[] = [];
  let persona: PersonaMode = "NEWBIE";
  let answersFile: string | undefined;
  let nodes: string[] | undefined;
  let outFile = "public/demo/mock_bundle.json";
  let onlyQuestions = false;
  let revealRemaining = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--persona") {
      const val = argv[++i];
      if (val !== "NEWBIE" && val !== "MID_LEVEL" && val !== "SENIOR_RUSTY") {
        console.error(
          `Lỗi: Persona không hợp lệ "${val}". Chỉ chấp nhận: NEWBIE, MID_LEVEL, SENIOR_RUSTY.`
        );
        process.exit(1);
      }
      persona = val;
    } else if (arg.startsWith("--persona=")) {
      const val = arg.slice("--persona=".length);
      if (val !== "NEWBIE" && val !== "MID_LEVEL" && val !== "SENIOR_RUSTY") {
        console.error(
          `Lỗi: Persona không hợp lệ "${val}". Chỉ chấp nhận: NEWBIE, MID_LEVEL, SENIOR_RUSTY.`
        );
        process.exit(1);
      }
      persona = val;
    } else if (arg === "--answers") {
      answersFile = argv[++i];
    } else if (arg.startsWith("--answers=")) {
      answersFile = arg.slice("--answers=".length);
    } else if (arg === "--chi-cau-hoi" || arg === "--chi-cau-hoi=true") {
      onlyQuestions = true;
    } else if (arg === "--reveal-con-lai" || arg === "--reveal-con-lai=true") {
      revealRemaining = true;
    } else if (arg === "--nodes") {
      const val = argv[++i];
      if (val) {
        nodes = val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else if (arg.startsWith("--nodes=")) {
      const val = arg.slice("--nodes=".length);
      nodes = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--out") {
      outFile = argv[++i];
    } else if (arg.startsWith("--out=")) {
      outFile = arg.slice("--out=".length);
    } else if (arg.startsWith("-")) {
      console.warn(`Cảnh báo: Tham số không nhận diện: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    console.error(
      "Cách dùng: npx tsx scripts/record-bundle.ts <base-url> <repo-url> [--persona NEWBIE|MID_LEVEL|SENIOR_RUSTY] [--chi-cau-hoi] [--answers <file>] [--reveal-con-lai] [--nodes N1,N2] [--out public/demo/mock_bundle.json]"
    );
    console.error(
      "\nQuy trình 2 bước ghi bundle:\n" +
        "  Bước 1 (Lấy câu hỏi): npx tsx scripts/record-bundle.ts <base-url> <repo-url> --persona NEWBIE --chi-cau-hoi\n" +
        "    -> Dừng sau enrich, ghi file câu trả lời mẫu vào scripts/answers.newbie.json (hoặc theo --answers).\n" +
        "  Soạn câu trả lời: Điền câu trả lời vào file JSON vừa sinh.\n" +
        "  Bước 2 (Gửi câu trả lời): npx tsx scripts/record-bundle.ts <base-url> <repo-url> --persona NEWBIE --answers scripts/answers.newbie.json [--reveal-con-lai]\n" +
        "    -> Đánh giá câu trả lời, hoàn thành node và mở khóa node kế tiếp.\n" +
        "  Lặp lại: Chạy lại Bước 1 cho node kế tiếp."
    );
    process.exit(1);
  }

  const baseUrl = positional[0].replace(/\/+$/, "");
  const repoUrl = positional[1];

  return {
    baseUrl,
    repoUrl,
    persona,
    answersFile,
    nodes,
    outFile,
    onlyQuestions,
    revealRemaining,
  };
}

function buildMinimalOverview(result: ClientStaticEngineResult): RepoOverviewView {
  const rootNodeIds = result.nodes
    .filter((n) => n.prerequisites.length === 0)
    .map((n) => n.id);
  const root_node_ids =
    rootNodeIds.length > 0
      ? rootNodeIds
      : result.nodes.slice(0, 1).map((n) => n.id);

  const capstone = result.nodes.find((n) => n.is_capstone);
  const main_path_node_ids = capstone
    ? Array.from(new Set([root_node_ids[0], capstone.id].filter(Boolean)))
    : root_node_ids.slice(0, 6);

  return {
    facts: {
      archetype: result.fingerprint?.archetype ?? "WEB_BACKEND",
      framework: result.fingerprint?.detected_framework ?? null,
      tech_stack: result.fingerprint?.tech_stack ?? [],
      root_node_ids,
      main_path_node_ids,
    },
    ai: null,
  };
}

type AnswersMap = Record<string, string[]>;

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  const token = process.env.SF_DEMO_TOKEN;
  if (!token || token.trim() === "") {
    console.error("Lỗi: Thiếu biến môi trường SF_DEMO_TOKEN.");
    console.error("Vui lòng thiết lập access token Supabase của tài khoản demo:");
    console.error('  Linux/macOS: export SF_DEMO_TOKEN="<token>"');
    console.error('  Windows pwsh: $env:SF_DEMO_TOKEN="<token>"');
    process.exit(1);
  }

  const defaultAnswersFile = `scripts/answers.${options.persona.toLowerCase()}.json`;
  const answersFilePath = path.resolve(
    options.answersFile ?? defaultAnswersFile
  );

  const answersMap: AnswersMap = {};
  if (options.answersFile) {
    try {
      const raw = await fs.readFile(options.answersFile, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (k === "_cau_hoi") {
          continue;
        }
        if (Array.isArray(v)) {
          answersMap[k] = v.filter(
            (item): item is string => typeof item === "string"
          );
        }
      }
      console.log(`Đã nạp file kịch bản trả lời từ: ${options.answersFile}`);
    } catch (err) {
      console.error(
        `Không thể đọc file answers tại ${options.answersFile}:`,
        err instanceof Error ? err.message : String(err)
      );
      process.exit(1);
    }
  }

  let step1AnswersContent: Record<string, unknown> = {};
  let step1CauHoiMap: Record<string, string> = {};

  if (options.onlyQuestions) {
    try {
      const raw = await fs.readFile(answersFilePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      step1AnswersContent = { ...parsed };
      if (
        parsed._cau_hoi &&
        typeof parsed._cau_hoi === "object" &&
        !Array.isArray(parsed._cau_hoi)
      ) {
        step1CauHoiMap = { ...(parsed._cau_hoi as Record<string, string>) };
      }
    } catch {
      step1AnswersContent = {};
      step1CauHoiMap = {};
    }
  }

  console.log(`Bắt đầu Ingest repository: ${options.repoUrl}`);
  const ingest = await call<IngestResponse>(
    options.baseUrl,
    token,
    "/api/ingest",
    {
      repo_url: options.repoUrl,
    } satisfies IngestRequest
  );

  const sessionId = ingest.session_id;
  console.log(`Ingest thành công. Session ID: ${sessionId}`);

  const allNodeIds = ingest.result.nodes.map((n) => n.id);
  const targetNodeIds =
    options.nodes && options.nodes.length > 0
      ? options.nodes.filter((id) => allNodeIds.includes(id))
      : allNodeIds;

  if (options.nodes && options.nodes.length > 0) {
    const unknownNodes = options.nodes.filter(
      (id) => !allNodeIds.includes(id)
    );
    if (unknownNodes.length > 0) {
      console.warn(
        `Cảnh báo: Các node sau không tìm thấy trong kết quả ingest: ${unknownNodes.join(", ")}`
      );
    }
  }

  console.log(
    `Tổng node cần xử lý: ${targetNodeIds.length} / ${allNodeIds.length} node`
  );

  const analyses: Record<string, NodeAnalysisView> = {
    ...(ingest.analyses ?? {}),
  };
  const enrich: Record<string, EnrichNodeResponse> = {};
  const scripted_answers: Record<
    string,
    Array<{ answer: string; response: EvaluateFeynmanResponse }>
  > = {};
  const reveals: Record<string, RevealResponse> = {};

  let processedNodesCount = 0;
  let skippedNodesCount = 0;
  let recordedRunsCount = 0;
  let scriptedAnswersCount = 0;
  let revealsCount = 0;

  for (const nodeId of targetNodeIds) {
    console.log(`\n--- [Node ${nodeId}] ---`);

    // 1. Phân tích node
    try {
      const analyzeRes = await call<AnalyzeNodeResponse>(
        options.baseUrl,
        token,
        "/api/analyze-node",
        {
          session_id: sessionId,
          node_id: nodeId,
        } satisfies AnalyzeNodeRequest
      );
      if (analyzeRes.analysis !== null) {
        analyses[nodeId] = analyzeRes.analysis;
        console.log(`  Phân tích node ${nodeId} thành công.`);
      } else {
        console.warn(`  Phân tích node ${nodeId} trả về null.`);
      }
    } catch (err) {
      console.warn(
        `  Lỗi khi gọi /api/analyze-node (${nodeId}):`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // 2. Enrich node
    let enrichRes: EnrichNodeResponse;
    try {
      enrichRes = await call<EnrichNodeResponse>(
        options.baseUrl,
        token,
        "/api/enrich-node",
        {
          session_id: sessionId,
          node_id: nodeId,
          mode: "LEARN",
        } satisfies EnrichNodeRequest
      );
    } catch (err) {
      if (
        err instanceof ScriptApiError &&
        err.code === "ERR_NODE_NOT_AVAILABLE"
      ) {
        if (options.onlyQuestions) {
          console.warn(
            `  Node ${nodeId} chưa mở khóa — viết câu trả lời cho node trước rồi chạy bước 2, sau đó chạy lại bước 1 cho node kế`
          );
        } else {
          console.warn(
            `  Cảnh báo: Node ${nodeId} chưa mở khóa (ERR_NODE_NOT_AVAILABLE), bỏ qua node.`
          );
        }
        skippedNodesCount++;
        continue;
      }
      console.error(
        `  Lỗi khi enrich node ${nodeId}:`,
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }

    const runKey = `${nodeId}:LEARN:${options.persona}`;
    enrich[runKey] = enrichRes;
    recordedRunsCount++;
    processedNodesCount++;
    console.log(`  Enrich node ${nodeId} thành công. Run ID: ${enrichRes.run_id}`);

    // Bước 1 (--chi-cau-hoi): Thu thập câu hỏi mẫu, ghi file answers và dừng ở node đó (không evaluate, không reveal)
    if (options.onlyQuestions) {
      console.log(
        `  [--chi-cau-hoi] Thu thập ${enrichRes.questions.length} câu hỏi cho node ${nodeId}...`
      );
      for (const question of enrichRes.questions) {
        const qKey = `${nodeId}:${question.question_index}`;
        step1CauHoiMap[qKey] = question.feynman_question;
        if (!Array.isArray(step1AnswersContent[qKey])) {
          step1AnswersContent[qKey] = [];
        }
      }

      const fileToSave: Record<string, unknown> = {
        _cau_hoi: step1CauHoiMap,
      };
      for (const [k, v] of Object.entries(step1AnswersContent)) {
        if (k !== "_cau_hoi") {
          fileToSave[k] = v;
        }
      }

      await fs.mkdir(path.dirname(answersFilePath), { recursive: true });
      await fs.writeFile(
        answersFilePath,
        JSON.stringify(fileToSave, null, 2),
        "utf8"
      );
      console.log(
        `  [--chi-cau-hoi] Đã lưu câu hỏi vào ${answersFilePath}. Dừng ở node ${nodeId}.`
      );
      continue;
    }

    // Bước 2: Xử lý các câu hỏi
    for (const question of enrichRes.questions) {
      const qIndex = question.question_index;
      const questionAnswersKey = `${nodeId}:${qIndex}`;

      // a. Nếu câu đã xong (state.finished === true) -> bỏ qua, log "đã xong", KHÔNG gọi API
      if (question.state.finished) {
        console.log(`  Câu ${qIndex}: Đã xong, bỏ qua.`);
        continue;
      }

      const scriptAnswers = answersMap[questionAnswersKey];
      const hasScriptAnswers =
        Array.isArray(scriptAnswers) && scriptAnswers.length > 0;

      // b. Mảng rỗng hoặc không có khóa -> KHÔNG reveal mặc định; log "chưa có câu trả lời, bỏ qua". Chỉ reveal khi có --reveal-con-lai
      if (!hasScriptAnswers) {
        if (options.revealRemaining) {
          console.log(
            `  Câu ${qIndex}: Chưa có câu trả lời ⇒ Gọi /api/reveal do có cờ --reveal-con-lai.`
          );
          try {
            const revRes = await call<RevealResponse>(
              options.baseUrl,
              token,
              "/api/reveal",
              {
                session_id: sessionId,
                run_id: enrichRes.run_id,
                question_index: qIndex,
              } satisfies RevealRequest
            );
            reveals[`${runKey}:${qIndex}`] = revRes;
            revealsCount++;
          } catch (err) {
            if (
              err instanceof ScriptApiError &&
              QUESTION_SKIPPABLE_ERRORS.has(err.code)
            ) {
              console.warn(
                `    Cảnh báo: Lỗi khi reveal câu ${qIndex}: ${err.code} - ${err.message}`
              );
            } else {
              throw err;
            }
          }
        } else {
          console.log(`  Câu ${qIndex}: Chưa có câu trả lời, bỏ qua.`);
        }
        continue;
      }

      // c. Có câu trả lời (mảng khác rỗng) -> bắt đầu từ attempt_number = state.attempts_used + 1, chỉ gửi câu trả lời từ state.attempts_used trở đi
      const attemptsUsed = question.state.attempts_used ?? 0;
      const answersToSend = scriptAnswers.slice(attemptsUsed);
      let attemptNumber = attemptsUsed + 1;

      console.log(
        `  Câu ${qIndex}: Tìm thấy ${scriptAnswers.length} câu trả lời trong kịch bản (đã dùng: ${attemptsUsed}, cần gửi: ${answersToSend.length}).`
      );

      // Nếu đã hết câu trả lời trong mảng từ trước đó mà câu chưa xong
      if (answersToSend.length === 0) {
        if (options.revealRemaining) {
          console.log(
            `    Hết câu trả lời kịch bản nhưng câu ${qIndex} chưa xong ⇒ Gọi /api/reveal do có cờ --reveal-con-lai.`
          );
          try {
            const revRes = await call<RevealResponse>(
              options.baseUrl,
              token,
              "/api/reveal",
              {
                session_id: sessionId,
                run_id: enrichRes.run_id,
                question_index: qIndex,
              } satisfies RevealRequest
            );
            reveals[`${runKey}:${qIndex}`] = revRes;
            revealsCount++;
          } catch (err) {
            if (
              err instanceof ScriptApiError &&
              QUESTION_SKIPPABLE_ERRORS.has(err.code)
            ) {
              console.warn(
                `    Cảnh báo: Lỗi khi reveal câu ${qIndex}: ${err.code} - ${err.message}`
              );
            } else {
              throw err;
            }
          }
        } else {
          console.log(
            `    Hết câu trả lời kịch bản nhưng câu ${qIndex} chưa xong ⇒ Để nguyên (không reveal).`
          );
        }
        continue;
      }

      let isFinished = false;
      let encounteredSkippableError = false;

      for (const answerText of answersToSend) {
        console.log(`    Gửi đánh giá câu trả lời lượt ${attemptNumber}...`);
        let evalRes: EvaluateFeynmanResponse;
        try {
          evalRes = await call<EvaluateFeynmanResponse>(
            options.baseUrl,
            token,
            "/api/evaluate-feynman",
            {
              session_id: sessionId,
              run_id: enrichRes.run_id,
              question_index: qIndex,
              student_answer: answerText,
              attempt_number: attemptNumber,
            } satisfies EvaluateFeynmanRequest
          );
        } catch (err) {
          if (
            err instanceof ScriptApiError &&
            QUESTION_SKIPPABLE_ERRORS.has(err.code)
          ) {
            console.warn(
              `    Cảnh báo: Câu ${qIndex} gặp lỗi ${err.code} (${err.message}), chuyển sang câu kế.`
            );
            encounteredSkippableError = true;
            break;
          }
          throw err;
        }

        const attemptKey = `${runKey}:${qIndex}:${attemptNumber}`;
        if (!scripted_answers[attemptKey]) {
          scripted_answers[attemptKey] = [];
        }
        scripted_answers[attemptKey].push({
          answer: answerText,
          response: evalRes,
        });
        scriptedAnswersCount++;

        if (evalRes.question.finished) {
          console.log(
            `    Câu ${qIndex} đã hoàn thành ở lượt ${attemptNumber}.`
          );
          isFinished = true;
          break;
        }

        attemptNumber++;
      }

      // d. Hết câu trả lời mà câu chưa xong -> chỉ reveal khi có --reveal-con-lai, không thì để nguyên
      if (!encounteredSkippableError && !isFinished) {
        if (options.revealRemaining) {
          console.log(
            `    Hết câu trả lời kịch bản nhưng câu ${qIndex} chưa xong ⇒ Gọi /api/reveal do có cờ --reveal-con-lai.`
          );
          try {
            const revRes = await call<RevealResponse>(
              options.baseUrl,
              token,
              "/api/reveal",
              {
                session_id: sessionId,
                run_id: enrichRes.run_id,
                question_index: qIndex,
              } satisfies RevealRequest
            );
            reveals[`${runKey}:${qIndex}`] = revRes;
            revealsCount++;
          } catch (err) {
            if (
              err instanceof ScriptApiError &&
              QUESTION_SKIPPABLE_ERRORS.has(err.code)
            ) {
              console.warn(
                `    Cảnh báo: Lỗi khi reveal câu ${qIndex}: ${err.code} - ${err.message}`
              );
            } else {
              throw err;
            }
          }
        } else {
          console.log(
            `    Hết câu trả lời kịch bản nhưng câu ${qIndex} chưa xong ⇒ Để nguyên (không reveal).`
          );
        }
      }
    }
  }

  // AI tổng quan (tên bài, tên nhóm, tóm tắt tiếng Việt); lỗi ⇒ bản tối thiểu, ai = null
  let overview = buildMinimalOverview(ingest.result);
  try {
    const ov = await call<AnalyzeOverviewResponse>(options.baseUrl, token, "/api/analyze-overview", {
      session_id: sessionId,
    } satisfies AnalyzeOverviewRequest);
    if (ov.overview.ai !== null) {
      overview = ov.overview;
      console.log("AI tổng quan: có.");
    } else {
      console.warn("AI tổng quan trả về null ⇒ dùng bản tối thiểu.");
    }
  } catch (err) {
    console.warn("Lỗi khi gọi /api/analyze-overview:", err instanceof Error ? err.message : String(err));
  }

  const recordedFrom = {
    repo: options.repoUrl,
    snapshot_id: ingest.result.snapshot.snapshot_id,
    engine_version: ingest.result.engine_version || CONFIG.ENGINE_VERSION,
    prompt_version: CONFIG.PROMPT_VERSION,
    model: CONFIG.LLM_MODEL,
    recorded_at: Date.now(),
  };

  const outFilePath = path.resolve(options.outFile);
  let finalBundle: OfflineMockBundle;

  try {
    const existingRaw = await fs.readFile(outFilePath, "utf8");
    const existingBundle = JSON.parse(existingRaw) as Partial<OfflineMockBundle>;
    console.log(
      `\nTìm thấy bundle đã có tại ${outFilePath}. Tiến hành gộp dữ liệu các persona...`
    );

    finalBundle = {
      bundle_version: "1",
      recorded_from: recordedFrom,
      ingest,
      overview,
      analyses: {
        ...(existingBundle.analyses ?? {}),
        ...analyses,
      },
      enrich: {
        ...(existingBundle.enrich ?? {}),
        ...enrich,
      },
      scripted_answers: {
        ...(existingBundle.scripted_answers ?? {}),
        ...scripted_answers,
      },
      reveals: {
        ...(existingBundle.reveals ?? {}),
        ...reveals,
      },
    };
  } catch {
    console.log(`\nKhởi tạo bundle mới tại ${outFilePath}...`);
    finalBundle = {
      bundle_version: "1",
      recorded_from: recordedFrom,
      ingest,
      overview,
      analyses,
      enrich,
      scripted_answers,
      reveals,
    };
  }

  await fs.mkdir(path.dirname(outFilePath), { recursive: true });
  await fs.writeFile(
    outFilePath,
    JSON.stringify(finalBundle, null, 2),
    "utf8"
  );

  console.log("\n================ TÓM TẮT GHI BUNDLE ================");
  console.log(`- Persona: ${options.persona}`);
  console.log(
    `- Chế độ chỉ lấy câu hỏi (--chi-cau-hoi): ${
      options.onlyQuestions ? "BẬT" : "TẮT"
    }`
  );
  console.log(
    `- Chế độ reveal còn lại (--reveal-con-lai): ${
      options.revealRemaining ? "BẬT" : "TẮT"
    }`
  );
  console.log(`- Số node đã xử lý: ${processedNodesCount} / ${targetNodeIds.length}`);
  console.log(`- Số node bị bỏ qua: ${skippedNodesCount}`);
  console.log(`- Số run đã ghi (enrich): ${recordedRunsCount}`);
  console.log(`- Số câu có kịch bản đã ghi: ${scriptedAnswersCount}`);
  console.log(`- Số câu đã reveal: ${revealsCount}`);
  console.log(`- File kết quả bundle: ${outFilePath}`);
  if (options.onlyQuestions) {
    console.log(`- File câu hỏi mẫu: ${answersFilePath}`);
  } else if (options.answersFile) {
    console.log(`- File kịch bản câu trả lời: ${options.answersFile}`);
  }
  console.log("====================================================\n");
}

main().catch((err) => {
  console.error("Gặp lỗi nghiêm trọng:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

import { CONFIG, type RepoOverviewAI, type SessionRow, type StaticEngineResult } from "@/contracts";
import { callLLMOnce, type LlmOutcome } from "./gemini";
import { overviewRequest, type OverviewRaw } from "./prompts/overview";

export interface OverviewUsage {
  tokens_in: number;
  tokens_out: number;
  retries: number;
}

const SUMMARY_MAX_CHARS = 700;
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Tên bài / tên nhóm dùng được: có chữ, không quá dài, không mang dấu vết code hay đường dẫn. */
export function cleanName(raw: string): string | null {
  const t = raw.trim().replace(/^["'“”‘’]+|["'“”‘’.]+$/g, "").trim();
  if (t.length === 0 || [...t].length > CONFIG.TITLE_MAX_CHARS) return null;
  if (!/\p{L}/u.test(t)) return null;
  if (/[<>`{}\\/]|https?:|\(\)/i.test(t)) return null;
  return t;
}

export function cleanSummary(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length < 20 || t.length > SUMMARY_MAX_CHARS) return null;
  if (/[<>`]|https?:/i.test(t)) return null;
  return t;
}

/** Kiểm kết quả thô: bỏ id lạ, bỏ tên hỏng. Không còn gì dùng được ⇒ null. */
export function checkOverview(raw: OverviewRaw, graph: StaticEngineResult): RepoOverviewAI | null {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const groupIds = new Set(graph.groups.map((g) => g.group_id));

  const node_titles: Record<string, string> = {};
  for (const n of raw.nodes) {
    const name = cleanName(n.title);
    if (name && nodeIds.has(n.id) && !(n.id in node_titles)) node_titles[n.id] = name;
  }
  const group_names: Record<string, string> = {};
  for (const g of raw.groups) {
    const name = cleanName(g.name);
    if (name && groupIds.has(g.id) && !(g.id in group_names)) group_names[g.id] = name;
  }
  const summary = cleanSummary(raw.summary) ?? "";

  if (!summary && Object.keys(node_titles).length === 0) return null;
  // Đo 08/11: flash-lite (model dự phòng) hay viết tiếng Việt mất dấu ⇒ cả kết quả bỏ, UI giữ tên tất định
  const allText = [summary, ...Object.values(node_titles), ...Object.values(group_names)].join(" ");
  if (!VI_DIACRITIC.test(allText)) return null;
  return { summary, node_titles, group_names };
}

/** 1 lời gọi OVERVIEW (+ tối đa CONFIG.LLM_MAX_RETRIES lần gọi lại khi lỗi). AI lỗi ⇒ null, không ném. */
export async function analyzeOverview(
  session: SessionRow,
  graph: StaticEngineResult,
  usage?: OverviewUsage,
): Promise<RepoOverviewAI | null> {
  let result: RepoOverviewAI | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  let retries = 0;
  let lastFailed = false;

  for (let i = 0; i <= CONFIG.LLM_MAX_RETRIES; i++) {
    if (i > 0) retries++;
    const r: LlmOutcome<OverviewRaw> = await callLLMOnce(overviewRequest(session, graph), undefined, undefined, { liteOnly: lastFailed });
    lastFailed = !r.ok;
    tokensIn += r.tokens_in;
    tokensOut += r.tokens_out;
    if (r.ok) {
      result = checkOverview(r.value, graph);
      if (result) break;
    } else if (r.kind === "FATAL") {
      break;
    } else if (i < CONFIG.LLM_MAX_RETRIES) {
      await new Promise((res) => setTimeout(res, r.retry_after_ms ?? CONFIG.LLM_RETRY_DELAY_MS));
    }
  }

  if (usage) {
    usage.tokens_in = tokensIn;
    usage.tokens_out = tokensOut;
    usage.retries = retries;
  }
  return result;
}

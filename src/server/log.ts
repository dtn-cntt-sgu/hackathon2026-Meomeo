import pino from "pino";
import type { ErrorCode, GuardLogEntry } from "@/contracts";

export const logger = pino({
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      "student_answer",
      "snippet",
      "authorization",
      "token",
      "access_token",
      "refresh_token",
    ],
    remove: true,
  },
});

export interface ApiRequestLogEntry {
  req_id: string;
  route: string;
  status: number;
  duration_ms: number;
  tokens_used?: number;
  session_id?: string;
  node_id?: string;
  error_code: ErrorCode | null;
}

// 4 trường tùy chọn: bản log tối giản (B23), lời gọi Gemini chưa có req_id; pino bỏ qua trường undefined
export interface AiCallLogEntry {
  req_id?: string;
  call_kind: "ANALYZE" | "OVERVIEW" | "QUESTIONS" | "GRADE" | "EXPLAIN";
  backend: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cached_tokens?: number;
  retries: number;
  cost_usd: number;
  ai_cache_hit?: boolean;
  duration_ms?: number;
  session_id?: string;
  node_id?: string;
}

const WARN_ERROR_CODES = new Set<string>([
  "ERR_AI_UNAVAILABLE",
  "ERR_TOKEN_QUOTA_EXCEEDED",
  "ERR_SERVER_BUSY",
  "ERR_GITHUB_RATE_LIMIT_CDN",
  "ERR_STREAM_QUOTA_EXCEEDED",
  "ERR_SESSION_ENGINE_OUTDATED",
]);

export function logApiRequest(entry: ApiRequestLogEntry): void {
  const payload: Record<string, unknown> = {
    req_id: entry.req_id,
    route: entry.route,
    status: entry.status,
    duration_ms: entry.duration_ms,
    error_code: entry.error_code,
  };
  if (entry.tokens_used !== undefined) {
    payload.tokens_used = entry.tokens_used;
  }
  if (entry.session_id !== undefined) {
    payload.session_id = entry.session_id;
  }
  if (entry.node_id !== undefined) {
    payload.node_id = entry.node_id;
  }

  if (entry.error_code && WARN_ERROR_CODES.has(entry.error_code)) {
    logger.warn(payload);
  } else if (entry.error_code === "ERR_PERSISTENCE_UNAVAILABLE" || entry.status >= 500) {
    logger.error(payload);
  } else {
    logger.info(payload);
  }
}

export function logAiCall(entry: AiCallLogEntry): void {
  const payload: Record<string, unknown> = {
    req_id: entry.req_id,
    call_kind: entry.call_kind,
    backend: entry.backend,
    model: entry.model,
    tokens_in: entry.tokens_in,
    tokens_out: entry.tokens_out,
    cached_tokens: entry.cached_tokens,
    retries: entry.retries,
    cost_usd: entry.cost_usd,
    ai_cache_hit: entry.ai_cache_hit,
    duration_ms: entry.duration_ms,
  };
  if (entry.session_id !== undefined) {
    payload.session_id = entry.session_id;
  }
  if (entry.node_id !== undefined) {
    payload.node_id = entry.node_id;
  }
  logger.info(payload);
}

export function logGuardBlocked(entry: GuardLogEntry): void {
  const payload = {
    event: entry.event,
    call: entry.call,
    attempt: entry.attempt,
    node_id: entry.node_id,
    codes: entry.codes,
    prompt_version: entry.prompt_version,
    llm_model: entry.llm_model,
  };
  logger.warn(payload);
}

function maskSecrets(text: string): string {
  if (!text) return "";
  let masked = text;

  const secretEnvKeys = [
    "DATABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "GITHUB_TOKEN",
  ] as const;

  for (const key of secretEnvKeys) {
    const val = process.env[key];
    if (val && typeof val === "string" && val.trim().length > 0) {
      masked = masked.split(val).join("<REDACTED>");
    }
  }

  // (b) thay chuỗi scheme://... có chứa @ bằng <REDACTED>
  masked = masked.replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'`<>]*@[^\s"'`<>]+/g, "<REDACTED>");

  // (c) thay Bearer <chuỗi> và JWT eyJ... bằng <REDACTED>
  masked = masked.replace(/Bearer\s+\S+/gi, "<REDACTED>");
  masked = masked.replace(/eyJ[A-Za-z0-9_\-.]+/g, "<REDACTED>");

  return masked;
}

export function logUnexpectedError(error: unknown): void {
  let error_name = "NonError";
  let raw_message = "";

  if (error instanceof Error) {
    error_name = typeof error.name === "string" && error.name ? error.name : "Error";
    raw_message = typeof error.message === "string" ? error.message : "";
  } else if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;
    const hasName = typeof errObj.name === "string";
    const hasMsg = typeof errObj.message === "string";
    if (hasName || hasMsg) {
      error_name = hasName ? (errObj.name as string) : "NonError";
      raw_message = hasMsg ? (errObj.message as string) : "";
    }
  }

  const error_message = maskSecrets(raw_message);
  logger.error({ event: "unexpected_error", error_name, error_message });
}

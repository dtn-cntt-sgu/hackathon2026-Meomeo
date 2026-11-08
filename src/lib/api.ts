import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalyzeOverviewResponse,
  AnalyzeNodeResponse,
  ApiError,
  EnrichNodeResponse,
  ErrorCode,
  EvaluateFeynmanRequest,
  EvaluateFeynmanResponse,
  ExplainSelectionRequest,
  ExplainSelectionResponse,
  IngestRequest,
  IngestResponse,
  MeResponse,
  PersonaMode,
  PersonaResponse,
  ProgressResponse,
  RevealRequest,
  RevealResponse,
  RunMode,
  SessionsResponse,
} from "@/contracts";
import { formatErrorMessage } from "@/lib/messages";

// ---------- Lỗi và kết quả ----------

type ErrorDetails = Record<string, string | number | boolean>;

/** Lỗi của bản `apiFetch`/`xxx()` thường. UI không dùng trực tiếp: dùng bản `…Safe`. */
export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  readonly details?: ErrorDetails;

  constructor(
    code: ErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number; details?: ErrorDetails } = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? 0;
    this.details = options.details;
  }
}

export function isApiError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; retryable: boolean; details?: ErrorDetails };

// ---------- Token ----------

// TODO(TH-06): thay bằng `createClient()` của `src/lib/supabase/client.ts` khi file đó merge.
// Hiện chỉ giữ đúng 1 client trình duyệt, tạo lười, để `getAccessToken` chạy được.
let supabaseClient: SupabaseClient | null = null;

function browserSupabase(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  supabaseClient = createBrowserClient(url, key);
  return supabaseClient;
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = browserSupabase();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const supabase = browserSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// ---------- Fetch ----------

export interface ApiFetchOptions {
  method?: string;
  /** Object ⇒ JSON; `FormData` ⇒ multipart (không tự đặt Content-Type). */
  body?: unknown;
  signal?: AbortSignal;
}

function networkError(): ApiClientError {
  return new ApiClientError("ERR_CLIENT_NETWORK", formatErrorMessage("ERR_CLIENT_NETWORK"), {
    retryable: true,
  });
}

function isApiErrorBody(body: unknown): body is ApiError {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const err = (body as { error: unknown }).error;
  return typeof err === "object" && err !== null && typeof (err as { code?: unknown }).code === "string";
}

async function send(endpoint: string, options: ApiFetchOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  try {
    return await fetch(endpoint, { method: options.method ?? "GET", headers, body, signal: options.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw networkError();
  }
}

async function readError(res: Response): Promise<ApiClientError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return networkError();
  }
  if (!isApiErrorBody(body)) return networkError();
  const { code, message, retryable, details } = body.error;
  return new ApiClientError(code, formatErrorMessage(code, message, details), {
    retryable,
    status: res.status,
    details,
  });
}

export async function apiFetch<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  let res = await send(endpoint, options, await getAccessToken());

  // 401 ⇒ làm mới phiên rồi gửi lại đúng 1 lần
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await send(endpoint, options, fresh);
  }

  if (!res.ok) throw await readError(res);
  if (res.status === 204) return undefined as T;

  try {
    return (await res.json()) as T;
  } catch {
    throw networkError();
  }
}

/** Không bao giờ ném lỗi ra component: lỗi nào cũng thành `{ ok: false, … }`. */
export async function apiFetchSafe<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(endpoint, options) };
  } catch (err) {
    if (isApiError(err)) {
      return { ok: false, code: err.code, message: err.message, retryable: err.retryable, details: err.details };
    }
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    const e = networkError();
    return { ok: false, code: e.code, message: e.message, retryable: e.retryable };
  }
}

// ---------- Bảng hợp đồng UI ⇄ API ----------
// Mỗi hàm có 2 bản: bản thường ném `ApiClientError`, bản `…Safe` trả `ApiResult<T>`. UI chỉ dùng `…Safe`.

type Req = readonly [endpoint: string, options?: ApiFetchOptions];

function endpointPair<A extends unknown[], T>(build: (...args: A) => Req) {
  return {
    plain: (...args: A) => apiFetch<T>(...build(...args)),
    safe: (...args: A) => apiFetchSafe<T>(...build(...args)),
  };
}

const post = (endpoint: string, body: unknown): Req => [endpoint, { method: "POST", body }];

const me = endpointPair<[], MeResponse>(() => ["/api/me"]);
export const getMe = me.plain;
export const getMeSafe = me.safe;

const delMe = endpointPair<[], void>(() => ["/api/me", { method: "DELETE" }]);
export const deleteMe = delMe.plain;
export const deleteMeSafe = delMe.safe;

const ingest = endpointPair<[IngestRequest | FormData], IngestResponse>((data) => post("/api/ingest", data));
export const ingestRepo = ingest.plain;
export const ingestRepoSafe = ingest.safe;

const sessions = endpointPair<[], SessionsResponse>(() => ["/api/sessions"]);
export const getSessions = sessions.plain;
export const getSessionsSafe = sessions.safe;

const progress = endpointPair<[string], ProgressResponse>((sessionId) => [
  `/api/sessions/${encodeURIComponent(sessionId)}/progress`,
]);
export const getSessionProgress = progress.plain;
export const getSessionProgressSafe = progress.safe;

const analyze = endpointPair<[string, string], AnalyzeNodeResponse>((sessionId, nodeId) =>
  post("/api/analyze-node", { session_id: sessionId, node_id: nodeId }),
);
export const analyzeNode = analyze.plain;
export const analyzeNodeSafe = analyze.safe;

const overview = endpointPair<[string], AnalyzeOverviewResponse>((sessionId) =>
  post("/api/analyze-overview", { session_id: sessionId }),
);
export const analyzeOverview = overview.plain;
export const analyzeOverviewSafe = overview.safe;

const enrich = endpointPair<[string, string, RunMode?], EnrichNodeResponse>((sessionId, nodeId, mode = "LEARN") =>
  post("/api/enrich-node", { session_id: sessionId, node_id: nodeId, mode }),
);
export const enrichNode = enrich.plain;
export const enrichNodeSafe = enrich.safe;

const evaluate = endpointPair<[EvaluateFeynmanRequest], EvaluateFeynmanResponse>((data) =>
  post("/api/evaluate-feynman", data),
);
export const evaluateFeynman = evaluate.plain;
export const evaluateFeynmanSafe = evaluate.safe;

const reveal = endpointPair<[RevealRequest], RevealResponse>((data) => post("/api/reveal", data));
export const revealAnswer = reveal.plain;
export const revealSafe = reveal.safe;

const explain = endpointPair<[ExplainSelectionRequest], ExplainSelectionResponse>((data) =>
  post("/api/explain-selection", data),
);
export const explainSelection = explain.plain;
export const explainSelectionSafe = explain.safe;

const persona = endpointPair<[PersonaMode], PersonaResponse>((mode) => post("/api/demo/persona", { mode }));
export const switchPersona = persona.plain;
export const switchPersonaSafe = persona.safe;

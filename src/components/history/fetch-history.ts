import type { ApiError, AttemptHistoryItem, ErrorCode, HistoryResponse } from "@/contracts";
import { formatErrorMessage } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";
import { HISTORY_SAMPLE } from "./history-sample";

export type HistoryResult =
  | { ok: true; items: AttemptHistoryItem[]; sample: boolean }
  | { ok: false; code: string; message: string };

function failure(code: ErrorCode): HistoryResult {
  return { ok: false, code, message: formatErrorMessage(code) };
}

export async function fetchHistory(sessionId: string): Promise<HistoryResult> {
  try {
    const { data, error } = await createClient().auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) return failure("ERR_UNAUTHENTICATED");

    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/history`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body: Partial<HistoryResponse & ApiError> | null = await response
      .json()
      .catch(() => null);

    if (response.ok) {
      if (!Array.isArray(body?.items)) return failure("ERR_CLIENT_NETWORK");
      return { ok: true, items: body.items, sample: false };
    }

    if (body?.error?.code === "ERR_SESSION_NOT_FOUND") {
      return failure("ERR_SESSION_NOT_FOUND");
    }
    if (response.status === 404) {
      return { ok: true, items: HISTORY_SAMPLE, sample: true };
    }
    if (response.status === 401 || body?.error?.code === "ERR_UNAUTHENTICATED") {
      return failure("ERR_UNAUTHENTICATED");
    }
    return failure("ERR_PERSISTENCE_UNAVAILABLE");
  } catch {
    return failure("ERR_CLIENT_NETWORK");
  }
}

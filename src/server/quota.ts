import { CONFIG } from "@/contracts";
import { sql } from "@/server/db";
import { ApiHttpError } from "@/server/errors";

export function checkTokenQuota(tokensUsed: number): void {
  if (tokensUsed >= CONFIG.SESSION_TOKEN_QUOTA) {
    throw new ApiHttpError(
      "ERR_TOKEN_QUOTA_EXCEEDED",
      "Hạn mức token của phiên đã hết"
    );
  }
}

export async function assertSessionTokenQuota(sessionId: string): Promise<number> {
  const rows = await sql<{ tokens_used: number }[]>`
    SELECT tokens_used FROM learning_sessions WHERE id = ${sessionId}
  `;
  if (!rows || rows.length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND", "Không tìm thấy phiên học");
  }
  const tokensUsed = rows[0].tokens_used;
  checkTokenQuota(tokensUsed);
  return tokensUsed;
}

export async function addSessionTokens(
  sessionId: string,
  tokensIn: number,
  tokensOut: number
): Promise<number> {
  const delta = tokensIn + tokensOut;
  const rows = await sql<{ tokens_used: number }[]>`
    UPDATE learning_sessions
    SET tokens_used = tokens_used + ${delta}
    WHERE id = ${sessionId}
    RETURNING tokens_used
  `;
  if (!rows || rows.length === 0) {
    throw new ApiHttpError("ERR_SESSION_NOT_FOUND", "Không tìm thấy phiên học");
  }
  return rows[0].tokens_used;
}

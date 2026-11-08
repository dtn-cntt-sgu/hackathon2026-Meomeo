import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts";
import type { ServerErrorCode } from "../errors";
import {
  ApiHttpError,
  createErrorResponse,
  defaultMessage,
  ERROR_HTTP_STATUS,
  isRetryable,
  toErrorResponse,
} from "../errors";
import {
  logAiCall,
  logApiRequest,
  logGuardBlocked,
  logUnexpectedError,
  logger,
} from "../log";

describe("errors", () => {
  const httpStatusTestCases: Array<[ServerErrorCode, number]> = [
    ["ERR_INVALID_GITHUB_URL", 400],
    ["ERR_UNAUTHENTICATED", 401],
    ["ERR_DEMO_MODE_DISABLED", 403],
    ["ERR_SESSION_NOT_FOUND", 404],
    ["ERR_ATTEMPT_OUT_OF_SYNC", 409],
    ["ERR_SESSION_ENGINE_OUTDATED", 410],
    ["ERR_STREAM_QUOTA_EXCEEDED", 413],
    ["ERR_AI_REJECTED", 422],
    ["ERR_TOKEN_QUOTA_EXCEEDED", 429],
    ["ERR_REPO_UNAVAILABLE_451", 451],
    ["ERR_PERSISTENCE_UNAVAILABLE", 503],
    ["ERR_NETWORK_TIMEOUT", 504],
  ];

  it.each(httpStatusTestCases)(
    "ERROR_HTTP_STATUS: mã %s có HTTP status %i",
    (code, expectedStatus) => {
      expect(ERROR_HTTP_STATUS[code]).toBe(expectedStatus);
    },
  );

  describe("isRetryable", () => {
    const retryableCodes = [
      "ERR_NETWORK_TIMEOUT",
      "ERR_STREAM_TIMEOUT",
      "ERR_GITHUB_RATE_LIMIT_CDN",
      "ERR_SERVER_BUSY",
      "ERR_AI_UNAVAILABLE",
      "ERR_AI_REJECTED",
      "ERR_PERSISTENCE_UNAVAILABLE",
      "ERR_ATTEMPT_OUT_OF_SYNC",
    ] as const;

    it("trả về true cho đúng 8 mã retryable", () => {
      for (const code of retryableCodes) {
        expect(isRetryable(code)).toBe(true);
      }
    });

    it("trả về false cho ERR_ANSWER_TOO_SHORT và ERR_SESSION_NOT_FOUND", () => {
      expect(isRetryable("ERR_ANSWER_TOO_SHORT")).toBe(false);
      expect(isRetryable("ERR_SESSION_NOT_FOUND")).toBe(false);
    });
  });

  describe("defaultMessage", () => {
    it("ERR_ANSWER_TOO_SHORT chứa String(CONFIG.ANSWER_MIN_CHARS)", () => {
      const msg = defaultMessage("ERR_ANSWER_TOO_SHORT");
      expect(msg).toContain(String(CONFIG.ANSWER_MIN_CHARS));
    });

    it("ERR_UNSUPPORTED_LANGUAGE chèn details.language hoặc dùng dự phòng", () => {
      const msgWithLang = defaultMessage("ERR_UNSUPPORTED_LANGUAGE", {
        language: "Kotlin",
      });
      expect(msgWithLang).toContain("Kotlin");

      const msgDefault = defaultMessage("ERR_UNSUPPORTED_LANGUAGE");
      expect(msgDefault).toContain("ngôn ngữ chưa hỗ trợ");
    });

    it("ERR_NO_SOURCE_FILES_FOUND với hint submodule có câu 'Code nằm trong submodule'", () => {
      const msg = defaultMessage("ERR_NO_SOURCE_FILES_FOUND", {
        hint: "submodule",
      });
      expect(msg).toContain("Code nằm trong submodule");
    });

    it("ERR_NO_SOURCE_FILES_FOUND với hint lạ thì giống hệt khi không có hint", () => {
      const baseMsg = defaultMessage("ERR_NO_SOURCE_FILES_FOUND");
      const unknownHintMsg = defaultMessage("ERR_NO_SOURCE_FILES_FOUND", {
        hint: "non_existent_hint",
      });
      expect(unknownHintMsg).toBe(baseMsg);
    });
  });

  describe("createErrorResponse", () => {
    it("đúng status, body { error: { code, message, retryable } }, không có khóa details khi không truyền", async () => {
      const res = createErrorResponse("ERR_ANSWER_TOO_SHORT");
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: "ERR_ANSWER_TOO_SHORT",
          message: defaultMessage("ERR_ANSWER_TOO_SHORT"),
          retryable: false,
        },
      });
      expect("details" in data.error).toBe(false);
    });

    it("chứa khóa details khi có truyền vào", async () => {
      const res = createErrorResponse("ERR_UNSUPPORTED_LANGUAGE", undefined, {
        language: "Swift",
      });
      expect(res.status).toBe(422);

      const data = await res.json();
      expect(data.error.details).toEqual({ language: "Swift" });
      expect(data.error.message).toContain("Swift");
    });
  });

  describe("toErrorResponse", () => {
    beforeEach(() => {
      vi.spyOn(logger, "error").mockImplementation(() => logger);
      vi.spyOn(logger, "warn").mockImplementation(() => logger);
      vi.spyOn(logger, "info").mockImplementation(() => logger);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    it("ApiHttpError giữ code và details", async () => {
      const err = new ApiHttpError(
        "ERR_SELECTION_INVALID",
        "Vùng chọn không đúng",
        { custom: true },
      );
      const res = toErrorResponse(err);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error.code).toBe("ERR_SELECTION_INVALID");
      expect(data.error.message).toBe("Vùng chọn không đúng");
      expect(data.error.details).toEqual({ custom: true });
    });

    it("object { name: 'PostgresError', message: 'x' } => 503 retryable", async () => {
      const res = toErrorResponse({ name: "PostgresError", message: "x" });
      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error.code).toBe("ERR_PERSISTENCE_UNAVAILABLE");
      expect(data.error.retryable).toBe(true);
    });

    it("{ code: 'CONNECTION_CLOSED' } => 503", async () => {
      const res = toErrorResponse({ code: "CONNECTION_CLOSED" });
      expect(res.status).toBe(503);

      const data = await res.json();
      expect(data.error.code).toBe("ERR_PERSISTENCE_UNAVAILABLE");
      expect(data.error.retryable).toBe(true);
    });

    it("new Error('postgres://u:secret@host/db') => 500, text của body không chứa secret, retryable true", async () => {
      const errorWithSecret = new Error("postgres://u:secret@host/db");
      const res = toErrorResponse(errorWithSecret);
      expect(res.status).toBe(500);

      const rawText = await res.text();
      expect(rawText).not.toContain("secret");

      const data = JSON.parse(rawText);
      expect(data.error.code).toBe("ERR_PERSISTENCE_UNAVAILABLE");
      expect(data.error.retryable).toBe(true);
      expect(data.error.message).toBe(
        "Máy chủ gặp lỗi ngoài dự kiến — vui lòng thử lại.",
      );
    });
  });

  describe("log functions", () => {
    beforeEach(() => {
      vi.spyOn(logger, "error").mockImplementation(() => logger);
      vi.spyOn(logger, "warn").mockImplementation(() => logger);
      vi.spyOn(logger, "info").mockImplementation(() => logger);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    it("logApiRequest chọn đúng mức log", () => {
      const errorSpy = vi.spyOn(logger, "error");
      const warnSpy = vi.spyOn(logger, "warn");
      const infoSpy = vi.spyOn(logger, "info");

      logApiRequest({
        req_id: "r1",
        route: "GET /api/me",
        status: 500,
        duration_ms: 10,
        error_code: null,
      });
      expect(errorSpy).toHaveBeenCalled();

      logApiRequest({
        req_id: "r2",
        route: "POST /api/enrich-node",
        status: 503,
        duration_ms: 20,
        error_code: "ERR_AI_UNAVAILABLE",
      });
      expect(warnSpy).toHaveBeenCalled();

      logApiRequest({
        req_id: "r4",
        route: "POST /api/evaluate-feynman",
        status: 503,
        duration_ms: 20,
        error_code: "ERR_PERSISTENCE_UNAVAILABLE",
      });
      expect(errorSpy).toHaveBeenCalled();

      logApiRequest({
        req_id: "r3",
        route: "GET /api/me",
        status: 200,
        duration_ms: 5,
        error_code: null,
      });
      expect(infoSpy).toHaveBeenCalled();
    });

    it("logAiCall ghi mức info", () => {
      const infoSpy = vi.spyOn(logger, "info");
      logAiCall({
        req_id: "ai1",
        call_kind: "ANALYZE",
        backend: "vertex",
        model: "gemini-3.5-flash-lite",
        tokens_in: 100,
        tokens_out: 50,
        cached_tokens: 0,
        retries: 0,
        cost_usd: 0.001,
        ai_cache_hit: false,
        duration_ms: 500,
      });
      expect(infoSpy).toHaveBeenCalled();
    });

    it("logAiCall chấp nhận bản tối giản, không có 4 trường tùy chọn", () => {
      const infoSpy = vi.spyOn(logger, "info");
      logAiCall({
        call_kind: "GRADE",
        backend: "studio",
        model: "gemini-3.5-flash-lite",
        tokens_in: 10,
        tokens_out: 5,
        retries: 1,
        cost_usd: 0.0001,
      });
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({ call_kind: "GRADE", tokens_in: 10, retries: 1 }),
      );
    });

    it("logGuardBlocked ghi mức warn", () => {
      const warnSpy = vi.spyOn(logger, "warn");
      logGuardBlocked({
        event: "guard_blocked",
        call: "questions",
        attempt: 1,
        node_id: "node_1",
        codes: ["Q1"],
        prompt_version: "1.2.0",
        llm_model: "gemini-3.5-flash-lite",
      });
      expect(warnSpy).toHaveBeenCalled();
    });

    it("logUnexpectedError che secret từ biến môi trường và URL", () => {
      vi.stubEnv(
        "DATABASE_URL",
        "postgres://dbuser:supersecretpass@localhost:5432/mydb",
      );
      const errorSpy = vi.spyOn(logger, "error");

      logUnexpectedError(
        new Error(
          "Connection error: postgres://dbuser:supersecretpass@localhost:5432/mydb failed",
        ),
      );

      expect(errorSpy).toHaveBeenCalled();
      const loggedObj = errorSpy.mock.calls[0][0] as {
        event: string;
        error_name: string;
        error_message: string;
      };
      expect(loggedObj.error_message).not.toContain("supersecretpass");
      expect(loggedObj.error_message).toContain("<REDACTED>");
    });
  });
});

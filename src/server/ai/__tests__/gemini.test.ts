import { CONFIG } from "@/contracts/config";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  aiCostUsd,
  assertGeminiEnv,
  callLLMOnce,
  callLLMWithRetry,
  createGeminiClient,
  isAiDisabled,
  modelForKind,
  type LlmRequest,
} from "../gemini";
import { logAiCall } from "@/server/log";
import { addSessionTokens } from "@/server/quota";
import { GoogleGenAI } from "@google/genai";

vi.mock("@/server/db", () => {
  const mockSql = vi.fn();
  return {
    sql: mockSql,
    db: { sql: mockSql, tx: vi.fn() },
  };
});

vi.mock("@/server/log", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
  logAiCall: vi.fn(),
  logApiRequest: vi.fn(),
  logGuardBlocked: vi.fn(),
}));

vi.mock("@/server/quota", () => ({
  checkTokenQuota: vi.fn(),
  assertSessionTokenQuota: vi.fn(),
  addSessionTokens: vi.fn().mockResolvedValue(100),
}));

vi.mock("@google/genai", () => {
  const MockGoogleGenAI = vi.fn().mockImplementation((config) => {
    return {
      _config: config,
      models: {
        generateContent: vi.fn(),
      },
    };
  });
  return {
    GoogleGenAI: MockGoogleGenAI,
    HarmBlockThreshold: {
      BLOCK_ONLY_HIGH: "BLOCK_ONLY_HIGH",
    },
    HarmCategory: {
      HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
      HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
      HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
    },
    Type: {
      STRING: "STRING",
      INTEGER: "INTEGER",
      BOOLEAN: "BOOLEAN",
      ARRAY: "ARRAY",
      OBJECT: "OBJECT",
    },
  };
});

describe("gemini.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("assertGeminiEnv", () => {
    it("ném lỗi nếu GEMINI_BACKEND thiếu hoặc không phải vertex/studio", () => {
      expect(() => assertGeminiEnv({})).toThrow("GEMINI_BACKEND không hợp lệ");
      expect(() => assertGeminiEnv({ GEMINI_BACKEND: "other" })).toThrow(
        "GEMINI_BACKEND không hợp lệ"
      );
    });

    it("vertex thiếu project ⇒ ném lỗi", () => {
      expect(() => assertGeminiEnv({ GEMINI_BACKEND: "vertex" })).toThrow(
        "Thiếu biến môi trường GOOGLE_CLOUD_PROJECT"
      );
      expect(() =>
        assertGeminiEnv({ GEMINI_BACKEND: "vertex", GOOGLE_CLOUD_PROJECT: "  " })
      ).toThrow("Thiếu biến môi trường GOOGLE_CLOUD_PROJECT");
    });

    it("vertex không cần key, có project ⇒ trả về vertex", () => {
      const res = assertGeminiEnv({
        GEMINI_BACKEND: "vertex",
        GOOGLE_CLOUD_PROJECT: "demo-project",
      });
      expect(res).toBe("vertex");
    });

    it("vertex có key, không có project ⇒ trả về vertex (express)", () => {
      const res = assertGeminiEnv({
        GEMINI_BACKEND: "vertex",
        GEMINI_API_KEY: "vertex-key",
      });
      expect(res).toBe("vertex");
    });

    it("studio thiếu key ⇒ ném lỗi", () => {
      expect(() => assertGeminiEnv({ GEMINI_BACKEND: "studio" })).toThrow(
        "Thiếu biến môi trường GEMINI_API_KEY"
      );
      expect(() =>
        assertGeminiEnv({ GEMINI_BACKEND: "studio", GEMINI_API_KEY: "   " })
      ).toThrow("Thiếu biến môi trường GEMINI_API_KEY");
    });

    it("studio có key ⇒ trả về studio", () => {
      const res = assertGeminiEnv({
        GEMINI_BACKEND: "studio",
        GEMINI_API_KEY: "test-secret-key",
      });
      expect(res).toBe("studio");
    });
  });

  describe("isAiDisabled", () => {
    it("chỉ trả true khi AI_DISABLED='true'", () => {
      expect(isAiDisabled({ AI_DISABLED: "true" })).toBe(true);
      expect(isAiDisabled({ AI_DISABLED: "false" })).toBe(false);
      expect(isAiDisabled({ AI_DISABLED: "1" })).toBe(false);
      expect(isAiDisabled({})).toBe(false);
    });
  });

  describe("createGeminiClient", () => {
    it("tạo client vertex đúng tham số", () => {
      createGeminiClient({
        GEMINI_BACKEND: "vertex",
        GOOGLE_CLOUD_PROJECT: "my-gcp-project",
      });
      expect(GoogleGenAI).toHaveBeenCalledWith({
        vertexai: true,
        project: "my-gcp-project",
        location: "global",
      });
    });

    it("vertex có key ⇒ tạo client vertex express bằng apiKey, không truyền project", () => {
      createGeminiClient({
        GEMINI_BACKEND: "vertex",
        GEMINI_API_KEY: " vertex-key ",
        GOOGLE_CLOUD_PROJECT: "my-gcp-project",
      });
      expect(GoogleGenAI).toHaveBeenCalledWith({
        vertexai: true,
        apiKey: "vertex-key",
      });
    });

    it("tạo client studio đúng apiKey", () => {
      createGeminiClient({
        GEMINI_BACKEND: "studio",
        GEMINI_API_KEY: "studio-key",
      });
      expect(GoogleGenAI).toHaveBeenCalledWith({
        apiKey: "studio-key",
      });
    });
  });

  describe("aiCostUsd", () => {
    it("aiCostUsd(1_000_000, 1_000_000, 'gemini-3.8-flash') = 4.5", () => {
      const cost = aiCostUsd(1_000_000, 1_000_000, "gemini-3.8-flash");
      expect(cost).toBe(4.5);
    });

    it("aiCostUsd(1754, 561) với model mặc định tính theo giá 3.8-flash", () => {
      const cost = aiCostUsd(1754, 561);
      expect(cost).toBeCloseTo(0.003419, 6);
    });

    it("aiCostUsd(1754, 561, 'gemini-3.5-flash-lite') ≈ 0.001929", () => {
      const cost = aiCostUsd(1754, 561, "gemini-3.5-flash-lite");
      expect(cost).toBeCloseTo(0.001929, 6);
    });

    it("aiCostUsd với model không có trong bảng giá thì dùng giá mặc định", () => {
      const cost = aiCostUsd(1754, 561, "unknown-model");
      expect(cost).toBeCloseTo(0.001929, 6);
    });
  });

  describe("X-11 AI_DISABLED", () => {
    const dummyReq: LlmRequest<{ test: boolean }> = {
      kind: "ANALYZE",
      system: "system prompt",
      user: "user prompt",
      schema: { type: "OBJECT" } as unknown as import("@google/genai").Schema,
      sessionId: "session-1",
      parse: (j) => j as { test: boolean },
    };

    it("callLLMOnce ném ERR_AI_UNAVAILABLE khi AI_DISABLED='true' và không gọi generateContent", async () => {
      const mockGenerate = vi.fn();
      const mockClient = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      await expect(
        callLLMOnce(dummyReq, mockClient, { AI_DISABLED: "true" })
      ).rejects.toMatchObject({
        code: "ERR_AI_UNAVAILABLE",
      });

      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it("callLLMWithRetry ném ERR_AI_UNAVAILABLE khi AI_DISABLED='true'", async () => {
      const mockGenerate = vi.fn();
      const mockClient = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      await expect(
        callLLMWithRetry(
          dummyReq,
          async () => {},
          mockClient,
          { AI_DISABLED: "true" }
        )
      ).rejects.toMatchObject({
        code: "ERR_AI_UNAVAILABLE",
      });

      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  describe("callLLMOnce", () => {
    const dummyReq: LlmRequest<{ value: number }> = {
      kind: "ANALYZE",
      system: "sys",
      user: "usr",
      schema: { type: "OBJECT" } as unknown as import("@google/genai").Schema,
      sessionId: "sess-1",
      parse: (j: unknown) => {
        if (typeof j === "object" && j !== null && "value" in j) {
          return j as { value: number };
        }
        return null;
      },
    };

    const validEnv = {
      GEMINI_BACKEND: "studio",
      GEMINI_API_KEY: "key",
    };

    it("trả về ok: true khi response hợp lệ", async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        text: '{"value": 42}',
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          thoughtsTokenCount: 10,
        },
        candidates: [{ finishReason: "STOP" }],
      });
      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual({ value: 42 });
      }
      expect(res.tokens_in).toBe(100);
      expect(res.tokens_out).toBe(60);
      expect(res.model).toBe("gemini-3.8-flash");
      expect(res.fell_back).toBe(false);
      expect(addSessionTokens).toHaveBeenCalledWith("sess-1", 100, 60);
    });

    it("luôn gửi thinkingConfig.thinkingBudget = CONFIG.LLM_THINKING_BUDGET (kể cả 0)", async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        text: '{"value": 1}',
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
        candidates: [{ finishReason: "STOP" }],
      });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;
      await callLLMOnce(dummyReq, client, validEnv);
      const arg = mockGenerate.mock.calls[0][0] as { config: { thinkingConfig?: { thinkingBudget: number } } };
      expect(arg.config.thinkingConfig).toEqual({ thinkingBudget: CONFIG.LLM_THINKING_BUDGET });
    });

    it("trả về INVALID_JSON khi finishReason != STOP", async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        text: '{"value": 42}',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        candidates: [{ finishReason: "MAX_TOKENS" }],
      });
      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("INVALID_JSON");
      }
      expect(res.tokens_in).toBe(20);
      expect(res.tokens_out).toBe(40);
      expect(res.model).toBe("gemini-3.5-flash-lite");
      expect(res.fell_back).toBe(true);
    });

    it("trả về INVALID_JSON khi JSON cú pháp hỏng", async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        text: "broken json {",
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        candidates: [{ finishReason: "STOP" }],
      });
      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("INVALID_JSON");
      }
    });

    it("trả về INVALID_JSON khi req.parse trả về null", async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        text: '{"wrongKey": 123}',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        candidates: [{ finishReason: "STOP" }],
      });
      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("INVALID_JSON");
      }
    });

    it("phân loại TRANSIENT khi gặp 429 hoặc 503", async () => {
      const err = new Error("429 Resource has been exhausted");
      (err as unknown as Record<string, unknown>).status = 429;
      (err as unknown as Record<string, unknown>).retryDelay = "15s";
      const mockGenerate = vi.fn().mockRejectedValue(err);
      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("TRANSIENT");
        expect(res.retry_after_ms).toBe(15000);
      }
    });

    it("phân loại FATAL khi gặp 400 hoặc 404", async () => {
      const err = new Error("400 Bad Request");
      (err as unknown as Record<string, unknown>).status = 400;
      const mockGenerate = vi.fn().mockRejectedValue(err);
      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("FATAL");
      }
    });
  });

  describe("X-12 & callLLMWithRetry", () => {
    const dummyReq: LlmRequest<{ ok: boolean }> = {
      kind: "QUESTIONS",
      system: "sys",
      user: "usr",
      schema: { type: "OBJECT" } as unknown as import("@google/genai").Schema,
      sessionId: "s1",
      parse: (j) => j as { ok: boolean },
    };

    const validEnv = {
      GEMINI_BACKEND: "studio",
      GEMINI_API_KEY: "secret",
    };

    it("429 ⇒ gọi lại đúng 1 lần rồi trả lỗi", async () => {
      const err = new Error("429 Quota Exceeded");
      (err as unknown as Record<string, unknown>).status = 429;
      const mockGenerate = vi.fn().mockRejectedValue(err);
      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const res = await callLLMWithRetry(dummyReq, sleepFn, client, validEnv);

      // Attempt 0: 3.8-flash (429) -> flash-lite (429) = 2 calls
      // sleep 1 lần
      // Attempt 1 (NH-15): gọi thẳng flash-lite (429) = 1 call
      // Tổng cộng: 3 calls, lần thử lại không gọi 3.8-flash
      expect(mockGenerate).toHaveBeenCalledTimes(3);
      expect(mockGenerate.mock.calls[2][0].model).toBe("gemini-3.5-flash-lite");
      expect(sleepFn).toHaveBeenCalledTimes(1);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("TRANSIENT");
      }
      expect(logAiCall).toHaveBeenCalledWith(
        expect.objectContaining({
          call_kind: "QUESTIONS",
          retries: 1,
        })
      );
    });

    it("JSON hỏng ⇒ gọi lại 1 lần, lần 2 thành công", async () => {
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce({
          text: "{ invalid json",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          candidates: [{ finishReason: "STOP" }],
        })
        .mockResolvedValueOnce({
          text: "{ invalid json fallback",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          candidates: [{ finishReason: "STOP" }],
        })
        .mockResolvedValueOnce({
          text: '{"ok": true}',
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 10 },
          candidates: [{ finishReason: "STOP" }],
        });

      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const res = await callLLMWithRetry(dummyReq, sleepFn, client, validEnv);

      expect(mockGenerate).toHaveBeenCalledTimes(3);
      expect(sleepFn).toHaveBeenCalledTimes(1);
      expect(res.ok).toBe(true);
      expect(res.tokens_in).toBe(35);
      expect(res.tokens_out).toBe(20);
      expect(logAiCall).toHaveBeenCalledWith(
        expect.objectContaining({
          call_kind: "QUESTIONS",
          retries: 1,
          tokens_in: 35,
          tokens_out: 20,
        })
      );
    });

    it("retry_after_ms > LLM_RETRY_DELAY_MAX_MS (20s) ⇒ không gọi lại", async () => {
      const err = new Error("429 Resource exhausted");
      (err as unknown as Record<string, unknown>).status = 429;
      (err as unknown as Record<string, unknown>).retryDelay = "25s"; // 25000ms > 20000ms
      const mockGenerate = vi.fn().mockRejectedValue(err);
      const client = {
        models: { generateContent: mockGenerate },
      } as unknown as GoogleGenAI;

      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const res = await callLLMWithRetry(dummyReq, sleepFn, client, validEnv);

      // Attempt 0: primary (429) -> fallback (429) = 2 calls
      // retry_after_ms > 20000ms ⇒ break, không gọi lại attempt 1
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(sleepFn).not.toHaveBeenCalled();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.kind).toBe("TRANSIENT");
      }
    });
  });

  describe("TASK_06 Fallback gemini-3.8-flash -> gemini-3.5-flash-lite", () => {
    const dummyReq: LlmRequest<{ value: number }> = {
      kind: "ANALYZE",
      system: "sys",
      user: "usr",
      schema: { type: "OBJECT" } as unknown as import("@google/genai").Schema,
      sessionId: "sess-task-06",
      parse: (j: unknown) => {
        if (typeof j === "object" && j !== null && "value" in j) {
          return j as { value: number };
        }
        return null;
      },
    };

    const validEnv = {
      GEMINI_BACKEND: "studio",
      GEMINI_API_KEY: "key",
    };

    it("model chính ok ⇒ chỉ 1 lần gọi, model = 'gemini-3.8-flash', fell_back = false", async () => {
      const mockGenerate = vi.fn().mockResolvedValue({
        text: '{"value": 42}',
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
        candidates: [{ finishReason: "STOP" }],
      });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);

      expect(res.ok).toBe(true);
      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(mockGenerate.mock.calls[0][0].model).toBe("gemini-3.8-flash");
      expect(mockGenerate.mock.calls[0][0].model).toBe(CONFIG.LLM_MODEL);
      expect(res.model).toBe("gemini-3.8-flash");
      expect(res.fell_back).toBe(false);
      expect(res.tokens_in).toBe(100);
      expect(res.tokens_out).toBe(50);
    });

    it("model chính ném lỗi timeout/AbortError ⇒ gọi tiếp flash-lite, fell_back = true, token cộng cả 2", async () => {
      const timeoutErr = new Error("The operation was aborted due to timeout");
      timeoutErr.name = "TimeoutError";

      const mockGenerate = vi
        .fn()
        .mockRejectedValueOnce(timeoutErr)
        .mockResolvedValueOnce({
          text: '{"value": 99}',
          usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40 },
          candidates: [{ finishReason: "STOP" }],
        });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual({ value: 99 });
      }
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(mockGenerate.mock.calls[0][0].model).toBe("gemini-3.8-flash");
      expect(mockGenerate.mock.calls[1][0].model).toBe("gemini-3.5-flash-lite");
      expect(res.model).toBe("gemini-3.5-flash-lite");
      expect(res.fell_back).toBe(true);
      expect(res.tokens_in).toBe(120);
      expect(res.tokens_out).toBe(40);
      expect(addSessionTokens).toHaveBeenCalledWith("sess-task-06", 120, 40);
    });

    it("model chính 429 ⇒ chuyển flash-lite", async () => {
      const rateLimitErr = new Error("429 Too Many Requests");
      (rateLimitErr as unknown as Record<string, unknown>).status = 429;

      const mockGenerate = vi
        .fn()
        .mockRejectedValueOnce(rateLimitErr)
        .mockResolvedValueOnce({
          text: '{"value": 123}',
          usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 30 },
          candidates: [{ finishReason: "STOP" }],
        });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual({ value: 123 });
      }
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(mockGenerate.mock.calls[0][0].model).toBe("gemini-3.8-flash");
      expect(mockGenerate.mock.calls[1][0].model).toBe("gemini-3.5-flash-lite");
      expect(res.model).toBe("gemini-3.5-flash-lite");
      expect(res.fell_back).toBe(true);
    });

    it("model chính JSON hỏng ⇒ chuyển flash-lite", async () => {
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce({
          text: "{ broken json",
          usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 15 },
          candidates: [{ finishReason: "STOP" }],
        })
        .mockResolvedValueOnce({
          text: '{"value": 456}',
          usageMetadata: { promptTokenCount: 85, candidatesTokenCount: 35 },
          candidates: [{ finishReason: "STOP" }],
        });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual({ value: 456 });
      }
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(mockGenerate.mock.calls[0][0].model).toBe("gemini-3.8-flash");
      expect(mockGenerate.mock.calls[1][0].model).toBe("gemini-3.5-flash-lite");
      expect(res.model).toBe("gemini-3.5-flash-lite");
      expect(res.fell_back).toBe(true);
      expect(res.tokens_in).toBe(70 + 85);
      expect(res.tokens_out).toBe(15 + 35);
      expect(addSessionTokens).toHaveBeenNthCalledWith(1, "sess-task-06", 70, 15);
      expect(addSessionTokens).toHaveBeenNthCalledWith(2, "sess-task-06", 85, 35);
    });

    it("cả 2 lỗi ⇒ trả không ok, đúng 2 lần gọi", async () => {
      const err1 = new Error("503 Service Unavailable");
      (err1 as unknown as Record<string, unknown>).status = 503;
      const err2 = new Error("500 Internal Server Error");
      (err2 as unknown as Record<string, unknown>).status = 500;

      const mockGenerate = vi
        .fn()
        .mockRejectedValueOnce(err1)
        .mockRejectedValueOnce(err2);
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;

      const res = await callLLMOnce(dummyReq, client, validEnv);

      expect(res.ok).toBe(false);
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(res.model).toBe("gemini-3.5-flash-lite");
      expect(res.fell_back).toBe(true);
    });

    it("lần gọi 1 dùng model: CONFIG.LLM_MODEL, lần 2 dùng CONFIG.LLM_MODEL_FALLBACK", async () => {
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce({
          text: "{ invalid json",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
          candidates: [{ finishReason: "STOP" }],
        })
        .mockResolvedValueOnce({
          text: '{"value": 789}',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
          candidates: [{ finishReason: "STOP" }],
        });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;

      await callLLMOnce(dummyReq, client, validEnv);

      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(mockGenerate.mock.calls[0][0].model).toBe(CONFIG.LLM_MODEL);
      expect(mockGenerate.mock.calls[0][0].model).toBe("gemini-3.8-flash");
      expect(mockGenerate.mock.calls[1][0].model).toBe(CONFIG.LLM_MODEL_FALLBACK);
      expect(mockGenerate.mock.calls[1][0].model).toBe("gemini-3.5-flash-lite");
    });

    it("gọi CONFIG.LLM_MODEL với LLM_PRIMARY_TIMEOUT_MS và CONFIG.LLM_MODEL_FALLBACK với LLM_LITE_TIMEOUT_MS (NH-15)", async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce({
          text: "{ invalid json",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
          candidates: [{ finishReason: "STOP" }],
        })
        .mockResolvedValueOnce({
          text: '{"value": 111}',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
          candidates: [{ finishReason: "STOP" }],
        });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;

      await callLLMOnce(dummyReq, client, validEnv);

      expect(timeoutSpy).toHaveBeenNthCalledWith(1, CONFIG.LLM_PRIMARY_TIMEOUT_MS);
      expect(timeoutSpy).toHaveBeenNthCalledWith(2, CONFIG.LLM_LITE_TIMEOUT_MS);
      expect(CONFIG.LLM_LITE_TIMEOUT_MS).toBe(10000);
      timeoutSpy.mockRestore();
    });

    it("NH-14: GRADE và EXPLAIN gọi thẳng flash-lite (10 giây), lỗi thì không gọi fallback cùng model", async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
      for (const kind of ["GRADE", "EXPLAIN"] as const) {
        timeoutSpy.mockClear();
        const mockGenerate = vi.fn().mockResolvedValueOnce({
          text: "{ invalid json",
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
          candidates: [{ finishReason: "STOP" }],
        });
        const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;
        const res = await callLLMOnce({ ...dummyReq, kind }, client, validEnv);
        expect(mockGenerate).toHaveBeenCalledTimes(1);
        expect(mockGenerate.mock.calls[0][0].model).toBe("gemini-3.5-flash-lite");
        expect(timeoutSpy).toHaveBeenNthCalledWith(1, CONFIG.LLM_LITE_TIMEOUT_MS);
        expect(res.ok).toBe(false);
        expect(res.model).toBe("gemini-3.5-flash-lite");
        expect(res.fell_back).toBe(false);
      }
      timeoutSpy.mockRestore();
    });

    it("NH-14: ANALYZE, QUESTIONS, OVERVIEW vẫn gọi 3.8-flash trước; modelForKind đúng bảng", async () => {
      expect(modelForKind("GRADE")).toBe("gemini-3.5-flash-lite");
      expect(modelForKind("EXPLAIN")).toBe("gemini-3.5-flash-lite");
      for (const kind of ["ANALYZE", "QUESTIONS", "OVERVIEW"] as const) {
        expect(modelForKind(kind)).toBe("gemini-3.8-flash");
        const mockGenerate = vi.fn().mockResolvedValueOnce({
          text: '{"value": 1}',
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
          candidates: [{ finishReason: "STOP" }],
        });
        const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;
        const res = await callLLMOnce({ ...dummyReq, kind }, client, validEnv);
        expect(mockGenerate.mock.calls[0][0].model).toBe("gemini-3.8-flash");
        expect(res.model).toBe("gemini-3.8-flash");
      }
    });

    it("NH-15: liteOnly ⇒ gọi thẳng flash-lite 1 lần, không bao giờ gọi 3.8-flash, đánh dấu fell_back", async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: '{"value": 2}',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
        candidates: [{ finishReason: "STOP" }],
      });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;
      const res = await callLLMOnce({ ...dummyReq, kind: "ANALYZE" }, client, validEnv, { liteOnly: true });
      expect(mockGenerate).toHaveBeenCalledTimes(1);
      expect(mockGenerate.mock.calls[0][0].model).toBe("gemini-3.5-flash-lite");
      expect(res.fell_back).toBe(true);
    });

    it("callLLMWithRetry logAiCall ghi model thật đã trả lời, fell_back và cost_usd theo từng model", async () => {
      const mockGenerate = vi
        .fn()
        .mockResolvedValueOnce({
          text: "{ invalid",
          usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 },
          candidates: [{ finishReason: "STOP" }],
        })
        .mockResolvedValueOnce({
          text: '{"value": 333}',
          usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 },
          candidates: [{ finishReason: "STOP" }],
        });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;

      const res = await callLLMWithRetry(dummyReq, undefined, client, validEnv);

      expect(res.ok).toBe(true);
      expect(res.model).toBe("gemini-3.5-flash-lite");
      expect(res.fell_back).toBe(true);
      expect(res.tokens_in).toBe(500);
      expect(res.tokens_out).toBe(250);

      const expectedCost =
        aiCostUsd(200, 100, "gemini-3.8-flash") +
        aiCostUsd(300, 150, "gemini-3.5-flash-lite");

      expect(logAiCall).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-3.5-flash-lite",
          fell_back: true,
          tokens_in: 500,
          tokens_out: 250,
          cost_usd: expectedCost,
        })
      );
    });
  });
});

describe("Khóa AI Studio (GEMINI_BACKEND=studio trong process.env)", () => {
  const req: LlmRequest<{ value: number }> = {
    kind: "ANALYZE",
    system: "sys",
    user: "usr",
    schema: { type: "OBJECT" } as unknown as import("@google/genai").Schema,
    sessionId: "sess-studio",
    parse: (j: unknown) => (typeof j === "object" && j !== null && "value" in j ? (j as { value: number }) : null),
  };

  it("mọi loại lời gọi dùng flash-lite và không gửi thinkingConfig", async () => {
    vi.stubEnv("GEMINI_BACKEND", "studio");
    try {
      for (const kind of ["ANALYZE", "OVERVIEW", "QUESTIONS", "GRADE", "EXPLAIN"] as const) {
        expect(modelForKind(kind)).toBe(CONFIG.LLM_MODEL_FALLBACK);
      }
      const mockGenerate = vi.fn().mockResolvedValue({
        text: '{"value": 1}',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        candidates: [{ finishReason: "STOP" }],
      });
      const client = { models: { generateContent: mockGenerate } } as unknown as GoogleGenAI;
      const res = await callLLMOnce(req, client, { GEMINI_BACKEND: "studio", GEMINI_API_KEY: "key" });
      expect(res.ok).toBe(true);
      expect(mockGenerate).toHaveBeenCalledTimes(1);
      const arg = mockGenerate.mock.calls[0][0] as { model: string; config: { thinkingConfig?: unknown } };
      expect(arg.model).toBe(CONFIG.LLM_MODEL_FALLBACK);
      expect(arg.config.thinkingConfig).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("không đặt studio ⇒ giữ bảng model và vẫn gửi thinkingConfig", () => {
    vi.stubEnv("GEMINI_BACKEND", "vertex");
    try {
      expect(modelForKind("ANALYZE")).toBe(CONFIG.LLM_MODEL_BY_KIND.ANALYZE);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

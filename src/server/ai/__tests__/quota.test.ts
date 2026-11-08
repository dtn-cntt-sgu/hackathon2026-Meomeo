import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  addSessionTokens,
  assertSessionTokenQuota,
  checkTokenQuota,
} from "@/server/quota";
import { sql } from "@/server/db";

vi.mock("@/server/db", () => {
  const mockSql = vi.fn();
  return {
    sql: mockSql,
    db: { sql: mockSql, tx: vi.fn() },
  };
});

describe("quota.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkTokenQuota", () => {
    it("checkTokenQuota(200000) ném lỗi, 199999 không ném", () => {
      expect(() => checkTokenQuota(200000)).toThrow();
      try {
        checkTokenQuota(200000);
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe("ERR_TOKEN_QUOTA_EXCEEDED");
      }

      expect(() => checkTokenQuota(199999)).not.toThrow();
      expect(() => checkTokenQuota(0)).not.toThrow();
      expect(() => checkTokenQuota(200001)).toThrow();
    });
  });

  describe("assertSessionTokenQuota", () => {
    it("ném ERR_SESSION_NOT_FOUND nếu không tìm thấy session", async () => {
      vi.mocked(sql).mockResolvedValueOnce([] as unknown as never);

      await expect(assertSessionTokenQuota("missing-session")).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
    });

    it("ném ERR_TOKEN_QUOTA_EXCEEDED nếu session đã dùng >= 200000 token", async () => {
      vi.mocked(sql).mockResolvedValueOnce([{ tokens_used: 200000 }] as unknown as never);

      await expect(assertSessionTokenQuota("sess-exceeded")).rejects.toMatchObject({
        code: "ERR_TOKEN_QUOTA_EXCEEDED",
      });
    });

    it("trả về tokens_used nếu session còn hạn mức", async () => {
      vi.mocked(sql).mockResolvedValueOnce([{ tokens_used: 50000 }] as unknown as never);

      const used = await assertSessionTokenQuota("sess-valid");
      expect(used).toBe(50000);
    });
  });

  describe("addSessionTokens", () => {
    it("cộng token nguyên tử và trả về số token mới", async () => {
      vi.mocked(sql).mockResolvedValueOnce([{ tokens_used: 5120 }] as unknown as never);

      const res = await addSessionTokens("sess-1", 1000, 20);
      expect(res).toBe(5120);
      expect(sql).toHaveBeenCalled();
    });

    it("ném ERR_SESSION_NOT_FOUND nếu session không tồn tại khi update", async () => {
      vi.mocked(sql).mockResolvedValueOnce([] as unknown as never);

      await expect(addSessionTokens("sess-missing", 100, 50)).rejects.toMatchObject({
        code: "ERR_SESSION_NOT_FOUND",
      });
    });
  });
});

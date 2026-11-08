import { describe, expect, it, vi } from "vitest";
import {
  authenticateRequest,
  extractBearerToken,
  publicOrigin,
  safeNextPath,
  verifyToken,
} from "../auth";

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) => {
          if (token === "valid-token") {
            return {
              data: {
                user: {
                  id: "user-123",
                  email: "user@example.com",
                  user_metadata: { full_name: "Nguyen Van A" },
                },
              },
              error: null,
            };
          }
          if (token === "no-email-token") {
            return {
              data: {
                user: {
                  id: "user-456",
                  email: null,
                  user_metadata: {},
                },
              },
              error: null,
            };
          }
          return {
            data: { user: null },
            error: { message: "Invalid or expired token" },
          };
        }),
      },
    })),
  };
});

describe("auth", () => {
  describe("extractBearerToken", () => {
    it("có token trong header Authorization", () => {
      const req = new Request("http://localhost", {
        headers: { authorization: "Bearer my-secret-token" },
      });
      expect(extractBearerToken(req)).toBe("my-secret-token");
    });

    it("thiếu header Authorization trả về null", () => {
      const req = new Request("http://localhost");
      expect(extractBearerToken(req)).toBeNull();
    });

    it("sai kiểu xác thực (Basic) trả về null", () => {
      const req = new Request("http://localhost", {
        headers: { authorization: "Basic dXNlcjpwYXNz" },
      });
      expect(extractBearerToken(req)).toBeNull();
    });

    it("bearer chữ thường vẫn nhận được token", () => {
      const req = new Request("http://localhost", {
        headers: { authorization: "bearer lower-token-123" },
      });
      expect(extractBearerToken(req)).toBe("lower-token-123");
    });

    it("token rỗng hoặc chỉ khoảng trắng trả về null", () => {
      const req1 = new Request("http://localhost", {
        headers: { authorization: "Bearer " },
      });
      expect(extractBearerToken(req1)).toBeNull();

      const req2 = new Request("http://localhost", {
        headers: { authorization: "Bearer    " },
      });
      expect(extractBearerToken(req2)).toBeNull();
    });
  });

  describe("authenticateRequest & verifyToken", () => {
    it("thiếu token ném lỗi có code === 'ERR_UNAUTHENTICATED'", async () => {
      const req = new Request("http://localhost");
      await expect(authenticateRequest(req)).rejects.toMatchObject({
        name: "ApiHttpError",
        code: "ERR_UNAUTHENTICATED",
      });
    });

    it("token không hợp lệ ném lỗi có code === 'ERR_UNAUTHENTICATED'", async () => {
      const req = new Request("http://localhost", {
        headers: { authorization: "Bearer invalid-token" },
      });
      await expect(authenticateRequest(req)).rejects.toMatchObject({
        name: "ApiHttpError",
        code: "ERR_UNAUTHENTICATED",
      });
    });

    it("token hợp lệ xác thực thành công và trả về AuthenticatedUser", async () => {
      const req = new Request("http://localhost", {
        headers: { authorization: "Bearer valid-token" },
      });
      const user = await authenticateRequest(req);
      expect(user).toEqual({
        id: "user-123",
        email: "user@example.com",
        user_metadata: { full_name: "Nguyen Van A" },
      });
    });

    it("verifyToken xử lý email là null khi người dùng thiếu email", async () => {
      const user = await verifyToken("no-email-token");
      expect(user.id).toBe("user-456");
      expect(user.email).toBeNull();
      expect(user.user_metadata).toEqual({});
    });
  });

  describe("safeNextPath", () => {
    it("/learn giữ nguyên", () => {
      expect(safeNextPath("/learn")).toBe("/learn");
    });

    it("null trở về /", () => {
      expect(safeNextPath(null)).toBe("/");
    });

    it("https://evil.com trở về /", () => {
      expect(safeNextPath("https://evil.com")).toBe("/");
    });

    it("//evil.com trở về /", () => {
      expect(safeNextPath("//evil.com")).toBe("/");
    });

    it("/\\evil.com trở về /", () => {
      expect(safeNextPath("/\\evil.com")).toBe("/");
    });

    it("đường dẫn chứa dấu gạch chéo ngược trở về /", () => {
      expect(safeNextPath("/dashboard\\settings")).toBe("/");
    });

    it("chuỗi rỗng trở về /", () => {
      expect(safeNextPath("")).toBe("/");
    });
  });

  describe("publicOrigin", () => {
    it("có x-forwarded-host và x-forwarded-proto", () => {
      const req = new Request("http://internal-host:8080/path", {
        headers: {
          "x-forwarded-host": "simplifey.app",
          "x-forwarded-proto": "https",
        },
      });
      expect(publicOrigin(req)).toBe("https://simplifey.app");
    });

    it("có nhiều giá trị cách dấu phẩy", () => {
      const req = new Request("http://internal-host:8080/path", {
        headers: {
          "x-forwarded-host": "simplifey.app, internal-lb",
          "x-forwarded-proto": "http, https",
        },
      });
      expect(publicOrigin(req)).toBe("http://simplifey.app");
    });

    it("có x-forwarded-host nhưng thiếu x-forwarded-proto (mặc định https)", () => {
      const req = new Request("http://internal-host:8080/path", {
        headers: {
          "x-forwarded-host": "simplifey.app",
        },
      });
      expect(publicOrigin(req)).toBe("https://simplifey.app");
    });

    it("không có header thì lấy theo request.url", () => {
      const req = new Request("http://localhost:3000/api/me");
      expect(publicOrigin(req)).toBe("http://localhost:3000");
    });
  });
});

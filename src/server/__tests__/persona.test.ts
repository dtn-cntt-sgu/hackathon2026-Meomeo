import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG, SWE_SKILLS } from "@/contracts";
import type { PersonaResponse } from "@/contracts";
import type { AuthenticatedUser } from "@/server/auth";
import { authenticateRequest } from "@/server/auth";
import { ApiHttpError } from "@/server/errors";
import {
  applyPersona,
  isDemoModeEnabled,
  personaSkillStates,
  toPersonaRequest,
} from "../persona";
import { POST as demoPersonaRoute } from "@/app/api/demo/persona/route";

const { executedQueries, mockTx } = vi.hoisted(() => {
  const executedQueries: string[] = [];

  const mockTx = ((...args: unknown[]) => {
    if (Array.isArray(args[0]) && "raw" in args[0]) {
      const strings = args[0] as TemplateStringsArray;
      const text = strings.join("?");
      executedQueries.push(text);
      if (text.includes("select display_name")) {
        return Promise.resolve([{ display_name: "Demo" }]);
      }
      return Promise.resolve([]);
    }
    return { __helper: true, rows: args[0], cols: args.slice(1) };
  });

  return { executedQueries, mockTx };
});

vi.mock("@/server/db", () => ({
  sql: vi.fn(),
  db: {
    sql: vi.fn(),
    tx: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
  },
}));

vi.mock("@/server/auth", () => ({
  authenticateRequest: vi.fn(),
}));

const USER: AuthenticatedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.com",
  user_metadata: { full_name: "Demo User" },
};

describe("persona.ts & /api/demo/persona", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executedQueries.length = 0;
    delete process.env.DEMO_MODE;
    vi.mocked(authenticateRequest).mockResolvedValue(USER);
  });

  describe("isDemoModeEnabled", () => {
    it('{ DEMO_MODE: "true" } ⇒ true; "false", thiếu ⇒ false', () => {
      expect(isDemoModeEnabled({ DEMO_MODE: "true" })).toBe(true);
      expect(isDemoModeEnabled({ DEMO_MODE: "false" })).toBe(false);
      expect(isDemoModeEnabled({})).toBe(false);
      expect(isDemoModeEnabled({ DEMO_MODE: undefined })).toBe(false);
      expect(isDemoModeEnabled({ DEMO_MODE: "1" })).toBe(false);
    });

    it("đọc process.env mặc định", () => {
      expect(isDemoModeEnabled()).toBe(false);
      process.env.DEMO_MODE = "true";
      expect(isDemoModeEnabled()).toBe(true);
    });
  });

  describe("toPersonaRequest", () => {
    it('{ mode: "SENIOR_RUSTY" } hợp lệ', () => {
      expect(toPersonaRequest({ mode: "SENIOR_RUSTY" })).toEqual({
        mode: "SENIOR_RUSTY",
      });
      expect(toPersonaRequest({ mode: "NEWBIE" })).toEqual({
        mode: "NEWBIE",
      });
      expect(toPersonaRequest({ mode: "MID_LEVEL" })).toEqual({
        mode: "MID_LEVEL",
      });
    });

    it('{ mode: "ABC" }, null ném lỗi có code === "ERR_DEMO_MODE_DISABLED"', () => {
      expect(() => toPersonaRequest({ mode: "ABC" })).toThrowError();
      try {
        toPersonaRequest({ mode: "ABC" });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        expect((err as ApiHttpError).code).toBe("ERR_DEMO_MODE_DISABLED");
      }

      expect(() => toPersonaRequest(null)).toThrowError();
      try {
        toPersonaRequest(null);
      } catch (err) {
        expect(err).toBeInstanceOf(ApiHttpError);
        expect((err as ApiHttpError).code).toBe("ERR_DEMO_MODE_DISABLED");
      }

      expect(() => toPersonaRequest({})).toThrowError();
      expect(() => toPersonaRequest("SENIOR_RUSTY")).toThrowError();
    });
  });

  describe('personaSkillStates("SENIOR_RUSTY", now)', () => {
    it("đủ 16 kỹ năng, p_mastery === 0.95, last_practiced_at === now - 30 * CONFIG.MS_PER_DAY, practice_count === 1", () => {
      const now = 1700000000000;
      const states = personaSkillStates("SENIOR_RUSTY", now);

      expect(states).toHaveLength(16);
      expect(states.map((s) => s.skill)).toEqual(SWE_SKILLS);

      for (const s of states) {
        expect(s.p_mastery).toBe(0.95);
        expect(s.last_practiced_at).toBe(now - 30 * CONFIG.MS_PER_DAY);
        expect(s.practice_count).toBe(1);
        expect(s.correct_count).toBe(1);
      }
    });

    it("NEWBIE và MID_LEVEL có điểm và ngày nhàn rỗi đúng cấu hình", () => {
      const now = 1700000000000;
      const newbieStates = personaSkillStates("NEWBIE", now);
      expect(newbieStates).toHaveLength(16);
      expect(newbieStates[0].p_mastery).toBe(0.25);
      expect(newbieStates[0].last_practiced_at).toBe(now);

      const midStates = personaSkillStates("MID_LEVEL", now);
      expect(midStates).toHaveLength(16);
      expect(midStates[0].p_mastery).toBe(0.65);
      expect(midStates[0].last_practiced_at).toBe(now);
    });
  });

  describe("applyPersona", () => {
    it("trả profile.skills đủ 16 kỹ năng và server_now === now; có đúng 1 câu chứa insert into skill_states; KHÔNG có câu nào chứa node_progress, node_runs hay learning_sessions", async () => {
      const now = 1700000000000;
      const res = await applyPersona({ mode: "SENIOR_RUSTY" }, USER, now);

      expect(Object.keys(res.profile.skills)).toHaveLength(16);
      expect(res.server_now).toBe(now);
      expect(res.profile.user_id).toBe(USER.id);
      expect(res.profile.display_name).toBe("Demo");
      expect(res.profile.overall_tier).toBe("NOVICE");

      const insertSkillQueries = executedQueries.filter((q) =>
        q.includes("insert into skill_states"),
      );
      expect(insertSkillQueries).toHaveLength(1);

      for (const q of executedQueries) {
        expect(q).not.toContain("node_progress");
        expect(q).not.toContain("node_runs");
        expect(q).not.toContain("learning_sessions");
      }
    });
  });

  describe("POST /api/demo/persona route", () => {
    function postReq(body: unknown): Request {
      return new Request("http://localhost/api/demo/persona", {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    it("chưa đăng nhập ⇒ 401", async () => {
      vi.mocked(authenticateRequest).mockRejectedValueOnce(
        new ApiHttpError("ERR_UNAUTHENTICATED"),
      );
      const res = await demoPersonaRoute(postReq({ mode: "SENIOR_RUSTY" }));
      expect(res.status).toBe(401);
    });

    it("DEMO_MODE tắt ⇒ 403 ERR_DEMO_MODE_DISABLED", async () => {
      process.env.DEMO_MODE = "false";
      const res = await demoPersonaRoute(postReq({ mode: "SENIOR_RUSTY" }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("ERR_DEMO_MODE_DISABLED");
    });

    it("DEMO_MODE bật, body hợp lệ ⇒ 200", async () => {
      process.env.DEMO_MODE = "true";
      const res = await demoPersonaRoute(postReq({ mode: "SENIOR_RUSTY" }));
      expect(res.status).toBe(200);
      const data = (await res.json()) as PersonaResponse;
      expect(data.profile.user_id).toBe(USER.id);
      expect(Object.keys(data.profile.skills)).toHaveLength(16);
    });

    it("DEMO_MODE bật, body sai ⇒ 403 ERR_DEMO_MODE_DISABLED", async () => {
      process.env.DEMO_MODE = "true";
      const res = await demoPersonaRoute(postReq({ mode: "INVALID" }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("ERR_DEMO_MODE_DISABLED");
    });
  });
});

import { describe, expect, it } from "vitest";
import { CONFIG } from "@/contracts/config";
import type { CognitiveSkillState, SWESkill } from "@/contracts";
import {
  computeSkillChange,
  getDecayedMastery,
  isDecaying,
  outcomeOf,
  overallTier,
  tierOf,
  updateSkill,
} from "../bkt-engine";

const T0 = 1_774_000_000_000;
const DAY = CONFIG.MS_PER_DAY;

describe("bkt-engine", () => {
  describe("T-BKT — Cập nhật 1 bước", () => {
    const table = [
      { id: "1", p: 0.25, pf: 0.5767, pah: 0.4202, f: 0.0791 },
      { id: "2", p: 0.5767, pf: 0.8413, pah: 0.7292, f: 0.2036 },
      { id: "3", p: 0.8413, pf: 0.9532, pah: 0.9109, f: 0.4752 },
      { id: "4", p: 0.9, pf: 0.9718, pah: 0.9454, f: 0.6025 },
      { id: "5", p: 0.0791, pf: 0.2936, pah: 0.2008, f: 0.0432 },
      { id: "6", p: 0.4092, pf: 0.7324, pah: 0.5854, f: 0.1268 },
      { id: "7", p: 0.99, pf: 0.99, pah: 0.99, f: 0.9424 },
      { id: "8", p: 0.01, pf: 0.1116, pah: 0.0961, f: 0.0316 },
    ];

    for (const row of table) {
      it(`BKT-10 #${row.id} p=${row.p} PASS_FIRST`, () => {
        const state: CognitiveSkillState = {
          skill: "HTTP_ROUTING",
          p_mastery: row.p,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        };
        const next = updateSkill("HTTP_ROUTING", state, "PASS_FIRST", T0);
        expect(next.p_mastery).toBeCloseTo(row.pf, 4);
      });

      it(`BKT-10 #${row.id} p=${row.p} PASS_AFTER_HINT`, () => {
        const state: CognitiveSkillState = {
          skill: "HTTP_ROUTING",
          p_mastery: row.p,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        };
        const next = updateSkill("HTTP_ROUTING", state, "PASS_AFTER_HINT", T0);
        expect(next.p_mastery).toBeCloseTo(row.pah, 4);
      });

      it(`BKT-10 #${row.id} p=${row.p} FAILED`, () => {
        const state: CognitiveSkillState = {
          skill: "HTTP_ROUTING",
          p_mastery: row.p,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        };
        const next = updateSkill("HTTP_ROUTING", state, "FAILED", T0);
        expect(next.p_mastery).toBeCloseTo(row.f, 4);
      });
    }
  });

  describe("T-CHAIN — Chuỗi từ 0.25", () => {
    it("BKT-11 chuỗi PASS_FIRST đủ 5 lần", () => {
      let state: CognitiveSkillState | undefined = undefined;
      const expected = [0.5767, 0.8413, 0.9532, 0.9873, 0.99];
      for (let i = 0; i < expected.length; i++) {
        state = updateSkill("HTTP_ROUTING", state, "PASS_FIRST", T0);
        expect(state.p_mastery).toBeCloseTo(expected[i], 4);
      }
    });

    it("BKT-11 chuỗi PASS_AFTER_HINT đủ 5 lần", () => {
      let state: CognitiveSkillState | undefined = undefined;
      const expected = [0.4202, 0.5957, 0.7439, 0.8495, 0.9159];
      for (let i = 0; i < expected.length; i++) {
        state = updateSkill("HTTP_ROUTING", state, "PASS_AFTER_HINT", T0);
        expect(state.p_mastery).toBeCloseTo(expected[i], 4);
      }
    });

    it("BKT-11 chuỗi FAILED đủ 5 lần", () => {
      let state: CognitiveSkillState | undefined = undefined;
      const expected = [0.0791, 0.0432, 0.0369, 0.0359, 0.0357];
      for (let i = 0; i < expected.length; i++) {
        state = updateSkill("HTTP_ROUTING", state, "FAILED", T0);
        expect(state.p_mastery).toBeCloseTo(expected[i], 4);
      }
    });
  });

  describe("T-UPD — updateSkill / computeSkillChange", () => {
    it("BKT-12 #1 updateSkill DB_OPTIMIZATION undefined PASS_AFTER_HINT", () => {
      const next = updateSkill("DB_OPTIMIZATION", undefined, "PASS_AFTER_HINT", T0);
      expect(next.p_mastery).toBeCloseTo(0.4202, 4);
      expect(next.last_practiced_at).toBe(T0);
      expect(next.practice_count).toBe(1);
      expect(next.correct_count).toBe(1);
    });

    it("BKT-12 #2 updateSkill AUTH_SECURITY undefined FAILED", () => {
      const next = updateSkill("AUTH_SECURITY", undefined, "FAILED", T0);
      expect(next.p_mastery).toBeCloseTo(0.0791, 4);
      expect(next.last_practiced_at).toBe(T0);
      expect(next.practice_count).toBe(1);
      expect(next.correct_count).toBe(0);
    });

    it("BKT-12 #3 state 0.9532 PASS_FIRST @30d", () => {
      const state: CognitiveSkillState = {
        skill: "AUTH_SECURITY",
        p_mastery: 0.9532,
        last_practiced_at: T0,
        practice_count: 3,
        correct_count: 3,
      };
      const now = T0 + 30 * DAY;
      const next = updateSkill("AUTH_SECURITY", state, "PASS_FIRST", now);
      expect(next.p_mastery).toBeCloseTo(0.7324, 4);
      expect(next.last_practiced_at).toBe(now);
      expect(next.practice_count).toBe(4);
      expect(next.correct_count).toBe(4);
    });

    it("BKT-12 #4 state 0.25 @T0+5d, now=T0 (đồng hồ lệch)", () => {
      const state: CognitiveSkillState = {
        skill: "AUTH_SECURITY",
        p_mastery: 0.25,
        last_practiced_at: T0 + 5 * DAY,
        practice_count: 1,
        correct_count: 1,
      };
      const next = updateSkill("AUTH_SECURITY", state, "PASS_FIRST", T0);
      expect(next.p_mastery).toBeCloseTo(0.5767, 4);
      expect(next.last_practiced_at).toBe(T0 + 5 * DAY);
      expect(next.practice_count).toBe(2);
      expect(next.correct_count).toBe(2);
    });

    it("BKT-12 #5 computeSkillChange AUTH_SECURITY undefined FAILED", () => {
      const { next, change } = computeSkillChange("AUTH_SECURITY", undefined, "FAILED", T0);
      expect(change.skill).toBe("AUTH_SECURITY");
      expect(change.p_before).toBeCloseTo(0.25, 4);
      expect(change.p_after).toBeCloseTo(0.0791, 4);
      expect(change.outcome).toBe("FAILED");
      expect(next.p_mastery).toBeCloseTo(0.0791, 4);
    });

    it("BKT-12 #6 computeSkillChange state 0.9532 FAILED @30d", () => {
      const state: CognitiveSkillState = {
        skill: "AUTH_SECURITY",
        p_mastery: 0.9532,
        last_practiced_at: T0,
        practice_count: 3,
        correct_count: 3,
      };
      const now = T0 + 30 * DAY;
      const { next, change } = computeSkillChange("AUTH_SECURITY", state, "FAILED", now);
      expect(change.p_before).toBeCloseTo(0.4092, 4);
      expect(change.p_after).toBeCloseTo(0.1268, 4);
      expect(change.outcome).toBe("FAILED");
      expect(next.p_mastery).toBeCloseTo(0.1268, 4);
      expect(next.last_practiced_at).toBe(now);
      expect(next.practice_count).toBe(4);
      expect(next.correct_count).toBe(3);
    });
  });

  describe("T-DEC — getDecayedMastery", () => {
    const decCases = [
      { id: "1", p: 0.5767, deltaDays: 9, expected: 0.4592 },
      { id: "2", p: 0.5767, deltaDays: 10, expected: 0.4491 },
      { id: "3", p: 0.9532, deltaDays: 25, expected: 0.454 },
      { id: "4", p: 0.9532, deltaDays: 26, expected: 0.4441 },
      { id: "5", p: 0.9532, deltaDays: 30, expected: 0.4092 },
      { id: "6", p: 0.95, deltaDays: 30, expected: 0.4085 },
      { id: "7", p: 0.8413, deltaDays: 7, expected: 0.6681 },
      { id: "8", p: 0.4202, deltaDays: 10, expected: 0.3537 },
      { id: "9", p: 0.0791, deltaDays: 30, expected: 0.0791 },
      { id: "10", p: 0.25, deltaDays: 100, expected: 0.25 },
    ];

    for (const c of decCases) {
      it(`BKT-20 #${c.id} p=${c.p} deltaDays=${c.deltaDays}`, () => {
        const state: CognitiveSkillState = {
          skill: "HTTP_ROUTING",
          p_mastery: c.p,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        };
        const res = getDecayedMastery(state, T0 + c.deltaDays * DAY);
        expect(res).toBeCloseTo(c.expected, 4);
      });
    }

    it("BKT-20 #11 state thiếu => 0.2500", () => {
      expect(getDecayedMastery(undefined, T0 + 100 * DAY)).toBe(CONFIG.BKT_P_L0);
    });

    it("BKT-20 #12 now < last_practiced_at => giữ p_mastery", () => {
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: 0.9532,
        last_practiced_at: T0 + 5 * DAY,
        practice_count: 1,
        correct_count: 1,
      };
      expect(getDecayedMastery(state, T0)).toBeCloseTo(0.9532, 4);
    });
  });

  describe("T-TIER — tierOf / overallTier", () => {
    it("BKT-22 tierOf các mốc", () => {
      expect(tierOf(0.01)).toBe("NOVICE");
      expect(tierOf(0.4499)).toBe("NOVICE");
      expect(tierOf(0.45)).toBe("PRACTITIONER");
      expect(tierOf(0.7499)).toBe("PRACTITIONER");
      expect(tierOf(0.75)).toBe("ARCHITECT");
      expect(tierOf(0.92)).toBe("ARCHITECT");
      expect(tierOf(0.99)).toBe("ARCHITECT");
    });

    it("BKT-23 overallTier khi rỗng hoặc practice_count = 0", () => {
      expect(overallTier({}, T0)).toBe("NOVICE");
      expect(
        overallTier(
          {
            AUTH_SECURITY: {
              skill: "AUTH_SECURITY",
              p_mastery: 0.25,
              last_practiced_at: T0,
              practice_count: 0,
              correct_count: 0,
            },
          },
          T0
        )
      ).toBe("NOVICE");
    });

    it("BKT-23 overallTier trung bình các kỹ năng có practice_count > 0", () => {
      const skills: Partial<Record<SWESkill, CognitiveSkillState>> = {
        DB_OPTIMIZATION: {
          skill: "DB_OPTIMIZATION",
          p_mastery: 0.4202,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
        LAYERED_SEPARATION: {
          skill: "LAYERED_SEPARATION",
          p_mastery: 0.5767,
          last_practiced_at: T0,
          practice_count: 1,
          correct_count: 1,
        },
      };
      // trung bình ≈ (0.4202 + 0.5767) / 2 = 0.49845 => PRACTITIONER
      expect(overallTier(skills, T0)).toBe("PRACTITIONER");
    });
  });

  describe("T-MM — isDecaying", () => {
    it("BKT-24 #1 0.5767 @0 => false", () => {
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: 0.5767,
        last_practiced_at: T0,
        practice_count: 1,
        correct_count: 1,
      };
      expect(isDecaying(state, T0)).toBe(false);
    });

    it("BKT-24 #2 0.5767 @9 => false", () => {
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: 0.5767,
        last_practiced_at: T0,
        practice_count: 1,
        correct_count: 1,
      };
      expect(isDecaying(state, T0 + 9 * DAY)).toBe(false);
    });

    it("BKT-24 #3 0.5767 @10 => true", () => {
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: 0.5767,
        last_practiced_at: T0,
        practice_count: 1,
        correct_count: 1,
      };
      expect(isDecaying(state, T0 + 10 * DAY)).toBe(true);
    });

    it("BKT-24 #4 0.8413 @7 => true", () => {
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: 0.8413,
        last_practiced_at: T0,
        practice_count: 1,
        correct_count: 1,
      };
      expect(isDecaying(state, T0 + 7 * DAY)).toBe(true);
    });

    it("BKT-24 #5 0.0791 @30 => false (≤ sàn)", () => {
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: 0.0791,
        last_practiced_at: T0,
        practice_count: 1,
        correct_count: 1,
      };
      expect(isDecaying(state, T0 + 30 * DAY)).toBe(false);
    });

    it("BKT-24 #6 state thiếu => false", () => {
      expect(isDecaying(undefined, T0)).toBe(false);
    });
  });

  describe("T-OUT — outcomeOf", () => {
    it("BKT-60 outcomeOf", () => {
      expect(outcomeOf(true, 1)).toBe("PASS_FIRST");
      expect(outcomeOf(true, 2)).toBe("PASS_AFTER_HINT");
      expect(outcomeOf(true, 3)).toBe("PASS_AFTER_HINT");
      expect(outcomeOf(false, 3)).toBe("FAILED");
      expect(outcomeOf(false, 1)).toBe("FAILED");
    });
  });

  describe("T-PER — persona demo", () => {
    it("BKT-PER NEWBIE", () => {
      const p = 0.25;
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: p,
        last_practiced_at: T0,
        practice_count: 1,
        correct_count: 1,
      };
      expect(getDecayedMastery(state, T0)).toBeCloseTo(0.25, 4);
      expect(tierOf(0.25)).toBe("NOVICE");
      expect(isDecaying(state, T0)).toBe(false);
      expect(updateSkill("HTTP_ROUTING", state, "PASS_FIRST", T0).p_mastery).toBeCloseTo(0.5767, 4);
      expect(updateSkill("HTTP_ROUTING", state, "PASS_AFTER_HINT", T0).p_mastery).toBeCloseTo(0.4202, 4);
      expect(updateSkill("HTTP_ROUTING", state, "FAILED", T0).p_mastery).toBeCloseTo(0.0791, 4);
      expect(overallTier({ HTTP_ROUTING: state }, T0)).toBe("NOVICE");
    });

    it("BKT-PER MID_LEVEL", () => {
      const p = 0.65;
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: p,
        last_practiced_at: T0,
        practice_count: 1,
        correct_count: 1,
      };
      expect(getDecayedMastery(state, T0)).toBeCloseTo(0.65, 4);
      expect(tierOf(0.65)).toBe("PRACTITIONER");
      expect(isDecaying(state, T0)).toBe(false);
      expect(updateSkill("HTTP_ROUTING", state, "PASS_FIRST", T0).p_mastery).toBeCloseTo(0.8779, 4);
      expect(updateSkill("HTTP_ROUTING", state, "PASS_AFTER_HINT", T0).p_mastery).toBeCloseTo(0.7845, 4);
      expect(updateSkill("HTTP_ROUTING", state, "FAILED", T0).p_mastery).toBeCloseTo(0.2522, 4);
      expect(overallTier({ HTTP_ROUTING: state }, T0)).toBe("PRACTITIONER");
    });

    it("BKT-PER SENIOR_RUSTY", () => {
      const p = 0.95;
      const now = T0 + 30 * DAY;
      const state: CognitiveSkillState = {
        skill: "HTTP_ROUTING",
        p_mastery: p,
        last_practiced_at: T0,
        practice_count: 1,
        correct_count: 1,
      };
      expect(getDecayedMastery(state, now)).toBeCloseTo(0.4085, 4);
      expect(tierOf(getDecayedMastery(state, now))).toBe("NOVICE");
      expect(isDecaying(state, now)).toBe(true);
      expect(updateSkill("HTTP_ROUTING", state, "PASS_FIRST", now).p_mastery).toBeCloseTo(0.7319, 4);
      expect(updateSkill("HTTP_ROUTING", state, "PASS_AFTER_HINT", now).p_mastery).toBeCloseTo(0.5847, 4);
      expect(updateSkill("HTTP_ROUTING", state, "FAILED", now).p_mastery).toBeCloseTo(0.1265, 4);
      expect(overallTier({ HTTP_ROUTING: state }, now)).toBe("NOVICE");
    });
  });

  describe("Kịch bản A, B khớp số", () => {
    it("BKT-KICHO-A-B khớp 0.4202, 0.5767, 0.0791", () => {
      // 0.25 -> 0.4202 (PASS_AFTER_HINT)
      const r1 = updateSkill("DB_OPTIMIZATION", undefined, "PASS_AFTER_HINT", T0);
      expect(r1.p_mastery).toBeCloseTo(0.4202, 4);

      // 0.25 -> 0.5767 (PASS_FIRST)
      const r2 = updateSkill("LAYERED_SEPARATION", undefined, "PASS_FIRST", T0);
      expect(r2.p_mastery).toBeCloseTo(0.5767, 4);

      // 0.25 -> 0.0791 (FAILED)
      const r3 = updateSkill("AUTH_SECURITY", undefined, "FAILED", T0);
      expect(r3.p_mastery).toBeCloseTo(0.0791, 4);
    });
  });
});

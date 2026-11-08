import { describe, expect, it } from "vitest";
import { levenshtein, similarity, validateAnswerLength } from "../similarity";

describe("similarity", () => {
  describe("validateAnswerLength (GUARD-16)", () => {
    it("GUARD-16 '  abc  def  ' (6 ký tự) => null", () => {
      expect(validateAnswerLength("  abc  def  ")).toBeNull();
    });

    it("GUARD-16 'ab c d' (4 ký tự) => ERR_ANSWER_TOO_SHORT", () => {
      expect(validateAnswerLength("ab c d")).toBe("ERR_ANSWER_TOO_SHORT");
    });

    it("GUARD-16 Chuỗi 2000 ký tự => null", () => {
      const a2000 = "a".repeat(2000);
      expect(validateAnswerLength(a2000)).toBeNull();
    });

    it("GUARD-16 Chuỗi 2001 ký tự => ERR_ANSWER_TOO_LONG", () => {
      const a2001 = "a".repeat(2001);
      expect(validateAnswerLength(a2001)).toBe("ERR_ANSWER_TOO_LONG");
    });
  });

  describe("levenshtein", () => {
    it("GUARD-16 levenshtein giữa các mảng ký tự", () => {
      expect(levenshtein([], [])).toBe(0);
      expect(levenshtein(["a", "b", "c"], ["a", "b", "c"])).toBe(0);
      expect(levenshtein(["a", "b"], ["a", "c"])).toBe(1);
      expect(levenshtein(["a"], ["a", "b"])).toBe(1);
      expect(levenshtein([], ["a", "b"])).toBe(2);
    });
  });

  describe("similarity", () => {
    it("GUARD-16 similarity('200 truy vấn', ' 200  Truy vấn ') = 1", () => {
      expect(similarity("200 truy vấn", " 200  Truy vấn ")).toBe(1);
    });

    it("GUARD-16 similarity hai câu khác biệt < 0.8", () => {
      const sim = similarity(
        "200 truy vấn, vì có 200 sản phẩm.",
        "201: findAll 1 lần rồi findById 200 lần"
      );
      expect(sim).toBeLessThan(0.8);
    });

    it("GUARD-16 hai chuỗi rỗng => 1", () => {
      expect(similarity("", "   ")).toBe(1);
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  BAD_WORDS,
  hasInappropriateWords,
  maskSensitive,
  wordRe,
} from "../moderation";

describe("moderation", () => {
  describe("BAD_WORDS", () => {
    it("MOD-01 BAD_WORDS không chứa từ kỹ thuật và không chứa từ không dấu mơ hồ", () => {
      const technicalWords = ["kill", "attack", "hack", "abort", "kill -9"];
      for (const tech of technicalWords) {
        expect(BAD_WORDS).not.toContain(tech);
      }
    });
  });

  describe("wordRe", () => {
    it("MOD-02 wordRe bắt đúng trọn từ", () => {
      const re = wordRe("đĩ");
      expect(re.test("con đĩ")).toBe(true);
      expect(wordRe("đĩ").test("đĩa cứng")).toBe(false);
    });
  });

  describe("hasInappropriateWords", () => {
    it("MOD-03 dạng NFD của 'đéo' bị bắt", () => {
      const nfdDeo = "đéo".normalize("NFD");
      expect(hasInappropriateWords(nfdDeo)).toBe(true);
    });

    it("MOD-04 từ kỹ thuật và từ tiếng Việt bình thường KHÔNG bị bắt", () => {
      expect(hasInappropriateWords("kill the process")).toBe(false);
      expect(hasInappropriateWords("hack")).toBe(false);
      expect(hasInappropriateWords("attack")).toBe(false);
      expect(hasInappropriateWords("đĩa cứng")).toBe(false);
      expect(hasInappropriateWords("lồng ghép")).toBe(false);
      expect(hasInappropriateWords("buổi học")).toBe(false);
    });

    it("MOD-05 từ xấu trong danh sách bị bắt", () => {
      expect(hasInappropriateWords("nói đéo gì đấy")).toBe(true);
      expect(hasInappropriateWords("địt")).toBe(true);
      expect(hasInappropriateWords("đụ má")).toBe(true);
      expect(hasInappropriateWords("fuck this")).toBe(true);
      expect(hasInappropriateWords("motherfucker")).toBe(true);
      expect(hasInappropriateWords("đồ óc chó")).toBe(true);
    });
  });

  describe("maskSensitive", () => {
    it("MOD-06 Che email", () => {
      const input = "Liên hệ qua test.user+tag@gmail.com hoặc support@simplifey.io";
      const masked = maskSensitive(input);
      expect(masked).toBe("Liên hệ qua *** hoặc ***");
      expect(masked).not.toContain("test.user+tag@gmail.com");
      expect(masked).not.toContain("support@simplifey.io");
    });

    it("MOD-07 Che số điện thoại VN", () => {
      expect(maskSensitive("Gọi số 0912 345 678 nhé")).toBe("Gọi số *** nhé");
      expect(maskSensitive("Gọi +84912345678")).toBe("Gọi ***");
      expect(maskSensitive("SĐT: 0912.345.678")).toBe("SĐT: ***");
      expect(maskSensitive("SĐT: 0912-345-678")).toBe("SĐT: ***");
      expect(maskSensitive("SĐT: 84912345678")).toBe("SĐT: ***");
    });

    it("MOD-08 Che CCCD 12 số (trước SĐT)", () => {
      const input = "CCCD của tôi là 012345678901 và SĐT là 0912345678";
      const masked = maskSensitive(input);
      expect(masked).toBe("CCCD của tôi là *** và SĐT là ***");
    });

    it("MOD-09 Che từ xấu", () => {
      const input = "Thằng này đéo biết gì, đồ óc chó";
      const masked = maskSensitive(input);
      expect(masked).toBe("Thằng này *** biết gì, đồ ***");
    });

    it("MOD-10 Giữ đúng số dòng của văn bản nhiều dòng", () => {
      const multiLine = "Dòng 1: hello\nDòng 2: liên hệ 0912 345 678\nDòng 3: test@email.com\nDòng 4: kết thúc";
      const masked = maskSensitive(multiLine);
      expect(masked.split("\n")).toHaveLength(4);
      expect(masked.split("\n")[1]).toBe("Dòng 2: liên hệ ***");
      expect(masked.split("\n")[2]).toBe("Dòng 3: ***");
    });
  });
});

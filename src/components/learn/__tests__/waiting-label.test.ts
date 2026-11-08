import { describe, expect, it } from "vitest";
import { PREPARE_QUESTIONS_HINT, waitingLabel } from "@/components/learn/waiting-label";

describe("waitingLabel", () => {
  it("0–3 giây ⇒ đang đọc câu trả lời", () => {
    expect(waitingLabel(0)).toBe("Đang đọc câu trả lời…");
    expect(waitingLabel(2999)).toBe("Đang đọc câu trả lời…");
  });

  it("3–6 giây ⇒ đang so với ý bắt buộc (mốc 3000 tính vào đoạn sau)", () => {
    expect(waitingLabel(3000)).toBe("Đang so với ý bắt buộc…");
    expect(waitingLabel(5999)).toBe("Đang so với ý bắt buộc…");
  });

  it("từ 6 giây ⇒ đang soạn gợi ý, giữ nguyên tới khi hết chờ", () => {
    expect(waitingLabel(6000)).toBe("Đang soạn gợi ý…");
    expect(waitingLabel(60_000)).toBe("Đang soạn gợi ý…");
  });

  it("giá trị lạ (âm, NaN) ⇒ về chữ đầu, không rỗng", () => {
    expect(waitingLabel(-500)).toBe("Đang đọc câu trả lời…");
    expect(waitingLabel(Number.NaN)).toBe("Đang đọc câu trả lời…");
  });

  it("dòng nhắc chờ câu hỏi đúng chữ chốt", () => {
    expect(PREPARE_QUESTIONS_HINT).toBe("Thường mất khoảng 10 giây");
  });
});

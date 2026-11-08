import { describe, expect, it } from "vitest";
import { REASON_MARKER, REASON_TOO_LONG } from "@/components/code/slice-model";
import { CONFIG } from "@/contracts/config";
import { ERROR_MESSAGES } from "@/lib/messages";
import { explainButtonState, explainErrorText, explanationKey, shortSelection } from "../selection-explain";

const RANGE = { line_start: 12, col_start: 3, line_end: 14, col_end: 9 };

describe("explanationKey", () => {
  it("đúng dạng {node}:{step}:{ls}:{cs}-{le}:{ce}", () => {
    expect(explanationKey("slice-register", 2, RANGE)).toBe("slice-register:2:12:3-14:9");
  });

  it("hai vùng khác nhau cho hai khóa khác nhau", () => {
    expect(explanationKey("a", 1, RANGE)).not.toBe(explanationKey("a", 1, { ...RANGE, col_end: 10 }));
    expect(explanationKey("a", 1, RANGE)).not.toBe(explanationKey("a", 2, RANGE));
  });
});

describe("explainButtonState", () => {
  const ok = { selected_text: "const x = 1;", invalid_reason: null };

  it("hợp lệ ⇒ hiện và bấm được", () => {
    expect(explainButtonState(ok, false)).toEqual({ visible: true, disabled: false, tooltip: null });
  });

  it("Offline ⇒ ẩn", () => {
    expect(explainButtonState(ok, true).visible).toBe(false);
  });

  it("chưa chọn hoặc chỉ có khoảng trắng ⇒ ẩn", () => {
    expect(explainButtonState(null, false).visible).toBe(false);
    expect(explainButtonState({ selected_text: "  \n ", invalid_reason: null }, false).visible).toBe(false);
  });

  it("vùng chạm dòng đánh dấu ⇒ HIỆN nhưng tắt kèm lý do (ghi chú 4)", () => {
    expect(explainButtonState({ selected_text: "x", invalid_reason: REASON_MARKER }, false)).toEqual({
      visible: true,
      disabled: true,
      tooltip: REASON_MARKER,
    });
  });

  it("dài hơn EXPLAIN_SELECTION_MAX_CHARS ⇒ hiện, tắt, tooltip 'Chọn đoạn ngắn hơn'", () => {
    const long = { selected_text: "a".repeat(CONFIG.EXPLAIN_SELECTION_MAX_CHARS + 1), invalid_reason: null };
    expect(explainButtonState(long, false)).toEqual({ visible: true, disabled: true, tooltip: REASON_TOO_LONG });
    expect(REASON_TOO_LONG).toContain("chọn vài dòng");
  });

  it("đúng bằng trần ký tự vẫn dùng được", () => {
    const edge = { selected_text: "a".repeat(CONFIG.EXPLAIN_SELECTION_MAX_CHARS), invalid_reason: null };
    expect(explainButtonState(edge, false).disabled).toBe(false);
  });
});

describe("shortSelection", () => {
  it("giữ nguyên đoạn ngắn, gộp khoảng trắng và xuống dòng", () => {
    expect(shortSelection("  const a =\n   1;  ")).toBe("const a = 1;");
  });

  it("đoạn dài bị rút gọn bằng …", () => {
    const out = shortSelection("x".repeat(200));
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(48);
  });
});

describe("explainErrorText", () => {
  it("ERR_AI_UNAVAILABLE và không mã dùng câu riêng của lời gọi giải thích", () => {
    const text = "AI đang bận — chưa giải thích được đoạn này.";
    expect(explainErrorText("ERR_AI_UNAVAILABLE")).toBe(text);
    expect(explainErrorText()).toBe(text);
  });

  it("các mã khác lấy từ bảng thông điệp Mục 10", () => {
    expect(explainErrorText("ERR_EXPLAIN_LIMIT")).toBe(ERROR_MESSAGES.ERR_EXPLAIN_LIMIT);
    expect(explainErrorText("ERR_SELECTION_INVALID")).toBe(ERROR_MESSAGES.ERR_SELECTION_INVALID);
  });
});

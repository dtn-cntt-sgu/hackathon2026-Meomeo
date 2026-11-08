import { describe, expect, it } from "vitest";
import { ERROR_MESSAGES, FALLBACK_ERROR_MESSAGE, formatErrorMessage } from "../messages";

describe("messages", () => {
  it("mọi mã lỗi đều có thông điệp không rỗng", () => {
    for (const [code, text] of Object.entries(ERROR_MESSAGES)) {
      expect(text.trim(), code).not.toBe("");
    }
  });

  it("ưu tiên message server trả, thiếu thì tra bảng", () => {
    expect(formatErrorMessage("ERR_SERVER_BUSY", "Bận quá")).toBe("Bận quá");
    expect(formatErrorMessage("ERR_SERVER_BUSY")).toBe(ERROR_MESSAGES.ERR_SERVER_BUSY);
    expect(formatErrorMessage()).toBe(FALLBACK_ERROR_MESSAGE);
  });

  it("ghép ngôn ngữ và gợi ý từ details khi client tự dựng", () => {
    expect(formatErrorMessage("ERR_UNSUPPORTED_LANGUAGE", "", { language: "Rust" })).toContain("Rust");
    expect(formatErrorMessage("ERR_NO_SOURCE_FILES_FOUND", "", { hint: "no_code" })).toContain("không có file code");
  });
});

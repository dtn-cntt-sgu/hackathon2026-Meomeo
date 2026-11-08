// Chạy một lần khi server Next.js khởi động (D-66, Mục 16 kiến trúc triển khai).
// Chỉ chạy ở runtime nodejs: bản edge không có node:fs nên không được kéo parser vào.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertGeminiEnv } = await import("@/server/ai/gemini");
    // Thiếu biến AI thì ném lỗi ngay để revision không khởi động (D-66).
    assertGeminiEnv();

    const { logger } = await import("@/server/log");
    try {
      const { initParsers } = await import("@/server/engine/graph/parser");
      await initParsers();
    } catch (error) {
      // Lỗi nạp grammar không được làm sập server: chỉ cảnh báo.
      logger.warn({
        event: "grammar_init_failed",
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

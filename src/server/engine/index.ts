import type { IngestSource, StaticEngineResult } from "@/contracts";
import { ApiHttpError } from "@/server/errors";
import { buildGraph } from "./graph";
import { runIngest } from "./ingest";

export { toClientResult } from "./graph";

function hasExplicitSubdir(src: IngestSource): boolean {
  return src.kind === "GITHUB_COMMIT" || (src.subdir_override ?? "").trim() !== "";
}

export async function runEngine(
  src: IngestSource,
  signal?: AbortSignal,
): Promise<StaticEngineResult> {
  const ingested = await runIngest(src, signal);
  signal?.throwIfAborted();
  try {
    return await buildGraph(ingested);
  } catch (error) {
    // ING-80 đường lùi: thư mục backend tự chọn không có route ⇒ phân tích cả repo.
    const autoPicked = ingested.snapshot.subdir !== "" && !hasExplicitSubdir(src);
    if (!autoPicked || !(error instanceof ApiHttpError) || error.code !== "ERR_NO_ARCHITECTURAL_SLICE") {
      throw error;
    }
    const whole = await runIngest(src, signal, { autoScope: false });
    signal?.throwIfAborted();
    return buildGraph(whole);
  }
}

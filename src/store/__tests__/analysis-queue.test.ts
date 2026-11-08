import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeNodeResponse, ClientStaticEngineResult } from "@/contracts";
import { CONFIG } from "@/contracts/config";
import { analyzeNodeSafe } from "@/lib/api";
import { topoOrderOf, useWorkbenchStore } from "../workbench";

vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), analyzeNodeSafe: vi.fn() }));

const analyze = vi.mocked(analyzeNodeSafe);

// Chuỗi n1 → n2 → … → n8 (id đặt sao cho tô-pô khác thứ tự chữ cái nếu cần).
const IDS = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];
const RESULT = {
  nodes: IDS.map((id, i) => ({ id, prerequisites: i === 0 ? [] : [IDS[i - 1]] })),
  edges: [],
  groups: [],
} as unknown as ClientStaticEngineResult;

interface Call {
  nodeId: string;
  resolve: (code?: "ERR_TOKEN_QUOTA_EXCEEDED" | "ERR_AI_UNAVAILABLE") => void;
}
let calls: Call[];
let inFlight: number;
let maxInFlight: number;
let sessionSeq = 0; // mỗi test 1 phiên riêng: lời gọi treo của test trước thuộc phiên cũ nên không chiếm chỗ

function response(nodeId: string): { ok: true; data: AnalyzeNodeResponse } {
  return {
    ok: true,
    data: {
      node_id: nodeId,
      analysis: { node_id: nodeId } as never,
      node_state: { node_id: nodeId } as never,
      unlocked_node_ids: [],
      tokens_used: 1,
    },
  };
}

beforeEach(() => {
  calls = [];
  inFlight = 0;
  maxInFlight = 0;
  analyze.mockReset();
  analyze.mockImplementation(
    (_sessionId, nodeId) =>
      new Promise((resolve) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        calls.push({
          nodeId,
          resolve: (code) => {
            inFlight--;
            resolve(
              code
                ? { ok: false, code, message: "lỗi", retryable: false }
                : response(nodeId),
            );
          },
        });
      }),
  );
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  useWorkbenchStore.setState({ session_id: `s${++sessionSeq}`, result: RESULT });
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const analyses = () => useWorkbenchStore.getState().analyses;

describe("topoOrderOf", () => {
  it("cha trước con, hòa theo id tăng dần", () => {
    const order = topoOrderOf([
      { id: "c", prerequisites: ["a", "b"] },
      { id: "b", prerequisites: [] },
      { id: "a", prerequisites: [] },
    ]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("có chu trình vẫn trả đủ node", () => {
    const order = topoOrderOf([
      { id: "a", prerequisites: ["b"] },
      { id: "b", prerequisites: ["a"] },
    ]);
    expect(order.sort()).toEqual(["a", "b"]);
  });
});

describe("hàng phân tích", () => {
  it("chỉ phân tích bài đang mở và 2 bài kế tiếp, không cả bài", async () => {
    void useWorkbenchStore.getState().requestAnalysis("n1");
    await tick();

    expect(calls.map((c) => c.nodeId)).toEqual(["n1", "n2", "n3"]);
    expect(analyses().n4).toBeUndefined(); // chưa vào hàng ⇒ không có nhãn
    expect(analyses().n1).toBe("PENDING");
  });

  it("không bao giờ quá CONFIG.ANALYZE_CONCURRENCY lời gọi cùng lúc, kể cả khi đổi bài liên tục", async () => {
    const { requestAnalysis } = useWorkbenchStore.getState();
    void requestAnalysis("n1");
    void requestAnalysis("n4");
    void requestAnalysis("n7");
    await tick();
    while (calls.length > 0 && Object.values(analyses()).includes("PENDING")) {
      calls.splice(0).forEach((c) => c.resolve());
      await tick();
    }
    expect(maxInFlight).toBeLessThanOrEqual(CONFIG.ANALYZE_CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(0);
  });

  it("đổi sang bài khác ⇒ bài chờ cũ bị bỏ khỏi hàng và hết nhãn, bài mới lên trước", async () => {
    // Giữ kín 3 chỗ bằng n1..n3, rồi mở n6: n4/n5 không kịp chạy phải biến mất khỏi hàng.
    void useWorkbenchStore.getState().requestAnalysis("n1");
    await tick();
    const first = useWorkbenchStore.getState().requestAnalysis("n4");
    expect(analyses().n4).toBe("PENDING");
    void useWorkbenchStore.getState().requestAnalysis("n6");
    expect(analyses().n4).toBeUndefined();
    expect(analyses().n5).toBeUndefined();
    expect(analyses().n6).toBe("PENDING");
    expect(analyses().n7).toBe("PENDING");
    await first; // bị bỏ khỏi hàng ⇒ lời hứa vẫn kết thúc, không treo
  });

  it("xong một lời gọi ⇒ lấy bài chờ tiếp theo, thứ tự theo ưu tiên", async () => {
    const { requestAnalysis } = useWorkbenchStore.getState();
    void requestAnalysis("n1"); // n1 n2 n3 chạy
    await tick();
    void requestAnalysis("n5"); // n5 n6 n7 chờ
    await tick();
    expect(calls.map((c) => c.nodeId)).toEqual(["n1", "n2", "n3"]);

    calls[0].resolve();
    await tick();
    expect(calls.map((c) => c.nodeId)).toEqual(["n1", "n2", "n3", "n5"]);
    expect(analyses().n1).toMatchObject({ node_id: "n1" });
  });

  it("lỗi một bài ⇒ chỉ bài đó FAILED, hàng chạy tiếp; Thử lại đưa bài lên đầu", async () => {
    const { requestAnalysis } = useWorkbenchStore.getState();
    void requestAnalysis("n1");
    await tick();
    calls[0].resolve("ERR_AI_UNAVAILABLE");
    await tick();
    expect(analyses().n1).toBe("FAILED");
    expect(analyses().n2).toBe("PENDING");
    expect(useWorkbenchStore.getState().ui.quota_stopped).toBe(false);

    // Mở lại bài FAILED không tự gọi lại; chỉ retry mới gọi.
    const before = calls.length;
    void requestAnalysis("n1");
    await tick();
    expect(calls.length).toBe(before);
    void requestAnalysis("n1", true);
    await tick();
    expect(analyses().n1).toBe("PENDING");
    expect(calls.filter((c) => c.nodeId === "n1")).toHaveLength(2);
  });

  it("hết hạn mức token ⇒ dừng hàng, bài đang chờ thành FAILED", async () => {
    const { requestAnalysis } = useWorkbenchStore.getState();
    void requestAnalysis("n1");
    await tick();
    void requestAnalysis("n5"); // n5..n7 đang chờ vì 3 chỗ đã đầy
    calls[0].resolve("ERR_TOKEN_QUOTA_EXCEEDED");
    await tick();

    const s = useWorkbenchStore.getState();
    expect(s.ui.quota_stopped).toBe(true);
    expect(s.analyses.n1).toBe("FAILED");
    expect(s.analyses.n5).toBe("FAILED");
    expect(calls.map((c) => c.nodeId)).not.toContain("n5");
  });

  it("bài đã có phân tích thì không gọi lại, chỉ tải trước bài kế tiếp", async () => {
    useWorkbenchStore.setState({ analyses: { n1: { node_id: "n1" } as never } });
    void useWorkbenchStore.getState().requestAnalysis("n1");
    await tick();
    expect(calls.map((c) => c.nodeId)).toEqual(["n2", "n3"]);
  });
});

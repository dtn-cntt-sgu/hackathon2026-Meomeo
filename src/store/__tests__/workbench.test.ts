import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestResponse, MeResponse } from "@/contracts";
import { useWorkbenchStore } from "../workbench";

const ME: MeResponse = {
  profile: { user_id: "u1", display_name: "Lan", skills: {}, overall_tier: "NOVICE" },
  server_now: Date.now() + 5_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
});

describe("loadMe", () => {
  it("gọi 3 lần liền chỉ gửi đúng 1 fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(ME));
    vi.stubGlobal("fetch", fetchMock);

    const { loadMe } = useWorkbenchStore.getState();
    const results = await Promise.all([loadMe(), loadMe(), loadMe()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.ok)).toBe(true);
    const s = useWorkbenchStore.getState();
    expect(s.profile?.user_id).toBe("u1");
    expect(s.ui.auth).toBe("SIGNED_IN");
    expect(Math.abs(s.server_clock_offset_ms - 5_000)).toBeLessThan(1_000);
  });

  it("đã có hồ sơ thì không gọi lại, chỉ gọi lại khi force", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(ME)));
    vi.stubGlobal("fetch", fetchMock);

    await useWorkbenchStore.getState().loadMe();
    await useWorkbenchStore.getState().loadMe();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await useWorkbenchStore.getState().loadMe({ force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lỗi mạng không ném ra ngoài, trả kết quả lỗi có thể thử lại", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const res = await useWorkbenchStore.getState().loadMe();

    expect(res).toMatchObject({ ok: false, code: "ERR_CLIENT_NETWORK", retryable: true });
    expect(useWorkbenchStore.getState().ui.boot_error?.retryable).toBe(true);
  });

  it("401 ⇒ đánh dấu đã đăng xuất để UI mời đăng nhập lại", async () => {
    const body = { error: { code: "ERR_UNAUTHENTICATED", message: "Hết hạn", retryable: false } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body, 401)));

    await useWorkbenchStore.getState().loadMe();

    expect(useWorkbenchStore.getState().ui.auth).toBe("SIGNED_OUT");
  });
});

describe("phiên học", () => {
  it("bỏ response của phiên khác phiên hiện tại", async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise<Response>((resolve) => (release = resolve))));

    useWorkbenchStore.setState({ session_id: "s1" });
    const pending = useWorkbenchStore.getState().requestAnalysis("N1");
    expect(useWorkbenchStore.getState().analyses.N1).toBe("PENDING");

    useWorkbenchStore.getState().resetSession();
    useWorkbenchStore.setState({ session_id: "s2" });
    release(
      jsonResponse({ node_id: "N1", analysis: null, node_state: { node_id: "N1" }, unlocked_node_ids: [], tokens_used: 1 }),
    );
    await pending;

    expect(useWorkbenchStore.getState().analyses.N1).toBeUndefined();
  });

  it("applyIngest thay cả phiên và xóa runs cũ", () => {
    useWorkbenchStore.setState({ runs: { N1: {} as never }, analyses: { N1: "FAILED" } });
    const res = {
      session_id: "s9",
      result: { ingestion_report: { ingest_ms: 10, engine_ms: 20 }, nodes: [], edges: [], groups: [] },
      progress: { session_id: "s9", nodes: {}, tokens_used: 0 },
      analyses: {},
      resumed: false,
      from_cache: false,
    } as unknown as IngestResponse;

    useWorkbenchStore.getState().applyIngest(res);

    const s = useWorkbenchStore.getState();
    expect(s.session_id).toBe("s9");
    expect(s.runs).toEqual({});
    expect(s.analyses).toEqual({});
    expect(s.ui.metrics).toEqual({ ingest_ms: 10, engine_ms: 20 });
  });
});

describe("chế độ fixture", () => {
  it("ingest nạp shop-api, không gọi API, bản client không có trường chỉ-server", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, fixture: true } }));

    const pending = useWorkbenchStore.getState().ingest({ repo_url: "https://github.com/a/b" });
    expect(useWorkbenchStore.getState().ui.ingesting).toBe(true);
    await vi.runAllTimersAsync();
    const res = await pending;
    vi.useRealTimers();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    const s = useWorkbenchStore.getState();
    expect(s.ui.ingesting).toBe(false);
    expect(s.session_id).toBe("fixture-shop-api");
    expect(s.result?.repo_name).toBe("shop-api");
    expect(s.result).not.toHaveProperty("symbol_whitelist");
    expect(s.result).not.toHaveProperty("readme_excerpt");
    expect(s.result?.ingestion_report).not.toHaveProperty("suspicious_instruction_files");
    const states = Object.values(s.progress?.nodes ?? {});
    expect(states).toHaveLength(s.result?.nodes.length ?? -1);
    expect(states.some((n) => n.status === "AVAILABLE")).toBe(true);
    expect(states.some((n) => n.status === "LOCKED")).toBe(true);
  });
});

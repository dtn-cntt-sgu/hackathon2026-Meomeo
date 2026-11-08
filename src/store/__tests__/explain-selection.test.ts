import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplainSelectionResponse } from "@/contracts";
import { explanationKey } from "@/lib/selection-explain";
import { useWorkbenchStore } from "../workbench";

const RANGE = { line_start: 5, col_start: 1, line_end: 5, col_end: 20 };
const KEY = explanationKey("n1", 2, RANGE);

const EXPLAINED: ExplainSelectionResponse = {
  explanation: { kind: "CODE", what: "Là gì", here: "Ở đây", analogy: "", skill: null },
  references: [],
  tokens_used: 123,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function explain() {
  return useWorkbenchStore.getState().explainSelection("n1", 2, RANGE, "const x = 1;");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  useWorkbenchStore.setState({
    session_id: "s1",
    progress: { session_id: "s1", nodes: {}, tokens_used: 10 },
  });
});

describe("explainSelection", () => {
  it("gửi đúng ExplainSelectionRequest, nhớ kết quả và cập nhật tokens_used", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(EXPLAINED));
    vi.stubGlobal("fetch", fetchMock);

    const res = await explain();

    expect(res).toEqual({ ok: true, data: EXPLAINED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/explain-selection");
    expect(JSON.parse(String(init.body))).toEqual({
      session_id: "s1",
      node_id: "n1",
      step_number: 2,
      range: RANGE,
      selected_text: "const x = 1;",
    });
    const s = useWorkbenchStore.getState();
    expect(s.ui.explanations[KEY]).toEqual(EXPLAINED);
    expect(s.progress?.tokens_used).toBe(123);
  });

  it("bôi lại đúng vùng ⇒ hiện từ bộ nhớ, 0 request mới", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(EXPLAINED));
    vi.stubGlobal("fetch", fetchMock);

    await explain();
    const again = await explain();

    expect(again).toEqual({ ok: true, data: EXPLAINED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explanation = null ⇒ không nhớ, lần sau gọi lại, nhưng tokens_used vẫn cập nhật", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ explanation: null, references: [], tokens_used: 50 }));
    vi.stubGlobal("fetch", fetchMock);

    await explain();
    expect(useWorkbenchStore.getState().ui.explanations[KEY]).toBeUndefined();
    expect(useWorkbenchStore.getState().progress?.tokens_used).toBe(50);

    await explain();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lỗi ⇒ không nhớ, trả lỗi để popover hiện 'Thử lại'", async () => {
    const body = { error: { code: "ERR_AI_UNAVAILABLE", message: "AI bận", retryable: true } };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body, 503));
    vi.stubGlobal("fetch", fetchMock);

    const res = await explain();

    expect(res).toMatchObject({ ok: false, code: "ERR_AI_UNAVAILABLE" });
    expect(useWorkbenchStore.getState().ui.explanations).toEqual({});
    await explain();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("chưa có phiên ⇒ không gọi API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useWorkbenchStore.setState({ session_id: null });

    expect(await explain()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("?fixture=1 ⇒ trả kết quả mẫu, không gọi API, có nhớ", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, fixture: true } }));

    const pending = explain();
    await vi.runAllTimersAsync();
    const res = await pending;
    vi.useRealTimers();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res?.ok).toBe(true);
    if (res?.ok) expect(res.data.explanation?.what).toBeTruthy();
    expect(useWorkbenchStore.getState().ui.explanations[KEY]).toBeDefined();
  });
});

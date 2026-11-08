import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshSession = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: "old" } } }),
      refreshSession,
    },
  }),
}));

import { apiFetch, apiFetchSafe, ApiClientError, getMeSafe, isApiError } from "../api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const UNAUTH = { error: { code: "ERR_UNAUTHENTICATED", message: "Hết hạn", retryable: false } };

beforeEach(() => {
  vi.unstubAllGlobals();
  refreshSession.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});

describe("apiFetch", () => {
  it("gửi Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/me");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer old");
  });

  it("401 ⇒ làm mới phiên rồi gửi lại đúng 1 lần với token mới", async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: "new" } }, error: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(UNAUTH, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/me")).resolves.toEqual({ ok: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer new");
  });

  it("vẫn 401 sau khi gửi lại ⇒ không gửi lần thứ 3", async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: "new" } }, error: null });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(UNAUTH, 401)));
    vi.stubGlobal("fetch", fetchMock);

    const res = await getMeSafe();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res).toMatchObject({ ok: false, code: "ERR_UNAUTHENTICATED" });
  });

  it("204 ⇒ trả undefined", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiFetch("/api/me", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("body không phải JSON ⇒ ERR_CLIENT_NETWORK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
    await expect(apiFetch("/api/me")).rejects.toMatchObject({ code: "ERR_CLIENT_NETWORK" });
  });
});

describe("apiFetchSafe", () => {
  it("không ném lỗi: trả message và retryable từ server", async () => {
    const body = { error: { code: "ERR_SERVER_BUSY", message: "Bận", retryable: true } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body, 503)));

    const res = await apiFetchSafe("/api/ingest");

    expect(res).toMatchObject({ ok: false, code: "ERR_SERVER_BUSY", message: "Bận", retryable: true });
  });

  it("isApiError nhận ra ApiClientError", () => {
    expect(isApiError(new ApiClientError("ERR_CLIENT_NETWORK", "x"))).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
  });
});

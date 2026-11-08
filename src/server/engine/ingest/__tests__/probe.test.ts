import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "@/contracts";
import type { GithubRepoInfo } from "@/contracts";
import { probeErrorCode, probeRepo } from "../probe";

describe("probe.ts - probeRepo & probeErrorCode", () => {
  const dummyInfo: GithubRepoInfo = {
    owner: "owner",
    repo: "repo",
    path_trimmed: false,
    clean_url: "https://github.com/owner/repo",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("302 tới codeload SHA 40 hex => OK, ref = SHA, default_branch: null, download_url = Location", async () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const codeloadUrl = `https://codeload.github.com/owner/repo/zip/${sha}`;
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: codeloadUrl },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await probeRepo(dummyInfo);
    expect(res).toEqual({
      result: "OK",
      default_branch: null,
      owner: "owner",
      repo: "repo",
      ref: sha,
      download_url: codeloadUrl,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://github.com/owner/repo/archive/HEAD.zip",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("T-ING-08: 302 tới .../zip/refs/heads/develop => default_branch: 'develop', không gọi trang repo", async () => {
    const codeloadUrl = "https://codeload.github.com/owner/repo/zip/refs/heads/develop";
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: codeloadUrl },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const res = await probeRepo(dummyInfo);
    expect(res).toEqual({
      result: "OK",
      default_branch: "develop",
      owner: "owner",
      repo: "repo",
      ref: "develop",
      download_url: codeloadUrl,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("HEAD.zip 404 và trang 404 => NOT_FOUND_OR_PRIVATE", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 })) // HEAD.zip
      .mockResolvedValueOnce(new Response(null, { status: 404 })); // repo page
    vi.stubGlobal("fetch", mockFetch);

    const res = await probeRepo(dummyInfo);
    expect(res).toEqual({
      result: "NOT_FOUND_OR_PRIVATE",
      default_branch: null,
      owner: "owner",
      repo: "repo",
      ref: null,
      download_url: null,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://github.com/owner/repo/archive/HEAD.zip",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://github.com/owner/repo",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("HEAD.zip 404, trang 200, main 404, master 200 => OK, default_branch: 'master'", async () => {
    const masterUrl = "https://codeload.github.com/owner/repo/zip/refs/heads/master";
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 })) // HEAD.zip
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // page
      .mockResolvedValueOnce(new Response(null, { status: 404 })) // main
      .mockResolvedValueOnce(new Response(null, { status: 200 })); // master
    vi.stubGlobal("fetch", mockFetch);

    const res = await probeRepo(dummyInfo);
    expect(res).toEqual({
      result: "OK",
      default_branch: "master",
      owner: "owner",
      repo: "repo",
      ref: "master",
      download_url: masterUrl,
    });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("T-ING-09: HEAD.zip 404, trang 200, mọi nhánh fallback 404 => EMPTY", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 })) // HEAD.zip
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // page
      .mockResolvedValueOnce(new Response(null, { status: 404 })) // main
      .mockResolvedValueOnce(new Response(null, { status: 404 })) // master
      .mockResolvedValueOnce(new Response(null, { status: 404 })); // dev
    vi.stubGlobal("fetch", mockFetch);

    const res = await probeRepo(dummyInfo);
    expect(res).toEqual({
      result: "EMPTY",
      default_branch: null,
      owner: "owner",
      repo: "repo",
      ref: null,
      download_url: null,
    });
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("451 => UNAVAILABLE_451; 429 và 403 => RATE_LIMITED", async () => {
    // 451
    const mockFetch451 = vi.fn().mockResolvedValueOnce(new Response(null, { status: 451 }));
    vi.stubGlobal("fetch", mockFetch451);
    const res451 = await probeRepo(dummyInfo);
    expect(res451.result).toBe("UNAVAILABLE_451");

    // 429
    const mockFetch429 = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", mockFetch429);
    const res429 = await probeRepo(dummyInfo);
    expect(res429.result).toBe("RATE_LIMITED");

    // 403
    const mockFetch403 = vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", mockFetch403);
    const res403 = await probeRepo(dummyInfo);
    expect(res403.result).toBe("RATE_LIMITED");
  });

  it("fetch ném lỗi mạng 2 lần => TIMEOUT, đúng 2 lần gọi HEAD.zip (fake timer)", async () => {
    vi.useFakeTimers();
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network error 1"))
      .mockRejectedValueOnce(new Error("network error 2"));
    vi.stubGlobal("fetch", mockFetch);

    const promise = probeRepo(dummyInfo);
    await vi.advanceTimersByTimeAsync(CONFIG.PREFLIGHT_RETRY_DELAY_MS + 20);
    const res = await promise;

    expect(res.result).toBe("TIMEOUT");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://github.com/owner/repo/archive/HEAD.zip",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://github.com/owner/repo/archive/HEAD.zip",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("Lần 1 lỗi mạng, lần 2 302 => OK (fake timer)", async () => {
    vi.useFakeTimers();
    const codeloadUrl = "https://codeload.github.com/owner/repo/zip/refs/heads/main";
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network glitch"))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: codeloadUrl },
        }),
      );
    vi.stubGlobal("fetch", mockFetch);

    const promise = probeRepo(dummyInfo);
    await vi.advanceTimersByTimeAsync(CONFIG.PREFLIGHT_RETRY_DELAY_MS + 20);
    const res = await promise;

    expect(res).toEqual({
      result: "OK",
      default_branch: "main",
      owner: "owner",
      repo: "repo",
      ref: "main",
      download_url: codeloadUrl,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("T-ING-07: 301 tới https://github.com/c/d/archive/HEAD.zip rồi 302 tới codeload c/d => OK, owner: 'c', repo: 'd'", async () => {
    const codeloadUrl =
      "https://codeload.github.com/c/d/zip/0123456789abcdef0123456789abcdef01234567";
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { Location: "https://github.com/c/d/archive/HEAD.zip" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: codeloadUrl },
        }),
      );
    vi.stubGlobal("fetch", mockFetch);

    const res = await probeRepo({
      owner: "a",
      repo: "b",
      path_trimmed: false,
      clean_url: "https://github.com/a/b",
    });

    expect(res).toEqual({
      result: "OK",
      default_branch: null,
      owner: "c",
      repo: "d",
      ref: "0123456789abcdef0123456789abcdef01234567",
      download_url: codeloadUrl,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("probeErrorCode ánh xạ đủ 6 kết quả", () => {
    expect(probeErrorCode("OK")).toBeNull();
    expect(probeErrorCode("NOT_FOUND_OR_PRIVATE")).toBe("ERR_PREFLIGHT_404_OR_PRIVATE");
    expect(probeErrorCode("UNAVAILABLE_451")).toBe("ERR_REPO_UNAVAILABLE_451");
    expect(probeErrorCode("RATE_LIMITED")).toBe("ERR_GITHUB_RATE_LIMIT_CDN");
    expect(probeErrorCode("TIMEOUT")).toBe("ERR_NETWORK_TIMEOUT");
    expect(probeErrorCode("EMPTY")).toBe("ERR_EMPTY_REPOSITORY");
  });
});

import { CONFIG } from "@/contracts";
import type { GithubRepoInfo, IngestionErrorCode, ProbeResult } from "@/contracts";

export interface ProbeOutcome {
  result: ProbeResult;
  default_branch: string | null;
  owner: string;
  repo: string;
  ref: string | null;
  download_url: string | null;
}

async function headOnce(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; location: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      headers: { "User-Agent": "SimpliFey" },
      signal: controller.signal,
    });
    const location = res.headers.get("location") || res.headers.get("Location");
    return { status: res.status, location };
  } catch {
    return { status: 0, location: null };
  } finally {
    clearTimeout(timer);
  }
}

function classify(status: number): ProbeResult {
  if (status === 0 || status >= 500) {
    return "TIMEOUT";
  }
  if (status === 429 || status === 403) {
    return "RATE_LIMITED";
  }
  if (status === 451) {
    return "UNAVAILABLE_451";
  }
  return "TIMEOUT";
}

async function doProbe(
  owner: string,
  repo: string,
  allowRedirect: boolean,
): Promise<ProbeOutcome> {
  const headZipUrl = `https://github.com/${owner}/${repo}/archive/HEAD.zip`;

  // Bước 1: HEAD archive/HEAD.zip, timeout CONFIG.PREFLIGHT_TIMEOUT_MS
  let headRes = await headOnce(headZipUrl, CONFIG.PREFLIGHT_TIMEOUT_MS);
  if (headRes.status === 0 || headRes.status >= 500) {
    // Ra TIMEOUT => chờ CONFIG.PREFLIGHT_RETRY_DELAY_MS, thử lại 1 lần
    await new Promise((resolve) =>
      setTimeout(resolve, CONFIG.PREFLIGHT_RETRY_DELAY_MS),
    );
    headRes = await headOnce(headZipUrl, CONFIG.PREFLIGHT_TIMEOUT_MS);
    if (headRes.status === 0 || headRes.status >= 500) {
      return {
        result: "TIMEOUT",
        default_branch: null,
        owner,
        repo,
        ref: null,
        download_url: null,
      };
    }
  }

  const status = headRes.status;
  const location = headRes.location;

  // 3xx có Location
  if (status >= 300 && status < 400 && location) {
    // Khớp codeload
    const codeloadMatch = location.match(
      /^https:\/\/codeload\.github\.com\/([^/]+)\/([^/]+)\/zip\/(?:refs\/heads\/)?(.+)$/,
    );
    if (codeloadMatch) {
      const o = codeloadMatch[1];
      const r = codeloadMatch[2];
      const matchedRef = codeloadMatch[3];
      const isSha = /^[0-9a-f]{40}$/i.test(matchedRef);
      return {
        result: "OK",
        default_branch: isSha ? null : matchedRef,
        owner: o,
        repo: r,
        ref: matchedRef,
        download_url: location,
      };
    }

    // Khớp https://github.com/{o2}/{r2}/archive/HEAD.zip khác repo cũ (repo đổi tên)
    if (allowRedirect) {
      const renameMatch = location.match(
        /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/archive\/HEAD\.zip$/i,
      );
      if (
        renameMatch &&
        (renameMatch[1] !== owner || renameMatch[2] !== repo)
      ) {
        return doProbe(renameMatch[1], renameMatch[2], false);
      }
    }

    // 3xx khác mẫu
    return {
      result: "OK",
      default_branch: null,
      owner,
      repo,
      ref: null,
      download_url: headZipUrl,
    };
  }

  // 200
  if (status === 200) {
    return {
      result: "OK",
      default_branch: null,
      owner,
      repo,
      ref: null,
      download_url: headZipUrl,
    };
  }

  // 404 => HEAD https://github.com/{owner}/{repo}, timeout CONFIG.PREFLIGHT_PAGE_TIMEOUT_MS
  if (status === 404) {
    const pageUrl = `https://github.com/${owner}/${repo}`;
    const pageRes = await headOnce(pageUrl, CONFIG.PREFLIGHT_PAGE_TIMEOUT_MS);

    if (pageRes.status === 404) {
      return {
        result: "NOT_FOUND_OR_PRIVATE",
        default_branch: null,
        owner,
        repo,
        ref: null,
        download_url: null,
      };
    }

    if (pageRes.status === 200) {
      // Thử lần lượt CONFIG.DEFAULT_BRANCH_FALLBACKS
      for (const b of CONFIG.DEFAULT_BRANCH_FALLBACKS) {
        const branchUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${b}`;
        const branchRes = await headOnce(
          branchUrl,
          CONFIG.PREFLIGHT_TIMEOUT_MS,
        );
        if (branchRes.status === 200) {
          return {
            result: "OK",
            default_branch: b,
            owner,
            repo,
            ref: b,
            download_url: branchUrl,
          };
        }
        if (branchRes.status === 404) {
          continue;
        }
        return {
          result: classify(branchRes.status),
          default_branch: null,
          owner,
          repo,
          ref: null,
          download_url: null,
        };
      }

      // Đều 404 => EMPTY
      return {
        result: "EMPTY",
        default_branch: null,
        owner,
        repo,
        ref: null,
        download_url: null,
      };
    }

    // Mã khác khi gọi trang repo
    return {
      result: classify(pageRes.status),
      default_branch: null,
      owner,
      repo,
      ref: null,
      download_url: null,
    };
  }

  // 451, 429, 403 hoặc mã khác
  return {
    result: classify(status),
    default_branch: null,
    owner,
    repo,
    ref: null,
    download_url: null,
  };
}

/**
 * Thăm dò repo công khai và tìm URL tải zip.
 * Không bao giờ ném lỗi; kết quả không OK thì download_url = null.
 */
export async function probeRepo(
  info: GithubRepoInfo,
): Promise<ProbeOutcome> {
  return doProbe(info.owner, info.repo, true);
}

/**
 * Chuyển ProbeResult thành mã lỗi IngestionErrorCode tương ứng.
 */
export function probeErrorCode(
  result: ProbeResult,
): IngestionErrorCode | null {
  switch (result) {
    case "OK":
      return null;
    case "NOT_FOUND_OR_PRIVATE":
      return "ERR_PREFLIGHT_404_OR_PRIVATE";
    case "UNAVAILABLE_451":
      return "ERR_REPO_UNAVAILABLE_451";
    case "RATE_LIMITED":
      return "ERR_GITHUB_RATE_LIMIT_CDN";
    case "TIMEOUT":
      return "ERR_NETWORK_TIMEOUT";
    case "EMPTY":
      return "ERR_EMPTY_REPOSITORY";
  }
}

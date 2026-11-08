import type { GithubRepoInfo } from "@/contracts";
import { IngestionError } from "./types";

const GITHUB_URL_REGEX =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:(\/(?:tree|blob)(?:(?:\/.*)?))|\/[^/]+(?:\/.*)?)?$/;

/**
 * Chuẩn hóa link GitHub về gốc repo theo spec 10 Mục 1 (ING-10 đến ING-13).
 * Bỏ khoảng trắng, cắt query/hash, chuyển scheme/host về https://github.com,
 * cắt /tree/, /blob/ về gốc repo và đặt cờ path_trimmed.
 */
export function parseGithubUrl(raw: string): GithubRepoInfo {
  let s = raw.trim();
  if (!s) {
    throw new IngestionError("ERR_INVALID_GITHUB_URL");
  }

  // 1. Cắt từ ? hoặc # đầu tiên (ING-10)
  const firstCut = s.search(/[?#]/);
  if (firstCut !== -1) {
    s = s.slice(0, firstCut);
  }

  // 2. Chuẩn hóa theo thứ tự (ING-11):
  if (s.startsWith("git@github.com:")) {
    s = "https://github.com/" + s.slice("git@github.com:".length);
  } else if (/^https?:\/\//i.test(s)) {
    s = s.replace(/^http:\/\//i, "https://");
  } else if (/^(www\.)?github\.com\//i.test(s)) {
    s = "https://" + s;
  }

  // Bỏ www. sau https://
  s = s.replace(/^https:\/\/www\./i, "https://");

  // Host và scheme về chữ thường
  if (!s.startsWith("https://")) {
    throw new IngestionError("ERR_INVALID_GITHUB_URL");
  }

  const slashAfterHost = s.indexOf("/", 8);
  const host = slashAfterHost === -1 ? s.slice(8) : s.slice(8, slashAfterHost);
  const rest = slashAfterHost === -1 ? "" : s.slice(slashAfterHost);

  // 3. Host khác github.com => ERR_INVALID_GITHUB_URL (ING-12)
  if (host.toLowerCase() !== "github.com") {
    throw new IngestionError("ERR_INVALID_GITHUB_URL");
  }

  s = "https://github.com" + rest;

  // Bỏ / cuối
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }

  // 4. Khớp regex ING-13 của spec (D-38)
  const match = s.match(GITHUB_URL_REGEX);
  if (!match) {
    throw new IngestionError("ERR_INVALID_GITHUB_URL");
  }

  const owner = match[1];
  const repo = match[2];
  const path_trimmed = Boolean(match[3]);
  const clean_url = `https://github.com/${owner}/${repo}`;

  return {
    owner,
    repo,
    path_trimmed,
    clean_url,
  };
}

import { describe, expect, it } from "vitest";
import { ApiHttpError } from "@/server/errors";
import { IngestionError } from "../types";
import { parseGithubUrl } from "../url";

describe("url.ts - parseGithubUrl", () => {
  it("T-ING-01: chuẩn hóa link có query, hash và khoảng trắng", () => {
    const res = parseGithubUrl("  https://github.com/nestjs/nest.git?tab=readme#x ");
    expect(res).toEqual({
      owner: "nestjs",
      repo: "nest",
      path_trimmed: false,
      clean_url: "https://github.com/nestjs/nest",
    });
  });

  it("T-ING-02: chuẩn hóa các dạng SSH, thiếu scheme, www, và trang con không phải tree/blob", () => {
    const urls = [
      "git@github.com:a/b.git",
      "github.com/a/b/",
      "https://www.github.com/a/b",
      "https://github.com/a/b/pulls",
    ];
    for (const url of urls) {
      const res = parseGithubUrl(url);
      expect(res).toEqual({
        owner: "a",
        repo: "b",
        path_trimmed: false,
        clean_url: "https://github.com/a/b",
      });
    }
  });

  it("T-ING-03: link có /tree/ => cắt về gốc repo, path_trimmed: true", () => {
    const res = parseGithubUrl("https://github.com/a/b/tree/release/v2/src");
    expect(res).toEqual({
      owner: "a",
      repo: "b",
      path_trimmed: true,
      clean_url: "https://github.com/a/b",
    });
  });

  it("T-ING-04: link có /blob/ => cắt về gốc repo, path_trimmed: true", () => {
    const res = parseGithubUrl("https://github.com/a/b/blob/main/src/app.ts");
    expect(res).toEqual({
      owner: "a",
      repo: "b",
      path_trimmed: true,
      clean_url: "https://github.com/a/b",
    });
  });

  it("T-ING-06: link sai dạng ném IngestionError('ERR_INVALID_GITHUB_URL') và là instanceof ApiHttpError", () => {
    const invalidUrls = [
      "https://gitlab.com/a/b",
      "https://github.com/a",
      "abc",
      "",
      "   ",
    ];

    for (const raw of invalidUrls) {
      expect(() => parseGithubUrl(raw)).toThrow(IngestionError);
      try {
        parseGithubUrl(raw);
      } catch (err) {
        expect(err).toBeInstanceOf(IngestionError);
        expect(err).toBeInstanceOf(ApiHttpError);
        expect((err as IngestionError).code).toBe("ERR_INVALID_GITHUB_URL");
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import type { IngestionReport } from "@/contracts";
import { detectScope } from "../fingerprint";
import type { ClassifiedEntry } from "../types";

function entry(path: string, size = 1000): ClassifiedEntry {
  return {
    path,
    size,
    compressed_size: size,
    method: 8,
    local_offset: 0,
    is_dir: false,
    cls: "CODE",
    language: "TYPESCRIPT",
    skip_reason: null,
  } as ClassifiedEntry;
}

function report(): IngestionReport {
  return { warnings: [] } as unknown as IngestionReport;
}

describe("detectScope tự chọn backend (ING-80)", () => {
  it("có wpe-backend và wpe-frontend ⇒ chọn wpe-backend, báo cảnh báo", () => {
    const r = report();
    const scope = detectScope(
      [entry("wpe-backend/src/A.java", 500), entry("wpe-frontend/src/a.tsx", 5000), entry("README.ts", 10)],
      null,
      r,
      true,
    );
    expect(scope.root_dir_offset).toBe("wpe-backend/");
    expect(scope.is_monorepo).toBe(true);
    expect(r.warnings.join(" ")).toContain("giao diện");
  });

  it("server và client ⇒ chọn server", () => {
    const scope = detectScope([entry("server/app.ts"), entry("client/app.tsx")], null, report(), true);
    expect(scope.root_dir_offset).toBe("server/");
  });

  it("apps/api và apps/web ⇒ chọn apps/api", () => {
    const scope = detectScope([entry("apps/api/main.ts"), entry("apps/web/page.tsx")], "", report(), true);
    expect(scope.root_dir_offset).toBe("apps/api/");
  });

  it("2 backend ⇒ chọn backend lớn hơn, báo có nhiều backend", () => {
    const r = report();
    const scope = detectScope([entry("api/a.ts", 100), entry("server/b.ts", 900)], null, r, true);
    expect(scope.root_dir_offset).toBe("server/");
    expect(r.warnings.join(" ")).toContain("nhiều thư mục backend");
  });

  it("1 backend chiếm phần lớn code, không có frontend ⇒ chọn backend", () => {
    const scope = detectScope([entry("backend/a.ts", 900), entry("scripts/x.ts", 100)], null, report(), true);
    expect(scope).toMatchObject({ root_dir_offset: "backend/", is_monorepo: false });
  });

  it("1 backend nhỏ, không có frontend ⇒ phân tích cả repo", () => {
    const scope = detectScope([entry("api/a.ts", 100), entry("src/x.ts", 900)], null, report(), true);
    expect(scope.root_dir_offset).toBe("");
  });

  it("api-docs, apiClient không phải backend", () => {
    const scope = detectScope([entry("api-docs/a.ts"), entry("apiClient/b.ts"), entry("web/c.tsx")], null, report(), true);
    expect(scope.root_dir_offset).toBe("");
  });

  it("repo thường không có thư mục backend ⇒ phân tích cả repo", () => {
    const scope = detectScope([entry("src/app.ts"), entry("src/db.ts")], null, report(), true);
    expect(scope.root_dir_offset).toBe("");
  });

  it("không bật auto (dựng lại phiên) ⇒ không tự chọn", () => {
    const scope = detectScope([entry("server/app.ts"), entry("client/app.tsx")], null, report(), false);
    expect(scope.root_dir_offset).toBe("");
  });

  it("người dùng chọn thư mục thì theo thư mục đó", () => {
    const scope = detectScope([entry("server/app.ts"), entry("client/app.tsx")], "client", report(), true);
    expect(scope).toMatchObject({ root_dir_offset: "client/", explicit: true });
  });
});

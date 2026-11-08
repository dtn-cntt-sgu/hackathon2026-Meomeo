import { posix } from "node:path";
import { CONFIG } from "@/contracts";
import type { IngestionReport } from "@/contracts";
import type { ClassifiedEntry, ScopeDecision, ZipEntryMeta } from "./types";
import { comparePath, type InflatePlan } from "./unzip";

const ROLE_NAMES = new Set([
  "controller", "controllers", "route", "routes", "router", "routers", "handler", "handlers",
  "service", "services", "usecase", "usecases", "repository", "repositories", "repo", "repos",
  "model", "models", "entity", "entities", "schema", "schemas", "middleware", "middlewares",
  "api", "main", "app", "server", "index", "screen", "screens", "page", "pages", "view", "views",
  "activity", "activities", "fragment", "fragments", "command", "commands",
]);

const TEST_SEGMENTS = new Set([
  "test", "tests", "__tests__", "spec", "specs", "example", "examples", "demo", "demos", "e2e",
  "fixtures", "mocks", "__mocks__", "migrations", "seeds", "docs", "scripts", "testdata",
  "bench", "benches", "benchmark", "benchmarks",
]);

const TEST_ROOT_SEGMENTS = new Set(["integration", "sample", "samples"]);

function stemOf(base: string): string {
  return base.slice(0, base.length - posix.extname(base).length);
}

function hasRoleName(segments: string[]): boolean {
  const base = segments[segments.length - 1];
  if (segments.slice(0, -1).some((dir) => ROLE_NAMES.has(dir.toLowerCase()))) {
    return true;
  }
  const stem = stemOf(base);
  const tokens = stem.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[._\-\s]+/);
  const last = tokens[tokens.length - 1] ?? "";
  return ROLE_NAMES.has(last.toLowerCase()) || ROLE_NAMES.has(stem.toLowerCase());
}

/** ING-87. Từ src/main/ trở xuống chỉ xét tên file vì đó là code thật của Maven, Gradle. */
export function isTestPath(path: string): boolean {
  const segments = path.split("/");
  const lower = segments.map((segment) => segment.toLowerCase());
  const base = lower[lower.length - 1];

  const mainAt = lower.findIndex((s, i) => s === "src" && lower[i + 1] === "main");
  const dirs = lower.slice(0, mainAt >= 0 ? mainAt : -1);
  if (TEST_ROOT_SEGMENTS.has(dirs[0] ?? "")) {
    return true;
  }
  if (dirs.some((d) => TEST_SEGMENTS.has(d) || d.startsWith(".") || d.endsWith("_src"))) {
    return true;
  }

  const stem = stemOf(base);
  return (
    base.startsWith(".") ||
    stem.endsWith(".test") ||
    stem.endsWith(".spec") ||
    stem.endsWith("_test") ||
    stem.startsWith("test_")
  );
}

export function filePriorityScore(path: string, size: number, scope: string): number {
  const segments = path.split("/");
  const inScope = scope !== "" && path.startsWith(scope);
  let score = 1 / segments.length;
  if (inScope) {
    score += CONFIG.FPS_IN_SCOPE;
  }
  // Thư mục scope chỉ nói phạm vi, không phải vai trò (T-ING-16: server/tests/… không cộng).
  if (hasRoleName((inScope ? path.slice(scope.length) : path).split("/"))) {
    score += CONFIG.FPS_ROLE_NAME;
  }
  if (isTestPath(path)) {
    score += CONFIG.FPS_TEST_PENALTY;
  }
  if (size < CONFIG.FPS_TINY_BYTES) {
    score += CONFIG.FPS_TINY_PENALTY;
  }
  return score;
}

function isOversized(e: ZipEntryMeta): boolean {
  return (
    e.size > CONFIG.MAX_SINGLE_FILE_BYTES ||
    (e.compressed_size > 0 && e.size / e.compressed_size > CONFIG.MAX_COMPRESSION_RATIO)
  );
}

function pickReadme(entries: ClassifiedEntry[], offset: string): ZipEntryMeta | null {
  const readmes = entries.filter((e) => e.cls === "README").sort(comparePath);
  const inDir = (dir: string) =>
    readmes.find((e) => e.path.startsWith(dir) && !e.path.slice(dir.length).includes("/"));
  const found = inDir(offset) ?? inDir("");
  return found && found.size <= CONFIG.MAX_MANIFEST_BYTES ? found : null;
}

/**
 * ING-88. File test luôn xếp sau file thật để không chiếm quota: điểm phạt một mình
 * chưa đủ khi file test nằm trong thư mục vai trò. Quota MAX_CLEAN_FILES áp lúc giải
 * nén (Mục 9) để file bị loại vì minified nhường chỗ cho ứng viên kế tiếp.
 */
export function selectFiles(
  entries: ClassifiedEntry[],
  scope: ScopeDecision,
  report?: IngestionReport,
): InflatePlan {
  const offset = scope.root_dir_offset;
  const ranked: Array<{ entry: ClassifiedEntry; test: boolean; score: number }> = [];

  for (const entry of entries) {
    if (entry.cls !== "CODE") {
      continue;
    }
    if (isOversized(entry)) {
      if (report) {
        report.skipped.oversized++;
      }
      continue;
    }
    ranked.push({
      entry,
      test: isTestPath(entry.path),
      score: filePriorityScore(entry.path, entry.size, offset),
    });
  }

  ranked.sort(
    (a, b) =>
      Number(a.test) - Number(b.test) || b.score - a.score || comparePath(a.entry, b.entry),
  );

  return {
    manifests: entries.filter((e) => e.cls === "MANIFEST").sort(comparePath),
    readme: pickReadme(entries, offset),
    ordered_candidates: ranked.map((item) => item.entry),
  };
}

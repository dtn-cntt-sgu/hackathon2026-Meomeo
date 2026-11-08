import { posix } from "node:path";
import { CONFIG } from "@/contracts";
import type {
  GraphConfidence,
  IngestOutput,
  IngestionReport,
  LanguageId,
  LanguageSupportInfo,
  LanguageSupportTier,
  ProjectArchetype,
  ProjectFingerprint,
} from "@/contracts";
import { getAdapter, tierOf } from "../graph/registry";
import { DEFAULT_LANGUAGE_REGISTRY } from "./prune";
import { sanitizeText } from "./secrets";
import { IngestionError, type ClassifiedEntry, type LanguageRegistry, type ScopeDecision } from "./types";

const FRAMEWORKS: ReadonlyArray<readonly [string, string]> = [
  ["@nestjs/core", "NestJS"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["koa", "Koa"],
  ["org.springframework.boot:spring-boot-starter-web", "Spring Boot"],
  ["next", "Next.js"],
  ["nuxt", "Nuxt"],
  ["@angular/core", "Angular"],
  ["react-native", "React Native"],
  ["expo", "Expo"],
  ["electron", "Electron"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["react-dom", "React"],
];

const PROD_ONLY_PACKAGES = new Set(["@nestjs/core", "express", "fastify", "koa"]);

const ARCHETYPES: ReadonlyArray<readonly [ProjectArchetype, readonly string[]]> = [
  ["MOBILE_APP", ["react-native", "expo"]],
  ["DESKTOP_APP", ["electron", "@tauri-apps/api"]],
  [
    "WEB_BACKEND",
    [
      "express", "koa", "fastify", "@nestjs/core", "@hapi/hapi",
      "org.springframework.boot:spring-boot-starter-web",
      "org.springframework.boot:spring-boot-starter-webflux",
    ],
  ],
  ["WEB_FRONTEND", ["react-dom", "vue", "svelte", "@angular/core", "next", "nuxt"]],
  ["CLI_TOOL", ["commander", "yargs"]],
];

interface ParsedManifest {
  path: string;
  packages: string[];
  prod_packages: string[];
  has_bin: boolean;
  main: string | null;
  bin_paths: string[];
}

interface PackageJson {
  description?: unknown;
  main?: unknown;
  bin?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

function inScope(path: string, offset: string): boolean {
  return offset === "" || path.startsWith(offset);
}

function dirOf(path: string): string {
  const dir = posix.dirname(path);
  return dir === "." ? "" : `${dir}/`;
}

function parseLooseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/^\uFEFF/, "")
      .replace(/("(?:\\.|[^"\\])*")|\/\/.*$|\/\*[\s\S]*?\*\//gm, (_, str?: string) => str ?? "")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  }
}

function readPackageJson(text: string): PackageJson | null {
  try {
    const parsed = parseLooseJson(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as PackageJson) : null;
  } catch {
    return null;
  }
}

function binPaths(bin: unknown): string[] {
  if (typeof bin === "string") {
    return [bin];
  }
  if (typeof bin === "object" && bin !== null) {
    return Object.values(bin).filter((value): value is string => typeof value === "string");
  }
  return [];
}

function pomPackages(text: string): string[] {
  const packages: string[] = [];
  for (const [block] of text.matchAll(/<dependency>[\s\S]*?<\/dependency>/g)) {
    const group = /<groupId>\s*([^<\s]+)\s*<\/groupId>/.exec(block)?.[1];
    const artifact = /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/.exec(block)?.[1];
    if (group && artifact) {
      packages.push(`${group}:${artifact}`);
    }
  }
  return packages;
}

function gradlePackages(text: string): string[] {
  const re = /(?:implementation|api|compile\w*)\s*\(?\s*["']([^"':]+):([^"':]+)/g;
  return [...text.matchAll(re)].map((match) => `${match[1]}:${match[2]}`);
}

export function parseManifests(
  manifests: Map<string, string>,
  report?: IngestionReport,
): ParsedManifest[] {
  const parsed: ParsedManifest[] = [];
  for (const [path, text] of manifests) {
    const base = posix.basename(path).toLowerCase();
    const item: ParsedManifest = {
      path,
      packages: [],
      prod_packages: [],
      has_bin: false,
      main: null,
      bin_paths: [],
    };

    if (base === "package.json") {
      const pkg = readPackageJson(text);
      if (pkg === null) {
        report?.warnings.push(`Không đọc được ${path}, tệp bị hỏng định dạng.`);
        continue;
      }
      item.prod_packages = Object.keys(pkg.dependencies ?? {});
      item.packages = [
        ...item.prod_packages,
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
      ];
      item.bin_paths = binPaths(pkg.bin);
      item.has_bin = item.bin_paths.length > 0;
      item.main = typeof pkg.main === "string" ? pkg.main : null;
    } else if (base === "pom.xml") {
      item.packages = pomPackages(text);
      item.prod_packages = item.packages;
    } else if (base === "build.gradle" || base === "build.gradle.kts") {
      item.packages = gradlePackages(text);
      item.prod_packages = item.packages;
    } else {
      continue;
    }

    item.packages = item.packages.map((name) => name.trim().toLowerCase());
    item.prod_packages = item.prod_packages.map((name) => name.trim().toLowerCase());
    parsed.push(item);
  }
  return parsed;
}

// ING-80 bước 2: tên thư mục backend, frontend. Thêm đuôi `-backend`, `-frontend` ở gốc (VD `wpe-backend`).
const SERVER_DIR = /^(server|backend|api)$|-(server|backend|api)$/i;
const CLIENT_DIR = /^(client|frontend|web|ui|mobile|webapp|app-web)$|-(client|frontend|web|ui|mobile)$/i;

/** Thư mục ứng viên của một file: `<x>/` ở gốc, hoặc `apps/<x>/`, `packages/<x>/`. */
function candidateDirOf(path: string): { key: string; name: string } | null {
  const seg = path.split("/");
  const depth = seg.length > 2 && (seg[0] === "apps" || seg[0] === "packages") ? 2 : 1;
  if (seg.length <= depth) {
    return null;
  }
  return { key: `${seg.slice(0, depth).join("/")}/`, name: seg[depth - 1] };
}

/**
 * ING-80 bước 2–4: repo có cả giao diện và backend thì chỉ phân tích backend, để trần
 * `MAX_CLEAN_FILES` dành cho file backend (controller ⇒ service ⇒ repository).
 */
function autoScope(entries: ClassifiedEntry[], report?: IngestionReport): ScopeDecision {
  const serverBytes = new Map<string, number>();
  const clients = new Set<string>();
  let totalBytes = 0;
  for (const e of entries) {
    if (e.cls !== "CODE") {
      continue;
    }
    totalBytes += e.size;
    const dir = candidateDirOf(e.path);
    if (dir && SERVER_DIR.test(dir.name)) {
      serverBytes.set(dir.key, (serverBytes.get(dir.key) ?? 0) + e.size);
    } else if (dir && CLIENT_DIR.test(dir.name)) {
      clients.add(dir.key);
    }
  }

  const servers = [...serverBytes.keys()].sort(
    (a, b) => (serverBytes.get(b) ?? 0) - (serverBytes.get(a) ?? 0) || (a < b ? -1 : a > b ? 1 : 0),
  );
  const best = servers[0];
  const whole: ScopeDecision = { root_dir_offset: "", is_monorepo: false, candidates: servers, explicit: false };
  if (best === undefined) {
    return whole;
  }

  const isMonorepo = clients.size > 0 || servers.length >= 2;
  const dominant = (serverBytes.get(best) ?? 0) / Math.max(1, totalBytes) > CONFIG.MONOREPO_DOMINANT_RATIO;
  if (!isMonorepo && !dominant) {
    return whole;
  }

  if (servers.length >= 2) {
    report?.warnings.push(
      `Phát hiện nhiều thư mục backend: ${servers.join(", ")}. Đang phân tích ${best}; có thể chọn thư mục khác.`,
    );
  } else if (clients.size > 0) {
    report?.warnings.push(`Repo có cả giao diện và backend, SimpliFey đang phân tích phần backend ${best}.`);
  }
  return { root_dir_offset: best, is_monorepo: isMonorepo, candidates: servers, explicit: false };
}

/** ING-80: thư mục người dùng chọn; không chọn và `auto` ⇒ tự chọn backend (ING-80 bước 2–4). */
export function detectScope(
  entries: ClassifiedEntry[],
  explicit_subdir: string | null,
  report?: IngestionReport,
  auto = false,
): ScopeDecision {
  const trimmed = (explicit_subdir ?? "").trim().replace(/\\/g, "/").replace(/^(\.?\/)+/, "");
  if (trimmed === "") {
    return auto
      ? autoScope(entries, report)
      : { root_dir_offset: "", is_monorepo: false, candidates: [], explicit: false };
  }

  const subdir = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  const wanted = subdir.toLowerCase();
  const match = entries.find(
    (e) => e.cls === "CODE" && e.path.toLowerCase().startsWith(wanted),
  );
  if (!match) {
    throw new IngestionError("ERR_NO_SOURCE_FILES_FOUND", { subdir, hint: "empty_subdir" });
  }
  return {
    root_dir_offset: match.path.slice(0, subdir.length),
    is_monorepo: false,
    candidates: [],
    explicit: true,
  };
}

function tierFor(language: LanguageId, registry: LanguageRegistry): LanguageSupportTier {
  if (!registry.with_grammar.includes(language)) {
    return "UNSUPPORTED";
  }
  const adapter = getAdapter(language);
  return adapter ? tierOf(adapter) : "STRUCTURAL";
}

function languageBreakdown(
  entries: ClassifiedEntry[],
  offset: string,
  registry: LanguageRegistry,
  fileLanguage?: Map<string, LanguageId>,
): LanguageSupportInfo[] {
  const bytes = new Map<LanguageId, number>();
  for (const e of entries) {
    const language = fileLanguage?.get(e.path) ?? e.language;
    if (language !== null && inScope(e.path, offset)) {
      bytes.set(language, (bytes.get(language) ?? 0) + e.size);
    }
  }
  return [...bytes]
    .map(([language, code_bytes]) => ({ language, code_bytes, tier: tierFor(language, registry) }))
    .sort(
      (a, b) =>
        b.code_bytes - a.code_bytes || (a.language < b.language ? -1 : a.language > b.language ? 1 : 0),
    );
}

function graphConfidence(
  breakdown: LanguageSupportInfo[],
  report: IngestionReport,
): GraphConfidence {
  const sum = (tier: LanguageSupportTier) =>
    breakdown.filter((l) => l.tier === tier).reduce((total, l) => total + l.code_bytes, 0);
  const resolved = sum("RESOLVED");
  const structural = sum("STRUCTURAL");
  const sample = resolved + structural;

  if (sample === 0) {
    return "MIXED";
  }
  if (resolved / sample >= CONFIG.GRAPH_CONFIDENCE_HIGH_RATIO) {
    return "HIGH";
  }
  if (structural / sample >= CONFIG.GRAPH_CONFIDENCE_LOW_RATIO) {
    const name = breakdown.find((l) => l.tier === "STRUCTURAL")?.language ?? "";
    report.warnings.push(
      `Đồ thị của ${name} được suy luận bằng bộ phân giải phổ quát; cạnh nét đứt có thể chưa chính xác.`,
    );
    return "LOW";
  }
  return "MIXED";
}

function archetypeOf(deps: Set<string>, prod: Set<string>, hasBin: boolean): ProjectArchetype {
  for (const [archetype, packages] of ARCHETYPES) {
    const pool = archetype === "WEB_BACKEND" ? prod : deps;
    if (packages.some((name) => pool.has(name))) {
      return archetype;
    }
  }
  return hasBin ? "CLI_TOOL" : "ALGORITHM_CORE";
}

/**
 * Phiếu lược việc phân loại archetype, nhưng ProjectFingerprint bắt buộc có trường này
 * và prompt AI đọc nó, nên suy từ chính danh sách gói thay vì gán cứng một giá trị sai.
 */
export function buildFingerprint(
  entries: ClassifiedEntry[],
  manifests: Map<string, string>,
  scope: ScopeDecision,
  report: IngestionReport,
  registry: LanguageRegistry = DEFAULT_LANGUAGE_REGISTRY,
  fileLanguage?: Map<string, LanguageId>,
): ProjectFingerprint {
  const offset = scope.root_dir_offset;
  const parsed = parseManifests(manifests, report);
  const local = parsed.filter((m) => inScope(m.path, offset) || dirOf(m.path) === "");
  const deps = new Set(local.flatMap((m) => m.packages));
  const prod = new Set(local.flatMap((m) => m.prod_packages));

  const framework = FRAMEWORKS.find(([name]) =>
    (PROD_ONLY_PACKAGES.has(name) ? prod : deps).has(name),
  );

  const breakdown = languageBreakdown(entries, offset, registry, fileLanguage);
  const primary = breakdown.find((l) => l.tier !== "UNSUPPORTED") ?? breakdown[0];

  return {
    archetype: archetypeOf(deps, prod, local.some((m) => m.has_bin)),
    primary_language: primary?.language ?? "UNKNOWN",
    language_breakdown: breakdown,
    graph_confidence: graphConfidence(breakdown, report),
    detected_framework: framework?.[1] ?? null,
    tech_stack: [...new Set(parsed.flatMap((m) => m.packages))].sort(),
    is_monorepo: scope.is_monorepo,
    root_dir_offset: offset,
  };
}

export function buildModuleInfo(
  manifests: Map<string, string>,
  scope: ScopeDecision,
): IngestOutput["module_info"] {
  const entryFiles = parseManifests(manifests)
    .filter((m) => inScope(m.path, scope.root_dir_offset))
    .flatMap((m) => (m.main === null ? m.bin_paths : [m.main, ...m.bin_paths]));
  return {
    go_module_path: null,
    dart_package_name: null,
    package_entry_files: [...new Set(entryFiles)].sort(),
  };
}

export function unsupportedStats(
  entries: ClassifiedEntry[],
  scope: ScopeDecision,
): { unsupported_ratio: number; top_unsupported: LanguageId | null } {
  const offset = scope.root_dir_offset;
  const source = entries.filter(
    (e) => (e.cls === "CODE" || e.cls === "NO_GRAMMAR") && inScope(e.path, offset),
  );
  const total = source.reduce((sum, e) => sum + e.size, 0);

  const bytes = new Map<LanguageId, number>();
  for (const e of source) {
    if (e.cls === "NO_GRAMMAR" && e.language !== null) {
      bytes.set(e.language, (bytes.get(e.language) ?? 0) + e.size);
    }
  }
  const unsupported = [...bytes.values()].reduce((sum, size) => sum + size, 0);
  const top = [...bytes].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  )[0];

  return {
    unsupported_ratio: total === 0 ? 0 : unsupported / total,
    top_unsupported: top?.[0] ?? null,
  };
}

/** ING-131. entry_count = 0 nghĩa là zip GitHub hợp lệ nhưng không có gì. */
export function assertNotEmpty(
  out: IngestOutput,
  flags: {
    stream_cut: boolean;
    inflated_cap_hit: boolean;
    has_submodules: boolean;
    unsupported_ratio: number;
    top_unsupported: LanguageId | null;
    entry_count?: number;
  },
): void {
  const { code_file_count: fileCount, manifest_count: manifestCount } = out.report;
  const language = flags.top_unsupported ?? "UNKNOWN";

  if (fileCount === 0 && (flags.stream_cut || flags.inflated_cap_hit)) {
    throw new IngestionError("ERR_STREAM_QUOTA_EXCEEDED");
  }
  if (flags.unsupported_ratio > CONFIG.UNSUPPORTED_LANGUAGE_RATIO) {
    throw new IngestionError("ERR_UNSUPPORTED_LANGUAGE", { language });
  }
  if (fileCount > 0) {
    if (flags.unsupported_ratio > 0) {
      out.report.warnings.push(`Repo có code ${language} chưa hỗ trợ, chỉ phân tích phần còn lại.`);
    }
    return;
  }
  if (flags.entry_count === 0) {
    throw new IngestionError("ERR_EMPTY_REPOSITORY");
  }

  let hint = "no_code";
  if (flags.has_submodules) {
    hint = "submodule";
  } else if (flags.unsupported_ratio > 0) {
    hint = "only_unsupported";
  } else if (manifestCount > 0) {
    hint = "only_manifests";
  }
  throw new IngestionError("ERR_NO_SOURCE_FILES_FOUND", { hint });
}

function cleanExcerpt(text: string | null, report: IngestionReport): string | null {
  if (text === null) {
    return null;
  }
  const { code, count } = sanitizeText(text);
  report.redacted_secret_count += count;
  const excerpt = code.slice(0, CONFIG.OVERVIEW_README_MAX_CHARS);
  return excerpt.trim() === "" ? null : excerpt;
}

function pomDescription(text: string): string | null {
  const own = text.replace(
    /<(parent|dependencies|dependencyManagement|build|profiles)>[\s\S]*?<\/\1>/g,
    "",
  );
  return /<description>([\s\S]*?)<\/description>/.exec(own)?.[1].trim() ?? null;
}

function descriptionOf(path: string, text: string): string | null {
  const base = posix.basename(path).toLowerCase();
  if (base === "package.json") {
    const description = readPackageJson(text)?.description;
    return typeof description === "string" ? description.trim() : null;
  }
  return base === "pom.xml" ? pomDescription(text) : null;
}

/** ING-123. Chỉ xét manifest ngay tại offset rồi ở gốc, không lấy mô tả gói con. */
export function buildProjectText(
  readme: string | null,
  manifests: Map<string, string>,
  scope: ScopeDecision,
  report: IngestionReport,
): Pick<IngestOutput, "readme_excerpt" | "manifest_description"> {
  const paths = [...manifests.keys()].sort();
  const ordered = [
    ...paths.filter((path) => dirOf(path) === scope.root_dir_offset),
    ...paths.filter((path) => scope.root_dir_offset !== "" && dirOf(path) === ""),
  ];

  let description: string | null = null;
  for (const path of ordered) {
    const found = descriptionOf(path, manifests.get(path) ?? "");
    if (found) {
      description = found;
      break;
    }
  }

  return {
    readme_excerpt: cleanExcerpt(readme, report),
    manifest_description: cleanExcerpt(description, report),
  };
}

import { posix } from "node:path";
import { CONFIG } from "@/contracts";
import type { IngestionReport, LanguageId } from "@/contracts";
import { KNOWN_NO_GRAMMAR, LANGUAGE_REGISTRY } from "../graph/registry";
import type { ClassifiedEntry, LanguageRegistry, ZipEntryMeta } from "./types";

const JUNK_DIRS = new Set([
  "node_modules", "dist", "build", "out", "coverage", "vendor", "venv", "env",
  "__pycache__", "target", "obj", "pods", "__macosx",
]);

const JUNK_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".mp4", ".mov", ".mp3", ".wav",
  ".pdf", ".zip", ".gz", ".jar", ".exe", ".dll", ".so", ".woff", ".woff2", ".ttf", ".psd",
  ".class", ".pyc",
]);

const GENERATED_RE =
  /(\.min\.(js|css)|\.d\.ts|\.map|\.lock|-lock\.json|\.pb\.go|_pb2\.py|\.generated\.\w+|\.g\.dart|\.freezed\.dart)$/i;

const README_RE = /^readme(\.(md|rst|txt))?$/i;

const EXTRA_MANIFESTS = [
  "package.json", "tsconfig.json", "jsconfig.json", "requirements.txt", "pyproject.toml",
  "setup.py", "Pipfile", "pom.xml", "build.gradle", "build.gradle.kts", "go.mod",
  "pubspec.yaml", "Cargo.toml", "composer.json", "Gemfile", "schema.prisma",
];

function buildExtensionMap(): Record<string, LanguageId> {
  const map: Record<string, LanguageId> = { ...KNOWN_NO_GRAMMAR };
  for (const adapter of LANGUAGE_REGISTRY) {
    for (const extension of adapter.extensions) {
      map[extension] = adapter.id;
    }
  }
  return map;
}

export const DEFAULT_LANGUAGE_REGISTRY: LanguageRegistry = {
  by_extension: buildExtensionMap(),
  with_grammar: LANGUAGE_REGISTRY.map((adapter) => adapter.id),
  manifest_files: [
    ...new Set([...LANGUAGE_REGISTRY.flatMap((adapter) => adapter.manifest_files), ...EXTRA_MANIFESTS]),
  ],
};

/** ING-70 đến ING-77, luật đầu tiên khớp thắng. Phiếu TH-09 bỏ thêm mọi thư mục ẩn. */
export function classifyEntry(
  e: ZipEntryMeta,
  registry: LanguageRegistry = DEFAULT_LANGUAGE_REGISTRY,
  report?: IngestionReport,
): ClassifiedEntry {
  const skip = (reason: ClassifiedEntry["skip_reason"]): ClassifiedEntry => {
    if (reason !== null && report) {
      report.skipped[reason]++;
    }
    return { ...e, cls: "SKIP", language: null, skip_reason: reason };
  };
  const keep = (cls: ClassifiedEntry["cls"], language: LanguageId | null): ClassifiedEntry => ({
    ...e,
    cls,
    language,
    skip_reason: null,
  });

  if (e.is_dir || e.is_symlink) {
    return skip("garbage");
  }
  if (e.is_encrypted || (e.method !== 0 && e.method !== 8)) {
    return skip("binary");
  }

  const segments = e.path.split("/");
  const base = segments[segments.length - 1];
  const dirs = segments.slice(0, -1).map((segment) => segment.toLowerCase());
  const extension = posix.extname(base).toLowerCase();
  const language = registry.by_extension[extension] ?? null;

  if (dirs.some((dir) => JUNK_DIRS.has(dir) || dir.startsWith("."))) {
    return skip("garbage");
  }
  if (dirs.includes("bin") && language === null) {
    return skip("garbage");
  }
  if (GENERATED_RE.test(base) || JUNK_EXTENSIONS.has(extension)) {
    return skip("garbage");
  }

  const lowerBase = base.toLowerCase();
  const isManifest = registry.manifest_files.some((name) => name.toLowerCase() === lowerBase);
  if (isManifest && dirs.length <= CONFIG.MAX_MANIFEST_DEPTH) {
    return keep("MANIFEST", null);
  }
  if (README_RE.test(base)) {
    return keep("README", null);
  }
  if (language === null) {
    return skip(null);
  }
  if (registry.with_grammar.includes(language)) {
    return keep("CODE", language);
  }

  if (report) {
    report.skipped.unsupported_lang++;
  }
  return keep("NO_GRAMMAR", language);
}

import type { IngestOutput, IngestSource, IngestionReport, LanguageId } from "@/contracts";
import { downloadArchive } from "./download";
import {
  assertNotEmpty,
  buildFingerprint,
  buildModuleInfo,
  buildProjectText,
  detectScope,
  unsupportedStats,
} from "./fingerprint";
import { selectFiles } from "./priority";
import { probeErrorCode, probeRepo } from "./probe";
import { DEFAULT_LANGUAGE_REGISTRY, classifyEntry } from "./prune";
import { hasInjectionText, sanitizeText } from "./secrets";
import { computeSnapshot } from "./snapshot";
import { IngestionError, type RawArchive } from "./types";
import { inflateSelected, listEntries } from "./unzip";
import { parseGithubUrl } from "./url";

interface Acquired {
  archive: RawArchive;
  repo_name: string;
  repo_key: string;
  ref: string | null;
  ref_label: string | null;
  explicit_subdir: string;
}

function emptyReport(): IngestionReport {
  return {
    truncated: false,
    selective_fetch: false,
    code_file_count: 0,
    manifest_count: 0,
    omitted_node_count: 0,
    skipped: { garbage: 0, binary: 0, oversized: 0, unsupported_lang: 0, quota: 0, parse_error: 0 },
    warnings: [],
    degraded_mode: null,
    redacted_secret_count: 0,
    engine_ms: 0,
    ingest_ms: 0,
    suspicious_instruction_files: [],
  };
}

async function acquire(src: IngestSource, signal?: AbortSignal): Promise<Acquired> {
  if (src.kind === "ZIP_UPLOAD") {
    return {
      archive: { bytes: src.bytes, stream_cut: false, source_url: "" },
      repo_name: src.file_name.replace(/\.zip$/i, ""),
      repo_key: src.file_name,
      ref: null,
      ref_label: null,
      explicit_subdir: src.subdir_override ?? "",
    };
  }

  if (src.kind === "GITHUB_COMMIT") {
    const url = `https://codeload.github.com/${src.owner}/${src.repo}/zip/${src.sha}`;
    return {
      archive: await downloadArchive(url, signal),
      repo_name: src.repo,
      repo_key: `${src.owner}/${src.repo}`.toLowerCase(),
      ref: src.sha,
      ref_label: null,
      explicit_subdir: src.subdir,
    };
  }

  const info = parseGithubUrl(src.repo_url);
  const probe = await probeRepo(info);
  const failure = probeErrorCode(probe.result);
  if (failure !== null) {
    throw new IngestionError(failure);
  }
  if (probe.download_url === null) {
    throw new IngestionError("ERR_PREFLIGHT_404_OR_PRIVATE");
  }
  return {
    archive: await downloadArchive(probe.download_url, signal),
    repo_name: probe.repo,
    repo_key: `${probe.owner}/${probe.repo}`.toLowerCase(),
    ref: probe.ref,
    ref_label: probe.default_branch,
    explicit_subdir: src.subdir_override ?? "",
  };
}

function countNewlines(text: string): number {
  return text.split("\n").length - 1;
}

/** Map chèn path tăng dần (ING-02). Lệch số dòng thì bỏ file, không giữ bản chưa che. */
function sanitizeCode(raw: Map<string, string>, report: IngestionReport): Map<string, string> {
  const code = new Map<string, string>();
  for (const path of [...raw.keys()].sort()) {
    const original = raw.get(path) ?? "";
    const clean = sanitizeText(original);
    if (countNewlines(clean.code) !== countNewlines(original)) {
      report.warnings.push(`Bỏ qua ${path} vì không che được dữ liệu nhạy cảm an toàn.`);
      continue;
    }
    report.redacted_secret_count += clean.count;
    if (hasInjectionText(clean.code)) {
      report.suspicious_instruction_files.push(path);
    }
    code.set(path, clean.code);
  }
  return code;
}

/**
 * `autoScope`: link hoặc zip không chọn thư mục ⇒ tự chọn thư mục backend (ING-80).
 * Dựng lại phiên (`GITHUB_COMMIT`) luôn theo đúng `subdir` đã lưu, không tự chọn lại.
 */
export async function runIngest(
  src: IngestSource,
  signal?: AbortSignal,
  options: { autoScope?: boolean } = {},
): Promise<IngestOutput> {
  const startedAt = performance.now();
  signal?.throwIfAborted();
  const report = emptyReport();

  const acquired = await acquire(src, signal);
  const { archive } = acquired;
  const baseSnapshot = computeSnapshot(archive, {
    repo_key: acquired.repo_key,
    ref: acquired.ref,
    ref_label: acquired.ref_label,
    explicit_subdir: acquired.explicit_subdir,
  });
  if (
    baseSnapshot.source === "GITHUB" &&
    baseSnapshot.snapshot_id_kind === "ARCHIVE_HASH" &&
    !archive.stream_cut
  ) {
    report.warnings.push("Không đọc được commit của repo, phiên học gắn theo mã băm của tệp zip.");
  }

  const listed = listEntries(archive, signal, report);
  const entries = listed.map((e) => classifyEntry(e, DEFAULT_LANGUAGE_REGISTRY, report));
  const autoScope = src.kind !== "GITHUB_COMMIT" && options.autoScope !== false;
  const scope = detectScope(entries, acquired.explicit_subdir, report, autoScope);
  const plan = selectFiles(entries, scope, report);

  const inflated = inflateSelected(archive.bytes, plan, report, signal);
  const code = sanitizeCode(inflated.code, report);

  const languages = new Map(entries.map((e) => [e.path, e.language]));
  const fileLanguage = new Map<string, LanguageId>();
  for (const path of code.keys()) {
    fileLanguage.set(path, languages.get(path) ?? "UNKNOWN");
  }

  report.code_file_count = code.size;
  report.manifest_count = inflated.manifests.size;
  report.truncated = archive.stream_cut || inflated.inflated_cap_hit || report.skipped.quota > 0;
  if (report.truncated) {
    report.warnings.push(`Repository lớn — chỉ phân tích ${code.size} tệp mã nguồn được ưu tiên.`);
  }

  const fingerprint = buildFingerprint(entries, inflated.manifests, scope, report);
  const text = buildProjectText(inflated.readme, inflated.manifests, scope, report);

  const out: IngestOutput = {
    repo_name: acquired.repo_name,
    snapshot: { ...baseSnapshot, subdir: scope.root_dir_offset },
    fingerprint,
    report,
    code,
    file_language: fileLanguage,
    manifests: inflated.manifests,
    source_map: new Map(),
    module_info: buildModuleInfo(inflated.manifests, scope),
    ...text,
  };

  assertNotEmpty(out, {
    stream_cut: archive.stream_cut,
    inflated_cap_hit: inflated.inflated_cap_hit,
    has_submodules: entries.some((e) => e.path === ".gitmodules"),
    entry_count: listed.length,
    ...unsupportedStats(entries, scope),
  });

  report.suspicious_instruction_files.sort();
  report.ingest_ms = Math.round(performance.now() - startedAt);
  return out;
}

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { IngestOutput, IngestionReport, LanguageAdapter, LanguageId } from "@/contracts";
import { buildGraph } from "@/server/engine/graph";
import { LANGUAGE_REGISTRY } from "@/server/engine/graph/registry";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  "coverage",
  ".kb",
]);

function getLanguageForFile(filePath: string): LanguageAdapter | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_REGISTRY.find((adapter) =>
    adapter.extensions.some((e) => e.toLowerCase() === ext)
  );
}

async function collectFiles(baseDir: string, currentDir: string = baseDir): Promise<string[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        const subFiles = await collectFiles(baseDir, path.join(currentDir, entry.name));
        files.push(...subFiles);
      }
    } else if (entry.isFile()) {
      files.push(path.join(currentDir, entry.name));
    }
  }

  return files;
}

async function main(): Promise<void> {
  const targetDir = process.argv[2];
  if (!targetDir) {
    console.log("Cách dùng: npx tsx scripts/chay-engine.ts <thư-mục>");
    process.exitCode = 1;
    return;
  }

  const resolvedBaseDir = path.resolve(targetDir);
  const filePaths = await collectFiles(resolvedBaseDir);

  const code = new Map<string, string>();
  const langs = new Map<string, LanguageId>();
  const manifests = new Map<string, string>();

  for (const absFilePath of filePaths) {
    const relPosixPath = path
      .relative(resolvedBaseDir, absFilePath)
      .split(path.sep)
      .join("/");

    const baseName = path.basename(absFilePath);
    if (
      baseName === "tsconfig.json" ||
      baseName === "jsconfig.json" ||
      baseName === "package.json"
    ) {
      const content = await fs.readFile(absFilePath, "utf8");
      manifests.set(relPosixPath, content);
    }

    const adapter = getLanguageForFile(absFilePath);
    if (!adapter) {
      continue;
    }

    const content = await fs.readFile(absFilePath, "utf8");
    code.set(relPosixPath, content);
    langs.set(relPosixPath, adapter.id);
  }

  const techStack: string[] = [];
  for (const manifestContent of manifests.values()) {
    try {
      const pkg = JSON.parse(manifestContent);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const dep of Object.keys(deps)) {
        techStack.push(dep.toLowerCase());
      }
    } catch {
      // Bỏ qua lỗi parse JSON
    }
  }

  const report: IngestionReport = {
    truncated: false,
    selective_fetch: false,
    code_file_count: code.size,
    manifest_count: manifests.size,
    omitted_node_count: 0,
    skipped: {
      garbage: 0,
      binary: 0,
      oversized: 0,
      unsupported_lang: 0,
      quota: 0,
      parse_error: 0,
    },
    warnings: [],
    degraded_mode: null,
    redacted_secret_count: 0,
    engine_ms: 0,
    ingest_ms: 0,
    suspicious_instruction_files: [],
  };

  const input: IngestOutput = {
    repo_name: path.basename(resolvedBaseDir),
    snapshot: {
      source: "ZIP",
      repo_key: path.basename(resolvedBaseDir),
      snapshot_id: "local",
      snapshot_id_kind: "ARCHIVE_HASH",
      subdir: "",
      ref_label: null,
    },
    fingerprint: {
      archetype: "WEB_BACKEND",
      primary_language: "TYPESCRIPT",
      language_breakdown: [],
      graph_confidence: "HIGH",
      detected_framework: techStack.includes("express") ? "Express" : null,
      tech_stack: techStack,
      is_monorepo: false,
      root_dir_offset: "",
    },
    report,
    code,
    file_language: langs,
    manifests,
    source_map: new Map(),
    module_info: {
      go_module_path: null,
      dart_package_name: null,
      package_entry_files: [],
    },
    readme_excerpt: null,
    manifest_description: null,
  };

  const result = await buildGraph(input);

  console.log(`Số bài: ${result.nodes.length}`);
  console.log(`Số cạnh: ${result.edges.length}`);
  console.log(`Số nhóm: ${result.groups.length}`);
  console.log(`engine_ms: ${result.ingestion_report.engine_ms}`);

  for (const node of result.nodes) {
    const stepCount = node.trace_steps.length;
    const prereqStr = node.prerequisites.length > 0 ? node.prerequisites.join(", ") : "không có";
    console.log(`- ${node.title} | ${stepCount} bước | prerequisites: [${prereqStr}]`);
  }
}

main().catch((err) => {
  console.error("Lỗi khi chạy engine:", err);
  process.exitCode = 1;
});

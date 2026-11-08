import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Language, Parser, Query } from "web-tree-sitter";
import type { Node } from "web-tree-sitter";
import { CONFIG } from "@/contracts";
import type { IngestionReport, LanguageId } from "@/contracts";
import { getAdapter, LANGUAGE_REGISTRY, tierOf } from "./registry";
import type { ParsedFile } from "./types";

const languages = new Map<LanguageId, Language>();
const queries = new Map<LanguageId, Query>();
let initPromise: Promise<void> | null = null;

export function initParsers(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      await Parser.init();
      for (const adapter of LANGUAGE_REGISTRY) {
        const wasmPath = path.join(process.cwd(), "public/grammars", adapter.wasm_grammar);
        const wasmBytes = await fs.readFile(wasmPath);
        const language = await Language.load(wasmBytes);
        languages.set(adapter.id, language);

        const queryPath = path.join(process.cwd(), adapter.query_file);
        const querySource = await fs.readFile(queryPath, "utf8");
        const query = new Query(language, querySource);
        queries.set(adapter.id, query);
      }
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

export function getLanguage(id: LanguageId): Language {
  const language = languages.get(id);
  if (!language) {
    throw new Error(`Language ${id} has not been initialized. Call initParsers() first.`);
  }
  return language;
}

export function getQuery(id: LanguageId): Query {
  const query = queries.get(id);
  if (!query) {
    throw new Error(`Query for ${id} has not been initialized. Call initParsers() first.`);
  }
  return query;
}

export function createParser(id: LanguageId): Parser {
  const language = getLanguage(id);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

function calculateErrorBytes(node: Node): number {
  if (!node.hasError) {
    return 0;
  }
  if (node.isError || node.type === "ERROR") {
    return node.endIndex - node.startIndex;
  }
  let total = 0;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      total += calculateErrorBytes(child);
    }
  }
  return total;
}

export async function parseAll(
  code: Map<string, string>,
  langs: Map<string, LanguageId>,
  report: IngestionReport
): Promise<ParsedFile[]> {
  await initParsers();

  const results: ParsedFile[] = [];
  const parsers = new Map<LanguageId, Parser>();

  try {
    const sortedPaths = [...code.keys()].sort();
    for (const filePath of sortedPaths) {
      const langId = langs.get(filePath);
      if (!langId) {
        continue;
      }

      const adapter = getAdapter(langId);
      if (!adapter) {
        // File có langs không nằm trong registry thì bỏ qua, không tính lỗi
        continue;
      }

      let parser = parsers.get(langId);
      if (!parser) {
        parser = createParser(langId);
        parsers.set(langId, parser);
      }

      const source = code.get(filePath) ?? "";

      try {
        const tree = parser.parse(source);
        if (!tree) {
          report.skipped.parse_error += 1;
          report.warnings.push(`File ${filePath} có cú pháp không phân tích được`);
          continue;
        }

        const errorBytes = calculateErrorBytes(tree.rootNode);
        const ratio = source.length === 0 ? 0 : errorBytes / source.length;

        if (ratio > CONFIG.PARSE_ERROR_RATIO_MAX) {
          tree.delete();
          report.skipped.parse_error += 1;
          report.warnings.push(`File ${filePath} có cú pháp không phân tích được`);
          continue;
        }

        results.push({
          path: filePath,
          language: langId,
          tier: tierOf(adapter),
          tree,
          source,
        });
      } catch {
        // Một file lỗi không được làm hỏng cả lần quét
        report.skipped.parse_error += 1;
        report.warnings.push(`File ${filePath} có cú pháp không phân tích được`);
      }
    }
  } finally {
    for (const parser of parsers.values()) {
      parser.delete();
    }
  }

  return results;
}

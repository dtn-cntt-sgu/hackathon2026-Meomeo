import type { Node } from "web-tree-sitter";
import { CONFIG } from "@/contracts";
import type { ArchitecturalLayer, ExecutionTraceStep, StepBranch } from "@/contracts";
import { findFunctionNode } from "./complexity";
import { hash6, nameCandidate, slug } from "./naming";
import { getAdapter } from "./registry";
import { CALL_TYPES, selectLines } from "./slice-lines";
import type {
  CallSite,
  Candidate,
  EngineContext,
  EntryPoint,
  ExternalCall,
  FunctionInfo,
  ParsedFile,
} from "./types";

export function isDataSinkCall(call: ExternalCall, techStack: string[]): boolean {
  // ENT-41: Java đã xác định theo kiểu receiver.
  if (call.is_data_sink) {
    return true;
  }
  const method = call.method;
  const isSinkMethod =
    method === "save" ||
    method === "remove" ||
    method === "create" ||
    method === "upsert" ||
    method === "query" ||
    method === "execute" ||
    method === "exec" ||
    method === "aggregate" ||
    method === "count" ||
    method === "get" ||
    method === "add" ||
    method === "commit" ||
    method.startsWith("insert") ||
    method.startsWith("update") ||
    method.startsWith("delete") ||
    method.startsWith("find");

  if (!isSinkMethod) {
    return false;
  }

  // (a) Receiver matches regex or contains prisma, tx, trx
  const receiverNoThis = call.receiver_chain.filter((s) => s !== "this").join(".");
  const lastSegment = call.receiver_chain[call.receiver_chain.length - 1] ?? "";
  const receiverRegex =
    /(repository|repo|model|dao|entity|db|database|prisma|knex|pool|conn|connection|client|session|cursor|collection|datasource|manager|tx|trx|jdbcTemplate)$/i;

  const hasPrismaTx = /(^|\.)(prisma|tx|trx)(\.|$)/i.test(receiverNoThis);

  if (receiverRegex.test(lastSegment) || hasPrismaTx) {
    return true;
  }

  // (b) Import source matches data sink library
  const DATA_SINK_IMPORTS = new Set([
    "pg",
    "mysql",
    "mysql2",
    "mongodb",
    "mongoose",
    "sequelize",
    "typeorm",
    "@prisma/client",
    "sqlite3",
    "better-sqlite3",
    "redis",
    "ioredis",
    "knex",
    "sqlalchemy",
    "psycopg2",
    "pymongo",
    "database/sql",
    "gorm.io/gorm",
  ]);
  if (call.import_source && DATA_SINK_IMPORTS.has(call.import_source)) {
    return true;
  }

  // (c) Uppercase receiver + method in (a) when tech_stack has mongoose/sequelize/typeorm
  const firstSeg = call.receiver_chain[0] ?? "";
  const isUppercaseReceiver =
    firstSeg.length > 0 && firstSeg[0] >= "A" && firstSeg[0] <= "Z";
  const hasOrmTech = techStack.some((t) => {
    const tl = t.toLowerCase();
    return tl === "mongoose" || tl === "sequelize" || tl === "typeorm";
  });
  if (isUppercaseReceiver && hasOrmTech) {
    return true;
  }

  return false;
}

export function isDataAccessFile(filePath: string): boolean {
  const DATA_ACCESS_NAMES = new Set([
    "repository",
    "repositories",
    "repo",
    "repos",
    "dao",
    "daos",
    "model",
    "models",
    "entity",
    "entities",
  ]);

  const segs = filePath.split("/");
  for (let i = 0; i < segs.length - 1; i++) {
    if (DATA_ACCESS_NAMES.has(segs[i].toLowerCase())) {
      return true;
    }
  }

  const baseName = segs[segs.length - 1] ?? "";
  const stem = baseName.replace(/\.[^.]+$/, "");
  const stemTokens = stem
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean);

  const lastToken = stemTokens[stemTokens.length - 1]?.toLowerCase() ?? "";
  if (DATA_ACCESS_NAMES.has(lastToken)) {
    return true;
  }

  return false;
}

function commonPrefixLength(a: string, b: string): number {
  let len = 0;
  const minLen = Math.min(a.length, b.length);
  while (len < minLen && a[len] === b[len]) {
    len++;
  }
  return len;
}

function resolveCallSiteAmbiguity(
  callerFile: string,
  callSites: CallSite[]
): CallSite | null {
  if (callSites.length === 0) {
    return null;
  }
  if (callSites.length === 1) {
    return callSites[0];
  }

  let best = callSites[0];
  let bestPrefix = commonPrefixLength(callerFile, best.callee.split("#")[0] ?? "");

  for (let i = 1; i < callSites.length; i++) {
    const curr = callSites[i];
    const currPrefix = commonPrefixLength(callerFile, curr.callee.split("#")[0] ?? "");
    if (currPrefix > bestPrefix) {
      best = curr;
      bestPrefix = currPrefix;
    } else if (currPrefix === bestPrefix) {
      if (curr.callee < best.callee) {
        best = curr;
      }
    }
  }

  return best;
}

interface Reached {
  key: string;
  hop: number;
  parent: string | null;
}

type KeepCallee = (callee: string, caller: string) => boolean;

function isModuleKey(key: string): boolean {
  return key.endsWith("#<module>");
}

function resolvedSitesOf(callerKey: string, ctx: EngineContext): CallSite[] {
  const callerFile = callerKey.split("#")[0] ?? "";
  const grouped = new Map<string, CallSite[]>();
  for (const site of ctx.call_sites.get(callerKey) ?? []) {
    const siteKey = `${site.line}:${site.column}`;
    const list = grouped.get(siteKey);
    if (list) {
      list.push(site);
    } else {
      grouped.set(siteKey, [site]);
    }
  }

  const resolved: CallSite[] = [];
  for (const list of grouped.values()) {
    const chosen = resolveCallSiteAmbiguity(callerFile, list);
    if (chosen) {
      resolved.push(chosen);
    }
  }

  return resolved.sort((a, b) => {
    // ENG-80: `wrap(load())` chạy load trước, nên xếp theo chỗ kết thúc, không theo chỗ bắt đầu.
    if (a.end_index !== b.end_index) return a.end_index - b.end_index;
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return a.callee < b.callee ? -1 : a.callee > b.callee ? 1 : 0;
  });
}

// ENG-80: entry (hop 0) ⇒ middleware (hop 1) kèm hàm nó gọi ⇒ hàm entry gọi.
function collectFunctions(
  entry: EntryPoint,
  ctx: EngineContext,
  helpers?: Set<string>,
  keepCallee?: KeepCallee
): Reached[] {
  const reached = new Map<string, Reached>();

  const add = (key: string, hop: number, parent: string | null): void => {
    reached.set(key, { key, hop, parent });
  };

  const dfs = (callerKey: string, hop: number): void => {
    if (hop >= CONFIG.SLICE_MAX_HOPS) {
      return;
    }
    for (const site of resolvedSitesOf(callerKey, ctx)) {
      const callee = site.callee;
      if (
        reached.has(callee) ||
        helpers?.has(callee) ||
        isModuleKey(callee) ||
        !ctx.index.functions.has(callee) ||
        (keepCallee && !keepCallee(callee, callerKey))
      ) {
        continue;
      }
      add(callee, hop + 1, callerKey);
      dfs(callee, hop + 1);
    }
  };

  add(entry.key, 0, null);
  for (const mw of entry.binding?.middlewares ?? []) {
    if (!reached.has(mw) && ctx.index.functions.has(mw)) {
      add(mw, 1, entry.key);
      dfs(mw, 1);
    }
  }
  dfs(entry.key, 0);

  return [...reached.values()];
}

function hasDataSinkInSubtree(
  fnKey: string,
  ctx: EngineContext,
  techStack: string[],
  visited: Set<string>
): boolean {
  if (visited.has(fnKey)) {
    return false;
  }
  visited.add(fnKey);

  if ((ctx.external_calls.get(fnKey) ?? []).some((c) => isDataSinkCall(c, techStack))) {
    return true;
  }
  return (ctx.call_sites.get(fnKey) ?? []).some((site) =>
    hasDataSinkInSubtree(site.callee, ctx, techStack, visited)
  );
}

export function findSharedHelpers(
  entries: EntryPoint[],
  ctx: EngineContext
): Set<string> {
  const helpers = new Set<string>();
  if (entries.length < 3) {
    return helpers;
  }

  const protectedKeys = new Set(entries.map((e) => e.key));
  for (const e of entries) {
    for (const mw of e.binding?.middlewares ?? []) {
      protectedKeys.add(mw);
    }
  }

  // D-87 đếm trước ENG-81, ENG-88.
  const sliceCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const { key } of collectFunctions(entry, ctx)) {
      sliceCounts.set(key, (sliceCounts.get(key) ?? 0) + 1);
    }
  }

  const techStack = ctx.input.fingerprint.tech_stack;
  const minSlices = Math.max(3, Math.ceil(0.5 * entries.length));
  for (const [fnKey, count] of sliceCounts) {
    if (
      count >= minSlices &&
      !protectedKeys.has(fnKey) &&
      !hasDataSinkInSubtree(fnKey, ctx, techStack, new Set())
    ) {
      helpers.add(fnKey);
    }
  }

  return helpers;
}

const OUTPUT_METHODS = new Set(["json", "send", "status", "render", "redirect", "end", "sendStatus"]);
const SILENT_ROOTS = new Set(["console", "logger", "logging"]);

function isOutputCall(call: ExternalCall): boolean {
  const root = call.receiver_chain[0] ?? "";
  if (SILENT_ROOTS.has(root)) {
    return false;
  }
  if (root === "res") {
    return OUTPUT_METHODS.has(call.method) || call.receiver_chain.length > 1;
  }
  if (root === "reply") {
    return call.method === "send";
  }
  if (root === "axios") {
    return true;
  }
  if (call.receiver_chain.length === 0) {
    return (
      call.method === "next" ||
      call.method === "print" ||
      call.method === "fetch" ||
      /^set[A-Z]/.test(call.method) ||
      call.method === "setState"
    );
  }
  return false;
}

function fileOf(ctx: EngineContext, path: string): ParsedFile | undefined {
  return ctx.files.find((f) => f.path === path);
}

function nodeOfFunction(ctx: EngineContext, fn: FunctionInfo): Node | null {
  const file = fileOf(ctx, fn.file_path);
  return file ? findFunctionNode(file, fn.line_start, fn.line_end) : null;
}

function hasThrow(ctx: EngineContext, fn: FunctionInfo): boolean {
  const body = nodeOfFunction(ctx, fn)?.childForFieldName("body");
  return (body?.descendantsOfType("throw_statement").length ?? 0) > 0;
}

// ENG-81: lời gọi được dùng khi giá trị không bị bỏ đi ở câu lệnh đứng riêng.
function isValueUsed(ctx: EngineContext, caller: string, callee: string): boolean {
  const callerFn = ctx.index.functions.get(caller);
  const file = callerFn ? fileOf(ctx, callerFn.file_path) : undefined;
  if (!file) {
    return false;
  }

  for (const site of ctx.call_sites.get(caller) ?? []) {
    if (site.callee !== callee) {
      continue;
    }
    let node: Node | null = file.tree.rootNode.descendantForPosition({
      row: site.line - 1,
      column: site.column - 1,
    });
    while (node && !CALL_TYPES.has(node.type)) {
      node = node.parent;
    }
    let parent: Node | null = node?.parent ?? null;
    while (parent && (parent.type === "await_expression" || parent.type === "parenthesized_expression")) {
      parent = parent.parent;
    }
    if (parent && parent.type !== "expression_statement" && parent.type !== "throw_statement") {
      return true;
    }
  }
  return false;
}

interface Criterion {
  fnKey: string;
  line: number;
}

function findCriterion(
  steps: Reached[],
  entryKey: string,
  ctx: EngineContext,
  techStack: string[]
): Criterion | null {
  for (const { key } of steps) {
    const sinks = (ctx.external_calls.get(key) ?? [])
      .filter((c) => isDataSinkCall(c, techStack))
      .sort((a, b) => a.line - b.line);
    if (sinks.length > 0) {
      return { fnKey: key, line: sinks[0].line };
    }
  }

  const outputs = (ctx.external_calls.get(entryKey) ?? []).filter(isOutputCall);
  if (outputs.length > 0) {
    return { fnKey: entryKey, line: Math.max(...outputs.map((c) => c.line)) };
  }

  const entryFn = ctx.index.functions.get(entryKey);
  if (!entryFn) {
    return null;
  }
  const returns =
    nodeOfFunction(ctx, entryFn)
      ?.childForFieldName("body")
      ?.descendantsOfType("return_statement") ?? [];
  const lastReturn = returns.reduce<number | null>((last, n) => {
    const row = n ? n.startPosition.row + 1 : null;
    return row !== null && (last === null || row > last) ? row : last;
  }, null);
  return { fnKey: entryKey, line: lastReturn ?? entryFn.line_end };
}

function keyName(key: string): string {
  return key.slice(key.indexOf("#") + 1).replace(/~\d+$/, "");
}

const DTO_SUFFIX = /(Dto|DTO|Request|Response|Input|Payload|Schema|Model|Entity)$/;

function isDtoSymbol(kind: string, name: string): boolean {
  if (kind === "INTERFACE" || kind === "TYPE") {
    return true;
  }
  return (kind === "CLASS" || kind === "VARIABLE") && DTO_SUFFIX.test(name);
}

function findDtoSnippet(
  keptTexts: string[],
  ctx: EngineContext,
  stepClasses: Set<string>
): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const text of keptTexts) {
    for (const name of text.match(/\b[A-Z][A-Za-z0-9_$]*\b/g) ?? []) {
      if (seen.has(name) || stepClasses.has(name)) {
        continue;
      }
      seen.add(name);

      const sym = [...ctx.index.symbols.values()]
        .filter((s) => s.name === name && isDtoSymbol(s.kind, s.name))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))[0];
      if (!sym) {
        continue;
      }

      const source = (ctx.input.code.get(sym.file_path) ?? "").split("\n");
      lines.push(...source.slice(sym.line_start - 1, sym.line_end));
    }
  }

  if (lines.length <= CONFIG.STEP_MAX_LINES) {
    return lines.join("\n");
  }
  return [...lines.slice(0, CONFIG.STEP_MAX_LINES - 1), "// … (lược bớt kiểu dữ liệu)"].join("\n");
}

interface DraftStep {
  reached: Reached;
  layer: ArchitecturalLayer;
  filePath: string;
  functionName: string;
  lines: string[];
  lineMap: number[];
  signatureCount: number;
  milestone: number;
  anchorRows: number[];
  commentPrefix: string;
  window: number;
}

function markerFor(indentSource: string, commentPrefix: string, count: number): string {
  const indent = /^\s*/.exec(indentSource)?.[0] ?? "";
  return `${indent}${commentPrefix} … (${count} dòng)`;
}

// ENG-86: nối dòng giữ, mỗi đoạn bỏ thành 1 marker, dòng rỗng không tính.
function elide(
  kept: Set<number>,
  source: string[],
  commentPrefix: string
): { lines: string[]; lineMap: number[] } {
  const rows = [...kept].sort((a, b) => a - b);
  const lines: string[] = [];
  const lineMap: number[] = [];

  rows.forEach((row, i) => {
    if (i > 0) {
      const omitted = source.slice(rows[i - 1], row - 1).filter((l) => l.trim().length > 0);
      if (omitted.length > 0) {
        lines.push(markerFor(omitted[0], commentPrefix, omitted.length));
        lineMap.push(0);
      }
    }
    lines.push(source[row - 1] ?? "");
    lineMap.push(row);
  });

  return { lines, lineMap };
}

function indentOf(line: string): number {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}

// Lệnh nhiều dòng: tìm dòng đóng để snippet không hở ngoặc quanh marker.
function closingIndexOf(step: DraftStep, index: number, closing: number): number | null {
  const { lines, lineMap } = step;
  if (!/[({[]\s*$/.test(lines[index])) {
    return null;
  }
  for (let i = index + 1; i < closing; i++) {
    if (lineMap[i] !== 0 && lines[i].trim() && indentOf(lines[i]) <= indentOf(lines[index])) {
      return i;
    }
  }
  return null;
}

function lastReturnIndex(step: DraftStep, closing: number): number {
  for (let i = closing - 1; i >= 0; i--) {
    if (step.lineMap[i] !== 0 && /^\s*return\b/.test(step.lines[i])) {
      return i;
    }
  }
  return -1;
}

// ENG-87: giữ mốc, rồi dòng dẫn sang bước sau và lệnh dữ liệu, rồi return cuối, phần
// còn lại lấp quanh mốc. Một cửa sổ liền có thể giấu chính các dòng này.
function pickIndexes(
  step: DraftStep,
  signature: number,
  closing: number,
  size: number,
  milestoneIndex: number
): number[] {
  const picked = new Set<number>();
  const cost = (candidate: Set<number>): number => {
    const sorted = [...candidate].sort((a, b) => a - b);
    let gaps = 0;
    let next = signature;
    for (const index of sorted) {
      gaps += index > next ? 1 : 0;
      next = index + 1;
    }
    return sorted.length + gaps + (next < closing ? 1 : 0);
  };
  const tryAdd = (indexes: number[]): boolean => {
    const candidate = new Set([...picked, ...indexes]);
    if (cost(candidate) > size + 2) {
      return false;
    }
    indexes.forEach((index) => picked.add(index));
    return true;
  };

  const anchors = [
    milestoneIndex,
    ...step.anchorRows.map((row) => step.lineMap.indexOf(row)),
    lastReturnIndex(step, closing),
  ].filter((index) => index >= signature && index < closing);

  for (const index of anchors) {
    const close = closingIndexOf(step, index, closing);
    if (close === null || !tryAdd([index, close])) {
      tryAdd([index]);
    }
  }

  let left = milestoneIndex - 1;
  let right = milestoneIndex + 1;
  while (left >= signature || right < closing) {
    if (right < closing) {
      right = tryAdd([right]) ? right + 1 : closing;
    }
    if (left >= signature) {
      left = tryAdd([left]) ? left - 1 : signature - 1;
    }
  }

  // Marker cũ sát chỗ cắt sẽ thành 2 marker liền nhau, chỗ cắt đã tính cả phần của nó.
  return [...picked]
    .filter((index) => {
      const shown = (i: number): boolean => i < signature || i >= closing || picked.has(i);
      return step.lineMap[index] !== 0 || (shown(index - 1) && shown(index + 1));
    })
    .sort((a, b) => a - b);
}

function renderStep(step: DraftStep): { lines: string[]; lineMap: number[] } {
  const { lines, lineMap, commentPrefix, window } = step;
  if (lines.length <= CONFIG.STEP_MAX_LINES && window >= CONFIG.CLAMP_WINDOW_LINES) {
    return { lines, lineMap };
  }

  const closing = lines.length - 1;
  let signature = step.signatureCount;
  if (signature > closing) {
    return { lines, lineMap };
  }
  let size = Math.min(window, CONFIG.STEP_MAX_LINES - signature - 1 - 2);
  if (size < 1) {
    signature = 1;
    size = Math.max(1, Math.min(window, CONFIG.STEP_MAX_LINES - signature - 1 - 2));
  }

  const found = lineMap.indexOf(step.milestone);
  const milestoneIndex = Math.min(Math.max(found, signature), Math.max(signature, closing - 1));

  const outLines = lines.slice(0, signature);
  const outMap = lineMap.slice(0, signature);

  const pushMarker = (from: number, to: number): void => {
    if (to <= from) {
      return;
    }
    const count = lines.slice(from, to).reduce((sum, line, i) => {
      const inner = lineMap[from + i] === 0 ? /\((\d+) dòng\)$/.exec(line)?.[1] : undefined;
      return sum + Number(inner ?? 1);
    }, 0);
    outLines.push(markerFor(lines[from], commentPrefix, count));
    outMap.push(0);
  };

  let next = signature;
  for (const index of pickIndexes(step, signature, closing, size, milestoneIndex)) {
    pushMarker(next, index);
    outLines.push(lines[index]);
    outMap.push(lineMap[index]);
    next = index + 1;
  }
  pushMarker(next, closing);
  outLines.push(lines[closing]);
  outMap.push(lineMap[closing]);

  return { lines: outLines, lineMap: outMap };
}

function layerOf(
  fnKey: string,
  filePath: string,
  entry: EntryPoint,
  keptKeys: Set<string>,
  ctx: EngineContext,
  techStack: string[]
): ArchitecturalLayer {
  if (fnKey === entry.key) {
    return "ENTRY_POINT";
  }
  if (entry.binding?.middlewares.includes(fnKey)) {
    return "MIDDLEWARE";
  }
  if (isDataAccessFile(filePath)) {
    return "DATA_ACCESS";
  }
  const hasSink = (ctx.external_calls.get(fnKey) ?? []).some((c) => isDataSinkCall(c, techStack));
  // Chỉ xét hàm là bước của bài: `new HttpException()` ở thư mục models không làm đổi tầng.
  const callsDataAccess = (ctx.call_sites.get(fnKey) ?? []).some(
    (site) => keptKeys.has(site.callee) && isDataAccessFile(site.callee.split("#")[0] ?? "")
  );
  return hasSink && !callsDataAccess ? "DATA_ACCESS" : "BUSINESS_LOGIC";
}

function draftStep(
  reached: Reached,
  keptKeys: Set<string>,
  entry: EntryPoint,
  criterion: Criterion | null,
  ctx: EngineContext,
  techStack: string[]
): DraftStep | null {
  const fn = ctx.index.functions.get(reached.key);
  if (!fn) {
    return null;
  }
  const fnNode = nodeOfFunction(ctx, fn);
  if (!fnNode) {
    return null;
  }

  const filePath = fn.file_path;
  const commentPrefix = getAdapter(ctx.input.file_language.get(filePath) ?? "")?.comment_prefix ?? "//";
  const source = (ctx.input.code.get(filePath) ?? "").split("\n");

  const isAnonymous = reached.key === entry.key && keyName(reached.key).startsWith("<");
  const rangeStart = isAnonymous && entry.binding ? entry.binding.line_start : fn.line_start;
  const rangeEnd = isAnonymous && entry.binding ? entry.binding.line_end : fn.line_end;

  const keptSites = (ctx.call_sites.get(reached.key) ?? []).filter((site) => keptKeys.has(site.callee));
  const calleeRows = keptSites.map((site) => site.line);
  // Dòng điều kiện bao lời gọi sang bước sau (if/else/case/catch/vòng lặp): là mốc, để bước con
  // có nhãn "Nhánh phụ" thì bước cha vẫn hiện đúng câu điều kiện đó.
  const guardRows = keptSites
    .map((site) => site.guard_line)
    .filter((row): row is number => typeof row === "number" && row > 0);
  const externalCalls = ctx.external_calls.get(reached.key) ?? [];
  const sinkRows = externalCalls.filter((c) => isDataSinkCall(c, techStack)).map((c) => c.line);
  const externalRows = externalCalls
    .filter((c) => isDataSinkCall(c, techStack) || isOutputCall(c))
    .map((c) => c.line);

  const { kept, signatureEnd } = selectLines({
    fnNode,
    rangeStart,
    rangeEnd,
    seedRows: new Set([...calleeRows, ...externalRows]),
    moduleVarLines: (name) => {
      const sym = ctx.index.symbols.get(`${filePath}#${name}`);
      return sym?.kind === "VARIABLE" ? { start: sym.line_start, end: sym.line_end } : null;
    },
  });

  const { lines, lineMap } = elide(kept, source, commentPrefix);
  const milestone =
    criterion?.fnKey === reached.key ? criterion.line : (calleeRows[0] ?? externalRows[0] ?? rangeStart);

  return {
    reached,
    layer: layerOf(reached.key, filePath, entry, keptKeys, ctx, techStack),
    filePath,
    functionName: isAnonymous && entry.binding ? entry.binding.display_name : keyName(reached.key),
    lines,
    lineMap,
    signatureCount: Math.max(1, lineMap.indexOf(signatureEnd) + 1),
    milestone,
    anchorRows: [...calleeRows, ...sinkRows, ...guardRows],
    commentPrefix,
    window: CONFIG.CLAMP_WINDOW_LINES,
  };
}

function protectedStepKeys(
  entry: EntryPoint,
  criterion: Criterion | null,
  steps: DraftStep[]
): Set<string> {
  const keys = new Set<string>([entry.key, ...(entry.binding?.middlewares ?? [])]);
  const parents = new Map(steps.map((s) => [s.reached.key, s.reached.parent]));
  let curr: string | null | undefined = criterion?.fnKey;
  const visited = new Set<string>();
  while (curr && !visited.has(curr)) {
    visited.add(curr);
    keys.add(curr);
    curr = parents.get(curr);
  }
  return keys;
}

function measure(steps: DraftStep[]): { lines: number; tokens: number } {
  const rendered = steps.map(renderStep);
  return {
    lines: rendered.reduce((sum, r) => sum + r.lines.length, 0),
    tokens: Math.ceil(
      rendered.reduce((sum, r) => sum + r.lines.join("\n").length, 0) / CONFIG.CHARS_PER_TOKEN
    ),
  };
}

// ENG-88: bỏ bước lá không bảo vệ sâu nhất trước, hết thì thu cửa sổ bước dài nhất.
function enforceNodeBudget(steps: DraftStep[], protectedKeys: Set<string>): DraftStep[] {
  const overBudget = (list: DraftStep[]): boolean => {
    const { lines, tokens } = measure(list);
    return lines > CONFIG.NODE_MAX_LINES || tokens > CONFIG.NODE_MAX_CODE_TOKENS;
  };

  let current = steps;
  while (overBudget(current)) {
    const parents = new Set(current.map((s) => s.reached.parent));
    const droppable = current
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => !protectedKeys.has(step.reached.key) && !parents.has(step.reached.key))
      .sort((a, b) => b.step.reached.hop - a.step.reached.hop || b.index - a.index)[0];

    if (droppable) {
      current = current.filter((_, i) => i !== droppable.index);
      continue;
    }

    const longest = current
      .filter((s) => s.window > 1)
      .sort((a, b) => renderStep(b).lines.length - renderStep(a).lines.length)[0];
    if (!longest) {
      break;
    }
    longest.window = Math.min(longest.window, renderStep(longest).lines.length) - 1;
  }

  return current;
}

/**
 * Nhánh phụ của từng bước. Có 1 chỗ gọi không điều kiện từ bước luồng chính ⇒ luồng chính; chỗ gọi
 * không điều kiện từ bước nhánh phụ ⇒ thừa kế nhánh đó; còn lại ⇒ điều kiện ở chỗ gọi từ hàm cha.
 * Mọi bước (trừ entry) đều có điều kiện ⇒ coi cả bài là luồng chính.
 */
function stepBranches(steps: DraftStep[], entry: EntryPoint, ctx: EngineContext): Map<string, StepBranch | null> {
  const keys = steps.map((s) => s.reached.key);
  const parentOf = new Map(steps.map((s) => [s.reached.key, s.reached.parent]));
  const fixed = new Set([entry.key, ...(entry.binding?.middlewares ?? [])]);
  const memo = new Map<string, StepBranch | null>();
  const visiting = new Set<string>();

  const resolve = (key: string): StepBranch | null => {
    if (memo.has(key)) return memo.get(key) ?? null;
    if (fixed.has(key) || visiting.has(key)) return null;
    visiting.add(key);

    const incoming = keys
      .filter((caller) => caller !== key)
      .flatMap((caller) =>
        resolvedSitesOf(caller, ctx)
          .filter((site) => site.callee === key)
          .map((site) => ({ caller, guard: site.guard ?? null }))
      );
    // Chỗ gọi từ hàm cha (thứ tự DFS) xét trước.
    incoming.sort((a, b) => Number(b.caller === parentOf.get(key)) - Number(a.caller === parentOf.get(key)));

    let result: StepBranch | null = null;
    const unguarded = incoming.filter((i) => i.guard === null);
    if (unguarded.length > 0) {
      const callerBranches = unguarded.map((i) => resolve(i.caller));
      result = callerBranches.includes(null) ? null : (callerBranches[0] ?? null);
    } else if (incoming.length > 0) {
      result = incoming[0].guard;
    }

    visiting.delete(key);
    memo.set(key, result);
    return result;
  };

  const branches = new Map(keys.map((key) => [key, resolve(key)]));
  const others = keys.filter((key) => key !== entry.key);
  if (others.length > 0 && others.every((key) => branches.get(key) !== null)) {
    for (const key of others) branches.set(key, null);
  }
  return branches;
}

export function buildSlice(
  entry: EntryPoint,
  ctx: EngineContext,
  helpers?: Set<string>
): Candidate {
  try {
    const techStack = ctx.input.fingerprint.tech_stack;
    const middlewares = new Set(entry.binding?.middlewares ?? []);

    // ENG-81: bỏ G thì cũng không đi tiếp vào hàm chỉ đến qua G.
    const keepCallee: KeepCallee = (callee, caller) => {
      if (middlewares.has(callee) || hasDataSinkInSubtree(callee, ctx, techStack, new Set())) {
        return true;
      }
      const fn = ctx.index.functions.get(callee);
      return isValueUsed(ctx, caller, callee) || (fn !== undefined && hasThrow(ctx, fn));
    };

    const reached = collectFunctions(entry, ctx, helpers, keepCallee);
    const criterion = findCriterion(reached, entry.key, ctx, techStack);
    const keptKeys = new Set(reached.map((r) => r.key));

    const drafts: DraftStep[] = [];
    for (const r of reached) {
      const draft = draftStep(r, keptKeys, entry, criterion, ctx, techStack);
      // Chỉ còn chữ ký và dòng đóng (constructor gán field) thì người học không thấy gì.
      const isEmptyBody =
        draft !== null &&
        draft.lineMap.filter((row) => row > 0).length <= draft.signatureCount + 1 &&
        draft.lineMap.includes(0);
      if (draft && (!isEmptyBody || r.key === entry.key || middlewares.has(r.key))) {
        drafts.push(draft);
      }
    }
    if (drafts.length === 0) {
      return createEmptyCandidate(entry);
    }

    const steps = enforceNodeBudget(drafts, protectedStepKeys(entry, criterion, drafts));
    const branches = stepBranches(steps, entry, ctx);

    const traceSteps: ExecutionTraceStep[] = steps.map((step, index) => {
      const { lines, lineMap } = renderStep(step);
      const rows = lineMap.filter((n) => n > 0);
      return {
        step_number: index + 1,
        layer: step.layer,
        file_path: step.filePath,
        function_name: step.functionName,
        line_start: Math.min(...rows),
        line_end: Math.max(...rows),
        snippet: lines.join("\n"),
        snippet_line_map: lineMap,
        branch: branches.get(step.reached.key) ?? null,
      };
    });

    const functions = steps.map((s) => s.reached.key).sort();
    const stepClasses = new Set(
      steps
        .map((s) => s.functionName.split(".")[0])
        .filter((name): name is string => name !== undefined)
    );
    const dtoSnippet = findDtoSnippet(
      traceSteps.flatMap((s) => s.snippet.split("\n")),
      ctx,
      stepClasses
    );

    const naming = nameCandidate(
      { binding: entry.binding, entry_symbol: entry.key, trace_steps: traceSteps },
      ctx
    );

    return {
      id: `slice-${slug(naming.title)}-${hash6(entry.key)}`,
      kind: "SLICE",
      node_type: "ARCHITECTURAL_DATA_FLOW",
      entry_symbol: entry.key,
      order_key: entry.key,
      functions,
      binding: entry.binding,
      base_title: naming.title,
      title_source: naming.title_source,
      title_evidence: naming.title_evidence,
      cognitive_complexity: Math.max(
        0,
        ...functions.map((key) => ctx.index.functions.get(key)?.complexity ?? 0)
      ),
      rank_score: ctx.file_rank.get(traceSteps[0].file_path) ?? 0,
      trace_steps: traceSteps,
      dto_snippet: dtoSnippet,
    };
  } catch {
    return createEmptyCandidate(entry);
  }
}

function createEmptyCandidate(entry: EntryPoint): Candidate {
  const naming = nameCandidate({
    binding: entry.binding,
    entry_symbol: entry.key,
    trace_steps: [],
  });
  return {
    id: `slice-${slug(naming.title)}-${hash6(entry.key)}`,
    kind: "SLICE",
    node_type: "ARCHITECTURAL_DATA_FLOW",
    entry_symbol: entry.key,
    order_key: entry.key,
    functions: [],
    binding: entry.binding,
    base_title: naming.title,
    title_source: naming.title_source,
    title_evidence: naming.title_evidence,
    cognitive_complexity: 0,
    rank_score: 0,
    trace_steps: [],
    dto_snippet: "",
  };
}

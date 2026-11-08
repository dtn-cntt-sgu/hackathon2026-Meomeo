import type { Node } from "web-tree-sitter";
import type { FunctionCallEdge, IngestionReport, SymbolDefinition } from "@/contracts";
import { guardFieldsOf } from "./branch";
import { getQuery } from "./parser";
import { discoverRoutes } from "./routes";
import type { DiscoveredRoute } from "./routes";
import { extractLocals, extractParams, findEnclosingClass, uniqueKey } from "./symbols";
import type {
  CallSite,
  EntryPoint,
  ExternalCall,
  FunctionInfo,
  ParsedFile,
  RouteBinding,
  SymbolIndex,
} from "./types";

export interface CallGraphResult {
  edges: FunctionCallEdge[];
  functions: Map<string, FunctionInfo>;
  external_calls: Map<string, ExternalCall[]>;
  bindings: RouteBinding[];
  call_sites: Map<string, CallSite[]>;
}

// Receiver là đối tượng có sẵn của môi trường, không bao giờ là code trong repo.
const GLOBAL_RECEIVERS = new Set([
  "console", "Math", "JSON", "Object", "Array", "Promise", "Date", "Number", "String",
  "Boolean", "Symbol", "Reflect", "process", "window", "document", "globalThis", "Buffer", "Intl",
]);

const MAX_CLASS_REF_DEPTH = 10;

interface Resolved {
  callees: string[];
  ambiguous: boolean;
}

type Receiver =
  | { kind: "this" }
  | { kind: "super" }
  | { kind: "field"; name: string }
  | { kind: "name"; name: string; shadowed: boolean };

export function isCallable(idx: SymbolIndex, key: string): boolean {
  const sym = idx.symbols.get(key);
  return sym !== undefined && (sym.kind === "FUNCTION" || sym.kind === "METHOD");
}

// `file#default` chỉ là bí danh của định nghĩa thật, mọi cạnh phải dùng chung khóa thật.
function canonicalKey(idx: SymbolIndex, key: string): string {
  if (!key.endsWith("#default")) {
    return key;
  }
  const sym = idx.symbols.get(key);
  if (!sym || sym.name === "default") {
    return key;
  }
  const realKey = `${sym.file_path}#${sym.name}`;
  return idx.symbols.has(realKey) ? realKey : key;
}

function importTarget(imp: { is_namespace: boolean; imported_name: string }): string {
  return imp.is_namespace ? "default" : imp.imported_name;
}

// Tìm file và tên thật của lớp hoặc interface mà `name` trỏ tới khi đứng trong `file`.
export function resolveClassRef(
  idx: SymbolIndex,
  file: string,
  name: string,
  depth = 0
): { file: string; name: string } | null {
  if (depth > MAX_CLASS_REF_DEPTH) {
    return null;
  }

  if (name === "default") {
    const sym = idx.symbols.get(`${file}#default`);
    return sym && sym.name !== "default" ? { file, name: sym.name } : null;
  }

  const dotIndex = name.lastIndexOf(".");
  if (dotIndex !== -1) {
    const nsImport = idx.imports.get(file)?.get(name.slice(0, dotIndex));
    if (!nsImport?.resolved_file) {
      return null;
    }
    return resolveClassRef(idx, nsImport.resolved_file, name.slice(dotIndex + 1), depth + 1);
  }

  if (idx.symbols.has(`${file}#${name}`)) {
    return { file, name };
  }

  const imp = idx.imports.get(file)?.get(name);
  if (!imp?.resolved_file) {
    return null;
  }
  return resolveClassRef(idx, imp.resolved_file, importTarget(imp), depth + 1);
}

// Tìm method ở lớp rồi đi dần lên lớp cha. `visited` chặn chuỗi kế thừa trỏ vòng.
export function findMethod(
  idx: SymbolIndex,
  file: string,
  className: string,
  method: string,
  visited = new Set<string>()
): string | null {
  const classKey = `${file}#${className}`;
  if (visited.has(classKey)) {
    return null;
  }
  visited.add(classKey);

  const methodKey = `${classKey}.${method}`;
  if (isCallable(idx, methodKey)) {
    return methodKey;
  }

  const parent = idx.class_parents.get(classKey);
  const parentRef = parent ? resolveClassRef(idx, file, parent) : null;
  return parentRef ? findMethod(idx, parentRef.file, parentRef.name, method, visited) : null;
}

// ENG-31 (3) và ENG-32: gọi `m` trên biến có kiểu `typeName`, viết trong `file`.
export function resolveTypedCall(
  idx: SymbolIndex,
  file: string,
  typeName: string,
  method: string
): Resolved | null {
  const ref = resolveClassRef(idx, file, typeName);
  const bareName = ref?.name ?? typeName;

  const impls = idx.interface_impls.get(bareName);
  if (impls) {
    const found = new Set<string>();
    for (const implKey of impls) {
      const hashIndex = implKey.indexOf("#");
      const methodKey = findMethod(
        idx,
        implKey.slice(0, hashIndex),
        implKey.slice(hashIndex + 1),
        method
      );
      if (methodKey) {
        found.add(methodKey);
      }
    }
    if (found.size > 0) {
      return { callees: [...found].sort(), ambiguous: found.size > 1 };
    }
  }

  const methodKey = ref ? findMethod(idx, ref.file, ref.name, method) : null;
  return methodKey ? { callees: [methodKey], ambiguous: false } : null;
}

function fieldTypeOfName(
  idx: SymbolIndex,
  file: string,
  name: string
): { type: string; file: string } | null {
  const localType = idx.field_types.get(`${file}#${name}`);
  if (localType) {
    return { type: localType, file };
  }

  const imp = idx.imports.get(file)?.get(name);
  if (!imp?.resolved_file) {
    return null;
  }
  const targetKey = `${imp.resolved_file}#${importTarget(imp)}`;
  const type = idx.field_types.get(targetKey) ?? idx.field_types.get(canonicalKey(idx, targetKey));
  return type ? { type, file: imp.resolved_file } : null;
}

// ENG-31 (1), (3), (4) cho lời gọi có receiver.
function resolveMemberCall(
  idx: SymbolIndex,
  file: string,
  className: string | null,
  receiver: Receiver,
  method: string
): Resolved | null {
  if (receiver.kind === "this" || receiver.kind === "super") {
    if (!className) {
      return null;
    }
    let start: { file: string; name: string } | null = { file, name: className };
    if (receiver.kind === "super") {
      const parent = idx.class_parents.get(`${file}#${className}`);
      start = parent ? resolveClassRef(idx, file, parent) : null;
    }
    const methodKey = start ? findMethod(idx, start.file, start.name, method) : null;
    return methodKey ? { callees: [methodKey], ambiguous: false } : null;
  }

  if (receiver.kind === "field") {
    const type = className ? idx.field_types.get(`${file}#${className}.${receiver.name}`) : undefined;
    return type ? resolveTypedCall(idx, file, type, method) : null;
  }

  if (receiver.shadowed) {
    return null;
  }

  const typed = fieldTypeOfName(idx, file, receiver.name);
  if (typed) {
    const resolved = resolveTypedCall(idx, typed.file, typed.type, method);
    if (resolved) {
      return resolved;
    }
  }

  const ref = resolveClassRef(idx, file, receiver.name);
  const staticKey = ref ? findMethod(idx, ref.file, ref.name, method) : null;
  if (staticKey) {
    return { callees: [staticKey], ambiguous: false };
  }

  const imp = idx.imports.get(file)?.get(receiver.name);
  if (imp?.resolved_file) {
    const moduleKey = `${imp.resolved_file}#${method}`;
    if (isCallable(idx, moduleKey)) {
      return { callees: [moduleKey], ambiguous: false };
    }
  }

  return null;
}

function extractReceiverChain(node: Node): string[] {
  const chain: string[] = [];
  let obj = node.childForFieldName("object");

  while (obj) {
    if (obj.type === "identifier") {
      chain.unshift(obj.text);
      break;
    }
    if (obj.type === "this") {
      chain.unshift("this");
      break;
    }
    if (obj.type === "member_expression") {
      const prop = obj.childForFieldName("property");
      if (prop) {
        chain.unshift(prop.text);
      }
      obj = obj.childForFieldName("object");
      continue;
    }
    if (obj.type === "call_expression") {
      const fn = obj.childForFieldName("function");
      if (fn?.type === "member_expression") {
        const prop = fn.childForFieldName("property");
        if (prop) {
          chain.unshift(prop.text);
        }
        obj = fn.childForFieldName("object");
        continue;
      }
      if (fn?.type === "identifier") {
        chain.unshift(fn.text);
      }
    }
    break;
  }

  return chain;
}

function resolveHandlerKey(idx: SymbolIndex, route: DiscoveredRoute): string {
  const text = route.handlerText;
  if (text.includes("#")) {
    return text;
  }

  const file = route.file_path;
  const parts = text.split(".");

  if (parts.length === 1) {
    if (idx.symbols.has(`${file}#${text}`)) {
      return `${file}#${text}`;
    }
    const imp = idx.imports.get(file)?.get(text);
    return imp?.resolved_file ? `${imp.resolved_file}#${importTarget(imp)}` : `${file}#${text}`;
  }

  const method = parts[parts.length - 1];
  const owner = parts[parts.length - 2];
  let receiver: Receiver = { kind: "name", name: owner, shadowed: false };
  if (parts[0] === "this") {
    receiver = parts.length === 2 ? { kind: "this" } : { kind: "field", name: owner };
  }

  return resolveMemberCall(idx, file, route.class_name, receiver, method)?.callees[0] ?? `${file}#${text}`;
}

export function buildCallGraph(
  files: ParsedFile[],
  idx: SymbolIndex
): CallGraphResult {
  const keyCounts = new Map<string, number>();
  for (const k of idx.symbols.keys()) {
    const base = k.replace(/~\d+$/, "");
    keyCounts.set(base, (keyCounts.get(base) ?? 0) + 1);
  }

  // Tìm đăng ký route và tạo symbol tổng hợp cho handler ẩn danh.
  const bindings: RouteBinding[] = [];
  for (const route of discoverRoutes(files, idx)) {
    let handlerKey: string;

    if (route.handlerNode !== null) {
      const baseKey =
        route.path !== null
          ? `${route.file_path}#<${route.method} ${route.path}>`
          : `${route.file_path}#<anon@L${route.handlerNode.startPosition.row + 1}>`;
      handlerKey = uniqueKey(baseKey, keyCounts);

      const def: SymbolDefinition = {
        key: handlerKey,
        kind: "FUNCTION",
        name: handlerKey.slice(handlerKey.indexOf("#") + 1),
        file_path: route.file_path,
        line_start: route.handlerNode.startPosition.row + 1,
        line_end: route.handlerNode.endPosition.row + 1,
        is_exported: false,
      };
      idx.symbols.set(handlerKey, def);

      const params = extractParams(route.handlerNode);
      const locals = extractLocals(route.handlerNode);
      idx.functions.set(handlerKey, { ...def, params, locals, complexity: 0 });
      idx.locals.set(handlerKey, new Set([...params, ...locals]));
    } else {
      handlerKey = resolveHandlerKey(idx, route);
    }

    bindings.push({
      file_path: route.file_path,
      line_start: route.line_start,
      line_end: route.line_end,
      kind: route.kind,
      method: route.method,
      path: route.path,
      handler: canonicalKey(idx, handlerKey),
      middlewares: route.middlewares.map((mw) => canonicalKey(idx, mw)),
      display_name: route.display_name,
    });
  }

  // Thêm file#<module> làm hàm chứa lệnh cấp cao.
  for (const file of files) {
    const modKey = `${file.path}#<module>`;
    if (!idx.symbols.has(modKey)) {
      const modDef: SymbolDefinition = {
        key: modKey,
        kind: "FUNCTION",
        name: "<module>",
        file_path: file.path,
        line_start: 1,
        line_end: file.tree.rootNode.endPosition.row + 1,
        is_exported: false,
      };
      idx.symbols.set(modKey, modDef);
      idx.functions.set(modKey, { ...modDef, params: [], locals: [], complexity: 0 });
    }
  }

  // Hàm theo file, bỏ bí danh #default để lời gọi luôn gắn vào khóa thật. Bỏ cả <module>:
  // nó là mặc định khi không có hàm nào chứa, và có thể trùng khoảng dòng với hàm duy nhất của file.
  const functionsByFile = new Map<string, FunctionInfo[]>();
  for (const [key, fn] of idx.functions) {
    if (canonicalKey(idx, key) !== key || key.endsWith("#<module>")) {
      continue;
    }
    const list = functionsByFile.get(fn.file_path);
    if (list) {
      list.push(fn);
    } else {
      functionsByFile.set(fn.file_path, [fn]);
    }
  }

  const findCaller = (filePath: string, startLine: number, endLine: number): string => {
    let best: FunctionInfo | null = null;
    for (const fn of functionsByFile.get(filePath) ?? []) {
      if (fn.line_start > startLine || fn.line_end < endLine) {
        continue;
      }
      const span = fn.line_end - fn.line_start;
      const bestSpan = best ? best.line_end - best.line_start : Infinity;
      if (
        !best ||
        span < bestSpan ||
        (span === bestSpan && fn.line_start > best.line_start) ||
        (span === bestSpan && fn.line_start === best.line_start && fn.key < best.key)
      ) {
        best = fn;
      }
    }
    return best?.key ?? `${filePath}#<module>`;
  };

  const rawEdges: FunctionCallEdge[] = [];
  const external_calls = new Map<string, ExternalCall[]>();
  const call_sites = new Map<string, CallSite[]>();

  const addExternalCall = (ext: ExternalCall): void => {
    const list = external_calls.get(ext.caller);
    if (list) {
      list.push(ext);
    } else {
      external_calls.set(ext.caller, [ext]);
    }
  };

  const addCall = (
    caller: string,
    callee: string,
    confidence: "RESOLVED" | "INFERRED",
    ambiguous: boolean,
    node: Node
  ): void => {
    const target = canonicalKey(idx, callee);
    rawEdges.push({ caller, callee: target, confidence, ambiguous, call_count: 1 });
    const site: CallSite = {
      callee: target,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      end_index: node.endIndex,
      confidence,
      ambiguous,
      ...guardFieldsOf(node),
    };
    const list = call_sites.get(caller);
    if (list) {
      list.push(site);
    } else {
      call_sites.set(caller, [site]);
    }
  };

  const sortedFiles = [...files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );

  for (const file of sortedFiles) {
    let callCaptures;
    try {
      callCaptures = getQuery(file.language)
        .captures(file.tree.rootNode)
        .filter((c) => c.name === "call")
        .sort((a, b) => a.node.startIndex - b.node.startIndex);
    } catch {
      continue;
    }

    const fileImports = idx.imports.get(file.path);
    const importedFiles = new Set<string>();
    for (const imp of fileImports?.values() ?? []) {
      if (imp.resolved_file) {
        importedFiles.add(imp.resolved_file);
      }
    }

    for (const { node: callNode } of callCaptures) {
      const callStart = callNode.startPosition.row + 1;
      const caller = findCaller(file.path, callStart, callNode.endPosition.row + 1);
      const callerLocals = idx.locals.get(caller);

      if (callNode.type === "new_expression") {
        const ctorNode = callNode.childForFieldName("constructor");
        const ref = ctorNode ? resolveClassRef(idx, file.path, ctorNode.text) : null;
        const ctorKey = ref ? `${ref.file}#${ref.name}.constructor` : null;
        if (ctorKey && isCallable(idx, ctorKey)) {
          addCall(caller, ctorKey, "RESOLVED", false, callNode);
        }
        continue;
      }

      const fnNode = callNode.childForFieldName("function") ?? callNode.namedChild(0);
      if (!fnNode) {
        continue;
      }

      // f(): chỉ tra cùng file và import. Không có receiver nên không áp bước (6).
      if (fnNode.type === "identifier") {
        const name = fnNode.text;
        const imp = fileImports?.get(name);

        if (!callerLocals?.has(name)) {
          const localKey = `${file.path}#${name}`;
          if (isCallable(idx, localKey)) {
            addCall(caller, localKey, "RESOLVED", false, callNode);
            continue;
          }
          if (imp?.resolved_file) {
            const targetKey = `${imp.resolved_file}#${importTarget(imp)}`;
            if (isCallable(idx, targetKey)) {
              addCall(caller, targetKey, "RESOLVED", false, callNode);
              continue;
            }
          }
        }

        addExternalCall({
          caller,
          line: callStart,
          receiver_chain: [],
          method: name,
          import_source: imp && imp.resolved_file === null ? imp.source : null,
        });
        continue;
      }

      if (fnNode.type !== "member_expression") {
        continue;
      }

      const method = fnNode.childForFieldName("property")?.text ?? "";
      const objNode = fnNode.childForFieldName("object");
      if (!objNode || !method) {
        continue;
      }

      let receiver: Receiver | null = null;
      if (objNode.type === "this") {
        receiver = { kind: "this" };
      } else if (objNode.type === "super") {
        receiver = { kind: "super" };
      } else if (objNode.type === "identifier") {
        receiver = {
          kind: "name",
          name: objNode.text,
          shadowed: callerLocals?.has(objNode.text) ?? false,
        };
      } else if (
        objNode.type === "member_expression" &&
        objNode.childForFieldName("object")?.type === "this"
      ) {
        const field = objNode.childForFieldName("property")?.text;
        receiver = field ? { kind: "field", name: field } : null;
      }

      const resolved = receiver
        ? resolveMemberCall(
            idx,
            file.path,
            findEnclosingClass(callNode)?.className ?? null,
            receiver,
            method
          )
        : null;

      if (resolved) {
        for (const callee of resolved.callees) {
          addCall(caller, callee, "RESOLVED", resolved.ambiguous, callNode);
        }
        continue;
      }

      const chain = extractReceiverChain(fnNode);
      const rootName = chain[0] ?? null;
      const rootImport = rootName ? fileImports?.get(rootName) : undefined;
      const isExternalRoot =
        (rootName !== null && GLOBAL_RECEIVERS.has(rootName)) ||
        (rootImport !== undefined && rootImport.resolved_file === null);

      // ENG-31 (6): receiver không rõ kiểu, `m` có trong file được import.
      if (!isExternalRoot) {
        const candidates: string[] = [];
        for (const sym of idx.symbols.values()) {
          if (
            importedFiles.has(sym.file_path) &&
            sym.name === method &&
            (sym.kind === "FUNCTION" || sym.kind === "METHOD") &&
            canonicalKey(idx, sym.key) === sym.key
          ) {
            candidates.push(sym.key);
          }
        }
        if (candidates.length > 0) {
          for (const callee of candidates.sort()) {
            addCall(caller, callee, "INFERRED", candidates.length > 1, callNode);
          }
          continue;
        }
      }

      addExternalCall({
        caller,
        line: callStart,
        receiver_chain: chain,
        method,
        import_source: rootImport?.resolved_file === null ? rootImport.source : null,
      });
    }
  }

  // ENG-34: hàm chứa lệnh đăng ký ⇒ handler và từng middleware. Chỉ nối tới hàm có thật.
  for (const binding of bindings) {
    const caller = findCaller(binding.file_path, binding.line_start, binding.line_end);
    for (const target of [binding.handler, ...binding.middlewares]) {
      if (target !== caller && isCallable(idx, target)) {
        rawEdges.push({
          caller,
          callee: target,
          confidence: "RESOLVED",
          ambiguous: false,
          call_count: 1,
        });
      }
    }
  }

  // ENG-33: gộp theo (caller, callee).
  const edgeMap = new Map<string, FunctionCallEdge>();
  for (const e of rawEdges) {
    const edgeKey = `${e.caller}->${e.callee}`;
    const existing = edgeMap.get(edgeKey);
    if (existing) {
      existing.call_count += e.call_count;
      if (e.confidence === "RESOLVED") {
        existing.confidence = "RESOLVED";
      }
      existing.ambiguous = existing.ambiguous || e.ambiguous;
    } else {
      edgeMap.set(edgeKey, { ...e });
    }
  }

  const edges = Array.from(edgeMap.values()).sort((a, b) => {
    if (a.caller !== b.caller) {
      return a.caller < b.caller ? -1 : 1;
    }
    return a.callee < b.callee ? -1 : a.callee > b.callee ? 1 : 0;
  });

  return {
    edges,
    functions: idx.functions,
    external_calls,
    bindings,
    call_sites,
  };
}

export function fileGraph(
  edges: FunctionCallEdge[]
): Map<string, Map<string, { weight: number; confidence: "RESOLVED" | "INFERRED" }>> {
  const result = new Map<string, Map<string, { weight: number; confidence: "RESOLVED" | "INFERRED" }>>();

  for (const e of edges) {
    const fa = e.caller.split("#")[0];
    const fb = e.callee.split("#")[0];
    if (fa === fb) continue;

    let targets = result.get(fa);
    if (!targets) {
      targets = new Map();
      result.set(fa, targets);
    }

    const existing = targets.get(fb);
    if (existing) {
      existing.weight += e.call_count;
      if (e.confidence === "RESOLVED") {
        existing.confidence = "RESOLVED";
      }
    } else {
      targets.set(fb, { weight: e.call_count, confidence: e.confidence });
    }
  }

  // Sort keys để thứ tự tất định
  const sortedResult = new Map<string, Map<string, { weight: number; confidence: "RESOLVED" | "INFERRED" }>>();
  const sortedSourceFiles = Array.from(result.keys()).sort();
  for (const fa of sortedSourceFiles) {
    const targets = result.get(fa)!;
    const sortedTargets = new Map<string, { weight: number; confidence: "RESOLVED" | "INFERRED" }>();
    const sortedDestFiles = Array.from(targets.keys()).sort();
    for (const fb of sortedDestFiles) {
      sortedTargets.set(fb, targets.get(fb)!);
    }
    sortedResult.set(fa, sortedTargets);
  }

  return sortedResult;
}

const GENERIC_ENTRY_TOKENS = new Set([
  "controller", "controllers",
  "route", "routes",
  "router", "routers",
  "handler", "handlers",
  "api",
  "endpoint", "endpoints",
  "screen", "screens",
  "page", "pages",
  "view", "views",
  "activity", "activities",
  "fragment", "fragments",
  "command", "commands",
]);

export function findEntries(
  files: ParsedFile[],
  idx: SymbolIndex,
  graph: CallGraphResult,
  scope: string,
  _report?: IngestionReport
): EntryPoint[] {
  void _report;
  const entriesByKey = new Map<string, EntryPoint>();

  if (graph.bindings.length > 0) {
    for (const b of graph.bindings) {
      const fileOfHandler = b.handler.split("#")[0];
      // Handler từ gói ngoài không có trong repo thì không thành bài.
      if (idx.symbols.has(b.handler) && (scope === "" || fileOfHandler.startsWith(scope))) {
        if (!entriesByKey.has(b.handler)) {
          entriesByKey.set(b.handler, {
            key: b.handler,
            binding: b,
            source: "REGISTERED",
          });
        }
      }
    }
  } else {
    // Không có binding nào: dùng GENERIC
    const fg = fileGraph(graph.edges);
    const inDegrees = new Map<string, number>();
    for (const file of files) {
      inDegrees.set(file.path, 0);
    }
    for (const [callerFile, targets] of fg.entries()) {
      for (const calleeFile of targets.keys()) {
        if (calleeFile !== callerFile) {
          inDegrees.set(calleeFile, (inDegrees.get(calleeFile) ?? 0) + 1);
        }
      }
    }

    for (const file of files) {
      const filePath = file.path;
      if (scope !== "" && !filePath.startsWith(scope)) {
        continue;
      }

      const dirSegments = filePath.split("/").slice(0, -1);
      const matchesDir = dirSegments.some((seg) =>
        GENERIC_ENTRY_TOKENS.has(seg.toLowerCase())
      );

      const baseName = filePath.split("/").pop() ?? "";
      const dotIdx = baseName.lastIndexOf(".");
      const stem = dotIdx !== -1 ? baseName.slice(0, dotIdx) : baseName;
      const tokens = stem
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toLowerCase()
        .split(/[-_.]/);
      const lastToken = tokens[tokens.length - 1];
      const matchesToken = GENERIC_ENTRY_TOKENS.has(lastToken);

      const inDegree = inDegrees.get(filePath) ?? 0;

      if ((matchesDir || matchesToken) && inDegree === 0) {
        for (const sym of idx.symbols.values()) {
          if (
            sym.file_path === filePath &&
            sym.is_exported &&
            (sym.kind === "FUNCTION" || sym.kind === "METHOD") &&
            canonicalKey(idx, sym.key) === sym.key
          ) {
            if (!entriesByKey.has(sym.key)) {
              entriesByKey.set(sym.key, {
                key: sym.key,
                binding: null,
                source: "GENERIC",
              });
            }
          }
        }
      }
    }
  }

  return Array.from(entriesByKey.values()).sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  );
}

import type { Node } from "web-tree-sitter";
import type { FunctionCallEdge } from "@/contracts";
import {
  findMethod,
  isCallable,
  resolveClassRef,
  resolveTypedCall,
} from "./callgraph";
import type { CallGraphResult } from "./callgraph";
import { guardFieldsOf } from "./branch";
import { javaTypeName } from "./resolvers/java";
import { combineRoutePath } from "./routes";
import type {
  CallSite,
  ExternalCall,
  FunctionInfo,
  ParsedFile,
  RouteBinding,
  SymbolIndex,
} from "./types";

const REPOSITORY_BASES = new Set([
  "JpaRepository",
  "CrudRepository",
  "PagingAndSortingRepository",
  "ListCrudRepository",
  "Repository",
]);

const ENTITY_MANAGER_METHODS = new Set([
  "persist",
  "merge",
  "remove",
  "find",
  "createQuery",
  "createNativeQuery",
]);

const MAPPING_VERBS = new Map([
  ["GetMapping", "GET"],
  ["PostMapping", "POST"],
  ["PutMapping", "PUT"],
  ["PatchMapping", "PATCH"],
  ["DeleteMapping", "DELETE"],
]);

const NAMED_TYPES = new Set([
  "class_declaration",
  "interface_declaration",
  "enum_declaration",
  "record_declaration",
]);

const METHOD_TYPES = new Set(["method_declaration", "constructor_declaration"]);

interface Annotation {
  name: string;
  node: Node;
}

function annotationsOf(node: Node): Annotation[] {
  const modifiers = node.namedChildren.find((c) => c.type === "modifiers");
  const result: Annotation[] = [];
  for (const child of modifiers?.namedChildren ?? []) {
    if (child.type === "annotation" || child.type === "marker_annotation") {
      const name = child.childForFieldName("name")?.text;
      if (name) {
        result.push({ name, node: child });
      }
    }
  }
  return result;
}

function firstString(node: Node | null | undefined): string | null {
  if (!node) {
    return null;
  }
  if (node.type === "string_literal") {
    return node.text.replace(/^"|"$/g, "");
  }
  if (node.type === "element_value_array_initializer") {
    return firstString(node.namedChildren[0]);
  }
  return null;
}

// Đối số đầu không tên, hoặc `value =`, `path =`. Mảng lấy phần tử đầu.
function annotationPath(annotation: Annotation): string {
  const args = annotation.node.childForFieldName("arguments");
  for (const arg of args?.namedChildren ?? []) {
    if (arg.type === "element_value_pair") {
      const key = arg.childForFieldName("key")?.text;
      if (key === "value" || key === "path") {
        return firstString(arg.childForFieldName("value")) ?? "";
      }
    } else {
      return firstString(arg) ?? "";
    }
  }
  return "";
}

// `method = RequestMethod.POST`, `method = POST`, `method = {POST}`. Không có ⇒ ALL.
function requestMethod(annotation: Annotation): string {
  const args = annotation.node.childForFieldName("arguments");
  for (const arg of args?.namedChildren ?? []) {
    if (arg.type === "element_value_pair" && arg.childForFieldName("key")?.text === "method") {
      const value = arg.childForFieldName("value");
      const first = value?.type === "element_value_array_initializer" ? value.namedChildren[0] : value;
      const text = first?.text ?? "";
      return text.slice(text.lastIndexOf(".") + 1) || "ALL";
    }
  }
  return "ALL";
}

export function isJavaTestSource(filePath: string): boolean {
  return filePath.includes("src/test/") || /Tests?\.java$/.test(filePath);
}

function extendedInterfaces(node: Node): string[] {
  const list = node.namedChildren
    .find((c) => c.type === "extends_interfaces")
    ?.namedChildren.find((c) => c.type === "type_list");
  return (list?.namedChildren ?? []).map(javaTypeName);
}

export function isSpringDataAccessFile(file: ParsedFile): boolean {
  return file.tree.rootNode.namedChildren.some(
    (node) =>
      NAMED_TYPES.has(node.type) &&
      (annotationsOf(node).some((a) => a.name === "Repository" || a.name === "Mapper") ||
        extendedInterfaces(node).some((name) => REPOSITORY_BASES.has(name)))
  );
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (const child of node.namedChildren) {
    walk(child, visit);
  }
}

function functionAt(functions: FunctionInfo[], node: Node): FunctionInfo | undefined {
  const name = node.childForFieldName("name")?.text;
  const lineEnd = node.endPosition.row + 1;
  return functions.find((f) => f.name === name && f.line_end === lineEnd);
}

function collectRoutes(
  file: ParsedFile,
  functions: FunctionInfo[],
  bindings: RouteBinding[]
): void {
  for (const typeNode of file.tree.rootNode.namedChildren) {
    if (typeNode.type !== "class_declaration") {
      continue;
    }
    const classAnnotations = annotationsOf(typeNode);
    if (!classAnnotations.some((a) => a.name === "RestController" || a.name === "Controller")) {
      continue;
    }

    const className = typeNode.childForFieldName("name")?.text ?? "";
    const classMapping = classAnnotations.find((a) => a.name === "RequestMapping");
    const prefix = classMapping ? annotationPath(classMapping) : "";

    for (const member of typeNode.childForFieldName("body")?.namedChildren ?? []) {
      if (member.type !== "method_declaration") {
        continue;
      }
      const fn = functionAt(functions, member);
      if (!fn) {
        continue;
      }

      for (const annotation of annotationsOf(member)) {
        const verb = MAPPING_VERBS.get(annotation.name);
        if (!verb && annotation.name !== "RequestMapping") {
          continue;
        }
        bindings.push({
          file_path: file.path,
          line_start: fn.line_start,
          line_end: fn.line_end,
          kind: "HTTP",
          method: verb ?? requestMethod(annotation),
          path: combineRoutePath(prefix, annotationPath(annotation)),
          handler: fn.key,
          middlewares: [],
          display_name: `${className}.${fn.name}`,
        });
      }
    }
  }
}

// Phương thức ngoài cùng trong lớp có tên: lời gọi trong lớp ẩn danh tính cho hàm chứa nó.
function enclosingMethod(node: Node): { method: Node; className: string } | null {
  let method: Node | null = null;
  let curr: Node | null = node.parent;
  while (curr) {
    if (METHOD_TYPES.has(curr.type)) {
      method = curr;
    } else if (NAMED_TYPES.has(curr.type)) {
      const className = curr.childForFieldName("name")?.text;
      return method && className ? { method, className } : null;
    }
    curr = curr.parent;
  }
  return null;
}

function localTypesOf(method: Node): Map<string, string> {
  const types = new Map<string, string>();
  walk(method, (n) => {
    if (n.type === "formal_parameter" || n.type === "spread_parameter") {
      const type = n.childForFieldName("type") ?? n.namedChildren.find((c) => c.type.endsWith("type"));
      const name = n.childForFieldName("name");
      if (type && name) {
        types.set(name.text, javaTypeName(type));
      }
    } else if (n.type === "local_variable_declaration") {
      const type = n.childForFieldName("type");
      const name = n.childForFieldName("declarator")?.childForFieldName("name");
      if (type && name && type.text !== "var") {
        types.set(name.text, javaTypeName(type));
      }
    }
  });
  return types;
}

function receiverChain(object: Node | null): string[] {
  return object ? object.text.split(/[.(]/, 3).filter((part) => /^\w+$/.test(part)) : [];
}

export function buildJavaCallGraph(files: ParsedFile[], idx: SymbolIndex): CallGraphResult {
  const sourceFiles = [...files]
    .filter((f) => !isJavaTestSource(f.path))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const dataFiles = new Set(sourceFiles.filter(isSpringDataAccessFile).map((f) => f.path));

  const functionsByFile = new Map<string, FunctionInfo[]>();
  for (const fn of idx.functions.values()) {
    const list = functionsByFile.get(fn.file_path);
    if (list) {
      list.push(fn);
    } else {
      functionsByFile.set(fn.file_path, [fn]);
    }
  }

  // ENT-42: method không có thân không là bước, lời gọi tới nó là ExternalCall.
  const bodiless = new Set<string>();
  for (const file of sourceFiles) {
    walk(file.tree.rootNode, (n) => {
      if (n.type === "method_declaration" && !n.childForFieldName("body")) {
        const fn = functionAt(functionsByFile.get(file.path) ?? [], n);
        if (fn) {
          bodiless.add(fn.key);
        }
      }
    });
  }

  const hasBody = (key: string): boolean => isCallable(idx, key) && !bodiless.has(key);

  const bindings: RouteBinding[] = [];
  const rawEdges = new Map<string, FunctionCallEdge>();
  const call_sites = new Map<string, CallSite[]>();
  const external_calls = new Map<string, ExternalCall[]>();

  const addCall = (
    caller: string,
    callee: string,
    confidence: "RESOLVED" | "INFERRED",
    ambiguous: boolean,
    node: Node
  ): void => {
    const edgeKey = `${caller}->${callee}`;
    const existing = rawEdges.get(edgeKey);
    if (existing) {
      existing.call_count += 1;
      existing.ambiguous = existing.ambiguous || ambiguous;
      if (confidence === "RESOLVED") {
        existing.confidence = "RESOLVED";
      }
    } else {
      rawEdges.set(edgeKey, { caller, callee, confidence, ambiguous, call_count: 1 });
    }

    const site: CallSite = {
      callee,
      line: node.startPosition.row + 1,
      column: node.startPosition.column + 1,
      end_index: node.endIndex,
      confidence,
      ambiguous,
      ...guardFieldsOf(node),
    };
    const sites = call_sites.get(caller);
    if (sites) {
      sites.push(site);
    } else {
      call_sites.set(caller, [site]);
    }
  };

  const addExternal = (call: ExternalCall): void => {
    const list = external_calls.get(call.caller);
    if (list) {
      list.push(call);
    } else {
      external_calls.set(call.caller, [call]);
    }
  };

  // ENT-41: gọi qua kiểu thuộc tầng dữ liệu là DATA_SINK, không xét tên receiver.
  const isSinkType = (file: string, typeName: string | null, method: string): boolean => {
    if (!typeName) {
      return false;
    }
    if (typeName === "EntityManager") {
      return ENTITY_MANAGER_METHODS.has(method);
    }
    if (REPOSITORY_BASES.has(typeName)) {
      return true;
    }
    const ref = resolveClassRef(idx, file, typeName);
    return ref !== null && dataFiles.has(ref.file);
  };

  for (const file of sourceFiles) {
    const functions = functionsByFile.get(file.path) ?? [];
    collectRoutes(file, functions, bindings);

    const localTypesCache = new Map<number, Map<string, string>>();
    const fileImports = idx.imports.get(file.path);

    walk(file.tree.rootNode, (node) => {
      if (node.type !== "method_invocation" && node.type !== "object_creation_expression") {
        return;
      }
      const scope = enclosingMethod(node);
      const caller = scope ? functionAt(functions, scope.method)?.key : undefined;
      if (!scope || !caller) {
        return;
      }

      if (node.type === "object_creation_expression") {
        const type = node.childForFieldName("type");
        const ref = type ? resolveClassRef(idx, file.path, javaTypeName(type)) : null;
        const ctorKey = ref ? `${ref.file}#${ref.name}.${ref.name}` : null;
        if (ctorKey && hasBody(ctorKey)) {
          addCall(caller, ctorKey, "RESOLVED", false, node);
        }
        return;
      }

      const method = node.childForFieldName("name")?.text;
      if (!method) {
        return;
      }
      const object = node.childForFieldName("object");

      let localTypes = localTypesCache.get(scope.method.id);
      if (!localTypes) {
        localTypes = localTypesOf(scope.method);
        localTypesCache.set(scope.method.id, localTypes);
      }

      let typeName: string | null = null;
      let targets: string[] = [];
      let ambiguous = false;

      if (!object || object.type === "this") {
        const own = findMethod(idx, file.path, scope.className, method);
        targets = own ? [own] : [];
      } else if (object.type === "super") {
        const parent = idx.class_parents.get(`${file.path}#${scope.className}`);
        const ref = parent ? resolveClassRef(idx, file.path, parent) : null;
        const inherited = ref ? findMethod(idx, ref.file, ref.name, method) : null;
        targets = inherited ? [inherited] : [];
      } else {
        const fieldName =
          object.type === "field_access" && object.childForFieldName("object")?.type === "this"
            ? object.childForFieldName("field")?.text
            : object.type === "identifier"
              ? object.text
              : undefined;

        if (fieldName) {
          const isThisField = object.type === "field_access";
          typeName =
            (isThisField ? undefined : localTypes.get(fieldName)) ??
            idx.field_types.get(`${file.path}#${scope.className}.${fieldName}`) ??
            null;
        }

        if (typeName) {
          const resolved = resolveTypedCall(idx, file.path, typeName, method);
          targets = resolved?.callees ?? [];
          ambiguous = resolved?.ambiguous ?? false;
        } else if (object.type === "identifier") {
          // Lời gọi tĩnh `C.m()`.
          const ref = resolveClassRef(idx, file.path, object.text);
          const staticKey = ref ? findMethod(idx, ref.file, ref.name, method) : null;
          targets = staticKey ? [staticKey] : [];
        }
      }

      const callees = targets.filter(hasBody);
      if (callees.length > 0) {
        // ENT-43: nhiều lớp cài đặt ⇒ INFERRED, ambiguous.
        for (const callee of callees) {
          addCall(caller, callee, ambiguous ? "INFERRED" : "RESOLVED", ambiguous, node);
        }
        return;
      }

      const chain = receiverChain(object);
      const rootImport = chain[0] ? fileImports?.get(chain[0]) : undefined;
      addExternal({
        caller,
        line: node.startPosition.row + 1,
        receiver_chain: chain,
        method,
        import_source: rootImport?.resolved_file === null ? rootImport.source : null,
        is_data_sink: isSinkType(file.path, typeName, method),
      });
    });
  }

  const edges = [...rawEdges.values()].sort((a, b) => {
    if (a.caller !== b.caller) {
      return a.caller < b.caller ? -1 : 1;
    }
    return a.callee < b.callee ? -1 : a.callee > b.callee ? 1 : 0;
  });

  for (const sites of call_sites.values()) {
    sites.sort((a, b) => a.line - b.line || a.column - b.column);
  }

  return { edges, functions: idx.functions, external_calls, bindings, call_sites };
}

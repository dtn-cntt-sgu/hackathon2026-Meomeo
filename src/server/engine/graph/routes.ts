import type { Node } from "web-tree-sitter";
import { resolveTsJsImport } from "./resolvers/ts_js";
import { findEnclosingClass } from "./symbols";
import type { ParsedFile, SymbolIndex } from "./types";

const EXPRESS_VERBS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "all",
  "options",
  "head",
]);

const NEST_VERBS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "all",
]);

const NEXT_VERBS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export interface DiscoveredRoute {
  file_path: string;
  line_start: number;
  line_end: number;
  kind: "HTTP";
  method: string | null;
  path: string | null;
  handlerNode: Node | null;
  handlerText: string;
  class_name: string | null;
  middlewares: string[];
  display_name: string;
}

export function extractStaticString(node: Node | null | undefined): string | null {
  if (!node) return null;
  if (node.type === "string") {
    return node.text.replace(/^["'`]|["'`]$/g, "");
  }
  if (node.type === "template_string") {
    const hasSubstitution = node.children.some(
      (c) => c.type === "template_substitution" || c.type === "substitution"
    );
    if (hasSubstitution) {
      return null;
    }
    return node.text.replace(/^`|`$/g, "");
  }
  return null;
}

export function combineRoutePath(prefix: string, routePath: string): string {
  let combined = `${prefix}/${routePath}`;
  combined = combined.replace(/\/+/g, "/");
  if (!combined.startsWith("/")) {
    combined = "/" + combined;
  }
  if (combined.length > 1 && combined.endsWith("/")) {
    combined = combined.slice(0, -1);
  }
  return combined;
}

function isInvalidHandler(node: Node): boolean {
  const invalidTypes = new Set([
    "string",
    "number",
    "true",
    "false",
    "null",
    "object",
    "array",
  ]);
  if (invalidTypes.has(node.type)) return true;
  if (
    node.text === "null" ||
    node.text === "undefined" ||
    node.text === "true" ||
    node.text === "false"
  ) {
    return true;
  }
  return false;
}

export function unwrapHandler(node: Node): { unwrappedNode: Node; unwrappedText: string } {
  if (node.type === "call_expression") {
    const fnNode = node.childForFieldName("function");
    // ctrl.list.bind(ctrl) ⇒ ctrl.list
    if (fnNode?.type === "member_expression" && fnNode.childForFieldName("property")?.text === "bind") {
      const target = fnNode.childForFieldName("object");
      if (target) {
        return unwrapHandler(target);
      }
    }
    const argsNode =
      node.childForFieldName("arguments") ??
      node.children.find((c) => c.type === "arguments");
    if (argsNode && argsNode.namedChildren.length > 0) {
      return unwrapHandler(argsNode.namedChildren[0]);
    }
    if (fnNode) {
      return { unwrappedNode: fnNode, unwrappedText: fnNode.text };
    }
  }
  return { unwrappedNode: node, unwrappedText: node.text };
}

export function isAnonymousFunction(node: Node): boolean {
  return (
    node.type === "arrow_function" ||
    node.type === "function_expression" ||
    (node.type === "function" && !node.childForFieldName("name"))
  );
}

function resolveMiddlewareName(
  rawName: string,
  filePath: string,
  idx: SymbolIndex
): string {
  if (idx.symbols.has(`${filePath}#${rawName}`)) {
    return `${filePath}#${rawName}`;
  }
  const imp = idx.imports.get(filePath)?.get(rawName);
  if (imp?.resolved_file) {
    const targetKey = `${imp.resolved_file}#${imp.imported_name}`;
    if (idx.symbols.has(targetKey)) {
      return targetKey;
    }
    return targetKey;
  }
  if (rawName.includes(".")) {
    const parts = rawName.split(".");
    const base = parts[0];
    const rest = parts.slice(1).join(".");
    const baseImp = idx.imports.get(filePath)?.get(base);
    if (baseImp?.resolved_file) {
      const fullKey = `${baseImp.resolved_file}#${baseImp.imported_name}.${rest}`;
      if (idx.symbols.has(fullKey)) {
        return fullKey;
      }
      return fullKey;
    }
    if (idx.symbols.has(`${filePath}#${rawName}`)) {
      return `${filePath}#${rawName}`;
    }
  }
  return rawName;
}

interface ExpressMount {
  parentRouter: string;
  parentFile: string;
  childName: string | null;
  childFile: string | null;
  prefix: string | null;
}

const ANON_ROUTER = "<anon-router>";

// Tên quy ước của router khi nó là tham số hoặc import nội bộ (`12` Mục 1).
function isRouterName(name: string): boolean {
  return (
    name === "app" ||
    name === "router" ||
    name === "server" ||
    name === "fastify" ||
    name.endsWith("Router")
  );
}

function isRouterFactory(fnText: string): boolean {
  return (
    fnText === "express" ||
    fnText === "Router" ||
    fnText === "fastify" ||
    fnText.endsWith(".Router") ||
    /^require\(["'](express|fastify)["']\)$/.test(fnText)
  );
}

function requireSpecifier(node: Node): string | null {
  if (node.type !== "call_expression" || node.childForFieldName("function")?.text !== "require") {
    return null;
  }
  const args = node.childForFieldName("arguments");
  return args ? extractStaticString(args.namedChildren[0]) : null;
}

export function discoverRoutes(
  inputFiles: ParsedFile[],
  idx: SymbolIndex
): DiscoveredRoute[] {
  const discovered: DiscoveredRoute[] = [];
  const files = [...inputFiles].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const allFiles = new Set(files.map((f) => f.path));

  // 1. Phân tích Express routers và mounts
  const fileRouterVars = new Map<string, Set<string>>();
  const fileParamNames = new Map<string, Set<string>>();
  const mounts: ExpressMount[] = [];

  for (const file of files) {
    const routerVars = new Set<string>();
    const paramNames = new Set<string>();

    const checkRouterCreation = (n: Node) => {
      if (n.type === "variable_declarator") {
        const nameNode = n.childForFieldName("name");
        const valNode = n.childForFieldName("value");
        if (nameNode && valNode) {
          if (valNode.type === "call_expression") {
            const fnText = valNode.childForFieldName("function")?.text ?? "";
            if (isRouterFactory(fnText)) {
              routerVars.add(nameNode.text);
            }
          } else if (valNode.type === "new_expression") {
            const ctorText = valNode.childForFieldName("constructor")?.text ?? "";
            if (ctorText === "Router" || ctorText === "express.Router") {
              routerVars.add(nameNode.text);
            }
          }
        }
      } else if (
        n.type === "formal_parameters" ||
        n.type === "parameters" ||
        n.type === "parameter"
      ) {
        for (const child of n.namedChildren) {
          const idChild =
            child.type === "identifier"
              ? child
              : child.childForFieldName("pattern") ?? child.childForFieldName("name") ?? child.namedChild(0);
          if (idChild?.type === "identifier" && isRouterName(idChild.text)) {
            paramNames.add(idChild.text);
          }
        }
      }

      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) checkRouterCreation(child);
      }
    };

    checkRouterCreation(file.tree.rootNode);

    // Kiểm tra imports nội bộ hợp lệ
    const imports = idx.imports.get(file.path);
    if (imports) {
      for (const [localName, imp] of imports.entries()) {
        if (imp.resolved_file !== null) {
          if (isRouterName(localName) || isRouterName(imp.imported_name)) {
            routerVars.add(localName);
          }
        }
      }
    }

    fileRouterVars.set(file.path, routerVars);
    fileParamNames.set(file.path, paramNames);
  }

  // Thu thập Express mounts: R.use(prefix, R2)
  for (const file of files) {
    const routerVars = fileRouterVars.get(file.path) ?? new Set();
    const paramNames = fileParamNames.get(file.path) ?? new Set();

    const isRouter = (name: string): boolean => {
      if (routerVars.has(name) || paramNames.has(name)) return true;
      const imp = idx.imports.get(file.path)?.get(name);
      if (imp && imp.resolved_file === null) return false;
      return false;
    };

    // Tên router ở đầu chuỗi: `app`, `Router().use(a).use(b)`. Không gán vào biến ⇒ ANON_ROUTER.
    const mountParentOf = (node: Node): string | null => {
      if (node.type === "identifier") {
        return isRouter(node.text) ? node.text : null;
      }
      if (node.type !== "call_expression") {
        return null;
      }
      const fn = node.childForFieldName("function");
      if (fn?.type === "member_expression" && fn.childForFieldName("property")?.text === "use") {
        const inner = fn.childForFieldName("object");
        return inner ? mountParentOf(inner) : null;
      }
      if (fn && isRouterFactory(fn.text)) {
        let holder = node.parent;
        while (holder && (holder.type === "member_expression" || holder.type === "call_expression")) {
          holder = holder.parent;
        }
        const varName = holder?.type === "variable_declarator" ? holder.childForFieldName("name") : null;
        return varName?.type === "identifier" ? varName.text : ANON_ROUTER;
      }
      return null;
    };

    const walkForMounts = (n: Node) => {
      if (n.type === "call_expression") {
        const fnNode = n.childForFieldName("function");
        if (fnNode && fnNode.type === "member_expression") {
          const prop = fnNode.childForFieldName("property")?.text ?? "";
          const objNode = fnNode.childForFieldName("object");
          const obj = prop === "use" && objNode ? mountParentOf(objNode) : null;
          if (obj !== null) {
            const argsNode =
              n.childForFieldName("arguments") ??
              n.children.find((c) => c.type === "arguments");
            if (argsNode && argsNode.namedChildren.length >= 1) {
              // `use(prefix, ...mw, child)`, `use(child)`: router con là đối số cuối.
              const hasPrefix = argsNode.namedChildren.length >= 2;
              const prefixVal = hasPrefix ? extractStaticString(argsNode.namedChildren[0]) : "";
              const childNode = argsNode.namedChildren[argsNode.namedChildren.length - 1];
              const specifier = requireSpecifier(childNode);
              if (childNode.type === "identifier" || specifier !== null) {
                mounts.push({
                  parentRouter: obj,
                  parentFile: file.path,
                  childName: childNode.type === "identifier" ? childNode.text : null,
                  childFile: specifier
                    ? resolveTsJsImport(file.path, specifier, allFiles, null, "")
                    : null,
                  prefix: prefixVal,
                });
              }
            }
          }
        }
      }
      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) walkForMounts(child);
      }
    };

    walkForMounts(file.tree.rootNode);
  }

  const isDefaultRouter = (filePath: string, routerName: string): boolean => {
    const defaultSymbol = idx.symbols.get(`${filePath}#default`);
    return defaultSymbol ? defaultSymbol.name === routerName : routerName === ANON_ROUTER;
  };

  // Tính tiền tố cho từng router (mount chuỗi nhiều tầng có visited, mount nhiều nơi lấy path nhỏ nhất)
  const routerPrefixMap = new Map<string, string | null>();

  function computePrefixFor(
    filePath: string,
    routerName: string,
    visited: Set<string>
  ): string | null {
    const key = `${filePath}::${routerName}`;
    if (routerPrefixMap.has(key)) {
      return routerPrefixMap.get(key)!;
    }
    if (visited.has(key)) {
      return "";
    }
    visited.add(key);

    const incomingMounts: ExpressMount[] = [];
    for (const m of mounts) {
      if (m.childFile === filePath) {
        if (isDefaultRouter(filePath, routerName)) {
          incomingMounts.push(m);
        }
      } else if (m.childName !== null) {
        const imp = idx.imports.get(m.parentFile)?.get(m.childName);
        if (m.parentFile === filePath && m.childName === routerName) {
          incomingMounts.push(m);
        } else if (imp?.resolved_file === filePath) {
          // File có thể có nhiều router: chỉ nhận đúng router được import.
          const isDefault = imp.is_default || imp.is_namespace;
          if (isDefault ? isDefaultRouter(filePath, routerName) : imp.imported_name === routerName) {
            incomingMounts.push(m);
          }
        }
      }
    }

    if (incomingMounts.length === 0) {
      routerPrefixMap.set(key, "");
      return "";
    }

    const candidatePrefixes: string[] = [];
    let hasNonStatic = false;

    for (const m of incomingMounts) {
      if (m.prefix === null) {
        hasNonStatic = true;
        continue;
      }
      const parentPfx = computePrefixFor(m.parentFile, m.parentRouter, new Set(visited));
      if (parentPfx === null) {
        hasNonStatic = true;
      } else {
        const combined = combineRoutePath(parentPfx, m.prefix);
        candidatePrefixes.push(combined);
      }
    }

    if (candidatePrefixes.length === 0) {
      const res = hasNonStatic ? null : "";
      routerPrefixMap.set(key, res);
      return res;
    }

    candidatePrefixes.sort();
    const best = candidatePrefixes[0];
    routerPrefixMap.set(key, best);
    return best;
  }

  // Thu thập route Express từ mỗi file
  for (const file of files) {
    const routerVars = fileRouterVars.get(file.path) ?? new Set();
    const paramNames = fileParamNames.get(file.path) ?? new Set();

    const isRouter = (name: string): boolean => {
      const imp = idx.imports.get(file.path)?.get(name);
      if (imp && imp.resolved_file === null) {
        return false;
      }
      return routerVars.has(name) || paramNames.has(name);
    };

    // `this.router` trong lớp nhận theo tên field, không dò được nơi khởi tạo.
    const routerNameOf = (node: Node): string | null => {
      if (node.type === "identifier") {
        return isRouter(node.text) ? node.text : null;
      }
      if (node.type === "member_expression" && node.childForFieldName("object")?.type === "this") {
        const field = node.childForFieldName("property")?.text ?? "";
        return isRouterName(field) ? `this.${field}` : null;
      }
      return null;
    };

    const activeUseMiddlewares = new Map<string, string[]>();

    const walkStatements = (n: Node) => {
      if (n.type === "call_expression") {
        const fnNode = n.childForFieldName("function");
        if (fnNode && fnNode.type === "member_expression") {
          const propNode = fnNode.childForFieldName("property");
          const prop = propNode?.text.toLowerCase() ?? "";

          // R.use(fn)
          if (prop === "use") {
            const objNode = fnNode.childForFieldName("object");
            if (objNode && objNode.type === "identifier" && isRouter(objNode.text)) {
              const rName = objNode.text;
              const argsNode =
                n.childForFieldName("arguments") ??
                n.children.find((c) => c.type === "arguments");
              if (argsNode && argsNode.namedChildren.length > 0) {
                const firstStatic = extractStaticString(argsNode.namedChildren[0]);
                if (firstStatic === null && argsNode.namedChildren.length === 1) {
                  // R.use(fn)
                  const mwArg = argsNode.namedChildren[0];
                  let mwName = mwArg.text;
                  if (mwArg.type === "call_expression") {
                    const callFn = mwArg.childForFieldName("function");
                    if (callFn) mwName = callFn.text;
                  }
                  // app.use(router) là gắn router con, không phải middleware.
                  if (!isRouter(mwName) && !isRouterName(mwName) && requireSpecifier(mwArg) === null) {
                    const resolvedMw = resolveMiddlewareName(mwName, file.path, idx);
                    let currentList = activeUseMiddlewares.get(rName);
                    if (!currentList) {
                      currentList = [];
                      activeUseMiddlewares.set(rName, currentList);
                    }
                    currentList.push(resolvedMw);
                  }
                }
              }
            }
          }

          // Express route verbs
          if (EXPRESS_VERBS.has(prop)) {
            let rootRouterName: string | null = null;
            let routePrefixArg: Node | null = null;
            const receiverNode = fnNode.childForFieldName("object");

            // Kiểm tra R.route(path).verb(...)
            let currObj = receiverNode;
            while (currObj && currObj.type === "call_expression") {
              const innerFn = currObj.childForFieldName("function");
              if (innerFn && innerFn.type === "member_expression") {
                const innerProp = innerFn.childForFieldName("property")?.text ?? "";
                if (innerProp === "route") {
                  const innerArgs =
                    currObj.childForFieldName("arguments") ??
                    currObj.children.find((c) => c.type === "arguments");
                  if (innerArgs && innerArgs.namedChildren.length > 0) {
                    routePrefixArg = innerArgs.namedChildren[0];
                  }
                  const innerRouter = innerFn.childForFieldName("object");
                  rootRouterName = innerRouter ? routerNameOf(innerRouter) : null;
                  break;
                } else if (EXPRESS_VERBS.has(innerProp.toLowerCase())) {
                  currObj = innerFn.childForFieldName("object");
                  continue;
                }
              }
              break;
            }

            if (!rootRouterName && receiverNode) {
              rootRouterName = routerNameOf(receiverNode);
            }

            if (rootRouterName) {
              const argsNode =
                n.childForFieldName("arguments") ??
                n.children.find((c) => c.type === "arguments");
              const namedArgs = argsNode ? argsNode.namedChildren : [];

              let pathStr: string | null = null;
              let isRouteValid = false;
              let middlewareNodes: Node[] = [];
              let handlerNodeRaw: Node | null = null;

              if (routePrefixArg) {
                // R.route(path).verb(...fns)
                pathStr = extractStaticString(routePrefixArg);
                if (namedArgs.length >= 1) {
                  handlerNodeRaw = namedArgs[namedArgs.length - 1];
                  if (!isInvalidHandler(handlerNodeRaw)) {
                    isRouteValid = true;
                    middlewareNodes = namedArgs.slice(0, -1);
                  }
                }
              } else {
                // R.verb(path, ...fns)
                if (namedArgs.length >= 2) {
                  pathStr = extractStaticString(namedArgs[0]);
                  handlerNodeRaw = namedArgs[namedArgs.length - 1];
                  if (!isInvalidHandler(handlerNodeRaw)) {
                    isRouteValid = true;
                    middlewareNodes = namedArgs.slice(1, -1);
                  }
                }
              }

              if (isRouteValid && handlerNodeRaw) {
                const routerPrefix = computePrefixFor(
                  file.path,
                  rootRouterName,
                  new Set()
                );
                let fullPath: string | null = null;
                if (routerPrefix !== null && pathStr !== null) {
                  fullPath = combineRoutePath(routerPrefix, pathStr);
                }

                const { unwrappedNode, unwrappedText } = unwrapHandler(handlerNodeRaw);
                const isAnon = isAnonymousFunction(unwrappedNode);

                const mwList: string[] = [];
                const inherited = activeUseMiddlewares.get(rootRouterName);
                if (inherited) {
                  mwList.push(...inherited);
                }
                // `[a, b]` là danh sách middleware, object tùy chọn của Fastify thì bỏ qua.
                const flatMiddlewares = middlewareNodes.flatMap((mw) =>
                  mw.type === "array" ? mw.namedChildren : [mw]
                );
                for (const mw of flatMiddlewares) {
                  if (mw.type === "object") {
                    continue;
                  }
                  let mwName = mw.text;
                  if (mw.type === "call_expression") {
                    const fnCall = mw.childForFieldName("function");
                    if (fnCall) mwName = fnCall.text;
                  }
                  mwList.push(resolveMiddlewareName(mwName, file.path, idx));
                }

                let lineStatement: Node = n;
                let parentStmt = n.parent;
                while (parentStmt) {
                  if (
                    parentStmt.type === "expression_statement" ||
                    parentStmt.type === "lexical_declaration" ||
                    parentStmt.type === "variable_declaration"
                  ) {
                    lineStatement = parentStmt;
                    break;
                  }
                  parentStmt = parentStmt.parent;
                }

                const receiverText = rootRouterName;
                const pathDisplay = fullPath !== null ? fullPath : pathStr ?? "";
                const display_name = `${receiverText}.${prop}('${pathDisplay}')`;

                discovered.push({
                  file_path: file.path,
                  line_start: lineStatement.startPosition.row + 1,
                  line_end: lineStatement.endPosition.row + 1,
                  kind: "HTTP",
                  method: prop.toUpperCase(),
                  path: fullPath,
                  handlerNode: isAnon ? unwrappedNode : null,
                  handlerText: unwrappedText,
                  class_name: findEnclosingClass(n)?.className ?? null,
                  middlewares: mwList,
                  display_name,
                });
              }
            }
          }
        }
      }

      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) walkStatements(child);
      }
    };

    walkStatements(file.tree.rootNode);
  }

  // 2. Phân tích NestJS routes
  for (const file of files) {
    const parseDecorator = (decNode: Node): { name: string; args: Node[] } | null => {
      const callNode = decNode.children.find((c) => c.type === "call_expression");
      if (!callNode) {
        const idNode = decNode.children.find((c) => c.type === "identifier");
        if (idNode) {
          return { name: idNode.text, args: [] };
        }
        return null;
      }
      const fnNode = callNode.childForFieldName("function") ?? callNode.namedChild(0);
      if (!fnNode) return null;
      const argsNode =
        callNode.childForFieldName("arguments") ??
        callNode.children.find((c) => c.type === "arguments");
      return {
        name: fnNode.text,
        args: argsNode ? argsNode.namedChildren : [],
      };
    };

    const getDecorators = (node: Node): Node[] => {
      const decs: Node[] = [];
      for (const child of node.children) {
        if (child.type === "decorator") {
          decs.push(child);
        }
      }
      let prev = node.previousNamedSibling;
      while (prev && prev.type === "decorator") {
        decs.unshift(prev);
        prev = prev.previousNamedSibling;
      }
      if (node.parent && (node.parent.type === "export_statement" || node.parent.type === "export_declaration")) {
        for (const child of node.parent.children) {
          if (child.type === "decorator") {
            decs.push(child);
          }
        }
        let parentPrev = node.parent.previousNamedSibling;
        while (parentPrev && parentPrev.type === "decorator") {
          decs.unshift(parentPrev);
          parentPrev = parentPrev.previousNamedSibling;
        }
      }
      return decs;
    };

    const extractMiddlewareFromDecorators = (decs: Node[]): string[] => {
      const mws: string[] = [];
      for (const d of decs) {
        const parsed = parseDecorator(d);
        if (!parsed) continue;
        if (parsed.name === "UseGuards") {
          for (const arg of parsed.args) {
            mws.push(resolveMiddlewareName(`${arg.text}.canActivate`, file.path, idx));
          }
        } else if (parsed.name === "UseInterceptors") {
          for (const arg of parsed.args) {
            mws.push(resolveMiddlewareName(`${arg.text}.intercept`, file.path, idx));
          }
        } else if (parsed.name === "UsePipes") {
          for (const arg of parsed.args) {
            mws.push(resolveMiddlewareName(`${arg.text}.transform`, file.path, idx));
          }
        }
      }
      return mws;
    };

    const walkForNest = (n: Node) => {
      if (
        n.type === "class_declaration" ||
        n.type === "abstract_class_declaration" ||
        n.type === "class"
      ) {
        const classDecs = getDecorators(n);
        let controllerDec: { name: string; args: Node[] } | null = null;
        for (const d of classDecs) {
          const parsed = parseDecorator(d);
          if (parsed && parsed.name === "Controller") {
            controllerDec = parsed;
            break;
          }
        }

        if (controllerDec) {
          const classNameNode =
            n.childForFieldName("name") ??
            n.children.find((c) => c.type === "type_identifier" || c.type === "identifier");
          const className = classNameNode ? classNameNode.text : "";

          let classPrefix = "";
          if (controllerDec.args.length > 0) {
            const rawStr = extractStaticString(controllerDec.args[0]);
            if (rawStr !== null) {
              classPrefix = rawStr;
            } else if (controllerDec.args[0].type === "object") {
              for (const prop of controllerDec.args[0].namedChildren) {
                if (prop.type === "pair") {
                  const k = prop.childForFieldName("key")?.text;
                  if (k === "path") {
                    const val = extractStaticString(prop.childForFieldName("value"));
                    if (val !== null) classPrefix = val;
                  }
                }
              }
            }
          }

          const classMws = extractMiddlewareFromDecorators(classDecs);

          const bodyNode =
            n.childForFieldName("body") ??
            n.children.find((c) => c.type === "class_body");
          if (bodyNode) {
            for (const member of bodyNode.namedChildren) {
              if (member.type === "method_definition") {
                const methodDecs = getDecorators(member);
                for (const d of methodDecs) {
                  const parsed = parseDecorator(d);
                  if (parsed && NEST_VERBS.has(parsed.name.toLowerCase())) {
                    const verb = parsed.name.toUpperCase();
                    let methodPath = "";
                    if (parsed.args.length > 0) {
                      const rawStr = extractStaticString(parsed.args[0]);
                      if (rawStr !== null) methodPath = rawStr;
                    }
                    const fullPath = combineRoutePath(classPrefix, methodPath);
                    const methodMws = extractMiddlewareFromDecorators(methodDecs);
                    const mws = [...classMws, ...methodMws];

                    const methodNameNode =
                      member.childForFieldName("name") ??
                      member.children.find((c) => c.type === "property_identifier");
                    const methodName = methodNameNode ? methodNameNode.text : "";
                    const handlerKey = `${file.path}#${className}.${methodName}`;

                    discovered.push({
                      file_path: file.path,
                      line_start: member.startPosition.row + 1,
                      line_end: member.endPosition.row + 1,
                      kind: "HTTP",
                      method: verb,
                      path: fullPath,
                      handlerNode: null,
                      handlerText: handlerKey,
                      class_name: className,
                      middlewares: mws,
                      display_name: `${className}.${verb.toLowerCase()}('${fullPath}')`,
                    });
                  }
                }
              }
            }
          }
        }
      }

      for (let i = 0; i < n.childCount; i++) {
        const child = n.child(i);
        if (child) walkForNest(child);
      }
    };

    walkForNest(file.tree.rootNode);
  }

  // 3. Phân tích Next.js route handlers
  for (const file of files) {
    const match = /(?:^|\/)app\/(.+)\/route\.(?:ts|js)$/.exec(file.path);
    if (match) {
      const rawFolderPath = match[1];
      const segments = rawFolderPath
        .split("/")
        .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
      const mappedSegments = segments.map((seg) =>
        seg.replace(/\[([^\]]+)\]/g, ":$1")
      );
      let nextPath = "/" + mappedSegments.join("/");
      nextPath = nextPath.replace(/\/+/g, "/");
      if (nextPath.length > 1 && nextPath.endsWith("/")) {
        nextPath = nextPath.slice(0, -1);
      }

      for (const sym of idx.symbols.values()) {
        if (
          sym.file_path === file.path &&
          sym.is_exported &&
          NEXT_VERBS.has(sym.name)
        ) {
          discovered.push({
            file_path: file.path,
            line_start: sym.line_start,
            line_end: sym.line_end,
            kind: "HTTP",
            method: sym.name,
            path: nextPath,
            handlerNode: null,
            handlerText: sym.key,
            class_name: null,
            middlewares: [],
            display_name: `route.${sym.name.toLowerCase()}('${nextPath}')`,
          });
        }
      }
    }
  }

  return discovered;
}

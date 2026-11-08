import type { Node } from "web-tree-sitter";
import { CONFIG } from "@/contracts";
import { parseJsonc } from "../../jsonc";
import type { ParsedFile, ReExport, SymbolIndex } from "../types";

export interface TsConfigPaths {
  config_dir: string;
  base_url: string | null;
  paths: Record<string, string[]>;
}

function normalizePosixPath(p: string): string | null {
  const parts = p.split("/");
  const stack: string[] = [];

  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (stack.length === 0) {
        return null;
      }
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  return stack.join("/");
}

function getDir(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return filePath.slice(0, lastSlash);
}

function getParentDir(dir: string): string | null {
  if (dir === "") {
    return null;
  }
  const lastSlash = dir.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return dir.slice(0, lastSlash);
}

export function findTsConfig(
  sourceFilePath: string,
  manifests: Map<string, string>
): TsConfigPaths | null {
  let currentDir: string | null = getDir(sourceFilePath);

  while (currentDir !== null) {
    const tsConfigKey = currentDir ? `${currentDir}/tsconfig.json` : "tsconfig.json";
    const jsConfigKey = currentDir ? `${currentDir}/jsconfig.json` : "jsconfig.json";

    let foundKey: string | null = null;
    if (manifests.has(tsConfigKey)) {
      foundKey = tsConfigKey;
    } else if (manifests.has(jsConfigKey)) {
      foundKey = jsConfigKey;
    }

    if (foundKey) {
      const rawContent = manifests.get(foundKey);
      if (!rawContent) {
        return null;
      }

      try {
        const parsed = parseJsonc<Record<string, unknown>>(rawContent);
        if (!parsed || typeof parsed !== "object") {
          return null;
        }

        const compilerOptions =
          parsed.compilerOptions && typeof parsed.compilerOptions === "object"
            ? (parsed.compilerOptions as Record<string, unknown>)
            : {};

        const baseUrl =
          typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl : null;

        const paths =
          compilerOptions.paths && typeof compilerOptions.paths === "object"
            ? (compilerOptions.paths as Record<string, string[]>)
            : {};

        return {
          config_dir: currentDir,
          base_url: baseUrl,
          paths,
        };
      } catch {
        return null;
      }
    }

    currentDir = getParentDir(currentDir);
  }

  return null;
}

// ENG-25: không có tsconfig thì lấy thư mục có package.json gần nhất làm gốc cho `@/`.
function findPackageRoot(
  sourceFilePath: string,
  manifests: Map<string, string>
): TsConfigPaths | null {
  let currentDir: string | null = getDir(sourceFilePath);
  while (currentDir !== null) {
    if (manifests.has(currentDir ? `${currentDir}/package.json` : "package.json")) {
      return { config_dir: currentDir, base_url: null, paths: {} };
    }
    currentDir = getParentDir(currentDir);
  }
  return null;
}

function probeFile(basePath: string, allFiles: Set<string>): string | null {
  if (allFiles.has(basePath)) {
    return basePath;
  }

  if (basePath.endsWith(".js")) {
    const withoutJs = basePath.slice(0, -3);
    const tsCandidate = `${withoutJs}.ts`;
    if (allFiles.has(tsCandidate)) {
      return tsCandidate;
    }
    const tsxCandidate = `${withoutJs}.tsx`;
    if (allFiles.has(tsxCandidate)) {
      return tsxCandidate;
    }
  }

  const extensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    "/index.ts",
    "/index.tsx",
    "/index.js",
  ];

  for (const ext of extensions) {
    const candidate = basePath + ext;
    if (allFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveTsJsImport(
  sourceFilePath: string,
  specifier: string,
  allFiles: Set<string>,
  tsConfig: TsConfigPaths | null,
  rootDirOffset: string
): string | null {
  // 1. Bắt đầu bằng ./ hoặc ../
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const sourceDir = getDir(sourceFilePath);
    const combined = sourceDir ? `${sourceDir}/${specifier}` : specifier;
    const normalized = normalizePosixPath(combined);
    if (normalized === null) {
      return null;
    }
    return probeFile(normalized, allFiles);
  }

  // 2. Thử paths
  let matchedAnyPattern = false;
  if (tsConfig && tsConfig.paths && Object.keys(tsConfig.paths).length > 0) {
    const patterns = Object.keys(tsConfig.paths);
    const matchingPatterns: Array<{
      pattern: string;
      prefixLen: number;
      starValue: string;
      targets: string[];
    }> = [];

    for (const pattern of patterns) {
      const targets = tsConfig.paths[pattern] ?? [];
      const starIndex = pattern.indexOf("*");
      if (starIndex !== -1) {
        const prefix = pattern.slice(0, starIndex);
        const suffix = pattern.slice(starIndex + 1);
        if (
          specifier.startsWith(prefix) &&
          specifier.endsWith(suffix) &&
          specifier.length >= prefix.length + suffix.length
        ) {
          const starValue = specifier.slice(prefix.length, specifier.length - suffix.length);
          matchingPatterns.push({
            pattern,
            prefixLen: prefix.length,
            starValue,
            targets,
          });
        }
      } else if (pattern === specifier) {
        matchingPatterns.push({
          pattern,
          prefixLen: pattern.length,
          starValue: "",
          targets,
        });
      }
    }

    if (matchingPatterns.length > 0) {
      matchedAnyPattern = true;
      matchingPatterns.sort((a, b) => b.prefixLen - a.prefixLen);

      let configBaseDir = tsConfig.config_dir;
      if (tsConfig.base_url) {
        const raw = configBaseDir ? `${configBaseDir}/${tsConfig.base_url}` : tsConfig.base_url;
        configBaseDir = normalizePosixPath(raw) ?? "";
      }

      for (const match of matchingPatterns) {
        for (const targetTemplate of match.targets) {
          const targetReplaced = targetTemplate.includes("*")
            ? targetTemplate.replace("*", match.starValue)
            : targetTemplate;
          const fullTarget = configBaseDir
            ? `${configBaseDir}/${targetReplaced}`
            : targetReplaced;
          const normalizedTarget = normalizePosixPath(fullTarget);
          if (normalizedTarget !== null) {
            const found = probeFile(normalizedTarget, allFiles);
            if (found) {
              return found;
            }
          }
        }
      }
    }
  }

  // 3. Không khớp thì thử base_url nếu có
  if (tsConfig && tsConfig.base_url) {
    const configBaseDir = tsConfig.config_dir;
    const raw = configBaseDir ? `${configBaseDir}/${tsConfig.base_url}` : tsConfig.base_url;
    const normalizedBaseDir = normalizePosixPath(raw) ?? "";
    const fullTarget = normalizedBaseDir ? `${normalizedBaseDir}/${specifier}` : specifier;
    const normalizedTarget = normalizePosixPath(fullTarget);
    if (normalizedTarget !== null) {
      const found = probeFile(normalizedTarget, allFiles);
      if (found) {
        return found;
      }
    }
  }

  // 4. Không khớp mà không có paths (hoặc không pattern nào khớp)
  const hasPaths = tsConfig && tsConfig.paths && Object.keys(tsConfig.paths).length > 0;
  if (!hasPaths || !matchedAnyPattern) {
    if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
      const subPath = specifier.slice(2);
      const base = tsConfig?.config_dir || rootDirOffset;
      const prefix = base ? (base.endsWith("/") ? base : `${base}/`) : "";
      const fullTarget = `${prefix}src/${subPath}`;
      const normalizedTarget = normalizePosixPath(fullTarget);
      if (normalizedTarget !== null) {
        const found = probeFile(normalizedTarget, allFiles);
        if (found) {
          return found;
        }
      }
    }
  }

  // 5. Còn lại là tên gói => null
  return null;
}

export function followBarrelReExport(
  filePath: string,
  symbolName: string,
  fileImports: Map<string, ReExport[]>,
  depth = 0,
  visited = new Set<string>(),
  hasSymbol?: (file: string, name: string) => boolean
): { file_path: string; symbol_name: string } | null {
  if (hasSymbol && hasSymbol(filePath, symbolName)) {
    return { file_path: filePath, symbol_name: symbolName };
  }

  const visitKey = `${filePath}#${symbolName}`;
  if (visited.has(visitKey)) {
    return null;
  }
  visited.add(visitKey);

  if (depth >= CONFIG.BARREL_MAX_DEPTH) {
    return null;
  }

  const reExports = fileImports.get(filePath) ?? [];

  // Tìm re-export có exported_name === symbolName trước
  for (const r of reExports) {
    if (r.exported_name === symbolName) {
      if (r.resolved_file) {
        const res = followBarrelReExport(
          r.resolved_file,
          r.imported_name,
          fileImports,
          depth + 1,
          visited,
          hasSymbol
        );
        if (res) {
          return res;
        }
      }
    }
  }

  // Tới các export * theo thứ tự
  for (const r of reExports) {
    if (r.exported_name === "*" && r.imported_name === "*") {
      if (r.resolved_file) {
        const res = followBarrelReExport(
          r.resolved_file,
          symbolName,
          fileImports,
          depth + 1,
          visited,
          hasSymbol
        );
        if (res) {
          return res;
        }
      }
    }
  }

  // Không còn re-export nào
  if (!hasSymbol) {
    return { file_path: filePath, symbol_name: symbolName };
  }

  return null;
}

function cleanStringLiteral(raw: string): string {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function extractDestructuredBindings(
  patternNode: Node,
  callback: (importedName: string, localName: string) => void
): void {
  for (const child of patternNode.namedChildren) {
    if (
      child.type === "shorthand_property_identifier_pattern" ||
      child.type === "identifier"
    ) {
      callback(child.text, child.text);
    } else if (child.type === "pair_pattern" || child.type === "pair") {
      const keyNode = child.childForFieldName("key") ?? child.namedChild(0);
      const valNode = child.childForFieldName("value") ?? child.namedChild(1);
      if (keyNode && valNode) {
        if (valNode.type === "identifier") {
          callback(keyNode.text, valNode.text);
        } else if (valNode.type === "assignment_pattern") {
          const left = valNode.childForFieldName("left") ?? valNode.namedChild(0);
          if (left && left.type === "identifier") {
            callback(keyNode.text, left.text);
          }
        }
      }
    }
  }
}

export function collectTsJsImports(
  file: ParsedFile,
  allFiles: Set<string>,
  manifests: Map<string, string>,
  rootDirOffset: string,
  idx: SymbolIndex
): void {
  const tsConfig = findTsConfig(file.path, manifests) ?? findPackageRoot(file.path, manifests);

  let fileImports = idx.imports.get(file.path);
  if (!fileImports) {
    fileImports = new Map();
    idx.imports.set(file.path, fileImports);
  }

  let fileReExports = idx.re_exports.get(file.path);
  if (!fileReExports) {
    fileReExports = [];
    idx.re_exports.set(file.path, fileReExports);
  }

  // `export { a as b }`, `import X; export { X }`, `import X; export default X`:
  // ghi như re-export để barrel đi tiếp được tới file định nghĩa.
  function collectLocalExports(node: Node): void {
    const line = node.startPosition.row + 1;

    const addExport = (name: string, exportedName: string): void => {
      const imported = fileImports!.get(name);
      if (imported) {
        if (!imported.is_namespace) {
          fileReExports!.push({
            exported_name: exportedName,
            imported_name: imported.imported_name,
            source: imported.source,
            resolved_file: imported.resolved_file,
            line,
          });
        }
      } else if (exportedName !== name) {
        fileReExports!.push({
          exported_name: exportedName,
          imported_name: name,
          source: "",
          resolved_file: file.path,
          line,
        });
      }
    };

    const clause = node.children.find((c) => c.type === "export_clause");
    if (clause) {
      for (const spec of clause.namedChildren) {
        if (spec.type === "export_specifier") {
          const nameNode = spec.childForFieldName("name");
          const aliasNode = spec.childForFieldName("alias");
          if (nameNode) {
            addExport(nameNode.text, aliasNode ? aliasNode.text : nameNode.text);
          }
        }
      }
    }

    const valueNode = node.childForFieldName("value");
    if (valueNode?.type === "identifier" && node.children.some((c) => c.text === "default")) {
      addExport(valueNode.text, "default");
    }
  }

  function walk(node: Node): void {
    if (node.type === "import_statement") {
      const sourceNode =
        node.childForFieldName("source") ??
        node.children.find((c) => c.type === "string");

      if (sourceNode) {
        const specifier = cleanStringLiteral(sourceNode.text);
        const resolved_file = resolveTsJsImport(
          file.path,
          specifier,
          allFiles,
          tsConfig,
          rootDirOffset
        );
        const line = node.startPosition.row + 1;

        const clause =
          node.childForFieldName("import_clause") ??
          node.children.find((c) => c.type === "import_clause");

        if (clause) {
          for (const child of clause.children) {
            if (child.type === "identifier") {
              // import a from "x"
              fileImports!.set(child.text, {
                local_name: child.text,
                imported_name: "default",
                source: specifier,
                resolved_file,
                is_default: true,
                is_namespace: false,
                line,
              });
            } else if (child.type === "namespace_import") {
              // import * as ns from "x"
              const aliasNode =
                child.childForFieldName("alias") ??
                child.children.find((c) => c.type === "identifier");
              if (aliasNode) {
                fileImports!.set(aliasNode.text, {
                  local_name: aliasNode.text,
                  imported_name: "*",
                  source: specifier,
                  resolved_file,
                  is_default: false,
                  is_namespace: true,
                  line,
                });
              }
            } else if (child.type === "named_imports") {
              // import { a, b as c } from "x"
              for (const spec of child.namedChildren) {
                if (spec.type === "import_specifier") {
                  const nameNode =
                    spec.childForFieldName("name") ??
                    spec.children.find(
                      (c) => c.type === "identifier" || c.type === "type_identifier"
                    );
                  const aliasNode = spec.childForFieldName("alias");

                  if (nameNode) {
                    const imported_name = nameNode.text;
                    const local_name = aliasNode ? aliasNode.text : imported_name;
                    fileImports!.set(local_name, {
                      local_name,
                      imported_name,
                      source: specifier,
                      resolved_file,
                      is_default: false,
                      is_namespace: false,
                      line,
                    });
                  }
                }
              }
            }
          }
        }
      }
      return;
    }

    if (node.type === "export_statement") {
      const sourceNode = node.childForFieldName("source");

      if (!sourceNode) {
        collectLocalExports(node);
      } else {
        const specifier = cleanStringLiteral(sourceNode.text);
        const resolved_file = resolveTsJsImport(
          file.path,
          specifier,
          allFiles,
          tsConfig,
          rootDirOffset
        );
        const line = node.startPosition.row + 1;

        const isStar = node.children.some((c) => c.type === "*" || c.text === "*");
        if (isStar) {
          fileReExports!.push({
            exported_name: "*",
            imported_name: "*",
            source: specifier,
            resolved_file,
            line,
          });
        }

        const clause =
          node.childForFieldName("export_clause") ??
          node.children.find((c) => c.type === "export_clause");

        if (clause) {
          for (const spec of clause.namedChildren) {
            if (spec.type === "export_specifier") {
              const nameNode =
                spec.childForFieldName("name") ??
                spec.children.find(
                  (c) => c.type === "identifier" || c.type === "type_identifier"
                );
              const aliasNode = spec.childForFieldName("alias");

              if (nameNode) {
                const imported_name = nameNode.text;
                const exported_name = aliasNode ? aliasNode.text : imported_name;
                fileReExports!.push({
                  exported_name,
                  imported_name,
                  source: specifier,
                  resolved_file,
                  line,
                });
              }
            }
          }
        }
        return;
      }
    }

    if (node.type === "call_expression") {
      const funcNode =
        node.childForFieldName("function") ?? node.namedChild(0);

      if (funcNode && funcNode.text === "require") {
        const argsNode =
          node.childForFieldName("arguments") ?? node.namedChild(1);
        if (argsNode && argsNode.namedChildCount > 0) {
          const firstArg = argsNode.namedChild(0);
          if (firstArg && firstArg.type === "string") {
            const specifier = cleanStringLiteral(firstArg.text);
            const resolved_file = resolveTsJsImport(
              file.path,
              specifier,
              allFiles,
              tsConfig,
              rootDirOffset
            );
            const line = node.startPosition.row + 1;

            const parent = node.parent;
            if (
              parent &&
              parent.type === "member_expression" &&
              parent.parent?.type === "variable_declarator"
            ) {
              const localNode =
                parent.parent.childForFieldName("name") ?? parent.parent.namedChild(0);
              const propNode = parent.childForFieldName("property");
              if (localNode?.type === "identifier" && propNode) {
                fileImports!.set(localNode.text, {
                  local_name: localNode.text,
                  imported_name: propNode.text,
                  source: specifier,
                  resolved_file,
                  is_default: false,
                  is_namespace: false,
                  line,
                });
              }
            } else if (parent && parent.type === "variable_declarator") {
              const nameNode =
                parent.childForFieldName("name") ?? parent.namedChild(0);
              if (nameNode) {
                if (nameNode.type === "identifier") {
                  fileImports!.set(nameNode.text, {
                    local_name: nameNode.text,
                    imported_name: "*",
                    source: specifier,
                    resolved_file,
                    is_default: false,
                    is_namespace: true,
                    line,
                  });
                } else if (nameNode.type === "object_pattern") {
                  extractDestructuredBindings(nameNode, (imported_name, local_name) => {
                    fileImports!.set(local_name, {
                      local_name,
                      imported_name,
                      source: specifier,
                      resolved_file,
                      is_default: false,
                      is_namespace: false,
                      line,
                    });
                  });
                }
              }
            }
          }
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        walk(child);
      }
    }
  }

  walk(file.tree.rootNode);
}

export function resolveReExports(idx: SymbolIndex): void {
  for (const [, fileImports] of idx.imports) {
    for (const [, imp] of fileImports) {
      if (imp.resolved_file && !imp.is_namespace) {
        const targetSymbol = imp.imported_name;
        const res = followBarrelReExport(
          imp.resolved_file,
          targetSymbol,
          idx.re_exports,
          0,
          new Set<string>(),
          (file, name) => idx.symbols.has(`${file}#${name}`)
        );
        if (res) {
          imp.resolved_file = res.file_path;
          imp.imported_name = res.symbol_name;
        }
      }
    }
  }
}

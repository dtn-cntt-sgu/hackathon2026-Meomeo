import type { Node } from "web-tree-sitter";
import type { ParsedFile, SymbolIndex } from "../types";

const TYPE_DECLARATIONS = new Set([
  "class_declaration",
  "interface_declaration",
  "enum_declaration",
  "record_declaration",
]);

export interface JavaSymbolCollectorState {
  idx: SymbolIndex;
}

export interface JavaPackageIndex {
  // Tên lớp đầy đủ `a.b.C` ⇒ file.
  classes: Map<string, string>;
  // Package `a.b` ⇒ tên lớp ngắn ⇒ file.
  packages: Map<string, Map<string, string>>;
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (const child of node.namedChildren) {
    walk(child, visit);
  }
}

// `List<Article>` ⇒ List, `Article[]` ⇒ Article, `a.b.C` ⇒ C.
export function javaTypeName(node: Node): string {
  const text = node.text.split("<")[0].split("[")[0].trim();
  return text.slice(text.lastIndexOf(".") + 1);
}

export function extractJavaPackage(root: Node): string {
  const declaration = root.namedChildren.find((c) => c.type === "package_declaration");
  const name = declaration?.namedChildren.find(
    (c) => c.type === "scoped_identifier" || c.type === "identifier"
  );
  return name?.text ?? "";
}

export function buildJavaPackageMap(allFiles: ParsedFile[]): JavaPackageIndex {
  const index: JavaPackageIndex = { classes: new Map(), packages: new Map() };

  for (const file of allFiles) {
    const pkg = extractJavaPackage(file.tree.rootNode);
    for (const node of file.tree.rootNode.namedChildren) {
      if (!TYPE_DECLARATIONS.has(node.type)) {
        continue;
      }
      const name = node.childForFieldName("name")?.text;
      if (!name) {
        continue;
      }
      index.classes.set(pkg ? `${pkg}.${name}` : name, file.path);
      let inPackage = index.packages.get(pkg);
      if (!inPackage) {
        inPackage = new Map();
        index.packages.set(pkg, inPackage);
      }
      inPackage.set(name, file.path);
    }
  }

  return index;
}

export function collectJavaImports(
  file: ParsedFile,
  allFiles: ParsedFile[],
  idx: SymbolIndex,
  prebuiltMap?: JavaPackageIndex
): void {
  const map = prebuiltMap ?? buildJavaPackageMap(allFiles);
  const imports = idx.imports.get(file.path) ?? new Map();
  idx.imports.set(file.path, imports);

  const add = (name: string, source: string, resolvedFile: string | null, line: number): void => {
    imports.set(name, {
      local_name: name,
      imported_name: name,
      source,
      resolved_file: resolvedFile,
      is_default: false,
      is_namespace: false,
      line,
    });
  };

  // Cùng package không cần import. Import tường minh ghi sau nên được ưu tiên.
  for (const [name, target] of map.packages.get(extractJavaPackage(file.tree.rootNode)) ?? []) {
    if (target !== file.path) {
      add(name, name, target, 0);
    }
  }

  for (const node of file.tree.rootNode.namedChildren) {
    if (node.type !== "import_declaration") {
      continue;
    }
    const scoped = node.namedChildren.find(
      (c) => c.type === "scoped_identifier" || c.type === "identifier"
    );
    if (!scoped) {
      continue;
    }
    const line = node.startPosition.row + 1;

    if (node.namedChildren.some((c) => c.type === "asterisk")) {
      for (const [name, target] of map.packages.get(scoped.text) ?? []) {
        add(name, `${scoped.text}.${name}`, target, line);
      }
      continue;
    }

    const name = scoped.text.slice(scoped.text.lastIndexOf(".") + 1);
    add(name, scoped.text, map.classes.get(scoped.text) ?? null, line);
  }
}

function typeListOf(node: Node | undefined | null): Node[] {
  const list = node?.namedChildren.find((c) => c.type === "type_list");
  return list?.namedChildren ?? [];
}

// `collectSymbols` đã có định nghĩa. Hàm này bổ sung phần riêng của Java:
// kiểu field (ENG-22, ENT-43), lớp cài đặt (ENG-23), lớp cha.
export function collectJavaSymbols(
  file: ParsedFile,
  state: JavaSymbolCollectorState,
  _keyCounts?: Map<string, number>
): void {
  void _keyCounts;
  const { idx } = state;

  walk(file.tree.rootNode, (node) => {
    if (!TYPE_DECLARATIONS.has(node.type)) {
      return;
    }
    const className = node.childForFieldName("name")?.text;
    if (!className) {
      return;
    }
    const classKey = `${file.path}#${className}`;

    const superclass = node.childForFieldName("superclass")?.namedChild(0);
    if (superclass) {
      idx.class_parents.set(classKey, javaTypeName(superclass));
    }

    for (const iface of typeListOf(node.childForFieldName("interfaces"))) {
      const name = javaTypeName(iface);
      const impls = idx.interface_impls.get(name) ?? [];
      impls.push(classKey);
      idx.interface_impls.set(name, impls);
    }

    const parentInterface = typeListOf(
      node.namedChildren.find((c) => c.type === "extends_interfaces")
    )[0];
    if (parentInterface) {
      idx.class_parents.set(classKey, javaTypeName(parentInterface));
    }

    const body = node.childForFieldName("body");
    for (const member of body?.namedChildren ?? []) {
      if (member.type === "field_declaration") {
        const type = member.childForFieldName("type");
        const name = member.childForFieldName("declarator")?.childForFieldName("name");
        if (type && name) {
          idx.field_types.set(`${classKey}.${name.text}`, javaTypeName(type));
        }
      } else if (member.type === "constructor_declaration") {
        for (const param of member.childForFieldName("parameters")?.namedChildren ?? []) {
          const type = param.childForFieldName("type");
          const name = param.childForFieldName("name");
          const key = `${classKey}.${name?.text}`;
          if (type && name && !idx.field_types.has(key)) {
            idx.field_types.set(key, javaTypeName(type));
          }
        }
      }
    }
  });
}

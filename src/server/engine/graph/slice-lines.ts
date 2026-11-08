import type { Node } from "web-tree-sitter";
import { extractBoundNames } from "./symbols";

// ENG-85 (mục 6 của Mục 8): chọn dòng giữ trong một hàm, làm việc trên cây cú pháp
// để câu lệnh nhiều dòng và dấu đóng ngoặc không bị cắt mất.

const BLOCK_TYPES = new Set([
  "statement_block",
  "block",
  "constructor_body",
  "switch_body",
  "switch_block",
  "program",
]);

const CASE_TYPES = new Set([
  "switch_case",
  "switch_default",
  "switch_block_statement_group",
]);

const COMPOUND_TYPES = new Set([
  "if_statement",
  "for_statement",
  "for_in_statement",
  "enhanced_for_statement",
  "while_statement",
  "do_statement",
  "try_statement",
  "switch_statement",
  "switch_expression",
]);

const LOOP_TYPES = new Set([
  "for_statement",
  "for_in_statement",
  "enhanced_for_statement",
  "while_statement",
  "do_statement",
]);

export const CALL_TYPES = new Set([
  "call_expression",
  "new_expression",
  "method_invocation",
  "object_creation_expression",
]);

const EXIT_TYPES = new Set([
  "return_statement",
  "throw_statement",
  "yield_expression",
  "continue_statement",
  "break_statement",
]);

const MUTATING_METHODS = new Set(["push", "add", "set", "unshift"]);

export interface LineSelection {
  kept: Set<number>;
  signatureEnd: number;
}

interface SelectOptions {
  fnNode: Node;
  rangeStart: number;
  rangeEnd: number;
  seedRows: Set<number>;
  moduleVarLines: (name: string) => { start: number; end: number } | null;
}

function rowOf(line: Node["startPosition"]): number {
  return line.row + 1;
}

function bodyOf(fnNode: Node): Node | null {
  return fnNode.childForFieldName("body");
}

// Lên tới câu lệnh chứa node: node nằm thẳng trong một khối.
function statementOf(node: Node, fnNode: Node): Node {
  let curr: Node = node;
  while (curr.id !== fnNode.id && curr.parent) {
    const parent: Node = curr.parent;
    if (BLOCK_TYPES.has(parent.type) || CASE_TYPES.has(parent.type)) {
      return curr;
    }
    curr = parent;
  }
  return curr;
}

function walkNamed(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (const child of node.namedChildren) {
    walkNamed(child, visit);
  }
}

function rootIdentifier(node: Node | null): string | null {
  let curr = node;
  while (curr) {
    if (curr.type === "identifier") {
      return curr.text;
    }
    if (curr.type === "member_expression" || curr.type === "subscript_expression") {
      curr = curr.childForFieldName("object");
    } else if (curr.type === "field_access") {
      curr = curr.childForFieldName("object");
    } else {
      return null;
    }
  }
  return null;
}

function collectDefinitions(fnNode: Node): Map<string, Node[]> {
  const defs = new Map<string, Node[]>();
  const add = (name: string | null, node: Node): void => {
    if (!name) {
      return;
    }
    const stmt = statementOf(node, fnNode);
    const list = defs.get(name);
    if (list) {
      list.push(stmt);
    } else {
      defs.set(name, [stmt]);
    }
  };

  const body = bodyOf(fnNode);
  if (!body) {
    return defs;
  }

  walkNamed(body, (n) => {
    if (n.type === "variable_declarator") {
      const nameNode = n.childForFieldName("name");
      if (nameNode) {
        for (const name of extractBoundNames(nameNode)) {
          add(name, n);
        }
      }
    } else if (n.type === "assignment_expression" || n.type === "augmented_assignment_expression") {
      add(rootIdentifier(n.childForFieldName("left")), n);
    } else if (n.type === "call_expression") {
      const fn = n.childForFieldName("function");
      if (
        fn?.type === "member_expression" &&
        MUTATING_METHODS.has(fn.childForFieldName("property")?.text ?? "")
      ) {
        add(rootIdentifier(fn.childForFieldName("object")), n);
      }
    } else if (n.type === "for_in_statement") {
      const left = n.childForFieldName("left");
      if (left) {
        for (const name of extractBoundNames(left)) {
          add(name, n);
        }
      }
    } else if (n.type === "enhanced_for_statement") {
      add(n.childForFieldName("name")?.text ?? null, n);
    }
  });

  return defs;
}

// Tên được đọc trong câu lệnh. Câu ghép chỉ đọc phần đầu, không đọc thân.
function readNames(stmt: Node): Set<string> {
  const names = new Set<string>();
  const visit = (n: Node, isRoot: boolean): void => {
    if (!isRoot && COMPOUND_TYPES.has(stmt.type) && BLOCK_TYPES.has(n.type)) {
      return;
    }
    if (n.type === "identifier" || n.type === "shorthand_property_identifier") {
      names.add(n.text);
    }
    for (const child of n.namedChildren) {
      visit(child, false);
    }
  };
  visit(stmt, true);
  return names;
}

function sharesLoop(a: Node, b: Node, fnNode: Node): boolean {
  let curr: Node | null = a.parent;
  while (curr && curr.id !== fnNode.id) {
    if (
      LOOP_TYPES.has(curr.type) &&
      curr.startIndex <= b.startIndex &&
      b.endIndex <= curr.endIndex
    ) {
      return true;
    }
    curr = curr.parent;
  }
  return false;
}

export function selectLines(options: SelectOptions): LineSelection {
  const { fnNode, rangeStart, rangeEnd, seedRows, moduleVarLines } = options;
  const kept = new Set<number>();
  const body = bodyOf(fnNode);

  const addRows = (from: number, to: number): void => {
    for (let row = from; row <= to; row++) {
      kept.add(row);
    }
  };

  // Chữ ký và dòng đóng.
  const signatureEnd = body ? rowOf(body.startPosition) : rangeEnd;
  addRows(rangeStart, signatureEnd);
  kept.add(rangeEnd);
  kept.add(rowOf(fnNode.endPosition));

  if (!body || !BLOCK_TYPES.has(body.type)) {
    addRows(rangeStart, rangeEnd);
    return { kept, signatureEnd: rangeEnd };
  }

  const defs = collectDefinitions(fnNode);
  const queue: Node[] = [];
  const seen = new Set<number>();

  const keepStatement = (stmt: Node): void => {
    if (seen.has(stmt.id)) {
      return;
    }
    seen.add(stmt.id);
    queue.push(stmt);

    if (COMPOUND_TYPES.has(stmt.type)) {
      const inner = stmt.namedChildren.find((c) => BLOCK_TYPES.has(c.type));
      addRows(rowOf(stmt.startPosition), inner ? rowOf(inner.startPosition) : rowOf(stmt.endPosition));
    } else {
      addRows(rowOf(stmt.startPosition), rowOf(stmt.endPosition));
    }

    // Điều khiển: đầu và đóng của mọi khối bao ngoài, gồm else, catch, callback.
    let curr: Node | null = stmt.parent;
    while (curr && curr.id !== body.id && curr.id !== fnNode.id) {
      if (CASE_TYPES.has(curr.type)) {
        kept.add(rowOf(curr.startPosition));
      } else if (BLOCK_TYPES.has(curr.type)) {
        kept.add(rowOf(curr.endPosition));
        const owner = curr.parent ? statementOf(curr.parent, fnNode) : null;
        if (owner) {
          addRows(rowOf(owner.startPosition), rowOf(curr.startPosition));
          if (!seen.has(owner.id) && owner.id !== fnNode.id) {
            seen.add(owner.id);
            queue.push(owner);
          }
        }
        const clause = curr.parent;
        if (clause && clause.id !== owner?.id) {
          kept.add(rowOf(clause.startPosition));
        }
      }
      curr = curr.parent;
    }
  };

  walkNamed(body, (n) => {
    const isSeedCall = CALL_TYPES.has(n.type) && seedRows.has(rowOf(n.startPosition));
    if (isSeedCall || EXIT_TYPES.has(n.type)) {
      keepStatement(statementOf(n, fnNode));
    }
  });

  // Def-use lùi tới bất động.
  while (queue.length > 0) {
    const stmt = queue.pop();
    if (!stmt) {
      break;
    }
    for (const name of readNames(stmt)) {
      const definitions = defs.get(name);
      if (definitions) {
        for (const def of definitions) {
          if (def.startIndex <= stmt.startIndex || sharesLoop(stmt, def, fnNode)) {
            keepStatement(def);
          }
        }
      } else {
        const moduleVar = moduleVarLines(name);
        if (moduleVar) {
          addRows(moduleVar.start, moduleVar.end);
        }
      }
    }
  }

  return { kept, signatureEnd };
}

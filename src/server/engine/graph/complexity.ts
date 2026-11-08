import type { Node } from "web-tree-sitter";
import type { FunctionInfo, ParsedFile } from "./types";

const LOGICAL_OPERATORS = new Set(["&&", "||", "and", "or"]);

function getLogicalOperator(node: Node): string | null {
  const opNode =
    node.childForFieldName("operator") ??
    node.children.find((c) => LOGICAL_OPERATORS.has(c.text));
  return opNode && LOGICAL_OPERATORS.has(opNode.text) ? opNode.text : null;
}

function getFunctionName(fnNode: Node): string | null {
  const nameNode = fnNode.childForFieldName("name");
  if (nameNode && nameNode.text) {
    return nameNode.text;
  }
  const parent = fnNode.parent;
  if (parent) {
    if (parent.type === "variable_declarator") {
      const declName = parent.childForFieldName("name");
      if (declName && declName.text) {
        return declName.text;
      }
    } else if (parent.type === "pair") {
      const keyName = parent.childForFieldName("key");
      if (keyName && keyName.text) {
        return keyName.text;
      }
    }
  }
  return null;
}

function isElseIf(node: Node): boolean {
  if (node.type !== "if_statement") {
    return false;
  }
  const parent = node.parent;
  if (!parent) {
    return false;
  }
  if (parent.type === "else_clause") {
    return true;
  }
  if (parent.type === "if_statement" && parent.childForFieldName("alternative")?.id === node.id) {
    return true;
  }
  return false;
}

export function computeComplexity(fnNode: Node): number {
  let score = 0;
  let hasRecursion = false;
  const fnName = getFunctionName(fnNode);

  function walk(node: Node, nesting: number): void {
    // Check for recursion
    if (!hasRecursion && fnName && node.id !== fnNode.id) {
      if (node.type === "call_expression" || node.type === "method_invocation") {
        const fnCallee = node.childForFieldName("function") ?? node.childForFieldName("name");
        if (fnCallee) {
          if (fnCallee.type === "identifier" && fnCallee.text === fnName) {
            hasRecursion = true;
            score += 1;
          } else if (fnCallee.type === "member_expression") {
            const prop = fnCallee.childForFieldName("property");
            const obj = fnCallee.childForFieldName("object");
            if (prop && prop.text === fnName && obj && obj.type === "this") {
              hasRecursion = true;
              score += 1;
            }
          }
        }
      }
    }

    // 1. if statement
    if (node.type === "if_statement") {
      const elseIf = isElseIf(node);
      if (elseIf) {
        score += 1; // +1, không cộng mức lồng
      } else {
        score += 1 + nesting; // +1 + mức lồng
      }

      // Condition evaluated at current nesting
      const cond = node.childForFieldName("condition");
      if (cond) {
        walk(cond, nesting);
      }

      // Consequence evaluated at nesting + 1
      const consequence = node.childForFieldName("consequence");
      if (consequence) {
        walk(consequence, nesting + 1);
      }

      // Alternative
      const alt = node.childForFieldName("alternative");
      if (alt) {
        if (alt.type === "else_clause") {
          // TS/JS: else_clause can contain if_statement (else if) or other body (else)
          const childIf = alt.children.find((c) => c.type === "if_statement");
          if (childIf) {
            walk(childIf, nesting);
          } else {
            // pure else: +1, không cộng mức lồng
            score += 1;
            for (const child of alt.children) {
              if (child.type !== "else") {
                walk(child, nesting + 1);
              }
            }
          }
        } else {
          // Java: if alternative is another if_statement, it is else if
          if (alt.type === "if_statement") {
            walk(alt, nesting);
          } else {
            // pure else
            score += 1;
            walk(alt, nesting + 1);
          }
        }
      }
      return;
    }

    // 2. Loops: for, for..in, for..of, while, do..while, enhanced_for
    if (
      node.type === "for_statement" ||
      node.type === "for_in_statement" ||
      node.type === "enhanced_for_statement" ||
      node.type === "while_statement" ||
      node.type === "do_statement"
    ) {
      score += 1 + nesting;

      const body = node.childForFieldName("body");
      // Other children (init, condition, update) evaluated at current nesting
      for (const child of node.children) {
        if (child.id === body?.id) {
          walk(child, nesting + 1);
        } else {
          walk(child, nesting);
        }
      }
      return;
    }

    // 3. Ternary / conditional expression
    if (
      node.type === "ternary_expression" ||
      node.type === "conditional_expression"
    ) {
      score += 1 + nesting;
      const cond = node.childForFieldName("condition");
      const cons = node.childForFieldName("consequence");
      const alt = node.childForFieldName("alternative");
      if (cond) walk(cond, nesting);
      if (cons) walk(cons, nesting + 1);
      if (alt) walk(alt, nesting + 1);
      return;
    }

    // 4. Switch statement / expression
    if (
      node.type === "switch_statement" ||
      node.type === "switch_expression" ||
      node.type === "match_statement"
    ) {
      score += 1 + nesting;
      const value = node.childForFieldName("value");
      const body = node.childForFieldName("body");
      if (value) walk(value, nesting);
      if (body) {
        walk(body, nesting + 1);
      } else {
        for (const child of node.children) {
          if (child.id !== value?.id) {
            walk(child, nesting + 1);
          }
        }
      }
      return;
    }

    // 5. Catch clause
    if (node.type === "catch_clause") {
      score += 1 + nesting;
      const body =
        node.childForFieldName("body") ??
        node.children.find(
          (c) => c.type === "statement_block" || c.type === "block"
        );
      for (const child of node.children) {
        if (child.id === body?.id) {
          walk(child, nesting + 1);
        } else {
          walk(child, nesting);
        }
      }
      return;
    }

    // 6. Nested functions / lambdas
    if (
      node.id !== fnNode.id &&
      (node.type === "function_declaration" ||
        node.type === "function_expression" ||
        node.type === "arrow_function" ||
        node.type === "generator_function_declaration")
    ) {
      const body =
        node.childForFieldName("body") ??
        node.children.find(
          (c) =>
            c.type === "statement_block" ||
            c.type === "block" ||
            c.type === "expression_statement"
        );
      for (const child of node.children) {
        if (child.id === body?.id) {
          walk(child, nesting + 1);
        } else {
          walk(child, nesting);
        }
      }
      return;
    }

    // 7. Logical operator sequence (&&, ||, and, or)
    if (node.type === "binary_expression" || node.type === "boolean_operator") {
      const op = getLogicalOperator(node);
      if (op) {
        let p = node.parent;
        while (p && p.type === "parenthesized_expression") {
          p = p.parent;
        }
        const parentOp =
          p && (p.type === "binary_expression" || p.type === "boolean_operator")
            ? getLogicalOperator(p)
            : null;

        if (parentOp !== op) {
          score += 1;
        }
      }
      for (const child of node.children) {
        walk(child, nesting);
      }
      return;
    }

    // 8. Labeled break / continue
    if (node.type === "break_statement" || node.type === "continue_statement") {
      const label = node.children.find(
        (c) => c.type === "statement_identifier" || c.type === "identifier"
      );
      if (label) {
        score += 1;
      }
      return;
    }

    // 9. Goto
    if (node.type === "goto_statement") {
      score += 1;
      return;
    }

    // Default: traverse all children with current nesting
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        walk(child, nesting);
      }
    }
  }

  // Walk statements inside fnNode body
  const body =
    fnNode.childForFieldName("body") ??
    fnNode.children.find(
      (c) =>
        c.type === "statement_block" ||
        c.type === "block" ||
        c.type === "constructor_body"
    );

  if (body) {
    for (let i = 0; i < body.childCount; i++) {
      const child = body.child(i);
      if (child) {
        walk(child, 0);
      }
    }
  } else {
    // Arrow function without block body: () => expr
    for (let i = 0; i < fnNode.childCount; i++) {
      const child = fnNode.child(i);
      if (
        child &&
        child.type !== "parameters" &&
        child.type !== "formal_parameters"
      ) {
        walk(child, 0);
      }
    }
  }

  return score;
}

const FUNCTION_NODE_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "arrow_function",
  "method_definition",
  "method_declaration",
  "constructor_declaration",
]);

// Node hàm ngoài cùng kết thúc đúng dòng `lineEnd`, bắt đầu từ `lineStart` trở đi
// (`lineStart` có thể là decorator hoặc `const f =`).
export function findFunctionNode(
  file: ParsedFile,
  lineStart: number,
  lineEnd: number
): Node | null {
  let found: Node | null = null;

  const walk = (node: Node): void => {
    if (
      found ||
      node.endPosition.row + 1 < lineEnd ||
      node.startPosition.row + 1 > lineEnd
    ) {
      return;
    }
    if (
      FUNCTION_NODE_TYPES.has(node.type) &&
      node.endPosition.row + 1 === lineEnd &&
      node.startPosition.row + 1 >= lineStart
    ) {
      found = node;
      return;
    }
    for (const child of node.namedChildren) {
      walk(child);
    }
  };

  walk(file.tree.rootNode);
  return found;
}

export function fillComplexity(
  files: ParsedFile[],
  functions: Map<string, FunctionInfo>
): void {
  const fileMap = new Map<string, ParsedFile>();
  for (const f of files) {
    fileMap.set(f.path, f);
  }

  for (const [key, fnInfo] of functions.entries()) {
    if (key.endsWith("#<module>") || fnInfo.name === "<module>") {
      fnInfo.complexity = 0;
      continue;
    }

    const file = fileMap.get(fnInfo.file_path);
    if (!file) {
      fnInfo.complexity = 0;
      continue;
    }

    const fnNode = findFunctionNode(file, fnInfo.line_start, fnInfo.line_end);
    if (!fnNode) {
      fnInfo.complexity = 0;
      continue;
    }

    fnInfo.complexity = computeComplexity(fnNode);
  }
}

import type { Node } from "web-tree-sitter";
import type { StepBranch } from "@/contracts";

const CONDITION_MAX_CHARS = 80;

// Ranh giới hàm: lời gọi bên trong thuộc về hàm khác, không leo tiếp.
const FUNCTION_TYPES = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "function",
  "method_definition",
  "arrow_function",
  "method_declaration",
  "constructor_declaration",
  "lambda_expression",
]);

const LOOP_TYPES = new Set([
  "for_statement",
  "for_in_statement",
  "enhanced_for_statement",
  "while_statement",
  "do_statement",
]);

// Hàm callback mà thân chạy lặp theo từng phần tử.
const TS_LOOP_METHODS = new Set([
  "forEach",
  "map",
  "flatMap",
  "filter",
  "reduce",
  "some",
  "every",
  "find",
  "findIndex",
]);
const JAVA_STREAM_METHODS = new Set([
  "map",
  "flatMap",
  "filter",
  "reduce",
  "peek",
  "anyMatch",
  "allMatch",
  "noneMatch",
  "forEach",
  "forEachOrdered",
]);

function sameNode(a: Node | null | undefined, b: Node | null | undefined): boolean {
  return !!a && !!b && a.id === b.id;
}

/** 1 dòng, bỏ ngoặc bao ngoài, ≤ 80 ký tự. */
export function conditionText(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  if (text.startsWith("(") && text.endsWith(")")) {
    text = text.slice(1, -1).trim();
  }
  return text.length <= CONDITION_MAX_CHARS ? text : `${text.slice(0, CONDITION_MAX_CHARS - 1)}…`;
}

function negate(condition: string): string {
  return conditionText(`!(${condition})`);
}

/** Lời gọi phương thức nhận callback `fn` làm đối số, hoặc null. */
function callbackOwner(fn: Node): Node | null {
  const args = fn.parent;
  if (!args || (args.type !== "arguments" && args.type !== "argument_list")) {
    return null;
  }
  const call = args.parent;
  return call && (call.type === "call_expression" || call.type === "method_invocation") ? call : null;
}

/**
 * Callback lặp ⇒ LOOP tên phương thức. Java: chỉ khi là `forEach` hoặc có `.stream()` trước đó;
 * `findBySlug(...).map(x -> ...)` là Optional, nhánh "không có" đã là lỗi 404 ⇒ luồng chính.
 */
function loopOfCallback(fn: Node): StepBranch | null {
  const call = callbackOwner(fn);
  if (!call) {
    return null;
  }
  if (call.type === "call_expression") {
    const callee = call.childForFieldName("function");
    const name = callee?.type === "member_expression" ? callee.childForFieldName("property")?.text : undefined;
    return name && TS_LOOP_METHODS.has(name) ? { kind: "LOOP", condition: name } : null;
  }
  const name = call.childForFieldName("name")?.text ?? "";
  const receiver = call.childForFieldName("object")?.text ?? "";
  const isStream = /\.stream\(\s*\)|\bStream\./.test(receiver);
  if (name === "forEach" || name === "forEachOrdered" || (isStream && JAVA_STREAM_METHODS.has(name))) {
    return { kind: "LOOP", condition: name };
  }
  return null;
}

/** Nhãn case: TS `case X:` ⇒ field value; Java `case X ->` ⇒ switch_label đầu. */
function switchLabel(node: Node): string {
  if (node.type === "switch_default") {
    return "default";
  }
  if (node.type === "switch_case") {
    return conditionText(node.childForFieldName("value")?.text ?? "case");
  }
  const label = node.namedChildren.find((c) => c?.type === "switch_label");
  const text = (label?.text ?? "").replace(/^case\s+/, "").trim();
  return text === "" || text === "default" ? "default" : conditionText(text);
}

function catchParam(node: Node): string {
  const param =
    node.childForFieldName("parameter") ??
    node.namedChildren.find((c) => c?.type === "catch_formal_parameter") ??
    null;
  return param ? conditionText(param.text) : "lỗi";
}

function loopHeader(node: Node): string {
  const body = node.childForFieldName("body");
  const condition = node.childForFieldName("condition");
  if (condition) {
    return conditionText(condition.text);
  }
  const header = body ? node.text.slice(0, body.startIndex - node.startIndex) : node.text;
  return conditionText(header.replace(/^(for|while)\s*/, ""));
}

/**
 * Điều kiện gần nhất bao lời gọi, trong cùng hàm (task nhánh phụ). null ⇒ luồng chính.
 * Lời gọi nằm ngay trong điều kiện (`if (isValid(x))`) hay trong `try` không phải nhánh.
 */
/** Như `guardOf`, kèm dòng (1-based) của câu điều kiện: if, else, case, catch, vòng lặp, callback lặp. */
export function guardInfoOf(callNode: Node): { branch: StepBranch; line: number } | null {
  let child: Node = callNode;
  let node: Node | null = callNode.parent;

  while (node) {
    if (FUNCTION_TYPES.has(node.type)) {
      const loop =
        node.type === "arrow_function" || node.type === "function_expression" || node.type === "lambda_expression"
          ? loopOfCallback(node)
          : null;
      return loop ? { branch: loop, line: node.startPosition.row + 1 } : null;
    }

    if (node.type === "if_statement") {
      const condition = node.childForFieldName("condition");
      if (sameNode(child, node.childForFieldName("consequence"))) {
        return { branch: { kind: "IF", condition: conditionText(condition?.text ?? "") }, line: node.startPosition.row + 1 };
      }
      if (sameNode(child, node.childForFieldName("alternative"))) {
        return {
          branch: { kind: "ELSE", condition: negate(conditionText(condition?.text ?? "")) },
          line: (node.childForFieldName("alternative") ?? node).startPosition.row + 1,
        };
      }
    } else if (node.type === "ternary_expression") {
      const condition = conditionText(node.childForFieldName("condition")?.text ?? "");
      if (sameNode(child, node.childForFieldName("consequence"))) {
        return { branch: { kind: "TERNARY", condition }, line: node.startPosition.row + 1 };
      }
      if (sameNode(child, node.childForFieldName("alternative"))) {
        return { branch: { kind: "ELSE", condition: negate(condition) }, line: node.startPosition.row + 1 };
      }
    } else if (
      node.type === "switch_case" ||
      node.type === "switch_default" ||
      node.type === "switch_block_statement_group" ||
      node.type === "switch_rule"
    ) {
      const isLabel =
        sameNode(child, node.childForFieldName("value")) || child.type === "switch_label";
      if (!isLabel) {
        return { branch: { kind: "SWITCH", condition: switchLabel(node) }, line: node.startPosition.row + 1 };
      }
    } else if (node.type === "catch_clause") {
      if (sameNode(child, node.childForFieldName("body")) || child.type === "block") {
        return { branch: { kind: "CATCH", condition: catchParam(node) }, line: node.startPosition.row + 1 };
      }
    } else if (LOOP_TYPES.has(node.type)) {
      if (sameNode(child, node.childForFieldName("body"))) {
        return { branch: { kind: "LOOP", condition: loopHeader(node) }, line: node.startPosition.row + 1 };
      }
    }

    child = node;
    node = node.parent;
  }
  return null;
}

export function guardOf(callNode: Node): StepBranch | null {
  return guardInfoOf(callNode)?.branch ?? null;
}

/** Trường guard của CallSite: điều kiện và dòng của nó (để giữ dòng điều kiện trong snippet bước cha). */
export function guardFieldsOf(callNode: Node): { guard: StepBranch | null; guard_line: number | null } {
  const info = guardInfoOf(callNode);
  return { guard: info?.branch ?? null, guard_line: info?.line ?? null };
}

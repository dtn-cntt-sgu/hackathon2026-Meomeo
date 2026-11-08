import type {
  GradeContext,
  HybridArchitecturalNode,
  StaticEngineResult,
} from "@/contracts";
import {
  IDENT_RE,
  LANGUAGE_WORDS,
  backticks,
  identWords,
  nodeCodeText,
  norm,
} from "./text";

export interface NameScope {
  files: readonly string[];
  words: Set<string>;
  extra: Set<string>;
  relaxed: boolean;
}

export function nodeScope(
  node: HybridArchitecturalNode,
  graph: StaticEngineResult,
): NameScope {
  const code = [
    ...graph.symbol_whitelist,
    ...graph.file_index,
    nodeCodeText(node),
  ].join("\n");

  return {
    files: graph.file_index,
    words: identWords(code),
    extra: new Set<string>(),
    relaxed: node.support_tier === "STRUCTURAL",
  };
}

export function repoScope(graph: StaticEngineResult): NameScope {
  const allNodesCode = graph.nodes.map(nodeCodeText).join("\n");
  const code = [
    ...graph.symbol_whitelist,
    ...graph.file_index,
    allNodesCode,
  ].join("\n");

  const extra = new Set<string>();
  for (const n of graph.nodes) {
    extra.add(n.id);
    extra.add(n.title);
  }

  return {
    files: graph.file_index,
    words: identWords(code),
    extra,
    relaxed: graph.nodes.some((n) => n.support_tier === "STRUCTURAL"),
  };
}

export function gradeScope(t: GradeContext, answer: string): NameScope {
  const stepText = (t.steps ?? [])
    .map((s) => `${s.function_name}\n${s.file_path}`)
    .join("\n");
  const text = [
    stepText,
    t.feynman_question ?? "",
    t.reference_answer ?? "",
    answer,
  ].join("\n");

  return {
    files: (t.steps ?? []).map((s) => s.file_path),
    words: identWords(text),
    extra: new Set<string>(),
    relaxed: false,
  };
}

export function explainScope(
  node: HybridArchitecturalNode,
  stepNumber: number,
  refNames: string[],
  graph: StaticEngineResult,
): NameScope {
  const step = node.trace_steps.find((s) => s.step_number === stepNumber);
  const stepCode = step ? `${step.function_name}\n${step.snippet}` : "";
  const files = node.files ?? [];
  const text = [
    stepCode,
    node.dto_snippet ?? "",
    ...refNames,
    ...files,
    ...(graph?.file_index ?? []),
  ].join("\n");

  return {
    files,
    words: identWords(text),
    extra: new Set<string>(refNames),
    relaxed: node.support_tier === "STRUCTURAL",
  };
}

export function isValidName(s: string, sc: NameScope): boolean {
  const t = s.trim().replace(/^\.\//, "");
  if (sc.files.some((f) => f === t || f.endsWith("/" + t)) || sc.extra.has(t)) {
    return true;
  }
  IDENT_RE.lastIndex = 0;
  const ws = (
    t.replace(/(['"])(?:\\.|(?!\1).)*\1/g, " ").match(IDENT_RE) ?? []
  ).filter((w) => !LANGUAGE_WORDS.has(w.toLowerCase()));
  if (ws.length === 0) return true;
  const inScope = (w: string) => sc.words.has(norm(w));
  return sc.relaxed ? ws.some(inScope) : ws.every(inScope);
}

export const checkNames = (texts: string[], sc: NameScope): string[] =>
  texts.flatMap(backticks).filter((b) => !isValidName(b, sc));

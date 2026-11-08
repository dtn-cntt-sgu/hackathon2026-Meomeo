import {
  SWE_SKILLS,
  type ExplainSelectionRaw,
  type GuardIssue,
} from "@/contracts";
import { firstSentences } from "./text";
import { checkNames, type NameScope } from "./names";
import { findForbidden } from "./forbidden";

export const LINE_RE =
  /\b(?:dòng|dong|line|lines)\s+(\d+)(?:\s*(?:[–—-]|đến|den|to)\s*(\d+))?/giu;

export function invalidLineRefs(text: string, allowed: Set<number>): string[] {
  const invalid: string[] = [];
  LINE_RE.lastIndex = 0;
  for (const match of text.matchAll(LINE_RE)) {
    const start = parseInt(match[1], 10);
    const end = match[2] !== undefined ? parseInt(match[2], 10) : undefined;
    if (end !== undefined) {
      if (start > end || !allowed.has(start) || !allowed.has(end)) {
        invalid.push(match[0]);
      }
    } else {
      if (!allowed.has(start)) {
        invalid.push(match[0]);
      }
    }
  }
  return invalid;
}

export function checkExplain(
  raw: ExplainSelectionRaw,
  scope: NameScope,
  forbidden: string[],
  issues: GuardIssue[] = [],
): ExplainSelectionRaw | null {
  // 1. Structural check (E1)
  if (!raw || typeof raw !== "object") {
    issues.push({ code: "E1" });
    return null;
  }

  const validKinds = ["KEYWORD", "NAME", "CODE"];
  const isKindValid =
    typeof raw.kind === "string" && validKinds.includes(raw.kind);
  const isWhatValid =
    typeof raw.what === "string" && raw.what.trim().length > 0;
  const isHereValid =
    typeof raw.here === "string" && raw.here.trim().length > 0;

  if (!isKindValid || !isWhatValid || !isHereValid) {
    issues.push({ code: "E1" });
    return null;
  }

  // 2. Skill check (invalid skill becomes null, not blocked)
  let skill = raw.skill;
  if (skill !== null && !(SWE_SKILLS as readonly string[]).includes(skill)) {
    skill = null;
  }

  // 3. Length truncation
  const what = firstSentences(raw.what, 3);
  const here = firstSentences(raw.here, 2);
  const analogy =
    typeof raw.analogy === "string" && raw.analogy.trim().length > 0
      ? firstSentences(raw.analogy, 1)
      : "";

  // 4. Text checks on truncated fields
  const texts = [what, here, analogy].filter(Boolean);

  // E2: Names not in scope
  const invalidNames = checkNames(texts, scope);
  for (const name of invalidNames) {
    issues.push({ code: "E2", name });
  }

  // E3: Forbidden technologies or bad words
  const forbiddenFound = findForbidden(texts, forbidden);
  for (const kw of forbiddenFound) {
    issues.push({ code: "E3", name: kw });
  }

  // E4: Line number references
  const emptyAllowed = new Set<number>();
  const lineErrors = texts.flatMap((t) => invalidLineRefs(t, emptyAllowed));
  if (lineErrors.length > 0) {
    issues.push({ code: "E4" });
  }

  if (issues.length > 0) {
    return null;
  }

  return {
    kind: raw.kind,
    what,
    here,
    analogy,
    skill,
  };
}

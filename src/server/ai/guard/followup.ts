import type { GradeContext, GradingRaw } from "@/contracts";
import {
  IDENT_RE,
  LANGUAGE_WORDS,
  LOC_RE,
  backticks,
  identWords,
  norm,
  normText,
} from "./text";
import { checkNames, gradeScope } from "./names";

const echoWords = (s: string): string[] =>
  s
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}_.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/gu, ""))
    .filter((w) => w.length > 0);

// Gợi ý gần như chỉ nhắc lại đề (≥ 75% từ của gợi ý có sẵn trong đề) ⇒ không giúp được người học
export function echoesQuestion(hint: string, question: string): boolean {
  const h = echoWords(hint);
  if (h.length === 0) return false;
  const q = new Set(echoWords(question));
  const inQ = h.filter((w) => q.has(w)).length;
  return inQ / h.length >= 0.75;
}
import { findForbidden } from "./forbidden";

const nums = (s: string): Set<string> =>
  new Set(s.match(/\d+/g) ?? []);

export function leaksNumbers(
  text: string,
  t: GradeContext,
  answer: string,
): boolean {
  if (!text || typeof text !== "string") {
    return false;
  }

  const secretSources = [
    t.reference_answer ?? "",
    ...(t.must_have_points ?? []),
  ].join(" ");
  const secretNums = nums(secretSources);

  const allowedSources = [
    t.feynman_question ?? "",
    answer ?? "",
  ].join(" ");
  const allowedNums = nums(allowedSources);

  const leakedNumbers = new Set<string>();
  for (const n of secretNums) {
    if (!allowedNums.has(n)) {
      leakedNumbers.add(n);
    }
  }

  if (leakedNumbers.size === 0) {
    return false;
  }

  const textNums = nums(text);
  for (const n of leakedNumbers) {
    if (textNums.has(n)) {
      return true;
    }
  }

  return false;
}

export function verifyFollowUp(
  g: GradingRaw,
  t: GradeContext,
  answer: string,
  isPassed: boolean,
): { follow_up_ok: boolean; feedback_ok: boolean } {
  // 1. follow_up_ok
  let follow_up_ok = false;
  const q = g.follow_up_question;
  const type = g.follow_up_type;

  if (
    typeof q === "string" &&
    q.trim().length > 0 &&
    (type === "CONCEPT" || type === "CODE_POINTER") &&
    !echoesQuestion(q, t.feynman_question ?? "")
  ) {
    const scope = gradeScope(t, answer);
    const forbidden = findForbidden([q], t.forbidden_external_keywords ?? []);
    const invalidNames = checkNames([q], scope);

    if (forbidden.length === 0 && invalidNames.length === 0) {
      if (type === "CONCEPT") {
        const hasBackticks = backticks(q).length > 0;
        const matchesLoc = LOC_RE.test(q);
        const qLower = q.toLowerCase();
        const containsFile = (t.steps ?? []).some((s) => {
          const basename = s.file_path.split(/[/\\]/).pop();
          return (
            basename &&
            basename.length > 0 &&
            qLower.includes(basename.toLowerCase())
          );
        });

        const qWords = identWords(q);
        const containsFn = (t.steps ?? []).some((s) => {
          const fnParts = s.function_name.split(".");
          const lastPart = fnParts[fnParts.length - 1];
          return (
            lastPart &&
            !LANGUAGE_WORDS.has(lastPart.toLowerCase()) &&
            qWords.has(norm(lastPart))
          );
        });

        const leaks = leaksNumbers(q, t, answer);

        if (
          !hasBackticks &&
          !matchesLoc &&
          !containsFile &&
          !containsFn &&
          !leaks
        ) {
          follow_up_ok = true;
        }
      } else if (type === "CODE_POINTER") {
        const stepOk =
          typeof g.follow_up_step_index === "number" &&
          Number.isInteger(g.follow_up_step_index) &&
          (t.step_indices ?? []).includes(g.follow_up_step_index);

        if (stepOk) {
          const qPrime = q
            .replace(new RegExp(LOC_RE.source, "giu"), " ")
            .replace(
              /\b(?:dòng|dong|line|lines)\s+(\d+)(?:\s*(?:[–—\-]|đến|den|to)\s*(\d+))?/giu,
              " ",
            );
          if (!leaksNumbers(qPrime, t, answer)) {
            follow_up_ok = true;
          }
        }
      }
    }
  }

  // 2. feedback_ok
  let feedback_ok = false;
  const f = g.feedback;

  if (typeof f === "string" && f.trim().length > 0) {
    const scope = gradeScope(t, answer);
    const forbidden = findForbidden([f], t.forbidden_external_keywords ?? []);
    const invalidNames = checkNames([f], scope);

    if (forbidden.length === 0 && invalidNames.length === 0) {
      if (isPassed) {
        feedback_ok = true;
      } else {
        const answerWords = identWords(answer);
        const bt = backticks(f);
        let backticksOk = true;

        for (const b of bt) {
          IDENT_RE.lastIndex = 0;
          const words = (b.match(IDENT_RE) ?? []).filter(
            (w) => !LANGUAGE_WORDS.has(w.toLowerCase()),
          );
          if (words.some((w) => !answerWords.has(norm(w)))) {
            backticksOk = false;
            break;
          }
        }

        let locOk = true;
        const locMatches = [
          ...f.matchAll(new RegExp(LOC_RE.source, "giu")),
        ].map((m) => m[0]);

        if (locMatches.length > 0) {
          const normAns = normText(answer);
          if (!locMatches.every((m) => normAns.includes(normText(m)))) {
            locOk = false;
          }
        }

        const leaks = leaksNumbers(f, t, answer);

        if (backticksOk && locOk && !leaks) {
          feedback_ok = true;
        }
      }
    }
  }

  return { follow_up_ok, feedback_ok };
}

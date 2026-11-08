import { CONFIG } from "@/contracts/config";

export function validateAnswerLength(
  a: string
): "ERR_ANSWER_TOO_SHORT" | "ERR_ANSWER_TOO_LONG" | null {
  const nonWhitespaceLength = [...a.replace(/\s/gu, "")].length;
  if (nonWhitespaceLength < CONFIG.ANSWER_MIN_CHARS) {
    return "ERR_ANSWER_TOO_SHORT";
  }
  if ([...a].length > CONFIG.ANSWER_MAX_CHARS) {
    return "ERR_ANSWER_TOO_LONG";
  }
  return null;
}

export function levenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j];
    }
  }
  return prev[n];
}

const collapse = (s: string): string[] => [
  ...s.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim(),
];

export function similarity(a: string, b: string): number {
  const A = collapse(a);
  const B = collapse(b);
  if (A.length === 0 && B.length === 0) {
    return 1;
  }
  return 1 - levenshtein(A, B) / Math.max(A.length, B.length);
}

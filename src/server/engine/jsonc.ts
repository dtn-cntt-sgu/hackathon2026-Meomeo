/**
 * Xử lý JSONC (JSON with Comments) và dấu phẩy thừa (trailing commas).
 */

export function stripJsonc(input: string): string {
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let escaped = false;
  let noComments = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inSingleLineComment) {
      if (ch === "\n" || ch === "\r") {
        inSingleLineComment = false;
        noComments += ch;
      }
      continue;
    }

    if (inMultiLineComment) {
      if (ch === "*" && next === "/") {
        inMultiLineComment = false;
        i++;
      } else if (ch === "\n" || ch === "\r") {
        noComments += ch;
      }
      continue;
    }

    if (inString) {
      noComments += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      escaped = false;
      noComments += ch;
    } else if (ch === "/" && next === "/") {
      inSingleLineComment = true;
      i++;
    } else if (ch === "/" && next === "*") {
      inMultiLineComment = true;
      i++;
    } else {
      noComments += ch;
    }
  }

  let inString2 = false;
  let escaped2 = false;
  let result = "";

  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];

    if (inString2) {
      result += ch;
      if (escaped2) {
        escaped2 = false;
      } else if (ch === "\\") {
        escaped2 = true;
      } else if (ch === '"') {
        inString2 = false;
      }
      continue;
    }

    if (ch === '"') {
      inString2 = true;
      escaped2 = false;
      result += ch;
      continue;
    }

    if (ch === ",") {
      let isTrailing = false;
      for (let j = i + 1; j < noComments.length; j++) {
        const nextChar = noComments[j];
        if (
          nextChar === " " ||
          nextChar === "\t" ||
          nextChar === "\n" ||
          nextChar === "\r"
        ) {
          continue;
        }
        if (nextChar === "}" || nextChar === "]") {
          isTrailing = true;
        }
        break;
      }
      if (isTrailing) {
        continue;
      }
    }

    result += ch;
  }

  return result;
}

export function parseJsonc<T = unknown>(input: string): T {
  return JSON.parse(stripJsonc(input)) as T;
}

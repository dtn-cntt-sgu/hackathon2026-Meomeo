import { CONFIG } from "@/contracts";
import { maskSensitive } from "@/lib/moderation";

const MASK = "<REDACTED_SECRET>";
const SENSITIVE_MASK = "***";

const PRIVATE_KEY_RE =
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g;

const TOKEN_RES = [
  /AKIA[0-9A-Z]{16}/g,
  /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
];

// Lookbehind buộc khớp từ đầu định danh, tránh dò lại O(n²) trên chuỗi base64 dài.
const ASSIGNMENT_RE =
  /(?<![A-Za-z0-9_])(["'`]?)([A-Za-z0-9_]*(?:password|passwd|pwd|secret|api_?key|token|private_?key|access_?key)(?:_[A-Za-z0-9]+)*)\1(\s*[:=]\s*)(["'`])(\S+?)\4/gi;

const CONNECTION_RE =
  /((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp|https?):\/\/[^:/\s]+:)([^@/\s]+)@/gi;

const INJECTION_RE =
  /(ignore|disregard|forget)\s+(all\s+)?(the\s+)?(previous|above|prior)\s+(instructions?|prompts?)|you\s+are\s+now\b|system\s+prompt|<\/?\s*(system|instructions?)\s*>/i;

function maskKeyBlock(block: string): string {
  if (!block.includes("\n")) {
    return MASK;
  }
  return block
    .split("\n")
    .map((line) => `${/^\s*/.exec(line)?.[0] ?? ""}${MASK}`)
    .join("\n");
}

/** ING-110. Giá trị đã là MASK không đếm lại khi mẫu sau khớp trúng. */
export function redactSecrets(code: string): { code: string; count: number } {
  let count = 0;

  let out = code.replace(PRIVATE_KEY_RE, (block) => {
    count++;
    return maskKeyBlock(block);
  });

  for (const pattern of TOKEN_RES) {
    out = out.replace(pattern, () => {
      count++;
      return MASK;
    });
  }

  out = out.replace(
    ASSIGNMENT_RE,
    (match, keyQuote: string, key: string, separator: string, quote: string, value: string) => {
      if (value.length < CONFIG.SECRET_MIN_VALUE_LENGTH || value.includes(MASK)) {
        return match;
      }
      count++;
      return `${keyQuote}${key}${keyQuote}${separator}${quote}${MASK}${quote}`;
    },
  );

  out = out.replace(CONNECTION_RE, (match, head: string, password: string) => {
    if (password === MASK) {
      return match;
    }
    count++;
    return `${head}${MASK}@`;
  });

  return { code: out, count };
}

function countMasks(text: string): number {
  return text.split(SENSITIVE_MASK).length - 1;
}

/** Cửa repo của D-65: che secret rồi che email, SĐT, CCCD, từ xấu. */
export function sanitizeText(text: string): { code: string; count: number } {
  const redacted = redactSecrets(text);
  const masked = maskSensitive(redacted.code);
  return {
    code: masked,
    count: redacted.count + Math.max(0, countMasks(masked) - countMasks(redacted.code)),
  };
}

export function hasInjectionText(code: string): boolean {
  return INJECTION_RE.test(code);
}

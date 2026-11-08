export const BAD_WORDS = [
  "địt",
  "đụ",
  "đéo",
  "lồn",
  "buồi",
  "cặc",
  "đĩ",
  "óc chó",
  "đồ chó",
  "mẹ mày",
  "fuck",
  "motherfucker",
] as const;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wordRe(k: string): RegExp {
  const escaped = escapeRegex(k.normalize("NFC"));
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu");
}

export function hasInappropriateWords(text: string): boolean {
  const normalized = text.normalize("NFC");
  return BAD_WORDS.some((word) => wordRe(word).test(normalized));
}

const CCCD_REGEX = /(?<!\d)\d{12}(?!\d)/g;
const VN_PHONE_REGEX = /(?<![\d+])(?:\+84|84|0)[ .-]*[35789](?:[ .-]*\d){8}(?!\d)/g;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function maskSensitive(text: string): string {
  let masked = text.normalize("NFC");

  // Che CCCD trước SĐT (đúng 12 chữ số liền)
  masked = masked.replace(CCCD_REGEX, "***");

  // Che SĐT VN
  masked = masked.replace(VN_PHONE_REGEX, "***");

  // Che Email
  masked = masked.replace(EMAIL_REGEX, "***");

  // Che từ xấu
  for (const word of BAD_WORDS) {
    masked = masked.replace(wordRe(word), "***");
  }

  return masked;
}

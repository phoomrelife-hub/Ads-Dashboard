/**
 * Normalize a Thai phone number to a canonical digits-only string starting with 0.
 *
 * Rules (applied in order):
 *  1. Strip all non-digit characters (spaces, dashes, parentheses, leading "+").
 *  2. If the result starts with "66" and is ≥ 11 digits, replace the leading "66" with "0"
 *     (handles both "+66…" and "66…" international prefixes — the "+" was stripped in step 1).
 *  3. If the result is exactly 9 digits (local mobile missing the leading zero), prepend "0".
 *  4. Return the normalized string; return "" for empty or all-non-digit input.
 *
 * All of these normalize to "0812345678":
 *   "+66 81 234 5678"  →  strip "+" & spaces  →  "66812345678"  →  step 2  →  "0812345678"
 *   "081-234-5678"     →  strip dashes         →  "0812345678"   →  no-op
 *   "0812345678"       →  no change             →  "0812345678"
 *   "66812345678"      →  no change             →  step 2         →  "0812345678"
 *   "81-234-5678"      →  strip dashes          →  "812345678"    →  step 3  →  "0812345678"
 */
export function normalizePhone(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  // Step 1: strip everything that is not a decimal digit
  let digits = raw.replace(/\D/g, '');

  if (!digits) return '';

  // Step 2: international prefix +66 / 66 → 0
  // After stripping, "+66XXXXXXXXX" and "66XXXXXXXXX" both look like "66XXXXXXXXX".
  // A Thai mobile is 9 local digits → full international form is 11 digits.
  if (digits.startsWith('66') && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  }

  // Step 3: 9-digit local number missing the leading zero
  if (digits.length === 9) {
    digits = '0' + digits;
  }

  return digits;
}

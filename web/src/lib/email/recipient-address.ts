/**
 * Recipient normalization for the email sender (TUL-741). Resend rejects the
 * whole send with "Invalid `to` field" when any address is padded, empty,
 * null or malformed, so the sender cleans the list first and skips when
 * nothing valid is left.
 */

const PLAIN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const NAMED = /^[^<>@]*<([^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+)>$/;

function isValidAddress(value: string): boolean {
  if (value.includes("\n") || value.includes("\r")) return false;
  return PLAIN.test(value) || NAMED.test(value);
}

function dedupeKey(value: string): string {
  const named = value.match(NAMED);
  return (named ? named[1] : value).toLowerCase();
}

export function normalizeRecipients(to: string | readonly string[]): {
  valid: string[];
  invalid: number;
} {
  const list = Array.isArray(to) ? to : [to];
  const valid: string[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const raw of list as unknown[]) {
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value || !isValidAddress(value)) {
      invalid += 1;
      continue;
    }
    const key = dedupeKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(value);
  }
  return { valid, invalid };
}

/**
 * contact-masking.ts — phone and email hidden in the client chat before
 * booking (TUL-1373; work models where the workspace talks to the client).
 * Pure.
 *
 * Masking is a PRIVACY control, so every uncertain input errs toward hiding:
 * unreadable terms or booking state mask. The text matcher errs the other way
 * for numbers that are clearly money, dates, times or ids, so ordinary
 * conversation is not mangled.
 */

export const CONTACT_MASKING_FLAG = "COORDINATOR_CONTACT_MASKING_ENABLED";

/** Off unless exactly "true": it changes what clients see in chat, so it ships dark. */
export function contactMaskingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[CONTACT_MASKING_FLAG] === "true";
}

const COMMON_TLDS = new Set(["com", "net", "org", "edu", "info", "io", "co", "app", "dev", "me", "mx", "es", "us", "uk", "ar", "cl", "br", "fr", "de", "it"]);

export type MaskResult = { text: string; maskedCount: number };

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// "name at domain dot com" / "name (at) domain (dot) com"
const OBFUSCATED_EMAIL = /\b[A-Za-z0-9._%+-]+\s*[[(]?\s*at\s*[\])]?\s+[A-Za-z0-9-]+(?:\s*[[(]?\s*dot\s*[\])]?\s*[A-Za-z0-9-]+)+\b/gi;
const WA_LINK = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?\+?\d{6,15}[^\s]*/gi;
// digits with ordinary phone separators; counted afterwards
const PHONE = /(?<![\w$€£.,/:-])\+?\(?\d[\d\s().-]{5,}\d(?![\w:/])/g;

function phoneLike(match: string, before: string): boolean {
  const m = match.trim();
  const digits = m.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  // money: a currency sign right before, or thousands/decimal grouping like 1,200.50 / 12,000,000
  if (/[$€£]\s*$/.test(before)) return false;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(m)) return false;
  // dates
  if (/^\d{4}-\d{2}-\d{2}/.test(m)) return false;
  if (/^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(m)) return false;
  const bare = /^\+?\d+$/.test(m);
  // a bare run of digits is a phone only at a plausible length without a +
  if (bare && !m.startsWith("+") && digits.length < 10) return false;
  if (bare && /^(19|20)\d{6}$/.test(digits)) return false; // yyyymmdd
  // spaces only between small numbers ("3 4 5 6 7 8 9 1") is not a phone
  if (!m.startsWith("+") && !/[().-]/.test(m) && !bare) {
    const groups = m.split(/\s+/);
    if (groups.length > 5 || groups.some((g) => g.length === 1)) return false;
  }
  return true;
}

export function maskContactDetails(input: string): MaskResult {
  if (!input) return { text: "", maskedCount: 0 };
  let count = 0;
  let text = input.replace(WA_LINK, () => {
    count += 1;
    return "[phone hidden]";
  });
  text = text.replace(EMAIL, () => {
    count += 1;
    return "[email hidden]";
  });
  text = text.replace(OBFUSCATED_EMAIL, (m) => {
    if (!/\bat\b/i.test(m) || !/\bdot\b/i.test(m)) return m;
    // Only when it ends like a real address ("... dot com"), so plain words stay plain.
    const tld = m.split(/[[(]?\s*dot\s*[\])]?/i).pop()?.trim().toLowerCase() ?? "";
    if (!COMMON_TLDS.has(tld)) return m;
    count += 1;
    return "[email hidden]";
  });
  text = text.replace(PHONE, (m, offset: number, whole: string) => {
    if (!phoneLike(m, whole.slice(0, offset))) return m;
    count += 1;
    return "[phone hidden]";
  });
  return { text, maskedCount: count };
}

/**
 * TUL-1597: free text a person types INSIDE a card (a quote note, an item description, a media
 * caption) is masked like a message body. Only these keys are text; ids, amounts, dates and
 * references are never touched, so a long number in a structured field is not mangled.
 */
const CARD_TEXT_KEYS = new Set(["title", "summary", "note", "notes", "description", "message", "caption", "text", "label", "name"]);

export function maskCardPayloadText(payload: unknown): { payload: unknown; maskedCount: number } {
  let count = 0;
  const walk = (value: unknown, key: string | null): unknown => {
    if (typeof value === "string") {
      if (key === null || !CARD_TEXT_KEYS.has(key)) return value;
      const masked = maskContactDetails(value);
      count += masked.maskedCount;
      return masked.text;
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v, k)]));
    }
    return value;
  };
  const out = walk(payload, null);
  return { payload: count === 0 ? payload : out, maskedCount: count };
}

export type TermsForMasking = {
  /** Whether the terms let the client see the person's contact details. */
  showContact: boolean;
  /** Who talks to the client. */
  clientContact: "workspace" | "talent";
};

/**
 * Mask while the workspace is the client's contact (any lineup person's accepted
 * terms say so) and nothing is booked yet. No terms at all (the workspace has no
 * hub terms): nothing to protect, no masking.
 */
export function shouldMaskContacts(input: {
  terms: readonly TermsForMasking[] | "unreadable";
  hasConfirmedBooking: boolean | "unreadable";
}): boolean {
  if (input.hasConfirmedBooking === "unreadable" || input.terms === "unreadable") return true;
  if (input.hasConfirmedBooking) return false;
  return input.terms.some((t) => !t.showContact || t.clientContact === "workspace");
}

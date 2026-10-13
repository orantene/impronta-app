/**
 * TUL-525 — greet a person, not an account handle.
 *
 * Prefer the person's first name. When the stored display name is a signup
 * handle / email local-part (qa-onb-…, slug-with-hyphens), fall through to the
 * business name the pill already shows. Never invent a name.
 */

export type GreetingNameInput = {
  /** Account / talent / profile display name. */
  readonly personName?: string | null;
  /** Workspace / business display name. */
  readonly businessName?: string | null;
};

/** True when a string reads as an account handle rather than a person's name. */
export function looksLikeAccountHandle(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (s.includes("@")) return true;
  if (/^qa[-_]/i.test(s)) return true;
  // Slug-like: several hyphen/underscore segments, little whitespace.
  if (!/\s/u.test(s) && (s.match(/[-_]/g) ?? []).length >= 2) return true;
  // Pure machine tokens (no letters from a name alphabet with spaces).
  if (/^[a-z0-9]{12,}$/i.test(s) && !/[aeiou]{2}/i.test(s)) return true;
  return false;
}

/**
 * First token of a person-like name, else the business name, else null.
 * Callers interpolate into "Good afternoon, {name}".
 */
export function resolveGreetingName(input: GreetingNameInput): string | null {
  const person = input.personName?.trim() || "";
  if (person && !looksLikeAccountHandle(person)) {
    return person.split(/\s+/u)[0] ?? null;
  }
  const business = input.businessName?.trim() || "";
  if (business && !looksLikeAccountHandle(business)) {
    return business;
  }
  return null;
}

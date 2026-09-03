/**
 * Pure identity normalisation for `customers`.
 *
 * A customer is identified by email or phone, never by an account. These
 * helpers decide what "the same person" means before any database round trip,
 * so the rule is one testable function rather than a convention each caller
 * re-implements slightly differently.
 *
 * No I/O. No imports from the app. Safe in any test lane.
 */

/** The identity keys a caller supplied, normalised. At least one is non-null. */
export type CustomerIdentity = {
  email: string | null;
  phoneE164: string | null;
  displayName: string | null;
};

export type CustomerIdentityError =
  | { ok: false; reason: "no_key"; message: string }
  | { ok: false; reason: "bad_email"; message: string }
  | { ok: false; reason: "bad_phone"; message: string };

export type CustomerIdentityResult = { ok: true; identity: CustomerIdentity } | CustomerIdentityError;

/**
 * Lowercase and trim. The column is `citext`, so the database compares
 * case-insensitively regardless; normalising here keeps what we STORE
 * predictable and keeps logs and receipts from showing "  Ana@X.COM ".
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

/**
 * Deliberately strict, and deliberately NOT a parser.
 *
 * A phone number is only accepted when the caller already sends E.164. We do
 * not guess a country code: a Mexican number typed without one is not "+52 …"
 * just because the workspace is in Cancun, and a wrong guess silently creates a
 * second customer for the same human. Anything that is not already E.164 is
 * dropped to null, and the caller falls back to email.
 *
 * Matches the `customers_phone_e164_shape` CHECK exactly. If these two ever
 * disagree the database wins and the insert throws, which is the right failure.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  // Strip the formatting humans type; keep a leading +.
  const compact = raw.trim().replace(/[\s()\-.]/g, "");
  if (compact === "") return null;
  return /^\+[1-9][0-9]{6,14}$/.test(compact) ? compact : null;
}

/** A trimmed display name, or null. Never an empty string in the column. */
export function normalizeDisplayName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return trimmed === "" ? null : trimmed.slice(0, 200);
}

/**
 * Resolve what a caller sent into the identity the table can store.
 *
 * Refuses rather than inventing a placeholder when neither key is usable. A
 * customer with no email and no phone is unreachable — no receipt, no reminder,
 * no refund notice — so a synthetic key would only move the failure to the
 * moment it matters.
 */
export function resolveCustomerIdentity(input: {
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
}): CustomerIdentityResult {
  const rawEmail = typeof input.email === "string" ? input.email.trim() : "";
  const email = normalizeEmail(input.email);

  if (rawEmail !== "" && email === null) {
    return { ok: false, reason: "bad_email", message: "That email address is not usable." };
  }
  if (email !== null && !isPlausibleEmail(email)) {
    return { ok: false, reason: "bad_email", message: "That email address is not usable." };
  }

  const rawPhone = typeof input.phone === "string" ? input.phone.trim() : "";
  const phoneE164 = normalizePhoneE164(input.phone);

  if (email === null && rawPhone !== "" && phoneE164 === null) {
    // The only key they gave us is a phone number we cannot store. Say so
    // rather than falling through to the generic "no key" message, which
    // would read as "you gave us nothing" when they gave us something.
    return {
      ok: false,
      reason: "bad_phone",
      message: "That phone number needs its country code, like +52 998 123 4567.",
    };
  }

  if (email === null && phoneE164 === null) {
    return { ok: false, reason: "no_key", message: "An email address or phone number is required." };
  }

  return {
    ok: true,
    identity: { email, phoneE164, displayName: normalizeDisplayName(input.displayName) },
  };
}

/**
 * Shape check only. Deliverability is the email system's job (there is already
 * a disposable-domain guard and a bounce-suppression list); this exists so an
 * obviously-not-an-address string cannot become a customer's permanent key.
 */
function isPlausibleEmail(normalized: string): boolean {
  if (normalized.length > 254) return false;
  if (normalized.includes(" ")) return false;
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@")) return false;
  const domain = normalized.slice(at + 1);
  if (domain.length < 3 || !domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  return true;
}

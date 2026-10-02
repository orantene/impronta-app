/**
 * public-name.ts — the one gate between a stored name and any guest-facing text.
 *
 * A public name is the talent's display / stage name. It must NEVER be an
 * email, or an email's local part (signup fallbacks write `orantene+jorgbeauty`
 * into display_name when no name was given). When a name looks email-derived
 * the caller gets null and must use a neutral generic instead.
 */

/** True when the string is an email or looks like an email local part. */
export function looksEmailDerived(raw: string | null | undefined, knownEmails: string[] = []): boolean {
  const s = (raw ?? "").trim();
  if (!s) return false;
  if (s.includes("@")) return true;
  const lower = s.toLowerCase();
  for (const e of knownEmails) {
    const local = e.trim().toLowerCase().split("@")[0];
    if (local && (lower === local || lower === e.trim().toLowerCase())) return true;
  }
  // A single token carrying a plus-tag, e.g. "orantene+jorgbeauty".
  if (/^[^\s+]+\+[^\s+]+$/u.test(s)) return true;
  return false;
}

/** The public name, or null when absent or email-derived. */
export function safePublicName(raw: string | null | undefined, knownEmails: string[] = []): string | null {
  const s = (raw ?? "").trim();
  if (!s || looksEmailDerived(s, knownEmails)) return null;
  return s;
}

/** Neutral generic for a talent with no usable public name. */
export function genericTalentName(locale: string): string {
  return locale === "es" ? "la talento" : "the talent";
}

/** Public name, else the neutral generic. */
export function publicNameOrGeneric(raw: string | null | undefined, locale: string): string {
  return safePublicName(raw) ?? genericTalentName(locale);
}

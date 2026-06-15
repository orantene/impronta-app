/**
 * Bilingual email copy — EN + ES, aggregated from per-group fragments.
 *
 * Each fragment (./email-copy/<group>.ts) exports `<GROUP>_EN` and a
 * `<GROUP>_ES: typeof <GROUP>_EN`, so the build FAILS if the two languages
 * drift apart for that group. Spanish is natural Mexican Spanish using "tú".
 *
 * Three consumers:
 *  - React Email templates call `getEmailCopy(brand?.locale)[KEY]` to render
 *    frame text in the recipient's language (dynamic values stay interpolated
 *    in the template).
 *  - The email channel calls `getEmailSubject(locale, templateId)` to localize
 *    subject lines (falls back to the catalog entry's English `subject()` fn
 *    when a key isn't translated — so the rollout is incremental).
 *  - The auth hook localizes the four auth emails.
 *
 * Keys are the catalog `templateId` (e.g. "client.inquiry_received") or, for
 * auth mail, "auth.<action>". Placeholders use `{var}` (see `interpolate`).
 *
 * The console DB override (notification_template_override) still wins on top —
 * baked-in copy is the good default; overrides are the escape hatch.
 */

import { AUTH_EN, AUTH_ES } from "./email-copy/auth";
import { CLIENT_EN, CLIENT_ES } from "./email-copy/client";
import { WORKSPACE_EN, WORKSPACE_ES } from "./email-copy/workspace";
import { TALENT_EN, TALENT_ES } from "./email-copy/talent";
import { BILLING_EN, BILLING_ES } from "./email-copy/billing";
import { NOTIF_EN, NOTIF_ES } from "./email-copy/notifications";

export type EmailLocale = "en" | "es";

/** Normalize any BCP-47-ish string to the two locales we ship. */
export function normalizeEmailLocale(locale: string | undefined | null): EmailLocale {
  return (locale ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

// English is the source of truth; the merged shape defines the public type.
// Spread order is identical for en/es so any shared key resolves consistently.
const en = {
  ...AUTH_EN,
  ...CLIENT_EN,
  ...WORKSPACE_EN,
  ...TALENT_EN,
  ...BILLING_EN,
  ...NOTIF_EN,
};

const es = {
  ...AUTH_ES,
  ...CLIENT_ES,
  ...WORKSPACE_ES,
  ...TALENT_ES,
  ...BILLING_ES,
  ...NOTIF_ES,
};

export type EmailCopy = typeof en;
export type EmailCopyKey = keyof typeof en;

const BY_LOCALE: Record<EmailLocale, EmailCopy> = { en, es };

/** Full copy map for a locale (defaults to English). */
export function getEmailCopy(locale: string | undefined | null): EmailCopy {
  return BY_LOCALE[normalizeEmailLocale(locale)];
}

/**
 * Localized subject for a templateId, or undefined when that key isn't
 * translated yet (caller keeps the catalog's English `subject()` fn). This is
 * what makes the rollout incremental — subjects light up as keys are added.
 */
export function getEmailSubject(
  locale: string | undefined | null,
  templateId: string,
): string | undefined {
  const map = getEmailCopy(locale) as Record<string, { subject?: string }>;
  return map[templateId]?.subject;
}

/** Fill `{key}` placeholders from a vars bag (missing keys → empty string). */
export function interpolate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{\s*([a-zA-Z0-9_]+)\s*\}/g, (_, k: string) => (vars[k] ?? "").toString());
}

/**
 * guest-ack-copy.ts — the acknowledgement a visitor reads the instant they
 * send an inquiry, in the tenant's own language.
 *
 * WHY THIS EXISTS: the ack was English-only. It is the FIRST thing a customer
 * ever reads from a business on this platform, and a Spanish-speaking customer
 * of a Spanish-speaking tenant was answered in English. Every other
 * customer-facing string in this area ships EN + ES; this one predated that
 * rule and nothing caught it, because it is a literal in source rather than a
 * catalog entry.
 *
 * PURE by design — no DB, no I/O — so the composition is unit-testable without
 * a tenant fixture. The impure half (resolving the tenant's default_locale)
 * stays in guest-auto-ack.ts.
 *
 * THE LATENCY FRAGMENT IS THE INTERESTING PART. `getTypicalReplyLabel` returns
 * an ENGLISH fragment ("in ~2 hours", "within a day"). Dropping that into a
 * Spanish sentence is the exact mistake UnsubscribeFooter documents and avoids.
 * The obvious fix — omit the latency for Spanish — would cost Spanish tenants a
 * genuinely useful promise. So instead every branch of `_formatLatency` has an
 * ES translation here, and a test walks all of them: add an eighth branch there
 * without one here and the test fails rather than silently emitting English
 * inside Spanish.
 */

export type GuestAckLocale = "en" | "es";

/** Normalize any stored locale to the two we actually write copy for. */
export function normalizeAckLocale(value: string | null | undefined): GuestAckLocale {
  const short = typeof value === "string" ? value.trim().toLowerCase().split(/[-_]/)[0] : "";
  return short === "es" ? "es" : "en";
}

/**
 * ES translations of every `_formatLatency` output, plus the one parameterised
 * shape ("in ~N hours"). Keyed on the exact English fragment because that is
 * what the producer hands us; the test pins that every branch is covered.
 */
const HOURS_PATTERN = /^in ~(\d+) hours?$/;

const FRAGMENT_ES: Record<string, string> = {
  "in minutes": "en unos minutos",
  "in ~1 hour": "en ~1 hora",
  "within a few hours": "en unas horas",
  "the same day": "el mismo día",
  "within a day": "en menos de un día",
  "within 2–3 days": "en 2 o 3 días",
};

/**
 * Translate an English latency fragment for the given locale. Returns null when
 * the fragment has no translation, which the caller treats as "no latency
 * promise" rather than falling back to English inside a Spanish sentence.
 */
export function translateReplyFragment(
  fragment: string | null | undefined,
  locale: GuestAckLocale,
): string | null {
  const trimmed = (fragment ?? "").trim();
  if (!trimmed) return null;
  if (locale === "en") return trimmed;

  const known = FRAGMENT_ES[trimmed];
  if (known) return known;

  const hours = HOURS_PATTERN.exec(trimmed);
  if (hours) return `en ~${hours[1]} horas`;

  return null;
}

/**
 * Compose the acknowledgement body. `replyFragment` is the English fragment
 * from getTypicalReplyLabel, or null when we have no honest latency to promise.
 */
export function buildGuestAckBody(args: {
  locale: GuestAckLocale;
  replyFragment?: string | null;
}): string {
  const fragment = translateReplyFragment(args.replyFragment, args.locale);

  if (args.locale === "es") {
    return fragment
      ? `Listo, recibimos tu mensaje. Normalmente respondemos ${fragment}.`
      : "Listo, recibimos tu mensaje. Te respondemos muy pronto.";
  }

  return fragment
    ? `Got it, we've received your message. We typically reply ${fragment}.`
    : "Got it, we've received your message and will be in touch shortly.";
}

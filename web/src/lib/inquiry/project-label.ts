/**
 * project-label.ts — Phase 5 (multi-inquiry PROJECTS model).
 *
 * Pure derivation of an inquiry's PROJECT display label, shared by the
 * thread-switcher server action (listGuestInquiries) and any surface that needs
 * to name a multi-talent inquiry consistently.
 *
 * The label is the client-supplied job name when present
 * (interpreted_query.client.job_name), else a derived
 * "{lineupWord} · {shortDate}" fragment that reads as a project rather than a
 * single talent (e.g. "Lineup of 3 · Jun 28", "1 talent · Jun 28").
 *
 * PURE: no DOM, no i18n catalog, no server code. The caller passes already-
 * localized word/connector tokens so this stays a single deterministic join the
 * tests can pin. Straight ASCII; the connector defaults to a middot, NOT an em
 * dash.
 */

export type ProjectLabelTokens = {
  /** "Lineup of {count}" template, already interpolated with the count by the caller, OR the singular form. */
  lineupWord: string;
  /** Short date fragment (e.g. "Jun 28"), or null when no date is resolvable. */
  shortDate: string | null;
  /** Visual connector between the lineup word and the date. Defaults to " · ". */
  connector?: string;
};

/**
 * Resolve the project label.
 *
 * @param jobName  The client-supplied job_name (interpreted_query.client.job_name), or null.
 * @param tokens   Already-localized lineup word + short date for the derived fallback.
 */
export function deriveProjectLabel(
  jobName: string | null | undefined,
  tokens: ProjectLabelTokens,
): string {
  const trimmed = (jobName ?? "").trim();
  if (trimmed.length > 0) return trimmed;

  const connector = tokens.connector ?? " · "; // middot, NOT an em dash
  if (tokens.shortDate && tokens.shortDate.trim().length > 0) {
    return `${tokens.lineupWord}${connector}${tokens.shortDate.trim()}`;
  }
  return tokens.lineupWord;
}

/**
 * Format an ISO (or YYYY-MM-DD) date string as a short "Mon D" fragment in the
 * given locale. Returns null for a null/unparseable input. Locale-aware so the
 * Spanish/French switchers read "28 jun." / "28 juin" naturally.
 */
export function shortDateFragment(
  iso: string | null | undefined,
  locale: string | undefined,
): string | null {
  if (!iso) return null;
  // Accept a bare YYYY-MM-DD (the flat event_date column) as a local date.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return parsed.toLocaleDateString(locale || undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
}

/**
 * lib/date-only.ts
 *
 * Timezone-safe handling for DATE-only strings (Postgres DATE columns like
 * `inquiries.event_date`, serialized as "YYYY-MM-DD").
 *
 * The bug this exists to kill (verified live 2026-07-23): `new Date("2026-08-15")`
 * parses as UTC MIDNIGHT, so any locale west of UTC renders it as the previous
 * day ("Aug 14, 2026"). The client messages surfaces did exactly that while the
 * admin shell rendered the raw string and stayed correct.
 *
 * Rule: a calendar date has no timezone. Parse it into LOCAL year/month/day so
 * it formats as the same calendar day everywhere.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local-midnight Date for a "YYYY-MM-DD" string; null when not date-only. */
export function parseDateOnlyLocal(value: string): Date | null {
  const m = DATE_ONLY_RE.exec(value);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  // Reject rollover (e.g. "2026-13-45" silently becoming a real date).
  if (
    dt.getFullYear() !== Number(y) ||
    dt.getMonth() !== Number(mo) - 1 ||
    dt.getDate() !== Number(d)
  ) {
    return null;
  }
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Format a date string for display. DATE-only strings ("YYYY-MM-DD") are
 * parsed as LOCAL calendar dates; full ISO timestamps fall through to the
 * regular Date parser (they carry real timezone information). Returns the
 * input unchanged when it cannot be parsed at all.
 */
export function formatDateOnly(
  value: string,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
): string {
  try {
    const dt = parseDateOnlyLocal(value) ?? new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString(locale, options);
  } catch {
    return value;
  }
}

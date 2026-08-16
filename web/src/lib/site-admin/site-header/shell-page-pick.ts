/**
 * Which site_shell page does the header inspector edit?
 *
 * THE BUG THIS EXISTS TO FIX (found in WF-6 live QA, 2026-08-16)
 * ─────────────────────────────────────────────────────────────
 * `resolveHeaderSection` asked for the tenant's shell page with
 * `.maybeSingle()`. A tenant with more than one active locale has one
 * site_shell page PER LOCALE, so that query returns two rows, and
 * `maybeSingle()` answers a bilingual tenant with an ERROR and `data: null`
 * rather than a page. The resolver then returned null, the inspector's
 * `config.section` came back null, and every section-level header control
 * (variant, brand display, density, and now regions) silently rendered its
 * "this site has no shell header" state on the exact tenants most likely to
 * have one. Nothing logged; the controls just were not there.
 *
 * So the choice has to be made explicitly instead of accidentally. The rule:
 *
 *   1. the tenant's DEFAULT locale, when a shell page exists for it. That is
 *      the page whose header the operator sees on their primary site, so it
 *      is the one the drawer should be editing.
 *   2. otherwise the first page by locale, sorted, so the answer is stable
 *      across calls. An unstable pick would be worse than a wrong one: the
 *      load and the save could disagree and a CAS write would land on a page
 *      the operator was never looking at.
 *
 * Pure and separate from the action so the rule is testable without Supabase.
 */

export interface ShellPageRow {
  id: string;
  locale: string | null;
}

export function pickShellPageForLocale<T extends ShellPageRow>(
  rows: ReadonlyArray<T>,
  preferredLocale: string | null | undefined,
): T | null {
  if (rows.length === 0) return null;
  if (preferredLocale) {
    const exact = rows.find((r) => r.locale === preferredLocale);
    if (exact) return exact;
  }
  // Stable fallback. `localeCompare` on the locale code, with a null locale
  // sorting last so a half-migrated row cannot win over a real one.
  const sorted = [...rows].sort((a, b) =>
    (a.locale ?? "￿").localeCompare(b.locale ?? "￿"),
  );
  return sorted[0] ?? null;
}

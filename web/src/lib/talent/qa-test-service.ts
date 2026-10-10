/**
 * TUL-537 / TUL-493: QA / E2E leftovers must not appear on public talent sites.
 *
 * Mirrors `web/scripts/lib/qa-test-service.mjs` so public loaders and the
 * services catalog can strip test-named rows at read time (defense in depth
 * when harness teardown missed a row). Keep the title heuristics in sync.
 */

const QA_MARKER = /(^|[^a-z])(qa|e2e)(?=\d|[^a-z]|$)/i;
// "prueba" is NOT a marker: Spanish for a trial / fitting.
const TEST_WORD = /(^|[^a-z])test(?=[^a-z]|$)/i;

export function isTestServiceTitle(title: string | null | undefined): boolean {
  if (typeof title !== "string") return false;
  return QA_MARKER.test(title) || TEST_WORD.test(title);
}

/** Base title plus every translation a visitor could see. */
export function titlesOfOffering(row: {
  title?: string | null;
  titleI18n?: Record<string, string> | null;
  title_i18n?: Record<string, string> | null;
}): string[] {
  const out: string[] = [];
  if (typeof row.title === "string") out.push(row.title);
  const i18n = row.titleI18n ?? row.title_i18n;
  if (i18n && typeof i18n === "object") {
    for (const v of Object.values(i18n)) if (typeof v === "string") out.push(v);
  }
  return out;
}

/** True when any displayable title looks like QA / E2E / Test harness data. */
export function isTestServiceOffering(row: {
  title?: string | null;
  titleI18n?: Record<string, string> | null;
  title_i18n?: Record<string, string> | null;
}): boolean {
  return titlesOfOffering(row).some(isTestServiceTitle);
}

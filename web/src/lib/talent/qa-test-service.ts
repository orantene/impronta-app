/**
 * TUL-537 / TUL-493: QA / E2E leftovers must not appear on public talent sites.
 *
 * Mirrors `web/scripts/lib/qa-test-service.mjs` so public loaders can strip
 * test-named rows at read time (defense in depth when harness teardown missed
 * a row). Keep the title heuristics in sync.
 *
 * TUL-557 (Grok PM decision): the public strip runs only on demo and fixture
 * sites. A real talent's site, dashboards and admin keep every service.
 */

import { JOURNEYS_TENANT_ID } from "@/lib/qa/journeys-fixture";

const QA_MARKER = /(^|[^a-z])(qa|e2e)(?=\d|[^a-z]|$)/i;
// "prueba" is NOT a marker: Spanish for a trial / fitting.
const TEST_WORD = /(^|[^a-z])test(?=[^a-z]|$)/i;

export function isTestServiceTitle(title: string | null | undefined): boolean {
  if (typeof title !== "string") return false;
  return QA_MARKER.test(title) || TEST_WORD.test(title);
}

type OfferingTitles = {
  title?: string | null;
  titleI18n?: Record<string, string | null | undefined> | null;
  title_i18n?: Record<string, string | null | undefined> | null;
};

/** Base title plus every translation a visitor could see. */
export function titlesOfOffering(row: OfferingTitles): string[] {
  const out: string[] = [];
  if (typeof row.title === "string") out.push(row.title);
  const i18n = row.titleI18n ?? row.title_i18n;
  if (i18n && typeof i18n === "object") {
    for (const v of Object.values(i18n)) if (typeof v === "string") out.push(v);
  }
  return out;
}

/** True when any displayable title looks like QA / E2E / Test harness data. */
export function isTestServiceOffering(row: OfferingTitles): boolean {
  return titlesOfOffering(row).some(isTestServiceTitle);
}

/**
 * Public strip uses the QA / E2E marker only: demos sell real services with
 * the plain word "test" in them ("Test image", "Product test, not posted").
 */
export function isQaNamedOffering(row: OfferingTitles): boolean {
  return titlesOfOffering(row).some((t) => QA_MARKER.test(t));
}

/** Journeys fixture workspaces: their house services (no talent) are harness data. */
export const QA_FIXTURE_TENANT_IDS: ReadonlySet<string> = new Set([
  JOURNEYS_TENANT_ID,
  "33333333-3333-4333-8333-333333333334",
]);

export type TestServiceScope = {
  /** Profiles flagged `is_demo` or `is_test_account`. */
  fixtureProfileIds: ReadonlySet<string>;
  fixtureTenantIds: ReadonlySet<string>;
};

export const EMPTY_TEST_SERVICE_SCOPE: TestServiceScope = {
  fixtureProfileIds: new Set(),
  fixtureTenantIds: QA_FIXTURE_TENANT_IDS,
};

/** True when a public loader should drop this row (QA-named AND on a demo / fixture). */
export function hideTestServiceOnPublicSite(
  row: OfferingTitles & { talent_profile_id?: string | null; tenant_id?: string | null },
  scope: TestServiceScope,
): boolean {
  if (!isQaNamedOffering(row)) return false;
  if (row.talent_profile_id) return scope.fixtureProfileIds.has(row.talent_profile_id);
  return Boolean(row.tenant_id) && scope.fixtureTenantIds.has(row.tenant_id as string);
}

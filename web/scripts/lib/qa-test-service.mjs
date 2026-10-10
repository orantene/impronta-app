/**
 * TUL-493: QA / E2E runs must not leave visible services on public sites.
 *
 * Pure helpers shared by the read-only scanner (scripts/qa/scan-test-services.mjs) and by
 * any harness that creates services. A service is "test data" when its title (or any
 * translated title) says so: a QA / E2E marker (also glued to a number, "QA17") or the English word Test.
 */

const QA_MARKER = /(^|[^a-z])(qa|e2e)(?=\d|[^a-z]|$)/i;
// "prueba" is NOT a marker: it is the Spanish word for a trial / fitting ("Prueba de peinado de novia").
const TEST_WORD = /(^|[^a-z])test(?=[^a-z]|$)/i;

export function isTestServiceTitle(title) {
  if (typeof title !== "string") return false;
  return QA_MARKER.test(title) || TEST_WORD.test(title);
}

/** Every title a row can show: the base title plus each translation. */
export function titlesOf(row) {
  const out = [];
  if (typeof row?.title === "string") out.push(row.title);
  const i18n = row?.title_i18n;
  if (i18n && typeof i18n === "object") {
    for (const v of Object.values(i18n)) if (typeof v === "string") out.push(v);
  }
  return out;
}

/** Visibilities that public loaders still surface (see offerings-public.ts). */
const PUBLIC_VIS = new Set(["public", "on_request"]);

/** A row is a public leftover when it is test data AND listed to the public. */
export function isPublicTestService(row) {
  if (row?.status !== "published" || !PUBLIC_VIS.has(row?.visibility)) return false;
  return titlesOf(row).some(isTestServiceTitle);
}

/**
 * Guard for harnesses that create services: a test-named service must be created
 * hidden (draft, not public). Throws otherwise, so a seed can never publish one.
 */
export function assertTestServiceIsHidden(row) {
  if (isPublicTestService(row)) {
    throw new Error(
      `[qa-service-guard] refusing to publish a test service ("${titlesOf(row)[0] ?? ""}"): create it as draft/hidden and delete it in teardown.`,
    );
  }
  return row;
}

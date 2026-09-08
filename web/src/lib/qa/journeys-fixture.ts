/**
 * P0-06 — case fixture contract.
 *
 * Fixtures prepare state. The browser performs the business action.
 * This module is the descriptor the seed script and Playwright cases share.
 * Apply needs credentials; the descriptor is cloud-safe.
 *
 * Do not seed Impronta. Do not invent unread catalog details.
 */

export const JOURNEYS_TENANT_ID = "33333333-3333-4333-8333-333333333333";
export const JOURNEYS_TENANT_SLUG = "qa-journeys";
export const JOURNEYS_HOST = "qa-journeys.local";

export const REPRESENTATIVE_CASE_IDS = [
  "C01",
  "C06",
  "C08",
  "C09",
  "C12",
  "C13",
  "C24",
  "C26",
  "C27",
  "C31",
] as const;

export type RepresentativeCaseId = (typeof REPRESENTATIVE_CASE_IDS)[number];

export type FixtureNeed = {
  staff: boolean;
  offerings: boolean;
  spaces: boolean;
  sessions: boolean;
  sellableLimit: boolean;
  events: boolean;
};

export type CaseFixture = {
  caseId: RepresentativeCaseId;
  businessTypeId: string;
  needs: FixtureNeed;
};

export const REPRESENTATIVE_FIXTURES: readonly CaseFixture[] = [
  { caseId: "C01", businessTypeId: "nail-salon", needs: { staff: true, offerings: true, spaces: true, sessions: false, sellableLimit: false, events: false } },
  { caseId: "C06", businessTypeId: "restaurant", needs: { staff: true, offerings: true, spaces: true, sessions: false, sellableLimit: false, events: false } },
  { caseId: "C08", businessTypeId: "talent-agency", needs: { staff: true, offerings: true, spaces: false, sessions: false, sellableLimit: false, events: false } },
  { caseId: "C09", businessTypeId: "yoga-studio", needs: { staff: true, offerings: true, spaces: true, sessions: true, sellableLimit: false, events: false } },
  { caseId: "C12", businessTypeId: "event-venue", needs: { staff: true, offerings: true, spaces: true, sessions: true, sellableLimit: false, events: true } },
  { caseId: "C13", businessTypeId: "coworking", needs: { staff: true, offerings: true, spaces: true, sessions: true, sellableLimit: false, events: false } },
  { caseId: "C24", businessTypeId: "escape-room", needs: { staff: true, offerings: true, spaces: true, sessions: true, sellableLimit: false, events: false } },
  { caseId: "C26", businessTypeId: "home-takeaway", needs: { staff: true, offerings: true, spaces: false, sessions: false, sellableLimit: true, events: false } },
  { caseId: "C27", businessTypeId: "social-media-agency", needs: { staff: true, offerings: true, spaces: false, sessions: false, sellableLimit: false, events: false } },
  { caseId: "C31", businessTypeId: "private-chef", needs: { staff: true, offerings: true, spaces: false, sessions: false, sellableLimit: false, events: false } },
];

export function fixtureFor(caseId: RepresentativeCaseId): CaseFixture {
  const row = REPRESENTATIVE_FIXTURES.find((f) => f.caseId === caseId);
  if (!row) throw new Error(`unknown representative ${caseId}`);
  return row;
}

/** What the seed must have produced before a browser journey may start. */
export type PreparedFixture = {
  tenantId: string;
  slug: string;
  host: string;
  staffUserIds: readonly string[];
  offeringIds: readonly string[];
  spaceIds: readonly string[];
  sessionIds: readonly string[];
};

export function fixtureReady(have: PreparedFixture, need: FixtureNeed): boolean {
  if (have.tenantId !== JOURNEYS_TENANT_ID) return false;
  if (have.slug !== JOURNEYS_TENANT_SLUG) return false;
  if (need.staff && have.staffUserIds.length === 0) return false;
  if (need.offerings && have.offeringIds.length === 0) return false;
  if (need.spaces && have.spaceIds.length === 0) return false;
  if (need.sessions && have.sessionIds.length === 0) return false;
  return true;
}

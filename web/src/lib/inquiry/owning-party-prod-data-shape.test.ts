/**
 * REGRESSION TEST — what the LIVE roster data actually resolves to.
 *
 * Census 2026-08-05 of `agency_talent_roster` (active, not removed): 306 rows,
 * `is_primary = FALSE` on **every single one** (Impronta 52 / agency tier, the
 * Tulala hub 140 / network tier, ~114 across Free tenants), while every row
 * simultaneously carries `exclusivity_status = 'confirmed'` and none are
 * 'auto_assigned'. The two exclusivity signals disagree platform-wide because
 * the flows that built these rosters (roster/new/actions.ts, roster-invite.ts,
 * roster-import.ts) never call `resolveExclusivityForRosterAdd`, so the column
 * defaults win.
 *
 * `rowIsExclusive` short-circuits on `if (!isPrimary) return false` BEFORE it
 * looks at plan_tier or exclusivity_status — so with this data NO talent is
 * exclusive to anyone, regardless of what exclusivity_status claims.
 *
 * Every talent also carries a Tulala-hub roster row, because the
 * `ensure_talent_in_platform_hub` trigger (migration 20261020000000) enrolls
 * every approved/published profile into the platform hub automatically.
 *
 * These tests pin the CONSEQUENCE of that combination so the effect of any
 * future is_primary backfill is visible as a diff here. They assert current
 * (wrong-for-business) behaviour deliberately — see
 * incident_is_primary_zero_platform_wide.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { resolveOwningPartyForTalent } from "./owning-party-resolver";

const IMPRONTA = "00000000-0000-0000-0000-000000000001"; // plan_tier 'agency'
const HUB = "40081ec3-5ca8-43a0-b50b-31c927b2716b"; // plan_tier 'network'
const TALENT = "9894e911-e4f0-4933-ab5a-a246b5d2bb92"; // a real unclaimed Impronta talent

type RosterRow = {
  tenant_id: string;
  talent_profile_id: string;
  is_primary: boolean;
  status: string;
  agencies: { id: string; plan_tier: string | null };
  exclusivity_status?: string | null;
};

function makeMockSupabase(rows: RosterRow[]) {
  const result = { data: rows, error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (v: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return { from: () => builder } as unknown as Parameters<
    typeof resolveOwningPartyForTalent
  >[0];
}

/** Exactly what production holds today for an Impronta talent. */
const PROD_SHAPE: RosterRow[] = [
  {
    tenant_id: HUB,
    talent_profile_id: TALENT,
    is_primary: false,
    status: "active",
    exclusivity_status: "confirmed",
    agencies: { id: HUB, plan_tier: "network" },
  },
  {
    tenant_id: IMPRONTA,
    talent_profile_id: TALENT,
    is_primary: false,
    status: "active",
    exclusivity_status: "confirmed",
    agencies: { id: IMPRONTA, plan_tier: "agency" },
  },
];

test("PROD SHAPE: hub-sourced inquiry does NOT route to the agency", async () => {
  const sb = makeMockSupabase(PROD_SHAPE);
  const owning = await resolveOwningPartyForTalent(sb, TALENT, HUB);
  // The talent has a hub roster row (auto-enroll trigger), so the non-exclusive
  // branch hands ownership to the HUB workspace — NOT to Impronta, and not to
  // the talent. Impronta is cut out of an inquiry for its own roster talent.
  assert.deepEqual(owning, { type: "workspace", id: HUB });
  assert.notEqual(
    (owning as { id: string }).id,
    IMPRONTA,
    "regression: agency should be bypassed under current data",
  );
});

test("PROD SHAPE: agency-sourced inquiry still routes to the agency workspace", async () => {
  const sb = makeMockSupabase(PROD_SHAPE);
  // Inquiry arriving on improntamodels.com: the talent IS rostered on that
  // tenant, so the workspace owns it. This is why the bug is invisible in
  // day-to-day Impronta use — only hub-brokered demand leaks.
  assert.deepEqual(await resolveOwningPartyForTalent(sb, TALENT, IMPRONTA), {
    type: "workspace",
    id: IMPRONTA,
  });
});

test("PROD SHAPE: 'confirmed' status does NOT make a row exclusive without is_primary", async () => {
  const sb = makeMockSupabase([PROD_SHAPE[1]!]); // Impronta only, agency tier, confirmed
  const owning = await resolveOwningPartyForTalent(sb, TALENT, HUB);
  // Agency tier + exclusivity_status='confirmed' is STILL not exclusive, so we
  // fall to the non-exclusive branch. Here the talent has no roster row on the
  // inquiring (hub) tenant, so ownership goes to the TALENT — self-coordination,
  // with only the platform fee and no agency commission.
  //
  // Contrast with the first test: once the auto-enroll trigger has given the
  // talent a hub row, the same inquiry instead lands on the HUB workspace.
  // Both outcomes bypass the agency; which one you get depends only on whether
  // the hub row exists. Never 'agency' — is_primary is the only signal that counts.
  assert.deepEqual(owning, { type: "talent", id: TALENT });
});

test("AFTER a backfill: is_primary=true makes hub demand route to the agency", async () => {
  const fixed = PROD_SHAPE.map((r) =>
    r.tenant_id === IMPRONTA ? { ...r, is_primary: true } : r,
  );
  const sb = makeMockSupabase(fixed);
  // Flipping the single flag restores the intended model from
  // project_agency_exclusivity_model: the exclusive agency owns the inquiry
  // wherever it was brokered. This is the money-affecting change that needs
  // owner sign-off before any UPDATE runs.
  assert.deepEqual(await resolveOwningPartyForTalent(sb, TALENT, HUB), {
    type: "agency",
    id: IMPRONTA,
  });
});

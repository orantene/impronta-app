/**
 * picker-talent-guard — enrichment for the admin "New Inquiry" talent picker.
 *
 * Surfaces two pieces of decision-support next to each candidate in the
 * shortlist picker (web/src/components/admin/inquiry-talent-editor.tsx):
 *
 *   1. EXCLUSIVITY — is this talent exclusive to *another* agency? An admin
 *      can still add them (we never hard-block), but they should see a lock
 *      badge + confirm first, mirroring how the rest of the app warns rather
 *      than forbids.
 *
 *   2. AVAILABILITY — the next-available date + how many of the next 30 days
 *      are open, read straight off the `talent_discover_index` matview (the
 *      same denormalized snapshot Discover renders).
 *
 * The exclusivity rule is intentionally identical to the one frozen by
 * `inquiry/owning-party-resolver.ts` + `agency/exclusivity-resolver.ts` — a
 * talent is "exclusive elsewhere" when, on a tenant OTHER than the current
 * one, they have a roster row that is `is_primary`, status ∈ {active,pending},
 * exclusivity_status ∉ {declined,notice_period}, on an agency whose plan_tier
 * ∈ {studio,agency,network,hub-network}. We reuse that exact predicate here so
 * the picker badge can never disagree with where the inquiry would actually
 * route at submit time.
 *
 * `isExclusiveElsewhere` is a PURE function over already-fetched roster rows so
 * it can be unit-tested without a DB; `enrichPickerTalents` does the two
 * batched reads (one per data source — never N+1) and applies it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Plan tiers whose primary roster claim confers exclusivity.
 *
 * This was a LOCAL COPY, justified by a comment claiming the other modules did
 * not export the set. `owning-party-resolver.ts` did export it, and the copy had
 * already drifted from the fourth declaration in `access/registration-modes.ts`
 * (which included `legacy`, while the three copies did not). One set now, in
 * the access layer.
 */
import { planAllowsExclusivity } from "@/lib/access/exclusive-plan-tiers";

/**
 * exclusivity_status values that mean the talent is NOT (or no longer)
 * exclusively bound even on an exclusive-tier agency. Mirrors
 * NON_EXCLUSIVE_STATUSES in owning-party-resolver.ts.
 */
const NON_EXCLUSIVE_STATUSES = new Set<string>(["declined", "notice_period"]);

/** Roster statuses that count as a live claim. */
const LIVE_STATUSES = new Set<string>(["active", "pending"]);

/**
 * A single roster row, reduced to the fields the exclusivity predicate needs.
 * `planTier` is the plan_tier of the agency that owns `tenantId`.
 */
export type ExclusivityRosterRow = {
  tenantId: string;
  isPrimary: boolean;
  status: string | null;
  exclusivityStatus: string | null;
  planTier: string | null;
};

/**
 * PURE — true when any of the talent's roster rows binds them exclusively to a
 * tenant OTHER than `currentTenantId`. See the module header for the exact
 * rule. No DB access; safe to unit-test directly.
 */
export function isExclusiveElsewhere(
  rows: readonly ExclusivityRosterRow[],
  currentTenantId: string,
): boolean {
  return rows.some((row) => {
    if (row.tenantId === currentTenantId) return false;
    if (!row.isPrimary) return false;
    if (!row.status || !LIVE_STATUSES.has(row.status)) return false;
    if (row.exclusivityStatus && NON_EXCLUSIVE_STATUSES.has(row.exclusivityStatus)) return false;
    return planAllowsExclusivity(row.planTier);
  });
}

/**
 * Per-talent enrichment attached to a picker candidate. Every field is
 * independently nullable so a partial/failed read degrades gracefully (the
 * picker just shows less, never errors).
 */
export type PickerTalentEnrichment = {
  /** True when the talent is exclusive to a different agency (see rule above). */
  isExclusiveElsewhere: boolean;
  /** ISO yyyy-mm-dd of the next open day, or null when blocked for the full window. */
  nextAvailableDate: string | null;
  /** How many of the next 30 days are open. Null when the matview has no row. */
  availableDaysInNext30: number | null;
  /** 14-char '·'(free)/'×'(blocked) string for a compact dots strip. Null when unknown. */
  availabilityDots14d: string | null;
};

const EMPTY_ENRICHMENT: PickerTalentEnrichment = {
  isExclusiveElsewhere: false,
  nextAvailableDate: null,
  availableDaysInNext30: null,
  availabilityDots14d: null,
};

/**
 * Batch-enrich a set of picker candidates with exclusivity + availability.
 *
 * Two reads total (never N+1):
 *   1. `agency_talent_roster` (+ embedded `agencies.plan_tier`) for every
 *      talent — feeds the pure `isExclusiveElsewhere` predicate.
 *   2. `talent_discover_index` matview for the availability snapshot.
 *
 * Returns a Map keyed by talent_profile_id. Any talent missing from a read
 * falls back to the empty (non-exclusive, no-availability) enrichment, so the
 * caller can `?? EMPTY` safely. On a hard read error we log + return the empty
 * map: the picker stays fully functional, it just doesn't show the extra
 * signals.
 *
 * `supabase` should be a service-role client — the matview is platform-wide
 * (RLS-bypassed, same as Discover) and the roster read must see OTHER tenants'
 * rows to detect cross-tenant exclusivity.
 */
export async function enrichPickerTalents(
  supabase: SupabaseClient,
  currentTenantId: string,
  talentProfileIds: string[],
): Promise<Map<string, PickerTalentEnrichment>> {
  const out = new Map<string, PickerTalentEnrichment>();
  if (talentProfileIds.length === 0) return out;

  // De-dupe ids so a repeated candidate doesn't widen the `.in()` needlessly.
  const ids = Array.from(new Set(talentProfileIds));

  // 1. Roster rows across ALL tenants (need cross-tenant rows to spot
  // exclusive-elsewhere). Embed the owning agency's plan_tier.
  type RawRosterRow = {
    talent_profile_id: string;
    tenant_id: string;
    is_primary: boolean;
    status: string | null;
    exclusivity_status: string | null;
    agencies: { plan_tier: string | null } | { plan_tier: string | null }[] | null;
  };

  const rosterByTalent = new Map<string, ExclusivityRosterRow[]>();
  const { data: rosterData, error: rosterError } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id, tenant_id, is_primary, status, exclusivity_status, agencies:tenant_id ( plan_tier )")
    .in("talent_profile_id", ids)
    .in("status", ["active", "pending"]);

  if (rosterError) {
    logServerError("inquiry.enrichPickerTalents.roster", rosterError);
  } else {
    for (const raw of (rosterData ?? []) as RawRosterRow[]) {
      const agency = Array.isArray(raw.agencies) ? raw.agencies[0] : raw.agencies;
      const row: ExclusivityRosterRow = {
        tenantId: raw.tenant_id,
        isPrimary: raw.is_primary,
        status: raw.status,
        exclusivityStatus: raw.exclusivity_status,
        planTier: agency?.plan_tier ?? null,
      };
      const list = rosterByTalent.get(raw.talent_profile_id) ?? [];
      list.push(row);
      rosterByTalent.set(raw.talent_profile_id, list);
    }
  }

  // 2. Availability snapshot from the matview (id = talent_profile_id).
  type RawIndexRow = {
    id: string;
    next_available_date: string | null;
    available_days_in_next_30: number | null;
    availability_dots_14d: string | null;
  };

  const availByTalent = new Map<string, RawIndexRow>();
  const { data: indexData, error: indexError } = await supabase
    .from("talent_discover_index")
    .select("id, next_available_date, available_days_in_next_30, availability_dots_14d")
    .in("id", ids);

  if (indexError) {
    logServerError("inquiry.enrichPickerTalents.index", indexError);
  } else {
    for (const row of (indexData ?? []) as RawIndexRow[]) {
      availByTalent.set(row.id, row);
    }
  }

  for (const id of ids) {
    const rosterRows = rosterByTalent.get(id) ?? [];
    const avail = availByTalent.get(id);
    out.set(id, {
      isExclusiveElsewhere: isExclusiveElsewhere(rosterRows, currentTenantId),
      nextAvailableDate: avail?.next_available_date ?? null,
      availableDaysInNext30: avail?.available_days_in_next_30 ?? null,
      availabilityDots14d: avail?.availability_dots_14d ?? null,
    });
  }

  return out;
}

export { EMPTY_ENRICHMENT as EMPTY_PICKER_ENRICHMENT };

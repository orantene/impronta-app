import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequirementGroups } from "@/lib/inquiry/requirement-groups";
import { getInquiryGroupShortfall } from "@/lib/inquiry/inquiry-fulfillment";
import { getInquiryCoordinators } from "@/lib/inquiry/inquiry-coordinators";
import type {
  BookingPanelData,
  CoordinatorsPanelData,
  OffersApprovalsPanelData,
  RecentActivityPanelData,
  RecentActivityEvent,
  RequirementGroupsPanelData,
  RequirementGroupRowData,
} from "./workspace-v3-panel-types";

/**
 * Admin Workspace V3 — panel data loaders (M4.*).
 *
 * Thin composition helpers that turn canonical engine data into the
 * panel-shaped payloads declared in `workspace-v3-panel-types.ts`. Anything
 * involving business rules stays in the engine helpers (`getRequirementGroups`,
 * `engine_inquiry_group_shortfall`, etc.) — this module is strictly plumbing.
 */

/**
 * M4.2 — Requirement Groups panel data.
 *
 * Composes:
 *   • `getRequirementGroups` (M1.2) — ordered group rows + selected_count
 *   • `engine_inquiry_group_shortfall` (M2.3) — per-group approved_count and
 *     shortfall. The RPC omits fully-fulfilled groups; we backfill those with
 *     `approved = quantity_required, shortfall = 0` so the UI does not
 *     underreport.
 *
 * Returns an empty-but-fulfilled payload when the inquiry has no groups; the
 * panel renders an appropriate empty state.
 */
export async function loadRequirementGroupsPanelData(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<RequirementGroupsPanelData> {
  const [groups, readiness] = await Promise.all([
    getRequirementGroups(supabase, inquiryId),
    getInquiryGroupShortfall(supabase, inquiryId),
  ]);

  const shortfallByGroup = new Map(readiness.shortfall.map((s) => [s.group_id, s]));

  const rows: RequirementGroupRowData[] = groups.map((g) => {
    const sf = shortfallByGroup.get(g.id);
    if (sf) {
      return {
        id: g.id,
        roleKey: g.role_key,
        quantityRequired: g.quantity_required,
        selected: g.selected_count,
        approved: sf.approved_count,
        shortfall: sf.shortfall,
        notes: g.notes,
      };
    }
    // Not in shortfall → fulfilled. Engine guarantees approved >= quantity.
    return {
      id: g.id,
      roleKey: g.role_key,
      quantityRequired: g.quantity_required,
      selected: g.selected_count,
      approved: g.quantity_required,
      shortfall: 0,
      notes: g.notes,
    };
  });

  return {
    groups: rows,
    // Engine rule: fulfilled iff no shortfall rows returned. Re-asserting here
    // so the panel does not re-derive. Empty-groups case → fulfilled:true
    // matches engine behavior (no groups = nothing to block).
    allFulfilled: readiness.fulfilled,
  };
}

/**
 * M4.3 — Offers / Approvals panel data.
 *
 * Two queries (both RLS-scoped via caller's client):
 *   1. `inquiry_offers` filtered by `inquiry_id`, returning `status` only —
 *      grouped client-side by status into the four offer-level counters.
 *   2. `inquiry_approvals` filtered by `offer_id = currentOfferId`, returning
 *      `status` only — grouped client-side into pending/accepted/rejected.
 *
 * If there is no current offer, the approval counters are all 0 and the
 * panel explicitly surfaces that state. Per-talent accuracy is preserved —
 * approvals are never flattened into the offer-level counters.
 */
export async function loadOffersApprovalsPanelData(
  supabase: SupabaseClient,
  inquiryId: string,
  currentOfferId: string | null,
): Promise<OffersApprovalsPanelData> {
  const [{ data: offerRows }, { data: approvalRows }] = await Promise.all([
    supabase.from("inquiry_offers").select("status").eq("inquiry_id", inquiryId),
    currentOfferId
      ? supabase.from("inquiry_approvals").select("status").eq("offer_id", currentOfferId)
      : Promise.resolve({ data: [] as { status: string }[] }),
  ]);

  const offers = { draft: 0, sent: 0, accepted: 0, rejected: 0 };
  for (const row of (offerRows ?? []) as { status: string }[]) {
    switch (row.status) {
      case "draft":
        offers.draft += 1;
        break;
      case "sent":
        offers.sent += 1;
        break;
      case "accepted":
        offers.accepted += 1;
        break;
      case "rejected":
        offers.rejected += 1;
        break;
      // Unknown statuses are intentionally ignored — we never invent a bucket.
    }
  }

  const approvals = { pending: 0, accepted: 0, rejected: 0 };
  for (const row of (approvalRows ?? []) as { status: string }[]) {
    if (row.status === "pending") approvals.pending += 1;
    else if (row.status === "accepted") approvals.accepted += 1;
    else if (row.status === "rejected") approvals.rejected += 1;
  }

  return {
    offers,
    currentOfferId,
    approvals,
  };
}

/**
 * M4.4 — Coordinators panel data.
 *
 * Pure projection of `getInquiryCoordinators`. Drops the redundant
 * `inquiry_id` + `assigned_by` + `role` + `status` fields; the panel only
 * cares about display identity + assignment timestamp.
 */
export async function loadCoordinatorsPanelData(
  supabase: SupabaseClient,
  inquiryId: string,
): Promise<CoordinatorsPanelData> {
  const { primary, secondaries, former } = await getInquiryCoordinators(
    supabase,
    inquiryId,
  );
  const toRow = (c: { user_id: string; display_name: string | null; assigned_at: string }) => ({
    userId: c.user_id,
    displayName: c.display_name,
    assignedAt: c.assigned_at,
  });
  return {
    primary: primary ? toRow(primary) : null,
    secondaries: secondaries.map(toRow),
    former: former.map(toRow),
  };
}

/**
 * M4.5 — Booking panel data.
 *
 * Consumes booking rows already loaded by page.tsx plus the engine
 * readiness signal (allFulfilled) — no extra queries.
 *
 * `state` is derived once here and passed as canonical data to the panel,
 * so the renderer never re-derives:
 *   • bookings.length > 0 → "booked"
 *   • else allFulfilled   → "ready_to_convert"
 *   • else has groups with shortfall → "not_ready"
 *   • else (no groups)    → "none"
 *
 * Override visibility is read directly from the first linked booking row's
 * `created_with_override` + `override_reason` columns (M2.3 schema).
 */
export function buildBookingPanelData(args: {
  bookings: {
    id: string;
    title: string | null;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    created_with_override: boolean | null;
    override_reason: string | null;
  }[];
  hasRequirementGroups: boolean;
  allFulfilled: boolean;
}): BookingPanelData {
  const first = args.bookings[0] ?? null;
  let state: BookingPanelData["state"];
  if (args.bookings.length > 0) state = "booked";
  else if (!args.hasRequirementGroups) state = "none";
  else if (args.allFulfilled) state = "ready_to_convert";
  else state = "not_ready";

  // Override active iff any linked booking carries the flag. Multi-booking
  // inquiries use the first row for display but consider all for the flag,
  // so the pill is never hidden when any conversion used an override.
  const overrideActive = args.bookings.some((b) => b.created_with_override === true);
  const overrideReason =
    args.bookings.find((b) => b.created_with_override && b.override_reason)
      ?.override_reason ?? null;

  return {
    state,
    bookingCount: args.bookings.length,
    firstBooking: first
      ? {
          id: first.id,
          title: first.title,
          status: first.status,
          startsAt: first.starts_at,
          endsAt: first.ends_at,
        }
      : null,
    override: {
      active: overrideActive,
      reason: overrideReason,
    },
  };
}

/**
 * M4.7 — Recent Activity panel data.
 *
 * Reads the last N `inquiry_events` rows for this inquiry, newest first.
 * Resolves `actor_user_id → profiles.display_name` with a single IN-query so
 * the panel can render names without extra roundtrips. Events with no actor
 * (system-emitted) render without a "by …" line.
 *
 * `hasMore` probes whether more rows exist beyond the limit with a minimal
 * `count=exact` + `head=true` query so the panel can surface the drill-down
 * affordance truthfully.
 */
export async function loadRecentActivityPanelData(
  supabase: SupabaseClient,
  inquiryId: string,
  limit = 5,
): Promise<RecentActivityPanelData> {
  const { data: rawEvents, error } = await supabase
    .from("inquiry_events")
    .select("id, event_type, created_at, actor_user_id, payload")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !rawEvents) return { events: [], hasMore: false };

  const rows = rawEvents as {
    id: string;
    event_type: string;
    created_at: string;
    actor_user_id: string | null;
    payload: Record<string, unknown> | null;
  }[];

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => Boolean(v))),
  );
  const actorNames = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds);
    for (const p of (profiles ?? []) as { id: string; display_name: string | null }[]) {
      actorNames.set(p.id, p.display_name);
    }
  }

  const events: RecentActivityEvent[] = rows.map((r) => ({
    id: r.id,
    type: r.event_type,
    createdAt: r.created_at,
    actorName: r.actor_user_id ? actorNames.get(r.actor_user_id) ?? null : null,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  }));

  // `hasMore` check: one row beyond the limit is all we need. Cheaper than
  // count=exact on large tables.
  let hasMore = false;
  if (events.length === limit) {
    const { data: probe } = await supabase
      .from("inquiry_events")
      .select("id")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false })
      .range(limit, limit);
    hasMore = Boolean(probe && probe.length > 0);
  }

  return { events, hasMore };
}

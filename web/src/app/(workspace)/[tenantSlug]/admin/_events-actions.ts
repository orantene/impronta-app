"use server";

/**
 * Events surface server actions.
 *
 * Pattern mirrors `_pipeline-actions.ts`: resolve staff + tenant scope, read,
 * then shape with the pure modules in `lib/events/`.
 *
 * THE TENANT IS NEVER A PARAMETER. `requireWorkspaceStaffAction` takes no tenant
 * identifier by design — `admin-workspace-scope.security.test.ts` pins that as
 * "structural anti-escalation: no tenant identifier may enter through the
 * signature". A `loadEvents(tenantId)` would typecheck, read naturally, pass
 * review, and let any staff member of any workspace read another workspace's
 * events by changing one argument. The scope comes from the session; RLS on
 * `events` is then the second line rather than the only one.
 *
 * WHAT THIS DELIBERATELY DOES NOT RETURN: sold / held / remaining counts.
 * See `loadWorkspaceEvents` below — that gap is named rather than guessed at.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { saleState, type Tier } from "@/lib/events/tiers";
import { pickTimezone } from "@/lib/spaces/venue-timezone";

export type EventTierRow = {
  id: string;
  poolKey: string;
  label: string;
  amountCents: number;
  admitsPerUnit: number;
  isHidden: boolean;
  seatingMode: string | null;
  onSale: boolean;
  /** `scheduled` | `ended` | `hidden` when not on sale. */
  saleReason: string | null;
  salesFrom: string | null;
  salesUntil: string | null;
  maxPerOrder: number | null;
};

export type EventListRow = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "cancelled";
  admissionKind: string;
  doorsOffsetMinutes: number;
  refundCutoffHours: number | null;
  payoutReleaseRule: string;
  nextSessionAt: string | null;
  /** Scheduled sessions only — a cancelled night is not an upcoming one. */
  sessionCount: number;
  /**
   * TRUE when this event has sessions and every one of them is in the past.
   * `nextSessionAt === null` alone cannot say this: it is also null for an event
   * with no sessions at all, and "3 sessions, next: no date" is one label
   * covering two states — the state it hides being "this run is over", which is
   * the one a staff member actively wants to see.
   */
  runFinished: boolean;
  /**
   * The VENUE'S zone, resolved through the platform ladder (venue, workspace,
   * platform). Every time on this screen is formatted in it and never in the
   * reader's: a Cancún venue opened by an owner in Madrid would otherwise be
   * told the wrong night, worst at a late doors time that crosses midnight in
   * the reader's zone. An instant formatted without a named zone silently
   * becomes the reader's wall clock.
   */
  timeZone: string;
  tiers: EventTierRow[];
};

export type LoadEventsResult =
  | { ok: true; events: EventListRow[] }
  | { ok: false; error: string };

/**
 * Every event for the caller's workspace, with its tiers and their sale state.
 *
 * NO SOLD / HELD / REMAINING NUMBERS, AND THAT IS A DECISION RATHER THAN AN
 * OMISSION. `capacity_pools` stores only `units_total`; availability is derived
 * from overlapping non-expired rows in `capacity_allocations`, and the single
 * authority for that derivation is `capacity_remaining_public(pool, from, to)` —
 * which returns ONE INTEGER for ONE POOL and is deliberately public-safe, so it
 * gives remaining and never the sold/held split a box office needs.
 *
 * Getting those numbers onto this screen therefore means either one RPC per tier
 * per event (N+1 on a list) or aggregating `capacity_allocations` here — and the
 * second is a SECOND IMPLEMENTATION OF THE AVAILABILITY RULE, on a money screen,
 * which is the exact duplication this cluster has spent its whole time removing.
 * The wrong number here is not cosmetic: "212 left" that disagrees with what the
 * public picker refuses is how a venue oversells a room and finds out at a door.
 *
 * So the numbers wait for a batched reader owned by Capacity. `lib/events/summary.ts`
 * already computes every one of them from `TierPoolState`; it needs a source, not
 * a re-implementation.
 */
export async function loadWorkspaceEvents(): Promise<LoadEventsResult> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, tenantId } = guard;

  try {
    const { data: eventRows, error: eventErr } = await supabase
      .from("events")
      .select(
        "id, slug, title, status, admission_kind, doors_offset_minutes, refund_cutoff_hours, payout_release_rule, offering_id, venue_id, created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (eventErr) {
      logServerError("events.loadWorkspaceEvents/events", eventErr);
      return { ok: false, error: "Could not load events." };
    }
    const events = eventRows ?? [];
    if (events.length === 0) return { ok: true, events: [] };

    const eventIds = events.map((e) => e.id as string);
    const offeringIds = [
      ...new Set(
        events.map((e) => e.offering_id as string | null).filter((v): v is string => Boolean(v)),
      ),
    ];

    // ERROR IS DESTRUCTURED AND ACTED ON. PostgREST does not throw: an RLS
    // refusal, a missing column or a dropped table all return
    // `{ data: null, error }`. Ignoring it here would render "No date yet" and
    // "0 sessions" on EVERY event and look like a workspace that has not
    // scheduled anything — the failure indistinguishable from the empty state.
    const { data: sessionRows, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, event_id, starts_at, status")
      .in("event_id", eventIds)
      .order("starts_at", { ascending: true });

    if (sessionErr) {
      logServerError("events.loadWorkspaceEvents/sessions", sessionErr);
      return { ok: false, error: "Could not load event sessions." };
    }

    // Zones for the ladder. One read each, not one per event.
    const venueIdSet = [
      ...new Set(
        events.map((e) => e.venue_id as string | null).filter((v): v is string => Boolean(v)),
      ),
    ];
    const { data: venueRows, error: venueErr } = venueIdSet.length
      ? await supabase.from("venues").select("id, timezone").in("id", venueIdSet)
      : { data: [] as Array<Record<string, unknown>>, error: null };
    if (venueErr) {
      logServerError("events.loadWorkspaceEvents/venues", venueErr);
      return { ok: false, error: "Could not load venue timezones." };
    }
    const venueZone = new Map<string, string | null>(
      (venueRows ?? []).map((v) => [v.id as string, (v.timezone as string | null) ?? null]),
    );

    const { data: agencyRow, error: agencyErr } = await supabase
      .from("agencies")
      .select("timezone")
      .eq("id", tenantId)
      .maybeSingle();
    if (agencyErr) {
      logServerError("events.loadWorkspaceEvents/agency", agencyErr);
      return { ok: false, error: "Could not load the workspace timezone." };
    }
    const workspaceZone = (agencyRow?.timezone as string | null) ?? null;

    // Tiers are catalog variants. `pool_key` is what binds one to its pools, and
    // a variant without one is an ordinary product option rather than a tier.
    // Same rule: a refusal here would silently render every event as having no
    // ticket tiers, which is a sellable event that looks unsellable.
    const { data: variantRows, error: variantErr } = offeringIds.length
      ? await supabase
          .from("talent_offering_variants")
          .select(
            "id, offering_id, label, amount_cents, pool_key, sales_from, sales_until, min_per_order, max_per_order, is_hidden, seating_mode, admits_per_unit, sort_order",
          )
          .in("offering_id", offeringIds)
          .order("sort_order", { ascending: true })
      : { data: [] as Array<Record<string, unknown>>, error: null };

    if (variantErr) {
      logServerError("events.loadWorkspaceEvents/variants", variantErr);
      return { ok: false, error: "Could not load ticket tiers." };
    }

    const nowIso = new Date().toISOString();

    const variantsByOffering = new Map<string, Array<Record<string, unknown>>>();
    for (const v of variantRows ?? []) {
      const oid = v.offering_id as string;
      variantsByOffering.set(oid, [...(variantsByOffering.get(oid) ?? []), v]);
    }

    const out: EventListRow[] = events.map((e) => {
      const id = e.id as string;

      const mySessions = (sessionRows ?? []).filter(
        (s) => s.event_id === id && s.status === "scheduled",
      );
      const upcoming = mySessions.find((s) => (s.starts_at as string) >= nowIso) ?? null;

      // NO SENTINEL KEY. `variantsByOffering.get(offering_id ?? "")` reads
      // harmlessly and is safe only because `offering_id` is a uuid FK, so no
      // variant can ever be filed under "". That is the fallback being fine
      // ONLY because something downstream refuses it — and an event with no
      // offering would otherwise inherit whatever ended up in that bucket.
      // An absent offering has no tiers; it does not have the tiers of the
      // empty string.
      const offeringId = typeof e.offering_id === "string" ? e.offering_id : null;
      const venueId = typeof e.venue_id === "string" ? e.venue_id : null;
      const variants = (offeringId ? (variantsByOffering.get(offeringId) ?? []) : []).filter(
        (v) => typeof v.pool_key === "string" && v.pool_key,
      );

      const tiers: EventTierRow[] = variants.map((v) => {
        const asTier: Tier = {
          id: v.id as string,
          label: v.label as string,
          poolKey: v.pool_key as string,
          amountCents: (v.amount_cents as number | null) ?? 0,
          salesFrom: (v.sales_from as string | null) ?? null,
          salesUntil: (v.sales_until as string | null) ?? null,
          minPerOrder: (v.min_per_order as number | null) ?? 1,
          maxPerOrder: (v.max_per_order as number | null) ?? null,
          isHidden: Boolean(v.is_hidden),
        };
        // `saleState` asks the public question (on sale AND listed). A hidden
        // guest-list tier reads "hidden" here, which is what staff need to see —
        // it is still buyable by link, and `saleWindowState` is that question.
        const state = saleState(asTier, nowIso);
        return {
          id: asTier.id,
          poolKey: asTier.poolKey,
          label: asTier.label,
          amountCents: asTier.amountCents,
          admitsPerUnit: (v.admits_per_unit as number | null) ?? 1,
          isHidden: asTier.isHidden,
          seatingMode: (v.seating_mode as string | null) ?? null,
          onSale: state.onSale,
          saleReason: state.onSale ? null : state.reason,
          salesFrom: asTier.salesFrom ?? null,
          salesUntil: asTier.salesUntil ?? null,
          maxPerOrder: asTier.maxPerOrder ?? null,
        };
      });

      return {
        id,
        slug: e.slug as string,
        title: e.title as string,
        status: e.status as EventListRow["status"],
        admissionKind: (e.admission_kind as string) ?? "ticket",
        doorsOffsetMinutes: (e.doors_offset_minutes as number | null) ?? 0,
        refundCutoffHours: (e.refund_cutoff_hours as number | null) ?? null,
        payoutReleaseRule: (e.payout_release_rule as string) ?? "on_session_end",
        nextSessionAt: (upcoming?.starts_at as string | undefined) ?? null,
        sessionCount: mySessions.length,
        runFinished: mySessions.length > 0 && !upcoming,
        timeZone: pickTimezone({
          // No sentinel key — same rule as the offering lookup above. An event
          // with no venue has NO venue zone; it does not have the zone of the
          // empty string. (I wrote `?? ""` here first, one hour after removing
          // the identical thing twelve lines up. The habit is the hazard.)
          venue: venueId ? (venueZone.get(venueId) ?? null) : null,
          workspace: workspaceZone,
        }).timezone,
        tiers,
      };
    });

    return { ok: true, events: out };
  } catch (err) {
    logServerError("events.loadWorkspaceEvents", err);
    return { ok: false, error: "Could not load events." };
  }
}

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

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { EventStatus } from "@/lib/events/event-policy";
import { addTierRow, createEventWithOffering, setEventStatusRow } from "@/lib/events/writers";
import { explainPoolRefusal, poolKeyFor, saleState, type Tier } from "@/lib/events/tiers";
import { normalizeTierPresentation, tierPresentationSchema, toStoredTierPresentation, type TierPresentation } from "@/lib/events/tier-presentation";
import { readTierPresentations } from "@/lib/events/tier-presentation-read";
import { pickTimezone } from "@/lib/spaces/venue-timezone";
import { buildSessionPoolRows, type SessionPoolPool, type SessionPoolVariant, type SessionPoolRow } from "@/lib/events/session-pools";

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
  /** The tier's own presentation (image, badge, includes, description); empty until set. */
  presentation: TierPresentation;
  /** `presentation.imageMediaId` resolved, for the row thumbnail and the editor. */
  imageUrl: string | null;
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
  /** Scheduled sessions, soonest first — what the Door tab links to. */
  sessions: Array<{ id: string; startsAt: string }>;
  /** Settings the ticket page reads (the Settings tab writes them). */
  venueId: string | null;
  coverMediaId: string | null;
  description: string | null;
  /**
   * The refund switch. FALSE when the three refund columns do not exist yet
   * (they ship in `…243000_events_refund_settings`): read in a separate
   * query so an absent column costs the switch, never the event list.
   */
  refundsOpen: boolean;
  refundPolicyKey: string | null;
  refundsCloseAt: string | null;
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
        "id, slug, title, status, admission_kind, doors_offset_minutes, refund_cutoff_hours, payout_release_rule, offering_id, venue_id, cover_media_id, description, created_at",
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

    // The refund columns, SEPARATELY. They arrive in a migration the code
    // must tolerate being absent for one deploy; naming them in the select
    // above would fail every event over a switch. A failed read here logs
    // and reads every event as closed, which is also the column default.
    const refundByEvent = new Map<string, { open: boolean; policy: string | null; closeAt: string | null }>();
    const { data: refundRows, error: refundErr } = await supabase
      .from("events")
      .select("id, refunds_open, refund_policy_key, refunds_close_at")
      .eq("tenant_id", tenantId)
      .in("id", eventIds);
    if (refundErr) {
      logServerError("events.loadWorkspaceEvents/refundSettings (column absent until …243000 applies?)", refundErr);
    } else {
      for (const r of (refundRows ?? []) as Array<Record<string, unknown>>) {
        refundByEvent.set(r.id as string, {
          open: r.refunds_open === true,
          policy: (r.refund_policy_key as string | null) ?? null,
          closeAt: (r.refunds_close_at as string | null) ?? null,
        });
      }
    }
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
    // Separate, failure-tolerant read: the column may be absent for one deploy.
    const presentations = await readTierPresentations(supabase, (variantRows ?? []).map((v) => v.id as string), "events.loadWorkspaceEvents/presentation");

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
        const pres = presentations.get(asTier.id) ?? null;
        return {
          id: asTier.id,
          presentation: pres ? { imageMediaId: pres.imageMediaId, badge: pres.badge, includes: pres.includes, description: pres.description } : normalizeTierPresentation(null),
          imageUrl: pres?.imageUrl ?? null,
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
        sessions: mySessions.map((s) => ({ id: s.id as string, startsAt: s.starts_at as string })),
        timeZone: pickTimezone({
          // No sentinel key — same rule as the offering lookup above. An event
          // with no venue has NO venue zone; it does not have the zone of the
          // empty string. (I wrote `?? ""` here first, one hour after removing
          // the identical thing twelve lines up. The habit is the hazard.)
          venue: venueId ? (venueZone.get(venueId) ?? null) : null,
          workspace: workspaceZone,
        }).timezone,
        tiers,
        venueId,
        coverMediaId: typeof e.cover_media_id === "string" ? e.cover_media_id : null,
        description: typeof e.description === "string" ? e.description : null,
        refundsOpen: refundByEvent.get(id)?.open ?? false,
        refundPolicyKey: refundByEvent.get(id)?.policy ?? null,
        refundsCloseAt: refundByEvent.get(id)?.closeAt ?? null,
      };
    });

    return { ok: true, events: out };
  } catch (err) {
    logServerError("events.loadWorkspaceEvents", err);
    return { ok: false, error: "Could not load events." };
  }
}

// ── Writers (E3b) ────────────────────────────────────────────────────────────
//
// THE THING THIS PAGE SELLS COULD NOT BE CREATED. Until E3b, `_events-actions`
// exported one read; the public `/events` page read rows nobody could make.
// Three writers, all service-role after the staff guard has fixed the tenant,
// exactly as the door and the Menu offerings do: the guard decides WHO, the
// tenant predicate on every read decides WHOSE, the admin client only carries
// the write.

const CAPABILITY = "manage_agency_settings" as const;

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  venueId: z.string().uuid().nullable().optional(),
  doorsOffsetMinutes: z.number().int().min(0).max(24 * 60).optional(),
  admissionKind: z.enum(["ticket", "pass", "registration", "rsvp"]).optional(),
});

export type CreateEventResult = { ok: true; eventId: string; slug: string } | { ok: false; error: string };

/**
 * A DRAFT event with its own catalog row.
 *
 * WHY AN OFFERING AT ALL: every order line points at a `talent_offerings` row
 * because that row is where the payment policy lives (Reservations' `…381`
 * reasoning). Tiers are its variants. A business workspace owns it directly —
 * `owner_kind = 'workspace'`, `talent_profile_id = null` — the Menu precedent,
 * enforced by `talent_offerings_owner_exclusivity`.
 *
 * `kind = 'package'` — a seat-limited thing, not a fungible product. The
 * instant-book path gates on `kind = 'product'` and that is exactly why: a
 * ticket must never take the instant-book shortcut past capacity. (Verified
 * against the predicate in `lib/orders/capacity-requests.ts` and the E5
 * lesson that the seat-limited course was a `package`.)
 *
 * The slug is derived from the title ONCE (`toEventSlug`); a title edit does
 * not move a published URL. A slug collision inside the tenant is refused by
 * `events_tenant_slug_uniq` and reported as such.
 */
export async function createEvent(input: {
  title: string;
  venueId?: string | null;
  doorsOffsetMinutes?: number;
  admissionKind?: "ticket" | "pass" | "registration" | "rsvp";
}): Promise<CreateEventResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the event a title (up to 200 characters)." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  // The writer is shared with the owner's scripts: one implementation.
  const res = await createEventWithOffering(admin, guard.tenantId, parsed.data);
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  return { ok: true, eventId: res.eventId, slug: res.slug };
}

export type SetEventStatusResult = { ok: true; status: EventStatus } | { ok: false; error: string };

/**
 * Publish, or cancel. Transitions come from `canTransition` (event-policy):
 * draft → published, published → cancelled. There is no un-publish — a public
 * URL that was live does not quietly go back to being a working document;
 * cancel it, which keeps the page resolving with the truth on it.
 *
 * Publishing stamps `published_at`; `events_published_stamp` refuses a
 * published row without one, so the stamp cannot be forgotten.
 */
export async function setEventStatus(input: { eventId: string; to: "published" | "cancelled" }): Promise<SetEventStatusResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = z.object({ eventId: z.string().uuid(), to: z.enum(["published", "cancelled"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an event." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const res = await setEventStatusRow(admin, guard.tenantId, parsed.data.eventId, parsed.data.to);
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export type AddTierResult = { ok: true; tierId: string; poolKey: string } | { ok: false; error: string };

/**
 * A paid tier: one variant on the event's offering, with the `pool_key` that
 * binds it to a pool on every session of the event. Derived from the label
 * ONCE here (`newTierRow`), stored, never recomputed — a rename keeps the pool.
 *
 * The tier has NO units: a tier is not a table. Units per night are given when
 * a session is scheduled (one `session_tier` pool per `pool_key`), which is
 * Sessions' writer. A tier added after a session exists has no pool on that
 * night and is unsellable for it until the session's pools are updated.
 */
export async function addTier(input: {
  eventId: string;
  label: string;
  amountCents: number;
  admitsPerUnit?: number;
  maxPerOrder?: number | null;
  isHidden?: boolean;
}): Promise<AddTierResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const idOk = z.string().uuid().safeParse(input.eventId);
  if (!idOk.success) return { ok: false, error: "That is not an event." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const res = await addTierRow(admin, guard.tenantId, idOk.data, {
    label: String(input.label ?? ""), amountCents: Number(input.amountCents), admitsPerUnit: input.admitsPerUnit, maxPerOrder: input.maxPerOrder ?? null, isHidden: input.isHidden,
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

// ── The tier editor (E3c) ────────────────────────────────────────────────────

const tierPatchSchema = z.object({
  tierId: z.string().uuid(),
  label: z.string().trim().min(1).max(80).optional(),
  amountCents: z.number().int().min(0).optional(),
  admitsPerUnit: z.number().int().min(1).max(1000).optional(),
  maxPerOrder: z.number().int().min(1).nullable().optional(),
  isHidden: z.boolean().optional(),
  /** Whole-object replace: the editor always sends every presentation field. */
  presentation: tierPresentationSchema.optional(),
});

export type UpdateTierInput = z.input<typeof tierPatchSchema>;

/**
 * Edit a tier's label, price, admits, max-per-order, hidden, presentation
 * (image, badge, includes, description) — and NEVER its
 * `pool_key`. The key was derived from the label once at creation; a rename
 * is an UPDATE of `label` only, so the pool and its sold seats stay attached
 * (§6a-iii). The select list below does not contain `pool_key`, on purpose.
 *
 * Tenant scope by derivation: the variant must belong to a WORKSPACE-owned
 * offering of this tenant that an event of this tenant points at.
 */
export async function updateTier(input: UpdateTierInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const { tenantId } = guard;

  const parsed = tierPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those tier values are out of range." };
  const { tierId, ...patch } = parsed.data;
  if (patch.label !== undefined && !poolKeyFor(patch.label)) {
    return { ok: false, error: "That name has no letters or numbers in it." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  try {
    const { data: v, error: vErr } = await admin
      .from("talent_offering_variants").select("id, offering_id").eq("id", tierId).maybeSingle();
    if (vErr) { logServerError("events.updateTier/variant", vErr); return { ok: false, error: "Could not load the tier." }; }
    if (!v) return { ok: false, error: "No such tier." };
    const { data: ev, error: eErr } = await admin
      .from("events").select("id").eq("tenant_id", tenantId).eq("offering_id", v.offering_id as string).limit(1);
    if (eErr) { logServerError("events.updateTier/event", eErr); return { ok: false, error: "Could not load the event." }; }
    if ((ev ?? []).length === 0) return { ok: false, error: "No such tier in this workspace." };

    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.admitsPerUnit !== undefined) row.admits_per_unit = patch.admitsPerUnit;
    if (patch.maxPerOrder !== undefined) row.max_per_order = patch.maxPerOrder;
    if (patch.isHidden !== undefined) row.is_hidden = patch.isHidden;
    if (patch.presentation !== undefined) row.presentation = toStoredTierPresentation(normalizeTierPresentation(patch.presentation));

    const { error: uErr } = await admin.from("talent_offering_variants").update(row).eq("id", tierId);
    if (uErr) { logServerError("events.updateTier/update", uErr); return { ok: false, error: "Could not save the tier." }; }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("events.updateTier", err);
    return { ok: false, error: "Could not save the tier." };
  }
}

export type { SessionPoolRow } from "@/lib/events/session-pools";

/**
 * Seats per tier for ONE night, with what is already sold.
 *
 * "Sold" is `capacity_pool_committed_peak(pool_id)`, read in
 * `lib/events/session-pools.ts` through the SERVICE-ROLE client: the function
 * is EXECUTE for `service_role` only, so the user-scoped client answered 42501
 * on every pool and Event Day showed "—" (D-147). The staff check above and
 * the tenant-scoped pool read are what make the elevated call safe.
 */
/**
 * The comps issued for one night: valid admissions whose order was minted by
 * `admission_comp`. Before this the Day tab printed a hardcoded "None" under
 * "Comps", whatever had been given out.
 */
export async function loadSessionComps(sessionId: string): Promise<{ ok: true; count: number; names: string[] } | { ok: false; error: string }> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, tenantId } = guard;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, error: "That is not a session." };
  try {
    const { data: orders, error: oErr } = await supabase
      .from("orders").select("id").eq("tenant_id", tenantId).eq("session_id", sessionId).eq("source_channel", "admission_comp").limit(500);
    if (oErr) { logServerError("events.sessionComps/orders", oErr); return { ok: false, error: "Could not load comps." }; }
    const orderIds = (orders ?? []).map((o) => o.id as string);
    if (orderIds.length === 0) return { ok: true, count: 0, names: [] };
    const { data: lines, error: lErr } = await supabase
      .from("order_lines").select("id").eq("tenant_id", tenantId).in("order_id", orderIds);
    if (lErr) { logServerError("events.sessionComps/lines", lErr); return { ok: false, error: "Could not load comps." }; }
    const lineIds = (lines ?? []).map((l) => l.id as string);
    if (lineIds.length === 0) return { ok: true, count: 0, names: [] };
    const { data: adms, error: aErr } = await supabase
      .from("admissions").select("holder_name").eq("tenant_id", tenantId).eq("session_id", sessionId).eq("status", "valid").in("order_line_id", lineIds);
    if (aErr) { logServerError("events.sessionComps/admissions", aErr); return { ok: false, error: "Could not load comps." }; }
    const rows = (adms ?? []) as Array<{ holder_name: string | null }>;
    return { ok: true, count: rows.length, names: rows.map((r) => (r.holder_name ?? "").trim()).filter(Boolean).slice(0, 5) };
  } catch (err) {
    logServerError("events.sessionComps", err);
    return { ok: false, error: "Could not load comps." };
  }
}

export async function loadSessionPools(sessionId: string): Promise<{ ok: true; rows: SessionPoolRow[] } | { ok: false; error: string }> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, tenantId } = guard;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, error: "That is not a session." };
  try {
    const { data: session, error: sErr } = await supabase
      .from("sessions").select("id, event_id").eq("id", sessionId).eq("tenant_id", tenantId).maybeSingle();
    if (sErr) { logServerError("events.sessionPools/session", sErr); return { ok: false, error: "Could not load the session." }; }
    if (!session?.event_id) return { ok: true, rows: [] };
    const { data: ev, error: eErr } = await supabase
      .from("events").select("offering_id").eq("id", session.event_id as string).eq("tenant_id", tenantId).maybeSingle();
    if (eErr) { logServerError("events.sessionPools/event", eErr); return { ok: false, error: "Could not load the event." }; }
    if (!ev?.offering_id) return { ok: true, rows: [] };
    const [{ data: variants, error: vErr }, { data: pools, error: pErr }] = await Promise.all([
      supabase.from("talent_offering_variants").select("label, pool_key, sort_order").eq("offering_id", ev.offering_id as string).order("sort_order", { ascending: true }),
      supabase.from("capacity_pools").select("id, pool_key, units_total, overbook_units, is_active").eq("tenant_id", tenantId).eq("subject_kind", "session_tier").eq("subject_id", sessionId),
    ]);
    if (vErr) { logServerError("events.sessionPools/variants", vErr); return { ok: false, error: "Could not load ticket tiers." }; }
    if (pErr) { logServerError("events.sessionPools/pools", pErr); return { ok: false, error: "Could not load capacity." }; }
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Could not load capacity for this night." };
    const rows = await buildSessionPoolRows(
      admin,
      (variants ?? []) as SessionPoolVariant[],
      (pools ?? []) as SessionPoolPool[],
    );
    return { ok: true, rows };
  } catch (err) {
    logServerError("events.sessionPools", err);
    return { ok: false, error: "Could not load capacity for this night." };
  }
}

/**
 * Change the seats (and overbook) for one tier on one night.
 *
 * EDITS ONLY A POOL THAT EXISTS. Creating a night's pools is Sessions'
 * `createSessionWithPools` / `ensureSessionPools` — the one creator (§6a-iii).
 * `upsert_capacity_pool` would happily create on a miss, so this refuses first:
 * a missing pool means "this night has no seats for that tier yet", which is a
 * scheduling fact, not something the editor invents by saving a number.
 *
 * THE REFUSAL IS CAPACITY'S, CALLED, NOT RE-IMPLEMENTED. A shrink below the
 * committed peak comes back as `CP015` with the floor in DETAIL, and that
 * number is the sentence the operator sees. Overbook moves in the same call
 * because the ceiling is `units_total + overbook_units`.
 */
export async function setSessionPoolUnits(input: {
  sessionId: string;
  poolKey: string;
  unitsTotal: number;
  overbookUnits?: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const { tenantId } = guard;

  const parsed = z.object({
    sessionId: z.string().uuid(),
    poolKey: z.string().min(1).max(40),
    unitsTotal: z.number().int().min(0).max(1_000_000),
    overbookUnits: z.number().int().min(0).max(1_000_000).nullable().optional(),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Seats must be a whole number, 0 or more." };
  const { sessionId, poolKey, unitsTotal, overbookUnits } = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  try {
    const { data: pool, error: pErr } = await admin
      .from("capacity_pools").select("id, overbook_units").eq("tenant_id", tenantId)
      .eq("subject_kind", "session_tier").eq("subject_id", sessionId).eq("pool_key", poolKey).maybeSingle();
    if (pErr) { logServerError("events.setPoolUnits/read", pErr); return { ok: false, error: "Could not load capacity." }; }
    if (!pool) return { ok: false, error: "This night has no seats for that tier yet. Schedule it with seats per tier first." };

    const { error } = await admin.rpc("upsert_capacity_pool", {
      p_tenant_id: tenantId,
      p_subject_kind: "session_tier",
      p_subject_id: sessionId,
      p_units_total: unitsTotal,
      p_pool_key: poolKey,
      p_parent_pool_id: null,
      p_overbook_units: overbookUnits === undefined ? null : overbookUnits,
      p_hold_ttl_seconds: null,
      p_unit_label: null,
      p_is_active: null,
    });
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code !== "CP015" && code !== "CP004") logServerError("events.setPoolUnits/rpc", error);
      return { ok: false, error: explainPoolRefusal(error as { code?: string; details?: string; message?: string }, unitsTotal) };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("events.setPoolUnits", err);
    return { ok: false, error: "Could not save the seats for this night." };
  }
}

// ── Settings tab ─────────────────────────────────────────────────────────────
//
// The fields the GUEST TICKET reads and nothing else: cover, doors, venue,
// refunds, description. Each one the ticket page renders or decides on; a
// setting with no reader is a promise the page cannot keep.

export type EventSettingsView = {
  coverUrl: string | null;
  coverMediaId: string | null;
  venues: Array<{ id: string; name: string; city: string | null }>;
};

/** What the Settings tab needs beyond `EventListRow`: the cover's URL and the venue list. */
export async function loadEventSettings(input: { eventId: string }): Promise<{ ok: true; view: EventSettingsView } | { ok: false; error: string }> {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase, tenantId } = guard;
  const parsed = z.object({ eventId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an event." };
  try {
    const { data: ev, error: evErr } = await supabase
      .from("events").select("id, cover_media_id").eq("tenant_id", tenantId).eq("id", parsed.data.eventId).maybeSingle();
    if (evErr) { logServerError("events.loadEventSettings/event", evErr); return { ok: false, error: "Could not load this event." }; }
    if (!ev) return { ok: false, error: "That is not an event." };
    const coverMediaId = (ev.cover_media_id as string | null) ?? null;
    const [{ data: cover, error: coverErr }, { data: venueRows, error: venueErr }] = await Promise.all([
      coverMediaId
        ? supabase.from("media_assets").select("public_url").eq("id", coverMediaId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("venues").select("id, name, city").eq("tenant_id", tenantId).order("is_default", { ascending: false }).order("name", { ascending: true }),
    ]);
    if (coverErr) logServerError("events.loadEventSettings/cover", coverErr);
    if (venueErr) { logServerError("events.loadEventSettings/venues", venueErr); return { ok: false, error: "Could not load venues." }; }
    return {
      ok: true,
      view: {
        coverUrl: (cover?.public_url as string | null) ?? null,
        coverMediaId,
        venues: (venueRows ?? []).map((v) => ({ id: v.id as string, name: v.name as string, city: (v.city as string | null) ?? null })),
      },
    };
  } catch (err) {
    logServerError("events.loadEventSettings", err);
    return { ok: false, error: "Could not load this event." };
  }
}

const settingsSchema = z.object({
  eventId: z.string().uuid(),
  coverMediaId: z.string().uuid().nullable(),
  doorsOffsetMinutes: z.number().int().min(0).max(24 * 60),
  venueId: z.string().uuid().nullable(),
  description: z.string().trim().max(4000).nullable(),
  refundsOpen: z.boolean(),
  refundPolicyKey: z.enum(["tiered", "flexible", "strict", "manual"]).nullable(),
  refundsCloseAt: z.string().datetime({ offset: true }).nullable(),
});

export type SaveEventSettingsInput = z.infer<typeof settingsSchema>;
export type SaveEventSettingsResult = { ok: true } | { ok: false; error: string };

/**
 * One tenant-scoped UPDATE. The refund fields go in a SECOND update so that,
 * for the one deploy before `…243000` applies, the cover / doors / venue /
 * description still save and only the switch reports its column is missing.
 * `refundsOpen` without a policy is refused: an open switch with no promise
 * behind it is a refund button that says nothing.
 */
export async function saveEventSettings(input: SaveEventSettingsInput): Promise<SaveEventSettingsResult> {
  const guard = await requireWorkspaceStaffAction({ capability: CAPABILITY });
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the settings: doors is 0 to 1440 minutes, the close date must be a real date." };
  const s = parsed.data;
  if (s.refundsOpen && !s.refundPolicyKey) return { ok: false, error: "Pick a refund policy before opening refunds." };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  try {
    if (s.venueId) {
      const { data: venue, error: vErr } = await admin.from("venues").select("id").eq("tenant_id", guard.tenantId).eq("id", s.venueId).maybeSingle();
      if (vErr) { logServerError("events.saveEventSettings/venue", vErr); return { ok: false, error: "Could not check the venue." }; }
      if (!venue) return { ok: false, error: "That venue is not in this workspace." };
    }
    if (s.coverMediaId) {
      const { data: media, error: mErr } = await admin.from("media_assets").select("id").eq("tenant_id", guard.tenantId).eq("id", s.coverMediaId).maybeSingle();
      if (mErr) { logServerError("events.saveEventSettings/media", mErr); return { ok: false, error: "Could not check the image." }; }
      if (!media) return { ok: false, error: "That image is not in this workspace's library." };
    }
    const { data: base, error: baseErr } = await admin
      .from("events")
      .update({
        cover_media_id: s.coverMediaId,
        doors_offset_minutes: s.doorsOffsetMinutes,
        venue_id: s.venueId,
        description: s.description && s.description.length > 0 ? s.description : null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", guard.tenantId)
      .eq("id", s.eventId)
      .select("id");
    if (baseErr) { logServerError("events.saveEventSettings/base", baseErr); return { ok: false, error: "Could not save the event settings." }; }
    if (!base || base.length === 0) return { ok: false, error: "That is not an event in this workspace." };

    const { error: refundErr } = await admin
      .from("events")
      .update({
        refunds_open: s.refundsOpen,
        refund_policy_key: s.refundPolicyKey,
        refunds_close_at: s.refundsCloseAt,
      })
      .eq("tenant_id", guard.tenantId)
      .eq("id", s.eventId);
    if (refundErr) {
      logServerError("events.saveEventSettings/refunds (column absent until …243000 applies?)", refundErr);
      revalidatePath("/", "layout");
      return { ok: false, error: "Saved the image, doors, venue and description. The refund switch could not be saved yet: its column is not on this database." };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("events.saveEventSettings", err);
    return { ok: false, error: "Could not save the event settings." };
  }
}

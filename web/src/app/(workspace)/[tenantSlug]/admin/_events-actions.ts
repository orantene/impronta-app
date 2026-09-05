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
import { canTransition, toEventSlug, type EventStatus } from "@/lib/events/event-policy";
import { explainPoolRefusal, newTierRow, poolKeyFor, saleState, type Tier } from "@/lib/events/tiers";
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
  /** Scheduled sessions, soonest first — what the Door tab links to. */
  sessions: Array<{ id: string; startsAt: string }>;
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
  const { tenantId } = guard;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the event a title (up to 200 characters)." };
  const { title, venueId, doorsOffsetMinutes, admissionKind } = parsed.data;

  const slug = toEventSlug(title);
  if (!slug) return { ok: false, error: "That title does not make a usable web address. Add a word or two." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  try {
    if (venueId) {
      const { data: venue, error: vErr } = await admin
        .from("venues").select("id").eq("id", venueId).eq("tenant_id", tenantId).maybeSingle();
      if (vErr) { logServerError("events.create/venue", vErr); return { ok: false, error: "Could not check the venue." }; }
      if (!venue) return { ok: false, error: "That venue is not in this workspace." };
    }

    // Catalog row first, so an event never exists without the row its tiers
    // and its order lines hang on. If the event insert then fails, the
    // offering is removed — a workspace-owned offering with no event is a
    // stray line in the Menu catalog.
    const { data: offering, error: oErr } = await admin
      .from("talent_offerings")
      .insert({
        title,
        kind: "package",
        owner_kind: "workspace",
        talent_profile_id: null,
        tenant_id: tenantId,
      })
      .select("id")
      .single();
    if (oErr || !offering) {
      logServerError("events.create/offering", oErr ?? new Error("no row"));
      return { ok: false, error: "Could not create the event's catalog entry." };
    }

    const { data: ev, error: eErr } = await admin
      .from("events")
      .insert({
        tenant_id: tenantId,
        slug,
        title,
        status: "draft",
        venue_id: venueId ?? null,
        offering_id: offering.id as string,
        doors_offset_minutes: doorsOffsetMinutes ?? 0,
        admission_kind: admissionKind ?? "ticket",
      })
      .select("id, slug")
      .single();
    if (eErr || !ev) {
      const { error: cleanupErr } = await admin.from("talent_offerings").delete().eq("id", offering.id as string).eq("tenant_id", tenantId);
      if (cleanupErr) logServerError("events.create/offeringCleanup", cleanupErr);
      if (eErr?.code === "23505") {
        return { ok: false, error: `An event already uses the address "${slug}". Change the title a little.` };
      }
      logServerError("events.create/event", eErr ?? new Error("no row"));
      return { ok: false, error: "Could not create the event." };
    }

    revalidatePath("/", "layout");
    return { ok: true, eventId: ev.id as string, slug: ev.slug as string };
  } catch (err) {
    logServerError("events.create", err);
    return { ok: false, error: "Could not create the event." };
  }
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
  const { tenantId } = guard;

  const parsed = z.object({ eventId: z.string().uuid(), to: z.enum(["published", "cancelled"]) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not an event." };
  const { eventId, to } = parsed.data;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  try {
    const { data: ev, error: rErr } = await admin
      .from("events").select("id, status").eq("id", eventId).eq("tenant_id", tenantId).maybeSingle();
    if (rErr) { logServerError("events.setStatus/read", rErr); return { ok: false, error: "Could not load the event." }; }
    if (!ev) return { ok: false, error: "No such event in this workspace." };
    const from = ev.status as EventStatus;
    if (from === to) return { ok: true, status: to };
    if (!canTransition(from, to)) {
      return { ok: false, error: to === "published" ? "A cancelled event cannot be published again. Create a new one." : "Only a published event can be cancelled." };
    }

    const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
    if (to === "published") patch.published_at = new Date().toISOString();

    const { error: uErr } = await admin.from("events").update(patch).eq("id", eventId).eq("tenant_id", tenantId).eq("status", from);
    if (uErr) { logServerError("events.setStatus/update", uErr); return { ok: false, error: "Could not update the event." }; }

    revalidatePath("/", "layout");
    return { ok: true, status: to };
  } catch (err) {
    logServerError("events.setStatus", err);
    return { ok: false, error: "Could not update the event." };
  }
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
  const { tenantId } = guard;

  const idOk = z.string().uuid().safeParse(input.eventId);
  if (!idOk.success) return { ok: false, error: "That is not an event." };
  const row = newTierRow({
    label: String(input.label ?? ""),
    amountCents: Number(input.amountCents),
    admitsPerUnit: input.admitsPerUnit,
    maxPerOrder: input.maxPerOrder ?? null,
    isHidden: input.isHidden,
  });
  if (!row.ok) {
    return {
      ok: false,
      error:
        row.reason === "bad_label" ? "Give the tier a name (up to 80 characters)."
        : row.reason === "bad_amount" ? "The price must be a whole number of cents, 0 or more."
        : row.reason === "bad_admits" ? "Admits per ticket must be between 1 and 1000."
        : "Max per order must be at least 1.",
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  try {
    const { data: ev, error: rErr } = await admin
      .from("events").select("id, offering_id").eq("id", idOk.data).eq("tenant_id", tenantId).maybeSingle();
    if (rErr) { logServerError("events.addTier/read", rErr); return { ok: false, error: "Could not load the event." }; }
    if (!ev?.offering_id) return { ok: false, error: "This event has no catalog entry to add a tier to." };

    // Same pool_key twice on one offering would be two tiers sharing one pool.
    const { data: dup, error: dErr } = await admin
      .from("talent_offering_variants").select("id").eq("offering_id", ev.offering_id as string).eq("pool_key", row.poolKey).limit(1);
    if (dErr) { logServerError("events.addTier/dup", dErr); return { ok: false, error: "Could not check existing tiers." }; }
    if ((dup ?? []).length > 0) return { ok: false, error: `A tier named like "${row.label}" already exists on this event.` };

    const { count, error: cErr } = await admin
      .from("talent_offering_variants").select("id", { count: "exact", head: true }).eq("offering_id", ev.offering_id as string);
    if (cErr) logServerError("events.addTier/count", cErr);

    const { data: v, error: iErr } = await admin
      .from("talent_offering_variants")
      .insert({
        offering_id: ev.offering_id as string,
        label: row.label,
        amount_cents: row.amountCents,
        pool_key: row.poolKey,
        admits_per_unit: row.admitsPerUnit,
        max_per_order: row.maxPerOrder,
        is_hidden: row.isHidden,
        sort_order: count ?? 0,
      })
      .select("id")
      .single();
    if (iErr || !v) { logServerError("events.addTier/insert", iErr ?? new Error("no row")); return { ok: false, error: "Could not add the tier." }; }

    revalidatePath("/", "layout");
    return { ok: true, tierId: v.id as string, poolKey: row.poolKey };
  } catch (err) {
    logServerError("events.addTier", err);
    return { ok: false, error: "Could not add the tier." };
  }
}

// ── The tier editor (E3c) ────────────────────────────────────────────────────

const tierPatchSchema = z.object({
  tierId: z.string().uuid(),
  label: z.string().trim().min(1).max(80).optional(),
  amountCents: z.number().int().min(0).optional(),
  admitsPerUnit: z.number().int().min(1).max(1000).optional(),
  maxPerOrder: z.number().int().min(1).nullable().optional(),
  isHidden: z.boolean().optional(),
});

/**
 * Edit a tier's label, price, admits, max-per-order, hidden — and NEVER its
 * `pool_key`. The key was derived from the label once at creation; a rename
 * is an UPDATE of `label` only, so the pool and its sold seats stay attached
 * (§6a-iii). The select list below does not contain `pool_key`, on purpose.
 *
 * Tenant scope by derivation: the variant must belong to a WORKSPACE-owned
 * offering of this tenant that an event of this tenant points at.
 */
export async function updateTier(input: {
  tierId: string;
  label?: string;
  amountCents?: number;
  admitsPerUnit?: number;
  maxPerOrder?: number | null;
  isHidden?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
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

    const { error: uErr } = await admin.from("talent_offering_variants").update(row).eq("id", tierId);
    if (uErr) { logServerError("events.updateTier/update", uErr); return { ok: false, error: "Could not save the tier." }; }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("events.updateTier", err);
    return { ok: false, error: "Could not save the tier." };
  }
}

export type SessionPoolRow = {
  poolKey: string;
  tierLabel: string;
  /** Null when this night has no pool for the tier: unsellable for the night, and said so. */
  poolId: string | null;
  unitsTotal: number | null;
  overbookUnits: number | null;
  isActive: boolean | null;
  /** Capacity's floor: the PEAK of committed units across windows. Null when unreadable. */
  committedPeak: number | null;
};

/**
 * Seats per tier for ONE night, with what is already sold.
 *
 * "Sold" is `capacity_pool_committed_peak(pool_id)` — the same function the
 * shrink refusal checks against — never a sum over allocations. A sum would
 * show 10 sold where the engine accepts 6, and the operator would be told
 * they cannot do what the engine then allows.
 */
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
    const poolByKey = new Map((pools ?? []).map((p) => [p.pool_key as string, p]));
    const rows: SessionPoolRow[] = [];
    for (const v of variants ?? []) {
      if (typeof v.pool_key !== "string" || !v.pool_key) continue;
      const pool = poolByKey.get(v.pool_key) ?? null;
      let peak: number | null = null;
      if (pool) {
        const { data: pk, error: pkErr } = await supabase.rpc("capacity_pool_committed_peak", { p_pool_id: pool.id as string });
        if (pkErr) logServerError("events.sessionPools/peak", pkErr);
        else peak = typeof pk === "number" ? pk : Number(pk);
      }
      rows.push({
        poolKey: v.pool_key,
        tierLabel: v.label as string,
        poolId: pool ? (pool.id as string) : null,
        unitsTotal: pool ? Number(pool.units_total) : null,
        overbookUnits: pool ? Number(pool.overbook_units) : null,
        isActive: pool ? Boolean(pool.is_active) : null,
        committedPeak: peak,
      });
    }
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

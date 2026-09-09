import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { canTransition, toEventSlug, type EventStatus } from "@/lib/events/event-policy";
import { newTierRow, type NewTierInput } from "@/lib/events/tiers";

/**
 * THE EVENT WRITERS — one implementation, two callers.
 *
 * `_events-actions.ts` (the admin screens, behind the staff guard) and any
 * script acting for the owner both call these. Nothing here decides WHO may
 * write: the guard does that for the screens, and a script is the owner's
 * hand. Every function takes the tenant id explicitly and scopes every read
 * and write by it, so the service-role client carries no authority of its own.
 */

export type CreateEventInput = {
  title: string;
  venueId?: string | null;
  doorsOffsetMinutes?: number;
  admissionKind?: "ticket" | "pass" | "registration" | "rsvp";
  description?: string | null;
};

export type CreateEventResult = { ok: true; eventId: string; slug: string; offeringId: string } | { ok: false; error: string };

/** A DRAFT event with its own workspace-owned catalog row (`kind: 'package'`). */
export async function createEventWithOffering(admin: SupabaseClient, tenantId: string, input: CreateEventInput): Promise<CreateEventResult> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 200) return { ok: false, error: "Give the event a title (up to 200 characters)." };
  const slug = toEventSlug(title);
  if (!slug) return { ok: false, error: "That title does not make a usable web address. Add a word or two." };
  try {
    if (input.venueId) {
      const { data: venue, error: vErr } = await admin.from("venues").select("id").eq("id", input.venueId).eq("tenant_id", tenantId).maybeSingle();
      if (vErr) { logServerError("events.writers.create/venue", vErr); return { ok: false, error: "Could not check the venue." }; }
      if (!venue) return { ok: false, error: "That venue is not in this workspace." };
    }
    const { data: offering, error: oErr } = await admin
      .from("talent_offerings")
      .insert({ title, kind: "package", owner_kind: "workspace", talent_profile_id: null, tenant_id: tenantId })
      .select("id").single();
    if (oErr || !offering) { logServerError("events.writers.create/offering", oErr ?? new Error("no row")); return { ok: false, error: "Could not create the event's catalog entry." }; }
    const { data: ev, error: eErr } = await admin
      .from("events")
      .insert({
        tenant_id: tenantId, slug, title, status: "draft", venue_id: input.venueId ?? null, offering_id: offering.id as string,
        doors_offset_minutes: input.doorsOffsetMinutes ?? 0, admission_kind: input.admissionKind ?? "ticket", description: input.description ?? null,
      })
      .select("id, slug").single();
    if (eErr || !ev) {
      const { error: cleanupErr } = await admin.from("talent_offerings").delete().eq("id", offering.id as string).eq("tenant_id", tenantId);
      if (cleanupErr) logServerError("events.writers.create/offeringCleanup", cleanupErr);
      if (eErr?.code === "23505") return { ok: false, error: `An event already uses the address "${slug}". Change the title a little.` };
      logServerError("events.writers.create/event", eErr ?? new Error("no row"));
      return { ok: false, error: "Could not create the event." };
    }
    return { ok: true, eventId: ev.id as string, slug: ev.slug as string, offeringId: offering.id as string };
  } catch (err) {
    logServerError("events.writers.create", err);
    return { ok: false, error: "Could not create the event." };
  }
}

/**
 * What a cancellation actually did, so the surface can say so.
 *
 * Reported rather than swallowed because these numbers are the only evidence
 * the cascade ran. "Cancelled" alone is exactly the message the broken version
 * printed while doing none of this.
 */
export type CancelCascadeCounts = {
  alreadyCancelled: boolean;
  sessionsCancelled: number;
  poolsDeactivated: number;
  admissionsVoided: number;
  refundIntents: number;
};

export type SetEventStatusResult =
  | { ok: true; status: EventStatus; cascade?: CancelCascadeCounts }
  | { ok: false; error: string };

/** draft → published (stamps published_at); draft or published → cancelled. No un-publish. */
export async function setEventStatusRow(admin: SupabaseClient, tenantId: string, eventId: string, to: "published" | "cancelled"): Promise<SetEventStatusResult> {
  try {
    const { data: ev, error: rErr } = await admin.from("events").select("id, status").eq("id", eventId).eq("tenant_id", tenantId).maybeSingle();
    if (rErr) { logServerError("events.writers.setStatus/read", rErr); return { ok: false, error: "Could not load the event." }; }
    if (!ev) return { ok: false, error: "No such event in this workspace." };
    const from = ev.status as EventStatus;
    if (from === to) return { ok: true, status: to };
    if (!canTransition(from, to)) {
      return { ok: false, error: to === "published" ? "A cancelled event cannot be published again. Create a new one." : "Only a published event can be cancelled." };
    }
    if (to === "cancelled") return cancelEventRow(admin, tenantId, eventId);
    const { error: uErr } = await admin.from("events").update({ status: to, updated_at: new Date().toISOString(), published_at: new Date().toISOString() }).eq("id", eventId).eq("tenant_id", tenantId).eq("status", from);
    if (uErr) { logServerError("events.writers.setStatus/update", uErr); return { ok: false, error: "Could not update the event." }; }
    return { ok: true, status: to };
  } catch (err) {
    logServerError("events.writers.setStatus", err);
    return { ok: false, error: "Could not update the event." };
  }
}

/**
 * Cancelling is NOT a status write, and this function exists to make that
 * impossible to forget.
 *
 * Everything downstream of an event reads its OWN status, never the event's:
 * the public listing filters `sessions.status = 'scheduled'`, the purchase path
 * asks `capacity_pools.is_active`, and the door asks `admissions.status`. An
 * `update({ status: 'cancelled' })` on `events` alone therefore changed a badge
 * and nothing else — the show stayed listed, kept selling and kept admitting.
 *
 * All five writes live in `cancel_event_cascade` under one transaction and one
 * row lock, because they are not independent: pools off without sessions
 * cancelled is a listed night nobody can buy into, and admissions voided
 * without refund intents takes entry away while keeping the money.
 */
export async function cancelEventRow(admin: SupabaseClient, tenantId: string, eventId: string): Promise<SetEventStatusResult> {
  const { data, error } = await admin.rpc("cancel_event_cascade", {
    p_tenant_id: tenantId,
    p_event_id: eventId,
    p_actor: null,
  });
  if (error) {
    logServerError("events.writers.cancel/rpc", error);
    return { ok: false, error: "Could not cancel the event." };
  }
  const reply = (data ?? {}) as Record<string, unknown>;
  if (reply.ok !== true) {
    // No partial state to report: the function is all-or-nothing, so a refusal
    // means the event is exactly as it was.
    return { ok: false, error: reply.reason === "unknown_event" ? "No such event in this workspace." : "Could not cancel the event." };
  }
  return {
    ok: true,
    status: "cancelled",
    cascade: {
      alreadyCancelled: reply.alreadyCancelled === true,
      sessionsCancelled: Number(reply.sessionsCancelled ?? 0),
      poolsDeactivated: Number(reply.poolsDeactivated ?? 0),
      admissionsVoided: Number(reply.admissionsVoided ?? 0),
      refundIntents: Number(reply.refundIntents ?? 0),
    },
  };
}

export type AddTierResult = { ok: true; tierId: string; poolKey: string } | { ok: false; error: string };

/** One variant on the event's offering; `pool_key` derived from the label ONCE and never recomputed. */
export async function addTierRow(admin: SupabaseClient, tenantId: string, eventId: string, input: NewTierInput): Promise<AddTierResult> {
  const row = newTierRow(input);
  if (!row.ok) {
    return { ok: false, error: row.reason === "bad_label" ? "Give the tier a name (up to 80 characters)." : row.reason === "bad_amount" ? "The price must be a whole number of cents, 0 or more." : row.reason === "bad_admits" ? "Admits per ticket must be between 1 and 1000." : "Max per order must be at least 1." };
  }
  try {
    const { data: ev, error: rErr } = await admin.from("events").select("id, offering_id").eq("id", eventId).eq("tenant_id", tenantId).maybeSingle();
    if (rErr) { logServerError("events.writers.addTier/read", rErr); return { ok: false, error: "Could not load the event." }; }
    if (!ev?.offering_id) return { ok: false, error: "This event has no catalog entry to add a tier to." };
    const { data: dup, error: dErr } = await admin.from("talent_offering_variants").select("id").eq("offering_id", ev.offering_id as string).eq("pool_key", row.poolKey).limit(1);
    if (dErr) { logServerError("events.writers.addTier/dup", dErr); return { ok: false, error: "Could not check existing tiers." }; }
    if ((dup ?? []).length > 0) return { ok: false, error: `A tier named like "${row.label}" already exists on this event.` };
    const { count, error: cErr } = await admin.from("talent_offering_variants").select("id", { count: "exact", head: true }).eq("offering_id", ev.offering_id as string);
    if (cErr) logServerError("events.writers.addTier/count", cErr);
    const { data: v, error: iErr } = await admin
      .from("talent_offering_variants")
      .insert({ offering_id: ev.offering_id as string, label: row.label, amount_cents: row.amountCents, pool_key: row.poolKey, admits_per_unit: row.admitsPerUnit, max_per_order: row.maxPerOrder, is_hidden: row.isHidden, sort_order: count ?? 0 })
      .select("id").single();
    if (iErr || !v) { logServerError("events.writers.addTier/insert", iErr ?? new Error("no row")); return { ok: false, error: "Could not add the tier." }; }
    return { ok: true, tierId: v.id as string, poolKey: row.poolKey };
  } catch (err) {
    logServerError("events.writers.addTier", err);
    return { ok: false, error: "Could not add the tier." };
  }
}

export type SetOfferingCurrencyResult = { ok: true; currency: string; previous: string | null } | { ok: false; error: string };

/**
 * The catalog currency of an event's offering — the ONE row that says what
 * the tickets settle in. Nothing on the platform converts currency: the
 * commission engine's tests run in MXN, financials aggregate per currency,
 * so pesos settle as pesos and this row is the only thing that must say so
 * (CEO ruling, 2026-09-06). Refused once anything has been sold against the
 * offering: a line already carries the old currency and would misreport.
 */
export async function setOfferingCurrencyRow(admin: SupabaseClient, tenantId: string, offeringId: string, currency: string): Promise<SetOfferingCurrencyResult> {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return { ok: false, error: "Currency must be a three-letter ISO code (USD, MXN, ARS)." };
  try {
    const { data: row, error: rErr } = await admin.from("talent_offerings").select("id, currency").eq("id", offeringId).eq("tenant_id", tenantId).maybeSingle();
    if (rErr) { logServerError("events.writers.currency/read", rErr); return { ok: false, error: "Could not read the offering." }; }
    if (!row) return { ok: false, error: "That offering is not in this workspace." };
    const { count, error: lErr } = await admin.from("order_lines").select("id", { count: "exact", head: true }).eq("offering_id", offeringId);
    if (lErr) { logServerError("events.writers.currency/lines", lErr); return { ok: false, error: "Could not check for sales." }; }
    if ((count ?? 0) > 0) return { ok: false, error: "Tickets have already been sold in the current currency; the currency cannot change now." };
    const { error: uErr } = await admin.from("talent_offerings").update({ currency: code }).eq("id", offeringId).eq("tenant_id", tenantId);
    if (uErr) { logServerError("events.writers.currency/update", uErr); return { ok: false, error: "Could not change the currency." }; }
    return { ok: true, currency: code, previous: (row.currency as string | null) ?? null };
  } catch (err) {
    logServerError("events.writers.currency", err);
    return { ok: false, error: "Could not change the currency." };
  }
}

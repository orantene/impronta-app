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

export type SetEventStatusResult = { ok: true; status: EventStatus } | { ok: false; error: string };

/** draft → published (stamps published_at); published → cancelled. No un-publish. */
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
    const patch: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
    if (to === "published") patch.published_at = new Date().toISOString();
    const { error: uErr } = await admin.from("events").update(patch).eq("id", eventId).eq("tenant_id", tenantId).eq("status", from);
    if (uErr) { logServerError("events.writers.setStatus/update", uErr); return { ok: false, error: "Could not update the event." }; }
    return { ok: true, status: to };
  } catch (err) {
    logServerError("events.writers.setStatus", err);
    return { ok: false, error: "Could not update the event." };
  }
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

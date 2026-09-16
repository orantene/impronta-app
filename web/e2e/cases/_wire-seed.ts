/**
 * Ground truth the wiring specs SEED, so a control is exercised rather than
 * skipped when the fixture happens not to carry the row it needs.
 *
 * Every seeder writes to the isolated qa-journeys tenant only (the service
 * client refuses production) and returns a cleanup that removes what it
 * wrote. Nothing here reads the UI; specs assert the UI, then read these
 * rows back for the engine's answer.
 */
import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

/**
 * Wait until React owns `selector`, reloading ONCE if it never does.
 *
 * A Turbopack dev server's first compile of a route can reference a chunk it
 * has already replaced; the HTML renders, the chunk 404s, and the page never
 * hydrates (incident: "tenant pages die on hydration"). A click on that page
 * is a click on nothing and the spec would fail for a reason that is not the
 * control's. One reload is the whole remedy; a second failure is reported.
 */
export async function ensureHydrated(page: Page, selector: string): Promise<void> {
  const owned = () =>
    page
      .waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          return Boolean(el && Object.keys(el).some((k) => k.startsWith("__react")));
        },
        selector,
        { timeout: 15_000 },
      )
      .then(() => true)
      .catch(() => false);
  await page.locator(selector).first().waitFor({ timeout: 60_000 });
  if (await owned()) return;
  await page.reload();
  await page.locator(selector).first().waitFor({ timeout: 60_000 });
  if (!(await owned())) throw new Error(`${selector} never hydrated, even after one reload`);
}

const T = JOURNEYS_TENANT_ID;

function must<T>(label: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  if (r.data == null) throw new Error(`${label}: no row`);
  return r.data;
}

export const QA_TALENT_A = "33330003-0000-4000-8000-000000000001";
export const QA_TALENT_B = "33330003-0000-4000-8000-000000000002";

/** A confirmed project starting tomorrow with talent A assigned (W48 / W50 fixtures). */
export async function seedProject(input: {
  title: string;
  status: "confirmed" | "completed" | "cancelled";
  talentId?: string | null;
}): Promise<{ bookingId: string; startsAt: string; endsAt: string; cleanup: () => Promise<void> }> {
  const sb = isolatedService();
  const startsAt = new Date(Date.now() + 24 * 3600_000);
  startsAt.setUTCMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 3600_000);
  const booking = must(
    "seedProject/agency_bookings",
    await sb
      .from("agency_bookings")
      .insert({
        tenant_id: T,
        title: input.title,
        status: input.status,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        currency_code: "USD",
        total_client_revenue: 500,
        contact_name: "WIRE seed",
      })
      .select("id")
      .single(),
  ) as { id: string };
  if (input.talentId !== null) {
    must(
      "seedProject/booking_talent",
      await sb
        .from("booking_talent")
        .insert({
          tenant_id: T,
          booking_id: booking.id,
          talent_profile_id: input.talentId ?? QA_TALENT_A,
          talent_name_snapshot: "QA Journeys Talent",
          role_label: "Seed role",
          pricing_unit: "event",
          units: 1,
          talent_cost_rate: 0,
          client_charge_rate: 500,
          talent_cost_total: 0,
          client_charge_total: 500,
          gross_profit: 500,
        })
        .select("id")
        .single(),
    );
  }
  return {
    bookingId: booking.id,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    cleanup: async () => {
      await sb.from("booking_talent").delete().eq("booking_id", booking.id);
      await sb.from("agency_bookings").delete().eq("id", booking.id);
    },
  };
}

/** A confirmed talent booking that overlaps [startsAt, endsAt): the engine's `talent_unavailable`. */
export async function seedTalentConflict(input: {
  talentId: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ id: string; cleanup: () => Promise<void> }> {
  const sb = isolatedService();
  const row = must(
    "seedTalentConflict/talent_bookings",
    await sb
      .from("talent_bookings")
      .insert({
        tenant_id: T,
        talent_profile_id: input.talentId,
        title: "WIRE conflict",
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: "confirmed",
      })
      .select("id")
      .single(),
  ) as { id: string };
  return {
    id: row.id,
    cleanup: async () => {
      await sb.from("talent_bookings").delete().eq("id", row.id);
    },
  };
}

/** The workspace's default location (every layout hangs off one). */
async function defaultLocationId(): Promise<string> {
  const sb = isolatedService();
  const row = must(
    "defaultLocationId",
    await sb.from("venue_locations").select("id").eq("tenant_id", T).eq("is_default", true).limit(1).maybeSingle(),
  ) as { id: string };
  return row.id;
}

/**
 * A seat map for a published event's night: one layout, two seat spaces on
 * it, and the `event_seat_maps` row the public picker reads. Returns the seat
 * ids in the order the picker lists them.
 */
export async function seedSeatMap(input: { sessionId: string }): Promise<{
  layoutId: string;
  seatIds: string[];
  cleanup: () => Promise<void>;
}> {
  const sb = isolatedService();
  const venue = must(
    "seedSeatMap/venue",
    await sb.from("spaces").select("venue_id").eq("tenant_id", T).not("venue_id", "is", null).limit(1).maybeSingle(),
  ) as { venue_id: string };
  const locationId = await defaultLocationId();
  const layout = must(
    "seedSeatMap/space_layouts",
    await sb
      .from("space_layouts")
      .insert({ tenant_id: T, location_id: locationId, name: `WIRE seats ${randomUUID().slice(0, 6)}` })
      .select("id")
      .single(),
  ) as { id: string };
  const tag = randomUUID().slice(0, 4).toUpperCase();
  const seats = must(
    "seedSeatMap/spaces",
    await sb
      .from("spaces")
      .insert([
        { tenant_id: T, venue_id: venue.venue_id, location_id: locationId, kind: "seat", code: `W${tag}1`, name: `Seat ${tag}1`, party_min: 1, party_max: 1 },
        { tenant_id: T, venue_id: venue.venue_id, location_id: locationId, kind: "seat", code: `W${tag}2`, name: `Seat ${tag}2`, party_min: 1, party_max: 1 },
      ])
      .select("id"),
  ) as Array<{ id: string }>;
  const seatIds = seats.map((s) => s.id);
  must(
    "seedSeatMap/space_layout_items",
    await sb
      .from("space_layout_items")
      .insert(seatIds.map((id, i) => ({ layout_id: layout.id, space_id: id, x: 10 + i * 40, y: 10, w: 30, h: 30 })))
      .select("id"),
  );
  must(
    "seedSeatMap/event_seat_maps",
    await sb
      .from("event_seat_maps")
      .insert({ tenant_id: T, session_id: input.sessionId, layout_id: layout.id })
      .select("id")
      .single(),
  );
  return {
    layoutId: layout.id,
    seatIds,
    cleanup: async () => {
      await sb.from("admission_holds").delete().in("seat_space_id", seatIds);
      await sb.from("event_seat_maps").delete().eq("session_id", input.sessionId).eq("layout_id", layout.id);
      await sb.from("space_layout_items").delete().eq("layout_id", layout.id);
      await sb.from("space_layouts").delete().eq("id", layout.id);
      await sb.from("spaces").delete().in("id", seatIds);
    },
  };
}

/**
 * A future night on a published, sellable event: a new `sessions` row two
 * days out, with the same tier pools as the event's existing night so the
 * picker offers it. Returns the event's slug for the public page.
 */
export async function seedEventNight(): Promise<{
  eventId: string;
  slug: string;
  sessionId: string;
  cleanup: () => Promise<void>;
}> {
  const sb = isolatedService();
  const { data: candidates } = await sb
    .from("sessions")
    .select("id, event_id, venue_id")
    .eq("tenant_id", T)
    .not("event_id", "is", null)
    .order("starts_at", { ascending: false })
    .limit(20);
  let picked: { eventId: string; slug: string; fromSessionId: string; venueId: string | null } | null = null;
  for (const s of (candidates ?? []) as Array<{ id: string; event_id: string; venue_id: string | null }>) {
    const { data: ev } = await sb
      .from("events")
      .select("id, slug, status, offering_id")
      .eq("id", s.event_id)
      .eq("status", "published")
      .not("offering_id", "is", null)
      .maybeSingle();
    if (!ev) continue;
    const { data: offering } = await sb.from("talent_offerings").select("status").eq("id", ev.offering_id as string).maybeSingle();
    if ((offering as { status: string } | null)?.status !== "published") continue;
    const { count } = await sb
      .from("capacity_pools")
      .select("id", { count: "exact", head: true })
      .eq("subject_kind", "session_tier")
      .eq("subject_id", s.id)
      .eq("is_active", true);
    if (!count) continue;
    picked = { eventId: ev.id as string, slug: ev.slug as string, fromSessionId: s.id, venueId: s.venue_id };
    break;
  }
  if (!picked) throw new Error("seedEventNight: no published event with a pooled night to clone");
  const startsAt = new Date(Date.now() + 2 * 24 * 3600_000);
  startsAt.setUTCMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 2 * 3600_000);
  const session = must(
    "seedEventNight/sessions",
    await sb
      .from("sessions")
      .insert({
        tenant_id: T,
        event_id: picked.eventId,
        venue_id: picked.venueId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "scheduled",
      })
      .select("id")
      .single(),
  ) as { id: string };
  const pools = must(
    "seedEventNight/pools",
    await sb
      .from("capacity_pools")
      .select("pool_key, units_total, overbook_units, hold_ttl_seconds, unit_label")
      .eq("subject_kind", "session_tier")
      .eq("subject_id", picked.fromSessionId)
      .eq("is_active", true),
  ) as Array<{ pool_key: string; units_total: number; overbook_units: number; hold_ttl_seconds: number; unit_label: string | null }>;
  const inserted = must(
    "seedEventNight/capacity_pools",
    await sb
      .from("capacity_pools")
      .insert(
        pools.map((p) => ({
          tenant_id: T,
          subject_kind: "session_tier",
          subject_id: session.id,
          pool_key: p.pool_key,
          units_total: p.units_total,
          overbook_units: p.overbook_units,
          hold_ttl_seconds: p.hold_ttl_seconds,
          unit_label: p.unit_label,
          is_active: true,
        })),
      )
      .select("id"),
  ) as Array<{ id: string }>;
  return {
    eventId: picked.eventId,
    slug: picked.slug,
    sessionId: session.id,
    cleanup: async () => {
      await sb.from("capacity_pools").delete().in("id", inserted.map((r) => r.id));
      await sb.from("sessions").delete().eq("id", session.id);
    },
  };
}

/** An open table visit (Q01/Q05). `close()` ends it the way the floor does. */
export async function seedVisit(): Promise<{ id: string; token: string; close: () => Promise<void>; cleanup: () => Promise<void> }> {
  const sb = isolatedService();
  const space = must(
    "seedVisit/space",
    await sb.from("spaces").select("id").eq("tenant_id", T).eq("kind", "table").eq("status", "active").limit(1).maybeSingle(),
  ) as { id: string };
  const token = `wire${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const row = must(
    "seedVisit/visits",
    await sb
      .from("visits")
      .insert({ tenant_id: T, space_id: space.id, public_token: token, status: "open", service_kind: "table", party_size: 2 })
      .select("id")
      .single(),
  ) as { id: string };
  return {
    id: row.id,
    token,
    close: async () => {
      const { error } = await sb.from("visits").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw new Error(`seedVisit/close: ${error.message}`);
    },
    cleanup: async () => {
      await sb.from("visits").delete().eq("id", row.id);
    },
  };
}

/**
 * A valid admission on one future session of the fixture Pilates series, and
 * a sibling session whose pool is set to zero seats so it reads `full`.
 * Restores the sibling's seats on cleanup.
 */
export async function seedSeriesMove(): Promise<{
  admissionId: string;
  fromSessionId: string;
  openSessionId: string;
  fullSessionId: string;
  cleanup: () => Promise<void>;
}> {
  const sb = isolatedService();
  const sessions = must(
    "seedSeriesMove/sessions",
    await sb
      .from("sessions")
      .select("id, series_id, starts_at")
      .eq("tenant_id", T)
      .not("series_id", "is", null)
      .eq("status", "scheduled")
      .gt("starts_at", new Date(Date.now() + 36 * 3600_000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(3),
  ) as Array<{ id: string; series_id: string }>;
  if (sessions.length < 3 || new Set(sessions.map((s) => s.series_id)).size !== 1) {
    throw new Error("seedSeriesMove: the fixture series needs three future sessions");
  }
  const [from, open, full] = sessions;
  const pool = must(
    "seedSeriesMove/pool",
    await sb
      .from("capacity_pools")
      .select("id, units_total")
      .eq("tenant_id", T)
      .eq("subject_kind", "session_tier")
      .eq("subject_id", full.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ) as { id: string; units_total: number };
  const admission = must(
    "seedSeriesMove/admission",
    await sb
      .from("admissions")
      .insert({ tenant_id: T, session_id: from.id, status: "valid", party_size: 1, holder_name: "WIRE mover" })
      .select("id")
      .single(),
  ) as { id: string };
  const { error: fullErr } = await sb.from("capacity_pools").update({ units_total: 0 }).eq("id", pool.id);
  if (fullErr) throw new Error(`seedSeriesMove/full: ${fullErr.message}`);
  return {
    admissionId: admission.id,
    fromSessionId: from.id,
    openSessionId: open.id,
    fullSessionId: full.id,
    cleanup: async () => {
      await sb.from("capacity_pools").update({ units_total: pool.units_total }).eq("id", pool.id);
      const { data: adm } = await sb.from("admissions").select("allocation_id").eq("id", admission.id).maybeSingle();
      await sb.from("admissions").delete().eq("id", admission.id);
      const alloc = (adm as { allocation_id: string | null } | null)?.allocation_id;
      if (alloc) await sb.from("capacity_allocations").delete().eq("id", alloc);
    },
  };
}

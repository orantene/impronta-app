"use server";

/**
 * session-picker-actions.ts — the public half of `session_picker`.
 *
 * Two actions: list the sessions a visitor can buy, and buy one.
 *
 * NO ENDPOINT, ON PURPOSE. `surface-allow-list.ts` gates paths per host kind
 * before Next routing, so a new `/api/...` route 404s until it is allow-listed,
 * and that file is at its lint cap and frozen. A server action posts to the
 * page's own URL, so this block adds no new surface at all — the same reasoning
 * the `reserve_table` block records.
 *
 * SELF-FETCHING, LIKE `reserve_table` AND UNLIKE `menu_board`. Availability
 * changes between a page being rendered and a visitor tapping, so seats resolved
 * at build or at server-render are stale the moment they are painted. There is
 * therefore no `native-data-block-needs` entry for this kind, which
 * `native-data-blocks.test.ts:136` documents for the same reason.
 *
 * REMAINING SEATS COME FROM `capacity_remaining_public`, which returns ONE
 * INTEGER and never a row. An anonymous visitor learns how many seats are left
 * and nothing whatever about who holds them.
 */

import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { createPurchase } from "@/lib/orders/purchase";
import { tierReserveRequest } from "@/lib/sessions/tier-pools";
import { DEFAULT_TIER_KEY } from "@/lib/sessions/tier-pools";

const HORIZON_DAYS = 90;

export type PickerSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /**
   * REQUIRED, not nullable, and that is the fix rather than a tidy-up.
   *
   * A session whose zone cannot be resolved is not listed at all (see the
   * ladder below), so no consumer can be handed one. While this was
   * `string | null` the island rendered `Intl.DateTimeFormat` with the timeZone
   * key omitted, which silently falls back to the READER'S zone: a Buenos Aires
   * class at 21:00 Monday shows as Tuesday to somebody in Madrid, looking
   * entirely normal. Making the field non-nullable means that state cannot be
   * constructed, instead of being a rule the next caller has to remember.
   */
  timeZone: string;
  /** null = this session sells no seats of its own. Never rendered as "free". */
  seatsRemaining: number | null;
  soldOut: boolean;
};

export type PickerAvailability =
  | { ok: true; sessions: PickerSession[]; currency: string; amountCents: number | null }
  | { ok: false; reason: "unavailable" | "not_sellable" };

const listSchema = z.object({
  tenantId: z.string().uuid(),
  offeringId: z.string().uuid(),
});

/**
 * The sessions of one offering a visitor may buy.
 *
 * Only `scheduled`, only forward: a cancelled session is history and a past one
 * cannot be attended, and offering either is worse than offering nothing.
 */
export async function loadSessionPicker(input: unknown): Promise<PickerAvailability> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  const { tenantId, offeringId } = parsed.data;

  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    // The offering must be THIS tenant's and published. Both predicates: a
    // published offering of another tenant is still not this page's to sell.
    const { data: offering, error: offeringError } = await admin
      .from("talent_offerings")
      .select("id, tenant_id, status, amount_cents, currency")
      .eq("id", offeringId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (offeringError) {
      logServerError("sessions.picker.offering", offeringError);
      return { ok: false, reason: "unavailable" };
    }
    if (!offering || offering.status !== "published") {
      return { ok: false, reason: "not_sellable" };
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString();

    const { data: rows, error: sessionError } = await admin
      .from("sessions")
      .select("id, title, starts_at, ends_at, venue_id, series_id")
      .eq("tenant_id", tenantId)
      .eq("offering_id", offeringId)
      .eq("status", "scheduled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", horizon)
      .order("starts_at", { ascending: true });
    if (sessionError) {
      logServerError("sessions.picker.sessions", sessionError);
      return { ok: false, reason: "unavailable" };
    }
    const sessionRows = rows ?? [];
    if (sessionRows.length === 0) {
      return {
        ok: true,
        sessions: [],
        currency: String(offering.currency ?? "USD"),
        amountCents: offering.amount_cents == null ? null : Number(offering.amount_cents),
      };
    }

    const ids = sessionRows.map((r) => String(r.id));
    const pools = new Map<string, string>();
    const { data: poolRows, error: poolError } = await admin
      .from("capacity_pools")
      .select("id, subject_id")
      .eq("tenant_id", tenantId)
      .eq("subject_kind", "session_tier")
      .eq("pool_key", DEFAULT_TIER_KEY)
      .in("subject_id", ids);
    if (poolError) {
      logServerError("sessions.picker.pools", poolError);
      return { ok: false, reason: "unavailable" };
    }
    for (const p of poolRows ?? []) pools.set(String(p.subject_id), String(p.id));

    // Zones for rendering the visitor's local reading of the venue's clock.
    const venueIds = [
      ...new Set(sessionRows.map((r) => r.venue_id).filter((v): v is string => typeof v === "string")),
    ];
    const zones = new Map<string, string>();
    if (venueIds.length > 0) {
      const { data: venues, error: venueError } = await admin
        .from("venues")
        .select("id, timezone")
        .in("id", venueIds);
      // A failed zone read is NOT "no zone". Without it every time renders in
      // the READER'S zone, so a visitor in Madrid is shown a Tulum class at the
      // wrong hour and books it believing the wrong hour — a plausible wrong
      // answer, which is the failure this whole area refuses to produce.
      // Better no list than a list of wrong times.
      if (venueError) {
        logServerError("sessions.picker.venues", venueError);
        return { ok: false, reason: "unavailable" };
      }
      for (const v of venues ?? []) zones.set(String(v.id), String(v.timezone));
    }

    const seriesTitles = new Map<string, string>();
    const seriesZones = new Map<string, string>();
    const seriesIds = [
      ...new Set(sessionRows.map((r) => r.series_id).filter((v): v is string => typeof v === "string")),
    ];
    if (seriesIds.length > 0) {
      const { data: series, error: seriesError } = await admin
        .from("session_series")
        .select("id, title, timezone")
        .in("id", seriesIds);
      // Unlike the zones above, a failed title read is COSMETIC: the fallback
      // is the literal word "Session", which is vague rather than wrong. So it
      // is logged and the list still renders — refusing here would take a
      // sellable class off the page to avoid an imprecise heading.
      if (seriesError) logServerError("sessions.picker.seriesTitles", seriesError);
      for (const row of series ?? []) {
        seriesTitles.set(String(row.id), String(row.title));
        // The series zone is the fallback for a session with no venue. A series
        // records the zone its wall clocks were written in, which is exactly
        // the question here.
        if (typeof row.timezone === "string" && row.timezone.trim()) {
          seriesZones.set(String(row.id), row.timezone.trim());
        }
      }
    }

    const sessions: PickerSession[] = [];
    for (const row of sessionRows) {
      const poolId = pools.get(String(row.id)) ?? null;
      let remaining: number | null = null;
      if (poolId) {
        const { data: rem, error: remError } = await admin.rpc("capacity_remaining_public", {
          p_pool_id: poolId,
          p_starts_at: String(row.starts_at),
          p_ends_at: String(row.ends_at),
        });
        if (remError) logServerError("sessions.picker.remaining", remError);
        else if (typeof rem === "number") remaining = rem;
      }
      // THE ZONE LADDER, AND THE REFUSAL AT THE END OF IT.
      //
      // venue zone, then the series' own zone, then nothing. A session with no
      // venue is legitimate and the scheduler permits it, so this is reachable
      // by design rather than only by bad data.
      //
      // When neither answers, the session is DROPPED from the list rather than
      // shown in a zone nobody chose. A class that names the wrong day sends
      // somebody to a locked door, and a wrong time is worse than an absent
      // one: the absent one gets reported, the wrong one gets believed. This is
      // the same rule `buildSessionReminder` already follows by returning null
      // without a zone, applied one layer out.
      const zone =
        (row.venue_id ? zones.get(String(row.venue_id)) : undefined) ??
        (row.series_id ? seriesZones.get(String(row.series_id)) : undefined) ??
        null;
      if (!zone) {
        logServerError("sessions.picker.noZone", {
          sessionId: String(row.id),
          venueId: row.venue_id ?? null,
          seriesId: row.series_id ?? null,
        });
        continue;
      }

      sessions.push({
        id: String(row.id),
        title:
          (typeof row.title === "string" && row.title) ||
          (row.series_id ? seriesTitles.get(String(row.series_id)) ?? "Session" : "Session"),
        startsAt: String(row.starts_at),
        endsAt: String(row.ends_at),
        timeZone: zone,
        seatsRemaining: remaining,
        // A session with NO pool is not "free seats" — it sells nothing yet, and
        // saying otherwise would take money for a seat that does not exist.
        soldOut: poolId != null && remaining != null && remaining <= 0,
      });
    }

    return {
      ok: true,
      sessions,
      currency: String(offering.currency ?? "USD"),
      amountCents: offering.amount_cents == null ? null : Number(offering.amount_cents),
    };
  } catch (error) {
    logServerError("sessions.picker.load", error);
    return { ok: false, reason: "unavailable" };
  }
}

export type BookSeatResult =
  | { ok: true; orderId: string; checkoutTransactionId: string | null }
  | {
      ok: false;
      reason:
        | "invalid_request"
        | "unavailable"
        | "not_sellable"
        | "session_not_found"
        | "no_seats_configured"
        | "sold_out"
        | "engine_error";
    };

const bookSchema = z.object({
  tenantId: z.string().uuid(),
  offeringId: z.string().uuid(),
  sessionId: z.string().uuid(),
  units: z.number().int().min(1).max(20),
  /** Per CART, not per click — a double-tapped button must make ONE order. */
  clientOrderKey: z.string().uuid(),
  email: z.string().email().max(200),
  displayName: z.string().max(120).optional(),
  locale: z.string().max(12).optional(),
});

/**
 * Buy seats at one session.
 *
 * The seat limit is NOT enforced here. `createPurchase` reserves through
 * `reserve_capacity_batch` under the pool's row lock, which is the only place a
 * count can be checked and taken atomically — a check here would be a second,
 * weaker authority, and two visitors racing the last seat would both pass it.
 * **The thirteenth is refused by the pool, and this only reports it.**
 */
export async function bookSessionSeat(input: unknown): Promise<BookSeatResult> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_request" };
  const d = parsed.data;

  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, reason: "unavailable" };

    const { data: session, error: sessionError } = await admin
      .from("sessions")
      .select("id, tenant_id, offering_id, starts_at, ends_at, status")
      .eq("id", d.sessionId)
      .eq("tenant_id", d.tenantId)
      .maybeSingle();
    if (sessionError) {
      logServerError("sessions.picker.book.session", sessionError);
      return { ok: false, reason: "unavailable" };
    }
    // Re-checked server-side rather than trusted from the client: a visitor can
    // edit anything that reaches a server action, and a session id from another
    // offering would otherwise sell a seat at the wrong class.
    if (
      !session ||
      session.status !== "scheduled" ||
      String(session.offering_id ?? "") !== d.offeringId
    ) {
      return { ok: false, reason: "session_not_found" };
    }

    const { data: pool, error: poolError } = await admin
      .from("capacity_pools")
      .select("id")
      .eq("tenant_id", d.tenantId)
      .eq("subject_kind", "session_tier")
      .eq("subject_id", d.sessionId)
      .eq("pool_key", DEFAULT_TIER_KEY)
      .maybeSingle();
    if (poolError) {
      logServerError("sessions.picker.book.pool", poolError);
      return { ok: false, reason: "unavailable" };
    }
    // No pool means this session sells nothing. Refusing is the only honest
    // answer: an unbounded sale here is the oversell this whole phase closed.
    if (!pool) return { ok: false, reason: "no_seats_configured" };

    // Built through tierReserveRequest so the SESSION'S WINDOW cannot be
    // dropped. A timeless allocation looks sufficient while the tier pool is
    // parentless and charges the room for ever the moment it is not.
    const request = tierReserveRequest(
      {
        id: String(session.id),
        startsAt: String(session.starts_at),
        endsAt: String(session.ends_at),
      },
      String(pool.id),
      d.units,
    );
    if (!request) return { ok: false, reason: "engine_error" };

    const result = await createPurchase(admin, {
      tenantId: d.tenantId,
      clientOrderKey: d.clientOrderKey,
      actorUserId: null,
      contact: { email: d.email, displayName: d.displayName ?? null },
      lines: [{ offeringId: d.offeringId, units: d.units }],
      paymentChoice: "full",
      sourceChannel: "session_picker",
      capacity: [
        {
          offeringId: d.offeringId,
          poolId: request.poolId,
          startsAt: request.startsAt,
          endsAt: request.endsAt,
          units: request.units,
        },
      ],
      locale: d.locale ?? null,
    });

    if (!result.ok) {
      if (result.reason === "sold_out") return { ok: false, reason: "sold_out" };
      if (
        result.reason === "offering_not_published" ||
        result.reason === "unknown_offering" ||
        result.reason === "cross_tenant_line"
      ) {
        return { ok: false, reason: "not_sellable" };
      }
      logServerError("sessions.picker.book.purchase", result.reason);
      return { ok: false, reason: "engine_error" };
    }

    return { ok: true, orderId: result.orderId, checkoutTransactionId: result.transactionId };
  } catch (error) {
    logServerError("sessions.picker.book", error);
    return { ok: false, reason: "engine_error" };
  }
}

"use server";

/**
 * reserve-actions.ts — what a guest can be offered, answered on the server.
 *
 * WHY A SERVER ACTION AND NOT AN API ROUTE. `surface-allow-list.ts` gates every
 * path per host kind BEFORE Next routing, so a new `/api/...` endpoint needs an
 * allow-list entry or it 404s while compiling perfectly. That file is at its
 * 800-line lint cap and frozen. A server action posts to the page's own URL and
 * needs no new path, which is also how the public menu board already reaches
 * `submitMenuOrder`. Same pattern, no new surface, nothing to unfreeze.
 *
 * EVERY VALUE THE CLIENT SENDS IS A REQUEST, NEVER AN ASSERTION. The tenant is
 * resolved from the host, the venue from the tenant, and the rules, windows and
 * bands from the database. A party size is the only thing the guest gets an
 * opinion about, and it is checked against the venue's own range.
 *
 * THIS FILE ANSWERS AVAILABILITY ONLY. It holds nothing and charges nothing;
 * the reserve itself is a capacity hold plus an order and lands in R4.
 */

import { z } from "zod";
import { loadDefaultVenue, resolveTenantTimezone } from "@/lib/spaces/venues";
import { loadVenueServiceConfig } from "@/lib/reservations/store";
import {
  availabilityForWindow,
  bandsForParty,
  resolveWindowOnDate,
  seatingTimesFor,
  turnMinutesForParty,
} from "@/lib/reservations";
import type { AvailabilityRefusal } from "@/lib/reservations";
import { capacityRemaining } from "@/lib/capacity/reserve";
import { logServerError } from "@/lib/server/safe-error";

const inputSchema = z.object({
  tenantId: z.string().uuid(),
  partySize: z.number().int().min(1).max(1000),
  /** A local calendar date in the venue's own zone, never an instant. */
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ReserveSlot = {
  windowKey: string;
  startsAtIso: string;
  label: string;
  isLastSeating: boolean;
  /** True when the venue is seating this party at a table bigger than its band. */
  isUpsize: boolean;
};

export type ReserveAvailability =
  | { ok: true; timezone: string; windows: Array<{ key: string; slots: ReserveSlot[] }> }
  | { ok: false; reason: AvailabilityRefusal | "closed" | "unavailable" };

/**
 * The times this party can be offered on this date.
 *
 * Refusals are NAMED and passed through, because "we have no table that size",
 * "we are closed that day" and "too late to book for tonight" are three
 * different sentences on the page and a single empty list cannot say which.
 */
export async function loadReserveAvailability(input: unknown): Promise<ReserveAvailability> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  const { tenantId, partySize, onDate } = parsed.data;

  try {
    const venue = await loadDefaultVenue(tenantId);
    if (!venue) return { ok: false, reason: "reservations_off" };

    const config = await loadVenueServiceConfig(tenantId, venue.id, {
      fromDate: onDate,
      toDate: onDate,
    });
    // A failed read is NOT an open venue. Falling through to "no times" would be
    // indistinguishable from a full house, and a guest would be told the
    // restaurant is booked when we simply could not look.
    if (!config) return { ok: false, reason: "unavailable" };
    if (!config.rules.isActive) return { ok: false, reason: "reservations_off" };

    const tz = await resolveTenantTimezone(tenantId, venue.id);
    const timezone = tz?.timezone ?? venue.timezone;
    const now = new Date();

    const windows: Array<{ key: string; slots: ReserveSlot[] }> = [];
    let lastRefusal: AvailabilityRefusal | null = null;
    let anyWindowOpen = false;

    for (const window of config.windows) {
      const resolved = resolveWindowOnDate({
        window,
        exceptions: config.exceptions,
        onDate,
        timeZone: timezone,
        defaultTurnMinutes: config.rules.defaultTurnMinutes,
      });
      if (!resolved.ok) continue;
      anyWindowOpen = true;

      // `availabilityForWindow` takes a SYNCHRONOUS remaining lookup so it can
      // stay pure and testable, but the real read is an RPC. So the grid is
      // prefetched here and handed over as a map. The candidate list is
      // computed by the same function the decision layer uses, not a second
      // implementation of the seating grid.
      const turnMinutes =
        resolved.window.turnMinutesOverride ??
        turnMinutesForParty(config.rules, partySize);
      const candidates = seatingTimesFor({
        resolved: resolved.window,
        timeZone: timezone,
        turnMinutes,
      });
      const fits = bandsForParty(config.bands, partySize, {
        allowUpsize: config.rules.allowPublicUpsize,
      });

      const key = (poolId: string, s: Date, e: Date) =>
        `${poolId}|${s.toISOString()}|${e.toISOString()}`;
      const cells = new Map<string, number | null>();
      await Promise.all(
        fits.flatMap((fit) =>
          candidates.map(async (c) => {
            const left = await capacityRemaining(fit.band.poolId, {
              startsAt: c.startsAt.toISOString(),
              endsAt: c.endsAt.toISOString(),
            });
            cells.set(key(fit.band.poolId, c.startsAt, c.endsAt), left);
          }),
        ),
      );

      const result = availabilityForWindow({
        resolved: resolved.window,
        timeZone: timezone,
        rules: config.rules,
        bands: config.bands,
        partySize,
        now,
        // The public page never upsizes unless the venue said so. The host
        // stand always may; that call site passes true.
        allowUpsize: config.rules.allowPublicUpsize,
        // A cell we did not prefetch, or one whose read failed, stays null —
        // and the decision layer treats null as unavailable, never as free.
        remaining: (poolId, s, e) => cells.get(key(poolId, s, e)) ?? null,
      });
      if (!result.ok) {
        lastRefusal = result.reason;
        continue;
      }
      windows.push({
        key: resolved.window.key,
        slots: result.times.map((t) => ({
          windowKey: resolved.window.key,
          startsAtIso: t.startsAt.toISOString(),
          label: t.localLabel,
          isLastSeating: t.isLastSeating,
          isUpsize: t.isUpsize,
        })),
      });
    }

    if (!anyWindowOpen) return { ok: false, reason: "closed" };
    if (windows.length === 0) {
      return { ok: false, reason: lastRefusal ?? "fully_booked" };
    }
    return { ok: true, timezone, windows };
  } catch (err) {
    logServerError("reserve-actions.loadReserveAvailability", err);
    return { ok: false, reason: "unavailable" };
  }
}

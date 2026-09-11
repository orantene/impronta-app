import "server-only";

/**
 * Tonight's book as the floor board reads it: `loadHostStand` (the host
 * stand's own reader, decisions in `lib/reservations/book.ts`) narrowed to
 * what the board draws, plus tonight's service window with its label and
 * the three switches the rules carry (walk-ins, the waiting list, whether
 * the venue is bookable at all).
 *
 * A FAILED READ IS AN EMPTY BOOK ONLY ON THIS SCREEN'S TERMS: the floor is
 * still the floor, so the board renders with no bookings rather than not
 * at all, and the failure is logged where the host stand logs its own.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { tenantTimezone } from "@/lib/spaces/venues";

import type { FloorBookEntry } from "@/components/admin/floor/floor-model";
import { loadHostStand } from "./host-stand-data";

export type FloorBook = {
  entries: FloorBookEntry[];
  service: { label: string; startsAtIso: string; endsAtIso: string } | null;
  defaultTurnMinutes: number;
  walkinsEnabled: boolean;
  waitlistEnabled: boolean;
  bookable: boolean;
};

const EMPTY: FloorBook = {
  entries: [],
  service: null,
  defaultTurnMinutes: 90,
  walkinsEnabled: false,
  waitlistEnabled: false,
  bookable: false,
};

/** Today in a zone, as the venue's own calendar date. */
export function todayIn(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

function labelIn(label: unknown, locale: string, fallback: string): string {
  if (label && typeof label === "object") {
    const map = label as Record<string, unknown>;
    const pick = map[locale] ?? map.en ?? Object.values(map)[0];
    if (typeof pick === "string" && pick.length > 0) return pick;
  }
  return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

export async function loadFloorBook(tenantId: string, now: Date, locale = "en"): Promise<FloorBook> {
  const timeZone = await tenantTimezone(tenantId);
  const state = await loadHostStand(tenantId, todayIn(timeZone, now), now);
  if (state.kind !== "ok") return EMPTY;
  const { data } = state;

  // Tonight's service: the window that contains now, else the next one,
  // else the last one that ran. The label is the window's own (a JSON of
  // languages on the row), read here because the resolver keeps only the key.
  const nowMs = now.getTime();
  const current =
    data.windows.find((w) => w.startsAt.getTime() <= nowMs && nowMs < w.endsAt.getTime()) ??
    data.windows.find((w) => w.startsAt.getTime() > nowMs) ??
    data.windows[data.windows.length - 1] ??
    null;
  let service: FloorBook["service"] = null;
  if (current) {
    let label = current.key;
    const sb = createServiceRoleClient();
    if (sb) {
      const read = await sb.from("venue_service_windows").select("label").eq("id", current.windowId).eq("tenant_id", tenantId).maybeSingle();
      if (read.error) logServerError("reservations.floorBook/label", read.error);
      label = labelIn((read.data as { label?: unknown } | null)?.label, locale, current.key);
    }
    service = { label, startsAtIso: current.startsAt.toISOString(), endsAtIso: current.endsAt.toISOString() };
  }

  return {
    entries: data.entries.map((e) => ({
      admissionId: e.admissionId,
      startsAtIso: e.startsAt.toISOString(),
      partySize: e.partySize,
      holderName: e.holderName,
      spaceCode: e.spaceCode,
      state: e.state,
      lateMinutes: e.lateMinutes,
      seatedAtIso: e.seatedAt ? e.seatedAt.toISOString() : null,
    })),
    service,
    defaultTurnMinutes: data.rules.defaultTurnMinutes,
    walkinsEnabled: data.rules.walkinsEnabled,
    waitlistEnabled: data.rules.waitlistEnabled,
    bookable: data.rules.isActive && data.rules.reservationOfferingId !== null,
  };
}

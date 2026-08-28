/**
 * loadBusyIntervals — union calendar occupancy into BusyInterval[] only.
 *
 * SERVICE-ROLE. Never return raw hold / booking / block rows to a public
 * caller. Expired holds are dropped (the gist constraint cannot see
 * expires_at). Cancelled talent_bookings are dropped.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusyInterval } from "./slots";
import { isHoldUnexpired, unexpiredHoldOrFilter } from "./hold-expiry";

export type BusySourceRow = {
  starts_at: string;
  ends_at: string;
};

export type HoldBusyRow = BusySourceRow & {
  expires_at?: string | null;
};

export type BookingBusyRow = BusySourceRow & {
  status?: string | null;
};

function intervalFromRow(row: BusySourceRow): BusyInterval | null {
  const startsAt = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;
  if (endsAt.getTime() <= startsAt.getTime()) return null;
  return { startsAt, endsAt };
}

export function busyFromHold(row: HoldBusyRow, now: Date = new Date()): BusyInterval | null {
  if (!isHoldUnexpired(row.expires_at, now)) return null;
  return intervalFromRow(row);
}

export function busyFromBooking(row: BookingBusyRow): BusyInterval | null {
  if (row.status === "cancelled") return null;
  return intervalFromRow(row);
}

export function busyFromBlock(row: BusySourceRow): BusyInterval | null {
  return intervalFromRow(row);
}

/** Pure merge used by tests and by the IO loader. */
export function collectBusyIntervals(input: {
  holds?: readonly HoldBusyRow[] | null;
  bookings?: readonly BookingBusyRow[] | null;
  blocks?: readonly BusySourceRow[] | null;
  now?: Date;
}): BusyInterval[] {
  const now = input.now ?? new Date();
  const out: BusyInterval[] = [];
  for (const row of input.holds ?? []) {
    const interval = busyFromHold(row, now);
    if (interval) out.push(interval);
  }
  for (const row of input.bookings ?? []) {
    const interval = busyFromBooking(row);
    if (interval) out.push(interval);
  }
  for (const row of input.blocks ?? []) {
    const interval = busyFromBlock(row);
    if (interval) out.push(interval);
  }
  return out;
}

export async function loadBusyIntervals(input: {
  admin: SupabaseClient;
  talentProfileId: string;
  from: Date;
  to: Date;
  now?: Date;
}): Promise<BusyInterval[]> {
  const now = input.now ?? new Date();
  const fromIso = input.from.toISOString();
  const toIso = input.to.toISOString();
  const liveHolds = unexpiredHoldOrFilter(now);

  const [holdsRes, bookingsRes, blocksRes] = await Promise.all([
    input.admin
      .from("talent_holds")
      .select("starts_at, ends_at, expires_at")
      .eq("talent_profile_id", input.talentProfileId)
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso)
      .or(liveHolds),
    input.admin
      .from("talent_bookings")
      .select("starts_at, ends_at, status")
      .eq("talent_profile_id", input.talentProfileId)
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso),
    input.admin
      .from("talent_availability_blocks")
      .select("starts_at, ends_at")
      .eq("talent_profile_id", input.talentProfileId)
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso),
  ]);

  // Fail closed: a failed busy read must not project free slots.
  const loadErr = holdsRes.error ?? bookingsRes.error ?? blocksRes.error;
  if (loadErr) throw loadErr;

  return collectBusyIntervals({
    holds: (holdsRes.data ?? []) as HoldBusyRow[],
    bookings: (bookingsRes.data ?? []) as BookingBusyRow[],
    blocks: (blocksRes.data ?? []) as BusySourceRow[],
    now,
  });
}
